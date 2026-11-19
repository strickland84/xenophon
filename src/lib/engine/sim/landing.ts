// Landing and taking off (the plan's section 6, "Surface flight"): landing is vertical. Hold
// Land low over a pad or flat ground and the ship brakes to a hover over the spot (onto the
// middle of a pad), sinks, and settles on the ground in a cloud of dust; let go before it is
// down and it flies on. Down at a friendly base, its hold is banked. A landed ship stays in
// the world, where it can be shot. Hold Land again and it lifts off, then gathers speed.

import { LAND } from '../data/loop'
import { RESOURCES } from '../data/resources'
import { jetSize } from '../jet/jet'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp, hash8 } from '../util/math'
import { landable } from '../world/features'
import type { Base, Pad } from '../world/features'
import { groundAt, matAt } from '../world/world'
import { takeAll, unitsIn } from './cargo'
import { sound } from './effects'
import { friendly, itemWords, looping, news, record, wrapDelta } from './loop'
import { ABOARD, delivered, getOut, handedIn } from './foot'
import { addSmoke } from './particles'
import { deed } from './traces'
import { powered, shutDown, switchOn } from './power'

// what the ship is doing
export const FLYING = 0
export const LANDING = 1 // braking to a hover over its spot, and sinking onto it
export const LANDED = 2
export const LIFTING = 3

export interface Landing {
  stage: number
  /** seconds in this stage */
  t: number
  /** where it is coming down: the spot, the ground's height there, and how high the ship's middle is when it rests on it */
  x: number
  y: number
  rest: number
  /** where it was, and how fast it was going, when it began to land; and seconds it takes to brake to the spot */
  x0: number
  y0: number
  vx: number
  vy: number
  brake: number
  /** the base whose pad it is coming down on (or is on), if any */
  base: Base | null
  /** seconds Land has been held while landed */
  held: number
  /** Land must be let go before it does anything more (it was held through a touchdown or a lift-off) */
  release: boolean
  /** seconds to the next puff of dust */
  dust: number
  /** what the HUD offers: '' nothing, 'land' (flat ground), 'pad' (a friendly base's pad: land and bank), 'mine', 'takeoff' */
  prompt: string
  /** with ore in the laser's reach (the prompt 'mine'), what Land would do as well: '', 'land' or 'pad' */
  landToo: string
}

export function createLanding(): Landing {
  return {
    stage: FLYING,
    t: 0,
    x: 0,
    y: 0,
    rest: 0,
    x0: 0,
    y0: 0,
    vx: 0,
    vy: 0,
    brake: 1,
    base: null,
    held: 0,
    release: false,
    dust: 0,
    prompt: '',
    landToo: '',
  }
}

/** how high the ship's middle is when its belly rests on ground of height `ground` */
export const restOn = (scene: SceneState, ground: number) => ground + (scene.mesh.model.pivotY + 0.6) * jetSize(scene.params)

/** a pad of a base under (x, y), if there is one (`reach` px beyond its edge counting as on it) */
function padAt(scene: SceneState, x: number, y: number, reach = 8): { base: Base; pad: Pad } | null {
  for (const base of scene.world.features.bases)
    for (const pad of base.pads)
      if (Math.abs(wrapDelta(x - pad.x)) <= pad.half + reach && Math.abs(wrapDelta(y - pad.y)) <= pad.half + reach) return { base, pad }
  return null
}

/** ground a ship can set down on at (x, y): level enough under its hull, and not sea, nor a building or a crystal (null: none) */
function flatAt(scene: SceneState, x: number, y: number) {
  const world = scene.world
  const r = scene.mesh.model.l * LAND.footprint * jetSize(scene.params)
  let lo = 99
  let hi = 0
  for (let i = -1; i <= 1; i++)
    for (let k = -1; k <= 1; k++) {
      const px = x + i * r
      const py = y + k * r
      // (not the sea, nor a building, a turret or ore)
      if (!landable(matAt(world, px, py))) return null
      const h = groundAt(world, px, py)
      if (h < lo) lo = h
      if (h > hi) hi = h
    }
  return hi - lo <= LAND.flat ? hi : null
}

/** seconds the ship takes to brake to a spot `d` px ahead, going at `v` px a second */
const brakeFor = (d: number, v: number) => clamp(LAND.brake + Math.abs(d - (v * LAND.brake) / 3) / 70, LAND.brake, 2)

