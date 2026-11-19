"""Draws each hull in the line-up from above, from the side and from behind, with the image model on this PC.

  python3 tools/gen/hulls.py                 # every hull from above, into art/hulls/source
  python3 tools/gen/hulls.py dart lance      # only these
  python3 tools/gen/hulls.py dart --seed 3   # another try at one
  python3 tools/gen/hulls.py --control art/hulls/control   # follow the shape plans
  python3 tools/gen/hulls.py --view side --control art/hulls/control --seed 1 --tries 4   # from the side, four tries

Every prompt is the hull's own shape in that view followed by one shared style for the view, so the whole line-up
comes out in one look, and its three views in the same colours and pixels. Change the recipe here, never a single
prompt. The side and rear views follow their guides (control-side-<name>.png, control-rear-<name>.png, drawn by
tools/art-sheet.ts from the plans' solids in src/lib/art/hulls.ts), so they show the same ship as the top view.

ComfyUI must be running (Eminent Domain's docs/SETUP.md says how to start it), and this
waits for anything already on its queue: the GPU is shared.
"""

import argparse
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "hulls", "source")

STYLE = (
    "pixel art game sprite of a science fiction spaceship seen from directly above, strict top-down "
    "orthographic view, the pointed nose at the top of the image and the engines at the bottom, perfectly "
    "symmetrical, {shape}, pointed and aggressive, sharp angular armour plates, nothing rounded or bulbous, "
    "dark gunmetal grey hull with bold orange markings, teal glass cockpit canopy, engines glowing blue, "
    "crisp chunky pixels, limited colour palette, no anti-aliasing, no blur, 16-bit era, one ship, whole "
    "ship in frame and centred, plain flat black background"
)

# the same recipe seen from the side (the nose to the left) and from behind (looking into the nozzles)
SIDE_STYLE = (
    "pixel art game sprite of a science fiction spaceship seen exactly from the side, strict side-on orthographic "
    "profile view, the pointed nose at the left of the image and the engines at the right, {shape}, pointed and "
    "aggressive, sharp angular armour plates, nothing rounded or bulbous, dark gunmetal grey hull with bold orange "
    "markings, teal glass cockpit canopy, engines glowing blue, crisp chunky pixels, limited colour palette, no "
    "anti-aliasing, no blur, 16-bit era, one ship, whole ship in frame and centred, plain flat black background"
)
REAR_STYLE = (
    "pixel art game sprite of a science fiction spaceship seen from directly behind, strict rear orthographic view "
    "looking straight into its engine nozzles, perfectly symmetrical, {shape}, the engine nozzles glowing bright blue "
    "facing the viewer, pointed and aggressive, sharp angular armour plates, nothing rounded or bulbous, dark gunmetal "
    "grey hull with bold orange markings, crisp chunky pixels, limited colour palette, no anti-aliasing, no blur, "
    "16-bit era, one ship, whole ship in frame and centred, plain flat black background"
)

