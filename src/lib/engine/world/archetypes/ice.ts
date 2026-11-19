// Ice: snowfields and glaciers on rocky mountains, cut by deep fjords of dark water; the sea
// is frozen into floes with black cracks between them. Long sight lines when it is clear;
// whiteouts when it snows. After art/mockups/world-ice-3.png and world-ice.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { clamp, hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import {
  castShadows,
  cellGap,
  facing,
  fillNoise,
  findSpawn,
  levelFor,
  makeCells,
  noiseField,
  scatterClouds,
  sunFor,
  TALLEST,
} from '../shape'
import { N, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0..3 open water, dark under the ice)
const SNOW = 4
const SNOW_LIT = 5
const SNOW_SHADE = 6
const GLACIER = 7
const GLACIER_DARK = 8
const ROCK = 9
const ROCK_DARK = 10
const FLOE = 11
const FLOE_DARK = 12
const SNOW_SHADOW = 13
const ROCK_SHADOW = 14
const FLOE_SHADOW = 15
const STONE = 16

// three palettes: blue-white, a greener polar one, and a violet dusk one
const TABLES: number[][][] = [
  [
    [18, 38, 100],
    [30, 64, 136],
    [54, 100, 164],
    [184, 214, 234],
    [234, 242, 250, 176, 200, 232],
    [252, 254, 255, 190, 210, 238],
    [204, 220, 242, 164, 186, 224],
    [168, 222, 242, 116, 176, 216],
    [136, 192, 228, 98, 150, 200],
    [96, 104, 124, 64, 70, 90],
    [70, 76, 96, 48, 52, 70],
    [222, 244, 250, 140, 192, 224],
    [196, 228, 244, 124, 176, 214],
    [168, 188, 226, 140, 160, 208],
    [50, 54, 74, 40, 42, 60],
    [160, 200, 228, 118, 160, 204],
    [40, 44, 58, 30, 32, 44],
  ],
  [
    [16, 48, 80],
    [26, 76, 108],
    [46, 112, 136],
    [184, 222, 222],
    [230, 244, 242, 172, 206, 214],
    [250, 255, 254, 188, 216, 222],
    [200, 226, 230, 160, 194, 208],
    [150, 226, 222, 100, 180, 190],
    [118, 196, 200, 84, 150, 168],
    [92, 108, 112, 60, 72, 78],
    [66, 80, 86, 44, 54, 60],
    [218, 246, 244, 134, 198, 204],
    [190, 232, 232, 118, 182, 192],
    [160, 196, 206, 132, 168, 184],
    [46, 58, 62, 36, 44, 50],
    [150, 204, 210, 110, 166, 180],
    [38, 48, 52, 28, 34, 38],
  ],
  [
    [30, 32, 96],
    [46, 56, 132],
    [76, 92, 168],
    [200, 200, 236],
    [236, 236, 250, 186, 184, 230],
    [252, 250, 255, 200, 196, 238],
    [212, 210, 242, 172, 168, 222],
    [190, 206, 246, 136, 156, 222],
    [158, 176, 232, 112, 128, 204],
    [108, 98, 130, 72, 64, 96],
    [80, 72, 104, 54, 48, 76],
    [230, 236, 252, 160, 172, 228],
    [206, 214, 246, 142, 154, 218],
    [178, 172, 228, 150, 144, 210],
    [58, 50, 82, 44, 38, 64],
    [176, 186, 232, 132, 142, 208],
    [46, 40, 64, 34, 30, 50],
  ],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [226, 238, 248],
    [168, 204, 238],
    [96, 144, 214],
  ],
  [
    [224, 242, 238],
    [160, 210, 220],
    [80, 150, 190],
  ],
  [
    [236, 230, 246],
    [184, 184, 236],
    [110, 118, 210],
  ],
]
export const iceLooks: WorldLook[] = TABLES.map((t, i) =>
  lookOf(t, {
    sky: SKIES[i],
    haze: SKIES[i][0].map((v) => v - 8),
    flow: 0.25,
    cloud: [0.98, 1, 1.02],
    sea: 'water',
    spark: [
      [220, 240, 255],
      [255, 255, 255],
    ],
    foam: [236, 246, 252],
  }),
)

