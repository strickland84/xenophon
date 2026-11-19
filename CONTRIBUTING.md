# Contributing to Xenophon: Twin Stars

Thank you for wanting to make the game better. Bug reports, ideas, fixes, new features and tuning are all welcome.

## The principles

Every change is judged against these (they are in the README too):

1. **No server, ever.** Static files, peer to peer, the shared galaxy on public Nostr relays. A change that needs a
   server of ours will not be merged.
2. **Fun first.** A feature is done when it is fun to play, not when it works.
3. **Beautiful pixel art.** One pixel size on screen, no scaled sprites, no programmer art.
4. **Fair.** Nothing is sold; nothing cosmetic adds power.
5. **For everyone.** Alone and offline, on a phone held sideways, with keys, a controller or touch.

## Where help is most wanted

- **Art:** ships, places, creatures, the interface and effects.
- **Music and sound:** the score, effects, the mix, creatures' voices.
- **Gameplay:** the feel of flight and fighting, the mining loop, balance, new things to do.
- **A bigger galaxy:** new worlds, star systems, stations, settlements worth visiting, creatures and events.

Issues labelled `good first issue` are a good place to start.

## Talk first about anything big

For a fix or a small change, open a pull request. For a new feature, a new system or a change to how the game plays,
open an issue first and say what you have in mind: the design is written down in
[docs/implementation-plan.md](docs/implementation-plan.md), and its section 25 lists the decisions that are settled.
It saves you building something that cannot be merged.

## Getting it running

You need Node 24 (see `.nvmrc`).

```sh
npm ci
npm run dev      # the game at http://localhost:5173
npm test         # the tests (about 40 seconds; the first run builds the worlds)
```

The game runs in one browser tab with no server: multiplayer goes peer to peer over public Nostr relays. Everything
works alone, offline, too. `?net=off` in the address keeps a tab off the network.

## How the code is laid out

- `src/lib/engine/` is the game itself. It has no DOM and no Svelte and runs in Node: it is stepped with a time, told
  what the player is doing in plain numbers, and gives back a picture as bytes.
  - `sim/` only changes state; `render/` only reads it. A new system is a slice of state in `state.ts`, a `sim/`
    module that steps it and a `render/` module that draws it.
  - The numbers (hulls, weapons, prices) are data in `data/`: change them there, not in `sim/`.
- `src/lib/components/` is the page around it (Svelte 5), `src/lib/net/` the network, `src/lib/save/` the pilot's save.
- `tools/` are scripts for art, sound, checks and pictures; `docs/` the design and its history.

## The rules the code keeps

- **The simulation is deterministic.** Seeded randomness only (`mulberry32`, `hash8`); no `Math.random`, no clocks.
  Multiplayer and the tests depend on it.
- **Everything is drawn into one low-resolution pixel buffer.** Never scale a sprite; all pixels on screen stay the
  same size.
- **Phones are first class.** Every control has a touch version, and every screen works on a phone held sideways.
- **It works alone.** With no other players and no network, everything still runs.
- **Style:** Prettier and ESLint as configured (no semicolons, single quotes, 140 columns). Comments say what a thing
  is for, in plain words, as the existing ones do. British spelling.

## The pinned frames

The tests fly scripted flights (`src/lib/engine/testing/scenarios.ts`) and compare every frame's fingerprint with the
one recorded in `src/lib/engine/testing/frames/`. So:

- A change that is **not** meant to change the picture must leave every flight passing untouched.
- A change that **is** meant to change it: re-record with `npm run test:record`, look at the frames you changed
  (`node tools/film.mjs "<flight name>" out.png` draws a sheet of a flight), and list the flights in your pull request.
- A new feature gets a scripted flight of its own.

## Before you open a pull request

1. `npm run lint`, `npm run check` and `npm test` pass (CI runs the same on every pull request).
2. You have looked at what you changed, in the game or in rendered frames, on a laptop and a phone-sized window.
3. One change per pull request, with a title that says what a player would notice.

The maintainer reviews every pull request (`.github/CODEOWNERS`). Small, focused pull requests are merged soonest.

## Art, sound and the story

- The art is drawn by a local image model and turned into game assets by code (`tools/gen/`, `tools/voxel/`; the
  plan's section 7 and [docs/pixel-art-techniques.md](docs/pixel-art-techniques.md)). The generated files under
  `src/` (for example `jet/models/`, `space/art.ts`) are written by tools and never edited by hand. If you do not have
  the models, open an issue with what you would like changed: a mockup or a reference picture is a great start.
- The music and the narrator are made with ElevenLabs on the maintainer's plan, so only the maintainer can make new
  takes. If you change a line the narrator reads (`src/lib/story/`), the narration test fails until it is read again:
  say so in the pull request.
- Story and flavour text follows the voice in [.claude/skills/story-voice/SKILL.md](.claude/skills/story-voice/SKILL.md);
  the lore is [docs/factions-and-races.md](docs/factions-and-races.md).

## Licence

By contributing you agree that your code is released under the GPL-3.0 ([LICENSE](LICENSE)). The game's art, music,
sounds and voice are not under the GPL: see [ASSETS.md](ASSETS.md). Contributions to them are welcome and are kept on
the same terms.

## Conduct

Be kind and constructive. See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
