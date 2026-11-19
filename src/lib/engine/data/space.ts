// The numbers space runs on (the plan's sections 4 and 6): how high ships fly there, how fast
// the bodies move round their orbits, the cruise drive, gravity, a sun's heat, a gas giant's
// bands, a black hole's ring, the gates, docking, the asteroid belts and the void shards; how
// the bodies stand in depth and how they are drawn from overhead; the way down to a world and
// up out of one. Starting values, to tune by playing.

/** the plane every ship comes into space at, and stations, gates, belts and what is strewn are in */
export const SPACE_Z = 64
/**
 * How far over and under the plane a ship may fly (James's first flight, 2026-11-18: from behind and in the seat the
 * pointer and the stick climbed and dived nothing in space, every ship level in the plane). Under it, no deeper than the
 * empty world's ground (0, where shots and sparks stop) leaves room for; over it, a fair way.
 */
export const SPACE_LOW = SPACE_Z - 48
export const SPACE_HIGH = SPACE_Z + 220

/**
 * How far over and under the plane the pilot's own ship, flown free (sim/spaceflight.ts), may go, and the computer's ships
 * after it: room for a loop at any speed many times over. At its edge a ship goes no further out; its nose is left where
 * its pilot pointed it.
 */
export const SPACE_DEEP = SPACE_Z - 900
export const SPACE_TOP = SPACE_Z + 900

/**
 * Flying free in space. Nothing moves the ship but its pilot (James, 2026-11-18, of the first free flight: "spinning around
 * getting sucked down … very horrible and disorienting"; "I want no gravity or wonky pulling of my ship").
 *
 * The keys, a stick and the touch buttons pitch it for as long as they are held: `pitch`, radians a second with the stick
 * hard over (a loop in about five seconds), taken up at `ease` (a share a second). Let go for `idle` seconds, a ship on
 * its back rolls upright, and one within `settle` radians of level comes level, at `level` a second for each radian it is
 * off; pointed further up or down than that it stays as it was pointed, and flies there (so a dive at a world is held).
 *
 * The pointer does not pitch it round and round: where the pointer is says how far up or down the nose points, and there
 * it stays (`aim` radians with the pointer `span` of the frame's height from the middle of its steering, `curve` making it
 * gentle near that middle, nothing within `dead` of it), come to at `come` a second for each radian it is off. A pointer
 * resting anywhere is a ship flying steadily; held as a rate, as it was, a mouse left in the middle of the screen looped
 * the ship for ever. Overhead a climb or a dive held is a nose `lean` radians up or down, and level again let go; Use held
 * over a world is a nose `dive` radians down.
 */
export const FLIGHT3D = {
  pitch: 1.3,
  ease: 6,
  idle: 0.55,
  settle: 0.35,
  level: 1.6,
  aim: 1.4,
  span: 0.36,
  curve: 1.4,
  dead: 0.1,
  come: 2.5,
  lean: 0.9,
  dive: 0.95,
}

/**
 * Where the bodies stand in depth (the polish pass, item 4). Ships, stations, gates and belts are
 * in the plane. Suns, gas giants and black holes have their middles in it: a ship flies round
 * them, into a giant's outer bands, never over them. A world or a moon lies below the plane, its
 * top this share of its radius under it: a ship flies over it, and goes down to it.
 */
export const BELOW = 0.4

/**
 * Overhead, a world or a moon far below is drawn smaller than it is and drifts past slowly, as
 * the ground does from high up (the size of its disc, px, its radius on the frame): the whole of it
 * a ball under the ship, its ground no larger than it is seen from its own ceiling (a world's wraps
 * in 2048 px, so its radius is 326; from the ceiling its ground is drawn at a third). It was 245 and
 * 190: larger than the frame, so from overhead a world was never seen whole, and climbing out of
 * one its ground grew larger the higher the ship went.
 */
export const OVERHEAD = { world: 104, moon: 84 }

/**
 * Overhead, the bodies in the plane (a sun, a gas giant, a black hole) are drawn pulled back too, at this share of their size,
 * drifting past round the ship as the worlds do: its edge passes under the ship where the ship crosses its true edge. At true
 * size from overhead the frame beside one was black, or one flat colour over it (polish step 9, the art audit); pulled back,
 * a giant's banded curve, a sun's boiling limb and corona, a black hole's lensing disc fill the frame beside them.
 */
