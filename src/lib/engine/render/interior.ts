// How the places inside are drawn (sim/interior.ts is what happens there): tile rooms seen from
// overhead and a little from the front, the camera pulled in as on foot, built towards the mockups
// art/mockups/room-*.png (the polish pass, item 7). Each room is laid down once (`bake`): its floors
// (the image model's plates, each kind of room its own), lit by its lamps in warm pools that fall away
// in dithered steps, darker along the walls; its walls with depth (a back wall shows its face, a
// tile and a half tall, panels and a lit rim; any other wall its dark top with a pale edge); and what
// hangs on the walls' faces (doors, lamps, portholes, screens, charts, pipes). Then, every frame, the
// props and furniture stand on the floor, each with its foot on its tile and a shadow under it, lit as
// the floor round it is and hiding whoever is behind it; in the hangar the pilot's own ship (drawn from
// its larger build); then the pilots; and over it all the words of what Use would do here.

import { artOf, blockOf, FIT, PROPS, SPOT_IN_FLIGHT, SPOT_WORDS, TILE } from '../data/interiors'
import { clearWidth, fitLines } from './hud'
import { hangarShip } from '../sim/interior'
import { FLOORS, PROPS as PROP_ART, WALLS } from '../interior/art'
import { DOOR, FLOOR, tileAt, VOID, WALL, wallJoin } from '../interior/rooms'
import type { Room } from '../interior/rooms'
import { pixelsOf } from '../space/pictures'
import type { Pixels } from '../space/pictures'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp } from '../util/math'
import type { Frame } from './frame'
import { drawText, textWidth } from './font'
import { drawJet } from './jet'
import type { Craft } from './jet'
import { drawWalker } from './walker'
import { drawUpHud, outsideOf, shakeOf, UP_HUD_BOTTOM } from './upflight'

const BLACK = pack(6, 7, 12)
const INK = pack(240, 236, 220)
const KEY = pack(255, 214, 96)
const SHADE = pack(0, 0, 0)
const GOOD = pack(110, 255, 140)
const BAD = pack(255, 80, 70)
// the light of the lamps, warm
const WARM = pack(255, 196, 120)
/** a back wall's face: px tall (it stands a tile and a half: half a tile over the row behind it), and its lit rim over it */
const FACE = 12
const RIM = 2

/** the depth (into the view) of a row of the room: nearer the bottom of the screen is nearer */
const depthOf = (scene: SceneState, y: number) => -(y - scene.view.y)

/** a room laid down: its picture and the depth of each pixel (walls' faces hide what is behind them), and the light on its floor (128 as it is) */
interface Baked {
  w: number
  h: number
  px: Uint32Array
  /** the row each pixel stands at (its foot), for depth: 1e9 for the floor */
  foot: Float32Array
  light: Uint8Array
  /** a ship's rooms: for each px outside the hull, how near it is to it (1 … 9; 0 inside it) */
  out: Uint8Array
}
const baked = new WeakMap<Room, Baked>()

/** the light falling on the room: its lamps (on the walls, and props that glow), and pools from the ceiling in a big room */
function lightOf(r: Room, RW: number, RH: number) {
  const L = new Float32Array(RW * RH)
  const pool = (x: number, y: number, rad: number, k: number) => {
    const x0 = Math.max(0, Math.floor(x - rad))
    const x1 = Math.min(RW - 1, Math.ceil(x + rad))
    const y0 = Math.max(0, Math.floor(y - rad * 0.8))
    const y1 = Math.min(RH - 1, Math.ceil(y + rad * 0.8))
    for (let yy = y0; yy <= y1; yy++)
      for (let xx = x0; xx <= x1; xx++) {
        const dx = (xx - x) / rad
        const dy = (yy - y) / (rad * 0.8)
        const d = dx * dx + dy * dy
        if (d < 1) L[yy * RW + xx] += k * (1 - d) * (1 - d * 0.5)
      }
  }
  for (const d of r.decor) {
    const k = PROPS[d.id]?.light ?? 0
    if (k > 0) pool(d.x, (d.ty + 1) * TILE + 9, 26, 0.55 * k)
  }
  for (const p of r.props) {
    const k = PROPS[p.id]
    if (!k?.light) continue
    const [bw, bd] = blockOf(k, p.face)
    pool((p.x + bw / 2) * TILE, (p.y + 1 - bd / 2) * TILE, 14 + Math.max(bw, bd) * 6, 0.45 * k.light)
  }
  // (the hangar and the deck are lit from above as well, in rows of pools; a ship's rooms each from the middle of its ceiling)
  if (r.kind !== 'ship')
    for (let ty = 4; ty < r.h - 1; ty += 6) for (let tx = 4; tx < r.w - 1; tx += 7) pool(tx * TILE, ty * TILE, 34, 0.45)
  for (const room of r.rooms) {
    const n = Math.max(1, Math.round(r.w / 9))
    for (let i = 0; i < n; i++) pool(((i + 0.5) / n) * r.w * TILE, ((room.y0 + room.y1 + 1) / 2) * TILE, 22 + (room.y1 - room.y0) * 3, 0.42)
  }
  return L
}

