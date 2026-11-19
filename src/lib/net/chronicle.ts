// The persistent world, kept and passed on (the plan's section 18, "Persistent events" and
// "Presence"). A chronicle holds the pilot's archive of signed events (archive.ts) and:
//
//   - signs what the pilot does that the galaxy remembers (a flag, a delivery, a kill, a wreck, a
//     grave, a beacon, a ghost, a name), keeps it, sends it to the relays, and hands it to the room
//     (session.ts passes it to every pilot there, and passes theirs back);
//   - asks the relays for the namespace's events of the last weeks, and every name ever given, and
//     keeps listening for new ones, so the map changes between sessions: what was done while the
//     pilot was away is waiting on the relays when he comes back;
//   - says once a minute where the pilot is, his side and his bounty (his presence), and listens
//     for everyone else's: the galaxy map counts them to show where the pilots are;
//   - works the galaxy out from the archive with the engine's rule (galaxyState).
//
// With no relays (alone, or `?net=off`) all of it still works against the local copy. Time is
// handed in (ms since 1970), so the tests run it on a simulated clock against relays in memory.

import { galaxyState } from '../engine'
import type { GalaxyState, WorldEvent } from '../engine'
import type { SaveStorage } from '../save/store'
import { Archive, KEEP } from './archive'
import { KIND_PRESENCE, KIND_WORLD_EVENT, namesTag, readPresence, signDeed, signPresence } from './events'
import type { Deed, Presence } from './events'
import { publicKeyOf, verifyEvent } from './nostr'
import type { NostrEvent } from './nostr'
import { RelayPool } from './relays'
import { PROTOCOL_VERSION } from './rooms'
import type { Dial, RelayHealth } from './relays'

/** ms between heartbeats, and seconds a heartbeat counts for (a little over two, in case one is late) */
export const HEARTBEAT_EVERY = 60_000
export const PRESENCE_FRESH = 150
/** ms between workings-out of the galaxy when nothing new has come (deeds fade on the clock) */
const STATE_EVERY = 30_000
/** ms between prunings and savings of the archive */
const KEEP_EVERY = 20_000

/**
 * The relays the game keeps its events on unless told otherwise: of twelve public relays checked on
 * 17 November 2026 (tools/relay-check.ts; docs/serverless-multiplayer-research.md, "Checked in Phase
 * 7"), the six that took both kinds the game publishes and handed them back by kind and tag, and keep
 * what they are sent on disk (strfry and Ditto; snort's relay keeps them only in memory).
 */
export const DEFAULT_RELAYS = [
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.nostr.net',
  'wss://nostr.mom',
  'wss://offchain.pub',
  'wss://relay.ditto.pub',
]

export interface ChronicleOptions {
  secret: string
  /** the namespace of this build's events (events.ts namespaceOf) */
  ns: string
  /** the relays to keep events on (none: alone) */
  relays: string[]
  /** how to reach them (null: alone) */
  dial: Dial | null
  /** ms since 1970: the page's Date.now, or the test's clock */
  clock: () => number
  /** where the archive is kept, and under what key */
  storage?: SaveStorage | null
  key?: string
}

export interface PresenceCounts {
  /** pilots heard from lately (this one too), freshest first */
  pilots: Presence[]
  bySide: { nomarchy: number; anarchoi: number }
  /** pilots by zone ('w12', 's3'), by side */
  byZone: Record<string, { nomarchy: number; anarchoi: number }>
}

export class Chronicle {
  readonly key: string
  readonly archive: Archive
  readonly pool: RelayPool | null
  private readonly o: ChronicleOptions
  /** who hears each event as it is made or let in (the room) */
  private listeners: ((e: NostrEvent) => void)[] = []
  private presence = new Map<string, Presence>()
  private cached: { state: GalaxyState; version: number; at: number } | null = null
  private keptAt = 0
  private pending = new Set<Promise<unknown>>()
  /** the pilot's own events made so far (by id), so that a page can tell what came of them */
  readonly own = new Set<string>()
  /** the newest wire heard in a pilot's presence (rooms.ts PROTOCOL_VERSION): above this build's, this build is old */
  newestProtocol = 0

  constructor(o: ChronicleOptions) {
    this.o = o
    this.key = publicKeyOf(o.secret)
    this.archive = new Archive({ ns: o.ns, storage: o.storage, key: o.key })
    this.pool = o.dial && o.relays.length ? new RelayPool({ urls: o.relays, dial: o.dial, clock: o.clock }) : null
    const now = this.seconds()
    this.archive.prune(now)
    if (this.pool) {
      this.pool.subscribe(
        'world',
        [
          { kinds: [KIND_WORLD_EVENT], '#t': [o.ns], since: now - KEEP },
          { kinds: [KIND_WORLD_EVENT], '#t': [namesTag(o.ns)] },
        ],
        (e) => void this.track(this.archive.add(e).then((fresh) => fresh && this.tell(e))),
      )
      this.pool.subscribe(
        'presence',
        [{ kinds: [KIND_PRESENCE], '#t': [o.ns], since: now - PRESENCE_FRESH * 2 }],
        (e) => void this.track(this.hearPresence(e)),
      )
      this.pool.tick()
    }
  }

