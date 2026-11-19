// How a crash and an ejection are drawn (sim/ejection.ts is what happens). Each piece is
// placed in the world and drawn facing the camera, at the size of the jet's own pixels,
// behind the same hills and clouds as a jet.

import { jetSize } from '../jet/jet'
import { BLAST_GROUND, BLAST_WATER } from '../sim/effects'
import { DEBRIS_F, DEBRIS_N } from '../sim/particles'
import { EJ_CHUTE, EJ_DROP, EJ_FLY, EJ_ROCKET, EJ_SEAL, HERO, LINES } from '../sim/ejection'
import type { SceneState } from '../state'
import { blend, pack } from '../util/color'
import { clamp } from '../util/math'
import { drawBlast, FIRE } from './combat'
import type { Frame } from './frame'
import type { ShipPaint } from './paint'
import { box, thread } from './shapes'
import { pr, project } from './view'
import { RACE_ART } from '../races/art'
import type { Walker } from '../sim/foot'
import { letters } from './walker'

// the colours of a parachute and a flying helmet
const SILK = [pack(244, 244, 238), pack(206, 210, 220), pack(150, 156, 172)]
const INK = pack(34, 32, 40)
// the pilot from behind, and his seat (one letter a pixel; see inkOf)
const SEAT = ['.ddd.', 'ggggg', 'ggggg', 'ggggg', 'ggggg', 'ggggg', 'ddddd']

/** the colour a letter of a little picture stands for */
function inkOf(paint: ShipPaint, ch: number) {
  return ch === 104
    ? SILK[0] // h: helmet
    : ch === 115
      ? paint.jet[17 + 4] // s: the stripe on it
      : ch === 111
        ? paint.jet[17 + 3] // o: flying suit
        : ch === 97
          ? paint.jet[17 + 2] // a: its arms, in shade
          : ch === 107
            ? INK // k: harness
            : ch === 98
              ? INK // b: boots
              : ch === 103
                ? paint.jet[1 + 3] // g: the seat
                : paint.jet[1 + 1] // d: its dark edges
}

/** a little picture: cx its middle, top its top edge, u the size of one of its pixels, shown how many rows */
function picture(f: Frame, paint: ShipPaint, rows: string[], cx: number, top: number, u: number, V: number, shown: number) {
  const w = rows[0].length
  for (let r = 0; r < rows.length && r < shown; r++) {
    const y0 = Math.round(top + r * u)
    const y1 = Math.max(y0 + 1, Math.round(top + (r + 1) * u))
    for (let c = 0; c < w; c++) {
      const ch = rows[r].charCodeAt(c)
      if (ch === 46) continue
      const x0 = Math.round(cx + (c - w / 2) * u)
      box(f, x0, y0, Math.max(x0 + 1, Math.round(cx + (c + 1 - w / 2) * u)), y1, inkOf(paint, ch), V)
    }
  }
}

/**
 * A pilot as his race's sprite (races/art.ts), facing the camera: `cx` his middle, `bottom` where his feet are, at
 * a whole number of frame pixels a pixel (about `u`), with only the top `shown` share of him showing (dropping
 * into a cockpit).
 */
function pilotSprite(f: Frame, w: Walker, cx: number, bottom: number, u: number, V: number, shown: number) {
  const art = RACE_ART[w.look.race]
  if (!art) return
  // (his true size beside a ship: the small sprite)
  const side = art.small.sides[0]
  const s = Math.max(1, Math.round(u))
  letters(
    f,
    side.steps[0],
    side.w,
    side.h,
    w.paint.sprite,
    Math.round(cx - (side.w * s) / 2),
    Math.round(bottom) - side.h * s,
    s,
    V,
    false,
    false,
    Math.ceil(side.h * shown),
  )
}

/**
 * The parachute's canopy: (cx, cy) is the middle of its hem, u the size of a jet pixel,
 * open how far it has filled (0 a streamer … 1 a dome), tilt how far it leans, k its strength.
 */
