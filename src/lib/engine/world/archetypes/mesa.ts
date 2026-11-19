// Mesa: flat-topped tablelands standing out of a dusty plain, many of them, some with a second
// tier on top, their sheer cliffs banded in strata over a skirt of fallen rubble, and long
// shadows at their feet; buttes and spires between, dry riverbeds, scrub and the odd oasis
// below. Natural landing pads on top, and nowhere to hide up there. After
// art/mockups/world-mesa-3.png and world-mesa.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { clamp, hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import { castShadows, fillNoise, findSpawn, levelFor, noiseField, scatterClouds, sunFor, TALLEST } from '../shape'
import { N, NM, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0..3 the water of an oasis)
const PLAIN = 4
const PLAIN_DARK = 5
const PLAIN_LIGHT = 6
const RIVERBED = 7
const SCRUB = 8
const TOP = 9
const TOP_DARK = 10
const TOP_LIGHT = 11
const TALUS = 12
const PLAIN_SHADOW = 13
const TOP_SHADOW = 14
const TALUS_SHADOW = 15
const RIM_SHADE = 16
const SCRUB_SHADOW = 17

// three palettes: ochre (as the mockup), deep red, and a pale rose and lilac one (top r g b, side r g b)
const TABLES: number[][][] = [
  [
    [52, 112, 120],
    [68, 138, 140],
    [104, 170, 160],
    [214, 214, 184],
    [226, 160, 98, 190, 118, 78],
    [212, 142, 88, 190, 118, 78],
    [238, 180, 114, 200, 132, 86],
    [244, 206, 150, 210, 164, 110],
    [112, 132, 60, 78, 92, 44],
    [240, 196, 132, 178, 104, 86],
    [226, 176, 118, 160, 92, 80],
    [252, 222, 162, 196, 124, 90],
    [176, 112, 84, 128, 78, 66],
    [150, 88, 82, 118, 66, 68],
    [168, 116, 104, 126, 78, 76],
    [116, 70, 70, 92, 54, 58],
    [196, 140, 100, 150, 96, 80],
    [72, 82, 52, 60, 64, 44],
  ],
  [
    [46, 98, 118],
    [62, 124, 140],
    [98, 156, 160],
    [214, 200, 176],
    [204, 112, 72, 168, 80, 58],
    [188, 96, 64, 168, 80, 58],
    [220, 136, 88, 182, 94, 66],
    [234, 170, 118, 196, 130, 90],
    [100, 118, 56, 70, 82, 42],
    [226, 150, 98, 158, 74, 62],
    [208, 128, 86, 140, 64, 58],
    [244, 182, 124, 178, 92, 70],
    [150, 74, 58, 112, 52, 48],
    [128, 60, 60, 102, 46, 50],
    [148, 84, 76, 112, 56, 56],
    [98, 46, 52, 78, 38, 46],
    [178, 104, 74, 134, 70, 56],
    [64, 70, 46, 52, 54, 40],
  ],
  // (the rose and lilac one, deepened in polish step 9: its plain, mesas and sky had read as one pale mud)
  [
    [56, 92, 140],
    [74, 120, 164],
    [112, 158, 186],
    [226, 222, 228],
    [226, 168, 144, 180, 116, 112],
    [210, 150, 128, 180, 116, 112],
    [236, 186, 158, 192, 128, 118],
    [246, 212, 182, 206, 154, 136],
    [116, 138, 96, 84, 100, 72],
    [244, 206, 186, 170, 108, 122],
    [228, 184, 170, 150, 92, 112],
    [252, 228, 210, 190, 128, 132],
    [168, 102, 118, 120, 70, 94],
    [140, 86, 114, 104, 60, 90],
    [164, 112, 134, 116, 72, 100],
    [98, 58, 88, 72, 42, 72],
    [198, 146, 146, 150, 94, 108],
    [82, 92, 78, 66, 70, 62],
  ],
]
// the strata of the cliffs, from the plain up (3 px each)
const BANDS: number[][][] = [
  [
    [150, 82, 70],
    [178, 104, 80],
    [204, 128, 88],
    [136, 72, 76],
    [196, 120, 86],
    [226, 156, 104],
    [164, 92, 74],
    [214, 142, 94],
    [236, 176, 116],
    [184, 110, 82],
    [122, 66, 72],
    [206, 134, 90],
    [232, 168, 110],
    [170, 98, 78],
    [218, 150, 100],
    [244, 190, 128],
  ],
  [
    [124, 50, 50],
    [150, 64, 54],
    [178, 82, 62],
    [112, 46, 54],
    [168, 76, 60],
    [204, 110, 76],
    [138, 58, 54],
    [192, 96, 68],
    [218, 130, 88],
    [158, 70, 58],
    [102, 42, 50],
    [184, 88, 64],
    [212, 120, 82],
    [146, 62, 56],
    [198, 104, 72],
    [228, 146, 98],
  ],
  [
    [104, 60, 92],
    [150, 92, 116],
    [196, 126, 126],
    [120, 72, 104],
    [182, 112, 122],
    [230, 176, 160],
    [140, 84, 112],
    [212, 146, 138],
    [244, 204, 184],
    [164, 100, 118],
    [96, 56, 88],
    [200, 132, 130],
    [236, 188, 168],
    [150, 90, 114],
    [218, 158, 146],
    [248, 216, 196],
  ],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [244, 222, 190],
    [196, 196, 210],
    [98, 138, 200],
  ],
  [
    [246, 206, 172],
    [214, 172, 168],
    [118, 108, 172],
  ],
  [
    [246, 226, 214],
    [192, 170, 216],
    [78, 92, 188],
  ],
]
export const mesaLooks: WorldLook[] = TABLES.map((t, i) => {
  const strata: number[][] = []
  for (let z = 0; z < 48; z++) strata.push(BANDS[i][Math.floor(z / 3) % BANDS[i].length])
  // (the far mesas fade into the sky's middle colour, not its pale horizon: they had washed out to white; polish step 9)
  const haze = SKIES[i][0].map((v, k) => Math.round((v + SKIES[i][1][k]) / 2) - 16)
  const look = lookOf(t, { sky: SKIES[i], haze, strata, cloud: [1, 0.97, 0.94], flow: 0.6 })
  for (const m of [TOP, TOP_DARK, TOP_LIGHT, TOP_SHADOW, RIM_SHADE]) look.banded[m] = true
  return look
})

