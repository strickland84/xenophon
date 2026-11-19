// The cannon: fast shots along the ship's nose, in three dimensions. Each mount fires in turn;
// firing heats the guns, and too much heat jams them for a moment. The player's shots are
// turned onto a target that is nearly in line (a small aim-assist cone), so a pointer, keys,
// and a controller can all hit. Shots fly on, and strike the first enemy hull they
// pass through, or the ground. Shots from a ship another game owns (room.ts) do no harm here:
// they show, and pass through; that game decides what they hit.

import { CANNON, SPLASH } from '../data/weapons'
import { BEAM, FLAK } from '../data/loadout'
import { LAUNCHER } from '../data/gear'
import { FOOT, SIDEARM } from '../data/foot'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import { groundAt, wetAt } from '../world/world'
import { rockAt, struckRock } from './belts'
import { creatureOnPath, strikeCreature } from './creatures'
import { harm, LEADER, muzzle, muzzleOf, WALKER } from './combat'
import type { Fighter } from './combat'
import {
  addSpark,
  addStar,
  jitter,
  sound,
  SPARK_GROUND,
  SPARK_HULL,
  SPARK_SHIELD,
  SPARK_WATER,
  STAR_HIT,
  STAR_MUZZLE,
  STAR_MUZZLE_FOE,
  STAR_SHIELD,
} from './effects'

export const SHOT_N = 320 // shots in the air at once
export const SHOT_F = 10 // per shot: x y z, speed x y z, when it was fired (−99: spent), its side, its damage (0: it only shows), what it is
export const SHOT_CANNON = 0 // a ship's cannon (or a turret's)
export const SHOT_BOLT = 1 // a pilot's sidearm: slower, shorter-lived, weak against a ship
export const SHOT_FLAK = 2 // a pellet of a flak pod's burst
export const SHOT_LASER = 3 // a pulse of a mining laser
export const SHOT_ROCKET = 4 // a rocket from a pilot's launcher: hurts a ship, less a pilot

export interface Guns {
  shots: Float32Array
  /** who fired each shot (so a kill is known to be the player's) */
  by: (Fighter | null)[]
  head: number
}

export function createGuns(): Guns {
  const shots = new Float32Array(SHOT_N * SHOT_F)
  for (let i = 0; i < SHOT_N; i++) shots[i * SHOT_F + 6] = -99
  return { shots, by: new Array(SHOT_N).fill(null), head: 0 }
}

/** a direction, worked out by noseOf and leadOn */
export interface Aim {
  x: number
  y: number
  z: number
}

/** which way a fighter's nose points: along its heading, tilted up or down by its climb */
export function noseOf(f: Fighter, out: Aim) {
  const j = f.jet
  const along = Math.hypot(j.vx, j.vy)
  const climb = Math.atan2(f.vz, Math.max(20, along))
  // (a ship flown free in space, over on its back, goes the other way from its heading: spaceflight.ts)
  const c = Math.cos(j.pitch) < 0 ? -Math.cos(climb) : Math.cos(climb)
  out.x = Math.sin(j.yaw) * c
  out.y = -Math.cos(j.yaw) * c
  out.z = Math.sin(climb)
  return out
}

/**
 * The way to aim from `f` to hit `t`, with its shots' speed: where `t` will be by the time a
 * shot gets there, allowing for `lead` (0..1) of its movement. Left in `out` (a unit
 * direction); returns the distance to that point.
 */
export function leadOn(f: Fighter, t: Fighter, lead: number, out: Aim) {
  const a = f.jet
  const b = t.jet
  const rx = b.x - a.x
  const ry = b.y - a.y
  const rz = b.z - a.z
  // the shot carries the shooter's own speed: what matters is how the target moves against it
  const vx = (b.vx - a.vx) * lead
  const vy = (b.vy - a.vy) * lead
  const vz = (t.vz - f.vz) * lead
  let time = Math.hypot(rx, ry, rz) / CANNON.speed
  let px = rx
  let py = ry
  let pz = rz
  for (let i = 0; i < 3; i++) {
    px = rx + vx * time
    py = ry + vy * time
    pz = rz + vz * time
    time = Math.hypot(px, py, pz) / CANNON.speed
  }
  const d = Math.max(1e-6, Math.hypot(px, py, pz))
  out.x = px / d
  out.y = py / d
  out.z = pz / d
  return d
}

