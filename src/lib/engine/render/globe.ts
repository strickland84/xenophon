// A world or a moon as a globe (the polish pass, items 4 and 6): a sphere wrapped in the map of its
// own built surface (space/maps.ts), lit from its sun so that it has a day side and a night side,
// with its air glowing round its lit edge. One way of drawing it serves every view and the whole way
// down to it: from overhead (a disc, seen from straight above), and in perspective (each pixel a ray
// from the camera, met by the sphere), and on the way down or up, when the same sphere is turned
// to bring the place under the ship beneath it, grows flatter, and its map is drawn finer round
// that place until it is the ground the ship flies over (render/air.ts says how far along).
//
// A map has 1024 texels round a world, so a globe seen close would show them as blocks. Where a
// texel covers more than a pixel, which of its neighbours each pixel takes is dithered, so the
// picture stays one pixel fine; and on the way down the map is drawn finer round the place under
// the ship (`zoom`), so that it never grows coarser than the ground it becomes.

import { BAYER, blend, pack } from '../util/color'
import { mulberry32 } from '../util/math'
import { addOctave, normalise } from '../util/noise'
import { LEVELS } from '../space/maps'
import type { SphereMap } from '../space/maps'
import { GIANT_NEAR } from '../space/art'
import { brightnessOf } from '../space/pictures'
import { createFrame } from './frame'
import type { Frame } from './frame'

/** how one world or moon is drawn this frame */
export interface Globe {
  map: SphereMap
  /** the sphere's middle (world px, z up) and its radius */
  x: number
  y: number
  z: number
  r: number
  /** how it is turned: a point of the body's own frame (x across, y along its axis, z out of the map's middle) is Q · it in the world; row by row */
  q: Float64Array
  /** how far round it has turned (a share of a turn); and where its clouds are over its map, across and down (shares of the map's width and of its pole to pole) */
  spin: number
  cloudSpin: number
  cloudDown?: number
  /** the place under the ship on its map (0..1 across and down), and how much finer the map is drawn round it (1: as it is) */
  us: number
  vs: number
  zoom: number
  /** the cosine of that place's latitude: a world's map is that much smaller there on its globe (1 for a globe drawn whole) */
  ew: number
  /** 0..1: how far the map is laid out flat round that place instead of round the globe; the place's normal, and east and north there (the body's frame) */
  local: number
  sx: number
  sy: number
  sz: number
  ex: number
  ey: number
  ez: number
  nx: number
  ny: number
  nz: number
  /** the light from its sun, in the body's own frame (unit) */
  lx: number
  ly: number
  lz: number
  /** 0..1: how far its light has gone over to the ground's own (flat, as on the surface) */
  flat: number
  /** 0..1: how far the air round its edge has thickened into a sky (on the way down) */
  air: number
  /** how far past where its sun sets its ground is still lit (a world's dusk: sim/daylight.ts; none for a giant) */
  dusk?: number
  /** low on the way down, over the world itself: its ground is drawn from the world (each pixel a world px, not a texel of two), in its own colours */
  ground?: {
    mat: Uint8Array
    height: Uint8Array
    clouds: Uint8Array
    lit: Uint32Array
    shade: Uint32Array
    cloud: Uint32Array
    rank: number
    /** where its clouds have drifted to over the ground (world px), and where their shadows fall from them */
    driftX: number
    driftY: number
    shadowX: number
    shadowY: number
    /** the ground's own haze: its colour; how much of it lies over the ground seen from straight above (0..1); and by distance from behind (where it begins and ends, in heights, and how much of it) */
    haze: number
    fog: number
    far: { from: number; to: number; k: number }
    /** how strongly its slopes are shaded (1: all the way; less towards the ceiling, where the ground itself shows none) */
    relief: number
    /** the row of the ground (world px) the top row of its map is: the globe's equator is the row midway between its bases */
    row0: number
    /** px round the world (its map is once round it); the ground is read from the scene's hold of it, which is a window on a world larger than it (world/lands.ts); and that hold's version, which changes as ground is written into it */
    size: number
    version: number
  } | null
}

/** what the frame's depth is set to where a body far off covers it: nothing further shows there, and every ship is in front of it */
export const COVERED = 1e8

/** asin over −1..1, looked up */
const ASIN_N = 4096
const ASIN = new Float32Array(ASIN_N + 1)
for (let i = 0; i <= ASIN_N; i++) ASIN[i] = Math.asin(Math.max(-1, Math.min(1, (i / ASIN_N) * 2 - 1)))
const asin = (x: number) => ASIN[(((x < -1 ? -1 : x > 1 ? 1 : x) + 1) * (ASIN_N / 2) + 0.5) | 0]

/** a world's map's row (0..1) by the sine of the latitude, looked up: Mercator's projection, to 85° either way */
const MERC_MOST = Math.tanh(Math.PI)
const MERC_N = 8192
const MERC = new Float32Array(MERC_N + 1)
for (let i = 0; i <= MERC_N; i++) {
  const sl = Math.max(-MERC_MOST, Math.min(MERC_MOST, (i / MERC_N) * 2 - 1))
  MERC[i] = 0.5 + Math.log((1 + sl) / (1 - sl)) / (4 * Math.PI)
}

/** atan2, quickly and closely enough for a map (to a hundred-thousandth of a radian) */
export function atan2(y: number, x: number) {
  const ax = x < 0 ? -x : x
  const ay = y < 0 ? -y : y
  if (ax === 0 && ay === 0) return 0
  const big = ay > ax
  const z = big ? ax / ay : ay / ax
  const z2 = z * z
  let a = z * (0.999866 + z2 * (-0.3302995 + z2 * (0.180141 + z2 * (-0.085133 + z2 * 0.0208351))))
  if (big) a = Math.PI / 2 - a
  if (x < 0) a = Math.PI - a
  return y < 0 ? -a : a
}

/** the dither offsets for a pixel, −0.5..0.5 (two of them, for across and down) */
const DX = new Float32Array(16)
const DY = new Float32Array(16)
for (let i = 0; i < 16; i++) {
  DX[i] = BAYER[i] / 16 - 0.47
  DY[i] = BAYER[(i + 6) & 15] / 16 - 0.47
}

const CLOUD = [pack(70, 76, 92), pack(150, 158, 176), pack(214, 220, 232), pack(246, 248, 252)]

/** a gas giant's eddies: two fields of smooth noise (−1..1) that wrap, made once from a seed, read smoothly at any scale (warp) */
const SW = 256
export const SWX = new Float32Array(SW * SW)
export const SWY = new Float32Array(SW * SW)
{
  const rnd = mulberry32(4441)
  for (const f of [SWX, SWY]) {
    for (const [cell, amp] of [
      [64, 1],
      [32, 0.55],
      [16, 0.3],
      [8, 0.16],
      [4, 0.08],
    ])
      addOctave(f, SW, cell, amp, rnd)
    normalise(f)
    for (let i = 0; i < f.length; i++) f[i] = f[i] * 2 - 1
  }
}
const TAU = Math.PI * 2

/** a noise field read between its points (it wraps), at (x, y) in its own points */
export function warp(f: Float32Array, x: number, y: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const fx = x - xi
  const fy = y - yi
  const x0 = xi & (SW - 1)
  const y0 = (yi & (SW - 1)) * SW
  const x1 = (xi + 1) & (SW - 1)
  const y1 = ((yi + 1) & (SW - 1)) * SW
  const a = f[y0 + x0] + (f[y0 + x1] - f[y0 + x0]) * fx
  const b = f[y1 + x0] + (f[y1 + x1] - f[y1 + x0]) * fx
  return a + (b - a) * fy
}

// ── where on its map a point of the globe is, and what colour it is there

/** sqrt over 0..1, looked up (the limb's darkening) */
const ROOT = new Float32Array(257)
for (let i = 0; i <= 256; i++) ROOT[i] = Math.sqrt(i / 256)

