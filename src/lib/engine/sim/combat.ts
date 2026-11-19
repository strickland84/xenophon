// Every ship that can fight: the player's, his wingmen, and the enemy's. Each one's jet
// carries a Fighter: its hull points and shield, how hot its guns are, its missiles, and
// (for the computer's pilots) a brain. This file keeps them: shields recharge, guns cool,
// damage shows as smoke and then fire, and a ship with no hull left is lost.

import { WINGMAN_SKILL } from '../data/skirmish'
import { DAMAGE, MISSILE } from '../data/weapons'
import { MINES, RACK, weaponOf } from '../data/loadout'
import type { WeaponId } from '../data/loadout'
import { statsOf } from '../data/hulls'
import type { HullStats } from '../data/hulls'
import { axes, jetSize } from '../jet/jet'
import type { Jet } from '../jet/jet'
import type { JetMesh } from '../jet/mesh'
import type { ShipPaint } from '../render/paint'
import type { SceneState } from '../state'
import { clamp, hash8 } from '../util/math'
import { addBlast, addSpark, addWreck, BLAST_AIR, jitter, sound, SPARK_HULL } from './effects'
import { EJ_FLY, startEject } from './ejection'
import { INTRO_TIME } from './flight'
import { addDebris, addSmoke } from './particles'
import { createBrain, FORM, REJOIN } from './pilots'
import type { Brain } from './pilots'
import { idOf, report } from './room'
import { scoreKill } from './skirmish'
import { CRATE } from '../data/loop'
import { spill, spillHold } from './crates'
import { ABOARD, die, parkedFighter, parkedLost, walkerFighter, WALKING } from './foot'
import { walkerDied } from './walkers'
import { looping } from './loop'
import { deed } from './traces'
import { groundAt } from '../world/world'
import { bandShipDown } from './bands'

// which side a ship is on: the player's, the computer's, or (in a shared sky) the other faction's
export const SIDE_PLAYER = 0
export const SIDE_ENEMY = 1
export const SIDE_RIVAL = 2

/** true for a fighter the player may fight: anyone not on his side */
export const hostile = (f: Fighter) => f.side !== SIDE_PLAYER

// who a fighter is
export const LEADER = 0 // the player's own ship
export const WINGMAN = 1 // one of the player's wingmen
export const SHIP = 2 // a ship in scene.ships
export const TURRET = 3 // a base's turret (bases.ts): it fires, but is not fought
export const WALKER = 4 // a pilot on foot (sim/foot.ts: the player's; sim/walkers.ts: another's)
export const PARKED = 5 // the player's ship, standing empty where he left it (it can be shot, and stolen)

export interface Fighter {
  kind: number
  side: number
  /** the ship it is: where it is, and its shape and colours */
  jet: Jet
  mesh: JetMesh
  paint: ShipPaint
  stats: HullStats
  /** px: a shot this close to its middle hits it */
  radius: number
  /** hull points left, and the shield in front of them */
  hull: number
  shield: number
  /** seconds since it was last hit */
  calm: number
  /** 0..1: how hot its guns are; seconds they stay jammed after overheating; seconds to the next shot, and which gun fires it */
  heat: number
  jam: number
  gunWait: number
  barrel: number
  /** missiles left, and seconds until the next may be fired; and, the pilot's own ship short of a full rack, seconds until another comes back onto it */
  missiles: number
  missileWait: number
  missileIn: number
  /** what its seeker is on, how far the lock has come (0..1, 1 locked), and seconds it has been off it */
  seeker: Fighter | null
  lock: number
  lockOff: number
  /** seconds it cannot be harmed (a new ship); firing ends it */
  protect: number
  /** false once it has been shot down */
  alive: boolean
  /** seconds until its next puff of damage smoke */
  puff: number
  /** its climb, px per second (from how its height changed), and its height at the last step */
  vz: number
  lastZ: number
  /** who hit it last, and when (scene seconds); and when a shot last struck its shield, and its hull */
  hitBy: Fighter | null
  hitAt: number
  shieldAt: number
  hullAt: number
  /** seconds before it may roll again */
  rollRest: number
  /** the computer flies it: what it is thinking (null for the player, and for ships flown from outside) */
  brain: Brain | null
  /** another game owns it (room.ts): a hit on it is reported, not done; its guns do no harm here */
  remote: boolean
  /** scene time its guns last fired */
  firedAt: number
  /** how much a kill of it scores, as a share of its hull's points (less for a pilot downed again and again) */
  worth: number
  /** a training drone (ships.ts `drill`): downing it scores, but pays nothing and the galaxy hears nothing of it */
  drill: boolean
  /** the band it flies in (sim/bands.ts; −1 none), what downing it pays as a share of a raider's before (data/bands.ts BAND_PAY), and whether it lies in wait (hidden from the radar but close by) */
  band: number
  pay: number
  lurk: boolean
  /** seconds over lava or acid since it was last burned (sim/hazards.ts) */
  heatTick: number
  /** how fast its guns cool, as a share of the standard (a heat sink: data/loadout.ts), how much heat firing builds, and how fast its shield comes back */
  cool: number
  heatMul: number
  recharge: number
  /** the weapon on each mount, and which mounts hold guns (they fire in turn) */
  weapons: WeaponId[]
  gunMounts: number[]
  /** mines carried, the most its layers hold, seconds until the next can be dropped, and seconds towards the next coming back */
  mines: number
  minesMax: number
  mineWait: number
  mineBack: number
}

