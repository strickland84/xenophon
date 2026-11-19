// The tools every archetype shapes its world with: fields of noise, the level a share of a
// field lies under, blurs, trees, craters, shadows cast by the ground, clouds and a place to
// start. Only exact arithmetic (util/exact.ts), so every player gets the same world.

import { cosTurn, hash2, sinTurn } from '../util/exact'
import { clamp, hash8 } from '../util/math'
import { addOctave, normalise } from '../util/noise'
import { CK, N, NC, NCM, NCSHIFT, NM, NSHIFT, ZTOP } from './world'
import type { World } from './world'

export type Rnd = () => number

/** the tallest the ground may be (the renderer draws up to ZTOP) */
export const TALLEST = ZTOP - 1

/** the size of the coarse grid broad octaves are worked out on (a quarter of the world's) */
const NQ = N >> 2

/**
 * A fresh field of value noise: octaves of [cell size, amount], stretched to 0..1. Octaves of
 * 64 px and up are smooth enough to be worked out on a grid a quarter the size and then
 * stretched over the world, which is much quicker; the fine ones are added at full size.
 */
export function noiseField(rnd: Rnd, octaves: [number, number][]): Float32Array {
  const E = new Float32Array(N * N)
  const broad = octaves.some(([cell]) => cell >= 64)
  const Q = broad ? new Float32Array(NQ * NQ) : null
  for (const [cell, amp] of octaves) {
    if (Q && cell >= 64) addOctave(Q, NQ, cell >> 2, amp, rnd)
    else addOctave(E, N, cell, amp, rnd)
  }
  if (Q) {
    // the coarse grid, stretched over the world (between its points, a straight blend)
    for (let y = 0; y < N; y++) {
      const fy = (y & 3) * 0.25
      const r0 = ((y >> 2) & (NQ - 1)) * NQ
      const r1 = (((y >> 2) + 1) & (NQ - 1)) * NQ
      const row = y << NSHIFT
      for (let x = 0; x < N; x++) {
        const fx = (x & 3) * 0.25
        const c0 = (x >> 2) & (NQ - 1)
        const c1 = ((x >> 2) + 1) & (NQ - 1)
        const a = Q[r0 + c0] + (Q[r0 + c1] - Q[r0 + c0]) * fx
        const b = Q[r1 + c0] + (Q[r1 + c1] - Q[r1 + c0]) * fx
        E[row | x] += a + (b - a) * fy
      }
    }
  }
  normalise(E)
  return E
}

/** the value of a 0..1 field below which `share` of it lies */
export function levelFor(E: Float32Array, share: number) {
  const bins = new Uint32Array(1024)
  for (let o = 0; o < E.length; o++) bins[(clamp(E[o], 0, 1) * 1023) | 0]++
  const target = clamp(share, 0, 1) * E.length
  let acc = 0
  for (let b = 0; b < 1024; b++) {
    acc += bins[b]
    if (acc >= target) return (b + 1) / 1023
  }
  return 1
}

/** blurs a field in place, `r` px each way (a box, twice over, wrapping round) */
export function blur(E: Float32Array, r: number) {
  const tmp = new Float32Array(N)
  const k = 1 / (2 * r + 1)
  for (let pass = 0; pass < 2; pass++) {
    // along the rows …
    for (let y = 0; y < N; y++) {
      const row = y << NSHIFT
      let sum = 0
      for (let d = -r; d <= r; d++) sum += E[row | (d & NM)]
      for (let x = 0; x < N; x++) {
        tmp[x] = sum * k
        sum += E[row | ((x + r + 1) & NM)] - E[row | ((x - r) & NM)]
      }
      E.set(tmp, row)
    }
    // … and down the columns
    for (let x = 0; x < N; x++) {
      let sum = 0
      for (let d = -r; d <= r; d++) sum += E[((d & NM) << NSHIFT) | x]
      for (let y = 0; y < N; y++) {
        tmp[y] = sum * k
        sum += E[(((y + r + 1) & NM) << NSHIFT) | x] - E[(((y - r) & NM) << NSHIFT) | x]
      }
      for (let y = 0; y < N; y++) E[(y << NSHIFT) | x] = tmp[y]
    }
  }
}

/** which way the ground faces at a point of a field: below 0 it faces the sun (up and to the left), above 0 away */
export function facing(E: Float32Array, x: number, y: number, reach = 2) {
  return E[(((y - reach) & NM) << NSHIFT) | ((x - reach) & NM)] - E[(((y + reach) & NM) << NSHIFT) | ((x + reach) & NM)]
}

