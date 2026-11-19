// Lock-on missiles. A seeker locks onto a target held in front of it for about a second;
// a locked missile can then be fired, and it chases its target until it bursts beside it.
// A roll begun at the right moment, as the missile closes in, shakes it off: begun too
// early, the missile follows through it.
//
// In a shared sky (room.ts), the game that owns a missile's target decides what it does: there
// it is real; everywhere else it is only seen, and bursts harmlessly or is ended by word from
// the target's game.

import { MISSILE } from '../data/weapons'
import type { SceneState } from '../state'
import { clamp, wrapAngle } from '../util/math'
import { groundAt } from '../world/world'
import { rockAt } from './belts'
import { harm, LEADER, WALKER } from './combat'
import type { Fighter } from './combat'
import { addBlast, BLAST_SMALL, sound } from './effects'
import { noseOf, offNose } from './guns'
import type { Aim } from './guns'
import { addSmoke } from './particles'
import { idOf, report } from './room'

export const MISSILE_N = 24 // missiles in the air at once

export interface Missile {
  on: boolean
  x: number
  y: number
  z: number
  /** its heading, its climb angle, and its speed (px per second) */
  yaw: number
  climb: number
  speed: number
  /** seconds since it was fired */
  t: number
  side: number
  by: Fighter | null
  /** what it is chasing (null once it has been shaken off) */
  target: Fighter | null
  /** true while its target was rolling at the last step (so a roll is noticed as it begins) */
  sawRoll: boolean
  /** seconds until its next puff of smoke */
  puff: number
  /** its number in this scene (for the reports), and whether it can do harm here (its target is this game's own) */
  tag: number
  real: boolean
}

export function createMissiles(): Missile[] {
  const list: Missile[] = []
  for (let i = 0; i < MISSILE_N; i++)
    list.push({
      on: false,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      climb: 0,
      speed: 0,
      t: 0,
      side: 0,
      by: null,
      target: null,
      sawRoll: false,
      puff: 0,
      tag: 0,
      real: true,
    })
  return list
}

// scratch
const nose: Aim = { x: 0, y: 0, z: 0 }
const toward: Aim = { x: 0, y: 0, z: 0 }

/** true when `t` is in `f`'s seeker: in front of it, within its cone and its reach */
export function inSeeker(f: Fighter, t: Fighter) {
  const d = Math.hypot(t.jet.x - f.jet.x, t.jet.y - f.jet.y, t.jet.z - f.jet.z)
  if (d > MISSILE.lockRange || d < 20) return false
  noseOf(f, nose)
  toward.x = (t.jet.x - f.jet.x) / d
  toward.y = (t.jet.y - f.jet.y) / d
  toward.z = (t.jet.z - f.jet.z) / d
  const o = offNose(nose, toward)
  return Math.hypot(o.across, o.up * 0.7) < MISSILE.lockCone
}

/**
 * The seeker works on `want` (or nothing): the lock builds while it is held in the cone, and
 * slips back if it is lost for long. Returns true at the step the lock is made.
 */
export function stepSeeker(f: Fighter, want: Fighter | null, dt: number) {
  // (no missile locks onto a pilot on foot: too small, too near the ground)
  if (f.missiles <= 0 || !want || !want.alive || want.kind === WALKER) {
    f.seeker = null
    f.lock = 0
    return false
  }
  if (want !== f.seeker) {
    f.seeker = want
    f.lock = 0
    f.lockOff = 0
  }
  const was = f.lock
  if (inSeeker(f, want)) {
    f.lockOff = 0
    f.lock = Math.min(1, f.lock + dt / MISSILE.lockTime)
  } else {
    f.lockOff += dt
    if (f.lockOff > MISSILE.lockGrace) f.lock = Math.max(0, f.lock - dt * 2)
  }
  return was < 1 && f.lock >= 1
}

/** a missile leaves `f`'s rail after `target` (it is real here if this game owns the target); null if none is free */
export function fireMissile(scene: SceneState, f: Fighter, target: Fighter) {
  const m = scene.missiles.find((x) => !x.on)
  if (!m) return null
  const j = f.jet
  noseOf(f, nose)
  m.on = true
  m.x = j.x
  m.y = j.y
  m.z = j.z - 2
  m.yaw = j.yaw
  m.climb = Math.asin(clamp(nose.z, -1, 1))
  m.speed = Math.hypot(j.vx, j.vy) + MISSILE.launch
  m.t = 0
  m.side = f.side
  m.by = f
  m.target = target
  m.sawRoll = m.target.jet.stunt >= 0
  m.puff = 0
  m.tag = scene.room.missileTag++
  m.real = !target.remote
  f.protect = 0
  sound(scene, 'launch', j.x, j.y, j.z, 1, f.kind === LEADER)
  if (m.target.kind === LEADER) sound(scene, 'warning', j.x, j.y, j.z, 1, true)
  return m
}

