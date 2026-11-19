# /// script
# dependencies = ["pillow", "numpy"]
# ///
"""Draws the game's logo and wordmark (Xenophon: Twin Stars) with the image model.

  uv run tools/gen/brand.py mockups --seeds 3      # loose ideas for the brand, into art/mockups/brand-*.png
  uv run tools/gen/brand.py guides                 # the grey plans the model follows, into art/brand/guides
  uv run tools/gen/brand.py mark --seeds 6         # the mark drawn over its plan, into art/brand/tries/mark-b-*
                                                   # (mark-1 … 6 were an earlier plan, with round suns and no rays)
  uv run tools/gen/brand.py word --seeds 6         # the letters drawn over their plan
  uv run tools/gen/brand.py sky --seeds 6          # the banner's sky: stars and the two suns
  uv run tools/gen/brand.py og-sky --seeds 4       # the same sky the shape of a link's picture (1.9 to 1)

One recipe, one style shared by everything drawn with it (BRAND): change the recipe here, never a single
prompt. The letters' plan is drawn here on the wordmark's own pixel grid (word_plan), so the model paints
letters that are already the right shape and tools/voxel/brand.py can keep their outline exactly.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import math
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MOCKUPS = os.path.join(ROOT, "art", "mockups")
TRIES = os.path.join(ROOT, "art", "brand", "tries")
GUIDES = os.path.join(ROOT, "art", "brand", "guides")

# the look shared by every piece: old bronze and gold, hard science fiction, chunky pixels
BRAND = (
    "{subject}, crisp chunky pixel art, 16-bit era, limited colour palette of polished bronze, gold, deep red and "
    "black, hard edges, no anti-aliasing, no blur, lit from the top left, ancient Greek restraint married to hard "
    "science fiction, bold readable silhouette"
)
ON_BLACK = "centred on a plain flat black background"

# loose ideas, drawn with no plan, to choose a direction from
IDEAS = {
    "brand-shield": "a game logo emblem: a round bronze hoplite shield seen face on, a Greek key meander border round "
    "its rim, on its face two suns in conjunction, one large gold sun and one smaller deep red dwarf sun overlapping "
    "it, and a sharp angular wedge-shaped spaceship silhouette in black diving across them, " + ON_BLACK + ", no text",
    "brand-coin": "a game logo emblem: an ancient Greek silver and bronze coin, a tetradrachm, struck with a sharp "
    "angular dagger-shaped spaceship in profile, two small suns above it, one gold and one red, a dotted beaded rim, "
    + ON_BLACK + ", no text",
    "brand-helm": "a game logo emblem: a bronze Corinthian helmet seen from the front whose shape is a pointed angular "
    "spaceship prow, its eye slits glowing gold, a crest of red, a gold sun and a red sun behind it, "
    + ON_BLACK + ", no text",
    "brand-title": "a video game title logo, the word XENOPHON in large angular gilded bronze capital letters with "
    "sharp chiselled serifs, the words TWIN STARS smaller beneath in red gold, a thin Greek key meander rule between "
    "them, a gold sun and a red sun glinting behind the letters, " + ON_BLACK,
    "brand-banner": "a wide banner for a space game: a black starfield, a large gold sun on the left and a smaller "
    "deep red dwarf sun on the right, between them a scatter of tiny planets, a sharp angular spaceship crossing, "
    "the title XENOPHON in large gilded bronze capitals in the middle with TWIN STARS smaller beneath",
}
WIDE = {"brand-banner", "brand-title"}

# the pieces drawn over a plan
SUBJECTS = {
    "mark": "a game logo emblem: a round polished bronze hoplite shield seen face on, a raised Greek key meander border "
    "round its rim, on its embossed bronze face two suns in conjunction, a flat gold sun with sixteen sharp pointed "
    "rays like the Vergina sun and a smaller flat deep red dwarf sun overlapping its edge, a sharp angular dark "
    "gunmetal spaceship seen from above diving across them, hard science fiction, armour plates and thin gold trim, "
    "twin engine nozzles glowing gold, " + ON_BLACK + ", no text, no letters",
    "word": "a video game title logo, the word XENOPHON in large angular gilded bronze capital letters, polished gold "
    "on top shading to deep red bronze at the bottom, bevelled edges catching light, a dark outline, the words "
    "TWIN STARS beneath in smaller gold letters, " + ON_BLACK,
    # (the link's picture: the suns smaller and out at the edges, so the shield and the name fit the dark between them)
    "og-sky": "a wide view of deep black space full of tiny stars, a glowing gold sun at the far left edge, partly "
    "cut off by it, with a granular surface and a soft corona, a smaller deep red dwarf sun at the far right edge, "
    "faint dust, a wide empty dark middle taking most of the picture, no text, no spaceships",
    "sky": "a wide view of deep black space full of tiny stars, a large glowing gold sun on the left with a granular "
    "surface and a soft corona, a smaller deep red dwarf sun on the right, faint dust between them, a few tiny distant "
    "planets, empty dark middle, no text, no spaceships",
}

# the wordmark's own pixel grid: the letters as the game shows them (tools/voxel/brand.py keeps this outline)
WORD_W, WORD_H = 336, 64
CELL = 4  # the plan is drawn at this many picture pixels to a letter pixel (336 by 64 becomes 1344 by 256)


def wait_turn():
    while comfy.busy():
        print("  ComfyUI is busy with other work; waiting", flush=True)
        time.sleep(15)


def draw(name, prompt, seeds, width=1024, height=1024, control=None, strength=0.8, out=TRIES):
    for seed in seeds:
        path = os.path.join(out, f"{name}-{seed}.png")
        if os.path.exists(path):
            continue
        wait_turn()
        t = time.time()
        comfy.txt2img(prompt, path, seed=seed, width=width, height=height, control=control, strength=strength)
        print(f"  {os.path.relpath(path, ROOT)} ({time.time() - t:.0f}s)", flush=True)


# ── the plans


# the letters: a classical bold serif (cut in stone, as the mockup brand-title-2 has them), each letter shrunk
# on its own to the grid so its stems land on whole pixels; Times New Roman Bold from Windows, only for the plan
SERIF = "/mnt/c/Windows/Fonts/timesbd.ttf"


def letters(text, cap, track, bold=0):
    """one line of capitals as a pixel mask `cap` px tall, `track` px between letters; `bold` px added to
    every stem's width (the hairlines of a serif are too thin to shade at this size)"""
    big = 10
    font = ImageFont.truetype(SERIF, int(cap * big * 1.45))
    hb = font.getbbox("H")
    parts = []
    for ch in text:
        if ch == " ":
            parts.append(np.zeros((cap, cap // 2), bool))
            continue
        bb = font.getbbox(ch)
        im = Image.new("L", (bb[2] + 40, hb[3] + 40), 0)
        ImageDraw.Draw(im).text((20 - bb[0], 20), ch, font=font, fill=255)
        a = np.asarray(im) > 127
        a = a[20 + hb[1] : 20 + hb[3]]
        cols = np.nonzero(a.any(0))[0]
        a = a[:, cols.min() : cols.max() + 1]
        cell = a.shape[0] / cap
        w = max(1, int(round(a.shape[1] / cell)))
        small = np.zeros((cap, w + bold), bool)
        for k in range(cap):
            for i in range(w):
                patch = a[int(k * cell) : int((k + 1) * cell), int(i * cell) : max(int((i + 1) * cell), int(i * cell) + 1)]
                small[k, i] = patch.mean() > 0.42
        for b in range(bold):
            small[:, 1:] |= small[:, :-1].copy()
        parts.append(small)
        parts.append(np.zeros((cap, track), bool))
    return np.concatenate(parts[:-1], axis=1)


def meander(width):
    """a Greek key, one turn to a unit of six pixels, five rows tall; `width` is a whole number of units and one"""
    unit = np.array([[1, 1, 1, 1, 1, 0], [1, 0, 0, 0, 1, 0], [1, 0, 1, 1, 1, 0], [1, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1]], bool)
    key = np.tile(unit, (1, width // 6))
    return np.concatenate([key, unit[:, :1]], axis=1)  # the last turn closed


def word_plan():
    """the wordmark on its pixel grid: XENOPHON, and under it TWIN STARS between two runs of Greek key.
    0 nothing, 1 the large letters, 2 the small, 3 the key"""
    big = letters("XENOPHON", 34, 4, bold=1)
    small = letters("TWIN STARS", 13, 2)
    plan = np.zeros((WORD_H, WORD_W), np.uint8)
    y0 = 4
    x0 = (WORD_W - big.shape[1]) // 2
    plan[y0 : y0 + big.shape[0], x0 : x0 + big.shape[1]][big] = 1
    ys = y0 + big.shape[0] + 6
    xs = (WORD_W - small.shape[1]) // 2
    plan[ys : ys + small.shape[0], xs : xs + small.shape[1]][small] = 2
    # the key either side of the small line, from the large line's ends to a little short of the small one
    run = (xs - 8 - x0) // 6 * 6 + 1
    key = meander(run)
    ky = ys + (small.shape[0] - key.shape[0]) // 2
    plan[ky : ky + 5, xs - 8 - run : xs - 8][key] = 3
    plan[ky : ky + 5, xs + small.shape[1] + 8 : xs + small.shape[1] + 8 + run][key[:, ::-1]] = 3
    return plan


def mark_plan(size=1024):
    """the mark's plan in greys: a shield's rim, its face, the gold sun with the red dwarf over its edge, and a
    long wedge of a ship diving up and to the right across them"""
    im = Image.new("RGB", (size, size), (0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2
    r = size * 0.45
    d.ellipse([c - r, c - r, c + r, c + r], fill=(150, 150, 150))
    ri = r * 0.8
    d.ellipse([c - ri, c - ri, c + ri, c + ri], fill=(60, 60, 60))
    gs, gx, gy = r * 0.3, c - r * 0.14, c - r * 0.12
    # the gold sun as the Vergina star: sixteen rays, long and short in turn
    for k in range(16):
        a = k * math.pi / 8
        reach = gs * (1.75 if k % 2 == 0 else 1.45)
        half = math.pi / 16 * 0.9
        d.polygon([(gx + gs * 0.9 * math.cos(a - half), gy + gs * 0.9 * math.sin(a - half)),
                   (gx + reach * math.cos(a), gy + reach * math.sin(a)),
                   (gx + gs * 0.9 * math.cos(a + half), gy + gs * 0.9 * math.sin(a + half))], fill=(200, 200, 200))
    d.ellipse([gx - gs, gy - gs, gx + gs, gy + gs], fill=(230, 230, 230))
    rs, rx, ry = r * 0.24, c + r * 0.24, c + r * 0.02
    d.ellipse([rx - rs * 1.12, ry - rs * 1.12, rx + rs * 1.12, ry + rs * 1.12], fill=(60, 60, 60))
    d.ellipse([rx - rs, ry - rs, rx + rs, ry + rs], fill=(175, 175, 175))
    # the ship, drawn pointing up and then turned: a spear's head, a needle nose on a long blade of a hull, short
    # blades swept back at its tail, two nozzles (no wings: it is not an aircraft)
    s = r * 0.9
    ship = [(0, -0.85), (0.08, -0.3), (0.15, 0.18), (0.24, 0.52), (0.09, 0.44), (0.07, 0.6), (0, 0.5),
            (-0.07, 0.6), (-0.09, 0.44), (-0.24, 0.52), (-0.15, 0.18), (-0.08, -0.3)]
    turn = math.radians(38)
    cx, cy = c + r * 0.04, c + r * 0.12

    def place(pts, k=1.0, lift=0.0):
        out = []
        for x, y in pts:
            x, y = x * s * k, (y + lift) * s * k
            out.append((cx + x * math.cos(turn) - y * math.sin(turn), cy + x * math.sin(turn) + y * math.cos(turn)))
        return out

    d.polygon(place(ship, 1.08, 0.0), fill=(0, 0, 0))
    d.polygon(place(ship), fill=(100, 100, 100))
    # the lit half of the hull, its spine, a slot of a canopy, plates, and the two nozzles
    d.polygon(place([(0, -0.85), (-0.08, -0.3), (-0.15, 0.18), (-0.24, 0.52), (-0.09, 0.44), (0, 0.46)]), fill=(140, 140, 140))
    d.polygon(place([(0, -0.8), (0.02, -0.3), (0.025, 0.42), (0, 0.46)]), fill=(205, 205, 205))
    d.polygon(place([(0, -0.42), (0.035, -0.26), (0, -0.1), (-0.035, -0.26)]), fill=(30, 30, 30))
    for y in (0.0, 0.2):
        d.line(place([(-0.12 - y * 0.25, y), (0.12 + y * 0.25, y)]), fill=(45, 45, 45), width=max(2, size // 200))
    for side in (-1, 1):
        d.polygon(place([(side * 0.035, 0.5), (side * 0.085, 0.5), (side * 0.075, 0.6), (side * 0.045, 0.6)]), fill=(240, 240, 240))
    return im


def make_guides():
    os.makedirs(GUIDES, exist_ok=True)
    plan = word_plan()
    tones = np.array([0, 210, 170, 120], np.uint8)
    native = Image.fromarray(tones[plan], "L")
    native.save(os.path.join(GUIDES, "word-plan.png"))
    # the model's picture: the plan blown up on its grid (both sides multiples of 16)
    big = native.resize((WORD_W * CELL, WORD_H * CELL), Image.NEAREST)
    big.convert("RGB").save(os.path.join(GUIDES, "word-control.png"))
    np.save(os.path.join(GUIDES, "word-plan.npy"), plan)
    mark_plan().save(os.path.join(GUIDES, "mark-control.png"))
    print("guides in", os.path.relpath(GUIDES, ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("what", choices=["mockups", "guides", "mark", "word", "sky", "og-sky"])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--first", type=int, default=1)
    ap.add_argument("--strength", type=float, default=0.8)
    a = ap.parse_args()
    seeds = range(a.first, a.first + a.seeds)
    if a.what == "guides":
        make_guides()
    elif a.what == "mockups":
        for name, subject in IDEAS.items():
            if a.names and name not in a.names:
                continue
            w, h = (1344, 768) if name in WIDE else (1024, 1024)
            for seed in seeds:
                path = os.path.join(MOCKUPS, f"{name}-{seed}.png")
                if os.path.exists(path):
                    continue
                wait_turn()
                comfy.txt2img(BRAND.format(subject=subject), path, seed=seed, width=w, height=h)
                print(" ", os.path.relpath(path, ROOT), flush=True)
    elif a.what == "mark":
        draw("mark-b", BRAND.format(subject=SUBJECTS["mark"]), seeds, control=os.path.join(GUIDES, "mark-control.png"), strength=a.strength)
    elif a.what == "word":
        draw("word", BRAND.format(subject=SUBJECTS["word"]), seeds, control=os.path.join(GUIDES, "word-control.png"), strength=a.strength)
    elif a.what == "sky":
        draw("sky", BRAND.format(subject=SUBJECTS["sky"]), seeds, width=1280, height=400)
    elif a.what == "og-sky":
        # (the picture a link to the site shows, static/brand/og.png: 1200 by 630, drawn at 1216 by 640)
        draw("og-sky", BRAND.format(subject=SUBJECTS["og-sky"]), seeds, width=1216, height=640)


if __name__ == "__main__":
    main()
