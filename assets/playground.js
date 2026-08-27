/* ===================================================================
   PLAYGROUND — the interactive layer of amit154154.github.io
   -------------------------------------------------------------------
   Vanilla JS, zero dependencies (GSAP/ScrollTrigger used only when
   already present on the page). Every feature lives in its own
   clearly-marked IIFE block and can be deleted independently.
   Shared utilities live in `PG`. Loaded with `defer` on both
   index.html and 404.html; each feature no-ops if its DOM hooks
   are missing.
   ==================================================================*/
'use strict';

/* ===================================================================
   PG CORE — tokens, motion, storage, loops, toasts, achievements
   ==================================================================*/
const PG = (() => {
    const root = document.documentElement;

    /* ---- motion preference (live) ---- */
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const reduced = () => motionQuery.matches;
    const onMotionChange = fn => motionQuery.addEventListener('change', () => fn(motionQuery.matches));

    /* ---- design tokens, re-read whenever the theme class flips ---- */
    let tokenCache = null;
    function colors() {
        if (!tokenCache) {
            const cs = getComputedStyle(root);
            const v = (name, fallback) => (cs.getPropertyValue(name) || fallback).trim() || fallback;
            tokenCache = {
                accent:  v('--accent', '#7c8cff'),
                accent2: v('--accent-2', '#4ad7d6'),
                accent3: v('--accent-3', '#f4b860'),
                txt:     v('--txt', '#e9ecf4'),
                muted:   v('--muted', '#8c93a8'),
                mono:    v('--f-mono', 'monospace'),
                light:   root.classList.contains('light')
            };
        }
        return tokenCache;
    }
    const themeListeners = [];
    new MutationObserver(() => {
        tokenCache = null;
        const c = colors();
        themeListeners.forEach(fn => { try { fn(c); } catch (e) {} });
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
    const onTheme = fn => themeListeners.push(fn);

    /* ---- localStorage helpers (private-mode safe) ---- */
    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem('pg.' + key);
                return raw === null ? fallback : JSON.parse(raw);
            } catch (e) { return fallback; }
        },
        set(key, value) {
            try { localStorage.setItem('pg.' + key, JSON.stringify(value)); } catch (e) {}
        }
    };

    /* ---- analytics (no-op when gtag is absent, e.g. locally) ---- */
    function track(name, params) {
        if (typeof gtag === 'function') {
            gtag('event', name, Object.assign({ event_category: 'playground' }, params || {}));
        }
    }

    /* ---- tiny shared math helpers ---- */
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    function shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    /* ---- rAF loop that pauses off-screen and on hidden tabs ---- */
    function makeLoop(watchEl, tick) {
        let rafId = 0, running = false, visible = false, enabled = true;
        function frame(t) {
            if (!running) return;
            tick(t);
            rafId = requestAnimationFrame(frame);
        }
        function start() {
            if (running || !visible || !enabled || document.hidden) return;
            running = true;
            rafId = requestAnimationFrame(frame);
        }
        function stop() {
            running = false;
            cancelAnimationFrame(rafId);
        }
        const io = new IntersectionObserver(entries => {
            visible = entries.some(en => en.isIntersecting);
            visible ? start() : stop();
        }, { rootMargin: '60px' });
        io.observe(watchEl);
        document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
        return {
            start, stop,
            setEnabled(on) { enabled = on; on ? start() : stop(); },
            isRunning: () => running
        };
    }

    /* ---- toast system ----
       The aria-live container exists from page load: screen readers only
       announce additions to live regions that were already in the tree. */
    const toastWrap = document.createElement('div');
    toastWrap.className = 'pg-toasts';
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastWrap);
    function toast(opts) {
        const el = document.createElement('div');
        el.className = 'pg-toast' + (opts.cls ? ' ' + opts.cls : '');
        el.innerHTML =
            `<span class="pg-toast-icon" aria-hidden="true">${opts.icon || '✨'}</span>` +
            `<span><span class="pg-toast-title">${opts.title}</span>` +
            (opts.sub ? `<span class="pg-toast-sub">${opts.sub}</span>` : '') + '</span>';
        toastWrap.appendChild(el);
        while (toastWrap.children.length > 2) toastWrap.firstChild.remove();
        setTimeout(() => {
            el.classList.add('out');
            setTimeout(() => el.remove(), 350);
        }, opts.ms || 3800);
    }

    /* ---- achievements ---- */
    const ACHIEVEMENTS = {
        heroPulse:   { icon: '⚡', name: 'First Spark',       desc: 'Sampled fresh digits from the hero VAE.',            hint: 'The network in the hero is really training.' },
        heroConverge:{ icon: '✍️', name: 'Convergence',       desc: 'Watched the hero VAE train to convergence on MNIST.', hint: 'Good things come to those who watch the loss.' },
        slmTalk:     { icon: '🗨️', name: 'Small Talk',        desc: 'Chatted with the 230M-parameter resident model.',   hint: 'Someone tiny lives in the Playground. Wake them.' },
        gdConverge:  { icon: '🎯', name: 'Converged!',         desc: 'Guided the optimizer to the global minimum.',       hint: 'Descend all the way, in the Playground cards.' },
        gdDiverge:   { icon: '💥', name: 'Diverged',           desc: 'Sent the loss to NaN. Beautiful.',                  hint: 'What happens at learning rate ≈ 2?' },
        rgDone:      { icon: '🧪', name: 'Turing Tested',      desc: 'Finished a full round of Real or Generated.',       hint: 'Judge twelve paper titles.' },
        rgFooled:    { icon: '🤖', name: 'Fooled by AI',       desc: 'Called a machine-made paper title real.',           hint: 'The generator only needs to fool you once.' },
        rgSharp:     { icon: '🦅', name: 'Sharp Eye',          desc: 'Hit a streak of 8 in Real or Generated.',           hint: 'Eight correct calls in a row.' },
        trumpBot:    { icon: '⚔️', name: 'Executive Order 9000', desc: 'Summoned the sword-bearing RoboTrump.',           hint: 'One Funko combination is… presidential.' },
        terminal:    { icon: '⌨️', name: 'Shell, Yeah',        desc: 'Found the hidden terminal.',                        hint: 'A key shaped like a wave: ~' },
        rootAccess:  { icon: '🔓', name: 'Root Access',        desc: 'sudo make_cooler. It worked.',                      hint: 'Some shell commands need sudo.' },
        konami:      { icon: '🌀', name: 'Overfitted',         desc: 'Memorized the training data. All of it.',           hint: '↑ ↑ ↓ ↓ … you know the rest.' },
        regularized: { icon: '🧊', name: 'Regularized',        desc: 'Applied weight decay and restored generalization.', hint: 'Clean up after an overfit.' },
        attention:   { icon: '👁️', name: 'Attention, Please',  desc: 'Visualized attention over the headline.',           hint: 'Hold your cursor on the big headline.' },
        koala5:      { icon: '🐨', name: 'Koala Whisperer',    desc: 'Clicked the koala five times. It noticed.',         hint: 'The koala likes attention. Persistently.' },
        archaeologist:{ icon: '🕰️', name: 'Archaeologist',      desc: 'Travelled back to the very first version of this site.', hint: 'The site has a history. Rewind all the way.' }
    };
    const ACH_KEYS = Object.keys(ACHIEVEMENTS);

    function unlocked() { return store.get('ach', {}); }
    function hasAward(id) { return !!unlocked()[id]; }
    function award(id) {
        if (!ACHIEVEMENTS[id] || hasAward(id)) return false;
        const map = unlocked();
        map[id] = Date.now();
        store.set('ach', map);
        const a = ACHIEVEMENTS[id];
        toast({ icon: '🏆', title: `Achievement — ${a.name}`, sub: a.desc, cls: 'pg-toast-award' });
        track('achievement_unlocked', { event_label: id });
        updateTrophy();
        document.dispatchEvent(new CustomEvent('pg:achievement', { detail: { id } }));
        return true;
    }

    function updateTrophy() {
        const count = Object.keys(unlocked()).length;
        const badge = document.getElementById('trophyCount');
        const btn = document.getElementById('trophyBtn');
        if (badge) {
            badge.textContent = count;
            badge.classList.toggle('show', count > 0);
        }
        if (btn) btn.setAttribute('aria-label', `Achievements — ${count} of ${ACH_KEYS.length} found`);
    }

    /* ---- achievements hub (modal) ---- */
    let hub = null, hubRestoreFocus = null;
    function buildHub() {
        hub = document.createElement('div');
        hub.className = 'pg-hub';
        hub.setAttribute('role', 'dialog');
        hub.setAttribute('aria-modal', 'true');
        hub.setAttribute('aria-label', 'Achievements');
        hub.innerHTML =
            `<div class="pg-hub-backdrop" data-hub-close></div>
             <div class="pg-hub-panel">
                <div class="pg-hub-head">
                    <img class="pg-hub-koala" src="assets/cursor_192.webp" alt="" width="56" height="56"/>
                    <div>
                        <h3 class="pg-hub-title">Easter-egg hub</h3>
                        <p class="pg-hub-sub" id="pgHubCount"></p>
                    </div>
                    <button class="icon-btn pg-hub-close" data-hub-close aria-label="Close achievements">✕</button>
                </div>
                <ul class="pg-hub-list" id="pgHubList"></ul>
                <div class="pg-hub-foot">
                    <button class="btn-mini" id="pgHubTerminal" type="button">Open the terminal</button>
                    <button class="btn-mini" id="pgHubKoala" type="button" hidden>Bring back the koala</button>
                    <span class="pg-hub-note">progress lives in your browser only</span>
                </div>
             </div>`;
        document.body.appendChild(hub);
        hub.addEventListener('click', e => {
            if (e.target.closest('[data-hub-close]')) closeHub();
        });
        hub.querySelector('#pgHubTerminal').addEventListener('click', () => {
            closeHub();
            document.dispatchEvent(new CustomEvent('pg:open-terminal'));
        });
        hub.querySelector('#pgHubKoala').addEventListener('click', () => {
            store.set('koalaHidden', false);
            closeHub();
            document.dispatchEvent(new CustomEvent('pg:koala-return'));
        });
        document.addEventListener('keydown', e => {
            if (!hub.classList.contains('open')) return;
            if (e.key === 'Escape') { closeHub(); return; }
            // minimal focus trap — the dialog is aria-modal
            if (e.key === 'Tab') {
                const focusables = [...hub.querySelectorAll('button:not([hidden])')];
                if (!focusables.length) return;
                const first = focusables[0], last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        });
    }
    function renderHub() {
        const map = unlocked();
        const list = hub.querySelector('#pgHubList');
        hub.querySelector('#pgHubCount').textContent =
            `${Object.keys(map).length} / ${ACH_KEYS.length} found — keep poking`;
        list.innerHTML = ACH_KEYS.map(id => {
            const a = ACHIEVEMENTS[id];
            const got = !!map[id];
            return `<li class="pg-hub-item ${got ? 'got' : 'locked'}">
                        <span class="pg-hub-icon" aria-hidden="true">${got ? a.icon : '🔒'}</span>
                        <span class="pg-hub-text">
                            <span class="pg-hub-name">${got ? a.name : '???'}</span>
                            <span class="pg-hub-desc">${got ? a.desc : a.hint}</span>
                        </span>
                    </li>`;
        }).join('');
        const koalaBtn = hub.querySelector('#pgHubKoala');
        koalaBtn.hidden = !store.get('koalaHidden', false);
    }
    function openHub() {
        if (!hub) buildHub();
        renderHub();
        hubRestoreFocus = document.activeElement;
        hub.classList.add('open');
        hub.querySelector('.pg-hub-close').focus();
        track('hub_opened');
    }
    function closeHub() {
        if (!hub) return;
        hub.classList.remove('open');
        if (hubRestoreFocus && hubRestoreFocus.focus) hubRestoreFocus.focus();
    }

    /* ---- confetti bursts on a shared transient canvas ---- */
    let burstCanvas = null, burstCtx = null, burstParts = [], burstRaf = 0;
    function burst(x, y, opts) {
        if (reduced()) return;
        const o = opts || {};
        if (!burstCanvas) {
            burstCanvas = document.createElement('canvas');
            burstCanvas.className = 'pg-burst-canvas';
            burstCanvas.setAttribute('aria-hidden', 'true');
            document.body.appendChild(burstCanvas);
            burstCtx = burstCanvas.getContext('2d');
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        burstCanvas.width = innerWidth * dpr;
        burstCanvas.height = innerHeight * dpr;
        burstCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const c = colors();
        const palette = o.colors || [c.accent, c.accent2, c.accent3, c.txt];
        const n = o.count || 50;
        for (let i = 0; i < n; i++) {
            const ang = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * (o.power || 6);
            burstParts.push({
                x, y,
                vx: Math.cos(ang) * speed,
                vy: Math.sin(ang) * speed - 2.5,
                size: 2 + Math.random() * 4,
                rot: Math.random() * Math.PI,
                vr: (Math.random() - .5) * .3,
                color: palette[(Math.random() * palette.length) | 0],
                life: 1
            });
        }
        cancelAnimationFrame(burstRaf);
        (function step() {
            burstCtx.clearRect(0, 0, innerWidth, innerHeight);
            burstParts = burstParts.filter(p => p.life > 0);
            if (!burstParts.length || document.hidden) {
                burstParts = [];
                burstCanvas.remove();
                burstCanvas = null;
                return;
            }
            burstParts.forEach(p => {
                p.x += p.vx; p.y += p.vy;
                p.vy += .18; p.vx *= .985;
                p.rot += p.vr;
                p.life -= .016;
                burstCtx.save();
                burstCtx.translate(p.x, p.y);
                burstCtx.rotate(p.rot);
                burstCtx.globalAlpha = Math.max(0, p.life);
                burstCtx.fillStyle = p.color;
                burstCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * .6);
                burstCtx.restore();
            });
            burstRaf = requestAnimationFrame(step);
        })();
    }

    /* ---- wire the nav trophy ---- */
    document.getElementById('trophyBtn')?.addEventListener('click', openHub);
    updateTrophy();

    return {
        reduced, onMotionChange, colors, onTheme, store, track,
        makeLoop, toast, award, hasAward, openHub, burst, clamp, shuffle,
        achievementCount: () => ACH_KEYS.length
    };
})();

