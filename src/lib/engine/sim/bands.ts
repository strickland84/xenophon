// The computer's ships that belong to places (the polish pass, item 8; numbers in data/bands.ts):
// raider bands that lurk and wait, a derelict's drones, each side's patrols. Nothing comes at a
// pilot from nowhere: what a zone holds follows from where it is (galaxy/danger.ts), worked out
// afresh when the scene comes into a zone (and when who holds what changes), the same in every game.
//
//   plans     what lives in the zone: each band's kind, ships, skill, and where it keeps to (a spot,
//             or a patrol's route), with an id that names it in every game
//   waking    a band's ships are put up when a pilot comes near its spot (a patrol: near where its
//             route has it on the clock), and taken down again once no pilot is near and none of
//             them is fighting, so a quiet zone costs nothing
//   beaten    a band whose every ship was shot down stays gone until a turn of its own clock at least
//             BAND.away seconds later: the same moment for every player (`cleared`, which a shared
//             room's host passes on)
//
// In a shared sky the game that flies the computer's ships (room.host) puts them up and takes them
// down; the others see them as that game's (remote) and only keep count. How a band's ships fly is
// pilots.ts (LURK, PATROL, RETURN); haulers going about their business are traffic.ts.

import { BAND, BAND_BOUNTY, BAND_PAINT, BAND_PAY, DANGER_NAMES, DRONES, PATROL, RAIDERS, SIDE_COLOURS } from '../data/bands'
import { DERELICT, SPACE_Z } from '../data/space'
import { statsOf } from '../data/hulls'
import { patrolsIn, reachOf, spaceBands, systemDanger, wildness, worldDanger } from '../galaxy/danger'
import { dayOfSeconds, isHotspot } from '../galaxy/daily'
import { surfaceById, systemOfKey, theGalaxy } from '../galaxy/galaxy'
import type { Side } from '../galaxy/galaxy'
import type { SceneState } from '../state'
import { hash8 } from '../util/math'
import { groundAt } from '../world/world'
import { fillOf } from './cargo'
import { LEADER, SHIP, SIDE_ENEMY, SIDE_PLAYER, SIDE_RIVAL } from './combat'
import type { Fighter } from './combat'
import { spill } from './crates'
import { sound } from './effects'
import { focus } from './ejection'
import { shoreNear, WALKING } from './foot'
import { deltaIn, looping, news, nowOf, record } from './loop'
import { ATTACK, EVADE, EXTEND, LURK, PATROL as PATROLLING, RETURN } from './pilots'
import { createShip } from './ships'
import { ENEMY_PAINT } from './skirmish'

/** a place a band keeps to: a point of the zone (body −1), or a place beside a body of a system's space, moving with it */
export interface Spot {
  body: number
  /** with no body, the point; beside one, how far out from it (along the way from the system's middle) and across */
  x: number
  y: number
  /** height (in space, SPACE_Z) */
  z: number
}

export interface BandPlan {
  /** names it in every game: from what it is and where (raiders at an outcrop, a gate, a belt …), never from its place in a list */
  id: number
  kind: 'raiders' | 'drones' | 'patrol'
  /** a patrol's side ('' raiders and drones: nobody's) */
  faction: Side | ''
  hulls: string[]
  /** how well its pilots fly: 0..1 (data/skirmish.ts skillAt) */
  level: number
  /** its system's wildness (galaxy/danger.ts): what its ships pay */
  wild: number
  /** where raiders and drones wait; a patrol's stops, flown out and back */
  home: Spot
  route: Spot[]
  /** where on its route a patrol is at the clock's zero, as a share of the way out and back; and seconds the way out and back takes */
  phase: number
  period: number
  /** how many of it go for one pilot at once (the rest wait their turn) */
  attackers: number
  /** what it does about a ship (px): sees it this near, and chases it this far from its spot (both further for a loaded one) */
  notice: number
  noticeLoaded: number
  leash: number
  leashLoaded: number
  /** put up when a pilot is this near, taken down when none is within the other */
  wake: number
  sleep: number
  /** the derelict it guards (a galaxy body's index; −1 none): its salvage is strewn when the drones come out */
  derelict: number
  // ── how it stands
  /** its ships are about */
  up: boolean
  /** of its ships this game flew, how many were shot down since they were put up, and of those how many by the player */
  downs: number
  mine: number
  /** it has come for the player (the news said so), until it settles again */
  alerted: boolean
  /** the scene's time the news last said so (a band that settles and comes again soon after is not news again) */
  toldAt: number
}

