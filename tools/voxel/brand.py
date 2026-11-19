# /// script
# dependencies = ["numpy", "pillow", "scipy"]
# ///
"""Turns the brand's pictures (tools/gen/brand.py) into true pixel art: the mark, the wordmark and the banner.

  uv run tools/voxel/brand.py            # everything, into static/brand, and a sheet of it all, art/brand/sheet.png
  uv run tools/voxel/brand.py --measure  # how big the model's own pixels are in each try

Every piece is a true shrink (each game pixel takes the middle colour of the patch of picture it covers), held to a
small palette of its own, cleaned of specks, with a dark rim; never a picture scaled. Larger copies are those pixels
repeated whole (nearest neighbour), named @2x, @3x or by their size.

- The mark: the shield cut from its picture and shrunk to 128, 64 and 32 pixels, each its own shrink. The model
  draws about 130 of its own pixels across the shield, so a 256 would be made up: mark-256.png is the 128 doubled.
- The wordmark: the letters keep the plan's outline exactly (art/brand/guides/word-plan.npy, drawn on the wordmark's
  own grid by tools/gen/brand.py); only their colours come from the model's picture. 336 by 64 game pixels.
- The banner: the model's sky shrunk to 640 by 200, the mark and the wordmark laid on it, then doubled to 1280 by 400.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TRIES = os.path.join(ROOT, "art", "brand", "tries")
GUIDES = os.path.join(ROOT, "art", "brand", "guides")
OUT = os.path.join(ROOT, "static", "brand")
SHEET = os.path.join(ROOT, "art", "brand", "sheet.png")

# which try of each was chosen (looked at side by side; the rest stay in art/brand/tries)
PICKS = {"mark": "mark-b-6.png", "word": "word-1.png", "sky": "sky-4.png"}
CELL = 4  # picture pixels to a letter pixel in the wordmark's plan (tools/gen/brand.py CELL)
RIM = (30, 10, 12)  # the dark rim round everything: a red-black, warmer than the space behind
SHADOW = (12, 4, 8)


def load(path):
    return np.asarray(Image.open(path).convert("RGB")).astype(np.int32)


def save(rgba, path, scale=1):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im = Image.fromarray(rgba.astype(np.uint8), "RGBA")
    if scale > 1:
        im = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
    im.save(path)
    print(" ", os.path.relpath(path, ROOT), im.size)
    return path


def pixel_size(rgb):
    """how many picture pixels wide the model's own pixels are: the commonest length of a run of one colour
    along rows and columns, counting only runs inside the thing (not the black around it)"""
    lum = rgb.sum(axis=2)
    runs = []
    for a, l in ((rgb, lum), (rgb.transpose(1, 0, 2), lum.T)):
        same = (np.abs(np.diff(a, axis=1)).sum(axis=2) < 24) & (l[:, 1:] > 60)
        for row in same[::7]:
            n = 0
            for s in row:
                if s:
                    n += 1
                elif n:
                    runs.append(n + 1)
                    n = 0
    runs = np.array([r for r in runs if 2 <= r <= 40])
    if not len(runs):
        return None
    counts = np.bincount(runs)
    return int(counts[3:].argmax() + 3), float(np.median(runs))


def palette(colours, n):
    """n colours of the picture's own, by median cut"""
    px = colours.astype(np.uint8).reshape(1, -1, 3)
    q = Image.fromarray(px).quantize(n, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return np.asarray(q.getpalette()[: n * 3]).reshape(-1, 3).astype(np.int32)


def held(img, inside, n):
    """the picture held to a palette of n colours of its own; returns the picture and each pixel's index"""
    pal = palette(img[inside], n)
    flat = img.reshape(-1, 3)[:, None, :]
    idx = ((flat - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1).reshape(img.shape[:2])
    return pal, idx


def despeck(idx, inside, passes=2):
    """a pixel like none of its four neighbours takes the commonest of theirs (specks read as noise)"""
    idx = idx.copy()
    h, w = idx.shape
    for _ in range(passes):
        changed = 0
        for y in range(h):
            for x in range(w):
                if not inside[y, x]:
                    continue
                near = [idx[yy, xx] for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1))
                        if 0 <= yy < h and 0 <= xx < w and inside[yy, xx]]
                if len(near) >= 3 and idx[y, x] not in near:
                    vals, counts = np.unique(near, return_counts=True)
                    idx[y, x] = vals[counts.argmax()]
                    changed += 1
        if not changed:
            break
    return idx


