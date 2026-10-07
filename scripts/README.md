# Scripts

These produce the images and small assets the profile README and the site use. Nothing here runs on GitHub; the results are committed.

| Script | Writes |
| --- | --- |
| `export-cell.mjs` | `cell.json`, the repeating cell of the tile pattern (6 faces) for the Python scripts |
| `tile-assets.mjs` | `docs/favicon.svg`, `docs/assets/img/girih.svg` |
| `make_banner.py` | `assets/hero-light.svg`, `assets/hero-dark.svg` |
| `make_sections.py` | `assets/sec-*.svg`, `assets/approach-*.svg` |
| `make_pieces.py` | `assets/divider.svg`, `assets/btn-*.svg` |
| `make-plates.mjs` + `plates.py` | `assets/plate-*.webp` (project images, photographed from the site) |
| `social-assets.mjs` | `docs/assets/img/og.jpg`, `docs/apple-touch-icon.png` |

The README images go through `<img>` on GitHub, where web fonts don't load, so every piece of text in them is converted to outlines first (`glyphs.py`, using HarfBuzz for shaping and fontTools for the curves).

```bash
pip install fonttools brotli uharfbuzz pillow
npm install playwright            # only for the .mjs scripts that take screenshots
node scripts/export-cell.mjs && python3 scripts/make_banner.py
```

The pattern itself lives in `docs/assets/js/girih.js`.
