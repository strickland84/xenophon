// The pieces under the session: what goes over the wire, the keys that sign it, and the
// same-browser transport's delay, loss and order.

import { describe, expect, it } from 'vitest'
import { packComputer, packEvents, packPilot, PILOT_BYTES, unpackComputer, unpackEvents, unpackPilot } from './codec'
import type { PilotSnap } from './codec'
import { localTransport, memoryHub } from './local'
import type { Happening } from './link'
import { KIND_PILOT_CARD, newSecretKey, publicKeyOf, signEvent, verifyEvent } from './nostr'
import { roomName } from './rooms'

describe('the wire', () => {
  const snap: PilotSnap = {
    t: 123456,
    seq: 7,
    flying: true,
    out: false,
    firing: true,
    x: 1234.5,
    y: -88.25,
    height: 512.5,
    heading: 2.5,
    roll: -0.6,
    pitch: 0.21,
    speed: 140.5,
    thrust: 0.5,
    spin: 0.25,
    spinDir: -1,
    hullLeft: 0.4,
    shieldLeft: 0,
    protect: 3.5,
    life: 4,
    hull: 'lance',
    loaded: 0.5,
    landing: 2,
    mining: 17,
    foot: 2,
    ship: 2,
    fx: 1250.25,
    fy: -60.5,
    fz: 12,
    facing: 4.1,
    walk: 46,
    health: 0.6,
    open: 1,
    hidden: true,
    wading: false,
    shooting: true,
    cutting: false,
    inside: 2,
    room: 4000000001,
  }

  it('a pilot’s state fits in 56 bytes and comes back as it went, near enough', () => {
    const b = packPilot(snap)
    expect(b.length).toBe(PILOT_BYTES)
    const s = unpackPilot(b)!
    expect([Math.round(s.loaded * 100), s.landing, s.mining]).toEqual([50, 2, 17])
    expect(unpackPilot(packPilot({ ...snap, mining: -1 }))!.mining).toBe(-1)
    expect(s.x).toBe(1234.5)
    expect(s.y).toBe(-88.25)
    expect(s.height).toBe(512.5)
    expect(Math.abs(s.heading - 2.5)).toBeLessThan(0.001)
    expect(Math.abs(s.roll + 0.6)).toBeLessThan(0.03)
    expect(Math.abs(s.pitch - 0.21)).toBeLessThan(0.01)
    expect(s.speed).toBe(140.5)
    expect(Math.abs(s.spin - 0.25)).toBeLessThan(0.01)
    expect(s.spinDir).toBe(-1)
    expect(Math.abs(s.hullLeft - 0.4)).toBeLessThan(0.01)
    expect(s.protect).toBe(3.5)
    expect([s.flying, s.out, s.firing, s.life, s.hull, s.seq, s.t]).toEqual([true, false, true, 4, 'lance', 7, 123456])
    expect(unpackPilot(b.subarray(0, 20))).toBeNull()
    // out of his ship: where he stands, and how
    expect([s.foot, s.ship, s.fx, s.fy, s.fz, s.walk]).toEqual([2, 2, 1250.25, -60.5, 12, 46])
    expect(Math.abs(s.facing - 4.1)).toBeLessThan(0.001)
    expect(Math.abs(s.health - 0.6)).toBeLessThan(0.01)
    expect([s.hidden, s.wading, s.shooting, s.cutting]).toEqual([true, false, true, false])
  })

  it('the computer’s ships, and events, come back as they went', () => {
    const ship = { ...snap, id: 0xbeef0001, wave: 6, band: -1, faction: '' as const, lurk: false }
    const patrol = { ...ship, band: 5011, faction: 'anarchoi' as const, lurk: true }
    const cleared = [
      { band: 3048, until: 1_800_000_600 },
      { band: 1049, until: 1_800_000_900 },
    ]
    const p = unpackComputer(
      packComputer({ t: 99, seq: 1, host: true, handover: false, wave: 6, stage: 'fight', timer: 2.5, ships: [ship, patrol], cleared }),
    )!
    expect(p.ships.length).toBe(2)
    expect([p.host, p.handover, p.wave, p.stage, p.timer]).toEqual([true, false, 6, 'fight', 2.5])
    expect(p.ships[1].id).toBe(0xbeef0001)
    expect(p.ships[1].wave).toBe(6)
    expect(p.ships[1].hull).toBe('lance')
    // (the bands: a raider of none, a patrol of the Anarchoi's lying in wait, and the bands beaten)
    expect([p.ships[0].band, p.ships[0].faction, p.ships[0].lurk]).toEqual([-1, '', false])
    expect([p.ships[1].band, p.ships[1].faction, p.ships[1].lurk]).toEqual([5011, 'anarchoi', true])
    expect(p.cleared).toEqual(cleared)
    const events = unpackEvents(
      packEvents([
        { t: 'hit', target: 'ab', by: 5, amount: 9, d: [1, 2, 3], hull: true },
        { t: 'idle', on: true },
      ]),
    )
    expect(events).toEqual([
      { t: 'hit', target: 'ab', by: 5, amount: 9, d: [1, 2, 3], hull: true },
      { t: 'idle', on: true },
    ])
    expect(unpackEvents(new Uint8Array([3, 123]))).toEqual([])
  })

  it('room names carry the game’s and the wire’s versions', () => {
    expect(roomName('islands-7-33', 2)).toBe('g1/p9/islands-7-33/2')
  })
})

