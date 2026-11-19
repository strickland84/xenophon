// The maps in three dimensions (the map action, M), after art/mockups/map3d-galaxy-11.png and map3d-system-3.png: drawn in
// the game's own pixels into a small picture the page shows scaled up, as it shows the game.
//
//   the galaxy   a disc of dust lying in its plane, a grid of rings and spokes over it; each system a star on a stalk over
//                the plane, standing on a ring there; the lanes between the stars (the black hole shortcut dashed), the
//                route marching along them; whose each system is, how dangerous for the pilot's side, its worlds as pips
//   a system     its sun (or black hole) in the middle, the orbits as rings seen in perspective, every body where it is now;
//                every world and giant a globe of its own map (as space draws it: render/space.ts sphereMapOf), lit from its
//                sun and turning; a belt as its rocks; stations, gates and derelicts by the image model's marks; the pilot
//                and his course
//
// Nothing here knows the page: components/StarMap.svelte holds the camera, gives it the things to show and puts the picture
// on the page; tools/starmap-shots.ts draws it in Node. What was drawn where comes back as marks, to pick and to point at.

import { blend, bodyZ, brightnessOf, drawText, hash8, LEVELS, ORBIT_SLOW, pack, positionAt, sphereMapOf, SUN, textWidth } from '../engine'
import type { Body, Galaxy, SphereMap } from '../engine'

export type Side = 'nomarchy' | 'anarchoi'

/** where the camera looks from: at a point on the plane (x, y), turned `yaw` round it, `pitch` over it (0 level, π/2 straight down), `dist` away */
export interface MapCamera {
  x: number
  y: number
  yaw: number
  pitch: number
  dist: number
}

/** a picture the map is drawn into: one 0xAABBGGRR colour a pixel */
export interface MapPicture {
  w: number
  h: number
  fb: Uint32Array
}

/** one of the image model's marks (static/ui/mark-*.png) as pixels */
export interface Sprite {
  w: number
  h: number
  px: Uint32Array
}
export type MarkName = 'station' | 'gate' | 'raiders' | 'hotspot' | 'derelict'

/** what the map shows */
export interface MapScene {
  g: Galaxy
  kind: 'galaxy' | 'system'
  /** the system shown on the system map */
  system: number
  /** the system the pilot is in (−1: none) */
  here: number
  /** seconds since 1970: the bodies are where they are now */
  now: number
  /** milliseconds, for what beats and marches */
  t: number
  /** his side */
  side: Side
  colours: Record<Side, string>
  /** who holds a world (by its id) */
  holderOf: (worldId: string) => Side | null
  /** a body's name now (a world may have been named by its discoverer) */
  nameOf: (b: Body) => string
  /** by system: how dangerous for his side (0..3), and whether it is the front */
  danger: number[]
  front: boolean[]
  /** by system: a pilot with a price on him there, as words ('' none) */
  bounty: string[]
  /** today's hotspots (world ids), and the bodies raiders keep to (in the system shown) */
  hotspots: Set<string>
  raiders: Set<number>
  /** the route (systems, in order) and the course (a body, −1 none) */
  route: number[]
  course: number
  /** where he is in the system shown (its own px), and which way he points; null: not in it */
  pilot: { x: number; y: number; heading: number } | null
  /** what is picked, and what the pointer is over ('b12' a body, 's3' a system) */
  picked: string | null
  hover: string | null
  /** false: nothing beats or marches (Reduce motion) */
  motion: boolean
  /** the size of the names (font pixels to a letter's pixel) */
  text: number
}

/** a thing drawn: where on the picture (px), how far round it picks it, and how deep it is */
export interface MapMark {
  key: string
  x: number
  y: number
  r: number
  depth: number
}

// ── colours

const hex = (s: string) => pack(parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16))
const SPACE = hex('#04060e')
const SHADOW = hex('#03050c')
const INK = hex('#f4ecd0')
const DIM = hex('#b8b4a4')
const ORBIT = hex('#2c3a66')
const GRID = hex('#1a2452')
const COURSE = hex('#78ecdc')
const GATE_INK = hex('#78beff')
const BELT_INK = hex('#a8987a')
const LANE = hex('#9a8656')
const HOLE_LANE = hex('#b090f0')
const DANGER = ['#70e27c', '#fad246', '#ff963c', '#ff5446'].map(hex)
const STAR: Record<string, number[]> = {
  red: [255, 122, 70],
  orange: [255, 166, 70],
  yellow: [255, 208, 90],
  white: [244, 242, 236],
  blue: [156, 200, 255],
}
const starOf = (k: string | undefined) => STAR[k ?? 'yellow'] ?? STAR.yellow
const shade = (c: number[], k: number, w = 0) =>
  pack(c[0] * k + (255 - c[0] * k) * w, c[1] * k + (255 - c[1] * k) * w, c[2] * k + (255 - c[2] * k) * w)

/** an ordered dither: a share of pixels (0..1) shows where `k` is over this pixel's threshold */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16)
const bayer = (x: number, y: number) => BAYER[((y & 3) << 2) | (x & 3)]

// ── the camera

/** the lens: the picture's height is this many times the focal length's half-angle (about 44° top to bottom) */
const LENS = 1.24
/** how close anything may be to the camera before it is not drawn */
const NEAR = 0.5

export interface Basis {
  /** the camera's place */
  ex: number
  ey: number
  ez: number
  /** right, up and forward (into the picture) */
  rx: number
  ry: number
  ux: number
  uy: number
  uz: number
  fx: number
  fy: number
  fz: number
  /** focal length (px), and the picture's middle */
  F: number
  cx: number
  cy: number
}

export function basisOf(c: MapCamera, w: number, h: number): Basis {
  const cp = Math.cos(c.pitch)
  const sp = Math.sin(c.pitch)
  const sy = Math.sin(c.yaw)
  const cy = Math.cos(c.yaw)
  // (the eye is south of the point looked at and over it, at yaw 0: north up the picture, as the flat maps were)
  const ox = sy * cp
  const oy = cy * cp
  const oz = sp
  const fx = -ox
  const fy = -oy
  const fz = -oz
  const rx = cy
  const ry = -sy
  // up = forward × right
  const ux = fy * 0 - fz * ry
  const uy = fz * rx - fx * 0
  const uz = fx * ry - fy * rx
  return {
    ex: c.x + ox * c.dist,
    ey: c.y + oy * c.dist,
    ez: oz * c.dist,
    rx,
    ry,
    ux,
    uy,
    uz,
    fx,
    fy,
    fz,
    F: h * LENS,
    cx: w / 2,
    cy: h / 2,
  }
}

