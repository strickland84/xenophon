// The HUD on foot (the plan's section 16, "On-foot HUD"): health, the backpack, flares, what Use
// would do, which way his ship is (or how long until a called one comes), and where the sidearm
// aims. Drawn by drawHud in the frame's own pixels, as the flight HUD is, in its places: the
// health where the hull was, the backpack where the hold was.

import { FLARE, REDELIVER, RESPAWN } from '../data/foot'
import { CUT } from '../data/loop'
import { RESOURCES } from '../data/resources'
import { BOARDING, DEAD, FALLING, SHIP_COMING, SHIP_PARKED, WALKING } from '../sim/foot'
import { nearestBase, wrapDelta } from '../sim/loop'
import { nameOf } from '../sim/mining'
import type { SceneState } from '../state'
import { pack } from '../util/color'
import { clamp } from '../util/math'
import { textHeight, textWidth } from './font'
import { clearWidth, fitLines, promptLine, promptWidth } from './hud'
import type { LoopHud, PromptPart } from './hud'
import { ORE_ICONS } from './oreicons'
import { pr, project } from './view'
import { groundAt } from '../world/world'
import { CAPTURE } from '../data/territory'

const INK = pack(244, 246, 252)
const DIM = pack(172, 186, 206)
const SHADE = pack(10, 14, 28)
const OK = pack(112, 226, 124)
const LOW = pack(250, 210, 70)
const BAD = pack(250, 76, 60)
const GOLD = pack(255, 214, 90)
const FOE = pack(255, 84, 70)
const LEAF = pack(120, 210, 110)
const AIM = pack(150, 240, 255)
const SHIP = pack(140, 210, 255)
const EDGE = 4
/** slots of the backpack in a row of the HUD's, over the health bar */
const PACK_ROW = 4

/** each resource's colours, light, middle and dark, packed */
const ORE = new Map(Object.values(RESOURCES).map((r) => [r.id, r.colours.map((c) => pack(c[0], c[1], c[2]))]))

const PROMPTS: Record<string, PromptPart[]> = {
  board: [{ words: 'CLIMB IN', hold: false, col: INK }],
  steal: [{ words: 'STEAL IT', hold: false, col: FOE }],
  mine: [{ words: 'CUT THE VEIN', hold: true, col: INK }],
  call: [{ words: 'CALL A SHIP', hold: true, col: GOLD }],
  // (his own ship, parked far off: offered quietly, as he may mean to walk back)
  recall: [{ words: 'CALL YOUR SHIP', hold: true, col: DIM }],
  flag: [{ words: 'PLANT A FLAG', hold: true, col: GOLD }],
  salvage: [{ words: 'SALVAGE THE WRECK', hold: false, col: INK }],
}

