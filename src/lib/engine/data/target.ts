// The numbers of targeting (sim/target.ts; docs/targeting.md): how the target key is read, and how far off a thing may be
// picked and kept.

export const TARGET = {
  /** seconds the target key is held before it lets the target go (a press picks the next) */
  hold: 0.45,
  /** px: ships are picked within this, and let go once further off than `shipFar`; and further off still, while one is drawn
   * at least `seen` px in radius on the frame (2 px across), and kept until it is under `lost` (James, 2026-11-19: two ships
   * in the distance, seen from the seat, could not be picked: they were further off than 3000) */
  pickShip: 3000,
  shipFar: 4000,
  seen: 1,
  lost: 0.6,
  /** px: on a world's ground, its bases and places are picked within this, and let go further off than `groundFar` */
  pickGround: 1500,
  groundFar: 2400,
  /** a thing is on the frame when its middle is within its own radius on the frame of it, and at least this much of a margin */
  margin: 2,
  /** px: where the ship is aiming is the line through these two points along its nose, laid on the frame */
  aimNear: 40,
  aimFar: 2000,
  /** frame px: a thing's size on the frame brings it at most this much nearer the aim; within `sights` of it (the sights'
   * own size) it counts as under them, and the nearest of those comes first */
  reach: 12,
  sights: 8,
  /** frame px: what lies back past the aim's start counts as this much further off it (after everything ahead) */
  behind: 10000,
}
