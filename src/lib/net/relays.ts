// Talking to Nostr relays (NIP-01), where the persistent world's events wait while nobody is
// online (the plan's section 18). A pool keeps a connection to each relay of a list, sends each of
// the pilot's own events to all of them (again to any that was away when it was first sent, until
// it says OK or refuses it), asks each for events (the same questions again after a reconnect), and
// says how each relay stands, for the connection screen.
//
// Relays are other people's servers: they may be down, slow, refuse an event, rate-limit, forget,
// or send the same event twice. Nothing here trusts them: every event that comes in is handed on to
// be checked (archive.ts), and the local copy is the source of truth.
//
// Like a link (link.ts), a pool is driven, not driven by timers: `tick` is called now and then with
// the time, so the tests run it on a simulated clock against relays in memory (fakerelay.ts).

import type { NostrEvent } from './nostr'

/** what a socket to a relay must do: the browser's WebSocket, or a relay in memory */
export interface RelaySocket {
  send(text: string): void
  close(): void
}
/** opens a socket to `url`; it calls back as it opens, as each message comes, and when it closes */
export type Dial = (url: string, on: { open(): void; message(text: string): void; close(why: string): void }) => RelaySocket

/** a question for relays (NIP-01): kinds, tags (`#t`, `#d`), since (seconds since 1970), at most so many */
export interface Filter {
  kinds?: number[]
  authors?: string[]
  since?: number
  until?: number
  limit?: number
  '#t'?: string[]
  '#d'?: string[]
}

export interface RelayHealth {
  url: string
  up: boolean
  /** events it said OK to, and refused (with the last reason given); events it has sent us */
  accepted: number
  refused: number
  heard: number
  /** the last thing it said that was not an event (a refusal, a notice, a closed question) */
  said: string
}

interface Relay {
  url: string
  socket: RelaySocket | null
  up: boolean
  /** ms when it may be tried again, and how long to wait the time after */
  retryAt: number
  wait: number
  health: RelayHealth
}

/** ms to wait before trying a relay again after it closed, at first and at most */
const WAIT_FIRST = 2000
const WAIT_MOST = 120_000
/** events sent to one relay in one tick, at most (relays limit how fast they are written to) */
const SENDS_A_TICK = 8
/** own events kept waiting to be sent, at most */
const OUTBOX_MOST = 400

export interface PoolOptions {
  urls: string[]
  dial: Dial
  /** ms, from any start */
  clock: () => number
}

export class RelayPool {
  private relays: Relay[]
  private readonly o: PoolOptions
  /** questions, by their id */
  private subs = new Map<string, { filters: Filter[]; onEvent: (e: NostrEvent, relay: string) => void }>()
  /** own events still to be settled with some relay: id → the event, and how each relay stands with it */
  private outbox = new Map<string, { event: NostrEvent; by: Map<string, 'sent' | 'ok' | 'refused'> }>()
  private gone = false

  constructor(o: PoolOptions) {
    this.o = o
    this.relays = [...new Set(o.urls)].map((url) => ({
      url,
      socket: null,
      up: false,
      retryAt: 0,
      wait: WAIT_FIRST,
      health: { url, up: false, accepted: 0, refused: 0, heard: 0, said: '' },
    }))
  }

  get urls() {
    return this.relays.map((r) => r.url)
  }

  /** sends one of the pilot's own events to every relay (now to those up, later to the rest) */
  publish(e: NostrEvent) {
    if (this.gone || this.outbox.has(e.id)) return
    this.outbox.set(e.id, { event: e, by: new Map() })
    if (this.outbox.size > OUTBOX_MOST) this.outbox.delete(this.outbox.keys().next().value!)
    for (const r of this.relays) if (r.up) this.sendTo(r, e)
  }

  /** asks every relay a question, and again whenever one reconnects; `onEvent` hears every event that comes for it */
  subscribe(id: string, filters: Filter[], onEvent: (e: NostrEvent, relay: string) => void) {
    this.subs.set(id, { filters, onEvent })
    for (const r of this.relays) if (r.up) r.socket?.send(JSON.stringify(['REQ', id, ...filters]))
  }

  unsubscribe(id: string) {
    if (!this.subs.delete(id)) return
    for (const r of this.relays) if (r.up) r.socket?.send(JSON.stringify(['CLOSE', id]))
  }

