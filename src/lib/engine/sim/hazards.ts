// What a world does to the ships over it (the recipe's weather and hazards): the wind pushes
// them about, gusting in a storm; lightning strikes in a storm and hurts whatever is near; lava,
// or an acid swamp, burns a ship that flies low over it. Fog, snow, dust and ash cut how far
// can be seen: that is drawn (render/weather.ts), not done.

import type { WorldRecipe, Weather as WeatherKind } from '../galaxy/recipe'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp, hash8 } from '../util/math'
import { NM, NSHIFT } from '../world/world'
import { harm, LEADER, type Fighter, PARKED, TURRET, WALKER } from './combat'
import { addSpark, SPARK_HULL, sound } from './effects'
import { ABOARD } from './foot'
import { grounded } from './landing'
import { addSmoke } from './particles'
import { chance } from './pilots'

/** how high over lava (or acid) its heat reaches, px */
export const HEAT_REACH = { lava: 30, acid: 16 }
/** damage a second from it, dealt in ticks of this many seconds */
const HEAT_DAMAGE = { lava: 16, acid: 9 }
const HEAT_TICK = 0.25
/** how far from a strike lightning hurts a ship, px, and how much */
const BOLT_REACH = 30
const BOLT_DAMAGE = 24
/** seconds a strike is seen for */
export const BOLT_LIFE = 0.45

export interface Bolt {
  x: number
  y: number
  /** scene seconds it struck at */
  t: number
  /** a number of its own, for the shape of its zigzag */
  seed: number
}

export interface Weather {
  kind: WeatherKind
  /** the steady wind, px per second, and the wind now (it gusts in a storm) */
  baseX: number
  baseY: number
  windX: number
  windY: number
  /** seconds to the next strike of lightning (none unless there is a storm), and the strikes being seen */
  nextBolt: number
  bolts: Bolt[]
  /** scene seconds the player's ship was last burned, by lava or acid */
  burnedAt: number
  /** 0..1: how far a whiteout has closed in (snow only), and the scene seconds the next one starts and how long it lasts */
  whiteout: number
  whiteoutAt: number
  whiteoutFor: number
  /** chance numbers, for where lightning strikes and when a whiteout comes */
  rng: number
}

/** seconds a whiteout takes to close in, and to clear */
const WHITEOUT_EDGE = 3

/** how hard the wind blows in each weather, px per second */
const WIND: Record<WeatherKind, number> = { clear: 0, rain: 6, storm: 16, fog: 0, snow: 8, dust: 14, ash: 5 }

export function createWeather(r: WorldRecipe | null): Weather {
  const kind = r?.weather ?? 'clear'
  // (the wind's way, from the world's seed: a share of a turn, by an eighth)
  const way = r ? (r.seed >>> 8) & 7 : 0
  const dirs = [
    [1, 0],
    [0.7071, 0.7071],
    [0, 1],
    [-0.7071, 0.7071],
    [-1, 0],
    [-0.7071, -0.7071],
    [0, -1],
    [0.7071, -0.7071],
  ]
  const w = WIND[kind]
  return {
    kind,
    baseX: dirs[way][0] * w,
    baseY: dirs[way][1] * w,
    windX: dirs[way][0] * w,
    windY: dirs[way][1] * w,
    nextBolt: kind === 'storm' ? 3 : -1,
    bolts: [],
    burnedAt: -99,
    whiteout: 0,
    whiteoutAt: kind === 'snow' ? 12 : -1,
    whiteoutFor: 9,
    rng: (r?.seed ?? 1) | 0,
  }
}

/** the hot sea under a point (lava or acid), or null */
function hotSeaAt(scene: SceneState, x: number, y: number): 'lava' | 'acid' | null {
  const w = scene.world
  const sea = w.look.sea
  if (sea !== 'lava' && sea !== 'acid') return null
  return w.mat[(((y | 0) & NM) << NSHIFT) | ((x | 0) & NM)] < 4 ? sea : null
}

/** how high a computer's pilot keeps over the ground ahead of it to stay clear of lava or acid (0: none to fear) */
export function heatFloor(scene: SceneState, j: Jet, speed: number) {
  const sea = scene.world.look.sea
  if (sea !== 'lava' && sea !== 'acid') return 0
  const sn = Math.sin(j.yaw)
  const cs = Math.cos(j.yaw)
  for (let i = 0; i <= 3; i++) {
    const d = speed * 0.25 * i
    if (hotSeaAt(scene, j.x + sn * d, j.y - cs * d)) return HEAT_REACH[sea] + 6
  }
  return 0
}

