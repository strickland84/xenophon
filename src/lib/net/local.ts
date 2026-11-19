// The same-browser transport: tabs on one machine talking over a BroadcastChannel, for
// development (`?net=local`) and, over a bus in memory, for the tests. It can be made as bad
// as a real network on purpose: every message waits `delay` ms plus up to `jitter` more; fast
// messages are lost `loss` of the time and may overtake each other; sure ones always arrive,
// in order. `fail` is the share of pairs of peers that never manage to connect.
//
// Peers find each other by saying hello on the bus; those already in the room answer (or say
// it is full). Each sends a beat now and then, and a peer not heard from for a while is gone.

import { Inbox } from './link'
import type { Lane, Link, LinkHealth, Transport } from './link'

/** what goes over the bus */
type Wire =
  | { room: string; from: string; type: 'hello' | 'bye' | 'beat' }
  | { room: string; from: string; type: 'here' | 'full' | 'refused'; to: string }
  | { room: string; from: string; type: 'data'; lane: Lane; data: Uint8Array; to?: string }

/** one end of a bus that every link on it can hear (but not itself) */
export interface Bus {
  post(msg: Wire): void
  listen(fn: (msg: Wire) => void): void
  close(): void
}

/** how bad the network is made to be */
export interface Conditions {
  /** ms every message waits, and up to how many ms more at random */
  delay: number
  jitter: number
  /** 0..1: the share of fast messages lost */
  loss: number
  /** 0..1: the share of pairs of peers that cannot connect at all */
  fail: number
}

export const GOOD: Conditions = { delay: 0, jitter: 0, loss: 0, fail: 0 }

export interface LocalOptions {
  /** a new end of the bus, for each link */
  bus: () => Bus
  /** ms, from any start: the page's clock, or the test's */
  clock: () => number
  conditions?: Partial<Conditions>
  /** for the chance numbers (delays, losses) and the peer ids: the same seed, the same run */
  seed?: number
  /** ms between beats, and ms without a word before a peer is taken to be gone */
  beat?: number
  timeout?: number
}