  /** connects to relays that are not, when their wait is over, and sends what each still needs */
  tick() {
    if (this.gone) return
    const now = this.o.clock()
    for (const r of this.relays) {
      if (!r.socket && now >= r.retryAt) this.connect(r)
      if (r.up) {
        let sent = 0
        for (const o of this.outbox.values()) {
          if (sent >= SENDS_A_TICK) break
          if (o.by.has(r.url)) continue
          this.sendTo(r, o.event)
          sent++
        }
      }
    }
  }

  health(): RelayHealth[] {
    return this.relays.map((r) => ({ ...r.health, up: r.up }))
  }

  /** own events not yet taken by any relay */
  get waiting() {
    let n = 0
    for (const o of this.outbox.values()) if (![...o.by.values()].includes('ok')) n++
    return n
  }

  close() {
    this.gone = true
    for (const r of this.relays) r.socket?.close()
  }

  private sendTo(r: Relay, e: NostrEvent) {
    this.outbox.get(e.id)?.by.set(r.url, 'sent')
    r.socket?.send(JSON.stringify(['EVENT', e]))
  }

  private connect(r: Relay) {
    const closed = (why: string) => {
      if (r.socket === null && !r.up) return
      r.socket = null
      r.up = false
      r.health.up = false
      if (why) r.health.said = why
      r.retryAt = this.o.clock() + r.wait
      r.wait = Math.min(WAIT_MOST, r.wait * 2)
      // (what was sent and not yet answered goes again once it is back)
      for (const o of this.outbox.values()) if (o.by.get(r.url) === 'sent') o.by.delete(r.url)
    }
    try {
      r.socket = this.o.dial(r.url, {
        open: () => {
          if (this.gone) return
          r.up = true
          r.health.up = true
          r.wait = WAIT_FIRST
          for (const [id, s] of this.subs) r.socket?.send(JSON.stringify(['REQ', id, ...s.filters]))
        },
        message: (text) => this.receive(r, text),
        close: closed,
      })
    } catch (err) {
      r.socket = null
      closed(String(err))
    }
  }

  private receive(r: Relay, text: string) {
    let m: unknown
    try {
      m = JSON.parse(text)
    } catch {
      return
    }
    if (!Array.isArray(m)) return
    switch (m[0]) {
      case 'EVENT': {
        const sub = this.subs.get(String(m[1]))
        const e = m[2] as NostrEvent
        if (!sub || !e || typeof e !== 'object') return
        r.health.heard++
        sub.onEvent(e, r.url)
        return
      }
      case 'OK': {
        const o = this.outbox.get(String(m[1]))
        const ok = m[2] === true
        // (a relay that already has it says so: that is as good as taking it)
        const dup = typeof m[3] === 'string' && m[3].startsWith('duplicate')
        if (ok || dup) r.health.accepted++
        else {
          r.health.refused++
          r.health.said = String(m[3] ?? 'refused')
        }
        if (!o) return
        o.by.set(r.url, ok || dup ? 'ok' : 'refused')
        // (settled with every relay: no longer kept)
        if (this.relays.every((x) => o.by.get(x.url) === 'ok' || o.by.get(x.url) === 'refused')) this.outbox.delete(String(m[1]))
        return
      }
      case 'CLOSED':
      case 'NOTICE':
        r.health.said = String(m[m[0] === 'CLOSED' ? 2 : 1] ?? '').slice(0, 120)
        return
    }
  }
}

/** a dial for the browser: a real WebSocket */
export const browserDial: Dial = (url, on) => {
  const ws = new WebSocket(url)
  ws.onopen = () => on.open()
  ws.onmessage = (e) => typeof e.data === 'string' && on.message(e.data)
  ws.onclose = (e) => on.close(e.reason || (e.code === 1000 ? '' : `closed (${e.code})`))
  ws.onerror = () => on.close('could not connect')
  return {
    send: (text) => ws.readyState === WebSocket.OPEN && ws.send(text),
    close: () => ws.close(),
  }
}

/** true if an event matches a filter (for relays in memory, and to check what real ones send) */
export function matches(e: NostrEvent, f: Filter) {
  if (f.kinds && !f.kinds.includes(e.kind)) return false
  if (f.authors && !f.authors.includes(e.pubkey)) return false
  if (f.since !== undefined && e.created_at < f.since) return false
  if (f.until !== undefined && e.created_at > f.until) return false
  if (f['#t'] && !e.tags.some((t) => t[0] === 't' && f['#t']!.includes(t[1]))) return false
  if (f['#d'] && !e.tags.some((t) => t[0] === 'd' && f['#d']!.includes(t[1]))) return false
  return true
}
