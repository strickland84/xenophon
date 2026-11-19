// The engines' exhaust: how long the flames are, and how they bend. (They left dark smoke hanging behind every ship
// until James's first flight, 2026-11-18: he asked for it gone.)

import type { Jet } from '../jet/jet'
import type { HullData } from '../jet/model'
import type { SceneState } from '../state'
import { clamp } from '../util/math'

/** how long a ship's afterburner flames are, in its own pixels (before the flicker), with its engines lit `burn` and its thrusters open `boost` */
export function flameLength(scene: SceneState, model: HullData, burn: number, boost: number) {
  const p = scene.params
  return (0.07 + 0.17 * p.afterburner) * model.l * burn * clamp(1.6 - scene.spread * 0.6, 0, 1) * (1 + 1.6 * boost)
}

/** how far a jet's flames bend: the exhaust trails round the inside of a turn */
export function flameBend(scene: SceneState, j: Jet | undefined) {
  const p = scene.params
  return j ? clamp(j.yawRate / Math.max(0.1, p.agility), -1, 1) * 0.36 : 0
}
