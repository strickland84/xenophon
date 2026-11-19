// The rooms of the places inside, as tiles: the hangar and the station deck from their layouts
// (data/interiors.ts), and a ship's rooms worked out from its hull's own shape seen from above, so
// a ship's inside matches its outside: a light fighter has a cockpit and a cabin at most; a hauler or
// a freighter a row of rooms front to back (the cockpit, a map room, crew quarters, a cargo bay, the
// engine room), each with its own floor, the things on its back wall, and its fit-out (shipKit: the
// furniture a new ship comes with, which its pilot moves from there).

import { bayFor, blockOf, DECK, hangarLayout, PROPS, ROOM_KINDS, SHIP_ROOMS, SHIP_SCALE, TILE } from '../data/interiors'
import type { Face, Layout, Piece, RoomKind, SpotId, Where } from '../data/interiors'
import { bigHullOf, decodeHull, DEFAULT_HULL, hullOf } from '../jet/model'

export const VOID = 0
export const FLOOR = 1
export const WALL = 2
export const DOOR = 3

export type Place = 'hangar' | 'deck' | 'ship'

export interface RoomProp {
  id: string
  /** the tile its foot stands on, left (x) and front (y) */
  x: number
  y: number
  /** placed by the pilot (a ship's furniture), not part of the room */
  placed: boolean
  /** the way it faces into the room (from the wall behind it: faceFor) */
  face: Face
  /** tiles across and deep, where the layout gives it a size of its own (the hangar's bay, sized to its ship) */
  w?: number
  h?: number
}

/** a thing on a wall's face: its picture, its middle (px across), and the wall's row of tiles */
export interface Decor {
  id: string
  x: number
  ty: number
}

export interface Room {
  kind: Place
  /** tiles across and down, and each one: VOID, FLOOR, WALL or DOOR */
  w: number
  h: number
  tiles: Uint8Array
  /** each tile's floor (an index into `floors`) */
  floorOf: Uint8Array
  floors: string[]
  wall: string
  /** what hangs on the walls' faces */
  decor: Decor[]
  props: RoomProp[]
  /** what can be used where (px) */
  spots: { id: SpotId; x: number; y: number }[]
  /** the pilot's ship on show (the hangar): its middle (px) */
  ship: { x: number; y: number } | null
  /** where a pilot comes in (px) */
  start: { x: number; y: number }
  /** a ship's rooms, front to back: its kind and name, its first and last row of floor */
  rooms: { kind: RoomKind; name: string; y0: number; y1: number }[]
  /** the hull a ship's rooms were worked out from ('' none) */
  hull: string
}

/** a room from a layout drawn by hand */
function fromLayout(kind: Place, l: Layout): Room {
  const h = l.tiles.length
  const w = l.tiles[0].length
  const tiles = new Uint8Array(w * h)
  // (a walkway painted on the floor is floor of the second kind)
  const floorOf = new Uint8Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = l.tiles[y][x]
      tiles[y * w + x] = c === '#' ? WALL : c === '.' || c === 'L' ? FLOOR : c === 'D' ? DOOR : VOID
      if (c === 'L' && l.lane) floorOf[y * w + x] = 1
    }
  const spots = l.spots.map((s) => ({ id: s.id, x: s.x * TILE, y: s.y * TILE }))
  const enter = spots.find((s) => s.id === (kind === 'deck' ? 'hangar' : 'out'))!
  // (each thing on the back wall: its row is the last wall row before the floor)
  let back = 0
  while (back < h - 1 && !/[.L]/.test(l.tiles[back + 1])) back++
  const decor = l.decor.map((d) => ({ id: d.id, x: Math.round(d.x * TILE), ty: back }))
  // the doorways in the back wall: their doors
  for (let x = 0; x < w; x++)
    if (tiles[back * w + x] === DOOR && tiles[back * w + x + 1] === DOOR) decor.push({ id: 'door', x: (x + 1) * TILE, ty: back })
  return {
    kind,
    w,
    h,
    tiles,
    floorOf,
    floors: l.lane ? [l.floor, l.lane] : [l.floor],
    wall: l.wall,
    decor,
    props: [],
    spots,
    ship: l.ship
      ? { x: l.ship.x * TILE, y: l.ship.y * TILE }
      : kind === 'hangar'
        ? { x: (w * TILE) / 2, y: ((h - 1) * TILE) / 2 + TILE }
        : null,
    start: { x: enter.x, y: enter.y - TILE * 1.4 },
    rooms: [],
    hull: '',
  }
}