export function buildIce(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = iceLooks[r.palette % 3]

  const C = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.32],
    [64, 0.16],
    [32, 0.08],
    [16, 0.04],
  ])
  const R = noiseField(rnd, [
    [256, 1],
    [128, 0.5],
    [64, 0.25],
    [32, 0.12],
  ])
  // the fjords' courses, and how much of the sea is frozen
  const F = noiseField(rnd, [
    [256, 1],
    [128, 0.5],
    [64, 0.2],
  ])
  const pack = noiseField(rnd, [
    [512, 1],
    [128, 0.4],
  ])
  const sea = levelFor(C, 1 - r.land)
  const packAt = levelFor(pack, 0.25)
  const top = 14 + Math.round(r.relief * 26)
  // the floes: cells of the sea ice, 64 px apart
  const floes = makeCells(6, r.seed & 0xffff)

  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const hs = hash8(o)
      const d = C[o] - sea
      // a fjord: a narrow arm of the sea reaching up between the mountains from the coast
      const fj = Math.abs(F[o] - 0.5)
      const fjord = d >= 0 && d < 0.09 && fj < 0.012 * (1 - d / 0.09) + 0.002
      if (d < 0 || fjord) {
        // the sea: frozen floes, cracked apart, or open water
        H[o] = 0
        const depth = fjord ? 0.05 : -d
        let open = fjord || pack[o] < packAt
        if (!open) {
          // a crack between cells, a floe within one (and now and then a cell of open water)
          const gap = cellGap(floes, x, y)
          const near = floes.near
          if (gap < 1.6 + (near & 3) * 0.6 || near < 40) open = true
          else {
            H[o] = 1 + ((near >> 2) & 1)
            M[o] = gap < 3 ? FLOE_DARK : hs < 12 ? FLOE_DARK : FLOE
          }
        }
        if (open) M[o] = depth > 0.06 ? 0 : depth > 0.025 ? 1 : depth > 0.006 ? 2 : 3
        continue
      }
      const crest = 1 - Math.abs(R[o] * 2 - 1)
      const inland = clamp(d * 7, 0, 1)
      const hr = clamp(inland * 0.45 + crest * crest * crest * inland * 0.8, 0, 1)
      // cliffs at the coast: the land rises at once from the water
      const px = 4 + hr * top
      const h = Math.min(TALLEST, 3 * Math.floor(px / 3))
      H[o] = h
      const g = facing(C, x, y) * 5 + facing(R, x, y) * crest * 1.5
      // bare rock on the crests and the steepest slopes, where snow will not lie
      if ((crest > 0.8 && hr > 0.5) || Math.abs(g) > 0.09) M[o] = g > 0 ? ROCK_DARK : ROCK
      else if (crest < 0.42 && hr > 0.12 && hr < 0.6) M[o] = g > 0.006 ? GLACIER_DARK : GLACIER
      else M[o] = g < -0.008 ? SNOW_LIT : g > 0.008 ? SNOW_SHADE : hs < 1 ? STONE : SNOW
    }
  }

  const shade = castShadows(H, ...sunFor(r.timeOfDay))
  for (let o = 0; o < N * N; o++) {
    if (!shade[o]) continue
    const m = M[o]
    if (m === ROCK || m === ROCK_DARK || m === STONE) M[o] = ROCK_SHADOW
    else if (m === FLOE || m === FLOE_DARK) M[o] = FLOE_SHADOW
    else if (m >= 4) M[o] = SNOW_SHADOW
  }

  scatterClouds(world, rnd, 230, 1.15, rnd() * 0.25)
  findSpawn(world, rnd)
}
