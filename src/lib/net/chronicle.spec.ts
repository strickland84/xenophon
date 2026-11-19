// The persistent world over relays that cannot be trusted: relays in memory (fakerelay.ts) that
// are slow, send events twice, forget, refuse, or are down; players who were never online at the
// same time; and no relays at all. Time is simulated, so every run is the same.

import { describe, expect, it } from 'vitest'
import { homeWorld, INFLUENCE, theGalaxy } from '../engine'
import type { Side } from '../engine'
import { Archive } from './archive'
import { Chronicle } from './chronicle'
import { KIND_PRESENCE, KIND_WORLD_EVENT, namespaceOf, readDeed, signDeed } from './events'
import type { Deed } from './events'
import { FakeRelay, fakeDial } from './fakerelay'
import type { FakeRelayOptions } from './fakerelay'
import { signEvent } from './nostr'
import { RelayPool } from './relays'
import { PROTOCOL_VERSION } from './rooms'

const NS = namespaceOf(true)
const DAY = 86_400_000
/** noon on a day in November 2026, ms */
const T0 = 1_795_000_000_000 - (1_795_000_000_000 % DAY) + DAY / 2

/** a secret key for a test pilot, made from his name: the same every run */
function keyFor(name: string) {
  let h = 2166136261
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  let hex = ''
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ (i * 374761393)
    hex += ((h >>> 0) % 0x10000000).toString(16).padStart(8, '0')
  }
  return hex
}

const g = theGalaxy()
const homeSystem = (s: Side) => g.systems.findIndex((x) => x.side === s)
/** a habitable world in a frontier system joined to a side's home: on its front from the start */
const frontWorld = (s: Side) => {
  const sys = g.lanes.filter((l) => l.a === homeSystem(s) || l.b === homeSystem(s)).map((l) => (l.a === homeSystem(s) ? l.b : l.a))[0]
  return g.worlds.find((w) => w.habitable && w.system === sys)!.id
}
const flag = (world: string, side: Side, callsign: string): Deed => ({ kind: 'flag', world, side, callsign, x: 300, y: 400, z: 20, n: 0 })

/** a little world of relays and a clock */
function world(relays: Record<string, Partial<FakeRelayOptions>>) {
  let now = T0
  const clock = () => now
  const list = Object.entries(relays).map(([url, o]) => new FakeRelay(url, clock, o))
  const dial = fakeDial(list)
  const pilots: Chronicle[] = []
  const pilot = (name: string, urls = list.map((r) => r.url), storage: Record<string, string> | null = null) => {
    const kept = storage
      ? {
          getItem: (k: string) => storage[k] ?? null,
          setItem: (k: string, v: string) => void (storage[k] = v),
          removeItem: (k: string) => void delete storage[k],
        }
      : null
    const c = new Chronicle({ secret: keyFor(name), ns: NS, relays: urls, dial, clock, storage: kept, key: 'events' })
    pilots.push(c)
    return c
  }
  /** time runs on for `ms`, in quarter seconds: the relays deliver, the pilots tick */
  const run = async (ms: number) => {
    for (let t = 0; t < ms; t += 250) {
      now += 250
      for (const r of list) r.tick()
      for (const p of pilots) p.tick()
      await Promise.all(pilots.map((p) => p.settled()))
    }
  }
  const leave = (c: Chronicle) => {
    c.close()
    pilots.splice(pilots.indexOf(c), 1)
  }
  return { relays: list, pilot, run, leave, clock, at: (ms: number) => (now = ms) }
}

