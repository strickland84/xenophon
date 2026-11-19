// The pilot on foot (the plan's sections 3, 6 and 7, Phase 5): "being shot down is the start of
// something". Out of his ship he is a tiny figure on the same height map, slow and fragile, with
// the camera pulled in (the page makes the art pixels larger: Scene.zoom). He climbs terraces a
// step at a time; cliffs stop him; he wades through shallows and cannot cross deep water; under
// trees he is hidden. He has a sidearm, a hand tool for veins, a backpack of a few slots, flares
// and a beacon.
//
// How he gets out of a ship, and back in:
//   landed, a tap of Use (a hold lifts off) and he climbs out; the ship stays, parked, its canopy
//   open, where anyone can shoot it, or an enemy pilot climb in and fly it off (stealing). Near
//   it, Use climbs back in, and the backpack goes into the hold.
//   shot down (in the loop), he ejects and comes down on foot the way his race does, steering a
//   little: on land he lives; in the sea (or lava) he dies. Shallows he can wade count as land.
//   his ship lost, he can call another to where he stands (Use, held): it comes in about thirty
//   seconds, for its hull's fee, and lands beside him. Killed meanwhile, it does not come.
//   killed, he drops his backpack, and is back a few seconds later at the nearest friendly base,
//   in his ship (a new one, for its fee, if it was lost).
//
// sim/walkers.ts has the other pilots on foot; sim/veins.ts the veins; sim/signals.ts flares and
// beacons; render/walker.ts draws them all.

import { coloursOf, meshFor } from './outfit'
import { COVER, EXPOSURE, LAUNCHER } from '../data/gear'
import { DESCENT, FLARE, FOOT, FOOT_REWARD, PACK, REDELIVER, RESPAWN, SIDEARM, STEAL, VEIN } from '../data/foot'
import { INSIDE } from '../data/interiors'
import { CRATE, LAND, REDELIVERY } from '../data/loop'
import { DAMAGE } from '../data/weapons'
import { statsOf } from '../data/hulls'
import { axes, jetSize, makeJet } from '../jet/jet'
import type { Jet } from '../jet/jet'
import { meshOf } from '../jet/mesh'
import { createPaint, paintShip } from '../render/paint'
import { createLookPaint, paintLook } from '../races/look'
import type { LookPaint } from '../races/look'
import { lookOf } from '../races/races'
import type { PilotLook } from '../races/races'
import type { SceneState } from '../state'
import { clamp, hash8, wrapAngle } from '../util/math'
import { FEATURE_MAT, landable } from '../world/features'
import { groundAt, matAt, treeAt } from '../world/world'
import type { World } from '../world/world'
import { addItems, addTo, createHold, roomFor, takeAll, unitsIn } from './cargo'
import type { Hold, Items } from './cargo'
import { createFighter, LEADER, PARKED, SIDE_PLAYER, WALKER } from './combat'
import type { Fighter } from './combat'
import { addSpark, addStar, jitter, sound, SPARK_WATER, STAR_MUZZLE } from './effects'
import type { Ground } from './effects'
import { boltFrom } from './guns'
import { FLYING, LANDED, LANDING, parkOn, restOn, startLanding } from './landing'
import { shutDown } from './power'
import { itemWords, looping, nearestBase, news, nowOf, record, wrapDelta } from './loop'
import { createCut, nameOf, popOf, stepCut } from './mining'
import type { Cut } from './mining'
import { addSmoke } from './particles'
import { idOf, report } from './room'
import { launchFlare, plantBeacon } from './signals'
import { takeFromVein, veinLeft, veinNear, veinPeriod } from './veins'
import type { Vein } from './veins'
import { crateTake, spill } from './crates'
import { capturePrompt, deed, plantStep, salvage, siteDistance, wreckNear } from './traces'
import { creatureInSights } from './creatures'
import type { Creature } from './creatures'

// where the pilot is
export const ABOARD = 0 // in his ship
export const FALLING = 1 // coming down after ejecting
export const WALKING = 2 // on foot
export const DEAD = 3 // killed: back at a base in a moment
export const BOARDING = 4 // climbing into a ship

// where his ship is, while he is out of it
export const SHIP_WITH = 0 // he is in it
export const SHIP_PARKED = 1 // landed and empty, where he left it
export const SHIP_GONE = 2 // lost (shot down, or stolen): another can be called
export const SHIP_COMING = 3 // being redelivered

/** a pilot on foot, his or another's: as he is drawn and fought */
export interface Walker {
  /** where he is: x, y, and z his middle (FOOT.chest over his feet); yaw the way he faces; vx, vy */
  jet: Jet
  fighter: Fighter
  look: PilotLook
  paint: LookPaint
  stage: number
  /** seconds in this stage */
  t: number
  /** how far through the walk (four steps to a stride, counted on) */
  step: number
  /** 0..1 of a run */
  moving: number
  hidden: boolean
  wading: boolean
  /** cutting a vein with his hand tool */
  mining: boolean
  /** seconds into a dive (−1: not diving), and which way (radians) */
  dive: number
  diveYaw: number
  /** coming down: 0..1, how far his race's way of coming down has opened */
  open: number
  /** scene seconds he last fired */
  firedAt: number
}

export interface Foot {
  stage: number
  t: number
  walker: Walker
  ship: number
  /** the backpack: what he carries on foot, at risk */
  pack: Hold
  /** Use was held at the last step; seconds it has been held towards calling a ship, or cutting a vein */
  useWas: boolean
  useHeld: number
  /** what Use would do now: '' nothing, 'board', 'steal', 'mine', 'call', 'recall' (his parked ship, far off), 'out' (landed: climb out) */
  prompt: string
  /** the vein in reach, and the hand cutter's cut of it (sim/mining.ts Cut: shown and drawn as the ship's laser's is) */
  vein: Vein | null
  cutter: Cut
  /** seconds until the ship called comes (while SHIP_COMING) */
  callT: number
  /** the next ship to come is a new one (the last was lost): its fee is paid when it does */
  owed: boolean
  /** seconds before the sidearm fires again, and which way it aims (world, a unit vector across the ground) */
  gunWait: number
  aimX: number
  aimY: number
  /** the enemy the sidearm is turned onto (null: none), or the creature (sim/creatures.ts) */
  aimAt: Fighter | null
  aimBeast: Creature | null
  /** flares left, and seconds until another comes back; the secondary weapon was held at the last step */
  flares: number
  flareT: number
  secondaryWas: boolean
  /** seconds before he can dive again */
  diveRest: number
  /** in the air (a jump, or off an edge): how fast he rises (less than 0: falls); seconds pushed against a wall; and
   * whether he is climbing it */
  airborne: boolean
  vz: number
  wallT: number
  climbing: boolean
  /** a beacon is to be planted (pressed this step) */
  plant: boolean
  /** who killed him, and how ('' shot, 'sea' drowned, 'lava' burned) */
  how: string
  /** the ship (scene.ships id) he is climbing into to steal, and the owner has not yet said (0: none) */
  stealing: number
  /** the ship he flies is someone else's: its hull, its paint, and the owner's callsign */
  stolen: { hull: string; body: string; accent: string; canopy: string; owner: string } | null
  /** seconds of walking since the last footstep sound */
  stepT: number
  /** seconds his cloak still hides him, and until it can again; the harsh world biting him ('' none, 'heat', 'cold') */
  coverT: number
  coverRest: number
  exposed: '' | 'heat' | 'cold'
  /** the veins of the world, and what has been taken from them this period */
  veins: Vein[]
  veinTaken: Map<number, { epoch: number; n: number }>
  /** units cut or picked up since they were last written in the ledger */
  gathered: Map<string, number>
  /**
   * Coming down: where he will come down if he keeps on as he is going, and whether he can stand there; the nearest ground he
   * can stand on (null: none within DESCENT.look), and seconds until it is looked for again; he glides (over deadly ground)
   */
  down: { x: number; y: number; safe: boolean }
  shore: { x: number; y: number; d: number } | null
  shoreT: number
  glide: boolean
  /** his own parked ship called to him: the hull it had (−1: a new ship is coming, or none) */
  recallHull: number
}

