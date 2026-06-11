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

    /* ---- toast system ---- */
    let toastWrap = null;
    function toast(opts) {
        if (!toastWrap) {
            toastWrap = document.createElement('div');
            toastWrap.className = 'pg-toasts';
            toastWrap.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastWrap);
        }
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
        heroPulse:   { icon: '⚡', name: 'First Spark',       desc: 'Ran a forward pass through the hero network.',      hint: 'The network in the hero is not a screenshot.' },
        gdConverge:  { icon: '🎯', name: 'Converged!',         desc: 'Guided the optimizer to the global minimum.',       hint: 'Descend all the way, in the Playground cards.' },
        gdDiverge:   { icon: '💥', name: 'Diverged',           desc: 'Sent the loss to NaN. Beautiful.',                  hint: 'What happens at learning rate ≈ 2?' },
        rgDone:      { icon: '🧪', name: 'Turing Tested',      desc: 'Finished a full round of Real or Generated.',       hint: 'Judge twelve paper titles.' },
        rgFooled:    { icon: '🤖', name: 'Fooled by AI',       desc: 'Called a machine-made paper title real.',           hint: 'The generator only needs to fool you once.' },
        rgSharp:     { icon: '🦅', name: 'Sharp Eye',          desc: 'Hit a streak of 8 in Real or Generated.',           hint: 'Eight correct calls in a row.' },
        terminal:    { icon: '⌨️', name: 'Shell, Yeah',        desc: 'Found the hidden terminal.',                        hint: 'A key shaped like a wave: ~' },
        rootAccess:  { icon: '🔓', name: 'Root Access',        desc: 'sudo make_cooler. It worked.',                      hint: 'Some shell commands need sudo.' },
        konami:      { icon: '🌀', name: 'Overfitted',         desc: 'Memorized the training data. All of it.',           hint: '↑ ↑ ↓ ↓ … you know the rest.' },
        regularized: { icon: '🧊', name: 'Regularized',        desc: 'Applied weight decay and restored generalization.', hint: 'Clean up after an overfit.' },
        attention:   { icon: '👁️', name: 'Attention, Please',  desc: 'Visualized attention over the headline.',           hint: 'Hold your cursor on the big headline.' },
        koala5:      { icon: '🐨', name: 'Koala Whisperer',    desc: 'Clicked the koala five times. It noticed.',         hint: 'The koala likes attention. Persistently.' }
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
                    <img class="pg-hub-koala" src="assets/cursor_192.png" alt="" width="56" height="56"/>
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
            if (e.key === 'Escape' && hub.classList.contains('open')) closeHub();
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
        makeLoop, toast, award, hasAward, openHub, burst,
        achievementCount: () => ACH_KEYS.length
    };
})();

/* ===================================================================
   FEATURE: HERO NEURAL PLAYGROUND
   A small MLP that lives behind glass in the hero. Cursor excites
   nodes, click/Enter fires a forward pass; epochs tick the loss down.
   ==================================================================*/