  private seconds() {
    return Math.floor(this.o.clock() / 1000)
  }

  private track<T>(work: Promise<T>) {
    this.pending.add(work)
    const done = () => void this.pending.delete(work)
    work.then(done, done)
    return work
  }

  /** resolves once all the signing and checking begun so far is done */
  async settled() {
    while (this.pending.size) await Promise.allSettled([...this.pending])
    await this.archive.settled()
  }

  /** someone (the room) wants to hear of every event as it is made here or let in */
  listen(fn: (e: NostrEvent) => void) {
    this.listeners.push(fn)
    return () => {
      this.listeners = this.listeners.filter((x) => x !== fn)
    }
  }

  private tell(e: NostrEvent) {
    for (const fn of this.listeners) fn(e)
  }

  /** something the pilot did that the galaxy remembers: signed now, kept, sent to the relays and the room */
  record(d: Deed): Promise<WorldEvent | null> {
    return this.track(
      (async () => {
        const e = await signDeed(this.o.secret, d, this.seconds(), this.o.ns)
        this.own.add(e.id)
        const fresh = await this.archive.add(e)
        if (!fresh) return null
        this.pool?.publish(e)
        this.tell(e)
        return this.archive.events().find((x) => x.id === e.id) ?? null
      })(),
    )
  }

  /** events another player handed over (in the room): each is checked and let in if new */
  receive(list: unknown[]) {
    for (const e of list) void this.track(this.archive.add(e))
  }

  /** the newest events, to hand to a player who has just come into the room */
  forNewcomer(most = 150) {
    return this.archive.recent(most)
  }

  /** the pilot's presence: where he is, his side, his bounty (sent once a minute by the page) */
  heartbeat(p: Omit<Presence, 'key' | 'at' | 'protocol'>) {
    const at = this.seconds()
    this.presence.set(this.key, { ...p, key: this.key, at, protocol: PROTOCOL_VERSION })
    if (!this.pool) return
    void this.track(signPresence(this.o.secret, p, at, this.o.ns).then((e) => this.pool?.publish(e)))
  }

  private async hearPresence(e: NostrEvent) {
    const p = readPresence(e, this.o.ns)
    if (!p || p.key === this.key) return
    const known = this.presence.get(p.key)
    if (known && known.at >= p.at) return
    if (!(await verifyEvent(e))) return
    this.presence.set(p.key, p)
    this.newestProtocol = Math.max(this.newestProtocol, p.protocol)
  }

  /** a pilot was heard flying a newer build than this (its wire's version), or 0 */
  newerProtocol() {
    return this.newestProtocol > PROTOCOL_VERSION ? this.newestProtocol : 0
  }

  /** who has been heard from lately, and where */
  pilotsNow(): PresenceCounts {
    const now = this.seconds()
    const pilots = [...this.presence.values()].filter((p) => p.at > now - PRESENCE_FRESH).sort((a, b) => b.at - a.at)
    const bySide = { nomarchy: 0, anarchoi: 0 }
    const byZone: PresenceCounts['byZone'] = {}
    for (const p of pilots) {
      bySide[p.side]++
      const z = (byZone[p.zone] ??= { nomarchy: 0, anarchoi: 0 })
      z[p.side]++
    }
    return { pilots, bySide, byZone }
  }

  /** the galaxy as the archive leaves it now (worked out again when something new comes, or every half minute) */
  state(): GalaxyState {
    const ms = this.o.clock()
    const c = this.cached
    if (c && c.version === this.archive.version && ms - c.at < STATE_EVERY) return c.state
    const state = galaxyState(this.archive.events(), Math.floor(ms / 1000))
    this.cached = { state, version: this.archive.version, at: ms }
    return state
  }

  /** once in a while (the page's timer, the test's clock): the relays are tried and sent to, and the archive pruned and saved */
  tick() {
    this.pool?.tick()
    const ms = this.o.clock()
    if (ms - this.keptAt > KEEP_EVERY) {
      this.keptAt = ms
      this.archive.prune(this.seconds())
      this.archive.save()
    }
  }

  health(): { relays: RelayHealth[]; events: number; waiting: number } {
    return { relays: this.pool?.health() ?? [], events: this.archive.size, waiting: this.pool?.waiting ?? 0 }
  }

  close() {
    this.archive.save()
    this.pool?.close()
    this.listeners = []
  }
}
