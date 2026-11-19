// The ship's hold (the plan's section 11): a few slots, each a stack of one resource, as
// many slots as the hull has. What is in it is at risk: it spills as a crate when the ship is
// lost, and it only counts once it is landed at a friendly base and banked. A loaded ship is
// slower, turns wider and climbs worse, in proportion to how full it is (data/loop.ts).

import { HOLD, LOAD } from '../data/loop'
import { RESOURCES } from '../data/resources'
import type { ResourceId } from '../data/resources'

/** a stack of one resource */
export interface Stack {
  id: ResourceId
  n: number
}

export interface Hold {
  /** its slots, in order: a slot holds one resource, up to its stack */
  slots: (Stack | null)[]
}

/** some resources, as a plain list (what is banked, spilled, taken from a crate) */
export type Items = Stack[]

/** the slots of a hull's hold (and `extra`, from a cargo pod) */
export const slotsOf = (hull: string, extra = 0) => (HOLD.slots[hull] ?? HOLD.fallback) + extra

export function createHold(hull: string, extra = 0): Hold {
  return { slots: new Array(slotsOf(hull, extra)).fill(null) }
}

/** a hold for another hull (or another fit): what fits comes along (in order), the rest is returned */
export function refitHold(hold: Hold, hull: string, extra = 0): Items {
  const had = takeAll(hold)
  hold.slots = new Array(slotsOf(hull, extra)).fill(null)
  return addItems(hold, had)
}

/** units of resources in it, and how full it is (0..1) */
export function unitsIn(hold: Hold) {
  let n = 0
  for (const s of hold.slots) if (s) n += s.n
  return n
}
export function fillOf(hold: Hold) {
  let room = 0
  for (let i = 0; i < hold.slots.length; i++) room += RESOURCES[hold.slots[i]?.id ?? 'ferrite'].stack
  return room > 0 ? unitsIn(hold) / room : 0
}

/** credits it would fetch at the standard prices */
export function valueOf(items: Items) {
  let v = 0
  for (const s of items) v += RESOURCES[s.id].price * s.n
  return v
}

/** how many units of a resource still fit */
export function roomFor(hold: Hold, id: ResourceId) {
  const stack = RESOURCES[id].stack
  let room = 0
  for (const s of hold.slots) {
    if (!s) room += stack
    else if (s.id === id) room += stack - s.n
  }
  return room
}

/** puts up to `n` units in, topping up a stack of it first; returns how many went in */
export function addTo(hold: Hold, id: ResourceId, n: number) {
  const stack = RESOURCES[id].stack
  let left = n
  for (const s of hold.slots) {
    if (left <= 0) break
    if (s && s.id === id && s.n < stack) {
      const k = Math.min(left, stack - s.n)
      s.n += k
      left -= k
    }
  }
  for (let i = 0; i < hold.slots.length && left > 0; i++) {
    if (hold.slots[i]) continue
    const k = Math.min(left, stack)
    hold.slots[i] = { id, n: k }
    left -= k
  }
  return n - left
}

/** puts in as much of a list as fits; returns what did not */
export function addItems(hold: Hold, items: Items): Items {
  const left: Items = []
  for (const s of items) {
    const went = addTo(hold, s.id, s.n)
    if (went < s.n) left.push({ id: s.id, n: s.n - went })
  }
  return left
}

/** empties it, and returns what was in it (one entry a resource) */
export function takeAll(hold: Hold): Items {
  const out = merge(hold.slots.filter((s): s is Stack => !!s))
  hold.slots.fill(null)
  return out
}

/** a list with one entry a resource, in a fixed order */
export function merge(items: Items): Items {
  const by = new Map<ResourceId, number>()
  for (const s of items) if (s.n > 0) by.set(s.id, (by.get(s.id) ?? 0) + s.n)
  return Object.keys(RESOURCES)
    .filter((id) => by.has(id as ResourceId))
    .map((id) => ({ id: id as ResourceId, n: by.get(id as ResourceId)! }))
}

/** how a load weighs on a ship: shares of its top speed, its turn and its climb (1: an empty hold) */
export function burden(hold: Hold) {
  const f = fillOf(hold)
  return { speed: 1 - LOAD.speed * f, turn: 1 - LOAD.turn * f, climb: 1 - LOAD.climb * f }
}
