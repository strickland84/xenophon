// The persistent world end to end: real scenes, each pilot's chronicle and standing, relays in
// memory, and players who are never online at the same time. What one leaves (a flag, a wreck, a
// world's name) is there for the next, through the relays alone; and it fades on the clock.
// Time is simulated, so every run is the same.

import { describe, expect, it } from 'vitest'
import { createScene, DEFAULT_PARAMS, INFLUENCE, STEP, theGalaxy, worldSettings } from '../engine'
import type { Scene, Side } from '../engine'
import { newProgress } from '../save/progress'
import type { Progress } from '../save/progress'
import { Chronicle } from './chronicle'
import { namespaceOf } from './events'
import { FakeRelay, fakeDial } from './fakerelay'
import { Persistent } from './persistent'
import type { PersistentNews } from './persistent'

const NS = namespaceOf(true)
const DAY = 86_400_000
/** noon on a day in November 2026, ms */
const T0 = 1_795_000_000_000 - (1_795_000_000_000 % DAY) + DAY / 2

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

/** the frontier archipelago next to the Nomarchy's home (where both sides start together) */
const FRONT = 'w9'

interface Pilot {
  name: string
  scene: Scene
  chronicle: Chronicle
  world: Persistent
  progress: Progress
  news: PersistentNews[]
  credits: number
}

/** a galaxy of relays in memory and a clock; pilots come and go */
function galaxy() {
  let now = T0
  const clock = () => now
  const relays = [new FakeRelay('wss://one', clock), new FakeRelay('wss://two', clock, { delay: 1500 })]
  const dial = fakeDial(relays)
  const online: Pilot[] = []
  const join = (name: string, side: Side, world = FRONT): Pilot => {
    const chronicle = new Chronicle({ secret: keyFor(name), ns: NS, relays: relays.map((r) => r.url), dial, clock })
    const scene = createScene({ ...DEFAULT_PARAMS, ...worldSettings(world), side, intro: false, skirmish: false, crash: false })
    scene.resize(160, 90)
    scene.setClock(now / 1000)
    const progress = newProgress()
    const p: Pilot = { name, scene, chronicle, world: null as unknown as Persistent, progress, news: [], credits: 0 }
    p.world = new Persistent({
      chronicle,
      pilot: { callsign: name, side },
      progress,
      social: { muted: [], blocked: [] },
      changed: () => {},
      earn: (credits) => (p.credits += credits),
      tell: (n) => p.news.push(n),
      clock,
    })
    online.push(p)
    return p
  }
  const leave = (p: Pilot) => {
    p.chronicle.close()
    online.splice(online.indexOf(p), 1)
  }
  /** the galaxy runs on for `seconds`: scenes step, the relays deliver, the pilots' worlds keep up; `each` is told every step */
  const run = async (seconds: number, each?: (n: number) => void) => {
    for (let n = 0; n < Math.round(seconds * 60); n++) {
      now += 1000 / 60
      for (const r of relays) r.tick()
      each?.(n)
      for (const p of online) {
        p.scene.step(STEP)
        p.world.frame(p.scene)
      }
      if (n % 6 === 0) await Promise.all(online.map((p) => p.chronicle.settled()))
    }
    await Promise.all(online.map((p) => p.chronicle.settled()))
  }
  /** time passes with nobody online */
  const wait = (ms: number) => {
    now += ms
    for (const r of relays) r.tick()
  }
  return { join, leave, run, wait, relays, clock }
}

/** on foot: the keys pushed towards (x, y) the way the screen shows, Use held or not */
function walk(s: Scene, x: number, y: number, use = false) {
  const p = s.player
  const yaw = s.foot.yaw
  const dx = x - p.x
  const dy = y - p.y
  const n = Math.hypot(dx, dy)
  if (n < 2) return s.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: use })
  const c = Math.cos(yaw)
  const sn = Math.sin(yaw)
  s.setControls({ turn: (dx * c - dy * sn) / n, climb: -(dx * sn + dy * c) / n, boost: 0, fire: false, secondary: false, land: use })
}

