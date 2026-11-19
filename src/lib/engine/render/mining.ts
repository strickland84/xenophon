// How mining is drawn (sim/mining.ts is what happens): the ship's mining laser from its chin to the
// rock it cuts, and the hand cutter on foot from the pilot's hand to a vein, in every view. The look
// follows art/mockups/mining.png and mining-behind.png: a white-hot core in a glow of the ore's own
// colour that pulses along the beam, a blinding strike throwing out rays, the rock round it glowing
// as it heats and cooling after, a flash and a ring as a cut breaks free, and sparks, flecks of the
// ore, grit and dust flying off. All in the frame's own pixels, as light added to what is there,
// in dithered steps (never smooth gradients), and hidden behind whatever is nearer.

import { CUT } from '../data/loop'
import { VEIN } from '../data/foot'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import type { ResourceId } from '../data/resources'
import { jetSize } from '../jet/jet'
import type { Jet } from '../jet/jet'
import { ABOARD } from '../sim/foot'
import { FOOT } from '../data/foot'
import { MOTE_DUST, MOTE_F, MOTE_FLECK, MOTE_GRIT, MOTE_LIFE, MOTE_N, MOTE_SPARK } from '../sim/mining'
import type { Cut } from '../sim/mining'
import { veinNear } from '../sim/veins'
import { deltaIn } from '../sim/loop'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import type { Frame } from './frame'
import { pr, project } from './view'

const WHITE = pack(255, 255, 255)
const HOT = pack(255, 244, 196)
const YELLOW = pack(255, 214, 92)
const ORANGE = pack(255, 128, 36)
const EMBER = pack(196, 48, 20)
const GRIT = [pack(46, 38, 36), pack(84, 70, 60)]
const DUST = pack(214, 196, 166)
const RIM = pack(24, 20, 26)

/** each ore's three colours, packed, and the light of its glow: its most saturated colour brought up to full brightness */
const ORE_COLS = RESOURCE_IDS.map((id) => RESOURCES[id].colours.map((c) => pack(c[0], c[1], c[2])))
const GLOW = RESOURCE_IDS.map((id) => {
  const sat = (c: number[]) => (Math.max(...c) - Math.min(...c)) / Math.max(1, Math.max(...c))
  const c = [...RESOURCES[id].colours].sort((a, b) => sat(b) - sat(a))[0]
  const k = 255 / Math.max(1, ...c)
  return [c[0] * k, c[1] * k, c[2] * k]
})
const oreIndex = (ore: ResourceId) => Math.max(0, RESOURCE_IDS.indexOf(ore))
const LIGHTS = GLOW.map((c) => pack(c[0], c[1], c[2]))
/** an ore's light, packed: its glow's colour (for the HUD's words of it) */
export const oreLight = (ore: ResourceId) => LIGHTS[oreIndex(ore)]

/** light of colour (r, g, b) added to a pixel, `k` parts in 256 */
function addLight(fb: Uint32Array, at: number, r: number, g: number, b: number, k: number) {
  const c = fb[at]
  const cr = Math.min(255, (c & 255) + ((r * k) >> 8))
  const cg = Math.min(255, ((c >> 8) & 255) + ((g * k) >> 8))
  const cb = Math.min(255, ((c >> 16) & 255) + ((b * k) >> 8))
  fb[at] = ((255 << 24) | (cb << 16) | (cg << 8) | cr) >>> 0
}

/** a level 0..1 as one of four steps, chosen by the dither at a pixel (so a glow falls off in dithered bands) */
function stepped(level: number, x: number, y: number) {
  const q = clamp(level, 0, 1) * 3
  const lo = Math.floor(q)
  return (lo + (q - lo) * 16 > lo + BAYER[((y & 3) << 2) | (x & 3)] ? lo + 1 : lo) / 3
}

// scratch for the ends of a beam on the frame
const A = { x: 0, y: 0, m: 0, v: 0 }
const B = { x: 0, y: 0, m: 0, v: 0 }

