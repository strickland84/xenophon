// The computer's pilots: the enemy's, and the player's wingmen when there is a fight. Each
// has a brain that looks around a few times a second and picks something to do: hunt for a
// target, attack it, turn hard away when it is under fire, break off and run when it is badly
// damaged, and roll to shake off a missile. Then it flies like any other ship, within its
// hull's speed and agility, through the ship API (updateShip). Its aim is never perfect: it
// leads its target only so far, and its guns wander. How well it does all of this is its
// skill, which comes from the wave it flies in (data/skirmish.ts), or its band's (bands.ts).
//
// A band's pilot (raiders, drones, a patrol: bands.ts) lives somewhere. Raiders lurk at their spot,
// low and slow, until a ship comes near enough to see (a loaded one from farther off), chase it, and
// give it up once it leaves their ground; then they fly back and wait again. A patrol flies its
// route out and back, turns on any enemy that comes near it, and goes back to its route after.

import { CANNON, MISSILE } from '../data/weapons'
import { ceilingOf } from '../params'
import { SPACE_DEEP, SPACE_TOP } from '../data/space'
import { DRILL } from '../data/skirmish'
import type { Skill } from '../data/skirmish'
import { formX, formY } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp, wrapAngle } from '../util/math'
import { groundAhead, groundAt } from '../world/world'
import { heatFloor } from './hazards'
import { LEADER, PARKED, SHIP, SIDE_PLAYER, TURRET, WALKER, WINGMAN } from './combat'
import { FOOT, STRAFE } from '../data/foot'
import { BAND, PATROL as PATROL_PACE } from '../data/bands'
import { TURRET as TURRET_REACH } from '../data/loop'
import { anchorOf, bandOf, loadOf, spotAt } from './bands'
import type { BandPlan } from './bands'
import { deltaIn } from './loop'
import { ABOARD, walkerFighter } from './foot'
import type { Fighter } from './combat'
import { focus } from './ejection'
import { leadOn, noseOf, offNose, stepGun } from './guns'
import type { Aim } from './guns'
import { launch, stepSeeker, timeToHit } from './missiles'
import type { Missile } from './missiles'
import { updateShip } from './ships'

// what a pilot is doing
export const HUNT = 0 // looking for a target, or waiting its turn at a distance
export const ATTACK = 1 // after a target, guns ready
export const EVADE = 2 // turning hard away from fire
export const EXTEND = 3 // running straight out: to get clear after a pass, or to save itself when damaged
export const FORM = 4 // a wingman in formation
export const REJOIN = 5 // a wingman flying back to its place
export const LEAVE = 6 // going home (the skirmish is over)
export const LURK = 7 // a band's raider waiting at its spot, low and slow
export const PATROL = 8 // a patrol flying its route
export const RETURN = 9 // a band's pilot flying back to its spot after a chase

export interface Brain {
  mode: number
  /** seconds in this mode, and how long it is meant to last */
  modeT: number
  modeFor: number
  /** seconds until it next looks around */
  think: number
  target: Fighter | null
  skill: Skill
  /** its own sequence of chance numbers (so every flight goes the same way twice) */
  rng: number
  /** how far its guns wander off the true aim point, across and up (radians), and seconds until that changes */
  wobX: number
  wobY: number
  wobT: number
  /** seconds left in this burst of fire, and before the next may start */
  burst: number
  rest: number
  /** seconds before it next tries a missile */
  missileRest: number
  /** what it is flying for: a heading, a height, a share of its thrusters, and how fast it is turning */
  wantYaw: number
  wantAlt: number
  boost: number
  yawRate: number
  /** px per second it is flying now */
  speed: number
  /** which way it breaks, when it breaks */
  side: number
  /** true while it may go for its pilot (only a few at once do) */
  attacker: boolean
  /** the pilot it goes for, or waits near: 0 the player, or the id of a ship another player flies (in a shared sky) */
  pilot: number
  /** times it has broken off to save itself */
  ranAway: number
  /** seconds before it may turn hard away again (its skill's `steady`), and how wide its thrusters are open while it runs out straight */
  calm: number
  pace: number
  /** seconds before it next makes up its mind whether to run from an enemy on its tail */
  nerve: number
  /** the missile it means to roll away from, and how close (seconds) it lets it come first */
  dodging: Missile | null
  dodgeAt: number
  /** a wingman's place: −1 off the leader's left wing, +1 off his right */
  slot: number
  /** a training drone's spot (ships.ts `drill`): it circles there, and never goes for anyone (null: not a drone) */
  home: { x: number; y: number; z: number } | null
  /** the band it flies in (bands.ts; −1 none), and on a patrol's route the stop it heads for and which way along the route */
  band: number
  leg: number
  legDir: number
}

