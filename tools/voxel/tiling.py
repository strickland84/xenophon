"""The tiling rule for the places inside, as code (CLAUDE.md, docs/pixel-art-techniques.md "Interiors: one projection"):
every piece is drawn top-down and square-on, its art exactly covering its footprint of whole tiles plus the height it
rises into the row behind. Shared by tools/gen/interiors.py (which asks the image model again until a try passes) and
tools/voxel/interiors.py (which turns the passing tries into game pixels).

  plan_box(w, h)            where the piece's art lies in its plan picture (the control the model follows)
  game_pixels(rgb, box, …)  the piece found in the model's picture, cut to its own outline, checked, and shrunk to its
                            size in game pixels; with why it fails the rule ('' if it passes)

What fails: a piece whose outline is not a rectangle square to the grid (a diamond, a box seen corner-on: its corners
empty, its bounding box half filled), one drawn the wrong shape for its footprint (a 2×1 drawn square), one drawn small
(less than half its plan), and one that is no piece at all (the plan painted flat: one colour all over). And, since the
fresh review (side facings that passed all that were orange and black static): one that is noise at game size (too
many pixels like none of their neighbours, no regions of one colour), and a facing whose colours are not its front
facing's (`noise`, `unlike`).
"""

import numpy as np
from scipy import ndimage

# px a tile is across in the game (data/interiors.ts TILE)
TILE = 8
# the plan pictures are this wide at most, and the piece's box this much of them
PLAN = 1024
FILL = 0.78


def size_of(across, deep, rise):
    """the piece's art in game pixels: its footprint's width, and its depth plus how far it rises into the row behind"""
    return int(round(across * TILE)), int(round((deep + rise) * TILE))


