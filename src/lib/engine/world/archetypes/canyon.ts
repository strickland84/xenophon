// Canyon: a high red desert cut by deep, narrow, winding canyons, their walls stepped down in
// shelves and banded like layered sandstone, a thin river at the bottom. A ship can drop into
// one and be chased along it; from above, a canyon is an ambush. After
// art/mockups/world-canyon-3.png and world-canyon.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { clamp, hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import { castShadows, sunFor, facing, fillNoise, findSpawn, noiseField, scatterClouds, TALLEST } from '../shape'
import { N, NM, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0..3 the river)
const FLOOR = 4
const FLOOR_SPECK = 5
const PLATEAU = 6
const PLATEAU_DARK = 7
const PLATEAU_LIGHT = 8
const SHELF = 9
const SHELF_DARK = 10
const BOULDER = 11
const FLOOR_SHADOW = 12
const PLATEAU_SHADOW = 13
const SHELF_SHADOW = 14
const DUNE = 15
const SCRUB = 16

// three palettes: red sandstone, ochre, and a dun badland striped rust and charcoal (top r g b, side r g b)
const TABLES: number[][][] = [
  [
    [40, 78, 98],
    [52, 98, 114],
    [80, 128, 134],
    [176, 164, 144],
    [226, 160, 104, 186, 110, 76],
    [210, 140, 92, 186, 110, 76],
    [238, 154, 88, 202, 92, 66],
    [224, 132, 82, 190, 80, 62],
    [248, 196, 126, 210, 110, 72],
    [210, 104, 78, 170, 66, 60],
    [190, 80, 62, 150, 52, 56],
    [122, 52, 70, 90, 30, 52],
    [108, 34, 60, 80, 24, 50],
    [168, 82, 74, 120, 50, 58],
    [140, 52, 62, 100, 36, 54],
    [252, 212, 146, 220, 150, 96],
    [112, 120, 62, 80, 84, 46],
  ],
  [
    [44, 86, 104],
    [58, 106, 118],
    [88, 136, 138],
    [190, 178, 144],
    [222, 182, 112, 178, 132, 80],
    [206, 164, 98, 178, 132, 80],
    [226, 178, 96, 184, 122, 64],
    [210, 158, 86, 170, 108, 60],
    [242, 212, 140, 196, 140, 76],
    [196, 132, 72, 152, 92, 54],
    [172, 108, 60, 132, 76, 48],
    [110, 76, 56, 80, 52, 42],
    [96, 60, 52, 72, 44, 40],
    [160, 112, 70, 116, 78, 52],
    [124, 80, 56, 92, 58, 44],
    [248, 226, 160, 210, 170, 100],
    [100, 120, 60, 70, 84, 44],
  ],
  [
    [38, 88, 96],
    [50, 108, 112],
    [78, 140, 136],
    [180, 176, 150],
    [150, 126, 104, 118, 94, 80],
    [138, 114, 94, 118, 94, 80],
    [182, 156, 126, 150, 104, 78],
    [168, 142, 116, 136, 92, 72],
    [204, 180, 146, 170, 124, 88],
    [178, 104, 66, 140, 76, 54],
    [156, 86, 58, 122, 64, 50],
    [92, 70, 62, 70, 52, 48],
    [96, 74, 72, 74, 56, 58],
    [134, 108, 96, 100, 78, 72],
    [118, 74, 58, 92, 56, 48],
    [214, 192, 156, 180, 140, 104],
    [104, 112, 70, 76, 82, 52],
  ],
]
// the cliff bands, from the canyon floor up (3 px each)
const BANDS: number[][][] = [
  [
    [150, 52, 56],
    [176, 62, 54],
    [204, 86, 62],
    [226, 116, 76],
    [196, 74, 60],
    [240, 160, 92],
    [214, 100, 70],
    [250, 200, 128],
    [182, 66, 58],
    [230, 132, 80],
    [244, 176, 104],
    [206, 92, 66],
    [236, 150, 88],
    [222, 120, 78],
    [248, 190, 116],
    [212, 104, 72],
  ],
  [
    [132, 82, 54],
    [156, 100, 60],
    [184, 124, 70],
    [204, 150, 84],
    [172, 110, 62],
    [222, 176, 100],
    [190, 132, 72],
    [236, 200, 128],
    [160, 100, 58],
    [214, 162, 92],
    [230, 190, 116],
    [182, 122, 68],
    [220, 170, 98],
    [198, 140, 78],
    [234, 196, 122],
    [188, 128, 72],
  ],
  [
    [84, 62, 58],
    [150, 82, 52],
    [190, 112, 62],
    [214, 188, 150],
    [120, 70, 52],
    [226, 150, 84],
    [98, 74, 66],
    [236, 210, 168],
    [168, 94, 56],
    [204, 132, 72],
    [112, 84, 72],
    [222, 172, 112],
    [140, 78, 54],
    [230, 198, 154],
    [182, 104, 60],
    [92, 68, 62],
  ],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [246, 214, 178],
    [212, 164, 150],
    [128, 108, 164],
  ],
  [
    [240, 226, 190],
    [196, 186, 170],
    [110, 128, 170],
  ],
  [
    [236, 218, 190],
    [196, 176, 160],
    [112, 110, 150],
  ],
]
export const canyonLooks: WorldLook[] = TABLES.map((t, i) => {
  const strata: number[][] = []
  for (let z = 0; z < 48; z++) strata.push(BANDS[i][Math.floor(z / 3) % BANDS[i].length])
  const look = lookOf(t, { sky: SKIES[i], haze: SKIES[i][0].map((v) => v - 12), strata, cloud: [1, 0.95, 0.9], sea: 'water' })
  for (const m of [PLATEAU, PLATEAU_DARK, PLATEAU_LIGHT, SHELF, SHELF_DARK, PLATEAU_SHADOW, SHELF_SHADOW, DUNE]) look.banded[m] = true
  return look
})