/** lays the room down: floor, walls and what is on them, lit */
/** the hangar's floor at a px (it wraps): what a ship's rooms are seen standing on */
function hangarFloor(x: number, y: number) {
  const fl = pixelsOf(FLOORS['floor-hangar'])
  return fl.px[(((y % fl.h) + fl.h) % fl.h) * fl.w + (((x % fl.w) + fl.w) % fl.w)]
}

function bake(r: Room): Baked {
  let b = baked.get(r)
  if (b) return b
  const RW = r.w * TILE
  const RH = r.h * TILE
  const px = new Uint32Array(RW * RH)
  const foot = new Float32Array(RW * RH).fill(1e9)
  const light = new Uint8Array(RW * RH).fill(128)
  const out = new Uint8Array(RW * RH)
  const floors = r.floors.map((f) => pixelsOf(FLOORS[f] ?? FLOORS['floor-ship']))
  const wall = pixelsOf(WALLS[r.wall] ?? WALLS['wall-ship'])
  const top = pixelsOf(FLOORS.walltop ?? FLOORS['floor-hangar'])
  const L = lightOf(r, RW, RH)
  // how near a pixel of floor is to a wall (they darken the floor along their foot)
  const near = (x: number, y: number) => {
    let d = 9
    for (let s = 1; s <= 5; s++) {
      for (const [dx, dy] of [
        [0, -s],
        [-s, 0],
        [s, 0],
        [0, s],
      ]) {
        const t = tileAt(r, Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE))
        if (t === WALL || t === VOID) d = Math.min(d, s)
      }
      if (d < 9) break
    }
    return d
  }
  // how near a px outside a ship's hull is to it (its shadow on the hangar's floor)
  const hull = (x: number, y: number) => {
    for (let s = 1; s <= 6; s++)
      for (const [dx, dy] of [
        [0, -s],
        [-s, 0],
        [s, 0],
        [0, s],
      ]) {
        const t = tileAt(r, Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE))
        if (t !== VOID) return s
      }
    return 9
  }
  for (let y = 0; y < RH; y++) {
    const ty = Math.floor(y / TILE)
    for (let x = 0; x < RW; x++) {
      const tx = Math.floor(x / TILE)
      const t = tileAt(r, tx, ty)
      const at = y * RW + x
      if (t === VOID) {
        // (round a ship's rooms: the hangar's floor it stands on, dim, darker in its shadow by the hull; polish step 9: it had
        // been black, the rooms small in a frame of nothing)
        if (r.kind === 'ship') {
          const d = hull(x, y)
          out[at] = d
          px[at] = shade(hangarFloor(x, y), d < 6 ? 0.2 + d * 0.035 : 0.42)
        } else px[at] = BLACK
        continue
      }
      if (t === FLOOR || t === DOOR) {
        const fl = floors[r.floorOf[ty * r.w + tx]] ?? floors[0]
        let c = fl.px[(y % fl.h) * fl.w + (x % fl.w)]
        // lit: the lamps' pools in steps, dithered where one step meets the next; dark along the walls; a doorway darker
        const d = near(x, y)
        let l = 0.56 + L[at] - (d < 5 ? (5 - d) * 0.06 : 0) - (t === DOOR ? 0.25 : 0)
        l = clamp(l, 0.3, 1.25)
        const step = l * 6
        const lo = Math.floor(step)
        const frac = step - lo
        const q = (lo + (BAYER[((y & 3) << 2) | (x & 3)] < frac * 16 ? 1 : 0)) / 6
        light[at] = clamp(Math.round(q * 128), 0, 255)
        c = shade(c, q)
        px[at] = c
        continue
      }
      // a wall: its dark top, with a pale edge where it meets the room
      let c = top.px[(y % top.h) * top.w + (x % top.w)]
      c = blend(c, BLACK, 110)
      const lx = x - tx * TILE
      const ly = y - ty * TILE
      const j = wallJoin(r, tx, ty)
      // (a lit rim along each side open to the room, and at each inner corner where a stepped outline turns)
      const edge =
        (lx === 0 && j.w) ||
        (lx === TILE - 1 && j.e) ||
        (ly === TILE - 1 && j.s) ||
        (ly === 0 && j.n) ||
        (lx === TILE - 1 && ly === TILE - 1 && j.se) ||
        (lx === 0 && ly === TILE - 1 && j.sw) ||
        (lx === TILE - 1 && ly === 0 && j.ne) ||
        (lx === 0 && ly === 0 && j.nw)
      const outer = (lx === 0 && j.outW) || (lx === TILE - 1 && j.outE) || (ly === 0 && j.outN)
      px[at] = edge ? blend(c, INK, 90) : outer ? blend(c, INK, 40) : c
    }
  }
  // the back walls' faces: a wall with floor (or a doorway) in front of it shows its face, standing over the row behind it
  for (let ty = 0; ty < r.h; ty++)
    for (let tx = 0; tx < r.w; tx++) {
      const t = tileAt(r, tx, ty)
      const below = tileAt(r, tx, ty + 1)
      if (t !== WALL || (below !== FLOOR && below !== DOOR)) continue
      const base = (ty + 1) * TILE
      for (let k = 0; k < FACE + RIM; k++) {
        const y = base - 1 - k
        if (y < 0) break
        for (let lx = 0; lx < TILE; lx++) {
          const x = tx * TILE + lx
          const at = y * RW + x
          let c: number
          if (k < FACE) {
            c = wall.px[(FACE - 1 - k) * wall.w + (x % wall.w)]
            // (the face falls into shadow towards its foot, and is lit along its top)
            if (k < 2) c = blend(c, SHADE, 90)
          } else c = blend(top.px[(y % top.h) * top.w + (x % top.w)], INK, k === FACE + RIM - 1 ? 110 : 60)
          px[at] = c
          foot[at] = base
        }
      }
    }
  // what hangs on the faces: each picture's foot on its wall's foot, centred where it goes
  for (const d of r.decor) {
    const kind = PROPS[d.id]
    const art = kind && PROP_ART[kind.art]
    if (!art) continue
    const p = pixelsOf(art)
    const base = (d.ty + 1) * TILE
    // (a door stands on the floor; the rest hang a little up the wall)
    const lift = d.id === 'door' ? 0 : Math.max(1, Math.round((FACE - p.h) / 2))
    const x0 = Math.round(d.x - p.w / 2)
    const y0 = base - lift - p.h
    for (let yy = 0; yy < p.h; yy++)
      for (let xx = 0; xx < p.w; xx++) {
        const c = p.px[yy * p.w + xx]
        const x = x0 + xx
        const y = y0 + yy
        if (!c || x < 0 || y < 0 || x >= RW || y >= RH) continue
        px[y * RW + x] = c
        // (a doorway is walked through: nothing hides behind its picture)
        foot[y * RW + x] = d.id === 'door' ? 1e9 : base
      }
  }
  b = { w: RW, h: RH, px, foot, light, out }
  baked.set(r, b)
  return b
}

