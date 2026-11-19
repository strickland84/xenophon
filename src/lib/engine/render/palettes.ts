// Every colour the renderer uses for the world, worked out ahead of time: the ground, the
// clouds, the sky, and where the sun is. Rebuilt when the time of day or the world changes.
// The world's look (world/look.ts) gives its colours by day; its sun's light tints them all.
// (Each ship's own colours are in paint.ts.)

import type { SceneParams, TimeOfDay } from '../params'
import { pack } from '../util/color'
import { STANDARD_LOOK } from '../world/look'
import type { RGB, WorldLook } from '../world/look'
import { NMAT } from '../world/materials'
import { APRON } from '../world/features'
import { mixRGB } from '../world/look'
import { CK, ZTOP } from '../world/world'

/** the thin sheets of cloud, in the order of their tones in `Palettes.sheet` */
export const SHEET_KINDS = ['cirrus', 'mackerel', 'veil'] as const

/** bands in the sky gradient */
export const NSKY = 8 // bands in the sky gradient

// the light that falls into the cockpit
export const SUN_DAY = pack(255, 246, 222)
export const SUN_SUNSET = pack(255, 170, 92)
export const SUN_NIGHT = pack(150, 190, 255)

export interface Palettes {
  /** the dark line drawn round a jet */
  outline: number
  /** the ground by material: tops and sides, in the light and in shadow */
  topLit: Uint32Array
  topShade: Uint32Array
  sideLit: Uint32Array
  sideShade: Uint32Array
  /** clouds by layer, and their underside */
  cloudTop: Uint32Array
  cloudSide: Uint32Array
  cloudUnder: number
  /** the thin sheets' tones (world/sky.ts), four a kind in SHEET_KINDS's order, from their thinnest edge to their thickest */
  sheet: Uint32Array
  /** wingtip trails from the newest to the oldest */
  trail: Uint32Array
  /** the sky from the horizon up, and the haze below it */
  sky: Uint32Array
  haze: number
  /** the sun or moon, and the glow round it */
  sun: number
  sunGlow: number
  /** glitter on the sea, and foam on the shore */
  sparkA: number
  sparkB: number
  foam: number
  /** which way shadows fall: the offset of a shadow per pixel of height */
  sunX: number
  sunY: number
  /** how fast the glitter on the sea moves (1: water) */
  flow: number
  /** per material: 1 where its sides are drawn in bands by height; and the bands, by height, lit and in shadow */
  banded: Uint8Array
  strataLit: Uint32Array
  strataShade: Uint32Array
  /** stars in the sky by day as well */
  starsByDay: boolean
  /** the dust a ship kicks up landing (r, g, b): the world's packed earth, or its ground */
  dust: number[]
}

export function createPalettes(): Palettes {
  return {
    outline: 0,
    topLit: new Uint32Array(NMAT),
    topShade: new Uint32Array(NMAT),
    sideLit: new Uint32Array(NMAT),
    sideShade: new Uint32Array(NMAT),
    cloudTop: new Uint32Array(CK),
    cloudSide: new Uint32Array(CK),
    cloudUnder: 0,
    sheet: new Uint32Array(SHEET_KINDS.length * 4),
    trail: new Uint32Array(3),
    sky: new Uint32Array(NSKY),
    haze: 0,
    sun: 0,
    sunGlow: 0,
    sparkA: 0,
    sparkB: 0,
    foam: 0,
    sunX: 0.45,
    sunY: 0.3,
    flow: 1,
    banded: new Uint8Array(NMAT),
    strataLit: new Uint32Array(ZTOP + 1),
    strataShade: new Uint32Array(ZTOP + 1),
    starsByDay: false,
    dust: [190, 170, 140],
  }
}

/** a colour under a light (a tint, 1 = white); none leaves it as it is */
const lit = (c: number[], light: RGB | null) => (light ? [c[0] * light[0], c[1] * light[1], c[2] * light[2]] : c)

/** the world's own sky colour (for the time of day, from its daylight one), or the standard */
function skyOf(own: RGB | null, standard: number[], tod: TimeOfDay): number[] {
  if (!own) return standard
  // at sunset and at night the world's own colour shows through the standard one
  const k = tod === 'day' ? 1 : tod === 'sunset' ? 0.45 : 0.3
  return [standard[0] + (own[0] - standard[0]) * k, standard[1] + (own[1] - standard[1]) * k, standard[2] + (own[2] - standard[2]) * k]
}

