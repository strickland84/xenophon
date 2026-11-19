// Where the computer's ships live (the polish pass, item 8: "the waves of enemies never stop").
// No wave comes at a pilot wherever he is: danger belongs to places, and a pilot chooses his risk.
//
//   raiders   bands that lurk at a place and wait: at the frontier's gates, in its belts, by a
//             world's rich ore (on the way home from it), holding a barren moon; at a derelict, its
//             drones. They come for a ship that comes near (a loaded one is seen from farther off),
//             chase it, and give the chase up once it leaves their ground. Beaten, a band stays
//             gone for a while, on a clock every player shares.
//   patrols   each side's computer pilots, flying between its bases over the worlds it holds and in
//             its own space, and on the front line, where both sides' patrols meet and fight; they
//             fight raiders and the other side's pilots, and leave their own side's alone
//   traffic   haulers going about their business between stations, worlds and gates (no one's to
//             fight): a quiet system is not an empty one
//
// How wild a system is, and so how strong its raiders are, comes from the galaxy's shape and who
// holds what (galaxy/danger.ts): none in the two home systems, a little on the frontier next to a
// side's space, more deeper out, the most at the core. Distances are px, times seconds. Starting
// values, to be tuned by playing.

import type { ShipColours } from '../render/paint'

/** a system's danger to a pilot, in words: 0 his own side's home, 3 the core or the other side's home */
export const DANGER_NAMES = ['Safe', 'Low', 'Medium', 'High'] as const

/**
 * What a raider band of a system's wildness (1 the frontier by a side's space, 2 deeper out, 3 the
 * core) flies, how well, and how many of it go for one pilot at once (the rest wait their turn,
 * circling him, as a wave's did).
 */
export const RAIDERS: Record<number, { ships: string[]; level: number; attackers: number }> = {
  1: { ships: ['dart', 'sparrow', 'dart'], level: 0.3, attackers: 2 },
  2: { ships: ['lance', 'dart', 'corsair'], level: 0.28, attackers: 1 },
  3: { ships: ['bastion', 'wraith', 'lance', 'corsair'], level: 0.6, attackers: 2 },
}
// (tuned in the polish pass with tools/first-hour.ts, a pilot who mines and never fights, half an hour on each: the low
// frontier lost him nothing, its patrol beating two ships before they reached him, so three now, flown a little better;
// the medium lost him half his loads, two at once on a Corsair, so one at a time and a little worse)

/** a derelict's drones: how many, the hull, how well they fly by the system's wildness, and how many go for one pilot at once */
export const DRONES = { count: 3, hull: 'sparrow', level: [0, 0.25, 0.45, 0.65], attackers: 1 }

/** a side's patrol: its ships, how well they fly, how hard they push along their route (a share of the thrusters), and how many go for one enemy at once */
export const PATROL = { ships: ['lance', 'corsair'], level: 0.5, pace: 0.3, attackers: 2 }

