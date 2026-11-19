// The camera rig. There are three views — overhead, behind the jet, and from the pilot's
// seat — but only one camera: each view is a pose, and the frame shows a blend of the three.
// The rig decides the blend and where the camera is; updateView() turns that into the
// numbers the renderer projects with (render/view.ts).

import { axes, jetSize, rollOf, spinOf } from '../jet/jet'
import type { Jet } from '../jet/jet'
import type { SceneParams, ViewMode } from '../params'
import type { SceneState } from '../state'
import { clamp, wrapAngle } from '../util/math'
import { groundAt } from '../world/world'
import { deckTop, skyOf } from '../world/sky'
import { ceilingOf } from '../params'
import { EJ_CHUTE, EJ_DROP, EJ_FLY, EJ_ROCKET, focus } from './ejection'
import { ABOARD, zoomOf } from './foot'
import { LANDED } from './landing'
import { FOOT } from '../data/foot'
import { AIR } from '../data/space'
import { smooth } from './air'

export const COCKPIT_LOOK = 64 // the cockpit view is centred this far ahead of the jet, px
export const COCKPIT_EYE = 3 // the pilot's eyes, px above the jet's middle

export interface CameraRig {
  /** the view the camera is in, or heading for: 0 overhead, 1 behind the jet, 2 in the cockpit */
  target: number
  /**
   * How much of the chase and cockpit views the camera is in. Each weight glides to its goal
   * through three soft stages, so a change starts and ends gently, goes straight from any
   * view to any other, and can be redirected half-way without a jolt.
   */
  wChase: number[]
  wCockpit: number[]
  /** the point the view is centred on, as it trails the jet (the cockpit locks on instead) */
  follow: { x: number; y: number; alt: number }
  /** heading of the overhead camera (it turns part of the way with the jet) */
  topYaw: number
  /** heading of the chase camera (lags the jet a little in turns) */
  chaseYaw: number
  /** how far the chase heading is from the overhead one, kept continuous */
  yawDiff: number
  /** 1 while the camera is going round with a roll that began in the cockpit */
  spin: number
  /** how far the chase camera is moved up or down to stay clear of hills and clouds, px */
  fix: number
  /** the lowest the chase camera may sit right now, px */
  floor: number
  /** 0..1: how far the camera has moved round to watch an ejection */
  cine: number
  /** 0..1: how far it has drawn back, to keep the pilot and the crash in one picture */
  wide: number
  /**
   * In space, flown free: the way the camera behind the ship looks and its own up (unit, in the world), which come round to
   * the ship's a beat late; and how far (0..1) the camera is one that looks where the ship points (it is not on the way down
   * to a world, or docking, where the ship is flown level and the old camera's lean serves)
   */
  camF: number[]
  camU: number[]
  free: number
  /** how hard the picture shakes (an explosion) */
  shake: number
}

/** a quarter turn: on foot the overhead camera stands square to the world's grid, at a whole number of these */
const QUARTER = Math.PI / 2
/** the most the camera is left above or below the ship it follows, px (a fast climb or dive) */
const ALT_LAG = 34

/** the pilot is out of his ship (on foot, coming down, or on the seat's rocket in the loop): the camera is overhead */
const isAfoot = (scene: SceneState) => scene.foot.stage !== ABOARD || (scene.eject.foot && scene.eject.stage !== EJ_FLY)

export const viewIndex = (v: ViewMode) => (v === 'cockpit' ? 2 : v === 'chase' ? 1 : 0)
export const viewName = (index: number): ViewMode => (index === 2 ? 'cockpit' : index === 1 ? 'chase' : 'top')

