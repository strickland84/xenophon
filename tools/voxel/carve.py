# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Carves a ship's voxels out of three pictures of it: from above, from the side and from behind.

  uv run tools/voxel/carve.py <name> out.npz --length 40 [--top a.png] [--side b.png] [--rear c.png] [--debug d.png]

The pictures are art/hulls/source/<name>-2.png (from above, as the ships always were), and the tries chosen from the
side and from behind (art/hulls/picks.json names their seeds: art/hulls/side/<name>-<seed>.png, rear/…).

The solid is what all the views allow: the plan's own solid (tools/art-sheet.ts writes it beside the guides,
art/hulls/control/plan-<name>.json: each part as its outlines from above, the side and behind allow), cut down to the
outlines the image model drew over the guides from the side and from behind. Every column of the top picture keeps at
least one voxel, so the ship's outline from above is the top picture's, as it always was.

Each face takes its colour from the view that looks at it: its top from the top picture, its flanks from the side
picture (the same on both sides), its back, with the nozzles and their glow, from the rear picture, the belly a shade
darker than the top over it. A face that view cannot see (a step hidden behind a nearer part) takes the colour of the
next view that can, so no picture's colour lands on a face it did not draw.

Writes the voxels and their colours (tools/voxel/stackview.py's .npz), and `glow`: which voxels are the engines' glow
(the nozzles seen from behind, and seen from above at the back), for tools/voxel/to_model.py.
"""

import argparse
import base64
import colorsys
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stackview

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

ap = argparse.ArgumentParser()
ap.add_argument("name")
ap.add_argument("out")
ap.add_argument("--length", type=int, required=True, help="the ship's length in game pixels")
ap.add_argument("--top", help="the picture from above (default art/hulls/source/<name>-2.png)")
ap.add_argument("--side", help="the picture from the side (default art/hulls/side/<name>.png)")
ap.add_argument("--rear", help="the picture from behind (default art/hulls/rear/<name>.png)")
ap.add_argument("--debug", help="a sheet of the carved views beside the pictures, to this file")
args = ap.parse_args()

name = args.name
# the tries chosen by eye from each view (art/hulls/picks.json: hull → {"side": seed, "rear": seed})
picks = json.load(open(os.path.join(ROOT, "art", "hulls", "picks.json"))).get(name, {})
top_path = args.top or os.path.join(ROOT, "art", "hulls", "source", f"{name}-2.png")
side_path = args.side or os.path.join(ROOT, "art", "hulls", "side", f"{name}-{picks.get('side', 1)}.png")
rear_path = args.rear or os.path.join(ROOT, "art", "hulls", "rear", f"{name}-{picks.get('rear', 1)}.png")
plan = json.load(open(os.path.join(ROOT, "art", "hulls", "control", f"plan-{name}.json")))
PW, PL, PH = plan["w"], plan["l"], plan["h"]
pkind = np.frombuffer(base64.b64decode(plan["kind"]), dtype=np.uint8).reshape(PH, PL, PW)


def cut_out(path, every_piece=False):
    """the ship in a picture: its colours, which pixels are ship (the dark area touching the edge is not), and its box.
    The top picture keeps `every_piece` (as tools/voxel/topview.py cut it: its outline, and so the ship's rooms, are as they
    always were); the others drop specks in the background"""
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.int32)
    dark = rgb.max(axis=2) < 36
    labels, _ = ndimage.label(dark)
    border = np.unique(np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]]))
    ship = ~np.isin(labels, border[border > 0])
    ship = ndimage.binary_opening(ship, iterations=2)
    # (only the largest piece: a stray speck in the background is not ship)
    lab, n = ndimage.label(ship)
    if n > 1 and not every_piece:
        sizes = ndimage.sum(ship, lab, range(1, n + 1))
        keep = 1 + np.argsort(sizes)[::-1]
        # a ship can be in several pieces (the dart's blades): keep every piece at least a fifth the size of the largest
        ship = np.isin(lab, keep[sizes[keep - 1] >= sizes.max() * 0.05])
    ys, xs = np.nonzero(ship)
    return rgb, ship, (ys.min(), ys.max() + 1, xs.min(), xs.max() + 1)


def shrink(rgb, ship, box, rows, cols):
    """the picture's ship within its box, down to rows × cols cells: each the middle colour of the patch it covers"""
    top, bottom, left, right = box
    ch = (bottom - top) / rows
    cw = (right - left) / cols
    col = np.zeros((rows, cols, 3), dtype=np.uint8)
    inside = np.zeros((rows, cols), dtype=bool)
    for r in range(rows):
        for c in range(cols):
            ya, yb = int(top + r * ch + ch * 0.25), int(top + (r + 1) * ch - ch * 0.25) + 1
            xa, xb = int(left + c * cw + cw * 0.25), int(left + (c + 1) * cw - cw * 0.25) + 1
            patch = ship[ya:yb, xa:xb]
            if patch.size and patch.mean() > 0.5:
                inside[r, c] = True
                col[r, c] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)
    return col, inside