// scratch
const nose: Aim = { x: 0, y: 0, z: 0 }
const toward: Aim = { x: 0, y: 0, z: 0 }
const best: Aim = { x: 0, y: 0, z: 0 }

const off = { across: 0, up: 0 }
/** how far a direction is from the nose: across (radians, + to the right) and up (radians) */
export function offNose(n: Aim, d: Aim) {
  const hn = Math.atan2(n.x, -n.y)
  const hd = Math.atan2(d.x, -d.y)
  let across = hd - hn
  across -= Math.PI * 2 * Math.round(across / (Math.PI * 2))
  const up = Math.atan2(d.z, Math.hypot(d.x, d.y)) - Math.atan2(n.z, Math.hypot(n.x, n.y))
  off.across = across
  off.up = up
  return off
}

/**
 * The aim assist: the player's nose, turned onto the enemy whose lead point is nearest to it
 * within the assist cone (the nose itself if there is none). Left in `out`.
 */
export function assistedAim(scene: SceneState, f: Fighter, out: Aim) {
  noseOf(f, nose)
  out.x = nose.x
  out.y = nose.y
  out.z = nose.z
  let bestScore = 1e9
  for (const t of scene.fighters) {
    if (t.side === f.side || !t.alive) continue
    const d = leadOn(f, t, 1, toward)
    if (d > CANNON.assistRange) continue
    const o = offNose(nose, toward)
    const across = Math.abs(o.across) / CANNON.assistAcross
    const up = Math.abs(o.up) / CANNON.assistUp
    if (across > 1 || up > 1) continue
    const score = across + up * 0.5
    if (score < bestScore) {
      bestScore = score
      best.x = toward.x
      best.y = toward.y
      best.z = toward.z
    }
  }
  if (bestScore < 1e9) {
    out.x = best.x
    out.y = best.y
    out.z = best.z
  }
  return out
}

/** shots a second from one mount of each kind of gun, and the heat a second of its fire builds (as the cannon's builds) */
const RATE: Record<string, number> = { cannon: CANNON.rate, flak: FLAK.rate, laser: BEAM.rate }
const HEAT: Record<string, number> = { cannon: 1, flak: FLAK.heat, laser: 0 }

/** the guns cool and come unjammed; a held trigger fires, if they are ready (each gun mount in turn, each at its own pace) */
export function stepGun(scene: SceneState, f: Fighter, dt: number, firing: boolean, aim: Aim) {
  const guns = f.gunMounts.length
  if (f.gunWait > 0) f.gunWait -= dt
  if (f.jam > 0) {
    f.jam -= dt
    f.heat = Math.max(0, f.heat - CANNON.cool * f.cool * 2 * dt)
    return
  }
  f.heat = Math.max(0, f.heat - CANNON.cool * f.cool * dt)
  if (!firing || guns === 0) return
  // firing ends a new ship's protection
  f.protect = 0
  while (f.gunWait <= 0) {
    const mount = f.gunMounts[f.barrel % guns]
    const kind = f.weapons[mount]
    const per = 1 / (RATE[kind] * guns)
    f.gunWait += per
    fire(scene, f, aim, kind, mount)
    f.heat += CANNON.heat * HEAT[kind] * per * f.heatMul
    if (f.heat >= 1) {
      f.heat = 1
      f.jam = CANNON.jam
      if (f.kind === LEADER) sound(scene, 'overheat', f.jet.x, f.jet.y, f.jet.z, 1, true)
      return
    }
  }
}

