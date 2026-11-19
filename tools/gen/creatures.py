# /// script
# dependencies = ["pillow"]
# ///
"""Draws the wildlife of the worlds (creatures a pilot hunts on foot) with the image model: each kind
from five sides, as the races are drawn, and the things they drop.

  uv run tools/gen/creatures.py --plans               # only the plans, and a sheet of them at game size
  uv run tools/gen/creatures.py                       # every picture, into art/creatures/source
  uv run tools/gen/creatures.py woolhorn razorjaw     # only these kinds
  uv run tools/gen/creatures.py thornback --seed 3    # another try
  uv run tools/gen/creatures.py thornback --sides se --seed 2   # another try of one side
  uv run tools/gen/creatures.py --loot                # the sheet of what they drop (icons)

The outline of each kind is decided here, in game pixels, so they read beside the pilot at his true
size (he is 5 to 7 px tall): a critter smaller than him, grazers and hunters twice him, the rare beast
three times. Each plan is a grid of letters, one a game pixel, drawn up as a grey picture on black for
the model to follow (`D` is only ever a leg: tools/voxel/creatures.py moves the legs for the walk).
The model paints it; tools/voxel/creatures.py shrinks each picture back onto the same grid.

Every prompt is the subject followed by one shared style, so the whole set comes out in one look.
Change the recipe here, never a single prompt. The look follows art/mockups/creatures.png.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import os
import sys
import time

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "creatures", "source")
PLANS = os.path.join(ROOT, "art", "creatures", "plans")

# the greys of the parts in a plan (lighter is nearer, or brighter)
GREY = {
    "B": 150,  # the body: hide, shell, fur
    "L": 210,  # its light parts: a belly, a face, a mane, plates catching the light
    "D": 82,  # legs (and only legs)
    "E": 250,  # eyes
    "A": 182,  # horns, spines, claws, a glowing sac: what each kind is known by
    "M": 108,  # a mouth, jaws, a dark underside
}

# ── five sides each (the other three are these turned round): s faces the viewer, se three-quarters
#    towards him and to the right, e to the right, ne three-quarters away and to the right, n away.
#    Seen a little from above, as the pilot is: what is further off is higher on the screen.
SPRITES = {
    # a tiny six-legged scurrier with feelers: everywhere, harmless, quick
    "skitter": {
        "s": [".BBBB.", "DBBBBD", "DBBBBD", "DBEEBD", "A....A"],
        "se": ["..BBB.", ".BBBBB", "DBBBEE", "D.D.DA"],
        "e": ["..BBB.", ".BBBBB", "BBBBEA", "D.D.D."],
        "ne": [".A..A.", "..BBBB", ".BBBBB", "DBBBB.", "D.D.D."],
        "n": ["A....A", ".BBBB.", "DBBBBD", "DBBBBD", "D.LL.D"],
    },
    # a shaggy six-legged grazer with curled horns, in herds: runs from a pilot
    "woolhorn": {
        "s": ["..BBBBBB..", ".BBBBBBBB.", "BBBBBBBBBB", "BBBBBBBBBB", "ABBLLLLBBA", "A.LELLEL.A", "D..LMML..D", "D........D"],
        "se": [".BBBBBB...", "BBBBBBBBA.", "BBBBBBBBLA", "BBBBBBBLEL", ".BBBBBBLLM", ".D.D.D.D..", "D.D...D..."],
        "e": [".......AA.", ".BBBBBBALA", "BBBBBBBLLL", "BBBBBBBLEL", "BBBBBBB.LM", ".D.D.D.D..", ".D.D.D.D.."],
        "ne": ["......AA..", "..BBBBALA.", ".BBBBBBLLA", "BBBBBBBBB.", "BBBBBBBBB.", ".BBBBBBB..", "D.D.D.D..."],
        "n": ["A..LLLL..A", ".AALLLLAA.", "..BBBBBB..", ".BBBBBBBB.", "BBBBBBBBBB", "BBBBBBBBBB", "D.BBBBBB.D", "D........D"],
    },
    # a lean hunter with a ridge of blades down its back and a long jaw: stalks, then charges
    "razorjaw": {
        "s": ["..A..A..", ".BBBBBB.", "DBBBBBBD", "DBBBBBBD", "..BEEB..", "..LMML..", "..MMMM.."],
        "se": ["..A.A.A....", ".BBBBBBBB..", "DBBBBBBBBB.", "D.BBBBBBEB.", "..D.D.LMMMM", "..D.D..MMM."],
        "e": ["...A..A..A..", "..BBBBBBBBB.", "BBBBBBBBBBEB", "...LLLLLBMMM", "...D.D..D.D.", "..D..D.D..D."],
        "ne": ["........BEB", "..A.A.ABBBB", ".BBBBBBBBB.", "BBBBBBBBB..", "D.D..D.D...", "D.D..D.D..."],
        "n": ["..BEEB..", "..BBBB..", ".ABBBBA.", "DBBBBBBD", "DBABBABD", "D.BBBB.D", "...BB..."],
    },
    # a squat thing with a glowing sac at its throat: keeps its distance and spits globs
    "spitter": {
        "s": [".BBBBBB.", "BBEBBEBB", "BBBBBBBB", "BAAAAAAB", "DAAAAAAD", "D.AAAA.D"],
        "se": [".BBBBB..", "BBBBEBE.", "BBBBBBBB", "BBBAAAAB", "DBBAAAA.", "D.D.AA.."],
        "e": ["..BBBB..", ".BBBBBE.", "BBBBBBBM", "BBBBAAA.", ".BBAAAA.", ".D.D.D.."],
        "ne": ["...BBBB.", ".BBBBBBE", "BBBBBBBB", "BBBBBBBB", "DBBBBBB.", "D.D.D..."],
        "n": [".BBBBBB.", "BBBBBBBB", "BBLBBLBB", "BBBBBBBB", "DBBBBBBD", "D.BBBB.D"],
    },
    # a long plated crawler on many legs: slow to turn, hard to hurt, comes straight at a pilot
    "crawler": {
        "s": ["..BBB..", "D.BLB.D", "DBBLBBD", "D.BLB.D", "DBBLBBD", ".BEBEB.", "A.MMM.A"],
        "se": ["BBB........", "BBBBD......", "DBBBBBD....", "..DBBBBBD..", "....DBBBBEA", "......DBBBA"],
        "e": ["..LLLLLLLL..", ".BBBBBBBBBBA", "BBBBBBBBBBEA", "D.D.D.D.D.D.", ".D.D.D.D.D.."],
        "ne": ["......DBBBA", "....DBBBBEA", "..DBBBBBD..", "DBBBBBD....", "BBBBD......", "BBB........"],
        "n": ["A.BEB.A", "DBBLBBD", "D.BLB.D", "DBBLBBD", "D.BLB.D", "..BBB..", "...B..."],
    },
    # a wide shore crab with two great claws: by the water and in it, it guards its patch
    "reefclaw": {
        "s": ["..E....E..", ".BBBBBBBB.", "BBBBBBBBBB", "AABBBBBBAA", "AAD.DD.DAA", ".D......D."],
        "se": ["...E..E..", ".BBBBBBB.", "BBBBBBBBA", "ABBBBBBAA", "AAD.D.DAA", ".D.D.D..."],
        "e": ["...E.E..", ".BBBBBB.", "BBBBBBBA", "BBBBBBAA", "D.D.D.AA", ".D.D.D.."],
        "ne": [".BBBBBBB.", "BBBBBBBBA", "ABBBBBBAA", "AAD.D.D.A", ".D.D.D..."],
        "n": [".BBBBBBBB.", "BBBBBBBBBB", "AABBBBBBAA", "AAD.DD.DAA", ".D......D."],
    },
    # a rooted plant with a toothed bulb on a ring of leaves: it waits, and snaps at whatever comes close
    "snapweed": {
        "s": ["...LLL...", "..LAAAL..", ".LAMMMAL.", "..LAAAL..", "B..LLL..B", "BB.MMM.BB", ".BBBMBBB.", "BB.BBB.BB", ".B.....B."],
        # (its second picture: the bulb snapped open)
        "open": [".LL...LL.", "LAAL.LAAL", "LAMMMMMAL", ".LAMMMAL.", "B.LLLLL.B", "BB.MMM.BB", ".BBBMBBB.", "BB.BBB.BB", ".B.....B."],
    },
    # the rare one: a great beast plated in spines, slow to anger and terrible when it is
    "thornback": {
        "s": [".A.A.A.A.A.A.", "AABABABABABAA", ".BBBBBBBBBBB.", "BBBBBBBBBBBBB", "BBBBBBBBBBBBB", "DBBBLLLLLBBBD", "DBBLELLLELBBD", "DD.LLMMMLL.DD", "DD.AMMMMMA.DD", "....A...A...."],
        "se": ["..A.A.A.A.....", ".AABABABAA....", "BBBBBBBBBBB...", "BBBBBBBBBBBBA.", "BBBBBBBBBBBELA", "BBBBBBBBBBBLLM", "DBBBBBBBBBLMMA", "DD.DD.DD.DD.A.", "DD.DD.DD.DD..."],
        "e": ["....A.A.A.A....", "...AABABABAA...", "..BBBBBBBBBBB..", ".BBBBBBBBBBBBBA", "BBBBBBBBBBBBBEL", "BBBBBBBBBBBBLLM", "BLLLLLLLLLBBLMM", ".DD.DD...DD.DD.", ".DD.DD...DD.DD.", "DD..DD..DD..DD."],
        "ne": ["........BELA.", "...A.A.ABBLLA", "..AABABBBBBB.", ".BBBBBBBBBBB.", "BBBBBBBBBBBB.", "BBBBBBBBBBBB.", "DBBBBBBBBBB..", "DD.DD.DD.DD..", "DD.DD.DD.DD.."],
        "n": ["....LLLLL....", "...ALLLLLA...", ".A.ABBBBBA.A.", "AABABABABABAA", "BBBBBBBBBBBBB", "BBBBBBBBBBBBB", "DBBBBBBBBBBBD", "DBBBBBBBBBBBD", "DD.BBBBBBB.DD", "DD.........DD"],
    },
}

STYLE = (
    "pixel art game sprite, a tiny creature for a 16-bit top-down action role playing game seen from slightly above, "
    "{subject}, {pose}, crisp chunky pixels, limited colour palette, bold readable shapes, strong dark outline, hard edges, "
    "no anti-aliasing, no blur, one creature, whole creature in frame and centred, plain flat black background, no text"
)
# each its own design: alien wildlife, nothing from a film or another game
SUBJECTS = {
    "skitter": "a tiny alien critter like a beetle crossed with a mouse, a round rusty orange back with a pale stripe, six thin black legs and two long feelers, two shiny black eyes",
    "woolhorn": "an alien grazing beast with six short legs, a deep shaggy coat of dark umber brown wool, a pale cream face with a short muzzle and two thick ivory horns curling forward round its face",
    "razorjaw": "a lean alien hunting beast, long and low, slate blue grey hide with dark violet stripes, a ridge of pale bone blades along its spine, a long narrow snout full of white teeth, two glowing amber eyes",
    "spitter": "a squat toad shaped alien with mottled olive and purple skin, thick stubby legs, two small yellow eyes on top and a big swollen glowing acid green sac at its throat",
    "crawler": "a long alien crawler like a giant armoured centipede, overlapping plates of dark bronze armour with pale gold edges, many short red legs along its sides, two curved mandibles at its head",
    "reefclaw": "an alien shore crab with a wide flat shell of coral red and white spots, two huge pale blue claws held forward, eyes on short stalks",
    "snapweed": "a carnivorous alien plant, a rosette of wide spiky teal leaves on the ground and in its middle a round magenta flower bulb lined with sharp white teeth",
    "thornback": "a huge rare alien beast, heavy and armoured, charcoal black plated hide covered in rows of glowing orange spines, two great curved ivory tusks, small fierce red eyes",
}
VIEWS = {
    "s": "front view facing the viewer",
    "se": "three-quarter front view turned to the right",
    "e": "side view facing right",
    "ne": "three-quarter back view turned away to the right",
    "n": "back view facing away from the viewer",
    "open": "its toothed bulb snapped wide open to bite, seen from slightly above",
}
POSE = {"snapweed": {"s": "its toothed bulb closed, seen from slightly above"}}

# ── what they drop: one sheet of icons (cut out and shrunk to 16 px for the menus and to a few px on the
#    ground by tools/voxel/creatures.py), the way the loot icons of Phase 4 were made (art/mockups/loot-icons.png)
LOOT = (
    "a sprite sheet of four item icons for a pixel art space game, each centred in its own dark square tile with a thin border, "
    "in a row: a folded bundle of shaggy brown animal hide tied with a cord, a curved shard of glossy bronze armour plate, "
    "a small glowing acid green gland like a jelly bean, a pulsing blood red gemstone with a bright highlight"
)


def grid_plan(rows, cells, size):
    """a plan of letters (one a game pixel) as a grey picture `size` square: each letter a block `cells` px across, centred"""
    h = len(rows)
    w = max(len(r) for r in rows)
    im = Image.new("L", (w, h), 0)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".":
                im.putpixel((x, y), GREY[ch])
    big = im.resize((w * cells, h * cells), Image.NEAREST)
    out = Image.new("L", (size, size), 0)
    out.paste(big, ((size - w * cells) // 2, (size - h * cells) // 2))
    return out.convert("RGB")


def cells_of(rows):
    """px a letter takes in a plan's picture (tools/voxel/creatures.py reads it back the same way)"""
    return 860 // max(len(rows) + 2, max(len(r) for r in rows) + 2)


