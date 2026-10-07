import { createHero } from './hero.js';
import { createWall } from './wall.js';
import { initEffects } from './fx.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const html = document.documentElement;
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = { theme: html.dataset.theme === 'dark' ? 'dark' : 'light' };
const EMAIL = 'msmahdinejad@gmail.com';
const nf = new Intl.NumberFormat('en-US');

// ------------------------------------------------------------------ hero
const heroEl = $('[data-hero]');
const hero = createHero({
  root: heroEl,
  wall: $('.hero__wall', heroEl),
  nameSlot: $('[data-name-slot]', heroEl),
  getTheme: () => state.theme,
});

const contactEl = $('#contact');
const wall = createWall({ root: contactEl, canvas: $('.contact__wall', contactEl), getTheme: () => state.theme });

// ------------------------------------------------------------------ theme
function setTheme(theme) {
  state.theme = theme;
  html.dataset.theme = theme;
  store.set('theme', theme);
  wall.refresh();
  return hero.refresh({ replay: false });     // the view transition waits for the new hero
}

function toggleTheme(origin) {
  const next = state.theme === 'dark' ? 'light' : 'dark';
  if (!document.startViewTransition || reduced() || !origin) return setTheme(next);
  const x = origin.x, y = origin.y;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const vt = document.startViewTransition(() => setTheme(next));
  vt.ready.then(() => html.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
    { duration: 700, easing: 'cubic-bezier(.2,.7,.2,1)', pseudoElement: '::view-transition-new(root)' },
  )).catch(() => {});
}

$('[data-theme-toggle]').addEventListener('click', (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  toggleTheme({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
});

// ------------------------------------------------------------- the clock
const clockEl = $('[data-clock]');
const clockFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tehran', hour: '2-digit', minute: '2-digit', hour12: false });
function tickClock() {
  if (clockEl) clockEl.innerHTML = `${clockFmt.format(new Date())}<span class="tz"> · local time</span>`;
}
tickClock(); setInterval(tickClock, 15000);

// -------------------------------------------------- top bar, progress, nav
const bar = $('[data-bar]');
const prog = $('[data-progress]');
let lastY = scrollY, ticking = false;
function onScroll() {
  ticking = false;
  const y = scrollY;
  bar.classList.toggle('is-solid', y > 24);
  bar.classList.toggle('is-away', y > lastY + 4 && y > 520 && !paletteOpen);
  if (y < lastY - 4) bar.classList.remove('is-away');
  lastY = y;
  const max = document.documentElement.scrollHeight - innerHeight;
  prog.style.setProperty('--p', max > 0 ? Math.min(1, y / max).toFixed(4) : 0);
}
addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });

const navLinks = $$('.nav a');
const secObs = new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    navLinks.forEach((a) => a.classList.toggle('is-on', a.getAttribute('href') === '#' + e.target.id));
  }
}, { rootMargin: '-45% 0px -50% 0px' });
$$('[data-section]').forEach((s) => secObs.observe(s));

// --------------------------------------------------- reveal + counters
initEffects();   // splits headings into words, so it runs before the reveal observer