export interface Bands {
  /** the zone and side last looked at, and what the plans were made for (zone, side, wildness and patrols, the day's hotspot): '' none */
  zone: string
  key: string
  plans: BandPlan[]
  /** `zone:id` → seconds since 1970 a beaten band is back */
  cleared: Map<string, number>
  /** derelicts whose salvage was strewn, and when (seconds since 1970) */
  strewn: Map<number, number>
  /** scene seconds until the plans are looked at again */
  look: number
}

export function createBands(): Bands {
  return { zone: '', key: '', plans: [], cleared: new Map(), strewn: new Map(), look: 0 }
}

// ids: what a band is, and the thing it keeps to
const ID_DEPOSIT = 100
const ID_APPROACH = 120
const ID_MOON = 150
const ID_GATE = 1000
const ID_BELT = 2000
const ID_DERELICT = 3000
const ID_HOLE = 4000
const ID_PATROL = 5000

/** true while the scene's zone has the galaxy's own ships in it: a pilot of a side in the loop, with them not turned off */
export const peopled = (scene: SceneState) => scene.params.locals && looping(scene) && scene.zone.kind !== 'interior'

/** the plan of a band in the zone, by its id (null: none) */
export const bandOf = (scene: SceneState, id: number) => (id < 0 ? null : (scene.bands.plans.find((p) => p.id === id) ?? null))

/** where a spot is now */
export function spotAt(scene: SceneState, s: Spot, out: { x: number; y: number; z: number }) {
  if (s.body < 0) {
    out.x = s.x
    out.y = s.y
    out.z = s.z
    return out
  }
  const b = scene.space.bodies.find((q) => q.body.index === s.body)
  if (!b) {
    out.x = s.x
    out.y = s.y
    out.z = s.z
    return out
  }
  const r = Math.hypot(b.x, b.y) || 1
  const ux = b.x / r
  const uy = b.y / r
  out.x = b.x + ux * s.x - uy * s.y
  out.y = b.y + uy * s.x + ux * s.y
  out.z = s.z
  return out
}

/** the side number a band's ships fight on in this game: raiders against everyone, a patrol on its side */
export function sideOfBand(scene: SceneState, plan: BandPlan) {
  if (plan.kind !== 'patrol') return SIDE_ENEMY
  return plan.faction === scene.params.side ? SIDE_PLAYER : SIDE_RIVAL
}

/** what a ship of a band pays when it is downed, as a share of a raider's before (data/bands.ts BAND_PAY) */
export const payOf = (plan: BandPlan | null) => (plan ? (BAND_PAY[plan.wild] ?? 1) : 1)

/** px a second a patrol flies along its route, as its slowest ship flies it (pilots.ts PATROL) */
export function patrolPace(scene: SceneState) {
  const p = scene.params
  const slowest = Math.min(...PATROL.ships.map((h) => statsOf(h).speed))
  return p.speed * slowest * (1 + (Math.max(1, p.boost) - 1) * PATROL.pace)
}

// scratch
const a = { x: 0, y: 0, z: 0 }
const b = { x: 0, y: 0, z: 0 }

/** where a patrol is on its route at UTC `t` when no one is near to see it: the place, its heading, and the stop it is going to (and which way along the route) */
export function routeAt(scene: SceneState, plan: BandPlan, t: number) {
  const n = plan.route.length
  const legs: number[] = []
  let sum = 0
  for (let i = 0; i + 1 < n; i++) {
    spotAt(scene, plan.route[i], a)
    spotAt(scene, plan.route[i + 1], b)
    const d = Math.hypot(deltaIn(scene, b.x - a.x), deltaIn(scene, b.y - a.y))
    legs.push(d)
    sum += d
  }
  const out = { x: 0, y: 0, z: 0, heading: 0, stop: 0, dir: 1 }
  if (n < 2 || sum <= 0) {
    spotAt(scene, plan.route[0] ?? plan.home, out)
    return out
  }
  // (as a share of the way round: the way's length changes a little as the bodies move, and the share does not)
  const total = sum * 2
  let u0 = (t / plan.period + plan.phase) % 1
  if (u0 < 0) u0 += 1
  let s = u0 * total
  const back = s >= sum
  if (back) s = total - s
  let i = 0
  while (i < legs.length - 1 && s > legs[i]) s -= legs[i++]
  spotAt(scene, plan.route[i], a)
  spotAt(scene, plan.route[i + 1], b)
  const u = legs[i] > 0 ? Math.min(1, s / legs[i]) : 0
  const dx = deltaIn(scene, b.x - a.x)
  const dy = deltaIn(scene, b.y - a.y)
  out.x = a.x + dx * u
  out.y = a.y + dy * u
  out.z = a.z + (b.z - a.z) * u
  out.heading = back ? Math.atan2(-dx, dy) : Math.atan2(dx, -dy)
  out.stop = back ? i : i + 1
  out.dir = back ? -1 : 1
  return out
}