export function buildCanyon(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = canyonLooks[r.palette % 3]

  // the desert's swell, and the canyons' courses: where these fields cross their middles
  const P = noiseField(rnd, [
    [256, 1],
    [128, 0.5],
    [32, 0.25],
    [16, 0.12],
    [8, 0.05],
  ])
  const A = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.3],
    [64, 0.12],
  ])
  const B = noiseField(rnd, [
    [256, 1],
    [128, 0.6],
    [64, 0.2],
  ])
  const Wd = noiseField(rnd, [
    [256, 1],
    [64, 0.4],
  ])
  const rim = 22 + Math.round(r.relief * 14) // the plateau's height, px
  // how wide the canyons are, from the share of land the recipe asks for (the river is the rest)
  const wide = 0.07 + (1 - r.land) * 0.6
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const hs = hash8(o)
      // 0 in a canyon's middle, 1 at its rim and beyond (ragged at the edges)
      const wa = wide * (0.7 + Wd[o] * 0.7)
      const ta = Math.abs(A[o] - 0.5) / wa
      const tb = Math.abs(B[o] - 0.5) / (wa * 0.55)
      const t = clamp(Math.min(ta, tb * (1.25 - Wd[o] * 0.5)) + (P[o] - 0.5) * 0.18, 0, 1.5)
      const swell = (P[o] - 0.5) * 8
      if (t < 0.12) {
        // the river
        M[o] = t < 0.05 ? 0 : t < 0.08 ? 1 : t < 0.1 ? 2 : 3
        H[o] = 0
        continue
      }
      // the walls step down in shelves: rim, upper shelf, lower shelf, floor
      const f = t < 0.24 ? 0.06 : t < 0.42 ? 0.32 : t < 0.66 ? 0.58 : t < 0.86 ? 0.8 : 1
      let h: number
      if (f === 1) h = rim + 2 * Math.round(swell / 2)
      else h = Math.round(rim * f)
      h = clamp(h, 1, TALLEST)
      H[o] = h
      const g = facing(P, x, y)
      if (f === 0.06) M[o] = hs < 30 ? FLOOR_SPECK : FLOOR
      else if (f < 1) M[o] = hs < 50 ? SHELF_DARK : SHELF
      else {
        // the plateau: dunes in long lines, and its swell lit and shaded
        const dune = (P[o] * 40) % 1
        M[o] = dune < 0.08 && g < 0 ? DUNE : g < -0.01 ? PLATEAU_LIGHT : g > 0.01 ? PLATEAU_DARK : hs < 20 ? PLATEAU_DARK : PLATEAU
      }
    }
  }

  // buttes on the plateau, and boulders and scrub everywhere
  for (let i = 0; i < 70; i++) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    const base = H[(cy << NSHIFT) | cx]
    if (base < rim - 4) continue
    const rad = 5 + rnd() * 14
    const up = 5 + ((rnd() * 3) | 0) * 3
    const ri = Math.ceil(rad) + 2
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const o = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
        const d2 = dx * dx + dy * dy + (hash8(o + 5) & 15) * 0.6
        if (d2 > rad * rad || H[o] < rim - 4) continue
        H[o] = Math.min(TALLEST, base + up)
        M[o] = d2 < rad * rad * 0.5 ? PLATEAU : PLATEAU_LIGHT
      }
  }
  for (let o = 0; o < N * N; o++) {
    const m = M[o]
    if (m < 4) continue
    const hs = hash8(o * 7 + 3)
    if (hs < 1 && hash8(o + 77) < 100) {
      M[o] = BOULDER
      H[o] = Math.min(TALLEST, H[o] + 1)
    } else if (hs < 3 && (m === FLOOR || m === PLATEAU)) M[o] = SCRUB
  }

  // the canyons in shadow
  const shade = castShadows(H, ...sunFor(r.timeOfDay))
  for (let o = 0; o < N * N; o++) {
    if (!shade[o]) continue
    const m = M[o]
    if (m === FLOOR || m === FLOOR_SPECK || m === SCRUB) M[o] = FLOOR_SHADOW
    else if (m === SHELF || m === SHELF_DARK) M[o] = SHELF_SHADOW
    else if (m >= PLATEAU && m <= PLATEAU_LIGHT) M[o] = PLATEAU_SHADOW
  }

  scatterClouds(world, rnd, 120, 0.8, rnd() * 0.25)
  findSpawn(world, rnd, 'low')
}
