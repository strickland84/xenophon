# /// script
# dependencies = ["pillow"]
# ///
"""Draw the console's small pictograms on their native pixel grid."""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
UI = ROOT / "static/ui"
DARK = "#080d1c"
STEEL = "#354660"
EDGE = "#8398af"
ICE = "#e1edf2"
TEAL = "#50d7cd"
SEA = "#216d77"
GOLD = "#ffc36d"
BRONZE = "#a66b46"
LILAC = "#b9a6ef"
VIOLET = "#60578b"
RED = "#ec816d"
GREEN = "#9bd885"

GLYPHS = {}


def glyph(name):
    im = Image.new("RGBA", (16, 16))
    GLYPHS[name] = im
    return ImageDraw.Draw(im)


def line(d, xy, ink=ICE, width=1):
    d.line(xy, fill=ink, width=width)


def box(d, xy, ink=STEEL, outline=None):
    d.rectangle(xy, fill=ink, outline=outline)


def poly(d, xy, ink=STEEL):
    d.polygon(xy, fill=ink, outline=DARK)


def orb(d, xy, ink):
    d.ellipse(xy, fill=ink, outline=DARK)


def hull(d, x, y, top=ICE, glass=TEAL):
    poly(
        d,
        [
            (x, y),
            (x + 3, y + 5),
            (x + 5, y + 9),
            (x + 2, y + 9),
            (x, y + 8),
            (x - 2, y + 9),
            (x - 5, y + 9),
            (x - 3, y + 5),
        ],
        STEEL,
    )
    line(d, [(x, y + 2), (x, y + 7)], top, 2)
    box(d, (x - 1, y + 5, x, y + 6), glass)
    line(d, [(x - 3, y + 8), (x - 2, y + 8)], EDGE)
    line(d, [(x + 2, y + 8), (x + 3, y + 8)], EDGE)


def hold(d, x=2, y=5, accent=GOLD):
    poly(
        d,
        [
            (x, y + 2),
            (x + 4, y),
            (x + 10, y),
            (x + 12, y + 2),
            (x + 11, y + 8),
            (x + 1, y + 8),
        ],
    )
    poly(d, [(x + 1, y + 3), (x + 11, y + 3), (x + 11, y + 8), (x + 1, y + 8)], BRONZE)
    line(d, [(x + 1, y + 3), (x + 11, y + 3)], accent)
    box(d, (x + 2, y + 4, x + 3, y + 7), STEEL)
    box(d, (x + 9, y + 4, x + 10, y + 7), STEEL)
    line(d, [(x + 4, y + 1), (x + 9, y + 1)], EDGE)
    line(d, [(x + 5, y + 6), (x + 7, y + 6)], DARK)


def pack(d, accent=TEAL, pockets=1):
    poly(
        d,
        [
            (5, 2),
            (10, 2),
            (10, 4),
            (12, 4),
            (14, 7),
            (14, 13),
            (12, 14),
            (3, 14),
            (1, 13),
            (1, 7),
            (3, 4),
            (5, 4),
        ],
    )
    line(d, [(6, 4), (6, 3), (9, 3), (9, 4)], EDGE)
    poly(d, [(4, 5), (11, 5), (12, 7), (12, 13), (3, 13), (3, 7)], EDGE)
    box(d, (4, 8, 11, 12), STEEL)
    line(d, [(4, 7), (11, 7)], accent)
    for x in range(pockets):
        box(d, (4 + x * 3, 10, 5 + x * 3, 11), accent)


def tool(d, color=TEAL, wide=0, angle=False):
    # A steel receiver, a power cell and a lit emitter.
    poly(
        d,
        [
            (2, 5),
            (10, 5),
            (10, 4),
            (14, 4),
            (15, 6),
            (14, 8),
            (9, 8),
            (7, 10),
            (6 + wide, 10),
            (6 + wide, 13),
            (3, 13),
            (3, 9),
            (1, 8),
        ],
        STEEL,
    )
    box(d, (3, 6, 9, 7), EDGE)
    box(d, (5, 8, 7, 9), color)
    line(d, [(11, 6), (13, 6)], ICE)
    if angle:
        box(d, (3, 10, 8, 12), STEEL, DARK)
        line(d, [(4, 10), (7, 10)], color)