/** where a band keeps to now: its spot, or (a patrol) where its route has it on the clock */
export function anchorOf(scene: SceneState, plan: BandPlan, out: { x: number; y: number; z: number }) {
  if (plan.kind !== 'patrol') return spotAt(scene, plan.home, out)
  const r = routeAt(scene, plan, nowOf(scene))
  out.x = r.x
  out.y = r.y
  out.z = r.z
  return out
}

/** how loaded a ship is, 0..1 (the player's hold; another pilot's as his game says; anyone else none) */
export function loadOf(scene: SceneState, f: Fighter) {
  if (f.kind === LEADER) return fillOf(scene.loop.hold)
  if (f.kind !== SHIP || !f.remote) return 0
  return scene.ships.find((s) => s.jet === f.jet)?.loaded ?? 0
}

/** the moment a band beaten at UTC `t` is back: a turn of its own clock, at least BAND.away later */
export function backAt(zone: string, id: number, t: number) {
  let h = id * 7919
  for (let i = 0; i < zone.length; i++) h = (Math.imul(h, 31) + zone.charCodeAt(i)) | 0
  const phase = (Math.abs(h) % BAND.turn) | 0
  return Math.ceil((t + BAND.away - phase) / BAND.turn) * BAND.turn + phase
}

/** a raider band of a wildness, as its numbers say */
function raiders(id: number, wild: number, home: Spot, zone: 'surface' | 'space'): BandPlan {
  const r = RAIDERS[Math.max(1, Math.min(3, wild))]
  const z = BAND[zone]
  return {
    id,
    kind: 'raiders',
    faction: '',
    hulls: r.ships,
    level: r.level,
    attackers: r.attackers,
    wild,
    home,
    route: [],
    phase: 0,
    period: 1,
    notice: z.notice,
    noticeLoaded: z.noticeLoaded,
    leash: z.leash,
    leashLoaded: z.leashLoaded,
    wake: z.wake,
    sleep: z.sleep,
    derelict: -1,
    up: false,
    downs: 0,
    mine: 0,
    alerted: false,
    toldAt: -Infinity,
  }
}

/** a side's patrol along a route, out and back in `period` seconds */
function patrol(id: number, side: Side, wild: number, route: Spot[], phase: number, period: number, zone: 'surface' | 'space'): BandPlan {
  const z = BAND[zone]
  return {
    id,
    kind: 'patrol',
    faction: side,
    hulls: PATROL.ships,
    level: PATROL.level,
    attackers: PATROL.attackers,
    wild: Math.max(1, wild),
    home: route[0],
    route,
    phase,
    period,
    notice: z.patrolNotice,
    noticeLoaded: 0,
    leash: z.patrolLeash,
    leashLoaded: 0,
    wake: z.wake,
    sleep: z.sleep,
    derelict: -1,
    up: false,
    downs: 0,
    mine: 0,
    alerted: false,
    toldAt: -Infinity,
  }
}

/**
 * A raider band's spot kept within reach of ground a pilot can come down on (BAND.surface.shore): moved towards the nearest
 * land if it lies further out over deep water, lava or acid (polish step 9: no fight the game stages where a pilot shot down
 * cannot glide to land)
 */
function ashore(scene: SceneState, x: number, y: number) {
  const land = shoreNear(scene.world, x, y, 2048)
  if (!land || land.d <= BAND.surface.shore) return { x, y }
  const k = (land.d - BAND.surface.shore) / land.d
  return { x: x + (land.x - x) * k, y: y + (land.y - y) * k }
}