/** a point's place in the camera's view: across, up and depth (written into `out`) */
function toCam(b: Basis, x: number, y: number, z: number, out: Float64Array) {
  const vx = x - b.ex
  const vy = y - b.ey
  const vz = z - b.ez
  out[0] = vx * b.rx + vy * b.ry
  out[1] = vx * b.ux + vy * b.uy + vz * b.uz
  out[2] = vx * b.fx + vy * b.fy + vz * b.fz
}

const P = new Float64Array(3)
/** a point on the picture: [x, y, depth], or null behind the camera */
export function project(b: Basis, x: number, y: number, z: number): [number, number, number] | null {
  toCam(b, x, y, z, P)
  if (P[2] < NEAR) return null
  return [b.cx + (b.F * P[0]) / P[2], b.cy - (b.F * P[1]) / P[2], P[2]]
}

/** the point of the plane (z = 0) under a point of the picture, or null where it looks above the horizon */
export function planeAt(b: Basis, sx: number, sy: number): { x: number; y: number } | null {
  const a = (sx - b.cx) / b.F
  const c = (sy - b.cy) / b.F
  const dx = b.fx + a * b.rx - c * b.ux
  const dy = b.fy + a * b.ry - c * b.uy
  const dz = b.fz - c * b.uz
  if (dz > -1e-3) return null
  const t = -b.ez / dz
  return { x: b.ex + t * dx, y: b.ey + t * dy }
}

/** how far the camera may come in and go out, and how far its point may wander, on each map */
export const LIMITS = {
  galaxy: { near: 90, far: 2600, reach: 760 },
  system: { near: 6, far: 3600, reach: 820 },
  pitch: { low: 0.16, high: Math.PI / 2 },
}

/** the camera that shows a disc of radius `r` round (x, y) whole in a picture of w × h, from `pitch` and `yaw` */
export function fitCamera(x: number, y: number, r: number, w: number, h: number, pitch = 0.92, yaw = 0): MapCamera {
  const F = h * LENS
  // (the disc's width across the picture, and its depth foreshortened by the pitch up and down it)
  const across = (r * F) / (w * 0.47)
  const down = (r * Math.sin(pitch) * F) / (h * 0.45)
  return { x, y, yaw, pitch, dist: Math.max(across, down) * 1.04 + r * Math.cos(pitch) * 0.3 }
}

/** the camera pulled in or out by `k` about a point of the picture, which stays where it is */
export function zoomAbout(c: MapCamera, w: number, h: number, sx: number, sy: number, k: number, kind: 'galaxy' | 'system'): MapCamera {
  const L = LIMITS[kind]
  const dist = Math.min(L.far, Math.max(L.near, c.dist * k))
  k = dist / c.dist
  const p = planeAt(basisOf(c, w, h), sx, sy)
  if (!p || Math.hypot(p.x - c.x, p.y - c.y) > c.dist * 4) return { ...c, dist }
  return clampCam({ ...c, dist, x: p.x + (c.x - p.x) * k, y: p.y + (c.y - p.y) * k }, kind)
}

/** the camera moved so the plane's point under (ax, ay) of the picture comes under (bx, by) */
export function panBy(c: MapCamera, w: number, h: number, ax: number, ay: number, bx: number, by: number, kind: 'galaxy' | 'system') {
  const b = basisOf(c, w, h)
  const p = planeAt(b, ax, ay)
  const q = planeAt(b, bx, by)
  let dx: number
  let dy: number
  if (p && q && Math.hypot(p.x - q.x, p.y - q.y) < c.dist) {
    dx = p.x - q.x
    dy = p.y - q.y
  } else {
    // (towards the horizon the plane runs away: move by the screen instead, across and along the way the camera looks)
    const s = c.dist / b.F
    const n = Math.hypot(b.fx, b.fy) || 1
    const across = -(bx - ax) * s
    const along = (by - ay) * s
    dx = across * b.rx + along * (b.fx / n)
    dy = across * b.ry + along * (b.fy / n)
  }
  return clampCam({ ...c, x: c.x + dx, y: c.y + dy }, kind)
}

export function clampCam(c: MapCamera, kind: 'galaxy' | 'system'): MapCamera {
  const L = LIMITS[kind]
  const d = Math.hypot(c.x, c.y)
  const k = d > L.reach ? L.reach / d : 1
  return {
    x: c.x * k,
    y: c.y * k,
    yaw: c.yaw,
    pitch: Math.min(LIMITS.pitch.high, Math.max(LIMITS.pitch.low, c.pitch)),
    dist: Math.min(L.far, Math.max(L.near, c.dist)),
  }
}

// ── where things are, in the map's own units (z up)

/** the galaxy map's plane: its systems' places (0..1000 across, 0..600 down) about its middle */
export const galaxyX = (x: number) => x - 500
export const galaxyY = (y: number) => y - 300
/** how high over the plane each system's star stands (from its index, so the same for everyone) */
export const starHeight = (i: number) => 22 + (hash8(i * 37 + 5) / 255) * 64
/** the disc of dust the systems lie over */
const DISC = 640

/** how far a system's things are from its middle, in its own px, and the units of the map to one of them */
const SYSTEM_R = 520
export function systemReach(g: Galaxy, system: number) {
  let reach = 1
  for (const i of g.systems[system].bodies) {
    const b = g.bodies[i]
    reach = Math.max(reach, Math.hypot(b.x, b.y) + (b.kind === 'belt' ? b.size / 2 : b.size))
  }
  return reach * 1.04
}
export const systemUnit = (g: Galaxy, system: number) => SYSTEM_R / systemReach(g, system)
export const SYSTEM_FIT = SYSTEM_R * 0.9
/** how far out the galaxy's systems lie from its middle, for the camera that shows them all */
export const GALAXY_FIT = 450

// ── drawing

let pic: MapPicture
let W = 0
let H = 0
let fb: Uint32Array

function put(x: number, y: number, c: number, k = 256) {
  x |= 0
  y |= 0
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const o = y * W + x
  fb[o] = k >= 256 ? c : blend(fb[o], c, k)
}

