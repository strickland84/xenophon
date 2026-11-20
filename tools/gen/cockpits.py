# /// script
# dependencies = ["pillow"]
# ///
"""Draws the cockpit of every hull with the image model (the polish pass, item 3): the view from the
pilot's seat, its canopy frame shaped as the hull is (a light fighter's bubble, an interceptor's
spine, a hauler's square panes, a gunship's armoured slits), its instrument panel laid out for that
ship, in one shared look.

  uv run tools/gen/cockpits.py --plans          # only the plans (art/cockpits/plans), and a sheet of them
  uv run tools/gen/cockpits.py                  # every cockpit, into art/cockpits/source
  uv run tools/gen/cockpits.py dart mule        # only these
  uv run tools/gen/cockpits.py dart --seed 3    # another try

Each cockpit is laid out here, in plan pixels (1536 × 640, wider than any screen, so it can be cut to
fit one): where the windows are, the struts and the roof, the panel and its lip, the side consoles,
the trim strips that take the player's paint, and the screens where the live instruments go. The
layout is drawn as a picture of labels (one value a part) and, from it, a grey plan on black for the
model to follow; tools/voxel/cockpits.py reads the labels back to cut the windows out of the model's
picture, sort its colours, and place the screens.

Every prompt is the subject followed by one shared style. Change the recipe here, never a single
prompt. ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import math
import os
import sys
import time

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "cockpits", "source")
PLANS = os.path.join(ROOT, "art", "cockpits", "plans")

W, H = 1536, 640
CX = W // 2

# the parts, as labels in the plan (a screen is SCREEN + its number)
WINDOW, FRAME, FRAME_TRIM, LIP, PANEL, PANEL_TRIM, SIDE, BEZEL, SCREEN = 0, 1, 2, 3, 4, 5, 6, 7, 10
# the parts' greys in the plan the model follows (lighter is nearer, or brighter)
GREY = {WINDOW: 0, FRAME: 112, FRAME_TRIM: 196, LIP: 160, PANEL: 92, PANEL_TRIM: 204, SIDE: 72, BEZEL: 150}
SCREEN_GREY = 26
# which layer each part is in: the canopy's frame (further from the eyes), or the panel (nearer)
FRAME_PARTS = (FRAME, FRAME_TRIM)

# what each screen shows (the engine draws them live): the radar; the ship's attitude; hull and
# shield; the guns' heat and the missiles; speed and height; the target; the hold
KINDS = ["radar", "attitude", "status", "weapons", "nav", "target", "cargo"]

STYLE = (
    "first person view from the pilot's seat inside the cockpit of a science fiction spacecraft, like a beautiful "
    "16-bit pixel art space flight game, {subject}, the windows looking out on plain black empty space, an instrument "
    "panel across the bottom with dark glass screens, small gauges, switches and warning lamps, sensible muted colours, "
    "dark gunmetal and graphite metal with bright orange trim strips, lit softly from above, crisp detailed pixel art, "
    "hard edges, no anti-aliasing, no blur, no text, an empty cockpit with nobody in it, no people, no hands, no arms"
)

# each hull: what it is (for the model), and its layout
#   window: shapes cut out of the frame for the view (poly, ellipse, rrect)
#   struts: bars across the windows (x0, y0, x1, y1, width), trimmed down one edge when the fourth item says so
#   bars: thin bars of a grille (x0, x1, y, height)
#   panel: its top edge, left to right (the panel fills below it), and the lip's depth along it
#   trim: strips of the player's paint: along the lip, the sills, or a frame (polylines and width)
#   sides: side consoles at the bottom corners (polygons)
#   screens: (kind, x, y, w, h)
#   stretch: the row the art is stretched at, when the frame is taller than it (a row through the windows where the struts are near upright)
#   painted: struts and trim the model's picture has but the game leaves out, cut away as window (James, 2026-11-20, of a
#     bar down the middle of the view: "Stupid and not nice"); kept only so the shared palette is sampled as it was
COCKPITS = {
    "dart": {
        "subject": "a light fighter's tight cockpit under a single clear bubble canopy, only a thin canopy rail round its edge and one slim bow arching overhead, a small low panel",
        "window": [("ellipse", (-120, -330, W + 120, 720))],
        "struts": [("arc", (90, -250, W - 90, 640), 20), ("arc", (330, 36, W - 330, 1300), 20)],
        "bars": [],
        "panel": ([(0, 520), (300, 470), (470, 430), (1066, 430), (1236, 470), (1536, 520)], 26),
        "trim": [([(0, 520), (300, 470), (470, 430)], 10), ([(1066, 430), (1236, 470), (1536, 520)], 10)],
        "sides": [[(0, 560), (250, 540), (330, 640), (0, 640)], [(1536, 560), (1286, 540), (1206, 640), (1536, 640)]],
        "screens": [("radar", 500, 470, 170, 140), ("attitude", 693, 462, 150, 150), ("status", 866, 470, 170, 140)],
        "stretch": 250,
    },
    "sparrow": {
        "subject": "a scout's cockpit under a big teardrop canopy of clear glass with a thin frame and two slim struts curving overhead, a wide view all round, a slim panel with a long sensor screen",
        "window": [("ellipse", (-60, -260, W + 60, 700))],
        "struts": [("arc", (260, -300, W - 260, 600), 16), ("arc", (-40, -120, W + 40, 820), 18)],
        "bars": [],
        "panel": ([(0, 500), (260, 470), (420, 448), (1116, 448), (1276, 470), (1536, 500)], 22),
        "trim": [([(0, 500), (260, 470), (420, 448)], 9), ([(1116, 448), (1276, 470), (1536, 500)], 9)],
        "sides": [[(0, 560), (230, 545), (300, 640), (0, 640)], [(1536, 560), (1306, 545), (1236, 640), (1536, 640)]],
        "screens": [("radar", 440, 486, 300, 120), ("attitude", 760, 478, 136, 136), ("nav", 916, 486, 180, 120)],
        "stretch": 260,
    },
    "lance": {
        "subject": "an interceptor's narrow cockpit, a long thin pointed canopy with a clear view straight ahead between two slanted side struts, thick side frames, a narrow panel with a tall speed tape",
        "window": [("poly", [(330, 40), (1206, 40), (1356, 440), (180, 440)])],
        "struts": [(430, 40, 250, 440, 26), (1106, 40, 1286, 440, 26)],
        "bars": [],
        "panel": ([(0, 470), (360, 430), (520, 412), (1016, 412), (1176, 430), (1536, 470)], 24),
        "trim": [([(0, 470), (360, 430), (520, 412)], 9), ([(1016, 412), (1176, 430), (1536, 470)], 9)],
        "painted": {"struts": [(CX, -20, CX, 420, 30, True)], "trim": [([(CX - 15, 0), (CX - 15, 400)], 6)]},
        "sides": [[(0, 520), (300, 500), (380, 640), (0, 640)], [(1536, 520), (1236, 500), (1156, 640), (1536, 640)]],
        "screens": [("nav", 560, 452, 110, 170), ("radar", 684, 452, 168, 150), ("status", 866, 452, 110, 170)],
        "stretch": 230,
    },
    "corsair": {
        "subject": "a raider's cockpit, an angular canopy with two slanted struts and a heavy roof beam, a sturdy panel with a radar screen on the left and a weapons screen on the right",
        "window": [("poly", [(240, 50), (1296, 50), (1536, 300), (1536, 460), (0, 460), (0, 300)])],
        "struts": [(520, 40, 330, 440, 34, True), (1016, 40, 1206, 440, 34, True)],
        "bars": [],
        "panel": ([(0, 480), (330, 440), (470, 404), (1066, 404), (1206, 440), (1536, 480)], 26),
        "trim": [([(0, 480), (330, 440), (470, 404)], 10), ([(1066, 404), (1206, 440), (1536, 480)], 10)],
        "sides": [[(0, 530), (280, 510), (360, 640), (0, 640)], [(1536, 530), (1256, 510), (1176, 640), (1536, 640)]],
        "screens": [("radar", 470, 444, 176, 150), ("attitude", 693, 440, 150, 150), ("weapons", 890, 444, 176, 150)],
        "stretch": 250,
    },
    "wraith": {
        "subject": "a stealth ship's dark angular cockpit, faceted black canopy panes between sharp angled struts like a stealth jet, a low angular panel glowing faint violet and red, matte black metal",
        "window": [("poly", [(300, 40), (1236, 40), (1536, 330), (1536, 450), (0, 450), (0, 330)])],
        "struts": [(CX, 30, 560, 430, 22), (CX, 30, 976, 430, 22), (380, 36, 170, 450, 26, True), (1156, 36, 1366, 450, 26, True), (0, 250, 380, 150, 18), (1536, 250, 1156, 150, 18)],
        "bars": [],
        "panel": ([(0, 470), (360, 440), (560, 420), (CX, 396), (976, 420), (1176, 440), (1536, 470)], 22),
        "trim": [([(0, 470), (360, 440), (560, 420), (CX, 396)], 7), ([(CX, 396), (976, 420), (1176, 440), (1536, 470)], 7)],
        "sides": [[(0, 520), (300, 500), (380, 640), (0, 640)], [(1536, 520), (1236, 500), (1156, 640), (1536, 640)]],
        "screens": [("radar", 470, 456, 170, 140), ("target", 693, 448, 150, 150), ("status", 896, 456, 170, 140)],
        "stretch": 240,
    },
    "prospector": {
        "subject": "a mining ship's cockpit, a rounded industrial canopy with thick struts and a protective grille over the top of the windscreen, a chunky panel with an ore scanner screen and big rugged switches, scuffed yellow grey metal",
        "window": [("rrect", (100, 50, W - 100, 460), 150)],
        "struts": [(470, 50, 400, 450, 48), (1066, 50, 1136, 450, 48)],
        "bars": [(150, W - 150, y, 12) for y in (82, 116, 150)],
        "panel": ([(0, 460), (300, 420), (430, 392), (1106, 392), (1236, 420), (1536, 460)], 28),
        "trim": [([(430, 392), (1106, 392)], 10), ([(0, 460), (300, 420), (430, 392)], 9), ([(1106, 392), (1236, 420), (1536, 460)], 9)],
        "sides": [[(0, 500), (330, 480), (410, 640), (0, 640)], [(1536, 500), (1206, 480), (1126, 640), (1536, 640)]],
        "screens": [("radar", 452, 438, 200, 160), ("status", 672, 438, 190, 76), ("cargo", 672, 524, 190, 76), ("weapons", 882, 438, 200, 160)],
        "stretch": 270,
    },
    "mule": {
        "subject": "a cargo hauler's wide boxy cockpit, a broad flat windscreen of square panes between thick upright struts and a heavy top beam, a wide flat panel with cargo hold screens showing stacked boxes, worn grey metal",
        "window": [("poly", [(110, 70), (1426, 70), (1426, 440), (110, 440)])],
        "struts": [(440, 60, 440, 440, 46, True), (1096, 60, 1096, 440, 46, True), (110, 60, 110, 440, 40), (1426, 60, 1426, 440, 40)],
        "painted": {"struts": [(CX, 60, CX, 440, 30)], "trim": []},
        "bars": [(110, 1426, 70, 26)],
        "panel": ([(0, 440), (160, 410), (1376, 410), (1536, 440)], 28),
        "trim": [([(160, 410), (1376, 410)], 10)],
        "sides": [[(0, 470), (180, 460), (250, 640), (0, 640)], [(1536, 470), (1356, 460), (1286, 640), (1536, 640)]],
        "screens": [("cargo", 300, 450, 220, 150), ("radar", 540, 450, 180, 150), ("attitude", 740, 450, 150, 150), ("status", 910, 450, 160, 150), ("nav", 1090, 450, 150, 150)],
        "stretch": 250,
    },
    "bastion": {
        "subject": "a heavily armoured gunship's cockpit, thick riveted armour plates over the canopy leaving only narrow slit windows, a heavy panel with a big targeting screen and ammunition counters, dark olive steel",
        "window": [("poly", [(330, 150), (1206, 150), (1236, 300), (300, 300)]), ("poly", [(90, 170), (290, 162), (270, 290), (60, 300)]), ("poly", [(1446, 170), (1246, 162), (1266, 290), (1476, 300)])],
        "struts": [],
        "painted": {"struts": [(CX, 140, CX, 300, 26, True)], "trim": []},
        "bars": [(300, 1236, 300, 16), (330, 1206, 136, 16)],
        "panel": ([(0, 400), (300, 370), (1236, 370), (1536, 400)], 30),
        "trim": [([(300, 370), (1236, 370)], 10), ([(330, 150), (1206, 150)], 8)],
        "sides": [[(0, 460), (260, 440), (330, 640), (0, 640)], [(1536, 460), (1276, 440), (1206, 640), (1536, 640)]],
        "screens": [("status", 380, 412, 180, 180), ("target", 600, 404, 336, 196), ("weapons", 976, 412, 180, 180)],
        "stretch": 220,
    },
    "nomad": {
        "subject": "a long range explorer's cockpit, a wide curved panoramic canopy with slim curved struts like a glass dome, a panel with a star chart screen and navigation instruments, warm grey metal and a few personal trinkets",
        "window": [("ellipse", (-260, -260, W + 260, 820))],
        "struts": [("arc", (380, -220, W - 380, 760), 16), ("arc", (120, -240, W - 120, 800), 16), (CX, -10, CX, 120, 16)],
        "bars": [],
        "panel": ([(0, 480), (300, 452), (480, 430), (1056, 430), (1236, 452), (1536, 480)], 24),
        "trim": [([(0, 480), (300, 452), (480, 430)], 9), ([(1056, 430), (1236, 452), (1536, 480)], 9)],
        "sides": [[(0, 530), (260, 516), (330, 640), (0, 640)], [(1536, 530), (1276, 516), (1206, 640), (1536, 640)]],
        "screens": [("nav", 480, 466, 150, 130), ("radar", 646, 458, 244, 150), ("status", 906, 466, 150, 130)],
        "stretch": 260,
    },
    "galleon": {
        "subject": "a big freighter's bridge, a wide wraparound windscreen in many panes between heavy frames, a long broad console with many screens, steel grey metal",
        "window": [("poly", [(60, 70), (1476, 70), (1536, 140), (1536, 390), (0, 390), (0, 140)])],
        "struts": [(330, 60, 290, 390, 36, True), (560, 60, 548, 390, 30), (976, 60, 988, 390, 30), (1206, 60, 1246, 390, 36, True), (60, 60, 0, 150, 30), (1476, 60, 1536, 150, 30)],
        "bars": [(0, 1536, 60, 24)],
        "panel": ([(0, 400), (1536, 400)], 26),
        "trim": [([(0, 400), (1536, 400)], 10)],
        "sides": [],
        "screens": [("cargo", 220, 440, 150, 140), ("radar", 380, 440, 150, 140), ("status", 540, 440, 100, 140), ("attitude", 696, 436, 144, 144), ("nav", 896, 440, 100, 140), ("weapons", 1006, 440, 150, 140), ("target", 1166, 440, 150, 140)],
        "stretch": 220,
    },
}


def thick(d, x0, y0, x1, y1, w, label):
    """a bar of width w from one point to another"""
    a = math.atan2(y1 - y0, x1 - x0) + math.pi / 2
    dx, dy = math.cos(a) * w / 2, math.sin(a) * w / 2
    d.polygon([(x0 - dx, y0 - dy), (x0 + dx, y0 + dy), (x1 + dx, y1 + dy), (x1 - dx, y1 - dy)], fill=label)


def panel_y(edge, x):
    """the panel's top edge at x"""
    for (xa, ya), (xb, yb) in zip(edge, edge[1:]):
        if xa <= x <= xb:
            return ya + (yb - ya) * (x - xa) / max(1, xb - xa)
    return edge[-1][1]


