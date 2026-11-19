// The target on the HUD (docs/targeting.md, "Where it shows"): four corner brackets round it in the world in the colour of
// what it is to the pilot (a friend blue, an enemy red, neither in ink), closing in as it is picked, its name and how far
// under them, a ship's hull and shield over it; off the frame an arrow at the edge with its name. Overhead and from behind,
// a card in the lower left says what it is (render/targetinfo.ts): a ship from above or a body as a little lit disc, its
// name, what it is, a line or two more, its hull and shield. In the seat the panel's screen says it instead
// (render/cockpit/screens.ts), and the brackets are drawn as ever.

import type { SceneState } from '../state'
import { theGalaxy } from '../galaxy/galaxy'
import { pack } from '../util/color'
import { clamp } from '../util/math'
import { hash8 } from '../util/math'
import { targetOnScreen } from '../sim/target'
import { textHeight, textWidth } from './font'
import { arrow, at, barWidth, lowRow } from './hud'
import type { LoopHud } from './hud'
import { distanceWords, targetInfo } from './targetinfo'
import type { Relation, TargetInfo } from './targetinfo'
import { FAR_COLOURS, sunColours } from './space'

const INK = pack(244, 246, 252)
const DIM = pack(172, 186, 206)
const SHADE = pack(10, 14, 28)
const FOE = pack(255, 84, 70)
const FRIEND = pack(110, 190, 255)
const HULL_OK = pack(112, 226, 124)
const HULL_LOW = pack(250, 210, 70)
const HULL_BAD = pack(250, 76, 60)
const SHIELD = pack(120, 206, 255)
const EDGE = 4
/** the card's border, a cream rule (the interface's panels have one) */
const RULE = pack(226, 214, 180)
/** a line's tone: plain, good, a warning, danger */
const TONES = [DIM, HULL_OK, HULL_LOW, FOE]

export const relColour = (rel: Relation) => (rel === 'enemy' ? FOE : rel === 'friend' ? FRIEND : INK)

type Put = (x: number, y: number, col: number, k?: number) => void

/** a ship seen from above (cells: 0 empty, 1 body, 2 paint, 3 glass) fitted into a box round (cx, cy): its rim in `edge`, its paint in `paint` */
export function drawTop(
  put: Put,
  top: NonNullable<TargetInfo['top']>,
  cx: number,
  cy: number,
  bw: number,
  bh: number,
  body: number,
  edge: number,
  paint: number,
  glass: number,
  k = 256,
) {
  const fit = Math.min(bh / top.h, bw / top.w)
  const jw = Math.max(1, Math.round(top.w * fit))
  const jh = Math.max(1, Math.round(top.h * fit))
  const x0 = Math.round(cx - jw / 2)
  const y0 = Math.round(cy - jh / 2)
  const cell = (x: number, y: number) =>
    x < 0 || y < 0 || x >= jw || y >= jh
      ? 0
      : top.cells[Math.min(top.h - 1, Math.floor(y / fit)) * top.w + Math.min(top.w - 1, Math.floor(x / fit))]
  for (let y = 0; y < jh; y++)
    for (let x = 0; x < jw; x++) {
      const c = cell(x, y)
      if (!c) continue
      const rim = !cell(x - 1, y) || !cell(x + 1, y) || !cell(x, y - 1) || !cell(x, y + 1)
      put(x0 + x, y0 + y, rim ? edge : c === 2 ? paint : c === 3 ? glass : body, k)
    }
}