/** a line of pixels; `dash` pixels on and as many off (0: solid), started `off` pixels into the pattern */
function line(x0: number, y0: number, x1: number, y1: number, c: number, k = 256, dash = 0, off = 0, gap = dash) {
  // (cut to the picture first: a line to a point far off it would be walked a pixel at a time)
  let t0 = 0
  let t1 = 1
  const dx = x1 - x0
  const dy = y1 - y0
  const edges: [number, number][] = [
    [-dx, x0 + 2],
    [dx, W + 1 - x0],
    [-dy, y0 + 2],
    [dy, H + 1 - y0],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return
    } else {
      const r = q / p
      if (p < 0) t0 = Math.max(t0, r)
      else t1 = Math.min(t1, r)
    }
  }
  if (t0 > t1) return
  let ax = Math.round(x0 + dx * t0)
  let ay = Math.round(y0 + dy * t0)
  const bx = Math.round(x0 + dx * t1)
  const by = Math.round(y0 + dy * t1)
  const sx = ax < bx ? 1 : -1
  const sy = ay < by ? 1 : -1
  const ddx = Math.abs(bx - ax)
  const ddy = -Math.abs(by - ay)
  let err = ddx + ddy
  // (the pattern counted from where the line truly starts, so it does not crawl as the line is cut)
  let n = Math.round(Math.hypot(dx * t0, dy * t0)) + off
  for (;;) {
    if (!dash || ((n % (dash + gap)) + dash + gap) % (dash + gap) < dash) put(ax, ay, c, k)
    if (ax === bx && ay === by) break
    const e2 = 2 * err
    if (e2 >= ddy) {
      err += ddy
      ax += sx
    }
    if (e2 <= ddx) {
      err += ddx
      ay += sy
    }
    n++
  }
}

const A = new Float64Array(3)
const B = new Float64Array(3)
/** a line between two points of the map, cut where it goes behind the camera */
function line3(b: Basis, p: number[], q: number[], c: number, k = 256, dash = 0, off = 0, gap = dash) {
  toCam(b, p[0], p[1], p[2], A)
  toCam(b, q[0], q[1], q[2], B)
  if (A[2] < NEAR && B[2] < NEAR) return
  if (A[2] < NEAR || B[2] < NEAR) {
    const [u, v] = A[2] < NEAR ? [A, B] : [B, A]
    const s = (NEAR - u[2]) / (v[2] - u[2])
    for (let i = 0; i < 3; i++) u[i] = u[i] + (v[i] - u[i]) * s
  }
  line(b.cx + (b.F * A[0]) / A[2], b.cy - (b.F * A[1]) / A[2], b.cx + (b.F * B[0]) / B[2], b.cy - (b.F * B[1]) / B[2], c, k, dash, off, gap)
}

/** a ring on the plane (z) round (x, y), as a line of `n` pieces */
function ring3(b: Basis, x: number, y: number, z: number, r: number, c: number, k = 256, n = 96, dash = 0) {
  let px = x + r
  let py = y
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * Math.PI * 2
    const qx = x + Math.cos(a) * r
    const qy = y + Math.sin(a) * r
    line3(b, [px, py, z], [qx, qy, z], c, k, dash, 0)
    px = qx
    py = qy
  }
}

/** a filled disc of the picture */
function disc(cx: number, cy: number, r: number, c: number, k = 256) {
  const r2 = r * r
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      if (dx * dx + dy * dy <= r2) put(x, y, c, k)
    }
}

/** a ring of the picture, a pixel thick; `dash` pixels on and off round it (0: whole) */
function ring(cx: number, cy: number, r: number, c: number, k = 256, dash = 0) {
  const n = Math.max(12, Math.ceil(Math.PI * 2 * r * 1.4))
  let last = -1
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const x = Math.round(cx + Math.cos(a) * r - 0.5)
    const y = Math.round(cy + Math.sin(a) * r - 0.5)
    const key = y * 65536 + x
    if (key === last) continue
    last = key
    if (dash && Math.floor((a * r) / dash) % 2) continue
    put(x, y, c, k)
  }
}

/** a glow round a point in a few hard bands, as pixel art draws one: `k` (0..1) at its middle falling to nothing at `r` */
function glow(cx: number, cy: number, r: number, c: number, k: number) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
      if (d >= 1) continue
      const band = Math.floor(Math.pow(1 - d, 1.7) * k * 7)
      if (band > 0) put(x, y, c, band * 20)
    }
}

/** a filled shape of the picture (a few points round it, in order) */
function fill(pts: number[][], c: number) {
  let y0 = Infinity
  let y1 = -Infinity
  for (const p of pts) {
    y0 = Math.min(y0, p[1])
    y1 = Math.max(y1, p[1])
  }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % pts.length]
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        const x = ax + ((yc - ay) / (by - ay)) * (bx - ax)
        lo = Math.min(lo, x)
        hi = Math.max(hi, x)
      }
    }
    for (let x = Math.round(lo); x < Math.round(hi); x++) put(x, y, c)
  }
}

/** a side's mark round (x, y): the Nomarchy's triangle, the Anarchoi's diamond, nobody's square; outlined dark */
function sideMark(h: Side | null, x: number, y: number, r: number, c: number) {
  const pts =
    h === 'nomarchy'
      ? [
          [0, -r],
          [r, r],
          [-r, r],
        ]
      : h === 'anarchoi'
        ? [
            [0, -r],
            [r, 0],
            [0, r],
            [-r, 0],
          ]
        : [
            [-r, -r],
            [r, -r],
            [r, r],
            [-r, r],
          ]
  const at = (k: number, dx = 0, dy = 0) => pts.map(([a, b]) => [x + a * k + dx, y + b * k + dy])
  fill(at((r + 1) / r), SHADOW)
  fill(at(1), c)
}

/** brackets at the corners of a box round a point: what is picked */
function brackets(x: number, y: number, r: number, c: number, k = 256) {
  const s = Math.max(2, Math.round(r * 0.45))
  x = Math.round(x)
  y = Math.round(y)
  r = Math.round(r)
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]) {
    const cx = x + sx * r
    const cy = y + sy * r
    for (let i = 0; i < s; i++) {
      put(cx - sx * i, cy, c, k)
      put(cx, cy - sy * i, c, k)
    }
  }
}

function sprite(s: Sprite | undefined, x: number, y: number) {
  if (!s) return
  x = Math.round(x)
  y = Math.round(y)
  for (let j = 0; j < s.h; j++)
    for (let i = 0; i < s.w; i++) {
      const p = s.px[j * s.w + i]
      if (p >>> 24 >= 128) put(x + i, y + j, p | 0xff000000)
    }
}

