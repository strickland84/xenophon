# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the interface's pictures (tools/gen/interface.py) into game pixels for the page.

Each side's emblem is cut out of its black background and shrunk three ways, each a true shrink (every
game pixel takes the middle colour of the patch it covers, then a palette of its own), never a picture
scaled: 64 pixels for the side's card, 32 for headers, 16 for lists and chat, where its outline (the
Nomarchy's triangle, the Anarchoi's diamond) is what reads. Each side's home becomes its card's picture
(256 by 144); the opening story's sky 336 by 144, and two fields of stars to anarchoi over it. The icons become 16 pixels square, the thing in 14 of them.

  uv run tools/voxel/interface.py
  uv run tools/voxel/interface.py --console   # rebuild only the menu icons and mouse pointers

Each hull's own picture (art/hulls/source) becomes its picture in the shop, 48 pixels square. Out come
static/emblems/nomarchy-64.png … anarchoi-16.png, hull-<name>.png and
static/ui/<icon>.png (and <icon>-24.png, 24 pixels, for the large tiles), and a sheet of them all, docs/art/gen/interface-art.png.
"""

import argparse
import glob
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from hud_icons import save_inventory_and_ranks, save_ui_icons

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "art", "interface", "source")
EMBLEMS = os.path.join(ROOT, "static", "emblems")
UI = os.path.join(ROOT, "static", "ui")
SHEET = os.path.join(ROOT, "docs", "art", "gen", "interface-art.png")

# which try of each was chosen (looked at side by side; the rest stay in art/interface/source)
PICKS = {
    "nomarchy": "emblem-nomarchy-c-4.png",
    "anarchoi": "emblem-anarchoi-5.png",
    "home-nomarchy": "home-nomarchy-2.png",
    "home-anarchoi": "home-anarchoi-2.png",
    "home-base-nomarchy": "home-base-nomarchy-5.png",
    "home-base-anarchoi": "home-base-anarchoi-5.png",
    "home-base-outpost": "home-base-outpost-1.png",
    "intro-sky": "intro-sky-7.png",
    "intro-stars": "intro-stars-1.png",
    "intro-stars-far": "intro-stars-4.png",
}
# how much sticks out of each emblem's outline to be trimmed (the Anarchoi's spar runs past its sail)
TRIM = {"nomarchy": 6, "anarchoi": 34}
def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int32)


def cut(rgb):
    """where the thing is in its picture: its biggest piece that is not the black background, holes filled"""
    solid = rgb.max(axis=2) > 40
    solid = ndimage.binary_opening(solid, iterations=2)
    labels, n = ndimage.label(solid)
    if n == 0:
        return solid
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.02]
    return ndimage.binary_fill_holes(np.isin(labels, keep))


def shrink(rgb, mask, longest):
    """down to game pixels: each takes the middle colour of the patch it covers"""
    ys, xs = np.nonzero(mask)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    cell = max(bottom - top, right - left) / longest
    h = max(1, int(round((bottom - top) / cell)))
    w = max(1, int(round((right - left) / cell)))
    small = np.zeros((h, w, 3), dtype=np.int32)
    inside = np.zeros((h, w), dtype=bool)
    for k in range(h):
        for i in range(w):
            ya, yb = int(top + k * cell), max(int(top + (k + 1) * cell), int(top + k * cell) + 1)
            xa, xb = int(left + i * cell), max(int(left + (i + 1) * cell), int(left + i * cell) + 1)
            patch = mask[ya:yb, xa:xb]
            if patch.size and patch.mean() > 0.45:
                inside[k, i] = True
                small[k, i] = np.median(rgb[ya:yb, xa:xb][patch], axis=0)
    return small, inside


def held(small, inside, n):
    """the picture held to a palette of n colours of its own"""
    px = small[inside].astype(np.uint8).reshape(1, -1, 3)
    q = Image.fromarray(px).quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.asarray(q.getpalette()[: n * 3]).reshape(-1, 3).astype(np.int32)
    flat = small.reshape(-1, 3)[:, None, :]
    idx = ((flat - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1).reshape(small.shape[:2])
    return pal[idx]


def outline(img, inside):
    """a dark rim one pixel wide round the thing, so it reads on any panel"""
    rim = ndimage.binary_dilation(inside) & ~inside
    out = np.zeros(inside.shape + (4,), dtype=np.uint8)
    out[inside, :3] = img[inside]
    out[inside, 3] = 255
    out[rim, :3] = (8, 10, 22)
    out[rim, 3] = 255
    return out


def square(rgba, size):
    """centred in a square of `size` pixels"""
    h, w = rgba.shape[:2]
    out = np.zeros((size, size, 4), dtype=np.uint8)
    y0, x0 = (size - h) // 2, (size - w) // 2
    out[y0 : y0 + h, x0 : x0 + w] = rgba
    return out


def sprite(path, longest, colours, size, trim=0):
    """a picture cut out, shrunk to `longest` pixels and held to `colours`, with a dark rim, in a square;
    `trim` opens away thin bits sticking out (the Anarchoi's spar past its sail) so the outline is the mark's"""
    rgb = load(path)
    mask = cut(rgb)
    if trim:
        # (close the dark seams first, so opening takes only what sticks out, not the thing in pieces)
        mask = ndimage.binary_fill_holes(ndimage.binary_closing(mask, iterations=trim // 2))
        mask = ndimage.binary_fill_holes(ndimage.binary_opening(mask, iterations=trim))
    small, inside = shrink(rgb, mask, longest)
    # (room for the rim inside the square)
    padded_small = np.pad(small, ((1, 1), (1, 1), (0, 0)))
    padded_inside = np.pad(inside, 1)
    return square(outline(held(padded_small, padded_inside, colours), padded_inside), size)


def save(rgba, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(path)
    return path


def hull_preview(rgba):
    """Mount the hull cutout in a small sensor-view frame used by the ship catalogue."""
    im = Image.new("RGBA", (48, 48))
    draw = ImageDraw.Draw(im)
    draw.polygon([(6, 2), (41, 2), (45, 6), (45, 41), (41, 45), (6, 45), (2, 41), (2, 6)], fill="#17243b")
    for x, y, dx, dy in ((4, 4, 1, 1), (43, 4, -1, 1), (4, 43, 1, -1), (43, 43, -1, -1)):
        draw.line([(x + dx * 5, y), (x, y), (x, y + dy * 5)], fill="#517082")
    im.alpha_composite(Image.fromarray(rgba))
    return np.asarray(im)


def faction_icon(rgba, side):
    """Keep the faction emblem's shape and give each faction a matching metal palette."""
    warm = [(68, 42, 42), (149, 81, 49), (231, 157, 79), (255, 218, 152), (255, 244, 208)]
    cool = [(41, 32, 66), (92, 69, 132), (150, 115, 192), (202, 171, 247), (238, 222, 255)]
    solid = rgba[..., 3] > 0
    light = (rgba[..., :3] * [0.299, 0.587, 0.114]).sum(axis=-1)
    paint = solid & (light > 22)
    rgba[paint, :3] = np.array(warm if side == "nomarchy" else cool)[np.digitize(light[paint], [70, 115, 165, 215])]
    return rgba


CONSOLE = ("map", "board", "pilots", "sheet", "squad", "ghost", "look", "settings", "story", "menu", "key")


def console_art():
    """Export the native-pixel glyphs and dedicated mouse pointers from their source strips."""
    source = os.path.join(ROOT, "art", "interface")
    glyphs = Image.open(os.path.join(source, "console-icons.png")).convert("RGBA")
    pointers = Image.open(os.path.join(source, "console-cursors.png")).convert("RGBA")
    if glyphs.size != (20 * len(CONSOLE), 20) or pointers.size != (64, 32):
        raise ValueError("the console source strips have the wrong dimensions")
    made = []
    for i, name in enumerate(CONSOLE):
        glyph = glyphs.crop((20 * i, 0, 20 * (i + 1), 20))
        large = Image.new("RGBA", (24, 24))
        large.paste(glyph, (2, 2))
        small = glyph.resize((16, 16), Image.Resampling.NEAREST)
        made.append(save(np.asarray(small), os.path.join(UI, f"{name}.png")))
        made.append(save(np.asarray(large), os.path.join(UI, f"{name}-24.png")))
    arrow = pointers.crop((0, 0, 32, 32))
    reticle = pointers.crop((32, 0, 64, 32))
    for name, pointer in (("cursor-32", arrow), ("reticle-32", reticle)):
        made.append(save(np.asarray(pointer), os.path.join(UI, f"{name}.png")))
    for name, size in (("cursor", 16), ("cursor-24", 24)):
        made.append(save(np.asarray(arrow.resize((size, size), Image.Resampling.NEAREST)), os.path.join(UI, f"{name}.png")))
    return made


parser = argparse.ArgumentParser()
parser.add_argument("--console", action="store_true", help="only rebuild the interface, inventory and rank icons and pointers")
args = parser.parse_args()
made = console_art() + save_ui_icons() + save_inventory_and_ranks()
if args.console:
    raise SystemExit(0)

# ── the emblems, three sizes each
for side in ("nomarchy", "anarchoi"):
    src = os.path.join(SRC, PICKS[side])
    for size, colours in ((64, 28), (32, 18), (16, 10)):
        art = sprite(src, size - 2, colours, size, trim=TRIM[side])
        made.append(save(faction_icon(art, side), os.path.join(EMBLEMS, f"{side}-{size}.png")))

# ── each kind of base, over its screen: the whole picture shrunk to 256 by 144, held to 40 colours. (Each side's home,
# for its card, is drawn by the game itself since the fresh review, whose paintings flew jet fighters: tools/side-cards.ts.)
for key in ("home-base-nomarchy", "home-base-anarchoi", "home-base-outpost"):
    im = Image.open(os.path.join(SRC, PICKS[key])).convert("RGB")
    rgb = np.asarray(im).astype(np.int32)
    h, w = 144, 256
    cell = rgb.shape[1] / w
    small = np.zeros((h, w, 3), dtype=np.int32)
    for k in range(h):
        for i in range(w):
            patch = rgb[int(k * cell) : int((k + 1) * cell), int(i * cell) : int((i + 1) * cell)].reshape(-1, 3)
            small[k, i] = np.median(patch, axis=0)
    out = held(small, np.ones((h, w), dtype=bool), 40)
    rgba = np.concatenate([out.astype(np.uint8), np.full((h, w, 1), 255, dtype=np.uint8)], axis=2)
    made.append(save(rgba, os.path.join(UI, f"{key}.png")))

# ── the opening story's sky (IntroCrawl.svelte): the whole picture shrunk to 336 by 144 (its own pixel-art pixels are
# about five of the picture's, so no more than that), held to 160 colours (fewer lose the suns' faces); and two fields
# of stars cut out of black to drift in front of it at their own paces, each game pixel the brightest of its patch (a
# middle colour loses a star)
SKY_W, SKY_H = 336, 144


def patches(rgb, w, h):
    """each game pixel's patch of the picture, as (row, column, pixels)"""
    cy, cx = rgb.shape[0] / h, rgb.shape[1] / w
    for k in range(h):
        for i in range(w):
            yield k, i, rgb[int(k * cy) : int((k + 1) * cy), int(i * cx) : int((i + 1) * cx)].reshape(-1, 3)


sky = load(os.path.join(SRC, PICKS["intro-sky"]))
small = np.zeros((SKY_H, SKY_W, 3), dtype=np.int32)
for k, i, patch in patches(sky, SKY_W, SKY_H):
    small[k, i] = np.median(patch, axis=0)
out = held(small, np.ones((SKY_H, SKY_W), dtype=bool), 160)
rgba = np.concatenate([out.astype(np.uint8), np.full((SKY_H, SKY_W, 1), 255, dtype=np.uint8)], axis=2)
made.append(save(rgba, os.path.join(UI, "intro-sky.png")))
for key in ("intro-stars", "intro-stars-far"):
    field = load(os.path.join(SRC, PICKS[key]))
    rgba = np.zeros((SKY_H, SKY_W, 4), dtype=np.uint8)
    for k, i, patch in patches(field, SKY_W, SKY_H):
        lum = patch.sum(axis=1)
        best = patch[lum.argmax()]
        # (a star, not the picture's faint grain or its edge)
        if best.sum() > 3 * 110 and 2 <= k < SKY_H - 2 and 2 <= i < SKY_W - 2:
            rgba[k, i, :3] = best
            rgba[k, i, 3] = 255
    made.append(save(rgba, os.path.join(UI, f"{key}.png")))

# ── each hull from above, for the shop and the bench: its own picture (art/hulls/source, the one its voxels
# were made from), pointing up, 40 pixels long in a square of 48
HULLS = os.path.join(ROOT, "art", "hulls", "source")
for path in sorted(glob.glob(os.path.join(HULLS, "*-2.png"))):
    name = os.path.basename(path)[: -len("-2.png")]
    made.append(save(hull_preview(sprite(path, 42, 24, 48)), os.path.join(UI, f"hull-{name}.png")))

# ── a sheet of them all, four times their size
pics = [Image.open(p).convert("RGBA") for p in made]
scale = 4
cols = 10
cw = max(p.width for p in pics if p.width <= 64) * scale + 8
rows_small = [p for p in pics if p.width <= 64]
homes = [p for p in pics if p.width > 64]
rows = (len(rows_small) + cols - 1) // cols
hw = homes[0].width * 2 + 8 if homes else 0
sheet = Image.new("RGBA", (max(cols * cw, len(homes) * hw), rows * cw + (homes[0].height * 2 + 8 if homes else 0)), (28, 31, 43, 255))
for n, p in enumerate(rows_small):
    big = p.resize((p.width * scale, p.height * scale), Image.NEAREST)
    sheet.alpha_composite(big, ((n % cols) * cw + 4, (n // cols) * cw + 4))
for n, p in enumerate(homes):
    sheet.alpha_composite(p.resize((p.width * 2, p.height * 2), Image.NEAREST), (n * hw + 4, rows * cw + 4))
os.makedirs(os.path.dirname(SHEET), exist_ok=True)
sheet.save(SHEET)
print(f"{len(made)} pictures; the sheet in {os.path.relpath(SHEET, ROOT)}")
