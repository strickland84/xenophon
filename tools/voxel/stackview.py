"""Shared by the voxel tools: a ship as a block of voxels, saved, loaded and drawn.

A ship is `vox`, an array of palette indices [slice, along, across] (0 is empty; slice 0 is
the belly, row 0 the nose), and `palette`, one RGB colour per index.
"""

import numpy as np
from PIL import Image

SPACE = (14, 16, 30)
LINE = (4, 5, 12)


def save(path, vox, palette):
    np.savez_compressed(path, vox=vox.astype(np.uint8), palette=np.asarray(palette, dtype=np.uint8))


def load(path):
    data = np.load(path)
    return data["vox"], data["palette"]


def draw(vox, palette, heading, size):
    """The ship as the game draws it from overhead: each slice a pixel above the last, the
    stack turned to `heading` (radians, clockwise, nose up at 0). Returns RGBA."""
    slices, length, width = vox.shape
    out = np.zeros((size, size), dtype=np.uint8)
    cs, sn = np.cos(heading), np.sin(heading)
    ys, xs = np.mgrid[0:size, 0:size]
    for s in range(slices):
        # back from the picture to the slice: undo the turn
        x = xs - size / 2 + 0.5
        y = ys - size / 2 + 0.5 + (s - slices / 2)
        i = np.floor(x * cs + y * sn + width / 2).astype(int)
        k = np.floor(-x * sn + y * cs + length / 2).astype(int)
        ok = (i >= 0) & (k >= 0) & (i < width) & (k < length)
        v = np.zeros_like(out)
        v[ok] = vox[s][k[ok], i[ok]]
        out = np.where(v > 0, v, out)
    return out


def tidy(idx):
    """Clears specks: a pixel that matches none of the four beside it takes the colour two
    or more of them share."""
    out = idx.copy()
    pad = np.pad(idx, 1)
    around = np.stack([pad[1:-1, :-2], pad[1:-1, 2:], pad[:-2, 1:-1], pad[2:, 1:-1]])
    alone = (idx > 0) & ~(around == idx).any(axis=0)
    for y, x in zip(*np.nonzero(alone)):
        near = [v for v in around[:, y, x] if v > 0]
        if near:
            best = max(set(near), key=near.count)
            if near.count(best) >= 2:
                out[y, x] = best
    return out


def colour(idx, palette):
    """Palette indices to an RGB picture on a space background, with a dark line round the ship."""
    h, w = idx.shape
    rgb = np.empty((h, w, 3), dtype=np.uint8)
    rgb[:] = SPACE
    filled = idx > 0
    rgb[filled] = np.asarray(palette)[idx[filled]]
    pad = np.pad(filled, 1)
    edge = ~filled & (pad[1:-1, :-2] | pad[1:-1, 2:] | pad[:-2, 1:-1] | pad[2:, 1:-1])
    rgb[edge] = LINE
    return rgb


def sheet(vox, palette, headings, cell, scale):
    """One row of the ship at each heading, `scale` times life size."""
    row = np.concatenate([colour(tidy(draw(vox, palette, h, cell)), palette) for h in headings], axis=1)
    return Image.fromarray(row).resize((row.shape[1] * scale, row.shape[0] * scale), Image.NEAREST)
