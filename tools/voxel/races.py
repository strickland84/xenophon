# /// script
# dependencies = ["numpy", "pillow"]
# ///
"""Turns the image model's pictures of the six races (tools/gen/races.py) into game pixels.

  uv run tools/voxel/races.py                 # writes src/lib/engine/races/art.ts, and a sheet to look at
  uv run tools/voxel/races.py --sheet out.png # the sheet somewhere else

Each sprite and fall was drawn following a plan of letters, one a game pixel, scaled up into
blocks: so each block of the picture is read back as one game pixel, and the plan decides the
outline. Each portrait was drawn over a plan on a 32 by 32 grid in the same way, but keeps
whatever the model drew round it (hair, a crest), cut from the black background.

Then every colour is sorted into the part it belongs to:

  suit   the lime green the suit was asked for: repainted in the pilot's suit colour
  trim   the hot pink of its trim: repainted in the pilot's trim colour
  body   the race's own skin, feathers, brass, shell, fuzz or cap: shifted by the skin chosen
  glow   eyes, a lens, lanterns, glowing spots: recoloured by the eyes chosen
  own    everything else (a helmet, a visor, a beak), kept as drawn
  line   the dark outline round a sprite, added here so it reads on any ground

A race's sprites and fall share one small palette (the colours of all of them, merged), so
its five sides agree; its portraits share another. The walk is four steps made from each side
here: the legs are the bottom rows, and the body bobs a pixel as one foot is lifted.

Out comes src/lib/engine/races/art.ts: it is generated, and never edited by hand.
"""

import argparse
import colorsys
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "races", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "races", "art.ts")

# the plans themselves, from the tool that drew them
_gen = os.path.join(ROOT, "tools", "gen", "races.py")
plans = {"__file__": _gen}
exec(compile(open(_gen).read().split("\nap = argparse")[0], _gen, "exec"), plans)
SPRITES, FALLS, FACES, face_plan = plans["SPRITES"], plans["FALLS"], plans["FACES"], plans["face_plan"]
SMALL, SMALL_FALLS = plans["SMALL"], plans["SMALL_FALLS"]

RACES = ["solari", "kestrin", "orrin", "skarn", "noctil", "thallin"]
# which try of a race's pictures is used, where the first was not the best (tools/gen/races.py --seed)
PICKS = {"noctil": {"sprite": 2}, "skarn": {"fall": 2, "face": 2, "face-0": 3, "face-3": 3}}
SIDES = ["s", "se", "e", "ne", "n"]
OWN, SUIT, TRIM, LINE, BODY, GLOW = 0, 1, 2, 3, 4, 5
LINE_RGB = (19, 20, 34)

# which hues are each race's body (recoloured by the skin chosen), and its glow (by the eyes chosen):
# (lowest hue, highest hue, least saturation, least brightness), hue in degrees
BODY_HUES = {
    "solari": [(5, 40, 0.18, 0.3)],
    "kestrin": [(180, 250, 0.2, 0.25)],
    "orrin": [(20, 60, 0.3, 0.2)],
    "skarn": [(10, 70, 0.15, 0.12)],
    "noctil": [(15, 60, 0.12, 0.2)],
    "thallin": [(330, 360, 0.3, 0.2), (0, 40, 0.3, 0.2)],
}
GLOW_HUES = {
    "solari": [],
    "kestrin": [(40, 70, 0.55, 0.6), (0, 30, 0.55, 0.55)],
    "orrin": [(150, 210, 0.4, 0.6)],
    "skarn": [],
    "noctil": [(170, 300, 0.4, 0.5)],
    "thallin": [(45, 75, 0.5, 0.7)],
}


