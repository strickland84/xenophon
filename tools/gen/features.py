# /// script
# dependencies = ["pillow"]
# ///
"""Draws the things stamped into a world's ground (Phase 4): the buildings and turrets of a
base, an outcrop of each ore, and a wreck, each seen from above, with the image model.

  uv run tools/gen/features.py                 # every one, into art/features/source
  uv run tools/gen/features.py hangar ferrite  # only these
  uv run tools/gen/features.py turret --seed 3 # another try at one

Each is drawn to follow a grey plan of its shape on black (art/features/control), which is
also what cuts it out of its picture afterwards (tools/voxel/prefabs.py shrinks them into
game pixels). Every prompt is the subject followed by one shared style, so the set comes out
in one look: change the recipe here, never a single prompt. The look follows the mockups
art/mockups/base*.png, ore*.png and crate.png.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import os
import sys
import time

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "features", "source")
CONTROL = os.path.join(ROOT, "art", "features", "control")

STYLE = (
    "pixel art game sprite seen from directly above, strict top-down orthographic view, {subject}, "
    "crisp chunky pixels, limited colour palette, hard edges, no anti-aliasing, no blur, 16-bit era, "
    "one object, whole object in frame and centred, plain flat black background, no text"
)

ROCK = "bursting out of a small heap of broken grey rock"
FEATURES = {
    "hangar": "a long low military hangar with a curved ribbed grey metal roof, dark seams between the roof panels, a row of small vents along the ridge",
    "block": "the flat roof of a low angular military building seen straight down so that no walls show, grey metal roof panels with rivets and dark seams, two square roof vents and an air conditioning unit",
    "command": "a fortified command building with a flat dark grey armoured roof edged with a bright gold trim, a raised square core in its middle with an antenna",
    "tanks": "two round fuel storage tanks side by side with pale domed metal tops and grey rims, pipes between them",
    "turret": "a squat defence gun turret on a round grey concrete plinth, a dark armoured dome in the middle",
    "ferrite": f"an outcrop of iron ore, chunky blocky lumps of dull rusty brown and dark gunmetal grey metal ore with orange rust streaks and shiny metallic flecks, {ROCK}",
    "silica": f"an outcrop of pale white quartz crystals with a faint blue tint, {ROCK}",
    "cryo-ice": f"an outcrop of bright cyan ice crystals, frosty and glassy, {ROCK}",
    "magma-glass": "an outcrop of glowing deep red and orange shards of volcanic glass, bursting out of a small heap of black rock",
    "bioresin": "an outcrop of translucent amber and honey coloured resin crystals, bursting out of a small heap of mossy brown rock",
    "salvage": "the burnt wreck of a crashed angular spaceship broken into two large pieces filling the frame, dark scorched grey metal hull plating with torn jagged edges, exposed ribs, scattered metal debris",
}

S = 1024
GREY = 150
LIGHT = 205


def plan(name):
    """the grey plan of a feature's shape on black: the model follows it, and it cuts the feature out"""
    im = Image.new("RGB", (S, S), (0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S // 2

    def chamfer(x0, y0, x1, y1, k, fill):
        d.polygon([(x0 + k, y0), (x1 - k, y0), (x1, y0 + k), (x1, y1 - k), (x1 - k, y1), (x0 + k, y1), (x0, y1 - k), (x0, y0 + k)], fill=fill)

    def crystals(n, reach, seed, fill=LIGHT):
        # pointed crystals leaning out from the middle, in a ring
        import math

        for i in range(n):
            a = (i / n) * math.tau + seed
            r = reach * (0.55 + 0.45 * ((i * 37 + seed * 11) % 7) / 6)
            w = 46 + (i * 13) % 26
            bx, by = c + math.cos(a) * 40, c + math.sin(a) * 40
            tx, ty = c + math.cos(a) * r, c + math.sin(a) * r
            px, py = -math.sin(a) * w, math.cos(a) * w
            d.polygon([(bx + px, by + py), (bx + px * 0.8 + (tx - bx) * 0.75, by + py * 0.8 + (ty - by) * 0.75), (tx, ty),
                       (bx - px * 0.8 + (tx - bx) * 0.75, by - py * 0.8 + (ty - by) * 0.75), (bx - px, by - py)], fill=fill)

    if name == "hangar":
        chamfer(c - 400, c - 230, c + 400, c + 230, 40, GREY)
        for x in range(c - 360, c + 361, 80):
            d.line([(x, c - 220), (x, c + 220)], fill=(110, 110, 110), width=10)
    elif name == "block":
        chamfer(c - 300, c - 270, c + 300, c + 270, 70, GREY)
        d.rectangle([c - 170, c - 150, c - 40, c - 20], fill=LIGHT)
        d.rectangle([c + 60, c + 40, c + 200, c + 170], fill=LIGHT)
    elif name == "command":
        chamfer(c - 340, c - 340, c + 340, c + 340, 110, GREY)
        chamfer(c - 170, c - 170, c + 170, c + 170, 50, LIGHT)
    elif name == "tanks":
        d.ellipse([c - 390, c - 190, c - 10, c + 190], fill=GREY)
        d.ellipse([c + 10, c - 190, c + 390, c + 190], fill=GREY)
        d.ellipse([c - 300, c - 100, c - 100, c + 100], fill=LIGHT)
        d.ellipse([c + 100, c - 100, c + 300, c + 100], fill=LIGHT)
    elif name == "turret":
        d.ellipse([c - 330, c - 330, c + 330, c + 330], fill=GREY)
        d.ellipse([c - 180, c - 180, c + 180, c + 180], fill=LIGHT)
    elif name == "salvage":
        d.polygon([(c - 380, c - 60), (c - 120, c - 260), (c + 40, c - 120), (c - 20, c + 40), (c - 300, c + 120)], fill=GREY)
        d.polygon([(c + 60, c - 40), (c + 360, c - 20), (c + 300, c + 260), (c + 80, c + 200)], fill=GREY)
        for x, y, r in [(c - 160, c + 260, 40), (c + 200, c - 230, 34), (c - 380, c + 230, 26), (c + 380, c + 330, 30)]:
            d.ellipse([x - r, y - r, x + r, y + r], fill=GREY)
    else:
        # an ore: a heap of rock with crystals standing out of it
        d.ellipse([c - 330, c - 300, c + 330, c + 320], fill=(90, 90, 90))
        crystals(7, 330, {"ferrite": 0.3, "silica": 1.1, "cryo-ice": 2.0, "magma-glass": 0.7, "bioresin": 1.6}.get(name, 0))
    return im


ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*", help="which features (all of them if none are given)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.75)
args = ap.parse_args()

os.makedirs(CONTROL, exist_ok=True)
for name in args.names or FEATURES:
    control = os.path.join(CONTROL, f"{name}.png")
    plan(name).save(control)
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(10)
    out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
    start = time.time()
    comfy.txt2img(STYLE.format(subject=FEATURES[name]), out, seed=args.seed, control=control, strength=args.strength)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
