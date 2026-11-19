# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the pictures of the marks players leave (tools/gen/traces.py) into game pixels.

Each is cut out of its black background and shrunk to the size it has in the game (each game
pixel takes the middle colour of the patch it covers), then held to a palette of its own: each
side's flag, a wreck, a grave marker, a beacon. Menu rank badges are made by
tools/voxel/interface.py.

Out comes src/lib/engine/traces/art.ts: generated, never edited by hand.

  uv run tools/voxel/traces.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "traces", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "traces", "art.ts")

# each sprite: its picture, and its longest side in game pixels
SPRITES = {
    "flagNomarchy": ("flag-nomarchy.png", 15),
    "flagAnarchoi": ("flag-anarchoi.png", 15),
    "wreck": ("wreck-2.png", 24),
    "grave": ("grave.png", 9),
    "beacon": ("beacon.png", 12),
}
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/"


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB")).astype(np.int32)


def cut(rgb, keep_bits=False):
    """where the thing is in its picture: everything not the black background (its biggest piece, and with `keep_bits` the bits round it)"""
    solid = rgb.max(axis=2) > 34
    solid = ndimage.binary_opening(solid, iterations=1)
    labels, n = ndimage.label(solid)
    if n == 0:
        return solid
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    big = sizes.max()
    keep = [i + 1 for i, s in enumerate(sizes) if s == big or (keep_bits and s > big * 0.004)]
    return ndimage.binary_fill_holes(np.isin(labels, keep))


def shrink(rgb, mask, longest):
    """down to game pixels: each takes the middle colour of the patch it covers"""
    ys, xs = np.nonzero(mask)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cell = max(bottom - top, right - left) / longest
    h = max(1, int(round((bottom - top) / cell)))
    w = max(1, int(round((right - left) / cell)))
    small = np.zeros((h, w, 3), dtype=np.int32)
    inside = np.zeros((h, w), dtype=bool)
    for k in range(h):
        for i in range(w):
            ya, yb = int(top + k * cell), max(int(top + (k + 1) * cell), int(top + k * cell) + 1)
            xa, xb = int(left + i * cell), max(int(left + (i + 1) * cell), int(left + i * cell) + 1)
            patch = mask[ya:yb, xa:xb]
            if patch.size and patch.mean() > 0.4:
                inside[k, i] = True
                small[k, i] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)
    return small, inside


def palette_of(pixels, n):
    px = np.asarray(pixels, dtype=np.uint8).reshape(1, -1, 3)
    q = Image.fromarray(px).quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return np.asarray(q.getpalette()[: n * 3]).reshape(-1, 3).astype(np.int32)


def nearest(img, pal):
    flat = img.reshape(-1, 3)[:, None, :]
    return ((flat - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1).reshape(img.shape[:2])


def encode(idx, inside):
    """a picture of palette indices as text, as space/art.ts has them: one letter a pixel, '.' nothing, runs of three or more as '!', two letters of their length in base 36, and the letter"""
    syms = ["." if not m else ALPHABET[v] for v, m in zip(idx.reshape(-1), inside.reshape(-1))]
    out = []
    i = 0
    while i < len(syms):
        j = i
        while j < len(syms) and syms[j] == syms[i] and j - i < 1295:
            j += 1
        n = j - i
        out.append("!" + np.base_repr(n, 36).lower().rjust(2, "0") + syms[i] if n >= 3 else syms[i] * n)
        i = j
    return "".join(out)


def picture(small, inside, n=24):
    pal = palette_of(small[inside], n)
    idx = nearest(small, pal)
    h, w = inside.shape
    return {"w": w, "h": h, "colours": pal.tolist(), "rows": encode(idx, inside)}


def ts(v):
    if isinstance(v, dict):
        return "{ " + ", ".join(f"{k}: {ts(x)}" for k, x in v.items()) + " }"
    if isinstance(v, list):
        return "[" + ", ".join(ts(x) for x in v) + "]"
    if isinstance(v, str):
        return "'" + v + "'"
    return str(int(v))


art = {}
for key, (name, size) in SPRITES.items():
    rgb = load(name)
    art[key] = picture(*shrink(rgb, cut(rgb, keep_bits=key == "wreck"), size))

HEADER = """// The marks players leave on a world: each side's flag on its pole, a wreck, a grave marker, a beacon.
// Drawn by the image model (tools/gen/traces.py) and shrunk to game pixels by tools/voxel/traces.py:
// generated, do not edit. A picture is as space/art.ts has them (its size, its colours and its pixels
// as text).
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write(HEADER)
    f.write("\nimport type { Picture } from '../space/art'\n\n")
    for key in SPRITES:
        # (flagNomarchy → FLAG_NOMARCHY)
        name = "".join("_" + c if c.isupper() else c.upper() for c in key)
        f.write(f"export const {name}: Picture = {ts(art[key])}\n\n")
print(f"{os.path.relpath(OUT, ROOT)}: {os.path.getsize(OUT) // 1024} KB")
for key in SPRITES:
    print(key, art[key]["w"], "x", art[key]["h"])
