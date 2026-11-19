// The game's pixel font: capitals, figures and a few signs, five pixels tall and mostly three
// wide, drawn straight into the frame on its own pixel grid. Text gets a dark shadow one
// pixel down and to the right, so it reads over sea, sand and cloud alike.

import { blend } from '../util/color'

// '#' is a pixel; each glyph is its rows, top first
const ROWS: Record<string, string[]> = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'],
  N: ['#..#', '##.#', '#.##', '#..#', '#..#'],
  O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#...#', '#...#', '#.#.#', '##.##', '#...#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '0': ['###', '#.#', '#.#', '#.#', '###'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['###', '..#', '###', '#..', '###'],
  '3': ['###', '..#', '###', '..#', '###'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '###', '..#', '###'],
  '6': ['###', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '..#', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '###'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  x: ['...', '#.#', '.#.', '#.#', '...'],
  '!': ['#', '#', '#', '.', '#'],
  ':': ['.', '#', '.', '#', '.'],
  '.': ['.', '.', '.', '.', '#'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '>': ['#..', '.#.', '..#', '.#.', '#..'],
  '<': ['..#', '.#.', '#..', '.#.', '..#'],
  '?': ['##.', '..#', '.#.', '...', '.#.'],
  ',': ['.', '.', '.', '#', '#'],
  "'": ['#', '#', '.', '.', '.'],
  '(': ['.#', '#.', '#.', '#.', '.#'],
  ')': ['#.', '.#', '.#', '.#', '#.'],
  '=': ['...', '###', '...', '###', '...'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '#': ['#.#', '###', '#.#', '###', '#.#'],
  '&': ['.#.', '#.#', '.#.', '#.#', '.##'],
  _: ['...', '...', '...', '...', '###'],
  '·': ['.', '.', '#', '.', '.'],
  ' ': ['..', '..', '..', '..', '..'],
}

interface Glyph {
  w: number
  /** the pixels, as (column, row) pairs */
  px: number[]
}

const GLYPHS = new Map<string, Glyph>()
for (const [ch, rows] of Object.entries(ROWS)) {
  const px: number[] = []
  rows.forEach((row, r) => [...row].forEach((c, col) => c === '#' && px.push(col, r)))
  GLYPHS.set(ch, { w: rows[0].length, px })
}

/**
 * The size every scale is multiplied by: 1, or 2 while the HUD is drawn with its text twice the size (the
 * `hudScale` setting: a phone's small art pixels, or the player's larger text). The HUD sets it as it
 * begins and puts it back as it ends; a scale of 1.5 then comes to 3.
 */
let unit = 1
export function setTextUnit(n: number) {
  unit = Math.max(1, Math.round(n))
}
const sized = (scale: number) => Math.max(1, Math.round(scale * unit))

/** the height of a line of text, in pixels, at a scale */
export const textHeight = (scale = 1) => 5 * sized(scale)

/** how wide a line of text is, in pixels, at a scale */
export function textWidth(str: string, scale = 1) {
  const s = sized(scale)
  let w = 0
  for (const ch of str) w += ((GLYPHS.get(ch) ?? GLYPHS.get(' ')!).w + 1) * s
  return Math.max(0, w - s)
}

/**
 * Writes a line of text with its top-left corner at (x, y): each font pixel is `scale` frame
 * pixels square; `k` (of 256) is how strongly it shows, and `shadow` the colour of its shadow
 * (0 for none).
 */
export function drawText(
  fb: Uint32Array,
  W: number,
  H: number,
  x: number,
  y: number,
  str: string,
  col: number,
  shadow: number,
  k = 256,
  scale = 1,
) {
  const put = (px: number, py: number, c: number, kk: number) => {
    for (let dy = 0; dy < scale; dy++) {
      const yy = py + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = 0; dx < scale; dx++) {
        const xx = px + dx
        if (xx < 0 || xx >= W) continue
        const o = yy * W + xx
        fb[o] = kk >= 256 ? c : blend(fb[o], c, kk)
      }
    }
  }
  scale = sized(scale)
  // (on the pixel grid: a line centred by half an odd width would otherwise fall between pixels, and not show)
  x = Math.round(x)
  y = Math.round(y)
  for (const pass of shadow ? [0, 1] : [1]) {
    let cx = x
    for (const ch of str) {
      const g = GLYPHS.get(ch) ?? GLYPHS.get(' ')!
      for (let i = 0; i < g.px.length; i += 2) {
        const px = cx + g.px[i] * scale
        const py = y + g.px[i + 1] * scale
        if (pass === 0) put(px + scale, py + scale, shadow, (k * 170) >> 8)
        else put(px, py, col, k)
      }
      cx += (g.w + 1) * scale
    }
  }
}
