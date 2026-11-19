// The weapons, and the rules of being hit: every number the fighting runs on. Distances are
// world px, times seconds, angles radians. Starting values, to be tuned by playing.

export const CANNON = {
  /** shots a second from each mount (mounts fire in turn) */
  rate: 5,
  /** px per second, on top of the speed of the ship that fired it */
  speed: 420,
  /** seconds a shot flies before it is spent */
  life: 0.8,
  /** hull points a hit takes */
  damage: 7,
  /** how far a shot may stray from where it is aimed */
  spread: 0.008,
  /** heat a second of firing builds (whatever the number of mounts), heat lost a second, and the heat that jams the guns */
  heat: 0.42,
  cool: 0.16,
  /** seconds the guns stay jammed once they overheat (they cool twice as fast meanwhile) */
  jam: 1.6,
  /**
   * The aim assist: a shot is turned onto a target whose lead point is within this much of
   * the nose, across and up or down. Generous up and down: from overhead, height is hard to
   * judge.
   */
  assistAcross: 0.075,
  assistUp: 0.26,
  /** the farthest the aim assist reaches */
  assistRange: 380,
}

/**
 * The thrusters build heat too, into the same gauge as the guns (the plan's section 7): held open they
 * overheat in about ten seconds from cold, sooner with the guns firing, and overheated both shut a moment.
 */
export const THRUSTERS = {
  /** heat a second with the thrusters wide open (the guns' cooling takes 0.16 of it back) */
  heat: 0.26,
}

export const MISSILE = {
  /** seconds a target must be held in the seeker before it locks */
  lockTime: 1,
  /** the seeker's cone (half-angle) and reach */
  lockCone: 0.38,
  lockRange: 520,
  /** seconds a target may slip out of the cone before the lock begins again */
  lockGrace: 0.3,
  /** px per second faster than the ship that fired it, at launch; its top speed, and how fast it gets there */
  launch: 40,
  top: 330,
  thrust: 320,
  /** how fast it can turn, radians a second */
  turn: 2.7,
  /** seconds it flies before it burns out and bursts */
  life: 4.5,
  /** it bursts this close to its target, and harms everything within the blast */
  fuse: 12,
  blast: 26,
  damage: 75,
  /** a roll begun while the missile is this many seconds from hitting breaks its lock */
  dodgeEarly: 0.85,
  dodgeLate: 0.12,
  /** seconds between launches */
  reload: 0.8,
  /**
   * Seconds for one to come back onto the pilot's own rack, one at a time, up to what it holds (James, 2026-11-19: "I
   * would like missiles to slowly replenish, like 1 every 15-30s or something so you dont get totally out of missiles").
   * The computer's pilots have what they set out with.
   */
  regen: 20,
}

/** a ship's shots striking the ground: a pilot on foot this close (px) takes this share of the shot's damage */
export const SPLASH = { reach: 6, share: 0.5 }

export const DAMAGE = {
  /** seconds without being hit before the shield starts to recharge, and how fast it does (points a second) */
  shieldWait: 3,
  shieldRate: 14,
  /** seconds a new ship cannot be harmed (firing ends it early) */
  protect: 5,
  /** below these shares of its hull a ship smokes, then burns */
  smokeAt: 0.6,
  fireAt: 0.3,
  /** seconds between a roll ending and the next one starting */
  rollRest: 0.35,
}