/** how bands see, chase, wake and come back, on a world's surface and in a system's space */
export const BAND = {
  surface: {
    /** a raider band lurking sees a ship this near it, and this much farther for a full hold (in proportion: they want the cargo) */
    notice: 330,
    noticeLoaded: 600,
    /** … and gives the chase up once the ship is this far from its spot, or this much farther for a full hold */
    leash: 760,
    leashLoaded: 500,
    /** a patrol sees an enemy this near it, and chases him this far from its route */
    patrolNotice: 520,
    patrolLeash: 900,
    /** px over the ground a band lurks at (low, in the ground's cover), and a patrol flies at */
    lurk: 34,
    patrolHeight: 95,
    /** how far from a rich deposit raiders wait, along the way to the nearest base (where a loaded ship will pass), keeping this far from any base (its turrets) */
    offset: 230,
    clear: 520,
    /** … and this far from the way between the bases, where the patrols fly */
    route: 400,
    /**
     * Raiders watching an outpost's way in (one outpost on the frontier by a side's space, both deeper
     * out): this far from it, turned this far (radians) off the way away from the other base; they let
     * an empty ship by unless it comes this near, and see a full hold from this much farther.
     */
    approach: 640,
    approachTurn: 0.9,
    approachNotice: 140,
    approachLoaded: 900,
    /** its ships are put up when a pilot comes this near its spot, and taken down when none is within the other */
    wake: 1000,
    sleep: 1500,
    /** px at most from its spot to ground a pilot can come down on (sea, lava and acid are death): a pilot shot down there glides to it (data/foot.ts DESCENT) */
    shore: 200,
  },
  space: {
    notice: 620,
    noticeLoaded: 500,
    leash: 1700,
    leashLoaded: 900,
    patrolNotice: 800,
    patrolLeash: 1800,
    /** raiders watching a gate wait this far from it, off to one side of the way in */
    gate: 520,
    wake: 2400,
    sleep: 3400,
  },
  /** px a band waits within (it circles its spot slowly) */
  circle: 70,
  /** raiders will not follow a ship under a base's guns (its turrets' reach), nor this near a station in space */
  station: 600,
  /** lurking, a raider shows on the radar and the HUD's arrows only this near (they wait in cover) */
  hidden: 230,
  /** seconds at least a beaten band stays gone, and the clock it comes back on: at a turn of it, every this many seconds from its own start */
  away: 600,
  turn: 300,
  /** seconds before the news says again that a band is coming (one that lets him go and comes back is the same fight) */
  toldAgain: 90,
}

/**
 * What a raider downed pays, as a share of what one paid before there were bands (data/loop.ts
 * REWARD.raider), by its system's wildness; its salvage grows the same way. The danger is where the
 * money is: a home system pays least of all (its market, galaxy/market.ts HOME_PAY).
 */
export const BAND_PAY = [1, 1, 1.5, 2.2]

/**
 * Credits a raider band (or a derelict's drones) pays the pilot who helped beat it, by its system's wildness, on top of
 * each kill: his side's bounty on it (polish step 9: so a pilot who only fights has a living and a reason to finish a fight)
 */
export const BAND_BOUNTY = [0, 120, 220, 360]

/**
 * Traffic: haulers between a system's stations, worlds and gates, and over a world between its
 * bases; how many by the system's kind (a home system busiest), the hulls they fly, how long each
 * leg takes (part of it docked out of sight), and how high they fly over a world.
 */
export const TRAFFIC = {
  space: { home: 4, frontier: 2, core: 1 },
  surface: { home: 2, frontier: 1, core: 1 },
  hulls: ['mule', 'galleon', 'prospector', 'nomad'],
  /** seconds a leg takes in space and over a world, and the share of it spent docked (unseen) at its end */
  spaceLeg: 150,
  surfaceLeg: 70,
  dock: 0.25,
  /** px over the highest ground on its way a hauler flies, and how far beyond a base it comes down from and climbs away to */
  height: 70,
  reach: 900,
}

/** paint: a side's patrols and haulers (its colours), and the haulers of nobody */
export const BAND_PAINT: Record<'nomarchy' | 'anarchoi' | 'neutral' | 'nomarchyHauler' | 'anarchoiHauler', Partial<ShipColours>> = {
  nomarchy: { body: '#2c3a5a', accent: '#f2c14e', canopy: '#7ad0ff' },
  anarchoi: { body: '#3c2c4e', accent: '#a46cf0', canopy: '#ff9a5a' },
  neutral: { body: '#a8a49a', accent: '#56687a', canopy: '#3a4a5a' },
  nomarchyHauler: { body: '#b8b2a0', accent: '#f2c14e', canopy: '#3a4a5a' },
  anarchoiHauler: { body: '#a49cae', accent: '#a46cf0', canopy: '#3a4a5a' },
}

/** the sides' colours, for their marks over a patrol */
export const SIDE_COLOURS = { nomarchy: '#f2c14e', anarchoi: '#a46cf0' }
