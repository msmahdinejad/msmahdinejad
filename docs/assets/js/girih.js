// Star-and-cross girih on the truncated square tiling (4.8.8).
//
// Hankin's "polygons in contact": from the midpoint of every tile edge two rays
// leave into the tile, `theta` degrees off the edge, and the rays of neighbouring
// edges are joined where they cross. The result is a planar graph whose faces
// (8-point stars, small 4-point stars and the hexagonal petals between them)
// are what the page paints and glazes.

const SQ2 = Math.SQRT2;
const DEG = Math.PI / 180;

function rot(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

function crossAt(p, d, q, e) {
  const det = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(det) < 1e-9) return null;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  const s = (dx * e[1] - dy * e[0]) / det;
  const t = (dx * d[1] - dy * d[0]) / det;
  if (s <= 0 || t <= 0) return null;
  return [p[0] + s * d[0], p[1] + s * d[1]];
}

function starSegments(P, theta) {
  const n = P.length;
  const M = [], U = [];
  for (let k = 0; k < n; k++) {
    const a = P[k], b = P[(k + 1) % n];
    M.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    U.push([dx / l, dy / l]);
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n;
    const dA = rot(U[k][0], U[k][1], theta);
    const dB = rot(-U[j][0], -U[j][1], -theta);
    const X = crossAt(M[k], dA, M[j], dB);
    if (!X) continue;
    out.push([M[k], X], [X, M[j]]);
  }
  return out;
}

// Octagons sit on a square lattice of pitch L, the small squares in the gaps.
function* tiles(x0, y0, x1, y1, L) {
  const R = L / 2 / Math.cos(Math.PI / 8);
  const a = L / (1 + SQ2);
  const i0 = Math.floor(x0 / L) - 1, i1 = Math.ceil(x1 / L) + 1;
  const j0 = Math.floor(y0 / L) - 1, j1 = Math.ceil(y1 / L) + 1;
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const oct = [];
      for (let k = 0; k < 8; k++) {
        const ang = Math.PI / 8 + k * Math.PI / 4;
        oct.push([i * L + R * Math.cos(ang), j * L + R * Math.sin(ang)]);
      }
      yield oct;
      const cx = (i + 0.5) * L, cy = (j + 0.5) * L, rq = a / SQ2;
      yield [[cx + rq, cy], [cx, cy + rq], [cx - rq, cy], [cx, cy - rq]];
    }
  }
}

export const KIND_STAR8 = 0, KIND_PETAL = 1, KIND_STAR4 = 2;

export function buildGirih({ x0 = 0, y0 = 0, x1, y1, L, theta = 64 }) {
  const th = theta * DEG;
  const key = new Map(), pts = [], adj = [];
  const seen = new Set();
  const vid = (p) => {
    const k = Math.round(p[0] * 256) + ',' + Math.round(p[1] * 256);
    let id = key.get(k);
    if (id === undefined) { id = pts.length; key.set(k, id); pts.push(p); adj.push([]); }
    return id;
  };
  for (const P of tiles(x0, y0, x1, y1, L)) {
    for (const [A, B] of starSegments(P, th)) {
      const u = vid(A), v = vid(B);
      if (u === v) continue;
      const k = u < v ? u * 1e7 + v : v * 1e7 + u;
      if (seen.has(k)) continue;
      seen.add(k);
      adj[u].push(v); adj[v].push(u);
    }
  }
  const nv = pts.length;
  for (let u = 0; u < nv; u++) {
    const [ux, uy] = pts[u];
    adj[u].sort((a, b) => Math.atan2(pts[a][1] - uy, pts[a][0] - ux) - Math.atan2(pts[b][1] - uy, pts[b][0] - ux));
  }

  const done = new Set();
  const faces = [];
  for (let u = 0; u < nv; u++) {
    for (const v0 of adj[u]) {
      if (done.has(u * 1e7 + v0)) continue;
      const loop = [];
      let a = u, b = v0, guard = 0;
      while (!done.has(a * 1e7 + b) && guard++ < 64) {
        done.add(a * 1e7 + b);
        loop.push(a);
        const nb = adj[b];
        const c = nb[(nb.indexOf(a) - 1 + nb.length) % nb.length];
        a = b; b = c;
      }
      if (loop.length < 3) continue;
      let area = 0, cx = 0, cy = 0;
      for (let i = 0; i < loop.length; i++) {
        const p = pts[loop[i]], r = pts[loop[(i + 1) % loop.length]];
        const w = p[0] * r[1] - r[0] * p[1];
        area += w; cx += (p[0] + r[0]) * w; cy += (p[1] + r[1]) * w;
      }
      area /= 2;
      if (area <= 1e-6) continue;
      const n = loop.length;
      faces.push({
        ids: Int32Array.from(loop), n, area,
        cx: cx / (6 * area), cy: cy / (6 * area),
        kind: n === 16 ? KIND_STAR8 : n === 8 ? KIND_STAR4 : KIND_PETAL,
      });
    }
  }

  const pos = new Float32Array(nv * 2);
  for (let i = 0; i < nv; i++) { pos[i * 2] = pts[i][0]; pos[i * 2 + 1] = pts[i][1]; }

  // coarse bucket grid over face centroids, for "what is near the pointer"
  const cell = L;
  const gx0 = x0 - L, gy0 = y0 - L;
  const cols = Math.ceil((x1 - x0) / cell) + 3, rows = Math.ceil((y1 - y0) / cell) + 3;
  const buckets = Array.from({ length: cols * rows }, () => []);
  faces.forEach((f, i) => {
    const c = Math.floor((f.cx - gx0) / cell), r = Math.floor((f.cy - gy0) / cell);
    if (c >= 0 && r >= 0 && c < cols && r < rows) buckets[r * cols + c].push(i);
  });
  function near(x, y, rad, cb) {
    const c0 = Math.max(0, Math.floor((x - rad - gx0) / cell)), c1 = Math.min(cols - 1, Math.floor((x + rad - gx0) / cell));
    const r0 = Math.max(0, Math.floor((y - rad - gy0) / cell)), r1 = Math.min(rows - 1, Math.floor((y + rad - gy0) / cell));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) for (const i of buckets[r * cols + c]) cb(i, faces[i]);
  }

  return { L, theta, pos, faces, adj, near };
}

