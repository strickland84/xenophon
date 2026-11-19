// Veins (Phase 5): ore showing in the rock where a ship cannot set down — on broken, terraced
// ground and under the trees — too fine for a ship's laser, cut by hand by a pilot on foot. A
// vein holds less than an outcrop but more of a dearer ore, and lands straight in the backpack.
//
// Where they lie follows from the world alone (its key, its ground, its bases and outcrops),
// with exact arithmetic, so every player finds the same veins. Like the outcrops, each holds so
// much in each of its periods on the clock every player shares, and the network says what is
// taken ('vein' reports), so everyone agrees how much is left.

import { LAND } from '../data/loop'
import { VEIN } from '../data/foot'
import { RESOURCES, resourceOf } from '../data/resources'
import type { ResourceId } from '../data/resources'
import type { SceneState } from '../state'
import { mulberry32 } from '../util/math'
import { landable } from '../world/features'
import { groundAt, matAt, N, treeAt } from '../world/world'
import type { World } from '../world/world'
import { nowOf, wrapDelta } from './loop'

export interface Vein {
  /** its number among the world's veins */
  id: number
  x: number
  y: number
  /** the ground it lies on */
  z: number
  ore: ResourceId
  /** under trees (it shows less from above) */
  under: boolean
  /** units it holds at the start of each period, seconds a period lasts, and seconds its first began before the clock's zero */
  stock: number
  period: number
  offset: number
}

/** a number from a world's key, to seed where its veins lie */
function seedOf(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return h | 0
}

/** true where a ship could not set down: the ground round a point is not level, or it is under trees */
function rough(world: World, x: number, y: number) {
  if (treeAt(world, x, y)) return true
  let lo = 99
  let hi = 0
  for (let i = -2; i <= 2; i++)
    for (let k = -2; k <= 2; k++) {
      const h = groundAt(world, x + i * 5, y + k * 5)
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
  return hi - lo > LAND.flat + 1
}

/** the veins of the world the scene is over (none without bases: the island world of the settings) */
export function placeVeins(scene: SceneState): Vein[] {
  const { world, planet } = scene
  const { bases, outcrops } = world.features
  if (!planet || !bases.length) return []
  const ores = planet.resources.map((r) => resourceOf(r.ore))
  // (a vein holds the dearer of its world's ores, mostly)
  const dear = [...ores].sort((a, b) => RESOURCES[b].price - RESOURCES[a].price)
  const rnd = mulberry32(seedOf(scene.worldKey) ^ 0x5eed)
  const out: Vein[] = []
  for (let tries = 0; tries < VEIN.count * 60 && out.length < VEIN.count; tries++) {
    const x = Math.floor(rnd() * N)
    const y = Math.floor(rnd() * N)
    const pick = rnd()
    const m = matAt(world, x, y)
    if (m < 4 || !landable(m) || !rough(world, x, y)) continue
    if (bases.some((b) => Math.hypot(wrapDelta(b.x - x), wrapDelta(b.y - y)) < VEIN.awayFromBases)) continue
    if (outcrops.some((o) => Math.hypot(wrapDelta(o.x - x), wrapDelta(o.y - y)) < 40)) continue
    if (out.some((v) => Math.hypot(wrapDelta(v.x - x), wrapDelta(v.y - y)) < VEIN.apart)) continue
    const id = out.length
    out.push({
      id,
      x,
      y,
      z: groundAt(world, x, y),
      ore: pick < 0.75 ? dear[0] : dear[dear.length - 1],
      under: treeAt(world, x, y),
      stock: VEIN.stock,
      period: 480 + Math.floor(rnd() * 420),
      offset: Math.floor(rnd() * 900),
    })
  }
  return out
}

/** which period a vein is in, at `now` seconds since 1970 */
export const veinPeriod = (v: Vein, now: number) => Math.floor((now + v.offset) / v.period)

/** units a vein has left now */
export function veinLeft(scene: SceneState, v: Vein) {
  const t = scene.foot.veinTaken.get(v.id)
  if (!t || t.epoch !== veinPeriod(v, nowOf(scene))) return v.stock
  return Math.max(0, v.stock - t.n)
}

/** `n` units taken from a vein in period `epoch` (by this game, or as another says) */
export function takeFromVein(scene: SceneState, v: Vein, epoch: number, n: number) {
  if (epoch !== veinPeriod(v, nowOf(scene))) return
  const t = scene.foot.veinTaken.get(v.id)
  if (!t || t.epoch !== epoch) scene.foot.veinTaken.set(v.id, { epoch, n })
  else t.n += n
}

/** the vein with ore left nearest a point, within `reach` px across (null: none) */
export function veinNear(scene: SceneState, x: number, y: number, reach: number): Vein | null {
  let best: Vein | null = null
  let bestD = reach
  for (const v of scene.foot.veins) {
    const d = Math.hypot(wrapDelta(v.x - x), wrapDelta(v.y - y))
    if (d > bestD || veinLeft(scene, v) <= 0) continue
    best = v
    bestD = d
  }
  return best
}

/** the vein with ore left nearest a point (as near as the wrap allows), and where it is: for the HUD and the page */
export function nearestVein(scene: SceneState, x: number, y: number) {
  let best: { id: number; x: number; y: number; z: number; ore: string; left: number } | null = null
  let bestD = Infinity
  for (const v of scene.foot.veins) {
    const left = veinLeft(scene, v)
    if (left <= 0) continue
    const dx = wrapDelta(v.x - x)
    const dy = wrapDelta(v.y - y)
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = { id: v.id, x: x + dx, y: y + dy, z: v.z, ore: v.ore, left }
    }
  }
  return best
}
