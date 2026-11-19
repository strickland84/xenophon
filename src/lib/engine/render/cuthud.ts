// The HUD of a cut (James, after playing: "mining needs to be vastly improved with an improved visual
// beam, showing what you're mining, a progress bar etc."), after art/mockups/mining.png: brackets
// that close on the outcrop, rock or vein in reach, with the ore's icon and name over them (a rich
// deposit and a chance of gems marked), a bar under them filling as the cut goes on, with what it
// will free at its end and what is left under it; where the rock is off the frame or under the
// cockpit's panel, the bar under the prompt instead. Then, as ore goes into the hold or the pack,
// +3 FERRITE rising over the ship or the pilot, and how full the hold is.

import { CUT } from '../data/loop'
import { RESOURCES } from '../data/resources'
import type { ResourceId } from '../data/resources'
import { ABOARD, WALKING } from '../sim/foot'
import { gemChance, leftIn, nameOf, strikeZ } from '../sim/mining'
import type { Cut } from '../sim/mining'
import { stockOf } from '../sim/traces'
import { veinLeft } from '../sim/veins'
import type { SceneState } from '../state'
import { pack } from '../util/color'
import { clamp } from '../util/math'
import { textHeight, textWidth } from './font'
import { at, easeIn, toScreen } from './hud'
import type { LoopHud } from './hud'
import { nearX, nearY, oreLight } from './mining'
import { ORE_ICONS } from './oreicons'
import { jetSize } from '../jet/jet'

const INK = pack(244, 246, 252)
const DIM = pack(172, 186, 206)
const SHADE = pack(10, 14, 28)
const GOLD = pack(255, 214, 90)
const LOW = pack(250, 150, 60)
const WHITE = pack(255, 255, 255)
const GLINT = pack(255, 250, 220)
/** each resource's colours, light, middle and dark, packed */
const ORE = new Map(Object.values(RESOURCES).map((r) => [r.id, r.colours.map((c) => pack(c[0], c[1], c[2]))]))
/** a chance of gems this high or more is marked */
const GEMS_MARKED = 0.1

/** what is in reach of the cut, as the HUD tells it */
interface Seen {
  x: number
  y: number
  z: number
  /** px across the world from its middle to its edge */
  size: number
  ore: ResourceId
  left: number
  stock: number
  rich: boolean
  gems: boolean
}
const seen: Seen = { x: 0, y: 0, z: 0, size: 0, ore: 'ferrite', left: 0, stock: 0, rich: false, gems: false }

/** the cut that matters now (the ship's laser aboard, the hand cutter on foot) and what it is on; null: nothing in reach */
function current(scene: SceneState): Cut | null {
  const foot = scene.foot
  if (foot.stage === ABOARD) {
    const m = scene.loop.mining
    const o = m.target
    if (!o || m.cut.id < 0) return null
    const space = scene.zone.kind === 'space'
    seen.x = o.x
    seen.y = o.y
    seen.z = 'r' in o ? strikeZ(o) : o.z - 2
    seen.size = 'r' in o ? (o.r as number) : 7
    seen.ore = o.ore
    seen.left = leftIn(scene, o)
    seen.stock = space ? o.stock : stockOf(scene, o.stock)
    seen.rich = o.rich
    seen.gems = gemChance(scene, o) >= GEMS_MARKED
    return m.cut
  }
  const v = foot.vein
  if (foot.stage !== WALKING || foot.prompt !== 'mine' || !v || foot.cutter.id < 0) return null
  seen.x = v.x
  seen.y = v.y
  seen.z = v.z
  seen.size = 4
  seen.ore = v.ore
  seen.left = veinLeft(scene, v)
  seen.stock = v.stock
  seen.rich = false
  seen.gems = false
  return foot.cutter
}

/** an icon at (x, y), `k` its strength, with a dark edge round it so it reads on any ground */
function icon(h: LoopHud, ore: ResourceId, x: number, y: number, big: boolean, k: number) {
  const art = ORE_ICONS[ore]
  if (!art) return
  const ic = big ? art.big : art.small
  for (let i = 0; i < ic.px.length; i++) {
    if (!ic.px[i]) continue
    const px = x + (i % ic.w)
    const py = y + Math.floor(i / ic.w)
    h.put(px + 1, py + 1, SHADE, k >> 1)
  }
  for (let i = 0; i < ic.px.length; i++) if (ic.px[i]) h.put(x + (i % ic.w), y + Math.floor(i / ic.w), ic.px[i], k)
}

