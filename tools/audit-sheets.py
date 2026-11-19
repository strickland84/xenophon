# /// script
# dependencies = ["pillow"]
# ///
"""Lays the art audit's pictures (tools/audit.mjs) out as contact sheets, one a group, each picture shrunk
(a 1366 × 768 screen as 380 × 214) with its name under it, as docs/art/gen/audit/<when>-<group>.png:

  uv run tools/audit-sheets.py <pictures folder> <when: before|after> [docs/art/gen/audit]
"""

import glob
import os
import sys

from PIL import Image, ImageDraw

src, when = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "art", "gen", "audit")
os.makedirs(out, exist_ok=True)
groups: dict[str, list[str]] = {}
for f in sorted(glob.glob(os.path.join(src, "*.png"))):
    groups.setdefault(os.path.basename(f).split("-")[0], []).append(f)
COLS = 3
W, H = 380, 214
for group, files in groups.items():
    rows = (len(files) + COLS - 1) // COLS
    sheet = Image.new("RGB", (COLS * (W + 8) + 8, rows * (H + 26) + 8), (20, 22, 32))
    d = ImageDraw.Draw(sheet)
    for n, f in enumerate(files):
        im = Image.open(f).convert("RGB")
        im = im.resize((W, round(im.height * W / im.width)), Image.LANCZOS)
        x, y = 8 + (n % COLS) * (W + 8), 8 + (n // COLS) * (H + 26)
        sheet.paste(im.crop((0, 0, W, min(H, im.height))), (x, y))
        d.text((x + 2, y + H + 6), os.path.basename(f)[:-4], fill=(225, 225, 235))
    path = os.path.join(out, f"{when}-{group}.png")
    # (held to 256 colours: the pictures are pixel art, and the sheets stay small in the repository)
    sheet.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)
    print(path, len(files))