/** a walker for a pilot of a look: his fighter is a pilot's (no shield, a little hull, small) */
export function createWalker(look: PilotLook, side: number, kind = WALKER): Walker {
  const jet = makeJet(0, 0, 0, 0)
  const mesh = meshOf('dart')
  const paint = createPaint()
  const f = createFighter(kind, side, jet, mesh, paint)
  f.stats = { ...f.stats, role: 'Pilot', hull: FOOT.health, shield: 0, mounts: 1, missiles: 0, score: FOOT_REWARD }
  f.hull = FOOT.health
  f.shield = 0
  f.missiles = 0
  f.radius = FOOT.radius
  f.protect = 0
  return {
    jet,
    fighter: f,
    look,
    paint: createLookPaint(),
    stage: WALKING,
    t: 0,
    step: 0,
    moving: 0,
    hidden: false,
    wading: false,
    mining: false,
    dive: -1,
    diveYaw: 0,
    open: 0,
    firedAt: -99,
  }
}

export function createFoot(look: PilotLook): Foot {
  return {
    stage: ABOARD,
    t: 0,
    walker: createWalker(look, SIDE_PLAYER),
    ship: SHIP_WITH,
    pack: { slots: new Array(PACK.slots).fill(null) },
    useWas: false,
    useHeld: 0,
    prompt: '',
    vein: null,
    cutter: createCut(),
    callT: 0,
    owed: false,
    gunWait: 0,
    aimX: 0,
    aimY: -1,
    aimAt: null,
    aimBeast: null,
    flares: FLARE.count,
    flareT: 0,
    secondaryWas: false,
    diveRest: 0,
    airborne: false,
    vz: 0,
    wallT: 0,
    climbing: false,
    plant: false,
    how: '',
    stealing: 0,
    stolen: null,
    stepT: 0,
    coverT: 0,
    coverRest: 0,
    exposed: '',
    veins: [],
    veinTaken: new Map(),
    gathered: new Map(),
    down: { x: 0, y: 0, safe: true },
    shore: null,
    shoreT: 0,
    glide: false,
    recallHull: -1,
  }
}

/** the player's look, from the settings (his side's first race, if it names none of his side's) */
export const lookFromParams = (p: SceneState['params']) => lookOf(p.look, p.side)

/** the player's pilot's colours again (a new look, or another time of day) */
export function repaintWalker(scene: SceneState, w: Walker = scene.foot.walker) {
  paintLook(w.paint, w.look, scene.params.timeOfDay)
}

// ── the ground under foot

/** true for the low ground (materials 0..3) that is water deep enough to drown in, or lava, or acid */
function deadly(world: World, m: number) {
  const sea = world.look.sea
  if (m >= 4 || sea === 'none' || sea === 'ice') return false
  if (sea === 'lava' || sea === 'acid') return true
  return m < 2
}

/** ground near (x, y) a pilot can walk away from (most of the ground a step round it can be stood on): where he stands if it is, else the nearest such within 48 px */
function openGround(world: World, x: number, y: number, z: number) {
  const free = (px: number, py: number, pz: number) => {
    let n = 0
    for (let i = 0; i < 8; i++) if (standAt(world, px + Math.cos((i * Math.PI) / 4) * 4, py + Math.sin((i * Math.PI) / 4) * 4, pz) >= 0) n++
    return n >= 6
  }
  if (free(x, y, z)) return { x, y, z }
  for (let r = 3; r <= 48; r += 3) {
    const n = Math.max(8, Math.round((r * Math.PI * 2) / 3))
    for (let i = 0; i < n; i++) {
      const px = x + Math.cos((i / n) * Math.PI * 2) * r
      const py = y + Math.sin((i / n) * Math.PI * 2) * r
      const m = matAt(world, px, py)
      if (deadly(world, m) || (m >= 4 && !landable(m) && !treeAt(world, px, py))) continue
      const pz = groundAt(world, px, py)
      if (free(px, py, pz)) return { x: px, y: py, z: pz }
    }
  }
  return { x, y, z }
}

/** the nearest ground round (x, y) a pilot can come down on and stand (not deep water, lava or acid), within `reach` px (null: none) */
export function shoreNear(world: World, x: number, y: number, reach: number): { x: number; y: number; d: number } | null {
  if (!deadly(world, matAt(world, x, y))) return { x, y, d: 0 }
  for (let r = 8; r <= reach; r += 8) {
    const n = Math.max(8, Math.round((r * Math.PI * 2) / 8))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      if (!deadly(world, matAt(world, px, py))) return { x: px, y: py, d: r }
    }
  }
  return null
}

/** true for shallow water a pilot wades through */
function shallow(world: World, m: number) {
  return m >= 2 && m < 4 && world.look.sea === 'water'
}

/** the ground under a pilot's feet at (x, y): under a tree's crown it is the ground round the trunk (the nearest that is not a tree) */
export function footGround(world: World, x: number, y: number, now: number) {
  if (!treeAt(world, x, y)) return matAt(world, x, y) < 4 && world.look.sea !== 'none' ? 0 : groundAt(world, x, y)
  for (let r = 1; r <= 4; r++)
    for (let i = -r; i <= r; i++)
      for (const [dx, dy] of [
        [i, -r],
        [i, r],
        [-r, i],
        [r, i],
      ]) {
        if (!treeAt(world, x + dx, y + dy)) return matAt(world, x + dx, y + dy) < 4 ? 0 : groundAt(world, x + dx, y + dy)
      }
  return now
}

/** where a pilot at feet height `feet` can stand at (x, y): its ground's height, or −1 where he cannot (a cliff, deep water, a building) */
export function standAt(world: World, x: number, y: number, feet: number) {
  const m = matAt(world, x, y)
  if (deadly(world, m)) return -1
  if (m >= 4 && !landable(m) && !treeAt(world, x, y)) {
    // stamped features: a pad and its apron can be walked on; a building, a turret or a crystal cannot
    return -1
  }
  const g = footGround(world, x, y, feet)
  return Math.abs(g - feet) > FOOT.step ? -1 : g
}

// ── the screen's ways, as the world's: the keys and sticks move him the way the screen shows

/** the camera's turn, overhead (radians): a heading h shows on screen as h + this */
const screenYaw = (scene: SceneState) => scene.rig.topYaw

/** the controls' push (across, up the screen) as a way across the ground, in `out` (not a unit: as long as the push) */
function pushOf(scene: SceneState, out: { x: number; y: number }) {
  const ctl = scene.controls
  const sx = ctl.keyTurn
  const sy = -clamp(ctl.keyWalk + ctl.keyThrottle, -1, 1) // (the throttle keys walk too)
  const c = Math.cos(screenYaw(scene))
  const s = Math.sin(screenYaw(scene))
  // (screen right is (cos, −sin) across the ground, screen down is (sin, cos))
  out.x = sx * c + sy * s
  out.y = -sx * s + sy * c
  const n = Math.hypot(out.x, out.y)
  if (n > 1) {
    out.x /= n
    out.y /= n
  }
  return out
}
const push = { x: 0, y: 0 }

// ── getting out, and back in

