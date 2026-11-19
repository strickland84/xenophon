# Pixel art techniques: research notes

Researched 16 November 2026, after the first generated ships were rejected as awful.

## What good pixel art does

| Technique               | What it means                                                                 |
| ----------------------- | ----------------------------------------------------------------------------- |
| One light source        | Every highlight and shadow agrees on where the light is                       |
| No pillow shading       | Shading must not simply follow the outline inwards                            |
| Hue shifting            | Shadows shift cooler and highlights warmer, not just darker and lighter       |
| Few colours             | Roughly 5 to 8 per sprite, at most 15, from one shared palette                |
| Clusters, not specks    | Colour sits in deliberate groups of pixels; single stray pixels read as noise |
| No banding              | Bands of tone must not run parallel to each other or hug an edge              |
| Clean lines             | Diagonals step in a regular rhythm, so edges are not jagged                   |
| Silhouette first        | The shape filled solid black must still be recognisable                       |
| Outline                 | A one-pixel dark outline, and a value range distinct from the background      |
| Metal is striped        | Hard bands of light and dark, never a smooth gradient and never dithered      |
| Detail by one tone step | Seams, bevels and rivets come from moving one step along the ramp             |
| Shape casts shadow      | Even seen from above, a tilted wing is darker on the side away from the light |

## What went wrong in the first attempt

Checked against the list above, the first two ships broke most of it.

- **Pillow shading.** Both sides of the ship were lit the same, so there was no light source.
- **Brightness-only ramps.** Each paint went from dark to light in a single hue.
- **Specks.** Bolts, teeth, slashes and plate corners were single pixels: noise.
- **Smooth gradients on metal**, where hard bands were needed.
- **Too much detail** for the size, and far too many colours.
- **Weak silhouette** on the second ship: a pile of parts, not a shape.
- **Shapes cut by formulas**, which gave uneven steps along every diagonal.

The deeper mistake was treating it as a 3D model to be rendered. Rendering a model gives a
render. Pixel art is a set of deliberate choices about every cluster.

## What changes

1. **One real light.** Each voxel keeps the direction its surface faces. The light is
   applied when the ship is drawn, from the upper left, so it stays correct at every
   heading.
2. **Hard tone bands.** Lighting is cut into four tones per paint, no gradients.
3. **Hue-shifted ramps.** Four tones and a glint per paint, cool in shadow, warm in light.
4. **Bevels, not flat plates.** Wings and panels get a raised middle, so their upper-left
   edges catch light and their lower-right edges fall into shadow.
5. **A tidy pass.** After drawing, any pixel that matches none of its neighbours is
   replaced by the colour round it. This removes specks, including the ones turning a
   sprite stack creates.
6. **Less.** Fewer parts, fewer paint details, one strong motif per ship.

## Still uncertain

Whether art generated purely in code can reach the quality wanted. The jet in the demo
began as a drawn four-view picture, and drawn source art has a head start. If the second
attempt is still not good enough, the alternative is to bring in source art from an image
model or an artist and keep the code for turning it into sprite stacks.

## Sources

