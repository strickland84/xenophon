# /// script
# dependencies = ["numpy", "pillow"]
# ///
"""Turns the image model's cockpits (tools/gen/cockpits.py) into game pixels.

  uv run tools/voxel/cockpits.py              # writes src/lib/engine/render/cockpit/art.ts, and a sheet to look at
  uv run tools/voxel/cockpits.py --sheet x.png

Each cockpit was drawn over a plan whose parts are known exactly (the labels the plan was made
from): so the windows are cut out where the plan has them, not where the model happened to paint
dark, and each game pixel takes the part most of its patch is. The picture is shrunk to two heights
(the frame is about 200 px tall on a phone held sideways and 256 on a laptop; the engine takes the
nearer and fits it to the frame, never scaling it): each game pixel the commonest colour of its patch
among that part's pixels, the colours of all ten cockpits held to one palette of 64 so they share a
look. Colours are sorted into families: the trim (the model's orange: repainted in the player's
markings colour, keeping its lightness), lamps and glows (kept, as drawn), and the rest (kept).

Out comes src/lib/engine/render/cockpit/art.ts: generated, never edited by hand.
"""

import argparse
import colorsys
import os

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "cockpits", "source")
OUT = os.path.join(ROOT, "src", "lib", "engine", "render", "cockpit", "art.ts")

_gen = os.path.join(ROOT, "tools", "gen", "cockpits.py")
gen = {"__file__": _gen, "__name__": "cockpits"}
exec(compile(open(_gen).read(), _gen, "exec"), gen)
COCKPITS, labels = gen["COCKPITS"], gen["labels"]
PW, PH = gen["W"], gen["H"]
WINDOW, FRAME_PARTS, SCREEN, BEZEL = gen["WINDOW"], gen["FRAME_PARTS"], gen["SCREEN"], gen["BEZEL"]

# the heights the art is made at (a frame takes the nearer one)
BUILDS = [200, 256]
# which try of a cockpit is used, where the first was not the best (tools/gen/cockpits.py --seed)
PICKS = {"galleon": 2, "mule": 2}
# families: 0 metal and the rest, 1 trim (the player's paint), 2 a lamp or glow
BODY, TRIM, GLOW = 0, 1, 2
ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/"


def family(c):
    h, s, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
    h *= 360
    if 8 <= h <= 46 and s > 0.5 and v > 0.45:
        return TRIM
    if s > 0.55 and v > 0.6:
        return GLOW
    return BODY


def load(name):
    seed = PICKS.get(name, 1)
    path = os.path.join(SRC, f"cockpit-{name}" + (f"-{seed}" if seed != 1 else "") + ".png")
    im = Image.open(path).convert("RGB")
    if im.size != (PW, PH):
        im = im.resize((PW, PH), Image.LANCZOS)
    return np.asarray(im).astype(np.int32)


def shrink(rgb, lab, hb):
    """the picture at hb game pixels tall: each pixel's part (the commonest in its patch) and colour (the commonest of that part's)"""
    s = hb / PH
    wb = int(round(PW * s))
    part = np.zeros((hb, wb), dtype=np.int32)
    col = np.zeros((hb, wb, 3), dtype=np.int32)
    q = rgb // 10
    for y in range(hb):
        ya, yb = int(y / s), max(int((y + 1) / s), int(y / s) + 1)
        for x in range(wb):
            xa, xb = int(x / s), max(int((x + 1) / s), int(x / s) + 1)
            labs = lab[ya:yb, xa:xb].reshape(-1)
            vals, counts = np.unique(labs, return_counts=True)
            p = int(vals[counts.argmax()])
            part[y, x] = p
            if p == WINDOW:
                continue
            keep = labs == p
            cells = q[ya:yb, xa:xb].reshape(-1, 3)[keep]
            pix = rgb[ya:yb, xa:xb].reshape(-1, 3)[keep]
            keys, kc = np.unique(cells, axis=0, return_counts=True)
            best = keys[kc.argmax()]
            col[y, x] = np.median(pix[(cells == best).all(axis=1)], axis=0)
    return part, col


