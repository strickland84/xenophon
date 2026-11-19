# The polish pass

What has to change before the game is called done. It comes from James's first playthrough
(17 November 2026) and from the supervisor's review of each phase. The phases in the plan's
roadmap built everything once; this is the pass that makes it good.

James's items are requirements, quoted in his words. They come first.

## From James's playthrough

"I did a quick playthrough and I'm a bit disappointed so far."

1. **The pilot is too big next to the ship.** "The player is too large relative to the
   ship." A pilot standing by his ship should look like a person beside a spacecraft: about
   a sixth to an eighth of a light fighter's length. Everything that touches him follows:
   the cockpit he climbs into, hangars, rooms, doors, furniture.

   **Done (17 November 2026), with items 3 and 7.** Before and after: [pilot-scale.png](art/gen/pilot-scale.png).
   - **Out on a world he is half the size**: a second sprite of each race, drawn by the image model on plans half
     the size (`tools/gen/races.py SMALL`, five sides, a walk, the way down), 6 to 9 px tall with his outline (a
     Solari 7, 5 of it body; an Orrin 9). Against a Dart (34 px) he is 1:4.9 with the outline and 1:6.8 the body
     (he was 1:2.8 and 1:3.4); against a Corsair (40 px) 1:5.7 and 1:8. So a sixth to an eighth by his body; a fifth
     with the dark ring round him. Each race keeps its outline, facing and walk. The camera pulls in on foot as far as it did (twice; 2.5 was tried: he read larger, but the HUD then
     covered a phone's frame), so beside the same ship he is now half the height on the screen: one pixel size. He walks 24 px a
     second (was 30), runs 38 (46); his middle, reach and pick-up are scaled to him. Pads, base buildings, the canopy
     he climbs into and other pilots were looked at beside him: the world's own size, they now read as a person's
     surroundings. A spilled crate and a beacon's post are the world's size too, so now as tall as he is (cargo, a
     mast); veins and the capture flag were not each looked at closely.
   - **Inside, the rooms are drawn larger and so is he** (his full sprite, the art pixels 1.5 times): he is about the
     same height on the screen walking from the pad into the hangar (14 and 18 px of the page's art pixels). The hangar shows his ship from a build 2.5 times larger
     (`jet/models/big/`, the same pictures shrunk less, its parts and emblem too): 85 to 120 px long beside a 12 px
     pilot (1:7 to 1:10). A ship's rooms are its hull 4.5 times over: roomy enough for each kind of room and its
     fit-out, which is what the smaller pilot was to give.
   - Wire protocol 7 (where his middle is, and a ship's rooms, changed).
   - **Not yet**: the small Skarn reads as a brown shell more than a figure (his suit hardly shows); at 7 px a pilot's
     facing is a pixel or two of visor; the on-foot HUD is as chunky as it was (the supervisor's item, below).

2. **The interface.** "The interface is still terrible." Asked what was wrong, and shown six
   other styles drawn by the image model: "the current one is better than these mockups;
   its just font size too small, too busy, not polished enough, too much text, no
   animations". So the style stays. What changes, on every screen and the HUD:
   - **Bigger text.** Nothing a player has to read should be small.
   - **Less on screen at once.** Show what matters now; put the rest a step away.
   - **Fewer words.** Icons, bars and numbers before sentences. Cut every label that is
     not needed.
   - **Polish.** Consistent spacing, alignment and sizes; nothing that looks unfinished.
   - **Animation.** Panels that open and close, values that count, buttons that respond,
     transitions between screens. Quick and light, never in the way.
     The six rejected styles were deleted; do not build towards them.
     Later the same day: "please use proper website design skills to make an amazing
     interface, I know you can do better than what we have". The look stays; the craft has to
     rise. Screens are to be designed properly (hierarchy, layout, spacing, a focal point, one
     primary action, motion with intent), rebuilt where their structure is wrong, and judged
     as a designer would judge them, using the design skills the session has.
     And: "maybe a tooltip system!?" Yes: one shared tooltip (hover, focus, long press) that
     carries the detail cut from the screens, on items, parts, ships, worlds and readouts.

   **Done (17 November 2026).** The same look (the pixel font, hard edges, the night-blue panels, the
   side's colour), made with care: audited with the design skills (`impeccable`, `redesign-existing-projects`,
   `ui-ux-pro-max`), whose craft was taken and whose taste was not. Before and after, laptop size:
   [interface-before.png](art/gen/interface-before.png), [interface-after.png](art/gen/interface-after.png); the
   HUD in each place: [interface-hud-before.png](art/gen/interface-hud-before.png),
   [interface-hud-after.png](art/gen/interface-hud-after.png).
   - **Type:** one scale on the font's grid (multiples of 7 px): label and body 21, head 28, title 42, the
     game's name 70 to 84. Nothing a player reads is under 21 px (it was 14 almost everywhere); the settings'
     Text size raises the whole scale a step or two, the HUD's too. The HUD's text is twice the size where an
     art pixel is under 3 CSS px (a phone) or larger text is asked for (`hudScale`), so it is never under
     about 14 CSS px tall; its spacing follows the text's height.
   - **Less, and fewer words**, counted by `tools/phone-check.mjs` on every screen, the old build and the
     new walked alike: things on screen 1169 → 833 at laptop size and 1022 → 710 on a phone, words 2804 →
     1231 and 2130 → 943; bits of text under 21 px from 600-odd to none. What went a step away: the menu's
     connection screen and pilot file (tabs), the bench's weapons, modules and ships (tabs; every
     description in a tooltip), the booth's six rows of swatches (pick a part, then one row), the shop's
     sentences (pictures of every hull, item and piece of furniture), the faction board (today, you, top
     pilots), the pilot sheet (record, feats, kit), the settings (keys or the controller, one at a time).
     The help line is a few key caps with a word each. The HUD shows what matters: no speed; the height only
     high up; missiles and mines while there are some or in a fight; the heat while the guns are warm; the
     hold while it is carried, mined or banked.
   - **Pieces:** `routes/layout.css` holds the tokens (type, the accent, motion) and one set of components:
     panel (its side's trim along the top: the Nomarchy's double gold rule, the Anarchoi's hazard stripes),
     button, main, quiet, tab, row, well, meter, key cap, input; hover, focus, pressed, disabled and chosen
     are the same everywhere. `Panel`, `Tabs`, `Count`, `UiIcon`, `Emblem` are the Svelte parts; every screen
     is built from them. Touch targets are 44 px (36 for the small ones in a row).
   - **Tooltips** (`tooltip.svelte.ts`, `TooltipHost.svelte`): one for the page; on hover after a short
     wait, on a focus the player moved (arrows, Tab, a controller), on a long press (which does not also
     press). A title, a line, figures as bars and numbers, green or red against what he has now (a hull
     against the ship he flies, a module's trade-off), the price and the catch; kept on the screen, beside a
     thing when there is no room above or below. On items, parts, hulls, gear, furniture, paint, emblems,
     the map's bodies and systems, ranks, the war bar, settings that need words, the badge and the sound
     button; each touch button says what it does the first time it is pressed.
   - **Motion** (Reduce motion in Settings, `settings.motion`, and the device's own wish turn it to brief
     fades; `hudMotion` for the HUD): panels deploy in 200 ms (rising, unrolling from the top) and fade out in
     110; lists settle 22 ms apart (180 ms each); buttons press down 2 px (80 ms); tabs' underline slides
     (200 ms); figures count to their new value (260 to 600 ms) and flash; bars fill (420 ms); the first
     screens slide from the way they came (240 ms), the side cards rise one after the other; the map's card
     slides in (180 ms), its course marches; tooltips come in in 120 ms; toasts, chat lines, the wheel's
     phrases and the tutorial's lines come in under a quarter of a second. The HUD from the scene's own clock
     (`sim/hudfx.ts`): the part of a bar just lost shows pale and drains away after 0.35 s; the bars jolt for
     0.16 s when hit; a new prompt rises in over 0.2 s; news rises; a world's name types itself out, 35 ms a
     letter, its lines after.
   - **Checked:** `tools/phone-check.mjs` walks 43 screens at 844 × 390 and, with `--laptop`, 1366 × 768,
     and fails any text under 21 px; both pass. `node tools/interface-sheet.mjs out/ [--phone]` makes the
     sheets. A scripted flight of its own (the HUD at twice the size, hit and draining); every flight
     re-recorded on purpose.
   - **Not yet:** the maps' system view is small on a phone (a circle in a short frame); the beacon wheel's
     twelve phrases are crowded on a phone; labels over ships stay at the HUD's size, and the kill feed is not
     animated; pattern choices in the booth are words, with no picture of each (pictures since items 1, 3 and 7).

3. **The cockpit view.** "The in game cockpit view is weirdly coloured and hasn't changed
   since the prototype (it should be varying slightly per ship)." It is still the old jet's
   cockpit, drawn in code. Each of the ten hulls needs its own cockpit, sharing one style,
   in sensible colours, drawn by the image model.

   **Done (17 November 2026).** Mockups `art/mockups/cockpit-<hull>.png`; the sheet
   [cockpits.png](art/gen/cockpits.png) (all ten over a world, four in space).
   - **Each hull's own**, drawn by the image model over a plan of its layout (`tools/gen/cockpits.py`): the Dart a
     bubble with one bow overhead and a small low panel; the Sparrow a teardrop with a long sensor screen; the Lance
     a narrow canopy split by a spine strut, a tall speed tape; the Corsair two slanted struts under a roof beam; the
     Wraith faceted black panes; the Prospector a rounded windscreen under a grille, an ore screen and a hold screen;
     the Mule a broad flat windscreen of square panes, a hold screen of stacked boxes; the Bastion armour over the
     canopy, three slits, a big targeting screen; the Nomad a glass dome on slim ribs; the Galleon a bridge of many
     panes over a long console of seven screens. One shared palette of 64 (graphite and gunmetal, lamps), the trim
     strips painted in the player's markings colour.
   - **Live instruments on the panel's screens**, laid out per cockpit (`render/cockpit/screens.ts`): radar (ground
     and blips), attitude, hull and shield (the ship from above and two bars), heat and missiles, speed and height
     (heading in space), the target (its silhouette, hull, distance, the lock closing in), the hold. Figures in the
     HUD's own type at its size where the screen has room. The HUD's own bars and missiles keep out of the cockpit
     (the panel shows them); its prompts sit above the panel.
   - **Fitted, not scaled**: built at 200 and 256 px tall, the nearer cut to the frame's width and stretched at one row
     through the windows; two layers (frame and panel) sway with the head. Works over a world, in space and on the
     way down and up (the windows show whatever is drawn).
   - **Speed**: the world is no longer drawn under the panel (`CockpitArt.clear`). `node tools/measure.mjs 456 256`,
     one ship, before and after on one idle machine: over a world 6.55 → 5.21 ms (a dogfight 6.85 → 6.13, sixteen ships
     9.08 → 7.85); in space in open space 2.37 → 1.32, over a gas giant 11.43 → 8.50, by a black hole 10.93 → 7.97, at a
     station 7.01 → 4.56; the way down from the seat, the dearest frame, 14.80 → 11.90.
   - **Not yet**: the art is clean but plain in places (the model drew broad flat panels); the old cockpit's sunlight
     falling across the panel is gone; on a 4:3 screen the Galleon's outer screens are cut off; the Dart's bow overhead
     shows only as an arc at the top; the cockpits' art is 790 KB of the engine's code (two heights of ten pictures, as
     text), fetched with the game.

4. **Atmospheric entry and exit, at true scale.** "I want full atmospheric entries and exits
   to planets so that planets and moons have the right scale." Leaving a world and arriving
   at one should be continuous: the ground falls away into a curved horizon and then a
   planet; coming back, the planet grows to fill the view and becomes the ground. Planets
   and moons must be big.
5. **Space is cluttered.** "Space is full of crap, it should be blacker and more empty with
   just distant stars visible and suns etc." Remove the nebula and the haze. Black, with
   distant stars, the system's sun, and the bodies.
6. **All three views in space.** "I want to be able to keep the three view switching modes
   everywhere in space - the cockpit first person view, the top down view and the 3rd
   person view." Today space is overhead only.

   **Done, all three (17 November 2026).** Built to the mockups `art/mockups/entry-1..5.png`, `exit-1..2.png`,
   `space-overhead.png`, `space-chase.png`, `space-cockpit.png`, `space-black.png`, `space-giant-close.png`,
   `space-station-guns.png`. The sheets: [entry.png](art/gen/entry.png) (the way down, from behind),
   [exit.png](art/gen/exit.png) (the way up, overhead), [space-views.png](art/gen/space-views.png) (one moment by a
   world in each view), [space-black.png](art/gen/space-black.png); `npx jiti tools/space-sheets.ts` makes them.
   - **Black and empty** (5): the nebulae are gone. Space is black: a sky of 1,100 distant stars (most faint, a few
     bright, a very few with a cross; from behind and the seat they are directions and do not move, overhead two depths
     of them drift past at a hundredth of the ship's speed and streak when cruising), the sun, and the bodies, each lit
     from its sun with a day side and a night side. Cruising from behind or the seat, a little dust streams past.
   - **True scale** (4): the galaxy keeps its shape and names; its bodies are multiplied out (`galaxy/galaxy.ts`):
     a ship is 34 to 48 px long; a moon 600 to 1,300 px in radius; a world 1,900 to 3,400; a gas giant 5,200 to 8,800; a
     sun 6,300 to 13,500; orbits twelve times as far apart, gates 132,000 px out, a system about 280,000 px across (it
     was 24,000). A world is enormous beside a ship. Worlds and moons lie below the plane ships fly in, their tops 0.4 of
     their radius under it (`BELOW`), so a ship flies over them and goes down to them; suns, giants and black holes
     have their middles in it. Stations orbit over their worlds; gates and belts are where they were, scaled.
   - **Travel**: the cruise drive (its own key now: C, R1/RB, the Cruise button) goes faster the further it is from
     anything (`CRUISE.far`: each second 0.9 of the distance to the nearest body or structure, from 8 up to 640 times the
     ship's speed) and slows as it nears something, so a body grows from a point of light to a disc to more than the
     view as it comes; among a belt's rocks it is held to 4 times. World to world in a system: 12 to 16 s on the drive,
     16 to 21 where the course goes round the sun (it was about 17). From the pad of the Nomarchy's
     capital to arriving low over the next world, flown by a script: 45.6 s (it was 27): 15 s up (5 climbing to 160 px,
     10 through the air), 18 on the drive, 12 down. Pad to the capital's gate, round the sun: 37 s. The difference is the entry and
     exit that were asked for. A course plotted past a sun, a giant or a black hole now goes round it (`ROUND`,
     `courseAim`; the HUD says ROUND FORT CORIA): at true size a sun's well is too wide to fly out of at a ship's own
     speed, and a straight course to the capital's gate burned a ship to death.
   - **The way down and up** (4): one flight, no cut (`sim/air.ts`, `render/air.ts`; `AIR` in data/space.ts). Over a
     world, Use held (or a dive held, Dive on a touch screen) begins it; 10 s at full pace, steered all the way (where it
     comes down is where it flies), a climb turns it back (all the way to space if held), let go it goes on as it was
     going. The globe turns to bring the place under the ship beneath it, the ship sinks towards it, its curve
     flattens and the horizon rises, the map is drawn ever finer round that place (each world px of it ever fewer px of
     space: the ground rushes by faster), the sky thickens from black to the world's colour as the stars go, the air
     burns (a glow before the ship, flames streaming back, the frame's edges afire, the picture shaking, a roar), and low
     down the world's own ground (its px, its clouds) takes over, then the ground itself with its relief, at the same
     place and scale, 260 px over it. Going up is the same flight the other way, from wherever Use is held from
     160 px up or the climb is held at the ceiling. The zone (and the page's room) changes half way, either way. A
     barren moon has no air: no glow, no sky, no fire, a black sky to the ground. The light turns, low down, to fall
     on the place under the ship as it does on the ground there.
   - **Every view** (6): View works in space as over a world. Perspective space (`render/globe.ts`): each pixel's ray from
     the camera meets the spheres (worlds and moons wrapped in their maps, gas giants in their bands, suns boiling, black
     holes bending what is behind them); the place on a globe's map is worked out exactly every eight pixels along a row
     and carried between. Stations, gates, derelicts, rocks and shards are stacks of slices laid out through any view
     (`render/slabs.ts`), the way ships and the ground are. Inside a giant's bands (skimming) every way the camera looks
     is cloud. Ships hide behind bodies. From overhead a world or moon below the plane is drawn smaller than it is (a
     world's disc 490 px across, a moon's 380) and drifts past slowly, as the ground does from high up. Over a world the
     camera looks down at it a little; on the way down, more. The HUD's marks (names, the course) are placed through any
     view; on the way the HUD says where it goes and how to turn back.
   - **The bodies** (from the supervisor's list): gas giants' bands are drawn by latitude, bent by eddies large and
     small, smooth however close (no texels); suns granular in brighter cells and darker lanes as their mockup, with great
     prominences, and no steps in their glow at any size; a black hole's disc streams in eddies. Stations have gun turrets
     (`tools/gen/space.py turret`, drawn by the image model), four on a capital and three on an outpost, riding round with
     the station and firing as a base's do (a friendly one at raiders and the other side's patrols, the other side's at
     the player too). Another pilot jumping a gate leaves a flash in it, one coming through makes one; one going down is
     seen sinking under the plane and burning, and coming down over a world from high above, burning; one climbing out
     leaves a streak of light. The long empty stretches: judged right as they are. Space black and the drive faster the
     emptier it is, a crossing is ten to fifteen seconds of a body growing from a point ahead; nothing was added.
   - **Speed** (`node tools/measure.mjs 456 256`, one ship; the plan's section 20 has the table): overhead in open
     space 0.2 ms (was 1.3), over a world 5.0 (was 1.7: the globe fills the frame), over a giant 6.4 (2.5); from behind 0.8
     to 4.7; from the seat 2.2 to 11.3 (in a giant's bands 11.3, by a black hole 10.4: they were 30 and 13 before this
     pass's last speed-ups). The way down: 7.4 ms a frame overhead, 8.9 from behind, 15.1 from the seat, the
     dearest frame of all (the worst frames are the world being built, which the page does in its worker).
   - **Tests**: sixteen flights in space (`space/flights.spec.ts`), nine of them new: up out of a world from behind and from
     the seat, down to a world overhead, from behind and from the seat, down to a barren moon, cruising past a gas giant
     from behind, a dogfight in space from the seat, docking from behind; a room in memory where a pilot goes down to a
     world, seen sinking by the one left in space and coming down by the one on the world (`net/session.spec.ts`). Wire
     protocol 6.
   - **Not yet**: overhead, going up from high over a world the ground grows a little before it falls away (the globe in
     space is drawn larger from overhead than the ground is from the ceiling); the way down's ground is flat (no relief)
     until the last second; the light on a world's surface is its recipe's time of day, so the way down turns its light
     to that; a far world a few px across is drawn plain (its air's colour), not from its map; the cockpit's altimeter
     reads oddly on the way; the sound of the air is the black hole's rumble quickened (nobody has heard it); computer
     pilots still fly level (they never go down or up); a patrol's round in a system is ten times longer than it was.
     The way down from the seat is 15 ms a frame on the desktop, tight for a laptop. A black hole close to, from behind or
     the seat, is a flat lens facing the camera, its disc in rings rather than tilted. On a phone the HUD's CLIMB TO TURN
     BACK sits under the first-flight DRAG STEER hint. A sun's well is wide at true size: a course plotted across one is
     routed round it (the HUD says ROUND <NAME>), but a pilot who flies straight into it still burns.

7. **Interiors and items.** "Can we use comfy ui to generate much better pixel art interiors
   and items in the polish pass at the end?" Yes: see the supervisor's notes below.

   **Done (17 November 2026), with items 1 and 3.** Built towards eight whole-room pictures drawn first by the image
   model (`art/mockups/room-cockpit.png`, `room-bunk.png`, `room-maproom.png`, `room-quarters.png`,
   `room-cargo.png`, `room-engine.png`, `room-hangar.png`, `room-deck.png`). The sheets: [rooms.png](art/gen/rooms.png)
   (each kind of room, furnished) and [ship-interiors-after.png](art/gen/ship-interiors-after.png) (a Dart's, a
   Corsair's, a Mule's and a Galleon's rooms whole). `npx jiti tools/inside-sheets.ts` and `uv run tools/inside-sheets.py`
   make them; `npx jiti tools/props-sheet.ts` draws every piece.
   - **One set, one recipe** (`tools/gen/interiors.py`, the mockups' look: purple grey gunmetal, warm orange, brass and
     teal, warm lamp light): six floors (the ship's plates, the hangar's, the deck's, a cabin's dark boards, a cargo
     bay's plates, an engine room's), three walls' faces and the walls' top, and 44 pieces: on the walls a door, a lamp,
     a porthole, a window onto space, a screen, charts, pipes, a vent; in the hangar the bench, the booth, the vault,
     racks, crates, a crate, barrels, a tool chest; on the deck the shop's counter, the faction board, a bar, stools,
     benches, plants; in the ships the flight console, chairs, a side console, a bunk, bunk beds, lockers, a shelf, a
     star map table, a globe, a galley, a mess table, a sofa, a rug, a lamp, a trophy case, a radar screen, cargo racks,
     a fish tank, a weapon rack, the reactor, an engine console, a lift loader.
   - **Rooms with depth and light** (`render/interior.ts`): a back wall shows its face a tile and a half tall (panels,
     a lit rim, its lamps and the room's own things on it) and hides who is behind it; other walls show a dark top with
     a pale edge; a doorway its open door. Floors are lit by the lamps in warm pools that fall away in dithered steps,
     each room lit from its ceiling too, and darken along the walls' foot; props stand in shadow and take the light where
     they are. Laid down once a room, so it costs no more to draw than before.
   - **A ship's rooms** follow its hull: each kind of room (cockpit, cabin, map room, crew quarters, cargo bay, engine
     room) in the order its hull has them, as many as its length has rows for: a Dart a cockpit (with its console, a
     side console, a chair and two lockers; no bunk fits beside the way through), a Sparrow or a Lance cockpit and cabin,
     a Corsair cockpit, cabin and engine room, a Galleon cockpit, map room, crew quarters and cargo bay. Each is even
     about the middle line, its walls straight or at 45°, a way down the middle kept clear.
   - **A fit-out for every hull** (`shipKit`): what each kind of room needs to be that room, placed where it goes; the
     pilot's to move, take up and place again (save version 8: the pieces a ship came with are his, `ShipRecord.kit`;
     a ship from before has its old pieces taken up to place again and its fit-out laid).
   - **The hangar** shows his ship from its larger build in the middle of a lit hangar (bench, booth, vault, racks,
     crates, lamps); **the deck** has the shop's counter, a bar under a window onto space, the faction board, benches,
     sofas and plants, five pilots about, and no pillars.
   - **Items**: the shop's and the bench's icons for weapons, modules and gear (the interface's, the image model's) are
     the same kind of picture as the new pieces (an object from a high three-quarter view, outlined, in its own colours)
     and were kept; the furniture's icons are made again from the new pieces (`tools/item-icons.ts`). Patterns and parts:
     see the supervisor's list below.
   - **Not yet**: a Dart has no bunk (none fits beside the way through its one room); a room is a band across the ship,
     front to back, never one beside another; a hull with more kinds of room than its length has rows for drops the last
     (a Galleon and a Mule have no engine room, a Nomad no crew quarters); a map room of three rows has no star map
     table; pieces never turn (a bunk always lies across); the loader's and the paint booth's pictures are muddled; the
     rooms are darker and plainer than their mockups, and their floors' light pools blotchier.

8. **Endless waves.** "The waves of enemies never stop - we need to move past the dogfight
   now into the full universe." The skirmish that sends wave after wave at the player
   wherever he is was right for proving the dogfight and is wrong for the game. Enemies
   should belong to places: patrols, raiders at gates, derelicts, hotspots and contested
   worlds. A pilot who wants to explore, mine or trade in a quiet system should be left
   alone to do it.

   **Done (17 November 2026).** No wave comes at a pilot in the galaxy (the old skirmish, with
   its counter, banner, ships and game over, is left only for a pilot with no side over the
   island world). The computer's ships live in places (`sim/bands.ts`, numbers in
   `data/bands.ts`, where from `galaxy/danger.ts`): raider bands by a frontier world's rich ore
   and at its outposts' ways in (watching for loaded ships), at the gates out to wilder space,
   in the belts, at the black hole shortcut, holding the barren moons; a derelict's drones; each
   side's patrols in its own space and on the front line, where both sides' meet; haulers on the
   clock everywhere. Raiders lie low (off the radar until close), chase, give up off their
   ground or under a base's guns, and once beaten stay gone ten to fifteen minutes on a clock
   every player shares. Danger shows on the galaxy map (chevrons, the front ringed red), the
   system map (a skull where raiders wait), the cards and the HUD on arriving. Home is safe and
   slow; the frontier pays nearly twice as much, and deeper out costs ships (the plan's sections
   8 and 22 have the numbers). Five new scripted flights; the old ones keep their pictures.
   Not yet: a band beaten is remembered only by the games in the room (a player who comes later,
   alone, may find it back); no practice mode in the menu for the old skirmish; the low frontier
   is gentle because its patrols beat the raiders; stations still have no turrets of their own.

9. **Sound and music.** "Is the sound and music done already? It sucks if so." Both were
   synthesised in the browser by agents who cannot hear, and were never listened to. Redo
   them with real sound: effects generated by the audio model on this PC (Stable Audio, in
   ComfyUI) and shipped as files, and music likewise if a suitable local model is
   available. Since no agent can hear, every batch goes to James as a sampler to listen to
   before it goes into the game. James, on being asked: "yes use stable audio, and install
   a music model too". So a free music model may be downloaded and installed into the
   ComfyUI on this PC. Choose one with a permissive licence, and record each model's
   licence beside the art pipeline's notes.

   **Done (17 November 2026), and not heard.** Music model: ACE-Step 1.5 (turbo), MIT, about 10 GB from
   ComfyUI's own repackaging on Hugging Face (Comfy-Org/ACE-Step-1.5), supported natively by this ComfyUI
   (0.45.0), which listed it without a restart. Every model's licence and source is in the plan's
   section 7 ("The models and their licences"). One recipe (`tools/gen/sound_recipe.py`) for 82 effects
   (Stable Audio 3, small) and 7 pieces of music (the title, a calm world, a harsh world, space, a fight,
   the hangar and station, the maps), four takes each, each effect cut by its rule and every take
   measured; the best-measured chosen (`tools/audio/pack.py`), and looked at as plots. In the game
   (`src/lib/audio/`): Opus with an MP3 fallback, fetched after the first click (0.9 MB of effects) and
   streamed piece by piece (9.3 MB of music), positioned and varied, engines by the ship's size, a mixer
   with a limiter and the music ducked and held under a fight; the moods by place and fight kept from
   Phase 9 and now with a calm and a harsh world, the maps, rests of silence, and the piece a fight broke
   into resumed after. Tests: every event has a sound and every sound its files; the music's moods.
   `node tools/sound-check.mjs` plays it all in a browser (every file decodes, every event plays its
   file, six scenes mixed without clipping, the real page and the sky). For James: `/sounds` (every take,
   the chosen ones gold; "cannon: use take 3" is `use=[3]` in the recipe) and the numbered mixes in
   `art/audio/samplers/`. Found on the way: ACE-Step heard "no drums" as drums, and its planning step
   made erratic pieces; both avoided. Worth his ears first: the music (every hangar take has a few
   seconds of silence in it, every harsh-world take swings loud and soft), the grass footsteps (a low
   thump), the shortest crunches (rock, snow, ore), and whether the engines grate over an hour. Not yet:
   other ships' engines, each side's colour in the music, weather and wind beds, and the music on a real
   phone.

10. **Art drawn in code, wherever it is left.** Shown the screen where a pilot chooses his
    side, with a flat gold triangle and a flat violet diamond: "like what are these faction
    icons? Please, we have to do better art design - use comfyui wherever you can please".
    The two factions need real emblems, designed and drawn by the image model: the
    Nomarchy's seal and the Anarchoi's patched sail, each a crest worth choosing a side for,
    with a simple small form (still a triangle and a diamond in outline) for markers over
    ships. The side cards need art that sells each faction: its people, its ships, its
    home. Then every other piece of interface art that was drawn in code is to be found and
    replaced the same way: icons, marks, badges, buttons' glyphs, frames, backgrounds.

    **Done for the interface (17 November 2026), with item 2.** `tools/gen/interface.py` (one recipe per kind:
    emblem, home, icon, item) and `tools/voxel/interface.py` (chooses among the tries and shrinks them,
    never scales them): each side's emblem following a grey plan of its mark, six tries of each of five
    subjects looked at side by side (the Nomarchy's chosen a gold triangle seal with a navy border, a ring
    station and a star, laurels; the Anarchoi's a diamond sail of violet and rust patches with a rope-bound
    spar, the spar trimmed where it ran past the sail), each in three true sizes (64, 32 and 16 px; at 16 the
    outline is what reads, a triangle and a diamond apart without colour); each side's home for its card
    (Meridian Ring at its golden sun, the Raft's lashed hulks at a red dwarf), and on the card its three
    peoples' portraits. 36 interface icons (the menu, the tabs, the touch buttons: cream, steel and gold),
    26 items (weapons, modules, gear) in their own colours, each hull's own top-down picture, and every piece
    of furniture from its room art (`tools/item-icons.ts`). `docs/art/gen/interface-art.png` shows them.
    Left plain on purpose, as geometry: the bars, the radar and its blips, the HUD's 5-pixel marks over ships,
    the map's bodies, orbits, danger chevrons, skull and hotspot star (they must read at a few pixels), the
    close cross, key caps, the panels' frames and trims. Not yet: a pixel cursor; the map's symbols as
    drawn art; the patterns' pictures in the booth (done with item 7).

11. **Shipboard furniture, sensibly placed.** After the interiors were redone: "the bunks look
    weird man - like a 4 poster bed on a spaceship? they are aligned oddly too like just
    randomly plonked in middle of a room. You gotta figure this out better". Furniture must
    be what a spacecraft has (berths built into the wall, lockers, fold-out tables, bolted
    consoles), not what a house has; and the fit-out must follow rules: against walls and
    facing the room, with facings drawn for each direction, on the grid, aligned, symmetric
    where the hull is, with clear walkways, and only table-like pieces standing free.

12. **A real tiling system for interiors.** "Everything in the shop etc for the ship is like
    isometric diamond shaped shit and wont fit in our ship unless we orient it like that.
    Please find a permanent, good, tiling solution". The rooms are a top-down square grid
    and the image model drew the furniture isometric. The fix is a system, not a patch: one
    projection for everything inside (top-down, square-on), footprints in whole tiles, shape
    guides that make the model draw to the footprint, a check in code that rejects any
    piece that does not fill its rectangle, walls and floors that tile by rule, placement
    on the grid, every old piece redrawn and the isometric art deleted.

## From the supervisor's reviews

Art that is not good enough yet:

- **Ship interiors** are dark, flat and empty. Build each kind of room towards a whole-room
  picture from the image model; a proper tile set (lit floors, walls with depth, doors,
  windows, lighting); many more furniture pieces and items in one style; a default fit-out
  so no room starts empty. (Done with item 7.)
- **Item icons** (ore, parts, weapons, gear, furniture) in the shop and inventory. (Done with item 2:
  weapons, modules and gear drawn by the image model, hulls and furniture from their own art.)
- **Fitted parts** on light hulls are three to seven pixels and read as lumps. (In the hangar, with item 7: the ship is
  drawn from its larger build, and its parts from the same pictures 2.5 times larger, 8 to 35 px, where a flak pod, a
  missile rack or a radar dish reads as one. In flight they are still the size they were.)
- **Paint patterns** get lost in the hulls' own markings; checks read as noise. (Done with item 7: a pattern has its own
  colour, the trim's or else the markings', is painted over the body and its markings alike so it runs on unbroken, and
  is lifted into its colour's light half; checks are squares of three px over the backs of the wings. The booth shows a
  picture of each, `static/ui/pattern-*.png`, from `npx jiti tools/pattern-icons.ts`.)
- **The Skarn portrait** reads as a bearded human, not a shell-backed alien. (Done in the last pass: two of the four
  redrawn as a face of plates with no skin or beard; the small sprite a row taller, his suit and legs showing.)
- **Bases on worlds** sit on a visibly square patch of ground. (Done: its corners rounded, its edge spreading out and
  back over tens of px, the packed earth thinning into the ground.)
- **Ocean worlds:** atolls are uniform circles, and there is no cover at all. (Done: ovals drawn out each its own way,
  broken by channels, more islets, groves thick enough to hide under.)
- **Space stations** are assembled stiffly from their kit. They have no turrets. (Turrets done with item 5; they are
  stacks of slices now, and orbit over their worlds; the kit's own art is as it was.)
- **Gas giants** are blotchy up close. Suns are plainer than their mockup. (Done with item 5.)
- **Canyon worlds** read as stripes from overhead, not deep gorges.

Play:

- Travel between bodies has long empty stretches with nothing to do. (Judged with item 5: a crossing is ten to fifteen
  seconds of black, the body ahead growing; left empty.)
- The long way between the two home systems (six gates) takes about three and a half
  minutes, over the three-minute target.
- Each death costs about five seconds of ejection before the player is back in control. (Done in the last pass: the
  way down after ejecting is quicker, 2.8 s from the hit to walking from a fight's height.)
- A fleeing interceptor can make a wave drag.
- Boost does not build heat, though the plan says it should. (Done: `THRUSTERS.heat`, into the guns' gauge.)
- The HUD's radar and arrows show ships that fog should be hiding. (Done: an enemy the weather hides is off both.)
- On foot at double-size pixels the HUD is chunky, and the help line covers the top of it. (The pack's wells and label
  drawn solid, as they read as broken; the HUD's size on foot is as it was: open.)
- Two pilots who spawn at one outpost share a pad. (Done: the second is set down beside it.)
- A thief's own parked ship vanishes when he steals another. (The news now says it flies home; keeping it standing
  where he left it would need a second ship of his in the scene: open.)
- Other players see a pilot vanish on a jump or a descent, with no effect. (Done with item 5: a flash at the gate,
  fire going down, a streak going up.)
- Traces exist on worlds only, not in space (open). Stations do not change hands with their world. (Done: a station
  belongs to the holder of the world it orbits.)
- Computer wingmen are seen only by their own player.

Unproven:

- **Real phones.** Every phone check so far was a desktop browser at phone size. Speed on a
  real phone is unmeasured.
- **Real networks.** Two browsers on one PC connect; different networks are untested.
- **Other browsers.** Identical terrain for every player is pinned in Node only, not in
  Firefox or Safari. (Done: `node tools/terrain-browsers.mjs` builds all 68 worlds and the island world in Chromium
  158, Firefox 159 and WebKit 27.2: every fingerprint as pinned.)
- **Sound and music** are real audio now (item 9), measured and looked at, never listened to.
- **Fun.** Every gate in the roadmap asks whether something is fun. Only James can say.

## The last pass: everything left, then a bug hunt (17 November 2026)

The last agent before the game goes to James. Its brief: play the whole game as a new player and fix what breaks,
close what the list still shows open, prove what had not been proven, and leave it ready to hand over. Mid-way James
added, twice, that the interiors were wrong at the root ("the bunks look weird man - like a 4 poster bed on a
spaceship?"; "everything in the shop etc for the ship is like isometric diamond shaped shit ... Please find a
permanent, good, tiling solution"; and of the hangar, "its the same in the hanger"): that became the first thing.

### The interiors: one projection, a tiling system (James's notes; the most important art fix)

- **The rule**, written in CLAUDE.md and docs/pixel-art-techniques.md ("Interiors: one projection"): everything inside is
  top-down and square-on on a grid of 8 px tiles, light from above; nothing isometric, turned or corner-on. Every piece
  covers a footprint of whole tiles and rises a set height into the row behind; it declares (data/interiors.ts `PROPS`)
  its footprint, rise, facings, whether it is built against a wall (`against`: its whole back flush to wall) and used
  from in front (`use`: that tile kept open and reachable). Facings s, e, w, n are each drawn by the model from a plan of
  their own, never mirrored.
- **The model made to draw it, and checked**: `tools/gen/interiors.py` draws each piece and facing over a plan of its
  footprint rectangle square-on (top pale and ruled in tiles, face dark, wall side marked) with one style string (top-down,
  orthographic, square-on, not isometric, not a diamond) at strength 0.6, and `tools/voxel/tiling.py` checks every try:
  its outline must be a rectangle (bounding box filled, corners filled), the shape of its footprint, not drawn small,
  its edges square to the grid, and not the plan painted flat. A failing try is drawn again with the next seed; the
  passing seeds are kept in `art/interiors/picks.json`; `tools/voxel/interiors.py` refuses a pick that fails and cuts
  each to its outline and shrinks it to exactly its footprint; `interior/rooms.spec.ts` checks every piece's picture in
  the game against its footprint. The old isometric pictures are deleted. **Adding a piece** is in
  docs/pixel-art-techniques.md.
- **Shipboard pieces**, redrawn as what they are on a spacecraft: berths and stacked berths built into the hull (the
  "four-poster" beds gone), lockers, shelves with cargo netting, side and engine consoles, a galley unit, cargo racks, a
  weapon rack, a display case, a sealed aquarium, a radar station, crew benches with lockers under, tool cabinets; free:
  a star map table, a mess table with fixed benches, the reactor in its housing, crew seats on pedestals, a holo globe,
  sealed planters, deck lights, a deck mat, crates, canisters in a cradle. The names in the shop follow (Berth, Berth
  stack, Crew bench, Planter, Deck light …; the save's ids are unchanged). The shop's pictures are the pieces themselves.
- **Placement by rule** (`interior/rooms.ts`): each kind of room has a recipe (data/interiors.ts `ROOM_KINDS`: a cabin's
  berths along the side walls with lockers at their feet and a small table; a map room's table on the middle line and
  consoles round the walls; a cargo bay's racks along the sides, a deck mat down the aisle) placed in mirrored pairs (the
  hulls are even, so are their rooms), free pieces centred on the room's axis (two tiles wide, so exactly), nothing
  within a tile of a doorway, a path from the hatch to every door, the seat and every piece's front. The player places
  by the same rules: the footprint marked green or red on the floor, a built-in piece snapping to the nearest wall and
  facing into the room, and a refusal says why (OFF THE FLOOR, IN A DOORWAY, SOMETHING IS THERE, NOT AGAINST A WALL,
  IT WOULD BLOCK THE WAY). Walls are one autotile (`wallJoin`: rims on open sides and inner corners, outer edges, faces).
  Save version 9 lays every ship's fit-out again (the player's bought pieces back to place); wire protocol 8 (pieces
  carry their facing).
- **The hangar, designed** (built to `art/mockups/hangar-topdown-1.png`, drawn square-on first): the ship on a marked
  bay (a floor piece of hazard stripes and chevrons) between two service gantries, big hangar doors in the top wall, the
  loadout bench, the vault and the paint booth built into that wall either side, tool cabinets and parts racks along the
  side walls, lamps above, the door to the deck in the corner. **The deck** to `art/mockups/deck-topdown-1.png`: the
  shop's counter, the bar under the window with its stools, the faction board along the top wall, crew benches built
  along the side walls, planters and deck lights either side of the way down.
- **One pixel size**: the hangar's ship was built 2.5 times its flying length from a picture whose own pixel-art pixels
  were fewer than that, so some were doubled and its pixels looked larger than the room's. Each hull's picture was
  measured (its ship's length over the size of its pixels: a Dart 76, a Corsair 86, a Galleon 183) and the hangar's build
  is now no longer than that (a Dart 72, a Corsair 82; the Lance, Nomad and Galleon keep 2.5 times). Elsewhere the one
  thing at another pixel size is the HUD's text at twice the size on small art pixels (`hudScale`, kept on purpose for
  reading on a phone). The fitted parts in the hangar are built at 2.5 times and now stand a little large on the hulls
  that shrank (open).
- Sheets: [tiles.png](art/gen/tiles.png) (every piece in every facing on the grid), [fit-outs.png](art/gen/fit-outs.png)
  (every hull's rooms with its fit-out), [hangar-before.png](art/gen/hangar-before.png) and
  [hangar-after.png](art/gen/hangar-after.png) (1366 × 768).

### The playthrough, and what it found

Played from a fresh save in Chromium at 1280 × 720 or 1366 × 768 and at 844 × 390 (a phone held sideways, touch): the
first sortie by its prompts (`tools/first-session.mjs`), every screen (`tools/phone-check.mjs`, phone and `--laptop`),
a sortie (`play.mjs`), on foot (`walk.mjs`), space (`space.mjs`), the hangar (`hangar.mjs`), and the rest by a new tool,
`tools/playthrough.mjs` (to a frontier world and a raider band fought there, a landing, out to a vein and back, banking,
up into space, every view there, the cruise drive to a station and docking, a gate, a black hole's ring, down to a world
in each view, a flag at a mast, shot down over land and the ship called, shot down over the sea, the maps and the menu,
every setting changed and kept over a reload, the pilot saved to a file and restored on a fresh browser). What was
wrong, and what was done:

1. **The paint booth could not be reached** by a pilot walking straight at it (the hangar's furniture stood in the way;
   the phone check stopped there on both sizes). The hangar is rebuilt; the tools now walk inside by the room's own way
   round the furniture (`tools/inside-walk.mjs`).
2. **The hangar's and the ship's furniture isometric** on a square grid, berths like four-poster beds, placed without
   sense, the hangar's ship at a larger pixel size: the tiling rule above.
3. **A pilot shot down waited five or more seconds** before he could walk: 2.8 s now from a fight's height.
4. **AMBUSH said again** each time a band lost him and came back: once a band in 90 s now.
5. **The pack on the on-foot HUD drawn faint**: on bright ground it read as broken; drawn solid now.
6. **The cockpit's altimeter** showed the plane's height in space, then jumped: it falls from the top of the air to the
   ground through the way down now.
7. **Two pilots of a side coming down at one outpost** were set on one pad: the second beside it now.
8. **The radar and the arrows** showed raiders a fog hid on the screen: hidden on both now.
9. **A station never changed hands** with the world it orbits: it does now.
10. **The thief's own ship** went home without a word: the news says so now.
11. **The dev server's hot reload** blanked a page under a tool once (a tool's run, not a player's: the final runs are
    against the built site).
12. Nothing else found by the tools: no errors on any page in any run (first session, every screen, sortie, on foot,
    space, hangar, three pilots online), the settings kept, the pilot restored.

### What was proven, and what cannot be from here

- **The same terrain in every browser**: `node tools/terrain-browsers.mjs` bundles the terrain code and builds every
  world (68 and the island world) in Chromium 158, Firefox 159 and WebKit 27.2 (Safari's engine), comparing heights,
  materials, starts and clouds with the fingerprints pinned in Node: identical in all three.
- **A slow machine**: `node tools/slow-machine.mjs` (the built site, the processor slowed 4 and 6 times): at ×4 every
  view in every place 57 to 60 frames a second but the way down, 27 to 38; at ×6 on foot and inside 60, space 37 to 59,
  over a world 44 to 51, a fight 39 to 45, the way down 17 to 21. A world's disc from overhead in space is now kept a
  moment (it was 27 to 42 at ×4). The plan's section 20 has it all and the next step for the way down.
- **The production build**: `npm run build` is 47 MB on disk, of which 42 MB is every take of every sound for the
  sampler page (`/sounds`); `node tools/download-size.mjs` against `npm run preview`: the first screen loads 0.93 MB
  (code; nothing else), the first click starts the sound (0.9 MB of effects and the first piece of music: 2.8 MB in
  all), and half a minute in the sky 2.9 MB. Nothing loads before it is needed.
- **An hour's play**: `node tools/long-run.mjs 60` against the build: 54 rounds of off a world, up into space, the cruise
  drive, down to another world and flying about with the guns: the heap between 15 and 43 MB all hour (16 at the start,
  24 at the end), the page's nodes and listeners steady (568 to 590, 100 to 200), 60 frames a second throughout, no
  errors. That run stayed in one system (its gate was flown straight through); with the tool steering into the ring a
  second run went from the Nomarchy's home through a gate to the next system, down to three of its worlds and up again,
  for 21 minutes: the heap between 15 and 46 MB, nodes and listeners steady, no errors on the page. It then stayed on
  Zenra, whose ash ceiling is lower than the height the script climbs to before going up (the script's, not the
  game's: a pilot there climbs to the ceiling and keeps climbing). The terrain changed in this pass (bases' ground,
  ocean worlds) was built again in Chromium, Firefox and WebKit afterwards: identical.
- **Three pilots through the real relays** (`node tools/together.mjs`, against the built site): ALPHA and CHARLIE of
  the Nomarchy and BRAVO of the Anarchoi on Lubaek meet in a private room in 6 s; CHARLIE asks ALPHA into a squad and he
  joins; ALPHA opens his ship and CHARLIE comes aboard, each seeing the other inside; BRAVO, loaded, is shot down in the
  fight and his crate taken by ALPHA; both are on foot and see each other walk; BRAVO steals ALPHA's parked ship and
  ALPHA's game knows it is gone; CHARLIE plants a flag at the mast and all three games agree the world is the
  Nomarchy's. 8 of 8, no errors on any page. (Whose guns downed BRAVO is not checked: raiders were about.)
- **The playthrough against the built site** (a `VITE_PLAYTEST=1` build, `node tools/playthrough.mjs`): on a laptop 17
  of 21 steps the first time and on a phone 20 of 21, every failure the tool's own (the core's black hole is not one
  of the shortcut's pair, so it has no ring to thread; the descents then found no world in the system it was flung to;
  a phone climbs from overhead, where its Climb button is): all fixed in the tool, and those steps passed on the next
  runs (the shortcut's ring threaded, down to a world in each view, a flag planted, shot down over land and sea, nine
  settings changed and kept, the pilot saved and restored). `tools/phone-check.mjs` passes at both sizes (43 screens,
  nothing to fix) and the first sortie is played to its end on both (66 s and 75 s for the scripted stranger).
- **Not from here**: real phones (every phone check is a desktop browser at phone size; the slow-machine numbers stand
  in for a phone's speed, not its touch or its heat); two players on different networks or mobile data (the browsers
  here are on one machine, so their connections are never refused by a strict NAT); and anyone listening to the sound.

### What is still open, and why

Closed in this pass: everything marked done above (the interiors and the hangar, the Skarn, bases' ground, ocean worlds,
the parachute, boost heat, AMBUSH, the radar in weather, the shared pad, stations' holders, the altimeter, the danger's
tuning, the flagged sound, a world's disc from overhead, the cross-browser terrain). Left open, each with its reason
and the next step:

- **Canyon worlds read as stripes from overhead.** Needs the canyon archetype's relief shaded as depth (walls lit and
  shadowed by the sun, the floor darker), a terrain change across every canyon world: next after this list.
- **Fitted parts in flight are lumps** (3 to 7 px on light hulls), and in the hangar a little large on the hulls whose
  hangar build shrank to their pictures' pixels. Next: parts drawn by the model at their flying size, and the hangar's
  parts built per hull at its own scale.
- **A black hole close up from behind or the seat is a flat lens**; **the way down's ground has no relief** until the
  last second. Both are renderer work in `render/globe.ts` and `render/air.ts` (a tilted disc; the height map sampled
  under the globe's last stretch).
- **The map's symbols and the cursor are drawn in code**; **the base screen and the settings** are plain beside the
  rest. Next: the symbols and a pixel cursor from `tools/gen/interface.py`; the two screens rebuilt on `Panel` as the
  others were.
- **The on-foot HUD** is the size it was (only the pack made solid); **a thief's own ship** still flies home (the
  scene flies one ship of a player's; a second would be a new system).
- **Computer pilots ignore gravity and rocks**; **traces exist on worlds only**; **computer wingmen are seen only by
  their own player**: each a system of its own (the bands' brains in space, deeds in space, wingmen in the session),
  left as the brief said not to add systems.
- **The way down on a slow machine** (27 to 38 frames a second with the processor slowed four times, 17 to 21 at six):
  the next step is in the plan's section 20.
- **Interiors**: facings the model never drew square in 22 to 30 tries are left out of their pieces until a later run
  finds one (`uv run tools/gen/interiors.py <art>-<face> --tries 40`): a locker facing left (so lockers stand at a
  berth's foot only on the left; shelves are used in the fit-outs), cargo racks along a side wall (a cargo bay's racks
  stand along its top and bottom walls), a weapon rack against the top wall, the engine console facing right, a crew
  bench seen from behind, the bench facing left, the vault and the parts rack facing sideways. The gantries read as
  plain pale towers more than gantries. A Dart's one room still has no berth (no straight run of wall two tiles long but the one its console
  takes); the Nomad's map room is too narrow below for a table; a piece's picture is small (a tile is 8 px), so it reads
  by its shape and colours more than its detail.
- **Sound**: nobody has heard any of it. `/sounds` has every take.

## After the last pass: what was still open (17 November 2026, evening)

The supervisor's list from the last pass's pictures, in order: the hangar again (the stations cut off by the top of the
screen, the gantries blank pale squares, the props tiny and sparse, the facings never drawn, the scale), the way down on
a slow machine, the way down's ground and a black hole close to, the art still open, the HUD on foot, and anything a new
player's twenty minutes turn up.

### 1. The hangar, again

Before: [hangar-after.png](art/gen/hangar-after.png). After, 1366 × 768, the pilot by his ship:
[hangar-final.png](art/gen/hangar-final.png). Built towards four wide square-on mockups drawn first
(`art/mockups/hangar-wide-1..4.png`, towards the third).

- **Seen whole.** The room is 38 tiles by 21 (304 × 168 px), as wide as a screen, and the page shows its art pixels no
  larger than lets the room and a margin for its row of buttons fit (`Scene.fit`, `FIT` in data/interiors.ts,
  `screen.ts setZoom`): 4 CSS px a pixel on a 1366 × 768 or a 1280 × 720 laptop, 2 on a phone held sideways (it was 5 and
  3, and the top of the room was off the screen). The deck is fitted the same way; a ship's rooms are followed as before.
  Nothing on the screen is at another pixel size.
- **The stations**, built into the wall at the top either side of the hangar doors and seen from the front, each drawn by
  the image model over a sketch of what it is (`tools/gen/interiors.py HANGAR_PIECES`, `sketch`: true greys, not the red
  of the old plans) in one hangar recipe (`HANGAR_PIECE`, dark gunmetal with orange, hazard yellow and teal), five or six
  tries each, chosen by eye among those that pass the tiling check: the loadout bench (5 × 1 tiles, rising 2.5: a pegboard
  of wrenches over a workbench, a gun pod and a missile on it), the paint station (5 × 1: shelves of red, blue, green and
  yellow cans, a spray arm, paint running down), the vault (4 × 1, rising 2.75: a round steel door, a brass wheel, a
  keypad), the hangar's console (3 × 1: two screens of ship diagrams). Each reads for what it does at a glance, at
  laptop and phone size. The old small stations' pictures are gone.
- **The gantries** are catwalks drawn for each side (2 × 5 tiles, facing the ship): railings, grating, a ladder down the
  far end, a coiled hose, amber lights at the corners.
- **A working place:** walkways painted on the floor (`L` in a layout, `floor-lane`: worn ochre plates) in front of the
  stations, down both sides of the bay and along the bottom to the way out; fuel pumps with hose reels and red tool
  cabinets along the side walls (`htoolcab`, drawn side-on), a parts rack, missiles on their trolleys, red tool carts, fuel
  drums, crates on pallets and a spare engine on its stand; lamps along the wall, pools of light on the floor.
- **The facings that never passed**, drawn again over a side-on plan (`--side-on`, `plan_side`: the piece's depth a narrow
  strip lying along its wall, its long top from above with the wall's side dark and its front's edge pale with handles
  along the working side, only its short end below; the prompt says the same): a locker facing left, cargo racks facing
  right and left, the engine console facing right and the parts rack facing right all pass now, in eight tries or fewer
  each (twenty-two failed before). So a cabin's berths have lockers at their feet, as its recipe meant, and a cargo bay's
  racks stand along its side walls.
- **The scale, judged: not changed.** A larger scale (more tiles to a room, a closer camera) would need the pilot drawn
  again at twice his size (six races, five sides, a walk), and the hangar's ship larger than its picture has pixels (a
  Dart's picture is 76 of its own pixels long; doubled, it would show doubled pixels); and seen whole, a finer room would
  be drawn at 1 CSS px a pixel on a phone, finer than the world outside. Instead the hangar's stations were given big
  footprints (up to five tiles across and three and a half tall), so they have room for detail.
- **On the page:** inside the hangar or the deck, a tip sits at the bottom of the screen, clear of the room (it covered
  the ship); the tip for going into the hangar goes once he is in; the tip for a first part says to walk to the bench.
  The tools walk round the ship by its own size (`tools/inside-walk.mjs`, the page's `open()`).
- **Would James call it good?** Better, clearly: the whole room is on the screen, and its three stations are the first
  things seen and say what they are. Not yet what he will call beautiful: the pieces are the model's pictures shrunk to
  24 to 40 px, so the smaller ones (the missiles, the tool carts, the console) read as shapes and colours more than
  things; the bay under the ship is the old art with its pale frame; only the wall at the top shows a face; the help line
  sits over the hangar doors until it fades; the pilot is small beside his ship, as he is meant to be.
- **Still not drawn:** the weapon rack facing forward and the crew bench from behind (every try leaves a rounded corner
  that the corner check refuses: thirty tries each); the maps' marks are drawn (below) but the hangar's own sign over each
  station is not.

### 2. The way down on a slow machine

Profiled (`node --cpu-prof tools/measure-down.mjs`, a new tool that times the way down by tenths of it against a fight at
the same frame size): nearly all of it was the globe's pixels, and most of that was a call a pixel that gave back a colour
too large to pass without being boxed, and numbers kept in the module's own variables, which are made anew each time they
change. Now a span of eight pixels whose ends meet the globe is painted as a run (`paintRun`), the span's values read
once from a typed array, the colour tables flat, the map's place in a typed array, and the air's sky drawn a span at a
time with a span wholly under the horizon passed over. Every pinned frame came out the same.

- Node, 456 × 256, ms a frame (the whole way down; a fight in brackets): overhead 7.1 → 3.7 (2.5), from behind 9.4 → 5.6
  (3.2), from the seat 10.3 → 7.2 (5.5). The relief below adds a few tenths.
- The built site in Chromium, 1366 × 768, the processor slowed (`node tools/slow-machine.mjs <url> 4,6 laptop
down,whole,fight`; `whole` is the whole way down in one view): slowed four times, a third of the way in each view 44, 51
  and 59 frames a second (it was 27 to 38), the whole way 51 to 53, a fight 59 to 60; slowed six times, 29, 33 and 39 (it
  was 17 to 21), the whole way 32 to 33, a fight 37 to 43. **Not yet level with a fight**: within about a fifth of it. The
  next step (the plan's section 20): the ground's materials laid out in tiles, so that neighbouring pixels read
  neighbouring memory (a world's 4 MB of materials read diagonally across is most of what is left), or the far globe kept
  a frame as the overhead disc is.

### 3. Relief on the way down; a black hole close to

- **Relief all the way down** (`render/globe.ts paintRun`, `RELIEF`): low on the way down the ground is the world's own,
  and now a slope turned from the light (from the north west, as the art is lit) is in shade, dithered by how far it
  turns, the slope taken across the ground a pixel covers, so hills, ridges and gorges stand out from high up instead of
  the ground looking painted on until the last second. From behind, at 0.55 to 0.9 of the way:
  [descent-relief-before.png](art/gen/descent-relief-before.png), [descent-relief-after.png](art/gen/descent-relief-after.png).
- **A black hole from behind or the seat** (`render/bodies.ts drawHoleTilted`): its disc lies in the plane, so from beside
  it it is a flattened ellipse tilted by the eye's height over it, its near half passing in front of the shadow and its far
  half behind it, the far half's light bent into an arch over the shadow (fainter under it), the gas streaked round rather
  than in rings. From overhead it is face on, as before. [blackhole-close.png](art/gen/blackhole-close.png): from behind
  and from the seat, 2.4 and 1.5 of its size away.

### 4. Art still open

- **Canyon worlds** (and mesas, which share the strata) read as depth now (`render/world.ts deepColours`): the deeper a px
  of banded rock lies below the world's plateaus, the darker its top, walls and strata, in three dithered steps towards a
  cool shadow; the floor of a gorge is dark and its rim lit. Its terrain is unchanged (no fingerprint moved).
  [canyon-before.png](art/gen/canyon-before.png), [canyon-after.png](art/gen/canyon-after.png) (Mamith, overhead).
- **The pointer** is the image model's: an arrow over the menus, the Fire button's reticle over the sky
  (`static/ui/cursor-32.png`, `reticle-32.png`).
- **The base's screen** shows its place over the hold, drawn by the model: a Nomarchy base, an Anarchoi base, a lone outpost,
  or, docked in space, the side's home station (`tools/gen/interface.py HOME_GROUND`).
- **Not yet:** the maps' marks are drawn by the model (a station, a gate, the raiders' skull, a hotspot's star, in
  `art/interface/source/icon-mark-*`; the derelict came out as boats and was dropped) but the maps still draw their own:
  next, put them on the maps' SVG at two CSS px a pixel and choose where the old shapes read better at a few pixels. The
  settings screen is as it was (plain, a list of keys). Fitted weapons and modules in flight are still small lumps: next,
  the parts drawn by the model at their flying size (as the hangar's are at its), a recipe of their own.

### 5. The HUD on foot

The radar on foot is half as many art pixels across (no larger on the screen than in flight); the rest (the portrait,
the pack, the bar, the flares) is the size it was, one font pixel being the smallest the text can be. Every flight on foot
re-recorded on purpose.

### 6. The playthrough

Played as a new pilot in Chromium at 1366 × 768 and 844 × 390 (touch): the first sortie by its prompts to the galaxy map
(`tools/first-session.mjs`: 56 s on a laptop, 55 on a phone), every screen (`tools/phone-check.mjs` and `--laptop`: 43
screens each, nothing to fix), the hangar, its bench and booth, the deck and its shop, a ship's rooms and Furnish
(`tools/hangar.mjs`). Found and fixed: the hangar's tip covering the ship (and saying to go into the hangar from inside
it); the hangar tool's furniture named Bunk (it is a Berth now) and its walk refused at the ship's tail. Seen and left: on
a phone the long prompt lines along the bottom run under the touch buttons at their ends (the tutorial's box says the same
thing at the top); the page's help line sits over the hangar doors until it fades.

## Polish step 8: beautiful and fun (18 November 2026)

Three parts, in order: close what was open, audit every screen as an art director, and play the game with scripted
players to find where it is not fun.

### 1. What was open

- **The settings** (`SettingsScreen.svelte`, towards `art/mockups/settings-4.png`): a rail of the five sections as large
  icons with a mark that slides to the one open; Controls led by the steering keys drawn as key caps beside "how it flies"
  (three pairs of choices), every action in three groups (Fight, Fly, Screens) with its icon and one key cap, the rest
  in its tooltip, a row pressed waiting for its new key; Sound as two rising rows of blocks; Picture as windows onto a
  ship at each art pixel and letters at each text size; Your key led by whether it is kept safe; the build line moved to
  Relays. The music's icon is the model's. Each key is named once (both Enters were Enter).
- **The maps' marks** are the model's (`static/ui/mark-*.png`, 2 CSS px a pixel, as the icons): a station beside the
  world it orbits on a line to it (a capital's side's mark by it), a derelict's wreck, a gate's ring, the raiders' skull,
  the hotspot's star drawn again larger (16 px) so its rays read; on the galaxy map and the system map, read at phone size
  (`audit-phone`). **The HUD's radar keeps its dots:** its blips are 2 to 3 px, and a 10 px mark would cover what it
  marks.
- **Fitted parts in flight** (`tools/gen/parts.py PART`, `tools/voxel/parts.py`, `render/paint.ts PART_COLOURS`): drawn
  again by the model for their flying size (a few big shapes, a thick outline), **made larger features of the hull**
  (10 to 16 px: a pod, a rack, a dish, where they were 3 to 7) on the hulls' mount points, and given **their own colours**:
  a palette family of four ramps (a missile's red tip, hazard yellow, a tractor's green, a lens's cyan; heat sinks and
  cruise drives glow). The hangar's larger build keeps its sizes. [parts-flight-before.png](art/gen/parts-flight-before.png),
  [parts-flight-after.png](art/gen/parts-flight-after.png).
- **The way down on a slow machine**: the ground and the globes' maps read from levels as fine as the frame needs. The
  measuring tool had never changed the view (every number was overhead); with real views, the whole way down against a
  fight, frames a second, ×4: overhead 54 (60), from behind 40 (41), from the seat 37 (32); ×6: 35 (45), 26 (27), 25 (19).
  **Level from behind, quicker from the seat, 78 to 90% overhead** (the overhead fight is the cheapest frame in the game);
  a third of the way down from the seat is still the dearest moment (25 and 16). The plan's section 20 has the table.
- **Prompts on a phone** never run under the touch buttons: the page says how wide the button columns are (`hudSides`),
  and a prompt too wide goes a line a part, long lines broken into words (HUD, space, on foot, inside).
- **The two facings** (the weapon rack facing forward, the crew bench from behind) **pass now**, over new guides: a sketch
  of what each piece is, in the hangar's recipe. Both are used. The parts rack facing right still fails; racks face the
  top and left walls only.
- **Small props, the bay**: every piece inside drawn again in the hangar's look (dark gunmetal and purple grey, orange,
  brass, red and teal, bright lights) over a sketch of what it is; the ship's pieces had been pale cream boxes beside the
  hangar's. The bay is dark plates in a band of hazard stripes with chevrons and a centre line (no pale frame); the
  gantries a matching pair; the missiles' trolley and the spare engine drawn again. [tiles.png](art/gen/tiles.png),
  [rooms.png](art/gen/rooms.png), [fit-outs.png](art/gen/fit-outs.png), [hangar-step8.png](art/gen/hangar-step8.png).

### 2. The art audit

`node tools/audit.mjs <dir>` captures every screen and place at 1366 × 768 (113 pictures: the first screens, the
tutorial, nine kinds of world in three views, weather, a fight, a base and its screens, on foot, the places inside,
space by every kind of body in three views, the way down and up, the maps, the menus; the settings and the hangar's
screens from `tools/phone-check.mjs --laptop`); `uv run tools/audit-sheets.py` lays them out as contact sheets:
[docs/art/gen/audit/](art/gen/audit/) `before-<group>.png` and `after-<group>.png`. Scored against the best screens
(the volcanic and ice worlds, the entry from space, the faction screen, the cockpits: 5).

| Group                 | Pictures | Average before → after | 3 or lower before → after |
| --------------------- | -------- | ---------------------- | ------------------------- |
| First screens         | 5        | 4.2 → 4.2              | 0 → 0                     |
| Tutorial              | 2        | 3.0 → 4.0              | 1 → 0                     |
| Worlds (9 × 3 views)  | 27       | 4.2 → 4.2              | 2 → 2                     |
| Weather               | 10       | 3.7 → 3.7              | 3 → 3                     |
| A fight (3 views)     | 3        | 4.0 → 4.0              | 0 → 0                     |
| A base and its screen | 4        | 3.8 → 3.8              | 1 → 1                     |
| On foot               | 2        | 3.5 → 3.5              | 1 → 1                     |
| Inside                | 7        | 3.6 → 3.6              | 3 → 3                     |
| Space (10 × 3 views)  | 28       | 3.0 → 3.2              | 17 → 15                   |
| The way down and up   | 8        | 3.8 → 3.9              | 3 → 2                     |
| Maps                  | 5        | 3.6 → 4.0              | 2 → 0                     |
| Menus and settings    | 12       | 4.0 → 4.0              | 0 → 0                     |
| **All**               | **113**  | **3.7 → 3.8**          | **33 → 27**               |

**Fixed, worst first:**

- _Docked at home, the tutorial's first screen_ (2 → 4): the first sortie's box over the arrival's lines, and the
  system's name lost over the station's hub. The box sits lower; **a place's name as it is arrived at sits on a soft dark
  plate** (`render/hud.ts namePlate`), so it reads over a station, a black hole's glare (the hole from behind, 3 → 4) or a
  bright sea.
- _A gas giant close to_ (2 → 3, behind and the seat): one flat colour across the frame. Now its cloud streams along its
  bands in streaks of light and shade, a band's edge mixing into the next.
- _The system map_ (3 → 4): names crowded round a belt's name, the outermost gate's name cut off at the edge.
- _The way down, low_ (3 → 4): the height (ALT) drawn over the protection's countdown.
- _The Ship button on a phone_: its icon was an arrow like Climb's; now a ship.
- The audit's own faults, found by it: it never changed the view (every "chase" and "cockpit" was overhead) and caught
  the weather from behind; both fixed, and the slow-machine tool with them.

**Still 3 or lower, and what stops each:**

- _Space overhead by a gas giant (1), a black hole, a sun, a moon (2), open space (3)._ **True scale** (settled): from
  overhead the frame is about 450 px across and these bodies tens of thousands, so beside one the frame is black, or the
  sun's heat tints it flat orange; a moon far below is a dark disc on its night side. Another projection overhead would
  reopen the decision. The radar and the HUD's marks point the way; from behind and the seat they fill the screen.
- _The seat by a gate, a station or a world (2), a gate and a world from behind (3)._ The capture flies past them
  (heading along, the body beside); flown at, they fill the windscreen as the sun does in `space-open-cockpit`.
- _A sun close to (3)._ A wall of flat cream with faint grain. Next: the sun's surface drawn by the model as a texture.
- _A gas giant close to (3)._ The streaks help; the bands are still blocks, the giant's map being coarse at that range.
  Next: a finer band map near.
- _Mesa worlds from behind and the seat (3), night (3), sunset (3)._ Little contrast between ground, mesas and sky; at
  night purple grey on purple grey; at sunset a pink haze flattens the island. A night grade was tried and gave no clear
  gain (reverted). Next: the mesa palette and the night and sunset grades with more contrast in value.
- _A base from the seat (3)._ Its buildings' sides are flat grey slabs. Next: their walls drawn from their art in
  perspective (`render/world.ts`).
- _A ship's rooms and the deck (3)._ A fighter's rooms are small in a frame of black, its pieces at 8 px a tile read as
  colour more than things; the deck is a wide, nearly empty floor. Next: more pieces on the deck (its layout is data).
- _Furnish (3)._ The pieces' icons are a few px in large tiles, and a tip shows round the panel's edge.
- _On foot over grass (3)._ A wingman flying low over the pad covers the pilot for a moment.
- _High on the way down (3), the way up from behind (3)._ The ground high up is dark and soft under blocky clouds; the
  air's sky ends in a hard straight line under a band of black. Next: the air's top faded into space over a band
  (`render/air.ts`).

**Consistency, across the whole game:**

- _Palette:_ one set. The page (navy panels, gold accents, cream text) and the frame's HUD agree; the pieces inside
  now share the hangar's colours. The cockpits' cool grey blue against warm worlds is meant.
- _Light:_ from the north west (top left) on the worlds' relief, the hulls, the pieces inside, the icons and the marks;
  in space each body lit by its own sun.
- _Outline:_ things (hulls, parts, pieces, icons, marks, the pilot) have a dark 1 px outline; ground and clouds do not.
- _Pixel size:_ one art pixel everywhere in a frame (the way down's map levels are read from, not scaled); the page's
  icons and marks at 2 CSS px a pixel. Only the settings' art-pixel windows show other sizes, on purpose.
- _Text:_ plain words, the pixel font in capitals, on the page and in the frame. One fault found and fixed (a key named
  twice).

### 3. Pacing: scripted players

`npx jiti tools/players.ts` plays six kinds of pilot from a fresh save for half an hour each, through the scene's
controls only (the page's screens played in their place, each costing the seconds a player spends in it), and logs every
second. Before (the game at `9e58347`) and after (with the fixes below), the same tool:

| Kind            | Credits a minute | Rewards in 10 min | Longest gap between rewards (s) | Deaths  | Worlds, systems seen |
| --------------- | ---------------- | ----------------- | ------------------------------- | ------- | -------------------- |
| Prompt-follower | 0 → 139          | 9.3 → 19.3        | 96 → 149                        | 0 → 2   | 1, 1 → 2, 2          |
| Miner           | 128 → 128        | 18.3 → 18.3       | 143 → 143                       | 2 → 2   | 2, 2                 |
| Fighter         | 47 → 47          | 21.3 → 21.3       | 145 → 145                       | 8 → 8   | 16, 7                |
| Explorer        | 0 → 3            | 2.3 → 21.3        | 1644 → 130                      | 16 → 10 | 2, 5 → 18, 12        |
| Trader          | 116 → 120        | 10 → 9            | 229 → 205                       | 0 → 0   | 3, 4 → 2, 2          |
| On foot         | 103 → 103        | 20.7 → 20.7       | 143 → 143                       | 0 → 0   | 2, 2                 |

(A reward: a kill, a sale, an upgrade, a new world or system, a find, a flag, ore banked. The prompt-follower's 96 s
before is a bank every minute and nothing else.)

Minutes to each first, after: the prompt-follower sells at 1.1, upgrades at 3.8, reaches a new system at 15.4, a new
world at 15.8 and makes a kill at 16.2 (before: none of these in half an hour); the miner sells at 1.9, upgrades at 2.9,
a new system at 7.1, a kill at 12.9; the fighter's first kill at 2.0, a new system at 0.9; the explorer's first new
system at 0.7, a new world at 9.0 (2.6 before: he now goes further first); the trader sells and upgrades at 4.3; on
foot, a flag at 1.5, a sale at 3.3, an upgrade at 4.8. **No kind buys a new ship**: the tool spends on parts first and
never chose a hull (a miner at 128 credits a minute could have a Sparrow, 800 and 6 silica, in about seven minutes of
saving). Time, after: the miner 45% mining, 23% fighting, 17% in screens, 8% in transit; the fighter 37% fighting, 20%
cruising, 16% in transit, 14% in the air; the explorer 35% cruising, 22% in the air; on foot 63% walking. Dead or
waiting to fly again: 1 to 2% for every kind. The quietest stretches (nothing decided, nothing happening) are 90 to
205 s: a vein mined out between two screens, a cruise between frontier worlds (60 to 90 s each way), the trader's run.

Deaths, after: of the fighter's eight, three were fights he chose, three were his pilot drowned or burned after
ejecting over sea or lava (warned in time but falling), two shot down while flying on; the explorer's ten were all
warned in time (raiders by gates and belts) but for three warned under 5 s before.

**Fixed, with what was there** (`aa0b444`):

- **The prompt-follower never earned a credit or left home** in half an hour: the tips said to bank ore but never that
  banked ore is sold. Two tips now: banked ore is sold at the market (keeping what a part needs), and home pays least,
  the frontier beyond the gate nearly twice, with raiders by its rich ore.
- **The explorer was shot down sixteen times** in half an hour: shot down in a system with no station of his, his new
  ship was put down on a world of the same system, beside the raiders. It waits now at the nearest station of his a jump
  or more away (16 → 10 deaths, 2 → 18 worlds, the longest gap between rewards 1644 → 130 s).
- **The flag tip** said to hold Use twice as far out as holding plants a flag.

The questions this leaves for James are in [playtest.md](playtest.md).

## Polish step 9: fun fixed with what exists, the weakest screens raised (18 November 2026)

The brief: fix the six things step 8's scripted players found not fun, with the systems that exist and numbers in
`data/`, and raise the 27 screens step 8's audit scored 3 or lower. Measured the same ways, before and after.

### How it was measured

`npx jiti tools/players.ts` again, with three changes to the players themselves, found on the way, so that the before and
after are the same players: **they buy a part once and keep it** (step 8's bought the same three parts over and over, as
their list of fitted parts dropped the oldest), **they save for a ship** once their Corsair's slots are full (step 8's
never chose one), and **they mend and buy on a pad**, not on open ground beside it (a fighter set down and lifted off for
the second half of an hour). It now takes `--clock` (another day of the shared clock: other prices, bands beaten or not)
and plays the game as it stood before this step from a git worktree (`970fe3a`), doing without what that game lacks. Each
kind was played on three days, before and after; the figures are the median of three (a single half hour is one roll of
the dice: one fighter's first part came at 3.6 minutes, another's at 5.8). A gem caught counts as a find.

| Kind            | Credits a minute | Rewards in 10 min | Longest gap between rewards (s) | Longest stretch with nothing (s) | Deaths (drowned or burned) | First part (min) | First ship (min)                     |
| --------------- | ---------------- | ----------------- | ------------------------------- | -------------------------------- | -------------------------- | ---------------- | ------------------------------------ |
| Prompt-follower | 161 → 317        | 18.7 → 64.7       | 131 → 85                        | 35 → 37                          | 2 → 0 (3 → 0 in all)       | 3.8 → 3.2        | none → 12 to 19                      |
| Miner           | 120 → 153        | 16.7 → 51.3       | 156 → 79                        | 39 → 38                          | 4 → 3 (4 → 0)              | 6.4 → 5.7        | 22 to 26 → 22 to 27                  |
| Fighter         | 26 → 122         | 26.0 → 27.7       | 113 → 208                       | 36 → 45                          | 3 → 6 (1 → 0)              | never → 5.8      | never → 29 to 48 (2 of 3 in an hour) |
| Explorer        | 3 → 16           | 22.0 → 22.7       | 113 → 116                       | 54 → 40                          | 9 → 5 (1 → 0)              | –                | –                                    |
| Trader          | 106 → 111        | 7.3 → 15.7        | 256 → 175                       | 43 → 34                          | 6 → 3 (1 → 0)              | 4.9 → 8.5        | 21 to 23 → 23 to 29                  |
| On foot         | 88 → 96          | 16.0 → 16.3       | 267 → 167                       | 60 → 75                          | 0 → 0                      | 4.8 → 4.3        | 19 to 26 → 19 to 29                  |

Step 8's own figures, from its players, for comparison: the fighter 47 credits a minute and nothing bought, the miner 128,
the trader 120, the frontier miner about the trader's pay, three of the fighter's eight deaths drowned or burned, no
ship bought by anyone.

### Part 1: what was not fun, and what was done

1. **Fighting led nowhere** (a fighter made 41 kills, 1,400 credits and could buy nothing: every price asked for ore).
   Three things, all data or the existing ledger: ore a price asks for that the vault lacks is **made up at the counter at
   twice its standard price** (`SHOP.makeUp`, `payFor`; the page's bench, shop and spending use it, the price shown is the
   price now); a kill pays **0.6 of a hull's points, not 0.2** (a light raider on the frontier 60, a Lance deeper out 135);
   a raider band or a derelict's drones that the pilot helped beat pays **its side's bounty** (`BAND_BOUNTY`: 120, 220,
   360 by wildness; the news says so). The fighter: 26 → 122 credits a minute, his first part at 5.8 minutes (the miner's
   5.7), his Corsair's four parts bought by 17 to 28 minutes and a Lance (2,100 with its ore made up) at 29 to 48 minutes
   on two days of three, played for an hour.
2. **Deaths that were not his fault** (drowned or burned after ejecting). Over deep water, lava or acid, or coming down
   into it, the canopy **opens at once and glides** (20 px a second down, steered at 64 across: from a low fight about 400
   px, from 150 px up 750; over land it drops as before). **A ring on the ground marks where he will come down**, green on
   land and red where he cannot live, kept on the screen, and **an arrow from it points to the nearest land** with its
   distance (`foot.down`, `foot.shore`). **Raiders' spots are kept within 200 px of land** (`ashore`): over every world, the
   farthest any sea point lies from land is under 490 px, a raider's spot now at most 200. Deep sea is still death.
   Found on the way and fixed: a pilot who came down in a hollow he could not walk out of was stuck for good (his called
   ship landed beside it, out of reach): he is set on open ground near; and a pilot walled off from his parked ship (by
   a cliff, or an outcrop's crystals grown back) had no way to it: his own ship, 90 px off or more, can be called to him (a
   quiet CALL YOUR SHIP, 9 s, free). Drowned or burned after ejecting, in all eighteen half hours: 11 → 0. Two new flights:
   "shot down over the sea, gliding to the shore", "his parked ship called to him".
3. **Nobody bought a second ship.** Hulls **about a quarter cheaper** (600 to 3,400); each with **a line of what it gives
   that no part can** (`HULL_PITCH`); **two tips**: once the Corsair's two module slots are full, the ship that suits how
   he earns (`NEXT_SHIP`: a Prospector for one who sells ore, a Lance for one who earns by bounties) and its price, and
   again once he can buy it; **a ship bought is flown at once**, the page going into the hangar where it stands, with a toast
   of what it is. Every kind but the explorer (who never spends) now buys a second ship inside half an hour on most days,
   the prompt-follower at 12 to 19 minutes (he never did: nothing told him), the fighter within the hour. Found on the
   way: with players that save for a ship, the game before already let a miner or a trader buy one in 21 to 26 minutes;
   step 8's players never chose one.
4. **Cruises of 60 to 90 seconds.** The drive **starts 140 px from a station or a gate** (it was 260: leaving one took
   eight seconds at the ship's own speed), **spools in 0.9 s** (1.2), **runs 1.15 of the distance to the nearest thing a
   second** (0.9) up to 1,100 times its speed (640). A quicker drive carried ships past a black hole's ring into it (a
   fighter lost eighty ships so in an hour, played on), so near a black hole or a sun it slows where their pull and heat
   bite (1.5 of their size, not their surface), and caught in a great pull it brakes at once; threading is as it was. The
   capital's station to its gate: 25 → 18 s. The explorer's longest cruise 65 → 30 s, his longest stretch with nothing at
   all 54 → 40 s. Nothing was added to the crossings: at fifteen to thirty seconds, a body growing from a point ahead, they are
   judged right.
5. **Danger did not pay.** Danger pays in the ore now, not the market: **gems** (below) come likelier the wilder the place,
   and a world pays **90% for its own ore and 110% for what it lacks** (82% and 122% had paid a trader who mined at home and
   sold where his ore was lacking about what a frontier miner made). Once out of the home system, credits a minute (median
   of three): the miner 191 → 229, the trader 119 → 133, so the frontier pays about 1.7 times safe trading (step 8's
   players had measured 128 against 120, but they re-bought parts and sold at their own world's price). Deeper out pays
   more again: the expected chunk is worth 1.2 units on the frontier, 1.3 deeper out, 1.4 at the core (1.5, 1.8, 2.0 at a
   rich deposit there).
6. **Mining a chore.** What the player does in it is now a choice: **the laser cuts faster held close and low** over the
   outcrop (0.8 of its pace at the edge of its reach, 1.3 right over it: `MINE.aim`), and **now and then a chunk is a gem**
   (`CHUNK.gem`: a white-cored crystal of its ore with flashing rays, worth three, thrown further, gone in 16 s; more of
   them from a rich deposit, which raiders guard, and the wilder the place), so there is a reason to choose where to cut
   and something to chase. A miner catches a gem every 10 to 20 s of mining; his longest gap between rewards 156 → 79 s,
   his longest quiet stretch 122 → 73 s.

The fighter's longest gap between rewards grew (113 → 208 s): the stretch where he flies from one beaten band to the next
world; his rewards in ten minutes and his pay rose. The miner's longest stretch with nothing (38 s) is a full hold flown
home; the on-foot pilot's (75 s) a long walk to a vein. The balance test (no fit a quarter better than its hull bare on a
fighting stat) passes unchanged; the first-hour bot (`tools/first-hour.ts`) and the first sortie play through.

### Part 2: the screens, re-captured and re-scored

`node tools/audit.mjs` against the dev server, the settings and the hangar's screens from `tools/phone-check.mjs --laptop`
as before, laid out by `uv run tools/audit-sheets.py <dir> step9`: [docs/art/gen/audit/](art/gen/audit/)
`step9-<group>.png` (step 8's `after-<group>.png` are this step's before). Scored the same way, against the same best
screens. The audit itself now places the ship afresh for each view in space (it had flown past a station or a gate before
the seat's picture was taken, so step 8 judged the black behind it). Two new tools draw the same places from the engine
alone, quicker: `npx jiti tools/space-places.ts <dir> [place[:k[:angle]]]` and `npx jiti tools/world-places.ts <dir> <id>`.

| Group                 | Pictures | Average before → after | 3 or lower before → after |
| --------------------- | -------- | ---------------------- | ------------------------- |
| First screens         | 5        | 4.2 → 4.2              | 0 → 0                     |
| Tutorial              | 2        | 4.0 → 4.0              | 0 → 0                     |
| Worlds (9 × 3 views)  | 27       | 4.2 → 4.3              | 2 → 0                     |
| Weather               | 10       | 3.7 → 4.0              | 3 → 0                     |
| A fight (3 views)     | 3        | 4.0 → 4.0              | 0 → 0                     |
| A base and its screen | 4        | 3.8 → 4.0              | 1 → 0                     |
| On foot               | 2        | 3.5 → 4.0              | 1 → 0                     |
| Inside                | 7        | 3.6 → 3.9              | 3 → 1                     |
| Space (10 × 3 views)  | 28       | 3.2 → 3.8              | 15 → 7                    |
| The way down and up   | 8        | 3.9 → 4.0              | 2 → 1                     |
| Maps                  | 5        | 4.0 → 4.0              | 0 → 0                     |
| Menus and settings    | 12       | 4.0 → 4.0              | 0 → 0                     |
| **All**               | **113**  | **3.8 → 4.0**          | **27 → 9**                |

**Fixed, worst first:**

- _Space overhead by a gas giant (1 → 4), a black hole (2 → 4), a sun (2 → 3)_: true scale stays; overhead, the bodies in
  the plane are drawn **pulled back**, as the worlds below it have been since true scale (`OVERHEAD_SHARE`: a giant at
  0.075 of its size, a sun 0.055, a black hole 0.075), drifting round the ship so that their edge passes under it where it
  crosses their true edge: beside a giant its banded curve and limb fill a side of the screen, beside a black hole its
  shadow, ring and swirling disc. A black hole's disc had wound its arms tighter for as long as the game ran (a pace by its
  distance out), until face on it was rings like a record's: two layers now turn as wholes, the inner quicker.
- _The seat by a gate, a station, a world (2 → 4, 3, 4)_: the audit's capture (above); and beside a world the camera looks
  down at it, the seat further, so a world below the plane is not under the panel.
- _A sun close to (3 → 4, both views)_: its surface from the image model (`SUN_NEAR`, from `tools/gen/space.py sun-near`:
  bright granules in darker lanes, sunspots), the granules about the same size however near, the corona in ragged tongues
  and rays. It had been a wall of flat cream (nearly every pixel the top of the ramp).
- _A gas giant close to (3 → 4 from the seat, 3 from behind)_: its clouds close to from the image model (`GIANT_NEAR`:
  eddies, vortices and storms) shade its bands and bend their edges; night sides of every globe are lit faintly cool blue
  (they were all but black: a ship coming at a giant from beyond it saw nothing), with an air's rim round the whole limb.
  Its bands and streaks no longer cut off in a straight line where the map wraps.
- _The way up from behind (3 → 4)_: the air's sky had been drawn under the horizon (the way to the world's middle taken up,
  not down), leaving a thin bright band ending in a hard straight edge under black; it now deepens from the horizon up.
- _Mesa worlds from behind and the seat (3 → 4)_: the rose and lilac palette deepened (plum, rose and cream strata, a deeper
  sky), and far mesas fade into the sky's middle colour, not its white horizon.
- _Night (3 → 4, both)_: moonlight by how light each colour is (darks dark, lights clear, a cool blue, a little of the
  colour's own hue), shade deeper; lit windows at bases; it had been a third of every colour over a blue floor.
- _Sunset (3 → 4)_: a fog or dust at sunset glows gold (graded and tinted as the ground was, it came out a flat lilac pink).
- _A base from the seat (3 → 4)_: buildings' walls have storeys, a seam at each, rows of windows (lit at night), a plinth,
  in a mid grey of their roofs (they were near-black slabs).
- _A ship's rooms (3 → 4) and the deck (3 → 4)_: the rooms drawn as large as lets them be seen whole (`SHIP_FIT`, never
  smaller than before), standing on the hangar's floor with the hull's shadow on it (they were small in black); the deck
  furnished from the pieces there are by the tiling rule (a holo chart table, mess tables and seats, deck lights, trophy
  cases, aquariums, screens, planters, cargo in the corners) and nine people about it, not five.
- _On foot over grass (3 → 4)_: wingmen hold off wider and higher while their pilot is out of his ship.

**Still 3 or lower, and what stops each:**

- _Open space overhead (3)_: black with stars and the ship. James's own rule (black and empty); nothing to add without
  breaking it.
- _A sun overhead at the audit's distance (3)_: 1.35 of its size from its middle, its limb lies just off the frame; the
  frame is its corona's glow (now in rays). Closer, its granules and limb fill the frame (4).
- _A moon overhead (3), a world from behind (3), high on the way down (3)_: each caught on its night side; lit cool blue
  now, but dim, as a night side is.
- _The seat beside a station (3)_: at 270 px its arms and wings are big slabs across the windscreen; the station kit is the
  model's art at its size, built in code (step 8's open item).
- _A gas giant close to from behind (3)_: straight edges remain between a few bands close to (the band map's rows, carried
  between samples eight pixels apart); the seat's view of the same reads well.
- _A belt from the seat (3)_: rocks small in black ahead.
- _Furnish (3)_: a piece is a few 8 px tiles, shown at the page's 2 CSS px a pixel; drawn larger, its pixels would not be
  the page's.

**Speed** (`node tools/measure.mjs 456 256`, before this step and after, one ship, ms a frame): nothing near the budget.
Over a world unchanged (1.84 → 1.88 overhead, 2.67 → 2.66 behind, 3.86 → 3.90 the seat); in space the dearest is still a
gas giant from the seat (8.35 → 8.48); a sun from the seat 5.73 → 7.77 (its granules and the corona's rays), a world from
the seat 3.32 → 4.44 (the seat looks down at it), the way down from the seat 7.34 → 7.68; inside, a ship's rooms 0.08 →
0.51 (the hangar's floor round them).

**Checks:** lint, type check, the full suite (415 tests, the frame tests re-recorded on purpose where the pictures were
meant to change: listed in each commit) three times over, and the phone check at both sizes (43 screens each, nothing to
fix).

## Order

1. Enemies that belong to places, in place of the endless waves.
1. Sound and music from real audio, early, so James can listen while the rest is built.
1. The interface: the same style, made larger, calmer, shorter-worded, polished and animated.
1. Space: black and empty, true-scale worlds with atmospheric entry and exit, three views.
1. The pilot's size, the cockpits, interiors and items.
1. Everything else on this list, then a bug hunt across the whole game.
