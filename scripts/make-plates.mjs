// Frames the project visuals for the README the same way the site does (tile wall in the project's colour,
// real screenshot in a window) by photographing the live page. Writes PNGs to PLATE_TMP; plates.py turns them
// into WebP.
//
//   node scripts/make-plates.mjs      (needs Playwright with Chromium)
//   python3 scripts/plates.py
//
// Set SHOWREEL_FRAMES to a folder of numbered PNG frames to also render the animated Cinewright plate.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const server = await serve(fileURLToPath(new URL('../docs', import.meta.url)));
const base = server.url;
const tmp = process.env.PLATE_TMP || 'plates-tmp';
const frames = process.env.SHOWREEL_FRAMES;          // folder with f000.png ... of the Cinewright showreel
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

// the animated one: swap the poster for each frame of the showreel
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

// products in production: a wordmark in a browser window, in the brand colour
const prod = [
  { id: 'asanbimeh', name: 'AsanBimeh', host: 'asan-bimeh.ir', tag: 'Compare, understand, decide.', c: '#2563eb' },
  { id: 'trex', name: 'TREX AI', host: 'trexchat.ir', tag: 'Many models, one workspace.', c: '#7c3aed' },
];
for (const p of prod) {
  await page.setContent(`<!doctype html><html lang="en" data-theme="light"><head><link rel="stylesheet" href="${base}/assets/css/site.css">
    <style>
      html, body { background: transparent; margin: 0; }
      body::after { display: none; }
      .plate { width: 640px; --c: ${p.c}; }
      .win { position: absolute; inset: 9% 7%; border-radius: 12px; overflow: hidden; background: #fbf8f1; box-shadow: 0 34px 60px -26px rgba(5,8,20,.7), 0 0 0 1px rgba(0,0,0,.12); display: grid; grid-template-rows: auto 1fr; }
      .bar2 { display: flex; align-items: center; gap: 7px; padding: 10px 14px; background: #ece5d6; border-bottom: 1px solid rgba(0,0,0,.08); }
      .bar2 i { width: 9px; height: 9px; border-radius: 50%; background: rgba(0,0,0,.18); }
      .bar2 span { margin-inline-start: 10px; padding: 3px 12px; border-radius: 99px; background: #fbf8f1; font: 12px var(--mono); color: #596176; }
      .body { position: relative; display: grid; place-content: center; text-align: center; gap: 10px; background: color-mix(in srgb, var(--c) 8%, #fbf8f1); }
      .body::before { content: ""; position: absolute; inset: 0; background: var(--c); opacity: .13; -webkit-mask: url(${base}/assets/img/girih.svg) 0 0 / 46px 46px; mask: url(${base}/assets/img/girih.svg) 0 0 / 46px 46px; }
      .body h3 { position: relative; font: 600 66px/1 var(--display); letter-spacing: -.03em; color: #101826; font-variation-settings: "opsz" 144; }
      .body p { position: relative; font: italic 400 22px/1.3 var(--display); color: #3b4457; }
    </style></head><body>
    <div class="work__media plate" style="transform:none"><div class="work__wall"></div>
      <div class="win"><div class="bar2"><i></i><i></i><i></i><span>${p.host}</span></div><div class="body"><h3>${p.name}</h3><p>${p.tag}</p></div></div>
      <span class="work__chip mono">In production</span></div></body></html>`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.locator('.plate').screenshot({ path: `${tmp}/${p.id}.png`, omitBackground: true });
}
await browser.close();
server.close();
console.log('plates photographed');
