// Going from one zone to another (the plan's section 6, "Transitions"):
//
//   down   over a world in space, the ship flown down at it (or Use held, which dives): it is in the
//   out    world's air, its globe flattening into the ground under it as it sinks, and comes out at
//          the top of the world's sky, flying. Climbing through the top of a world's sky (or Use
//          held high over its ground, which climbs) it is in the same air, the ground curving into
//          a globe under it, and comes out in space. The air is a place, flown through at the
//          pilot's own pace, both ways, and stayed in if he likes (sim/air.ts; flyAir, below; drawn
//          by render/air.ts). `down` and `out` say which way he is going through it.
//   gate   Use held inside a jump gate: the gate charges round the ship for a few seconds, a
//          flash, and the ship comes out of the gate at the other end of the lane
//   hole   Use held in a black hole's bright ring: the ship is dragged round it and flung out of
//          the linked black hole, in a system far across the galaxy
//
// Each is a little state of its own (scene.travel), stepped in both zones. A gate's and a hole's
// change zone half-way through (`switchAt`), and the rest is the arrival; in a world's air the zone
// changes where the air says (data/space.ts AIR), either way, as often as the pilot crosses it.
// The scene says which world it is about to go down to (Scene.zone), so the page can build it off
// its main thread first.

import { coloursOf } from './outfit'
import { AIR, GATE, HOLE, ORBIT_SLOW, OVERHEAD, SPACE_Z } from '../data/space'
import { surfaceById, theGalaxy, worldSettings } from '../galaxy/galaxy'
import type { Body } from '../galaxy/galaxy'
import { ceilingOf, DEFAULT_PARAMS, withDefaults } from '../params'
import type { SceneState } from '../state'
import { pack } from '../util/color'
import { clamp, wrapAngle } from '../util/math'
import { clearWorld, groundOfRow, rowOfGround } from '../world/world'
import { WORLD } from '../world/lands'
import { keepWindow } from './planet'
import { createEffects, sound } from './effects'
import { flyLeader, resetFlight } from './flight'
import type { FlightLimits } from './flight'
import { syncWingmen } from './formation'
import { createGuns } from './guns'
import { createLanding, FLYING } from './landing'
import { createMining } from './mining'
import { createParticles } from './particles'
import { buildPlanet, repaintWorld } from './planet'
import { createSignals } from './signals'
import { createSkirmish } from './skirmish'
import { bodiesOf, createSpace, CRUISE_OFF, CRUISE_SPOOL, gateTo, linkedHole, orbitTime, placeBodies, spaceBody } from './space'
import type { SpaceBody } from './space'
import { ABOARD, endStolen, SHIP_WITH } from './foot'
import { squareUp } from './spaceflight'
import { FOOT } from '../data/foot'
import { createWeather } from './hazards'
import { makeTurrets } from './bases'
import { repaintShips } from './ships'
import { repaintWalker } from './foot'
import { repaintWalkers } from './walkers'
import { invalidateCockpit } from '../render/cockpit/view'
import { paintShip } from '../render/paint'
import { dockAtStart } from './stations'
import { ownFighter } from './combat'
import { INTRO_TIME } from './flight'
import { airHeight, airShape, FACE, heightOver, normalOfMap, overPlace, rowOf, smooth, times, turned, turnUp } from './air'
import type { Jet } from '../jet/jet'
import { EJ_FLY } from './ejection'

export type TravelKind = '' | 'out' | 'down' | 'gate' | 'hole'

