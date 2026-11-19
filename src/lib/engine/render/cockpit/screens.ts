// The cockpit's live instruments, each drawn on one of its panel's screens (where they are is the
// cockpit's own: art.ts): the radar, the ship's attitude, hull and shield, the guns' heat and the
// missiles, speed and height, the target, the hold; and on one of them in every cockpit the throttle's
// lever and the speed (`drive`). Figures are in the HUD's own type (font.ts),
// at the HUD's size where the screen has room for it; bars and pictures before words.
//
// The ship's power (sim/power.ts) wakes them: off, every screen is dark glass with a red standby light; coming up, each in
// its turn flickers, a bright line runs down it, and its instrument comes alive (the bars fill, the attitude ball spins up
// and settles, the radar's sweep starts, the blips and the target last); going down, each collapses to a line and goes
// dark, the last woken first. Landed or docked, the weapons' screen says SAFE.

import { blend, pack } from '../../util/color'
import { clamp } from '../../util/math'
import { drawText, setTextUnit, textHeight, textWidth } from '../font'
import type { CockpitScreen } from './art'
import type { CockpitLive } from './types'
import { drawDisc } from '../targethud'
import { distanceWords } from '../targetinfo'

// the screens' glow: dark glass, lines and figures in green, warnings in amber and red
export const CRT = [pack(4, 16, 14), pack(6, 26, 21), pack(12, 58, 42), pack(26, 132, 82), pack(78, 222, 134), pack(190, 255, 214)]
const AMBER = pack(255, 186, 64)
/** the cruise drive's colour, as the HUD has it (render/spacehud.ts COURSE) */
const CYAN = pack(120, 236, 220)
const RED = pack(255, 76, 60)
const BLUE = pack(110, 196, 255)
const WHITE = pack(255, 255, 255)
const BLACK = pack(0, 0, 0)
const SKY = pack(66, 128, 214)
const SKY2 = pack(104, 168, 236)
const EARTH = pack(146, 92, 44)
const EARTH2 = pack(112, 66, 30)
const SPACE = pack(14, 18, 44)

/** of the power's way up, how much a screen's flicker and the line running down it take */
const BOOT = 0.1
/** … and its instrument coming alive after */
const WAKE = 0.22
const STANDBY = pack(220, 52, 36)

/** a screen's drawing surface: everything is kept inside its rectangle */
class Glass {
  fb: Uint32Array
  W: number
  x0 = 0
  y0 = 0
  x1 = 0
  y1 = 0
  constructor(fb: Uint32Array, W: number) {
    this.fb = fb
    this.W = W
  }
  at(x: number, y: number, w: number, h: number, H: number) {
    this.x0 = Math.max(0, x)
    this.y0 = Math.max(0, y)
    this.x1 = Math.min(this.W, x + w)
    this.y1 = Math.min(H, y + h)
  }
  put(x: number, y: number, c: number) {
    if (x < this.x0 || y < this.y0 || x >= this.x1 || y >= this.y1) return
    this.fb[y * this.W + x] = c
  }
  tint(x: number, y: number, c: number, k: number) {
    if (x < this.x0 || y < this.y0 || x >= this.x1 || y >= this.y1) return
    const o = y * this.W + x
    this.fb[o] = blend(this.fb[o], c, k)
  }
  box(xa: number, ya: number, xb: number, yb: number, c: number) {
    for (let y = Math.max(ya, this.y0); y < Math.min(yb, this.y1); y++)
      for (let x = Math.max(xa, this.x0); x < Math.min(xb, this.x1); x++) this.fb[y * this.W + x] = c
  }
  line(xa: number, ya: number, xb: number, yb: number, c: number) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya))))
    for (let i = 0; i <= n; i++) this.put(Math.round(xa + ((xb - xa) * i) / n), Math.round(ya + ((yb - ya) * i) / n), c)
  }
}

/** a ship seen from above (its cells: 0 empty, 1 body, 2 paint, 3 glass) fitted into a box, in the screen's colours */
function silhouette(
  g: Glass,
  top: CockpitLive['jet'],
  cx: number,
  cy: number,
  bw: number,
  bh: number,
  body: number,
  edge: number,
  paint: number,
) {
  const fit = Math.min(bh / top.h, bw / top.w)
  const jw = Math.max(1, Math.round(top.w * fit))
  const jh = Math.max(1, Math.round(top.h * fit))
  const x0 = Math.round(cx - jw / 2)
  const y0 = Math.round(cy - jh / 2)
  const at = (x: number, y: number) =>
    x < 0 || y < 0 || x >= jw || y >= jh
      ? 0
      : top.cells[Math.min(top.h - 1, Math.floor(y / fit)) * top.w + Math.min(top.w - 1, Math.floor(x / fit))]
  for (let y = 0; y < jh; y++)
    for (let x = 0; x < jw; x++) {
      const c = at(x, y)
      if (!c) continue
      const rim = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)
      g.put(x0 + x, y0 + y, rim ? edge : c === 2 ? paint : c === 3 ? CRT[5] : body)
    }
}

