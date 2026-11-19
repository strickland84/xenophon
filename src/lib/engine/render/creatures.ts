// How the worlds' creatures are drawn (sim/creatures.ts is what they do): each in its kind's sprite (creatures/art.ts, the
// image model's), turned to whichever of eight ways it faces on the screen, stepping as it goes, a shadow under it. Struck,
// it flashes white and a bar shows how hurt it is; killed, it falls on its side and fades. Spitters' globs fly in an arc and
// splash; a little ichor flies where a shot strikes, in its kind's own colour (never red, never much); and what a creature
// drops lies where it fell, the rare heartstone glinting.
//
// Everything is in the world's own pixels at their true size, hidden by any hill or tree in front of it, as a pilot is.

import { CREATURE_ART, LOOT_ART } from '../creatures/art'
import { CREATURES, LOOT, STRUCK } from '../data/creatures'
import type { TimeOfDay } from '../params'
import { BITE, CHARGE, DEAD, FLEE } from '../sim/creatures'
import type { Creature } from '../sim/creatures'
import { wrapDelta } from '../sim/loop'
import type { SceneState } from '../state'
import { ABOARD } from '../sim/foot'
import { blend, pack } from '../util/color'
import { clamp } from '../util/math'
import type { Frame } from './frame'
import { groundAt, matAt } from '../world/world'
import { grade } from './palettes'
import { pr, project } from './view'
import { letters } from './walker'

/** the art's five sides, by the eight ways a creature can face on the screen (n, ne, e, se, s, sw, w, nw), and whether turned round */
const SIDE_OF = [4, 3, 2, 1, 0, 1, 2, 3]
const MIRROR = [false, false, false, false, false, true, true, true]

const SHADOW = pack(0, 0, 0)
const WHITE = pack(255, 255, 255)
const FOAM = pack(226, 242, 250)
const BAR_BACK = pack(20, 16, 24)
const BAR = pack(250, 196, 70)
const BAR_LOW = pack(250, 96, 60)
const GLINT = pack(255, 250, 220)
const GOLD = pack(255, 214, 90)

/** each kind's colours, and each dropped thing's, for a time of day (worked out once for each) */
const painted = new Map<string, Uint32Array>()
function coloursOf(key: string, list: number[][], tod: TimeOfDay, glowLast = false) {
  const k = `${key}:${tod}`
  let out = painted.get(k)
  if (out) return out
  out = new Uint32Array(64)
  const amount = tod === 'sunset' ? 0.5 : tod === 'night' ? 0.2 : 0
  list.forEach((c, i) => {
    // (the outline keeps its dark; the rest takes the light of the time of day, as the pilots do)
    const g = glowLast && i === list.length - 1 ? c : grade(c, tod, amount)
    out![i] = pack(g[0], g[1], g[2])
  })
  painted.set(k, out)
  return out
}

/** the colours of a picture, all white (a creature struck) */
const WHITES = new Uint32Array(64).fill(WHITE)

/** which of the eight ways on the screen something faces, from its heading and the camera's turn */
function wayOf(scene: SceneState, yaw: number) {
  const a = yaw + scene.view.yaw
  return ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8
}

/** a soft dark smudge on the ground, `half` px either side */
function shadow(f: Frame, x: number, y: number, half: number, V: number) {
  const { w: W, h: H, fb, zbuf } = f
  for (let row = 0; row < 2; row++) {
    const yy = y + row
    if (yy < 0 || yy >= H) continue
    const hw = row === 0 ? half : half - 1
    for (let dx = -hw; dx <= hw; dx++) {
      const xx = x + dx
      if (xx < 0 || xx >= W) continue
      const at = yy * W + xx
      if (zbuf[at] < V - 3) continue
      fb[at] = blend(fb[at], SHADOW, Math.abs(dx) === hw ? 44 : row ? 56 : 88)
    }
  }
}

/** one pixel, if nothing nearer is in front of it */
function dot(f: Frame, x: number, y: number, col: number, V: number, k = 256) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h) return
  const at = y * f.w + x
  if (f.zbuf[at] < V - 2) return
  f.fb[at] = k >= 256 ? col : blend(f.fb[at], col, k)
}

/** where a thing at (x, y, z) is on the screen (the nearest copy of it, across the world's wrap): false when off it */
function place(scene: SceneState, x: number, y: number, z: number) {
  const view = scene.view
  if (!project(view, view.x + wrapDelta(x - view.x), view.y + wrapDelta(y - view.y), z)) return false
  return pr.x > -40 && pr.y > -40 && pr.x < scene.screen.w + 40 && pr.y < scene.screen.h + 40
}

// scratch: the creatures in the order they are drawn (far first)
const order: Creature[] = []