/** the random bytes the sea's glitter and the shore's foam are drawn from */
export function fillNoise(world: World, rnd: Rnd) {
  const nz = world.noise
  for (let i = 0; i < nz.length; i++) nz[i] = (rnd() * 256) | 0
}

/**
 * Trees: little cones of leaves, on a grid every `step` px, where `wants` says how likely one
 * is (0..1) at a ground pixel; `top`, `mid` and `edge` are their materials, from the middle out.
 */
export function plantTrees(
  world: World,
  step: number,
  radius: [number, number],
  wants: (o: number, m: number, h: number) => number,
  top: number,
  mid: number,
  edge: number,
  salt = 0,
) {
  const { height: H, mat: M } = world
  world.trees[top] = world.trees[mid] = world.trees[edge] = 1
  for (let gy = 0; gy < N; gy += step) {
    for (let gx = 0; gx < N; gx += step) {
      const hs = hash8(gy * 977 + gx * 131 + 7 + salt)
      const cx = (gx + (hs & 3)) & NM
      const cy = (gy + ((hs >> 2) & 3)) & NM
      const o = (cy << NSHIFT) | cx
      const h0 = H[o]
      const p = wants(o, M[o], h0)
      if (p <= 0 || p * 255 < hash8(o + 99 + salt)) continue
      const r = radius[0] + (((hs >> 4) & 3) % (radius[1] - radius[0] + 1))
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > r + 0.3) continue
          const oo = (((cy + dy) & NM) << NSHIFT) | ((cx + dx) & NM)
          if (M[oo] < 4) continue
          const nh = Math.min(TALLEST, h0 + 1 + Math.round((1 - dist / (r + 0.5)) * (r + 1)))
          if (nh > H[oo]) {
            H[oo] = nh
            M[oo] = dist < 1.1 ? top : dist < r - 0.5 ? mid : edge
          }
        }
      }
    }
  }
}

/** which way shadows fall at a time of day, px per px of height (as render/palettes.ts has it) */
export function sunFor(timeOfDay: string): [number, number] {
  return timeOfDay === 'sunset' ? [0.95, 0.5] : timeOfDay === 'night' ? [0.3, 0.42] : [0.5, 0.32]
}

/**
 * Shadows cast by the ground, for a sun whose shadows fall (sx, sy) px per px of height (as
 * the renderer's pal.sunX and pal.sunY): returns 1 for every ground pixel in the shade of
 * taller ground. Swept along the shadows' way, a row at a time, so it is quick.
 */
export function castShadows(H: Uint8Array, sx: number, sy: number): Uint8Array {
  const shade = new Uint8Array(N * N)
  // the light's height over each pixel, carried along the way the shadows fall
  const reach = new Float32Array(N * N)
  const alongX = Math.abs(sx) >= Math.abs(sy)
  // per step along the main way: how far across, and how much lower the light gets
  const across = alongX ? sy / Math.abs(sx) : sx / Math.abs(sy)
  const drop = 1 / Math.max(Math.abs(sx), Math.abs(sy))
  const dir = alongX ? (sx >= 0 ? 1 : -1) : sy >= 0 ? 1 : -1
  // twice round, so shadows carry across the wrap
  for (let i = 0; i < 2 * N; i++) {
    const a = dir > 0 ? i & NM : (N - 1 - i) & NM
    const prevA = (a - dir) & NM
    // which line across the previous step feeds this one: the offset changes by whole pixels
    const shift = Math.floor(across * (i + 1)) - Math.floor(across * i)
    for (let b = 0; b < N; b++) {
      const o = alongX ? (b << NSHIFT) | a : (a << NSHIFT) | b
      const pb = (b - shift) & NM
      const po = alongX ? (pb << NSHIFT) | prevA : (prevA << NSHIFT) | pb
      const carried = reach[po] - drop
      const h = H[o]
      if (carried > h + 0.5) {
        reach[o] = carried
        if (i >= N) shade[o] = 1
      } else {
        reach[o] = h
        if (i >= N) shade[o] = 0
      }
    }
  }
  return shade
}

/**
 * Clouds: clusters of round puffs, as the island world has them. Each cell holds
 * (rank << 4) | thickness; a cloud shows when its rank is under the cover setting. `count`
 * clusters, `size` their scale, `lean` the way they lie (a share of a turn).
 */
