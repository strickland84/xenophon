# /// script
# dependencies = ["pillow"]
# ///
"""Draws the interface's pictures with the image model (the polish pass, items 2 and 10): each side's
emblem (the Nomarchy's seal, a triangle; the Anarchoi's patched sail, a diamond), each side's home for the
side cards, and the interface's icons (the menu, the tabs, the touch buttons).

  uv run tools/gen/interface.py emblems --seeds 8     # several tries of each emblem, into art/interface/source
  uv run tools/gen/interface.py homes --seeds 4
  uv run tools/gen/interface.py intro --seeds 4       # the opening story's sky and its stars
  uv run tools/gen/interface.py icons                 # one try of every icon
  uv run tools/gen/interface.py icons map chat --seeds 3

One recipe, one style shared by everything drawn with it, so a set comes out in one look: change the
recipe here, never a single prompt. Emblems follow a grey plan of their outline on black
(art/interface/control), which also cuts them out afterwards. tools/voxel/interface.py chooses among
the tries (PICKS) and shrinks them into game pixels for the page (static/emblems, static/ui).

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
OUT = os.path.join(ROOT, "art", "interface", "source")
CONTROL = os.path.join(ROOT, "art", "interface", "control")

# a side's emblem: a crest a player wants to fly under, its outline the side's mark
EMBLEM = (
    "a faction emblem crest for a pixel art space game, {subject}, one single emblem centred on a plain flat black "
    "background, crisp chunky pixels, 16-bit era, limited colour palette, hard edges, no anti-aliasing, no blur, "
    "lit from the top left, bold readable silhouette, no text, no letters"
)
# a side's home, for its card on the first screens
HOME = (
    "pixel art illustration for a space game, {subject}, wide cinematic view, crisp chunky pixels, 16-bit era, "
    "limited colour palette, hard edges, no anti-aliasing, deep black space with a few distant stars, no text"
)
# a place on a world's ground, for its screen: the same look as a side's home
HOME_GROUND = (
    "pixel art illustration for a space game, {subject}, wide cinematic view from a little above, crisp chunky pixels, "
    "16-bit era, limited colour palette, hard edges, no anti-aliasing, dusk sky, no text"
)
# an icon of the interface
ICON = (
    "a single pixel art game interface icon of {subject}, one bold simple object centred on a plain flat black "
    "background, chunky pixels, 16-bit era, thick dark outline, limited colour palette of {palette}, hard edges, "
    "no anti-aliasing, no blur, lit from the top left, readable at a tiny size, no text, no letters"
)
# the icons' palette: the menus' cream ink and a little of each side's gold, on steel; an item's is its own
STEEL = "cream white, pale steel grey and warm gold"
GEAR = "gunmetal grey and steel with one bright accent colour"

NOMARCHY_SEAL = (
    "the emblem of the Nomarchy, a proud formal faction of old noble houses, law and trade: an upright triangle seal "
    "of polished gold with a thick bevelled gold rim, an ivory enamel field inside it, at its heart an engraved gold "
    "ring holding a small four-pointed star, fine engraved gold lines along its sides, like the seal on a royal deed"
)
NOMARCHY_SEAL_2 = (
    "the emblem of the Nomarchy, a stately faction of law and trade: a triangular gold crest pointing up, a heavy "
    "polished gold frame, an ivory inner triangle, a small gold orbit ring and star engraved in the middle, three "
    "gold rivets at its corners, dignified, formal and expensive"
)
NOMARCHY_SEAL_3 = (
    "the emblem of the Nomarchy, the old founding houses who own the stars by deed: an equilateral triangle crest with a "
    "flat bottom edge, its thick polished gold frame engraved with fine lines, a deep navy blue inner border, an ivory "
    "enamel field, at its heart a gold ring station seen from the front with a small bright star above it, two small "
    "gold laurel sprigs along the bottom edge, rich, proud and formal heraldry"
)
ANARCHOI_SAIL = (
    "the emblem of the Anarchoi, a scrappy free faction of salvagers and raiders: a diamond shaped sail patched together "
    "from violet and rust brown cloth scraps, big crude stitches between the patches, metal grommets at its four "
    "corners, a rope lashed round its edge, a bent rusty metal spar across it, worn, improvised and proud"
)
ANARCHOI_SAIL_2 = (
    "the emblem of the Anarchoi, a band of free salvagers: a diamond kite sail of stitched violet patches on a rust "
    "brown frame of welded scrap metal, hazard stripes on one patch, rivets along the seams, a frayed rope tail, "
    "rough, loud and improvised"
)

# name: (recipe, subject, size, plan or None)
SUBJECTS = {
    "emblem-nomarchy": (EMBLEM, NOMARCHY_SEAL, (1024, 1024), "triangle"),
    "emblem-nomarchy-b": (EMBLEM, NOMARCHY_SEAL_2, (1024, 1024), "triangle"),
    "emblem-nomarchy-c": (EMBLEM, NOMARCHY_SEAL_3, (1024, 1024), "triangle"),
    "emblem-anarchoi": (EMBLEM, ANARCHOI_SAIL, (1024, 1024), "diamond"),
    "emblem-anarchoi-b": (EMBLEM, ANARCHOI_SAIL_2, (1024, 1024), "diamond"),
    "home-nomarchy": (
        HOME,
        "Meridian Ring, the Nomarchy's capital: a gleaming gold and ivory ring shaped space station of domes and slender "
        "spires orbiting a huge bright golden sun on the right, three sleek pointed angular starfighters flying in neat "
        "formation past it, orderly, rich and proud",
        (1024, 576),
        None,
    ),
    "home-anarchoi": (
        HOME,
        "the Raft, the Anarchoi's capital: a ramshackle flotilla of rusty welded spaceship hulks lashed together with cables "
        "and scaffolding, strings of warm orange lanterns and violet signal lights, a huge dim red dwarf sun behind it on "
        "the right, scrappy pointed angular starfighters darting round it, rough and alive",
        (1024, 576),
        None,
    ),
    # a base's own picture, over its screen (the last pass: the base's screen was plain beside the rest)
    "home-base-nomarchy": (
        HOME_GROUND,
        "a Nomarchy military base on a green island world: neat gold and ivory hangars and a command tower, landing pads "
        "marked in yellow and black, gun turrets, orderly and proud, no aircraft, no ships",
        (1024, 576),
        None,
    ),
    "home-base-anarchoi": (
        HOME_GROUND,
        "an Anarchoi base on a dusty world: ramshackle hangars welded from rusty hull plates, violet and orange signal lights, "
        "landing pads marked with hazard stripes, scaffolding and cables, no aircraft, no ships",
        (1024, 576),
        None,
    ),
    "home-base-outpost": (
        HOME_GROUND,
        "a small lonely neutral mining outpost on a rocky world: one landing pad marked in yellow and black, a radar mast, "
        "fuel tanks and ore crates, a single prefab hut with a lit window",
        (1024, 576),
        None,
    ),
    # the opening story's sky (IntroCrawl.svelte): deep space with room in its middle for the words, the two sides'
    # suns far off at either end; and a field of stars alone, cut out to drift in front of it
    "intro-sky": (
        HOME,
        "a vast deep space panorama, a broad glittering band of countless tiny stars and dark dust lanes crossing the "
        "whole sky diagonally like a galaxy seen edge on, soft golden gas clouds on the left round a small distant golden "
        "sun, ragged violet and rust nebula clouds on the right round a small distant dim red sun, rich and beautiful, "
        "the middle of the sky darker",
        (1792, 768),
        None,
    ),
    "intro-stars": (
        HOME,
        "only a sparse field of tiny scattered stars on flat pure black, single white and pale blue and pale gold star "
        "pixels, a few brighter four pointed stars, nothing else, no nebula, no planets",
        (1792, 768),
        None,
    ),
}

# the interface's icons: what each shows (in the menus, the tabs and the touch buttons)
ICONS = {
    # the menu
    "map": "a folded star chart map with a dotted route line",
    "board": "a war banner pinned on a board with a small bar chart",
    "pilots": "two pilot helmets side by side",
    "sheet": "a pilot's identity card with a small helmet portrait",
    "squad": "three small arrowhead starships seen from above flying in a V formation, noses up",
    "settings": "a cog wheel",
    "key": "an old fashioned key",
    "ghost": "a pale see-through ghostly starfighter with a faint trail",
    "relays": "a radio mast sending signal arcs",
    "look": "a painter's palette with three dabs of bright paint and a small brush across it",
    "story": "an old rolled parchment scroll, half unrolled, tied with a gold cord",
    # the base's and the shop's tabs
    "hold": "an open cargo crate full of ore",
    "market": "a pair of brass weighing scales",
    "supplies": "a wrench crossed with a missile",
    "parts": "a metal engine part with bolts",
    "paint": "a paint can with a brush",
    "ships": "a small angular starfighter seen from directly above, nose up, with two swept wings, a dark cockpit canopy in its middle and two glowing engine nozzles at its tail, clearly a spaceship and not an arrow",
    "gear": "a pilot's backpack with straps",
    "furniture": "a small armchair",
    # the settings' tabs
    "controls": "a game controller",
    "sound": "a loudspeaker with sound waves",
    "picture": "a small framed landscape picture",
    "music": "two musical eighth notes joined by a thick beam",
    # the top row's full screen button (James, 2026-11-19: "simulate F11")
    "fullscreen": "a full screen symbol: four thick right-angled corner brackets at the corners of a square, each pointing outwards, with a small glowing screen in the middle",
    # the page shown to a phone or a tablet instead of the game (it is for a desktop: James, 2026-11-19)
    "desktop": "a desktop computer: a square monitor on a short stand, a flat keyboard in front of it and a mouse beside it",
    # the touch buttons
    "fire": "a gun crosshair reticle",
    "missile": "a missile pointing up with a small flame",
    "boost": "a jet engine flame pointing down, three chevrons",
    "roll": "a curved arrow spinning round in a circle",
    "action": "a hand pressing a round button",
    "view": "an eye",
    "chat": "a speech bubble",
    "menu": "three horizontal bars",
    "bag": "a pilot's backpack",
    "climb": "a thick arrow pointing up",
    "dive": "a thick arrow pointing down",
    "flare": "a signal flare shooting up a bright spark",
    "beacon": "a small signal beacon post with a light on top",
    "run": "a running boot with speed lines",
    "cruise": "a starfighter with long streaks of speed behind it",
    "power": "a round power switch symbol, a circle broken at the top with a short upright bar through the gap, glowing",
    # (out of the seat in flight and back to it: James, 2026-11-18, "walk around the ship when its flying")
    "seat": "a high backed starfighter pilot's seat with a padded headrest and harness straps, seen from the side",
    # the pointer (the page's cursor) and the maps' marks (the last pass: they were drawn in code)
    "cursor": "a mouse pointer arrow cursor, a sharp arrowhead pointing up and to the top left with a short tail, cream white with a thick dark outline",
    "mark-station": "a small ring shaped space station with a glowing hub, seen from directly above",
    "mark-gate": "a jump gate: a thick metal ring with a glowing blue portal inside it, seen from the front",
    "mark-derelict": "a single small broken spaceship wreck seen from directly above, its pointed hull snapped in two with a jagged gap, dark grey metal with glowing red cracks",
    "mark-raiders": "a menacing red skull",
    "mark-hotspot": "a blazing orange and gold four pointed star with short rays, hot like molten ore",
}
# the things a pilot fits and wears, in their own colours (the loadout bench, the shop)
ITEMS = {
    "w-cannon": "a short twin barrelled starfighter autocannon",
    "w-flak": "a stubby wide mouthed flak cannon with a drum magazine",
    "w-laser": "a mining laser emitter with a glowing red crystal lens",
    "w-rack": "a rack of four small missiles side by side",
    "w-mines": "a round spiked space mine with a red light",
    "m-afterburner": "a fuel tank with an orange flame nozzle",
    "m-shield-booster": "a glowing blue energy shield generator",
    "m-cargo-pod": "a boxy cargo container pod with handles",
    "m-scanner": "a small radar dish on a mast",
    "m-tractor": "a tractor beam emitter with a green beam",
    "m-cruise-drive": "a long engine with blue thruster rings",
    "m-heat-sink": "a heat sink block of cooling fins, frosty blue",
    "m-armour": "a thick riveted armour plate",
    "g-cutter": "a small hand held plasma cutter tool",
    "g-power-cutter": "a larger heavy plasma cutter tool with a battery",
    "g-plasma-cutter": "a big glowing orange plasma cutter tool",
    "g-blaster": "a small sci-fi blaster pistol",
    "g-launcher": "a shoulder rocket launcher tube",
    "g-plain": "a plain grey pilot flight suit",
    "g-heat-lining": "a pilot flight suit with glowing orange heat lining",
    "g-cold-lining": "a pilot flight suit with thick white fur lining",
    "g-pack-4": "a small pilot backpack",
    "g-pack-6": "a medium pilot backpack with pouches",
    "g-pack-8": "a large expedition backpack with many pouches",
    "g-flares": "a bundle of red signal flares",
    "g-cover": "a camouflage cloak with leaf pattern",
}

GREY = 150
LIGHT = 205
DARK = 95


def plan(kind, size):
    """the grey plan of an emblem's outline on black, for the model to follow"""
    w, h = size
    im = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = w / 2, h / 2
    if kind == "triangle":
        # an upright triangle (the Nomarchy's mark), a rim round a field, a ring at its heart
        r = w * 0.42
        pts = [(cx + r * math.cos(a), cy + 40 + r * math.sin(a)) for a in (-math.pi / 2, math.pi / 6, math.pi * 5 / 6)]
        d.polygon(pts, fill=GREY)
        inner = [(cx + (x - cx) * 0.78, cy + 40 + (y - cy - 40) * 0.78) for x, y in pts]
        d.polygon(inner, fill=LIGHT)
        d.ellipse([cx - 95, cy + 40 - 95, cx + 95, cy + 40 + 95], outline=DARK, width=26)
    else:
        # a diamond (the Anarchoi's mark), patches inside it, a spar across
        rx, ry = w * 0.36, h * 0.44
        pts = [(cx, cy - ry), (cx + rx, cy), (cx, cy + ry), (cx - rx, cy)]
        d.polygon(pts, fill=GREY)
        d.polygon([(cx, cy - ry * 0.8), (cx + rx * 0.5, cy - ry * 0.3), (cx, cy + ry * 0.1), (cx - rx * 0.35, cy - ry * 0.3)], fill=LIGHT)
        d.polygon([(cx - rx * 0.7, cy + 10), (cx - rx * 0.1, cy + ry * 0.2), (cx - rx * 0.2, cy + ry * 0.6)], fill=DARK)
        d.line([(cx - rx * 0.9, cy + ry * 0.45), (cx + rx * 0.9, cy - ry * 0.45)], fill=DARK, width=30)
    return im