export function createFighter(kind: number, side: number, jet: Jet, mesh: JetMesh, paint: ShipPaint): Fighter {
  let stats = statsOf(mesh.model.name)
  // (the weapons it was fitted with: the hull's own cannon on any mount not named)
  const weapons = Array.from({ length: stats.mounts }, (_, m) => (weaponOf(mesh.make?.weapons[m] ?? '')?.id ?? 'cannon') as WeaponId)
  const racks = weapons.filter((w) => w === 'rack').length
  const layers = weapons.filter((w) => w === 'mines').length
  if (racks) stats = { ...stats, missiles: stats.missiles + racks * RACK.missiles }
  // (a scanner gives a stealthy hull away)
  if (mesh.make?.modules.includes('scanner')) stats = { ...stats, radar: 1 }
  const f: Fighter = {
    kind,
    side,
    jet,
    mesh,
    paint,
    stats,
    radius: Math.max(mesh.model.w, mesh.model.l) * 0.42,
    hull: stats.hull,
    shield: stats.shield,
    calm: 99,
    heat: 0,
    jam: 0,
    gunWait: 0,
    barrel: 0,
    missiles: stats.missiles,
    missileWait: 0,
    missileIn: MISSILE.regen,
    seeker: null,
    lock: 0,
    lockOff: 0,
    protect: kind === SHIP ? 0 : DAMAGE.protect,
    alive: true,
    puff: 0,
    vz: 0,
    lastZ: jet.z,
    hitBy: null,
    hitAt: -99,
    shieldAt: -99,
    hullAt: -99,
    rollRest: 0,
    brain: null,
    remote: false,
    firedAt: -99,
    worth: 1,
    drill: false,
    band: -1,
    pay: 1,
    lurk: false,
    heatTick: 0,
    cool: 1,
    heatMul: 1,
    recharge: 1,
    weapons,
    gunMounts: weapons.flatMap((w, m) => (weaponOf(w)?.kind === 'gun' ? [m] : [])),
    mines: layers * MINES.hold,
    minesMax: layers * MINES.hold,
    mineWait: 0,
    mineBack: 0,
  }
  jet.fighter = f
  return f
}

/** the player's ship's fighter, as it stands (null while the pilot has none); for drawing, which must change nothing */
export function ownFighter(scene: SceneState): Fighter | null {
  const lead = scene.jets[0]
  if (scene.foot.stage !== ABOARD || scene.eject.stage !== EJ_FLY || lead.away || !lead.fighter || !lead.fighter.alive) return null
  return lead.fighter
}

/** the player's ship's fighter (one is made for a new ship), or null while the pilot has none */
export function playerFighter(scene: SceneState): Fighter | null {
  const lead = scene.jets[0]
  if (scene.foot.stage !== ABOARD || scene.eject.stage !== EJ_FLY || lead.away) return null
  if (!lead.fighter || lead.fighter.mesh !== scene.mesh) {
    // a new ship (or the same one rebuilt as another hull): whole again, and briefly untouchable
    const old = lead.fighter
    const f = createFighter(LEADER, SIDE_PLAYER, lead, scene.mesh, scene.paint)
    fitParts(scene, f)
    f.hull = f.stats.hull
    f.shield = f.stats.shield
    if (old && old.alive) {
      f.protect = old.protect
      f.heat = old.heat
    }
  }
  return lead.fighter
}

