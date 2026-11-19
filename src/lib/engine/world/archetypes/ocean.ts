// Ocean: open sea from edge to edge, deep blue with darker trenches, and here and there an oval
// ring of an atoll round a turquoise lagoon, broken by channels, or a small green islet. Little to hide behind but
// cloud; land is precious. After art/mockups/world-ocean-3.png and world-ocean.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import { blur, fillNoise, findSpawn, noiseField, plantTrees, scatterClouds, TALLEST } from '../shape'
import { N, NM, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0 the deeps, 1 open sea, 2 lagoons and shallows, 3 surf)
const SAND = 4
const SAND_SPECK = 5
const GRASS = 6
const GRASS_DARK = 7
const PALM_TOP = 8
const PALM = 9
const PALM_EDGE = 10
const ROCK = 11
const ROCK_DARK = 12

// three palettes: deep blue, a green-teal sea, and a violet one
const TABLES: number[][][] = [
  [
    [16, 40, 128],
    [30, 74, 180],
    [44, 186, 196],
    [234, 250, 244],
    [244, 230, 180, 212, 190, 132],
    [230, 212, 160, 212, 190, 132],
    [104, 204, 104, 56, 136, 64],
    [70, 166, 86, 44, 114, 58],
    [150, 226, 96, 62, 140, 56],
    [70, 168, 74, 34, 106, 52],
    [32, 116, 64, 20, 76, 46],
    [128, 116, 104, 92, 82, 78],
    [100, 90, 84, 76, 66, 64],
  ],
  [
    [12, 60, 96],
    [22, 98, 132],
    [56, 196, 170],
    [228, 250, 236],
    [238, 232, 196, 206, 196, 150],
    [222, 214, 176, 206, 196, 150],
    [120, 196, 92, 64, 130, 56],
    [86, 160, 76, 50, 110, 50],
    [176, 228, 104, 70, 140, 56],
    [86, 170, 66, 40, 108, 46],
    [40, 120, 56, 24, 78, 40],
    [120, 120, 108, 88, 86, 80],
    [96, 94, 86, 72, 70, 66],
  ],
  [
    [36, 30, 112],
    [56, 60, 168],
    [90, 160, 214],
    [236, 236, 252],
    [240, 220, 220, 206, 176, 186],
    [226, 202, 206, 206, 176, 186],
    [96, 196, 150, 52, 128, 100],
    [64, 160, 128, 40, 108, 90],
    [210, 120, 196, 120, 64, 120],
    [170, 84, 168, 100, 50, 108],
    [120, 56, 130, 76, 38, 92],
    [130, 116, 140, 94, 82, 104],
    [104, 92, 116, 78, 68, 90],
  ],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [206, 232, 248],
    [124, 186, 240],
    [52, 120, 220],
  ],
  [
    [210, 238, 236],
    [120, 196, 214],
    [44, 128, 184],
  ],
  [
    [228, 222, 248],
    [164, 164, 236],
    [80, 84, 200],
  ],
]
export const oceanLooks: WorldLook[] = TABLES.map((t, i) => lookOf(t, { sky: SKIES[i], haze: SKIES[i][0].map((v) => v - 12) }))

export function buildOcean(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = oceanLooks[r.palette % 3]

  // the deeps: broad and slow
  const D = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.3],
    [64, 0.12],
  ])
  H.fill(0)
  M.fill(1)
  // atolls and islets, as many as the share of land asks for
  const land = new Float32Array(N * N)
  const atolls = Math.round(8 + r.land * 500)
  for (let i = 0; i < atolls; i++) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    const islet = rnd() < 0.4
    const rad = islet ? 8 + rnd() * 14 : 16 + rnd() * 44
    const ring = 2.5 + rnd() * 4
    const peak = islet ? 6 + Math.round(rnd() * 14) : 2
    // (each one drawn out along a way of its own, as reefs are: an oval, not a circle; exact arithmetic, no angles)
    let ux = rnd() * 2 - 1
    let uy = rnd() * 2 - 1
    const un = Math.sqrt(ux * ux + uy * uy) || 1
    ux /= un
    uy /= un
    const stretch = 0.6 + rnd() * 0.8
    const ri = Math.ceil((rad + ring) * Math.max(stretch, 1 / stretch)) + 6
    const salt = (rnd() * 1000) | 0
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const o = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
        const along = (dx * ux + dy * uy) / stretch
        const across = (dy * ux - dx * uy) * stretch
        // (the ring's edge wobbles broadly and a little finely, so it is never a smooth oval)
        const broad = ((hash8(((cx + dx) >> 4) * 31 + ((cy + dy) >> 4) * 7 + salt) - 128) / 128) * ring * 1.2
        const wob = ((hash8(((cx + dx) >> 3) * 31 + ((cy + dy) >> 3) * 7 + salt) - 128) / 128) * ring * 0.5 + broad
        const d = Math.sqrt(along * along + across * across) + wob
        if (islet) {
          if (d > rad) continue
          const t = d / rad
          const h = Math.max(1, Math.round(peak * (1 - t * t)))
          if (h > H[o]) {
            H[o] = Math.min(TALLEST, 2 * Math.round(h / 2) || 1)
            M[o] = t > 0.75 ? SAND : t > 0.5 && hash8(o) < 90 ? ROCK : GRASS
            land[o] = 1
          }
        } else if (d > rad - ring && d < rad + ring) {
          // the ring: sand, a little higher where it is widest; broken by a channel or two where the sea runs in
          const t = Math.abs(d - rad) / ring
          const channel = hash8(((cx + dx) >> 4) * 13 + ((cy + dy) >> 4) * 29 + salt * 3) < 40
          if (t < 0.55 && hash8(o + salt) > 6 && !channel) {
            H[o] = Math.max(H[o], t < 0.25 ? 2 : 1)
            M[o] = hash8(o) < 30 ? SAND_SPECK : SAND
            land[o] = 1
          } else if (M[o] < 4) M[o] = 2
        } else if (d <= rad - ring && M[o] < 4) {
          // the lagoon
          M[o] = hash8(o * 3) < 4 ? 3 : 2
        }
      }
  }
  // palms on the atolls, trees on the islets
  plantTrees(
    world,
    4,
    [1, 2],
    // (groves thick enough to hide under: the polish pass found no cover on an ocean world at all)
    (o, m, h) => (m === SAND && h >= 2 && hash8(o + 1) < 170 ? 0.9 : m === GRASS ? 0.85 : 0),
    PALM_TOP,
    PALM,
    PALM_EDGE,
  )
  // the sea: shallows round the land, the deeps where D is low
  const near = land
  blur(near, 5)
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      if (H[o] > 0 || M[o] >= 4) {
        if (M[o] === GRASS && hash8(o) < 70) M[o] = GRASS_DARK
        if (M[o] === ROCK && hash8(o * 9) < 80) M[o] = ROCK_DARK
        continue
      }
      if (M[o] === 2 || M[o] === 3) continue
      const n = near[o]
      const hs = hash8(o)
      if (n > 0.1) M[o] = 3
      else if (n > 0.012 + (hs - 128) * 0.00004) M[o] = 2
      else M[o] = D[o] < 0.32 + (hs - 128) * 0.0002 ? 0 : 1
    }
  }

  scatterClouds(world, rnd, 230, 1.15, rnd() * 0.25)
  findSpawn(world, rnd)
}