/** a room laid out by hand, its pieces facing as the walls behind them say */
function laidOut(kind: Place, l: Layout): Room {
  const r = fromLayout(kind, l)
  for (const p of l.props) r.props.push({ ...p, placed: false, face: (p as { face?: Face }).face ?? facing(r, p.id, p.x, p.y).face ?? 's' })
  return r
}

/** the hangar, laid out round the ship it holds (its larger build: data/interiors.ts bayFor, hangarLayout) */
export function hangarRoom(hull = DEFAULT_HULL) {
  const m = bigHullOf(hull)
  const bay = bayFor(m.w, m.l)
  const r = laidOut('hangar', hangarLayout(bay.across, bay.along))
  r.hull = m.name
  return r
}
export const deckRoom = () => laidOut('deck', DECK)

/** fills the gaps of a mask a tile wide: grown by a tile, then shrunk back */
function close(m: Uint8Array, W: number, H: number) {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : m[y * W + x])
  const grown = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) grown[y * W + x] = at(x, y) || at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) ? 1 : 0
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const g = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : grown[yy * W + xx])
      // (shrunk back only where the grown mask has an edge: the outline stays where it was)
      m[y * W + x] = g(x, y) && g(x - 1, y) && g(x + 1, y) && g(x, y - 1) && g(x, y + 1) ? 1 : m[y * W + x]
    }
}

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** the hull from above in tiles, mirrored and closed: 1 where it is */
function hullTiles(hull: string) {
  const m = hullOf(hull)
  const slices = decodeHull(m)
  const W = Math.ceil(m.w / SHIP_SCALE) + 2
  const H = Math.ceil(m.l / SHIP_SCALE) + 2
  const ox = (W * SHIP_SCALE - m.w) / 2
  const solid = new Uint8Array(W * H)
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      // (a tile is hull where most of its patch is)
      let n = 0
      let all = 0
      for (let dy = 0; dy < SHIP_SCALE; dy += 0.5)
        for (let dx = 0; dx < SHIP_SCALE; dx += 0.5) {
          all++
          const i = Math.floor(tx * SHIP_SCALE + dx - ox)
          const k = Math.floor((ty - 1) * SHIP_SCALE + dy)
          if (i < 0 || i >= m.w || k < 0 || k >= m.l) continue
          for (let y = 0; y < m.h; y++)
            if (slices[y][k * m.w + i]) {
              n++
              break
            }
        }
      solid[ty * W + tx] = n * 2 > all ? 1 : 0
    }
  // mirrored, so the rooms are as even as the ship, and its gaps closed (between prongs, round engines), so its rooms are whole
  for (let ty = 0; ty < H; ty++) for (let tx = 0; tx < W; tx++) if (solid[ty * W + (W - 1 - tx)]) solid[ty * W + tx] = 1
  close(solid, W, H)
  return { W, H, solid, name: m.name }
}

/**
 * A ship's rooms, from its hull's shape: its rooms one behind another down its length, each as wide as the hull is
 * there and even about its middle line, their sides stepping in and out at most a tile a row (so the walls run
 * straight or at an angle, as in the mockups), a wall a tile thick round them all, and nothing beyond.
 */
