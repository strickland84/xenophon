// One camera covers every view. A world point lands on screen at
//
//   scale = S / (1 + q·depth)     x = cx + scale·across     y = cy − scale·(height + tan·depth)
//
// With q = 0 this is the flat sprite-stack view: every layer is drawn one pixel above the last.
// Raising q brings the camera in behind the jet: far things shrink and a horizon appears.
// Switching views only slides q, the slope, the scale and the heading, so there is no cut.
//
// The view holds the numbers of that formula for the current frame. The camera rig
// (sim/camera.ts) works them out; everything that draws reads them.
//
// Overhead, the flat view alone gives no sense of height. So there, from LIFT_FROM up, things
// far below the camera are drawn smaller (S above is divided by 1 + depth below / LIFT_HALF):
// climb, and the islands and clouds shrink away beneath the ship, and haze over (world.ts).
// Below LIFT_FROM nothing changes.

import { clamp } from '../util/math'

/** px above the sea from which, overhead, things below the camera are drawn smaller */
export const LIFT_FROM = 300
/** … and how much further below they must be to be drawn at half size */
export const LIFT_HALF = 600

export interface View {
  /** the point in the world the view is centred on */
  x: number
  y: number
  alt: number
  /** which way the camera faces, with its cosine and sine */
  yaw: number
  cos: number
  sin: number
  /** 1 / camera distance: 0 is the flat sprite-stack view */
  q: number
  /** how steeply the camera looks down */
  tan: number
  /** scale at the jet */
  scale: number
  /** where the jet sits on screen */
  cx: number
  cy: number
  /** the camera's roll (the seat's, and in space the camera's behind the ship too) */
  roll: number
  /**
   * The camera's own pitch (radians, nose up), with its cosine and sine: in space, from behind and from the seat, it looks
   * the way the ship points, straight up, straight down and over on its back. 0 everywhere else (over a world the camera
   * looks level and only leans: `tan`). Everything about the view's point is turned by it before it is laid on the frame.
   */
  pitch: number
  cp: number
  sp: number
  /** how steeply the chase camera would look down if nothing were in its way */
  lean: number
  /** the screen row that means "hold this height" when pointing to climb or dive */
  steerY: number
  /** how much of the chase view and of the cockpit view the camera is in (what is left over is overhead) */
  chase: number
  cockpit: number
  /** how solid the leader is drawn: it fades out as the camera moves into it */
  jetFade: number
  /** 0..1: how much things far below shrink (the overhead share of the view; 0 behind the jet and in the cockpit, which have true perspective) */
  lift: number
  /** the camera is down with a pilot on foot, under the clouds: they show only as their shadows */
  under: boolean
}

export function createView(): View {
  return {
    x: 0,
    y: 0,
    alt: 0,
    yaw: 0,
    cos: 1,
    sin: 0,
    q: 0,
    tan: 1,
    scale: 1,
    cx: 0,
    cy: 0,
    roll: 0,
    pitch: 0,
    cp: 1,
    sp: 0,
    lean: 1,
    steerY: 0,
    chase: 0,
    cockpit: 0,
    jetFade: 1,
    lift: 0,
    under: false,
  }
}

/** how much smaller than the view's scale something at height `z` is drawn (1: no smaller) */
export function liftScale(view: View, z: number) {
  const below = view.alt - z - LIFT_FROM
  return view.lift > 0 && below > 0 ? 1 / (1 + (view.lift * below) / LIFT_HALF) : 1
}

/** where project() put the last point: screen x and y, its scale (m), and its depth into the view (v) */
export const pr = { x: 0, y: 0, m: 0, v: 0 }

/** world point → screen (left in `pr`); false when it is behind the camera */
export function project(view: View, x: number, y: number, z: number) {
  const dx = x - view.x
  const dy = y - view.y
  let depth = -(dx * view.sin + dy * view.cos)
  let up = z - view.alt
  if (view.sp !== 0) {
    // (the camera pitched: what is ahead and what is above, turned about its own wing)
    const d = depth * view.cp + up * view.sp
    up = up * view.cp - depth * view.sp
    depth = d
  }
  const den = 1 + view.q * depth
  if (den < 0.12) return false
  pr.v = depth
  pr.m = (view.scale * liftScale(view, z)) / den
  pr.x = view.cx + pr.m * (dx * view.cos - dy * view.sin)
  pr.y = view.cy - pr.m * (up + view.tan * depth)
  return true
}

/** 0..1: how far the cockpit has slid into place round the camera */
export function cockpitIn(view: View) {
  const u = clamp((view.cockpit - 0.16) / 0.84, 0, 1)
  return u * u * u * (u * (u * 6 - 15) + 10)
}
