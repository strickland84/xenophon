// Jungle: a carpet of tree crowns over low ground, murky swamps and brown rivers, and tall
// rock towers draped in vines standing out of the forest in clusters: cover to weave
// between, low down. Some jungles' swamps are acid, and burn a ship skimming them. After
// art/mockups/world-jungle-3.png and world-jungle.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { clamp, hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import { castShadows, sunFor, facing, fillNoise, findSpawn, levelFor, noiseField, plantTrees, scatterClouds, TALLEST } from '../shape'
import { N, NM, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0..3 swamp water)
const MUD = 4
const MUD_SPECK = 5
const GRASS = 6
const GRASS_DARK = 7
const GRASS_LIGHT = 8
const CROWN_A_TOP = 9
const CROWN_A = 10
const CROWN_A_EDGE = 11
const CROWN_B_TOP = 12
const CROWN_B = 13
const CROWN_B_EDGE = 14
const TOWER_TOP = 15
const TOWER = 16
const TOWER_DARK = 17
const VINE = 18
const GROUND_SHADOW = 19
const CROWN_SHADOW = 20
const CROWN_C_TOP = 21
const CROWN_C = 22
const CROWN_C_EDGE = 23

// three palettes: lime and green, a blue-green one, and a red-leafed alien one
const TABLES: number[][][] = [
  [
    [26, 62, 52],
    [40, 86, 60],
    [66, 112, 62],
    [112, 132, 70],
    [112, 74, 52, 84, 52, 40],
    [92, 58, 44, 84, 52, 40],
    [92, 172, 62, 54, 108, 44],
    [68, 142, 56, 44, 94, 40],
    [134, 206, 78, 66, 124, 46],
    [184, 236, 106, 70, 140, 50],
    [112, 198, 68, 40, 110, 44],
    [42, 122, 58, 22, 72, 40],
    [100, 192, 118, 36, 110, 70],
    [46, 142, 88, 24, 86, 60],
    [18, 84, 62, 10, 54, 46],
    [122, 180, 72, 196, 112, 70],
    [200, 114, 70, 168, 88, 62],
    [146, 70, 58, 120, 56, 50],
    [58, 140, 62, 40, 104, 50],
    [28, 72, 44, 22, 56, 38],
    [20, 74, 50, 14, 52, 40],
    [150, 220, 80, 62, 130, 48],
    [86, 176, 60, 36, 100, 42],
    [30, 104, 52, 18, 64, 38],
  ],
  [
    [22, 60, 64],
    [32, 84, 80],
    [54, 112, 92],
    [96, 140, 110],
    [100, 82, 60, 74, 58, 46],
    [84, 66, 50, 74, 58, 46],
    [70, 168, 110, 44, 106, 72],
    [52, 140, 96, 36, 92, 64],
    [110, 202, 140, 56, 120, 82],
    [140, 226, 170, 54, 132, 92],
    [72, 184, 128, 32, 104, 76],
    [26, 112, 88, 16, 66, 56],
    [96, 204, 200, 34, 116, 112],
    [40, 150, 150, 22, 90, 92],
    [14, 88, 96, 10, 56, 64],
    [96, 176, 120, 150, 120, 92],
    [154, 124, 96, 126, 98, 76],
    [104, 80, 66, 84, 64, 54],
    [48, 136, 96, 34, 100, 72],
    [24, 70, 60, 18, 54, 48],
    [16, 70, 64, 12, 50, 48],
    [170, 230, 120, 70, 130, 60],
    [96, 196, 96, 40, 110, 52],
    [32, 116, 70, 18, 70, 44],
  ],
  [
    [50, 40, 70],
    [70, 56, 92],
    [100, 82, 112],
    [150, 120, 130],
    [108, 66, 60, 80, 46, 44],
    [90, 54, 50, 80, 46, 44],
    [96, 150, 70, 58, 96, 48],
    [74, 124, 62, 48, 84, 44],
    [136, 186, 82, 70, 112, 50],
    [244, 132, 96, 150, 60, 50],
    [206, 84, 72, 124, 44, 46],
    [134, 44, 56, 82, 30, 40],
    [240, 186, 90, 140, 90, 44],
    [204, 134, 56, 120, 70, 36],
    [140, 82, 40, 86, 48, 30],
    [130, 160, 76, 190, 120, 90],
    [196, 126, 94, 164, 100, 80],
    [142, 84, 74, 116, 66, 60],
    [92, 140, 64, 64, 100, 50],
    [52, 46, 50, 40, 36, 40],
    [70, 30, 40, 50, 22, 32],
    [250, 206, 120, 150, 110, 56],
    [220, 150, 70, 130, 80, 40],
    [150, 92, 46, 90, 54, 32],
  ],
]
// acid swamps: green, and they glow a little
const ACID: number[][] = [
  [40, 110, 44],
  [76, 164, 40],
  [140, 214, 56],
  [214, 246, 120],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [214, 234, 212],
    [150, 202, 190],
    [76, 148, 170],
  ],
  [
    [210, 236, 228],
    [136, 204, 206],
    [62, 140, 176],
  ],
  [
    [236, 220, 214],
    [196, 170, 190],
    [118, 106, 168],
  ],
]
// the towers' rock, in bands (the vines hanging down them are their own columns, not bands)
const BANDS = [
  [196, 112, 70],
  [176, 92, 64],
  [210, 128, 80],
  [142, 82, 60],
  [186, 102, 66],
  [150, 74, 58],
  [206, 122, 76],
  [164, 96, 66],
]
export function jungleLook(palette: number, acid: boolean): WorldLook {
  const table = TABLES[palette % 3].map((c, m) => (acid && m < 4 ? ACID[m] : c))
  const strata: number[][] = []
  for (let z = 0; z < 48; z++)
    strata.push(BANDS[Math.floor(z / 3) % BANDS.length].map((v, k) => (palette % 3 === 1 ? [v * 0.8, v * 0.75, v * 0.7][k] : v)))
  const look = lookOf(table, {
    sky: SKIES[palette % 3],
    haze: SKIES[palette % 3][0].map((v) => v - 10),
    sea: acid ? 'acid' : 'water',
    flow: 0.4,
    spark: acid
      ? [
          [200, 255, 120],
          [240, 255, 200],
        ]
      : [
          [150, 180, 120],
          [210, 230, 180],
        ],
    foam: acid ? [220, 255, 150] : [170, 170, 120],
    strata,
    cloud: [0.98, 1, 0.97],
  })
  if (acid) for (let m = 0; m < 4; m++) look.glow[m] = 0.3
  for (const m of [TOWER_TOP, TOWER, TOWER_DARK]) look.banded[m] = true
  return look
}

