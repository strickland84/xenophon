// How the loop is drawn (sim/loop.ts and its parts are what happens): chunks of ore lying
// where they fell and flying up into a hold, crates spilled from lost ships (the mining laser
// is render/mining.ts), the bases' turret guns turning to their targets, and the
// flags on their masts. The bases and the ore themselves are ground (world/features.ts): the
// world draws them. All in the frame's own pixels, behind the same hills as a ship. The look
// follows art/mockups/mining.png and crate.png; the crate's sprite is the image model's.

import { CHUNK, CRATE } from '../data/loop'
import { RESOURCES } from '../data/resources'
import { jetSize } from '../jet/jet'
import type { SceneState } from '../state'
import { blend, pack } from '../util/color'
import { CRATE_SPRITE } from '../world/prefabs'
import type { Frame } from './frame'
import { thread } from './shapes'
import { pr, project } from './view'
import { groundHaze, inHaze } from './world'
import { ownerOf } from '../sim/traces'
import { nearX, nearY } from './mining'

/** each resource's three colours (light, middle, dark), packed */
const ORE_COLS = new Map(Object.values(RESOURCES).map((r) => [r.id, r.colours.map((c) => pack(c[0], c[1], c[2]))]))
const WHITE = pack(255, 255, 255)
const GLINT = pack(255, 250, 220)
/** round a chunk's lump: its dark rim */
const RIM_COL = pack(24, 20, 26)
const RIM = [
  [-1, -1],
  [1, -1],
  [-2, 0],
  [2, 0],
  [-1, 1],
  [1, 1],
  [0, 2],
  [0, -2],
]
const BARREL = pack(66, 70, 80)
const BARREL_LIT = pack(150, 156, 168)
const BEACON = pack(90, 255, 120)
const WAIT = pack(255, 176, 40)
const SIDE_FLAG: Record<string, number> = { nomarchy: pack(242, 193, 78), anarchoi: pack(164, 108, 240) }
const NEUTRAL_FLAG = pack(236, 120, 44)

// the crate's sprite, packed
const CRATE_PX = (() => {
  const { w, h, rgba } = CRATE_SPRITE
  const px = new Uint32Array(w * h)
  for (let i = 0; i < w * h; i++) px[i] = rgba[i * 4 + 3] > 0 ? pack(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) : 0
  return { w, h, px }
})()

/** a crate far off: the middle colour of its picture */
const CRATE_FAR = (() => {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (const c of CRATE_PX.px)
    if (c) {
      r += c & 255
      g += (c >> 8) & 255
      b += (c >> 16) & 255
      n++
    }
  return pack(r / Math.max(1, n), g / Math.max(1, n), b / Math.max(1, n))
})()

/** a colour gone `k` (0..1) of the way into the haze */
const hazed = (col: number, haze: number, k: number) => (k <= 0 ? col : blend(col, haze, Math.round(k * 256)))

/** one pixel, square `s` frame pixels, if nothing nearer is in front of it */
function dot(f: Frame, x: number, y: number, s: number, col: number, V: number) {
  const { w: W, h: H, fb, zbuf } = f
  for (let yy = y; yy < y + s; yy++) {
    if (yy < 0 || yy >= H) continue
    for (let xx = x; xx < x + s; xx++) {
      if (xx < 0 || xx >= W) continue
      const at = yy * W + xx
      if (zbuf[at] >= V - 1) fb[at] = col
    }
  }
}

