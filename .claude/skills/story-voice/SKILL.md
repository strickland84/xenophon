---
name: story-voice
description: How Xenophon: Twin Stars sounds when it tells a story. Load before writing or changing any of the game's story, flavour or character text (the opening story, the sides' and races' lines, ship pitches, place descriptions, news, tips with a voice), and when the user says the writing sounds like AI.
---

# Xenophon: Twin Stars: the story's voice

James's verdict on the first opening story (2026-11-18): "so AI driven its completely obvious". This skill is
what we do about that. The global skills `humanizer` (finding the habits), `cliche-transcendence` (getting past the
first idea) and `prose-style` (sentences) do the general work; this one says what this game sounds like.

## Who is talking

Nobody neutral. The game's words are said by someone who lives out here: an old hand telling a new pilot how
things are, a clerk of the Nomarchy, somebody on the Raft. They know things the player doesn't, they have opinions,
and they are a little tired of the war. They never sell the game, and never explain it as a designer would.

Touchstones (the feel, not to imitate line by line): Conrad's sea stories told by a man who was there; Le Guin's
plain speech about strange places; Kipling's engineers; the dry entries of a ship's log; a dockside pub.

## The world's own words

Use the world's things, by their names, instead of saying what they mean.

- **The Nomarchy:** lots, the bronze urn, the register, clerks, entries crossed out and written again, seals, tolls,
  numbered graves, lamps, the founding houses, the Meridian Ring at its gold sun. Formal, sure of itself, fond of
  paperwork. Its pilots are "of the Nomarchy"; its governors Nomarchs; its ranks Greek (Ephebe … Strategos).
- **The Anarchoi:** the names left in the urn, flags, borrowing, moving on, patches, lanterns, lashed hulks, the Raft
  at its red dwarf, names scratched on whatever is left. Loud, scrappy, funny, a bit mean. They are many: "the
  Anarchoi are"; one of them is an Anarchos.
- **Xenophon,** the narrator: an old hired pilot, a stranger in both camps, who once led the survivors of a betrayed
  company of hired pilots home across half the galaxy. The docks of both sides pay him to talk new pilots out of
  their berths. He tells it straight and the same to either side.
- **The places, by their real names** (`testing/pinned/galaxy.txt`): the Nomarchy's home Fort Coria (Saint Veselade,
  Coreline Major, Loreis Regis); the Anarchoi's Blacktooth (Rustheap, Lastjaw, Wreck Gut, Low Knot); Drassel in the core
  (Lidel, Mamith); the Hulks; the stations named for their systems.
- **The lore the story rests on:** the forty worlds were shared out by lot, names drawn from a bronze urn by the
  founding houses; the Nomarchy is the law that keeps the register of lots on the Meridian Ring, the urn beside it
  under glass. There were more names than worlds: the Anarchoi descend from those left in the urn, and hold that a
  world is whoever stands on it with a flag (the game's rule: the most flags on an outpost's mast). (Kept in `docs/factions-and-races.md`.)

## Rules

1. **A thing, not a claim.** "The Nomarchy buries its dead in numbered rows" beats "the war has cost both sides".
   If a line could be said of any war, any game, cut it or make it about this one.
2. **No staged contrasts.** No "not X but Y", no "Neither is the villain", no "X is a Y with a Z on it" aphorisms,
   no lines that only sound deep.
3. **No closers.** A paragraph stops when it has said its thing. No last line that sums it up or tells the reader
   how to feel ("What you do here outlasts you."). No "Choose your side." as a drumroll.
4. **No rows of fragments.** "Hide under the trees. Steal a ship. Call for another." is a trailer, not a voice.
   Write the sentence a person would say.
5. **Count your threes.** Lists of three, triads of adjectives ("Formal, polished, orderly"), three-beat rhythm:
   only when there really are three things. Two or four is usually truer.
6. **Mechanics in the world's terms.** Not "you fly, fight, mine and land" but what that is out here: ore in the
   hold belongs to whoever shoots you. The tutorial teaches the buttons; the story never names one.
7. **Humour is allowed and wanted:** dry, from the speaker's own view, never a wink at the player.
8. **Plain words.** British spelling, contractions where a person would use them, no "tapestry", "echoes",
   "whispers", "forged", "legacy", "destiny", "the stars themselves". Dashes only where the game's other text
   uses them (it uses colons).
9. **Instructions stay instructions.** Prompts, tooltips, stat lines and the narrator's lines in the first sortie are
   clear first: what is going on, the control that does it, and why ("Your ship is docked at the station with its power
   off. Press P to power up."). A voice there is a few words of colour at most. James, 2026-11-19, of "Right, the clamps
   let go when you ask them to. Take her out": "WHAT THE FUCK EVEN IS THIS? … GIVE SOME FUCKING CONTEXT".
10. **A story opens on the moment, as a film serial's crawl does.** What is happening now, what just happened, what it
    means for a pilot, and someone at the start of it, in the third person. No lore lecture, no "you", no summing up.
    The opening story (`src/lib/story/intro.ts`) is the model: the war flared again over Drassel; ore spilt when a ship
    is shot down; a world goes by its flags; who is hiring; a new pilot in a cold ship at the dock.

## How to write a piece

1. Read what the piece must do (what the player must come away knowing) and where it shows (its length on screen).
2. **Write the AI version first, on purpose,** and list what makes it so. That list is what to avoid (Gwern's
   anti-examples).
3. **Brainstorm ten ways in** (a document, a grave, a saying, a person, an object, a rumour, a price list...).
   Throw out the first three: they are the most common, not the best. Pick one with a concrete thing at its heart.
4. Draft it in a scratch file. Then run the `humanizer` skill over it, and read it as James would, aloud.
5. Check every fact against the game (what actually happens when shot down, what a hull does): fiction may not lie
   about the rules.
6. Keep the length the screen has room for (the opening story rolls for 58 s whatever its length: about 150 words
   reads well).

## Anti-examples (the first openings, kept to learn from)

- "Neither is the villain. Each is right about the other." (staged balance; says what the reader should think)
- "A deed is a threat with a seal on it." (an aphorism doing the work a scene should)
- "You fly, fight, mine and land." (a feature list in the second person)
- "Hide under the trees. Steal a ship. Call for another." (a row of fragments)
- "What you do here outlasts you." (a closer that sums up)
- "Two sides. One sky." (a tagline's fragment pair)
- "Formal, polished, orderly." (a triad of adjectives in place of a fact)
- "You are on your own now: the galaxy is yours" (a stock line any game could say)
- "Forty worlds, two suns, and two sides fighting over every one of them." (a triad opener; a setting, not a moment)
- "The Nomarchy does X. The Anarchoi say Y." (two sides set out as a matched pair)
- "Cut it from rocks, carry it home, and land to bank it." (instructions in the story: a shop page)
- "Pick a side." (a drumroll)