/** what lives on the world the scene is over */
function planSurface(scene: SceneState, world: string, holders: Record<string, string>, day: number): BandPlan[] {
  const w = surfaceById(world)
  if (!w) return []
  const out: BandPlan[] = []
  const reach = reachOf(holders)
  const wild = wildness(w.system, reach)
  const f = scene.world.features
  const W = scene.world
  if (wild > 0) {
    const hot = isHotspot(world, day)
    // raiders at the rich ore, waiting on the way to the nearest base (where a loaded ship will pass)
    const rich = f.outcrops.filter((o) => o.rich)
    const count = !w.habitable ? 1 : hot ? rich.length : Math.min(rich.length, wild)
    for (let k = 0; k < count; k++) {
      const o = rich[k]
      let best = Infinity
      let bx = 0
      let by = 0
      for (const base of f.bases) {
        const dx = deltaIn(scene, base.x - o.x)
        const dy = deltaIn(scene, base.y - o.y)
        const d = Math.hypot(dx, dy)
        if (d < best) {
          best = d
          bx = dx / (d || 1)
          by = dy / (d || 1)
        }
      }
      // (out of the bases' turrets' reach, or they would be shot down where they wait)
      const off = Math.max(0, Math.min(BAND.surface.offset, best - BAND.surface.clear))
      let x = o.x + bx * off
      let y = o.y + by * off
      // (and off to one side of the way between the bases, where the patrols fly: they keep out of a patrol's way)
      if (f.bases.length >= 2) {
        const pa = f.bases[0]
        const ux = deltaIn(scene, f.bases[1].x - pa.x)
        const uy = deltaIn(scene, f.bases[1].y - pa.y)
        const len = Math.hypot(ux, uy) || 1
        const rx = deltaIn(scene, x - pa.x)
        const ry = deltaIn(scene, y - pa.y)
        const along = Math.max(0, Math.min(len, (rx * ux + ry * uy) / len))
        const cx = rx - (ux / len) * along
        const cy = ry - (uy / len) * along
        const apart = Math.hypot(cx, cy)
        if (apart < BAND.surface.route) {
          // (pushed straight out from the way; on it, to the side the deposit's number says)
          const nx = apart > 1 ? cx / apart : (k % 2 ? 1 : -1) * (-uy / len)
          const ny = apart > 1 ? cy / apart : (k % 2 ? 1 : -1) * (ux / len)
          x += nx * (BAND.surface.route - apart)
          y += ny * (BAND.surface.route - apart)
        }
      }
      ;({ x, y } = ashore(scene, x, y))
      const z = groundAt(W, x, y) + BAND.surface.lurk
      // (a barren moon off the beaten way is held by a band a little stronger than its system's; a hotspot draws stronger pirates)
      const strength = Math.min(3, wild + (!w.habitable || hot ? 1 : 0))
      out.push(raiders(!w.habitable ? ID_MOON : ID_DEPOSIT + k, strength, { body: -1, x, y, z }, 'surface'))
    }
  }
  // raiders watching the way in to an outpost, just out of its guns' reach, off to the side away from the other base
  // (and the patrols' way between them): they let an empty ship by, and come for a loaded one on its way home
  if (wild > 0 && w.habitable) {
    const bases = f.bases.slice(0, wild >= 2 ? 2 : 1)
    bases.forEach((base, k) => {
      const other = f.bases[k === 0 ? 1 : 0]
      let ux = other ? -deltaIn(scene, other.x - base.x) : 1
      let uy = other ? -deltaIn(scene, other.y - base.y) : 0
      const len = Math.hypot(ux, uy) || 1
      ux /= len
      uy /= len
      const turn = (k % 2 ? 1 : -1) * BAND.surface.approachTurn
      const { x, y } = ashore(
        scene,
        base.x + (ux * Math.cos(turn) - uy * Math.sin(turn)) * BAND.surface.approach,
        base.y + (ux * Math.sin(turn) + uy * Math.cos(turn)) * BAND.surface.approach,
      )
      const plan = raiders(ID_APPROACH + k, wild, { body: -1, x, y, z: groundAt(W, x, y) + BAND.surface.lurk }, 'surface')
      plan.notice = BAND.surface.approachNotice
      plan.noticeLoaded = BAND.surface.approachLoaded
      out.push(plan)
    })
  }
  // patrols between the world's bases, out and back (both sides' on the front line, meeting half-way)
  if (w.habitable && f.bases.length >= 2) {
    const [p, q] = f.bases
    const pa = p.pads[0] ?? { x: p.x, y: p.y }
    const qa = q.pads[0] ?? { x: q.x, y: q.y }
    // (high enough to clear the ground between them)
    let top = 0
    for (let i = 0; i <= 16; i++) {
      const u = i / 16
      top = Math.max(top, groundAt(W, pa.x + deltaIn(scene, qa.x - pa.x) * u, pa.y + deltaIn(scene, qa.y - pa.y) * u))
    }
    const z = top + BAND.surface.patrolHeight
    const route: Spot[] = [
      { body: -1, x: pa.x, y: pa.y, z },
      { body: -1, x: pa.x + deltaIn(scene, qa.x - pa.x), y: pa.y + deltaIn(scene, qa.y - pa.y), z },
    ]
    const period = Math.round((2 * Math.hypot(route[1].x - route[0].x, route[1].y - route[0].y)) / patrolPace(scene))
    for (const s of patrolsIn(w.system, reach)) {
      const n = s === 'nomarchy' ? 0 : 1
      out.push(patrol(ID_PATROL + n, s, wild, route, n * 0.5, period, 'surface'))
    }
  }
  return out
}