/** names, written last and only where they do not run into one already written */
interface Label {
  text: string
  x: number
  y: number
  c: number
  /** lower first */
  rank: number
  /** a mark drawn left of it (a danger's chevrons): its level, −1 none */
  danger: number
}
let labels: Label[] = []
function writeLabels(scale: number) {
  const placed: number[][] = []
  const lh = 5 * scale
  for (const l of labels.sort((a, c) => a.rank - c.rank)) {
    const w = textWidth(l.text, scale)
    const extra = l.danger >= 0 ? Math.max(1, l.danger) * 4 + 4 : 0
    const box = [l.x - w / 2 - extra - 2, l.y - 2, l.x + w / 2 + 2, l.y + lh + 2]
    if (box[2] < 0 || box[0] > W || box[3] < 0 || box[1] > H) continue
    if (placed.some((q) => q[0] < box[2] && box[0] < q[2] && q[1] < box[3] && box[1] < q[3])) continue
    placed.push(box)
    const x = Math.round(l.x - w / 2)
    drawText(fb, W, H, x, Math.round(l.y), l.text, l.c, SHADOW, 256, scale)
    if (l.danger >= 0) chevrons(l.danger, x - extra, Math.round(l.y + lh / 2), DANGER[l.danger])
  }
  labels = []
}

/** a danger's chevrons from (x, y), each 3 px wide, centred on y; safe is a square */
function chevrons(level: number, x: number, y: number, c: number) {
  if (level === 0) {
    for (let j = -1; j <= 1; j++) for (let i = 0; i < 3; i++) put(x + i, y + j, c)
    return
  }
  for (let n = 0; n < level; n++)
    for (let i = 0; i < 3; i++) {
      put(x + n * 4 + i, y - 2 + i, c)
      put(x + n * 4 + i, y + 2 - i, c)
    }
}

// ── the sky behind: stars as directions, turning with the camera and never coming nearer

const SKY = Array.from({ length: 700 }, (_, i) => {
  const u = hash8(i * 3 + 1) / 255 + hash8(i * 7 + 2) / 65536
  const v = hash8(i * 5 + 3) / 255 + hash8(i * 11 + 4) / 65536
  const z = u * 2 - 1
  const a = v * Math.PI * 2
  const s = Math.sqrt(1 - z * z)
  const lum = hash8(i * 13 + 9)
  return [s * Math.cos(a), s * Math.sin(a), z, lum]
})
const SKY_COLOURS = ['#2a3050', '#3c4468', '#5a5e78', '#8a8ea8', '#d8dcf0', '#f4ecd0'].map(hex)

function drawSky(b: Basis) {
  fb.fill(SPACE)
  for (const [x, y, z, lum] of SKY) {
    const cx = x * b.rx + y * b.ry
    const cy = x * b.ux + y * b.uy + z * b.uz
    const cz = x * b.fx + y * b.fy + z * b.fz
    if (cz <= 0.05) continue
    const sx = b.cx + (b.F * cx) / cz
    const sy = b.cy - (b.F * cy) / cz
    const c = SKY_COLOURS[Math.min(5, Math.floor((lum / 256) ** 2.2 * 6))]
    put(sx, sy, c)
    if (lum > 250) {
      put(sx + 1, sy, c, 120)
      put(sx - 1, sy, c, 120)
      put(sx, sy + 1, c, 120)
      put(sx, sy - 1, c, 120)
    }
  }
}

// ── the galaxy's disc of dust, worked out once: two arms winding out from a bright core, broken by noise

const DUST_N = 256
const DUST_R = 720
let dust: Uint8Array | null = null
const DUST_COLOURS = ['#0b0d22', '#160f34', '#24164e', '#352066', '#4a2a82', '#3a5a8a', '#3f8a92', '#8fd0c8'].map(hex)

function noise(x: number, y: number, seed: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const h = (i: number, j: number) => hash8(((xi + i) * 73856093) ^ ((yi + j) * 19349663) ^ seed) / 255
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = h(0, 0) + (h(1, 0) - h(0, 0)) * sx
  const c = h(0, 1) + (h(1, 1) - h(0, 1)) * sx
  return a + (c - a) * sy
}

function dustMap() {
  if (dust) return dust
  dust = new Uint8Array(DUST_N * DUST_N)
  for (let j = 0; j < DUST_N; j++)
    for (let i = 0; i < DUST_N; i++) {
      const x = ((i + 0.5) / DUST_N) * 2 * DUST_R - DUST_R
      const y = ((j + 0.5) / DUST_N) * 2 * DUST_R - DUST_R
      const r = Math.hypot(x, y) / DISC
      if (r > 1.08) continue
      const th = Math.atan2(y, x)
      const arm = 0.5 + 0.5 * Math.cos(2 * (th - 2.9 * Math.log(r + 0.06)))
      const n = noise(x / 46, y / 46, 7) * 0.65 + noise(x / 17, y / 17, 13) * 0.35
      const edge = Math.max(0, 1 - r) ** 0.9
      const core = Math.exp(-r * r * 40)
      const d = (Math.pow(arm, 2.4) * 0.75 + 0.12) * edge * (0.35 + 0.95 * n) + core * 0.62
      dust[j * DUST_N + i] = Math.min(255, Math.max(0, Math.round(d * 255)))
    }
  return dust
}

/** the disc, a pixel at a time where the picture looks down onto the plane */
function drawDust(b: Basis, dist: number) {
  const d = dustMap()
  for (let y = 0; y < H; y++) {
    const c = (y + 0.5 - b.cy) / b.F
    const dz = b.fz - c * b.uz
    if (dz > -1e-3) continue
    const t = -b.ez / dz
    for (let x = 0; x < W; x++) {
      const a = (x + 0.5 - b.cx) / b.F
      const px = b.ex + t * (b.fx + a * b.rx - c * b.ux)
      const py = b.ey + t * (b.fy + a * b.ry - c * b.uy)
      const i = Math.floor(((px + DUST_R) / (2 * DUST_R)) * DUST_N)
      const j = Math.floor(((py + DUST_R) / (2 * DUST_R)) * DUST_N)
      if (i < 0 || j < 0 || i >= DUST_N || j >= DUST_N) continue
      const v = d[j * DUST_N + i]
      if (!v) continue
      // (fainter far off, so the disc lies down into the distance)
      const fade = Math.max(0.45, Math.min(1, 1.3 - t / (dist * 2.4)))
      const level = Math.floor((v / 255) * fade * (DUST_COLOURS.length - 1) * 0.92 + bayer(x, y) - 0.3)
      if (level > 0) fb[y * W + x] = DUST_COLOURS[Math.min(DUST_COLOURS.length - 1, level)]
    }
  }
}