/** a colour in the light: 0.5 is as drawn; less darker and cooler, more brighter and warmer */
function shade(c: number, q: number) {
  if (q < 0.6) return blend(c, pack(10, 8, 24), Math.round((0.6 - q) * 260))
  if (q > 0.7) return blend(c, WARM, Math.min(110, Math.round((q - 0.7) * 220)))
  return c
}

/** a picture's pixel into the frame at (x, y) if nothing nearer is there */
function put(f: Frame, x: number, y: number, col: number, V: number) {
  if (x < 0 || y < 0 || x >= f.w || y >= f.h || col === 0) return
  const at = y * f.w + x
  if (f.zbuf[at] < V) return
  f.fb[at] = col
  f.zbuf[at] = V
}

/** a prop's picture with its foot (bottom middle of its first tile row) at room px, lit by `q` (0.5 as drawn) */
function drawPicture(scene: SceneState, f: Frame, p: Pixels, left: number, foot: number, V: number, k = 256, q = 0.64) {
  const v = scene.view
  const x0 = Math.round(v.cx + left - v.x)
  const y0 = Math.round(v.cy + foot - v.y) - p.h
  for (let r = 0; r < p.h; r++)
    for (let c = 0; c < p.w; c++) {
      let col = p.px[r * p.w + c]
      if (!col) continue
      if (q < 0.6 || q > 0.74) col = shade(col, 0.64 + (q - 0.64) * 0.6)
      if (k < 256) {
        const x = x0 + c
        const y = y0 + r
        if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue
        f.fb[y * f.w + x] = blend(f.fb[y * f.w + x], col, k)
      } else put(f, x0 + c, y0 + r, col, V)
    }
}