/** a bar filling from the left, in segments */
function bar(g: Glass, x: number, y: number, w: number, h: number, v: number, col: number) {
  g.box(x, y, x + w, y + h, CRT[1])
  const n = Math.round(w * clamp(v, 0, 1))
  for (let i = 0; i < n; i++) if (i % 3 !== 2) g.box(x + i, y, x + i + 1, y + h, col)
}

/** px across the throttle's lever takes at a screen's side, with its margin */
const LEVER_W = 11

/**
 * The throttle's lever (James's first flight, 2026-11-18: no throttle to be seen in the seat, nor the speed): a slot down
 * a screen's side (`x`, from `y` for `h`), notched at the quarters, lit up to where it is set, its handle there (amber
 * with the thrusters open); and the speed in figures beside it, at (`fx`, `fy`) right-aligned, when given.
 */
function drive(g: Glass, live: CockpitLive, x: number, y: number, h: number, fx = -1, fy = -1) {
  const sw = 3
  const top = y + 2
  const len = Math.max(6, h - 4)
  g.box(x, top, x + sw, top + len, CRT[1])
  const lit = Math.round((len - 1) * clamp(live.throttle, 0, 1))
  for (let i = 0; i < lit; i++) if (i % 3 !== 2) g.box(x, top + len - 1 - i, x + sw, top + len - i, CRT[3])
  for (const q of [0.25, 0.5, 0.75]) {
    const ny = top + len - 1 - Math.round((len - 1) * q)
    g.put(x - 1, ny, CRT[2])
    g.put(x + sw, ny, CRT[2])
  }
  // the handle: wider than the slot, two rows, a shade under it
  const hy = top + len - 2 - lit
  const hc = live.boost > 0.3 ? AMBER : live.throttle <= 0 ? (((live.time * 3) | 0) % 2 === 0 ? CRT[4] : CRT[3]) : CRT[5]
  g.box(x - 2, hy, x + sw + 2, hy + 2, hc)
  g.box(x - 2, hy + 2, x + sw + 2, hy + 3, CRT[0])
  if (fx < 0) return
  const spd = live.throttle <= 0 && live.speed < 1 ? 'STOP' : String(Math.round(live.speed * 4.2))
  drawText(g.fb, g.W, g.y1, fx - textWidth(spd), fy, spd, live.throttle <= 0 && live.speed < 1 ? AMBER : CRT[5], 0)
}

function radar(g: Glass, s: CockpitScreen, live: CockpitLive) {
  const mx = s.x + (s.w >> 1)
  const my = s.y + (s.h >> 1)
  const rad = Math.min(s.w, s.h) * 0.47
  const zoom = 320 / rad // world px a screen px: 320 to the edge
  const sweep = (live.time * 1.6) % (Math.PI * 2)
  for (let y = 0; y < s.h; y++)
    for (let x = 0; x < s.w; x++) {
      const dx = x - (s.w >> 1)
      const dy = y - (s.h >> 1)
      const d = Math.sqrt(dx * dx + dy * dy)
      const m = live.space ? 0 : live.land(dx * zoom, -dy * zoom)
      let tone = m >= 3 ? 4 : m === 2 ? 3 : m === 1 ? 1 : (y & 1) === 0 ? 0 : 1
      if (m < 2 && (dx === 0 || dy === 0)) tone = 2
      const ring = d / rad
      if (m < 3 && (Math.abs(ring - 1) < 0.5 / rad || Math.abs(ring - 0.5) < 0.5 / rad)) tone = Math.max(tone, m === 2 ? 4 : 2)
      if (d <= rad) {
        let da = sweep - Math.atan2(dx, -dy)
        da -= Math.PI * 2 * Math.floor(da / (Math.PI * 2))
        if (da < 0.12) tone = 5
        else if (da < 0.7 && tone < 5) tone++
      }
      g.put(s.x + x, s.y + y, CRT[tone])
    }
  // (enemies red and blinking, friends bright)
  const blink = ((live.time * 4) | 0) % 2 === 0
  for (let i = 0; i + 2 < live.blips.length; i += 3) {
    const bx = mx + Math.round(live.blips[i] / zoom)
    const by = my - Math.round(live.blips[i + 1] / zoom)
    const foe = live.blips[i + 2] === 1
    if (foe && !blink) continue
    if (Math.hypot(bx - mx, by - my) > rad) continue
    g.box(bx, by, bx + 2, by + 2, foe ? RED : CRT[5])
  }
  for (const [ox, oy] of [
    [0, -2],
    [0, -1],
    [-1, 0],
    [0, 0],
    [1, 0],
    [-2, 1],
    [2, 1],
  ])
    g.put(mx + ox, my + oy, CRT[5])
}