/** where the ship could come down from where it is now, if it began now (null: nowhere) */
export function landingSpot(scene: SceneState, j: Jet, speed: number) {
  const ground = groundAt(scene.world, j.x, j.y)
  if (j.z - ground > LAND.reach) return null
  // a pad near: onto its middle
  const near = padAt(scene, j.x, j.y)
  if (near)
    return {
      x: near.pad.x,
      y: near.pad.y,
      rest: restOn(scene, near.pad.z),
      base: near.base,
      brake: brakeFor(Math.hypot(wrapDelta(near.pad.x - j.x), wrapDelta(near.pad.y - j.y)), speed),
    }
  // flat ground where it would come to a stop
  const ahead = (speed * LAND.brake) / 3
  const x = j.x + Math.sin(j.yaw) * ahead
  const y = j.y - Math.cos(j.yaw) * ahead
  // (a pad where it would stop, or near it: onto its middle, as from over it; begun short of a pad, the ship came to rest
  // on it or across its edge and was not at the base: nothing banked, and the first sortie's last step waited with no
  // word why)
  const onto = padAt(scene, x, y, LAND.padPull)
  if (onto)
    return {
      x: onto.pad.x,
      y: onto.pad.y,
      rest: restOn(scene, onto.pad.z),
      base: onto.base,
      brake: brakeFor(Math.hypot(wrapDelta(onto.pad.x - j.x), wrapDelta(onto.pad.y - j.y)), speed),
    }
  const h = flatAt(scene, x, y)
  if (h === null) return null
  return { x, y, rest: restOn(scene, h), base: null, brake: LAND.brake }
}

/** the ship begins to come down on a spot (landingSpot's) */
export function startLanding(scene: SceneState, j: Jet, spot: NonNullable<ReturnType<typeof landingSpot>>) {
  const L = scene.loop.landing
  L.stage = LANDING
  L.t = 0
  L.x = spot.x
  L.y = spot.y
  L.rest = spot.rest
  L.base = spot.base
  L.x0 = j.x
  L.y0 = j.y
  L.vx = j.vx
  L.vy = j.vy
  L.brake = spot.brake
  L.dust = 0
  sound(scene, 'brake', j.x, j.y, j.z, 1, true)
}

/** let go before it was down: it flies on, gathering speed again from where it was */
function abort(scene: SceneState, j: Jet) {
  const L = scene.loop.landing
  const u = clamp(L.t / L.brake, 0, 1)
  L.stage = FLYING
  L.base = null
  scene.flight.speedEase = Math.max(0.15, 1 - u)
  scene.flight.altGoal = j.z
  scene.flight.floor = 0
}

/** puffs of dust thrown out across the ground under a ship low over it (more the lower it is); `timer` keeps its own count */
export function dust(
  scene: SceneState,
  j: Jet,
  ground: number,
  dt: number,
  strength: number,
  timer: { dust: number } = scene.loop.landing,
) {
  const L = timer
  const gap = j.z - ground
  if (gap > 46 || strength <= 0) return
  L.dust -= dt * strength * (1.4 - gap / 46)
  while (L.dust <= 0) {
    L.dust += 0.03
    const n = scene.effects.count++
    const a = (hash8(n * 7 + 3) / 255) * Math.PI * 2
    const r = 12 + (hash8(n * 13 + 1) / 255) * 10
    const out = 60 + (hash8(n * 5) / 255) * 70
    addSmoke(
      scene,
      j.x + Math.cos(a) * r,
      j.y + Math.sin(a) * r,
      ground + 1,
      2.2 + (hash8(n * 3) / 255) * 2.2,
      Math.cos(a) * out,
      Math.sin(a) * out,
      0.8,
      0.9 + (hash8(n * 11) / 255) * 0.8,
      4,
    )
  }
}

