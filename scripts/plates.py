#!/usr/bin/env python3
"""PNG plates from make-plates.mjs -> WebP files in assets/ (the Cinewright one animated).

    PLATE_TMP=/some/dir python3 scripts/plates.py
"""
import os
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TMP = Path(os.environ.get('PLATE_TMP', 'plates-tmp'))
OUT = ROOT / 'assets'
W, H = 720, 450


def fit(im):
    return im.convert('RGBA').resize((W, H), Image.LANCZOS)


def still(name, quality=84):
    im = fit(Image.open(TMP / f'{name}.png'))
    dest = OUT / f'plate-{name}.webp'
    im.save(dest, 'WEBP', quality=quality, method=6, alpha_quality=100)
    print(dest.name, f'{dest.stat().st_size / 1024:.0f} KB')


def animated(name, quality=62, step=1):
    folder = TMP / f'{name}-frames'
    files = sorted(folder.glob('*.png'))[::step]
    frames = [fit(Image.open(f)) for f in files]
    dest = OUT / f'plate-{name}.webp'
    frames[0].save(dest, 'WEBP', save_all=True, append_images=frames[1:], duration=int(71 * step), loop=0,
                   quality=quality, method=6, alpha_quality=90, minimize_size=True)
    print(dest.name, len(frames), 'frames', f'{dest.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for n in ('avorythm', 'sourcelens', 'newsroom'):
        still(n)
    animated('cinewright', quality=int(sys.argv[1]) if len(sys.argv) > 1 else 62)