def hsv(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    return h * 360, s, v


def within(c, windows):
    h, s, v = hsv(c)
    return any(lo <= h <= hi and s >= smin and v >= vmin for lo, hi, smin, vmin in windows)


def part_of(race, c):
    """which part a colour belongs to (see the top of the file)"""
    h, s, v = hsv(c)
    if 55 <= h <= 150 and s > 0.4 and v > 0.3:
        return SUIT
    if (h >= 290 or h <= 8) and s > 0.45 and v > 0.35 and not (race == "thallin" and h <= 8):
        return TRIM
    if within(c, GLOW_HUES[race]):
        return GLOW
    if within(c, BODY_HUES[race]):
        return BODY
    return OWN


def picture(name):
    """a picture by its name ('sprite-noctil-s'), the try PICKS chooses for it ('face-0'), or for its race and kind ('face')"""
    kind, race = name.split("-")[:2]
    rest = "-".join(name.split("-")[2:])
    seed = PICKS.get(race, {}).get(f"{kind}-{rest}", PICKS.get(race, {}).get(kind, 1))
    path = os.path.join(SRC, name + (f"-{seed}" if seed != 1 else "") + ".png")
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int32)


def read_grid(rgb, rows, cells, size=1024):
    """the colour of each block of a picture drawn over a plan of letters (None where the plan is empty)

    Black is the background, but inside the plan a block the model painted mostly black is a dark
    part (a visor, a pupil): it is kept dark if the plan has something on every side of it, and
    otherwise takes a neighbour's colour (the model drew that edge a little inside the plan's).
    """
    h = len(rows)
    w = max(len(r) for r in rows)
    ox = (size - w * cells) // 2
    oy = (size - h * cells) // 2
    planned = [[x < len(rows[y]) and rows[y][x] != "." for x in range(w)] for y in range(h)]
    out = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if not planned[y][x]:
                continue
            m = max(1, cells // 8)
            patch = rgb[oy + y * cells + m : oy + (y + 1) * cells - m, ox + x * cells + m : ox + (x + 1) * cells - m].reshape(-1, 3)
            dark = patch.max(axis=1) < 40
            if dark.mean() > 0.6:
                inner = all(0 <= y + dy < h and 0 <= x + dx < w and planned[y + dy][x + dx] for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)))
                if inner:
                    c = np.median(patch[dark], axis=0)
                    out[y][x] = (int(max(c[0], 24)), int(max(c[1], 26)), int(max(c[2], 44)))
                continue
            lit = patch[~dark]
            # the commonest colour in it (near enough), not a mean that would blur two together
            q = (lit // 12) * 12
            keys, counts = np.unique(q, axis=0, return_counts=True)
            best = keys[counts.argmax()]
            near = lit[np.abs(q - best).sum(axis=1) == 0]
            out[y][x] = tuple(int(v) for v in np.median(near, axis=0))
    # blocks left unread take a neighbour's colour (the plan says something is there)
    for _ in range(4):
        for y in range(h):
            for x in range(w):
                if planned[y][x] and out[y][x] is None:
                    for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0), (-1, -1), (1, 1), (-1, 1), (1, -1)):
                        yy, xx = y + dy, x + dx
                        if 0 <= yy < h and 0 <= xx < w and out[yy][xx] is not None:
                            out[y][x] = out[yy][xx]
                            break
    return out