/**
 * The place on the map last worked out (u across, v down: unwrapped, so that two near places differ by little), in a typed
 * array: a number kept in the module's own variable is made anew each time it changes, which a sample at a time cost.
 */
const MUV = new Float64Array(2)

/**
 * The caps at a world's poles, past the last row of its map (85°): each is read at one place of its map's row next to it,
 * where that row's commonest colour is, so it is one colour. (Read at the longitude of each pixel, as everywhere else, the
 * row's colours ran out from the pole in rays: a starburst under a ship over a pole. James, 2026-11-19.)
 */
let capMap: SphereMap | null = null
let capNorth = 0
let capSouth = 0
function capsOf(map: SphereMap) {
  if (capMap === map) return
  capMap = map
  const commonest = (row: number) => {
    const count = new Uint32Array(256)
    const o = row * map.w
    for (let i = 0; i < map.w; i++) count[map.idx[o + i]]++
    let best = 0
    for (let c = 1; c < 256; c++) if (count[c] > count[best]) best = c
    for (let i = 0; i < map.w; i++) if (map.idx[o + i] === best) return (i + 0.5) / map.w
    return 0
  }
  capSouth = commonest(0)
  capNorth = commonest(Math.max(0, map.span - 1))
}

/** where on the globe's map a point of it is (its unit normal in the body's own frame): into mu, mv */
function mapUV(g: Globe, bx: number, by: number, bz: number) {
  let mu = MUV[0]
  let mv = MUV[1]
  const w = g.local
  const merc = g.map.merc === true
  if (w < 1) {
    // the map as it lies round the globe: by longitude and latitude (worked out exactly when drawn finer, where small differences matter)
    const fine = g.zoom !== 1
    const lon = fine ? Math.atan2(bx, bz) : atan2(bx, bz)
    mu = g.spin + lon / TAU
    if (merc) {
      // (a world's map is Mercator's, its rows from 85° south to 85° north: space/maps.ts)
      const sl = by < -MERC_MOST ? -MERC_MOST : by > MERC_MOST ? MERC_MOST : by
      mv = fine ? 0.5 + Math.log((1 + sl) / (1 - sl)) / (4 * Math.PI) : MERC[((sl + 1) * (MERC_N / 2) + 0.5) | 0]
      if (sl !== by) {
        // (in a cap: one colour, read inside the row next to it)
        capsOf(g.map)
        mu = by > 0 ? capNorth : capSouth
        mv = by > 0 ? 1 - 0.5 / g.map.span : 0.5 / g.map.span
      }
    } else mv = (fine ? Math.asin(by < -1 ? -1 : by > 1 ? 1 : by) : asin(by)) / Math.PI + 0.5
    if (fine) {
      // (finer round the place under the ship: the way down)
      let du = mu - g.us
      du -= Math.round(du)
      mu = g.us + du * g.zoom
      mv = g.vs + (mv - g.vs) * g.zoom
    }
  }
  if (w > 0) {
    // the map laid out flat round the place under the ship, as its ground lies (east and north of it, a world px square):
    // what the way down comes to, and no trouble at the poles
    const dx = bx - g.sx
    const dy = by - g.sy
    const dz = bz - g.sz
    let east = dx * g.ex + dy * g.ey + dz * g.ez
    let north = dx * g.nx + dy * g.ny + dz * g.nz
    const r = Math.sqrt(east * east + north * north)
    if (r > 0.05) {
      const k = asin(r > 1 ? 1 : r) / r
      east *= k
      north *= k
    }
    // (a world px there is the same any way: once round the world is the map's width, and its height)
    const lu = g.us + (east * g.zoom) / (TAU * g.ew)
    const lv = g.vs + (north * g.zoom) / (merc ? TAU * g.ew : Math.PI)
    if (w >= 1) {
      mu = lu
      mv = lv
    } else {
      let du = lu - mu
      du -= Math.round(du)
      mu += du * w
      mv += (lv - mv) * w
    }
  }
  MUV[0] = mu
  MUV[1] = mv
}

/** how far, in a giant's bands, a pixel's dither reaches (set as a globe's drawing begins: a few pixels however close) */
let bandDither = 0.8
/**
 * how strongly a giant's bands show their streaks, 0 far off to 1 close by (set as a globe's drawing begins): close to, a
 * band was one flat colour across the whole frame (polish step 8's audit); its cloud streams along it in streaks of light
 * and shade, and a band's edge mixes into the next in ragged streaks, finer than the eddies, too fine to show from afar
 */
let bandStreak = 0
/** a giant's clouds seen close (space/art.ts GIANT_NEAR, brightness 0..15), and how many times it goes round the giant across and pole to pole */
const gNear = brightnessOf(GIANT_NEAR)
const GN_W = GIANT_NEAR.w
const GN_H = GIANT_NEAR.h
const NEAR_U = 36
const NEAR_V = 18

/** a gas giant's latitude (v) bent by its eddies, large and small, at a place of its map: where in its bands that place is */
// (across, every scale a whole number of the warp's 256 texels once round, so the bands meet themselves at the map's seam)
const bent = (u: number, v: number) =>
  v + warp(SWY, u * 512, v * 384) * 0.022 + warp(SWX, u * 4096, v * 2600) * 0.0045 + warp(SWY, u * 19968, v * 12000) * 0.0011

/** whether paint bends a giant's bands itself (inside one, the places it is given are bent already) */
let bend = true

/** how hazed each of the haze's steps is, of 255 (step 0: not at all) */
const HAZE_STEP = [0, 40, 80, 120]

/** the colours of the map being drawn, at each step of haze (set as a globe's drawing begins) */
let hz: Uint32Array[] = []

/** a map's colours at each step of haze by its air (made once a map); and all of them in one, step after step (hzFlat) */
const hazedOf = new WeakMap<SphereMap, Uint32Array[]>()
const hazedFlatOf = new WeakMap<SphereMap, Uint32Array>()
let hzFlat: Uint32Array = new Uint32Array(0)
function hazed(map: SphereMap) {
  let h = hazedOf.get(map)
  if (!h) {
    h = HAZE_STEP.map((k) => {
      const a = new Uint32Array(map.lit.length)
      for (let i = 0; i < a.length; i++) a[i] = map.air && k ? blend(map.lit[i], map.air, k) : map.lit[i]
      return a
    })
    hazedOf.set(map, h)
    const flat = new Uint32Array(map.lit.length * h.length)
    h.forEach((a, i) => flat.set(a, i * map.lit.length))
    hazedFlatOf.set(map, flat)
  }
  hzFlat = hazedFlatOf.get(map)!
  return h
}

/** the steps of the ground's own haze, of 255 (as the ground itself is hazed: render/world.ts, ten shades) */
const GROUND_HAZE = [0, 26, 51, 77, 102, 128, 153, 179, 204, 230, 255]
const GH = GROUND_HAZE.length

/**
 * The world's own ground's colours, lit and in shade, at each step of its haze (made when the ground itself is drawn and
 * its colours or its haze's change), both in one: lit at step * 512 + m, in shade 256 on. They are the ground's own, as
 * its time of day has them: dimmed again by the globe's light they went black over a place on its night side.
 */
