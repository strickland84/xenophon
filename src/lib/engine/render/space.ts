// Space, drawn (the zone's backdrop: sim/zone.ts). Space is black (the polish pass, item 5): what
// shows in it is a sparse sky of distant stars, the system's sun, and the bodies that are really
// there, each lit from its sun with a day side and a night side. Over that, in the plane where the
// ships fly, the things built there and the rocks: stations, derelicts, gates, a belt's rocks, void
// shards (render/slabs.ts). Over the ships, the transitions: the flash of a jump, a sun's heat.
//
// Every view works here, as over a world (item 6). From overhead the stars drift past slowly (two
// depths of them), a world or a moon far below the plane is drawn smaller than it is and drifts
// past slowly too (data/space.ts OVERHEAD), and the bodies in the plane (suns, giants, black holes)
// are as large as they are. From behind the ship and from the seat, everything is where it is:
// the stars are directions, and each body is a sphere met by the camera's rays (render/globe.ts).
// While the camera moves between the two, one picture gives way to the other pixel by pixel.

import { HOLE, OVERHEAD, OVERHEAD_SHARE, SPACE_Z, STARS } from '../data/space'
import type { StarKind } from '../galaxy/recipe'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8, mulberry32 } from '../util/math'
import { DERELICT, DISC, GATE, ORE_ROCKS, ROCKS, SHARD, STATION_PARTS, SUN } from '../space/art'
import { airOf, giantMap, mapFor } from '../space/maps'
import type { SphereMap } from '../space/maps'
import { bigOf, brightnessOf, pixelsOf } from '../space/pictures'
import { bodyZ, inSpace, orbitTime } from '../sim/space'
import type { SpaceBody } from '../sim/space'
import { docksOf, stationAngle } from '../sim/stations'
import { fadeOf, inAir, spinOf, sunTurn } from '../sim/travel'
import { times } from '../sim/air'
import { SUN as SUNLIGHT } from '../sim/daylight'
import { theGalaxy } from '../galaxy/galaxy'
import { createFrame } from './frame'
import type { Frame } from './frame'
import { deckDrift } from './clouds'
import { WORLD } from '../world/lands'
import { castSun, drawHole, drawSun } from './bodies'
import type { SunColours, Turn } from './bodies'
import { box, castGlobe, drawGlobeTop, drawGlobeTopKept, look, seen, sphereBox } from './globe'
import type { Cam, Globe } from './globe'
import { drawSlab } from './slabs'
import type { Slab } from './slabs'
import type { View } from './view'
import { pr, project } from './view'
import { drawAirCast, drawAirFire, drawAirGlow, drawAirTop, drawFlashes } from './air'

// ── the colours of each kind of star
const STAR_RAMP: Record<StarKind, number[][]> = {
  red: [
    [150, 24, 10],
    [255, 112, 52],
    [255, 226, 170],
  ],
  orange: [
    [170, 60, 10],
    [255, 160, 56],
    [255, 244, 200],
  ],
  yellow: [
    [190, 92, 14],
    [255, 206, 84],
    [255, 252, 228],
  ],
  white: [
    [176, 160, 150],
    [240, 236, 228],
    [255, 255, 255],
  ],
  blue: [
    [60, 96, 210],
    [150, 196, 255],
    [244, 250, 255],
  ],
}
const sunCols = new Map<StarKind, SunColours>()
export function sunColours(kind: StarKind): SunColours {
  let got = sunCols.get(kind)
  if (!got) {
    const [a, b, c] = STAR_RAMP[kind]
    const ramp = new Uint32Array(16)
    for (let i = 0; i < 16; i++) {
      const t = i / 15
      const [p, q, k] = t < 0.55 ? [a, b, t / 0.55] : [b, c, (t - 0.55) / 0.45]
      ramp[i] = pack(p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k)
    }
    // (the glow is the middle colour, a little deeper: it is added to what is behind)
    got = { ramp, glow: pack(b[0] * 0.75, b[1] * 0.55, b[2] * 0.45), flare: pack(b[0], b[1] * 0.8, b[2] * 0.6) }
    sunCols.set(kind, got)
  }
  return got
}

/** space's black: not quite none, so that the night sides of worlds show against it */
export const BLACK = pack(1, 1, 4)

// ── the camera, in perspective

/** the view as a pinhole camera (render/view.ts: a level camera behind the view's point, its picture shifted up and down for its tilt) */
export function camOf(view: View): Cam | null {
  if (view.q < 1e-6) return null
  // (level forward, turned up by the camera's own pitch: in space it looks where the ship points)
  const lx = -view.sin
  const ly = -view.cos
  const fx = lx * view.cp
  const fy = ly * view.cp
  const fz = view.sp
  const ux = -lx * view.sp
  const uy = -ly * view.sp
  const uz = view.cp
  const back = 1 / view.q
  const focal = view.scale / view.q
  const lift = view.tan * back
  return {
    ox: view.x - fx * back + ux * lift,
    oy: view.y - fy * back + uy * lift,
    oz: view.alt - fz * back + uz * lift,
    fx,
    fy,
    fz,
    ux,
    uy,
    uz,
    rx: view.cos,
    ry: -view.sin,
    focal,
    cx: view.cx,
    hy: view.cy - focal * view.tan,
    vx: view.x,
    vy: view.y,
    vz: view.alt,
  }
}

/** how far the picture is in perspective: 0 overhead, 1 from behind or the seat (between, while the camera moves) */
export const perspectiveOf = (view: View) => clamp((view.chase + view.cockpit - 0.15) / 0.55, 0, 1)

// ── the stars

/** the sky's stars as directions, made once from a seed: most faint, a few bright, a very few with a cross */
const SKY = (() => {
  const n = STARS.count
  const dir = new Float32Array(n * 3)
  const col = new Uint32Array(n)
  const big = new Uint8Array(n)
  const rnd = mulberry32(7727)
  for (let i = 0; i < n; i++) {
    const z = rnd() * 2 - 1
    const a = rnd() * Math.PI * 2
    const r = Math.sqrt(1 - z * z)
    dir[i * 3] = r * Math.cos(a)
    dir[i * 3 + 1] = r * Math.sin(a)
    dir[i * 3 + 2] = z
    const m = rnd()
    const k = m < 0.82 ? 40 + rnd() * 70 : m < 0.97 ? 110 + rnd() * 80 : 200 + rnd() * 55
    const hue = rnd()
    col[i] = hue < 0.12 ? pack(k, k * 0.82, k * 0.62) : hue < 0.24 ? pack(k * 0.74, k * 0.84, k) : pack(k, k, k)
    big[i] = m > 0.993 ? 1 : 0
  }
  return { n, dir, col, big }
})()