/* ===================================================================
   FEATURE: HERO MNIST LAB
   The hero panel is a real training run: a conditional VAE
   (196 → 64 → z8 → 64 → 196) learns to generate MNIST digits in a
   Web Worker, live, with hand-written backprop (assets/mnist-worker.js).
   Everything drawn here is real: the loss curve, the activations, the
   edge weights, the reconstruction pair, and the ten digits being
   sampled from z ~ N(0,1) at the bottom. Weights persist in
   localStorage, so the network remembers its training between visits.
   ==================================================================*/
(() => {
    const host = document.getElementById('heroNet');
    const canvas = document.getElementById('heroNetCanvas');
    if (!host || !canvas) return;
    const statEl = document.getElementById('heroNetStat');
    const hintEl = document.getElementById('heroNetHint');
    const ctx = canvas.getContext('2d');
    const heroSection = host.closest('.hero') || host;

    const IMG = 14, PIX = 196, ZDIM = 8, NSHOW = 10;
    const SPRITE = 'assets/mnist/mnist14.webp';
    const SPRITE_COLS = 80, SPRITE_N = 4000;
    const STORE_KEY = 'mnist';

    let W = 0, H = 0, dpr = 1;
    let C = PG.colors(), ink = { r: 233, g: 236, b: 244 };
    const pointer = { x: -9e3, y: -9e3 };
    let pulses = [], rings = [];
    let live = false, loop = null;

    /* worker + data state */
    let worker = null, workerReady = false, workerRunning = false, failed = false;
    let snap = null;              // latest worker snapshot
    let vizMax = { enc: 1, lat: 1, dec: 1, wEnc: 1, wE2L: 1, wL2D: 1, wDec: 1 };
    let resumed = false, hinted = false, lastStepSeen = -1, lastEpochSeen = -1;
    let nextAmbientT = 0;

    /* ---- geometry ---- */
    let encNodes = [], latNodes = [], decNodes = [], allNodes = [];
    let imgIn = { x: 0, y: 0, s: 48 }, imgOut = { x: 0, y: 0, s: 48 };
    let tiles = [];               // sample-strip hit rects
    let spark = { x: 14, y: 30, w: 92, h: 20 };

    /* ---- offscreen 14×14 bitmaps ---- */
    function mkBmp() {
        const c = document.createElement('canvas');
        c.width = IMG; c.height = IMG;
        return { c, ctx: c.getContext('2d'), img: null };
    }
    const bmpIn = mkBmp(), bmpOut = mkBmp();
    const bmpSamples = Array.from({ length: 10 }, mkBmp);

    function parseInk() {
        ctx.save();
        ctx.fillStyle = C.txt || '#e9ecf4';
        const s = ctx.fillStyle;                      // normalized to #rrggbb / rgba()
        ctx.restore();
        let m = /^#([0-9a-f]{6})/i.exec(s);
        if (m) {
            const v = parseInt(m[1], 16);
            ink = { r: v >> 16 & 255, g: v >> 8 & 255, b: v & 255 };
        } else if ((m = /rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(s))) {
            ink = { r: +m[1], g: +m[2], b: +m[3] };
        }
    }

    function tint(bmp, pix) {                          // pixels 0..255 → inked ImageData
        const id = bmp.ctx.createImageData(IMG, IMG);
        for (let i = 0; i < PIX; i++) {
            id.data[i * 4] = ink.r;
            id.data[i * 4 + 1] = ink.g;
            id.data[i * 4 + 2] = ink.b;
            id.data[i * 4 + 3] = pix[i];
        }
        bmp.ctx.putImageData(id, 0, 0);
        bmp.img = true;
    }

    function mkNode(x, y) {
        return {
            hx: x, hy: y, dx: 0, dy: 0, a: 0, base: 0,
            phase: Math.random() * Math.PI * 2,
            speed: .0004 + Math.random() * .0005,
            amp: 1.6 + Math.random() * 2
        };
    }

    function build() {
        const stripTile = Math.max(20, Math.min(36, (W - 28 - 9 * 6) / 10));
        const stripH = stripTile + 26;
        const vizTop = 56, vizBot = H - stripH - 18;
        const midY = (vizTop + vizBot) / 2;
        const span = vizBot - vizTop;

        imgIn = { x: W * .10, y: midY, s: Math.max(36, Math.min(56, span * .34)) };
        imgOut = { x: W * .90, y: midY, s: imgIn.s };

        const col = (x, n, squeeze) => {
            const h = span * squeeze;
            return Array.from({ length: n }, (_, i) =>
                mkNode(x + (Math.random() - .5) * 8,
                    midY - h / 2 + h * (n === 1 ? .5 : i / (n - 1)) + (Math.random() - .5) * 6));
        };
        encNodes = col(W * .30, NSHOW, .96);
        latNodes = col(W * .50, ZDIM, .62);
        decNodes = col(W * .70, NSHOW, .96);
        allNodes = [...encNodes, ...latNodes, ...decNodes];

        tiles = [];
        const total = stripTile * 10 + 6 * 9;
        let tx = (W - total) / 2;
        const ty = H - stripH - 4;
        for (let c = 0; c < 10; c++) {
            tiles.push({ x: tx, y: ty, s: stripTile, c });
            tx += stripTile + 6;
        }
        spark = { x: 14, y: 28, w: Math.min(96, W * .2), h: 18 };
    }

    function resize() {
        const r = host.getBoundingClientRect();
        if (!r.width || !r.height) return;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
        build();
        if (!live) drawFrame(performance.now());
    }

    /* ---- localStorage persistence (weights survive between visits) ---- */
    const b64FromBuf = buf => {
        const u8 = new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < u8.length; i += 8192)
            s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
        return btoa(s);
    };
    const bufFromB64 = b64 => {
        const s = atob(b64);
        const u8 = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
        return u8.buffer;
    };

    function loadSaved() {
        const v = PG.store.get(STORE_KEY, null);
        if (!v || v.v !== 2 || typeof v.w !== 'string') return null;
        try {
            const weights = bufFromB64(v.w);
            return { step: v.step | 0, weights, loss: v.loss, hist: v.hist || [] };
        } catch (e) { return null; }
    }

    /* ---- worker snapshot intake ---- */
    function onSnapshot(m) {
        const trained = snap && m.step > snap.step;
        snap = m;
        const mx = arr => { let v = 1e-6; for (let i = 0; i < arr.length; i++) { const a = Math.abs(arr[i]); if (a > v) v = a; } return v; };
        vizMax = {
            enc: mx(m.viz.encA), lat: mx(m.viz.latA), dec: mx(m.viz.decA),
            wEnc: mx(m.viz.wEnc), wE2L: mx(m.viz.wE2L), wL2D: mx(m.viz.wL2D), wDec: mx(m.viz.wDec)
        };
        tint(bmpIn, m.recon.x);
        tint(bmpOut, m.recon.p);
        for (let c = 0; c < 10; c++) tint(bmpSamples[c], m.samples.subarray(c * PIX, (c + 1) * PIX));

        encNodes.forEach((n, k) => { n.base = Math.min(1, Math.abs(m.viz.encA[k]) / vizMax.enc); });
        latNodes.forEach((n, j) => { n.base = Math.min(1, Math.abs(m.viz.latA[j]) / vizMax.lat); });
        decNodes.forEach((n, k) => { n.base = Math.min(1, Math.abs(m.viz.decA[k]) / vizMax.dec); });

        if (statEl) {
            statEl.textContent =
                `epoch ${String(m.epoch).padStart(3, '0')} · loss ${m.loss.toFixed(4)}` +
                (!m.done && m.beta < 1 ? ` · β ${m.beta.toFixed(2)}` : '') +
                (m.done ? ' · converged' : (PG.reduced() ? ' · paused' : ''));
        }
        if (hintEl && !hinted) {
            hintEl.textContent = m.done
                ? 'converged — click a digit to resample its z'
                : PG.reduced() ? 'paused — Enter runs 40 real steps'
                    : (resumed ? 'resumed training from your last visit'
                        : 'live — a VAE is training in your browser');
        }
        // training heartbeat: pulses ride actual optimizer steps
        if (trained && !m.done && live && m.step !== lastStepSeen) {
            lastStepSeen = m.step;
            spawnPulse(true);
            if (Math.random() < .4) spawnPulse(true);
        }
        // one ripple from the bottleneck per finished epoch
        if (m.epoch > lastEpochSeen) {
            if (lastEpochSeen >= 0 && live && latNodes.length) {
                const midY = (latNodes[0].hy + latNodes[latNodes.length - 1].hy) / 2;
                rings.push({ x: W * .5, y: midY, t0: performance.now() });
            }
            lastEpochSeen = m.epoch;
        }
        if (!live) drawFrame(performance.now());
    }

    function startWorker(pixels, saved) {
        worker = new Worker('assets/mnist-worker.js');
        worker.onerror = () => { failed = true; setOffline(); };
        worker.onmessage = e => {
            const m = e.data;
            if (m.type === 'ready') {
                workerReady = true;
                resumed = !!saved && m.step > 0;
                if (m.done) PG.award('heroConverge');
                syncRunState();
            } else if (m.type === 'snapshot') {
                if (m.done && snap && !snap.done) PG.award('heroConverge');
                onSnapshot(m);
            } else if (m.type === 'weights') {
                PG.store.set(STORE_KEY, {
                    v: 2, step: m.step,
                    loss: snap ? +snap.loss.toFixed(4) : undefined,
                    hist: snap ? Array.from(snap.hist, v => +v.toFixed(4)) : [],
                    w: b64FromBuf(m.buf)
                });
            }
        };
        const transfers = [pixels.buffer];
        if (saved) transfers.push(saved.weights);
        worker.postMessage({ type: 'init', pixels, saved }, transfers);
    }

    function loadData() {
        const im = new Image();
        im.onload = () => {
            try {
                const c = document.createElement('canvas');
                c.width = im.width; c.height = im.height;
                const cx = c.getContext('2d', { willReadFrequently: true });
                cx.drawImage(im, 0, 0);
                const d = cx.getImageData(0, 0, im.width, im.height).data;
                const pixels = new Float32Array(SPRITE_N * PIX);
                for (let t = 0; t < SPRITE_N; t++) {
                    const row = (t / SPRITE_COLS) | 0, colI = t % SPRITE_COLS;
                    for (let y = 0; y < IMG; y++) {
                        const sy = (row * IMG + y) * im.width;
                        for (let x = 0; x < IMG; x++)
                            pixels[t * PIX + y * IMG + x] = d[(sy + colI * IMG + x) * 4] / 255;
                    }
                }
                startWorker(pixels, loadSaved());
            } catch (e) { failed = true; setOffline(); }
        };
        im.onerror = () => { failed = true; setOffline(); };
        im.src = SPRITE;
    }

    function setOffline() {
        if (statEl) statEl.textContent = 'mnist unavailable · decorative mode';
        if (hintEl) hintEl.textContent = 'the pixels stayed home';
    }

    /* ---- visibility drives the worker: train only when watched ---- */
    let panelVisible = false, externallyPaused = false;
    function syncRunState() {
        if (!worker || !workerReady) return;
        const should = panelVisible && !document.hidden && !PG.reduced() && !externallyPaused;
        if (should && !workerRunning) { workerRunning = true; worker.postMessage({ type: 'run' }); }
        else if (!should && workerRunning) { workerRunning = false; worker.postMessage({ type: 'pause' }); }
    }
    new IntersectionObserver(en => {
        panelVisible = en.some(x => x.isIntersecting);
        syncRunState();
    }, { rootMargin: '60px' }).observe(host);
    document.addEventListener('visibilitychange', syncRunState);
    // the time machine covers the hero with a full-screen overlay; no reason
    // to keep a second VAE training behind it
    document.addEventListener('pg:pause-hero', e => {
        externallyPaused = !!(e.detail && e.detail.paused);
        syncRunState();
        if (loop) loop.setEnabled(!externallyPaused && !PG.reduced());
    });

    /* ---- pulses: training = x→x̂ full pass; sampling = z→x̂ only ---- */
    function pick(weights, max) {
        // weight-biased random index
        for (let tries = 0; tries < 8; tries++) {
            const i = (Math.random() * weights.length) | 0;
            if (Math.random() < Math.abs(weights[i]) / max) return i;
        }
        return (Math.random() * weights.length) | 0;
    }
    function spawnPulse(full) {
        if (!snap) return;
        const j = pick(snap.viz.latA, vizMax.lat);
        const kd = pick(snap.viz.wL2D.subarray(j * NSHOW, (j + 1) * NSHOW), vizMax.wL2D);
        const lat = latNodes[j], dec = decNodes[kd];
        const pts = [];
        if (full) {
            const ke = pick(snap.viz.encA, vizMax.enc);
            pts.push({ x: imgIn.x + imgIn.s / 2 + 2, y: imgIn.y },
                { n: encNodes[ke] });
        }
        pts.push({ n: lat }, { n: dec }, { x: imgOut.x - imgOut.s / 2 - 2, y: imgOut.y });
        pulses.push({ pts, t0: performance.now(), dur: 190 * (pts.length - 1), gain: .5 + Math.random() * .5 });
        if (pulses.length > 26) pulses.splice(0, pulses.length - 26);
    }

    /* ---- drawing ---- */
    function px(p) { return p.n ? { x: p.n.px, y: p.n.py } : p; }

    function drawEdgeGroup(fromPts, toPts, wArr, wMax, stride) {
        const base = C.light ? .13 : .06;
        for (let a = 0; a < fromPts.length; a++) {
            for (let b = 0; b < toPts.length; b++) {
                const w = Math.abs(wArr[a * stride + b]) / wMax;
                if (w < .07) continue;
                const A = fromPts[a], B = toPts[b];
                const heat = (A.a || 0) * (B.a || 0);
                ctx.globalAlpha = Math.min(.85, base + w * .34 + heat * .5);
                ctx.strokeStyle = heat > .3 ? C.accent2 : C.accent;
                ctx.beginPath();
                ctx.moveTo(A.px ?? A.x, A.py ?? A.y);
                ctx.lineTo(B.px ?? B.x, B.py ?? B.y);
                ctx.stroke();
            }
        }
    }

    function drawBitmap(bmp, cx, cy, s, faded) {
        if (!bmp.img) return;
        ctx.globalAlpha = faded ? .5 : .92;
        ctx.drawImage(bmp.c, cx - s / 2, cy - s / 2, s, s);
    }

    function label(txt, x, y, align) {
        ctx.globalAlpha = .55;
        ctx.fillStyle = C.muted;
        ctx.font = `500 9px ${C.mono || 'monospace'}`;
        ctx.textAlign = align || 'center';
        ctx.fillText(txt, x, y);
        ctx.textAlign = 'start';
    }

    function drawFrame(t) {
        ctx.clearRect(0, 0, W, H);
        allNodes.forEach(n => {
            n.px = n.hx + Math.cos(t * n.speed + n.phase) * n.amp + n.dx;
            n.py = n.hy + Math.sin(t * n.speed * 1.3 + n.phase) * n.amp + n.dy;
        });

        ctx.lineWidth = 1;
        if (snap) {
            // input → encoder (fan from the input bitmap)
            const inAnchor = [{ x: imgIn.x + imgIn.s / 2 + 2, y: imgIn.y, a: .3 }];
            drawEdgeGroup(inAnchor, encNodes, snap.viz.wEnc, vizMax.wEnc, 1);
            drawEdgeGroup(encNodes, latNodes, snap.viz.wE2L, vizMax.wE2L, ZDIM);
            // latent → decoder (stored [j*NSHOW + k])
            const outAnchor = [{ x: imgOut.x - imgOut.s / 2 - 2, y: imgOut.y, a: .3 }];
            drawEdgeGroup(latNodes, decNodes, snap.viz.wL2D, vizMax.wL2D, NSHOW);
            drawEdgeGroup(decNodes, outAnchor, snap.viz.wDec, vizMax.wDec, 1);
        } else {
            // no data yet: faint scaffold
            ctx.globalAlpha = C.light ? .12 : .06;
            ctx.strokeStyle = C.accent;
            encNodes.forEach(a => latNodes.forEach(b => {
                ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
            }));
            latNodes.forEach(a => decNodes.forEach(b => {
                ctx.beginPath(); ctx.moveTo(a.px, a.py); ctx.lineTo(b.px, b.py); ctx.stroke();
            }));
        }

        // traveling pulses along real weight paths
        const now = t;
        pulses = pulses.filter(p => {
            const k = (now - p.t0) / p.dur;
            if (k >= 1) return false;
            const segs = p.pts.length - 1;
            const f = k * segs, si = Math.min(segs - 1, f | 0), sk = f - si;
            const A = px(p.pts[si]), B = px(p.pts[si + 1]);
            const x = A.x + (B.x - A.x) * sk, y = A.y + (B.y - A.y) * sk;
            if (p.pts[si + 1].n) p.pts[si + 1].n.a = Math.max(p.pts[si + 1].n.a, sk * p.gain * .7);
            ctx.globalAlpha = .9 * p.gain;
            ctx.fillStyle = C.accent2;
            ctx.beginPath();
            ctx.arc(x, y, 2.4, 0, Math.PI * 2);
            ctx.fill();
            return true;
        });

        // nodes (latent column slightly larger — that's the bottleneck)
        const drawCol = (col, rBase) => col.forEach(n => {
            const act = Math.max(n.base * .85, n.a);
            const r = rBase + act * 3;
            ctx.globalAlpha = (C.light ? .5 : .45) + act * .5;
            ctx.fillStyle = act > .5 ? C.accent2 : C.accent;
            ctx.beginPath();
            ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
            ctx.fill();
            if (act > .55) {
                ctx.globalAlpha = act * .22;
                ctx.beginPath();
                ctx.arc(n.px, n.py, r * 2.3, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        drawCol(encNodes, 2.5);
        drawCol(latNodes, 3.3);
        drawCol(decNodes, 2.5);

        // bitmaps: training pair + generated strip
        if (snap) {
            drawBitmap(bmpIn, imgIn.x, imgIn.y, imgIn.s);
            drawBitmap(bmpOut, imgOut.x, imgOut.y, imgOut.s);
            label('input', imgIn.x, imgIn.y + imgIn.s / 2 + 12);
            label('recon', imgOut.x, imgOut.y + imgOut.s / 2 + 12);
            label('z', W * .50, latNodes[ZDIM - 1].hy + 18);

            tiles.forEach(tl => {
                ctx.globalAlpha = C.light ? .5 : .35;
                ctx.fillStyle = C.light ? 'rgba(20,30,60,.06)' : 'rgba(255,255,255,.045)';
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(tl.x, tl.y, tl.s, tl.s, 5);
                else ctx.rect(tl.x, tl.y, tl.s, tl.s);
                ctx.fill();
                drawBitmap(bmpSamples[tl.c], tl.x + tl.s / 2, tl.y + tl.s / 2, tl.s - 4);
                label(String(tl.c), tl.x + tl.s / 2, tl.y + tl.s + 11);
            });
            label('sampling z ~ N(0,1) — generated live', tiles[0].x, tiles[0].y - 6, 'left');

            // real loss sparkline (skipped on narrow panels — the HUD wraps there)
            const h = snap.hist;
            if (h.length > 1 && W >= 460) {
                let mn = Infinity, mx = -Infinity;
                for (let i = 0; i < h.length; i++) { if (h[i] < mn) mn = h[i]; if (h[i] > mx) mx = h[i]; }
                const rng = Math.max(1e-4, mx - mn);
                ctx.globalAlpha = .8;
                ctx.strokeStyle = C.accent2;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                for (let i = 0; i < h.length; i++) {
                    const x = spark.x + spark.w * i / (h.length - 1);
                    const y = spark.y + spark.h * (1 - (h[i] - mn) / rng);
                    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
                }
                ctx.stroke();
                ctx.lineWidth = 1;
                label('loss', spark.x + spark.w + 6, spark.y + spark.h, 'left');
            }
        }

        // click ripples
        rings = rings.filter(rg => {
            const k = (now - rg.t0) / 600;
            if (k >= 1) return false;
            ctx.globalAlpha = (1 - k) * .5;
            ctx.strokeStyle = C.accent2;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(rg.x, rg.y, 6 + k * 46, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1;
            return true;
        });
        ctx.globalAlpha = 1;
    }

    function tick(t) {
        allNodes.forEach(n => {
            const pxx = n.hx + n.dx, pyy = n.hy + n.dy;
            const ddx = pointer.x - pxx, ddy = pointer.y - pyy;
            const d = Math.hypot(ddx, ddy);
            let tx = 0, ty = 0;
            if (d < 130 && d > 0.001) {
                const f = (1 - d / 130) ** 2 * 20;
                tx = ddx / d * f;
                ty = ddy / d * f;
                n.a = Math.max(n.a, (1 - d / 130) * .9);
            }
            n.dx += (tx - n.dx) * .085;
            n.dy += (ty - n.dy) * .085;
            n.a *= .95;
        });

        // ambient: once converged (or offline), the panel keeps living
        if (t >= nextAmbientT) {
            nextAmbientT = t + 4200 + Math.random() * 1600;
            if (snap && snap.done && worker) {
                worker.postMessage({ type: 'sample', digit: (Math.random() * 10) | 0 });
                spawnPulse(false);
            } else if (failed) {
                allNodes[(Math.random() * allNodes.length) | 0].a = 1;
            }
        }
        drawFrame(t);
    }

    /* ---- interaction ---- */
    function pointerToLocal(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function resample(digit, x, y) {
        if (!worker || !workerReady) return;
        rings.push({ x, y, t0: performance.now() });
        worker.postMessage({ type: 'sample', digit });
        if (!PG.reduced()) {
            spawnPulse(false);
            if (digit < 0) { spawnPulse(false); spawnPulse(false); }
        }
        if (!hinted && hintEl) { hintEl.style.opacity = '0'; hinted = true; }
        PG.award('heroPulse');
        PG.track('hero_mnist_sample', { digit });
        if (PG.reduced()) worker.postMessage({ type: 'burst', steps: 40 });
    }

    function startLive() {
        if (live) return;
        live = true;
        nextAmbientT = performance.now() + 4000;
        loop = PG.makeLoop(host, tick);
        loop.start();
    }

    heroSection.addEventListener('pointermove', e => {
        const p = pointerToLocal(e);
        pointer.x = p.x; pointer.y = p.y;
    }, { passive: true });
    heroSection.addEventListener('pointerleave', () => {
        pointer.x = -9e3; pointer.y = -9e3;
    });
    canvas.addEventListener('pointerdown', e => {
        const p = pointerToLocal(e);
        const tl = tiles.find(q => p.x >= q.x - 3 && p.x <= q.x + q.s + 3 &&
            p.y >= q.y - 3 && p.y <= q.y + q.s + 14);
        resample(tl ? tl.c : -1, p.x, p.y);
    });
    host.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            resample(-1, W / 2, H / 2);
        }
    });

    function staticFrame() {
        allNodes.forEach(n => { n.a = 0; n.dx = 0; n.dy = 0; });
        drawFrame(0);
    }

    PG.onTheme(c => {
        C = c;
        parseInk();
        if (snap) onSnapshot(snap);          // re-tint the bitmaps
        if (PG.reduced() || !live) staticFrame();
    });

    new ResizeObserver(() => resize()).observe(host);
    parseInk();
    resize();
    if (statEl) statEl.textContent = 'epoch — · loss —';
    if (hintEl) hintEl.textContent = 'loading 4,000 real MNIST digits…';
    // hold the sprite fetch until the page has painted — the scaffold is
    // already on screen, so this buys first paint without costing the show
    const kick = () => (window.requestIdleCallback
        ? requestIdleCallback(loadData, { timeout: 1200 })
        : setTimeout(loadData, 200));
    if (document.readyState === 'complete') kick();
    else window.addEventListener('load', kick, { once: true });

    // reduced motion: no auto-training, no loop — Enter runs real 40-step
    // bursts and each worker snapshot triggers a single static redraw
    if (!PG.reduced()) startLive();

    PG.onMotionChange(reducedNow => {
        syncRunState();
        if (reducedNow) {
            if (loop) loop.setEnabled(false);
            staticFrame();
        } else if (live) {
            loop.setEnabled(true);
        } else {
            startLive();
        }
    });

    window.addEventListener('pagehide', () => {
        if (worker && workerReady) worker.postMessage({ type: 'pause' });
    });
})();
/* ===================================================================
   FEATURE: DESCENT — a playable gradient-descent simulator
   You are the optimizer: SGD + momentum on a 1-D loss landscape with
   local-minima traps. Score = epochs to reach the global minimum.
   Inits on any [data-descent-root] (projects card here, 404 page too).
   ==================================================================*/
(() => {
    const clamp = PG.clamp, shuffle = PG.shuffle;

    function makeLandscape() {
        const N = 480;
        const slots = shuffle([.12, .32, .52, .72, .9]).slice(0, 3)
            .map(c => clamp(c + (Math.random() - .5) * .06, .07, .94))
            .sort((a, b) => a - b);
        const gi = (Math.random() * 3) | 0;
        const dips = slots.map((c, i) => ({
            c,
            depth: i === gi ? .62 + Math.random() * .15 : .24 + Math.random() * .18,
            v: .0018 + Math.random() * .0042   // gaussian variance
        }));
        const bowlC = .5 + (Math.random() - .5) * .2;
        const raw = [];
        for (let i = 0; i <= N; i++) {
            const x = i / N;
            let y = 1.15 * (x - bowlC) ** 2 + .25;
            dips.forEach(d => { y -= d.depth * Math.exp(-((x - d.c) ** 2) / (2 * d.v)); });
            raw.push(y);
        }
        const mn = Math.min(...raw), mx = Math.max(...raw);
        const ys = raw.map(y => .06 + .86 * (y - mn) / (mx - mn));
        let gIdx = 0;
        ys.forEach((y, i) => { if (y < ys[gIdx]) gIdx = i; });
        return { N, ys, xg: gIdx / N };
    }

    function initDescent(rootEl) {
        const frame = rootEl.querySelector('[data-descent-frame]');
        const canvas = rootEl.querySelector('.descent-canvas');
        if (!frame || !canvas) return;
        const ctx = canvas.getContext('2d');
        const $ = sel => rootEl.querySelector(sel);
        const ui = {
            epoch: $('[data-descent-epoch]'),
            loss: $('[data-descent-loss]'),
            status: $('[data-descent-status]'),
            overlay: $('[data-descent-overlay]'),
            overlaySub: $('[data-descent-overlay-sub]'),
            start: $('[data-descent-start]'),
            lr: $('[data-descent-lr]'),
            lrVal: $('[data-descent-lrval]'),
            mo: $('[data-descent-mo]'),
            moVal: $('[data-descent-moval]'),
            reset: $('[data-descent-reset]'),
            best: $('[data-descent-best]')
        };

        const SIM_MS = 80, GSCALE = .045;
        let land = makeLandscape();
        let W = 0, H = 0, dpr = 1;
        let state = 'idle';           // idle | running | won | dead
        let x = 0, v = 0, prevX = 0, epochs = 0;
        let acc = 0, lastT = 0, winTicks = 0, stuckTicks = 0, stuckShown = false;
        let trail = [], parts = [], death = null, endTimer = 0;
        let landPath = null, landFill = null;   // cached curve geometry
        let C = PG.colors();

        function fAt(px) {
            if (px < 0) return land.ys[0] - px * 1.8;
            if (px > 1) return land.ys[land.N] + (px - 1) * 1.8;
            const t = px * land.N;
            const i = Math.min(land.N - 1, t | 0);
            const fr = t - i;
            return land.ys[i] * (1 - fr) + land.ys[i + 1] * fr;
        }
        const gradAt = px => (fAt(px + 1 / land.N) - fAt(px - 1 / land.N)) * land.N / 2;

        const lrVal = () => Math.pow(10, parseFloat(ui.lr.value));
        const moVal = () => parseFloat(ui.mo.value);

        function fmtLr() {
            const lr = lrVal();
            ui.lrVal.textContent = lr >= 1 ? lr.toFixed(2) : lr.toFixed(3);
            ui.moVal.textContent = moVal().toFixed(2);
        }

        function startPos() {
            // begin on an outer slope, away from the global minimum
            return land.xg > .5 ? .05 + Math.random() * .1 : .85 + Math.random() * .1;
        }

        function showBest() {
            const list = PG.store.get('gd.best', []);
            ui.best.textContent = list.length ? `pb ${list.join(' · ')} epochs` : '';
        }

        function setStatus(msg, color) {
            ui.status.textContent = msg;
            ui.status.style.color = color || '';
        }

        /* ---- coordinate mapping ---- */
        const PADX = 18, PADT = 30, PADB = 26;
        const toPx = wx => PADX + wx * (W - 2 * PADX);
        const toPy = f => PADT + (1 - clamp(f, 0, 1)) * (H - PADT - PADB);

        function rebuildPaths() {
            if (!W) { landPath = landFill = null; return; }
            landPath = new Path2D();
            for (let i = 0; i <= land.N; i += 2) {
                const px = toPx(i / land.N), py = toPy(land.ys[i]);
                i === 0 ? landPath.moveTo(px, py) : landPath.lineTo(px, py);
            }
            landFill = new Path2D(landPath);
            landFill.lineTo(toPx(1), H);
            landFill.lineTo(toPx(0), H);
            landFill.closePath();
        }

        function resize() {
            const r = frame.getBoundingClientRect();
            if (!r.width || !r.height) return;
            dpr = Math.min(2, window.devicePixelRatio || 1);
            W = r.width; H = r.height;
            canvas.width = Math.round(W * dpr);
            canvas.height = Math.round(H * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            rebuildPaths();
            draw(performance.now());
        }

        /* ---- simulation ---- */
        function step() {
            prevX = x;
            const g = gradAt(x);
            v = moVal() * v - lrVal() * g * GSCALE;
            x += v;
            epochs++;
            trail.push({ x: prevX, life: 1 });
            if (trail.length > 18) trail.shift();

            if (Math.abs(v) > .38 || x < -.7 || x > 1.7) return die();

            const nearGlobal = Math.abs(x - land.xg) < .025;
            if (nearGlobal && Math.abs(v) < .0045) {
                if (++winTicks >= 8) return win();
            } else winTicks = 0;

            if (!nearGlobal && Math.abs(v) < .003 && Math.abs(g) < .35) {
                if (++stuckTicks >= 14 && !stuckShown) {
                    stuckShown = true;
                    setStatus('stuck in a local minimum — nudge it');
                }
            } else { stuckTicks = 0; if (stuckShown && Math.abs(v) > .01) { stuckShown = false; setStatus(''); } }
        }

        function win() {
            state = 'won';
            setStatus(`converged in ${epochs} epochs 🎉`);
            const list = PG.store.get('gd.best', []);
            const isPb = !list.length || epochs < list[0];
            list.push(epochs);
            list.sort((a, b) => a - b);
            PG.store.set('gd.best', list.slice(0, 3));
            showBest();
            if (isPb) setStatus(`converged in ${epochs} epochs — new personal best 🏆`);
            const r = canvas.getBoundingClientRect();
            PG.burst(r.left + toPx(x), r.top + toPy(fAt(x)), { count: 60, power: 7 });
            PG.award('gdConverge');
            PG.track('descent_converged', { value: epochs });
            document.dispatchEvent(new CustomEvent('pg:celebrate', { detail: { game: 'descent' } }));
            endTimer = setTimeout(() => {
                ui.start.textContent = '▶ run it back';
                ui.overlaySub.textContent = `${epochs} epochs — can you do it in fewer?`;
                ui.overlay.classList.remove('hidden');
                loop.setEnabled(false);
            }, 1600);
        }

        function die() {
            state = 'dead';
            death = { t0: performance.now(), x0: toPx(clamp(x, -.05, 1.05)), y0: toPy(fAt(clamp(x, -.05, 1.05))), dir: Math.sign(v) || 1 };
            setStatus('diverged — loss is NaN now. nice.', 'var(--accent-3)');
            ui.loss.textContent = 'loss NaN';
            if (!PG.reduced()) {
                frame.classList.add('descent-shake');
                setTimeout(() => frame.classList.remove('descent-shake'), 500);
            }
            PG.award('gdDiverge');
            PG.track('descent_diverged', { value: epochs });
            endTimer = setTimeout(() => {
                ui.start.textContent = '▶ try a smaller step';
                ui.overlaySub.textContent = 'the loss left the chart. lower the lr — or embrace chaos.';
                ui.overlay.classList.remove('hidden');
                loop.setEnabled(false);
            }, 1300);
        }

        function begin(fresh) {
            clearTimeout(endTimer);          // a pending win/die overlay must not fire into the new run
            if (fresh) { land = makeLandscape(); rebuildPaths(); }
            x = startPos(); prevX = x; v = 0;
            epochs = 0; winTicks = 0; stuckTicks = 0; stuckShown = false;
            trail = []; parts = []; death = null;
            acc = 0; lastT = 0;
            state = 'running';
            setStatus('');
            ui.overlay.classList.add('hidden');
            loop.setEnabled(true);
            PG.track('descent_start');
        }

        function nudge(dir) {
            if (state !== 'running') return;
            v += dir * .035;
            epochs += 3;   // nudges aren't free
            stuckShown = false;
            setStatus('');
            const bx = toPx(clamp(x, 0, 1)), by = toPy(fAt(clamp(x, 0, 1)));
            for (let i = 0; i < 7; i++) {
                parts.push({
                    x: bx, y: by,
                    vx: -dir * (1 + Math.random() * 2.2),
                    vy: -(.5 + Math.random() * 1.8),
                    life: 1
                });
            }
        }

        /* ---- rendering ---- */
        function draw(t) {
            if (!W) return;
            C = PG.colors();
            ctx.clearRect(0, 0, W, H);

            // faint grid
            ctx.globalAlpha = C.light ? .07 : .05;
            ctx.strokeStyle = C.txt;
            ctx.lineWidth = 1;
            for (let gx = PADX; gx < W; gx += 36) {
                ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
            }
            for (let gy = PADT; gy < H; gy += 36) {
                ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
            }

            // landscape fill + line (geometry cached in rebuildPaths)
            ctx.globalAlpha = 1;
            if (!landPath) rebuildPaths();
            const grad = ctx.createLinearGradient(0, PADT, 0, H);
            grad.addColorStop(0, C.accent + '00');
            grad.addColorStop(1, C.accent + (C.light ? '14' : '20'));
            ctx.fillStyle = grad;
            ctx.fill(landFill);
            ctx.strokeStyle = C.accent;
            ctx.globalAlpha = .85;
            ctx.lineWidth = 2;
            ctx.stroke(landPath);

            // global-minimum flag (waves gently while running)
            const fx = toPx(land.xg), fy = toPy(fAt(land.xg));
            ctx.globalAlpha = 1;
            ctx.strokeStyle = C.accent3;
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(fx, fy - 2); ctx.lineTo(fx, fy - 24); ctx.stroke();
            const wave = state === 'running' && !PG.reduced() ? Math.sin(t / 260) * 2.5 : 0;
            ctx.fillStyle = C.accent3;
            ctx.beginPath();
            ctx.moveTo(fx, fy - 24);
            ctx.lineTo(fx + 13, fy - 20 + wave);
            ctx.lineTo(fx, fy - 15);
            ctx.closePath();
            ctx.fill();

            // trail
            trail.forEach((tr, i) => {
                tr.life *= .94;
                ctx.globalAlpha = tr.life * .35;
                ctx.fillStyle = C.accent2;
                ctx.beginPath();
                ctx.arc(toPx(clamp(tr.x, -.05, 1.05)), toPy(fAt(tr.x)), 2 + i * .12, 0, Math.PI * 2);
                ctx.fill();
            });

            // nudge particles
            parts = parts.filter(p => p.life > 0);
            parts.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.vy += .12; p.life -= .045;
                ctx.globalAlpha = Math.max(0, p.life) * .8;
                ctx.fillStyle = C.accent2;
                ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
            });

            // ball (the optimizer)
            ctx.globalAlpha = 1;
            if (state === 'dead' && death) {
                const k = (t - death.t0) / 1000;
                const bx = death.x0 + death.dir * k * 240;
                const by = death.y0 - 320 * k + 560 * k * k;
                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(k * 9);
                ctx.fillStyle = C.accent2;
                ctx.beginPath(); ctx.arc(0, 0, Math.max(1, 7 - k * 3), 0, Math.PI * 2); ctx.fill();
                ctx.restore();
                ctx.globalAlpha = Math.max(0, 1 - k);
                ctx.fillStyle = C.accent3;
                ctx.font = `700 ${16 + k * 18}px ${C.mono}`;
                ctx.textAlign = 'center';
                ctx.fillText('NaN', death.x0, death.y0 - 30 - k * 50);
            } else {
                const ix = state === 'running' ? prevX + (x - prevX) * clamp(acc / SIM_MS, 0, 1) : x;
                const cx = clamp(ix, -.05, 1.05);
                const bx = toPx(cx), by = toPy(fAt(cx)) - 6;
                const stretch = 1 + Math.min(.55, Math.abs(v) * 11);
                const ang = Math.atan2(toPy(fAt(cx + .02)) - toPy(fAt(cx - .02)), toPx(cx + .02) - toPx(cx - .02));
                ctx.save();
                ctx.translate(bx, by);
                ctx.rotate(ang);
                ctx.scale(stretch, 1 / stretch);
                const bg = ctx.createRadialGradient(-2, -2, 1, 0, 0, 8);
                bg.addColorStop(0, C.accent2);
                bg.addColorStop(1, C.accent);
                ctx.fillStyle = bg;
                ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
                ctx.restore();
            }
            ctx.globalAlpha = 1;
        }

        function tick(t) {
            if (state === 'running') {
                if (!lastT) lastT = t;
                acc += Math.min(200, t - lastT);
                lastT = t;
                while (acc > SIM_MS && state === 'running') { step(); acc -= SIM_MS; }
                ui.epoch.textContent = `epoch ${String(epochs).padStart(3, '0')}`;
                if (state !== 'dead') ui.loss.textContent = `loss ${fAt(clamp(x, -.05, 1.05)).toFixed(4)}`;
            }
            draw(t);
        }

        /* ---- wiring ---- */
        const loop = PG.makeLoop(frame, tick);
        loop.setEnabled(false);

        ui.start.addEventListener('click', () => begin(state === 'won' || state === 'dead' ? false : true));
        ui.reset.addEventListener('click', () => {
            state = 'idle';
            begin(true);
        });
        rootEl.querySelectorAll('[data-descent-nudge]').forEach(btn =>
            btn.addEventListener('click', () => nudge(parseInt(btn.dataset.descentNudge, 10))));
        [ui.lr, ui.mo].forEach(el => el.addEventListener('input', fmtLr));

        new ResizeObserver(() => resize()).observe(frame);
        PG.onTheme(() => draw(performance.now()));
        fmtLr();
        showBest();
        resize();
    }

    document.querySelectorAll('[data-descent-root]').forEach(initDescent);
})();

/* ===================================================================
   FEATURE: REAL OR GENERATED? — paper-title quiz
   Half the deck is real published ML research; half was written by a
   language model for this site. 12 rounds, streaks, stamp verdicts.
   ==================================================================*/
(() => {
    const root = document.querySelector('[data-rg-root]');
    if (!root) return;

    // Real, published papers — title, venue, year (all verifiable).
    const REAL = [
        { t: 'Attention Is All You Need', src: 'NeurIPS 2017' },
        { t: 'One Pixel Attack for Fooling Deep Neural Networks', src: 'IEEE TEVC 2019' },
        { t: 'The Lottery Ticket Hypothesis: Finding Sparse, Trainable Neural Networks', src: 'ICLR 2019' },
        { t: 'Adversarial Examples Are Not Bugs, They Are Features', src: 'NeurIPS 2019' },
        { t: 'Weight Agnostic Neural Networks', src: 'NeurIPS 2019' },
        { t: 'Neural Ordinary Differential Equations', src: 'NeurIPS 2018' },
        { t: 'Grokking: Generalization Beyond Overfitting on Small Algorithmic Datasets', src: 'arXiv 2022' },
        { t: 'Deep Image Prior', src: 'CVPR 2018' },
        { t: 'The Hardware Lottery', src: 'CACM 2021' },
        { t: 'Pay Attention to MLPs', src: 'NeurIPS 2021' },
        { t: 'Intriguing Properties of Neural Networks', src: 'ICLR 2014' },
        { t: 'An Image is Worth 16x16 Words: Transformers for Image Recognition at Scale', src: 'ICLR 2021' },
        { t: 'Attention is not Explanation', src: 'NAACL 2019' },
        { t: 'Attention is not not Explanation', src: 'EMNLP 2019' },
        { t: 'Do CIFAR-10 Classifiers Generalize to CIFAR-10?', src: 'arXiv 2018' },
        { t: 'BERT Has a Mouth, and It Must Speak: BERT as a Markov Random Field Language Model', src: 'NAACL-W 2019' },
        { t: 'One Epoch Is All You Need', src: 'arXiv 2019' },
        { t: 'Your Classifier is Secretly an Energy Based Model and You Should Treat it Like One', src: 'ICLR 2020' },
        { t: 'Fantastically Ordered Prompts and Where to Find Them: Overcoming Few-Shot Prompt Order Sensitivity', src: 'ACL 2022' },
        { t: 'ResNet Strikes Back: An Improved Training Procedure in timm', src: 'NeurIPS-W 2021' },
        { t: 'Are Emergent Abilities of Large Language Models a Mirage?', src: 'NeurIPS 2023' },
        { t: 'The Era of 1-bit LLMs: All Large Language Models are in 1.58 Bits', src: 'arXiv 2024' },
        { t: 'Vision Transformers Need Registers', src: 'ICLR 2024' },
        { t: 'On the Dangers of Stochastic Parrots: Can Language Models Be Too Big? 🦜', src: 'FAccT 2021' }
    ];
    // Hallucinated by a language model, on purpose, for this game.
    const GEN = [
        { t: 'Dropout Is All You Don\'t Need: Stochastic Absence as a Training Signal' },
        { t: 'Et Tu, Adam? On the Quiet Betrayal of Adaptive Learning Rates' },
        { t: 'Latent Space Tourism: Zero-Shot Sightseeing in Frozen Diffusion Models' },
        { t: 'Overfitting as a Service: Memorization-First Architectures for Small Data' },
        { t: 'Schrödinger\'s Batch: Superposition Sampling for Undecided Optimizers' },
        { t: 'You Only Look Eleven Times: Redundant Detection for the Anxious' },
        { t: 'Gradient Descent Considered as a Hike: Topographic Regularization with Trail Mix' },
        { t: 'Loss Is a Social Construct: Post-Structuralist Objectives for Vision Transformers' },
        { t: 'Backpropagation Through Vibes: Mood Embeddings at Scale' },
        { t: 'BERT, but Louder: Volume as an Inductive Bias' },
        { t: 'Stochastic Parrots Can Tango: Choreographic Alignment of Language Models' },
        { t: 'The Bitter Lesson 2: Sweetened Variants for Small Compute' },
        { t: 'We Have No Idea Why This Works: A Rigorous Empirical Study' },
        { t: 'Chain-of-Thought Is Just Talking to Yourself: Clinical Implications for Language Models' },
        { t: 'GPU-Poor but Loss-Rich: Foundation Models on Vibes and a MacBook' },
        { t: 'Batch Size 1: A Meditation' },
        { t: 'Early Stopping as Self-Care: Wellness-Aware Optimization' },
        { t: 'Emergent Abilities of Small Language Models Under Peer Pressure' },
        { t: 'The Unreasonable Effectiveness of Copy-Paste in Deep Learning Research' },
        { t: 'Is Water Wet? A Multimodal Benchmark Nobody Asked For' },
        { t: 'Reward Hacking Yourself Before the Model Does: Introspective RLHF' },
        { t: 'MNIST at 3AM: Confessions of a Conditional VAE' }
    ];

    const $ = sel => root.querySelector(sel);
    const ui = {
        stage: $('[data-rg-stage]'),
        title: $('[data-rg-title]'),
        count: $('[data-rg-count]'),
        streak: $('[data-rg-streak]'),
        stamp: $('[data-rg-stamp]'),
        stampText: $('[data-rg-stamp-text]'),
        verdict: $('[data-rg-verdict]'),
        overlay: $('[data-rg-overlay]'),
        overlaySub: $('[data-rg-overlay-sub]'),
        start: $('[data-rg-start]'),
        actions: $('[data-rg-actions]'),
        best: $('[data-rg-best]')
    };
    const guessBtns = root.querySelectorAll('[data-rg-guess]');

    const ROUNDS = 12;
    const shuffle = PG.shuffle;
    let deck = [], i = 0, score = 0, streak = 0, bestStreak = 0, busy = false;

    function showBest() {
        const b = PG.store.get('rg.best', null);
        ui.best.textContent = b ? `pb ${b.score}/${ROUNDS} · best streak ${b.streak}` : '';
    }

    function startRun() {
        deck = shuffle([
            ...shuffle(REAL).slice(0, ROUNDS / 2).map(p => ({ ...p, real: true })),
            ...shuffle(GEN).slice(0, ROUNDS / 2).map(p => ({ ...p, real: false }))
        ]);
        i = 0; score = 0; streak = 0; bestStreak = 0; busy = false;
        ui.overlay.classList.add('hidden');
        ui.actions.hidden = false;
        ui.verdict.textContent = '';
        PG.track('rg_start');
        showRound();
    }

    function showRound() {
        const card = deck[i];
        ui.title.textContent = `“${card.t}”`;
        ui.count.textContent = `${String(i + 1).padStart(2, '0')} / ${ROUNDS}`;
        ui.streak.textContent = streak >= 3 ? `streak ${streak} 🔥` : (streak ? `streak ${streak}` : '');
        ui.stamp.classList.remove('show', 'real', 'gen');
        ui.verdict.textContent = '';
        guessBtns.forEach(b => b.disabled = false);
        busy = false;
    }

    function guess(saidReal) {
        if (busy || i >= deck.length) return;
        busy = true;
        guessBtns.forEach(b => b.disabled = true);
        const card = deck[i];
        const correct = saidReal === card.real;

        ui.stamp.classList.add(card.real ? 'real' : 'gen');
        ui.stampText.textContent = card.real ? 'REAL' : 'GENERATED';
        ui.stamp.classList.add('show');
        ui.verdict.textContent = (correct ? '✓ ' : '✗ ') +
            (card.real ? `published — ${card.src}` : 'hallucinated by a language model for this site');
        ui.verdict.style.color = correct ? 'var(--accent-2)' : 'var(--accent-3)';

        if (correct) {
            score++;
            streak++;
            bestStreak = Math.max(bestStreak, streak);
            if (streak >= 8) PG.award('rgSharp');
        } else {
            streak = 0;
            if (!card.real) PG.award('rgFooled');
            if (!PG.reduced()) {
                ui.stage.classList.add('descent-shake');
                setTimeout(() => ui.stage.classList.remove('descent-shake'), 500);
            }
        }
        ui.streak.textContent = streak >= 3 ? `streak ${streak} 🔥` : (streak ? `streak ${streak}` : '');

        i++;
        setTimeout(i >= ROUNDS ? finish : showRound, 1450);
    }

    function finish() {
        ui.actions.hidden = true;
        ui.stamp.classList.remove('show');
        ui.title.textContent = '';
        ui.verdict.textContent = '';
        const pct = score / ROUNDS;
        const line =
            pct >= .85 ? 'deepfake-detector material. we should talk.' :
            pct >= .6  ? 'a solid discriminator — the generator needs more steps.' :
            pct >= .4  ? 'the generator is winning. it only needed to fool you once.' :
                         'fully fooled. the GAN has reached equilibrium.';
        ui.start.textContent = '▶ run it back';
        ui.overlaySub.innerHTML =
            `<strong>${score} / ${ROUNDS}</strong> · best streak ${bestStreak}<br>${line}`;
        ui.overlay.classList.remove('hidden');

        const prev = PG.store.get('rg.best', null);
        if (!prev || score > prev.score || (score === prev.score && bestStreak > prev.streak)) {
            PG.store.set('rg.best', { score, streak: bestStreak });
        }
        showBest();
        PG.award('rgDone');
        PG.track('rg_finished', { value: score });
        if (pct >= .6) {
            const r = ui.stage.getBoundingClientRect();
            PG.burst(r.left + r.width / 2, r.top + r.height / 2, { count: 45 });
            document.dispatchEvent(new CustomEvent('pg:celebrate', { detail: { game: 'rg' } }));
        }
    }

    ui.start.addEventListener('click', startRun);
    guessBtns.forEach(b =>
        b.addEventListener('click', () => guess(b.dataset.rgGuess === 'real')));
    showBest();
})();

/* ===================================================================
   FEATURE: KOALA COMPANION
   A small koala lives in the corner. It breathes, sleeps when you go
   idle, ducks when you scroll too fast, gets excited near the projects
   grid, celebrates finished games, and opens the easter-egg hub after
   five clicks. Dismissible; remembers the dismissal.
   ==================================================================*/
(() => {
    if (!document.getElementById('projectGrid')) return;   // index only

    const IDLE_MS = 30000;
    const QUIPS = [
        'eucalyptus is all you need',
        'i run on-device. no cloud, just naps',
        'my attention span is exactly one token',
        'press ~ — i won\'t tell anyone',
        'low loss, lower energy',
        'i was trained on 100% organic leaves',
        'the 404 page is underrated. just saying'
    ];

    let pal, img, bubble, bubbleTimer = 0, quipIdx = (Math.random() * QUIPS.length) | 0;
    let clicks = 0, idleTimer = 0, sleeping = false;
    let lastScrollY = window.scrollY, lastScrollT = 0, duckUntil = 0, lastWhoa = 0, lastExcite = 0;

    function build() {
        pal = document.createElement('div');
        pal.className = 'koala-pal' + (PG.reduced() ? '' : ' breathe');
        pal.innerHTML =
            `<button class="koala-btn" type="button" aria-label="Koala companion — it reacts to things. Click it.">
                 <img src="assets/koala_192.webp" alt="" width="64" height="64"/>
             </button>
             <span class="koala-bubble" aria-hidden="true"></span>
             <button class="koala-dismiss" type="button" aria-label="Dismiss the koala">✕</button>`;
        document.body.appendChild(pal);
        img = pal.querySelector('img');
        bubble = pal.querySelector('.koala-bubble');

        pal.querySelector('.koala-btn').addEventListener('click', onClick);
        pal.querySelector('.koala-dismiss').addEventListener('click', () => {
            pal.classList.add('hidden');
            PG.store.set('koalaHidden', true);
            PG.track('koala_dismissed');
        });
        armIdle();
    }

    function say(text, ms) {
        if (!pal) return;
        bubble.textContent = text;
        pal.classList.add('talk');
        clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(() => pal.classList.remove('talk'), ms || 2600);
    }

    function hop() {
        if (PG.reduced() || !pal) return;
        pal.classList.remove('hop');
        void pal.offsetWidth;           // restart the animation
        pal.classList.add('hop');
    }

    function excitedFace(ms) {
        if (!img) return;
        img.src = 'assets/cursor_192.webp';
        setTimeout(() => { img.src = 'assets/koala_192.webp'; }, ms || 4500);
    }

    function onClick() {
        wake();
        clicks++;
        if (clicks === 5) {
            PG.award('koala5');
            say('fine. here\'s everything 🗝️', 1800);
            hop();
            setTimeout(PG.openHub, 700);
            return;
        }
        if (clicks === 4) { say('one more click and i open the vault…'); hop(); return; }
        if (clicks > 5 && clicks % 5 === 0) { PG.openHub(); return; }
        say(QUIPS[quipIdx++ % QUIPS.length]);
        if (clicks % 2) hop();
    }

    /* ---- sleep / wake ---- */
    function armIdle() {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            if (!pal) return;
            sleeping = true;
            pal.classList.add('sleep');
            pal.classList.remove('breathe');
            say('💤', 60000);
        }, IDLE_MS);
    }
    function wake() {
        if (sleeping) {
            sleeping = false;
            pal.classList.remove('sleep', 'talk');
            if (!PG.reduced()) pal.classList.add('breathe');
        }
        armIdle();
    }
    let lastActivity = 0;
    function onActivity() {
        if (!pal) return;               // koala dismissed in a previous session
        const now = Date.now();
        if (now - lastActivity < 900) return;
        lastActivity = now;
        wake();
    }

    /* ---- fast-scroll duck ---- */
    function onScroll() {
        if (!pal) return;
        onActivity();
        const now = performance.now();
        const dt = now - lastScrollT;
        if (dt > 0 && dt < 220) {
            const v = Math.abs(window.scrollY - lastScrollY) / dt * 1000;
            if (v > 2400 && !PG.reduced()) {
                pal.classList.add('duck');
                duckUntil = now + 450;
                setTimeout(() => {
                    if (performance.now() >= duckUntil) {
                        pal.classList.remove('duck');
                        if (Date.now() - lastWhoa > 30000) {
                            lastWhoa = Date.now();
                            setTimeout(() => say('whoa. easy on the scroll wheel'), 380);
                        }
                    }
                }, 500);
            }
        }
        lastScrollY = window.scrollY;
        lastScrollT = now;
    }

    /* ---- init (respect a remembered dismissal) ---- */
    if (!PG.store.get('koalaHidden', false)) build();
    document.addEventListener('pg:koala-return', () => {
        if (!pal) build();
        pal.classList.remove('hidden');
        say('i\'m back. i knew you\'d cave');
    });

    ['pointermove', 'keydown', 'touchstart'].forEach(ev =>
        document.addEventListener(ev, onActivity, { passive: true }));
    window.addEventListener('scroll', onScroll, { passive: true });

    /* ---- reactions ---- */
    [
        ['projects', 'ooh. this is my favorite section'],
        ['playground', 'we are SO back. let\'s play']
    ].forEach(([id, line]) => {
        const target = document.getElementById(id);
        if (!target) return;
        new IntersectionObserver(entries => {
            if (!pal || pal.classList.contains('hidden')) return;
            if (entries.some(en => en.isIntersecting) && Date.now() - lastExcite > 90000) {
                lastExcite = Date.now();
                excitedFace();
                hop();
                say(line);
            }
        }, { threshold: .18 }).observe(target);
    });
    document.addEventListener('pg:celebrate', e => {
        if (!pal || pal.classList.contains('hidden')) return;
        excitedFace(3000);
        hop();
        say(e.detail?.game === 'py2' ? 'i did NOT train it to do that' : '🎉 certified convergence');
    });
})();