const groundCol = {
  flat: new Uint32Array(GH * 512),
  haze: -1,
  src: null as Uint32Array | null,
  /** how hazed the ground is by how squarely it faces the eye (256 steps of it), in steps of GROUND_HAZE */
  fog: new Float32Array(257),
}
function groundColours(g: Globe) {
  const gr = g.ground!
  if (groundCol.haze !== gr.haze || groundCol.src !== gr.lit) {
    groundCol.src = gr.lit
    groundCol.haze = gr.haze
    for (let m = 0; m < gr.lit.length && m < 256; m++)
      GROUND_HAZE.forEach((h, i) => {
        groundCol.flat[i * 512 + m] = h ? blend(gr.lit[m], gr.haze, h) : gr.lit[m]
        groundCol.flat[i * 512 + 256 + m] = h ? blend(gr.shade[m], gr.haze, h) : gr.shade[m]
      })
  }
  // the haze over it: the air's own, thicker to the limb; as the ground has it from straight above; and, from behind, by
  // distance as the ground itself is hazed, to nothing but haze where the ground ends
  const { from, to, k } = gr.far
  for (let i = 0; i <= 256; i++) {
    const f = Math.max(1 / 256, i / 256)
    let h = Math.max(gr.fog, g.air * 0.45 * (0.4 + 0.6 * (1 - f)) * (1 - k))
    if (k > 0) {
      const d = Math.sqrt(1 / (f * f) - 1)
      if (d > from) h = Math.max(h, k * Math.sqrt(Math.min(1, (d - from) / (to - from))))
    }
    groundCol.fog[i] = Math.min(1, h) * (GH - 1)
  }
}

/**
 * What paint reads of the globe being drawn, set once as its drawing begins (prepare): looked up a pixel at a time, so
 * kept where the lookups are quickest (the way down's frames are the dearest in the game, and nearly all of them is this).
 */
let cFlat = 0
let cAir = 0
let cDusk = 0
let cHazes = false
let cGround: NonNullable<Globe['ground']> | null = null
let cMat: Uint8Array = new Uint8Array(0)
let cHeight: Uint8Array = new Uint8Array(0)
/** how much the ground's rise to the south east (towards the light's far side), a world px of height to a world px across, lights a px on the way down */
const RELIEF = 0.55
let cClouds: Uint8Array = new Uint8Array(0)
let cRank = 0
let cCloud: Uint32Array = new Uint32Array(0)
let cMap: SphereMap | null = null
/** where the ground's clouds are read from, and their shadows (world px added to a place of the ground; whole numbers) */
let cDriftX = 0
let cDriftY = 0
let cShadowX = 0
let cShadowY = 0
let cRow0 = 0
let cSize = 2048
let cVersion = -1

/**
 * The ground's materials and heights decimated, for the way down where a pixel of the frame covers many of the world's px:
 * level k keeps every 2^k-th px each way (so a read of it is the read of the full map at that px, snapped), 2048 >> k
 * across. Reading the full 4 MB maps a pixel at a time, far apart, was most of the way down's cost (a miss of the
 * processor's cache a read); a level as fine as the frame needs fits in it. Made once a world, a level at a time, when
 * first wanted.
 */
const decimated = new WeakMap<Uint8Array, (Uint8Array | null)[]>()
function levelOf(full: Uint8Array, k: number): Uint8Array {
  if (k === 0) return full
  let levels = decimated.get(full)
  if (!levels) decimated.set(full, (levels = [full, null, null, null, null]))
  let l = levels[k]
  if (!l) {
    const n = 2048 >> k
    l = new Uint8Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) l[y * n + x] = full[((y << k) << 11) | (x << k)]
    levels[k] = l
  }
  return l
}
/** the clouds (1024 across) decimated as the ground is: level k is 1024 >> k across */
const cloudLevels = new WeakMap<Uint8Array, (Uint8Array | null)[]>()
function cloudLevel(full: Uint8Array, k: number): Uint8Array {
  let levels = cloudLevels.get(full)
  if (!levels) cloudLevels.set(full, (levels = [full, null, null, null, null]))
  let l = levels[k]
  if (!l) {
    const n = 1024 >> k
    l = new Uint8Array(n * n)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) l[y * n + x] = full[((y << k) << 10) | (x << k)]
    levels[k] = l
  }
  return l
}
/** a globe's map (w × h texels) decimated as the ground is: level k keeps every 2^k-th texel each way */
const mapLevels = new WeakMap<Uint8Array, (Uint8Array | null)[]>()
function mapLevel(full: Uint8Array, w: number, h: number, k: number): Uint8Array {
  let levels = mapLevels.get(full)
  if (!levels) mapLevels.set(full, (levels = [full, null, null, null, null]))
  let l = levels[k]
  if (!l) {
    const lw = w >> k
    const lh = h >> k
    l = new Uint8Array(lw * lh)
    for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) l[y * lw + x] = full[(y << k) * w + (x << k)]
    levels[k] = l
  }
  return l
}
/** the finest level a span can read: the most whole steps of 2 its pixels' spacing on the ground holds (at most 4) */
const levelFor = (across: number) => (across >= 16 ? 4 : across >= 8 ? 3 : across >= 4 ? 2 : across >= 2 ? 1 : 0)

/** paint's view of the globe `g` (and its haze's colours, `hz`), before its pixels are drawn */
function prepare(g: Globe) {
  hz = hazed(g.map)
  cFlat = g.flat
  cAir = g.air
  cDusk = g.dusk ?? 0
  cHazes = g.map.air !== 0
  cGround = g.ground ?? null
  cMap = g.map
  if (cGround) {
    groundColours(g)
    cMat = cGround.mat
    cHeight = cGround.height
    cClouds = cGround.clouds
    cRank = cGround.rank
    cCloud = cGround.cloud
    // (the clouds' map wraps in 1024 px, a cell a world px, as the ground's own clouds and their shadows read it)
    cDriftX = (Math.round(-cGround.driftX) % 1024) + 1024
    cDriftY = (Math.round(-cGround.driftY) % 1024) + 1024
    cShadowX = (Math.round(cGround.shadowX - cGround.driftX) % 1024) + 1024
    cShadowY = (Math.round(cGround.shadowY - cGround.driftY) % 1024) + 1024
    cRow0 = cGround.row0
    cSize = cGround.size
    // (ground has been written into the window since its smaller copies were made: they are made again)
    if (cGround.version !== cVersion) {
      cVersion = cGround.version
      decimated.delete(cHeight)
      decimated.delete(cMat)
    }
  }
}

/**
 * The colour of a globe at a place of its map (mu, mv), its light there `sunK` (from the sun's way,
 * −1..1), `facing` 0..1 how squarely it faces the eye, `bi` the pixel's place in the dither, and
 * `spread` 0..1 how far the dither reaches into a texel's neighbours, into pixel `o` of `fb`. (prepare(g) first. It
 * writes the pixel itself rather than give back its colour: a colour is a number too large to be passed back without
 * being boxed, which, a pixel at a time, was a good part of the way down's cost.)
 */
function paint(fb: Uint32Array, o: number, g: Globe, u: number, v: number, sunK: number, facing: number, bi: number, spread: number) {
  // the light: from the sun's side, darker to the limb (going over to the ground's own, flat, on the way down)
  let k = ((sunK + cDusk) * 1.3 + 0.02) * (0.5 + 0.5 * ROOT[(facing * 256) | 0])
  if (cFlat > 0) k += (1 - k) * cFlat
  // the air hazes the limb on the lit side (and the whole ground, more, as the ship sinks into it)
  let haze = facing < 0.22 && sunK > -0.1 ? (0.22 - facing) / 0.22 : 0
  if (cAir > 0) {
    const a = cAir * 0.45 * (0.4 + 0.6 * (1 - facing))
    if (a > haze) haze = a
  }
  // (the haze in steps, dithered only between neighbouring steps, so it reads as a veil and not a speckle)
  let step = cHazes ? (haze * 3.3 + BAYER[bi] / 16) | 0 : 0
  if (step > 3) step = 3
  if (cGround !== null) {
    // over the world itself: its own ground, a pixel to each of its px, under its own haze, its clouds and their shadows
    const x = Math.floor(u * cSize) & 2047
    const y = Math.floor(v * cSize + cRow0) & 2047
    const m = cMat[(y << 11) | x]
    let gs = (groundCol.fog[(facing * 256) | 0] + BAYER[bi] / 16) | 0
    if (gs > GH - 1) gs = GH - 1
    let shade = 0
    if (cRank > 0) {
      const sh = cClouds[(((y + cShadowY) & 1023) << 10) | ((x + cShadowX) & 1023)]
      if ((sh & 15) > 1 && sh >> 4 < cRank) shade = 256
    }
    fb[o] = groundCol.flat[(gs << 9) | shade | m]
    if (cRank > 0) {
      const c = cClouds[(((y + cDriftY) & 1023) << 10) | ((x + cDriftX) & 1023)]
      if (c !== 0 && c >> 4 < cRank) {
        const tk = c & 15
        if (tk > 1 || BAYER[bi] < 8) fb[o] = cCloud[Math.min(cCloud.length - 1, tk - 1)]
      }
    }
    return
  }
  mapColour(fb, o, g, cMap!, u, v, k, step, bi, spread)
}

