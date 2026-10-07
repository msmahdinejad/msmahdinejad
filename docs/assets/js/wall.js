// A bare wall of girih tiles that takes a glaze under the pointer. Used behind the contact section,
// the same wall the name is inlaid into at the top of the page.

import { unitCell } from './girih.js';
import { PAL } from './hero.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

export function createWall({ root, canvas, getTheme }) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let S = null, raf = 0, last = 0, visible = false, ptr = null;
  const dprWanted = Math.min(Math.ceil(window.devicePixelRatio || 1), 2);
  let dpr = dprWanted;

  function build() {
    const r = root.getBoundingClientRect();
    const W = Math.round(r.width), H = Math.round(r.height);
    if (!W || !H) { S = null; return; }
    dpr = Math.max(1, Math.min(dprWanted, Math.sqrt(8e6 / (W * H))));
    const pal = PAL[getTheme() === 'dark' ? 'dark' : 'light'];
    const L = W < 700 ? 13 : clamp(Math.round(W / 70), 15, 26);
    const U = unitCell(L, 64);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    const cols = Math.ceil(W / L) + 3, rows = Math.ceil(H / L) + 3;

    const k = Math.round(L * dpr) / L;
    const tile = document.createElement('canvas');
    tile.width = tile.height = Math.round(L * k);
    const tg = tile.getContext('2d');
    tg.scale(k, k);
    tg.strokeStyle = css(pal.ink, pal.lines * 0.95);
    tg.lineWidth = clamp(L * 0.04, 0.7, 1);
    tg.lineCap = 'round';
    tg.beginPath();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      for (let q = 0; q < U.edges.length; q += 4) {
        tg.moveTo(U.edges[q] + dx * L, U.edges[q + 1] + dy * L);
        tg.lineTo(U.edges[q + 2] + dx * L, U.edges[q + 3] + dy * L);
      }
    }
    tg.stroke();
    const lines = document.createElement('canvas');
    lines.width = canvas.width; lines.height = canvas.height;
    const lg = lines.getContext('2d');
    lg.scale(dpr, dpr);
    const pat = lg.createPattern(tile, 'repeat');
    pat.setTransform(new DOMMatrix().scale(1 / k));
    lg.fillStyle = pat; lg.fillRect(0, 0, W, H);
    S = { W, H, L, U, pal, cols, rows, lines, heat: new Float32Array(cols * rows * U.n), flag: new Uint8Array(cols * rows * U.n), active: [] };
    draw(0);
  }

  function light(x, y, R, strength) {
    const { L, U, cols, rows } = S, nu = U.n;
    const c0 = Math.max(-1, Math.floor((x - R) / L) - 1), c1 = Math.min(cols - 2, Math.floor((x + R) / L) + 1);
    const r0 = Math.max(-1, Math.floor((y - R) / L) - 1), r1 = Math.min(rows - 2, Math.floor((y + R) / L) + 1);
    for (let j = r0; j <= r1; j++) for (let i = c0; i <= c1; i++) for (let u = 0; u < nu; u++) {
      const f = U.faces[u];
      const d = Math.hypot(f.cx + i * L - x, f.cy + j * L - y);
      if (d > R) continue;
      const v = Math.pow(1 - d / R, 1.5) * strength;
      if (v < 0.03) continue;
      const id = ((j + 1) * cols + (i + 1)) * nu + u;
      if (v > S.heat[id]) S.heat[id] = v;
      if (!S.flag[id]) { S.flag[id] = 1; S.active.push(id); }
    }
  }

  function draw(dt) {
    const { W, H, L, U, pal, cols } = S, nu = U.n;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(S.lines, 0, 0, W, H);
    const next = [];
    for (const id of S.active) {
      S.heat[id] *= Math.exp(-dt / 0.55);
      const h = S.heat[id];
      if (h < 0.035) { S.flag[id] = 0; S.heat[id] = 0; continue; }
      next.push(id);
      const u = id % nu, c = (id - u) / nu, ci = c % cols, cj = (c - ci) / cols;
      const f = U.faces[u], ox = (ci - 1) * L, oy = (cj - 1) * L;
      ctx.beginPath();
      for (let k = 0; k < f.pts.length; k += 2) k ? ctx.lineTo(f.pts[k] + ox, f.pts[k + 1] + oy) : ctx.moveTo(f.pts[k] + ox, f.pts[k + 1] + oy);
      ctx.closePath();
      const a = clamp((h - 0.1) / 0.55, 0, 1);
      ctx.fillStyle = css(pal.glaze[f.kind], a * a * (3 - 2 * a) * 0.9);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = css(pal.edge, 0.12 + h * 0.6);
      ctx.stroke();
    }
    S.active = next;
  }

  function frame(now) {
    raf = 0;
    if (!S || !visible) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    if (ptr && now - ptr.t < 120) light(ptr.x, ptr.y, W_R(), 1);
    draw(dt);
    if (S.active.length || (ptr && now - ptr.t < 120)) raf = requestAnimationFrame(frame);
  }
  const W_R = () => (S.W < 700 ? 70 : clamp(S.W * 0.06, 80, 110));
  function wake() { if (!raf && S && visible && !reduce.matches) { last = performance.now(); raf = requestAnimationFrame(frame); } }

  const onMove = (e) => {
    const r = root.getBoundingClientRect();
    ptr = { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    wake();
  };
  root.addEventListener('pointermove', onMove, { passive: true });
  root.addEventListener('pointerdown', onMove, { passive: true });

  const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible && !S) build(); }, { rootMargin: '200px' });
  io.observe(root);
  let timer = 0, lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(root.getBoundingClientRect().width);
    if (w === lastW) return;
    clearTimeout(timer); timer = setTimeout(() => { lastW = w; if (visible) build(); else S = null; }, 200);
  });
  ro.observe(root);

  return { refresh() { if (visible) build(); else S = null; } };
}
