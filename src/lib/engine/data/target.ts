// The numbers of targeting (sim/target.ts; docs/targeting.md): how the target key is read, and how far off a thing may be
// picked and kept.

export const TARGET = {
  /** seconds the target key is held before it lets the target go (a press picks the next) */
  hold: 0.45,
  /** px: ships are picked within this, and let go once further off than `shipFar` */
  pickShip: 3000,
  shipFar: 4000,
  /** px: on a world's ground, its bases and places are picked within this, and let go further off than `groundFar` */
  pickGround: 1500,
  groundFar: 2400,
  /** a thing is on the frame when its middle is within its own radius on the frame of it, and at least this much of a margin */
  margin: 2,
}