export function buildMesa(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = mesaLooks[r.palette % 3]

  // the tablelands: where this field is high (its fine octaves make their edges ragged); the
  // plain's swell and its riverbeds; patches on the tops
  const T = noiseField(rnd, [
    [256, 0.55],
    [128, 1],
    [64, 0.55],
    [32, 0.26],
    [16, 0.13],
    [8, 0.07],
  ])
  const P = noiseField(rnd, [
    [256, 1],
    [128, 0.5],
    [64, 0.25],
    [32, 0.12],
    [16, 0.06],
  ])
  const Q = noiseField(rnd, [
    [256, 1],
    [128, 0.6],
    [64, 0.25],
    [32, 0.1],
  ])
  const oasis = levelFor(P, 1 - r.land)
  const tier1 = levelFor(T, 0.7)
  const tier2 = levelFor(T, 0.9)
  const skirt = 0.018
  const h1 = 20 + Math.round(r.relief * 8)
  const h2 = Math.min(TALLEST - 4, h1 + 10 + Math.round(r.relief * 4))
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const hs = hash8(o)
      const e = T[o]
      if (e > tier2) {
        H[o] = h2
        M[o] = hs < 30 ? TOP_DARK : TOP
      } else if (e > tier1) {
        H[o] = h1
        M[o] = hs < 30 ? TOP_DARK : TOP
      } else if (e > tier1 - skirt) {
        // the rubble fallen at a cliff's foot, in a slope of two steps
        H[o] = e > tier1 - skirt * 0.45 ? 6 : 4
        M[o] = TALUS
      } else {
        const p = P[o]
        if (p < oasis) {
          const dd = oasis - p
          M[o] = dd > 0.03 ? 0 : dd > 0.015 ? 1 : dd > 0.004 ? 2 : 3
          H[o] = 0
          continue
        }
        // the plain: a low swell in steps, riverbeds sunk into it, scrub
        H[o] = 2 + 2 * Math.floor(clamp((p - oasis) * 3.2, 0, 0.99) * 2)
        const riv = Math.abs(Q[o] - 0.5)
        if (riv < 0.0045) {
          M[o] = RIVERBED
          H[o] = 1
        } else if (hs < 4) {
          M[o] = SCRUB
          H[o] += 1
        } else M[o] = p > 0.55 && hs < 120 ? PLAIN_LIGHT : p < 0.4 && hs < 120 ? PLAIN_DARK : PLAIN
      }
    }
  }

  // buttes and spires out on the plain, each on a skirt of its own rubble
  for (let i = 0; i < 260; i++) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    if (H[(cy << NSHIFT) | cx] > 6 || M[(cy << NSHIFT) | cx] < 4) continue
    const rad = 2 + rnd() * rnd() * 7
    const top = rnd() < 0.3 ? h2 : h1 - 4 + ((rnd() * 3) | 0) * 2
    const ri = Math.ceil(rad) + 3
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const o = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
        if (M[o] < 4) continue
        const d = Math.sqrt(dx * dx + dy * dy) + (hash8(o + 5) & 3) * 0.3
        if (d <= rad) {
          H[o] = top
          M[o] = TOP
        } else if (d <= rad + 2.5 && H[o] < 4) {
          H[o] = 4
          M[o] = TALUS
        }
      }
  }

  // the tops' rims: lit along the edge that faces the sun, darker along the far one
  const [sx, sy] = sunFor(r.timeOfDay)
  const ux = sx > 0 ? 1 : -1
  const uy = sy > 0 ? 1 : -1
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const m = M[o]
      if (m !== TOP && m !== TOP_DARK) continue
      const h = H[o]
      const toSun = H[(((y - uy * 2) & NM) << NSHIFT) | ((x - ux * 2) & NM)]
      const away = H[(((y + uy * 2) & NM) << NSHIFT) | ((x + ux * 2) & NM)]
      if (toSun < h - 3) M[o] = TOP_LIGHT
      else if (away < h - 3) M[o] = RIM_SHADE
    }
  }

  // long shadows at the cliffs' feet
  const shade = castShadows(H, sx, sy)
  for (let o = 0; o < N * N; o++) {
    if (!shade[o]) continue
    const m = M[o]
    if (m === TALUS) M[o] = TALUS_SHADOW
    else if (m === SCRUB) M[o] = SCRUB_SHADOW
    else if (m >= TOP && m <= TOP_LIGHT) M[o] = TOP_SHADOW
    else if (m >= 4 && m <= RIVERBED) M[o] = PLAIN_SHADOW
  }

  scatterClouds(world, rnd, 140, 0.9, rnd() * 0.25)
  findSpawn(world, rnd, 'low')
}
