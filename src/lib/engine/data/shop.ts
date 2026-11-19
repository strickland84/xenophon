// What a base's shop sells (the plan's section 11): repairs, missiles, and paint. Weapons and
// modules are in data/loadout.ts, hulls' prices in data/hulls.ts, gear in data/gear.ts. There is
// no crafting tree: a thing costs credits and a few resources from the vault. Starting values, to
// tune by playing.

import { RESOURCES } from './resources'
import type { ResourceId } from './resources'

export const SHOP = {
  /** credits a hull point mended, and a missile */
  repair: 1,
  missile: 30,
  /** credits a new pilot has */
  startCredits: 250,
  /**
   * Ore a price asks for that the vault lacks is made up at the counter, at this many times its standard price (polish
   * step 9: a pilot who only fought made 41 kills in half an hour and could buy nothing, as every part asks for ore; the
   * dogfight is the first pillar, so credits alone buy anything, and ore brought in buys it cheaper)
   */
  makeUp: 2,
}

/**
 * Repairs done where the ship stands, the mining key held at a friendly base or station (sim/repair.ts): hull points
 * mended a second (a hull shot to pieces is whole in four seconds or so), and seconds between the sparks that fly off
 * it. Each point costs SHOP.repair.
 */
export const REPAIR = { rate: 30, spark: 0.07 }

/** what a price comes to for a pilot with this much of each resource banked: the ore taken from his vault, the ore the counter makes up, and the credits in all */
export function payFor(credits: number, needs: { id: ResourceId; n: number }[], banked: (id: ResourceId) => number) {
  const items: { id: ResourceId; n: number }[] = []
  const madeUp: { id: ResourceId; n: number }[] = []
  let total = credits
  for (const s of needs) {
    const have = Math.max(0, Math.min(s.n, banked(s.id)))
    if (have > 0) items.push({ id: s.id, n: have })
    if (have < s.n) {
      madeUp.push({ id: s.id, n: s.n - have })
      total += Math.round((s.n - have) * RESOURCES[s.id].price * SHOP.makeUp)
    }
  }
  return { credits: total, items, madeUp }
}

/** colours a ship can be painted, each bought once (the hull's own and the first paint are free); the last four cannot be bought, only earned by a feat (save/progress.ts) */
export const PAINTS: { name: string; colour: string; price: number; feat?: string }[] = [
  { name: 'Gunmetal', colour: '#545969', price: 0 },
  { name: 'Ember', colour: '#f0580e', price: 0 },
  { name: 'Teal glass', colour: '#1e8ca0', price: 0 },
  { name: 'Bone', colour: '#d8d0bc', price: 120 },
  { name: 'Oxblood', colour: '#6e2228', price: 120 },
  { name: 'Moss', colour: '#4b6a34', price: 120 },
  { name: 'Ice', colour: '#9cc8e8', price: 120 },
  { name: 'Sulphur', colour: '#e8c22c', price: 160 },
  { name: 'Ultramarine', colour: '#2a46c0', price: 160 },
  { name: 'Violet', colour: '#8a4ce0', price: 160 },
  { name: 'Black chrome', colour: '#1c1e26', price: 220 },
  { name: 'White', colour: '#f2f2ee', price: 220 },
  { name: 'Gold leaf', colour: '#d9a628', price: 0, feat: 'namer' },
  { name: 'Bloodline', colour: '#a3141c', price: 0, feat: 'streak' },
  { name: 'Horizon', colour: '#2a1446', price: 0, feat: 'horizon' },
  { name: 'Hauler green', colour: '#2f7a52', price: 0, feat: 'hauler' },
]
