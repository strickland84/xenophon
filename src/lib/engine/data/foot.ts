// The numbers of being on foot (the plan's sections 6, 7 and 9, Phase 5): walking, coming down
// after ejecting, the sidearm, mining a vein by hand, the backpack, flares and beacons, having a
// ship redelivered, dying and coming back, and stealing a parked ship. Distances are world px,
// times seconds. Starting values, tuned by playing scripted flights; to be tuned by playing.

export const FOOT = {
  /**
   * how many times larger the art pixels are on foot (Scene.zoom): 1, the same as flying. He is his true size beside
   * his ship (the polish pass, item 1: a sixth of a light fighter's length), and the world stays the size it was when
   * the ship set down. (It was 2, the camera pulled in as he climbed out. James, 2026-11-18: "When ship lands on planet
   * scale is perfect, then I exit and it kind of zooms in. Dont want that. Keep same scale as when in ship".)
   */
  zoom: 1,
  /**
   * how quickly (a second) the overhead camera comes round to stand square to the world once he is out: it stays a whole
   * number of quarter turns on foot, and moves by whole art pixels, so the ground never shimmers under him
   */
  squareUp: 5,
  /** px a second walking, and running (the thrusters' control held) */
  walk: 24,
  run: 38,
  /** how fast he gets up to speed and stops (each step closes this share of the gap, a second) */
  grip: 16,
  /** a share of his speed in shallow water */
  wade: 0.5,
  /** px: the highest step up or down he can take (one terrace; anything taller is a cliff) */
  step: 3,
  /** px of ground a step of his walk covers (four steps a stride) */
  stride: 4,
  /** px a second he rises or sinks to the ground under him, going up and down a terrace */
  climb: 40,
  /** hit points, and how they come back: seconds after the last hit, then points a second */
  health: 30,
  healWait: 6,
  healRate: 2,
  /** px: a shot this close to his middle hits him; and how high his middle is over his feet */
  radius: 2.6,
  chest: 3,
  /** a leap (Roll on foot, Space: a jump, a dash the way he is going with it): px a second, seconds the dash lasts, and
   * seconds before the next */
  dive: 76,
  diveTime: 0.32,
  diveRest: 0.55,
  /**
   * The jump and the climb (James, 2026-11-18: "space should jump such that a stuck player can clear most terrain
   * obstacles, and if up against a big cliff it should climb"). `up`: px a second he leaves the ground at (about two
   * terraces high at the top, up²/2g); `fall`: px a second² he comes down at; `climb`: px a second he climbs a wall
   * pushed against for `grip` seconds (a cliff too tall to step or jump), until he can step onto its top
   */
  jump: { up: 48, fall: 150 },
  wall: { climb: 16, grip: 0.25 },
  /** px from the middle of a parked ship he must be within to climb in (as well as its half-width) */
  reach: 8,
  /** seconds to climb in, and to climb out and down */
  board: 0.55,
  out: 0.45,
  /** in a forest an enemy sees him only this close (px), unless he fires */
  hidden: 34,
  /** seconds he stays seen after firing from cover */
  seenAfterFire: 1.5,
  /** px: how near a chunk of ore or a crate must be for him to pick it up */
  pick: 6,
}

/**
 * Coming down after ejecting: every race takes the same time and falls at the same speed (only the picture differs).
 * Quicker since the polish pass (a death cost about five seconds before he could walk; now under three and a half from
 * a fight's usual height of 200 px, and the fall from high up a third quicker).
 */
export const DESCENT = {
  /** px a second falling freely, until this high over the ground (px), where it opens */
  fall: 200,
  open: 55,
  /** seconds to open, px a second sinking once open, and px a second he can steer it across the ground */
  opening: 0.4,
  sink: 26,
  steer: 40,
  /**
   * Over deep water, lava or acid it opens at once, high, and glides: sinking this slowly, steered this fast (polish step 9:
   * three of a fighter's eight deaths were his pilot drowned or burned after ejecting over the sea or lava; it reached about
   * 120 px from a fight's height. Now about 400 px from a low fight (the seat's rocket lifts him some 85 px), 750 from 150 px
   * up; coming down in deep sea is still death). Over land he drops as before, quickly.
   */
  glideSink: 20,
  glideSteer: 64,
  /** px round him searched for ground he can stand on (the HUD's arrow to it), and seconds between searches */
  look: 900,
  lookEvery: 0.3,
}

export const SIDEARM = {
  /** shots a second */
  rate: 3.2,
  /** px a second, and seconds a bolt flies (so its reach is about speed × life) */
  speed: 240,
  life: 0.6,
  /** hit points a bolt takes from a pilot, and from a ship */
  damage: 9,
  shipDamage: 2.5,
  /** the aim assist: a bolt is turned onto an enemy within this angle (radians) of where it is aimed, and this near */
  assist: 0.32,
  range: 150,
  /** how far a bolt strays */
  spread: 0.02,
}

/** a vein: ore in the rock where a ship cannot set down, cut by hand (sim/veins.ts) */
export const VEIN = {
  /** how many a world has, and px they keep from a base and from each other */
  count: 22,
  awayFromBases: 200,
  apart: 90,
  /** units a vein holds, units a second a hand tool cuts, and px from it he must be to cut it */
  stock: 24,
  rate: 1.6,
  reach: 9,
  /** units a cut by hand frees at once (into the pack together, as the ship's laser frees chunks: data/loop.ts MINE.batch) */
  batch: 2,
}

/** the backpack: slots, ten units a slot like the hold */
export const PACK = { slots: 4 }

export const FLARE = {
  /** flares a pilot carries, and seconds one takes to come back */
  count: 3,
  refill: 30,
  /** px a second it goes up, and seconds it burns */
  up: 150,
  life: 7,
}

export const BEACON = {
  /** seconds a beacon stands (one a pilot: planting another moves it) */
  life: 900,
}

/** a ship redelivered to a pilot on land: seconds it takes, and how far off it comes in from, and how high */
export const REDELIVER = {
  time: 30,
  from: 420,
  height: 70,
  /** seconds of its approach (the last part of the wait), braking onto its spot */
  brake: 3.2,
  /** seconds Use must be held to call it */
  hold: 0.5,
  /**
   * His own ship, parked this far off or more (px), can be called to him too: it lifts and comes in this many seconds, for
   * nothing (polish step 9: a pilot walled off from his parked ship, by a cliff or an outcrop's crystals grown back, had no
   * way back to it at all)
   */
  recallFar: 90,
  recall: 9,
}

/** seconds after a pilot dies before he is back, at the nearest friendly base, in his ship */
export const RESPAWN = { wait: 4 }

export const STEAL = {
  /** credits for landing a stolen ship at a friendly base, as a share of its hull's points */
  reward: 1,
  /** seconds a thief waits, climbing in, for the owner's game to give the ship up */
  wait: 2,
}

/** the computer's pilots strafing a pilot on foot: how much steadier their aim is than at a ship (a share of its wander) */
export const STRAFE = { steady: 0.3 }

/** credits for killing a pilot on foot (times what the farming limit leaves) */
export const FOOT_REWARD = 60