/** where a pilot climbs out of a ship: beside it, off its left side (or its right, or behind, if that is blocked) */
function besideShip(scene: SceneState, j: Jet) {
  const m = scene.mesh.model
  const sc = jetSize(scene.params)
  const off = m.w * 0.5 * sc + 4
  const c = Math.cos(j.yaw)
  const s = Math.sin(j.yaw)
  const ground = groundAt(scene.world, j.x, j.y)
  for (const [ax, ay] of [
    [-c * off, -s * off],
    [c * off, s * off],
    [-Math.sin(j.yaw) * m.l * 0.6 * sc, Math.cos(j.yaw) * m.l * 0.6 * sc],
  ]) {
    const g = standAt(scene.world, j.x + ax, j.y + ay, ground)
    if (g >= 0) return { x: j.x + ax, y: j.y + ay, z: g }
  }
  return { x: j.x - c * off, y: j.y - s * off, z: ground }
}

/** the pilot climbs out of his landed ship: it stays, parked, its canopy open */
export function getOut(scene: SceneState) {
  const foot = scene.foot
  const j = scene.jets[0]
  const w = foot.walker
  const at = besideShip(scene, j)
  place(w, at.x, at.y, at.z, j.yaw)
  w.stage = WALKING
  w.t = 0
  w.dive = -1
  w.fighter.hull = Math.max(w.fighter.hull, 1)
  w.fighter.alive = true
  foot.stage = WALKING
  foot.t = 0
  foot.ship = SHIP_PARKED
  foot.useHeld = 0
  foot.useWas = true
  // (left standing, it is fair game: a new ship's protection ends)
  if (j.fighter) {
    j.fighter.kind = PARKED
    j.fighter.protect = 0
  }
  j.lid = 1
  scene.boost = 0
  // (left, it is shut down: he powers it up again when he is back in it)
  shutDown(scene)
  sound(scene, 'out', j.x, j.y, j.z, 1, true)
}

/** puts a walker at (x, y) with his feet at `feet`, facing `yaw`, standing still */
function place(w: Walker, x: number, y: number, feet: number, yaw: number) {
  const j = w.jet
  j.x = x
  j.y = y
  j.z = feet + FOOT.chest
  j.yaw = yaw
  j.vx = 0
  j.vy = 0
  w.moving = 0
  w.fighter.lastZ = j.z
}

/** the pilot climbs into his own parked ship (`own`), or one he is stealing whose owner has given it up */
function startBoarding(scene: SceneState) {
  const foot = scene.foot
  foot.stage = BOARDING
  foot.t = 0
  foot.walker.stage = BOARDING
  foot.walker.t = 0
  foot.walker.mining = false
  foot.cutter.on = false
  sound(scene, 'board', foot.walker.jet.x, foot.walker.jet.y, foot.walker.jet.z, 1, true)
}

/** in the seat: the ship is his to fly again, and the backpack goes into its hold (what fits) */
function seated(scene: SceneState) {
  const foot = scene.foot
  const j = scene.jets[0]
  foot.stage = ABOARD
  foot.ship = SHIP_WITH
  foot.t = 0
  if (j.fighter) j.fighter.kind = LEADER
  j.lid = 0
  const L = scene.loop.landing
  L.release = true
  L.held = 0
  const carried = takeAll(foot.pack)
  if (carried.length) {
    const left = addItems(scene.loop.hold, carried)
    for (const s of left) addTo(foot.pack, s.id, s.n)
    const went = carried.map((s) => ({ id: s.id, n: s.n - (left.find((l) => l.id === s.id)?.n ?? 0) })).filter((s) => s.n > 0)
    if (went.length) news(scene, 'INTO THE HOLD', itemWords(went, nameOf))
  }
  sound(scene, 'pickup', j.x, j.y, j.z, 1, true)
}

// ── coming down after ejecting

/** the seat's rocket has done its work: he comes down on foot, the way his race does */
export function startFall(scene: SceneState, x: number, y: number, z: number, vx: number, vy: number, vz: number, yaw: number) {
  const foot = scene.foot
  const w = foot.walker
  place(w, x, y, z - FOOT.chest, yaw)
  w.jet.vx = vx
  w.jet.vy = vy
  w.fighter.vz = vz
  w.stage = FALLING
  w.t = 0
  w.open = 0
  w.dive = -1
  w.fighter.hull = FOOT.health
  w.fighter.alive = true
  foot.stage = FALLING
  foot.t = 0
  foot.ship = SHIP_GONE
  foot.shoreT = 0
  foot.glide = false
  // (a stolen ship, lost: the next is his own, and he has lost nothing of his own to pay for)
  foot.owed = !foot.stolen
  endStolen(scene)
}

/** what a footstep at (x, y) falls on, for its sound: built ground (a base, a pad) is metal; the rest is the world's kind (the island world's, its own materials) */
export function groundUnder(scene: SceneState, x: number, y: number): Ground {
  const m = matAt(scene.world, x, y)
  if (m >= FEATURE_MAT) return 'metal'
  const kind = scene.planet?.archetype
  if (kind === 'ice') return 'snow'
  if (kind === 'volcanic' || kind === 'moon') return 'rock'
  if (kind === 'canyon' || kind === 'mesa') return 'sand'
  if (kind) return 'soft'
  // (the island world: 4, 5 sand; 6 … 11 grass and trees; 12 … 14 rock; 15, 16 snow)
  return m < 6 ? 'sand' : m < 12 ? 'soft' : m < 15 ? 'rock' : 'snow'
}

/** coming down: falling freely, then opening (a parachute, a wingsuit, a rotor …) and sinking, steered a little */
function stepFall(scene: SceneState, dt: number) {
  const foot = scene.foot
  const w = foot.walker
  const j = w.jet
  const world = scene.world
  const feet = j.z - FOOT.chest
  const ground = footGround(world, j.x, j.y, feet)
  const f = w.fighter
  // (where he comes down if he keeps on as he goes, and the nearest ground he can stand on, now and then)
  foot.shoreT -= dt
  if (foot.shoreT <= 0) {
    foot.shoreT = DESCENT.lookEvery
    foot.shore = shoreNear(world, j.x, j.y, DESCENT.look)
  }
  const h = Math.max(0, feet - ground)
  const under =
    w.open > 0 || foot.glide
      ? h / (foot.glide ? DESCENT.glideSink : DESCENT.sink)
      : Math.max(0, h - DESCENT.open) / DESCENT.fall + Math.min(h, DESCENT.open) / DESCENT.sink
  foot.down.x = j.x + j.vx * under
  foot.down.y = j.y + j.vy * under
  foot.down.safe = !deadly(world, matAt(world, foot.down.x, foot.down.y))
  // (over deep water, lava or acid, or coming down into it, it opens at once and glides: data/foot.ts DESCENT.glideSink)
  if (w.open === 0 && (!foot.down.safe || deadly(world, matAt(world, j.x, j.y))) && looping(scene)) foot.glide = true
  if (w.open === 0 && !foot.glide && feet - ground > DESCENT.open) f.vz += (-DESCENT.fall - f.vz) * (1 - Math.exp(-dt * 1.4))
  else {
    // (it opens: heard as his race's way down)
    if (w.open === 0) sound(scene, 'deploy', j.x, j.y, j.z, 1, true, w.look.race)
    w.open = Math.min(1, w.open + dt / DESCENT.opening)
    f.vz += (-(foot.glide ? DESCENT.glideSink : DESCENT.sink) - f.vz) * (1 - Math.exp(-dt * 4))
  }
  // steered across the ground with the keys or a stick (gliding, further)
  pushOf(scene, push)
  const k = 1 - Math.exp(-dt * 2)
  const steer = foot.glide ? DESCENT.glideSteer : DESCENT.steer
  j.vx += (push.x * steer - j.vx) * k
  j.vy += (push.y * steer - j.vy) * k
  if (Math.hypot(push.x, push.y) > 0.2) j.yaw = Math.atan2(push.x, -push.y)
  j.x += j.vx * dt
  j.y += j.vy * dt
  j.z += f.vz * dt
  w.t += dt
  if (j.z - FOOT.chest <= ground) landed(scene, ground)
}