/** the stars of the sky through the camera: each a point, the brightest few with a small cross */
function drawSky(f: Frame, c: Cam) {
  const { w: W, fb } = f
  const { n, dir, col, big } = SKY
  for (let i = 0; i < n; i++) {
    const dx = dir[i * 3]
    const dy = dir[i * 3 + 1]
    const dz = dir[i * 3 + 2]
    const d = dx * c.fx + dy * c.fy + dz * c.fz
    if (d <= 0.05) continue
    const k = c.focal / d
    const x = Math.round(c.cx + (dx * c.rx + dy * c.ry) * k)
    const y = Math.round(c.hy - (dx * c.ux + dy * c.uy + dz * c.uz) * k)
    if (x < f.colLo || y < f.rowLo || x >= f.colHi || y >= f.rowHi) continue
    fb[y * W + x] = col[i]
    if (big[i]) {
      const dim = blend(BLACK, col[i], 110)
      if (x > f.colLo) fb[y * W + x - 1] = dim
      if (x < f.colHi - 1) fb[y * W + x + 1] = dim
      if (y > f.rowLo) fb[(y - 1) * W + x] = dim
      if (y < f.rowHi - 1) fb[(y + 1) * W + x] = dim
    }
  }
}

/**
 * Cruising, seen from behind or the seat: the stars are too far to move, so the speed shows in dust
 * streaming past, specks in the dark close to the ship (each from its place in a grid round the
 * camera, the same for everyone), drawn as streaks the way it goes.
 */
function drawDust(scene: SceneState, f: Frame, c: Cam) {
  const sp = scene.space
  if (sp.pace < 3.5) return
  const j = scene.jets[0]
  const k = Math.min(1, (sp.pace - 3.5) / 6)
  const v = scene.speed
  const vx = Math.sin(j.yaw) * v
  const vy = -Math.cos(j.yaw) * v
  // (a streak is where a speck is now and where it was a moment ago, against the ship)
  const back = Math.min(0.05, 120 / Math.max(1, v))
  const C = 260
  const R = 3
  const gx0 = Math.floor(c.ox / C)
  const gy0 = Math.floor(c.oy / C)
  const gz0 = Math.floor(c.oz / C)
  const { w: W, fb } = f
  for (let gz = gz0 - 1; gz <= gz0 + 1; gz++)
    for (let gy = gy0 - R; gy <= gy0 + R; gy++)
      for (let gx = gx0 - R; gx <= gx0 + R; gx++) {
        const h = hash8(((gx * 73856093) ^ (gy * 19349663) ^ (gz * 83492791)) | 0)
        if (h > 110 * k) continue
        const px = gx * C + (hash8(h * 31 + gx) / 255) * C
        const py = gy * C + (hash8(h * 17 + gy) / 255) * C
        const pz = gz * C + (hash8(h * 7 + gz) / 255) * C
        if (!look(c, px, py, pz)) continue
        const x1 = seen.x
        const y1 = seen.y
        const d = seen.d
        if (!look(c, px + vx * back, py + vy * back, pz)) continue
        const x0 = seen.x
        const y0 = seen.y
        const len = Math.hypot(x1 - x0, y1 - y0)
        const n = Math.min(40, Math.ceil(len))
        const bright = Math.round(Math.max(40, Math.min(200, 60000 / d)) * k)
        for (let i = 0; i <= n; i++) {
          const t = n ? i / n : 0
          const x = Math.round(x0 + (x1 - x0) * t)
          const y = Math.round(y0 + (y1 - y0) * t)
          if (x < f.colLo || y < f.rowLo || x >= f.colHi || y >= f.rowHi) continue
          const o = y * W + x
          if (f.zbuf[o] < 1e9) continue
          fb[o] = blend(fb[o], DUST, Math.round(bright * t))
        }
      }
}
const DUST = pack(196, 210, 236)

/** each overhead depth of stars: its cells (px square), and how likely a cell is to hold one */
const STAR_CELL = [30, 52]
const STAR_ODDS = [0.34, 0.3]

