// A Nostr relay in memory, for the tests (and for trying things without the internet): it keeps
// events, answers questions (NIP-01: EVENT, REQ, CLOSE; OK, EOSE, CLOSED, NOTICE), and sends new
// events on to every question still open, as a real relay does. It can be made as unhelpful as
// the real ones on purpose: slow (every message waits), sending each event twice, keeping events
// only so long, forgetting everything, refusing every event, accepting only some kinds, or down.
// Replaceable kinds (10000 to 19999) keep only each pilot's latest, and addressable ones (30000 to
// 39999) his latest of each `d` tag. Time is handed in.

import { matches } from './relays'
import type { Dial, Filter } from './relays'
import type { NostrEvent } from './nostr'

export interface FakeRelayOptions {
  /** ms every message to a client waits */
  delay: number
  /** every event sent to a client is sent twice */
  duplicates: boolean
  /** every event is refused, with this reason (null: taken) */
  refuse: string | null
  /** connections are refused */
  down: boolean
  /** only these kinds are taken (null: any) */
  kinds: number[] | null
  /** seconds an event is kept after its time (by the clock), then forgotten (null: for good) */
  keepFor: number | null
}

interface Client {
  on: { open(): void; message(text: string): void; close(why: string): void }
  subs: Map<string, Filter[]>
  open: boolean
}

export class FakeRelay {
  readonly url: string
  options: FakeRelayOptions
  private stored = new Map<string, NostrEvent>()
  private clients = new Set<Client>()
  /** messages on their way to clients (or, with `run`, a connection opening or refused) */
  private queue: { due: number; n: number; client: Client; text: string; run?: () => void }[] = []
  private count = 0
  /** events it was sent, taken or not (for the tests to count) */
  received = 0

  constructor(
    url: string,
    private readonly clock: () => number,
    options: Partial<FakeRelayOptions> = {},
  ) {
    this.url = url
    this.options = { delay: 0, duplicates: false, refuse: null, down: false, kinds: null, keepFor: null, ...options }
  }

  /** what it keeps now */
  get events() {
    this.drop()
    return [...this.stored.values()]
  }

  /** it forgets everything it kept */
  forget() {
    this.stored.clear()
  }

  /** every client is cut off (they will try again) */
  cut() {
    for (const c of [...this.clients]) this.closeClient(c, 'cut off')
  }

  /** a client connects to it */
  connect(on: Client['on']) {
    const client: Client = { on, subs: new Map(), open: !this.options.down }
    if (this.options.down) {
      this.later(client, '', () => on.close('refused'))
      return { send() {}, close() {} }
    }
    this.clients.add(client)
    this.later(client, '', () => on.open())
    return {
      send: (text: string) => this.from(client, text),
      close: () => this.closeClient(client, ''),
    }
  }

  /** messages whose wait is over reach their clients */
  tick() {
    const now = this.clock()
    this.queue.sort((a, b) => a.due - b.due || a.n - b.n)
    let i = 0
    while (i < this.queue.length && this.queue[i].due <= now) {
      const q = this.queue[i++]
      if (q.run) q.run()
      else if (q.client.open) q.client.on.message(q.text)
    }
    this.queue.splice(0, i)
  }

  private later(client: Client, text: string, run?: () => void) {
    this.queue.push({ due: this.clock() + this.options.delay, n: this.count++, client, text, run })
  }

  private send(client: Client, msg: unknown[]) {
    this.later(client, JSON.stringify(msg))
  }

  private closeClient(c: Client, why: string) {
    if (!c.open) return
    c.open = false
    this.clients.delete(c)
    c.on.close(why)
  }

  /** forgets what it keeps no longer */
  private drop() {
    const keep = this.options.keepFor
    if (keep === null) return
    const now = this.clock() / 1000
    for (const [id, e] of this.stored) if (e.created_at < now - keep) this.stored.delete(id)
  }

  private from(client: Client, text: string) {
    if (!client.open) return
    let m: unknown[]
    try {
      m = JSON.parse(text)
    } catch {
      this.send(client, ['NOTICE', 'could not read that'])
      return
    }
    if (m[0] === 'EVENT') {
      const e = m[1] as NostrEvent
      this.received++
      if (this.options.refuse !== null) return this.send(client, ['OK', e.id, false, this.options.refuse])
      if (this.options.kinds && !this.options.kinds.includes(e.kind))
        return this.send(client, ['OK', e.id, false, 'blocked: kind not accepted'])
      if (this.stored.has(e.id)) return this.send(client, ['OK', e.id, true, 'duplicate: already have it'])
      // (replaceable kinds keep each pilot's latest; the addressable ones, 30000 to 39999, his latest of each `d` tag)
      const dOf = (x: NostrEvent) => x.tags.find((t) => t[0] === 'd')?.[1] ?? ''
      const addressable = e.kind >= 30000 && e.kind < 40000
      if ((e.kind >= 10000 && e.kind < 20000) || addressable)
        for (const [id, old] of this.stored)
          if (old.kind === e.kind && old.pubkey === e.pubkey && (!addressable || dOf(old) === dOf(e))) {
            if (old.created_at > e.created_at) return this.send(client, ['OK', e.id, true, 'duplicate: have a newer one'])
            this.stored.delete(id)
          }
      this.stored.set(e.id, e)
      this.send(client, ['OK', e.id, true, ''])
      // (on to every open question it answers)
      for (const c of this.clients)
        for (const [sub, filters] of c.subs)
          if (filters.some((f) => matches(e, f))) {
            this.send(c, ['EVENT', sub, e])
            if (this.options.duplicates) this.send(c, ['EVENT', sub, e])
          }
    } else if (m[0] === 'REQ') {
      const sub = String(m[1])
      const filters = m.slice(2) as Filter[]
      client.subs.set(sub, filters)
      this.drop()
      const found = [...this.stored.values()].filter((e) => filters.some((f) => matches(e, f))).sort((a, b) => b.created_at - a.created_at)
      const limit = Math.min(...filters.map((f) => f.limit ?? Infinity))
      for (const e of found.slice(0, limit)) {
        this.send(client, ['EVENT', sub, e])
        if (this.options.duplicates) this.send(client, ['EVENT', sub, e])
      }
      this.send(client, ['EOSE', sub])
    } else if (m[0] === 'CLOSE') client.subs.delete(String(m[1]))
  }
}

/** relays in memory, reached by their urls: the dial a pool uses to talk to them (an unknown url is never answered) */
export function fakeDial(relays: FakeRelay[]): Dial {
  return (url, on) => {
    const r = relays.find((x) => x.url === url)
    if (!r) return { send() {}, close() {} }
    return r.connect(on)
  }
}