def shield(d, ink=TEAL):
    poly(d, [(2, 3), (7, 1), (13, 3), (13, 9), (11, 12), (7, 15), (3, 12), (2, 9)], STEEL)
    line(d, [(3, 4), (7, 2), (12, 4), (12, 9), (10, 11), (7, 14)], ink)
    box(d, (6, 6, 8, 10), SEA)
    line(d, [(7, 5), (7, 10)], ICE)


def star(d, x=7, y=7, ink=GOLD):
    poly(
        d,
        [
            (x, y - 6),
            (x + 2, y - 2),
            (x + 6, y),
            (x + 2, y + 2),
            (x, y + 6),
            (x - 2, y + 2),
            (x - 6, y),
            (x - 2, y - 2),
        ],
        ink,
    )
    line(d, [(x, y - 3), (x, y + 3)], ICE)
    line(d, [(x - 2, y), (x + 2, y)], ICE)


def wrench(d):
    poly(
        d,
        [
            (1, 11),
            (7, 5),
            (7, 3),
            (9, 1),
            (12, 1),
            (10, 4),
            (12, 6),
            (15, 3),
            (15, 6),
            (12, 9),
            (9, 8),
            (4, 14),
            (2, 14),
        ],
        EDGE,
    )
    line(d, [(3, 12), (8, 7)], ICE)
    box(d, (3, 11, 3, 12), DARK)


def chevron(d, y, ink):
    poly(
        d,
        [
            (1, y + 4),
            (7, y),
            (8, y),
            (14, y + 4),
            (14, y + 7),
            (8, y + 3),
            (7, y + 3),
            (1, y + 7),
        ],
        ink,
    )


def socket(d, ink=TEAL):
    poly(d, [(3, 1), (12, 1), (14, 3), (14, 12), (12, 14), (3, 14), (1, 12), (1, 3)])
    line(d, [(3, 2), (12, 2), (13, 3)], EDGE)
    for x, y in ((3, 4), (12, 4), (3, 12), (12, 12)):
        box(d, (x, y, x, y), EDGE)
    box(d, (5, 5, 10, 10), ink, DARK)
    line(d, [(6, 6), (9, 6)], ICE)


