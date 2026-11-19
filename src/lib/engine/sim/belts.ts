// The rocks of space (the plan's section 4): asteroid belts, each a wide ring of drifting rocks
// round its system's middle, cover to hide in and ore to cut; and the void shards that drift in
// the pull round a black hole, scooped up by flying through them.
//
// Nothing of a belt is stored: the plane is cut into cells, and each cell's rocks follow from its
// place alone (exact arithmetic), so every player sees the same rocks, and only those near the
// ship are ever worked out. Each rock drifts a little round where it belongs, on the shared clock.
// A rock with ore in it is cut by the mining laser as an outcrop is (sim/mining.ts treats it as
// one), and shots stop against rocks.

import { BELT, ROCK_SIZES, SHARDS, SPACE_Z } from '../data/space'
import type { ResourceId } from '../data/resources'
import type { SceneState } from '../state'
import { hash2 } from '../util/exact'
import { clamp } from '../util/math'
import type { Outcrop } from '../world/features'
import { harm, ownFighter } from './combat'
import { addSpark, jitter, sound, SPARK_GROUND } from './effects'
import { addTo, roomFor } from './cargo'
import { news, nowOf, record } from './loop'
import type { SpaceBody } from './space'

/** a rock of a belt: an outcrop to the laser (with ore, or none), with a size and a picture of its own */
export interface Rock extends Outcrop {
  /** px: how far its edge is from its middle */
  r: number
  /** which picture (space/art.ts ROCKS, or ORE_ROCKS for one with ore) */
  art: number
  /** how fast it turns, radians a second, and where it was turned to at the clock's zero */
  spin: number
  turn: number
}

/** a void shard: where it drifts, whether it has been taken in its period */
export interface Shard {
  id: number
  x: number
  y: number
  turn: number
}

/** the ores a belt's rocks hold */
const BELT_ORES: ResourceId[] = ['ferrite', 'ferrite', 'silica', 'cryo-ice']
/** how many pictures of bare rocks there are, and which picture shows each ore */
export const ROCK_PICTURES = 6
export const ORE_PICTURE: Partial<Record<ResourceId, number>> = { ferrite: 0, silica: 1, 'cryo-ice': 2 }

/** a rock has nothing stamped into the ground */
const NONE: number[] = []

/** a cell's number (and its rocks' ids are four times it, and up): room for a system 600,000 px across */
const CELLS = 4096
const cellId = (cx: number, cy: number) => (cx + CELLS / 2) * CELLS + (cy + CELLS / 2)

/** how thick a belt is at a point (0 outside it, 1 along its middle) */
function thickness(belt: SpaceBody, x: number, y: number) {
  const o = belt.body.orbit
  // (its ring is round the system's middle, or round the body it orbits, which at the core is the black hole there)
  const d = Math.hypot(x, y)
  const off = Math.abs(d - o.radius) / (belt.body.size / 2)
  return off >= 1 ? 0 : 1 - off * off
}

