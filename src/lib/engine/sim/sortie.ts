// One step of the loop (loop.ts), in its place in the step (step.ts): what Land is for right
// now (cutting ore with the laser, coming down, or lifting off), what the HUD offers, the
// chunks and crates lying about, the outcrops that come back, and the bases' turrets. On a
// world with nothing stamped into it (the island world of the settings) none of this happens.

import type { SceneState } from '../state'
import { stepTurrets } from './bases'
import { stepCrates } from './crates'
import { EJ_FLY } from './ejection'
import { INTRO_TIME } from './flight'
import { dust, FLYING, LANDED, LANDING, landingSpot, LIFTING, stepLanding } from './landing'
import { groundAt } from '../world/world'
import { friendly, looping } from './loop'
import { ABOARD } from './foot'
import { regrow, scoopReach, stepChunks, stepLaser, stopLaser } from './mining'

/** seconds between looks at whether an outcrop's period has turned */
const REGROW_EVERY = 1

export function stepSortie(scene: SceneState, dt: number) {
  const loop = scene.loop
  const ctl = scene.controls
  const L = loop.landing
  if (ctl.tap > 0) ctl.tap -= dt
  if (scene.world.features.bases.length === 0) {
    L.prompt = ''
    return
  }
  const held = ctl.land || ctl.tap > 0
  const j = scene.jets[0]
  const flying = scene.foot.stage === ABOARD && scene.eject.stage === EJ_FLY && !j.away && scene.introT > INTRO_TIME && !!j.fighter?.alive
  if (Math.floor(scene.time / REGROW_EVERY) !== Math.floor((scene.time - dt) / REGROW_EVERY)) regrow(scene)
  if (flying) {
    // (the laser on its own control, the mining key: on Land's, wherever ore was in reach the ship could not land)
    stepLaser(scene, dt, j, ctl.mine, L.stage === FLYING)
    const mining = loop.mining.target !== null
    stepLanding(scene, dt, j, held, true)
    // what Land would do now, for the HUD (landed, in the loop: climb out, or hold to lift off); and the laser, by it
    L.landToo = ''
    if (L.stage === LANDED) L.prompt = looping(scene) ? 'landed' : 'takeoff'
    else if (L.stage !== FLYING) L.prompt = ''
    else {
      const spot = landingSpot(scene, j, scene.speed)
      const land = spot ? (spot.base && friendly(scene, spot.base) ? 'pad' : 'land') : ''
      L.prompt = mining ? 'mine' : land
      if (mining) L.landToo = land
    }
  } else {
    stopLaser(scene)
    L.prompt = ''
  }
  const scooping = flying && L.stage === FLYING ? j : null
  stepChunks(scene, dt, scooping, scoopReach(scene))
  stepCrates(scene, dt, scooping)
  stepTurrets(scene, dt)
  // other pilots coming down or lifting off kick up dust too
  for (const s of scene.ships)
    if (s.landing === LANDING || s.landing === LIFTING) dust(scene, s.jet, groundAt(scene.world, s.jet.x, s.jet.y), dt, 1, s)
}
