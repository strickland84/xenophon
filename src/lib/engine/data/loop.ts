// The numbers of the core loop (the plan's section 3, Phase 4): sortie, risk, bank. A hold
// set by the hull and the weight of what is in it; mining an outcrop with the laser and
// scooping up the ore; landing, and taking off; crates spilled by lost ships; the base's
// turrets; and what kills and losses pay or cost. (The raiders a loaded ship draws in wait on
// the way home now, in bands: data/bands.ts.)
// Distances are world px, times seconds. Starting values, to be tuned by playing.

/** the hold: slots by hull (the plan's section 7 gives the four roles theirs), and how much of a slot's stack a chunk of ore is */
export const HOLD: { slots: Record<string, number>; fallback: number } = {
  slots: { dart: 3, sparrow: 2, lance: 2, corsair: 4, wraith: 3, prospector: 8, mule: 12, bastion: 4, nomad: 6, galleon: 16 },
  fallback: 4,
}

/** a loaded ship: a full hold costs it this share of its top speed, its turn and its climb (in proportion to how full it is) */
export const LOAD = { speed: 0.24, turn: 0.32, climb: 0.4 }

export const MINE = {
  /** how far off (across the ground) and how high over an outcrop the laser reaches */
  reach: 150,
  above: 150,
  /** chunks a second the laser cuts, and how much faster a miner's does */
  rate: 2.6,
  /**
   * Chunks a cut frees at once (fewer when fewer are left): the laser works at the rock, a bar fills, and the cut breaks
   * free in a burst (James, after playing: "mining needs to be vastly improved ... a progress bar"). It had freed one chunk
   * at a time, a steady trickle with nothing to watch; the ore a second is as it was.
   */
  batch: 3,
  miners: { prospector: 1.6, mule: 1.15, galleon: 1.15 } as Record<string, number>,
  /**
   * Where the ship holds the laser: it cuts at the first share of its pace from the edge of its reach and the second right over
   * the outcrop, low (polish step 9: mining had been a hold of the button while circling; now flying in close and low pays)
   */
  aim: [0.8, 1.3] as [number, number],
  /** units an outcrop holds: an ordinary one, a rich deposit, a wreck */
  stock: 30,
  rich: 80,
  wreck: 16,
  /** seconds an outcrop takes to come back once its time is up: it is full again at the start of each period (each its own length, between these) */
  period: [480, 900] as [number, number],
}

/**
 * How a cut looks and feels (render/mining.ts draws it; sim/mining.ts keeps its heat and its motes): the beam's reach
 * as it comes on, the rock warming under it and cooling after, the flash of a cut breaking free, sparks and flecks
 * of rock flying off the strike, and the +3 FERRITE that rises as ore goes into the hold or the pack.
 */
export const CUT = {
  /** seconds the beam takes to reach the rock from the mount when it comes on */
  reach: 0.14,
  /** the rock's heat under the beam, 0..1: its share a second warming while cut, and cooling once the beam is off */
  warm: 1.4,
  cool: 0.7,
  /** seconds the flash of a finished cut lasts, and the bracket takes to close on a rock come in reach */
  flash: 0.32,
  lock: 0.28,
  /** sparks and flecks a second off the strike while it cuts, and how many burst out as a cut breaks free */
  sparks: 40,
  flecks: 12,
  burst: 14,
  /** px a second they fly at (out, and up) */
  fly: [24, 70] as [number, number],
  up: [20, 64] as [number, number],
  /** seconds a cut's +n pop shows, rising from the rock; seconds the hold's count shows after ore goes in */
  pop: 1.1,
  told: 1.6,
  /** seconds since a rock came in reach in which a pilot's laser is said to have locked on (the sound, once per rock) */
  relock: 3,
}