/** a body as a little lit disc of radius r round (cx, cy), in its own colours, lit from the upper left */
export function drawDisc(put: Put, info: TargetInfo, cx: number, cy: number, r: number, k = 256) {
  const b = info.now.body?.body
  if (!b) return
  const kind = b.kind
  if (kind === 'gate' || kind === 'base') {
    // a structure: a gate a ring, a station a hub with arms
    const col = kind === 'gate' ? pack(120, 190, 255) : b.role === 'derelict' ? pack(150, 120, 110) : pack(190, 198, 212)
    for (let a = 0; a < 40; a++) {
      const t = (a / 40) * Math.PI * 2
      if (kind === 'gate') put(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r), col, k)
    }
    if (kind === 'base') {
      for (let i = -r; i <= r; i++) {
        put(cx + i, cy, col, k)
        put(cx, cy + i, col, k)
      }
      for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) put(cx + x, cy + y, INK, k)
    }
    return
  }
  const lx = -0.6
  const ly = -0.55
  const lz = 0.58
  let tones: number[][]
  if (kind === 'sun') {
    const ramp = sunColours(b.star ?? 'yellow').ramp
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y) / (r + 0.5)
        if (d > 1) continue
        put(cx + x, cy + y, ramp[clamp(Math.round(15 - d * 8 + ((hash8((x + 20) * 37 + (y + 20) * 11) & 3) - 1)), 0, 15)], k)
      }
    return
  }
  if (kind === 'black hole') {
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++) {
        const d = Math.hypot(x, y)
        if (d > r + 0.5) continue
        put(cx + x, cy + y, d > r - 1.2 ? pack(255, 170, 80) : d > r - 2.2 ? pack(120, 50, 30) : pack(0, 0, 0), k)
      }
    return
  }
  if (kind === 'giant')
    tones = [
      [186, 140, 88],
      [222, 196, 150],
    ]
  else tones = FAR_COLOURS[theGalaxy().worlds[b.world]?.recipe.archetype ?? ''] ?? FAR_COLOURS.moon
  for (let y = -r; y <= r; y++)
    for (let x = -r; x <= r; x++) {
      const nx = x / (r + 0.5)
      const ny = y / (r + 0.5)
      const nn = nx * nx + ny * ny
      if (nn > 1) continue
      const nz = Math.sqrt(1 - nn)
      const lit = clamp(nx * lx + ny * ly + nz * lz, 0, 1)
      const l = 0.18 + 0.82 * lit
      // (a giant in bands, a world in patches of its two colours)
      const which =
        kind === 'giant' ? Math.floor((y + r) * 1.3) & 1 : hash8(b.index * 7 + ((x + 16) >> 1) * 13 + ((y + 16) >> 1) * 29) < 120 ? 1 : 0
      const c = tones[which] ?? tones[0]
      put(cx + x, cy + y, pack(c[0] * l, c[1] * l, c[2] * l), k)
    }
}

/** four corner brackets round (cx, cy), `gap` from it, arms `arm` long */
function brackets(put: Put, cx: number, cy: number, gap: number, arm: number, col: number, k: number) {
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const x = cx + sx * gap
    const y = cy + sy * gap
    for (let i = 0; i <= arm; i++) {
      put(x - sx * i, y, col, k)
      put(x, y - sy * i, col, k)
    }
  }
}

