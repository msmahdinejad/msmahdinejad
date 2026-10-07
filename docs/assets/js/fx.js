// Smaller motion pieces: headline words, the moving band, magnetic buttons,
// scroll parallax and the footer wordmark. Everything here stands down for reduced motion.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduceQuery = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ----------------------------------------------------- headline words
// Wraps each word in a clipped box so it can rise into place. Keeps <em> and <br>.
function splitWords(root) {
  let i = 0;
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const parts = child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.append(' '); continue; }
          const w = document.createElement('span');
          w.className = 'w';
          const inner = document.createElement('span');
          inner.className = 'wi';
          inner.style.setProperty('--i', i++);
          inner.textContent = part;
          w.append(inner);
          frag.append(w);
        }
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && child.tagName !== 'BR') {
        walk(child);
      }
    }
  };
  walk(root);
  root.classList.add('is-split');
}

// ------------------------------------------------------------- the band
function initBand() {
  const band = $('[data-band]');
  if (!band) return;
  const rows = $$('.band__row', band).map((row) => ({
    track: $('.band__track', row), dir: +row.dataset.dir || 1, x: 0, w: 0,
  }));
  const measure = () => rows.forEach((r) => { r.w = r.track.scrollWidth / 2; });
  measure();
  addEventListener('resize', measure);
  document.fonts.ready.then(measure);

  let visible = false, raf = 0, last = 0, lastY = scrollY, vel = 0;
  new IntersectionObserver((es) => {
    visible = es[0].isIntersecting;
    if (visible && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }).observe(band);

  function tick(now) {
    raf = 0;
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dy = scrollY - lastY;
    lastY = scrollY;
    vel += (dy / Math.max(dt, 0.001) - vel) * 0.12;            // smoothed scroll speed, px/s
    const still = reduceQuery.matches;
    for (const r of rows) {
      if (!r.w) continue;
      const speed = still ? 0 : (34 + Math.min(900, Math.abs(vel)) * 0.35) * r.dir * (vel < -5 ? -1 : 1);
      r.x = (r.x - speed * dt) % r.w;
      if (r.x > 0) r.x -= r.w;
      r.track.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0)`;
    }
    raf = requestAnimationFrame(tick);
  }
}

// --------------------------------------------------------- magnetic pull
function initMagnetic() {
  if (!finePointer) return;
  for (const el of $$('.btn, .chip, [data-magnetic]')) {
    el.addEventListener('pointermove', (e) => {
      if (reduceQuery.matches) return;
      const r = el.getBoundingClientRect();
      const x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      el.style.translate = `${(x * 0.22).toFixed(1)}px ${(y * 0.3).toFixed(1)}px`;
    });
    el.addEventListener('pointerleave', () => { el.style.translate = ''; });
  }
}

// ------------------------------------------------------- scroll parallax
function initParallax() {
  const hero = $('[data-hero]');
  const row = hero && $('.hero__row', hero);
  const frames = $$('.work__frame');
  let ticking = false;
  const update = () => {
    ticking = false;
    if (reduceQuery.matches) return;
    const y = scrollY, vh = innerHeight;
    if (hero && y < hero.offsetHeight) {
      const k = y / hero.offsetHeight;
      hero.style.setProperty('--hs', y.toFixed(1));
      if (row) row.style.opacity = clamp(1 - k * 1.6, 0, 1).toFixed(3);
    }
    for (const f of frames) {
      const r = f.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      const p = (r.top + r.height / 2 - vh / 2) / vh;              // -1 .. 1 across the viewport
      f.style.setProperty('--py', (p * -26).toFixed(1) + 'px');
    }
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// ------------------------------------------------------- footer wordmark
// Each letter's weight follows the pointer; with no pointer around, a slow wave runs through it.
function initWordmark() {
  const mark = $('[data-mark]');
  if (!mark) return;
  const text = mark.textContent.trim();
  mark.textContent = '';
  const letters = [...text].map((ch) => {
    const s = document.createElement('span');
    s.textContent = ch;
    mark.append(s);
    return s;
  });
  // sized at the heaviest weight, so a fully swollen word still fits
  const fit = () => {
    mark.style.fontSize = '100px';
    const saved = letters.map((l) => l.style.fontVariationSettings);
    letters.forEach((l) => { l.style.fontVariationSettings = '"wght" 900, "opsz" 144'; });
    const w = mark.scrollWidth;
    letters.forEach((l, i) => { l.style.fontVariationSettings = saved[i]; });
    const avail = mark.parentElement.clientWidth;
    mark.style.fontSize = (100 * avail / w * 0.995).toFixed(2) + 'px';
  };
  document.fonts.ready.then(fit);
  addEventListener('resize', fit);
  fit();

  let ptr = null, visible = false, raf = 0;
  const host = mark.closest('footer') || mark;
  host.addEventListener('pointermove', (e) => { ptr = { x: e.clientX, y: e.clientY, t: performance.now() }; wake(); }, { passive: true });
  host.addEventListener('pointerleave', () => { ptr = null; });
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; wake(); }).observe(mark);

  const weights = letters.map(() => 300);
  function wake() { if (!raf && visible && !reduceQuery.matches) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    if (!visible) return;
    const rects = letters.map((l) => l.getBoundingClientRect());
    const active = ptr && now - ptr.t < 3000;
    letters.forEach((l, i) => {
      let target;
      if (active) {
        const r = rects[i];
        const d = Math.hypot(ptr.x - (r.left + r.width / 2), (ptr.y - (r.top + r.height / 2)) * 0.6);
        target = 300 + 600 * Math.exp(-(d * d) / (2 * Math.pow(r.height * 0.9, 2)));
      } else {
        target = 300 + 600 * Math.pow(0.5 + 0.5 * Math.sin(now / 900 - i * 0.55), 3);
      }
      weights[i] += (target - weights[i]) * 0.14;
      l.style.fontVariationSettings = `"wght" ${weights[i].toFixed(0)}, "opsz" 144`;
    });
    raf = requestAnimationFrame(tick);
  }
  if (reduceQuery.matches) letters.forEach((l) => { l.style.fontVariationSettings = '"wght" 600, "opsz" 144'; });
}

export function initEffects() {
  $$('.display').forEach(splitWords);
  initBand();
  initMagnetic();
  initParallax();
  initWordmark();
}
