import { describe, expect, it } from 'vitest'
import { INFLUENCE } from '../data/territory'
import { mulberry32 } from '../util/math'
import { dailyTasks, dayOfSeconds, hotspotsOn, rankOf } from './daily'
import { homeWorld, theGalaxy } from './galaxy'
import type { Side } from './galaxy'
import { discoveryNames, galaxyState, stateSummary } from './territory'
import type { WorldEvent } from './territory'

// The rule that turns the set of events into territory is a pure function: the same events, in
// any order and with any repeated, must give the same state. These tests feed it events made up
// here (the signing is the network's, net/archive.ts) and shuffle them.

const g = theGalaxy()
const DAY = 86_400
/** a moment to work from: noon on a day in November 2026 */
const T0 = 1_795_000_000 - (1_795_000_000 % DAY) + DAY / 2

/** the first habitable world of a system */
const worldIn = (system: number, nth = 0) => g.worlds.filter((w) => w.habitable && w.system === system)[nth].id
const homeSystem = (s: Side) => g.systems.findIndex((x) => x.side === s)
/** a frontier system joined by a lane to a side's home */
const nextTo = (s: Side) =>
  g.lanes.filter((l) => l.a === homeSystem(s) || l.b === homeSystem(s)).map((l) => (l.a === homeSystem(s) ? l.b : l.a))[0]

let n = 0
const hex = (i: number) => i.toString(16).padStart(64, '0')
const key = (name: string) => hex([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7))
function ev(kind: WorldEvent['kind'], world: string, by: string, side: Side, at: number, more: Partial<WorldEvent> = {}): WorldEvent {
  return { id: hex(++n * 7919), by: key(by), side, callsign: by, at, kind, world, x: 100, y: 100, z: 20, n: 0, ...more }
}

function shuffled<T>(list: T[], seed: number) {
  const rnd = mulberry32(seed)
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1))
    ;[out[i], out[k]] = [out[k], out[i]]
  }
  return out
}