def console():
    d = glyph("hold")
    hold(d)
    poly(d, [(4, 7), (5, 4), (8, 5), (10, 2), (13, 4), (11, 8), (7, 8)], SEA)
    line(d, [(6, 5), (8, 6), (10, 4), (12, 4)], TEAL)

    d = glyph("market")
    poly(
        d,
        [
            (1, 6),
            (3, 3),
            (9, 3),
            (11, 5),
            (14, 5),
            (14, 11),
            (11, 14),
            (5, 14),
            (1, 11),
        ],
    )
    line(d, [(3, 4), (8, 4), (10, 6), (13, 6)], EDGE)
    line(d, [(3, 9), (7, 9), (7, 7), (11, 7)], TEAL, 2)
    line(d, [(9, 6), (11, 6), (11, 8)], ICE)
    line(d, [(12, 10), (8, 10), (8, 12), (4, 12)], GOLD)
    line(d, [(6, 10), (4, 12), (6, 13)], GOLD)

    d = glyph("supplies")
    poly(d, [(1, 2), (4, 2), (12, 10), (13, 12), (10, 13), (1, 5)], BRONZE)
    line(d, [(3, 4), (7, 8)], GOLD, 2)
    wrench(d)

    socket(glyph("parts"))
    d = glyph("paint")
    poly(d, [(2, 5), (10, 5), (11, 7), (11, 13), (9, 14), (3, 14), (1, 13), (1, 7)])
    line(d, [(2, 6), (9, 6), (10, 7)], EDGE)
    box(d, (3, 8, 9, 10), TEAL)
    poly(d, [(6, 7), (10, 2), (14, 1), (15, 4), (11, 8), (8, 9)], BRONZE)
    line(d, [(10, 4), (13, 2)], ICE, 2)
    line(d, [(7, 7), (9, 6)], TEAL)

    hull(glyph("ships"), 7, 1)
    pack(glyph("gear"), GOLD, 2)
    pack(glyph("bag"), TEAL, 2)
    d = glyph("furniture")
    poly(
        d,
        [
            (4, 2),
            (11, 2),
            (12, 4),
            (12, 6),
            (14, 7),
            (14, 12),
            (12, 12),
            (12, 14),
            (10, 14),
            (10, 12),
            (5, 12),
            (5, 14),
            (3, 14),
            (3, 12),
            (1, 12),
            (1, 7),
            (3, 6),
            (3, 4),
        ],
    )
    box(d, (5, 4, 10, 8), SEA)
    line(d, [(5, 4), (10, 4)], TEAL)
    box(d, (4, 9, 11, 10), EDGE)

    d = glyph("controls")
    poly(
        d,
        [
            (4, 4),
            (11, 4),
            (13, 6),
            (15, 11),
            (14, 13),
            (11, 12),
            (9, 10),
            (6, 10),
            (4, 12),
            (1, 13),
            (0, 11),
            (2, 6),
        ],
    )
    line(d, [(3, 6), (4, 5), (11, 5), (13, 7)], EDGE)
    line(d, [(4, 6), (4, 10)], ICE)
    line(d, [(2, 8), (6, 8)], ICE)
    box(d, (10, 7, 11, 8), TEAL)
    box(d, (12, 9, 13, 10), GOLD)

    d = glyph("picture")
    box(d, (1, 2, 14, 13), STEEL, DARK)
    line(d, [(2, 3), (13, 3), (13, 12)], EDGE)
    box(d, (3, 4, 12, 11), "#1e344f")
    poly(d, [(3, 11), (6, 7), (8, 9), (10, 7), (12, 11)], SEA)
    box(d, (9, 5, 10, 6), GOLD)

    d = glyph("sound")
    poly(d, [(1, 6), (4, 6), (8, 2), (9, 3), (9, 12), (8, 13), (4, 10), (1, 10)], EDGE)
    line(d, [(5, 7), (8, 4), (8, 11)], ICE)
    line(d, [(11, 5), (12, 7), (12, 9), (11, 11)], TEAL)
    line(d, [(13, 3), (15, 6), (15, 10), (13, 13)], SEA)

    d = glyph("music")
    poly(
        d,
        [
            (4, 4),
            (13, 1),
            (14, 2),
            (14, 11),
            (12, 13),
            (9, 13),
            (8, 10),
            (10, 8),
            (12, 8),
            (12, 5),
            (6, 7),
            (6, 12),
            (4, 14),
            (1, 14),
            (0, 11),
            (2, 9),
            (4, 9),
        ],
        SEA,
    )
    line(d, [(5, 5), (13, 2), (13, 9)], TEAL, 2)
    line(d, [(5, 5), (5, 11)], ICE)
    line(d, [(2, 11), (4, 11)], ICE)
    line(d, [(10, 10), (12, 10)], TEAL)

    d = glyph("relays")
    poly(
        d,
        [(6, 5), (9, 5), (9, 11), (12, 13), (12, 14), (3, 14), (3, 13), (6, 11)],
        EDGE,
    )
    orb(d, (5, 3, 10, 8), TEAL)
    line(d, [(4, 3), (2, 5), (2, 8), (4, 10)], TEAL)
    line(d, [(11, 3), (13, 5), (13, 8), (11, 10)], TEAL)
    box(d, (7, 5, 8, 6), ICE)

    d = glyph("fire")
    for a, b in [
        ((7, 1, 8, 4), (6, 0, 9, 5)),
        ((7, 11, 8, 14), (6, 10, 9, 15)),
        ((1, 7, 4, 8), (0, 6, 5, 9)),
        ((11, 7, 14, 8), (10, 6, 15, 9)),
    ]:
        box(d, b, DARK)
        box(d, a, ICE)
    box(d, (7, 7, 8, 8), RED)

    d = glyph("missile")
    poly(
        d,
        [
            (8, 1),
            (10, 4),
            (10, 9),
            (13, 12),
            (10, 12),
            (8, 11),
            (6, 12),
            (3, 12),
            (6, 9),
            (6, 4),
        ],
        EDGE,
    )
    line(d, [(8, 3), (8, 8)], ICE)
    box(d, (7, 6, 9, 7), RED)
    line(d, [(8, 12), (8, 14)], GOLD)

    for name, inks in (("boost", (TEAL, GOLD)), ("climb", (ICE,)), ("dive", (LILAC,))):
        d = glyph(name)
        for i, ink in enumerate(inks):
            chevron(d, 3 + i * 5, ink)
        if name == "dive":
            GLYPHS[name] = GLYPHS[name].transpose(Image.Transpose.FLIP_TOP_BOTTOM)

    d = glyph("roll")
    d.arc((2, 2, 13, 13), 18, 310, fill=TEAL, width=2)
    poly(d, [(10, 1), (14, 2), (14, 6), (10, 6), (12, 4)], ICE)
    poly(d, [(1, 8), (5, 10), (2, 13), (2, 11)], EDGE)

    d = glyph("action")
    orb(d, (1, 1, 14, 14), STEEL)
    d.ellipse((3, 3, 12, 12), outline=TEAL, width=2)
    box(d, (6, 6, 9, 9), GOLD, DARK)
    line(d, [(7, 7), (8, 7)], ICE)

    d = glyph("view")
    poly(
        d,
        [
            (0, 7),
            (4, 4),
            (7, 3),
            (8, 3),
            (11, 4),
            (15, 7),
            (11, 11),
            (8, 12),
            (7, 12),
            (4, 11),
        ],
        EDGE,
    )
    line(d, [(2, 7), (5, 5), (10, 5), (13, 7)], ICE)
    orb(d, (5, 5, 10, 10), SEA)
    box(d, (7, 6, 8, 8), TEAL)

    d = glyph("chat")
    poly(
        d,
        [
            (3, 3),
            (12, 3),
            (14, 5),
            (14, 10),
            (12, 12),
            (7, 12),
            (3, 14),
            (3, 11),
            (1, 9),
            (1, 5),
        ],
    )
    line(d, [(3, 4), (12, 4), (13, 5)], EDGE)
    for x in (4, 7, 10):
        box(d, (x, 7, x + 1, 8), TEAL)

    d = glyph("flare")
    line(d, [(2, 13), (8, 7)], BRONZE, 3)
    line(d, [(4, 11), (8, 7)], GOLD)
    star(d, 9, 6, RED)

    d = glyph("beacon")
    poly(d, [(5, 5), (10, 5), (12, 13), (13, 14), (2, 14), (3, 13)], STEEL)
    box(d, (4, 3, 11, 7), SEA, DARK)
    box(d, (6, 3, 9, 5), TEAL)
    line(d, [(5, 8), (10, 8)], GOLD)
    line(d, [(3, 2), (2, 3), (2, 5)], EDGE)
    line(d, [(12, 2), (13, 3), (13, 5)], EDGE)

    d = glyph("run")
    poly(
        d,
        [
            (5, 2),
            (11, 2),
            (11, 7),
            (14, 10),
            (15, 11),
            (15, 13),
            (4, 13),
            (4, 9),
            (5, 7),
        ],
        EDGE,
    )
    line(d, [(6, 3), (10, 3), (10, 7)], ICE)
    line(d, [(7, 6), (9, 6)], DARK)
    line(d, [(5, 10), (10, 10), (13, 11)], SEA)
    line(d, [(1, 7), (3, 7)], TEAL)
    line(d, [(0, 10), (2, 10)], TEAL)

    d = glyph("cruise")
    hull(d, 8, 0, ICE, LILAC)
    for x, y in ((3, 10), (6, 10), (9, 11), (12, 10)):
        line(d, [(x, y), (x, 14)], TEAL if x in (6, 9) else SEA)

    d = glyph("power")
    orb(d, (1, 1, 14, 14), DARK)
    d.arc((2, 2, 13, 13), -48, 228, fill=TEAL, width=2)
    box(d, (7, 1, 8, 8), ICE)

    d = glyph("seat")
    poly(
        d,
        [
            (3, 1),
            (8, 1),
            (9, 4),
            (8, 8),
            (11, 8),
            (13, 10),
            (13, 12),
            (10, 12),
            (10, 14),
            (4, 14),
            (4, 11),
            (2, 8),
            (2, 3),
        ],
    )
    line(d, [(4, 3), (7, 3), (7, 8), (11, 9)], EDGE, 2)
    line(d, [(4, 4), (6, 5), (6, 8)], GOLD)
    line(d, [(4, 10), (10, 10)], TEAL)

    d = glyph("close")
    line(d, [(4, 4), (11, 11)], DARK, 4)
    line(d, [(11, 4), (4, 11)], DARK, 4)
    line(d, [(4, 4), (11, 11)], ICE, 2)
    line(d, [(11, 4), (4, 11)], ICE, 2)


