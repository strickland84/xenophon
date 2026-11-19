# /// script
# dependencies = ["pillow"]
# ///
"""Draws the six races (Phase 5) with the image model: each one's in-world sprite from five
sides, the way it comes down after ejecting, and its portraits.

  uv run tools/gen/races.py --plans               # only the plans, and a sheet of them at game size
  uv run tools/gen/races.py                       # every picture, into art/races/source
  uv run tools/gen/races.py solari kestrin        # only these races
  uv run tools/gen/races.py solari --only face    # only these pictures (sprite, fall, face, small)
  uv run tools/gen/races.py orrin --seed 3        # another try

The outline of each race is decided here, in game pixels: the factions document's design
rule is that all six must be told apart by their outline alone, from the air. Each plan is a
grid of letters, one a game pixel (the parts are in different greys, so the model knows the
head from the suit), drawn up as a grey picture on black for the model to follow. The model
paints it; tools/voxel/races.py shrinks each picture back onto the same grid, sorts its
colours into the parts a player can recolour, and writes the game's sprites and portraits.

Every prompt is the subject followed by one shared style, so a whole set comes out in one
look. Change the recipe here, never a single prompt. The suit is asked for in lime green with
hot pink trim: no race is either colour, so the suit can be told apart and repainted in the
colours the player picks.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import os
import sys
import time

from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "art", "races", "source")
PLANS = os.path.join(ROOT, "art", "races", "plans")

# the greys of the parts in a plan (the model follows them loosely: lighter is nearer, or brighter)
GREY = {
    "H": 200,  # head, helmet, cap of a mushroom, brass of a robot
    "V": 250,  # visor, eyes, lens: the brightest
    "S": 145,  # the suit
    "T": 118,  # the suit's trim: belt, straps, pack
    "D": 78,  # boots, gloves, a claw: dark
    "A": 178,  # antennae, a crest, feelers
    "C": 128,  # a cloak, shell plates, a cap's underside
    "B": 232,  # a beak
    "W": 160,  # wings, a canopy, a rotor
}

# ── the in-world sprites: five sides each (the other three are these turned round)
#    s faces the viewer, se three-quarters towards him and to the right, e to the right,
#    ne three-quarters away and to the right, n away
SPRITES = {
    "solari": {
        "s": ["..HHH..", ".HHHHH.", ".HVVVH.", ".HHHHH.", "..TST..", ".SSSSS.", "S.SSS.S", "D.STS.D", "..S.S..", "..D.D.."],
        "se": ["..HHH..", ".HHHHH.", ".HHVVV.", ".HHHHH.", "..TSS..", ".SSSSS.", "S.SSS.S", "D.SST.D", "..S.S..", "..D.D.."],
        "e": ["..HHH..", ".HHHHH.", ".HHHVV.", ".HHHHH.", "..TSS..", "..SSSS.", "..SSSD.", "..TTS..", "..S.S..", ".DD.DD."],
        "ne": ["..HHH..", ".HHHHH.", ".HHHHH.", ".HHHHV.", "..TTS..", ".STTSS.", "S.TTS.S", "D.SSS.D", "..S.S..", "..D.D.."],
        "n": ["..HHH..", ".HHHHH.", ".HHHHH.", ".HHHHH.", "..TTT..", ".STTTS.", "S.TTT.S", "D.SSS.D", "..S.S..", "..D.D.."],
    },
    "kestrin": {
        "s": ["...A...", "..AAA..", "..HHH..", ".HVHVH.", ".HHBHH.", ".SSSSS.", "D.STS.D", "..D.D.."],
        "se": ["...AA..", "..AAA..", "..HHH..", ".HHVHV.", ".HHHBH.", ".SSSSS.", "D.SST.D", "..D.D.."],
        "e": [".AA....", "..AAH..", ".HHHHH.", ".HHHVHB", "..HHHH.", "..SSS..", ".DSSSD.", "..D.D.."],
        "ne": ["..AA...", "..AAA..", "..HHH..", ".HHHHH.", ".HHHHH.", ".STTSS.", "D.TTS.D", "..D.D.."],
        "n": ["...A...", "..AAA..", "..HHH..", ".HHHHH.", ".HHHHH.", ".STTTS.", "D.TTT.D", "..D.D.."],
    },
    "orrin": {
        "s": ["..V..", "..A..", "..A..", ".HHH.", "HHVHH", ".HHH.", "..T..", ".SSS.", "S.S.S", "D.S.D", "..T..", ".S.S.", ".S.S.", ".D.D."],
        "se": ["..V..", "..A..", "..A..", ".HHH.", "HHHVH", ".HHH.", "..T..", ".SSS.", "S.S.S", "D.S.D", "..T..", ".S.S.", ".S.S.", ".D.D."],
        "e": ["..V..", "..A..", "..A..", ".HHH.", ".HHHV", ".HHH.", "..T..", "..SS.", "..SS.", "..SD.", "..T..", "..SS.", ".S.S.", ".D.DD"],
        "ne": ["..V..", "..A..", "..A..", ".HHH.", "HHHHH", ".HHH.", "..T..", ".STS.", "S.T.S", "D.S.D", "..T..", ".S.S.", ".S.S.", ".D.D."],
        "n": ["..V..", "..A..", "..A..", ".HHH.", "HHHHH", ".HHH.", "..T..", ".STS.", "S.T.S", "D.S.D", "..T..", ".S.S.", ".S.S.", ".D.D."],
    },
    "skarn": {
        "s": ["....HHH....", ".CCHVHVHCC.", "CCCHHHHHCCC", ".CSSSSSSSDD", "..SSTTTSS.D", "..SSSSSSS..", "...SS.SS...", "...DD.DD..."],
        "se": ["....HHH....", ".CCHHVHVCC.", "CCCHHHHHCCC", ".CSSSSSSSDD", "..SSSTTTS.D", "..SSSSSSS..", "...SS.SS...", "...DD.DD..."],
        "e": [".....HHH...", "..CCCHHVH..", ".CCCCHHHH..", ".CCCSSSSSDD", ".CCCSSSS..D", "..CCSSSS...", "...SS.SS...", "..DD..DD..."],
        "ne": ["....HHH....", ".CCHHHHHCC.", "CCCCCCHHCCC", ".CCCCCCSSDD", "..CCCCCSS.D", "..SCCCCSS..", "...SS.SS...", "...DD.DD..."],
        "n": ["....HHH....", ".CCHHHHHCC.", "CCCCCCCCCCC", "DCCCCCCCCC.", "D.CCCCCCC..", "..SCCCCCS..", "...SS.SS...", "...DD.DD..."],
    },
    "noctil": {
        "s": ["A.......A", ".A.....A.", "..AHHHA..", "..HDHDH..", "...HHH...", "..CCCCC..", ".CCSSSCC.", ".CCSTSCC.", "CCCSSSCCC", ".CC...CC.", "...D.D..."],
        "se": ["..A.....A", "..A....A.", "...AHHHA.", "...HHDHD.", "....HHH..", "..CCCCC..", ".CCSSSCC.", ".CCSSTCC.", "CCCSSSCCC", ".CC...CC.", "...D.D..."],
        "e": ["....A..A.", "....A.A..", "....HHHA.", "....HHHD.", "....HHH..", "..CCCCS..", ".CCCCSS..", "CCCCCST..", "CCCCCSS..", ".CCC.DD..", "....D.D.."],
        "ne": ["A.....A..", ".A....A..", "..AHHHA..", "..HHHHH..", "...HHH...", "..CCCCC..", ".CCCCCCC.", ".CCCCCCC.", "CCCCCCCCC", ".CCCCCCC.", "...D.D..."],
        "n": ["A.......A", ".A.....A.", "..AHHHA..", "..HHHHH..", "...HHH...", "..CCCCC..", ".CCCCCCC.", ".CCCCCCC.", "CCCCCCCCC", ".CCCCCCC.", "...D.D..."],
    },
    "thallin": {
        "s": ["..HHHHH..", ".HHHHHHH.", "HHHHHHHHH", ".CCCCCCC.", "..SVSVS..", "..SSSSS..", ".D.STS.D.", "...D.D..."],
        "se": ["..HHHHH..", ".HHHHHHH.", "HHHHHHHHH", ".CCCCCCC.", "..SSVSV..", "..SSSSS..", ".D.SST.D.", "...D.D..."],
        "e": ["..HHHHH..", ".HHHHHHH.", "HHHHHHHHH", ".CCCCCCC.", "...SSSV..", "...SSSS..", "...STSD..", "..DD.DD.."],
        "ne": ["..HHHHH..", ".HHHHHHH.", "HHHHHHHHH", ".CCCCCCC.", "..SSSSS..", "..STTSS..", ".D.TTS.D.", "...D.D..."],
        "n": ["..HHHHH..", ".HHHHHHH.", "HHHHHHHHH", ".CCCCCCC.", "..SSSSS..", "..STTTS..", ".D.TTT.D.", "...D.D..."],
    },
}

# ── coming down after ejecting, seen from above and behind as the camera sees it
FALLS = {
    # a classic round parachute
    "solari": ["....WWWWWWW....", "..WWWWWWWWWWW..", ".WWWWWWWWWWWWW.", "WWWWWWWWWWWWWWW", "W.W...W...W.W.W", ".W.W..W..W.W...", "...W..W..W.....", "....W.W.W......", ".....HHH.......", ".....HVH.......", "....SSSSS......", ".....S.S.......", ".....D.D......."],
    # a wingsuit glide: arms out, membranes between arms and legs
    "kestrin": ["......A......", ".....AHA.....", ".....HVH.....", "WWWWWSSSWWWWW", ".WWWWSSSWWWW.", "..WWWSSSWWW..", "...WWSSSWW...", "....WS.SW....", ".....D.D....."],
    # a little unfolding rotor over its head
    "orrin": ["WWWWW..A..WWWWW", "....WWWVWWW....", ".......A.......", "......HHH......", ".....HHVHH.....", "......HHH......", ".....S.T.S.....", ".....D.S.D.....", "......S.S......", "......D.D......"],
    # curled up into a ball
    "skarn": ["...CCCCC...", ".CCCCCCCCC.", ".CCCCHCCCC.", "CCCCHVHCCCC", "CCCCCHCCCCC", "CCCCCCCCCCC", ".CCCCCCCCC.", ".CCCCCCCCC.", "...CCCCC..."],
    # the wing-cloak spread wide
    "noctil": ["A.............A", ".A...........A.", "..A..AHHHA..A..", "......HVH......", "WWWWWWCCCWWWWWW", ".WWWWWCSCWWWWW.", "..WWWWCSCWWWW..", "...WWWCSCWWW...", "....WW.D.WW....", "......D.D......"],
    # drifting down under its own cap
    "thallin": ["...HHHHHHH...", ".HHHHHHHHHHH.", "HHHHHHHHHHHHH", ".CCCCCCCCCCC.", "...D..S..D...", "....DSSSD....", ".....SVS.....", ".....SSS.....", ".....D.D....."],
}

# ── the pilot out on a world, at his true size beside his ship (the polish pass, item 1): about a
#    sixth of a light fighter's length, so half the size of the sprites above, which stay for the
#    places inside. Each race keeps its outline: the round white helmet, the crest and beak, the
#    tall thin robot, the wide shell, the antennae and cloak, the broad cap.
SMALL = {
    "solari": {
        "s": [".HHH.", "HVVVH", "STSTS", ".SSS.", ".D.D."],
        "se": [".HHH.", "HHVVV", "SSTSS", ".SSS.", ".D.D."],
        "e": [".HHH.", ".HHVV", ".TSS.", ".SSD.", ".D.D."],
        "ne": [".HHH.", "HHHHV", "SSTTS", ".SSS.", ".D.D."],
        "n": [".HHH.", "HHHHH", "STTTS", ".SSS.", ".D.D."],
    },
    "kestrin": {
        "s": ["..A..", ".HHH.", "HVBVH", ".SSS.", ".D.D."],
        "se": ["...A.", ".HHH.", "HHVBV", ".SSS.", ".D.D."],
        "e": [".AA..", ".HHHH", ".HHVB", ".SSS.", ".D.D."],
        "ne": [".A...", ".HHH.", "HHHHH", ".TTS.", ".D.D."],
        "n": ["..A..", ".HHH.", "HHHHH", ".TTT.", ".D.D."],
    },
    "orrin": {
        "s": ["..V..", ".HHH.", ".HVH.", "S.T.S", ".SSS.", ".S.S.", ".D.D."],
        "se": ["..V..", ".HHH.", ".HHV.", "S.T.S", ".SSS.", ".S.S.", ".D.D."],
        "e": ["..V..", ".HHH.", "..HHV", "..T..", "..SS.", "..SS.", ".D.D."],
        "ne": ["..V..", ".HHH.", ".HHH.", "S.T.S", ".STS.", ".S.S.", ".D.D."],
        "n": ["..V..", ".HHH.", ".HHH.", "S.T.S", ".STS.", ".S.S.", ".D.D."],
    },
    # (the polish pass: four rows of shell read as a brown shell more than a figure; a row taller, his suit and legs show)
    "skarn": {
        "s": ["..HHH..", ".CVHVC.", "CCSTSCC", ".SSSSS.", ".D...D."],
        "se": ["..HHH..", ".CHVVC.", "CCSSTSC", ".SSSSS.", ".D...D."],
        "e": ["...HHH.", "..CCHHV", ".CCCSSS", ".CCSSS.", "..D..D."],
        "ne": ["..HHH..", ".CCHCC.", "CCCCCSC", ".CSSSS.", ".D...D."],
        "n": ["..HHH..", ".CCCCC.", "CCCCCCC", ".SCCCS.", ".D...D."],
    },
    "noctil": {
        "s": ["A...A", ".AHA.", ".DHD.", "CCSCC", "CCTCC", ".D.D."],
        "se": [".A..A", "..AHA", "..HDD", "CCCSC", "CCCTC", ".D.D."],
        "e": ["..A.A", "..HHA", "..HHD", ".CCCS", "CCCCS", ".D.D."],
        "ne": ["A..A.", ".AHA.", ".HHH.", "CCCCC", "CCCCC", ".D.D."],
        "n": ["A...A", ".AHA.", ".HHH.", "CCCCC", "CCCCC", ".D.D."],
    },
    "thallin": {
        "s": [".HHHHH.", "HHHHHHH", ".CVSVC.", "..STS..", "..D.D.."],
        "se": [".HHHHH.", "HHHHHHH", ".CSVSV.", "..SST..", "..D.D.."],
        "e": [".HHHHH.", "HHHHHHH", ".CCSSV.", "...SS..", "..D.D.."],
        "ne": [".HHHHH.", "HHHHHHH", ".CCCCC.", "..STS..", "..D.D.."],
        "n": [".HHHHH.", "HHHHHHH", ".CCCCC.", "..TTT..", "..D.D.."],
    },
}
SMALL_FALLS = {
    "solari": [".WWWWW.", "WWWWWWW", "W.W.W.W", "...H...", "..SSS..", "..D.D.."],
    "kestrin": ["...A...", "..HVH..", "WWWSWWW", ".WWSWW.", "..D.D.."],
    "orrin": ["WWW.WWW", "...V...", "..HHH..", "..HVH..", "..SSS..", "..D.D.."],
    "skarn": [".CCC.", "CCHCC", "CHVHC", "CCCCC", ".CCC."],
    "noctil": ["A.....A", "..AHA..", "WWWHWWW", ".WWCWW.", "..WCW..", "..D.D.."],
    "thallin": [".HHHHH.", "HHHHHHH", ".CCCCC.", "..DSD..", "..SVS..", "..D.D.."],
}

STYLE = (
    "pixel art game sprite, a tiny character for a 16-bit top-down role playing game seen from slightly above, "
    "{subject}, {pose}, crisp chunky pixels, limited colour palette, bold readable shapes, hard edges, "
    "no anti-aliasing, no blur, one character, whole character in frame and centred, plain flat black background, no text"
)
PORTRAIT_STYLE = (
    "pixel art character portrait for a 16-bit science fiction game, head and shoulders, facing the viewer, "
    "{subject}, {variant}, wearing a flight suit with a bright lime green collar with hot pink trim, "
    "crisp chunky pixels, limited colour palette, strong light from the upper left, hard edges, no anti-aliasing, "
    "no blur, plain flat black background, no text, no frame"
)
SUIT = "wearing a bright lime green flight suit with hot pink trim"
SUBJECTS = {
    "solari": "a human space pilot in a round white space helmet with a gold visor band",
    "kestrin": "a small bird person pilot with a tall pointed feather crest, big round eyes and a short yellow beak, sky blue and white feathers",
    "orrin": "a tall thin brass clockwork robot with engraved brass plates, one round glowing cyan lens for an eye and a single thin antenna on its head",
    "skarn": "a broad squat alien with a thick chipped brown armoured shell on its back, big shell plates on its shoulders and one large crab claw for a hand",
    "noctil": "a slim moth person with two long feathery antennae, a round head of pale cream fuzz with two huge black glossy eyes, a thick fuzzy cream collar and a long dusky brown wing cloak with small glowing violet spots, the same colours seen from every side",
    "thallin": "a short mushroom person with a broad brown and red mushroom cap, a pale stem body and two glowing yellow lantern eyes under the cap",
}
VIEWS = {
    "s": "front view facing the viewer, standing",
    "se": "three-quarter front view turned to the right, standing",
    "e": "side view facing right, standing",
    "ne": "three-quarter back view turned away to the right, standing",
    "n": "back view facing away from the viewer, standing",
}
FALL_POSES = {
    "solari": "hanging under a big round white and orange parachute, seen from above and behind",
    "kestrin": "gliding with a wingsuit spread wide between its arms and legs, seen from above and behind",
    "orrin": "hanging under a small spinning brass rotor of two blades that has unfolded from its head, seen from above and behind",
    "skarn": "curled up into a tight round armoured ball of shell plates, seen from above",
    "noctil": "gliding down with a wide moth wing cloak spread out like wings, seen from above and behind",
    "thallin": "drifting down holding on under its own broad mushroom cap, spread wide like a parachute, seen from above and behind",
}

# ── portraits: 32 game pixels square, four faces a race (each its own picture)
FACES = {
    "solari": ["short dark hair, the helmet off and tucked under one arm, a calm face", "the helmet on, its gold visor band raised to show a stern face", "close cropped grey hair and a scar across one cheek, no helmet", "long hair tied back, a headset with a microphone, a confident grin"],
    "kestrin": ["a tall swept back crest of blue feathers, a bright yellow throat patch", "a short spiky crest of white feathers, a red throat patch, flight goggles on its brow", "a long drooping crest of teal feathers, an orange throat patch", "a fan shaped crest of white and blue feathers, a pale gold throat patch, a chipped beak"],
    "orrin": ["a round brass head with fine engraved scrollwork, one big cyan lens", "a square brass head with riveted plates and one amber lens", "a tall narrow brass head with a little grille for a mouth and one green lens", "a dented old brass head with a cracked red lens and a bent antenna"],
    # (the polish pass: two of the first four read as bearded men; the shell is now the face itself, and nothing human)
    "skarn": ["an alien, not human: a wide head that is all thick overlapping horn plates like a crab's shell, no skin, no nose, a heavy plated brow ridge over four small round black eyes in a row, a hard plated mandible for a jaw, no hair, no beard, no hood", "a wide head of ridged olive armour plates like a turtle's shell, scarred, a heavy brow ridge over four small amber eyes in a row, a wide jaw, no hair, no hood", "a wide head of dark slate armour plates with pale chipped edges, a broken horn on the brow, four small red eyes in a row, a wide jaw, no hair, no hood", "an alien, not human: a wide head that is all mottled tan armour plates with painted clan stripes, no skin, no nose, a heavy plated brow ridge over four small black eyes in a row, a hard plated mandible for a jaw, no hair, no beard, no hood"],
    "noctil": ["huge dark eyes, a cream fuzzy collar, glowing blue spots on its wing cloak", "huge dark eyes with pale rims, a grey fuzzy collar, glowing violet spots", "huge dark eyes, a brown fuzzy collar, feathery antennae swept back, glowing gold spots", "huge dark eyes, a white fuzzy mane, small curled antennae, glowing teal spots"],
    "thallin": ["a broad red mushroom cap with white spots, glowing yellow lantern eyes", "a flat brown mushroom cap with ridged gills underneath, glowing green eyes", "a tall pointed purple mushroom cap, glowing orange eyes, a patchwork scarf", "a round cream mushroom cap with brown speckles, glowing cyan eyes, goggles on the cap"],
}


def face_plan(race, n):
    """a portrait's plan on a 32 by 32 grid: where the head and the collar are, in greys"""
    im = Image.new("L", (32, 32), 0)
    d = ImageDraw.Draw(im)
    g = GREY
    # the suit's collar and shoulders, along the bottom
    d.polygon([(2, 31), (5, 25), (11, 23), (21, 23), (27, 25), (30, 31)], fill=g["S"])
    d.polygon([(11, 23), (16, 28), (21, 23)], fill=g["T"])
    if race == "solari":
        if n == 1:
            d.ellipse([7, 3, 25, 23], fill=g["H"])
            d.rectangle([10, 10, 22, 17], fill=g["S"] + 30)
            d.rectangle([10, 8, 22, 9], fill=g["V"])
        else:
            d.ellipse([9, 5, 23, 22], fill=g["H"] - 30)
            d.ellipse([9, 3, 23, 12], fill=g["C"])
            d.rectangle([12, 12, 13, 13], fill=40)
            d.rectangle([19, 12, 20, 13], fill=40)
    elif race == "kestrin":
        crest = [[(13, 6), (6, 0), (17, 5)], [(14, 6), (16, 0), (18, 6)], [(12, 7), (5, 4), (8, 12)], [(11, 6), (8, 0), (21, 0), (21, 6)]][n]
        d.polygon(crest, fill=g["A"])
        d.ellipse([8, 5, 24, 22], fill=g["H"])
        d.ellipse([10, 10, 14, 14], fill=g["V"])
        d.ellipse([18, 10, 22, 14], fill=g["V"])
        d.polygon([(14, 15), (18, 15), (16, 20)], fill=g["B"])
        d.ellipse([12, 19, 20, 24], fill=g["C"] + 60)
    elif race == "orrin":
        shape = [[7, 4, 25, 22], [8, 5, 24, 21], [10, 2, 22, 22], [7, 5, 25, 22]][n]
        if n == 0 or n == 3:
            d.ellipse(shape, fill=g["H"])
        else:
            d.rectangle(shape, fill=g["H"])
        d.line([(16, 4), (16 + (3 if n == 3 else 0), 0)], fill=g["A"], width=1)
        d.ellipse([11, 8, 21, 18], fill=g["C"])
        d.ellipse([13, 10, 19, 16], fill=g["V"])
    elif race == "skarn":
        d.ellipse([3, 7, 29, 26], fill=g["C"])
        d.ellipse([8, 8, 24, 24], fill=g["H"])
        d.rectangle([8, 9, 24, 12], fill=g["C"] + 20)
        for x in (11, 14, 18, 21):
            d.rectangle([x, 14, x, 15], fill=g["V"])
        if n == 2:
            d.polygon([(22, 9), (27, 2), (25, 10)], fill=g["H"])
    elif race == "noctil":
        if n == 3:
            d.arc([4, 0, 14, 10], 180, 300, fill=g["A"])
            d.arc([18, 0, 28, 10], 240, 360, fill=g["A"])
        else:
            d.line([(13, 7), (6 if n != 2 else 3, 0)], fill=g["A"], width=2)
            d.line([(19, 7), (26 if n != 2 else 29, 0)], fill=g["A"], width=2)
        d.ellipse([8, 5, 24, 22], fill=g["H"])
        d.ellipse([9, 9, 15, 17], fill=g["V"] - 200)
        d.ellipse([17, 9, 23, 17], fill=g["V"] - 200)
        d.ellipse([6, 18, 26, 26], fill=g["A"] + 30)
    elif race == "thallin":
        caps = [[(1, 13), (6, 3), (16, 0), (26, 3), (31, 13)], [(0, 12), (4, 6), (28, 6), (32, 12)], [(4, 13), (16, 0), (28, 13)], [(2, 13), (5, 4), (16, 1), (27, 4), (30, 13)]]
        d.ellipse([10, 9, 22, 24], fill=g["S"] + 50)
        d.polygon(caps[n], fill=g["H"])
        d.rectangle([4, 12, 28, 13], fill=g["C"])
        d.ellipse([11, 15, 14, 18], fill=g["V"])
        d.ellipse([18, 15, 21, 18], fill=g["V"])
    return im


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


