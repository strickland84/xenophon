// Flying in space: the ship goes the way its nose points, any way at all, and nothing moves it but its pilot. No world,
// sun or giant pulls it, and the camera does not lean to look at one. (James, 2026-11-18, of the first free flight near a world: "spinning around getting sucked
// down … very horrible and disorienting"; "I want no gravity or wonky pulling of my ship".)
//
// Two ways of flying it, by what is in the pilot's hand (data/space.ts FLIGHT3D):
//
//   the keys, a stick                      a climb or a dive held pitches the nose for as long as it is held: on over the
//                                          top and round, a whole loop. Let go near level, it comes level; on its back, it
//                                          rolls upright, heading the way it was going; pointed well up or down, it stays
//                                          so and flies there.
//   the pointer                            where the pointer is says how far up or down the nose points, and there it
//                                          stays: a mouse resting anywhere is a ship flying steadily. (As a rate, the way
//                                          the keys are, a mouse left in the middle of the screen looped it for ever.)
//                                          Pushed into a band at the frame's top or bottom it pitches on round as the
//                                          keys do, so a mouse loops too (FLIGHT3D edge).
//
// Left and right turn it about the plane's own up, as ever. Overhead the nose only leans up or down while a climb or a
// dive is held. The cruise drive holds the plane. Over a world, flown well down under the plane, it is in the world's
// air (sim/spacezone.ts, sim/travel.ts flyAir): there is no other way down to one, and Use held over a world only puts
// the nose down. It flies in a band far wider than a loop (SPACE_DEEP … SPACE_TOP); at
// the band's edge it goes no further out, and its nose is left alone. The camera from behind and from the seat looks
// where the ship points (camera.ts, render/view.ts `pitch`).
//
// Over a world the surface model (flight.ts flyLeader) flies a height: a climb or a dive is a rate of climb and the nose
// only tilts with it. That was space's too once, in a band of 268 px, where no ship could pitch past a lean.

import { FLIGHT3D, SPACE_DEEP, SPACE_TOP } from '../data/space'
import { MOUSE_STICK } from '../data/hulls'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp, hash8, wrapAngle } from '../util/math'
import { pr, project } from '../render/view'
import { startRoll } from './flight'
import type { FlightLimits } from './flight'

/**
 * What the pilot asks of the ship: a turn, −1 … 1 (right is positive); and for its nose either a pitch held (`pitch`,
 * −1 … 1, up is positive) or, `aiming`, a way to point and stay (`aim`, radians over level)
 */
const stick = { turn: 0, pitch: 0, aim: 0, aiming: false }

