// Signals a pilot on foot can make (Phase 5): a flare, fired up into the sky, that burns for a
// while and can be seen from far off; and a beacon, planted in the ground, that stands for a
// long while with his callsign over it (one each: planting another moves it). A beacon is only
// a marker for now (flags and territory are a later phase). Others see both: the network says
// where (Scene.addFlare, addBeacon).

import { BEACON, FLARE } from '../data/foot'
import type { SceneState } from '../state'
import { pack } from '../util/color'
import { groundAt } from '../world/world'
import { sound } from './effects'
import { addSmoke } from './particles'
import { report } from './room'
import { deed } from './traces'

export interface Flare {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** scene time it was fired, and its colour */
  born: number
  col: number
}

export interface Beacon {
  /** whose: '' the player's own, or another pilot's name for it (the network's) */
  owner: string
  x: number
  y: number
  z: number
  /** the callsign over it, and the colour of its light */
  label: string
  col: number
  born: number
}

export interface Signals {
  flares: Flare[]
  beacons: Beacon[]
}

export const createSignals = (): Signals => ({ flares: [], beacons: [] })

/** the colour of the player's side's flares and beacons (red for one he cannot place) */
const SIDE_LIGHT: Record<string, number> = { nomarchy: pack(255, 214, 90), anarchoi: pack(196, 150, 255), '': pack(255, 90, 70) }

/** a flare goes up from (x, y, z); `own`: the player's (the others are told) */
export function launchFlare(
  scene: SceneState,
  x: number,
  y: number,
  z: number,
  own: boolean,
  col = SIDE_LIGHT[scene.params.side] ?? SIDE_LIGHT[''],
) {
  const list = scene.signals.flares
  const n = scene.effects.count++
  list.push({ x, y, z, vx: ((n * 37) % 11) - 5, vy: ((n * 53) % 11) - 5, vz: FLARE.up, born: scene.time, col })
  if (list.length > 12) list.shift()
  sound(scene, 'flare', x, y, z, 1, own)
  if (own) report(scene, { kind: 'flare', x, y, z })
}

/** a beacon is planted at (x, y, z): `owner` '' for the player's own (the others are told), else whose it is */
export function plantBeacon(
  scene: SceneState,
  x: number,
  y: number,
  z: number,
  own: boolean,
  owner = '',
  label = '',
  col = SIDE_LIGHT[scene.params.side] ?? SIDE_LIGHT[''],
) {
  const list = scene.signals.beacons
  const at = list.findIndex((b) => b.owner === owner)
  if (at >= 0) list.splice(at, 1)
  list.push({ owner, x, y, z, label, col, born: scene.time })
  if (list.length > 24) list.shift()
  sound(scene, 'beacon', x, y, z, 1, own)
  if (own) {
    report(scene, { kind: 'beacon', x, y, z })
    // (it stands for two weeks, with the phrase chosen for it: traces.ts)
    if (scene.params.side) deed(scene, { kind: 'beacon', x, y, z, n: scene.traces.phrase })
  }
}

/** flares rise, slow, and hang burning as they fall; old beacons go */
export function stepSignals(scene: SceneState, dt: number) {
  const { flares, beacons } = scene.signals
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]
    const age = scene.time - f.born
    if (age > FLARE.life) {
      flares.splice(i, 1)
      continue
    }
    // up fast, then hanging under its little chute, drifting down
    f.vz += (age < 1.2 ? -120 : (-8 - f.vz) * 3) * dt
    f.x += f.vx * dt
    f.y += f.vy * dt
    f.z = Math.max(groundAt(scene.world, f.x, f.y) + 1, f.z + f.vz * dt)
    if (((scene.time * 20) | 0) % 2 === 0) addSmoke(scene, f.x, f.y, f.z, 1.2, 0, 0, 0.7, 1.2, 1)
  }
  for (let i = beacons.length - 1; i >= 0; i--) if (scene.time - beacons[i].born > BEACON.life) beacons.splice(i, 1)
}