// ── globes: a body's own map, lit from its sun, turning

const MERC = Math.log(Math.tan(Math.PI / 4 + (85 * Math.PI) / 360))
let sunBright: Uint8Array | null = null

/**
 * A sphere at (cx, cy) of `r` px. Each pixel's way out of it (in the map's frame, z up) is looked up on its map: a
 * world's by Mercator's rows, a giant's by latitude. `lx, ly, lz` is the way to its light.
 */
function globe(b: Basis, cx: number, cy: number, r: number, map: SphereMap, spin: number, lx: number, ly: number, lz: number) {
  const air = map.air
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < 0 || y >= H) continue
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || x >= W) continue
      const a = (x + 0.5 - cx) / r
      const c = -(y + 0.5 - cy) / r
      const q = 1 - a * a - c * c
      if (q < 0) continue
      const n = Math.sqrt(q)
      // (out of the sphere towards the camera: across, up, and back along the view)
      const nx = a * b.rx + c * b.ux - n * b.fx
      const ny = a * b.ry + c * b.uy - n * b.fy
      const nz = c * b.uz - n * b.fz
      const lat = Math.asin(Math.max(-1, Math.min(1, nz)))
      let u = (Math.atan2(ny, nx) / (Math.PI * 2) + spin) % 1
      if (u < 0) u += 1
      let v: number
      if (map.merc) {
        const m = Math.log(Math.tan(Math.PI / 4 + Math.max(-1.48, Math.min(1.48, lat)) / 2))
        v = Math.max(0, Math.min(0.9999, 0.5 - m / (2 * MERC)))
      } else v = Math.max(0, Math.min(0.9999, 0.5 - lat / Math.PI))
      const t = map.idx[Math.floor(v * map.h) * map.w + Math.floor(u * map.w)]
      const lam = nx * lx + ny * ly + nz * lz
      const lit = Math.max(0, Math.min(1, lam * 1.15 + 0.12))
      const level = Math.max(0, Math.min(LEVELS - 1, Math.floor(lit * (LEVELS - 1) + bayer(x, y))))
      let col = map.lit[t * LEVELS + level]
      if (map.clouds) {
        const cw = map.w >> 1
        const ch = map.h >> 1
        const k = map.clouds[Math.floor(v * ch) * cw + Math.floor(u * cw)]
        if (k > 1) col = blend(col, map.lit[t * LEVELS + LEVELS - 1] | 0xffffff, Math.round(lit * 40 * k + 20))
      }
      if (air && n < 0.32 && lam > -0.2) col = blend(col, air, Math.round((0.32 - n) * 520 * Math.min(1, lam + 0.4)))
      fb[y * W + x] = col
    }
  }
}

/** a sun: its surface from the image model's (space/art.ts SUN), turning, darker towards its edge, in a dithered halo */
function sunGlobe(b: Basis, cx: number, cy: number, r: number, star: number[], spin: number, t: number) {
  glow(cx, cy, r * 2.4, shade(star, 1, 0.1), 0.95)
  glow(cx, cy, r * 1.5, shade(star, 1, 0.35), 0.9)
  sunBright ??= brightnessOf(SUN)
  const sw = SUN.w
  const sh = SUN.h
  const ramp = [shade(star, 0.62), shade(star, 0.82), shade(star, 1), shade(star, 1, 0.45), shade(star, 1, 0.8)]
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    if (y < 0 || y >= H) continue
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || x >= W) continue
      const a = (x + 0.5 - cx) / r
      const c = -(y + 0.5 - cy) / r
      const q = 1 - a * a - c * c
      if (q < 0) continue
      const n = Math.sqrt(q)
      const nx = a * b.rx + c * b.ux - n * b.fx
      const ny = a * b.ry + c * b.uy - n * b.fy
      const nz = c * b.uz - n * b.fz
      let u = (Math.atan2(ny, nx) / (Math.PI * 2) + spin) % 1
      if (u < 0) u += 1
      const v = Math.max(0, Math.min(0.9999, 0.5 - Math.asin(Math.max(-1, Math.min(1, nz))) / Math.PI))
      const g = sunBright[Math.floor(v * sh) * sw + Math.floor(u * sw)] / 15
      const flicker = 0.04 * Math.sin(t / 700 + u * 40)
      const k = g * 0.55 + Math.pow(n, 0.45) * 0.6 - 0.12 + flicker
      fb[y * W + x] = ramp[Math.max(0, Math.min(4, Math.floor(k * 4 + bayer(x, y) - 0.2)))]
    }
  }
}

/** a black hole: its disc of fire lying in the plane round it (the far half behind it, the near over it), a ring of light at its edge */
function hole(b: Basis, x: number, y: number, z: number, rTrue: number, cx: number, cy: number, r: number, t: number) {
  const k = r / rTrue
  const inner = rTrue * 1.45
  const outer = rTrue * 3.1
  const reach = Math.ceil(outer * k * 1.05) + 2
  const colours = ['#ffffff', '#fff1c8', '#ffcf7a', '#ff9a40', '#d0582a', '#7a2a1a'].map(hex)
  const at = project(b, x, y, z)
  const deep = at ? at[2] : 0
  const pass = (front: boolean) => {
    for (let py = Math.floor(cy - reach); py <= Math.ceil(cy + reach); py++) {
      if (py < 0 || py >= H) continue
      const c = (py + 0.5 - b.cy) / b.F
      const dz = b.fz - c * b.uz
      if (Math.abs(dz) < 1e-4) continue
      for (let px = Math.floor(cx - reach); px <= Math.ceil(cx + reach); px++) {
        if (px < 0 || px >= W) continue
        const a = (px + 0.5 - b.cx) / b.F
        const tt = (z - b.ez) / dz
        if (tt <= 0) continue
        const hx = b.ex + tt * (b.fx + a * b.rx - c * b.ux) - x
        const hy = b.ey + tt * (b.fy + a * b.ry - c * b.uy) - y
        const d = Math.hypot(hx, hy)
        if (d < inner || d > outer) continue
        const depth = tt * (b.fx * (b.fx + a * b.rx - c * b.ux) + b.fy * (b.fy + a * b.ry - c * b.uy) + b.fz * dz)
        if (front !== depth < deep) continue
        const s = (d - inner) / (outer - inner)
        const swirl = 0.12 * Math.sin(Math.atan2(hy, hx) * 3 - t / 900 + s * 9)
        const lvl = Math.floor((s + swirl) * colours.length + bayer(px, py) * 0.9)
        if (lvl >= colours.length) continue
        fb[py * W + px] = colours[Math.max(0, lvl)]
      }
    }
  }
  pass(false)
  disc(cx, cy, r, hex('#000000'))
  ring(cx, cy, r + 0.5, hex('#fff4d8'))
  pass(true)
}

