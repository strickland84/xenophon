// What the rooms show of the outside while the pilot is up out of his seat in flight (sim/interior.ts getUp): the ship
// flies itself out there, so the rooms shake when it is hit and flash red (blue for the shield), and over them a little
// of the flight HUD: the shield and hull bars, AUTOPILOT and the speed, which key takes him back to the seat, and a
// warning line while it is under fire (HULL HIT, a missile coming). Drawn after the rooms (render/interior.ts).

import { UP_IN_FLIGHT } from '../data/interiors'
import { ownFighter } from '../sim/combat'
import { nearestThreat } from '../sim/missiles'
import { inSpace } from '../sim/space'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import { NM, NSHIFT } from '../world/world'
import { drawText, textHeight, textWidth } from './font'
import type { Frame } from './frame'
import { barWidth, clearWidth, fitLines } from './hud'

const INK = pack(244, 246, 252)
const DIM = pack(172, 186, 206)
const KEY = pack(255, 214, 96)
const SHADE = pack(10, 14, 28)
const HULL_OK = pack(112, 226, 124)
const HULL_LOW = pack(250, 210, 70)
const HULL_BAD = pack(250, 76, 60)
const SHIELD = pack(120, 206, 255)
/** the autopilot's word: the cockpit screens' green */
const AUTO = pack(120, 236, 196)
const RED = pack(220, 30, 24)
const BLUE = pack(60, 150, 255)

const BLACK = pack(4, 5, 10)
const STAR = [pack(90, 96, 120), pack(150, 160, 190), pack(230, 236, 255)]

/**
 * What lies round the ship's rooms while it flies (the rooms are drawn nose up): over a world, its own ground far below,
 * sliding back and turning as the ship does, hazed by the air between (UP_IN_FLIGHT.below ground px to a room px); in
 * space, the stars at two depths. Made once a frame; `rx`, `ry` are px from the rooms' middle, `d` how near the hull is
 * (its shadow and edge, 1 … 9).
 */
export function outsideOf(scene: SceneState): (rx: number, ry: number, d: number, sx: number, sy: number) => number {
  const j = scene.jets[0]
  const c = Math.cos(j.yaw)
  const s = Math.sin(j.yaw)
  const edge = (col: number, d: number) => (d < 2 ? blend(col, BLACK, 200) : d < 4 ? blend(col, BLACK, 110) : col)
  if (inSpace(scene)) {
    const layers = [UP_IN_FLIGHT.stars, UP_IN_FLIGHT.stars * 2.2]
    return (rx, ry, d) => {
      let col = BLACK
      for (let l = 0; l < 2; l++) {
        const g = layers[l]
        // (a star a px, about one in three hundred; the nearer layer fewer and brighter)
        const u = Math.floor(j.x * g + rx * c - ry * s)
        const v = Math.floor(j.y * g + rx * s + ry * c)
        const h = hash8((u * 73856093) ^ (v * 19349663) ^ (l * 83492791))
        if (h < 2 && hash8((u * 19349663) ^ (v * 83492791) ^ l) < 160 - l * 70) col = STAR[l === 1 ? 2 : h]
      }
      return edge(col, d)
    }
  }
  const { world, pal } = scene
  const g = UP_IN_FLIGHT.below
  const far = UP_IN_FLIGHT.haze
  return (rx, ry, d, sx, sy) => {
    const wx = j.x + g * (rx * c - ry * s)
    const wy = j.y + g * (rx * s + ry * c)
    const m = world.mat[(((wy | 0) & NM) << NSHIFT) | ((wx | 0) & NM)]
    // (hazed, a step more or less by the dither, so the far ground is soft and not banded)
    const k = far + (BAYER[((sy & 3) << 2) | (sx & 3)] < 8 ? 12 : -12)
    return edge(blend(pal.topLit[m], pal.haze, k), d)
  }
}

/** how far down the frame the lines top left reach (the room's name, AUTOPILOT, the bars, the seat's key) */
export const UP_HUD_BOTTOM = 4 + (textHeight() + 3) * 2 + 10 + textHeight() + 2

/** seconds since his ship was last hit (hull or shield), and whether it was the hull (99: none, or he is not up) */
function sinceHit(scene: SceneState) {
  const own = ownFighter(scene)
  if (!own || !scene.interior.flying) return { t: 99, hull: false }
  const hull = scene.time - own.hullAt
  const shield = scene.time - own.shieldAt
  return { t: Math.min(hull, shield, 99), hull: hull <= shield }
}

/** how far the rooms are thrown this frame by a hit (px, whole), for the camera to add: none once it has died away */
export function shakeOf(scene: SceneState) {
  const hit = sinceHit(scene)
  if (hit.t >= UP_IN_FLIGHT.shakeT || !scene.params.hudMotion) return { x: 0, y: 0 }
  const k = (1 - hit.t / UP_IN_FLIGHT.shakeT) * UP_IN_FLIGHT.shake * (hit.hull ? 1 : 0.5)
  const n = Math.floor(scene.time * 30)
  return { x: Math.round(((hash8(n * 7 + 3) - 127.5) / 127.5) * k), y: Math.round(((hash8(n * 13 + 11) - 127.5) / 127.5) * k) }
}

