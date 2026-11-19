// One aircraft: where it is, which way it points, and the trails it leaves.

import { clamp } from '../util/math'
import type { SceneParams } from '../params'
import type { HullData } from './model'
import type { Fighter } from '../sim/combat'

/** points kept in each wingtip trail */
export const TRAIL_N = 160
/** the most engines a ship has */
export const ENGINES_MAX = 8
/** how far apart a ship's slices are drawn overhead, against behind it and in the seat (where they are a px apart) */
export const OVERHEAD_SPREAD = 0.5

/** how far apart a ship's slices are drawn now, in its own px: closer overhead, a px apart from behind and in the seat
 * (`spread` the scene's, `seen` how far the view is from behind or in the seat, 0..1). Each slice stands so far over its
 * belly: slice `y` is `y × this − pivotY` above the pivot. */
export const sliceSpread = (spread: number, seen: number) => spread * (OVERHEAD_SPREAD + (1 - OVERHEAD_SPREAD) * Math.min(1, seen))

export interface Jet {
  x: number
  y: number
  z: number
  yaw: number
  yawRate: number
  roll: number
  pitch: number
  stunt: number // 0..1 progress of an aileron roll, -1 idle
  stuntDir: number
  stuntDelay: number
  vx: number
  vy: number
  trail: Float32Array[] // [left, right] ring buffers of x,y,z,t
  trailHead: number
  trailLen: number
  g: number // how hard it is turning, 0..1 (smoothed)
  lastTrailX: number
  lastTrailY: number
  lid: number // the canopy: 0 shut … 1 standing open
  glass: boolean // false once the canopy has been blown off
  away: boolean // true while it is not in the scene yet (a jet on its way)
  flameSeen: Float32Array // per smooth flame (one an engine): how much of its nozzle, middle and tip was in view, eased
  fighter: Fighter | null // how it fights (hull, shield, guns), if it can
}

export function makeJet(x: number, y: number, z: number, yaw: number): Jet {
  return {
    x,
    y,
    z,
    yaw,
    yawRate: 0,
    roll: 0,
    pitch: 0,
    stunt: -1,
    stuntDir: 1,
    stuntDelay: 0,
    vx: 0,
    vy: 0,
    trail: [new Float32Array(TRAIL_N * 4), new Float32Array(TRAIL_N * 4)],
    trailHead: 0,
    trailLen: 0,
    g: 0,
    lastTrailX: x,
    lastTrailY: y,
    lid: 0,
    glass: true,
    away: false,
    flameSeen: new Float32Array(ENGINES_MAX * 3).fill(1),
    fighter: null,
  }
}

/** how far through a full roll a jet is, as an angle (0 when it is not rolling) */
export function spinOf(j: Jet) {
  if (j.stunt < 0 || j.stuntDelay > 0) return 0
  const t = j.stunt
  return j.stuntDir * Math.PI * 2 * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
}
/** a jet's bank angle, including any roll it is half-way through */
export function rollOf(j: Jet) {
  return j.roll + spinOf(j)
}

/** the jet's own axes in the world (x right, y down the map, z up): r along the right wing, f forward, u up */
export function axes(j: Jet) {
  const cs = Math.cos(j.yaw)
  const sn = Math.sin(j.yaw)
  const roll = rollOf(j)
  const cr = Math.cos(roll)
  const sr = Math.sin(roll)
  // right wing dips for a positive roll
  const rx = cs * cr
  const ry = sn * cr
  const rz = -sr
  const u2x = cs * sr
  const u2y = sn * sr
  const u2z = cr
  const cp = Math.cos(j.pitch)
  const sp = Math.sin(j.pitch)
  const fx = sn * cp + u2x * sp
  const fy = -cs * cp + u2y * sp
  const fz = u2z * sp
  const ux = u2x * cp - sn * sp
  const uy = u2y * cp + cs * sp
  const uz = u2z * cp
  return { rx, ry, rz, fx, fy, fz, ux, uy, uz, cr }
}

export type JetAxes = ReturnType<typeof axes>

/** size of the jet against the world */
export const jetSize = (p: SceneParams) => clamp(p.jetScale || 1, 0.4, 2)
/** where a wingman sits: off to one side of the leader … */
export const formX = (p: SceneParams, m: HullData) => m.w * 1.2 * jetSize(p) + 2
/** … and behind it */
export const formY = (p: SceneParams, m: HullData) => m.l * 0.74 * jetSize(p)
