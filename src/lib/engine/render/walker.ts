// How pilots on foot are drawn (sim/foot.ts and sim/walkers.ts are what they do): each in his
// race's sprite (races/art.ts, the image model's) in his own colours (races/look.ts), turned to
// whichever of eight ways he faces on the screen, stepping as he walks. Coming down after
// ejecting he is drawn the way his race comes down; dead, he lies a moment and fades. Under
// trees he shows only to himself, dimly; in shallow water his legs are hidden. Beacons and
// flares (sim/signals.ts) and veins of ore (sim/veins.ts) are drawn here too.
//
// Everything is in the world's own pixels, at their true size (overhead, one art pixel a world
// pixel), and hidden by any hill or tree in front of it, as a ship is.

import { FOOT } from '../data/foot'
import { RESOURCES } from '../data/resources'
import { RACE_ART } from '../races/art'
import { INK } from '../races/look'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import { PREFABS } from '../world/prefabs'
import { groundAt } from '../world/world'
import { ABOARD, BOARDING, DEAD, FALLING, WALKING } from '../sim/foot'
import type { Walker } from '../sim/foot'
import { veinLeft } from '../sim/veins'
import { looping, wrapDelta } from '../sim/loop'
import type { Frame } from './frame'
import { thread } from './shapes'
import { pr, project } from './view'

/** the art's five sides, by the eight ways a pilot can face on the screen (n, ne, e, se, s, sw, w, nw), and whether turned round */
const SIDE_OF = [4, 3, 2, 1, 0, 1, 2, 3]
const MIRROR = [false, false, false, false, false, true, true, true]

const SHADOW = pack(0, 0, 0)
const FOAM = pack(226, 242, 250)
const POLE = pack(40, 38, 46)

/**
 * A picture of letters into the frame: (x0, y0) its top-left, `s` frame pixels a pixel, turned
 * round (`mirror`) or a quarter turn (`lie`), with rows from `cut` down left out (in water),
 * every other pixel left out with `faint`, `k` its strength out of 256.
 */
export function letters(
  f: Frame,
  rows: string,
  w: number,
  h: number,
  colours: Uint32Array,
  x0: number,
  y0: number,
  s: number,
  V: number,
  mirror: boolean,
  lie = false,
  cut = 99,
  faint = 0,
  k = 256,
) {
  const { w: W, h: H, fb, zbuf } = f
  for (let r = 0; r < h; r++) {
    if (r >= cut) break
    for (let c = 0; c < w; c++) {
      const i = INK[rows.charCodeAt(r * w + (mirror ? w - 1 - c : c))]
      if (i < 0) continue
      // (lying down: a quarter turn, his head to the left)
      const px = lie ? r : c
      const py = lie ? w - 1 - c : r
      for (let yy = 0; yy < s; yy++) {
        const y = y0 + py * s + yy
        if (y < 0 || y >= H) continue
        for (let xx = 0; xx < s; xx++) {
          const x = x0 + px * s + xx
          if (x < 0 || x >= W) continue
          if (faint && BAYER[((y & 3) << 2) | (x & 3)] < faint) continue
          const at = y * W + x
          if (zbuf[at] < V - 1) continue
          fb[at] = k >= 256 ? colours[i] : blend(fb[at], colours[i], k)
        }
      }
    }
  }
}

/** a dark smudge on the ground under a pilot, to stand him on it */
function shadow(f: Frame, x: number, y: number, half: number, V: number) {
  const { w: W, h: H, fb, zbuf } = f
  if (y < 0 || y >= H) return
  for (let dx = -half; dx <= half; dx++) {
    const xx = x + dx
    if (xx < 0 || xx >= W) continue
    const at = y * W + xx
    if (zbuf[at] < V - 3) continue
    fb[at] = blend(fb[at], SHADOW, Math.abs(dx) === half ? 50 : 96)
  }
}

/** which of the eight ways on the screen a pilot faces, from his heading and the camera's turn */
function wayOf(scene: SceneState, yaw: number) {
  const a = yaw + scene.view.yaw
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
}

