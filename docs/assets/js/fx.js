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
// The drift itself is a CSS animation, so it runs on the compositor and costs the page nothing.
// Scrolling only nudges its playback rate (and flips it when scrolling back up).
function initBand() {
  const band = $('[data-band]');
  if (!band || reduceQuery.matches) return;
  const anims = $$('.band__track', band).map((t) => t.getAnimations()[0]).filter(Boolean);
  if (!anims.length) return;
  let lastY = scrollY, lastT = performance.now(), boost = 0, sign = 1, raf = 0;
  const apply = () => anims.forEach((a) => { a.playbackRate = sign * (1 + boost); });
  function settle() {
    raf = 0;
    boost *= 0.92;
    if (boost < 0.02) { boost = 0; sign = 1; apply(); return; }
    apply();
    raf = requestAnimationFrame(settle);
  }
  addEventListener('scroll', () => {
    const now = performance.now(), dy = scrollY - lastY, dt = Math.max(8, now - lastT);
    lastY = scrollY; lastT = now;
    boost = Math.min(6, Math.max(boost, Math.abs(dy) / dt * 2.2));
    sign = dy < 0 ? -1 : 1;
    if (!raf) raf = requestAnimationFrame(settle);
  }, { passive: true });
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
// The hero's lettering drifts a little slower than the page and the copy fades out. Sizes are read
// once per resize, and every frame reads all positions before it writes anything, so scrolling never
// forces an extra layout.
function initParallax() {
  const hero = $('[data-hero]');
  const row = hero && $('.hero__row', hero);
  const frames = $$('.work__frame');
  let ticking = false, heroH = hero ? hero.offsetHeight : 0, heroDone = false;
  addEventListener('resize', () => { heroH = hero ? hero.offsetHeight : 0; }, { passive: true });
  const update = () => {
    ticking = false;
    if (reduceQuery.matches) return;
    const y = scrollY, vh = innerHeight;
    const spots = [];
    for (const f of frames) {
      const r = f.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) continue;
      spots.push([f, (r.top + r.height / 2 - vh / 2) / vh]);       // -1 .. 1 across the viewport
    }
    if (hero && (y < heroH || !heroDone)) {
      const yy = Math.min(y, heroH);
      heroDone = y >= heroH;
      const drift = `0 ${(yy * 0.22).toFixed(1)}px`;
      for (const el of hero.querySelectorAll('.hero__inlay, .hero__shine')) el.style.translate = drift;
      if (row) row.style.opacity = clamp(1 - (yy / heroH) * 1.6, 0, 1).toFixed(3);
    }
    for (const [f, p] of spots) f.style.setProperty('--py', (p * -26).toFixed(1) + 'px');
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}

// ------------------------------------------------------- footer wordmark
// Each letter's weight follows the pointer. With no pointer around it plays one wave when it
// comes into view, then rests. The loop only runs while something is changing.
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
  const REST = 300;
  const set = (l, w) => { l.style.fontVariationSettings = `"wght" ${w.toFixed(0)}, "opsz" 144`; };

  // sized at the heaviest weight, so a fully swollen word still fits
  let centres = [];
  const fit = () => {
    mark.style.fontSize = '100px';
    letters.forEach((l) => set(l, 900));
    const w = mark.scrollWidth;
    mark.style.fontSize = (100 * mark.parentElement.clientWidth / w * 0.995).toFixed(2) + 'px';
    letters.forEach((l, i) => set(l, weights[i]));
    const r0 = mark.getBoundingClientRect();
    centres = letters.map((l) => { const r = l.getBoundingClientRect(); return { x: r.left - r0.left + r.width / 2, y: r.top - r0.top + r.height / 2, h: r.height }; });
  };
  const weights = letters.map(() => REST);
  document.fonts.ready.then(fit);
  addEventListener('resize', fit);
  fit();

  if (reduceQuery.matches) { letters.forEach((l) => set(l, 600)); return; }

  let ptr = null, raf = 0, wave = -1;
  const host = mark.closest('footer') || mark;
  host.addEventListener('pointermove', (e) => { ptr = { x: e.clientX, y: e.clientY }; wake(); }, { passive: true });
  host.addEventListener('pointerleave', () => { ptr = null; wake(); });
  new IntersectionObserver((es) => {
    if (es[0].isIntersecting && wave < 0) { wave = performance.now(); wake(); }
  }, { threshold: 0.4 }).observe(mark);

  function wake() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(now) {
    raf = 0;
    const r0 = mark.getBoundingClientRect();
    const t = wave >= 0 ? (now - wave) / 1000 : 99;
    let moving = false;
    letters.forEach((l, i) => {
      const c = centres[i];
      let target = REST;
      if (ptr) {
        const d = Math.hypot(ptr.x - (r0.left + c.x), (ptr.y - (r0.top + c.y)) * 0.6);
        target = REST + 600 * Math.exp(-(d * d) / (2 * Math.pow(c.h * 0.9, 2)));
      } else if (t < 2.6) {
        const x = t * 1.6 - i / letters.length * 1.2;          // a crest that runs left to right once
        target = REST + 600 * Math.exp(-Math.pow((x - 0.6) * 4, 2));
      }
      const next = weights[i] + (target - weights[i]) * 0.16;
      if (Math.abs(next - weights[i]) > 0.5 || Math.abs(target - next) > 0.5) moving = true;
      weights[i] = next;
      set(l, next);
    });
    if (moving || t < 2.6) raf = requestAnimationFrame(tick);
  }
}

export function initEffects() {
  $$('.display').forEach(splitWords);
  initBand();
  initMagnetic();
  initParallax();
  initWordmark();
}