/** paint from the globe's own map (a world's, a moon's, a giant's bands): its light `k` and haze `step` worked out */
function mapColour(
  fb: Uint32Array,
  o: number,
  g: Globe,
  map: SphereMap,
  u: number,
  v: number,
  k: number,
  step: number,
  bi: number,
  spread: number,
) {
  const lev = LEVELS - 1
  const mw = map.w
  const mh = map.h
  let l = k * lev + BAYER[bi] / 16
  l = l < 0 ? 0 : l > lev ? lev : l
  if (map.bands) {
    // a gas giant: its bands by latitude, bent by eddies large and small, smooth however close
    const bands = map.bands
    const nb = bands.length
    let row = (bend ? bent(u, v) : v) * nb + (BAYER[bi] / 16 - 0.5) * bandDither
    if (bandStreak > 0) {
      // (across, whole numbers of the warp's 256 texels once round: polish step 9 found the streaks cut off in a straight
      // line at the map's seam, close to)
      row += warp(SWY, u * 3072, v * 52000) * 0.9 * bandStreak
      l += warp(SWX, u * 6144, v * 26000) * 2.2 * bandStreak
      // close to, the clouds' own eddies, vortices and storms (the image model's, GIANT_NEAR) laid over the bands finer: they
      // shade the cloud and bend the bands' edges (polish step 9: close to, a giant was blocks of one colour)
      // (read smoothly between its texels, so it is never blocks however close; a whole number of times round, so it meets
      // itself where the map does)
      let gu = u * NEAR_U * GN_W
      let gv = v * NEAR_V * GN_H
      gu -= GN_W * Math.floor(gu / GN_W)
      gv -= GN_H * Math.floor(gv / GN_H)
      const iu = gu | 0
      const iv = gv | 0
      const fu = gu - iu
      const fv = gv - iv
      const iu1 = iu + 1 === GN_W ? 0 : iu + 1
      const r0 = iv * GN_W
      const r1 = (iv + 1 === GN_H ? 0 : iv + 1) * GN_W
      const top = gNear[r0 + iu] + (gNear[r0 + iu1] - gNear[r0 + iu]) * fu
      const bottom = gNear[r1 + iu] + (gNear[r1 + iu1] - gNear[r1 + iu]) * fu
      const gn = (top + (bottom - top) * fv) / 15 - 0.5
      row += gn * 1.6 * bandStreak
      l += gn * 4.2 * bandStreak
      l = l < 0 ? 0 : l > lev ? lev : l
    }
    row = row < 0 ? 0 : row > nb - 1 ? nb - 1 : row
    fb[o] = hz[step][bands[row | 0] * LEVELS + (l | 0)]
    return
  }
  let tu = u * mw + DX[bi] * spread
  let tv = v * map.span + DY[bi] * spread
  if (g.zoom === 1 && g.local === 0) {
    // (seen whole: once round, pole to pole)
    if (tu < 0) tu += mw
    else if (tu >= mw) tu -= mw
    if (tu < 0 || tu >= mw) tu -= mw * Math.floor(tu / mw)
    tv = tv < 0 ? 0 : tv >= map.span ? map.span - 1 : tv
  } else {
    tu -= mw * Math.floor(tu / mw)
    tv -= mh * Math.floor(tv / mh)
  }
  const t = map.idx[(tv | 0) * mw + (tu | 0)]
  fb[o] = hz[step][t * LEVELS + (l | 0)]
  const clouds = map.clouds
  if (clouds !== null) {
    const cw = mw >> 1
    const ch = mh >> 1
    let cu = (u + g.cloudSpin) * cw + DX[(bi + 5) & 15] * spread * 0.5
    let cv = (v + (g.cloudDown ?? 0)) * (map.span >> 1)
    cu -= cw * Math.floor(cu / cw)
    cv -= ch * Math.floor(cv / ch)
    const c = clouds[(cv | 0) * cw + (cu | 0)]
    if (c > 0 && (c >= 2 || BAYER[bi] < 8)) fb[o] = l < 0.6 ? blend(fb[o], CLOUD[0], 90) : CLOUD[Math.min(3, ((l / lev) * 3.4) | 0)]
  }
}

/** a body-frame normal from a world one: Qᵀ · n (Q turns the body's frame into the world's) */
const nb = { x: 0, y: 0, z: 0 }
function toBody(q: Float64Array, x: number, y: number, z: number) {
  nb.x = q[0] * x + q[3] * y + q[6] * z
  nb.y = q[1] * x + q[4] * y + q[7] * z
  nb.z = q[2] * x + q[5] * y + q[8] * z
}

// ── a row drawn in spans: the place on the map worked out exactly every SPAN pixels, and in between from those

/** pixels a span: the map's place is worked out exactly at its ends and carried evenly between them */
const SPAN = 8
const MOST = 1024
/** per sample along a row: whether it met the globe, its place on the map, its light, how it faces, its depth */
const sHit = new Uint8Array(MOST)
const sU = new Float64Array(MOST)
const sV = new Float64Array(MOST)
const sK = new Float32Array(MOST)
const sF = new Float32Array(MOST)
const sD = new Float32Array(MOST)

/** a sample's values, worked out from a unit normal (the body's frame) and how it faces: into slot i */
function sample(g: Globe, i: number, bx: number, by: number, bz: number, facing: number, depth: number) {
  mapUV(g, bx, by, bz)
  sHit[i] = 1
  sU[i] = MUV[0]
  sV[i] = MUV[1]
  sK[i] = bx * g.lx + by * g.ly + bz * g.lz
  sF[i] = facing < 0 ? 0 : facing
  sD[i] = depth
}

/** pixel o of fb between two samples (i and i + 1, at pixels xa and xb), at pixel x; false: one of them missed (worked out exactly instead) */
function between(fb: Uint32Array, o: number, g: Globe, i: number, xa: number, xb: number, x: number, bi: number, spread: number) {
  if (sHit[i] === 0 || sHit[i + 1] === 0) return false
  const t = xb > xa ? (x - xa) / (xb - xa) : 0
  let du = sU[i + 1] - sU[i]
  du -= Math.round(du)
  const u = sU[i] + du * t
  const v = sV[i] + (sV[i + 1] - sV[i]) * t
  paint(fb, o, g, u, v, sK[i] + (sK[i + 1] - sK[i]) * t, sF[i] + (sF[i + 1] - sF[i]) * t, bi, spread)
  return true
}

/**
 * The span a run is painted from (spanOf): its first pixel and length, and its ends' values, each the first and the
 * difference to the last (between()'s, read once a span). In a typed array: numbers kept in the module's own variables
 * are made anew each time they change, which a span at a time was half the cost of drawing it.
 */
