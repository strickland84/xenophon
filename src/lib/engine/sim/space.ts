// Space (the plan's sections 4 and 6): a star system as a zone, a flat plane about 24,000 px
// across with its sun (or black hole) in the middle. Ships fly it exactly as they fly over a
// world, always moving forward, but level (there is no up or down in space yet). Its bodies
// come from the galaxy's data and move round their orbits on the clock every player shares, so
// every player sees them in the same places.
//
// What this file keeps: the system the scene is in and where its bodies are now, the cruise
// drive, gravity's pull and a sun's heat, and what Use would do where the ship is (descend to a
// world, dock, jump a gate, thread a black hole's ring, skim a giant, mine a rock). The
// transitions between zones are travel.ts; docking and the stations stations.ts; the rocks and
// shards belts.ts. render/space.ts draws it.

import {
  AIR,
  BELOW,
  CRUISE,
  GIANT,
  GRAVITY,
  HOLE,
  ORBIT_SLOW,
  ROUND,
  SPACE_HIGH,
  SPACE_LOW,
  SPACE_Z,
  SUN_HEAT,
  GATE,
  DOCK,
} from '../data/space'
import { positionAt, theGalaxy } from '../galaxy/galaxy'
import type { Body } from '../galaxy/galaxy'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import { ceilingOf } from '../params'
import { harm, ownFighter, shootDown } from './combat'
import { sound } from './effects'
import { flightLimits } from './flight'
import type { FlightLimits } from './flight'
import { nowOf } from './loop'
import type { Rock, Shard } from './belts'

// the cruise drive's stages
export const CRUISE_OFF = 0
export const CRUISE_SPOOL = 1
export const CRUISE_ON = 2

/** a body of the system the scene is in, and where it is now */
export interface SpaceBody {
  body: Body
  /** px from the system's middle, now */
  x: number
  y: number
}

export interface Space {
  /** the system the scene is in (an index into the galaxy's systems; −1 on a surface) */
  system: number
  /** its bodies, where each is now (moved every step from the shared clock) */
  bodies: SpaceBody[]
  /** galaxy seconds now: the shared clock, slowed (ORBIT_SLOW) */
  orbitT: number
  /** times its normal speed the player's ship flies: 1 but for the cruise drive */
  pace: number
  /** the cruise drive: off, spooling, on; scene seconds it was last switched */
  cruise: number
  cruiseAt: number
  /** gravity's drift on the player's ship, px a second */
  driftX: number
  driftY: number
  /** how hard gravity pulls now (px/s²), for the HUD; and the body pulling hardest (an index into bodies, −1 none) */
  pull: number
  puller: number
  /** what Use would do here, for the HUD: '' nothing, 'descend', 'dock', 'undock', 'jump', 'thread', 'skim', 'mine' */
  prompt: string
  /** the body the prompt is about (an index into bodies, −1 none), and seconds Use has been held for it */
  target: number
  held: number
  /** Use is held over a world: the ship's nose goes down at it (sim/spaceflight.ts), for as long as it is held */
  diving: boolean
  /** seconds since the last tick of heat or crushing; and scene seconds the ship was last burned, crushed */
  tick: number
  burnedAt: number
  crushedAt: number
  /** the course plotted, a body of this system (an index into the galaxy's bodies), or −1 */
  course: number
  /** scene seconds the scene arrived in this system (its name is shown) */
  arrivedAt: number
  /** docking (sim/stations.ts): the station (a galaxy index; −1 none) and its dock, where the ship began from (from the station's middle), its heading then, and seconds the way in takes */
  dock: { station: number; port: number; x0: number; y0: number; yaw0: number; time: number }
  /** the rocks round the player this step, the void shards drifting in the system, and which shard was taken in which period (sim/belts.ts) */
  rocks: Rock[]
  shards: Shard[]
  shardTaken: Map<number, number>
  /** scene seconds the ship last struck a rock */
  bumpedAt: number
  /** scene seconds it last left a dock */
  launchedAt: number
  /** gas skimmed: progress to the next unit, and units since the ledger was last told */
  gas: number
  skimmed: number
  /** what others are seen to do as they leave or come (the polish pass, item 5): a ship jumping a gate or arriving through one, going down into a world's air or coming up out of it; scene seconds each began */
  flashes: { x: number; y: number; z: number; t: number; kind: 'jump' | 'arrive' | 'down' | 'up' }[]
}