// ── the galaxy map

function drawGalaxy(s: MapScene, b: Basis, marks: MapMark[], dist: number) {
  const g = s.g
  drawDust(b, dist)
  // the grid: rings and spokes over the disc
  for (let r = 160; r <= DISC; r += 160) ring3(b, 0, 0, 0, r, GRID, r === DISC ? 256 : 200, 120)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    line3(b, [Math.cos(a) * 60, Math.sin(a) * 60, 0], [Math.cos(a) * DISC, Math.sin(a) * DISC, 0], GRID, 170)
  }
  const top = (i: number) => {
    const sy = g.systems[i]
    return [galaxyX(sy.x), galaxyY(sy.y), starHeight(i)]
  }
  const march = s.motion ? Math.floor(s.t / 90) : 0
  const onRoute = (a: number, c: number) => {
    const i = s.route.indexOf(a)
    return i >= 0 && (s.route[i + 1] === c || s.route[i - 1] === c)
  }
  // the lanes
  for (const l of g.lanes) {
    const routed = onRoute(l.a, l.b)
    if (routed) continue
    line3(b, top(l.a), top(l.b), l.kind === 'black hole' ? HOLE_LANE : LANE, 200, l.kind === 'black hole' ? 4 : 0)
  }
  for (const l of g.lanes) {
    if (!onRoute(l.a, l.b)) continue
    // (marching from where the route starts towards where it ends)
    const first = s.route.indexOf(l.a) < s.route.indexOf(l.b)
    line3(b, top(first ? l.a : l.b), top(first ? l.b : l.a), COURSE, 256, 5, -march, 3)
  }
  // the systems, far to near
  const order = g.systems
    .map((sy) => {
      const p = top(sy.index)
      return { sy, p, at: project(b, p[0], p[1], p[2]), foot: project(b, p[0], p[1], 0) }
    })
    .filter((o) => o.at)
    .sort((a, c) => c.at![2] - a.at![2])
  for (const { sy, p, at, foot } of order) {
    const [x, y, depth] = at!
    const owner = sy.side
    const oc = owner ? hex(s.colours[owner]) : DIM
    // its stalk down to the plane, and the ring it stands on there
    if (foot) line(foot[0], foot[1], x, y, owner ? oc : DIM, 120)
    ring3(b, p[0], p[1], 0, 9, owner ? oc : DIM, 150, 20)
    const star = starOf(sy.suns[0])
    const rc = Math.max(2, Math.min(6, Math.round((b.F * 6.5) / depth)))
    const twinkle = s.motion ? 0.5 + 0.5 * Math.sin(s.t / 600 + sy.index * 1.7) : 0.6
    glow(x, y, rc * 3.2, shade(star, 1), 0.8)
    // (its four spikes, which twinkle)
    const spike = rc + 3 + Math.round(twinkle * 3)
    for (let i = rc; i <= spike; i++) {
      const k = Math.round(230 * (1 - (i - rc) / (spike - rc + 1)))
      put(x + i, y, shade(star, 1, 0.5), k)
      put(x - i, y, shade(star, 1, 0.5), k)
      put(x, y + i, shade(star, 1, 0.5), k)
      put(x, y - i, shade(star, 1, 0.5), k)
    }
    disc(x, y, rc, shade(star, 1))
    disc(x - rc * 0.25, y - rc * 0.25, Math.max(1, rc * 0.5), shade(star, 1, 0.75))
    if (sy.suns.length > 1) disc(x + rc + 3, y - rc - 2, Math.max(1.2, rc * 0.45), shade(starOf(sy.suns[1]), 1))
    // its habitable worlds as pips over it, each in its holder's colour and mark
    const habitable = sy.worlds.filter((w) => g.worlds[w].habitable)
    habitable.forEach((w, i) => {
      const h = s.holderOf(g.worlds[w].id)
      const a = -Math.PI / 2 + (i - (habitable.length - 1) / 2) * 0.55
      const R = rc + 9
      sideMark(h, Math.round(x + Math.cos(a) * R), Math.round(y + Math.sin(a) * R), h ? 2 : 1, h ? hex(s.colours[h]) : hex('#3a4058'))
    })
    const d = s.danger[sy.index] ?? 0
    if (s.front[sy.index]) ring(x, y, rc + 15, DANGER[3], 200, 3)
    if (sy.index === s.here) {
      const beat = s.motion ? 0.5 + 0.5 * Math.sin(s.t / 260) : 1
      ring(x, y, rc + 12, hex(s.colours[s.side]), Math.round(120 + 136 * beat))
    }
    if (s.hotspots.size && sy.worlds.some((w) => s.hotspots.has(g.worlds[w].id))) sprite(sprites.hotspot, x + rc + 10, y - 14)
    const key = `s${sy.index}`
    if (s.picked === key) brackets(x, y, rc + 8, INK)
    else if (s.hover === key) brackets(x, y, rc + 8, INK, 130)
    labels.push({
      text: sy.name.toUpperCase(),
      x: x + (Math.max(1, d) * 4 + 4) / 2,
      y: y + rc + 9,
      c: owner ? oc : DIM,
      rank: depth / 10000 + (sy.index === s.here ? -1 : 0),
      danger: d,
    })
    if (s.bounty[sy.index]) labels.push({ text: s.bounty[sy.index], x, y: y - rc - 15 - 5 * s.text, c: DANGER[3], rank: 1, danger: -1 })
    marks.push({ key, x, y, r: Math.max(rc + 9, 13), depth })
  }
}

// ── a system's map