function attitude(g: Glass, s: CockpitScreen, live: CockpitLive) {
  const r = Math.floor(Math.min(s.w, s.h) / 2) - 1
  const cx = s.x + (s.w >> 1)
  const cy = s.y + (s.h >> 1)
  const cr = Math.cos(live.roll)
  const sr = Math.sin(live.roll)
  const per = r / 34 // px a degree
  const po = clamp(live.pitch * (180 / Math.PI) * per * 0.9, -r * 0.85, r * 0.85)
  const rung = Math.max(3, Math.round(5 * per * 2) / 2)
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy
      if (d2 > r * r) continue
      const bx = cr * dx - sr * dy
      const by = sr * dx + cr * dy - po
      // (in space there is no ground: the ball is the sky all round, its equator the plane ships fly in)
      let col = live.space
        ? by > 0
          ? SPACE
          : blend(SPACE, SKY, 70)
        : by > 0
          ? by > r * 0.55
            ? EARTH2
            : EARTH
          : by < -r * 0.55
            ? SKY
            : SKY2
      if (Math.abs(by) < 0.6) col = WHITE
      else {
        const k = Math.round(by / rung)
        if (k !== 0 && Math.abs(by - k * rung) < 0.55 && Math.abs(bx) < (k % 2 === 0 ? r * 0.34 : r * 0.18)) col = WHITE
      }
      // round: shaded towards its rim, darkest lower right
      const rim = d2 / (r * r)
      const fall = rim > 0.9 ? 120 : rim > 0.74 ? 70 : rim > 0.55 ? 30 : 0
      col = blend(col, BLACK, clamp(fall + Math.round(((dx + dy) / (r * 1.4142)) * 40), 0, 200))
      g.put(cx + dx, cy + dy, col)
    }
  // the ship's mark, fixed
  const a = Math.round(r * 0.6)
  const b = Math.round(r * 0.2)
  g.box(cx - a, cy, cx - b, cy + 1, AMBER)
  g.box(cx + b + 1, cy, cx + a + 1, cy + 1, AMBER)
  g.box(cx - 1, cy - 1, cx + 2, cy + 2, AMBER)
}

/** the type's size on a screen: the HUD's own (`unit`), unless the screen is too small for two lines of it */
function unitFor(s: CockpitScreen, unit: number) {
  return unit > 1 && s.h >= (5 * unit + 3) * 2 + 4 && s.w >= 24 * unit ? unit : 1
}

function status(g: Glass, raw: CockpitScreen, live: CockpitLive, lever: boolean, unit: number) {
  // (the throttle's lever down its right side, and the speed under the bars, where no other screen has them)
  const s = lever ? { ...raw, w: raw.w - LEVER_W } : raw
  if (lever) {
    setTextUnit(unitFor(raw, unit))
    drive(g, live, raw.x + raw.w - 7, raw.y + 2, raw.h - 4, raw.x + raw.w - LEVER_W - 1, raw.y + raw.h - textHeight() - 3)
  }
  // the ship from above, on the left; hull and shield as bars beside it (the hull's bar green to red)
  const side = s.w >= s.h * 1.3
  const pw = side ? Math.round(s.w * 0.42) : s.w
  const ph = side ? s.h : Math.round(s.h * 0.55)
  const hullCol = live.hull > 0.5 ? CRT[4] : live.hull > 0.25 ? AMBER : RED
  silhouette(g, live.jet, s.x + pw / 2, s.y + ph / 2, pw - 6, ph - 6, live.hull > 0.25 ? CRT[3] : RED, CRT[2], live.accent[3] ?? CRT[4])
  const bx = side ? s.x + pw : s.x + 3
  const bw = side ? s.w - pw - 4 : s.w - 6
  const by = side ? s.y + Math.round(s.h * 0.24) : s.y + ph + 2
  const bh = Math.max(2, Math.round((side ? s.h : s.h - ph) * 0.16))
  bar(g, bx, by, bw, bh, live.hull, hullCol)
  bar(g, bx, by + bh + Math.max(3, bh), bw, bh, live.shield, BLUE)
}

