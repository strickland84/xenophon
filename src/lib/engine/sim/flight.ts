// Flying the leader: thrust, steering from whatever the player is using (or by itself when
// left alone), climbing and diving over the ground, and the full roll.

import { slipOf } from './squad'
import { CRASH_COMMIT, statsOf, THROTTLE } from '../data/hulls'
import { AIR } from '../data/space'
import { axes, jetSize, makeJet, sliceSpread, TRAIL_N } from '../jet/jet'
import type { Jet } from '../jet/jet'
import type { JetMesh } from '../jet/mesh'
import { ceilingOf } from '../params'
import type { SceneParams } from '../params'
import { pr, project } from '../render/view'
import type { SceneState } from '../state'
import { clamp, hash8, wrapAngle } from '../util/math'
import { groundAhead, groundAt } from '../world/world'
import { DEEP, EJ_FLY, startEject } from './ejection'
import { flyingFree } from './pilots'
import { report } from './room'
import { burden } from './cargo'
import { CANNON, THRUSTERS } from '../data/weapons'
import { sound } from './effects'
import { FLYING, LANDED } from './landing'
import { ABOARD } from './foot'
import { powered } from './power'

/** seconds the opening takes: the jet cannot be flown until its slices have landed */
export const INTRO_TIME = 1.9

export interface Flight {
  /** seconds until it next rolls by itself, when left alone */
  autoStunt: number
  /** the height the jet is heading for */
  altGoal: number
  /** how fast it is climbing, px per second (smoothed) */
  climbV: number
  /** the jet's climb angle, which the chase camera leans with */
  climbTilt: number
  /** in space, flown free (spaceflight.ts): how fast the nose is coming up (radians a second), and seconds since the pilot last pitched it */
  pitchRate: number
  idle: number
  /** in space, just out of a world's air: the ship comes level by itself, until its pilot points its nose; and a climb held since before it came out leans the nose and no more, until it is let go */
  level: boolean
  carry: boolean
  /** the lowest the jet may fly right now (the ground ahead plus clearance), smoothed */
  floor: number
  /** seconds a dive has been held against the safe height */
  diveHold: number
  /** seconds after a pick-up during which the jet will not crash again */
  safeT: number
  /** 0..1: a new jet gathers speed again after a pick-up */
  speedEase: number
  /** how hard the player is asking to climb, −1..1 (0: he is not choosing the height) */
  want: number
  /** from behind with the pointer: how far to one side of the ship it points (0 straight ahead … 1), so a dive while
   * turning hard is not taken for one meant (in space, a dive held over a world goes down to it) */
  aside: number
  /** how far the camera looks down beyond its usual, as a slope (tan): at a world below, on the way down to it and over it in space */
  look: number
  /** the pilot's head, swaying with the flying (design pixels; right and down are positive) */
  headX: number
  headY: number
  headVX: number
  headVY: number
}

export function createFlight(p: SceneParams): Flight {
  return {
    autoStunt: 6,
    altGoal: p.altitude,
    climbV: 0,
    climbTilt: 0,
    pitchRate: 0,
    idle: 0,
    level: false,
    carry: false,
    floor: 0,
    diveHold: 0,
    safeT: 0,
    speedEase: 1,
    want: 0,
    aside: 0,
    look: 0,
    headX: 0,
    headY: 0,
    headVX: 0,
    headVY: 0,
  }
}

/** this step's limits: how hard the jet may turn and climb, and how low and how high it may fly */
export interface FlightLimits {
  maxRate: number
  clearance: number
  altLo: number
  altHi: number
  climbMax: number
  /** true while it is flown from behind or from the seat */
  chase: boolean
  /** true where there is no ground (space): it cannot crash, keeps whatever height it was flown to, and nothing under it holds it up */
  level?: boolean
}