/* ===================================================================
   FEATURE: KONAMI → OVERFIT MODE
   ↑ ↑ ↓ ↓ ← → ← → B A — the page memorizes noise: everything jitters
   until you apply weight decay. Also triggered by `konami` in the
   terminal (for touch devices). Auto early-stops after 25s.
   ==================================================================*/
(() => {
    const SEQ = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let buf = [], active = false, victims = [], regBtn = null, stopTimer = 0;

    function overfit() {
        if (active) return;
        active = true;
        PG.award('konami');
        PG.track('konami');
        victims = [...document.querySelectorAll(
            '.project-card, .about-card, .featured-card, .contact-card, .xp-card, ' +
            '.section-head h2, .hero h1, .btn, .contact, .filter-chip, .brand-mark, .icon-btn'
        )];
        victims.forEach(el => {
            el.style.setProperty('--ofr', ((Math.random() - .5) * 2.4).toFixed(2) + 'deg');
            el.style.setProperty('--oftx', ((Math.random() - .5) * 5).toFixed(1) + 'px');
            el.style.setProperty('--ofty', ((Math.random() - .5) * 4).toFixed(1) + 'px');
            el.style.setProperty('--ofd', (.28 + Math.random() * .4).toFixed(2) + 's');
            el.classList.add('pg-overfit-el');
        });
        PG.toast({
            icon: '⚠️', title: 'Severe overfit detected',
            sub: 'train loss 0.0001 · val loss 47.3 — the model memorized your keystrokes', ms: 5200
        });
        regBtn = document.createElement('button');
        regBtn.className = 'pg-regularize';
        regBtn.type = 'button';
        regBtn.innerHTML = '🧊 apply weight decay <span style="opacity:.65">(λ = 0.01)</span>';
        regBtn.addEventListener('click', () => regularize(true));
        document.body.appendChild(regBtn);
        regBtn.focus();
        stopTimer = setTimeout(() => regularize(false), 25000);
    }

    function regularize(byUser) {
        if (!active) return;
        active = false;
        clearTimeout(stopTimer);
        victims.forEach(el => {
            el.classList.remove('pg-overfit-el');
            ['--ofr', '--oftx', '--ofty', '--ofd'].forEach(p => el.style.removeProperty(p));
        });
        victims = [];
        regBtn?.remove();
        regBtn = null;
        if (byUser) {
            PG.award('regularized');
            PG.toast({ icon: '🧊', title: 'Weight decay applied', sub: 'val loss 0.021 — generalization restored' });
        } else {
            PG.toast({ icon: '⏱', title: 'Early stopping triggered', sub: 'patience exceeded — weights rolled back' });
        }
    }

    document.addEventListener('keydown', e => {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        buf.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
        if (buf.length > SEQ.length) buf.shift();
        if (SEQ.every((k, i) => buf[i] === k)) { buf = []; overfit(); }
    });
    document.addEventListener('pg:konami', overfit);
})();

