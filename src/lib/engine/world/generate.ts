// Builds a world from a seed: islands with terraced hills, forests, a place to start, and clouds.

import { clamp, hash8, mulberry32 } from '../util/math'
import { addOctave, normalise } from '../util/noise'
import { STANDARD_LOOK } from './look'
import { CK, N, NC, NCM, NCSHIFT, NM, noFeatures, NSHIFT } from './world'
import type { World } from './world'

// where the start looks for land: 120 px off eight ways round. These were Math.cos(a * 0.785)
// and Math.sin(a * 0.785) times 120; written out, they are the same in every browser.
const LOOK_X = [
  120, 84.88659230006397, 0.0955592052879916, -84.75139737840063, -119.99984780730475, -85.02157190307274, -0.28667737347378464,
  84.61598748101073,
]
const LOOK_Y = [
  0, 84.81902173264392, 119.99996195182015, 84.95410903781188, 0.1911183499784194, -84.6837192802172, -119.99965756652615, -85.088980853066,
]

/**
 * Fills the world in; `landShare` is the share of it that is land, 0..1. The island world,
 * the Archipelago archetype. Its clouds are placed with Math.cos and Math.sin, which may
 * differ in the last bit between browsers: they decide neither height nor material.
 */
export function buildWorld(world: World, seed: number, landShare: number) {
  const { height: heightMap, mat: matMap, clouds: cloudN, noise: nz } = world
  world.look = STANDARD_LOOK
  world.features = noFeatures()
  // (its trees' crowns are materials 9, 10 and 11)
  world.trees.fill(0)
  world.trees[9] = world.trees[10] = world.trees[11] = 1
  const rnd = mulberry32((seed | 0) * 7919 + 13)
  for (let i = 0; i < nz.length; i++) nz[i] = (rnd() * 256) | 0

  const E = new Float32Array(N * N)
  addOctave(E, N, 512, 0.55, rnd)
  addOctave(E, N, 256, 1, rnd)
  addOctave(E, N, 128, 0.5, rnd)
  addOctave(E, N, 64, 0.25, rnd)
  addOctave(E, N, 32, 0.11, rnd)
  addOctave(E, N, 16, 0.05, rnd)
  normalise(E)

  // sea level from the wanted share of land
  const bins = new Uint32Array(1024)
  for (let o = 0; o < E.length; o++) bins[(E[o] * 1023) | 0]++
  const land = clamp(landShare, 0.02, 0.9)
  let acc = 0
  let sea = 1
  const target = (1 - land) * E.length
  for (let b = 0; b < 1024; b++) {
    acc += bins[b]
    if (acc >= target) {
      sea = (b + 1) / 1023
      break
    }
  }
  const SAND = 0.012
  const span = Math.max(0.05, 1 - sea - SAND)

  for (let y = 0; y < N; y++) {
    const row = y << NSHIFT
    const rowNW = ((y - 2) & NM) << NSHIFT
    const rowSE = ((y + 2) & NM) << NSHIFT
    for (let x = 0; x < N; x++) {
      const o = row | x
      const e = E[o]
      const hs = hash8(o)
      const d = e - sea
      if (d < 0) {
        const dd = -d + (hs - 128) * 0.00004
        matMap[o] = dd > 0.07 ? 0 : dd > 0.03 ? 1 : dd > 0.008 ? 2 : 3
        heightMap[o] = 0
        continue
      }
      if (d < SAND) {
        matMap[o] = hs < 34 ? 5 : 4
        heightMap[o] = 0
        continue
      }
      const hr = (d - SAND) / span
      // terraces: 8 grass levels (2 px each), 4 rock levels and the snow cap (3 px each)
      let lv = hr < 0.5 ? 1 + ((hr * 16) | 0) : hr < 0.78 ? 9 + (((hr - 0.5) / 0.07) | 0) : 13 + (((hr - 0.78) / 0.09) | 0)
      if (lv > 15) lv = 15
      heightMap[o] = lv <= 8 ? lv * 2 : 16 + (lv - 8) * 3
      const g = E[rowNW | ((x - 2) & NM)] - E[rowSE | ((x + 2) & NM)]
      const lit = g < -0.007
      const shaded = g > 0.007
      if (lv >= 13) matMap[o] = shaded ? 16 : 15
      else if (lv >= 9) matMap[o] = lit ? 14 : shaded ? 13 : hs < 26 ? 13 : 12
      else matMap[o] = lit ? 8 : shaded ? 7 : hs < 22 ? 7 : hs > 240 ? 8 : 6
    }
  }

  // forests: little cones of leaves
  const STEP = 5
  for (let gy = 0; gy < N; gy += STEP) {
    for (let gx = 0; gx < N; gx += STEP) {
      const hs = hash8(gy * 977 + gx * 131 + 7)
      const cx = (gx + (hs & 3)) & NM
      const cy = (gy + ((hs >> 2) & 3)) & NM
      const o = (cy << NSHIFT) | cx
      const m = matMap[o]
      if (m < 6 || m > 8) continue
      const h0 = heightMap[o]
      if (h0 > 14) continue
      const f = E[(((cy + 613) & NM) << NSHIFT) | ((N - 1 - cx + 911) & NM)]
      const pr = (f - sea) * 30
      if (pr <= 0 || pr * 255 < hash8(o + 99)) continue
      const r = 2 + ((hs >> 4) & 1)
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > r + 0.3) continue
          const oo = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
          if (matMap[oo] < 4) continue
          const nh = h0 + 1 + Math.round((1 - dist / (r + 0.5)) * (r + 1))
          if (nh > heightMap[oo]) {
            heightMap[oo] = nh
            matMap[oo] = dist < 1.1 ? 9 : dist < r - 0.5 ? 10 : 11
          }
        }
      }
    }
  }

  // a start over open water next to land
  let best = -1
  for (let tries = 0; tries < 400; tries++) {
    const x = (rnd() * N) | 0
    const y = (rnd() * N) | 0
    const here = matMap[(y << NSHIFT) | x]
    if (here > 2) continue
    let landNear = 0
    for (let a = 0; a < 8; a++) {
      const xx = (x + LOOK_X[a]) & NM
      const yy = (y + LOOK_Y[a]) & NM
      if (matMap[(yy << NSHIFT) | xx] >= 4) landNear++
    }
    if (landNear > best && landNear <= 5) {
      best = landNear
      world.spawnX = x
      world.spawnY = y
    }
  }

  // clouds: clusters of round puffs. Each cell holds (rank << 4) | thickness; a cloud shows
  // when its rank is under the cover setting, so the slider adds and removes whole clouds.
  cloudN.fill(0)
  for (let i = 0; i < 200; i++) {
    const rank = i & 15
    const cx = rnd() * NC
    const cy = rnd() * NC
    const sc = 0.6 + rnd() * rnd() * 1.25
    const ang = 0.35 + (rnd() - 0.5) * 1.3
    const len = (12 + rnd() * 24) * sc
    const puffs = 4 + ((rnd() * 7) | 0)
    for (let q = 0; q < puffs; q++) {
      const t = (q / (puffs - 1)) * 2 - 1
      const pxc = cx + Math.cos(ang) * t * len + (rnd() - 0.5) * 9 * sc
      const pyc = cy + Math.sin(ang) * t * len + (rnd() - 0.5) * 9 * sc
      const r = (6 + rnd() * 8) * sc * (1 - 0.45 * Math.abs(t))
      const maxT = clamp(Math.round(r * 0.6), 2, CK)
      const ri = Math.ceil(r)
      for (let dy = -ri; dy <= ri; dy++) {
        for (let dx = -ri; dx <= ri; dx++) {
          const d2 = (dx * dx + dy * dy) / (r * r)
          if (d2 > 1) continue
          const tk = Math.max(1, Math.round(Math.sqrt(1 - d2) * maxT))
          const xx = (Math.round(pxc) + dx) & NCM
          const yy = (Math.round(pyc) + dy) & NCM
          const oo = (yy << NCSHIFT) | xx
          if (tk > (cloudN[oo] & 15)) cloudN[oo] = (rank << 4) | tk
        }
      }
    }
  }
}
