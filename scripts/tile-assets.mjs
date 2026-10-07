// Writes the small vector assets that come straight from the girih geometry:
//   docs/assets/img/girih.svg   one repeat of the wall pattern (used as a CSS mask)
//   docs/favicon.svg            the eight-point star
// Run: node scripts/tile-assets.mjs
import { writeFileSync } from 'node:fs';
import { unitCell, starPath } from '../docs/assets/js/girih.js';

const L = 48;
const U = unitCell(L, 64);
const seg = [];
for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
  for (let q = 0; q < U.edges.length; q += 4) {
    const f = (v, d) => (v + d * L).toFixed(2);
    seg.push(`M${f(U.edges[q], dx)} ${f(U.edges[q + 1], dy)}L${f(U.edges[q + 2], dx)} ${f(U.edges[q + 3], dy)}`);
  }
}
writeFileSync(new URL('../docs/assets/img/girih.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L} ${L}" width="${L}" height="${L}"><path d="${seg.join('')}" fill="none" stroke="#000" stroke-width="1.15" stroke-linecap="round"/></svg>\n`);

const star = starPath(50, 50, 38, 60);
writeFileSync(new URL('../docs/favicon.svg', import.meta.url),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#f3eee3"/><path d="${star}" fill="#1b3a8c" stroke="#0e1f55" stroke-width="2.2" stroke-linejoin="round"/><circle cx="50" cy="50" r="9" fill="#19b5a5"/></svg>\n`);
console.log('ok');