/** reads the keys, a stick, or the pointer, as the surface model does (flight.ts): a turn, and what is asked of the nose */
function readStick(scene: SceneState, dt: number, lead: Jet, limits: FlightLimits) {
  const { params: p, controls: ctl, view, flight } = scene
  const { w: W, h: H } = scene.screen
  const F = FLIGHT3D
  const sense = p.invertY ? -1 : 1 // like a flight stick, down climbs and up dives
  // (a hand resting on a mouse is a hand on the stick, however still; only where a ship with nobody at it flies itself
  // about is a pointer left still a while taken for nobody)
  const steering = p.followPointer && ctl.pointerOn && (!p.wander || ctl.pointerIdle < 5)
  stick.turn = 0
  stick.pitch = 0
  stick.aim = 0
  stick.aiming = false
  flight.aside = 0
  if (ctl.keyClimb === 0) flight.carry = false
  if (ctl.keyMode) {
    stick.turn = ctl.keyTurn
    if (limits.chase && !flight.carry) stick.pitch = ctl.keyClimb * sense
    else {
      // (and a climb held since before the ship came up out of a world's air: it goes on climbing, and does not loop)
      // overhead: a lean of the nose, for as long as it is held
      stick.aiming = true
      stick.aim = ctl.keyClimb * sense * F.lean
    }
  } else if (steering && limits.chase) {
    // from behind and from the seat: the mouse is a stick (Elite's): left or right of the middle turns, above or below it
    // pitches, as fast as it is pushed
    const reach = W * MOUSE_STICK.reach
    const t = clamp((ctl.pointerX - view.cx) / reach, -1, 1)
    if (Math.abs(t) > MOUSE_STICK.dead) stick.turn = t
    flight.aside = Math.abs(t)
    // (a climb or a dive held on the keys or a stick wins over where the pointer is)
    if (ctl.keyClimb !== 0 && !flight.carry) stick.pitch = ctl.keyClimb * sense
    else if (ctl.keyClimb !== 0) {
      stick.aiming = true
      stick.aim = ctl.keyClimb * sense * F.lean
    } else {
      // (the dead zone the same ring as across; hard over `span` of the frame's height from the middle)
      const dead = reach * MOUSE_STICK.dead
      const off = view.steerY - ctl.pointerY
      const far = clamp((Math.abs(off) - dead) / Math.max(1, H * F.span - dead), 0, 1)
      stick.pitch = sense * Math.sign(off) * Math.pow(far, F.curve)
    }
  } else if (steering && project(view, lead.x, lead.y, lead.z)) {
    // overhead: the nose turns to where the pointer is; it leans up or down only as held
    stick.aiming = true
    stick.aim = ctl.keyClimb * sense * F.lean
    const vx = ctl.pointerX - pr.x
    const vy = ctl.pointerY - pr.y
    if (vx * vx + vy * vy > 18 * 18) {
      const fx = vx * view.cos + vy * view.sin
      const fy = -vx * view.sin + vy * view.cos
      stick.turn = clamp((wrapAngle(Math.atan2(fx, -fy) - lead.yaw) * 2.6) / limits.maxRate, -1, 1)
    }
  } else if (p.wander) {
    // nobody flying, where a ship then flies itself: it wanders, and rolls now and then, as it does over a world
    const t = scene.time
    stick.turn = clamp(0.62 * Math.sin(t * 0.31 + 1.3) + 0.38 * Math.sin(t * 0.73 + 0.4) + 0.22 * Math.sin(t * 0.17), -1, 1)
    if (p.stunts) {
      flight.autoStunt -= dt
      if (flight.autoStunt <= 0) {
        startRoll(scene)
        flight.autoStunt = 9 + (hash8((t * 10) | 0) / 255) * 7
      }
    }
  }
  // (nobody flying, a pilot's ship: it holds its course, and comes level)
  flight.want = stick.aiming ? stick.aim / F.aim : stick.pitch
}

/**
 * The ship turned over so its pitch says upright again: the same attitude, said another way (heading the way it is
 * going, level-side up, rolled on its back). The roll then eases level by itself: a half roll.
 */
function upright(lead: Jet) {
  lead.yaw = wrapAngle(lead.yaw + Math.PI)
  lead.pitch = wrapAngle(lead.pitch + Math.PI)
  lead.roll = wrapAngle(Math.PI - lead.roll)
  lead.yawRate = -lead.yawRate
}

