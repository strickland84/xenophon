// The stations of space (the plan's section 4, "Space base"): a side's capital in its home
// system, a frontier outpost (nobody's) in each frontier system, and the derelicts, wrecked
// stations guarded by drones with salvage strewn about them (the drones are a band: sim/bands.ts). A ship docks at a friendly station
// to bank its hold and to use the base's screen (trade, repair, refit), and a pilot shot down in
// space is given a new ship docked at the nearest one.
//
// A station turns its lit side to its sun (its art is lit from one side), and has arms with a dock
// at the end of each (render/space.ts draws it from the image model's parts). Docking eases the
// ship onto the nearest dock's end, nose in; docked, it rides round with the station; undocking
// backs it out. Landed and docked are the same to the loop: loop.landing says which base, and
// the page's base screen works for both.

import { DOCK, SPACE_Z } from '../data/space'
import { REDELIVERY } from '../data/loop'
import { RESOURCES } from '../data/resources'
import { theGalaxy } from '../galaxy/galaxy'
import type { Body } from '../galaxy/galaxy'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import type { Base } from '../world/features'
import { clamp, wrapAngle } from '../util/math'
import { takeAll, unitsIn } from './cargo'
import { sound } from './effects'
import { EJ_FLY } from './ejection'
import { FLYING, LANDED, LANDING, LIFTING } from './landing'
import { shutDown } from './power'
import { friendly, itemWords, news, record } from './loop'
import { enterSpace, enterSurface } from './travel'
import { startAtBase } from './bases'
import { bodiesOf, orbitTime } from './space'
import type { SpaceBody } from './space'

/** how many arms (each with a dock at its end) a station has, and how far out its docks are, as shares of its size */
export const ARMS = { capital: 4, outpost: 3 }
export const DOCK_OUT = 1.3

/** a station's base, as the loop and the page know bases: its name, whose it is, whether a capital */
const bases = new Map<number, Base>()
export function baseOf(body: Body, system: { side: string | null }): Base {
  let b = bases.get(body.index)
  if (!b) {
    b = {
      id: body.index,
      name: body.name,
      owner: body.role === 'capital' ? (system.side as Base['owner']) : null,
      capital: body.role === 'capital',
      x: 0,
      y: 0,
      pads: [],
      turrets: [],
      mast: { x: 0, y: 0, z: 0 },
    }
    bases.set(body.index, b)
  }
  return b
}

/** which way a station faces: its lit side to its sun (the system's middle), turned so its art's light falls right */
export function stationAngle(b: SpaceBody) {
  return Math.atan2(-b.y, -b.x) + Math.PI * 0.75
}

/** the docks of a station: where the end of each arm is, and which way it points out */
export function docksOf(b: SpaceBody) {
  const n = b.body.role === 'capital' ? ARMS.capital : ARMS.outpost
  const a0 = stationAngle(b)
  const out: { x: number; y: number; a: number }[] = []
  for (let k = 0; k < n; k++) {
    const a = a0 + (k * Math.PI * 2) / n
    out.push({ x: b.x + Math.cos(a) * b.body.size * DOCK_OUT, y: b.y + Math.sin(a) * b.body.size * DOCK_OUT, a })
  }
  return out
}

/** the station's body as it stands now (null: none) */
const stationNow = (scene: SceneState, index: number) => scene.space.bodies.find((b) => b.body.index === index) ?? null

/** whose home the system the scene is in is (null: nobody's) */
export const systemSide = (scene: SceneState) => (scene.space.system >= 0 ? theGalaxy().systems[scene.space.system].side : null)

/** a station of the system as the loop knows bases */
export const stationBase = (scene: SceneState, b: SpaceBody) => baseOf(b.body, { side: systemSide(scene) })

/** true for a station the player may dock at: one that is not a derelict, his side's or nobody's */
export const dockable = (scene: SceneState, b: SpaceBody) =>
  b.body.kind === 'base' && b.body.role !== 'derelict' && friendly(scene, stationBase(scene, b))

/** the system's stations a pilot may dock at */
export const friendlyStations = (scene: SceneState) => scene.space.bodies.filter((b) => dockable(scene, b))