export function shipRoom(hull: string): Room {
  const { W, H, solid, name } = hullTiles(hull)
  const cx = Math.floor(W / 2)
  // how far out from the middle line each row could have floor: to a tile inside the hull's edge, where its middle is
  // hull (across any gap inside it, between engines or round a cockpit's glass, but not between prongs)
  const inner = (tx: number, ty: number) => {
    for (const [dx, dy] of [[0, 0], ...SIDES]) {
      const x = tx + dx
      const y = ty + dy
      if (x < 0 || y < 0 || x >= W || y >= H || !solid[y * W + x]) return false
    }
    return true
  }
  const half = new Int16Array(H)
  for (let ty = 1; ty < H - 1; ty++) {
    if (!solid[ty * W + cx - 1] || !solid[ty * W + cx]) continue
    let lo = W
    let hi = -1
    for (let tx = 0; tx < W; tx++)
      if (inner(tx, ty)) {
        lo = Math.min(lo, tx)
        hi = Math.max(hi, tx)
      }
    half[ty] = hi < 0 ? 0 : Math.max(0, Math.min(cx - lo, hi + 1 - cx))
  }
  // the floor runs from the first row a tile out each side (the cockpit's nose) to the last
  let top = 1
  while (top < H - 1 && half[top] < 1) top++
  let bottom = H - 2
  while (bottom > top && half[bottom] < 1) bottom--
  for (let ty = top; ty <= bottom; ty++) half[ty] = Math.max(1, half[ty])
  // (its sides step a tile a row at most: a narrow row narrows the rows round it)
  const width = Array.from(half)
  for (let pass = 0; pass < W; pass++)
    for (let ty = top; ty <= bottom; ty++) {
      const lim = Math.min(ty > top ? width[ty - 1] + 1 : 99, ty < bottom ? width[ty + 1] + 1 : 99)
      if (width[ty] > lim) width[ty] = lim
    }
  const tiles = new Uint8Array(W * H)
  for (let ty = top; ty <= bottom; ty++)
    for (let k = 0; k < Math.max(1, width[ty]); k++) tiles[ty * W + cx - 1 - k] = tiles[ty * W + cx + k] = FLOOR
  // a wall a tile thick round the floor, and nothing beyond it
  for (let ty = 0; ty < H; ty++)
    for (let tx = 0; tx < W; tx++) {
      if (tiles[ty * W + tx]) continue
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = tx + dx
          const y = ty + dy
          if (x >= 0 && y >= 0 && x < W && y < H && tiles[y * W + x] === FLOOR) tiles[ty * W + tx] = WALL
        }
    }
  // its rooms: as many of the hull's as fit (each needs its least rows of floor, and a wall between)
  const rows = bottom - top + 1
  const kinds = (SHIP_ROOMS[name] ?? ['cockpit', 'cabin']).slice()
  const need = (ks: RoomKind[]) => ks.reduce((n, k) => n + ROOM_KINDS[k].rows, 0) + ks.length - 1
  while (kinds.length > 1 && need(kinds) > rows) kinds.pop()
  // (the rows shared by weight, each getting its least first)
  const spare = rows - need(kinds)
  const weight = kinds.reduce((n, k) => n + ROOM_KINDS[k].weight, 0)
  const rooms: Room['rooms'] = []
  let y = top
  let given = 0
  for (let i = 0; i < kinds.length; i++) {
    const k = ROOM_KINDS[kinds[i]]
    const extra = i === kinds.length - 1 ? spare - given : Math.floor((spare * k.weight) / weight)
    given += extra
    const n = k.rows + extra
    rooms.push({ kind: kinds[i], name: k.name, y0: y, y1: y + n - 1 })
    y += n + 1
  }
  // a wall between each room and the next, with a doorway in the middle
  const floors = [...new Set(rooms.map((r) => ROOM_KINDS[r.kind].floor))]
  const floorOf = new Uint8Array(W * H)
  const decor: Decor[] = []
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i]
    const f = floors.indexOf(ROOM_KINDS[r.kind].floor)
    for (let ty = Math.max(0, r.y0 - 1); ty <= r.y1 + 1 && ty < H; ty++) for (let tx = 0; tx < W; tx++) floorOf[ty * W + tx] = f
    if (i === 0) continue
    const wy = r.y0 - 1
    for (let tx = 0; tx < W; tx++) if (tiles[wy * W + tx] === FLOOR) tiles[wy * W + tx] = WALL
    for (const tx of [cx - 1, cx]) tiles[wy * W + tx] = DOOR
    decor.push({ id: 'door', x: cx * TILE, ty: wy })
  }
  // the hatch: a doorway in the wall behind the last floor of the middle line
  let hatchY = bottom
  for (let ty = top; ty <= bottom; ty++) if (tiles[ty * W + cx] === FLOOR || tiles[ty * W + cx - 1] === FLOOR) hatchY = ty + 1
  for (const tx of [cx - 1, cx]) tiles[hatchY * W + tx] = DOOR
  // the things on each room's back wall: in turn along it, either side of its door, a lamp at each end
  for (const r of rooms) {
    const wy = r.y0 - 1
    const runs: [number, number][] = []
    let a = -1
    for (let tx = 0; tx <= W; tx++) {
      const face = tx < W && tiles[wy * W + tx] === WALL && tiles[(wy + 1) * W + tx] === FLOOR
      if (face && a < 0) a = tx
      if (!face && a >= 0) {
        runs.push([a, tx - 1])
        a = -1
      }
    }
    const want = ROOM_KINDS[r.kind].decor
    let n = 0
    for (const [ra, rb] of runs) {
      const len = rb - ra + 1
      if (len < 2) continue
      // (a lamp where the wall begins; then the room's own things every three tiles, lamps between)
      decor.push({ id: 'walllamp', x: Math.round((ra + 0.5) * TILE), ty: wy })
      for (let tx = ra + 2; tx + 1 <= rb; tx += 3) {
        decor.push({ id: n % 2 === 0 ? want[(n >> 1) % want.length] : 'walllamp', x: Math.round((tx + 0.5) * TILE), ty: wy })
        n++
      }
    }
  }
  // the fixtures: the flight console at the very front (the seat before it), the reactor in the middle of the engine room
  const props: RoomProp[] = [{ id: 'console', x: cx - 1, y: top + 1, placed: false, face: 's' }]
  const mid = cx * TILE
  const room: Room = {
    kind: 'ship',
    w: W,
    h: H,
    tiles,
    floorOf,
    floors,
    wall: 'wall-ship',
    decor,
    props,
    spots: [
      { id: 'seat', x: mid, y: (top + 2.5) * TILE },
      { id: 'hatch', x: mid, y: (hatchY + 0.4) * TILE },
    ],
    ship: null,
    start: { x: mid, y: (hatchY - 0.6) * TILE },
    rooms,
    hull: name,
  }
  const engine = rooms.find((r) => r.kind === 'engine')
  if (engine) {
    const at = middleOf(room, 'reactor', engine)
    if (at) props.push({ id: 'reactor', x: at.x, y: at.y, placed: false, face: 's' })
  }
  return room
}