def evened(idx, region, passes):
    """each pixel of a region takes the commonest colour of the nine round it"""
    idx = idx.copy()
    h, w = idx.shape
    for _ in range(passes):
        nxt = idx.copy()
        for y, x in zip(*np.nonzero(region)):
            patch = idx[max(0, y - 1) : y + 2, max(0, x - 1) : x + 2].ravel()
            vals, counts = np.unique(patch, return_counts=True)
            nxt[y, x] = vals[counts.argmax()]
        idx = nxt
    return idx


def rimmed(img, inside, shadow=False):
    """the thing with a dark rim one pixel wide round it (and, if asked, a shadow a pixel down and right)"""
    rim = ndimage.binary_dilation(inside, structure=np.ones((3, 3))) & ~inside
    out = np.zeros(inside.shape + (4,), np.uint8)
    if shadow:
        body = inside | rim
        sh = np.zeros_like(body)
        sh[1:, 1:] = body[:-1, :-1]
        sh &= ~body
        out[sh, :3] = SHADOW
        out[sh, 3] = 255
    out[rim, :3] = RIM
    out[rim, 3] = 255
    out[inside, :3] = img[inside]
    out[inside, 3] = 255
    return out


# ── the mark


def cut(rgb):
    """the shield in its picture: its biggest piece that is not the black background, holes filled"""
    solid = rgb.max(axis=2) > 40
    solid = ndimage.binary_opening(solid, iterations=3)
    labels, n = ndimage.label(solid)
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    return ndimage.binary_fill_holes(labels == sizes.argmax() + 1)


def shrink_disc(rgb, mask, d, zoom=1.0):
    """down to a disc `d` pixels across: each pixel takes the median of the patch it covers; the disc's outline is
    a true circle (the shield's), so it steps evenly round. `zoom` below 1 takes only that much of the shield's
    radius (its face, inside the rim)"""
    ys, xs = np.nonzero(mask)
    cy, cx = (ys.min() + ys.max() + 1) / 2, (xs.min() + xs.max() + 1) / 2
    r = max(ys.max() + 1 - ys.min(), xs.max() + 1 - xs.min()) / 2 * zoom
    cell = 2 * r / d
    small = np.zeros((d, d, 3), np.int32)
    yy, xx = np.mgrid[0:d, 0:d]
    inside = (yy + 0.5 - d / 2) ** 2 + (xx + 0.5 - d / 2) ** 2 <= (d / 2) ** 2
    for k in range(d):
        for i in range(d):
            if not inside[k, i]:
                continue
            ya, xa = int(cy - r + k * cell), int(cx - r + i * cell)
            patch = rgb[ya : max(ya + 1, int(cy - r + (k + 1) * cell)), xa : max(xa + 1, int(cx - r + (i + 1) * cell))]
            small[k, i] = np.median(patch.reshape(-1, 3), axis=0)
    return small, inside


# the mark's parts by their grey in its plan (tools/gen/brand.py mark_plan), and how many colours each gets of its
# own: held to one palette for the whole shield, the bronze took nearly all of them and the suns went flat
PARTS = {"rim": ((150,), 0.22), "face": ((60,), 0.2), "sun": ((230,), 0.14), "rays": ((200,), 0.1),
         "dwarf": ((175,), 0.1), "ship": ((0, 30, 45, 100, 140, 205, 240), 0.24)}


def parts_palette(small, inside, plan_small, colours):
    """a palette made of each part's own colours (its share of `colours`), so every part keeps its ramp"""
    pals = []
    for greys, share in PARTS.values():
        here = inside & np.isin(plan_small, greys)
        if here.sum() < 4:
            continue
        pals.append(palette(small[here], max(2, round(colours * share))))
    return np.unique(np.concatenate(pals), axis=0)


def shrink_plan(plan, mask, d, zoom=1.0):
    ys, xs = np.nonzero(mask)
    cy, cx = (ys.min() + ys.max() + 1) / 2, (xs.min() + xs.max() + 1) / 2
    r = max(ys.max() + 1 - ys.min(), xs.max() + 1 - xs.min()) / 2 * zoom
    cell = 2 * r / d
    out = np.zeros((d, d), np.int32)
    for k in range(d):
        for i in range(d):
            ya, xa = int(cy - r + k * cell), int(cx - r + i * cell)
            patch = plan[ya : max(ya + 1, int(cy - r + (k + 1) * cell)), xa : max(xa + 1, int(cx - r + (i + 1) * cell))]
            vals, counts = np.unique(patch, return_counts=True)
            out[k, i] = vals[counts.argmax()]
    return out