describe('territory, from the events', () => {
  const near = worldIn(nextTo('nomarchy'))
  const far = worldIn(nextTo('anarchoi'))

  it('starts with each side holding its home system and nothing else', () => {
    const s = galaxyState([], T0)
    expect(s.worlds[homeWorld('nomarchy').id].holder).toBe('nomarchy')
    expect(s.worlds[homeWorld('anarchoi').id].holder).toBe('anarchoi')
    const homes = (side: Side) => g.worlds.filter((w) => w.habitable && w.system === homeSystem(side)).length
    expect(s.held.nomarchy).toBe(homes('nomarchy'))
    expect(s.held.anarchoi).toBe(homes('anarchoi'))
    expect(s.worlds[near].holder).toBeNull()
    expect(Object.keys(s.worlds)).toHaveLength(40)
  })

  it('a flag planted next to home holds the world; seven days later it has faded', () => {
    const flag = ev('flag', near, 'ALPHA', 'nomarchy', T0)
    const now = galaxyState([flag], T0 + 60)
    expect(now.worlds[near].holder).toBe('nomarchy')
    expect(now.points[flag.id]).toBe(INFLUENCE.flag)
    expect(now.traces.map((e) => e.id)).toEqual([flag.id])
    const later = galaxyState([flag], T0 + INFLUENCE.lasts + 1)
    expect(later.worlds[near].holder).toBeNull()
    expect(later.worlds[near].influence.nomarchy).toBe(0)
    expect(later.traces).toHaveLength(0)
  })

  it('counts nothing off the front line, and the front moves as worlds are taken', () => {
    const lonely = ev('flag', far, 'ALPHA', 'nomarchy', T0)
    expect(galaxyState([lonely], T0 + 60).points[lonely.id]).toBe(0)
    expect(galaxyState([lonely], T0 + 60).worlds[far].holder).toBeNull()
    // a world taken next to home opens the systems beyond it
    const first = ev('flag', near, 'ALPHA', 'nomarchy', T0)
    const beyond = g.lanes
      .filter((l) => l.a === nextTo('nomarchy') || l.b === nextTo('nomarchy'))
      .map((l) => (l.a === nextTo('nomarchy') ? l.b : l.a))
      .find((s) => s !== homeSystem('nomarchy'))!
    const second = ev('flag', worldIn(beyond), 'ALPHA', 'nomarchy', T0 + 600)
    const s = galaxyState([second, first], T0 + 900)
    expect(s.points[second.id]).toBeGreaterThan(0)
    expect(s.worlds[worldIn(beyond)].holder).toBe('nomarchy')
  })

  it('caps what one pilot adds to one world in a day, but not two pilots', () => {
    const list = [0, 1, 2, 3].map((i) => ev('flag', near, 'ALPHA', 'nomarchy', T0 + i * 60))
    const s = galaxyState(list, T0 + 600)
    expect(s.worlds[near].influence.nomarchy).toBe(INFLUENCE.dailyMost)
    const next = ev('flag', near, 'ALPHA', 'nomarchy', T0 + DAY)
    const other = ev('flag', near, 'BRAVO', 'nomarchy', T0 + 120)
    const t = galaxyState([...list, next, other], T0 + DAY + 60)
    expect(t.worlds[near].influence.nomarchy).toBe(INFLUENCE.dailyMost + 2 * INFLUENCE.flag)
  })

  it('a world changes hands when the other side out-plants it, and goes to nobody on a tie', () => {
    const anarchoi = worldIn(nextTo('anarchoi'))
    const a = ev('flag', anarchoi, 'DRIFTER', 'anarchoi', T0)
    const b = ev('flag', anarchoi, 'RAIDER', 'nomarchy', T0 + 60)
    // (the Nomarchy cannot reach there: only the Anarchoi's flag counts)
    expect(galaxyState([a, b], T0 + 120).worlds[anarchoi].holder).toBe('anarchoi')
    const near2 = near
    const c = ev('flag', near2, 'ALPHA', 'nomarchy', T0)
    const d = ev('flag', near2, 'DRIFTER', 'anarchoi', T0 + 60)
    // (the Anarchoi cannot reach next to the Nomarchy's home either: still the Nomarchy's)
    expect(galaxyState([c, d], T0 + 120).worlds[near2].holder).toBe('nomarchy')
  })

  it('pays the side behind more for the same deed', () => {
    // the Nomarchy takes three worlds near home; then an Anarchoi flag on its own front counts for more than a Nomarchy one
    const taken = g.systems
      .flatMap((s, i) =>
        g.lanes.some((l) => (l.a === i && l.b === homeSystem('nomarchy')) || (l.b === i && l.a === homeSystem('nomarchy'))) ? s.worlds : [],
      )
      .map((w) => g.worlds[w].id)
      .slice(0, 3)
    const list = taken.map((w, i) => ev('flag', w, 'ALPHA', 'nomarchy', T0 + i))
    const anarchoi = ev('flag', worldIn(nextTo('anarchoi')), 'DRIFTER', 'anarchoi', T0 + 100)
    const s = galaxyState([...list, anarchoi], T0 + 200)
    // (three ahead when the Anarchoi's flag went in; two once it had taken that world)
    expect(s.held.nomarchy - s.held.anarchoi).toBe(2)
    expect(s.points[anarchoi.id]).toBeCloseTo(INFLUENCE.flag * (1 + 3 * INFLUENCE.underdogStep))
  })

  it('rejects events from the future, and a pilot who changes side', () => {
    const ahead = ev('flag', near, 'ALPHA', 'nomarchy', T0 + INFLUENCE.future + 30)
    expect(galaxyState([ahead], T0).rejected[ahead.id]).toBe('from the future')
    const first = ev('flag', near, 'TURNCOAT', 'nomarchy', T0)
    const turned = ev('flag', worldIn(nextTo('anarchoi')), 'TURNCOAT', 'anarchoi', T0 + 60)
    const s = galaxyState([turned, first], T0 + 120)
    expect(s.rejected[turned.id]).toBe('his side changed')
    expect(s.worlds[worldIn(nextTo('anarchoi'))].holder).toBeNull()
  })

  it('names a world after the first pilot to land, with a name it offers him, for good', () => {
    const w = near
    const alpha = discoveryNames(w, key('ALPHA'), 'nomarchy')
    expect(alpha).toHaveLength(4)
    expect(discoveryNames(w, key('ALPHA'), 'nomarchy')).toEqual(alpha)
    const bravo = discoveryNames(w, key('BRAVO'), 'anarchoi')
    const later = ev('name', w, 'BRAVO', 'anarchoi', T0 + 60, { name: bravo[0] })
    const first = ev('name', w, 'ALPHA', 'nomarchy', T0, { name: alpha[2] })
    const made = ev('name', worldIn(nextTo('anarchoi')), 'CHEAT', 'anarchoi', T0, { name: 'RUDE WORDS' })
    const s = galaxyState([later, made, first], T0 + 400 * DAY)
    expect(s.names[w]).toEqual({ name: alpha[2], by: key('ALPHA'), callsign: 'ALPHA', at: T0 })
    expect(s.rejected[made.id]).toBe('not a name it could be given')
    expect(s.names[homeWorld('nomarchy').id]).toBeUndefined()
  })

  it('works the same state out of the same events in any order, with any repeated', () => {
    // a busy week: three pilots a side, flags, deliveries, kills, wrecks, graves, beacons and names
    const rnd = mulberry32(42)
    const pilots: [string, Side][] = [
      ['ALPHA', 'nomarchy'],
      ['BRAVO', 'nomarchy'],
      ['CEDAR', 'nomarchy'],
      ['DUSK', 'anarchoi'],
      ['EMBER', 'anarchoi'],
      ['FANG', 'anarchoi'],
    ]
    const habitable = g.worlds.filter((w) => w.habitable).map((w) => w.id)
    const kinds: WorldEvent['kind'][] = ['flag', 'deliver', 'kill', 'wreck', 'grave', 'beacon', 'flag', 'kill']
    const list: WorldEvent[] = []
    for (let i = 0; i < 600; i++) {
      const [who, side] = pilots[Math.floor(rnd() * pilots.length)]
      const world = habitable[Math.floor(rnd() * habitable.length)]
      const kind = kinds[Math.floor(rnd() * kinds.length)]
      // (some at the very same second, to test the tie-break)
      const at = T0 - 9 * DAY + Math.floor(rnd() * 10 * DAY) - (i % 7 === 0 ? 0 : 0)
      list.push(ev(kind, world, who, side, i % 11 === 0 ? T0 : at, { n: Math.floor(rnd() * 60) }))
    }
    list.push(ev('name', near, 'ALPHA', 'nomarchy', T0 - DAY, { name: discoveryNames(near, key('ALPHA'), 'nomarchy')[1] }))
    const want = stateSummary(galaxyState(list, T0 + 3600))
    expect(JSON.parse(want).held.nomarchy + JSON.parse(want).held.anarchoi).toBeGreaterThan(10)
    for (let seed = 1; seed <= 6; seed++) {
      const again = shuffled([...list, ...list.slice(0, 50 * seed)], seed)
      expect(stateSummary(galaxyState(again, T0 + 3600))).toBe(want)
    }
  })
})

