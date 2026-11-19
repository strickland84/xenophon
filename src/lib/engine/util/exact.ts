// Arithmetic that comes out the same, bit for bit, in every browser. Adding, multiplying and
// dividing are exact to the last bit everywhere (IEEE 754, rounded to nearest), and so are
// Math.floor, Math.round, Math.abs, Math.min and Math.max; Math.sqrt is correctly rounded on
// every processor a browser runs on. Math.sin, Math.cos, Math.pow, Math.exp and their friends
// are not: each engine approximates them its own way. Anything that decides a height, a
// material or a place in the galaxy uses only what is here.

/** the sine of a whole turn's share `t` (0..1 is once round): a polynomial, the same everywhere */
export function sinTurn(t: number) {
  // bring t into −0.25..0.25 of a turn, where the polynomial is good
  let u = t - Math.floor(t) // 0..1
  if (u > 0.5) u -= 1 // −0.5..0.5
  if (u > 0.25) u = 0.5 - u
  else if (u < -0.25) u = -0.5 - u
  const x = u * 6.283185307179586 // −π/2..π/2
  const x2 = x * x
  // Taylor series to x^11: within 6e-8 of the true sine over the range
  return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 + x2 * (-1 / 39916800))))))
}

/** the cosine of a whole turn's share `t` */
export const cosTurn = (t: number) => sinTurn(t + 0.25)

/** an 8-bit hash of two whole numbers: repeatable "randomness" for a place */
export function hash2(x: number, y: number, salt = 0) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35)
  return ((h ^ (h >>> 16)) >>> 24) & 255
}
