// The ship's power (James, 2026-11-18, after playing: "we should have a power control to ships. They should be defaulted to
// powered off, and then when we switch power on they power up (affecting instruments etc)"). Landed or docked, a ship can
// sit with its power off: its screens dark, the HUD saying so and which key brings it up, no glow in its engines, the
// throttle dead, and no lifting off. The power switch (an action of its own: P, a controller's D-pad down, the touch
// screen's Power button) brings it up over `POWER.up` seconds, the instruments coming alive one after another and the
// engines lighting last; landed or docked, the switch shuts it down again. In flight the switch is refused: a ship never
// loses its power by it. Land held to lift off (Use held to undock) with the power off switches it on, and the ship goes
// once it is up (landing.ts, spacezone.ts).
//
// With the `coldStart` setting (the page's) a ship sits powered off wherever it is set down for its pilot (where he
// begins, a new ship after one lost) and whenever he has left it (on foot, inside); without it (the scripted flights) it is
// always on unless he switches it off himself.
//
// Landed, docked, coming down or lifting off, the weapons are safe whatever the power (fight.ts): nothing fires, and the
// trigger pressed says WEAPONS SAFE, once a moment.

import { POWER } from '../data/hulls'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import { sound } from './effects'
import { EJ_FLY } from './ejection'
import { ABOARD } from './foot'
import { FLYING, LANDED } from './landing'

export interface Power {
  /** the switch: on or off */
  on: boolean
  /** 0..1: how far the ship has come up (1: everything alive) */
  level: number
  /** the switch was pressed since the last step */
  ask: boolean
  /** what the HUD was last told to say ('safe': WEAPONS SAFE, 'locked': the switch refused in flight), and when */
  said: '' | 'safe' | 'locked'
  saidAt: number
}

export function createPower(): Power {
  return { on: true, level: 1, ask: false, said: '', saidAt: -99 }
}

/** true once the power is all the way up: the throttle works, the ship may lift off or undock */
export const powered = (scene: SceneState) => scene.power.on && scene.power.level >= 1

/** how the power stands, in words, for the page (its buttons, and the sounds to come) */
export function powerState(scene: SceneState): 'off' | 'starting' | 'on' | 'stopping' {
  const p = scene.power
  if (p.on) return p.level >= 1 ? 'on' : 'starting'
  return p.level > 0 ? 'stopping' : 'off'
}

/** the ship shut down where it stands (set down for its pilot, or left by him): only with the coldStart setting */
export function shutDown(scene: SceneState) {
  if (!scene.params.coldStart) return
  scene.power.on = false
  scene.power.level = 0
}

/** the switch thrown on: the power-up begins (nothing if it is on already) */
export function switchOn(scene: SceneState) {
  const p = scene.power
  if (p.on) return
  p.on = true
  const j = scene.jets[0]
  sound(scene, 'powerUp', j.x, j.y, j.z, 1, true)
}

/** the HUD is told to say something (false: it said the same a moment ago, and is not to say it again yet) */
export function tell(scene: SceneState, what: Power['said']) {
  const p = scene.power
  if (p.said === what && scene.time - p.saidAt < POWER.told) return false
  p.said = what
  p.saidAt = scene.time
  return true
}

/** one step: the switch, and the power coming up or going down */
export function stepPower(scene: SceneState, dt: number) {
  const p = scene.power
  const L = scene.loop.landing
  const j = scene.jets[0]
  const aboard = scene.foot.stage === ABOARD && scene.zone.kind !== 'interior' && scene.eject.stage === EJ_FLY && !j.away
  if (p.ask && aboard) {
    if (!p.on) switchOn(scene)
    else if (L.stage === LANDED) {
      p.on = false
      sound(scene, 'powerDown', j.x, j.y, j.z, 1, true)
    } else if (tell(scene, 'locked')) sound(scene, 'refused', j.x, j.y, j.z, 1, true)
  }
  p.ask = false
  // (in the air, by whatever way it got there, a ship has its power)
  if (L.stage === FLYING) {
    p.on = true
    p.level = 1
    return
  }
  p.level = clamp(p.level + (p.on ? dt / POWER.up : -dt / POWER.down), 0, 1)
}
