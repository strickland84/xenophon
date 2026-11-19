// A ship's colours, worked out ahead of time: its hull's own palette recoloured from the paint
// its pilot chose, toned for the time of day, plus its flames in the colour its engines glow.
// Every ship in the scene has one; the player's ship and its wingmen share theirs.

import type { HullData } from '../jet/model'
import type { TimeOfDay } from '../params'
import { lum, pack, parseColor } from '../util/color'
import { grade } from './palettes'

/** the colours a pilot picks for a ship (any CSS colour): its body, its markings, its glass; and, if he chose them, the trim (fitted parts and the pattern: '' the body's), the engines' glow and flames, the wingtip trails ('' the hull's own, the sky's), and the side whose mark it carries (its colour) */
export interface ShipColours {
  body: string
  accent: string
  canopy: string
  trim?: string
  glow?: string
  trail?: string
  emblem?: string
  mark?: string
}

export interface ShipPaint {
  /** the ship's colours by palette index, with one tone up (surfaces turned to the sun), one down (turned away) and two down (in shade) */
  jet: Uint32Array
  jetLit: Uint32Array
  jetDim: Uint32Array
  jetDeep: Uint32Array
  /** its pixel flames, from the hottest to the coolest */
  flame: Uint32Array
  /** its wingtip trails, fresh to old (all 0: the sky's own) */
  trail: Uint32Array
}

// The source colours keep the art's palette before face lighting is applied.
const BODY = [84, 89, 105]
const ACCENT = [240, 88, 14]
const CANOPY = [30, 140, 160]
/** the trim, when none is chosen: bare steel, so parts stand out from the paint */
const STEEL = '#8e96a4'

/** palette entries a ship's paint has: eight families of sixteen (body, markings, glass, glow, trim, emblem, pattern, and the
 * fitted parts' own colours), and the empty 0 */
export const PAINT_N = 129

/** the fitted parts' own colours (polish step 8: a touch of each part's own, so it reads as what it is in flight), each in
 * four tones from dark to light: a missile's red tip, a mine's or a cargo pod's hazard yellow, a tractor's green, a laser's,
 * a scanner's or a shield's cyan (tools/voxel/parts.py OWN, jet/fit.ts PART_AT) */
const PART_COLOURS = [
  [118, 22, 26],
  [176, 36, 34],
  [226, 62, 48],
  [255, 128, 104],
  [128, 98, 10],
  [204, 160, 20],
  [248, 210, 40],
  [255, 240, 140],
  [24, 104, 34],
  [52, 168, 52],
  [104, 226, 80],
  [196, 255, 156],
  [16, 92, 120],
  [24, 160, 196],
  [72, 220, 240],
  [190, 250, 255],
]

/** a colour's sixteen tones: the eighth is the colour itself, darker below it, paler above */
function ramp(col: number[], t: number) {
  const f = (t + 1) / 9
  if (f <= 1) return [col[0] * f, col[1] * f, col[2] * f]
  const u = Math.min(1, (f - 1) / (16 / 9 - 1)) * 0.8
  return [col[0] + (255 - col[0]) * u, col[1] + (255 - col[1]) * u, col[2] + (255 - col[2]) * u]
}

/** The same paint on four faces. Steel catches a cool edge light, glass a sharper reflection. */
function hullShades(col: number[], glass: boolean) {
  const light = lum(col)
  const shine = Math.min(1, light / 108) * (glass ? 0.5 : 0.3)
  const bounce = Math.min(1, light / 152) * (glass ? 0.11 : 0.13)
  return [
    col.map((v, i) => v + (255 - v) * shine + [-3, 1, 5][i]),
    col.map((v, i) => v + (255 - v) * bounce + [-2, 0, 3][i]),
    col.map((v, i) => v * 0.78 + [0, 2, 8][i]),
    col.map((v, i) => v * 0.57 + [3, 4, 10][i]),
  ]
}

export function createPaint(): ShipPaint {
  return {
    jet: new Uint32Array(PAINT_N),
    jetLit: new Uint32Array(PAINT_N),
    jetDim: new Uint32Array(PAINT_N),
    jetDeep: new Uint32Array(PAINT_N),
    flame: new Uint32Array(6),
    trail: new Uint32Array(3),
  }
}