export function createRig(p: SceneParams): CameraRig {
  const target = viewIndex(p.view)
  return {
    target,
    wChase: [0, 0, 0].fill(target === 1 ? 1 : 0),
    wCockpit: [0, 0, 0].fill(target === 2 ? 1 : 0),
    follow: { x: 0, y: 0, alt: p.altitude },
    topYaw: 0,
    chaseYaw: 0,
    yawDiff: 0,
    spin: 0,
    fix: 0,
    floor: 0,
    cine: 0,
    wide: 0,
    camF: [0, -1, 0],
    camU: [0, 0, 1],
    free: 0,
    shake: 0,
  }
}

/**
 * How far (0..1) the camera is space's own, which looks where the ship's nose points (sim/spaceflight.ts): all of it
 * while the pilot's ship is flown free, and at the top of a world's air; down through the air it goes over to the sky's
 * camera, level and looking down at the world (data/space.ts AIR.cam), so nothing jumps where space and the air meet
 */
function flownFree(scene: SceneState) {
  if (scene.zone.kind !== 'space' || scene.eject.stage !== EJ_FLY || scene.interior.flying || isAfoot(scene)) return 0
  const tr = scene.travel
  return tr.kind === 'down' || tr.kind === 'out' ? 1 - smooth(AIR.cam[0], AIR.cam[1], tr.e) : 1
}

/** a unit vector, in place (left as it is if it has no length) */
function unit(v: number[]) {
  const d = Math.hypot(v[0], v[1], v[2])
  if (d > 1e-9) {
    v[0] /= d
    v[1] /= d
    v[2] /= d
  }
  return v
}

/** the ship's forward and its up as the camera behind it takes them: its bank and its rolls left out (the ship banks, the picture does not), unless it is rolling upright off its back */
const shipF = [0, 0, 0]
const shipU = [0, 0, 0]
function poseBehind(j: Jet) {
  const ax = axes(j)
  shipF[0] = ax.fx
  shipF[1] = ax.fy
  shipF[2] = ax.fz
  const banking = Math.abs(wrapAngle(j.roll)) <= 1
  const b = banking ? rollOf(j) : 0
  const cb = Math.cos(b)
  const sb = Math.sin(b)
  shipU[0] = ax.ux * cb - ax.rx * sb
  shipU[1] = ax.uy * cb - ax.ry * sb
  shipU[2] = ax.uz * cb - ax.rz * sb
}

/** the yaw, pitch and roll of a camera that looks along `F` with `U` up (unit, square to each other), as the view takes them */
const pose = { yaw: 0, pitch: 0, roll: 0 }
function poseOf(F: number[], U: number[]) {
  const h = Math.hypot(F[0], F[1])
  let ex: number
  let ey: number
  if (h > 1e-3) {
    ex = F[0] / h
    ey = F[1] / h
  } else {
    // (straight up or straight down: level ahead is where its up, or its belly, points)
    const g = Math.hypot(U[0], U[1]) || 1
    const k = F[2] > 0 ? -1 : 1
    ex = (k * U[0]) / g
    ey = (k * U[1]) / g
  }
  pose.yaw = Math.atan2(-ex, -ey)
  pose.pitch = Math.asin(clamp(F[2], -1, 1))
  const cp = Math.cos(pose.pitch)
  const sp = Math.sin(pose.pitch)
  // (against the up and the right of a camera that looks the same way and is not rolled)
  const along = U[0] * -ex * sp + U[1] * -ey * sp + U[2] * cp
  const across = U[0] * -ey + U[1] * ex
  pose.roll = Math.atan2(across, along)
}

