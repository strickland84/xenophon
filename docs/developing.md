# Developing Xenophon: Twin Stars

The developer's guide (it was the README until the game went public). A pixel-art dogfight over islands, drawn by a small software
renderer: each ship is a solid of voxels, carved from the image model's pictures of it from above, the side and behind,
drawn as a stack of horizontal slices turned to any angle (a "sprite stack"),
and the islands and clouds are stacks too. Three views share one camera — overhead, behind
the ship, and from the cockpit. Today it is the game's eighth phase: a pilot picks a callsign
and a side (the Nomarchy or the Anarchoi), and flies over any of the galaxy's 40 habitable worlds
and 28 barren moons, each looking and flying its own way, against raiders who wait in the
frontier's wild places, each side's computer patrols and, online, the other side's pilots. Every world has bases and ore: he launches
from a pad, cuts ore with his mining laser, and must get it home and land to bank it, slower
and worth shooting while he carries it. Out of his ship he is a tiny pilot on foot, one of six
races of his own making: shot down, he comes down on foot and carries on, hunted. And the
galaxy is a place: he climbs out of a world into its star system's space, cruises past suns,
gas giants, belts and black holes to stations, gates and other worlds, and goes down to any of
them. And the galaxy remembers: the two sides hold worlds by planting flags, delivering ore and
fighting over them, pilots leave wrecks, graves, beacons and ghosts for others to find, the first to
land on a world names it, and the maps show who holds what, where the pilots are and the day's
hotspots; none of it needs a server. And his ship is his own (the eighth phase): he buys hulls and
keeps them, fits guns, pods and modules that show on the hull, paints every colour of it, walks his
hangar, the station deck and his ship's rooms and furnishes them, and flies in a squad. And (the ninth
phase) a stranger can start alone: a guided first sortie teaches one control at a time on whatever he
plays with, the game asks him to keep his pilot's key safe, every key and button can be changed in the
settings, quiet music follows him about, and an old build says so. The plan for the
rest is [docs/implementation-plan.md](implementation-plan.md).

