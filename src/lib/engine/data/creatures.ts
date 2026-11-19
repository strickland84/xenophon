// The wildlife of the worlds (the plan's section 6, "Creatures"): what lives on each kind of world,
// how each kind behaves, how tough it is and what it drops. Distances are world px, times seconds,
// damage in a pilot's hit points (he has 30; a sidearm's bolt takes 9 from whatever it strikes).
// Starting values, tuned by scripted hunts; to be tuned by playing.

import type { Archetype } from '../galaxy/recipe'
import type { ResourceId } from './resources'

/**
 * How a kind behaves towards a pilot on foot:
 *   flee   grazers and critters: notice him, and run (a herd runs together)
 *   hunt   stalks closer, then charges and bites, backs off, and comes again
 *   spit   keeps its distance and spits slow globs he can step out of the way of
 *   guard  minds its own patch: comes at him only while he is on it
 *   lurk   rooted: snaps at whatever comes within reach
 *   brute  the rare one: grazes, slow to anger; shot or crowded, it charges like a hunter, and hard
 */
export type CreatureWay = 'flee' | 'hunt' | 'spit' | 'guard' | 'lurk' | 'brute'

/** something a creature drops: what, how likely (0..1), how many (from, to) */
export interface Drop {
  id: ResourceId | 'credits'
  chance: number
  n: [number, number]
}

export interface CreatureKind {
  id: string
  /** as a player reads it */
  name: string
  way: CreatureWay
  health: number
  /** px a second: wandering, and running (fleeing or charging) */
  walk: number
  run: number
  /** px: it notices a pilot this near (further when he runs or fires) */
  notice: number
  /** a bite (or a snap, a pinch, a goring): its hit points, px it reaches, seconds of the wind-up before it lands, seconds before the next */
  bite: number
  reach: number
  windup: number
  rest: number
  /** px a bite throws him back */
  shove: number
  /** px: a shot this near its middle strikes it; how high its middle is over its feet */
  radius: number
  middle: number
  /** how hard it is to knock back (1 a pilot's weight) */
  mass: number
  /** how many go about together (from, to) */
  herd: [number, number]
  /** it can go into deep water (not lava or acid) */
  swims: boolean
  drops: Drop[]
  /** the colour of what it bleeds (r, g, b): never red, never much of it */
  ichor: [number, number, number]
}

const kind = (k: CreatureKind) => k

export const CREATURES: CreatureKind[] = [
  kind({
    id: 'skitter',
    name: 'Skitter',
    way: 'flee',
    health: 6,
    walk: 22,
    run: 58,
    notice: 46,
    bite: 0,
    reach: 0,
    windup: 0,
    rest: 0,
    shove: 0,
    radius: 2.6,
    middle: 1.5,
    mass: 0.3,
    herd: [1, 3],
    swims: false,
    drops: [
      { id: 'chitin', chance: 0.4, n: [1, 1] },
      { id: 'credits', chance: 0.25, n: [4, 9] },
    ],
    ichor: [214, 170, 64],
  }),
  kind({
    id: 'woolhorn',
    name: 'Woolhorn',
    way: 'flee',
    health: 34,
    walk: 9,
    run: 42,
    notice: 70,
    bite: 0,
    reach: 0,
    windup: 0,
    rest: 0,
    shove: 0,
    radius: 4.6,
    middle: 3.5,
    mass: 2.2,
    herd: [3, 5],
    swims: false,
    drops: [
      { id: 'hide', chance: 1, n: [2, 3] },
      { id: 'heartstone', chance: 0.03, n: [1, 1] },
    ],
    ichor: [176, 120, 72],
  }),
  kind({
    id: 'razorjaw',
    name: 'Razorjaw',
    way: 'hunt',
    health: 36,
    walk: 16,
    run: 66,
    notice: 120,
    bite: 6,
    reach: 7,
    windup: 0.22,
    rest: 0.9,
    shove: 6,
    radius: 4.2,
    middle: 3,
    mass: 1.6,
    herd: [1, 2],
    swims: false,
    drops: [
      { id: 'hide', chance: 0.8, n: [1, 2] },
      { id: 'gland', chance: 0.3, n: [1, 1] },
      { id: 'heartstone', chance: 0.05, n: [1, 1] },
      { id: 'credits', chance: 0.4, n: [14, 28] },
    ],
    ichor: [120, 200, 220],
  }),
  kind({
    id: 'spitter',
    name: 'Spitter',
    way: 'spit',
    health: 28,
    walk: 13,
    run: 26,
    notice: 115,
    bite: 5,
    reach: 0,
    windup: 0.45,
    rest: 2.4,
    shove: 3,
    radius: 3.8,
    middle: 2.6,
    mass: 1.2,
    herd: [1, 2],
    swims: false,
    drops: [
      { id: 'gland', chance: 0.9, n: [1, 2] },
      { id: 'chitin', chance: 0.3, n: [1, 1] },
      { id: 'credits', chance: 0.35, n: [10, 22] },
    ],
    ichor: [150, 230, 70],
  }),
  kind({
    id: 'crawler',
    name: 'Crawler',
    way: 'hunt',
    health: 72,
    walk: 13,
    run: 30,
    notice: 95,
    bite: 9,
    reach: 7,
    windup: 0.3,
    rest: 1.2,
    shove: 4,
    radius: 4.4,
    middle: 2.2,
    mass: 3,
    herd: [1, 3],
    swims: false,
    drops: [
      { id: 'chitin', chance: 1, n: [2, 3] },
      { id: 'silica', chance: 0.3, n: [1, 2] },
      { id: 'gland', chance: 0.2, n: [1, 1] },
      { id: 'heartstone', chance: 0.04, n: [1, 1] },
    ],
    ichor: [236, 150, 60],
  }),
  kind({
    id: 'reefclaw',
    name: 'Reefclaw',
    way: 'guard',
    health: 38,
    walk: 14,
    run: 44,
    notice: 44,
    bite: 8,
    reach: 7,
    windup: 0.26,
    rest: 1,
    shove: 5,
    radius: 4.4,
    middle: 2.4,
    mass: 1.8,
    herd: [1, 3],
    swims: true,
    drops: [
      { id: 'chitin', chance: 1, n: [1, 2] },
      { id: 'salvage', chance: 0.15, n: [1, 1] },
      { id: 'credits', chance: 0.3, n: [8, 18] },
    ],
    ichor: [110, 170, 255],
  }),
  kind({
    id: 'snapweed',
    name: 'Snapweed',
    way: 'lurk',
    health: 30,
    walk: 0,
    run: 0,
    notice: 15,
    bite: 10,
    reach: 15,
    windup: 0.2,
    rest: 1.5,
    shove: 7,
    radius: 4.4,
    middle: 3,
    mass: 99,
    herd: [1, 3],
    swims: false,
    drops: [
      { id: 'bioresin', chance: 0.75, n: [1, 2] },
      { id: 'gland', chance: 0.5, n: [1, 1] },
    ],
    ichor: [200, 120, 230],
  }),
  kind({
    id: 'thornback',
    name: 'Thornback',
    way: 'brute',
    health: 220,
    walk: 8,
    run: 54,
    notice: 38,
    bite: 15,
    reach: 9,
    windup: 0.34,
    rest: 1.5,
    shove: 14,
    radius: 6.5,
    middle: 5,
    mass: 8,
    herd: [1, 1],
    swims: false,
    drops: [
      { id: 'heartstone', chance: 1, n: [1, 1] },
      { id: 'hide', chance: 1, n: [3, 4] },
      { id: 'chitin', chance: 1, n: [2, 3] },
      { id: 'credits', chance: 1, n: [80, 150] },
    ],
    ichor: [255, 170, 60],
  }),
]