/** paints a ship: its hull's colours, recoloured family by family from the colours chosen */
export function paintShip(paint: ShipPaint, model: HullData, colours: ShipColours, tod: TimeOfDay) {
  const { palette: JET_PALETTE, keyTones: JET_KEY_TONES } = model
  paint.jet.fill(0)
  // recolour each family from its key tone
  const keys: Record<number, { key: number; col: number[]; def: number[] }> = {
    0: { key: JET_KEY_TONES[0], col: parseColor(colours.body, BODY), def: BODY },
    1: { key: JET_KEY_TONES[1], col: parseColor(colours.accent, ACCENT), def: ACCENT },
    2: { key: JET_KEY_TONES[2], col: parseColor(colours.canopy, CANOPY), def: CANOPY },
  }
  const keyLum: Record<number, number> = {}
  for (const row of JET_PALETTE) {
    const fam = row[4]
    if (fam < 3 && ((row[0] - 1) & 15) === keys[fam].key) keyLum[fam] = lum([row[1], row[2], row[3]])
  }
  const jetAmount = tod === 'sunset' ? 0.5 : tod === 'night' ? 0.16 : 0
  for (const row of JET_PALETTE) {
    const idx = row[0]
    const fam = row[4]
    let c = [row[1], row[2], row[3]]
    if (fam < 3) {
      const k = keys[fam]
      const same = k.col[0] === k.def[0] && k.col[1] === k.def[1] && k.col[2] === k.def[2]
      if (!same) {
        const l = lum(c)
        const kl = keyLum[fam] || 100
        if (l <= kl) {
          const f = l / kl
          c = [k.col[0] * f, k.col[1] * f, k.col[2] * f]
        } else {
          const f = (l - kl) / (255 - kl)
          c = [k.col[0] + (255 - k.col[0]) * f, k.col[1] + (255 - k.col[1]) * f, k.col[2] + (255 - k.col[2]) * f]
        }
      }
      const [lit, mid, dim, deep] = hullShades(c, fam === 2).map((tone) => {
        const [r, g, b] = grade(tone, tod, jetAmount)
        return pack(r, g, b)
      })
      paint.jetLit[idx] = lit
      paint.jet[idx] = mid
      paint.jetDim[idx] = dim
      paint.jetDeep[idx] = deep
    } else {
      // Lit exhaust apertures keep their own colour on faces turned away from the light.
      paint.jet[idx] = paint.jetLit[idx] = paint.jetDim[idx] = paint.jetDeep[idx] = pack(c[0], c[1], c[2])
    }
  }
  // the engines' glow, if one was chosen: the glow family takes it, keeping each tone's lightness against the hull's own glow
  const glow = colours.glow ? parseColor(colours.glow, model.glow) : null
  if (glow) {
    const gl = Math.max(1, lum(model.glow))
    for (const row of JET_PALETTE) {
      if (row[4] !== 3) continue
      const f = Math.min(1.6, lum([row[1], row[2], row[3]]) / gl)
      const c = f <= 1 ? glow.map((v) => v * f) : glow.map((v) => v + (255 - v) * (f - 1) * 1.6)
      paint.jet[row[0]] = paint.jetLit[row[0]] = paint.jetDim[row[0]] = paint.jetDeep[row[0]] = pack(c[0], c[1], c[2])
    }
  }
  // the trim's sixteen tones (fitted parts, the pattern): bare steel if none was chosen
  const trim = parseColor(colours.trim || STEEL, BODY)
  for (let t = 0; t < 16; t++) {
    const c = grade(ramp(trim, t), tod, jetAmount)
    paint.jet[65 + t] = pack(c[0], c[1], c[2])
  }
  // the emblem (the markings' colour, paled) and the side's mark (its colour)
  const emblem = parseColor(colours.emblem || colours.accent, ACCENT)
  const mark = parseColor(colours.mark || '#f2f2ee', [242, 242, 238])
  for (let t = 0; t < 16; t++) {
    const c = grade(ramp(t < 8 ? emblem : mark, t < 8 ? t + 3 : t - 4), tod, jetAmount)
    paint.jet[81 + t] = pack(c[0], c[1], c[2])
  }
  // the pattern (the polish pass: it was the trim's, steel unless one was chosen, and was lost on the hull): its own
  // sixteen tones, in the trim if one was chosen, else in the markings' colour, so it runs on from the hull's markings
  const pattern = parseColor(colours.trim || colours.accent, ACCENT)
  for (let t = 0; t < 16; t++) {
    const c = grade(ramp(pattern, t), tod, jetAmount)
    paint.jet[97 + t] = pack(c[0], c[1], c[2])
  }
  for (let t = 0; t < 16; t++) {
    const c = grade(PART_COLOURS[t], tod, jetAmount)
    paint.jet[113 + t] = pack(c[0], c[1], c[2])
  }
  for (let idx = 65; idx < PAINT_N; idx++) {
    // (the parts' own colours are four ramps of four: a tone's light and shade stay in its own colour)
    const t = idx >= 113 ? (idx - 1) & 3 : (idx - 1) & 15
    const top = idx >= 113 ? 3 : 15
    paint.jetLit[idx] = t < top ? paint.jet[idx + 1] : paint.jet[idx]
    paint.jetDim[idx] = t > 0 ? paint.jet[idx - 1] : paint.jet[idx]
    paint.jetDeep[idx] = t > 1 ? paint.jet[idx - 2] : paint.jetDim[idx]
  }
  flameRamp(paint.flame, glow ?? model.glow)
  // the trails: the colour chosen, paler while fresh (none chosen: the sky's own)
  if (colours.trail) {
    const tc = parseColor(colours.trail, [255, 255, 255])
    for (let i = 0; i < 3; i++) {
      const u = [0.55, 0.3, 0][i]
      const c = grade([tc[0] + (255 - tc[0]) * u, tc[1] + (255 - tc[1]) * u, tc[2] + (255 - tc[2]) * u], tod, jetAmount)
      paint.trail[i] = pack(c[0], c[1], c[2])
    }
  } else paint.trail.fill(0)
}