/** the stars from overhead: two depths of them far below, drifting past very slowly; cruising, they streak */
function drawStarsTop(scene: SceneState, f: Frame, turn: Turn) {
  const { view } = scene
  const { w: W, fb } = f
  const c = turn.cos
  const s = turn.sin
  const sp = scene.space
  const streak = sp.pace > 3 ? Math.min(7, Math.log(sp.pace / 3) * 1.8) : 0
  const j = scene.jets[0]
  const vxs = streak > 0 ? Math.sin(j.yaw) : 0
  const vys = streak > 0 ? -Math.cos(j.yaw) : 0
  const svx = vxs * c - vys * s
  const svy = vxs * s + vys * c
  const cx = view.cx
  const cy = view.cy
  const reach = Math.sqrt(f.w * f.w + f.h * f.h) / 2 + 4
  for (let layer = 0; layer < 2; layer++) {
    const pace = STARS.drift[layer]
    const C = STAR_CELL[layer]
    const odds = STAR_ODDS[layer] * 255
    // (the drift wraps far out, so the numbers stay small however far the ship goes)
    const lx = (view.x * pace) % (C * 4096)
    const ly = (view.y * pace) % (C * 4096)
    const gx0 = Math.floor((lx - reach) / C)
    const gx1 = Math.floor((lx + reach) / C)
    const gy0 = Math.floor((ly - reach) / C)
    const gy1 = Math.floor((ly + reach) / C)
    const len = streak * (layer + 0.6)
    for (let gy = gy0; gy <= gy1; gy++)
      for (let gx = gx0; gx <= gx1; gx++) {
        const h0 = hash8(gx * 7919 + gy * 104729 + layer * 31)
        if (h0 > odds) continue
        const h1 = hash8(gx * 263 + gy * 71 + layer * 977)
        const h2 = hash8(gx * 131 + gy * 1543 + layer * 59)
        const px = gx * C + (h1 / 255) * C - lx
        const py = gy * C + (h2 / 255) * C - ly
        const sx = cx + px * c - py * s
        const sy = cy + px * s + py * c
        if (sx < f.colLo - len - 2 || sy < f.rowLo - len - 2 || sx >= f.colHi + len + 2 || sy >= f.rowHi + len + 2) continue
        // its brightness and colour: most faint and white, a few warm or blue, a very few bright
        const bright = (h0 & 31) === 0
        const b = bright ? 200 + (h1 & 55) : 50 + layer * 40 + (h0 & 63)
        const tw = 1 + 0.15 * Math.sin(scene.time * (1.1 + (h1 & 7) * 0.3) + h2)
        const k = clamp(b * tw, 0, 255)
        const hue = h1 & 15
        const col = hue < 2 ? pack(k, k * 0.82, k * 0.62) : hue < 4 ? pack(k * 0.74, k * 0.84, k) : pack(k, k, k)
        if (len > 0.8) {
          for (let i = 0; i <= len; i++) {
            const qx = Math.round(sx - svx * i)
            const qy = Math.round(sy - svy * i)
            if (qx >= f.colLo && qy >= f.rowLo && qx < f.colHi && qy < f.rowHi)
              fb[qy * W + qx] = blend(fb[qy * W + qx], col, Math.round(255 * (1 - i / (len + 1))))
          }
          continue
        }
        const ix = Math.round(sx)
        const iy = Math.round(sy)
        if (ix < f.colLo || iy < f.rowLo || ix >= f.colHi || iy >= f.rowHi) continue
        fb[iy * W + ix] = col
        if (bright && layer === 1 && k > 200) {
          const dim = blend(BLACK, col, 100)
          if (ix > f.colLo) fb[iy * W + ix - 1] = dim
          if (ix < f.colHi - 1) fb[iy * W + ix + 1] = dim
          if (iy > f.rowLo) fb[(iy - 1) * W + ix] = dim
          if (iy < f.rowHi - 1) fb[(iy + 1) * W + ix] = dim
        }
      }
  }
}

// ── the bodies

/** a world far off, by its kind: the two colours most of it is (its sea and its land; its rock, its ice, its lava) */
export const FAR_COLOURS: Record<string, number[][]> = {
  archipelago: [
    [40, 104, 190],
    [92, 170, 72],
  ],
  continental: [
    [44, 100, 176],
    [112, 160, 84],
  ],
  ocean: [
    [32, 92, 186],
    [58, 132, 206],
  ],
  jungle: [
    [38, 104, 96],
    [52, 142, 62],
  ],
  mesa: [
    [214, 150, 110],
    [168, 100, 82],
  ],
  canyon: [
    [192, 122, 92],
    [146, 88, 72],
  ],
  ice: [
    [228, 238, 248],
    [150, 182, 214],
  ],
  volcanic: [
    [66, 48, 50],
    [226, 108, 40],
  ],
  moon: [
    [152, 152, 154],
    [108, 108, 112],
  ],
}

/** a world's or moon's map, or a plain one standing in until it is built; a giant's bands */
const plainMaps = new Map<string, SphereMap>()
export function sphereMapOf(b: SpaceBody['body'], small = false): SphereMap {
  const g = theGalaxy()
  const light = g.systems[b.system].light
  if (b.kind === 'giant') return giantMap(b.index * 7 + b.system, light)
  const id = g.worlds[b.world]?.id ?? ''
  // (a world a few pixels across is drawn plain, whatever is built: what a frame shows never hangs on what was built before it)
  const got = small ? null : mapFor(id)
  if (got) return got
  let plain = plainMaps.get(id)
  if (!plain) {
    // (a small world in its own colours, until its own map is here and whenever it is a few pixels across: its sea and its
    // land, or its rock, its ice, its lava, by the kind of world it is, in patches. It was one pale colour made from its
    // air: far off every world was the same white blob, and nobody could tell what they were)
    const [a, b2] = FAR_COLOURS[g.worlds[b.world]?.recipe.archetype ?? ''] ?? FAR_COLOURS.moon
    const tint = light ?? [1, 1, 1]
    const tones = [a, b2, [(a[0] + b2[0]) / 2, (a[1] + b2[1]) / 2, (a[2] + b2[2]) / 2]]
    const lit = new Uint32Array(tones.length * 8)
    tones.forEach((c, i) => {
      for (let l = 0; l < 8; l++) {
        const k = 0.16 + 0.84 * Math.pow(l / 7, 0.85)
        lit[i * 8 + l] = pack(c[0] * k * tint[0], c[1] * k * tint[1], c[2] * k * tint[2])
      }
    })
    const idx = new Uint8Array(16 * 8)
    for (let i = 0; i < idx.length; i++) {
      const n = hash8(b.index * 131 + (i >> 1) * 17 + ((i >> 5) & 3) * 71)
      idx[i] = n < 120 ? 0 : n < 200 ? 1 : 2
    }
    const air = airOf(id)
    plain = { w: 16, h: 8, span: 8, idx, lit, clouds: null, air: air ? pack(air[0], air[1], air[2]) : 0 }
    plainMaps.set(id, plain)
  }
  return plain
}

/** the direction (unit, in the world) from a body to the nearest of its system's suns: what lights it */
export function sunDirection(scene: SceneState, b: SpaceBody) {
  let sx = 0
  let sy = 0
  let best = Infinity
  for (const o of scene.space.bodies) {
    if (o.body.kind !== 'sun' || o === b) continue
    const d = Math.hypot(o.x - b.x, o.y - b.y)
    if (d < best) {
      best = d
      sx = o.x - b.x
      sy = o.y - b.y
    }
  }
  // a world or a moon with a ground of its own: lit from its sun's side and a good way over it, in its own frame, which
  // is turned to its sun (sim/daylight.ts SUN): most of the side a ship flies over is in day, and its ground turns
  // through it into the dark. (Lit from the sun's true way, level with the plane, that side was half dark at best.)
  if (b.body.world >= 0) {
    const a = sunTurn(scene.space.bodies, b)
    return { x: Math.cos(a) * SUNLIGHT.x, y: Math.sin(a) * SUNLIGHT.x, z: SUNLIGHT.z }
  }
  const sz = SPACE_Z - bodyZ(b.body)
  const d = Math.hypot(sx, sy, sz) || 1
  return { x: sx / d, y: sy / d, z: sz / d }
}

