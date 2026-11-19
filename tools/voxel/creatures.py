# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the image model's pictures of the worlds' creatures (tools/gen/creatures.py) into game pixels.

  uv run tools/voxel/creatures.py                 # writes src/lib/engine/creatures/art.ts and a sheet
  uv run tools/voxel/creatures.py --sheet out.png # the sheet somewhere else

Each sprite was drawn following a plan of letters, one a game pixel, scaled up into blocks: each block
of the picture is read back as one game pixel (as the races are: tools/voxel/races.py), so the plan
decides the outline. A kind's five sides share one small palette, so they agree; a dark outline goes
round each, so it reads on any ground.

The walk is four steps made here from each side: stand, one set of legs lifted, stand, the other set
lifted, the body a pixel up as they lift. A plan's legs are its `D` letters; from the side (and three-
quarters) they lift front and back in turn, from the front and behind left and right.

What they drop is cut from the image model’s sheet (art/creatures/source/loot.png). Each tile
is shrunk to a few pixels for the ground, with three colours for the resources. The menu icons
come from hud_icons.py.

Out comes src/lib/engine/creatures/art.ts: it is generated, and never edited by hand.
"""

import argparse
import json
import os

import numpy as np
from PIL import Image
from hud_icons import inventory_icons
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "creatures", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "creatures", "art.ts")
PICKS_FILE = os.path.join(ROOT, "art", "creatures", "picks.json")

# the plans themselves, from the tool that drew them
_gen = os.path.join(ROOT, "tools", "gen", "creatures.py")
plans = {"__file__": _gen, "__name__": "plans"}
exec(compile(open(_gen).read().split("\nap = argparse")[0], _gen, "exec"), plans)
SPRITES, cells_of = plans["SPRITES"], plans["cells_of"]

# the races' reading of a picture over a plan, and their outline and palette (the same rules, one place)
_races = os.path.join(ROOT, "tools", "voxel", "races.py")
races = {"__file__": _races, "__name__": "races"}
exec(compile(open(_races).read().split("\nap = argparse")[0], _races, "exec"), races)
read_grid, outlined, LETTERS = races["read_grid"], races["outlined"], races["LETTERS"]

KINDS = list(SPRITES)
LINE_RGB = (20, 19, 31)
IVORY = (255, 223, 166)
LOOT = ["hide", "chitin", "gland", "heartstone"]
# px a dropped thing is on the ground
LOOT_SIZE = {"hide": 6, "chitin": 5, "gland": 4, "heartstone": 5}

# Shade, base and light on the back, then the pale markings, legs, eyes, the kind's
# identifying feature and its underside. A few large clusters survive the game's tiny scale.
COATS = {
    "skitter": (
        [(107, 44, 50), (193, 77, 44), (243, 143, 65)],
        (255, 188, 105), (58, 31, 45), (246, 211, 145), (149, 71, 49), (89, 41, 47),
    ),
    "woolhorn": (
        [(116, 78, 83), (179, 132, 113), (226, 178, 141)],
        (238, 196, 157), (77, 50, 64), (74, 47, 58), (255, 226, 182), (105, 65, 60),
    ),
    "razorjaw": (
        [(46, 54, 89), (72, 94, 142), (115, 151, 178)],
        (154, 183, 204), (39, 43, 70), (255, 189, 73), (191, 228, 231), (39, 33, 65),
    ),
    "spitter": (
        [(60, 42, 78), (106, 69, 117), (154, 106, 151)],
        (174, 137, 170), (51, 33, 62), (249, 237, 139), (165, 235, 66), (64, 41, 71),
    ),
    "crawler": (
        [(85, 49, 51), (146, 83, 60), (207, 133, 79)],
        (231, 167, 107), (111, 48, 41), (255, 223, 158), (239, 189, 110), (70, 37, 46),
    ),
    "reefclaw": (
        [(118, 44, 62), (196, 67, 76), (241, 125, 109)],
        (255, 175, 142), (100, 46, 61), (250, 237, 173), (124, 215, 218), (83, 38, 56),
    ),
    "snapweed": (
        [(27, 71, 77), (42, 129, 115), (84, 185, 137)],
        (213, 95, 153), (23, 49, 62), (255, 226, 172), (252, 187, 190), (113, 38, 94),
    ),
    "thornback": (
        [(58, 37, 62), (110, 48, 70), (161, 64, 82)],
        (173, 117, 123), (43, 35, 58), (255, 75, 70), (241, 140, 72), (52, 34, 53),
    ),
}


def picks():
    return json.load(open(PICKS_FILE)) if os.path.exists(PICKS_FILE) else {}


def picture(kind, side):
    """a side's picture: the try picks.json chooses for it ('woolhorn-e': 2), or for its kind ('woolhorn': 2), else the first"""
    p = picks()
    seed = p.get(f"{kind}-{side}", p.get(kind, 1))
    path = os.path.join(SRC, f"{kind}-{side}" + (f"-{seed}" if seed != 1 else "") + ".png")
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int32)