/** the tile at (tx, ty) (VOID off the room) */
export const tileAt = (r: Room, tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= r.w || ty >= r.h ? VOID : r.tiles[ty * r.w + tx])

/**
 * A wall tile's join with what is round it (the walls' autotile): which of its sides open onto the room (floor or a
 * doorway: a lit rim there), which onto nothing (the dark outer edge), which of its corners open onto the room where both
 * sides beside that corner are wall (an inner corner, where a stepped outline turns: a rim's corner pixel), and whether
 * its face shows (floor below it). Every wall tile is drawn from this alone, so any outline joins cleanly.
 */
export function wallJoin(r: Room, tx: number, ty: number) {
  const open = (x: number, y: number) => {
    const t = tileAt(r, x, y)
    return t === FLOOR || t === DOOR
  }
  const solid = (x: number, y: number) => {
    const t = tileAt(r, x, y)
    return t === WALL || t === VOID
  }
  return {
    n: open(tx, ty - 1),
    s: open(tx, ty + 1),
    e: open(tx + 1, ty),
    w: open(tx - 1, ty),
    outN: tileAt(r, tx, ty - 1) === VOID,
    outE: tileAt(r, tx + 1, ty) === VOID,
    outW: tileAt(r, tx - 1, ty) === VOID,
    se: open(tx + 1, ty + 1) && solid(tx + 1, ty) && solid(tx, ty + 1),
    sw: open(tx - 1, ty + 1) && solid(tx - 1, ty) && solid(tx, ty + 1),
    ne: open(tx + 1, ty - 1) && solid(tx + 1, ty) && solid(tx, ty - 1),
    nw: open(tx - 1, ty - 1) && solid(tx - 1, ty) && solid(tx, ty - 1),
    face: open(tx, ty + 1),
  }
}