/** the player's fighter as his fitted parts make it: its hull and shield (as shares of what it had, kept), its guns' cooling */
export function fitParts(scene: SceneState, f: Fighter) {
  const e = scene.parts
  const base = statsOf(f.mesh.model.name)
  const hullLeft = f.hull / f.stats.hull
  const shieldLeft = f.stats.shield > 0 ? f.shield / f.stats.shield : 1
  if (e.hull !== 1 || e.shield !== 1 || e.missiles !== 0 || f.stats !== base)
    f.stats = {
      ...base,
      hull: Math.round(base.hull * e.hull),
      shield: Math.round(base.shield * e.shield),
      missiles: base.missiles + e.missiles,
    }
  f.hull = f.stats.hull * hullLeft
  f.shield = f.stats.shield * shieldLeft
  f.missiles = Math.min(f.missiles, f.stats.missiles)
  f.cool = e.cool
  f.heatMul = e.heat
  f.recharge = e.recharge
  // (the weapons on its mounts: a refit at a base)
  const weapons = Array.from({ length: base.mounts }, (_, m) => (weaponOf(f.mesh.make?.weapons[m] ?? '')?.id ?? 'cannon') as WeaponId)
  f.weapons = weapons
  f.gunMounts = weapons.flatMap((w, m) => (weaponOf(w)?.kind === 'gun' ? [m] : []))
  f.minesMax = e.mines
  f.mines = Math.min(f.mines, f.minesMax)
}

/** every fighter in the air this step, the player's side first (filled into scene.fighters) */
export function gatherFighters(scene: SceneState) {
  const all = scene.fighters
  all.length = 0
  // (inside, his ship stands sheltered where he left it: nothing fights it)
  const own = scene.zone.kind === 'interior' ? null : playerFighter(scene)
  if (own) all.push(own)
  // out of his ship: the pilot on his feet, and the ship he left standing
  const walker = walkerFighter(scene)
  if (walker) all.push(walker)
  const parked = parkedFighter(scene)
  if (parked) all.push(parked)
  for (let i = 1; i < scene.jets.length; i++) {
    const j = scene.jets[i]
    if (j.away) continue
    if (!j.fighter || j.fighter.mesh !== scene.mesh) {
      const f = createFighter(WINGMAN, SIDE_PLAYER, j, scene.mesh, scene.paint)
      // (a replacement, appearing some way off, flies up to his place first)
      const lead = scene.jets[0]
      const far = Math.hypot(j.x - lead.x, j.y - lead.y) > 120
      const b = (f.brain = createBrain(WINGMAN_SKILL, i * 7907 + 13, far ? REJOIN : FORM))
      b.slot = i === 1 ? -1 : 1
    }
    if (j.fighter && j.fighter.alive) all.push(j.fighter)
  }
  for (const s of scene.ships) if (s.jet.fighter && s.jet.fighter.alive) all.push(s.jet.fighter)
  for (const w of scene.walkers) if (w.fighter.alive && w.stage === WALKING) all.push(w.fighter)
  return all
}

/** the guns' muzzles: where the `n`th of a fighter's mounts is in the world (left in `muzzle`) */
export const muzzle = { x: 0, y: 0, z: 0 }
export function muzzleOf(scene: SceneState, f: Fighter, n: number) {
  const m = f.mesh.model
  const j = f.jet
  const ax = axes(j)
  const sc = jetSize(scene.params)
  const mounts = f.stats.mounts
  // spread across the wings' inner half, a little ahead of the middle
  const across = mounts === 1 ? 0 : ((n % mounts) / (mounts - 1) - 0.5) * m.w * (mounts > 2 ? 0.62 : 0.4)
  const along = (m.pivotK - m.l * 0.12) * sc
  muzzle.x = j.x + across * sc * ax.rx + along * ax.fx
  muzzle.y = j.y + across * sc * ax.ry + along * ax.fy
  muzzle.z = j.z + across * sc * ax.rz + along * ax.fz
}

/**
 * `amount` of damage to a fighter, by `from` (null: nothing in particular) at the point (x, y, z):
 * the shield takes it first, then the hull. Returns true if the hull was struck.
 */
