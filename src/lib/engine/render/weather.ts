// The weather, drawn (its effects on flying are sim/hazards.ts): how far can be seen in fog, a
// storm, a whiteout, dust or ash; what falls through the air (rain, snow, dust, ash and
// embers); lightning; and the glare of lava under a ship flying too low over it.
//
// Seeing: the ground and sky are hazed over, in a few dithered steps, by how far they are from
// the ship (across the ground overhead, ahead of it from behind and in the cockpit), and other
// ships fade into that haze the same way (renderer.ts asks `seen`). In clear weather nothing
// here draws anything, so those worlds look exactly as they always did.

import type { Weather as WeatherKind } from '../galaxy/recipe'
import { BOLT_LIFE } from '../sim/hazards'
import type { SceneState } from '../state'
import { pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import { ceilingOf } from '../params'
import { groundAt } from '../world/world'
import { skyNow } from './clouds'
import type { Frame } from './frame'
import { grade } from './palettes'
import { liftScale, pr, project } from './view'

/** each weather's haze: its colour by day, from where it starts to where it is thickest (world px), and how thick that is */
interface Murk {
  colour: number[]
  near: number
  far: number
  most: number
}
// (thinned on 2026-11-19, James: "the weather haze is too thick in most worlds": it starts further out, reaches its
// thickest further out still, and the ground always shows through it)
const MURK: Record<WeatherKind, Murk | null> = {
  clear: null,
  rain: { colour: [146, 156, 172], near: 200, far: 520, most: 0.35 },
  storm: { colour: [84, 92, 112], near: 130, far: 380, most: 0.5 },
  fog: { colour: [204, 212, 218], near: 70, far: 300, most: 0.7 },
  snow: { colour: [226, 234, 244], near: 180, far: 500, most: 0.4 },
  dust: { colour: [214, 168, 118], near: 120, far: 380, most: 0.55 },
  ash: { colour: [80, 68, 66], near: 140, far: 400, most: 0.5 },
}
/** a whiteout at its worst */
const WHITEOUT: Murk = { colour: [236, 242, 250], near: 40, far: 200, most: 0.85 }

/** the colour a murk takes at sunset (mixed with its own) */
const SUNSET_GLOW = [255, 178, 104]

/** steps of haze, and the 4 × 4 pattern that dithers between them */
const STEPS = 8
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)

// this frame's haze (worked out once a frame, before anything is drawn): on, its colour, its reach
const now = { on: false, r: 0, g: 0, b: 0, near: 0, far: 1, most: 0, lift: 0 }

/** the colour of something in the weather, for the time of day and under the world's sun */
function tinted(scene: SceneState, c: number[], amount = 1) {
  const g = grade(c, scene.params.timeOfDay, amount)
  const light = scene.planet?.light
  return light ? [g[0] * light[0], g[1] * light[1], g[2] * light[2]] : g
}

/** works out this frame's haze: call before drawing anything */
export function prepareWeather(scene: SceneState) {
  const w = scene.weather
  const base = MURK[w.kind]
  now.on = !!base
  if (!base) return
  let { near, far, most } = base
  let colour = base.colour
  // a whiteout closes in
  if (w.whiteout > 0) {
    const k = w.whiteout
    near += (WHITEOUT.near - near) * k
    far += (WHITEOUT.far - far) * k
    most += (WHITEOUT.most - most) * k
    colour = colour.map((v, i) => v + (WHITEOUT.colour[i] - v) * k)
  }
  // under a low ceiling of ash, the higher the thicker
  if (w.kind === 'ash') {
    const k = clamp((scene.view.alt - (ceilingOf(scene.params) - 140)) / 140, 0, 1)
    near *= 1 - 0.75 * k
    far *= 1 - 0.6 * k
    most += (0.94 - most) * k
  }
  // (at sunset the murk glows with the low sun, gold, whatever the sun's own tint: graded and tinted as the ground is, a fog
  // had come out a flat lilac pink over everything; polish step 9)
  const c =
    scene.params.timeOfDay === 'sunset'
      ? colour.map((v, i) => v * 0.45 + SUNSET_GLOW[i] * 0.55)
      : tinted(scene, colour, scene.params.timeOfDay === 'night' ? 0.85 : 1)
  now.r = clamp(c[0], 0, 255)
  now.g = clamp(c[1], 0, 255)
  now.b = clamp(c[2], 0, 255)
  now.near = near
  now.far = far
  now.most = most
  now.lift = scene.view.lift
}

/** how thick the haze is at a distance (overhead: across the ground) and a depth ahead (from behind and in the cockpit) */
function thickness(across: number, ahead: number) {
  const d = now.lift * across + (1 - now.lift) * ahead
  return clamp((d - now.near) / (now.far - now.near), 0, 1) * now.most
}