/** what lives in the space of the system the scene is in */
function planSpace(scene: SceneState, system: number, holders: Record<string, string>): BandPlan[] {
  const g = theGalaxy()
  const sys = g.systems[system]
  if (!sys) return []
  const out: BandPlan[] = []
  const reach = reachOf(holders)
  const wild = wildness(system, reach)
  const bodies = sys.bodies.map((i) => g.bodies[i])
  // raiders where they wait (galaxy/danger.ts spaceBands)
  for (const w of spaceBands(system, holders)) {
    const body = g.bodies[w.body]
    if (w.kind === 'gate') {
      // (off to one side of the way in, as the gate's number says)
      const across = (hash8(body.index * 31 + 7) & 1 ? 1 : -1) * BAND.space.gate * 0.7
      out.push(raiders(ID_GATE + body.index, w.wild, { body: body.index, x: -BAND.space.gate, y: across, z: SPACE_Z }, 'space'))
    } else if (w.kind === 'belt') {
      // (among the rocks, at a place round the ring its number says)
      const ang = (hash8(body.index * 13 + 5) / 256) * Math.PI * 2
      const r = body.orbit.radius
      out.push(raiders(ID_BELT + body.index, w.wild, { body: -1, x: Math.cos(ang) * r, y: Math.sin(ang) * r, z: SPACE_Z }, 'space'))
    } else if (w.kind === 'derelict') {
      // a derelict's drones, out of the wreck when a pilot comes near; its salvage strewn about it
      const d = raiders(ID_DERELICT + body.index, w.wild, { body: body.index, x: 0, y: 0, z: SPACE_Z }, 'space')
      d.kind = 'drones'
      d.hulls = Array.from({ length: DRONES.count }, () => DRONES.hull)
      d.level = DRONES.level[w.wild] ?? DRONES.level[1]
      d.attackers = DRONES.attackers
      d.wake = DERELICT.guard
      d.derelict = body.index
      out.push(d)
    } else {
      // the shortcut's way in: a fast way across, and a dangerous one
      out.push(raiders(ID_HOLE + body.index, w.wild, { body: body.index, x: -body.size * 3, y: 0, z: SPACE_Z }, 'space'))
    }
  }
  // patrols: round the side's stations, the system's habitable worlds and its gates, in order round the middle, out and back
  const stops = bodies
    .filter((q) => (q.kind === 'base' && q.role !== 'derelict') || (q.world >= 0 && g.worlds[q.world].habitable) || q.kind === 'gate')
    .sort((p, q) => Math.atan2(p.y, p.x) - Math.atan2(q.y, q.x))
  if (stops.length >= 2) {
    const route = stops.map((q): Spot => ({ body: q.index, x: q.kind === 'gate' ? -260 : q.size * 1.6, y: 0, z: SPACE_Z }))
    // (its period from where the bodies were at the clock's zero: the same in every game, whenever it is worked out)
    let sum = 0
    for (let i = 0; i + 1 < stops.length; i++) sum += Math.hypot(stops[i + 1].x - stops[i].x, stops[i + 1].y - stops[i].y)
    const period = Math.round((2 * sum) / patrolPace(scene))
    for (const s of patrolsIn(system, reach)) {
      const n = s === 'nomarchy' ? 0 : 1
      // (two a side, half-way round from each other)
      out.push(patrol(ID_PATROL + n * 10, s, wild, route, n * 0.25, period, 'space'))
      out.push(patrol(ID_PATROL + n * 10 + 1, s, wild, route, n * 0.25 + 0.5, period, 'space'))
    }
  }
  return out
}

/** the holders the scene knows (the page's word), or none: only the home worlds held */
const holdersOf = (scene: SceneState) => (scene.traces.known ? scene.traces.holders : {})

/** what the plans for the zone are made from, as a key: the same key, the same plans */
function planKey(scene: SceneState) {
  if (!peopled(scene)) return ''
  const holders = holdersOf(scene)
  const reach = reachOf(holders)
  const system = scene.zone.kind === 'space' ? systemOfKey(scene.worldKey) : (surfaceById(scene.worldKey)?.system ?? -1)
  if (system < 0) return ''
  const day = dayOfSeconds(nowOf(scene))
  const hot = scene.zone.kind === 'surface' && isHotspot(scene.worldKey, day)
  return `${scene.worldKey}|${scene.params.side}|${wildness(system, reach)}|${patrolsIn(system, reach).join('+')}|${hot ? day : ''}`
}