function weapons(g: Glass, raw: CockpitScreen, live: CockpitLive, unit: number, lever: boolean) {
  const blink = ((live.time * 5) | 0) % 2 === 0
  // (the throttle's lever down its right side, and the speed over the heat's bar, where no other screen has them)
  const s = lever ? { ...raw, w: raw.w - LEVER_W } : raw
  // missiles: a dart each, dark once fired; mines: a ball each
  const n = live.missilesMax
  const dw = Math.max(3, Math.min(6, Math.floor((s.w - 8) / Math.max(1, n))))
  const dh = Math.max(6, Math.round(s.h * 0.36))
  let x = s.x + 4
  const y = s.y + 4
  for (let i = 0; i < n; i++) {
    const full = i < live.missiles
    const c = full ? WHITE : CRT[2]
    g.put(x + 1, y, c)
    g.box(x, y + 1, x + 3, y + dh - 2, full ? RED : CRT[1])
    g.box(x + 1, y + 1, x + 2, y + dh - 2, c)
    g.put(x, y + dh - 2, c)
    g.put(x + 2, y + dh - 2, c)
    x += dw
  }
  for (let i = 0; i < live.minesMax; i++) {
    const mx = s.x + s.w - 6 - i * 5
    g.box(mx, y + 1, mx + 3, y + 4, i < live.mines ? AMBER : CRT[1])
  }
  // the guns' heat: a bar across the bottom, red and flashing when they jam
  const hy = s.y + s.h - Math.max(5, Math.round(s.h * 0.22)) - 3
  const hh = Math.max(3, Math.round(s.h * 0.16))
  const hc = live.jammed ? RED : live.heat < 0.5 ? CRT[4] : live.heat < 0.8 ? AMBER : RED
  if (!live.jammed || blink) bar(g, s.x + 4, hy, s.w - 8, hh, live.jammed ? 1 : live.heat, hc)
  if (lever) {
    setTextUnit(unitFor(raw, unit))
    drive(g, live, raw.x + raw.w - 7, raw.y + 2, raw.h - 4, s.x + s.w - 4, hy - textHeight() - 3)
  }
  // (landed or docked, the weapons are safe: said across the middle, the darts dimmed under it)
  if (live.safe) {
    setTextUnit(unitFor(s, unit))
    const tw = textWidth('SAFE')
    const ty = s.y + ((s.h - textHeight()) >> 1) - 2
    g.box(s.x + ((s.w - tw) >> 1) - 2, ty - 2, s.x + ((s.w + tw) >> 1) + 2, ty + textHeight() + 2, CRT[0])
    drawText(g.fb, g.W, g.y1, s.x + ((s.w - tw) >> 1), ty, 'SAFE', AMBER, 0)
  }
  if (live.jammed && blink) {
    const u = unitFor(s, unit)
    setTextUnit(u)
    drawText(g.fb, g.W, g.y1, s.x + ((s.w - textWidth('HOT')) >> 1), hy - textHeight() - 2, 'HOT', RED, 0)
  }
}

function nav(g: Glass, s: CockpitScreen, live: CockpitLive, unit: number) {
  setTextUnit(unitFor(s, unit))
  const th = textHeight()
  const spd = String(Math.round(live.speed * 4.2))
  // speed, and under it the height (in space, the heading: there is no height)
  const second = live.space
    ? String(Math.round(((((live.heading * 180) / Math.PI) % 360) + 360) % 360)).padStart(3, '0')
    : String(Math.round(live.alt * 10))
  const gap = Math.max(2, Math.round((s.h - th * 2) / 3))
  drawText(g.fb, g.W, g.y1, s.x + s.w - 4 - textWidth(spd), s.y + gap, spd, CRT[5], 0)
  drawText(g.fb, g.W, g.y1, s.x + s.w - 4 - textWidth(second), s.y + gap * 2 + th, second, CRT[4], 0)
  // the throttle's lever beside them (it was a tape of the speed), and an arrow for the climb
  const tx = s.x + 5
  drive(g, live, tx, s.y + 1, s.h - 2)
  if (Math.abs(live.climb) > 0.1) {
    const ax = tx + 9
    const ay = s.y + gap * 2 + th + (th >> 1)
    const up = live.climb > 0
    for (let i = 0; i < 3; i++) g.box(ax - i, ay + (up ? i : -i), ax + i + 1, ay + (up ? i : -i) + 1, CRT[4])
  }
}

