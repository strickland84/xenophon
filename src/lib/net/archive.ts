// The local copy of the persistent world's events (the plan's sections 18 and 19, "Events"): a set
// of signed Nostr events, only ever added to. Whatever an event came from (this pilot, a player in
// the room, a relay), it is let in only once its signature is checked and it reads as one of the
// game's events in this build's namespace (events.ts); one already held is ignored, so merging
// two sets is a union and duplicates do nothing. The world is worked out from the set by the
// engine's rule (galaxy/territory.ts).
//
// It is kept in storage (localStorage on the page) and is the source of truth: relays may forget.
// Events too old to count or show any more are let go (a discovery name never is), and the set
// is held to a size that storage can take.

import type { WorldEvent } from '../engine'
import type { SaveStorage } from '../save/store'
import { readDeed } from './events'
import { isKey, verifyEvent } from './nostr'
import type { NostrEvent } from './nostr'

/** seconds an event is kept: past every lifetime (a ghost or a beacon lasts 14 days) and the rule's two weeks of replay */
export const KEEP = 16 * 86_400
/** events kept at most (the oldest go first; names are kept whatever) */
export const KEEP_MOST = 3000

export interface ArchiveOptions {
  /** the namespace of this build's events (events.ts) */
  ns: string
  /** where it is kept, and under what key (none: in memory only) */
  storage?: SaveStorage | null
  key?: string
}

export class Archive {
  private raw = new Map<string, NostrEvent>()
  private read = new Map<string, WorldEvent>()
  /** ids being checked now, so one that comes from two places at once is checked once */
  private checking = new Map<string, Promise<boolean>>()
  /** one more each time the set changes (to know when to work the world out again) */
  version = 0
  private dirty = false

  constructor(private readonly o: ArchiveOptions) {
    this.load()
  }

  get size() {
    return this.raw.size
  }

  has(id: string) {
    return this.raw.has(id)
  }

  /** every event, as the engine's rule takes them */
  events(): WorldEvent[] {
    return [...this.read.values()]
  }

  /** the newest `most` events as signed (and every name), to hand to another player */
  recent(most: number): NostrEvent[] {
    const list = [...this.raw.values()].sort((a, b) => b.created_at - a.created_at)
    const names = list.filter((e) => this.read.get(e.id)?.kind === 'name')
    const rest = list.filter((e) => this.read.get(e.id)?.kind !== 'name').slice(0, most)
    return [...names, ...rest]
  }

  /** an event from anywhere: let in if it is new, well formed, ours and truly signed; true if it was */
  add(e: unknown): Promise<boolean> {
    if (!e || typeof e !== 'object') return Promise.resolve(false)
    const v = e as NostrEvent
    if (typeof v.id !== 'string' || !isKey(v.pubkey)) return Promise.resolve(false)
    if (this.raw.has(v.id)) return Promise.resolve(false)
    const going = this.checking.get(v.id)
    if (going) return going.then(() => false)
    const deed = readDeed(v, this.o.ns)
    if (!deed) return Promise.resolve(false)
    const check = verifyEvent(v).then((good) => {
      this.checking.delete(v.id)
      if (!good || this.raw.has(v.id)) return false
      const clean: NostrEvent = {
        id: v.id,
        pubkey: v.pubkey,
        created_at: v.created_at,
        kind: v.kind,
        tags: v.tags,
        content: v.content,
        sig: v.sig,
      }
      this.raw.set(v.id, clean)
      this.read.set(v.id, deed)
      this.version++
      this.dirty = true
      return true
    })
    this.checking.set(v.id, check)
    return check
  }

  /** many at once: how many were new */
  async addAll(list: unknown[]): Promise<number> {
    const done = await Promise.all(list.map((e) => this.add(e)))
    return done.filter(Boolean).length
  }

  /** resolves once every event being checked now has been */
  async settled() {
    while (this.checking.size) await Promise.allSettled([...this.checking.values()])
  }

  /** lets go of events too old to matter at `now` (seconds since 1970), and the oldest beyond KEEP_MOST */
  prune(now: number) {
    const names = (id: string) => this.read.get(id)?.kind === 'name'
    let list = [...this.raw.values()].filter((e) => names(e.id) || e.created_at > now - KEEP)
    if (list.length > KEEP_MOST) {
      const kept = list.filter((e) => names(e.id))
      const rest = list.filter((e) => !names(e.id)).sort((a, b) => b.created_at - a.created_at)
      list = [...kept, ...rest.slice(0, Math.max(0, KEEP_MOST - kept.length))]
    }
    if (list.length === this.raw.size) return
    const keep = new Set(list.map((e) => e.id))
    for (const id of [...this.raw.keys()])
      if (!keep.has(id)) {
        this.raw.delete(id)
        this.read.delete(id)
      }
    this.version++
    this.dirty = true
  }

  /** writes the set to storage, if it changed */
  save() {
    if (!this.dirty || !this.o.storage || !this.o.key) return
    try {
      this.o.storage.setItem(this.o.key, JSON.stringify([...this.raw.values()]))
      this.dirty = false
    } catch {
      // (full: the oldest half is let go, and it is tried once more)
      const list = [...this.raw.values()].sort((a, b) => b.created_at - a.created_at)
      for (const e of list.slice(Math.floor(list.length / 2))) {
        if (this.read.get(e.id)?.kind === 'name') continue
        this.raw.delete(e.id)
        this.read.delete(e.id)
      }
      try {
        this.o.storage.setItem(this.o.key, JSON.stringify([...this.raw.values()]))
        this.dirty = false
      } catch {
        // (storage will not take it: it lives in memory this session)
      }
    }
  }

  /** what storage holds (it was checked when it was let in, so it is trusted as it is) */
  private load() {
    if (!this.o.storage || !this.o.key) return
    let list: unknown
    try {
      list = JSON.parse(this.o.storage.getItem(this.o.key) ?? '[]')
    } catch {
      return
    }
    if (!Array.isArray(list)) return
    for (const e of list) {
      const v = e as NostrEvent
      if (!v || typeof v.id !== 'string' || !isKey(v.pubkey)) continue
      const deed = readDeed(v, this.o.ns)
      if (!deed) continue
      this.raw.set(v.id, v)
      this.read.set(v.id, deed)
    }
    this.version++
  }
}