/** works out this frame's view from where the rig is */
export function updateView(scene: SceneState) {
  const { params: p, view, rig, flight } = scene
  const { w: W, h: H } = scene.screen
  const sc = jetSize(p)
  const lead = focus(scene)
  const top = 1 - view.chase - view.cockpit
  let square = false
  // (on foot, and landed: under the clouds, they show only as their shadows; over a landed ship they hid it)
  view.under = zoomOf(scene) > 1 || (scene.loop.landing.stage === LANDED && scene.zone.kind === 'surface')
  // (the shake setting tones it down, or out, for a player it bothers)
  const jolt = rig.shake > 0 ? rig.shake * 3.2 * clamp(p.shake, 0, 1) : 0
  view.cx = (W >> 1) + Math.round(Math.sin(scene.time * 91) * jolt)
  view.x = rig.follow.x
  view.y = rig.follow.y
  view.alt = rig.follow.alt
  if ((view.chase === 0 && view.cockpit === 0) || !lead) {
    // the plain overhead view, exactly
    view.q = 0
    view.tan = 1
    view.lean = 1
    view.scale = 1
    view.cy = H >> 1
    view.steerY = view.cy
    view.roll = 0
    view.pitch = 0
    view.jetFade = 1
    view.lift = 1
    view.yaw = rig.topYaw
    // On foot, once the camera stands square: the picture moves a whole art pixel at a time, at a whole pixel from him. The
    // ground is then drawn exactly, never resampled, so it slides under him without a pixel changing; and he, his ship and
    // the ground move as one (James's first play: on foot the picture shimmered, "almost scan lines").
    if (lead && isAfoot(scene) && rig.topYaw === Math.round(rig.topYaw / QUARTER) * QUARTER) {
      view.x = Math.round(lead.x) + Math.round(view.x - lead.x)
      view.y = Math.round(lead.y) + Math.round(view.y - lead.y)
      view.alt = Math.round(lead.z) + Math.round(view.alt - lead.z)
      square = true
    }
  } else {
    // Each view is a camera pose; the frame shows a blend of the three.
    // chase: behind the jet (under boost it closes in a little, which widens the view)
    // (while the pilot is out of the jet it also draws back and lifts, to take everything in)
    const dist = clamp(p.chaseDistance, 1, 8) * scene.mesh.model.l * sc * (1 - 0.16 * scene.boost) * (1 + 0.2 * rig.cine)
    // (the ship's size: its span, or most of its length for a narrow one, so a needle is not drawn several times over)
    const size = Math.max(scene.mesh.model.w, scene.mesh.model.l * 0.7) * sc
    const zoom = Math.max(1, (clamp(p.chaseSize, 0.05, 0.6) * W) / size) * (1 - 0.16 * rig.cine - 0.36 * rig.wide)
    // cockpit: at the pilot's eyes, looking at a point ahead of the nose
    const focalIn = W * 0.6 * (1 - 0.1 * scene.boost)
    const ahead = COCKPIT_LOOK * view.cockpit
    const sn = Math.sin(lead.yaw)
    const cs = Math.cos(lead.yaw)
    view.x += (lead.x + sn * ahead - rig.follow.x) * view.cockpit
    view.y += (lead.y - cs * ahead - rig.follow.y) * view.cockpit
    view.alt += (lead.z + COCKPIT_EYE * sc - rig.follow.alt) * view.cockpit
    view.q = view.chase / dist + view.cockpit / COCKPIT_LOOK
    view.scale = Math.exp(view.chase * Math.log(zoom) + view.cockpit * Math.log(focalIn / COCKPIT_LOOK))
    // how steeply it looks down: 45° overhead, the chase angle behind, level in the cockpit.
    // The chase camera drops behind the jet as it climbs and rises over it as it dives, and
    // camFix lifts or lowers it to stay clear of the hills and out of the cloud layer.
    const angle = (45 * top + (clamp(p.chaseAngle, 2, 40) + 19 * rig.cine) * view.chase) * (Math.PI / 180)
    view.lean = Math.tan(angle) - 0.5 * flight.climbTilt * view.chase + flight.look * view.chase
    const free = 1 - view.cockpit
    // (over a world the camera keeps above its ground and its sea; in space there is none)
    const ground = scene.zone.kind !== 'space'
    view.tan = ground
      ? Math.max(view.lean + rig.fix * view.q * free, (rig.floor - view.alt) * view.q * free, (2 - view.alt) * view.q)
      : view.lean
    // where the jet (or, in the cockpit, the horizon) sits in the frame; a climb drops the horizon
    const focal = view.scale / view.q
    const cyChase = (H >> 1) + H * (0.14 + 0.07 * rig.cine - 0.03 * scene.boost)
    // (the seat looks down at a world under it further than the chase camera does, the same on either side of where the
    // zone changes in a world's air: it was less on the surface's side, and the world jumped up the canopy there)
    // (flown free in space the camera itself pitches with the ship: `free`, below)
    const loose = rig.free
    const cyIn = scene.pivotY + focal * Math.tan(clamp(lead.pitch * 0.8 * (1 - loose) - flight.look * 1.15, -0.9, 0.6))
    view.cy = top * (H >> 1) + view.chase * cyChase + view.cockpit * cyIn
    view.steerY = top * (H >> 1) + view.chase * cyChase + view.cockpit * H * 0.34
    // in the cockpit the view rolls and turns exactly with the jet
    // (a full roll is followed either all the way round or not at all, so it always ends level)
    view.roll = lead.roll * view.cockpit + spinOf(lead) * rig.spin
    const behind = rig.topYaw + rig.yawDiff
    view.yaw = rig.topYaw + rig.yawDiff * (view.chase + view.cockpit) + wrapAngle(-lead.yaw - behind) * view.cockpit
    view.pitch = 0
    if (loose > 0) {
      // Flown free in space: the camera looks where the ship points. From the seat, exactly as the ship does; from behind,
      // as the rig's own forward and up, which follow the ship's a beat late; between the two views, between them.
      const jet = scene.jets[0]
      const ax = axes(jet)
      const wc = view.chase
      const wk = view.cockpit
      const F = unit([rig.camF[0] * wc + ax.fx * wk, rig.camF[1] * wc + ax.fy * wk, rig.camF[2] * wc + ax.fz * wk])
      const U = [rig.camU[0] * wc + ax.ux * wk, rig.camU[1] * wc + ax.uy * wk, rig.camU[2] * wc + ax.uz * wk]
      const d = U[0] * F[0] + U[1] * F[1] + U[2] * F[2]
      U[0] -= F[0] * d
      U[1] -= F[1] * d
      U[2] -= F[2] * d
      unit(U)
      poseOf(F, U)
      const share = (wc + wk) * loose
      const yawNew = rig.topYaw + wrapAngle(pose.yaw - rig.topYaw) * (wc + wk)
      view.yaw += wrapAngle(yawNew - view.yaw) * loose
      view.pitch = pose.pitch * share
      view.roll = view.roll * (1 - loose) + pose.roll * share
      // (the seat's eyes: the view's point is ahead of them along the way the ship points, not along the level)
      view.x += (ax.fx - sn) * ahead * wk * loose
      view.y += (ax.fy + cs) * ahead * wk * loose
      view.alt += (ax.fz * ahead + (ax.uz - 1) * COCKPIT_EYE * sc) * wk * loose
    }
    // the jet fades away as the camera moves into it
    const f = clamp((view.cockpit - 0.12) / 0.4, 0, 1)
    view.jetFade = 1 - f * f * (3 - 2 * f)
    view.lift = top
  }
  view.cp = Math.cos(view.pitch)
  view.sp = view.pitch === 0 ? 0 : Math.sin(view.pitch)
  if (jolt > 0) view.cy += Math.round(Math.cos(scene.time * 77) * jolt)
  // (square, exactly: a cosine of a quarter turn is not quite 0, and the ground's columns would creep)
  view.cos = square ? Math.round(Math.cos(view.yaw)) + 0 : Math.cos(view.yaw)
  view.sin = square ? Math.round(Math.sin(view.yaw)) + 0 : Math.sin(view.yaw)
}