/** colour grading per time of day (amount 0..1) */
export function grade(c: number[], tod: TimeOfDay, amount: number): number[] {
  if (tod === 'day' || amount <= 0) return c
  let r: number, g: number, b: number
  if (tod === 'sunset') {
    r = 0.95 * c[0] + 0.1 * c[1] + 12
    g = 0.72 * c[1] + 0.05 * c[0] + 4
    b = 0.7 * c[2] + 0.08 * c[0] + 10
  } else {
    // moonlight: by how light a colour is, cool blue, darks dark and lights clear, a little of its own hue kept (polish step
    // 9: it was a third of each colour over a blue floor, every world at night purple grey on purple grey)
    const L = (0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]) / 255
    const v = Math.pow(L, 1.15)
    r = 4 + 82 * v + (c[0] - L * 255) * 0.16
    g = 9 + 112 * v + (c[1] - L * 255) * 0.16
    b = 24 + 168 * v + (c[2] - L * 255) * 0.12
  }
  return [c[0] + (r - c[0]) * amount, c[1] + (g - c[1]) * amount, c[2] + (b - c[2]) * amount]
}

/**
 * The world's colours for the time of day (each ship's own are in render/paint.ts): from its
 * look, under the light of its sun (`light`, a tint; null for plain white light).
 */