/** puts a fresh jet at the start, with the camera on it */
export function resetFlight(scene: SceneState) {
  const { params: p, world, view, rig, flight, eject, particles } = scene
  const yaw = 0.9
  scene.jets = [makeJet(world.spawnX, world.spawnY, p.altitude, yaw)]
  view.x = rig.follow.x = world.spawnX
  view.y = rig.follow.y = world.spawnY
  rig.topYaw = -yaw * p.cameraFollow
  view.alt = rig.follow.alt = p.altitude
  rig.fix = 0
  rig.floor = 0
  flight.floor = 0
  rig.chaseYaw = -yaw
  rig.yawDiff = wrapAngle(rig.chaseYaw - rig.topYaw)
  scene.introT = p.intro ? 0 : 99
  scene.burn = p.intro ? 0 : throttleNow(scene)
  flight.autoStunt = 7
  flight.altGoal = p.altitude
  flight.climbV = 0
  flight.climbTilt = 0
  scene.boost = 0
  eject.stage = EJ_FLY
  eject.wreck = null
  eject.chute.on = false
  eject.boom.on = false
  particles.debris.fill(-1)
  rig.cine = 0
  rig.wide = 0
  rig.shake = 0
  flight.speedEase = 1
  flight.diveHold = 0
}

/**
 * A full roll, for the leader and (a beat later each) the wingmen in formation with him. It is
 * also the dodge: begun as a missile closes in, it shakes the missile off (missiles.ts). After
 * one roll there is a moment's rest before the next.
 */
export function startRoll(scene: SceneState) {
  const { view, rig } = scene
  const lead = scene.jets[0]
  if (lead.stunt >= 0 || (lead.fighter && lead.fighter.rollRest > 0)) return
  const dir = lead.yawRate >= 0 ? 1 : -1
  rig.spin = view.cockpit > 0.5 ? 1 : 0
  scene.jets.forEach((j, i) => {
    if (i > 0 && (j.away || flyingFree(j.fighter))) return
    j.stunt = 0
    j.stuntDir = dir
    j.stuntDelay = i * 0.16
  })
}

/** the throttle, moved by its keys held, a mouse's wheel, or set outright: only while he is
 * aboard his ship (on foot and inside, the same keys walk), and it has its power (sim/power.ts) */
function stepThrottle(scene: SceneState, dt: number) {
  const ctl = scene.controls
  if (scene.foot.stage === ABOARD && scene.zone.kind !== 'interior' && powered(scene)) {
    const was = scene.throttle
    if (ctl.throttleTo >= 0) scene.throttle = ctl.throttleTo
    scene.throttle = clamp(scene.throttle + ctl.keyThrottle * THROTTLE.rate * dt + ctl.throttleBy, 0, 1)
    if (scene.throttle !== was) scene.throttleAt = scene.time
  }
  ctl.throttleBy = 0
  ctl.throttleTo = -1
}

/** how far open the engines are now: the throttle, but full on the way down or up and through a gate or a hole (those
 * flights are the drive's), and opening with the cruise drive as it speeds up (0..1) */
export function throttleNow(scene: SceneState) {
  if (scene.travel.kind) return 1
  return Math.max(scene.throttle, clamp(scene.space.pace - 1, 0, 1))
}

/** the engines: the afterburner lights once the intro is over, burning as hard as the throttle is open, and the thrusters
 * open and close */