/**
 * A beam on the frame from A to B (B already where the beam has reached), `thick` its half width at each end in frame
 * px over the scale there, in the glow of ore `oi`, pulsing along its length; hidden where the world is nearer.
 */
function beamOn(f: Frame, t: number, oi: number, thick: number, seed: number) {
  const { w: W, fb, zbuf } = f
  const [gr, gg, gb] = GLOW[oi]
  const ra = clamp(thick * A.m, 0.7, 4)
  const rb = clamp(thick * B.m, 0.7, 4)
  const outer = Math.max(ra, rb) * 2.6 + 1.5
  const dx = B.x - A.x
  const dy = B.y - A.y
  const len2 = dx * dx + dy * dy
  const len = Math.sqrt(len2)
  const x0 = Math.max(f.colLo, Math.floor(Math.min(A.x, B.x) - outer))
  const x1 = Math.min(f.colHi - 1, Math.ceil(Math.max(A.x, B.x) + outer))
  const y0 = Math.max(f.rowLo, Math.floor(Math.min(A.y, B.y) - outer))
  const y1 = Math.min(f.rowHi - 1, Math.ceil(Math.max(A.y, B.y) + outer))
  // (it flickers a little as a whole, and a pulse runs down it to the rock)
  const flick = 0.85 + (hash8(((t * 30) | 0) + seed * 7) & 31) / 160
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5 - A.x
      const py = y + 0.5 - A.y
      const s = len2 > 0 ? clamp((px * dx + py * dy) / len2, 0, 1) : 0
      const ex = px - s * dx
      const ey = py - s * dy
      const d = Math.sqrt(ex * ex + ey * ey)
      const wave = 1 + 0.28 * Math.sin(s * len * 0.42 - t * 26)
      const r = (ra + (rb - ra) * s) * wave * flick
      const g = r * 2.6 + 1.5
      if (d > g) continue
      const at = y * W + x
      // (behind the world where the world is nearer than the beam is there)
      if (zbuf[at] < A.v + (B.v - A.v) * s - 2) continue
      if (d <= r * 0.42) fb[at] = WHITE
      else if (d <= r) {
        const k = stepped(1 - (d - r * 0.42) / (r * 0.58), x, y)
        fb[at] = blend(pack(gr, gg, gb), WHITE, Math.round(110 + 146 * k))
      } else {
        const k = stepped(1 - (d - r) / (g - r), x, y)
        if (k > 0) addLight(fb, at, gr, gg, gb, Math.round(k * 190))
      }
    }
}

/** a dithered disc of added light round (cx, cy): `rad` frame px, brightest `k` (0..256) in the middle, coloured by `col(level)` */
function bloom(f: Frame, cx: number, cy: number, rad: number, V: number, k: number, rgb: number[], hot = false) {
  const { w: W, fb, zbuf } = f
  const ir = Math.ceil(rad)
  for (let y = Math.max(f.rowLo, Math.floor(cy) - ir); y <= Math.min(f.rowHi - 1, Math.floor(cy) + ir); y++)
    for (let x = Math.max(f.colLo, Math.floor(cx) - ir); x <= Math.min(f.colHi - 1, Math.floor(cx) + ir); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / rad
      if (d >= 1) continue
      const at = y * W + x
      if (zbuf[at] < V - 3) continue
      const lv = stepped(1 - d, x, y)
      if (lv <= 0) continue
      if (hot && lv >= 1) fb[at] = blend(fb[at], HOT, Math.min(256, k))
      else addLight(fb, at, rgb[0], rgb[1], rgb[2], Math.round(k * lv))
    }
}

