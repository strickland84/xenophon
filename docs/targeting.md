# Targeting

James, 2026-11-19: "a new Targeting system - T keyboard shortcut. T to target the nearest thing in view, and in cockpit
view it shows some details about what you've targeted and on our view ahead in 3rd person. This way, we can remove all
the planet names floating around unless you've targeted them. You should be able to target players, enemies, (all ships),
planets, moons, suns, bases etc. The cockpit view should show details like ship name, type, shields, health etc."

This is the plan. Once built, its decisions move into the plan's section 16 (UI) and this file says what was built.

## What there is now

- **The sights** (`sim/fight.ts`, `scene.sights`) choose the enemy most nearly in front, every quarter second, for the
  guns' lead point, the aim assist and the missiles' seeker. Only enemies, only within 700 px.
- **The HUD** brackets the sights' target (`render/hud.ts`: corners, a hull and shield hair-line, LOCK, the lead point).
- **The cockpit's target screen** (`render/cockpit/screens.ts target`) shows the sights' target from above, its hull bar
  and distance. Only 6 of the 10 hulls' cockpits have one; all 10 have a nav screen.
- **Names floating in space** (`render/spacehud.ts`): every small far world, giant and sun named under it from behind and
  the seat (James asked what the "floating things" were, 2026-11-18); every station and gate within 1200 px named over it.
- **T is free** on the keys, and D-pad left (14) on a controller.

## What it will be

### Choosing (the engine)

- **A new slice of state, `scene.target`** (`sim/target.ts`): what the pilot has picked, as a reference that stays good
  across steps: `{ kind: 'ship', fighter }`, `{ kind: 'body', index }` (a space body: world, moon, sun, giant, black
  hole, station, gate, derelict), `{ kind: 'base', index }` or `{ kind: 'place', index }` on a world's ground. Null: none.
  It is the pilot's own: never sent, no protocol change, not saved.
- **A new action, `target`** (`SceneAction`, `Scene.act('target')`; T, D-pad left, a touch button). A press picks the
  nearest thing on the frame; pressed again it goes to the next nearest, round and round. Held for half a second it lets
  go. Nearest means distance to its surface (a world's distance less its radius), so a raider 300 px off comes before a
  world 9,000 px off; the frame is what the camera sees in the view in use, so it works the same overhead, from behind and
  from the seat. A press with nothing on the frame lets go too.
- **What can be picked:** every ship (players of both sides, raiders, patrols, haulers, drones, a parked ship), and in
  space every body and structure; on a world's ground its bases and its places (settlements, ruins, relays). Not ghosts,
  not rocks, not crates. On foot: creatures and pilots on foot, the same key (a later step; the sidearm's assist already
  turns onto beasts, `foot.aimBeast`).
- **It lets go by itself** when a ship is shot down or leaves the room, on a change of zone, and past a distance (ships
  4,000 px; bodies never in their own system).
- **The sights follow it.** An enemy targeted is the sights' target for as long as it is a fair choice at all (in range,
  within the cone): the guns lead it and the seeker locks onto it, so T is how a pilot chooses which of three raiders his
  missile goes after. With no enemy targeted the sights choose as now, so the fighting plays the same for a pilot who
  never presses T.
- **Deterministic:** chosen in `sim/` from the action and the state only, in a fixed order (distance, then id).
- **`Scene.setTarget(ref)` and `Scene.status.target`** for the page: the maps' Plot course targets what it plots, and the
  touch screen's tap-to-target (below) goes through it. `status.target` is a short summary (kind, name, relation) for the
  page's sounds and tips.
- **A targeted body and the cruise drive:** in space, C with a target and no course plots the course to it. T then C is
  how to fly to the world you are looking at.

### What it says (one summary for every view)

`render/targetinfo.ts` turns a target into lines once a frame, so the HUD and the cockpit say the same things:

| Target                        | First line                                        | Then                                                                                                                   |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A player's ship               | his callsign                                      | hull type (CORSAIR), side, FRIEND / ENEMY; hull and shield bars; distance; speed; MISSILE LOCK if his seeker is on you |
| A computer's ship             | what it is (RAIDER, PATROL, HAULER, DRONE, DRILL) | hull type, whose (a band of raiders, the Nomarchy's patrol); hull and shield bars; distance; LOCK                      |
| A parked ship                 | its owner's callsign, PARKED                      | hull type; hull bar                                                                                                    |
| A world or moon               | its name                                          | kind (ICE WORLD, LAVA MOON), holder, danger chevrons, gravity, air, weather; distance and time at cruise               |
| A sun                         | its name                                          | its class (RED DWARF), HEAT within reach; distance                                                                     |
| A giant                       | its name                                          | GAS GIANT, HELION in its upper bands; distance                                                                         |
| A black hole                  | its name                                          | where its ring leads; distance; the horizon's danger                                                                   |
| A station                     | its name                                          | holder, DOCK / HOSTILE, distance                                                                                       |
| A gate                        | GATE TO <system>                                  | the system's holder and danger; distance                                                                               |
| A base or place on the ground | its name                                          | holder, what it is (OUTPOST, SETTLEMENT, RUIN); distance                                                               |

A ship's own name does not exist yet (Phase 8 left it out): its callsign and hull stand for it.

### Where it shows

- **In the world, every view:** four corner brackets round it in the relation's colour (friend green, enemy red, neutral
  and bodies ink), its name and distance under them in the pixel font, hull and shield hair-lines over a ship (as the
  sights' brackets now; when the target is also the sights' target, one set of brackets, the lock closing them). A body
  is bracketed round its disc, however large. Off the frame, an arrow at its edge with the name, as the course has.
- **From behind and overhead: a target card**, a small plate in the lower left above the bars (`namePlate` look): a
  silhouette from above for a ship or a lit disc for a body, then the summary's first three lines and the bars. On a
  phone it sits where `hudSides` leaves room, or shrinks to its first line.
- **From the seat:** the target screen shows it all: the silhouette (or the body's disc), name, type, side, hull and shield
  bars, distance, LOCK. A cockpit with no target screen uses its nav screen while a target is held. Screens are small: the
  lines that do not fit page through every two seconds. The world's brackets are drawn too; no card over the canopy.
- **The radar:** the target's blip ringed.
- **The names floating in space go:** the far bodies' names and the stations' and gates' names are drawn only for the
  target. Kept: the course's arrow and its name (a course is a choice too), the system's name on arriving, players'
  callsigns over their ships (who is who matters in PvP), the guide's mark in the first sortie, and every prompt
  (DOCK, DESCEND, JUMP TO …).

### Controls

- Keys: T (`target` in `input/bindings.ts`; an old save gets T unless T is bound to something else, as `readBindings`
  did for G and the throttle). Controller: D-pad left. Both rebindable in Settings.
- Touch: a Target button beside Missile while flying (tap: next; hold: let go). A tap on a thing in the picture is not
  used: in space a finger aims the nose.
- The help bar, the prompts' key names (`input/hints.ts`) and the HUD's own lines name the bound key.
- A first-time tip on first entering space: the names are gone, T picks the nearest (`tutorial/tips.ts`). No sortie step:
  the narrator's lines would need reading again.
- Sound: a short blip on picking, a lower one on letting go (existing takes; `cues.ts`).

## Steps

1. **Mockups** (`art/mockups/targeting-*.png`, ComfyUI): the chase view with a raider bracketed and the card; the seat
   with the target screen full; a world targeted from behind. Build towards them.
2. **The engine:** `sim/target.ts` (state, choosing, cycling, letting go, the sights following), the action, `setTarget`,
   `status.target`, unit tests (order, cycling, held to let go, lost on death and zone change, the same in two runs).
3. **The summary:** `render/targetinfo.ts` and tests of its lines for each kind.
4. **The drawing:** brackets and the off-frame arrow (`render/targethud.ts`), the card, the cockpit screens, the radar
   ring; the floating names taken out of `spacehud.ts`.
5. **The page:** binding, touch button, hints, tip, sounds, the map's Plot course, `tools/phone-check.mjs` passing.
6. **Flights** (`testing/scenarios.ts`): a raider targeted from behind and shot, its card's bars falling; T cycled from a
   station to a world to a sun from the seat; a target off the frame; the missile going after the targeted one of two.
   Every space flight from behind or the seat re-recorded on purpose (the floating names go).
7. **Look at it:** a sheet of every kind targeted in every view (`npx jiti tools/target-sheet.ts`), read; the plan's
   section 16 and CLAUDE.md's state updated; committed.

## Left for later

Targeting on foot (creatures, pilots), ore rocks and crates; a ship's own name; a wingman's target shared with the
squad; other players seeing that they are targeted (only a seeker's lock warns now).