export const OVERHEAD_SHARE: Record<string, number> = { giant: 0.075, sun: 0.055, 'black hole': 0.075 }

/** the stars: how many there are in the sky, and overhead how slowly the two depths of them drift past (a share of the ship's own speed) */
export const STARS = { count: 1100, drift: [0.004, 0.011] }

/**
 * How many times slower than their own periods the bodies go round (galaxy.ts: an inner world's is under three hours, a
 * moon's twenty minutes to an hour): at 4, a moon goes round its world in an hour and a half to three and a half, an inner
 * world round its sun in about eleven, so a session sees the moons move and the map change from day to day. Faster, a
 * station round a giant would outrun a ship flying to it. (It was 120: a moon took two days, a world a fortnight, and
 * nothing was ever seen to move.)
 */
export const ORBIT_SLOW = 4

// (polish step 9: quicker, so a crossing between frontier worlds is no longer a minute or more of nothing to decide: it starts
// nearer a station or a gate (`near` 260 → 140: leaving one had been eight seconds at the ship's own speed), spools quicker
// (1.2 → 0.9 s), up to 1100 times (was 640). `far` stays 0.9: at 1.15 a ship cruising at a black hole's ring to thread it
// was carried past the ring into the hole, at 1.5 into suns)
export const CRUISE = {
  /** times its normal speed it cruises at, at the least (near anything) */
  pace: 8,
  /** further out it goes faster: each second, this share of the distance to the nearest thing … */
  far: 1.15,
  /** … up to this many times its normal speed */
  most: 1100,
  /** seconds the drive spools before it pushes */
  spool: 0.9,
  /** how fast it gathers speed once it pushes, and loses it dropping out (a share a second) */
  rise: 1.6,
  fall: 3.2,
  /** how hard it turns while cruising, as a share of its usual */
  turn: 0.6,
  /** px short of the end of a plotted course the drive drops out by itself (it slows over a few hundred more) */
  arrive: 380,
  /** px from a station or a gate inside which it will not start, and drops out */
  near: 140,
  /** times its normal speed it is held to among a belt's rocks; it drops out in a pull stronger than this, px/s² */
  belt: 4,
  pull: 26,
}

/**
 * Gravity: a black hole pulls a ship towards its middle, `pull` px/s² at its edge, falling off as the square of the
 * distance, out to `reach` times its size. Nothing else pulls. A sun, a giant, a world and a moon did (5 to 64 px/s²),
 * and near a world the pilot's ship slid sideways under him (James, 2026-11-18: "I want no gravity or wonky pulling of my
 * ship").
 */
export const GRAVITY = {
  hole: { pull: 70, reach: 5.5 },
  /** the most a pull can be, px/s², however close */
  most: 420,
  /** how fast the drift a pull gives dies away out of it (a share a second) */
  damp: 1.15,
}

/** a sun's heat: it burns a ship inside `reach` times its size, harder the deeper, `damage` hull a second at its edge */
export const SUN_HEAT = { reach: 1.5, damage: 42, tick: 0.25 }

/**
 * A course goes round a sun, a gas giant or a black hole in its way, this far from its middle (shares of its size):
 * clear of a sun's heat and of any pull strong enough to stop the cruise drive. At their true size these are tens of
 * thousands of px across, too wide to fly out of at a ship's own speed once caught.
 */
export const ROUND = { sun: 1.85, giant: 1.4, hole: 1.8 }

/** a gas giant: gas is skimmed from its outer bands (between `from` and `to` of its size), `rate` units a second; deeper than `crush` the pressure hurts */
export const GIANT = { from: 0.8, to: 0.99, rate: 1.6, crush: 0.74, crushDamage: 26, tick: 0.25 }

/** a black hole: the dark disc (the horizon) and the bright ring, as shares of its size; the band round the ring that can be threaded, and how long */
export const HOLE = {
  horizon: 0.42,
  ring: 0.62,
  /** half the ring's band, as a share of its size */
  band: 0.15,
  /** seconds the ship must hold in the band, Use held, to go through */
  thread: 0.55,
  /** the accretion disc reaches this far, and the stars bend this far round it (shares of its size) */
  disc: 1.55,
  lens: 3.2,
}