/** the cut's bar: `w` wide from (x, y), `u` a font pixel; filled as far as the cut has gone, white for a moment as it frees */
function bar(h: LoopHud, scene: SceneState, c: Cut, x: number, y: number, w: number, u: number) {
  const { box } = h
  const t = scene.time
  const cols = ORE.get(c.ore)!
  const light = oreLight(c.ore)
  const tall = 2 * u + 1
  box(x - 1, y - 1, x + w + 1, y + tall + 1, SHADE, (h.k * 200) >> 8)
  const freed = t - c.doneAt < CUT.flash
  if (freed && ((t - c.doneAt) * 20) % 2 < 1.4) {
    box(x, y, x + w, y + tall, WHITE, h.k)
    return
  }
  const fill = Math.round(w * clamp(c.cut / Math.max(1, c.batch), 0, 1))
  // (ticks where each unit of the cut will be)
  for (let i = 1; i < c.batch; i++)
    box(x + Math.round((w * i) / c.batch), y, x + Math.round((w * i) / c.batch) + 1, y + tall, cols[2], h.k >> 1)
  if (fill > 0) {
    box(x, y, x + fill, y + tall, cols[1], h.k)
    box(x, y, x + fill, y + u, light, h.k)
    if (c.on) box(x + fill - 1, y, x + fill, y + tall, WHITE, h.k)
  }
}

/** the brackets, the ore's name and icon, the cut's bar and what is left; `y0` is the prompt's row (the bar goes under it when the rock is not to be seen) */
export function cutHud(scene: SceneState, h: LoopHud, y0: number) {
  // (aboard, only while he has a ship to fly; on foot, his own cutter)
  if (!h.own && scene.foot.stage === ABOARD) return
  const { put, box, text } = h
  const { w: W, h: H } = scene.screen
  const t = scene.time
  const u = textHeight() / 5
  const th = textHeight()
  const c = current(scene)
  popSide = 0
  ship.x1 = -1
  if (!c) {
    popHud(scene, h)
    return
  }
  const light = oreLight(seen.ore)
  // (where the rock is on the frame: not behind the camera, off the frame, or under the cockpit's panel)
  const art = scene.cockpitArt
  const panel = scene.view.cockpit > 0.5 && art ? art.panelTop : H
  const on = toScreen(scene, nearX(scene, seen.x), nearY(scene, seen.y), seen.z) && at.x > 8 && at.x < W - 8 && at.y > 8 && at.y < panel - 8
  if (!on) {
    popHud(scene, h)
    // the bar under the prompt
    if (!c.on) return
    const bw = 60 * u
    bar(h, scene, c, (W >> 1) - (bw >> 1), y0 + th + 6 * u, bw, u)
    return
  }
  const cx = Math.round(at.x)
  const cy = Math.round(at.y)
  // the brackets close in as it comes in reach, and breathe while it waits to be cut
  const e = easeIn(scene, c.lockAt, CUT.lock)
  const r0 = clamp(Math.round(seen.size * at.m) + 3 * u, 6 * u, 60)
  const r = r0 + Math.round((1 - e) * (1 - e) * 14 * u)
  const freed = t - c.doneAt < CUT.flash
  const col = freed ? GOLD : c.on ? INK : DIM
  const kb = c.on || freed ? h.k : Math.round(h.k * (0.65 + 0.35 * Math.sin(t * 4)))
  const L = Math.max(3 * u, Math.round(r * 0.4))
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = cx + sx * r
    const y = cy + sy * r
    // (a shadow a pixel down and right, then the line, `u` thick)
    for (const [d, cc, kk] of [
      [1, SHADE, kb >> 1],
      [0, col, kb],
    ] as [number, number, number][]) {
      box(Math.min(x, x - sx * L) + d, y + d - (sy > 0 ? u - 1 : 0), Math.max(x, x - sx * L) + 1 + d, y + d + (sy > 0 ? 1 : u), cc, kk)
      box(x + d - (sx > 0 ? u - 1 : 0), Math.min(y, y - sy * L) + d, x + d + (sx > 0 ? 1 : u), Math.max(y, y - sy * L) + 1 + d, cc, kk)
    }
  }
  // over it: the ore's icon and name, whether it is rich or may give gems, and what is left of it
  const big = u >= 2
  const iw = big ? 16 : 9
  const name = nameOf(seen.ore)
  const tags: [string, number][] = []
  if (seen.rich) tags.push(['RICH', GOLD])
  if (seen.gems) tags.push(['GEMS', GLINT])
  const leftWords = seen.left <= 0 ? 'OUT' : `${seen.left}/${seen.stock}`
  tags.push([leftWords, seen.left <= c.batch * 2 ? LOW : DIM])
  let lw = iw + 3 * u + textWidth(name)
  for (const [w] of tags) lw += 4 * u + textWidth(w)
  const lh = Math.max(iw, th)
  // under the brackets: the cut's bar, what it will free, and the label (the ship is most often over the rock on the
  // frame, and was written over); where that would cover the ship or run into the prompt, all of it beside the brackets,
  // on the side away from the ship (the +3 then rises on the other side)
  shipOnFrame(scene)
  const yieldWords = `+${c.batch}`
  const yw = 4 * u + textWidth(yieldWords)
  const tall = 2 * u + 1
  const bwBelow = Math.max(2 * r, 30 * u)
  const by = cy + r + 4 * u
  const lxBelow = clamp(cx - (lw >> 1), 2, W - 2 - lw)
  const bottom = by + tall + 4 * u + lh + u
  const below =
    bottom < Math.min(y0, panel) - 3 * u &&
    !overShip(cx - (bwBelow >> 1), by - u, cx + (bwBelow >> 1) + yw, by + tall) &&
    !overShip(lxBelow, by + tall, lxBelow + lw, bottom)
  let lx: number
  let ly: number
  let bx: number
  let barY: number
  let bw: number
  if (below) {
    bw = bwBelow
    bx = clamp(cx - (bw >> 1), 2, W - 4 - bw - yw)
    barY = by
    lx = lxBelow
    ly = by + tall + 4 * u
  } else {
    // (beside: away from the ship, or where there is room)
    const roomR = cx + r + 4 * u + lw + yw < W - 2
    const roomL = cx - r - 4 * u - lw - yw > 2
    const right = roomR && (!roomL || ship.x1 < 0 || ship.x0 + ship.x1 < 2 * cx)
    lx = right ? cx + r + 4 * u : Math.max(2, cx - r - 4 * u - lw - yw)
    ly = clamp(cy - lh, 2, Math.min(y0, panel) - lh - th - 8 * u)
    bw = lw
    bx = lx
    barY = ly + lh + 3 * u
    popSide = right ? -1 : 1
  }
  box(lx - 2 * u, ly - u, lx + lw + 2 * u, ly + lh + u, SHADE, (h.k * 150) >> 8)
  icon(h, seen.ore, lx, ly + ((lh - iw) >> 1), big, h.k)
  let x = lx + iw + 3 * u
  const ty = ly + ((lh - th) >> 1)
  text(x, ty, name, light, 1, h.k)
  x += textWidth(name)
  for (const [w, cc] of tags) {
    x += 4 * u
    // (gems: a glint that flashes before the word)
    if (w === 'GEMS' && (t * 3) % 1 < 0.5) put(x - 2 * u, ty - u, GLINT, h.k)
    text(x, ty, w, cc, 1, h.k)
    x += textWidth(w)
  }
  bar(h, scene, c, bx, barY, bw, u)
  text(bx + bw + 4 * u, barY + u - ((th - tall) >> 1), yieldWords, light, 1, h.k)
  popHud(scene, h)
}

