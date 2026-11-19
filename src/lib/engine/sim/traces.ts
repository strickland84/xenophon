// The persistent world, from the scene's side (the plan's sections 12 and 13). The page works out
// from the events who holds each world, the world's discovery name, and the traces other pilots
// left on it (flags, wrecks, graves, beacons, ghosts), and tells the scene (Scene.setTraces). The
// scene draws them (render/traces.ts) and lets the pilot act on them; and it says what he did that
// the galaxy should remember (Scene.takeDeeds): a flag planted at the capture site, resources
// delivered to a base, a kill, his ship lost (a wreck), his death on foot (a grave), a beacon with
// its phrase, a flight recorded as a ghost, a wreck salvaged, a landing. The page signs those into
// events. Deeds are kept whether or not the sky is shared: the galaxy remembers a lone pilot too.
//
//   holders      who holds each world: a base that is not a capital belongs to its world's holder
//                (friendly to land, bank and respawn at; its turrets on his side; its flag his colour)
//   capture site each habitable world's outpost (its last base), but not a capital's: on foot by its
//                mast, held Use plants the pilot's flag in the ring round it, if his side can reach
//                the world (it is on his front, as the page says)
//   wrecks       a pilot on foot strips another's wreck once for a little salvage
//   beacons      read (their phrase shown) by a pilot near one, on foot or flying low
//   ghosts       a recorded flight played over and over, on the shared clock, a pale ship to race
//                or shoot at (a shot scatters it until its next run)
//   hotspots     the day's richer worlds (galaxy/daily.ts): more ore in each outcrop, cut faster
//
// With nothing said by the page (alone, the scripted flights of other phases) it all stands as
// before: no holders, no traces, the bases as they were stamped.

import { BEACON_PHRASES, BEACON_READ, CAPTURE, GHOST, HOTSPOT, WRECK } from '../data/territory'
import { dayOfSeconds, isHotspot } from '../galaxy/daily'
import { homeWorld, surfaceById, theGalaxy } from '../galaxy/galaxy'
import { makeJet } from '../jet/jet'
import type { Jet } from '../jet/jet'
import { meshOf } from '../jet/mesh'
import type { JetMesh } from '../jet/mesh'
import { createPaint, paintShip } from '../render/paint'
import type { ShipPaint } from '../render/paint'
import type { SceneState } from '../state'
import { groundAt } from '../world/world'
import type { Base, BaseOwner } from '../world/features'
import { addTo } from './cargo'
import { LEADER } from './combat'
import { addSpark, jitter, sound, SPARK_SHIELD } from './effects'
import { SHOT_F, SHOT_N } from './guns'
import { news, nowOf, wrapDelta } from './loop'

export type MarkKind = 'flag' | 'wreck' | 'grave' | 'beacon' | 'ghost'

/** a trace another pilot (or this one, in an earlier session) left on the world, as the page hands it in */
export interface Mark {
  id: string
  kind: MarkKind
  /** who left it: his key, side and callsign */
  by: string
  side: string
  callsign: string
  x: number
  y: number
  z: number
  /** a beacon's phrase; a wreck's salvage */
  n: number
  /** seconds since 1970 it was left */
  at: number
  /** a wreck's or a ghost's hull, and a ghost's flight (x, y, z, heading a sample) */
  hull: string
  path: number[] | null
  /** the player's own */
  own: boolean
}

/** what the page says of the galaxy (Scene.setTraces); anything left out stays as it was */
export interface TracesInput {
  /** each world's holder, by id ('' nobody) */
  holders?: Record<string, string>
  /** this world's discovery name and who gave it ('' none) */
  name?: string
  finder?: string
  /** whether the player's side can add influence on this world now (its flag would count) */
  front?: boolean
  /** the traces on this world */
  marks?: Mark[]
  /** wrecks the player has already stripped (by id) */
  stripped?: string[]
}

/** something the player did that the galaxy remembers (Scene.takeDeeds) */
export interface Deed {
  kind: 'flag' | 'deliver' | 'kill' | 'wreck' | 'grave' | 'beacon' | 'ghost' | 'salvage' | 'landed' | 'ghostShot'
  /** the zone it happened in (a world 'w12', or a system's space 's3') */
  world: string
  x: number
  y: number
  z: number
  /** units delivered; a kill of a pilot (1) or a raider (0); a beacon's phrase; units salvaged */
  n: number
  hull?: string
  path?: number[]
  /** the trace it was done to (a wreck salvaged, a ghost shot) */
  id?: string
}