/** a soft shadow on the floor under a prop standing there */
function shadowUnder(scene: SceneState, f: Frame, left: number, right: number, foot: number) {
  const v = scene.view
  const y = Math.round(v.cy + foot - v.y)
  for (let dy = -2; dy <= 0; dy++)
    for (let x = Math.round(v.cx + left - v.x) + 1; x < Math.round(v.cx + right - v.x) - 1; x++) {
      const yy = y + dy
      if (x < 0 || yy < 0 || x >= f.w || yy >= f.h) continue
      if (dy === -2 && (x & 1) === 1) continue
      const at = yy * f.w + x
      f.fb[at] = blend(f.fb[at], SHADE, dy === 0 ? 70 : 100)
    }
}

/** the room's floor, walls and what is on them, as laid down */
function drawRoom(scene: SceneState, f: Frame, r: Room) {
  const b = bake(r)
  const v = scene.view
  const { w: W, h: H, fb, zbuf } = f
  const ox = Math.round(v.x - v.cx)
  const oy = Math.round(v.y - v.cy)
  const ship = r.kind === 'ship'
  // (in flight, round the rooms the outside goes by: render/upflight.ts)
  const outside = scene.interior.flying && ship ? outsideOf(scene) : null
  const mx = b.w / 2
  const my = b.h / 2
  for (let y = 0; y < H; y++) {
    const ry = y + oy
    for (let x = 0; x < W; x++) {
      const rx = x + ox
      const at = y * W + x
      if (rx < 0 || ry < 0 || rx >= b.w || ry >= b.h) {
        fb[at] = outside ? outside(rx - mx, ry - my, 9, x, y) : ship ? shade(hangarFloor(rx, ry), 0.42) : BLACK
        zbuf[at] = 1e9
        continue
      }
      const i = ry * b.w + rx
      fb[at] = outside && b.out[i] ? outside(rx - mx, ry - my, b.out[i], x, y) : b.px[i]
      const ft = b.foot[i]
      zbuf[at] = ft >= 1e9 ? 1e9 : depthOf(scene, ft)
    }
  }
}

/** how the floor is lit at a room px (0.5 as drawn) */
function lightAt(r: Room, x: number, y: number) {
  const b = bake(r)
  const xx = clamp(Math.round(x), 0, b.w - 1)
  const yy = clamp(Math.round(y), 0, b.h - 1)
  return b.light[yy * b.w + xx] / 128
}

/** where each of `out` px along comes from in a picture `n` px along, `extra` px of a plain 8 px band put in near each
 * end (at `inset` from it), half at each: a bay's markings made longer or wider, its corners, edges and middle kept */
function stretched(n: number, out: number, inset: number) {
  const extra = out - n
  const first = Math.floor(extra / 16) * 8
  const second = extra - first
  const at = new Int32Array(out)
  const b = n - inset - 8
  for (let x = 0; x < out; x++) {
    if (x < inset) at[x] = x
    else if (x < inset + first) at[x] = inset + ((x - inset) % 8)
    else if (x < b + first) at[x] = x - first
    else if (x < b + first + second) at[x] = b + ((x - b - first) % 8)
    else at[x] = x - extra
  }
  return at
}