/** a world's own frame in the plane's: turned about the plane's own up so that its x is towards its sun (world = Q · body) */
export function worldTurn(a: number): Float64Array {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1])
}

/** a giant's axis is tipped, the same way for everyone, so its bands show as bands from overhead and from the side */
const giantTurns = new Map<number, Float64Array>()
function giantTurn(index: number) {
  let q = giantTurns.get(index)
  if (!q) {
    const tilt = 0.85 + (hash8(index * 17 + 3) / 255) * 0.35
    const a = (hash8(index * 29 + 11) / 255) * Math.PI * 2
    // its axis (the body's y), tipped `tilt` from straight up towards `a`
    const ay = [Math.sin(tilt) * Math.cos(a), Math.sin(tilt) * Math.sin(a), Math.cos(tilt)]
    // the body's z (the middle of its map) level, square to the axis; and x = y × z
    let az = [-Math.sin(a), Math.cos(a), 0]
    const n = Math.hypot(az[0], az[1], az[2]) || 1
    az = [az[0] / n, az[1] / n, az[2] / n]
    const ax = [ay[1] * az[2] - ay[2] * az[1], ay[2] * az[0] - ay[0] * az[2], ay[0] * az[1] - ay[1] * az[0]]
    // world = Q · body: Q's columns are the body's axes in the world
    q = new Float64Array([ax[0], ay[0], az[0], ax[1], ay[1], az[1], ax[2], ay[2], az[2]])
    giantTurns.set(index, q)
  }
  return q
}

const IDENT = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])

/** a world, a moon or a giant as a globe, where it is and as it is turned (the way down turns one: render/air.ts) */
export function globeOf(scene: SceneState, b: SpaceBody, small = false): Globe {
  // (a world's frame is turned to its sun; and its globe may have been turned on for this pilot: sim/travel.ts turnedOn)
  const own = scene.spun[b.body.index]
  const facing = b.body.world >= 0 ? worldTurn(sunTurn(scene.space.bodies, b)) : IDENT
  const q = b.body.kind === 'giant' ? giantTurn(b.body.index) : own ? times(facing, own) : facing
  const l = sunDirection(scene, b)
  // (the light into the body's own frame: Qᵀ · l)
  const lx = q[0] * l.x + q[3] * l.y + q[6] * l.z
  const ly = q[1] * l.x + q[4] * l.y + q[7] * l.z
  const lz = q[2] * l.x + q[5] * l.y + q[8] * l.z
  const spin = spinOf(scene, b.body)
  // (a world's clouds are its ground's own, where they have drifted to: the same clouds from space, on the way down and under them)
  const drift = deckDrift(scene)
  return {
    map: sphereMapOf(b.body, small),
    x: b.x,
    y: b.y,
    z: bodyZ(b.body),
    r: b.body.size,
    q,
    spin,
    cloudSpin: -drift[0] / WORLD,
    cloudDown: -drift[1] / WORLD,
    us: 0,
    vs: 0,
    zoom: 1,
    ew: 1,
    local: 0,
    sx: 0,
    sy: 0,
    sz: 1,
    ex: 1,
    ey: 0,
    ez: 0,
    nx: 0,
    ny: 1,
    nz: 0,
    lx,
    ly,
    lz,
    flat: 0,
    air: 0,
    dusk: b.body.world >= 0 ? DUSK : 0,
  }
}

/** how far past where its sun sets a world's ground is still lit, on its globe: its dusk, as the ground has it (sim/daylight.ts DAY) */
export const DUSK = 0.3

/** how large a world or moon below the plane is drawn from overhead (its disc's radius, px), and so how fast it drifts past */
export const overheadRadius = (b: SpaceBody['body']) =>
  b.kind in OVERHEAD_SHARE ? b.size * OVERHEAD_SHARE[b.kind] : b.kind === 'moon' ? OVERHEAD.moon : OVERHEAD.world

/** where a point of the plane is on the frame from overhead, and whether a disc of radius r round it can be seen */
const at = { x: 0, y: 0 }
function onFrame(scene: SceneState, f: Frame, x: number, y: number, r: number) {
  const v = scene.view
  const dx = x - v.x
  const dy = y - v.y
  at.x = v.cx + dx * v.cos - dy * v.sin
  at.y = v.cy + dx * v.sin + dy * v.cos - (SPACE_Z - v.alt)
  return at.x + r >= f.colLo && at.y + r >= f.rowLo && at.x - r < f.colHi && at.y - r < f.rowHi
}

/**
 * Where a body is on the frame as it is drawn now (its middle; for a world or moon from overhead, the
 * middle of its smaller disc far below): for the HUD's marks. Null when it is behind the camera.
 */
export function bodyOnFrame(scene: SceneState, b: SpaceBody): { x: number; y: number } | null {
  const view = scene.view
  const k = b.body.kind
  const below = k === 'planet' || k === 'moon' || k in OVERHEAD_SHARE
  if (perspectiveOf(view) >= 0.5) {
    const c = camOf(view)
    if (!c || !look(c, b.x, b.y, bodyZ(b.body))) return null
    return { x: seen.x, y: seen.y }
  }
  if (!below) {
    const dx = b.x - view.x
    const dy = b.y - view.y
    return { x: view.cx + dx * view.cos - dy * view.sin, y: view.cy + dx * view.sin + dy * view.cos - (SPACE_Z - view.alt) }
  }
  const j = scene.jets[0]
  const p = overheadRadius(b.body) / b.body.size
  const sx = view.cx + (j.x - view.x) * view.cos - (j.y - view.y) * view.sin
  const sy = view.cy + (j.x - view.x) * view.sin + (j.y - view.y) * view.cos - (SPACE_Z - view.alt)
  const dx = b.x - j.x
  const dy = b.y - j.y
  return { x: sx + p * (dx * view.cos - dy * view.sin), y: sy + p * (dx * view.sin + dy * view.cos) }
}