export function createSpace(): Space {
  return {
    system: -1,
    bodies: [],
    orbitT: 0,
    pace: 1,
    cruise: CRUISE_OFF,
    cruiseAt: -99,
    driftX: 0,
    driftY: 0,
    pull: 0,
    puller: -1,
    prompt: '',
    target: -1,
    held: 0,
    diving: false,
    tick: 0,
    burnedAt: -99,
    crushedAt: -99,
    course: -1,
    arrivedAt: -99,
    dock: { station: -1, port: 0, x0: 0, y0: 0, yaw0: 0, time: 1 },
    rocks: [],
    shards: [],
    shardTaken: new Map(),
    bumpedAt: -99,
    launchedAt: -99,
    gas: 0,
    skimmed: 0,
    flashes: [],
  }
}

/** seconds a flash lasts */
export const FLASH_TIME = 0.9

/**
 * Another pilot's ship leaves this zone (his game has gone elsewhere): if it was in a gate's ring it
 * jumped (a flash there); deep under the plane in space, it went down into a world's air (a burst of
 * fire); high over a world's ceiling, it climbed out (a streak of light). Seen as it was: nothing
 * of it is decided here.
 */
export function shipLeft(scene: SceneState, x: number, y: number, z: number) {
  const fl = scene.space.flashes
  if (scene.zone.kind === 'space') {
    const gate = scene.space.bodies.find((b) => b.body.kind === 'gate' && Math.hypot(b.x - x, b.y - y) < b.body.size * GATE.reach * 1.4)
    if (gate) fl.push({ x: gate.x, y: gate.y, z: SPACE_Z, t: scene.time, kind: 'jump' })
    else if (z < SPACE_LOW - 40) fl.push({ x, y, z, t: scene.time, kind: 'down' })
  } else if (scene.zone.kind === 'surface' && z > ceilingOf(scene.params) + 60) fl.push({ x, y, z, t: scene.time, kind: 'up' })
  while (fl.length > 8) fl.shift()
}

/** another pilot's ship comes into this zone: out of a gate, a flash there */
export function shipCame(scene: SceneState, x: number, y: number) {
  if (scene.zone.kind !== 'space') return
  const gate = scene.space.bodies.find((b) => b.body.kind === 'gate' && Math.hypot(b.x - x, b.y - y) < GATE.out + b.body.size * 2)
  if (gate) scene.space.flashes.push({ x, y, z: SPACE_Z, t: scene.time, kind: 'arrive' })
}

/** true while the scene is in space */
export const inSpace = (scene: SceneState) => scene.zone.kind === 'space'

/** galaxy seconds now, for the orbits: the shared clock, slowed */
export const orbitTime = (scene: SceneState) => nowOf(scene) / ORBIT_SLOW

/** the bodies of a system, as they stand at galaxy time t */
export function bodiesOf(system: number, t: number): SpaceBody[] {
  const g = theGalaxy()
  return g.systems[system].bodies.map((i) => {
    const body = g.bodies[i]
    const at = positionAt(g, body, t)
    return { body, x: at.x, y: at.y }
  })
}

/**
 * How high a body's middle is (data/space.ts BELOW): a world's or a moon's lies under the plane,
 * its top BELOW of its radius beneath where the ships fly; everything else is in the plane.
 */
export const bodyZ = (body: Body) => (body.kind === 'planet' || body.kind === 'moon' ? SPACE_Z - body.size * (1 + BELOW) : SPACE_Z)