// The pattern repeats every L px in both directions, so one cell is enough: its faces and
// edges, relative to the cell origin. Every face belongs to exactly one cell (by its centroid).
export function unitCell(L, theta = 64) {
  const N = 6;
  const G = buildGirih({ x0: 0, y0: 0, x1: N * L, y1: N * L, L, theta });
  const d = 0.0137 * L;                         // keeps lattice-aligned centroids off the cell border
  const ox = 2 * L, oy = 2 * L;
  const inCell = (x, y) => x >= d && x < L + d && y >= d && y < L + d;
  const faces = [];
  for (const f of G.faces) {
    const cx = f.cx - ox, cy = f.cy - oy;
    if (!inCell(cx, cy)) continue;
    const pts = new Float32Array(f.ids.length * 2);
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    f.ids.forEach((id, k) => {
      const x = G.pos[id * 2] - ox, y = G.pos[id * 2 + 1] - oy;
      pts[k * 2] = x; pts[k * 2 + 1] = y;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
    faces.push({ pts, cx, cy, kind: f.kind, n: f.n, x0, y0, x1, y1 });
  }
  const edges = [];
  for (let u = 0; u < G.adj.length; u++) {
    for (const v of G.adj[u]) {
      if (v < u) continue;
      const ax = G.pos[u * 2] - ox, ay = G.pos[u * 2 + 1] - oy, bx = G.pos[v * 2] - ox, by = G.pos[v * 2 + 1] - oy;
      if (inCell((ax + bx) / 2, (ay + by) / 2)) edges.push(ax, ay, bx, by);
    }
  }
  return { L, theta, n: faces.length, faces, edges: Float32Array.from(edges) };
}

// the same star as a closed path, used for the logo mark
export function starPath(cx, cy, R, theta = 60) {
  const G = buildGirih({ x0: -2, y0: -2, x1: 2, y1: 2, L: 1, theta });
  let best = null;
  for (const f of G.faces) {
    if (f.kind !== KIND_STAR8) continue;
    if (!best || Math.hypot(f.cx, f.cy) < Math.hypot(best.cx, best.cy)) best = f;
  }
  let rmax = 0;
  for (const id of best.ids) rmax = Math.max(rmax, Math.hypot(G.pos[id * 2] - best.cx, G.pos[id * 2 + 1] - best.cy));
  const k = R / rmax;
  return Array.from(best.ids).map((id, i) => {
    const x = cx + (G.pos[id * 2] - best.cx) * k, y = cy + (G.pos[id * 2 + 1] - best.cy) * k;
    return (i ? 'L' : 'M') + x.toFixed(2) + ' ' + y.toFixed(2);
  }).join('') + 'Z';
}