describe('the galaxy remembers', () => {
  it('a flag planted holds the world for a player who comes later; a week on it has faded', async () => {
    const g = galaxy()
    const alpha = g.join('ALPHA', 'nomarchy')
    await g.run(1)
    // (what the page records when the scene says a flag went in: flights.spec.ts shows the planting itself)
    await alpha.chronicle.record({ kind: 'flag', world: FRONT, side: 'nomarchy', callsign: 'ALPHA', x: 900, y: 1600, z: 20, n: 0 })
    await g.run(3)
    expect(alpha.scene.traces.holder).toBe('nomarchy')
    g.leave(alpha)
    // an hour later an Anarchoi pilot comes to the same world for the first time: it is the Nomarchy's, and its outposts are hostile to him
    g.wait(3_600_000)
    const dusk = g.join('DUSK', 'anarchoi')
    expect(dusk.scene.traces.holder).toBe('')
    await g.run(4)
    expect(dusk.scene.traces.holder).toBe('nomarchy')
    expect(dusk.scene.loop.base?.friendly).toBe(false)
    g.leave(dusk)
    // a week after the flag, nobody holds it
    g.wait(INFLUENCE.lasts * 1000)
    const cedar = g.join('CEDAR', 'nomarchy')
    await g.run(4)
    expect(cedar.chronicle.archive.size).toBe(1)
    expect(cedar.scene.traces.holder).toBe('')
    expect(cedar.world.state().worlds[FRONT].influence.nomarchy).toBe(0)
  })

  it('a wreck where a ship was lost is found and salvaged by a second player later', async () => {
    const g = galaxy()
    const alpha = g.join('ALPHA', 'nomarchy')
    // ALPHA lifts off from the outpost and is shot down close by
    // (once his launch's protection is over)
    await g.run(9, (n) => alpha.scene.setControls({ turn: 1, climb: 0, boost: 0, fire: false, secondary: false, land: n > 10 && n < 80 }))
    await g.run(4, (n) => n % 10 === 0 && alpha.scene.hit(0, 9999, -1, 0, 0, 0, true))
    const wreck = alpha.world.state().traces.find((e) => e.kind === 'wreck')
    expect(wreck?.callsign).toBe('ALPHA')
    g.leave(alpha)
    // two hours on, BRAVO lands at the same outpost, gets out, walks to the wreck and strips it
    g.wait(2 * 3_600_000)
    const bravo = g.join('BRAVO', 'nomarchy')
    await g.run(3)
    expect(bravo.world.state().traces.some((e) => e.id === wreck!.id)).toBe(true)
    let salvaged = false
    await g.run(60, (n) => {
      const s = bravo.scene
      if (s.foot.stage === 'ship') {
        if (n % 40 === 0) s.act('use')
        return
      }
      if (s.foot.prompt === 'salvage' && !salvaged) {
        s.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
        s.act('use')
        salvaged = true
      } else walk(s, wreck!.x, wreck!.y)
    })
    expect(salvaged).toBe(true)
    expect(bravo.progress.stripped).toContain(wreck!.id)
    expect(bravo.scene.foot.pack.some((slot) => slot?.id === 'salvage')).toBe(true)
    // (once each: it offers nothing more to him)
    expect(bravo.scene.foot.prompt).not.toBe('salvage')
  })

  it('names a world after the first pilot to land, for everyone after', async () => {
    const g = galaxy()
    const g0 = theGalaxy()
    // a frontier world next to the Anarchoi's home that nobody has named
    const home = g0.systems.findIndex((s) => s.side === 'anarchoi')
    const next = g0.lanes.find((l) => l.a === home || l.b === home)!
    const sys = next.a === home ? next.b : next.a
    const world = g0.worlds.find((w) => w.habitable && w.system === sys)!.id
    const dusk = g.join('DUSK', 'anarchoi', world)
    // off the pad and down again: a landing
    await g.run(14, (n) => {
      const s = dusk.scene
      const home = s.loop.home
      if (n < 70) s.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: n > 10 })
      else if (n < 200) s.setControls({ turn: 0.6, climb: 0, boost: 0, fire: false, secondary: false })
      else if (home) {
        let off = Math.atan2(home.x - s.player.x, -(home.y - s.player.y)) - s.player.heading
        off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
        s.setControls({
          turn: Math.max(-1, Math.min(1, off * 2.5)),
          climb: 0,
          boost: 0,
          fire: false,
          secondary: false,
          land: s.loop.prompt === 'pad' || s.loop.stage === 'landing',
        })
      }
    })
    const offer = dusk.news.find((n) => n.kind === 'discover')
    expect(offer && offer.kind === 'discover' && offer.world === world).toBe(true)
    const name = (offer as { names: string[] }).names[2]
    dusk.world.name(world, name)
    await g.run(3)
    expect(dusk.scene.traces).toBeTruthy()
    expect(dusk.progress.feats).toContain('namer')
    g.leave(dusk)
    // the next pilot, a day later, finds it so named, and is offered no names of his own
    g.wait(DAY)
    const alpha = g.join('ALPHA', 'nomarchy', world)
    await g.run(3)
    expect(alpha.world.state().names[world]).toMatchObject({ name, callsign: 'DUSK' })
  })
})