const grown = new Map<string, Pixels>()
/** a flat picture made `w` × `h` px by repeating bands of it (the hangar's bay round a larger ship): never scaled */
function grownTo(p: Pixels, key: string, w: number, h: number): Pixels {
  if (w <= p.w && h <= p.h) return p
  const k = `${key}:${w}:${h}`
  let got = grown.get(k)
  if (!got) {
    const xs = stretched(p.w, Math.max(w, p.w), 24)
    const ys = stretched(p.h, Math.max(h, p.h), 24)
    const W = xs.length
    const H = ys.length
    const px = new Uint32Array(W * H)
    const idx = new Uint8Array(W * H)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        px[y * W + x] = p.px[ys[y] * p.w + xs[x]]
        idx[y * W + x] = p.idx[ys[y] * p.w + xs[x]]
      }
    got = { w: W, h: H, px, idx, colours: p.colours }
    grown.set(k, got)
  }
  return got
}

/** the props of the room, each with its foot on its tile */
function drawProps(scene: SceneState, f: Frame, r: Room) {
  // (rugs first: they lie under everything)
  for (const flat of [true, false])
    for (const p of r.props) {
      const kind = PROPS[p.id]
      if (!kind || kind.wall || !!kind.flat !== flat) continue
      const art = PROP_ART[artOf(kind, p.face)]
      if (!art) continue
      // (one the layout sizes, the hangar's bay round its ship: its picture grown to that size by repeating its plates)
      const px = p.w && p.h ? grownTo(pixelsOf(art), p.id, p.w * TILE, p.h * TILE) : pixelsOf(art)
      const bw = (p.w ?? blockOf(kind, p.face)[0]) * TILE
      const left = p.x * TILE + Math.round((bw - px.w) / 2)
      const foot = (p.y + 1) * TILE
      const q = kind.light ? 0.64 : lightAt(r, p.x * TILE + bw / 2, foot - 2)
      if (!flat) shadowUnder(scene, f, left, left + px.w, foot)
      drawPicture(scene, f, px, left, foot, flat ? 1e8 : depthOf(scene, foot), 256, q)
    }
}

/** the room's words: what Use would do, the room's name, placing a piece */
function drawWords(scene: SceneState, f: Frame) {
  const it = scene.interior
  const r = it.room!
  const key = scene.params.useKey
  const W = f.w
  const H = f.h
  // the room's name, top left
  const j = it.me.jet
  const ty = Math.floor(j.y / TILE)
  const here =
    r.kind === 'hangar'
      ? 'HANGAR'
      : r.kind === 'deck'
        ? 'STATION DECK'
        : (r.rooms.find((x) => ty >= x.y0 - 1 && ty <= x.y1)?.name ?? 'ABOARD')
  drawText(f.fb, W, H, 4, 4, here, INK, SHADE)
  let line = ''
  // (in flight, a spot that does nothing then says why, without a key: the hatch is sealed)
  const still = it.flying && it.spot ? SPOT_IN_FLIGHT[it.spot] : ''
  if (it.placing) line = it.placing.ok ? `[${key}] PLACE IT HERE` : it.placing.why || 'NO ROOM HERE'
  else if (still) line = still
  else if (it.spot) line = `[${key}] ${SPOT_WORDS[it.spot]}`
  if (!line) return
  // (above the line of help along the page's bottom edge; broken into lines where the frame is too narrow for it)
  const lines = fitLines(line, clearWidth(scene))
  // (where he stands on the screen: by the hangar's way out, at the bottom, the line was written over him; then it goes
  // over his head instead)
  const feet = Math.round(j.y - scene.view.y + H / 2)
  const low = H - 24 - (lines.length - 1) * 10
  // (up in flight, not where it would run into the lines of the outside top left: render/upflight.ts UP_HUD_BOTTOM)
  const top = it.flying ? UP_HUD_BOTTOM : 0
  const over = feet > low - 6 && feet - 22 < H - 16 && feet - 34 - (lines.length - 1) * 10 >= top
  for (const [i, said] of lines.entries()) {
    const w = textWidth(said)
    const x = (W - w) >> 1
    const y = (over ? feet - 34 - (lines.length - 1) * 10 : low) + i * 10
    for (let yy = y - 2; yy < y + 8; yy++)
      for (let xx = x - 3; xx < x + w + 3; xx++)
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) f.fb[yy * W + xx] = blend(f.fb[yy * W + xx], SHADE, 150)
    drawText(f.fb, W, H, x, y, said, it.placing ? (it.placing.ok ? GOOD : BAD) : KEY, SHADE)
  }
}

