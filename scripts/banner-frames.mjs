// Photographs one loop of the banner SVG, frame by frame, by stepping its CSS animation clocks.
//   node scripts/banner-frames.mjs scripts/build/hero-light.svg scripts/build/frames-light [width] [fps]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [, , svgFile, outDir, width = '1760', fps = '8'] = process.argv;
const LOOP = 7.2;          // seconds; matches the glaze animation in make_banner.py
mkdirSync(outDir, { recursive: true });
const svg = readFileSync(svgFile, 'utf8');
const [, W, H] = svg.match(/viewBox="0 0 (\d+) (\d+)"/).map(Number);
const w = +width, h = Math.round((w * H) / W);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`);
await page.waitForTimeout(300);
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));
const n = Math.round(LOOP * +fps);
for (let i = 0; i < n; i++) {
  const t = 40000 + (i * 1000) / +fps;      // well past the one-time intro
  await page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), t);
  await page.screenshot({ path: `${outDir}/f${String(i).padStart(3, '0')}.png` });
}
await browser.close();
console.log(`${n} frames, ${w}x${h}`);