/** the plans made afresh: every band's ship this game flies is taken down, to come up again as the new plans say */
function replan(scene: SceneState, key: string) {
  const bands = scene.bands
  for (const p of bands.plans) putDown(scene, p)
  bands.key = key
  bands.plans = []
  if (!key) return
  const holders = holdersOf(scene)
  if (scene.zone.kind === 'space') bands.plans = planSpace(scene, systemOfKey(scene.worldKey), holders)
  else bands.plans = planSurface(scene, scene.worldKey, holders, dayOfSeconds(nowOf(scene)))
}

/** where the pilots are that bands wake for: the player (in his ship or out of it) and the other players here */
function pilotsHere(scene: SceneState) {
  const lead = focus(scene)
  const list = [{ x: lead.x, y: lead.y }]
  for (const s of scene.ships) {
    const f = s.jet.fighter
    if (f && f.alive && f.remote && f.band < 0 && !s.parked && !s.out) list.push({ x: s.jet.x, y: s.jet.y })
  }
  for (const w of scene.walkers) if (w.stage === WALKING) list.push({ x: w.jet.x, y: w.jet.y })
  return list
}

/** the nearest pilot to a point, px */
function nearestPilot(scene: SceneState, pilots: { x: number; y: number }[], x: number, y: number) {
  let best = Infinity
  for (const p of pilots) best = Math.min(best, Math.hypot(deltaIn(scene, p.x - x), deltaIn(scene, p.y - y)))
  return best
}

/** the band's ships in the scene (this game's and another's), alive */
const membersOf = (scene: SceneState, plan: BandPlan) => scene.ships.filter((s) => s.band === plan.id && s.jet.fighter?.alive)

/** a band's ships come out: at its spot, or where its route has it now */
function putUp(scene: SceneState, plan: BandPlan) {
  const p = scene.params
  const space = scene.zone.kind === 'space'
  let x: number
  let y: number
  let z: number
  let heading: number
  let stop = 0
  let dir = 1
  if (plan.kind === 'patrol') {
    const r = routeAt(scene, plan, nowOf(scene))
    x = r.x
    y = r.y
    z = r.z
    heading = r.heading
    stop = r.stop
    dir = r.dir
  } else {
    spotAt(scene, plan.home, a)
    x = a.x
    y = a.y
    z = a.z
    heading = (hash8(plan.id * 17) / 256) * Math.PI * 2
  }
  const side = sideOfBand(scene, plan)
  const paint = plan.kind === 'patrol' ? BAND_PAINT[plan.faction as Side] : ENEMY_PAINT
  const mark = plan.kind === 'patrol' ? (plan.faction === 'nomarchy' ? 1 : 2) : 0
  plan.hulls.forEach((hull, i) => {
    // a loose arrowhead, spread across and back
    const row = Math.ceil(i / 2)
    const across = (i % 2 === 0 ? 1 : -1) * row * 42
    const back = row * 36
    const sx = x + Math.cos(heading) * across - Math.sin(heading) * back
    const sy = y + Math.sin(heading) * across + Math.cos(heading) * back
    const id = scene.nextShip++
    const sz = space ? SPACE_Z : Math.max(z, groundAt(scene.world, sx, sy) + 18)
    const ship = createShip(scene, id, {
      x: sx,
      y: sy,
      height: sz,
      heading,
      hull,
      speed: p.speed,
      paint,
      side,
      band: plan.id,
      pilot: 1,
      mark,
      markColor: mark ? SIDE_COLOURS[plan.faction as Side] : undefined,
    })
    const brain = ship.jet.fighter?.brain
    if (brain) {
      brain.leg = stop
      brain.legDir = dir
      brain.side = i % 2 === 0 ? 1 : -1
    }
    scene.ships.push(ship)
  })
  plan.up = true
  plan.downs = 0
  plan.alerted = false
  // a derelict's salvage lies about it, in crates any pilot may take (strewn again once it has been beaten and is back)
  if (plan.derelict >= 0) strew(scene, plan)
}