def equipment():
    for name, tip, broad in (
        ("cannon", TEAL, False),
        ("flak", GOLD, True),
        ("laser", RED, False),
    ):
        d = glyph(f"w-{name}")
        box(d, (2, 6, 11, 12), STEEL, DARK)
        line(d, [(3, 7), (9, 7)], EDGE)
        if broad:
            orb(d, (3, 7, 9, 14), EDGE)
            box(d, (9, 4, 14, 9), STEEL, DARK)
            line(d, [(10, 5), (13, 5)], tip)
        else:
            for y in (5, 9) if name == "cannon" else (7,):
                box(d, (8, y, 14, y + 2), EDGE, DARK)
                line(d, [(10, y + 1), (13, y + 1)], tip)
        box(d, (4, 9, 5, 10), ICE)

    d = glyph("w-rack")
    box(d, (0, 5, 15, 13), STEEL, DARK)
    for x in (2, 6, 10):
        poly(d, [(x + 1, 2), (x + 2, 5), (x + 2, 11), (x, 11), (x, 5)], EDGE)
        box(d, (x + 1, 5, x + 1, 7), RED)

    d = glyph("w-mines")
    for x, y in ((7, 1), (1, 7), (13, 7), (7, 13), (3, 3), (11, 3), (3, 11), (11, 11)):
        line(d, [(7, 7), (x, y)], EDGE, 2)
    orb(d, (3, 3, 12, 12), STEEL)
    orb(d, (5, 5, 10, 10), RED)
    box(d, (7, 6, 8, 7), ICE)

    for name, ink in (("afterburner", GOLD), ("cruise-drive", TEAL)):
        d = glyph(f"m-{name}")
        poly(d, [(5, 1), (10, 1), (12, 3), (12, 9), (10, 12), (5, 12), (3, 9), (3, 3)])
        line(d, [(5, 3), (5, 8)], EDGE, 2)
        line(d, [(4, 9), (11, 9)], ink, 2)
        if name == "afterburner":
            poly(d, [(5, 11), (7, 15), (10, 11)], GOLD)
            line(d, [(7, 11), (7, 13)], ICE)
        else:
            for y in (5, 7, 12, 14):
                line(d, [(4, y), (11, y)], TEAL)
    shield(glyph("m-shield-booster"))
    hold(glyph("m-cargo-pod"), accent=TEAL)
    d = glyph("m-scanner")
    d.arc((1, 1, 14, 14), 3, 176, fill=EDGE, width=3)
    line(d, [(3, 3), (7, 7), (11, 3)], TEAL, 2)
    line(d, [(7, 7), (7, 12), (4, 13), (11, 13)], ICE, 2)
    box(d, (6, 6, 8, 8), TEAL)
    d = glyph("m-tractor")
    socket(d, GREEN)
    line(d, [(6, 7), (2, 14), (12, 14), (9, 7)], GREEN)
    line(d, [(6, 11), (8, 11)], ICE)
    d = glyph("m-heat-sink")
    box(d, (1, 11, 14, 13), STEEL, DARK)
    for x, y in ((2, 5), (5, 3), (8, 2), (11, 4)):
        box(d, (x, y, x + 1, 11), EDGE)
        box(d, (x, y, x + 1, y + 1), TEAL)
    d = glyph("m-armour")
    poly(d, [(3, 3), (12, 2), (14, 5), (14, 11), (11, 13), (2, 13), (1, 11), (1, 6)])
    line(d, [(2, 6), (4, 4), (11, 3), (13, 5)], EDGE)
    line(d, [(4, 11), (10, 5)], TEAL, 2)
    for x, y in ((3, 7), (11, 5), (11, 11)):
        box(d, (x, y, x, y), ICE)

    for name, ink, heavy in (
        ("cutter", TEAL, False),
        ("power-cutter", GOLD, True),
        ("plasma-cutter", RED, True),
        ("blaster", LILAC, False),
    ):
        d = glyph(f"g-{name}")
        tool(d, ink, int(heavy), heavy)
        if name == "plasma-cutter":
            line(d, [(12, 3), (15, 3)], RED)
        if name == "blaster":
            box(d, (2, 4, 10, 6), EDGE, DARK)
            box(d, (6, 4, 7, 5), LILAC)
    d = glyph("g-launcher")
    poly(d, [(1, 5), (12, 3), (15, 5), (15, 9), (3, 11), (1, 9)])
    line(d, [(3, 6), (12, 4), (14, 5)], EDGE, 2)
    line(d, [(5, 10), (5, 13), (7, 13)], ICE, 2)
    box(d, (12, 5, 14, 8), RED, DARK)
    for name, ink in (("plain", EDGE), ("heat-lining", RED), ("cold-lining", TEAL)):
        d = glyph(f"g-{name}")
        poly(
            d,
            [
                (6, 2),
                (10, 2),
                (10, 4),
                (13, 4),
                (15, 10),
                (12, 11),
                (11, 8),
                (11, 14),
                (4, 14),
                (4, 8),
                (3, 11),
                (0, 10),
                (2, 4),
                (5, 4),
            ],
        )
        line(d, [(4, 5), (6, 4), (8, 5), (10, 4), (12, 5)], ICE)
        line(d, [(7, 5), (7, 12)], ink, 2)
        line(d, [(5, 10), (10, 10)], ink)
    for n, color, pockets in ((4, TEAL, 1), (6, GOLD, 2), (8, LILAC, 3)):
        pack(glyph(f"g-pack-{n}"), color, pockets)
    d = glyph("g-flares")
    for x, y in ((2, 6), (6, 3), (10, 1)):
        box(d, (x, y, x + 3, y + 8), BRONZE, DARK)
        box(d, (x + 1, y + 2, x + 2, y + 4), RED)
        box(d, (x + 1, y + 1, x + 2, y + 1), ICE)
    d = glyph("g-cover")
    poly(
        d,
        [(6, 1), (10, 1), (11, 5), (14, 11), (13, 14), (2, 14), (1, 12), (4, 6)],
        "#344938",
    )
    line(d, [(5, 4), (7, 2), (9, 2), (10, 4)], GREEN)
    line(d, [(4, 11), (7, 7), (8, 9), (11, 7), (12, 12)], "#5d8a54", 2)
    box(d, (6, 4, 9, 6), DARK)