function canopy(f: Frame, paint: ShipPaint, cx: number, cy: number, u: number, open: number, tilt: number, k: number, V: number) {
  const { w: W, h: H, fb, zbuf } = f
  const o = 1 - (1 - open) * (1 - open)
  const pop = open < 1 ? Math.sin(open * Math.PI) * 0.1 : 0 // it bulges as it snaps open
  const rw = 12.5 * (0.2 + 0.8 * o) * (1 + pop) * u
  const hh = 9.5 * (1.55 - 0.55 * o) * u
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)
  const reach = Math.max(rw, hh) + 2 * u
  const x0 = Math.max(0, Math.floor(cx - reach))
  const x1 = Math.min(W - 1, Math.ceil(cx + reach))
  const y0 = Math.max(0, Math.floor(cy - reach))
  const y1 = Math.min(H - 1, Math.ceil(cy + reach))
  const hem = 1.3 * u
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx
      const dy = y - cy
      const lx = c * dx + s * dy
      const ly = -s * dx + c * dy // up is negative
      if (ly < -hh || ly > hem) continue
      const w = ly < 0 ? rw * Math.sqrt(1 - (ly / hh) * (ly / hh)) : rw
      const ax = Math.abs(lx)
      if (ax > w) continue
      // eight gores across the half that shows, narrowing towards the sides as on a dome
      const g = (Math.asin(clamp(lx / (w + 0.001), -1, 1)) / Math.PI + 0.5) * 8
      const gore = Math.min(7, Math.floor(g))
      const within = g - gore
      if (ly > Math.sin(within * Math.PI) * hem - 0.3 * u) continue // the scalloped hem
      const at = y * W + x
      if (zbuf[at] < V - 1) continue
      const low = ly > -hh * 0.3 // its skirt, in its own shade
      const far = g > 5.6
      let col: number
      if (ax > w - 1 || ly < -hh + 1) col = paint.jet[17 + 1]
      else if (within < 0.09 && gore > 0) col = gore % 2 === 0 ? paint.jet[17 + 2] : SILK[2]
      else if (gore % 2 === 0) col = low || far ? paint.jet[17 + 2] : ly < -hh * 0.72 ? paint.jet[17 + 4] : paint.jet[17 + 3]
      else col = low || far ? SILK[1] : SILK[0]
      fb[at] = k >= 256 ? col : blend(fb[at], col, k)
    }
  }
}

/** the explosion and the wreckage in the air */
export function drawWreckage(scene: SceneState, f: Frame) {
  const { params: p, eject, particles, paint, view } = scene
  const boom = eject.boom
  const sc = jetSize(p)
  if (boom.on && project(view, boom.x, boom.y, boom.z))
    // (a touch nearer, so the slope it hit does not hide it)
    drawBlast(f, scene, pr.x, pr.y, pr.m, pr.v - 4, boom.t, 1, boom.wet ? BLAST_WATER : BLAST_GROUND, 0)
  for (let i = 0; i < DEBRIS_N; i++) {
    const o = i * DEBRIS_F
    if (particles.debris[o + 6] < 0 || !project(view, particles.debris[o], particles.debris[o + 1], particles.debris[o + 2])) continue
    const kind = particles.debris[o + 7]
    const u = Math.max(1, pr.m * sc)
    const turn = ((scene.time - particles.debris[o + 6]) * 9 + i) | 0 // it tumbles: wide, then tall
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    if (kind === 2) {
      // the canopy: a curved piece of glass with a glint on it
      const w = Math.round((turn & 1 ? 2 : 4) * u)
      const h = Math.round((turn & 1 ? 4 : 2) * u)
      box(f, x - (w >> 1), y - (h >> 1), x - (w >> 1) + w, y - (h >> 1) + h, paint.jet[33 + 3], pr.v)
      box(
        f,
        x - (w >> 1),
        y - (h >> 1),
        x - (w >> 1) + Math.max(1, Math.round(u)),
        y - (h >> 1) + Math.max(1, Math.round(u)),
        paint.jet[33 + 5],
        pr.v,
      )
    } else if (kind === 3) {
      if (turn & 1) picture(f, paint, SEAT, pr.x, pr.y - 3.5 * u, u, pr.v, 9)
      else box(f, x - Math.round(3.5 * u), y - Math.round(2 * u), x + Math.round(3.5 * u), y + Math.round(2 * u), paint.jet[1 + 2], pr.v)
    } else {
      const w = Math.max(1, Math.round((1 + (i % 3) * 0.6) * u))
      box(
        f,
        x - (w >> 1),
        y - (w >> 1),
        x - (w >> 1) + w,
        y - (w >> 1) + w,
        kind === 1 ? FIRE[1 + (turn & 1)] : paint.jet[1 + (i % 4)],
        pr.v,
      )
    }
  }
}

