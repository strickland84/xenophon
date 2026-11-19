// Fits a hull's cockpit (art.ts, the image model's) to a frame: once per hull, frame size and paint.
// Nothing is scaled. The art was made at two heights; the nearer to the frame's is taken, cut to the
// frame's width about its middle (its outer columns repeat where the frame is wider), and fitted to its
// height without touching the windows' middle: a taller frame repeats a plain dark row of the canopy's roof, or a
// bubble's top row (`fillRow`); a shorter one loses rows out of the roof, then off the top of the canopy. (It was fitted at one row through the
// windows, repeated or left out: on a wide screen the canopy's slanting struts ran straight down for a
// stretch there, broken in two: James, 2026-11-18.) Its trim is repainted in the player's markings
// colour, each pixel keeping its lightness.

import { pack } from '../../util/color'
import { COCKPIT_COLOURS, COCKPITS } from './art'
import type { CockpitBuild } from './art'
import type { CockpitArt } from './types'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'
const CODE = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) CODE[ALPHABET.charCodeAt(i)] = i

/** a layer's letters as palette indices (255: see-through) */
function decode(rows: string, n: number): Uint8Array {
  const out = new Uint8Array(n).fill(255)
  let o = 0
  for (let i = 0; i < rows.length && o < n;) {
    const c = rows.charCodeAt(i)
    if (c === 33) {
      const len = parseInt(rows.substr(i + 1, 2), 36)
      const s = rows.charCodeAt(i + 3)
      out.fill(s === 46 ? 255 : CODE[s], o, Math.min(n, o + len))
      o += len
      i += 4
    } else {
      out[o++] = c === 46 ? 255 : CODE[c]
      i++
    }
  }
  return out
}

const decoded = new Map<CockpitBuild, { frame: Uint8Array; panel: Uint8Array; fill: number; roof: number }>()
function layersOf(b: CockpitBuild) {
  let got = decoded.get(b)
  if (!got) {
    const frame = decode(b.frame, b.w * b.h)
    const panel = decode(b.panel, b.w * b.h)
    got = { frame, panel, ...fillRow(b, frame, panel) }
    decoded.set(b, got)
  }
  return got
}

/**
 * The row of a build to repeat where the frame is taller than the art, never one through the windows' middle: of the
 * canopy's roof where it has one (rows solid all the way across at the top), the plainest and darkest of them; or, a
 * bubble with no roof, its top row.
 */
function fillRow(b: CockpitBuild, frame: Uint8Array, panel: Uint8Array): { fill: number; roof: number } {
  const at = (o: number) => (frame[o] !== 255 ? frame[o] : panel[o])
  const solid = (y: number) => {
    for (let x = 0; x < b.w; x++) if (at(y * b.w + x) === 255) return false
    return true
  }
  const rows: number[] = []
  for (let y = 0; y < b.h - 1 && solid(y) && solid(y + 1); y++) rows.push(y)
  // (no roof, a bubble: its top row, where the canopy's ring leaves the frame nearly straight up, so carrying it on up
  // shows least; the panel's rows, tried first, had plates and handles that repeated became slabs and posts)
  if (!rows.length) return { fill: 0, roof: 0 }
  let best = rows[0] ?? b.h - 1
  let bestScore = -1e9
  for (const y of rows) {
    let same = 0
    let lit = 0
    for (let x = 0; x < b.w; x++) {
      const c = at(y * b.w + x)
      if (c === 255) continue
      if (c === at((y + 1) * b.w + x)) same++
      const col = COCKPIT_COLOURS[c]
      lit += col[0] + col[1] + col[2]
    }
    const score = same / b.w - lit / (b.w * 765) / 3
    if (score > bestScore) {
      bestScore = score
      best = y
    }
  }
  return { fill: best, roof: rows.length }
}

const lightness = (c: number[]) => (Math.max(c[0], c[1], c[2]) + Math.min(c[0], c[1], c[2])) / 510
// how light the trim's own colours run, so each can take the tone of the paint that sits as high in its ramp
const TRIM_LIGHT = COCKPIT_COLOURS.filter((c) => c[3] === 1).map(lightness)
const TRIM_LO = Math.min(...TRIM_LIGHT, 0.3)
const TRIM_HI = Math.max(...TRIM_LIGHT, 0.7)

/** the palette packed, its trim in the player's markings colour (`accent`: its tones, darkest first) */
function coloursOf(accent: number[]) {
  return COCKPIT_COLOURS.map((c) => {
    if (c[3] === 1 && accent.length) {
      const u = (lightness(c) - TRIM_LO) / Math.max(0.01, TRIM_HI - TRIM_LO)
      return accent[Math.max(0, Math.min(accent.length - 1, Math.round(u * (accent.length - 1))))]
    }
    return pack(c[0], c[1], c[2])
  })
}

/** the build of a hull's cockpit nearest a frame `H` tall */
export function buildFor(hull: string, H: number): CockpitBuild {
  const builds = COCKPITS[hull] ?? COCKPITS.corsair
  let best = builds[0]
  for (const b of builds) if (Math.abs(b.h - H) < Math.abs(best.h - H)) best = b
  return best
}

/** a hull's cockpit fitted to a frame of W × H, its trim in `accent` */
export function buildCockpit(hull: string, W: number, H: number, accent: number[]): CockpitArt {
  const b = buildFor(hull, H)
  const { frame, panel, fill, roof } = layersOf(b)
  const cols = coloursOf(accent)
  const pad = Math.ceil(H * 0.05) + 3
  const aw = W + pad * 2
  const ah = H + pad * 2
  const left = Math.round((b.w - W) / 2)
  const grow = H - b.h
  // shorter: rows out of the middle of the roof (as many as it has, but its edges), the rest off the top
  const drop = grow < 0 ? Math.min(-grow, Math.max(0, roof - 2)) : 0
  const crop = grow < 0 ? -grow - drop : 0
  const cutAt = Math.max(1, (roof - drop) >> 1)
  const shortRow = (fy: number) => (fy + crop >= cutAt ? fy + crop + drop : fy + crop)
  // the art's row and column for each of the frame's (with the pad round it)
  const rowOf = (fy: number) => Math.max(0, Math.min(b.h - 1, grow < 0 ? shortRow(fy) : fy < fill ? fy : Math.max(fill, fy - grow)))
  const colOf = (fx: number) => Math.max(0, Math.min(b.w - 1, fx + left))
  const lf = new Uint32Array(aw * ah)
  const lp = new Uint32Array(aw * ah)
  for (let y = 0; y < ah; y++) {
    const by = rowOf(y - pad) * b.w
    for (let x = 0; x < aw; x++) {
      const at = by + colOf(x - pad)
      const o = y * aw + x
      if (frame[at] !== 255) lf[o] = cols[frame[at]]
      if (panel[at] !== 255) lp[o] = cols[panel[at]]
    }
  }
  const yOf = (by: number) => (grow < 0 ? by + grow : by < fill ? by : by + grow)
  const screens = b.screens.map((s) => ({ ...s, x: s.x - left, y: yOf(s.y) }))
  // the lowest row any column of the frame still shows the world through, wherever the head has swung
  let open = 0
  for (let x = 0; x < W; x++) open = Math.max(open, yOf(b.cover[colOf(x)]))
  return {
    hull,
    paintKey: accent.join(','),
    W,
    H,
    pad,
    aw,
    ah,
    frame: lf,
    panel: lp,
    screens,
    clear: Math.min(H, open + pad),
    panelTop: Math.max(0, screens.reduce((m, s) => Math.min(m, s.y), H) - 14),
  }
}
