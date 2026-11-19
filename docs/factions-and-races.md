# Factions and races

The lore of **Xenophon: Twin Stars**. Rewritten on 19 November 2026, when the game was renamed (it was Borrowed
Stars) and its sides with it (they were the Charter and the Drift; Lemuel Gant, the surveyor who sold the worlds, is
gone). Story text is written in the story's voice: `.claude/skills/story-voice`.

Part of the [implementation plan](./implementation-plan.md), section 12.

## The sides

- **The Nomarchy** (from the Greek _nomos_, law). A pilot of it is "of the Nomarchy"; its governors are Nomarchs.
  Gold on ivory, the triangle, its capital the Meridian Ring at the gold sun. In code: `nomarchy`.
- **The Anarchoi** ("without rulers"). One of them is an Anarchos. Violet on rust, the diamond, the Raft at the red
  dwarf. In code: `anarchoi`.

## How it began

The forty worlds between the gold sun and the red were shared out by lot. The founding houses put every name they had
into a bronze urn and drew one for each world. The Nomarchy began as the law that kept what was drawn: a register of
lots on the Meridian Ring, with the urn beside it under glass.

There were more names than worlds. The ones still in the urn when the worlds ran out are the Anarchoi's
grandparents, and the Anarchoi have never agreed that a pot should say where a person may live. As they have it, a
world is nobody's, which in practice means it belongs to whoever is standing on it with a flag.

The Nomarchy has lost that argument on the ground so often that its clerks now write the flags into the register. A
world the Anarchoi take is entered as "held without lot" until somebody takes it back, and the entry is crossed out
and written again most weeks. (This is the game's rule: a world goes to the side with the most flags on its outpost
mast.)

On Lidel, in Drassel, the Nomarchy buries its pilots in numbered rows. The Anarchoi leave theirs where they fell,
with a name scratched on the wreck.

## Where it stands now

What the opening story tells (`src/lib/story/intro.ts`): the war has flared again over Drassel, in the core, for the
third time this year. Raiders who answer to neither side hunt loaded ships, because a ship shot down spills its hold
for anyone to pick up. Both sides are short of pilots. The Nomarchy has opened its hangars on the Meridian Ring to
anyone who will sign its register, and the Anarchoi hand out ships on the Raft to anyone who turns up.

## Xenophon, the narrator

A man of this world: a stranger in both camps, and the voice in every new pilot's first sortie, whichever side the
pilot signs with. (The name is the Greek one, "the stranger's voice"; the real Xenophon led ten thousand stranded
Greek mercenaries home through Persia and wrote it up as the _Anabasis_.)

Forty years ago a younger son of one of the founding houses hired four hundred pilots to take a seat on the Meridian
Ring that his brother held. He was shot down over Drassel in the first hour of the first fight. The Nomarchy's
officers asked the hired captains to a table to talk terms, and shot them there. Xenophon had come along to keep the
accounts. What was left of the pilots chose him to lead them, and he took three hundred and some of them home the
long way, across half the galaxy through Anarchoi space, where no station would dock them, until they came out of
the last gate and saw the gold sun.

He is old now. The docks of both sides pay him to talk new pilots out of their berths, and he does it the same way
for each. His voice is ElevenLabs voice `YjbHBTWH8WkGAhNrkp0i`, read by `eleven_v3` with a Greek accent
(`tools/gen/voice_recipe.py NARRATOR`).

## At a glance

|                | The Nomarchy                                                | The Anarchoi                                        |
| -------------- | ----------------------------------------------------------- | --------------------------------------------------- |
| Belief         | A world is held by its lot, kept in the register            | A world is nobody's: whoever stands on it holds it  |
| Colour         | Gold on ivory                                               | Violet on rust                                      |
| Mark           | Triangle (a seal)                                           | Diamond (a patched sail)                            |
| Mood           | Proud, formal, fond of paperwork                            | Scrappy, loud, improvised                           |
| Ships          | The same hulls for both sides, in each player's own colours | The same                                            |
| Buildings      | Domes, spires, rings, clean geometry                        | Welded hulks, scaffolds, strings of lanterns        |
| Interface trim | Thin gold rules, tall formal lettering                      | Stencil lettering, hazard stripes, rivets           |
| World names    | Long and formal: Saint Verane, Caldera IV                   | Short and blunt: Rustwater, Last Kettle             |
| Capital        | Meridian Ring, a ring station at the gold sun               | The Raft, a flotilla of lashed hulks at a red dwarf |
| Home worlds    | Continental, archipelago, mesa, ice                         | Canyon, volcanic, jungle, ocean                     |