/** down: on land (or wading) he walks on; in the sea or lava he is lost */
function landed(scene: SceneState, ground: number) {
  const foot = scene.foot
  const w = foot.walker
  const j = w.jet
  const m = matAt(scene.world, j.x, j.y)
  if (deadly(scene.world, m)) {
    j.z = ground + FOOT.chest
    for (let i = 0; i < 10; i++)
      addSpark(scene, j.x, j.y, ground + 1, jitter(scene, 3) * 30, jitter(scene, 5) * 30, 30 + jitter(scene, 7) * 30, SPARK_WATER)
    die(scene, null, scene.world.look.sea === 'water' ? 'sea' : scene.world.look.sea)
    return
  }
  // (come down in a pocket of the ground he could not walk out of, he scrambles out to open ground near: polish step 9 found
  // a pilot down in a hollow by a cliff, his called ship landed beside it and out of his reach for good)
  const open = openGround(scene.world, j.x, j.y, ground)
  place(w, open.x, open.y, open.z, j.yaw)
  w.stage = WALKING
  w.t = 0
  foot.stage = WALKING
  foot.t = 0
  scene.rig.shake = Math.max(scene.rig.shake, 0.18)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    addSmoke(scene, j.x + Math.cos(a) * 3, j.y + Math.sin(a) * 3, ground + 1, 1.6, Math.cos(a) * 30, Math.sin(a) * 30, 0.7, 0.7, 4)
  }
  sound(scene, 'touchdown', j.x, j.y, j.z, 1, true)
  // (what to do next is the prompt's at the bottom, HOLD F CALL A SHIP: said here as well, it was on the screen twice)
  news(scene, 'DOWN', '', true)
}

// ── on foot

/** the ship of someone else's, parked, that a pilot at (x, y) could climb into (null: none) */
function parkedNear(scene: SceneState, x: number, y: number) {
  let best = null
  let bestD = Infinity
  for (const s of scene.ships) {
    if (!s.parked || !s.jet.fighter || s.jet.fighter.side === SIDE_PLAYER) continue
    const reach = s.mesh.model.w * 0.5 * jetSize(scene.params) + FOOT.reach
    const d = Math.hypot(wrapDelta(s.jet.x - x), wrapDelta(s.jet.y - y))
    if (d < reach && d < bestD) {
      best = s
      bestD = d
    }
  }
  return best ? { ship: best, d: bestD } : null
}

/** how far the pilot's own parked ship is, if it is near enough to climb into (Infinity: it is not) */
function ownNear(scene: SceneState, x: number, y: number) {
  const j = scene.jets[0]
  if (scene.foot.ship !== SHIP_PARKED || j.away || scene.loop.landing.stage !== LANDED) return Infinity
  const reach = scene.mesh.model.w * 0.5 * jetSize(scene.params) + FOOT.reach
  const d = Math.hypot(wrapDelta(j.x - x), wrapDelta(j.y - y))
  return d < reach ? d : Infinity
}

/** what Use would do where he stands (by two ships at once, the nearer is the one) */
function promptOf(scene: SceneState) {
  const foot = scene.foot
  const j = foot.walker.jet
  const own = ownNear(scene, j.x, j.y)
  const other = parkedNear(scene, j.x, j.y)
  // (the world's capture site, if he is nearer its mast than to a ship: traces.ts)
  const site = capturePrompt(scene, j.x, j.y)
  const siteD = site ? siteDistance(scene, j.x, j.y) : Infinity
  if (own < Infinity && (!other || own <= other.d) && own <= siteD) return 'board'
  if (other && other.d <= siteD) return 'steal'
  foot.vein = veinNear(scene, j.x, j.y, VEIN.reach)
  if (foot.vein) return 'mine'
  if (site) return site
  if (wreckNear(scene, j.x, j.y)) return 'salvage'
  if (foot.ship === SHIP_GONE && looping(scene)) return 'call'
  // (his own ship, parked well away: it can be called to him)
  const sj = scene.jets[0]
  if (
    foot.ship === SHIP_PARKED &&
    !sj.away &&
    looping(scene) &&
    Math.hypot(wrapDelta(sj.x - j.x), wrapDelta(sj.y - j.y)) > REDELIVER.recallFar
  )
    return 'recall'
  return ''
}

// scratch
const aim = { x: 0, y: 0, z: 0 }