/** the order kinds of body are drawn in from overhead, near to far (the bodies in the plane, then moons and worlds below it); black holes last, bending what is drawn */
const TOP_ORDER: Record<string, number> = { giant: 0, sun: 1, moon: 2, planet: 3, 'black hole': 4 }

/** the bodies from overhead */
function drawBodiesTop(scene: SceneState, f: Frame, turn: Turn, skip: number) {
  const sp = scene.space
  const t = scene.time
  const j = scene.jets[0]
  const view = scene.view
  const list = sp.bodies.filter(
    (b) =>
      b.body.index !== skip && b.body.kind in TOP_ORDER && (b.body.kind !== 'planet' && b.body.kind !== 'moon' ? true : b.body.world >= 0),
  )
  list.sort((a, b) => TOP_ORDER[a.body.kind] - TOP_ORDER[b.body.kind] || a.body.size - b.body.size)
  for (const b of list) {
    const k = b.body.kind
    const size = b.body.size
    if (k in OVERHEAD_SHARE) {
      // a sun, a giant or a black hole: pulled back as the worlds are, drifting past round the ship (data/space.ts OVERHEAD_SHARE)
      const rho = overheadRadius(b.body)
      const p = rho / size
      onFrame(scene, f, j.x, j.y, 0)
      const dx = b.x - j.x
      const dy = b.y - j.y
      const cx = at.x + p * (dx * view.cos - dy * view.sin)
      const cy = at.y + p * (dx * view.sin + dy * view.cos)
      const reach = rho * (k === 'sun' ? 2.6 : k === 'black hole' ? HOLE.lens : 1.06)
      if (cx + reach < f.colLo || cy + reach < f.rowLo || cx - reach >= f.colHi || cy - reach >= f.rowHi) continue
      if (k === 'sun')
        drawSun(f, cx, cy, rho, sunColours(b.body.star ?? 'yellow'), brightnessOf(SUN), SUN.w, t * 2 + b.body.index * 13, turn)
      else if (k === 'black hole') {
        const d = pixelsOf(DISC)
        drawHole(f, cx, cy, rho, d.px, DISC.w, DISC.h, t * 0.6 + b.body.index, turn, HOLE.ring, HOLE.horizon, HOLE.disc, HOLE.lens)
      } else drawGlobeTop(f, globeOf(scene, b), cx, cy, rho, turn.cos, turn.sin)
    } else {
      // a world or a moon far below: smaller than it is, and drifting past slowly round the ship
      const rho = overheadRadius(b.body)
      const p = rho / size
      onFrame(scene, f, j.x, j.y, 0)
      const sx = at.x
      const sy = at.y
      const dx = b.x - j.x
      const dy = b.y - j.y
      const cx = sx + p * (dx * view.cos - dy * view.sin)
      const cy = sy + p * (dx * view.sin + dy * view.cos)
      if (cx + rho * 1.05 < f.colLo || cy + rho * 1.05 < f.rowLo || cx - rho * 1.05 >= f.colHi || cy - rho * 1.05 >= f.rowHi) continue
      drawGlobeTopKept(f, globeOf(scene, b), b.body.index, cx, cy, rho, turn.cos, turn.sin, scene.time)
    }
  }
}

/** the bodies in perspective: near ones first (each far one only where nothing nearer covers it); black holes last, bending what is drawn */
const byFar: { b: SpaceBody; d: number }[] = []
function castBodies(scene: SceneState, f: Frame, c: Cam, skip: number) {
  const sp = scene.space
  const t = scene.time
  byFar.length = 0
  for (const b of sp.bodies) {
    const k = b.body.kind
    if (b.body.index === skip) continue
    if (k !== 'sun' && k !== 'giant' && k !== 'black hole' && !((k === 'planet' || k === 'moon') && b.body.world >= 0)) continue
    const z = bodyZ(b.body)
    byFar.push({ b, d: Math.hypot(b.x - c.ox, b.y - c.oy, z - c.oz) - b.body.size })
  }
  byFar.sort((p, q) => (p.b.body.kind === 'black hole' ? 1 : 0) - (q.b.body.kind === 'black hole' ? 1 : 0) || p.d - q.d)
  // (in a gas giant's bands, the clouds hide whatever is beyond them, black holes too)
  const fogged = byFar.some((p) => p.d < 0 && p.b.body.kind === 'giant')
  for (const { b } of byFar) {
    const k = b.body.kind
    const size = b.body.size
    const z = bodyZ(b.body)
    if (k === 'sun') {
      if (!sphereBox(f, c, b.x, b.y, z, size * 2.7)) continue
      castSun(
        f,
        c,
        b.x,
        b.y,
        z,
        size,
        sunColours(b.body.star ?? 'yellow'),
        brightnessOf(SUN),
        SUN.w,
        t * 2 + b.body.index * 13,
        box.x0,
        box.y0,
        box.x1,
        box.y1,
      )
    } else if (k === 'black hole') {
      // (it bends what is behind it as the frame sees it: drawn where its middle is, as large as it looks)
      if (fogged || !look(c, b.x, b.y, z)) continue
      const s = (size * c.focal) / seen.d
      if (s < 0.6 || seen.x + s * HOLE.lens < f.colLo || seen.x - s * HOLE.lens >= f.colHi) continue
      // (a body nearer than it, drawn already, stays in front of it: depth as a ship's is measured)
      const near = (b.x - c.vx) * c.fx + (b.y - c.vy) * c.fy + (z - c.vz) * c.fz - size
      const d = pixelsOf(DISC)
      drawHole(
        f,
        seen.x,
        seen.y,
        s,
        d.px,
        DISC.w,
        DISC.h,
        t * 0.6 + b.body.index,
        { cos: 1, sin: 0 },
        HOLE.ring,
        HOLE.horizon,
        HOLE.disc,
        HOLE.lens,
        near,
        // (its disc lies in the plane: seen from beside it, tilted away by the eye's height over it, never quite edge on)
        Math.max(0.12, Math.min(1, Math.abs(c.oz - z) / Math.hypot(c.oz - z, seen.d))),
      )
    } else {
      // (wholly off the frame: nothing; so small it is a few pixels: its plain colours do, and its map need not be built)
      if (!sphereBox(f, c, b.x, b.y, z, size * 1.06)) continue
      const g = globeOf(scene, b, look(c, b.x, b.y, z) && (size * c.focal) / seen.d < 3)
      castGlobe(f, g, c)
    }
  }
}