/** 0..1: how clearly something at a point is seen through the weather (1: as clear as can be) */
export function seen(scene: SceneState, x: number, y: number) {
  if (!now.on) return 1
  const v = scene.view
  const dx = x - v.x
  const dy = y - v.y
  return 1 - thickness(Math.sqrt(dx * dx + dy * dy), Math.max(0, -(dx * v.sin + dy * v.cos)))
}

/** hazes the ground and sky over by how far away they are (after they are drawn, before the ships) */
export function hazeWorld(scene: SceneState, f: Frame) {
  if (!now.on) return
  const { view } = scene
  const { w: W, fb, zbuf, colLo, colHi, rowLo, rowHi } = f
  const S = view.scale * liftScale(view, 0)
  const iS = 1 / S
  const { r, g, b } = now
  for (let y = rowLo; y < rowHi; y++) {
    const dy = (y - view.cy) * iS
    const row = (y & 3) * 4
    for (let x = colLo, o = y * W + colLo; x < colHi; x++, o++) {
      const dx = (x - view.cx) * iS
      const z = zbuf[o]
      const a = thickness(Math.sqrt(dx * dx + dy * dy), z > 1e8 ? 1e5 : z)
      if (a <= 0) continue
      const lv = a * STEPS
      let k = lv | 0
      if (lv - k > BAYER[row + (x & 3)]) k++
      if (k === 0) continue
      const t = (k * 256) / STEPS
      const c = fb[o]
      fb[o] =
        ((255 << 24) |
          (((((c >> 16) & 255) * (256 - t) + b * t) >> 8) << 16) |
          (((((c >> 8) & 255) * (256 - t) + g * t) >> 8) << 8) |
          (((c & 255) * (256 - t) + r * t) >> 8)) >>>
        0
    }
  }
}

/** a colour laid over a pixel, `k` of the way (0..256) */
function over(fb: Uint32Array, o: number, r: number, g: number, b: number, k: number) {
  const c = fb[o]
  fb[o] =
    ((255 << 24) |
      (((((c >> 16) & 255) * (256 - k) + b * k) >> 8) << 16) |
      (((((c >> 8) & 255) * (256 - k) + g * k) >> 8) << 8) |
      (((c & 255) * (256 - k) + r * k) >> 8)) >>>
    0
}

/** what falls through the air: how many to a frame of 456 × 256, how fast they fall (px a second on screen), their colour and how solid */
const FALLING: Record<WeatherKind, { count: number; fall: number; colour: number[]; k: number } | null> = {
  clear: null,
  fog: null,
  rain: { count: 230, fall: 300, colour: [206, 220, 238], k: 170 },
  storm: { count: 400, fall: 420, colour: [196, 208, 230], k: 160 },
  snow: { count: 280, fall: 34, colour: [252, 253, 255], k: 240 },
  dust: { count: 300, fall: 0, colour: [252, 226, 184], k: 210 },
  ash: { count: 240, fall: 22, colour: [52, 46, 46], k: 220 },
}