def mirrored(col, inside):
    """the same on both sides: the left half onto the right (across is the last axis)"""
    half = col.shape[1] // 2
    col = col.copy()
    inside = inside.copy()
    col[:, col.shape[1] - half :] = col[:, :half][:, ::-1]
    inside[:, inside.shape[1] - half :] = inside[:, :half][:, ::-1]
    return col, inside


def nearest(inside):
    """for every cell, the nearest cell inside (for a colour where the picture has none)"""
    _, idx = ndimage.distance_transform_edt(~inside, return_indices=True)
    return idx


# ── the top picture, as tools/voxel/topview.py read it: the ship's length sets the size of a cell
L = args.length
rgb, ship, box = cut_out(top_path, every_piece=True)
cell = (box[1] - box[0]) / L
W = int(round((box[3] - box[2]) / cell / 2)) * 2
x0 = (box[2] + box[3]) / 2 - W * cell / 2
top_col, top_in = shrink(rgb, ship, (box[0], box[1], x0, x0 + W * cell), L, W)
top_col, top_in = mirrored(top_col, top_in)

# ── the plan's solid, measured: its box (the nose may not be at its first row), and its height in cells of the top's size
occ = pkind > 0
zs, ks, is_ = np.nonzero(occ)
pk0, pk1 = ks.min(), ks.max() + 1
pi0, pi1 = is_.min(), is_.max() + 1
pz0, pz1 = zs.min(), zs.max() + 1
H = max(3, int(round((pz1 - pz0) * L / (pk1 - pk0))))

# ── the side picture (the nose to the left), down to L × H; the rear picture (its right on the right), down to W × H
srgb, sship, sbox = cut_out(side_path)
side_col, side_in = shrink(srgb, sship, sbox, H, L)  # [row from the top, along]
side_col, side_in = side_col[::-1].transpose(1, 0, 2), side_in[::-1].T  # [along, height up]
rrgb, rship, rbox = cut_out(rear_path)
rear_col, rear_in = shrink(rrgb, rship, rbox, H, W)  # [row from the top, across]
rear_col, rear_in = mirrored(rear_col, rear_in)
rear_col, rear_in = rear_col[::-1].transpose(1, 0, 2), rear_in[::-1].T  # [across, height up]