/** words cut to fit `w` px */
function fit(words: string, w: number) {
  let s = words
  while (s.length > 1 && textWidth(s) > w) s = s.slice(0, -1)
  return s
}

/**
 * The target picked with the target key (docs/targeting.md): its name at the top in what it is to the pilot's colour, the
 * ship from above or the body as a disc in the middle with the lock's corners, its hull and shield under it, and a line that
 * goes through what it is, a line or two more and how far, two seconds each.
 */
function picked(g: Glass, s: CockpitScreen, live: CockpitLive, unit: number) {
  const p = live.picked!
  setTextUnit(unitFor(s, unit))
  const th = textHeight()
  const col = p.rel === 'enemy' ? RED : p.rel === 'friend' ? BLUE : CRT[5]
  drawText(g.fb, g.W, g.y1, s.x + 3, s.y + 2, fit(p.name, s.w - 6), col, 0)
  // whose it is and what it is to him, under its name (NOMARCHY · FRIENDLY), where the screen has the room
  const stance = p.stance && s.h >= th * 4 + 18 ? p.stance : ''
  if (stance) drawText(g.fb, g.W, g.y1, s.x + 3, s.y + 4 + th, fit(stance, s.w - 6), col, 0)
  // the line that goes through the rest
  // (a screen too small for the stance's own line takes it in turn with the rest)
  const pages = [stance ? '' : p.stance, p.what, ...p.more.map((m) => m.words), distanceWords(p.d)].filter((w) => !!w)
  const page = pages[Math.floor(live.time / 2) % pages.length]
  const bars = p.hull >= 0
  const low = s.y + s.h - 2 - (bars ? 6 : 0)
  drawText(g.fb, g.W, g.y1, s.x + 3, low - th, fit(page, s.w - 6), CRT[4], 0)
  if (bars) {
    if (p.shield >= 0) bar(g, s.x + 3, low + 1, s.w - 6, 1, p.shield, BLUE)
    bar(g, s.x + 3, low + 3, s.w - 6, 2, p.hull, p.hull > 0.5 ? CRT[4] : p.hull > 0.25 ? AMBER : RED)
  }
  // the middle: the ship or the body, and the lock's corners closing on it
  const top = s.y + 2 + th + 2 + (stance ? th + 2 : 0)
  const bottom = low - th - 2
  const cx = s.x + (s.w >> 1)
  const cy = (top + bottom) >> 1
  const room = Math.max(4, Math.min(s.w - 8, bottom - top))
  const put = (x: number, y: number, c: number) => g.put(x, y, c)
  if (p.top) silhouette(g, p.top, cx, cy, room * 0.9, room * 0.8, CRT[3], CRT[2], col)
  else if (p.disc) drawDisc(put, p, cx, cy, Math.max(2, Math.round(room * 0.32)))
  const locked = p.lock >= 1
  // (the corners of a box round it, closing in as a missile's lock builds)
  const open = Math.round((1 - clamp(p.lock, 0, 1)) * 3)
  const qx = Math.min((s.w >> 1) - 2, (room >> 1) + 1 + open)
  const qy = Math.max(3, ((bottom - top) >> 1) + 1)
  const l = Math.max(2, Math.round(Math.min(qx, qy) * 0.4))
  const lc = locked ? (((live.time * 6) | 0) % 2 === 0 ? RED : AMBER) : CRT[3]
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    g.line(cx + sx * qx, cy + sy * qy, cx + sx * (qx - l), cy + sy * qy, lc)
    g.line(cx + sx * qx, cy + sy * qy, cx + sx * qx, cy + sy * (qy - l), lc)
  }
}