/** one pilot on foot (or coming down, dead, climbing in); `own`: the player himself (he sees himself under trees) */
export function drawWalker(scene: SceneState, f: Frame, w: Walker, own: boolean) {
  const race = RACE_ART[w.look.race]
  if (!race) return
  // (out on a world he is his true size beside his ship; inside, the rooms are drawn larger, and so is he)
  const art = scene.zone.kind === 'interior' || scene.interior.flying ? race : race.small
  const view = scene.view
  const j = w.jet
  const feet = j.z - FOOT.chest
  if (!project(view, j.x, j.y, feet)) return
  const s = Math.max(1, Math.round(pr.m))
  const fx = Math.round(pr.x)
  const fy = Math.round(pr.y)
  const V = pr.v - 1
  const colours = w.paint.sprite
  const t = scene.time
  // under the trees: only himself, faintly; another only from close by
  let faint = 0
  if (w.hidden && w.stage === WALKING) {
    if (!own) {
      // (a scanner aboard shows him under the trees too)
      const me = scene.foot.stage === ABOARD ? scene.jets[0] : scene.foot.walker.jet
      const scanned = scene.foot.stage === ABOARD && scene.parts.radar > 1
      if (!scanned && Math.hypot(me.x - j.x, me.y - j.y) > FOOT.hidden) return
    }
    faint = 8
  }

  if (w.stage === FALLING) {
    // coming down: his shadow far below, and him the way his race comes down (opening as it goes)
    if (project(view, j.x, j.y, groundAt(scene.world, j.x, j.y))) shadow(f, Math.round(pr.x), Math.round(pr.y), 1, pr.v)
    project(view, j.x, j.y, feet)
    if (w.open < 0.35) {
      const side = art.sides[0]
      letters(f, side.steps[0], side.w, side.h, colours, fx - ((side.w * s) >> 1), fy - side.h * s + s, s, V, false)
      return
    }
    const fall = art.fall
    const kind = w.look.race
    // (a rotor spins, a ball tumbles, a canopy sways)
    const spin = kind === 'orrin' && ((t * 14) | 0) % 2 === 1
    const sway = kind === 'skarn' ? 0 : Math.round(Math.sin(t * 1.8 + j.x) * 1.2)
    const tumble = kind === 'skarn' && ((t * 8) | 0) % 2 === 1
    letters(f, fall.rows, fall.w, fall.h, colours, fx - ((fall.w * s) >> 1) + sway * s, fy - fall.h * s + s, s, V, spin, tumble)
    return
  }

  const way = wayOf(scene, j.yaw)
  const side = art.sides[SIDE_OF[way]]
  const mirror = MIRROR[way]
  if (w.stage === DEAD) {
    // fallen over, fading
    const k = Math.round(256 * clamp(1 - (w.t - 1.6) / 1.4, 0, 1))
    if (k <= 0) return
    letters(f, side.steps[0], side.w, side.h, colours, fx - ((side.h * s) >> 1), fy - side.w * s + s, s, V, mirror, true, 99, 0, k)
    return
  }
  let lift = 0
  let cut = 99
  if (w.stage === BOARDING) {
    // up into the seat, sinking into the cockpit
    const u = clamp(w.t / FOOT.board, 0, 1)
    if (u > 0.55) cut = Math.round(side.h * (1 - (u - 0.55) / 0.45))
  }
  // a step of the walk (standing still: the first); in water only the top of him shows
  const step = w.moving > 0.05 && w.dive < 0 ? Math.floor(w.step) % 4 : 0
  const small = art !== race
  if (w.wading) cut = side.h - (small ? 2 : 4)
  // a dive: he tumbles round, low
  let rows = side.steps[step]
  let shown = side
  let flip = mirror
  if (w.dive >= 0) {
    const turn = SIDE_OF[(way + Math.floor(w.dive * 18)) % 8]
    shown = art.sides[turn]
    rows = shown.steps[0]
    flip = !mirror
    lift = small ? -1 : -2
  }
  if (!w.hidden && !w.wading) shadow(f, fx, fy + 1, Math.max(1, (shown.w >> 1) - 2), pr.v)
  letters(f, rows, shown.w, shown.h, colours, fx - ((shown.w * s) >> 1), fy - shown.h * s + s * 2 - lift * s, s, V, flip, false, cut, faint)
  if (w.wading) {
    // ripples round his legs
    const at = fy - 1
    const r = (shown.w >> 1) + (((t * 4) | 0) % 2)
    for (const dx of [-r, -r + 1, r - 1, r]) {
      const x = fx + dx
      if (x < 0 || x >= f.w || at < 0 || at >= f.h) continue
      const o = at * f.w + x
      if (f.zbuf[o] >= V - 3) f.fb[o] = blend(f.fb[o], FOAM, 170)
    }
  }
  // the sidearm's flash, and the hand tool's sparks are effects (sim)
}

/** every pilot on foot: the player (if he is out of his ship) and the others */
export function drawWalkers(scene: SceneState, f: Frame) {
  for (const w of scene.walkers) drawWalker(scene, f, w, false)
  if (scene.foot.stage !== ABOARD) drawWalker(scene, f, scene.foot.walker, true)
}

// a vein: the middle of its ore's picture (the image model's), its crystals only, flush with the ground
const VEIN_ART: Record<string, { w: number; h: number; px: number[] }> = {}
for (const id of Object.keys(RESOURCES)) {
  const p = PREFABS[id]
  if (!p) continue
  const x0 = Math.max(0, (p.w >> 1) - 3)
  const y0 = Math.max(0, (p.h >> 1) - 3)
  const px: number[] = []
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 7; x++) {
      const ch = p.mat[y0 + y]?.[x0 + x] ?? '.'
      px.push(ch === '0' ? 0 : ch === '1' ? 1 : ch === '2' ? 2 : -1)
    }
  VEIN_ART[id] = { w: 7, h: 5, px }
}
const ORE_COLS = new Map(Object.values(RESOURCES).map((r) => [r.id, r.colours.map((c) => pack(c[0], c[1], c[2]))]))
const GLINT = pack(255, 250, 220)