/** a derelict's salvage, strewn about it as its drones come out (no more than once while they stay beaten) */
function strew(scene: SceneState, plan: BandPlan) {
  const key = plan.derelict
  const now = nowOf(scene)
  const last = scene.bands.strewn.get(key)
  if (last !== undefined && now - last < BAND.away) return
  scene.bands.strewn.set(key, now)
  spotAt(scene, plan.home, a)
  const body = theGalaxy().bodies[key]
  for (let k = 0; k < DERELICT.salvage; k++) {
    const ang = (hash8(key * 13 + k * 5) / 255) * Math.PI * 2
    const r = body.size * (1.1 + (hash8(key * 17 + k) / 255) * 1.4)
    const n = DERELICT.salvageUnits[0] + (hash8(key * 3 + k * 11) % (DERELICT.salvageUnits[1] - DERELICT.salvageUnits[0] + 1))
    spill(scene, a.x + Math.cos(ang) * r, a.y + Math.sin(ang) * r, SPACE_Z, [{ id: 'salvage', n }], false)
  }
}

/** a band's ships this game flies go back where they came from (no one is near to see) */
function putDown(scene: SceneState, plan: BandPlan) {
  for (let i = scene.ships.length - 1; i >= 0; i--) {
    const s = scene.ships[i]
    const f = s.jet.fighter
    if (s.band !== plan.id || (f && f.remote)) continue
    if (f) f.alive = false
    scene.ships.splice(i, 1)
  }
  plan.up = false
  plan.alerted = false
}

/** a ship of a band was shot down, here, by this game's word */
export function bandShipDown(scene: SceneState, f: Fighter, byPlayer = false) {
  const plan = bandOf(scene, f.band)
  if (plan && !f.remote) plan.downs++
  if (plan && byPlayer) plan.mine++
}

/** the bands beaten in this zone that are not back yet, for a shared room's host to pass on */
export function clearedHere(scene: SceneState) {
  const out: { band: number; until: number }[] = []
  const prefix = scene.worldKey + ':'
  const now = nowOf(scene)
  for (const [k, until] of scene.bands.cleared)
    if (k.startsWith(prefix) && until > now) out.push({ band: Number(k.slice(prefix.length)), until })
  return out
}

/** the host's word on which bands here are beaten, and until when */
export function setCleared(scene: SceneState, list: { band: number; until: number }[]) {
  for (const c of list) {
    const k = `${scene.worldKey}:${c.band}`
    scene.bands.cleared.set(k, Math.max(scene.bands.cleared.get(k) ?? 0, c.until))
  }
}

/** true while a band is beaten and not yet back */
export function beaten(scene: SceneState, plan: BandPlan) {
  const k = `${scene.worldKey}:${plan.id}`
  const until = scene.bands.cleared.get(k)
  if (until === undefined) return false
  if (nowOf(scene) >= until) {
    scene.bands.cleared.delete(k)
    return false
  }
  return true
}

/** the news when a band comes for the player */
function alert(scene: SceneState, plan: BandPlan) {
  plan.alerted = true
  if (scene.time - plan.toldAt < BAND.toldAgain) return
  plan.toldAt = scene.time
  const j = focus(scene)
  if (plan.kind === 'patrol') news(scene, 'PATROL', plan.faction === 'anarchoi' ? 'THE ANARCHOI' : 'THE NOMARCHY', false)
  else news(scene, plan.kind === 'drones' ? 'DRONES' : 'AMBUSH', plan.kind === 'drones' ? 'GUARDING THE WRECK' : 'RAIDERS', false)
  sound(scene, 'wave', j.x, j.y, j.z, 0.7, true)
}

/** the player as the bands see him: his ship, or him on foot */
function playerFighters(scene: SceneState) {
  return [scene.jets[0]?.fighter, scene.foot.walker.fighter]
}