/** one shot from the next gun in turn: a cannon's shell, a burst of flak, or a pulse of the mining laser */
function fire(scene: SceneState, f: Fighter, aim: Aim, kind = 'cannon', mount = f.barrel) {
  f.barrel++
  if (kind !== 'cannon') {
    fireOther(scene, f, aim, kind, mount)
    return
  }
  const g = scene.guns
  const j = f.jet
  muzzleOf(scene, f, mount)
  const s = CANNON.spread
  let dx = aim.x + jitter(scene, 11) * s
  let dy = aim.y + jitter(scene, 13) * s
  let dz = aim.z + jitter(scene, 17) * s
  const d = Math.hypot(dx, dy, dz)
  dx /= d
  dy /= d
  dz /= d
  const o = g.head * SHOT_F
  const sh = g.shots
  sh[o] = muzzle.x
  sh[o + 1] = muzzle.y
  sh[o + 2] = muzzle.z
  sh[o + 3] = j.vx + dx * CANNON.speed
  sh[o + 4] = j.vy + dy * CANNON.speed
  sh[o + 5] = f.vz + dz * CANNON.speed
  sh[o + 6] = scene.time
  sh[o + 7] = f.side
  sh[o + 8] = f.remote ? 0 : CANNON.damage * (f.brain ? f.brain.skill.damage : 1)
  sh[o + 9] = SHOT_CANNON
  f.firedAt = scene.time
  g.by[g.head] = f
  g.head = (g.head + 1) % SHOT_N
  addStar(scene, muzzle.x, muzzle.y, muzzle.z, 1, f.side === 0 ? STAR_MUZZLE : STAR_MUZZLE_FOE)
  sound(scene, 'cannon', muzzle.x, muzzle.y, muzzle.z, 1, f.kind === LEADER)
}

/** a burst of flak (pellets in a wide spread, short-lived), or a pulse of the mining laser (quick, weak, never hot) */
function fireOther(scene: SceneState, f: Fighter, aim: Aim, kind: string, mount: number) {
  const g = scene.guns
  const j = f.jet
  muzzleOf(scene, f, mount)
  const flak = kind === 'flak'
  const n = flak ? FLAK.pellets : 1
  const spread = flak ? FLAK.spread : CANNON.spread
  const speed = flak ? FLAK.speed : BEAM.speed
  const damage = (flak ? FLAK.damage : BEAM.damage) * (f.brain ? f.brain.skill.damage : 1)
  for (let p = 0; p < n; p++) {
    let dx = aim.x + jitter(scene, 11 + p * 7) * spread
    let dy = aim.y + jitter(scene, 13 + p * 7) * spread
    let dz = aim.z + jitter(scene, 17 + p * 7) * spread * 0.5
    const d = Math.hypot(dx, dy, dz)
    dx /= d
    dy /= d
    dz /= d
    const o = g.head * SHOT_F
    const sh = g.shots
    sh[o] = muzzle.x
    sh[o + 1] = muzzle.y
    sh[o + 2] = muzzle.z
    sh[o + 3] = j.vx + dx * speed
    sh[o + 4] = j.vy + dy * speed
    sh[o + 5] = f.vz + dz * speed
    sh[o + 6] = scene.time
    sh[o + 7] = f.side
    sh[o + 8] = f.remote ? 0 : damage
    sh[o + 9] = flak ? SHOT_FLAK : SHOT_LASER
    g.by[g.head] = f
    g.head = (g.head + 1) % SHOT_N
  }
  f.firedAt = scene.time
  addStar(scene, muzzle.x, muzzle.y, muzzle.z, flak ? 1.4 : 0.6, f.side === 0 ? STAR_MUZZLE : STAR_MUZZLE_FOE)
  sound(scene, flak ? 'flak' : 'laser', muzzle.x, muzzle.y, muzzle.z, 1, f.kind === LEADER)
}

/** how long a shot of each kind flies before it is spent */
export function lifeOf(kind: number) {
  return kind === SHOT_BOLT || kind === SHOT_ROCKET
    ? SIDEARM.life
    : kind === SHOT_FLAK
      ? FLAK.life
      : kind === SHOT_LASER
        ? BEAM.life
        : CANNON.life
}

/** one shot from a point that is not a ship's gun (a base's turret, bases.ts): along `aim`, for `damage` */
export function shotFrom(scene: SceneState, f: Fighter, x: number, y: number, z: number, aim: Aim, damage: number) {
  const g = scene.guns
  const s = CANNON.spread
  let dx = aim.x + jitter(scene, 11) * s
  let dy = aim.y + jitter(scene, 13) * s
  let dz = aim.z + jitter(scene, 17) * s
  const d = Math.hypot(dx, dy, dz)
  dx /= d
  dy /= d
  dz /= d
  const o = g.head * SHOT_F
  const sh = g.shots
  sh[o] = x
  sh[o + 1] = y
  sh[o + 2] = z
  sh[o + 3] = dx * CANNON.speed
  sh[o + 4] = dy * CANNON.speed
  sh[o + 5] = dz * CANNON.speed
  sh[o + 6] = scene.time
  sh[o + 7] = f.side
  sh[o + 8] = damage
  sh[o + 9] = SHOT_CANNON
  f.firedAt = scene.time
  g.by[g.head] = f
  g.head = (g.head + 1) % SHOT_N
  addStar(scene, x, y, z, 1, f.side === 0 ? STAR_MUZZLE : STAR_MUZZLE_FOE)
  sound(scene, 'cannon', x, y, z, 0.8, false)
}