# ── the solid: the plan's (sampled at each cell's middle), within the side's and rear's outlines
kk = np.clip(((np.arange(L) + 0.5) / L * (pk1 - pk0) + pk0).astype(int), 0, PL - 1)
ii = np.clip(((np.arange(W) + 0.5) / W * (pi1 - pi0) + pi0).astype(int), 0, PW - 1)
zz = np.clip(((np.arange(H) + 0.5) / H * (pz1 - pz0) + pz0).astype(int), 0, PH - 1)
plan_at = occ[zz][:, kk][:, :, ii]  # [z, k, i]
# a column of the top picture over no part of the plan (the model drew a little past it) takes the nearest column that is
cols = plan_at.any(axis=0)
idx = nearest(cols)
plan_at = plan_at[:, idx[0], idx[1]]
# which part of the plan each voxel is in (src/lib/art/hulls.ts: 1 hull, 2 a part, 3 glass, 4 a nozzle)
GLASS_KIND, ENGINE_KIND = 3, 4
kind_at = pkind[zz][:, kk][:, :, ii][:, idx[0], idx[1]]
solid = plan_at & side_in.T[:, :, None] & rear_in.T[:, None, :] & top_in[None]
# (the canopy is the plan's: a view may draw a notch where the canopy shows through, and cut it away)
solid |= plan_at & (kind_at == GLASS_KIND) & top_in[None]
# every column of the top picture keeps a voxel: where the views cut it all away, the plan's top one there
for k, i in zip(*np.nonzero(top_in & ~solid.any(axis=0))):
    z = np.nonzero(plan_at[:, k, i])[0]
    solid[z.max() if len(z) else H // 3, k, i] = True

# ── colours, face by face
pad = np.pad(solid, 1)
up = ~pad[2:, 1:-1, 1:-1]
down = ~pad[:-2, 1:-1, 1:-1]
back = ~pad[1:-1, 2:, 1:-1]
front = ~pad[1:-1, :-2, 1:-1]
left = ~pad[1:-1, 1:-1, :-2]
right = ~pad[1:-1, 1:-1, 2:]

zg, kg, ig = np.meshgrid(np.arange(H), np.arange(L), np.arange(W), indexing="ij")
# which voxel each view sees first along each of its lines: from above the highest of a column, from behind the
# rearmost of each (height, across) row, from the side the outermost (either side) of each (height, along) row
highest = np.where(solid.any(axis=0), H - 1 - np.argmax(solid[::-1], axis=0), -1)
rearmost = np.where(solid.any(axis=1), L - 1 - np.argmax(solid[:, ::-1], axis=1), -1)
leftmost = np.where(solid.any(axis=2), np.argmax(solid, axis=2), -1)
rightmost = np.where(solid.any(axis=2), W - 1 - np.argmax(solid[:, :, ::-1], axis=2), -1)
seen_above = up & (zg == highest[None])
seen_behind = back & (kg >= rearmost[:, None, :] - 1)
seen_side = (left & (ig <= leftmost[:, :, None] + 1)) | (right & (ig >= rightmost[:, :, None] - 1))

# ── the colours: one palette, the top picture's (the game's own look, from above), family by family; the side and rear
# pictures snapped to it, so every face of the ship is painted from the same tins. The glow has colours of its own.
def family(c):
    """which paint family a colour is (as tools/voxel/to_model.py sorts them): 0 hull, 1 markings, 2 glass, 3 glow"""
    h, s, v = colorsys.rgb_to_hsv(*(np.asarray(c) / 255))
    hue = h * 360
    if 195 <= hue <= 265 and s > 0.4 and v > 0.42:
        return 3
    if s > 0.45 and 8 <= hue <= 55:
        return 1
    if s > 0.35 and 150 <= hue < 200:
        return 2
    return 0


def families(pic):
    return np.array([family(c) for c in pic.reshape(-1, 3)]).reshape(pic.shape[:-1])


def quantise(colours, n):
    img = Image.fromarray(np.asarray(colours, dtype=np.uint8).reshape(1, -1, 3))
    q = img.quantize(max(1, min(n, len(colours))), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return np.asarray(q.getpalette()[: max(1, min(n, len(colours))) * 3]).reshape(-1, 3).astype(np.float64)


# how many tones each family may have (few, so colour sits in clusters: docs/pixel-art-techniques.md)
BUDGET = {0: 13, 1: 6, 2: 5, 3: 6}
top_fam = families(top_col)
side_fam = families(side_col)
rear_fam = families(rear_col)
tins = {}
for f in (0, 1, 2):
    have = top_col[top_in & (top_fam == f)]
    if len(have):
        tins[f] = quantise(have, BUDGET[f])
glows = np.concatenate([p[m & (fm == 3)] for p, m, fm in ((top_col, top_in, top_fam), (side_col, side_in, side_fam), (rear_col, rear_in, rear_fam))])
if len(glows):
    tins[3] = quantise(glows, BUDGET[3])


def snap(pic, fam):
    """each colour of a picture as the nearest tin of its own family (the nearest of all, if the top has none of it)"""
    out = np.zeros_like(pic, dtype=np.float64)
    every = np.concatenate([t for t in tins.values()])
    for f in (0, 1, 2, 3):
        m = fam == f
        if not m.any():
            continue
        pal = tins.get(f, every)
        d = ((pic[m][:, None, :].astype(np.float64) - pal[None]) ** 2).sum(axis=2)
        out[m] = pal[np.argmin(d, axis=1)]
    return out


top_col, side_col, rear_col = snap(top_col, top_fam), snap(side_col, side_fam), snap(rear_col, rear_fam)


def plain(pic, inside, fam):
    """a picture with its glass and glow taken out: each such cell the nearest of the rest (for the hull's own faces,
    where the model drew the canopy or a nozzle a little off the plan's)"""
    rest = inside & (fam < 2)
    if not rest.any():
        return pic
    at = nearest(rest)
    return pic[at[0], at[1]]


def lookup(pic, inside):
    at = nearest(inside)
    return pic[at[0], at[1]]


top_raw, side_raw, rear_raw = lookup(top_col, top_in), lookup(side_col, side_in), lookup(rear_col, rear_in)
top_plain = lookup(plain(top_col, top_in, top_fam), top_in)
side_plain = lookup(plain(side_col, side_in, side_fam), side_in)
rear_plain = lookup(plain(rear_col, rear_in, rear_fam), rear_in)


def as_views(top_at, side_at, rear_at):
    """the three pictures spread over the voxels' grid: what each view would paint each voxel"""
    T = np.broadcast_to(top_at[None], (H, L, W, 3))
    R = np.broadcast_to(rear_at.transpose(1, 0, 2)[:, None, :, :], (H, L, W, 3))
    Sd = np.broadcast_to(side_at.transpose(1, 0, 2)[:, :, None, :], (H, L, W, 3))
    return T, R, Sd


# which way each voxel's surface faces: the solid smoothed, down its slope (a wedge's gentle top faces up, a steep flank
# out to the side, however the voxels step)
smooth = ndimage.gaussian_filter(solid.astype(np.float64), sigma=1.0)
gz, gk, gi = np.gradient(smooth)
nz, nk, ni = -gz, -gk, -gi
# each face takes the view that looks most squarely at it, of those that can see it (a view sees the first voxel along
# each of its lines, or one a step behind it): from above, behind, the side, below (the belly), the front (the side's).
# (The view from above is the game's own and the top picture its look: a face takes it unless it is steeper than about
# 55 degrees; the back is weighted a little over the flanks, its nozzles being what a ship is known by from behind.)
# (a voxel a step or two under its column's top, on a slope that faces up, is part of the top surface: the steps of a
# gentle slope are painted from above, a tone darker, not with the flank's colours)
near_top = solid & (zg >= highest[None] - 2)
weights = [
    (np.maximum(nz, 0) * 1.45, up | near_top),
    (np.maximum(nk, 0) * 1.1, seen_behind),
    (np.abs(ni), seen_side),
    (np.maximum(-nz, 0) * 0.9, down),
    (np.maximum(-nk, 0) * 0.9, front),
]
score = np.stack([np.where(ok & solid, sc + 1e-3, 0) for sc, ok in weights])
best = np.argmax(score, axis=0)
anyone = score.max(axis=0) > 0
# a face no view sees squarely (a hidden step): the side's if it is upright, else the top's (inside: hollowed out later)
best[~anyone & (back | front | left | right)] = 2
best[~anyone & ~(back | front | left | right)] = 0


def paint(T, R, Sd, Tdark):
    out = np.zeros((H, L, W, 3), dtype=np.float64)
    for n, c in enumerate([T, R, Sd, T * 0.55, Sd]):
        m = best == n
        out[m] = c[m]
    m = (best == 0) & ~up
    out[m] = Tdark[m]
    return out


# the canopy and the nozzles take what the views drew there; the rest of the hull is painted from the pictures with their
# glass and glow taken out, so the canopy's teal and a nozzle's blue land only where the plan has them
raw = paint(*as_views(top_raw, side_raw, rear_raw), as_views(snap(top_raw * 0.78, families(top_raw)), side_raw, rear_raw)[0])
bare = paint(*as_views(top_plain, side_plain, rear_plain), as_views(snap(top_plain * 0.78, families(top_plain)), side_plain, rear_plain)[0])
col = np.where(((kind_at == GLASS_KIND) | (kind_at == ENGINE_KIND))[..., None], raw, bare)
# (and a nozzle's glow as the rear picture drew it on a back face, or the top picture at the tail, wherever the plan's
# nozzle is: it is the nozzle as drawn)
for z, k, i in zip(*np.nonzero(solid & ((best == 1) | ((best == 0) & (kg >= L * 0.7))))):
    if family(raw[z, k, i]) == 3:
        col[z, k, i] = raw[z, k, i]
# glass is glass: a canopy voxel a view drew as hull takes the top picture's glass over it, or the canopy's own colour
for z, k, i in zip(*np.nonzero(solid & (kind_at == GLASS_KIND))):
    if family(col[z, k, i]) != 2:
        above = top_raw[k, i]
        col[z, k, i] = above if family(above) == 2 else (tins[2][len(tins[2]) // 2] if 2 in tins else above)

# the glow: the voxels painted a glow
glow = np.zeros_like(solid)
for z, k, i in zip(*np.nonzero(solid)):
    glow[z, k, i] = family(col[z, k, i]) == 3

# the glow lit, in the engines' own colour: the pictures' nozzles are bright cores in darker rings (a few cells' middle
# colour dims them) in an electric blue; each takes the colour every ship's engines have glowed (the paint booth's glow is
# measured against it, and the flames burn in it), as light as it was drawn against the brightest
ENGINE_GLOW = np.array([120.0, 200.0, 255.0])
if glow.any():
    g = col[glow]
    light = g.mean(axis=1)
    f = 0.62 + 0.38 * (light - light.min()) / max(1.0, light.max() - light.min())
    lit = ENGINE_GLOW * f[:, None]
    # (the brightest a little whiter: a nozzle's hot core)
    col[glow] = np.where((f > 0.9)[:, None], lit + (255 - lit) * 0.35, lit)

# ── the palette: the tins used, 0 kept for "nothing here"
flat = np.round(col[solid]).astype(np.int64)
keys = flat[:, 0] * 65536 + flat[:, 1] * 256 + flat[:, 2]
uniq, at = np.unique(keys, return_inverse=True)
palette = np.zeros((len(uniq) + 1, 3), dtype=np.uint8)
palette[1:, 0] = uniq // 65536
palette[1:, 1] = (uniq // 256) % 256
palette[1:, 2] = uniq % 256
vox = np.zeros((H, L, W), dtype=np.uint8)
vox[solid] = at + 1

# ── a tidy pass (docs/pixel-art-techniques.md): a voxel on the surface whose colour none of its neighbours on the surface
# share is a speck; it takes the colour most of them have. Twice, so a speck of two goes too.
skin = solid & (up | down | back | front | left | right)
offsets = [(a, b, c) for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) if (a, b, c) != (0, 0, 0)]
for _ in range(2):
    padded = np.pad(np.where(skin, vox, 0), 1)
    near = np.stack([padded[1 + a : 1 + a + H, 1 + b : 1 + b + L, 1 + c : 1 + c + W] for a, b, c in offsets])
    same = (near == vox[None]).sum(axis=0)
    specks = skin & (same == 0) & ~glow
    for z, k, i in zip(*np.nonzero(specks)):
        around = near[:, z, k, i]
        around = around[around > 0]
        if len(around):
            vox[z, k, i] = np.bincount(around).argmax()

if args.debug:
    # the three views as carved, beside the pictures shrunk: what each view sees first
    def view(axis, last):
        seen = np.where(vox > 0, 1, 0)
        n = vox.shape[axis]
        idx = np.argmax(np.flip(seen, axis) if last else seen, axis=axis)
        if last:
            idx = n - 1 - idx
        v = np.take_along_axis(vox, np.expand_dims(idx, axis), axis).squeeze(axis)
        return np.where(seen.any(axis=axis), v, 0)

    sheets = [
        palette[view(0, True)],  # from above [k, i]
        palette[view(2, False)][::-1],  # from the left side [z, k], top up
        palette[view(1, True)][::-1],  # from behind [z, i], top up
        top_col * top_in[..., None],
        (side_col * side_in[..., None]).transpose(1, 0, 2)[::-1],
        (rear_col * rear_in[..., None]).transpose(1, 0, 2)[::-1],
    ]
    scale = 8
    width = sum(p.shape[1] for p in sheets[:3]) * scale + 40
    height = (max(p.shape[0] for p in sheets[:3]) * 2) * scale + 30
    canvas = Image.new("RGB", (width, height), (30, 30, 46))
    x = 10
    for n, pic in enumerate(sheets):
        img = Image.fromarray(np.asarray(pic, dtype=np.uint8)).resize((pic.shape[1] * scale, pic.shape[0] * scale), Image.NEAREST)
        if n == 3:
            x = 10
        y = 10 if n < 3 else 20 + max(p.shape[0] for p in sheets[:3]) * scale
        canvas.paste(img, (x, y))
        x += pic.shape[1] * scale + 10
    canvas.save(args.debug)

os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
np.savez_compressed(args.out, vox=vox, palette=palette, glow=glow)
print(f"{args.out}: {W} across, {L} long, {H} slices, {int(solid.sum())} voxels, {int(glow.sum())} glowing")