def mark(path, size, colours):
    rgb = load(path)
    plan = load(os.path.join(GUIDES, "mark-control.png"))[..., 0]
    mask = cut(rgb)
    small, inside = shrink_disc(rgb, mask, size - 2)
    # the plan shrunk the same way, onto the picture's own disc (each pixel the commonest grey of its patch)
    plan_small = shrink_plan(plan, mask, size - 2)
    if size <= 32:
        # at the size of a tab's icon the rim is two pixels and the face fills the rest: the suns and the ship are
        # what must read, so the face is shrunk on its own into the middle (still a true shrink of it)
        d, ring = size - 2, 2
        core, core_in = shrink_disc(rgb, mask, d - 2 * ring, FACE)
        core_plan = shrink_plan(plan, mask, d - 2 * ring, FACE)
        small[ring:-ring, ring:-ring][core_in] = core[core_in]
        plan_small[ring:-ring, ring:-ring][core_in] = core_plan[core_in]
    pal = parts_palette(small, inside, plan_small, colours)
    flat = small.reshape(-1, 3)[:, None, :]
    idx = ((flat - pal[None, :, :]) ** 2).sum(axis=2).argmin(axis=1).reshape(small.shape[:2])
    idx = despeck(idx, inside)
    if size <= 64:
        # small, the face's patina is only noise round the suns and the ship: even it out
        idx = evened(idx, inside & (plan_small == 60), 2 if size == 32 else 1)
    art = edge(pal[idx], small, inside, size)
    art = np.pad(art, ((1, 1), (1, 1), (0, 0)))
    return rimmed(art, np.pad(inside, 1))


# the Greek key round the shield's rim, one turn to six pixels along it and five across (as the wordmark's)
FACE = 0.8  # how much of the shield's radius is its face, inside the rim (tools/gen/brand.py mark_plan: ri)
KEY = np.array([[1, 1, 1, 1, 1, 0], [1, 0, 0, 0, 1, 0], [1, 0, 1, 1, 1, 0], [1, 0, 0, 0, 0, 0], [1, 1, 1, 1, 1, 1]], bool)


def edge(art, small, inside, size):
    """the shield's rim on the grid. The model's meander shrinks to scraps, so the rim is laid here as a pattern of
    raised and sunk pixels, each taking the nearest of the rim's own lit or shadowed colours (so the model's light
    across the rim stays): at 128 a Greek key between two lips, at 64 a ring of beads as on a coin, at 32 a plain
    lip and groove"""
    d = art.shape[0]
    yy, xx = np.mgrid[0:d, 0:d]
    dy, dx = yy + 0.5 - d / 2, xx + 0.5 - d / 2
    rr = np.hypot(dx, dy)
    ang = (np.arctan2(dy, dx) + np.pi) / (2 * np.pi)
    band = {128: 7, 64: 4, 32: 2}[size]
    ring = inside & (rr >= d / 2 - band)
    depth = ((d / 2 - rr) / band * band).astype(int).clip(0, band - 1)  # 0 at the outer edge
    if size == 128:
        units = 52
        raised = np.zeros_like(ring)
        row = depth - 1  # the lips are rows 0 and 6
        u = (ang * units * 6).astype(int) % 6
        key = (row >= 0) & (row <= 4)
        raised[key] = KEY[row[key], u[key]]
        raised |= (depth == 0) | (depth == band - 1)
    elif size == 64:
        beads = 36
        u = (ang * beads * 3).astype(int) % 3
        raised = (depth == 0) | (depth == band - 1) | ((depth >= 1) & (depth <= 2) & (u == 1))
    else:
        raised = depth == 0
    tones = palette(small[ring], 6)
    tones = tones[np.argsort(tones.sum(axis=1))]
    out = art.copy()
    for want, pick in ((True, tones[3:]), (False, tones[:2])):
        here = ring & (raised == want)
        px = small[here][:, None, :]
        out[here] = pick[((px - pick[None]) ** 2).sum(axis=2).argmin(axis=1)]
    return out


# ── the wordmark


def wordmark(path):
    """the plan's letters in the model's colours: each letter pixel the median of the bright part of its cell"""
    rgb = load(path)
    plan = np.load(os.path.join(GUIDES, "word-plan.npy"))
    h, w = plan.shape
    img = np.zeros((h, w, 3), np.int32)
    for k in range(h):
        for i in range(w):
            if not plan[k, i]:
                continue
            patch = rgb[k * CELL : (k + 1) * CELL, i * CELL : (i + 1) * CELL].reshape(-1, 3)
            lit = patch[patch.sum(axis=1) > 120]
            img[k, i] = np.median(lit if len(lit) else patch, axis=0)
    inside = plan > 0
    # the key (3) was drawn as plain rules by the model: it takes the small letters' colours row by row
    small = plan == 2
    rows = np.nonzero(small.any(axis=1))[0]
    for k in np.nonzero((plan == 3).any(axis=1))[0]:
        near = rows[np.abs(rows - k).argmin()]
        img[k, plan[k] == 3] = np.median(img[near][small[near]], axis=0)
    pal, idx = held(img, inside, 12)
    idx = despeck(idx, inside & (plan != 3), passes=1)
    art = pal[idx]
    art = np.pad(art, ((2, 2), (2, 2), (0, 0)))
    out = rimmed(art, np.pad(inside, 2), shadow=True)
    ys, xs = np.nonzero(out[..., 3])
    return out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]


