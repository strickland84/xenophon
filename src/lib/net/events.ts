// The persistent world's events as they travel (the plan's section 18): each thing a pilot does
// that the galaxy remembers (galaxy/territory.ts in the engine) is a Nostr event signed with his
// key, so anyone can check who did it, and relays keep it when nobody is online.
//
//   kind 7451    a world event: kept by relays (Nostr's "regular" kinds, 1000 to 9999)
//   kind 17451   a pilot's presence: replaceable (10000 to 19999), so a relay keeps only his latest
//
// Every event carries its namespace as a `t` tag: the game's version, and whether it comes from a
// development build ('xenophon-dev-g1') or a release ('xenophon-g1'), so the two can never mix. A
// world's discovery name also carries the namespace's names tag, so it can be asked for on its own
// (names last for good; everything else is asked for from the last few weeks only).
//
// The content is a small JSON object with short field names. Nothing here touches the page.

import { EVENT_KINDS, GHOST, surfaceById } from '../engine'
import type { EventKind, WorldEvent } from '../engine'
import { isFaction } from '../save/pilot'
import { signEvent } from './nostr'
import type { NostrEvent } from './nostr'
import { GAME_VERSION, PROTOCOL_VERSION } from './rooms'

export const KIND_WORLD_EVENT = 7451
export const KIND_PRESENCE = 17451

/** the namespace of a build's events: development builds and releases never see each other's */
export const namespaceOf = (dev: boolean) => `xenophon-${dev ? 'dev-' : ''}g${GAME_VERSION}`
/** the tag that marks a discovery name within a namespace */
export const namesTag = (ns: string) => `${ns}-names`

/** what a pilot says when he does something the galaxy remembers (the id, key and time come from signing it) */
export type Deed = Omit<WorldEvent, 'id' | 'by' | 'at'>

const r1 = (v: number) => Math.round(v * 10) / 10

/** a deed, signed with `secret` at `at` (seconds since 1970) */
export async function signDeed(secret: string, d: Deed, at: number, ns: string): Promise<NostrEvent> {
  const content: Record<string, unknown> = { k: d.kind, w: d.world, s: d.side, c: d.callsign, x: r1(d.x), y: r1(d.y), z: r1(d.z), n: d.n }
  if (d.name) content.name = d.name
  if (d.hull) content.hull = d.hull
  if (d.path) content.path = d.path.map(r1)
  const tags = [['t', ns]]
  if (d.kind === 'name') tags.push(['t', namesTag(ns)])
  return signEvent(secret, { kind: KIND_WORLD_EVENT, tags, content: JSON.stringify(content), created_at: at })
}

const str = (v: unknown, most: number) => (typeof v === 'string' ? v.slice(0, most) : '')
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)

/** true if an event is in namespace `ns` */
export const inNamespace = (e: NostrEvent, ns: string) => e.tags.some((t) => t[0] === 't' && t[1] === ns)

/** a world event read from a signed one (null: not one of ours, or not well formed); its signature is checked elsewhere (archive.ts) */
export function readDeed(e: NostrEvent, ns: string): WorldEvent | null {
  if (e.kind !== KIND_WORLD_EVENT || !inNamespace(e, ns)) return null
  let c: Record<string, unknown>
  try {
    c = JSON.parse(e.content)
  } catch {
    return null
  }
  if (!c || typeof c !== 'object') return null
  const kind = c.k as EventKind
  if (!EVENT_KINDS.includes(kind) || !isFaction(c.s) || typeof c.w !== 'string' || !surfaceById(c.w)) return null
  const out: WorldEvent = {
    id: e.id,
    by: e.pubkey,
    at: e.created_at,
    kind,
    world: c.w,
    side: c.s,
    callsign: str(c.c, 16),
    x: num(c.x),
    y: num(c.y),
    z: num(c.z),
    n: num(c.n),
  }
  if (![out.x, out.y, out.z, out.n].every(Number.isFinite)) return null
  if (typeof c.name === 'string') out.name = c.name.slice(0, 24)
  if (typeof c.hull === 'string') out.hull = c.hull.slice(0, 16)
  if (Array.isArray(c.path)) {
    // (a ghost: four numbers a sample, at most its longest flight)
    const most = GHOST.rate * GHOST.longest * 4
    const path = c.path.slice(0, most).map(num)
    if (path.length % 4 === 0 && path.every(Number.isFinite)) out.path = path
  }
  return out
}

/** what a pilot's presence says: his side, the zone he is in, his bounty, callsign and rank, and the wire his build speaks */
export interface Presence {
  key: string
  side: 'nomarchy' | 'anarchoi'
  zone: string
  bounty: number
  callsign: string
  rank: number
  /** seconds since 1970 it was said */
  at: number
  /** the version of the wire his build speaks (rooms.ts PROTOCOL_VERSION; 0: a build from before it was said) */
  protocol: number
}

/** a pilot's presence, signed */
export function signPresence(secret: string, p: Omit<Presence, 'key' | 'at' | 'protocol'>, at: number, ns: string) {
  const content = JSON.stringify({ s: p.side, z: p.zone, b: p.bounty, c: p.callsign, r: p.rank, p: PROTOCOL_VERSION })
  return signEvent(secret, { kind: KIND_PRESENCE, tags: [['t', ns]], content, created_at: at })
}

/** a pilot's presence read from a signed event (null: not one of ours) */
export function readPresence(e: NostrEvent, ns: string): Presence | null {
  if (e.kind !== KIND_PRESENCE || !inNamespace(e, ns)) return null
  try {
    const c = JSON.parse(e.content)
    if (!isFaction(c?.s) || typeof c.z !== 'string') return null
    return {
      key: e.pubkey,
      side: c.s,
      zone: c.z.slice(0, 12),
      bounty: Math.max(0, Math.min(100_000, Math.floor(num(c.b) || 0))),
      callsign: str(c.c, 16),
      rank: Math.max(0, Math.min(5, Math.floor(num(c.r) || 0))),
      at: e.created_at,
      protocol: Math.max(0, Math.min(999, Math.floor(num(c.p) || 0))),
    }
  } catch {
    return null
  }
}