export interface Travel {
  kind: TravelKind
  /** seconds into it */
  t: number
  /** a gate's or a hole's: seconds in at which the scene changes zone, and at which it is over */
  switchAt: number
  end: number
  /** true once the zone has changed (a gate's or a hole's) */
  switched: boolean
  /** where it goes: a world's id (going down or up), or a system (through a gate or a hole) */
  world: string
  system: number
  /** the body it goes from (the gate, the hole, the world: down or up) and the one it comes out of, as galaxy indices */
  from: number
  to: number
  /** in a world's air: how far down through it (0 in the plane over the world's globe, AIR.ground at the top of its sky), and which way the ship was last going (+1 down, −1 up) */
  e: number
  dir: number
  /** climbing out of a world: how the world was turned on for this pilot as he began (scene.spun); it is turned on from there as he rises, to bring the place he left up under him. Null going down. */
  turn0: Float64Array | null
  /** how hard it is climbing (to 1) or sinking (to −1) through the air, eased (asked nothing, it goes on the way it is going: `dir`) */
  rate: number
  /** the cruise drive asked for on the way out: it goes through the rest of the air quickly, and the drive spools up as it comes out */
  cruise: boolean
  /** the world's ceiling, px over its ground: where the ground itself takes over from the globe the air makes of it */
  high: number
  /** going down from space: how far over the plane (under it, less than 0) the ship was as it began, eased away on the way */
  lift: number
  /** the place under the ship on the world's map (0..1 across and down) */
  u: number
  v: number
  /** the colour a gate or a hole passes through, packed */
  fade: number
  /** −1 after an arrival with Use held, until it is let go (it does nothing more till then); else 0 */
  held: number
}

export function createTravel(): Travel {
  return {
    kind: '',
    t: 0,
    switchAt: 0,
    end: 0,
    switched: false,
    world: '',
    system: -1,
    from: -1,
    to: -1,
    e: 0,
    dir: 0,
    lift: 0,
    turn0: null,
    rate: 0,
    cruise: false,
    high: DEFAULT_PARAMS.ceiling,
    u: 0,
    v: 0,
    fade: 0,
    held: 0,
  }
}

/** how far the nose tilts climbing or sinking through a world's air as hard as it can, radians (the most it tilts climbing under the sky: flight.ts) */
const TILT = 0.5

/** true while the ship is on the way down to a world or up out of one */
export const inAir = (scene: SceneState) => scene.travel.kind === 'down' || scene.travel.kind === 'out'

/** Use held high over a world's ground (HOLD [F] SPACE): it climbs, for as long as it is held, as a climb held does */
export function heldUp(scene: SceneState) {
  const ctl = scene.controls
  return (ctl.land || ctl.tap > 0) && scene.loop.landing.prompt === 'space' && scene.travel.held >= 0 && !scene.travel.kind
}

/**
 * Over a world of the galaxy, a pilot of a side climbs out towards space: at the top of its sky, a climb asked for
 * (the keys, a stick, the pointer from behind, or Use held, which climbs) takes the ship on up into the world's air
 * (flyAir), at once. From anywhere well clear of the ground the HUD offers Use for it (HOLD [F] SPACE: for a pilot who
 * would rather hold one button).
 */
export function stepClimbOut(scene: SceneState) {
  const tr = scene.travel
  const L = scene.loop.landing
  const j = scene.jets[0]
  const p = scene.params
  const ctl = scene.controls
  // (Use, held through an arrival, does nothing more until it is let go)
  if (tr.held < 0 && !ctl.land && ctl.tap <= 0) tr.held = 0
  if (
    tr.kind ||
    !p.side ||
    !surfaceById(p.world) ||
    !ownFighter(scene) ||
    L.stage !== FLYING ||
    scene.introT < INTRO_TIME ||
    scene.eject.stage !== EJ_FLY
  )
    return
  if (j.z > AIR.from && !L.prompt) L.prompt = 'space'
  // (at the top of the sky, a climb asked for goes on up)
  if (j.z > ceilingOf(p) - 30 && scene.flight.want > AIR.out) startClimbOut(scene)
}

/** a world's body in the galaxy */
function worldBody(id: string): Body | null {
  const s = surfaceById(id)
  return s ? theGalaxy().bodies[s.body] : null
}

/** where a world stands now, as a body of its system (whichever zone the scene is in) */
function worldNow(scene: SceneState, index: number) {
  const here = spaceBody(scene, index)
  if (here) return here
  const g = theGalaxy()
  return bodiesOf(g.bodies[index].system, orbitTime(scene)).find((b) => b.body.index === index)!
}

/** how large a world below the plane is drawn from overhead: its disc's radius on the frame (render/space.ts) */
export const overheadOf = (b: Body) => (b.kind === 'moon' ? OVERHEAD.moon : OVERHEAD.world)