Built with SvelteKit (Svelte 5) and TypeScript. The site is static: there is no server code,
and no server of ours. Players find each other through public Nostr relays and then talk
directly, browser to browser, over WebRTC ([Trystero](https://github.com/dmotz/trystero));
[docs/serverless-multiplayer-research.md](serverless-multiplayer-research.md) says why.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
```

| Command                              | What it does                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| `npm run dev`                        | dev server with hot reload                                         |
| `npm run build`                      | production build into `build/` (plain static files)                |
| `npm run preview`                    | serve the production build locally                                 |
| `npm run check`                      | type-check (`svelte-check`)                                        |
| `npm run lint`                       | Prettier and ESLint                                                |
| `npm test`                           | unit tests, including the renderer's frame tests (~100 s)          |
| `npm run test:record`                | re-record the renderer's frames after an intentional change        |
| `node tools/measure.mjs`             | time a frame with 1 and 16 ships, and a dogfight, per view         |
| `node tools/measure-down.mjs`        | time the way down to a world by tenths of it, against a fight      |
| `node tools/film.mjs`                | play a scripted flight and write a sheet of its frames             |
| `node tools/look.mjs`                | fly a scene with any settings and write a sheet of frames          |
| `node tools/measure-worlds.mjs`      | time building a world of each kind                                 |
| `node tools/sites.mjs`               | draw a world's bases, ore and wrecks from above                    |
| `npx jiti tools/sorties.ts`          | a bot flies sortie after sortie, to tune the loop by               |
| `node tools/play.mjs`                | play a sortie in a real browser and take screenshots               |
| `node tools/walk.mjs`                | play being on foot in a browser (laptop and phone)                 |
| `node tools/space.mjs`               | play space in a browser: out, the maps, a gate, a station          |
| `npx jiti tools/space-sheet.ts`      | draw one of each kind of body in space to a PNG                    |
| `npx jiti tools/space-sheets.ts`     | draw the way down, the way up, the views in space, black space     |
| `npx jiti tools/race-sheet.ts`       | draw the six races (portraits, sprites, falls) to a PNG            |
| `npx jiti tools/factions.ts`         | play the persistent world in a browser (laptop and phone)          |
| `npx jiti tools/relay-check.ts`      | check public relays take and keep the game's events                |
| `npx jiti tools/loadout-sheet.ts`    | draw a hull bare and fitted and painted three ways                 |
| `npx jiti tools/interior-sheet.ts`   | draw the hangar, the deck and two ships' rooms                     |
| `npx jiti tools/hangar-shot.ts`      | a place inside as a page of a given size shows it, to a PNG        |
| `npx jiti tools/inside-sheets.ts`    | frames of the pilot by his ship, every cockpit, every kind of room |
| `uv run tools/inside-sheets.py`      | lay those frames out into the polish pass's sheets                 |
| `npx jiti tools/props-sheet.ts`      | every piece inside, every facing, on the grid (`tiles.png`)        |
| `npx jiti tools/pattern-icons.ts`    | the paint booth's picture of each pattern                          |
| `node tools/hangar.mjs`              | play the hangar, the bench, the booth, the deck in a browser       |
| `node tools/first-session.mjs`       | a stranger plays the first sortie by its prompts (laptop, phone)   |
| `node tools/phone-check.mjs`         | every screen at phone (or `--laptop`) size, checked and counted    |
| `node tools/interface-sheet.mjs`     | the interface's sheets: the screens seen most, the HUD by place    |
| `node tools/sound-check.mjs`         | play every sound in a browser, mix scenes, measure them            |
| `npx jiti tools/first-hour.ts`       | a new pilot's first hour of earning, to tune the numbers by        |
| `npx jiti tools/locals.ts`           | a quiet and a dangerous ten minutes, flown by scripted pilots      |
| `node tools/playthrough.mjs`         | the rest of the game played through in a browser, step by step     |
| `node tools/together.mjs`            | three pilots through the real relays: squad, aboard, fight, steal  |
| `node tools/terrain-browsers.mjs`    | every world built in Chromium, Firefox and WebKit, compared        |
| `node tools/slow-machine.mjs`        | frame rates with the processor slowed, every view and place        |
| `node tools/long-run.mjs`            | an hour's play by a script, its memory and frame rate each minute  |
| `node tools/download-size.mjs`       | what the built site downloads, and when                            |
| `node tools/audit.mjs`               | capture every screen and place at 1366 × 768 for the art audit     |
| `uv run tools/audit-sheets.py`       | lay the audit's pictures out as contact sheets                     |
| `npx jiti tools/players.ts`          | six kinds of scripted player, half an hour each, and their pacing  |
| `npx jiti tools/ship-turntable.ts`   | every hull at twelve headings in every view, posed, from the seat  |
| `npx jiti tools/ship-close.ts`       | hulls close to, overhead and from behind, the side and the front   |
| `npx jiti tools/chase-frame.ts`      | whole frames from behind, to judge how the camera shows a ship     |
| `npx jiti tools/power-sheet.ts`      | the ship powered off, powering up and on, landed and docked        |
| `npx jiti tools/pattern-sheet.ts`    | every paint pattern on three hulls, overhead and from behind       |
| `npx jiti tools/side-cards.ts`       | the side cards' pictures, drawn by the game                        |
| `npx jiti tools/creature-sheet.ts`   | each creature on its world beside a pilot, and a kill's drops      |
| Command                              | What it does                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| `npm run dev`                        | dev server with hot reload                                         |
| `npm run build`                      | production build into `build/` (plain static files)                |
| `npm run preview`                    | serve the production build locally                                 |
| `npm run check`                      | type-check (`svelte-check`)                                        |
| `npm run lint`                       | Prettier and ESLint                                                |
| `npm test`                           | unit tests, including the renderer's frame tests (~100 s)          |
| `npm run test:record`                | re-record the renderer's frames after an intentional change        |
| `node tools/measure.mjs`             | time a frame with 1 and 16 ships, and a dogfight, per view         |
| `node tools/measure-down.mjs`        | time the way down to a world by tenths of it, against a fight      |
| `node tools/film.mjs`                | play a scripted flight and write a sheet of its frames             |
| `node tools/look.mjs`                | fly a scene with any settings and write a sheet of frames          |
| `node tools/measure-worlds.mjs`      | time building a world of each kind                                 |
| `node tools/sites.mjs`               | draw a world's bases, ore and wrecks from above                    |
| `npx jiti tools/sorties.ts`          | a bot flies sortie after sortie, to tune the loop by               |
| `node tools/play.mjs`                | play a sortie in a real browser and take screenshots               |
| `node tools/walk.mjs`                | play being on foot in a browser (laptop and phone)                 |
| `node tools/space.mjs`               | play space in a browser: out, the maps, a gate, a station          |
| `npx jiti tools/space-sheet.ts`      | draw one of each kind of body in space to a PNG                    |
| `npx jiti tools/space-sheets.ts`     | draw the way down, the way up, the views in space, black space     |
| `npx jiti tools/race-sheet.ts`       | draw the six races (portraits, sprites, falls) to a PNG            |
| `npx jiti tools/factions.ts`         | play the persistent world in a browser (laptop and phone)          |
| `npx jiti tools/relay-check.ts`      | check public relays take and keep the game's events                |
| `npx jiti tools/loadout-sheet.ts`    | draw a hull bare and fitted and painted three ways                 |
| `npx jiti tools/interior-sheet.ts`   | draw the hangar, the deck and two ships' rooms                     |
| `npx jiti tools/hangar-shot.ts`      | a place inside as a page of a given size shows it, to a PNG        |
| `npx jiti tools/inside-sheets.ts`    | frames of the pilot by his ship, every cockpit, every kind of room |
| `uv run tools/inside-sheets.py`      | lay those frames out into the polish pass's sheets                 |
| `npx jiti tools/props-sheet.ts`      | every piece inside, every facing, on the grid (`tiles.png`)        |
| `npx jiti tools/pattern-icons.ts`    | the paint booth's picture of each pattern                          |
| `node tools/hangar.mjs`              | play the hangar, the bench, the booth, the deck in a browser       |
| `node tools/first-session.mjs`       | a stranger plays the first sortie by its prompts (laptop, phone)   |
| `node tools/phone-check.mjs`         | every screen at phone (or `--laptop`) size, checked and counted    |
| `node tools/interface-sheet.mjs`     | the interface's sheets: the screens seen most, the HUD by place    |
| `node tools/sound-check.mjs`         | play every sound in a browser, mix scenes, measure them            |
| `uv run tools/audio/engine_sheet.py` | the engines' spectrograms, old against new (`engine-sounds.png`)   |
| `npx jiti tools/first-hour.ts`       | a new pilot's first hour of earning, to tune the numbers by        |
| `npx jiti tools/locals.ts`           | a quiet and a dangerous ten minutes, flown by scripted pilots      |
| `node tools/playthrough.mjs`         | the rest of the game played through in a browser, step by step     |
| `node tools/together.mjs`            | three pilots through the real relays: squad, aboard, fight, steal  |
| `node tools/terrain-browsers.mjs`    | every world built in Chromium, Firefox and WebKit, compared        |
| `node tools/slow-machine.mjs`        | frame rates with the processor slowed, every view and place        |
| `node tools/long-run.mjs`            | an hour's play by a script, its memory and frame rate each minute  |
| `node tools/download-size.mjs`       | what the built site downloads, and when                            |
| `node tools/audit.mjs`               | capture every screen and place at 1366 × 768 for the art audit     |
| `uv run tools/audit-sheets.py`       | lay the audit's pictures out as contact sheets                     |
| `npx jiti tools/players.ts`          | six kinds of scripted player, half an hour each, and their pacing  |
| `npx jiti tools/ship-turntable.ts`   | every hull at twelve headings in every view, posed, from the seat  |
| `npx jiti tools/ship-close.ts`       | hulls close to, overhead and from behind, the side and the front   |
| `npx jiti tools/chase-frame.ts`      | whole frames from behind, to judge how the camera shows a ship     |
| `npx jiti tools/pattern-sheet.ts`    | every paint pattern on three hulls, overhead and from behind       |
| `npx jiti tools/side-cards.ts`       | the side cards' pictures, drawn by the game                        |

## The first session

A new pilot picks a callsign, a side and a look, and starts docked at his side's capital station. A
small box at the top says one thing at a time, in the keys and buttons he is using, and waits for him:
launch, steer to the capital world (the arrow shows the way), go down to it, dive low, shoot three
training drones (white and orange: they never fire back), mine an outcrop and scoop up the ore, land on
an outpost's pad, get out, plant a beacon, get back in, fly home and land to bank. Then the galaxy map
opens on today's hotspots and he is on his own. Skip and End are on the box (and in the menu); shot down
or killed half way, it says how to get back on and carries on. No raiders come at a pilot in his own
side's home system, so he can learn and look round in peace; the danger, and the better pay, are beyond
it (his side's patrols and haulers go about their business round him). Later things get a one-line tip the
first time they come up (the cruise drive, gates, the hangar, the shop, flags, squads, missiles, the roll,
the first ambush). [docs/art/gen/tutorial.png](art/gen/tutorial.png).

**Keep your pilot.** Everything is in the browser. After the first session the game asks him to keep
his key: a file, or a phrase to copy (his Nostr key, `nsec1…`), and, if he likes, a sealed copy of his save
on the relays, which only his key opens, so the phrase alone brings him back on another device. It asks
again now and then until he has. **Restore** on the first screen takes the file or the phrase.

## Flying and fighting

|                                     | Mouse & keys                         | Touch                     | Game controller         |
| ----------------------------------- | ------------------------------------ | ------------------------- | ----------------------- |
| Steer (the mouse a stick, as Elite) | the mouse / A D / arrows             | touch and drag            | left stick              |
| Thrust up / down (down lands)       | Alt / Ctrl                           |                           |                         |
| Thrust sideways, left / right       | Q / E                                |                           |                         |
| Throttle (X: all stop)              | W and S, or the wheel                | slide the lever           | right stick             |
| Climb and dive (up climbs)          | the mouse, or the up and down arrows | hold **Dive** / **Climb** | left stick              |
| Guns                                | left button, or K                    | hold **Fire**             | R2 / RT                 |
| Missile, if locked                  | right button, or L                   | **Missile**               | □ / X                   |
| Thrusters                           | hold Tab (or Shift)                  | hold **Boost**            | L2 / LT, as far as held |
| Roll (and dodge)                    | Space                                | swipe, or **Roll**        | ✕ / A                   |
| Land, take off, mine (hold)         | F                                    | hold **Action**           | ○ / B                   |
| High up: out into space             | hold F                               | hold **Action**           | hold ○ / B              |
| In space: dock, go down, jump, skim | hold F                               | hold **Action**           | hold ○ / B              |
| Next view                           | V                                    | **View**                  | △ / Y                   |
| Map                                 | M                                    | **Map**                   | touchpad / Select       |
| Cruise drive (in space)             | J                                    | **Cruise**                | R1 / RB                 |
| Hold and vault                      | I                                    | **Bag**                   | D-pad up                |
| Chat and the quick-chat wheel       | Enter                                | **Chat**                  | D-pad right             |
| Menu                                | Escape                               | **Menu**                  | Options / Start         |
| Into the hangar (landed at a base)  | H                                    | **Ship**                  |                         |
| Get out (landed, a tap)             | F                                    | tap **Action**            | ○ / B                   |
| The ship's power (landed or docked) | P                                    | **Power**                 | D-pad down              |

On a touch screen only what can be used shows (Missile while there are missiles or mines aboard, Cruise in space); View,
Map, Chat, the Bag and Ship (landed at a friendly base or docked) and Menu are a press away under **More**.
Menu opens the menu (where you are and the screens as tiles; the sky and the pilot's file a tab away). These are the
default bindings, the plan's controls table (section 16), in `src/lib/input/bindings.ts`: every key and
controller button can be changed in Settings, and the guns and thrusters can be switches instead of held.
Where there are bases, the next ship is chosen only landed at a friendly one. A ship landed or docked waits with its power
off: P (or Power) brings it up in two seconds, the instruments waking one after another (holding Action to take off does
it too). Landed or docked, the weapons are safe: nothing fires.

The page steps the scene in fixed steps of 1/60 s, however fast the screen repaints.

**Fighting.** The guns heat up and jam if held too long; a small aim-assist cone turns shots onto
an enemy nearly in line, and the yellow diamond is where to aim. Hold an enemy in front for a
second and a missile locks on. When one is fired at you, the HUD says ROLL! at the moment a roll
will shake it off. Shields recharge after a few seconds clear of fire.

**Danger belongs to places.** Nothing comes at you from nowhere. Your side's home system is safe from
the computer's ships: your patrols fly between its bases and stations, and haulers go about their
business. Out on the frontier raider bands wait in places: by a world's rich ore, at an outpost's way
in (watching for loaded ships), at the gates out to wilder space, in the belts, holding the barren
moons; a derelict has its drones. They come for a ship that comes near (a loaded one is seen from much
further off), chase it, and give it up once it is off their ground or under a base's guns. Beaten, a
band stays gone for ten to fifteen minutes, the same for everyone. Each side's patrols fly in its own
space and on the front line, where both sides' meet and fight; they fight raiders and the other side's
pilots and leave their own side's alone. The deeper out, the stronger the raiders and the better the
pay: the core is the most dangerous of all. The maps show each system's danger for your side (green
square safe; one, two, three chevrons low, medium, high; the front line ringed red), a red skull where
raiders wait, and on a card who lives there; the HUD says it on arriving.

**The old skirmish**, waves of enemy ships each larger and better flown than the last with a score and
three ships, is still there for a pilot with no side over the island world (the settings' own world),
where the dogfight was first proved; it is not the game.

Hold a dive into the ground and the ship crashes the same way (`crash` setting).

## On foot

Landed in the loop, a tap of **F** (Action, ○ / B) climbs out; a hold still lifts off. The camera
pulls in (the art pixels get twice as large) and stays overhead. On foot:

|                              | Mouse & keys           | Touch                   | Game controller |
| ---------------------------- | ---------------------- | ----------------------- | --------------- |
| Walk (the way the screen is) | WASD / arrows          | drag anywhere (a stick) | left stick      |
| Run                          | hold Shift             | drag far                | L2 / LT         |
| Sidearm                      | left button, aimed     | hold **Fire**           | R2 / RT         |
| Dive                         | Space                  | **Dive**, or a flick    | ✕ / A           |
| Climb in, steal, cut, call   | F (cut and call: hold) | **Action**              | ○ / B           |
| Flare                        | right button           | **Flare**               | □ / X           |
| Beacon (choose its words)    | V                      | **Beacon**              | △ / Y           |
| Plant a flag (capture site)  | hold F                 | hold **Action**         | hold ○ / B      |

Terraces are climbed a step at a time; cliffs, buildings and deep water stop him; shallows slow
him; under trees he is hidden. His ship stands parked where he left it, canopy open: anyone can
shoot it, and an enemy pilot on foot can climb in and fly it off with its cargo (landing a stolen
ship at a friendly base pays). Veins of ore lie where no ship can set down; held Use cuts one into
his backpack (four slots, emptied into the hold when he climbs in, dropped when he dies). A beacon
marks a place with his callsign; a flare goes up for everyone to see. The sidearm turns onto an
enemy near where he aims, a pilot or a ship low enough.

Shot down, he ejects and comes down his race's way (a parachute, a wingsuit, a rotor, curled in his
shell, a wing-cloak, under his cap), steering a little: on land he lives, in the sea he drowns. Over
deep water, lava or acid it opens at once and glides, steered far (some 400 px from a low fight, 750
from 150 px up); a ring on the ground shows where he will come down (green on land, red where he
cannot live) and an arrow the way to the nearest land; raiders never wait out of a glide's reach of
land. Come down in a hollow he could not walk out of, he scrambles out onto open ground. Walked far
from his parked ship (or cut off from it), held Use calls it to him (it lifts and comes in 9 s, free).
With his ship lost, held Use calls another: it comes in 30 seconds and lands beside him (its fee is
paid then; the light ones and the Corsair are free). Killed, he drops his backpack and is back at
the nearest friendly base a few seconds later, in his ship. Raiders strafe a pilot on foot, aiming
at his feet, and lose him under trees; a friendly base's turrets shoot them over him.

Each world has its own wildlife to hunt with the sidearm (none on a barren moon): skitters and
herds of woolhorns that run from him, razorjaws and plated crawlers that stalk and charge, spitters
that keep their distance and spit globs he can step or dive out of the way of, shore crabs that guard
their patch, snapweed that snaps at whatever comes close, and now and then a great rare thornback.
Struck, a creature flashes and is knocked back, a bar showing how hurt it is; killed, it drops hide,
chitin, venom glands, now and then a glinting heartstone, and credits, taken by walking over them
(into the backpack; credits to the wallet). Every market buys them. A creature killed is gone for
everyone in the room, and back some minutes later. More hunts where the world is wilder.
[docs/art/gen/creatures.png](art/gen/creatures.png) is each kind on its world beside a pilot.

The pilot is one of his side's three races (the Nomarchy's Solari, Kestrin and Orrin; the Anarchoi's
Skarn, Noctil and Thallin), made in the creator after choosing a side and changed later from the
menu's **Your pilot**: race, face, skin, eyes, suit and trim, or Randomise. His portrait is in the
HUD's corner and the pilots list, his head in the kill feed, and others see his race and colours
in the world. [docs/art/gen/races.png](art/gen/races.png) is all six;
[docs/art/gen/on-foot.png](art/gen/on-foot.png) a pilot by his landed ship.

## Grab and bank

A pilot with a side begins landed on a pad of his side's base (or a neutral outpost). Hold
**Land** (F, the Action button, ○ / B) to lift off. Ore lies out in the open, away from the
bases: rust-red ferrite, pale silica, cyan cryo-ice, glowing magma glass, amber bioresin, each
world the ones its recipe names, and the wrecks of old crashes hold salvage. Hold Land low
near an outcrop and the mining laser cuts it: chunks of ore pop out round it, and the ship
scoops them up flying over them. It cuts faster held close and low over the outcrop. Now and then a
chunk comes out a gem (a glinting crystal worth three, thrown further, gone in 16 s): more of them
from a rich deposit and the wilder the place, so the frontier's ore pays clearly more than home's. The hold has slots by hull (a Corsair 4, a Mule 12, ten units
a slot), and a full one makes the ship about a quarter slower, wider in its turns and slower
to climb. On the frontier raiders wait by the rich ore and at an outpost's way in, and see a
loaded ship from far off; they will not follow it under a base's guns. The HUD points home with
the distance. Hold Land low over a pad (or flat ground) and the ship
brakes to a hover, sinks in a cloud of dust and settles: at a friendly base the hold is banked,
and is safe. Lost on the way, the ship spills its hold as a crate anyone can take (its owner
only after 15 seconds), and a new ship costs a fee by hull (the light ones and the Corsair are
free). Outcrops run out, and come back after a while of their own, on a clock every player
shares.

Kills pay credits (raiders by hull, more the wilder the place; pilots more, less each time the same
pilot is downed), and a raider band (or a derelict's drones) he helps beat pays his side's bounty on
it; raiders sometimes leave salvage. A pilot who only fights earns a living: ore a price asks for that
his vault lacks is made up at the counter, at twice its price, so credits alone buy any part or hull. Landed at a friendly base, the base's screen (Tab, Bag, D-pad
up, or the base's name at the top) shows the hold and the vault side by side (tap to move a
stack), the market (each base's prices drift by the day, the same for everyone; a world pays
less for its own ore), repairs and missiles, five parts and paint. A ship leaves for another
world from a friendly pad. What a pilot owns is kept in his save as a log of what happened.
Bases' turrets fire on raiders, and a side's bases on the other side's pilots too.

## Worlds

The galaxy is made from a fixed seed, the same in every browser, and nothing of it is stored:
12 star systems joined by jump lanes (the Nomarchy's home at one end, the Anarchoi's at the other,
the core between), their suns, giants, black holes, belts, bases and gates, and 68 worlds that
can be flown over. Each world has a recipe: one of eight kinds (archipelago, continental,
canyon, ice, volcanic, jungle, mesa, ocean) or a barren moon, a palette, its land, relief,
gravity and air, cloud, weather, sun and time of day, and its hazards. Gravity and air change
how a ship flies there (top speed, turn, climb and ceiling): a moon is light and airless, a
volcanic world heavy, its ash a low ceiling. Lava and acid seas burn a ship flown low over
them; storms bring wind and lightning; fog, dust, ash and snow (with whiteouts) close in until
a ship a little way off is lost in them. A red dwarf or a blue giant tints the light.

A new pilot starts at his own side's capital (the Nomarchy's is the island world the game has
always had). Other worlds are reached through space (below); where you are is kept. Each world is its own room.
`/gallery` shows every world side by side from above, with a map of each and its recipe;
[docs/art/gen/worlds.png](art/gen/worlds.png) is one of each kind.

## Space

High over a world (160 px up or more), hold Use (F, the Action button, ○ / B) and the ship
flies up out of it: about ten seconds, steered all the way, the ground falling away into a
curved horizon, the sky darkening to black and the stars coming out, the world a globe beneath
and then behind. (Keys, a stick or the pointer from behind climb too: at the ceiling, keep
climbing.) It is then in the space of the world's star system, over the place it left. Space is
black: distant stars, the sun, and the bodies at their true size (a world 1,900 to 3,400 px in
radius beside a ship of 40, a gas giant over 5,000, a sun up to 13,500). A system is a plane
about 280,000 px across, its sun (or, at the core, a black hole) in the middle, its worlds,
moons, gas giants, belts, stations and gates on their orbits, moving slowly on the clock every
player shares. The ship flies as it does over a world, always forward, level, in any of the three
views (V, the View button). Worlds and moons lie below the plane it flies in.

- **The cruise drive** (J, the Cruise button, R1 / RB): it spools for a second, then pushes the
  ship on, the faster the further it is from anything (up to 640 times its speed in open space),
  slowing of itself as a body nears. The guns are held while it cruises; being hit, firing, a
  strong pull or arriving at the end of a plotted course drops it out; among a belt's rocks it
  is held to four times. A world to the next is about 10 to 20 s on the drive. A course plotted past a
  sun, a gas giant or a black hole goes round it: the arrow says ROUND and its name.
- **Gravity:** suns, giants and black holes (and a little, worlds) pull: the ship drifts towards
  them and must be flown out. A sun's corona burns; a giant's depths crush; a black hole's middle
  is death.
- **Use**, held, does what the HUD offers: **descend** to a world from over it (a dive held does
  it too; ten seconds down through its air, steered all the way, the globe growing and flattening
  into the ground, the air burning round the ship, and out low over the place flown to; a climb
  turns back; a barren moon has no air to burn), **dock** at a friendly station
  (it banks the hold; the base's screen opens there as at a base on the ground), **jump** a gate
  (held three seconds in the ring as it charges, and out of the gate at the other end of the
  lane), **thread** a black hole's bright ring (held in it a moment: flung out of the linked one
  across the galaxy), **skim** helion gas from a giant's upper bands, **mine** a rock with ore.
- **Things there:** belts of drifting rocks that stop shots and knock a ship about, with ore to
  cut; void shards drifting round black holes, scooped by flying through them (the dearest
  thing in the game); derelicts guarded by drones, salvage strewn about them; raiders, who wait by
  the gates out to wilder space and among the belts' rocks; patrols; haulers between the stations,
  worlds and gates; other pilots. Shot down in space, a new ship waits docked at the nearest friendly
  station (or at a base of the nearest world, where a system has none).
- **The maps** (M, the Map button, the touchpad): the system, every body where it is now, and
  the galaxy, its lanes and whose home is where; pick anything for its card (what it is, whose,
  its resources, how dangerous it is and who lives there) and plot a course to it, or a route
  across the galaxy: the HUD's arrow points the way, and on a route, the way on in each system.

Each system's space is its own room, as each world is: the game moves rooms as the ship climbs
out, goes down or jumps (half way through the air). [docs/art/gen/space.png](art/gen/space.png)
shows each kind of body; [entry.png](art/gen/entry.png) the way down, [exit.png](art/gen/exit.png)
the way up, [space-views.png](art/gen/space-views.png) the three views by a world,
[space-black.png](art/gen/space-black.png) open space; [docs/art/gen/galaxy-map.png](art/gen/galaxy-map.png)
the galaxy map.

## The galaxy remembers

What pilots do that matters beyond a session is kept as events, each signed with the pilot's key:
kept in his browser, handed to the other pilots in the room, and sent to six public Nostr relays so
it is there for players who come later. Every game works the galaxy out from the events it has with
the same rule, so they agree without a server; with no relays and nobody else, it all runs on the
local copy.

- **Territory:** each of the 40 habitable worlds has influence for each side, from flags planted at
  its capture site (on foot by its outpost's mast, Action held), ore banked at its bases, and kills on
  or over it, for a week each. The side with the most holds it: its outposts become that side's
  (land, bank and respawn there, its turrets fight for them, better prices). Only worlds on a side's
  front can be contested (in or next to a system it holds a world in); the side holding fewer earns
  faster; one pilot can add only so much to a world in a day.
- **Traces:** the first to land on a world names it (from four names in his side's voice); flags
  stand a week, wrecks (a little salvage for whoever strips one) and graves three days, beacons (one
  of twelve phrases, never free text) and ghosts (a recorded flight, pale, to race or shoot) two weeks.
- **The day:** three hotspots with far richer ore, and three tasks with rewards, the same for every
  player (from the date). A pilot on a kill streak has a price, shown on the galaxy map, paid to
  whoever downs him. Rank (six badges and titles a side) comes from what he has added to his side;
  feats unlock paints. Each side starts at its own capital; the smaller side pays a bonus to join it.
- **Screens:** the maps show who holds what (and influence bars), pilots by system, bounties and
  hotspots; the menu opens the faction board (the war, tasks, top pilots, feats), pilots nearby (mute
  and block by key), recording a ghost, and the relays. Chat (Enter, Chat) has a quick-chat wheel.

[docs/art/gen/territory-map.png](art/gen/territory-map.png) is the galaxy map with territory,
pilots, a bounty and the day's hotspots; [docs/art/gen/flag.png](art/gen/flag.png) a flag just
planted.

## Your ships

Every pilot has the Corsair, free, for good; other hulls (600 to 3,400 credits and some ore) are bought
at a station deck's shop (or a base's), flown at once and kept, each with its own loadout, paint and
rooms. Once his Corsair's two module slots are full, a tip names the ship that suits how he earns (a
Prospector for a miner, a Lance for a fighter), and again once he can buy it. Landed at a friendly base or docked at
a station, the buttons at the top go **into the hangar** (or press H, or Ship), up to the **deck**, or
**aboard** your ship. Inside you walk (as on foot) and Action (F) uses what you stand by.

- **The hangar** (seen whole on the screen): your ship on show on a marked bay in the middle, between two catwalk
  gantries, the hangar doors behind it; built into the wall at the top, the loadout bench and the hangar's console on the
  left, the paint station and the vault on the right; walkways painted on the floor, fuel pumps and tool cabinets along
  the walls, missiles on trolleys, drums, crates and a spare engine about. The **loadout bench** puts a weapon on each mount
  (the cannon; flak, a wide burst that reaches 170 px; a mining laser, weak against ships but cutting
  ore 60% faster and never hot; a missile rack, two more missiles; a mine layer, mines dropped behind
  with the Missile button when nothing is locked) and modules in the slots (an afterburner tank, a
  shield booster, a cargo pod, a scanner, a tractor, a cruise drive, a heat sink, armour plating).
  Each says what it gives and what it costs; nothing makes a ship more than a quarter better than it
  bare on any fighting stat. Everything fitted hangs on the hull where it goes: pods on the wings, a
  dish on the spine, a cargo pod on the back. The **paint booth** sets every colour (hull, markings,
  trim, glass, engine glow, trails) from a picker or swatches, a pattern (stripes, bands, checks,
  shark teeth, wingtips, two-tone), an emblem (four are earned by feats) and your side's mark, and
  keeps schemes. The **vault** is the base's screen. Changes show on the ship in front of you, and
  other pilots see them.
- **The station deck:** the shop (ships, gear, furniture), the faction board, other pilots walking
  about (or a few of the station's own, when you are alone), and the ships of pilots of your side who
  let others aboard.
- **Your ship's rooms** follow its outline: a light fighter is a cockpit, a freighter a cockpit, map
  room, crew quarters and cargo bay. Everything inside is drawn top-down and square-on to the floor's
  tiles: berths, lockers, consoles and racks are built into the walls, tables and the reactor stand on
  the room's middle line. Furniture bought at the shop is placed from **Furnish** (it follows you,
  its footprint marked on the floor; a built-in piece snaps to the nearest wall and faces into the
  room; Action puts it down, or the game says why not; Action by a piece takes it up).
  [docs/art/gen/fit-outs.png](art/gen/fit-outs.png) shows every hull's rooms,
  [tiles.png](art/gen/tiles.png) every piece in every facing.
- **Gear** (the shop): faster cutters, a launcher that hurts a low ship, heat and cold linings (a
  volcanic or ice world bites a pilot on foot without one), bigger packs, a cover cloak.
- **Squads** (menu): up to four of a side; invite from Pilots nearby; computer wingmen fill it. Fly
  close beside a squad mate, heading his way, and his slipstream carries you a little faster.
- **The pilot sheet** (menu): portrait, rank, feats, statistics, gear and ships owned.

[docs/art/gen/hangar.png](art/gen/hangar.png), [deck.png](art/gen/deck.png),
[ship-interiors.png](art/gen/ship-interiors.png) and [loadouts.png](art/gen/loadouts.png).

## Playing with others

The first time, the game asks for a callsign and a side; a key pair is made for the pilot
then, silently, and kept in the browser with the rest of his save. After that it goes straight
into the sky. Everyone over the same world and on the same version of the game shares a room,
about twelve to a room. PvP is always on; pilots of one side cannot hit
each other. A callsign and a mark (triangle for the Nomarchy, diamond for the Anarchoi) float over
every other pilot; the kill feed is at the top. The computer's ships (raiders, patrols) are flown
by one of the pilots' games (the one with the lowest key) and taken over by the next if he leaves;
a band one game has beaten stays beaten for the others. Downing the same
pilot again within ten minutes pays less each time. A pilot whose tab is hidden is marked idle,
and his ship goes after a few seconds.

The badge at the top says how many pilots are in the sky and whether the relays answer;
pressing it (or Escape, Options, or Menu on a touch screen) opens the menu: the connection
screen, with the counts of connections made and failed on this device (copy them to send
in), and the pilot's file (save it, or load one; it holds his key).

A pilot can fly in one tab at a time. To try two at once on one machine, open the second tab
with `?pilot=2` (its own pilot, offered when the first is busy) or use another browser. With
`?net=local`, tabs of one browser talk to each other directly, without the relays, and can be
made as bad as a real network:

```
/?net=local&delay=120&jitter=60&loss=0.1   # this tab, and in another: the same with &pilot=2
/?room=mytrial                             # online, but only with others who use this room name
/?net=off                                  # alone, never online
/?relays=wss://relay.example,wss://other   # these relays instead of the built-in ones (introductions and events)
```

The sky goes up to 1500 px (`ceiling` setting): climb with the keys or a stick, or, from behind
the ship and in the cockpit, by pointing above it. Overhead, the islands shrink and haze over
beneath you as you climb.

The sound effects were made by an audio model on James's PC (Stable Audio 3; below), and the music is other
people's MIDI files and tracker modules under open licences (`art/audio/music/README.md`); both are played from files: positioned on the screen, varied a little each time, the engine by
the size of the ship. They start with the first click or key; the button at the top steps the effects'
volume. The music follows where he is (the title, a calm world or a harsh one, space, the hangar, the
maps), and a fight brings its own in and lets it go. Settings has both volumes, and names who made the music.
`art/audio/samplers/` has mixes of the effects to listen to.

A build that is out of date says so (the site has a newer one, or pilots are flying one it cannot meet)
and offers to reload; the menu shows the version.

## Settings

**Settings** (on the first screen, and in the menu): Controls (every key and controller button, by
pressing the new one; guns and thrusters held or switched; up and down as a flight stick or not), Sound
(effects and music), Picture (the art pixel's size, text size for the menus and the HUD, motion full or
reduced, camera shake, smooth or pixel flames), Your key, Relays. [docs/art/gen/settings.png](art/gen/settings.png).

**The interface** keeps to one look: the pixel font, hard edges, dark panels, the side's colour. Nothing
read is under 21 px; each screen shows what it is for and keeps the rest a tab or a tooltip away (hover,
focus with the keys or a controller, or a long press on a touch screen); panels, lists, figures and bars move
briefly, and Reduce motion turns that to fades. Each side's emblem and home, and the icons of the menu, the
tabs, the touch buttons and the items, are drawn by the image model (`tools/gen/interface.py`), as is the
sky of the opening story a new pilot sees before the title (`IntroCrawl.svelte`; `?intro=off` leaves it out).
[docs/art/gen/interface-after.png](art/gen/interface-after.png) next to
[interface-before.png](art/gen/interface-before.png).

Every setting of the scene can be given in the address, which is the quick way to try things
(`?tutorial=off` gives a new pilot no first sortie, starting at his capital world, for the tools):

```
/?view=cockpit&timeOfDay=night&wingmen=2
/?view=chase&timeOfDay=sunset&flameStyle=realistic&intro=false
/?world=w13                                  # a world of the galaxy (the gallery lists them)
/?world=s3                                   # a star system's space (s0 the Nomarchy's home … s11 the Anarchoi's)
/?seed=21&land=0.6&clouds=0.8&accentColor=3af  # an island world of your own
/?locals=false&hud=false&volume=0.3        # no raiders, patrols or haulers
```

The full list, with defaults, is `SceneParams` in [`src/lib/engine/params.ts`](../src/lib/engine/params.ts);
the component adds `pixelSize`, `showHint`, `touchControls` and `volume`. The numbers the
fighting runs on (hulls, weapons, waves) are data, in `src/lib/engine/data/`.

## How the code is laid out

```
src/
  routes/                 the pages: the game, settings read from the address; the gallery
  lib/
    components/           Svelte: Game (save, one tab per pilot, first screen or the sky, online,
                          the property log), Onboarding (title, callsign, side, pilot),
                          PilotCreator, Portrait and PilotSprite (pilotArt), FighterJetScene
                          (canvases, frame loop, input and sound wiring), MenuPanel (where you
                          are, connection screen, pilot file), MapScreen (the system, the galaxy,
                          a card, courses and routes), BaseScreen (hold and vault, market,
                          supplies, parts, paint), NetBadge, HintBar, TouchButtons, SoundButton,
                          SceneBackdrop, PixelMark
    net/                  the network: the transport interface (link) and its two transports
                          (local: tabs of one browser; trystero: the real one), the wire format
                          (codec), rooms, Nostr keys, the session that keeps a sky in sync, the
                          connection log, and going online from the page (online); the persistent
                          world: signed events (events), the local archive, relays and one in memory
                          for the tests (relays, fakerelay), the chronicle, and the pilot's part
                          (persistent)
    save/                 the save (versioned, with migrations), the pilot and the two sides,
                          one tab per pilot, property as a log (vault, wallet, owned), his standing
                          (progress: contribution, streak, feats, the day's tasks), keeping the
                          pilot safe (backup: his key as a phrase, a sealed copy on the relays)
    input/                the action map: keys, mouse and fingers, game controller, the bindings
                          (changed in the settings), the help line, a controller or the arrow keys
                          in the page's screens (padnav)
    audio/                the sound, from files: the mixer, the files (library, catalogue: generated),
                          what each event sounds like (cues), the effects (sound), the music and its
                          moods, the interface's clicks (ui)
    tutorial/             the guided first sortie and the tips that come after it
    display/              putting a frame on a canvas; the WebGL layer for smooth flames
    settings/             settings from the address
    worlds/               building worlds and their maps in a worker, the gallery's pictures, a
                          world in words, routes across the galaxy
    engine/               the scene itself — no DOM, no Svelte; runs in Node as well
      scene.ts            createScene(): the public API (step, render, controls, settings)
      state.ts            everything a running scene knows, in one typed object
      params.ts           the settings and their defaults
      data/               the numbers: hull stats, weapons and damage, skirmish waves and score,
                          the bands (raiders, drones, patrols, haulers);
                          resources, the loop (hold, load, mining, landing, crates, turrets, raids,
                          rewards, fees), the shop (parts, paint, prices of supplies), space
                          (cruise, gravity, heat, gates, black holes, docking, belts, shards)
      sim/                what happens: flight, formation, other ships, exhaust, ejection, camera,
                          combat (hull, shield, heat), guns, missiles, pilots (the computer's),
                          skirmish (the old waves, and the kill tally), bands (raiders, drones and
                          patrols that live in places), traffic (haulers on the clock), effects
                          (sparks, explosions, wrecks, sounds), room (a sky shared
                          with other games: what to report, what they decide), the loop (loop,
                          landing, cargo, mining, crates, bases, sortie), on foot (foot, walkers,
                          veins, signals), zones (zone: the surface's and space's), space (space,
                          spacezone, travel between zones, stations, belts), step order
      render/             how it is drawn: world, sky, trails, smoke, jet, ejection, combat (tracers,
                          missiles, explosions), loot (chunks, crates, the laser, turret guns,
                          flags), walker (pilots on foot, veins, beacons, flares), hud and its
                          font, foothud, portrait, cockpit/, space (backdrop, stars, the order of
                          bodies, transitions), bodies (spheres, suns, black holes, turned
                          sprites), spacehud, traces (flags, wrecks, graves, beacons)
      races/              the six races: who they are and the choices of a look (races), their
                          art (generated), a look as colours (look)
      galaxy/             the galaxy as data: systems, lanes, bodies, names, each world's recipe,
                          the market (prices by base and day), territory (the events' rule), the
                          day (hotspots, tasks, ranks), danger (how wild each system is, whose
                          patrols fly there, where raiders wait)
      world/              the height-map world: a shaping function and looks for each kind of
                          world (archetypes/), the tools they share, the features stamped into
                          it (bases, ore, wrecks) and their prefabs (generated)
      space/              space's art (generated), read and doubled for turning (pictures), and the
                          maps worlds and giants are drawn from as spheres (maps)
      jet/                the ships: sprite stacks and engines (generated), meshes, per-jet state;
                          a hull fitted and painted (fit), the parts' and emblems' art (generated)
      interior/           the places inside: rooms as tiles (the hangar, the deck, a ship's from
                          its hull), their tiles and props (generated)
      util/               math, colour and noise helpers
      testing/            scripted flights and their recorded frames
tools/                    the art pipeline: draws the ships and builds their sprite stacks, draws
                          the stamped features and shrinks them to prefabs, draws the races and
                          shrinks them to sprites and portraits, draws space (gen/space.py) and
                          shrinks it (voxel/space.py); the menus' pixel font,
                          built from the HUD's glyphs (tools/font)
static/icons/             the resources' and the crate's icons, cut from the image model's sheet
static/fonts/             the pixel font
static/audio/             the sound effects and the music (Opus, and MP3 for the takes in use), from tools/audio/pack.py
```

The rule the layout follows: **the engine knows nothing about the page, nor the network.** It is
stepped with a time, told what the player is doing as plain values (`setControls`, `act`,
`pointerMove`), told where other ships are (`addShip`, `updateShip`, `removeShip`; a ship given a
`side` can be fought, one given a `pilot` is flown by the computer, and one that is `remote`
belongs to another game), told what other games decided (`hit`, `shootDown`, `launchMissile`,
`endMissile`, `setRoom`, `addFeed`), and gives back a picture as bytes, what was heard
(`takeSounds`), how the player stands (`status`, `pilot`), and what other games must be told
(`takeReports`). `sim/` only changes `SceneState`; `render/` only reads it. `lib/net/` turns
reports into messages and messages into calls, and runs in Node for its tests.
New game systems go in as a state slice in `state.ts`, a `sim/` module that steps it, and a
`render/` module that draws it.

## Tests

The renderer is pinned frame for frame. `engine/testing/scenarios.ts` flies 72 scripted
flights (every view, every input, a crash, settings changed mid-flight, ships of every hull,
four fights: a kill with the cannon, a missile lock broken by a roll, the player shot down, a
wave of enemies; a sky shared with other games, driven as the network would; seven over
other worlds: a canyon, lava, a whiteout, a storm at sea, a moon, a dust storm, arriving at
another world; and four of the loop: a landing and a take-off, mining an outcrop and scooping
up the ore, banking at a base, shot down loaded and the crate taken; and six on foot: getting
out, walking and back in, shot down and coming down on land to call a ship, coming down in the
sea, a vein cut by hand, a ship stolen, a pilot on foot strafed; and sixteen in space: leaving a
world for space overhead, from behind and from the seat, down to a world in each view and to a
barren moon, cruising to another body and descending, cruising past a gas giant, a jump through
a gate, a black hole run, docking and banking at a station overhead and from behind, a dogfight in
an asteroid belt and one from the seat, skimming a gas giant)
and five of the persistent world: a flag planted and the world changing hands, a beacon read
and a wreck salvaged, a hotspot mined, a world named by its first lander, a ghost recorded and shot;
and five of the galaxy's own ships: a quiet flight through a home system, an ambush at a gate, a
derelict cleared and staying clear, a patrol defending its world, a loaded ship chased and escaping)
and fingerprints each frame
(on foot at the smaller frame the page would show); the fingerprints must match those in
`engine/testing/frames/`. A change that alters a single pixel fails the test — so refactors
can be proven harmless, and when a change to the picture is meant, `npm run test:record`
accepts it. The fights also check that what they show happened, and fail if not. To see a
flight: `node tools/film.mjs "a kill with the cannon" out.png`. The galaxy's whole description
is pinned, and so is a fingerprint of every world's terrain (`engine/testing/pinned/`); the
island world is checked against what it was before there were other worlds, and a test makes
sure terrain is built from arithmetic that comes out the same in every browser.

The network is tested without a network: `net/session.spec.ts` flies two and three real scenes
against each other over a bus in memory, with delay, jitter and lost packets, on a simulated
clock (they see each other fly, a hit lands on both sides, a kill shows on both and pays less
the second time, no friendly fire, the raiders carry on when their host leaves or goes quiet,
idle pilots go, a full room sends a pilot to the next copy; landing, mining and a spilled crate
show for both, the ore left in every outcrop agrees, and a rival takes the crate; a pilot on foot
and his parked ship show for the other, pilots on foot shoot and kill each other, beacons and
flares, an ejection comes down on foot for both, a parked ship is stolen with its cargo). The save's
migrations and its property log, the wire format, the keys and the local transport have tests
of their own. The persistent world is tested the same way: the rule that turns events into
territory is fed the same events in shuffled orders and must give the same state; relays in memory
are made slow, repeating, forgetful, refusing or down, and players who were never online together
must still see each other's flags, wrecks and names (`net/chronicle.spec.ts`, `net/persistent.spec.ts`).

## The ship's artwork

The ships in `src/lib/engine/jet/models/` are generated. Each is drawn by an image model
running on this PC and turned into a sprite stack by the tools in `tools/`:

```sh
npx jiti tools/art-sheet.ts art/hulls/control                     # the plans' guides: from above, the side, behind
python3 tools/gen/hulls.py --control art/hulls/control --seed 2   # draw every hull from above
python3 tools/gen/hulls.py --view side --control art/hulls/control --tries 4   # … from the side, four tries
python3 tools/gen/hulls.py --view rear --control art/hulls/control --tries 4   # … from behind
tools/voxel/build_hulls.sh                                        # the tries art/hulls/picks.json chose → carved voxels → the game
npm run test:record                                               # the picture changed, on purpose
```

Each hull is a solid seen from three sides: its plan gives every part an outline from above, from the side and from
behind; the model draws it from each over those guides; the voxels are carved from what all the views allow, and each
face is painted by the picture that looks at it and lit by which way it faces
([docs/art/gen/ships-3d.png](art/gen/ships-3d.png), [chase-before-after.png](art/gen/chase-before-after.png)).
`npx jiti tools/ship-turntable.ts <dir>` draws every hull at twelve headings in every view.

The things stamped into the ground (buildings, turrets, ore, wrecks) are made the same way:
`uv run tools/gen/features.py` draws each from above following a grey plan of its shape, and
`uv run tools/voxel/prefabs.py` cuts them out, shrinks them to game pixels, gives each pixel a
material and a height, and writes `src/lib/engine/world/prefabs.ts` (and the menus' icons, cut
from `art/mockups/loot-icons.png`).

The six races too: `uv run tools/gen/races.py --plans` draws the plans of their outlines in game
pixels (and a sheet of them, to judge whether they are told apart), `uv run tools/gen/races.py`
has the model draw each race's sprite from five sides, its fall and four portraits over them, and
`uv run tools/voxel/races.py` reads each picture back onto its plan, sorts its colours into the
parts a player recolours, makes the walk, and writes `src/lib/engine/races/art.ts`.

The worlds' creatures the same way: `uv run tools/gen/creatures.py` (plans of their outlines in game
pixels, five sides each, and a sheet of what they drop), `uv run tools/voxel/creatures.py` (each picture
read back onto its plan, the walk made from its legs, the drops cut into icons; writes
`src/lib/engine/creatures/art.ts`; `art/creatures/picks.json` chooses another try of a side).

Space too: `uv run tools/gen/space.py` draws the gas giants' bands, a star's surface, the nebulae,
rocks bare and with ore, the parts stations are built from, a gate, a derelict, a black hole's
disc, a void shard and two icons (following grey plans of their shapes where they are things seen
from above), and `uv run tools/voxel/space.py` cuts them out, shrinks them to game pixels (each
rock to every size it is drawn at) and writes `src/lib/engine/space/art.ts`. The worlds and moons
are drawn from space from their own built surfaces, not from pictures, so each looks like itself.

The sound too: `uv run tools/gen/sounds.py` has Stable Audio 3 make four takes of every effect in the
recipe (`tools/gen/sound_recipe.py`: a subject before one shared style) and cuts each to shape (one shot,
a tail, a swell, a seamless loop); `uv run tools/audio/pack.py` measures every take, chooses (or takes the
recipe's `use`, a choice by ear), encodes Opus into `static/audio/sfx/` and writes `src/lib/audio/catalogue.ts` and
the checks in `art/audio/checks/`. The music: `node tools/audio/music.mjs <FluidR3_GM.sf2>` renders
`art/audio/music/list.json` into `static/audio/music/` and writes `src/lib/audio/pieces.ts`. Then `node tools/sound-check.mjs` (with `npm run dev`) plays it all in a
browser and renders scenes, and `uv run tools/audio/samplers.py` makes the sampler files from them.

The first step needs ComfyUI running; the rest do not. [docs/implementation-plan.md](implementation-plan.md)
(section 7, "Art pipeline") explains each step, and [docs/pixel-art-techniques.md](pixel-art-techniques.md)
how it was arrived at.