/** the target on the HUD: brackets, its name, the arrow to it, the card (not in the seat) */
export function targetHud(scene: SceneState, h: LoopHud) {
  const info = targetInfo(scene)
  if (!info) return
  const { put, box, text, k } = h
  const { w: W, h: H } = scene.screen
  const cockpit = scene.view.cockpit > 0.5
  const t = info.now
  const col = relColour(info.rel)
  const words = `${info.name} ${distanceWords(info.d)}`
  // (in the seat, above the panel)
  const art = scene.cockpitArt
  const bottom = cockpit && art ? art.panelTop : H
  const p = targetOnScreen(scene, t)
  // (the card's place first, so a name in the world keeps off it)
  const cb = cockpit ? null : cardBox(scene, h, info)
  const clear = (x: number, y: number, w: number) =>
    cb && x < cb.x1 && x + w > cb.x0 && y + textHeight() > cb.y0 && y < cb.y1 ? cb.y0 - textHeight() - 4 : y
  const inFrame = !!p && p.x >= 2 && p.y >= 2 && p.x < W - 2 && p.y < bottom - 2
  if (p && inFrame) {
    const cx = Math.round(p.x)
    const cy = Math.round(p.y)
    // (the sights bracket an enemy they are on already, with its hull and LOCK: render/hud.ts; then only its name)
    const sighted = !!t.fighter && scene.sights.target === t.fighter
    // (picked: the brackets close in from wide over a fifth of a second)
    const since = scene.time - scene.target.at
    const closing = scene.params.hudMotion ? clamp(1 - since / 0.2, 0, 1) : 0
    const r = Math.max(5, Math.round(p.r * 0.9))
    const gap = Math.round(r * (1 + closing * 0.8))
    // (one larger than most of the frame is not bracketed: its name is written over its middle)
    const huge = gap > H * 0.42
    if (!sighted && !huge) {
      brackets(put, cx, cy, gap, Math.max(2, Math.min(6, Math.round(gap * 0.45))), col, k)
      // a ship's hull and shield, hair-thin over it
      if (info.hull >= 0) {
        const bw = gap * 2
        const bx = cx - gap
        const by = cy - gap - 3
        box(bx, by, bx + bw + 1, by + 1, SHADE, k >> 1)
        box(bx, by, bx + Math.round((bw + 1) * info.hull), by + 1, info.hull > 0.3 ? HULL_OK : HULL_BAD, k)
        if (info.shield > 0) box(bx, by - 1, bx + Math.round((bw + 1) * info.shield), by, SHIELD, k >> 1)
      }
    }
    // its name and how far, under it (under LOCK when the sights write it)
    const locked = sighted && info.lock >= 1
    const sightGap = sighted ? Math.max(5, Math.round(r * (1 + (1 - info.lock) * (info.lock > 0 ? 0.9 : 0)))) : gap
    let ny = huge ? cy - (textHeight() >> 1) : cy + sightGap + 3 + (locked ? textHeight() + 2 : 0)
    // (kept on the frame, and above the panel in the seat)
    ny = Math.min(ny, bottom - textHeight() - 3)
    const nx = clamp(cx - (textWidth(words) >> 1), EDGE, W - EDGE - textWidth(words))
    ny = clear(nx, ny, textWidth(words))
    plate(h, nx, ny, words)
    text(nx, ny, words, col, 1, (k * 230) >> 8)
  } else {
    // off the frame (or behind the camera): an arrow at the edge, with its name and how far (not for the course: its own arrow says it)
    if (t.body && scene.space.course === t.body.body.index) return
    const on = !!p
    if (p) {
      at.x = p.x
      at.y = p.y
    }
    arrow(scene, on, t.x, t.y, col, 5, k, put)
    const cx = W / 2
    const cy = H / 2
    const ax = on ? clamp(at.x, EDGE + 12, W - EDGE - 12) : cx
    const ay = on ? clamp(at.y, EDGE + 12, H - EDGE - 12) : H - EDGE - 12
    const ix = Math.round(cx + (ax - cx) * 0.8 - textWidth(words) / 2)
    const iy = Math.round(cy + (ay - cy) * 0.8)
    // (above the row the prompts go on, DOCK or MINE under the middle: render/hud.ts lowRow)
    const low = (h.top || cockpit ? lowRow(scene) : H - EDGE - 21 - textHeight()) - textHeight() - 6
    const lx = clamp(ix, EDGE, W - EDGE - textWidth(words))
    const ly = clear(lx, clamp(iy, EDGE + 8, low), textWidth(words))
    plate(h, lx, ly, words)
    text(lx, ly, words, col, 1, k)
  }
  if (cb) card(h, info, cb)
}

/** a soft dark plate under a line of the HUD's words, so it reads over a sun's glare or a station's hub */
function plate(h: LoopHud, x: number, y: number, words: string) {
  const w = textWidth(words)
  const th = textHeight()
  h.box(x - 2, y - 2, x + w + 2, y + th + 1, SHADE, (h.k * 110) >> 8)
  h.box(x - 3, y - 1, x + w + 3, y + th, SHADE, (h.k * 40) >> 8)
}

interface CardBox {
  x0: number
  y0: number
  x1: number
  y1: number
  lines: { words: string; col: number }[]
}