/** one step on foot: moving, the sidearm, and what Use does */
function stepWalk(scene: SceneState, dt: number) {
  const foot = scene.foot
  const w = foot.walker
  const j = w.jet
  const ctl = scene.controls
  const world = scene.world
  w.t += dt
  foot.diveRest -= dt
  let feet = j.z - FOOT.chest
  // his health comes back, a while after the last hit
  const f = w.fighter
  if (scene.time - f.hitAt > FOOT.healWait && f.hull < f.stats.hull) f.hull = Math.min(f.stats.hull, f.hull + FOOT.healRate * dt)

  // ── moving: the keys or a stick, the way the screen shows; running with the thrusters' control
  pushOf(scene, push)
  const amount = Math.hypot(push.x, push.y)
  const m = matAt(world, j.x, j.y)
  w.wading = shallow(world, m)
  let speed = (ctl.boost > 0.5 ? FOOT.run : FOOT.walk) * (w.wading ? FOOT.wade : 1) * scene.gear.pace
  if (w.mining) speed = 0
  let wantX = push.x * speed
  let wantY = push.y * speed
  if (w.dive >= 0) {
    // a dive: a burst one way, hard to hit
    w.dive += dt
    wantX = Math.sin(w.diveYaw) * FOOT.dive
    wantY = -Math.cos(w.diveYaw) * FOOT.dive
    if (w.dive > FOOT.diveTime) {
      w.dive = -1
      foot.diveRest = FOOT.diveRest
    }
  }
  const k = 1 - Math.exp(-dt * FOOT.grip)
  j.vx += (wantX - j.vx) * (w.dive >= 0 ? 1 : k)
  j.vy += (wantY - j.vy) * (w.dive >= 0 ? 1 : k)
  // the ground decides where he can go: each way on its own, so he slides along a cliff. Up a step at most from where his
  // feet are (in the air, up to them: a jump lands him on a ledge), down any drop (he falls); a wall pushed against he climbs
  const enter = (x: number, y: number) => {
    const m = matAt(world, x, y)
    if (deadly(world, m) || (m >= 4 && !landable(m) && !treeAt(world, x, y)) || blockedByShip(scene, x, y)) return NaN
    return footGround(world, x, y, feet)
  }
  const ok = (h: number) => h === h && h <= feet + FOOT.step
  const nx = j.x + j.vx * dt
  const ny = j.y + j.vy * dt
  let g = enter(nx, ny)
  // (a wall: the ground the way he pushes stands too high to step onto, whether or not he slides along it; its top, to
  // climb to)
  let top = NaN
  if (!ok(g)) for (const h of [g, enter(nx, j.y), enter(j.x, ny)]) if (h === h && h > feet + FOOT.step && !(h <= top)) top = h
  if (ok(g)) {
    j.x = nx
    j.y = ny
  } else if (ok((g = enter(nx, j.y)))) {
    j.x = nx
    j.vy *= 0.5
  } else if (ok((g = enter(j.x, ny)))) {
    j.y = ny
    j.vx *= 0.5
  } else {
    j.vx = 0
    j.vy = 0
    g = footGround(world, j.x, j.y, feet)
  }
  if (foot.airborne) {
    // up and down again: landing on whatever is under him when his feet come down to it
    foot.vz -= FOOT.jump.fall * dt
    feet += foot.vz * dt
    if (feet <= g) {
      feet = g
      foot.airborne = false
      foot.vz = 0
      sound(scene, 'step', j.x, j.y, j.z, 1, true, groundUnder(scene, j.x, j.y))
    }
    foot.wallT = 0
    foot.climbing = false
  } else if (top === top && amount > 0.2 && !w.mining) {
    // pushed against a wall a moment, he climbs it, up to where he can step onto its top
    foot.wallT += dt
    if (foot.wallT > FOOT.wall.grip) {
      foot.climbing = true
      feet = Math.min(top, feet + FOOT.wall.climb * dt)
    }
  } else {
    foot.wallT = 0
    foot.climbing = false
    // off an edge (or let go of a wall half way up): he falls; else up and down terraces, quickly but not in one jump
    if (g < feet - FOOT.step) {
      foot.airborne = true
      foot.vz = 0
    } else feet += clamp(g - feet, -FOOT.climb * dt, FOOT.climb * dt)
  }
  j.z = feet + FOOT.chest
  const moved = Math.hypot(j.vx, j.vy)
  w.moving = clamp(moved / FOOT.run, 0, 1)
  w.step += (moved * dt) / FOOT.stride
  // a footstep now and then (a splash in the water)
  foot.stepT += moved * dt
  if (foot.stepT > 14) {
    foot.stepT = 0
    sound(scene, w.wading ? 'wade' : 'step', j.x, j.y, j.z, w.moving, true, w.wading ? '' : groundUnder(scene, j.x, j.y))
  }

  // ── which way he faces: where he aims while firing or pointing, else the way he goes
  aimOf(scene, foot)
  const pointing = ctl.pointerOn && !ctl.keyMode && ctl.pointerIdle < 2.5
  if (w.dive >= 0) j.yaw = w.diveYaw
  else if (ctl.fire || pointing || w.mining) j.yaw = Math.atan2(foot.aimX, -foot.aimY)
  else if (amount > 0.2) j.yaw = Math.atan2(push.x, -push.y)

  // ── hidden under the trees, or under his cloak (unless he has just fired)
  if (foot.coverT > 0) foot.coverT -= dt
  if (foot.coverRest > 0) foot.coverRest -= dt
  w.hidden = (treeAt(world, j.x, j.y) || foot.coverT > 0) && scene.time - w.firedAt > FOOT.seenAfterFire

  // ── a harsh world bites without the right lining (data/gear.ts)
  foot.exposed = exposure(scene)
  if (foot.exposed && f.alive) {
    f.hull -= EXPOSURE.hurt * dt
    f.hitAt = scene.time
    if (f.hull <= 0) die(scene, null, foot.exposed === 'heat' ? 'heat' : 'cold')
  }

  // ── the sidearm
  foot.gunWait -= dt
  if (ctl.fire && foot.gunWait <= 0 && w.dive < 0) {
    foot.gunWait = 1 / (SIDEARM.rate * (scene.gear.launcher ? LAUNCHER.rate : 1))
    fireSidearm(scene, foot)
  }
  // ── the cloak, if he carries it instead of flares (the secondary weapon)
  if (scene.gear.cover && ctl.secondary && !foot.secondaryWas && foot.coverRest <= 0) {
    foot.coverT = COVER.time
    foot.coverRest = COVER.rest
    sound(scene, 'beacon', j.x, j.y, j.z, 0.6, true)
  }
  // ── a flare, on the secondary weapon (as it goes down)
  if (foot.flares < scene.gear.flares) {
    foot.flareT -= dt
    if (foot.flareT <= 0) {
      foot.flares++
      foot.flareT = FLARE.refill
    }
  }
  if (ctl.secondary && !foot.secondaryWas && foot.flares > 0) {
    if (foot.flares === scene.gear.flares) foot.flareT = FLARE.refill
    foot.flares--
    launchFlare(scene, j.x, j.y, j.z + 2, true)
  }
  foot.secondaryWas = ctl.secondary
  // ── a beacon, on the view button
  if (foot.plant) {
    // (a step ahead of him, where it shows)
    const bx = j.x + Math.sin(j.yaw) * 5
    const by = j.y - Math.cos(j.yaw) * 5
    plantBeacon(scene, bx, by, footGround(world, bx, by, feet), true, '', scene.params.side ? 'YOUR BEACON' : '')
  }
  foot.plant = false

  // ── what lies about: his own chunks of ore, and crates (as much as fits in the pack)
  pickUp(scene, foot)

  // ── Use: climb in, steal, cut a vein, or call a ship
  const pressed = (ctl.use || ctl.land) && !foot.useWas
  const held = ctl.land || ctl.tap > 0
  foot.useWas = ctl.use || ctl.land
  foot.prompt = promptOf(scene)
  w.mining = false
  if (foot.prompt === 'board' && pressed && w.t > 0.3) {
    startBoarding(scene)
    return
  }
  if (foot.prompt === 'steal' && pressed) {
    const s = parkedNear(scene, j.x, j.y)?.ship
    if (s) {
      foot.stealing = s.id
      report(scene, { kind: 'steal', target: s.id })
      startBoarding(scene)
      return
    }
  }
  // (the hand cutter on the mining key, as the ship's laser is)
  w.mining = foot.prompt === 'mine' && ctl.mine && !!foot.vein
  cutVein(scene, foot, foot.prompt === 'mine' ? foot.vein : null, w.mining, dt)
  // a flag at the capture site (held), a wreck stripped (pressed)
  plantStep(scene, dt, foot.prompt === 'flag' && held, j.x, j.y)
  if (foot.prompt === 'salvage' && pressed) {
    const m = wreckNear(scene, j.x, j.y)
    if (m) salvage(scene, m, foot.pack, foot.gathered)
  }
  if ((foot.prompt === 'call' || foot.prompt === 'recall') && held) {
    foot.useHeld += dt
    if (foot.useHeld >= REDELIVER.hold) callShip(scene)
  } else foot.useHeld = 0
  flushGathered(scene, foot)
}

/** the player's own parked ship stands in his way (he walks round it, not through it) */
function blockedByShip(scene: SceneState, x: number, y: number) {
  const j = scene.jets[0]
  if (j.away || scene.foot.ship !== SHIP_PARKED) return false
  const r = scene.mesh.model.w * 0.32 * jetSize(scene.params)
  const was = Math.hypot(wrapDelta(j.x - scene.foot.walker.jet.x), wrapDelta(j.y - scene.foot.walker.jet.y))
  const now = Math.hypot(wrapDelta(j.x - x), wrapDelta(j.y - y))
  return now < r && now < was
}

/**
 * Which way the sidearm aims (left in foot.aimX, aimY): at the pointer if it is in use, else the way
 * he faces; then turned onto the enemy most nearly in line within reach (its lead point, up or down).
 */
function aimOf(scene: SceneState, foot: Foot) {
  const ctl = scene.controls
  const w = foot.walker
  const j = w.jet
  const view = scene.view
  let ax = Math.sin(j.yaw)
  let ay = -Math.cos(j.yaw)
  if (ctl.pointerOn && !ctl.keyMode && ctl.pointerIdle < 2.5 && scene.screen.w > 0) {
    // the pointer, from where he stands on the screen, as a way across the ground
    const sx = ctl.pointerX - view.cx - (j.x - view.x) * view.cos + (j.y - view.y) * view.sin
    const sy = ctl.pointerY - view.cy - ((j.x - view.x) * view.sin + (j.y - view.y) * view.cos) + (j.z - view.alt)
    const wx = sx * view.cos + sy * view.sin
    const wy = -sx * view.sin + sy * view.cos
    const n = Math.hypot(wx, wy)
    if (n > 2) {
      ax = wx / n
      ay = wy / n
    }
  }
  foot.aimX = ax
  foot.aimY = ay
  // the aim assist: the enemy nearest the line, within reach
  foot.aimAt = null
  let best = SIDEARM.assist
  for (const t of scene.fighters) {
    if (t.side === SIDE_PLAYER || !t.alive || t === w.fighter) continue
    const dx = wrapDelta(t.jet.x - j.x)
    const dy = wrapDelta(t.jet.y - j.y)
    const d = Math.hypot(dx, dy)
    if (d > SIDEARM.range || d < 1 || t.jet.z - j.z > 60) continue
    const off = Math.abs(wrapAngle(Math.atan2(dx, -dy) - Math.atan2(ax, -ay)))
    if (off < best) {
      best = off
      foot.aimAt = t
    }
  }
  // (or a creature of the world, more nearly in line than any enemy)
  const beast = creatureInSights(scene, j.x, j.y, ax, ay, SIDEARM.range, best)
  foot.aimBeast = beast ? beast.c : null
  if (beast) foot.aimAt = null
}

