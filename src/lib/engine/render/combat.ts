// How the fighting is drawn (sim/guns.ts, missiles.ts and effects.ts are what happens):
// tracers, missiles and their flames, the flash at a gun's muzzle, the star where a shot
// strikes, sparks, and explosions. Everything is placed in the world and drawn in the
// frame's own pixels, behind the same hills and clouds as a ship, in a hot, short palette.

import { DAMAGE } from '../data/weapons'
import { jetSize } from '../jet/jet'
import {
  BLAST_AIR,
  blastDrift,
  BLAST_F,
  BLAST_N,
  BLAST_SMALL,
  BLAST_WATER,
  SPARK_F,
  SPARK_GROUND,
  SPARK_HULL,
  SPARK_N,
  SPARK_SHIELD,
  STAR_F,
  STAR_HIT,
  STAR_MUZZLE,
  STAR_MUZZLE_FOE,
  STAR_N,
  STAR_SHIELD,
} from '../sim/effects'
import { lifeOf, SHOT_BOLT, SHOT_F, SHOT_FLAK, SHOT_LASER, SHOT_N } from '../sim/guns'
import { MINES } from '../data/loadout'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import type { Frame } from './frame'
import { ball } from './shapes'
import { pr, project } from './view'

// an explosion, from its first flash to soot (as a crash's, render/ejection.ts)
export const FIRE = [pack(255, 250, 224), pack(255, 214, 96), pack(250, 140, 40), pack(206, 66, 24), pack(52, 46, 50)]
const SPRAY = [pack(255, 255, 255), pack(206, 232, 250)]
const DUST = pack(196, 180, 150)
// tracers: the head, the body and the tail of a bolt; the player's side's are yellow, the enemy's red
const OWN = [pack(255, 255, 232), pack(255, 232, 84), pack(246, 150, 30)]
const FOE = [pack(255, 236, 236), pack(255, 84, 84), pack(196, 30, 70)]
// a sidearm's bolt: short, cyan for the player's side, violet-red for the enemy's
const BOLT_OWN = [pack(236, 255, 255), pack(110, 236, 255), pack(40, 150, 220)]
const BOLT_FOE = [pack(255, 236, 250), pack(255, 90, 190), pack(170, 40, 120)]
// the star where a shot strikes a hull, and a shield
// a mining laser's pulses (pale green, or violet from a foe), and flak's pellets (hot white to orange)
const LASER_OWN = [pack(236, 255, 236), pack(130, 255, 170), pack(40, 190, 120)]
const LASER_FOE = [pack(255, 236, 255), pack(220, 130, 255), pack(150, 50, 200)]
const FLAK_SHOT = [pack(255, 255, 240), pack(255, 196, 110), pack(220, 110, 40)]
// a mine: its dark body, and its light (the side's: green for the player's, red for a foe's)
const MINE_BODY = pack(52, 50, 58)
const MINE_RIM = pack(150, 150, 160)
const MINE_OWN = pack(110, 255, 140)
const MINE_FOE = pack(255, 70, 60)
const STRIKE = [pack(255, 255, 255), pack(255, 214, 96), pack(250, 120, 30)]
const SHIELD = [pack(255, 255, 255), pack(170, 236, 255), pack(80, 170, 255)]
// a missile: its nose, its body, its fins
const ROUND = [pack(240, 240, 236), pack(214, 50, 40), pack(120, 30, 34)]

/** one pixel, if it is in the frame and nothing nearer is in front of it */
function dot(f: Frame, x: number, y: number, col: number, V: number) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return
  const at = y * f.w + x
  if (f.zbuf[at] >= V - 1) f.fb[at] = col
}

/** a line from a to b, its colour going from `cols[0]` at a to the last at b; thick lines are two pixels wide */
function streak(f: Frame, ax: number, ay: number, bx: number, by: number, cols: number[], V: number, thick: boolean, fade: number) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay))))
  for (let i = 0; i <= n; i++) {
    const u = i / n
    const x = Math.round(ax + (bx - ax) * u)
    const y = Math.round(ay + (by - ay) * u)
    // the tail thins out
    if (u > 0.5 && (u - 0.5) * 2 * 16 * fade > BAYER[((y & 3) << 2) | (x & 3)]) continue
    const col = cols[u < 0.18 ? 0 : u < 0.6 ? 1 : 2]
    dot(f, x, y, col, V)
    if (thick && u < 0.7) {
      dot(f, x + 1, y, col, V)
      dot(f, x, y + 1, col, V)
    }
  }
}