export function stepThrust(scene: SceneState, dt: number, introDone: boolean) {
  const { params: p, controls: ctl, flight } = scene
  stepThrottle(scene, dt)
  const open = throttleNow(scene)
  // (landed, the engines idle; on the ground or on the way, the thrusters stay shut)
  const down = scene.loop.landing.stage === LANDED
  const grounded = scene.loop.landing.stage !== FLYING
  scene.burn += ((introDone && !down ? open : 0) - scene.burn) * (1 - Math.exp(-dt * 5))

  // opening the thrusters: longer flames, more speed (and heat, shared with the guns: overheated, both shut)
  const f = scene.jets[0]?.fighter
  const hot = !!f && f.jam > 0
  const boostGoal = introDone && !grounded && !hot ? ctl.boost : 0
  scene.boost += (boostGoal - scene.boost) * (1 - Math.exp(-dt * (boostGoal > scene.boost ? 5 : 2.4)))
  if (scene.boost < 0.0005 && boostGoal === 0) scene.boost = 0
  if (f && boostGoal > 0) {
    f.heat += THRUSTERS.heat * scene.boost * f.heatMul * dt
    if (f.heat >= 1) {
      f.heat = 1
      f.jam = CANNON.jam
      sound(scene, 'overheat', f.jet.x, f.jet.y, f.jet.z, 1, true)
    }
  }
  flight.speedEase += (1 - flight.speedEase) * (1 - Math.exp(-dt * 1.5))
  if (flight.safeT > 0) flight.safeT -= dt
  // (a loaded ship is slower: data/loop.ts)
  const load = burden(scene.loop.hold)
  const full =
    p.speed * statsOf(scene.mesh.model.name).speed * flight.speedEase * load.speed * scene.parts.speed * scene.space.pace * slipOf(scene)
  // (the thrusters open the engines all the way, and beyond: from a standstill too)
  scene.fullSpeed = full
  scene.speed = full * (Math.max(open, scene.boost) + (clamp(p.boost, 1, 4) - 1) * scene.parts.boost * scene.boost)
  scene.spread += (p.spread - scene.spread) * (1 - Math.exp(-dt * 11))
}

export function flightLimits(scene: SceneState, dt: number, lead: Jet, speed: number): FlightLimits {
  const { params: p, world, flight, view } = scene
  // (a loaded ship turns wider and climbs worse)
  const load = burden(scene.loop.hold)
  const maxRate = Math.max(0.1, p.agility * statsOf(scene.mesh.model.name).agility * load.turn * scene.parts.agility)
  // how low and how high it may fly: it skims whatever ground lies ahead, with a little
  // room to spare, so it can get close but never hit anything; the ceiling is a setting
  const clearance = clamp(p.clearance, 2, 60)
  const floorNow = groundAhead(world, lead, speed) + clearance
  if (flight.floor === 0) flight.floor = floorNow
  flight.floor += (floorNow - flight.floor) * (1 - Math.exp(-dt * (floorNow > flight.floor ? 9 : 3)))
  const altLo = flight.floor
  const altHi = Math.max(altLo, p.altitude, ceilingOf(p))
  // (with the throttle low it still climbs and dives: at least as at a share of its cruising speed)
  // (high up the air thins: it climbs and dives faster, so the ceiling, and space over it, is a few seconds away)
  const thin = 1 + AIR.thin * clamp((lead.z - AIR.thinFrom) / Math.max(1, ceilingOf(p) - AIR.thinFrom), 0, 1)
  const climbMax = Math.max(speed, scene.fullSpeed * THROTTLE.climb) * 0.55 * p.climb * load.climb * thin
  const chase = view.chase + view.cockpit > 0.5 // flying from behind or from the seat
  return { maxRate, clearance, altLo, altHi, climbMax, chase }
}

/**
 * Overhead, height is hard to judge and a pointer cannot change it: with an enemy in the
 * sights, the ship eases to its height (unless the player is climbing or diving himself), so
 * that the guns can reach it. From behind and from the seat, height is the player's to fly.
 */
function sightsHeight(scene: SceneState, dt: number) {
  const t = scene.sights.target
  if (t && t.alive) scene.flight.altGoal += (t.jet.z - scene.flight.altGoal) * (1 - Math.exp(-dt * 0.9))
}

/** the camera's look down eases to where it should be (more over a world in space, none elsewhere; the way down and up sets its own) */
export function easeLook(scene: SceneState, dt: number, goal: number) {
  scene.flight.look += (goal - scene.flight.look) * (1 - Math.exp(-dt * 1.5))
  if (Math.abs(scene.flight.look - goal) < 1e-4) scene.flight.look = goal
}

