// Continental: big landmasses with long mountain ranges, snow on the peaks, rivers running down
// to the coast, forests in the valleys. The ridges break line of sight for a ship flying low.
// After art/mockups/world-continental-3.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { clamp, hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import { castShadows, sunFor, facing, fillNoise, findSpawn, levelFor, noiseField, plantTrees, scatterClouds, TALLEST } from '../shape'
import { N, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0..3 the sea and the rivers)
const SAND = 4
const SAND_SPECK = 5
const GRASS = 6
const GRASS_DARK = 7
const GRASS_LIGHT = 8
const PINE_TOP = 9
const PINE = 10
const PINE_EDGE = 11
const ROCK = 12
const ROCK_DARK = 13
const ROCK_LIGHT = 14
const SNOW = 15
const SNOW_SHADE = 16
const MEADOW = 17
const SCRUB = 18
const ROCK_SHADOW = 19
const GRASS_SHADOW = 20
const SNOW_SHADOW = 21
const LEAF_TOP = 22
const LEAF = 23
const LEAF_EDGE = 24

// three palettes: temperate, autumn, and a blue-green alien one (top r g b, side r g b)
const TABLES: number[][][] = [
  [
    [30, 70, 138],
    [40, 92, 166],
    [62, 128, 196],
    [150, 200, 214],
    [226, 214, 166, 192, 172, 124],
    [210, 196, 148, 192, 172, 124],
    [92, 172, 74, 58, 118, 52],
    [74, 146, 66, 50, 104, 48],
    [126, 200, 92, 64, 130, 58],
    [52, 120, 84, 22, 66, 50],
    [34, 96, 70, 18, 58, 46],
    [22, 70, 56, 16, 50, 42],
    [140, 128, 118, 98, 88, 86],
    [114, 104, 100, 84, 76, 76],
    [176, 166, 152, 112, 102, 98],
    [244, 248, 252, 190, 204, 226],
    [210, 222, 240, 176, 190, 218],
    [150, 196, 86, 92, 130, 58],
    [96, 124, 70, 64, 88, 52],
    [84, 74, 78, 66, 58, 64],
    [50, 96, 62, 40, 76, 50],
    [150, 166, 204, 126, 140, 180],
    [118, 172, 70, 40, 92, 44],
    [80, 140, 58, 34, 80, 40],
    [52, 106, 50, 28, 66, 36],
  ],
  [
    [32, 66, 120],
    [42, 86, 146],
    [70, 120, 172],
    [160, 196, 206],
    [222, 206, 160, 186, 164, 118],
    [204, 188, 142, 186, 164, 118],
    [168, 160, 78, 116, 104, 52],
    [146, 132, 66, 100, 88, 46],
    [196, 186, 96, 128, 116, 58],
    [60, 104, 74, 26, 58, 44],
    [40, 84, 62, 20, 50, 40],
    [26, 62, 50, 16, 44, 36],
    [136, 120, 110, 96, 84, 80],
    [110, 96, 92, 80, 70, 70],
    [170, 156, 140, 108, 96, 90],
    [244, 246, 250, 190, 200, 222],
    [212, 220, 236, 176, 186, 214],
    [208, 176, 84, 136, 108, 52],
    [140, 104, 64, 96, 70, 46],
    [80, 68, 70, 62, 54, 58],
    [96, 86, 46, 74, 64, 38],
    [150, 160, 196, 126, 134, 172],
    [226, 128, 48, 140, 70, 34],
    [196, 86, 40, 120, 52, 30],
    [150, 60, 38, 92, 40, 28],
  ],
  [
    [24, 54, 112],
    [34, 76, 140],
    [52, 110, 170],
    [140, 196, 210],
    [214, 210, 180, 176, 168, 136],
    [198, 194, 164, 176, 168, 136],
    [70, 168, 132, 44, 112, 92],
    [54, 140, 116, 38, 98, 84],
    [104, 196, 156, 52, 124, 100],
    [108, 72, 140, 60, 40, 86],
    [84, 56, 118, 48, 32, 74],
    [62, 42, 96, 40, 28, 64],
    [128, 124, 132, 90, 86, 98],
    [104, 100, 112, 76, 72, 86],
    [164, 160, 166, 106, 102, 112],
    [240, 246, 252, 186, 200, 228],
    [206, 220, 242, 172, 188, 222],
    [138, 206, 150, 84, 130, 96],
    [82, 118, 108, 56, 84, 80],
    [76, 72, 92, 60, 56, 76],
    [40, 92, 84, 32, 72, 70],
    [146, 162, 206, 122, 136, 184],
    [146, 98, 176, 82, 56, 108],
    [116, 76, 150, 66, 44, 94],
    [86, 56, 120, 52, 36, 78],
  ],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [204, 228, 244],
    [128, 184, 232],
    [64, 128, 208],
  ],
  [
    [226, 226, 222],
    [156, 186, 220],
    [80, 122, 190],
  ],
  [
    [214, 236, 230],
    [128, 196, 210],
    [60, 120, 180],
  ],
]
export const continentalLooks: WorldLook[] = TABLES.map((t, i) => lookOf(t, { sky: SKIES[i], haze: SKIES[i][0].map((v) => v - 10) }))