export function rebuildPalettes(pal: Palettes, p: SceneParams, look: WorldLook = STANDARD_LOOK, light: RGB | null = null) {
  const tod = p.timeOfDay
  // (white light changes nothing)
  if (light && light[0] === 1 && light[1] === 1 && light[2] === 1) light = null
  const oc = tod === 'night' ? [44, 64, 118] : grade([13, 15, 26], tod, 0.3)
  pal.outline = pack(oc[0], oc[1], oc[2])
  // world
  pal.topLit.fill(0)
  pal.topShade.fill(0)
  pal.sideLit.fill(0)
  pal.sideShade.fill(0)
  pal.banded.fill(0)
  for (let m = 0; m < Math.min(NMAT, look.top.length); m++) {
    // (what glows keeps its own light at sunset and at night, and in a cloud's shadow)
    const glow = look.glow[m]
    const t = lit(grade(look.top[m], tod, 1 - glow), glow > 0 ? null : light)
    const s = lit(grade(look.side[m], tod, 1 - glow), glow > 0 ? null : light)
    // (in shade: at night deeper, so the moonlit sides of things stand out; polish step 9)
    const night = tod === 'night'
    const kr = glow > 0 ? 1 - 0.38 * (1 - glow * 0.7) : night ? 0.5 : 0.62
    const kg = glow > 0 ? 1 - 0.33 * (1 - glow * 0.7) : night ? 0.55 : 0.67
    const kb = glow > 0 ? 1 - 0.2 * (1 - glow * 0.7) : night ? 0.7 : 0.8
    pal.topLit[m] = pack(t[0], t[1], t[2])
    pal.sideLit[m] = pack(s[0], s[1], s[2])
    pal.topShade[m] = pack(t[0] * kr, t[1] * kg, t[2] * kb)
    pal.sideShade[m] = pack(s[0] * kr, s[1] * kg, s[2] * kb)
    pal.banded[m] = look.banded[m] ? 1 : 0
  }
  for (let z = 0; z <= ZTOP; z++) {
    const c = look.strata[Math.min(z, look.strata.length - 1)] ?? [0, 0, 0]
    const t = lit(grade(c, tod, 1), light)
    pal.strataLit[z] = pack(t[0], t[1], t[2])
    pal.strataShade[z] = pack(t[0] * 0.62, t[1] * 0.67, t[2] * 0.8)
  }
  pal.flow = look.flow
  // (a world with features has packed earth; the island world its sand)
  const dustOf = look.top[APRON] ?? look.top[4] ?? [190, 170, 140]
  pal.dust = lit(grade(mixRGB(dustOf, [242, 234, 220], 0.55), tod, 0.8), light)
  pal.starsByDay = look.starsByDay
  const cl = look.cloud
  for (let k = 0; k < CK; k++) {
    const f = k / (CK - 1)
    const ft = Math.min(1, k / 2)
    const ca = tod === 'night' ? 0.72 : 1
    const t = lit(grade([(218 + 37 * ft) * cl[0], (230 + 25 * ft) * cl[1], (247 + 8 * ft) * cl[2]], tod, ca), light)
    const s = lit(grade([(158 + 44 * f) * cl[0], (182 + 36 * f) * cl[1], (222 + 18 * f) * cl[2]], tod, ca), light)
    pal.cloudTop[k] = pack(t[0], t[1], t[2])
    pal.cloudSide[k] = pack(s[0], s[1], s[2])
  }
  const own = (c: RGB | null, standard: number[]) => (c ? lit(grade(c, tod, tod === 'night' ? 0.7 : 1), light) : standard)
  const sa = own(look.spark?.[0] ?? null, tod === 'sunset' ? [255, 170, 110] : tod === 'night' ? [70, 110, 190] : [120, 190, 236])
  const sb = own(look.spark?.[1] ?? null, tod === 'sunset' ? [255, 226, 170] : tod === 'night' ? [170, 200, 240] : [236, 250, 255])
  const fm = own(look.foam, tod === 'sunset' ? [255, 226, 214] : tod === 'night' ? [110, 140, 200] : [240, 252, 255])
  pal.sparkA = pack(sa[0], sa[1], sa[2])
  pal.sparkB = pack(sb[0], sb[1], sb[2])
  pal.foam = pack(fm[0], fm[1], fm[2])
  const tr = [grade([255, 255, 255], tod, 0.8), grade([214, 232, 250], tod, 0.8), grade([170, 204, 240], tod, 0.8)]
  for (let i = 0; i < 3; i++) pal.trail[i] = pack(tr[i][0], tr[i][1], tr[i][2])
  // sky: from the horizon up
  const sk = look.sky
  const skyA = skyOf(sk?.[0] ?? null, tod === 'sunset' ? [255, 198, 132] : tod === 'night' ? [36, 56, 110] : [198, 232, 250], tod)
  const skyM = skyOf(sk?.[1] ?? null, tod === 'sunset' ? [238, 122, 130] : tod === 'night' ? [18, 28, 70] : [122, 190, 240], tod)
  const skyB = skyOf(sk?.[2] ?? null, tod === 'sunset' ? [84, 68, 150] : tod === 'night' ? [7, 10, 34] : [62, 142, 222], tod)
  for (let i = 0; i < NSKY; i++) {
    const f = i / (NSKY - 1)
    const a = f < 0.5 ? skyA : skyM
    const b = f < 0.5 ? skyM : skyB
    const g = f < 0.5 ? f * 2 : f * 2 - 1
    pal.sky[i] = pack(a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g, a[2] + (b[2] - a[2]) * g)
  }
  const hz = skyOf(look.haze, tod === 'sunset' ? [250, 182, 134] : tod === 'night' ? [28, 44, 92] : [188, 224, 246], tod)
  pal.haze = pack(hz[0], hz[1], hz[2])
  // (undersides take a third of the sky's own colour, so far off they read as cloud against it, not as specks of blue)
  const cu0 = lit(grade([138 * cl[0], 160 * cl[1], 200 * cl[2]], tod, tod === 'night' ? 0.72 : 1), light)
  const cu = [0, 1, 2].map((i) => cu0[i] + (hz[i] - cu0[i]) * 0.34)
  pal.cloudUnder = pack(cu[0], cu[1], cu[2])
  // the thin sheets, edge to thickest: white high ice by day; at sunset lit from below, gold over rose (art/mockups/skies.png);
  // by moonlight cool; a veil grey
  for (let i = 0; i < SHEET_KINDS.length; i++) {
    const kind = SHEET_KINDS[i]
    const day =
      kind === 'veil'
        ? [
            [168, 178, 198],
            [182, 190, 208],
            [196, 204, 220],
            [212, 218, 230],
          ]
        : kind === 'cirrus'
          ? [
              [200, 218, 242],
              [218, 232, 250],
              [236, 244, 254],
              [252, 254, 255],
            ]
          : [
              [178, 196, 228],
              [204, 218, 242],
              [228, 236, 250],
              [248, 250, 255],
            ]
    const dusk =
      kind === 'veil'
        ? [
            [150, 112, 130],
            [176, 128, 136],
            [204, 150, 144],
            [226, 176, 156],
          ]
        : [
            [196, 104, 132],
            [236, 138, 134],
            [252, 182, 140],
            [255, 222, 160],
          ]
    for (let t = 0; t < 4; t++) {
      const d = day[t]
      const base = tod === 'sunset' ? dusk[t] : grade(d, tod, tod === 'night' ? 0.85 : 1)
      const c = lit([base[0] * cl[0], base[1] * cl[1], base[2] * cl[2]], light)
      pal.sheet[i * 4 + t] = pack(c[0], c[1], c[2])
    }
  }
  const sc2 = tod === 'night' ? [232, 238, 255] : [255, 244, 200]
  const sg = tod === 'night' ? [70, 96, 160] : [255, 222, 150]
  pal.sun = pack(sc2[0], sc2[1], sc2[2])
  pal.sunGlow = pack(sg[0], sg[1], sg[2])
  if (tod === 'sunset') {
    pal.sunX = 0.95
    pal.sunY = 0.5
  } else if (tod === 'night') {
    pal.sunX = 0.3
    pal.sunY = 0.42
  } else {
    pal.sunX = 0.5
    pal.sunY = 0.32
  }
}
