#!/usr/bin/env python3
"""Builds the README banner (assets/hero-light.svg and assets/hero-dark.svg).

Everything is plain vector and nothing moves: the letters are outlines (see glyphs.py) and the
mosaic is the girih cell repeated with <use>. An animated SVG inside <img> is redrawn whole on every
frame, which is what made the top of the profile stutter, so the banner stays still.

    python3 scripts/make_banner.py [out-dir] [tile-size-as-a-fraction-of-the-lettering]
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
NAME = 'Saleh'
LETTER_TOP = 112     # where the top of the tallest letter sits
GAP_BELOW = 88       # baseline of the name to baseline of the tagline
TILE = 0.055         # girih cell size as a fraction of the lettering size

THEMES = {
    'light': dict(
        bg='#f3eee3', ink='#101826', ink2='#3b4457', accent='#09706a', edge='#0a1022', lines=0.11,
        tile=[(22, 48, 128), (20, 176, 160), (226, 164, 52)],
    ),
    'dark': dict(
        bg='#0b1020', ink='#ece7db', ink2='#b9b8b2', accent='#3ccfc0', edge='#040712', lines=0.15,
        tile=[(52, 86, 206), (37, 194, 177), (240, 185, 85)],
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


def build(theme_name, out, tile=TILE):
    T = THEMES[theme_name]
    rng = random.Random(1403)

    # ---- text, all as outlines -------------------------------------------------------------
    en_font = str(FONTS / 'fraunces-hero.woff2')
    mono = str(FONTS / 'fragment-mono.woff2')
    ital = str(FONTS / 'fraunces-italic.woff2')

    # one word, across the full width
    fit = text_path(en_font, NAME, 100)[1]
    size = 100 * (W - 2 * MARGIN) / fit
    top_probe = contours(text_path(en_font, NAME, size, x=MARGIN, y=0)[0])
    b1 = LETTER_TOP - min(p[1] for c in top_probe for p in c)      # baseline that puts the tallest letter at LETTER_TOP
    en_size = size
    en_d = text_path(en_font, NAME, size, x=MARGIN, y=b1)[0]
    tag_y = b1 + GAP_BELOW

    def mono_line(text, y, size=25, right=None, x=MARGIN, track=0.06):
        w = text_path(mono, text, size, tracking=track)[1]
        px = (right - w) if right is not None else x
        return text_path(mono, text, size, tracking=track, x=px, y=y)[0]

    meta_l = mono_line('ISFAHAN, IRAN · 32.65°N 51.67°E', 68, x=MARGIN + 46)
    meta_r = mono_line('COMPUTER ENGINEERING · UNIVERSITY OF ISFAHAN', 68, right=W - MARGIN)
    tag1 = text_path(ital, 'Full-stack developer and AI engineer.', 46, variations={'wght': 440, 'opsz': 48}, x=MARGIN, y=tag_y)[0]
    tag2 = mono_line('GITHUB.COM/MSMAHDINEJAD', tag_y - 8, size=22, right=W - MARGIN)
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
    L = round(en_size * tile, 2)
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

    # one path per fill keeps the element count (and the drawing work) low
    by_fill = {}
    for j in range(K):
        for i in range(K):
            for kind, _, _, pts in cell_faces(L, i, j):
                by_fill.setdefault(f'g{kind}{rng.randrange(7)}', []).append('M' + 'L'.join(f'{f1(x)} {f1(y)}' for x, y in pts) + 'Z')
    mosaic_block = [f'<path d="{"".join(d)}" fill="url(#{g})"/>' for g, d in sorted(by_fill.items())]

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

    star_d = 'M' + 'L'.join(f'{f1(x * .28)} {f1(y * .28)}' for x, y in STAR) + 'Z'

    sw = max(0.7, round(L * 0.033, 2))
    ring = round(en_size * 0.0095, 1)
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} {H}" role="img" aria-labelledby="t">
<title id="t">Saleh, full-stack developer and AI engineer in Isfahan. The name is set in girih tile mosaic.</title>
<defs>
{''.join(grads)}
<g id="mb" stroke="{T['edge']}" stroke-opacity=".62" stroke-width="{sw:g}" stroke-linejoin="round">{''.join(mosaic_block)}</g>
<path id="wb" d="{wall_d}" fill="none" stroke="{T['ink']}" stroke-opacity="{T['lines']}" stroke-width=".9" stroke-linecap="round"/>
<path id="nm" d="{en_d}"/>
<clipPath id="names"><use href="#nm" xlink:href="#nm"/></clipPath>
</defs>
<rect width="{W}" height="{H}" fill="{T['bg']}"/>
<g>{wall_uses}</g>
<g clip-path="url(#names)">{mosaic_uses}</g>
<use href="#nm" xlink:href="#nm" fill="none" stroke="{T['ink']}" stroke-width="{ring}" stroke-linejoin="round"/>
<g fill="{T['ink2']}">
<g transform="translate({MARGIN} 46)"><path d="{star_d}" fill="none" stroke="{T['accent']}" stroke-width="1.9" stroke-linejoin="round"/></g>
<path d="{meta_l}"/><path d="{meta_r}"/>
</g>
<g fill="{T['ink']}"><path d="{tag1}"/></g>
<g fill="{T['ink2']}"><path d="{tag2}"/></g>
</svg>
'''
    Path(out).write_text(svg)
    print(out, f'{len(svg) / 1024:.0f} KB', 'size', round(en_size), 'L', L, 'height', H)


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'assets'
    tile = float(sys.argv[2]) if len(sys.argv) > 2 else TILE
    out.mkdir(parents=True, exist_ok=True)
    build('light', out / 'hero-light.svg', tile)
    build('dark', out / 'hero-dark.svg', tile)
