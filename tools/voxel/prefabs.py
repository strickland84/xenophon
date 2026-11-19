# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the pictures of stamped features (tools/gen/features.py) into game pixels.

Each picture is cut out of its black background, shrunk to the size it has in the world
(each game pixel takes the middle colour of the patch it covers), and every pixel is given
one of a few materials by its colour and brightness, and a height from how far it is from
the edge and how bright it is. The colours of the materials are taken from the pictures
too. Out comes src/lib/engine/world/prefabs.ts, which world/features.ts stamps into the
ground; it is generated, and never edited by hand.

The dropped crate sprite comes from the image model's loot sheet. The menu icons
come from tools/voxel/interface.py.

  uv run tools/voxel/prefabs.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "features", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "world", "prefabs.ts")

# which picture each feature is made from, its size in game pixels (the longer side), and its tallest point
FEATURES = {
    "hangar": ("hangar.png", 30, 9),
    "block": ("block-2.png", 20, 7),
    "command": ("command.png", 22, 11),
    "tanks": ("tanks.png", 20, 6),
    "turret": ("turret.png", 9, 4),
    "ferrite": ("ferrite-2.png", 13, 7),
    "silica": ("silica.png", 13, 8),
    "cryo-ice": ("cryo-ice.png", 13, 8),
    "magma-glass": ("magma-glass.png", 13, 7),
    "bioresin": ("bioresin.png", 13, 7),
    "salvage": ("salvage-2.png", 26, 4),
}
BUILDINGS = ["hangar", "block", "command", "tanks"]
ORES = ["ferrite", "silica", "cryo-ice", "magma-glass", "bioresin"]


def lum(c):
    return (0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]) / 255


def sat(c):
    mx = c.max(axis=-1).astype(float)
    mn = c.min(axis=-1).astype(float)
    return np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)


def cut(path, keep_bits=False):
    """the picture, and where the feature is in it: everything not the black background"""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    solid = rgb.max(axis=2) > 30
    solid = ndimage.binary_opening(solid, iterations=2)
    labels, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    big = sizes.max()
    # the feature, and (for a wreck) the bits of debris round it
    keep = [i + 1 for i, s in enumerate(sizes) if s == big or (keep_bits and s > big * 0.02)]
    mask = ndimage.binary_fill_holes(np.isin(labels, keep))
    return rgb, mask


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


def bands(values, n):
    """the values that split a set into n equal parts"""
    return np.quantile(values, [i / n for i in range(1, n)]) if len(values) else np.zeros(n - 1)


def median_colour(small, where):
    return [int(v) for v in np.median(small[where], axis=0)] if where.any() else [128, 128, 128]


prefabs = {}
colours = {}

