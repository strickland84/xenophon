# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the pictures of the places inside (tools/gen/interiors.py) into game pixels.

A floor is shrunk whole to 32 px square (four plates a side, so it tiles on the plates' seams); a
wall to a strip 64 px wide and 12 tall (its face); a thing hung on a wall is cut out of its black
background and shrunk to its width. Every piece of furniture is the try tools/gen/interiors.py
found passing the tiling rule (art/interiors/picks.json), cut to its own outline and shrunk to
exactly its footprint in game pixels (tools/voxel/tiling.py: TILE px a tile across, its depth and
rise down), each game pixel the middle colour of the patch it covers, then held to a palette of
its own. A pick that no longer passes stops this with an error: no piece can get in that breaks
the rule.

Out comes src/lib/engine/interior/art.ts: generated, never edited by hand.

  uv run tools/voxel/interiors.py
"""

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tiling import LOOSE, clean, game_pixels, noise  # noqa: E402


ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "interiors", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "interior", "art.ts")

FLOORS = ["floor-hangar", "floor-lane", "floor-deck", "floor-ship", "floor-quarters", "floor-cargo", "floor-engine", "walltop"]
WALLS = ["wall-hangar", "wall-deck", "wall-ship"]
# a back wall's face, px tall (render/interior.ts FACE)
FACE = 12
# each thing hung on a wall and its width in game pixels (inside, a tile is 8 px and the pilot about 12 tall)
PROPS = {
    "door": 16,
    "hangardoor": 48,
    "walllamp": 6,
    "porthole": 9,
    "window": 34,
    "wallscreen": 13,
    "charts": 13,
    "pipes": 15,
    "vent": 7,
}
PICKS = {}

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/"


# (the cutting and shrinking are those of tools/voxel/traces.py)
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


def ts(v):
    if isinstance(v, dict):
        return "{ " + ", ".join(f"{k}: {ts(x)}" for k, x in v.items()) + " }"
    if isinstance(v, list):
        return "[" + ", ".join(ts(x) for x in v) + "]"
    if isinstance(v, str):
        return "'" + v + "'"
    return str(int(v))


def load(name):
    name = PICKS.get(name, name)
    return np.asarray(Image.open(os.path.join(SRC, name + ".png")).convert("RGB")).astype(np.int32)


def whole(rgb, w, h):
    """a picture shrunk whole to w × h: each game pixel the middle colour of its patch"""
    H, W = rgb.shape[:2]
    out = np.zeros((h, w, 3), dtype=np.int32)
    for k in range(h):
        for i in range(w):
            patch = rgb[int(k * H / h) : int((k + 1) * H / h), int(i * W / w) : int((i + 1) * W / w)]
            out[k, i] = np.median(patch.reshape(-1, 3), axis=0)
    return out


def picture(small, inside, n):
    pal = palette_of(small[inside], n)
    idx = nearest(small, pal)
    h, w = inside.shape
    return {"w": w, "h": h, "colours": pal.tolist(), "rows": encode(idx, inside)}


def by_width(rgb, mask, width):
    """a prop shrunk so it is `width` game pixels across"""
    ys, xs = np.nonzero(mask)
    tall = (ys.max() - ys.min() + 1) / (xs.max() - xs.min() + 1)
    return shrink(rgb, mask, max(width, int(round(width * tall))))


art = {"floors": {}, "walls": {}, "props": {}}
for f in FLOORS:
    small = whole(load(f), 32, 32)
    art["floors"][f] = picture(small, np.ones((32, 32), dtype=bool), 16)
for f in WALLS:
    small = whole(load(f), 64, FACE)
    art["walls"][f] = picture(small, np.ones((FACE, 64), dtype=bool), 24)
for name, width in PROPS.items():
    if not os.path.exists(os.path.join(SRC, PICKS.get(name, name) + ".png")):
        print(f"{name}: not drawn yet (uv run tools/gen/interiors.py --floors {name})")
        continue
    rgb = load(name)
    small, inside = by_width(rgb, cut(rgb, keep_bits=True), width)
    art["props"][name] = picture(small, inside, 32)
    print(name, inside.shape[1], "x", inside.shape[0])
# the furniture: each facing's passing try, cut to its outline and shrunk to its footprint exactly
# (a side or back facing in its front facing's colours with its specks taken out, and refused if it is still noise: the
# fresh review found side facings that were orange and black static)
picks = json.load(open(os.path.join(ROOT, "art", "interiors", "picks.json")))
shrunk = {}
for key in sorted(picks, key=lambda k: (k.rsplit("-", 1)[1] != "s", k)):
    pick = picks[key]
    source = pick["source"] if "source" in pick else f"{key}-{pick['seed']}.png"
    rgb = np.asarray(Image.open(os.path.join(SRC, source)).convert("RGB")).astype(np.int32)
    w, h = pick["size"]
    name, face = key.rsplit("-", 1)
    px, empty, why = game_pixels(rgb, pick["box"], w, h, flat=name in ("deckmat", "bay"), back=face == "n", loose=name in LOOSE)
    if why:
        raise SystemExit(f"{key}: the picked try fails the tiling rule: {why}")
    front = shrunk.get(f"{name}-s")
    if face in "ewn" and front is not None:
        px = clean(px, empty, *front)
    if (face in "ewn" and front is not None) or "source" in pick:
        why = noise(px, empty, loose=name in LOOSE)
        if why:
            raise SystemExit(f"{key}: the picked try is {why}")
    shrunk[key] = (px, empty)
    art["props"][key] = picture(px, ~empty, 32)
    print(key, w, "x", h)

HEADER = """// The places inside: the floors and walls of the hangar, the station deck and a ship's rooms, and
// every prop and piece of furniture in them. Drawn by the image model (tools/gen/interiors.py) and
// shrunk to game pixels by tools/voxel/interiors.py: generated, do not edit. A picture is as
// space/art.ts has them (its size, its colours and its pixels as text).
"""

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    f.write(HEADER)
    f.write("\nimport type { Picture } from '../space/art'\n\n")
    for group, items in art.items():
        f.write(f"export const {group.upper()}: Record<string, Picture> = {{\n")
        for key, pic in items.items():
            f.write(f"  '{key}': {ts(pic)},\n")
        f.write("}\n\n")
print(f"{os.path.relpath(OUT, ROOT)}: {os.path.getsize(OUT) // 1024} KB")