def tidy(part, col):
    """a pixel unlike all four of its neighbours (a speck) takes the commonest colour round it, inside one part"""
    h, w = part.shape
    out = col.copy()
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if part[y, x] == WINDOW:
                continue
            c = tuple(col[y, x])
            n = [tuple(col[y + dy, x + dx]) for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)) if part[y + dy, x + dx] == part[y, x]]
            if len(n) == 4 and all(sum(abs(a - b) for a, b in zip(c, m)) > 40 for m in n):
                vals = {}
                for m in n:
                    vals[m] = vals.get(m, 0) + 1
                out[y, x] = max(vals, key=vals.get)
    return out


def encode(idx):
    """palette indices as text (space/art.ts's way): one letter a pixel, '.' nothing, runs as '!', two base-36 letters of length, and the letter"""
    syms = ["." if v < 0 else ALPHABET[v] for v in idx.reshape(-1)]
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sheet", default=os.path.join(ROOT, "art", "cockpits", "sheet.png"))
    args = ap.parse_args()

    made = {}
    every = []
    for name in COCKPITS:
        rgb = load(name)
        lab = np.asarray(labels(name)).astype(np.int32)
        for hb in BUILDS:
            part, col = shrink(rgb, lab, hb)
            col = tidy(part, col)
            made[(name, hb)] = (part, col)
            every.append(col[part != WINDOW])
    # one palette for all ten: the model's colours, held to 64 (trim, glows and metal each keep some)
    allpix = np.concatenate(every).astype(np.uint8)
    fam = np.array([family(c) for c in allpix[:: max(1, len(allpix) // 60000)]])
    sample = allpix[:: max(1, len(allpix) // 60000)]
    pal = []
    for f, n in ((BODY, 44), (TRIM, 10), (GLOW, 10)):
        px = sample[fam == f]
        if len(px) == 0:
            continue
        n = min(n, len(np.unique(px, axis=0)))
        img = Image.fromarray(px.reshape(1, -1, 3))
        qz = img.quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        for c in np.asarray(qz.getpalette()[: n * 3]).reshape(-1, 3):
            pal.append((int(c[0]), int(c[1]), int(c[2]), f))
    pal = pal[:64]
    P = np.array([p[:3] for p in pal], dtype=np.int32)
    PF = np.array([p[3] for p in pal])

    def nearest(c):
        # (within its own family where there is one, so the trim stays trim)
        f = family(tuple(int(v) for v in c))
        d = ((P - c) ** 2).sum(axis=1) + np.where(PF == f, 0, 4000)
        return int(d.argmin())

    out = {}
    sheet_rows = []
    for name in COCKPITS:
        c = COCKPITS[name]
        builds = []
        for hb in BUILDS:
            part, col = made[(name, hb)]
            h, w = part.shape
            cache = {}
            idx = np.full((h, w), -1, dtype=np.int32)
            for y in range(h):
                for x in range(w):
                    if part[y, x] == WINDOW:
                        continue
                    k = tuple(col[y, x])
                    if k not in cache:
                        cache[k] = nearest(col[y, x])
                    idx[y, x] = cache[k]
            # the two layers: the canopy's frame, and the panel (nearer, so it sways more as the head moves)
            in_frame = np.isin(part, FRAME_PARTS)
            frame = np.where(in_frame, idx, -1)
            panel = np.where(~in_frame & (part != WINDOW), idx, -1)
            s = hb / PH
            screens = []
            for i, (kind, x, y, sw, sh) in enumerate(c["screens"]):
                screens.append({"kind": kind, "x": int(round(x * s)), "y": int(round(y * s)), "w": int(round(sw * s)), "h": int(round(sh * s))})
            # for each column, the first row from which everything below is solid (the world need not be drawn under it)
            solid = part != WINDOW
            cover = []
            for x in range(w):
                col_ = solid[:, x]
                y = h
                while y > 0 and col_[y - 1]:
                    y -= 1
                cover.append(y)
            builds.append({
                "h": h, "w": w, "frame": encode(frame), "panel": encode(panel), "screens": screens,
                "stretch": int(round(c["stretch"] * s)), "cover": cover,
            })
            if hb == BUILDS[-1]:
                rgbim = np.zeros((h, w, 3), dtype=np.uint8)
                rgbim[:, :] = (30, 60, 110)
                for y in range(h):
                    for x in range(w):
                        if idx[y, x] >= 0:
                            rgbim[y, x] = P[idx[y, x]]
                for sc in screens:
                    rgbim[sc["y"]:sc["y"] + sc["h"], sc["x"]:sc["x"] + sc["w"]] = (10, 40, 24)
                sheet_rows.append(rgbim)
        out[name] = builds

    lines = [
        "// Every hull's cockpit: the view from the pilot's seat, drawn by the image model following a plan of",
        "// its layout (tools/gen/cockpits.py) and shrunk to game pixels at two heights by tools/voxel/cockpits.py:",
        "// generated, do not edit. Each is two layers (the canopy's frame, and the panel nearer the eyes) of",
        "// pictures in one shared palette, with where its live screens are, the row it is stretched at for a",
        "// taller frame, and for each column the row from which everything below is solid.",
        "//",
        "// Colours are [r, g, b, family]: 0 as drawn, 1 trim (repainted in the player's markings colour), 2 a lamp.",
        "",
        "export interface CockpitScreen {",
        "  kind: 'radar' | 'attitude' | 'status' | 'weapons' | 'nav' | 'target' | 'cargo'",
        "  x: number",
        "  y: number",
        "  w: number",
        "  h: number",
        "}",
        "",
        "export interface CockpitBuild {",
        "  w: number",
        "  h: number",
        "  frame: string",
        "  panel: string",
        "  screens: CockpitScreen[]",
        "  stretch: number",
        "  cover: number[]",
        "}",
        "",
        f"export const COCKPIT_COLOURS: number[][] = {[list(p) for p in pal]}",
        "",
        "export const COCKPITS: Record<string, CockpitBuild[]> = {",
    ]
    for name, builds in out.items():
        lines.append(f"  {name}: [")
        for b in builds:
            scr = ", ".join(f"{{ kind: '{s['kind']}', x: {s['x']}, y: {s['y']}, w: {s['w']}, h: {s['h']} }}" for s in b["screens"])
            lines.append("    {")
            lines.append(f"      w: {b['w']},")
            lines.append(f"      h: {b['h']},")
            lines.append(f"      frame: '{b['frame']}',")
            lines.append(f"      panel: '{b['panel']}',")
            lines.append(f"      screens: [{scr}],")
            lines.append(f"      stretch: {b['stretch']},")
            lines.append(f"      cover: {b['cover']},")
            lines.append("    },")
        lines.append("  ],")
    lines.append("}")
    with open(OUT, "w") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"wrote {os.path.relpath(OUT, ROOT)} ({os.path.getsize(OUT) // 1024} KB, {len(pal)} colours)")

    # a sheet: every cockpit at the laptop's height, cut to 16:9, twice life size
    cut = []
    for im in sheet_rows:
        h, w = im.shape[:2]
        fw = int(h * 16 / 9)
        x0 = (w - fw) // 2
        cut.append(im[:, x0:x0 + fw])
    h, fw = cut[0].shape[:2]
    sheet = np.zeros((h * 5 + 8, fw * 2 + 4, 3), dtype=np.uint8)
    for i, im in enumerate(cut):
        y0 = (i // 2) * (h + 2)
        x0 = (i % 2) * (fw + 4)
        sheet[y0:y0 + h, x0:x0 + fw] = im
    Image.fromarray(sheet).resize((sheet.shape[1] * 2, sheet.shape[0] * 2), Image.NEAREST).save(args.sheet)
    print(f"sheet: {os.path.relpath(args.sheet, ROOT)}")


if __name__ == "__main__":
    main()
