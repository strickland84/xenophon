# Playing Xenophon: Twin Stars: a note for James

Everything here runs on this PC; nothing is published.

## Starting it

```sh
npm install
npm run dev          # then open http://localhost:5173
```

Or the built site, as players would get it: `npm run build && npm run preview`, then http://localhost:4173.

A fresh pilot: open it in a private window (or add `?pilot=2` for a second pilot in the same browser). To try two
pilots against each other, open a second browser (or a private window) on the same address: they meet through the
public relays. `?net=off` plays alone and offline.

## What to try first

1. **The first sortie** (a new pilot gets it): launch, fly to the capital world, go down through its air, drones, mine,
   land at an outpost, get out, plant a beacon, back in, home to bank. About five minutes.
2. **The hangar** (landed at a friendly base: the Hangar button, or H): rebuilt again since you last saw it, and now
   seen whole on the screen. Your ship stands on its bay between two catwalk gantries under the hangar doors; built into
   the wall at the top, seen from the front: the loadout bench (tools on a pegboard, a gun pod on the bench) and the
   console on the left, the paint station (shelves of paint, a spray arm) and the vault's round door on the right. Walk
   the painted walkways to them. Then **Aboard** (your ship's rooms) and **Furnish**: every piece is drawn square-on to the
   floor's tiles, built into the walls, and the game says why a spot is refused.
   `docs/art/gen/hangar-final.png` is how it looks on a laptop.
3. **The frontier**: fly a gate out of your home system (the galaxy map, M, plots the way). Raiders wait there now;
   home is safe.
4. **Space**: high over a world hold F (Action) to fly up out of it; V changes the view (all three work in space); C is
   the cruise drive; hold F over a world to go down.
5. **Shot down**: you come down on foot (quicker now). Hold F to call a ship.

## What is new since you last played

**Since the fresh review** (`docs/review.md`, every fault with a picture): landing near a pad now comes down on it and
banks (the first sortie could stall at its last step); the first sortie's dive no longer runs you into the ground; its box
no longer covers a place's name; the loadout bench and paint booth stand beside your ship so you see each change; a ship
is bought from its card, not by one press; furniture in the shop is drawn large enough to see; the fire on the way down
closes in from the corners instead of framing the screen; a sun's glow is smooth.

**Since polish step 8** (the fun and the weakest screens, from half an hour of each of six scripted players and an audit
of every screen):

- **Fighting pays a living.** Kills pay three times what they did, beating a raider band pays its bounty, and the counter
  makes up any ore a part or a ship asks for (at twice its price), so credits alone buy anything. A pilot who only
  fights buys his first part in about the time a miner does.
- **Shot down over the sea or lava, you glide.** The canopy opens at once; a ring on the ground shows where you will come
  down (red where you cannot live) and an arrow points to the nearest land. Raiders no longer wait out of reach of land.
  Far from your parked ship, hold F to call it to you.
- **A second ship is a goal.** Ships cost about a quarter less; once your Corsair's two module slots are full a tip names
  the ship that suits how you earn (a Prospector or a Lance), and again when you can buy it; a new ship is flown at once
  and stands in the hangar.
- **The cruise drive** starts as soon as you are clear of a station or a gate and runs a little faster: the longest
  crossing a scripted explorer flew went from about a minute to about half that.
- **Mining**: the laser cuts faster held close and low, and now and then a gem flies out (a glinting crystal worth three,
  gone in 16 seconds): more of them from rich deposits and the wilder the place. The frontier pays clearly more than
  safe trading now.
- **Space beside the great bodies**: from overhead a sun, a gas giant and a black hole are drawn pulled back, so their
  curve, bands, corona and disc fill the screen beside them; night sides glow faintly blue; a sun close to boils with
  granules and sunspots, a giant's clouds curl in eddies and storms (both from the image model).
- **Night, sunset, mesas, bases**: night is moonlit blue with clear lights and darks; fog or dust at sunset glows gold;
  the rose mesa worlds are deeper; a base's buildings seen from behind or the seat have storeys and windows, lit at night.
- **Inside**: the station deck is furnished (a holo chart table, mess tables, aquariums, trophy cases, cargo) with more
  people about; your ship's rooms are drawn larger, standing on the hangar's floor.

**Before that** (polish step 8 and the last pass):

- **The settings**, rebuilt: five sections down the side as large icons; your keys drawn as key caps, every action with
  its icon in three groups (press a row, then the new key); volume as rising blocks; the art pixel shown on a ship.
- **The maps' marks** are drawn by the image model: stations beside their worlds, gates as rings, the raiders' skull, a
  hotspot's star, a derelict's wreck.
- **Fitted parts read in flight**: pods, racks and dishes two or three times the size they were, in their own colours (a
  missile's red tip, a tractor's green, a lens's cyan).
- **Every piece inside** is drawn again in the hangar's dark gunmetal and orange (they were pale cream boxes), and the
  hangar's bay is dark plates in hazard stripes.
- **New tips**: banked ore is sold at the market; home pays least and the frontier nearly twice.
- **Shot down where your side has no station**, your new ship waits at the nearest one a jump away (it was put down
  beside the raiders that downed you).
- A place's name as you arrive sits on a dark plate, readable over anything; on a phone no prompt runs under the buttons.

- **The hangar**, seen whole, its stations big enough to recognise, its floor a working place (fuel pumps, tool cabinets,
  missiles on trolleys, drums, crates, a spare engine). Lockers and cargo racks stand along the side walls of your ship's
  rooms now too.
- **The way down to a world is quicker** on a slow machine (with the processor slowed six times it was 17 to 21 frames a
  second; now about as quick as a fight), and the ground has **relief all the way down**, not only at the last second.
- **A black hole** seen from behind or the seat has its disc tilted, crossing in front of the shadow, its light bent in an
  arch over the top.
- **Canyon and mesa worlds** show their gorges as depth from overhead, dark floors and lit rims.
- A **pixel pointer** (an arrow over the menus, a reticle over the sky); the **base's screen** shows the base itself; the
  radar on foot is no longer huge.

- **The interiors, all of them, redrawn on one rule** (your "isometric diamond shaped" note and the hangar): top-down
  and square-on on the floor's tiles, nothing isometric anywhere inside; every piece a footprint of whole tiles,
  drawn for each way it faces, built against the walls; berths are berths built into the hull, not beds. The hangar was
  designed from a mockup (a bay, gantries, hangar doors, stations along the wall). The large ship there no longer has
  doubled pixels. `docs/art/gen/tiles.png` shows every piece on the grid; `docs/art/gen/fit-outs.png` every hull's rooms.
- **Danger tuned**: the low frontier now costs a careless miner a load now and then; the medium no longer costs half of
  them.
- **Quicker back on your feet** after being shot down; boost builds heat (with the guns' gauge); AMBUSH is said once,
  not every time a band comes round again; fog and dust hide enemies from the radar too.
- **Sound**: the harsh-world and hangar music, the engines' idle, grass footsteps and the button click made again; the
  air roars on the way down. (Nobody has heard any of it: `/sounds` has every take.)
- Bases no longer sit on a square patch of ground; the Skarn looks less like a bearded man.

## What only you can judge

- **Whether it is fun.** Every system works and has been played through by scripts; none of that says whether flying,
  fighting, mining and exploring are fun, or the pace is right.
- **The sound and music.** Generated and chosen by measurement; never heard. `/sounds` plays every take, the one in use
  lit gold; "use take 3" for any sound goes in `tools/gen/sound_recipe.py`.
- **Feel on a real phone.** Every phone check was a desktop browser at phone size. With the processor slowed four and six
  times the way down to a world is now close to a fight's frame rate (the plan's section 20 has the numbers). A real
  phone's touch, heat and screen are untested.
- **Play across two networks.** Three browsers on this PC played together through the public relays (a squad, a visit
  aboard, a fight, a crate, both on foot, a stolen ship, a flag). Two players on different networks (or a phone on mobile
  data) may fail to connect; the menu's connection screen counts attempts and failures.
- **The art**, as a whole: every screen was scored (the polish list's steps 8 and 9, and the contact sheets in
  `docs/art/gen/audit/`, `step9-*.png` the newest). Nine of 113 still score 3: open space from overhead (black, as you
  asked), a sun and a moon from overhead and a world from behind when caught on their night side or just off the frame, a
  station's slabs filling the windscreen from the seat, a giant close to from behind, a belt from the seat, and Furnish.

## Questions only you can answer

The scripted players (`tools/players.ts`) now say the pace is about where it was meant to be: rewards from every few
seconds to a couple of minutes at most, no crossing longer than about half a minute, nobody drowned, a second ship
inside half an hour for most kinds of pilot (the numbers are in `docs/polish-pass.md`, "Polish step 9"). What they
cannot say:

1. **Does fighting feel worth it in your hands?** A raider is now worth 60 to 135 credits and a band beaten its bounty;
   the counter sells the ore a part needs at twice its price. Too generous, too mean, or about right?
2. **Does the glide over the sea feel fair, or like a rescue?** The canopy opens high over deep water and lava and steers
   far; deep water is still death. Should it be harder?
3. **The pulled-back bodies from overhead.** A sun, a gas giant and a black hole are drawn smaller than they are from
   overhead (as the worlds have been since true scale), so their edge and surface show beside the ship. Does it read as
   the same place as the views from behind and the seat?
4. **Night and sunset**: is the moonlit blue and the gold of a sunset's fog to your taste?
5. **The sound and music** (still never heard by anyone): `/sounds`.
6. **A real phone and a second network**, as before.