/** one step of the pilot's own ship in space, flown free */
export function flySpace(scene: SceneState, dt: number, lead: Jet, introDone: boolean, speed: number, limits: FlightLimits) {
  const { params: p, flight } = scene
  const F = FLIGHT3D
  if (introDone) readStick(scene, dt, lead, limits)
  else {
    stick.turn = 0
    stick.pitch = 0
    stick.aim = 0
    stick.aiming = false
  }
  // (the cruise drive holds the plane: it turns, and its nose is level)
  if (scene.space.pace > 1.2) {
    stick.pitch = 0
    stick.aim = 0
    stick.aiming = true
  } else if (scene.space.diving) {
    // (Use held over a world: nose down at it, into its air)
    stick.pitch = 0
    stick.aim = -F.dive
    stick.aiming = true
  }
  lead.pitch = wrapAngle(lead.pitch)
  let back = Math.cos(lead.pitch) < 0
  const held = !stick.aiming && stick.pitch !== 0
  flight.idle = held ? 0 : flight.idle + dt
  // (its nose pointed for it again: it no longer comes level by itself)
  if (held || stick.aiming) flight.level = false
  // on its back and no longer pitched round: it rolls upright (at once where its nose is told where to point)
  if (back && !held && (stick.aiming || flight.idle > F.idle)) {
    upright(lead)
    back = false
  }
  // what the nose is asked: to go on round, to point where it is told, or (let go a moment, near level; or just up out
  // of a world's air) to come level; else it stays as it was pointed
  const settle = !back && (flight.level || (flight.idle > F.idle && Math.abs(lead.pitch) < F.settle))
  const pitchWant = held
    ? stick.pitch * F.pitch
    : stick.aiming
      ? clamp((stick.aim - lead.pitch) * F.come, -F.pitch * 1.5, F.pitch * 1.5)
      : settle
        ? clamp(-lead.pitch * F.level, -F.pitch, F.pitch)
        : 0
  flight.pitchRate += (pitchWant - flight.pitchRate) * (1 - Math.exp(-dt * F.ease))
  lead.pitch += flight.pitchRate * dt
  // (the turn is about the plane's up: on its back the ship goes the other way round it, so the nose still goes the way asked)
  const want = stick.turn * limits.maxRate * (back ? -1 : 1)
  lead.yawRate += (want - lead.yawRate) * (1 - Math.exp(-dt * 2.6))
  lead.yaw += lead.yawRate * dt
  const bankMax = (p.bank * Math.PI) / 180
  const rollTarget = clamp(lead.yawRate / limits.maxRate, -1, 1) * bankMax
  lead.roll += wrapAngle(rollTarget - lead.roll) * (1 - Math.exp(-dt * 5))
  // it goes the way its nose points
  const cp = Math.cos(lead.pitch)
  const sp = Math.sin(lead.pitch)
  lead.vx = Math.sin(lead.yaw) * cp * speed
  lead.vy = -Math.cos(lead.yaw) * cp * speed
  lead.x += lead.vx * dt
  lead.y += lead.vy * dt
  lead.z += sp * speed * dt
  // the band it flies in: at its edge the ship goes no further out (its nose is its pilot's)
  const walled = lead.z > SPACE_TOP || lead.z < SPACE_DEEP
  lead.z = clamp(lead.z, SPACE_DEEP, SPACE_TOP)
  flight.altGoal = lead.z
  flight.climbV = walled ? 0 : sp * speed
  // (the chase camera pitches with the ship now: nothing left for it to lean by)
  flight.climbTilt = 0
  // the pilot's head: it leans into a turn, sinks as the nose comes up and under thrust, and is never quite still
  const hxGoal = clamp(lead.yawRate / limits.maxRate, -1, 1) * 6.4 + Math.sin(scene.time * 0.53) * 0.3
  const hyGoal = clamp(flight.pitchRate / F.pitch, -1, 1) * 3.4 + scene.boost * 1.6 + Math.sin(scene.time * 0.71 + 1) * 0.25
  flight.headVX += ((hxGoal - flight.headX) * 64 - flight.headVX * 11) * dt
  flight.headVY += ((hyGoal - flight.headY) * 64 - flight.headVY * 11) * dt
  flight.headX = clamp(flight.headX + flight.headVX * dt, -8, 8)
  flight.headY = clamp(flight.headY + flight.headVY * dt, -5, 5)
}

/** the ship's attitude said upright (the same attitude; on its back it is rolled over): before anything that flies it as the surface model does */
export function squareUp(lead: Jet) {
  lead.pitch = wrapAngle(lead.pitch)
  if (Math.cos(lead.pitch) < 0) upright(lead)
}

/** the ship brought level and upright, a step at a time, where it is not flown free (docking, in a gate, the pilot out of his seat) */
export function levelOut(scene: SceneState, dt: number, lead: Jet) {
  lead.pitch = wrapAngle(lead.pitch)
  if (Math.cos(lead.pitch) < 0) upright(lead)
  lead.pitch += -lead.pitch * (1 - Math.exp(-dt * 3))
  scene.flight.pitchRate = 0
  scene.flight.idle = 0
}
