/* ===================================================================
   MNIST WORKER — real training, no libraries.
   A conditional VAE (196 → 64 → z8 → 64 → 196, ~28k params) trained
   with hand-written backprop + Adam on 4,000 real MNIST digits
   (14×14, shipped as a PNG sprite; label = index % 10).
   The hero panel renders whatever this worker reports: every loss
   value, activation and generated pixel comes from actual math.
   ==================================================================*/
'use strict';

const PIX = 196, NCLS = 10, XDIM = PIX + NCLS;   // 206
const H = 64, ZDIM = 8, ZYDIM = ZDIM + NCLS;     // 18
const BATCH = 32;
const MAX_STEPS = 12000;
const LR = 2e-3, B1 = 0.9, B2 = 0.999, EPS = 1e-8;
const KL_WARMUP = 1500;            // steps until beta reaches 1
const SNAP_MS = 140;               // snapshot cadence
const SAVE_EVERY = 2500;           // autosave weights cadence (steps)

/* ---- parameters, flat layout (order matters for save/restore) ---- */
const SHAPES = [
    ['W1', H * XDIM], ['b1', H],          // enc: xy -> h1
    ['W2', ZDIM * H], ['b2', ZDIM],       // h1 -> mu
    ['W3', ZDIM * H], ['b3', ZDIM],       // h1 -> logvar
    ['W4', H * ZYDIM], ['b4', H],         // dec: zy -> h2
    ['W5', PIX * H], ['b5', PIX]          // h2 -> logits
];
const NPARAM = SHAPES.reduce((s, [, n]) => s + n, 0);
const theta = new Float32Array(NPARAM);
const grad = new Float32Array(NPARAM);
const adamM = new Float32Array(NPARAM);
const adamV = new Float32Array(NPARAM);
const P = {};                       // named views into theta/grad
{
    let off = 0;
    for (const [name, n] of SHAPES) {
        P[name] = { w: theta.subarray(off, off + n), g: grad.subarray(off, off + n) };
        off += n;
    }
}

/* ---- state ---- */
let data = null;                    // Float32Array(4000 * PIX), values 0..1
let nData = 0;
let step = 0, adamT = 0;
let lossEMA = 0.6931, emaInit = false;
let running = false, done = false;
let order = null, cursor = 0;       // epoch shuffle
let lastSnap = 0, lastSave = 0;
const hist = [];                    // downsampled loss curve
let histStride = 25, histCount = 0;

/* fixed per-class latents so the sample strip evolves smoothly */
const classZ = new Float32Array(NCLS * ZDIM);