/** a jump gate: the ship is caught inside `reach` of its size; it charges for `charge` seconds, and arrives this far out of the other gate */
export const GATE = { reach: 1.05, charge: 3, out: 150, slow: 0.25 }

/** docking at a station: Use held within `reach` px of its middle brakes the ship into its dock over a second or so */
export const DOCK = { reach: 170, time: 1.4, undock: 1.2 }

/**
 * The air between a world's ground and space (sim/air.ts, sim/travel.ts flyAir): where the flat ground a ship flies over
 * and the globe it sees from space become one another. It is a place the pilot flies through, not a passage he is taken
 * along: he climbs into it from the top of the world's sky and on up into space, dives into it from space and on down,
 * and stays where he is in it when he does neither. (It was a flight of ten seconds flown for him, begun with Use.
 * James, 2026-11-18: "why do we NEED a transition? Why isnt the whole universe one seamless thing??")
 *
 * How far through it the ship is is `e`: 0 in space's plane, `ground` at the world's ceiling, where the ground itself
 * takes over from the globe the air makes of it (render/air.ts), drawn there at the same place and size (the two laid
 * over each other for `blend` of the way before it). The zone changes `switchDown` of the way down (`switchUp` going
 * back up), where the ship is `over` px above the ceiling. A climb or a dive held hard crosses it all in `cross`
 * seconds; under `slack` of a push it stays where it is.
 *
 * Into it from below: at the ceiling, a climb asked for (`out`: this hard or harder), or Use held high over the ground
 * (from `from` px up), which climbs for as long as it is held. Into it from space: over a world (within `rim` of its
 * disc), flown `enter` px down under the plane with the nose well down (its sine under −`steep`: a dive that is meant,
 * steeper than a pointer resting off the middle of its steering gives), or flown all the way down to the globe's own air
 * (`shell` of its radius over it) at any slope; Use held over a world puts the nose down. A ship that dived in goes on
 * sinking, `trim` of as hard as it can, until its pilot asks anything else of it. A world climbed out of is turned on for
 * its pilot, to bring the place he left up to face the plane (its normal's z at least `top`), by the time he is `turnBy`
 * of the way up through its air (and back as it was if he comes back down): he comes out over the place he left.
 * `cam`: at the air's top the camera is space's, which looks where the ship's nose points; between these two shares of
 * the way down it goes over to the sky's, which is level and looks down at the world (so nothing jumps at the air's top:
 * a ship dives in looking at the world, and goes on looking at it). `thin`: high up the air thins and the ship climbs faster, up to 1 + this times as fast at the ceiling, from
 * `thinFrom` px. The air's fire is fiercest `fire[0]` of the way down and spreads `fire[1]` either side, and burns as
 * hard as the ship is sinking; it shakes the ship up to `shake`. Others see a ship going down sink `sink` px under the
 * plane by the time it changes zone.
 */
export const AIR = {
  cross: 5,
  slack: 0.1,
  enter: 220,
  steep: 0.5,
  shell: 0.12,
  trim: 0.6,
  rim: 0.87,
  top: 0.85,
  turnBy: 0.72,
  cam: [0.03, 0.3],
  switchDown: 0.55,
  switchUp: 0.45,
  ground: 0.72,
  over: 1700,
  blend: 0.06,
  from: 160,
  thin: 2.5,
  thinFrom: 300,
  out: 0.3,
  fire: [0.36, 0.2],
  shake: 0.3,
  sink: 600,
}

/** the sizes a rock is drawn at, px across (its pictures are shrunk to each: tools/voxel/space.py) */
export const ROCK_SIZES = [12, 18, 26, 36, 46, 56]

/** the asteroid belts: cells this many px square, each with up to `most` rocks; the share of rocks with ore, and how much */
export const BELT = { cell: 150, most: 3, oreShare: 0.3, stock: 18, period: 900, push: 70, bump: 14, drift: 5 }

/** void shards: they drift between `from` and `to` times a black hole's size, `count` of them, back each period */
export const SHARDS = { from: 1.25, to: 2.6, count: 28, period: 600, reach: 22 }

/** derelicts: drones guard them within `guard` px, `drones` at a time, back after `rest` seconds; salvage lies about them */
export const DERELICT = { guard: 900, drones: 3, rest: 40, salvage: 6, salvageUnits: [3, 6] }

/** seconds the system's name is shown after arriving in it */
export const SYSTEM_NAME_TIME = 5
