// Space as a zone (sim/zone.ts): how the player's ship is flown there (free, at the cruise drive's
// pace, or eased in and out of a dock), and what is stepped once every ship has moved: the bodies
// round their orbits, the rocks and shards near the ship, a sun's heat, the drones at a derelict,
// and what Use does (dock, jump, thread, descend, skim, mine).
//
// Near a world nothing happens that the pilot did not ask for. It does not pull his ship, and the
// camera does not lean to look at it (both did, and near a world he was "spinning around getting sucked
// down": James, 2026-11-18). A world is gone down to by flying down at it: over its disc, well under
// the plane, nose still down, the ship is in its air (sim/travel.ts flyAir), which he flies through as
// he flew to it, or by holding Use over it, which takes him straight into its air.

import { clearWild } from './creatures'
import { AIR, GATE, GIANT, HOLE, SPACE_Z } from '../data/space'
import { drawSpace, drawSpaceFront } from '../render/space'
import type { SceneState } from '../state'
import { wrapAngle } from '../util/math'
import { bumpRocks, oreRocks, scoopShards, skimGas, stepRocks, stepShards } from './belts'
import { ownFighter } from './combat'
import { stepCrates } from './crates'
import { EJ_FLY, stepEject } from './ejection'
import { easeLook, flyLeader, INTRO_TIME } from './flight'
import { flySpace, levelOut } from './spaceflight'
import { FLYING, LANDED } from './landing'
import { powered, switchOn } from './power'
import { scoopReach, stepChunks, stepLaser, stopLaser } from './mining'
import { CRUISE_OFF, dropCruise, placeBodies, spaceLimits, spacePrompt, stepCruise, stepGravity, stepHeat, worldUnder } from './space'
import { dockable, moveDocking, shelterDocked, startDocking, startUndocking } from './stations'
import { stepBands } from './bands'
import { stepTraffic } from './traffic'
import { abandonTravel, flyAir, inAir, startDescent, startJump, startThread, stepTravel } from './travel'
import type { Zone } from './zone'
import { heightOver } from './air'
import { record } from './loop'
import { placeStationTurrets, stepTurrets } from './bases'
import { settleWorld } from './planet'

/** seconds Use must be held before it docks, jumps or threads (a tap does nothing by mistake) */
const USE_HOLD = 0.2

export const SPACE: Zone = {
  kind: 'space',
  // (another world, or another system, asked for by the settings)
  settle: (scene, dt) => settleWorld(scene, dt),
  limits: (scene, dt, lead, speed) => spaceLimits(scene, dt, lead, speed),
  fly(scene, dt, lead, introDone, speed, limits) {
    const tr = scene.travel
    if (scene.eject.stage !== EJ_FLY) stepEject(scene, dt)
    else if (scene.loop.landing.stage !== FLYING) {
      levelOut(scene, dt, lead)
      moveDocking(scene, dt, lead)
    } else if (tr.kind === 'gate' && !tr.switched) {
      levelOut(scene, dt, lead)
      holdInGate(scene, dt)
    } else if (inAir(scene)) flyAir(scene, dt, lead, introDone, speed, limits)
    else if (scene.interior.flying) {
      // (the pilot up out of his seat: it flies itself, level, as it does over a world)
      levelOut(scene, dt, lead)
      flyLeader(scene, dt, lead, introDone, speed, limits)
      stepGravity(scene, dt, lead)
    } else {
      // flown free: any way its nose points (sim/spaceflight.ts)
      flySpace(scene, dt, lead, introDone, speed, limits)
      stepGravity(scene, dt, lead)
    }
    // (the camera looks where the ship points, near a world as anywhere: it leaned down over one, and swung up and down
    // by itself as a ship crossed a world's edge)
    if (!inAir(scene)) easeLook(scene, dt, 0)
  },
  after(scene, dt) {
    placeBodies(scene)
    stepRocks(scene)
    stepShards(scene)
    stepCruise(scene, dt)
    stepHeat(scene, dt)
    bumpRocks(scene, dt)
    scoopShards(scene)
    // the computer's ships that live here: raiders at the gates and in the belts, a derelict's drones, patrols; and haulers
    stepBands(scene, dt)
    stepTraffic(scene)
    // (a world's wildlife let go of: in space it has none; James saw them follow him up)
    clearWild(scene)
    shelterDocked(scene)
    // (the stations' turrets, riding round with them)
    placeStationTurrets(scene)
    stepTurrets(scene, dt)
    stepSpaceUse(scene, dt)
    stepTravel(scene, dt)
  },
  drawBack: (scene, f) => drawSpace(scene, f),
  drawHaze() {},
  drawFront: (scene, f) => drawSpaceFront(scene, f),
}

/** charging in a gate: the gate's field holds the ship in its middle, slowing it, nose along the lane */
function holdInGate(scene: SceneState, dt: number) {
  const j = scene.jets[0]
  const gate = scene.space.bodies.find((b) => b.body.index === scene.travel.from)
  if (!gate) return
  const k = 1 - Math.exp(-dt * 2.4)
  const d = Math.hypot(gate.x, gate.y) || 1
  // (it points out of the system, through the gate, the way the lane goes)
  const out = Math.atan2(gate.x / d, -gate.y / d)
  j.yaw += wrapAngle(out - j.yaw) * k
  j.yawRate *= Math.exp(-dt * 4)
  j.roll += (0 - j.roll) * k
  const slow = scene.speed * GATE.slow
  j.vx = Math.sin(j.yaw) * slow
  j.vy = -Math.cos(j.yaw) * slow
  j.x += (gate.x - j.x) * k + j.vx * dt * 0.2
  j.y += (gate.y - j.y) * k + j.vy * dt * 0.2
  scene.space.driftX = 0
  scene.space.driftY = 0
}

