#!/usr/bin/env python3
"""Smaller README images: the tile divider and the four link buttons.

    python3 scripts/make_pieces.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from glyphs import text_path  # noqa: E402
from make_banner import CELL, FONTS, f1  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / 'assets'


def divider(out):
    W, H, L = 1600, 44, 26
    s = L / 100
    K = 8
    seg = []
    for j in range(-1, K + 1):
        for i in range(-1, K + 1):
            e = CELL['edges']
            for q in range(0, len(e), 4):
                x1, y1, x2, y2 = ((e[q] + i * 100) * s, (e[q + 1] + j * 100) * s, (e[q + 2] + i * 100) * s, (e[q + 3] + j * 100) * s)
                if -2 <= x1 <= K * L + 2 and -2 <= y1 <= K * L + 2:
                    seg.append(f'M{f1(x1)} {f1(y1)}L{f1(x2)} {f1(y2)}')
    d = ''.join(dict.fromkeys(seg))
    step = K * L
    uses = ''.join(f'<use href="#b" xlink:href="#b" x="{f1(x)}" y="{f1(-L * 1.2)}"/>' for x in range(0, int(W / step) + 2) for x in [x * step])
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="presentation" aria-hidden="true">
<defs>
<style>
.sw{{animation:sw 6.5s cubic-bezier(.45,.05,.3,1) infinite}}
@keyframes sw{{from{{transform:translateX(-700px)}}to{{transform:translateX(1800px)}}}}
@media (prefers-reduced-motion:reduce){{.sw{{animation:none;opacity:0}}}}
</style>
<path id="b" d="{d}" fill="none" stroke-linecap="round" stroke-width="1.2"/>
<linearGradient id="fade" x1="0" x2="1"><stop offset="0" stop-color="#000"/><stop offset=".16" stop-color="#fff"/><stop offset=".84" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="edges" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="url(#fade)"/></mask>
<mask id="lines" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><g stroke="#fff">{uses}</g></mask>
<linearGradient id="glint" x1="0" x2="1"><stop offset="0" stop-color="#19b5a5" stop-opacity="0"/><stop offset=".5" stop-color="#19b5a5"/><stop offset="1" stop-color="#19b5a5" stop-opacity="0"/></linearGradient>
</defs>
<g mask="url(#edges)">
<g stroke="#7d8499" stroke-opacity=".62">{uses}</g>
<g mask="url(#lines)"><rect class="sw" x="0" y="0" width="700" height="{H}" fill="url(#glint)"/></g>
</g>
</svg>
'''
    Path(out).write_text(svg)
    print(out, f'{len(svg) / 1024:.0f} KB')


def button(out, label, w, bg, fg, kind):
    H = 52
    font = str(FONTS / 'hanken-grotesk.woff2')
    d, tw, _, _ = text_path(font, label, 19, variations={'wght': 620}, tracking=0.005)
    pad = 24
    arrow = 'M0 14L14 0M5 0H14V9'
    x0 = pad
    d, tw, _, _ = text_path(font, label, 19, variations={'wght': 620}, tracking=0.005, x=x0, y=H / 2 + 6.6)
    ax = x0 + tw + 12
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {H}" width="{w}" height="{H}" role="img" aria-label="{label}">
<title>{label}</title>
<style>
.b{{transition:none}}
.p{{animation:nudge 3.2s ease-in-out infinite}}
@keyframes nudge{{0%,70%,100%{{transform:translate(0,0)}}82%{{transform:translate(2px,-2px)}}}}
@media (prefers-reduced-motion:reduce){{.p{{animation:none}}}}
</style>
<rect class="b" x=".5" y=".5" width="{w - 1}" height="{H - 1}" rx="{H / 2 - .5}" fill="{bg}" stroke="{fg}" stroke-opacity=".28"/>
<path d="{d}" fill="{fg}"/>
<g transform="translate({f1(ax)} {H / 2 - 7})"><g class="p"><path d="{arrow}" fill="none" stroke="{fg}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g></g>
</svg>
'''
    Path(out).write_text(svg)
    print(out, f'{len(svg) / 1024:.1f} KB', 'text width', round(tw))


if __name__ == '__main__':
    ASSETS.mkdir(exist_ok=True)
    divider(ASSETS / 'divider.svg')
    LAPIS, PAPER, SAFFRON, INK = '#1b3a8c', '#f3eee3', '#e5a93d', '#101826'
    button(ASSETS / 'btn-website.svg', 'Website', 140, SAFFRON, INK, 'web')
    button(ASSETS / 'btn-email.svg', 'Email', 120, LAPIS, PAPER, 'mail')
    button(ASSETS / 'btn-linkedin.svg', 'LinkedIn', 142, LAPIS, PAPER, 'in')
    button(ASSETS / 'btn-telegram.svg', 'Telegram', 148, LAPIS, PAPER, 'tg')