/** a ghost as it flies here: its mark, the ship drawn for it, and when it was last shot */
export interface Ghost {
  mark: Mark
  jet: Jet
  mesh: JetMesh
  paint: ShipPaint
  shown: boolean
  /** scene time it was scattered (it comes back on its next run) */
  shotAt: number
  /** its run when it was shot */
  shotRun: number
}

export interface Traces {
  /** the page has said how the galaxy stands */
  known: boolean
  holders: Record<string, string>
  name: string
  finder: string
  front: boolean
  marks: Mark[]
  ghosts: Ghost[]
  stripped: Set<string>
  /** seconds Use has been held at the capture site, and scene time the last flag went in */
  planting: number
  plantedAt: number
  /** the beacon being read, and the scene time it came in reach */
  reading: { mark: Mark; t: number } | null
  /** a flight being recorded (x, y, z, heading a sample), seconds of it, and towards the next sample */
  recording: number[] | null
  recordT: number
  sampleT: number
  /** whether this world is a hotspot today (worked out once a day) */
  hot: { day: number; key: string; on: boolean }
  /** the phrase the next beacon says */
  phrase: number
  /** what the page has not yet taken */
  deeds: Deed[]
  /** local marks' numbers */
  count: number
}

export function createTraces(): Traces {
  return {
    known: false,
    holders: {},
    name: '',
    finder: '',
    front: true,
    marks: [],
    ghosts: [],
    stripped: new Set(),
    planting: 0,
    plantedAt: -99,
    reading: null,
    recording: null,
    recordT: 0,
    sampleT: 0,
    hot: { day: -1, key: '', on: false },
    phrase: 0,
    deeds: [],
    count: 0,
  }
}

/** the most deeds kept before the page takes them */
const DEEDS_MOST = 64

/** a deed for the page to sign */
export function deed(scene: SceneState, d: Omit<Deed, 'world'> & { world?: string }) {
  const list = scene.traces.deeds
  list.push({ world: scene.worldKey, ...d })
  if (list.length > DEEDS_MOST) list.shift()
}

/** what the page says of the galaxy */
export function setTraces(scene: SceneState, t: TracesInput) {
  const tr = scene.traces
  if (t.holders) tr.holders = { ...t.holders }
  // (a world named while the pilot is on it: the moment is told)
  if (t.name && t.name !== tr.name && tr.known && scene.zone.kind === 'surface')
    news(scene, t.name.toUpperCase(), `NAMED BY ${t.finder || '?'}`)
  if (t.name !== undefined) tr.name = t.name
  if (t.finder !== undefined) tr.finder = t.finder
  if (t.front !== undefined) tr.front = t.front
  if (t.stripped) tr.stripped = new Set(t.stripped)
  if (t.marks) {
    // (a mark made here and not yet back as an event stays until it is)
    const local = tr.marks.filter(
      (m) =>
        m.id.startsWith('here-') && !t.marks!.some((n) => n.own && n.kind === m.kind && Math.abs(n.x - m.x) < 4 && Math.abs(n.y - m.y) < 4),
    )
    tr.marks = [...t.marks.map((m) => ({ ...m })), ...local]
    // (beacons planted this session and now known as traces are drawn once)
    const beacons = scene.signals.beacons
    for (const m of tr.marks)
      if (m.kind === 'beacon')
        for (let i = beacons.length - 1; i >= 0; i--) {
          const b = beacons[i]
          if ((b.owner === m.by || (m.own && b.owner === '')) && Math.abs(b.x - m.x) < 4 && Math.abs(b.y - m.y) < 4) beacons.splice(i, 1)
        }
    // ghosts: a ship for each (kept for those still there)
    const old = new Map(tr.ghosts.map((g) => [g.mark.id, g]))
    tr.ghosts = tr.marks
      .filter((m) => m.kind === 'ghost' && m.path && m.path.length >= 8)
      .slice(-GHOST.most)
      .map((m) => {
        const was = old.get(m.id)
        if (was) return { ...was, mark: m }
        const mesh = meshOf(m.hull || 'corsair')
        const paint = createPaint()
        paintShip(paint, mesh.model, GHOST_PAINT, scene.params.timeOfDay)
        return {
          mark: m,
          jet: makeJet(m.path![0], m.path![1], m.path![2], m.path![3]),
          mesh,
          paint,
          shown: false,
          shotAt: -99,
          shotRun: -1,
        }
      })
    if (tr.reading && !tr.marks.includes(tr.reading.mark)) tr.reading = null
  }
  tr.known = true
}