/** the rocks of a cell, made from its place (none outside every belt) */
function cellRocks(scene: SceneState, belts: SpaceBody[], cx: number, cy: number, t: number, out: Rock[]) {
  const C = BELT.cell
  const mx = (cx + 0.5) * C
  const my = (cy + 0.5) * C
  let dense = 0
  for (const b of belts) dense = Math.max(dense, thickness(b, mx, my))
  if (dense <= 0) return
  const id = cellId(cx, cy)
  for (let k = 0; k < BELT.most; k++) {
    if (hash2(cx, cy, 11 + k) / 255 > dense * 0.62) continue
    const h1 = hash2(cx, cy, 23 + k)
    const h2 = hash2(cx, cy, 37 + k)
    const h3 = hash2(cx, cy, 51 + k)
    const h4 = hash2(cx, cy, 67 + k)
    // (mostly small; the size is one a rock is drawn at, and it is struck a little inside its edge)
    const size = h3 / 255
    const across = ROCK_SIZES[Math.min(ROCK_SIZES.length - 1, Math.floor(size * size * ROCK_SIZES.length))]
    const r = across * 0.45
    const ore = h4 < BELT.oreShare * 255 && across >= 18 ? BELT_ORES[h4 % BELT_ORES.length] : null
    const bx = cx * C + 10 + (h1 / 255) * (C - 20)
    const by = cy * C + 10 + (h2 / 255) * (C - 20)
    // (it drifts round where it belongs, slowly, on the shared clock)
    const phase = ((h1 ^ h2) & 63) / 10
    const slow = 0.05 + (h3 & 15) / 300
    const x = bx + Math.sin(t * slow + phase) * BELT.drift
    const y = by + Math.cos(t * slow * 0.8 + phase) * BELT.drift
    out.push({
      id: id * 4 + k,
      x,
      y,
      z: SPACE_Z,
      ground: SPACE_Z - r,
      ore: ore ?? 'ferrite',
      rich: false,
      wreck: false,
      stock: ore ? BELT.stock : 0,
      period: BELT.period,
      offset: (h4 * 37) % BELT.period,
      cells: NONE,
      tall: NONE,
      mats: NONE,
      low: NONE,
      lowMat: NONE,
      r,
      art: ore ? (ORE_PICTURE[ore] ?? 0) : (h4 >> 2) % ROCK_PICTURES,
      spin: ((h2 & 7) - 3.5) * 0.06,
      turn: (h1 / 255) * Math.PI * 2,
    })
  }
}

/** the belts of the system */
const beltsOf = (scene: SceneState) => scene.space.bodies.filter((b) => b.body.kind === 'belt')

/** every rock within `reach` of (x, y), into `out` (emptied first) */
export function rocksNear(scene: SceneState, x: number, y: number, reach: number, out: Rock[]) {
  out.length = 0
  const belts = beltsOf(scene)
  if (!belts.length) return out
  const C = BELT.cell
  const t = nowOf(scene)
  const x0 = Math.floor((x - reach) / C)
  const x1 = Math.floor((x + reach) / C)
  const y0 = Math.floor((y - reach) / C)
  const y1 = Math.floor((y + reach) / C)
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) cellRocks(scene, belts, cx, cy, t, out)
  return out
}

/** the rocks round the player, worked out once a step (the laser, the shots and the drawing use them) */
export function stepRocks(scene: SceneState) {
  const j = scene.jets[0]
  const view = scene.view
  // (round the camera, far enough to cover the frame, and the ship)
  const cx = (j.x + view.x) / 2
  const cy = (j.y + view.y) / 2
  rocksNear(scene, cx, cy, ROCK_REACH, scene.space.rocks)
}
/** how far round the camera the rocks are worked out, px */
const ROCK_REACH = 520

/** the rock (with ore left) the laser can reach, as an outcrop; the rocks are those round the player */
export const oreRocks = (scene: SceneState) => scene.space.rocks.filter((r) => r.stock > 0)

/** a rock by its id, near the player (null: not near, or no such rock) */
export const rockById = (scene: SceneState, id: number) => scene.space.rocks.find((r) => r.id === id) ?? null

/** a rock by its id, wherever it is (made again from its cell); null: no such rock */
export function rockOfId(scene: SceneState, id: number): Rock | null {
  const near = rockById(scene, id)
  if (near) return near
  const cell = Math.floor(id / 4)
  const cx = Math.floor(cell / CELLS) - CELLS / 2
  const cy = (cell % CELLS) - CELLS / 2
  const list: Rock[] = []
  cellRocks(scene, beltsOf(scene), cx, cy, nowOf(scene), list)
  return list.find((r) => r.id === id) ?? null
}

/** the rock a point is inside (null: none): shots stop against them */
export function rockAt(scene: SceneState, x: number, y: number) {
  for (const r of scene.space.rocks) {
    const dx = x - r.x
    const dy = y - r.y
    if (dx * dx + dy * dy < r.r * r.r * 0.8) return r
  }
  return null
}

/** a shot or a missile struck a rock at (x, y): sparks and grit */
export function struckRock(scene: SceneState, x: number, y: number) {
  for (let k = 0; k < 2; k++)
    addSpark(scene, x, y, SPACE_Z, jitter(scene, 3) * 40, jitter(scene, 5) * 40, jitter(scene, 7) * 10, SPARK_GROUND)
}