/** how far the ship is from the surface of the nearest thing in the system (a body's, a station's, a gate's: not a belt's, which holds it back only among its rocks): the cruise drive's pace follows it */
/** shares of a black hole's size from its middle where the cruise drive slows as at a surface */
const HOLE_SLOW = 1.5

export function nearestThing(scene: SceneState, x: number, y: number) {
  let best = Infinity
  for (const b of scene.space.bodies) {
    const k = b.body.kind
    if (k === 'belt') continue
    // (a black hole's pull and a sun's heat reach far: the drive slows as it nears where they bite, not the body's surface, so
    // a ship cruising at one has time to brake into its ring or short of its heat; polish step 9, when the drive was made
    // quicker in the empty: without it, a ship cruising at a black hole to thread it was carried past the ring)
    const reach = k === 'black hole' ? HOLE_SLOW : k === 'sun' ? SUN_HEAT.reach : 1
    const d = Math.hypot(b.x - x, b.y - y, bodyZ(b.body) - SPACE_Z) - b.body.size * reach
    if (d < best) best = d
  }
  return Math.max(0, best)
}

/** the pace the cruise drive pushes the ship to, this far from the nearest thing: the further out, the faster */
export const cruisePace = (scene: SceneState, near: number) =>
  clamp((near * CRUISE.far) / Math.max(20, scene.params.speed), CRUISE.pace, CRUISE.most) * scene.parts.cruise

/** seconds the cruise drive takes over a distance, roughly: it runs faster the further it is from things, and slows to arrive */
export function cruiseTime(scene: SceneState, d: number) {
  const slow = CRUISE.pace * scene.params.speed
  // (within this of a thing it runs at its least)
  const near = (slow / CRUISE.far) * 1.2
  if (d < near * 2) return d / slow
  return (2 * Math.log(d / (2 * near))) / CRUISE.far + (2 * near) / slow
}

/** moves every body of the system to where it is now */
export function placeBodies(scene: SceneState) {
  const sp = scene.space
  sp.orbitT = orbitTime(scene)
  const g = theGalaxy()
  for (const b of sp.bodies) {
    const at = positionAt(g, b.body, sp.orbitT)
    b.x = at.x
    b.y = at.y
  }
}

/** the body of the system with the galaxy's index `index`, as it stands now (null: not in this system) */
export const spaceBody = (scene: SceneState, index: number) => scene.space.bodies.find((b) => b.body.index === index) ?? null

/** the pull towards a body, px/s², at distance d from its middle: a black hole's only, and none beyond its reach (data/space.ts GRAVITY) */
export function pullOf(body: Body, d: number) {
  if (body.kind !== 'black hole') return 0
  const g = GRAVITY.hole
  if (d > body.size * g.reach) return 0
  const r = Math.max(d, body.size * 0.25)
  // (it fades to nothing at the edge of its reach, so there is no step there)
  const edge = clamp((body.size * g.reach - d) / (body.size * 0.6), 0, 1)
  return Math.min(GRAVITY.most, (g.pull * body.size * body.size) / (r * r)) * edge
}

/** this step's limits in space: anywhere in the band over and under the plane (SPACE_LOW … SPACE_HIGH), with no ground to
 * crash into; it turns less hard while cruising */
export function spaceLimits(scene: SceneState, dt: number, lead: Jet, speed: number): FlightLimits {
  const l = flightLimits(scene, dt, lead, speed)
  const cruising = scene.space.pace > 1.2
  return { ...l, maxRate: cruising ? l.maxRate * CRUISE.turn : l.maxRate, altLo: SPACE_LOW, altHi: SPACE_HIGH, level: true }
}

