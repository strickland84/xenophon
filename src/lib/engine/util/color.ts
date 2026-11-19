// Colours are packed as 0xAABBGGRR: the byte order of a canvas's ImageData, so the frame
// buffer can be handed to the canvas as it is.

import { clamp255 } from './math'

export const pack = (r: number, g: number, b: number) => ((255 << 24) | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r)) >>> 0
/** one colour over another, k parts in 256 */
export function blend(bg: number, fg: number, k: number) {
  const r = ((bg & 255) * (256 - k) + (fg & 255) * k) >> 8
  const g = (((bg >> 8) & 255) * (256 - k) + ((fg >> 8) & 255) * k) >> 8
  const b = (((bg >> 16) & 255) * (256 - k) + ((fg >> 16) & 255) * k) >> 8
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
}

/** brightness of an [r, g, b] colour, 0..255 */
export const lum = (c: number[]) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

/** a 4 × 4 ordered-dither pattern: thresholds 0..15 */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

/** reads a CSS colour (#rgb, #rrggbb, rgb(…)) into [r, g, b]; anything else gives the fallback */
export function parseColor(str: string | undefined, fallback: number[]): number[] {
  if (!str) return fallback
  let s = String(str).trim()
  if (s[0] === '#') {
    s = s.slice(1)
    if (s.length === 3 || s.length === 4)
      s = s
        .split('')
        .map((ch) => ch + ch)
        .join('')
    if (s.length >= 6) {
      const n = parseInt(s.slice(0, 6), 16)
      if (!isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }
    return fallback
  }
  const m = s.match(/rgba?\(([^)]+)\)/)
  if (m) {
    const parts = m[1].split(/[ ,/]+/).map(parseFloat)
    if (parts.length >= 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) return [parts[0], parts[1], parts[2]]
  }
  return fallback
}
