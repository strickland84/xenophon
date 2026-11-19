// Crates (the plan's section 7, "Damage and loss"): a ship that is lost spills its hold as a
// crate at the wreck, which falls to the ground and lies there for a while. Anyone can take
// it, by flying low over it: as much as fits goes into the hold, and the rest stays in it.
// A raider shot down sometimes leaves one of salvage.
//
// In a shared sky the game that owns the lost ship spills the crate and tells the others
// (a 'crate' report); whoever takes from it says so ('crateTaken'), and it is emptied or gone
// everywhere. Two who reach it in the same moment both take it: nothing decides between them.

import { CRATE } from '../data/loop'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { groundAt } from '../world/world'
import { addItems, merge, takeAll, unitsIn } from './cargo'
import type { Hold, Items } from './cargo'
import { sound } from './effects'
import { deltaIn, itemWords, news, record } from './loop'
import { nameOf } from './mining'
import { report } from './room'

export interface Crate {
  /** its number here */
  tag: number
  x: number
  y: number
  z: number
  vz: number
  items: Items
  /** scene time it fell */
  born: number
  /** spilled by this game (a 'crate' report went out for it) */
  own: boolean
}

/** the most crates lying about at once (the oldest go first) */
const CRATES_MOST = 24

/** a crate of `items` falls from (x, y, z); returns its number here */
export function spill(scene: SceneState, x: number, y: number, z: number, items: Items, own: boolean): number {
  const loop = scene.loop
  const tag = loop.crateTag++
  loop.crates.push({ tag, x, y, z, vz: 10, items: merge(items), born: scene.time, own })
  if (loop.crates.length > CRATES_MOST) loop.crates.splice(0, loop.crates.length - CRATES_MOST)
  if (own) report(scene, { kind: 'crate', tag, x, y, z, items: merge(items) })
  return tag
}

/** the player's ship is lost: what was in its hold spills where it was */
export function spillHold(scene: SceneState, j: Jet) {
  const hold = scene.loop.hold
  if (unitsIn(hold) === 0) return
  const items = takeAll(hold)
  spill(scene, j.x, j.y, j.z, items, true)
  record(scene, { kind: 'lost', items, world: scene.worldKey })
  news(scene, 'CARGO LOST', itemWords(items, nameOf), false)
}

/** another game says a crate of its own was emptied of all but `left` (or is gone) */
export function crateChanged(scene: SceneState, tag: number, left: Items) {
  const at = scene.loop.crates.findIndex((c) => c.tag === tag)
  if (at < 0) return
  if (unitsOf(left) === 0) scene.loop.crates.splice(at, 1)
  else scene.loop.crates[at].items = merge(left)
}

const unitsOf = (items: Items) => items.reduce((n, s) => n + s.n, 0)

/** crates fall to the ground; the ship takes what fits from one it flies low over */
export function stepCrates(scene: SceneState, dt: number, j: Jet | null) {
  const list = scene.loop.crates
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    if (scene.time - c.born > CRATE.life) {
      list.splice(i, 1)
      continue
    }
    // (in space it floats where it was spilled)
    const g = groundAt(scene.world, c.x, c.y)
    if (scene.zone.kind === 'space') c.vz = 0
    else if (c.z > g) {
      c.vz -= 120 * dt
      c.z = Math.max(g, c.z + c.vz * dt)
    } else c.z = g
    if (!j || scene.time - c.born < (c.own ? CRATE.ownWait : 1.2)) continue
    const dx = deltaIn(scene, c.x - j.x)
    const dy = deltaIn(scene, c.y - j.y)
    const below = j.z - c.z
    const reach = CRATE.reach * scene.parts.reach
    if (dx * dx + dy * dy > reach * reach || below < -6 || below > CRATE.below) continue
    if (crateTake(scene, c, scene.loop.hold, j) === 0 && scene.time - scene.loop.fullAt > 2.5) {
      scene.loop.fullAt = scene.time
      sound(scene, 'full', j.x, j.y, j.z, 1, true)
    }
  }
}

/** takes what fits from a crate into a hold (the ship's, or a pilot's backpack): returns the units taken; an emptied crate is gone */
export function crateTake(scene: SceneState, c: Crate, hold: Hold, j: Jet) {
  const before = unitsOf(c.items)
  const left = addItems(hold, c.items)
  const took = before - unitsOf(left)
  if (took === 0) return 0
  const taken = takenFrom(c.items, left)
  record(scene, { kind: 'picked', items: taken, world: scene.worldKey })
  news(scene, 'CRATE', itemWords(taken, nameOf))
  sound(scene, 'crate', j.x, j.y, j.z, 1, true)
  report(scene, { kind: 'crateTaken', tag: c.tag, left: merge(left) })
  const list = scene.loop.crates
  if (unitsOf(left) === 0) list.splice(list.indexOf(c), 1)
  else c.items = merge(left)
  return took
}

/** what went from a list, given what is left of it */
function takenFrom(was: Items, left: Items): Items {
  return merge(was.map((s) => ({ id: s.id, n: s.n - (left.find((l) => l.id === s.id)?.n ?? 0) })))
}
