// The player's weapons: which enemy his sights are on, where to aim to hit it (the lead
// point the HUD shows), his guns on the fire button, and his missiles on the secondary one.
// Then everything in the air moves on: shots, missiles, damage, wrecks, and the skirmish.

import type { SceneState } from '../state'
import { gatherFighters, hostile, playerFighter, stepFighters } from './combat'
import type { Fighter } from './combat'
import { sound, stepEffects } from './effects'
import { INTRO_TIME } from './flight'
import { assistedAim, leadOn, noseOf, offNose, stepGun, stepShots } from './guns'
import type { Aim } from './guns'
import { launch, stepMissiles, stepSeeker } from './missiles'
import { stepPilots } from './pilots'
import { stepFeed, stepRemoteGuns } from './room'
import { stepSkirmish } from './skirmish'
import { cruising } from './space'
import { dropMine, stepMines } from './mines'
import { grounded } from './landing'
import { tell } from './power'
import { targetFighter } from './target'

export interface Sights {
  /** the enemy the player's sights are on (null: none in front of him), and seconds until it is chosen again */
  target: Fighter | null
  retarget: number
  /** where to aim to hit it: the lead point, in the world */
  lead: { x: number; y: number; z: number }
  /** the guns and the secondary weapon were held at the last step (a missile is fired as it goes down; landed, a press says the weapons are safe) */
  fireWas: boolean
  secondaryWas: boolean
}

export function createSights(): Sights {
  return { target: null, retarget: 0, lead: { x: 0, y: 0, z: 0 }, fireWas: false, secondaryWas: false }
}

// scratch
const nose: Aim = { x: 0, y: 0, z: 0 }
const toward: Aim = { x: 0, y: 0, z: 0 }
const aim: Aim = { x: 0, y: 0, z: 0 }

/** how far off the nose an enemy is, as a score: the lower the better (Infinity: not a target) */
function sightScore(f: Fighter, t: Fighter) {
  const d = Math.hypot(t.jet.x - f.jet.x, t.jet.y - f.jet.y, t.jet.z - f.jet.z)
  if (d > 700 || d < 1) return Infinity
  toward.x = (t.jet.x - f.jet.x) / d
  toward.y = (t.jet.y - f.jet.y) / d
  toward.z = (t.jet.z - f.jet.z) / d
  const o = offNose(nose, toward)
  if (Math.abs(o.across) > 1.1) return Infinity
  return Math.abs(o.across) + Math.abs(o.up) * 0.3 + d / 1400
}

/** the sights settle on the enemy most nearly in front, and stay on it while it is still a fair choice */
function chooseTarget(scene: SceneState, f: Fighter, dt: number) {
  const s = scene.sights
  if (s.target && !s.target.alive) s.target = null
  s.retarget -= dt
  // (an enemy the pilot picked with the target key has them for as long as it is a fair choice at all: sim/target.ts)
  const picked = targetFighter(scene)
  if (s.retarget > 0 && s.target && (!picked || s.target === picked)) return
  s.retarget = 0.25
  noseOf(f, nose)
  let best: Fighter | null = null
  let bestScore = Infinity
  for (const t of scene.fighters) {
    if (!hostile(t) || !t.alive) continue
    const score = sightScore(f, t)
    if (score < bestScore) {
      bestScore = score
      best = t
    }
  }
  // (the one it is on keeps the sights unless another is clearly better)
  const now = s.target ? sightScore(f, s.target) : Infinity
  if (now < Infinity && bestScore > now * 0.7) best = s.target
  if (picked && hostile(picked) && sightScore(f, picked) < Infinity) best = picked
  s.target = best
}

/** the player's guns and missiles, for one step */
function stepPlayer(scene: SceneState, dt: number) {
  const s = scene.sights
  const ctl = scene.controls
  const f = playerFighter(scene)
  const ready = scene.introT > INTRO_TIME
  if (!f || !ready) {
    s.target = null
    s.fireWas = ctl.fire
    s.secondaryWas = ctl.secondary
    return
  }
  // landed, docked, coming down or lifting off (James, 2026-11-18: "ships that are landed or docked should be not able to
  // fire their weapons"): the weapons are safe. Nothing fires, the sights choose nothing, the guns cool; the trigger pressed
  // says so, once a moment (sim/power.ts tell)
  if (grounded(scene)) {
    s.target = null
    stepGun(scene, f, dt, false, assistedAim(scene, f, aim))
    stepSeeker(f, null, dt)
    const pressed = (ctl.fire && !s.fireWas) || (ctl.secondary && !s.secondaryWas)
    if (pressed && tell(scene, 'safe')) sound(scene, 'safe', f.jet.x, f.jet.y, f.jet.z, 1, true)
    s.fireWas = ctl.fire
    s.secondaryWas = ctl.secondary
    return
  }
  chooseTarget(scene, f, dt)
  const t = s.target
  if (t) {
    const d = leadOn(f, t, 1, toward)
    s.lead.x = f.jet.x + toward.x * d
    s.lead.y = f.jet.y + toward.y * d
    s.lead.z = f.jet.z + toward.z * d
  }
  // (in space, the cruise drive holds the guns: firing drops it out, and the next shot goes)
  const armed = !cruising(scene)
  stepGun(scene, f, dt, ctl.fire && armed, assistedAim(scene, f, aim))
  if (stepSeeker(f, t, dt)) sound(scene, 'locked', f.jet.x, f.jet.y, f.jet.z, 1, true)
  if (ctl.secondary && armed && !s.secondaryWas && f.missileWait <= 0) {
    // (a missile if one is locked; else a mine, if it carries a layer)
    if (!launch(scene, f) && !dropMine(scene, f)) sound(scene, 'noLock', f.jet.x, f.jet.y, f.jet.z, 1, true)
  }
  s.fireWas = ctl.fire
  s.secondaryWas = ctl.secondary
}

/** before anything moves: who is in the air, and what the computer's pilots do */
export function stepFightersFly(scene: SceneState, dt: number) {
  gatherFighters(scene)
  stepPilots(scene, dt)
}

/** once everything has moved: the player fires, and shots, missiles, damage and the skirmish move on */
export function stepFight(scene: SceneState, dt: number) {
  stepPlayer(scene, dt)
  stepRemoteGuns(scene, dt)
  stepShots(scene, dt)
  stepMissiles(scene, dt)
  stepMines(scene, dt)
  stepFighters(scene, dt)
  stepEffects(scene, dt)
  stepSkirmish(scene, dt)
  stepFeed(scene)
}
