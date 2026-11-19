// Barren moon: grey dust and rock, pocked with craters of every size, raised rims and hard
// black shadows; no sea, no cloud, a black sky with the stars out by day. Low gravity, no air,
// and nowhere to hide. After art/mockups/world-moon-3.png.

import type { WorldRecipe } from '../../galaxy/recipe'
import { cosTurn, sinTurn } from '../../util/exact'
import { clamp, hash8, mulberry32 } from '../../util/math'
import { lookOf } from '../look'
import type { WorldLook } from '../look'
import { castShadows, sunFor, fillNoise, findSpawn, noiseField, TALLEST } from '../shape'
import { N, NM, NSHIFT } from '../world'
import type { World } from '../world'

// materials (no sea: 0..3 are never used)
const DUST = 4
const DUST_DARK = 5
const DUST_LIGHT = 6
const FLOOR = 7
const RIM = 8
const ROCK = 9
const SHADOW = 10
const RAY = 11
const DEEP_SHADOW = 12
const FLOOR_DARK = 13

// three palettes: grey, a brown one, and a blue-grey one
const greys = (k: number[]): number[][] => {
  const t = (v: number, side = 0.7) => [v * k[0], v * k[1], v * k[2], v * k[0] * side, v * k[1] * side, v * k[2] * side]
  return [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], t(148), t(130), t(172), t(116), t(192), t(92), t(44, 1), t(206), t(22, 1), t(102)]
}
const TABLES = [greys([1, 1, 0.99]), greys([1.04, 0.95, 0.84]), greys([0.92, 0.97, 1.06])]
export const moonLooks: WorldLook[] = TABLES.map((t) =>
  lookOf(t, {
    sea: 'none',
    sky: [
      [6, 6, 12],
      [3, 3, 8],
      [0, 0, 4],
    ],
    haze: [10, 10, 16],
    starsByDay: true,
  }),
)

export function buildMoon(world: World, r: WorldRecipe) {
  const { height: H, mat: M } = world
  const rnd = mulberry32((r.seed | 0) * 7919 + 13)
  fillNoise(world, rnd)
  world.look = moonLooks[r.palette % 3]
  world.clouds.fill(0)

  // the lie of the land: low swells and the odd ridge
  const B = noiseField(rnd, [
    [512, 1],
    [256, 0.6],
    [128, 0.3],
    [64, 0.2],
    [32, 0.1],
    [16, 0.05],
  ])
  // (the ground stands well above 0, so a crater has room to be deep)
  const base = 16
  const swell = 4 + Math.round(r.relief * 10)
  const ground = new Float32Array(N * N)
  for (let o = 0; o < N * N; o++) ground[o] = base + B[o] * swell
  // craters, the large first: a bowl, a raised rim, and for the largest a flat floor and a peak
  const sizes: number[] = []
  for (let i = 0; i < 5 + Math.round(r.relief * 4); i++) sizes.push(80 + rnd() * 90)
  for (let i = 0; i < 60; i++) sizes.push(18 + rnd() * 40)
  for (let i = 0; i < 900; i++) sizes.push(3 + rnd() * rnd() * 16)
  const rays: { x: number; y: number; r: number }[] = []
  for (const rad of sizes) {
    const cx = (rnd() * N) | 0
    const cy = (rnd() * N) | 0
    const at = ground[(cy << NSHIFT) | cx]
    const depth = Math.min(at - 1, 2 + rad * 0.16)
    const lip = 1 + rad * 0.05
    const flat = rad > 60 ? 0.45 : 0
    if (rad > 50 && rnd() < 0.4) rays.push({ x: cx, y: cy, r: rad })
    const ri = Math.ceil(rad * 1.5)
    for (let dy = -ri; dy <= ri; dy++)
      for (let dx = -ri; dx <= ri; dx++) {
        const d2 = dx * dx + dy * dy
        if (d2 > ri * ri) continue
        const o = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
        const t = Math.sqrt(d2) / rad
        let h: number
        if (t < 1) {
          const u = t < flat ? 0 : (t - flat) / (1 - flat)
          h = at - depth + (depth + lip) * u * u
          if (flat > 0 && t < 0.12) h += depth * 0.55 * (1 - t / 0.12)
        } else {
          const u = (t - 1) / 0.5
          h = ground[o] + lip * (1 - u) * (1 - u)
          if (t >= 1.5) continue
        }
        ground[o] = t < 1 ? h : Math.max(ground[o], h)
      }
  }
  // the ground in terraces of 2 px, lit and shaded by its slope
  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const h = clamp(2 * Math.round(ground[o] / 2), 1, TALLEST)
      H[o] = h
      const g = ground[(((y - 2) & NM) << NSHIFT) | ((x - 2) & NM)] - ground[(((y + 2) & NM) << NSHIFT) | ((x + 2) & NM)]
      const hs = hash8(o)
      // (the low plains are darker, the maria; the highlands paler)
      const mare = B[o] < 0.4
      if (g > 1.6) M[o] = mare ? FLOOR_DARK : DUST_DARK
      else if (g < -1.6) M[o] = RIM
      else if (g < -0.6) M[o] = DUST_LIGHT
      else if (mare) M[o] = hs < 14 ? FLOOR_DARK : FLOOR
      else M[o] = hs < 2 ? ROCK : hs < 14 ? DUST_DARK : DUST
    }
  }
  // the bright rays thrown out by a few young craters
  for (const ray of rays) {
    const n = 7 + ((rnd() * 6) | 0)
    for (let k = 0; k < n; k++) {
      const a = rnd()
      const ux = cosTurn(a)
      const uy = sinTurn(a)
      const len = ray.r * (2.5 + rnd() * 2.5)
      // (a ray is broad and thick near its crater, and thins and breaks up further out)
      const wide = ray.r * (0.12 + rnd() * 0.1)
      for (let s = ray.r; s < len; s += 0.7) {
        const fade = 1 - (s - ray.r) / (len - ray.r)
        const w = wide * fade + 0.5
        for (let q = -w; q <= w; q += 0.7) {
          const x = (ray.x + Math.round(ux * s - uy * q)) & NM
          const y = (ray.y + Math.round(uy * s + ux * q)) & NM
          const o = (y << NSHIFT) | x
          const edge = Math.abs(q) / w
          if (
            (M[o] === DUST || M[o] === DUST_DARK || M[o] === FLOOR || M[o] === FLOOR_DARK) &&
            hash8(o + k) < 220 * fade * (1 - edge * edge)
          )
            M[o] = RAY
        }
      }
    }
  }
  // hard black shadows: there is no air to soften them
  // (cast by a sun lower than the ships' shadows have, so the crater walls throw them too)
  const [sx, sy] = sunFor(r.timeOfDay)
  const shade = castShadows(H, sx * 4, sy * 4)
  for (let o = 0; o < N * N; o++) if (shade[o]) M[o] = H[o] <= base - 2 ? DEEP_SHADOW : SHADOW

  findSpawn(world, rnd, 'low')
}