/** one step of the leader's flight, with the pilot aboard */
export function flyLeader(scene: SceneState, dt: number, lead: Jet, introDone: boolean, speed: number, limits: FlightLimits) {
  const { params: p, controls: ctl, flight, view, world } = scene
  const { w: W, h: H } = scene.screen
  const { maxRate, clearance, altLo, altHi, climbMax, chase } = limits
  // where to turn and, from behind, how high to fly
  const crashOn = p.crash && flight.safeT <= 0 && !limits.level
  let commit = false // true while a dive is being pushed past the safe height: it will crash
  let want = 0
  let flown = false // true while the player is choosing the height
  const stick = p.invertY ? -1 : 1 // like a flight stick, down climbs and up dives
  // (a hand resting on a mouse is a hand on the stick, however still; only where a ship with nobody at it flies itself
  // about, `wander`, is a pointer left still a while taken for nobody)
  const steering = p.followPointer && ctl.pointerOn && (!p.wander || ctl.pointerIdle < 5)
  flight.want = 0
  flight.aside = 0
  if (!introDone) {
    want = 0
  } else if (scene.interior.flying) {
    // the pilot up out of his seat (sim/interior.ts): it flies itself, back to the heading it had as he got up and holding
    // it, and the height it was flown to (over a world, never lower than its clearance over the ground ahead), never
    // rolling, never going down
    want = clamp(wrapAngle(scene.interior.heading - lead.yaw) * 2.6, -maxRate, maxRate)
    flown = true
  } else if (ctl.keyMode) {
    want = ctl.keyTurn * maxRate
    flight.want = ctl.keyClimb * stick
    flight.altGoal += ctl.keyClimb * stick * climbMax * dt
    if (!chase && ctl.keyClimb === 0) sightsHeight(scene, dt)
    flown = true
    // held hard down against the safe height for a moment, the dive is meant: let it through
    if (crashOn && ctl.keyClimb * stick < -0.8 && flight.altGoal <= altLo + 0.5) flight.diveHold += dt
    else flight.diveHold = 0
    commit = flight.diveHold > CRASH_COMMIT
  } else if (steering && (chase || project(view, lead.x, lead.y, lead.z))) {
    const vx = ctl.pointerX - pr.x
    const vy = ctl.pointerY - pr.y
    if (chase) {
      // from behind: point left or right of the jet to turn, above or below it to climb or dive
      // (as fast as it is pointed: level holds the height, so the whole sky up to the ceiling can be flown)
      const t = clamp((ctl.pointerX - view.cx) / (W * 0.26), -1, 1)
      if (Math.abs(t) > 0.06) want = t * maxRate
      flight.aside = Math.abs(t)
      const raw =
        ctl.pointerY < view.steerY
          ? (view.steerY - ctl.pointerY) / Math.max(1, view.steerY)
          : -(ctl.pointerY - view.steerY) / Math.max(1, H - view.steerY)
      // (a climb or a dive held on the keys or a stick wins over where the pointer is: the first sortie's
      // "Dive low: hold Q" did nothing from the seat while the mouse steered)
      const up =
        ctl.keyClimb !== 0 ? ctl.keyClimb * stick : clamp((stick * Math.sign(raw) * Math.max(0, Math.abs(raw) - 0.08)) / 0.92, -1, 1)
      flight.want = up
      flight.altGoal += up * climbMax * dt
      // pointed hard down against the safe height for a moment, the dive is meant: let it through
      if (crashOn && up < -0.8 && flight.altGoal <= altLo + 0.5) flight.diveHold += dt
      else flight.diveHold = 0
      commit = flight.diveHold > CRASH_COMMIT
      flown = true
    } else {
      flown = true // overhead: keep the height it was flown to …
      // (… climbing or diving as held meanwhile: the mouse steers while a climb or a dive is held on the keys)
      if (ctl.keyClimb !== 0) {
        flight.want = ctl.keyClimb * stick
        flight.altGoal += ctl.keyClimb * stick * climbMax * dt
      } else sightsHeight(scene, dt) // … or, with an enemy in the sights, ease to its height
      if (vx * vx + vy * vy > 18 * 18) {
        const fx = vx * view.cos + vy * view.sin
        const fy = -vx * view.sin + vy * view.cos
        const err = wrapAngle(Math.atan2(fx, -fy) - lead.yaw)
        want = clamp(err * 2.6, -maxRate, maxRate)
      }
    }
  } else if (ctl.keyClimb !== 0) {
    // a climb or a dive held and nothing steering (Use held high over the ground, which climbs: sim/zone.ts): it holds
    // its course
    flight.want = ctl.keyClimb * stick
    flight.altGoal += ctl.keyClimb * stick * climbMax * dt
    flown = true
  } else if (!p.wander) {
    // nobody flying, a pilot's ship (the page's): it holds its course and its height. (It wandered, and rolled now and
    // then, as a ship on show does: a mouse left still five seconds, and the ship flew itself about)
    flown = true
  } else {
    want =
      maxRate * (0.62 * Math.sin(scene.time * 0.31 + 1.3) + 0.38 * Math.sin(scene.time * 0.73 + 0.4) + 0.22 * Math.sin(scene.time * 0.17))
    want = clamp(want, -maxRate, maxRate)
    if (p.stunts) {
      flight.autoStunt -= dt
      if (flight.autoStunt <= 0) {
        startRoll(scene)
        flight.autoStunt = 9 + (hash8((scene.time * 10) | 0) / 255) * 7
      }
    }
  }
  lead.yawRate += (want - lead.yawRate) * (1 - Math.exp(-dt * 2.6))
  lead.yaw += lead.yawRate * dt
  const bankMax = (p.bank * Math.PI) / 180
  const rollTarget = clamp(lead.yawRate / maxRate, -1, 1) * bankMax
  lead.roll += (rollTarget - lead.roll) * (1 - Math.exp(-dt * 5))
  lead.vx = Math.sin(lead.yaw) * speed
  lead.vy = -Math.cos(lead.yaw) * speed
  lead.x += lead.vx * dt
  lead.y += lead.vy * dt
  // height: left alone it drifts back to cruising; it climbs and dives at a limited rate
  if (!flown && !limits.level) flight.altGoal += (p.altitude - flight.altGoal) * (1 - Math.exp(-dt * 0.9))
  flight.altGoal = clamp(flight.altGoal, commit ? altLo - DEEP : altLo, altHi)
  let dz = (flight.altGoal + Math.sin(scene.time * 0.9) * 1.5 - lead.z) * (1 - Math.exp(-dt * 3))
  dz = clamp(dz, -climbMax * dt, climbMax * dt)
  lead.z += dz
  // last resort: never closer to what is right underneath than most of the clearance
  const hard = groundAt(world, lead.x, lead.y) + clearance * 0.7
  if (!commit && !limits.level && lead.z < hard) lead.z += (hard - lead.z) * (1 - Math.exp(-dt * 22))
  flight.climbV += (dz / Math.max(dt, 1e-4) - flight.climbV) * (1 - Math.exp(-dt * 6))
  // nose up in a climb, down in a dive (the gentle cruise bob does not count)
  const climbing = Math.sign(flight.climbV) * Math.max(0, Math.abs(flight.climbV) - 3)
  flight.climbTilt = clamp((climbing / Math.max(20, speed)) * 1.25, -0.5, 0.5)
  const pitchTarget = Math.abs(lead.yawRate / maxRate) * 0.1 + flight.climbTilt
  lead.pitch += (pitchTarget - lead.pitch) * (1 - Math.exp(-dt * 4))
  // the pilot's head: it leans into a turn, sinks in a climb and under thrust, lifts in a
  // dive, and is never quite still. On a soft spring, so it overshoots a little and settles.
  const hxGoal = clamp(lead.yawRate / maxRate, -1, 1) * 6.4 + Math.sin(scene.time * 0.53) * 0.3
  const hyGoal = clamp(flight.climbTilt / 0.5, -1, 1) * 3.4 + scene.boost * 1.6 + Math.sin(scene.time * 0.71 + 1) * 0.25
  flight.headVX += ((hxGoal - flight.headX) * 64 - flight.headVX * 11) * dt
  flight.headVY += ((hyGoal - flight.headY) * 64 - flight.headVY * 11) * dt
  flight.headX = clamp(flight.headX + flight.headVX * dt, -8, 8)
  flight.headY = clamp(flight.headY + flight.headVY * dt, -5, 5)
  // a dive that was meant: a moment before the jet meets the ground, the pilot is thrown clear
  if (commit) {
    const under = Math.max(
      groundAt(world, lead.x, lead.y),
      groundAt(world, lead.x + lead.vx * 0.2, lead.y + lead.vy * 0.2),
      groundAt(world, lead.x + lead.vx * 0.4, lead.y + lead.vy * 0.4),
    )
    const gap = lead.z - under
    if (gap < 3.4 || gap < Math.max(8, -flight.climbV) * 0.4) {
      // (the ship is lost to the ground, by nobody's hand)
      report(scene, { kind: 'down', target: 0, by: -1 })
      startEject(scene)
    }
  }
}

