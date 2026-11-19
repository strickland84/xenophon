// Crash and ejection.
//
// Hold a dive into the ground and, a moment before the jet hits, the pilot is thrown clear:
// his seat rockets him up, a parachute opens, a new jet slides in beneath him, he cuts the
// parachute loose, drops into the cockpit, and the canopy closes over him.
//
// In the loop (a pilot with a side, over a world with bases), there is no new jet: once the
// seat's rocket has done its work he comes down on foot, the way his race does (sim/foot.ts).
//
// This file is what happens; render/ejection.ts is how it is drawn.

import { axes, jetSize, makeJet } from '../jet/jet'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp, hash8 } from '../util/math'
import { groundAt, NM, NSHIFT } from '../world/world'
import { sound } from './effects'
import { addDebris, addSmoke, DEBRIS_F, DEBRIS_N } from './particles'
import { REDELIVERY } from '../data/loop'
import { spillHold } from './crates'
import { FLYING } from './landing'
import { looping, record } from './loop'
import { ABOARD, startFall } from './foot'
import { respawnInSpace } from './stations'

/** seconds a pilot of a side floats in space after ejecting, before he is in a new ship at a station */
const SPACE_FLOAT = 2.2

// the stages of an ejection
export const EJ_FLY = 0 // in the jet, flying
export const EJ_ROCKET = 1 // the seat's rocket is carrying the pilot up
export const EJ_CHUTE = 2 // under the parachute, with a new jet on its way
export const EJ_DROP = 3 // parachute cut loose: dropping into the cockpit
export const EJ_SEAL = 4 // in the seat: the canopy closes
export const DRIFT = 13 // how fast the parachute carries him along, px per second
export const SINK = 15 // how fast he comes down under it
export const LINES = 15 // length of the parachute's lines, in jet pixels
export const HERO = 1.4 // the pilot and his parachute are drawn this much larger than life, so they read
export const DEEP = 30 // how far below the safe height a dive that is meant may aim: into the ground

