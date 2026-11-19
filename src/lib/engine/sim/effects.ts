// What the fighting leaves in the air for a moment: sparks where a shot hits, the flash at a
// gun's muzzle, explosions, and ships going down in flames. Like smoke (particles.ts), each
// kind lives in a fixed ring of slots, so nothing is allocated while flying. And the sounds:
// the scene makes none, but says what happened, as plain data, for the page to play.

import type { Jet } from '../jet/jet'
import type { JetMesh } from '../jet/mesh'
import type { ShipPaint } from '../render/paint'
import { pr, project } from '../render/view'
import type { SceneState } from '../state'
import { clamp, hash8 } from '../util/math'
import { groundAt, wetAt } from '../world/world'
import { addDebris, addSmoke } from './particles'

export const SPARK_N = 256 // sparks in the air at once
export const SPARK_F = 8 // per spark: x y z, speed x y z, when it flew, what it is
export const STAR_N = 64 // flashes at once: a muzzle, or the star where a shot struck
export const STAR_F = 6 // per flash: x y z, when, size, what it is
export const BLAST_N = 16 // explosions at once
export const BLAST_F = 9 // per explosion: x y z, when, size, what it is, a number of its own, and how fast it drifts x y

// what a spark is
export const SPARK_HULL = 0 // off a hull that was hit: hot metal, falling
export const SPARK_SHIELD = 1 // off a shield: pale blue, hanging
export const SPARK_GROUND = 2 // a shot into the ground: dust
export const SPARK_WATER = 3 // a shot into the sea: spray
// what a flash is
export const STAR_MUZZLE = 0 // the player's side's guns
export const STAR_MUZZLE_FOE = 1 // the enemy's
export const STAR_HIT = 2 // a shot striking a hull
export const STAR_SHIELD = 3 // a shot striking a shield
// what an explosion is
export const BLAST_AIR = 0 // a ship bursting in the air
export const BLAST_GROUND = 1 // a wreck meeting the ground
export const BLAST_WATER = 2 // a wreck meeting the sea
export const BLAST_SMALL = 3 // a missile bursting

/** what the page is told happened, so that it can make the sound */
export type SoundKind =
  | 'cannon' // a gun fired (own: the player's)
  | 'flak' // a flak pod fired a burst
  | 'laser' // a mining laser pulsed at a ship
  | 'mine' // a mine was dropped
  | 'hit' // a shot struck a hull
  | 'shield' // a shot struck a shield
  | 'shieldDown' // a shield gave out
  | 'shieldUp' // the player's shield began to come back
  | 'explosion' // something blew up (size 0..1)
  | 'launch' // a missile left its rail
  | 'locked' // the player's missile has locked on
  | 'rearm' // a missile came back onto the player's rack
  | 'noLock' // the player tried to fire a missile with nothing locked
  | 'warning' // a missile was fired at the player
  | 'dodged' // a roll broke a missile's lock
  | 'overheat' // the player's guns jammed
  | 'eject' // the player's pilot left his ship
  | 'pickup' // a new ship has him
  | 'kill' // the player shot something down
  | 'wave' // a new wave is coming
  | 'over' // the last ship is lost: the skirmish is over
  | 'thunder' // lightning struck (in a storm)
  | 'burn' // lava, or acid, burned the player's ship (what: which)
  | 'brake' // the player's ship began to come down
  | 'land' // … and touched down
  | 'lift' // … and lifts off again
  | 'bank' // its hold was banked
  | 'oreLock' // a mining laser or a hand cutter came in reach of ore (the bracket closes on it)
  | 'cut' // a cut of ore broke free (size: the units it freed)
  | 'chunk' // a chunk of ore popped out of an outcrop
  | 'scoop' // a chunk went into the hold
  | 'gem' // a gem (a chunk worth more) popped out of an outcrop
  | 'gemScoop' // … and went into the hold
  | 'full' // the hold is full: there was ore it could not take
  | 'crate' // something was taken from a crate
  | 'out' // the player climbed out of his landed ship
  | 'board' // … and back in (or into another's)
  | 'deploy' // his race's way of coming down opened (what: the race)
  | 'touchdown' // he came down on foot after ejecting
  | 'step' // a footstep (size: how fast; what: the ground)
  | 'wade' // a step through shallow water
  | 'dive' // a dive to the side, on foot
  | 'blaster' // a pilot's sidearm fired
  | 'call' // a ship was called to a pilot on foot
  | 'die' // the player was killed on foot
  | 'flare' // a flare went up
  | 'beacon' // a beacon was planted
  | 'spool' // the cruise drive began to spool up
  | 'cruise' // … and pushes
  | 'dock' // the player's ship docked at a station
  | 'breakout' // it began to climb out of a world into space
  | 'entry' // it began to go down into a world
  | 'charge' // a gate (or a black hole's ring) began to charge round it
  | 'jump' // it came out of a gate, or a black hole, in another system
  | 'powerUp' // the player's ship's power was switched on (it comes up over two seconds: sim/power.ts)
  | 'powerDown' // … and off, landed or docked
  | 'refused' // the power switch was pressed in flight, and refused
  | 'safe' // the trigger was pressed landed or docked: the weapons are safe
  | 'growl' // a creature came for the pilot on foot, or charged (what: its kind)
  | 'bite' // a creature's bite (or glob) struck him (what: its kind)
  | 'spit' // a spitter spat a glob
  | 'beastDown' // a creature was killed (size: how big; what: its kind)
  | 'loot' // he took something a creature dropped (what: 'credits', 'rare' or '')
  | 'alarm' // his ship was hit while he was up out of its seat (sim/interior.ts)
  | 'target' // the target key picked something (sim/target.ts)
  | 'untarget' // … or let it go