/** begins docking at a station (a body of the system), at its nearest dock */
export function startDocking(scene: SceneState, b: SpaceBody) {
  const L = scene.loop.landing
  const j = scene.jets[0]
  const docks = docksOf(b)
  let best = 0
  let bestD = Infinity
  docks.forEach((d, k) => {
    const dd = Math.hypot(d.x - j.x, d.y - j.y)
    if (dd < bestD) {
      bestD = dd
      best = k
    }
  })
  const dock = scene.space.dock
  dock.station = b.body.index
  dock.port = best
  dock.x0 = j.x - b.x
  dock.y0 = j.y - b.y
  dock.yaw0 = j.yaw
  dock.time = clamp(bestD / 140, 0.8, DOCK.time)
  L.stage = LANDING
  L.t = 0
  L.base = stationBase(scene, b)
  L.held = 0
  L.release = true
  sound(scene, 'brake', j.x, j.y, j.z, 1, true)
}

/** where a ship docked at dock `k` of a station sits, and which way it points (nose in) */
function dockSpot(b: SpaceBody, k: number) {
  const d = docksOf(b)[k % docksOf(b).length]
  return { x: d.x, y: d.y, yaw: Math.atan2(-Math.cos(d.a), Math.sin(d.a)) }
}

/** docking, docked, or undocking: the ship is moved here instead of being flown */
export function moveDocking(scene: SceneState, dt: number, j: Jet) {
  const L = scene.loop.landing
  const dock = scene.space.dock
  const b = stationNow(scene, dock.station)
  if (!b) {
    L.stage = FLYING
    return
  }
  L.t += dt
  const spot = dockSpot(b, dock.port)
  j.z = SPACE_Z
  j.roll += (0 - j.roll) * (1 - Math.exp(-dt * 5))
  j.pitch += (0 - j.pitch) * (1 - Math.exp(-dt * 5))
  j.yawRate = 0
  const ox = j.x
  const oy = j.y
  if (L.stage === LANDING) {
    // eased in along a smooth path from where it was (with the station) to the dock, turning nose in
    const u = clamp(L.t / dock.time, 0, 1)
    const e = u * u * (3 - 2 * u)
    j.x = b.x + dock.x0 + (spot.x - b.x - dock.x0) * e
    j.y = b.y + dock.y0 + (spot.y - b.y - dock.y0) * e
    j.yaw = dock.yaw0 + wrapAngle(spot.yaw - dock.yaw0) * e
    if (u >= 1) docked(scene, j)
  } else if (L.stage === LANDED) {
    j.x = spot.x
    j.y = spot.y
    j.yaw = spot.yaw
  } else if (L.stage === LIFTING) {
    // backing out, then turning away to fly
    const u = clamp(L.t / DOCK.undock, 0, 1)
    const back = 46 * u * u
    j.x = spot.x - Math.sin(spot.yaw) * back
    j.y = spot.y + Math.cos(spot.yaw) * back
    j.yaw = spot.yaw + Math.PI * u * u * (3 - 2 * u)
    if (u >= 1) {
      L.stage = FLYING
      L.base = null
      L.release = true
      scene.flight.speedEase = 0.25
      scene.flight.altGoal = SPACE_Z
      scene.space.launchedAt = scene.time
    }
  }
  j.vx = dt > 0 ? (j.x - ox) / dt : 0
  j.vy = dt > 0 ? (j.y - oy) / dt : 0
}

/** docked: at a friendly station the hold is banked */
function docked(scene: SceneState, j: Jet) {
  const L = scene.loop.landing
  L.stage = LANDED
  L.t = 0
  L.held = 0
  L.release = true
  scene.rig.shake = Math.max(scene.rig.shake, 0.15)
  sound(scene, 'dock', j.x, j.y, j.z, 1, true)
  const base = L.base
  if (!base) return
  if (unitsIn(scene.loop.hold) > 0) {
    const items = takeAll(scene.loop.hold)
    record(scene, { kind: 'bank', items, base: base.name, world: `b${base.id}` })
    news(
      scene,
      'BANKED',
      itemWords(items, (id) => RESOURCES[id as keyof typeof RESOURCES].name.toUpperCase()),
    )
    sound(scene, 'bank', j.x, j.y, j.z, 1, true)
  } else news(scene, base.name.toUpperCase(), 'DOCKED')
}

/** Use held while docked: it undocks */
export function startUndocking(scene: SceneState) {
  const L = scene.loop.landing
  L.stage = LIFTING
  L.t = 0
  L.release = true
  sound(scene, 'lift', scene.jets[0].x, scene.jets[0].y, SPACE_Z, 1, true)
}