/** down: it settles, and at a friendly base its hold is banked (a ship called to a pilot on foot is simply there for him) */
function touchDown(scene: SceneState, j: Jet) {
  const L = scene.loop.landing
  L.stage = LANDED
  L.t = 0
  L.held = 0
  L.release = true
  j.z = L.rest
  scene.rig.shake = Math.max(scene.rig.shake, 0.22)
  sound(scene, 'land', j.x, j.y, j.z, 1, true)
  // a ring of dust bursts out
  const ground = groundAt(scene.world, j.x, j.y)
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2
    addSmoke(scene, j.x + Math.cos(a) * 14, j.y + Math.sin(a) * 14, ground + 1, 3.4, Math.cos(a) * 130, Math.sin(a) * 130, 0.9, 1.3, 4)
  }
  if (scene.foot.stage !== ABOARD) {
    delivered(scene)
    return
  }
  const base = L.base
  // (a landing on a world: the first pilot to land names it, as the page sees)
  if (looping(scene)) deed(scene, { kind: 'landed', x: j.x, y: j.y, z: j.z, n: base ? base.id : -1 })
  if (!base) return
  if (!friendly(scene, base)) {
    news(scene, base.name.toUpperCase(), 'AN ENEMY BASE', false)
    return
  }
  if (unitsIn(scene.loop.hold) > 0) {
    const items = takeAll(scene.loop.hold)
    record(scene, { kind: 'bank', items, base: base.name, world: scene.worldKey })
    // (delivered to a base on the world: influence there for the pilot's side)
    deed(scene, { kind: 'deliver', x: base.x, y: base.y, z: j.z, n: items.reduce((a, s) => a + s.n, 0) })
    news(
      scene,
      'BANKED',
      itemWords(items, (id) => RESOURCES[id as keyof typeof RESOURCES].name.toUpperCase()),
    )
    sound(scene, 'bank', j.x, j.y, j.z, 1, true)
  } else news(scene, base.name.toUpperCase(), 'LANDED')
  // a stolen ship, landed at a friendly base: a reward, and the pilot's own ship is his again
  if (scene.foot.stolen) handedIn(scene)
}

/** the ship coming down, resting, or lifting off: moved here instead of being flown (step.ts) */
export function moveLanding(scene: SceneState, dt: number, j: Jet) {
  const L = scene.loop.landing
  const ground = groundAt(scene.world, j.x, j.y)
  L.t += dt
  j.yawRate *= Math.exp(-dt * 5)
  j.yaw += j.yawRate * dt
  j.roll += (0 - j.roll) * (1 - Math.exp(-dt * 5))
  if (L.stage === LANDING) {
    // braking along a smooth path to the spot: it leaves at the speed it had and stops over it
    const T = L.brake
    const u = clamp(L.t / T, 0, 1)
    const u2 = u * u
    const u3 = u2 * u
    const h00 = 2 * u3 - 3 * u2 + 1
    const h10 = u3 - 2 * u2 + u
    const h01 = -2 * u3 + 3 * u2
    const tx = L.x0 + wrapDelta(L.x - L.x0)
    const ty = L.y0 + wrapDelta(L.y - L.y0)
    const nx = h00 * L.x0 + h10 * T * L.vx + h01 * tx
    const ny = h00 * L.y0 + h10 * T * L.vy + h01 * ty
    j.vx = (nx - j.x) / Math.max(dt, 1e-4)
    j.vy = (ny - j.y) / Math.max(dt, 1e-4)
    j.x = nx
    j.y = ny
    // nose up as it brakes, then level
    j.pitch += (0.16 * (1 - u) * (u < 0.85 ? 1 : 0) - j.pitch) * (1 - Math.exp(-dt * 5))
    // sinking, once it has slowed
    if (u > 0.25) {
      const gap = j.z - L.rest
      const v = Math.min(LAND.sink, gap * 2.6 + 3)
      j.z = Math.max(L.rest, j.z - v * dt)
    }
    scene.speed = Math.hypot(j.vx, j.vy)
    dust(scene, j, Math.min(ground, L.rest), dt, 1)
    if (u >= 1 && j.z - L.rest < 0.35) touchDown(scene, j)
  } else if (L.stage === LANDED) {
    // settling on its legs, then still
    const s = L.t < LAND.settle ? Math.sin((L.t / LAND.settle) * Math.PI) * 0.8 : 0
    j.z = L.rest - s
    j.vx = 0
    j.vy = 0
    j.pitch += (0 - j.pitch) * (1 - Math.exp(-dt * 6))
    scene.speed = 0
  } else if (L.stage === LIFTING) {
    const u = clamp(L.t / LAND.lift, 0, 1)
    j.z = L.rest + LAND.liftTo * u * u * (3 - 2 * u)
    j.vx = 0
    j.vy = 0
    j.pitch += (0.06 - j.pitch) * (1 - Math.exp(-dt * 4))
    scene.speed = 0
    dust(scene, j, ground, dt, 1.4)
    if (u >= 1) {
      L.stage = FLYING
      L.base = null
      const f = scene.flight
      f.altGoal = j.z
      f.speedEase = 0.06
      f.climbV = 0
      f.floor = 0
      f.safeT = 1.5
    }
  }
}