/**
 * What every jet in the air does, leader or wingman: feel the turn, get on with a roll, and
 * leave wingtip trails. (`lead` is the jet the pilot began this step in.)
 */
export function stepJets(scene: SceneState, dt: number, lead: Jet, maxRate: number) {
  const { params: p, flight } = scene
  for (const j of scene.jets) {
    if (j.away) continue
    const gNow = clamp(Math.abs(lead.yawRate) / maxRate + (j.stunt >= 0 ? 0.7 : 0) + scene.boost * 0.9 + Math.abs(flight.climbTilt), 0, 1)
    j.g += (gNow - j.g) * (1 - Math.exp(-dt * 2.5))
    if (j.stunt >= 0) {
      if (j.stuntDelay > 0) j.stuntDelay -= dt
      else {
        j.stunt += dt / 0.85
        if (j.stunt >= 1) j.stunt = -1
      }
    }
    leaveTrail(j, scene.mesh, jetSize(p), sliceSpread(scene.spread, scene.view.chase + scene.view.cockpit), scene.time)
  }
}

/** where a jet's wingtip (`w`: 0 left, 1 right) is now, as its ship is drawn (`spread`: jet/jet.ts sliceSpread) */
export const tipAt = { x: 0, y: 0, z: 0 }
export function wingtipAt(j: Jet, mesh: JetMesh, w: number, sc: number, spread: number) {
  const ax = axes(j)
  const tip = mesh.tips[w]
  const a = tip.a * sc
  const b = tip.b * sc
  const hy = (tip.y * spread - mesh.model.pivotY) * sc
  tipAt.x = j.x + a * ax.rx + b * ax.fx + hy * ax.ux
  tipAt.y = j.y + a * ax.ry + b * ax.fy + hy * ax.uy
  tipAt.z = j.z + a * ax.rz + b * ax.fz + hy * ax.uz
  return tipAt
}

/** wingtip trails: a new point off each wingtip every few px the jet flies */
export function leaveTrail(j: Jet, mesh: JetMesh, sc: number, spread: number, time: number) {
  const ddx = j.x - j.lastTrailX
  const ddy = j.y - j.lastTrailY
  if (ddx * ddx + ddy * ddy <= 6.25) return
  j.lastTrailX = j.x
  j.lastTrailY = j.y
  for (let w = 0; w < 2; w++) {
    const at = wingtipAt(j, mesh, w, sc, spread)
    const o = j.trailHead * 4
    j.trail[w][o] = at.x
    j.trail[w][o + 1] = at.y
    j.trail[w][o + 2] = at.z
    j.trail[w][o + 3] = time
  }
  j.trailHead = (j.trailHead + 1) % TRAIL_N
  if (j.trailLen < TRAIL_N) j.trailLen++
}