export function harm(scene: SceneState, f: Fighter, amount: number, from: Fighter | null, x: number, y: number, z: number) {
  if (!f.alive || f.protect > 0) return false
  if (f.remote) {
    // another game's ship: it decides what the hit does; it only shows here
    const hull = f.shield <= 0.001
    report(scene, {
      kind: 'hit',
      target: idOf(scene, f),
      by: idOf(scene, from),
      amount,
      dx: x - f.jet.x,
      dy: y - f.jet.y,
      dz: z - f.jet.z,
      hull,
    })
    f.hitBy = from
    f.hitAt = scene.time
    if (hull) f.hullAt = scene.time
    else f.shieldAt = scene.time
    return hull
  }
  const own = f.kind === LEADER || (f.kind === WALKER && f === scene.foot.walker.fighter)
  f.calm = 0
  f.hitBy = from
  f.hitAt = scene.time
  if (f.shield > 0) {
    f.shieldAt = scene.time
    const took = Math.min(f.shield, amount)
    f.shield -= took
    amount -= took
    if (f.shield <= 0.001) {
      f.shield = 0
      sound(scene, 'shieldDown', x, y, z, 1, own)
    } else sound(scene, 'shield', x, y, z, clamp(took / 20, 0.2, 1), own)
  }
  if (amount <= 0) return false
  f.hull -= amount
  f.hullAt = scene.time
  // the player feels his own ship struck (and himself, on foot)
  if (own) scene.rig.shake = Math.max(scene.rig.shake, f.kind === WALKER ? 0.25 : 0.35)
  sound(scene, 'hit', x, y, z, clamp(amount / 20, 0.2, 1), own)
  if (f.hull <= 0) shootDown(scene, f, from)
  return true
}

/** a fighter with no hull left is lost: it bursts, and goes down in flames (the player's pilot ejects) */
export function shootDown(scene: SceneState, f: Fighter, by: Fighter | null) {
  if (!f.alive) return
  if (f.kind === WALKER) {
    // a pilot on foot: no blast, he falls (the player's own dies here; another's as his game says)
    scoreKill(scene, f, by)
    if (f === scene.foot.walker.fighter) die(scene, by)
    else walkerDied(scene, f)
    return
  }
  f.alive = false
  f.hull = 0
  f.shield = 0
  const j = f.jet
  addBlast(scene, j.x, j.y, j.z, 1.25, BLAST_AIR, j.vx, j.vy)
  // soot that hangs where it burst
  for (let i = 0; i < 5; i++)
    addSmoke(
      scene,
      j.x + jitter(scene, 21) * 8,
      j.y + jitter(scene, 23) * 8,
      j.z + jitter(scene, 25) * 4,
      3 + i * 0.5,
      j.vx * 0.6,
      j.vy * 0.6,
      0.85,
      2.4 + i * 0.3,
      2,
    )
  sound(scene, 'explosion', j.x, j.y, j.z, 0.8, f.kind === LEADER)
  // bits of it, some of them burning, and a shower of sparks
  for (let i = 0; i < 6; i++) {
    const a = (hash8(scene.effects.count++) / 255) * Math.PI * 2
    const out = 20 + hash8(scene.effects.count++) * 0.25
    addDebris(
      scene,
      j.x,
      j.y,
      j.z,
      j.vx * 0.5 + Math.sin(a) * out,
      j.vy * 0.5 - Math.cos(a) * out,
      20 + hash8(scene.effects.count++) * 0.3,
      i % 2,
    )
  }
  for (let i = 0; i < 10; i++)
    addSpark(
      scene,
      j.x,
      j.y,
      j.z,
      j.vx * 0.4 + jitter(scene, 1) * 90,
      j.vy * 0.4 + jitter(scene, 2) * 90,
      30 + jitter(scene, 3) * 60,
      SPARK_HULL,
    )
  scoreKill(scene, f, by)
  // (one of a band's, flown here: counted towards it being beaten)
  if (f.band >= 0) bandShipDown(scene, f, !!by && by.kind === LEADER)
  // (a ship this game owns: the others are told; one owned elsewhere was reported by its own game)
  if (!f.remote && f.kind !== WINGMAN) report(scene, { kind: 'down', target: idOf(scene, f), by: idOf(scene, by) })
  if (f.kind === LEADER) {
    // (a wreck where it fell, for others to find and strip on a world; anywhere, the end of his streak: traces.ts)
    if (scene.params.side) deed(scene, { kind: 'wreck', x: j.x, y: j.y, z: groundAt(scene.world, j.x, j.y), n: 0, hull: f.mesh.model.name })
    // the pilot ejects; the ship he left falls and burns (ejection.ts)
    startEject(scene)
  } else if (f.kind === PARKED) {
    // the ship he left standing burns where it stood, and its hold spills
    spillHold(scene, j)
    j.fighter = null
    parkedLost(scene)
  } else if (f.kind === WINGMAN) {
    // it goes down, and another comes to take its place in a while
    const fall = { ...j, trail: j.trail, flameSeen: j.flameSeen }
    addWreck(scene, fall, f.mesh, f.paint)
    j.away = true
    j.trailLen = 0
    j.fighter = null
    scene.wingReturn[scene.jets.indexOf(j)] = 14
  } else {
    addWreck(scene, j, f.mesh, f.paint)
    // in the loop, a raider this game flies sometimes leaves salvage (more of it where the danger is: data/bands.ts BAND_PAY)
    if (f.side === SIDE_ENEMY && !f.remote && looping(scene) && hash8(scene.effects.count++) < CRATE.salvage * 256) {
      const n = CRATE.salvageUnits[0] + (hash8(scene.effects.count++) % (CRATE.salvageUnits[1] - CRATE.salvageUnits[0] + 1))
      spill(scene, j.x, j.y, j.z, [{ id: 'salvage', n: Math.round(n * f.pay) }], true)
    }
    const at = scene.ships.findIndex((s) => s.jet === j)
    if (at >= 0) scene.ships.splice(at, 1)
  }
}