/** the rock heating where the beam strikes it: a dithered glow from yellow at the strike through orange to a dull red */
function heatGlow(f: Frame, cx: number, cy: number, m: number, heat: number, V: number) {
  if (heat < 0.04) return
  const { w: W, fb, zbuf } = f
  const rad = clamp((2.5 + 4.5 * heat) * m, 2, 18)
  const ir = Math.ceil(rad)
  for (let y = Math.max(f.rowLo, Math.floor(cy) - ir); y <= Math.min(f.rowHi - 1, Math.floor(cy) + ir); y++)
    for (let x = Math.max(f.colLo, Math.floor(cx) - ir); x <= Math.min(f.colHi - 1, Math.floor(cx) + ir); x++) {
      // (a little flatter than round: it lies on the rock)
      const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.3) / rad
      if (d >= 1) continue
      const at = y * W + x
      if (zbuf[at] < V - 3) continue
      const lv = stepped((1 - d) * heat, x, y)
      if (lv <= 0) continue
      const col = lv >= 1 ? YELLOW : lv >= 0.66 ? ORANGE : EMBER
      fb[at] = blend(fb[at], col, lv >= 0.66 ? 200 : 120)
    }
}

/** one pixel, `s` square, where nothing nearer is in front */
function dot(f: Frame, x: number, y: number, s: number, col: number, V: number) {
  const { w: W, fb, zbuf } = f
  for (let yy = y; yy < y + s; yy++) {
    if (yy < f.rowLo || yy >= f.rowHi) continue
    for (let xx = x; xx < x + s; xx++) {
      if (xx < f.colLo || xx >= f.colHi) continue
      const at = yy * W + xx
      if (zbuf[at] >= V - 2) fb[at] = col
    }
  }
}

/** a point's x (or y) as its copy nearest the camera: the world wraps, and the camera may be over another copy of it */
export const nearX = (scene: SceneState, x: number) => scene.view.x + deltaIn(scene, x - scene.view.x)
export const nearY = (scene: SceneState, y: number) => scene.view.y + deltaIn(scene, y - scene.view.y)

/** where the beam strikes now: the rock's point, wandering a little over its face as the beam works */
function strike(scene: SceneState, c: Cut, t: number, wander: number, out: { x: number; y: number; z: number }) {
  out.x = nearX(scene, c.x) + Math.sin(t * 3.1) * wander
  out.y = nearY(scene, c.y) + Math.cos(t * 2.3) * wander
  out.z = c.z
  return out
}
const hit = { x: 0, y: 0, z: 0 }

/**
 * A beam from (ax, ay, az) to the cut's strike, with its heat, its strike and the flash of a cut freed; `thick` its
 * half width in world px, `own` the player's (he sees it reach, and its heat), `seed` for its flicker.
 */
function drawBeam(scene: SceneState, f: Frame, ax: number, ay: number, az: number, c: Cut, thick: number, wander: number, seed: number) {
  const t = scene.time
  const view = scene.view
  const oi = oreIndex(c.ore)
  strike(scene, c, t, wander, hit)
  if (!project(view, hit.x, hit.y, hit.z)) return
  Object.assign(B, pr)
  heatGlow(f, B.x, B.y, B.m, c.heat, B.v)
  if (c.on) {
    if (!project(view, nearX(scene, ax), nearY(scene, ay), az)) return
    Object.assign(A, pr)
    // (it reaches out from the mount as it comes on)
    const u = clamp(c.beamT / CUT.reach, 0, 1)
    B.x = A.x + (B.x - A.x) * u
    B.y = A.y + (B.y - A.y) * u
    B.v = A.v + (B.v - A.v) * u
    B.m = A.m + (B.m - A.m) * u
    beamOn(f, t, oi, thick, seed)
    // the mount glows
    bloom(f, A.x, A.y, clamp(2.2 * A.m * thick + 1, 2, 6), A.v, 200, GLOW[oi], true)
    if (u >= 1) {
      // the strike: a white-hot point in a bloom of the ore's light, throwing short rays that flicker
      const fl = hash8(((t * 40) | 0) + seed * 13)
      const core = clamp(B.m * thick * (1.6 + (fl & 1) * 0.5), 1.2, 5)
      bloom(f, B.x, B.y, core * 3.2, B.v, 220, GLOW[oi])
      bloom(f, B.x, B.y, core * 1.6, B.v, 256, [255, 230, 150], true)
      const rays = 4 + (fl & 3)
      for (let i = 0; i < rays; i++) {
        const a = (hash8(fl + i * 31) / 256) * Math.PI * 2
        const l = core * (2 + (hash8(fl + i * 57) / 256) * 2.5)
        for (let k = Math.ceil(core); k < l; k++)
          dot(f, Math.round(B.x + Math.cos(a) * k), Math.round(B.y + Math.sin(a) * k * 0.8), 1, k < l * 0.5 ? WHITE : YELLOW, B.v)
      }
      dot(f, Math.round(B.x), Math.round(B.y), 1, WHITE, B.v - 4)
    }
  }
  // a cut broken free: a white flash, then a ring of the ore's light running out and thinning
  const age = (t - c.doneAt) / CUT.flash
  if (age >= 0 && age < 1 && project(view, nearX(scene, c.x), nearY(scene, c.y), c.z)) {
    const m = clamp(pr.m, 0.6, 4)
    if (age < 0.25) bloom(f, pr.x, pr.y, (4 + 6 * age) * m, pr.v, 256, [255, 255, 255], true)
    const rr = (3 + 11 * age) * m
    const { w: W, fb, zbuf } = f
    const n = Math.ceil(rr * 6)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = Math.round(pr.x + Math.cos(a) * rr)
      const y = Math.round(pr.y + Math.sin(a) * rr * 0.75)
      if (x < f.colLo || y < f.rowLo || x >= f.colHi || y >= f.rowHi) continue
      // (it thins as it goes: dithered away)
      if ((1 - age) * 16 <= BAYER[((y & 3) << 2) | (x & 3)]) continue
      const at = y * W + x
      if (zbuf[at] < pr.v - 3) continue
      addLight(fb, at, GLOW[oi][0], GLOW[oi][1], GLOW[oi][2], 230)
    }
  }
}