/* ---- rng ---- */
let g2 = null;
function gauss() {
    if (g2 !== null) { const v = g2; g2 = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    v = Math.random();
    const r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * v;
    g2 = r * Math.sin(a);
    return r * Math.cos(a);
}

function initWeights() {
    const he = (w, fanIn) => { const s = Math.sqrt(2 / fanIn); for (let i = 0; i < w.length; i++) w[i] = gauss() * s; };
    const xa = (w, fanIn) => { const s = Math.sqrt(1 / fanIn); for (let i = 0; i < w.length; i++) w[i] = gauss() * s; };
    he(P.W1.w, XDIM); he(P.W4.w, ZYDIM);
    xa(P.W2.w, H); xa(P.W3.w, H); xa(P.W5.w, H);
    for (let c = 0; c < NCLS * ZDIM; c++) classZ[c] = gauss() * 0.4;
}

/* ---- forward/backward scratch ---- */
const xy = new Float32Array(XDIM);
const h1 = new Float32Array(H);
const mu = new Float32Array(ZDIM), lv = new Float32Array(ZDIM), zeps = new Float32Array(ZDIM);
const zy = new Float32Array(ZYDIM);
const h2 = new Float32Array(H);
const logits = new Float32Array(PIX), prob = new Float32Array(PIX);
const dlogits = new Float32Array(PIX), dh2 = new Float32Array(H), dzy = new Float32Array(ZYDIM);
const dmu = new Float32Array(ZDIM), dlv = new Float32Array(ZDIM), dh1 = new Float32Array(H);

function matvec(W, x, nOut, nIn, out) {
    for (let o = 0; o < nOut; o++) {
        let s = 0;
        const row = o * nIn;
        for (let i = 0; i < nIn; i++) s += W[row + i] * x[i];
        out[o] = s;
    }
}

/* decoder only — used for the generated-sample strip */
function decode(z, label, out) {
    zy.fill(0);
    for (let j = 0; j < ZDIM; j++) zy[j] = z[j];
    zy[ZDIM + label] = 1;
    matvec(P.W4.w, zy, H, ZYDIM, h2);
    for (let o = 0; o < H; o++) { h2[o] += P.b4.w[o]; if (h2[o] < 0) h2[o] = 0; }
    matvec(P.W5.w, h2, PIX, H, logits);
    for (let o = 0; o < PIX; o++) out[o] = 255 / (1 + Math.exp(-(logits[o] + P.b5.w[o])));
}

/* one full training example: forward, loss, backward (accumulate grads) */
let lastExampleIdx = 0;
function example(idx, beta) {
    const base = idx * PIX, label = idx % NCLS;
    lastExampleIdx = idx;

    xy.fill(0);
    for (let i = 0; i < PIX; i++) xy[i] = data[base + i];
    xy[PIX + label] = 1;

    // ---- forward ----
    matvec(P.W1.w, xy, H, XDIM, h1);
    for (let o = 0; o < H; o++) { h1[o] += P.b1.w[o]; if (h1[o] < 0) h1[o] = 0; }
    matvec(P.W2.w, h1, ZDIM, H, mu);
    matvec(P.W3.w, h1, ZDIM, H, lv);
    zy.fill(0);
    for (let j = 0; j < ZDIM; j++) {
        mu[j] += P.b2.w[j];
        let l = lv[j] + P.b3.w[j];
        if (l > 6) l = 6; else if (l < -6) l = -6;
        lv[j] = l;
        zeps[j] = gauss();
        zy[j] = mu[j] + Math.exp(l / 2) * zeps[j];
    }
    zy[ZDIM + label] = 1;
    matvec(P.W4.w, zy, H, ZYDIM, h2);
    for (let o = 0; o < H; o++) { h2[o] += P.b4.w[o]; if (h2[o] < 0) h2[o] = 0; }
    matvec(P.W5.w, h2, PIX, H, logits);

    // ---- loss ----
    let bce = 0, kl = 0;
    for (let o = 0; o < PIX; o++) {
        const l = logits[o] + P.b5.w[o];
        logits[o] = l;
        prob[o] = 1 / (1 + Math.exp(-l));
        const x = data[base + o];
        // numerically stable BCE-with-logits
        bce += Math.max(l, 0) - l * x + Math.log(1 + Math.exp(-Math.abs(l)));
        dlogits[o] = prob[o] - x;
    }
    for (let j = 0; j < ZDIM; j++) kl += 0.5 * (Math.exp(lv[j]) + mu[j] * mu[j] - 1 - lv[j]);

    // ---- backward ----
    // W5/b5, dh2
    dh2.fill(0);
    for (let o = 0; o < PIX; o++) {
        const d = dlogits[o], row = o * H;
        P.b5.g[o] += d;
        for (let i = 0; i < H; i++) {
            P.W5.g[row + i] += d * h2[i];
            dh2[i] += P.W5.w[row + i] * d;
        }
    }
    for (let i = 0; i < H; i++) if (h2[i] <= 0) dh2[i] = 0;
    // W4/b4, dzy
    dzy.fill(0);
    for (let o = 0; o < H; o++) {
        const d = dh2[o], row = o * ZYDIM;
        if (d === 0) continue;
        P.b4.g[o] += d;
        for (let i = 0; i < ZYDIM; i++) {
            P.W4.g[row + i] += d * zy[i];
            dzy[i] += P.W4.w[row + i] * d;
        }
    }
    // reparameterization + KL
    for (let j = 0; j < ZDIM; j++) {
        const dz = dzy[j];
        dmu[j] = dz + beta * mu[j];
        dlv[j] = dz * zeps[j] * 0.5 * Math.exp(lv[j] / 2) + beta * 0.5 * (Math.exp(lv[j]) - 1);
    }
    // W2/W3, dh1
    dh1.fill(0);
    for (let o = 0; o < ZDIM; o++) {
        const dm = dmu[o], dl = dlv[o], row = o * H;
        P.b2.g[o] += dm; P.b3.g[o] += dl;
        for (let i = 0; i < H; i++) {
            P.W2.g[row + i] += dm * h1[i];
            P.W3.g[row + i] += dl * h1[i];
            dh1[i] += P.W2.w[row + i] * dm + P.W3.w[row + i] * dl;
        }
    }
    for (let i = 0; i < H; i++) if (h1[i] <= 0) dh1[i] = 0;
    // W1/b1
    for (let o = 0; o < H; o++) {
        const d = dh1[o], row = o * XDIM;
        if (d === 0) continue;
        P.b1.g[o] += d;
        for (let i = 0; i < XDIM; i++) P.W1.g[row + i] += d * xy[i];
    }

    return bce + beta * kl;
}

function trainStep() {
    if (cursor + BATCH > nData) {           // reshuffle each epoch
        for (let i = nData - 1; i > 0; i--) {
            const j = (Math.random() * (i + 1)) | 0;
            const t = order[i]; order[i] = order[j]; order[j] = t;
        }
        cursor = 0;
    }
    const beta = Math.min(1, step / KL_WARMUP);
    grad.fill(0);
    let loss = 0;
    for (let b = 0; b < BATCH; b++) loss += example(order[cursor + b], beta);
    cursor += BATCH;
    loss /= BATCH * PIX;                     // per-pixel nats — starts ≈ 0.69

    // Adam
    adamT++;
    const bc1 = 1 - Math.pow(B1, adamT), bc2 = 1 - Math.pow(B2, adamT);
    for (let i = 0; i < NPARAM; i++) {
        const g = grad[i] / BATCH;
        adamM[i] = B1 * adamM[i] + (1 - B1) * g;
        adamV[i] = B2 * adamV[i] + (1 - B2) * g * g;
        theta[i] -= LR * (adamM[i] / bc1) / (Math.sqrt(adamV[i] / bc2) + EPS);
    }

    step++;
    if (!emaInit) { lossEMA = loss; emaInit = true; }
    else lossEMA += (loss - lossEMA) * 0.03;

    if (step % histStride === 0) {
        hist.push(lossEMA);
        if (hist.length > 160) {             // keep the sparkline bounded
            for (let i = 0; i < hist.length >> 1; i++) hist[i] = hist[2 * i];
            hist.length = hist.length >> 1;
            histStride *= 2;
        }
    }
    return loss;
}

/* ---- reporting ---- */
const ENC_SHOW = [3, 9, 16, 22, 28, 35, 41, 47, 54, 60];
const DEC_SHOW = [2, 8, 15, 21, 30, 36, 42, 48, 55, 61];
const NSHOW = 10;
const sampleBuf = new Float32Array(PIX);

function snapshot() {
    // last example's activations are still in the scratch buffers
    const encA = new Float32Array(NSHOW), decA = new Float32Array(NSHOW);
    const latA = new Float32Array(ZDIM);
    for (let k = 0; k < NSHOW; k++) { encA[k] = h1[ENC_SHOW[k]]; decA[k] = h2[DEC_SHOW[k]]; }
    for (let j = 0; j < ZDIM; j++) latA[j] = mu[j];

    // edge strengths from the real weight matrices
    const wEnc = new Float32Array(NSHOW), wDec = new Float32Array(NSHOW);
    const wE2L = new Float32Array(NSHOW * ZDIM), wL2D = new Float32Array(ZDIM * NSHOW);
    for (let k = 0; k < NSHOW; k++) {
        let s = 0;
        const row = ENC_SHOW[k] * XDIM;
        for (let i = 0; i < PIX; i++) s += Math.abs(P.W1.w[row + i]);
        wEnc[k] = s / PIX;
        s = 0;
        for (let o = 0; o < PIX; o++) s += Math.abs(P.W5.w[o * H + DEC_SHOW[k]]);
        wDec[k] = s / PIX;
        for (let j = 0; j < ZDIM; j++) {
            wE2L[k * ZDIM + j] = Math.abs(P.W2.w[j * H + ENC_SHOW[k]]);
            wL2D[j * NSHOW + k] = Math.abs(P.W4.w[DEC_SHOW[k] * ZYDIM + j]);
        }
    }

    // current recon pair (from the last trained example)
    const rx = new Uint8ClampedArray(PIX), rp = new Uint8ClampedArray(PIX);
    for (let i = 0; i < PIX; i++) {
        rx[i] = data[lastExampleIdx * PIX + i] * 255;
        rp[i] = prob[i] * 255;
    }

    // latent drift: an Ornstein–Uhlenbeck walk keeps each class latent
    // wandering through N(0,1), so the generated digits morph instead of
    // sitting still — you are watching the model explore its z-space
    const RHO = .985, SIG = Math.sqrt(1 - RHO * RHO);
    for (let c = 0; c < NCLS * ZDIM; c++) classZ[c] = RHO * classZ[c] + SIG * gauss();

    // generated digits 0..9 from the per-class latents
    const samples = new Uint8ClampedArray(NCLS * PIX);
    for (let c = 0; c < NCLS; c++) {
        decode(classZ.subarray(c * ZDIM, (c + 1) * ZDIM), c, sampleBuf);
        for (let i = 0; i < PIX; i++) samples[c * PIX + i] = sampleBuf[i];
    }

    postMessage({
        type: 'snapshot',
        step, done,
        epoch: Math.floor(step * BATCH / nData),
        loss: lossEMA,
        beta: Math.min(1, step / KL_WARMUP),
        hist: Float32Array.from(hist),
        recon: { x: rx, p: rp, label: lastExampleIdx % NCLS },
        samples,
        viz: { encA, latA, decA, wEnc, wE2L, wL2D, wDec }
    });
}

function saveWeights() {
    const buf = theta.slice().buffer;
    postMessage({ type: 'weights', step, buf }, [buf]);
}

/* ---- run loop ----
   Paced to ~50 steps/s so the training is a show, not a blink: blobs
   for the first half-minute, digit skeletons around a minute in, clean
   samples after a few. A modern laptop could do ~750/s, but nobody
   would see the network learn. */
function pump() {
    if (!running || done) return;
    const t0 = performance.now();
    let n = 0;
    while (n < 2 && performance.now() - t0 < 11) {
        trainStep(); n++;
        if (step >= MAX_STEPS) {
            done = true; running = false;
            snapshot(); saveWeights();
            return;
        }
    }
    const now = performance.now();
    if (now - lastSnap > SNAP_MS) { lastSnap = now; snapshot(); }
    if (step - lastSave >= SAVE_EVERY) { lastSave = step; saveWeights(); }
    setTimeout(pump, 36);
}

onmessage = e => {
    const m = e.data;
    if (m.type === 'init') {
        data = m.pixels;
        nData = data.length / PIX;
        order = new Int32Array(nData);
        for (let i = 0; i < nData; i++) order[i] = i;
        cursor = nData;                       // force initial shuffle
        initWeights();
        if (m.saved && m.saved.weights && m.saved.weights.byteLength === NPARAM * 4) {
            theta.set(new Float32Array(m.saved.weights));
            step = m.saved.step | 0;
            lastSave = step;
            done = step >= MAX_STEPS;
            lossEMA = m.saved.loss || lossEMA;
            emaInit = true;
            if (Array.isArray(m.saved.hist)) hist.push(...m.saved.hist);
        }
        // prime the scratch buffers/recon so the first snapshot is coherent
        const beta0 = Math.min(1, step / KL_WARMUP);
        grad.fill(0);
        example(order[0], beta0);
        cursor = nData;                       // re-force shuffle after priming
        postMessage({ type: 'ready', step, done });
        snapshot();
    } else if (m.type === 'run') {
        if (!running && !done) { running = true; lastSnap = 0; pump(); }
    } else if (m.type === 'pause') {
        if (running) { running = false; saveWeights(); }
    } else if (m.type === 'burst') {          // reduced-motion manual stepping
        if (!done) {
            const n = Math.min(m.steps || 20, MAX_STEPS - step);
            for (let i = 0; i < n; i++) trainStep();
            if (step >= MAX_STEPS) done = true;
            snapshot(); saveWeights();
        } else snapshot();
    } else if (m.type === 'sample') {          // resample latents (one digit or all)
        if (m.digit >= 0 && m.digit < NCLS) {
            for (let j = 0; j < ZDIM; j++) classZ[m.digit * ZDIM + j] = gauss();
        } else {
            for (let c = 0; c < NCLS * ZDIM; c++) classZ[c] = gauss();
        }
        snapshot();
    } else if (m.type === 'getWeights') {
        saveWeights();
    }
};