SIDES = {
    "dart": "a light fighter: a slim needle fuselage with a small canopy near the nose, a tall blade-shaped gun pod with its raked leading edge, a small engine at the back",
    "sparrow": "a small scout: a compact wedge rising from a sharp nose to a flat back, a canopy near the nose, a fairing along its flank, one large engine",
    "lance": "an interceptor: a very long thin needle with a canopy near the nose, a huge engine nacelle along its rear half with a raked intake",
    "corsair": "a raider: a long blade nose rising to a high armoured spine, the canopy set back on the spine, a cannon along its flank, engines at the back",
    "wraith": "a stealth ship: a low flat faceted wedge with a shallow ridge and a small canopy, sharp knife-edged, engines hidden at the back",
    "prospector": "a mining ship: a deep angular wedge with a mining laser in its nose, a high canopy, an ore tank on its flank, engines at the back",
    "mule": "a light cargo hauler: a pointed hull alongside a long boom, square cargo containers clamped along its side, an engine at the back of the boom",
    "bastion": "a gunship: a heavy armoured hull stepped up from the nose to a high back, a long cannon barrel on its shoulder, a gun turret on top, big engines",
    "nomad": "a long-range explorer: a long spearhead hull with a long canopy, a forward-swept wing blade along its side, a sensor pod, engines at the back",
    "galleon": "a heavy freighter: a big deep wedge from a sharp nose, a raised spine of cargo hatches along its back, large engines at the back",
}
REARS = {
    "dart": "a light fighter: a slim six-sided fuselage in the middle, thin straight wings out to each side ending in a tall upright gun blade, two small engine nozzles",
    "sparrow": "a small scout: a flat diamond-shaped wedge with a ridge down the middle and thin edges, a canopy on top, one large engine nozzle",
    "lance": "an interceptor: a thin needle hull between two huge eight-sided engine nacelles, small canards angled up, two big engine nozzles",
    "corsair": "a raider: a wide flat wedge with a high spine in the middle and thin sharp edges, a cannon on each side, four engine nozzles across its back",
    "wraith": "a stealth ship: a very flat faceted kite with a low ridge, knife edges, two thin slit engine vents",
    "prospector": "a mining ship: a deep angular wedge with sloping sides, an ore tank on each flank, two big engine nozzles",
    "mule": "a light cargo hauler: a pointed central hull and a tall boom on each side, square cargo containers between them, an engine nozzle on each boom",
    "bastion": "a gunship: a broad armoured arrowhead with sloping armour plates, a gun turret on its back, two cannon on its shoulders, four engine nozzles",
    "nomad": "a long-range explorer: a slim hull with long thin wings raised to their tips like blades, a sensor pod on each, one engine nozzle",
    "galleon": "a heavy freighter: a big wide wedge with a raised spine of cargo hatches, four large engine nozzles across its wide back",
}

HULLS = {
    "dart": "a light fighter: a slim needle fuselage between two swept wings, each wing ending in a long forward-pointing gun pod, like a trident, two small engines",
    "sparrow": "a small scout: one compact arrowhead wedge with short swept winglets at the back and a single large engine",
    "lance": "an interceptor: a very long thin needle hull with two huge engine nacelles alongside its rear half and tiny fins near the nose",
    "corsair": "a raider: a forked nose of two long forward-pointing blade prongs with the cockpit set back between them, widening to a broad rear, a cannon on each side",
    "wraith": "a stealth ship: a flat faceted kite shape like a cut gemstone, no parts sticking out, engines hidden in slits at the back",
    "prospector": "a mining ship: an angular wedge with a notch in its nose holding a mining laser, an ore tank on each flank, three engines",
    "mule": "a light cargo hauler: a pointed central hull with a pointed outrigger boom on each side, cargo containers clamped between them, an engine at the back of each boom",
    "bastion": "a gunship: a heavy broad armoured arrowhead with stepped leading edges, two long cannon barrels pointing forward from its shoulders, a round gun turret on its back, four engines",
    "nomad": "a long-range explorer: a long spearhead hull with two large forward-swept wings reaching ahead like blades, a sensor pod on each side, a long cockpit, two engines",
    "galleon": "a heavy freighter: a big wide delta wedge with a sharp nose, rows of cargo hatches along its back, four large engines across its wide rear",
}

ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*", help="which hulls (all of them if none are given)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--control", help="a folder of control-<name>.png plans for the model to follow")
ap.add_argument("--strength", type=float, default=0.8)
ap.add_argument("--view", choices=["top", "side", "rear"], default="top")
ap.add_argument("--tries", type=int, default=1, help="this many seeds from --seed on")
args = ap.parse_args()

style, subject = {"top": (STYLE, HULLS), "side": (SIDE_STYLE, SIDES), "rear": (REAR_STYLE, REARS)}[args.view]
# (the top views keep their old names: art/hulls/source/<name>-<seed>.png; the others art/hulls/<view>/<name>-<seed>.png)
folder = OUT if args.view == "top" else os.path.join(ROOT, "art", "hulls", args.view)
for name in args.names or HULLS:
    for seed in range(args.seed, args.seed + args.tries):
        while comfy.busy():
            print("waiting for the queue to clear ...", file=sys.stderr)
            time.sleep(10)
        out = os.path.join(folder, name + (f"-{seed}" if seed != 1 or args.view != "top" else "") + ".png")
        start = time.time()
        guide = f"control-{name}.png" if args.view == "top" else f"control-{args.view}-{name}.png"
        control = os.path.join(args.control, guide) if args.control else None
        if control and not os.path.exists(control):
            control = None
        comfy.txt2img(style.format(shape=subject[name]), out, seed=seed, control=control, strength=args.strength)
        print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