const SPANV = new Float64Array(12)
/** span i's values, its pixels from xa to xb (false: a sample missed, so its pixels are worked out wholly) */
function spanOf(i: number, xa: number, xb: number) {
  if (sHit[i] === 0 || sHit[i + 1] === 0) return false
  const v = SPANV
  v[0] = xa
  v[1] = xb - xa
  let du = sU[i + 1] - sU[i]
  du -= Math.round(du)
  v[2] = sU[i]
  v[3] = du
  v[4] = sV[i]
  v[5] = sV[i + 1] - sV[i]
  v[6] = sK[i]
  v[7] = sK[i + 1] - sK[i]
  v[8] = sF[i]
  v[9] = sF[i + 1] - sF[i]
  v[10] = sD[i]
  v[11] = sD[i + 1] - sD[i]
  return true
}

/**
 * The pixels xa..xb of a row (from pixel o), wholly on the globe, painted between the ends of the span spanOf read: as
 * between() and paint() would, a pixel at a time, but a run at once (a call a pixel was most of the way down's cost: the
 * dearest frames in the game). Each pixel's depth is the span's (`depth`) or COVERED; nothing nearer is painted over.
 */
function paintRun(f: Frame, g: Globe, o: number, xa: number, xb: number, by4: number, spread: number, depth: boolean) {
  const { fb, zbuf } = f
  // (the span's values and the globe's, as locals: read from the module's own a pixel at a time, they cost as much again)
  const sv = SPANV
  const sa_ = sv[0]
  const sn_ = sv[1]
  const u0_ = sv[2]
  const du_ = sv[3]
  const v0_ = sv[4]
  const dv_ = sv[5]
  const k0_ = sv[6]
  const dk_ = sv[7]
  const f0_ = sv[8]
  const df_ = sv[9]
  const e0_ = sv[10]
  const de_ = sv[11]
  // (a span of eight: an eighth is exact, so the share along it is the same multiplied as divided, and quicker)
  const whole8 = sn_ === 8
  const flat = cFlat
  const air = cAir
  const dusk = cDusk
  const hazes = cHazes
  if (cGround !== null) {
    // low on the way down: the world's own ground (paint's, for each pixel), and its relief: where the ground rises to the
    // south and east it faces the light (from the north west, as the art is lit), where it falls away it is in shade, so
    // hills, ridges and gorges stand out all the way down, not only once the ground itself is drawn. The slope is taken
    // across the ground a pixel covers (`reach` world px either way), so it is the hill's and not a speck's.
    const size = cSize
    const across = Math.max(Math.abs(du_) * size, Math.abs(dv_) * size) / Math.max(1, sn_)
    const reach = Math.max(1, Math.min(48, Math.round(across * 1.5)))
    const relief = (RELIEF / reach) * cGround.relief
    // (read from the level as fine as the span needs: its px snapped to it, its reach in its own px)
    const lk = levelFor(across)
    const height = levelOf(cHeight, lk)
    const mat = levelOf(cMat, lk)
    const lw = 11 - lk
    const lm = (2048 >> lk) - 1
    const lr = Math.max(1, reach >> lk)
    // (the clouds wrap in 1024 px, a cell a world px: decimated as the ground is)
    const clouds = lk > 0 ? cloudLevel(cClouds, lk) : cClouds
    const cw = 10 - lk
    const both = groundCol.flat
    const fog = groundCol.fog
    const rank = cRank
    const cloud = cCloud
    const dX = cDriftX
    const dY = cDriftY
    const sX = cShadowX
    const sY = cShadowY
    const row0 = cRow0
    const most = GH - 1
    for (let x = xa; x <= xb; x++, o++) {
      if (zbuf[o] < 1e9) continue
      const bi = by4 | (x & 3)
      const t = whole8 ? (x - sa_) * 0.125 : sn_ > 0 ? (x - sa_) / sn_ : 0
      const facing = f0_ + df_ * t
      // (the ground's own haze, in its steps, dithered only between neighbouring steps)
      let step = (fog[(facing * 256) | 0] + BAYER[bi] / 16) | 0
      if (step > most) step = most
      const gx = Math.floor((u0_ + du_ * t) * size) & 2047
      const gy = Math.floor((v0_ + dv_ * t) * size + row0) & 2047
      const ly = gy >> lk
      const lx = gx >> lk
      const m = mat[(ly << lw) | lx]
      // (a slope turned from the light is in shade, dithered by how far it turns away; and so is the ground under a cloud)
      const turned = (height[(((ly + lr) & lm) << lw) | ((lx + lr) & lm)] - height[(((ly - lr) & lm) << lw) | ((lx - lr) & lm)]) * relief
      let dark = -turned * 16 > BAYER[bi]
      if (rank > 0 && !dark) {
        const sh = clouds[((((gy + sY) & 1023) >> lk) << cw) | (((gx + sX) & 1023) >> lk)]
        if ((sh & 15) > 1 && sh >> 4 < rank) dark = true
      }
      fb[o] = both[(step << 9) | (dark ? 256 : 0) | m]
      if (rank > 0) {
        const cl = clouds[((((gy + dY) & 1023) >> lk) << cw) | (((gx + dX) & 1023) >> lk)]
        if (cl !== 0 && cl >> 4 < rank) {
          const tk = cl & 15
          if (tk > 1 || BAYER[bi] < 8) fb[o] = cloud[Math.min(cloud.length - 1, tk - 1)]
        }
      }
      zbuf[o] = depth ? e0_ + de_ * t : COVERED
    }
    return
  }
  const map = g.map
  if (map.bands || (g.zoom === 1 && g.local === 0)) {
    // (a giant's bands, or a map seen whole: paint's own way)
    for (let x = xa; x <= xb; x++, o++) {
      if (zbuf[o] < 1e9) continue
      const t = whole8 ? (x - sa_) * 0.125 : sn_ > 0 ? (x - sa_) / sn_ : 0
      paint(fb, o, g, u0_ + du_ * t, v0_ + dv_ * t, k0_ + dk_ * t, f0_ + df_ * t, by4 | (x & 3), spread)
      zbuf[o] = depth ? e0_ + de_ * t : COVERED
    }
    return
  }
  // a world's or a moon's map drawn finer than whole, round the place under the ship (paint's and mapColour's)
  const lev = LEVELS - 1
  const mw = map.w
  const mh = map.h
  const mspan = map.span
  const midx = map.idx
  const mclouds = map.clouds
  const cw = mw >> 1
  const ch = mh >> 1
  // (the clouds' turn, round once to under a whole turn: the shared clock's turn is a large number, and a cloud's place
  // wrapped from it was a division a pixel)
  const spin = g.cloudSpin - Math.floor(g.cloudSpin)
  const down = g.cloudDown ?? 0
  const flat8 = hzFlat
  const per = map.lit.length
  // (read from the map's level as fine as the span needs, as the ground is: texels snapped to it)
  const ak = levelFor(Math.max(Math.abs(du_) * mw, Math.abs(dv_) * mspan) / Math.max(1, sn_))
  const aidx = ak ? mapLevel(midx, mw, mh, ak) : midx
  const aw = mw >> ak
  for (let x = xa; x <= xb; x++, o++) {
    if (zbuf[o] < 1e9) continue
    const bi = by4 | (x & 3)
    const t = whole8 ? (x - sa_) * 0.125 : sn_ > 0 ? (x - sa_) / sn_ : 0
    const sunK = k0_ + dk_ * t
    const facing = f0_ + df_ * t
    let k = ((sunK + dusk) * 1.3 + 0.02) * (0.5 + 0.5 * ROOT[(facing * 256) | 0])
    if (flat > 0) k += (1 - k) * flat
    let haze = facing < 0.22 && sunK > -0.1 ? (0.22 - facing) / 0.22 : 0
    if (air > 0) {
      const a = air * 0.45 * (0.4 + 0.6 * (1 - facing))
      if (a > haze) haze = a
    }
    let step = hazes ? (haze * 3.3 + BAYER[bi] / 16) | 0 : 0
    if (step > 3) step = 3
    const u = u0_ + du_ * t
    const v = v0_ + dv_ * t
    let l = k * lev + BAYER[bi] / 16
    l = l < 0 ? 0 : l > lev ? lev : l
    let tu = u * mw + DX[bi] * spread
    let tv = v * mspan + DY[bi] * spread
    // (wrapped round only when it is off the map: the same, without a division a pixel)
    if (tu < 0 || tu >= mw) tu -= mw * Math.floor(tu / mw)
    if (tv < 0 || tv >= mh) tv -= mh * Math.floor(tv / mh)
    fb[o] = flat8[step * per + aidx[((tv | 0) >> ak) * aw + ((tu | 0) >> ak)] * LEVELS + (l | 0)]
    if (mclouds !== null) {
      let cu = (u + spin) * cw + DX[(bi + 5) & 15] * spread * 0.5
      let cv = (v + down) * (mspan >> 1)
      if (cu >= cw) cu -= cw
      if (cu < 0 || cu >= cw) cu -= cw * Math.floor(cu / cw)
      if (cv < 0 || cv >= ch) cv -= ch * Math.floor(cv / ch)
      const cl = mclouds[(cv | 0) * cw + (cu | 0)]
      if (cl > 0 && (cl >= 2 || BAYER[bi] < 8)) fb[o] = l < 0.6 ? blend(fb[o], CLOUD[0], 90) : CLOUD[Math.min(3, ((l / lev) * 3.4) | 0)]
    }
    zbuf[o] = depth ? e0_ + de_ * t : COVERED
  }
}