describe('the archive', () => {
  it('lets in only truly signed events of its namespace, once each; merging two is a union', async () => {
    const a = new Archive({ ns: NS })
    const b = new Archive({ ns: NS })
    const w = frontWorld('nomarchy')
    const e1 = await signDeed(keyFor('ALPHA'), flag(w, 'nomarchy', 'ALPHA'), T0 / 1000, NS)
    const e2 = await signDeed(keyFor('BRAVO'), flag(w, 'nomarchy', 'BRAVO'), T0 / 1000 + 5, NS)
    const other = await signDeed(keyFor('ALPHA'), flag(w, 'nomarchy', 'ALPHA'), T0 / 1000, namespaceOf(false))
    const forged = { ...e2, content: e2.content.replace('"BRAVO"', '"ALPHA"') }
    const wrongKind = await signEvent(keyFor('ALPHA'), { kind: 1, tags: [['t', NS]], content: e1.content, created_at: T0 / 1000 })
    expect(await a.add(e1)).toBe(true)
    expect(await a.add(e1)).toBe(false)
    expect(await a.add(other)).toBe(false)
    expect(await a.add(forged)).toBe(false)
    expect(await a.add(wrongKind)).toBe(false)
    expect(await a.add({ junk: true })).toBe(false)
    expect(await b.add(e2)).toBe(true)
    // (each hands the other everything it has: both end with the union)
    await a.addAll(b.recent(100))
    await b.addAll(a.recent(100))
    expect(
      a
        .events()
        .map((e) => e.id)
        .sort(),
    ).toEqual(
      b
        .events()
        .map((e) => e.id)
        .sort(),
    )
    expect(a.size).toBe(2)
    expect(readDeed(e1, NS)?.kind).toBe('flag')
    expect(e1.kind).toBe(KIND_WORLD_EVENT)
  })

  it('is kept in storage, and lets old events go but never a name', async () => {
    const store: Record<string, string> = {}
    const kept = { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => void (store[k] = v), removeItem: () => {} }
    const a = new Archive({ ns: NS, storage: kept, key: 'k' })
    const w = frontWorld('nomarchy')
    await a.add(await signDeed(keyFor('ALPHA'), flag(w, 'nomarchy', 'ALPHA'), T0 / 1000 - 20 * 86_400, NS))
    await a.add(await signDeed(keyFor('ALPHA'), { ...flag(w, 'nomarchy', 'ALPHA'), kind: 'name', name: 'X' }, T0 / 1000 - 90 * 86_400, NS))
    await a.add(await signDeed(keyFor('ALPHA'), flag(w, 'nomarchy', 'ALPHA'), T0 / 1000, NS))
    a.prune(T0 / 1000)
    a.save()
    const back = new Archive({ ns: NS, storage: kept, key: 'k' })
    expect(
      back
        .events()
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['flag', 'name'])
  })
})