def plan_box(w, h):
    """the plan picture's size (multiples of 16) and the box the piece's art fills in it: (W, H, x0, y0, x1, y1)"""
    k = PLAN * FILL / max(w, h)
    bw, bh = w * k, h * k
    W = PLAN if w >= h else int(max(512, (bw / FILL)) // 16 * 16)
    H = PLAN if h >= w else int(max(512, (bh / FILL)) // 16 * 16)
    x0 = (W - bw) / 2
    y0 = (H - bh) / 2
    return W, H, int(round(x0)), int(round(y0)), int(round(x0 + bw)), int(round(y0 + bh))


def shrink(crop, w, h):
    """a picture down to w × h game pixels, each the middle colour of the patch it covers"""
    H, W = crop.shape[:2]
    out = np.zeros((h, w, 3), dtype=np.int32)
    for k in range(h):
        for i in range(w):
            patch = crop[int(k * H / h) : max(int((k + 1) * H / h), int(k * H / h) + 1), int(i * W / w) : max(int((i + 1) * W / w), int(i * W / w) + 1)]
            out[k, i] = np.median(patch.reshape(-1, 3), axis=0)
    return out


def background(rgb):
    """the plain background round the piece (black as asked, or whatever plain colour the model gave its edges): near
    the colour of the picture's border, and reached from it"""
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
    bg = np.median(border, axis=0)
    dark = np.abs(rgb - bg).sum(axis=2) < 60
    labels, _ = ndimage.label(dark)
    edge = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    return np.isin(labels, [x for x in edge if x != 0])


def slanting(rgb):
    """the share of a picture's strongest edges that are more than 15 degrees off level or upright"""
    g = (rgb * [0.3, 0.59, 0.11]).sum(axis=2)
    h, w = g.shape
    g = g[: h // 4 * 4, : w // 4 * 4].reshape(h // 4, 4, w // 4, 4).mean(axis=(1, 3))
    gx = ndimage.sobel(g, axis=1)
    gy = ndimage.sobel(g, axis=0)
    mag = np.hypot(gx, gy)
    strong = mag > np.percentile(mag, 92)
    ang = np.degrees(np.arctan2(gy, gx)) % 180
    off = np.minimum(np.abs(ang - 90), np.minimum(ang, 180 - ang))[strong]
    return float((off > 15).mean()) if off.size else 0.0


def game_pixels(rgb, box, w, h, flat=False, back=False, loose=False):
    """(pixels w × h, empty mask, why it fails or '') for the piece the model drew over the plan's box"""
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    # the piece: what is not background, its biggest piece, near the plan's box
    solid = ~background(rgb)
    solid = ndimage.binary_opening(solid, iterations=2)
    labels, n = ndimage.label(solid)
    if n == 0:
        return None, None, "nothing drawn"
    sizes = ndimage.sum(solid, labels, range(1, n + 1))
    piece = labels == (int(np.argmax(sizes)) + 1)
    ys, xs = np.nonzero(piece)
    top, bottom, left, right = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    pw, ph = right - left, bottom - top
    if pw < bw * 0.5 or ph < bh * 0.5:
        return None, None, f"drawn small ({pw}×{ph} of {bw}×{bh})"
    want, got = w / h, pw / ph
    if abs(np.log(got / want)) > np.log(1.6):
        return None, None, f"the wrong shape ({got:.2f} wide to tall, wants {want:.2f})"
    full = piece[top:bottom, left:right]
    if full.mean() < (0.95 if flat else 0.86):
        return None, None, f"not a rectangle: fills {full.mean():.0%} of its outline's box"
    c = max(2, min(pw, ph) // 20)
    for name, block in [("top left", full[:c, :c]), ("top right", full[:c, -c:]), ("bottom left", full[-c:, :c]), ("bottom right", full[-c:, -c:])]:
        if block.mean() < 0.3:
            return None, None, f"its {name} corner is empty"
    # (its edges square to the grid: a piece drawn turned or corner-on has many slanting edges)
    # (a flat piece lies on the floor, seen straight down: its hazard stripes slant on purpose; leaves, fish and holograms
    # in a piece may slant too, so those pieces are allowed more)
    slant = slanting(rgb[top:bottom, left:right])
    if slant > (0.62 if loose else 0.3) and not flat:
        return None, None, f"turned: {slant:.0%} of its edges slant"
    px = shrink(rgb[top:bottom, left:right], w, h)
    empty = ~shrink(piece[top:bottom, left:right, None].repeat(3, axis=2).astype(np.int32) * 255, w, h)[:, :, 0].astype(bool)
    # (a piece, not the plan painted over: some detail in it)
    lum = (px[~empty] * [0.3, 0.59, 0.11]).sum(axis=1)
    if len(lum) and lum.std() < (6 if back or flat else 14):
        return None, None, f"flat: no detail (spread {lum.std():.0f})"
    return px, empty, ""


# pieces with living or glowing things in them (leaves, fish, a hologram), or round ones (the vault's door, the hoist's
# engine), allowed more slanting edges inside: their outlines are still checked square
LOOSE = {"planter", "aquarium", "maptable", "hologlobe", "hvault", "hengine", "hdrums", "hmissiles"}


def noise(px, empty, loose=False):
    """why a piece at game size is noise ('' if it is not): too many of its pixels like none of the four round them, or
    its colour in specks rather than regions (the mean size of a region of like colours). Measured over every piece in
    the game when this was written: a clean piece has under 15% of its pixels alone and regions of 4 px or more; the
    static the review found had a quarter to two fifths alone in regions of 2. Living or glowing pieces (LOOSE) may have
    more."""
    h, w = px.shape[:2]
    f = px.astype(float)
    like = lambda a, b: ((a - b) ** 2).sum() < 30 * 30
    alone = 0
    count = 0
    parent = list(range(h * w))

    def root(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for y in range(h):
        for x in range(w):
            if empty[y, x]:
                continue
            count += 1
            friends = False
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < h and 0 <= xx < w and not empty[yy, xx] and like(f[y, x], f[yy, xx]):
                    friends = True
                    if dy >= 0 and dx >= 0:
                        parent[root(y * w + x)] = root(yy * w + xx)
            alone += not friends
    regions = len({root(y * w + x) for y in range(h) for x in range(w) if not empty[y, x]})
    share = alone / max(1, count)
    size = count / max(1, regions)
    most, least = (0.28, 2.4) if loose else (0.17, 3.5)
    if share > most:
        return f"noise: {share:.0%} of its pixels like none round them"
    if size < least:
        return f"noise: its colour in specks (regions of {size:.1f} px)"
    return ""


def unlike(px, empty, front, front_empty, n=16, far=52, most=0.25):
    """why a facing does not look like its front facing ('' if it does): too many of its pixels far from every one of the
    front facing's colours (the berth facing north was a red box, its front a grey bunk)"""
    from PIL import Image

    ref = front[~front_empty].astype(np.uint8)
    if not len(ref):
        return ""
    q = Image.fromarray(ref.reshape(1, -1, 3)).quantize(min(n, len(ref)), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = np.asarray(q.getpalette()[: min(n, len(ref)) * 3]).reshape(-1, 3).astype(float)
    mine = px[~empty].astype(float)
    d = np.sqrt(((mine[:, None, :] - pal[None]) ** 2).sum(axis=2)).min(axis=1)
    share = float((d > far).mean())
    return f"unlike its front: {share:.0%} of its colours are not the front's" if share > most else ""


def clean(px, empty, front, front_empty, n=10):
    """a side or back facing made the same set as its front, and its specks taken out (the fresh review: at a tile or two
    across, the model's detail is speckle): each pixel the nearest of the front facing's colours (n of them), then twice
    over, a pixel like none of the four round it takes the colour most of them have"""
    from PIL import Image

    ref = front[~front_empty].astype(np.uint8)
    out = px.copy()
    if len(ref):
        q = Image.fromarray(ref.reshape(1, -1, 3)).quantize(min(n, len(ref)), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        pal = np.asarray(q.getpalette()[: min(n, len(ref)) * 3]).reshape(-1, 3).astype(np.int32)
        flat = out.reshape(-1, 3)
        d = ((flat[:, None, :] - pal[None]) ** 2).sum(axis=2)
        out = pal[np.argmin(d, axis=1)].reshape(out.shape)
    h, w = out.shape[:2]
    for _ in range(2):
        nxt = out.copy()
        for y in range(h):
            for x in range(w):
                if empty[y, x]:
                    continue
                near = [out[yy, xx] for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)) if 0 <= yy < h and 0 <= xx < w and not empty[yy, xx]]
                if not near or any((c == out[y, x]).all() for c in near):
                    continue
                keys = [tuple(c) for c in near]
                nxt[y, x] = max(set(keys), key=keys.count)
        out = nxt
    return out