/** gravity: a black hole's pull adds to the ship's drift; out of its reach the drift dies away */
export function stepGravity(scene: SceneState, dt: number, j: Jet) {
  const sp = scene.space
  let ax = 0
  let ay = 0
  let most = 0
  sp.puller = -1
  sp.bodies.forEach((b, i) => {
    const dx = b.x - j.x
    const dy = b.y - j.y
    const d = Math.hypot(dx, dy)
    const a = pullOf(b.body, d)
    if (a <= 0 || d < 1e-6) return
    ax += (dx / d) * a
    ay += (dy / d) * a
    if (a > most) {
      most = a
      sp.puller = i
    }
  })
  sp.pull = Math.hypot(ax, ay)
  const damp = Math.exp(-dt * GRAVITY.damp)
  sp.driftX = sp.driftX * damp + ax * dt
  sp.driftY = sp.driftY * damp + ay * dt
  j.x += sp.driftX * dt
  j.y += sp.driftY * dt
  j.vx += sp.driftX
  j.vy += sp.driftY
}

/** a sun burns a ship inside its corona; a gas giant's depths crush one; a black hole's middle takes it whole */
export function stepHeat(scene: SceneState, dt: number) {
  const sp = scene.space
  const f = ownFighter(scene)
  if (!f || scene.travel.kind) return
  const j = f.jet
  sp.tick += dt
  for (const b of sp.bodies) {
    const d = Math.hypot(b.x - j.x, b.y - j.y)
    const size = b.body.size
    if (b.body.kind === 'sun' && d < size * SUN_HEAT.reach) {
      if (sp.tick < SUN_HEAT.tick) continue
      const deep = clamp((size * SUN_HEAT.reach - d) / (size * (SUN_HEAT.reach - 1)), 0, 2.5)
      harm(scene, f, SUN_HEAT.damage * deep * sp.tick, null, j.x, j.y, j.z)
      sp.burnedAt = scene.time
      sp.tick = 0
    } else if (b.body.kind === 'giant' && d < size * GIANT.crush) {
      if (sp.tick < GIANT.tick) continue
      const deep = clamp((size * GIANT.crush - d) / (size * 0.2), 0.3, 2)
      harm(scene, f, GIANT.crushDamage * deep * sp.tick, null, j.x, j.y, j.z)
      sp.crushedAt = scene.time
      sp.tick = 0
    } else if (b.body.kind === 'black hole' && d < size * HOLE.horizon) {
      // (past the horizon there is no coming back: no shield, no protection)
      f.protect = 0
      f.shield = 0
      sound(scene, 'explosion', j.x, j.y, j.z, 1, true)
      shootDown(scene, f, null)
      return
    }
  }
  if (sp.tick > 1) sp.tick = 1
}

/** the cruise drive: it spools, pushes the ship to CRUISE.pace times its speed, and drops back */
export function stepCruise(scene: SceneState, dt: number) {
  const sp = scene.space
  const f = ownFighter(scene)
  if (sp.cruise !== CRUISE_OFF) {
    // (it drops out when the ship is struck, when it fires, and when there is no ship; near a
    // station or a gate, at the end of a plotted course, among rocks, and in a strong pull)
    // (a rock knocked against weaving through a belt does not stop it: it is held back there anyway)
    const struck = f && Math.max(f.hullAt, f.shieldAt) > sp.cruiseAt && scene.time - sp.bumpedAt > 0.1
    if (!f || struck || scene.controls.fire || scene.controls.secondary) dropCruise(scene, struck ? 'STRUCK' : '')
    else if (courseDone(scene)) dropCruise(scene, 'ARRIVING')
    else if (sp.pull > CRUISE.pull && sp.cruise === CRUISE_ON && heavy(sp)) {
      dropCruise(scene, 'GRAVITY')
      // (caught in a great pull, it brakes at once: easing down from its pace it had been carried on into the pull's depths)
      sp.pace = Math.min(sp.pace, CRUISE.pace)
    }
  }
  if (sp.cruise === CRUISE_SPOOL && scene.time - sp.cruiseAt > CRUISE.spool * scene.parts.spool) {
    sp.cruise = CRUISE_ON
    sound(scene, 'cruise', 0, 0, 0, 1, true)
  }
  // (among the rocks of a belt the drive throttles back: they come at the ship slowly enough to weave through;
  // elsewhere it runs faster the further it is from anything, and slows as it nears something)
  const j = scene.jets[0]
  const goal = sp.cruise === CRUISE_ON ? (inBelt(scene) ? CRUISE.belt : cruisePace(scene, nearestThing(scene, j.x, j.y))) : 1
  sp.pace += (goal - sp.pace) * (1 - Math.exp(-dt * (goal > sp.pace ? CRUISE.rise : CRUISE.fall)))
  if (Math.abs(sp.pace - goal) < 0.002) sp.pace = goal
}