/** while the pilot is out of the jet, the camera swings round and draws back to watch */
export function stepCine(scene: SceneState, dt: number) {
  const { eject, rig } = scene
  // (in the loop he comes down on foot, watched from overhead: there is no pick-up to watch)
  const watching = !eject.foot && (eject.stage === EJ_ROCKET ? eject.t > 0.12 : eject.stage === EJ_CHUTE || eject.stage === EJ_DROP)
  rig.cine += ((watching ? 1 : 0) - rig.cine) * (1 - Math.exp(-dt * 2.4))
  if (rig.cine < 0.001 && !watching) rig.cine = 0
  const back = !eject.foot && (eject.stage === EJ_ROCKET || (eject.stage === EJ_CHUTE && eject.t - eject.since < 0.5))
  rig.wide += ((back ? 1 : 0) - rig.wide) * (1 - Math.exp(-dt * (back ? 6 : 1.5)))
  if (rig.wide < 0.001 && !back) rig.wide = 0
}

/** moves the rig: the blend of views, the point it follows, and the chase camera's clearance */
export function stepCamera(scene: SceneState, dt: number) {
  const { params: p, view, rig, eject, world } = scene
  // the view weights glide to their goals (three soft stages each)
  // (while the pilot is out of the jet, the camera goes behind to watch, whatever view it was in;
  // in the loop, and on foot, it is overhead)
  const afoot = isAfoot(scene)
  const out = !afoot && (eject.stage === EJ_ROCKET || eject.stage === EJ_CHUTE || eject.stage === EJ_DROP)
  const goC = !afoot && (out || rig.target === 1) ? 1 : 0
  const goK = !afoot && !out && rig.target === 2 ? 1 : 0
  const ease = 1 - Math.exp((-dt * 7.6) / (clamp(p.transition, 0.2, 8) * (eject.stage !== EJ_FLY ? 0.6 : 1)))
  let settled = true
  for (let i = 0; i < 3; i++) {
    rig.wChase[i] += ((i === 0 ? goC : rig.wChase[i - 1]) - rig.wChase[i]) * ease
    rig.wCockpit[i] += ((i === 0 ? goK : rig.wCockpit[i - 1]) - rig.wCockpit[i]) * ease
    if (Math.abs(rig.wChase[i] - goC) > 0.0004 || Math.abs(rig.wCockpit[i] - goK) > 0.0004) settled = false
  }
  if (settled) {
    rig.wChase.fill(goC)
    rig.wCockpit.fill(goK)
  }
  view.chase = rig.wChase[2]
  view.cockpit = rig.wCockpit[2]

  // camera: ahead of the leader, turning part of the way with it (far enough ahead to see a fight coming)
  // (on foot it leads him a little the way he walks, and does not turn: the keys walk the way the screen shows)
  const cl = focus(scene)
  const look = (34 + 20 * scene.boost) * (1 - view.chase - view.cockpit)
  const tx = afoot ? cl.x + cl.vx * 0.35 : cl.x + Math.sin(cl.yaw) * look
  const ty = afoot ? cl.y + cl.vy * 0.35 : cl.y - Math.cos(cl.yaw) * look
  const kc = 1 - Math.exp(-dt * (afoot ? 6 : 3.5))
  rig.follow.x += cl.vx * dt + (tx - (rig.follow.x + cl.vx * dt)) * kc
  rig.follow.y += cl.vy * dt + (ty - (rig.follow.y + cl.vy * dt)) * kc
  if (!afoot) rig.topYaw += (-cl.yaw * clamp(p.cameraFollow, 0, 1) - rig.topYaw) * (1 - Math.exp(-dt * 1.6))
  else {
    // (on foot it comes round to the nearest quarter turn and stays there: turned part of the way, the ground was resampled
    // at a slant every frame and its pixels flickered as he walked)
    const square = Math.round(rig.topYaw / QUARTER) * QUARTER
    rig.topYaw += (square - rig.topYaw) * (1 - Math.exp(-dt * FOOT.squareUp))
    if (Math.abs(square - rig.topYaw) < 0.002) rig.topYaw = square
  }
  // in space, flown free: the camera behind the ship comes round to the way it points, a beat late
  const freeNow = flownFree(scene)
  rig.free += (freeNow - rig.free) * (1 - Math.exp(-dt * 5))
  if (Math.abs(rig.free - freeNow) < 0.002) rig.free = freeNow
  if (scene.zone.kind === 'space') {
    poseBehind(scene.jets[0])
    const kf = 1 - Math.exp(-dt * 7)
    for (let i = 0; i < 3; i++) {
      rig.camF[i] += (shipF[i] - rig.camF[i]) * kf
      rig.camU[i] += (shipU[i] - rig.camU[i]) * kf
    }
    // (passing each other going opposite ways they would shrink to nothing between: then it is the ship's at once)
    if (Math.hypot(rig.camF[0], rig.camF[1], rig.camF[2]) < 0.3) for (let i = 0; i < 3; i++) rig.camF[i] = shipF[i]
    unit(rig.camF)
    const d = rig.camU[0] * rig.camF[0] + rig.camU[1] * rig.camF[1] + rig.camU[2] * rig.camF[2]
    for (let i = 0; i < 3; i++) rig.camU[i] -= rig.camF[i] * d
    if (Math.hypot(rig.camU[0], rig.camU[1], rig.camU[2]) < 0.3) for (let i = 0; i < 3; i++) rig.camU[i] = shipU[i]
    unit(rig.camU)
  }
  // (while the seat's rocket burns it hangs back, so the pilot climbs the picture above the crash)
  rig.follow.alt += (cl.z - rig.follow.alt) * (1 - Math.exp(-dt * (3 + 5 * rig.cine) * (1 - 0.8 * rig.wide)))
  // (never left far behind: high up, where the air is thin, a ship climbs so fast that from behind it rose out of the top
  // of the picture; while the seat's rocket burns it still hangs back)
  if (rig.wide < 0.05 && !afoot) rig.follow.alt = clamp(rig.follow.alt, cl.z - ALT_LAG, cl.z + ALT_LAG)
  // (on the way down to a world or up out of one the ship sinks and climbs fast: the camera keeps with it)
  if (scene.travel.kind === 'down' || scene.travel.kind === 'out') rig.follow.alt = cl.z
  // the chase camera keeps clear of the hills behind the jet, and stays out of the cloud
  // layer: under it while the jet is low, over it otherwise
  let fix = 0
  rig.floor = 0
  if (view.chase > 0.3 && view.q > 1e-4) {
    const back = 1 / view.q
    const gx = view.x + view.sin * back
    const gy = view.y + view.cos * back
    let top = 0
    for (let iy = -1; iy <= 1; iy++) for (let ix = -1; ix <= 1; ix++) top = Math.max(top, groundAt(world, gx + ix * 9, gy + iy * 9))
    rig.floor = top + 5
    const nominal = rig.follow.alt + view.lean * back
    let want = Math.max(nominal, rig.floor)
    const sky = skyOf(scene.planet, ceilingOf(p))
    const lo = sky.base
    const hi = deckTop(sky)
    if (sky.step > 0 && p.clouds > 0 && want > lo - 3 && want < hi + 3) want = cl.z < lo - 8 ? Math.max(rig.floor, lo - 3) : hi + 3
    fix = want - nominal
  }
  rig.fix += (fix - rig.fix) * (1 - Math.exp(-dt * 7))
  // the chase camera sits behind the jet and swings round a beat late in turns
  rig.chaseYaw += (-cl.yaw + 0.95 * rig.cine - rig.chaseYaw) * (1 - Math.exp(-dt * 3.4)) // (it swings round to one side to watch a pick-up)
  const raw = rig.chaseYaw - rig.topYaw
  if (view.chase === 0 && view.cockpit === 0) rig.yawDiff = wrapAngle(raw)
  else rig.yawDiff += wrapAngle(raw - rig.yawDiff)
  updateView(scene)
}