/** a bolt from the sidearm, along the aim (onto the enemy it is turned to, leading him a little) */
function fireSidearm(scene: SceneState, foot: Foot) {
  const w = foot.walker
  const j = w.jet
  const hx = j.x + foot.aimX * 2
  const hy = j.y + foot.aimY * 2
  const hz = j.z
  const t = foot.aimAt
  const c = foot.aimBeast
  if (t) {
    const d = Math.hypot(wrapDelta(t.jet.x - hx), wrapDelta(t.jet.y - hy), t.jet.z - hz)
    const time = d / SIDEARM.speed
    aim.x = wrapDelta(t.jet.x + t.jet.vx * time * 0.8 - hx)
    aim.y = wrapDelta(t.jet.y + t.jet.vy * time * 0.8 - hy)
    aim.z = t.jet.z - hz
  } else if (c) {
    const tz = c.z + c.kind.middle
    const d = Math.hypot(wrapDelta(c.x - hx), wrapDelta(c.y - hy), tz - hz)
    const time = d / SIDEARM.speed
    aim.x = wrapDelta(c.x + c.vx * time * 0.8 - hx)
    aim.y = wrapDelta(c.y + c.vy * time * 0.8 - hy)
    aim.z = tz - hz
  } else {
    aim.x = foot.aimX
    aim.y = foot.aimY
    aim.z = 0
  }
  const n = Math.hypot(aim.x, aim.y, aim.z) || 1
  aim.x /= n
  aim.y /= n
  aim.z /= n
  boltFrom(scene, w.fighter, hx, hy, hz, aim, scene.gear.launcher)
  w.firedAt = scene.time
  addStar(scene, hx, hy, hz, 0.6, STAR_MUZZLE)
  sound(scene, 'blaster', hx, hy, hz, 1, true)
}

/** the hand tool cuts a vein: a unit at a time goes straight into the backpack */
function cutVein(scene: SceneState, foot: Foot, v: Vein | null, on: boolean, dt: number) {
  const c = foot.cutter
  if (!v) {
    stepCut(scene, c, dt, -1, 0, 0, 0, 'ferrite', false, 0, 0, true)
    return
  }
  const left = veinLeft(scene, v)
  const room = roomFor(foot.pack, v.ore)
  // (a full pack: the cutter does not cut, and says so)
  if (on && room <= 0) {
    if (scene.time - scene.loop.fullAt > 2.5) {
      scene.loop.fullAt = scene.time
      news(scene, 'PACK FULL', 'CLIMB ABOARD TO EMPTY IT', false)
    }
    on = false
  }
  const freed = stepCut(
    scene,
    c,
    dt,
    v.id,
    v.x,
    v.y,
    v.z + 1,
    v.ore,
    on,
    VEIN.rate * scene.gear.cut,
    Math.min(VEIN.batch, left, room),
    true,
  )
  if (freed <= 0) return
  const n = addTo(foot.pack, v.ore, Math.min(freed, left))
  if (n <= 0) return
  const epoch = veinPeriod(v, nowOf(scene))
  takeFromVein(scene, v, epoch, n)
  report(scene, { kind: 'vein', vein: v.id, epoch, n })
  foot.gathered.set(v.ore, (foot.gathered.get(v.ore) ?? 0) + n)
  popOf(scene, v.ore, n, v.x, v.y, v.z + 1, true)
  if (left - n <= 0) news(scene, 'VEIN CUT OUT', 'IT COMES BACK IN A WHILE', false)
}

/** his own chunks of ore and the crates he walks over go into the backpack, as much as fits */
function pickUp(scene: SceneState, foot: Foot) {
  const j = foot.walker.jet
  const feet = j.z - FOOT.chest
  const list = scene.loop.chunks
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    if (!c.own || !c.still || c.pulled >= 0) continue
    if (Math.abs(wrapDelta(c.x - j.x)) > FOOT.pick || Math.abs(wrapDelta(c.y - j.y)) > FOOT.pick || Math.abs(c.z - feet) > 6) continue
    if (addTo(foot.pack, c.ore, 1) === 0) continue
    list.splice(i, 1)
    foot.gathered.set(c.ore, (foot.gathered.get(c.ore) ?? 0) + 1)
    sound(scene, 'scoop', j.x, j.y, j.z, 0.6, true)
  }
  for (const c of scene.loop.crates) {
    if (scene.time - c.born < (c.own ? CRATE.ownWait : 1.2)) continue
    if (Math.hypot(wrapDelta(c.x - j.x), wrapDelta(c.y - j.y)) > FOOT.pick + 2 || Math.abs(c.z - feet) > 8) continue
    crateTake(scene, c, foot.pack, j)
    break
  }
}

/** what was cut or picked up goes in the ledger now and then */
function flushGathered(scene: SceneState, foot: Foot) {
  if (!foot.gathered.size || ((scene.time * 0.5) | 0) === (((scene.time - 1 / 60) * 0.5) | 0)) return
  record(scene, { kind: 'mined', items: [...foot.gathered].map(([id, n]) => ({ id, n })) as Items, world: scene.worldKey })
  foot.gathered.clear()
}

// ── a new ship, called to where he stands

/** he calls a ship: it comes in REDELIVER.time seconds, for its fee */
function callShip(scene: SceneState) {
  const foot = scene.foot
  // (his own ship, parked: it lifts and flies to him, quicker, keeping the hurt it has; else a new one comes)
  const recall = foot.ship === SHIP_PARKED
  if (recall) {
    const j = scene.jets[0]
    foot.recallHull = j.fighter ? j.fighter.hull : -1
    j.away = true
    scene.loop.landing.stage = FLYING
    scene.loop.landing.base = null
  }
  foot.ship = SHIP_COMING
  foot.callT = recall ? REDELIVER.recall : REDELIVER.time
  foot.useHeld = 0
  const fee = foot.owed ? (REDELIVERY[scene.params.hull] ?? 0) : 0
  news(scene, 'SHIP CALLED', fee > 0 ? `IT COMES IN ${foot.callT} SECONDS  ${fee} CR` : `IT COMES IN ${foot.callT} SECONDS`)
  sound(scene, 'call', foot.walker.jet.x, foot.walker.jet.y, foot.walker.jet.z, 1, true)
}

/**
 * Flat ground near the pilot for a ship to set down on, out of his way: the nearest flat open spot within 70 px; else the
 * nearest ground there with no tree on it, flat or not; else a flat clearing further out, to 160 px (the fresh review saw a
 * called ship land on the treetops in a forest); else beside him.
 */