/** a bolt from a pilot's sidearm at (x, y, z), along `aim` (a unit direction); another game's pilot's only shows */
export function boltFrom(scene: SceneState, f: Fighter, x: number, y: number, z: number, aim: Aim, rocket = false) {
  const g = scene.guns
  const s = SIDEARM.spread
  let dx = aim.x + jitter(scene, 11) * s
  let dy = aim.y + jitter(scene, 13) * s
  let dz = aim.z + jitter(scene, 17) * s * 0.5
  const d = Math.hypot(dx, dy, dz)
  dx /= d
  dy /= d
  dz /= d
  const o = g.head * SHOT_F
  const sh = g.shots
  sh[o] = x
  sh[o + 1] = y
  sh[o + 2] = z
  sh[o + 3] = dx * SIDEARM.speed
  sh[o + 4] = dy * SIDEARM.speed
  sh[o + 5] = dz * SIDEARM.speed
  sh[o + 6] = scene.time
  sh[o + 7] = f.side
  sh[o + 8] = f.remote ? 0 : SIDEARM.damage * (rocket ? LAUNCHER.pilot : 1)
  sh[o + 9] = rocket ? SHOT_ROCKET : SHOT_BOLT
  f.firedAt = scene.time
  g.by[g.head] = f
  g.head = (g.head + 1) % SHOT_N
}

/**
 * The look of a shot striking `hit` at (x, y, z): a star and sparks, off the hull (`struck`) or
 * off the shield; (ux, uy) is the way the shot was going, `push` how much the sparks carry on with it.
 */
export function hitFx(
  scene: SceneState,
  hit: Fighter,
  x: number,
  y: number,
  z: number,
  struck: boolean,
  ux: number,
  uy: number,
  push: number,
) {
  if (struck) {
    addStar(scene, x, y, z, 1, STAR_HIT)
    for (let k = 0; k < 3; k++)
      addSpark(
        scene,
        x,
        y,
        z,
        hit.jet.vx - ux * push * 40 + jitter(scene, 3) * 60,
        hit.jet.vy - uy * push * 40 + jitter(scene, 5) * 60,
        20 + jitter(scene, 7) * 40,
        SPARK_HULL,
      )
  } else {
    addStar(scene, x, y, z, 1, STAR_SHIELD)
    for (let k = 0; k < 2; k++)
      addSpark(scene, x, y, z, hit.jet.vx + jitter(scene, 3) * 50, hit.jet.vy + jitter(scene, 5) * 50, jitter(scene, 7) * 40, SPARK_SHIELD)
  }
}

/** a ship's shot struck the ground at (x, y, z): an enemy pilot on foot right by it is hurt by what it throws up */
function splash(scene: SceneState, x: number, y: number, z: number, side: number, damage: number, by: Fighter | null) {
  for (const t of scene.fighters) {
    if (t.kind !== WALKER || t.side === side || !t.alive) continue
    const dx = t.jet.x - x
    const dy = t.jet.y - y
    if (dx * dx + dy * dy > SPLASH.reach * SPLASH.reach || Math.abs(t.jet.z - FOOT.chest - z) > 6) continue
    harm(scene, t, damage * SPLASH.share, by, t.jet.x, t.jet.y, t.jet.z)
  }
}