export interface Ejection {
  /** which stage of an ejection this is (EJ_FLY: none, the pilot is flying) */
  stage: number
  /** seconds since he left the jet, and what that was when the present stage began */
  t: number
  since: number
  /** the heading the jet had */
  heading: number
  /** how fast the new jet flies while it takes him aboard */
  speed: number
  /** `t` at which the new jet is under him */
  meetT: number
  /** where he was, measured from the seat, when he cut the parachute */
  dropX: number
  dropY: number
  dropZ: number
  /** the jet he left, until it meets the ground, and how fast it is falling */
  wreck: Jet | null
  wreckVz: number
  pilot: { x: number; y: number; z: number; vx: number; vy: number; vz: number; swing: number; swingV: number }
  /** stands in for a jet while he has none: the camera follows it */
  ghost: Jet
  /** scratch: where the seat of a jet is in the world (see seatOf) */
  seat: { x: number; y: number; z: number }
  /** the parachute: `open` is how far it has filled, `free` is true once it has been cut loose */
  chute: { on: boolean; open: number; free: boolean; t: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
  /** the explosion: `wet` where the jet went into the sea, `puff` counts down to its next puff of smoke */
  boom: { on: boolean; wet: boolean; t: number; x: number; y: number; z: number; puff: number }
  /** this ejection ends on foot (in the loop), not in a new jet */
  foot: boolean
}

export function createEjection(): Ejection {
  return {
    stage: EJ_FLY,
    t: 0,
    since: 0,
    heading: 0,
    speed: 0,
    meetT: 0,
    dropX: 0,
    dropY: 0,
    dropZ: 0,
    wreck: null,
    wreckVz: 0,
    pilot: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, swing: 0, swingV: 0 },
    ghost: makeJet(0, 0, 0, 0),
    seat: { x: 0, y: 0, z: 0 },
    chute: { on: false, open: 0, free: false, t: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
    boom: { on: false, wet: false, t: 0, x: 0, y: 0, z: 0, puff: 0 },
    foot: false,
  }
}

/** what the camera follows: the jet, or the pilot while he is out of one (on the seat's rocket, under his parachute, or on foot) */
export const focus = (scene: SceneState) =>
  scene.foot.stage !== ABOARD
    ? scene.foot.walker.jet
    : scene.eject.stage === EJ_ROCKET || scene.eject.stage === EJ_CHUTE
      ? scene.eject.ghost
      : scene.jets[0]

/** where the seat is in the world, for a jet (left in `eject.seat`) */
export function seatOf(scene: SceneState, j: Jet) {
  const { params: p, mesh } = scene
  const seat = scene.eject.seat
  const ax = axes(j)
  const sc = jetSize(p)
  const b = mesh.seatB * sc
  const h = (mesh.seatH + 0.5) * sc
  seat.x = j.x + b * ax.fx + h * ax.ux
  seat.y = j.y + b * ax.fy + h * ax.uy
  seat.z = j.z + b * ax.fz + h * ax.uz
}

function syncGhost(eject: Ejection) {
  const { pilot, ghost } = eject
  ghost.x = pilot.x
  ghost.y = pilot.y
  ghost.z = pilot.z
  ghost.vx = pilot.vx
  ghost.vy = pilot.vy
  ghost.yaw = eject.heading
}

/** the pilot leaves the jet */
export function startEject(scene: SceneState) {
  const { eject, flight } = scene
  const { pilot, seat, chute } = eject
  const old = scene.jets[0]
  // (the loop: the hold spills where the ship was, and it was no longer on the ground; the pilot
  // comes down on foot, and a new ship costs its fee when it comes: sim/foot.ts)
  // (in space there is nothing to come down on: he floats until a new ship is his, at a station)
  const space = scene.zone.kind === 'space'
  eject.foot = looping(scene) && !space
  if (space && looping(scene)) {
    spillHold(scene, old)
    scene.loop.landing.stage = FLYING
    scene.loop.landing.base = null
  } else if (scene.world.features.bases.length) {
    spillHold(scene, old)
    scene.loop.landing.stage = FLYING
    scene.loop.landing.base = null
    if (!eject.foot) {
      const fee = REDELIVERY[scene.mesh.model.name] ?? 0
      if (fee > 0 && looping(scene)) record(scene, { kind: 'fee', credits: fee, hull: scene.mesh.model.name })
    }
  }
  eject.stage = EJ_ROCKET
  eject.t = 0
  eject.since = 0
  eject.heading = old.yaw
  seatOf(scene, old)
  pilot.x = seat.x
  pilot.y = seat.y
  pilot.z = seat.z
  pilot.vx = old.vx * 0.5
  pilot.vy = old.vy * 0.5
  pilot.vz = space ? 0 : 118
  pilot.swing = 0
  pilot.swingV = 0
  chute.on = false
  chute.free = false
  // the canopy goes first, tumbling away behind
  addDebris(scene, seat.x, seat.y, seat.z + 2, old.vx * 0.3, old.vy * 0.3, 76, 2)
  old.glass = false
  old.lid = 0
  eject.wreck = old
  eject.wreckVz = Math.min(flight.climbV, -34)
  // a new jet is already on its way; it takes its place in the scene once the parachute is open
  const fresh = makeJet(old.x + scene.world.size * 2, old.y, old.z, old.yaw)
  fresh.away = true
  fresh.lid = 1
  scene.jets[0] = fresh
  scene.room.life++
  scene.boost = 0
  flight.diveHold = 0
  syncGhost(eject)
  sound(scene, 'eject', seat.x, seat.y, seat.z, 1, true)
}

function openChute(scene: SceneState) {
  const eject = scene.eject
  const { pilot, chute } = eject
  eject.stage = EJ_CHUTE
  eject.since = eject.t
  // (in space he only floats: there is no parachute, and nothing to fall to)
  chute.on = scene.zone.kind !== 'space'
  chute.free = false
  chute.open = 0
  chute.t = 0
  pilot.swingV = 2.6
  eject.meetT = eject.t + 2.8
  // the seat falls away
  addDebris(scene, pilot.x, pilot.y, pilot.z - 2, pilot.vx * 0.8, pilot.vy * 0.8, pilot.vz - 24, 3)
}

function cutChute(scene: SceneState) {
  const { params: p, eject } = scene
  const { pilot, seat, chute } = eject
  eject.stage = EJ_DROP
  eject.since = eject.t
  seatOf(scene, scene.jets[0])
  eject.dropX = pilot.x - seat.x
  eject.dropY = pilot.y - seat.y
  eject.dropZ = pilot.z - seat.z
  chute.free = true
  chute.t = 0
  chute.x = pilot.x
  chute.y = pilot.y
  chute.z = pilot.z + (LINES + 2.5) * HERO * jetSize(p)
  chute.vx = pilot.vx
  chute.vy = pilot.vy
  chute.vz = 4
  eject.speed = DRIFT
}

/** the jet he left meets the ground */
function explode(scene: SceneState, x: number, y: number, ground: number, vx: number, vy: number) {
  const { world, rig, eject } = scene
  const boom = eject.boom
  boom.on = true
  boom.wet = scene.zone.kind !== 'space' && world.mat[(((y | 0) & NM) << NSHIFT) | ((x | 0) & NM)] < 4
  boom.t = 0
  boom.x = x
  boom.y = y
  boom.z = ground
  boom.puff = 0
  rig.shake = 1
  eject.wreck = null
  for (let i = 0; i < 14; i++) {
    const a = (hash8(i * 37 + 11) / 255) * Math.PI * 2
    const out = 16 + (hash8(i * 53 + 5) / 255) * 60
    addDebris(
      scene,
      x,
      y,
      ground + 2,
      Math.sin(a) * out + vx * 0.3,
      -Math.cos(a) * out + vy * 0.3,
      scene.zone.kind === 'space' ? 0 : 46 + (hash8(i * 71 + 3) / 255) * 110,
      i % 3 === 0 ? 1 : 0,
    )
  }
}

/** everything left in the air by a crash, whatever the pilot is doing */
export function stepWreckage(scene: SceneState, dt: number) {
  const { world, rig, eject, particles } = scene
  const { chute, boom } = eject
  if (rig.shake > 0) {
    rig.shake *= Math.exp(-dt * 4.5)
    if (rig.shake < 0.02) rig.shake = 0
  }
  const space = scene.zone.kind === 'space'
  if (eject.wreck && space) {
    // in space, pilotless, it tumbles on and bursts
    const w = eject.wreck
    w.x += w.vx * dt
    w.y += w.vy * dt
    w.vx *= Math.exp(-dt * 0.5)
    w.vy *= Math.exp(-dt * 0.5)
    w.roll += 2.4 * dt
    w.yaw += 0.9 * dt
    if (eject.t > 1.1) explode(scene, w.x, w.y, w.z, w.vx, w.vy)
  } else if (eject.wreck) {
    // pilotless, it noses over and keeps going
    eject.wreckVz -= 70 * dt
    eject.wreck.x += eject.wreck.vx * dt
    eject.wreck.y += eject.wreck.vy * dt
    eject.wreck.z += eject.wreckVz * dt
    eject.wreck.pitch += (-0.95 - eject.wreck.pitch) * (1 - Math.exp(-dt * 2.6))
    eject.wreck.roll += 1.3 * dt
    const ground = groundAt(world, eject.wreck.x, eject.wreck.y)
    if (eject.wreck.z <= ground + 1.5) explode(scene, eject.wreck.x, eject.wreck.y, ground, eject.wreck.vx, eject.wreck.vy)
  }
  if (boom.on) {
    boom.t += dt
    // black smoke pours from the wreck for a while (steam, where it went into the sea)
    boom.puff -= dt
    if (boom.t < 5 && boom.puff <= 0) {
      boom.puff = 0.045 + boom.t * 0.022
      const n = particles.smokeHead
      addSmoke(
        scene,
        boom.x + (hash8(n * 13 + 1) - 128) * 0.05,
        boom.y + (hash8(n * 29 + 7) - 128) * 0.05,
        boom.z + 2,
        3 + (hash8(n * 7) / 255) * 3,
        (hash8(n * 17 + 3) - 128) * 0.03,
        (hash8(n * 19 + 9) - 128) * 0.03,
        boom.wet ? 0.5 : 0.82,
        2.2 + (hash8(n * 5) / 255) * 1.4,
        boom.wet ? 1 : 2,
      )
    }
    if (boom.t > 7) boom.on = false
  }
  for (let i = 0; i < DEBRIS_N; i++) {
    const o = i * DEBRIS_F
    if (particles.debris[o + 6] < 0) continue
    if (!space) particles.debris[o + 5] -= 150 * dt
    particles.debris[o] += particles.debris[o + 3] * dt
    particles.debris[o + 1] += particles.debris[o + 4] * dt
    particles.debris[o + 2] += particles.debris[o + 5] * dt
    const age = scene.time - particles.debris[o + 6]
    // a burning piece leaves a thread of smoke
    if (particles.debris[o + 7] === 1 && ((age * 30) | 0) % 2 === 0)
      addSmoke(scene, particles.debris[o], particles.debris[o + 1], particles.debris[o + 2], 1.1, 0, 0, 0.5, 0.5, 2)
    if (age > 4 || (age > 0.15 && particles.debris[o + 2] <= groundAt(world, particles.debris[o], particles.debris[o + 1])))
      particles.debris[o + 6] = -1
  }
  if (chute.on && chute.free) {
    // let go, the parachute lifts a little, tips, and drifts off down the wind, slowly folding
    chute.t += dt
    const fx = Math.sin(eject.heading)
    const fy = -Math.cos(eject.heading)
    const k = 1 - Math.exp(-dt * 0.9)
    chute.vx += (-fx * 8 + -fy * 15 - chute.vx) * k
    chute.vy += (-fy * 8 + fx * 15 - chute.vy) * k
    chute.vz += (10 - chute.t * 4.5 - chute.vz) * (1 - Math.exp(-dt * 1.6))
    chute.x += chute.vx * dt
    chute.y += chute.vy * dt
    chute.z += chute.vz * dt
    if (chute.t > 5.2) chute.on = false
  }
}

/** the pilot out of the jet: up on the seat's rocket, down under the parachute, into the new jet */
export function stepEject(scene: SceneState, dt: number) {
  const { params: p, world, eject, particles, flight } = scene
  const { pilot, seat, chute } = eject
  eject.t += dt
  const sc = jetSize(p)
  const fx = Math.sin(eject.heading)
  const fy = -Math.cos(eject.heading)
  const nj = scene.jets[0]
  const space = scene.zone.kind === 'space'
  if (eject.stage === EJ_ROCKET) {
    // the seat's rocket: a hard shove for a quarter of a second, then he coasts to the top
    // (in space it shoves him out sideways, and he coasts on)
    const burning = eject.t < 0.26
    if (!space) pilot.vz += (burning ? 70 : -215) * dt
    else if (burning) {
      pilot.vx += Math.cos(eject.heading) * 260 * dt
      pilot.vy += Math.sin(eject.heading) * 260 * dt
    }
    const k = 1 - Math.exp(-dt * 1.5)
    pilot.vx += (fx * DRIFT - pilot.vx) * k
    pilot.vy += (fy * DRIFT - pilot.vy) * k
    pilot.x += pilot.vx * dt
    pilot.y += pilot.vy * dt
    pilot.z += pilot.vz * dt
    if (eject.t < 0.46) {
      const n = particles.smokeHead
      addSmoke(
        scene,
        pilot.x,
        pilot.y,
        pilot.z - 4 * sc,
        (1.5 + (hash8(n * 7 + 1) / 255) * 1.3) * sc,
        (hash8(n * 11) - 128) * 0.04,
        (hash8(n * 23) - 128) * 0.04,
        0.78,
        0.8 + (hash8(n * 3) / 255) * 0.6,
        1,
      )
    }
    if (!burning && (space ? eject.t > 0.55 : pilot.vz < 30)) {
      if (eject.foot) {
        // (in the loop: no new jet; he comes down on foot, the way his race does)
        eject.stage = EJ_FLY
        startFall(scene, pilot.x, pilot.y, pilot.z, pilot.vx, pilot.vy, pilot.vz, eject.heading)
        return
      }
      openChute(scene)
    }
  } else if (eject.stage === EJ_CHUTE && space && looping(scene)) {
    // in space, a pilot of a side floats a moment; then he is in a new ship at a friendly station
    const k = Math.exp(-dt * 1.2)
    pilot.vx *= k
    pilot.vy *= k
    pilot.x += pilot.vx * dt
    pilot.y += pilot.vy * dt
    pilot.swing += dt * 1.4
    if (eject.t - eject.since > SPACE_FLOAT) {
      respawnInSpace(scene)
      return
    }
  } else if (eject.stage === EJ_CHUTE) {
    // the parachute fills and steadies him; he comes down slowly, swinging, carried along a little
    // (in space he only floats, and the new ship comes for him all the same)
    const ahead = space ? -1e9 : groundAt(world, pilot.x + fx * 30, pilot.y + fy * 30)
    const sink = space ? 0 : pilot.z > ahead + 44 * sc + 16 ? -SINK : 8 // (never down into a hillside)
    pilot.vz += (sink - pilot.vz) * (1 - Math.exp(-dt * 3.5))
    const k = 1 - Math.exp(-dt * 2)
    pilot.vx += (fx * DRIFT - pilot.vx) * k
    pilot.vy += (fy * DRIFT - pilot.vy) * k
    pilot.x += pilot.vx * dt
    pilot.y += pilot.vy * dt
    pilot.z += pilot.vz * dt
    if (!space) chute.open = Math.min(1, chute.open + dt / 0.55)
    pilot.swingV += (-pilot.swing * 16 - pilot.swingV * 1.1) * dt
    pilot.swing += pilot.swingV * dt
    // the new jet: closing from behind and below, braking so that it arrives at his speed
    const tau = Math.max(0, eject.meetT - eject.t)
    const first = nj.away
    const ox = nj.x
    const oy = nj.y
    nj.away = false
    nj.yaw = eject.heading
    nj.yawRate = 0
    nj.roll = 0
    nj.pitch = 0.2 * clamp(tau / 0.7, 0, 1) // nose up while it brakes
    seatOf(scene, nj)
    const sx = seat.x - nj.x
    const sy = seat.y - nj.y
    const sz = seat.z - nj.z
    const behind = 30 * tau * tau
    const below = (10 + 30 * Math.pow(clamp(tau / 2.8, 0, 1), 1.5)) * sc
    nj.x = pilot.x - fx * behind - sx
    nj.y = pilot.y - fy * behind - sy
    nj.z = pilot.z - below - sz
    if (first) {
      nj.trailLen = 0
      nj.lastTrailX = nj.x
      nj.lastTrailY = nj.y
      nj.vx = fx * (DRIFT + 60 * tau)
      nj.vy = fy * (DRIFT + 60 * tau)
    } else if (dt > 0) {
      nj.vx = (nj.x - ox) / dt
      nj.vy = (nj.y - oy) / dt
    }
    if (tau <= 0) cutChute(scene)
  } else {
    // the jet has him: it flies on, gathering speed, while he drops in and the canopy shuts
    eject.speed += (p.speed * (eject.stage === EJ_SEAL ? 0.8 : 0.4) - eject.speed) * (1 - Math.exp(-dt * 1.5))
    nj.vx = fx * eject.speed
    nj.vy = fy * eject.speed
    nj.x += nj.vx * dt
    nj.y += nj.vy * dt
    nj.pitch += (0 - nj.pitch) * (1 - Math.exp(-dt * 6))
    seatOf(scene, nj)
    if (eject.stage === EJ_DROP) {
      const u = clamp((eject.t - eject.since) / 0.36, 0, 1)
      const fall = 1 - u * u // (he falls faster and faster)
      pilot.x = seat.x + eject.dropX * fall
      pilot.y = seat.y + eject.dropY * fall
      pilot.z = seat.z + eject.dropZ * fall
      pilot.swing *= Math.exp(-dt * 9)
      if (u >= 1) {
        eject.stage = EJ_SEAL
        eject.since = eject.t
      }
    } else {
      const u = clamp((eject.t - eject.since - 0.12) / 0.6, 0, 1)
      nj.lid = 1 - u * u * (3 - 2 * u)
      pilot.x = seat.x
      pilot.y = seat.y
      pilot.z = seat.z
      if (u >= 1) {
        // sealed in: the jet is his to fly again, and it kicks away
        nj.lid = 0
        eject.stage = EJ_FLY
        flight.speedEase = eject.speed / Math.max(1, p.speed)
        scene.boost = 0.9
        flight.altGoal = nj.z
        flight.climbV = 0
        flight.climbTilt = 0
        flight.floor = 0
        flight.safeT = 1.4
        sound(scene, 'pickup', nj.x, nj.y, nj.z, 1, true)
      }
    }
    pilot.vx = nj.vx
    pilot.vy = nj.vy
  }
  syncGhost(eject)
}