/** every creature up, and its globs, ichor, and what was dropped */
export function drawCreatures(scene: SceneState, f: Frame) {
  const wild = scene.wild
  // (only on the world they live on: not in space, nor inside, nor on the way down or up; and only while he is out of his
  // ship, on foot, the view they are drawn for: from the seat and from behind they stood huge in the sky, James saw)
  if (scene.zone.kind !== 'surface' || scene.travel.kind || wild.world !== scene.worldKey) return
  if (scene.foot.stage === ABOARD) return
  if (!wild.up.length && !wild.loot.length && !wild.globs.length && !wild.ichor.length) return
  drawIchor(scene, f)
  drawDropped(scene, f)
  order.length = 0
  for (const c of wild.up) order.push(c)
  const view = scene.view
  order.sort(
    (a, b) =>
      wrapDelta(b.x - view.x) * view.sin +
      wrapDelta(b.y - view.y) * view.cos -
      (wrapDelta(a.x - view.x) * view.sin + wrapDelta(a.y - view.y) * view.cos),
  )
  for (const c of order) drawCreature(scene, f, c)
  drawGlobs(scene, f)
}

function drawCreature(scene: SceneState, f: Frame, c: Creature) {
  const art = CREATURE_ART[c.kind.id]
  if (!art || !place(scene, c.x, c.y, c.z)) return
  const t = scene.time
  const s = Math.max(1, Math.round(pr.m))
  const fx = Math.round(pr.x)
  const fy = Math.round(pr.y)
  const V = pr.v - 1
  const tod = scene.params.timeOfDay
  const struck = t - c.hitAt < STRUCK.flash
  const colours = struck ? WHITES : coloursOf(c.kind.id, art.colours, tod, true)
  const plant = c.kind.way === 'lurk'
  if (c.mode === DEAD) {
    // fallen on its side, fading (a flash as it is struck down)
    const side = art.sides[plant ? 0 : 2]
    const k = Math.round(256 * clamp(1 - (c.t - 1.4) / 1.4, 0, 1))
    if (k <= 0) return
    const cols = c.t < STRUCK.flash * 2 ? WHITES : colours
    const mirror = Math.sin(c.yaw + scene.view.yaw) < 0
    if (plant) letters(f, side.steps[0], side.w, side.h, cols, fx - ((side.w * s) >> 1), fy - side.h * s + s, s, V, false, false, 99, 4, k)
    else letters(f, side.steps[0], side.w, side.h, cols, fx - ((side.h * s) >> 1), fy - side.w * s + s, s, V, mirror, true, 99, 0, k)
    return
  }
  let side
  let mirror = false
  if (plant) {
    // a snapweed: closed, or snapped open as it bites (and a moment after)
    const open = c.mode === BITE ? c.t > c.kind.windup * 0.5 : c.rest > c.kind.rest - 0.35
    side = art.sides[open && art.sides[1] ? 1 : 0]
  } else {
    const way = wayOf(scene, c.yaw)
    side = art.sides[SIDE_OF[way]] ?? art.sides[0]
    mirror = MIRROR[way]
  }
  const moving = Math.hypot(c.vx, c.vy) > 2
  const step = moving ? Math.floor(c.step) % 4 : 0
  // (a bite: it lunges a pixel the way it faces)
  let lx = 0
  let ly = 0
  if (c.mode === BITE && !plant && c.t > c.kind.windup * 0.6) {
    lx = Math.round(Math.sin(c.yaw + scene.view.yaw))
    ly = -Math.round(Math.cos(c.yaw + scene.view.yaw))
  }
  // in the water (a swimmer), only its top shows, with ripples round it
  const swimming = c.kind.swims && scene.world.look.sea === 'water' && matAt(scene.world, c.x, c.y) < 2
  const cut = swimming ? side.h - 3 : 99
  if (!swimming) shadow(f, fx, fy + 1, Math.max(1, (side.w >> 1) - 1), pr.v)
  const x0 = fx - ((side.w * s) >> 1) + lx * s
  const y0 = fy - side.h * s + s * 2 + ly * s
  letters(f, side.steps[step], side.w, side.h, colours, x0, y0, s, V, mirror, false, cut)
  if (swimming) {
    const r = (side.w >> 1) + (((t * 3 + c.id) | 0) % 2)
    for (const dx of [-r, -r + 1, r - 1, r]) dot(f, fx + dx, fy - 1, FOAM, V, 170)
  }
  // the hurt bar, a moment after it is struck (or while it runs at him)
  const hurt = c.health < c.kind.health && (t - c.hitAt < STRUCK.bar || c.mode === CHARGE || c.mode === FLEE)
  if (hurt) {
    const bw = clamp(side.w - 2, 6, 14)
    const bx = fx - (bw >> 1)
    const by = y0 - 3
    const left = clamp(c.health / c.kind.health, 0, 1)
    for (let x = -1; x <= bw; x++) for (let y = -1; y <= 1; y++) dot(f, bx + x, by + y, BAR_BACK, V, 200)
    const fill = Math.max(1, Math.round(bw * left))
    for (let x = 0; x < fill; x++) dot(f, bx + x, by, left > 0.35 ? BAR : BAR_LOW, V)
  }
}

