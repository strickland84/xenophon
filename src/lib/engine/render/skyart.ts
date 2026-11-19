// The patterns of the thin sheets of cloud over the heap clouds (world/sky.ts): streaks of cirrus drawn out by the wind,
// a mackerel sky's rows of small cloudlets, a veil's soft grey sheet. Each is a map of thickness (0..255) that wraps every
// SKY_N px, made once in code with whole numbers only (the same everywhere), with smaller copies for far away: a sheet
// seen a long way off is read from the copy whose pixels are about the size of the screen's, so it never sparkles.

import type { SheetKind } from '../data/skies'

export const SKY_N = 512
export const SKY_SHIFT = 9
/** copies, each half the size of the last (512, 256, 128, 64) */
export const SKY_LEVELS = 4

/** a whole number hash of a lattice point, 0..255 */
function lattice(x: number, y: number, salt: number) {
  let h = Math.imul(x * 374761393 + y * 668265263 + salt * 2147483647, 0x27d4eb2d)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) & 255
}

/**
 * Smooth noise 0..255 at a pixel, from a lattice `cx` × `cy` px a cell (each a power of two dividing SKY_N, so it wraps):
 * whole numbers throughout, eased between the lattice points.
 */
function noise(x: number, y: number, cxs: number, cys: number, salt: number) {
  const cx = 1 << cxs
  const cy = 1 << cys
  const gx = SKY_N >> cxs
  const gy = SKY_N >> cys
  const ix = x >> cxs
  const iy = y >> cys
  const fx = x & (cx - 1)
  const fy = y & (cy - 1)
  // (eased: 3t² − 2t³, in 256ths)
  const ex = (fx * fx * (3 * cx - 2 * fx) * 256) / (cx * cx * cx)
  const ey = (fy * fy * (3 * cy - 2 * fy) * 256) / (cy * cy * cy)
  const x1 = (ix + 1) % gx
  const y1 = (iy + 1) % gy
  const a = lattice(ix, iy, salt)
  const b = lattice(x1, iy, salt)
  const c = lattice(ix, y1, salt)
  const d = lattice(x1, y1, salt)
  const top = a * 256 + (b - a) * ex
  const bot = c * 256 + (d - c) * ex
  return Math.floor((top * 256 + (bot - top) * ey) / 65536)
}

/** a sheet's thickness at a pixel of its pattern */
function thickness(kind: SheetKind, x: number, y: number) {
  if (kind === 'cirrus') {
    // strands along the wind (across the map), bent by slow waves, gathered in drifts; thin and frayed at their ends
    const bend = noise(x, y, 7, 6, 11) + (noise(x, y, 6, 5, 15) >> 1) - 192
    const yy = (y + ((bend * 40) >> 8) + SKY_N) & (SKY_N - 1)
    const strand = noise(x, yy, 6, 3, 12)
    const fine = noise(x, yy, 5, 1, 13)
    const patch = noise(x, y, 7, 7, 14) + (noise(x, y, 6, 6, 16) >> 1) - 96
    const s = Math.max(0, strand - 138) * 3 + (Math.max(0, fine - 170) >> 1)
    return Math.min(255, (s * Math.max(0, patch - 60)) >> 7)
  }
  if (kind === 'mackerel') {
    // rows of round cloudlets across the wind (each 8 to 16 px), the rows bent and broken, gathered in drifts
    const bend = noise(x, y, 7, 6, 21) - 128
    const yy = y + ((bend * 40) >> 7) + SKY_N
    const phase = yy % 24
    const ridge = phase < 16 ? 255 - Math.abs(phase * 2 - 15) * 15 : 0
    const puff = noise(x, yy & (SKY_N - 1), 4, 4, 22)
    const patch = noise(x, y, 7, 7, 23) + (noise(x, y, 6, 6, 24) >> 1) - 96
    const t = (Math.max(0, ridge - 40) * Math.max(0, puff - 100)) >> 6
    return Math.min(255, (t * Math.max(0, patch - 70)) >> 7)
  }
  // a veil: broad soft swells with a finer grain
  const broad = noise(x, y, 7, 6, 31)
  const mid = noise(x, y, 5, 5, 32)
  const grain = noise(x, y, 3, 3, 33)
  return Math.min(255, (broad * 5 + mid * 2 + grain) >> 3)
}

const made = new Map<SheetKind, Uint8Array[]>()

/** a sheet's pattern and its smaller copies (level n is SKY_N >> n px across) */
export function sheetArt(kind: SheetKind): Uint8Array[] {
  let levels = made.get(kind)
  if (levels) return levels
  const top = new Uint8Array(SKY_N * SKY_N)
  for (let y = 0; y < SKY_N; y++) for (let x = 0; x < SKY_N; x++) top[(y << SKY_SHIFT) | x] = thickness(kind, x, y)
  levels = [top]
  for (let n = 1; n < SKY_LEVELS; n++) {
    const src = levels[n - 1]
    const sn = SKY_N >> (n - 1)
    const dn = sn >> 1
    const out = new Uint8Array(dn * dn)
    for (let y = 0; y < dn; y++)
      for (let x = 0; x < dn; x++) {
        // (between the mean of the four and the thickest of them: a thin strand far off is still seen, not averaged away)
        const o = y * 2 * sn + x * 2
        const a = src[o]
        const b = src[o + 1]
        const c = src[o + sn]
        const d = src[o + sn + 1]
        out[y * dn + x] = (((a + b + c + d + 2) >> 2) + Math.max(a, b, c, d) + 1) >> 1
      }
    levels.push(out)
  }
  made.set(kind, levels)
  return levels
}