/** up through the top of the sky of the world the scene is over, into its air (and from there, climbing on, its system's space) */
export function startClimbOut(scene: SceneState) {
  const body = worldBody(scene.params.world)
  if (!body || scene.travel.kind) return
  const j = scene.jets[0]
  const tr = scene.travel
  Object.assign(tr, createTravel(), {
    kind: 'out',
    world: scene.params.world,
    system: body.system,
    from: body.index,
    to: body.index,
    e: AIR.ground,
    dir: -1,
    // (climbing as hard as it was: its nose, and the camera with it, go on as they were)
    rate: clamp(scene.flight.climbTilt / TILT, 0.3, 1),
    high: Math.max(ceilingOf(scene.params), j.z),
  })
  placeOnMap(scene)
  // (the place it leaves may lie round the world's edge or on its far side as the world stands: the world is turned on
  // for this pilot as he rises, only as far as brings that place up to the side that faces the plane)
  tr.turn0 = turnedOn(scene, body)
  sound(scene, 'breakout', 0, 0, 0, 1, true)
}

const IDENT = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

/** how a world has been turned on for this pilot: a turn of its whole globe (scene.spun); none, if he has not climbed out of it */
export const turnedOn = (scene: SceneState, body: Body) => scene.spun[body.index] ?? IDENT

/** the normal of a place on a world's map, in the world's own frame (x towards its sun, z up to the plane), as the world has turned and has been turned on for this pilot */
export function placeNormal(scene: SceneState, body: Body, u: number, v: number) {
  return turned(turnedOn(scene, body), normalOfMap(spinOf(scene, body), u, v))
}

/** down out of space into the air of a world (a body of the system, by its galaxy index), from where the ship is over it */
export function startDescent(scene: SceneState, bodyIndex: number) {
  const b = spaceBody(scene, bodyIndex)
  if (!b || b.body.world < 0 || scene.travel.kind) return
  const j = scene.jets[0]
  // (flown free until now: its attitude said upright, for in a world's air it is flown level and only tilts its nose)
  squareUp(j)
  scene.flight.pitchRate = 0
  scene.flight.idle = 0
  const w = theGalaxy().worlds[b.body.world]
  // (where under the ship it is, on the world's map: render/globe.ts draws the globe from the same map)
  const { u, v } = mapSpot(scene, b, (j.x - b.x) / b.body.size, (j.y - b.y) / b.body.size)
  const tr = scene.travel
  Object.assign(tr, createTravel(), {
    kind: 'down',
    world: w.id,
    system: b.body.system,
    from: b.body.index,
    to: b.body.index,
    e: 0,
    dir: 1,
    rate: -0.3,
    high: ceilingOf(withDefaults(worldSettings(w.id))),
    lift: j.z - SPACE_Z,
    u,
    v,
  })
  scene.space.cruise = CRUISE_OFF
  scene.space.pace = 1
  sound(scene, 'entry', 0, 0, 0, 1, true)
}

/** the place under the ship on the world's map, from where it is over the ground (on the surface side of the way) */
function placeOnMap(scene: SceneState) {
  const tr = scene.travel
  const j = scene.jets[0]
  const R = scene.world.size
  tr.u = (((j.x % R) + R) % R) / R
  tr.v = rowOfGround(scene.world, j.y)
}

/**
 * Flying in a world's air, in either zone. The ship is the pilot's all through it: it turns as ever, over the place on
 * the world's map under it; it goes on through the air the way it is going, and a push the other way (the keys, a stick,
 * the pointer from behind) turns it back. At the top it is out in space, flying; at the bottom, in the top of the
 * world's sky, flying.
 *
 * (Twice before it was something that happened to him: a flight that went on by itself once begun and turned back at a
 * push, then one flown for him from end to end. James, 2026-11-18: "why do we NEED a transition?")
 */
