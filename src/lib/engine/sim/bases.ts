// The bases, as they act: where a pilot begins (landed on a pad of a base of his side, or
// of nobody's), and their turrets.
//
// Turrets: every base's guard the sky over it. A base of the player's side, or nobody's, fires
// at the computer's raiders and at the other side's patrols; a base of the other side fires at
// the player as well, and at his side's patrols. Each game runs the turrets only against its own
// pilot and the computer's ships it flies itself, so in a shared sky no hit is decided twice. A
// turret cannot be fought. (The raiders a load draws in are bands now, waiting on the way home:
// sim/bands.ts.)

import { TURRET } from '../data/loop'
import { meshOf } from '../jet/mesh'
import { makeJet } from '../jet/jet'
import { createPaint } from '../render/paint'
import type { SceneState } from '../state'
import { clamp, wrapAngle } from '../util/math'
import type { Base } from '../world/features'
import { createFighter, ownFighter, SIDE_ENEMY, SIDE_PLAYER, SIDE_RIVAL, TURRET as TURRET_KIND } from './combat'
import { parkedFighter, walkerFighter } from './foot'
import type { Fighter } from './combat'
import { jitter } from './effects'
import { leadOn, shotFrom } from './guns'
import type { Aim } from './guns'
import { parkOn } from './landing'
import { friendly, looping, nearestBase, wrapDelta } from './loop'
import { ARMS, stationAngle, stationBase } from './stations'
import { SPACE_Z } from '../data/space'

/** one of a base's turrets */
export interface Turret {
  f: Fighter
  base: Base
  /** which way its gun points (radians, as a ship's heading), and how far it is raised */
  yaw: number
  /** what it is firing at, seconds until it looks again, seconds left of this burst and of the rest after it, and towards the next shot */
  target: Fighter | null
  look: number
  burst: number
  rest: number
  gun: number
  /** a station's (in space): the station's galaxy index, and where round its hub the turret stands (radians from the station's own turn) */
  station?: number
  at?: number
}

/** the turrets of the world's bases (or in space, of the system's stations), made afresh for a zone */
export function makeTurrets(scene: SceneState) {
  const mesh = meshOf('dart')
  const paint = createPaint()
  scene.loop.turrets = []
  if (scene.zone.kind === 'space') {
    stationTurrets(scene, mesh, paint)
    return
  }
  for (const base of scene.world.features.bases)
    for (const t of base.turrets) {
      // (a base of the other side's fights the player; the rest are on his side)
      const f = createFighter(TURRET_KIND, friendly(scene, base) ? SIDE_PLAYER : SIDE_RIVAL, makeJet(t.x, t.y, t.z, 0), mesh, paint)
      f.protect = 0
      scene.loop.turrets.push({ f, base, yaw: (t.x * 7 + t.y * 3) % 6.28, target: null, look: 0, burst: 0, rest: 0.5, gun: 0 })
    }
}

/**
 * A station's turrets (the polish pass, item 5: stations had none): round its hub between its arms,
 * four on a capital and three on an outpost; a derelict has none. As a base's on a world, a station
 * of the player's side, or nobody's, fires on raiders and the other side's patrols; one of the
 * other side's fires on him too.
 */
function stationTurrets(scene: SceneState, mesh: ReturnType<typeof meshOf>, paint: ReturnType<typeof createPaint>) {
  for (const b of scene.space.bodies) {
    if (b.body.kind !== 'base' || b.body.role === 'derelict') continue
    const base = stationBase(scene, b)
    const n = b.body.role === 'capital' ? ARMS.capital : ARMS.outpost
    for (let k = 0; k < n; k++) {
      const f = createFighter(TURRET_KIND, friendly(scene, base) ? SIDE_PLAYER : SIDE_RIVAL, makeJet(b.x, b.y, SPACE_Z, 0), mesh, paint)
      f.protect = 0
      const at = ((k + 0.5) * Math.PI * 2) / n
      scene.loop.turrets.push({ f, base, yaw: at, target: null, look: 0, burst: 0, rest: 0.5, gun: 0, station: b.body.index, at })
    }
  }
  placeStationTurrets(scene)
}