// ── the things built in space, and the rocks: stacks of slices in the plane

const slab: Slab = { big: bigOf(pixelsOf(GATE)), x: 0, y: 0, z: 0, tall: 1, angle: 0, lump: 0, side: 0, dim: 256 }
/** how thick each part is, px, and how far under the plane its top is (ships pass over them) */
const UNDER = 2

/** a station, built from its parts: solar wings between its arms, an arm out to each dock, tanks, and its hub over the middle */
function drawStation(scene: SceneState, f: Frame, b: SpaceBody) {
  const docks = docksOf(b)
  const hub =
    b.body.role === 'capital'
      ? b.body.name === 'Meridian Ring'
        ? STATION_PARTS['hub-nomarchy']
        : STATION_PARTS['hub-anarchoi']
      : STATION_PARTS['hub-outpost']
  const armLen = STATION_PARTS.arm.w
  const n = docks.length
  const a0 = stationAngle(b)
  const top = SPACE_Z - UNDER
  const v = scene.view
  const put = (big: Slab['big'], x: number, y: number, tall: number, angle: number, side: number) => {
    slab.big = big
    slab.x = x
    slab.y = y
    slab.z = top - tall
    slab.tall = tall
    slab.angle = angle
    slab.lump = 0
    slab.side = side
    slab.dim = 256
    drawSlab(f, v, slab)
  }
  // the solar wings, between the arms
  for (let k = 0; k < n; k++) {
    const a = a0 + ((k + 0.5) * Math.PI * 2) / n
    const r = b.body.size * 0.95
    put(bigOf(pixelsOf(STATION_PARTS.solar)), b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 1, a, 60)
  }
  // an arm out to each dock (its bay at the dock's end)
  for (const d of docks) {
    const r = b.body.size * 1.3 - armLen / 2 + 4
    put(bigOf(pixelsOf(STATION_PARTS.arm)), b.x + Math.cos(d.a) * r, b.y + Math.sin(d.a) * r, 4, d.a, 110)
  }
  // tanks on an outpost's open side
  if (b.body.role !== 'capital') {
    const a = a0 + Math.PI * (n === 3 ? 1 / 3 : 0.25)
    put(bigOf(pixelsOf(STATION_PARTS.tanks)), b.x + Math.cos(a) * b.body.size * 0.62, b.y + Math.sin(a) * b.body.size * 0.62, 7, a, 120)
  }
  put(bigOf(pixelsOf(hub)), b.x, b.y, b.body.role === 'capital' ? 12 : 9, a0, 130)
  // its turrets on the hub, each turned to what it aims at
  const turret = bigOf(pixelsOf(STATION_PARTS.turret))
  const hubTop = b.body.role === 'capital' ? 12 : 9
  for (const t of scene.loop.turrets) {
    if (t.station !== b.body.index) continue
    slab.big = turret
    slab.x = t.f.jet.x
    slab.y = t.f.jet.y
    slab.z = top - 1
    slab.tall = hubTop > 9 ? 4 : 3
    slab.angle = t.yaw
    slab.lump = 0.2
    slab.side = 120
    slab.dim = 256
    drawSlab(f, v, slab)
  }
  // its lights blink at the docks
  if (((scene.time * 2 + b.body.index) | 0) % 2 === 0)
    for (const d of docks) {
      const x = d.x + Math.cos(d.a) * 4
      const y = d.y + Math.sin(d.a) * 4
      lamp(scene, f, x, y, top + 1, pack(255, 230, 120))
    }
}

/** a lamp: a single bright pixel where a point of the world is, through whichever view */
function lamp(scene: SceneState, f: Frame, x: number, y: number, z: number, col: number) {
  if (!project(scene.view, x, y, z)) return
  const px = Math.round(pr.x)
  const py = Math.round(pr.y)
  const depth = pr.v
  if (px < f.colLo || py < f.rowLo || px >= f.colHi || py >= f.rowHi) return
  const o = py * f.w + px
  if (f.zbuf[o] < depth - 1) return
  f.fb[o] = col
}

/** a derelict: the wreck of a station, turning slowly, sparks now and then */
function drawDerelict(scene: SceneState, f: Frame, b: SpaceBody) {
  slab.big = bigOf(pixelsOf(DERELICT))
  slab.x = b.x
  slab.y = b.y
  slab.z = SPACE_Z - UNDER - 8
  slab.tall = 8
  slab.angle = orbitTime(scene) * 0.4 + b.body.index
  slab.lump = 0.3
  slab.side = 140
  slab.dim = 256
  drawSlab(f, scene.view, slab)
  const n = (scene.time * 7) | 0
  if (hash8(n + b.body.index * 31) < 40)
    lamp(scene, f, b.x + (hash8(n * 3) - 128) * 0.3, b.y + (hash8(n * 5) - 128) * 0.3, SPACE_Z, pack(255, 120, 60))
}

/** a jump gate: its ring, facing along its lane, and the field inside it, brighter as it charges */
function drawGate(scene: SceneState, f: Frame, b: SpaceBody) {
  const out = Math.atan2(b.y, b.x)
  const tr = scene.travel
  const charging = tr.kind === 'gate' && tr.from === b.body.index && !tr.switched ? clamp(tr.t / 3, 0, 1) : 0
  drawField(scene, f, b.x, b.y, SPACE_Z - UNDER - 2, b.body.size * 0.66, charging)
  slab.big = bigOf(pixelsOf(GATE))
  slab.x = b.x
  slab.y = b.y
  slab.z = SPACE_Z - UNDER - 6
  slab.tall = 6
  slab.angle = out
  slab.lump = 0
  slab.side = 120
  slab.dim = 256
  drawSlab(f, scene.view, slab)
}