/** the ship's laser's mount: under its nose, its chin */
function chin(scene: SceneState, j: Jet, length: number, out: { x: number; y: number; z: number }) {
  const nose = length * 0.32 * jetSize(scene.params)
  out.x = j.x + Math.sin(j.yaw) * nose
  out.y = j.y - Math.cos(j.yaw) * nose
  out.z = j.z - 1
  return out
}
const mount = { x: 0, y: 0, z: 0 }

/** a cut of another pilot's, shown as his beam alone (his game keeps its own heat and flashes) */
const theirs: Cut = {
  id: 0,
  last: 0,
  seenAt: 0,
  lockAt: 0,
  on: true,
  beamT: 1,
  cut: 0,
  batch: 1,
  heat: 0.5,
  x: 0,
  y: 0,
  z: 0,
  ore: 'ferrite',
  doneAt: -99,
  doneN: 0,
}

/** what another pilot's laser is on: an outcrop of the world, or a rock in space, by its id */
function outcropOf(scene: SceneState, id: number) {
  return scene.zone.kind === 'space' ? (scene.space.rocks.find((r) => r.id === id) ?? null) : (scene.world.features.outcrops[id] ?? null)
}

/** the lasers and cutters at work, then what flies off them */
export function drawMining(scene: SceneState, f: Frame) {
  const m = scene.loop.mining
  const lead = scene.jets[0]
  // the player's laser (its heat and its last flash stay on the rock a moment after it stops)
  if (m.cut.id >= 0 || m.cut.heat > 0.04 || scene.time - m.cut.doneAt < CUT.flash) {
    chin(scene, lead, scene.mesh.model.l, mount)
    if (!lead.away || !m.cut.on) drawBeam(scene, f, mount.x, mount.y, mount.z, m.cut, 1.3, 1.6, 0)
  }
  // others' lasers
  for (const s of scene.ships) {
    if (s.mining < 0 || s.out) continue
    const o = outcropOf(scene, s.mining)
    if (!o) continue
    Object.assign(theirs, { x: o.x, y: o.y, z: o.z, ore: o.ore, heat: 0.6 })
    chin(scene, s.jet, s.mesh.model.l, mount)
    drawBeam(scene, f, mount.x, mount.y, mount.z, theirs, 1.3, 1.6, s.id)
  }
  // the hand cutter: a short thin beam from his hand
  const foot = scene.foot
  const c = foot.cutter
  if (foot.stage !== ABOARD && (c.id >= 0 || c.heat > 0.04 || scene.time - c.doneAt < CUT.flash)) {
    const j = foot.walker.jet
    const a = Math.atan2(c.x - j.x, -(c.y - j.y))
    drawBeam(scene, f, j.x + Math.sin(a) * 1.5, j.y - Math.cos(a) * 1.5, j.z - FOOT.chest * 0.4, c, 0.38, 0.6, 1)
  }
  for (const w of scene.walkers) {
    if (!w.mining) continue
    const v = veinNear(scene, w.jet.x, w.jet.y, VEIN.reach + 3)
    if (!v) continue
    Object.assign(theirs, { x: v.x, y: v.y, z: v.z + 1, ore: v.ore, heat: 0.4 })
    const a = Math.atan2(v.x - w.jet.x, -(v.y - w.jet.y))
    drawBeam(scene, f, w.jet.x + Math.sin(a) * 1.5, w.jet.y - Math.cos(a) * 1.5, w.jet.z - FOOT.chest * 0.4, theirs, 0.38, 0.6, w.id)
  }
  drawMotes(scene, f)
}