/** fires a missile at what `f` has locked; false if nothing is locked or none are left */
export function launch(scene: SceneState, f: Fighter) {
  if (f.missiles <= 0 || f.missileWait > 0 || f.lock < 1 || !f.seeker || !f.seeker.alive) return false
  const m = fireMissile(scene, f, f.seeker)
  if (!m) return false
  f.missiles--
  f.missileWait = MISSILE.reload
  f.lock = 0
  report(scene, { kind: 'missile', tag: m.tag, from: idOf(scene, f), target: idOf(scene, m.target) })
  return true
}

/** seconds until a missile reaches its target, as things are */
export function timeToHit(m: Missile) {
  const t = m.target
  if (!t) return 99
  const d = Math.hypot(t.jet.x - m.x, t.jet.y - m.y, t.jet.z - m.z)
  return d / Math.max(40, m.speed - Math.hypot(t.jet.vx, t.jet.vy) * 0.5)
}

/** it bursts: harming what is near, if it is real here (and the other games are told) */
export function burst(scene: SceneState, m: Missile) {
  addBlast(scene, m.x, m.y, m.z, 0.45, BLAST_SMALL)
  sound(scene, 'explosion', m.x, m.y, m.z, 0.35)
  m.on = false
  if (!m.real) return
  report(scene, { kind: 'missileEnd', tag: m.tag, x: m.x, y: m.y, z: m.z, dodged: false })
  for (const f of scene.fighters) {
    if (f.side === m.side || !f.alive || f.remote) continue
    const d = Math.hypot(f.jet.x - m.x, f.jet.y - m.y, f.jet.z - m.z)
    if (d < MISSILE.blast + f.radius)
      harm(scene, f, MISSILE.damage * clamp(1.25 - d / (MISSILE.blast + f.radius), 0.3, 1), m.by, m.x, m.y, m.z)
  }
}

/** every missile in the air chases its target, trailing smoke; it bursts beside it, or when it burns out or meets the ground */
export function stepMissiles(scene: SceneState, dt: number) {
  for (const f of scene.fighters) if (f.missileWait > 0) f.missileWait -= dt
  for (const m of scene.missiles) {
    if (!m.on) continue
    m.t += dt
    const t = m.target
    if (t && !t.alive) m.target = null
    if (m.target) {
      const tj = m.target.jet
      // a roll begun as it closes in shakes it off
      const rolling = tj.stunt >= 0 && tj.stuntDelay <= 0
      if (rolling && !m.sawRoll) {
        const tti = timeToHit(m)
        if (tti < MISSILE.dodgeEarly && tti > MISSILE.dodgeLate) {
          m.target = null
          sound(scene, 'dodged', m.x, m.y, m.z, 1, t?.kind === LEADER)
          if (m.real) report(scene, { kind: 'missileEnd', tag: m.tag, x: m.x, y: m.y, z: m.z, dodged: true })
        }
      }
      m.sawRoll = rolling
    }
    if (m.target) {
      // steer for where the target is heading (half its lead), as fast as it can turn
      const tf = m.target
      const tj = tf.jet
      const d = Math.hypot(tj.x - m.x, tj.y - m.y, tj.z - m.z)
      const lead = Math.min(1.2, d / Math.max(60, m.speed)) * 0.6
      const ax = tj.x + tj.vx * lead - m.x
      const ay = tj.y + tj.vy * lead - m.y
      const az = tj.z + tf.vz * lead - m.z
      const wantYaw = Math.atan2(ax, -ay)
      const wantClimb = Math.atan2(az, Math.hypot(ax, ay))
      const turn = MISSILE.turn * dt
      m.yaw += clamp(wrapAngle(wantYaw - m.yaw), -turn, turn)
      m.climb += clamp(wantClimb - m.climb, -turn, turn)
      if (d < MISSILE.fuse + tf.radius * 0.5) {
        burst(scene, m)
        continue
      }
    }
    m.speed = Math.min(MISSILE.top, m.speed + MISSILE.thrust * dt)
    const c = Math.cos(m.climb)
    m.x += Math.sin(m.yaw) * c * m.speed * dt
    m.y += -Math.cos(m.yaw) * c * m.speed * dt
    m.z += Math.sin(m.climb) * m.speed * dt
    // a thread of white smoke behind it
    m.puff -= dt
    if (m.puff <= 0) {
      m.puff = 0.022
      const n = scene.effects.count++
      addSmoke(scene, m.x, m.y, m.z, 1 + (n % 3) * 0.25, 0, 0, 0.7, 1.1, 1)
    }
    const ground = groundAt(scene.world, m.x, m.y)
    // (in space a rock in its way stops it)
    if (m.t > MISSILE.life || m.z <= ground || (scene.zone.kind === 'space' && rockAt(scene, m.x, m.y))) {
      m.z = Math.max(m.z, ground)
      burst(scene, m)
    }
  }
}

/** the incoming missile nearest to hitting the player, and how many seconds off it is (99: none) */
export function nearestThreat(scene: SceneState, f: Fighter | null) {
  let best: Missile | null = null
  let soon = 99
  if (!f) return { missile: best, tti: soon }
  for (const m of scene.missiles) {
    if (!m.on || m.target !== f) continue
    const tti = timeToHit(m)
    if (tti < soon) {
      soon = tti
      best = m
    }
  }
  return { missile: best, tti: soon }
}