## Races

Six races, three per side. They are cosmetic: no race is stronger than another.

Each is designed around its outline first, because the in-world pilot is only a few pixels
tall. All six should be recognisable from silhouette alone, so you can tell who is running
across a beach from the air.

### The Nomarchy

| Race    | What they are                                                             | Outline                     | Portrait                                        |
| ------- | ------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------- |
| Solari  | Humans of the founding houses. Their names were the first drawn.          | Medium height, round helmet | Human faces, high collars, gold visor bands     |
| Kestrin | Small, light-boned bird people. The best natural pilots there are.        | Short, pointed crest, beak  | Feather crests, big eyes, bright throat patches |
| Orrin   | Brass clockwork people, built to keep the register, later given lots too. | Tall and thin, one antenna  | One round glowing lens, engraved plates         |

### The Anarchoi

| Race    | What they are                                                       | Outline                               | Portrait                                         |
| ------- | ------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------ |
| Skarn   | Broad shell-backed people who grow their own armour. Clan fighters. | Wide and low, shoulder plates, a claw | Plated brow, four small eyes, chipped shell      |
| Noctil  | Moth people who navigate by starlight. Mystics and scouts.          | Slim, two feathery antennae, a cloak  | Huge dark eyes, fuzzy collar, glowing wing spots |
| Thallin | Fungus people who grew out of abandoned Nomarchy wrecks. Salvagers. | Short with a broad cap                | Mushroom cap, lantern eyes, patchwork gear       |

Built in Phase 5: all six are in the game, drawn by the image model following plans of their
outlines in game pixels, as a portrait (four faces each, with skin and eyes to choose) and a
sprite a few pixels tall, from eight sides, walking. See the implementation plan, section 9 ("The
six races, as built"), and [art/gen/races.png](./art/gen/races.png).

### Bailing out

Ejecting is the game's signature moment, so each race does it their own way. All six take
the same time and fall at the same speed; only the picture differs.

| Race    | How they come down                      |
| ------- | --------------------------------------- |
| Solari  | A classic round parachute               |
| Kestrin | A wingsuit glide                        |
| Orrin   | A little unfolding rotor                |
| Skarn   | Curled into a ball, bouncing on landing |
| Noctil  | Wing-cloak spread wide                  |
| Thallin | Drifting down under their own cap       |

## Ships

Ships are not faction-styled. Both sides fly the same base hulls, and every player chooses their own colours. See
the implementation plan, section 7.

## Ranks

| Step | The Nomarchy | The Anarchoi |
| ---- | ------------ | ------------ |
| 1    | Ephebe       | Stray        |
| 2    | Lochagos     | Runner       |
| 3    | Taxiarch     | Raider       |
| 4    | Trierarch    | Skipper      |
| 5    | Navarch      | Reaver       |
| 6    | Strategos    | Stormcaller  |

The Nomarchy's are the old Greek ones: a recruit, a file's captain, a squadron's, a ship's, an admiral, a general. The
Anarchoi say they have no ranks; these are only what they call each other.

Ranks are badges and titles only. They never add power. A pilot's rank comes from the influence his events have added
to his side (0, 40, 150, 400, 1000 and 2500 points), shown as his side's badge (drawn by the image model: the
Nomarchy's chevrons and a winged crest in gold on navy, the Anarchoi's scrap-metal stripes and spiked diamonds in
violet and rust; `static/badges/`) and title on the faction board, the pilots-nearby list and his card. Flags carry
each side's banner in its colour with its mark.

The music is the same for both sides (the plan's section 17); each side's colour is not in it yet.
