# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the pictures of ship parts and emblems (tools/gen/parts.py) into game pixels.

Each part is cut out of its black background and shrunk to the size it has on a ship (each game
pixel takes the middle colour of the patch it covers). Its colours are then sorted as the hulls'
are, so it takes the pilot's paint: its metal becomes one of sixteen tones of the trim colour (by
how light it is against the part's own middle tone), its orange markings take his markings colour,
and anything glowing takes his engine glow. Each pixel gets a height in slices from how far it is
from the part's edge, so a pod is rounder in the middle.

An emblem becomes a small mask (the shape the model drew in white) for the wings, and an icon for
the menus (static/emblems/<name>.png).

Out comes src/lib/engine/jet/parts.ts: generated, never edited by hand.

  uv run tools/voxel/parts.py
"""

import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "parts", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "jet", "parts.ts")
ICONS = os.path.join(ROOT, "static", "emblems")

# each part: its picture (the try chosen by eye of those drawn in polish step 8 for their flying size), its longest side in
# game pixels as it flies (larger than before: a pod, a rack, a dish that reads as one), the most slices it stands, and its
# longest side in the hangar's larger build (data/interiors.ts BIG: as it was, so the hangar's ships keep their look)
PARTS = {
    "flak": ("flak-12.png", 11, 2, 20),
    "laser": ("laser-12.png", 14, 2, 30),
    "rack": ("rack-11.png", 12, 2, 25),
    "mines": ("mines-13.png", 10, 2, 18),
    "cargo": ("cargo-12.png", 16, 3, 35),
    "scanner": ("scanner-12.png", 11, 2, 20),
    "tractor": ("tractor-12.png", 10, 2, 18),
    "tank": ("tank-12.png", 13, 2, 25),
    "shield": ("shield-12.png", 10, 2, 15),
    "cruise": ("cruise-12.png", 12, 2, 22),
    "heatsink": ("heatsink-12.png", 11, 1, 20),
    "armour": ("armour-13.png", 12, 1, 25),
}
EMBLEMS = ["skull", "star", "wolf", "comet", "crown", "eye", "fang", "flame", "bolt", "moon"]
MARKS = ["nomarchy", "anarchoi"]
# an emblem on a wing is this many game pixels square
EMBLEM_SIZE = 7
# the hangar's larger build of a ship is this many times larger (data/interiors.ts BIG): its parts and emblems are drawn larger from the same pictures
BIG = 2.5


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB")).astype(np.int32)


def cut(rgb):
    """where the thing is in its picture: everything not the black background (its biggest piece and the bits close by)"""
    solid = rgb.max(axis=2) > 30
    solid = ndimage.binary_opening(solid, iterations=1)
    labels, n = ndimage.label(solid)
    if n == 0:
        return solid
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    big = sizes.max()
    keep = [i + 1 for i, s in enumerate(sizes) if s > big * 0.02]
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
            if patch.size and patch.mean() > 0.25:
                inside[k, i] = True
                small[k, i] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)
    return small, inside


def lum(c):
    return 0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]


# parts whose bright colour is the engines' glow, not their own (the heat sink's fins, the cruise drive's nozzle)
GLOWING = {"heatsink", "cruise"}
# a part's own colours (polish step 8: a touch of each part's own colour, so it reads as what it is in flight): red, yellow,
# green and cyan, each in four tones from dark to light, as letters (render/paint.ts PART_COLOURS, jet/fit.ts PART_AT)
OWN = {"red": "HIJK", "yellow": "LMNO", "green": "PQRS", "cyan": "TUVW"}


def hue_of(c):
    r, g, b = [float(v) for v in c]
    hi, lo = max(r, g, b), min(r, g, b)
    if hi - lo < 1:
        return 0.0
    if hi == r:
        h = (g - b) / (hi - lo) % 6
    elif hi == g:
        h = (b - r) / (hi - lo) + 2
    else:
        h = (r - g) / (hi - lo) + 4
    return h * 60


def sort_colours(small, inside, glowing=False):
    """each pixel as a letter: '.' nothing, '0'-'f' a tone of the trim, 'A' the markings, 'G' the glow, and a part's own
    colours (OWN): red, yellow, green, cyan in four tones"""
    h, w = inside.shape
    l = lum(small.astype(float))
    hi = small.max(axis=2).astype(float)
    lo = small.min(axis=2).astype(float)
    sat = np.where(hi > 0, (hi - lo) / np.maximum(hi, 1), 0)
    coloured = (sat > 0.4) & (hi > 90) & inside
    metal = inside & ~coloured
    mid = np.median(l[metal]) if metal.any() else 80
    out = []
    for k in range(h):
        row = []
        for i in range(w):
            if not inside[k, i]:
                row.append(".")
            elif coloured[k, i]:
                hu = hue_of(small[k, i])
                tone = max(0, min(3, int(hi[k, i] / 64)))
                if glowing:
                    row.append("G")
                elif 14 <= hu < 44:
                    row.append("A")
                elif 44 <= hu < 72:
                    row.append(OWN["yellow"][tone])
                elif 72 <= hu < 165:
                    row.append(OWN["green"][tone])
                elif 165 <= hu < 265:
                    row.append(OWN["cyan"][tone])
                else:
                    row.append(OWN["red"][tone])
            else:
                t = int(round(8 * l[k, i] / max(mid, 1)))
                row.append("0123456789abcdef"[max(0, min(15, t))])
        out.append("".join(row))
    return out


def heights(inside, most):
    """slices each pixel stands: more the further it is from the part's edge"""
    d = ndimage.distance_transform_edt(np.pad(inside, 1))[1:-1, 1:-1]
    hgt = np.clip(np.floor(d / 1.6) + 1, 1, most).astype(int)
    return ["".join(str(v) if m else "0" for v, m in zip(row, mrow)) for row, mrow in zip(hgt, inside)]


