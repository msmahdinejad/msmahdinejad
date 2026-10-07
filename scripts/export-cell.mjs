// Writes the unit cell of the girih (6 faces, 24 edges, cell size 100) for the Python image scripts.
//   node scripts/export-cell.mjs
import { writeFileSync } from 'node:fs';
import { unitCell } from '../docs/assets/js/girih.js';

const U = unitCell(100, 64);
const round = (v) => Math.round(v * 1000) / 1000;
writeFileSync(new URL('./cell.json', import.meta.url), JSON.stringify({
  size: 100,
  theta: 64,
  faces: U.faces.map((f) => ({ kind: f.kind, cx: round(f.cx), cy: round(f.cy), pts: Array.from(f.pts, round) })),
  edges: Array.from(U.edges, round),
}));
console.log('cell.json written');