export function flyAir(scene: SceneState, dt: number, lead: Jet, introDone: boolean, speed: number, limits: FlightLimits) {
  const tr = scene.travel
  const ctl = scene.controls
  const w = worldNow(scene, tr.from)
  const b = w.body
  const sp = scene.zone.kind === 'space'
  // (climbing out: the world turned on under it as it rises, the place it left coming up to face the plane; and back
  // as it was if it comes back down)
  if (tr.turn0) {
    const n0 = turned(tr.turn0, normalOfMap(spinOf(scene, b), tr.u, tr.v))
    const off = Math.acos(clamp(n0.z, -1, 1))
    const most = Math.acos(AIR.top)
    const share = off > most ? ((off - most) / off) * (1 - smooth(AIR.turnBy, 1, tr.e / AIR.ground)) : 0
    scene.spun[b.index] = share > 0 ? times(turnUp(n0, share), tr.turn0) : tr.turn0
  }
  const n = placeNormal(scene, b, tr.u, tr.v)
  const shape = airShape(b, tr.v, heightIn(scene, b, n.z), tr.high, overheadOf(b), tr.e, tr.rate)
  const z = airHeight(scene)
  scene.flight.altGoal = z
  // (nothing else is offered in the air: the HUD says which way it is going)
  scene.loop.landing.prompt = ''
  // steered as ever, at its own speed over the ground (a world px of it is k px of space here)
  const nose = lead.pitch
  flyLeader(scene, dt, lead, introDone, speed / shape.k, { ...limits, altLo: z, altHi: z, level: true })
  lead.z = z
  lead.pitch = nose
  const x0 = lead.x
  const y0 = lead.y
  if (sp) {
    // the place under the ship on the map moves as it flies (the map keeps its shapes everywhere: a world px is a world px, any way)
    const along = (speed * dt) / shape.k
    tr.u += (Math.sin(lead.yaw) * along) / WORLD
    tr.u -= Math.floor(tr.u)
    tr.v = clamp(tr.v - (Math.cos(lead.yaw) * along) / WORLD, 0.03, 0.97)
    const at = overPlace(w.x, w.y, b, inPlane(placeNormal(scene, b, tr.u, tr.v), turnOf(scene, w)))
    lead.x = at.x
    lead.y = at.y
    // (how fast it really goes, for the camera to keep up with it)
    if (dt > 0) {
      lead.vx = (lead.x - x0) / dt
      lead.vy = (lead.y - y0) / dt
    }
  } else placeOnMap(scene)
  // on through it the way it is going, as hard as it can, whatever is held or let go (Use held, a climb or a dive the
  // same way, or nothing at all); only a push the other way, past a little, turns it back. Nobody is left hanging in the
  // air: there is nothing to do there (James, 2026-11-19: "I am stuck in the planet orbit for ages")
  const use = ctl.land || ctl.tap > 0
  const coast = tr.dir < 0 ? 1 : -1
  const want = scene.flight.want
  const back = !use && !tr.cruise && Math.abs(want) > AIR.slack && Math.sign(want) !== coast
  const push = back ? (Math.sign(want) * (Math.abs(want) - AIR.slack)) / (1 - AIR.slack) : coast
  tr.rate += (clamp(push, -1, 1) - tr.rate) * (1 - Math.exp(-dt * 4))
  // (the cruise drive asked for on the way out: the rest of the air goes by at its pace)
  const pace = tr.cruise ? AIR.rush : 1
  tr.e = clamp(tr.e - (tr.rate * pace * AIR.ground * dt) / AIR.cross, 0, AIR.ground)
  if (Math.abs(tr.rate) > 0.08) tr.dir = tr.rate > 0 ? -1 : 1
  tr.kind = tr.dir > 0 ? 'down' : 'out'
  // (nose up climbing, down sinking, but level by the air's top, where the camera is space's and looks along the nose: it
  // comes out into space level, and going in from space comes level and then tilts as it goes down; the camera looks down
  // at the world all the way, by `look`)
  scene.flight.climbTilt = TILT * tr.rate * smooth(0, AIR.cam[1], tr.e)
  lead.pitch += (scene.flight.climbTilt - lead.pitch) * (1 - Math.exp(-dt * 3))
  scene.flight.look += (shape.look - scene.flight.look) * (1 - Math.exp(-dt * 2.5))
  // (no wingtip trails in the air: the ground under it is not where its trails were)
  lead.trailLen = 0
  // the air buffets it
  if (shape.fire > 0.2) scene.rig.shake = Math.max(scene.rig.shake, AIR.shake * shape.fire)
}

/**
 * How high over the place under it the ship is where the air begins (in the plane; or, dived in from under the plane,
 * that much lower, as it truly was: the globe is then drawn just where it was as the ship came in)
 */
