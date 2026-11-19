// The persistent world, worked out (the plan's sections 12, 13 and 18). What players do that
// outlasts a session is a set of events: a flag planted, resources delivered, a kill, a wreck, a
// grave, a beacon, a ghost, a world named. The set is only ever added to, and two players' sets
// merge by union; every player works the galaxy out from his set with this one rule, so the order
// events arrived in never matters: they are taken in order of their time (and id, for a tie).
//
// Influence: each habitable world has influence per side, from the deeds of the last seven days
// (INFLUENCE.lasts). The side with the most holds it, once it has at least `holdLeast`. A deed
// counts only on the front line: a world in its side's home system, or in a system that holds a
// world of its side, or one joined to such a system by a lane. Each pilot adds at most
// `dailyMost` points to a world in a UTC day. The side holding fewer worlds earns more for each
// deed, the further behind it is. A side's capital world is always its own; its other home
// worlds start with a standing influence of their side's.
//
// What is checked here: an event from the future (beyond a few minutes' slack) is rejected; a
// pilot's side is the one his first event says (later events claiming the other are rejected); a
// world's discovery name must be one of the names this rule offers that pilot for that world. The
// signature is checked when an event is let into the set (net/archive.ts), before it gets here.
// Cheating is otherwise accepted for now; these events are what later rules would check.
//
// Nothing here knows the network or the clock: the moment to work it out at is handed in.

import { INFLUENCE, TRACE_LIFE } from '../data/territory'
import { mulberry32 } from '../util/math'
import { homeWorld, surfaceById, theGalaxy } from './galaxy'
import type { Side } from './galaxy'
import { makeName } from './names'

export type EventKind = 'flag' | 'deliver' | 'kill' | 'wreck' | 'grave' | 'beacon' | 'ghost' | 'name'
export const EVENT_KINDS: EventKind[] = ['flag', 'deliver', 'kill', 'wreck', 'grave', 'beacon', 'ghost', 'name']

/** one thing a pilot did that the galaxy remembers, as checked from his signed event (net/events.ts) */
export interface WorldEvent {
  /** the signed event's id (64 hex digits): ties in time are broken by it */
  id: string
  /** the pilot: his public key, his side and his callsign when he did it */
  by: string
  side: Side
  callsign: string
  /** seconds since 1970 (UTC) */
  at: number
  kind: EventKind
  /** the world it happened on ('w12') */
  world: string
  /** where on the world (px) */
  x: number
  y: number
  z: number
  /** a number of its own: units delivered; a kill of a pilot (1) or a raider (0); a beacon's phrase; a wreck's salvage */
  n: number
  /** a discovery name; a ship's hull (a wreck, a ghost) */
  name?: string
  hull?: string
  /** a ghost's flight: x, y, z, heading for each sample, GHOST.rate a second */
  path?: number[]
}

/** a habitable world, as the events leave it */
export interface WorldHold {
  id: string
  holder: Side | null
  /** influence of each side now (with the home side's standing influence) */
  influence: Record<Side, number>
  /** whether each side can add influence here now (it is on that side's front) */
  front: Record<Side, boolean>
  /** a side's capital world: never anyone else's */
  capital: boolean
}

export interface Contributor {
  key: string
  callsign: string
  side: Side
  points: number
}

export interface GalaxyState {
  /** the moment it was worked out at (seconds since 1970) */
  now: number
  /** every habitable world, by id */
  worlds: Record<string, WorldHold>
  /** how many habitable worlds each side holds */
  held: Record<Side, number>
  /** worlds named by the first pilot to land there (for good) */
  names: Record<string, { name: string; by: string; callsign: string; at: number }>
  /** traces still standing (flags, wrecks, graves, beacons, ghosts), oldest first */
  traces: WorldEvent[]
  /** influence each event counted for (by id): 0 for one that did not count */
  points: Record<string, number>
  /** pilots by what they added to their side in the last seven days, most first */
  contributors: Contributor[]
  /** events rejected, and why (for the tests and the curious) */
  rejected: Record<string, string>
}

const SIDES: Side[] = ['nomarchy', 'anarchoi']
const other = (s: Side): Side => (s === 'nomarchy' ? 'anarchoi' : 'nomarchy')

/** the galaxy's shape as the rule needs it (worked out once) */
interface Map_ {
  /** habitable worlds: id, system, whose home system it is in, a capital */
  worlds: { id: string; system: number; home: Side | null; capital: boolean }[]
  index: Map<string, number>
  /** systems joined to each system by a lane */
  near: number[][]
  home: Record<Side, number>
}
let shape: Map_ | null = null
function mapOf(): Map_ {
  if (shape) return shape
  const g = theGalaxy()
  const capitals = new Set(SIDES.map((s) => homeWorld(s).id))
  const worlds = g.worlds
    .filter((w) => w.habitable)
    .map((w) => ({ id: w.id, system: w.system, home: g.systems[w.system].side, capital: capitals.has(w.id) }))
  const near = g.systems.map(() => [] as number[])
  for (const l of g.lanes) {
    near[l.a].push(l.b)
    near[l.b].push(l.a)
  }
  const home = { nomarchy: g.systems.findIndex((s) => s.side === 'nomarchy'), anarchoi: g.systems.findIndex((s) => s.side === 'anarchoi') }
  shape = { worlds, index: new Map(worlds.map((w, i) => [w.id, i])), near, home }
  return shape
}