/** a four-pointed star: a bright middle and arms `arm` px long */
function star(f: Frame, x: number, y: number, arm: number, cols: number[], V: number) {
  const cx = Math.round(x)
  const cy = Math.round(y)
  dot(f, cx, cy, cols[0], V)
  for (let i = 1; i <= arm; i++) {
    const col = i <= arm * 0.4 ? cols[0] : i <= arm * 0.75 ? cols[1] : cols[2]
    dot(f, cx + i, cy, col, V)
    dot(f, cx - i, cy, col, V)
    dot(f, cx, cy + i, col, V)
    dot(f, cx, cy - i, col, V)
  }
  if (arm >= 3) {
    dot(f, cx + 1, cy + 1, cols[1], V)
    dot(f, cx - 1, cy - 1, cols[1], V)
    dot(f, cx + 1, cy - 1, cols[1], V)
    dot(f, cx - 1, cy + 1, cols[1], V)
  }
}

/**
 * A fireball as the mockup draws one (art/mockups/explosion.png): a jagged ball in hard bands,
 * white at the heart, then yellow, orange and red, cooling from the middle out as it ages
 * (`age` 0..1) until it is soot. `R` is its radius in px.
 */
function fireball(f: Frame, px: number, py: number, R: number, age: number, seed: number, V: number) {
  const { w: W, h: H, fb, zbuf } = f
  if (R < 0.8) return
  const reach = Math.ceil(R * 1.15)
  const x0 = Math.max(0, Math.floor(px - reach))
  const x1 = Math.min(W - 1, Math.ceil(px + reach))
  const y0 = Math.max(0, Math.floor(py - reach))
  const y1 = Math.min(H - 1, Math.ceil(py + reach))
  const spikes = 11
  const turn = seed * 0.37
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - px
      const dy = y - py
      const d = Math.sqrt(dx * dx + dy * dy)
      // a jagged edge: each wedge round it reaches out its own way
      const sector = Math.floor(((Math.atan2(dy, dx) / (Math.PI * 2) + 0.5) * spikes + turn) * 2)
      const edge = R * (0.74 + 0.36 * (hash8(sector * 13 + seed * 101) / 255))
      if (d > edge) continue
      const at = y * W + x
      if (zbuf[at] < V - 1) continue
      const heat = (d / edge) * 0.8 + age * 1.15
      fb[at] = heat < 0.3 ? FIRE[0] : heat < 0.55 ? FIRE[1] : heat < 0.85 ? FIRE[2] : heat < 1.2 ? FIRE[3] : FIRE[4]
    }
  }
}

/**
 * An explosion `t` seconds old at a point on screen (`m` px to a world px, `V` its depth):
 * a flash, balls of fire that swell, rise and turn to soot; over the ground a ring of dust
 * races out, and over the sea the water is thrown up.
 */