function spotNear(scene: SceneState, x: number, y: number) {
  const world = scene.world
  const r = scene.mesh.model.l * LAND.footprint * jetSize(scene.params)
  let open: { x: number; y: number; ground: number } | null = null
  // (twelve ways round out to 70 px, as it always looked; failing that the nearest ground with no tree on it there, then
  // sixteen ways round, further out: the nearest flat clearing a forest has)
  for (let ring = 22; ring <= 160; ring += 8) {
    if (ring > 70 && open) return open
    for (let i = 0, n = ring <= 70 ? 12 : 16; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + ring * 0.37
      const sx = x + Math.sin(a) * ring
      const sy = y - Math.cos(a) * ring
      if (!open && ring <= 70) {
        const m = matAt(world, sx, sy)
        if (m >= 4 && landable(m) && !treeAt(world, sx, sy)) open = { x: sx, y: sy, ground: groundAt(world, sx, sy) }
      }
      let lo = 99
      let hi = 0
      let ok = true
      for (let u = -1; u <= 1 && ok; u++)
        for (let v = -1; v <= 1; v++) {
          const m = matAt(world, sx + u * r, sy + v * r)
          if (m < 4 || !landable(m) || treeAt(world, sx + u * r, sy + v * r)) {
            ok = false
            break
          }
          const h = groundAt(world, sx + u * r, sy + v * r)
          lo = Math.min(lo, h)
          hi = Math.max(hi, h)
        }
      if (ok && hi - lo <= LAND.flat) return { x: sx, y: sy, ground: hi }
    }
  }
  return open ?? { x: x + 20, y, ground: groundAt(world, x + 20, y) }
}

/** the wait for a called ship; near the end it comes in and sets down near him */
function stepCall(scene: SceneState, dt: number) {
  const foot = scene.foot
  if (foot.ship !== SHIP_COMING) return
  const j = scene.jets[0]
  foot.callT -= dt
  if (foot.callT <= REDELIVER.brake && j.away && scene.loop.landing.stage === FLYING) {
    // it comes in from far off, low, braking onto a spot beside him
    const w = foot.walker.jet
    const spot = spotNear(scene, w.x, w.y)
    const from = hash8((scene.time * 60) | 0) / 255
    const a = from * Math.PI * 2
    const fresh = makeJet(spot.x - Math.sin(a) * REDELIVER.from, spot.y + Math.cos(a) * REDELIVER.from, spot.ground + REDELIVER.height, a)
    fresh.vx = Math.sin(a) * 210
    fresh.vy = -Math.cos(a) * 210
    fresh.lid = 0
    scene.jets[0] = fresh
    scene.speed = 210
    startLanding(scene, fresh, { x: spot.x, y: spot.y, rest: restOn(scene, spot.ground), base: null, brake: REDELIVER.brake })
    scene.loop.landing.release = true
  }
}

/** the called ship is down beside him (landing.ts calls this as it touches down with nobody aboard) */
export function delivered(scene: SceneState) {
  const foot = scene.foot
  const j = scene.jets[0]
  foot.ship = SHIP_PARKED
  foot.callT = 0
  const fee = foot.owed ? (REDELIVERY[scene.params.hull] ?? 0) : 0
  if (fee > 0 && looping(scene)) record(scene, { kind: 'fee', credits: fee, hull: scene.params.hull })
  foot.owed = false
  const f = newShipFighter(scene, PARKED)
  // (his own ship called to him keeps the hurt it had)
  if (foot.recallHull >= 0) f.hull = Math.min(f.hull, foot.recallHull)
  foot.recallHull = -1
  j.lid = 1
  // (down, it shuts itself down to wait for him)
  shutDown(scene)
  scene.room.life++
  news(scene, 'SHIP DELIVERED', fee > 0 ? `${fee} CR` : '')
}

/** a whole new fighter for the player's ship (a new ship, or one brought to a base) */
function newShipFighter(scene: SceneState, kind: number) {
  const j = scene.jets[0]
  const f = createFighter(kind, SIDE_PLAYER, j, scene.mesh, scene.paint)
  f.protect = kind === LEADER ? DAMAGE.protect : 0
  return f
}

// ── dying, and coming back

/** the pilot on foot is killed (by `by`, or by the sea or lava: `how`) */
export function die(scene: SceneState, by: Fighter | null, how = '') {
  const foot = scene.foot
  const w = foot.walker
  const j = w.jet
  w.fighter.alive = false
  w.fighter.hull = 0
  w.stage = DEAD
  w.t = 0
  w.mining = false
  foot.cutter.on = false
  w.dive = -1
  foot.stage = DEAD
  foot.t = 0
  foot.how = how
  foot.stealing = 0
  // a called ship does not come
  if (foot.ship === SHIP_COMING) {
    foot.ship = SHIP_GONE
    if (scene.loop.landing.stage === LANDING) {
      scene.loop.landing.stage = FLYING
      scene.jets[0].away = true
    }
  }
  // the backpack drops where he fell
  if (unitsIn(foot.pack) > 0) {
    const items = takeAll(foot.pack)
    spill(scene, j.x, j.y, j.z - FOOT.chest + 1, items, true)
    record(scene, { kind: 'lost', items, world: scene.worldKey })
  }
  report(scene, { kind: 'died', by: idOf(scene, by) })
  // (a grave where he fell, for others to find)
  if (looping(scene)) deed(scene, { kind: 'grave', x: j.x, y: j.y, z: j.z - FOOT.chest, n: 0 })
  sound(scene, 'die', j.x, j.y, j.z, 1, true)
  scene.rig.shake = Math.max(scene.rig.shake, 0.3)
}

/** back: at the nearest friendly base, in his ship (a new one, for its fee, if it was lost) */
function respawn(scene: SceneState) {
  const foot = scene.foot
  const j = foot.walker.jet
  const home = nearestBase(scene, j.x, j.y)
  const lost = foot.ship !== SHIP_PARKED
  if (foot.stolen) endStolen(scene)
  foot.stage = ABOARD
  foot.ship = SHIP_WITH
  foot.t = 0
  foot.walker.stage = WALKING
  foot.walker.fighter.alive = true
  foot.walker.fighter.hull = FOOT.health
  foot.flares = scene.gear.flares
  const fresh = makeJet(j.x, j.y, j.z, 0)
  scene.jets[0] = fresh
  newShipFighter(scene, LEADER)
  if (lost) {
    const fee = foot.owed ? (REDELIVERY[scene.params.hull] ?? 0) : 0
    if (fee > 0 && looping(scene)) record(scene, { kind: 'fee', credits: fee, hull: scene.params.hull })
    foot.owed = false
    scene.loop.hold.slots.fill(null)
  }
  scene.room.life++
  if (home) parkOn(scene, home.base)
  sound(scene, 'pickup', fresh.x, fresh.y, fresh.z, 1, true)
}

// ── stealing

/** the owner's game gave the ship up: the thief climbs in and flies it, with what was in its hold */
export function stealGranted(scene: SceneState, shipId: number, items: Items, owner: string) {
  const foot = scene.foot
  if (foot.stealing !== shipId) return
  const s = scene.ships.find((x) => x.id === shipId)
  foot.stealing = 0
  if (!s) {
    stealFailed(scene)
    return
  }
  // his own ship, if it was parked somewhere, goes home by itself: it is his, and comes again when he calls (the news says so)
  const ownParked = foot.ship === SHIP_PARKED
  foot.owed = false
  // the stolen ship takes the place of his own, where it stands, landed
  const j = makeJet(s.jet.x, s.jet.y, s.jet.z, s.jet.yaw)
  scene.jets[0] = j
  foot.stolen = { hull: s.mesh.model.name, ...s.colours, owner }
  scene.mesh = s.mesh
  paintShip(scene.paint, s.mesh.model, s.colours, scene.params.timeOfDay)
  const L = scene.loop.landing
  L.stage = LANDED
  L.t = 99
  L.x = j.x
  L.y = j.y
  L.rest = j.z
  L.base = null
  scene.ships.splice(scene.ships.indexOf(s), 1)
  scene.loop.hold = createHold(s.mesh.model.name, 0)
  addItems(scene.loop.hold, items)
  newShipFighter(scene, LEADER).protect = 0
  foot.ship = SHIP_PARKED
  news(scene, 'STOLEN', `${owner}'S ${s.mesh.model.name.toUpperCase()}${ownParked ? ' · YOURS FLIES HOME' : ''}`)
}

/** the owner's game would not give it up (he got there first, or it is gone) */
export function stealFailed(scene: SceneState) {
  const foot = scene.foot
  foot.stealing = 0
  if (foot.stage === BOARDING) {
    foot.stage = WALKING
    foot.walker.stage = WALKING
    foot.walker.t = 0
  }
}