/**
 * A globe from overhead: a disc of radius `rho` with its middle at (cx, cy) on the frame, seen from
 * straight above, the view turned by (cos, sin) as the frame is. Round its lit edge its air glows.
 * Where something nearer covers the frame already, nothing of it is drawn; where it is drawn, the
 * frame's depth is set so that nothing further shows there.
 */
export function drawGlobeTop(f: Frame, g: Globe, cx: number, cy: number, rho: number, cos: number, sin: number) {
  const { w: W, fb, zbuf } = f
  const air = g.map.air
  const rim = air ? Math.max(2, rho * 0.04) : 0
  const reach = rho + rim
  const y0 = Math.max(f.rowLo, Math.floor(cy - reach))
  const y1 = Math.min(f.rowHi - 1, Math.ceil(cy + reach))
  const x0b = Math.max(f.colLo, Math.floor(cx - reach))
  const x1b = Math.min(f.colHi - 1, Math.ceil(cx + reach))
  if (y0 > y1 || x0b > x1b) return
  const inv = 1 / rho
  // a texel covers this many pixels across the middle of the disc (less the finer the map is drawn): the dither spreads that far
  const mag = (rho * TAU) / (g.map.w * g.zoom)
  const spread = mag > 1 ? Math.min(1, mag - 0.6) : 0
  const q = g.q
  prepare(g)
  bandDither = Math.min(0.8, 3 / Math.max(0.1, mag * 8))
  bandStreak = mag > 1.5 ? Math.min(1, (mag - 1.5) / 6) : 0
  // (the light of the edge, in the world: the body's light turned out by Q)
  const wlx = q[0] * g.lx + q[1] * g.ly + q[2] * g.lz
  const wly = q[3] * g.lx + q[4] * g.ly + q[5] * g.lz
  const reachK = reach * inv
  for (let y = y0; y <= y1; y++) {
    const sy = (y + 0.5 - cy) * inv
    const sy2 = sy * sy
    if (sy2 > reachK * reachK) continue
    const half = Math.sqrt(Math.max(0, reachK * reachK - sy2)) * rho
    const xa = Math.max(x0b, Math.floor(cx - half))
    const xb = Math.min(x1b, Math.ceil(cx + half))
    // the samples along the row
    const n = Math.min(MOST - 2, Math.ceil((xb - xa) / SPAN))
    for (let i = 0; i <= n; i++) {
      const x = Math.min(xb, xa + i * SPAN)
      const sx = (x + 0.5 - cx) * inv
      const r2 = sx * sx + sy2
      if (r2 >= 1) {
        sHit[i] = 0
        continue
      }
      const wx = sx * cos + sy * sin
      const wy = -sx * sin + sy * cos
      const wz = Math.sqrt(1 - r2)
      toBody(q, wx, wy, wz)
      sample(g, i, nb.x, nb.y, nb.z, wz, 0)
    }
    let o = y * W + xa
    const by4 = (y & 3) << 2
    let x = xa
    while (x <= xb) {
      const i = ((x - xa) / SPAN) | 0
      const xs = xa + i * SPAN
      // (a span whose two ends are on the disc is wholly on it: its pixels painted as a run)
      if (x === xs && i < n && spanOf(i, xs, Math.min(xb, xs + SPAN))) {
        const xe = Math.min(xb, xs + SPAN - 1)
        paintRun(f, g, o, xs, xe, by4, spread, false)
        o += xe - x + 1
        x = xe + 1
        continue
      }
      pixel: {
        // (behind something nearer drawn already: nothing of it shows there)
        if (zbuf[o] < 1e9) break pixel
        const sx = (x + 0.5 - cx) * inv
        const r2 = sx * sx + sy2
        const bi = by4 | (x & 3)
        if (r2 >= 1) {
          // the air round its edge, on its lit side
          if (!air) break pixel
          const r = Math.sqrt(r2)
          const out = (r - 1) * rho
          if (out > rim) break pixel
          const wx = sx * cos + sy * sin
          const wy = -sx * sin + sy * cos
          const sun = (wx * wlx + wy * wly) / r
          // (round the night side too, faintly: the sun's light through the air at its edge)
          const k = (1 - out / rim) * Math.max(0.3, sun * 0.8 + 0.35)
          if (k * 16 > BAYER[bi] + 2) fb[o] = blend(fb[o], air, 150)
          break pixel
        }
        if (!between(fb, o, g, i, xs, Math.min(xb, xs + SPAN), x, bi, spread)) {
          const wx = sx * cos + sy * sin
          const wy = -sx * sin + sy * cos
          const wz = Math.sqrt(1 - r2)
          toBody(q, wx, wy, wz)
          mapUV(g, nb.x, nb.y, nb.z)
          paint(fb, o, g, MUV[0], MUV[1], nb.x * g.lx + nb.y * g.ly + nb.z * g.lz, wz, bi, spread)
        }
        zbuf[o] = COVERED
      }
      x++
      o++
    }
  }
}

/** a pinhole camera, as the view projects in perspective (render/view.ts): where it is, which way it looks, and how wide */
export interface Cam {
  ox: number
  oy: number
  oz: number
  /** its forward and its up (level, and the world's up, unless the camera is pitched: in space) and its right (always level) */
  fx: number
  fy: number
  fz: number
  ux: number
  uy: number
  uz: number
  rx: number
  ry: number
  focal: number
  /** where its middle is on the frame across, and the row of the horizon */
  cx: number
  hy: number
  /** the view's own point, which depths are measured from (as the ships' are), along its forward */
  vx: number
  vy: number
  vz: number
}

/** where a point is on the frame through the camera (false: behind it) */
export const seen = { x: 0, y: 0, d: 0 }
export function look(c: Cam, x: number, y: number, z: number) {
  const dx = x - c.ox
  const dy = y - c.oy
  const dz = z - c.oz
  const d = dx * c.fx + dy * c.fy + dz * c.fz
  if (d <= 1e-3) return false
  const k = c.focal / d
  seen.x = c.cx + (dx * c.rx + dy * c.ry) * k
  seen.y = c.hy - (dx * c.ux + dy * c.uy + dz * c.uz) * k
  seen.d = d
  return true
}