/** a station's turrets ride round with it (it turns to its sun and goes round its world) */
export function placeStationTurrets(scene: SceneState) {
  for (const t of scene.loop.turrets) {
    if (t.station === undefined) continue
    const b = scene.space.bodies.find((x) => x.body.index === t.station)
    if (!b) continue
    const a = stationAngle(b) + (t.at ?? 0)
    const r = b.body.size * TURRET_OUT
    t.f.jet.x = b.x + Math.cos(a) * r
    t.f.jet.y = b.y + Math.sin(a) * r
    t.f.jet.z = SPACE_Z
  }
}
/** how far out on a station's hub its turrets stand, as a share of its size */
export const TURRET_OUT = 0.62

/** where a pilot begins, in the loop: landed on a pad of a base of his side, or else the nearest of nobody's (alone: as before, in the air) */
export function startAtBase(scene: SceneState) {
  makeTurrets(scene)
  if (!looping(scene)) return
  const side = scene.params.side
  const bases = scene.world.features.bases
  const own = bases.find((b) => b.owner === side)
  const home = own ?? nearestBase(scene, scene.world.spawnX, scene.world.spawnY)?.base
  if (home) parkOn(scene, home)
}

// scratch
const aim: Aim = { x: 0, y: 0, z: 0 }

/** a turret's choice: within reach, the player (if its base is of the other side), or the nearest raider or patrol of the other side this game flies (never a training drone) */
function chooseTarget(scene: SceneState, t: Turret): Fighter | null {
  const f = t.f
  const range2 = TURRET.range * TURRET.range
  const dist2 = (o: Fighter) => {
    const dx = wrapDelta(o.jet.x - f.jet.x)
    const dy = wrapDelta(o.jet.y - f.jet.y)
    const dz = o.jet.z - f.jet.z
    return dx * dx + dy * dy + dz * dz
  }
  if (f.side === SIDE_RIVAL) {
    // (the player: in his ship, or on foot and not hidden, or the ship he left standing)
    const own = ownFighter(scene) ?? (scene.foot.walker.hidden ? null : walkerFighter(scene)) ?? parkedFighter(scene)
    if (own && own.protect <= 0 && dist2(own) < range2) return own
  }
  let best: Fighter | null = null
  let bestD = range2
  for (const o of scene.fighters) {
    // (a training drone is the new pilot's to shoot, not the base's)
    const foe = o.side === SIDE_ENEMY || (o.band >= 0 && o.side !== f.side)
    if (!foe || !o.alive || o.remote || o.drill) continue
    const d = dist2(o)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/** the turrets look for targets, turn their guns, and fire in bursts */
export function stepTurrets(scene: SceneState, dt: number) {
  if (scene.introT < 2) return
  for (const t of scene.loop.turrets) {
    const f = t.f
    t.look -= dt
    if (t.look <= 0 || (t.target && !t.target.alive)) {
      t.look = 0.4
      t.target = chooseTarget(scene, t)
    }
    const target = t.target
    if (!target || !target.alive) {
      t.burst = 0
      continue
    }
    leadOn(f, target, TURRET.lead, aim)
    const want = Math.atan2(aim.x, -aim.y)
    const err = wrapAngle(want - t.yaw)
    t.yaw += clamp(err, -3 * dt, 3 * dt)
    if (t.burst > 0) {
      t.burst -= dt
      t.gun += dt * TURRET.rate
      while (t.gun >= 1) {
        t.gun -= 1
        const wob = jitter(scene, 61) * TURRET.aim
        const c = Math.cos(wob)
        const s = Math.sin(wob)
        const ax = aim.x * c - aim.y * s
        const ay = aim.x * s + aim.y * c
        const dmg = 7 * (t.base.capital ? TURRET.capital : TURRET.outpost)
        shotFrom(
          scene,
          f,
          f.jet.x + Math.sin(t.yaw) * 3,
          f.jet.y - Math.cos(t.yaw) * 3,
          f.jet.z + 1,
          { x: ax, y: ay, z: aim.z + jitter(scene, 63) * TURRET.aim },
          dmg,
        )
      }
    } else {
      t.rest -= dt
      if (t.rest <= 0 && Math.abs(err) < 0.2) {
        t.burst = TURRET.burst
        t.rest = TURRET.pause
        t.gun = 0.99
      }
    }
  }
}
