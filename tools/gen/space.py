# /// script
# dependencies = ["pillow"]
# ///
"""Draws space (Phase 6) with the image model: the gas giants' cloud bands, a star's surface,
the nebulae behind everything, asteroids (bare and with ore), the parts stations are built from,
a jump gate's ring, a derelict hulk, a black hole's disc and the void shards near it.

  uv run tools/gen/space.py                  # every one, into art/space/source
  uv run tools/gen/space.py gate asteroids   # only these
  uv run tools/gen/space.py gate --seed 3    # another try at one

Two recipes, each one style shared by everything drawn with it, so a set comes out in one look:
change the recipe here, never a single prompt. Things seen from above (sprites) follow a grey plan
of their shape on black (art/space/control), which also cuts them out afterwards; flat maps that
wrap round a sphere or fill the sky (textures) are drawn whole. tools/voxel/space.py shrinks them
all into game pixels. The look follows the mockups art/mockups/space-*.png.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import math
import os
import random
import sys
import time

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "space", "source")
CONTROL = os.path.join(ROOT, "art", "space", "control")

# things seen from above, cut out of black
SPRITE = (
    "pixel art game sprite seen from directly above, strict top-down orthographic view, {subject}, "
    "crisp chunky pixels, limited colour palette, hard edges, no anti-aliasing, no blur, 16-bit era, "
    "lit from the top left, plain flat black background, no text"
)
# maps that fill the picture edge to edge
TEXTURE = (
    "{subject}, a flat texture filling the whole picture from edge to edge with no border, "
    "16-bit era pixel art, crisp pixels, rich limited colour palette, no text, no planet outline"
)

BANDS = "a seamless rectangular texture of a gas giant's cloud tops seen flat, horizontal stripes of many widths running straight across the entire frame from the left edge to the right edge, {colours}, turbulent wavy edges and curling eddies between the stripes, small pale storm ovals, one large oval storm, no planet, no sphere, no globe, no ellipse, no border"
NEBULA = "deep space seen from far away: faint soft wisps and clouds of {colours} nebula gas with dark dust lanes over black, very dark overall, a scatter of tiny faint stars"

TEXTURES = {
    "giant-cream": (BANDS.format(colours="cream, pale ochre, tan, rust and chocolate brown"), 1024, 512),
    "giant-rust": (BANDS.format(colours="deep rust red, orange, salmon, cream and dark maroon"), 1024, 512),
    "giant-teal": (BANDS.format(colours="pale teal, cyan, deep blue, white and navy"), 1024, 512),
    "giant-violet": (BANDS.format(colours="lavender, deep violet, rose pink, cream and indigo"), 1024, 512),
    "giant-olive": (BANDS.format(colours="olive green, pale yellow, khaki, sage and dark brown"), 1024, 512),
    "sun": ("the boiling surface of a star seen up close: a dense pattern of bright round granules separated by thin darker lanes, a few dark sunspots with paler rims, glowing yellow and white", 1024, 1024),
    "nebula-violet": (NEBULA.format(colours="violet, indigo and magenta"), 1024, 1024),
    # (polish step 9: close to, a sun and a giant were a flat wall; these are their surfaces seen near, laid over the far maps
    # at a finer scale by the renderer, as brightness)
    "sun-near": ("a flat seamless texture of boiling glowing plasma seen face on: a dense honeycomb of bright rounded granule cells, each with a hot pale middle, separated by thin dark orange lanes, a few small dark sunspots with ragged paler fringes, glowing white, yellow and orange, no sphere, no planet, no horizon, no edge, no black", 1024, 1024),
    "giant-near": ("a flat seamless texture of turbulent cloud belts seen face on: long horizontal belts of cloud torn into curling eddies, swirling vortices and rolling waves along their edges, small white storm ovals, wisps streaming sideways, soft shading between light and dark belts, greyscale shades of white and grey only, no sphere, no planet, no horizon, no edge, no black", 1024, 1024),
    "nebula-blue": (NEBULA.format(colours="teal, blue and pale cyan"), 1024, 1024),
    "nebula-red": (NEBULA.format(colours="crimson, rust and amber"), 1024, 1024),
}

ROCK = "a single lumpy angular asteroid of grey and brown stone with craters, cracks and sharp facets, a dark shadowed side"
ORE = "{rock}, split open by a deep crack packed with a cluster of {crystals}"
STATION = "a module of a space station, chunky hull plates with panel seams, rivets and small lit windows"
SPRITES = {
    **{f"rock-{i}": ROCK for i in range(1, 7)},
    "ore-ferrite": ORE.format(rock=ROCK, crystals="chunky rust red and dark gunmetal metallic ore crystals with shiny flecks"),
    "ore-silica": ORE.format(rock=ROCK, crystals="sharp pale white and faint blue quartz crystals"),
    "ore-ice": ORE.format(rock=ROCK, crystals="bright glowing cyan ice crystals"),
    "hub-nomarchy": f"{STATION}: the grand armoured central hub of a faction capital, a heavy round core of polished dark navy blue hull plates with bright gold trim and gold panel edges, a raised round command dome in its middle ringed with lit windows, four heavy docking collars on its sides, small blinking lights",
    "hub-anarchoi": f"{STATION}: the central hub of a scrappy pirate capital welded together from mismatched rusty orange and brown hull plates and salvaged ship parts, yellow and black hazard stripes, cargo containers bolted on, sparks of welding light",
    "hub-outpost": f"{STATION}: the round central hub of a small frontier outpost, plain grey hull plates, four short docking stubs, a ring of small windows, blinking lights",
    "arm": f"{STATION}: a long straight docking arm lying across the picture, a boxy corridor of grey hull plates with a row of small lit windows along it, ending at the right in a wide docking bay with an open hangar door and yellow guide lights",
    "solar": "a long flat solar panel wing of a space station: a grid of dark blue photovoltaic cells in a thin silver frame, a metal hinge at one end",
    "ring": "a round habitat ring of a space station seen from above: a wide circular band of grey modules with rows of lit windows, spokes to the middle, empty black centre",
    "tanks": "a cluster of five round fuel tanks of a space station, pale domed metal tops with grey rims, pipes between them",
    "turret": "a squat armoured gun turret of a space station: a round turret dome of dark gunmetal hull plates with gold trim on a round base ring, two long twin cannon barrels sticking straight out from it towards the top of the picture, a small lit sensor eye",
    "gate": "a huge jump gate: a thick ring built of twelve angular dark gunmetal segments with bright white lights at the joints between them and glowing blue conduits along them, empty black middle",
    "derelict": "the broken wreck of a space station split into three large torn pieces, dark scorched grey hull plates and exposed girders, burnt edges, small red sparks, scattered scrap",
    "accretion": "a black hole's accretion disc seen from directly above: a flat ring of swirling glowing gas spiralling inwards, bright white and yellow near its inner edge, orange then deep red further out, wisps and streaks, a perfectly black empty middle",
    "icon-helion": "a chunky item icon of a small rugged metal gas canister standing upright, a glass window glowing with pale amber helion gas, a yellow and black hazard band",
    "icon-void": "a chunky item icon of one sharp jagged void crystal shard glowing deep purple and magenta with a pale violet core",
    "shards": "a sprite sheet of nine separate floating void crystal shards in a three by three grid, each a sharp jagged crystal of glowing deep purple and magenta with a pale violet core",
}

S = 1024
GREY = 150
LIGHT = 205
DARK = 95


def blob(d, cx, cy, r, seed, fill):
    """a lumpy rock's outline: a ring of points at random radii"""
    rnd = random.Random(seed)
    n = 11
    pts = []
    for i in range(n):
        a = i / n * math.tau + rnd.random() * 0.3
        rr = r * (0.72 + rnd.random() * 0.32)
        pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
    d.polygon(pts, fill=fill)


