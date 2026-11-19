# /// script
# dependencies = ["pillow"]
# ///
"""Draws the places found out over a world, away from its bases (engine/world/lands.ts: a world is far larger than
its bases' ground): the buildings of a settlement, ruins, standing stones, a relay tower, a mine's rig, each seen
from above, with the image model.

  uv run tools/gen/places.py                # every one, into art/places/source
  uv run tools/gen/places.py dome ruin      # only these
  uv run tools/gen/places.py ruin --seed 3  # another try at one

Each is drawn to follow a grey plan of its shape on black (art/places/control), which also cuts it out of its
picture afterwards (tools/voxel/places.py shrinks them into game pixels). Every prompt is the subject followed by
the one style the bases' buildings were drawn in (tools/gen/features.py), so they stand beside them in one look.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import math
import os
import sys
import time

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "places", "source")
CONTROL = os.path.join(ROOT, "art", "places", "control")

STYLE = (
    "pixel art game sprite seen from directly above, strict top-down orthographic view, {subject}, "
    "crisp chunky pixels, limited colour palette, hard edges, no anti-aliasing, no blur, 16-bit era, "
    "one object, whole object in frame and centred, plain flat black background, no text"
)

PLACES = {
    "dome": "a round colony habitat dome, pale blue-white glass panels in a hexagon lattice over a white metal ring base, a small airlock on one side",
    "house": "the roof of a small colonist cabin seen straight down so that no walls show, a ridged terracotta red roof with a solar panel and a square chimney",
    "greenhouse": "a long greenhouse seen straight down, a white metal frame of glass roof panels with rows of green crops showing through the glass",
    "tower": "the flat top of a relay station seen straight down so that no walls and no mast show, a square steel grating deck with a large round white satellite dish lying flat in its middle, a red warning lamp at each corner",
    "ruin": "the floor plan of an ancient ruin seen straight down so that only the flat tops of its walls show, a maze of low broken pale sandstone wall tops round roofless rooms of bare earth, scattered fallen blocks, moss in the cracks",
    "stones": "a ring of ancient standing stones seen straight down, seven tall dark slate monoliths in a circle round a flat altar stone, faint cyan glowing glyphs",
    "rig": "the flat deck of a mining platform seen straight down so that no tower and no legs show, a square dark steel deck with a round drill shaft hole in its middle, a yellow crane arm lying across it, an orange ore hopper in one corner",
}

S = 1024
GREY = 150
LIGHT = 205


def plan(name):
    """the grey plan of a place's shape on black: the model follows it, and it cuts the place out"""
    im = Image.new("RGB", (S, S), (0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S // 2

    def chamfer(x0, y0, x1, y1, k, fill):
        d.polygon([(x0 + k, y0), (x1 - k, y0), (x1, y0 + k), (x1, y1 - k), (x1 - k, y1), (x0 + k, y1), (x0, y1 - k), (x0, y0 + k)], fill=fill)

    if name == "dome":
        d.ellipse([c - 360, c - 360, c + 360, c + 360], fill=GREY)
        d.ellipse([c - 250, c - 250, c + 250, c + 250], fill=LIGHT)
        d.rectangle([c - 60, c + 330, c + 60, c + 420], fill=GREY)
    elif name == "house":
        chamfer(c - 300, c - 240, c + 300, c + 240, 30, GREY)
        d.line([(c - 290, c), (c + 290, c)], fill=LIGHT, width=24)
        d.rectangle([c + 120, c - 180, c + 220, c - 80], fill=LIGHT)
    elif name == "greenhouse":
        chamfer(c - 420, c - 190, c + 420, c + 190, 30, GREY)
        for x in range(c - 360, c + 361, 120):
            d.line([(x, c - 180), (x, c + 180)], fill=LIGHT, width=12)
        d.line([(c - 410, c), (c + 410, c)], fill=LIGHT, width=12)
    elif name == "tower":
        chamfer(c - 300, c - 300, c + 300, c + 300, 60, GREY)
        d.ellipse([c - 170, c - 170, c + 170, c + 170], fill=LIGHT)
    elif name == "ruin":
        # roofless rooms: walls as thick lines, broken
        for x0, y0, x1, y1 in [(c - 380, c - 300, c + 100, c - 300), (c - 380, c - 300, c - 380, c + 280), (c - 380, c + 280, c - 60, c + 280),
                               (c + 100, c - 300, c + 100, c - 40), (c - 120, c - 300, c - 120, c + 40), (c - 380, c + 20, c - 200, c + 20),
                               (c + 180, c + 40, c + 380, c + 40), (c + 380, c + 40, c + 380, c + 300), (c + 120, c + 300, c + 380, c + 300)]:
            d.line([(x0, y0), (x1, y1)], fill=GREY, width=64)
        for x, y, r in [(c + 250, c - 200, 46), (c + 20, c + 170, 40), (c - 250, c - 150, 34), (c + 300, c + 170, 30), (c - 30, c + 320, 26)]:
            d.ellipse([x - r, y - r, x + r, y + r], fill=GREY)
    elif name == "stones":
        d.ellipse([c - 400, c - 400, c + 400, c + 400], fill=(60, 60, 60))
        for i in range(7):
            a = i / 7 * math.tau + 0.3
            x, y = c + math.cos(a) * 300, c + math.sin(a) * 300
            d.ellipse([x - 62, y - 62, x + 62, y + 62], fill=LIGHT)
        chamfer(c - 110, c - 80, c + 110, c + 80, 30, GREY)
    elif name == "rig":
        chamfer(c - 340, c - 340, c + 340, c + 340, 50, GREY)
        chamfer(c - 150, c - 150, c + 150, c + 150, 20, LIGHT)
        d.line([(c, c), (c + 420, c - 260)], fill=LIGHT, width=50)
        d.rectangle([c - 300, c + 160, c - 120, c + 300], fill=LIGHT)
    return im


ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*", help="which places (all of them if none are given)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.75)
args = ap.parse_args()

os.makedirs(CONTROL, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
for name in args.names or PLACES:
    control = os.path.join(CONTROL, f"{name}.png")
    plan(name).save(control)
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(10)
    out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
    start = time.time()
    comfy.txt2img(STYLE.format(subject=PLACES[name]), out, seed=args.seed, control=control, strength=args.strength)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
