// Squads (the plan's section 8): up to four pilots who fly together. Flying in tight formation
// (close to a squad mate, or a computer wingman, and heading the same way) gives a slipstream: a
// little more top speed for as long as it is held. Starting values, to tune by playing.

export const SQUAD = {
  /** pilots in a squad at most */
  most: 4,
  /** px a squad mate may be off (across the ground and up or down), and how far his heading may differ (radians), for the slipstream */
  reach: 48,
  angle: 0.45,
  /** top speed in the slipstream, as a share of the usual, and how fast it comes and goes (a share a second) */
  slip: 1.08,
  ease: 1.6,
}
