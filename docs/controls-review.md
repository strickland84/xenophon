# The controls: a review against Elite Dangerous and Star Citizen

2026-11-19. Feedback from players: "the game is amazing, but the control scheme is very hard to follow." James asked for
a review of how Elite Dangerous and Star Citizen do it, and what to take from them.

This is a report, not a decision. Nothing here is built yet. The suggestions at the end are ranked; each says what it
touches.

## In short

Xenophon does not have too many controls. It has about as many as one ship role in either game. What makes it hard is
that **the same input means different things in different places, and the game does not say when it has changed**:

1. The mouse steers four different ways depending on the view and the zone.
2. F does about a dozen things, and a tap and a hold of it do different things.
3. W and S pitch the nose, where nearly every PC space game puts the throttle on them (Elite, Star Citizen, Everspace,
   Squadrons, No Man's Sky). Players come in with that habit.
4. The help is a long sentence, and there is no one place in the game that shows every control for where you are.

Both games are known for controls that are hard to learn, and both have spent years fixing it. The fixes are worth
copying. The complexity is not.

## How Xenophon's controls work now

### The keys, by place

| Input       | Flying over a world                         | Space                                   | On foot                 | Inside       |
| ----------- | ------------------------------------------- | --------------------------------------- | ----------------------- | ------------ |
| W / S       | pitch (W nose up, as a stick's pull)        | pitch, a loop held                      | walk forward / back     | walk         |
| A / D       | turn                                        | turn                                    | walk sideways           | walk         |
| E / Q       | throttle up / down                          | throttle                                | walk forward / back too |              |
| Wheel       | throttle                                    | throttle                                |                         |              |
| Shift       | thrusters (boost)                           | thrusters                               | run                     | run          |
| Space       | dodge roll                                  | dodge roll                              | jump (climb a cliff)    |              |
| F, tap      | landed: get out                             |                                         | climb in, steal a ship  | use          |
| F, hold     | land, take off, power up, climb out         | dock, undock, go down, gate, hole, skim | cut a vein, call a ship |              |
| R, hold     | mining laser                                | mining laser                            | hand cutter             |              |
| V           | next view (overhead, behind, seat)          | next view                               | plant a beacon          |              |
| C           |                                             | cruise drive                            |                         |              |
| P           | power on/off (landed only)                  | power (docked only)                     |                         |              |
| G           | get up and walk the ship / sit              | the same                                |                         | back to seat |
| T           | target ahead, again for next, hold to clear | the same                                |                         |              |
| Left click  | guns                                        | guns                                    | sidearm                 |              |
| Right click | missile (once locked)                       | missile                                 | flare                   |              |
| J / K       | guns / missile from the keys alone          |                                         |                         |              |

Also M maps, Tab hold and vault, Enter chat, Esc menu, H hangar, X clip. The controller has its own layout
(`input/bindings.ts DEFAULT_BINDINGS.pad`).

### The mouse, by view

This is the biggest single source of confusion. The mouse is the main way most people will fly, and it changes meaning
three times (`engine/sim/flight.ts` around line 265, `engine/sim/spaceflight.ts`):

- **Overhead:** the ship turns towards the cursor (a heading to go to). Height is on the keys only.
- **Behind and from the seat, over a world:** how far the cursor is from the middle sets a _rate_ of turn and a _rate_
  of climb, with small dead zones (6 % across, 8 % up and down). A cursor resting to one side circles the ship.
- **Behind and from the seat, in space:** across is still a rate of turn, but up and down is an _angle_: where the
  cursor is, the nose points, up to 80°. In the frame's outer tenth top and bottom it becomes a rate again, so a loop is
  possible.
- **Keys and mouse together:** a turn on the keys or a stick wins for 1.2 s after (`FighterJetScene.svelte KEYS_KEEP`).

There is no mark on the screen for where "neutral" is from behind (the plan notes it as left to do). From the seat it is
the sight. So a player cannot see why the ship is turning.

### Other things that trip people

- **Tap and hold of F differ in kind.** Landed, a tap gets out and a hold takes off. Held long enough with the power
  off, it also powers up. That is the same pattern Star Citizen's players complain about most (below).
- **Two ways out of a landed ship.** F tap puts you on the ground; G puts you in the ship's rooms.
- **The settings' words are hard.** The pitch keys are listed as "Push: dive, or climb as set (walk back)" and "Pull:
  climb, or dive as set (walk on foot)" (`BINDABLE_WORDS`). The help says "Down climbs, up dives".
- **Space is called Roll but it is a dodge.** In both games below, roll is an axis you fly with.
- **The help line** (`input/hints.ts hintFor`) runs to fifteen clauses in one sentence. The chips (`hintChips`) show
  eight, and the full list is only in Settings.
- **Nothing says the controls changed.** Going from the air to space, from landed to flying, or from the ship to on foot
  changes what half the keys do, and the only sign is the chips at the bottom.

## Elite Dangerous

What it does, on keyboard and mouse:

- **Mouse = pitch and yaw** (in most players' setups), as a virtual joystick: the further from the middle, the faster it
  turns. Roll goes on A and D. The shipped preset put roll on the mouse's left and right, and that is the most common
  thing new players are told to change.
- **W and S = throttle**, as a setting that stays where you leave it, not a key you hold. The wheel moves it too. There
  are keys for 0 %, 50 % and 100 % (X cuts it to zero). The throttle bar has a blue band: the speeds where the ship turns
  best.
- **Thrusters on Q/E (sideways), Space and Ctrl (up and down).** Boost on Tab.
- **One key, one job.** Landing gear (L), hardpoints (U), frame shift drive (J), flight assist (Z), target ahead (T, or
  F in some setups), next target (G), highest threat (H). Holding a key rarely does something different from tapping it.
- **The mouse widget**: an option draws where the virtual stick is on the HUD, so you can see why the ship is turning.
  **Relative mouse** makes the mouse spring back to the middle, like a real stick. **Mouse deadzone** is a setting.
- **Presets.** The controls screen opens with presets (keyboard and mouse, a controller, common joysticks).
- **Modes cut down what is live.** The cockpit has a combat mode and an analysis mode; scanners only work in one, weapons
  only in the other. The HUD's colour and shape changes with it, so you always know which you are in. On foot (Odyssey)
  has its own section of bindings that reuses the same keys for walking, so the reuse is explicit.

Where Elite went wrong, and what it did about it:

- **Docking needed a trip through the left-hand panel**, three menus deep, for something every player does every
  session. Frontier's answer was a docking computer module that lands for you. The lesson: a thing you do
  every time must be one press, and the prompt must say which.
- **The shipped preset fought players' habits** (mouse roll). Most of the "Elite's controls are hard" talk is about that
  and the sheer number of unbound actions.
- **The number of actions.** Over a hundred bindable actions, many unbound by default. People use third-party tools and
  printed cheat sheets.

## Star Citizen

What it does, on keyboard and mouse (defaults from the Star Citizen Wiki's controls guide, July 2026; they change
between patches):

- **Mouse = pitch and yaw** as a virtual joystick: the cursor on screen is the stick, and the ship turns to follow it.
  Gimballed guns can aim at the cursor separately.
- **W and S = forward and back thrust, A and D strafe, Q and E roll**, Space and Ctrl up and down, Shift boost, X the
  brake. The wheel sets a speed limit; C cruise control.
- **One key to get ready.** Flight Ready (R) does what used to be several switches (power, engines, shields). Exit the
  seat is a hold of Y. Landing mode is N.
- **Master modes** (since 3.23): B switches between SCM (combat: guns, shields, slower) and NAV (travel: no weapons,
  fast, the quantum drive). The middle mouse button cycles "operator modes" (guns, missiles, scanning, mining, salvage,
  quantum), and the left button does whatever that mode's job is. This cut the number of things live at once.
- **Interaction mode.** Hold F and the cursor is freed: things you can use light up and you click them. On foot, F is
  "use". The F1 mobiGlas and F2 star map are the same in a seat and on foot.

Where Star Citizen went wrong:

- **Tap, hold and double-tap on the same key** for different jobs (B taps to choose quantum, holds to spool it; many
  binds after 3.23 work so). It is the most common complaint about its controls: players cannot tell which they did,
  and there is a delay before a tap counts while the game waits to see if it is a hold.
- **Master modes were called unintuitive** by many players when they came, mainly because the mode was not obvious on
  screen and the switch has a delay.
- **Modifier keys** (Left Alt + something) for common jobs.

## What both agree on

These are the habits a player arrives with:

1. **The mouse is a stick**, pitch and yaw, rate-based, with a visible centre and dead zone.
2. **W and S are speed**, not pitch. On foot W walks forward; in the ship W goes forward too. The same key means the
   same direction everywhere.
3. **Throttle as a setting** that stays, with a quick way to zero.
4. **One key, one job.** Where a key does several, it is because the context is obvious (F to use whatever you face).
5. **The mode you are in is always on screen**, in the HUD's own look.
6. **The prompt names the key and the verb** at the moment it can be used.

## Findings for Xenophon

Ranked by how much each is likely to confuse a new player:

1. **The mouse's four meanings.** A player who learns to fly from behind over a world finds the same hand does
   something else in space, and something else again overhead. There is no on-screen centre to steer against.
2. **W/S pitch against the genre.** Anyone who has played Elite, Star Citizen or most PC space games will press W to go
   forward. James chose W/S for pitch on 2026-11-19, so this is his call; see suggestion 2 for a way to keep it and
   still meet those players.
3. **F's tap and hold.** Landed, tap and hold do opposite things (out, or up). With about a dozen meanings across
   places, the prompt is the only guide, and a held action has no visible progress.
4. **No one place that shows every control for where you are.** The help line is too long to read in flight; Settings
   is a list, not a picture.
5. **Silent changes of context.** Space to air, flying to landed, ship to foot each change half the keys.
6. **Words.** "Push"/"Pull", "Down climbs, up dives", "Roll" for a dodge, two ways out of a landed ship.

What Xenophon already does well, and should keep: prompts in the bound keys of the device in use (`hints.ts namer`);
the first sortie teaching one control at a time; a hold of F powering up a cold ship so nobody is stuck (Star Citizen's
Flight Ready, in effect); T targeting what you aim at (Elite's "target ahead"); a far smaller set of actions than either
game.

## Suggestions to implement

Ranked by value for the effort. Each names what it touches. Anything that changes how a ship flies changes the pinned
frames, which would be re-recorded on purpose.

### 1. One mouse model, and show it (high value, medium effort)

Behind and from the seat, in the air and in space, make the mouse a virtual stick everywhere: distance from the middle
is a rate of turn and a rate of pitch, with the same dead zone. Draw it, as Elite's mouse widget does: a faint ring for
the dead zone round the steering centre, and a short line from the centre to the cursor while it is outside it. Overhead
can keep "turn towards the cursor", since that view has no pitch, and the ring makes the difference plain.

The reason space went to an aimed nose (2026-11-18) was a mouse resting off-centre that looped the ship forever with
nothing to show why. The ring answers that directly: a pilot sees his cursor outside it. If it still feels wrong, keep
the auto-level when the cursor is inside the ring.

Touches `sim/flight.ts` (chase steering), `sim/spaceflight.ts` (`FLIGHT3D aim` and `edge` go), `render/hud.ts` (the
ring), `view.steerY`. Later, an option for **relative mouse** through the browser's Pointer Lock API: the mouse's
movement pushes the stick and it springs back to the middle, as in Elite and War Thunder. That is the best mouse flight
there is for a fighter, and a browser can do it.

### 2. One flight layout, Elite's (high value, small effort)

James, 2026-11-19: "I dont want legacy controls - I want one, right way to do it. Mirroring elite dangerous. I
specifically mean flight controls." So no presets: the flight controls become Elite's, as one layout. W/S throttle, the
mouse pitches and turns, A/D turn (or roll, once there is a roll axis), X all stop; on foot WASD as now. Old saves'
default layouts move over in `readBindings`, as before.

**Done first, the same day** ("just make UP CLIMBS the default"): the mouse and a stick climb when moved up, as Elite's
mouse does unless inverted; "Up dives" is the setting's other choice. The pitch keys are named by what they do (Up climbs,
W and the up arrow; Down dives, S and the down arrow) and the setting no longer turns them over (`keyboard.ts invert`).

Touches `input/bindings.ts DEFAULT_BINDINGS`, `SettingsScreen.svelte`, `hints.ts`, the first sortie's lines (and the
narrator's, read again).

### 3. Hold means commit, and shows it (high value, small effort)

Set one rule and keep to it everywhere: **a tap does a small thing; a hold commits a big one, and the prompt fills as you
hold.** Draw a ring or bar filling round the key cap in the prompt ("HOLD [F] TAKE OFF" with the F filling). Never let a
tap and a hold of one key do opposite things in one place: move **getting out** off F's tap and onto G ("get up"), which
already leaves the seat. Landed, G stands you by the ship on the ground; the ship's rooms are reached from the hangar's
Aboard or from inside once there is a hatch. F is then only "hold to land / take off / dock / jump", and use what you
face on foot.

Touches `sim/loop.ts` / `sim/foot.ts` (getting out), `sim/interior.ts toggleSeat`, the prompts in `render/hud.ts`, the
first sortie's lines (and the narrator's, which would need reading again).

### 4. A controls card, held on a key (high value, small effort)

Hold F1 (and the controller's Select or View) to show every control for where you are now, drawn as key caps on a small
keyboard picture in the game's style, grouped by job (Fly, Fight, Travel, Ship). Let go to hide it. The help line then
shrinks to the five or six chips that matter now, and the card is where the rest live. Neither Elite nor Star Citizen has
this, and players of both print cheat sheets instead.

Touches a new component built from the `ui-*` parts, `input/hints.ts` (the same sources as the chips), a mockup first in
`art/mockups/`.

### 5. Say when the controls change (medium value, small effort)

When the context changes (into space, the air, landed, on foot, inside, up out of the seat), show its name for a moment
in the HUD's own type (SPACE, LANDED, ON FOOT) and flash the chips that changed. On V, name the view (OVERHEAD, CHASE,
COCKPIT). This is what Elite's two cockpit modes and Star Citizen's SCM/NAV badge do.

Touches `render/hud.ts`, `components/HintBar.svelte`.

### 6. A throttle that behaves like one (medium value, small effort)

Add **All stop** (X in the space-sim preset, Elite's key) and keep the wheel. If the hulls turn better in some band of
speed, mark it on the throttle bar as Elite's blue band does; if not, leave it out.

Touches `input/bindings.ts`, `Scene.setThrottle`, `render/hud.ts barWidth`.

### 7. Plain words (small value, tiny effort)

- Settings: "Pitch up" and "Pitch down" for the two keys; "Invert pitch" with a picture of what it does.
- "Roll" becomes "Dodge roll" in Settings and the help.
- The help line: drop "Down climbs, up dives" in favour of the key names.

Touches `BINDABLE_WORDS`, `hints.ts`.

### 8. Fewer views to start (medium value, small effort)

Start a new pilot in the chase view and leave overhead and the seat for later in the first sortie (or for after it).
Each view steers a little differently, and the first minutes are when that hurts most.

Touches `tutorial/tutorial.ts` (the `look` step) and the scene's starting `rig.target`.

### 9. Find out where people get stuck (medium value, small effort)

Count, locally and with nothing sent, the presses that did nothing (F with no prompt, P in flight, a click with the
weapons safe) and the time from the first sortie's start to each step. `tools/first-session.mjs` already plays the
sortie; a few strangers with these counts would show which of the above matter most.

## What not to take from them

- Tap, hold and double-tap on one key for different jobs (Star Citizen).
- Modifier combinations (Alt + a key) for anything common.
- Power, shields and weapons as separate switches, or menus for something done every session (Elite's old docking).
- A hundred bindable actions. Xenophon's twenty-odd is a strength.
- Roll on the mouse.

## Sources

The two games' defaults are from community guides and the Star Citizen Wiki, and both change between versions. Read
2026-11-19.

- Star Citizen Wiki, Guide: Controls (revision of 13 July 2026): https://starcitizen.tools/Guide:Controls
- Star Citizen, Master Modes guide (3.23): https://robertsspaceindustries.com/comm-link/SCW/20053-API
- Spectrum, "master modes is so unintuitive":
  https://robertsspaceindustries.com/spectrum/community/SC/forum/3/thread/master-modes-is-so-un-intuitive-it-cannot-be-what-
- Spectrum, 3.23 PTU keybind change summary:
  https://robertsspaceindustries.com/spectrum/community/SC/forum/4/thread/3-23-ptu-keybind-change-summary
- Elite Dangerous keyboard and mouse settings (2024): https://www.mejoress.com/elite-dangerous-keyboard-controls-mouse-settings/
- Elite Dangerous, every bindable action: https://gamepretty.com/elite-dangerous-all-keybinding-lists/
- Frontier forums, simple controls for new players: https://forums.frontier.co.uk/threads/simple-controls-needed.299850
- Frontier forums, relative mouse: https://forums.frontier.co.uk/goto/post?id=5950921
- Elite Dangerous Wiki, the Odyssey HUD: https://elite-dangerous.fandom.com/wiki/HUD/Odyssey