/** a ghost's colours: pale and cold */
const GHOST_PAINT = { body: '#9fd8ff', accent: '#e8fbff', canopy: '#5ab4ff' }

/** who holds the world the scene is over ('' nobody, or not said) */
export const holderHere = (scene: SceneState) => scene.traces.holders[scene.worldKey] ?? ''

/**
 * Whose a base is now: a capital its side's; any other its world's holder's, or as it was stamped while nobody holds it.
 * A station in space is its world's too, the world it orbits (the polish pass: stations did not change hands with their
 * world); one orbiting nothing that can be held stays as it was.
 */
export function ownerOf(scene: SceneState, b: Base): BaseOwner {
  if (b.capital) return b.owner
  const h = scene.zone.kind === 'space' ? (scene.traces.holders[stationWorld(b.id)] ?? '') : holderHere(scene)
  return h === 'nomarchy' || h === 'anarchoi' ? h : b.owner
}

/** the world a station orbits (its surface's id, '' none): a station's base has its body's index for its id */
function stationWorld(index: number) {
  const g = theGalaxy()
  const around = g.bodies[index]?.orbit.around ?? -1
  const world = around >= 0 ? g.bodies[around].world : -1
  return world >= 0 ? g.worlds[world].id : ''
}

/** the base whose mast is the world's capture site (null: none here: space, a capital world, a moon, the island world) */
export function captureBase(scene: SceneState): Base | null {
  if (scene.zone.kind !== 'surface' || !scene.params.side) return null
  const s = surfaceById(scene.worldKey)
  if (!s || !s.habitable || homeWorld('nomarchy').id === s.id || homeWorld('anarchoi').id === s.id) return null
  const bases = scene.world.features.bases
  return bases.length ? bases[bases.length - 1] : null
}

/** whether the world is a hotspot today (the scene must have been told the time: Scene.setClock) */
export function hotspotHere(scene: SceneState) {
  if (scene.zone.kind !== 'surface' || scene.loop.clock <= 0) return false
  const day = dayOfSeconds(nowOf(scene))
  const h = scene.traces.hot
  if (h.day !== day || h.key !== scene.worldKey) {
    h.day = day
    h.key = scene.worldKey
    h.on = isHotspot(scene.worldKey, day)
  }
  return h.on
}

/** how much an outcrop holds in each of its periods, today (a hotspot's are richer) */
export const stockOf = (scene: SceneState, stock: number) => (hotspotHere(scene) ? Math.round(stock * HOTSPOT.stock) : stock)
/** how fast the laser cuts, today */
export const paceHere = (scene: SceneState) => (hotspotHere(scene) ? HOTSPOT.pace : 1)

// ── on foot: the capture site and wrecks (foot.ts asks)

/** the capture site itself: the foot of the outpost's mast, on the open ground beside its pad */
export function capturePoint(scene: SceneState): { x: number; y: number; z: number } | null {
  const b = captureBase(scene)
  return b ? { x: b.mast.x, y: b.mast.y, z: groundAt(scene.world, b.mast.x, b.mast.y) } : null
}

/** px from the capture site (Infinity: there is none) */
export function siteDistance(scene: SceneState, x: number, y: number) {
  const c = capturePoint(scene)
  return c ? Math.hypot(wrapDelta(c.x - x), wrapDelta(c.y - y)) : Infinity
}

/** what Use would do at the capture site: 'flag' (plant one), 'front' (his side cannot reach here), or '' (not near it) */
export function capturePrompt(scene: SceneState, x: number, y: number) {
  if (siteDistance(scene, x, y) > CAPTURE.reach) return ''
  if (scene.time - scene.traces.plantedAt < 20) return ''
  return scene.traces.front ? 'flag' : 'front'
}

