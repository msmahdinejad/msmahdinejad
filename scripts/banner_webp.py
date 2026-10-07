#!/usr/bin/env python3
"""Turns the banner frames (from banner-frames.mjs) into the animated WebP the README shows.

Animating the vector banner inside an <img> makes the browser redraw every tile on every frame,
so the README uses a pre-rendered loop instead. Only a small area changes over the loop (the
glaze), so the file is one full frame followed by small replacement patches. The container is
written by hand so each patch replaces its rectangle outright: libwebp's own animation encoder
blends lossy patches over each other and the errors pile up into visible blocks.

    python3 scripts/banner_webp.py <frames-dir> <out.webp> [fps]
"""
import io
import struct
import sys
from pathlib import Path

from PIL import Image, ImageChops


def vp8_chunk(im, quality):
    buf = io.BytesIO()
    im.save(buf, 'WEBP', quality=quality, method=6)
    data = buf.getvalue()
    assert data[12:16] == b'VP8 ', 'expected a simple lossy WebP'
    size = struct.unpack('<I', data[16:20])[0]
    return data[12:20 + size + (size & 1)]


def chunk(tag, payload):
    return tag + struct.pack('<I', len(payload)) + payload + (b'\0' if len(payload) & 1 else b'')


def u24(v):
    return struct.pack('<I', v)[:3]


def anmf(x, y, w, h, ms, data):
    # flags 0b10: do not blend with the previous canvas, keep it (no dispose)
    return chunk(b'ANMF', u24(x // 2) + u24(y // 2) + u24(w - 1) + u24(h - 1) + u24(ms) + bytes([0b10]) + data)


def build(frames_dir, out, fps=8, base_q=72, patch_q=50):
    frames = [Image.open(f).convert('RGB') for f in sorted(Path(frames_dir).glob('*.png'))]
    W, H = frames[0].size
    box = None
    for a, b in zip(frames, frames[1:] + frames[:1]):
        d = ImageChops.difference(a, b).getbbox()
        if d:
            box = d if box is None else (min(box[0], d[0]), min(box[1], d[1]), max(box[2], d[2]), max(box[3], d[3]))
    ms = round(1000 / fps)
    body = [chunk(b'VP8X', bytes([0b10, 0, 0, 0]) + u24(W - 1) + u24(H - 1)),
            chunk(b'ANIM', b'\0\0\0\0' + struct.pack('<H', 0)),
            anmf(0, 0, W, H, ms, vp8_chunk(frames[0], base_q))]
    if box:
        x0, y0 = box[0] & ~1, box[1] & ~1                      # frame offsets must be even
        x1, y1 = min(W, box[2] + 1), min(H, box[3] + 1)
        for f in frames[1:]:
            body.append(anmf(x0, y0, x1 - x0, y1 - y0, ms, vp8_chunk(f.crop((x0, y0, x1, y1)), patch_q)))
    payload = b'WEBP' + b''.join(body)
    Path(out).write_bytes(b'RIFF' + struct.pack('<I', len(payload)) + payload)
    print(out, f'{len(payload) / 1024:.0f} KB', len(frames), 'frames', 'patch', box)


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 8)
