# Working on Xenophon: Twin Stars

Notes for AI sessions on this project. Read [README.md](README.md) and
[docs/implementation-plan.md](docs/implementation-plan.md) first. The plan is the spec: its
decisions (section 25) are settled and are not to be reopened.

## What this is

A multiplayer, procedurally generated, pixel-art space and planet game that runs in a browser
tab with no server of ours. Two factions, always-on PvP, 40 habitable worlds. Named Xenophon:
Twin Stars on 2026-11-19 (it was Borrowed Stars). Built with SvelteKit (Svelte 5, static adapter) and TypeScript.

## How the work is done

- **Quality bar: beautiful and fun.** Art drawn in code was rejected outright as ugly. Art
  from the local image model was accepted ("so much better"). Never ship programmer art.
- **Taste, as stated so far:** pointed, aggressive, angular spaceships in the vein of hard
  science-fiction space sims; nothing bulbous; no aircraft or jets; ships all roughly the
  same size. Players choose their ship's colours; factions do not.
- **Mockups first.** Before building anything visual, generate a mockup of what it should look like with the image
  model and build towards that. Mockups go in `art/mockups/`.
- **The repository is public** (github.com/strickland84/xenophon, GPL-3.0 code, assets reserved: `ASSETS.md`), and
  `main` is deployed by Vercel to xenophon.me. Work on a branch and open a pull request; CI
  (`.github/workflows/ci.yml`) runs lint, check, build and the tests. `CONTRIBUTING.md` is the contributors' guide.
- **Never commit a secret.** Keys live in `.env` (git-ignored) and are read from there by the tools.
- **Commit as you go**, each finished piece of work, staging your own files by name.
- The maintainer's own working notes (his machine, his services, how he likes to work) are in `CLAUDE.local.md`,
  which is not in git.

## Rules of the codebase

- **The engine knows nothing about the page.** `src/lib/engine/` has no DOM and no Svelte and
  runs in Node. It is stepped with a time, told what the player is doing in plain numbers,
  and gives back a picture as bytes.
- **`sim/` only changes state; `render/` only reads it.** A new system is a slice of state in
  `state.ts`, a `sim/` module that steps it, and a `render/` module that draws it.
- **The simulation must be deterministic** given the same inputs: seeded randomness only
  (`mulberry32`, `hash8`), no `Math.random`, no clocks. Multiplayer and the tests depend on it.
- **Everything is drawn into one low-resolution pixel buffer.** Never scale a sprite; zoom by
  changing the size of an art pixel. All pixels on screen stay the same size.
- **Code style:** Prettier and ESLint as configured (no semicolons, single quotes, 140
  columns). Comments say what a thing is for, in plain words, as the existing ones do.
- **Plain words in names and comments.** Match the surrounding code's voice.
- **Desktop only.** The game is for a desktop with a mouse and a keyboard (a game controller works too). A phone or a
  tablet is shown a page that says so and links to the repo (`display/desktop.ts`, `DesktopOnly.svelte`). Add no touch
  controls or phone layouts (James, 2026-11-19; it was "phones are first-class").
- **Works alone.** With no other players and no network, everything still runs.

## Before saying work is done

1. `npm run lint`, `npm run check` and `npm test` all pass. Tests take about 40 seconds (worlds are built once and kept: `testing/surfaces.ts`; the first run builds them).
2. **The frame tests pin every pixel.** A change that is meant to alter the picture is
   accepted with `npm run test:record`; say so in your report. A change that is not meant to
   must leave them passing untouched. New features get scripted flights of their own in
   `src/lib/engine/testing/scenarios.ts`.
3. **Look at what you made.** Render frames to PNG and read them. A script in the style of
   `tools/art-sheet.ts` (run with `npx jiti`) can create a scene, step it and write
   screenshots with `tools/png.mjs`. Do not report visual work you have not looked at.
4. Update the "State of things" section below, and the docs your work makes out of date.
5. Commit.

## The art pipeline

Art is drawn by an image model on this PC and turned into game assets by code. See the
plan's section 7 ("Art pipeline") and [docs/pixel-art-techniques.md](docs/pixel-art-techniques.md).

- **ComfyUI** runs on Windows at `C:\ComfyUI_windows_portable`, reached from WSL at
  `http://127.0.0.1:8188`. It was set up by another project, Eminent Domain
  (`/mnt/c/Users/James/projects-windows/eminent-domain`); its `docs/SETUP.md` says how to
  start it and lists the models. It does not start with Windows.
- **`tools/gen/comfy.py`** is this project's client. `txt2img` uses Z-Image Turbo, about 12
  seconds a picture, and takes an optional control picture for the model to follow.
  `comfy.busy()` says whether the queue is in use: wait for it, never jump it.
- **A shape guide is what makes the model draw what you want.** Prompts alone gave ten
  near-identical ships. A grey plan of the shape on black, passed as `control`, fixed that.
- **One recipe, shared style.** Each prompt is the subject followed by one shared style
  string, so a whole set comes out in one look (`tools/gen/hulls.py`). Change the recipe,
  never a single prompt.
- **Ships are seen from three sides.** Each hull's plan is a solid (`src/lib/art/hulls.ts`: every part's outline from
  above, the side and behind); the model draws it from each over grey guides of it (`tools/gen/hulls.py --view`); the
  voxels are carved from all three and lit by which way each face faces (`tools/voxel/carve.py`, `jet/mesh.ts facesOf`).
  Keep the top outline exactly: rooms are laid out from it.
- **Pictures in, game pixels out.** The model draws 1024-pixel pictures in a pixel-art
  style, not true sprites. Code shrinks them to game size (`tools/voxel/carve.py`). Never build a sprite larger than
  the picture has pixels (its own pixel-art pixels, measured): some would be doubled and look larger than those round it.
- **Inside, one projection: top-down and square-on, on a grid of 8 px tiles.** Floors from straight above; walls and
  every piece of furniture showing their top and a little of their face towards the bottom of the screen; nothing
  isometric, turned or corner-on; light from above. Every piece covers a footprint of whole tiles and rises a set
  height into the row behind; it is drawn for each facing it has (s, e, w, n), never mirrored. The model's tries are
  checked in code and redrawn until they fill their rectangle (`tools/voxel/tiling.py`). The rule in full, and how to
  add a piece: [docs/pixel-art-techniques.md](docs/pixel-art-techniques.md), "Interiors: one projection".
- **Python tools** run with `uv run`, their dependencies declared at the top of the file.
- Generated source pictures live in `art/`. Generated code (ship models) is written into
  `src/` by a tool and is never edited by hand.