/** the words of the warning now ('' none): a missile coming, or a hit lately */
export function warningOf(scene: SceneState) {
  const own = ownFighter(scene)
  if (!own || !scene.interior.flying) return ''
  if (nearestThreat(scene, own).tti < UP_IN_FLIGHT.missile) return 'MISSILE COMING: BACK TO THE SEAT'
  const hit = sinceHit(scene)
  if (hit.t < UP_IN_FLIGHT.warnT) return hit.hull ? 'HULL HIT: BACK TO THE SEAT' : 'UNDER FIRE: BACK TO THE SEAT'
  return ''
}

/** the flash of a hit over the rooms, the shield and hull bars, AUTOPILOT, the seat's key and the warning */
export function drawUpHud(scene: SceneState, f: Frame) {
  const own = ownFighter(scene)
  if (!own) return
  const { w: W, h: H, fb } = f
  const time = scene.time
  const blink = ((time * 4) | 0) % 2 === 0
  // ── a hit: the rooms flash, red for the hull and strongest at the edges, blue and fainter for the shield
  const hit = sinceHit(scene)
  if (hit.t < UP_IN_FLIGHT.flashT) {
    const k = (1 - hit.t / UP_IN_FLIGHT.flashT) * (hit.hull ? 1 : 0.55)
    const col = hit.hull ? RED : BLUE
    const cx = W / 2
    const cy = H / 2
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / cx
        const dy = (y - cy) / cy
        const edge = clamp(Math.max(Math.abs(dx), Math.abs(dy)) * 1.3 - 0.3, 0, 1)
        const kk = Math.round(k * (50 + edge * 120))
        if (kk > 0) fb[y * W + x] = blend(fb[y * W + x], col, kk)
      }
  }
  const text = (x: number, y: number, s: string, col: number) => drawText(fb, W, H, x, y, s, col, SHADE)
  const box = (x0: number, y0: number, x1: number, y1: number, col: number, k = 256) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) fb[y * W + x] = k >= 256 ? col : blend(fb[y * W + x], col, k)
  }
  const lineH = textHeight() + 3
  // ── top left, under the room's name: AUTOPILOT and the speed, the shield and hull bars, the seat's key
  const x0 = 4
  let y = 4 + lineH
  const speed = Math.round(scene.speed)
  const cruise = inSpace(scene) && scene.space.pace > 1.05 ? ' CRUISE' : ''
  text(x0, y, `AUTOPILOT ${speed}${cruise}`, AUTO)
  y += lineH
  const bw = barWidth(W)
  box(x0 - 1, y - 1, x0 + bw + 1, y + 3, SHADE, 128)
  const sf = clamp(own.shield / Math.max(1, own.stats.shield), 0, 1)
  for (let x = 0; x < Math.round(bw * sf); x++) if (x % 4 !== 3) box(x0 + x, y, x0 + x + 1, y + 2, SHIELD)
  const hy = y + 4
  box(x0 - 1, hy - 1, x0 + bw + 1, hy + 4, SHADE, 128)
  const left = clamp(own.hull / own.stats.hull, 0, 1)
  const hc = left > 0.6 ? HULL_OK : left > 0.3 ? HULL_LOW : HULL_BAD
  if (left > 0.3 || blink) for (let x = 0; x < Math.round(bw * left); x++) if (x % 4 !== 3) box(x0 + x, hy, x0 + x + 1, hy + 3, hc)
  y = hy + 6
  const key = scene.params.seatKey || 'G'
  text(x0, y, `[${key}]`, KEY)
  text(x0 + textWidth(`[${key}] `), y, 'TO THE SEAT', DIM)
  // ── the warning: over the middle of the frame, red and blinking, on a dark band, broken into lines where it must be
  const warn = warningOf(scene)
  if (!warn) return
  const lines = fitLines(warn, Math.min(W - 16, clearWidth(scene)))
  // (a fifth of the way down; in a small frame, under the lines top left where it would cross them)
  const wide = lines.reduce((w, l) => Math.max(w, textWidth(l)), 0)
  const hudW = Math.max(bw, textWidth(`AUTOPILOT ${speed}${cruise}`), textWidth(`[${key}] TO THE SEAT`))
  let wy = (W - wide) / 2 - 4 < x0 + hudW + 2 ? Math.max(Math.round(H * 0.2), UP_HUD_BOTTOM + 4) : Math.round(H * 0.2)
  for (const said of lines) {
    const w = textWidth(said)
    const wx = (W - w) >> 1
    box(wx - 4, wy - 3, wx + w + 4, wy + textHeight() + 3, SHADE, 190)
    text(wx, wy, said, blink ? HULL_BAD : INK)
    wy += textHeight() + 6
  }
}