describe('the day', () => {
  it('has three hotspots on the frontier, the same for everyone, different from day to day', () => {
    const day = dayOfSeconds(T0)
    const today = hotspotsOn(day)
    expect(today).toHaveLength(3)
    expect(hotspotsOn(day)).toEqual(today)
    for (const id of today) expect(g.systems[g.worlds.find((w) => w.id === id)!.system].side).toBeNull()
    expect(new Set(today.map((id) => g.worlds.find((w) => w.id === id)!.system)).size).toBe(3)
    const week = Array.from({ length: 7 }, (_, i) => hotspotsOn(day + i).join())
    expect(new Set(week).size).toBeGreaterThan(4)
  })

  it('has three tasks: one at a hotspot, one of fighting, one of territory or travel', () => {
    const day = dayOfSeconds(T0)
    const tasks = dailyTasks(day)
    expect(tasks.map((t) => t.kind)[0]).toBe('hotspot')
    expect(['pilot', 'raiders']).toContain(tasks[1].kind)
    expect(['flag', 'beacon', 'bank', 'land']).toContain(tasks[2].kind)
    expect(dailyTasks(day)).toEqual(tasks)
    for (const t of tasks) expect(t.reward).toBeGreaterThan(0)
  })

  it('ranks a pilot by what he has added to his side', () => {
    expect(rankOf(0)).toBe(0)
    expect(rankOf(39)).toBe(0)
    expect(rankOf(40)).toBe(1)
    expect(rankOf(1e6)).toBe(5)
  })
})