/** whether a prop's foot covers tile (tx, ty) */
export function propCovers(p: RoomProp, tx: number, ty: number) {
  const k = PROPS[p.id]
  if (!k || k.wall) return false
  const [bw, bd] = blockOf(k, p.face)
  return tx >= p.x && tx < p.x + bw && ty <= p.y && ty > p.y - bd
}

/** the tile in front of a piece, where a pilot stands to use it (its middle, a step out the way it faces) */
function frontOf(p: { x: number; y: number; face: Face }, bw: number, bd: number) {
  const mx = p.x + Math.floor((bw - 1) / 2)
  const my = p.y - Math.floor((bd - 1) / 2)
  return p.face === 's'
    ? { x: mx, y: p.y + 1 }
    : p.face === 'n'
      ? { x: mx, y: p.y - bd }
      : p.face === 'e'
        ? { x: p.x + bw, y: my }
        : { x: p.x - 1, y: my }
}

/** whether every tile of a row or column of the wall behind a piece is wall */
function backed(r: Room, face: Face, tx: number, ty: number, bw: number, bd: number) {
  const wall = (x: number, y: number) => tileAt(r, x, y) === WALL
  if (face === 's') {
    for (let x = tx; x < tx + bw; x++) if (!wall(x, ty - bd)) return false
  } else if (face === 'n') {
    for (let x = tx; x < tx + bw; x++) if (!wall(x, ty + 1)) return false
  } else for (let y = ty - bd + 1; y <= ty; y++) if (!wall(face === 'e' ? tx - 1 : tx + bw, y)) return false
  return true
}

/** why a piece's tiles, at its foot (tx, ty) as it faces, are not open floor ('' they are): walls, the ways through doorways, other pieces, the spots */
function blockedAt(r: Room, id: string, tx: number, ty: number, bw: number, bd: number): Refusal | '' {
  const k = PROPS[id]
  for (let x = tx; x < tx + bw; x++)
    for (let y = ty - bd + 1; y <= ty; y++) {
      if (tileAt(r, x, y) !== FLOOR) return 'OFF THE FLOOR'
      // (not in a doorway's way: the tiles before and after one, and beside it, are kept clear)
      if (tileAt(r, x, y - 1) === DOOR || tileAt(r, x, y + 1) === DOOR) return 'IN A DOORWAY'
      if (tileAt(r, x - 1, y) === DOOR || tileAt(r, x + 1, y) === DOOR) return 'IN A DOORWAY'
      if (!k.flat && r.props.some((p) => !PROPS[p.id]?.flat && propCovers(p, x, y))) return 'SOMETHING IS THERE'
      if (k.flat && r.props.some((p) => PROPS[p.id]?.flat && propCovers(p, x, y))) return 'SOMETHING IS THERE'
      if (r.spots.some((s) => Math.abs(s.x - (x + 0.5) * TILE) < TILE * 1.2 && Math.abs(s.y - (y + 0.5) * TILE) < TILE * 1.2))
        return 'IN THE WAY OF A STATION'
    }
  return ''
}

