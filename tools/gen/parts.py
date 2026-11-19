# /// script
# dependencies = ["pillow"]
# ///
"""Draws the parts a pilot fits to his ship (Phase 8) with the image model: the weapons that hang
on a hull's mounts (flak, a mining laser, a missile rack, a mine layer) and the modules (a cargo
pod, a scanner dish, a tractor, an afterburner tank, a shield booster, a cruise drive, a heat sink,
armour plating), and the emblems a pilot paints on his wings.

  uv run tools/gen/parts.py                 # every one, into art/parts/source
  uv run tools/gen/parts.py flak scanner    # only these
  uv run tools/gen/parts.py flak --seed 3   # another try at one

One recipe, one style shared by everything drawn with it, and the same as the hulls' (dark
gunmetal, seen from straight above, lit from the top left), so a part looks as if it belongs on the
ship it is fitted to: change the recipe here, never a single prompt. Each follows a grey plan of its
shape on black (art/parts/control), which also cuts it out afterwards. tools/voxel/parts.py shrinks
them into game pixels and gives them height. The look follows the mockup art/mockups/loadout.png.

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
OUT = os.path.join(ROOT, "art", "parts", "source")
CONTROL = os.path.join(ROOT, "art", "parts", "control")

# a part of a ship, seen as the hulls were drawn: from straight above, its front at the top. Drawn again in polish step 8 to
# be read at the size it is flown at (8 to 16 game pixels): a few big shapes, a thick outline, and its own colour
PART = (
    "pixel art game sprite of a single small spaceship part seen from directly above, strict top-down orthographic "
    "view, its front at the top of the image, {subject}, drawn to be read at a tiny size: a very simple bold silhouette "
    "of a few big flat shapes, thick dark outline, dark gunmetal grey metal with pale grey edges, crisp chunky pixels, "
    "limited colour palette, no anti-aliasing, no blur, 16-bit era, lit from the top left, one object, whole object in "
    "frame and centred, plain flat black background, no text"
)
# an emblem painted on a wing: a bold flat shape in two colours
EMBLEM = (
    "a single bold flat pixel art emblem icon for a pilot's insignia painted on a spaceship, {subject}, white "
    "shape with a thick dark outline, very simple bold silhouette readable at a tiny size, crisp chunky pixels, "
    "hard edges, no anti-aliasing, no gradients, centred, plain flat black background, no text"
)

# name: (recipe, subject, picture size)
SUBJECTS = {
    # weapons, each hung on a mount under a wing
    "flak": (PART, "a short stubby flak cannon pod with two wide fat barrels side by side pointing forward with bright orange muzzle rings, a boxy ammunition drum behind them", (512, 1024)),
    "laser": (PART, "a long slim mining laser emitter pod, a narrow angular housing with a big pointed glowing bright cyan crystal lens at its front tip", (512, 1024)),
    "rack": (PART, "a missile rack holding three fat white missiles side by side with bright red tips and small fins, pointing forward, on a dark metal rail", (512, 1024)),
    "mines": (PART, "a squat boxy mine dispenser pod with two big round bright yellow and black striped mines showing in its open back", (512, 768)),
    # modules, each in its own place on the hull
    "cargo": (PART, "a long fat armoured cargo container pod with pointed ends and two bold bright yellow and black hazard stripe bands across it", (512, 1024)),
    "scanner": (PART, "a round radar scanner dish, a pale shallow bowl with a pointed antenna spike in its middle and a thick glowing bright cyan ring", (768, 768)),
    "tractor": (PART, "a tractor beam emitter, an angular ring of three claw prongs around a big glowing bright green lens", (768, 768)),
    "tank": (PART, "a slim pointed afterburner fuel tank, a narrow cylinder with a pointed nose and two bold bright orange bands", (512, 1024)),
    "shield": (PART, "a shield booster node, a big glowing bright cyan orb held in an angular three-pronged metal cradle", (768, 768)),
    "cruise": (PART, "an extra cruise drive engine housing seen from above, an angular armoured block with a big round nozzle glowing bright blue at its back end", (768, 1024)),
    "heatsink": (PART, "a heat sink radiator panel of five thick parallel cooling fins glowing orange red between them, in an angular frame", (512, 1024)),
    "armour": (PART, "a pointed chevron shaped armour plate of two overlapping thick angular pale metal slabs with bold orange edges", (768, 768)),
    # emblems
    "emblem-skull": (EMBLEM, "a grinning skull"),
    "emblem-star": (EMBLEM, "a five pointed star"),
    "emblem-wolf": (EMBLEM, "a snarling wolf head in profile"),
    "emblem-comet": (EMBLEM, "a comet with a sweeping tail"),
    "emblem-crown": (EMBLEM, "a three pointed crown"),
    "emblem-eye": (EMBLEM, "a single staring eye"),
    "emblem-fang": (EMBLEM, "a pair of crossed swords"),
    "emblem-flame": (EMBLEM, "a tall flame"),
    "emblem-bolt": (EMBLEM, "a lightning bolt"),
    "emblem-moon": (EMBLEM, "a crescent moon"),
    "mark-nomarchy": (EMBLEM, "a solid equilateral triangle pointing up, like a seal"),
    "mark-anarchoi": (EMBLEM, "a solid diamond shape, like a patched sail"),
}
# emblems are square
for k, v in list(SUBJECTS.items()):
    if len(v) == 2:
        SUBJECTS[k] = (v[0], v[1], (512, 512))

GREY = 150
LIGHT = 205
DARK = 95


def plan(name, size):
    """the grey plan of a part's shape on black, for the model to follow (none for an emblem)"""
    w, h = size
    im = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(im)
    cx = w // 2
    if name == "flak":
        d.rectangle([cx - 120, 330, cx + 120, 820], fill=GREY)
        d.rectangle([cx - 100, 140, cx - 30, 360], fill=LIGHT)
        d.rectangle([cx + 30, 140, cx + 100, 360], fill=LIGHT)
        d.polygon([(cx - 120, 820), (cx + 120, 820), (cx + 70, 900), (cx - 70, 900)], fill=DARK)
    elif name == "laser":
        d.polygon([(cx, 90), (cx + 60, 240), (cx + 80, 840), (cx + 50, 930), (cx - 50, 930), (cx - 80, 840), (cx - 60, 240)], fill=GREY)
        d.polygon([(cx, 90), (cx + 34, 190), (cx - 34, 190)], fill=LIGHT)
    elif name == "rack":
        for dx in (-120, 0, 120):
            d.polygon([(cx + dx, 120), (cx + dx + 40, 220), (cx + dx + 40, 860), (cx + dx - 40, 860), (cx + dx - 40, 220)], fill=LIGHT)
        d.rectangle([cx - 190, 420, cx + 190, 560], fill=DARK)
    elif name == "mines":
        d.polygon([(cx - 150, 150), (cx + 150, 150), (cx + 190, 300), (cx + 190, 640), (cx - 190, 640), (cx - 190, 300)], fill=GREY)
        d.ellipse([cx - 120, 380, cx - 20, 480], fill=LIGHT)
        d.ellipse([cx + 20, 380, cx + 120, 480], fill=LIGHT)
    elif name == "cargo":
        d.polygon([(cx, 80), (cx + 150, 240), (cx + 150, 780), (cx, 940), (cx - 150, 780), (cx - 150, 240)], fill=GREY)
        d.rectangle([cx - 150, 380, cx + 150, 420], fill=DARK)
        d.rectangle([cx - 150, 600, cx + 150, 640], fill=DARK)
    elif name == "scanner":
        d.ellipse([cx - 260, 124, cx + 260, 644], fill=GREY)
        d.ellipse([cx - 60, 324, cx + 60, 444], fill=LIGHT)
    elif name == "tractor":
        for a in range(3):
            import math

            t = a * 2 * math.pi / 3 - math.pi / 2
            px, py = cx + math.cos(t) * 230, 384 + math.sin(t) * 230
            d.polygon([(px, py), (cx + math.cos(t + 0.5) * 120, 384 + math.sin(t + 0.5) * 120), (cx + math.cos(t - 0.5) * 120, 384 + math.sin(t - 0.5) * 120)], fill=GREY)
        d.ellipse([cx - 110, 274, cx + 110, 494], fill=LIGHT)
    elif name == "tank":
        d.polygon([(cx, 80), (cx + 90, 260), (cx + 90, 880), (cx + 50, 940), (cx - 50, 940), (cx - 90, 880), (cx - 90, 260)], fill=GREY)
        for y in (400, 560, 720):
            d.rectangle([cx - 90, y, cx + 90, y + 24], fill=LIGHT)
    elif name == "shield":
        d.polygon([(cx, 140), (cx + 250, 560), (cx - 250, 560)], fill=GREY)
        d.ellipse([cx - 130, 270, cx + 130, 530], fill=LIGHT)
    elif name == "cruise":
        d.polygon([(cx - 120, 120), (cx + 120, 120), (cx + 220, 360), (cx + 220, 760), (cx - 220, 760), (cx - 220, 360)], fill=GREY)
        d.ellipse([cx - 160, 680, cx + 160, 920], fill=LIGHT)
    elif name == "heatsink":
        d.rectangle([cx - 150, 120, cx + 150, 900], fill=DARK)
        for y in range(160, 880, 56):
            d.rectangle([cx - 130, y, cx + 130, y + 26], fill=LIGHT)
    elif name == "armour":
        d.polygon([(cx, 110), (cx + 320, 560), (cx + 200, 640), (cx, 360), (cx - 200, 640), (cx - 320, 560)], fill=GREY)
        d.polygon([(cx, 200), (cx + 120, 380), (cx, 300), (cx - 120, 380)], fill=LIGHT)
    else:
        return None
    return im


ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.8)
args = ap.parse_args()

os.makedirs(OUT, exist_ok=True)
os.makedirs(CONTROL, exist_ok=True)
for name in args.names or SUBJECTS:
    recipe, subject, size = SUBJECTS[name]
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(3)
    control = None
    im = plan(name, size)
    if im is not None:
        control = os.path.join(CONTROL, f"control-{name}.png")
        im.save(control)
    out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
    start = time.time()
    comfy.txt2img(recipe.format(subject=subject), out, seed=args.seed, width=size[0], height=size[1], control=control, strength=args.strength)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