/** the weather in the air, lightning, and the glare of lava: over everything but the HUD */
export function drawWeather(scene: SceneState, f: Frame) {
  const w = scene.weather
  const { view, time } = scene
  const { w: W, h: H, fb, colLo, colHi, rowLo, rowHi } = f
  const fall = FALLING[w.kind]
  if (fall) {
    // the frame's own share of them; more in a whiteout
    const n = Math.round(((fall.count * (W * H)) / (456 * 256)) * (1 + w.whiteout * 1.5))
    const S = view.scale * liftScale(view, 0)
    const over_ = view.lift > 0.5
    // they drift with the wind and the camera's movement (nearer than the ground, so a little faster), wrapping round the frame
    const cos = view.cos
    const sin = view.sin
    const shiftX = over_ ? -(view.x * cos - view.y * sin) * S * 1.3 : -view.yaw * W * 0.7
    const shiftY = over_ ? -(view.x * sin + view.y * cos) * S * 1.3 : 0
    const windX = (w.windX * cos - w.windY * sin) * S * 2
    const windY = (w.windX * sin + w.windY * cos) * S * 2
    const c = tinted(scene, fall.colour, 0.8)
    const cr = clamp(c[0], 0, 255)
    const cg = clamp(c[1], 0, 255)
    const cb = clamp(c[2], 0, 255)
    // (rain and dust are streaks along the way they move; snow and ash are flakes)
    const streak = w.kind === 'rain' || w.kind === 'storm' ? (w.kind === 'storm' ? 7 : 5) : w.kind === 'dust' ? 5 : 1
    const fx = w.kind === 'dust' ? 1 : 0.35
    const fy = w.kind === 'dust' ? 0.15 : 1
    const len = Math.hypot(fx, fy)
    const ux = fx / len
    const uy = fy / len
    for (let i = 0; i < n; i++) {
      const h1 = (hash8(i * 7 + 1) << 8) | hash8(i * 7 + 2)
      const h2 = (hash8(i * 7 + 3) << 8) | hash8(i * 7 + 4)
      const depth = 0.6 + hash8(i * 7 + 5) / 320 // nearer ones move faster
      const speed = fall.fall * depth + (w.kind === 'dust' ? 160 * depth : 0)
      let x = (h1 / 65536) * W + (shiftX + windX * time) * depth + ux * speed * time
      let y = (h2 / 65536) * H + (shiftY + windY * time) * depth + uy * speed * time
      // snow and ash flutter as they fall
      if (w.kind === 'snow' || w.kind === 'ash') x += Math.sin(time * 1.7 + i) * 3
      x -= Math.floor(x / W) * W
      y -= Math.floor(y / H) * H
      // embers: one flake of ash in nine glows, and rises
      const ember = w.kind === 'ash' && i % 9 === 0
      const r = ember ? 255 : cr
      const g = ember ? 150 : cg
      const b = ember ? 60 : cb
      for (let s = 0; s < streak; s++) {
        const px = (x - ux * s) | 0
        const py = (ember ? H - 1 - y : y - uy * s) | 0
        if (px < colLo || px >= colHi || py < rowLo || py >= rowHi) continue
        over(fb, py * W + px, r, g, b, s === 0 ? fall.k : fall.k >> 1)
      }
      // near snowflakes are bigger
      if (w.kind === 'snow' && depth > 1.1) {
        const px = x | 0
        const py = (y | 0) + 1
        if (px + 1 < colHi && py < rowHi && px >= colLo) {
          over(fb, py * W + px, r, g, b, fall.k)
          over(fb, (py - 1) * W + px + 1, r, g, b, fall.k)
        }
      }
    }
  }

  // lightning: a jagged bolt from the cloud to the ground, and the sky lit for a moment
  for (const bolt of w.bolts) {
    const age = time - bolt.t
    if (age < 0 || age > BOLT_LIFE) continue
    // (it flickers: seen, gone, seen again)
    const on = age < 0.08 || (age > 0.14 && age < 0.24) || (age > 0.3 && age < 0.34)
    if (age < 0.1) {
      const flash = (1 - age / 0.1) * 90
      for (let y = rowLo; y < rowHi; y++) for (let x = colLo, o = y * W + colLo; x < colHi; x++, o++) over(fb, o, 226, 230, 255, flash)
    }
    if (!on) continue
    const ground = groundAt(scene.world, bolt.x, bolt.y)
    if (!project(view, bolt.x, bolt.y, skyNow(scene).base)) continue
    const x0 = pr.x
    const y0 = pr.y
    if (!project(view, bolt.x, bolt.y, ground)) continue
    const x1 = pr.x
    const y1 = pr.y
    const segs = 9
    let px = x0
    let py = y0
    for (let k = 1; k <= segs; k++) {
      const t = k / segs
      const jag = k === segs ? 0 : (hash8(bolt.seed + k * 13) - 128) / 12
      const nx = x0 + (x1 - x0) * t + jag
      const ny = y0 + (y1 - y0) * t
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(nx - px), Math.abs(ny - py))))
      for (let s = 0; s <= steps; s++) {
        const ax = (px + ((nx - px) * s) / steps) | 0
        const ay = (py + ((ny - py) * s) / steps) | 0
        for (let e = -1; e <= 1; e++) {
          const bx = ax + e
          if (bx < colLo || bx >= colHi || ay < rowLo || ay >= rowHi) continue
          if (e === 0) fb[ay * W + bx] = pack(248, 248, 255)
          else over(fb, ay * W + bx, 170, 160, 255, 170)
        }
      }
      px = nx
      py = ny
    }
  }

  // lava (or acid) burning the ship: the edges of the frame glare
  const burn = time - w.burnedAt
  if (burn >= 0 && burn < 0.4) {
    const acid = scene.world.look.sea === 'acid'
    const k = (1 - burn / 0.4) * 150
    const edge = Math.max(6, Math.round(Math.min(W, H) * 0.08))
    for (let y = rowLo; y < rowHi; y++) {
      const ey = Math.min(y - rowLo, rowHi - 1 - y)
      for (let x = colLo, o = y * W + colLo; x < colHi; x++, o++) {
        const e = Math.min(ey, x - colLo, colHi - 1 - x)
        if (e >= edge) {
          x = colHi - 1 - edge
          o = y * W + x
          continue
        }
        const t = (k * (edge - e)) / edge
        if (t > BAYER[(y & 3) * 4 + (x & 3)] * 150) over(fb, o, acid ? 150 : 255, acid ? 230 : 110, acid ? 60 : 30, t)
      }
    }
  }
}