describe('a pilot’s key', () => {
  it('signs a card in Nostr’s format that anyone can check, and that cannot be altered', async () => {
    const secret = newSecretKey()
    const e = await signEvent(secret, { kind: KIND_PILOT_CARD, content: '{"callsign":"ACE"}', created_at: 1_790_000_000 })
    expect(e.pubkey).toBe(publicKeyOf(secret))
    expect(e.pubkey).toMatch(/^[0-9a-f]{64}$/)
    expect(e.sig).toMatch(/^[0-9a-f]{128}$/)
    expect(await verifyEvent(e)).toBe(true)
    expect(await verifyEvent({ ...e, content: '{"callsign":"BOB"}' })).toBe(false)
    expect(await verifyEvent({ ...e, pubkey: publicKeyOf(newSecretKey()) })).toBe(false)
    expect(await verifyEvent(null)).toBe(false)
  })
})

describe('the same-browser transport', () => {
  function pair(conditions = {}) {
    const hub = memoryHub()
    let now = 0
    const make = (seed: number) => localTransport({ bus: () => hub.bus(), clock: () => now, seed, conditions })
    const a = make(1).join('r', 12)
    const b = make(2).join('r', 12)
    /** `ms` pass; both ends are polled (or only b, while a is `quiet`), and what b heard is returned */
    const tick = (ms: number, quiet = false) => {
      const got: Happening[] = []
      for (let t = 0; t < ms; t += 5) {
        now += 5
        if (!quiet) a.poll()
        got.push(...b.poll())
      }
      return got
    }
    return { a, b, tick }
  }

  it('holds messages back by the delay, and keeps sure ones in order', () => {
    const { a, tick } = pair({ delay: 80, jitter: 60 })
    const joined = tick(300)
    expect(joined.some((h) => h.kind === 'join' && h.peer === a.self)).toBe(true)
    for (let i = 0; i < 20; i++) a.send('sure', new Uint8Array([i]))
    expect(tick(70).filter((h) => h.kind === 'message')).toEqual([])
    const got = tick(200).filter((h) => h.kind === 'message')
    expect(got.map((h) => (h.kind === 'message' ? h.data[0] : -1))).toEqual([...Array(20).keys()])
  })

  it('loses about the share of fast messages it is told to, and never a sure one', () => {
    const { a, tick } = pair({ delay: 10, loss: 0.3 })
    tick(100)
    for (let i = 0; i < 500; i++) a.send('fast', new Uint8Array([1]))
    for (let i = 0; i < 100; i++) a.send('sure', new Uint8Array([2]))
    const got = tick(100).filter((h) => h.kind === 'message')
    const fast = got.filter((h) => h.kind === 'message' && h.lane === 'fast').length
    const sure = got.filter((h) => h.kind === 'message' && h.lane === 'sure').length
    expect(fast).toBeGreaterThan(310)
    expect(fast).toBeLessThan(390)
    expect(sure).toBe(100)
  })

  it('says a peer is gone when it leaves, or goes quiet', () => {
    const { a, tick } = pair()
    tick(50)
    a.leave()
    expect(tick(50).some((h) => h.kind === 'leave')).toBe(true)
    // (a stops beating: some seconds later it is gone)
    const p = pair()
    p.tick(50)
    expect(p.tick(3000, true).some((h) => h.kind === 'leave')).toBe(false)
    expect(p.tick(4000, true).some((h) => h.kind === 'leave')).toBe(true)
  })

  it('can make some pairs fail to connect, and says so', () => {
    const { tick } = pair({ fail: 1 })
    const got = tick(100)
    expect(got.some((h) => h.kind === 'failed')).toBe(true)
    expect(got.some((h) => h.kind === 'join')).toBe(false)
  })
})
