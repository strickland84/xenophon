# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Writes voxel ships into the game: one file each in src/lib/engine/jet/models, and an index.

  uv run tools/voxel/to_model.py art/hulls/voxels/*.npz

The game wants more than voxels. It recolours a ship from the player's settings, so every
colour has to belong to a paint family (hull, markings, glass, engine glow), each a ramp
from dark to light; and it needs to know where the engines and wingtips are, for the flames
and the trails. Both are worked out here from the ship itself.

The engines are the patches of glow at the back of the ship, one a nozzle. A ship carved from
three pictures (tools/voxel/carve.py) says which voxels glow, and its engines are the patches of
glow on its back faces, seen from behind, each where its nozzle is and as large. A ship built from
the top picture alone draws them in the same blue-green as the glass, so they are told apart by
where they are. Either way they are given a family of their own: they keep their colour whatever
the ship is painted, and the flames burn in it.
"""

import base64
import colorsys
import os
import sys

import numpy as np
from scipy import ndimage

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import stackview

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "src", "lib", "engine", "jet", "models")
# `--big`: the larger builds the hangar shows (the polish pass, item 1: a ship the size of its own rooms beside a pilot inside)
BIG = "--big" in sys.argv
if BIG:
    sys.argv.remove("--big")
    OUT = os.path.join(OUT, "big")
BODY, ACCENT, GLASS, GLOW = 0, 1, 2, 3
# ── which paint family is each colour?
def family(rgb):
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    hue = h * 360
    if s > 0.45 and 8 <= hue <= 55:
        return ACCENT
    if s > 0.5 and v > 0.6 and 195 <= hue <= 255:
        return GLOW
    if s > 0.35 and 150 <= hue < 200:
        return GLASS
    return BODY


def glowing(rgb):
    """How a colour glows: 2 a strong blue-green, 1 a pale blue-white (white-hot), 0 not at all."""
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    hue = h * 360
    if 160 <= hue <= 260 and s > 0.3 and v > 0.55:
        return 2
    if 170 <= hue <= 260 and s <= 0.3 and v > 0.75:
        return 1
    return 0


def engines_behind(vox, glow):
    """A carved ship's engines: each patch of glow on its back faces, as seen from behind (across, height)."""
    solid = vox > 0
    lit = glow & solid
    open_behind = ~np.concatenate([solid[:, 1:, :], np.zeros_like(solid[:, :1, :])], axis=1)
    nozzles = lit & open_behind
    labels, n = ndimage.label(nozzles.any(axis=1), structure=np.ones((3, 3)))
    patches = []
    for c in range(1, n + 1):
        zs, ks, is_ = np.nonzero(nozzles & (labels == c)[:, None, :])
        if len(zs):
            patches.append((zs, ks, is_))
    # (a flame for each of the largest eight: no ship has more, ENGINES_MAX in jet/jet.ts)
    patches = sorted(patches, key=lambda p: -len(p[0]))[:8]
    return sorted(patches, key=lambda p: p[2].mean()), lit


def find_engines(vox, palette):
    """The engines: patches of glow at the back of the ship, seen from above. Nozzles that burn
    a strong colour are looked for first; a ship with none has pale, white-hot ones instead.
    Returns a list of patches, each the (along, across) cells it covers, and which voxels glow."""
    slices, length, width = vox.shape
    seen = (vox > 0).any(axis=0)
    # where each column of the ship ends, at the back
    tail = np.array([np.nonzero(seen[:, i])[0].max() if seen[:, i].any() else -1 for i in range(width)])
    kinds = np.array([glowing(c) for c in palette])
    kinds[0] = 0
    for level in (2, 1):
        lit = (kinds[vox] == level) & (vox > 0)
        labels, n = ndimage.label(lit.any(axis=0), structure=np.ones((3, 3)))
        patches = [np.argwhere(labels == c) for c in range(1, n + 1)]
        # a nozzle can be a ring of glow round something darker: patches close together, one behind the other, are one
        joined = True
        while joined:
            joined = False
            for a in range(len(patches)):
                for b in range(a + 1, len(patches)):
                    pa, pb = patches[a], patches[b]
                    across = pa[:, 1].min() <= pb[:, 1].max() + 1 and pb[:, 1].min() <= pa[:, 1].max() + 1
                    gap = max(pa[:, 0].min() - pb[:, 0].max(), pb[:, 0].min() - pa[:, 0].max())
                    if across and gap <= 3:
                        patches[a] = np.vstack([pa, pb])
                        del patches[b]
                        joined = True
                        break
                if joined:
                    break
        # an engine is in the back of the ship, and nothing but a nozzle's lip is behind it
        found = [c for c in patches if c[:, 0].max() >= length * 0.6 and c[:, 0].max() >= tail[c[:, 1]].min() - 3]
        if found:
            return sorted(found, key=lambda c: c[:, 1].mean()), lit
    return [], None


os.makedirs(OUT, exist_ok=True)
for source in sys.argv[1:]:
    vox, palette = stackview.load(source)
    stored = np.load(source)
    carved = "glow" in stored.files
    glow_mask = stored["glow"] if carved else None
    slices, length, width = vox.shape

    # ── hollow it out: a voxel boxed in on all six sides can never be seen
    solid = np.pad(vox > 0, 1)
    hidden = solid[2:, 1:-1, 1:-1] & solid[:-2, 1:-1, 1:-1] & solid[1:-1, 2:, 1:-1] & solid[1:-1, :-2, 1:-1] & solid[1:-1, 1:-1, 2:] & solid[1:-1, 1:-1, :-2]
    vox = np.where(hidden, 0, vox)


    # ── the engines, and their voxels moved into colours of their own (in the glow family)
    half = (width - 1) / 2
    engines = []
    glow_of = {}
    if carved:
        nozzles, lit = engines_behind(vox, glow_mask)
        for zs, ks, is_ in nozzles:
            # (as round as the nozzle's glow is large: its flame no wider or taller than the nozzle drawn)
            radius = max(1.2, float(np.sqrt(len(set(zip(zs.tolist(), is_.tolist()))) / np.pi)))
            engines.append(((is_.min() + is_.max()) / 2 - half, zs.mean() + 0.5, ks.max() + 0.6, radius))
        for n in np.unique(vox[lit]):
            if n not in glow_of:
                glow_of[n] = len(palette)
                palette = np.vstack([palette, palette[n][None]])
            vox[lit & (vox == n)] = glow_of[n]
        patches = []
    else:
        patches, lit = find_engines(vox, palette)
    for cells in patches:
        mask = np.zeros((length, width), dtype=bool)
        mask[cells[:, 0], cells[:, 1]] = True
        mine = lit & mask[None]
        ys = np.nonzero(mine)[0]
        across = cells[:, 1]
        # (a nozzle one or two px across still has a flame that can be seen)
        radius = max(1.2, (across.max() - across.min() + 1) / 2)
        engines.append(((across.min() + across.max()) / 2 - half, ys.mean(), cells[:, 0].max() + 0.6, radius))
        for n in np.unique(vox[mine]):
            if n not in glow_of:
                glow_of[n] = len(palette)
                palette = np.vstack([palette, palette[n][None]])
            vox[mine & (vox == n)] = glow_of[n]
    glows = set(glow_of.values())
    # the flames burn in the brightest of them
    glow = max((palette[n] for n in glows), key=lambda c: int(c.astype(int).sum()), default=np.array([120, 200, 255]))

    used = [n for n in range(1, len(palette)) if (vox == n).any()]
    count = {n: int((vox == n).sum()) for n in used}
    remap = np.zeros(len(palette), dtype=np.uint8)
    rows = []
    # the tone of each family there is most of: the game treats it as "the" colour when a player repaints
    key_tones = [0, 0, 0]
    for fam in (BODY, ACCENT, GLASS, GLOW):
        mine = sorted((n for n in used if (GLOW if n in glows else family(palette[n])) == fam), key=lambda n: int(palette[n].astype(int).sum()))
        # a family has room for fifteen tones: the rarest colours give way to the tone next to them
        stand_in = {}
        while len(mine) > 15:
            rare = min(mine, key=lambda n: count[n])
            at = mine.index(rare)
            stand_in[rare] = mine[at - 1] if at else mine[1]
            mine.remove(rare)
        for tone, n in enumerate(mine, start=1):
            remap[n] = fam * 16 + tone
            rows.append((fam * 16 + tone, *map(int, palette[n]), fam))
        for rare, n in stand_in.items():
            while n in stand_in:
                n = stand_in[n]
            remap[rare] = remap[n]
        if mine and fam < 3:
            key_tones[fam] = mine.index(max(mine, key=lambda n: count[n])) + 1
    vox = remap[vox]

    # ── where things are: the widest point is the wingtip
    ks, xs = np.nonzero((vox > 0).any(axis=0))
    tip_k = int(ks[np.argmax(np.abs(xs - half))])
    tip_x = int(xs[np.argmax(np.abs(xs - half))])
    tip_a = float(np.abs(xs - half).max())
    # (the slices at the wingtip itself: the top of the whole row was the canopy's, and the trails hung over the wings;
    # the game works its own from the voxels now, jet/mesh.ts tips)
    tip_y = int(round(np.nonzero(vox[:, tip_k, tip_x])[0].mean()))
    if not engines:
        # (no glow at the back: two nozzles at the very end, a guess)
        engines = [(side * width / 8, slices / 3, ks.max() + 0.6, 1.5) for side in (-1, 1)]
    pivot_k = float(ks.mean())
    pivot_y = slices // 3

    # ── run-length encode: (count, colour) pairs, slice by slice, nose first
    flat = vox.reshape(-1)
    pairs = bytearray()
    start = 0
    for n in range(1, len(flat) + 1):
        if n == len(flat) or flat[n] != flat[start] or n - start == 255:
            pairs += bytes([n - start, int(flat[start])])
            start = n
    data = base64.b64encode(bytes(pairs)).decode()
    lines = [data[n : n + 120] for n in range(0, len(data), 120)]

    name = os.path.splitext(os.path.basename(source))[0]
    with open(os.path.join(OUT, name + ".ts"), "w") as f:
        made = "carved from pictures of the ship from above, from the side and from behind" if carved else "built from a picture of the ship seen\n// from above"
        f.write(f"""// The {name}: {slices} horizontal slices of {width}×{length} px, {made}. Generated by tools/voxel/to_model.py: do not edit.

import type {{ HullData }} from '{"../../model" if BIG else "../model"}'

export const {name}: HullData = {{
  name: '{name}',
  w: {width},
  l: {length},
  h: {slices},
  pivotK: {pivot_k:.2f},
  pivotY: {pivot_y},
  engines: [
{''.join(f"    {{ a: {a:.1f}, y: {y:.2f}, k: {k:.1f}, r: {r:.1f} }},\n" for a, y, k, r in engines)}  ],
  glow: [{', '.join(str(int(c)) for c in glow)}],
  wingtipA: {tip_a:.1f},
  wingtipK: {tip_k},
  wingtipY: {tip_y},
  keyTones: [{', '.join(str(k - 1) for k in key_tones)}],
  palette: [
""")
        for row in rows:
            f.write(f"    [{', '.join(str(v) for v in row)}],\n")
        f.write("  ],\n  data: [\n")
        for line in lines:
            f.write(f"    '{line}',\n")
        f.write("  ].join(''),\n}\n")
    print(f"{name}: {width}×{length}×{slices}, {int((vox > 0).sum())} voxels, {len(engines)} engines glowing {tuple(int(c) for c in glow)}")

names = sorted(os.path.splitext(f)[0] for f in os.listdir(OUT) if f.endswith(".ts") and f != "index.ts")
with open(os.path.join(OUT, "index.ts"), "w") as f:
    if BIG:
        f.write("// Every ship as the hangar shows it, larger (the same pictures, more of their detail). Generated by tools/voxel/to_model.py --big: do not edit.\n\nimport type { HullData } from '../../model'\n")
    else:
        f.write("// Every ship there is. Generated by tools/voxel/to_model.py: do not edit.\n\nimport type { HullData } from '../model'\n")
    for n in names:
        f.write(f"import {{ {n} }} from './{n}'\n")
    f.write(f"\nexport const {'BIG_HULLS' if BIG else 'HULLS'}: Record<string, HullData> = {{ {', '.join(names)} }}\n")
print(f"{len(names)} ships in {os.path.relpath(OUT, ROOT)}")