/** a gate's field: a swirl of blue light in the plane inside the ring, laid out through the view as the slices are */
function drawField(scene: SceneState, f: Frame, gx: number, gy: number, z: number, R: number, charging: number) {
  const v = scene.view
  const { w: W, fb } = f
  const glow = pack(110, 190, 255)
  const white = pack(236, 248, 255)
  const t = scene.time
  const q = v.q
  const S = v.scale
  const tn = v.tan
  const dz = z - v.alt
  // the rows it covers: those its box's corners reach
  let ylo = 1e9
  let yhi = -1e9
  let xlo = 1e9
  let xhi = -1e9
  const cp = v.cp
  const sp = v.sp
  for (let i = 0; i < 4; i++) {
    const wx = gx + (i & 1 ? R : -R) - v.x
    const wy = gy + (i & 2 ? R : -R) - v.y
    const lev = -(wx * v.sin + wy * v.cos)
    const dep = lev * cp + dz * sp
    const den = 1 + q * dep
    if (den < 0.1) return
    const m = S / den
    const sx = v.cx + m * (wx * v.cos - wy * v.sin)
    const sy = v.cy - m * (dz * cp - lev * sp + tn * dep)
    xlo = Math.min(xlo, sx)
    xhi = Math.max(xhi, sx)
    ylo = Math.min(ylo, sy)
    yhi = Math.max(yhi, sy)
  }
  const ya = Math.max(f.rowLo, Math.floor(ylo))
  const yb = Math.min(f.rowHi - 1, Math.ceil(yhi))
  const xa = Math.max(f.colLo, Math.floor(xlo))
  const xb = Math.min(f.colHi - 1, Math.ceil(xhi))
  for (let y = ya; y <= yb; y++) {
    const dyc = y + 0.5 - v.cy
    // (how far across the plane, level, this row meets the field, and how deep into the view that is: render/slabs.ts)
    const den = q * dyc * cp + S * (tn * cp - sp)
    if (Math.abs(den) < 1e-9) continue
    const dep = -(dyc * (1 + q * dz * sp) + S * dz * (cp + tn * sp)) / den
    const deep = dep * cp + dz * sp
    const dd = 1 + q * deep
    if (dd < 0.1) continue
    const step = dd / S
    for (let x = xa; x <= xb; x++) {
      const u = (x + 0.5 - v.cx) * step
      // (back into the world, from the field's middle)
      const wx = u * v.cos - dep * v.sin + v.x - gx
      const wy = -u * v.sin - dep * v.cos + v.y - gy
      const r = Math.sqrt(wx * wx + wy * wy) / R
      if (r >= 1) continue
      const o = y * W + x
      if (f.zbuf[o] < deep - 1) continue
      const a = Math.atan2(wy, wx)
      const swirl = Math.sin(a * 3 + r * 9 - t * (2 + charging * 6)) * 0.5 + 0.5
      const k = (0.12 + 0.25 * swirl * r + charging * (0.6 - 0.4 * r)) * (1 - r * r * 0.4)
      const bi = ((y & 3) << 2) | (x & 3)
      if (k * 16 > BAYER[bi]) fb[o] = blend(fb[o], k > 0.7 ? white : glow, Math.round(clamp(k, 0, 1) * 200))
    }
  }
}

/** the rocks round the player, each a lump turning slowly */
function drawRocks(scene: SceneState, f: Frame) {
  const t = scene.time
  for (const r of scene.space.rocks) {
    const size = sizeIndex(r.r)
    // (a rock with its ore cut out is drawn bare)
    const left = r.stock > 0 ? leftOf(scene, r.id, r.stock) : 0
    const pic = r.stock > 0 && left > 0 ? ORE_ROCKS[r.art][size] : r.stock > 0 ? ROCKS[r.id % ROCKS.length][size] : ROCKS[r.art][size]
    slab.big = bigOf(pixelsOf(pic))
    slab.x = r.x
    slab.y = r.y
    slab.z = SPACE_Z - r.r * 0.7
    slab.tall = r.r * 1.4
    slab.angle = r.turn + r.spin * t
    slab.lump = 0.85
    slab.side = 150
    slab.dim = 256
    drawSlab(f, scene.view, slab)
  }
}

/** which of the rocks' sizes a rock of radius r is drawn at */
export function sizeIndex(r: number) {
  const sizes = [12, 18, 26, 36, 46, 56]
  let best = 0
  for (let i = 1; i < sizes.length; i++) if (Math.abs(sizes[i] - r * 2) < Math.abs(sizes[best] - r * 2)) best = i
  return best
}

/** units left in a rock (as mining.ts counts them, without importing it) */
function leftOf(scene: SceneState, id: number, stock: number) {
  const tk = scene.loop.taken.get(id)
  return tk ? stock - tk.n : stock
}

/** the void shards, glowing */
function drawShards(scene: SceneState, f: Frame) {
  const big = bigOf(pixelsOf(SHARD))
  for (const s of scene.space.shards) {
    // a glow round it, pulsing (a small one, wherever it is on the frame)
    if (!project(scene.view, s.x, s.y, SPACE_Z)) continue
    const m = pr.m
    const x = Math.round(pr.x)
    const y = Math.round(pr.y)
    if (x < f.colLo - 12 || y < f.rowLo - 12 || x >= f.colHi + 12 || y >= f.rowHi + 12) continue
    const pulse = 0.5 + 0.5 * Math.sin(scene.time * 4 + s.id)
    const rad = Math.max(2, 4.5 * Math.min(2, m))
    const ir = Math.ceil(rad)
    for (let oy = -ir; oy <= ir; oy++)
      for (let ox = -ir; ox <= ir; ox++) {
        const d = Math.hypot(ox, oy) / rad
        const px = x + ox
        const py = y + oy
        if (d >= 1 || px < f.colLo || py < f.rowLo || px >= f.colHi || py >= f.rowHi) continue
        const k = (1 - d) * (0.4 + 0.4 * pulse)
        if (k * 16 > BAYER[((py & 3) << 2) | (px & 3)]) f.fb[py * f.w + px] = blend(f.fb[py * f.w + px], pack(200, 120, 255), 110)
      }
    slab.big = big
    slab.x = s.x
    slab.y = s.y
    slab.z = SPACE_Z - 2
    slab.tall = 3
    slab.angle = s.turn
    slab.lump = 0.5
    slab.side = 60
    slab.dim = 256
    drawSlab(f, scene.view, slab)
  }
}

