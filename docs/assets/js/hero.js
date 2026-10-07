// The name on the landing page is an inlay: girih tiles cut to the letter shapes.
// The rest of the wall is bare, and tiles take a glaze where the pointer passes.
//
// Layers, bottom to top:
//   glaze   wall tiles lit by the pointer             canvas at 1x, only lit tiles are drawn
//   wall    the bare tile lines                       one tile, repeated as a CSS background
//   inlay   the mosaic lettering with its ink edge    drawn once, then shown as a finished bitmap
//   shine   light moving over the letters             CSS: a band and a spot, masked to the letters
//
// Only the glaze is a live canvas. A static 2D canvas still gets copied to the compositor again on
// many frames in some browsers, so everything that doesn't change is handed over as a bitmap or an
// image instead.
// The intro and the shine are CSS animations, so they run on the compositor and never wait on
// this script. The script only works while the pointer (or the idle light) is moving.
//
// The pattern is periodic, so a single L x L cell (6 faces) describes the whole wall.
// A face is addressed by (cell column, cell row, face-in-cell) packed into one integer.

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
    ink: [16, 24, 38], edge: [10, 16, 34], lines: 0.1,
  },
  dark: {
    tile: [[52, 86, 206], [37, 194, 177], [240, 185, 85]],
    glaze: [[78, 116, 240], [52, 214, 192], [250, 196, 96]],
    ink: [236, 231, 219], edge: [4, 7, 18], lines: 0.13,
  },
};

const BLOCK = 6;            // the mosaic repeats every 6 x 6 cells (tint variation included)
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
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

