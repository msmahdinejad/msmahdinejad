// Renders the link-preview card (docs/assets/img/og.jpg) and the touch icon (docs/apple-touch-icon.png).
// Needs Playwright with Chromium:   npm i playwright   then   node scripts/social-assets.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { serve } from './serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await serve(root);
const browser = await chromium.launch();

const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' })).newPage();
await page.goto(server.url + '/scripts/og/', { waitUntil: 'load' });
await page.waitForTimeout(1800);
await page.locator('#card').screenshot({ path: root + 'docs/assets/img/og.jpg', type: 'jpeg', quality: 80 });

const svg = readFileSync(root + 'docs/favicon.svg', 'utf8').replace(' rx="22"', '');
const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
await icon.setContent(`<body style="margin:0">${svg.replace('<svg ', '<svg width="180" height="180" ')}</body>`);
await icon.screenshot({ path: root + 'docs/apple-touch-icon.png' });

await browser.close();
server.close();
console.log('wrote og.jpg and apple-touch-icon.png');