/** the box of the frame a sphere can cover through the camera (the whole frame when the camera is close to it or it is behind) */
export const box = { x0: 0, y0: 0, x1: 0, y1: 0 }
export function sphereBox(f: Frame, c: Cam, x: number, y: number, z: number, r: number) {
  const dx = x - c.ox
  const dy = y - c.oy
  const dz = z - c.oz
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  box.x0 = f.colLo
  box.y0 = f.rowLo
  box.x1 = f.colHi - 1
  box.y1 = f.rowHi - 1
  if (dist < r * 1.02) return true
  const ahead = dx * c.fx + dy * c.fy + dz * c.fz
  // (wholly behind the camera: nothing to draw)
  if (ahead < -r) return false
  if (ahead < r * 1.1) return true
  if (!look(c, x, y, z)) return true
  // (its angular radius, generously: the widest it can look anywhere on the frame)
  const ang = Math.asin(Math.min(1, r / dist))
  const reach = (Math.tan(Math.min(1.45, ang)) * c.focal * dist) / ahead + 2
  box.x0 = Math.max(f.colLo, Math.floor(seen.x - reach))
  box.x1 = Math.min(f.colHi - 1, Math.ceil(seen.x + reach))
  box.y0 = Math.max(f.rowLo, Math.floor(seen.y - reach))
  box.y1 = Math.min(f.rowHi - 1, Math.ceil(seen.y + reach))
  return box.x0 <= box.x1 && box.y0 <= box.y1
}

/**
 * A globe in perspective: each pixel's ray from the camera, met by the sphere (the nearer side),
 * coloured from the map there; where a ray grazes past the edge, its air glows. The depth of what
 * is drawn goes into the frame's depth buffer, so that a ship beyond the globe is hidden by it;
 * where something nearer covers the frame already, nothing of it is drawn.
 */
export function castGlobe(f: Frame, g: Globe, c: Cam) {
  const air = g.map.air
  const rim = air ? g.r * 0.05 : 0
  // (inside it: a gas giant's outer bands, skimmed)
  const ix = g.x - c.ox
  const iy = g.y - c.oy
  const iz = g.z - c.oz
  if (ix * ix + iy * iy + iz * iz < g.r * g.r) {
    castInside(f, g, c)
    return
  }
  if (!sphereBox(f, c, g.x, g.y, g.z, g.r + rim)) return
  const { w: W, fb, zbuf } = f
  const { x0, y0, x1, y1 } = box
  const lx = g.x - c.ox
  const ly = g.y - c.oy
  const lz = g.z - c.oz
  const ll = lx * lx + ly * ly + lz * lz
  const cc = ll - g.r * g.r
  const outer = g.r + rim
  const cco = ll - outer * outer
  const q = g.q
  const wlx = q[0] * g.lx + q[1] * g.ly + q[2] * g.lz
  const wly = q[3] * g.lx + q[4] * g.ly + q[5] * g.lz
  const wlz = q[6] * g.lx + q[7] * g.ly + q[8] * g.lz
  prepare(g)
  // how far the nearest of it is, and so how large a texel is there: the dither spreads that far
  const near = Math.max(1, Math.sqrt(ll) - g.r)
  const mag = (c.focal * ((g.r * TAU) / (g.map.w * g.zoom))) / near
  const spread = mag > 1 ? Math.min(1, mag - 0.6) : 0
  bandDither = Math.min(0.8, 3 / Math.max(0.1, mag * 8))
  bandStreak = mag > 1.5 ? Math.min(1, (mag - 1.5) / 6) : 0
  const rLr = lx * c.rx + ly * c.ry
  const inv = 1 / g.r
  /** the meeting of the ray (dx, dy, dz) with the sphere, worked out wholly: into sample slot i (or none) */
  const exact = (i: number, dx: number, dy: number, dz: number) => {
    const b = lx * dx + ly * dy + lz * dz
    const a = dx * dx + dy * dy + dz * dz
    const d2 = b * b - a * cc
    if (b <= 0 || d2 < 0) {
      sHit[i] = 0
      return
    }
    // (the nearer meeting, worked out so that a sphere far larger than the distance to it keeps its precision)
    const t = cc / (b + Math.sqrt(d2))
    const px = c.ox + dx * t
    const py = c.oy + dy * t
    const nx = (px - g.x) * inv
    const ny = (py - g.y) * inv
    const nz = (c.oz + dz * t - g.z) * inv
    const facing = -(nx * dx + ny * dy + nz * dz) / Math.sqrt(a)
    toBody(q, nx, ny, nz)
    // (its depth into the view, as a ship's is measured)
    sample(g, i, nb.x, nb.y, nb.z, facing, (px - c.vx) * c.fx + (py - c.vy) * c.fy + (c.oz + dz * t - c.vz) * c.fz)
  }
  for (let y = y0; y <= y1; y++) {
    const up = c.hy - (y + 0.5)
    const by4 = (y & 3) << 2
    // the ray's direction at the row's first pixel, and its steps along the row
    const across0 = x0 + 0.5 - c.cx
    const dx0 = c.fx * c.focal + c.ux * up + c.rx * across0
    const dy0 = c.fy * c.focal + c.uy * up + c.ry * across0
    const dz = c.fz * c.focal + c.uz * up
    // the samples along the row
    const n = Math.min(MOST - 2, Math.ceil((x1 - x0) / SPAN))
    for (let i = 0; i <= n; i++) {
      const k = Math.min(x1, x0 + i * SPAN) - x0
      exact(i, dx0 + c.rx * k, dy0 + c.ry * k, dz)
    }
    let dx = dx0
    let dy = dy0
    let b = lx * dx + ly * dy + lz * dz
    let o = y * W + x0
    let x = x0
    while (x <= x1) {
      const i = ((x - x0) / SPAN) | 0
      const xs = x0 + i * SPAN
      // (a span whose two ends meet the globe is wholly on it, the globe being round: its pixels painted as a run)
      if (x === xs && i < n && spanOf(i, xs, Math.min(x1, xs + SPAN))) {
        const xe = Math.min(x1, xs + SPAN - 1)
        paintRun(f, g, o, xs, xe, by4, spread, true)
        // (the ray stepped along as the pixels went, a step a pixel, as the pixels worked out wholly expect it)
        for (; x <= xe; x++, o++) {
          dx += c.rx
          dy += c.ry
          b += rLr
        }
        continue
      }
      pixel: {
        // (behind something nearer drawn already, or turned away: nothing of it shows there)
        if (b <= 0 || zbuf[o] < 1e9) break pixel
        const a = dx * dx + dy * dy + dz * dz
        const disc = b * b - a * cco
        if (disc < 0) break pixel
        const bi = by4 | (x & 3)
        const d2 = b * b - a * cc
        if (d2 < 0) {
          // the air, grazed: brighter the closer the ray comes to the ground, on the lit side
          if (!air) break pixel
          const t = b / a
          const px = c.ox + dx * t - g.x
          const py = c.oy + dy * t - g.y
          const pz = c.oz + dz * t - g.z
          const pr = Math.sqrt(px * px + py * py + pz * pz)
          const k = (1 - (pr - g.r) / rim) * Math.max(0, ((px * wlx + py * wly + pz * wlz) / pr) * 0.8 + 0.35)
          if (k * 16 > BAYER[bi] + 2) fb[o] = blend(fb[o], air, 150)
          break pixel
        }
        if (spanOf(i, xs, Math.min(x1, xs + SPAN))) {
          const v = SPANV
          const t = v[1] > 0 ? (x - v[0]) / v[1] : 0
          paint(fb, o, g, v[2] + v[3] * t, v[4] + v[5] * t, v[6] + v[7] * t, v[8] + v[9] * t, bi, spread)
          zbuf[o] = v[10] + v[11] * t
        } else {
          // (a span that leaves the globe: this pixel worked out wholly)
          exact(MOST - 1, dx, dy, dz)
          if (sHit[MOST - 1] === 0) break pixel
          paint(fb, o, g, sU[MOST - 1], sV[MOST - 1], sK[MOST - 1], sF[MOST - 1], bi, spread)
          zbuf[o] = sD[MOST - 1]
        }
      }
      x++
      o++
      dx += c.rx
      dy += c.ry
      b += rLr
    }
  }
}