function countUp(el, to) {
  const dur = 1300, t0 = performance.now();
  if (reduced()) { el.textContent = nf.format(to); return; }
  (function step(now) {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 4);
    el.textContent = nf.format(Math.round(to * e));
    if (p < 1) requestAnimationFrame(step);
  })(t0);
}
const revealObs = new IntersectionObserver((es) => {
  for (const e of es) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('in');
    $$('[data-count]', e.target).forEach((n) => countUp(n, +n.dataset.count));
    revealObs.unobserve(e.target);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
$$('[data-reveal]').forEach((el) => revealObs.observe(el));
onScroll();

// ------------------------------------------------------------- tilt
if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
  for (const el of $$('[data-tilt]')) {
    el.addEventListener('pointermove', (e) => {
      if (reduced()) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.classList.add('is-tilting');
      el.style.setProperty('--ry', (x * 7).toFixed(2) + 'deg');
      el.style.setProperty('--rx', (-y * 6).toFixed(2) + 'deg');
      el.style.setProperty('--gx', ((x + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--gy', ((y + 0.5) * 100).toFixed(1) + '%');
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('is-tilting');
      el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg');
    });
  }
}

// ------------------------------------------- pause what you can't see
const offObs = new IntersectionObserver((es) => {
  for (const e of es) e.target.classList.toggle('is-off', !e.isIntersecting);
}, { rootMargin: '120px 0px' });
$$('.hero, .band, [data-section]').forEach((el) => offObs.observe(el));

// ----------------------------------------------------------- videos
const videos = $$('video[data-src]');
function inView(v) {
  const r = v.getBoundingClientRect();
  return r.bottom > innerHeight * 0.1 && r.top < innerHeight * 0.9 && r.width > 0;
}
const lite = html.classList.contains('lite');
function syncVideo(v) {
  if (v.dataset.poster && !v.poster) v.poster = v.dataset.poster;
  if (reduced() || lite) { v.pause(); return; }      // the poster is enough on save-data / tiny devices
  if (inView(v) && !document.hidden) {
    if (!v.getAttribute('src')) v.src = v.dataset.src;
    v.play().catch(() => {});
  } else v.pause();
}
function syncVideos() { videos.forEach(syncVideo); }
const vidObs = new IntersectionObserver(() => syncVideos(), { threshold: [0, 0.25, 0.6] });
videos.forEach((v) => vidObs.observe(v));
document.addEventListener('visibilitychange', syncVideos);

// ------------------------------------------------------ live GitHub data
const GH_USER = 'msmahdinejad';
let gh = null;
const relFmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
function rel(iso) {
  const s = (new Date(iso).getTime() - Date.now()) / 1000, a = Math.abs(s);
  if (a < 3600) return relFmt.format(Math.round(s / 60), 'minute');
  if (a < 86400) return relFmt.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 30) return relFmt.format(Math.round(s / 86400), 'day');
  if (a < 86400 * 365) return relFmt.format(Math.round(s / (86400 * 30)), 'month');
  return relFmt.format(Math.round(s / (86400 * 365)), 'year');
}
function renderWhen() { $$('[data-when]').forEach((el) => { el.textContent = rel(el.dataset.when); }); }
function setStat(k, v) {
  const el = $(`[data-stat="${k}"]`);
  if (!el || v == null) return;
  el.dataset.count = v;
  if (el.closest('.in')) el.textContent = nf.format(v);
}

function renderGitHub() {
  if (!gh) return;
  const own = gh.repos.filter((r) => !r.fork && r.name.toLowerCase() !== GH_USER);
  const recent = [...own].sort((a, b) => b.pushed_at.localeCompare(a.pushed_at));
  $('[data-recent]').innerHTML = recent.slice(0, 5).map((r) => `<li><a href="${r.html_url}" target="_blank" rel="noopener"><b>${r.name}</b><span class="when" data-when="${r.pushed_at}"></span></a></li>`).join('');
  const lately = $('[data-lately]');
  if (lately) lately.innerHTML = recent.slice(0, 4).map((r) => `<a href="${r.html_url}" target="_blank" rel="noopener">${r.name[0].toUpperCase() + r.name.slice(1)}</a>`).join(', ');
  const counts = {};
  own.forEach((r) => { if (r.language) counts[r.language] = (counts[r.language] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total = top.reduce((n, [, c]) => n + c, 0);
  const cols = ['var(--lapis)', 'var(--turq)', 'var(--saffron)', 'var(--brick)', '#7a5af8', 'var(--ink-3)'];
  const box = $('[data-langs]');
  if (total) {
    box.hidden = false;
    box.innerHTML = `<div class="langs__bar" role="img" aria-label="Languages: ${top.map(([l, c]) => `${l} ${c}`).join(', ')}">${top.map(([, c], i) => `<i style="flex:${c};background:${cols[i]}"></i>`).join('')}</div><div class="langs__key">${top.map(([l], i) => `<span style="--k:${cols[i]}">${l}</span>`).join('')}</div>`;
  }
  setStat('repos', gh.user.public_repos);
  setStat('followers', gh.user.followers);
  setStat('stars', gh.stars);
  renderWhen();
}

async function loadGitHub() {
  let cached = null;
  try { cached = JSON.parse(store.get('gh') || 'null'); } catch { /* ignore */ }
  if (cached && Date.now() - cached.t < 30 * 60 * 1000) { gh = cached; return renderGitHub(); }
  try {
    const [u, r] = await Promise.all([
      fetch(`https://api.github.com/users/${GH_USER}`),
      fetch(`https://api.github.com/users/${GH_USER}/repos?per_page=100&sort=pushed`),
    ]);
    if (!u.ok || !r.ok) throw new Error('github ' + u.status);
    const user = await u.json(), repos = await r.json();
    gh = {
      t: Date.now(),
      user: { public_repos: user.public_repos, followers: user.followers },
      repos: repos.map((x) => ({ name: x.name, html_url: x.html_url, fork: x.fork, language: x.language, pushed_at: x.pushed_at, stargazers_count: x.stargazers_count })),
    };
    gh.stars = gh.repos.filter((x) => !x.fork).reduce((n, x) => n + x.stargazers_count, 0);
    store.set('gh', JSON.stringify(gh));
    renderGitHub();
  } catch {
    if (cached) { gh = cached; renderGitHub(); }   // stale is better than nothing; the page already has a snapshot
    renderWhen();
  }
}
renderWhen();
const ghObs = new IntersectionObserver((es) => { if (es[0].isIntersecting) { ghObs.disconnect(); loadGitHub(); } }, { rootMargin: '600px 0px' });
ghObs.observe($('[data-gh]'));

// ------------------------------------------------------------ toast + copy
const toastEl = $('[data-toast]');
let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch { /* nothing else to try */ }
    ta.remove();
  }
  toast('Email address copied');
}
$$('[data-copy-btn]').forEach((b) => b.addEventListener('click', () => copy(b.dataset.copyBtn)));

// ---------------------------------------------------------- command menu
const pal = $('[data-palette]');
const palInput = $('[data-palette-input]');
const palList = $('[data-palette-list]');
let paletteOpen = false, palIndex = 0, palItems = [], palReturn = null;

const go = (hash) => () => { const el = $(hash); if (el) el.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth' }); };
const ext = (url) => () => window.open(url, '_blank', 'noopener');
const GROUPS = { go: 'Go to', work: 'Projects', act: 'Actions', on: 'Elsewhere' };
function commands() {
  const c = [
    { g: 'go', en: 'About', run: go('#about') },
    { g: 'go', en: 'Selected work', run: go('#work') },
    { g: 'go', en: 'How I build agents', run: go('#approach') },
    { g: 'go', en: 'Also built', run: go('#more') },
    { g: 'go', en: 'GitHub, live', run: go('#github') },
    { g: 'go', en: 'Contact', run: go('#contact') },
    { g: 'work', en: 'Cinewright', hint: 'GitHub', run: ext('https://github.com/msmahdinejad/cinewright') },
    { g: 'work', en: 'Avorythm', hint: 'GitHub', run: ext('https://github.com/msmahdinejad/avorythm') },
    { g: 'work', en: 'SourceLens', hint: 'GitHub', run: ext('https://github.com/msmahdinejad/SourceLens') },
    { g: 'work', en: 'Newsroom', hint: 'GitHub', run: ext('https://github.com/msmahdinejad/Newsroom') },
    { g: 'work', en: 'AsanBimeh', hint: 'asan-bimeh.ir', run: ext('https://asan-bimeh.ir') },
    { g: 'work', en: 'TREX AI', hint: 'trexchat.ir', run: ext('https://trexchat.ir') },
    { g: 'act', en: 'Copy email address', hint: EMAIL, run: () => copy(EMAIL) },
    { g: 'act', en: 'Write an email', run: () => { location.href = 'mailto:' + EMAIL; } },
    { g: 'act', en: state.theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme', run: () => toggleTheme(null) },
    { g: 'on', en: 'GitHub profile', run: ext('https://github.com/msmahdinejad') },
    { g: 'on', en: 'LinkedIn', run: ext('https://www.linkedin.com/in/msmahdinejad/') },
    { g: 'on', en: 'Telegram · Vertex Studio', run: ext('https://t.me/vertex_studi0') },
  ];
  return c;
}
const norm = (s) => s.toLowerCase();

function renderPalette() {
  const q = norm(palInput.value.trim());
  const all = commands();
  palItems = all.filter((c) => !q || norm(c.en + ' ' + (c.hint || '')).includes(q));
  if (palIndex >= palItems.length) palIndex = Math.max(0, palItems.length - 1);
  let out = '', lastG = '';
  palItems.forEach((c, i) => {
    if (c.g !== lastG) { out += `<li class="pal__group mono" role="presentation">${GROUPS[c.g]}</li>`; lastG = c.g; }
    out += `<li role="option" id="pal-${i}" class="pal__item" aria-selected="${i === palIndex}" data-i="${i}"><span>${c.en}</span>${c.hint ? `<small>${c.hint}</small>` : ''}</li>`;
  });
  palList.innerHTML = out || `<li class="pal__empty">Nothing matches</li>`;
  palInput.setAttribute('aria-activedescendant', palItems.length ? 'pal-' + palIndex : '');
  const sel = $('[aria-selected="true"]', palList);
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function openPalette() {
  if (paletteOpen) return;
  paletteOpen = true; palReturn = document.activeElement;
  pal.hidden = false; palInput.value = ''; palIndex = 0; renderPalette();
  requestAnimationFrame(() => palInput.focus());
  document.body.style.overflow = 'hidden';
}
function closePalette() {
  if (!paletteOpen) return;
  paletteOpen = false; pal.hidden = true; document.body.style.overflow = '';
  if (palReturn && palReturn.focus) palReturn.focus();
}
function runPalette(i) {
  const c = palItems[i]; if (!c) return;
  closePalette(); setTimeout(c.run, 60);
}
$('[data-palette-open]').addEventListener('click', openPalette);
$$('[data-palette-close]').forEach((el) => el.addEventListener('click', closePalette));
palInput.addEventListener('input', () => { palIndex = 0; renderPalette(); });
palList.addEventListener('click', (e) => { const li = e.target.closest('[data-i]'); if (li) runPalette(+li.dataset.i); });
palList.addEventListener('pointermove', (e) => { const li = e.target.closest('[data-i]'); if (li && +li.dataset.i !== palIndex) { palIndex = +li.dataset.i; $$('[data-i]', palList).forEach((n) => n.setAttribute('aria-selected', +n.dataset.i === palIndex)); } });
addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) { e.preventDefault(); paletteOpen ? closePalette() : openPalette(); return; }
  if (e.key === '/' && !typing && !paletteOpen) { e.preventDefault(); openPalette(); return; }
  if (!paletteOpen) return;
  if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); palIndex = Math.min(palItems.length - 1, palIndex + 1); renderPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palIndex = Math.max(0, palIndex - 1); renderPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runPalette(palIndex); }
  else if (e.key === 'Tab') { e.preventDefault(); palInput.focus(); }
});
$('[data-palette-open] kbd').textContent = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
$('[data-palette-open]').setAttribute('aria-label', $('[data-palette-open] kbd').textContent + ', open command menu');