/** the scene puts the ship docked at a station: the friendly one nearest the ship (false: there is none in the system) */
export function dockAtNearest(scene: SceneState) {
  const j = scene.jets[0]
  let best: SpaceBody | null = null
  let bestD = Infinity
  for (const b of friendlyStations(scene)) {
    const d = Math.hypot(b.x - j.x, b.y - j.y)
    if (d < bestD) {
      bestD = d
      best = b
    }
  }
  if (!best) return false
  const L = scene.loop.landing
  L.stage = LANDED
  L.t = 99
  L.base = stationBase(scene, best)
  L.held = 0
  L.release = false
  // (set down for him: it waits with its power off, for him to bring it up)
  shutDown(scene)
  scene.space.dock.station = best.body.index
  scene.space.dock.port = 0
  const spot = dockSpot(best, 0)
  j.x = spot.x
  j.y = spot.y
  j.z = SPACE_Z
  j.yaw = spot.yaw
  j.vx = 0
  j.vy = 0
  j.lastTrailX = j.x
  j.lastTrailY = j.y
  j.trailLen = 0
  const { view, rig } = scene
  view.x = rig.follow.x = j.x
  view.y = rig.follow.y = j.y
  view.alt = rig.follow.alt = j.z
  rig.topYaw = -j.yaw * clamp(scene.params.cameraFollow, 0, 1)
  rig.chaseYaw = -j.yaw
  rig.yawDiff = wrapAngle(rig.chaseYaw - rig.topYaw)
  return true
}

/** a pilot of a side starting in space begins docked at a friendly station, if the system has one */
export function dockAtStart(scene: SceneState) {
  if (scene.params.side) dockAtNearest(scene)
}

/** a pilot of a side, shot down in space, is in a new ship docked at the nearest friendly station (or, with none, at a world's base) */
export function respawnInSpace(scene: SceneState) {
  const eject = scene.eject
  const fee = REDELIVERY[scene.mesh.model.name] ?? 0
  if (fee > 0) record(scene, { kind: 'fee', credits: fee, hull: scene.mesh.model.name })
  eject.stage = EJ_FLY
  eject.wreck = null
  const j = scene.jets[0]
  j.away = false
  j.lid = 0
  j.glass = true
  j.x = eject.pilot.x
  j.y = eject.pilot.y
  scene.flight.safeT = 1.4
  if (!dockAtNearest(scene)) {
    // no station of his here: his new ship waits at the nearest station of his a jump or more away (polish step 8: put
    // down at a base of a world of this system, he had to fly out past the same raiders that downed him, and the scripted
    // explorer was shot down twelve times in twenty minutes in the core; the nearest world is kept for a system none leads from)
    const away = stationAway(scene)
    if (away) {
      enterSpace(scene, away.system, away.x, away.y, -Math.PI / 2)
      if (dockAtNearest(scene)) {
        sound(scene, 'pickup', j.x, j.y, j.z, 1, true)
        return
      }
    }
    const near = scene.space.bodies
      .filter((b) => b.body.world >= 0)
      .sort((a, b) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(b.x - j.x, b.y - j.y))[0]
    if (near) {
      enterSurface(scene, theGalaxy().worlds[near.body.world].id, 0.5, 0.5)
      startAtBase(scene)
    } else scene.loop.landing.stage = FLYING
  }
  sound(scene, 'pickup', j.x, j.y, j.z, 1, true)
}

/** the station of his side or nobody's nearest by jumps from the system the scene is in (its system and where it is), or null */
function stationAway(scene: SceneState) {
  const g = theGalaxy()
  const from = scene.space.system
  if (from < 0) return null
  const seen = new Set([from])
  let ring = [from]
  while (ring.length) {
    const next: number[] = []
    for (const s of ring)
      for (const li of g.systems[s].lanes) {
        const l = g.lanes[li]
        const o = l.a === s ? l.b : l.a
        if (seen.has(o)) continue
        seen.add(o)
        next.push(o)
      }
    for (const s of next) {
      const side = g.systems[s].side
      for (const b of g.systems[s].bodies.map((i) => g.bodies[i]))
        if (b.kind === 'base' && b.role !== 'derelict' && friendly(scene, baseOf(b, { side }))) {
          const at = bodiesOf(s, orbitTime(scene)).find((x) => x.body.index === b.index)
          if (at) return { system: s, x: at.x + b.size * 3, y: at.y }
        }
    }
    ring = next
  }
  return null
}

/** docked at a friendly station, a ship is under its guns and its shield: nothing harms it */
export function shelterDocked(scene: SceneState) {
  const f = scene.jets[0].fighter
  if (f && scene.loop.landing.stage === LANDED && scene.loop.landing.base) f.protect = Math.max(f.protect, 0.5)
}
