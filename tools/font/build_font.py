# /// script
# requires-python = ">=3.10"
# dependencies = ["fonttools>=4.50"]
# ///
"""Builds the game's pixel font as a TrueType file for the menus, from the very glyphs the
engine draws its HUD with (ROWS in src/lib/engine/render/font.ts), so that menus and HUD share
one font, as the plan's section 16 asks.

  uv run tools/font/build_font.py        # -> static/fonts/xenophon-pixel.ttf

Each font pixel is a square of 100 units, and the em is 7 pixels (5 for a capital, 2 of
room): set the font at a multiple of 7 CSS px and every font pixel is a whole number of
screen pixels. Small letters are drawn as capitals.
"""

import os
import re

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SOURCE = os.path.join(ROOT, "src", "lib", "engine", "render", "font.ts")
OUT = os.path.join(ROOT, "static", "fonts", "xenophon-pixel.ttf")
U = 100  # units per font pixel
EM = 7 * U


def read_rows():
    text = open(SOURCE, encoding="utf-8").read()
    block = text[text.index("const ROWS") : text.index("\n}\n", text.index("const ROWS"))]
    glyphs = {}
    for line in block.splitlines():
        m = re.match(r"""\s*(?:'(.)'|"(.)"|([A-Za-z0-9_]))\s*:\s*\[(.*)\],?\s*$""", line)
        if not m:
            continue
        ch = m.group(1) or m.group(2) or m.group(3)
        rows = re.findall(r"'([.#]+)'", m.group(4))
        glyphs[ch] = rows
    return glyphs


def outline(rows):
    """the glyph's pixels as rectangles, a run of a row at a time (clockwise, y up, baseline at the bottom row)"""
    pen = TTGlyphPen(None)
    h = len(rows)
    for r, row in enumerate(rows):
        y0 = (h - 1 - r) * U
        y1 = y0 + U
        c = 0
        while c < len(row):
            if row[c] != "#":
                c += 1
                continue
            start = c
            while c < len(row) and row[c] == "#":
                c += 1
            x0, x1 = start * U, c * U
            pen.moveTo((x0, y0))
            pen.lineTo((x0, y1))
            pen.lineTo((x1, y1))
            pen.lineTo((x1, y0))
            pen.closePath()
    return pen.glyph()


def main():
    glyphs = read_rows()
    names = {ch: ("space" if ch == " " else f"uni{ord(ch):04X}") for ch in glyphs}
    order = [".notdef"] + [names[ch] for ch in glyphs]
    cmap = {ord(ch): names[ch] for ch in glyphs}
    # small letters drawn as the capitals
    for ch in glyphs:
        if "A" <= ch <= "Z" and ch.lower() not in glyphs:
            cmap[ord(ch.lower())] = names[ch]
    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    empty = TTGlyphPen(None).glyph()
    shapes = {".notdef": empty}
    metrics = {".notdef": (4 * U, 0)}
    for ch, rows in glyphs.items():
        shapes[names[ch]] = outline(rows)
        metrics[names[ch]] = ((len(rows[0]) + 1) * U, 0)
    fb.setupGlyf(shapes)
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=6 * U, descent=-U)
    fb.setupNameTable({"familyName": "Borrowed Pixel", "styleName": "Regular"})
    fb.setupOS2(sTypoAscender=6 * U, sTypoDescender=-U, sTypoLineGap=0, usWinAscent=6 * U, usWinDescent=U, sxHeight=5 * U, sCapHeight=5 * U)
    fb.setupPost()
    fb.save(OUT)
    print(f"{os.path.relpath(OUT, ROOT)}: {len(glyphs)} glyphs")


main()