function target(g: Glass, s: CockpitScreen, live: CockpitLive, unit: number) {
  if (live.picked) return picked(g, s, live, unit)
  const t = live.target
  const cx = s.x + (s.w >> 1)
  const cy = s.y + (s.h >> 1)
  if (!t) {
    // nothing in the sights: a dim cross, and a line sweeping across
    g.line(cx - 4, cy, cx + 4, cy, CRT[2])
    g.line(cx, cy - 4, cx, cy + 4, CRT[2])
    const sy = s.y + Math.round(((live.time * 0.6) % 1) * s.h)
    g.box(s.x, sy, s.x + s.w, sy + 1, CRT[2])
    return
  }
  const locked = t.lock >= 1
  const blink = ((live.time * 6) | 0) % 2 === 0
  silhouette(g, t.top, cx, cy - Math.round(s.h * 0.08), s.w * 0.6, s.h * 0.55, CRT[3], CRT[2], RED)
  // the lock's corners close in on it, red once it holds
  const q = Math.round((1 - clamp(t.lock, 0, 1)) * Math.min(s.w, s.h) * 0.18) + Math.round(Math.min(s.w, s.h) * 0.3)
  const l = Math.max(2, Math.round(q * 0.35))
  const lc = locked ? (blink ? RED : AMBER) : CRT[4]
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    g.line(cx + sx * q, cy + sy * q, cx + sx * (q - l), cy + sy * q, lc)
    g.line(cx + sx * q, cy + sy * q, cx + sx * q, cy + sy * (q - l), lc)
  }
  // its hull, and how far
  bar(g, s.x + 4, s.y + s.h - 5, s.w - 8, 2, t.hull, t.hull > 0.5 ? CRT[4] : t.hull > 0.25 ? AMBER : RED)
  setTextUnit(unitFor(s, unit))
  const d = String(Math.round(t.d))
  drawText(g.fb, g.W, g.y1, s.x + 3, s.y + 3, d, CRT[4], 0)
}

/** the cruise drive along the bottom of a screen: a bar filling while it spools, then CRUISE and how many times its speed */
function cruise(g: Glass, s: CockpitScreen, live: CockpitLive, unit: number) {
  const c = live.cruise
  if (!c) return
  setTextUnit(unitFor(s, unit))
  const th = textHeight()
  const y = s.y + s.h - th - 4
  g.box(s.x + 2, y - 2, s.x + s.w - 2, s.y + s.h - 2, CRT[0])
  if (c.pace <= 0) {
    // spooling: a bar fills, SPOOL over it
    bar(g, s.x + 4, s.y + s.h - 5, s.w - 8, 2, c.spool, CYAN)
    drawText(g.fb, g.W, g.y1, s.x + 4, y - 1, fit('SPOOL', s.w - 8), CYAN, 0)
    return
  }
  const pace = `x${c.pace >= 100 ? Math.round(c.pace) : c.pace.toFixed(1)}`
  const words = textWidth(`CRUISE ${pace}`) <= s.w - 8 ? `CRUISE ${pace}` : pace
  drawText(g.fb, g.W, g.y1, s.x + ((s.w - textWidth(words)) >> 1), y, words, CYAN, 0)
}

function cargo(g: Glass, s: CockpitScreen, live: CockpitLive, unit: number) {
  // the hold as stacked boxes, filling from the bottom; the units over them
  const slots = Math.max(1, Math.round(live.holdMax / 10))
  const full = live.hold / Math.max(1, live.holdMax)
  const cols = Math.ceil(Math.sqrt(slots * (s.w / Math.max(1, s.h))))
  const rows = Math.ceil(slots / cols)
  setTextUnit(unitFor(s, unit))
  const th = textHeight() + 4
  const cw = Math.max(3, Math.floor((s.w - 6) / cols))
  const ch = Math.max(3, Math.floor((s.h - th - 4) / rows))
  const filled = Math.round(slots * full)
  for (let i = 0; i < slots; i++) {
    const c = i % cols
    const r = rows - 1 - Math.floor(i / cols)
    const x = s.x + 3 + c * cw
    const y = s.y + th + r * ch
    const on = i < filled
    g.box(x, y, x + cw - 1, y + ch - 1, on ? (live.accent[3] ?? AMBER) : CRT[1])
    if (on) g.box(x, y, x + cw - 1, y + 1, live.accent[5] ?? WHITE)
  }
  const words = `${Math.round(live.hold)}/${Math.round(live.holdMax)}`
  drawText(g.fb, g.W, g.y1, s.x + ((s.w - textWidth(words)) >> 1), s.y + 2, words, CRT[4], 0)
}

/** a screen with no power: dark glass, and a dim red light in its corner */
function dark(g: Glass, s: CockpitScreen) {
  for (let y = s.y; y < s.y + s.h; y++) g.box(s.x, y, s.x + s.w, y + 1, (y & 1) === 0 ? pack(2, 7, 7) : pack(3, 10, 9))
  g.put(s.x + 2, s.y + s.h - 3, STANDBY)
}

/**
 * A screen waking (`lit` 0..1 of its turn), or going dark: coming up, it flickers, then a bright line runs down it leaving
 * the glow behind; going down, its picture collapses to a line across its middle and is gone.
 */