def labels(name, painted=False):
    """the cockpit's layout as a picture of labels (one value a part); painted: as the model's picture has it, with the
    struts and trim the game cuts away"""
    c = dict(COCKPITS[name])
    if painted and "painted" in c:
        c["struts"] = c["struts"] + c["painted"]["struts"]
        c["trim"] = c["trim"] + c["painted"]["trim"]
    im = Image.new("L", (W, H), FRAME)
    d = ImageDraw.Draw(im)
    for shape in c["window"]:
        if shape[0] == "poly":
            d.polygon(shape[1], fill=WINDOW)
        elif shape[0] == "ellipse":
            d.ellipse(shape[1], fill=WINDOW)
        elif shape[0] == "rrect":
            d.rounded_rectangle(shape[1], radius=shape[2], fill=WINDOW)
    for s in c["struts"]:
        if s[0] == "arc":
            d.ellipse(s[1], outline=FRAME, width=s[2])
            continue
        x0, y0, x1, y1, w = s[:5]
        thick(d, x0, y0, x1, y1, w, FRAME)
        if len(s) > 5 and s[5]:
            # a strip of trim down its middle
            thick(d, x0, y0, x1, y1, max(6, w // 4), FRAME_TRIM)
    for x0, x1, y, h in c["bars"]:
        d.rectangle([x0, y - h // 2, x1, y + h // 2], fill=FRAME)
    edge, lip = c["panel"]
    d.polygon(edge + [(W, H), (0, H)], fill=PANEL)
    # the lip: the panel's top edge, a band along it
    d.polygon(edge + [(x, y + lip) for x, y in reversed(edge)], fill=LIP)
    for side in c["sides"]:
        d.polygon(side, fill=SIDE)
    for line, w in c["trim"]:
        # (a frame's trim on the frame; the lip's just under the lip)
        on_panel = all(y >= panel_y(edge, x) - 2 for x, y in line)
        pts = [(x, y + lip + w // 2) for x, y in line] if on_panel else line
        d.line(pts, fill=PANEL_TRIM if on_panel else FRAME_TRIM, width=w)
    for i, (kind, x, y, w, h) in enumerate(c["screens"]):
        d.rounded_rectangle([x - 8, y - 8, x + w + 8, y + h + 8], radius=10, fill=BEZEL)
        if kind == "attitude":
            d.ellipse([x, y, x + w, y + h], fill=SCREEN + i)
        else:
            d.rectangle([x, y, x + w, y + h], fill=SCREEN + i)
    return im


def plan(lab):
    """the grey plan the model follows, from the labels"""
    lut = [GREY.get(v, SCREEN_GREY if v >= SCREEN else 0) for v in range(256)]
    return lab.point(lut).convert("RGB")


def plans():
    os.makedirs(PLANS, exist_ok=True)
    sheet = Image.new("RGB", (W // 4 * 2, H // 4 * 5))
    for i, name in enumerate(COCKPITS):
        lab = labels(name)
        lab.save(os.path.join(PLANS, f"labels-{name}.png"))
        p = plan(lab)
        p.save(os.path.join(PLANS, f"cockpit-{name}.png"))
        sheet.paste(p.resize((W // 4, H // 4)), ((i % 2) * (W // 4), (i // 2) * (H // 4)))
    sheet.save(os.path.join(PLANS, "sheet.png"))


def generate(name, seed, strength):
    import comfy

    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(3)
    out = os.path.join(OUT, f"cockpit-{name}" + (f"-{seed}" if seed != 1 else "") + ".png")
    start = time.time()
    comfy.txt2img(STYLE.format(subject=COCKPITS[name]["subject"]), out, seed=seed, control=os.path.join(PLANS, f"cockpit-{name}.png"), strength=strength)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)", flush=True)


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    ap = argparse.ArgumentParser()
    ap.add_argument("names", nargs="*")
    ap.add_argument("--plans", action="store_true")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--strength", type=float, default=0.75)
    args = ap.parse_args()
    plans()
    if not args.plans:
        os.makedirs(OUT, exist_ok=True)
        for name in args.names or COCKPITS:
            generate(name, args.seed, args.strength)