export function drawLoot(scene: SceneState, f: Frame) {
  const { view, loop } = scene
  const features = scene.world.features
  if (features.bases.length === 0 && loop.chunks.length === 0 && loop.crates.length === 0) return
  const t = scene.time
  const ground = scene.zone.kind === 'surface'
  // chunks: a little lump of the ore's colours, with a glint now and then
  for (let i = 0; i < loop.chunks.length; i++) {
    const c = loop.chunks[i]
    // (the copy of it nearest the camera: the world wraps)
    if (!project(view, nearX(scene, c.x), nearY(scene, c.y), c.z + 1)) continue
    const cols = ORE_COLS.get(c.ore)!
    // (far off: gone into the haze with the ground; a way off, a speck of its colour, not a lump as large as one close to)
    const hz = ground ? groundHaze(view, pr.v) : 0
    if (hz > 0.7) continue
    if (pr.m < 0.6) {
      if (pr.m > 0.18) dot(f, Math.round(pr.x), Math.round(pr.y), 1, hazed(cols[1], scene.pal.haze, hz), pr.v)
      continue
    }
    const s = Math.max(1, Math.round(pr.m))
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    // (its last seconds, it blinks before it is gone)
    const age = t - c.born
    const gem = c.units > 1
    if (age > (gem ? CHUNK.gem.life - 4 : 70) && ((t * 6) | 0) % 2 === 0) continue
    if (gem) {
      // a gem: a larger crystal of the ore's light colours, a white core and rays that flash, so it is seen and chased
      for (const [dx, dy] of RIM) dot(f, x + dx * s * 1.5, y + dy * s * 1.5, s, RIM_COL, pr.v)
      dot(f, x, y - s, s, cols[0], pr.v)
      dot(f, x - s, y, s, cols[0], pr.v)
      dot(f, x + s, y, s, cols[1], pr.v)
      dot(f, x, y + s, s, cols[1], pr.v)
      dot(f, x, y, s, WHITE, pr.v)
      if ((t * 4 + i * 0.37) % 1 < 0.5) {
        dot(f, x, y - s * 3, s, GLINT, pr.v - 1)
        dot(f, x, y + s * 3, s, GLINT, pr.v - 1)
        dot(f, x - s * 3, y, s, GLINT, pr.v - 1)
        dot(f, x + s * 3, y, s, GLINT, pr.v - 1)
      }
      continue
    }
    // a dark rim so it reads on any ground, then the lump: light on top, dark below
    for (const [dx, dy] of RIM) dot(f, x + dx * s, y + dy * s, s, RIM_COL, pr.v)
    dot(f, x, y, s, cols[1], pr.v)
    dot(f, x - s, y, s, cols[1], pr.v)
    dot(f, x + s, y, s, cols[2], pr.v)
    dot(f, x, y + s, s, cols[2], pr.v)
    dot(f, x, y - s, s, cols[0], pr.v)
    if ((t * 3 + i * 0.37) % 1 < 0.14) dot(f, x, y - s, s, GLINT, pr.v)
  }
  // crates: the image model's sprite, with a beacon blinking on top
  for (const c of loop.crates) {
    if (!project(view, c.x, c.y, c.z + 2)) continue
    // (far off: into the haze with the ground, or a few px of its colour with its beacon; never its whole picture, as large
    // as one close to: from the seat a crate a long way off was a brown block that size standing in the sky)
    const hz = ground ? groundHaze(view, pr.v) : 0
    if (hz > 0.7) continue
    if (pr.m < 0.6) {
      if (pr.m > 0.12) {
        const px = Math.round(pr.x)
        const py = Math.round(pr.y)
        if (pr.m > 0.3) dot(f, px - 1, py - 1, 2, hazed(CRATE_FAR, scene.pal.haze, hz), pr.v)
        if (((t * 2.5) | 0) % 2 === 0) dot(f, px, py - 2, 1, c.own && t - c.born < CRATE.ownWait ? WAIT : BEACON, pr.v)
      }
      continue
    }
    const s = Math.max(1, Math.round(pr.m))
    const x0 = Math.round(pr.x - (CRATE_PX.w * s) / 2)
    const y0 = Math.round(pr.y - CRATE_PX.h * s)
    for (let y = 0; y < CRATE_PX.h; y++)
      for (let x = 0; x < CRATE_PX.w; x++) {
        const col = CRATE_PX.px[y * CRATE_PX.w + x]
        if (col) dot(f, x0 + x * s, y0 + y * s, s, inHaze(col, scene.pal.haze, hz), pr.v)
      }
    // (amber while it is not yet the player's to take back)
    if (((t * 2.5) | 0) % 2 === 0) dot(f, Math.round(pr.x), y0 - s, s, c.own && t - c.born < CRATE.ownWait ? WAIT : BEACON, pr.v)
  }
  // the turrets' guns, turned to their targets
  const sc = jetSize(scene.params)
  for (const tu of loop.turrets) {
    // (a station's turret is drawn whole, its barrels and all, with the station: render/space.ts)
    if (tu.station !== undefined) continue
    const j = tu.f.jet
    if (!project(view, j.x, j.y, j.z)) continue
    const ax = pr.x
    const ay = pr.y
    const V = pr.v - 1
    if (!project(view, j.x + Math.sin(tu.yaw) * 5 * sc, j.y - Math.cos(tu.yaw) * 5 * sc, j.z + 1)) continue
    thread(f, ax, ay, pr.x, pr.y, BARREL, V, 256)
    thread(f, ax, ay - 1, pr.x, pr.y - 1, BARREL_LIT, V, 160)
  }
  // flags on the masts, in their side's colour (nobody's: orange), flapping
  for (const b of features.bases) {
    if (!project(view, b.mast.x, b.mast.y, b.mast.z)) continue
    const hz = ground ? groundHaze(view, pr.v) : 0
    if (hz > 0.7) continue
    // (a base not a capital flies its world's holder's flag: sim/traces.ts)
    const owner = ownerOf(scene, b)
    const col = inHaze(owner ? SIDE_FLAG[owner] : NEUTRAL_FLAG, scene.pal.haze, hz)
    const s = Math.max(1, Math.round(pr.m))
    const x0 = Math.round(pr.x) + s
    const y0 = Math.round(pr.y)
    for (let i = 0; i < 4; i++) {
      const wave = Math.round(Math.sin(t * 6 + i * 1.1) * 0.6)
      for (let k = 0; k < 3 - (i === 3 ? 1 : 0); k++)
        dot(f, x0 + i * s, y0 + (k + wave) * s, s, k === 0 ? blend(col, inHaze(WHITE, scene.pal.haze, hz), 60) : col, pr.v - 1)
    }
  }
}