/** the pilot while he is out of the jet (or sitting in it under an open canopy), and his parachute */
export function drawPilot(scene: SceneState, f: Frame) {
  const { params: p, eject, paint, view } = scene
  const { pilot, chute } = eject
  const sc = jetSize(p)
  // a parachute that has been cut loose, drifting off
  if (chute.on && chute.free && project(view, chute.x, chute.y, chute.z)) {
    const u = Math.max(1, pr.m * sc * HERO)
    const t = chute.t
    const tilt = Math.sin(t * 1.9) * 0.28 + Math.min(0.5, t * 0.22)
    const k = t < 2.6 ? 256 : Math.round(256 * clamp(1 - (t - 2.6) / 2.4, 0, 1))
    const open = 1 - 0.42 * Math.min(1, t / 2.6)
    // its lines trail beneath it, swinging
    const sway = tilt + Math.sin(t * 2.6) * 0.45
    const ex = pr.x + Math.sin(sway) * 10 * u
    const ey = pr.y + Math.cos(sway) * 10 * u
    const rw = 12.5 * (0.2 + 0.8 * (1 - (1 - open) * (1 - open))) * u
    for (let i = 0; i < 5; i++) {
      const lx = rw * Math.sin((i / 4 - 0.5) * Math.PI * 0.92)
      thread(f, pr.x + Math.cos(tilt) * lx, pr.y + Math.sin(tilt) * lx, ex, ey, SILK[1], pr.v, k >> 1)
    }
    canopy(f, paint, pr.x, pr.y, u, open, tilt, k, pr.v)
  }
  if (eject.stage === EJ_FLY || (eject.stage === EJ_SEAL && scene.jets[0].lid < 0.3)) return // he is in the jet, under its glass
  if (view.cockpit > 0.2) return // the camera is still at his own eyes (the cockpit view): he is not in front of it
  if (!project(view, pilot.x, pilot.y, pilot.z)) return
  // (larger than life in the air; his true size by the time he is in the seat)
  const settle = eject.stage === EJ_SEAL ? 1 : eject.stage === EJ_DROP ? clamp((eject.t - eject.since) / 0.36, 0, 1) : 0
  const u = Math.max(1, pr.m * sc * (HERO - (HERO - 1) * settle))
  const px = pr.x
  const py = pr.y
  const V = pr.v - 2
  if (eject.stage === EJ_ROCKET) {
    // the seat's rocket, burning under it for a moment
    if (eject.t < 0.3) {
      const len = (7 + 5 * Math.sin(scene.time * 61)) * (1 - eject.t / 0.36)
      for (let i = 0; i < len; i++) {
        const w = Math.max(1, Math.round((2.4 - (i / len) * 2) * u))
        const col = i < len * 0.3 ? FIRE[0] : i < len * 0.62 ? FIRE[1] : FIRE[2]
        box(
          f,
          Math.round(px) - (w >> 1),
          Math.round(py + (4 + i) * u),
          Math.round(px) - (w >> 1) + w,
          Math.round(py + (5 + i) * u) + 1,
          col,
          V,
        )
      }
    }
    picture(f, paint, SEAT, px, py - 3 * u, u, V, 9)
    pilotSprite(f, scene.foot.walker, px, py + 3.5 * u, u, V, 6 / 9)
    return
  }
  if (eject.stage === EJ_CHUTE && !chute.on) {
    // (in space there is no parachute: he floats, turning slowly)
    pilotSprite(f, scene.foot.walker, px + Math.sin(pilot.swing) * u, py + 3.5 * u, u, V, 1)
    return
  }
  if (eject.stage === EJ_CHUTE) {
    const sw = pilot.swing
    const body = px - Math.sin(sw) * 2.4 * u // he swings one way, the canopy leans the other
    const tilt = sw * 0.3
    const fill = chute.open
    const cx = px + Math.sin(sw) * 1.6 * u
    const cy = py - (2.5 + LINES * (0.55 + 0.45 * fill)) * u
    const rw = 12.5 * (0.2 + 0.8 * (1 - (1 - fill) * (1 - fill))) * u
    for (let i = 0; i < 5; i++) {
      const lx = rw * Math.sin((i / 4 - 0.5) * Math.PI * 0.92)
      thread(
        f,
        cx + Math.cos(tilt) * lx,
        cy + Math.sin(tilt) * lx,
        body + (i < 2 ? -1.6 : i > 2 ? 1.6 : 0) * u,
        py - 2.4 * u,
        SILK[1],
        V,
        190,
      )
    }
    canopy(f, paint, cx, cy, u, fill, tilt, 256, V)
    pilotSprite(f, scene.foot.walker, body, py + 3.5 * u, u, V, 1)
    return
  }
  // dropping into the seat: more and more of him is inside the cockpit
  const inside = eject.stage === EJ_SEAL ? 1 : clamp((eject.t - eject.since) / 0.36, 0, 1)
  pilotSprite(f, scene.foot.walker, px, py + 3.5 * u, u, V, inside > 0.75 ? 5 / 9 : inside > 0.5 ? 7 / 9 : 1)
}

/** other pilots out of their ships (Ship.out), each hanging under his parachute, swinging */
export function drawFloaters(scene: SceneState, f: Frame) {
  const { params: p, view } = scene
  const sc = jetSize(p)
  for (const s of scene.ships) {
    if (!s.out || !project(view, s.jet.x, s.jet.y, s.jet.z)) continue
    const u = Math.max(1, pr.m * sc * HERO)
    const V = pr.v - 2
    const sw = Math.sin(scene.time * 1.7 + s.id) * 0.32
    const body = pr.x - Math.sin(sw) * 2.4 * u
    const tilt = sw * 0.3
    const cx = pr.x + Math.sin(sw) * 1.6 * u
    const cy = pr.y - (2.5 + LINES) * u
    const rw = 12.5 * u
    for (let i = 0; i < 5; i++) {
      const lx = rw * Math.sin((i / 4 - 0.5) * Math.PI * 0.92)
      thread(
        f,
        cx + Math.cos(tilt) * lx,
        cy + Math.sin(tilt) * lx,
        body + (i < 2 ? -1.6 : i > 2 ? 1.6 : 0) * u,
        pr.y - 2.4 * u,
        SILK[1],
        V,
        190,
      )
    }
    canopy(f, s.paint, cx, cy, u, 1, tilt, 256, V)
    pilotSprite(f, s.walker, body, pr.y + 3.5 * u, u, V, 1)
  }
}
