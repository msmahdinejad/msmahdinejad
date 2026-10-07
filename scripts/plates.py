#!/usr/bin/env python3
"""PNG plates from make-plates.mjs -> WebP files in assets/ (the Cinewright one animated).

    PLATE_TMP=/some/dir python3 scripts/plates.py
"""
import os
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


def animated(name, quality=60, start=0, end=49, width=640):
    """The first scenes of the showreel ("I make things move"): flat colours, so they compress
    well, and every frame is kept so the motion stays smooth."""
    folder = TMP / f'{name}-frames'
    files = sorted(folder.glob('*.png'))[start:end]
    size = (width, round(width * H / W))
    frames = [Image.open(f).convert('RGBA').resize(size, Image.LANCZOS) for f in files]
    dest = OUT / f'plate-{name}.webp'
    frames[0].save(dest, 'WEBP', save_all=True, append_images=frames[1:], duration=71, loop=0,
                   quality=quality, method=6, alpha_quality=80, minimize_size=True, allow_mixed=True)
    print(dest.name, len(frames), 'frames', f'{dest.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for n in ('avorythm', 'sourcelens', 'newsroom'):
        still(n)
    animated('cinewright')