/** the veins near the camera, glinting now and then (a cut-out one shows only a scar of dark rock) */
export function drawVeins(scene: SceneState, f: Frame) {
  const veins = scene.foot.veins
  // (only for a pilot who could walk to them: in the loop)
  if (!veins.length || !looping(scene)) return
  const view = scene.view
  // (they are for a pilot on foot, cut with the hand cutter: shown only once he is out of his ship. A few px each and drawn
  // at one size, from a ship each was a bright block standing over the ground, or in the sky beyond its haze. James,
  // 2026-11-18: "are they for mining on foot? If so, just show them when on foot!")
  if (scene.foot.stage === ABOARD) return
  const { w: W, h: H, fb, zbuf } = f
  const t = scene.time
  for (const v of veins) {
    const dx = v.x - view.x
    const dy = v.y - view.y
    // (the world wraps: the nearest copy)
    const x = view.x + wrapDelta(dx)
    const y = view.y + wrapDelta(dy)
    if (!project(view, x, y, v.z)) continue
    if (pr.x < -10 || pr.x > W + 10 || pr.y < -10 || pr.y > H + 10) continue
    const art = VEIN_ART[v.ore]
    if (!art) continue
    const left = veinLeft(scene, v)
    const cols = ORE_COLS.get(v.ore)!
    const x0 = Math.round(pr.x) - 3
    const y0 = Math.round(pr.y) - 3
    const glint = (t * 0.7 + v.id * 0.31) % 1 < 0.08
    for (let i = 0; i < art.px.length; i++) {
      const k = art.px[i]
      if (k < 0) continue
      const xx = x0 + (i % art.w)
      const yy = y0 + Math.floor(i / art.w)
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const at = yy * W + xx
      // (one under trees shows through their crowns: it is what a pilot on foot is looking for)
      if (!v.under && zbuf[at] < pr.v - 2) continue
      // (cut out: dark rock where it was)
      if (left <= 0) fb[at] = blend(fb[at], SHADOW, 70)
      else fb[at] = glint && k === 0 ? GLINT : cols[k]
    }
  }
}

/** beacons standing in the ground (a post with a light that blinks, and a thin beam up), and flares in the sky */
export function drawSignals(scene: SceneState, f: Frame) {
  const view = scene.view
  const t = scene.time
  for (const b of scene.signals.beacons) {
    if (!project(view, b.x, b.y, b.z)) continue
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    const V = pr.v - 1
    // a post with a little foot, a lamp on top that blinks, and a thin beam up from it
    thread(f, x - 1, y, x + 1, y, POLE, V, 256)
    thread(f, x, y, x, y - 7, POLE, V, 256)
    const on = ((t * 2 + b.born) | 0) % 2 === 0
    for (let i = 10; i < 48; i++) {
      const yy = y - i
      if (yy < 0 || x < 0 || x >= f.w || yy >= f.h) continue
      const at = yy * f.w + x
      if (f.zbuf[at] >= V - 1) f.fb[at] = blend(f.fb[at], b.col, Math.round((on ? 130 : 70) * (1 - i / 48)))
    }
    thread(f, x - 1, y - 8, x + 1, y - 8, on ? b.col : POLE, V, 256)
    thread(f, x - 1, y - 9, x + 1, y - 9, on ? pack(255, 255, 255) : b.col, V, 256)
    thread(f, x, y - 10, x, y - 10, b.col, V, 256)
  }
  for (const fl of scene.signals.flares) {
    if (!project(view, fl.x, fl.y, fl.z)) continue
    const age = t - fl.born
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    const flick = hash8(((t * 30) | 0) + Math.round(fl.born * 7)) > 90
    const r = age < 1.2 ? 1 : flick ? 2 : 1
    // a hot white heart in its colour's glow
    for (let dy = -r - 1; dy <= r + 1; dy++)
      for (let dx = -r - 1; dx <= r + 1; dx++) {
        const d = Math.abs(dx) + Math.abs(dy)
        if (d > r + 1) continue
        const xx = x + dx
        const yy = y + dy
        if (xx < 0 || yy < 0 || xx >= f.w || yy >= f.h) continue
        const at = yy * f.w + xx
        if (f.zbuf[at] < pr.v - 3) continue
        f.fb[at] = d === 0 ? pack(255, 255, 255) : d <= r ? fl.col : blend(f.fb[at], fl.col, 110)
      }
  }
}