- **Sound comes the same way** (the plan's section 17): Stable Audio 3 (small, sound effects) in the same
  ComfyUI, and the music from ElevenLabs Music (`music_v2_5`, James's key, given to `tools/gen/music.py` by
  `--key-file` or `ELEVENLABS_API_KEY`), one recipe
  (`tools/gen/sound_recipe.py`), takes cut and measured by code (`tools/gen/sounds.py`, `music.py`,
  `tools/audio/pack.py`). Nobody here can hear: choose by measuring and looking at plots, then James
  chooses by ear on `/sounds`. Every model's licence and source is in the plan's section 7.
- TRELLIS.2 (picture to 3D) is also installed there.

## State of things

Update this section when your work changes it. Keep each entry to what is true now.

- **2026-11-19, Xenophon: Twin Stars, and public** (James: "borrowed stars is lame"; "Rename everything properly";
  "The game will be completely open on a public repo"). The game, its sides and every id were renamed: the Charter is
  **the Nomarchy** (`nomarchy`), the Drift **the Anarchoi** (`anarchoi`, plural: "the Anarchoi are"), save keys and
  rooms `xenophon/...`, the namespace `xenophon-dev-g1`, `window.__xenophon`, the font `xenophon-pixel.ttf`; old saves
  and events are not read. The lore is the lot and the urn, Gant is gone (`docs/factions-and-races.md`, the
  story-voice skill); the title has no line under it (James: "horrible slop"); the Nomarchy's ranks are Greek (`daily.ts RANK_TITLES`).
  **The narrator is Xenophon**, ElevenLabs on `eleven_v3` with "[Greek accent]" (voice: the entry above)
  (`tools/gen/voice_recipe.py NARRATOR`, `tools/gen/narrate.py` reads the key from `.env`); all 78 lines read, packed
  with `tools/audio/narration.py --keep` (Whisper mishears the accent; James: "ignore the whisper thing"). He says the
  title (`title`, `TITLE_LINE`) as the name is lit and on the title page once the sound is on (`saidWithin`), and the
  opening line begins again when the sound comes on during it (it was never heard: the first press is what lets the
  sound on). **Brand:** the mark, wordmark and banner in `static/brand/` (`uv run tools/gen/brand.py`, `uv run
tools/voxel/brand.py`; tries in `art/brand/`); the favicon is `mark-32.png`, the title page shows the wordmark. The
  menu has a GitHub tile and Settings a link (`version.ts SOURCE`). **Public:** github.com/strickland84/xenophon, the
  history begun again; GPL-3.0 code (`LICENSE`), assets all rights reserved (`ASSETS.md`); `README.md` (the old one is
  `docs/developing.md`), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `.github/` (CI: lint, check, build,
  tests; templates; Dependabot; CODEOWNERS); Vercel (`vercel.json`, static `build/`) serves `main` at xenophon.me.
  James's private notes moved to `CLAUDE.local.md` (not in git).

- **2026-11-19, the controls reviewed against Elite Dangerous and Star Citizen** (players: "the control scheme is very
  hard to follow"). `docs/controls-review.md`: what confuses (the mouse steers four ways by view and zone, F's tap and
  hold, W/S pitch against the genre, no full controls card, silent changes of context) and nine ranked suggestions.
  Nothing built yet but the first piece: **up climbs** (James: "make UP CLIMBS the default"): the mouse and a stick climb
  moved up unless Settings says Up dives (`invertY` false on the page, `Game.svelte`; the engine's default, which the
  scripted flights fly with, is still true, so no frame changed); the pitch keys named by what they do (`up` W and the up
  arrow, `down` S and the down arrow) and never turned over by the setting (`keyboard.ts invert`); old default layouts
  renamed by `readBindings`. **Then Elite Dangerous's flight layout** (James: "build it to mirror elite dangerous control
  scheme"): W/S the throttle (and walking), X all stop (`stop`, a page action: `setThrottle(0)`), A/D turn, the arrows
  pitch and turn, Tab the boost and Shift too (it runs on foot: `hints.ts runKey`), C the cruise drive (it was J for a day: James, "cruise was better as C"; a save with it on J has it on C again,
  `readBindings`; `params.cruiseKey` names it on the HUD), I the hold, F9 a clip, K and L guns and missile from the keys. The mouse from behind and the seat
  is a stick everywhere (in space its height was an aimed nose with an edge band: now a rate, `FLIGHT3D span`, `curve`),
  its middle drawn as a dotted ring with a line out to the pointer (`MOUSE_STICK` in `data/hulls.ts`, `render/hud.ts`;
  `npx jiti tools/mouse-stick.ts out.png`). Old saves' untouched keys move over (`bindings.ts BEFORE_ELITE`). The
  narrator read the throttle, steer and dive lines again. Fourteen flights re-recorded on purpose ([J] CRUISE, the ring).
  The controller is as it was. **Alt and Ctrl thrust straight up and down** (`thrustUp`, `thrustDown`; `HeldControls.lift`,
  `ctl.keyLift`, `LIFT`, `flight.liftV`: the nose does not pitch for them), the keys under a bound Ctrl or Alt are the
  game's, and Ctrl+W asks before closing the tab (`keyboard.ts guard`); `sim/lift.spec.ts`, flight `the thrusters:
up, down, left and right, from behind`. They move the ship and the height it holds together (they had moved the height
  alone, and the nose wobbled chasing it: James, "a bit wobbly"); held down all the way to the ground Ctrl lands, as F
  does (`landing.ts sinking`, `LAND.sunk`). **Q and E thrust sideways** (`strafeLeft`, `strafeRight`;
  `HeldControls.strafe`, `ctl.keyStrafe`, `flight.sideV`), the nose not turning. **The mouse ring can be hidden**
  (Settings, Mouse ring: `settings.mouseRing`, `params.mouseRing`). The first sortie's steer step teaches the mouse as a
  stick, C and Tab; its dive step the down arrow or Ctrl; its land step Ctrl all the way down (the box and the narrator,
  all read again).
- **2026-11-19, a full screen button** (James: "a fullscreen button in the top menu after the sound effects button …
  simulate F11"): `FullscreenButton.svelte`, beside `SoundButton` in FighterJetScene's top row, puts the whole page full
  screen (`requestFullscreen`) and back (or Esc); hidden where the browser cannot. Its icon is the model's
  (`icon-fullscreen-2`, `uv run tools/voxel/interface.py --fullscreen`).
- **2026-11-19, the link's picture** (James: "make a nice opengraph image for xenophon.me"). `static/brand/og.png`,
  1200 × 630: its own sky with the suns at the edges (`uv run tools/gen/brand.py og-sky`, try 5 picked in
  `tools/voxel/brand.py PICKS`), the shield over the wordmark, and two lines in the game's pixel font (`words`, `og`);
  `src/app.html` has the Open Graph and card tags.
- **2026-11-19, a shadow on foot, the base's pages over the sky, repairs told, no roll landed** (James: "on foot can you
  give our player a shadow - its especially apparent we dont have one when jumping"; Market and Supplies "not even usable
  unless at a base. These 'tabs' should move to the Base header next to Hangar"; "need some tooltips or something on how
  to repair my ship"; "we should not be able to do a roll when landed"). **The shadow** (`render/walker.ts`) lies on the
  ground under him (`groundAt`), at his sprite's lowest drawn row (`lowestRow`), a pixel wider than him each side, two rows
  deep and darker; in a jump it stays down there, smaller and fainter as he rises (`SHADOW_HIGH`); inside, at his feet.
  `npx jiti tools/foot-shadow.ts out.png [scale] [clock] [crop]` draws it close. **The base header** at a friendly base:
  its name (the hold), Market, Supplies, Hangar, Deck, Aboard, each with its icon (`hangar`, `deck`, `aboard` drawn in
  `tools/voxel/hud_icons.py`); Market and Supplies open the base's screen at that page (`BaseScreen start`,
  `Game.svelte openBase`), and away from a base Tab shows the hold and vault with no tabs. **Repairs:** a tooltip on
  Supplies, and the tips `repair` (the hull holed in flight: land at a base and hold the mining key, or Supplies) and
  `repairHere` (landed holed at a friendly base). **No roll** landing, landed, docked or lifting (`sim/flight.ts
startRoll`; `sim/roll.spec.ts`). Twenty flights re-recorded on purpose (every one with a pilot on foot or inside: the
  shadow).
- **2026-11-19, audio fetched afresh when it changes** (James: "I still hear the old voice overs!": the files kept their
  names, and his browser its copies). Every file under `static/audio/` has a fingerprint of what is in it
  (`src/lib/audio/fingerprints.ts`, written by `node tools/audio/fingerprints.mjs`, which `tools/audio/pack.py` and
  `narration.py` now run when they finish); `audio/mixer.ts audioUrl` adds it to the address (`?v=`), and `vercel.json`
  keeps `/audio/` a year, immutable. `fingerprints.spec.ts` fails while the table and the files disagree.
- **2026-11-19, desktop only** (James: "remove all MOBILE views and adjustments - this game is now purely intended for
  desktop mouse and keyboard. If someone is on a narrow device like that just point them to the github and tell them to
  get a PC"). `display/desktop.ts isDesktop` (a fine pointer and a screen 1,024 px on its long side; `?desktop=yes` gets
  past) decides in `routes/+page.svelte`; anything else gets `DesktopOnly.svelte` (after `art/mockups/desktop-only.png`;
  the icon `static/ui/desktop-24.png` by `uv run tools/voxel/interface.py --desktop`). Gone: `TouchButtons.svelte`, finger
  steering (`input/pointer.ts` is the mouse's), the `touch` InputKind and every touch wording in the help, prompts, tips
  and the narrator's lines (the sortie's `touch` voice and its fifteen recordings), the scene's `hudTop` and `hudSides`
  (`clearWidth` is the frame less 16 px), clips off on touch, the tooltips' long press, the maps' pinch,
  `?touchControls`, `tools/phone-check.mjs` and the tools' phone runs. Controllers stay. Every entry below that names
  the touch screen's buttons is of how it was. The plan's sections 16 ("Desktop only") and 25 (decision 11) have it.
- **2026-11-19, T targets what the ship aims at, and far ships** (James: "I want T to target the nearest thing to your
  crosshair or essentially where the ship is aiming"; two ships in the distance could not be picked). `sim/target.ts
candidates` orders by how far a thing's middle lies off the guns' line on the frame (`aimOnFrame`, `offAim`; `TARGET`
  `aimNear`, `aimFar`, `reach`, `sights`, `behind`), then by distance; a ship past `pickShip` is picked while drawn 2 px
  across (`seen`, `lost`). `docs/targeting.md` has it. Two flights re-recorded on purpose (`a raider targeted from behind
and shot`, its checks changed to the new order; `targets picked in turn from the seat, beside a station`);
  `tools/film.mjs` films the target flights too.
- **2026-11-19, a mouse loops in space again** (James: "with the mouse cursor pitching up and down, I cannot do a full 360
  spin. I can do it with W and S though"). The pointer still aims the nose, but in a band at the frame's top or bottom (its
  outer tenth, `FLIGHT3D edge`, `edgeRate`) it pitches on round as the keys do (`sim/spaceflight.ts readStick`; tests in
  `sim/spaceflight.spec.ts`). One flight re-recorded on purpose (`climbing and diving in space, from the seat`).
- **2026-11-19, the seat never all roof** (James, of the cockpit with the picture size at 2: "Not great"). The cockpits'
  art is at most 256 rows and never scaled, so a taller frame repeated its roof (three fifths of the view on a tall
  window). In the seat the scene's fit asks for a frame no taller than `COCKPIT_TALLEST` (300, `sim/interior.ts fitOf`'s
  `tallest`), and the page makes the art pixel that much larger there (`display/screen.ts wanted`; the flights do the
  same, `scenarios.ts`). `npx jiti tools/seat-frame.ts out.png [hull] [page w] [page h] [art pixel]` shows it.
- **2026-11-19, the narrator's voice and the music made again, and the intro's own music** (James: "find a better
  elevenlabs voice"; the music "more in keeping with the game, more midi"; "The intro needs music too"). The narrator is
  **Theos** (`n0vzWypeCK1NlWPVwhOc`, `eleven_v3`, "[Greek accent]"; `voice_recipe.py NARRATOR`), chosen from ten voices
  by measurement (`tools/gen/voice_eleven.py`, `voice_check.py`): the deepest and slowest of them. All 78 lines were
  read again. The music is sequenced MIDI-style game music of the early 1990s (`sound_recipe.py SCORE`, `NOT_MIDI`,
  patches named in every piece), two takes of each piece and sting. The opening story has its own piece and place,
  `intro` (`moods.ts`, set by `Game.svelte` while `IntroCrawl` is open). Nobody has heard any of it; the plan's section
  17 has the details. The repo is private "for now" (James, 2026-11-19); the site at xenophon.me was paused, and is live
  again.
- **2026-11-19, the wind leaves what stands on the ground, and no sheet of cloud lies across the view as a line** (James:
  "it pushes my ship around when landed"; "a very clear thin line that looks like land"). The wind (`sim/hazards.ts
standing`) no longer moves turrets, pilots on foot, a parked ship, or his own ship landing, landed, lifting off or left.
  A thin sheet (`render/clouds.ts drawSheet`) thins into wisps and is gone as it is seen edge on from the camera
  (`SHEET_SLANT` in `data/skies.ts`): near its height it had made hard bands at the horizon. Twenty flights re-recorded
  on purpose.
- **2026-11-19, the opening story and the first sortie's narrator give context** (James: the lines were "so esoteric";
  "Right, the clamps let go when you ask them to. Take her out -- WHAT THE FUCK EVEN IS THIS?"; the intro "so AI").
  The opening story (`story/intro.ts`) is told as a film serial's crawl: the war flared again over Drassel, ore spilt
  when shot down and nobody's until banked, worlds go by their flags, who is hiring, a new pilot in a cold ship at the
  dock (lore in `docs/factions-and-races.md`). The narrator's sortie lines (`story/sortie.ts`) say what is going on,
  the control and why, in five versions (keys, PlayStation, other controller, touch, and `any` for a pilot who has bound
  his own keys; `sortieVoice`, `sortieLine`, played by `Game.svelte sayStep`); the box's second line gives the reason
  (`tutorial.ts`, `FREE_LINE`). The story-voice skill's rules 9 and 10 say so. All 77 lines read again.
- **2026-11-19, what stands on the ground goes into the haze with it** (James: "why do some props stick out like a sore
  thumb"). The weather's haze (`render/weather.ts hazeWorld`) is laid by the zone's `drawHaze`, after the veins, wreckage,
  loot, mining, marks and creatures (it was in `drawBack`, under them: graves, beacons, crates and flags stood sharp in a
  whiteout or fog); ships still fade by `seen`. Marks, crates and flags also take the ground's own haze, far off from
  behind and high overhead, in its steps (`render/world.ts groundHaze`, `inHaze`). Eight flights over worlds with
  weather re-recorded on purpose.
  **The weather's haze thinned** the same day (James: "too thick in most worlds", `MURK` and `WHITEOUT` in
  `render/weather.ts`): it starts further out and is never as thick (rain 0.35, snow 0.4, storm and ash 0.5, dust 0.55,
  fog 0.7, a whiteout 0.85); the radar loses a ship at `LOST` 0.58 (`render/hud.ts`), so storm, fog, dust and ash still
  hide ships and rain and snow do not. Seven flights re-recorded on purpose.
- **2026-11-19, missiles come back, and a poor pilot can be chased down** (James: "missiles to slowly replenish, like 1
  every 15-30s … so you dont get totally out"; "they turn back at you too often … we just constantly fly in loops … at
  least the easier enemies"; the plan's section 8). The pilot's own rack fills again, one missile every 20 s
  (`MISSILE.regen`, `combat.ts stepFighters`, `Fighter.missileIn`, sound `rearm`; the HUD shows the rack while it is
  short, the next dart filling). The computer's pilots (`data/skirmish.ts skillAt`, `sim/pilots.ts think`): skill
  decides how hard a pilot turns (`turn`, from half his hull's rate), how often he turns hard away and how long he
  flies on after (`evade`, `steady`; `Brain.calm`), whether with an enemy on his tail he runs for it instead of turning
  back to fight (`flee`, `fleeFor`, `run`; `Brain.nerve`, `pace`) and how wide he runs out after a pass (`wide`). The
  near bands (level 0.3 and under) are chased down in 15 to 20 s by a plain pursuer where they were not downed at all;
  the core's (0.6) and the best fly much as before. To change how hard enemies are, change `skillAt` or a band's
  `level` (`data/bands.ts`), never `pilots.ts`. Flights `a missile fired, and the rack filling again`, `a poor pilot
chased down`; 26 flights re-recorded on purpose (the rack on the HUD, and every fight).
- **2026-11-19, the wing link, clips, and repairs where the ship stands** (James, of three ideas for the game spreading:
  "these suck, except 3. Do 3. Then also, we need in game repairs at stations"; the plan's sections 15 "The wing link",
  16 "Clips" and 11 "Repairs where the ship stands"). **The wing link** (`net/wing.ts`: `?wing=<start of his key>.<zone>
.<c|d>.<CALLSIGN>`, read by `settings/query.ts` into `NetSettings.wing`): Invite in the menu and the squad panel
  (`WingPanel.svelte`, `Game.svelte inviteByLink`) gives an address; whoever opens it is asked only for a callsign
  (`Onboarding` `invite`: the sender's side, a look made for him, no opening story, the first sortie left), goes to the
  sender's zone (or where the relays' presence says he is now), and once the two are in one room is put flying on his
  wing with five seconds' protection (`Scene.flyBeside(id)`) and into his squad (`wingLook`: the newcomer asks, and for
  half an hour after making a link its maker takes on those of his side who ask). A pilot of the other side is told so
  and flies on as he was. **Clips** (`display/clips.ts`, `ClipPanel.svelte`): the game is filmed all the while (two
  films eight seconds apart, each begun again every sixteen, so the older always holds the last eight to sixteen
  seconds; 1280 px across, every art pixel a whole number of px, a strip under it with the game's name and the
  callsign, the mixer's sound with it: `audio/mixer.ts tap`); the `clip` action (X, the touch screen's Clip under More;
  `Bindable 'clip'`) cuts it off and shows it, to share (where the device shares files), save, and send with the wing
  link. On where there is a mouse, off on a touch screen unless turned on (`settings.clips`, Settings, Picture); said
  once a session after the first bounty. **Repairs**: down or docked at a friendly base with the hull holed, the mining
  key held (R; the touch screen's Repair in Mine's place) mends it there, 30 points a second, sparks off the hull, a
  credit a point as far as the pilot's credits go (`sim/repair.ts`, `scene.repair`, `REPAIR` in `data/shop.ts`; the page
  says what he has with `Scene.setPurse` and is told what it came to in the ledger, `kind: 'repair'`, booked as a thing
  bought); the HUD says HOLD [R] REPAIR n CR over the prompt, REPAIRING over a bar, NO CREDITS FOR REPAIRS
  (`render/hud.ts repairLine`). The base screen's Repair button is as it was. Flight `a holed hull mended at a station`;
  `node tools/wing-link.mjs out/ <url>` and `node tools/clip.mjs out/ <url>` play the link and a clip in a browser they
  start themselves (two tabs over `?net=local`); pictures `docs/art/gen/wing-link-*.png`, `clip-*.png`,
  `repair-at-a-station.png`. Not done: nothing is given to either pilot for a friend brought in; an old pilot who
  follows a link is moved to the sender's zone wherever he was; the link's zone is the sender's when he made it (the
  relays' presence corrects it only if they are up).

- **Sprite art pass.** ChatGPT ImageGen supplied the [art direction](art/mockups/sprite-finish.png)
  and the new cargo crate, map table, planter and reactor source art. Those four props use the
  existing footprints and pass the same tiling and noise checks. Pilot sprites keep trim, boots
  and visors defined by their plans at both sizes. Wildlife uses a consistent set of coat and
  feature colours across its facings. Ship armour and glass use separate lighting ramps, with
  cool shadows and brighter reflections drawn from each pilot's paint.

- **2026-11-19, the music made again by ElevenLabs** (James: "a wider, better, more varied and fun, intense set of
  music"; his key, a paid plan; the plan's section 17 "The music, made again"). Thirteen pieces and four stings, 41
  takes, 76 minutes, from composition plans section by section (`tools/gen/sound_recipe.py MUSIC`, `SCORE`;
  `uv run tools/gen/music.py --key-file <file>`, then `uv run tools/audio/pack.py`). Places (`audio/moods.ts`): title,
  calm, night (`zone.night`), harsh, foot, space, cruise, hole, hangar, map, and a fight at three levels, alert,
  combat and peril (`fightLevel`, `createFightWatch().look(level, now)`; 140 BPM, E minor; one level to the next comes
  in at the point the last had reached). Stings over the music (`Music.sting`: win, lost, arrive, taken; chosen in
  Game.svelte `stingsFor`, `worldsChanged`). Breaks the service leaves in pieces that must not stop are cut out
  (`music.py close_gaps`, `steady`). Ogg Opus only now (James: "assume modern browsers"): no MP3 anywhere,
  `effectPath(name, n)`, `piecePath(name, n)`; music at 64 kbps. Nobody has heard it; `/sounds` marks it New.
  Picture: `docs/art/gen/music-moods.png` (the sound check's music scene). The old ACE-Step takes are in
  `art/audio/takes/music-acestep/` (not in git).
- **2026-11-18, no passage between a world and space: its air is flown through** (James: "why do we NEED a transition?
  Why isnt the whole universe one seamless thing??"; the plan's section 6 "No transition"). The game still has two
  zones (a flat ground that wraps, a ball in space) and the air between them is where one is drawn as the other
  (`sim/air.ts`, `render/air.ts`, `travel.e`: 0 in space's plane, `AIR.ground` at the top of the world's sky), but
  nothing begins or is flown for the pilot: **`sim/travel.ts flyAir`** flies him through it at his own pace, steering
  as ever; a climb takes him up through it and a dive down (`AIR.cross` s at full push), and asking neither he stays
  where he is. **Up:** at the top of the sky a climb asked for goes straight on into the air and out into space
  (`stepClimbOut`); Use held high over the ground only climbs for him (`heldUp`). **Down:** over a world, flown `AIR.enter`
  px under the plane in a dive that is meant (`AIR.steep`; or all the way to the globe's own air), he is in its air
  (`spacezone.ts`, `worldUnder`), goes on sinking until he asks otherwise (`Travel.trim`) and comes out at the top of the
  world's sky, flying; Use held over a world only puts his nose down (`space.diving`). **He comes out over the place he
  left:** a world climbed out of is turned on, for this pilot only, to bring that place up to face the plane
  (`scene.spun`, `turnedOn`, `placeNormal`; everything that asks where a place of a world is goes through them), so its
  ground stays under him all the way up and its day comes up as he rises (`daylight.ts FADE_AIR`). **The camera** is
  space's own at the air's top and goes over to the sky's lower down (`AIR.cam`, `camera.ts flownFree`), so nothing
  jumps where they meet. Pictures `docs/art/gen/seamless-behind.png`, `seamless-seat.png`. Nine flights re-recorded on
  purpose; the scripted flights up and down fly themselves now (`scenarios.ts upAndOut`, `downTo`). Left, and the next
  step if it still feels like two places: worlds as true spheres all the way down (the plan says what that takes).
- **2026-11-18, nothing moves the ship but its pilot** (James, of space near a world: "spinning around getting sucked down
  … very horrible and disorienting"; "I want no gravity or wonky pulling of my ship"; the plan's section 6 "Nothing moves
  the ship but its pilot"). **No gravity** but a black hole's (`GRAVITY.hole`, `sim/space.ts pullOf`). **Near a world**
  the camera does not lean to look at it (`flight.look` is 0 in space). **The pointer in space aims the nose**
  (`sim/spaceflight.ts`, `FLIGHT3D`): how far it is above or below the middle of its steering (`view.steerY`: the sight
  from the seat, the ship from behind) is how far up or down the nose points, and stays; left and right still turn. The
  keys, a stick and the touch buttons pitch it round for as long as they are held (a loop in five seconds); let go near
  level it comes level, on its back it rolls upright, pointed well up or down it stays so and flies there
  (`FLIGHT3D.settle`). Overhead a climb or dive held only leans the nose. At the band's edge the ship goes no further and
  its nose is left alone. **A pilot's ship never flies itself:** the `wander` setting (true for a ship on show and the
  scripted flights; the page sets it false) is what made a ship with a still mouse or a lifted finger weave about and
  roll; without it it holds its course and height, over a world too, and a pointer steers however long it has been
  still. On the page a mouse moved within 1.2 s of the keys or a stick turning the ship does not take it from them
  (`FighterJetScene.svelte KEYS_KEEP`). To fly a mouse pilot in a tool: `sc.pointerMove` every step, `wander: false`.

- **2026-11-18, worlds made large** (James: "I thought the worlds were massive procedurally generated things?"; the plan's
  section 5 "Worlds made large"). A world of the galaxy is 16,384 px round, 8 × 8 regions each the size the whole world
  was (`world/lands.ts`: `GRID`, `WORLD`, `makeLands`, `bringWindow`, `groundAtPlace`, `buildLand`, `giveLand`,
  `landsAhead`, `inWindow`). **`World.height` and `World.mat` are a window** on it, 2048 px square round the pilot, read
  as ever with a place masked to that (`& NM`): never read the ground of a place more than a thousand px from him, and
  never keep an index into them for ground that may be written over (`inWindow` says whether a place's ground is in it;
  `lands.version` counts up as ground is written in). `World.size` is how far round the world is; distances go the short
  way round it by `wrapDelta` (`sim/loop.ts setRound`, set on every call into a scene). The home region is the world as
  it was built, its features where they were; other regions are seven more maps of the recipe, shifted. **Where two
  regions meet** the ground of one goes over to the other's across a narrow band (`FEATHER`), along a line that wanders
  hundreds of px and is frayed (`bendAt`, `SWELLS`, `FRAY`; the home region's own edge wanders outwards only, `HOME_OUT`):
  no straits, no straight edges (they ruled every world into a grid from space: `docs/art/gen/regions-joined.png`,
  before and after; `regions-joined-globe.png`). Thirty-eight flights re-recorded on purpose (2026-11-18). `sim/planet.ts buildPlanet` makes it, `keepWindow` keeps it round the pilot; the page
  builds the maps ahead in its worker (`Scene.zone.lands`, `giveLand`, `landsFromOutside`). From space the map is the
  whole ground (`space/maps.ts`). `npx jiti tools/world-across.ts out.png [world] [view] [seconds]` flies across one;
  pictures `docs/art/gen/big-world-*.png`. Tests take about 200 seconds now. **Places out over the world**
  (`world/places.ts`: settlements, ruins, standing stones, relays, mines' works; five spots to a region from the world's
  seed, laid into the ground as it comes into the window, `settlePlaces`, `World.features.places`, named on the HUD): art
  by `uv run tools/gen/places.py` → `uv run tools/voxel/places.py` → `world/placeart.ts` (generated), materials 80 to 93
  (`PLACE_MAT`, `NMAT` 96); `docs/art/gen/places.png`. Nothing can be done at a place yet, and the far regions have no
  ore, wrecks, veins or raiders.
- **2026-11-18, flown free in space, on foot at the ship's scale, veins only on foot** (James: "I cannot pitch up and down
  in space enough to even do a full 360 rotation … massively improve the flight model"; "on foot … too zoomed in … Keep
  same scale as when in ship"; of the ore veins seen from the ship, "just show them when on foot"). **Space flight**
  (`sim/spaceflight.ts flySpace`, `FLIGHT3D`; the plan's section 6 "Flown free in space"): the pilot's ship goes the way its
  nose points, in a band 900 px over and under the plane (`SPACE_DEEP`, `SPACE_TOP`); how the keys and the pointer fly it
  is in the entry above; the cruise drive, docking and a gate bring it level (`levelOut`, `squareUp`). **The camera
  pitches** (`View.pitch`, `cp`, `sp`: 0 everywhere but in space from behind and the
  seat): `sim/camera.ts` (`rig.camF`, `camU`, `free`, `poseOf`), and every drawing turns by it (`project`, `render/jet.ts`,
  `render/slabs.ts`, `render/globe.ts Cam` with `fz`, `ux`, `uy`, `uz`, `render/space.ts camOf`); a rolled picture turns
  about `scene.pivotNow`. The surface's flight and camera are as they were. **On foot** `FOOT.zoom` is 1 (the world the
  size it was when the ship set down). **Veins** are drawn only for a pilot out of his ship (`render/walker.ts drawVeins`);
  loose ore and crates far off are specks that go into the ground's haze (`render/loot.ts`, `render/world.ts groundHaze`).
  Pictures `docs/art/gen/space-loop-seat.png`, `space-loop-behind.png`. Every flight re-recorded on purpose.
- **2026-11-18, the way up and down made one, the whole world on its globe, day and night, orbits** (James: "cleaner
  more logical transitions from planet to space", "what are all these floating things", "why some planets have visible
  seams", "why do planets not orbit properly or have day night cycles", "always seeing the same settlements"; the plan's
  section 6 has it in full, and what is left). **The way:** the ground itself takes over from the air's globe at the
  world's ceiling (`AIR.ground` 0.72, `Travel.high`), where the two are one picture (`render/air.ts`: the air's ground in
  the ground's own colours, haze, clouds and shadows, `Globe.ground`; overhead the place under the ship lies down the
  frame from it by its height); below it a true descent or climb through the world's own sky (`sim/air.ts airHeight`).
  No fire going up; a ship makes little way over the ground in the air (`AirShape.pace`), so it comes out over the place
  it left; the camera looks down at a world from behind (`spacezone.ts`, 0.66) and keeps up with a fast climb
  (`camera.ts ALT_LAG`); from overhead a world is a whole ball (`OVERHEAD` 104, 84). **The globe is the whole ground**,
  laid round it as a Mercator map (`space/maps.ts merc`; `sim/air.ts latOf`, `rowOf`; its equator the row midway between
  its bases, `world/world.ts equatorOf`, `rowOfGround`, `groundOfRow`); its clouds the ground's own. **Day and night**
  (`sim/daylight.ts`: `SUN`, `sunHeight`, `stepDaylight`, `scene.daylight`): a world turns in 27 to 57 minutes, its frame
  turned to its sun (`travel.ts sunTurn`, `render/space.ts worldTurn`), and on the ground the light is what its globe
  shows where the pilot is; the colours go over in 24 s; `params.timeOfDay` on a world of the galaxy is the scene's own
  (the settings do not set it; the recipe's only says how baked shadows fall). **Orbits:** `ORBIT_SLOW` 4 (was 120);
  stations creep as before (`galaxy.ts STATION_SLOW`). Far-off worlds in their own colours with names under them
  (`render/space.ts FAR_COLOURS`, `render/spacehud.ts`); a giant's seam (a hair line in its picture) taken out. Wire
  protocol 9. `npx jiti tools/way-film.ts out.png [world] [view] [every] [cols] [up|down|both]` films the way a frame at
  a time; pictures `docs/art/gen/way-*.png`, `day-and-night.png`, `globe-turning.png`, `far-bodies-named.png`. Every
  flight on a world of the galaxy or in space re-recorded on purpose (53); the belt's flights stand at a fixed bearing of
  its ring (`scenarios.ts beltSpot`).
- **2026-11-18, the seat key landed too** (James: "while landed and powered off G should also work so I can walk around
  ship"). Landed or docked anywhere, the seat key takes him into his own ship's rooms by the seat, as the hangar's
  Aboard does (the ship shut down behind him), and from them back to the seat (`sim/interior.ts toggleSeat`, `bySeat`);
  the touch screen's Seat is in More whenever he flies, and beside Run and Action in his own rooms.
- **2026-11-18, up out of the seat in flight** (James: "walk around the ship when its flying - like a toggle to get out of
  my seat"). The `seat` action (G, a controller's L3 = 10, touch Seat: in More flying, beside Run and Action up; old saves
  get G and L3 unless given elsewhere, `readBindings`; `params.seatKey`) gets him up flying his ship (`sim/interior.ts
canGetUp`, `getUp`, `sitDown`, `toggleSeat`): his ship's rooms (`shipRoom` of the flown hull, furnished), the scene still in
  its zone (`interior.flying`; `inRooms`). `sim/step.ts` runs the outside on calm controls (`calmed`) and walks him after
  (`stepUp`, which also sits him down if the ship is lost, lands or travels); `flyLeader` holds the heading he got up on
  and the height. Drawn by `render/interior.ts` with `render/upflight.ts` (`outsideOf`: the world's ground far below or the
  stars round the rooms; `shakeOf`; `drawUpHud`: AUTOPILOT, bars, [G] TO THE SEAT, HULL HIT / UNDER FIRE / MISSILE COMING;
  `UP_IN_FLIGHT`); sound `alarm`. `Scene.foot.up`, `InteriorStatus.flying/speed/struck/missile`; `pilot.inside` 0 (no
  protocol change). Page: `upNow` in FighterJetScene (`upHint`, chips 'up'), Leave says To the seat, the tip `seat`.
  Flights in `seatFlights` (`interior/flights.spec.ts`); `npx jiti tools/walk-in-flight.ts` draws
  `docs/art/gen/walk-in-flight.png`. The plan's section 6 has it, and what is left out.
- **2026-11-18, a jump and a climb on foot** (James: "space should jump ... and if up against a big cliff it should climb").
  Roll on foot (Space, the touch screen's Jump) leaps: up off the ground (`FOOT.jump`), with the old dive's dash when
  going somewhere (still a dodge); in the air he lands on any ledge up to his feet. Pushed against a cliff a moment
  (`FOOT.wall.grip`) he climbs it to its top; off an edge he falls (it was a wall). Deep water, lava, acid and a base's
  buildings still stop him. `sim/foot.ts` (`airborne`, `vz`, `climbing`), `sim/jump.spec.ts`.
- **2026-11-18, the boost heard** (James: "there is no engine sound for boosting with Shift"). The thrusters' boost has
  its own style in the recipe (`BOOST_STYLE`, `BOOST_SUBJECTS`): a roar with its weight from 150 Hz to 2.5 kHz, where a
  laptop's speakers play it (the first takes all lay under 150 Hz), chosen by `pack.py`'s `ROAR_LIMITS` (rough allowed,
  hiss and whine not); the thrust eases back a third under it (`cues.ts steady`).
- **2026-11-18, mining on a key of its own, and the hold's slots as icons** (James: on F, "you cant land if theres a
  mining thing nearby"). The laser and the hand cutter are the `mine` control (R, a controller's L1, the touch screen's
  Mine, shown while ore is in reach: `HeldControls.mine`, `params.mineKey`); F lands anywhere again, the HUD saying both
  (`minePrompt(scene, ore, L.landToo)`). The HUD's hold slots are wells with each item's own icon (`render/oreicons.ts`,
  now with the creatures' materials too: `tools/voxel/oreicons.py`), eight to a row (`HOLD_ROW`), a line for how full.
  The backpack on foot the same (`render/foothud.ts`, four to a row, `PACK_ROW`), its count over it while cutting, the
  prompt lifted over it where it would reach it (`promptWidth`).
  The six branches of 2026-11-18 (engines, skies, chat, power, creatures, mining) were merged together; the first
  sortie runs power, launch, look, steer, and the narrator has a line for power (`story/sortie.ts`).
- **2026-11-18, mining made worth watching (James: "an improved visual beam, showing what you're mining, a progress
  bar").** The laser and the hand cutter work in cuts (`sim/mining.ts Cut`, `stepCut`; `foot.cutter`): a bar fills, the cut
  breaks free in a burst (`MINE.batch` 3, `VEIN.batch` 2; the pace per second unchanged), with motes off the strike
  (`loop.mining.motes`) and the rock's heat; numbers in `data/loop.ts CUT`. `render/mining.ts` draws the beam in every view
  (dithered added light in the ore's glow, the strike, the heat, the flash; `nearX`/`nearY` put a point at its copy nearest
  the camera, also for chunks); `render/cuthud.ts` the brackets, icon (`render/oreicons.ts`, generated by
  `tools/voxel/oreicons.py`), name, RICH/GEMS, units left, the bar, +3 FERRITE, the hold's count; the cockpit shows the ore on
  a screen (`CockpitLive.ore`). Sounds `oreLock` and `cut` (existing takes). Plan section 11 "Built in Phase 4" has it;
  `npx jiti tools/mining-shots.ts out.png` draws close-ups; pictures `docs/art/gen/mining-*.png`. Flights `mining with the new
beam, overhead, from behind and from the seat`, `mining an ore rock in a belt`.
- **2026-11-18, creatures to hunt on foot** (James: "ground based mobs … to find and kill on foot while on planets, dropping
  materials - rare and not rare, credits etc"; the plan's section 6, "Creatures"). Eight kinds (`data/creatures.ts`):
  skitter, woolhorn (run), razorjaw, crawler (stalk, charge, bite), spitter (globs, `GLOB`), reefclaw (guards its patch,
  swims), snapweed (rooted, snaps), thornback (rare, riled). `FAUNA` says what lives on each archetype; how much hunts
  follows `wildness`. `sim/creatures.ts`: groups per 256 px cell from the world's key (`placeWild`), put up within 300 px of
  the pilot on foot, down past 420 (`scene.wild`); only with `locals` and in the loop (the old flights unchanged). Shots
  strike them (`creatureOnPath` in `guns.ts stepShots`), the sidearm's assist turns onto them (`foot.aimBeast`, gold
  brackets); struck: a flash, knockback by mass, a stagger, ichor (`wild.ichor`), a hurt bar; killed: falls and fades,
  `dropFrom` throws `wild.loot` out, walked over into the pack (`picked`) or the wallet (credits, a `bounty` 'hunting'); back
  at `wildBack` (a turn of the group's clock, at least 5 min); the kill told to the room (report and wire `beast`,
  `Scene.beastKilled`; each game moves its own copy). New resources hide, chitin, gland, heartstone (`wild`, `rare`;
  every market pays the standard). Drawn by `render/creatures.ts` (drops glint; a heartstone a turning star). Art:
  `tools/gen/creatures.py` (plans; `--loot` the drops' sheet) → `tools/voxel/creatures.py` (`creatures/art.ts`,
  `static/icons/hide.png` …; `art/creatures/picks.json`); mockups `art/mockups/creatures*.png`. Sounds are existing ones
  (`cues.ts` growl, bite, spit, beastDown, loot). `Scene.wildlife()` for tools; `npx jiti tools/creature-sheet.ts` draws
  `docs/art/gen/creatures.png`. Flights in `creatureFlights` (`creatures/flights.spec.ts`): a razorjaw hunted, a herd of
  woolhorns, a spitter's globs dived under.
- **2026-11-18, the ship's power and the weapons safe on the ground** (James after playing; the plan's section 16 has the
  rules). `sim/power.ts` (`scene.power`: on, level; `stepPower`, `shutDown`, `switchOn`, `powered`, `tell`), `POWER` in
  `data/hulls.ts`. Landed, docked, landing or lifting, nothing fires (`sim/fight.ts`; WEAPONS SAFE once a moment, GUNS SAFE,
  SAFE on the cockpit's weapons screen). The `power` action (P, D-pad down, the touch Power button in Missile's place while
  safe; `SceneAction 'power'`, `Bindable 'power'`, `params.powerKey`) switches it on or, landed or docked, off; refused in
  flight. With `params.coldStart` (the page sets it; scripted flights default false) a ship set down for its pilot
  (`parkOn`, `dockAtNearest`) or left by him (`getOut`, `goIn`, `delivered`) is off: dark screens with a standby light, HUD
  POWER OFF and [P] POWER UP, cold nozzles (`coldPaintOf`), dead throttle; Land or Use held powers it up and then goes. 2 s
  up: screens boot in turn (`render/cockpit/screens.ts boot`, `waking`), the HUD's bars fill and its radar sweeps in.
  `status.power`/`powerLevel`/`safe` for the page and sounds (`powerUp`, `powerDown`, `refused`, `safe` in `cues.ts`, old
  takes for now). The first sortie's first step is `power`. Flights `powered off at the pad, powered up, taken off` and `guns
held while docked fire nothing`; `npx jiti tools/power-sheet.ts out.png` draws `docs/art/gen/power-up.png`. The browser
  tools press P (or Power) where they take off.
- **2026-11-18, James's first play: the chat rebuilt, the help at the bottom, no brown behind faces.** The chat
  (`ChatPanel.svelte`, after `art/mockups/chat.png` and `chat-open.png`) is a column down the left of the view with no
  box: outlined pixel text on a soft dark fading right; the latest lines fade after 16 s; opened, the history (120 lines)
  with tabs All, Side, Squad, News, a line to type, Quick chat, Mute/Block from a callsign. Lines go to the room, the
  side or the squad (`Session.say(text, to)`, `sayQuick(n, to)`, `ChatLine.channel`; side and squad lines are sent only
  to those peers, no protocol change); news lines (pilots come and gone, losses, from the session; worlds taken, squad
  comings and goings, from the page). Its place is worked out from FighterJetScene's `onHud` (Game.svelte `chatPlace`)
  to keep clear of the HUD's corners and the touch buttons. In development `window.__xenophon.hear([...])` puts
  lines in it. The help line (`HintBar`) is always at the very bottom. Portraits: nothing behind the face on the page,
  one night blue in the HUD for both sides (`FACE_BACK`); the Anarchoi's card colour a violet night; the page's accent is
  the side's colour again for the Anarchoi (`[data-side]` in layout.css). Plan section 16 has it;
  no pinned frame changed (no flight has an Anarchoi pilot's face). Shots: `docs/art/gen/chat-*.png`.
- **2026-11-18, skies in layers, and on foot smooth (James's first play).** The heap clouds float at 160 to 380 px (they
  were at 40, under a ship's cruising height) and thin sheets lie over them: a mackerel sky, cirrus, a grey veil, by the
  world's kind, air and weather (`world/sky.ts skyOf`, numbers in `data/skies.ts`; clear, layered, overcast, storms
  towering and darkened). Drawn by `render/clouds.ts` after the ground and before the sky (`drawClouds`: depth-tested, so
  ships fly under, among and over them; the sheets' patterns from `render/skyart.ts`, whole-number noise, smaller copies
  for far off) and overhead over the ships as a veil sliding with parallax (`drawCloudVeil`, in `drawFront`); the ground
  march (`render/world.ts`) draws only their shadows now. `CLOUD_ALT` is the old height and no longer drawn at. On foot
  the overhead camera comes round to a quarter turn and moves by whole art pixels (`camera.ts`, `FOOT.squareUp`), and
  the page makes an art pixel a whole number of device pixels at any pixel ratio (`display/screen.ts`): the "scan lines"
  were the ground resampled at a slant every frame and, at 125 %, art pixels of 7 and 8 device px. Tools:
  `npx jiti tools/sky-sheet.ts`, `node tools/foot-smooth.mjs`; flight `climbing through layered clouds`; pictures
  `art/mockups/skies.png`, `docs/art/gen/skies-before-after.png`, `on-foot-smooth.png`. Every flight re-recorded on purpose.
- **2026-11-18, the engines made again** (James: "no engine sounds now at all which is bad"). The drives of hard
  science-fiction ships, a deep smooth hum with a body of tones and a slow throb, twelve-second loops: `drive_<size>_idle`,
  `_thrust`, `_boost` for light, medium and heavy (`ENGINE_SIZE` in `cues.ts`), `power_up` and `power_down` (faster light,
  slower heavy: `POWER_RATE`). Their own style in the recipe (`DRIVE_STYLE`, `DRIVE_STATES`: "humming drone", never
  "roar", "rumble", "loud" or "powerful", which gave low-passed noise), eight takes each, chosen by `pack.py hum_shape`
  (ear-weighted centre, body 150 Hz to 1 kHz, hiss, a narrow whine over 800 Hz, likeness to noise band by band, wander;
  limits `HUM_LIMITS`, the noise limit the recipe's `hum`). `steady()` plays them by `Listening.throttle` (the scene's
  `status.throttle`), speed, boost and `powered`/`starting` (read by `listener()` from `status.power` where the scene has
  one; none said, on); `powerOf`/`powerCue` and `sound.ts` play the powering up and down. `report.loops` shows the steady
  sounds going (the sound check reads it in the sky). On `/sounds` they are marked New (`Clip.new`, the recipe's `new`).
  The old `engine_*` loops and files are gone. Picture: `docs/art/gen/engine-sounds.png` (`uv run
tools/audio/engine_sheet.py`); the plan's section 17 "The engines, made again". Nobody has heard them; they are deep.
- **2026-11-18, the narrator** (plan section 17, "The narrator"): Chatterbox in a voice made from Kokoro's bm_lewis
  slowed and lowered 3 semitones, James's pick by ear, reads the opening story and a line as each step of the first sortie
  begins (`audio/narration.ts`, words in `src/lib/story/`). Change a line's words and read it again: `uv run
tools/gen/narrate.py`, then `uv run tools/audio/narration.py` (cuts, checks every word with Whisper, packs into
  `static/audio/voice/`); `narration.spec.ts` fails until then.
- **2026-11-18, the story's voice.** James: the writing was "so AI driven its completely obvious". Story and flavour
  text is written with `.claude/skills/story-voice` (who is talking, the world's own words, the rules, how to write a
  piece, anti-examples) and the global skills `humanizer`, `cliche-transcendence` and `prose-style`. Rewritten in it: the
  opening story (lore in `docs/factions-and-races.md`),
  the side cards' lines, the six races' (`races.ts what`), the ship pitches (`HULL_PITCH`), the first sortie's last line,
  the galaxy map's first note, the menu's Story tip. Instructions and stat lines stay plain.
- **2026-11-18, the opening story** (`IntroCrawl.svelte`): a first visit opens on a Begin button in the middle of the sky
  (2026-11-19, after `art/mockups/intro-begin.png`: its press lets the sound on, so the story is heard from its first word;
  left out when the sound is already on, and on the still page), then a line in the dark, the title lit a
  letter at a time, then the story a paragraph at a time, flat in the pixel font (`ui-head`), the one being read held
  still in the middle and the column gliding up between them (the perspective roll was unreadable), over the model's sky between the two suns (`static/ui/intro-sky.png`,
  `intro-stars*.png`, `tools/gen/interface.py` group `intro`); about 90 s, read aloud by the narrator and paced by his
  lines, the title music under it. Seen once (`intro`
  in the save; old pilots count as seen), skipped by anything after its first 12 s (`T.skipFrom`: the click that lets the
  sound on must not end it; the Skip button comes then), replayed by Story on the title and in the menu; Reduce
  motion gets a still page. `?intro=off` for the tools. Plan section 15.
- **2026-11-19, W and S pitch, E and Q the throttle** (James: "w = pitch up … E throttle up, q throttle down"). Keys:
  `down` (a pull, climbing as a flight stick) W and ArrowUp, `up` S and ArrowDown, `faster` E, `slower` Q
  (`input/bindings.ts`); a save with the 2026-11-18 layout unchanged takes the new one (`readBindings`). On foot and
  inside W still walks forward: the keys say how they walk apart from how they pitch (`HeldControls.walk`, `-climb` from
  the keys; a device that leaves it out walks as it climbs; the scene's `ctl.keyWalk`, read by `foot.ts pushOf` and
  `interior.ts`). The entry below is of the layout before.
- **2026-11-18, James's first playthrough: the throttle, no smoke, no engine drone, trails from the wingtips.** W and S
  (held), the mouse's wheel, a controller's right stick and a touch lever (`TouchButtons`, beside the left thumb's buttons)
  set the throttle, 0 (hanging still) to 1 (`scene.throttle`, `Scene.throttleBy`/`setThrottle`, `THROTTLE` in
  `data/hulls.ts`, `sim/flight.ts stepThrust`/`throttleNow`); climbing and diving moved to E and Q (Down and Up: E climbs as
  a flight stick) and the arrows, old saves' bindings moved over (`readBindings`); W and S still walk on foot and inside.
  The HUD's third bar (THROTTLE n, ALL STOP), the flight `the throttle: down to a stop and open again`. The dark exhaust
  smoke (`emitExhaust`) and the old engine loops are gone (the engines made again since, above); trails leave each mesh's own wingtips
  (`JetMesh.tips`, `wingtipAt`, drawn from where the tip is now). Every flight re-recorded on purpose. Plan section 16 has it.
  Space has height now: a band round the plane (`SPACE_LOW` … `SPACE_HIGH` in `data/space.ts`, `spaceLimits`) that the
  pointer, the stick and the keys climb and dive in, the view pitching from behind and in the seat; computer pilots
  follow in it (`pilots.ts`), rocks are passed over or under, the way down begins from the height it is at
  (`Travel.lift`). Every cockpit has the throttle's lever and the speed on a screen (`render/cockpit/screens.ts drive`:
  its nav screen's, or the weapons', or hull and shield's). Flight `climbing and diving in space, from the seat`.
  Out to space is quick: high up the air thins and a ship climbs up to 3.5 times as fast (`AIR.thin`, `thinFrom`); at the
  ceiling any climb asked for (`AIR.out`) goes on up (he was "bounced down" off a roof), into the world's air (the entry
  at the top). Held climb and dive keys win over the pointer from behind and in the seat. The first sortie has a
  `look` step after launch: V to see the ship from behind, the cockpit, and back overhead.
- **2026-11-18, furniture against the side walls (fault 10).** Side and back facings are drawn over a guide made from the
  piece's own front facing (`tools/gen/interiors.py --from-front`, `plan_from_front`); every try is judged as the game has
  it, in its front's colours with its specks taken out (`tools/voxel/tiling.py clean`), for noise (`noise`: a share of
  pixels like none round them, the size of its regions of colour) and likeness to its front (`unlike`), and
  `tools/voxel/interiors.py` makes side facings so and refuses noise. Landed, clouds show only as their shadows
  (`view.under`); a called ship takes the nearest treeless ground, or a clearing further out (`foot.ts spotNear`).
- **2026-11-18, the phone's buttons (fault 15, review fault 13).** `TouchButtons.svelte`: 48 × 56 px buttons, only what can be
  used now (Missile with missiles or mines aboard, Cruise in space, Climb and Dive overhead; the page passes `armed` and
  `atBase`), the rest under one **More** button in a small grid (View, Map, Chat, the Bag and Ship at a friendly base or
  docked, Menu; on foot the Beacon, Chat, the Bag, Menu). Flying, eight buttons where there were fourteen; `hudSides` 140
  CSS px.
- **2026-11-18, the beacon's words and quick chat (fault 22)** are a panel (`QuickWheel.svelte`, the shared `Panel`): a
  grid of phrase buttons, each with its key cap (the keyboard's top row, 1 to 9, 0, - and =), three across, four on a short
  screen.
- **2026-11-18, the side cards and the title's ships (faults 16 and 4).** Each side's card picture
  (`static/ui/home-nomarchy.png`, `home-anarchoi.png`) is drawn by the game itself, `npx jiti tools/side-cards.ts`: its capital
  station in its home system, its sun, three of its own ships in its colours from behind (the model's paintings flew
  jets; `tools/voxel/interface.py` no longer writes them). A flame pointing at the camera is foreshortened to a glow in its
  nozzle (`render/jet.ts endOn`): from behind, near the camera, its tail had hung down the screen (the title's crabs).
- **2026-11-18, one scale inside (the review's faults 9 and 12).** The hangar is laid out round the ship it holds
  (`data/interiors.ts bayFor`, `hangarLayout`; `interior/rooms.ts hangarRoom(hull)`): the bay a 12 px margin round the
  hull's larger build, the room as wide and long as the bay needs, its stations and doors moved out with it; the bay's
  picture grown by repeating a plain band of its plates (`render/interior.ts grownTo`), never scaled. Every place inside
  (hangar, deck, a ship's rooms) is drawn at one art pixel (`INSIDE.zoom`; `fitOf` returns null, `SHIP_FIT` is gone) and
  the camera follows the pilot where a room is larger than the frame, so he and the people round him are one size in
  every room; against a ship he is a sixth to a seventh of a light fighter outside and in the hangar.
- **2026-11-18, the ships rebuilt as solids (the review's fault 4, and 20, its patterns).** Each hull's plan
  (`src/lib/art/hulls.ts`) gives every part an outline from above, the side and behind (`solidOf`, `viewOf`); the model
  drew every hull from the side and from behind over guides of it (`art/hulls/side`, `rear`, picks in
  `art/hulls/picks.json`); `tools/voxel/carve.py` carves the voxels (7 to 15 slices; the hangar's builds 14 to 35), each
  face painted by the picture that looks at it, snapped to the top picture's palette, glass on the canopy, glow on the
  nozzles; the top outline exactly as before. Drawn (`render/jet.ts`): lit by face from over the viewer's shoulder
  (`facePal`, `paint.jetDeep`), the ship's own depth test (`Frame.jetZ`, `jetStamp`), a voxel as its screen box where
  slices are over a pixel apart, slices half a pixel apart overhead (`OVERHEAD_SPREAD`) stacked up from the belly;
  flames within their nozzles, tail first towards the camera. The chase camera sizes a ship by its span or most of its
  length (a needle was drawn four times over). Patterns follow the hull's form by face in flat tones (`jet/fit.ts
patterned`: stripes on the spine, bands round the hull, checks, a shark's mouth where the nose widens, tips, the upper
  hull two-tone). Sheets: `tools/ship-turntable.ts`, `ship-close.ts`, `chase-frame.ts`, `pattern-sheet.ts`;
  `docs/art/gen/ships-3d.png`, `chase-before-after.png`. Every frame re-recorded on purpose.

- **2026-11-18, a fresh review** (`docs/review.md`: 46 faults with pictures in `docs/art/gen/review/`, the twenty worst,
  what is left and what each needs). Fixed: a landing near a pad comes down on it (`LAND.padPull`, `sim/landing.ts`: the
  first sortie's last step stalled); a dive goes below the safe height after `CRASH_COMMIT` (1 s, `data/hulls.ts`) and
  coming down says Ejected (steer for land only over the sea); the first sortie's box waits while a place's name shows
  (`arrived`, set as soon as the zone changes); the bench and the booth stand beside the ship (`Panel beside`,
  `.ui-veil-beside`); a ship is bought from its card in the shop; furniture icons at 4× (3× in Furnish); the way down's
  fire an oval (`render/air.ts drawAirFire`); a sun's corona read between texels (`render/bodies.ts corona`); the hold's
  wells apart; the cruise pace after the bars (`hud.ts barWidth`); a prompt inside goes over the pilot when it would cover
  him; DOWN said once; the keep-safe reminder only at a friendly base, docked or inside, never over an open screen. Left
  (in the review), since done: wall-side furniture, the ship from behind, the hangar by hull, the pilot's scale, the side
  cards.
- **2026-11-18, polish step 9: fun fixed with what exists, the weakest screens raised** (`docs/polish-pass.md` "Polish step
  9", questions in `docs/playtest.md`). Fighting pays a living (`REWARD.raider` 0.6, `BAND_BOUNTY` for a band beaten, the
  counter makes up missing ore at twice its price: `data/shop.ts payFor`, used by the page's `spend` and the bench and shop);
  a pilot coming down over deep water, lava or acid glides (`DESCENT.glideSink/glideSteer`) with a ring where he lands and an
  arrow to land (`foot.down`, `foot.shore`, `shoreNear`), raiders' spots within 200 px of land (`ashore` in `sim/bands.ts`),
  a pilot down in a pocket set on open ground (`openGround`), a parked ship called to him (the `recall` prompt,
  `REDELIVER.recall`); hulls a quarter cheaper with `HULL_PITCH`, the `shipGoal`/`shipNow` tips (`NEXT_SHIP`, the page's
  `shipGoal()`), a ship bought is flown at once; the cruise drive starts 140 px from a station or gate and runs `far` 1.15,
  slowing at 1.5 of a black hole's or a sun's size and braking at once in a great pull (`nearestThing`, `stepCruise`);
  gems (`CHUNK.gem`, a chunk's `units`) and the laser's aim (`MINE.aim`); markets' own/lacking 0.9/1.1. Overhead, suns,
  giants and holes are drawn pulled back (`OVERHEAD_SHARE`); night sides lit (`space/maps.ts NIGHT`); close-up surfaces of a
  sun and a giant from the model (`SUN_NEAR`, `GIANT_NEAR` in `space/art.ts`, laid over finer); a hole's disc no longer winds
  up; the air's sky was drawn under the horizon (fixed in `render/air.ts`); the seat looks down at a world beside it. Night
  is moonlight (`grade`), a murk at sunset gold, the rose mesa palette deepened, buildings' walls have storeys and windows
  (lit at night, `render/world.ts`); the deck furnished, nine people; a ship's rooms fitted larger (`SHIP_FIT`, `Scene.fit`'s
  `least`) on the hangar's floor. `npx jiti tools/space-places.ts` and `tools/world-places.ts` draw the audit's places from
  the engine; `tools/players.ts` takes `--clock` and plays the older game from a worktree.
- **2026-11-18, polish step 8: beautiful and fun** (`docs/polish-pass.md` "Polish step 8", questions in
  `docs/playtest.md`). The settings rebuilt (`SettingsScreen.svelte`: a rail of sections, key caps, grouped actions);
  the maps use the model's marks (`static/ui/mark-*.png`; the radar keeps dots); fitted parts are 10 to 16 px in flight
  with their own palette family (`render/paint.ts PART_COLOURS`, `jet/fit.ts PART_AT = 113`, `PAINT_N 129`); every piece
  inside drawn in the hangar's recipe over sketches (`tools/gen/interiors.py sketch_ship`, `--plain`); the way down reads
  maps from levels (`render/globe.ts levelFor`); on touch, prompts wrap clear of the buttons (`hudSides`, `clearWidth`,
  `fitLines`); an arrival's name sits on a plate (`namePlate`). Camera views are `rig.target` (0 overhead, 1 behind, 2
  the seat): tools change them by it or the V key (`params.view` is not read). `node tools/audit.mjs <dir> [groups]`
  captures every screen and place, `uv run tools/audit-sheets.py <dir> before|after` makes the contact sheets
  (`docs/art/gen/audit/`); `npx jiti tools/players.ts` plays six kinds of pilot for half an hour and reports pacing.
  New tips (`sell`, `frontier`); a pilot shot down where his side has no station gets his ship at the nearest one a
  jump away (`sim/stations.ts stationAway`).
- **2026-11-17, after the last pass: the hangar again, the way down quicker, relief, the black hole** (`docs/polish-pass.md`
  "After the last pass"). The hangar is 38 × 21 tiles and seen whole: `Scene.fit` (the room and `FIT`'s margin) caps the
  page's art pixel (`screen.ts setZoom(zoom, fit)`; the flight harness and `tools/inside-sheets.ts` do the same); the deck
  too. Its stations and props are `HANGAR_PIECES` in `tools/gen/interiors.py`, drawn over sketches in true greys
  (`sketch`) in one hangar recipe, tries chosen by eye (`--every --pick`); side-wall facings over the side-on plan
  (`--side-on`, `plan_side`); walkways are `L` tiles of `floor-lane`. `npx jiti tools/hangar-shot.ts out.png 1366 768`
  draws a place inside as a page of that size shows it. The globe's pixels are painted a span at a time
  (`render/globe.ts paintRun`, `spanOf`; keep numbers that change a pixel at a time out of module `let`s: they are boxed),
  with relief on the way down (`RELIEF`); `node tools/measure-down.mjs` times the way down by tenths; `tools/slow-machine.mjs`
  takes a list of places (`down,whole,fight`). A black hole in perspective is tilted (`render/bodies.ts drawHoleTilted`).
  Canyon and mesa worlds darken with depth (`render/world.ts deepColours`). The page's pointer and the base screen's
  picture are the model's (`static/ui/cursor-32.png`, `reticle-32.png`, `home-base-*.png`).
- **2026-11-17, the last pass (handed to James next): `docs/polish-pass.md` "The last pass", and `docs/playtest.md` for
  him.** The interiors rebuilt on the tiling rule (one projection, top-down and square-on on 8 px tiles; every piece a
  footprint of whole tiles with its rise and facings, `PROPS` in `data/interiors.ts`; the model's tries checked in code
  and redrawn until they pass, `tools/gen/interiors.py`, `tools/voxel/tiling.py`, `art/interiors/picks.json`; placement
  by rule with refusals, `interior/rooms.ts` `placeAt`, `shipKit`, `walkable`, `wallJoin`); the hangar and the deck laid
  out after top-down mockups; the hangar's ships no longer than their pictures have pixels. Save version 9 (fit-outs
  laid again), wire protocol 8. Play fixes: boost heat (`THRUSTERS`), a quicker parachute (`DESCENT`), AMBUSH once a
  band in 90 s (`BAND.toldAgain`), enemies hidden by weather off the radar, no shared pad on spawn (`freeSpot`), stations
  their world's holder's (`ownerOf`), the cockpit altimeter on the way down, raider bands tuned. Art: bases' ground
  rounded, ocean atolls, the Skarn. Sound: the flagged takes made again and the air's own roar. Speed: a world's disc
  from overhead in space kept a moment (`drawGlobeTopKept`). Proven: terrain identical in Chromium, Firefox and WebKit
  (`tools/terrain-browsers.mjs`); speed with the processor slowed (`tools/slow-machine.mjs`); the build's download
  (`tools/download-size.mjs`); an hour's play (`tools/long-run.mjs`); three pilots through the real relays
  (`tools/together.mjs`); the rest of the game played through (`tools/playthrough.mjs`). Development and
  `VITE_PLAYTEST=1` builds give tools `window.__xenophon` (`scene`, `inner` the state, `open` a room's tiles, `net`).
- **2026-11-17, polish pass items 1, 3 and 7 done: the pilot his true size, a cockpit for every hull, rooms worth
  walking into.** `docs/polish-pass.md` has the list; the plan's sections 6, 7 and 10 the detail. Out on a world the
  pilot is drawn from a sprite half the size (`RACE_ART[race].small`, `tools/gen/races.py SMALL`), the camera in twice
  as before (`FOOT.zoom`; the page's zoom may now be a fraction); inside from his full sprite at 1.5 (`INSIDE.zoom`). The hangar
  draws his ship from its larger build (`jet/models/big/` from `build_hulls.sh` and `to_model.py --big`;
  `meshOf(hull, true)`, `fittedMesh(make, true)`, `BIG_PART_ART`; `hangarShip` in `sim/interior.ts`). Cockpits:
  `tools/gen/cockpits.py` (layouts and plans) → `tools/voxel/cockpits.py` → `render/cockpit/art.ts` (generated);
  `build.ts` fits one to the frame, `draw.ts` lays it, `screens.ts` draws the live instruments; `CockpitArt.clear` is
  where the world stops being drawn. Interiors: `ROOM_KINDS` and `SHIP_ROOMS` in `data/interiors.ts`, `shipRoom` and
  `shipKit` in `interior/rooms.ts` (rooms by kind, a fit-out), `render/interior.ts` (walls with faces, lit floors, baked
  once a room); art from `tools/gen/interiors.py` (44 pieces, 6 floors, 4 walls). Patterns have their own colour family (97..112, `PAINT_N`
  113). Save version 8 (`ShipRecord.kit`), wire protocol 7. Sheets: `npx jiti tools/inside-sheets.ts` +
  `uv run tools/inside-sheets.py`; `tools/props-sheet.ts`, `tools/pattern-icons.ts`.
- **2026-11-17, polish pass items 4, 5 and 6 done: true scale, black space, every view.** `docs/polish-pass.md`
  has the list, the plan's sections 4 and 6 the detail. Bodies at their true size (`galaxy/galaxy.ts`: a
  world 1,900 to 3,400 px in radius, a giant 5,200 to 8,800, a sun to 13,500, orbits `ORBIT` 12 times out, a
  system ~280,000 px across); worlds and moons below the plane (`BELOW`), suns, giants and holes in it. The
  cruise drive has its own action (`cruise`: C, R1/RB, the Cruise button) and its pace goes with the
  emptiness (`CRUISE`, `sim/space.ts cruisePace`). The way down and up is one flight through the air
  (`sim/air.ts` the shape of it, `render/air.ts` the picture; `AIR`), flown at the pilot's own pace, the zone
  changing half way. Every view in space: `render/globe.ts` casts rays at spheres
  (spans of 8 px, near to far, `COVERED`), `render/slabs.ts` lays stations, gates, rocks and derelicts out as
  slices; overhead, worlds are drawn smaller (`OVERHEAD`). Stations have turrets (`stationTurrets` in
  `bases.ts`). Others see a pilot go (`Space.flashes`). Wire protocol 6. `tools/space-sheets.ts` (run with
  `npx jiti`) draws the sheets in `docs/art/gen/` (entry, exit, space-views, space-black).
- **2026-11-17, polish pass items 2 and 10 done (the interface, and its art from the image model).** The same
  look made with care: one type scale (`routes/layout.css`: label and body 21 px, head 28, title 42; nothing
  read is under 21, `phone-check.mjs` fails it), one set of components there (`ui-panel`, `ui-btn`,
  `ui-btn-main`, `ui-btn-quiet`, `ui-tab`, `ui-row`, `ui-well`, `ui-meter`, `ui-key`, `ui-input`; `styles.ts`
  names them) and their Svelte parts (`Panel`, `Tabs`, `Count`, `UiIcon`, `Emblem`); build new screens from
  them, never `text-[14px]`. One tooltip (`use:tip`, `tooltip.svelte.ts`, `TooltipHost` in Game.svelte) carries
  what screens no longer say. Motion from `motion.ts` and the layout's tokens; Reduce motion is
  `settings.motion` (`data-motion` on the page) and the HUD's `hudMotion`. The HUD's `hudScale` (2 where an art
  pixel is small or larger text is chosen; `font.ts setTextUnit`) and `sim/hudfx.ts` (what the HUD shows a
  moment behind the truth). Art: `tools/gen/interface.py` → `tools/voxel/interface.py` (emblems in
  `static/emblems/nomarchy-64.png` … `anarchoi-16.png`; homes, icons, items, hulls in `static/ui/`),
  `tools/item-icons.ts` (furniture). `tools/interface-sheet.mjs` makes the before and after sheets.
- **2026-11-17, the polish pass (`docs/polish-pass.md`), item 8 done: enemies belong to places.** No
  wave comes at a pilot in the galaxy: the old skirmish (`sim/skirmish.ts`, its HUD counter, banner, ships,
  game over) runs only for a pilot with no side over the island world (`skirmishOn`); it still keeps the
  kill tally and the points over kills for everyone.
- **2026-11-17, polish pass item 9 done: sound and music from real audio** (the plan's section 17). 85
  effects (Stable Audio 3) and 7 pieces of music (ACE-Step 1.5, installed into the ComfyUI), four takes
  each, from `tools/gen/sound_recipe.py`; chosen by `tools/audio/pack.py`'s measurements; played by
  `src/lib/audio/` (mixer, library, cues, sound, music, moods, ui) from `static/audio/` (11.1 MB the game
  downloads, lazily). `/sounds` and `art/audio/samplers/` are for James's ears; nobody has heard any of
  it. The engine also reports `shieldUp`, `deploy` (what: the race), `burn` (lava or acid) and the ground
  under a `step` (`SoundEvent.what`), and `FootStatus.cutting`. Other items of the polish pass not yet.
- **Where danger is** (`galaxy/danger.ts`, pure, shared by the sim and the maps): lane distances (gates,
  not the black hole shortcut) from each side's held systems give each system's wildness (0 home, 1 the
  frontier by a side's space, 2 deeper, 3 the core), whose patrols fly there (a side's own space and the
  front line, both sides), and a pilot's danger 0..3 (`systemDanger`, `worldDanger`, `galaxyDanger`,
  `spaceBands` for where raiders wait in space). As made, the front is Celium, Drassel (the core),
  Phabaon and Mivos.
- **The galaxy's own ships** (`sim/bands.ts`, `sim/traffic.ts`, numbers in `data/bands.ts`; the `locals`
  setting, on by default, turns them off): plans per zone (ids from what a band is and where, so every
  game agrees); raider bands (by rich ore, at outposts' ways in, at gates, in belts, at the shortcut,
  holding moons), a derelict's drones (salvage strewn as they come out), patrols (a world's two bases out
  and back; a system's stations, worlds and gates), each woken near a pilot and put to sleep when none is
  near; beaten, back at a turn of its own clock (`backAt`), passed on by a room's host (`Scene.setRoom
cleared`, `clearedBands`). Brains: `pilots.ts` LURK, PATROL, RETURN; prey within notice (more for a
  loaded ship), ground (leash), never under a base's guns (raiders), turns at one pilot (`attackers`).
  Haulers fly by the clock alone (never sent). Turrets fire on the other side's patrols. Kills pay by
  danger (`BAND_PAY`). The news: AMBUSH, DRONES, PATROL, RAIDERS BEATEN, DERELICT CLEARED; `status.ambushed`
  feeds a first-time tip. `stateOf(scene)` (engine index) lets tools look into a scene's state.
- **On the page:** the maps' danger (chevrons by a system's name, the front ringed red, a skull where
  raiders wait, a card's danger and who lives there, a legend; `art/mockups/map-danger.png`); the HUD's
  danger line on arriving. Wire protocol 5 (computer ships carry band, side, lying in wait; the packet the
  bands beaten); the host trims two games' copies of a band to one.
- **Tools:** `npx jiti tools/locals.ts [minutes]` plays a quiet and a dangerous ten minutes;
  `tools/first-hour.ts` recovers from being shot down and runs home when ambushed (numbers before and
  after in the plan's section 22: home unchanged, the frontier about 1.8 times home's pay, deeper out
  costing ships).
- **2026-11-17, Phase 9 (part one: the first session).** A stranger can start alone. Its gate (can a
  stranger play with no help?) needs a stranger; a scripted one who reads only the prompts finishes it
  in Node and in a browser (laptop and phone). No raiders live in a side's home system, and the first hour
  earns by mining (`HOME_PAY`: home pays 60%).
- **The first sortie** (`src/lib/tutorial/tutorial.ts`, `TutorialPrompt.svelte`): a new pilot starts
  docked at his capital station; launch, look, throttle (closed and opened again: Q and E, the wheel, the right stick), steer, descend, dive, three training drones (one targeted with T, then shot down), mine, land on an
  outpost's pad, out, beacon, board, bank; then the galaxy map on today's hotspots. One prompt, one
  control, in the bound keys of the device in use (`input/hints.ts namer`); Skip and End (and in the
  menu); the step that fits where he is takes over, and getting back on (shot down, killed, inside) has
  its own line. Kept in the save (`tutorial`); `?tutorial=off` skips it for the tools. It uses the scene's
  API only: `setCourse`, `Scene.setGuide` (`sim/guide.ts`: a mark drawn, never acted on), and `drill`
  ships (`ShipInput.drill`: training drones only this game knows, circling their spot, never firing,
  paying nothing, no deed, left out of the session, left alone by turrets; `DRILL` in `data/skirmish.ts`).
  Tips after it (`tutorial/tips.ts`, kept as `tips`). Tests: `tutorial.spec.ts` (a scripted stranger),
  `tips.spec.ts`; `node tools/first-session.mjs out/ [laptop|phone|both]` plays it in a browser.
- **Keeping the pilot** (`save/backup.ts`, `BackupPrompt.svelte`): his key as an `nsec1…` phrase, the
  pilot file, a sealed copy on the relays (AES-GCM by a key from his secret, kind 30078, `d` tag
  `<namespace>/pilot`; relays and the fake relay now know `#d` and addressable kinds). Asked after five
  minutes flown once the first sortie is behind him, when calm, then every 25 minutes until kept
  (`backup` in the save). Restore on the title by file or phrase (the phrase looks for the sealed copy).
- **Settings** (`SettingsScreen.svelte`, title and menu): bindings (`input/bindings.ts`: keys and
  controller buttons, read by keyboard.ts and gamepad.ts, named by the help and the prompts), guns and
  thrusters as switches (FighterJetScene), invertY, volumes, the art pixel's size, flames, camera shake
  (the scene's `shake`), the menus' text size (`data-text` on the page, layout.css), the key, the relays
  (moved from the menu). Save version 7 (`tutorial`, `tips`, `backup`, `played`, the new settings).
  Panels answer the arrow keys (`padnav.ts arrows`). Shapes as well as colours on the radar, bases'
  names, chat and the maps (25 flights re-recorded).
- **Music** (`audio/music.ts`, moods by `audio/moods.ts`): pieces from files, by place (title, calm or
  harsh world, space, fight, hangar, maps), streamed, cross-faded, rests between takes outside; its own
  volume; made in Game.svelte (it plays on the title too).
- **Old builds** (`version.ts`, `UpdateBanner.svelte`): the version in the menu and Settings; presence
  carries the wire's version (`Chronicle.newerProtocol`); SvelteKit's `updated` (looked for every ten
  minutes); a banner offers to reload.
- **Touch:** `node tools/phone-check.mjs out/` walks every screen at 844 × 390 and checks it; fixed: a
  touch button's finger no longer steers (pointer.ts ignores presses on buttons), a still finger keeps
  steering, Climb and Dive buttons overhead (a held climb works while a finger steers), the prompt keeps
  between the side buttons. `npx jiti tools/first-hour.ts` plays the first hour's earning.
- **2026-11-17, Phase 8.** Ships, upgrades and the places inside are built on Phases 1 to 7: a pilot
  buys hulls and keeps them, fits weapons and modules that show on the hull, paints every colour,
  walks his hangar, the station deck and his ship's rooms, furnishes them, flies in squads, wears
  gear. Its gate (do players care about their ship?) needs players.
- **Loadouts** (`data/loadout.ts`, tested by `loadout.spec.ts`): weapons on a hull's mounts (cannon,
  the hull's own and drawn into it; flak; a mining laser; a missile rack; a mine layer, `sim/mines.ts`)
  and eight modules in its slots, each with what it gives and costs; no fit is more than a quarter
  better than its hull bare on any fighting stat. The scene's settings: `weapons` (by mount), `parts`
  (modules), and the paint `trimColor`, `glowColor`, `trailColor`, `pattern`, `emblem`, `factionMark`.
  `sim/outfit.ts` turns them into a `ShipMake` and a `FitEffect` (`scene.parts`); another ship takes a
  make as text (`ShipInput.make`, `makeText`/`readMake`). Guns fire by mount in turn (`guns.ts`:
  `SHOT_FLAK`, `SHOT_LASER`; pilots' `SHOT_ROCKET`); secondary drops a mine when nothing is locked.
- **Fitted ships drawn** (`jet/fit.ts fittedMesh`): the hull's voxels in a taller grid, the parts' art
  (`jet/parts.ts`, from `tools/gen/parts.py` → `tools/voxel/parts.py`) hung at places worked out from
  the hull's top view (weapons on the wings or a chin mount; back, spine, roots, flanks, outer, tail,
  nose, chin), each with a dark rim; patterns move body voxels to palette family 4 (the trim, 65–80),
  an emblem and the side's mark are family 5 (81–96, `paint.ts` `PAINT_N` 97). A plain make is the
  hull's own mesh, so nothing old changed. `npx jiti tools/loadout-sheet.ts` draws a hull fitted.
- **Interiors** (a third zone, `'interior'`: `sim/interior.ts`, `render/interior.ts`,
  `interior/rooms.ts`, numbers and layouts in `data/interiors.ts`, art `interior/art.ts` from
  `tools/gen/interiors.py` → `tools/voxel/interiors.py`): the hangar, the station deck (its crowd
  when alone) and a ship's rooms worked out from its hull's outline (`shipRoom`: a fighter's
  cockpit; up to cockpit, map room, quarters, cargo bay). Landed or docked: `Scene.goInside(place,
hull?, owner?)`, `goOutside`; Use by a spot: doors are the scene's, screens the page's
  (`takeUses`); furniture `setFurniture`, `placeFurniture`; others there `setVisitors`;
  `Scene.interior`. The outside waits (his ship sheltered). `npx jiti tools/interior-sheet.ts`.
- **Squads and gear:** `sim/squad.ts` (`Scene.setSquad`; slipstream `data/squads.ts`; the HUD's
  list); `data/gear.ts` (`gear` setting: cutters, a launcher, heat and cold linings: a volcanic or ice
  world bites on foot without one, packs, a cover cloak).
- **The page:** save version 6 (`save/ships.ts`: ships with loadout, paint, furniture, `open`; the
  flown ship; schemes; gear worn; hulls owned per the property log: `hull:`, `weapon:`, `module:`,
  `gear:`, `furn:` counted by piece). `LoadoutBench`, `PaintBooth`, `ShopScreen` (deck: ships,
  gear, furniture), `FurnishPanel`, `PilotSheet`, `SquadPanel`, `Panel` (shared). Landed at a
  friendly base: Hangar, Deck, Aboard over the sky; H or Ship goes into the hangar (cycling hulls
  free is development builds only). `node tools/hangar.mjs out/` plays it all in a browser.
- **The network (protocol 4, now 5: the galaxy's own ships, above):** the card carries `make`, trim, glow, trail, `open`, `furniture`; the
  pilot's state (64 bytes) says where he is inside and which room; events `mine`, `mineEnd`,
  `squad`, `squadIs`; `Online` invite/accept/leaveSquad/squad/shipOf.
- **Phase 7, as it was.** Phase 7 (factions and the persistent world) is built on Phases 1 to 6: the
  galaxy remembers. What pilots do that outlasts a session (a flag, a delivery, a kill, a wreck, a
  grave, a beacon, a ghost, a world's name) is a signed Nostr event, kept in the browser, handed to
  the room, and sent to six public relays; every game works territory and traces out of its set with
  one pure rule. Its gate (does the map change between sessions?) is answered yes by the tests, and
  once over the public relays with a check event; in play it needs players.
- **The persistent world, underneath:** the rule is `engine/galaxy/territory.ts galaxyState(events,
now)` (numbers in `data/territory.ts`; influence a week, holding, the front, the underdog, a day's
  cap per pilot per world, rejected events and why); the day is `galaxy/daily.ts` (hotspots, tasks,
  ranks). The network side is `net/events.ts` (kinds 7451 and 17451, the namespace tag: `xenophon-dev-g1`
  in development, `xenophon-g1` released), `net/archive.ts` (the local copy: a checked union),
  `net/relays.ts` (a pool, polled; `fakerelay.ts` for tests), `net/chronicle.ts` (archive, relays,
  presence, `DEFAULT_RELAYS`) and `net/persistent.ts` (the scene's deeds into events, the pilot's
  standing, the scene told how the galaxy stands). `session.ts` hands a newcomer the newest events and
  passes new ones on, and carries chat, quick chat and bounties. Section 18 of the plan has it all;
  the research notes say what was checked about the public relays (`tools/relay-check.ts`).
- **The persistent world in the engine** (`sim/traces.ts`, drawn by `render/traces.ts`, art in
  `traces/art.ts` from `tools/gen/traces.py` → `tools/voxel/traces.py`): `Scene.setTraces` (holders,
  this world's name, the front, its marks, wrecks stripped), `takeDeeds`, `recordGhost`,
  `plantBeacon(phrase)`, `Scene.traces`. A base not a capital is its world's holder's (`ownerOf`, used
  by `friendly` and the flags). The capture site is each habitable world's outpost mast (not a
  capital's): held Use on foot plants a flag. Wrecks are stripped on foot, beacons read near, ghosts
  are ships drawn see-through (`renderer.ts`), shot by the player's guns. Hotspots need the clock
  (`setClock`). With nothing said by the page, the scene is as before (the old frames prove it).
- **The persistent world on the page:** `Game.svelte` makes the chronicle (no relays with `?net=off`
  or `local`) and the pilot's `Persistent`; `MapScreen` (holders, influence bars, pilots by system,
  bounties, hotspots, discovery names), `FactionBoard`, `ChatPanel` and `QuickWheel` (quick chat, a
  beacon's words), `PilotsNearby` (mute, block), `NameWorld`; the menu opens them, records a ghost and
  lists the relays (changeable, kept in the save). Save version 5 (`progress`, `social`,
  `settings.relays`; `save/progress.ts`). Each side starts at its own capital; the smaller side's card
  offers a joining bonus. `npx jiti tools/factions.ts out/` plays it in a browser with a seeded week of
  war (laptop and phone). In development `window.__xenophon.chronicle` is there too.
- **Phase 6, as it was:** Phase 6 (space) is built on Phases 1 to 5: the galaxy is a place. A pilot
  climbs out of a world into its system's space, cruises across it, docks at stations, jumps
  gates and threads a black hole's ring to other systems, and goes down to any world from over
  it. Its gate (is travel quick and worth looking at?) needs James to play it; it was built and
  tuned with scripted flights, a scripted pilot timing journeys, and a browser (laptop and
  phone). The gates of Phases 2 to 5 are still open too.
- **Zones** (`sim/zone.ts`): one scene is in one zone, `scene.zone.kind` 'surface' or 'space'.
  A `Zone` says how the player's ship is flown (`limits`, `fly`), what is stepped after every
  ship has moved (`after`), and what is drawn behind and over the ships (`drawBack`,
  `drawFront`); `step.ts` and `render/renderer.ts` ask the zone. `SURFACE` is the old code, in its
  old order (the frame tests prove it); `SPACE` is `sim/spacezone.ts`. In space the world under
  the scene is emptied (`world/world.ts clearWorld`: no ground, no sea), so everything that asks
  about the ground finds none; ships fly level at `SPACE_Z` (64); things do not fall
  (sparks, wrecks, debris, crates, chunks: branches on `scene.zone.kind`); distances in the loop
  use `deltaIn` (no wrap in space). The zone's key is `scene.worldKey`: a world ('w12') or a
  system's space ('s3', `systemOfKey`); the `world` setting takes either (`worldSettings('s3')`
  gives space's settings), and a scene can begin in space (docked at a friendly station if any).
- **Space** (`sim/space.ts`; numbers in `data/space.ts`): the system's bodies, each at
  `positionAt` on the shared clock slowed `ORBIT_SLOW` times (4 since 2026-11-18: moons and worlds are seen to move); the cruise
  drive (its own action: spools 1.2 s, then 0.9 of the distance to the nearest thing each second,
  8× to 640× speed; held guns; drops out when shot, firing, in a black hole's strong pull,
  and near the end of a plotted course; 4× among a belt's rocks); a black hole's gravity as a drift that builds in its
  well and dies away (`GRAVITY`; nothing else pulls); a sun's heat, a giant's crushing depths, a black hole's horizon (death).
  What Use does (`space.prompt`): dock, undock, jump, thread, descend, skim, mine.
- **Transitions** (`sim/travel.ts`, `scene.travel`, stepped in both zones): 'out' and 'down' are
  a world's air (`travel.e` 0 in the plane to `AIR.ground` at the top of the world's sky, `dir` the way he is going;
  `flyAir` flies it as he asks, `stepAir` changes zone at `AIR.switchDown`/`switchUp`): 'out' climbing on at the
  ceiling, 'down' diving at a world or moon from space, 'gate' (3 s
  charging held in the ring, Use held; a flash; out of the far gate), 'hole' (Use held in the
  ring's band for 0.55 s, then flung out of the linked hole). `enterSpace`/`enterSurface` leave
  everything of the last zone behind (as `arrive` does), keep the hold, apply the zone's
  settings and repaint. After an arrival Use must be let go before it acts again.
- **Stations, rocks, shards** (`sim/stations.ts`, `sim/belts.ts`): a station is a `Base`
  (`baseOf`), docked as landed (`loop.landing` LANDING/LANDED/LIFTING, `space.dock` the dock);
  docking banks the hold; docked, the base's screen works and the ship is sheltered. Shot down in
  space, a pilot of a side floats 2.2 s and is docked at the nearest friendly station (fee paid),
  or landed at a base of the nearest world if the system has none. Derelicts let out three
  drones (the host's) and strew salvage crates. Belts are cells of 150 px whose rocks come from
  their place (`hash2`), drift on the clock, stop shots and missiles, knock the ship; ore rocks are
  outcrops to the laser (ids from their cell: `rockOfId`). Void shards circle black holes, scooped
  by flying through; helion gas is skimmed from a giant's upper bands (Use held). Both are new
  resources (`helion`, `void`; icons in `static/icons`).
- **Space drawn** (`render/space.ts`, `render/globe.ts`, `render/bodies.ts`, `render/slabs.ts`,
  `render/air.ts`, `render/spacehud.ts`), in every view: black, 1,100 stars as directions (overhead,
  two slow depths that streak at cruise); globes wrapped in maps lit from the sun (giants: bands by
  latitude bent by `warp`); suns granular with prominences; black holes bending the frame behind them;
  structures as slabs. A world's or moon's map is its own built surface (`space/maps.ts`: 1024×1024,
  the whole ground; its clouds too); a body a few px across is drawn plain (never from a map, so frames do
  not depend on what was built before): in Node the scene builds maps as it draws them; the page calls
  `mapsFromOutside()` and builds them in the worker (`Scene.zone.maps` → `givePlanetMap`), the
  body drawn plain until then. The HUD in space: Use's prompt, the cruise drive, the course
  arrow with distance and seconds at cruise, stations' and gates' names and radar blips,
  HEAT/GRAVITY/CRUSHING, the system's name on arrival.
- **Space's art** (`tools/gen/space.py` → `art/space/source` → `tools/voxel/space.py` →
  `space/art.ts`, generated): gas giants' bands, a star's surface and two nebulae (as
  brightness), rocks bare and with ore at six sizes (`ROCK_SIZES`), the station kit (three hubs,
  an arm, a solar wing, tanks; stations are built from it in code, `drawStation`), a gate, a
  derelict, a black hole's disc, a shard, the two icons. Mockups: `art/mockups/space-*.png`,
  `map-*.png`. `npx jiti tools/space-sheet.ts out.png` draws one of each body
  (`docs/art/gen/space.png`).
- **Maps** (`components/MapScreen.svelte`, on the map action: M, touchpad/Select, the Map
  button), in three dimensions and the game's own pixels since 2026-11-19 (James: "3d pannable scrollable zoomable";
  `maps/starmap.ts` draws them and knows no page, `components/StarMap.svelte` flies the camera: drag, right drag or
  Shift to turn and tilt, the wheel or a pinch, W A S D Q E R F + − H, a controller's right stick and triggers; marks
  are unseen buttons over the picture; `npx jiti tools/starmap-shots.ts`, `docs/art/gen/starmap.png`; the plan's
  section on the maps): the system (orbits in perspective, every world and giant a lit, turning globe of its own map,
  stations, gates, the pilot, the course), the galaxy (a disc of dust, stars on stalks, lanes, homes, where he is, a
  route), and a card for what is picked
  (kind, holder, resources, what it does) with Plot course / Plot route. A route is the page's
  (`worlds/route.ts`: fewest jumps; `Game.svelte` sets the course to the way on in each system).
  `docs/art/gen/galaxy-map.png`. The menu's travel list is gone; the menu says where you are.
- **Space on the page and the network:** `Game.svelte` follows the scene's zone (saves it,
  moves rooms: `galaxy1-s3` is a system's space), builds the world it is over or going down to
  in the worker, and the maps it wants; touch shows View, Cruise and Map; `input/hints.ts`
  `spaceHint`. Wire protocol 6 (space's true size). `session.spec.ts` flies pilots in
  space over the memory bus (seeing each other, a hit, a jump leaving one room for the next, a
  rock cut agreeing, one going down to a world seen by those in space and on the world). `node
tools/space.mjs out/ <url>` plays space in a browser (laptop, phone).
- **Phase 5's state, as it was:** a pilot climbs out of his
  landed ship, or is shot down and comes down on foot; he walks, hides under trees, cuts veins,
  shoots, signals, steals parked ships, calls a new ship or dies and is back at a base.
- **On foot** (`sim/foot.ts`, the player; `sim/walkers.ts`, others; `sim/veins.ts`,
  `sim/signals.ts`; drawn by `render/walker.ts`, `render/foothud.ts`, `render/portrait.ts`;
  numbers in `data/foot.ts`). Only in the loop (`looping`): elsewhere the old pick-up sequence
  plays. `scene.foot.stage` is ABOARD, FALLING, WALKING, DEAD or BOARDING; `foot.ship` WITH,
  PARKED, GONE or COMING. Landed, a tap of Use climbs out (a hold lifts off); the ship left is a
  `PARKED` fighter (id `PARKED_ID` in reports) that can be shot or stolen. The pilot is a
  `WALKER` fighter (radius 3.4, health 30): shots, splash from ships' shots into the ground,
  bolts from sidearms (`SHOT_BOLT` in the shot system). The scene asks the page for larger art
  pixels on foot (`Scene.zoom`: 2; inside 1.5); the camera stays overhead, does not turn, and hides cloud
  tops (`view.under`). Keys and sticks move him the way the screen shows (`foot.yaw`). Raiders
  strafe him aiming at his feet and lose him under trees beyond 34 px; turrets work as before.
- **The races** (`races/races.ts`: sides, skins and eyes; `races/look.ts`: a look as colours;
  `races/art.ts`, generated): each race's sprite from five sides with a four-step walk, its fall,
  four 32×32 portraits and their 16×16 shrinks. A look is text, `race.face.skin.eyes.suit.trim`
  (the `look` setting, the save, the card). Drawn by `tools/gen/races.py` from plans of their
  outlines in game pixels and shrunk by `tools/voxel/races.py` (`PICKS` chooses a seed's try).
- **The loop** (`sim/loop.ts` and its parts: `landing.ts`, `cargo.ts`, `mining.ts`,
  `crates.ts`, `bases.ts`, `sortie.ts`; drawn by `render/loot.ts` and the HUD; numbers in
  `data/loop.ts`, `resources.ts`, `shop.ts`). Land is a held control (`HeldControls.land`; F,
  Circle/B, the Action button; a press of use counts as a short hold): it lands, takes off, or
  fires the mining laser near ore. It acts only on worlds with features (galaxy worlds);
  starting landed, raid pacing, missiles bought not given, bounties and fees need the `side`
  setting too ("looping"), so flights over the island world of the settings are as before. The
  scene reports property as a ledger (`Scene.takeLedger`), says how the loop stands
  (`Scene.loop`), and takes UTC (`setClock`: outcrops come back on it). Parts fitted are the
  `parts` setting.
- **Features** (`world/features.ts`): bases, ore, rich deposits and wrecks stamped into every
  galaxy world by `buildSurface(world, recipe, siteOf(surface))`; their art comes from
  `tools/gen/features.py` → `tools/voxel/prefabs.py` → `world/prefabs.ts` (generated, never
  edited by hand). Their materials are 32 to 79. `node tools/sites.mjs out.png w0` draws a
  world's sites. Pictures: `docs/art/gen/base-nomarchy-command.png`, `mining-in-progress.png`.
- **The page's side of the loop:** `save/property.ts` (the property log and its totals), save
  version 3, `BaseScreen.svelte` (hold and vault, the market from `galaxy/market.ts`,
  supplies, parts, paint), `input/padnav.ts` (a controller in a screen). Travel and changing
  ship need a friendly pad. `node tools/play.mjs out/ <url>` plays a sortie in a browser and
  takes screenshots (laptop and phone).
- **The galaxy** (`engine/galaxy/galaxy.ts`, `galaxy(seed, version)`, the one everyone plays in
  `theGalaxy()`): 12 systems in a fixed shape (homes at either end, the core in the middle)
  joined by 18 lanes (one a black-hole shortcut), 13 suns, 14 giants, 3 black holes, 8 belts,
  14 bases, 34 gates, with orbits; names in each side's voice at home (`names.ts`). Each world
  has a recipe (`recipe.ts`): archetype, palette, land, relief, gravity, air, clouds, weather,
  sun, time of day, hazards, ores (data only). `handlingOf` turns gravity and air into speed,
  turn, climb and ceiling; `worldSettings(id)` gives the scene's settings for a world. The
  Nomarchy's capital `w0` is the island world exactly as it always was, where everyone starts.
- **Worlds** (`engine/world/`): `buildSurface(world, recipe)` calls one shaping function per
  archetype (`archetypes/`), each with three palettes (`look.ts`: colours, sky, sea of water,
  lava, acid or none, glowing materials, cliffs banded by height). Shared tools are in
  `shape.ts` (noise fields, blurs, trees, cells for sea ice and lava crust, cast shadows,
  clouds, a start). Terrain uses exact arithmetic only (`util/exact.ts`); a test scans for
  anything else. The scene's `world` setting picks a galaxy world ('' keeps the island world of
  `seed` and `land`); `sim/planet.ts` builds or takes one built elsewhere (`Scene.giveWorld`) and
  arrives (everything of the last world left behind). The HUD names a world on arrival.
- **Weather and hazards** (`sim/hazards.ts`, `render/weather.ts`): wind (gusting in storms),
  lightning that hurts, whiteouts in snow, lava and acid that burn a ship low over them
  (computer pilots keep clear), a low ash ceiling. Drawn as haze by distance in dithered steps
  that hides far ships too, rain, snow, dust, ash with embers, bolts, and a glare when burned.
  Clear worlds draw exactly as before. A red dwarf's or blue giant's light tints its worlds.
- **The page and worlds:** where the pilot is, a world or a system's space, is saved
  (`settings.world`); `?world=w12` or `?world=s3` picks one. Changing the setting still makes the
  scene go there (built in a worker, `lib/worlds/build.ts`), but play reaches other worlds by
  space. Each world, and each system's space, is a room (`net/rooms.ts`: `galaxy1-w12`,
  `galaxy1-s3`); the session moves rooms as the scene changes zone. `/gallery` draws every world
  from above in a worker, with a map and recipe of each.
- **Phase 0 (foundations) is done** (the zone interface came with Phase 6; entities are still
  the lists each system keeps). The page steps the scene in fixed 1/60 s steps
  (`display/loop.ts`). Other ships go in through `Scene.addShip`, `updateShip`, `removeShip`
  (`sim/ships.ts`); a ship given a `side` can be fought, and one given a `pilot` (a wave
  number) is flown by the computer. `Scene.player` says where the player is, `Scene.status`
  how he stands, and `Scene.takeSounds()` what was heard.
- **Fighting** (`sim/combat.ts`, `guns.ts`, `missiles.ts`, `pilots.ts`, `skirmish.ts`,
  `effects.ts`, run in that order by `sim/fight.ts`): every jet that can fight carries a
  `Fighter` (hull, shield, heat, missiles, and a `Brain` for computer pilots). The numbers
  are data in `src/lib/engine/data/` (hulls, weapons, waves): change them there, never in
  `sim/`. The player's shots get a small aim-assist cone; overhead, his ship eases to the
  height of the enemy in its sights. A roll begun as a missile closes in breaks its lock.
  Shot down, the player's pilot ejects; in the loop he comes down on foot, elsewhere (the old
  sequence) a new ship with five seconds of protection picks him up. Text is drawn on whole pixels
  (`font.ts drawText` rounds): before Phase 7 a line of odd width centred by halves never showed. Wingmen leave formation to fight (`flyingFree`) and are
  replaced 14 s after being lost.
- **Drawing the fight:** `render/combat.ts` (tracers, missiles, sparks, hit stars,
  explosions as jagged banded fireballs, flames on burning hulls, shield flashes),
  `render/hud.ts` and its pixel font `render/font.ts` (drawn last, on every view; `hudTop`
  keeps it to the top for touch and the cockpit). The look follows `art/mockups/hud.png`,
  `dogfight*.png` and `explosion.png`.
- **Sound:** `src/lib/audio/sound.ts` plays files (`cues.ts` says which, for every event and
  steady sound) through the page's mixer (`mixer.ts`), made on the first click or key; a volume
  button and `?volume=`. `node tools/sound-check.mjs` checks it all in a browser.
- **Controls:** every device gives one set of named actions (`src/lib/input/actions.ts`),
  bound as the plan's controls table. Held: `Scene.setControls` (steer, boost, fire,
  secondary, land); pressed once: `Scene.act` (roll, use, view) or the page (map, inventory,
  chat, menu, next ship). Fire is the guns, secondary a missile (fired as it goes down, if
  locked). Inventory opens the base's screen, map the maps, chat the chat. Touch has Fire,
  Boost, Roll, Action (held), Missile (with missiles aboard), Cruise in space, and overhead in flight Climb and Dive; the
  rest under More (above);
  a swipe rolls. On foot
  the same actions walk (turn and climb), run (boost), fire the sidearm, dive (roll), use, fire a
  flare (secondary) and plant a beacon (view: the page opens the wheel of its words); touch shows Fire, Dive, Action, Flare, Beacon, Chat and a
  finger is a stick (`input/pointer.ts`); a quick tap of Action is a press of Use.
- **Ships:** ten hulls (`src/lib/engine/jet/models/`), 34 to 48 px long and 7 to 15 slices tall
  (carved by `tools/voxel/build_hulls.sh`), chosen with the `hull` setting (on the page, the ship he
  flies of those he owns). Their colours are sorted into hull, markings, glass and engine glow;
  every one is repainted (and the trim, trails, patterns, emblems: see Phase 8). Enemies are
  painted dark red and gold. Prices: `HULL_PRICES` in `data/hulls.ts`.
- **Height:** the ceiling is 1500 px (`ceiling` setting, at most `CEILING_MOST`), raised from
  300 after James's first play. Overhead, above 300 px the world draws smaller and hazier
  (`liftScale` in `render/view.ts`, used by `project`, `drawJet`, `drawWorld` and the sky);
  below 300 nothing changed. The pointer behind the ship or in the cockpit sets a climb rate,
  as the keys do.
- **Speed:** `node tools/measure.mjs` times a frame (1 ship, 16, and a dogfight; and in space at
  ten kinds of place, in every view, and the way down). The surface fits 60 frames a second on a laptop
  with room to spare at 456×256; space is 0.2 to 6.4 ms overhead, 0.8 to 4.7 from behind, 2.2 to 11.3 from
  the seat, and the way down 7.4, 8.9 and 15.1 (the dearest frame in the game); the numbers are in the
  plan's section 20. The world is now the main cost; the cockpit no longer draws the world under its
  panel (`CockpitArt.clear`). Building
  a world takes 120 to 450 ms in Node (`node tools/measure-worlds.mjs`), so travel builds it
  in a worker. `node tools/look.mjs out.png world=w12` flies a scene and writes a sheet.
- **Tests:** 78 scripted flights pinned frame by frame (the newest, of polish step 9: shot down over the sea gliding to the
  shore, a parked ship called to its pilot; before them, of items 1, 3 and 7: the cockpits of four hulls over a
  world and in space, a furnished light fighter and a furnished freighter walked to the seat; before them the HUD at twice
  the size, hit and draining) (five of the polish pass, `locals/flights.spec.ts`: a
  quiet flight through a home system, an ambush at a gate, a derelict cleared and staying clear, a patrol
  defending its world, a loaded ship chased and escaping; the flights before them are flown with
  `locals: false`, the scripted flights' default, and keep their pictures; two of Phase 9, `tutorial/flights.spec.ts`:
  training drones with the guide, the mouse steering while diving and climbing; twelve of Phase 8, `ships/flights.spec.ts`: flak
  fitted and fired, a laser and a cannon, missile racks, mines on a chaser, a ship repainted, every
  hull fitted, the hangar and deck walked, a fighter's and a hauler's rooms, furniture placed, a
  squad's slipstream, gear on an ice world); `data/loadout.spec.ts` tries every fit of every hull; earlier: (five of the persistent world,
  `traces/flights.spec.ts`: a flag planted and the world changing hands, a beacon read and a wreck
  salvaged, a hotspot mined, a world named, a ghost recorded and shot; sixteen in space, `space/flights.spec.ts`:
  up out of a world overhead, from behind and from the seat, down to a world in each view and to a barren
  moon, cruising and descending, cruising past a giant, a gate, a black hole run, docking and banking
  overhead and from behind, a dogfight in a belt and one from the seat, skimming a giant), five of them fights that also check
  their outcome ('a shared sky' drives the engine's network API as a session would), seven over
  other worlds (a canyon, lava, snow and a whiteout, a storm at sea, a moon's climb, a mesa in
  dust, arriving at a jungle), four of the loop (landing and take-off, mining, banking, a loaded
  ship lost and its crate taken) and six on foot (out and back in, shot down and calling a
  ship, down in the sea, a vein, a stolen ship, strafed). Flights resize the frame as the page
  would when `Scene.zoom` changes. The galaxy is pinned whole (`testing/pinned/galaxy.txt`) and
  every world's terrain by fingerprint (`world/worlds.spec.ts`, `pinned/worlds.txt`).
  `node tools/film.mjs "<flight>" out.png` writes a sheet of a flight's frames to look at.
  `src/lib/net/session.spec.ts` flies two and three real scenes against each other over a bus
  in memory with delay, jitter and loss, on a simulated clock (with the loop: landing, mining,
  a crate spilled and taken by a rival; on foot, on world w9 where both sides start together:
  walking, shooting and dying, beacons and flares, coming down, a parked ship stolen; the persistent
  world in a room). `galaxy/territory.spec.ts` shuffles a week of events; `net/chronicle.spec.ts` and
  `net/persistent.spec.ts` run it over relays in memory, with players never online together.
- **The network** (`src/lib/net/`, outside the engine): a transport interface (`link.ts`)
  with two transports, `local.ts` (tabs of one browser, or a bus in memory; delay, jitter,
  loss and failing pairs on demand) and `trystero.ts` (Trystero 0.27 over public Nostr
  relays, with an unordered, never-resent channel opened beside Trystero's own for the fast
  lane). `session.ts` keeps a room in sync: own ship 15 times a second, others drawn 100 ms in
  the past, events reliably; the lowest ready key flies the raiders and hands them over. The
  engine's side is `sim/room.ts`: a `remote` ship's hits are reported (`takeReports`), not
  done; what other games decide comes in through `Scene.hit`, `shootDown`, `launchMissile`,
  `endMissile`, `setRoom`, `addFeed`. Shots are decided by the shooter's game, missiles by
  the target's, losses by the owner's. `online.ts` is the page's side; the plan's section 18
  ("Built in Phase 2") has the details, the research notes what was checked about Trystero.
  Since Phase 5 a pilot's state (56 bytes, protocol 3) also says where he is out of his ship;
  others get a walker for him (`Scene.addWalker`) and his parked ship; his game decides his
  death ('died'); stealing asks the owner's game ('steal', 'stolen'). Section 18 has it all.
- **Identity and save** (`src/lib/save/`): a Nostr key pair made on first run; the save is
  versioned (8: his ships' rooms' fit-out; 7 the first session's; 6 his ships; 5 his standing; 4 his look) with migrations (from 1 to 7), one slot per pilot (`?pilot=2` for a second),
  one tab per pilot (Web Locks), exported and imported as a file from the menu.
- **The page:** `Game.svelte` (save, lock, first screen or the sky, going online),
  `Onboarding.svelte` (title, callsign, side, pilot; built to `art/mockups/title.png`,
  `faction.png` and `creator.png`), `PilotCreator.svelte` (also from the menu's Your pilot),
  `Portrait.svelte` and `PilotSprite.svelte` (from `pilotArt.ts`), `MenuPanel.svelte` (connection
  screen with portraits, pilot file), `NetBadge.svelte`. The screen steps its art pixel size to
  `Scene.zoom` (`display/screen.ts setZoom`). `node tools/walk.mjs out/ <url>` plays being on foot
  in a browser (laptop and phone). All
  the page's text is in the pixel font built from the HUD's glyphs
  (`uv run tools/font/build_font.py` after changing `render/font.ts`); use the `ui-*` classes of
  `layout.css` (nothing under 21 px). In development `window.__xenophon` holds the scene and the network's
  state, for driving the game from a test browser: `tools/two-browsers.mjs` connects two
  browsers through the real relays and has one shoot the other down.
- **Art tools:** `tools/gen/` (draw with ComfyUI), `tools/voxel/` (pictures to voxels and
  into the game; `races.py` for the races). `src/lib/art/` holds the hull shape plans (`hulls.ts`, drawn with
  `canvas.ts`) that `tools/art-sheet.ts` turns into the model's guide pictures.
- **Not started:** creatures' own voices (made with Stable Audio; they borrow the game's sounds now), creatures shared in
  a room (each game moves its own copy; only kills are told), creatures noticing other players on foot or a pilot's
  parked ship, a tip about hunting for a new pilot, a use for hide, chitin and glands beyond selling them. The rest of
  the plan's Phase 9 (polish) and of `docs/polish-pass.md` (the supervisor's list, but
  for its interiors, item icons, fitted parts in the hangar and paint patterns). Enemies that belong to places leave out: a band beaten remembered
  beyond the room (a later, lone pilot may find it back), a practice mode for the old skirmish in the
  menu, stations' own turrets, raiders attacking haulers.
  Phase 9 part one leaves out: a returning pilot going straight to his hangar; a key phrase in words
  (it is the nsec string); a first sortie for a pilot who skipped it to take later; music listened to by
  a person (only measured). Phase 8 leaves
  out: more than ten hulls; computer wingmen shared with the squad's other players; a check of fits
  against the property log by other games; a ship's own name; selling a hull back. Phase 7 leaves out: traces in
  space, a ghost race with a result, chat across copies of a zone, asking relays in pages, any check
  of property against the events. Phase 6 leaves out: altitude and the
  chase and cockpit views in space, station interiors, a jump or a dock seen by other players
  (they only see the pilot leave or arrive), stations' turrets (docked ships are sheltered
  instead), raiders that avoid rocks, gravity on the computer's ships. Phase 5 leaves out: the backpack shown on the
  base's screen (it empties into the hold on boarding), gear tiers and suit linings, raiders
  landing troops. Phase 2 leaves
  out: shared wingmen (only their own player sees them), a TURN relay fallback. Phase 4 leaves out: buying hulls, telling
  a late joiner what was mined before he came, deciding between two who take a crate at once. Phase 3 leaves out: the world fingerprints run in Node only, not yet in
  Firefox and Safari; the first world of a session is built on the main thread at load.