export function buildJungle(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = jungleLook(r.palette, r.hazards.includes('acid'))

  const C = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.3],
    [64, 0.15],
    [32, 0.07],
    [16, 0.03],
  ])
  // rivers, clearings, and which trees grow where
  const Q = noiseField(rnd, [
    [512, 1],
    [256, 0.5],
    [128, 0.25],
    [64, 0.1],
  ])
  const G = noiseField(rnd, [
    [256, 1],
    [64, 0.5],
    [16, 0.2],
  ])
  const sea = levelFor(C, 1 - r.land)
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const hs = hash8(o)
      const d = C[o] - sea
      const riv = Math.abs(Q[o] - 0.5)
      if (d < 0 || (riv < 0.004 && d < 0.25)) {
        const dd = d < 0 ? -d : (0.004 - riv) * 4
        M[o] = dd > 0.05 ? 0 : dd > 0.02 ? 1 : dd > 0.006 ? 2 : 3
        H[o] = 0
        continue
      }
      // low ground: a few gentle terraces under the trees
      const hr = clamp(d / (1 - sea), 0, 1)
      H[o] = 1 + Math.floor(hr * 5) * 2
      const g = facing(C, x, y)
      if (d < 0.012 || riv < 0.007) M[o] = hs < 40 ? MUD_SPECK : MUD
      else M[o] = g < -0.006 ? GRASS_LIGHT : g > 0.006 ? GRASS_DARK : hs < 30 ? GRASS_DARK : GRASS
    }
  }

  // the towers, in clusters: steep rock, banded, with green on top
  const clusters = 26 + Math.round(r.relief * 24)
  for (let i = 0; i < clusters; i++) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    if (M[(cy << NSHIFT) | cx] < 4) continue
    const n = 2 + ((rnd() * 6) | 0)
    for (let k = 0; k < n; k++) {
      const tx = (cx + (rnd() - 0.5) * 120) | 0
      const ty = (cy + (rnd() - 0.5) * 120) | 0
      const rad = 6 + rnd() * 12
      const tall = Math.min(TALLEST - 4, 20 + Math.round(rnd() * 18 * r.relief + 6))
      const ri = Math.ceil(rad) + 3
      for (let dy = -ri; dy <= ri; dy++)
        for (let dx = -ri; dx <= ri; dx++) {
          const o = (((ty + dy) & NM) << NSHIFT) | ((tx + dx) & NM)
          // ragged at the edge
          const d2 = dx * dx + dy * dy + (hash8(o + 17) & 31) * 0.5
          if (d2 > rad * rad) continue
          const h = H[o] + tall - (d2 > rad * rad * 0.7 ? 3 : 0)
          if (h <= H[o]) continue
          H[o] = Math.min(TALLEST, h)
          const hs = hash8(o * 5)
          M[o] = d2 > rad * rad * 0.7 ? (hs < 120 ? VINE : TOWER) : hs < 40 ? TOWER_DARK : TOWER_TOP
        }
    }
  }

  // the canopy: crowns of three kinds, thick everywhere but the clearings
  plantTrees(
    world,
    4,
    [2, 4],
    (o, m) => (m >= GRASS && m <= GRASS_LIGHT && G[o] < 0.7 ? 0.95 : m === TOWER_TOP ? 0.6 : 0),
    CROWN_A_TOP,
    CROWN_A,
    CROWN_A_EDGE,
  )
  plantTrees(
    world,
    5,
    [3, 4],
    (o, m) => (G[o] < 0.45 && m !== MUD && m >= 4 && m < TOWER_TOP ? 0.8 : 0),
    CROWN_B_TOP,
    CROWN_B,
    CROWN_B_EDGE,
    77,
  )
  plantTrees(
    world,
    7,
    [2, 3],
    (o, m) => (G[o] > 0.55 && G[o] < 0.7 && m >= GRASS && m <= CROWN_A_EDGE ? 0.7 : 0),
    CROWN_C_TOP,
    CROWN_C,
    CROWN_C_EDGE,
    151,
  )

  const shade = castShadows(H, ...sunFor(r.timeOfDay))
  for (let o = 0; o < N * N; o++) {
    if (!shade[o]) continue
    const m = M[o]
    if (m >= GRASS && m <= GRASS_LIGHT) M[o] = GROUND_SHADOW
    else if (m >= CROWN_A_TOP && m <= CROWN_B_EDGE) M[o] = CROWN_SHADOW
    else if (m >= CROWN_C_TOP) M[o] = CROWN_SHADOW
  }

  scatterClouds(world, rnd, 240, 1.1, rnd() * 0.25)
  findSpawn(world, rnd)
}