function boot(g: Glass, s: CockpitScreen, live: CockpitLive, lit: number, n: number) {
  dark(g, s)
  if (!live.rising) {
    const cy = s.y + (s.h >> 1)
    const hh = Math.max(0, Math.round((lit * lit * s.h) / 2))
    g.box(s.x, cy - hh, s.x + s.w, cy + hh + 1, CRT[2])
    const ww = Math.round(s.w * Math.min(1, lit * 3) * 0.5)
    g.box(s.x + (s.w >> 1) - ww, cy, s.x + (s.w >> 1) + ww, cy + 1, CRT[5])
    return
  }
  if (lit < 0.35) {
    // (a flicker: on and off, out of step with the other screens)
    const t = ((live.time * 24) | 0) + n * 7
    if (Math.imul(t, 0x9e3779b1) >>> 30 !== 0)
      for (let y = s.y; y < s.y + s.h; y++) g.box(s.x, y, s.x + s.w, y + 1, CRT[(y & 1) === 0 ? 1 : 2])
    return
  }
  const u = (lit - 0.35) / 0.65
  const ly = s.y + Math.round(u * (s.h - 1))
  for (let y = s.y; y < ly; y++) g.box(s.x, y, s.x + s.w, y + 1, CRT[(y & 1) === 0 ? 0 : 1])
  g.box(s.x, ly, s.x + s.w, ly + 1, CRT[5])
  if (ly > s.y) g.box(s.x, ly - 1, s.x + s.w, ly, CRT[3])
}

/** the instruments as a screen shows them while it comes alive (`e` 0..1): the bars filling, the ball spinning up and settling, blips and the target last */
function waking(live: CockpitLive, e: number): CockpitLive {
  const f = 1 - e
  return {
    ...live,
    hull: live.hull * e,
    shield: live.shield * e,
    heat: live.heat * e,
    throttle: live.throttle * e,
    speed: live.speed * e,
    alt: live.alt * e,
    missiles: Math.floor(live.missiles * e),
    mines: Math.floor(live.mines * e),
    hold: live.hold * e,
    roll: live.roll + f * f * 14,
    pitch: live.pitch * e + f * 0.4,
    blips: e > 0.6 ? live.blips : [],
    target: e > 0.8 ? live.target : null,
  }
}

/** ore in the laser's reach (in place of the screen's own while nothing is in the sights): its icon and name, the cut's bar, what is left */
function ore(g: Glass, s: CockpitScreen, live: CockpitLive, unit: number) {
  const o = live.ore!
  setTextUnit(unitFor(s, unit))
  const th = textHeight()
  const u = th / 5
  // its icon and name along the top
  let x = s.x + 3
  if (o.icon) {
    for (let i = 0; i < o.icon.px.length; i++) if (o.icon.px[i]) g.put(x + (i % o.icon.w), s.y + 3 + Math.floor(i / o.icon.w), o.icon.px[i])
    x += o.icon.w + 2
  }
  const name = textWidth(o.name) <= s.x + s.w - 2 - x ? o.name : o.name.slice(0, 3)
  drawText(g.fb, g.W, g.y1, x, s.y + 3 + ((9 - th) >> 1), name, o.light, 0)
  // the cut's bar, large, its ticks a unit each; white as a cut breaks free
  const bx = s.x + 3
  const bw = s.w - 6
  const bh = Math.max(4, Math.round(s.h * 0.2))
  const by = s.y + s.h - bh - 4 - th
  g.box(bx - 1, by - 1, bx + bw + 1, by + bh + 1, CRT[2])
  g.box(bx, by, bx + bw, by + bh, CRT[0])
  const blink = ((live.time * 20) | 0) % 2 === 0
  if (o.freed && blink) g.box(bx, by, bx + bw, by + bh, WHITE)
  else {
    const fill = Math.round(bw * o.cut)
    g.box(bx, by, bx + fill, by + bh, o.cols[1])
    g.box(bx, by, bx + fill, by + Math.max(1, bh >> 2), o.light)
    if (o.on && fill > 0) g.box(bx + fill - 1, by, bx + fill, by + bh, WHITE)
    for (let i = 1; i < o.batch; i++)
      g.box(bx + Math.round((bw * i) / o.batch), by, bx + Math.round((bw * i) / o.batch) + 1, by + bh, CRT[1])
  }
  // under it: what the cut frees, and what is left (amber when little is)
  const yields = `+${o.batch}`
  drawText(g.fb, g.W, g.y1, bx, by + bh + 2 + u, yields, o.light, 0)
  const left = `${o.left}/${o.stock}`
  drawText(g.fb, g.W, g.y1, bx + bw - textWidth(left), by + bh + 2 + u, left, o.left <= o.batch * 2 ? AMBER : CRT[4], 0)
  // (a pulse in the middle while the beam is on)
  if (o.on) {
    const py = by - 3 - u
    const n = Math.max(1, Math.floor(bw / 4))
    const head = Math.floor(live.time * 14) % n
    for (let i = 0; i < n; i++) g.box(bx + i * 4, py, bx + i * 4 + 2, py + 1, i === head ? WHITE : CRT[3])
  }
}