/** shields recharge, guns cool, protection wears off, and a damaged ship smokes or burns */
export function stepFighters(scene: SceneState, dt: number) {
  const intro = scene.introT < INTRO_TIME
  for (const f of scene.fighters) {
    const j = f.jet
    f.vz = dt > 0 ? (j.z - f.lastZ) / dt : 0
    f.lastZ = j.z
    f.calm += dt
    // (another game's ship: its shield is as that game last said)
    const wait = DAMAGE.shieldWait / f.recharge
    if (!f.remote && f.calm > wait && f.shield < f.stats.shield) {
      // (the player hears his shield begin to come back)
      if (f.kind === LEADER && f.alive && f.calm - dt <= wait) sound(scene, 'shieldUp', j.x, j.y, j.z, 1, true)
      f.shield = Math.min(f.stats.shield, f.shield + DAMAGE.shieldRate * f.recharge * dt)
    }
    if (f.protect > 0 && !intro) f.protect = Math.max(0, f.protect - dt)
    // (the pilot's own rack fills again, a missile at a time: he is never out of them for good)
    if (f.kind === LEADER && !f.remote && f.alive && f.missiles < f.stats.missiles) {
      f.missileIn -= dt
      if (f.missileIn <= 0) {
        f.missiles++
        f.missileIn = MISSILE.regen
        sound(scene, 'rearm', j.x, j.y, j.z, 1, true)
      }
    } else f.missileIn = MISSILE.regen
    if (f.rollRest > 0) f.rollRest -= dt
    if (j.stunt >= 0) f.rollRest = DAMAGE.rollRest
    // smoke, then fire, as the hull goes (a pilot on foot only bleeds health)
    const left = f.hull / f.stats.hull
    if (left < DAMAGE.smokeAt && f.kind !== WALKER) {
      f.puff -= dt
      if (f.puff <= 0) {
        const burning = left < DAMAGE.fireAt
        f.puff = burning ? 0.035 : 0.06 + left * 0.1
        const n = scene.effects.count++
        const sc = jetSize(scene.params)
        const back = f.mesh.model.l * 0.15 * sc
        const x = j.x - Math.sin(j.yaw) * back + (hash8(n * 3) - 128) * 0.03
        const y = j.y + Math.cos(j.yaw) * back + (hash8(n * 5) - 128) * 0.03
        addSmoke(
          scene,
          x,
          y,
          j.z + 1,
          1.4 + (hash8(n * 7) / 255) * 1.4,
          -j.vx * 0.25,
          -j.vy * 0.25,
          burning ? 0.75 : 0.55,
          1.2 + (hash8(n) / 255) * 0.8,
          2,
        )
        if (burning) addSmoke(scene, x, y, j.z + 2, 1.1 + (hash8(n * 11) / 255) * 0.8, -j.vx * 0.1, -j.vy * 0.1, 1, 0.35, 3)
      }
    }
  }
}