/** why a piece cannot stand somewhere (what the player is told while he places it) */
export type Refusal =
  'OFF THE FLOOR' | 'IN A DOORWAY' | 'SOMETHING IS THERE' | 'IN THE WAY OF A STATION' | 'NOT AGAINST A WALL' | 'IT WOULD BLOCK THE WAY'

/**
 * The way a piece would face standing with its foot at (tx, ty) (of the facings it has, in turn: s, e, w, n), its tiles
 * open and (built in) its back flush to a wall; or why it cannot stand there (no walkway check).
 */
function facing(r: Room, id: string, tx: number, ty: number, only?: Face[]): { face: Face | null; why: Refusal | '' } {
  const k = PROPS[id]
  if (!k || k.wall) return { face: null, why: 'OFF THE FLOOR' }
  let why: Refusal | '' = ''
  for (const face of k.faces) {
    if (only && !only.includes(face)) continue
    const [bw, bd] = blockOf(k, face)
    const blocked = blockedAt(r, id, tx, ty, bw, bd)
    if (blocked) {
      why ||= blocked
      continue
    }
    if (k.against && !backed(r, face, tx, ty, bw, bd)) {
      why = why && why !== 'NOT AGAINST A WALL' ? why : 'NOT AGAINST A WALL'
      continue
    }
    return { face, why: '' }
  }
  return { face: null, why: why || 'OFF THE FLOOR' }
}

/** the tiles a pilot can walk on (1): floor and doorways no piece stands on (a deck mat is walked on) */
export function openTiles(r: Room) {
  const open = new Uint8Array(r.w * r.h)
  for (let y = 0; y < r.h; y++)
    for (let x = 0; x < r.w; x++) {
      const t = tileAt(r, x, y)
      open[y * r.w + x] = (t === FLOOR || t === DOOR) && !r.props.some((p) => !PROPS[p.id]?.flat && propCovers(p, x, y)) ? 1 : 0
    }
  return open
}

/**
 * Whether a ship's rooms can be walked: from the hatch, every doorway, the seat and the front of every piece (and a
 * free piece from some side) reached over open floor. A piece is placed only where this stays so.
 */
export function walkable(r: Room) {
  const W = r.w
  const open = openTiles(r)
  const seen = new Uint8Array(W * r.h)
  const hatch = r.spots.find((s) => s.id === 'hatch') ?? r.spots[0]
  const from = { x: Math.floor(hatch.x / TILE), y: Math.floor((hatch.y - TILE) / TILE) }
  const queue = [from.y * W + from.x]
  seen[queue[0]] = 1
  while (queue.length) {
    const i = queue.pop()!
    const x = i % W
    const y = (i - x) / W
    for (const [dx, dy] of SIDES) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= r.h) continue
      const j = ny * W + nx
      if (open[j] && !seen[j]) {
        seen[j] = 1
        queue.push(j)
      }
    }
  }
  const reached = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < r.h && seen[y * W + x] === 1
  for (let i = 0; i < W * r.h; i++) if (r.tiles[i] === DOOR && !seen[i]) return false
  for (const s of r.spots) if (!reached(Math.floor(s.x / TILE), Math.floor(s.y / TILE)) && s.id !== 'hatch') return false
  for (const p of r.props) {
    const k = PROPS[p.id]
    if (!k || k.wall || k.flat || p.id === 'console') continue
    const [bw, bd] = blockOf(k, p.face)
    if (k.use) {
      const f = frontOf(p, bw, bd)
      if (!reached(f.x, f.y)) return false
    } else {
      let any = false
      for (let x = p.x - 1; x <= p.x + bw && !any; x++) for (let y = p.y - bd; y <= p.y + 1 && !any; y++) any = reached(x, y)
      if (!any) return false
    }
  }
  return true
}