/** a ship over lava or acid, low enough to feel it: burned a little at a time */
function heat(scene: SceneState, dt: number) {
  for (const f of scene.fighters) {
    if (!f.alive || f.remote) continue
    const j = f.jet
    const sea = hotSeaAt(scene, j.x, j.y)
    if (!sea || j.z > HEAT_REACH[sea]) {
      f.heatTick = 0
      continue
    }
    f.heatTick += dt
    // (lower is hotter)
    const close = 1 + (1 - j.z / HEAT_REACH[sea])
    if (f.heatTick < HEAT_TICK) continue
    f.heatTick -= HEAT_TICK
    if (f.kind === LEADER) {
      scene.weather.burnedAt = scene.time
      sound(scene, 'burn', j.x, j.y, j.z, 1, true, sea)
    }
    harm(scene, f, HEAT_DAMAGE[sea] * HEAT_TICK * close, null, j.x, j.y, j.z - 2)
    // sparks and smoke rising off the hull
    addSpark(
      scene,
      j.x,
      j.y,
      j.z - 1,
      (hash8(scene.effects.count++) - 128) * 0.2,
      (hash8(scene.effects.count++) - 128) * 0.2,
      30,
      SPARK_HULL,
    )
    addSmoke(scene, j.x, j.y, j.z - 3, 1.6, j.vx * 0.2, j.vy * 0.2, 0.7, 0.9, sea === 'lava' ? 3 : 1)
  }
}

/** true for what stands on the ground, which the wind leaves where it is: a turret, a pilot on foot, a ship left
 * parked, and the player's own ship landed (coming down, resting or lifting off) or with him out of it */
function standing(scene: SceneState, f: Fighter) {
  if (f.kind === TURRET || f.kind === WALKER || f.kind === PARKED) return true
  return f.kind === LEADER && (grounded(scene) || scene.foot.stage !== ABOARD)
}

/** the wind: everything in the air drifts with it */
function wind(scene: SceneState, dt: number) {
  const w = scene.weather
  if (w.baseX === 0 && w.baseY === 0) return
  // gusts: strong in a storm, a little in anything else
  const t = scene.time
  const gust = w.kind === 'storm' ? 1 + 0.9 * Math.sin(t * 0.83) * Math.sin(t * 0.31 + 1) : 1 + 0.3 * Math.sin(t * 0.4)
  w.windX = w.baseX * gust
  w.windY = w.baseY * gust
  for (const f of scene.fighters) {
    if (!f.alive || f.remote || standing(scene, f)) continue
    f.jet.x += w.windX * dt
    f.jet.y += w.windY * dt
  }
  // a storm shakes the player's ship
  if (w.kind === 'storm') scene.rig.shake = Math.max(scene.rig.shake, clamp((gust - 1.4) * 0.12, 0, 0.08))
}

/** lightning, in a storm: now and then, somewhere near the player; it hurts whatever is close */
function lightning(scene: SceneState, dt: number) {
  const w = scene.weather
  const now = scene.time
  while (w.bolts.length && now - w.bolts[0].t > BOLT_LIFE) w.bolts.shift()
  if (w.nextBolt < 0) return
  w.nextBolt -= dt
  if (w.nextBolt > 0) return
  w.nextBolt = 2.5 + chance(w) * 6
  const p = scene.jets[0]
  const x = p.x + (chance(w) - 0.5) * 520
  const y = p.y + (chance(w) - 0.5) * 360
  w.bolts.push({ x, y, t: now, seed: (chance(w) * 65536) | 0 })
  sound(scene, 'thunder', x, y, 60, 1)
  for (const f of scene.fighters) {
    if (!f.alive || f.remote) continue
    const dx = f.jet.x - x
    const dy = f.jet.y - y
    if (dx * dx + dy * dy < BOLT_REACH * BOLT_REACH) harm(scene, f, BOLT_DAMAGE, null, f.jet.x, f.jet.y, f.jet.z)
  }
}

/** whiteouts, in snow: every half a minute or so the snow thickens until little can be seen, then clears */
function whiteouts(scene: SceneState) {
  const w = scene.weather
  if (w.whiteoutAt < 0) return
  const t = scene.time - w.whiteoutAt
  w.whiteout =
    t < 0
      ? 0
      : t < WHITEOUT_EDGE
        ? t / WHITEOUT_EDGE
        : t < w.whiteoutFor - WHITEOUT_EDGE
          ? 1
          : clamp((w.whiteoutFor - t) / WHITEOUT_EDGE, 0, 1)
  if (t > w.whiteoutFor) {
    w.whiteoutAt = scene.time + 18 + chance(w) * 24
    w.whiteoutFor = 8 + chance(w) * 6
  }
}

/** one step of the world's weather and hazards */
export function stepHazards(scene: SceneState, dt: number) {
  if (scene.introT < 1.9) return
  wind(scene, dt)
  lightning(scene, dt)
  heat(scene, dt)
  whiteouts(scene)
}