/** a ship that flies into a big rock is knocked off it, and hurt a little (the player's) */
export function bumpRocks(scene: SceneState, dt: number) {
  const f = ownFighter(scene)
  if (!f) return
  const j = f.jet
  const radius = f.radius * 0.8
  for (const r of scene.space.rocks) {
    // (a ship over or under it, in the band round the plane, passes it by)
    if (r.r < 10 || Math.abs(j.z - SPACE_Z) > r.r) continue
    const dx = j.x - r.x
    const dy = j.y - r.y
    const d = Math.hypot(dx, dy)
    const reach = r.r + radius
    if (d >= reach || d < 1e-6) continue
    const nx = dx / d
    const ny = dy / d
    j.x = r.x + nx * reach
    j.y = r.y + ny * reach
    // (pushed off it, and turned away from it a little)
    scene.space.driftX += nx * BELT.push
    scene.space.driftY += ny * BELT.push
    if (scene.time - scene.space.bumpedAt > 0.5) {
      scene.space.bumpedAt = scene.time
      const hard = clamp(scene.speed / 200, 0.3, 1.6)
      harm(scene, f, BELT.bump * hard, null, j.x - nx * radius, j.y - ny * radius, j.z)
      sound(scene, 'hit', j.x, j.y, j.z, 0.6, true)
      struckRock(scene, j.x - nx * radius, j.y - ny * radius)
    }
  }
  void dt
}

// ── void shards

/** the shards drifting round each black hole of the system now, into space.shards */
export function stepShards(scene: SceneState) {
  const sp = scene.space
  sp.shards.length = 0
  const t = nowOf(scene)
  for (const b of sp.bodies) {
    if (b.body.kind !== 'black hole') continue
    const period = Math.floor(t / SHARDS.period)
    for (let k = 0; k < SHARDS.count; k++) {
      const id = b.body.index * 1000 + k
      if (sp.shardTaken.get(id) === period) continue
      const h1 = hash2(b.body.index, k, 401)
      const h2 = hash2(b.body.index, k, 409)
      const r = b.body.size * (SHARDS.from + (SHARDS.to - SHARDS.from) * (h1 / 255))
      // (they go round the hole, the nearer the faster)
      const a = (h2 / 255) * Math.PI * 2 + (t * 9) / r
      sp.shards.push({ id, x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r, turn: t * (0.6 + (h1 & 7) * 0.1) })
    }
  }
}

/** the ship flies through a shard: it goes into the hold, if there is room */
export function scoopShards(scene: SceneState) {
  const f = ownFighter(scene)
  if (!f) return
  const j = f.jet
  const sp = scene.space
  const period = Math.floor(nowOf(scene) / SHARDS.period)
  for (const s of sp.shards) {
    if (Math.hypot(s.x - j.x, s.y - j.y) > SHARDS.reach) continue
    if (roomFor(scene.loop.hold, 'void') <= 0) {
      if (scene.time - scene.loop.fullAt > 2.5) {
        scene.loop.fullAt = scene.time
        sound(scene, 'full', j.x, j.y, j.z, 1, true)
      }
      continue
    }
    addTo(scene.loop.hold, 'void', 1)
    sp.shardTaken.set(s.id, period)
    record(scene, { kind: 'mined', items: [{ id: 'void', n: 1 }], world: scene.worldKey })
    news(scene, 'VOID SHARD', 'INTO THE HOLD')
    sound(scene, 'scoop', j.x, j.y, j.z, 1, true)
  }
}

/** gas skimmed from a giant's upper bands into the hold, `n` units at a time */
export function skimGas(scene: SceneState, n: number) {
  const j = scene.jets[0]
  if (roomFor(scene.loop.hold, 'helion') <= 0) {
    if (scene.time - scene.loop.fullAt > 2.5) {
      scene.loop.fullAt = scene.time
      sound(scene, 'full', j.x, j.y, j.z, 1, true)
    }
    return 0
  }
  const got = addTo(scene.loop.hold, 'helion', n)
  if (got > 0) sound(scene, 'scoop', j.x, j.y, j.z, 0.5, true)
  return got
}