/** sparks (hot, cooling as they fly), flecks of the ore, grit and dust */
function drawMotes(scene: SceneState, f: Frame) {
  const { motes } = scene.loop.mining
  const view = scene.view
  const t = scene.time
  for (let i = 0; i < MOTE_N; i++) {
    const o = i * MOTE_F
    const kind = motes[o + 7]
    const age = t - motes[o + 6]
    const life = MOTE_LIFE[kind]
    if (age < 0 || age > life) continue
    if (!project(view, nearX(scene, motes[o]), nearY(scene, motes[o + 1]), motes[o + 2])) continue
    const u = age / life
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    const s = pr.m > 2.6 ? 2 : 1
    const oi = motes[o + 8] | 0
    if (kind === MOTE_SPARK) {
      const col = u < 0.2 ? WHITE : u < 0.45 ? YELLOW : u < 0.75 ? pack(GLOW[oi][0], GLOW[oi][1], GLOW[oi][2]) : ORANGE
      dot(f, x, y, s, col, pr.v)
      // (a streak behind it while it is fast and young)
      if (u < 0.4) {
        const bx = nearX(scene, motes[o]) - motes[o + 3] * 0.025
        const by = nearY(scene, motes[o + 1]) - motes[o + 4] * 0.025
        const bz = motes[o + 2] - motes[o + 5] * 0.025
        if (project(view, bx, by, bz)) dot(f, Math.round(pr.x), Math.round(pr.y), 1, YELLOW, pr.v)
      }
    } else if (kind === MOTE_FLECK || kind === MOTE_GRIT) {
      // (in its last moments it blinks out)
      if (u > 0.8 && ((t * 10) | 0) % 2 === 0) continue
      const cols = kind === MOTE_FLECK ? ORE_COLS[oi] : GRIT
      // (a dark rim under it where it is large enough to show one)
      if (s > 1) dot(f, x - 1, y + 1, s, RIM, pr.v)
      dot(f, x, y, s, cols[(i & 1) === 0 ? 0 : 1], pr.v)
    } else if (kind === MOTE_DUST) {
      // a puff that grows and thins, dithered
      const rad = (1 + u * 3) * clamp(pr.m, 0.6, 3)
      const ir = Math.ceil(rad)
      for (let yy = -ir; yy <= ir; yy++)
        for (let xx = -ir; xx <= ir; xx++) {
          if (xx * xx + yy * yy > rad * rad) continue
          const px = x + xx
          const py = y + yy
          if (px < f.colLo || py < f.rowLo || px >= f.colHi || py >= f.rowHi) continue
          if ((1 - u) * 9 <= BAYER[((py & 3) << 2) | (px & 3)]) continue
          const at = py * f.w + px
          if (f.zbuf[at] < pr.v - 2) continue
          f.fb[at] = blend(f.fb[at], DUST, 120)
        }
    }
  }
}
