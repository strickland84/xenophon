// One step of the simulation: everything that moves, in the order it has to happen.
//
// The scene is meant to be stepped by STEP seconds at a time, every time: the page counts out
// fixed steps however fast its screen repaints, so the handling is the same on every machine
// (and two machines given the same inputs fly the same flight).

import { prepareCockpit } from '../render/cockpit/view'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import { stepCamera, stepCine } from './camera'
import { stepWreckage } from './ejection'
import { stepFight, stepFightersFly } from './fight'
import { stepTarget } from './target'
import { INTRO_TIME, stepJets, stepThrust } from './flight'
import { stepWingmen } from './formation'
import { stepShips } from './ships'
import { zoneOf } from './zone'
import { stepSquad } from './squad'
import { stepHudFx } from './hudfx'
import { stepPower } from './power'
import { calmed, stepUp } from './interior'
import { stepRepair } from './repair'

/** seconds in one step of the simulation */
export const STEP = 1 / 60

export function stepScene(scene: SceneState, dtRaw: number) {
  const dt = clamp(dtRaw, 0, 0.05)
  const ctl = scene.controls
  scene.time += dt
  scene.introT += dt
  ctl.pointerIdle += dt
  // (up out of his seat in flight: the outside runs on as ever, told nothing is held, his ship flying itself; what he
  // holds walks him round its rooms once the outside has had its step: sim/interior.ts)
  const up = scene.interior.flying
  if (up) scene.controls = calmed(scene)
  // (the zone: a world's surface, or a system's space; sim/zone.ts)
  const zone = zoneOf(scene)
  zone.settle(scene, dt)
  prepareCockpit(scene, dt)

  const introDone = scene.introT > INTRO_TIME
  stepPower(scene, dt)
  stepThrust(scene, dt, introDone)
  const speed = scene.speed
  // (the jet the pilot begins this step in: an ejection puts a new one in its place)
  const lead = scene.jets[0]
  const limits = zone.limits(scene, dt, lead, speed)
  zone.fly(scene, dt, lead, introDone, speed, limits)
  stepWreckage(scene, dt)
  stepCine(scene, dt)

  // the computer's pilots decide and fly; then everyone else moves
  stepFightersFly(scene, dt)
  stepWingmen(scene, dt, limits.clearance)
  stepJets(scene, dt, lead, limits.maxRate)
  stepShips(scene, dt)
  // what the zone holds besides the ships (on a surface: pilots on foot, signals, the weather, the loop)
  zone.after(scene, dt)
  // the hull mended where the ship stands, at a friendly base or station
  stepRepair(scene, dt)
  // what the pilot has picked with the target key (the sights follow an enemy picked), then the guns and missiles, damage, and the skirmish
  stepTarget(scene, dt)
  stepFight(scene, dt)
  stepSquad(scene, dt)
  stepHudFx(scene, dt)
  if (up) {
    scene.controls = ctl
    stepUp(scene, dt)
  }
  stepCamera(scene, dt)
  // (a press of Use lasts one step: whatever wants it has had its chance to see it)
  ctl.use = false
  scene.foot.plant = false
}
