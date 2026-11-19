// The skirmish: waves of enemy ships, each a little larger and better flown than the last,
// and how a score is kept; and how well the computer's pilots fly at each level of skill. The
// skirmish is the old dogfight, kept for flying alone over the island world of the settings (a
// pilot with no side): in the galaxy, enemies belong to places (data/bands.ts). Starting values,
// to be tuned by playing.

/** how well the computer's pilots fly in a wave: everything a pilot's skill decides */
export interface Skill {
  /** how far off the true aim point it lets its guns wander (radians) */
  aim: number
  /** 0..1: how much of a target's movement it allows for when it leads a shot */
  lead: number
  /** 0..1: how much of its hull's turn rate it dares to use */
  turn: number
  /** seconds it takes to notice something and act on it */
  react: number
  /** 0..1: the chance it turns hard away when it is under fire or has an enemy on its tail */
  evade: number
  /** seconds it flies on after turning away so, before it may do it again: long, and it can be followed and shot */
  steady: number
  /** 0..1: the chance that, finding an enemy on its tail and not turning away, it runs for it instead of turning back to fight (it makes up its mind once, and holds to it a while); for how many seconds; and how wide it opens its thrusters to (0..1: a poor pilot does not think to, and is caught) */
  flee: number
  fleeFor: number
  run: number
  /** seconds longer it runs out straight after a pass before it comes round again */
  wide: number
  /** 0..1: the chance it rolls at the right moment to break a missile's lock */
  dodge: number
  /** seconds an attack run lasts before it breaks away to come round again */
  press: number
  /** seconds a burst of fire lasts, and the pause between bursts */
  burst: number
  pause: number
  /** damage its guns do, as a share of what the player's do */
  damage: number
  /** true when it carries its hull's missiles and uses them */
  missiles: boolean
}

export interface Wave {
  /** the hulls it sends, one ship each */
  ships: string[]
  skill: Skill
  /** how many of its ships may go for the player at once (the rest go for the wingmen, or wait their turn) */
  attackers: number
}

/** the first waves, by hand; after the last, each wave is the last one with another ship and sharper pilots */
const FIRST: { ships: string[]; attackers: number; level: number }[] = [
  { ships: ['dart', 'dart'], attackers: 1, level: 0 },
  { ships: ['dart', 'sparrow', 'dart'], attackers: 2, level: 0.12 },
  { ships: ['lance', 'dart', 'sparrow', 'dart'], attackers: 2, level: 0.25 },
  { ships: ['corsair', 'lance', 'wraith', 'dart'], attackers: 2, level: 0.38 },
  { ships: ['bastion', 'dart', 'dart', 'lance', 'sparrow'], attackers: 3, level: 0.5 },
  { ships: ['wraith', 'wraith', 'corsair', 'lance', 'nomad'], attackers: 3, level: 0.62 },
  { ships: ['bastion', 'corsair', 'corsair', 'lance', 'lance', 'dart'], attackers: 3, level: 0.75 },
  { ships: ['bastion', 'bastion', 'wraith', 'lance', 'lance', 'corsair'], attackers: 4, level: 0.88 },
]
/** the hulls added to later waves, in turn */
const LATER = ['lance', 'corsair', 'wraith', 'bastion', 'dart', 'nomad']
/** the most ships in a wave */
const MOST = 9

const mix = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t))

/**
 * Pilots at a level: 0 the first wave's, 1 as good as they get (a band's pilots fly at their band's: data/bands.ts).
 *
 * A poor pilot can be chased down. (James, 2026-11-19: "they turn back at you too often making it really hard to track
 * them … we just constantly fly in loops … at least the easier enemies. Maybe there can be some harder ones".) Every
 * pilot turned hard away almost as soon as an enemy was behind him, again and again, and between times turned back at
 * him, as hard as his hull could nearly: a chase was a circle. Now a poor one turns less hard (`turn`), breaks seldom
 * and then flies on a good while (`evade`, `steady`), and with an enemy on his tail mostly runs for it, straight and not
 * fast (`flee`, `fleeFor`, `run`), and runs out wide after a pass (`wide`). The best fly as all of them did.
 */
export function skillAt(level: number): Skill {
  return {
    aim: mix(0.13, 0.03, level),
    lead: mix(0.4, 0.92, level),
    turn: mix(0.5, 1, level),
    react: mix(0.55, 0.18, level),
    evade: mix(0.1, 0.8, level),
    steady: mix(7, 1, level),
    flee: mix(0.85, 0, level),
    fleeFor: mix(4.5, 1.5, level),
    run: mix(0.1, 1, level),
    wide: mix(1.8, 0, level),
    dodge: mix(0.08, 0.6, level),
    press: mix(3, 7, level),
    burst: mix(0.45, 0.95, level),
    pause: mix(0.9, 0.35, level),
    damage: mix(0.5, 1, level),
    missiles: level >= 0.25,
  }
}

/** wave `n` (from 1) */
export function waveOf(n: number): Wave {
  const at = Math.max(1, Math.floor(n)) - 1
  if (at < FIRST.length) {
    const w = FIRST[at]
    return { ships: w.ships, attackers: w.attackers, skill: skillAt(w.level) }
  }
  const past = at - FIRST.length + 1
  const last = FIRST[FIRST.length - 1]
  const ships = [...last.ships]
  for (let i = 0; i < past && ships.length < MOST; i++) ships.push(LATER[i % LATER.length])
  return { ships, attackers: 4, skill: skillAt(last.level + past * 0.04) }
}

/** how well the player's wingmen fly: steady, and a help rather than a match for a wave on their own */
export const WINGMAN_SKILL: Skill = { ...skillAt(0.55), damage: 0.75, missiles: false }

export const SCORE = {
  /** a wave cleared is worth this many points times its number */
  wave: 250,
  /** kills this close together (seconds) build a chain: each kill in it scores one times more, up to the most */
  chain: 6,
  chainMost: 4,
  /** ships a skirmish starts with: losing the last one ends it */
  ships: 3,
  /** share of its hull the player's ship gets back when a wave is cleared */
  repair: 0.35,
}

/**
 * A training drone (sim/ships.ts `drill`): the circle it flies round its spot (px), how hard it
 * pushes (−0.5: half its cruise), how much it takes to down, the hull it is, and its paint: target-drone white and
 * safety orange, never to be taken for a raider's dark red.
 */
export const DRILL = {
  circle: 120,
  pace: -0.5,
  /** what it takes to down one: a few hits, no shield */
  toughness: 28,
  hull: 'dart',
  paint: { body: '#e6e2d4', accent: '#ff7a1a', canopy: '#26303a' },
}

export const PACE = {
  /** seconds between a wave being cleared (or a skirmish starting) and the next arriving */
  rest: 3.5,
  /** how far from the player a wave arrives, px */
  arrive: 560,
  /** seconds the score stays up after the last ship is lost, before a new skirmish begins */
  over: 6,
}