def legs_of(rows):
    """where a plan's legs are: a grid of True at its `D` letters"""
    w = max(len(r) for r in rows)
    return [[x < len(r) and r[x] == "D" for x in range(w)] for r in rows]


def walk_steps(grid, legs, side):
    """four steps of a walk from one standing side (the grid is outlined: one larger every way than the plan)"""
    h, w = len(grid), len(grid[0])
    cols = sorted({x for y in range(len(legs)) for x in range(len(legs[y])) if legs[y][x]})
    if not cols:
        return [grid, grid, grid, grid]
    # which set each leg pixel is in: left and right half from the front and behind, alternate legs from the side
    if side in ("s", "n"):
        mid = (cols[0] + cols[-1]) / 2
        group = {x: 0 if x < mid else 1 for x in cols}
    else:
        runs = []
        for x in cols:
            if runs and x - runs[-1][-1] <= 1:
                runs[-1].append(x)
            else:
                runs.append([x])
        group = {x: i % 2 for i, run in enumerate(runs) for x in run}

    def step(lift):
        out = [list(row) for row in grid]
        # the lifted legs: each pixel a row up (where that is the air or another leg; into the body it is hidden by it)
        moved = [(y + 1, x + 1) for y in range(len(legs)) for x in range(len(legs[y])) if legs[y][x] and group[x] == lift]
        leg = {(y, x) for y, x in moved}
        for y, x in moved:
            out[y][x] = None
        for y, x in moved:
            above = grid[y - 1][x]
            if above is None or above == "LINE" or (y - 1, x) in leg:
                out[y - 1][x] = grid[y][x]
        # (the outline again round what moved)
        flat = [[None if c == "LINE" else c for c in row[1:-1]] for row in out[1:-1]]
        return outlined(flat)

    return [grid, step(0), grid, step(1)]


def encode(grid, index):
    return "".join("." if c is None else index[c] for row in grid for c in row)


def coat_light(grid, rows, x, y):
    """Keep the model's shading in clusters by sharing it with nearby coat pixels."""
    values = [sum(grid[y][x])] * 2
    for xx, yy in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]:
        if 0 <= yy < len(rows) and 0 <= xx < len(rows[yy]) and rows[yy][xx] == "B" and grid[yy][xx] is not None:
            values.append(sum(grid[yy][xx]))
    return sum(values) / len(values)


def build(kind):
    """a kind's sides (four steps each) with their shared palette"""
    views = SPRITES[kind]
    raw = {side: read_grid(picture(kind, side), rows, cells_of(rows)) for side, rows in views.items()}
    coat, *features = COATS[kind]
    colours = [*coat, *features]
    if kind == "thornback":
        colours.append(IVORY)
    colours.append(LINE_RGB)
    marks = dict(zip("LDEAM", features))
    # Measure all facings together. The model's darkest back should still be in the
    # same range as its brightest front, even when those were drawn separately.
    light = {
        (side, x, y): coat_light(raw[side], rows, x, y)
        for side, rows in views.items()
        for y, row in enumerate(rows)
        for x, mark in enumerate(row)
        if mark == "B" and raw[side][y][x] is not None
    }
    low, high = np.percentile(list(light.values()), [30, 77])
    index = {c: LETTERS[i] for i, c in enumerate(colours)}
    index["LINE"] = LETTERS[len(colours) - 1]
    sides = []
    for side, rows in views.items():
        keyed = []
        for y, row in enumerate(raw[side]):
            line = []
            for x, c in enumerate(row):
                if c is None:
                    line.append(None)
                elif rows[y][x] == "B":
                    level = light[side, x, y]
                    line.append(coat[0 if level < low else 2 if level > high else 1])
                elif kind == "thornback" and rows[y][x] == "A" and y >= 5:
                    # Its ivory tusks are separate from the row of orange spines.
                    line.append(IVORY)
                else:
                    line.append(marks[rows[y][x]])
            keyed.append(line)
        g = outlined(keyed)
        steps = walk_steps(g, legs_of(rows), side) if side != "open" else [g] * 4
        # (a step may be a row taller or shorter: all are kept the size of the standing one, cut or padded at the top)
        out = []
        for st in steps:
            st = [r for r in st]
            while len(st) < len(g):
                st.insert(0, [None] * len(g[0]))
            st = st[len(st) - len(g) :]
            out.append(encode(st, index))
        sides.append({"name": side, "w": len(g[0]), "h": len(g), "steps": out})
    return {"colours": [list(c) for c in colours], "sides": sides}


