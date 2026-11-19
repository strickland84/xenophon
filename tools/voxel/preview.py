# /// script
# dependencies = ["numpy", "pillow"]
# ///
"""Draws voxel ships turned to a few headings, one ship a row.

  uv run tools/voxel/preview.py out.png ship.npz [another.npz ...] [--cell 112] [--scale 3] [--across 3]
"""

import argparse
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import stackview

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("ships", nargs="+")
ap.add_argument("--cell", type=int, default=112)
ap.add_argument("--scale", type=int, default=3)
ap.add_argument("--headings", default="0,0.6,1.5708,2.4,3.1416", help="headings in radians, clockwise from nose up")
ap.add_argument("--across", type=int, default=1, help="how many ships to a row")
args = ap.parse_args()

headings = [float(h) for h in args.headings.split(",")]
blocks = [stackview.sheet(*stackview.load(s), headings, args.cell, args.scale) for s in args.ships]
rows = -(-len(blocks) // args.across)
out = Image.new("RGB", (blocks[0].width * args.across, blocks[0].height * rows), stackview.SPACE)
for n, block in enumerate(blocks):
    out.paste(block, ((n % args.across) * block.width, (n // args.across) * block.height))
out.save(args.out)
print(args.out)