/* ===================================================================
   FEATURE: HIDDEN TERMINAL
   Press ` / ~ anywhere (or use the hub button) for koala-shell.
   ==================================================================*/
(() => {
    let term = null, out = null, input = null, restoreFocus = null;
    const history = [];
    let histIdx = -1;

    const LINKS = {
        github:   'https://github.com/amit154154',
        linkedin: 'https://www.linkedin.com/in/amit-israeli-aa4a30242/',
        hf:       'https://huggingface.co/AmitIsraeli',
        spotify:  'https://open.spotify.com/show/0fuZbZipy60VdRpkbIb9y1',
        cv:       '/assets/AmitIsraeliCV_15_20_2025.pdf',   // root-absolute: the terminal also runs on /404 paths
        wix:      'https://www.wix.com'
    };

    function esc(s) {
        return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }
    function print(html, cls) {
        const p = document.createElement('p');
        p.className = 'pg-term-line' + (cls ? ' ' + cls : '');
        p.innerHTML = html;
        out.appendChild(p);
        out.scrollTop = out.scrollHeight;
        return p;
    }

    function build() {
        term = document.createElement('div');
        term.className = 'pg-term';
        term.setAttribute('role', 'dialog');
        term.setAttribute('aria-label', 'Hidden terminal');
        term.innerHTML =
            `<div class="pg-term-head">
                 <span class="pg-term-dot"></span>
                 <span>guest@amit154154.github.io — koala-shell</span>
                 <button class="pg-term-close" type="button" aria-label="Close terminal">[esc] close</button>
             </div>
             <div class="pg-term-out" aria-live="polite"></div>
             <div class="pg-term-input-row">
                 <span class="pg-term-prompt" aria-hidden="true">➜ ~</span>
                 <input class="pg-term-input" type="text" spellcheck="false" autocomplete="off"
                        aria-label="Terminal command input"/>
             </div>`;
        document.body.appendChild(term);
        out = term.querySelector('.pg-term-out');
        input = term.querySelector('.pg-term-input');
        term.querySelector('.pg-term-close').addEventListener('click', close);
        term.addEventListener('click', () => input.focus());
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                const cmd = input.value;
                input.value = '';
                run(cmd);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (history.length) {
                    histIdx = Math.max(0, histIdx < 0 ? history.length - 1 : histIdx - 1);
                    input.value = history[histIdx];
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (histIdx >= 0) {
                    histIdx++;
                    if (histIdx >= history.length) { histIdx = -1; input.value = ''; }
                    else input.value = history[histIdx];
                }
            }
        });
        print('<span class="t-dim">koala-shell 1.0 — type <b>help</b> to see what this thing can do.</span>');
    }

    function open() {
        if (!term) build();
        restoreFocus = document.activeElement;
        term.classList.add('open');
        setTimeout(() => input.focus(), 80);
        PG.award('terminal');
        PG.track('terminal_opened');
    }
    function close() {
        if (!term) return;
        term.classList.remove('open');
        if (restoreFocus && restoreFocus.focus) restoreFocus.focus();
    }
    const isOpen = () => term && term.classList.contains('open');

    function train() {
        print('initializing <b>koala-net-7B</b> on the eucalyptus corpus…');
        const epochs = [
            ['epoch 1/4', 2.3026], ['epoch 2/4', 0.8714],
            ['epoch 3/4', 0.1932], ['epoch 4/4', 0.0231]
        ];
        epochs.forEach(([name, loss], i) => {
            setTimeout(() => {
                const bars = '█'.repeat((i + 1) * 5) + '░'.repeat(20 - (i + 1) * 5);
                print(`<span class="t-dim">${name}</span> ${bars} <span class="t-ok">loss ${loss.toFixed(4)}</span>`);
                if (i === epochs.length - 1) {
                    setTimeout(() => print('<span class="t-ok">converged ✓</span> deploying to github pages… done.'), 420);
                }
            }, 450 * (i + 1));
        });
    }

    const COMMANDS = {
        help() {
            print([
                '<span class="t-dim">available commands:</span>',
                '  <b>whoami</b>          identity check',
                '  <b>ls</b> [projects]   look around',
                '  <b>cat koala.txt</b>   meet the mascot',
                '  <b>train</b>           fit something',
                '  <b>open</b> &lt;target&gt;   github · linkedin · hf · spotify · cv',
                '  <b>achievements</b>    progress report',
                '  <b>theme</b>           flip dark/light',
                '  <b>koala</b>           summon the koala back',
                '  <b>konami</b>          (touch-friendly cheat code)',
                '  <b>clear</b> · <b>exit</b>    housekeeping',
                '  <span class="t-dim">…and the classics. sudo exists.</span>'
            ].join('\n'));
        },
        whoami() { print('guest <span class="t-dim">(gpu access: denied · eucalyptus access: granted)</span>'); },
        pwd() { print('/home/guest/portfolio'); },
        date() { print(new Date().toString() + ' <span class="t-dim">(time flies when loss decreases)</span>'); },
        ls(arg) {
            if (arg === 'projects' || arg === 'playground') {
                const grid = arg === 'projects' ? '#projectGrid' : '#playgroundGrid';
                const names = [...document.querySelectorAll(`${grid} .project-card h3`)]
                    .map(h => '  ' + esc(h.textContent.trim()));
                print(names.join('\n') || `  (${arg} lives on the homepage — go there)`);
            } else if (arg === 'secrets' || arg === 'secrets/') {
                print('<span class="t-warn">permission denied</span> — secrets/ is koala-readable only.');
            } else {
                print('about/  experience/  projects/  playground/  reading/  contact/  koala.txt  <span class="t-dim">secrets/</span>');
            }
        },
        cat(arg) {
            if ((arg || '').startsWith('koala')) {
                print(['  ʕ •ᴥ•ʔ   koala.txt', '  ------', '  role: mascot, morale, QA',
                       '  motto: do more with less (parameters)',
                       '  tip: i react to scrolling. and clicking. and naps.'].join('\n'));
            } else print(`cat: ${esc(arg || '')}: no such file <span class="t-dim">(try koala.txt)</span>`);
        },
        train, fit: train,
        open(arg) {
            if (LINKS[arg]) {
                window.open(LINKS[arg], '_blank', 'noopener');
                print(`opening <span class="t-ok">${arg}</span> ↗`);
            } else {
                print('open &lt;target&gt; — targets: ' + Object.keys(LINKS).join(' · '));
            }
        },
        achievements() {
            print('<span class="t-dim">progress report:</span>');
            const got = PG.store.get('ach', {});
            const total = PG.achievementCount();
            print(Object.keys(got).length + ' / ' + total + ' unlocked — open the 🏆 in the nav for details.');
        },
        theme() {
            const btn = document.getElementById('themeToggle');
            if (btn) btn.click();
            else {
                // 404 page has no toggle button — flip + persist directly
                const light = !document.documentElement.classList.contains('light');
                document.documentElement.classList.toggle('light', light);
                try { localStorage.setItem('theme', light ? 'light' : 'dark'); } catch (e) {}
            }
            print('theme flipped. <span class="t-dim">your retinas, your rules.</span>');
        },
        koala() {
            PG.store.set('koalaHidden', false);
            document.dispatchEvent(new CustomEvent('pg:koala-return'));
            print('koala restored. <span class="t-ok">it forgives you.</span>');
        },
        konami() {
            print('<span class="t-warn">injecting noise into the weights…</span>');
            setTimeout(() => document.dispatchEvent(new CustomEvent('pg:konami')), 400);
        },
        clear() { out.innerHTML = ''; },
        exit: close,
        sudo(arg, rest) {
            if (arg === 'make_cooler') {
                print('[sudo] password for guest: ······');
                setTimeout(() => {
                    print('<span class="t-ok">access granted.</span> fans: 100%. RGB: enabled. site temperature: −3°C.');
                    print('<span class="t-ok">you found root.</span>');
                    PG.award('rootAccess');
                    PG.burst(innerWidth / 2, innerHeight / 2, { count: 70, power: 8 });
                }, 500);
            } else if (arg === 'rm' || (arg === '' && !rest)) {
                print('usage: sudo make_cooler');
            } else {
                print('guest is not in the sudoers file. <span class="t-warn">this incident will be reported (to the koala).</span>');
            }
        },
        make_cooler() { print('<span class="t-warn">permission denied</span> — cooling requires sudo.'); },
        rm(arg, rest) {
            if ((arg + ' ' + rest).includes('-rf')) print('nice try. <span class="t-ok">the koala keeps backups.</span>');
            else print('rm: refusing to delete a perfectly good portfolio.');
        },
        echo(arg, rest) { print(esc([arg, rest].filter(Boolean).join(' ')) || ''); }
    };

    function run(raw) {
        const cmd = raw.trim();
        print(`<span class="t-dim">➜ ~</span> ${esc(cmd)}`);
        if (!cmd) return;
        history.push(cmd);
        histIdx = -1;
        const [name, arg = '', ...restArr] = cmd.split(/\s+/);
        const key = name.toLowerCase();
        // own-property check: `constructor` / `toString` are not commands
        const fn = Object.prototype.hasOwnProperty.call(COMMANDS, key) ? COMMANDS[key] : null;
        if (fn) fn(arg.toLowerCase(), restArr.join(' '));
        else print(`command not found: ${esc(name)} <span class="t-dim">— try help</span>`);
        PG.track('terminal_cmd', { event_label: name.toLowerCase() });
    }

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && isOpen()) { close(); return; }
        if (e.key !== '`' && e.key !== '~') return;
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
        e.preventDefault();
        isOpen() ? close() : open();
    });
    document.addEventListener('pg:open-terminal', open);
})();