/** the cruise drive is started (or, if it is on, stopped): from the View button in space */
export function toggleCruise(scene: SceneState) {
  const sp = scene.space
  if (sp.cruise !== CRUISE_OFF) {
    dropCruise(scene, '')
    return
  }
  if (!ownFighter(scene) || scene.travel.kind || sp.prompt === 'undock' || nearStructure(scene)) {
    sound(scene, 'noLock', 0, 0, 0, 1, true)
    return
  }
  sp.cruise = CRUISE_SPOOL
  sp.cruiseAt = scene.time
  sound(scene, 'spool', 0, 0, 0, 1, true)
}

/** the cruise drive stops (`why`: news for the HUD, or nothing) */
export function dropCruise(scene: SceneState, why: string) {
  const sp = scene.space
  if (sp.cruise === CRUISE_OFF) return
  sp.cruise = CRUISE_OFF
  sp.cruiseAt = scene.time
  if (why) scene.loop.news = { text: 'CRUISE', sub: why, t: scene.time, good: false }
}

/** true near the end of the course plotted, while cruising (the drive drops out to arrive) */
function courseDone(scene: SceneState) {
  const sp = scene.space
  if (sp.course < 0) return false
  const b = sp.bodies.find((x) => x.body.index === sp.course)
  if (!b) return false
  const j = scene.jets[0]
  return Math.hypot(b.x - j.x, b.y - j.y) < CRUISE.arrive + b.body.size
}

/** where to steer for the course plotted, and what it goes round (courseAim fills it) */
export const aim = { x: 0, y: 0, round: null as SpaceBody | null }

/**
 * Where to steer for the course plotted: the body itself, or, while a sun, a giant or a black hole lies across the
 * way to it, a place beside that (on the side the ship is already passing), clear of its heat and its pull. Null: no course.
 */
export function courseAim(scene: SceneState) {
  const sp = scene.space
  const b = sp.course >= 0 ? sp.bodies.find((x) => x.body.index === sp.course) : null
  if (!b) return null
  const j = scene.jets[0]
  aim.x = b.x
  aim.y = b.y
  aim.round = null
  const dx = b.x - j.x
  const dy = b.y - j.y
  const L2 = dx * dx + dy * dy
  if (L2 < 1) return aim
  const L = Math.sqrt(L2)
  let nearest = Infinity
  for (const o of sp.bodies) {
    const k = o.body.kind
    const clear = k === 'sun' ? ROUND.sun : k === 'giant' ? ROUND.giant : k === 'black hole' ? ROUND.hole : 0
    if (!clear || o === b) continue
    const r = o.body.size * clear
    // (the nearest point of the way to its middle: only one across the way, between the ship and the course's end, counts)
    const t = ((o.x - j.x) * dx + (o.y - j.y) * dy) / L2
    if (t <= 0 || t >= 1 || t * L >= nearest) continue
    const cx = j.x + dx * t - o.x
    const cy = j.y + dy * t - o.y
    const c = Math.hypot(cx, cy)
    if (c >= r) continue
    nearest = t * L
    const nx = c > 1 ? cx / c : -dy / L
    const ny = c > 1 ? cy / c : dx / L
    aim.x = o.x + nx * r * 1.1
    aim.y = o.y + ny * r * 1.1
    aim.round = o
  }
  return aim
}

