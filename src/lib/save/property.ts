// What a pilot owns (the plan's section 19, "Property"): kept as a log of what happened, and
// the totals worked out from it. The vault (everything banked, safe, the same at every base),
// the wallet of credits, and what has been bought for good (parts, paint). The hold is not
// here: it is at risk, and lives in the ship (the scene) until it is banked.
//
// Nothing checks the log yet; it is what later anti-cheat would check (banked against mined,
// spent against earned). A long log is folded: its oldest entries become one 'carry' entry
// holding what they came to.

import { isResource, RESOURCES, SHOP } from '../engine'
import type { Items, LedgerEntry, ResourceId } from '../engine'

/** one thing that happened to a pilot's property: `t` ms since 1970 */
export type Entry =
  /** ore into the hold, a hold banked into the vault, a hold lost, a crate taken into the hold (`at`: the world, or the base) */
  | { t: number; k: 'mined' | 'bank' | 'lost' | 'picked'; items: Items; at: string }
  /** credits earned for a kill, or paid for a new ship */
  | { t: number; k: 'bounty' | 'fee'; credits: number; what: string }
  /** resources sold from the vault at a base */
  | { t: number; k: 'sold'; items: Items; credits: number; at: string }
  /** something bought at a base: a part or a paint for good ('part:tractor', 'paint:#2a46c0'), or missiles or repairs; `items` the resources it took from the vault */
  | { t: number; k: 'bought'; what: string; credits: number; items: Items; at: string }
  /** resources moved from the vault into the hold (+), or from the hold into the vault (−: `items` negative) */
  | { t: number; k: 'load'; items: Items; at: string }
  /** what the older entries of a long log came to */
  | { t: number; k: 'carry'; vault: Items; credits: number; owned: string[] }

export interface Property {
  log: Entry[]
}

export interface Totals {
  /** the vault, one entry a resource */
  vault: Items
  credits: number
  /** what has been bought for good (hulls, weapons, modules, gear, paint: 'hull:lance', 'module:scanner' …) */
  owned: string[]
  /** how many of each thing bought by the piece (furniture: 'furn:bunk') */
  counts: Record<string, number>
}

/** the most entries kept before the oldest are folded into one */
const LOG_MOST = 1500
const LOG_FOLD = 1000

export const newProperty = (): Property => ({ log: [] })

/** what the log comes to */
export function totalsOf(p: Property): Totals {
  const vault = new Map<ResourceId, number>()
  let credits = SHOP.startCredits
  const owned = new Set<string>()
  const counts: Record<string, number> = {}
  const add = (items: Items, sign: number) => {
    for (const s of items) vault.set(s.id, (vault.get(s.id) ?? 0) + sign * s.n)
  }
  for (const e of p.log) {
    switch (e.k) {
      case 'carry':
        vault.clear()
        add(e.vault, 1)
        credits = e.credits
        owned.clear()
        for (const o of e.owned) {
          // (furniture is kept by the piece: 'furn:bunk*3')
          const [what, n] = o.split('*')
          if (n) counts[what] = Number(n) || 0
          else owned.add(o)
        }
        break
      case 'bank':
        add(e.items, 1)
        break
      case 'load':
        add(e.items, -1)
        break
      case 'sold':
        add(e.items, -1)
        credits += e.credits
        break
      case 'bought':
        add(e.items, -1)
        credits -= e.credits
        if (/^(part|paint|hull|weapon|module|gear):/.test(e.what)) owned.add(e.what)
        if (e.what.startsWith('furn:')) counts[e.what] = (counts[e.what] ?? 0) + 1
        break
      case 'bounty':
        credits += e.credits
        break
      case 'fee':
        credits -= e.credits
        break
    }
  }
  return {
    vault: Object.keys(RESOURCES)
      .filter((id) => (vault.get(id as ResourceId) ?? 0) > 0)
      .map((id) => ({ id: id as ResourceId, n: vault.get(id as ResourceId)! })),
    credits: Math.max(0, Math.round(credits)),
    owned: [...owned],
    counts,
  }
}

