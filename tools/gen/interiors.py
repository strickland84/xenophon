# /// script
# dependencies = ["pillow", "numpy", "scipy"]
# ///
"""Draws the places inside with the image model (Phase 8, rebuilt in the polish pass), all in ONE projection: the
tiling rule (CLAUDE.md, docs/pixel-art-techniques.md "Interiors: one projection"). Every floor, wall, door and piece
of furniture is seen top-down and square-on, on the square grid of tiles the rooms are made of: a floor from straight
above; a wall or a piece showing its top and a little of its face towards the bottom of the screen; never isometric,
never corner-on. Light falls from above. A piece covers a footprint of whole tiles (1×1, 2×1, 2×2 …) and rises a
little into the row behind it.

  uv run tools/gen/interiors.py                      # every piece, every facing, each until a try passes the check
  uv run tools/gen/interiors.py berth locker         # only these pieces (every facing of each)
  uv run tools/gen/interiors.py berth-e              # one facing
  uv run tools/gen/interiors.py --floors             # the floors, walls and what hangs on the walls
  uv run tools/gen/interiors.py --mockups            # the rooms drawn whole, to build towards (art/mockups/)

How a piece is made to come out square-on: a plan (a control picture the model follows) of its footprint rectangle
square-on, its top face pale, the face towards us dark, its tiles ruled on it and a bright edge round it, and one
style string that says top-down, orthographic, no isometric, no diamond. Prompts alone drifted to isometric. Then
every try is checked in code (tools/voxel/tiling.py: cut to the plan's box and shrunk to game pixels, it must fill
its rectangle, its corners and its straight edges); a try that fails is drawn again with the next seed, so no diamond
can get into the game. The passing tries are kept in art/interiors/picks.json; tools/voxel/interiors.py makes them
game pixels.

A piece built against a wall is drawn for each way it can face into a room (data/interiors.ts Face): s, its back to
the wall above it (seen from the front); e and w, its back to the wall on its left or right (seen from above, lying
along that wall); n, its back to the wall below it (its plain back is what shows). Each is drawn from its own plan,
never mirrored or turned, so the light stays right.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "voxel"))
import comfy  # noqa: E402
from tiling import LOOSE, clean, game_pixels, noise, plan_box, size_of, unlike  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "interiors", "source")
CONTROL = os.path.join(ROOT, "art", "interiors", "control")
PICKS = os.path.join(ROOT, "art", "interiors", "picks.json")
MOCKUPS = os.path.join(ROOT, "art", "mockups")

# the one view every piece is drawn in
TOPDOWN = (
    "seen from directly above in a top-down orthographic view, square-on to the picture and aligned with its edges, its "
    "flat top seen from above and a little of its front face along its bottom edge, like a tile of a 16-bit top-down "
    "RPG map on a square grid, no perspective, not isometric, not turned, not a diamond, a rectangular footprint"
)
PIECE = (
    "pixel art game sprite of {subject}, inside a science fiction spaceship, " + TOPDOWN + ", it fills its whole "
    "rectangle edge to edge, crisp chunky pixels, a few big bold shapes and strong contrast, colours: dark gunmetal and "
    "purple grey steel with warm orange, brass, red and teal accents and bright glowing lights, lit from above, clear "
    "dark outline, hard edges, no anti-aliasing, no blur, one object, plain flat black background around it, no text"
)
# built into a ship: what a berth or a locker is on a spacecraft
BUILT = "built into the ship, bolted down, compact, made of the ship's own steel plating"
# how each facing is said (the plan shows it too)
FACINGS = {
    "s": "its back against the wall at the top of the picture, its working side facing the bottom of the picture",
    "e": "lying lengthwise from the top of the picture to the bottom, its back against a wall on its left, its working side facing right",
    "w": "lying lengthwise from the top of the picture to the bottom, its back against a wall on its right, its working side facing left",
    "n": "",
}
# (facing away, against the wall nearest the camera, only its back shows: asked for as the subject itself)
BACK = "the plain closed back of {what}: a riveted steel box with a small vent grille and a pipe or two, nothing of its front showing"

# a floor seen straight down
FLOOR = (
    "seamless tileable pixel art floor texture seen from directly above, strict top-down view, {subject}, "
    "for a beautiful 16-bit top-down RPG spaceship interior, crisp chunky pixels, limited colour palette, hard edges, "
    "no anti-aliasing, no blur, evenly lit, no objects, fills the whole picture, no text"
)
# the back wall of a room, seen front on
WALL = (
    "pixel art game tile strip of the back wall of a room inside a science fiction spaceship seen straight from "
    "the front like a beautiful 16-bit top-down RPG interior, {subject}, crisp chunky pixels, rich colours, dark purple "
    "grey gunmetal, hard edges, no anti-aliasing, no blur, fills the whole picture edge to edge, no text"
)
# a thing hung on a wall's face, seen front on
ONWALL = (
    "pixel art game sprite of {subject}, mounted on the wall of a science fiction spaceship, seen straight from the front "
    "like a beautiful 16-bit top-down RPG interior, crisp chunky pixels, rich colours, dark purple grey gunmetal with warm "
    "orange and teal accents, clear dark outline, hard edges, no anti-aliasing, no blur, one object centred, plain flat "
    "black background, no text"
)

# name: (recipe, subject, box: (width, depth, height) of its plan in plan units, or a floor/wall's grid)
SUBJECTS = {
    # floors
    "floor-hangar": (FLOOR, "heavy riveted grey steel deck plates with a faint purple tint in a square grid with thin dark seams, small bolts and faint scuffs", "grid4"),
    "floor-lane": (FLOOR, "heavy riveted steel deck plates painted over in faded dull mustard ochre walkway paint, worn and scuffed to dark grey steel in many places, thin dark seams and small bolts", "grid4"),
    "floor-deck": (FLOOR, "dark slate purple grey station deck panels in a square grid with thin dark seams and small corner bolts, a few worn spots", "grid4"),
    "floor-ship": (FLOOR, "a spaceship floor of purple grey metal plates in a square grid with thin dark seams and small rivets at the corners", "grid4"),
    "floor-quarters": (FLOOR, "a spaceship cabin floor of dark muted walnut brown wooden deck boards in a square grid of panels, dim, a little worn", "grid4"),
    "floor-cargo": (FLOOR, "a spaceship cargo bay floor of medium grey steel plates in a square grid with dark seams and narrow slots", "grid4"),
    "floor-engine": (FLOOR, "a spaceship engine room floor of dark steel diamond plate panels in a square grid with dark seams", "grid4"),
    # walls: the face of a back wall, and the top of any wall seen from above
    "wall-hangar": (WALL, "heavy dark purple grey riveted bulkhead panels with thick ribs between them, a dark base and a bright rim along the top", "panels"),
    "wall-deck": (WALL, "dark slate purple grey station wall panels with ribs between them and small warm lights, a dark base and a bright rim along the top", "panels"),
    "wall-ship": (WALL, "a spaceship's inner wall of dark purple grey angular panels with ribs between them, small vents, a dark base and a bright rim along the top", "panels"),
    "walltop": (FLOOR, "the thick top of a spaceship's bulkhead walls seen from above, dark purple grey armoured metal with rivets and seams", "grid4"),
    # on the walls
    "door": (ONWALL, "a sliding bulkhead door standing open in a thick metal frame with yellow and black hazard stripes on its edges and a small green light above it, the dark corridor beyond", (3, 0.2, 3)),
    "walllamp": (ONWALL, "a small rectangular wall lamp glowing warm yellow in a metal housing", (2, 0.2, 1)),
    "porthole": (ONWALL, "a round porthole window in a thick riveted brass rim showing black space with tiny stars", (2, 0.2, 2)),
    "window": (ONWALL, "a wide window in a thick metal frame looking out on black space with stars and a small ringed planet", (6, 0.2, 2.5)),
    "wallscreen": (ONWALL, "a wall screen showing a glowing teal star map with dotted routes", (3, 0.2, 2)),
    "charts": (ONWALL, "a few paper star charts and notes pinned to a cork board", (3, 0.2, 2)),
    "pipes": (ONWALL, "a cluster of copper and steel pipes with valves and a pressure gauge", (3, 0.2, 2)),
    "vent": (ONWALL, "a square air vent grille", (1.5, 0.2, 1.5)),
    "hangardoor": (ONWALL, "big closed segmented armoured hangar doors with yellow and black hazard stripes along their edges and red warning lights", (8, 0.2, 2.5)),
    }

# Every piece: what it is; its footprint in tiles as it faces s (across, deep); how far it rises into the row behind, in
# tiles; and the facings it is drawn in ('sewn' for one built against a wall, 's' for one standing free or a fixture).
# data/interiors.ts PROPS must say the same footprint (a test checks every piece's art against it).
PIECES = {
    # a ship's rooms, built against a wall
    "berth": ("a sleeping berth: a recessed steel bunk with a thin mattress, a grey blanket, a pillow and a small reading light", (2, 1), 0.4, "sewn"),
    "berthstack": ("two sleeping berths stacked one above the other in a recessed steel frame, thin mattresses, grey blankets, reading lights, a short ladder", (2, 1), 1.25, "sewn"),
    "locker": ("a narrow crew locker with a vented steel door and a small name plate", (1, 1), 1.25, "sewn"),
    "shelf": ("a storage shelf with cargo netting holding a few books, a mug in a clip and a little model spaceship", (1, 1), 1.25, "sewn"),
    "sideconsole": ("a side console with two glowing teal screens and rows of lit buttons", (2, 1), 0.5, "sewn"),
    "galley": ("a compact ship's galley unit: a steel counter with a hot plate, a sealed water dispenser and cups held in clips", (2, 1), 0.5, "sewn"),
    "cargorack": ("a heavy steel cargo rack with crates and canisters strapped down in it", (2, 1), 1.0, "sewn"),
    "weaponrack": ("a locked rack of sidearms and a rifle behind a steel grille", (1, 1), 1.0, "sewn"),
    "engconsole": ("an engineer's console with round gauges, levers and a glowing screen", (2, 1), 0.5, "sewn"),
    "trophy": ("a display case with a model spaceship, medals and a gold cup behind glass", (1, 1), 1.0, "sewn"),
    "aquarium": ("a sealed aquarium tank set into a steel cabinet, little orange fish and green weed, softly lit", (2, 1), 0.75, "sewn"),
    "radar": ("a radar station: a round glowing green radar screen set in a steel console", (1, 1), 0.5, "sewn"),
    "crewbench": ("a padded crew bench with storage lockers under the seat", (2, 1), 0.4, "sewn"),
    "toolcab": ("a steel tool cabinet with drawers and a few tools clipped on top", (1, 1), 0.6, "sewn"),
    # … and standing free
    "maptable": ("a rectangular star map table: a glowing blue hologram of planets and orbits over a dark glass top in a steel frame", (2, 2), 0.4, "s"),
    "messtable": ("a ship's mess table with a fixed bench seat on each side, bolted to the deck, two plates and cups on it", (2, 2), 0.4, "s"),
    "reactor": ("a ship's reactor: a glowing orange and teal energy core in a square heavy steel housing ringed with pipes", (2, 2), 0.75, "s"),
    "loader": ("a small yellow cargo lift loader with forks, parked", (2, 2), 0.5, "s"),
    "crewseat": ("a padded crew seat on a steel pedestal bolted to the floor, square-on", (1, 1), 0.4, "s"),
    "hologlobe": ("a square hologram projector plinth bolted to the floor, a glowing teal planet floating above it", (1, 1), 0.75, "s"),
    "planter": ("a sealed hydroponic planter: a square steel box of green leafy plants under a glass lid with a grow light", (1, 1), 0.5, "s"),
    "decklight": ("a square steel deck light post bolted to the floor, a caged lamp glowing warm on top", (1, 1), 1.0, "s"),
    "stool": ("a square bar stool with an orange seat on a steel pedestal bolted to the floor", (1, 1), 0.25, "s"),
    "crates": ("a stack of orange and grey cargo crates strapped together on a square pallet", (1, 1), 0.75, "s"),
    "crate": ("one small orange cargo crate with stencilled marks", (1, 1), 0.4, "s"),
    "barrels": ("four upright steel fuel canisters in a square steel cradle, one orange", (1, 1), 0.6, "s"),
    "deckmat": ("a flat rubber anti-slip deck mat with yellow and black hazard stripes along its edges, lying flat on the floor", (2, 2), 0, "s"),
    # the flight console at a cockpit's front: a fixture, always facing the same way
    "console": ("a pilot's flight console: a wide desk of glowing teal screens, switches and two throttle levers, a padded pilot seat in front of it", (2, 2), 0.5, "s"),
    # the hangar: its stations built into the walls, a gantry by the bay, the bay's markings
    "partsrack": ("a tall rack of ship parts: gun barrels, cables, panels and boxes of bolts", (2, 1), 1.25, "sew"),
    "bay": ("a ship's landing bay floor seen straight down: dark grey steel deck plates with a thin band of worn yellow and black hazard stripes painted along its edges, bold yellow chevrons in its corners and a dashed yellow line down its middle, scuffed and oil stained, no frame, no border", (12, 14), 0, "s"),
    # the station deck
    "counter": ("a shop counter with glowing screens on top and shelves of ship parts behind it", (3, 1), 1.0, "s"),
    "board": ("a big faction notice board on a steel frame covered in pinned papers, maps and a gold triangle emblem", (3, 1), 1.25, "s"),
    "bar": ("a bar counter with bottles and glowing taps on the shelf behind it, warm lights", (3, 1), 0.6, "s"),
}
# the flat pieces lie on the floor (no rise): checked to fill their rectangle wholly
FLAT = {"deckmat", "bay"}

# The hangar, rebuilt wide (the last pass's polish, built towards art/mockups/hangar-wide-3.png): its stations are big
# working things built into the wall at the top, seen mostly from the front, each drawn over a sketch of what it is (a
# pegboard and a bench, shelves of paint cans and a spray arm, a round vault door) so the model draws that thing and not a
# pale plate; the gantries, the hoist and the fuel pumps likewise. One recipe for all of them, in the mockup's colours.
STATION = (
    "seen square-on from the front and a little from above, built into the back wall of the room, its front filling most "
    "of the picture and a strip of its top along its top edge, like a 16-bit top-down RPG map on a square grid, no "
    "perspective, not isometric, not turned, a rectangular outline"
)
HANGAR_PIECE = (
    "pixel art game sprite of {subject}, in a spaceship hangar, {view}, it fills its whole rectangle edge to edge, crisp "
    "chunky pixels, bold readable shapes and strong contrast, colours: dark gunmetal and purple grey steel with warm orange, "
    "hazard yellow and teal accents, lit from above, clear dark outline, hard edges, no anti-aliasing, no blur, one object, "
    "plain flat black background around it, no text"
)
HANGAR_PIECES = {
    "hbench": ("a weapons loadout workbench: a pegboard of hanging wrenches and tools and a rack of gun barrels on the wall over a long heavy steel workbench with an orange top, a big grey gun pod and a missile lying on it in cradles, drawers under it", (5, 1), 2.5, "s"),
    "hbooth": ("a paint station: shelves packed with paint cans in bright red, blue, green, yellow and white over a steel counter, a robot spray arm with a nozzle, spray guns on hooks, colourful paint drips", (5, 1), 2.5, "s"),
    "hvault": ("an armoured vault built into the wall: a huge round thick steel vault door with a big brass locking wheel in its middle and heavy bolts round its rim, a keypad with a green light beside it, a heavy steel frame", (4, 1), 2.75, "s"),
    "hconsole": ("a hangar control console: two glowing teal screens with ship diagrams and rows of lit buttons over a steel desk", (3, 1), 2.0, "s"),
    "hgantry": ("a ship service gantry tower seen from above: a long steel catwalk platform with yellow railings and grating, a ladder down its far end, thick fuel and power hoses coiled on it, amber warning lights at its corners", (5, 2), 1.5, "ew"),
    "hengine": ("a spare ship engine: a big grey and orange thruster nozzle lying on its side on a low wheeled steel stand, cables and a small hoist hook over it", (3, 2), 1.25, "s"),
    "hcrates": ("a stack of orange and dark grey cargo crates with stencilled marks, strapped together on a steel pallet", (2, 2), 1.0, "s"),
    "hdrums": ("three upright fuel drums, two green and one red with hazard marks, in a low steel cradle", (2, 1), 1.0, "s"),
    "hcart": ("a red mechanic's tool cart with drawers, wrenches and a welding torch on its top", (2, 1), 0.75, "s"),
    "hmissiles": ("a low steel munitions trolley carrying three grey missiles with orange tips lying side by side", (3, 1), 0.5, "s"),
    "htoolcab": ("a tall red mechanic's tool cabinet with many drawers and tools hung on its side", (2, 1), 1.5, "ew"),
    "fuelpump": ("a fuel pump: a tall steel fuel dispenser with a gauge, a glowing display and an orange hose coiled on a reel at its side", (1, 1), 2.0, "sew"),
}
# where a sketch's light, middle and dark greys go (true greys: the old plans were drawn in the red channel only)
G_LIGHT = (200, 200, 200)
G_MID = (140, 140, 140)
G_DARK = (80, 80, 80)
G_BLACK = (0, 0, 0)


def sketch(name, face, dr, x0, y0, x1, y1, tile):
    """a hangar piece's guide: the shapes of what it is, in greys, inside its box (x0, y0)-(x1, y1); a tile is `tile` px"""
    W, H = x1 - x0, y1 - y0
    R = dr.rectangle
    L = dr.line
    if name in ("hbench", "hbooth", "hconsole"):
        # (the wall-mounted part above, the counter's top across the middle, its front below)
        R([x0, y0, x1, y1], fill=G_DARK)
        top = y0 + H * 0.52
        R([x0, top, x1, top + H * 0.14], fill=G_LIGHT)
        R([x0, top + H * 0.14, x1, y1], fill=G_DARK)
        for i in range(1, 4):
            R([x0 + W * i / 4 - 4, top + H * 0.2, x0 + W * i / 4 + 4, y1 - H * 0.06], fill=G_MID)
        if name == "hbench":
            # a pegboard with tools hanging, and a gun pod lying on the bench
            R([x0 + W * 0.04, y0 + H * 0.04, x1 - W * 0.04, top - H * 0.04], fill=G_MID)
            for j in range(5):
                for i in range(16):
                    dr.ellipse([x0 + W * (0.07 + i * 0.056) - 3, y0 + H * (0.08 + j * 0.08) - 3, x0 + W * (0.07 + i * 0.056) + 3, y0 + H * (0.08 + j * 0.08) + 3], fill=G_DARK)
            for i in range(7):
                cx = x0 + W * (0.12 + i * 0.12)
                R([cx - 5, y0 + H * 0.1, cx + 5, y0 + H * (0.3 + 0.06 * (i % 3))], fill=G_LIGHT)
            R([x0 + W * 0.18, top - H * 0.07, x0 + W * 0.62, top + H * 0.06], fill=G_MID)
            R([x0 + W * 0.62, top - H * 0.03, x0 + W * 0.8, top + H * 0.02], fill=G_MID)
        elif name == "hbooth":
            # three shelves of paint cans, a spray arm on the right
            for j in range(3):
                sy = y0 + H * (0.05 + j * 0.16)
                R([x0 + W * 0.03, sy + H * 0.12, x0 + W * 0.7, sy + H * 0.15], fill=G_LIGHT)
                for i in range(9):
                    cx = x0 + W * (0.07 + i * 0.07)
                    R([cx - W * 0.022, sy + H * 0.02, cx + W * 0.022, sy + H * 0.12], fill=G_LIGHT if (i + j) % 2 else G_MID)
            L([x0 + W * 0.85, top, x0 + W * 0.85, y0 + H * 0.25, x0 + W * 0.74, y0 + H * 0.12], fill=G_LIGHT, width=int(W * 0.04))
            R([x0 + W * 0.7, y0 + H * 0.08, x0 + W * 0.77, y0 + H * 0.17], fill=G_LIGHT)
        else:
            # two screens
            for i in range(2):
                R([x0 + W * (0.06 + i * 0.47), y0 + H * 0.08, x0 + W * (0.47 + i * 0.47), top - H * 0.06], fill=G_LIGHT)
                R([x0 + W * (0.1 + i * 0.47), y0 + H * 0.13, x0 + W * (0.43 + i * 0.47), top - H * 0.11], fill=G_MID)
    elif name == "hvault":
        R([x0, y0, x1, y1], fill=G_MID)
        R([x0, y0, x1, y0 + H * 0.1], fill=G_LIGHT)
        cx, cy, r = x0 + W * 0.46, y0 + H * 0.56, min(W, H) * 0.4
        dr.ellipse([cx - r, cy - r, cx + r, cy + r], fill=G_LIGHT)
        dr.ellipse([cx - r * 0.8, cy - r * 0.8, cx + r * 0.8, cy + r * 0.8], fill=G_DARK)
        dr.ellipse([cx - r * 0.3, cy - r * 0.3, cx + r * 0.3, cy + r * 0.3], fill=G_LIGHT)
        for a in range(6):
            import math

            L([cx, cy, cx + math.cos(a * math.pi / 3) * r * 0.62, cy + math.sin(a * math.pi / 3) * r * 0.62], fill=G_LIGHT, width=int(r * 0.12))
        R([x0 + W * 0.88, y0 + H * 0.4, x0 + W * 0.97, y0 + H * 0.58], fill=G_LIGHT)
    elif name == "hgantry":
        # a long catwalk: railings down both long sides, grating, a platform at the near end, a ladder at the far end;
        # the side towards the ship (e: right) has the hoses
        R([x0, y0, x1, y1], fill=G_DARK)
        R([x0, y0, x0 + W * 0.12, y1], fill=G_LIGHT)
        R([x1 - W * 0.12, y0, x1, y1], fill=G_LIGHT)
        for k in range(int(H / (W * 0.3))):
            L([x0 + W * 0.12, y0 + k * W * 0.3, x1 - W * 0.12, y0 + k * W * 0.3], fill=G_MID, width=3)
        lad = y1 - H * 0.28
        for k in range(6):
            L([x0 + W * 0.2, lad + k * H * 0.045, x1 - W * 0.2, lad + k * H * 0.045], fill=G_LIGHT, width=int(W * 0.06))
        hx = x1 - W * 0.3 if face == "e" else x0 + W * 0.3
        dr.ellipse([hx - W * 0.16, y0 + H * 0.3, hx + W * 0.16, y0 + H * 0.42], outline=G_LIGHT, width=int(W * 0.06))
        for cy in (y0 + W * 0.1, lad - W * 0.1):
            for cx in (x0 + W * 0.06, x1 - W * 0.06):
                R([cx - W * 0.08, cy - W * 0.08, cx + W * 0.08, cy + W * 0.08], fill=G_LIGHT)
    elif name == "hengine":
        # a stand filling its footprint, the engine lying on it: a body and a flared nozzle
        R([x0, y0, x1, y1], fill=G_DARK)
        R([x0, y1 - H * 0.2, x1, y1], fill=G_MID)
        dr.rounded_rectangle([x0 + W * 0.04, y0 + H * 0.05, x0 + W * 0.62, y0 + H * 0.72], radius=W * 0.08, fill=G_MID)
        dr.polygon([(x0 + W * 0.62, y0 + H * 0.12), (x1 - W * 0.02, y0), (x1 - W * 0.02, y0 + H * 0.78), (x0 + W * 0.62, y0 + H * 0.66)], fill=G_LIGHT)
        for i in range(4):
            R([x0 + W * (0.1 + i * 0.13), y0 + H * 0.08, x0 + W * (0.13 + i * 0.13), y0 + H * 0.7], fill=G_LIGHT)
    elif name == "hcrates":
        R([x0, y0, x1, y1], fill=G_DARK)
        R([x0, y0, x0 + W * 0.55, y0 + H * 0.55], fill=G_LIGHT)
        R([x0 + W * 0.5, y0 + H * 0.2, x1, y0 + H * 0.8], fill=G_MID)
        R([x0, y0 + H * 0.5, x0 + W * 0.6, y1], fill=G_MID)
        L([x0, y0 + H * 0.25, x1, y0 + H * 0.25], fill=G_BLACK, width=4)
        R([x0, y1 - H * 0.1, x1, y1], fill=G_LIGHT)
    elif name == "hdrums":
        R([x0, y0, x1, y1], fill=G_DARK)
        for i in range(3):
            cx = x0 + W * (0.17 + i * 0.33)
            dr.rounded_rectangle([cx - W * 0.15, y0 + H * 0.02, cx + W * 0.15, y1 - H * 0.12], radius=W * 0.05, fill=G_LIGHT if i == 1 else G_MID)
            dr.ellipse([cx - W * 0.1, y0 + H * 0.06, cx + W * 0.1, y0 + H * 0.3], fill=G_DARK)
        R([x0, y1 - H * 0.12, x1, y1], fill=G_LIGHT)
    elif name == "hcart":
        R([x0, y0, x1, y1], fill=G_MID)
        R([x0, y0, x1, y0 + H * 0.45], fill=G_LIGHT)
        for j in range(3):
            R([x0 + W * 0.08, y0 + H * (0.5 + j * 0.15), x1 - W * 0.08, y0 + H * (0.6 + j * 0.15)], fill=G_DARK)
        R([x0 + W * 0.15, y0 + H * 0.15, x0 + W * 0.6, y0 + H * 0.25], fill=G_DARK)
    elif name == "hmissiles":
        R([x0, y0, x1, y1], fill=G_DARK)
        for j in range(3):
            cy = y0 + H * (0.15 + j * 0.25)
            dr.rounded_rectangle([x0 + W * 0.05, cy - H * 0.09, x1 - W * 0.12, cy + H * 0.09], radius=H * 0.08, fill=G_MID)
            dr.polygon([(x1 - W * 0.12, cy - H * 0.09), (x1 - W * 0.02, cy), (x1 - W * 0.12, cy + H * 0.09)], fill=G_LIGHT)
        R([x0, y1 - H * 0.15, x1, y1], fill=G_MID)
    elif name == "htoolcab":
        # side-on, along a wall: its long narrow top seen from above (a strip its depth wide), the wall at its back
        # marked dark, its front's edge with handles along the working side, its short end below
        R([x0, y0, x1, y1], fill=G_MID)
        wall = (x0, x0 + W * 0.2) if face == "e" else (x1 - W * 0.2, x1)
        front = (x1 - W * 0.3, x1) if face == "e" else (x0, x0 + W * 0.3)
        top = y0 + (y1 - y0) * (2 / (2 + PIECES[name][2]))
        R([wall[0], y0, wall[1], top], fill=G_DARK)
        R([front[0], y0, front[1], top], fill=G_LIGHT)
        for k in range(6):
            cy = y0 + (top - y0) * (k + 0.5) / 6
            R([front[0] + W * 0.05, cy - 3, front[1] - W * 0.05, cy + 3], fill=G_DARK)
        R([x0, top, x1, y1], fill=G_DARK)
        R([x0 + W * 0.2, top + (y1 - top) * 0.2, x1 - W * 0.2, top + (y1 - top) * 0.5], fill=G_MID)
    elif name == "fuelpump":
        R([x0, y0, x1, y1], fill=G_MID)
        R([x0 + W * 0.15, y0 + H * 0.1, x1 - W * 0.15, y0 + H * 0.3], fill=G_LIGHT)
        R([x0 + W * 0.25, y0 + H * 0.4, x1 - W * 0.25, y0 + H * 0.5], fill=G_DARK)
        side = x1 - W * 0.2 if face != "w" else x0 + W * 0.2
        dr.ellipse([side - W * 0.25, y0 + H * 0.55, side + W * 0.25, y0 + H * 0.8], outline=G_LIGHT, width=int(W * 0.08))
        R([x0, y1 - H * 0.08, x1, y1], fill=G_DARK)