/** Use held at the capture site: when it has been held long enough, his flag goes in the ring round the mast */
export function plantStep(scene: SceneState, dt: number, held: boolean, x: number, y: number) {
  const tr = scene.traces
  if (!held) {
    tr.planting = 0
    return
  }
  tr.planting += dt
  if (tr.planting < CAPTURE.plantTime) return
  tr.planting = 0
  tr.plantedAt = scene.time
  const c = capturePoint(scene)!
  const a = Math.atan2(wrapDelta(x - c.x), -wrapDelta(y - c.y))
  const fx = c.x + Math.sin(a) * CAPTURE.ring
  const fy = c.y - Math.cos(a) * CAPTURE.ring
  const fz = groundAt(scene.world, fx, fy)
  const side = scene.params.side
  tr.marks.push(localMark(scene, 'flag', fx, fy, fz, 0))
  deed(scene, { kind: 'flag', x: fx, y: fy, z: fz, n: 0 })
  sound(scene, 'beacon', fx, fy, fz, 1, true)
  sound(scene, 'bank', fx, fy, fz, 1, true)
  news(scene, 'FLAG PLANTED', side === 'anarchoi' ? 'FOR THE ANARCHOI' : 'FOR THE NOMARCHY')
}

/** a trace of the player's own, made here, drawn until the page hands it back as an event */
function localMark(scene: SceneState, kind: MarkKind, x: number, y: number, z: number, n: number): Mark {
  return {
    id: `here-${scene.traces.count++}`,
    kind,
    by: '',
    side: scene.params.side,
    callsign: 'YOU',
    x,
    y,
    z,
    n,
    at: nowOf(scene),
    hull: scene.params.hull,
    path: null,
    own: true,
  }
}

/** another pilot's wreck within reach that the player has not stripped */
export function wreckNear(scene: SceneState, x: number, y: number) {
  const tr = scene.traces
  let best: Mark | null = null
  let bestD: number = WRECK.reach
  for (const m of tr.marks) {
    if (m.kind !== 'wreck' || m.own || tr.stripped.has(m.id)) continue
    const d = Math.hypot(wrapDelta(m.x - x), wrapDelta(m.y - y))
    if (d < bestD) {
      bestD = d
      best = m
    }
  }
  return best
}

/** the player strips a wreck: its salvage into his pack (what fits) */
export function salvage(scene: SceneState, m: Mark, pack: Parameters<typeof addTo>[0], gathered: Map<string, number>) {
  const units = Math.max(1, Math.min(20, Math.round(m.n || WRECK.salvage)))
  const took = addTo(pack, 'salvage', units)
  if (took <= 0) {
    news(scene, 'PACK FULL', 'CLIMB ABOARD TO EMPTY IT', false)
    return
  }
  scene.traces.stripped.add(m.id)
  gathered.set('salvage', (gathered.get('salvage') ?? 0) + took)
  deed(scene, { kind: 'salvage', x: m.x, y: m.y, z: m.z, n: took, id: m.id })
  sound(scene, 'crate', m.x, m.y, m.z, 1, true)
  news(scene, 'SALVAGED', `${took} SALVAGE FROM ${m.callsign}'S WRECK`)
}

// ── once a step, on a world's surface

export function stepTraces(scene: SceneState, dt: number) {
  const tr = scene.traces
  if (!tr.marks.length && !tr.recording && !tr.reading) return
  readBeacons(scene)
  flyGhosts(scene)
  record(scene, dt)
}

/** the nearest beacon in reach of the player (on foot, or flying low over it) is read */
function readBeacons(scene: SceneState) {
  const tr = scene.traces
  const p = scene.foot.stage !== 0 ? scene.foot.walker.jet : scene.jets[0]
  const ground = groundAt(scene.world, p.x, p.y)
  let best: Mark | null = null
  let bestD: number = BEACON_READ.reach
  if (p.z - ground < BEACON_READ.height)
    for (const m of tr.marks) {
      if (m.kind !== 'beacon' || m.own) continue
      const d = Math.hypot(wrapDelta(m.x - p.x), wrapDelta(m.y - p.y))
      if (d < bestD) {
        bestD = d
        best = m
      }
    }
  if (!best) tr.reading = null
  else if (tr.reading?.mark !== best) {
    tr.reading = { mark: best, t: scene.time }
    sound(scene, 'beacon', best.x, best.y, best.z, 0.5, false)
  }
}

/** a beacon's words */
export const phraseOf = (n: number) => BEACON_PHRASES[(((n | 0) % BEACON_PHRASES.length) + BEACON_PHRASES.length) % BEACON_PHRASES.length]