export function scatterClouds(world: World, rnd: Rnd, count = 200, size = 1, lean = 0.06) {
  const cloudN = world.clouds
  cloudN.fill(0)
  for (let i = 0; i < count; i++) {
    const rank = i & 15
    const cx = rnd() * NC
    const cy = rnd() * NC
    const sc = (0.6 + rnd() * rnd() * 1.25) * size
    const ang = lean + (rnd() - 0.5) * 0.2
    const ca = cosTurn(ang)
    const sa = sinTurn(ang)
    const len = (12 + rnd() * 24) * sc
    const puffs = 4 + ((rnd() * 7) | 0)
    for (let q = 0; q < puffs; q++) {
      const t = (q / (puffs - 1)) * 2 - 1
      const pxc = cx + ca * t * len + (rnd() - 0.5) * 9 * sc
      const pyc = cy + sa * t * len + (rnd() - 0.5) * 9 * sc
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

/**
 * Cells: a jittered point every 2^shift px, and a number of its own for each, from a salt.
 * Round each point lies a cell (the ground nearest to it); between two cells is a crack. Sea
 * ice breaks into floes this way, and a lava sea's crust into plates.
 */
export interface Cells {
  shift: number
  count: number
  x: Float32Array
  y: Float32Array
  n: Uint8Array
  /** the number of the cell the last point asked about (cellGap) lies in */
  near: number
}

export function makeCells(shift: number, salt: number): Cells {
  const size = 1 << shift
  const count = N >> shift
  const x = new Float32Array(count * count)
  const y = new Float32Array(count * count)
  const n = new Uint8Array(count * count)
  for (let cy = 0; cy < count; cy++)
    for (let cx = 0; cx < count; cx++) {
      const c = cy * count + cx
      x[c] = cx * size + (hash2(cx, cy, salt) * size) / 256
      y[c] = cy * size + (hash2(cx, cy, salt + 1) * size) / 256
      n[c] = hash2(cx, cy, salt + 2)
    }
  return { shift, count, x, y, n, near: 0 }
}

/** how far a point is from the crack between its cell and the next, px (its cell's number is left in `near`) */
export function cellGap(c: Cells, x: number, y: number) {
  const { count, shift } = c
  const gx = x >> shift
  const gy = y >> shift
  let d1 = 1e9
  let d2 = 1e9
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      // (a cell past the edge is the one at the other side, moved round)
      const cx = gx + i
      const cy = gy + j
      const k = ((cy + count) % count) * count + ((cx + count) % count)
      const px = c.x[k] + (cx < 0 ? -N : cx >= count ? N : 0) - x
      const py = c.y[k] + (cy < 0 ? -N : cy >= count ? N : 0) - y
      const dd = px * px + py * py
      if (dd < d1) {
        d2 = d1
        d1 = dd
        c.near = c.n[k]
      } else if (dd < d2) d2 = dd
    }
  // (the gap between two cells: the difference of the squared distances, by about twice the distance)
  return (d2 - d1) / (2 * Math.sqrt(d2) + 1)
}

// eight ways round, for looking about a point
const AROUND = [
  [1, 0],
  [0.7071, 0.7071],
  [0, 1],
  [-0.7071, 0.7071],
  [-1, 0],
  [-0.7071, -0.7071],
  [0, -1],
  [0.7071, -0.7071],
]

/**
 * Where a flight starts: over open sea with land in sight (as on the island world), or, on a
 * world with little or no sea, over low ground with higher ground round about.
 */
export function findSpawn(world: World, rnd: Rnd, over: 'sea' | 'low' = 'sea') {
  const { height: H, mat: M } = world
  let best = -1e9
  for (let tries = 0; tries < 400; tries++) {
    const x = (rnd() * N) | 0
    const y = (rnd() * N) | 0
    const o = (y << NSHIFT) | x
    let score: number
    if (over === 'sea') {
      if (M[o] > 2) continue
      let landNear = 0
      for (const [ax, ay] of AROUND)
        if (M[(((y + Math.round(ay * 120)) & NM) << NSHIFT) | ((x + Math.round(ax * 120)) & NM)] >= 4) landNear++
      score = landNear <= 5 ? landNear : -2
    } else {
      // (low ground, with higher about it: the start of a valley or a canyon)
      let higher = 0
      for (const [ax, ay] of AROUND)
        if (H[(((y + Math.round(ay * 90)) & NM) << NSHIFT) | ((x + Math.round(ax * 90)) & NM)] > H[o] + 4) higher++
      score = higher <= 6 ? higher * 2 - H[o] / 8 - (M[o] < 4 ? 4 : 0) : -20
    }
    if (score > best) {
      best = score
      world.spawnX = x
      world.spawnY = y
    }
  }
}
