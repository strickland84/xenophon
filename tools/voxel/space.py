# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the pictures of space (tools/gen/space.py) into game pixels.

Each sprite is cut out of its black background and shrunk to the size it has in the game (each
game pixel takes the middle colour of the patch it covers), then held to a palette of its own of
a few dozen colours; the rocks are shrunk to each of the sizes a rock is drawn at (a sprite is
never scaled in the game). The gas giants' bands and the black hole's disc become maps for the
renderer to wrap round a sphere or a ring; the star's surface and the nebulae become maps of
brightness, coloured by the game for each star and each system. Resource colours come from
the space art. The menu icons come from tools/voxel/interface.py.

Out comes src/lib/engine/space/art.ts: generated, never edited by hand.

  uv run tools/voxel/space.py
"""

import math
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "space", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "space", "art.ts")

# the sizes (across, px) a rock is drawn at: the same as ROCK_SIZES in src/lib/engine/data/space.ts
ROCK_SIZES = [12, 18, 26, 36, 46, 56]
ROCKS = [f"rock-{i}.png" for i in range(1, 7)]
ORE_ROCKS = ["ore-ferrite.png", "ore-silica.png", "ore-ice.png"]
# the station kit: which picture each part is cut from, and its longest side in game pixels
PARTS = {
    "hub-nomarchy": ("hub-nomarchy-2.png", 112),
    "hub-anarchoi": ("hub-anarchoi.png", 104),
    "hub-outpost": ("hub-outpost.png", 84),
    "arm": ("arm.png", 74),
    "solar": ("solar.png", 70),
    "tanks": ("tanks.png", 46),
    # (a station's gun turret, its barrels up the picture: the polish pass gave stations defences)
    "turret": ("turret-4.png", 16),
}
SPRITES = {
    "gate": ("gate.png", 172, False),
    "derelict": ("derelict.png", 132, True),
    "shard": ("shards.png", 14, False),
}
GIANTS = ["giant-cream.png", "giant-rust.png", "giant-teal.png", "giant-violet.png", "giant-olive.png"]
GIANT_W, GIANT_H = 256, 128
SUN_N = 128
NEBULAE = ["nebula-blue.png", "nebula-red.png"]
NEBULA_N = 192
DISC_A, DISC_R = 160, 40

ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/"


def lum(c):
    return (0.3 * c[..., 0] + 0.59 * c[..., 1] + 0.11 * c[..., 2]) / 255


def load(name):
    return np.asarray(Image.open(os.path.join(SRC, name)).convert("RGB")).astype(np.int32)


def cut(rgb, keep_bits=False, first=False, ring=False):
    """where the sprite is in its picture: everything not the black background (the biggest piece, and with `keep_bits` the debris round it; a ring keeps its pieces and its hole)"""
    solid = rgb.max(axis=2) > 34
    solid = ndimage.binary_opening(solid, iterations=2)
    labels, n = ndimage.label(solid)
    if n == 0:
        return solid
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    big = sizes.max()
    if first:
        # the first piece (in reading order) of a sheet of several alike
        order = sorted(range(n), key=lambda i: tuple(np.argwhere(labels == i + 1).min(axis=0)))
        keep = [order[0] + 1]
    else:
        keep = [i + 1 for i, s in enumerate(sizes) if s == big or ((keep_bits or ring) and s > big * 0.015)]
    if ring:
        return ndimage.binary_closing(np.isin(labels, keep), iterations=3)
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
            if patch.size and patch.mean() > 0.45:
                inside[k, i] = True
                small[k, i] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)
    return small, inside


def square(rgb, mask, size):
    """shrunk into a square of `size` (a rock: the same size whatever its shape)"""
    small, inside = shrink(rgb, mask, size)
    h, w = inside.shape
    out = np.zeros((size, size, 3), dtype=np.int32)
    oin = np.zeros((size, size), dtype=bool)
    y0 = (size - h) // 2
    x0 = (size - w) // 2
    out[y0 : y0 + h, x0 : x0 + w] = small
    oin[y0 : y0 + h, x0 : x0 + w] = inside
    return out, oin


def palette_of(pixels, n):
    """n colours that stand for a set of pixels (median cut), as a list of [r, g, b]"""
    px = np.asarray(pixels, dtype=np.uint8).reshape(1, -1, 3)
    q = Image.fromarray(px).quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.asarray(q.getpalette()[: n * 3]).reshape(-1, 3)
    return pal.astype(np.int32)


def nearest(img, pal):
    """each pixel's nearest colour of a palette, as indices"""
    flat = img.reshape(-1, 3)[:, None, :]
    d = ((flat - pal[None, :, :]) ** 2).sum(axis=2)
    return d.argmin(axis=1).reshape(img.shape[:2])


