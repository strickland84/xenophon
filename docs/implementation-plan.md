# Xenophon: Twin Stars: game design and implementation plan

The game: **Xenophon: Twin Stars** (named so on 2026-11-19; it was Borrowed Stars).

Written 16 November 2026. Status: the spec. Phases 0 to 8 are built, and Phase 9's first part (the
first session); each section says what of it is ("Built in Phase …").

Companion to [serverless-multiplayer-research.md](./serverless-multiplayer-research.md), which
explains why the networking choices below look the way they do.

How to read this: everything is a proposal. Numbers are starting values to tune by playing.
The choices that most need your call are collected in [Open decisions](#25-open-decisions) at
the end.

## Contents

1. [Vision and pillars](#1-vision-and-pillars)
2. [Constraints](#2-constraints)
3. [The core loop](#3-the-core-loop)
4. [The galaxy](#4-the-galaxy)
5. [Planets](#5-planets)
6. [Modes of play](#6-modes-of-play)
7. [Ships](#7-ships)
8. [Combat and PvP rules](#8-combat-and-pvp-rules)
9. [Characters](#9-characters)
10. [Customization](#10-customization)
11. [Inventory, resources and economy](#11-inventory-resources-and-economy)
12. [Factions and territory](#12-factions-and-territory)
13. [Traces](#13-traces)
14. [Progression](#14-progression)
15. [Onboarding and the first session](#15-onboarding-and-the-first-session)
16. [UI](#16-ui)
17. [Audio](#17-audio)
18. [Multiplayer architecture](#18-multiplayer-architecture)
19. [Save data](#19-save-data)
20. [Engine work](#20-engine-work)
21. [Testing](#21-testing)
22. [Roadmap](#22-roadmap)
23. [Risks](#23-risks)
24. [Out of scope for the first release](#24-out-of-scope-for-the-first-release)
25. [Open decisions](#25-open-decisions)

## 1. Vision and pillars

A small, hand-sized galaxy of 40 habitable worlds, fought over by two factions, with PvP
always on. You fly, fight, land, walk, mine and bank. It runs in a browser tab with no server
of ours.

Pillars, in priority order. When two ideas conflict, the higher pillar wins.

1. **Flying and fighting feel great.** Everything else is built on the dogfight.
2. **Every flight has stakes.** What you carry only counts once you land and bank it.
3. **Being shot down is the start of something.** You eject and carry on, on foot.
4. **The galaxy remembers.** Players leave marks that others find later.
5. **Fun alone, better together.** Most sessions will have few players nearby.
6. **Small and dense beats huge and empty.**

## 2. Constraints

From the research:

- No server of ours. Peers connect directly over WebRTC and find each other through public
  infrastructure.
- Rooms hold roughly 8 to 16 players, because every peer connects to every other.
- There is no authority, so cheating cannot be prevented. This is accepted until the game has
  players. The design keeps a path to harden it later (signed events, checkable rules).
- Some pairs of players will fail to connect (strict NATs). The rate is unmeasured for us.

From the codebase as it stands today:

- The engine is a software renderer drawing into a low-resolution pixel buffer. A scene is
  stepped with a time and plain input numbers, and returns a picture as bytes
  (`src/lib/engine/scene.ts`).
- The jet is a sprite stack: 13 slices of 34 by 46 pixels, cut from four-view art by
  `tools/gen-jet-model.mjs`. Its palette already has body, accent and canopy colour families.
- A world is a 2048 by 2048 height map that wraps at the edges, with a material per ground
  pixel and a cloud layer (`src/lib/engine/world/`).
- There is one planet type today: green islands, with one fixed material palette. (Phase 3
  added the rest: section 5, "Built in Phase 3".)
- Three camera views exist (overhead, chase, cockpit), sharing one projection.
- Crash and ejection already exist as a full sequence: seat rocket, parachute, pick-up.
- Up to two wingmen fly in formation, and jet shadows are limited to three.
- The simulation takes a variable time step.
- Every frame of nine scripted flights is pinned by fingerprint tests
  (`src/lib/engine/testing/`). Any change to the picture fails them until re-recorded.
- Terrain generation uses only exact arithmetic, so it should match bit for bit across
  browsers. Trigonometry appears only in the spawn search and cloud placement.

## 3. The core loop

**Sortie, risk, bank.**

1. **Launch** from a base or station with an empty hold.
2. **Go out** to where the value is: today's ore hotspot, an enemy-held planet, a wreck.
3. **Grab** something: ore, salvage, a kill bounty, a planted flag.
4. **Get home** while carrying it. You are slower and worth shooting.
5. **Land and bank.** Now it is yours.

When it goes wrong:

1. Your ship is destroyed and you **eject**.
2. You land under a parachute and you are **on foot**.
3. You run for cover, call a replacement ship, get picked up by a teammate, or get strafed.

Loops at larger scales:

| Scale    | Length        | What you are doing                                     |
| -------- | ------------- | ------------------------------------------------------ |
| Moment   | Seconds       | Turning, rolling, shooting, dodging                    |
| Sortie   | 5 to 15 min   | Launch, grab, bank                                     |
| Session  | 30 to 60 min  | Several sorties toward a ship part or a planet capture |
| Campaign | Days to weeks | Your faction's map colour spreading or shrinking       |

## 4. The galaxy

### Structure

One canonical galaxy, generated from a fixed seed and a version number. Every player
generates the same galaxy locally.

| Thing            | Count    | Notes                                                        |
| ---------------- | -------- | ------------------------------------------------------------ |
| Star systems     | 12       | 2 faction home systems, 9 frontier systems, 1 core system    |
| Habitable worlds | 40       | Planets and habitable moons. These can be captured.          |
| Barren moons     | About 30 | Landable, airless, rich in ore. Cannot be captured.          |
| Gas giants       | About 14 | Not landable. Skimmed for gas.                               |
| Suns             | 13       | One per system, one system has a binary pair                 |
| Black holes      | 3        | One at the core, plus a linked pair that works as a shortcut |
| Asteroid belts   | About 8  | Mining and cover in space                                    |
| Space bases      | About 14 | 2 faction capitals, 9 frontier outposts, a few derelicts     |
| Jump gates       | About 30 | Two to four per system, forming the lane network             |

Distribution of the 40 habitable worlds: 4 in each home system (8), 30 across the 9 frontier
systems (3 or 4 each), and 2 in the core system.

### Lanes and front lines

Systems are joined by jump lanes into a graph. Each system has 2 to 4 lanes. The two home
systems sit at opposite ends, with the core in the middle.

- Lanes create chokepoints and a front line, so players are funnelled toward each other.
- A gate is a place in space, so it is a natural ambush point.
- The linked black hole pair joins two distant frontier systems: a fast, dangerous route.

### Bodies

| Body          | In space                                      | Gameplay                                                     |
| ------------- | --------------------------------------------- | ------------------------------------------------------------ |
| Sun           | Huge glowing disc with a corona               | Heat damage inside the corona. Its colour tints its planets. |
| Habitable     | Shaded disc showing its real terrain colours  | Fly over it and descend to enter the surface                 |
| Barren moon   | Cratered grey disc orbiting a planet or giant | Low gravity, no clouds, black sky, best ore                  |
| Gas giant     | Very large banded disc                        | Skim the upper bands to collect gas; too deep, it crushes    |
| Asteroid belt | Field of drifting rocks                       | Mine with the laser, hide from pursuers                      |
| Black hole    | Dark disc with a bright ring that bends stars | Strong pull. The ring is a shortcut, the centre is death.    |
| Space base    | Station built from stacked parts              | Dock to bank, trade, refit and respawn                       |
| Jump gate     | Ring structure                                | Charge for a few seconds inside it to jump the lane          |
| Derelict      | Broken station or hulk                        | Salvage site guarded by drones                               |

Star types (red dwarf, yellow, blue giant, binary) set the light colour for every planet in
the system, so systems feel different from each other at a glance.

### Scale and travel

- A system is a flat plane about 280,000 pixels across (24,000 until the polish pass gave its
  bodies their true size: see below).
- Normal flight speed is the same as in atmosphere.
- A **cruise drive** takes you to about 8 times normal speed after a short spool-up, and on
  up to hundreds of times it in open space (the polish pass). You cannot fire while cruising,
  and taking damage drops you out of it.
- Target: any two bodies in one system are under 40 seconds apart, and any two systems are
  under 3 minutes apart.

### Generation

`galaxy(seed, version)` produces a plain data description: systems, lanes, bodies, orbits and
a recipe for each planet. Nothing is stored. A planet's surface is only built when someone
arrives.

Names are generated from syllable tables, then overridden by the first player to land (see
[Traces](#13-traces)).

### Built in Phase 6

Space is a zone (section 6) of its own for each system (`sim/space.ts`, numbers in
`data/space.ts`; drawn by `render/space.ts` and `render/bodies.ts`).

- **The plane:** the galaxy's positions as they were made in Phase 3, in px from the system's
  middle: gates at 11,000, the farthest world at 12,600. Every body is on its orbit at the
  shared UTC clock, the galaxy's periods played out more slowly (`ORBIT_SLOW`: 120 then, 4 since 2026-11-18): planets
  move under a px a second, moons a few, a station round its world about ten. Ships fly level at
  one height (64 px); there is no altitude in space yet, and only the overhead view.
- **The cruise drive:** View (V, the Cruise button, △ / Y) starts it: 1.2 s of spooling, then
  speed eased up to 8× (736 px/s for a Corsair). It turns at 60%. Guns and missiles are held
  while it cruises; it drops out when the ship is hit, fires, is pulled harder than 26 px/s² by a
  sun, giant or black hole, or comes within 380 px of the edge of the body its course is plotted
  to; among a belt's rocks it throttles to 2.5×.
- **Gravity:** each sun, giant and black hole (and weakly each world and moon) pulls with
  `pull × (size / distance)²`, capped, out to a few of its sizes; the pull builds a drift the ship
  is carried by, which dies away once out of the well (`GRAVITY`). Suns burn inside 1.5 of their
  size (harder deeper); a giant crushes below 0.74 of its size; a black hole's horizon (0.42) is
  death.
- **Journeys**, flown by a scripted pilot (scratch script; the times include taking off and going
  down): world to world in one system 27 s (pad to arrival: 7 s out, about 17 across on the
  drive, 3 down); the Nomarchy's capital world to the Anarchoi's (Low Knot, Blacktooth) through the
  black hole shortcut, three jumps, 1 min 56 s; to the core's space by three gates 2 min 38 s.
  Any two bodies of a system are under 35 s apart on the drive; the long way round between the
  homes (six gates) would be about 3.5 minutes, over the target, but the shortcut is under 2.
- **The bodies:** a world or barren moon is a sphere wrapped in a map of its own built surface
  (`space/maps.ts`: its ground colours, shaded slopes, glowing lava, its clouds, its air round its
  lit edge, lit from its sun, darker to its limb), turning slowly; going down, the ship arrives
  over the very spot of the map it dived into. Gas giants are spheres of the image model's band
  pictures, stirred finer. Suns boil (two layers of the model's surface picture drifting), redden
  to their edge, and have ragged flames and a wide glow in their star's colours. Black holes bend
  the stars and the nebula behind them round a bright ring, with a disc of hot gas in winding arms.
  Belts are fields of drifting rocks (made from their place, never stored), some with ore.
  Stations are built in code from the model's kit (a hub of each side's look or an outpost's,
  docking arms, solar wings, tanks), turned to face their sun; gates are rings with a field that
  brightens as they charge; derelicts are wrecks with drones. Behind everything, a nebula in each
  system's colours and three depths of stars drifting past at their own pace (streaking at cruise).

### Built in the polish pass (items 4 to 6): true scale, black space, every view

What Phase 6 built above still holds but for these (`docs/polish-pass.md` items 4 to 6 has the list).

- **Scale** (`galaxy/galaxy.ts`): the galaxy keeps its shape, its names and its recipes; its bodies are
  multiplied out to their true size and their orbits twelve times as far apart (`ORBIT`). A ship is 34 to
  48 px long; a barren moon 600 to 1,300 px in radius; a world 1,900 to 3,400; a gas giant 5,200 to
  8,800; a sun 6,300 to 13,500; a black hole 2,000 to 2,600; gates 132,000 px from the middle, the
  core's sun 26,400 out round its black hole; a system about 280,000 px across. Why so: a world's
  ground, flown round, is 2,048 px, so its honest radius is 326 px; at that size a world beside a ship
  is a hill, not a planet. Six to ten times it, the world is a horizon from the plane and a disc
  from far out, yet a cruise from one to the next is still seconds (the drive's pace goes with the
  emptiness, below), and the way down (section 6) carries the scale from the globe's to the ground's.
- **Height:** worlds and moons lie below the plane ships fly in, their tops 0.4 of their radius
  under it (`BELOW`), so a ship flies over a world and goes down to it; suns, gas giants and black
  holes have their middles in the plane, and stations, gates, belts and derelicts are in it. A
  station orbits over its world, 0.7 of the world's radius from its middle.
- **The cruise drive** has its own action (C, R1 / RB, the Cruise button): View changes the view in
  space as it does over a world. Spooled up, each second it covers 0.9 of the distance to the nearest
  body or structure (not counting belts), from 8 times the ship's speed up to 640 times (`CRUISE`):
  in open space it is very fast, and it slows of itself as anything nears, so a body grows from a
  point of light to a disc to more than the view. Among a belt's rocks it is held to 4 times, and
  a knock against a rock does not drop it.
- **Journeys** (flown by a scratch script): a world to another in a system is 12 to 16 s on the
  drive, 16 to 21 where the course goes round the sun (it was about 17). From
  the pad of the Nomarchy's capital to arriving low over the next world, 45.6 s (it was 27): 15 s up
  (5 climbing to 160 px, 10 through the air), 18 on the drive, 12 down. Pad to the capital's gate,
  round the sun, 37 s. Any two bodies of a system are still under 40 s apart on the drive.
- **A course goes round** a sun, a gas giant or a black hole across it (`ROUND` in `data/space.ts`,
  `courseAim` in `sim/space.ts`, `Scene.zone.aim`): the HUD's arrow points beside it, clear of its heat
  and of any pull that would stop the drive, and says ROUND and its name. At true size a sun's well is
  tens of thousands of px across, too wide to fly out of at a ship's own speed once the drive drops.
- **Black space:** the nebulae and the three drifting depths of stars are gone. Space is black, with
  1,100 distant stars as fixed directions (most faint, a few bright, a very few with a cross), the
  sun, and the bodies, each lit from the sun with a day side and a night side. Overhead two depths of
  the stars drift past at a hundredth of the ship's speed and streak when cruising; from behind and
  the seat a little dust streams past when cruising.
- **The bodies** (`render/globe.ts`, `render/bodies.ts`, `render/slabs.ts`): worlds and moons are
  globes wrapped in their maps (now the whole of their ground, `space/maps.ts`), gas giants bands by
  latitude bent by eddies large and small (smooth however close), suns granular with great
  prominences, black holes' discs streaming. Stations, gates, derelicts, rocks and shards are stacks
  of slices drawn through any view, as ships are. Stations have four gun turrets (an outpost three),
  drawn by the image model, riding round with them and firing as a base's turrets do.
- **Others seen going:** a pilot jumping a gate leaves a flash in it and one coming through makes
  one; one going down is seen sinking under the plane, burning; one coming up out of a world rises
  through the plane with a streak of light (`Space.flashes`, `sim/space.ts` `shipLeft` and `shipCame`).

### Danger (the polish pass)

Where the danger is follows from the lanes and who holds what (`galaxy/danger.ts`; section 8, "Built in
the polish pass"): home systems are safe from the computer's ships, the frontier next to a side's space
is low, deeper out medium, the front line and the other side's space at least medium, the core high. The
galaxy map shows each system's danger for the pilot's side as chevrons by its name (a green square for
safe) and rings the front line red; the system map marks with a red skull each place raiders wait; the
cards say the danger and who lives there; the HUD says it on arriving (DANGER MEDIUM · THE FRONT).

## 5. Planets

### The recipe

Each world has a recipe derived from its seed. The recipe changes how the planet plays, not
only how it looks.

| Dial        | Affects                                               |
| ----------- | ----------------------------------------------------- |
| Archetype   | Terrain shape and material palette                    |
| Land share  | How much is solid ground (already a setting)          |
| Relief      | How tall and steep the terrain is                     |
| Gravity     | Climb rate, turn rate, how fast a pilot on foot moves |
| Atmosphere  | Top speed, flight ceiling, whether clouds exist       |
| Cloud cover | Hiding places (already a setting)                     |
| Weather     | Storms, fog, dust: visibility and handling            |
| Sun and day | Light colour and time of day (already a setting)      |
| Hazards     | Lava, lightning, acid sea: damage zones               |
| Resources   | Which ores appear and how rich they are               |

Several of these map directly onto settings the engine already has: agility, ceiling,
clearance, clouds, land share and time of day.

### Archetypes

Eight archetypes for the 40 habitable worlds, five of each, plus one for barren moons.

| Archetype   | Terrain                              | How it fights                               |
| ----------- | ------------------------------------ | ------------------------------------------- |
| Archipelago | Islands and open sea (exists today)  | Open, balanced, nowhere to hide but cloud   |
| Continental | Big landmasses, long mountain ranges | Ridge lines to break line of sight          |
| Canyon      | Desert cut by deep, narrow canyons   | Low-level chases, ambushes from above       |
| Ice         | Glaciers, fjords, frozen sea         | High cloud, whiteouts, long sight lines     |
| Volcanic    | Black rock, lava rivers, ash         | Lava damages on foot, low ceiling under ash |
| Jungle      | Dense forest, swamp, mesas           | Pilots on foot are very hard to spot        |
| Mesa        | Flat tablelands with sheer drops     | Natural landing pads, exposed bases         |
| Ocean       | Almost no land, a few tiny atolls    | Land is precious: fights over the only pads |
| Barren moon | Craters, ridges, no sea, no clouds   | Low gravity, no cover at all, black sky     |

Each archetype is a terrain-shaping function plus a material table. The existing generator
becomes the Archipelago archetype unchanged.

### Surface features

Static things are stamped into the height map and material map, so the existing renderer
draws them with no new drawing code.

- **Landing pads:** flat, marked ground where ships can set down.
- **Bases:** a pad, a few buildings, a flag mast, defence turrets. One capture site per
  habitable world to start with.
- **Ore outcrops:** visible coloured rock, mined from the air or on foot.
- **Veins:** richer deposits in places a ship cannot reach, mined on foot.
- **Ruins and wreck sites:** salvage, sometimes guarded by drones.

### Built in Phase 3

- **The galaxy** (`src/lib/engine/galaxy/`): `galaxy(seed, version)` makes the whole of section
  4 from seed 1116, version 1, with exact arithmetic only, and every player makes the same one.
  The systems keep a fixed shape so the map always has a front: the Nomarchy's home at the left,
  the Anarchoi's at the right, the core between, four frontier systems a side and one more beside
  the core. Each home is reached by two lanes; a few more lanes come by chance, and one
  black-hole shortcut joins two frontier systems far apart (18 lanes, 34 gates). Suns: gold for
  the Nomarchy, a red dwarf for the Anarchoi, a blue giant round the core's black hole, the frontier
  dealt out, one binary. 40 habitable worlds (4 a home, 2 at the core, 3 or 4 a frontier
  system, five of each kind, never two of a kind in a system; each home's first is its capital
  world: the Nomarchy's is the island world, the Anarchoi's a canyon), 28 barren moons, 14 giants
  (now and then a habitable world is a giant's moon), 8 belts, 14 bases (two capitals, nine
  outposts, three derelicts), with orbits. Names: the Nomarchy's voice (Saint Veselade,
  Coreline Major) and the Anarchoi's (Lastjaw, Rustheap) at home, a plain one elsewhere.
- **Recipes** (`recipe.ts`): each archetype's dials are ranges its seed picks from (a moon: no
  air, gravity 0.16 to 0.35; volcanic: heavy, thick air, ash). Gravity and air become the
  settings flying already had: climb ×2/(1+g); turn a little wider when heavy and in thin
  air; top speed up to a fifth faster in thin air (1.2 with none); ceiling 1500 px scaled by
  air (900 on a moon, 260 to 330 under ash). The island world flies exactly as before.
- **Archetypes** (`src/lib/engine/world/archetypes/`): one shaping function each, three
  palettes each, from the mockups in `art/mockups/world-*.png`. Archipelago is the old
  generator, unchanged bit for bit. Continental: big landmasses, ranges with snow, rivers,
  forests. Canyon: a high desert cut by winding canyons, walls stepped and banded in strata, a
  river at the bottom. Ice: terraced snow and rock, glaciers, fjords, a sea of cracked floes.
  Volcanic: black basalt split by glowing cracks, a lava sea crusted into plates with glowing
  seams, lava rivers in valleys, cones with craters and flows, sulfur vents. Jungle: a canopy
  of three kinds of tree, swamps (some of acid), rock towers hung with vines. Mesa: many
  two-tier tablelands with sheer banded cliffs on rubble skirts, buttes and spires, dry
  riverbeds, oases. Ocean: almost all sea, a few atolls with lagoons. Barren moon: maria,
  craters with hard shadows from a low sun, rays. The renderer gained banded cliffs (strata by
  height), materials that glow at night, other seas (lava, ice, acid, none) and stars by day.
- **Weather and hazards** (`sim/hazards.ts`, `render/weather.ts`): wind, gusting in storms;
  lightning near the player that hurts what it strikes; lava and acid seas that burn a ship
  below 30 or 16 px (computer pilots keep above them); whiteouts every half minute or so in
  snow; ash thickening towards its low ceiling. Seeing: the ground and sky haze over with
  distance in dithered steps, and far ships fade into it; rain, snow, dust and ash with embers
  fall over the picture. The HUD's arrows and radar still show ships hidden in it.
- **Choosing a world:** the `world` setting (and `?world=w12`); the menu describes the world and
  lists every other to travel to until space flight replaces it; the choice is saved. Everyone
  starts at the island world, so new pilots meet. Each world is a room
  (`galaxy<version>-<id>`). Travelling builds the world in a worker and hands it to the scene,
  which arrives at once: no frame is held up. The HUD names a world on arrival.
- **The gallery** (`/gallery`): every world from above, drawn by the game's renderer in a worker,
  with a map of the whole of it and its recipe, by kind or by system.

### Built in Phase 4

- **Features** (`world/features.ts`), stamped into the height and material maps after the
  archetype, from the world's seed with exact arithmetic (the scan for inexact arithmetic covers
  the file). Bases: a pad (concrete with seams, hazard-striped edge, corner lights that glow at
  night), buildings and turrets from the image model's prefabs, a flag mast, a levelled site of
  packed earth with a ragged edge and tyre tracks, the ground sloping back to the land round it,
  and their shadows baked in for the world's sun. Every habitable world has two bases: a home
  world one of its side's (on the capital world the capital: two pads, a command building, four
  turrets) and a neutral outpost; elsewhere two outposts; a barren moon one outpost (nobody's,
  even in a home system). The first base is near where ships arrive, the second 700 to 1450 px
  from it; on an ocean world they stand on platforms in the shallows. Ore: 22 outcrops a world
  (30 on a moon, 10 on an ocean, as reefs in the lagoons), each a heap of rubble with a cluster of
  crystals of one of the recipe's ores (chosen by its richness), at least 300 px from any base;
  three rich deposits (a cratered ring of five clusters of the world's dearest ore, 80 units):
  two half-way between the bases, one near where ships arrive; three wrecks (salvage). The
  features' materials are added after the archetype's own (32 to 79; `NMAT` is 80), their plain
  ground tinted towards the world's commonest ground colour.
- **The art** (section 7, "Art pipeline"): `tools/gen/features.py` draws each building, the
  turret, each ore and a wreck from above with the image model, following a grey plan of its
  shape; `tools/voxel/prefabs.py` cuts it out, shrinks it to game pixels, gives each pixel a
  material by its colour and brightness and a height, and writes `world/prefabs.ts`. The look
  follows `art/mockups/base*.png`, `ore*.png`, `crate.png`; `docs/art/gen/base-nomarchy-command.png`
  and `mining-in-progress.png` are the game's own pictures of them.
- **Outcrops come back**: each holds its stock (30, a rich deposit 80, a wreck 16) for a period
  of its own (8 to 15 minutes, from its place), on the shared UTC clock (`Scene.setClock`); mined
  out, its crystals go (the tallest last) and it is whole again when its next period begins.
- Building a world takes 20 to 90 ms more than before (archipelago 142 ms, volcanic 463).

### Worlds made large (2026-11-18)

James: "I thought the worlds were massive procedurally generated things?" A world was one map of 2048 px that wrapped: a
lap in twenty seconds, two bases, and nowhere else to go. It is 16,384 px round now, GRID × GRID (8 × 8) regions each the
size the whole world was (`engine/world/lands.ts`): a lap at a ship's own speed takes three minutes.

- **The scene's ground is a window.** `World.height` and `World.mat` stay 2048 px square, and every reader of the ground
  still reads them with its place masked to that; they hold the ground within a thousand px of the pilot. As he flies, the
  chunks (256 px) that come within reach are written in over those that fell behind (`bringWindow`, a chunk a step;
  `sim/planet.ts keepWindow`; all at once on arriving from space). `World.size` is how far round the world is (the island
  world of the settings: 2048, all of it in the window), and distances go the short way round by it
  (`sim/loop.ts wrapDelta`, `setRound`: set as a scene is stepped, drawn or asked anything).
- **A region** is a whole map made by the world's own recipe. The region the bases stand in is the world as it always
  was, its features stamped, every place where it was (the regions' edges are laid so its bases stand in the middle of
  it: `Lands.ox`, `oy`). Every other region is one of seven more maps of the recipe from other seeds
  (`buildLand`), each used several times, shifted a different way each time.
- **Where two regions meet** (a map wraps onto itself, not onto its neighbours) the ground of the one goes over to the
  other's (`groundOf`): across a band `FEATHER` px either side of the line they meet at, their heights are laid over
  each other by how near each is, the land is that of the nearer (its edge ragged), and where land of one comes down to
  sea of the other there is a shore. The band is narrow, so either side of it the ground is a map's own: a mesa keeps
  its cliff. The line itself wanders (`bendAt`: which region a place is in is asked at the place moved by two swells of
  smooth noise, 230 px over 1,024 and 110 over 512) and is frayed (`FRAY`, 30 px over 64). The home region's own edge
  wanders too, but outwards only (`HOME_OUT`: a pull in towards it, the same either side of its edge): within it its
  ground is as it was built, and beyond it its map runs on (it wraps). A chunk is written a square of 16 px at a time:
  whole from one map where no join passes through it (`fill`).

  (At first the ground gave way between regions: to a strait of sea, or on a dry world to its plain, along edges that
  were straight but for 46 px of wander. From the ground it read as provinces; from space every world was ruled into
  sixty-four squares. James, 2026-11-18: "fix the horrible grid thing". Picture `docs/art/gen/regions-joined.png`.)

- **Built ahead.** The maps of the ground further on are asked for as the pilot nears them (`Scene.zone.lands`), built
  by the page's worker (`lib/worlds/build.ts buildLandOffThread`) and handed in (`Scene.giveLand`); ground far off waits
  for its map, and only ground he is nearly at is built where it is wanted (`landsFromOutside`). In Node they are built
  as wanted. A map is 8 MB; eight are kept.
- **From space** a world's map is its whole ground, sixteen world px to a texel (`space/maps.ts mapOfWorld`), and the
  world's honest radius (2,608 px) is about the size its globe is drawn: the way down no longer blows its ground up.
- Creatures live all over it (`sim/creatures.ts`); the home region's keep the places they had.

**Places out over the world** (`world/places.ts`, the same day; James: "always seeing the same settlements and not
interesting new locations"). Five kinds, nobody's, each with a name of its own: a settlement (a dome, cabins and a
greenhouse on packed ground), ruins (old walls on rubble), a ring of standing stones, a relay's dish on its deck, a
mine's works (a rig, and a base's tanks). Where they are comes from the world's seed alone, five spots to a region
(`spotOf`); one is laid into the ground when its ground is all in the scene's hold (`settlePlaces`, from `keepWindow`),
if the ground will take it (land, level enough, clear of a base and of ore; refused spots are not tried again:
`Lands.noPlace`), and laid again whenever that ground is written in afresh. `World.features.places` lists those in the
hold now; the HUD names each from 700 px off. Their pictures are the image model's: `tools/gen/places.py` (plans and
prompts, the bases' own style) → `art/places/source` → `tools/voxel/places.py` (one palette of fourteen colours for them
all, a height by what each pixel is) → `world/placeart.ts` (generated); their materials are 80 to 93 (`PLACE_MAT`; `NMAT`
96). Picture `docs/art/gen/places.png`.

Left: nothing to do at a place yet (no trade, nobody there, no pad); no ore, wrecks, veins or raiders in the regions
beyond the home one; places are not marked on the radar or the globe; beyond a thousand px the ground drawn is the
window's again (in the haze); the far regions' ground is from seven maps, so a landform comes round again.

### Skies (James's first play, 2026-11-18)

James: "on most planets the clouds sit way too low in the atmosphere, and we need more clouds higher up". The heap
clouds had floated at 40 px, under a ship's cruising height of 64, drawn in the ground's own march; every sky was that
one layer. Now (`world/sky.ts` what a world's sky is, `render/clouds.ts` drawing it, `render/skyart.ts` the sheets'
patterns, numbers in `data/skies.ts`; built towards `art/mockups/skies.png`):

- **The heap clouds** (cumulus, the world's own cloud map, unchanged: terrain fingerprints are the same) float at 160 to
  380 px by kind (lower in thick air, higher in thin: jungle 160, canyon and mesa 290 to 380), a ship well under them at
  its cruising height. Their thickness is steps of 3 px (4 under rain and ash, 4 in a storm, with lower undersides),
  their tops heaped in clumps, never flat roofs; a storm's, rain's and ash's are darkened towards a storm grey (`GLOOM`);
  undersides take a third of the sky's colour so far off they read as cloud. Their shadows fall from their height
  where the sun throws them, as ships' do.
- **Thin sheets over them**, by the world's kind and weather and its own chance numbers (apart from the terrain's): a
  mackerel sky (rows of round cloudlets, 260 to 380 px over the heaps), cirrus (streaks drawn out by the wind, 520 to
  760 px over), a grey veil (rain, a storm, snow, ash: an overcast under the ceiling). Each has its cover, the way it
  lies and its own wind. Of the 40 habitable worlds some are clear (canyons with cirrus alone), some layered, some
  overcast, storms towering. Their tones: white high ice by day, gold over rose at sunset, cool by moonlight.
- **Drawn in every view.** From behind and from the seat, and overhead whenever the camera is above them, they are
  things in the world, depth-tested against the ground and the ships: the heaps marched front to back (flat undersides,
  sides, lit tops), the sheets as planes read a row at a time, hazed into the distance in dithered steps, far off read
  from smaller copies of their patterns so they never sparkle. Overhead, what is above the ship is a veil over the
  picture (at most a little over half its pixels, every dither fixed to the cloud), sliding faster than the ground the
  higher it is (`VEIL.parallax`); a veil's overcast is left to the weather's murk there. On foot and landed only the
  shadows show. The chase camera keeps out of the heaps (`camera.ts`). Lightning falls from their undersides.
- Tools: `npx jiti tools/sky-sheet.ts <out> <view> <world…>` climbs through a world's skies; the flight `climbing
through layered clouds`; `docs/art/gen/skies-before-after.png`.

### Daily hotspots

Each day (UTC), a few worlds are marked as hotspots with far richer ore. The choice is derived
from the galaxy seed and the date, so every player computes the same list with no server.
Hotspots pull scattered players to the same places, which is what makes fights happen.

Built in Phase 7 (`galaxy/daily.ts`, numbers in `data/territory.ts`): three hotspots a UTC day, from
the galaxy's seed and the day's number, never two in one system and never in a home system (the
frontier and the core only). On a hotspot every outcrop holds 2.5 times its stock and the laser cuts
1.4 times as fast (`sim/traces.ts stockOf`, `paceHere`; a scene must have been told the time). They
are marked on both maps with an orange star, said on arriving (HOTSPOT: RICH ORE TODAY), listed on
the faction board, and one of each day's tasks is to mine at one. Since the polish pass a hotspot draws
pirates: every rich deposit there has a raider band, one stronger than its system's.

## 6. Modes of play

One scene runs in one **zone** at a time. A zone is a place with its own backdrop and rules.
Ships, shots, particles and other players work the same in all of them.

| Zone     | Backdrop                              | You control   | Views                    |
| -------- | ------------------------------------- | ------------- | ------------------------ |
| Surface  | Planet height map and clouds (exists) | Ship or pilot | Overhead, chase, cockpit |
| Space    | Stars, bodies, stations               | Ship          | Overhead only at first   |
| Interior | Rooms made of tiles                   | Pilot         | Overhead                 |

### Transitions

- **Space to surface:** fly over a world and hold Descend. A flight down through its air,
  steered all the way, and you come out low over the place you flew to.
- **Surface to space:** climb past the ceiling and keep climbing, or hold Use.
- **Flying to on foot:** land on a pad or flat ground and get out, or eject.
- **On foot to flying:** walk to your ship and board, or call a replacement.
- **Space to interior:** dock at a station.
- **System to system:** charge inside a jump gate, or thread a black hole's ring.

Built in Phase 6 (`sim/zone.ts`, `sim/travel.ts`): the zone interface, with the surface and
space as zones; and every transition but the station deck's.

- **Surface to space:** over a world of the galaxy, a pilot of a side holds Use from 160 px up
  (HOLD [F] SPACE: the way on a touch screen and overhead), or keeps climbing at the ceiling, for
  half a second: the ship rockets up (faster and faster: the ground shrinks and hazes away) and
  the frame fades to black; 1.8 s later it is in space over that world, a little out from its
  middle, as it was heading.
- **Space to surface:** over a world or moon in space, Use held (HOLD [F] DESCEND …): 2.2 s of
  entry fire closing in on the ship, a fade into the world's sky, and the ship is flying at 62%
  of the world's ceiling over the spot it dived into. The page builds the world in its worker as
  soon as the ship is over it.
- **System to system:** inside a gate, Use held (HOLD [F] JUMP TO …): the gate's field holds the
  ship in its middle, slowing it, nose along the lane, and charges for 3 s (let go and it stops);
  a white flash, and the ship comes out 150 px from the gate at the far end, heading in. In a
  black hole's bright ring, Use held for 0.55 s while the hole drags at the ship: the ring takes
  it, and it is flung out of the linked black hole, far across the galaxy, clear of its pull.
- **Docking:** Use held near a friendly station eases the ship along a smooth path to the end of
  the nearest arm, nose in (1 to 1.4 s); docked, it rides round with the station; Use held again
  backs it out and turns it away.
- After any arrival Use must be let go before it acts again. Each transition leaves everything of
  the last zone behind, as arriving at a world always did; the hold comes along.

Rebuilt in the polish pass (item 4): the way down and the way up are one flight through the air
(`sim/air.ts`, `render/air.ts`, numbers in `data/space.ts` `AIR`), with no cut and no fade.

- **The way down:** over a world or moon in space, a dive at it (or Use held, which puts the nose
  down). There is no passage begun: the world's air is flown through at the pilot's own pace, down
  to the top of its sky (see "No transition", below). On the way
  the globe turns to bring the place under the ship beneath it and the ship sinks towards it; its
  curve flattens and the horizon rises; its map is drawn ever finer round that place (each world px
  of it fewer px of space, so the ground rushes by faster), the sky thickens from black to the
  world's colour as the stars go, the air burns (a glow before the ship, flames streaming back, the
  frame's edges afire, the picture shaking, a roar), the light turns to fall as it does on the ground
  there, and low down the world's own ground takes over, then the ground itself with its relief, at
  the same place and scale, 260 px over it. A barren moon has no air: no sky, no fire, black above.
- **The way up:** Use held from 160 px up (or the climb held at the ceiling): the same flight the
  other way, about 10 s, from wherever the ship is to the plane over that place of the globe.
- **The zone** changes half way (0.55 of the way going down, 0.45 going up), and the page's room
  with it; the scene keeps its camera across the change. Others see it (section 4, "Others seen
  going"); `net/session.spec.ts` has a pilot go down among others in a room in memory.

### The way up and down made one, the whole world on its globe, day and night (2026-11-18)

James, after playing: "I need cleaner more logical transitions from planet to space", and of space, "what are all these
floating things", "why some planets have visible seams", "why do planets not orbit properly or have day night cycles",
"why when I hit a planet am I always seeing the same settlements". Filmed a frame at a time (`npx jiti tools/way-film.ts`;
before and after in `docs/art/gen/way-*.png`), the way had these faults, each now mended:

- **The ground itself took over low down** (at the height the way came out at), where it looks nothing like the flat map
  the air makes of it: two pictures laid over each other for more than a second. It takes over **at the world's
  ceiling** now (`AIR.ground` 0.72 of the way, `Travel.high`), where a flat map and the ground are the same picture: the
  air's ground is drawn there at the ground's own place and size (overhead, the place under the ship lies down the frame
  from it by its height, as the ground is drawn: `render/air.ts drawAirTop`), in the ground's own colours and haze
  (`Globe.ground`: `haze`, `fog`, `far`), with its own clouds where they have drifted to and their shadows. From the
  ceiling down it is a true descent through the world's own sky (or the climb to it; begun at the ceiling, that part is
  passed at once).
- **A world at noon was a black globe.** A world was lit from wherever its sun stood, level with the plane; the place
  under the ship was as often in the dark as not. See day and night, below.
- **Going up, the ground grew larger** before it shrank: from overhead a world was drawn 245 px in radius, larger than
  the frame and larger than its ground looks from its own ceiling. It is 104 now (`OVERHEAD`): a whole ball under the
  ship, and the way up one steady drawing back.
- **Fire going up**: none now (`fireOf`).
- **The ship came out over another place.** On the way a ship makes little way over the ground (`AirShape.pace`), so it
  comes out into space over the place it left and down where it dived.
- **From behind, a world under the ship could not be seen**: the camera looks down more over one (0.66), and on the way up
  (1.25), and a fast climb no longer leaves the camera behind (`camera.ts ALT_LAG`).

**The globe is the whole world.** A world's ground is a square that wraps the same distance both ways, which is exactly
a Mercator map of a sphere from 85° south to 85° north (`space/maps.ts`, `SphereMap.merc`; `sim/air.ts latOf`, `rowOf`):
laid round the globe so, every shape keeps its shape and the whole ground is there, its equator the row midway between
its bases (`world/world.ts equatorOf`). It had been the top half of the ground by latitude: half of every world could not
be seen or come down to, and a ship that climbed out over a base in that half came down over another place. Its clouds
are the ground's own (they were read at twice their size, elsewhere).

**Day and night** (`sim/daylight.ts`). A world turns once in 27 to 57 minutes (`spinOf`), its own frame turned so its sun
is always on one side (`sunTurn`, `worldTurn`), lit from that side and a good way over it (`SUN`): most of the side a ship
flies over is in day, its far edge in dusk and night, and its ground turns through it. On the ground the light is what the
globe shows where the pilot is (`sunHeight`: day 52 % of the turn, dusk and dawn 15 %, night 33 %); the ground's colours go
over from one time of day to the next in 24 s (`stepDaylight`), the rest (sky, ships, windows) half way. The recipe's time
of day now only says how the world's baked shadows fall. The island world of the settings keeps its setting.

**Orbits.** `ORBIT_SLOW` is 4 (it was 120, and nothing was ever seen to move): a moon goes round its world in an hour and
a half to three and a half, an inner world round its sun in about eleven. A station creeps round what it hangs over as
before (`galaxy.ts STATION_SLOW`: at the bodies' pace it outran a ship). Wire protocol 9.

**Far-off bodies** are small worlds in their own colours by their kind (`render/space.ts FAR_COLOURS`; they were one pale
blob each) with their names under them from behind and from the seat (`render/spacehud.ts`). **A gas giant's seam** was a
hair line in its picture, read as a band: taken out (`space/maps.ts giantMap`).

Left: new kinds of places on a world (it still has two bases; the art must come from the image model), places marked on
the globe, a base that has turned to the far side cannot be gone down to until it comes round (land near and fly).

### Surface flight

What exists today, plus weapons, damage, landing and other ships. Landing is vertical: hold
Land over flat ground and the ship settles. A parked ship stays in the world. Enemies can
destroy it, and an enemy pilot on foot can climb in and steal it.

The sky is tall: the ceiling is 1500 px above the sea (it was 300 until James, playing Phase 1,
kept wanting to go higher). Keys, a stick, and the pointer behind the ship or in the cockpit
all set how fast it climbs or dives, so level holds the height. Overhead, from 300 px up, the
ground and clouds are drawn smaller and hazier the higher the camera is (`LIFT_FROM` and
`LIFT_HALF` in `render/view.ts`), so height shows; below 300 the picture is as it was. The
cockpit's altimeter reads to the ceiling on a square-root scale. Computer pilots fly up to the
ceiling too, and follow a target there.

Built in Phase 4 (`sim/landing.ts`): hold Land (the use action, now also a held control) within
150 px of the ground over a pad, or over ground level to 3 px under the hull (not sea, a
building or ore), and the ship brakes along a smooth path to the spot (onto a pad's middle) in
0.55 to 2 s, sinks, and settles with a thump and a ring of dust; let go before it is down and it
flies on. Landed, the engines idle and it can be shot. Held again for a quarter of a second, it
lifts off 24 px in 1.1 s and gathers speed. Land must be let go between a landing and a take-off.
Dust is the world's packed earth, paled. A pilot with a side begins landed at his side's base
(or the nearest neutral one), and arrives at another world the same way.

Stealing, as a starting rule to tune:

- The thief flies the stolen ship, with whatever cargo was in it, until it is destroyed or
  they leave it.
- The owner still owns the hull and can have it redelivered as if it had been destroyed.
- Landing a stolen ship at a friendly base pays the thief a reward.

Built in Phase 5 (`sim/foot.ts` stealGranted, yieldShip; the network's `steal`, `stolen`): a pilot
on foot by an enemy's parked ship presses Use and climbs up; the owner's game gives it up only if
it still stands empty, with its hold. The thief then flies it in its owner's hull and paint, with
its cargo; he can get out and back in as with his own, and it is his until it is lost (he ejects;
his next ship is his own, free), stolen back, or landed at a friendly base, where its cargo is
banked, he is paid its hull's points in credits, and his own ship stands there for him instead.
The owner sees SHIP STOLEN, loses its cargo, and can call another (for its fee). The thief's own
ship, if it stood parked somewhere, is gone too (it comes free when he next calls one).

### On foot

Top-down, on the same height map, with the camera pulled in.

- The pilot is a tiny sprite, a few pixels tall, in the world's own pixel grid. Zooming is
  done by making art pixels larger on screen, never by scaling sprites, so all pixels stay
  the same size.
- Terraces can be climbed one step at a time. Cliffs block. Shallow water is slow, deep water
  is impassable. Forest hides you.
- Actions: mine, pick up, plant a flag or beacon, board a ship, fire a sidearm, signal with a
  flare.
- You are slow and fragile. A strafing jet is a real threat. That contrast is the point.

Built in Phase 5 (`sim/foot.ts`, numbers in `data/foot.ts`), in the loop only (a pilot with a side
over a world with bases; elsewhere the old pick-up plays):

- **The camera, smooth (James's first play, 2026-11-18: "almost scan lines").** Out of his ship the overhead camera comes
  round to the nearest quarter turn (`FOOT.squareUp`) and moves by whole art pixels at a whole pixel from him
  (`camera.ts updateView`): it had kept the turn it had on landing, and the ground, resampled at a slant every frame,
  flickered as he walked. The page makes an art pixel a whole number of the screen's own pixels at any pixel ratio
  (`display/screen.ts`; at 1.25 it had been 7.5 device px, rows alternating 7 and 8). `tools/foot-smooth.mjs`,
  `docs/art/gen/on-foot-smooth.png`.
- **The camera.** On foot the scene asks the page for art pixels twice the size (`Scene.zoom`);
  the page steps there a CSS pixel at a time (`display/screen.ts`), so a laptop's 3 px pixels
  become 6 and a phone's 2 become 4. Overhead only, not turning with him (`rig.topYaw` held),
  leading a little the way he walks, with the clouds' tops hidden (only their shadows: the camera
  is down under them). Big words of the HUD are single size on the small frame.
- **The pilot** is his race's sprite (section 9) at its true size, 8 to 14 px tall, eight facings
  on the screen (five drawn, three turned round), four steps a stride (one a 5.5 px of ground),
  a shadow under him; drawn behind any hill or tree in front of him.
- **Rebuilt in the polish pass (item 1): the pilot his true size beside his ship.** At 10 to 16 px he
  was a third of a 34 px light fighter's length. Out on a world he is now drawn from a sprite half the
  size (`RACE_ART[race].small`: drawn by the image model on plans half the size, `tools/gen/races.py`
  `SMALL`), 6 to 9 px tall with his outline (the Solari 7, 5 of it body): a fifth to a seventh of a light
  fighter's length (Dart 34 px: 1:4.9 with the outline, 1:6.8 the body; Corsair 40: 1:5.7 and 1:8).
  Each race keeps its outline (the white helmet, the crest, the tall robot, the wide shell, the antennae,
  the cap), its facing and its walk. The camera pulls in as far as it did (`FOOT.zoom` 2; 2.5 was tried: he
  read larger, but the HUD covered a phone's frame; the page's zoom may now be a fraction, the art pixel is
  always whole), so beside the same ship he is half the height: one pixel size still. He walks 24 px a second (runs
  38; was 30 and 46), a step 4 px, his middle 3 px up (radius 2.6). Inside (the hangar, the deck, a ship's
  rooms) the rooms are drawn larger and so is he, from his full sprite (`INSIDE.zoom` 1.5), so he is about
  the same size on the screen in either (14 and 18 px of the page's art pixels). Wire protocol 7 (his middle means another height).
- **Moving.** The keys and sticks move him the way the screen shows (`Scene.foot.yaw`): walk 30
  px a second, run 46 (the thrusters' control), reaching speed fast (grip 16). A step up or down
  of 3 px (one terrace) is taken; more is a cliff, and buildings and crystals stop him too; he
  slides along what stops him. Under trees his feet are on the ground round the trunks (the world
  knows its tree materials: `World.trees`), and he is hidden: drawn faintly to himself, not at all
  to another beyond 34 px, and lost by raiders beyond that, until he fires. Shallow water (and surf)
  halves his speed and hides his legs; deep water, lava and acid stop him. A dive (Roll): 92 px a
  second for a third of a second, then a rest. Health 30, back at 2 a second after 6 s unhurt.
- **Out and in.** Landed, a tap of Use (released before the quarter second that lifts off)
  climbs out beside the ship; it stays parked, canopy open, a `PARKED` fighter anyone can shoot
  (its protection ends). Within reach of it Use climbs in (half a second), and the backpack goes
  into the hold as far as it fits. By another's parked ship Use steals it (section 6, stealing).
- **Actions.** The sidearm (Fire): 3.2 bolts a second at 240 px a second for 0.6 s, aimed where
  the pointer is (else where he faces), turned onto an enemy within 0.32 rad and 150 px (up at a
  low ship too); 9 to a pilot, 2.5 to a ship. A flare (secondary): three, one back each 30 s; it
  rises, hangs burning for 7 s. A beacon (View): one each, a step ahead of him, a post with a
  blinking lamp and a beam, his callsign over it, on the radar; a marker only. Use by a vein cuts
  it (held), by nothing else, with his ship lost, calls another (held half a second).
- **Veins** (`sim/veins.ts`): 22 a world, placed from its key with exact arithmetic where a ship
  could not set down (ground uneven within 10 px, or under trees), 200 px from bases; 24 units of
  mostly the world's dearest ore, cut at 1.6 a second into the backpack, back each period on the
  shared clock like outcrops. Drawn as the middle of the ore's own picture, over tree crowns.
- **The backpack**: 4 slots of 10. His own chunks of ore and crates he walks over go in.

### Creatures (built 2026-11-18, after James's first play)

James: "design and implement ground based mobs - monsters, aliens, animals etc to find and kill on foot while on
planets, dropping materials - rare and not rare, credits etc." The decisions, made here:

- **Eight kinds, each with a role, each its own design** (`data/creatures.ts`; the image model's, following plans of
  their outlines in game pixels, `tools/gen/creatures.py` → `tools/voxel/creatures.py` → `creatures/art.ts`; the look
  from `art/mockups/creatures.png`). Sizes are set beside the pilot (5 to 7 px tall out on a world): a critter smaller
  than him, the rest about twice him, the rare one three times.

  | Kind      | Role                                  | Health | Bite | Drops                                           |
  | --------- | ------------------------------------- | ------ | ---- | ----------------------------------------------- |
  | Skitter   | a critter: runs, quick                | 6      | none | chitin sometimes, a few credits                 |
  | Woolhorn  | a grazer in herds of 3 to 5: runs     | 34     | none | hide 2 to 3; a heartstone 3%                    |
  | Razorjaw  | a hunter: stalks, charges, bites      | 36     | 6    | hide, a gland 30%, credits; a heartstone 5%     |
  | Spitter   | keeps 50 to 95 px off, spits globs    | 28     | 5    | glands 1 to 2, chitin, credits                  |
  | Crawler   | a plated hunter, slow and hard        | 72     | 9    | chitin 2 to 3, silica, a gland; a heartstone 4% |
  | Reefclaw  | a shore crab: guards its patch, swims | 38     | 8    | chitin, salvage now and then, credits           |
  | Snapweed  | a rooted plant: snaps within 15 px    | 30     | 10   | bioresin, a gland                               |
  | Thornback | the rare one: grazes until riled      | 220    | 15   | always a heartstone, hide, chitin, 80 to 150 cr |

- **What lives where** (`FAUNA`): each archetype has its common life and its hunters (archipelago: woolhorns, skitters,
  reefclaws, razorjaws; continental: woolhorns, razorjaws, crawlers; canyon: skitters, spitters, razorjaws; ice:
  woolhorns, crawlers; volcanic: skitters, crawlers, spitters; jungle: snapweed, spitters, razorjaws; mesa: woolhorns,
  razorjaws, spitters; ocean: reefclaws). A barren moon has none. How much hunts follows the system's wildness
  (`galaxy/danger.ts wildness`, without territory, so every game agrees): a cell's chance of hunters 18% at home to 70%
  at the core, of the rare beast 2% to 10%.
- **Where, the same in every game** (`sim/creatures.ts placeWild`): the world is cut into cells of 256 px; each cell's
  two slots (common life, hunters) take their kind, their number and their home from the world's key and the cell
  alone (mulberry32, whole-number offsets), on dry ground (a reefclaw's on a shore) at least 170 px from any base. A
  group is put up when the pilot on foot comes within 300 px of its home and down once he is 420 px from all of it, so a
  world costs nothing until he walks among its life. Only with the `locals` setting (as the bands) and in the loop.
- **Behaviour.** Grazers and critters notice him (by distance: further when he runs or has just fired, only 34 px under
  trees) and run, the herd together. Hunters stalk closer, charge (turning only so fast: a dive to the side makes one
  miss), wind up a bite that lands if he is still in reach, back off, and come again, one of a group at a time (the
  others circle him 40 px off, waiting their turn); past 230 px from home they give up.
  A spitter keeps its distance and spits a glob in an arc that leads him a little (74 px a second): he can step out of
  its way, and a dive takes him under it. A reefclaw comes at him only on its patch. A snapweed waits. The thornback
  grazes and runs until shot or crowded, then charges hard and throws him back 14 px. A bite throws him back a little.
- **Being hit.** Any shot that does harm here strikes a creature in its path (the sidearm, a ship's guns; a launcher's
  rocket half as hard again): it flashes white, is knocked back by its weight and staggered (its charge stops a moment),
  drops of ichor fly the way the shot went in its kind's own colour (never red, a few drops, gone in two seconds), and a
  bar over it shows how hurt it is. The sidearm's aim turns onto a creature as onto an enemy, and its brackets are gold.
  Killed, it flashes, falls on its side and fades.
- **Drops.** Four new resources (`data/resources.ts`): hide 8 credits, chitin 11, venom gland 24, heartstone 110 (rare),
  and two of the old (silica, bioresin, salvage) where they fit. Thrown out where it fell, they lie 150 s (blinking the
  last 12) and go into the backpack when he walks over them (8 px); credits go to the wallet (a bounty, 'hunting'). A
  heartstone glints, a star turning over it and a ring of light on the ground. Every market pays a creature's parts at
  their standard price, as salvage (`galaxy/market.ts`): no world's ground holds them. Icons in `static/icons`, cut from
  the image model's sheet as the Phase 4 icons were.
- **Back again.** A creature killed is back at a turn of its group's own clock, at least 5 minutes later
  (`wildBack`, like a band's `backAt`). The kill is told to the room (`beast`, `{ t: 'beast', c, u }`): it is gone in the
  others' games too. Each game moves its own copy of a creature (they are not flown by the host, as bands are: a creature
  is near one pilot at a time, and the wire would carry many more things for little); the drops are the killer's.
- **Sound** (no voices of their own yet): a creature coming for him is the ambush's sting, quietly, at most one a second;
  its bite a hit; a glob the mine's plop; a kill the kill's; a find the scoop's, the till's for credits and a heartstone.
- **Left out:** creatures' own voices; creatures shared in a room (only kills are told); creatures noticing other pilots
  on foot or a parked ship; a use for the parts beyond selling them (a part's price could ask for them later).

### Space flight

The same arcade handling as in atmosphere: the ship always moves forward and you steer it.
There is no altitude in space at first. Gravity wells pull toward giants, suns and black
holes.

Built in Phase 6 as planned (section 4, "Built in Phase 6"): the flight is the surface's own
(`flyLeader`), held level; the computer's pilots fly level too. Not yet: altitude, gravity on the
computer's ships (they ignore wells), and raiders that steer round rocks.

Built in the polish pass (item 6): all three views in space, View changing them as over a world.
From behind and from the seat space is drawn in perspective (`render/globe.ts`, `render/space.ts`):
each pixel's ray from the camera meets the spheres (worlds and moons in their maps, gas giants in
their bands, suns, black holes bending what is behind them); the place on a globe's map is worked
out exactly every eight pixels of a row and carried between; bodies are drawn near to far and a far
one only where nothing nearer covers it; ships hide behind bodies. Skimming a giant from behind or
the seat, every way is cloud. Overhead, a world or moon below the plane is drawn smaller than it is
(a world's disc 490 px across, a moon's 380: `OVERHEAD`) and drifts past slowly, as the ground does
from high up; a change of view dissolves from one picture to the other. Over a world the camera
looks down at it a little; on the way down, more. Cruising, gates, black holes, docking, mining and
skimming work in every view.

### Flown free in space (2026-11-18)

James: "in cockpit view or other, I cannot pitch up and down in space enough to even do a full 360 rotation … you have to
massively improve the flight model". Space had the surface's model in a band of 268 px: a climb was a rate of climb, the
nose only tilted, and the camera could only lean. Now (`sim/spaceflight.ts flySpace`, numbers `data/space.ts FLIGHT3D`):

- **The ship goes the way its nose points.** A turn is about the plane's up; a pitch is about its own wing. It flies up
  out of the plane and down under it, in a band 900 px either way (`SPACE_DEEP`, `SPACE_TOP`); the computer's ships follow
  it there (`pilots.ts`). How the keys and the pointer pitch it, and what it does let go, were made again the same day:
  "Nothing moves the ship but its pilot", below. The cruise drive holds the plane. Docking, a gate's hold and the pilot
  out of his seat bring it level (`levelOut`).
- **The camera looks where the ship points** (`render/view.ts View.pitch`; `sim/camera.ts`: from the seat exactly the
  ship's attitude, from behind the rig's own forward and up, which follow the ship's a beat late, `rig.camF`, `camU`,
  `free`; the yaw, pitch and roll of that pose by `poseOf`). Everything is turned by the camera's pitch about the view's
  point before it is laid on the frame: `project`, a ship's axes (`render/jet.ts`), a slice of a station or a rock
  (`render/slabs.ts`: each row still meets it along a line of one depth), the rays of the globes, the suns and the
  stars (`render/globe.ts Cam`: its forward and up may be pitched; `render/space.ts camOf`). Rolled, the picture turns
  about the row the ship sits on from behind, about the seat's own from the seat (`scene.pivotNow`).
- Shots go the way the nose points (`guns.ts noseOf`, on its back the other way from its heading).

Over a world's surface nothing changes: the ground's march cannot pitch, and the surface model flies a height.
Left: a roll of the pilot's own (the roll key is still the dodge), a yaw standing on the tail (a turn there is about the
plane's up), others seeing a pilot's pitch (the wire carries heading and height), the computer's ships flying loops.

### Nothing moves the ship but its pilot (2026-11-18)

James, after flying the free model near a world: "its crazy in space near planets I'm spinning around getting sucked down
its very horrible and disorienting", then "please rebuild that part from scratch - the exit and enter planets and
surrounding planets - I want no gravity or wonky pulling of my ship". Flown as a mouse pilot by a script (the pointer told
every step, at rest), the faults were five, each of them the game moving his ship or his view for him:

- **A mouse at rest looped the ship for ever.** The pointer's height was a rate of pitch, as it is a rate of climb over a
  world; there a ceiling and a floor bound it, in space nothing did. With the mouse in the middle of the screen the ship
  pitched 17° a second, on over the top, round and round. Now the pointer **aims** the nose (`sim/spaceflight.ts`,
  `FLIGHT3D aim, span, curve, dead, come`): how far it is above or below the middle of its steering is how far up or down
  the nose points, to 80°, and there it stays. The keys, a stick and the touch buttons still pitch it round for as long as
  they are held (1.3 radians a second: a loop in five seconds), since those are let go; let go, the ship comes level, and
  one on its back rolls upright first. Overhead a climb or a dive held leans the nose (`lean`) and no more. (2026-11-19,
  James: "with the mouse cursor pitching up and down, I cannot do a full 360 spin. I can do it with W and S though":
  pushed into a band at the frame's top or bottom, its outer tenth (`FLIGHT3D edge`), the pointer pitches the nose on
  round as the keys do, from `edgeRate` of their rate to all of it at the edge; resting anywhere else it still aims.
  `sim/spaceflight.spec.ts`. Later that day both went: the pointer is a stick, its distance from the middle a rate of
  pitch, with a ring on the HUD for the middle, as Elite's mouse is; section 16, "Controls".)
- **A ship with a still mouse flew itself.** Five seconds without the pointer moving, or a finger lifted, and the ship
  was taken for one with nobody at it: it weaved about and rolled, as the ship on show does. The `wander` setting says
  where that is wanted (the scripted flights and a ship on show); the page sets it false, and a pilot's ship holds its
  course and height, over a world too.
- **Gravity.** A world pulled 9 px/s² over its whole disc, a giant 44, a sun 64: near a world the ship slid sideways at
  13 px a second. Only a black hole pulls now (`GRAVITY.hole`): it is what a black hole is, and there are three.
- **The camera leaned by itself.** Over a world it looked 0.66 down (from the seat, 43°), eased in and out as the ship
  crossed the world's edge or a station's reach took the prompt. It looks where the ship points, there as anywhere; to
  see the world under him a pilot points his nose at it.
- **The way down and up went on by itself, and began unasked.** A dive of any slope at a world took the ship down; once
  begun the way went on by itself, a push the other way turned it back, and at a world's ceiling the thrusters alone took
  it out. With a mouse resting off the middle a pilot went back and forth between space and his world. It was made a
  passage flown for him, begun only with Use, and that the same day into no passage at all ("No transition", next).

Also: at the edge of the band a ship goes no further out and its nose is left where it points (it was brought level); on
the page a mouse moved within 1.2 s of the keys or a stick turning the ship does not take it from them
(`FighterJetScene.svelte KEYS_KEEP`: a pilot on the keys who fires with the mouse nudged it with every shot).

The keys let go: near level (`FLIGHT3D.settle`) the nose comes level; pointed well up or down it stays so and the ship
flies there, so a dive at a world is held; on its back it rolls upright.

Left: left and right on the pointer are still a rate of turn, as over a world, so a mouse resting to one side circles;
there is no mark on the HUD for the middle of the pointer's steering from behind (from the seat it is the sight).

### No transition: a world's air is flown through (2026-11-18)

James, of the passage flown for him: "why does there have to be this weird transition between exiting planet and space?
Its still janky ... why do we NEED a transition? Why isnt the whole universe one seamless thing??"

**Why there was one.** The game is two places, not one. A world's ground is a flat map that wraps at its edges, drawn
by a renderer of flat ground and flown by height; in space the same world is a ball, drawn by rays, in a plane the
ships fly in. The scene is in one or the other. Between them is the air (`sim/air.ts`, `render/air.ts`): a share `e`
of the way, at each of which the ball is drawn a little flatter and its map a little finer, until at the top of the
world's sky it is the flat ground itself. That morph was run by a clock: begun, it played. So it was a transition.

**What it is now.** The same air, flown: `e` moves only as the pilot climbs or dives (`sim/travel.ts flyAir`).

- **Up.** At the top of a world's sky a climb asked for (`AIR.out`) goes straight on up: the ground curves into a ball
  under the ship, the sky goes black, and at the air's top the ship is in space, flying. A climb held hard crosses the
  air in `AIR.cross` seconds; let go, the ship stays where it is in it. Use held high over the ground (HOLD [F] SPACE)
  only climbs for him, for as long as it is held (`heldUp`).
- **Down.** Over a world (`space.ts worldUnder`), a ship flown `AIR.enter` px down under the plane in a dive that is
  meant (its nose down by `AIR.steep`: steeper than a pointer resting off the middle of its steering gives; or flown all
  the way down to the globe's own air at any slope) is in the world's air (`spacezone.ts`). It goes on sinking as it
  dived in (`Travel.trim`) until its pilot asks anything else of it, and comes out at the top of the world's sky, flying
  level, to dive on down or not. Use held over a world (HOLD [F] DESCEND) only puts the nose down (`space.diving`).
- **Nothing is taken from him.** He steers all through it, the place under the ship moving as he flies at the ship's
  honest speed; no prompt, no autopilot, no hold. The HUD says which way he is going (DOWN TO …, UP TO SPACE).
- **He comes out over the place he left.** As a world stands for everyone, half its places lie round its edge or on
  its far side, and a ship that climbed out of one of those came out at the world's rim with the ground sliding away
  under it, and was off the world before it could dive back. Now a world climbed out of is turned on, for this pilot
  only, as he rises (`scene.spun`, `travel.ts turnedOn`, `placeNormal`; `AIR.top`, `AIR.turnBy`): the place he left comes
  up to face the plane, so its ground stays under his ship all the way up and he comes out over it, and a dive straight
  back comes down where he left. A world's hour and which way up it is are therefore his own (nothing else in the galaxy
  goes by them): climbing out of a place at night, its day comes up as he rises, in a moment (`daylight.ts FADE_AIR`).
  If he comes back down before he is out, the world is as it was.
- **The camera does not jump.** At the air's top it is space's own, which looks where the ship's nose points; down
  through the air it goes over to the sky's, level and looking down at the world (`AIR.cam`, `camera.ts flownFree`,
  `air.ts` `look`), and the ship's nose keeps the way it dived in until it has. (At a stroke, a ship that dived in near
  a world's edge lost sight of the world for a second and more.) From the seat the look down is the same on both sides
  of where the zone changes (it was less on the surface's side: the world jumped up the canopy there).

Pictures: `docs/art/gen/seamless-behind.png` (the keys: up through the air at night into day, out, a dive back in),
`seamless-seat.png` (the mouse, stopping in the air and going back down).

**What is still two places.** At the air's middle the scene changes zone: the ships, shots and creatures of the one
are left and the other's are met (others see the pilot leave or arrive), and the page changes its room. The ground is
flat under the top of its sky and a ball over it, and the air between is a drawing of one as the other, not a place with
its own ground. Space is still a plane: a world shows one face up to it.

**The whole universe as one thing** would mean worlds that are spheres all the way down: terrain made on a sphere
(no flat map that wraps, no Mercator), a ground renderer that draws a curved world from a ship's height to orbit with
levels of detail, flight by one model from the ground to space, ships free to fly round a world and not only over its
upper face, and everything placed on a world (bases, ore, places, creatures, the pilot on foot) placed on the sphere.
It is a rebuild of world generation, the ground renderer, flight and placement, and every pinned world and flight with
them; not begun.

### Interiors

Small hand-drawn tile rooms, not generated.

**Since the last pass of the polish, all drawn on one rule** (CLAUDE.md; docs/pixel-art-techniques.md "Interiors: one
projection"): top-down and square-on on a grid of 8 px tiles, every piece a footprint of whole tiles with a rise and its
facings, built against the walls or standing on a room's middle line, the model's pictures checked in code until they
fill their rectangles; each kind of room furnished by a recipe, mirrored, with a way kept to everything
(docs/polish-pass.md, "The last pass").

- **Hangar:** your parked ship, a loadout bench, a paint booth, your vault.
- **Station deck:** a shared room with a shop, a mission board and other pilots.
- **Ship interiors:** the inside of a ship roughly matches its outside in shape and size.
  A small fighter has almost none, perhaps a single bunk. Larger hulls have rooms to walk
  around and fit out, such as a map room and crew quarters.

Rebuilt in the polish pass (items 1 and 7), towards whole-room pictures by the image model
(`art/mockups/room-cockpit.png`, `room-bunk.png`, `room-maproom.png`, `room-quarters.png`, `room-cargo.png`,
`room-engine.png`, `room-hangar.png`, `room-deck.png`): a ship's rooms are its hull 4.5 times over
(`SHIP_SCALE` 1.75 hull px a tile; the pilot inside is his full sprite) and kinds of room, front to back
by hull (`SHIP_ROOMS`: a Dart its cockpit, a Corsair cockpit, cabin and engine room, a Galleon cockpit, map
room, crew quarters and cargo bay), as many as its length has rows for (`ROOM_KINDS`: each its floor, its
least rows, what hangs on its back wall, its fit-out). Each room is even about the middle line, as wide
as the hull is there, its sides stepping a tile a row at most (so walls run straight or at 45°), a wall
a tile thick round it and nothing beyond. A way down the middle a tile wide is kept clear (only a star map
or a reactor may stand on it, with a way round). A back wall shows its face a tile and a half tall (its
panels, a lit rim, its lamps, portholes, screens, charts, pipes and doors: `Decor`); floors are lit from
the lamps in warm pools that fall away in dithered steps and darken along the walls' foot; props cast a
shadow and take the light where they stand. A new ship comes with its fit-out (`shipKit`: the furniture
of each kind of room, placed where it goes: a cabin's bunk against its back wall, a map room's star map in
the middle, crew quarters' bunk beds, table, galley and lockers, a cargo bay's racks, crates and loader);
the pieces are the pilot's (save version 8: `ShipRecord.kit`), to move or take up. The hangar shows his
ship from its larger build (`BIG` 2.5: `jet/models/big/`, the same pictures shrunk less, its parts and
emblem too), the size its rooms are beside him; the deck has a bar, a window onto space and no pillars.
44 pieces in one style (`tools/gen/interiors.py`, `tools/props-sheet.ts` draws them all). As built before:

Built in Phase 8 (`sim/interior.ts`, `render/interior.ts`, `interior/rooms.ts`, `data/interiors.ts`;
after `art/mockups/hangar.png`, `deck.png`, `cabin-small.png`, `cabin-large.png`): a third zone,
`'interior'`, entered landed at a friendly base or docked (the page's Hangar, Deck and Aboard
buttons, or H). Rooms are 8 px tiles seen from overhead at the on-foot zoom; a wall with floor in
front shows its face, others a dark top with a pale rim; props stand with their foot on a tile and
hide whoever is behind. The hangar and the deck are laid out by hand (decision: not generated, as
this section said); a ship's rooms are worked out from its hull's top view (three hull px a tile,
mirrored, gaps closed, the outline as walls, one tile pockets walled up), split front to back into
one to four rooms by floor area (cockpit; quarters; map room; cargo bay) with a doorway between each,
the flight console at the front (Use: back to the seat) and a hatch behind. A Dart is its cockpit
alone; a Galleon has all four rooms. Furniture is bought by the piece and placed in front of the
pilot where it fits (Use), taken up again by Use. The outside waits while he is in: his ship stands
sheltered (out of the fighting). The deck has a crowd of four computer pilots when nobody else is
there. Tiles, walls, props and furniture are the image model's (`tools/gen/interiors.py`, one recipe:
a grey box from high up as the guide), cut and shrunk by `tools/voxel/interiors.py`.

**Up out of the seat in flight** (James, 2026-11-18: "I would like to be able to walk around the ship when its flying -
like a toggle to get out of my seat"). The seat key (`seat`: G, a controller's L3, the touch screen's Seat under More)
pressed while flying his own ship (in a world's sky or in space, its power on, not landed, docked or on the way to
either, not on the way down, up or through a gate or a hole) gets him up: the view is his ship's own rooms, as Aboard
shows them (`shipRoom` of the hull he flies, his furniture in it), him standing behind the seat, the camera and the art
pixel as inside. Decisions:

- **The outside keeps running.** Unlike going inside landed, the scene stays in its zone (`interior.flying`, not the
  `'interior'` zone): `sim/step.ts` steps the zone, the ships, the fight and everything else as ever, telling them nothing
  is held (`calmed`: the outside's own `Controls`, emptied every step), then gives the real controls back and walks him
  round the rooms (`stepUp`: `stepInterior`, the alarm, and back to the seat if the ship is taken from under him: shot
  down, landing, a way down or up begun). Raiders, turrets, missiles and hits carry on; the network sends his ship as
  ever (he is `inside` 0 to the others, flying: no protocol change).
- **The autopilot** (`flyLeader`'s first branch): back to the heading it had as he got up and holding it, the height it
  was flown to (over a world never under its clearance over the ground ahead, so it climbs over a hill and never
  crashes; in space level, gravity's drift and the cruise drive going on and dropping out as they do), the throttle as
  set. It never lands, never rolls, never fires; guns, missiles and the laser do nothing while he is up, and the roll,
  the view, the cruise and power keys wait.
- **Feeling it inside** (`render/upflight.ts`, numbers `UP_IN_FLIGHT` in `data/interiors.ts`): round the rooms the
  outside goes by, the world's own ground far below (its materials' colours, hazed by the air between, turning with the
  ship) or space's stars at two depths; a hit throws the rooms about a pixel or two and flashes them (red for the hull,
  blue for the shield), the hull's alarm sounds (`alarm`, once a hit), and a line says HULL HIT: BACK TO THE SEAT, UNDER
  FIRE or MISSILE COMING (6 s off). Top left, under the room's name: AUTOPILOT and the speed (CRUISE in space), the shield
  and hull bars, [G] TO THE SEAT. The drive's hum and the beeps go on (the page's listener counts him flying). The hatch
  says HATCH SEALED IN FLIGHT.
- **Back to the seat**: Use at the seat, or the seat key anywhere (at once: the toggle he asked for), or the page's To
  the seat button; the flight view as it was (overhead, behind or the cockpit), the controls his again.
- **Help**: the help line names the seat key flying and in space (`get up`) and up (`to the seat`, `upHint`); the first
  sortie, if he gets up in it, asks him back to the seat; a tip (`seat`) on a long run under the cruise drive, once the
  first sortie is done. Phones: Seat in the More grid while flying, beside Run and Action while up (its icon the image
  model's, `tools/gen/interface.py` `seat`).
- **Left out**: other players aboard while it flies (a squad mate walking his rooms), the rooms seen by others, a
  viewport onto the outside in a wall (the outside shows round the rooms instead), damage inside (fires, sparks from a
  panel), steering from a console other than the seat, and a ship flying itself to a course plotted on the map.

## 7. Ships

### Hulls

Eight to ten base hulls, shared by both factions. A hull is a starting point: the player
upgrades it with modules and weapons that show on the ship, paints it in their own colours,
and fits out its interior. The four roles below are the first; the rest of the lineup is
still to design.

These are spaceships, not aircraft, and the jet in the demo is scrapped. The look is pointed
and aggressive: wedges, prongs and sharp noses. Nothing bulbous. All hulls are roughly the
same size and differ in shape and proportion more than in scale. Shape drafts are in
`docs/art/`.

**Scale (settled in Phase 1).** A hull is 34 to 48 pixels long (`tools/voxel/build_hulls.sh`), and since the rebuild
after the fresh review 7 to 15 slices tall, its height its plan's (it had been 6 slices, guessed from the outline). At first they were 60 to 88 long, which on a frame about 450
by 250 filled a third of the picture: you could see your own ship and little else. At this
size a ship is about a sixth of the frame's height overhead, so a turning fight fits on
screen, and each ship has about a fifth of the voxels, which is most of what made drawing
many ships fast. The chase camera keeps its field of view by sitting further back in hull
lengths (`chaseDistance` 4.5, `chaseSize` 0.11). The pilot was about 10 pixels, large against his
ship; since the polish pass (item 1) he is half that out on a world (section 6, "On foot"), and the
hangar shows a ship from a build 2.5 times larger (`jet/models/big/`), the size of its own rooms.

| Hull        | Role            | Speed | Agility | Armour | Cargo | Weapon mounts | Module slots |
| ----------- | --------------- | ----- | ------- | ------ | ----- | ------------- | ------------ |
| Fighter     | All-rounder     | 100%  | 100%    | 100%   | 4     | 2             | 2            |
| Interceptor | Hunter          | 125%  | 120%    | 60%    | 2     | 2             | 1            |
| Gunship     | Brawler, escort | 80%   | 75%     | 180%   | 4     | 4             | 2            |
| Hauler      | Miner, trader   | 70%   | 65%     | 140%   | 12    | 1             | 3            |

The Fighter is free forever, so nobody can be stuck without a ship. Percentages are relative to the Fighter.

### Stats

- **Hull points:** damage it can take.
- **Shield:** a small buffer that recharges after a few seconds without being hit.
- **Speed, boost, agility:** the existing flight settings.
- **Heat:** guns and boost build heat, and overheating locks them briefly.
- **Cargo slots, weapon mounts, module slots.**

Built in Phase 1 for all ten hulls, as data in `src/lib/engine/data/hulls.ts`: speed and
agility as shares of the scene's settings, hull points, shield, weapon mounts, missiles,
how well it hides from radar, and its points in a skirmish. Starting values, to tune by
playing. Boost does not build heat yet; cargo and module slots come with the phases that
use them.

| Hull       | Role          | Speed | Agility | Hull | Shield | Mounts | Missiles |
| ---------- | ------------- | ----- | ------- | ---- | ------ | ------ | -------- |
| Dart       | Light fighter | 105%  | 115%    | 80   | 30     | 2      | 2        |
| Sparrow    | Scout         | 120%  | 110%    | 60   | 25     | 1      | 2        |
| Lance      | Interceptor   | 125%  | 120%    | 60   | 30     | 2      | 4        |
| Corsair    | Raider        | 100%  | 100%    | 100  | 35     | 2      | 4        |
| Wraith     | Stealth       | 110%  | 110%    | 70   | 45     | 2      | 2        |
| Prospector | Miner         | 80%   | 80%     | 130  | 35     | 1      | 0        |
| Mule       | Hauler        | 70%   | 65%     | 140  | 40     | 1      | 0        |
| Bastion    | Gunship       | 80%   | 75%     | 180  | 50     | 4      | 4        |
| Nomad      | Explorer      | 95%   | 90%     | 110  | 40     | 2      | 2        |
| Galleon    | Freighter     | 65%   | 60%     | 200  | 60     | 2      | 0        |

The Corsair is the ship a new pilot flies, so the scene's speed and agility settings are its
own. (The Wraith shows on radar only within 45% of its range.)

### Weapons

| Weapon       | Behaviour                                          | Counter                          |
| ------------ | -------------------------------------------------- | -------------------------------- |
| Cannon       | Fast shots straight ahead, builds heat             | Out-turn the attacker            |
| Missile      | Locks after a second on target, limited ammunition | Roll at the right moment         |
| Flak         | Short-range burst, wide spread                     | Keep your distance               |
| Mining laser | Cuts ore and asteroids, weak against ships         | None needed                      |
| Mines        | Dropped behind you                                 | Do not follow in a straight line |

The roll that exists today becomes the dodge: a well-timed roll breaks a missile lock.

Built in Phase 8 (`data/loadout.ts`): a weapon on each of a hull's mounts. The cannon is every
hull's own (drawn into its picture); flak fires a burst of five pellets (2.2 bursts a second a mount,
170 px, 40% hotter); the mining laser fires quick weak pulses (a third of a cannon, 150 px, never
hot) and cuts ore 60% faster; a missile rack adds two missiles; a mine layer holds four mines (one
back each 18 s), dropped behind with the secondary button when nothing is locked, armed after 0.7 s,
bursting at an enemy within 16 px for 48. Guns fire in turn by mount, each at its own pace. Mines are
decided by the dropper's game, like shots (`sim/mines.ts`).

### Modules

Afterburner tank, shield booster, cargo pod, scanner (shows ore and pilots on foot), tractor
(pulls in loot from further away), cruise drive upgrade, heat sink, armour plating. Each is a
trade-off, not a straight upgrade.

Built in Phase 8, each with its cost: afterburner tank (thrusters +22%; hull −10%), shield booster
(shield +20%, back a quarter faster; guns heat 15% faster), cargo pod (+2 hold slots; 5% slower, 4%
wider turns), scanner (radar ×1.5, pilots on foot seen under trees; shield −10%, and the ship shows on
radar at any range), tractor (scoops from twice as far; 5% wider turns), cruise drive (cruise +25%,
spools in two thirds the time; hull −10%), heat sink (guns cool 25% faster; shield −15%, cut from
35% after the balance test), armour (hull +25%; 6% wider turns, 3% slower). The rule, tested over
every fit of every hull (`loadout.spec.ts`): no fit makes any fighting stat (speed, turn, thrusters,
hull, shield, recharge, gun endurance, firepower) more than a quarter better than its hull bare.
Utility (hold, reach, cutting, radar range, cruise) may move further, always paid for in a fighting
stat. Hulls themselves differ by role, as the hull table sets (a Bastion's guns against its speed),
and are priced to match (`HULL_PRICES`: 800 to 4200 credits; the Corsair free). Polish step 9 cut them by about a
quarter (600 to 3,400) and gave each a line of what it gives that no part can (`HULL_PITCH`); once the Corsair's two
module slots are full, a tip names the ship to work towards by how the pilot earns (`NEXT_SHIP`: a Prospector, a Lance),
and again once he can buy it; a ship bought is flown at once and stands in the hangar.

### Damage and loss

- Damage shows as smoke, then fire, using the particle systems that exist.
- At zero hull the pilot ejects. The existing sequence is reused up to the parachute.
- Cargo spills as a crate at the wreck. Anyone can take it.
- You never lose a hull you own. You lose the cargo and pay a redelivery fee that scales
  with the hull. The Fighter is always free to redeliver.
- Built in Phase 4 (`sim/cargo.ts`, `crates.ts`): the hold is slots by hull (`data/loop.ts`:
  Dart 3, Sparrow and Lance 2, Corsair and Bastion 4, Wraith 3, Prospector 8, Mule 12, Nomad 6,
  Galleon 16; ten units a slot), and a full one costs 24% of top speed, 32% of turn and 40% of
  climb. A lost ship spills its hold as a crate (the image model's sprite, a beacon on top) that
  anyone can take by flying low over it; its owner only after 15 s, as his new ship arrives right
  over it. The fee is charged from the wallet (Corsair, Dart, Sparrow free; up to 120 for a
  Galleon). The pilot still ejects and is picked up (on foot is Phase 5).
- A pilot who comes down on land can have the ship redelivered to where they stand. It
  takes about 30 seconds and can be interrupted by killing the pilot.
- A pilot who comes down in the sea dies. Shallows that can be waded count as land.
- A pilot who dies respawns with their ship at the nearest friendly space station or
  planetary base.
- Polish step 9 (`data/foot.ts DESCENT`, `sim/foot.ts`): over deep water, lava or acid, or coming down into it, the canopy
  opens at once and glides (20 px a second down, steered at 64 across: about 400 px from a low fight, 750 from 150 px
  up); a ring on the ground marks where he will come down (green on land, red where he cannot live) and an arrow points
  to the nearest land with its distance; raider bands' spots are kept within 200 px of land (`BAND.surface.shore`); a
  pilot down in a pocket of ground he could not walk out of is set on open ground near; his own parked ship, 90 px off
  or more, can be called to him (9 s, free, keeping its hurt). Coming down in deep sea is still death.
- Built in Phase 5 (`sim/ejection.ts`, `sim/foot.ts`): in the loop the seat's rocket fires as
  before, then he comes down his race's way (section 9): free fall at 130 px a second to 90 px
  over the ground, then open and sinking at 16, steered across the ground at up to 34 (about
  190 px of reach from the opening), all races alike. The camera stays overhead and pulls in
  near the ground. Down on land (or in shallows) he walks; in deep water, lava or acid he dies.
  Held Use calls a ship: 30 s, its last 3.2 of them it flying in low and braking onto flat ground
  near him; its fee (`REDELIVERY`) is paid when it lands, and only for a ship that was lost, not
  for one stolen from him while he was in one he had stolen. Killed meanwhile, it does not come.
  Killed on foot (by a shot or by the sea), his backpack drops as a crate, and 4 s later he is in
  his ship on a pad of the nearest friendly base (a new one, for its fee, if his was lost; his
  parked one, brought there, if not). The ship he leaves parked can be shot to pieces (its hold
  spills; no feed line). The fee is no longer charged at the moment of loss.

### Art pipeline

Art is drawn by an image model running on this PC and turned into game assets by code.
Nobody on the project draws, and no paid service is used. The first attempt, drawing ships
purely in code, was rejected as not good enough; the notes are in
[pixel-art-techniques.md](./pixel-art-techniques.md).

For a ship:

1. **Shape.** A plan of the hull, drawn in code as flat shapes (`src/lib/art/hulls.ts`).
   This is where a ship's outline is decided.
2. **Picture.** The image model (Z-Image Turbo, through ComfyUI) draws the ship from above
   in pixel-art style, following the plan as a guide (`tools/gen/hulls.py`). About 12
   seconds a ship.
3. **Voxels.** Code shrinks the picture to game pixels, mirrors it, and builds height from
   the outline (`tools/voxel/topview.py`). The result is a sprite stack the game can turn
   to any heading.

Rebuilt after the fresh review (18 November 2026: from behind every ship was "a dark lump with icicles", the title's
ships crabs), each hull is a solid seen from three sides:

1. **The plan is a solid.** Each part of a plan (`src/lib/art/hulls.ts`) has its outline from above, from the side
   (`side`: along, height) and from behind (`rear`: across, height); the part is what all three allow, and the hull is
   its parts together (`solidOf`). `tools/art-sheet.ts` draws it from the side and from behind as grey guides
   (`art/hulls/control/control-side-*.png`, `control-rear-*.png`: lighter nearer, a nozzle seen end on a bright core in
   a dark rim) and writes the solid beside them (`plan-*.json`).
2. **Three pictures.** The image model draws each hull from the side and from behind over those guides, in the same
   recipe as from above (`tools/gen/hulls.py --view side|rear`, four tries each); the tries that agree with the top view
   are chosen by eye (`art/hulls/picks.json`). The top pictures are the ones the ships always had.
3. **Carved.** `tools/voxel/carve.py` takes the plan's solid, cut down to the side and rear pictures' outlines (the
   canopy kept whole: a view may draw a notch where it shows through), every column of the top picture kept, so the
   outline from above, and the ship's rooms laid out from it, are exactly as they were. Each surface voxel takes its
   colour from the picture that looks most squarely at it (from the solid's smoothed slope: a gentle slope faces up, a
   steep one out), the side and rear pictures snapped to the top picture's palette family by family; glass only on
   the plan's canopy, glow on the nozzles as the rear picture drew them, in the engines' own cyan; a tidy pass takes
   out lone specks. `tools/voxel/to_model.py` finds the engines as the patches of glow on the back faces.
4. **Drawn.** Each voxel knows which way it faces (`jet/mesh.ts facesOf`, from the solid: top, a flank, back, front,
   belly), and is lit by it from over the viewer's left shoulder, as a sprite is lit, in every view (`render/jet.ts`:
   up a tone, as is, down one or two). Voxels are kept in order by a depth test of the ship's own (`Frame.jetZ`). Where
   slices are drawn more than a pixel apart (from behind, from the seat) a voxel is the screen box its whole cube covers;
   overhead it is sampled as before, its slices half a pixel apart (`OVERHEAD_SPREAD`), so a ship from above keeps its
   look. Flames fill their nozzles, and one pointing at the camera is drawn tail first, its core on top.

Sheets: `npx jiti tools/ship-turntable.ts <dir>` (every hull at twelve headings in every view, banking and pitching with
flames, and seen from the seat), `tools/ship-close.ts` (close-ups), `tools/chase-frame.ts` (whole frames from behind),
`tools/pattern-sheet.ts`; `docs/art/gen/ships-3d.png` and `chase-before-after.png`.

Built in Phase 8, fitted parts: each weapon and module is drawn by the image model from above with a
grey plan of its shape in the hulls' own style (`tools/gen/parts.py`), shrunk to 6 to 14 game pixels
and sorted into the ship's paint (its metal the trim colour by tone, its markings the hull's markings,
any glow the engine glow) with a height from its distance to its edge (`tools/voxel/parts.py`). At run
time the part is merged into the hull's voxels where it goes (`jet/fit.ts`), so it turns, tilts and is
lit with the ship, with a dark rim cast on the hull round it. Emblems are drawn as white shapes and
read back as 7 × 7 masks for the left wing (and the side's mark on the right).

Built in the polish pass (item 3), the cockpits: each hull's view from the seat is the image model's
(`tools/gen/cockpits.py`), drawn over a plan of its layout (1536 × 640, wider than any screen): its windows,
struts and roof shaped as the hull is (the Dart's bubble and one bow overhead, the Sparrow's teardrop, the
Lance's spine, the Corsair's two slanted struts, the Wraith's faceted panes, the Prospector's grille, the
Mule's square panes, the Bastion's armoured slits, the Nomad's dome, the Galleon's bridge), its panel and lip,
its trim, and where its screens go. `tools/voxel/cockpits.py` cuts the windows where the plan has them,
shrinks the picture to 200 and 256 px tall (each pixel the commonest colour of its patch), holds all ten to
one palette of 64, and sorts the trim (repainted in the player's markings colour) from the rest
(`render/cockpit/art.ts`, generated). The engine fits the nearer build to the frame without scaling it
(cut to its width, stretched at one row through the windows: `build.ts`), lays its two layers (the frame,
the panel) over the view as the head sways, and draws the live instruments on the panel's screens
(`screens.ts`: radar, attitude, hull and shield, heat and missiles, speed and height, the target, the hold),
in the HUD's own type. The world is drawn only above the rows the panel hides (`CockpitArt.clear`).

The same model is expected to draw pilots, portraits, stations and room tiles. Pilots and
portraits were done in Phase 5 (section 9, "The six races, as built"): a plan of the outline in
game pixels, drawn up blocky as the guide, and read back block by block, keeps the outline exactly
as planned while the model paints it; the parts a player recolours are asked for in colours no
race uses (lime green, hot pink) so they can be told apart.

### The models and their licences

Every model this project uses runs on this PC in the ComfyUI at `C:\ComfyUI_windows_portable` (set up by
the Eminent Domain project, whose `docs/SETUP.md` says how to start it), from its `models` folder. Free and
local, as CLAUDE.md asks.

| Model                                | Files (folder)                                                                                                        | Size    | Licence                                                                                        | Source                                                                                                             | Used for                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| Z-Image Turbo                        | `z_image_turbo_bf16` (diffusion_models)                                                                               | 12.3 GB | Apache 2.0                                                                                     | Comfy-Org on Hugging Face                                                                                          | every picture                           |
| its text encoder and VAE             | `qwen_3_4b_fp8_mixed` (text_encoders), `ae` (vae)                                                                     | 5.9 GB  | Apache 2.0                                                                                     | Comfy-Org on Hugging Face                                                                                          | every picture                           |
| Z-Image Turbo Fun ControlNet Union   | `Z-Image-Turbo-Fun-Controlnet-Union` (model_patches)                                                                  | 3.1 GB  | Apache 2.0                                                                                     | alibaba-pai on Hugging Face                                                                                        | the grey shape guides                   |
| Stable Audio 3, small, sound effects | `stable_audio_3_small_sfx` (checkpoints), `t5gemma_b_b_ul2` (text_encoders)                                           | 3.5 GB  | Stability AI Community License (not open source: read its terms before any commercial release) | Comfy-Org/stable-audio-3 on Hugging Face, installed for Eminent Domain                                             | every sound effect                      |
| ACE-Step 1.5, turbo                  | `acestep_v1.5_turbo` (diffusion_models), `qwen_0.6b_ace15` and `qwen_1.7b_ace15` (text_encoders), `ace_1.5_vae` (vae) | 10.0 GB | MIT (the model, ACE-Step/Ace-Step1.5); its ComfyUI files are marked Apache 2.0                 | Comfy-Org/ACE-Step-1.5 on Hugging Face, the files ComfyUI 0.45.0's own template (`audio_ace_step_1_5_split`) names | the first music (replaced 2026-11-19)   |
| Kokoro v1.0                          | `~/.cache/eminent/kokoro` (in WSL, fetched by Eminent Domain)                                                         | 0.3 GB  | Apache 2.0                                                                                     | kokoro-onnx                                                                                                        | the numbers spoken in the samplers only |

ACE-Step 1.5 was installed for the polish pass (item 9) on 17 November 2026, James having approved a
music model ("yes use stable audio, and install a music model too"). It was chosen because this ComfyUI
supports it natively and its licence is permissive; the other native music models were MiniMax Music 3 and
YuE2 (songs with lyrics) and Stable Audio 3's medium model (the Stability licence). The turbo model (5 GB)
rather than the XL (10 GB, with a 4B planner): another process on this PC holds most of the GPU's memory.
ComfyUI listed the new files without a restart. About 13 seconds a two-and-a-half-minute piece (6 without
its planning step); Stable Audio about 1.5 seconds for four takes of an effect.

Since 2026-11-19 the music is not from this PC: ElevenLabs Music (`music_v2_5`), on James's own paid plan,
whose terms allow its music in a game that is sold (section 17, "The music, made again").

## 8. Combat and PvP rules

- **PvP is always on, everywhere.** There are no safe zones.
- **No friendly fire** within a faction.
- **Hits:** the shooter's game decides whether a shot hit. This is simplest and feels best
  with lag. It is cheatable, which is accepted for now.
- **Aiming:** a small aim-assist cone, so pointer, keys, controller and touch can all hit.
- **Height matters:** shots travel in three dimensions, so diving and climbing are real
  moves.
- **Spawn protection:** 5 seconds after launching or respawning, ended early by firing.
- **Home defence:** faction capitals have strong turrets, so camping a home base is costly
  without being impossible.
- **Kill rewards:** credits and the victim's spilled cargo.
- **Farming limit:** repeat kills of the same pilot within 10 minutes pay sharply less.
- **Bounties:** a pilot on a kill streak shows on the galaxy map with a price. This turns
  the best players into targets.
- **Squads:** up to 4 pilots. Flying in tight formation gives a slipstream speed bonus.
  The wingman code is reused for this, and AI wingmen fill a squad when you are alone.
- **NPCs:** drones at wrecks and derelicts, turrets at bases, light faction patrols. They
  give a lone player something to fight.

Built in Phase 8, squads (`sim/squad.ts`, `data/squads.ts`): up to four of a side, asked and answered
over the network (`squad`, `squadIs` events; invites from Pilots nearby; the Squad screen); the squad's
mates and computer wingmen (up to two, filling it) are listed down the HUD's left side with their
hull; within 48 px of one, heading within 26° of his way, the slipstream eases in: +8% top speed.

Built in Phase 1 (numbers in `src/lib/engine/data/weapons.ts`): the cannon fires along the
nose in three dimensions, and the player's shots are turned onto an enemy whose lead point is
within 4° across and 15° up or down of it (generous up and down because height is hard to
judge from overhead, where the ship also eases to the height of the enemy in its sights). A
missile locks after a second in a 22° cone; a roll begun between 0.85 and 0.12 seconds
before it would hit breaks its lock, and the HUD says ROLL! in that window. There is a rest of
0.35 s between rolls, so rolling all the time only sometimes works. Spawn protection is five
seconds, ended by firing. The skirmish (section 22, Phase 1) is the lone player's fight: waves
of computer pilots (`src/lib/engine/sim/pilots.ts`, waves in `data/skirmish.ts`) that hunt,
attack in runs with imperfect lead, turn away under fire, run when badly damaged and roll to
dodge missiles. Only a few attack the player at once; the rest go for his wingmen or wait.
Any ship given a side can be fought, and `Scene.addShip({ pilot })` puts a computer pilot in
it: the start of the patrols above.

**Missiles come back, and a poor pilot can be chased down (2026-11-19).** James: "I would like missiles to slowly
replenish, like 1 every 15-30s or something so you dont get totally out of missiles", and of the computer's pilots:
"they turn back at you too often making it really hard to track them … we just constantly fly in loops around us - at
least the easier enemies. Maybe there can be some harder ones".

- **Missiles:** the pilot's own rack fills again by itself, one missile every 20 s up to what it holds (`MISSILE.regen`,
  `sim/combat.ts stepFighters`, `Fighter.missileIn`); a soft tick as one comes (`rearm`); the HUD shows the rack while
  it is short, the next dart filling from its tail. The computer's pilots have what they set out with. Missiles can
  still be bought at a base, to be full at once.
- **The computer's pilots:** every pilot, whatever his skill, turned hard away within half a second of an enemy
  getting behind him (the chance was taken five times a second), and when the turn ended turned back at him, at 72 to
  100 % of his hull's turn rate: a chase was a circle. Skill now decides it (`data/skirmish.ts skillAt`,
  `sim/pilots.ts think`): how hard he dares turn (`turn`, from half his hull's rate), how likely he is to turn away
  and how long he then flies on before he may again (`evade`; `steady`, 7 s for the poorest to 1 s for the best: the
  time he can be followed and shot in), whether, finding an enemy on his tail, he runs for it instead of turning back
  to fight (`flee`, made up once and held to; `fleeFor`; and how wide he thinks to open his thrusters, `run`: a poor
  one is caught), and how far he runs out after a pass before he comes round (`wide`). The best fly as all of them
  did. Measured, a plain pursuer (turn at him, fire when he is in the sights) against one Dart, 45 s a try, six
  tries, before and after: the first wave's pilot (level 0) was in the sights 33 % of the time and downed twice in six,
  in 43 s; now 51 %, and six in six, in 15 s. At 0.25 (the raiders by a side's home are 0.28 to 0.3): 26 % and never
  downed; now 43 %, six in six, in 20 s. At 0.62 (the core's raiders): 19 % then, 29 % now, never downed either way.
  At 0.88: 21 % then, 12 % now, never downed. So the near bands are a fight a new pilot wins, and the core's are
  still a fight.

Flights `a missile fired, and the rack filling again`, `a poor pilot chased down` (picture
`docs/art/gen/poor-pilot-chased.png`).

Built in Phase 2 (PvP, `src/lib/engine/sim/room.ts` and `src/lib/net/session.ts`): in a shared
sky a scene has three sides, its own pilot's faction (0), the computer's raiders (1) and the
other faction (2), so friendly fire cannot happen. A shot's hit is decided by the shooter's
game, which reports it; the target's game does the damage. A missile is decided by the game
that owns its target, because dodging one is a roll timed by its target and lag would otherwise
steal it: elsewhere the missile is only shown, until word comes of how it ended. Each game
decides the loss of its own ships and says who downed them. A pilot's protection after a new
ship shows (and holds) on every screen. Kills of the same pilot within ten minutes pay 100%,
then 25%, then 10% of the hull's points (`FARM_WORTH`). Credits come in Phase 4, so for now
the reward is score.

Built in Phase 5: PvP on foot. A pilot on foot is a fighter (`WALKER`): a ship's cannon can hit
him (its aim assist works on him; no missile locks on him), another pilot's sidearm can, and a
ship's shot that strikes the ground within 6 px of him does him half its damage, so a strafing
pass that misses still hurts. Killing a pilot on foot pays 60 credits (less each time, as for
pilots). The computer's raiders hunt him as they hunt a ship (`pilots.ts`): strafing runs low
over him aiming at the ground at his feet with a steadier aim (30% of their wander at a ship),
pulling out and coming round; under trees they lose him beyond 34 px and circle where he was. A
wave may come to a pilot on foot (at 0.9 of the rest's pace, slower near home). Turrets work as
before (a friendly base's shoot raiders over him; an enemy's shoot him). Tuned by scripted flights
(two wave-5 raiders bring a pilot standing in the open to 13% in 25 s; one running and diving to
65%; the first waves barely scratch him).

Built in Phase 4: in the loop (a pilot with a side, on a world with bases) kills pay credits:
a raider a fifth of its hull's points, another pilot 140 times what the farming limit leaves
(100%, 25%, 10%); a raider downed leaves salvage half the time (2 to 6). Bases' turrets
(`sim/bases.ts`) fire bursts at raiders within 300 px, and a side's bases also at the other
side's pilots; each game runs them only against its own pilot and the raiders it flies. Missiles
are bought at a base in the loop rather than given with each wave.

Built in Phase 7: **bounties.** A pilot's streak counts his kills since he was last downed (a pilot
one, a raider a third, `save/progress.ts`); from three on he has a price, 40 credits a kill in it
(`BOUNTY`). His presence says it, so the galaxy map shows his callsign and price over his system, and
the pilots-nearby list shows it. When he is downed his game says the price in its word of the loss
(`down`), and the game of whoever downed him pays him it, once a life. The farming limit is as before.

Built in the polish pass (item 8, after James's play: "the waves of enemies never stop"): **enemies
belong to places.** No wave comes at a pilot in the galaxy; the old skirmish runs only for a pilot with
no side over the island world of the settings (`skirmishOn`), where the old dogfight flights still pin
it. In its place the computer's ships live somewhere (`sim/bands.ts`, numbers in `data/bands.ts`):

- **Where:** `galaxy/danger.ts` works out from the gate lanes (the black hole shortcut does not count)
  how far each system is from the nearest system each side holds a world in. A system's _wildness_
  (how strong its raiders are) is 0 at a home, 1 on the frontier next to a side's space, 2 deeper out,
  3 at the core. A side's _patrols_ fly in its own space (a system it holds a world in, and those next
  to one) and on the _front line_, the systems about as far from one side as from the other (both
  sides' patrols, which fight each other). In the galaxy as made, the front is Celium, the core
  Drassel, Phabaon and Mivos; it moves as worlds change hands. A pilot's _danger_ in a system is 0 in
  his home, its wildness elsewhere, at least 2 where the other side's patrols fly, 3 at the core and
  the other side's home; a hotspot's world one more (pirates), a barren moon's band one stronger.
- **Raider bands** wait at a spot: on a world by its rich ore (pushed 520 px clear of the bases'
  turrets and 400 px off the way between the bases, where the patrols fly), at each outpost's way in
  (640 px out, off to one side: they let an empty ship by and see a full hold 900 px further), holding
  a barren moon; in space by the gates out to wilder space (every gate deeper out), in each belt, at a
  derelict (its drones, 3 Sparrows, its salvage strewn as they come out), at the black hole shortcut's
  way in. Their ships and skill by wildness: Dart and Sparrow at 0.12, then Lance, Dart and Corsair at
  0.34, then Bastion, Wraith, Lance and Corsair at 0.72 (`skillAt`), with one, two or three going for
  one pilot at once while the rest circle and wait their turn, as a wave's did.
- **What they do** (`pilots.ts`: LURK, PATROL, RETURN): raiders lie low circling their spot, hidden from
  the radar and the HUD's arrows beyond 230 px; they see a ship within 330 px on a world (620 in
  space), and a loaded one further (+600 for a full hold); chase it, and give it up once it is beyond
  their ground (760 px from the spot, +500 loaded; 1700 in space) or under a base's guns (or within
  600 px of a station), then fly back and wait. They leave patrols alone unless one is on top of them
  or shooting at them. A patrol flies its route out and back (between a world's two bases; round a
  system's stations, habitable worlds and gates), turns on any enemy within 520 px (800 in space), and
  goes back to its route. Turrets fire on the other side's patrols as on raiders.
- **Waking and coming back:** a band's ships are put up when a pilot comes within 1000 px of its spot
  (2400 in space; a patrol where its route has it on the shared clock, each patrol taking a fixed time
  out and back worked out from where the bodies were at the clock's zero), and taken down when no pilot
  is within 1500 (3400) and none of them is fighting. A band whose every ship was shot down is beaten
  until a turn of its own clock (every 300 s from a start of its own) at least 600 s later: the same
  moment in every game. The news says AMBUSH (RAIDERS), DRONES, PATROL (whose) when one comes for the
  player, and RAIDERS BEATEN or DERELICT CLEARED, BACK IN n MIN.
- **Traffic** (`sim/traffic.ts`): haulers (Mule, Galleon, Prospector, Nomad) fly between a system's
  stations, habitable worlds and gates (four in a home system, two on the frontier, one at the core),
  and over a world from beyond one base, over both and away (two at home, one elsewhere), each leg 150
  s in space, 70 over a world, docked out of sight for a quarter of it. Where each is follows from the
  clock alone, so every player sees the same haulers without a word sent. A home system's wear its
  side's colours and mark; they cannot be fought, and show on the radar as dim dots.
- **Pay:** a raider or patrol downed pays its hull's points times 0.2 times its danger's pay (1, 1,
  1.5, 2.2: `BAND_PAY`), and its salvage grows the same way. A rival patrol is not a pilot: no pilot's
  bounty, no pilot's kill for the faction.
- In a shared sky the lowest key flies the bands as it flew the waves (protocol 5 carries each ship's
  band, its side and whether it lies in wait, and the bands beaten); two games' copies of a band, met
  in one room, are one again in the host's game.

## 9. Characters

### Creation

A quick creator in onboarding, changeable later in the hangar. A Randomise button gets
impatient players through in one click.

- **Callsign:** shown above the ship and in the kill feed.
- **Race:** chosen from the races of your faction. It sets the parts the portrait and the
  in-world sprite are built from.
- **Portrait:** a layered pixel portrait, about 32 by 32. Layers: head shape, skin, eyes,
  hair, facial detail, helmet, suit collar, faction patch. This is where a character has
  personality.
- **Suit colours:** primary and trim. These colour the tiny in-world sprite.

The portrait appears in the HUD, the kill feed, chat, the pilot list and on beacons.

### In the world

- A sprite a few pixels tall with eight facings and a short walk cycle, drawn the way the
  ejected pilot is drawn today.
- No character stats. Skill and gear only.

Built in Phase 5: see "The six races, as built" below, and section 10.

### The six races, as built (Phase 5)

The art is the image model's, following plans of each race's outline drawn in game pixels
(`tools/gen/races.py`: the design rule is that the six are told apart by outline alone from the
air), read back onto the same grid and sorted into parts by `tools/voxel/races.py`, written to
`races/art.ts`. `tools/race-sheet.ts` draws them all (`docs/art/gen/races.png`).

| Race    | Sprite (tall × wide, with outline)     | Comes down            | Portraits                               |
| ------- | -------------------------------------- | --------------------- | --------------------------------------- |
| Solari  | 12 × 9: round white helmet, dark visor | round parachute       | helmeted faces, two bare-headed         |
| Kestrin | 10 × 9: small blue bird, crest, beak   | wingsuit              | crested birds, big eyes, throat patches |
| Orrin   | 16 × 7: tall, thin, one antenna, lens  | a rotor over its head | brass heads, one lens                   |
| Skarn   | 10 × 13: wide and low, shell, a claw   | curled in its shell   | armour-plated heads, four small eyes    |
| Noctil  | 13 × 11: antennae, pale head, cloak    | wing-cloak spread     | huge dark eyes, fuzzy collars, antennae |
| Thallin | 10 × 11: a broad red cap               | under its own cap     | mushroom caps, lantern eyes             |

Colours are sorted into parts: the suit (drawn lime green) and its trim (hot pink) take the
pilot's two colours; the body (skin, feathers, brass, shell, fuzz, cap) and the glow (visor,
throat, lens, eyes, spots, lanterns) are moved to one of five choices each; the rest keeps the
model's colour. Each colour keeps its lightness against its part's middle tone, as a ship's paint
does. A look is one line of text, `race.face.skin.eyes.suit.trim` (`races/races.ts`). The layers
of the plan's portrait are, as built: the face (four drawn per race: head shape, hair, crest,
helmet or not, facial detail come with it), the skin, the eyes, the suit's collar in his two
colours, and his side's patch on it; a 16 × 16 shrink of each is drawn by the art tool for the HUD
and lists, and the kill feed shows the top rows of the sprite (his head). Noctil's sprites and
Skarn's portraits and fall were drawn a second time (`PICKS`) after the first read badly.

### Gear

| Slot    | Options                                                       |
| ------- | ------------------------------------------------------------- |
| Tool    | Mining tool tiers: faster and able to cut richer veins        |
| Sidearm | Blaster, and later a launcher that can hurt a hovering ship   |
| Suit    | Linings for heat or cold, so harsh worlds do not hurt on foot |
| Pack    | Backpack size                                                 |
| Gadget  | Flare, beacon, deployable cover                               |

Built in Phase 8 (`data/gear.ts`, the deck's shop): power and plasma cutters (veins 40% and 80%
faster; walking 5% and 10% slower), a launcher (rockets four times a bolt against a ship, at a third
the rate, weaker against a pilot), heat and cold linings (without the right one, a volcanic or an ice
world takes 0.9 health a second from a pilot on foot: TOO HOT, FREEZING), field and hauler packs (6
and 8 slots; runs 7% and 14% slower), and a cover cloak (hides him 12 s, once a minute, instead of
flares). Flares and the beacon are the plain gadget.

## 10. Customization

### Ships

- **Paint:** the player chooses every colour: body, accent, trim and canopy. Faction does
  not decide a ship's colours.
- **Upgrades that show:** modules and weapons appear on the hull when fitted.
- **Interior:** the rooms inside the ship, their layout and decoration.
- **Patterns:** stripes, checks, shark teeth. Applied as palette swaps on parts of the stack.
- **Insignia:** a personal emblem from a small set, and the faction mark if wanted.
- **Trails and flames:** exhaust colour, wingtip trail colour and style.
- **Loadout:** weapons and modules, changed at a loadout bench.

Friend and foe are told apart by the marker over each ship (callsign and faction mark), not
by paint.

### Characters

Portrait layers, suit colours, helmets and a few suit styles. Some are earned, not bought
(see [Progression](#14-progression)).

Built in Phase 5: the pilot creator (`PilotCreator.svelte`, after `art/mockups/creator.png`):
race (his side's three, each a tile with its portrait), face, skin and eyes (with arrows, named by
the race: feathers, plating, shell, fuzz, cap; throat, lens, spots, lanterns), suit and trim (ten
swatches each), Randomise, Done; the portrait large and the sprite walking and turning under it.
It comes after the side in onboarding and from Your pilot in the menu (there is no hangar yet).

### Where it happens

The hangar. You walk around your parked ship and use the paint booth and the loadout bench.
Changes show on the ship in front of you.

Built in Phase 8 (`PaintBooth.svelte`, `LoadoutBench.svelte`): every colour from a picker or the
swatches, free (the paints that were bought in Phase 4 are swatches now; the feats unlock four
emblems instead of four paints: crown, crossed swords, moon, bolt); trim (fitted parts and the
pattern; bare steel if none), engine glow (and the flames), trails; six patterns as palette moves on
the body (racing stripes, bands, checks, shark teeth, wingtips, two-tone); ten emblems and the side's
mark; up to eight schemes kept. Other players see all of it (the card's make and paint).

Rebuilt in the polish pass (item 7): a pattern has its own colour family (palette 97 to 112), in the trim
colour if one is chosen and else the markings' colour, painted over the body and its markings alike (so a
stripe runs on unbroken, where it was lost among the hull's own markings), each tone lifted into the
colour's light half; checks are squares of three px over the backs of the wings (they were two, and read
as noise). The booth shows each pattern as a picture of a Corsair painted with it (`static/ui/pattern-*.png`,
`tools/pattern-icons.ts`).

## 11. Inventory, resources and economy

### Containers

| Container      | Holds                      | Size            | At risk?                       |
| -------------- | -------------------------- | --------------- | ------------------------------ |
| Ship cargo     | Resources, salvage         | Set by the hull | Yes, spills when the ship dies |
| Backpack       | Resources, gadgets         | 4 to 8 slots    | Yes, drops when the pilot dies |
| Vault          | Everything banked          | Large           | No                             |
| Ship loadout   | Fitted weapons and modules | Set by the hull | No                             |
| Character gear | Tool, sidearm, suit, pack  | Fixed slots     | No                             |
| Wardrobe       | Cosmetics you own          | Unlimited       | No                             |
| Wallet         | Credits                    | One number      | No                             |

Rules:

- Items stack by type, up to a stack limit per slot.
- Boarding your ship moves the backpack into cargo if there is room. (Built in Phase 5: 4
  slots; what does not fit stays in the pack; it drops as a crate when he dies. It is not yet
  shown on the base's screen, only on the HUD.)
- Landing at a friendly base or docking at a station lets you bank cargo into the vault.
- The vault is shared across all bases. Simpler than per-station storage.

### Resources

| Resource    | Found                      | Used for                       |
| ----------- | -------------------------- | ------------------------------ |
| Ferrite     | Everywhere                 | Bulk income, basic parts       |
| Silica      | Canyon, mesa, barren moons | Shields, scanners              |
| Cryo-ice    | Ice worlds                 | Heat sinks, cruise drives      |
| Magma glass | Volcanic worlds            | Weapons                        |
| Bioresin    | Jungle worlds              | Suits, armour                  |
| Helion gas  | Gas giants                 | Afterburners, fuel for jumps   |
| Salvage     | Wrecks, derelicts          | Anything, sold at a premium    |
| Void shards | Near black holes           | Rare cosmetics and top modules |

There is no crafting tree. A part costs credits plus a few specific resources, bought at a
shop.

### Economy

- **Income:** selling resources, kill rewards, bounties, capture rewards, daily tasks.
- **Costs:** hulls, weapons, modules, cosmetics, redelivery fees.
- **Prices** at each station drift from day to day, derived from the galaxy seed and the
  date. Trade routes emerge with no market server.
- Players cannot trade with each other at first. With no authority it would mainly be a way
  to duplicate items.

### Repairs where the ship stands (2026-11-19)

James: "we need in game repairs at stations". A repair could be bought, but only from the base's screen (the hold and
the vault, under Supplies): a pilot who had not found it flew on holed. Now it is done where the ship stands
(`sim/repair.ts`): docked at a friendly station, or down on a friendly base's pad, with the hull short of whole, the
HUD says HOLD [R] REPAIR and what the whole of it would cost, over the prompt to undock or take off; the mining key
held (the laser has nothing to cut there; the touch screen shows Repair where Mine would be) mends the hull 30 points
a second, sparks coming off it and the cutter's hiss heard, a bar of the hull filling under REPAIRING; let go, it
stops. Every point costs what it costs at the counter (`SHOP.repair`), and it goes no further than the pilot's credits
(NO CREDITS FOR REPAIRS). The scene does not keep his money: the page says what he has (`Scene.setPurse`) and is told
what the mending came to when it stops, in the ledger (`kind: 'repair'`), which it books as a thing bought. The base
screen's Repair button is still there. Flight: `a holed hull mended at a station`; picture
`docs/art/gen/repair-at-a-station.png`.

### Built in Phase 6

Two resources of space (`data/resources.ts`; icons cut from the image model's pictures):
**helion gas** (11 credits a unit), skimmed from a gas giant's upper bands with Use held, 1.6
units a second, while its pull drags the ship down towards the depths that crush; and **void
shards** (64), 28 drifting round each black hole between 1.25 and 2.6 of its size, in its pull,
scooped by flying through them, back each 10-minute period. The belts' rocks hold ferrite,
silica and cryo-ice (18 units, back each 15 minutes), cut by the mining laser as outcrops are.
Derelicts strew salvage crates. A station's market pays the standard price for everything (it
has no ground of its own).

### Built in Phase 4

- **Resources** (`data/resources.ts`): ferrite 6, silica 9, cryo-ice 12, bioresin 14, magma glass
  16, salvage 20 credits a unit before the market moves them; ten to a slot. The recipe's ores
  are the ones a world's outcrops hold.
- **Mining** (`sim/mining.ts`): Land held with an outcrop within 150 px across (and no more than
  150 above it) fires the laser instead of landing: 2.6 chunks a second (a Prospector 1.6 times,
  a Mule or Galleon 1.15). Each chunk is thrown 42 to 82 px a second out, lands under the
  laser's circle, and is scooped up (flying up into the hold) when the ship passes within 30 px
  across and 95 above, if there is room. Others' chunks show but are theirs.
- **Mining made worth watching** (2026-11-18, after James played: "mining needs to be vastly
  improved with an improved visual beam, showing what you're mining, a progress bar etc.";
  mockups `art/mockups/mining.png`, `mining-behind.png`). The laser now works in **cuts**: a bar
  fills as it works and the cut breaks free in a burst of `MINE.batch` (3) chunks at once (2
  units for the hand cutter, `VEIN.batch`), with a flash, a ring and a crack; the ore a second is
  unchanged (2.6 chunks a second, and as before by aim, hull and fit). A cut is `sim/mining.ts`
  `Cut` (`stepCut`, shared by the ship's laser and the hand cutter, `foot.cutter`): what is in
  reach and since when, the progress, the rock's heat, the last cut freed; a cut's progress is
  kept while the same rock stays in reach. Sparks, flecks of the ore, grit and dust fly off the
  strike (`loop.mining.motes`, numbers in `data/loop.ts CUT`). Drawn by `render/mining.ts` in
  every view, as light added in dithered steps: a white core in the ore's own glow pulsing down
  the beam from the chin (the cutter's from the pilot's hand), reaching out as it comes on, a
  strike throwing rays, the rock glowing yellow to red as it heats and cooling after. The HUD
  (`render/cuthud.ts`): brackets that close on what is in reach before cutting, its icon (the
  item icons, `render/oreicons.ts` from `tools/voxel/oreicons.py`), name, RICH, GEMS (a gem
  chance of 10% or more, `gemChance`) and units left; the cut's bar with its ticks and what it
  frees; the label under the brackets, or beside them on the side away from the ship; the bar
  under the prompt where the rock is off the frame. +3 FERRITE rises beside the rock as a cut
  frees; the hold's count shows a moment after ore goes in (the pack's while cutting). The
  prompt names the ore (MINE FERRITE, CUT SILICA). In the seat, the target's screen (or the
  hold's, the nav's, the attitude's) shows the ore, the cut's bar, what it frees and what is
  left while nothing is in the sights. Sounds: `oreLock` (in reach; the lock's tick) and `cut`
  (a cut freed; the chunk's crack, by its size); the laser's and the cutter's loops as before.
  Points drawn on a world are placed at their copy nearest the camera (`nearX`): past the
  world's seam the beam had aimed at the rock's far copy, and chunks were drawn there too.
- **The vault and the wallet** are the page's (`save/property.ts`): a log of what happened
  (mined, banked, lost, taken from a crate, earned, paid, sold, bought, loaded), with the vault,
  the credits (250 to start) and what is owned worked out from it; a log over 1500 entries folds
  its oldest 1000 into one. The scene reports its part as a ledger (`Scene.takeLedger`).
- **Banking**: landing at a friendly base (the player's side's, or nobody's) banks the whole
  hold. A ship leaves for another world (the menu, until space flight) only landed at one.
- **The market** (`galaxy/market.ts`): each base's price for each resource drifts by up to 30%
  either way, turning every three days and easing between, from the galaxy's seed and the UTC
  day; a world pays 82% for ore its own ground holds and 122% for what it lacks. Sold from the
  vault at the base landed at.
- **Polish step 9**: ore a price asks for that the vault lacks is made up at the counter at twice its standard price
  (`SHOP.makeUp`, `payFor`), so credits alone buy any part or hull (a pilot who only fought had made 41 kills and could buy
  nothing); kills pay 0.6 of a hull's points (was 0.2) and a band beaten pays a bounty (`BAND_BOUNTY`: 120, 220, 360 by
  wildness); danger pays in the ore itself: a chunk is now and then a gem worth three (`CHUNK.gem`), likelier from a rich
  deposit and the wilder the place (the expected chunk about 1.06 units at home, 1.2 on the frontier, 1.5 at a rich
  deposit there, up to 2 at the core's), and the laser cuts faster held close and low (`MINE.aim`); a world pays 90% for its
  own ore and 110% for what it lacks (were 82% and 122%: a trader who mined at home and sold where his ore was lacking had
  earned what a frontier miner did, for no risk).
- **The shop** (`data/shop.ts`): repairs (a credit a hull point), missiles (30), five parts
  (each bought once, kept, fitted free into a hull's module slots: cargo pod +2 slots −5% speed;
  armour +25% hull −6% turn; tractor twice the scoop; focused laser +50% cutting; heat sink +35%
  cooling −15% shield; each also costs resources), and twelve paints (body or markings).

## 12. Factions and territory

### Factions

Two factions, identical in strength, at war over everything between their home systems.
Renamed on 2026-11-19 (they were the Charter and the Drift); the lore is `docs/factions-and-races.md`.

| Faction      | Colour | Mark     | Flavour                                           |
| ------------ | ------ | -------- | ------------------------------------------------- |
| The Nomarchy | Gold   | Triangle | Every world by its lot. Proud, fond of paperwork. |
| The Anarchoi | Violet | Diamond  | Every world by its flag. Loud, quick to borrow.   |

Each has a distinct shape as well as a colour, so they can be told apart without relying on
colour vision.

### Identity

Faction identity is a main attraction, not a colour swap. Choosing a side should feel like
choosing who you are, and the choice is permanent for a pilot.

- **Races.** Each faction has three playable races of its own (six in total), cosmetic only,
  all original, each with its own pixel
  art for the portrait and the in-world sprite. No race appears in two factions.
- **Look.** Each faction has its own station architecture, base buildings and interface
  trim, so a player can tell whose territory they are in at a glance. Ships are not
  faction-styled: both sides fly the same hulls in the players' own colours.
- **Voice.** Its own naming style for worlds and pilots, its own ranks and titles, and its
  own musical theme.
- **Home.** A home system whose worlds and capital reflect the faction.

Factions stay equal in strength. The differences are in identity, never in power.

Draft concepts for both factions and all six races are in
[factions-and-races.md](./factions-and-races.md).

### Joining

You choose a faction in onboarding. The picker shows live pilot counts and nudges toward the
smaller faction with a joining bonus.

### Territory

Each habitable world has **influence** per faction. The faction with the most holds it.

- Influence comes from signed events: planting a flag at the capture site, delivering
  resources to the base, kills on or above the world.
- Events older than 7 days stop counting, so territory must be kept, and a quiet faction
  fades.
- Each pilot can add only so much influence per world per day. This limits how far one player
  (or one cheater) can swing the map.
- Only worlds on the front line can be contested: those in a system joined by a lane to
  territory you hold. This focuses the fighting.
- The faction holding fewer worlds earns influence faster. With only two sides, this is what
  stops the stronger one from winning the map for good.

Holding a world gives your faction: a friendly base to land, bank and respawn at, turrets on
your side, and better prices there. Since the polish pass it also moves the side's computer patrols
(section 8): they fly in the systems it holds a world in and those next to them, and the front line where
both sides' patrols meet moves as worlds change hands.

The territory state is computed by every player from the same set of events with the same
rule, so no server is needed to agree on it. See
[Multiplayer architecture](#18-multiplayer-architecture).

### Built in Phase 7

The rule is `galaxy/territory.ts galaxyState(events, now)`, a pure function of the set of events
(each event once; taken in order of time, then id), with its numbers in `data/territory.ts`:

- **Influence:** a flag 30, a delivery a quarter of a point a unit banked at a base on the world (20
  at most), a rival pilot downed on or over it 10, a raider 2. Each counts for seven days, then not at
  all. Each pilot adds at most 60 points (before the underdog's pace) to one world in one UTC day.
- **Holding:** the side with more influence holds a world once it has at least 20; a tie is nobody's.
  A side's capital world is always its own. Its other home worlds carry a standing 40 for their side,
  so an enemy must out-plant that.
- **The front:** a side's deed counts only on a world in its home system, in a system holding one of
  its worlds, or in a system joined by a lane to such a system (worked out at the moment of the deed,
  so the front moves as worlds are taken). A capital cannot be contested.
- **The underdog:** a side holding fewer worlds earns 10% more a world it is behind, up to double.
- **Checks:** an event more than 10 minutes in the future is rejected; a pilot's side is the one his
  first event says (later events claiming the other are rejected); a world's name must be one the
  rule offers that pilot (below). The signature is checked when an event is let into the set.
- The replay starts two weeks back (older deeds cannot count, and the front they made has faded).

What holding gives (`sim/traces.ts ownerOf`): every base on a world that is not a capital belongs to
the world's holder, so it is friendly to his side (land, bank, respawn), its turrets fight for his
side (made again when the holder changes), its flag flies his colour, and its market pays his side a
tenth more for what they sell (`Game.svelte pricesHere`). Nobody holding it, bases are as stamped.

**The capture site** is the mast of each habitable world's outpost (its last base), on the open ground
beside the pad; capitals have none. On foot within 26 px of it, held Use (2.5 s, a bar under the
prompt) plants the pilot's flag in a ring round the mast; OFF YOUR FRONT says when his side cannot
reach the world. Flags are the image model's pictures: each side's banner in its colour with its mark.

Tested by feeding a busy week of events (600, six pilots, every kind) in shuffled orders with
repeats and getting the same state (`galaxy/territory.spec.ts`), and end to end with real scenes over
relays in memory (`net/persistent.spec.ts`).

## 13. Traces

Marks that players leave for others to find. They make a quiet planet feel inhabited, and
they suit the signed-event model well: small, infrequent and public.

| Trace          | Created when                         | Others see                                 | Lasts     |
| -------------- | ------------------------------------ | ------------------------------------------ | --------- |
| Discovery name | First pilot lands on a world         | The name and the pilot, on the map         | Permanent |
| Flag           | A pilot plants one at a capture site | Faction colour on the world and the map    | 7 days    |
| Wreck          | A ship is destroyed                  | Wreckage with a little salvage             | 3 days    |
| Beacon         | A pilot plants one                   | A short message chosen from preset phrases | 14 days   |
| Grave marker   | A pilot dies on foot                 | A small marker with the callsign           | 3 days    |
| Ghost          | A pilot records a flight             | A translucent ship to race or shoot at     | 14 days   |

Beacons use preset phrases, not free text, so they cannot be used for abuse.

Built in Phase 7 (`sim/traces.ts`, drawn by `render/traces.ts`, art from `tools/gen/traces.py` →
`tools/voxel/traces.py` → `traces/art.ts`; after `art/mockups/traces.png` and `flag-planted.png`).
Each lasts as the table says (`TRACE_LIFE`); the page hands the scene the ones on its world, leaving
out those of pilots the player has blocked.

- **Discovery names:** the first to land on any world but a capital is offered four names in his
  side's voice, made from his key and the world (`discoveryNames`), never free text; the rule accepts
  only those, and the earliest wins for good. The name is on the maps, the world card (with NAMED BY),
  the arrival banner, and it is a feat.
- **Flags:** planted at the capture site (above), standing in the ring with their banner rippling;
  their planter's callsign shows when near.
- **Wrecks:** where a pilot's ship was lost on a world, a scorched broken hull with a thread of smoke
  for its first day. Another pilot on foot strips it once with Use for 6 salvage (`SALVAGE THE WRECK`).
- **Beacons:** planted on foot with View (the Beacon button), which opens a wheel of twelve phrases
  (`BEACON_PHRASES`); a post with its side's light. Read (BEACON · CALLSIGN and its words) by a pilot
  within 70 px, on foot or flying low.
- **Grave markers:** where a pilot died on foot, a stone with his helmet; RIP CALLSIGN close by.
- **Ghosts:** the menu's Record a ghost samples the next 24 s of flight (5 a second; REC on the HUD);
  others see it fly its run on the shared clock, over and over with a rest between, as a pale
  see-through ship. A shot scatters it until its next run.

## 14. Progression

Always-on PvP means veterans must not become unbeatable.

- **Sidegrades, not upgrades.** The total spread between a new pilot's ship and a veteran's
  stays within about 25 percent on any stat.
- **Credits** buy hulls, weapons, modules and cosmetics.
- **Rank** comes from contribution to your faction and shows as a badge. It unlocks
  cosmetics and titles, never power.
- **Feats** unlock cosmetics that cannot be bought: naming a world, a ten-kill streak,
  surviving a black hole run, banking a full Hauler.
- **Daily tasks**, derived from the seed and the date like hotspots: mine at a hotspot,
  down a rival pilot, plant a flag.

Built in Phase 7 (`galaxy/daily.ts`, `save/progress.ts`, after `art/mockups/faction-board.png`):

- **Rank:** six steps a side (factions-and-races.md) at 0, 40, 150, 400, 1000 and 2500 points of
  influence his events counted for (all told, kept in his save). A badge for each (the image model's,
  `static/badges/`) and a title; on the faction board, the pilots-nearby list and his card in a room.
- **Feats:** naming a world, ten kills in a row, coming out of a black hole run alive, banking 120
  units at once. Each unlocks a paint that cannot be bought (Gold leaf, Bloodline, Horizon, Hauler
  green), in the base's paint booth.
- **Daily tasks:** three a UTC day, the same for everyone: mine 20 to 40 units at a hotspot; down a
  rival pilot or 4 to 8 raiders; and plant a flag, plant a beacon, bank 60 units or land on a named
  hotspot world. Each pays once (60 to 240 credits), kept in the property log.

## 15. Onboarding and the first session

There are no accounts, passwords or emails.

### The wing link (2026-11-19)

A browser tab with no install and no account is the game's one unfair advantage, and the wing link is how it is used:
an address a pilot sends to a friend, who is flying beside him a few seconds after opening it (James, of three ideas
for the game to spread: "Do 3").

- **Made** from the menu (Invite) or the squad panel (`WingPanel.svelte`): the page's own address with `?wing=` in it
  (`net/wing.ts`): the start of the sender's key (to know him by among the pilots of a room), his zone, his side and
  his callsign. How the game goes online stays in it (the relays, a private room, `?net=local`); nothing in it is
  secret, and nothing in it is trusted for more than where to go and whom to look for.
- **Opened by someone new:** he is asked for a callsign and nothing else. His side is the sender's, a look is made for
  him (the menu's Your pilot changes it), the opening story is not shown and the first sortie is left; he begins in the
  sender's zone.
- **Opened by a pilot of that side:** he goes to the sender's zone. One of the other side is told whose side the
  sender flies for, and flies on as he was.
- **Arriving** (`Game.svelte wingLook`): once the sender is in his room, the newcomer is put flying on his wing, a
  little behind and to the right, heading as he heads, his power on, with five seconds' protection
  (`Scene.flyBeside`), and asks to fly with him; the sender, for half an hour after making a link, takes on those of
  his side who ask, so the two are a squad. If the relays say the sender has moved on, the newcomer goes there; after
  45 seconds without him he is told so and flies where he is. The wing then comes out of the address, so a reload is
  not another arrival.

In a browser, two tabs over `?net=local`: a new pilot was on the sender's wing, in his squad, 2.5 seconds after opening
the link (`node tools/wing-link.mjs out/ <url>`; pictures `docs/art/gen/wing-link-callsign.png`,
`wing-link-arrived.png`). Not done: a reward for either; a say for the sender in who comes (anyone with the link and
his side); the link going stale as he moves on when the relays are down.

1. **Title.** One button: Play.
2. **Callsign.** Type a name. A key pair is created silently in the background.
3. **Faction.** Two cards: mark, colour, one line of flavour, live pilot count.
4. **Pilot.** The character creator, with Randomise.
5. **First sortie**, guided by short prompts and skippable:
   1. Launch from your faction capital.
   2. Fly to the nearest planet and descend.
   3. Shoot three training drones.
   4. Mine an outcrop.
   5. Land on the pad, get out, plant a beacon, get back in.
   6. Return and bank.
6. **You are free.** The galaxy map opens with today's hotspots marked.

The whole sequence should take 3 to 5 minutes and uses the home system, where turrets make
ganking a new player costly.

After the first session the game asks the player to **back up their pilot key** (download a
file or copy a phrase). Without accounts, clearing browser data would otherwise lose the
pilot for good.

Returning players go straight from the title to their hangar.

Built in Phase 5: step 4, the pilot creator (section 10). A pilot from before it is given a look
of his side's races, made from his key.

Built in Phase 2 (`src/lib/components/Onboarding.svelte`, looking as `art/mockups/title.png`
and `faction.png`): the title with Play and "Restore a pilot from a file", the callsign (3 to 12
capitals, figures and hyphens: what the pixel font draws), and the two sides' cards (mark,
colour, flavour, mood), over the game flying itself at night. The key pair is made when the
save is, on first run. A returning pilot goes straight into the sky (there is no hangar yet).
Not yet: the live pilot count on the cards (it needs presence, Phase 7), the pilot creator, the
guided first sortie, and the prompt to back up the key (the file export exists, in the menu).

Built in Phase 7: the sides' cards say how many of each side are flying now (their presence on the
relays; a dash while none has answered), and the side with fewer offers 250 credits to join it,
paid when chosen. A new pilot starts at his own side's capital (the Anarchoi's at its own, no longer at
the Nomarchy's island world).

Built in Phase 9 (`lib/tutorial/`, `TutorialPrompt.svelte`, after `art/mockups/tutorial-2.png`):

- **Where he starts:** a new pilot is docked at his side's capital station (Meridian Ring, the Raft) in
  his home system's space, the first sortie ahead of him.
- **The first sortie** (`tutorial/tutorial.ts`), one short prompt at a time in a small box under the top
  row, each teaching one control on the device in use (keys and mouse as bound, a controller's buttons,
  the touch buttons), each waiting for him to do it: **launch** (Use held), **look**, **throttle** (closed, then opened again: its keys, the wheel, a controller's right stick; added 2026-11-19, James: "the intro sortie/tutorial needs to explain Q and E and throttle up and down controls"), **steer** to the capital world
  (the course's arrow is set for him), **descend** (Use held over it), **dive** low (the dive control;
  under 90 px, where the laser reaches and the ore is scooped), **target** (three training drones put
  up ahead, one of them picked with the target key: T, D-pad left, the touch Target button; added 2026-11-19, James: "we
  also need a section about TARGETING with T"), **drones** (the three shot down: the guns), **mine** (the guide's mark on the nearest outcrop, then on the chunks to scoop),
  **land** on the nearest outpost's pad (or anywhere the HUD says LAND), **out** (Use tapped), **beacon**
  (the view button, then its words), **board** (Use by the ship), **bank** (HOME, landing at one of his
  side's bases); then the galaxy map opens on today's hotspots with a line saying so, and he is free. A
  row of pips says how far along he is; Skip and End are on the box (and in the menu, for the keys).
- **Never trapped:** wherever he finds himself the step that fits takes over (down on a world early:
  diving; back in space: launching or steering; landed when flying is wanted: take off), and a line with
  a dashed edge and a "!" says how to get back on when shot down (steer for land; call a ship; walk back
  to it), killed, or inside. The step is kept in the save; a reload goes on from it.
- **Part of the page:** it works through the scene's ordinary API (`setCourse`, `setGuide`, `addShip`).
  The guide's mark (`Scene.setGuide`, `sim/guide.ts`) is only drawn: brackets on a point or a ship, an
  arrow at the frame's edge with its name and distance. The training drones are ships with `drill` set:
  this game's alone (never told to the room), circling the spot they were put at, never firing, downed
  in four hits (`DRILL` in `data/skirmish.ts`, painted target white and orange), scoring but paying
  nothing and no deed; turrets leave them be. A pilot in the first sortie is in his home system for
  real, where (Phase 9) no raiders come at a pilot of that side.
- **Tips** (`tutorial/tips.ts`): once the first sortie is behind him, one line the first time each comes
  up (the cruise drive, a gate, landed at a base: the hangar, the deck's shop, a capture mast's flag, a
  pilot of his side in the room: squads, a missile lock, a missile coming: the roll, a first part he can
  afford with its ore), in the same box marked TIP; the save keeps which were shown.
- **The stranger test:** `tutorial.spec.ts` flies it with a scripted player who reads only the prompt's
  words and does what they say with the key they name (both sides; and shot down half way). In a
  browser, `tools/first-session.mjs` plays it from a fresh save through the page's keys, mouse, touch
  buttons and a finger: about 70 s for the bot on a laptop and on a phone, every step reached.
- **Keeping the pilot** (`save/backup.ts`, `BackupPrompt.svelte` after `art/mockups/backup.png`): his
  key as a phrase (NIP-19 `nsec1…`, hidden until shown, copied with a button), a pilot file, and a sealed
  copy of the save on the relays (AES-GCM under a key worked out from his secret key, kind 30078 with a
  `d` tag of the namespace: the relays see only whose it is). Asked once he has flown five minutes after
  the first sortie and is landed, docked or inside; asked again every 25 minutes of play until he has
  kept it one way or another; the menu says whether he has. Keeping it asks the browser to keep the site's
  data (`navigator.storage.persist`). The title's **Restore** takes the file or the phrase: the phrase
  looks on the relays for his sealed copy for a few seconds, and without one keeps the key and asks for a
  callsign and side again (what he did with the key stays his).

Built after James's first play (2026-11-18: "we need a way better intro for new players"): **the opening
story** (`components/IntroCrawl.svelte`, after `art/mockups/intro-crawl.png`), shown once before the title to a
new pilot (`Save.intro`, kept as soon as it ends or is skipped; a save from before it with a pilot has seen it)
and again from the title's **Story** or the menu's Story tile. A line in the dark ("Between a gold sun and a red
one lie forty worlds."), the name lit a letter at a time (XENOPHON in the ink, TWIN in the Anarchoi's violet, STARS in the Nomarchy's gold),
then the story, about 150 words, over deep space. James found the first one "so AI driven its completely obvious", and
the second (2026-11-18, Lemuel Gant's bill of sale and the graves on Lidel) lore with no context; the third
(2026-11-19) is told as a film serial's opening crawl is: what is happening now (the war flared again over Drassel),
what it means for a pilot (ore spilt when shot down, nobody's until banked; worlds go by the flags on their outpost
masts), who is hiring (the Nomarchy on the Meridian Ring, the Anarchoi on the Raft), and a pilot in a cold ship at the dock,
where the first sortie begins. Since the rename of 2026-11-19 Gant is gone: the worlds were shared out by lot (`docs/factions-and-races.md`). The words are a column of paragraphs, flat, in the pixel font at the interface's heading size
(`ui-head`): the paragraph being read is held still in the middle of the screen, and in the breath before the next the
column glides up to it, the one read dimming and those above fading out. (They first rolled away in perspective,
drawn row by row into a canvas; James found that unreadable, 2026-11-18.) The sky is the image model's (`static/ui/intro-sky.png`,
`intro-stars.png`, `intro-stars-far.png` from `tools/gen/interface.py intro` and `tools/voxel/interface.py`),
panning from the gold sun to the red one with two fields of stars drifting faster in front, read aloud by the
narrator (section 17, "The narrator"), each paragraph brought up as he begins it. About 90 seconds;
nothing skips it for its first 12 seconds (`T.skipFrom`: the first click or key is what lets the sound on, and must
not also end it), then the Skip button comes, and Skip, Escape, Enter, Space, a tap, or a controller's Cross,
Circle, Options or Share end it; the title's music plays under it once sound is on. With Reduce motion it is a still
page with Continue. `?intro=off`, and `?tutorial=off`, leave it out for the tools. Pictures:
`docs/art/gen/intro-crawl-*.png`.

## 16. UI

### Style

- One pixel font, drawn on the same pixel grid as the game.
- The in-flight HUD is drawn at art-pixel size on a layer over the picture, so it matches
  the game's pixels.
- Menus are ordinary Svelte components styled with hard edges and the pixel font. They are
  faster to build and work with keyboard, controller and screen readers.
- Faction colour is the accent everywhere.

Built in Phase 2: the HUD's glyphs are built into a TrueType font for the menus
(`tools/font/build_font.py` → `static/fonts/xenophon-pixel.ttf`), set at multiples of 7 CSS
px so that every font pixel is whole screen pixels; all the page's buttons use it.

### Screens

| Screen            | Purpose                                                           |
| ----------------- | ----------------------------------------------------------------- |
| Title             | Play, settings, restore a pilot from backup                       |
| Onboarding        | Callsign, faction, pilot creator                                  |
| Flight HUD        | See below                                                         |
| On-foot HUD       | Health, tool, backpack, interact prompt, direction to your ship   |
| Galaxy map        | Systems, lanes, faction colours, hotspots, pilot counts, bounties |
| System map        | Bodies, stations, gates, your position, course plotting           |
| World card        | Name, discoverer, archetype, holder, influence bars, resources    |
| Hangar            | Ship on show, loadout bench, paint booth, vault                   |
| Inventory         | Cargo, backpack and vault side by side, move items between them   |
| Shop              | Buy and sell, with today's prices                                 |
| Pilot sheet       | Portrait, rank, feats, statistics, gear                           |
| Faction board     | Territory summary, daily tasks, top contributors                  |
| Pilots nearby     | Who is in the zone, with faction, squad invites, mute             |
| Chat              | Zone chat, squad chat, quick-chat wheel                           |
| Death and respawn | What killed you, what you lost, where to respawn                  |
| Settings          | Controls, audio, picture, key backup, relays                      |
| Connection status | Peers connected, peers that failed, relay health                  |

Built in Phase 2: the title and onboarding; the menu (Escape, Options or the Menu button), which
holds the connection status (pilots here with their round trip, who flies the raiders, those
connecting, those that could not connect, each relay up or down, and the totals measured on
this device, with a button to copy the log) and the pilot file (save and load); a badge at the
top of the flight screen with the number of pilots and the relays' state; a screen for a pilot
already flying in another tab (fly here instead, or fly a second pilot).

Built in Phase 4: the base's screen (`BaseScreen.svelte`, after `art/mockups/inventory.png`
and `shop.png`): the hold and the vault side by side (tap a stack to move it), the market, the
supplies, parts and paint, each a row of plain buttons, with the credits and the base's mark at
the top. It opens with Tab, the Bag button, the D-pad's up, or the base's name in the row at the
top of the screen while landed at a friendly one; in flight it shows only the hold and the
vault. A controller works it (`input/padnav.ts`: the D-pad or stick moves the focus, Cross
presses, Circle closes) and meanwhile does not fly the ship.

Built in Phase 5: the on-foot HUD (`render/foothud.ts`, after `art/mockups/onfoot-hud.png`):
health pips where the hull's bar is (amber, then red and blinking), HIDDEN or WADING by them, the
backpack's slots where the hold's are, flares bottom right, what Use would do under the middle
([F] CLIMB IN, [F] STEAL IT, HOLD [F] CUT THE VEIN, HOLD [F] CALL A SHIP, with a bar while held),
his parked ship's way and distance when it is off the frame, SHIP IN 23 while one comes, a cross
where the sidearm aims and brackets on the enemy it is turned onto, STEER FOR LAND while coming
down, KILLED or DROWNED and the base he will be back at. The radar on foot covers 320 px and shows
his ship, the veins, beacons and flares. In flight, landed in the loop, the prompt is [F] GET OUT
HOLD [F] TAKE OFF. The player's portrait (16 × 16) sits top left; the kill feed shows heads.

Built in Phase 6, in space (`render/spacehud.ts`): what Use would do (HOLD [F] DOCK, UNDOCK,
DESCEND, JUMP TO, THREAD THE RING, SKIM GAS, MINE, with a bar while a gate charges), or the
cruise drive's key and state ([V] CRUISE, SPOOLING, [V] DROP OUT) and its pace by the speed; a
course marker (an arrow at the frame's edge with the body's name, its distance and the seconds
to it at cruise; brackets round it once in view); the names of stations and gates over them, and
their blips on the radar (the course's held at the radar's edge); HEAT, CRUSHING, GRAVITY or
EVENT HORIZON; the system's name, star and whose home it is, on arrival. No height is shown.

Built in Phase 6: the maps (`MapScreen.svelte`, after `art/mockups/map-system.png` and
`map-galaxy.png`), on the map action (M, the touchpad or Select, the Map button): the **system**
(its bodies where they are now, the orbits, belts dotted, stations as squares in their owner's
colour, gates as rings named for where they lead, the pilot as an arrow, the course dashed),
the **galaxy** (the twelve systems in their star's colour on their lanes, the black hole shortcut
dashed, the homes marked with their side's triangle or diamond, where the pilot is, a route
highlighted), and the **world card** for what is picked (name, kind, whose, its resources with
icons, its sun, gravity, air and weather, or what a giant, belt, black hole, gate or station is
for) with Plot course (in this system) or Plot route (the fewest jumps to another; the course is
set to the way on in each system as the ship arrives). Labels that would overlap are left out.
The menu now says where the pilot is and opens the maps; its list of worlds to travel to is gone.

**2026-11-19, the maps in three dimensions** (James: "a better more interactive more pixel-appeared map (M) that is 3d
pannable scrollable zoomable"; mockups `art/mockups/map3d-galaxy-*.png`, `map3d-system-*.png`; picture
`docs/art/gen/starmap.png`). Both maps are drawn in the game's own pixels (about 3 CSS px an art pixel, 2 on a short
map) by `src/lib/maps/starmap.ts`, which knows no page and draws in Node too (`npx jiti tools/starmap-shots.ts`), and
are flown by `components/StarMap.svelte`. The **galaxy** is a disc of dust in two arms with a grid of rings and
spokes; each system a twinkling star on a stalk over the plane (its height from its index), standing on a ring in its
home's colour, its worlds as pips, its danger's chevrons and the front's red ring as before. A **system** shows its
orbits in perspective, belts as their rocks going round, every world, moon and giant as a globe of its own map (the
maps space draws them from, `render/space.ts sphereMapOf`; on the page a world's is built in the worker when first
shown, a plain one until then), lit from its sun and over the plane and turning; the sun from its surface's picture
in banded halos; a black hole's disc lying in the plane, its far half behind it. The camera looks at a point of the
plane from a yaw, a pitch and a distance: drag moves over the plane (the point under the pointer stays under it), the
right button or Shift turns and tilts, the wheel or a pinch zooms about the pointer, two fingers twist; W A S D, Q E,
R F, + and −, H back to where he is; a controller's right stick and triggers; buttons for turn, flat or tilted, in,
out and Here. A click picks (and brings a thing near the edge in), a double click goes into a system from the galaxy
(flying in) or close to a body. Every mark drawn is an unseen button over the picture, so the keys, a controller
(padnav) and the tooltips work as before. The turn and tilt are kept between openings.

Built in Phase 7 (after `art/mockups/map-territory.png`, `faction-board.png`, `chat.png`,
`pilots-nearby.png`):

- **The maps:** each habitable world ringed in its holder's colour (dashed, nobody's), named as its
  discoverer named it; hotspots starred; on the galaxy map each system's worlds as pips in their
  holders' colours, the pilots there now by side (their presence), and a bounty's callsign and price;
  a world's card with each side's influence as a bar, who holds it, who named it, whether the pilot's
  side can contest it, whether its ore is rich today, and the pilots there; a system's card counts
  what each side holds.
- **The faction board** (menu): worlds held as one bar split between the sides, the pilot's badge,
  title and contribution, his streak and feats, the day's tasks and how far each has come, the
  hotspots, and each side's top five this week.
- **Chat** (Enter, the D-pad's right, the Chat button): the last lines over the sky for 14 s; opened,
  a line to type (60 characters, what the pixel font draws), the quick-chat wheel of eight phrases,
  and the lines said lately. Alone, what he says is heard by him only. (Rebuilt after James's first play:
  below.)
- **Pilots nearby** (menu): those in the room, with portraits, then those whose presence says they
  are in the zone; side, rank badge and title, bounty, idle; Mute (chat) and Block (chat and traces),
  kept in the save by key.
- **The wheel** (`QuickWheel.svelte`): preset phrases round a middle that closes it; a tap, a click,
  the number keys or a controller pick one. Quick chat and a beacon's words use it.
- **Naming a world** on landing first; toasts for a feat or credits earned; the menu's Record a ghost,
  and the relays the events are kept on (each up or down, events taken and refused) with the list.

Built in Phase 8 (UI): the hangar's bench and booth, the deck's shop (ships, gear, furniture), Furnish
aboard, the pilot sheet and the squad (menu), all `Panel.svelte` screens of buttons (touch, keys, a
controller); inside, touch shows a stick, Action, Run, Bag, Chat and Menu, and the help line says
how to use what one stands by.

Built in Phase 9: **Settings** (`SettingsScreen.svelte`, after `art/mockups/settings-2.png`; from the
title and the menu): Controls (every key and controller button, changed by pressing the new one, a key
taken from another action said so; guns and thrusters held or switched; up and down as a flight stick or
not; back to the defaults), Sound (effects and music, in tenths, as blocks with a number), Picture (the
art pixel's size, flames smooth or in pixels, camera shake full, half or none, the menus' text normal,
large or larger: 14 → 21 → 28 px on the pixel grid), Your key (the phrase, a file, the sealed copy, when
last kept), Relays (moved from the menu). The menu has Settings, the first sortie's Skip and End, whether
the pilot is kept safe, and the build's version (`version.ts`). Every panel answers the arrow keys
(`padnav.ts arrows`) as a controller's D-pad, focus shown; Escape closes. An old build says so: a banner
when the site has a newer one (SvelteKit's `updated`, looked for every ten minutes and when the tab comes
back) or a pilot's presence says he speaks a newer wire (`Chronicle.newerProtocol`), with Reload (the
pilot saved first) and Later.

Built in the polish pass (item 2, with item 10's art; `docs/polish-pass.md` has the counts and times): the
same style, made with care. One type scale on the font's grid (label and body 21 px, head 28, title 42; nothing
read is smaller; Text size raises it a step or two), one set of components in `routes/layout.css` (panel with
its side's trim, button, main, quiet, tab, row, well, meter, key cap, input, with one set of states) and their
Svelte parts (`Panel`, `Tabs`, `Count`, `UiIcon`, `Emblem`); every screen rebuilt on them with what it is for
in front and the rest a tab or a tooltip away. One tooltip for the page (`tooltip.svelte.ts`: hover, a focus
moved by the keys or a controller, a long press; figures green or red against what he has). Motion that
explains, under a quarter of a second for most, and a Reduce motion setting (and the device's wish). The art
in it is the image model's: each side's emblem (three true sizes) and home, the interface's and the items'
icons, each hull's picture, the furniture's (`tools/gen/interface.py`, `tools/voxel/interface.py`,
`tools/item-icons.ts`). The touch buttons are icons, each named the first time it is pressed; the help line is
key caps with a word each. `tools/phone-check.mjs` walks every screen at phone and laptop size and fails text
under 21 px.

Built after James's first play (2026-11-18: "a far better social and chat system - chat should be in a left
transparent area showing messages and history"; after `art/mockups/chat.png`, closed, and `chat-open.png`):

- **The chat is a column down the left of the view, over it, with no box** (`ChatPanel.svelte`). Each line is the
  pixel font with a hard dark outline a font pixel wide on a soft dark that fades out to the right, so it reads over a
  bright sky and over black space. Closed, the latest six lines (three on a short screen) show for 16 s, the last 3 s
  fading, the topmost fading into the view; opened (Enter, the Chat button, the controller's chat button), the whole
  history (the last 120 lines) scrolls over a stronger dark, with tabs **All, Side, Squad, News**, the line to type at
  the bottom (Tab moves along the channels; its frame in the channel's colour), Send and Quick chat. A line is its
  channel's tag (SIDE in the side's colour, SQUAD green), the speaker's side emblem and callsign in his side's colour,
  then the words; a callsign, opened, offers Mute or Unmute and Block. The channel chosen is where a line or a quick
  phrase goes: the room, the pilots of his side there, his squad (only those are sent it: `Session.say(text, to)`,
  `sayQuick(n, to)`, the events' `to`). The Squad tab works only in a squad.
- **News** is said by nobody: a pilot come into the room or gone (`IS HERE`, `LEFT`), one downed or crashed (the kill
  feed's lines, kept), and the page's own: a world taken or lost (from the galaxy's state), a pilot joining or leaving
  his squad. Alone, his own lines and the news still show.
- **Its place** keeps clear of the HUD (Game.svelte `chatPlace`, from FighterJetScene's `onHud`: the art pixel, the HUD
  kept to the top, touch, the cockpit): below the portrait (and, where the HUD keeps to the top, the bars, the hold and
  the drive under it), above the bars and the hold bottom left, the touch buttons' left column, or the cockpit's panel.
  Opened on a touch screen it runs to the bottom, over the left thumb's buttons (he is typing). Tips and the first
  sortie's prompt wait while it is open. A controller works its tabs and buttons (padnav).
- **The line of help** (`HintBar.svelte`) always sits at the very bottom of the view, between the HUD's bottom corners
  or the touch buttons' columns (across the top in the cockpit it had covered a world's name).
- **Portraits** have no backing of their side's colour: on the page nothing is behind the face (`pilotArt.ts
portraitImage`), in the HUD one night blue for both sides (`render/hud.ts FACE_BACK`); the Anarchoi's card is a dark
  violet night, no longer brown (`FACTIONS.drift.dark`, `--color-anarchoi-card`). The page's accent is the pilot's side's
  colour again (`[data-side]` in layout.css: it had stayed the Nomarchy's gold for the Anarchoi).

### Flight HUD

Hull and shield, heat, speed and height, weapon and ammunition, cargo fill, target marker
with lead indicator, arrows to off-screen ships, radar, zone name and holder, kill feed,
squad list, prompts (Land, Descend, Dock, Jump).

Built in Phase 1 (`src/lib/engine/render/hud.ts`, with its pixel font in `render/font.ts`),
drawn in the frame's own pixels after everything else: the wave, ships left, score and kill
chain top left; a radar top right, turned as the frame is; shield and hull, speed and height
bottom left; missiles and the guns' heat (in a corner bracket) bottom right; brackets on the
target that close in as a missile locks, its hull, the lead point, a chevron when it is well
above or below; arrows at the frame's edge to ships off it; points rising from a kill; and in
the middle a wave's arrival, LOCK WARNING, MISSILE and ROLL!, and the end of a skirmish. On a
touch screen, and in the cockpit, it keeps to the top (`hudTop`); in the cockpit the panel's
own radar stands in, with enemies in red. Cargo, zone, squad and prompts come with their
phases. Phase 2 added the kill feed (top middle: mark, callsign, `>`, mark, callsign) and over
every other pilot's ship his faction mark (a triangle or a diamond) and callsign, red for a foe,
with IDLE when his tab is hidden; and, in a shared sky, no "ships left" (there is no last ship).
Since the polish pass the wave, ships left, score, a wave's arrival and the end of a skirmish show only
in the old skirmish (no side, the island world); in the galaxy a world's or a system's name on arriving
has a line of its danger for the pilot in its colour (SAFE; DANGER LOW · RAIDERS; DANGER MEDIUM · THE
FRONT; DANGER HIGH · ENEMY HOME), the news says AMBUSH, DRONES or PATROL when a band comes for him and
RAIDERS BEATEN or DERELICT CLEARED (BACK IN n MIN), a patrol carries its side's mark over it, raiders
lying in wait show on the radar and the arrows only within 230 px, and haulers are dim dots on the
radar.

Built in Phase 4: the hold's slots in little wells above the shield bar (filled in each ore's
colours); under the middle, what Land would do (HOLD [F] LAND, LAND AND BANK, MINE, TAKE OFF,
with the key the device in use calls it, and a bar while take-off is held); while carrying, an
arrow to the nearest friendly base with HOME and the distance; the bases' names over them (the
side's colour, red for an enemy's); on the radar, ore with something left in it, bases (green
friendly, red not) and crates; news in the middle (BANKED and what, CARGO LOST, CRATE, MINED
OUT, HOLD FULL); credits under a kill's points.

Since the polish pass (item 2) the HUD shows what matters now and nothing else: no speed; the height only
above 120 px; missiles and mines while there are some, or in a fight; the guns' heat while they are warm; the
hold while it is carried, mined or banked. Its text is twice the size where the page asks (`hudScale`: an art
pixel under 3 CSS px, or larger text chosen), not with the camera pulled in; its spacing follows the text's
height (`font.ts setTextUnit`). It moves by the scene's own clock (`sim/hudfx.ts`, so the frames stay pinned):
the part of a bar just lost drains away, the bars jolt when hit, a new prompt rises in, news rises, a world's
name types itself out; `hudMotion` false (Reduce motion) keeps it still.

### Controls

These bindings are in place (Phase 0, `src/lib/input/`). Every device produces the same
named actions. Fire and secondary act since Phase 1 (guns, and a missile once locked), menu
since Phase 2 (the menu); use, map, inventory and chat arrive (in the scene's controls, or at
the page) but do nothing yet. The touch screen has Fire, Missile, Boost, Roll, Action, View,
Ship and Menu buttons; Map, Bag and Chat buttons come with the features they open. On a
controller the D-pad does not steer: up and right are taken.

Since 2026-11-19 the keys and the mouse are Elite Dangerous's flight layout (James: "build it to mirror elite dangerous
control scheme"; the review is `docs/controls-review.md`). The touch column is of how it was.

| Action           | Mouse and keys                              | Controller  | Touch                 |
| ---------------- | ------------------------------------------- | ----------- | --------------------- |
| Pitch and turn   | The mouse, a stick (a ring for its middle)  | Left stick  | Touch and drag        |
| Pitch            | Up and down arrows                          | Left stick  |                       |
| Thrust up, down  | Alt, Ctrl (straight up and down)            |             |                       |
| Thrust sideways  | Q, E (left and right, the nose not turning) |             |                       |
| Turn             | A and D, left and right arrows              | Left stick  |                       |
| Throttle         | W and S, wheel                              | Right stick | Throttle lever        |
| All stop         | X                                           |             |                       |
| Fire             | Left button                                 | R2          | Fire button           |
| Secondary weapon | Right button                                | Square      | Secondary button      |
| Boost            | Tab (and Shift, which runs on foot)         | L2          | Boost button          |
| Cruise drive     | J                                           | R1          |                       |
| Roll             | Space                                       | Cross       | Swipe, or Roll button |
| Land, board, use | F                                           | Circle      | Action button         |
| Change view      | V                                           | Triangle    | View button           |
| Power on and off | P                                           | D-pad down  | Power button          |
| Map              | M                                           | Touchpad    | Map button            |
| Inventory        | I                                           | D-pad up    | Bag button            |
| Chat             | Enter                                       | D-pad right | Chat button           |
| Menu             | Escape                                      | Options     | Menu button           |
| Clip             | F9                                          |             |                       |

From behind and from the seat the mouse is a stick, as Elite's is: how far it is from the middle of its steering is how
fast the ship turns and, in space, pitches (over a world, how fast it climbs), with a dead zone in the middle
(`MOUSE_STICK` in `data/hulls.ts`); the HUD draws that dead zone as a ring and a line out to the pointer, as Elite's mouse
widget does (`render/hud.ts`). Up climbs unless Settings says Up dives; the arrow keys climb and dive as named whatever
the setting. Alt and Ctrl are the vertical thrusters, as Elite's (James: "Ctrl to thrust down and alt to thrust up"): the
ship goes straight up or down, square to its nose, which does not pitch (`LIFT` in `data/hulls.ts`, `flight.liftV`; over a
world its height moves, with the ship, so its nose does not tip; in space it moves along its own up). Held down all the
way to the floor it lands the ship, as Land does (`landing.ts sinking`, `LAND.sunk`). Q and E are the lateral thrusters
("q and e like thrust left and right"): the ship slides along its own right, its nose not turning (`flight.sideV`). While a bound Ctrl or Alt is held the keys under it are the
game's and the browser's shortcuts are kept from them (`keyboard.ts`); Ctrl+W, which a page cannot stop, asks before the
tab closes (a `beforeunload` while either is held). The ring can be hidden (Settings, Controls: Mouse ring;
`settings.mouseRing`, the scene's `mouseRing`). On foot W and S walk (the throttle keys walk), Shift runs. A save that kept the old keys, as given, takes the
new ones; a key the player chose keeps its own (`readBindings`, `BEFORE_ELITE`). Overhead the pointer still turns the
ship towards it (Elite has no such view).

On foot, the same keys move the pilot, Fire uses the tool or sidearm, and F interacts.
All bindings can be changed in settings.

Built in Phase 5, on foot: steer (WASD, a stick, a finger) walks the way the screen shows; boost
runs; fire is the sidearm (aimed where the mouse points); secondary a flare; roll a dive; use climbs
in, steals, cuts a vein (held) or calls a ship (held); view plants the beacon. On a touch screen
a finger anywhere is a stick (where it comes down is the middle; 40 CSS px is a full push, the last
tenth runs), drawn under the thumb; the buttons are Fire, Dive, Action, Flare, Beacon, Bag and
Menu. A tap of Action, quicker than a frame can see, counts as a press of Use. The help line says
the on-foot controls for the device in use.

After James's first flight (2026-11-18): **the throttle.** The engines' power is the pilot's to set, from a ship hanging
still to its full cruising speed: W and S held move it (`THROTTLE.rate` in `data/hulls.ts`, 0.7 a second), a mouse's wheel
a tenth a notch, a controller's right stick, a lever on a touch screen beside the left thumb's buttons (`TouchButtons`).
Climbing and diving moved from W and S to E and Q (a stick's pull and push: as a flight stick, E climbs) and the arrows;
a save with the old keys gets the new ones (`readBindings`). On foot and inside W and S still walk. (Since 2026-11-19, James:
W and S pitch the nose, W up, as the arrows do, and E and Q are the throttle, E opening it; a save with the layout above,
unchanged, gets the new one. On foot W still walks forward: the keys say how they walk apart from how they pitch,
`HeldControls.walk`, the scene's `keyWalk`.) (Later that day, James: "make UP CLIMBS the default": the mouse and a stick
climb when moved up unless the setting says Up dives (`invertY` false on the page; the engine's own default, for the
scripted flights, is still true). The pitch keys are named by what they do, Up (W, the up arrow) climbing and Down (S, the
down arrow) diving, and the setting does not turn them over: `keyboard.ts` sends their pitch turned over while the scene
turns it back. A save with the old keys as given gets the new names, `readBindings`.) The scene keeps it
(`scene.throttle`, `Scene.throttleBy`, `setThrottle`, `status.throttle`); `sim/flight.ts stepThrust` flies at it (the
thrusters open it all the way and beyond, from a standstill too; the way down and up, a gate and the cruise drive open it
full); stopped, a ship still turns and climbs (`THROTTLE.climb`). The flames burn as hard as it is open. The HUD has a
third bar under the hull's, with THROTTLE and its figure for a moment after it moves, and ALL STOP while still. Not yet:
other players see a stopped ship's flames lit (the wire carries the thrusters, not the throttle). The same day: the
engines' steady sound (a whining, repeating wind to him) and the dark smoke behind every ship were taken out (the
engines made again later that day, section 17's "The engines, made again"), and the
wingtip trails leave from the wingtips themselves (each mesh's `tips`, from its own outermost voxels: the hull files'
`wingtipY` was the top of the whole row, the canopy's height, and the trails hung over the wings).

Also from that flight: **height in space.** Up and down did nothing there (every ship flew level in the plane), so from
the seat the pointer could not pitch the ship. Space now has a band round the plane, 48 px under it to 220 over
(`SPACE_LOW`, `SPACE_HIGH`): the ship climbs and dives in it as over a world (no ground: it keeps the height it was flown
to, and cannot crash), the view pitching with it; computer pilots chase in it; belt rocks are passed over or under; the
way down to a world starts from wherever in it the ship is. Stations, gates, belts and what is strewn stay in the plane.
**The cockpit's throttle:** every cockpit shows the throttle as a lever (a lit slot, its handle where it is set, amber
with the thrusters) and the speed in figures (STOP when still), on its speed screen or, lacking one, its weapons' or its
hull and shield's.

Also after James's first play (2026-11-18): **the ship's power, and the weapons safe on the ground.** "Ships that are landed
or docked should be not able to fire their weapons", and "we should have a power control to ships. They should be defaulted
to powered off, and then when we switch power on they power up (affecting instruments etc)". Decided so (`sim/power.ts`,
numbers `POWER` in `data/hulls.ts`):

- Landed, docked, coming down or lifting off, the weapons are **safe** whatever the power (`sim/fight.ts`): no guns, missiles
  or mines, the sights choose nothing, the guns cool. The trigger (or the missile button) pressed says WEAPONS SAFE in the
  middle of the HUD with a click (`safe`, `no_lock`), once in `POWER.told` (1.4 s) however it is held; GUNS SAFE stands where
  the guns' heat goes, the cockpit's weapons screen says SAFE, and the cockpit's sight is not lit.
- **The power switch** is an action of its own (`power`: P, a controller's D-pad down, the touch screen's Power button in
  the Missile's place while the weapons are safe, the model's icon `static/ui/power.png`; bindable in Settings). Landed or
  docked it switches the power on, or off again (also part way up); in flight it is refused with POWER LOCKED IN FLIGHT and
  a refusal's sound: a ship never loses its power by the switch, and anything flying is powered.
- **Powered off** (`coldStart`, the page's setting: every ship the game sets down for its pilot, where he begins and a new
  one after a loss, `parkOn` and `dockAtNearest`; and every ship its pilot leaves, on foot or inside, and one called to him
  once it is down): the cockpit's screens are dark glass with a red standby light; the HUD shows only POWER OFF where the
  bars are and, under the middle, [P] POWER UP beside [F] GET OUT (docked, [P] POWER UP); no radar, no missiles; the
  engines' glow is cold metal (`render/paint.ts coldPaintOf`); the throttle does nothing. Without `coldStart` (the
  scripted flights' default) a ship is always on unless switched off, so the old flights keep their pictures.
- **Powering up** takes `POWER.up` (2 s): the cockpit's screens wake one after another, each flickering, a bright line
  running down it, then its instrument coming alive (bars filling, the attitude ball spinning up and settling, the radar's
  sweep, blips and the target last); the HUD's bars fill, its radar fades in under one sweep, missiles and heat last;
  POWERING UP over a bar; the engines light at `POWER.glow` of the way. Going down (`POWER.down`, 0.8 s) each screen
  collapses to a line, the last woken first.
- **Taking off with the power off:** Land held (Use held, docked) past its usual hold switches the power on, and the ship
  goes once it is up if Land is still held: a pilot who does not know the switch is never stuck, and the prompt teaches it.
- The page knows it from `status.power` ('off', 'starting', 'on', 'stopping'), `status.powerLevel` and `status.safe`;
  sounds `powerUp` (the cruise drive's spool, for now), `powerDown`, `refused`, `safe`. Not yet: a sound of its own for the
  ship coming alive (another agent was remaking the engines' sounds), other players seeing a ship's power (the wire does
  not carry it), the hangar's ship lit or dark.
- The first sortie begins with it: **power** (Press P to power up your ship), then launch; landed with the power off later,
  its take-off lines say "Press P to power up, then hold F to take off".

### Clips (2026-11-19)

The last seconds of play as a short film, to send to a friend with the wing link (section 15): a thing worth showing
has already happened by the time a pilot thinks to show it, so the game is filmed all the while and the film is cut
off when he asks (`display/clips.ts`). A browser films a canvas as it is drawn but will not cut the end out of a film
still running, so two films run at once, eight seconds apart, each begun again every sixteen: the older of the two
always holds the last eight to sixteen seconds, whole. Each frame is drawn into a canvas of the film's own, about 1280
px across with every art pixel a whole number of its px (the smooth flames over it), over a strip with the game's name
and the pilot's callsign; the game's sound goes in where the mixer has any (`audio/mixer.ts tap`). The film is an mp4
where the browser can make one (it plays wherever it is sent), else a webm.

The `clip` action (X; the touch screen's Clip, under More) cuts it off and shows it (`ClipPanel.svelte`): playing over
and over, with Share (where the device hands a file to whatever he shares with), Save the film, and Copy your wing
link. Clips are on where there is a mouse and off on a touch screen unless turned on (Settings, Picture: the filming is
work a phone feels); the key is said once a session, after the first bounty. `node tools/clip.mjs out/ <url>` takes
one in a browser it starts itself and checks it; pictures `docs/art/gen/clip-panel.png`, `clip-frame.png`.

### Desktop only (2026-11-19)

The game is for a desktop with a mouse and a keyboard (a game controller works too). James: "this game is now purely
intended for desktop mouse and keyboard. If someone is on a narrow device like that just point them to the github and
tell them to get a PC". Anything else (`display/desktop.ts isDesktop`: no mouse or other fine pointer, or a screen under
1,024 px on its long side; `?desktop=yes` lets a tool past) is shown `DesktopOnly.svelte` instead of the game, after
`art/mockups/desktop-only.png`: the opening story's sky, the wordmark, the model's desktop computer
(`static/ui/desktop-24.png`), two lines, and a button to the code on GitHub. Nothing of the game starts behind it.

Taken out: the touch screen's buttons (`TouchButtons.svelte`), steering and walking with a finger (`input/pointer.ts` is
the mouse's alone), the help, prompts, tips and the narrator's lines worded for touch (the `touch` voice of the first
sortie, fifteen lines, and its recordings), the HUD keeping to the top and its prompts between the buttons (the scene's
`hudTop` and `hudSides`; a line too wide for the frame itself is still broken), the clips being off on a touch screen,
the tooltips' long press, the maps' pinch, `?touchControls`, and `tools/phone-check.mjs` and the browser tools' phone
runs. Screens still fit a short or narrow window. The section below is of how it was.

### Touch (as it was, before 2026-11-19)

Phones and tablets were first-class, alongside mouse and keys and controllers.

- Every feature shipped with touch controls: flying, fighting, walking, mining, menus,
  inventory, the maps and the character creator.
- Every screen was laid out for a phone held sideways first, then scaled up.
- On foot, a virtual stick moved the pilot and buttons appeared for what was in reach.
- Menus used large targets and tap-to-move in the inventory, never drag only.

### Accessibility

Remappable controls, shapes as well as colours for factions, a setting to reduce camera
shake, toggle instead of hold for boost and fire, and text size options in menus.

Built in Phase 9: all of these (Settings, above; `shake` is a scene setting, 0..1, that scales the
camera's jolt). Shapes as well as colours: on the radar a foe is a small cross and a friend a square,
another's base a ring filled in; a base's name carries its side's mark; chat lines the speaker's mark; the
maps mark held worlds and their systems' pips with the side's triangle or diamond (a square for nobody);
a choice made in Settings is filled and marked ■, a toggle says On or Off; a relay up is a filled square, a
down one hollow; a prompt about getting back on has a dashed edge and a "!".

Touch, checked in Phase 9 (`tools/phone-check.mjs`, 844 × 390): every screen walked (42) with nothing
running off the screen, covered, or under 24 px tall. Found and fixed while playing the first session on
a phone: a finger on a touch button (Fire, Action) became the steering finger and turned the ship towards
the button (Svelte hands buttons their presses after the scene's own listener: pointer.ts now leaves any
press on a button alone); a finger held still stopped steering after five seconds (the ship took it for a
hand let go: it is told again each frame); overhead, height could not be changed with a finger at all
(Climb and Dive, held, beside the left thumb's buttons in flight overhead; a held climb now works while
a finger steers); the first sortie's box keeps between the side columns of buttons.

## 17. Audio

The engine reports what was heard as plain events (`SoundEvent`: a gun, a hit on a shield or a hull, an
explosion and its size, a footstep and the ground under it, a race's way down opening, lava burning …;
each with how loud and where in the frame) and how the player stands (`status`, `zone`, `foot`); the page
makes the sound. Everything starts silent until the first click or key, as browsers require. A button at
the top of the scene steps the effects' volume (`?volume=`); Settings, Sound, has both volumes.

### Built in the polish pass (item 9): sound and music from real audio

Phase 1's effects and Phase 9's music were synthesised in the browser by agents who could not hear; James,
having played: "Is the sound and music done already? It sucks if so." Both were replaced by audio from
models on this PC (section 7, "The models and their licences"). Nobody on this machine can listen: every
batch goes to James as a sampler, and his ears choose.

- **One recipe** (`tools/gen/sound_recipe.py`): every sound a subject in plain words before one shared
  style, every piece of music likewise, so the set belongs together. Change the style, never one prompt.
- **Effects:** 85, drawn by Stable Audio 3 (the small sound-effects model) through ComfyUI
  (`tools/gen/sounds.py`), four takes each (three of a loop, eight of a footstep or an engine), each cut by its rule:
  one shot (from the first bang to before a second; a crunch never cut under half its length), a tail (an
  explosion's), a swell (a gate charging), or a loop (the steadiest stretch, evened, its end blended into
  its start). The engines (made again: below) for each size of ship (light: Dart, Sparrow, Lance, Wraith;
  medium: Corsair, Nomad, Prospector; heavy: Mule, Bastion, Galleon); the guns, flak, the mining laser,
  the lock, missiles and mines; hits on shield and hull, a shield breaking and coming back; explosions
  small and large; ejecting and each race's way down; landing, take-off, banking, buying, docking; the
  cruise drive, gates, the air entered and left, a black hole; footsteps on five grounds, wading, the
  sidearm, the hand cutter, flares, beacons; thunder, lava; the alarms; the interface.
- **Music** (made again 2026-11-19: below): first seven pieces written by ACE-Step 1.5 (turbo) through
  ComfyUI, soft ambient pieces all; they are kept, unused, in `art/audio/takes/music-acestep/` (not in git).
- **Choosing without ears** (`tools/audio/pack.py`): every take measured (length, K-weighted loudness,
  peak, the model's own clipping, silence at the ends, likeness to noise, bangs in a shot, a loop's
  steadiness, seam and dropouts; music's swing, silent gaps and brightness), and the best-measured chosen
  unless the recipe says `use` (James's choice, by ear). A sound heard over and over keeps two to four
  takes that the game takes turns with; the calm and harsh worlds, space and the fight keep two pieces.
  `art/audio/checks/` has the measurements and a waveform and spectrogram of every chosen take.
- **Files:** Ogg Opus only (effects mono, 48 kbps; music stereo, 64 kbps): every browser the game is for plays
  it (James, 2026-11-19: "assume modern browsers"; Safari since 18.4), so the MP3s beside them are gone. The
  game's files are 34.3 MB: the effects, fetched a few at a time after the first click, and the music's takes
  in use (about an hour), each streamed only when its place comes up. The other takes (for the sampler) bring
  `static/audio` to 44 MB.
- **Playing** (`src/lib/audio/`): one mixer for the page (`mixer.ts`: the effects' bus and the music's,
  each at its own volume, a limiter over both); `cues.ts`, a table from every event to its sound (how loud,
  the player's own and another's, pitch and loudness varied a little, takes in turn, a most a second, the
  music ducked under a big bang) and the steady sounds' rules (the engines, below; the lock tone, the lasers, the
  cruise drive, a black hole near; the beeps of a lock coming, a missile coming and a hull under a
  quarter); `sound.ts` plays them, panned by where they are on screen and dulled and quieted by distance;
  `ui.ts` the interface (a panel opening or closing, the focus moving, any button, a sale, a refusal, a
  refit).
- **The music's moods** (`moods.ts`, `music.ts`): the title on the first screens; over a world calm by day,
  calm at night (`zone.night`), on foot, or harsh (a harsh world has a hazard, foul weather, or is volcanic,
  icy or airless; on foot too); space, the cruise drive, a black hole pulling (or its ring threaded); inside,
  the hangar's; the maps open, the map's; and over anything outside a fight at three levels (`fightLevel`):
  **alert** (an enemy within 520 px, or a band after him), **combat** (one within 260 px, one in the sights, a
  missile under 6 s off) and **peril** (a missile under 3 s off, four enemies near, or his hull and shield low
  in a fight), each settling 8 s after its last sign (peril 5 s) to the level below. A new place's piece fades
  in as the old one's fades out; a fight comes in in a second and a half (peril under one) and holds the
  music 2 to 3 dB lower under the guns; from one level of a fight to another the new piece comes in, over a
  second, at the point the old one had reached (they share 140 BPM and E minor); the piece a fight broke into
  (or the maps did) resumes where it was. **Stings** (`Music.sting`), a few seconds over everything, the music
  held down under them: a fight won (it settled with kills in it), shot down or killed on foot, a new system
  reached, a world taken by his side (none twice within 20 s, none on the title). A take that ends is followed by the next
  take of its piece, after a rest of silence out in the world (half a minute to a minute and a quarter), so
  an hour of play is not an hour of music. Each piece streams from an `<audio>` element (decoded whole, one
  would be some 55 MB); the page primes the elements in the first click, as phones require.
- **The mix**, as rendered by the game's own player: a fight peaks about −7 dBFS through the limiter,
  its loudest moments about −19 dB; the music sits 7 dB under the effects at its loudest and lower in a
  fight; nothing clipped in any scene.
- **Checks without ears:** `audio.spec.ts` (every event has a sound and every sound its files, the steady
  sounds follow how the player stands, the engines by size, throttle, thrusters and power, the music picks
  its mood by place and fight); `node tools/sound-check.mjs` in a real browser (every file decodes, every
  event plays the file the table says, six scenes mixed by the game's own player and measured, the real
  page fetching nothing before the first click, then in the sky playing the take-off, the guns, the
  engines' hum landed and their thrust with the throttle opened, and the music by place).
- **For James's ears:** the page `/sounds` (every effect and piece, every take playable beside the one in
  use) and `art/audio/samplers/1-combat … 5-music.mp3` (each scene as the game mixes it, then every sound
  alone, a voice saying its number; `index.txt` says which is which).
- **Again from nothing:** with ComfyUI running, `uv run tools/gen/sounds.py --all`; with James's key, `uv run
tools/gen/music.py --all --key-file <file>`; then `uv run tools/audio/pack.py`; then `node tools/sound-check.mjs` (with `npm
run dev`) and `uv run tools/audio/samplers.py`. A choice by ear is `use=[n]` in the recipe and `pack.py`
  again. The raw and cut takes (`art/audio/raw`, `art/audio/takes`) are not kept in git.
- **The engines, made again** (2026-11-18). The first loops, four seconds each of "a clear steady
  mid-pitched turbine whine" idling and "a smooth whooshing roar" cruising, were to James "terrible, like a
  whining repeating wind noise" on his first flight and were taken out; flying in silence was worse. Now the
  drives of hard science-fiction ships: a deep, smooth hum with a body of tones and a slow throb, twelve
  seconds a loop. Their own style in the recipe (`DRIVE_STYLE`, `DRIVE_SIZES`, `DRIVE_STATES` in
  `tools/gen/sound_recipe.py`: the effects' "crisp and punchy" is for bangs), three sizes by the engine
  (`ENGINE_SIZE` in `cues.ts`) and three layers: `drive_<size>_idle`, powered and at rest;
  `drive_<size>_thrust`, rising with the throttle; `drive_<size>_boost`, the thrusters over both; and
  `power_up` and `power_down`, one each, played faster for a light drive and slower for a heavy one
  (`POWER_RATE`). Eight takes of each, asked for twenty seconds and cut to twelve, the last second and a half
  of the end blended into the start; their slow rises and falls kept (evened over 3 s, not 0.8).
  - _Measured as an ear weighs them_ (`pack.py hum_shape`): centre to the ear (A-weighted), body (loudness
    from 150 Hz to 1 kHz, what a small speaker gives), hiss (2 to 8 kHz over under 500 Hz), whine (a narrow
    peak over 800 Hz above the third of an octave round it, if within 30 dB of the loudest), noise (how like
    noise band by band whatever its colour: a pure hum 0.14, brown noise 0.70, the old cruise loops 0.51 to
    0.62, the air's roar 0.67) and wander (the spread of its loudness). Takes flagged for whine (over 12 dB),
    hiss, a centre over 900 Hz, too like noise (0.5; the boost 0.65) or wandering (1.5 dB) lose; then the
    least like noise with the most body. A hum's seam is a fault only if it jumps further than the hum's own
    throb does from one 50 ms to the next. Found by drawing takes: "roar", "rumble", "loud" and "powerful" in a
    state's words gave low-passed noise (an octave-down wind, 0.6 to 0.75); "humming drone" gave tones.
  - _Chosen:_ noise 0.12 to 0.49 (the old in use 0.17 to 0.63), no whine at all (the old medium idle a
    40 dB line at 13.6 kHz), hiss −52 to −56 dB (the old light cruise −14), centre 166 to 225 Hz, loudness
    wandering 0.6 to 1.2 dB. `docs/art/gen/engine-sounds.png` (`uv run tools/audio/engine_sheet.py`) has the
    spectrograms, old against new.
  - _Played_ (`steady`): silent off the ship or with its power off (`Listening.powered`; the scene's
    `status.power`, off, starting or on, when it has one; none said, on); the hum at half while it comes up,
    and the powering up as it starts (or comes on from off) and down as it goes off (`powerOf`, `powerCue`);
    the hum always under; the thrust by the throttle as set and a little by the speed (`push`, 0..1; landed,
    0), its pitch rising 0.88 to 1.08; the boost with the thrusters. From rest to full throttle the engines
    rise about 7 dB, the boost 3 more; under the cruise drive, under half.
  - _Not yet:_ nobody has heard them. They are deep (nearly all under 600 Hz): a laptop's speaker gives some
    of them, a phone's little; the boost chosen is a hum more than a roar (rougher takes are on `/sounds`).
- **Not yet:** none of it has been heard. Other ships' engines are not heard (only their guns, hits and
  explosions); the sides no longer colour the music (Phase 9's choir and drone were synthesised); no wind
  or weather ambience beyond thunder; footsteps outside a few kinds of world are "soft" whatever the
  ground; whether a phone's browser streams the music through the mixer as the desktop one does is
  unproven on a real phone.

### The music, made again (2026-11-19)

James: "if I gave you Elevenlabs API key could you generate for me a wider, better, more varied and fun,
intense set of music please?" He gave the key (a paid plan: its music may be used in a game that is sold). It
is the one service off this PC: only the recipe's words go to it, and the key is never written into the
project.

- **The model:** ElevenLabs Music, `music_v2_5`, from a composition plan: each piece a list of sections, each
  a name with directions in braces ("[Dogfight] {fast staccato strings, a screaming synth lead, relentless
  drums}"), its seconds and its own styles; the first section leads with `SCORE` (instrumental, an original
  game soundtrack, hard science fiction, analog synthesizers with a cinematic orchestra, retro-futuristic) and
  the piece's own (its genre, instruments, key, tempo). About 15 s a piece; about 14 credits a second of music
  (the whole set, 41 takes and 76 minutes, about 63,500 of the plan's credits).
- **Thirteen pieces and four stings** (`tools/gen/sound_recipe.py MUSIC`), two or three takes each, the game
  taking turns with them: the title (a lone synth, a five-note theme, the orchestra rising); a calm world
  (plucked arpeggios and a light groove); a world at night (a slow pulse, glassy bells); a harsh world
  (industrial, distorted drones, struck metal); on foot (marimba and kalimba plucks, hand drums, playful);
  space (slow sequences over a heartbeat bass); the cruise drive (driving synthwave, a key change up); near a
  black hole (sub-bass swells, strings bending down); the hangar (retro synth funk); the map (a ticking
  sequencer, synth brass); the fight's alert, combat and peril (140 BPM, E minor: a pulsing ostinato; pounding
  hybrid drums, distorted bass and brass; double-time drums and alarm-like stabs); stings for a fight won, shot
  down, a new system reached and a world taken.
- **Finishing** (`tools/gen/music.py finish`): trimmed, faded in over 3 s and out over 8 (a sting keeps its
  attack and fades over its last second), evened to its piece's loudness (−24 dB over its louder half; the
  fight −23 to −22, the stings −21 to −20). The service sometimes leaves a break between two sections (the
  music dying away to near-silence for two to five seconds): for pieces that must not stop (`steady`: the
  fight, the cruise drive, the map) each break is cut out with the dying away before it (`close_gaps`). The
  others keep their quiet: a black hole's swells are its point.
- **Looked at, not heard:** a spectrogram and loudness line of every take; the sound check's music scene, every
  place in turn, a fight going alert → combat → peril → combat and back to the calm piece it broke into, and
  the three stings, mixed by the game's own player: `docs/art/gen/music-moods.png`. `pack.py` lets a fight
  piece be brighter (`bright`: its share over 4 kHz before it is flagged). James chooses by ear on `/sounds`
  (each piece marked New) and the recipe's `use`.

### The music, made a third time: MIDI (2026-11-19)

James, of the set above: "it needs to be more in keeping with the game, more midi. The intro needs music too". The game
is pixel art, so its music is now sequenced as a game of the early 1990s would have had it, on a MIDI sound module's
patches. The same model and plan; `SCORE` is now "1990s sequenced MIDI game music", "General MIDI sound module
instruments", "quantized MIDI sequencing, every note on the grid", retro science fiction, a catchy melody, a dry, clear
mix. Every section carries `NOT_MIDI` as negative styles (a live orchestra, a film score, realistic acoustic instruments,
modern pop production, heavy reverb), and each piece names its patches (a square-wave lead, an FM bass, a synth strings
patch, a brass section patch, orchestra hits, a MIDI drum kit, an FM electric piano, a marimba patch). Each place keeps
its key, tempo and character, and the fight still shares 140 BPM in E minor.

- **The opening story has its own piece**, `intro` (place `intro` in `audio/moods.ts`, set by `Game.svelte` while
  `IntroCrawl` is open; it shared the title's before, and that piece's first 25 s were a near-silent drone, pushed down
  under the voice, so the story seemed to have no music). It runs for about two minutes in five sections laid to the
  story (dark, the war, the worlds, the dock, a coda), in D minor at 76 BPM: low bass, high bells and soft pads, so the
  narrator's range stays clear. It is evened 1 dB louder than the other pieces, since it is held down under him nearly
  all the time.
- Two takes of every piece and sting (36 in all, about 60 minutes), made in about three minutes. The music did not
  draw on the plan's character credits. The cinematic set is kept in `art/audio/takes/music-cinematic/` (not in git).
  Nobody has heard it; `/sounds` marks it New.

### The narrator

The opening story is to be read aloud, the voice made on this PC and shipped as a file (a model in the
player's browser would be a download of 80 MB or more to say the same words every time). Kokoro-82M
(Apache 2.0) and Chatterbox (MIT, ResembleAI) were tried, both on the processor (the GPU is shared), over
one stand-in passage: `tools/gen/voice_recipe.py`, `voice_kokoro.py`, `voice_chatterbox.py`, measured by
`tools/audio/voice_check.py` (pitch, roughness, words a minute, every word heard by Whisper). Kokoro's stock
voices were too light and too quick for James; read at 0.78 and lowered with ffmpeg's rubberband (formants
with the pitch) they were not. He chose **Chatterbox's `lewis3`**: Kokoro's bm_lewis read slowly and lowered 3
semitones, taken by Chatterbox (exaggeration 0.6, cfg 0.3, seed 7); 101 Hz, the roughest of every take, about
145 words a minute (`NARRATOR` in the recipe; its voice kept as `art/audio/narrator/voice.wav`). Kokoro's am_onyx
lowered 3 came second.

He reads 77 lines (`src/lib/audio/narration.ts NARRATION`): the opening story, its line in the dark and each
paragraph (`src/lib/story/intro.ts`), and a line as each step of the first sortie begins (`src/lib/story/sortie.ts`),
in five versions: the keyboard's default keys, a PlayStation controller's, another controller's, the touch screen's,
and one naming no key for a pilot who has bound his own (`sortieVoice` chooses, `Game.svelte sayStep` plays it). Each
says what is going on, the control that does it and why ("Your ship is docked at the station with its power off.
Press P to power up."): the first lines named no control and James found them "so esoteric" (2026-11-19). `npx jiti
tools/narration-lines.ts` lists them; `uv run tools/gen/narrate.py` reads every line not yet read in its present words
(Chatterbox on the processor, 8 threads, about 15 minutes for all); `uv run tools/audio/narration.py` cuts each to its
words by Whisper's timings, checks every word was said (small.en, and base.en where that mishears; numerals,
sound-alikes and the names as Whisper spells them allowed; a line wrong is read again with another seed, each seed's
take kept), evens them to -17 LUFS, and writes `static/audio/voice/<id>.ogg` and `.mp3` (1.6 MB both), their words and
lengths in `narrationTakes.ts` (generated), and `art/audio/samplers/6-narrator.mp3` for James. `narration.spec.ts` fails
when a line's words change and it has not been read again. Played on the effects' bus with the music pushed down under
him (`speak`, `hush`): the opening story times itself by his lines (each paragraph comes up to be read as he begins it;
a reader's pace where a line is not voiced), `Game.svelte` says a step's line as the step begins (not on a detour).
Takes are in `art/audio/voice/`, not kept in git.

**Read by ElevenLabs since 2026-11-19** (James's plan): `narrate.py` sends each line to its text to speech (`eleven_v3`,
seed 7) in `NARRATOR`'s voice. The first was Miltiadis (`YjbHBTWH8WkGAhNrkp0i`), a Greek speaker told to put on a
Greek accent. James asked for "a better elevenlabs voice", so ten from the voice library were tried over the test
passage (`tools/gen/voice_eleven.py`: voices that speak English with a Greek accent of their own, Greek narrators told
to keep one, and old, deep English storytellers) and measured by `voice_check.py` and by Whisper's guess at the
language (a strong accent is heard as part Greek). Miltiadis read the fastest (159 words a minute), and Whisper heard
him as more Greek (0.54) than English (0.28). **Theos** (`n0vzWypeCK1NlWPVwhOc`, a Greek narrator for documentaries and
trailers, with "[Greek accent]") was the deepest (77 Hz) and among the slowest (118 words a minute), with every word
heard and the accent plain (English 0.38, Greek 0.26). All 78 lines were read again in his voice (about 5,000 credits)
and packed with `narration.py --keep`. Miltiadis's takes are in `art/audio/voice/lines-miltiadis/`, and each voice's
test take is in `art/audio/voice/eleven/` (not in git).

### Before

Phase 1 synthesised every effect in the browser with Web Audio (an engine hum and roar, noise bursts for
shots and explosions, lock beeps), and Phase 9 the music (slow voice-led pads, a bell now and then, a
reverb; a mood for each place, a pulse in a fight, a choir for the Nomarchy and a drone for the Anarchoi). Both
were run and measured, never heard, and both are gone.

## 18. Multiplayer architecture

### Principles

- **Works alone.** With no peers and no relays, everything still runs against local data.
- **One transport interface.** The game talks to a small interface. Trystero is one
  implementation. A same-browser implementation (two tabs talking to each other) is another,
  used for development and tests. A Pear desktop transport stays possible later.
- **Each player owns their own ship and pilot.** Nobody else's game moves them.

### Identity

- A key pair created on first run and kept in browser storage. The public key is the pilot.
- **Proposed:** use Nostr's key and event format, so one identity serves signalling,
  persistence and presence.

### Rooms

- One room per zone: one for each planet's surface, one for each system's space, one for
  each station deck.
- Room names include the galaxy version and a protocol version, so incompatible builds never
  meet.
- A room is capped at about 12 pilots. Beyond that a second copy of the zone opens.
- Moving between zones means leaving one room and joining the next, during the transition
  sequence.

### Live sync

- Each player sends their own state about 15 times a second: position, height, heading,
  roll, pitch, speed, boost, flags. Roughly 32 bytes each.
- Other ships are drawn about 100 milliseconds in the past, interpolated between updates,
  and projected forward briefly if updates stop.
- One-off events are sent reliably: fired, hit, destroyed, ejected, landed, mined, picked
  up, chat.
- A pilot whose tab is hidden stops updating. They are marked idle and removed after a few
  seconds, so they are not a frozen target.

### NPCs

One player in each room simulates the NPCs: the one with the lowest key. If they leave, the
next takes over from the last known state. A player alone is always their own host. Built in the
polish pass: the NPCs are bands that live in places (section 8). Protocol 5: each of the computer's ships
in the host's packets carries its band, whose patrol it is (each game sees it on its own side or the
other's, in that side's colours and mark) and whether it lies in wait; the packet ends with the bands
beaten and when each is back, which the next host keeps. Haulers are never sent: every game has the same
from the clock.

### Persistent events

World state that outlives a session is a set of signed events: influence, discovery names,
beacons, wrecks, grave markers, ghosts.

- Events are only ever added, never edited. Merging two players' sets is a union.
- Every player computes the world state from the set with the same rule, so the order events
  arrive in does not matter.
- Rules check the signature, reject timestamps in the future, and cap what one pilot can
  contribute per world per day.
- Events are kept locally, exchanged directly between players in a room, and published to
  several public Nostr relays so they survive when nobody is online.
- The relay list is built in and can be changed in settings.

No CRDT library is needed for this. An add-only set of signed events with a deterministic
rule is simpler and enough.

### Presence

Each player publishes a small heartbeat to the relays about once a minute: faction, zone,
bounty. The galaxy map counts these to show where people are. This avoids connecting every
player to every other across the whole galaxy.

### Time

- Day-based things (hotspots, prices, tasks) use the UTC date, which tolerates clocks being
  minutes apart.
- Within a room, players measure each other's clock offset with pings.

### To verify before building on it

- ~~Trystero's current release, maintenance state and whether it offers an unreliable channel
  for state updates.~~ Checked in Phase 2: 0.27.0 (11 November 2026), maintained; no
  unreliable channel in its API, so the game opens one itself. See the research notes.
- ~~Which public relays accept custom event kinds, and their rate and retention limits.~~ Checked
  in Phase 7: eight of twelve took and returned both kinds; none publishes retention or rate limits.
  See the research notes.
- The real connection failure rate between players on different networks.

### Built in Phase 6

Each system's space is a room of its own (`galaxy1-s3`), as each world is: the page follows the
scene from zone to zone (`Game.svelte`), leaving one room and joining the next as it climbs out,
goes down or jumps, during the transition. The wire is unchanged: positions are floats, and a
pilot in space is a ship like any other (flying level, docked shown as landed). A rock cut in a
belt is the outcrop event (`mined`, with the rock's id from its cell). The raiders and a
derelict's drones are the host's, as before. Tested over the memory bus (`session.spec.ts`,
"space in a shared sky"): two pilots in a system's space see each other fly level and a hit lands
on both sides; a pilot who jumps a gate is gone from the first system's room and is seen coming
out of the gate by a pilot in the next; a rock cut by one has less ore in it for the other. Not
yet: others see a pilot vanish when he jumps or goes down, with no flash or fire of their own.

### Built in Phase 5

A pilot's state (now 56 bytes; the wire's version is 3) also says where he is out of his ship
(coming down, on foot, dead, climbing in), where his feet are, which way he faces, how fast he
walks, his health, how far his way of coming down has opened, whether he is hidden, wading,
firing or cutting, and whether his ship stands parked (where the ship's fields say). His card
carries his look. Others draw him as a walker (`Scene.addWalker`, 100 ms in the past like a ship,
carried on along his facing) beside his parked ship (`ShipInput.parked`), and both can be shot:
hits on him on foot say `foot`; a parked ship's loss says `parked` (no feed line). Events: `died`
(his game decides; it says who killed him; the feed shows it with heads, and the killer is paid,
less each time), `vein` (as `mined`), `beacon` and `flare` (where), `steal` (a pilot climbing into
`who`'s parked ship), answered by the owner's game with `stolen` (with the hold's contents, to
everyone: the thief flies it, the others see it go) or `stealNo` (it was not empty any more; the
thief stays on foot after 2 s at most), and `paint` (the paint of a ship not his own that he
flies). The host's raiders hunt other pilots on foot as they hunt their ships. Tested over the
memory bus on world w9, where both sides start at the same outpost (`session.spec.ts`).

### Built in Phase 4

A pilot's state carries how full his hold is, whether he is landing, landed or lifting off, and
the outcrop his laser cuts (37 bytes; the wire's version is 2): others draw his dust and his
laser. Events: `mined` (an outcrop, its period, the units taken: every game in the room agrees
how much is left), `crate` (spilled, with its contents, known by the spiller's key and number)
and `crateTaken` (what is left in it). Who decides follows the rule: each game its own ship and
hold. Two who reach a crate in the same moment both take it; nothing decides between them yet.
Turrets are run by each game against its own pilot and its own raiders only. A pilot joining
late does not hear what was mined before he came.

### Built in Phase 2

- **Transport** (`src/lib/net/link.ts`): a link is polled once a frame and says what happened
  (peers joining and leaving, messages, a full room, a peer that could not be connected); it
  sends on a fast lane (may be lost) or a sure one (always arrives, in order). Two
  transports: `local.ts` (tabs of one browser over a BroadcastChannel, or a bus in memory for
  the tests, with delay, jitter, loss and failed pairs on demand) and `trystero.ts` (the real
  one, loaded only when going online).
- **Identity:** a Nostr key pair in the save; the pilot's card (callsign, side, ship, paint)
  goes to each peer as a signed Nostr event (an ephemeral kind, `KIND_PILOT_CARD`), checked
  before it is believed.
- **Rooms** (`rooms.ts`): `g<game version>/p<protocol version>/<zone>/<copy>`, the zone being
  the island world (`islands-<seed>-<land>`; since Phase 3 a world of the galaxy, `galaxy1-w12`,
  and the island world's name only for one of the address's own); 12 pilots a room, turned away to the next copy;
  `?room=` adds a private suffix for trials.
- **Live sync** (`session.ts`, wire format in `codec.ts`): each game sends its own ship 15
  times a second (33 bytes); others are drawn 100 ms in the past on their sender's clock
  (offset by the quickest trip seen), between the states either side, and carried on along
  their heading for 250 ms if states stop. Events go reliably, batched once a frame.
- **NPCs:** the lowest key among pilots who are not idle and have been known for 1.5 s flies the
  raiders and sends their waves; it sends them 15 times a second as it does its own ship. A
  game that sees a lower key ready hands them over (their state, on the sure lane); if the
  host goes quiet or leaves, the next takes them over from the last state heard. A pilot alone
  is his own host, and the skirmish is exactly as it was.
- **Presence in a room:** a hidden tab says it is idle and stops sending; others mark it idle
  and take its ship away 4 s later. A pilot silent for 1.5 s is treated the same.
- **Connection log** (`log.ts`): every pilot met is an attempt that ends connected or failed;
  the totals are kept across sessions on each device and shown and copyable on the
  connection screen.
- The tests (`session.spec.ts`) fly two and three real scenes against each other over the
  memory bus with delay, jitter and loss: they see each other move smoothly, a hit lands on
  both sides and the kill shows on both, the same kill again pays less, no friendly fire,
  the raiders carry on when their host leaves or goes quiet, idle pilots go, a full room sends
  a pilot to the next copy.

How it holds up, measured over the memory bus (one pilot weaving and boosting, 25 s, how far
the other game draws him from where he really is, and the largest jump between two frames; a
frame's own flying is 1.5 to 3 px):

| Delay, jitter, loss | Mean gap | Worst gap | Largest jump |
| ------------------- | -------- | --------- | ------------ |
| none                | 13 px    | 19 px     | 2.8 px       |
| 50 ms, 30 ms, 5%    | 19 px    | 28 px     | 2.9 px       |
| 100 ms, 50 ms, 15%  | 24 px    | 36 px     | 4.6 px       |
| 150 ms, 100 ms, 30% | 30 px    | 48 px     | 13.6 px      |
| 300 ms, 150 ms, 30% | 47 px    | 70 px     | 15.0 px      |

The gap is mostly by design (100 ms in the past, plus the trip). Up to 100 ms of delay with 15%
lost it stays smooth; once the jitter is as large as the 100 ms buffer, ships hitch. A buffer
that grows with the jitter it measures would help there.

Not yet: presence on the relays, persistent events, chat, measured clock offsets (the offset
is estimated from one-way trips), and a relay fallback (TURN) for pairs that cannot connect.
The player's computer wingmen are not shared: in a shared sky only he sees them.

### Built in Phase 7

- **Events** (`net/events.ts`): each deed is a Nostr event signed with the pilot's key: kind 7451 (a
  regular kind, kept by relays) with a short JSON content (kind of deed, world, side, callsign, place,
  a number, and a name, hull or ghost's path); presence is kind 17451 (replaceable: a relay keeps a
  pilot's latest). Every event carries its namespace as a `t` tag: `xenophon-dev-g1` from a development
  build, `xenophon-g1` from a release, so the two never mix; a name also carries the namespace's names
  tag, so names (kept for good) can be asked for apart from the rest (the last 16 days).
- **The archive** (`net/archive.ts`): the local copy, kept in localStorage beside the save, the source
  of truth. An event is let in only once its signature checks and it reads as one of the namespace's;
  one already held does nothing, so merging is a union. Events too old to count or show go (names
  never); at most 3000 are kept.
- **Relays** (`net/relays.ts`): a pool polled like a link, so the tests drive its clock: a connection
  to each relay, tried again after a wait that doubles to two minutes; each own event sent to every
  relay, again to any that was away, until it says OK or refuses; the same questions asked again on
  reconnecting; how each stands for the menu. Six built in (the research notes, "Checked in Phase
  7"), changeable in the menu (the save) or with `?relays=`.
- **The chronicle** (`net/chronicle.ts`) holds the archive and the pool, signs the pilot's events,
  listens for the namespace's, says his presence once a minute and hears everyone's (a heartbeat
  counts for 150 s), and works the galaxy out (`galaxyState`, again when something new comes, or
  every 30 s). With `?net=off` or `?net=local` it has no relays and everything runs on the local copy.
- **The pilot's part** (`net/persistent.ts`): the scene's deeds become events (a flag, a delivery, a
  kill, a wreck, a grave, a beacon, a ghost; a world's name); his standing moves on; once a second the
  scene is told who holds each world, this one's name, whether his side can reach it, and its traces
  (`Scene.setTraces`); his presence once a minute.
- **In a room** (`session.ts`): each pilot who comes in is handed the newest 150 events (and every
  name); each event a pilot makes goes to everyone in the room; what comes is checked and let in. So
  events spread between players directly as well as through the relays. Zone chat (`chat`, `quick`)
  and bounties (`down` carries the price) go the same way.
- **The engine's side** (`sim/traces.ts`, Phase 7's slice of state): `setTraces` in, `takeDeeds` out
  (kept whether or not the sky is shared), `recordGhost`, `plantBeacon(phrase)`, `Scene.traces`.

Tested against relays in memory (`net/fakerelay.ts`: slow, sending twice, keeping events only so
long, forgetting, refusing, down): a player who was never online with the maker of an event gets it
through the relays that kept it; a refused event is kept here and taken by the others; an event made
while every relay was away goes once one is back; a slow relay's news comes late and a repeating
relay's changes nothing; alone, the archive outlasts the session and fades on the clock
(`chronicle.spec.ts`). With real scenes (`persistent.spec.ts`): a flag holds a world for an Anarchoi pilot
an hour later (its outposts hostile to him) and a week on it has faded; a wreck where a ship was lost
is found and stripped by a second player two hours later; a world named by the first to land is so
named for the next, a day later. Over the memory bus (`session.spec.ts`): a newcomer is handed the
events, new ones pass on, chat and quick chat arrive, a bounty is paid. Over the public relays
(`tools/relay-check.ts --later`): a new session read a check event back and worked the map out.

Not yet: wrecks, graves and flags in space (traces are on worlds only; a loss in space ends the
streak and leaves nothing); ghosts are only shot or flown beside, with no race to win; chat across
copies of a zone; asking relays in pages; checks of the events beyond the rule's (property is not yet
held against them).

### Built in Phase 8

Protocol 4 (old builds meet only in their own rooms): the pilot's card carries his ship's `make`
(weapons by mount, modules, pattern, emblem, side's mark: `makeText`), its trim, glow and trail
colours, whether it is open to visitors and its furniture; a changed card is signed and sent again.
His state is 64 bytes: as before, plus where he is inside (0 not, 1 his hangar, 2 a deck, 3 a ship's
rooms) and which (a deck by its base's id, a ship's rooms by a number from its owner's key; where
he walks is the on-foot fields). Each game tells its scene who else is in its place (`setVisitors`);
a hangar is private. Events: `mine` and `mineEnd` (the dropper's game decides), `squad` (an ask or a
yes) and `squadIs` (the squad's list, passed round when it changes; an empty one is a leave; lists
join, so three pilots agree whatever order the words come in).

## 19. Save data

Everything a player owns is stored in their own browser.

| Store    | Contents                                                   |
| -------- | ---------------------------------------------------------- |
| Identity | Key pair                                                   |
| Pilot    | Callsign, faction, portrait, suit, rank, feats, statistics |
| Property | Wallet, vault, hulls owned, parts owned, wardrobe          |
| Loadouts | What is fitted to each hull, paint, gear worn              |
| Atlas    | Systems and worlds visited                                 |
| Events   | Local copy of persistent events                            |
| Settings | Controls, audio, picture, relays                           |

- The format has a version number and migration steps from the start.
- **Backup:** export to a file and import on another device. Optionally, an encrypted copy
  on the relays so a pilot can be restored from the key alone.
- Only one tab can play a pilot at a time.
- Property is recorded as a log of what happened (mined, banked, bought), with the totals
  derived from it. Nothing checks it yet, but this is what later anti-cheat would check.

Built in Phase 2 (`src/lib/save/`): the save is version 2 (identity, pilot, ship and paint,
settings: volume and view), in localStorage under one key per slot (`?pilot=2` flies a second
pilot in the same browser). Version 1 (flat key, callsign and side) is migrated, as the first
step of the chain; a save that cannot be read is kept aside, never overwritten. The pilot file
is the save as JSON (it holds the secret key), read back through the same migrations. One tab
per pilot is kept by the Web Locks API; another tab can take the pilot over, and the first
then stops. Property, loadouts, atlas and events come with their phases.

Built in Phase 5: version 4 (migrated from 3) adds the pilot's look (`pilot.look`); a pilot from
before is given one of his side's races, made from his key, and a look of the other side's races
is put right when read.

Built in Phase 4: version 3 (migrated from 2) adds the parts fitted to each hull (`loadout`) and
the property log (`save/property.ts`); paint bought is recorded there too. The hold is not saved:
it is at risk, and closing the tab with a full one loses it.

Built in Phase 7: version 5 (migrated from 4) adds the pilot's standing (`progress`: contribution,
streak, feats, the day's tasks, wrecks stripped; `save/progress.ts`), his mute and block lists by key
(`social`), and the relay list (`settings.relays`); a pilot from before owes no joining bonus. A
system's space is kept as where he is (it was dropped on reading). The events are kept beside the
save, not in it (`xenophon/events/<namespace>/<slot>`): they are the galaxy's, not his.

Built in Phase 8: version 6 (migrated from 5): `ships` (each with its hull, weapons by mount,
modules, paint, furniture, and whether others may come aboard), `flying`, `schemes`, `gear`; the old
`ship` and `loadout` become the starter with its paint and parts, and the hull he had chosen (with the
old free ship key) is kept as his, written in the log as bought for nothing. Ownership is the
property log's: `hull:`, `weapon:`, `module:` (`part:` from Phase 4 counts), `gear:`, and furniture
counted by the piece (`furn:bunk`; a folded log keeps counts as `furn:bunk*3`). A ship in the save
whose hull the log does not own is dropped on reading.

Built in Phase 9: version 7 (migrated from 6): `tutorial` (the step he is on, and whether it is behind
him: a pilot from before has it behind him), `tips` (those shown), `backup` (when last kept and how, when
last asked, whether a sealed copy is kept on the relays), `played` (seconds flown, all told), and the
settings screen's own in `settings` (`music`, `bindings`, `invertY`, `toggle`, `shake`, `text`, `pixel`,
`flames`). The sealed copy and the phrase are `save/backup.ts`; restoring from either goes through the
same migrations as a file.

Built in the polish pass (item 7): version 8 (migrated from 7). Each ship record has a `kit`: the pieces of
furniture it came with (its fit-out, `shipKit(hull)`), by kind, the pilot's as much as any he bought
(`furnitureLeft` counts both, less those placed). A ship's rooms were rebuilt larger, so a ship of version 7
has its furniture taken up (his bought pieces are his to place again) and its fit-out laid. A ship from the
shop comes with its fit-out laid. The wire's protocol is 7 (section 18): a ship's rooms and a pilot's middle
on foot changed.

## 20. Engine work

Changes to the code that exists. The refactor in progress should land first.

| Area           | Today                                                                                    | Needed                                                      |
| -------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Time step      | Done (Phase 0): fixed 1/60 s steps, counted out by the page                              | Fixed steps, so handling is the same on every machine       |
| Zones          | Done (Phase 6): a zone interface (`sim/zone.ts`); the surface and space are zones        | A zone interface: surface, space, interior                  |
| Craft          | Done (Phase 0): the leader, its wingmen, and any number of other ships (`Scene.addShip`) | Any number of ships, local, remote and NPC                  |
| Shadows        | Done (Phase 0): every ship, up to 48                                                     | Enough for a full room                                      |
| Meshes         | Done (Phase 0): a mesh per hull, built on demand; a paint per ship                       | A mesh per hull and paint, built on demand                  |
| Materials      | Done (Phase 3): a look per world (three palettes per archetype), tinted by its sun       | A table per planet, tinted by its sun                       |
| World building | Done (Phase 3): a recipe per world, one shaping function per archetype                   | A full planet recipe, one function per archetype            |
| Entities       | Shots, missiles, NPC ships (Phase 1); pickups, pilots, structures to come                | Shots, pickups, NPCs, pilots, structures                    |
| Structures     | Done (Phase 4): bases, ore and wrecks stamped into the height and material maps          | Stamped into the height and material maps                   |
| Collision      | Shot against ship, and against the ground (Phase 1); ground height for flying            | Ship against shot, ship against ship, pilot against terrain |
| Input          | Done (Phase 0): an action map (`src/lib/input/`)                                         | An action map covering the controls table above             |
| Camera         | Follows the leader                                                                       | Also follows a pilot on foot, at a closer zoom              |
| Space backdrop | Done (polish pass): black, fixed stars, bodies as globes in every view, gravity wells    | Star field, discs for bodies, gravity wells                 |
| Tile rooms     | None                                                                                     | A small tile and sprite drawer into the same frame          |
| HUD            | Done (Phase 1): a HUD in the frame's pixels on every view (`render/hud.ts`)              | A HUD layer for every view                                  |
| Heavy work     | Done (Phase 3): travel builds the world in a worker; the first one is built at load      | Built in a worker if arrival causes a visible stall         |

Performance budget: a full room at 60 frames a second on a mid-range laptop, and a playable
30 or better on a mid-range phone. Measure the current cost of a frame and of building a
world on both before adding to either.

Measured with `node tools/measure.mjs` (Node, on a Ryzen 9 7950X3D desktop; milliseconds a
frame, stepping and drawing; pixel flames). Phase 0, then Phase 1 (smaller ships, samples
chosen per voxel, and now the HUD and the fighting):

| Frame   | Ships            | Overhead  | Chase      | Cockpit    |
| ------- | ---------------- | --------- | ---------- | ---------- |
| 320×180 | 1                | 1.3 → 1.0 | 2.6 → 1.6  | 3.8 → 3.0  |
| 320×180 | 16, spread out   | 6.2 → 2.9 | 9.2 → 3.5  | 8.4 → 4.5  |
| 320×180 | 16, packed close | 6.6 → 3.1 | 12.3 → 4.3 | 7.7 → 4.0  |
| 456×256 | 1                | 2.1 → 1.8 | 4.2 → 2.7  | 6.5 → 5.6  |
| 456×256 | 16, spread out   | 7.8 → 4.2 | 12.5 → 5.6 | 11.9 → 7.8 |
| 456×256 | 16, packed close | 8.1 → 4.3 | 17.6 → 6.8 | 11.5 → 7.2 |
| 456×256 | a dogfight       | 3.5       | 3.7        | 5.7        |

(A dogfight: two wingmen and eight computer-flown enemies, guns and missiles firing. The
simulation's share of a frame stays under 0.1 ms.)

A 1366×768 laptop screen gets the 456×256 frame; a phone held sideways about 420×195. Phase
0 found nearly all of the cost in drawing ships, every voxel with as many samples as the
ship's nearest point needed. Two changes fixed that: the hulls are a little over half as long
and six slices tall (section 7, Scale), so a ship has about a fifth of the voxels; and each
voxel now takes its own number of samples, spaced about 0.7 px apart (no wider leaves
pin-holes in a turned slice), one for a voxel under 0.7 px. Every view now fits 60 frames a
second on a laptop with room to spare.

Ships carved from three views (after the fresh review, 18 November 2026: 7 to 15 slices, lit by face, kept in order by
their own depth test, drawn as screen boxes where their slices are more than a pixel apart), before and after, 456×256,
pixel flames: overhead one ship 1.82 → 2.15, sixteen spread out 4.33 → 5.92, packed close 4.43 → 6.06, a dogfight 3.81 →
4.37; from behind 2.84 → 3.55, 5.55 → 7.01, 6.92 → 9.01, 3.61 → 4.89; from the seat 4.09 → 4.31, 6.21 → 6.66, 5.82 → 6.75,
4.71 → 5.00. In space the dearest is still the seat by a sun with sixteen ships, 10.64 → 11.53; fitted and painted,
sixteen overhead 4.59 → 6.35; the hangar 0.56 → 0.88 (its ship 35 slices). Every view stays inside the frame. (The first
try sampled each voxel down its height as well as across it: sixteen ships from behind took 17 ms, close ones hundreds of
samples a voxel; a box per voxel there cost a tenth as much.)

What costs most now is drawing the world, about two thirds of a frame. In the cockpit the
world under the instrument panel was drawn and then covered. Since the polish pass (item 3) each
hull's cockpit knows the rows from which it hides everything wherever the head has swung
(`CockpitArt.clear`), and the world is drawn only above them; the cockpit itself is two layers
laid from tables made once a size and paint, and its screens. One ship, before and after, on one
idle desktop at 456×256: over a world 6.55 → 5.21 ms, sixteen ships 9.08 → 7.85, a dogfight
6.85 → 6.13; in space open 2.37 → 1.32, over a gas giant 11.43 → 8.50, by a black hole
10.93 → 7.97, at a station 7.01 → 4.56, the way down 14.80 → 11.90.

Space (Phase 6, `node tools/measure.mjs 456 256`, same desktop, overhead, pixel flames; Thodes
at eight kinds of place):

| Where            | 1 ship | 16, spread out | Dogfight |
| ---------------- | ------ | -------------- | -------- |
| Open space       | 1.3    | 3.2            | 2.1      |
| Over a world     | 1.7    | 3.3            | 2.3      |
| By a sun         | 2.4    | 4.2            | 3.1      |
| Over a gas giant | 2.5    | 4.1            | 2.1      |
| By a black hole  | 2.9    | 4.7            | 2.6      |
| In a belt        | 1.3    | 3.0            | 2.0      |
| At a station     | 2.4    | 4.1            | 2.4      |
| Cruising         | 1.2    | 3.0            | 2.0      |

The surface overhead is 2.0, 4.3 and 3.7: space is no slower anywhere. A sun first cost 8.1 ms
(three sines and an exponential a pixel for its corona); its flames and glow are now tables made
once a frame. A world's map for space takes as long as building the world (120 to 450 ms), so the
page builds them in its worker, and the body is drawn plain until its map comes.

Space at its true size, in every view (the polish pass, items 4 to 6; same tool and desktop, one
ship, ms a frame; Phase 6's overhead in brackets; "going down" is the whole way down to a world, Use
held over it, its worst frames those where the world is built, which the page does in its worker):

| Where            | Overhead  | From behind | From the seat |
| ---------------- | --------- | ----------- | ------------- |
| Open space       | 0.2 (1.3) | 0.9         | 2.2           |
| Over a world     | 5.0 (1.7) | 1.6         | 5.5           |
| By a world       | 1.8       | 1.9         | 4.8           |
| By a sun         | 2.1 (2.4) | 3.4         | 7.8           |
| Over a gas giant | 6.4 (2.5) | 4.7         | 11.3          |
| By a black hole  | 5.0 (2.9) | 4.0         | 10.4          |
| In a belt        | 0.4 (1.3) | 1.8         | 5.3           |
| At a station     | 5.2 (2.4) | 2.6         | 7.1           |
| Cruising         | 0.2 (1.2) | 0.8         | 2.3           |
| Going down       | 7.4       | 8.9         | 15.1          |

With sixteen ships add about 2 ms; a dogfight is no dearer than one ship. Overhead, a world below the
plane is a disc 490 px across, so over one every pixel of the frame is the globe's (each worked out from
its map, the place on it carried between exact ones every eight pixels): that is the 5 ms. From the
seat the frame drawn is wider than the screen, so the ship's roll can turn it, and the cockpit's own
drawing is about 1.5 ms. Over a gas giant (0.85 of its radius out: in its bands) the seat first cost
30 ms and a black hole 13: the clouds are now worked out every eight pixels with their bands bent once
a sample, and a hole is drawn only over the part of the frame shown. The way down from the seat is the
dearest: the air's sky, the globe and then the ground are all drawn on it.

Building a world (Phase 3, `node tools/measure-worlds.mjs`, same desktop, median of five):
archipelago 120 ms, ocean 205, moon 216, jungle 296, canyon 301, mesa 355, ice 365,
continental 375, volcanic 436. That would stall a frame, so travel builds the world in a worker
(`src/lib/worlds/build.ts`); in a browser, travelling held no frame past 17 ms. The first world
of a session is still built on the main thread as the page loads. Nothing has been measured on
a real phone yet.

Phase 8 (`node tools/measure.mjs 456 256`, same desktop, overhead, pixel flames): a fitted and
painted ship (flak pods, scanner, cargo pod, stripes, an emblem) 2.0 ms alone, 4.5 with sixteen, 3.2 in
a dogfight (plain: 2.1, 4.2, 3.7): no slower. Inside, at half the frame as the page shows it: the
hangar 0.19 ms, the deck with its crowd 0.17, a fighter's rooms 0.09, a freighter's 0.11.

**On a slow machine** (the last pass of the polish: `node tools/slow-machine.mjs`, the built site in Chromium at
1366 × 768 with the processor slowed four and six times, as a mid-range phone's is beside the desktop these numbers
come from; frames the page actually showed, averaged over a few seconds, after a world's disc from overhead in space
was kept a moment, `drawGlobeTopKept`: drawn again a band of rows a frame every half second and turned with the view,
5.0 → 1.0 ms a frame in Node). At ×4: over a world, in a fight with the frontier's raiders, on foot, inside, and in
space in the open, by a world, a gas giant or a black hole, 57 to 60 frames a second in every view; the way down 27
to 38. At ×6: on foot, inside and by a gas giant 60; in open space 55 to 59; by a world in space 48 to 58; over a world
44 to 51; a fight 39 to 45; by a black hole 37 to 39; the way down 17 to 21, the dearest ten seconds of the game. (A
first measurement taken while the GPU's tools and other browsers were busy gave lower numbers; these were taken with
the machine otherwise quiet but for one scripted browser.) The way down is left as it is: making it cheaper means
drawing the globe more coarsely, which the one-pixel-size rule forbids, or keeping its ground between frames as the
globe's disc now is (next step).

**The way down made quicker** (after the last pass, 17 November 2026). Profiled in Node (`node --cpu-prof
tools/measure-down.mjs`): nearly all of the way down was the globe's pixels, and most of that was a call a pixel that gave
back a colour too large to pass without being boxed, and numbers kept in the module's own variables (made anew each time
they change). Now a span of eight pixels whose ends meet the globe is painted as one run (`render/globe.ts paintRun`), its
values read once from a typed array; the colour tables are flat; the air's sky is drawn a span at a time, a span wholly
under the horizon passed over. Every pinned frame came out the same; then relief was added on the way down (a few tenths
of a ms). Node, 456 × 256, the whole way down, ms a frame (a fight at the same size in brackets): overhead 7.1 → 3.7
(2.5), from behind 9.4 → 5.6 (3.2), from the seat 10.3 → 7.2 (5.5). The built site, 1366 × 768, the processor slowed
(`node tools/slow-machine.mjs <url> 4,6 laptop down,whole,fight`):

| Slowed | A fight (top, behind, seat) | The way down, a third in each view (was) | The whole way down in one view |
| ------ | --------------------------- | ---------------------------------------- | ------------------------------ |
| ×4     | 60, 59, 60                  | 44, 51, 59 (27 to 38)                    | 51, 53, 52                     |
| ×6     | 43, 42, 37                  | 29, 33, 39 (17 to 21)                    | 32, 33, 33                     |

So the way down is now within about a fifth of a fight's frame rate at the same slowdown, not yet level with it. What is
left is the globe's work a pixel (its map read where the ground is far below, scattered through 4 MB of a world's
materials) and the air's sky; the next step is the ground's materials laid out in tiles so neighbouring pixels read
neighbouring memory, or keeping the far globe a frame as the overhead disc is.

**Corrected, and the next step taken** (polish step 8, 18 November 2026). `tools/slow-machine.mjs` had set a view the
camera never read (`params.view`), so every number above, in every column, was overhead. It changes the camera rig now.
The tiled layout was tried and gave nothing (the reads are scattered by the globe's turn, not by the layout); what worked
is reading the ground and the globes' maps from levels as fine as the frame needs (every 2nd, 4th, 8th or 16th px kept,
`render/globe.ts levelFor`), so far ground reads a small map, near together, and the clouds' turn wrapped once a span.
Node, the way down alone, ms a frame: from behind 6.4 → 5.8, from the seat 9.1 → 8.3, overhead as it was. The built
site, frames a second, with the views really changed (the whole way down in one view; a fight in brackets):

| Slowed | Overhead     | From behind  | From the seat |
| ------ | ------------ | ------------ | ------------- |
| ×4     | 55 → 54 (60) | 38 → 40 (41) | 35 → 37 (32)  |
| ×6     | 35 → 35 (45) | 24 → 26 (27) | 23 → 25 (19)  |

From behind the way down is level with a fight, from the seat quicker; overhead it is 78 to 90% of the overhead fight,
which is the cheapest frame in the game. The dearest moment is a third of the way down from the seat (25 at ×4, 16 at
×6, against a fight's 32 and 19). A fight from behind or the seat on a slow machine (19 to 27 at ×6) is now as dear as
the way down; both are the globe and the world drawn in perspective.

## 21. Testing

- **Pinned frames stay.** The nine scripted flights keep guarding the existing picture. Each
  new feature adds scripted flights of its own.
- **World fingerprints.** Each of the 40 worlds is built and hashed in a test, and the same
  test runs in Chrome, Firefox and Safari to prove every player gets the same terrain. Built in
  Phase 3 for all 68 worlds (`world/worlds.spec.ts`), with a scan for inexact arithmetic in
  terrain code; it runs in Node only so far, not yet in the three browsers.
- **Galaxy snapshot.** The generated galaxy description is pinned, so an accidental change
  to generation is caught. Built in Phase 3 (`galaxy/galaxy.spec.ts`).
- **Rules are order-independent.** Feed the same events in shuffled orders and check the
  resulting territory is identical.
- **Netcode under bad conditions.** The same-browser transport gets adjustable delay, jitter
  and loss, so sync can be tested without a network.
- **Play tests.** Feel cannot be automated. Each roadmap gate is a play session.
- Built in Phase 6: seven scripted flights in space (`space/flights.spec.ts`): leaving a world for
  space, cruising to another body and descending, a jump through a gate, a black hole run,
  docking and banking at a station, a dogfight in an asteroid belt, skimming a gas giant; each
  checks what it was written to show. `tools/space.mjs` plays space in a browser (laptop, phone).
- Built in Phase 7: the rule is fed the same 600 events in six shuffled orders with repeats and
  gives the same state (`galaxy/territory.spec.ts`); five scripted flights (`traces/flights.spec.ts`:
  a flag planted and the world changing hands, a beacon read and a wreck salvaged on a quiet world, a
  hotspot mined, a world named by the first to land, a ghost recorded and another shot); relays in
  memory and players never online together (`net/chronicle.spec.ts`, `net/persistent.spec.ts`); a
  room (`net/session.spec.ts`). `tools/factions.ts` plays it in a browser (laptop, phone).

- Built in Phase 8: twelve scripted flights (`ships/flights.spec.ts`: flak fitted, seen and fired; a
  mining laser and a cannon; missile racks and no guns; mines on a chaser; a fitted ship repainted;
  every hull fitted out; the hangar and the deck walked; a fighter's then a hauler's rooms; furniture
  placed, taken up and placed again; a squad's slipstream; gear on an ice world); every fit of every hull against the
  quarter rule (`data/loadout.spec.ts`); the save's ships and their migration (`save/store.spec.ts`);
  a room (`net/session.spec.ts`: a make and paint seen and changed, a mine seen, a deck shared and a
  ship visited, a squad of three formed and left). `tools/hangar.mjs` plays it in a browser.

- Built in Phase 9: the first sortie flown by a scripted stranger who only does what the prompts say,
  both sides, and shot down half way (`tutorial/tutorial.spec.ts`); two scripted flights
  (`tutorial/flights.spec.ts`: training drones with the guide on each, the mouse steering while diving
  and climbing); a save kept and brought back by file, by phrase, and from a sealed copy on relays in
  memory with only the phrase (`save/backup.spec.ts`); keys and controller buttons remapped
  (`input/input.spec.ts`); an old build hearing a newer one's presence (`net/chronicle.spec.ts`); the
  tips; the music's choices (`audio/score.spec.ts`). 25 flights re-recorded for the radar's and the
  bases' marks.

- Built in the polish pass (enemies that belong to places): five scripted flights
  (`locals/flights.spec.ts`: a quiet flight through a home system, an ambush at a gate, a derelict
  cleared and staying clear, a patrol defending its world, a loaded ship chased and escaping), each
  checking what it shows; the flights written before keep their pictures with the galaxy's own ships
  left out (`locals: false`, the scripted flights' default); a room (`net/session.spec.ts`: the lowest
  key flies the bands, each game sees a patrol on its own side or the other's, a band beaten stays
  beaten when another takes over); `tools/locals.ts` plays a quiet and a dangerous ten minutes.

- Built in the polish pass (items 4 to 6: true scale, black space, every view): the seven flights in
  space rewritten for the true scale and nine more (`space/flights.spec.ts`: up out of a world from
  behind and from the seat, down to a world overhead, from behind and from the seat, down to a barren
  moon, cruising past a gas giant from behind, a dogfight in space from the seat, docking from
  behind), each checking what it shows (the zone changed, the ship low over the place it flew to, the
  drive fast, the giant passed close); a room (`net/session.spec.ts`: a pilot going down to a world
  sinks and burns for those left in space, changes room on the way, and comes down among those on
  the world); the galaxy re-pinned for its size. Every frame in space re-recorded, and those of the
  galaxy's own ships that are in space. `tools/space-sheets.ts` draws the sheets to judge it by;
  `tools/measure.mjs` times space in every view and the way down.

**Built in the last pass of the polish:** `interior/rooms.spec.ts` (every piece's picture covers its footprint in every
facing; every hull's fit-out on the grid, flush to its walls, mirrored, nothing by a doorway, walkable; the walls' joins;
the hangar's and the deck's pieces); `tools/terrain-browsers.mjs` (every world's terrain built in Chromium, Firefox and
WebKit and compared with the pinned fingerprints: identical in all three); `tools/playthrough.mjs` (the parts of the
game no other browser tool plays, laptop and phone, against the dev server or a `VITE_PLAYTEST=1` build);
`tools/together.mjs` (three pilots through the real relays: a squad, a visit aboard, a fight, a crate, both on foot, a
stolen ship, a flag); `tools/long-run.mjs` (an hour, memory and frame rate each minute); `tools/download-size.mjs`.

## 22. Roadmap

Each phase ends in something playable and a question to answer before going on. Sizes are
relative to each other (S, M, L, XL). I have not estimated calendar time.

### Milestone 1: Dogfight

| Phase | Name           | Size | Delivers                                                                 | Gate                                   |
| ----- | -------------- | ---- | ------------------------------------------------------------------------ | -------------------------------------- |
| 0     | Foundations    | M    | Fixed step, zone interface, entities, many ships, action map, save store | Existing pinned frames still pass      |
| 1     | Combat alone   | M    | Cannon, hull and shield, damage smoke, drones, flight HUD, basic sound   | Is shooting things fun for 10 minutes? |
| 2     | Two in the sky | L    | Identity, callsign and faction pick, rooms, live sync, PvP, kill feed    | What share of connections fail?        |

Phase 1 is built (November 2026): guns, missiles, damage, ten hulls' stats, computer pilots,
a skirmish of waves with a score, the flight HUD, synthesised sound, smaller ships and a
faster renderer. Tuning was done by watching scripted flights and a simple scripted pilot (it
clears the first three or four waves in about three minutes and starts losing ships around the
fifth). James then played it and loved it; his one complaint, that he could not climb high
enough, was answered by raising the ceiling from 300 to 1500 px (section 6, "Surface flight").

Phase 2 is built (November 2026): see section 18, "Built in Phase 2". Two browsers on one
machine connected through Trystero and the public relays in about a second and fought. Its gate
is not answered: the failure rate needs real players on different networks (and phones); every
device now counts its attempts and failures, and shows and copies them from the menu.

### Milestone 2: The loop

| Phase | Name          | Size | Delivers                                                                 | Gate                                    |
| ----- | ------------- | ---- | ------------------------------------------------------------------------ | --------------------------------------- |
| 3     | Many worlds   | L    | Planet recipes, eight archetypes, barren moons, a gallery page           | Do the worlds look and fly differently? |
| 4     | Grab and bank | L    | Landing, structures, mining from the air, cargo, vault, credits, shop    | Does carrying cargo home feel tense?    |
| 5     | On foot       | L    | Eject to foot, pilot movement, foot mining, sidearm, redelivery, creator | Is being hunted on foot fun?            |

Phase 3 is built (November 2026): see section 5, "Built in Phase 3", and
`docs/art/gen/worlds.png` for one world of each kind. Its gate wants a play session; judged
from the pictures and the scripted flights, the kinds look clearly apart, and they fly apart
by their numbers (a moon climbs about 1.6 times as fast with a 900 px ceiling, a volcanic world
0.8 to 0.9 times under a ceiling of ash), but whether that is felt has not been played.

Phase 5 is built (November 2026): see sections 6, 7, 8, 9, 10, 11, 15, 16, 18 and 19, "Built in
Phase 5". Its gate (is being hunted on foot fun?) wants James to play it. It was built and tuned
from scripted flights (six new ones: out and back in, shot down and calling a ship, down in the
sea, a vein, a stolen ship, strafed), looked at frame by frame, and played in a browser on a
laptop and a phone held sideways (`tools/walk.mjs`). What was changed to make it fun: raiders at
first never hit a pilot on foot (their wander is many times his size, and shots at his chest that
missed flew on), so they now aim at his feet with a steadier line and shots into the ground near
him hurt; the glide was given more reach (its steering from 24 to 34 px a second), since the
archipelago's sea drowned nearly every pilot shot down; healing waits longer, so hits stick; the
stride was shortened so the legs keep up with the ground. Not built: chat, beacon phrases, gear
tiers, the backpack on the base's screen, raiders that land, a stolen ship's own pilot hunting it.

Phase 4 is built (November 2026): see sections 5, 6, 7, 8, 11, 16, 18 and 19, "Built in Phase 4".
Its gate (does carrying cargo home feel tense?) wants a play session. It was tuned with a bot
(`tools/sorties.ts`) and by looking at frames: at first the trip home took 5 to 12 s and every
loss came while mining, not on the way home; so ore was kept 300 px from the bases, the raiders'
rest (40 s) was made to run slowly with an empty hold and five times faster with a full one (as
the square of how full), and they come from ahead, between a loaded ship and home. A bot that
fights back now banks 2 to 4 Corsair loads in 8 minutes and loses 0 to 2; a Mule fills in about
2.5 minutes and lost 3 loads of 4 alone. Not built: hotspots, daily tasks, the on-foot half of
the loop, stealing parked ships, hulls for credits.

### Milestone 3: The galaxy

| Phase | Name     | Size | Delivers                                                                   | Gate                                  |
| ----- | -------- | ---- | -------------------------------------------------------------------------- | ------------------------------------- |
| 6     | Space    | XL   | Space zone, suns, giants, moons, belts, black holes, gates, stations, maps | Is travel quick and worth looking at? |
| 7     | Factions | L    | Territory, persistent events, relays, presence, hotspots, traces           | Does the map change between sessions? |

Phase 6 is built (November 2026): see sections 4, 6, 11, 16, 18, 20 and 21, "Built in Phase 6".
Its gate (is travel quick and worth looking at?) wants James to play it. Judged from scripted
journeys and frames: quick, yes (27 s world to world in a system; under 2 minutes home to home by
the shortcut). Worth looking at: the worlds from space are the best of it (each its real
terrain, clouds and air); black holes and gates read well; the gas giants are good from afar and
blotchy close to; suns read as suns but are plainer than the mockup's; stations are serviceable,
their kit assembled a little stiffly. What was changed to make travel less dull: the cruise drive
no longer drops out at every rock ahead (it did, and crossing a belt meant pressing it again and
again) but throttles back among rocks, so a belt is a stretch to weave through; it no longer
drops out passing a station, nor in a world's pull (only a sun's, giant's or hole's), since
climbing out of a world began with the drive refusing; raiders watch the gates (three times as
soon near one), so a jump is a moment of danger; derelicts send drones at a pilot passing near;
a sun burns and a giant crushes a ship that crosses too near, so a straight line is not always the
way (they pulled it too, until 2026-11-18: only a black hole pulls now). Not done: anything to see or dodge in the long open stretches between bodies but the stars
and the occasional raid; a quick way to judge whether a black hole run will go before trying.

Phase 7 is built (November 2026): see sections 5, 8, 12, 13, 14, 15, 16, 18, 19 and 21, "Built in
Phase 7". Its gate (does the map change between sessions?) is answered yes in the tests and once over
the public relays: a flag planted by one pilot holds the world for another who comes an hour later,
through relays alone (one slow, one repeating, one forgetting, one refusing, one down), and a week on
the world is nobody's again; a wreck is stripped by a second player two hours after it fell; a world
named by its first lander is so named for the next; and a fresh session read a check event back from
the eight public relays that took it and saw w9 held. Whether the map changes in play depends on
players: with one pilot it changes only as he changes it, and fades. Not built: traces in space, a
ghost race with a result, chat across a zone's copies, squads (Phase 8).

### Milestone 4: Depth

| Phase | Name             | Size | Delivers                                                          | Gate                              |
| ----- | ---------------- | ---- | ----------------------------------------------------------------- | --------------------------------- |
| 8     | Ships and hangar | L    | More hulls, weapons, modules, paint, hangar, station deck, squads | Do players care about their ship? |
| 9     | First session    | M    | Guided first sortie, key backup, settings, touch, music, balance  | Can a stranger play with no help? |

Phase 8 is built (November 2026): see sections 6, 7, 8, 9, 10, 16, 18, 19, 20 and 21, "Built in
Phase 8". Its gate (do players care about their ship?) wants players. Judged from the pictures: the
hangar and the deck look like their mockups and read well; the ships' rooms read as their hulls'
outlines but are plainer than the mockup (dark, few props unless furnished); fitted parts show as
distinct pieces on the bigger hulls and as small lumps on the light ones (a part is 3 to 14 pixels);
patterns read on plain hulls and get lost in a busy hull's markings. Not built: more hulls than the ten;
selling a hull back; a ship's own name; shared computer wingmen; checking another's fit against his
log.

Phase 9, first part (the first session) is built (November 2026): see sections 15, 16, 17, 19 and 21,
"Built in Phase 9". Its gate (can a stranger play with no help?) needs a stranger. Proved as far as it
goes without one: a scripted player who reads only the prompts finishes the first sortie in Node (both
sides, about two minutes; shot down half way and still finishing) and in a browser from a fresh save on a
laptop with keys and mouse and on a phone held sideways with the touch buttons (about 70 s each at a
bot's speed; a person reading would take three to five minutes). Its slowest steps are the dive (about
17 s of holding the dive key from the arrival height) and the drones (15 to 50 s for the bot). Playing it
in a browser found two touch bugs that had been there since before (a touch button's finger steered; a
still finger let go), and one of this phase's (a key held was let go whenever the save changed).

The first hour, with James's word that the endless waves must go: no raiders come at a pilot in his own
side's home system (`RAID.ownHome`), and income is mining, never kills. Measured with `tools/first-hour.ts`
(a bot mining at its capital world's base, selling at today's prices, buying the cheapest part it can):
with the home system paying the standard, the bot bought its first part in 2 to 3 minutes and six in
14 to 22; so a home system's bases now pay 60% (`HOME_PAY`, galaxy/market.ts), the safe place the slow
living: first part 3 to 4 minutes, six parts in 20 to 34 (the Nomarchy's capital; the Anarchoi's is richer).
A person mines at perhaps a third to a half of the bot's pace, so his first part comes about 8 to 12
minutes after the first sortie, within the quarter hour; starting credits stay 250. He is never stuck:
the Corsair is free, home's ore comes back on the clock, and nothing hunts him there. The front line is a
gate away (about a minute out at cruise), where the waves still come: a bot that fights back, on the
nearest frontier world, lost 3 Corsair loads of 5 in ten minutes (2 of 6 without fighting); the third wave
brings missiles, which the bot never rolls away from.

The first hour again, once enemies belonged to places (the polish pass): `tools/first-hour.ts` now calls a
new ship when shot down, runs home when ambushed, and goes home when its hold stops filling. The same bot,
an hour each, before (waves) and after (bands): the Nomarchy's capital world unchanged (55 sorties, 2097
units, 8212 credits, nothing lost; first part 3.4 minutes, six by 25); the frontier next door (Lubaek, its
side's patrol between the bases) about the same (before 60 sorties, 14,916 credits, 1 raid, nothing lost;
after 61, 15,060, 2 ambushes, nothing lost: the patrol beats the raiders that come); the deep frontier
(Goliis, no patrols) harder (before 54 sorties, 13,257, 6 loads lost; after 67, 13,761, 10 lost). Home is
the slow, safe living; the frontier pays nearly twice as much, and deeper out it costs ships.

Notes on order:

- Phases 3 and 6 depend little on 4 and 5 and can be pulled forward if the universe matters
  more to you than the loop.
- The game can be put in front of real players after Milestone 1. Doing so early is the only
  way to learn the connection failure rate and whether the fighting holds attention.

## 23. Risks

| Risk             | Why it matters                                    | Response                                               |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------ |
| Scope            | This is a large game                              | Gates after every phase, public play after Milestone 1 |
| Empty galaxy     | Always-on PvP with nobody to fight                | Hotspots, front lines, presence on the map, NPCs       |
| Connections fail | Some players cannot see each other                | Measure in Phase 2, then decide on a relay fallback    |
| Art volume       | Hulls, stations, portraits, tiles, eight palettes | Generate from kits where possible, decide art source   |
| Renderer speed   | Software drawing with a full room                 | Measure early, cap visible ships, simplify far ones    |
| Public relays    | They may refuse, throttle or forget our events    | Several relays, local copies, direct exchange in rooms |
| Lost pilots      | Cleared browser data deletes a pilot              | Key backup prompt, export file, optional relay backup  |
| Old builds       | A cached old version meets a new one              | Versions in room names, an update prompt               |

Built in Phase 9, for those two: the reminder, the phrase, the file and the sealed copy on the relays, and
restoring from the title (section 15); the browser asked to keep the site's data once the key is kept.
What cannot be helped: a pilot who never kept his key one way or another is still lost with the browser's
data. Old builds: room names carry the wire's version, so builds of different wires never meet; an old
one now says so (a newer site, or a newer wire in a pilot's presence) and offers to reload (section 16).
| Cheating | No authority | Accepted for now, property kept as a checkable log |
| One side wins | With two factions the stronger side can snowball | Underdog influence bonus, joining bonus, fading flags |
| Griefing | Spawn camping, hunting new pilots | Spawn protection, home turrets, farming limit |
| Abuse in text | Chat and callsigns with no moderation | Local mute and block, preset beacon phrases |
| Touch devices | Many more controls, small screens, slower chips | Touch layouts with every feature, test on a real phone |
| Mobile networks | Phone carriers block direct connections more | Include phones in the Phase 2 connection measurement |

## 24. Out of scope for the first release

- Multi-crew ships.
- Trading between players.
- Changing terrain permanently (digging, building anywhere).
- Player-built bases.
- Chase and cockpit views in space.
- Flying inside a gas giant's clouds.
- Anti-cheat.
- A desktop app build.
- Clans or guilds beyond squads.

## 25. Open decisions

These are the choices I most need from you. My proposal is given for each.

1. **Faction names and flavour.** Concept agreed: the Nomarchy against the Anarchoi. The names
   are still placeholders.
2. **Control changes.** Decided: fire takes the left button, roll moves to Space and view to
   V, as in the controls table.
3. **Art source.** Decided: all art is generated on this PC, by a local image model with
   code turning its pictures into game assets. The demo's jet and pilot art are scrapped.
4. **Relay fallback.** If Phase 2 shows many failed connections, do we add a relay server?
   It would be the one piece of server infrastructure. Proposal: decide on the measurement.
   Since Phase 2 every device counts its attempts and failures (menu, connection screen).
5. **Nostr for identity and persistence.** Decided: yes, unless the relay checks in Phase 2
   rule it out.
6. **Space handling.** Decided: the same arcade handling as in atmosphere. Built so in Phase 6
   (level, overhead only, with a cruise drive and gravity's drift); to be confirmed by playing.
7. **What death costs.** Decided: cargo and a fee, never the hull. Redelivery to a pilot on
   land, respawn at the nearest friendly station or base otherwise. Ejecting over the sea
   is death.
8. **Parked ships.** Decided: can be destroyed, and can be stolen by an enemy pilot on foot.
9. **Friendly fire.** Decided: off.
10. **Changing faction.** Decided: permanent for a pilot. A new pilot can choose again.
    Factions get strong identities and their own races.
11. **Touch support.** Decided again, 2026-11-19 (James: "this game is now purely intended for desktop mouse and
    keyboard. If someone is on a narrow device like that just point them to the github and tell them to get a PC"):
    a desktop with a mouse and a keyboard only (a game controller still works). A phone or a tablet is shown a page
    that says so and links to the code (section 16, "Desktop only"). It was: phones and tablets first-class, every
    feature with touch controls.
12. **Order.** Decided: loop before galaxy, as in the roadmap.
13. **Number of factions.** Decided: two.
14. **Ships.** Decided: spaceships, not jets, and the demo's jet is scrapped. 8 to 10 base
    hulls shared by both factions, coloured by the player, upgraded with visible modules and
    weapons. Interiors match the hull's shape and size: a small fighter has almost none.
15. **Races.** Decided: three per faction, six in total. Solari, Kestrin and Orrin for the
    Nomarchy; Skarn, Noctil and Thallin for the Anarchoi.