/** the habitable worlds' ids */
export const habitableWorlds = () => mapOf().worlds.map((w) => w.id)

/** true for a world that can be named by the first pilot to land there: any of the galaxy's surfaces but the two capitals */
export function nameable(world: string) {
  const s = surfaceById(world)
  return !!s && !SIDES.some((side) => homeWorld(side).id === world)
}

/** the names a pilot may give a world he is the first to land on: four in his side's voice, from his key and the world */
export function discoveryNames(world: string, key: string, side: Side): string[] {
  const s = surfaceById(world)
  if (!s) return []
  const rnd = mulberry32(((parseInt(key.slice(0, 8), 16) | 0) ^ Math.imul(s.index + 1, 0x9e3779b1)) | 0)
  const out: string[] = []
  for (let i = 0; out.length < 4 && i < 40; i++) {
    const n = makeName(rnd, side, i % 3)
    if (n.length <= 16 && !out.includes(n)) out.push(n)
  }
  return out
}

/** the influence a deed is worth before the day's limit and the underdog's pace (0: it adds none) */
export function pointsOf(e: Pick<WorldEvent, 'kind' | 'n'>) {
  if (e.kind === 'flag') return INFLUENCE.flag
  if (e.kind === 'deliver') return Math.min(INFLUENCE.deliverMost, Math.max(0, e.n) * INFLUENCE.perUnit)
  if (e.kind === 'kill') return e.n === 1 ? INFLUENCE.pilotKill : INFLUENCE.raiderKill
  return 0
}

/** why an event cannot be taken as it is (null: it can) */
function problem(e: WorldEvent, now: number): string | null {
  if (!e || typeof e.id !== 'string' || typeof e.by !== 'string') return 'malformed'
  if (!Number.isFinite(e.at) || e.at > now + INFLUENCE.future) return 'from the future'
  if (!SIDES.includes(e.side)) return 'no side'
  if (!surfaceById(e.world)) return 'no such world'
  if (![e.x, e.y, e.z, e.n].every(Number.isFinite)) return 'malformed'
  if (!(EVENT_KINDS as string[]).includes(e.kind)) return 'unknown kind'
  return null
}

/** events in the order the rule takes them: by time, then by id */
export const byTime = (a: WorldEvent, b: WorldEvent) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * The galaxy as a set of events leaves it at moment `now` (seconds since 1970). A pure function
 * of the set: the same events in any order, with any repeated, give the same state.
 */