def plans():
    """every plan as a guide picture for the model, and a sheet of them all at game size (and four times it) to judge"""
    os.makedirs(PLANS, exist_ok=True)
    pictures = {}
    for race, sides in SPRITES.items():
        for side, rows in sides.items():
            cells = 860 // max(len(rows), max(len(r) for r in rows) + 2)
            pictures[f"sprite-{race}-{side}"] = grid_plan(rows, cells, 1024)
    for race, rows in FALLS.items():
        cells = 900 // max(len(rows), max(len(r) for r in rows))
        pictures[f"fall-{race}"] = grid_plan(rows, cells, 1024)
    for race, sides in SMALL.items():
        for side, rows in sides.items():
            cells = 860 // max(len(rows), max(len(r) for r in rows) + 2)
            pictures[f"small-{race}-{side}"] = grid_plan(rows, cells, 1024)
    for race, rows in SMALL_FALLS.items():
        cells = 900 // max(len(rows) + 1, max(len(r) for r in rows) + 1)
        pictures[f"smallfall-{race}"] = grid_plan(rows, cells, 1024)
    for race in FACES:
        for n in range(4):
            pictures[f"face-{race}-{n}"] = face_plan(race, n).resize((32 * 30, 32 * 30), Image.NEAREST).crop((-32, -32, 992, 992)).convert("RGB")
    for name, im in pictures.items():
        im.save(os.path.join(PLANS, f"{name}.png"))
    # the sheet: each race's five sides as they are in the game (the other three are mirrors), its fall, its faces
    sheet = Image.new("RGB", (330, 6 * 40), (36, 52, 40))
    for i, (race, sides) in enumerate(SPRITES.items()):
        x = 4
        for side in ["s", "se", "e", "ne", "n", "nw", "w", "sw"]:
            rows = sides.get(side) or [r[::-1] for r in sides[{"nw": "ne", "w": "e", "sw": "se"}[side]]]
            for y, row in enumerate(rows):
                for c, ch in enumerate(row):
                    if ch != ".":
                        v = GREY[ch]
                        sheet.putpixel((x + c, 4 + i * 40 + y), (v, v, v))
            x += 13
        for y, row in enumerate(FALLS[race]):
            for c, ch in enumerate(row):
                if ch != ".":
                    v = GREY[ch]
                    sheet.putpixel((x + 4 + c, 4 + i * 40 + y), (v, v, v))
        for n in range(4):
            sheet.paste(face_plan(race, n).convert("RGB"), (x + 24 + n * 34, 4 + i * 40))
    sheet.resize((sheet.width * 4, sheet.height * 4), Image.NEAREST).save(os.path.join(PLANS, "sheet.png"))