def markers():
    d = glyph("mark-station")
    orb(d, (1, 1, 14, 14), STEEL)
    d.ellipse((3, 3, 12, 12), outline=EDGE, width=2)
    box(d, (5, 5, 10, 10), SEA, DARK)
    box(d, (7, 7, 8, 8), TEAL)
    line(d, [(7, 1), (8, 1)], ICE)

    d = glyph("mark-gate")
    poly(d, [(4, 1), (11, 1), (14, 4), (14, 11), (11, 14), (4, 14), (1, 11), (1, 4)])
    line(
        d,
        [
            (2, 5),
            (5, 2),
            (10, 2),
            (13, 5),
            (13, 10),
            (10, 13),
            (5, 13),
            (2, 10),
            (2, 5),
        ],
        LILAC,
        2,
    )
    box(d, (6, 5, 9, 10), VIOLET)
    line(d, [(7, 6), (8, 8), (7, 9)], ICE)

    d = glyph("mark-derelict")
    poly(d, [(3, 1), (10, 3), (13, 6), (9, 7), (8, 5), (4, 7), (2, 5)], EDGE)
    line(d, [(4, 2), (9, 4), (11, 5)], ICE, 2)
    poly(d, [(4, 9), (7, 7), (10, 9), (12, 8), (14, 12), (8, 14), (3, 12)], STEEL)
    line(d, [(5, 10), (7, 9), (10, 11), (12, 10)], RED, 2)
    line(d, [(5, 12), (9, 13), (12, 12)], EDGE)

    d = glyph("mark-raiders")
    poly(d, [(7, 1), (8, 1), (14, 12), (12, 14), (3, 14), (1, 12)], "#9b444e")
    line(d, [(3, 11), (7, 3), (8, 3), (12, 11)], RED, 2)
    box(d, (7, 6, 8, 9), ICE)
    box(d, (7, 11, 8, 12), ICE)

    star(glyph("mark-hotspot"))