describe('the persistent world over relays', () => {
  it('reaches a player who was never online with the one who made it, through relays that are slow, repeat, forget, refuse or are down', async () => {
    const { pilot, run, leave, relays } = world({
      'wss://good': {},
      'wss://slow': { delay: 4000 },
      'wss://twice': { duplicates: true },
      'wss://forgets': {},
      'wss://refuses': { refuse: 'blocked: not accepting this kind' },
      'wss://down': { down: true },
    })
    const w = frontWorld('nomarchy')
    // ALPHA plants a flag and goes; nobody else is about
    const alpha = pilot('ALPHA')
    await run(1000)
    await alpha.record(flag(w, 'nomarchy', 'ALPHA'))
    await run(6000)
    expect(alpha.state().worlds[w].holder).toBe('nomarchy')
    const h = alpha.health().relays
    expect(h.find((r) => r.url === 'wss://refuses')!.refused).toBe(1)
    expect(h.find((r) => r.url === 'wss://refuses')!.said).toContain('blocked')
    expect(h.find((r) => r.url === 'wss://down')!.up).toBe(false)
    expect(h.find((r) => r.url === 'wss://good')!.accepted).toBe(1)
    leave(alpha)
    // one relay forgets everything; the rest keep it
    relays.find((r) => r.url === 'wss://forgets')!.forget()
    await run(60_000)
    // an hour later BRAVO, with an empty archive, comes online for the first time: the world is the Nomarchy's
    await run(3_600_000 - 60_000)
    const bravo = pilot('BRAVO')
    expect(bravo.state().worlds[w].holder).toBeNull()
    await run(6000)
    expect(bravo.archive.size).toBe(1)
    expect(bravo.state().worlds[w].holder).toBe('nomarchy')
    expect(bravo.state().traces.map((e) => e.callsign)).toEqual(['ALPHA'])
  })

  it('a relay that is slow brings news late; one that repeats it changes nothing', async () => {
    const { pilot, run } = world({ 'wss://slow': { delay: 5000, duplicates: true } })
    const w = frontWorld('anarchoi')
    const watcher = pilot('WATCHER')
    const maker = pilot('MAKER')
    await run(6000)
    await maker.record(flag(w, 'anarchoi', 'MAKER'))
    await run(2000)
    expect(watcher.state().worlds[w].holder).toBeNull()
    await run(6000)
    expect(watcher.state().worlds[w].holder).toBe('anarchoi')
    expect(watcher.archive.size).toBe(1)
  })

  it('an event sent while every relay was away goes once one is back', async () => {
    const { pilot, run, relays } = world({ 'wss://later': { down: true } })
    const alpha = pilot('ALPHA')
    await run(1000)
    await alpha.record(flag(frontWorld('nomarchy'), 'nomarchy', 'ALPHA'))
    await run(3000)
    expect(alpha.health().waiting).toBe(1)
    relays[0].options.down = false
    // (it tries again after its wait: 2 s, then 4, then 8 …)
    await run(40_000)
    expect(relays[0].events).toHaveLength(1)
    expect(alpha.health().waiting).toBe(0)
  })

  it('works alone: no relays, and the archive kept from one session to the next', async () => {
    const store: Record<string, string> = {}
    const { pilot, run, leave, at } = world({})
    const alone = pilot('LONER', [], store)
    const w = frontWorld('nomarchy')
    await alone.record(flag(w, 'nomarchy', 'LONER'))
    await run(30_000)
    expect(alone.state().worlds[w].holder).toBe('nomarchy')
    leave(alone)
    // the next day, a new session: the flag is still there, and it fades on the clock
    at(T0 + DAY)
    const again = pilot('LONER', [], store)
    expect(again.state().worlds[w].holder).toBe('nomarchy')
    at(T0 + INFLUENCE.lasts * 1000 + 60_000)
    const week = pilot('LONER', [], store)
    expect(week.state().worlds[w].holder).toBeNull()
  })

  it('counts who is about by their heartbeats, and forgets those gone quiet', async () => {
    const { pilot, run } = world({ 'wss://r': {} })
    const a = pilot('ALPHA')
    const b = pilot('BRAVO')
    const c = pilot('CEDAR')
    await run(1000)
    a.heartbeat({ side: 'nomarchy', zone: homeWorld('nomarchy').id, bounty: 0, callsign: 'ALPHA', rank: 0 })
    b.heartbeat({ side: 'anarchoi', zone: 's5', bounty: 120, callsign: 'BRAVO', rank: 2 })
    await run(2000)
    const seen = c.pilotsNow()
    expect(seen.bySide).toEqual({ nomarchy: 1, anarchoi: 1 })
    expect(seen.byZone.s5.anarchoi).toBe(1)
    expect(seen.pilots.find((p) => p.callsign === 'BRAVO')!.bounty).toBe(120)
    // (a heartbeat counts for a little over two minutes)
    await run(170_000)
    expect(c.pilotsNow().pilots).toHaveLength(0)
  })

  it('an old build hears a pilot of a newer one, and says so; builds of the same wire do not', async () => {
    const { relays, pilot, run, clock } = world({ 'wss://r': {} })
    const old = pilot('OLDTIMER')
    const same = pilot('SAMEWIRE')
    await run(1000)
    same.heartbeat({ side: 'nomarchy', zone: 's0', bounty: 0, callsign: 'SAMEWIRE', rank: 0 })
    await run(2000)
    expect(old.pilotsNow().pilots.find((p) => p.callsign === 'SAMEWIRE')!.protocol).toBe(PROTOCOL_VERSION)
    expect(old.newerProtocol()).toBe(0)
    // (a build from before presence said its wire: no number, never counted as newer)
    const before = await signEvent(keyFor('BEFORE'), {
      kind: KIND_PRESENCE,
      tags: [['t', NS]],
      content: JSON.stringify({ s: 'anarchoi', z: 's11', b: 0, c: 'BEFORE', r: 0 }),
      created_at: Math.floor(clock() / 1000),
    })
    // (a newer build's presence: its wire is one on)
    const newer = await signEvent(keyFor('NEWER'), {
      kind: KIND_PRESENCE,
      tags: [['t', NS]],
      content: JSON.stringify({ s: 'anarchoi', z: 's11', b: 0, c: 'NEWER', r: 0, p: PROTOCOL_VERSION + 1 }),
      created_at: Math.floor(clock() / 1000),
    })
    const writer = new RelayPool({ urls: ['wss://r'], dial: fakeDial(relays), clock })
    writer.publish(before)
    await run(1000)
    expect(old.newerProtocol()).toBe(0)
    writer.publish(newer)
    for (let i = 0; i < 8; i++) {
      writer.tick()
      await run(250)
    }
    expect(old.newerProtocol()).toBe(PROTOCOL_VERSION + 1)
  })
})
