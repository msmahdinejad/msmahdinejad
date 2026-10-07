"""Text to SVG outlines.

README images are shown through <img>, where web fonts do not load, so every piece of text in
them is converted to paths here. HarfBuzz does the shaping (kerning, Persian joining), fontTools
turns glyphs into path data.
"""
import io
from functools import lru_cache

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


@lru_cache(maxsize=None)
def _font(path, variations=()):
    tt = TTFont(path)
    tt.flavor = None
    buf = io.BytesIO()
    tt.save(buf)
    face = hb.Face(hb.Blob(buf.getvalue()))
    font = hb.Font(face)
    if variations:
        font.set_variations(dict(variations))
    return font, face.upem


def text_path(path, text, size, *, rtl=False, lang=None, script=None, variations=None, features=None, tracking=0.0, x=0.0, y=0.0):
    """Returns (d, advance, ascent, descent). The baseline sits at y, the pen starts at x
    (for rtl text x is the right edge)."""
    font, upem = _font(path, tuple(sorted((variations or {}).items())))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    if rtl:
        buf.direction = 'rtl'
    if script:
        buf.script = script
    if lang:
        buf.language = lang
    hb.shape(font, buf, features or {})
    k = size / upem
    track = tracking * size
    total = sum(p.x_advance * k + track for p in buf.glyph_positions)
    pen_x = x - total if rtl else x
    out = []
    top = bottom = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        sp = SVGPathPen(None, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.') or '0')
        tp = TransformPen(sp, (k, 0, 0, -k, pen_x + pos.x_offset * k, y - pos.y_offset * k))
        font.draw_glyph_with_pen(info.codepoint, tp)
        d = sp.getCommands()
        if d:
            out.append(d)
        pen_x += pos.x_advance * k + track
    ext = font.get_font_extents('ltr')
    return ''.join(out), total, ext.ascender * k, -ext.descender * k


def measure(path, text, size, **kw):
    return text_path(path, text, size, **kw)[1]


class GlyphSet:
    """Text as <use> elements: every distinct glyph is drawn once in <defs> and placed by reference,
    which keeps long paragraphs to a few KB."""

    def __init__(self, prefix='g'):
        self.prefix = prefix
        self.defs = {}

    def _def(self, font, upem, fkey, gid, size):
        key = (fkey, gid, round(size, 2))
        if key not in self.defs:
            sp = SVGPathPen(None, ntos=lambda v: ('%.1f' % v).rstrip('0').rstrip('.') or '0')
            k = size / upem
            font.draw_glyph_with_pen(gid, TransformPen(sp, (k, 0, 0, -k, 0, 0)))
            self.defs[key] = (f'{self.prefix}{len(self.defs)}', sp.getCommands())
        return self.defs[key][0]

    def text(self, path, text, size, *, x=0.0, y=0.0, rtl=False, lang=None, script=None, variations=None, features=None, tracking=0.0):
        fkey = (path, tuple(sorted((variations or {}).items())))
        font, upem = _font(path, fkey[1])
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        if rtl:
            buf.direction = 'rtl'
        if script:
            buf.script = script
        if lang:
            buf.language = lang
        hb.shape(font, buf, features or {})
        k = size / upem
        track = tracking * size
        total = sum(p.x_advance * k + track for p in buf.glyph_positions)
        pen_x = x - total if rtl else x
        out = []
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            gx = pen_x + pos.x_offset * k
            gy = y - pos.y_offset * k
            gid = self._def(font, upem, fkey, info.codepoint, size)
            if self.defs[(fkey, info.codepoint, round(size, 2))][1]:
                out.append(f'<use href="#{gid}" x="{gx:.1f}" y="{gy:.1f}"/>')
            pen_x += pos.x_advance * k + track
        return ''.join(out), total

    def defs_svg(self):
        return ''.join(f'<path id="{i}" d="{d}"/>' for i, d in self.defs.values() if d)