def resources():
    d = glyph("credits")
    orb(d, (1, 1, 14, 14), BRONZE)
    orb(d, (2, 2, 12, 12), GOLD)
    d.ellipse((4, 4, 10, 10), outline=BRONZE)
    line(d, [(9, 5), (6, 5), (5, 7), (9, 7), (8, 9), (5, 9)], DARK)
    line(d, [(7, 4), (7, 10)], BRONZE)
    line(d, [(4, 3), (8, 3)], ICE)

    hold(glyph("crate"))

    # Common minerals have their own facets and an accent shared with their inventory category.
    for name, body, light, shape in (
        (
            "ferrite",
            "#844b4b",
            RED,
            [(1, 11), (3, 6), (6, 3), (11, 3), (14, 6), (14, 11), (10, 14), (4, 14)],
        ),
        (
            "silica",
            "#748faa",
            ICE,
            [(1, 9), (4, 5), (7, 2), (11, 3), (14, 6), (13, 12), (8, 14), (3, 12)],
        ),
        (
            "cryo-ice",
            SEA,
            TEAL,
            [(1, 11), (4, 3), (7, 4), (9, 1), (13, 4), (14, 11), (9, 14), (4, 14)],
        ),
        (
            "magma-glass",
            "#873c54",
            GOLD,
            [
                (1, 12),
                (4, 8),
                (6, 3),
                (9, 4),
                (10, 2),
                (14, 5),
                (14, 12),
                (10, 14),
                (4, 14),
            ],
        ),
        (
            "bioresin",
            "#386751",
            GREEN,
            [(2, 10), (4, 6), (8, 2), (12, 4), (14, 8), (13, 12), (10, 14), (4, 14)],
        ),
        (
            "helion",
            BRONZE,
            GOLD,
            [(1, 9), (5, 4), (7, 1), (11, 3), (14, 7), (12, 12), (7, 15), (2, 13)],
        ),
        (
            "void",
            VIOLET,
            LILAC,
            [(2, 6), (5, 2), (10, 2), (14, 6), (14, 10), (10, 14), (5, 14), (2, 10)],
        ),
        (
            "heartstone",
            "#943d61",
            RED,
            [(2, 4), (5, 2), (8, 4), (11, 2), (14, 4), (14, 8), (8, 14), (2, 8)],
        ),
    ):
        d = glyph(name)
        poly(d, shape, body)
        poly(d, [(4, 8), (7, 4), (11, 5), (12, 7), (8, 9), (6, 12)], light)
        line(d, [(6, 7), (8, 5), (10, 6)], ICE)
        line(d, [(8, 10), (11, 9), (12, 10)], DARK)
    d = glyph("salvage")
    poly(
        d,
        [
            (1, 6),
            (4, 3),
            (13, 2),
            (14, 6),
            (11, 8),
            (13, 10),
            (9, 13),
            (5, 12),
            (2, 14),
        ],
        STEEL,
    )
    line(d, [(3, 6), (6, 4), (12, 3)], EDGE, 2)
    line(d, [(7, 6), (5, 8), (9, 8), (7, 11)], GOLD)
    d = glyph("hide")
    poly(
        d,
        [
            (2, 2),
            (6, 4),
            (10, 4),
            (13, 2),
            (14, 5),
            (12, 8),
            (13, 12),
            (10, 14),
            (7, 13),
            (3, 14),
            (1, 11),
            (3, 7),
        ],
        BRONZE,
    )
    line(d, [(4, 6), (7, 5), (11, 6)], GOLD, 2)
    line(d, [(4, 10), (8, 9), (11, 10)], "#7b4451", 2)
    d = glyph("chitin")
    for x, y in ((1, 7), (4, 4), (7, 1)):
        poly(
            d,
            [
                (x, y + 2),
                (x + 3, y),
                (x + 7, y),
                (x + 7, y + 4),
                (x + 4, y + 7),
                (x, y + 6),
            ],
            BRONZE,
        )
        line(d, [(x + 1, y + 3), (x + 4, y + 1), (x + 6, y + 1)], GOLD)
    d = glyph("gland")
    poly(
        d,
        [
            (7, 1),
            (10, 4),
            (10, 5),
            (13, 8),
            (13, 11),
            (11, 14),
            (5, 14),
            (2, 11),
            (2, 8),
            (5, 5),
            (5, 3),
        ],
        "#3a6450",
    )
    poly(d, [(5, 7), (8, 5), (11, 7), (11, 11), (8, 12), (4, 10)], GREEN)
    line(d, [(5, 8), (7, 7), (8, 7)], ICE)
    line(d, [(9, 8), (9, 10), (7, 10)], "#4e9e59")