// ── what was dropped, the globs, the ichor

/** each dropped thing's colours, and the credits' (a chip from their icon) */
function drawDropped(scene: SceneState, f: Frame) {
  const t = scene.time
  const tod = scene.params.timeOfDay
  for (const l of scene.wild.loot) {
    const art = LOOT_ART[l.item]
    if (!art || !place(scene, l.x, l.y, l.z)) continue
    const age = t - l.born
    // (blinking as it is about to go)
    if (LOOT.life - age < LOOT.blink && ((t * 6) | 0) % 2 === 0) continue
    const V = pr.v - 1
    const x0 = Math.round(pr.x) - (art.w >> 1)
    const y0 = Math.round(pr.y) - art.h + 1
    const cols = coloursOf(`loot-${l.item}`, art.colours, tod)
    // a shadow, the thing, and now and then a glint off it
    shadow(f, Math.round(pr.x), Math.round(pr.y) + 1, Math.max(1, art.w >> 1), pr.v)
    letters(f, art.rows, art.w, art.h, cols, x0, y0, 1, V, false)
    const phase = (t * 0.8 + l.tag * 0.37) % 1
    if (phase < 0.06) dot(f, x0 + (art.w >> 1), y0, GLINT, V)
    if (l.rare) {
      // the rare one: a star of light over it, turning, and a ring of it on the ground
      const tw = (t * 2 + l.tag) % 1
      const arm = tw < 0.5 ? 2 : 1
      const cx = x0 + (art.w >> 1)
      const cy = y0 - 2
      dot(f, cx, cy, WHITE, V)
      for (let i = 1; i <= arm; i++) {
        const k = i === arm ? 150 : 230
        dot(f, cx - i, cy, GOLD, V, k)
        dot(f, cx + i, cy, GOLD, V, k)
        dot(f, cx, cy - i, GOLD, V, k)
        dot(f, cx, cy + i, GOLD, V, k)
      }
      const gx = Math.round(pr.x)
      const gy = Math.round(pr.y)
      const r = 4 + (((t * 3) | 0) % 2)
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + t
        dot(f, Math.round(gx + Math.cos(a) * r), Math.round(gy + Math.sin(a) * r * 0.6), GOLD, pr.v, 90)
      }
    }
  }
}

const GLOB_COLS = [pack(230, 255, 140), pack(150, 230, 70), pack(70, 150, 40)]

function drawGlobs(scene: SceneState, f: Frame) {
  const t = scene.time
  for (const g of scene.wild.globs) {
    if (g.splat >= 0) {
      // a splash where it came down, spreading and fading
      if (!place(scene, g.x, g.y, g.z)) continue
      const u = (t - g.splat) / 0.6
      const r = 1 + Math.round(u * 3)
      const k = Math.round(220 * (1 - u))
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        dot(f, Math.round(pr.x + Math.cos(a) * r), Math.round(pr.y + Math.sin(a) * r * 0.6), GLOB_COLS[1], pr.v, k)
      }
      continue
    }
    // its shadow on the ground under it, then the glob, a hot middle in its green
    if (place(scene, g.x, g.y, groundAt(scene.world, g.x, g.y))) dot(f, Math.round(pr.x), Math.round(pr.y), SHADOW, pr.v, 70)
    if (!place(scene, g.x, g.y, g.z)) continue
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    const V = pr.v - 2
    dot(f, x, y, GLOB_COLS[0], V)
    dot(f, x + 1, y, GLOB_COLS[1], V)
    dot(f, x, y + 1, GLOB_COLS[1], V)
    dot(f, x + 1, y + 1, GLOB_COLS[2], V)
    dot(f, x - Math.sign(g.vx), y - Math.sign(g.vy), GLOB_COLS[2], V, 120)
  }
}

const ICHOR = CREATURES.map((k) => pack(k.ichor[0], k.ichor[1], k.ichor[2]))

function drawIchor(scene: SceneState, f: Frame) {
  const t = scene.time
  for (const b of scene.wild.ichor) {
    if (!place(scene, b.x, b.y, b.z)) continue
    const age = t - b.born
    // (in the air a bright drop; on the ground a small dark spot that fades)
    const k = b.down ? Math.round(170 * clamp(1 - (age - 0.6) / 1.8, 0, 1)) : 256
    if (k <= 0) continue
    dot(f, Math.round(pr.x), Math.round(pr.y), ICHOR[b.k], pr.v, k)
  }
}