/** how deep a gas giant's clouds go before they hide everything (a share of its radius), and the deepest a ray is seen into */
const DEPTH = 0.06

/**
 * Inside a gas giant's outer bands (skimming): every way the camera looks is cloud. Looking in
 * towards its middle the bands are thick and dark, close; looking out, they thin to space. Each
 * ray goes as far as it would before the clouds hide what is beyond (or out into space), and takes
 * the colour of the bands where it ends, deeper and darker the further in.
 */
function castInside(f: Frame, g: Globe, c: Cam) {
  const { w: W, fb, zbuf } = f
  const lx = g.x - c.ox
  const ly = g.y - c.oy
  const lz = g.z - c.oz
  const ll = lx * lx + ly * ly + lz * lz
  const R = g.r
  const inv = 1 / R
  const q = g.q
  prepare(g)
  // (how deep the camera is in it, 0 at its edge)
  const deep = Math.max(0, 1 - Math.sqrt(ll) * inv)
  const reach = R * DEPTH
  /** where the ray (dx, dy, dz) ends in the clouds: into sample slot i (its place on the map, its light, how thin the cloud is there) */
  const end = (i: number, dx: number, dy: number, dz: number) => {
    const a = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const ux = dx / a
    const uy = dy / a
    const uz = dz / a
    // how far out of it the ray goes (to its edge), and how far it can be seen into the clouds
    const b = lx * ux + ly * uy + lz * uz
    const out = b + Math.sqrt(Math.max(0, b * b - ll + R * R))
    const t = Math.min(out, reach)
    const px = (c.ox + ux * t - g.x) * inv
    const py = (c.oy + uy * t - g.y) * inv
    const pz = (c.oz + uz * t - g.z) * inv
    const pr = Math.sqrt(px * px + py * py + pz * pz)
    toBody(q, px / pr, py / pr, pz / pr)
    mapUV(g, nb.x, nb.y, nb.z)
    sU[i] = MUV[0]
    // (a giant's bands bent here, once a sample, not once a pixel)
    sV[i] = g.map.bands ? bent(MUV[0], MUV[1]) : MUV[1]
    // (lit from the sun's way, deeper and darker further in)
    sK[i] = (nb.x * g.lx + nb.y * g.ly + nb.z * g.lz) * 0.6 + 0.35 - (1 - pr) * 6
    // (out to space through thin cloud: space shows through, the more the thinner)
    sF[i] = t < reach ? 1 - t / reach : 0
  }
  const x0 = f.colLo
  const x1 = f.colHi - 1
  // (the cloud is soft, so a row is worked out exactly every SPAN pixels and carried evenly between)
  const n = Math.min(MOST - 2, Math.ceil((x1 - x0) / SPAN))
  bend = !g.map.bands
  for (let y = f.rowLo; y < f.rowHi; y++) {
    const up = c.hy - (y + 0.5)
    const by4 = (y & 3) << 2
    const across0 = x0 + 0.5 - c.cx
    const dx0 = c.fx * c.focal + c.ux * up + c.rx * across0
    const dy0 = c.fy * c.focal + c.uy * up + c.ry * across0
    const dz0 = c.fz * c.focal + c.uz * up
    for (let i = 0; i <= n; i++) {
      const k = Math.min(x1, x0 + i * SPAN) - x0
      end(i, dx0 + c.rx * k, dy0 + c.ry * k, dz0)
    }
    let o = y * W + x0
    for (let x = x0; x <= x1; x++, o++) {
      if (zbuf[o] < 1e9) continue
      const i = ((x - x0) / SPAN) | 0
      const xa = x0 + i * SPAN
      const xb = Math.min(x1, xa + SPAN)
      const t = xb > xa ? (x - xa) / (xb - xa) : 0
      const bi = by4 | (x & 3)
      const thin = sF[i] + (sF[i + 1] - sF[i]) * t
      if (thin > 0.05 && thin * 16 > BAYER[bi] + 8 * (1 - deep * 6)) continue
      let du = sU[i + 1] - sU[i]
      du -= Math.round(du)
      const k = sK[i] + (sK[i + 1] - sK[i]) * t
      paint(fb, o, g, sU[i] + du * t, sV[i] + (sV[i + 1] - sV[i]) * t, Math.max(-0.2, k), 0.6, bi, 1)
      zbuf[o] = COVERED
    }
  }
  bend = true
}

// ── a world's or moon's disc from overhead, kept a moment: under a ship in space it changes slowly (its turning and its
// light), and it was the dearest thing in an open system on a slow machine (the processor slowed four times: 27 to 37
// frames a second over a world). Drawn once, square to the world (not turned with the view), into a picture of its own;
// then each frame every pixel of the disc on the frame takes its colour from that picture, turned as the view is; drawn
// again every KEEP seconds, or at once when its size changes.

const KEEP = 0.5
/** rows of a kept disc drawn again each frame, so the drawing is spread out and never one long frame */
const BAND = 24
const kept = new Map<number, { rho: number; at: number; reach: number; px: Uint32Array; frame: Frame; row: number }>()

/** drawGlobeTop, from a picture kept a moment (by the body's index); `time` is the scene's clock */
export function drawGlobeTopKept(
  f: Frame,
  g: Globe,
  id: number,
  cx: number,
  cy: number,
  rho: number,
  cos: number,
  sin: number,
  time: number,
) {
  const reach = Math.ceil(rho * 1.06) + 2
  let k = kept.get(id)
  if (!k || k.rho !== rho) {
    // (the first time, drawn whole at once)
    const size = reach * 2 + 1
    const frame = createFrame(size, size)
    frame.zbuf.fill(1e9)
    drawGlobeTop(frame, g, reach + 0.5, reach + 0.5, rho, 1, 0)
    k = { rho, at: time, reach, px: frame.fb.slice(), frame, row: -1 }
    kept.set(id, k)
    if (kept.size > 4) kept.delete(kept.keys().next().value!)
  } else {
    const size = k.reach * 2 + 1
    // (drawn again a band of rows a frame, the picture shown changing only once it is whole)
    if (k.row < 0 && (time - k.at > KEEP || time < k.at)) {
      k.row = 0
      k.frame.fb.fill(0)
      k.frame.zbuf.fill(1e9)
    }
    if (k.row >= 0) {
      k.frame.rowLo = k.row
      k.frame.rowHi = Math.min(size, k.row + BAND)
      drawGlobeTop(k.frame, g, reach + 0.5, reach + 0.5, rho, 1, 0)
      k.row += BAND
      if (k.row >= size) {
        k.px.set(k.frame.fb)
        k.at = time
        k.row = -1
      }
    }
  }
  const size = k.reach * 2 + 1
  const R = k.reach
  const { w: W, fb, zbuf } = f
  const ya = Math.max(f.rowLo, Math.floor(cy - R))
  const yb = Math.min(f.rowHi - 1, Math.ceil(cy + R))
  for (let y = ya; y <= yb; y++) {
    const dy = y + 0.5 - cy
    const half = Math.sqrt(Math.max(0, R * R - dy * dy))
    const xa = Math.max(f.colLo, Math.floor(cx - half))
    const xb = Math.min(f.colHi - 1, Math.ceil(cx + half))
    for (let x = xa; x <= xb; x++) {
      const o = y * W + x
      if (zbuf[o] < 1e9) continue
      const dx = x + 0.5 - cx
      // (where this pixel is on the globe, square to the world: as drawGlobeTop turns a pixel by the view)
      const u = Math.floor(R + 0.5 + dx * cos + dy * sin)
      const v = Math.floor(R + 0.5 - dx * sin + dy * cos)
      if (u < 0 || v < 0 || u >= size || v >= size) continue
      const c = k.px[v * size + u]
      if (c === 0) continue
      fb[o] = c
      zbuf[o] = COVERED
    }
  }
}