/** chance numbers 0..1 from a seed (mulberry32) */
function rng(seed: number) {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** a number 0..1 for a pair of peers, the same whichever end asks */
function pairChance(a: string, b: string) {
  const s = a < b ? a + '|' + b : b + '|' + a
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return (h >>> 0) / 4294967296
}

export interface LocalLink extends Link {
  /** how bad the network is, from now on */
  conditions: Conditions
  /** beats, and messages that have waited long enough; poll calls it, and the page's timer does while the tab is hidden */
  tick(): void
}

export function localTransport(options: LocalOptions): Transport & { join(room: string, cap: number): LocalLink } {
  const chance = rng(options.seed ?? (Math.random() * 2 ** 32) | 0)
  const beat = options.beat ?? 1000
  const timeout = options.timeout ?? 5000
  const now = options.clock
  return {
    name: 'local',
    join(room, cap) {
      const self = 'p' + Math.floor(chance() * 36 ** 6).toString(36)
      const bus = options.bus()
      const inbox = new Inbox()
      const conditions: Conditions = { ...GOOD, ...options.conditions }
      /** peers in the room, and when each was last heard from */
      const peers = new Map<string, number>()
      /** peers this one cannot connect to */
      const refused = new Set<string>()
      /** messages waiting out their delay, and the time the last one from each peer that must keep its order is due */
      const waiting: { due: number; n: number; msg: Wire }[] = []
      const lastDue = new Map<string, number>()
      let count = 0
      let lastBeat = -1e9
      let gone = false

      const post = (msg: Wire) => !gone && bus.post(msg)

      bus.listen((msg) => {
        if (gone || msg.room !== room || msg.from === self) return
        if ('to' in msg && msg.to !== undefined && msg.to !== self) return
        const fast = msg.type === 'data' && msg.lane === 'fast'
        if (fast && chance() < conditions.loss) return
        let due = now() + conditions.delay + chance() * conditions.jitter
        if (!fast) {
          due = Math.max(due, lastDue.get(msg.from) ?? 0)
          lastDue.set(msg.from, due)
        }
        waiting.push({ due, n: count++, msg })
      })

      /** a message from the bus whose time has come */
      function arrive(msg: Wire) {
        const from = msg.from
        if (peers.has(from)) peers.set(from, now())
        switch (msg.type) {
          case 'hello':
          case 'here':
          case 'beat': {
            if (peers.has(from)) break
            // (a beat from a peer not known: one dropped for going quiet, back again; it is met like a hello)
            const asked = msg.type !== 'here'
            if (pairChance(self, from) < conditions.fail) {
              // (counted once: a pair that cannot connect stays so)
              if (refused.has(from)) break
              refused.add(from)
              if (asked) post({ room, from: self, type: 'refused', to: from })
              inbox.push({ kind: 'failed', peer: from, why: 'could not connect (simulated)' })
              break
            }
            if (asked && peers.size + 1 >= cap) {
              post({ room, from: self, type: 'full', to: from })
              break
            }
            peers.set(from, now())
            if (asked) post({ room, from: self, type: 'here', to: from })
            inbox.push({ kind: 'join', peer: from })
            break
          }
          case 'full':
            inbox.push({ kind: 'full' })
            break
          case 'refused':
            if (!refused.has(from)) inbox.push({ kind: 'failed', peer: from, why: 'could not connect (simulated)' })
            refused.add(from)
            break
          case 'bye':
            if (peers.delete(from)) inbox.push({ kind: 'leave', peer: from })
            break
          case 'data':
            if (peers.has(from)) inbox.push({ kind: 'message', peer: from, lane: msg.lane, data: msg.data })
            break
        }
      }

      function tick() {
        if (gone) return
        const t = now()
        if (waiting.length) {
          waiting.sort((a, b) => a.due - b.due || a.n - b.n)
          let i = 0
          while (i < waiting.length && waiting[i].due <= t) arrive(waiting[i++].msg)
          waiting.splice(0, i)
        }
        if (t - lastBeat >= beat) {
          lastBeat = t
          post({ room, from: self, type: 'beat' })
        }
        for (const [id, heard] of peers) {
          if (t - heard > timeout) {
            peers.delete(id)
            inbox.push({ kind: 'leave', peer: id })
          }
        }
      }

      post({ room, from: self, type: 'hello' })

      const link: LocalLink = {
        self,
        room,
        conditions,
        tick,
        poll() {
          tick()
          return inbox.take()
        },
        send(lane, data, to) {
          post({ room, from: self, type: 'data', lane, data, to })
        },
        health(): LinkHealth {
          return { relays: [], fastLane: true, trouble: null }
        },
        leave() {
          post({ room, from: self, type: 'bye' })
          gone = true
          bus.close()
        },
      }
      return link
    },
  }
}

/** a bus that lives in memory: every end hears every other at once (the tests' network) */
export function memoryHub() {
  const ends = new Set<(m: Wire) => void>()
  return {
    bus(): Bus {
      let heard: ((m: Wire) => void) | null = null
      const me = (m: Wire) => heard?.(m)
      ends.add(me)
      return {
        post(m) {
          // (as a BroadcastChannel would, each end gets its own copy of the bytes)
          const copy = m.type === 'data' ? { ...m, data: m.data.slice() } : m
          for (const e of [...ends]) if (e !== me) e(copy)
        },
        listen(fn) {
          heard = fn
        },
        close() {
          ends.delete(me)
        },
      }
    },
  }
}

/** a bus between the tabs of one browser */
export function broadcastBus(name = 'xenophon/local'): Bus {
  const channel = new BroadcastChannel(name)
  return {
    post: (m) => channel.postMessage(m),
    listen(fn) {
      channel.onmessage = (e: MessageEvent<Wire>) => fn(e.data)
    },
    close: () => channel.close(),
  }
}