/* ===================================================================
   FEATURE: ATTENTION MAP OVER THE HEADLINE
   Hover-hold (or touch-hold) the hero h1: the cursor becomes the
   query, the words become keys, and softmax does the rest.
   ==================================================================*/
(() => {
    const h1 = document.querySelector('.hero h1');
    if (!h1) return;

    // tokenize once, preserving the styled ampersand
    const frag = document.createDocumentFragment();
    [...h1.childNodes].forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            node.textContent.split(/(\s+)/).forEach(part => {
                if (!part) return;
                if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part));
                else {
                    const s = document.createElement('span');
                    s.className = 'attn-tok';
                    s.textContent = part;
                    frag.appendChild(s);
                }
            });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            node.classList.add('attn-tok');
            frag.appendChild(node);
        }
    });
    h1.replaceChildren(frag);
    const toks = [...h1.querySelectorAll('.attn-tok')];

    let live = false, holdTimer = 0, chip = null, centers = [];
    let C = PG.colors();
    PG.onTheme(c => { C = c; });

    const accentRgb = () => {
        // tokens come as #rrggbb — parse once per call (cheap, rare)
        const hex = C.accent.replace('#', '');
        const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    };

    function activate() {
        if (live) return;
        live = true;
        h1.classList.add('attn-live');
        centers = toks.map(t => {
            const r = t.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        });
        chip = document.createElement('div');
        chip.className = 'attn-chip';
        chip.setAttribute('aria-hidden', 'true');
        document.body.appendChild(chip);
        PG.award('attention');
        PG.track('attention_map');
    }

    function deactivate() {
        clearTimeout(holdTimer);
        if (!live) return;
        live = false;
        h1.classList.remove('attn-live');
        toks.forEach(t => {
            t.style.backgroundColor = '';
            t.style.transform = '';
        });
        chip?.remove();
        chip = null;
    }

    function update(e) {
        if (!live) return;
        const SIGMA = 95;
        const scores = centers.map(c => {
            const d2 = (c.x - e.clientX) ** 2 + (c.y - e.clientY) ** 2;
            return Math.exp(-d2 / (2 * SIGMA * SIGMA));
        });
        const sum = scores.reduce((a, b) => a + b, 0) || 1;
        const [r, g, b] = accentRgb();
        let top = 0;
        scores.forEach((s, i) => {
            const w = s / sum;
            if (w > scores[top] / sum) top = i;
            const alpha = Math.min(.85, w * toks.length * .45);
            toks[i].style.backgroundColor = `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
            if (!PG.reduced()) toks[i].style.transform = `scale(${1 + w * .35})`;
        });
        const wTop = scores[top] / sum;
        chip.textContent = `attn(q, k${top}) = ${wTop.toFixed(2)}`;
        chip.style.left = (e.clientX + 14) + 'px';
        chip.style.top = (e.clientY - 34) + 'px';
    }

    h1.addEventListener('pointerenter', e => {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => { activate(); update(e); }, 600);
    });
    h1.addEventListener('pointermove', e => { if (live) update(e); });
    h1.addEventListener('pointerleave', deactivate);
    h1.addEventListener('pointerdown', e => {
        clearTimeout(holdTimer);
        holdTimer = setTimeout(() => { activate(); update(e); }, 420);
    });
    h1.addEventListener('pointerup', () => { if (!live) clearTimeout(holdTimer); });
    window.addEventListener('scroll', deactivate, { passive: true });
})();

/* ===================================================================
   FEATURE: MICRO-INTERACTIONS
   Timeline rails draw with scroll (ScrollTrigger scrub), project
   cards get magnetic tilt (fine pointers only), section headings
   decode in once, and the nav shows a training stat that ticks the
   loss down as you read.
   ==================================================================*/
(() => {
    /* ---- timeline rail scrub (falls back to the existing IO fill) ---- */
    function railScrub() {
        if (!(window.gsap && window.ScrollTrigger) || PG.reduced()) return;
        const tl = document.getElementById('timeline');
        if (!tl) return;
        gsap.registerPlugin(ScrollTrigger);
        tl.classList.add('rail-scrub');
        tl.querySelectorAll('.xp').forEach(xp => {
            gsap.fromTo(xp, { '--rail-h': '0%' }, {
                '--rail-h': '100%',
                ease: 'none',
                scrollTrigger: { trigger: xp, start: 'top 88%', end: 'bottom 52%', scrub: .4 }
            });
        });
    }
    // GSAP loads with defer before this file; double-check anyway
    if (window.gsap && window.ScrollTrigger) railScrub();
    else window.addEventListener('load', railScrub);

    /* ---- magnetic tilt on project + playground cards ---- */
    if (matchMedia('(pointer: fine)').matches && !PG.reduced()) {
        document.querySelectorAll('.projects-grid .project-card').forEach(card => {
            let rx = 0, ry = 0, tx = 0, ty = 0, raf = 0, active = false;
            function frame() {
                rx += (tx - rx) * .18;
                ry += (ty - ry) * .18;
                if (!active && Math.abs(rx) < .05 && Math.abs(ry) < .05) {
                    card.style.transform = '';
                    card.style.transition = '';
                    raf = 0;
                    return;
                }
                card.style.transform =
                    `perspective(900px) translateY(-3px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
                raf = requestAnimationFrame(frame);
            }
            card.addEventListener('pointerenter', () => {
                active = true;
                card.style.transition = 'box-shadow .25s ease, border-color .25s ease';
                if (!raf) raf = requestAnimationFrame(frame);
            });
            card.addEventListener('pointermove', e => {
                const r = card.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - .5;
                const py = (e.clientY - r.top) / r.height - .5;
                tx = -py * 5.5;
                ty = px * 6.5;
            });
            card.addEventListener('pointerleave', () => {
                active = false;
                tx = 0; ty = 0;
            });
        });
    }

    /* ---- one-time decode effect on section headings ---- */
    if (!PG.reduced()) {
        const GLYPHS = '01<>/{}[]#$%&*+=~';
        const heads = document.querySelectorAll('.section-head h2');
        const decode = el => {
            const final = el.textContent;
            const t0 = performance.now();
            const DUR = 520;
            (function step(t) {
                const p = Math.min(1, (t - t0) / DUR);
                const settled = Math.floor(p * final.length);
                el.textContent = final.slice(0, settled) +
                    [...final.slice(settled)].map(c =>
                        /\s/.test(c) ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
                if (p < 1) requestAnimationFrame(step);
                else el.textContent = final;
            })(t0);
        };
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => {
                if (en.isIntersecting) {
                    io.unobserve(en.target);
                    decode(en.target);
                }
            });
        }, { threshold: .6 });
        heads.forEach(h => io.observe(h));
    }

    /* ---- nav training stat ---- */
    const stat = document.getElementById('trainStat');
    if (stat) {
        const sections = document.querySelectorAll('main > section, header.hero');
        let pending = false;
        function update() {
            pending = false;
            const h = document.documentElement;
            const total = h.scrollHeight - h.clientHeight;
            const p = total > 0 ? h.scrollTop / total : 0;
            const loss = 2.31 * Math.pow(1 - p, 2.2) + .018;
            let ep = 0;
            // sections are position:relative inside main, so offsetTop is
            // main-relative — use viewport coordinates instead
            sections.forEach(s => { if (s.getBoundingClientRect().top <= innerHeight * .6) ep++; });
            stat.textContent = '';
            stat.append(`ep ${ep}/${sections.length} · loss `);
            const b = document.createElement('b');
            b.textContent = loss.toFixed(3);
            stat.appendChild(b);
        }
        window.addEventListener('scroll', () => {
            if (!pending) { pending = true; requestAnimationFrame(update); }
        }, { passive: true });
        update();
    }
})();