def encode(idx, inside=None):
    """a picture of palette indices as text: one letter a pixel ('.' nothing), runs of three or more as '!', two letters of their length in base 36, and the letter"""
    flat = idx.reshape(-1)
    mask = np.ones(flat.shape, dtype=bool) if inside is None else inside.reshape(-1)
    syms = ["." if not m else ALPHABET[v] for v, m in zip(flat, mask)]
    out = []
    i = 0
    while i < len(syms):
        j = i
        while j < len(syms) and syms[j] == syms[i] and j - i < 1295:
            j += 1
        n = j - i
        if n >= 3:
            out.append("!" + np.base_repr(n, 36).lower().rjust(2, "0") + syms[i])
        else:
            out.append(syms[i] * n)
        i = j
    return "".join(out)


def picture(small, inside, n=48):
    """a sprite: its size, its palette and its pixels as text"""
    pal = palette_of(small[inside], n) if inside.any() else np.zeros((1, 3), dtype=np.int32)
    idx = nearest(small, pal)
    h, w = inside.shape
    return {"w": w, "h": h, "colours": pal.tolist(), "rows": encode(idx, inside)}


def ts(v):
    if isinstance(v, dict):
        key = lambda k: k if k.isidentifier() else f"'{k}'"
        return "{ " + ", ".join(f"{key(k)}: {ts(x)}" for k, x in v.items()) + " }"
    if isinstance(v, list):
        return "[" + ", ".join(ts(x) for x in v) + "]"
    if isinstance(v, str):
        return "'" + v + "'"
    return str(int(v)) if float(v).is_integer() else f"{v:.3f}"


art = {}

# ── rocks, bare and with ore, at every size
art["rocks"] = []
for name in ROCKS:
    rgb = load(name)
    mask = cut(rgb)
    art["rocks"].append([picture(*square(rgb, mask, s), n=24) for s in ROCK_SIZES])
art["oreRocks"] = []
for name in ORE_ROCKS:
    rgb = load(name)
    mask = cut(rgb)
    art["oreRocks"].append([picture(*square(rgb, mask, s), n=28) for s in ROCK_SIZES])

# ── the station kit, the gate, the derelict, a shard
art["parts"] = {}
# (the solar wing: only the straight panel along the bottom of its picture; the model drew a second one, askew, above it)
CROPS = {"solar": (0.64, 0.79)}
for part, (name, longest) in PARTS.items():
    rgb = load(name)
    if part in CROPS:
        h = rgb.shape[0]
        top, bottom = CROPS[part]
        rgb = rgb.copy()
        rgb[: int(h * top)] = 0
        rgb[int(h * bottom) :] = 0
    art["parts"][part] = picture(*shrink(rgb, cut(rgb), longest), n=40)
for part, (name, longest, bits) in SPRITES.items():
    rgb = load(name)
    art[part] = picture(*shrink(rgb, cut(rgb, keep_bits=bits, first=part == "shard", ring=part == "gate"), longest), n=40)

# ── the gas giants: maps of their bands, wrapped round the sphere by the renderer
art["giants"] = []
for name in GIANTS:
    rgb = load(name)
    h, w = rgb.shape[:2]
    # (the middle of the picture, clear of any edge the model drew)
    m = 0.08 if "cream" not in name else 0.14
    crop = Image.fromarray(rgb[int(h * m) : int(h * (1 - m)), int(w * m) : int(w * (1 - m))].astype(np.uint8))
    small = np.asarray(crop.resize((GIANT_W, GIANT_H), Image.BOX)).astype(np.int32)
    art["giants"].append(picture(small, np.ones((GIANT_H, GIANT_W), dtype=bool), n=40))