/**
 * The way a piece of furniture would face with its foot at tile (tx, ty), or null if it cannot stand there: on open
 * floor, a built-in piece with its back to a wall, and (aboard a ship) the rooms still walkable round it.
 */
export function faceFor(r: Room, id: string, tx: number, ty: number, only?: Face[]): Face | null {
  return placeAt(r, id, tx, ty, only).face
}

/** faceFor, and why not: what the player is told while he places a piece */
export function placeAt(r: Room, id: string, tx: number, ty: number, only?: Face[]): { face: Face | null; why: Refusal | '' } {
  const at = facing(r, id, tx, ty, only)
  if (!at.face || r.kind !== 'ship' || PROPS[id].flat) return at
  r.props.push({ id, x: tx, y: ty, placed: true, face: at.face })
  const ok = walkable(r)
  r.props.pop()
  return ok ? at : { face: null, why: 'IT WOULD BLOCK THE WAY' }
}

/** whether a piece of furniture could stand with its foot at tile (tx, ty) (faceFor) */
export function freeFor(r: Room, id: string, tx: number, ty: number) {
  return faceFor(r, id, tx, ty) !== null
}

/** the room a row of a ship's floor is in */
const roomAt = (r: Room, ty: number) => r.rooms.find((q) => ty >= q.y0 && ty <= q.y1)

/** where a free piece stands in a room: centred on the middle line and in the room's depth, as near as it can */
function middleOf(r: Room, id: string, room: Room['rooms'][number]) {
  const k = PROPS[id]
  const [bw, bd] = blockOf(k, 's')
  const cx = Math.floor(r.w / 2)
  // (centred: an even piece on the two middle tiles, an odd one a half tile to the left, as the doorways are)
  const x = cx - Math.ceil(bw / 2)
  const best: { x: number; y: number; d: number }[] = []
  const mid = (room.y0 + room.y1) / 2
  for (let y = room.y0 + bd - 1; y <= room.y1; y++) if (faceFor(r, id, x, y)) best.push({ x, y, d: Math.abs(y - (bd - 1) / 2 - mid) })
  best.sort((a, b) => a.d - b.d || a.y - b.y)
  return best[0] ?? null
}

/** the tile column a piece at x, w wide, stands at on the other side of the middle line */
const mirrorX = (r: Room, x: number, w: number) => 2 * Math.floor(r.w / 2) - x - w

/**
 * Places one entry of a room's recipe (data/interiors.ts Where): a mirrored pair (or one, for 'middle'), each where its
 * rule wants it most of the places it could stand; `last` is the foot of the pieces placed before along each side wall.
 * Returns what was placed.
 */