# ── the banner


def sky(path, w, h):
    """the sky shrunk to w by h: a star stays a star (each pixel the brightest of its patch where that is far
    brighter than the patch's middle, else the middle), held to a palette"""
    rgb = load(path)
    H, W = rgb.shape[:2]
    cy, cx = H / h, W / w
    out = np.zeros((h, w, 3), np.int32)
    for k in range(h):
        for i in range(w):
            p = rgb[int(k * cy) : int((k + 1) * cy), int(i * cx) : int((i + 1) * cx)].reshape(-1, 3)
            mid = np.median(p, axis=0)
            top = p[p.sum(axis=1).argmax()]
            out[k, i] = top if top.sum() > mid.sum() + 180 else mid
    inside = np.ones((h, w), bool)
    pal, idx = held(out, inside, 32)
    return pal[idx]


def banner(sky_rgb, mark_rgba, word_rgba):
    """the mark held up in front of the gold sun, its light a halo round the shield, and the wordmark in the dark
    towards the red dwarf"""
    h, w = sky_rgb.shape[:2]
    out = np.zeros((h, w, 4), np.uint8)
    out[..., :3] = sky_rgb
    out[..., 3] = 255
    left = sky_rgb[:, : w // 2].astype(np.int32)
    gold = (left[..., 0] > 200) & (left[..., 1] > 120)
    xs = np.nonzero(gold)[1]
    sx = int(xs.mean())
    mh, mw = mark_rgba.shape[:2]
    mx = max(8, sx - mw // 2)
    my = (h - mh) // 2
    right = sky_rgb[:, w // 2 :].astype(np.int32)
    red_x = w // 2 + int(np.nonzero(((right[..., 0] > 120) & (right[..., 1] < 90)).any(axis=0))[0].mean())
    # (in the middle of the dark between them, but never nearer the shield than 10 pixels: the red dwarf's limb
    # may run behind the last letter, the rim keeps it read)
    wx = max(mx + mw + 10, (mx + mw + red_x - word_rgba.shape[1]) // 2)
    wy = (h - word_rgba.shape[0]) // 2
    for art, x, y in ((mark_rgba, mx, my), (word_rgba, wx, wy)):
        a = art[..., 3] > 0
        out[y : y + art.shape[0], x : x + art.shape[1]][a] = art[a]
    return out


def contact(pieces, path):
    """the pieces side by side on the game's night blue and on white, each at 2x"""
    scale = 2
    ims = [Image.fromarray(p.astype(np.uint8), "RGBA") for p in pieces]
    ims = [im.resize((im.width * scale, im.height * scale), Image.NEAREST) for im in ims]
    width = sum(im.width for im in ims) + 16 * (len(ims) + 1)
    height = max(im.height for im in ims) + 32
    sheet = Image.new("RGBA", (width, height * 2), (14, 18, 36, 255))
    sheet.paste((236, 232, 222, 255), (0, height, width, height * 2))
    x = 16
    for im in ims:
        for row in (0, height):
            sheet.alpha_composite(im, (x, row + 16))
        x += im.width + 16
    sheet.save(path)
    print(" ", os.path.relpath(path, ROOT))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--measure", action="store_true")
    a = ap.parse_args()
    if a.measure:
        for name in sorted(os.listdir(TRIES)):
            print(name, pixel_size(load(os.path.join(TRIES, name))))
        return
    src = {k: os.path.join(TRIES, v) for k, v in PICKS.items()}
    marks = {}
    for size, colours in ((128, 28), (64, 18), (32, 10)):
        marks[size] = mark(src["mark"], size, colours)
        save(marks[size], os.path.join(OUT, f"mark-{size}.png"))
    save(marks[128], os.path.join(OUT, "mark-256.png"), 2)
    word = wordmark(src["word"])
    save(word, os.path.join(OUT, "wordmark-1x.png"))
    save(word, os.path.join(OUT, "wordmark.png"), 2)
    save(word, os.path.join(OUT, "wordmark@3x.png"), 3)
    ban = banner(sky(src["sky"], 640, 200), marks[128], word)
    save(ban, os.path.join(OUT, "banner-1x.png"))
    save(ban, os.path.join(OUT, "banner.png"), 2)
    contact([marks[128], marks[64], marks[32], word], SHEET)


if __name__ == "__main__":
    sys.exit(main())