/** shots fly on: each strikes the first enemy hull it passes through, or the ground, or is spent */
export function stepShots(scene: SceneState, dt: number) {
  const g = scene.guns
  const sh = g.shots
  const world = scene.world
  const space = scene.zone.kind === 'space' && scene.space.rocks.length > 0
  for (let i = 0; i < SHOT_N; i++) {
    const o = i * SHOT_F
    const born = sh[o + 6]
    if (born < -1) continue
    const rocket = sh[o + 9] === SHOT_ROCKET
    const bolt = sh[o + 9] === SHOT_BOLT || rocket
    if (scene.time - born > lifeOf(sh[o + 9])) {
      sh[o + 6] = -99
      continue
    }
    const x0 = sh[o]
    const y0 = sh[o + 1]
    const z0 = sh[o + 2]
    const mx = sh[o + 3] * dt
    const my = sh[o + 4] * dt
    const mz = sh[o + 5] * dt
    const side = sh[o + 7]
    // the first hull along this step's path (a shot that only shows passes through them all)
    let hit: Fighter | null = null
    let hitU = 2
    const len2 = mx * mx + my * my + mz * mz
    for (const t of scene.fighters) {
      if (t.side === side || !t.alive || sh[o + 8] === 0) continue
      const j = t.jet
      // (where the target was at the start of the step, against where the shot was)
      const px = j.x - j.vx * dt - x0
      const py = j.y - j.vy * dt - y0
      const pz = j.z - t.vz * dt - z0
      const ux = mx - j.vx * dt
      const uy = my - j.vy * dt
      const uz = mz - t.vz * dt
      const uu = ux * ux + uy * uy + uz * uz
      const u = uu > 0 ? clamp((px * ux + py * uy + pz * uz) / uu, 0, 1) : 0
      const cx = px - ux * u
      const cy = py - uy * u
      const cz = pz - uz * u
      if (cx * cx + cy * cy + cz * cz < t.radius * t.radius && u < hitU) {
        hit = t
        hitU = u
      }
    }
    // (or a creature of the world, nearer along the path: struck by anything that does harm here)
    const beast = sh[o + 8] > 0 && scene.wild.up.length ? creatureOnPath(scene, x0, y0, z0, mx, my, mz, hitU) : null
    if (beast) {
      const back = 1 / Math.max(1e-6, Math.sqrt(len2))
      const damage = rocket ? sh[o + 8] * 1.5 : sh[o + 8]
      strikeCreature(scene, beast.c, damage, g.by[i], x0 + mx * beast.u, y0 + my * beast.u, z0 + mz * beast.u, mx * back, my * back)
      sh[o + 6] = -99
      continue
    }
    if (hit) {
      const hx = x0 + mx * hitU
      const hy = y0 + my * hitU
      const hz = z0 + mz * hitU
      // (a bolt does a pilot real harm, and a ship only a little)
      const damage =
        rocket && hit.kind !== WALKER
          ? sh[o + 8] > 0
            ? SIDEARM.shipDamage * LAUNCHER.ship
            : 0
          : bolt && hit.kind !== WALKER
            ? (sh[o + 8] * SIDEARM.shipDamage) / SIDEARM.damage
            : sh[o + 8]
      const struck = harm(scene, hit, damage, g.by[i], hx, hy, hz)
      const back = 1 / Math.max(1e-6, Math.sqrt(len2))
      hitFx(scene, hit, hx, hy, hz, struck, mx * back, my * back, 1)
      sh[o + 6] = -99
      continue
    }
    sh[o] = x0 + mx
    sh[o + 1] = y0 + my
    sh[o + 2] = z0 + mz
    // (in space, rocks stop shots: cover)
    if (space && rockAt(scene, sh[o], sh[o + 1])) {
      struckRock(scene, sh[o], sh[o + 1])
      sh[o + 6] = -99
      continue
    }
    const ground = groundAt(world, sh[o], sh[o + 1])
    if (sh[o + 2] <= ground) {
      // a ship's shots striking the ground near a pilot on foot still hurt him: strafing is deadly
      if (!bolt && sh[o + 8] > 0) splash(scene, sh[o], sh[o + 1], ground, side, sh[o + 8], g.by[i])
      const wet = wetAt(world, sh[o], sh[o + 1])
      for (let k = 0; k < 2; k++)
        addSpark(
          scene,
          sh[o],
          sh[o + 1],
          ground + 1,
          jitter(scene, 3) * 20,
          jitter(scene, 5) * 20,
          30 + jitter(scene, 7) * 20,
          wet ? SPARK_WATER : SPARK_GROUND,
        )
      sh[o + 6] = -99
    }
  }
}