export function createHero({ root, wall, nameSlot, getTheme }) {
  const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const lite = document.documentElement.classList.contains('lite');   // save-data or a very small device
  const probe = makeCanvas(8, 8).getContext('2d');

  const layer = (cls) => {
    const c = document.createElement('canvas');
    c.className = 'hero__wall ' + cls;
    c.setAttribute('aria-hidden', 'true');
    return c;
  };
  wall.classList.add('hero__lines');
  const cGlaze = layer('hero__glaze');
  const inlay = layer('hero__inlay');
  const gInlay = inlay.getContext('bitmaprenderer');
  const shine = document.createElement('div');
  shine.className = 'hero__shine';
  shine.setAttribute('aria-hidden', 'true');
  shine.innerHTML = '<i class="hero__band"></i><i class="hero__spot"></i>';
  const spot = shine.lastChild;
  wall.before(cGlaze);
  wall.after(inlay, shine);
  const gGlaze = cGlaze.getContext('2d');
  const cName = makeCanvas(1, 1);                  // the inlay is drawn here, off the page
  const gName = cName.getContext('2d');

  let S = null, gen = 0, maskURL = '', maskKey = '';
  let raf = 0, lastT = 0, lastDraw = 0, visible = true, destroyed = false;
  let ptr = null, ptrSeen = -1e9;
  const dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  // The idle light only runs for a while after the page opens or the hero is touched.
  const AWAKE_MS = 12000;
  let awakeUntil = 0;
  const wakeUp = () => { awakeUntil = performance.now() + AWAKE_MS; };
  let quietUntil = 0;                              // the idle light waits for the intro to finish
  const ambient = (now) => !lite && !reduceQuery.matches && now < awakeUntil && now > quietUntil;

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
    size = Math.min(size, clamp(vh * 0.62, 240, 900) / tall);   // keep it from eating the whole screen
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

  function facePath(f, scale = 1) {
    const p = new Path2D();
    for (let k = 0; k < f.pts.length; k += 2) {
      const x = f.cx + (f.pts[k] - f.cx) * scale, y = f.cy + (f.pts[k + 1] - f.cy) * scale;
      k ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return p;
  }

  // ----------------------------------------------------------------- scene
  const toURL = (c) => new Promise((res) => c.toBlob((b) => res(b ? URL.createObjectURL(b) : ''), 'image/png'));

  // Draws everything for the current size and theme. The page keeps showing the previous layers
  // until the new ones are ready, then swaps them all at once, so a resize or a theme change never flashes.
  async function build() {
    const my = ++gen;
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
    const box = { y: Math.max(0, Math.floor(top - pad)), w: W, h: 0 };
    box.h = Math.min(H - box.y, Math.ceil(lay.block + pad * 2));

    const px = Math.max(1, Math.min(dpr, Math.sqrt(8e6 / (W * H))));   // huge screens don't get huge canvases
    const place = (el, w, h, y) => { el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.top = y + 'px'; el.style.left = '0'; };
    cName.width = Math.round(box.w * px); cName.height = Math.round(box.h * px);

    const L = clamp(Math.round(lay.size * 0.075), 10, 26);
    const U = unitCell(L, 64);
    const cols = Math.ceil(W / L) + 3, rows = Math.ceil(H / L) + 3;
    const total = cols * rows * U.n;
    S = {
      W, H, L, U, px, nu: U.n, cols, rows, lay, pal, top, box,
      lit: new Uint8Array(total), heat: new Float32Array(total), flag: new Uint8Array(total), active: [],
      glazePaths: U.faces.map((f) => facePath(f, 0.84)),          // inset, so the wall lines show between lit tiles
      glazeFill: pal.glaze.map((c) => css(c)), glazeBox: null,
    };

    // the letter shapes at 1x: decide which wall tiles sit under the lettering (those never glaze)
    const m1 = makeCanvas(box.w, box.h);
    const g1 = m1.getContext('2d', { willReadFrequently: true });
    drawText(g1, lay, top - box.y, '#000');
    const md = g1.getImageData(0, 0, box.w, box.h).data;
    const at = (x, y) => {
      const ix = Math.round(x), iy = Math.round(y - box.y);
      return ix >= 0 && iy >= 0 && ix < box.w && iy < box.h && md[(iy * box.w + ix) * 4 + 3] > 40;
    };
    for (let j = Math.floor((box.y - L) / L); j <= Math.ceil((box.y + box.h) / L); j++) {
      for (let i = -1; i < cols - 1; i++) {
        for (let u = 0; u < U.n; u++) {
          const f = U.faces[u];
          if (at(f.cx + i * L, f.cy + j * L)) S.lit[((j + 1) * cols + (i + 1)) * U.n + u] = 1;
        }
      }
    }

    renderInlay();
    const wallURL = wallTile().toDataURL();        // a few kilobytes; toBlob would wait for idle time
    const bitmap = await createImageBitmap(cName);
    if (my !== gen || destroyed) { bitmap.close(); return false; }

    // swap everything in one go
    place(wall, W, H, 0);
    wall.style.backgroundImage = `url(${wallURL})`;
    wall.style.backgroundSize = `${L}px ${L}px`;
    const y0 = Math.max(0, S.top - 40), y1 = S.top + lay.block + 20;      // quieter toward the copy at the bottom
    wall.style.webkitMaskImage = wall.style.maskImage = `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.95) ${y0}px, rgba(0,0,0,.95) ${y1}px, rgba(0,0,0,.3) ${Math.min(H, y1 + H * 0.2)}px, rgba(0,0,0,.22))`;
    inlay.width = bitmap.width; inlay.height = bitmap.height;
    gInlay.transferFromImageBitmap(bitmap);
    place(inlay, box.w, box.h, box.y);
    place(shine, box.w, box.h, box.y);
    cGlaze.width = W; cGlaze.height = H;
    place(cGlaze, W, H, 0);
    S.glazeBox = null;
    S.active.length = 0;
    cName.width = cName.height = 1;                 // the pixels live in the bitmap now

    // the shine is masked to the letters with a picture of them; it only changes with the layout
    const key = [W, box.h, lay.size, lay.compact].join();
    if (key !== maskKey) {
      maskKey = key;
      toURL(m1).then((url) => {
        if (!url || maskKey !== key || destroyed) { if (url) URL.revokeObjectURL(url); return; }
        shine.style.webkitMaskImage = shine.style.maskImage = `url(${url})`;
        if (maskURL) URL.revokeObjectURL(maskURL);
        maskURL = url;
      });
    }
    return true;
  }

  // One cell of the bare wall at device resolution; the page repeats it as a background.
  function wallTile() {
    const { L, U, pal, px } = S;
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
    return tile;
  }

  // One 6 x 6 block of glazed tiles, repeated over the letters as a pattern: a single fill
  // instead of thousands of tiles.
  function mosaicBlock() {
    const { L, U, pal, px } = S;
    const size = BLOCK * L;
    const k = Math.round(size * px) / size;
    const c = makeCanvas(size * k, size * k);
    const g = c.getContext('2d');
    const paths = U.faces.map((f) => facePath(f));
    g.lineJoin = 'round';
    g.lineWidth = clamp(L * 0.05, 0.8, 1.3);
    g.strokeStyle = css(pal.edge, 0.78);
    for (let j = -1; j <= BLOCK; j++) {
      for (let i = -1; i <= BLOCK; i++) {
        const ci = (i + BLOCK) % BLOCK, cj = (j + BLOCK) % BLOCK;
        for (let u = 0; u < U.n; u++) {
          const f = U.faces[u];
          const t = (hash((cj * BLOCK + ci) * 16 + u + 7) - 0.5) * 0.14;   // every tile glazes a little differently
          const base = pal.tile[f.kind];
          const col = t >= 0 ? mix(base, [255, 255, 255], t) : mix(base, [0, 0, 0], -t);
          const ox = i * L, oy = j * L;
          const grad = g.createLinearGradient(f.x0, f.y0, f.x1, f.y1);
          grad.addColorStop(0, css(mix(col, [255, 255, 255], 0.11)));
          grad.addColorStop(0.55, css(col));
          grad.addColorStop(1, css(mix(col, [0, 0, 0], 0.2)));
          g.setTransform(k, 0, 0, k, ox * k, oy * k);
          g.fillStyle = grad;
          g.fill(paths[u]);
          g.stroke(paths[u]);
        }
      }
    }
    return { canvas: c, k };
  }

  function renderInlay() {
    const { box, pal, px, lay, top } = S;
    const w = cName.width, h = cName.height;
    // letters, at full resolution
    const mask = makeCanvas(w, h);
    const mg = mask.getContext('2d');
    mg.scale(px, px);
    drawText(mg, lay, top - box.y, '#000');
    // the ink edge: the letter shape, nudged around a small circle
    const ink = makeCanvas(w, h);
    const ig = ink.getContext('2d');
    ig.drawImage(mask, 0, 0);
    ig.globalCompositeOperation = 'source-in';
    ig.fillStyle = css(pal.ink, 0.92);
    ig.fillRect(0, 0, w, h);
    gName.setTransform(1, 0, 0, 1, 0, 0);
    gName.globalCompositeOperation = 'source-over';
    gName.clearRect(0, 0, w, h);
    const r = Math.max(1.3, lay.size * 0.0055) * px;
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      gName.drawImage(ink, Math.cos(t) * r, Math.sin(t) * r);
    }
    // the mosaic, clipped to the letters
    const { canvas: block, k } = mosaicBlock();
    const mo = makeCanvas(w, h);
    const og = mo.getContext('2d');
    const pat = og.createPattern(block, 'repeat');
    pat.setTransform(new DOMMatrix().translate(0, -box.y * px).scale(px / k));   // keep it on the wall's grid
    og.fillStyle = pat;
    og.fillRect(0, 0, w, h);
    og.globalCompositeOperation = 'destination-in';
    og.drawImage(mask, 0, 0);
    gName.drawImage(mo, 0, 0);
  }

  // ---------------------------------------------------------------- glaze
  function light(x, y, R, strength) {
    const { L, U, nu, cols, rows } = S;
    const ci0 = Math.max(-1, Math.floor((x - R) / L) - 1), ci1 = Math.min(cols - 2, Math.floor((x + R) / L) + 1);
    const cj0 = Math.max(-1, Math.floor((y - R) / L) - 1), cj1 = Math.min(rows - 2, Math.floor((y + R) / L) + 1);
    for (let j = cj0; j <= cj1; j++) {
      for (let i = ci0; i <= ci1; i++) {
        for (let u = 0; u < nu; u++) {
          const id = ((j + 1) * cols + (i + 1)) * nu + u;
          if (S.lit[id]) continue;
          const f = U.faces[u];
          const d = Math.hypot(f.cx + i * L - x, f.cy + j * L - y);
          if (d > R) continue;
          const v = Math.pow(1 - d / R, 1.5) * strength;
          if (v <= 0.03) continue;
          if (v > S.heat[id]) S.heat[id] = v;
          if (!S.flag[id]) { S.flag[id] = 1; S.active.push(id); }
        }
      }
    }
  }

  function drawGlaze(dt) {
    const { L, nu, cols, glazePaths, glazeFill, U } = S;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    const next = [];
    for (const id of S.active) {
      S.heat[id] *= Math.exp(-dt / 0.45);
      if (S.heat[id] < 0.035) { S.flag[id] = 0; S.heat[id] = 0; continue; }
      next.push(id);
      const c = (id / nu) | 0, i = (c % cols) - 1, j = ((c / cols) | 0) - 1;
      x0 = Math.min(x0, i * L); y0 = Math.min(y0, j * L); x1 = Math.max(x1, i * L + L); y1 = Math.max(y1, j * L + L);
    }
    S.active = next;
    const prev = S.glazeBox;
    const cur = next.length ? { x0: x0 - 2, y0: y0 - 2, x1: x1 + 2, y1: y1 + 2 } : null;
    S.glazeBox = cur;
    const g = gGlaze;
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (prev) g.clearRect(prev.x0, prev.y0, prev.x1 - prev.x0, prev.y1 - prev.y0);
    if (cur) g.clearRect(cur.x0, cur.y0, cur.x1 - cur.x0, cur.y1 - cur.y0);
    for (const id of next) {
      const u = id % nu, c = (id - u) / nu, i = (c % cols) - 1, j = ((c / cols) | 0) - 1;
      const h = S.heat[id];
      const a = clamp((h - 0.08) / 0.5, 0, 1);
      if (a <= 0) continue;
      g.globalAlpha = a * a * (3 - 2 * a) * 0.9;
      g.fillStyle = glazeFill[U.faces[u].kind];
      g.setTransform(1, 0, 0, 1, i * L, j * L);
      g.fill(glazePaths[u]);
    }
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- frames
  function frame(now) {
    raf = 0;
    if (destroyed || !S) return;
    const hasPointer = ptr && now - ptrSeen < 1200;
    const idle = !hasPointer && ambient(now);
    if (!hasPointer && !idle && !S.active.length) return;          // nothing to do: stop asking for frames
    if (!hasPointer && now - lastDraw < 32) { schedule(); return; }  // the idle light is fine at 30 fps
    lastDraw = now;
    const dt = Math.min(0.05, (now - lastT) / 1000 || 0.016);
    lastT = now;

    if (hasPointer) light(ptr.x, ptr.y, S.lay.compact ? 70 : clamp(S.W * 0.07, 84, 120), 1);
    else if (idle) {
      const t = now / 1000;
      light(S.W * (0.5 + 0.38 * Math.sin(t * 0.13 + 0.6)),
        S.top + S.lay.block * (0.55 + 0.38 * Math.sin(t * 0.19 + 1.7)), S.lay.compact ? 70 : clamp(S.W * 0.07, 84, 120), 0.85);
    }
    drawGlaze(dt);
    schedule();
  }

  function schedule() {
    if (raf || destroyed || !visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
  }

  function startIntro() {
    if (reduceQuery.matches) return;
    root.classList.remove('is-intro');
    void root.offsetWidth;                         // restart the CSS animations
    root.classList.add('is-intro');
    quietUntil = performance.now() + 1700;
    setTimeout(schedule, 1750);
    clearTimeout(startIntro.t);
    startIntro.t = setTimeout(() => root.classList.remove('is-intro'), 2600);
  }

  // ------------------------------------------------------------------ wiring
  let heroRect = null;
  const onMove = (e) => {
    if (!heroRect) heroRect = root.getBoundingClientRect();
    ptr = { x: e.clientX - heroRect.left, y: e.clientY - heroRect.top };
    ptrSeen = performance.now();
    wakeUp();
    if (S) {
      spot.style.transform = `translate3d(${ptr.x}px, ${ptr.y - S.box.y}px, 0)`;
      shine.classList.add('has-spot');
    }
    schedule();
  };
  const onLeave = () => { ptrSeen = -1e9; shine.classList.remove('has-spot'); };
  const forgetRect = () => { heroRect = null; };
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerdown', onMove, { passive: true });
  root.addEventListener('pointerleave', onLeave);
  addEventListener('scroll', forgetRect, { passive: true });

  const io = new IntersectionObserver((es) => {
    const was = visible;
    visible = es[0].isIntersecting;
    root.classList.toggle('is-off', !visible);
    if (visible) { if (!was) wakeUp(); lastT = performance.now(); schedule(); }
  }, { threshold: 0 });
  io.observe(root);
  const onVis = () => { if (!document.hidden) { lastT = performance.now(); schedule(); } };
  document.addEventListener('visibilitychange', onVis);

  let resizeTimer = 0, lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(root.getBoundingClientRect().width);
    forgetRect();
    if (w === lastW) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { lastW = w; build().then(schedule); }, 160);
  });

  async function init() {
    await Promise.race([
      document.fonts.load('800 100px FrauncesHero', 'Mohammad Saleh Mahdinejad'),
      new Promise((r) => setTimeout(r, 2500)),
    ]);
    if (destroyed) return;
    lastW = Math.round(root.getBoundingClientRect().width);
    if (!(await build())) return;
    startIntro();
    wakeUp();
    ro.observe(root);
    schedule();
    root.classList.add('is-ready');
  }
  init();

  return {
    // after a theme change; resolves once the new images are on the page
    async refresh({ replay = true } = {}) {
      if (!S) return;
      if (!(await build())) return;
      if (replay) startIntro();
      schedule();
    },
    destroy() {
      destroyed = true; cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      removeEventListener('scroll', forgetRect);
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerdown', onMove);
      root.removeEventListener('pointerleave', onLeave);
      cGlaze.remove(); inlay.remove(); shine.remove();
      if (maskURL) URL.revokeObjectURL(maskURL);
    },
  };
}