export function drawBlast(
  f: Frame,
  scene: SceneState,
  px: number,
  py: number,
  m: number,
  V: number,
  t: number,
  size: number,
  kind: number,
  seed: number,
) {
  const { view } = scene
  const { w: W, h: H, fb, zbuf } = f
  const wet = kind === BLAST_WATER
  const ground = kind !== BLAST_AIR && kind !== BLAST_SMALL
  // a ring racing out over the ground or the water
  if (ground && t < 1.4) {
    const rx = 74 * size * (1 - Math.exp(-t * 2.4)) * m
    const ry = rx * clamp(Math.abs(view.tan), 0.12, 1)
    const n = Math.max(24, Math.round(rx * 2.4))
    const k = Math.round(256 * (1 - t / 1.4))
    const col = wet ? SPRAY[0] : DUST
    for (let i = 0; i < n; i++) {
      if (hash8(i * 7 + ((t * 20) | 0)) < 70) continue
      const a = (i / n) * Math.PI * 2
      const x = Math.round(px + Math.cos(a) * rx)
      const y = Math.round(py - Math.sin(a) * ry)
      if (x < 0 || y < 0 || x >= W - 1 || y >= H) continue
      const at = y * W + x
      if (zbuf[at] < V - 6) continue
      fb[at] = blend(fb[at], col, k)
      fb[at + 1] = blend(fb[at + 1], col, k)
    }
  }
  // in the air: a thin ring of shock, gone in a moment
  if (!ground && t < 0.22) {
    const r = (6 + t * 220) * size * m
    const n = Math.max(16, Math.round(r * 3))
    const k = Math.round(220 * (1 - t / 0.22))
    for (let i = 0; i < n; i++) {
      if (hash8(i * 13 + seed) < 90) continue
      const a = (i / n) * Math.PI * 2
      const x = Math.round(px + Math.cos(a) * r)
      const y = Math.round(py - Math.sin(a) * r * 0.8)
      if (x < 0 || y < 0 || x >= W || y >= H) continue
      const at = y * W + x
      if (zbuf[at] >= V - 1) fb[at] = blend(fb[at], SPRAY[0], k)
    }
  }
  // the sea thrown up
  if (wet && t < 1.2) {
    for (let i = 0; i < 9; i++) {
      const up = Math.sin(Math.PI * Math.min(1, t / (0.8 + (hash8(i * 19 + 3) / 255) * 0.4))) * (16 + (hash8(i * 43 + 1) / 255) * 26) * size
      const ox = (hash8(i * 13 + 9) / 255 - 0.5) * 30 * size
      ball(f, px + ox * m, py - up * m, (2.2 + (hash8(i * 5 + 2) / 255) * 2.6) * m, SPRAY[i & 1], V, 256, true)
      ball(f, px + ox * m, py - up * 0.5 * m, 2.4 * m, SPRAY[1], V, 200, true)
    }
  }
  // the first flash
  if (t < 0.09) ball(f, px, py - 5 * m * (ground ? 1 : 0), (8 + t * 90) * size * m, FIRE[0], V, 256, true)
  // in the air, the heart of it: a jagged ball of fire that swells, cools and is gone
  if (!ground && t >= 0.04 && t < 0.75) {
    const age = t / 0.75
    const R = (7 + 6 * Math.sqrt(age)) * size * m * (age > 0.7 ? 1 - (age - 0.7) / 0.3 : 1)
    fireball(f, px, py - age * 4 * size * m, R, age, seed, V)
  }
  // balls of fire that swell, rise, and turn to soot (in the air they burst outwards instead)
  const fire = wet ? 0.7 : 1
  const balls = kind === BLAST_SMALL ? 6 : 10
  for (let i = 0; i < balls; i++) {
    const h = i * 31 + seed * 7
    const a = (t - (hash8(h + 7) / 255) * 0.24) / (0.75 + (hash8(h + 3) / 255) * 0.55)
    if (a <= 0 || a >= 1) continue
    let ox: number
    let up: number
    if (ground) {
      ox = (hash8(h + 1) / 255 - 0.5) * 24
      up = (hash8(h + 5) / 255) * 9 + a * 26
    } else {
      const dir = (hash8(h + 11) / 255) * Math.PI * 2
      const out = (4 + (hash8(h + 13) / 255) * 9) * Math.sqrt(a)
      ox = Math.cos(dir) * out
      up = Math.sin(dir) * out * 0.8 + a * 8
    }
    const r = (5 + (hash8(h + 9) / 255) * 7) * (0.35 + 0.65 * (1 - (1 - a) * (1 - a) * (1 - a))) * size * fire * m
    const k = a < 0.62 ? 256 : Math.round(256 * (1 - (a - 0.62) / 0.38))
    ball(f, px + ox * size * m, py - up * size * m, r, a < 0.12 ? FIRE[1] : a < 0.34 ? FIRE[2] : a < 0.62 ? FIRE[3] : FIRE[4], V, k, true)
    if (a < 0.42) ball(f, px + ox * size * m, py - up * size * m, r * 0.56, a < 0.2 ? FIRE[0] : FIRE[1], V, 256, true)
  }
}

/** a shield that has just stopped a shot glows for a moment: a broken ring round the ship */
export function drawShields(scene: SceneState, f: Frame) {
  const { view } = scene
  const sc = jetSize(scene.params)
  for (const fi of scene.fighters) {
    const age = scene.time - fi.shieldAt
    if (!fi.alive || age < 0 || age > 0.2) continue
    const j = fi.jet
    if (j.away || !project(view, j.x, j.y, j.z)) continue
    const r = fi.radius * 0.95 * sc * pr.m
    const ry = r * clamp(0.45 + Math.abs(view.tan) * 0.4, 0.45, 0.85)
    const n = Math.max(20, Math.round(r * 4))
    const k = Math.round(230 * (1 - age / 0.2))
    const { w: W, h: H, fb, zbuf } = f
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = Math.round(pr.x + Math.cos(a) * r)
      const y = Math.round(pr.y - Math.sin(a) * ry)
      if (x < 0 || y < 0 || x >= W || y >= H || ((x + y) & 1) === 1) continue
      const at = y * W + x
      if (zbuf[at] >= pr.v - 1) fb[at] = blend(fb[at], SHIELD[i % 3 === 0 ? 0 : 1], k)
    }
  }
}