/* ===================================================================
   FEATURE: FUNKO FORGE — PopYou2 builder + the forbidden combination
   Live outputs from the VAR text-to-image model. 36 pre-generated
   combos. Exactly one of them is legendary.
   ==================================================================*/
(() => {
    const root = document.querySelector('[data-py2-root]');
    if (!root) return;
    const nameSel = root.querySelector('#py2_name');
    const charSel = root.querySelector('#py2_char');
    const actSel = root.querySelector('#py2_action');
    const img = root.querySelector('#py2_image');
    const frame = root.querySelector('.py2-frame');
    const stamp = root.querySelector('#py2_stamp');
    if (!(nameSel && charSel && actSel && img && frame && stamp)) return;

    const LEGEND = 'donald_trump_robot_holding_the_sword';
    let toasted = false;   // toast once per page load; the achievement is once ever

    function update() {
        const combo = `${nameSel.value}_${charSel.value}_${actSel.value}`;
        img.classList.remove('swap');
        requestAnimationFrame(() => {
            img.src = `assets/projects_assets/PopYou2/generated_images/${combo}.png`;
            img.classList.add('swap');
        });
        PG.track('funko_pop_selection', { event_label: combo, value: 1 });
        combo === LEGEND ? summon() : banish();
    }

    function summon() {
        frame.classList.add('legend');
        stamp.classList.add('show');
        const r = frame.getBoundingClientRect();
        const c = PG.colors();
        PG.burst(r.left + r.width / 2, r.top + r.height / 2,
            { count: 70, power: 7, colors: [c.accent3, '#ffd700', c.accent] });
        if (!toasted) {
            toasted = true;
            PG.toast({
                icon: '⚔️',
                title: 'EXECUTIVE ORDER 9000',
                sub: 'sword-bearing RoboTrump summoned. the model refuses to elaborate.',
                ms: 5200
            });
        }
        PG.award('trumpBot');
        document.dispatchEvent(new CustomEvent('pg:celebrate', { detail: { game: 'py2' } }));
    }

    function banish() {
        frame.classList.remove('legend');
        stamp.classList.remove('show');
    }

    [nameSel, charSel, actSel].forEach(el => el.addEventListener('change', update));
})();