export function galaxyState(events: Iterable<WorldEvent>, now: number): GalaxyState {
  const map = mapOf()
  const rejected: Record<string, string> = {}
  // (one of each id; anything that cannot be taken is set aside)
  const seen = new Map<string, WorldEvent>()
  for (const e of events) {
    if (seen.has(e.id)) continue
    const why = problem(e, now)
    if (why) rejected[e.id] = why
    else seen.set(e.id, e)
  }
  const list = [...seen.values()].sort(byTime)

  // a pilot's side is the one his first event gives
  const sideOf = new Map<string, Side>()
  const taken: WorldEvent[] = []
  for (const e of list) {
    const s = sideOf.get(e.by)
    if (s === undefined) sideOf.set(e.by, e.side)
    else if (s !== e.side) {
      rejected[e.id] = 'his side changed'
      continue
    }
    taken.push(e)
  }

  // ── discovery names: the first good one for each world, for good
  const names: GalaxyState['names'] = {}
  for (const e of taken) {
    if (e.kind !== 'name' || names[e.world]) continue
    if (!nameable(e.world) || !e.name || !discoveryNames(e.world, e.by, e.side).includes(e.name)) {
      rejected[e.id] = 'not a name it could be given'
      continue
    }
    names[e.world] = { name: e.name, by: e.by, callsign: e.callsign, at: e.at }
  }

  // ── influence, replayed from two weeks back (older deeds cannot count, and the front they made has faded)
  const W = map.worlds.length
  const inf = SIDES.map(() => new Float64Array(W))
  const holder: (Side | null)[] = new Array(W).fill(null)
  const held: Record<Side, number> = { nomarchy: 0, anarchoi: 0 }
  /** worlds each side holds in each system */
  const heldIn: Record<Side, number[]> = { nomarchy: theGalaxy().systems.map(() => 0), anarchoi: theGalaxy().systems.map(() => 0) }
  const standing = (w: number, s: Side) => (map.worlds[w].home === s && !map.worlds[w].capital ? INFLUENCE.homeBase : 0)
  const holderOf = (w: number): Side | null => {
    const m = map.worlds[w]
    if (m.capital) return m.home
    const c = inf[0][w] + standing(w, 'nomarchy')
    const d = inf[1][w] + standing(w, 'anarchoi')
    if (c > d && c >= INFLUENCE.holdLeast) return 'nomarchy'
    if (d > c && d >= INFLUENCE.holdLeast) return 'anarchoi'
    return null
  }
  const settle = (w: number) => {
    const was = holder[w]
    const now_ = holderOf(w)
    if (was === now_) return
    const sys = map.worlds[w].system
    if (was) {
      held[was]--
      heldIn[was][sys]--
    }
    if (now_) {
      held[now_]++
      heldIn[now_][sys]++
    }
    holder[w] = now_
  }
  for (let w = 0; w < W; w++) settle(w)
  /** true if side `s` can add influence to world `w` now: its home system, or a system that is, or is next to, one it holds a world in */
  const onFront = (w: number, s: Side) => {
    const m = map.worlds[w]
    if (m.capital) return false
    if (m.system === map.home[s] || heldIn[s][m.system] > 0) return true
    return map.near[m.system].some((n) => n === map.home[s] || heldIn[s][n] > 0)
  }

  const points: Record<string, number> = {}
  const added = new Map<string, Contributor>()
  const used = new Map<string, number>()
  const live: { at: number; w: number; s: number; pts: number }[] = []
  let gone = 0
  const expire = (t: number) => {
    while (gone < live.length && live[gone].at <= t - INFLUENCE.lasts) {
      const c = live[gone++]
      inf[c.s][c.w] -= c.pts
      // (sums of floats never quite come back to nothing)
      if (Math.abs(inf[c.s][c.w]) < 1e-9) inf[c.s][c.w] = 0
      settle(c.w)
    }
  }
  const from = now - 2 * INFLUENCE.lasts
  for (const e of taken) {
    const raw0 = pointsOf(e)
    if (raw0 <= 0) continue
    if (e.at <= from) {
      points[e.id] = 0
      continue
    }
    expire(e.at)
    const w = map.index.get(e.world)
    if (w === undefined || !onFront(w, e.side)) {
      points[e.id] = 0
      continue
    }
    const day = Math.floor(e.at / 86_400)
    const key = `${e.by}|${e.world}|${day}`
    const room = INFLUENCE.dailyMost - (used.get(key) ?? 0)
    const raw = Math.min(raw0, room)
    if (raw <= 0) {
      points[e.id] = 0
      continue
    }
    used.set(key, (used.get(key) ?? 0) + raw)
    const behind = held[other(e.side)] - held[e.side]
    const pace = 1 + Math.min(INFLUENCE.underdogMost, Math.max(0, behind) * INFLUENCE.underdogStep)
    const pts = raw * pace
    const s = e.side === 'nomarchy' ? 0 : 1
    inf[s][w] += pts
    live.push({ at: e.at, w, s, pts })
    settle(w)
    points[e.id] = pts
    if (e.at > now - INFLUENCE.lasts) {
      const c = added.get(e.by) ?? { key: e.by, callsign: e.callsign, side: e.side, points: 0 }
      c.points += pts
      c.callsign = e.callsign
      added.set(e.by, c)
    }
  }
  expire(now)

  const worlds: Record<string, WorldHold> = {}
  for (let w = 0; w < W; w++) {
    const m = map.worlds[w]
    worlds[m.id] = {
      id: m.id,
      holder: holder[w],
      influence: { nomarchy: inf[0][w] + standing(w, 'nomarchy'), anarchoi: inf[1][w] + standing(w, 'anarchoi') },
      front: { nomarchy: onFront(w, 'nomarchy'), anarchoi: onFront(w, 'anarchoi') },
      capital: m.capital,
    }
  }

  const traces = taken.filter((e) => {
    const life = TRACE_LIFE[e.kind]
    return life !== undefined && e.at > now - life
  })
  const contributors = [...added.values()].sort((a, b) => b.points - a.points || (a.key < b.key ? -1 : 1))
  return { now, worlds, held: { ...held }, names, traces, points, contributors, rejected }
}

/** a short account of a state that is the same whenever the state is (for the tests: shuffled sets must agree) */
export function stateSummary(s: GalaxyState) {
  const r = (v: number) => Math.round(v * 1000) / 1000
  return JSON.stringify({
    worlds: Object.values(s.worlds).map((w) => [
      w.id,
      w.holder,
      r(w.influence.nomarchy),
      r(w.influence.anarchoi),
      w.front.nomarchy,
      w.front.anarchoi,
    ]),
    held: s.held,
    names: s.names,
    traces: s.traces.map((e) => e.id),
    points: Object.entries(s.points)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([id, p]) => [id, r(p)]),
    contributors: s.contributors.map((c) => [c.key, r(c.points)]),
    rejected: Object.entries(s.rejected).sort(([a], [b]) => (a < b ? -1 : 1)),
  })
}
