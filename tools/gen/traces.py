# /// script
# dependencies = ["pillow"]
# ///
"""Draws the marks players leave on a world (Phase 7) with the image model: each side's flag on
its pole, a wreck, a grave marker, a beacon, and each side's six rank badges.

  uv run tools/gen/traces.py                  # every one, into art/traces/source
  uv run tools/gen/traces.py flag-nomarchy     # only these
  uv run tools/gen/traces.py wreck --seed 3   # another try at one

One recipe, one style shared by everything drawn with it, so the set comes out in one look:
change the recipe here, never a single prompt. Each follows a grey plan of its shape on black
(art/traces/control), which also cuts it out afterwards. tools/voxel/traces.py shrinks them into
game pixels. The look follows the mockups art/mockups/flag-planted.png and traces.png.

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
OUT = os.path.join(ROOT, "art", "traces", "source")
CONTROL = os.path.join(ROOT, "art", "traces", "control")

# things standing on the ground, seen as the game's walkers are: from high above, a little from the front
STANDING = (
    "pixel art game sprite of {subject}, seen from a high three-quarter view from above like a 16-bit top-down game, "
    "crisp chunky pixels, limited colour palette, hard edges, no anti-aliasing, no blur, lit from the top left, "
    "plain flat black background, no text"
)
# things lying flat, seen from straight above
LYING = (
    "pixel art game sprite seen from directly above, strict top-down orthographic view, {subject}, "
    "crisp chunky pixels, limited colour palette, hard edges, no anti-aliasing, no blur, 16-bit era, "
    "lit from the top left, plain flat black background, no text"
)
# a sheet of icons in a row
BADGES = (
    "a sprite sheet of six military rank insignia badges for a pixel art space game in a row, each one a separate "
    "small chunky emblem on the plain black background, growing grander from left to right, {subject}, "
    "crisp chunky pixels, limited colour palette, hard edges, no anti-aliasing, no blur, no text"
)

SUBJECTS = {
    "flag-nomarchy": (STANDING, "a tall thin dark metal flag pole planted in the ground with a small stake at its foot, flying a rectangular gold banner trimmed in ivory with a bold dark navy triangle emblem on it, the banner rippling in the wind", (512, 768)),
    "flag-anarchoi": (STANDING, "a tall thin rusty metal flag pole planted in the ground with a small stake at its foot, flying a ragged patched violet banner with rust brown stitching and a bold pale diamond emblem on it, the banner rippling in the wind", (512, 768)),
    "wreck": (LYING, "the burnt broken wreck of a small pointed angular spaceship crashed on the ground, its hull split in two, scorched black and dark grey plates, torn metal edges, a few glowing embers and scattered scrap pieces around it", (1024, 768)),
    "grave": (STANDING, "a small grave marker on a pilot's grave: a rounded grey stone slab standing upright with a dented pilot's flight helmet resting on its top, a low mound of earth in front of it", (512, 512)),
    "beacon": (STANDING, "a short signal beacon post planted in the ground: a thin dark metal post with a small square message plate glowing pale cyan halfway up and a round bright light on its top, three little feet", (512, 768)),
    "badges-nomarchy": (BADGES, "formal gold and ivory insignia on dark navy shields: one gold chevron, two gold chevrons, three gold chevrons, a gold bar with a small star, a gold laurel with two stars, a grand gold triangle crest with three stars and wings", (1536, 256)),
    "badges-anarchoi": (BADGES, "scrappy riveted rust brown and violet insignia made from scrap metal: one violet stripe, two violet stripes, three violet stripes, a violet diamond with rivets, a jagged diamond with crossed blades, a big spiked violet diamond crest with lightning", (1536, 256)),
}

GREY = 150
LIGHT = 205
DARK = 95


def plan(name, size):
    """the grey plan of a thing's shape on black, for the model to follow"""
    w, h = size
    im = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(im)
    if name.startswith("flag"):
        # a pole up the left, a banner off its top
        d.rectangle([150, 90, 176, 700], fill=GREY)
        d.polygon([(130, 700), (196, 700), (178, 740), (148, 740)], fill=DARK)
        if name == "flag-nomarchy":
            d.rectangle([176, 100, 440, 310], fill=GREY)
            d.polygon([(308, 140), (370, 270), (246, 270)], fill=LIGHT)
        else:
            d.polygon([(176, 100), (450, 120), (420, 205), (452, 300), (176, 320)], fill=GREY)
            d.polygon([(310, 140), (370, 210), (310, 280), (250, 210)], fill=LIGHT)
    elif name == "wreck":
        # a pointed hull, broken in two, and scrap
        d.polygon([(140, 400), (430, 300), (500, 330), (520, 470), (420, 500)], fill=GREY)
        d.polygon([(560, 300), (780, 250), (900, 380), (800, 520), (590, 480)], fill=GREY)
        d.polygon([(620, 330), (760, 300), (840, 380), (760, 460), (630, 440)], fill=DARK)
        for x, y, r in [(520, 590, 24), (300, 560, 18), (880, 560, 20), (700, 610, 14), (420, 220, 16), (950, 300, 12)]:
            d.ellipse([x - r, y - r, x + r, y + r], fill=GREY)
    elif name == "grave":
        d.ellipse([110, 380, 400, 470], fill=DARK)
        d.rounded_rectangle([170, 150, 340, 420], radius=70, fill=GREY)
        d.ellipse([190, 80, 320, 200], fill=LIGHT)
    elif name == "beacon":
        d.polygon([(200, 700), (312, 700), (290, 730), (222, 730)], fill=DARK)
        d.rectangle([243, 200, 269, 700], fill=GREY)
        d.rectangle([200, 380, 312, 470], fill=LIGHT)
        d.ellipse([206, 110, 306, 210], fill=LIGHT)
    elif name.startswith("badges"):
        for i in range(6):
            cx = 128 + i * 256
            r = 70 + i * 9
            if name == "badges-nomarchy":
                d.polygon([(cx - r, 128 - r), (cx + r, 128 - r), (cx + r, 128 + r * 0.4), (cx, 128 + r), (cx - r, 128 + r * 0.4)], fill=GREY)
                for k in range(min(i + 1, 3)):
                    y = 128 - r * 0.45 + k * 30
                    d.line([(cx - r * 0.6, y), (cx, y + 28), (cx + r * 0.6, y)], fill=LIGHT, width=12)
                for k in range(max(0, i - 2)):
                    sx = cx + (k - (i - 3) / 2) * 34
                    d.ellipse([sx - 10, 128 + r * 0.45 - 10, sx + 10, 128 + r * 0.45 + 10], fill=LIGHT)
            else:
                d.polygon([(cx, 128 - r), (cx + r, 128), (cx, 128 + r), (cx - r, 128)], fill=GREY)
                for k in range(min(i + 1, 3)):
                    y = 128 - 26 + k * 26
                    d.line([(cx - r * 0.5, y), (cx + r * 0.5, y)], fill=LIGHT, width=12)
                for k in range(max(0, i - 2)):
                    a = math.tau * k / max(1, i - 2)
                    x, y = cx + math.cos(a) * r * 0.95, 128 + math.sin(a) * r * 0.95
                    d.polygon([(x, y - 18), (x + 14, y), (x, y + 18), (x - 14, y)], fill=LIGHT)
    return im


ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*", help="which pictures (all of them if none are given)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.75)
args = ap.parse_args()

os.makedirs(CONTROL, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
for name in args.names or SUBJECTS:
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(10)
    recipe, subject, size = SUBJECTS[name]
    out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
    control = os.path.join(CONTROL, f"{name}.png")
    plan(name, size).save(control)
    start = time.time()
    comfy.txt2img(recipe.format(subject=subject), out, seed=args.seed, control=control, strength=args.strength)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