export interface SoundEvent {
  kind: SoundKind
  /** −1 (far left of the frame) … +1 (far right) */
  pan: number
  /** 0..1: how loud, from how near it is */
  gain: number
  /** how big: an explosion's size, a hit's damage (0..1) */
  size: number
  /** true when it is the player's own (his guns, his ship being hit) */
  own: boolean
  /** what kind of it, for some: the ground a step fell on (GROUNDS), the race whose way down opened, the sea that burned ('' none) */
  what: string
}

/** the grounds a footstep can fall on, as SoundEvent.what says them */
export const GROUNDS = ['soft', 'sand', 'rock', 'snow', 'metal'] as const
export type Ground = (typeof GROUNDS)[number]

/** the most sound events kept before the page has read them (the oldest are let go) */
const EVENTS_MAX = 96

/** a ship going down: what is drawn, and how it falls */
export interface Wreck {
  jet: Jet
  mesh: JetMesh
  paint: ShipPaint
  /** how fast it is falling, and turning over */
  vz: number
  spin: number
  /** seconds since it was hit, and until its next puff of smoke */
  t: number
  puff: number
}

export interface Effects {
  sparks: Float32Array
  sparkHead: number
  stars: Float32Array
  starHead: number
  blasts: Float32Array
  blastHead: number
  wrecks: Wreck[]
  events: SoundEvent[]
  /** a counter that gives each new thing a number of its own, for repeatable "randomness" */
  count: number
}

export function createEffects(): Effects {
  const blasts = new Float32Array(BLAST_N * BLAST_F)
  for (let i = 0; i < BLAST_N; i++) blasts[i * BLAST_F + 3] = -99
  const stars = new Float32Array(STAR_N * STAR_F)
  for (let i = 0; i < STAR_N; i++) stars[i * STAR_F + 3] = -99
  const sparks = new Float32Array(SPARK_N * SPARK_F)
  for (let i = 0; i < SPARK_N; i++) sparks[i * SPARK_F + 6] = -99
  return { sparks, sparkHead: 0, stars, starHead: 0, blasts, blastHead: 0, wrecks: [], events: [], count: 0 }
}

/** a repeatable number from −1 to 1, different for each call */
export function jitter(scene: SceneState, salt: number) {
  const n = scene.effects.count++
  return hash8(n * 131 + salt * 7919) / 127.5 - 1
}

export function addSpark(scene: SceneState, x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: number) {
  const e = scene.effects
  const o = e.sparkHead * SPARK_F
  e.sparks[o] = x
  e.sparks[o + 1] = y
  e.sparks[o + 2] = z
  e.sparks[o + 3] = vx
  e.sparks[o + 4] = vy
  e.sparks[o + 5] = vz
  e.sparks[o + 6] = scene.time
  e.sparks[o + 7] = kind
  e.sparkHead = (e.sparkHead + 1) % SPARK_N
}

export function addStar(scene: SceneState, x: number, y: number, z: number, size: number, kind: number) {
  const e = scene.effects
  const o = e.starHead * STAR_F
  e.stars[o] = x
  e.stars[o + 1] = y
  e.stars[o + 2] = z
  e.stars[o + 3] = scene.time
  e.stars[o + 4] = size
  e.stars[o + 5] = kind
  e.starHead = (e.starHead + 1) % STAR_N
}