/** Land held: down, if there is somewhere to come down; or, once down, up again (step.ts decides what Land is for) */
export function stepLanding(scene: SceneState, dt: number, j: Jet, held: boolean, canLand: boolean) {
  const L = scene.loop.landing
  // (held through a touchdown or a lift-off, it is let go before it counts again; in the loop the key
  // itself must be let go, so that a press to climb out right after touching down is not taken for a hold)
  if (!(looping(scene) ? scene.controls.land : held)) L.release = false
  if (L.release) return
  if (L.stage === FLYING) {
    if (!held || !canLand) return
    const spot = landingSpot(scene, j, scene.speed)
    if (spot) startLanding(scene, j, spot)
  } else if (L.stage === LANDING) {
    // (a brief press is not a change of mind)
    if (!held && L.t > 0.2) abort(scene, j)
  } else if (L.stage === LANDED) {
    // (in the loop: a tap climbs out, and only a hold lifts off; elsewhere a press counts as a hold)
    const out = looping(scene) && scene.introT > 2
    const ctl = scene.controls
    const holding = out ? ctl.land : held
    if (out && L.held > 0 && L.held < LAND.hold && !holding) {
      L.held = 0
      getOut(scene)
      return
    }
    if (out && ctl.use && !ctl.land) {
      getOut(scene)
      return
    }
    L.held = holding ? L.held + dt : 0
    if (L.held >= LAND.hold && scene.introT > 2) {
      // (with its power off, the hold brings it up first; still held once it is up, the ship goes)
      if (!powered(scene)) {
        switchOn(scene)
        return
      }
      L.stage = LIFTING
      L.t = 0
      L.release = true
      sound(scene, 'lift', j.x, j.y, j.z, 1, true)
    }
  }
}

/** puts the player's ship down on a pad of a base, settled: where a pilot begins (bases.ts chooses which) */
export function parkOn(scene: SceneState, base: Base) {
  const L = scene.loop.landing
  const pad = freeSpot(scene, base)
  const j = scene.jets[0]
  j.x = pad.x
  j.y = pad.y
  j.z = restOn(scene, pad.z)
  j.yaw = 0
  j.yawRate = 0
  j.roll = 0
  j.pitch = 0
  j.vx = 0
  j.vy = 0
  j.lastTrailX = j.x
  j.lastTrailY = j.y
  j.trailLen = 0
  L.stage = LANDED
  L.t = 99
  L.x = pad.x
  L.y = pad.y
  L.rest = j.z
  L.base = base
  L.held = 0
  // (set down for him: it waits with its power off, for him to bring it up)
  shutDown(scene)
  const { view, rig, flight } = scene
  view.x = rig.follow.x = j.x
  view.y = rig.follow.y = j.y
  view.alt = rig.follow.alt = j.z
  rig.topYaw = 0
  rig.chaseYaw = 0
  rig.yawDiff = 0
  flight.altGoal = j.z
  scene.boost = 0
}

/**
 * Where a pilot is set down at a base: its first pad no other ship stands on, or, with every pad taken (an outpost has
 * one), the base's flat packed ground beside it, so two pilots coming back at one outpost are never put in one place.
 */
function freeSpot(scene: SceneState, base: Base): { x: number; y: number; z: number } {
  const taken = (x: number, y: number) =>
    scene.ships.some((s) => !s.jet.away && Math.hypot(wrapDelta(s.jet.x - x), wrapDelta(s.jet.y - y)) < PARK_APART)
  const pad = base.pads.find((p) => !taken(p.x, p.y))
  if (pad || !base.pads.length) return pad ?? base.pads[0]
  const first = base.pads[0]
  for (const [dx, dy] of PARK_BESIDE) {
    const x = first.x + dx
    const y = first.y + dy
    const z = groundAt(scene.world, x, y)
    if (Math.abs(z - first.z) <= 2 && !taken(x, y)) return { x, y, z }
  }
  return first
}

/** px apart two parked ships keep, and the places beside a pad tried when it is taken (on its base's packed ground) */
const PARK_APART = 26
const PARK_BESIDE: [number, number][] = [
  [-34, 0],
  [34, 0],
  [0, 34],
  [-34, 30],
  [34, 30],
  [0, -34],
]

/** true while the ship is on the ground, or on its way down or up: it is not flown, and fires nothing */
export const grounded = (scene: SceneState) => scene.loop.landing.stage !== FLYING