/* ===================================================================
   FEATURE: TINY AMIT — an SLM living in the browser
   LiquidAI LFM2.5-230M (ONNX, q4) via transformers.js, WebGPU with
   WASM fallback. Weights stream from the HF hub once (~210 MB), cache
   in the browser, then every token is generated on the visitor's own
   hardware. The model gets a short system note about Amit.
   ==================================================================*/
(() => {
    const root = document.querySelector('[data-slm-root]');
    if (!root) return;
    const chatEl = root.querySelector('[data-slm-chat]');
    const overlay = root.querySelector('[data-slm-overlay]');
    const loadBtn = root.querySelector('[data-slm-load]');
    const progWrap = root.querySelector('[data-slm-progress]');
    const progBar = root.querySelector('[data-slm-bar]');
    const progText = root.querySelector('[data-slm-ptext]');
    const form = root.querySelector('[data-slm-form]');
    const input = root.querySelector('[data-slm-input]');
    const sendBtn = root.querySelector('[data-slm-send]');
    const statusEl = root.querySelector('[data-slm-status]');

    const TJS = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0';
    const MODEL = 'LiquidAI/LFM2.5-230M-ONNX';

    /* kept deliberately short — a 230M model drowns in long system prompts */
    const SYSTEM = [
        'You are Tiny Amit, a 230M-parameter model (LiquidAI LFM2.5) running inside the',
        'browser on Amit Israeli\'s portfolio site.',
        'About Amit: AI Research Scientist at Wix (Tel Aviv), working on generative AI —',
        'diffusion models, text-to-image and text-to-video, multimodal systems. Past jobs:',
        'Reality Defender (deepfake detection), NLPearl (compact LLMs, audio),',
        'Pashoot Robotics (robot vision), LuckyLab (edge CV). Projects: ES-EGGROLL,',
        'PopYou2 (VAR Funko Pop generator), SANA-Video LoRA, Kokoro TTS, KoalaReadingAI.',
        'This site\'s hero trains a VAE on MNIST live in the browser.',
        'Contact: amit1541541@gmail.com.',
        'Rules: plain text only, 1-3 short sentences, friendly and playful. Only discuss',
        'Amit, this site, or machine learning. Never invent facts; if unsure, say you are',
        'only 230M parameters and suggest emailing the real Amit.'
    ].join('\n');

    /* one-shot example — anchors tiny models far better than instructions do */
    const SEED = [
        { role: 'user', content: 'What does Amit do?' },
        {
            role: 'assistant',
            content: 'Amit is an AI Research Scientist at Wix, working on diffusion models ' +
                'and multimodal generative AI. Before Wix he was at Reality Defender, NLPearl, ' +
                'and Pashoot Robotics. Want details on any of those?'
        }
    ];

    let generator = null, TextStreamer = null;
    let device = null;
    let history = [];            // [{role, content}] — system prepended at call time
    let busy = false, loading = false, talked = false;

    function addMsg(cls, text) {
        const el = document.createElement('div');
        el.className = 'slm-msg ' + cls;
        el.textContent = text;
        chatEl.appendChild(el);
        chatEl.scrollTop = chatEl.scrollHeight;
        return el;
    }

    function setStatus(text) { if (statusEl) statusEl.textContent = text; }

    /* ---- model loading with aggregate download progress ---- */
    async function load() {
        if (loading || generator) return;
        loading = true;
        loadBtn.disabled = true;
        progWrap.hidden = false;
        overlay.classList.add('hidden');
        PG.track('slm_load_start');

        const files = new Map();     // file -> {loaded, total}
        const onProgress = p => {
            if (p.status === 'progress' && p.total) {
                files.set(p.file, { loaded: p.loaded, total: p.total });
                let loaded = 0, total = 0;
                files.forEach(f => { loaded += f.loaded; total += f.total; });
                const pct = total ? Math.min(100, 100 * loaded / total) : 0;
                progBar.style.width = pct.toFixed(1) + '%';
                progText.textContent =
                    `downloading weights — ${(loaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB`;
            } else if (p.status === 'ready') {
                progText.textContent = 'compiling the graph…';
            }
        };

        try {
            progText.textContent = 'fetching transformers.js…';
            const tjs = await import(TJS);
            TextStreamer = tjs.TextStreamer;
            device = ('gpu' in navigator) ? 'webgpu' : 'wasm';
            try {
                generator = await tjs.pipeline('text-generation', MODEL,
                    { device, dtype: 'q4', progress_callback: onProgress });
            } catch (err) {
                if (device !== 'webgpu') throw err;
                // WebGPU exists but failed (driver/adapter) — fall back to CPU
                device = 'wasm';
                progText.textContent = 'WebGPU refused — retrying on CPU…';
                generator = await tjs.pipeline('text-generation', MODEL,
                    { device, dtype: 'q4', progress_callback: onProgress });
            }
            progWrap.hidden = true;
            input.disabled = false;
            sendBtn.disabled = false;
            input.placeholder = 'ask about Amit, this site, or ML…';
            setStatus(`LFM2.5-230M · ${device} · on-device` +
                (device === 'wasm' ? ' · CPU mode, expect a thoughtful pace' : ''));
            addMsg('sys', `model awake on ${device} — 230M parameters at your service`);
            addMsg('bot', 'Hi! I\'m Tiny Amit — a very small model with a very short note about the real Amit. Ask me anything.');
            input.focus();
            PG.track('slm_load_done', { device });
        } catch (err) {
            console.error('SLM load failed:', err);
            progWrap.hidden = true;
            overlay.classList.remove('hidden');
            loadBtn.disabled = false;
            loadBtn.textContent = '↻ Retry · ~210 MB';
            setStatus('load failed — network or browser support; try Chrome/Edge');
            loading = false;
        }
    }

    /* ---- chat ---- */
    async function send(text) {
        busy = true;
        input.disabled = true;
        sendBtn.disabled = true;
        addMsg('user', text);
        history.push({ role: 'user', content: text });
        if (history.length > 8) history = history.slice(-8);

        const bubble = addMsg('bot thinking', '');
        let streamed = '';
        const tidy = s => s.replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
        const streamer = new TextStreamer(generator.tokenizer, {
            skip_prompt: true,
            skip_special_tokens: true,
            callback_function: t => {
                streamed += t;
                bubble.textContent = tidy(streamed);
                chatEl.scrollTop = chatEl.scrollHeight;
            }
        });

        try {
            // LFM2.5's Jinja chat template uses {% generation %} tags that
            // transformers.js can't parse yet — build the ChatML prompt by
            // hand instead. The tokenizer adds <|startoftext|> on its own.
            const prompt = `<|im_start|>system\n${SYSTEM}<|im_end|>\n` +
                [...SEED, ...history].map(m => `<|im_start|>${m.role}\n${m.content}<|im_end|>\n`).join('') +
                '<|im_start|>assistant\n';
            const out = await generator(prompt, {
                max_new_tokens: 120,
                do_sample: true,
                temperature: 0.2,
                top_p: 0.9,
                repetition_penalty: 1.3,
                return_full_text: false,
                streamer
            });
            const gen = out[0].generated_text;
            const reply = tidy(streamed || (typeof gen === 'string' ? gen : '')).trim();
            bubble.textContent = reply || '…I generated pure silence. Impressive, honestly.';
            history.push({ role: 'assistant', content: bubble.textContent });
            if (!talked) {
                talked = true;
                PG.award('slmTalk');
                PG.track('slm_first_reply');
            }
        } catch (err) {
            console.error('SLM generate failed:', err);
            bubble.textContent = '⚠ generation failed — my 230M parameters need a moment. Try again?';
        }
        bubble.classList.remove('thinking');
        busy = false;
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
    }

    loadBtn.addEventListener('click', load);
    form.addEventListener('submit', e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text || busy || !generator) return;
        input.value = '';
        send(text);
    });
})();

