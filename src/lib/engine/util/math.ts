// Small numeric helpers shared by the whole engine.

export function clamp255(v: number) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)

/** a small, fast seeded random number generator (0..1) */
export function mulberry32(seed: number) {
  let a = seed | 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** an 8-bit hash of an integer: cheap, repeatable "randomness" for a pixel or an index */
export function hash8(o: number) {
  let h = Math.imul(o ^ (o >>> 13), 0x5bd1e995)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  return (h >>> 24) & 255
}

/** an angle brought into −π..π */
export function wrapAngle(a: number) {
  return a - Math.PI * 2 * Math.round(a / (Math.PI * 2))
}