/** something happened: it goes in the log (folded, if the log has grown long) */
export function append(p: Property, e: Entry) {
  p.log.push(e)
  if (p.log.length > LOG_MOST) {
    const old = { log: p.log.slice(0, LOG_FOLD) }
    const sum = totalsOf(old)
    p.log = [
      {
        t: old.log[old.log.length - 1].t,
        k: 'carry',
        vault: sum.vault,
        credits: sum.credits,
        owned: [...sum.owned, ...Object.entries(sum.counts).map(([w, n]) => `${w}*${n}`)],
      },
      ...p.log.slice(LOG_FOLD),
    ]
  }
}

/** what the scene says happened (Scene.takeLedger), as entries: a fee only as far as the wallet goes */
export function fromLedger(p: Property, l: LedgerEntry, t: number): Entry | null {
  switch (l.kind) {
    case 'mined':
    case 'lost':
    case 'picked':
      return { t, k: l.kind, items: l.items, at: l.world }
    case 'bank':
      return { t, k: 'bank', items: l.items, at: `${l.world}/${l.base}` }
    case 'bounty':
      return { t, k: 'bounty', credits: l.credits, what: l.what }
    case 'fee': {
      const credits = Math.min(l.credits, totalsOf(p).credits)
      return credits > 0 ? { t, k: 'fee', credits, what: l.hull } : null
    }
    case 'repair': {
      // (the hull mended where the ship stood: bought, as a repair from the base's screen is, as far as the wallet goes)
      const credits = Math.min(l.credits, totalsOf(p).credits)
      return credits > 0 ? { t, k: 'bought', what: 'repair', credits, items: [], at: l.base } : null
    }
  }
}

/** how many of a resource the vault holds */
export const inVault = (t: Totals, id: ResourceId) => t.vault.find((s) => s.id === id)?.n ?? 0

/** a log read from a save, checked entry by entry: anything that does not make sense is left out */
export function readProperty(raw: unknown): Property {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { log?: unknown }).log) ? (raw as { log: unknown[] }).log : []
  const items = (v: unknown): Items =>
    Array.isArray(v)
      ? v.filter((s) => s && isResource(s.id) && Number.isFinite(s.n)).map((s) => ({ id: s.id as ResourceId, n: Math.round(s.n) }))
      : []
  const num = (v: unknown) => (Number.isFinite(v) ? Number(v) : 0)
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const log: Entry[] = []
  for (const e of list) {
    if (!e || typeof e !== 'object') continue
    const r = e as Record<string, unknown>
    const t = num(r.t)
    switch (r.k) {
      case 'mined':
      case 'bank':
      case 'lost':
      case 'picked':
        log.push({ t, k: r.k, items: items(r.items), at: str(r.at) })
        break
      case 'bounty':
      case 'fee':
        log.push({ t, k: r.k, credits: num(r.credits), what: str(r.what) })
        break
      case 'sold':
        log.push({ t, k: 'sold', items: items(r.items), credits: num(r.credits), at: str(r.at) })
        break
      case 'bought':
        log.push({ t, k: 'bought', what: str(r.what), credits: num(r.credits), items: items(r.items), at: str(r.at) })
        break
      case 'load':
        log.push({ t, k: 'load', items: items(r.items), at: str(r.at) })
        break
      case 'carry':
        log.push({
          t,
          k: 'carry',
          vault: items(r.vault),
          credits: num(r.credits),
          owned: Array.isArray(r.owned) ? r.owned.filter((o) => typeof o === 'string') : [],
        })
        break
    }
  }
  return { log }
}

/** how a pilot has earned his living so far, by the log: by fighting (bounties) or by mining (ore sold); for the ship the tips point him to */
export function earnsBy(p: Property): 'fight' | 'mine' {
  let fight = 0
  let mine = 0
  for (const e of p.log) {
    if (e.k === 'bounty') fight += e.credits
    if (e.k === 'sold') mine += e.credits
  }
  return fight > mine ? 'fight' : 'mine'
}