(() => {
    const host = document.getElementById('heroNet');
    const canvas = document.getElementById('heroNetCanvas');
    if (!host || !canvas) return;
    const statEl = document.getElementById('heroNetStat');
    const hintEl = document.getElementById('heroNetHint');
    const ctx = canvas.getContext('2d');
    const heroSection = host.closest('.hero') || host;

    const LAYERS = [4, 6, 7, 6, 3];
    let nodes = [], edges = [], byLayer = [];
    let W = 0, H = 0, dpr = 1;
    const pointer = { x: -9e3, y: -9e3 };
    let pulses = [], rings = [];
    let epochs = 0, shownLoss = 2.3026, targetLoss = 2.3026;
    let lastAmbient = 0, lastHud = 0, hinted = false;
    let C = PG.colors();
    let live = false;

    function build() {
        nodes = []; edges = []; byLayer = [];
        const mx = W * .09, my = H * .12;
        LAYERS.forEach((count, li) => {
            const layer = [];
            const x = mx + (W - 2 * mx) * (li / (LAYERS.length - 1));
            for (let i = 0; i < count; i++) {
                const y = my + (H - 2 * my) * (count === 1 ? .5 : i / (count - 1));
                const node = {
                    hx: x + (Math.random() - .5) * 10,
                    hy: y + (Math.random() - .5) * 12,
                    dx: 0, dy: 0,            // spring displacement
                    a: 0,                     // activation 0..1
                    phase: Math.random() * Math.PI * 2,
                    speed: .0004 + Math.random() * .0005,
                    amp: 2.5 + Math.random() * 3,
                    layer: li, out: []
                };
                layer.push(node);
                nodes.push(node);
            }
            byLayer.push(layer);
        });
        // connect each node to its 2-3 nearest in the next layer
        for (let li = 0; li < byLayer.length - 1; li++) {
            const next = byLayer[li + 1];
            byLayer[li].forEach(a => {
                const sorted = [...next].sort((p, q) =>
                    Math.abs(p.hy - a.hy) - Math.abs(q.hy - a.hy));
                // small output layers get fewer incoming edges — keeps the head untangled
                const k = next.length <= 3 ? 1 : 2 + ((Math.random() * 2) | 0);
                sorted.slice(0, k).forEach(b => {
                    const e = { a, b };
                    a.out.push(e);
                    edges.push(e);
                });
            });
            // ensure every next-layer node has at least one incoming edge
            next.forEach(b => {
                if (!edges.some(e => e.b === b)) {
                    const a = byLayer[li][(Math.random() * byLayer[li].length) | 0];
                    const e = { a, b };
                    a.out.push(e);
                    edges.push(e);
                }
            });
        }
    }

    function resize() {
        const r = host.getBoundingClientRect();
        if (!r.width || !r.height) return;
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = r.width; H = r.height;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        build();
        if (!live) drawFrame(performance.now());
    }

    function computePositions(t) {
        nodes.forEach(n => {
            n.px = n.hx + Math.cos(t * n.speed + n.phase) * n.amp + n.dx;
            n.py = n.hy + Math.sin(t * n.speed * 1.3 + n.phase) * n.amp + n.dy;
        });
    }

    function firePulse(originNode, gain, countEpoch) {
        const origin = originNode ||
            byLayer[0][(Math.random() * byLayer[0].length) | 0];
        origin.a = Math.max(origin.a, gain);
        origin.out.forEach(e => pulses.push({ e, t0: performance.now(), dur: 260, gain }));
        if (countEpoch) {
            epochs++;
            targetLoss = 2.3026 * Math.exp(-epochs / 7) + .0231;
            if (!hinted && hintEl) { hintEl.style.opacity = '0'; hinted = true; }
            PG.award('heroPulse');
            if (epochs === 1) PG.track('hero_net_first_pulse');
        }
    }

    function drawFrame(t) {
        ctx.clearRect(0, 0, W, H);
        const lightTheme = C.light;
        const baseEdgeAlpha = lightTheme ? .18 : .10;
        computePositions(t);

        // edges
        ctx.lineWidth = 1;
        edges.forEach(e => {
            const heat = Math.min(1, e.a.a * e.b.a * 3 + Math.max(e.a.a, e.b.a) * .25);
            ctx.globalAlpha = baseEdgeAlpha + heat * .55;
            ctx.strokeStyle = heat > .45 ? C.accent2 : C.accent;
            ctx.beginPath();
            ctx.moveTo(e.a.px, e.a.py);
            ctx.lineTo(e.b.px, e.b.py);
            ctx.stroke();
        });

        // traveling pulses
        const now = t;
        pulses = pulses.filter(p => {
            const k = (now - p.t0) / p.dur;
            if (k >= 1) {
                p.e.b.a = Math.max(p.e.b.a, p.gain);
                if (p.gain > .12) {
                    p.e.b.out.forEach(out =>
                        pulses.push({ e: out, t0: now, dur: 260, gain: p.gain * .82 }));
                }
                return false;
            }
            const x = p.e.a.px + (p.e.b.px - p.e.a.px) * k;
            const y = p.e.a.py + (p.e.b.py - p.e.a.py) * k;
            ctx.globalAlpha = .9 * p.gain;
            ctx.fillStyle = C.accent2;
            ctx.beginPath();
            ctx.arc(x, y, 2.6, 0, Math.PI * 2);
            ctx.fill();
            return true;
        });

        // nodes
        nodes.forEach(n => {
            const r = 2.4 + n.a * 3;
            ctx.globalAlpha = (lightTheme ? .5 : .45) + n.a * .55;
            ctx.fillStyle = n.a > .35 ? C.accent2 : C.accent;
            ctx.beginPath();
            ctx.arc(n.px, n.py, r, 0, Math.PI * 2);
            ctx.fill();
            if (n.a > .5) {
                ctx.globalAlpha = n.a * .25;
                ctx.beginPath();
                ctx.arc(n.px, n.py, r * 2.4, 0, Math.PI * 2);
                ctx.fill();
            }
        });

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
            return true;
        });
        ctx.globalAlpha = 1;
    }

    function tick(t) {
        // physics
        nodes.forEach(n => {
            const px = n.hx + n.dx, py = n.hy + n.dy;
            const ddx = pointer.x - px, ddy = pointer.y - py;
            const d = Math.hypot(ddx, ddy);
            let tx = 0, ty = 0;
            if (d < 130 && d > 0.001) {
                const f = (1 - d / 130) ** 2 * 22;
                tx = ddx / d * f;
                ty = ddy / d * f;
                n.a = Math.max(n.a, (1 - d / 130) * .9);
            }
            n.dx += (tx - n.dx) * .085;
            n.dy += (ty - n.dy) * .085;
            n.a *= .955;
        });

        // ambient forward pass: the model "thinks" on its own, gently
        if (t - lastAmbient > 4200) {
            lastAmbient = t + Math.random() * 1500;
            firePulse(null, .3, false);
        }

        // HUD
        if (t - lastHud > 180 && statEl) {
            lastHud = t;
            shownLoss += (targetLoss - shownLoss) * .2;
            const noisy = shownLoss + (Math.random() - .5) * shownLoss * .02;
            statEl.textContent =
                `epoch ${String(epochs).padStart(3, '0')} · loss ${noisy.toFixed(4)}`;
        }

        drawFrame(t);
    }

    function pointerToLocal(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function startLive() {
        if (live) return;
        live = true;
        heroSection.addEventListener('pointermove', e => {
            const p = pointerToLocal(e);
            pointer.x = p.x; pointer.y = p.y;
        }, { passive: true });
        heroSection.addEventListener('pointerleave', () => {
            pointer.x = -9e3; pointer.y = -9e3;
        });
        canvas.addEventListener('pointerdown', e => {
            const p = pointerToLocal(e);
            rings.push({ x: p.x, y: p.y, t0: performance.now() });
            // fire from the input node nearest the press
            let best = byLayer[0][0], bd = 1e9;
            byLayer[0].forEach(n => {
                const d = Math.abs(n.hy - p.y);
                if (d < bd) { bd = d; best = n; }
            });
            firePulse(best, 1, true);
        });
        host.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                rings.push({ x: W / 2, y: H / 2, t0: performance.now() });
                firePulse(null, 1, true);
            }
        });
        loop = PG.makeLoop(host, tick);
        loop.start();
    }

    function staticFrame() {
        // reduced motion: a single calm render, no loop, no handlers
        nodes.forEach(n => { n.amp = 0; n.a = 0; });
        byLayer[2]?.forEach(n => { n.a = .4; });
        drawFrame(0);
        nodes.forEach(n => { n.a = 0; });
        if (statEl) statEl.textContent = 'epoch 000 · loss 2.3026 · paused';
        if (hintEl) hintEl.style.opacity = '0';
    }

    let loop = null;
    PG.onTheme(c => {
        C = c;
        if (!live) staticFrameSafe();
    });
    function staticFrameSafe() { if (PG.reduced()) staticFrame(); }

    new ResizeObserver(() => resize()).observe(host);
    resize();

    if (PG.reduced()) {
        staticFrame();
        PG.onMotionChange(m => { if (!m) startLive(); });
    } else {
        startLive();
    }
})();