/** a ship badly hit burns: two or three flames licking at its hull, flickering, in the same places as it turns */
function drawFires(scene: SceneState, f: Frame) {
  const { view } = scene
  const sc = jetSize(scene.params)
  for (const fi of scene.fighters) {
    if (!fi.alive || fi.hull / fi.stats.hull >= DAMAGE.fireAt) continue
    const j = fi.jet
    if (j.away) continue
    const m = fi.mesh.model
    const cs = Math.cos(j.yaw)
    const sn = Math.sin(j.yaw)
    for (let i = 0; i < 3; i++) {
      // (each flame's place on the hull: across and along, from a number of its own)
      const seed = i * 97 + m.w * 13
      const a = (hash8(seed) / 255 - 0.5) * m.w * 0.5 * sc
      const b = (hash8(seed + 7) / 255 - 0.6) * m.l * 0.5 * sc
      if (!project(view, j.x + a * cs + b * sn, j.y + a * sn - b * cs, j.z + 2 * sc)) continue
      const flick = hash8(((scene.time * 24) | 0) * 31 + i * 7)
      const r = (1.2 + (flick / 255) * 1.4) * Math.max(0.8, pr.m * sc)
      const lick = r * 0.8
      ball(f, pr.x, pr.y - lick * 0.5, r, flick > 128 ? FIRE[2] : FIRE[3], pr.v - 3, 256, true)
      ball(f, pr.x, pr.y - lick, r * 0.6, flick > 60 ? FIRE[1] : FIRE[0], pr.v - 3, 256, false)
    }
  }
}

/** explosions, and the flashes of guns and of hits: drawn over the ships */
export function drawBursts(scene: SceneState, f: Frame) {
  const { view, effects: e } = scene
  const sc = jetSize(scene.params)
  const time = scene.time
  drawFires(scene, f)
  for (let i = 0; i < BLAST_N; i++) {
    const o = i * BLAST_F
    const t = time - e.blasts[o + 3]
    if (t < 0 || t > 2) continue
    const drift = blastDrift(t)
    if (!project(view, e.blasts[o] + e.blasts[o + 7] * drift, e.blasts[o + 1] + e.blasts[o + 8] * drift, e.blasts[o + 2])) continue
    const kind = e.blasts[o + 5]
    drawBlast(f, scene, pr.x, pr.y, pr.m, pr.v - 4, t, e.blasts[o + 4], kind, e.blasts[o + 6])
  }
  // flashes: at a muzzle for a moment; where a shot struck, a star that opens and closes
  for (let i = 0; i < STAR_N; i++) {
    const o = i * STAR_F
    const age = time - e.stars[o + 3]
    const kind = e.stars[o + 5]
    const muzzle = kind === STAR_MUZZLE || kind === STAR_MUZZLE_FOE
    const life = muzzle ? 0.05 : 0.16
    if (age < 0 || age > life) continue
    if (!project(view, e.stars[o], e.stars[o + 1], e.stars[o + 2])) continue
    const grow = Math.sin((age / life) * Math.PI)
    const size = Math.max(1, Math.min(6, pr.m * sc))
    if (muzzle) star(f, pr.x, pr.y, Math.round(1 + size * 0.8), kind === STAR_MUZZLE ? OWN : FOE, pr.v - 2)
    else if (kind === STAR_HIT) star(f, pr.x, pr.y, Math.round(1 + grow * (2 + size)), STRIKE, pr.v - 3)
    else if (kind === STAR_SHIELD) star(f, pr.x, pr.y, Math.round(1 + grow * (1.5 + size)), SHIELD, pr.v - 3)
  }
}

