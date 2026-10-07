#!/usr/bin/env python3
"""Builds the animated banner for the profile README (assets/hero-light.svg and hero-dark.svg).

GitHub shows README images through <img>: no scripts, no web fonts, no outside requests. So everything
here is plain vector: the letters are outlines (see glyphs.py), the mosaic is the girih cell repeated
with <use>, and the motion is CSS inside the file.

    python3 scripts/make_banner.py
"""
import json
import math
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from glyphs import text_path  # noqa: E402
from svgpath import contours  # noqa: E402
from PIL import Image, ImageChops, ImageDraw  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FONTS = ROOT / 'docs' / 'assets' / 'fonts'
CELL = json.loads((Path(__file__).parent / 'cell.json').read_text())

W, H = 1600, 520
MARGIN = 88

THEMES = {
    'light': dict(
        bg='#f3eee3', ink='#101826', ink2='#3b4457', accent='#09706a', edge='#0a1022', lines=0.11,
        tile=[(22, 48, 128), (20, 176, 160), (226, 164, 52)],
        glaze=[(46, 92, 222), (18, 192, 172), (240, 172, 44)],
        shine=[(70, 122, 250), (64, 236, 212), (255, 214, 104)],
    ),
    'dark': dict(
        bg='#0b1020', ink='#ece7db', ink2='#b9b8b2', accent='#3ccfc0', edge='#040712', lines=0.15,
        tile=[(52, 86, 206), (37, 194, 177), (240, 185, 85)],
        glaze=[(78, 116, 240), (52, 214, 192), (250, 196, 96)],
        shine=[(128, 168, 255), (116, 255, 232), (255, 226, 142)],
    ),
}

STAR = [(17.47, 17.47), (38.91, 23.22), (50, 4), (61.09, 23.22), (82.53, 17.47), (76.78, 38.91), (96, 50), (76.78, 61.09),
        (82.53, 82.53), (61.09, 76.78), (50, 96), (38.91, 76.78), (17.47, 82.53), (23.22, 61.09), (4, 50), (23.22, 38.91)]


def hx(c):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(v))) for v in c)


def mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def f1(v):
    s = '%.1f' % v
    return s[:-2] if s.endswith('.0') else s


def poly_points(pts):
    return ' '.join(f'{f1(x)},{f1(y)}' for x, y in pts)


def cell_faces(L, i, j):
    s = L / 100
    for f in CELL['faces']:
        pts = [((f['pts'][k] + i * 100) * s, (f['pts'][k + 1] + j * 100) * s) for k in range(0, len(f['pts']), 2)]
        yield f['kind'], (f['cx'] + i * 100) * s, (f['cy'] + j * 100) * s, pts