# ── what they drop: the model's sheet of it, cut into tiles (as prefabs.py cuts the loot icons)
def shrink(tile, mask, size):
    """a tile's thing shrunk so its longer side is `size` px: each pixel the commonest colour of the patch it covers"""
    ys, xs = np.nonzero(mask)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    crop = tile[y0:y1, x0:x1]
    m = mask[y0:y1, x0:x1]
    hh, ww = crop.shape[:2]
    scale = size / max(hh, ww)
    oh, ow = max(1, round(hh * scale)), max(1, round(ww * scale))
    out = np.zeros((oh, ow, 3), dtype=np.uint8)
    inside = np.zeros((oh, ow), dtype=bool)
    for y in range(oh):
        for x in range(ow):
            ya, yb = int(y * hh / oh), max(int(y * hh / oh) + 1, int((y + 1) * hh / oh))
            xa, xb = int(x * ww / ow), max(int(x * ww / ow) + 1, int((x + 1) * ww / ow))
            pm = m[ya:yb, xa:xb]
            if pm.mean() < 0.45:
                continue
            px = crop[ya:yb, xa:xb][pm]
            q = (px // 16) * 16
            keys, counts = np.unique(q, axis=0, return_counts=True)
            best = keys[counts.argmax()]
            near = px[np.abs(q - best).sum(axis=1) == 0]
            out[y, x] = np.median(near, axis=0)
            inside[y, x] = True
    return out, inside


def loot():
    p = picks()
    seed = p.get("loot", 1)
    sheet = np.asarray(Image.open(os.path.join(SRC, "loot" + (f"-{seed}" if seed != 1 else "") + ".png")).convert("RGB")).astype(np.int32)
    # the tiles: the dark squares the things sit in
    dark = sheet.max(axis=2) < 46
    labels, _ = ndimage.label(dark)
    tiles = []
    for sl in ndimage.find_objects(labels):
        if sl is None:
            continue
        hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
        if hh > 120 and ww > 120:
            tiles.append(sl)
    tiles.sort(key=lambda s: s[1].start)
    if len(tiles) < 4:
        # (no tiles found: the sheet cut in four across)
        W = sheet.shape[1]
        tiles = [(slice(0, sheet.shape[0]), slice(i * W // 4, (i + 1) * W // 4)) for i in range(4)]
    out = {}
    for name, sl in zip(LOOT, tiles[:4]):
        tile = sheet[sl]
        # (the thing: what is not the tile's dark ground, its border trimmed off)
        mask = tile.max(axis=2) > 60
        b = max(6, min(tile.shape[:2]) // 14)
        mask[:b, :] = False
        mask[-b:, :] = False
        mask[:, :b] = False
        mask[:, -b:] = False
        mask = ndimage.binary_opening(mask, iterations=2)
        labels2, n2 = ndimage.label(mask)
        sizes = ndimage.sum(mask, labels2, range(1, n2 + 1))
        mask = ndimage.binary_fill_holes(labels2 == (np.argmax(sizes) + 1))
        small, sin = shrink(tile, mask, LOOT_SIZE[name])
        px = [tuple(int(v) for v in small[y, x]) for y in range(small.shape[0]) for x in range(small.shape[1]) if sin[y, x]]
        # its three colours, light, middle and dark (the resource's, for the HUD's pack and the ground)
        lit = sorted(px, key=lambda c: 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2])
        third = max(1, len(lit) // 3)
        dark_c = np.median(lit[:third], axis=0)
        mid_c = np.median(lit[third : 2 * third] or lit, axis=0)
        light_c = np.median(lit[2 * third :] or lit, axis=0)
        palette = sorted(set(px))
        idx = {c: LETTERS[i] for i, c in enumerate(palette)}
        rows = "".join(idx[tuple(int(v) for v in small[y, x])] if sin[y, x] else "." for y in range(small.shape[0]) for x in range(small.shape[1]))
        out[name] = {
            "w": small.shape[1],
            "h": small.shape[0],
            "colours": [list(c) for c in palette],
            "rows": rows,
            "three": [[int(v) for v in c] for c in (light_c, mid_c, dark_c)],
        }
    # the credits: a chip shrunk from the original loot art, kept with the ground sprites
    icon = np.asarray(Image.open(os.path.join(SRC, "credits.png")).convert("RGBA")).astype(np.int32)
    small, sin = shrink(icon[..., :3], icon[..., 3] > 0, 4)
    palette = sorted({tuple(int(v) for v in small[y, x]) for y in range(small.shape[0]) for x in range(small.shape[1]) if sin[y, x]})
    idx = {c: LETTERS[i] for i, c in enumerate(palette)}
    rows = "".join(idx[tuple(int(v) for v in small[y, x])] if sin[y, x] else "." for y in range(small.shape[0]) for x in range(small.shape[1]))
    out["credits"] = {"w": small.shape[1], "h": small.shape[0], "colours": [list(c) for c in palette], "rows": rows, "three": []}
    return out


def sheet(data, items, path):
    """every kind's five sides, the walk of its side view, and what they drop, four times life size, on grass beside a pilot"""
    W, H = 300, 18 * len(KINDS) + 24
    im = Image.new("RGB", (W, H), (58, 92, 52))

    def put(rows, w, h, x0, y0, pal):
        for i, ch in enumerate(rows):
            if ch != ".":
                im.putpixel((x0 + i % w, y0 + i // w), pal[LETTERS.index(ch)])

    for r, kind in enumerate(KINDS):
        d = data[kind]
        pal = [tuple(c) for c in d["colours"]]
        y0 = 3 + r * 18
        x = 4
        for s in d["sides"]:
            put(s["steps"][0], s["w"], s["h"], x, y0, pal)
            x += s["w"] + 3
        x += 6
        s = d["sides"][min(2, len(d["sides"]) - 1)]
        for k in range(4):
            put(s["steps"][k], s["w"], s["h"], x, y0, pal)
            x += s["w"] + 2
    x = 4
    icons = inventory_icons()
    for name in LOOT:
        it = items[name]
        put(it["rows"], it["w"], it["h"], x, H - 12, [tuple(c) for c in it["colours"]])
        x += it["w"] + 4
        icon = icons[name]
        im.paste(icon, (x, H - 20), icon)
        x += 22
    im.resize((W * 4, H * 4), Image.NEAREST).save(path)


def write(data, items):
    lines = [
        "// The worlds' creatures' art: each kind from five sides (a snapweed closed and open) with four steps of",
        "// a walk, and what they drop as it lies on the ground. Drawn by the image model following plans of their",
        "// outlines (tools/gen/creatures.py) and shrunk to game pixels by tools/voxel/creatures.py: generated, do",
        "// not edit.",
        "//",
        "// A picture is a string of letters, one a pixel, row after row: each letter an index into its colours",
        "// (0-9, then a-z, then A-Z), '.' nothing. The last of a kind's colours is its outline.",
        "",
        "export interface CreatureSide {",
        "  w: number",
        "  h: number",
        "  steps: string[]",
        "}",
        "",
        "export interface CreatureArt {",
        "  colours: number[][]",
        "  /** facing the viewer, three-quarters towards him and right, right, three-quarters away and right, away (a snapweed: closed, open) */",
        "  sides: CreatureSide[]",
        "}",
        "",
        "export const CREATURE_ART: Record<string, CreatureArt> = {",
    ]
    for kind in KINDS:
        d = data[kind]
        lines.append(f"  {kind}: {{")
        lines.append(f"    colours: {json.dumps(d['colours'])},")
        lines.append("    sides: [")
        for s in d["sides"]:
            steps = ", ".join(f"'{t}'" for t in s["steps"])
            lines.append(f"      {{ w: {s['w']}, h: {s['h']}, steps: [{steps}] }},")
        lines.append("    ],")
        lines.append("  },")
    lines.append("}")
    lines.append("")
    lines.append("/** what a creature drops, as it lies on the ground */")
    lines.append("export const LOOT_ART: Record<string, { w: number; h: number; colours: number[][]; rows: string }> = {")
    for name in LOOT + ["credits"]:
        it = items[name]
        lines.append(f"  {name}: {{ w: {it['w']}, h: {it['h']}, colours: {json.dumps(it['colours'])}, rows: '{it['rows']}' }},")
    lines.append("}")
    lines.append("")
    lines.append("/** each one's colours, light, middle and dark (r, g, b): the resource's (data/resources.ts) */")
    lines.append("export const LOOT_COLOURS: Record<string, number[][]> = {")
    for name in LOOT:
        lines.append(f"  {name}: {json.dumps(items[name]['three'])},")
    lines.append("}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        fh.write("\n".join(lines) + "\n")


ap = argparse.ArgumentParser()
ap.add_argument("--sheet", default=os.path.join(ROOT, "art", "creatures", "sheet.png"))
args = ap.parse_args()

data = {kind: build(kind) for kind in KINDS}
items = loot()
write(data, items)
sheet(data, items, args.sheet)
print(f"wrote {os.path.relpath(OUT, ROOT)}; sheet: {os.path.relpath(args.sheet, ROOT)}")