/** what Use does in space, and what the HUD says it would do */
function stepSpaceUse(scene: SceneState, dt: number) {
  const ctl = scene.controls
  const sp = scene.space
  const L = scene.loop.landing
  const tr = scene.travel
  if (ctl.tap > 0) ctl.tap -= dt
  const held = ctl.land || ctl.tap > 0
  const j = scene.jets[0]
  const f = ownFighter(scene)
  const flying = !!f && scene.eject.stage === EJ_FLY && !j.away && scene.introT > INTRO_TIME
  const mining = scene.loop.mining
  const scooping = flying && L.stage === FLYING ? j : null
  stepChunks(scene, dt, scooping, scoopReach(scene))
  stepCrates(scene, dt, scooping)
  if (!flying || (tr.kind && tr.kind !== 'gate' && tr.kind !== 'hole') || tr.switched) {
    sp.prompt = ''
    sp.held = 0
    stopLaser(scene)
    return
  }
  if (!held) L.release = false
  // docked: Use undocks; docking or undocking, it does nothing
  if (L.stage === LANDED) {
    sp.prompt = 'undock'
    if (held && !L.release) {
      L.held += dt
      // (with its power off, the hold brings it up first; still held once it is up, the ship backs out)
      if (L.held > 0.25 && !powered(scene)) switchOn(scene)
      else if (L.held > 0.25) startUndocking(scene)
    } else L.held = 0
    return
  }
  if (L.stage !== FLYING) {
    sp.prompt = ''
    return
  }
  // a jump or a run through a ring under way: it goes on only while Use is held, and the ship stays where it must
  // (once charged, the gate or the ring has the ship, held or not)
  if (tr.kind === 'gate') {
    sp.prompt = 'jump'
    if (!held && tr.t < GATE.charge) abandonTravel(scene)
    return
  }
  if (tr.kind === 'hole') {
    const hole = sp.bodies.find((b) => b.body.index === tr.from)
    sp.prompt = 'thread'
    const d = hole ? Math.hypot(hole.x - j.x, hole.y - j.y) : 0
    // (in the ring's band for the whole run; out of it, or let go, and the hole only pulls)
    if (tr.t < HOLE.thread && (!held || !hole || Math.abs(d - hole.body.size * HOLE.ring) > hole.body.size * HOLE.band * 1.6))
      abandonTravel(scene)
    return
  }
  spacePrompt(scene, j)
  // down into a world's air: over its disc, flown well down under the plane in a dive that is meant (steeper than a
  // pointer resting off the middle gives), or all the way down to the globe's own air at any slope. From there on it is
  // his to fly, down or back up
  const under = worldUnder(scene, j)
  if (under && Math.cos(j.pitch) > 0 && Math.sin(j.pitch) < -0.05) {
    const size = under.body.size
    const r = Math.hypot(under.x - j.x, under.y - j.y) / size
    const shell = heightOver(under.body, Math.sqrt(Math.max(0, 1 - r * r))) - size * AIR.shell
    const deep = SPACE_Z - j.z
    if ((deep >= AIR.enter && Math.sin(j.pitch) < -AIR.steep) || deep >= shell) {
      dropCruise(scene, '')
      startDescent(scene, under.body.index)
      return
    }
  }
  // (a rock with ore in reach: the laser, on its own control, the mining key; the prompt says so if nothing else is offered)
  const canMine = oreRocks(scene).length > 0
  stepLaser(scene, dt, j, scene.controls.mine, canMine)
  if (!sp.prompt && mining.target) sp.prompt = 'mine'
  if (sp.prompt === 'mine' && mining.on && sp.cruise !== CRUISE_OFF) dropCruise(scene, '')
  const b = sp.target >= 0 ? sp.bodies[sp.target] : null
  if (!held || !b || L.release) {
    sp.held = 0
    return
  }
  sp.held += dt
  if (sp.prompt === 'skim') {
    // gas, while Use is held over the giant's upper bands
    if (sp.cruise !== CRUISE_OFF) dropCruise(scene, '')
    sp.gas += dt * GIANT.rate
    while (sp.gas >= 1) {
      sp.gas -= 1
      if (skimGas(scene, 1) > 0) sp.skimmed++
    }
    if (sp.skimmed >= 5) {
      record(scene, { kind: 'mined', items: [{ id: 'helion', n: sp.skimmed }], world: scene.worldKey })
      sp.skimmed = 0
    }
    return
  }
  if (sp.held < USE_HOLD) return
  if (sp.prompt === 'descend') {
    // (held over a world: straight into its air, and on down through it. It put the nose down and left the ship to dive
    // in, many seconds steeply down, the world spinning under it as the mouse turned it: James, 2026-11-19)
    dropCruise(scene, '')
    L.release = true
    sp.held = 0
    startDescent(scene, b.body.index)
    return
  }
  L.release = true
  sp.held = 0
  if (sp.prompt === 'dock' && dockable(scene, b)) {
    dropCruise(scene, '')
    startDocking(scene, b)
  } else if (sp.prompt === 'jump') startJump(scene, b.body)
  else if (sp.prompt === 'thread') startThread(scene, b.body)
}
