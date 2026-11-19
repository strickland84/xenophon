#!/usr/bin/env bash
# Carves every hull's voxels (art/hulls/voxels) out of its three pictures: from above (art/hulls/source), from the side
# (art/hulls/side) and from behind (art/hulls/rear), the tries art/hulls/picks.json chose; then puts them into the game
# and draws them all on one sheet. Each hull's length in game pixels is set here: small enough that a dogfight fits in
# the frame (the plan's section 7, "Scale"); its height (its slices) follows from its plan (src/lib/art/hulls.ts).
#
#   tools/voxel/build_hulls.sh [sheet.png]
set -e
cd "$(dirname "$0")/../.."
mkdir -p art/hulls/voxels art/hulls/voxels/debug
for pair in dart:34 sparrow:36 lance:44 corsair:40 wraith:38 prospector:40 mule:42 bastion:46 nomad:46 galleon:48; do
  name=${pair%%:*}
  uv run tools/voxel/carve.py $name art/hulls/voxels/$name.npz --length ${pair##*:} --debug art/hulls/voxels/debug/$name.png
done
uv run tools/voxel/preview.py "${1:-art/hulls/voxels/sheet.png}" art/hulls/voxels/{dart,sparrow,lance,corsair,wraith,prospector,mule,bastion,nomad,galleon}.npz --headings 0,0.6 --across 5 --cell 60 --scale 3
uv run tools/voxel/to_model.py art/hulls/voxels/*.npz

# the larger builds the hangar shows, up to 2.5 times the size (data/interiors.ts BIG): the same pictures, more of their
# detail, but never more pixels than the picture has. The model draws pixel art, each of its pixels some 4 to 11 px of
# the picture; a build longer than the picture has pixels doubles some of them, and its pixels then look larger than
# the room's round it (the polish pass: "mixed pixel sizes" in the hangar). So each is as long as the picture's own
# pixels along the ship (measured: its ship's length over the size of its pixels), a little under, or 2.5 times its
# flying length if that is less: a dart 72 (native 76), sparrow 65 (69), lance 110 (138), corsair 82 (86), wraith 73
# (78), prospector 76 (81), mule 101 (107), bastion 96 (101), nomad 115 (174), galleon 120 (183).
mkdir -p art/hulls/voxels/big
for pair in dart:72 sparrow:65 lance:110 corsair:82 wraith:73 prospector:76 mule:101 bastion:96 nomad:115 galleon:120; do
  name=${pair%%:*}
  uv run tools/voxel/carve.py $name art/hulls/voxels/big/$name.npz --length ${pair##*:}
done
uv run tools/voxel/to_model.py --big art/hulls/voxels/big/*.npz