/** the things built in space and the rocks, through whichever view */
function drawStructures(scene: SceneState, f: Frame) {
  const j = scene.jets[0]
  for (const b of scene.space.bodies) {
    const k = b.body.kind
    if (k !== 'base' && k !== 'gate') continue
    // (far ones are less than a pixel from overhead, and hidden by the ship's own size from behind: not drawn)
    if (Math.hypot(b.x - j.x, b.y - j.y) > 9000) continue
    if (k === 'gate') drawGate(scene, f, b)
    else if (b.body.role === 'derelict') drawDerelict(scene, f, b)
    else drawStation(scene, f, b)
  }
  drawRocks(scene, f)
  drawShards(scene, f)
}

// ── the backdrop, whole

/** a frame to draw the other picture into while the camera moves between overhead and perspective */
let other: Frame | null = null

/** draws space: black, the stars, the bodies; then what is built in the plane */
export function drawSpace(scene: SceneState, f: Frame) {
  const { w: W, fb, zbuf } = f
  for (let y = f.rowLo; y < f.rowHi; y++) {
    fb.fill(BLACK, y * W + f.colLo, y * W + f.colHi)
    zbuf.fill(1e9, y * W + f.colLo, y * W + f.colHi)
  }
  f.colY.fill(f.rowHi)
  if (!inSpace(scene) || scene.space.system < 0) return
  drawBackdrop(scene, f)
  drawStructures(scene, f)
  drawAirGlow(scene, f)
}

/** the stars alone, in whichever view the camera is (on the surface side of the way up or down) */
export function drawStarsFor(scene: SceneState, f: Frame) {
  const view = scene.view
  const k = perspectiveOf(view)
  const cam = camOf(view)
  if (k < 1 || !cam) drawStarsTop(scene, f, { cos: view.cos, sin: view.sin })
  if (k > 0 && cam) drawSky(f, cam)
}

/** the stars and the bodies, in whichever view the camera is (and while it moves between them, both) */
export function drawBackdrop(scene: SceneState, f: Frame, skip = -1) {
  const view = scene.view
  const turn: Turn = { cos: view.cos, sin: view.sin }
  const k = perspectiveOf(view)
  const cam = camOf(view)
  // (on the way down to a world, or up out of one, that world is drawn as the air has it, first: render/air.ts)
  const air = inAir(scene) ? 1 : 0
  if (k < 1 || !cam) {
    drawStarsTop(scene, f, turn)
    if (air > 0) drawAirTop(scene, f)
    drawBodiesTop(scene, f, turn, air > 0 ? scene.travel.from : skip)
  }
  if (k > 0 && cam) {
    let g = f
    if (k < 1) {
      // (the picture in perspective drawn aside, then laid over the other pixel by pixel as the camera moves)
      if (!other || other.w !== f.w || other.h !== f.h) other = createFrame(f.w, f.h)
      g = other
      g.colLo = f.colLo
      g.colHi = f.colHi
      g.rowLo = f.rowLo
      g.rowHi = f.rowHi
      for (let y = f.rowLo; y < f.rowHi; y++) {
        g.fb.fill(BLACK, y * f.w + f.colLo, y * f.w + f.colHi)
        g.zbuf.fill(1e9, y * f.w + f.colLo, y * f.w + f.colHi)
      }
    }
    drawSky(g, cam)
    if (air > 0) drawAirCast(scene, g, cam)
    castBodies(scene, g, cam, air > 0 ? scene.travel.from : skip)
    drawDust(scene, g, cam)
    if (g !== f) {
      const lim = k * 16
      for (let y = f.rowLo; y < f.rowHi; y++) {
        let o = y * f.w + f.colLo
        const by4 = (y & 3) << 2
        for (let x = f.colLo; x < f.colHi; x++, o++)
          if (BAYER[by4 | (x & 3)] < lim) {
            f.fb[o] = g.fb[o]
            f.zbuf[o] = g.zbuf[o]
          }
      }
    }
  }
}

// ── over the ships: the transitions, and the heat of a sun

/** draws what lies over the ships in space (and over a world, while climbing out or arriving from space) */
export function drawSpaceFront(scene: SceneState, f: Frame) {
  const { w: Wd, fb } = f
  const sp = scene.space
  // a sun's heat: the frame's edges glow, flickering
  if (scene.time - sp.burnedAt < 0.4) {
    const k = 1 - (scene.time - sp.burnedAt) / 0.4
    const col = pack(255, 120, 40)
    for (let y = f.rowLo; y < f.rowHi; y++)
      for (let x = f.colLo; x < f.colHi; x++) {
        const e = Math.min(x - f.colLo, y - f.rowLo, f.colHi - 1 - x, f.rowHi - 1 - y)
        if (e > 14) continue
        const kk = (1 - e / 14) * k
        if (kk * 16 > BAYER[((y & 3) << 2) | (x & 3)]) fb[y * Wd + x] = blend(fb[y * Wd + x], col, 140)
      }
  }
  drawTravel(scene, f)
}

/** the travel's own look over the ships: a flash through a gate or a black hole's ring (the way down and up are the air's: render/air.ts) */
export function drawTravel(scene: SceneState, f: Frame) {
  const tr = scene.travel
  // (the way down or up: the air burning round the ship; and others seen leaving or coming)
  drawAirFire(scene, f)
  drawFlashes(scene, f)
  if (tr.kind !== 'gate' && tr.kind !== 'hole') return
  const { w: Wd, fb } = f
  const k = fadeOf(scene)
  if (k <= 0) return
  // the flash itself: dithered into the travel's colour
  const col = tr.fade
  for (let y = f.rowLo; y < f.rowHi; y++) {
    let o = y * Wd + f.colLo
    for (let x = f.colLo; x < f.colHi; x++, o++)
      if (k * 17 > BAYER[((y & 3) << 2) | (x & 3)] + 0.5) fb[o] = k >= 1 ? col : blend(fb[o], col, 200)
  }
}