export function heightIn(scene: SceneState, b: Body, facing: number) {
  return Math.max(60, heightOver(b, Math.max(FACE, facing)) + scene.travel.lift)
}

/** the zone changes where the air says, either way; out of the air's top the ship is in space, out of its bottom in the top of the world's sky */
function stepAir(scene: SceneState) {
  const tr = scene.travel
  const sp = scene.zone.kind === 'space'
  if (sp && tr.e > AIR.switchDown) {
    enterSurface(scene, tr.world, tr.u, tr.v)
    scene.jets[0].z = airHeight(scene)
  } else if (!sp && tr.e < AIR.switchUp) {
    const w = worldNow(scene, tr.from)
    const at = overPlace(w.x, w.y, w.body, inPlane(placeNormal(scene, w.body, tr.u, tr.v), turnOf(scene, w)))
    const yaw = scene.jets[0].yaw
    enterSpace(scene, w.body.system, at.x, at.y, yaw)
    scene.jets[0].z = airHeight(scene)
    scene.space.arrivedAt = scene.time
  }
  // out of it: sinking through its bottom (the top of the world's sky), or climbing through its top (space's plane)
  const below = tr.e >= AIR.ground && tr.rate < 0 && scene.zone.kind === 'surface'
  const above = tr.e <= 0 && tr.rate > 0 && scene.zone.kind === 'space'
  if (below || above) {
    const j = scene.jets[0]
    j.z = airHeight(scene)
    scene.flight.altGoal = j.z
    scene.flight.climbTilt = 0
    const held = scene.controls.land || scene.controls.tap > 0
    // (out into space: it comes level by itself, and a climb still held leans its nose, it does not loop it; the cruise
    // drive asked for on the way spools up now)
    if (above) {
      scene.flight.level = true
      scene.flight.carry = scene.controls.keyClimb !== 0
      scene.flight.pitchRate = 0
      if (tr.cruise && scene.space.cruise === CRUISE_OFF) {
        scene.space.cruise = CRUISE_SPOOL
        scene.space.cruiseAt = scene.time
        sound(scene, 'spool', 0, 0, 0, 1, true)
      }
    }
    Object.assign(tr, createTravel())
    // (Use, held through the arrival, does nothing more until it is let go)
    if (held) {
      tr.held = -1
      scene.loop.landing.release = true
    }
  }
}

/** the ship lost in a world's air (shot down, or its pilot out of it) */
function endAir(scene: SceneState) {
  Object.assign(scene.travel, createTravel())
}

/** begins a jump through a gate (charging; it goes once charged, if Use is still held) */
export function startJump(scene: SceneState, gate: Body) {
  const to = gateTo(gate)
  if (!to || scene.travel.kind) return
  const tr = scene.travel
  Object.assign(tr, createTravel(), {
    kind: 'gate',
    switchAt: GATE.charge + 0.45,
    end: GATE.charge + 1.3,
    system: to.system,
    from: gate.index,
    to: to.gate.index,
    fade: pack(236, 246, 255),
  })
  scene.space.cruise = CRUISE_OFF
  sound(scene, 'charge', 0, 0, 0, 1, true)
}

/** begins the plunge through a black hole's ring, to the linked one */
export function startThread(scene: SceneState, hole: Body) {
  const other = linkedHole(hole)
  if (!other || scene.travel.kind) return
  const tr = scene.travel
  Object.assign(tr, createTravel(), {
    kind: 'hole',
    switchAt: HOLE.thread + 0.5,
    end: HOLE.thread + 1.4,
    system: other.system,
    from: hole.index,
    to: other.index,
    fade: pack(255, 236, 214),
  })
  scene.space.cruise = CRUISE_OFF
  sound(scene, 'charge', 0, 0, 0, 0.6, true)
}

/** how far (0..1) the picture has faded into a gate's or a hole's flash now */
export function fadeOf(scene: SceneState) {
  const tr = scene.travel
  if (tr.kind !== 'gate' && tr.kind !== 'hole') return 0
  if (!tr.switched) return clamp((tr.t - tr.switchAt * 0.65) / (tr.switchAt * 0.35), 0, 1)
  return clamp(1 - (tr.t - tr.switchAt) / (tr.end - tr.switchAt), 0, 1)
}