def plan_hangar(name, face):
    """a hangar piece's plan: its sketch, square-on, in its box"""
    a, d, rise, (w, h) = facing_size(name, face)
    W, H, x0, y0, x1, y1 = plan_box(w, h)
    im = Image.new("RGB", (W, H), G_BLACK)
    sketch(name, face, ImageDraw.Draw(im), x0, y0, x1, y1, (x1 - x0) / a)
    return im, (x0, y0, x1, y1)


def prompt_hangar(name, face):
    subject, _, _, faces = HANGAR_PIECES[name]
    if name == "hgantry":
        side = "its walkway side towards the right of the picture" if face == "e" else "its walkway side towards the left of the picture"
        return HANGAR_PIECE.format(subject=f"{subject}, lying lengthwise from the top of the picture to the bottom, {side}", view=TOPDOWN)
    if name == "htoolcab":
        side = "left" if face == "e" else "right"
        how = (
            f"seen from directly above, standing lengthwise along a wall on its {side} from the top of the picture to the "
            f"bottom: its long narrow top seen from above, its front's edge with handles along its {'right' if face == 'e' else 'left'} side, "
            "only its short end showing along the bottom"
        )
        return HANGAR_PIECE.format(subject=subject, view=how)
    if HANGAR_PIECES[name][3] == "s" and name not in ("hbench", "hbooth", "hvault", "hconsole"):
        return HANGAR_PIECE.format(subject=subject, view=TOPDOWN)
    if name == "fuelpump" and face != "s":
        return HANGAR_PIECE.format(subject=f"{subject}, {FACINGS[face]}", view=TOPDOWN)
    return HANGAR_PIECE.format(subject=subject, view=STATION)