export const creatureNamed = (id: string) => CREATURES.findIndex((k) => k.id === id)

/**
 * What lives on each kind of world: its common life (grazers, critters, plants), and its hunters. Each
 * group of a world's wildlife is drawn from these, by weight; a barren moon has none.
 */
export const FAUNA: Record<Archetype, { common: [string, number][]; hunters: [string, number][] }> = {
  archipelago: {
    common: [
      ['woolhorn', 3],
      ['skitter', 2],
      ['reefclaw', 2],
    ],
    hunters: [
      ['razorjaw', 2],
      ['reefclaw', 1],
    ],
  },
  continental: {
    common: [
      ['woolhorn', 4],
      ['skitter', 2],
    ],
    hunters: [
      ['razorjaw', 3],
      ['crawler', 1],
    ],
  },
  canyon: {
    common: [
      ['skitter', 3],
      ['woolhorn', 1],
    ],
    hunters: [
      ['spitter', 2],
      ['razorjaw', 2],
      ['crawler', 1],
    ],
  },
  ice: {
    common: [
      ['woolhorn', 3],
      ['skitter', 1],
    ],
    hunters: [
      ['crawler', 2],
      ['razorjaw', 1],
    ],
  },
  volcanic: {
    common: [['skitter', 3]],
    hunters: [
      ['crawler', 3],
      ['spitter', 2],
    ],
  },
  jungle: {
    common: [
      ['snapweed', 3],
      ['skitter', 2],
      ['woolhorn', 1],
    ],
    hunters: [
      ['spitter', 2],
      ['razorjaw', 2],
      ['reefclaw', 1],
    ],
  },
  mesa: {
    common: [
      ['woolhorn', 3],
      ['skitter', 2],
    ],
    hunters: [
      ['razorjaw', 2],
      ['spitter', 2],
    ],
  },
  ocean: {
    common: [
      ['reefclaw', 3],
      ['skitter', 1],
    ],
    hunters: [['reefclaw', 2]],
  },
  moon: { common: [], hunters: [] },
}

/** where and when (the plan's section 6, "Creatures") */
export const WILD = {
  /** px: the world is cut into cells this wide, each with its own groups */
  cell: 256,
  /** a cell's chance of a group of common life, and of hunters, by the world's wildness 0..3 (galaxy/danger.ts) */
  common: [0.7, 0.7, 0.65, 0.6],
  hunters: [0.18, 0.4, 0.55, 0.7],
  /** a cell's chance of the rare beast instead of hunters, by wildness */
  rare: [0.02, 0.04, 0.07, 0.1],
  /** px: a group's home keeps this far from any base, and its members wander this far from home */
  awayFromBases: 170,
  roam: 64,
  /** px: a hunter gives up and goes home past this far from it */
  leash: 230,
  /** px: a group is put up when the pilot on foot comes this near its home, and down when none of it is within the other */
  wake: 300,
  sleep: 420,
  /** a creature killed is back at a turn of its group's own clock, at least this many seconds later (shared, like a band's) */
  away: 300,
  turn: 120,
  /** what makes him easier to notice: running, and having fired a moment ago (shares more than its notice) */
  loud: 1.6,
  /** seconds a fleeing creature runs before it looks round again */
  fleeFor: 3.2,
}

/** a spitter's glob: px a second, seconds it can fly, px from his middle that it strikes, and px it falls a second (an arc) */
export const GLOB = { speed: 74, life: 1.8, hit: 3.6, fall: 34 }

/** a dropped thing on the ground: seconds before it is gone (it blinks for the last few), and px he must be within to take it */
export const LOOT = { life: 150, blink: 12, pick: 8 }

/** seconds a creature shows struck (white), and is staggered (its charge stops a moment) */
export const STRUCK = { flash: 0.07, stagger: 0.16, bar: 2.5 }