const ORBIT_KINDS = new Set(['planet', 'moon', 'giant', 'belt', 'black hole', 'sun'])
/** how small each kind is ever drawn (px of the picture), so it can be seen and picked */
const LEAST: Record<string, number> = { sun: 9, giant: 5, planet: 3.5, moon: 2, 'black hole': 5, base: 0, gate: 0, belt: 0 }

function drawSystem(s: MapScene, b: Basis, marks: MapMark[]) {
  const g = s.g
  const sys = g.systems[s.system]
  const U = systemUnit(g, s.system)
  const T = s.now / ORBIT_SLOW
  const bodies = sys.bodies.map((i) => g.bodies[i])
  const place = new Map<number, number[]>()
  for (const body of bodies) {
    const p = positionAt(g, body, T)
    place.set(body.index, [p.x * U, p.y * U, (bodyZ(body) - bodyZ({ ...body, kind: 'base' } as Body)) * U])
  }
  const where = (body: Body) => place.get(body.index)!
  // a faint grid of the plane: rings outwards from the middle
  for (let r = 130; r <= SYSTEM_R; r += 130) ring3(b, 0, 0, 0, r, GRID, 120, 96, 2)
  // the orbits
  for (const body of bodies) {
    if (body.orbit.period <= 0 || !ORBIT_KINDS.has(body.kind) || body.kind === 'belt') continue
    const c = body.orbit.around >= 0 ? where(g.bodies[body.orbit.around]) : [0, 0, 0]
    const r = body.orbit.radius * U
    const seen = (b.F * r) / Math.max(1, b.ez)
    if (seen < 3) continue
    ring3(b, c[0], c[1], 0, r, body.index === s.course ? hex('#2e6a70') : ORBIT, 256, Math.max(24, Math.min(160, Math.round(seen))))
  }
  // the belts, as their rocks going round
  for (const body of bodies) {
    if (body.kind !== 'belt') continue
    const r0 = body.orbit.radius * U
    const wide = body.size * U
    const n = 520
    const turn = (T / Math.max(1, body.orbit.period || 3600)) * Math.PI * 2
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (hash8(i * 7 + body.index) / 255) * 0.05 + turn
      const rr = r0 + ((hash8(i * 13 + body.index * 3) / 255 + hash8(i * 29 + 1) / 255 - 1) * wide) / 2
      const z = ((hash8(i * 17 + 5) / 255 - 0.5) * wide) / 6
      const p = project(b, Math.cos(a) * rr, Math.sin(a) * rr, z)
      if (!p) continue
      const tone = hash8(i * 31 + body.index)
      const c = tone > 200 ? hex('#c8b490') : tone > 90 ? hex('#8a7a60') : hex('#5c5242')
      const big = (b.F * 1.6) / p[2]
      if (big > 1.4) disc(p[0], p[1], Math.min(4, big), c)
      else put(p[0], p[1], c)
    }
  }
  // the bodies, far to near
  const sunAt = bodies.find((x) => x.kind === 'sun' || x.kind === 'black hole')
  const light = sunAt ? where(sunAt) : [0, 0, 0]
  type Drawn = { body: Body; x: number; y: number; depth: number; r: number }
  const drawn: Drawn[] = []
  for (const body of bodies) {
    if (body.kind === 'belt') continue
    const p = where(body)
    const at = project(b, p[0], p[1], p[2])
    if (!at) continue
    const r = Math.max(LEAST[body.kind] ?? 2, (b.F * body.size * U) / at[2])
    drawn.push({ body, x: at[0], y: at[1], depth: at[2], r })
  }
  drawn.sort((a, c) => c.depth - a.depth)
  const byIndex = new Map(drawn.map((d) => [d.body.index, d]))
  for (const d of drawn) {
    const { body, x, y, r } = d
    const p = where(body)
    if (body.kind === 'sun') sunGlobe(b, x, y, r, starOf(body.star), s.now / 900, s.t)
    else if (body.kind === 'black hole') hole(b, p[0], p[1], p[2], body.size * U, x, y, r, s.t)
    else if (body.kind === 'giant' || body.kind === 'planet' || body.kind === 'moon') {
      // (lit from its sun's way and from over the plane, as space lights a world: most of the side seen from above is in day)
      let lx = light[0] - p[0]
      let ly = light[1] - p[1]
      const n = Math.hypot(lx, ly) || 1
      lx = (lx / n) * 0.8
      ly = (ly / n) * 0.8
      const lz = 0.6
      if (r < 2.6) {
        const map = sphereMapOf(body, true)
        disc(x, y, r, map.lit[map.idx[0] * LEVELS + LEVELS - 2])
      } else {
        const map = sphereMapOf(body, r < 7)
        const day = 1620 + (hash8(body.index * 41 + 3) / 255) * 1800
        globe(b, x, y, r, map, s.now / day, lx, ly, lz)
      }
    }
  }
  // the marks over the bodies: stations, gates, derelicts; whose a world is; raiders; hotspots; what is picked
  for (const d of drawn) {
    const { body, x, y, r } = d
    const key = `b${body.index}`
    let mx = x
    let my = y
    if (body.kind === 'base') {
      // (a station over its world is drawn beside it while the two would sit on each other, held to it by a line)
      const w = body.orbit.around >= 0 ? byIndex.get(body.orbit.around) : undefined
      if (w && (w.body.kind === 'planet' || w.body.kind === 'moon') && Math.hypot(w.x - x, w.y - y) < w.r + 9) {
        mx = w.x + w.r + 11
        my = w.y
        line(x, y, mx, my, hex('#5a6078'), 256, 1)
      }
      sprite(sprites[body.role === 'derelict' ? 'derelict' : 'station'], mx - 6, my - 6)
      const h = g.systems[body.system].side
      if (body.role === 'capital' && h) sideMark(h, Math.round(mx + 7), Math.round(my - 6), 2, hex(s.colours[h]))
    } else if (body.kind === 'gate') sprite(sprites.gate, x - 6, y - 6)
    if (body.world >= 0 && g.worlds[body.world].habitable) {
      const h = s.holderOf(g.worlds[body.world].id)
      ring(x, y, r + 2.5, h ? hex(s.colours[h]) : hex('#5a6078'), 256, h ? 0 : 2)
      if (h) sideMark(h, Math.round(x - r - 4), Math.round(y - r - 4), 2, hex(s.colours[h]))
    }
    if (body.world >= 0 && s.hotspots.has(g.worlds[body.world].id)) sprite(sprites.hotspot, x + r - 2, y - r - 13)
    if (s.raiders.has(body.index)) sprite(sprites.raiders, x - Math.max(r, 5) - 11, y - Math.max(r, 5) - 9)
    const pr = body.kind === 'base' || body.kind === 'gate' ? 8 : r + 4
    if (body.index === s.course) ring(mx, my, pr + 1, COURSE)
    if (s.picked === key) brackets(mx, my, pr + 2, INK)
    else if (s.hover === key) brackets(mx, my, pr + 2, INK, 130)
    // its name, under it
    const named =
      body.kind === 'planet' || body.kind === 'giant' || (body.kind === 'base' && body.role !== 'derelict') || body.kind === 'gate'
    if (named) {
      const to = leadsTo(g, body)
      labels.push({
        text: body.kind === 'gate' ? `> ${to?.name.toUpperCase() ?? '?'}` : s.nameOf(body).toUpperCase(),
        x: mx,
        y: my + pr + 2,
        c: body.kind === 'gate' ? GATE_INK : body.kind === 'base' ? hex('#c8c4b4') : DIM,
        rank: (body.kind === 'gate' ? 0 : body.kind === 'giant' ? 1 : body.kind === 'planet' ? 2 : 3) + d.depth / 1e6,
        danger: -1,
      })
    }
    marks.push({ key, x: mx, y: my, r: Math.max(pr + 2, 10), depth: d.depth })
  }
  // the belts' names on their rings (and picked there)
  for (const body of bodies) {
    if (body.kind !== 'belt') continue
    const p = where(body)
    const at = project(b, p[0], p[1], p[2])
    if (!at) continue
    const key = `b${body.index}`
    labels.push({ text: body.name.toUpperCase(), x: at[0], y: at[1] - 2.5 * s.text, c: BELT_INK, rank: -0.5, danger: -1 })
    if (s.raiders.has(body.index)) sprite(sprites.raiders, at[0] - 6, at[1] - 9 - 5 * s.text)
    if (s.picked === key) brackets(at[0], at[1], 10, INK)
    else if (s.hover === key) brackets(at[0], at[1], 10, INK, 130)
    marks.push({ key, x: at[0], y: at[1], r: 12, depth: at[2] })
  }
  // the pilot, and the course from him to where it leads
  if (s.pilot) {
    const px = s.pilot.x * U
    const py = s.pilot.y * U
    const course = s.course >= 0 && g.bodies[s.course]?.system === s.system ? g.bodies[s.course] : null
    if (course) {
      const q = where(course)
      line3(b, [px, py, 0], q, COURSE, 256, 4, s.motion ? -Math.floor(s.t / 90) : 0, 3)
    }
    const at = project(b, px, py, 0)
    if (at) {
      // (which way he points, as the picture shows it)
      const ahead = project(b, px + Math.sin(s.pilot.heading) * 4, py - Math.cos(s.pilot.heading) * 4, 0)
      const a = ahead ? Math.atan2(ahead[0] - at[0], -(ahead[1] - at[1])) : s.pilot.heading
      const pt = (ang: number, len: number) => [at[0] + Math.sin(ang) * len, at[1] - Math.cos(ang) * len]
      const shape = [pt(a, 6), pt(a + 2.45, 5), pt(a + Math.PI, 2), pt(a - 2.45, 5)]
      fill(
        shape.map(([x, y]) => [x + (x - at[0]) * 0.25, y + (y - at[1]) * 0.25]),
        SHADOW,
      )
      fill(shape, hex(s.colours[s.side]))
      const beat = s.motion ? (s.t % 1600) / 1600 : 0.4
      ring(at[0], at[1], 6 + beat * 8, hex(s.colours[s.side]), Math.round(256 * (1 - beat)))
      marks.push({ key: 'me', x: at[0], y: at[1], r: 8, depth: at[2] })
    }
  }
}