def build(theme_name, out):
    T = THEMES[theme_name]
    rng = random.Random(1403)

    # ---- text, all as outlines -------------------------------------------------------------
    en_font = str(FONTS / 'fraunces-hero.woff2')
    mono = str(FONTS / 'fragment-mono.woff2')
    ital = str(FONTS / 'fraunces-italic.woff2')

    # given name small, surname across the full width
    fit = text_path(en_font, 'Mahdinejad', 100)[1]
    size = 100 * (W - 2 * MARGIN) / fit
    k1 = 0.5
    b1 = 112 + size * k1 * 0.72
    b2 = b1 + size * 0.84
    en_size = size
    d1, w1, _, _ = text_path(en_font, 'Mohammad Saleh', size * k1, x=MARGIN, y=b1)
    d2, _, _, _ = text_path(en_font, 'Mahdinejad', size, x=MARGIN, y=b2)
    en_d = d1 + d2
    tag_y = b2 + 92

    def mono_line(text, y, size=25, right=None, x=MARGIN, track=0.06):
        w = text_path(mono, text, size, tracking=track)[1]
        px = (right - w) if right is not None else x
        return text_path(mono, text, size, tracking=track, x=px, y=y)[0]

    meta_l = mono_line('ISFAHAN, IRAN · 32.65°N 51.67°E', 68, x=MARGIN + 46)
    meta_r = mono_line('COMPUTER ENGINEERING · UNIVERSITY OF ISFAHAN', 68, right=W - MARGIN)
    tag1 = text_path(ital, 'Full-stack developer and AI engineer.', 46, variations={'wght': 440, 'opsz': 48}, x=MARGIN, y=tag_y)[0]
    tag2 = mono_line('GITHUB.COM/MSMAHDINEJAD', tag_y - 8, size=22, right=W - MARGIN)
    line1_end = MARGIN + w1
    H = int(round(tag_y + 56))

    letters = contours(en_d)
    xs = [p[0] for c in letters for p in c]
    ys = [p[1] for c in letters for p in c]
    bbox = (min(xs), min(ys), max(xs), max(ys))

    # raster of the letter shapes (even-odd), for deciding which tiles sit inside them
    shape = Image.new('1', (W, H), 0)
    for poly in letters:
        m = Image.new('1', (W, H), 0)
        ImageDraw.Draw(m).polygon(poly, fill=1)
        shape = ImageChops.logical_xor(shape, m)
    px = shape.load()

    def inside(x, y):
        xi, yi = int(x), int(y)
        return 0 <= xi < W and 0 <= yi < H and px[xi, yi] > 0

    # ---- tile geometry ---------------------------------------------------------------------
    L = round(en_size * 0.095, 2)
    K = 6

    # gradients: one per (kind, tint)
    tints = [-0.07, -0.045, -0.02, 0.0, 0.02, 0.045, 0.07]
    grads = []
    for k in range(3):
        for j, t in enumerate(tints):
            base = T['tile'][k]
            c = mix(base, (255, 255, 255), t) if t >= 0 else mix(base, (0, 0, 0), -t)
            grads.append(
                f'<linearGradient id="g{k}{j}" x1="0" y1="0" x2="1" y2="1">'
                f'<stop offset="0" stop-color="{hx(mix(c, (255, 255, 255), .11))}"/>'
                f'<stop offset=".55" stop-color="{hx(c)}"/>'
                f'<stop offset="1" stop-color="{hx(mix(c, (0, 0, 0), .2))}"/></linearGradient>')

    mosaic_block = []
    for j in range(K):
        for i in range(K):
            for kind, _, _, pts in cell_faces(L, i, j):
                mosaic_block.append(f'<polygon points="{poly_points(pts)}" fill="url(#g{kind}{rng.randrange(7)})"/>')

    s = L / 100
    K2 = 8
    wall = []
    for j in range(-1, K2 + 1):
        for i in range(-1, K2 + 1):
            e = CELL['edges']
            for q in range(0, len(e), 4):
                x1, y1, x2, y2 = ((e[q] + i * 100) * s, (e[q + 1] + j * 100) * s, (e[q + 2] + i * 100) * s, (e[q + 3] + j * 100) * s)
                if -2 <= x1 <= K2 * L + 2 and -2 <= y1 <= K2 * L + 2:
                    wall.append(f'M{f1(x1)} {f1(y1)}L{f1(x2)} {f1(y2)}')
    wall_d = ''.join(dict.fromkeys(wall))   # drop duplicate segments

    def uses(ref, size, x0, y0, x1, y1):
        out = []
        gx = int(math.floor(x0 / size))
        while gx * size < x1:
            gy = int(math.floor(y0 / size))
            while gy * size < y1:
                out.append(f'<use href="#{ref}" xlink:href="#{ref}" x="{f1(gx * size)}" y="{f1(gy * size)}"/>')
                gy += 1
            gx += 1
        return ''.join(out)

    mosaic_uses = uses('mb', K * L, bbox[0] - 4, bbox[1] - 4, bbox[2] + 4, bbox[3] + 4)
    wall_uses = uses('wb', K2 * L, 0, 0, W, H)

    # ---- glaze patches: small clusters of neighbouring wall tiles that fade in and out -----------
    keep_out = [(MARGIN - 20, tag_y - 52, MARGIN + 880, H), (0, 0, W, 96), (W - 470, tag_y - 40, W, H)]   # tagline, meta row, link

    def in_keepout(x, y):
        return any(a <= x <= c and b <= y <= d for a, b, c, d in keep_out)

    def near_letters(x, y, r=26):
        return any(inside(x + dx, y + dy) for dx in (-r, 0, r) for dy in (-r, 0, r))

    # a short run of glaze in the open space to the right of the given name
    cy = (100 + b1) / 2
    xs_ = [line1_end + 110 + i * (W - MARGIN - 80 - line1_end - 110) / 3 for i in range(4)]
    centres = [(x, cy + (18 if i % 2 else -14)) for i, x in enumerate(xs_)]

    patches = []
    R = L * 2.4
    for n, (gx, gy) in enumerate(centres):
        polys = []
        for j in range(int((gy - R) / L) - 1, int((gy + R) / L) + 2):
            for i in range(int((gx - R) / L) - 1, int((gx + R) / L) + 2):
                for kind, cx, cy, pts in cell_faces(L, i, j):
                    d = math.hypot(cx - gx, cy - gy)
                    if d < R and not near_letters(cx, cy, 14) and not in_keepout(cx, cy):
                        a = (1 - d / R) ** 1.3
                        polys.append(f'<polygon points="{poly_points(pts)}" fill="{hx(T["glaze"][kind])}" fill-opacity="{a:.2f}"/>')
        patches.append(f'<g class="gl" style="animation-delay:{2.6 + n * 1.2:.1f}s">{"".join(polys)}</g>')
    glaze = ''.join(patches)
    n_patch = len(centres)

    star_d = 'M' + 'L'.join(f'{f1(x * .28)} {f1(y * .28)}' for x, y in STAR) + 'Z'

    css = f'''
.o{{fill:none;stroke:var(--ink);stroke-width:3.4;stroke-linejoin:round;stroke-dasharray:1;animation:draw 1.7s cubic-bezier(.3,.6,.2,1) .2s both}}
.o2{{animation-delay:.7s}}
@keyframes draw{{from{{stroke-dashoffset:1}}to{{stroke-dashoffset:0}}}}
.rv{{transform:translateX(-400px);animation:rv 2.2s cubic-bezier(.4,.1,.2,1) .55s both}}
@keyframes rv{{from{{transform:translateX(-2800px)}}}}
.wall{{animation:fade 1.4s ease .1s both}}
.meta{{animation:fade 1s ease 1.4s both}}
@keyframes fade{{from{{opacity:0}}}}
.sheen{{animation:sheen 8s linear 3.2s infinite}}
@keyframes sheen{{from{{transform:translateX(-520px) skewX(-20deg)}}to{{transform:translateX(2200px) skewX(-20deg)}}}}
.gl{{opacity:0;animation:gl 7.2s ease-in-out infinite}}
@keyframes gl{{0%,100%{{opacity:0}}20%,44%{{opacity:1}}}}
.spin{{transform-box:fill-box;transform-origin:center;animation:spin 48s linear infinite}}
@keyframes spin{{to{{transform:rotate(360deg)}}}}
@media (prefers-reduced-motion:reduce){{*{{animation:none!important}}.gl{{opacity:0}}}}
'''

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">
<title id="t">Mohammad Saleh Mahdinejad, full-stack developer and AI engineer in Isfahan. The name is set in girih tile mosaic.</title>
<defs>
<style>
:root{{--ink:{T['ink']}}}
{css}
</style>
{''.join(grads)}
<g id="mb" stroke="{T['edge']}" stroke-opacity=".62" stroke-width=".75" stroke-linejoin="round">{''.join(mosaic_block)}</g>
<path id="wb" d="{wall_d}" fill="none" stroke="{T['ink']}" stroke-opacity="{T['lines']}" stroke-width=".9" stroke-linecap="round"/>
<clipPath id="names"><path d="{en_d}"/></clipPath>
<linearGradient id="feather" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset=".625" stop-color="#fff"/><stop offset=".875" stop-color="#000"/><stop offset="1" stop-color="#000"/></linearGradient>
<mask id="reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect class="rv" x="0" y="0" width="3200" height="{H}" fill="url(#feather)"/></mask>
<linearGradient id="sheenG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
</defs>
<rect width="{W}" height="{H}" fill="{T['bg']}"/>
<g class="wall">{wall_uses}</g>
<g clip-path="url(#names)"><g mask="url(#reveal)">{mosaic_uses}</g></g>
<g clip-path="url(#names)"><rect class="sheen" x="0" y="-30" width="280" height="{H + 60}" fill="url(#sheenG)"/></g>
<path class="o" pathLength="1" d="{en_d}"/>
<g>{glaze}</g>
<g class="meta" fill="{T['ink2']}">
<g transform="translate({MARGIN} 46)"><g class="spin"><path d="{star_d}" fill="none" stroke="{T['accent']}" stroke-width="1.9" stroke-linejoin="round"/></g></g>
<path d="{meta_l}"/><path d="{meta_r}"/>
</g>
<g class="meta" fill="{T['ink']}"><path d="{tag1}"/></g>
<g class="meta" fill="{T['ink2']}"><path d="{tag2}"/></g>
</svg>
'''
    Path(out).write_text(svg)
    print(out, f'{len(svg) / 1024:.0f} KB', 'patches', n_patch, 'L', L)


if __name__ == '__main__':
    assets = ROOT / 'assets'
    assets.mkdir(exist_ok=True)
    build('light', assets / 'hero-light.svg')
    build('dark', assets / 'hero-dark.svg')