# ── a star's surface: a map of brightness, the middle of the model's picture, made to wrap
rgb = load("sun.png")
h, w = rgb.shape[:2]
crop = Image.fromarray(rgb[h // 4 : h * 3 // 4, w // 4 : w * 3 // 4].astype(np.uint8)).resize((SUN_N, SUN_N), Image.BOX)
L = lum(np.asarray(crop).astype(np.float64))
# (wrapping: blended with itself turned half round, so the seams fall where the blend hides them)
shifted = np.roll(np.roll(L, SUN_N // 2, axis=0), SUN_N // 2, axis=1)
yy, xx = np.mgrid[0:SUN_N, 0:SUN_N]
wgt = np.minimum(np.minimum(xx, SUN_N - 1 - xx), np.minimum(yy, SUN_N - 1 - yy)) / (SUN_N / 2)
wgt = np.clip(wgt * 2.2, 0, 1)
L = L * wgt + shifted * (1 - wgt)
L = (L - L.min()) / max(1e-6, L.max() - L.min())
art["sun"] = {"w": SUN_N, "h": SUN_N, "rows": encode(np.clip(np.round(L * 15), 0, 15).astype(int))}

# ── close to (polish step 9): a star's surface and a giant's clouds seen near, maps of brightness the renderer lays over
# the far ones at a finer scale (they were a flat wall close to). From the middle of the model's pictures (it drew each as a
# sphere: the middle is least bent), made to wrap, stretched to the full range.
def near_map(name, box, w, h):
    rgb = load(name)
    H, W = rgb.shape[:2]
    crop = rgb[int(H * box[1]) : int(H * box[3]), int(W * box[0]) : int(W * box[2])].astype(np.uint8)
    L = lum(np.asarray(Image.fromarray(crop).resize((w, h), Image.BOX)).astype(np.float64))
    shifted = np.roll(np.roll(L, h // 2, axis=0), w // 2, axis=1)
    yy, xx = np.mgrid[0:h, 0:w]
    wgt = np.minimum(np.minimum(xx / w, (w - 1 - xx) / w), np.minimum(yy / h, (h - 1 - yy) / h)) * 2
    wgt = np.clip(wgt * 2.2, 0, 1)
    L = L * wgt + shifted * (1 - wgt)
    lo, hi = np.quantile(L, 0.02), np.quantile(L, 0.98)
    L = np.clip((L - lo) / max(1e-6, hi - lo), 0, 1)
    return {"w": w, "h": h, "rows": encode(np.clip(np.round(L * 15), 0, 15).astype(int))}


art["sunNear"] = near_map("sun-near-2.png", (0.24, 0.12, 0.76, 0.5), 192, 144)
art["giantNear"] = near_map("giant-near.png", (0.12, 0.12, 0.74, 0.8), 256, 128)

# ── the nebulae: maps of brightness, coloured for each system
art["nebulae"] = []
for name in NEBULAE:
    rgb = load(name)
    img = Image.fromarray(rgb.astype(np.uint8)).resize((NEBULA_N, NEBULA_N), Image.BOX)
    L = lum(np.asarray(img).astype(np.float64))
    shifted = np.roll(np.roll(L, NEBULA_N // 2, axis=0), NEBULA_N // 2, axis=1)
    yy, xx = np.mgrid[0:NEBULA_N, 0:NEBULA_N]
    wgt = np.minimum(np.minimum(xx, NEBULA_N - 1 - xx), np.minimum(yy, NEBULA_N - 1 - yy)) / (NEBULA_N / 2)
    wgt = np.clip(wgt * 2.2, 0, 1)
    L = L * wgt + shifted * (1 - wgt)
    L = np.clip(L / max(1e-6, np.quantile(L, 0.995)), 0, 1)
    art["nebulae"].append({"w": NEBULA_N, "h": NEBULA_N, "rows": encode(np.clip(np.round(L * 15), 0, 15).astype(int))})

# ── the black hole's disc: round its ring, angle across and distance down, from the picture's ring
rgb = load("accretion.png")
h, w = rgb.shape[:2]
mask = rgb.max(axis=2) > 34
ys, xs = np.nonzero(mask)
cy, cx = (ys.min() + ys.max()) / 2, (xs.min() + xs.max()) / 2
outer = max(ys.max() - ys.min(), xs.max() - xs.min()) / 2
inner = outer * 0.3
disc = np.zeros((DISC_R, DISC_A, 3), dtype=np.int32)
for r in range(DISC_R):
    rr = inner + (outer - inner) * (r + 0.5) / DISC_R
    for a in range(DISC_A):
        ang = (a + 0.5) / DISC_A * math.tau
        x = int(cx + math.cos(ang) * rr)
        y = int(cy + math.sin(ang) * rr)
        disc[r, a] = rgb[min(h - 1, max(0, y)), min(w - 1, max(0, x))]
art["disc"] = picture(disc, np.ones((DISC_R, DISC_A), dtype=bool), n=32)

# ── the colours of the two resources of space (light, middle, dark), for the HUD and the chunks
def three(name, keep):
    rgb = load(name)
    mask = cut(rgb) & keep(rgb)
    px = rgb[mask]
    L = lum(px.astype(np.float64))
    cuts = np.quantile(L, [0.33, 0.66])
    return [[int(v) for v in np.median(px[sel], axis=0)] for sel in (L > cuts[1], (L > cuts[0]) & (L <= cuts[1]), L <= cuts[0])]


sat = lambda c: (c.max(axis=-1) - c.min(axis=-1)) / np.maximum(c.max(axis=-1), 1)
art["colours"] = {
    "helion": three("icon-helion.png", lambda c: (sat(c) > 0.3) & (c[..., 0] > c[..., 2])),
    "void": three("icon-void.png", lambda c: sat(c) > 0.25),
}

HEADER = """// The art of space: the gas giants' bands, a star's surface and the nebulae (as brightness, coloured
// by the game), the rocks of the belts at every size they are drawn at, bare and with ore, the parts
// stations are built from, a jump gate, a derelict, a void shard, and a black hole's disc. Drawn by the
// image model (tools/gen/space.py) and shrunk to game pixels by tools/voxel/space.py: generated, do
// not edit.
//
// A picture is its size, its colours ([r, g, b]) and its pixels as text, row after row: one letter a
// pixel, an index into the colours (0-9, a-z, A-Z, '+', '/'), '.' nothing; a run of three or more is
// '!', its length in two letters of base 36, then the letter. A map of brightness has no colours: its
// letters are 0 (dark) to f (bright).
"""

with open(OUT, "w") as f:
    f.write(HEADER)
    f.write("\nexport interface Picture {\n  w: number\n  h: number\n  colours: number[][]\n  rows: string\n}\n")
    f.write("export interface Brightness {\n  w: number\n  h: number\n  rows: string\n}\n\n")
    f.write("/** each bare rock's picture at each size of ROCK_SIZES (data/space.ts) */\n")
    f.write(f"export const ROCKS: Picture[][] = {ts(art['rocks'])}\n\n")
    f.write("/** a rock with ore in it (ferrite, silica, cryo-ice), at each size */\n")
    f.write(f"export const ORE_ROCKS: Picture[][] = {ts(art['oreRocks'])}\n\n")
    f.write("/** the parts stations are built from: a capital's hub (each side's), an outpost's, a docking arm, a solar wing, tanks, a gun turret */\n")
    f.write(f"export const STATION_PARTS: Record<string, Picture> = {ts(art['parts'])}\n\n")
    f.write(f"export const GATE: Picture = {ts(art['gate'])}\n\n")
    f.write(f"export const DERELICT: Picture = {ts(art['derelict'])}\n\n")
    f.write(f"export const SHARD: Picture = {ts(art['shard'])}\n\n")
    f.write("/** the gas giants' bands, a map across the whole of each, wrapped round its sphere */\n")
    f.write(f"export const GIANTS: Picture[] = {ts(art['giants'])}\n\n")
    f.write("/** a star's surface, as brightness (it wraps) */\n")
    f.write(f"export const SUN: Brightness = {ts(art['sun'])}\n\n")
    f.write("/** a star's surface seen close, as brightness (it wraps): granules, lanes and sunspots, laid over SUN finer */\n")
    f.write(f"export const SUN_NEAR: Brightness = {ts(art['sunNear'])}\n\n")
    f.write("/** a gas giant's clouds seen close, as brightness (it wraps): eddies, vortices and storms, laid over its bands finer */\n")
    f.write(f"export const GIANT_NEAR: Brightness = {ts(art['giantNear'])}\n\n")
    f.write("/** the nebulae behind everything, as brightness (they wrap) */\n")
    f.write(f"export const NEBULAE: Brightness[] = {ts(art['nebulae'])}\n\n")
    f.write("/** a black hole's disc: once round it across, from its inner edge to its outer down */\n")
    f.write(f"export const DISC: Picture = {ts(art['disc'])}\n\n")
    f.write("/** the colours of the resources found in space: light, middle, dark */\n")
    f.write(f"export const SPACE_COLOURS: Record<string, number[][]> = {ts(art['colours'])}\n")

size = os.path.getsize(OUT)
print(f"{os.path.relpath(OUT, ROOT)}: {size // 1024} KB")