PIECES.update(HANGAR_PIECES)

# the rooms drawn whole by the image model, square-on, to build the hangar and the deck towards (art/mockups/)
MOCKUP = (
    "a pixel art game screenshot of {subject}, seen from directly above in a top-down orthographic view on a square tile "
    "grid like a 16-bit top-down RPG map, no perspective, not isometric, every object square-on to the grid, walls "
    "showing their tops and a little of their faces, crisp chunky pixels, rich colours: dark purple grey gunmetal with "
    "warm orange, brass and teal accents, lit by lamps from above, no text, no interface"
)
MOCKUPS_SUBJECTS = {
    "hangar-topdown": "a spaceship hangar: in its middle a sleek angular fighter spaceship parked on a landing bay marked out in yellow and black hazard stripes with corner chevrons, a steel service gantry on each side of the bay with hoses and warning lights; built into the walls a loadout workbench with a gun pod, a paint booth bay with robot spray arms, and an armoured vault door; big segmented hangar doors in the top wall; parts racks and tool cabinets along the walls; floor lights",
    "deck-topdown": "a space station's deck where pilots meet: a shop counter with glowing screens and shelves of parts along the top wall, a bar with stools, a big faction notice board, a wide window onto space with stars, crew benches built along the side walls, sealed planters, deck lights, a few pilots standing about",
    # (the hangar again, wide as a screen, every station in sight: the last pass's polish)
    "hangar-wide": "a wide busy working spaceship hangar seen whole: in its middle a sleek angular fighter spaceship parked nose up on a landing bay marked out in yellow and black hazard stripes, a steel service gantry tower with a ladder, a walkway arm, hoses and amber lights on each side of the ship; big segmented hangar doors in the middle of the top wall; built into the top wall either side of the doors three big work stations: a weapons workbench with a gun pod and a missile on it under a pegboard of tools, a paint booth with robot spray arms and shelves of bright paint cans, an armoured vault with a huge round door; along the side walls tool cabinets, fuel pumps with hose reels, parts racks; a parts hoist holding an engine, crates and fuel drums in the corners; yellow painted walkway lines on the floor leading to each station; pools of light from ceiling lamps",
}