/** where a gate or a black hole leads */
export function leadsTo(g: Galaxy, b: Body) {
  if (b.kind === 'gate' && b.lane !== undefined) {
    const l = g.lanes[b.lane]
    return g.systems[l.a === b.system ? l.b : l.a]
  }
  if (b.kind === 'black hole') {
    const l = g.lanes.find((x) => x.kind === 'black hole' && (x.a === b.system || x.b === b.system))
    return l ? g.systems[l.a === b.system ? l.b : l.a] : null
  }
  return null
}

let sprites: Partial<Record<MarkName, Sprite>> = {}

/** draws the map from the camera into the picture; returns where every thing that can be picked was drawn, nearest first */
export function drawMap(into: MapPicture, cam: MapCamera, s: MapScene, marksArt: Partial<Record<MarkName, Sprite>>): MapMark[] {
  pic = into
  W = pic.w
  H = pic.h
  fb = pic.fb
  sprites = marksArt
  labels = []
  const b = basisOf(cam, W, H)
  const marks: MapMark[] = []
  drawSky(b)
  if (s.kind === 'galaxy') drawGalaxy(s, b, marks, cam.dist)
  else drawSystem(s, b, marks)
  writeLabels(s.text)
  return marks.sort((a, c) => a.depth - c.depth)
}

/** the mark under a point of the picture (the nearest of those whose reach it is in), or null */
export function markAt(marks: MapMark[], x: number, y: number): MapMark | null {
  let best: MapMark | null = null
  let bestD = Infinity
  for (const m of marks) {
    const d = Math.hypot(m.x - x, m.y - y)
    if (d <= m.r && d / m.r < bestD) {
      best = m
      bestD = d / m.r
    }
  }
  return best
}

/** where a thing of the map is on its plane (for the camera to go to it), and how large (map units) */
export function placeOf(g: Galaxy, kind: 'galaxy' | 'system', system: number, key: string, now: number) {
  if (key.startsWith('s')) {
    const sy = g.systems[Number(key.slice(1))]
    return { x: galaxyX(sy.x), y: galaxyY(sy.y), size: 40 }
  }
  if (key.startsWith('b') && kind === 'system') {
    const body = g.bodies[Number(key.slice(1))]
    const U = systemUnit(g, system)
    const p = positionAt(g, body, now / ORBIT_SLOW)
    // (a station or a gate is seen among what is round it, not as close as a world)
    const small = body.kind === 'base' || body.kind === 'gate'
    return { x: p.x * U, y: p.y * U, size: small ? 6 : Math.max(2, body.size * U) }
  }
  return null
}