/** an explosion; `size` 1 is a ship's; it drifts on at (vx, vy) at first, slowing (a ship bursting carries on a little way) */
export function addBlast(scene: SceneState, x: number, y: number, z: number, size: number, kind: number, vx = 0, vy = 0) {
  const e = scene.effects
  const o = e.blastHead * BLAST_F
  e.blasts[o] = x
  e.blasts[o + 1] = y
  e.blasts[o + 2] = z
  e.blasts[o + 3] = scene.time
  e.blasts[o + 4] = size
  e.blasts[o + 5] = kind
  e.blasts[o + 6] = e.count++ & 255
  e.blasts[o + 7] = vx
  e.blasts[o + 8] = vy
  e.blastHead = (e.blastHead + 1) % BLAST_N
  // a ship's explosion shakes the picture, the more the nearer it is
  if (kind !== BLAST_SMALL) {
    const near = loudness(scene, x, y, z)
    scene.rig.shake = Math.max(scene.rig.shake, clamp(near * size * 0.9, 0, 1))
  }
}

/** 0..1: how near something is to where the camera is looking, for how loud it sounds and how hard it shakes */
function loudness(scene: SceneState, x: number, y: number, z: number) {
  const v = scene.view
  const d = Math.hypot(x - v.x, y - v.y, (z - v.alt) * 0.6)
  return clamp(1.15 - d / 650, 0, 1)
}

/** tells the page something was heard: where it is in the frame and how near says how it sounds */
export function sound(scene: SceneState, kind: SoundKind, x: number, y: number, z: number, size = 1, own = false, what = '') {
  const events = scene.effects.events
  let pan = 0
  let gain = 1
  if (!own) {
    gain = loudness(scene, x, y, z)
    if (gain <= 0.02) return
    const W = scene.screen.w
    if (W > 0 && project(scene.view, x, y, z)) pan = clamp((pr.x - W / 2) / (W / 2), -1, 1)
  }
  events.push({ kind, pan, gain, size, own, what })
  if (events.length > EVENTS_MAX) events.splice(0, events.length - EVENTS_MAX)
}

/** how quickly a burst in the air, and a wreck, lose their speed (a share a second) */
const DRAG = 1.4
/** how far a blast has drifted `t` seconds after it began, for each px a second of its speed (a wreck falls out of it just so) */
export const blastDrift = (t: number) => (1 - Math.exp(-t * DRAG)) / DRAG

/** a ship that has been shot down starts its fall, burnt black */
export function addWreck(scene: SceneState, jet: Jet, mesh: JetMesh, paint: ShipPaint) {
  const wrecks = scene.effects.wrecks
  if (wrecks.length >= 16) wrecks.shift()
  jet.stunt = -1
  wrecks.push({ jet, mesh, paint: charred(paint), vz: -10, spin: (hash8(scene.effects.count++) & 1) === 0 ? 2.6 : -2.6, t: 0, puff: 0 })
}

/** a ship's colours, scorched: much darker, and redder */
function charred(paint: ShipPaint): ShipPaint {
  const burn = (src: Uint32Array) => {
    const out = new Uint32Array(src.length)
    for (let i = 0; i < src.length; i++) {
      const c = src[i]
      if (c === 0) continue
      const r = c & 255
      const g = (c >> 8) & 255
      const b = (c >> 16) & 255
      out[i] = ((255 << 24) | (((b * 0.3) | 0) << 16) | (((g * 0.32) | 0) << 8) | ((r * 0.42 + 8) | 0)) >>> 0
    }
    return out
  }
  return {
    jet: burn(paint.jet),
    jetLit: burn(paint.jetLit),
    jetDim: burn(paint.jetDim),
    jetDeep: burn(paint.jetDeep),
    flame: paint.flame,
    trail: paint.trail,
  }
}