GREY = 150
LIGHT = 205
DARK = 95
# how hard the model follows a plan: at 1.0 it paints the plan flat; at 0.6 it draws the piece, square-on, near its box
STRENGTH = 0.6


def plan_flat(kind):
    """the plan of a floor (a grid of plates), a wall's face (a row of panels) or a thing on a wall (a box front on)"""
    if kind == "grid4":
        im = Image.new("RGB", (1024, 1024), (GREY, GREY, GREY))
        d = ImageDraw.Draw(im)
        for i in range(0, 1025, 256):
            d.rectangle([i - 6, 0, i + 6, 1024], fill=DARK)
            d.rectangle([0, i - 6, 1024, i + 6], fill=DARK)
        return im
    if kind == "panels":
        im = Image.new("RGB", (1024, 256), (GREY, GREY, GREY))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 1024, 30], fill=LIGHT)
        for i in range(0, 1025, 128):
            d.rectangle([i - 5, 30, i + 5, 256], fill=DARK)
        d.rectangle([0, 236, 1024, 256], fill=DARK)
        return im
    w, _, h = kind
    k = 820 / max(w, h)
    W = 1024 if w >= h else int(max(512, w * k + 200) // 16 * 16)
    H = 1024 if h >= w else int(max(512, h * k + 200) // 16 * 16)
    im = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(im).rectangle([(W - w * k) / 2, (H - h * k) / 2, (W + w * k) / 2, (H + h * k) / 2], fill=GREY)
    return im


def facing_size(name, face):
    """a piece's footprint (across, deep) as it faces, its rise, and its art's size in game pixels"""
    _, (a, d), rise, _ = PIECES[name]
    if face in "ew":
        a, d = d, a
    return a, d, rise, size_of(a, d, rise)


def plan_side(name, face):
    """the plan of a piece built along a side wall (e or w), seen side-on (the last pass, after the first plans for these
    facings never came out square): its depth a narrow strip lying along the wall, its long top seen from above with the
    wall's side dark and its front's edge pale with handles along the working side, and only its short end below"""
    a, d, rise, (w, h) = facing_size(name, face)
    W, H, x0, y0, x1, y1 = plan_box(w, h)
    im = Image.new("RGB", (W, H), G_BLACK)
    dr = ImageDraw.Draw(im)
    bw = x1 - x0
    top = y0 + (y1 - y0) * d / (d + rise)
    dr.rectangle([x0, y0, x1, y1], fill=G_MID)
    wall = (x0, x0 + bw * 0.22) if face == "e" else (x1 - bw * 0.22, x1)
    front = (x1 - bw * 0.3, x1) if face == "e" else (x0, x0 + bw * 0.3)
    dr.rectangle([wall[0], y0, wall[1], top], fill=G_DARK)
    dr.rectangle([front[0], y0, front[1], top], fill=G_LIGHT)
    n = max(2, int(d * 3))
    for k in range(n):
        cy = y0 + (top - y0) * (k + 0.5) / n
        dr.rectangle([front[0] + bw * 0.06, cy - 4, front[1] - bw * 0.06, cy + 4], fill=G_DARK)
    dr.rectangle([x0, top, x1, y1], fill=G_DARK)
    return im, (x0, y0, x1, y1)


# The ship's pieces drawn again in the polish pass (step 8) over sketches of what each is, as the hangar's were: a plain
# box made the model paint a pale plate with a small thing on it, so at 8 px a tile the pieces read as pale shapes. Each
# sketch, in true greys inside the piece's box, is its main shapes as it faces s (or as it stands, if it stands free):
# `top` is where its top seen from above ends and its front facing us begins.
def sketch_ship(name, dr, x0, y0, x1, y1, top):
    W, H = x1 - x0, y1 - y0
    R = dr.rectangle
    E = dr.ellipse
    L = dr.line

    def rx(a, b, c, d, fill):
        R([x0 + W * a, y0 + H * b, x0 + W * c, y0 + H * d], fill=fill)

    ft = (top - y0) / H  # (the share of the box that is its top)
    R([x0, y0, x1, y1], fill=G_DARK)
    if name == "berth":
        # a recessed bunk: its frame, a mattress, a pillow at the left, a blanket folded over; drawers in its front
        rx(0.04, 0.06, 0.96, ft - 0.04, G_MID)
        rx(0.06, 0.1, 0.24, ft - 0.08, G_LIGHT)
        rx(0.5, 0.1, 0.94, ft - 0.08, G_LIGHT)
        L([x0 + W * 0.5, y0 + H * 0.1, x0 + W * 0.5, top - H * 0.08], fill=G_BLACK, width=4)
        for i in range(2):
            rx(0.08 + i * 0.46, ft + 0.06, 0.46 + i * 0.46, 0.92, G_MID)
    elif name == "berthstack":
        # two bunks one over the other seen from the front, a ladder at the right
        rx(0.04, 0.03, 0.96, ft - 0.02, G_MID)
        for b in (ft + 0.06, ft + 0.5 * (1 - ft) + 0.04):
            rx(0.06, b, 0.8, b + 0.3 * (1 - ft), G_BLACK)
            rx(0.08, b + 0.18 * (1 - ft), 0.78, b + 0.3 * (1 - ft), G_LIGHT)
            rx(0.08, b + 0.06 * (1 - ft), 0.22, b + 0.17 * (1 - ft), G_LIGHT)
        for k in range(5):
            rx(0.84, ft + 0.08 + k * 0.17 * (1 - ft), 0.94, ft + 0.11 + k * 0.17 * (1 - ft), G_LIGHT)
    elif name == "locker":
        # a tall door with vent slots at its top and a handle
        rx(0.08, 0.02, 0.92, ft - 0.02, G_MID)
        rx(0.1, ft + 0.04, 0.9, 0.97, G_MID)
        for k in range(4):
            rx(0.22, ft + 0.08 + k * 0.06, 0.78, ft + 0.1 + k * 0.06, G_BLACK)
        rx(0.7, ft + 0.45, 0.8, ft + 0.6, G_LIGHT)
    elif name == "shelf":
        # three shelves seen from the front, things on them, netting across
        for k in range(3):
            sy = ft + 0.04 + k * (0.95 - ft) / 3
            rx(0.08, sy, 0.92, sy + 0.04, G_LIGHT)
            for i in range(3):
                rx(0.14 + i * 0.26, sy + 0.06, 0.32 + i * 0.26, sy + (0.95 - ft) / 3 - 0.03, G_MID if (i + k) % 2 else G_LIGHT)
    elif name in ("sideconsole", "engconsole", "radar"):
        # its desk seen from above: screens or gauges, a row of buttons; its front a plain panel
        if name == "sideconsole":
            for i in range(2):
                rx(0.06 + i * 0.47, 0.08, 0.47 + i * 0.47, ft - 0.25, G_LIGHT)
                rx(0.1 + i * 0.47, 0.14, 0.43 + i * 0.47, ft - 0.31, G_MID)
        elif name == "engconsole":
            for i in range(3):
                cx = x0 + W * (0.18 + i * 0.32)
                r = min(W * 0.12, H * ft * 0.3)
                E([cx - r, y0 + H * 0.12, cx + r, y0 + H * 0.12 + 2 * r], fill=G_LIGHT)
                L([cx, y0 + H * 0.12 + r, cx + r * 0.7, y0 + H * 0.12 + r * 0.4], fill=G_BLACK, width=5)
        else:
            r = min(W, H * ft) * 0.36
            cx, cy = x0 + W / 2, y0 + H * ft * 0.45
            E([cx - r, cy - r, cx + r, cy + r], fill=G_LIGHT)
            E([cx - r * 0.75, cy - r * 0.75, cx + r * 0.75, cy + r * 0.75], fill=G_MID)
            L([cx, cy, cx + r * 0.6, cy - r * 0.5], fill=G_LIGHT, width=5)
        for i in range(6):
            rx(0.1 + i * 0.14, ft - 0.18, 0.18 + i * 0.14, ft - 0.08, G_LIGHT if i % 2 else G_MID)
        rx(0.06, ft + 0.12, 0.94, 0.88, G_MID)
    elif name == "galley":
        # a counter: two hot plates, a sink, cups in clips; cupboard doors below
        r = min(W * 0.1, H * ft * 0.3)
        for i in range(2):
            cx = x0 + W * (0.14 + i * 0.2)
            E([cx - r, y0 + H * 0.15, cx + r, y0 + H * 0.15 + 2 * r], outline=G_LIGHT, width=6)
        rx(0.56, 0.12, 0.9, ft - 0.12, G_MID)
        rx(0.6, 0.18, 0.86, ft - 0.18, G_BLACK)
        for i in range(3):
            rx(0.06 + i * 0.31, ft + 0.12, 0.33 + i * 0.31, 0.9, G_MID)
    elif name == "cargorack":
        # a rack of two levels, crates strapped on each
        rx(0.04, 0.04, 0.96, ft - 0.04, G_MID)
        for lv in (0, 1):
            sy = ft + 0.04 + lv * (0.94 - ft) / 2
            rx(0.04, sy + (0.94 - ft) / 2 - 0.04, 0.96, sy + (0.94 - ft) / 2, G_LIGHT)
            for i in range(3):
                rx(0.08 + i * 0.3, sy + 0.04, 0.32 + i * 0.3, sy + (0.94 - ft) / 2 - 0.06, G_LIGHT if (i + lv) % 2 else G_MID)
        L([x0 + W * 0.04, top, x1 - W * 0.04, y1 - H * 0.04], fill=G_BLACK, width=5)
    elif name == "weaponrack":
        # a grille frame with rifles standing in it, barrels up
        rx(0.04, 0.03, 0.96, ft - 0.02, G_MID)
        rx(0.08, ft + 0.04, 0.92, 0.96, G_BLACK)
        for i in range(3):
            cx = 0.22 + i * 0.28
            rx(cx - 0.05, ft + 0.08, cx + 0.05, 0.9, G_LIGHT)
            rx(cx - 0.09, ft + 0.28, cx + 0.03, ft + 0.36, G_MID)
        for k in range(3):
            rx(0.08, ft + 0.2 + k * 0.25, 0.92, ft + 0.22 + k * 0.25, G_MID)
    elif name == "trophy":
        # a glass case: a cup on its shelf, a model ship above
        fy = lambda t: ft + t * (1 - ft)  # noqa: E731
        rx(0.06, 0.04, 0.94, ft - 0.02, G_MID)
        rx(0.1, fy(0.06), 0.9, fy(0.94), G_BLACK)
        rx(0.3, fy(0.45), 0.7, fy(0.6), G_LIGHT)
        rx(0.42, fy(0.6), 0.58, fy(0.8), G_LIGHT)
        rx(0.25, fy(0.8), 0.75, fy(0.88), G_LIGHT)
        dr.polygon([(x0 + W * 0.5, y0 + H * fy(0.1)), (x0 + W * 0.66, y0 + H * fy(0.36)), (x0 + W * 0.34, y0 + H * fy(0.36))], fill=G_MID)
    elif name == "aquarium":
        # a tank of water in a steel cabinet: fish and weed in it
        rx(0.04, 0.04, 0.96, ft - 0.02, G_MID)
        rx(0.06, ft + 0.04, 0.94, 0.7, G_MID)
        for i, (fx, fy) in enumerate([(0.25, 0.25), (0.6, 0.4), (0.4, 0.55)]):
            rx(fx, ft + fy * (0.66 - ft), fx + 0.12, ft + fy * (0.66 - ft) + 0.06, G_LIGHT)
        for i in range(3):
            rx(0.12 + i * 0.3, 0.45, 0.16 + i * 0.3, 0.68, G_DARK)
        rx(0.04, 0.72, 0.96, 0.96, G_DARK)
    elif name == "crewbench":
        # a padded seat (two cushions) seen from above, its back along the wall, lockers under it
        rx(0.04, 0.04, 0.96, 0.3 * ft, G_MID)
        for i in range(2):
            rx(0.06 + i * 0.46, 0.3 * ft + 0.04, 0.48 + i * 0.46, ft - 0.04, G_LIGHT)
        for i in range(2):
            rx(0.08 + i * 0.46, ft + 0.12, 0.46 + i * 0.46, 0.9, G_MID)
    elif name == "toolcab":
        # drawers with handles, tools on top
        rx(0.1, 0.1, 0.5, 0.3, G_LIGHT)
        rx(0.6, 0.15, 0.85, 0.25, G_MID)
        for k in range(3):
            sy = ft + 0.04 + k * (0.94 - ft) / 3
            rx(0.08, sy, 0.92, sy + (0.94 - ft) / 3 - 0.04, G_MID)
            rx(0.4, sy + 0.04, 0.6, sy + 0.08, G_LIGHT)
    elif name == "maptable":
        # dark glass in a steel frame, a star and rings of orbits glowing over it
        rx(0.06, 0.05, 0.94, ft - 0.03, G_BLACK)
        cx, cy = x0 + W / 2, y0 + H * ft * 0.5
        for k, r in enumerate((0.38, 0.26, 0.14)):
            E([cx - W * r, cy - H * ft * r, cx + W * r, cy + H * ft * r], outline=G_MID if k else G_LIGHT, width=5)
        E([cx - W * 0.05, cy - W * 0.05, cx + W * 0.05, cy + W * 0.05], fill=G_LIGHT)
        rx(0.66, ft * 0.3, 0.72, ft * 0.3 + 0.06, G_LIGHT)
    elif name == "messtable":
        # a table top with plates, a fixed bench above and below it
        rx(0.04, 0.04, 0.96, 0.18, G_MID)
        rx(0.04, ft - 0.18, 0.96, ft - 0.04, G_MID)
        rx(0.1, 0.24, 0.9, ft - 0.24, G_LIGHT)
        for i in range(2):
            cx = x0 + W * (0.3 + i * 0.4)
            E([cx - W * 0.08, y0 + H * (ft / 2) - W * 0.08, cx + W * 0.08, y0 + H * (ft / 2) + W * 0.08], fill=G_MID)
    elif name == "reactor":
        # a square heavy housing, a round glowing core in it, pipes at its corners
        rx(0.04, 0.04, 0.96, ft - 0.02, G_MID)
        cx, cy, r = x0 + W / 2, y0 + H * ft / 2, min(W, H * ft) * 0.32
        E([cx - r, cy - r, cx + r, cy + r], fill=G_LIGHT)
        E([cx - r * 0.6, cy - r * 0.6, cx + r * 0.6, cy + r * 0.6], fill=G_DARK)
        E([cx - r * 0.3, cy - r * 0.3, cx + r * 0.3, cy + r * 0.3], fill=G_LIGHT)
        for ax, ay in ((0.1, 0.1), (0.8, 0.1), (0.1, ft - 0.2), (0.8, ft - 0.2)):
            rx(ax, ay, ax + 0.1, ay + 0.1, G_DARK)
    elif name == "loader":
        # a little cargo loader from above: its cab and wheels, two forks out in front (down)
        rx(0.12, 0.04, 0.88, 0.62, G_LIGHT)
        rx(0.24, 0.12, 0.76, 0.36, G_MID)
        for ax in (0.04, 0.84):
            rx(ax, 0.1, ax + 0.12, 0.3, G_BLACK)
            rx(ax, 0.42, ax + 0.12, 0.58, G_BLACK)
        for ax in (0.26, 0.62):
            rx(ax, 0.62, ax + 0.12, 0.96, G_MID)
    elif name == "crewseat":
        # a seat from above: its back, its cushion, arm rests; its pedestal below
        rx(0.12, 0.06, 0.88, 0.3 * ft, G_MID)
        rx(0.18, 0.3 * ft, 0.82, ft - 0.06, G_LIGHT)
        rx(0.36, ft + 0.1, 0.64, 0.95, G_MID)
    elif name == "hologlobe":
        # a plinth, a globe floating over it
        rx(0.15, 0.7, 0.85, 0.97, G_MID)
        r = W * 0.34
        E([x0 + W / 2 - r, y0 + H * 0.36 - r, x0 + W / 2 + r, y0 + H * 0.36 + r], fill=G_LIGHT)
        L([x0 + W / 2 - r, y0 + H * 0.36, x0 + W / 2 + r, y0 + H * 0.36], fill=G_MID, width=5)
        R([x0, y0, x1, y0 + H * 0.02], fill=G_DARK)
    elif name == "planter":
        # a box of leafy plants under glass
        rx(0.06, 0.06, 0.94, ft - 0.02, G_MID)
        for i, (lx, ly) in enumerate([(0.2, 0.15), (0.5, 0.1), (0.35, 0.4), (0.65, 0.38)]):
            E([x0 + W * lx, y0 + H * ly, x0 + W * (lx + 0.28), y0 + H * (ly + 0.28)], fill=G_LIGHT if i % 2 else G_DARK)
        rx(0.06, ft + 0.1, 0.94, 0.9, G_MID)
    elif name == "decklight":
        # a post with a caged lamp on top
        rx(0.38, 0.35, 0.62, 0.95, G_MID)
        E([x0 + W * 0.2, y0 + H * 0.04, x0 + W * 0.8, y0 + H * 0.4], fill=G_LIGHT)
        L([x0 + W * 0.5, y0 + H * 0.04, x0 + W * 0.5, y0 + H * 0.4], fill=G_DARK, width=4)
        rx(0.25, 0.9, 0.75, 0.98, G_MID)
    elif name == "stool":
        cx, cy, r = x0 + W / 2, y0 + H * ft * 0.5, W * 0.36
        E([cx - r, cy - r, cx + r, cy + r], fill=G_LIGHT)
        rx(0.4, ft, 0.6, 0.95, G_MID)
    elif name in ("crates", "crate"):
        if name == "crates":
            rx(0.04, 0.04, 0.6, 0.5, G_LIGHT)
            rx(0.45, 0.25, 0.96, 0.7, G_MID)
            rx(0.04, 0.5, 0.55, 0.96, G_MID)
        else:
            rx(0.06, 0.06, 0.94, 0.94, G_LIGHT)
            L([x0 + W * 0.06, y0 + H * 0.06, x1 - W * 0.06, y1 - H * 0.06], fill=G_MID, width=6)
            L([x1 - W * 0.06, y0 + H * 0.06, x0 + W * 0.06, y1 - H * 0.06], fill=G_MID, width=6)
    elif name == "barrels":
        for i in range(2):
            for k in range(2):
                cx, cy, r = x0 + W * (0.28 + i * 0.44), y0 + H * ft * (0.28 + k * 0.44), W * 0.2
                E([cx - r, cy - r, cx + r, cy + r], fill=G_LIGHT if (i + k) % 2 else G_MID)
                E([cx - r * 0.4, cy - r * 0.4, cx + r * 0.4, cy + r * 0.4], fill=G_DARK)
    elif name == "deckmat":
        R([x0, y0, x1, y1], fill=G_MID)
        band = W * 0.12
        for t in range(0, int(W + H), int(band)):
            L([x0 + t, y0, x0 + t - band, y0 + band], fill=G_LIGHT, width=int(band * 0.4))
        R([x0 + band, y0 + band, x1 - band, y1 - band], fill=G_DARK)
        for k in range(6):
            R([x0 + band * 1.5, y0 + band + k * (H - 2 * band) / 6 + 6, x1 - band * 1.5, y0 + band + k * (H - 2 * band) / 6 + 10], fill=G_MID)
    elif name == "console":
        # the flight console: a wide desk of screens at the top, throttles, the pilot's seat before it
        rx(0.04, 0.04, 0.96, 0.4, G_MID)
        for i in range(3):
            rx(0.08 + i * 0.3, 0.08, 0.32 + i * 0.3, 0.3, G_LIGHT)
        rx(0.44, 0.32, 0.56, 0.4, G_LIGHT)
        rx(0.3, 0.5, 0.7, 0.66, G_MID)
        rx(0.34, 0.66, 0.66, 0.92, G_LIGHT)
    elif name == "counter":
        # the shop's counter: screens on its top, its front a panel with lit strips
        rx(0.03, 0.06, 0.97, ft - 0.04, G_MID)
        for i in range(3):
            rx(0.08 + i * 0.31, 0.12, 0.3 + i * 0.31, ft - 0.14, G_LIGHT)
        for i in range(4):
            rx(0.06 + i * 0.235, ft + 0.14, 0.24 + i * 0.235, ft + 0.2, G_LIGHT)
        rx(0.03, ft + 0.3, 0.97, 0.9, G_MID)
    elif name == "board":
        # a big board on a frame, papers and maps pinned on it, an emblem
        rx(0.03, ft + 0.03, 0.97, 0.94, G_MID)
        for i, (px, py, pw, ph) in enumerate([(0.08, 0.1, 0.18, 0.35), (0.3, 0.08, 0.22, 0.28), (0.56, 0.12, 0.16, 0.3), (0.12, 0.52, 0.2, 0.34), (0.36, 0.46, 0.3, 0.4)]):
            rx(px, ft + py * (1 - ft), px + pw, ft + (py + ph) * (1 - ft), G_LIGHT if i % 2 == 0 else G_DARK)
        dr.polygon([(x0 + W * 0.84, y0 + H * (ft + 0.15 * (1 - ft))), (x0 + W * 0.94, y0 + H * (ft + 0.6 * (1 - ft))), (x0 + W * 0.74, y0 + H * (ft + 0.6 * (1 - ft)))], fill=G_LIGHT)
    elif name == "bar":
        # a bar: its counter top with taps, its front lit
        rx(0.03, 0.08, 0.97, ft - 0.06, G_MID)
        for i in range(5):
            rx(0.12 + i * 0.17, 0.14, 0.17 + i * 0.17, ft - 0.16, G_LIGHT)
        rx(0.03, ft + 0.12, 0.97, ft + 0.2, G_LIGHT)
        rx(0.03, ft + 0.28, 0.97, 0.92, G_MID)
    elif name == "partsrack":
        # a tall rack of shelves of parts: barrels of guns, boxes, coils of cable
        for k in range(3):
            sy = ft + 0.03 + k * (0.94 - ft) / 3
            rx(0.04, sy + (0.94 - ft) / 3 - 0.04, 0.96, sy + (0.94 - ft) / 3 - 0.01, G_LIGHT)
            for i in range(4):
                rx(0.08 + i * 0.22, sy + 0.04, 0.24 + i * 0.22, sy + (0.94 - ft) / 3 - 0.06, G_MID if (i + k) % 2 else G_LIGHT)
        rx(0.04, 0.04, 0.96, ft - 0.04, G_MID)
    elif name == "bay":
        # a ship's bay seen straight down: dark plates, a band of hazard stripes round its edge, chevrons at its corners,
        # a line down its middle; no frame round it
        R([x0, y0, x1, y1], fill=G_DARK)
        for k in range(1, 6):
            L([x0 + W * k / 6, y0, x0 + W * k / 6, y1], fill=G_BLACK, width=3)
            L([x0, y0 + H * k / 7, x1, y0 + H * k / 7], fill=G_BLACK, width=3)
        band = W * 0.07
        step = int(band * 1.4)
        for t in range(-int(H), int(W + H), step):
            dr.polygon([(x0 + t, y0), (x0 + t + step / 2, y0), (x0 + t + step / 2 - band, y0 + band), (x0 + t - band, y0 + band)], fill=G_LIGHT)
            dr.polygon([(x0 + t, y1 - band), (x0 + t + step / 2, y1 - band), (x0 + t + step / 2 - band, y1), (x0 + t - band, y1)], fill=G_LIGHT)
        for t in range(-int(W), int(H + W), step):
            dr.polygon([(x0, y0 + t), (x0 + band, y0 + t - band), (x0 + band, y0 + t - band + step / 2), (x0, y0 + t + step / 2)], fill=G_LIGHT)
            dr.polygon([(x1 - band, y0 + t), (x1, y0 + t - band), (x1, y0 + t - band + step / 2), (x1 - band, y0 + t + step / 2)], fill=G_LIGHT)
        for cx, cy, sx_, sy_ in ((x0 + band * 2, y0 + band * 2, 1, 1), (x1 - band * 2, y0 + band * 2, -1, 1), (x0 + band * 2, y1 - band * 2, 1, -1), (x1 - band * 2, y1 - band * 2, -1, -1)):
            for k in range(2):
                o = k * band * 0.9
                dr.line([(cx + sx_ * o, cy + sy_ * (band * 1.6 + o)), (cx + sx_ * o, cy + sy_ * o), (cx + sx_ * (band * 1.6 + o), cy + sy_ * o)], fill=G_LIGHT, width=int(band * 0.35))
        for k in range(6):
            R([x0 + W / 2 - band * 0.15, y0 + band * 3 + k * (H - band * 6) / 6, x0 + W / 2 + band * 0.15, y0 + band * 3 + k * (H - band * 6) / 6 + (H - band * 6) / 12], fill=G_MID)
        # (nothing outside its box)
        for box in ([x0 - 4000, y0 - 4000, x0 - 1, y1 + 4000], [x1 + 1, y0 - 4000, x1 + 4000, y1 + 4000], [x0 - 4000, y0 - 4000, x1 + 4000, y0 - 1], [x0 - 4000, y1 + 1, x1 + 4000, y1 + 4000]):
            R(box, fill=G_BLACK)
    else:
        return False
    return True


SHIP_SKETCHED = {
    "berth", "berthstack", "locker", "shelf", "sideconsole", "engconsole", "radar", "galley", "cargorack", "weaponrack",
    "trophy", "aquarium", "crewbench", "toolcab", "maptable", "messtable", "reactor", "loader", "crewseat", "hologlobe",
    "planter", "decklight", "stool", "crates", "crate", "barrels", "deckmat", "console", "counter", "board", "bar",
    "partsrack", "bay",
}


def plan_piece(name, face):
    """the plan of a piece as it faces: its art's box square-on, the top face pale and ruled in tiles, the face towards
    us dark, the side against its wall marked, and a bright edge all round; and where the box is in the picture"""
    if face in "ew" and SIDE_ON:
        return plan_side(name, face)
    a, d, rise, (w, h) = facing_size(name, face)
    W, H, x0, y0, x1, y1 = plan_box(w, h)
    im = Image.new("RGB", (W, H), (0, 0, 0))
    dr = ImageDraw.Draw(im)
    tile = (x1 - x0) / a
    top = y0 + d * tile
    # (a piece with a sketch of what it is, facing s: drawn over that)
    if face == "s" and name in SHIP_SKETCHED and SKETCHES:
        sketch_ship(name, dr, x0, y0, x1, y1, top)
        return im, (x0, y0, x1, y1)
    dr.rectangle([x0, y0, x1, top], fill=LIGHT)
    if rise:
        dr.rectangle([x0, top, x1, y1], fill=DARK)
    # (the tiles it covers, ruled faintly on its top)
    for i in range(1, a):
        dr.line([x0 + i * tile, y0, x0 + i * tile, top], fill=GREY, width=3)
    for j in range(1, d):
        dr.line([x0, y0 + j * tile, x1, y0 + j * tile], fill=GREY, width=3)
    band = max(14, tile * 0.18)
    if face == "s" and PIECES[name][3] != "s":
        dr.rectangle([x0, y0, x1, y0 + band], fill=GREY)
    elif face == "e":
        dr.rectangle([x0, y0, x0 + band, y1], fill=GREY)
    elif face == "w":
        dr.rectangle([x1 - band, y0, x1, y1], fill=GREY)
    return im, (x0, y0, x1, y1)


def front_of(name):
    """a piece's front facing (s) as it was picked: its picture cut to the piece, and its game pixels (to measure a
    facing's colours against)"""
    pick = json.load(open(PICKS))[f"{name}-s"]
    source = pick["source"] if "source" in pick else f"{name}-s-{pick['seed']}.png"
    rgb = np.asarray(Image.open(os.path.join(OUT, source)).convert("RGB")).astype(np.int32)
    w, h = pick["size"]
    px, empty, _ = game_pixels(rgb, pick["box"], w, h, loose=name in LOOSE)
    # (the piece's own outline in its picture, as game_pixels found it)
    from tiling import background
    from scipy import ndimage

    solid = ndimage.binary_opening(~background(rgb), iterations=2)
    labels, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    ys, xs = np.nonzero(labels == int(np.argmax(sizes)) + 1)
    crop = Image.fromarray(rgb[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1].astype(np.uint8))
    return crop, px, empty


def plan_from_front(name, face):
    """the plan of a side or back facing drawn from the piece's own front facing (the fresh review: side facings drawn
    over a plain side-on strip came out as static, the berth's back as a red box): its top as the front facing shows it
    from above, turned as the piece turns (e: its back to the wall on its left; w: on its right; n: below it), and below
    that the dark end or back it shows towards us. So the model draws the same object, lying the new way."""
    crop, _, _ = front_of(name)
    a, d, rise, _ = facing_size(name, "s")
    top = crop.crop((0, 0, crop.width, max(1, int(round(crop.height * d / (d + rise))))))
    turned = top.rotate({"e": 90, "w": -90, "n": 180}[face], expand=True)
    fa, fd, frise, (w, h) = facing_size(name, face)
    W, H, x0, y0, x1, y1 = plan_box(w, h)
    im = Image.new("RGB", (W, H), G_BLACK)
    dr = ImageDraw.Draw(im)
    split = y0 + (y1 - y0) * fd / (fd + frise)
    im.paste(turned.resize((x1 - x0, max(1, int(round(split - y0)))), Image.NEAREST), (x0, y0))
    if frise:
        # (its end or back towards us: a panel, mid grey with a lit top edge and seams, which the model draws as part of the
        # piece; a dark band it took for the background, and drew the piece small)
        dr.rectangle([x0, split, x1, y1], fill=G_MID)
        dr.rectangle([x0, split, x1, split + max(6, (y1 - split) * 0.08)], fill=G_LIGHT)
        for k in range(1, 3):
            yk = split + (y1 - split) * k / 3
            dr.rectangle([x0 + (x1 - x0) * 0.08, yk - 3, x1 - (x1 - x0) * 0.08, yk + 3], fill=G_DARK)
    return im, (x0, y0, x1, y1)


def prompt_for(name, face):
    subject, _, _, faces = PIECES[name]
    if FROM_FRONT and face in "ewn":
        how = {
            "e": "lying lengthwise from the top of the picture to the bottom against a wall on its left, its top seen from above, only its short end showing along the bottom",
            "w": "lying lengthwise from the top of the picture to the bottom against a wall on its right, its top seen from above, only its short end showing along the bottom",
            "n": "its back against a wall at the bottom of the picture, its top seen from above with its working side towards the top of the picture, its plain back panel along the bottom",
        }[face]
        return PIECE.format(subject=f"{subject}, {BUILT}, {how}")
    if face == "n":
        return PIECE.format(subject=BACK.format(what=subject.split(":")[0]))
    if face in "ew" and SIDE_ON:
        side = "left" if face == "e" else "right"
        how = (
            f", seen from directly above, standing lengthwise along a wall on its {side} from the top of the picture to the "
            f"bottom: its long narrow top seen from above, its front's edge with handles along its {'right' if face == 'e' else 'left'} side, "
            "only its short end showing along the bottom"
        )
        return PIECE.format(subject=f"{subject}, {BUILT}{how}")
    built = f", {BUILT}" if faces != "s" or name in ("crewseat", "planter", "decklight", "stool", "hologlobe", "messtable") else ""
    how = f", {FACINGS[face]}" if faces != "s" else ""
    return PIECE.format(subject=f"{subject}{built}{how}")


def wait_turn():
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr, flush=True)
        time.sleep(3)


def draw_piece(name, face, tries, picks, every=False, first=1, chosen=0):
    """tries seeds in turn until one passes the tiling check; keeps the passing one's seed in picks. With `every`, draws
    all `tries` from seed `first` and keeps `chosen` (a seed picked by eye among those that pass) or else the first to pass"""
    hangar = name in HANGAR_PIECES
    if FROM_FRONT and face in "ewn" and not hangar:
        im, box = plan_from_front(name, face)
    else:
        im, box = plan_hangar(name, face) if hangar else plan_piece(name, face)
    # (a side or back facing is held to its front facing's colours; every facing to being more than noise)
    front = front_of(name) if face != "s" and f"{name}-s" in json.load(open(PICKS)) else None
    key = f"{name}-{face}"
    control = os.path.join(CONTROL, f"control-{key}.png")
    im.save(control)
    _, _, _, (w, h) = facing_size(name, face)
    text = prompt_hangar(name, face) if hangar else prompt_for(name, face)
    passed = []
    for seed in range(first, first + tries):
        out = os.path.join(OUT, f"{key}-{seed}.png")
        if not os.path.exists(out):
            wait_turn()
            start = time.time()
            comfy.txt2img(text, out, seed=seed, width=im.width, height=im.height, control=control, strength=STRENGTH)
            took = time.time() - start
        else:
            took = 0
        rgb = np.asarray(Image.open(out).convert("RGB")).astype(np.int32)
        px, empty, why = game_pixels(rgb, box, w, h, flat=name in FLAT, back=face == "n", loose=name in LOOSE)
        # (a side or back facing as the game will have it: in its front's colours, its specks taken out: tools/voxel/interiors.py)
        if not why and front is not None:
            px = clean(px, empty, front[1], front[2])
        if not why:
            why = noise(px, empty, loose=name in LOOSE)
        if not why and front is not None:
            why = unlike(px, empty, front[1], front[2])
        print(f"{key} try {seed}: {'passes' if not why else why} ({took:.0f}s)", flush=True)
        if not why:
            passed.append(seed)
            if not every:
                break
    seed = chosen if chosen in passed else (passed[0] if passed else 0)
    if seed:
        picks[key] = {"seed": seed, "box": list(box), "size": [w, h]}
        return True
    picks.pop(key, None)
    return False


ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*")
ap.add_argument("--tries", type=int, default=8)
ap.add_argument("--floors", action="store_true")
ap.add_argument("--mockups", action="store_true")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--every", action="store_true", help="draw every one of --tries (from --seed) and keep --pick, or the first to pass")
ap.add_argument("--pick", type=int, default=0, help="with --every: the seed chosen by eye")
ap.add_argument("--plans", action="store_true", help="only write the plans (control pictures) of the pieces named, to look at")
ap.add_argument("--side-on", action="store_true", help="draw e and w facings over the side-on plan (plan_side): the facings the first plans never got square")
ap.add_argument("--plain", action="store_true", help="the ship's pieces over the plain plans of their boxes, not their sketches (as before step 8)")
ap.add_argument("--from-front", action="store_true", help="draw e, w and n facings over a plan made from the piece's own front facing, turned (plan_from_front)")
args = ap.parse_args()
SIDE_ON = args.side_on
SKETCHES = not args.plain
FROM_FRONT = args.from_front
os.makedirs(OUT, exist_ok=True)
os.makedirs(CONTROL, exist_ok=True)

if args.mockups:
    for name, subject in MOCKUPS_SUBJECTS.items():
        if args.names and name not in args.names:
            continue
        wait_turn()
        out = os.path.join(MOCKUPS, f"{name}-{args.seed}.png")
        comfy.txt2img(MOCKUP.format(subject=subject), out, seed=args.seed, width=1280, height=720)
        print(out)
elif args.plans:
    for n in args.names:
        for face in PIECES[n][3]:
            im, _ = plan_hangar(n, face) if n in HANGAR_PIECES else plan_from_front(n, face) if FROM_FRONT and face in "ewn" else plan_piece(n, face)
            im.save(os.path.join(CONTROL, f"control-{n}-{face}.png"))
            print(os.path.join(CONTROL, f"control-{n}-{face}.png"))
elif args.floors:
    for name in args.names or SUBJECTS:
        recipe, subject, kind = SUBJECTS[name]
        wait_turn()
        im = plan_flat(kind)
        control = os.path.join(CONTROL, f"control-{name}.png")
        im.save(control)
        out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
        comfy.txt2img(recipe.format(subject=subject), out, seed=args.seed, width=im.width, height=im.height, control=control, strength=0.6)
        print(out)
else:
    picks = json.load(open(PICKS)) if os.path.exists(PICKS) else {}
    want = []
    for n in args.names or PIECES:
        if n in PIECES:
            want += [(n, f) for f in PIECES[n][3]]
        else:
            base, face = n.rsplit("-", 1)
            want.append((base, face))
    failed = []
    for name, face in want:
        if not draw_piece(name, face, args.tries, picks, args.every, args.seed, args.pick):
            failed.append(f"{name}-{face}")
        # (merged into what is on disk: another run may be drawing other pieces at the same time)
        disk = json.load(open(PICKS)) if os.path.exists(PICKS) else {}
        key = f"{name}-{face}"
        if key in picks:
            disk[key] = picks[key]
        else:
            disk.pop(key, None)
        json.dump(disk, open(PICKS, "w"), indent=1, sort_keys=True)
    print(f"{len(want) - len(failed)} of {len(want)} pass" + (f"; none of {args.tries} tries passed for: {', '.join(failed)}" if failed else ""))