def badges():
    for side, ink, shadow in (("nomarchy", GOLD, BRONZE), ("anarchoi", LILAC, VIOLET)):
        for rank in range(6):
            d = glyph(f"{side}-{rank}")
            if side == "nomarchy":
                poly(d, [(7, 0), (8, 0), (15, 12), (13, 14), (2, 14), (0, 12)], shadow)
                line(d, [(2, 11), (7, 2), (8, 2), (13, 11)], ink)
            else:
                poly(
                    d,
                    [
                        (7, 0),
                        (8, 0),
                        (15, 7),
                        (15, 8),
                        (8, 15),
                        (7, 15),
                        (0, 8),
                        (0, 7),
                    ],
                    shadow,
                )
                line(d, [(2, 8), (7, 2), (8, 2), (13, 8), (8, 13), (7, 13), (2, 8)], ink)
            if rank >= 3:
                star(d, 7, 7, ink)
            else:
                box(d, (6, 6, 9, 9), STEEL, DARK)
            for x in range(rank % 3 + 1):
                box(d, (5 + 2 * x, 11, 5 + 2 * x, 12), ICE)


def centered(im, size):
    # The surrounding padding changes between canvases. Pixels keep their original weight.
    out = Image.new("RGBA", (size, size))
    out.paste(im, ((size - im.width) // 2, (size - im.height) // 2))
    return out


def ui_icons():
    GLYPHS.clear()
    console()
    equipment()
    markers()
    return GLYPHS.copy()


def inventory_icons():
    GLYPHS.clear()
    resources()
    return {
        name: GLYPHS[name]
        for name in (
            "credits",
            "crate",
            "ferrite",
            "silica",
            "cryo-ice",
            "magma-glass",
            "bioresin",
            "helion",
            "void",
            "heartstone",
            "salvage",
            "hide",
            "chitin",
            "gland",
        )
    }


def rank_icons():
    GLYPHS.clear()
    badges()
    return {f"{side}-{i}": GLYPHS[f"{side}-{i}"] for side in ("nomarchy", "anarchoi") for i in range(6)}


def save_ui_icons():
    files = []
    for name, im in ui_icons().items():
        if name.startswith("mark-"):
            size = 16 if name == "mark-hotspot" else 12
            variants = [(name, im.resize((size, size), Image.Resampling.NEAREST))]
        else:
            variants = [(name, im), (f"{name}-24", centered(im, 24))]
        for key, pic in variants:
            path = UI / f"{key}.png"
            pic.save(path)
            files.append(str(path))
    return files


def save_inventory_and_ranks():
    files = []
    for folder, pictures in (("icons", inventory_icons()), ("badges", rank_icons())):
        for name, im in pictures.items():
            path = ROOT / "static" / folder / f"{name}.png"
            im.save(path)
            files.append(str(path))
    return files


if __name__ == "__main__":
    save_ui_icons()
    save_inventory_and_ranks()