/** sparks fall and fade, and the wrecks go down burning until they meet the ground */
export function stepEffects(scene: SceneState, dt: number) {
  const e = scene.effects
  const world = scene.world
  // (in space nothing falls)
  const space = scene.zone.kind === 'space'
  const fall = space ? 0 : 160
  for (let i = 0; i < SPARK_N; i++) {
    const o = i * SPARK_F
    if (scene.time - e.sparks[o + 6] > 1) continue
    const kind = e.sparks[o + 7]
    const drag = kind === SPARK_SHIELD ? Math.exp(-dt * 5) : Math.exp(-dt * 1.5)
    e.sparks[o + 3] *= drag
    e.sparks[o + 4] *= drag
    e.sparks[o + 5] = e.sparks[o + 5] * drag - (kind === SPARK_SHIELD ? 0 : fall * dt)
    e.sparks[o] += e.sparks[o + 3] * dt
    e.sparks[o + 1] += e.sparks[o + 4] * dt
    e.sparks[o + 2] += e.sparks[o + 5] * dt
    if (e.sparks[o + 2] < groundAt(world, e.sparks[o], e.sparks[o + 1])) e.sparks[o + 6] = -99
  }
  for (let i = e.wrecks.length - 1; i >= 0; i--) {
    const w = e.wrecks[i]
    const j = w.jet
    w.t += dt
    if (space) {
      // in space a wreck tumbles on where it was hit, burning, and bursts
      if (spaceWreck(scene, w, dt)) e.wrecks.splice(i, 1)
      continue
    }
    w.vz -= 80 * dt
    j.x += j.vx * dt
    j.y += j.vy * dt
    j.z += w.vz * dt
    j.vx *= Math.exp(-dt * DRAG)
    j.vy *= Math.exp(-dt * DRAG)
    j.pitch += (-0.9 - j.pitch) * (1 - Math.exp(-dt * 1.8))
    j.roll += w.spin * dt
    j.yaw += w.spin * 0.25 * dt
    // it trails fire and black smoke all the way down
    w.puff -= dt
    if (w.puff <= 0) {
      w.puff = 0.03
      const n = e.count++
      addSmoke(scene, j.x, j.y, j.z + 1, 2.2 + (hash8(n * 7) / 255) * 2, -j.vx * 0.2, -j.vy * 0.2, 0.8, 1.6 + hash8(n * 3) / 255, 2)
      addSmoke(scene, j.x, j.y, j.z + 2, 2.2 + (hash8(n * 5) / 255) * 1.4, -j.vx * 0.1, -j.vy * 0.1, 1, 0.5, 3)
    }
    const ground = groundAt(world, j.x, j.y)
    if (j.z <= ground + 1.5) {
      const wet = wetAt(world, j.x, j.y)
      addBlast(scene, j.x, j.y, ground, 0.8, wet ? BLAST_WATER : BLAST_GROUND)
      sound(scene, 'explosion', j.x, j.y, ground, 0.6)
      for (let k = 0; k < 4; k++) {
        const a = (hash8(e.count++) / 255) * Math.PI * 2
        addDebris(scene, j.x, j.y, ground + 2, Math.sin(a) * 40, -Math.cos(a) * 40, 60 + hash8(e.count++) * 0.3, k === 0 ? 1 : 0)
      }
      e.wrecks.splice(i, 1)
    }
  }
}

/** seconds a wreck in space tumbles before it bursts */
const SPACE_WRECK_TIME = 1.3

/** a wreck in space, for a step: it drifts and spins, trailing fire, and bursts (true once it has) */
function spaceWreck(scene: SceneState, w: Wreck, dt: number) {
  const e = scene.effects
  const j = w.jet
  j.x += j.vx * dt
  j.y += j.vy * dt
  j.vx *= Math.exp(-dt * 0.6)
  j.vy *= Math.exp(-dt * 0.6)
  j.roll += w.spin * dt
  j.yaw += w.spin * 0.5 * dt
  w.puff -= dt
  if (w.puff <= 0) {
    w.puff = 0.04
    const n = e.count++
    addSmoke(scene, j.x, j.y, j.z + 1, 1.8 + (hash8(n * 7) / 255) * 1.6, -j.vx * 0.1, -j.vy * 0.1, 0.7, 1.1 + hash8(n * 3) / 255, 2)
    addSmoke(scene, j.x, j.y, j.z + 2, 1.6 + (hash8(n * 5) / 255) * 1.2, 0, 0, 1, 0.4, 3)
  }
  if (w.t < SPACE_WRECK_TIME) return false
  addBlast(scene, j.x, j.y, j.z, 1, BLAST_AIR, j.vx, j.vy)
  sound(scene, 'explosion', j.x, j.y, j.z, 0.6)
  for (let k = 0; k < 6; k++) {
    const a = (hash8(e.count++) / 255) * Math.PI * 2
    addDebris(scene, j.x, j.y, j.z, Math.sin(a) * 50 + j.vx * 0.3, -Math.cos(a) * 50 + j.vy * 0.3, 0, k === 0 ? 1 : 0)
  }
  return true
}