/** one step: the plans kept up to date, bands woken and put to sleep, beaten ones counted */
export function stepBands(scene: SceneState, dt: number) {
  const bands = scene.bands
  bands.look -= dt
  // (looked at again at once in another zone or on another side, and every second for a change of who holds what)
  const zone = peopled(scene) ? `${scene.worldKey}|${scene.params.side}` : ''
  if (zone !== bands.zone || bands.look <= 0) {
    bands.zone = zone
    bands.look = 1
    const key = zone ? planKey(scene) : ''
    if (key !== bands.key) replan(scene, key)
  }
  if (!bands.plans.length) return
  const host = scene.room.host
  const pilots = pilotsHere(scene)
  const me = playerFighters(scene)
  const lead = focus(scene)
  for (const plan of bands.plans) {
    const members = membersOf(scene, plan)
    if (!host) {
      // (another game flies them: only seen, and the news when one comes close and is not lying in wait)
      plan.up = members.length > 0
      if (plan.up && !plan.alerted && sideOfBand(scene, plan) !== SIDE_PLAYER) {
        const near = members.some(
          (s) => !s.jet.fighter!.lurk && Math.hypot(deltaIn(scene, s.jet.x - lead.x), deltaIn(scene, s.jet.y - lead.y)) < 360,
        )
        if (near) alert(scene, plan)
      }
      if (!plan.up) plan.alerted = false
      continue
    }
    if (members.length) plan.up = true
    // (two games' copies of one band, met in one room and handed to one of them: it keeps one copy)
    if (members.length > plan.hulls.length) {
      const extra = members
        .filter((m) => !m.jet.fighter!.remote)
        .sort((p, q) => q.id - p.id)
        .slice(0, members.length - plan.hulls.length)
      for (const m of extra) {
        m.jet.fighter!.alive = false
        scene.ships.splice(scene.ships.indexOf(m), 1)
      }
    }
    // every ship of it shot down: beaten, and gone until its clock turns
    if (plan.up && members.length === 0) {
      plan.up = false
      plan.alerted = false
      if (plan.downs > 0) {
        bands.cleared.set(`${scene.worldKey}:${plan.id}`, backAt(scene.worldKey, plan.id, nowOf(scene)))
        if (plan.kind !== 'patrol' && sideOfBand(scene, plan) !== SIDE_PLAYER) {
          const mins = Math.ceil((backAt(scene.worldKey, plan.id, nowOf(scene)) - nowOf(scene)) / 60)
          // (a band he helped beat pays his side's bounty on it: data/bands.ts BAND_BOUNTY)
          const bounty = plan.mine > 0 && looping(scene) ? (BAND_BOUNTY[plan.wild] ?? 0) : 0
          if (bounty > 0)
            record(scene, { kind: 'bounty', credits: bounty, what: plan.kind === 'drones' ? 'derelict cleared' : 'raiders beaten' })
          news(
            scene,
            plan.kind === 'drones' ? 'DERELICT CLEARED' : 'RAIDERS BEATEN',
            bounty > 0 ? `BOUNTY ${bounty} CR · BACK IN ${mins} MIN` : `BACK IN ${mins} MIN`,
          )
        }
      }
      plan.downs = 0
      plan.mine = 0
      continue
    }
    anchorOf(scene, plan, b)
    const near = nearestPilot(scene, pilots, b.x, b.y)
    if (!plan.up) {
      if (near < plan.wake && !beaten(scene, plan)) putUp(scene, plan)
      continue
    }
    // asleep again once no one is near and none of them is fighting (after someone, or turning away, or running)
    const fighting = members.some((s) => {
      const m = s.jet.fighter?.brain?.mode
      return m === ATTACK || m === EVADE || m === EXTEND
    })
    let nearest = near
    for (const s of members) nearest = Math.min(nearest, nearestPilot(scene, pilots, s.jet.x, s.jet.y))
    if (!fighting && nearest > plan.sleep) {
      putDown(scene, plan)
      continue
    }
    // the news, the first time it comes for the player (not his own side's patrol)
    if (sideOfBand(scene, plan) !== SIDE_PLAYER) {
      const after = members.some((s) => {
        const t = s.jet.fighter?.brain?.target
        return !!t && me.includes(t)
      })
      // (settled again only once every one of it is back waiting, or on its way back, or on its route)
      const settled = members.every((s) => {
        const m = s.jet.fighter?.brain?.mode
        return m === LURK || m === PATROLLING || m === RETURN
      })
      if (after && !plan.alerted) alert(scene, plan)
      else if (settled && plan.alerted) plan.alerted = false
    }
  }
}

/** how dangerous the zone is for the player, in a few words and a level 0..3 (null: nobody lives here: no side, or the locals turned off) */
export function dangerHere(scene: SceneState): { level: number; words: string } | null {
  if (!peopled(scene)) return null
  const side = scene.params.side as Side
  const holders = holdersOf(scene)
  const system = systemOfKey(scene.worldKey)
  const d =
    scene.zone.kind === 'space'
      ? systemDanger(system, side, holders)
      : worldDanger(scene.worldKey, side, holders, dayOfSeconds(nowOf(scene)))
  if (d.level === 0) return { level: 0, words: 'SAFE' }
  const what =
    d.home && d.home !== side
      ? 'ENEMY HOME'
      : d.contested
        ? 'THE FRONT'
        : d.patrols.some((p) => p !== side)
          ? 'ENEMY PATROLS'
          : d.hotspot
            ? 'PIRATES'
            : 'RAIDERS'
  return { level: d.level, words: `DANGER ${DANGER_NAMES[d.level].toUpperCase()} · ${what}` }
}
