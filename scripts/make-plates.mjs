// Frames the project visuals for the README the same way the site does (tile wall in the project's colour,
// real screenshot in a window) by photographing the live page. Writes PNGs to PLATE_TMP; plates.py turns them
// into WebP.
//
//   node scripts/make-plates.mjs      (needs Playwright with Chromium)
//   python3 scripts/plates.py
//
// Set SHOWREEL_FRAMES to a folder of numbered PNG frames (the Cinewright ident, ffmpeg -ss 4.4 -vf fps=15) to also
// render the animated Cinewright plate.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const server = await serve(fileURLToPath(new URL('../docs', import.meta.url)));
const base = server.url;
const tmp = process.env.PLATE_TMP || 'plates-tmp';
const frames = process.env.SHOWREEL_FRAMES;          // folder with f000.png ... from the Cinewright ident
mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, reducedMotion: 'reduce' })).newPage();
await page.goto(base + '/index.html?lang=en', { waitUntil: 'load' });
await page.addStyleTag({ content: `
  html, body { background: transparent !important; }
  body::after, .bar, .progress, .skip { display: none !important; }
  [data-reveal] { opacity: 1 !important; transform: none !important; transition: none !important; animation: none !important; }
  .work__media { transform: none !important; transition: none !important; }
  .portrait__star, .flow * { animation: none !important; }
` });
await page.waitForTimeout(1200);

const names = ['cinewright', 'avorythm', 'sourcelens', 'newsroom'];
const media = page.locator('.work__media');
for (let i = 0; i < names.length; i++) {
  const el = media.nth(i);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await el.screenshot({ path: `${tmp}/${names[i]}.png`, omitBackground: true });
}

// the animated one: swap the poster for each frame of the ident
if (frames) {
  const files = readdirSync(frames).filter((f) => f.endsWith('.png')).sort();
  const el = media.nth(0);
  await el.scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    const frame = document.querySelectorAll('.work__media')[0].querySelector('.work__frame');
    frame.querySelectorAll('video').forEach((v) => v.remove());
    const img = document.createElement('img');
    img.id = 'reel';
    frame.prepend(img);
  });
  mkdirSync(`${tmp}/cinewright-frames`, { recursive: true });
  for (let i = 0; i < files.length; i++) {
    const b64 = readFileSync(`${frames}/${files[i]}`).toString('base64');
    await page.evaluate(async (data) => { const img = document.getElementById('reel'); img.src = 'data:image/png;base64,' + data; await img.decode(); }, b64);
    await el.screenshot({ path: `${tmp}/cinewright-frames/${String(i).padStart(3, '0')}.png`, omitBackground: true });
  }
  writeFileSync(`${tmp}/cinewright-frames/count.txt`, String(files.length));
}

await browser.close();
server.close();
console.log('plates photographed');