/** a frame of the place inside */
export function renderInterior(scene: SceneState) {
  const f = scene.screen
  const it = scene.interior
  const r = it.room
  const v = scene.view
  if (!r || f.w === 0) return
  // the camera overhead, not turned, flat: on the pilot, held so the room fills the frame where it can; a room seen whole
  // (the hangar, the deck) sits in the middle, below the margin left for the page's row of buttons
  const RW = r.w * TILE
  const RH = r.h * TILE
  const me = it.me.jet
  const top = r.kind === 'ship' ? 0 : FIT.top
  v.x = RW <= f.w ? RW / 2 : clamp(me.x, f.w / 2, RW - f.w / 2)
  v.y = RH + top <= f.h ? (RH - top) / 2 : RH <= f.h ? RH / 2 : clamp(me.y, f.h / 2 - FACE, RH - f.h / 2)
  v.x = Math.round(v.x)
  v.y = Math.round(v.y)
  // (up out of his seat in flight, a hit on the ship throws the rooms about: render/upflight.ts)
  if (it.flying) {
    const sh = shakeOf(scene)
    v.x += sh.x
    v.y += sh.y
  }
  v.alt = 0
  v.yaw = 0
  v.cos = 1
  v.sin = 0
  v.q = 0
  v.tan = 1
  v.scale = 1
  v.cx = f.w >> 1
  v.cy = f.h >> 1
  v.roll = 0
  v.lift = 0
  v.chase = 0
  v.cockpit = 0
  v.jetFade = 1
  v.under = true
  f.colLo = 0
  f.colHi = f.w
  f.rowLo = 0
  f.rowHi = f.h
  scene.flames.count = 0
  drawRoom(scene, f, r)
  drawProps(scene, f, r)
  // the piece being placed: its footprint's tiles marked (green where it can stand, red where not), its picture faint over them
  if (it.placing) {
    const kind = PROPS[it.placing.id]
    const art = kind && PROP_ART[artOf(kind, it.placing.face)]
    if (kind) {
      const [bw, bd] = blockOf(kind, it.placing.face)
      const x0 = Math.round(v.cx + it.placing.x * TILE - v.x)
      const y0 = Math.round(v.cy + (it.placing.y - bd + 1) * TILE - v.y)
      const col = it.placing.ok ? GOOD : BAD
      for (let y = y0; y < y0 + bd * TILE; y++)
        for (let x = x0; x < x0 + bw * TILE; x++) {
          if (x < 0 || y < 0 || x >= f.w || y >= f.h) continue
          const edge = x === x0 || y === y0 || x === x0 + bw * TILE - 1 || y === y0 + bd * TILE - 1
          f.fb[y * f.w + x] = blend(f.fb[y * f.w + x], col, edge ? 200 : 50)
        }
    }
    if (art) {
      const px = pixelsOf(art)
      const left = it.placing.x * TILE + Math.round((blockOf(kind, it.placing.face)[0] * TILE - px.w) / 2)
      drawPicture(scene, f, px, left, (it.placing.y + 1) * TILE, 0, it.placing.ok ? 170 : 90)
    }
  }
  // his ship on show in the hangar, from its larger build (the size of its own rooms beside him)
  if (r.ship) {
    const { mesh, paint } = hangarShip(scene)
    const craft: Craft = {
      jet: it.shown,
      mesh,
      paint,
      flameLen: 0,
      burn: 0,
      boost: 0,
      bend: 0,
      arch: 0,
      fade: 1,
      intro: 99,
      seed: 0,
      outline: 0,
    }
    // (its shadow on the floor under it)
    const m = mesh.model
    const sx = Math.round(v.cx + it.shown.x - v.x)
    const sy = Math.round(v.cy + it.shown.y - v.y)
    const hw = m.w * 0.42
    const hl = m.l * 0.44
    for (let y = Math.floor(sy - hl); y <= sy + hl + 3; y++)
      for (let x = Math.floor(sx - hw); x <= sx + hw; x++) {
        const dx = (x - sx) / hw
        const dy = (y - sy - 3) / hl
        if (dx * dx + dy * dy > 1 || x < 0 || y < 0 || x >= f.w || y >= f.h) continue
        f.fb[y * f.w + x] = blend(f.fb[y * f.w + x], SHADE, 80)
      }
    drawJet(scene, f, craft)
  }
  for (const vis of it.visitors) drawWalker(scene, f, vis.walker, false)
  drawWalker(scene, f, it.me, true)
  drawWords(scene, f)
  if (it.flying) drawUpHud(scene, f)
}