/** gives the travel up (Use let go while a gate charged, or the ship left the ring) */
export function abandonTravel(scene: SceneState) {
  Object.assign(scene.travel, createTravel())
}

/**
 * Where on a world's map a point over its disc is: (dx, dy) in shares of its radius, from its
 * middle. The disc shows half its map at a time, turning slowly (render/bodies.ts, spinOf).
 */
export function mapSpot(scene: SceneState, w: SpaceBody, dx: number, dy: number) {
  const body = w.body
  const r2 = dx * dx + dy * dy
  const k = r2 < 1 ? 1 : 1 / Math.sqrt(r2)
  // (into the world's own frame, which is turned to its sun)
  const a = turnOf(scene, w)
  const px = (dx * Math.cos(a) + dy * Math.sin(a)) * k * 0.999
  const py = (-dx * Math.sin(a) + dy * Math.cos(a)) * k * 0.999
  const pz = Math.sqrt(Math.max(0, 1 - px * px - py * py))
  // (and back through the turn it has been given for this pilot: Pᵀ)
  const P = turnedOn(scene, body)
  const x = P[0] * px + P[3] * py + P[6] * pz
  const y = P[1] * px + P[4] * py + P[7] * pz
  const z = P[2] * px + P[5] * py + P[8] * pz
  const lon = Math.atan2(x, z)
  const u = (((spinOf(scene, body) + lon / (Math.PI * 2)) % 1) + 1) % 1
  const v = clamp(rowOf(clamp(y, -1, 1)), 0.03, 0.97)
  return { u, v }
}

/** how far round a world (or giant) has turned, as a share of a turn: they turn slowly, on the clock everyone shares (a world's whole globe may have been turned on besides, for this pilot: turnedOn) */
export function spinOf(scene: SceneState, body: Body) {
  const day = 1600 + (body.index % 7) * 300
  return (orbitTime(scene) * ORBIT_SLOW) / day + (body.index % 13) / 13
}

/**
 * Which way a world's own frame is turned in the plane: its x towards its sun, so the sun's side of it is always in day and
 * every place on it turns through day and night (the angle of the way from it to the nearest sun, among `bodies`)
 */
export function sunTurn(bodies: SpaceBody[], w: SpaceBody) {
  let best = Infinity
  let a = 0
  for (const o of bodies) {
    if (o.body.kind !== 'sun' || o === w) continue
    const d = Math.hypot(o.x - w.x, o.y - w.y)
    if (d < best) {
      best = d
      a = Math.atan2(o.y - w.y, o.x - w.x)
    }
  }
  return a
}

/** a world's own frame's turn where the scene is (in space the system's bodies stand ready; on a surface they are worked out) */
export function turnOf(scene: SceneState, w: SpaceBody) {
  return sunTurn(scene.zone.kind === 'space' ? scene.space.bodies : bodiesOf(w.body.system, orbitTime(scene)), w)
}

/** a place on a world's sphere (its normal in the world's own frame) as it lies in the plane's: turned to its sun */
function inPlane(n: { x: number; y: number; z: number }, a: number) {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: n.x * c - n.y * s, y: n.x * s + n.y * c, z: n.z }
}

/** steps a travel under way; a gate's or a hole's changes zone half-way, the way down or up where the air says */
export function stepTravel(scene: SceneState, dt: number) {
  const tr = scene.travel
  if (!tr.kind) return
  tr.t += dt
  if (inAir(scene)) {
    // (lost on the way: shot down, or the pilot out of his ship)
    if (!ownFighter(scene) || scene.eject.stage !== EJ_FLY) endAir(scene)
    else stepAir(scene)
    return
  }
  if (!tr.switched && tr.t >= tr.switchAt) {
    tr.switched = true
    if (tr.kind === 'gate') arriveThroughGate(scene, tr.to)
    else if (tr.kind === 'hole') arriveThroughHole(scene, tr.to)
  }
  if (tr.t >= tr.end) {
    Object.assign(tr, createTravel())
    // (Use, held through the arrival, does nothing more until it is let go)
    tr.held = -1
  }
}