export function createBrain(skill: Skill, seed: number, mode = HUNT): Brain {
  return {
    mode,
    modeT: 0,
    modeFor: 0,
    think: 0,
    target: null,
    skill,
    rng: seed | 0,
    wobX: 0,
    wobY: 0,
    wobT: 0,
    burst: 0,
    rest: 0.5,
    missileRest: 3,
    wantYaw: 0,
    wantAlt: 0,
    boost: 0,
    yawRate: 0,
    speed: 0,
    side: 1,
    attacker: false,
    pilot: 0,
    ranAway: 0,
    calm: 0,
    pace: 1,
    nerve: 0,
    dodging: null,
    dodgeAt: 0,
    slot: 1,
    home: null,
    band: -1,
    leg: 0,
    legDir: 1,
  }
}

/** true for a pilot on foot under trees (the player's own, or another's as his game says) */
function hiddenOf(scene: SceneState, f: Fighter) {
  if (f === scene.foot.walker.fighter) return scene.foot.walker.hidden
  return !!scene.walkers.find((w) => w.fighter === f)?.hidden
}

/** the brain's next chance number, 0..1 */
export function chance(b: { rng: number }) {
  b.rng = (b.rng + 0x6d2b79f5) | 0
  let t = Math.imul(b.rng ^ (b.rng >>> 15), 1 | b.rng)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function setMode(b: Brain, mode: number, lasts = 0) {
  b.mode = mode
  b.modeT = 0
  b.modeFor = lasts
}

// scratch
const aim: Aim = { x: 0, y: 0, z: 0 }
const nose: Aim = { x: 0, y: 0, z: 0 }

/** distance between two fighters */
const apart = (a: Fighter, b: Fighter) => Math.hypot(a.jet.x - b.jet.x, a.jet.y - b.jet.y, a.jet.z - b.jet.z)

/** radians: how far `b` is off `a`'s nose, across (+ right) */
function bearing(a: Fighter, b: Fighter) {
  return wrapAngle(Math.atan2(b.jet.x - a.jet.x, -(b.jet.y - a.jet.y)) - a.jet.yaw)
}

/** an enemy sitting on `f`'s tail: close behind it, pointing at it */
function onTail(scene: SceneState, f: Fighter) {
  for (const e of scene.fighters) {
    if (e.side === f.side || !e.alive) continue
    const d = apart(e, f)
    if (d > 210) continue
    if (Math.abs(bearing(f, e)) < 2.1) continue // not behind
    if (Math.abs(bearing(e, f)) < 0.4) return e
  }
  return null
}

/** the nearest living enemy of `f`, optionally only those `ok` allows */
function nearestEnemy(scene: SceneState, f: Fighter, ok?: (e: Fighter) => boolean) {
  let best: Fighter | null = null
  let bestD = 1e9
  for (const e of scene.fighters) {
    if (e.side === f.side || !e.alive || (ok && !ok(e))) continue
    const d = apart(e, f)
    if (d < bestD) {
      bestD = d
      best = e
    }
  }
  return best
}

/** a wingman's place in the formation, in the world (left in `slotAt`) */
const slotAt = { x: 0, y: 0 }
function slotOf(scene: SceneState, side: number) {
  const p = scene.params
  const lead = focus(scene)
  const m = scene.mesh.model
  slotAt.x = lead.x + Math.cos(lead.yaw) * side * formX(p, m) - Math.sin(lead.yaw) * formY(p, m)
  slotAt.y = lead.y + Math.sin(lead.yaw) * side * formX(p, m) + Math.cos(lead.yaw) * formY(p, m)
  return slotAt
}

/** the jet of the pilot a brain is given to: the player's (whatever he is in, or on foot), or another player's ship, or him on foot */
function pilotJet(scene: SceneState, b: Brain) {
  if (b.pilot === 0) return focus(scene)
  return scene.ships.find((s) => s.id === b.pilot)?.jet ?? scene.walkers.find((w) => w.id === b.pilot)?.jet ?? focus(scene)
}

/** a pilot on foot under trees is seen only from close by (unless he has just fired) */
const seenBy = (scene: SceneState, f: Fighter, prey: Fighter) =>
  prey.kind !== WALKER || !hiddenOf(scene, prey) || Math.hypot(prey.jet.x - f.jet.x, prey.jet.y - f.jet.y) < FOOT.hidden

/** the player as the computer's pilots see him: his ship, or himself on foot (null: neither, or out of sight) */
function playerAsPrey(scene: SceneState, f: Fighter) {
  const lead = scene.jets[0].fighter
  if (lead && lead.alive && lead.kind === LEADER && scene.eject.stage === 0 && scene.foot.stage === ABOARD) return lead
  const w = walkerFighter(scene)
  return w && seenBy(scene, f, w) ? w : null
}

/** looks around and decides what to do next */
function think(scene: SceneState, f: Fighter, b: Brain) {
  const s = b.skill
  b.think = 0.12 + chance(b) * 0.14 + s.react * 0.3
  const j = f.jet
  const wingman = f.kind === WINGMAN
  const left = f.hull / f.stats.hull

  // a missile on its way: perhaps it means to roll away from it at the right moment
  for (const m of scene.missiles) {
    if (!m.on || m.target !== f || m === b.dodging) continue
    if (timeToHit(m) > 1.6) continue
    b.dodging = m
    b.dodgeAt = chance(b) < s.dodge ? MISSILE.dodgeLate + 0.08 + chance(b) * (MISSILE.dodgeEarly - MISSILE.dodgeLate - 0.2) : -1
  }

  if (b.mode === LEAVE) return
  // a training drone circles its spot whatever happens: a target to learn the guns on
  if (b.home) {
    b.target = null
    if (b.mode !== HUNT) setMode(b, HUNT)
    return
  }
  if (wingman && b.mode === FORM) {
    // a wingman leaves the formation when an enemy comes near and he is fit to fight
    const lead = scene.jets[0].fighter
    const near = nearestEnemy(scene, f)
    if (near && left > 0.3 && apart(near, f) < 330 && lead && lead.alive && scene.eject.stage === 0) {
      b.target = near
      setMode(b, ATTACK)
    }
    return
  }
  // still turning away, or still running: keep at it
  if ((b.mode === EVADE || b.mode === EXTEND) && b.modeT < b.modeFor) return

  // badly damaged: break off and run, to let the shield come back
  if ((left < 0.4 && b.ranAway === 0) || (left < 0.16 && b.ranAway === 1)) {
    b.ranAway++
    const threat = nearestEnemy(scene, f)
    b.wantYaw = threat ? Math.atan2(j.x - threat.jet.x, -(j.y - threat.jet.y)) : j.yaw
    b.wantAlt = j.z + (chance(b) < 0.5 ? 50 : -30)
    b.side = chance(b) < 0.5 ? -1 : 1
    b.pace = 1
    setMode(b, EXTEND, 3.5 + chance(b) * 2)
    return
  }
  // under fire, or with an enemy on its tail: turn hard away, perhaps; having done so it flies on a while before it
  // may again (a poor pilot a good while: he can be followed)
  const tail = onTail(scene, f)
  const shotAt = scene.time - f.hitAt < 0.4 + s.react
  if ((tail || shotAt) && b.mode !== EVADE && b.calm <= 0 && chance(b) < s.evade) {
    const from = tail ?? f.hitBy
    b.side = from ? (bearing(f, from) > 0 ? -1 : 1) : chance(b) < 0.5 ? -1 : 1
    // (up or down with it: the better the pilot, the further)
    b.wantAlt = j.z + (chance(b) < 0.5 ? 45 : -40) * (0.3 + 0.7 * s.evade)
    setMode(b, EVADE, 0.9 + chance(b) * 0.9)
    b.calm = b.modeFor + s.steady * (0.7 + chance(b) * 0.6)
    return
  }
  // an enemy on its tail and it is not turning away: a poor pilot, like as not, runs for it, straight, where a good one
  // turns back to fight (the computer's enemies only: a wingman stays with his leader). It makes up its mind once, and
  // holds to it a while: having run, it fights or turns away before it runs again; having stood, it stands
  if (tail && f.side !== SIDE_PLAYER && b.nerve <= 0) {
    if (chance(b) < s.flee) {
      b.wantYaw = j.yaw + (chance(b) - 0.5) * 0.5
      b.wantAlt = j.z
      b.side = chance(b) < 0.5 ? -1 : 1
      b.pace = s.run
      setMode(b, EXTEND, s.fleeFor * (0.7 + chance(b) * 0.6))
      b.nerve = b.modeFor + 1.5
      return
    }
    b.nerve = 3
  }

  // a band's pilot: what it lives for (bands.ts)
  if (b.band >= 0) {
    thinkBand(scene, f, b)
    return
  }

  // whom to go for
  const player = playerAsPrey(scene, f)
  let target: Fighter | null
  if (f.side === SIDE_PLAYER) {
    // a wingman goes for whoever is after his leader, or the nearest enemy; too far from him, he goes back
    const anchor = focus(scene)
    const far = Math.hypot(j.x - anchor.x, j.y - anchor.y) > 520
    target = far ? null : (nearestEnemy(scene, f, (e) => e.brain?.target === player && apart(e, f) < 400) ?? nearestEnemy(scene, f))
    if (target && apart(target, f) > 600) target = null
    if (!target) {
      setMode(b, REJOIN)
      b.target = null
      return
    }
  } else {
    // (its pilot: the player, or another player's ship)
    const other =
      b.pilot === 0
        ? null
        : (scene.ships.find((s) => s.id === b.pilot)?.jet.fighter ?? scene.walkers.find((w) => w.id === b.pilot)?.fighter)
    const prey = b.pilot === 0 ? player : other && other.alive && seenBy(scene, f, other) ? other : null
    if (b.attacker && prey && prey.protect <= 0) target = prey
    else target = nearestEnemy(scene, f, (e) => e.kind === WINGMAN && apart(e, f) < 450)
  }
  b.target = target
  if (!target) {
    setMode(b, HUNT)
    return
  }
  press(f, b, target)
}

/** after a target: too close, overshot it, or pressed the attack long enough, it runs out straight and comes round again */
function press(f: Fighter, b: Brain, target: Fighter) {
  const j = f.jet
  if (b.mode !== ATTACK) setMode(b, ATTACK)
  const d = apart(f, target)
  const pressed = b.modeT > b.skill.press * (0.7 + chance(b) * 0.6) && d < 200
  if (d < 46 || (d < 110 && Math.abs(bearing(f, target)) > 1.9) || pressed) {
    b.wantYaw = j.yaw + (chance(b) - 0.5) * 0.5
    b.wantAlt = j.z + (chance(b) - 0.5) * 50
    b.pace = 1
    // (a poor pilot runs out wide before he comes round again: he can be got behind)
    setMode(b, EXTEND, 1 + chance(b) * 1.2 + b.skill.wide)
  }
}

// scratch
const spot = { x: 0, y: 0, z: 0 }

/** px across the zone between a fighter and a point (the short way round a world) */
const across = (scene: SceneState, f: Fighter, x: number, y: number) => Math.hypot(deltaIn(scene, x - f.jet.x), deltaIn(scene, y - f.jet.y))

/** may a band's pilot go for `e` at all: an enemy, alive, in the open (a training drone, a turret or a ship standing empty is no prey) */
function preyFor(scene: SceneState, f: Fighter, e: Fighter) {
  if (e.side === f.side || !e.alive || e.drill || e.kind === TURRET || e.kind === PARKED || e.protect > 0) return false
  if (e.kind === WALKER && !seenBy(scene, f, e)) return false
  // (raiders lying in wait are seen only close by, even by a patrol)
  if (e.lurk && apart(e, f) > BAND.hidden) return false
  // (raiders are after pilots and their cargo: a patrol they leave alone, unless it is on top of them or shooting at them)
  if (e.band >= 0 && f.brain && bandOf(scene, f.brain.band)?.kind !== 'patrol')
    return apart(e, f) < PICK_FIGHT || (f.hitBy === e && scene.time - f.hitAt < 4)
  return true
}

/** px: raiders take on a patrol only this close */
const PICK_FIGHT = 200

/** true for a ship under a base's guns (its turrets' reach, on a world), or by a station in space: raiders will not follow it there */
function underGuns(scene: SceneState, e: Fighter) {
  if (scene.zone.kind === 'space') {
    for (const b of scene.space.bodies)
      if (b.body.kind === 'base' && b.body.role !== 'derelict' && across(scene, e, b.x, b.y) < BAND.station) return true
    return false
  }
  for (const b of scene.world.features.bases) if (across(scene, e, b.x, b.y) < TURRET_REACH.range + 40) return true
  return false
}

/** whom a band's pilot goes for: the one it is after while he stays on its ground, else the nearest it sees there (a loaded ship seems nearer) */
function bandPrey(scene: SceneState, f: Fighter, b: Brain, plan: BandPlan) {
  anchorOf(scene, plan, spot)
  const ground = (e: Fighter) => plan.leash + plan.leashLoaded * loadOf(scene, e)
  // (raiders keep off a base's guns; a patrol, of a side, goes where its enemies are)
  const raider = plan.kind !== 'patrol'
  const t = b.target
  if (t && preyFor(scene, f, t) && across(scene, t, spot.x, spot.y) <= ground(t) && !(raider && underGuns(scene, t))) return t
  let best: Fighter | null = null
  let bestD = Infinity
  for (const e of scene.fighters) {
    if (!preyFor(scene, f, e) || (raider && underGuns(scene, e))) continue
    const load = loadOf(scene, e)
    const d = apart(e, f)
    if (d > plan.notice + plan.noticeLoaded * load) continue
    if (across(scene, e, spot.x, spot.y) > ground(e)) continue
    const score = d / (1 + load)
    if (score < bestD) {
      bestD = score
      best = e
    }
  }
  return best
}

/** a band's pilot looks around: after someone on its ground, or back to waiting at its spot, or along its route */
function thinkBand(scene: SceneState, f: Fighter, b: Brain) {
  const plan = bandOf(scene, b.band)
  if (!plan) {
    b.target = null
    if (b.mode !== HUNT) setMode(b, HUNT)
    return
  }
  const target = bandPrey(scene, f, b, plan)
  b.target = target
  if (target) {
    // (only so many of a band go for one at once; the rest wait their turn, circling him at a distance)
    if (b.mode !== ATTACK) {
      let busy = 0
      for (const o of scene.fighters) if (o !== f && o.band === f.band && o.brain?.mode === ATTACK && o.brain.target === target) busy++
      if (busy >= plan.attackers) {
        b.pilot =
          target === playerAsPrey(scene, f)
            ? 0
            : (scene.ships.find((s) => s.jet === target.jet)?.id ?? scene.walkers.find((w) => w.fighter === target)?.id ?? 0)
        if (b.mode !== HUNT) setMode(b, HUNT)
        return
      }
    }
    press(f, b, target)
    return
  }
  // (no one to go for: its seeker lets go)
  f.seeker = null
  f.lock = 0
  if (plan.kind === 'patrol') {
    if (b.mode !== PATROL) {
      // (back to its route: on to the nearest stop, the way it was going)
      let best = Infinity
      plan.route.forEach((r, i) => {
        spotAt(scene, r, spot)
        const d = across(scene, f, spot.x, spot.y)
        if (d < best) {
          best = d
          b.leg = i
        }
      })
      setMode(b, PATROL)
    }
    return
  }
  anchorOf(scene, plan, spot)
  if (across(scene, f, spot.x, spot.y) > BAND.circle * 2.5) {
    if (b.mode !== RETURN) setMode(b, RETURN)
  } else if (b.mode !== LURK) setMode(b, LURK)
}

/** where the pilot means to fly this step, and whether it fires */
function decide(scene: SceneState, f: Fighter, b: Brain, dt: number) {
  const s = b.skill
  const j = f.jet
  const lead = focus(scene)
  let fire = false
  switch (b.mode) {
    case HUNT: {
      if (b.home) {
        // a training drone: a slow, wide circle round its spot, at its height
        const h = b.home
        const ang = Math.atan2(j.x - h.x, -(j.y - h.y)) + 0.8 * b.side
        const tx = h.x + Math.sin(ang) * DRILL.circle
        const ty = h.y - Math.cos(ang) * DRILL.circle
        b.wantYaw = Math.atan2(tx - j.x, -(ty - j.y))
        b.wantAlt = h.z
        b.boost = DRILL.pace
        break
      }
      // circle its pilot at a distance, waiting a turn to attack
      const near = pilotJet(scene, b)
      const ang = Math.atan2(j.x - near.x, -(j.y - near.y)) + 0.5 * b.side
      const r = 300
      const tx = near.x + Math.sin(ang) * r
      const ty = near.y - Math.cos(ang) * r
      b.wantYaw = Math.atan2(tx - j.x, -(ty - j.y))
      b.wantAlt = near.z + 20 * b.side
      b.boost = Math.hypot(tx - j.x, ty - j.y) > 260 ? 0.8 : 0
      break
    }
    case ATTACK: {
      const t = b.target
      if (!t || !t.alive) {
        b.think = 0
        break
      }
      // its own idea of where to aim: part of the lead, and a wander that changes now and then
      // (strafing a pilot on foot it holds a steadier line, and aims at the ground at his feet, so a
      // near miss still throws up dirt round him: guns.ts)
      const strafing = t.kind === WALKER
      const steady = strafing ? STRAFE.steady : 1
      b.wobT -= dt
      if (b.wobT <= 0) {
        b.wobT = 0.35 + chance(b) * 0.5
        b.wobX = (chance(b) * 2 - 1) * s.aim * steady
        b.wobY = (chance(b) * 2 - 1) * s.aim * 0.6 * steady
      }
      const d = leadOn(f, t, s.lead, aim)
      const yaw = Math.atan2(aim.x, -aim.y) + b.wobX
      b.wantYaw = yaw
      b.wantAlt = t.jet.z
      const aimZ = strafing ? t.jet.z - FOOT.chest : t.jet.z
      // close the distance; close behind, hold back to its speed
      b.boost = d > 230 ? 1 : d > 140 ? 0.4 : d > 90 ? 0 : -0.35
      // fire in bursts, when the nose is on its aim point and the target is in reach
      noseOf(f, nose)
      const c = Math.cos(b.wobY)
      aim.x = Math.sin(yaw) * c
      aim.y = -Math.cos(yaw) * c
      aim.z = Math.sin(Math.atan2(aimZ - j.z, Math.hypot(t.jet.x - j.x, t.jet.y - j.y)) + b.wobY)
      const o = offNose(nose, aim)
      // (its shots go where it aims; the nose need only be near it, so that it looks right)
      const lined = Math.abs(o.across) < 0.18 && Math.abs(o.up) < 0.35
      if (b.burst > 0) b.burst -= dt
      else if (b.rest > 0) b.rest -= dt
      else if (lined && d < CANNON.speed * CANNON.life * 0.85 && t.protect <= 0) {
        b.burst = s.burst * (0.6 + chance(b) * 0.8)
        b.rest = s.pause * (0.6 + chance(b) * 0.8)
      }
      fire = b.burst > 0 && lined && t.protect <= 0 && f.heat < 0.92
      // a missile, if it carries them and has locked on
      if (s.missiles && f.missiles > 0) {
        stepSeeker(f, t, dt)
        b.missileRest -= dt
        if (f.lock >= 1 && b.missileRest <= 0 && d > 110) {
          launch(scene, f)
          b.missileRest = 5 + chance(b) * 5
        }
      }
      break
    }
    case EVADE: {
      // hard over, and up or down
      b.wantYaw = j.yaw + b.side * 1.4
      b.boost = 0.8
      // half-way through, perhaps a reversal (the better the pilot, the likelier)
      if (b.modeT > b.modeFor * 0.5 && b.modeT - dt <= b.modeFor * 0.5 && chance(b) < 0.5 * s.evade) b.side = -b.side
      break
    }
    case EXTEND:
      // (as fast as it thinks to: a poor pilot running from one on his tail does not open his thrusters far)
      b.boost = b.pace
      b.wantYaw += b.side * 0.08 * dt
      break
    case REJOIN: {
      const slot = slotOf(scene, b.slot)
      const dx = slot.x + lead.vx * 0.5 - j.x
      const dy = slot.y + lead.vy * 0.5 - j.y
      const d = Math.hypot(dx, dy)
      b.wantYaw = d > 8 ? Math.atan2(dx, -dy) : lead.yaw
      b.wantAlt = lead.z
      b.boost = clamp((d - 30) / 120, 0, 1)
      if (d < 16 && Math.abs(wrapAngle(lead.yaw - j.yaw)) < 0.35) setMode(b, FORM)
      break
    }
    case LEAVE: {
      b.wantYaw = Math.atan2(j.x - lead.x, -(j.y - lead.y))
      b.wantAlt = lead.z + 60
      b.boost = 1
      break
    }
    case LURK: {
      // a slow, wide circle round its spot, low: waiting
      const plan = bandOf(scene, b.band)
      if (!plan) break
      anchorOf(scene, plan, spot)
      const dx = deltaIn(scene, j.x - spot.x)
      const dy = deltaIn(scene, j.y - spot.y)
      // (towards a point a little further round the circle than it is: dx, dy is where it is from the spot)
      const ang = Math.atan2(dx, -dy) + 0.8 * b.side
      b.wantYaw = Math.atan2(Math.sin(ang) * BAND.circle - dx, Math.cos(ang) * BAND.circle + dy)
      b.wantAlt = spot.z
      b.boost = -0.4
      break
    }
    case RETURN: {
      // back to its spot after a chase
      const plan = bandOf(scene, b.band)
      if (!plan) break
      anchorOf(scene, plan, spot)
      b.wantYaw = Math.atan2(deltaIn(scene, spot.x - j.x), -deltaIn(scene, spot.y - j.y))
      b.wantAlt = spot.z
      b.boost = 0.6
      if (across(scene, f, spot.x, spot.y) < BAND.circle * 1.5) setMode(b, LURK)
      break
    }
    case PATROL: {
      // on along its route to the next stop, and out and back
      const plan = bandOf(scene, b.band)
      if (!plan || !plan.route.length) break
      const n = plan.route.length
      b.leg = clamp(b.leg, 0, n - 1)
      spotAt(scene, plan.route[b.leg], spot)
      if (across(scene, f, spot.x, spot.y) < 110) {
        if (b.leg + b.legDir < 0 || b.leg + b.legDir >= n) b.legDir = -b.legDir
        b.leg = clamp(b.leg + b.legDir, 0, n - 1)
        spotAt(scene, plan.route[b.leg], spot)
      }
      b.wantYaw = Math.atan2(deltaIn(scene, spot.x - j.x), -deltaIn(scene, spot.y - j.y))
      b.wantAlt = spot.z
      b.boost = PATROL_PACE.pace
      break
    }
  }
  // the roll it planned, as the missile closes
  const m = b.dodging
  if (m && m.on && m.target === f && b.dodgeAt > 0 && timeToHit(m) <= b.dodgeAt && j.stunt < 0 && f.rollRest <= 0) {
    j.stunt = 0
    j.stuntDir = b.yawRate >= 0 ? 1 : -1
    j.stuntDelay = 0
    b.dodgeAt = -1
  }
  return fire
}

/** flies a computer's ship for one step: towards its heading and height, within its hull's limits */
function fly(scene: SceneState, f: Fighter, b: Brain, dt: number) {
  const p = scene.params
  const j = f.jet
  // (as hard as its hull can turn, or as hard as the pilot dares)
  const maxRate = Math.max(0.1, p.agility * f.stats.agility * b.skill.turn)
  const err = wrapAngle(b.wantYaw - j.yaw)
  const want = clamp(err * 3, -maxRate, maxRate)
  b.yawRate += (want - b.yawRate) * (1 - Math.exp(-dt * 3))
  const cruise = p.speed * f.stats.speed
  // (thrusters open speed it up; held back, it slows to as little as two thirds of its cruise)
  const goal = b.boost >= 0 ? cruise * (1 + (clamp(p.boost, 1, 4) - 1) * b.boost) : cruise * (1 + b.boost)
  if (b.speed === 0) b.speed = cruise
  b.speed += (goal - b.speed) * (1 - Math.exp(-dt * 1.6))
  const yaw = j.yaw + b.yawRate * dt
  // height: never below what lies ahead, nor above the ceiling
  const clearance = clamp(p.clearance, 2, 60)
  const floor = Math.max(groundAhead(scene.world, j, b.speed) + clearance + 4, heatFloor(scene, j, b.speed))
  // (in space, anywhere in the band over and under the plane, as the player's ship: there is no ground there)
  const space = scene.zone.kind === 'space'
  // (in space, as far over and under the plane as a pilot flown free can go: they follow him there)
  const alt = space ? clamp(b.wantAlt, SPACE_DEEP, SPACE_TOP) : clamp(b.wantAlt, floor, Math.max(floor, ceilingOf(p) - 20))
  const climbMax = b.speed * 0.55 * p.climb
  let z = j.z + clamp((alt - j.z) * (1 - Math.exp(-dt * 2.2)), -climbMax * dt, climbMax * dt)
  if (!space) z = Math.max(z, groundAt(scene.world, j.x, j.y) + clearance * 0.7)
  const climb = (z - j.z) / Math.max(dt, 1e-4)
  const bank = (clamp(p.bank, 0, 85) * Math.PI) / 180
  const roll = j.roll + (clamp(b.yawRate / maxRate, -1, 1) * bank - j.roll) * (1 - Math.exp(-dt * 5))
  const pitch = j.pitch + (clamp((climb / Math.max(20, b.speed)) * 1.25, -0.5, 0.5) - j.pitch) * (1 - Math.exp(-dt * 4))
  if (f.kind === SHIP) {
    const ship = scene.ships.find((s) => s.jet === j)
    if (ship) updateShip(scene, ship, { heading: yaw, height: z, roll, pitch, speed: b.speed, thrust: Math.max(0, b.boost) })
  } else {
    // a wingman: his jet is moved here
    j.yaw = yaw
    j.yawRate = b.yawRate
    j.z = z
    j.roll = roll
    j.pitch = pitch
    j.vx = Math.sin(yaw) * b.speed
    j.vy = -Math.cos(yaw) * b.speed
    j.x += j.vx * dt
    j.y += j.vy * dt
  }
}

/** every computer pilot looks, decides and flies (wingmen in formation are left to formation.ts) */
export function stepPilots(scene: SceneState, dt: number) {
  for (const f of scene.fighters) {
    const b = f.brain
    if (!b || !f.alive) continue
    b.modeT += dt
    if (b.calm > 0) b.calm -= dt
    if (b.nerve > 0) b.nerve -= dt
    b.think -= dt
    if (b.think <= 0) think(scene, f, b)
    if (b.mode === FORM) {
      b.speed = Math.hypot(f.jet.vx, f.jet.vy)
      b.yawRate = f.jet.yawRate
      continue
    }
    const firing = decide(scene, f, b, dt)
    // (lying in wait, it hides: the radar and the arrows show it only close by)
    f.lurk = b.mode === LURK
    fly(scene, f, b, dt)
    noseOf(f, nose)
    // it fires along its own idea of the aim, not the true one
    stepGun(scene, f, dt, firing, firing ? aim : nose)
  }
}

/** true while a wingman is flying for himself (fighting, or on his way back), not holding formation */
export const flyingFree = (f: Fighter | null) => !!f && !!f.brain && f.brain.mode !== FORM