/* ===================================================================
   FEATURE: LAZY VIDEOS
   Every [data-lazy-video] ships as poster + preload="none", so nothing
   downloads until it scrolls into view. Plays while visible, pauses off
   screen and on hidden tabs. Reduced motion gets manual controls and
   never auto-downloads. Covers the Maple LLM clip, CelebrityLook, and
   the koala reader.
   ==================================================================*/
(() => {
    const videos = document.querySelectorAll('[data-lazy-video]');
    if (!videos.length) return;

    const tracked = el => el.hasAttribute('data-maple-video') ? 'maple_video_play' : null;

    if (PG.reduced()) {
        videos.forEach(v => { v.controls = true; });
        return;
    }

    const io = new IntersectionObserver(entries => {
        entries.forEach(en => {
            const v = en.target;
            if (en.isIntersecting && !document.hidden) {
                v.play().then(() => {
                    if (!v.dataset.played) {
                        v.dataset.played = '1';
                        const ev = tracked(v);
                        if (ev) PG.track(ev);
                    }
                }).catch(() => { v.controls = true; io.unobserve(v); });
            } else {
                v.pause();
            }
        });
    }, { threshold: 0.25 });
    videos.forEach(v => io.observe(v));

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) videos.forEach(v => v.pause());
    });

    PG.onMotionChange(reducedNow => {
        if (reducedNow) {
            videos.forEach(v => { v.pause(); v.controls = true; io.unobserve(v); });
        }
    });
})();

/* ===================================================================
   FEATURE: TIME MACHINE
   Browse the real history of this site. Each stop fetches that commit's
   index.html from jsDelivr (which serves any file from a public repo at a
   given sha) and renders it in a sandboxed iframe with a <base> pointing
   at the same commit — so every version loads with its own CSS, its own
   assets, its own JavaScript, exactly as it was.

   Three things have to be handled for old versions to render honestly:
     - jsDelivr serves .html as text/plain, so it cannot be framed by URL.
       We fetch it (CORS is open) and inject via srcdoc.
     - From Apr 2026 on, `.reveal { opacity: 0 }` and JS does the revealing.
       A sandboxed iframe has an opaque origin, so localStorage throws and
       can kill those scripts mid-way. We shim storage and force .reveal
       visible so no version can render as a blank page.
     - Old versions carry analytics. A CSP meta blocks every host except
       the repo CDN, so browsing the museum never fires a real pageview.
   ==================================================================*/
(() => {
    const btn = document.getElementById('timeMachineBtn');
    const overlay = document.getElementById('tmOverlay');
    if (!btn || !overlay) return;

    const REPO = 'amit154154/amit154154.github.io';
    const cdn = sha => `https://cdn.jsdelivr.net/gh/${REPO}@${sha}/`;

    const VERSIONS = [
        { sha: '14c4991', full: '14c49919e5d46cbea6ffac349427732a3d0389da', when: 'Nov 2024', name: "The first one", note: "One column, white background, seven cards. No dark mode, no nav, no JavaScript to speak of." },
        { sha: 'dd2f59f', full: 'dd2f59f072799fc939c0d40837257ad2e9fda7f3', when: 'Mar 2025', name: "Cartoon era", note: "A hand-drawn Silicon Valley banner takes over the header, and the experience section grows up." },
        { sha: 'ea79e4a', full: 'ea79e4a7ebeb6228dc53b1144d68b6d0b5d9f6e3', when: 'Aug 2025', name: "The dark rewrite", note: "Rebuilt from scratch: dark theme, a real nav, two-column hero, and a theme toggle." },
        { sha: '3996ecd', full: '3996ecd39342eb17fe78065cba0b7f9bbc692534', when: 'Nov 2025', name: "Reading list", note: "A live Zotero feed of papers being read, and a deliberately more professional tone." },
        { sha: 'feafc4c', full: 'feafc4c08266573541b29f9077a2b8e86755c216', when: 'Dec 2025', name: "Research, featured", note: "ES-EGGROLL gets a featured slot with a benchmark table and a drag-to-compare gallery." },
        { sha: 'c01139c', full: 'c01139cf1cce721fc43224641e779b6c0bc461d0', when: 'Apr 2026', name: "Wix, and a new identity", note: "New title, new headline, tighter typography. The biggest single rewrite in the history." },
        { sha: '96e59c4', full: '96e59c428f4b2a4007cf15d90f996ab1474afd42', when: 'Jun 2026', name: "The playground", note: "Games arrive: gradient descent you play by hand, a real-or-generated quiz, achievements, a koala." },
        { sha: '5b04ddb', full: '5b04ddb9322d0ae3954889c6ecd3f17ff6e1c198', when: 'Aug 2026', name: "Now", note: "A conditional VAE trains on MNIST in the hero, a 230M model chats in the playground, and first load dropped from 23.5 MB to 0.7 MB." }
    ];

    const stage = document.getElementById('tmStage');
    const wrap = document.getElementById('tmFrameWrap');
    const poster = document.getElementById('tmPoster');
    const loading = document.getElementById('tmLoading');
    const meta = document.getElementById('tmMeta');
    const rail = document.getElementById('tmRail');
    const commitLink = document.getElementById('tmCommit');

    let index = VERSIONS.length - 1;
    let open = false, frame = null, token = 0;
    const cache = new Map();

    /* ---- build the thumbnail rail ---- */
    VERSIONS.forEach((v, i) => {
        const b = document.createElement('button');
        b.className = 'tm-stop';
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.innerHTML =
            `<img src="assets/timemachine/${v.sha}.webp" alt="" loading="lazy" decoding="async"/>` +
            `<span class="tm-stop-label">${v.when}` +
            `<span class="tm-stop-note">${v.name}</span></span>`;
        b.addEventListener('click', () => show(i));
        rail.appendChild(b);
        v.el = b;
    });

    /* ---- fit a 1280px-wide page into the stage ---- */
    function fit() {
        if (!frame) return;
        const r = stage.getBoundingClientRect();
        const scale = r.width / 1280;
        frame.style.transform = `scale(${scale})`;
        frame.style.height = Math.ceil(r.height / scale) + 'px';
    }
    new ResizeObserver(fit).observe(stage);

    /* ---- prepare one version's HTML for honest, quiet rendering ---- */
    function prepare(html, sha) {
        const base = cdn(sha);
        // Block every host except the repo CDN (and fonts) so old analytics
        // tags cannot fire while someone browses the museum.
        const csp = "default-src 'none'; " +
            `script-src 'unsafe-inline' 'unsafe-eval' ${base} ` +
            'https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; ' +
            `style-src 'unsafe-inline' ${base} https://fonts.googleapis.com; ` +
            `font-src ${base} https://fonts.gstatic.com data:; ` +
            `img-src ${base} data: blob: https://img.shields.io; ` +
            `media-src ${base} data: blob:; ` +
            `connect-src ${base} https://api.zotero.org; ` +
            `worker-src ${base} blob:; child-src ${base} blob:; ` +
            "frame-src 'none'; object-src 'none'; form-action 'none';";

        const shim = [
            '(function(){',
            '  var mem = {};',
            '  var s = {',
            '    getItem: function(k){ return k in mem ? mem[k] : null; },',
            '    setItem: function(k,v){ mem[k] = String(v); },',
            '    removeItem: function(k){ delete mem[k]; },',
            '    clear: function(){ mem = {}; }, key: function(){ return null; },',
            '    get length(){ return Object.keys(mem).length; }',
            '  };',
            '  ["localStorage","sessionStorage"].forEach(function(n){',
            '    try { window[n].getItem("x"); }',
            '    catch (e) { try { Object.defineProperty(window,n,{value:s,configurable:true}); } catch(_){} }',
            '  });',
            '  window.gtag = window.gtag || function(){};',
            '  window.dataLayer = window.dataLayer || [];',
            '  window.clarity = window.clarity || function(){};',
            '})();'
        ].join('\n');

        const head =
            `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
            `<base href="${base}">` +
            '<script>' + shim + '<\/script>';

        // Some versions wrote root-relative paths ("/assets/...") in their JS.
        // <base> does not rewrite those — they resolve against the CDN origin
        // and 404 — so point them at this commit's tree explicitly.
        html = html.replace(/(["'(])\/(assets\/)/g, (m, q, p) => q + base + p);

        // Drop third-party script tags before injecting. The CSP above would
        // block them anyway, but a blocked request logs a console error for
        // every version you visit; removing them keeps the console clean and
        // leaves the policy as a backstop.
        const THIRD_PARTY = /googletagmanager\.com|clarity\.ms|google-analytics\.com/;
        html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi,
            (m, src) => THIRD_PARTY.test(src) ? '' : m);
        html = html.replace(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi,
            (m, body) => THIRD_PARTY.test(body) ? '' : m);

        if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/<head([^>]*)>/i, (m, a) => `<head${a}>${head}`);
        } else {
            html = head + html;
        }

        // Later versions hide content until JS reveals it. GSAP comes from a
        // CDN the policy above blocks, so guarantee visibility instead of
        // gambling on it.
        const guarantee =
            '<style>.reveal,.xp,.project-card,.featured-card{opacity:1!important;transform:none!important}' +
            'html{scroll-behavior:auto!important}</style>';
        html = /<\/body>/i.test(html)
            ? html.replace(/<\/body>/i, guarantee + '</body>')
            : html + guarantee;
        return html;
    }

    async function load(v, myToken) {
        let html = cache.get(v.sha);
        if (!html) {
            const res = await fetch(cdn(v.sha) + 'index.html', { mode: 'cors' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            html = prepare(await res.text(), v.sha);
            cache.set(v.sha, html);
        }
        if (myToken !== token) return;            // a newer request won

        const f = document.createElement('iframe');
        f.setAttribute('sandbox', 'allow-scripts');
        f.setAttribute('title', `The site as it was in ${v.when}`);
        f.srcdoc = html;
        f.addEventListener('load', () => {
            if (myToken !== token) return;
            f.classList.add('ready');
            poster.classList.add('hidden');
            loading.classList.add('hidden');
        }, { once: true });
        wrap.replaceChildren(f);
        frame = f;
        fit();
    }

    function show(i) {
        index = (i + VERSIONS.length) % VERSIONS.length;
        const v = VERSIONS[index];
        token++;
        const myToken = token;

        VERSIONS.forEach(o => {
            o.el.classList.toggle('active', o === v);
            o.el.setAttribute('aria-selected', o === v ? 'true' : 'false');
        });
        v.el.scrollIntoView({ block: 'nearest', inline: 'center',
                              behavior: PG.reduced() ? 'auto' : 'smooth' });

        poster.src = `assets/timemachine/${v.sha}.webp`;
        poster.classList.remove('hidden');
        loading.classList.remove('hidden');
        loading.textContent = 'rewinding…';
        meta.innerHTML = `<b>${v.when} · ${v.name}</b> — ${v.note}`;
        commitLink.href = `https://github.com/${REPO}/commit/${v.full}`;
        wrap.replaceChildren();
        frame = null;

        load(v, myToken).catch(() => {
            if (myToken !== token) return;
            loading.classList.remove('hidden');
            loading.textContent = 'could not reach the archive — try again';
        });

        PG.track('time_machine_view', { event_label: v.sha });
        if (index === 0) PG.award('archaeologist');
    }

    function openTM() {
        if (open) return;
        open = true;
        overlay.hidden = false;
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
        // don't leave a second VAE training behind the overlay
        document.dispatchEvent(new CustomEvent('pg:pause-hero', { detail: { paused: true } }));
        show(index);
        document.getElementById('tmClose').focus();
        PG.track('time_machine_open');
    }

    function closeTM() {
        if (!open) return;
        open = false;
        token++;
        overlay.classList.remove('open');
        overlay.hidden = true;
        document.body.style.overflow = '';
        wrap.replaceChildren();
        frame = null;
        document.dispatchEvent(new CustomEvent('pg:pause-hero', { detail: { paused: false } }));
        btn.focus();
    }

    btn.addEventListener('click', openTM);
    document.getElementById('tmClose').addEventListener('click', closeTM);
    document.getElementById('tmPrev').addEventListener('click', () => show(index - 1));
    document.getElementById('tmNext').addEventListener('click', () => show(index + 1));
    overlay.addEventListener('click', e => { if (e.target === overlay) closeTM(); });
    document.addEventListener('keydown', e => {
        if (!open) return;
        if (e.key === 'Escape') { e.preventDefault(); closeTM(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); show(index - 1); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); show(index + 1); }
    });

    // deep link: #timemachine, or #timemachine=<sha>
    function fromHash() {
        const m = /^#timemachine(?:=([0-9a-f]{7,40}))?$/.exec(location.hash);
        if (!m) return;
        const i = m[1] ? VERSIONS.findIndex(v => v.full.startsWith(m[1])) : -1;
        if (i >= 0) index = i;
        openTM();
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();
})();