// ── the zones, entered

/** everything the last zone held goes: its ships, shots, smoke and wrecks, its waves, what lay about in it; the hold stays */
function leaveZone(scene: SceneState) {
  const best = Math.max(scene.skirmish.best, scene.skirmish.score)
  for (const s of scene.ships) if (s.jet.fighter) s.jet.fighter.alive = false
  scene.ships.length = 0
  for (const m of scene.missiles) m.on = false
  scene.guns = createGuns()
  scene.effects = createEffects()
  scene.particles = createParticles()
  scene.skirmish = { ...createSkirmish(), best }
  scene.wingReturn.fill(0)
  scene.room.reports.length = 0
  const loop = scene.loop
  loop.chunks.length = 0
  loop.crates.length = 0
  loop.taken.clear()
  loop.landing = createLanding()
  loop.mining = createMining()
  const foot = scene.foot
  if (foot.stolen) endStolen(scene)
  foot.stage = ABOARD
  foot.ship = SHIP_WITH
  foot.walker.fighter.alive = true
  foot.walker.fighter.hull = FOOT.health
  scene.walkers.length = 0
  scene.signals = createSignals()
}

/** the scene's settings become those of the zone it is now in (as the page will also say), and the colours follow */
function settingsFor(scene: SceneState, key: string) {
  const p = Object.assign(scene.params, worldSettings(key))
  p.world = key
  repaintWorld(scene)
  repaintShips(scene)
  repaintWalkers(scene)
  repaintWalker(scene)
  paintShip(scene.paint, scene.mesh.model, coloursOf(p), p.timeOfDay)
  invalidateCockpit(scene)
}

/**
 * The scene goes into a system's space, the ship at (x, y) heading `yaw`, flying. `how` says how
 * it came: through a gate or a hole, up from a world, or (starting there) docked at a station.
 */
export function enterSpace(scene: SceneState, system: number, x: number, y: number, yaw: number) {
  const keep = cameraNow(scene)
  leaveZone(scene)
  const keepCourse = scene.space.system === system ? scene.space.course : -1
  scene.zone.kind = 'space'
  scene.loop.landing.release = true
  scene.space = createSpace()
  const sp = scene.space
  sp.system = system
  sp.course = keepCourse
  sp.bodies = bodiesOf(system, orbitTime(scene))
  sp.arrivedAt = scene.time
  placeBodies(scene)
  // the world under it goes: a flat nothing, so whatever asks about the ground finds none
  clearWorld(scene.world)
  scene.planet = null
  scene.weather = createWeather(null)
  scene.worldKey = `s${system}`
  scene.arrivedAt = -99
  settingsFor(scene, scene.worldKey)
  makeTurrets(scene)
  // the ship, flying level, the camera on it
  const intro = scene.introT
  resetFlight(scene)
  scene.introT = intro
  scene.burn = 1
  const j = scene.jets[0]
  j.x = x
  j.y = y
  j.z = inAir(scene) ? airHeight(scene) : SPACE_Z
  j.yaw = yaw
  j.lastTrailX = x
  j.lastTrailY = y
  scene.flight.altGoal = SPACE_Z
  scene.jets.length = 1
  syncWingmen(scene)
  const { view, rig } = scene
  view.x = rig.follow.x = x
  view.y = rig.follow.y = y
  view.alt = rig.follow.alt = SPACE_Z
  rig.topYaw = -yaw * clamp(scene.params.cameraFollow, 0, 1)
  rig.chaseYaw = -yaw
  rig.yawDiff = wrapAngle(rig.chaseYaw - rig.topYaw)
  // (the view the pilot flies in comes along; on the way up or down, the camera stays just where it was round the ship)
  if (inAir(scene)) keepCamera(scene, keep)
}

