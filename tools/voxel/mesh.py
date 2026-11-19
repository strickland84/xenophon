# /// script
# dependencies = ["numpy", "pillow", "trimesh", "scipy"]
# ///
"""Turns a textured 3D model (.glb) into a block of voxels.

Points are scattered over the model's surface, each with the colour the texture has there,
and dropped into a grid the size of the ship in game pixels. Each voxel takes the colour most
of its points have, and every column is filled in between its lowest and highest voxel.

  uv run tools/voxel/mesh.py model.glb out.npz [--length 84] [--nose +x] [--colours 24]
"""

import argparse
import sys

import numpy as np
import trimesh
from PIL import Image

sys.path.insert(0, __file__.rsplit("/", 1)[0])
import stackview

ap = argparse.ArgumentParser()
ap.add_argument("model")
ap.add_argument("out")
ap.add_argument("--length", type=int, default=84, help="the ship's length in game pixels")
ap.add_argument("--nose", default="auto", help="which way the nose points in the model: +x, -x, +z, -z")
ap.add_argument("--colours", type=int, default=24)
ap.add_argument("--points", type=int, default=3_000_000)
args = ap.parse_args()

mesh = trimesh.load(args.model, force="mesh")
# the sampler reads a plain texture, not the physically-based material a .glb carries
if hasattr(mesh.visual.material, "to_simple"):
    mesh.visual.material = mesh.visual.material.to_simple()
points, _, colours = trimesh.sample.sample_surface(mesh, args.points, sample_color=True)
colours = np.asarray(colours)[:, :3].astype(np.float64)
# these models come out dark: stretch the colours so the brightest surfaces are bright
colours = np.clip(colours * (235 / max(np.percentile(colours.max(axis=1), 98), 1)), 0, 255).astype(np.uint8)

# ── the model stands with y up; the longer of the other two is the ship's length
lo, hi = points.min(axis=0), points.max(axis=0)
size = hi - lo
nose = args.nose if args.nose != "auto" else ("+x" if size[0] >= size[2] else "+z")
axis = 0 if nose[1] == "x" else 2
other = 2 - axis
along = (points[:, axis] - lo[axis]) / size[axis]
if nose[0] == "+":
    along = 1 - along
across = (points[:, other] - (lo[other] + hi[other]) / 2) / size[axis]
if (nose == "+x") or (nose == "-z"):
    across = -across
up = (points[:, 1] - lo[1]) / size[axis]

length = args.length
width = int(np.ceil(size[other] / size[axis] * length / 2)) * 2
slices = int(np.ceil(size[1] / size[axis] * length)) + 1
k = np.clip((along * length).astype(int), 0, length - 1)
i = np.clip((across * length + width / 2).astype(int), 0, width - 1)
s = np.clip((up * length).astype(int), 0, slices - 1)

# ── a small palette, then each voxel takes the colour most of its points have
pick = np.random.default_rng(1).choice(len(colours), 256 * 256, replace=False)
quant = Image.fromarray(colours[pick].reshape(256, 256, 3)).quantize(args.colours - 1, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
palette = np.zeros((args.colours, 3), dtype=np.uint8)
palette[1:] = np.asarray(quant.getpalette()[: (args.colours - 1) * 3]).reshape(-1, 3)
nearest = np.empty(len(colours), dtype=np.int64)
for a in range(0, len(colours), 200_000):
    part = colours[a : a + 200_000].astype(np.int32)
    nearest[a : a + 200_000] = ((part[:, None, :] - palette[None, 1:].astype(np.int32)) ** 2).sum(axis=2).argmin(axis=1) + 1
cell = (s * length + k) * width + i
votes = np.bincount(cell * args.colours + nearest, minlength=slices * length * width * args.colours)
votes = votes.reshape(slices, length, width, args.colours)
vox = np.where(votes.sum(axis=3) >= 3, votes.argmax(axis=3), 0).astype(np.uint8)

# ── fill each column between its lowest and highest voxel, so the stack has no holes
filled = vox > 0
for kk, ii in zip(*np.nonzero(filled.any(axis=0))):
    column = np.nonzero(filled[:, kk, ii])[0]
    for z in range(column[0], column[-1]):
        if not vox[z, kk, ii]:
            vox[z, kk, ii] = vox[column[column > z][0], kk, ii]

stackview.save(args.out, vox, palette)
print(f"{args.out}: {width} across, {length} long, {slices} slices, nose {nose}, model size {np.round(size, 2)}")