def generate(race, only, seed, strength):
    import comfy

    jobs = []
    if not only or only == "sprite":
        for side in SPRITES[race]:
            jobs.append((f"sprite-{race}-{side}", STYLE.format(subject=f"{SUBJECTS[race]}, {SUIT}", pose=VIEWS[side])))
    if not only or only == "fall":
        jobs.append((f"fall-{race}", STYLE.format(subject=f"{SUBJECTS[race]}, {SUIT}", pose=FALL_POSES[race])))
    if not only or only == "small":
        # (the pilot out on a world: the same subject on a plan half the size)
        for side in SMALL[race]:
            jobs.append((f"small-{race}-{side}", STYLE.format(subject=f"{SUBJECTS[race]}, {SUIT}", pose=VIEWS[side])))
        jobs.append((f"smallfall-{race}", STYLE.format(subject=f"{SUBJECTS[race]}, {SUIT}", pose=FALL_POSES[race])))
    if not only or only == "face":
        for n, variant in enumerate(FACES[race]):
            jobs.append((f"face-{race}-{n}", PORTRAIT_STYLE.format(subject=SUBJECTS[race], variant=variant)))
    for name, prompt in jobs:
        while comfy.busy():
            print("waiting for the queue to clear ...", file=sys.stderr)
            time.sleep(3)
        out = os.path.join(OUT, name + (f"-{seed}" if seed != 1 else "") + ".png")
        start = time.time()
        comfy.txt2img(prompt, out, seed=seed, control=os.path.join(PLANS, f"{name}.png"), strength=strength)
        print(f"{name}: {os.path.relpath(out, ROOT)} ({time.time() - start:.0f}s)", flush=True)


ap = argparse.ArgumentParser()
ap.add_argument("races", nargs="*", help="which races (all six if none are given)")
ap.add_argument("--plans", action="store_true", help="only draw the plans")
ap.add_argument("--only", choices=["sprite", "fall", "face", "small"])
ap.add_argument("--seed", type=int, default=1)
ap.add_argument("--strength", type=float, default=0.8)
args = ap.parse_args()

plans()
if not args.plans:
    for race in args.races or SPRITES:
        generate(race, args.only, args.seed, args.strength)