def outlined(grid):
    """the grid with a ring of outline round everything in it (one pixel larger on every side)"""
    h, w = len(grid), len(grid[0])
    out = [[None] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        for x in range(w):
            out[y + 1][x + 1] = grid[y][x]
    for y in range(h + 2):
        for x in range(w + 2):
            if out[y][x] is not None and out[y][x] != "LINE":
                continue
            for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h + 2 and 0 <= xx < w + 2 and out[yy][xx] not in (None, "LINE"):
                    out[y][x] = "LINE"
                    break
    return out


def merge_palette(colours, most, near=30):
    """the colours the given ones fall into: the two closest (by count) merged, again and again, until no two are
    nearer than `near` and there are at most `most`; a dark one is never merged into a light one"""
    groups = {}
    for c in colours:
        # (near-identical colours are one to begin with: the merging below is slow with many)
        groups.setdefault(tuple(v // 6 for v in c), []).append(c)
    clusters = [(np.mean(v, axis=0), len(v), sorted(set(v))) for v in groups.values()]
    if len(clusters) > 40:
        # many: the rarest are folded into the colour nearest them first
        clusters.sort(key=lambda c: -c[1])
        keep, rest = clusters[:40], clusters[40:]
        for centre, n, keys in rest:
            j = min(range(len(keep)), key=lambda i: float(np.abs(keep[i][0] - centre).sum()))
            kc, kn, kk = keep[j]
            keep[j] = ((kc * kn + centre * n) / (kn + n), kn + n, kk + keys)
        clusters = keep
    while len(clusters) > 1:
        best = None
        for i in range(len(clusters)):
            for j in range(i + 1, len(clusters)):
                a, b = clusters[i][0], clusters[j][0]
                d = float(np.abs(a - b).sum())
                # (keep darks and lights apart: a visor is not a grey)
                if abs(a.mean() - b.mean()) > 60:
                    d += 400
                if best is None or d < best[0]:
                    best = (d, i, j)
        d, i, j = best
        if d > near and len(clusters) <= most:
            break
        (ca, na, ka), (cb, nb, kb) = clusters[i], clusters[j]
        merged = ((ca * na + cb * nb) / (na + nb), na + nb, ka + kb)
        clusters = [c for k, c in enumerate(clusters) if k not in (i, j)] + [merged]
    mapping = {}
    for centre, _, keys in clusters:
        rgb = tuple(int(round(v)) for v in centre)
        for k in keys:
            mapping[k] = rgb
    return sorted(set(mapping.values())), mapping


def walk_steps(grid, side):
    """four steps of a walk made from one standing side: stand, one foot up, stand, the other up (the body a pixel higher)"""
    h, w = len(grid), len(grid[0])
    filled = [y for y in range(h) if any(c is not None for c in grid[y])]
    bottom = filled[-1]
    legs = 2 if h <= 10 else 3
    top_leg = bottom - legs + 1
    mid = w / 2

    def blank():
        return [[None] * w for _ in range(h)]

    def step(lift_left):
        out = blank()
        # everything above the legs, a pixel higher
        for y in range(1, top_leg):
            out[y - 1] = list(grid[y])
        for y in range(top_leg, bottom + 1):
            for x in range(w):
                c = grid[y][x]
                if c is None:
                    continue
                left = x + 0.5 < mid
                if side in ("e",):
                    # from the side: the legs come together under the body as it rises
                    nx = x + (1 if left else -1) if y >= bottom - 1 else x
                    if 0 <= nx < w and out[y - 1][nx] is None:
                        out[y - 1][nx] = c
                    if y == bottom:
                        out[y][nx if 0 <= nx < w else x] = c
                    continue
                if left == lift_left:
                    # the lifted leg: a pixel up with the body, its foot off the ground
                    out[y - 1][x] = c
                else:
                    # the planted leg: stays on the ground, and stretches to the body
                    out[y - 1][x] = out[y - 1][x] or c
                    out[y][x] = c
        return out

    return [grid, step(True), grid, step(False)]


def encode(grid, index):
    return "".join("." if c is None else index[c] for row in grid for c in row)


LETTERS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"

# The model can miss a whole trim panel or paint over a visor when a head is only three pixels
# wide. Keep these materials anchored to their marks in the plan, using its paint for shading.
SUIT_TONES = [(42, 77, 42), (102, 152, 51), (188, 216, 116)]
TRIM_TONES = [(123, 39, 86), (245, 116, 169)]
BOOT_TONES = [(35, 39, 59), (58, 66, 88)]
VISOR_TONES = [(29, 55, 77), (83, 161, 177)]
LENS_TONES = {
    "kestrin": ((226, 160, 61), (255, 240, 154)),
    "orrin": ((49, 186, 183), (177, 255, 242)),
    "skarn": ((104, 58, 38), (250, 193, 112)),
    "thallin": ((214, 152, 63), (255, 235, 143)),
}
CAP_TONES = [(88, 29, 46), (157, 44, 58), (222, 79, 74)]


def sprite_parts(race, grid, rows):
    """Read the suit seams and the face from the plan before merging the sprite's colours."""
    out = []
    for y, marks in enumerate(rows):
        row = []
        for x, c in enumerate(grid[y]):
            if c is None:
                row.append(None)
                continue
            mark = marks[x]
            value = max(c)
            if mark == "S":
                c, part = SUIT_TONES[0 if value < 116 else 2 if value > 219 else 1], SUIT
            elif mark == "T":
                c, part = TRIM_TONES[value >= 147], TRIM
            elif mark == "D":
                c, part = BOOT_TONES[value >= 103], OWN
            elif mark == "V" and race == "solari":
                # A glint at the visor's leading edge, even when it only has one pixel.
                c, part = VISOR_TONES[x == marks.index("V")], GLOW
            elif mark == "V" and race in LENS_TONES:
                c, part = LENS_TONES[race][value >= 155], GLOW
            elif mark == "H" and race == "thallin":
                c, part = CAP_TONES[0 if value < 100 else 2 if value > 184 else 1], BODY
            else:
                part = part_of(race, c)
            row.append((c, part))
        out.append(row)
    return out


def build_race(race):
    """a race's sprites (five sides, four steps each) and its fall, at both sizes (inside, and out on a world), with their shared palette"""
    raw = {}
    for side in SIDES:
        rows = SPRITES[race][side]
        cells = 860 // max(len(rows), max(len(r) for r in rows) + 2)
        raw[side] = sprite_parts(race, read_grid(picture(f"sprite-{race}-{side}"), rows, cells), rows)
    rows = FALLS[race]
    cells = 900 // max(len(rows), max(len(r) for r in rows))
    raw["fall"] = sprite_parts(race, read_grid(picture(f"fall-{race}"), rows, cells), rows)
    for side in SIDES:
        rows = SMALL[race][side]
        cells = 860 // max(len(rows), max(len(r) for r in rows) + 2)
        raw["small-" + side] = sprite_parts(race, read_grid(picture(f"small-{race}-{side}"), rows, cells), rows)
    rows = SMALL_FALLS[race]
    cells = 900 // max(len(rows) + 1, max(len(r) for r in rows) + 1)
    raw["small-fall"] = sprite_parts(race, read_grid(picture(f"smallfall-{race}"), rows, cells), rows)
    # one palette for them all: each part's colours merged on their own
    every = [c for g in raw.values() for row in g for c in row if c is not None]
    by_part = {}
    for c, part in every:
        by_part.setdefault(part, []).append(c)
    mapping = {}
    for part, cs in by_part.items():
        most = {SUIT: 3, TRIM: 2, GLOW: 3}.get(part, 5 if part == BODY else 9)
        _, m = merge_palette(cs, most)
        mapping.update({(c, part): (m[c], part) for c in cs})
    colours = sorted(set(mapping.values()), key=lambda e: (e[1], sum(e[0])))
    colours.append((LINE_RGB, LINE))
    index = {}
    for i, (rgb, part) in enumerate(colours):
        index[(rgb, part)] = LETTERS[i]
    index["LINE"] = LETTERS[len(colours) - 1]

    def keyed(grid):
        return [[None if c is None else mapping[c] for c in row] for row in grid]

    def sides_of(prefix):
        out = []
        for side in SIDES:
            g = outlined(keyed(raw[prefix + side]))
            steps = walk_steps(g, side)
            out.append({"w": len(g[0]), "h": len(g), "steps": [encode(st, index) for st in steps]})
        return out

    fall = outlined(keyed(raw["fall"]))
    small_fall = outlined(keyed(raw["small-fall"]))
    return {
        "colours": [[*rgb, part] for rgb, part in colours],
        "sides": sides_of(""),
        "fall": {"w": len(fall[0]), "h": len(fall), "rows": encode(fall, index)},
        "small": {
            "sides": sides_of("small-"),
            "fall": {"w": len(small_fall[0]), "h": len(small_fall), "rows": encode(small_fall, index)},
        },
    }


def face_grid(rgb, size):
    """a portrait picture read back as `size` by `size` game pixels (its plan's 32 by 32 grid was drawn 30 px a cell, from (32, 32))"""
    cell = 960 // size
    m = max(2, cell // 4)
    g = [[None] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            patch = rgb[32 + y * cell + m : 32 + (y + 1) * cell - m, 32 + x * cell + m : 32 + (x + 1) * cell - m].reshape(-1, 3)
            lit = patch[patch.max(axis=1) > 30]
            if len(lit) < len(patch) * 0.5:
                continue
            q = (lit // 12) * 12
            keys, counts = np.unique(q, axis=0, return_counts=True)
            best = keys[counts.argmax()]
            near = lit[np.abs(q - best).sum(axis=1) == 0]
            g[y][x] = tuple(int(v) for v in np.median(near, axis=0))
    # specks: a lone pixel with nothing round it goes
    for y in range(size):
        for x in range(size):
            if g[y][x] is None:
                continue
            n4 = sum(1 for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)) if 0 <= y + dy < size and 0 <= x + dx < size and g[y + dy][x + dx] is not None)
            if n4 == 0:
                g[y][x] = None
    return g


def build_faces(race):
    """a race's four portraits, 32 by 32 and 16 by 16, with their shared palette (transparent where the picture is black)"""
    grids = []
    smalls = []
    for n in range(4):
        path = os.path.join(SRC, f"face-{race}-{n}.png")
        if not os.path.exists(path):
            continue
        rgb = picture(f"face-{race}-{n}")
        grids.append(face_grid(rgb, 32))
        smalls.append(face_grid(rgb, 16))
    every = [c for g in grids + smalls for row in g for c in row if c is not None]
    by_part = {}
    for c in every:
        by_part.setdefault(part_of(race, c), []).append(c)
    mapping = {}
    for part, cs in by_part.items():
        most = {SUIT: 4, TRIM: 3, GLOW: 4, BODY: 8}.get(part, 14)
        _, m = merge_palette(cs, most)
        mapping.update({c: (m[c], part) for c in cs})
    colours = sorted(set(mapping.values()), key=lambda e: (e[1], sum(e[0])))
    index = {e: LETTERS[i] for i, e in enumerate(colours)}
    faces = ["".join("." if c is None else index[mapping[c]] for row in g for c in row) for g in grids]
    small = ["".join("." if c is None else index[mapping[c]] for row in g for c in row) for g in smalls]
    return {"colours": [[*rgb, part] for rgb, part in colours], "faces": faces, "small": small}


def sheet(data, path):
    """every race's sprites (its five sides, the walk of one), its fall and its portraits, four times life size, on grass"""
    scale = 4
    W, H = 480, 6 * 46
    im = Image.new("RGB", (W, H), (58, 92, 52))
    for r, race in enumerate(RACES):
        d = data[race]
        pal = [tuple(c[:3]) for c in d["colours"]]
        y0 = 4 + r * 46
        x = 4

        def put(rows, w, h, x0, y0, pal=pal):
            for i, ch in enumerate(rows):
                if ch != ".":
                    im.putpixel((x0 + i % w, y0 + i // w), pal[LETTERS.index(ch)])

        for s in d["sides"]:
            put(s["steps"][0], s["w"], s["h"], x, y0)
            x += s["w"] + 2
        x += 4
        s = d["sides"][0]
        for k in range(4):
            put(s["steps"][k], s["w"], s["h"], x, y0)
            x += s["w"] + 2
        x += 4
        put(d["fall"]["rows"], d["fall"]["w"], d["fall"]["h"], x, y0)
        x += d["fall"]["w"] + 6
        # (out on a world: the small sprites, a walk, the fall)
        for s in d["small"]["sides"]:
            put(s["steps"][0], s["w"], s["h"], x, y0 + 20)
            x += s["w"] + 1
        x -= sum(s["w"] + 1 for s in d["small"]["sides"])
        s = d["small"]["sides"][0]
        for k in range(4):
            put(s["steps"][k], s["w"], s["h"], x + k * (s["w"] + 1), y0 + 32)
        sf = d["small"]["fall"]
        put(sf["rows"], sf["w"], sf["h"], x + 4 * (s["w"] + 1) + 2, y0 + 32)
        x += sum(s2["w"] + 1 for s2 in d["small"]["sides"]) + 4
        fpal = [tuple(c[:3]) for c in d["faces"]["colours"]]
        for f in d["faces"]["faces"]:
            for y in range(32):
                for xx in range(32):
                    im.putpixel((x + xx, y0 + y), (16, 20, 40))
            put(f, 32, 32, x, y0, fpal)
            x += 34
        for i, f in enumerate(d["faces"]["small"]):
            for y in range(16):
                for xx in range(16):
                    im.putpixel((x + xx, y0 + (i // 2) * 17 + y), (16, 20, 40))
            put(f, 16, 16, x, y0 + (i // 2) * 17, fpal)
            if i % 2 == 0:
                x += 0
            x += 17 if i % 2 == 0 else -17
        x += 36
    im.resize((W * scale, H * scale), Image.NEAREST).save(path)


def write(data):
    lines = [
        "// The six races' art: each race's in-world sprite from five sides with four steps of a walk, the",
        "// way it comes down after ejecting, and its portraits. Drawn by the image model following plans",
        "// of their outlines (tools/gen/races.py) and shrunk to game pixels by tools/voxel/races.py:",
        "// generated, do not edit.",
        "//",
        "// Colours are [r, g, b, part]: 0 the race's own, 1 the suit, 2 its trim, 3 the outline, 4 the",
        "// race's body (skin, feathers, brass, shell, fuzz or cap), 5 its glow (eyes, a lens, lanterns).",
        "// A picture is a string of letters, one a pixel, row after row: each letter an index into the",
        "// colours (0-9, then a-z, then A-Z), '.' nothing.",
        "",
        "export interface SpriteArt {",
        "  w: number",
        "  h: number",
        "}",
        "",
        "export interface RaceArt {",
        "  colours: number[][]",
        "  /** facing the viewer, three-quarters towards him and right, right, three-quarters away and right, away: four steps each */",
        "  sides: (SpriteArt & { steps: string[] })[]",
        "  /** coming down after ejecting */",
        "  fall: SpriteArt & { rows: string }",
        "  /** the same, out on a world at his true size beside his ship (half the size: the sprites above are for the places inside) */",
        "  small: { sides: (SpriteArt & { steps: string[] })[]; fall: SpriteArt & { rows: string } }",
        "  /** its portraits, 32 by 32, the same 16 by 16 (for the HUD), and their colours */",
        "  faces: { colours: number[][]; faces: string[]; small: string[] }",
        "}",
        "",
        "export const RACE_ART: Record<string, RaceArt> = {",
    ]
    for race in RACES:
        d = data[race]
        lines.append(f"  {race}: {{")
        lines.append(f"    colours: {d['colours']},")
        lines.append("    sides: [")
        for s in d["sides"]:
            steps = ", ".join(f"'{t}'" for t in s["steps"])
            lines.append(f"      {{ w: {s['w']}, h: {s['h']}, steps: [{steps}] }},")
        lines.append("    ],")
        f = d["fall"]
        lines.append(f"    fall: {{ w: {f['w']}, h: {f['h']}, rows: '{f['rows']}' }},")
        lines.append("    small: {")
        lines.append("      sides: [")
        for sd in d["small"]["sides"]:
            steps = ", ".join(f"'{t}'" for t in sd["steps"])
            lines.append(f"        {{ w: {sd['w']}, h: {sd['h']}, steps: [{steps}] }},")
        lines.append("      ],")
        f = d["small"]["fall"]
        lines.append(f"      fall: {{ w: {f['w']}, h: {f['h']}, rows: '{f['rows']}' }},")
        lines.append("    },")
        fc = d["faces"]
        lines.append(f"    faces: {{ colours: {fc['colours']}, faces: [")
        for face in fc["faces"]:
            lines.append(f"      '{face}',")
        lines.append("    ], small: [")
        for face in fc["small"]:
            lines.append(f"      '{face}',")
        lines.append("    ] },")
        lines.append("  },")
    lines.append("}")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        fh.write("\n".join(lines) + "\n")


ap = argparse.ArgumentParser()
ap.add_argument("--sheet", default=os.path.join(ROOT, "art", "races", "sheet.png"))
ap.add_argument("races", nargs="*")
args = ap.parse_args()

data = {}
for race in args.races or RACES:
    data[race] = build_race(race)
    data[race]["faces"] = build_faces(race)
if not args.races:
    write(data)
    print(f"wrote {os.path.relpath(OUT, ROOT)}")
sheet_races = args.races or RACES
RACES = sheet_races
sheet(data, args.sheet)
print(f"sheet: {os.path.relpath(args.sheet, ROOT)}")