def make(name, recipe, subject, size, shape, seed, args):
    out = os.path.join(OUT, f"{name}-{seed}.png")
    if os.path.exists(out) and not args.again:
        print("have", os.path.relpath(out, ROOT))
        return
    control = None
    if shape:
        os.makedirs(CONTROL, exist_ok=True)
        control = os.path.join(CONTROL, f"{shape}.png")
        plan(shape, size).save(control)
    while comfy.busy():
        print("the queue is in use; waiting")
        time.sleep(10)
    t = time.time()
    text = recipe.format(subject=subject, palette=STEEL)
    comfy.txt2img(text, out, seed=seed, width=size[0], height=size[1], control=control, strength=0.75)
    print(f"{os.path.relpath(out, ROOT)} in {time.time() - t:.0f}s")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("group", choices=["emblems", "homes", "icons", "items", "intro"])
    ap.add_argument("names", nargs="*")
    ap.add_argument("--seeds", type=int, default=1)
    ap.add_argument("--first", type=int, default=1)
    ap.add_argument("--again", action="store_true")
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    seeds = range(args.first, args.first + args.seeds)
    if args.group in ("icons", "items"):
        table, palette = (ICONS, STEEL) if args.group == "icons" else (ITEMS, GEAR)
        for key in args.names or table:
            for seed in seeds:
                make(f"icon-{key}", ICON.replace("{palette}", palette), table[key], (1024, 1024), None, seed, args)
        return
    prefix = {"emblems": "emblem", "homes": "home", "intro": "intro"}[args.group]
    for name, (recipe, subject, size, shape) in SUBJECTS.items():
        if not name.startswith(prefix) or (args.names and name not in args.names):
            continue
        for seed in seeds:
            make(name, recipe, subject, size, shape, seed, args)


if __name__ == "__main__":
    main()
