# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns one picture of a ship seen from above into a block of voxels.

The picture gives the colours. It says nothing about height, so height is worked out: a
part is taller the further it is from the ship's edge (so the fuselage stands over the
wings), dark seams are sunk a little, and glass is raised.

  uv run tools/voxel/topview.py picture.png out.npz [--length 84] [--flip] [--height 9]
"""

import argparse
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import stackview

ap = argparse.ArgumentParser()
ap.add_argument("picture")
ap.add_argument("out")
ap.add_argument("--length", type=int, default=84, help="the ship's length in game pixels")
ap.add_argument("--flip", action="store_true", help="the picture has the nose at the bottom")
ap.add_argument("--height", type=int, default=9, help="slices at the ship's tallest point")
ap.add_argument("--colours", type=int, default=24)
args = ap.parse_args()

rgb = np.asarray(Image.open(args.picture).convert("RGB")).astype(np.int32)
if args.flip:
    rgb = rgb[::-1]

# ── cut the ship out: the background is whatever dark area touches the picture's edge
dark = rgb.max(axis=2) < 36
labels, _ = ndimage.label(dark)
border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
ship = ~np.isin(labels, border[border > 0])
ship = ndimage.binary_opening(ship, iterations=2)
ys, xs = np.nonzero(ship)
top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1

# ── down to game pixels: each takes the middle colour of the patch of picture it covers
cell = (bottom - top) / args.length
width = int(round((right - left) / cell / 2)) * 2
x0 = (left + right) / 2 - width * cell / 2
small = np.zeros((args.length, width, 3), dtype=np.uint8)
inside = np.zeros((args.length, width), dtype=bool)
for k in range(args.length):
    for i in range(width):
        ya, yb = int(top + k * cell + cell * 0.25), int(top + (k + 1) * cell - cell * 0.25) + 1
        xa, xb = int(x0 + i * cell + cell * 0.25), int(x0 + (i + 1) * cell - cell * 0.25) + 1
        xa, xb = max(xa, 0), min(xb, rgb.shape[1])
        if xb <= xa:
            continue
        patch = ship[ya:yb, xa:xb]
        if patch.mean() > 0.5:
            inside[k, i] = True
            small[k, i] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)

# ── the same on both sides: the left half is mirrored onto the right
half = width // 2
small[:, half:] = small[:, :half][:, ::-1]
inside[:, half:] = inside[:, :half][:, ::-1]

# ── a small palette: index 0 is kept for "nothing here"
quant = Image.fromarray(small).quantize(args.colours - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
palette = np.zeros((args.colours, 3), dtype=np.uint8)
palette[1:] = np.asarray(quant.getpalette()[: (args.colours - 1) * 3]).reshape(-1, 3)
index = np.asarray(quant).astype(np.uint8) + 1
index[~inside] = 0

# ── height: further from the edge is taller; seams sink, glass rises
reach = ndimage.distance_transform_edt(inside)
tall = np.clip(np.round(1 + reach * (args.height - 1) / max(reach.max() * 0.7, 1)), 1, args.height).astype(int)
col = palette[index].astype(int)
bright = col.max(axis=2)
glass = (col[..., 1] > col[..., 0] + 40) & (col[..., 2] > col[..., 0] + 40)
tall[inside & (bright < 46)] -= 1
tall[inside & glass] += 1
tall = np.clip(tall, 1, args.height + 1)
tall[~inside] = 0

# ── voxels: thin parts sit at the ship's waist, the top of each column takes the picture's
# colour, and what is under it a darker one, which is what shows on its sides
slices = args.height + 1
waist = slices // 3
darker = np.zeros(args.colours, dtype=np.uint8)
for n in range(1, args.colours):
    want = palette[n] * 0.62
    darker[n] = 1 + np.argmin(((palette[1:].astype(float) - want) ** 2).sum(axis=1))
vox = np.zeros((slices, args.length, width), dtype=np.uint8)
for k, i in zip(*np.nonzero(inside)):
    h = tall[k, i]
    z0 = max(0, min(waist - h // 2, slices - h))
    vox[z0 : z0 + h - 1, k, i] = darker[index[k, i]]
    vox[z0 + h - 1, k, i] = index[k, i]

stackview.save(args.out, vox, palette)
print(f"{args.out}: {width} across, {args.length} long, {slices} slices, {args.colours - 1} colours")