/** each ship paint's copy with its engines cold, and the colours it was made from (so it is made again when they change) */
const colds = new WeakMap<ShipPaint, { from: Uint32Array; cold: ShipPaint }>()

/**
 * A ship's paint with its engines cold (its power off: sim/power.ts): the glow family's tones as dark nozzle metal, each as
 * light against the others as it was, so the nozzles keep their shape. Made once for a paint, and again when it changes.
 */
export function coldPaintOf(paint: ShipPaint, model: HullData): ShipPaint {
  let c = colds.get(paint)
  if (c && c.from.every((v, i) => v === paint.jet[i])) return c.cold
  const cold = createPaint()
  cold.jet.set(paint.jet)
  cold.jetLit.set(paint.jetLit)
  cold.jetDim.set(paint.jetDim)
  cold.jetDeep.set(paint.jetDeep)
  cold.flame.set(paint.flame)
  cold.trail.set(paint.trail)
  for (const row of model.palette) {
    if (row[4] !== 3) continue
    const f = 0.45 + (lum([row[1], row[2], row[3]]) / 255) * 0.5
    const tone = (k: number) => pack(46 * f * k, 50 * f * k, 58 * f * k)
    cold.jet[row[0]] = tone(1)
    cold.jetLit[row[0]] = tone(1.25)
    cold.jetDim[row[0]] = tone(0.8)
    cold.jetDeep[row[0]] = tone(0.62)
  }
  c = { from: paint.jet.slice(), cold }
  colds.set(paint, c)
  return cold
}

/**
 * Pixel flames in a glow colour, from the hottest to the coolest: white-hot at the nozzle,
 * the glow's own colour in the body of the flame, and deeper and a little bluer towards the
 * tip. A pale, white-hot glow is given its colour back, so its flame is not grey.
 */
function flameRamp(ramp: Uint32Array, glow: number[]) {
  const [h, s] = hsv(glow[0], glow[1], glow[2])
  const sat = Math.max(s, 0.62)
  const tones: [number, number, number][] = [
    [h, 0.08, 1],
    [h, sat * 0.45, 1],
    [h, sat * 0.85, 1],
    [h + 8, Math.min(1, sat * 1.1), 0.86],
    [h + 16, Math.min(1, sat * 1.15), 0.6],
    [h + 26, Math.min(1, sat * 1.1), 0.34],
  ]
  tones.forEach(([th, ts, tv], i) => {
    const [r, g, b] = rgb(th, ts, tv)
    ramp[i] = pack(r, g, b)
  })
}

/** [r, g, b] 0..255 → [hue in degrees, saturation 0..1, value 0..1] */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const hi = Math.max(r, g, b)
  const lo = Math.min(r, g, b)
  const d = hi - lo
  let h = 0
  if (d > 0) h = hi === r ? ((g - b) / d) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, hi > 0 ? d / hi : 0, hi / 255]
}

/** [hue in degrees, saturation 0..1, value 0..1] → [r, g, b] 0..255 */
function rgb(h: number, s: number, v: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return 255 * v * (1 - s * Math.max(0, Math.min(k, 4 - k, 1)))
  }
  return [f(5), f(3), f(1)]
}