def plan(name):
    """the grey plan of a sprite's shape on black: the model follows it, and it cuts the sprite out"""
    im = Image.new("RGB", (S, S), (0, 0, 0))
    d = ImageDraw.Draw(im)
    c = S // 2

    def octagon(r, fill, cx=c, cy=c):
        d.polygon([(cx + math.cos(math.tau * (i + 0.5) / 8) * r, cy + math.sin(math.tau * (i + 0.5) / 8) * r) for i in range(8)], fill=fill)

    def ring(r0, r1, fill, segments=0, gap=0.0):
        if not segments:
            d.ellipse([c - r1, c - r1, c + r1, c + r1], fill=fill)
            d.ellipse([c - r0, c - r0, c + r0, c + r0], fill=(0, 0, 0))
            return
        for i in range(segments):
            a0 = math.tau * i / segments + gap
            a1 = math.tau * (i + 1) / segments - gap
            pts = [(c + math.cos(a0 + (a1 - a0) * k / 6) * r1, c + math.sin(a0 + (a1 - a0) * k / 6) * r1) for k in range(7)]
            pts += [(c + math.cos(a1 - (a1 - a0) * k / 6) * r0, c + math.sin(a1 - (a1 - a0) * k / 6) * r0) for k in range(7)]
            d.polygon(pts, fill=fill)

    if name.startswith("rock-") or name.startswith("ore-"):
        seed = int(name[5:]) if name.startswith("rock-") else {"ore-ferrite": 11, "ore-silica": 12, "ore-ice": 13}[name]
        blob(d, c, c, 400, seed * 7 + 3, GREY)
        if name.startswith("ore-"):
            # a crack across it, full of crystals
            rnd = random.Random(seed)
            for k in range(5):
                a = rnd.random() * math.tau
                cx, cy = c + math.cos(a) * 120, c + math.sin(a) * 120
                s = 70 + rnd.random() * 40
                d.polygon([(cx, cy - s), (cx + s * 0.55, cy), (cx, cy + s), (cx - s * 0.55, cy)], fill=LIGHT)
    elif name == "icon-helion":
        d.rounded_rectangle([c - 200, c - 360, c + 200, c + 360], radius=60, fill=GREY)
        d.rectangle([c - 130, c - 200, c + 130, c + 150], fill=LIGHT)
    elif name == "icon-void":
        d.polygon([(c, c - 420), (c + 200, c - 60), (c + 120, c + 380), (c - 140, c + 360), (c - 210, c - 80)], fill=GREY)
        d.polygon([(c, c - 300), (c + 90, c - 40), (c - 80, c + 220)], fill=LIGHT)
    elif name == "shards":
        for i in range(9):
            x = 190 + (i % 3) * 322
            y = 190 + (i // 3) * 322
            r = [120, 92, 136, 76, 128, 104, 140, 86, 112][i]
            rnd = random.Random(i)
            for k in range(3):
                a = rnd.random() * math.tau
                l = r * (0.6 + 0.4 * rnd.random())
                w = r * 0.22
                tx, ty = x + math.cos(a) * l, y + math.sin(a) * l
                bx, by = x - math.cos(a) * l * 0.3, y - math.sin(a) * l * 0.3
                px, py = -math.sin(a) * w, math.cos(a) * w
                d.polygon([(bx + px, by + py), (tx, ty), (bx - px, by - py)], fill=LIGHT)
    elif name == "hub-nomarchy":
        octagon(380, GREY)
        d.ellipse([c - 190, c - 190, c + 190, c + 190], fill=LIGHT)
        d.ellipse([c - 90, c - 90, c + 90, c + 90], fill=GREY)
        for a in range(4):
            dx, dy = math.cos(a * math.pi / 2), math.sin(a * math.pi / 2)
            d.rectangle([c + dx * 400 - 70, c + dy * 400 - 70, c + dx * 400 + 70, c + dy * 400 + 70], fill=GREY)
    elif name == "hub-anarchoi":
        for x0, y0, x1, y1, f in [(-330, -200, 260, 220, GREY), (-160, -360, 140, -150, DARK), (130, -120, 380, 200, GREY), (-380, 120, -60, 360, DARK), (-120, -120, 160, 140, LIGHT)]:
            d.rectangle([c + x0, c + y0, c + x1, c + y1], fill=f)
    elif name == "hub-outpost":
        d.ellipse([c - 300, c - 300, c + 300, c + 300], fill=GREY)
        for dx, dy in [(1, 0), (0, 1), (-1, 0), (0, -1)]:
            # a docking stub out of each side
            x0, x1 = sorted([c + dx * 250, c + dx * 420])
            y0, y1 = sorted([c + dy * 250, c + dy * 420])
            if dx:
                y0, y1 = c - 70, c + 70
            else:
                x0, x1 = c - 70, c + 70
            d.rectangle([x0, y0, x1, y1], fill=GREY)
        d.ellipse([c - 150, c - 150, c + 150, c + 150], fill=LIGHT)
    elif name == "arm":
        d.rectangle([40, c - 70, 760, c + 70], fill=GREY)
        d.rectangle([40, c - 20, 760, c + 20], fill=LIGHT)
        d.rectangle([720, c - 180, 990, c + 180], fill=GREY)
        d.rectangle([880, c - 110, 990, c + 110], fill=(40, 40, 40))
    elif name == "solar":
        d.rectangle([40, c - 170, 900, c + 170], fill=GREY)
        for x in range(40, 900, 86):
            d.line([(x, c - 170), (x, c + 170)], fill=LIGHT, width=8)
        d.line([(40, c), (900, c)], fill=LIGHT, width=8)
        d.rectangle([900, c - 40, 1000, c + 40], fill=LIGHT)
    elif name == "ring":
        ring(300, 440, GREY)
        for a in range(4):
            ang = math.tau * a / 4 + math.pi / 4
            d.line([(c + math.cos(ang) * 80, c + math.sin(ang) * 80), (c + math.cos(ang) * 310, c + math.sin(ang) * 310)], fill=DARK, width=40)
        d.ellipse([c - 90, c - 90, c + 90, c + 90], fill=GREY)
    elif name == "tanks":
        for x, y, r in [(c, c, 160), (c - 300, c - 120, 130), (c + 300, c - 120, 130), (c - 200, c + 260, 130), (c + 200, c + 260, 130)]:
            d.ellipse([x - r, y - r, x + r, y + r], fill=GREY)
            d.ellipse([x - r * 0.55, y - r * 0.55, x + r * 0.55, y + r * 0.55], fill=LIGHT)
    elif name == "turret":
        d.ellipse([c - 260, c - 160, c + 260, c + 360], fill=GREY)
        d.ellipse([c - 170, c - 70, c + 170, c + 270], fill=LIGHT)
        for x in (c - 70, c + 70):
            d.rectangle([x - 34, c - 470, x + 34, c], fill=GREY)
    elif name == "gate":
        ring(330, 470, GREY, 12, 0.04)
        for i in range(12):
            a = math.tau * i / 12
            x, y = c + math.cos(a) * 400, c + math.sin(a) * 400
            d.ellipse([x - 26, y - 26, x + 26, y + 26], fill=LIGHT)
    elif name == "derelict":
        d.polygon([(c - 420, c - 80), (c - 160, c - 330), (c + 20, c - 200), (c - 60, c + 20), (c - 330, c + 140)], fill=GREY)
        d.polygon([(c + 60, c - 120), (c + 400, c - 60), (c + 330, c + 250), (c + 90, c + 160)], fill=GREY)
        d.polygon([(c - 280, c + 230), (c - 40, c + 150), (c + 20, c + 380), (c - 220, c + 420)], fill=DARK)
        for x, y, r in [(c - 60, c + 120, 30), (c + 220, c - 280, 26), (c - 420, c + 300, 22), (c + 420, c + 360, 24), (c + 120, c + 420, 18)]:
            d.ellipse([x - r, y - r, x + r, y + r], fill=GREY)
    elif name == "accretion":
        ring(150, 480, GREY)
        for k in range(5):
            pts = []
            for i in range(40):
                t = i / 39
                a = k * math.tau / 5 + t * 2.4
                r = 160 + t * 300
                pts.append((c + math.cos(a) * r, c + math.sin(a) * r))
            d.line(pts, fill=LIGHT, width=18)
        d.ellipse([c - 160, c - 160, c + 160, c + 160], fill=(0, 0, 0))
    return im


ap = argparse.ArgumentParser()
ap.add_argument("names", nargs="*", help="which pictures (all of them if none are given)")
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.75)
args = ap.parse_args()

os.makedirs(CONTROL, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
for name in args.names or [*TEXTURES, *SPRITES]:
    while comfy.busy():
        print("waiting for the queue to clear ...", file=sys.stderr)
        time.sleep(10)
    out = os.path.join(OUT, name + (f"-{args.seed}" if args.seed != 1 else "") + ".png")
    start = time.time()
    # (several drawn from one prompt, like the rocks, each take a seed of their own, or they come out alike)
    seed = args.seed + (int(name.split("-")[-1]) * 101 if name.split("-")[-1].isdigit() else 0)
    if name in TEXTURES:
        subject, w, h = TEXTURES[name]
        comfy.txt2img(TEXTURE.format(subject=subject), out, seed=seed, width=w, height=h)
    else:
        control = os.path.join(CONTROL, f"{name}.png")
        plan(name).save(control)
        comfy.txt2img(SPRITE.format(subject=SPRITES[name]), out, seed=seed, control=control, strength=args.strength)
    print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)")
