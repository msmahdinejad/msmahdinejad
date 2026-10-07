# Scripts

These produce the images and small assets the profile README and the site use. Nothing here runs on GitHub; the results are committed.

| Script | Writes |
| --- | --- |
| `export-cell.mjs` | `cell.json`, the repeating cell of the tile pattern (6 faces) for the Python scripts |
| `tile-assets.mjs` | `docs/favicon.svg`, `docs/assets/img/girih.svg` |
| `make_banner.py` → `banner-frames.mjs` → `banner_webp.py` | `assets/hero-light.webp`, `assets/hero-dark.webp` (the vector banner, recorded as an 8 fps loop) |
| `make_sections.py` | `assets/sec-*.svg`, `assets/approach-*.svg` |
| `make_pieces.py` | `assets/divider.svg`, `assets/btn-*.svg` |
| `make-plates.mjs` + `plates.py` | `assets/plate-*.webp` (project images, photographed from the site) |
| `social-assets.mjs` | `docs/assets/img/og.jpg`, `docs/apple-touch-icon.png` |

The README images go through `<img>` on GitHub, where web fonts don't load, so every piece of text in them is converted to outlines first (`glyphs.py`, using HarfBuzz for shaping and fontTools for the curves).

```bash
pip install fonttools brotli uharfbuzz pillow
npm install playwright            # only for the .mjs scripts that take screenshots
node scripts/export-cell.mjs && python3 scripts/make_banner.py
for t in light dark; do
  node scripts/banner-frames.mjs scripts/build/hero-$t.svg scripts/build/frames-$t
  python3 scripts/banner_webp.py scripts/build/frames-$t assets/hero-$t.webp
done
```

The banner is shipped as a recorded loop rather than as the animated SVG: an animated SVG inside `<img>` gets redrawn whole on every frame, which made the top of the profile stutter.

The pattern itself lives in `docs/assets/js/girih.js`.
