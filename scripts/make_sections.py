#!/usr/bin/env python3
"""README section heads and the 'how I build agents' strip.

    python3 scripts/make_sections.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from glyphs import GlyphSet, text_path  # noqa: E402
from make_banner import FONTS, f1  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'
MONO = str(FONTS / 'fragment-mono.woff2')
SERIF = str(FONTS / 'fraunces.woff2')
SANS = str(FONTS / 'hanken-grotesk.woff2')


# ------------------------------------------------------------------ section heads
def section_head(out, num, label, alt):
    W, H = 1600, 64
    size = 25
    track = 0.09
    lab = label.upper()
    lw = text_path(MONO, lab, size, tracking=track)[1]
    nd = text_path(MONO, num, size, tracking=track, x=2, y=40)[0]
    nw = text_path(MONO, num, size, tracking=track)[1]
    ld = text_path(MONO, lab, size, tracking=track, x=W - 2 - lw, y=40)[0]
    x0, x1 = 2 + nw + 26, W - 2 - lw - 26
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{alt}">
<title>{alt}</title>
<path d="{nd}" fill="#19b5a5"/>
<rect x="{f1(x0)}" y="32" width="{f1(x1 - x0)}" height="1.6" fill="#7d8499" fill-opacity=".5"/>
<path d="{ld}" fill="#7d8499"/>
</svg>
'''
    Path(out).write_text(svg)


# --------------------------------------------------------------------- the strip
THEMES = {
    'light': dict(bg='#f3eee3', ink='#101826', ink2='#3b4457', ink3='#596176', accent='#09706a', teal='#09706a', saffron='#e5a93d',
                  brick='#c65d3b', rail='#e1d8c4', paper='#fbf8f1', rule='#101826'),
    'dark': dict(bg='#0b1020', ink='#ece7db', ink2='#b9b8b2', ink3='#8f93a0', accent='#3ccfc0', teal='#3ccfc0', saffron='#f0b955',
                 brick='#e07a58', rail='#19224a', paper='#111833', rule='#ece7db'),
}

COLUMNS = [
    ('ground', 'Ground every claim.',
     "Answers point at the page they came from. When the sources can't support an answer, the system says so instead of improvising."),
    ('leash', 'Keep actions on a leash.',
     'Tools have schemas. Irreversible steps wait for a yes. New sources and model routes stay off until someone has checked them.'),
    ('survive', 'Make long work survive.',
     'Queues, checkpoints, retries and cancellation. Progress you can watch, and recovery when the process restarts.'),
    ('shape', 'Check the shape before the content.',
     'Model output is parsed against a schema. A malformed tool call is repaired or retried, never trusted.'),
]


def wrap(font, text, size, max_w, **kw):
    words, lines, cur = text.split(), [], ''
    for w in words:
        t = (cur + ' ' + w).strip()
        if text_path(font, t, size, **kw)[1] <= max_w or not cur:
            cur = t
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def wrap_balanced(font, text, size, max_w, **kw):
    """Same line count as the greedy wrap, but with the lines as even as possible."""
    base = wrap(font, text, size, max_w, **kw)
    if len(base) < 2:
        return base
    lo, hi = 40.0, max_w
    best = base
    for _ in range(14):
        mid = (lo + hi) / 2
        trial = wrap(font, text, size, mid, **kw)
        if len(trial) <= len(base):
            best, hi = trial, mid
        else:
            lo = mid
    return best


def art(kind, T):
    """The four little animations, 200 x 110. Colours come from the theme; motion is CSS."""
    if kind == 'ground':
        three = text_path(SANS, '3', 12, variations={'wght': 760}, x=183 - 3.6, y=26.4)[0]
        return f'''<g class="a1w" fill="none" stroke="{T['teal']}" stroke-width="1.7" stroke-dasharray="3 5"><path d="M70 20C104 20 104 53 132 53"/><path d="M70 46C100 46 108 53 132 53"/><path d="M70 72C104 72 104 53 132 53"/></g>
<g fill="{T['rail']}"><rect x="6" y="14" width="64" height="12" rx="6"/><rect x="6" y="40" width="64" height="12" rx="6"/><rect x="6" y="66" width="64" height="12" rx="6"/></g>
<rect x="132" y="22" width="62" height="62" rx="10" fill="{T['paper']}" stroke="{T['ink']}" stroke-width="1.6"/>
<path d="M144 40h38M144 52h30M144 64h36" stroke="{T['ink3']}" stroke-width="3" stroke-linecap="round"/>
<g class="a1c"><rect x="170" y="14" width="26" height="16" rx="8" fill="{T['saffron']}" stroke="{T['ink']}" stroke-width="1.4"/><path d="{three}" fill="#101826"/></g>'''
    if kind == 'leash':
        return f'''<path d="M10 55H190" stroke="{T['ink3']}" stroke-width="1.6" stroke-dasharray="2 6" stroke-linecap="round" fill="none"/>
<path d="M100 22V88" stroke="{T['ink']}" stroke-width="2" fill="none"/>
<path class="a2d" d="M100 22L124 32V78L100 88" fill="{T['saffron']}" fill-opacity=".38" stroke="{T['ink']}" stroke-width="2" stroke-linejoin="round"/>
<circle class="a2b" cx="22" cy="55" r="9" fill="{T['teal']}"/>
<g class="a2y"><rect x="66" y="94" width="68" height="14" rx="7" fill="{T['teal']}"/><path d="M82 101l4 4 8-9" fill="none" stroke="{T['bg']}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>'''
    if kind == 'survive':
        return f'''<rect x="10" y="48" width="180" height="14" rx="7" fill="{T['rail']}"/>
<rect class="a3f" x="10" y="48" width="180" height="14" rx="7" fill="{T['teal']}"/>
<path d="M55 40v30M100 40v30M145 40v30" stroke="{T['ink']}" stroke-width="1.6" stroke-linecap="round"/>
<path class="a3x" d="M104 28l12 12M116 28l-12 12" stroke="{T['brick']}" stroke-width="3" stroke-linecap="round"/>'''
    lb = text_path(MONO, '{', 74, x=8, y=80)[0]
    rb = text_path(MONO, '}', 74, x=150, y=80)[0]
    return f'''<path d="{lb}" fill="{T['ink3']}"/><path d="{rb}" fill="{T['ink3']}"/>
<g stroke="{T['ink']}" stroke-width="3" stroke-linecap="round"><path d="M52 34h64M52 76h52"/><path class="a4b" d="M52 55h86" stroke="{T['brick']}"/></g>
<path class="a4k" d="M150 28l7 8 14-17" fill="none" stroke="{T['teal']}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'''


def strip(out, theme):
    T = THEMES[theme]
    gs = GlyphSet('t')
    W, M, GAP = 1200, 36, 24
    colw = (W - 2 * M - 3 * GAP) / 4
    cols = []
    title_size, body_size = 27, 19.5
    body_lines = 0
    for kind, title, body in COLUMNS:
        tl = wrap_balanced(SERIF, title, title_size, colw, variations={'wght': 600, 'opsz': 48})
        bl = wrap(SANS, body, body_size, colw, variations={'wght': 420})
        body_lines = max(body_lines, len(bl))
        cols.append((kind, tl, bl))
    art_h = 110 * (colw / 200)
    top = 40
    title_y = top + art_h + 50
    body_y = title_y + max(len(c[1]) for c in cols) * 33 + 8
    H = int(body_y + body_lines * 28 + 26)
    parts = []
    for idx, (kind, tl, bl) in enumerate(cols):
        x = M + idx * (colw + GAP)
        s = colw / 200
        g = [f'<g transform="translate({f1(x)} {top}) scale({s:.4f})">{art(kind, T)}</g>']
        g.append(f'<rect x="{f1(x)}" y="{f1(top + art_h + 14)}" width="{f1(colw)}" height="1.4" fill="{T["rule"]}" fill-opacity=".2"/>')
        g.append(f'<g fill="{T["ink"]}">')
        for k, line in enumerate(tl):
            g.append(gs.text(SERIF, line, title_size, variations={'wght': 600, 'opsz': 48}, x=x, y=title_y + k * 33)[0])
        g.append(f'</g><g fill="{T["ink2"]}">')
        for k, line in enumerate(bl):
            g.append(gs.text(SANS, line, body_size, variations={'wght': 420}, x=x, y=body_y + k * 28)[0])
        g.append('</g>')
        parts.append(f'<g>{"".join(g)}</g>')
    alt = 'How I build agents. ' + ' '.join(f'{t} {b}' for _, t, b in COLUMNS)
    css = '''
.a1w{animation:dash 1.2s linear infinite}
@keyframes dash{to{stroke-dashoffset:-16}}
.a1c{transform-box:fill-box;transform-origin:center;animation:pop 3.6s cubic-bezier(.2,.7,.2,1) infinite}
@keyframes pop{0%,35%{transform:scale(0)}48%{transform:scale(1.18)}56%,92%{transform:scale(1)}100%{transform:scale(0)}}
.a2d{transform-box:fill-box;transform-origin:left center;animation:door 6s cubic-bezier(.2,.7,.2,1) infinite}
@keyframes door{0%,46%{transform:scaleX(1)}56%,86%{transform:scaleX(.08)}96%,100%{transform:scaleX(1)}}
.a2b{animation:ball 6s cubic-bezier(.2,.7,.2,1) infinite}
@keyframes ball{0%{transform:translateX(0);opacity:1}30%,54%{transform:translateX(56px)}84%{transform:translateX(150px);opacity:1}100%{transform:translateX(150px);opacity:0}}
.a2y{opacity:0;animation:yes 6s cubic-bezier(.2,.7,.2,1) infinite}
@keyframes yes{0%,34%{opacity:0}42%,62%{opacity:1}72%,100%{opacity:0}}
.a3f{transform-box:fill-box;transform-origin:left center;animation:fill 7.5s linear infinite}
@keyframes fill{0%{transform:scaleX(0)}36%,44%{transform:scaleX(.66)}48%,56%{transform:scaleX(.5)}90%,100%{transform:scaleX(1)}}
.a3x{opacity:0;animation:cut 7.5s linear infinite}
@keyframes cut{0%,36%{opacity:0}38%,46%{opacity:1}48%,100%{opacity:0}}
.a4b{animation:fixit 5.5s ease-in-out infinite}
@keyframes fixit{0%,38%{stroke:@BRICK@;stroke-dasharray:5 6}48%,100%{stroke:@TEAL@;stroke-dasharray:none}}
.a4k{stroke-dasharray:36;stroke-dashoffset:36;animation:tick 5.5s ease-in-out infinite}
@keyframes tick{0%,44%{stroke-dashoffset:36}58%,92%{stroke-dashoffset:0}100%{stroke-dashoffset:36}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.a2y,.a3x{opacity:0}.a4k{stroke-dashoffset:0}}
'''.replace('@BRICK@', T['brick']).replace('@TEAL@', T['teal'])
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="{alt}">
<title>How I build agents</title>
<style>{css}</style>
<defs>{gs.defs_svg()}</defs>
<rect width="{W}" height="{H}" rx="18" fill="{T['bg']}"/>
{''.join(parts)}
</svg>
'''
    Path(out).write_text(svg)
    print(out.name, f'{len(svg) / 1024:.0f} KB', f'{W}x{H}')


if __name__ == '__main__':
    ASSETS.mkdir(exist_ok=True)
    heads = [
        ('work', '01', 'Selected work', 'Selected work'),
        ('prod', '02', 'In production', 'In production'),
        ('approach', '03', 'How I build agents', 'How I build agents'),
        ('stack', '04', 'Stack', 'Stack'),
        ('more', '05', 'Also built', 'Also built'),
        ('hello', '06', 'Say hello', 'Say hello'),
    ]
    for key, n, label, alt in heads:
        section_head(ASSETS / f'sec-{key}.svg', n, label, alt)
    strip(ASSETS / 'approach-light.svg', 'light')
    strip(ASSETS / 'approach-dark.svg', 'dark')
    print('ok')