/** the pull on the ship is a black hole's (nothing else pulls) */
function heavy(sp: Space) {
  return sp.puller >= 0 && sp.bodies[sp.puller].body.kind === 'black hole'
}

/** the ship is among the rocks of a belt */
function inBelt(scene: SceneState) {
  const j = scene.jets[0]
  const d = Math.hypot(j.x, j.y)
  return scene.space.bodies.some((b) => b.body.kind === 'belt' && Math.abs(d - b.body.orbit.radius) < b.body.size * 0.5 + 60)
}

/** true while the cruise drive is pushing (or spooling): the guns are held */
export const cruising = (scene: SceneState) => scene.space.cruise !== CRUISE_OFF

/** within CRUISE.near of a station or a gate (where the drive will not start, and drops out) */
export function nearStructure(scene: SceneState) {
  const j = scene.jets[0]
  return scene.space.bodies.some(
    (b) => (b.body.kind === 'base' || b.body.kind === 'gate') && Math.hypot(b.x - j.x, b.y - j.y) < CRUISE.near + b.body.size,
  )
}

/** the world or moon (one with a surface to go down to) whose disc the ship is over, well inside its edge; or null */
export function worldUnder(scene: SceneState, j: Jet): SpaceBody | null {
  for (const b of scene.space.bodies) {
    const k = b.body.kind
    if ((k === 'planet' || k === 'moon') && b.body.world >= 0 && Math.hypot(b.x - j.x, b.y - j.y) < b.body.size * AIR.rim) return b
  }
  return null
}

/** what Use would do where the ship is, and which body it is about (left in space.prompt and space.target) */
export function spacePrompt(scene: SceneState, j: Jet) {
  const sp = scene.space
  let best = ''
  let target = -1
  let rank = 99
  sp.bodies.forEach((b, i) => {
    const d = Math.hypot(b.x - j.x, b.y - j.y)
    const size = b.body.size
    let what = ''
    let r = 99
    if (b.body.kind === 'base' && b.body.role !== 'derelict' && d < DOCK.reach + size * 0.4) [what, r] = ['dock', 0]
    else if (b.body.kind === 'gate' && d < size * GATE.reach) [what, r] = ['jump', 1]
    else if (b.body.kind === 'black hole' && Math.abs(d - size * HOLE.ring) < size * HOLE.band && linkedHole(b.body))
      [what, r] = ['thread', 2]
    else if ((b.body.kind === 'planet' || b.body.kind === 'moon') && b.body.world >= 0 && d < size * AIR.rim) [what, r] = ['descend', 3]
    else if (b.body.kind === 'giant' && d < size * GIANT.to && d > size * GIANT.crush) [what, r] = ['skim', 4]
    if (what && r < rank) {
      rank = r
      best = what
      target = i
    }
  })
  sp.prompt = best
  sp.target = target
}

/** the black hole linked to this one (the other end of the shortcut), or null */
export function linkedHole(body: Body): Body | null {
  const g = theGalaxy()
  const lane = g.lanes.find((l) => l.kind === 'black hole' && (l.a === body.system || l.b === body.system))
  if (!lane) return null
  const other = lane.a === body.system ? lane.b : lane.a
  return g.systems[other].bodies.map((i) => g.bodies[i]).find((b) => b.kind === 'black hole') ?? null
}

/** where a gate leads: the system at the other end of its lane, and the gate there that leads back */
export function gateTo(body: Body): { system: number; gate: Body } | null {
  const g = theGalaxy()
  if (body.lane === undefined) return null
  const lane = g.lanes[body.lane]
  const other = lane.a === body.system ? lane.b : lane.a
  const gate = g.systems[other].bodies.map((i) => g.bodies[i]).find((b) => b.kind === 'gate' && b.lane === body.lane)
  return gate ? { system: other, gate } : null
}