def emblem_mask(name, size=EMBLEM_SIZE):
    """the white shape of an emblem, square, as rows of '#' and '.'"""
    rgb = load(name)
    mask = cut(rgb)
    ys, xs = np.nonzero(mask)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    side = max(bottom - top, right - left)
    cy, cx = (top + bottom) // 2, (left + right) // 2
    white = lum(rgb.astype(float)) > 150
    cell = side / size
    rows = []
    for k in range(size):
        row = ""
        for i in range(size):
            ya = int(cy - side / 2 + k * cell)
            xa = int(cx - side / 2 + i * cell)
            patch = white[max(0, ya) : max(0, ya) + max(1, int(cell)), max(0, xa) : max(0, xa) + max(1, int(cell))]
            row += "#" if patch.size and patch.mean() > 0.38 else "."
        rows.append(row)
    # the menus' icon: the cut-out picture in 24 px, centred in 32
    small, inside = shrink(rgb, mask, 24)
    icon = np.zeros((32, 32, 4), dtype=np.uint8)
    h, w = inside.shape
    y0, x0 = (32 - h) // 2, (32 - w) // 2
    icon[y0 : y0 + h, x0 : x0 + w, :3] = small
    icon[y0 : y0 + h, x0 : x0 + w, 3] = np.where(inside, 255, 0)
    return rows, icon


def ts_rows(rows):
    return "[" + ", ".join(f"'{r}'" for r in rows) + "]"


os.makedirs(ICONS, exist_ok=True)
lines = [
    "// The parts a pilot fits to his ship, and the emblems he paints on its wings. Drawn by the image model",
    "// (tools/gen/parts.py) and shrunk to game pixels by tools/voxel/parts.py: generated, do not edit.",
    "//",
    "// A part's rows run from its front: '.' nothing, '0' to 'f' a tone of the trim colour (8 its own),",
    "// 'A' the markings colour, 'G' the engine glow, 'H'-'W' its own colours (red, yellow, green, cyan, four tones",
    "// each: jet/fit.ts PART_AT); `tall` says how many slices each pixel stands.",
    "// An emblem is a small square mask ('#' painted).",
    "",
    "export interface PartArt {",
    "  w: number",
    "  l: number",
    "  rows: string[]",
    "  tall: string[]",
    "}",
    "",
    "export const PART_ART: Record<string, PartArt> = {",
]
for key, (name, longest, most, _) in PARTS.items():
    rgb = load(name)
    small, inside = shrink(rgb, cut(rgb), longest)
    rows = sort_colours(small, inside, key in GLOWING)
    tall = heights(inside, most)
    lines.append(f"  {key}: {{ w: {inside.shape[1]}, l: {inside.shape[0]}, rows: {ts_rows(rows)}, tall: {ts_rows(tall)} }},")
    print(key, inside.shape[1], "x", inside.shape[0])
    for r in rows:
        print("   ", r)
lines.append("}")
lines.append("")
lines.append("export const EMBLEM_ART: Record<string, string[]> = {")
for e in EMBLEMS + [f"mark-{m}" for m in MARKS]:
    file = f"emblem-{e}.png" if not e.startswith("mark-") else f"{e}.png"
    rows, icon = emblem_mask(file)
    # Keep the chosen mark's silhouette and give its menu preview the console's steel finish.
    solid = icon[..., 3] > 0
    light = lum(icon[..., :3].astype(float))
    ramp = np.array([(45, 66, 89), (100, 134, 157), (171, 199, 215), (225, 237, 242)])
    icon[solid, :3] = ramp[np.digitize(light[solid], [85, 145, 205])]
    Image.fromarray(icon, "RGBA").save(os.path.join(ICONS, f"{e}.png"))
    lines.append(f"  '{e}': {ts_rows(rows)},")
    print(e, rows)
lines.append("}")
# the hangar's larger build: the same parts and emblems, drawn larger from the same pictures
lines.append("")
lines.append("/** the parts as the hangar's larger build of a ship has them (data/interiors.ts BIG) */")
lines.append("export const BIG_PART_ART: Record<string, PartArt> = {")
for key, (name, longest, most, big) in PARTS.items():
    rgb = load(name)
    small, inside = shrink(rgb, cut(rgb), big)
    rows = sort_colours(small, inside, key in GLOWING)
    tall = heights(inside, int(round(most * BIG)))
    lines.append(f"  {key}: {{ w: {inside.shape[1]}, l: {inside.shape[0]}, rows: {ts_rows(rows)}, tall: {ts_rows(tall)} }},")
lines.append("}")
lines.append("")
lines.append("export const BIG_EMBLEM_ART: Record<string, string[]> = {")
for e in EMBLEMS + [f"mark-{m}" for m in MARKS]:
    file = f"emblem-{e}.png" if not e.startswith("mark-") else f"{e}.png"
    rows, _ = emblem_mask(file, int(round(EMBLEM_SIZE * BIG)))
    lines.append(f"  '{e}': {ts_rows(rows)},")
lines.append("}")
with open(OUT, "w") as f:
    f.write("\n".join(lines) + "\n")
print(f"{os.path.relpath(OUT, ROOT)}; icons in {os.path.relpath(ICONS, ROOT)}")