export const CHUNK = {
  /** seconds a chunk lies on the ground before it is gone */
  life: 75,
  /** how far a chunk is thrown from its outcrop, px a second, out and up; and what pulls it down */
  out: [42, 82] as [number, number],
  up: [40, 70] as [number, number],
  gravity: 150,
  /** it is scooped up when the ship passes this close across, and is no more than this far above it */
  reach: 30,
  below: 95,
  /** seconds it takes to fly up into the hold */
  pull: 0.22,
  /**
   * A gem: now and then a chunk comes out rich, a glinting crystal worth `units` of its ore, thrown further and lying only
   * `life` seconds, so it is worth chasing. The chance is `chance`, times `rich` from a rich deposit, times the place's
   * danger (`wild`, by the danger level 0 home .. 3 the core): danger pays in what the ground gives (polish step 9: frontier
   * mining had paid about what safe trading did). The expected chunk is worth about 1.06 units at home, 1.21 on the
   * frontier (a rich deposit 1.52), 1.3 deeper out (1.76), 1.42 at the core (2.04).
   */
  gem: { chance: 0.08, rich: 2.5, wild: [0.4, 1.3, 1.9, 2.6], units: 3, out: [85, 135] as [number, number], life: 16 },
}

export const LAND = {
  /** px above the ground from which the ship can come down */
  reach: 150,
  /** px over the lowest it may fly (its floor) within which the vertical thrusters held down land it, as Land does */
  sunk: 3,
  /** px beyond a pad's edge where the ship would come to rest that still bring it down onto the pad (a landing begun
   * short of a pad otherwise settled across its edge, not at the base) */
  padPull: 24,
  /** the ground under it must be this flat: px between its highest and lowest point, under a circle this share of the hull's length */
  flat: 3,
  footprint: 0.34,
  /** seconds the ship takes to brake to a hover, and px a second it sinks at most (slower near the ground) */
  brake: 0.55,
  sink: 44,
  /** seconds it settles on its legs once down, and takes to lift off to `liftTo` px over the ground before it flies on */
  settle: 0.4,
  lift: 1.1,
  liftTo: 24,
  /** seconds Land must be held to lift off (a tap is not enough, so it is never by accident) */
  hold: 0.25,
}

export const CRATE = {
  /** seconds a crate lies where it fell before it is gone */
  life: 240,
  /** seconds before the pilot who lost it may take it back (his new ship arrives right over it: others get their chance first) */
  ownWait: 15,
  /** it is taken when a ship passes this close across, and no more than this far above it */
  reach: 18,
  below: 95,
  /** the chance a raider shot down leaves salvage, and how much */
  salvage: 0.5,
  salvageUnits: [2, 6] as [number, number],
}

export const TURRET = {
  /** px: how far a base's turrets reach */
  range: 300,
  /** shots a second, how far their aim wanders (radians), and how much of a target's movement they allow for */
  rate: 3,
  aim: 0.05,
  lead: 0.85,
  /** damage, as a share of a ship's cannon: an outpost's, a capital's */
  outpost: 0.7,
  capital: 1.3,
  /** seconds a burst lasts, and the rest between bursts */
  burst: 0.7,
  pause: 0.9,
}

export const REWARD = {
  /**
   * credits for downing one of the computer's raiders (or a patrol of the other side), as a share of its hull's points in the
   * skirmish; times its band's pay (data/bands.ts BAND_PAY). (Polish step 9: it was 0.2, and a pilot who only fought earned
   * 47 credits a minute against a miner's 128; fighting is the first pillar, so it pays a living: a light raider on the
   * frontier 60, a Lance deeper out 135; and a band beaten pays a bounty on top, data/bands.ts BAND_BOUNTY.)
   */
  raider: 0.6,
  /** credits for downing another pilot (times what he is worth, after the farming limit) */
  pilot: 140,
}

/** credits to have a new ship delivered after one is lost: the Corsair (a new pilot's) and the light ones are free */
export const REDELIVERY: Record<string, number> = {
  corsair: 0,
  dart: 0,
  sparrow: 0,
  lance: 40,
  wraith: 60,
  prospector: 50,
  mule: 60,
  bastion: 90,
  nomad: 50,
  galleon: 120,
}
