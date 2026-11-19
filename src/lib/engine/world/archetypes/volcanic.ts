// Volcanic: black basalt and grey ash in stepped tiers, a sea of lava with rivers of it
// winding through, and volcano cones with glowing craters and lava running down their sides.
// Lava burns a ship that flies low over it (sim/hazards.ts); the ash hangs low, so the
// ceiling does too. After art/mockups/world-volcanic-3.png and world-volcanic.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { cosTurn, sinTurn } from '../../util/exact'
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
import { N, NM, NSHIFT } from '../world'
import type { World } from '../world'

// materials (0..3 the lava: crusted, flowing, bright, and its glowing edge)
const BASALT = 4
const BASALT_DARK = 5
const BASALT_LIGHT = 6
const ASH = 7
const ASH_LIGHT = 8
const CONE = 9
const RIM = 10
const CRATER = 11
const FLOW = 12
const COOLED = 13
const SHADOW = 14
const SULFUR = 15
const EMBER = 16
const CONE_DARK = 17

// three palettes: black basalt, red-brown, and an ashen grey-green (top r g b, side r g b);
// 0..3 the lava: crust, flowing, bright, and its white-hot edge
const TABLES: number[][][] = [
  [
    [58, 22, 24],
    [206, 62, 20],
    [246, 126, 30],
    [255, 214, 100],
    [40, 40, 50, 24, 24, 32],
    [30, 30, 40, 18, 18, 26],
    [60, 58, 70, 30, 30, 38],
    [76, 70, 74, 48, 44, 50],
    [96, 90, 92, 58, 54, 58],
    [44, 42, 52, 26, 24, 32],
    [80, 56, 54, 40, 28, 30],
    [255, 172, 60, 220, 90, 30],
    [238, 98, 30, 170, 52, 24],
    [70, 30, 32, 44, 22, 26],
    [18, 16, 24, 14, 12, 20],
    [196, 180, 70, 130, 118, 46],
    [244, 104, 30, 170, 52, 24],
    [32, 30, 40, 18, 16, 24],
  ],
  [
    [64, 24, 20],
    [210, 72, 22],
    [248, 140, 36],
    [255, 222, 116],
    [62, 42, 40, 36, 24, 24],
    [48, 32, 32, 28, 18, 18],
    [84, 58, 52, 46, 30, 28],
    [100, 80, 72, 62, 48, 46],
    [124, 102, 92, 74, 60, 56],
    [56, 38, 36, 34, 22, 22],
    [104, 62, 50, 54, 30, 26],
    [255, 180, 70, 224, 100, 32],
    [240, 110, 34, 176, 58, 26],
    [82, 36, 30, 52, 24, 22],
    [30, 18, 20, 22, 14, 16],
    [204, 176, 70, 138, 114, 46],
    [246, 112, 34, 176, 58, 26],
    [44, 28, 28, 26, 18, 18],
  ],
  [
    [56, 26, 22],
    [194, 68, 26],
    [238, 130, 40],
    [255, 220, 120],
    [50, 54, 52, 30, 32, 32],
    [38, 42, 42, 22, 24, 26],
    [70, 74, 68, 38, 40, 38],
    [90, 94, 84, 56, 58, 52],
    [112, 114, 100, 66, 68, 60],
    [44, 48, 48, 26, 28, 30],
    [90, 74, 62, 46, 36, 32],
    [255, 176, 66, 222, 96, 32],
    [236, 104, 34, 170, 56, 26],
    [74, 42, 36, 46, 28, 26],
    [22, 24, 26, 16, 18, 20],
    [206, 194, 84, 138, 130, 54],
    [240, 108, 34, 170, 56, 26],
    [32, 34, 36, 18, 20, 22],
  ],
]
const SKIES: [number[], number[], number[]][] = [
  [
    [156, 80, 58],
    [90, 46, 46],
    [34, 20, 30],
  ],
  [
    [176, 98, 62],
    [104, 54, 46],
    [40, 22, 28],
  ],
  [
    [140, 96, 74],
    [84, 62, 58],
    [32, 28, 32],
  ],
]
export const volcanicLooks: WorldLook[] = TABLES.map((t, i) => {
  const look = lookOf(t, {
    sky: SKIES[i],
    haze: SKIES[i][0].map((v) => v * 0.8),
    sea: 'lava',
    flow: 0.3,
    spark: [
      [255, 196, 90],
      [255, 240, 170],
    ],
    foam: [255, 240, 160],
    cloud: [0.42, 0.38, 0.38],
  })
  const glow = [0.7, 0.85, 0.95, 1]
  for (let m = 0; m < 4; m++) look.glow[m] = glow[m]
  look.glow[CRATER] = 1
  look.glow[FLOW] = 0.9
  look.glow[COOLED] = 0.4
  look.glow[EMBER] = 0.9
  return look
})