/** where the card goes, and its lines: in the lower left over the bars (in the cockpit, the HUD kept to the top, under the radar on the right); null where there is no room */
function cardBox(scene: SceneState, h: LoopHud, info: TargetInfo): CardBox | null {
  const { top } = h
  const { w: W, h: H } = scene.screen
  const lh = textHeight() + 2
  const lines: { words: string; col: number }[] = [
    { words: info.name, col: relColour(info.rel) },
    ...(info.stance ? [{ words: info.stance, col: relColour(info.rel) }] : []),
    { words: `${info.what} ${distanceWords(info.d)}`.trim(), col: DIM },
    ...info.more.slice(0, 2).map((m) => ({ words: m.words, col: TONES[m.tone] })),
  ]
  const icon = 15
  const textW = Math.max(...lines.map((l) => textWidth(l.words)))
  const bars = info.hull >= 0
  const w = Math.max(icon + 4 + textW, barWidth(W)) + 6
  const hgt = Math.max(icon, lines.length * lh - 2) + (bars ? 6 : 0) + 6
  // (over the bars at the bottom; kept to the top, on the right under the radar and the missiles)
  const R = clamp(Math.round(H * 0.075), 12, 20)
  const x0 = top ? W - EDGE - w : EDGE
  const y0 = top ? EDGE + 2 * R + 26 : h.barsY - hgt - 10
  if (y0 < EDGE || x0 < 0) return null
  return { x0, y0, x1: x0 + w, y1: y0 + hgt, lines }
}

/** the card: what the target is */
function card(h: LoopHud, info: TargetInfo, c: CardBox) {
  const { put, box, text, k } = h
  const { x0, y0, x1, y1, lines } = c
  const w = x1 - x0
  const lh = textHeight() + 2
  const icon = 15
  // a dark plate with a thin cream rule, its corners cut
  box(x0 + 1, y0 + 1, x1 - 1, y1 - 1, SHADE, (k * 170) >> 8)
  const rk = (k * 120) >> 8
  for (let x = x0 + 2; x < x1 - 2; x++) {
    put(x, y0, RULE, rk)
    put(x, y1 - 1, RULE, rk)
  }
  for (let y = y0 + 2; y < y1 - 2; y++) {
    put(x0, y, RULE, rk)
    put(x1 - 1, y, RULE, rk)
  }
  put(x0 + 1, y0 + 1, RULE, rk)
  put(x1 - 2, y0 + 1, RULE, rk)
  put(x0 + 1, y1 - 2, RULE, rk)
  put(x1 - 2, y1 - 2, RULE, rk)
  // the ship from above, or the body as a disc
  const ix = x0 + 3 + (icon >> 1)
  const iy = y0 + 3 + (icon >> 1)
  if (info.top)
    drawTop(put, info.top, ix, iy, icon, icon, pack(70, 80, 100), relColour(info.rel), pack(120, 130, 150), pack(140, 220, 230), k)
  else if (info.disc) drawDisc(put, info, ix, iy, (icon >> 1) - 1, k)
  else {
    // a place on the ground: a marker
    for (let i = -3; i <= 3; i++) put(ix + i, iy + 3 - Math.abs(i), relColour(info.rel), k)
    box(ix - 1, iy - 4, ix + 2, iy, relColour(info.rel), k)
  }
  const tx = x0 + 3 + icon + 4
  let ty = y0 + 3
  for (const l of lines) {
    text(tx, ty, l.words, l.col, 1, k)
    ty += lh
  }
  if (info.hull >= 0) {
    const bw = w - 6
    const by = y1 - 6
    box(x0 + 3, by, x0 + 3 + bw, by + 2, SHADE, k >> 1)
    if (info.shield >= 0) box(x0 + 3, by, x0 + 3 + Math.round(bw * info.shield), by + 1, SHIELD, k)
    box(x0 + 3, by + 2, x0 + 3 + bw, by + 4, SHADE, k >> 1)
    const hc = info.hull > 0.6 ? HULL_OK : info.hull > 0.3 ? HULL_LOW : HULL_BAD
    for (let x = 0; x < Math.round(bw * info.hull); x++) if (x % 4 !== 3) box(x0 + 3 + x, by + 2, x0 + 4 + x, by + 4, hc, k)
  }
}