export function buildContinental(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = continentalLooks[r.palette % 3]

  // the land: low cells dominate, so it comes in a few big pieces
  const C = noiseField(rnd, [
    [1024, 0.7],
    [512, 1],
    [256, 0.45],
    [128, 0.2],
    [64, 0.1],
    [32, 0.05],
    [16, 0.025],
  ])
  // the ranges: ridged noise (sharp along the crests), kept to long belts across the land
  const R = noiseField(rnd, [
    [256, 1],
    [128, 0.5],
    [64, 0.25],
    [32, 0.12],
    [16, 0.05],
  ])
  const belt = noiseField(rnd, [
    [512, 1],
    [256, 0.5],
  ])
  // the rivers: where a gentle field crosses its middle, in long winding lines
  const Q = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.25],
    [64, 0.08],
  ])
  const sea = levelFor(C, 1 - r.land)
  const relief = r.relief
  const top = 10 + Math.round(relief * 26) // the peaks' height above the plains, px

  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const e = C[o]
      const hs = hash8(o)
      const d = e - sea
      if (d < 0) {
        const dd = -d + (hs - 128) * 0.00004
        M[o] = dd > 0.07 ? 0 : dd > 0.03 ? 1 : dd > 0.008 ? 2 : 3
        H[o] = 0
        continue
      }
      if (d < 0.01) {
        M[o] = hs < 34 ? SAND_SPECK : SAND
        H[o] = 0
        continue
      }
      // inland: the plains rise gently; the ranges stand on them, away from the coast
      const inland = clamp((d - 0.01) * 9, 0, 1)
      const crest = 1 - Math.abs(R[o] * 2 - 1)
      const inBelt = clamp((belt[o] - 0.42) * 5, 0, 1)
      const mount = crest * crest * crest * crest * inBelt * inland
      const plain = clamp(d / (1 - sea), 0, 1)
      // a river: a thin line of water where Q crosses its middle, on the plains only
      const riv = Math.abs(Q[o] - 0.5)
      if (riv < 0.0035 + plain * 0.002 && mount < 0.18 && inland > 0.15) {
        M[o] = riv < 0.0018 ? 1 : riv < 0.0028 ? 2 : 3
        H[o] = 0
        continue
      }
      const hr = clamp(plain * 0.55 + mount * 1.15, 0, 1)
      // terraces: plains 2 px a step, hills 3, rock and snow 3
      const px = hr * (top + 8)
      let h = px < 14 ? 1 + ((px / 2) | 0) * 2 : 14 + (((px - 14) / 3) | 0) * 3
      if (riv < 0.007 && h > 2 && mount < 0.18) h = Math.max(1, h - 2) // (a valley along the river)
      H[o] = Math.min(TALLEST, h)
      const g = facing(C, x, y) * 6 + facing(R, x, y) * mount * 2
      const lit = g < -0.012
      const shaded = g > 0.012
      if (h >= top + 2 && mount > 0.35) M[o] = shaded ? SNOW_SHADE : SNOW
      else if (mount > 0.2 || h > 26) M[o] = lit ? ROCK_LIGHT : shaded ? ROCK_DARK : hs < 30 ? ROCK_DARK : ROCK
      else if (mount > 0.1) M[o] = shaded ? SCRUB : hs < 60 ? SCRUB : GRASS_DARK
      else if (plain > 0.22 && Q[o] > 0.58) M[o] = hs < 24 ? GRASS : MEADOW
      else M[o] = lit ? GRASS_LIGHT : shaded ? GRASS_DARK : hs < 22 ? GRASS_DARK : hs > 240 ? GRASS_LIGHT : GRASS
    }
  }

  // forests: pines on the foothills, broad leaves in the valleys
  const F = noiseField(rnd, [
    [256, 1],
    [64, 0.5],
    [16, 0.2],
  ])
  plantTrees(world, 5, [2, 3], (o, m, h) => (m === SCRUB || (m === GRASS_DARK && h > 8) ? (F[o] - 0.35) * 4 : 0), PINE_TOP, PINE, PINE_EDGE)
  plantTrees(
    world,
    5,
    [2, 3],
    (o, m, h) => ((m === GRASS || m === GRASS_LIGHT || m === GRASS_DARK) && h <= 8 ? (F[o] - 0.55) * 5 : 0),
    LEAF_TOP,
    LEAF,
    LEAF_EDGE,
    31,
  )

  // the mountains' shadows
  const shade = castShadows(H, ...sunFor(r.timeOfDay))
  for (let o = 0; o < N * N; o++) {
    if (!shade[o]) continue
    const m = M[o]
    if (m >= ROCK && m <= ROCK_LIGHT) M[o] = ROCK_SHADOW
    else if (m === SNOW || m === SNOW_SHADE) M[o] = SNOW_SHADOW
    else if (m === GRASS || m === GRASS_DARK || m === GRASS_LIGHT || m === MEADOW || m === SCRUB) M[o] = GRASS_SHADOW
  }

  scatterClouds(world, rnd, 210, 1.05, 0.04 + rnd() * 0.1)
  findSpawn(world, rnd)
}