/** the scene goes down to a world's surface, the ship flying over (u, v) of its map, heading as it was (high over it, on the way down) */
export function enterSurface(scene: SceneState, id: string, u: number, v: number) {
  const keep = cameraNow(scene)
  leaveZone(scene)
  const yaw = scene.jets[0].yaw
  scene.zone.kind = 'surface'
  scene.loop.landing.release = true
  const course = scene.space.course
  scene.space = createSpace()
  scene.space.course = course
  settingsFor(scene, id)
  buildPlanet(scene)
  makeTurrets(scene)
  const intro = scene.introT
  resetFlight(scene)
  scene.introT = intro
  scene.burn = 1
  // (the map's u across the world's width, v down it: space/maps.ts)
  const x = u * scene.world.size
  const y = groundOfRow(scene.world, v)
  const z = inAir(scene) ? airHeight(scene) : Math.round(ceilingOf(scene.params) * 0.62)
  const j = scene.jets[0]
  j.x = x
  j.y = y
  j.z = z
  j.yaw = yaw
  j.lastTrailX = x
  j.lastTrailY = y
  // (the ground of the place it has come down over, in the scene's hold of it at once: world/lands.ts)
  keepWindow(scene, true)
  scene.flight.altGoal = z
  scene.flight.floor = 0
  scene.jets.length = 1
  syncWingmen(scene)
  const { view, rig } = scene
  view.x = rig.follow.x = x
  view.y = rig.follow.y = y
  view.alt = rig.follow.alt = z
  rig.topYaw = -yaw * clamp(scene.params.cameraFollow, 0, 1)
  rig.chaseYaw = -yaw
  rig.yawDiff = wrapAngle(rig.chaseYaw - rig.topYaw)
  if (inAir(scene)) keepCamera(scene, keep)
  scene.arrivedAt = scene.time
}

/** where the camera is round the ship, to keep across a change of zone on the way up or down */
function cameraNow(scene: SceneState) {
  const { rig } = scene
  const j = scene.jets[0]
  return {
    x: rig.follow.x - j.x,
    y: rig.follow.y - j.y,
    alt: rig.follow.alt - j.z,
    top: rig.topYaw,
    chase: rig.chaseYaw,
    diff: rig.yawDiff,
  }
}
function keepCamera(scene: SceneState, k: ReturnType<typeof cameraNow>) {
  const { rig, view } = scene
  const j = scene.jets[0]
  view.x = rig.follow.x = j.x + k.x
  view.y = rig.follow.y = j.y + k.y
  view.alt = rig.follow.alt = j.z + k.alt
  rig.topYaw = k.top
  rig.chaseYaw = k.chase
  rig.yawDiff = k.diff
}

/** out of the gate at the other end of the lane, heading in towards the system's middle */
function arriveThroughGate(scene: SceneState, gateIndex: number) {
  const g = theGalaxy()
  const gate = g.bodies[gateIndex]
  const d = Math.hypot(gate.x, gate.y) || 1
  const ix = -gate.x / d
  const iy = -gate.y / d
  enterSpace(scene, gate.system, gate.x + ix * GATE.out, gate.y + iy * GATE.out, Math.atan2(ix, -iy))
  sound(scene, 'jump', 0, 0, 0, 1, true)
}

/** flung out of the linked black hole, away from it, past its pull */
function arriveThroughHole(scene: SceneState, holeIndex: number) {
  const g = theGalaxy()
  const hole = g.bodies[holeIndex]
  const at = bodiesOf(hole.system, orbitTime(scene)).find((b) => b.body.index === holeIndex)!
  // (out towards the system's middle, a long way clear of the pull)
  const d = Math.hypot(at.x, at.y) || 1
  const ix = -at.x / d
  const iy = -at.y / d
  const out = hole.size * 3.4
  enterSpace(scene, hole.system, at.x + ix * out, at.y + iy * out, Math.atan2(ix, -iy))
  scene.space.pace = 4
  sound(scene, 'jump', 0, 0, 0, 1, true)
}

/** a scene that begins in a system's space (the `world` setting names one, 's3'): docked at a station there, or near its first world */
export function startInSpace(scene: SceneState, system: number) {
  const g = theGalaxy()
  const first = g.systems[system].worlds.map((w) => g.worlds[w])[0]
  const body = first ? g.bodies[first.body] : g.bodies[g.systems[system].bodies[0]]
  const at = bodiesOf(system, orbitTime(scene)).find((b) => b.body.index === body.index)!
  enterSpace(scene, system, at.x + body.size * 2.2, at.y, -Math.PI / 2)
  scene.space.arrivedAt = scene.time
  dockAtStart(scene)
}