/** where a ghost is in its run now: its run's number, and whether it is flying (between runs it is gone) */
function ghostAt(scene: SceneState, g: Ghost) {
  const path = g.mark.path!
  const samples = path.length / 4
  const length = (samples - 1) / GHOST.rate
  const cycle = length + GHOST.rest
  const since = Math.max(0, nowOf(scene) - g.mark.at)
  const run = Math.floor(since / cycle)
  const t = since - run * cycle
  if (t > length) return { run, on: false }
  const u = t * GHOST.rate
  const i = Math.min(samples - 2, Math.floor(u))
  const k = u - i
  const a = i * 4
  const b = a + 4
  const j = g.jet
  j.x = path[a] + wrapDelta(path[b] - path[a]) * k
  j.y = path[a + 1] + wrapDelta(path[b + 1] - path[a + 1]) * k
  j.z = path[a + 2] + (path[b + 2] - path[a + 2]) * k
  let dh = path[b + 3] - path[a + 3]
  dh -= Math.PI * 2 * Math.round(dh / (Math.PI * 2))
  j.yaw = path[a + 3] + dh * k
  j.roll = Math.max(-1, Math.min(1, -dh * 3))
  return { run, on: true }
}

/** the ghosts fly their runs; the player's shots scatter them */
function flyGhosts(scene: SceneState) {
  const shots = scene.guns.shots
  for (const g of scene.traces.ghosts) {
    const { run, on } = ghostAt(scene, g)
    g.shown = on && !(g.shotRun === run)
    if (!g.shown) continue
    const j = g.jet
    for (let i = 0; i < SHOT_N; i++) {
      const o = i * SHOT_F
      if (shots[o + 6] < 0 || scene.guns.by[i]?.kind !== LEADER) continue
      const dx = wrapDelta(shots[o] - j.x)
      const dy = wrapDelta(shots[o + 1] - j.y)
      const dz = shots[o + 2] - j.z
      if (dx * dx + dy * dy + dz * dz > 64) continue
      g.shotRun = run
      g.shotAt = scene.time
      g.shown = false
      shots[o + 6] = -99
      for (let s = 0; s < 14; s++)
        addSpark(scene, j.x, j.y, j.z, jitter(scene, 3) * 70, jitter(scene, 5) * 70, jitter(scene, 7) * 50, SPARK_SHIELD)
      sound(scene, 'shieldDown', j.x, j.y, j.z, 1, false)
      deed(scene, { kind: 'ghostShot', x: j.x, y: j.y, z: j.z, n: 0, id: g.mark.id })
      news(scene, 'GHOST SCATTERED', `${g.mark.callsign}'S RUN`)
      break
    }
  }
}

/** the player's flight, sampled while it is being recorded */
function record(scene: SceneState, dt: number) {
  const tr = scene.traces
  if (!tr.recording) return
  const j = scene.jets[0]
  const flying = scene.foot.stage === 0 && scene.eject.stage === 0 && scene.loop.landing.stage === 0 && !j.away
  if (!flying) {
    // (landed, out of the ship or shot down: what was recorded is kept if it is long enough)
    finishGhost(scene)
    return
  }
  tr.recordT += dt
  tr.sampleT -= dt
  if (tr.sampleT <= 0) {
    tr.sampleT += 1 / GHOST.rate
    tr.recording.push(j.x, j.y, j.z, j.yaw)
  }
  if (tr.recordT >= GHOST.longest) finishGhost(scene)
}

/** starts recording the player's flight as a ghost (on), or stops and keeps it (off) */
export function recordGhost(scene: SceneState, on: boolean) {
  const tr = scene.traces
  if (on) {
    if (tr.recording || scene.zone.kind !== 'surface') return
    tr.recording = []
    tr.recordT = 0
    tr.sampleT = 0
    news(scene, 'RECORDING', `A GHOST OF YOUR FLIGHT: ${GHOST.longest} SECONDS`)
  } else finishGhost(scene)
}

function finishGhost(scene: SceneState) {
  const tr = scene.traces
  const path = tr.recording
  tr.recording = null
  if (!path) return
  if (path.length < 4 * GHOST.rate * 4) {
    news(scene, 'TOO SHORT', 'A GHOST NEEDS FOUR SECONDS OF FLIGHT', false)
    return
  }
  deed(scene, { kind: 'ghost', x: path[0], y: path[1], z: path[2], n: 0, hull: scene.params.hull, path })
  news(scene, 'GHOST RECORDED', 'OTHERS CAN RACE IT HERE FOR 14 DAYS')
}