/** the stolen ship is done with (lost, left, or handed in at a base): the pilot's own hull is his again */
export function endStolen(scene: SceneState) {
  const foot = scene.foot
  if (!foot.stolen) return
  foot.stolen = null
  scene.mesh = meshFor(scene.params)
  const p = scene.params
  paintShip(scene.paint, scene.mesh.model, coloursOf(p), p.timeOfDay)
  // (his own hold again: what was in the stolen one has been banked, spilled or taken by now)
  scene.loop.hold = createHold(p.hull, scene.parts.slots)
}

/** a thief lands a stolen ship at a friendly base: a reward, and his own ship waits for him there instead */
export function handedIn(scene: SceneState) {
  const foot = scene.foot
  if (!foot.stolen) return
  const credits = Math.round(STEAL.reward * statsOf(scene.mesh.model.name).hull)
  record(scene, { kind: 'bounty', credits, what: 'stolen ship' })
  news(scene, 'STOLEN SHIP HANDED IN', `+${credits} CR`)
  const j = scene.jets[0]
  endStolen(scene)
  newShipFighter(scene, LEADER)
  j.lid = 0
}

/** another pilot climbs into the player's parked ship: it is his, with what is in its hold (true if it was given up) */
export function yieldShip(scene: SceneState): Items | null {
  const foot = scene.foot
  if (foot.stage === ABOARD || foot.stage === BOARDING || foot.ship !== SHIP_PARKED) return null
  const j = scene.jets[0]
  const items = takeAll(scene.loop.hold)
  if (items.length) record(scene, { kind: 'lost', items, world: scene.worldKey })
  scene.room.life++
  j.away = true
  j.fighter = null
  scene.loop.landing.stage = FLYING
  scene.loop.landing.base = null
  foot.ship = SHIP_GONE
  foot.owed = !foot.stolen
  if (foot.stolen) endStolen(scene)
  news(scene, 'SHIP STOLEN', '', false)
  sound(scene, 'lift', j.x, j.y, j.z, 1, false)
  return items
}

// ── one step

export function stepFoot(scene: SceneState, dt: number) {
  const foot = scene.foot
  foot.t += dt
  const w = foot.walker
  switch (foot.stage) {
    case FALLING:
      stepFall(scene, dt)
      break
    case WALKING:
      stepWalk(scene, dt)
      break
    case BOARDING: {
      // up into the seat
      w.t += dt
      w.jet.vx = 0
      w.jet.vy = 0
      if (foot.stealing) {
        if (w.t > STEAL.wait) stealFailed(scene)
        break
      }
      const j = scene.jets[0]
      const seat = seatPoint(scene, j)
      const u = clamp(w.t / FOOT.board, 0, 1)
      w.jet.x += (seat.x - w.jet.x) * Math.min(1, dt * 10)
      w.jet.y += (seat.y - w.jet.y) * Math.min(1, dt * 10)
      w.jet.z += (seat.z - w.jet.z) * Math.min(1, dt * 10)
      j.lid = 1 - Math.max(0, u - 0.6) / 0.4
      if (u >= 1) seated(scene)
      break
    }
    case DEAD:
      w.t += dt
      if (foot.t > RESPAWN.wait) respawn(scene)
      break
  }
  stepCall(scene, dt)
  foot.prompt = foot.stage === WALKING ? foot.prompt : ''
}

/** where the seat of a ship is, roughly (its cockpit), for a pilot climbing in */
function seatPoint(scene: SceneState, j: Jet) {
  const ax = axes(j)
  const sc = jetSize(scene.params)
  const b = scene.mesh.seatB * sc
  return { x: j.x + b * ax.fx, y: j.y + b * ax.fy, z: j.z + scene.mesh.seatH * sc }
}

/** the player's walker's fighter, while he is on his feet (null otherwise) */
export function walkerFighter(scene: SceneState): Fighter | null {
  const foot = scene.foot
  if (foot.stage !== WALKING && foot.stage !== BOARDING) return null
  return foot.walker.fighter.alive ? foot.walker.fighter : null
}

/** the player's parked ship's fighter, while it stands empty (one is made for a ship that has none) */
export function parkedFighter(scene: SceneState): Fighter | null {
  const foot = scene.foot
  const j = scene.jets[0]
  if (foot.stage === ABOARD || foot.ship !== SHIP_PARKED || j.away) return null
  if (!j.fighter || j.fighter.mesh !== scene.mesh) newShipFighter(scene, PARKED)
  const f = j.fighter!
  return f.alive ? f : null
}

/** whether the world he stands on bites him without the right lining: a volcanic world burns, an ice world freezes */
function exposure(scene: SceneState): '' | 'heat' | 'cold' {
  const kind = scene.planet?.archetype
  if (kind === 'volcanic' && scene.gear.lining !== 'heat') return 'heat'
  if (kind === 'ice' && scene.gear.lining !== 'cold') return 'cold'
  return ''
}

/** the backpack's slots as the pack worn says (what does not fit any more stays in the slots kept) */
export function refitPack(scene: SceneState) {
  const slots = scene.foot.pack.slots
  const n = scene.gear.slots
  if (slots.length === n) return
  scene.foot.pack.slots = Array.from({ length: n }, (_, i) => slots[i] ?? null)
  scene.foot.flares = Math.min(scene.foot.flares, scene.gear.flares)
}

/** the camera's pull: how many times larger the art pixels are (FOOT.zoom on foot, INSIDE.zoom inside; 1 flying) */
export function zoomOf(scene: SceneState) {
  const foot = scene.foot
  // (every place inside at one art pixel: the pilot and the people round him one size in every room)
  if (scene.zone.kind === 'interior' || scene.interior.flying) return INSIDE.zoom
  if (foot.stage === WALKING || foot.stage === BOARDING || foot.stage === DEAD)
    return foot.stage === BOARDING && foot.walker.t > FOOT.board * 0.7 ? 1 : FOOT.zoom
  if (foot.stage === FALLING) {
    const w = foot.walker.jet
    return w.z - FOOT.chest - groundAt(scene.world, w.x, w.y) < 40 ? FOOT.zoom : 1
  }
  return 1
}

/** the player's ship was lost while he was out of it (shot to pieces where it stood) */
export function parkedLost(scene: SceneState) {
  const foot = scene.foot
  const j = scene.jets[0]
  // (the next ship is another: the network numbers each pilot's ships)
  scene.room.life++
  j.away = true
  scene.loop.landing.stage = FLYING
  scene.loop.landing.base = null
  foot.ship = SHIP_GONE
  foot.owed = !foot.stolen
  if (foot.stolen) endStolen(scene)
  news(scene, 'SHIP LOST', '', false)
}

/**
 * A jump (Roll, on foot: Space): up off the ground, over what a step will not take him onto; going somewhere, a leap, a
 * quick dash that way as well, hard to hit (the dive it was). Not again until he is down; from a wall he is climbing, a
 * push up it.
 */
export function dive(scene: SceneState) {
  const foot = scene.foot
  const w = foot.walker
  if (foot.stage !== WALKING || w.mining || (foot.airborne && !foot.climbing)) return
  foot.airborne = true
  foot.vz = FOOT.jump.up
  foot.climbing = false
  pushOf(scene, push)
  if (Math.hypot(push.x, push.y) > 0.2 && w.dive < 0 && foot.diveRest <= 0) {
    w.dive = 0
    w.diveYaw = Math.atan2(push.x, -push.y)
  }
  sound(scene, 'dive', w.jet.x, w.jet.y, w.jet.z, 1, true)
}

/** the HUD's word for what Use would do on foot */
export function footPrompt(scene: SceneState) {
  return scene.foot.stage === WALKING ? scene.foot.prompt : ''
}