export function footHud(scene: SceneState, h: LoopHud) {
  const { put, box, text, k, top, barsY, blink } = h
  const { w: W, h: H } = scene.screen
  const foot = scene.foot
  const w = foot.walker
  const j = w.jet
  const midX = W >> 1

  // where the backpack is drawn (the prompt keeps clear of it)
  let packRight = 0
  let packTop = H
  // ── health: where the hull's bar is in flight, in pips that go amber and then red
  if (foot.stage === WALKING || foot.stage === BOARDING || foot.stage === FALLING) {
    const barW = clamp(Math.round(W * 0.11), 30, 56)
    const hy = barsY + 3
    const left = clamp(w.fighter.hull / w.fighter.stats.hull, 0, 1)
    box(EDGE - 1, hy - 1, EDGE + barW + 1, hy + 3, SHADE, k >> 1)
    const hw = Math.round(barW * left)
    const hc = left > 0.6 ? OK : left > 0.3 ? LOW : BAD
    if (left > 0.3 || blink) for (let x = 0; x < hw; x++) if (x % 3 !== 2) box(EDGE + x, hy, EDGE + x + 1, hy + 2, hc)
    // what he is: hidden under the trees, in the water
    if (scene.foot.exposed) text(EDGE + barW + 4, hy - 1, scene.foot.exposed === 'heat' ? 'TOO HOT' : 'FREEZING', blink ? BAD : DIM)
    else if (w.hidden) text(EDGE + barW + 4, hy - 1, 'HIDDEN', LEAF)
    else if (w.wading) text(EDGE + barW + 4, hy - 1, 'WADING', DIM, 1, k >> 1)
    // the backpack: a well a slot, each with what is in it as its own icon (the one the hold's screen shows) and a line
    // along its floor for how full, as the hold's in flight (James: the pack still had "the old style crappy icons").
    // Four to a row, rows stacked away from the bar: on foot the art pixels are twice the size
    const slots = foot.pack.slots
    const rows = Math.ceil(slots.length / PACK_ROW)
    const cy0 = top ? barsY + 8 : barsY - 14 - (rows - 1) * 13
    for (const [i, s] of slots.entries()) {
      const x = EDGE + (i % PACK_ROW) * 12
      const cy = cy0 + Math.floor(i / PACK_ROW) * 13
      box(x - 1, cy - 1, x + 10, cy + 11, SHADE, (k * 220) >> 8)
      box(x, cy + 10, x + 9, cy + 11, DIM, k >> 2)
      if (s) {
        const cols = ORE.get(s.id)!
        const icon = ORE_ICONS[s.id]?.small
        if (icon) {
          for (let q = 0; q < icon.px.length; q++) if (icon.px[q]) put(x + (q % icon.w), cy + Math.floor(q / icon.w), icon.px[q])
        } else box(x + 2, cy + 2, x + 7, cy + 7, cols[1])
        const fill = Math.max(1, Math.round((9 * s.n) / RESOURCES[s.id].stack))
        box(x, cy + 10, x + fill, cy + 11, cols[0])
      }
    }
    packRight = EDGE + Math.min(slots.length, PACK_ROW) * 12
    packTop = top ? H : cy0 - 1
    // (how full it is, while he cuts and a moment after)
    const pop = scene.loop.mining.pop
    if (w.mining || (pop && pop.pack && scene.time - pop.at < CUT.told)) {
      let n = 0
      let most = 0
      for (const s of slots) {
        most += RESOURCES[s?.id ?? 'ferrite'].stack
        if (s) n += s.n
      }
      // (over the slots, or under them kept to the top: written beside them, it ran into the prompt)
      const ly = top ? cy0 + rows * 13 + 1 : cy0 - textHeight() - 3
      text(EDGE, ly, `PACK ${n}/${most}`, n >= most ? LOW : DIM, 1, k)
      if (!top) packTop = ly - 1
    }
    // flares: a pip each, bottom right (or under the radar)
    const fy = top ? EDGE + 44 : H - EDGE - 6
    for (let i = 0; i < FLARE.count; i++) {
      const fx = W - EDGE - 3 - i * 5
      const lit = i < foot.flares
      box(fx, fy, fx + 2, fy + 4, lit ? GOLD : SHADE)
      put(fx, fy - 1, lit ? INK : SHADE)
    }
  }

  // ── what Use would do, under the middle
  const prompt =
    foot.stage === WALKING && foot.prompt === 'mine' && foot.vein
      ? [{ words: `CUT ${nameOf(foot.vein.ore)}`, hold: true, col: INK, key: scene.params.mineKey || 'R' }]
      : PROMPTS[foot.stage === WALKING ? foot.prompt : '']
  if (prompt) {
    // (lifted over the backpack where it is wide enough to reach it, if there is room for it low on the screen still)
    const reach = (W - promptWidth(scene, prompt)) / 2 < packRight + 4
    const over = packTop - textHeight() - 6
    const y0 = top ? Math.round(H * 0.78) : reach && over >= H * 0.6 ? Math.min(H - EDGE - 24, over) : H - EDGE - 24
    const at = promptLine(scene, h, prompt, y0)
    // calling a ship, or planting a flag: how long it has been held
    const held =
      foot.prompt === 'call' || foot.prompt === 'recall'
        ? foot.useHeld / REDELIVER.hold
        : foot.prompt === 'flag'
          ? scene.traces.planting / CAPTURE.plantTime
          : 0
    if (held > 0) box(at.x - 1, at.below, at.x - 1 + Math.round((at.w + 2) * Math.min(1, held)), at.below + 1, GOLD, k)
  } else if (foot.stage === WALKING && foot.prompt === 'front') {
    // (at the capture site of a world his side cannot reach yet)
    const y0 = top ? Math.round(H * 0.78) : H - EDGE - 24
    // (broken into lines where the frame is too narrow for it)
    const lines = fitLines('OFF YOUR FRONT: A FLAG HERE WOULD NOT COUNT', clearWidth(scene))
    for (const [i, line] of lines.entries())
      text(midX - (textWidth(line) >> 1), y0 - (lines.length - 1 - i) * (textHeight() + 3), line, DIM, 1, k)
  }

  // ── his ship: on its way (how long), or standing where he left it (which way, how far, if it is off the frame)
  if (foot.ship === SHIP_COMING) {
    const line = `SHIP IN ${Math.ceil(Math.max(0, foot.callT))}`
    text(midX - (textWidth(line) >> 1), EDGE + 11, line, GOLD)
  } else if (foot.ship === SHIP_PARKED && foot.stage === WALKING) {
    const s = scene.jets[0]
    const dx = wrapDelta(s.x - j.x)
    const dy = wrapDelta(s.y - j.y)
    const d = Math.hypot(dx, dy)
    if (project(scene.view, j.x + dx, j.y + dy, s.z)) {
      const inFrame = pr.x >= 2 && pr.y >= 2 && pr.x < W - 2 && pr.y < H - 2
      if (!inFrame) {
        // a little arrow at the edge, with the distance
        const cx = W / 2
        const cy = H / 2
        let ax = pr.x - cx
        let ay = pr.y - cy
        const n = Math.hypot(ax, ay) || 1
        ax /= n
        ay /= n
        const ix = W / 2 - EDGE - 3
        const iy = H / 2 - EDGE - 3
        const sc = Math.min(Math.abs(ax) > 1e-6 ? ix / Math.abs(ax) : 1e9, Math.abs(ay) > 1e-6 ? iy / Math.abs(ay) : 1e9)
        const tx = cx + ax * sc
        const ty = cy + ay * sc
        for (let i = 0; i < 4; i++)
          for (let q = -i * 0.6; q <= i * 0.6 + 0.01; q += 0.5)
            put(Math.round(tx - ax * i - ay * q), Math.round(ty - ay * i + ax * q), SHIP, k)
        const label = `SHIP ${Math.round(d)}`
        text(midX - (textWidth(label) >> 1), EDGE + 11, label, SHIP, 1, (k * 220) >> 8)
      }
    }
  }

  // ── where the sidearm aims: a small cross ahead of him, and brackets on the enemy (or the creature) it is turned onto
  if (foot.stage === WALKING) {
    const t = foot.aimAt
    const c = foot.aimBeast
    const on =
      t && t.alive ? project(scene.view, t.jet.x, t.jet.y, t.jet.z) : c ? project(scene.view, c.x, c.y, c.z + c.kind.middle) : false
    if (on) {
      const cx = Math.round(pr.x)
      const cy = Math.round(pr.y)
      // (round a creature: as wide as it is, in gold; an enemy pilot or ship in red)
      const r = c && !t ? Math.max(4, Math.round(c.kind.radius) + 2) : 5
      const col = c && !t ? GOLD : FOE
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        put(cx + sx * r, cy + sy * r, col)
        put(cx + sx * (r - 1), cy + sy * r, col)
        put(cx + sx * r, cy + sy * (r - 1), col)
      }
    } else if (project(scene.view, j.x + foot.aimX * 22, j.y + foot.aimY * 22, j.z)) {
      const cx = Math.round(pr.x)
      const cy = Math.round(pr.y)
      for (const [dx, dy] of [
        [0, -2],
        [0, 2],
        [-2, 0],
        [2, 0],
      ])
        put(cx + dx, cy + dy, AIM, (k * 170) >> 8)
    }
  }

  // ── coming down: where he will come down (a ring on the ground, green on land, red over deep water, lava or acid; kept on
  // the screen) and, while it is red, an arrow from it along the ground to the nearest land, and how far (polish step 9:
  // pilots drowned not knowing which way to steer)
  if (foot.stage === FALLING) {
    const d = foot.down
    const col = d.safe ? OK : BAD
    const gz = groundAt(scene.world, d.x, d.y)
    if (project(scene.view, d.x, d.y, gz)) {
      const cx = clamp(Math.round(pr.x), 8, W - 9)
      const cy = clamp(Math.round(pr.y), 8, H - 9)
      const r = d.safe || blink ? 5 : 4
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        put(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.7), col, k)
      }
      put(cx, cy, col, k)
      const shore = foot.shore
      if (!d.safe && shore && shore.d > 0) {
        const gx = pr.x
        const gy = pr.y
        if (project(scene.view, d.x + wrapDelta(shore.x - d.x), d.y + wrapDelta(shore.y - d.y), gz)) {
          const ax = pr.x - gx
          const ay = pr.y - gy
          const len = Math.hypot(ax, ay) || 1
          const ux = ax / len
          const uy = ay / len
          // (a line out of the ring, then a chevron)
          for (let s = 7; s < 16; s++) put(Math.round(cx + ux * s), Math.round(cy + uy * s), OK, k)
          const tipX = cx + ux * 18
          const tipY = cy + uy * 18
          for (let s = 0; s < 5; s++) {
            put(Math.round(tipX - ux * s - uy * s * 0.7), Math.round(tipY - uy * s + ux * s * 0.7), OK, k)
            put(Math.round(tipX - ux * s + uy * s * 0.7), Math.round(tipY - uy * s - ux * s * 0.7), OK, k)
          }
          const words = `LAND ${Math.round(Math.hypot(wrapDelta(shore.x - d.x), wrapDelta(shore.y - d.y)))}`
          const tx = clamp(Math.round(tipX + ux * 8 - textWidth(words) / 2), 2, W - textWidth(words) - 2)
          const ty = clamp(Math.round(tipY + uy * 8 - textHeight() / 2), 2, H - textHeight() - 2)
          text(tx, ty, words, OK, 1, k)
        }
      }
    }
    if (w.open > 0.3 && !d.safe && blink) {
      const line = 'STEER FOR LAND'
      text(midX - (textWidth(line) >> 1), Math.round(H * 0.72), line, DIM)
    }
  }

  // ── dead: back at a base in a moment
  if (foot.stage === DEAD) {
    const base = nearestBase(scene, j.x, j.y)
    const words = foot.how === 'sea' ? 'DROWNED' : foot.how ? 'LOST' : 'KILLED'
    const y = Math.round(H * 0.3)
    const kk = Math.round(k * clamp(foot.t / 0.4, 0, 1))
    text(midX - textWidth(words, 2) / 2, y, words, BAD, 2, kk)
    // (twice the size even on foot: it is the one thing on the screen)
    if (base) {
      const line = `BACK AT ${base.base.name.toUpperCase()} IN ${Math.max(1, Math.ceil(RESPAWN.wait - foot.t))}`
      text(midX - (textWidth(line) >> 1), y + textHeight(2) + 4, line, INK, 1, kk)
    }
  }
}