/** shots, missiles and sparks: drawn before the ships, which pass in front of them */
export function drawCombat(scene: SceneState, f: Frame) {
  const { view, effects: e, guns } = scene
  const sc = jetSize(scene.params)
  const time = scene.time
  // tracers: a bolt from the shot back along its path, bright at the head
  const sh = guns.shots
  for (let i = 0; i < SHOT_N; i++) {
    const o = i * SHOT_F
    const born = sh[o + 6]
    if (born < -1) continue
    const age = time - born
    const vx = sh[o + 3]
    const vy = sh[o + 4]
    const vz = sh[o + 5]
    const kind = sh[o + 9]
    const bolt = kind === SHOT_BOLT
    const back = Math.min(age, bolt ? 0.03 : kind === SHOT_FLAK ? 0.014 : kind === SHOT_LASER ? 0.05 : 0.036)
    if (!project(view, sh[o] - vx * back, sh[o + 1] - vy * back, sh[o + 2] - vz * back)) continue
    const tx = pr.x
    const ty = pr.y
    if (!project(view, sh[o], sh[o + 1], sh[o + 2])) continue
    const fade = clamp((age / lifeOf(kind) - 0.6) / 0.4, 0, 1)
    const own = sh[o + 7] === 0
    const cols =
      kind === SHOT_LASER
        ? own
          ? LASER_OWN
          : LASER_FOE
        : kind === SHOT_FLAK
          ? FLAK_SHOT
          : bolt
            ? own
              ? BOLT_OWN
              : BOLT_FOE
            : own
              ? OWN
              : FOE
    streak(f, pr.x, pr.y, tx, ty, cols, pr.v, pr.m > 0.75, fade)
  }
  // mines: a small dark ball with a rim, its light blinking faster once it is armed
  for (const m of scene.mines.list) {
    if (!project(view, m.x, m.y, m.z)) continue
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    const V = pr.v
    dot(f, x, y, MINE_BODY, V)
    dot(f, x - 1, y, MINE_RIM, V)
    dot(f, x + 1, y, MINE_BODY, V)
    dot(f, x, y + 1, MINE_BODY, V)
    dot(f, x, y - 1, MINE_RIM, V)
    const age = time - m.born
    const rate = age < MINES.arm ? 3 : 7
    if (((age * rate) | 0) % 2 === 0) dot(f, x, y, m.side === 0 ? MINE_OWN : MINE_FOE, V)
  }
  // missiles: a short dart, its flame flickering behind it
  for (const m of scene.missiles) {
    if (!m.on) continue
    const c = Math.cos(m.climb)
    const fx = Math.sin(m.yaw) * c
    const fy = -Math.cos(m.yaw) * c
    const fz = Math.sin(m.climb)
    const len = 4 * sc
    if (!project(view, m.x - fx * len, m.y - fy * len, m.z - fz * len)) continue
    const bx = pr.x
    const by = pr.y
    if (!project(view, m.x, m.y, m.z)) continue
    const V = pr.v
    const thick = pr.m > 1.8
    streak(f, pr.x, pr.y, bx, by, [ROUND[0], ROUND[1], ROUND[2]], V, thick, 0)
    const flick = hash8(((time * 30) | 0) + m.t * 100) > 110
    const tailX = bx + (bx - pr.x) * 0.6
    const tailY = by + (by - pr.y) * 0.6
    dot(f, Math.round(tailX), Math.round(tailY), flick ? FIRE[0] : FIRE[1], V)
    if (flick) dot(f, Math.round(bx + (bx - pr.x) * 1.1), Math.round(by + (by - pr.y) * 1.1), FIRE[2], V)
  }
  // sparks: tiny hot bits that fall and cool
  for (let i = 0; i < SPARK_N; i++) {
    const o = i * SPARK_F
    const age = time - e.sparks[o + 6]
    const kind = e.sparks[o + 7]
    const life = kind === SPARK_SHIELD ? 0.3 : kind === SPARK_HULL ? 0.55 : 0.4
    if (age < 0 || age > life) continue
    if (!project(view, e.sparks[o], e.sparks[o + 1], e.sparks[o + 2])) continue
    const u = age / life
    const col =
      kind === SPARK_HULL
        ? STRIKE[u < 0.25 ? 0 : u < 0.6 ? 1 : 2]
        : kind === SPARK_SHIELD
          ? SHIELD[u < 0.4 ? 0 : u < 0.75 ? 1 : 2]
          : kind === SPARK_GROUND
            ? DUST
            : SPRAY[u < 0.5 ? 0 : 1]
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    dot(f, x, y, col, pr.v)
    if (pr.m > 2.4) dot(f, x + 1, y, col, pr.v)
  }
}