# ── the buildings share one palette of five shades, from dark to light; gold is the trim
shrunk = {name: shrink(*cut(os.path.join(SRC, FEATURES[name][0])), FEATURES[name][1]) for name in FEATURES}
gold = lambda c: (c[..., 0] > 150) & (c[..., 1] > 110) & (c[..., 2] < 110) & (sat(c) > 0.35)
# (five colours by median cut over every building's pixels, then put in order of brightness)
every = np.concatenate([shrunk[n][0][shrunk[n][1] & ~gold(shrunk[n][0])] for n in BUILDINGS]).astype(np.uint8)
cutter = Image.fromarray(every.reshape(1, -1, 3)).quantize(5, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
five = np.asarray(cutter.getpalette()[:15]).reshape(5, 3)
order = np.argsort(lum(five.astype(float)))
five = five[order]
shade_px = {i: [] for i in range(5)}
for name in BUILDINGS:
    small, inside = shrunk[name]
    tall = FEATURES[name][2]
    L = lum(small)
    trim = gold(small) & inside
    # (each building in its own five bands of brightness, so its seams and ribs show)
    band = np.searchsorted(bands(L[inside & ~trim], 5), L)
    for i in range(5):
        shade_px[i].append(small[inside & ~trim & (band == i)])
    code = np.full(inside.shape, ".", dtype="<U1")
    code[inside] = np.array(list("abcde"))[band[inside]]
    code[trim] = "T"
    reach = ndimage.distance_transform_edt(inside)
    if name == "hangar":
        # an arched roof: highest along its middle, the long way
        across = reach / max(reach.max(), 1)
        height = np.round(tall - 3 + 3 * np.sqrt(np.clip(across * 1.3, 0, 1)))
    elif name == "tanks":
        labels, _ = ndimage.label(inside)
        height = np.zeros(inside.shape)
        for t in range(1, labels.max() + 1):
            part = labels == t
            r = ndimage.distance_transform_edt(part)
            height[part] = np.round(tall - 3 + 3 * np.sqrt(r[part] / max(r[part].max(), 1)))
    else:
        # a flat roof, with whatever stands on it (the lightest, away from the edge) a step higher
        height = np.full(inside.shape, tall - 1.0)
        height[(band >= 4) & (reach > 1.5)] = tall
        if name == "command":
            height[reach > reach.max() * 0.5] = tall
    height[~inside] = 0
    prefabs[name] = (code, height.astype(int))
# the five shades: steps of the buildings' own grey, from the pictures, far enough apart to read in a few pixels
tint = np.median(every, axis=0)
colours["building"] = [[int(min(255, v * k)) for v in tint] for k in (0.42, 0.68, 0.86, 1.04, 1.3)]
colours["trim"] = median_colour(shrunk["command"][0], gold(shrunk["command"][0]) & shrunk["command"][1])

# ── the turret: its concrete plinth, and a dark armoured dome
small, inside = shrunk["turret"]
L = lum(small)
reach = ndimage.distance_transform_edt(inside)
dome = inside & (L < np.median(L[inside]))
code = np.full(inside.shape, ".", dtype="<U1")
code[inside] = "p"
code[dome] = "u"
code[dome & (L > np.quantile(L[dome], 0.6))] = "t"
height = np.where(dome, 4, 2)
height[dome & (reach < 1.5)] = 3
height[~inside] = 0
prefabs["turret"] = (code, height.astype(int))
colours["turret"] = [median_colour(small, (code == "t")), median_colour(small, (code == "u"))]
colours["plinth"] = median_colour(small, code == "p")

# ── the ores: crystals in three shades of their own, standing out of a heap of rock
rock_px = []
for name in ORES:
    small, inside = shrunk[name]
    tall = FEATURES[name][2]
    L = lum(small)
    rock = inside & (sat(small) < 0.22) & (L < 0.7)
    crystal = inside & ~rock
    c = bands(L[crystal], 3)
    shade = np.searchsorted(c, L)
    code = np.full(inside.shape, ".", dtype="<U1")
    code[crystal] = np.array(list("210"))[shade[crystal]]
    lr = L[rock].mean() if rock.any() else 0.4
    code[rock] = np.where(L[rock] > lr, "r", "R")
    rock_px.append(small[rock])
    reach = ndimage.distance_transform_edt(inside)
    rank = np.zeros(L.shape)
    rank[crystal] = (np.argsort(np.argsort(L[crystal])) + 1) / max(crystal.sum(), 1)
    height = np.where(crystal, np.round(2 + (tall - 2) * (0.45 * rank + 0.55 * reach / max(reach.max(), 1))), 1)
    height[rock & (reach > 1.5)] = 2
    height[~inside] = 0
    prefabs[name] = (code, height.astype(int))
    colours[name] = [median_colour(small, code == s) for s in "012"]
allrock = np.concatenate(rock_px)
mid = lum(allrock).mean()
colours["rubble"] = [median_colour(allrock, lum(allrock) > mid), median_colour(allrock, lum(allrock) <= mid)]

# ── the wreck: scorched metal in three shades
small, inside = shrink(*cut(os.path.join(SRC, FEATURES["salvage"][0]), keep_bits=True), FEATURES["salvage"][1])
L = lum(small)
c = bands(L[inside], 3)
shade = np.searchsorted(c, L)
code = np.full(inside.shape, ".", dtype="<U1")
code[inside] = np.array(list("210"))[shade[inside]]
reach = ndimage.distance_transform_edt(inside)
height = np.where(inside, np.clip(np.round(1 + 3 * (0.5 * L / max(L.max(), 0.01) + 0.5 * reach / max(reach.max(), 1))), 1, 4), 0)
prefabs["salvage"] = (code, height.astype(int))
colours["salvage"] = [median_colour(small, code == s) for s in "012"]


# ── the dropped crate: the last tile on the image model’s loot sheet
def crate_sprite():
    sheet = np.asarray(Image.open(os.path.join(ROOT, "art", "mockups", "loot-icons.png")).convert("RGB")).astype(np.int32)
    dark = sheet.max(axis=2) < 40
    labels, n = ndimage.label(dark)
    tiles = []
    for i, sl in enumerate(ndimage.find_objects(labels)):
        if sl is None:
            continue
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hh > 150 and ww > 150:
            tiles.append(sl)
    tiles.sort(key=lambda s: (s[0].start // 200, s[1].start))
    # Only the world-space crate still comes from this sheet.
    tile = sheet[tiles[7]]
    mask = ndimage.binary_opening(tile.max(axis=2) > 46, iterations=1)
    labels2, n2 = ndimage.label(mask)
    sizes = ndimage.sum(mask, labels2, range(1, n2 + 1))
    mask = ndimage.binary_fill_holes(labels2 == (np.argmax(sizes) + 1))
    small, inside = shrink(tile, mask, 9)
    out = np.zeros((9, 9, 4), dtype=np.uint8)
    oy, ox = (9 - small.shape[0]) // 2, (9 - small.shape[1]) // 2
    out[oy : oy + small.shape[0], ox : ox + small.shape[1], :3] = small
    out[oy : oy + small.shape[0], ox : ox + small.shape[1], 3] = np.where(inside, 255, 0)
    return out


def ts_rows(code, height):
    rows = ["".join(r) for r in code]
    hrows = ["".join("0123456789abcdefghijklmnopqrstuvwxyz"[min(35, int(v))] for v in r) for r in height]
    return rows, hrows


lines = [
    "// Generated by tools/voxel/prefabs.py from the image model's pictures in art/features/source:",
    "// do not edit by hand. Each prefab is a feature in game pixels, as world/features.ts stamps it:",
    "// a row of characters a row of pixels, one for its material and one for its height (0-9, a-z).",
    "//",
    "//   buildings  a b c d e: five shades of roof, dark to light; T: the trim (a side's colour)",
    "//   turret    p: the plinth; t u: the dome, light and dark",
    "//   ores      0 1 2: the crystal, light to dark; r R: rock, light and dark",
    "//   salvage   0 1 2: scorched metal, light to dark",
    "",
    "export interface Prefab {",
    "  w: number",
    "  h: number",
    "  mat: string[]",
    "  height: string[]",
    "}",
    "",
    "export const PREFABS: Record<string, Prefab> = {",
]
for name, (code, height) in prefabs.items():
    rows, hrows = ts_rows(code, height)
    lines.append(f"  '{name}': {{")
    lines.append(f"    w: {code.shape[1]},")
    lines.append(f"    h: {code.shape[0]},")
    lines.append("    mat: [" + ", ".join(f"'{r}'" for r in rows) + "],")
    lines.append("    height: [" + ", ".join(f"'{r}'" for r in hrows) + "],")
    lines.append("  },")
lines.append("}")
lines.append("")
lines.append("/** the colours of the features' materials, as the pictures have them (r, g, b) */")
lines.append("export const FEATURE_COLOURS: Record<string, number[][]> = {")
for name, cs in colours.items():
    if isinstance(cs[0], int):
        cs = [cs]
    lines.append(f"  '{name}': [" + ", ".join("[" + ", ".join(str(v) for v in c) + "]" for c in cs) + "],")
lines.append("}")
lines.append("")
crate = crate_sprite()
lines.append("/** the crate a lost ship's cargo spills into, 9 px square: r, g, b, a for each pixel, row by row */")
lines.append("export const CRATE_SPRITE = { w: 9, h: 9, rgba: [" + ", ".join(str(int(v)) for v in crate.reshape(-1)) + "] }")
lines.append("")
with open(OUT, "w") as f:
    f.write("\n".join(lines))
print(f"{os.path.relpath(OUT, ROOT)}: {len(prefabs)} prefabs")
for name, (code, height) in prefabs.items():
    print(name, code.shape)
    for r in code:
        print("   ", "".join(r))
