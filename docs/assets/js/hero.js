// The name on the landing page is an inlay: girih tiles cut to the letter shapes.
// The rest of the wall is bare, and tiles take a glaze where the pointer passes.
//
// The pattern is periodic, so the wall is a single L x L cell (6 faces) repeated.
// A face is addressed by (cell column, cell row, face-in-cell) packed into one integer.
//
// Four canvases are stacked, bottom to top:
//   lines   the bare wall           drawn once
//   glaze   tiles under the light   small dirty rectangle per frame
//   name    the inlaid lettering    drawn once (redrawn while it assembles)
//   boost   shimmer and highlights  small dirty rectangle per frame

import { unitCell } from './girih.js';

// Each line has its own scale: the given name sits small above a full-width surname.
const NAME = {
  wide: [{ t: 'Mohammad Saleh', k: 0.5 }, { t: 'Mahdinejad', k: 1 }],
  compact: [{ t: 'Mohammad', k: 0.6 }, { t: 'Saleh', k: 0.6 }, { t: 'Mahdi', k: 1 }, { t: 'nejad', k: 1 }],
  font: (s) => `800 ${s}px FrauncesHero, Georgia, serif`,
  lh: 0.86,
  maxSize: 400,
};

export const PAL = {
  light: {
    tile: [[22, 48, 128], [20, 176, 160], [226, 164, 52]],
    glaze: [[46, 92, 222], [18, 192, 172], [240, 172, 44]],
    shine: [[70, 122, 250], [64, 236, 212], [255, 214, 104]],
    ink: [16, 24, 38], edge: [10, 16, 34], lines: 0.1,
  },
  dark: {
    tile: [[52, 86, 206], [37, 194, 177], [240, 185, 85]],
    glaze: [[78, 116, 240], [52, 214, 192], [250, 196, 96]],
    shine: [[128, 168, 255], [116, 255, 232], [255, 226, 142]],
    ink: [236, 231, 219], edge: [4, 7, 18], lines: 0.13,
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const easeOutBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function hash(n) {
  n = (n ^ 61) ^ (n >>> 16); n = (n + (n << 3)) | 0; n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d); n ^= n >>> 15;
  return (n >>> 0) / 4294967295;
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}
const emptyBox = () => ({ x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
const grow = (b, x0, y0, x1, y1) => { b.x0 = Math.min(b.x0, x0); b.y0 = Math.min(b.y0, y0); b.x1 = Math.max(b.x1, x1); b.y1 = Math.max(b.y1, y1); };

export function createHero({ root, canvas, nameSlot, getTheme }) {
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const probe = makeCanvas(8, 8).getContext('2d');

  const layer = (cls) => {
    const c = document.createElement('canvas');
    c.className = 'hero__wall ' + cls;
    c.setAttribute('aria-hidden', 'true');
    return c;
  };
  const cLines = canvas;
  const cGlaze = layer('hero__glaze'), cName = layer('hero__inlay'), cBoost = layer('hero__boost');
  cLines.after(cGlaze, cName, cBoost);
  const gLines = cLines.getContext('2d');
  const gGlaze = cGlaze.getContext('2d');
  const gName = cName.getContext('2d');
  const gBoost = cBoost.getContext('2d');

  let S = null;
  let raf = 0, lastT = 0, lastDraw = 0, visible = true, destroyed = false;
  let ptr = null, ptrSeen = -1e9;
  let intro = 0, introStart = 0, introOn = false;
  let nextShimmer = 0, shim = null;
  let dpr = Math.min(Math.ceil(window.devicePixelRatio || 1), 2);
  const cost = { n: 0, sum: 0 };

  // ---------------------------------------------------------------- layout
  // `left`/`width` are the content column the name has to sit in, measured from the hero's left edge.
  function layout({ left, width, W, vh }) {
    const compact = width < 600 || W / vh < 0.9;
    const lines = compact ? NAME.compact : NAME.wide;
    probe.font = NAME.font(100);
    const per100 = lines.map((l) => probe.measureText(l.t).width * l.k);
    let size = width / (Math.max(...per100) / 100);
    size = Math.min(size, NAME.maxSize);
    const tall = lines.reduce((h, l) => h + l.k * NAME.lh, 0) + 0.3;
    size = Math.min(size, clamp(vh * 0.6, 240, 900) / tall);   // keep it from eating the whole screen
    const metrics = lines.map((l) => { probe.font = NAME.font(size * l.k); return probe.measureText(l.t); });
    const baselines = [metrics[0].actualBoundingBoxAscent + size * 0.04];
    for (let i = 1; i < lines.length; i++) baselines.push(baselines[i - 1] + size * lines[i].k * NAME.lh + size * 0.02);
    const desc = Math.max(metrics[metrics.length - 1].actualBoundingBoxDescent, size * 0.05);
    const block = baselines[baselines.length - 1] + desc + size * 0.06;
    return { lines, size, x: left, baselines, block, compact };
  }

  function drawText(g, lay, dy, fill) {
    g.save();
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = fill;
    lay.lines.forEach((l, i) => { g.font = NAME.font(lay.size * l.k); g.fillText(l.t, lay.x, lay.baselines[i] + dy); });
    g.restore();
  }

  // ------------------------------------------------------- face addressing
  function faceXY(id) {
    const u = id % S.nu, c = (id - u) / S.nu, ci = c % S.cols, cj = (c - ci) / S.cols;
    return { f: S.U.faces[u], ox: (ci + S.i0) * S.L, oy: (cj + S.j0) * S.L };
  }

  function path(g, id, scale = 1, dy = 0) {
    const { f, ox, oy } = faceXY(id);
    const p = f.pts, cx = f.cx + ox, cy = f.cy + oy;
    g.beginPath();
    for (let k = 0; k < p.length; k += 2) {
      const x = cx + (p[k] + ox - cx) * scale, y = cy + (p[k + 1] + oy - cy) * scale + dy;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.closePath();
  }

  // ----------------------------------------------------------------- scene
  function build() {
    const theme = getTheme() === 'dark' ? 'dark' : 'light';
    const pal = PAL[theme];
    let rect = root.getBoundingClientRect();
    const W = Math.round(rect.width);
    const col = nameSlot.getBoundingClientRect();
    const lay = layout({ left: col.left - rect.left, width: col.width, W, vh: window.innerHeight });
    nameSlot.style.height = Math.ceil(lay.block) + 'px';
    rect = root.getBoundingClientRect();
    const H = Math.round(rect.height);
    const top = nameSlot.getBoundingClientRect().top - rect.top;
    const pad = Math.ceil(lay.size * 0.12);
    const box = { x: 0, y: Math.max(0, Math.floor(top - pad)), w: W, h: 0 };
    box.h = Math.min(H - box.y, Math.ceil(lay.block + pad * 2));

    const px = Math.max(1, Math.min(dpr, Math.sqrt(8e6 / (W * H))));   // keep huge screens from allocating huge canvases
    const size = (c, w, h, top = 0) => {
      c.width = Math.round(w * px); c.height = Math.round(h * px);
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.style.top = top + 'px'; c.style.bottom = 'auto'; c.style.left = '0'; c.style.right = 'auto';
    };
    size(cLines, W, H); size(cGlaze, W, H);
    size(cName, box.w, box.h, box.y); size(cBoost, box.w, box.h, box.y);

    const L = clamp(Math.round(lay.size * 0.075), 10, 26);
    const U = unitCell(L, 64);
    const i0 = -1, j0 = -1;
    const cols = Math.ceil(W / L) + 3, rows = Math.ceil(H / L) + 3;
    const total = cols * rows * U.n;

    S = {
      W, H, L, U, px, nu: U.n, i0, j0, cols, rows, total, lay, pal, theme, top, box,
      lit: new Uint8Array(total), litList: [], proj: new Float32Array(total),
      heat: new Float32Array(total), flag: new Uint8Array(total), active: [],
      fill: new Array(total), delay: null, gd: null, bd: null, introDone: false,
    };

    // 1x mask of the lettering, sampled on the CPU to decide which tiles belong to it
    const mcpu = makeCanvas(box.w, box.h);
    const mg = mcpu.getContext('2d', { willReadFrequently: true });
    drawText(mg, lay, top - box.y, '#000');
    const md = mg.getImageData(0, 0, box.w, box.h).data;
    const at = (x, y) => {
      const ix = Math.round(x), iy = Math.round(y - box.y);
      if (ix < 0 || iy < 0 || ix >= box.w || iy >= box.h) return 0;
      return md[(iy * box.w + ix) * 4 + 3] > 40 ? 1 : 0;
    };
    const dirX = Math.cos(0.38), dirY = Math.sin(0.38);
    let pmin = 1e9, pmax = -1e9;
    const jA = Math.max(j0, Math.floor((box.y - L) / L)), jB = Math.min(j0 + rows - 1, Math.ceil((box.y + box.h + L) / L));
    for (let j = jA; j <= jB; j++) {
      for (let i = i0; i < i0 + cols; i++) {
        for (let u = 0; u < U.n; u++) {
          const f = U.faces[u];
          const cx = f.cx + i * L, cy = f.cy + j * L;
          if (cy < box.y - L || cy > box.y + box.h + L) continue;
          let s = at(cx, cy);
          for (let k = 0; k < f.pts.length && !s; k += 2) s = at((f.pts[k] + i * L) * 0.8 + cx * 0.2, (f.pts[k + 1] + j * L) * 0.8 + cy * 0.2);
          if (!s) continue;
          const id = ((j - j0) * cols + (i - i0)) * U.n + u;
          S.lit[id] = 1; S.litList.push(id);
          const p = cx * dirX + cy * dirY;
          S.proj[id] = p; pmin = Math.min(pmin, p); pmax = Math.max(pmax, p);
        }
      }
    }
    S.dirX = dirX; S.dirY = dirY; S.pmin = pmin; S.pmax = pmax;
    S.sorted = Int32Array.from(S.litList).sort((a, b) => S.proj[a] - S.proj[b]);

    // hi-dpi mask used for clipping the tiles to the real letter outlines
    S.mask = makeCanvas(box.w * px, box.h * px);
    const mk = S.mask.getContext('2d');
    mk.scale(px, px);
    drawText(mk, lay, top - box.y, '#000');
    S.tmp = makeCanvas(box.w * px, box.h * px);

    renderStatic();
  }

  function tileColor(id) {
    const { f } = faceXY(id);
    const base = S.pal.tile[f.kind];
    const t = (hash(id * 7919 + 13) - 0.5) * 0.14;          // every tile glazes a little differently
    return t >= 0 ? mix(base, [255, 255, 255], t) : mix(base, [0, 0, 0], -t);
  }

  function tilePaint(g, id) {
    const { f, ox, oy } = faceXY(id);
    const c = tileColor(id);
    const grad = g.createLinearGradient(f.x0 + ox, f.y0 + oy, f.x1 + ox, f.y1 + oy);
    grad.addColorStop(0, css(mix(c, [255, 255, 255], 0.11)));
    grad.addColorStop(0.55, css(c));
    grad.addColorStop(1, css(mix(c, [0, 0, 0], 0.2)));
    return grad;
  }

  function paintMosaic(g, progress) {
    const { litList, box, pal, L } = S;
    g.lineJoin = 'round';
    g.lineWidth = clamp(L * 0.05, 0.8, 1.3);
    g.strokeStyle = css(pal.edge, 0.78);
    for (const id of litList) {
      let s = 1;
      if (progress) {
        const p = clamp((progress.t - S.delay[id]) / 0.32, 0, 1);
        if (p <= 0) continue;
        s = easeOutBack(p);
        g.globalAlpha = Math.min(1, p * 2.2);
      }
      if (!S.fill[id]) S.fill[id] = tilePaint(g, id);
      path(g, id, s, -box.y);
      g.fillStyle = S.fill[id];
      g.fill(); g.stroke();
    }
    g.globalAlpha = 1;
  }

  function renderStatic() {
    const { W, H, L, U, box, pal, px } = S;

    // the bare wall: one cell drawn into a tile, then repeated
    const k = Math.round(L * px) / L;
    const tile = makeCanvas(Math.round(L * k), Math.round(L * k));
    const tg = tile.getContext('2d');
    tg.scale(k, k);
    tg.strokeStyle = css(pal.ink, pal.lines * 1.15);
    tg.lineWidth = clamp(L * 0.04, 0.7, 1);
    tg.lineCap = 'round';
    tg.beginPath();
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const e = U.edges;
        for (let q = 0; q < e.length; q += 4) {
          tg.moveTo(e[q] + dx * L, e[q + 1] + dy * L);
          tg.lineTo(e[q + 2] + dx * L, e[q + 3] + dy * L);
        }
      }
    }
    tg.stroke();
    gLines.setTransform(px, 0, 0, px, 0, 0);
    gLines.clearRect(0, 0, W, H);
    const pat = gLines.createPattern(tile, 'repeat');
    pat.setTransform(new DOMMatrix().scale(1 / k));
    gLines.fillStyle = pat;
    gLines.fillRect(0, 0, W, H);
    // quieter toward the copy at the bottom
    gLines.setTransform(1, 0, 0, 1, 0, 0);
    gLines.globalCompositeOperation = 'destination-in';
    const fade = gLines.createLinearGradient(0, 0, 0, H * px);
    const y0 = clamp((S.top - 40) / H, 0, 1), y1 = clamp((S.top + S.lay.block + 20) / H, 0, 1);
    fade.addColorStop(0, 'rgba(0,0,0,.55)');
    fade.addColorStop(y0, 'rgba(0,0,0,.95)');
    fade.addColorStop(y1, 'rgba(0,0,0,.95)');
    fade.addColorStop(Math.min(1, y1 + 0.2), 'rgba(0,0,0,.3)');
    fade.addColorStop(1, 'rgba(0,0,0,.22)');
    gLines.fillStyle = fade;
    gLines.fillRect(0, 0, W * px, H * px);
    gLines.globalCompositeOperation = 'source-over';

    // ink outline around the lettering ...
    const halo = makeCanvas(box.w * px, box.h * px);
    const hg = halo.getContext('2d');
    hg.drawImage(S.mask, 0, 0);
    hg.globalCompositeOperation = 'source-in';
    hg.fillStyle = css(pal.ink, 0.92);
    hg.fillRect(0, 0, halo.width, halo.height);
    const ring = makeCanvas(box.w * px, box.h * px);
    const rg = ring.getContext('2d');
    const r = Math.max(1.3, S.lay.size * 0.0055) * px;
    for (let a = 0; a < 14; a++) {
      const t = (a / 14) * Math.PI * 2;
      rg.drawImage(halo, Math.cos(t) * r, Math.sin(t) * r);
    }
    S.ring = ring;
    // ... and the finished inlay (outline + mosaic clipped to the letters)
    const done = makeCanvas(box.w * px, box.h * px);
    const dg = done.getContext('2d');
    dg.drawImage(ring, 0, 0);
    const mo = makeCanvas(box.w * px, box.h * px);
    const mg = mo.getContext('2d');
    mg.scale(px, px);
    paintMosaic(mg, null);
    mg.setTransform(1, 0, 0, 1, 0, 0);
    mg.globalCompositeOperation = 'destination-in';
    mg.drawImage(S.mask, 0, 0);
    dg.drawImage(mo, 0, 0);
    S.layerName = done;

    gGlaze.clearRect(0, 0, cGlaze.width, cGlaze.height);
    gBoost.clearRect(0, 0, cBoost.width, cBoost.height);
    gName.setTransform(1, 0, 0, 1, 0, 0);
    gName.clearRect(0, 0, cName.width, cName.height);
    if (!introOn) { gName.drawImage(S.layerName, 0, 0); S.introDone = true; }
  }

  // ---------------------------------------------------------------- frames
  function addHeat(id, v) {
    if (v > S.heat[id]) S.heat[id] = v;
    if (!S.flag[id]) { S.flag[id] = 1; S.active.push(id); }
  }

  function light(x, y, R, strength) {
    const { L, U, nu, cols, i0, j0 } = S;
    const ci0 = Math.max(i0, Math.floor((x - R) / L) - 1), ci1 = Math.min(i0 + cols - 1, Math.floor((x + R) / L) + 1);
    const cj0 = Math.max(j0, Math.floor((y - R) / L) - 1), cj1 = Math.min(j0 + S.rows - 1, Math.floor((y + R) / L) + 1);
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        for (let u = 0; u < nu; u++) {
          const f = U.faces[u];
          const d = Math.hypot(f.cx + i * L - x, f.cy + j * L - y);
          if (d > R) continue;
          const v = Math.pow(1 - d / R, 1.5) * strength;
          if (v > 0.03) addHeat(((j - j0) * cols + (i - i0)) * nu + u, v);
        }
      }
    }
  }

  const busy = () => introOn || shim || S.active.length > 0 || (ptr && performance.now() - ptrSeen < 1500);

  function frame(now) {
    raf = 0;
    if (destroyed || !S) return;
    const reduced = reduceQuery.matches;
    const hasPointer = ptr && now - ptrSeen < 1400;
    // ambient light only needs 30 fps; pointer and intro get the full rate
    if (!hasPointer && !introOn && now - lastDraw < 30) { schedule(); return; }
    lastDraw = now;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;
    const t0 = performance.now();
    const { W, box, pal, px } = S;

    let lx = null, ly = null, ls = 1;
    if (hasPointer) { lx = ptr.x; ly = ptr.y; }
    else if (!reduced) {
      const t = now / 1000;
      lx = W * (0.5 + 0.38 * Math.sin(t * 0.13 + 0.6));
      ly = S.top + S.lay.block * (0.55 + 0.38 * Math.sin(t * 0.19 + 1.7));
      ls = 0.85;
    }
    if (lx !== null) light(lx, ly, S.lay.compact ? 70 : clamp(W * 0.07, 84, 120), ls);

    let progress = null;
    if (introOn) {
      intro = Math.max(0, (now - introStart) / 1000);
      const total = 2.1;
      if (intro >= total) { introOn = false; intro = total; finishIntro(); }
      else progress = { t: (intro / total) * 1.35 };
    }

    // glaze on the bare wall (letters hide what is under them; they get the boost layer instead)
    const gb = emptyBox();
    const next = [], boosts = [];
    for (let k = 0; k < S.active.length; k++) {
      const id = S.active[k];
      S.heat[id] *= Math.exp(-dt / 0.5);
      const h = S.heat[id];
      if (h < 0.035) { S.flag[id] = 0; S.heat[id] = 0; continue; }
      next.push(id);
      if (S.lit[id]) { boosts.push(id, h); continue; }
      const { f, ox, oy } = faceXY(id);
      grow(gb, f.cx + ox - S.L, f.cy + oy - S.L, f.cx + ox + S.L, f.cy + oy + S.L);
    }
    S.active = next;
    gGlaze.setTransform(px, 0, 0, px, 0, 0);
    if (S.gd) gGlaze.clearRect(S.gd.x0, S.gd.y0, S.gd.x1 - S.gd.x0, S.gd.y1 - S.gd.y0);
    if (gb.x1 > gb.x0) {
      gGlaze.lineWidth = 1;
      for (const id of S.active) {
        if (S.lit[id]) continue;
        const h = S.heat[id], kind = S.U.faces[id % S.nu].kind;
        path(gGlaze, id);
        const a = clamp((h - 0.1) / 0.55, 0, 1);
        gGlaze.fillStyle = css(pal.glaze[kind], a * a * (3 - 2 * a) * 0.95);
        gGlaze.fill();
        gGlaze.strokeStyle = css(pal.edge, 0.12 + h * 0.62);
        gGlaze.stroke();
      }
    }
    S.gd = gb.x1 > gb.x0 ? gb : null;

    // the inlay while it assembles
    if (progress) drawIntroName(progress);

    // shimmer across the lettering
    if (!reduced && !introOn) {
      if (!shim && now > nextShimmer) shim = { t0: now, dur: 1900 };
      if (shim) {
        const p = (now - shim.t0) / shim.dur;
        if (p >= 1) { shim = null; nextShimmer = now + 7000 + Math.random() * 3500; }
        else {
          const bw = S.lay.size * 0.42;
          const c = S.pmin - bw * 1.4 + (S.pmax - S.pmin + bw * 2.8) * easeInOut(p);
          const lo = c - bw * 2.1, hi = c + bw * 2.1;
          const s = S.sorted;
          let a = 0, b = s.length;
          while (a < b) { const m = (a + b) >> 1; S.proj[s[m]] < lo ? (a = m + 1) : (b = m); }
          for (let k = a; k < s.length && S.proj[s[k]] <= hi; k++) {
            const id = s[k];
            const d = (S.proj[id] - c) / bw;
            const v = 0.55 * Math.exp(-d * d);
            if (v > 0.04) boosts.push(id, v);
          }
        }
      }
    }
    drawBoost(progress ? [] : boosts);

    // cheap self-check: if frames are costly on this machine, drop to 1x
    cost.n++; cost.sum += performance.now() - t0;
    if (cost.n === 90) {
      if (cost.sum / cost.n > 9 && S.px > 1) { dpr = 1; build(); finishIntro(); }
      cost.n = 0; cost.sum = 0;
    }
    if (busy() || !reduced) schedule();
  }

  function finishIntro() {
    if (!S || S.introDone) return;
    S.introDone = true;
    gName.setTransform(1, 0, 0, 1, 0, 0);
    gName.clearRect(0, 0, cName.width, cName.height);
    gName.drawImage(S.layerName, 0, 0);
    cLines.style.opacity = '1';
  }

  function drawIntroName(progress) {
    const { tmp, mask, px } = S;
    const tg = tmp.getContext('2d');
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'source-over';
    tg.clearRect(0, 0, tmp.width, tmp.height);
    tg.setTransform(px, 0, 0, px, 0, 0);
    paintMosaic(tg, { t: progress.t });
    tg.setTransform(1, 0, 0, 1, 0, 0);
    tg.globalCompositeOperation = 'destination-in';
    tg.drawImage(mask, 0, 0);
    tg.globalCompositeOperation = 'source-over';
    gName.setTransform(1, 0, 0, 1, 0, 0);
    gName.clearRect(0, 0, cName.width, cName.height);
    gName.globalAlpha = clamp(intro / 0.4, 0, 1);       // the ink stencil first, then the tiles land on it
    gName.drawImage(S.ring, 0, 0);
    gName.globalAlpha = 1;
    gName.drawImage(tmp, 0, 0);
  }

  function drawBoost(list) {
    const { box, mask, pal, L, px } = S;
    const nb = emptyBox();
    for (let k = 0; k < list.length; k += 2) {
      const { f, ox, oy } = faceXY(list[k]);
      grow(nb, f.cx + ox - L, f.cy + oy - L, f.cx + ox + L, f.cy + oy + L);
    }
    const clear = S.bd ? { ...S.bd } : emptyBox();
    if (nb.x1 > nb.x0) grow(clear, nb.x0, nb.y0, nb.x1, nb.y1);
    const cx0 = Math.max(0, Math.floor(clear.x0)), cy0 = Math.max(box.y, Math.floor(clear.y0));
    const cx1 = Math.min(box.w, Math.ceil(clear.x1)), cy1 = Math.min(box.y + box.h, Math.ceil(clear.y1));
    if (cx1 > cx0 && cy1 > cy0) gBoost.clearRect((cx0) * px, (cy0 - box.y) * px, (cx1 - cx0) * px, (cy1 - cy0) * px);
    S.bd = list.length ? nb : null;
    if (!list.length) return;

    const x0 = Math.max(0, Math.floor(nb.x0)), y0 = Math.max(box.y, Math.floor(nb.y0));
    const x1 = Math.min(box.w, Math.ceil(nb.x1)), y1 = Math.min(box.y + box.h, Math.ceil(nb.y1));
    if (x1 <= x0 || y1 <= y0) return;
    gBoost.save();
    gBoost.beginPath();
    gBoost.rect(x0 * px, (y0 - box.y) * px, (x1 - x0) * px, (y1 - y0) * px);
    gBoost.clip();
    gBoost.setTransform(px, 0, 0, px, 0, -box.y * px);
    gBoost.lineJoin = 'round';
    gBoost.lineWidth = clamp(L * 0.05, 0.8, 1.3);
    gBoost.strokeStyle = css(pal.edge, 0.78);
    for (let k = 0; k < list.length; k += 2) {
      const id = list[k], v = list[k + 1];
      path(gBoost, id);
      gBoost.fillStyle = css(mix(tileColor(id), pal.shine[S.U.faces[id % S.nu].kind], clamp(v * 1.3, 0, 1)));
      gBoost.fill();
      gBoost.stroke();
    }
    gBoost.setTransform(1, 0, 0, 1, 0, 0);
    gBoost.globalCompositeOperation = 'destination-in';
    gBoost.drawImage(mask, 0, 0);
    gBoost.restore();
  }

  function schedule() {
    if (raf || destroyed || !visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  function startIntro() {
    if (!S || reduceQuery.matches) { introOn = false; if (S) finishIntro(); return; }
    S.delay = new Float32Array(S.total);
    const span = Math.max(1, S.pmax - S.pmin);
    for (const id of S.litList) S.delay[id] = ((S.proj[id] - S.pmin) / span) * 0.62 + hash(id * 31 + 5) * 0.14;
    introOn = true; introStart = performance.now(); intro = 0; S.introDone = false;
    gName.setTransform(1, 0, 0, 1, 0, 0);
    gName.clearRect(0, 0, cName.width, cName.height);
    cLines.style.transition = 'none';
    cLines.style.opacity = '0';
    void cLines.offsetWidth;
    cLines.style.transition = 'opacity 1.2s ease';
    cLines.style.opacity = '1';
  }

  // ------------------------------------------------------------------ wiring
  function toHero(e) {
    const r = root.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  const onMove = (e) => { ptr = toHero(e); ptrSeen = performance.now(); schedule(); };
  const onLeave = () => { ptrSeen = -1e9; };
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerdown', onMove, { passive: true });
  root.addEventListener('pointerleave', onLeave);

  const io = new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible) { lastT = performance.now(); schedule(); }
  }, { threshold: 0 });
  io.observe(root);
  const onVis = () => { if (!document.hidden) { lastT = performance.now(); schedule(); } };
  document.addEventListener('visibilitychange', onVis);

  let resizeTimer = 0, lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(root.getBoundingClientRect().width);
    if (w === lastW) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { lastW = w; introOn = false; build(); schedule(); }, 160);
  });

  async function init() {
    await Promise.race([
      document.fonts.load('800 100px FrauncesHero', 'Mohammad Saleh Mahdinejad'),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    if (destroyed) return;
    lastW = Math.round(root.getBoundingClientRect().width);
    build();
    startIntro();
    ro.observe(root);
    schedule();
    root.classList.add('is-ready');
  }
  init();

  return {
    // after a theme change
    refresh({ replay = true } = {}) {
      if (!S) return;
      introOn = false;
      build();
      if (replay) startIntro();
      schedule();
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onMove);
      root.removeEventListener('pointerleave', onLeave);
      cGlaze.remove(); cName.remove(); cBoost.remove();
    },
  };
}