/** the screen that shows ore in reach: the target's while nothing is in the sights, else the hold's, the nav's or the attitude's */
const ORE_SCREENS = ['target', 'cargo', 'nav', 'attitude']

/** dark glass first, then the screen's own instrument, then the glass's shine over it */
export function drawScreens(
  fb: Uint32Array,
  W: number,
  H: number,
  screens: CockpitScreen[],
  ox: number,
  oy: number,
  live: CockpitLive,
  unit: number,
) {
  const g = new Glass(fb, W)
  // (the throttle's lever and the speed go on one screen of every cockpit: its own for them if it has one, or else the
  // weapons', or else hull and shield's)
  const lever = screens.some((s) => s.kind === 'nav')
    ? null
    : (screens.find((s) => s.kind === 'weapons') ?? screens.find((s) => s.kind === 'status') ?? null)
  // (a target picked: the target screen says what it is, or with none the nav screen, or hull and shield's, or the weapons')
  const pickedOn = live.picked
    ? (['target', 'nav', 'status', 'weapons'].map((k) => screens.find((s) => s.kind === k)).find((s) => !!s) ?? null)
    : null
  // (the cruise drive's readout goes on the nav screen, or the one with the throttle's lever, or the attitude's: not the
  // one saying what the target is)
  const cruiseOn = live.cruise
    ? ([screens.find((s) => s.kind === 'nav'), lever, screens.find((s) => s.kind === 'attitude'), ...screens].find(
        (s) => !!s && s !== pickedOn,
      ) ?? null)
    : null
  const oreOn =
    live.ore && !live.target && !live.picked ? (ORE_SCREENS.map((k) => screens.find((s) => s.kind === k)).find((s) => !!s) ?? null) : null
  for (const [i, raw] of screens.entries()) {
    const s = { ...raw, x: raw.x + ox, y: raw.y + oy }
    g.at(s.x, s.y, s.w, s.h, H)
    if (g.x1 <= g.x0 || g.y1 <= g.y0) continue
    // (each screen wakes in its turn as the power comes up, from a twelfth of the way to two thirds)
    const from = 0.08 + (screens.length > 1 ? (i / (screens.length - 1)) * 0.55 : 0)
    const lit = (live.power - from) / BOOT
    const wake = clamp((live.power - from - BOOT) / WAKE, 0, 1)
    const lv = wake < 1 ? waking(live, wake) : live
    if (lit <= 0) dark(g, s)
    else if (lit < 1) boot(g, s, live, lit, i)
    else {
      if (s.kind !== 'attitude' || raw === oreOn)
        for (let y = s.y; y < s.y + s.h; y++) g.box(s.x, y, s.x + s.w, y + 1, CRT[(y & 1) === 0 ? 0 : 1])
      switch (raw === oreOn ? 'ore' : raw === pickedOn ? 'target' : s.kind) {
        case 'ore':
          ore(g, s, lv, unit)
          break
        case 'radar':
          radar(g, s, lv)
          break
        case 'attitude':
          attitude(g, s, lv)
          break
        case 'status':
          status(g, s, lv, raw === lever, unit)
          break
        case 'weapons':
          weapons(g, s, lv, unit, raw === lever)
          break
        case 'nav':
          nav(g, s, lv, unit)
          break
        case 'target':
          target(g, s, lv, unit)
          break
        case 'cargo':
          cargo(g, s, lv, unit)
          break
      }
      if (raw === cruiseOn) cruise(g, s, lv, unit)
    }
    // the glass: shaded under its rim, a slanting shine across it
    for (let y = 0; y < s.h; y++)
      for (let x = 0; x < s.w; x++) {
        if (y < 1 || x < 1) g.tint(s.x + x, s.y + y, BLACK, 110)
        else {
          const d = x + y * 0.9 - s.w * 0.34
          if (d > 0 && d < s.w * 0.14) g.tint(s.x + x, s.y + y, WHITE, 18)
        }
      }
  }
  setTextUnit(1)
}