export function buildVolcanic(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = volcanicLooks[r.palette % 3]

  const C = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.3],
    [64, 0.15],
    [32, 0.08],
    [16, 0.04],
  ])
  // the lava rivers' courses, and where the ash lies
  const L = noiseField(rnd, [
    [256, 1],
    [128, 0.5],
    [64, 0.25],
    [32, 0.08],
  ])
  const A = noiseField(rnd, [
    [256, 1],
    [64, 0.5],
  ])
  const sea = levelFor(C, 1 - r.land)
  const tiers = 3 + Math.round(r.relief * 3) // basalt tiers above the lava, 4 px each
  // the lava's crust breaks into plates; the rock is split by cracks, glowing where they run deep
  const plates = makeCells(5, r.seed & 0xffff)
  const cracks = makeCells(7, (r.seed >>> 8) & 0xffff)
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const hs = hash8(o)
      const d = C[o] - sea
      const riv = Math.abs(L[o] - 0.5)
      // (a river is narrow inland, wider where it runs into the lava sea)
      const wide = 0.005 + (d < 0.2 ? (0.2 - d) * 0.012 : 0)
      if (d < 0 || (riv < wide && d < 0.45)) {
        // lava: flowing and bright along the shore and in the rivers, crusted over far out
        H[o] = 0
        if (d >= 0) M[o] = riv < wide * 0.45 ? 2 : riv < wide * 0.8 ? 1 : 3
        else if (-d < 0.012) M[o] = -d < 0.004 ? 3 : -d < 0.008 ? 2 : 1
        else {
          const gap = cellGap(plates, x, y)
          M[o] = gap < 1.2 ? 2 : gap < 2.2 + (plates.near & 1) || -d < 0.03 ? 1 : 0
        }
        continue
      }
      const hr = clamp(d / (1 - sea), 0, 1)
      const tier = Math.min(tiers, Math.floor(hr * (tiers + 1) * 1.6))
      H[o] = 2 + tier * 4
      const g = facing(C, x, y)
      // a river runs down a valley of its own cooled rock, low enough to be seen from above
      if (riv < wide * 2.2 && d < 0.45) {
        M[o] = COOLED
        H[o] = Math.min(H[o], riv < wide * 1.5 ? 1 : 2 + tier)
      } else if (A[o] > 0.74) M[o] = g < -0.006 ? ASH_LIGHT : ASH
      else {
        const gap = cellGap(cracks, x, y)
        // (some cracks glow, some are only dark)
        if (gap < 1.1 && A[o] < 0.55) M[o] = (cracks.near & 3) === 0 ? BASALT_DARK : EMBER
        else M[o] = g < -0.006 ? BASALT_LIGHT : g > 0.006 ? BASALT_DARK : hs < 40 ? BASALT_DARK : BASALT
      }
    }
  }

  // vents: small patches of yellow sulfur
  for (let i = 0; i < 260; i++) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    const rad = 1.5 + rnd() * 2.5
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const o = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
        const m = M[o]
        if (dx * dx + dy * dy > rad * rad || (m !== BASALT && m !== BASALT_DARK && m !== BASALT_LIGHT)) continue
        if (hash8(o + 31) < 170) M[o] = SULFUR
      }
  }

  // the cones: each a mountain with a crater of lava at its top, and lava running down its sides
  const cones = 9 + Math.round(r.relief * 8)
  for (let i = 0; i < cones; i++) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    const base = H[(cy << NSHIFT) | cx]
    if (M[(cy << NSHIFT) | cx] < 4) {
      i -= rnd() < 0.7 ? 1 : 0
      continue
    }
    const rad = 46 + rnd() * 90
    const peak = Math.min(TALLEST - base, 16 + Math.round(rnd() * 22))
    const crater = 0.13 + rnd() * 0.06
    const streams = 2 + ((rnd() * 3) | 0)
    const sx: number[] = []
    const sy: number[] = []
    for (let k = 0; k < streams; k++) {
      const a = rnd()
      sx.push(cosTurn(a))
      sy.push(sinTurn(a))
    }
    const ri = Math.ceil(rad)
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 > rad * rad) continue
        const o = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
        const t = Math.sqrt(d2) / rad
        // its flanks: steeper near the top
        const u = 1 - t
        let h = base + Math.round(peak * u * u * (1.6 - 0.6 * u))
        if (t < crater) h = base + peak - Math.round(5 * (1 - t / crater))
        // stepped, 3 px at a time, so it reads as the other ground does
        h = Math.min(TALLEST, 3 * Math.round(h / 3))
        if (h <= H[o] && M[o] >= 4) continue
        H[o] = h
        const hs = hash8(o * 3 + 1)
        if (t < crater * 0.7) M[o] = CRATER
        else if (t < crater * 1.25) M[o] = RIM
        else {
          let flow = false
          for (let k = 0; k < streams; k++) {
            const along = dx * sx[k] + dy * sy[k]
            const across = Math.abs(dx * sy[k] - dy * sx[k]) + (hash8(o + k) & 3) * 0.4
            if (along > 0 && across < 1.4 + along * 0.035) flow = true
          }
          M[o] = flow ? (t < 0.75 ? FLOW : COOLED) : dx + dy > 0 ? (hs < 60 ? CONE_DARK : CONE) : hs < 20 ? CONE_DARK : CONE
        }
      }
  }

  const shade = castShadows(H, ...sunFor(r.timeOfDay))
  for (let o = 0; o < N * N; o++) {
    if (!shade[o]) continue
    const m = M[o]
    if (
      m === BASALT ||
      m === BASALT_LIGHT ||
      m === BASALT_DARK ||
      m === ASH ||
      m === ASH_LIGHT ||
      m === CONE ||
      m === CONE_DARK ||
      m === SULFUR
    )
      M[o] = SHADOW
  }

  scatterClouds(world, rnd, 220, 1.2, rnd() * 0.25)
  findSpawn(world, rnd, 'low')
}