/** where the player's ship is on the frame, roughly (x1 < 0: not on it, or he is on foot) */
const ship = { x0: 0, y0: 0, x1: -1, y1: -1 }
function shipOnFrame(scene: SceneState) {
  ship.x1 = -1
  if (scene.foot.stage !== ABOARD) return
  const j = scene.jets[0]
  if (j.away || !toScreen(scene, j.x, j.y, j.z)) return
  const half = Math.max(4, scene.mesh.model.l * 0.5 * jetSize(scene.params) * at.m)
  ship.x0 = at.x - half
  ship.x1 = at.x + half
  ship.y0 = at.y - half * 0.8
  ship.y1 = at.y + half * 0.6
}
/** true where a box on the frame would cover the ship */
const overShip = (x0: number, y0: number, x1: number, y1: number) =>
  ship.x1 >= 0 && x0 < ship.x1 && x1 > ship.x0 && y0 < ship.y1 && y1 > ship.y0

/** the side of the rock the +3 rises on: −1 left, 1 right (the label is on the other), 0 whichever is clear of the ship */
let popSide = 0

/** +3 FERRITE rising beside the rock as a cut breaks free */
function popHud(scene: SceneState, h: LoopHud) {
  const p = scene.loop.mining.pop
  if (!p) return
  const age = scene.time - p.at
  if (age < 0 || age > CUT.pop) return
  if (!toScreen(scene, nearX(scene, p.x), nearY(scene, p.y), p.z)) return
  const { w: W, h: H } = scene.screen
  // (not where the cockpit's panel hides the rock)
  const art = scene.cockpitArt
  if (scene.view.cockpit > 0.5 && art && at.y > art.panelTop - 8) return
  const u = textHeight() / 5
  const th = textHeight()
  const k = Math.round(h.k * clamp((CUT.pop - age) / 0.35, 0, 1))
  const rise = Math.round(easeIn(scene, p.at - 0.0001, 0.5) * 10 * u)
  const words = `+${p.n} ${nameOf(p.ore)}`
  const big = u >= 2
  const iw = big ? 16 : 9
  const w = iw + 3 * u + textWidth(words)
  // (to the right of the rock, clear of its brackets and its name)
  const r = clamp(Math.round((p.pack ? 4 : 7) * at.m) + 3 * u, 6 * u, 60)
  const y = clamp(Math.round(at.y) - (th >> 1) - rise, 2, H - th - 2)
  // (on the side away from the label, and off the ship where it can be)
  const ax = Math.round(at.x)
  const left = popSide < 0 || (popSide === 0 && overShip(ax + r + 4 * u, y, ax + r + 4 * u + w, y + th))
  const x = clamp(left ? ax - r - 4 * u - w : ax + r + 4 * u, 2, W - 2 - w)
  box(h, x - u, y - u, x + w + u, y + Math.max(th, iw) + u, k)
  icon(h, p.ore, x, y + ((th - iw) >> 1), big, k)
  h.text(x + iw + 3 * u, y, words, oreLight(p.ore), 1, k)
}

/** a faint plate behind words */
function box(h: LoopHud, x0: number, y0: number, x1: number, y1: number, k: number) {
  h.box(x0, y0, x1, y1, SHADE, (k * 120) >> 8)
}
