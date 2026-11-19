// The market (the plan's section 11, "Economy"): what each base pays for each resource today.
// Prices drift from day to day, and they are worked out from the galaxy's seed and the date
// (UTC), so every player sees the same prices with no market server, and trade routes appear:
// a world pays less for the ore its own ground is full of, and more for what it lacks; and the two
// sides' home systems, where no raiders come, pay less than the frontier.

import { RESOURCES } from '../data/resources'
import type { ResourceId } from '../data/resources'
import { resourceOf } from '../data/resources'
import { hash2 } from '../util/exact'
import { GALAXY_SEED, surfaceById, systemOfKey, theGalaxy } from './galaxy'

/** how far a price wanders from its standard over the days (a share, either way) */
const DRIFT = 0.3
/** days between one turn of a price and the next (it moves smoothly between them) */
const SWING = 3
/**
 * What a world pays for an ore of its own, and for one it lacks (shares of the standard). (Polish step 9: they were 0.82 and
 * 1.22, and a trader who mined at home and sold where his ore was lacking earned what a frontier miner did, for no risk.
 * Danger pays in the ore itself now, data/loop.ts CHUNK.gem; trade pays for knowing the markets.)
 */
const OWN = 0.9
const LACKS = 1.1
/**
 * What a base in a side's home system pays (its worlds' bases and its stations), as a share: home is
 * safe (no raiders come at a pilot of that side there), so its ore earns less than the frontier's,
 * where the risk is. A new pilot earns his first part at home; the better living is further out.
 */
export const HOME_PAY = 0.6

/** the day number of a moment (ms since 1970, UTC): prices are the same all day */
export const dayOf = (ms: number) => Math.floor(ms / 86_400_000)

/** a number for a world, a base and a resource, from 0 to 1, that turns every few days and moves smoothly between */
function wander(world: string, base: number, id: ResourceId, day: number) {
  const salt = (GALAXY_SEED + Number(world.slice(1)) * 131 + base * 17 + Object.keys(RESOURCES).indexOf(id) * 7919) | 0
  const at = Math.floor(day / SWING)
  const k = (day - at * SWING) / SWING
  const a = hash2(at, salt, 5) / 255
  const b = hash2(at + 1, salt, 5) / 255
  // (eased between the turns)
  const e = k * k * (3 - 2 * k)
  return a + (b - a) * e
}

/** credits a base pays for a unit of a resource on a day */
export function priceAt(world: string, base: number, id: ResourceId, day: number) {
  const r = RESOURCES[id]
  const surface = surfaceById(world)
  const found = surface ? surface.recipe.resources.some((x) => resourceOf(x.ore) === id) : false
  // (a station in space, which has no ground of its own, pays the standard for everything; and every base for salvage and a creature's parts)
  const where = id === 'salvage' || r.wild || !surface ? 1 : found ? OWN : LACKS
  const drift = 1 + (wander(world, base, id, day) * 2 - 1) * DRIFT
  const system = surface ? surface.system : systemOfKey(world)
  const home = system >= 0 && !!theGalaxy().systems[system].side ? HOME_PAY : 1
  return Math.max(1, Math.round(r.price * where * drift * home))
}

/** a base's prices today, and how each has moved since yesterday */
export function pricesAt(world: string, base: number, day: number) {
  return Object.values(RESOURCES).map((r) => {
    const today = priceAt(world, base, r.id, day)
    const yesterday = priceAt(world, base, r.id, day - 1)
    return { id: r.id, price: today, change: today - yesterday }
  })
}
