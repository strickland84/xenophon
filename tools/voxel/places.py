# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the pictures of the places found out over a world (tools/gen/places.py) into game pixels.

Each picture is cut out of its black background and shrunk to the size it has in the world (each game pixel takes
the middle colour of the patch it covers), as the bases' buildings are (tools/voxel/prefabs.py). All of them share
one palette of a few colours, taken from the pictures themselves, so they come out in one look; every pixel is given
one of those colours as its material, and a height by what it is (a dome swells, a wall stands, a floor lies low).
Out comes src/lib/engine/world/placeart.ts, which world/places.ts stamps into the ground; it is generated, and
never edited by hand.

  uv run tools/voxel/places.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "places", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "world", "placeart.ts")

# which picture each place is made from (the try chosen by eye), and its size in game pixels (the longer side)
PLACES = {
    "dome": ("dome.png", 20),
    "house": ("house.png", 12),
    "greenhouse": ("greenhouse.png", 24),
    "tower": ("tower-2.png", 16),
    "ruin": ("ruin-2.png", 30),
    "stones": ("stones.png", 26),
    "rig": ("rig-2.png", 20),
}
COLOURS = 14


def lum(c):
    return (0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]) / 255


def sat(c):
    mx = c.max(axis=-1).astype(float)
    mn = c.min(axis=-1).astype(float)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)


def cut(path):
    """the picture, and where the place is in it: everything not the black background"""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    solid = rgb.max(axis=2) > 34
    solid = ndimage.binary_opening(solid, iterations=2)
    labels, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s > sizes.max() * 0.03]
    return rgb, ndimage.binary_fill_holes(np.isin(labels, keep))


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
            ya, yb = int(top + k * cell), int(top + (k + 1) * cell)
            xa, xb = int(left + i * cell), int(left + (i + 1) * cell)
            patch = mask[ya:yb, xa:xb]
            if patch.size and patch.mean() > 0.45:
                inside[k, i] = True
                small[k, i] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)
    return small, inside


shrunk = {name: shrink(*cut(os.path.join(SRC, file)), size) for name, (file, size) in PLACES.items()}

# one palette for them all: by median cut over every place's pixels (each place counted alike, whatever its size)
samples = []
for name, (small, inside) in shrunk.items():
    px = small[inside]
    samples.append(px[np.random.default_rng(7).integers(0, len(px), 600)])
every = np.concatenate(samples).astype(np.uint8)
cutter = Image.fromarray(every.reshape(1, -1, 3)).quantize(COLOURS, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
palette = np.asarray(cutter.getpalette()[: COLOURS * 3]).reshape(COLOURS, 3).astype(np.int32)
palette = palette[np.argsort(lum(palette.astype(float)))]


def nearest(small):
    d = ((small[:, :, None, :] - palette[None, None, :, :]) ** 2).sum(axis=-1)
    return d.argmin(axis=-1)


prefabs = {}
for name, (small, inside) in shrunk.items():
    idx = nearest(small)
    L = lum(small)
    S = sat(small)
    reach = ndimage.distance_transform_edt(inside)
    far = reach / max(reach.max(), 1)
    if name == "dome":
        # it swells: lowest at its rim, highest over its middle
        height = np.round(2 + 7 * np.sqrt(np.clip(far, 0, 1)))
    elif name == "house":
        # a ridged roof: a step higher along its middle
        height = np.where(far > 0.55, 5, 4)
    elif name == "greenhouse":
        # glass, low; its white frame a step over it
        height = np.where((L > 0.72) & (S < 0.25), 4, 3)
    elif name == "tower":
        # a deck, its dish standing over it, a lamp at each corner
        dish = (L > 0.7) & (S < 0.2)
        height = np.where(dish, 6, 2)
        height[(S > 0.6) & (small[..., 0] > 150)] = 4
    elif name == "ruin":
        # its walls' tops stand; its floors lie low, with fallen blocks on them
        wall = (L > np.quantile(L[inside], 0.58)) & (S < 0.5)
        height = np.where(wall, 5, 1)
        height[wall & (reach < 1.5)] = 4
    elif name == "stones":
        # the standing stones, dark, tall; the altar low; the turf round them
        stone = (L < 0.3) & (S < 0.45)
        labels, n = ndimage.label(stone)
        height = np.ones(inside.shape)
        for t in range(1, n + 1):
            part = labels == t
            height[part] = 2 if part.sum() > inside.sum() * 0.06 else 8
    else:
        # the rig: a deck; its crane and its hoppers over it; the shaft a hole in it
        height = np.full(inside.shape, 3.0)
        height[(S > 0.55) & (L > 0.35)] = 6
        height[(L < 0.12) & (far > 0.35)] = 1
    height[~inside] = 0
    code = np.full(inside.shape, ".", dtype="<U1")
    code[inside] = np.array(list("abcdefghijklmnopqrstuvwxyz"))[idx[inside]]
    prefabs[name] = (code, height.astype(int))

# which of the palette's colours give their own light at night: a lamp's red, a glyph's cyan
glow = [0.6 if (sat(c.astype(float)) > 0.7 and lum(c.astype(float)) > 0.3 and (c[0] > 190 or (c[1] > 170 and c[2] > 150 and c[0] < 110))) else 0 for c in palette]

lines = [
    "// Generated by tools/voxel/places.py from the image model's pictures in art/places/source:",
    "// do not edit by hand. Each is a place found out over a world, in game pixels, as world/places.ts stamps it:",
    "// a row of characters a row of pixels, one for its material (a letter: a colour of PLACE_COLOURS, 'a' the first)",
    "// and one for its height (0-9, a-z).",
    "",
    "import type { Prefab } from './prefabs'",
    "",
    "export const PLACE_ART: Record<string, Prefab> = {",
]
for name, (code, height) in prefabs.items():
    rows = ["".join(r) for r in code]
    hrows = ["".join("0123456789abcdefghijklmnopqrstuvwxyz"[min(35, int(v))] for v in r) for r in height]
    lines.append(f"  '{name}': {{")
    lines.append(f"    w: {code.shape[1]},")
    lines.append(f"    h: {code.shape[0]},")
    lines.append("    mat: [" + ", ".join(f"'{r}'" for r in rows) + "],")
    lines.append("    height: [" + ", ".join(f"'{r}'" for r in hrows) + "],")
    lines.append("  },")
lines.append("}")
lines.append("")
lines.append("/** the colours of the places' materials, dark to light, as the pictures have them (r, g, b) */")
lines.append("export const PLACE_COLOURS: number[][] = [" + ", ".join("[" + ", ".join(str(int(v)) for v in c) + "]" for c in palette) + "]")
lines.append("")
lines.append("/** how much of its own light each keeps at night (a lamp, a glowing glyph) */")
lines.append("export const PLACE_GLOW: number[] = [" + ", ".join(str(g) for g in glow) + "]")
lines.append("")
with open(OUT, "w") as f:
    f.write("\n".join(lines))
print(f"{os.path.relpath(OUT, ROOT)}: {len(prefabs)} places, {COLOURS} colours")
for name, (code, height) in prefabs.items():
    print(name, code.shape)