function placeRule(r: Room, id: string, where: Where | 'front', room: Room['rooms'][number], last: { e: number; w: number }) {
  const k = PROPS[id]
  if (!k) return []
  const cx = Math.floor(r.w / 2)
  if (where === 'middle') {
    const at = middleOf(r, id, room)
    if (!at) return []
    const p: RoomProp = { id, x: at.x, y: at.y, placed: true, face: 's' }
    r.props.push(p)
    return [p]
  }
  // the left one of the pair: the faces its rule allows, and how much each place is wanted
  const want: Face = !k.against ? 's' : where === 'sides' || where === 'feet' ? 'e' : where === 'front' ? 'n' : 's'
  const faces: Face[] = k.faces.includes(want) ? [want] : []
  const cands: { x: number; y: number; face: Face; score: number }[] = []
  for (const face of faces) {
    const [bw, bd] = blockOf(k, face)
    for (let y = room.y0 + bd - 1; y <= room.y1; y++)
      for (let x = 0; x + bw <= cx; x++) {
        const f = facing(r, id, x, y, [face]).face
        if (!f) continue
        // (each wants: the sides as far up the room as it goes; the feet right after the last on that wall; the back
        // close beside the doorway; the corners as far out as it goes, flush to the side wall)
        const top = y - bd + 1
        const flushSide = tileAt(r, x - 1, y) === WALL
        const score =
          where === 'sides'
            ? top * 10 + (flushSide ? 0 : 50)
            : where === 'feet'
              ? Math.abs(top - (last.e + 1)) * 10 + (flushSide ? 0 : 50)
              : where === 'back'
                ? (top === room.y0 ? 0 : 100) + (cx - (x + bw)) * 2
                : where === 'front'
                  ? (y === room.y1 ? 0 : 100) + (cx - (x + bw)) * 2
                  : (top === room.y0 ? 0 : 100) + x * 2 + (flushSide ? 0 : 20)
        cands.push({ x, y, face: f, score })
      }
  }
  cands.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x)
  for (const c of cands) {
    const [bw] = blockOf(k, c.face)
    const mface: Face = c.face === 'e' ? 'w' : c.face === 'w' ? 'e' : c.face
    const mx = mirrorX(r, c.x, bw)
    // (both or neither: the pair mirrored, and the rooms walkable with both in)
    const left: RoomProp = { id, x: c.x, y: c.y, placed: true, face: c.face }
    if (faceFor(r, id, c.x, c.y, [c.face]) !== c.face) continue
    r.props.push(left)
    const ok = mx !== c.x && faceFor(r, id, mx, c.y, [mface]) === mface
    if (!ok) {
      r.props.pop()
      continue
    }
    const right: RoomProp = { id, x: mx, y: c.y, placed: true, face: mface }
    r.props.push(right)
    if (where === 'sides' || where === 'feet') last.e = last.w = c.y
    return [left, right]
  }
  return []
}

/** pieces that look right from behind, against the wall nearest the camera (a berth's or a rack's back is a plain panel; a console's is not where it belongs) */
const BACK_SHOWN = new Set(['bunk', 'bunkbed', 'cargo'])

/**
 * The furniture a new ship of this hull comes with, room by room (each piece's foot, in tiles), by each room's recipe
 * (data/interiors.ts ROOM_KINDS): built-in pieces against the walls in mirrored pairs, free ones on the middle line, the
 * ways through kept open. Its pilot moves them from there.
 */
export function shipKit(hull: string): Piece[] {
  const r = shipRoom(hull)
  const out: Piece[] = []
  for (const room of r.rooms) {
    // (a ship of one room, its cockpit, has a berth and a locker in it too, if they fit)
    const recipe = [...ROOM_KINDS[room.kind].kit, ...(r.rooms.length === 1 ? ROOM_KINDS.cabin.kit.slice(0, 1) : [])]
    const last = { e: room.y0 - 1, w: room.y0 - 1 }
    for (const [id, where, fill] of recipe) {
      for (let n = 0; n < (fill ? 6 : 1); n++) {
        let placed = placeRule(r, id, where, room, last)
        // (berths and racks that find no straight run of side wall long enough go along the wall at the top instead, or
        // the one at the bottom, their backs to us)
        if (!placed.length && where === 'sides' && n === 0) placed = placeRule(r, id, 'back', room, last)
        if (!placed.length && where === 'sides' && n === 0 && BACK_SHOWN.has(id)) placed = placeRule(r, id, 'front', room, last)
        for (const p of placed) out.push({ id: p.id, x: p.x, y: p.y, face: p.face })
        if (!placed.length) break
      }
    }
  }
  // (none of a hull's own fixtures is in its list)
  return out.sort((a, b) => a.y - b.y || a.x - b.x)
}

/** the pieces of a ship's furniture as they stand in its rooms (each facing as the wall behind it says), and those that cannot stand where they were */
export function standFurniture(r: Room, list: Piece[]) {
  const left: Piece[] = []
  for (const f of list) {
    const face = PROPS[f.id] ? faceFor(r, f.id, f.x, f.y, f.face ? [f.face] : undefined) : null
    if (face) r.props.push({ id: f.id, x: f.x, y: f.y, placed: true, face })
    else left.push(f)
  }
  return left
}

export { roomAt }
