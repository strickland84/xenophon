# /// script
# dependencies = ["pillow"]
# ///
"""Lays the frames tools/inside-sheets.ts drew out into the polish pass's sheets (items 1, 3 and 7), each frame
shown as large as a laptop shows it (its art pixels whole), with a line under it saying what it is:

  uv run tools/inside-sheets.py <frames-dir> [<before-frames-dir>] [--out docs/art/gen]

  pilot-scale.png          the pilot beside a Dart, a Corsair and a Galleon on the pad: before (if given) and after
  cockpits.png             every hull's cockpit over a world, and four in space
  rooms.png                each kind of room, furnished: the hangar, the deck, and a ship's cockpit, cabin, map room,
                           crew quarters, cargo bay and engine room
  ship-interiors-after.png a small ship's rooms and a large one's, whole
"""

import argparse
import os

from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("frames")
ap.add_argument("before", nargs="?")
ap.add_argument("--out", default="docs/art/gen")
args = ap.parse_args()

# a laptop's frame is 456 x 256 art pixels before the camera pulls in; each frame is shown at that size
SHOWN = (912, 512)


def shown(path):
    im = Image.open(path).convert("RGB")
    k = max(1, round(SHOWN[0] / im.width))
    return im.resize((im.width * k, im.height * k), Image.NEAREST)


def sheet(out, cells, cols):
    """cells: (picture, words); laid out in columns, the words under each"""
    w = max(c[0].width for c in cells)
    h = max(c[0].height for c in cells) + 26
    rows = (len(cells) + cols - 1) // cols
    im = Image.new("RGB", (cols * (w + 8) + 8, rows * (h + 8) + 8), (12, 14, 22))
    d = ImageDraw.Draw(im)
    for i, (pic, words) in enumerate(cells):
        x = 8 + (i % cols) * (w + 8)
        y = 8 + (i // cols) * (h + 8)
        im.paste(pic, (x, y))
        d.text((x + 4, y + pic.height + 6), words, fill=(236, 228, 210))
    im.save(os.path.join(args.out, out))
    print(os.path.join(args.out, out), im.size)


def frame(name, base=None):
    p = os.path.join(base or args.frames, name + ".png")
    return shown(p) if os.path.exists(p) else None


os.makedirs(args.out, exist_ok=True)
hulls = ["dart", "corsair", "galleon"]
cells = []
for h in hulls:
    if args.before and frame(f"pilot-{h}", args.before):
        cells.append((frame(f"pilot-{h}", args.before), f"before: beside a {h} (the pilot 12 px tall, art pixels twice the size)"))
    if frame(f"pilot-{h}"):
        cells.append((frame(f"pilot-{h}"), f"after: beside a {h} (the pilot 7 px tall, art pixels twice the size)"))
if cells:
    sheet("pilot-scale.png", cells, 2 if args.before else 3)

ROOMS = {"dart": ["cockpit"], "sparrow": ["cockpit", "cabin"], "lance": ["cockpit", "cabin"], "corsair": ["cockpit", "cabin", "engine room"],
         "wraith": ["cockpit", "map room", "cabin"], "prospector": ["cockpit", "cargo bay", "crew quarters", "engine room"],
         "mule": ["cockpit", "cargo bay", "crew quarters"], "bastion": ["cockpit", "crew quarters", "engine room"],
         "nomad": ["cockpit", "map room"], "galleon": ["cockpit", "map room", "crew quarters", "cargo bay"]}
names = ["dart", "sparrow", "lance", "corsair", "wraith", "prospector", "mule", "bastion", "nomad", "galleon"]
cells = [(frame(f"cockpit-{h}"), f"{h}, over a world") for h in names if frame(f"cockpit-{h}")]
cells += [(frame(f"cockpit-space-{h}"), f"{h}, in space") for h in ["corsair", "mule", "bastion", "wraith"] if frame(f"cockpit-space-{h}")]
if cells:
    sheet("cockpits.png", [(c.resize((c.width // 2, c.height // 2), Image.NEAREST), w) for c, w in cells], 4)

rooms = [("hangar", "the hangar (a Corsair, from its larger build)"), ("deck", "the station deck"), ("cockpit", "a freighter's cockpit"),
         ("cabin", "a raider's cabin"), ("map", "a freighter's map room"), ("quarters", "a freighter's crew quarters"),
         ("cargo", "a freighter's cargo bay"), ("engine", "a gunship's engine room")]
cells = [(frame(f"room-{r}"), words) for r, words in rooms if frame(f"room-{r}")]
if cells:
    sheet("rooms.png", cells, 2)

cells = [(shown(os.path.join(args.frames, f"ship-{h}.png")), f"a {h}'s rooms, with its fit-out") for h in ["dart", "corsair", "mule", "galleon"] if os.path.exists(os.path.join(args.frames, f"ship-{h}.png"))]
if cells:
    sheet("ship-interiors-after.png", cells, 2)

names_fit = ["dart", "sparrow", "lance", "corsair", "wraith", "prospector", "mule", "bastion", "nomad", "galleon"]
def thrice(path):
    im = Image.open(path).convert("RGB")
    return im.resize((im.width * 3, im.height * 3), Image.NEAREST)


cells = [(thrice(os.path.join(args.frames, f"fitout-{h}.png")), f"{h}: {', '.join(ROOMS.get(h, []))}") for h in names_fit if os.path.exists(os.path.join(args.frames, f"fitout-{h}.png"))]
if cells:
    sheet("fit-outs.png", cells, 5)