- [Pixel art fundamentals](https://caioraphael1.github.io/studies/Art/Pixel%20Art/Pixel%20Art-fundamentals.html)
- [How to start making pixel art, part 4](https://medium.com/pixel-grimoire/how-to-start-making-pixel-art-4-f57f51dcfa02)
- [Pixel Joint: resources and support](https://pixeljoint.com/forum/forum_posts.asp?TID=11299)
- [Anti-aliasing fundamentals for pixel artists](https://pixelparmesan.com/anti-aliasing-fundamentals-for-pixel-artists)
- [Pixel art tutorial by Arne](https://www.androidarts.com/pixtut/pixelart.htm)
- [Endless Sky: designing ship sprites](https://endless-sky.github.io/2016/09/08/designing-ship-sprites.html)
- [OpenGameArt: spaceship tutorial](https://opengameart.org/node/4788)
- [OpenGameArt: advice on shading metal](https://opengameart.org/comment/56142)
- [Sprite silhouette test](https://freegamesprites.com/es/news/sprite-silhouette-test-character-readability)
- [How to make pixel art that reads clearly](https://bugnet.io/blog/how-to-make-pixel-art-that-reads-clearly)
- [Stack3D guide](https://dev-dwarf.github.io/dwarfdev/tutorials/2021/01/24/Stack3D-Guide.html)
- [Dead Cells: a 3D pipeline for 2D animation](https://www.jikguard.com/news/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-dead-cells)
- [Procedural tileset generator](https://donitz.itch.io/procedural-tileset-generator)

## Local image model test

Tried 16 November 2026, at James's suggestion, using the ComfyUI install on this PC that the
Eminent Domain project set up (`C:\ComfyUI_windows_portable`, reached from WSL at
`http://127.0.0.1:8188`).

- **Model:** Z-Image Turbo, 8 steps. The first image took 42 seconds (loading the model),
  the second 13.
- **Driven by** Eminent Domain's `tools/comfy/comfy.py txt2img`, run from that project's
  folder. This project has no client of its own yet.
- **Result:** two top-down pixel-art ships, in `docs/art/gen/`. Both are clearly better than
  anything drawn in code here: richer panel detail, better colour, a stronger read.
- **Limits seen so far:** the pixels are not on a true grid (it is a 1024-pixel picture in a
  pixel-art style), the first ship came out as a winged jet, and the second came out nose
  down.

The same install also has TRELLIS.2 and Pixal3D, which turn one picture into a 3D model, and
Stable Audio for sound effects. Eminent Domain's `docs/PIPELINE.md` and `docs/SETUP.md`
describe how they are run.

## Two ways to turn a generated picture into voxels

Tried 16 November 2026. The result is `docs/art/gen/voxel-comparison.png`: top row is the
first way, bottom row the second, each at five headings.

|                   | From the top-down picture (`tools/voxel/topview.py`) | Through a 3D model (`tools/voxel/mesh.py`)                     |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------- |
| Input             | One picture of the ship from directly above          | One three-quarter picture, turned into a 3D model by TRELLIS.2 |
| Time              | Under a second, no GPU                               | About 50 seconds on the GPU, then a few seconds                |
| Colour and detail | Kept from the picture, crisp                         | Dark and blotchy as it comes out of the model                  |
| Shape             | Guessed: taller the further a part is from the edge  | Real: fins, engines and underside are all there                |
| Good for          | The overhead view                                    | Low camera angles, if the colours can be fixed                 |

The 3D route was only taken as far as the shape. Eminent Domain follows that step with a
texture repaint (UltraTex), which was not tried here and might fix the colours.

Run them with `uv run tools/voxel/topview.py picture.png out.npz --flip`,
`uv run tools/voxel/mesh.py model.glb out.npz`, and
`uv run tools/voxel/preview.py out.png a.npz b.npz`.

## Ships from three views (after the fresh review)

From above the ships were good; from behind every one was a dark lump with icicles under it, and the title's ships crabs.
A ship built from one top picture is a slab: its height a guess, its sides and back the colours of its top, its engine
glow stacked down every slice. What fixed it, in order of what mattered:

- **Light by face, from over the viewer's shoulder.** The single biggest change. Each voxel knows which way its surface
  faces (from the solid, smoothed, so a gentle slope faces up however its voxels step) and is a tone lighter or one or
  two darker by it. Lit from the world's sun, a ship from behind was its back in shade: a dark mass again. Lit as a sprite
  is lit (the screen's upper left, a little towards the viewer), its back shows, its far flank falls away.
- **One palette, the top's.** The three pictures each have their own greys; quantised together they made the canopy grey
  and the hull mottled. The side and rear pictures are snapped to the top picture's tins, family by family.
- **Colours where the plan has the part.** The model draws a canopy or a nozzle a little off the plan; its teal smeared
  down a hull's nose. Glass goes only on the plan's canopy, glow only on nozzles (as the rear picture drew them).
- **Keep the top's outline exactly.** Rooms are laid out from it, and saved fit-outs with them.
- **Flames are nozzles from behind.** A flame drawn taller than its nozzle, tail over core, is an icicle.
- Still weak: markings at 40 px are blotches of orange (the top pictures' own), and a shark's mouth is a few pixels.

## Material and colour at game size

The [sprite reference](../art/mockups/sprite-finish.png) sets the palette direction for this
pass. The pilot converter reads suit panels, trim, boots and lenses from the sprite plans,
with the source pictures supplying their shading. The creature converter uses the same coat
and feature colours across all facings of a species and groups nearby coat pixels into larger
shapes. Ship paint keeps the colours chosen in the booth and shades the same paint differently
on armour and canopy glass.

The crate, planter, map table and reactor use cropped ChatGPT ImageGen source art. Their named
sources in `art/interiors/picks.json` go through the same footprint and noise checks as the
other props. Run `uv run tools/voxel/interiors.py` to rebuild them.

## Menu icons and cursors

The [menu icon reference](../art/mockups/console-icons.png) was made with ChatGPT ImageGen.
The final glyphs are drawn on a 20-pixel grid in `art/interface/console-icons.png`. The
24-pixel menu canvas preserves that grid, and the smaller icons use a 16-pixel canvas.
The pointer strip in `art/interface/console-cursors.png` holds the menu arrow and the
dedicated flight reticle. Their CSS hotspots remain on the arrow tip and the center of
the reticle. Rebuild these assets with `uv run tools/voxel/interface.py --console`.

The same build exports the rest of the interface from `tools/voxel/hud_icons.py`.
That includes station and settings tabs, touch controls, equipment, inventory, map
markers and rank badges. The icons share a small slate and teal palette with accent
colours for resources, warnings and faction ranks. The full interface build also
refreshes ship and faction thumbnails. Furniture, paint and wing-emblem previews
use the same silhouettes players see in the game.

## Interiors: one projection (the tiling rule)

Settled in the polish pass after James, on the ship's furniture and the hangar: "everything in the shop etc for the
ship is like isometric diamond shaped shit and wont fit in our ship unless we orient it like that. Please find a
permanent, good, tiling solution". The rooms are a square grid seen from above; the image model, asked for "a sprite of
a bunk", drew it isometric (a diamond footprint, seen from a corner), and a diamond cannot sit on a square grid.

**The rule.** Everything inside (floors, walls, doors, furniture, props) is drawn in one view: **top-down and
square-on**, the classic top-down game view. A floor is seen from straight above. A wall or a piece shows its top seen
from above and a little of its face towards the bottom of the screen, so it has depth. Nothing is isometric, turned or
corner-on. Light falls from above (fronts a little darker than tops).

- **The grid:** a tile is 8 game px (`TILE` in `data/interiors.ts`). Every piece covers a **footprint of whole tiles**
  (1×1, 2×1, 2×2, 3×1 …) and its picture is exactly its footprint across, and its footprint's depth plus its **rise**
  tall: it stands up into the row of tiles behind it by `rise` tiles (a berth 0.4, a locker 1.25), overlapping what is
  behind it, never what is in front. A wall's face is drawn the same way, standing up over the row behind it.
- **A piece declares** (`PROPS` in `data/interiors.ts`): its picture, its footprint as it faces s (`block`), its
  `rise`, the facings it is drawn in (`faces`), `against` (built into a wall: the whole side behind it flush to wall),
  `use` (the tile in front of its middle kept open and reachable). Its anchor is its front left tile.
- **Facings** (`Face`): s (its back to the wall above it), e and w (its back to the wall on its left or right: drawn
  lying along that wall), n (its back to the wall below it: only its plain back shows). Each facing is its own picture
  from the model, from its own plan: never mirrored or rotated (the light would be wrong).
- **Placement** (`interior/rooms.ts`): snapped to tiles; a built-in piece flush to a wall, facing the way the wall
  says; nothing within a tile of a doorway; a path from the hatch to every door, the seat and the front of every piece.
  The player's own placement keeps the same rules, shows the footprint, and says why a spot is refused.
- **Walls** are one autotile: each wall tile is drawn from its neighbours alone (`wallJoin`): a lit rim on each side
  open to the room and at each inner corner of a stepped outline, a dark edge where it meets nothing, its face where
  floor is below it. Any outline, any hull, joins cleanly.

**How the model is made to draw it** (`tools/gen/interiors.py`): a plan (control picture) of the footprint rectangle
square-on, its top pale and ruled in tiles, its face dark, the side against its wall marked; strength 0.6 (at 1.0 the
model paints the plan flat); one style string saying top-down, orthographic, square-on, no perspective, not isometric,
not a diamond. Prompts alone drifted to isometric; the plan and the words together come out square-on most of the time.
**Then every try is checked in code** (`tools/voxel/tiling.py`), and one that fails is drawn again with the next seed:
the piece's outline must be a rectangle (its bounding box filled, its four corners filled), the shape of its footprint,
not small, with its edges square to the grid (few slanting edges), and some detail in it (not the plan painted over).
`art/interiors/picks.json` keeps the passing seed of each; `tools/voxel/interiors.py` refuses a pick that fails; and
`interior/rooms.spec.ts` checks every piece's picture in the game against its footprint. A diamond cannot get in.

**Two things learned in the hangar's rebuild** (the last pass's polish):

- **A plain box makes a plain plate.** Over a pale rectangle the model paints a pale plate and puts a small object on it
  (the old gantries came out as pale squares of tiles). A sketch of what the piece is (a pegboard of dots over a bench,
  shelves of cans and a jointed arm, a big ring with spokes, a catwalk's railings and a ladder's rungs), drawn in true
  greys inside the same box, makes it draw that thing, still square-on and filling its rectangle (`sketch` in
  `tools/gen/interiors.py`; the old plans were drawn in the red channel only, which also worked, less well). Draw several
  tries (`--every --tries 6`) and choose among those that pass by eye (`--pick`).
- **A side-on facing is a narrow strip, not a face.** Asked for a piece "facing right", the model draws its front, which
  is the wrong shape and rarely passes. The side-on plan (`--side-on`, `plan_side`) shows its depth as a narrow strip
  lying along its wall: the long top seen from above, the wall's side dark, the front's edge pale with handles along the
  working side, and only the short end below. Facings that failed twenty-two tries passed in eight.

**A third thing learned, after the fresh review** (side facings that passed every check were orange and black static at
game size): a facing a tile or two across turns whatever detail the model draws into speckle. So a side or back facing
is drawn over a guide made from the piece's own front facing (its top, turned), and judged, and kept, as the game has
it: snapped to its front's colours with its lone specks taken out (`clean`), then refused if a fifth of its pixels are
still like none round them or its colour lies in specks (`noise`), or if its colours are not its front's (`unlike`).

**Adding a piece:** add it to `PIECES` in `tools/gen/interiors.py` (subject, footprint, rise, facings) and to `PROPS` in
`data/interiors.ts` (the same footprint and rise), run `uv run tools/gen/interiors.py <name>`, then
`uv run tools/voxel/interiors.py`, `npx jiti tools/item-icons.ts` if it is sold, and `npx jiti tools/props-sheet.ts` to
see it on the grid (`docs/art/gen/tiles.png`).