def plans():
    """every plan as a guide picture for the model, and a sheet of them all at game size to judge (beside a pilot)"""
    os.makedirs(PLANS, exist_ok=True)
    for kind, sides in SPRITES.items():
        for side, rows in sides.items():
            grid_plan(rows, cells_of(rows), 1024).save(os.path.join(PLANS, f"{kind}-{side}.png"))
    sheet = Image.new("RGB", (220, len(SPRITES) * 16), (58, 92, 52))
    pilot = [".HHH.", "HVVVH", "STSTS", ".SSS.", ".D.D."]
    for i, (kind, sides) in enumerate(SPRITES.items()):
        x = 4
        for y, row in enumerate(pilot):
            for c, ch in enumerate(row):
                if ch != ".":
                    sheet.putpixel((x + c, 3 + i * 16 + y), (230, 230, 230))
        x += 9
        for side, rows in sides.items():
            for y, row in enumerate(rows):
                for c, ch in enumerate(row):
                    if ch != ".":
                        v = GREY[ch]
                        sheet.putpixel((x + c, 3 + i * 16 + y), (v, v, v))
            x += max(len(r) for r in rows) + 3
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(os.path.join(PLANS, "sheet.png"))


def wait():
    import comfy

    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(3)


def generate(kind, seed, strength, sides=None):
    import comfy

    for side in sides or SPRITES[kind]:
        pose = POSE.get(kind, {}).get(side, VIEWS[side])
        prompt = STYLE.format(subject=SUBJECTS[kind], pose=pose)
        wait()
        out = os.path.join(OUT, f"{kind}-{side}" + (f"-{seed}" if seed != 1 else "") + ".png")
        start = time.time()
        comfy.txt2img(prompt, out, seed=seed, control=os.path.join(PLANS, f"{kind}-{side}.png"), strength=strength)
        print(f"{kind}-{side}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)", flush=True)


def loot(seed):
    import comfy

    wait()
    out = os.path.join(OUT, "loot" + (f"-{seed}" if seed != 1 else "") + ".png")
    comfy.txt2img(LOOT, out, seed=seed, width=1280, height=384)
    print(f"loot: {os.path.relpath(out, ROOT)}", flush=True)


ap = argparse.ArgumentParser()
ap.add_argument("kinds", nargs="*", help="which kinds (all if none are given)")
ap.add_argument("--plans", action="store_true", help="only draw the plans")
ap.add_argument("--loot", action="store_true", help="only the sheet of what they drop")
ap.add_argument("--sides", nargs="*", help="only these sides (s se e ne n open)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.8)
args = ap.parse_args()

if __name__ == "__main__":
    plans()
    if args.loot:
        loot(args.seed)
    elif not args.plans:
        for kind in args.kinds or SPRITES:
            generate(kind, args.seed, args.strength, args.sides)
