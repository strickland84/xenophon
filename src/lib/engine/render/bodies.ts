// The bodies of space that are not globes (render/globe.ts draws worlds, moons and gas giants):
// suns, boiling, with a ragged corona and a wide glow, from overhead and in perspective; and black
// holes, which bend the stars behind them round a bright ring, with a disc of hot gas streaming
// round them in eddies. Each is drawn pixel by pixel into the frame at the size it is (render/space.ts
// says where), and nothing further shows where one is drawn.

import type { Frame } from './frame'
import { COVERED, SWY, warp } from './globe'
import { BAYER, blend, pack } from '../util/color'
import { SUN_NEAR } from '../space/art'
import { brightnessOf } from '../space/pictures'

/** how the view is turned: a screen offset (u, w) is the world offset (u·cos + w·sin, −u·sin + w·cos) */
export interface Turn {
  cos: number
  sin: number
}

/** a sun's colours from its dark edge to its white heart (16), and its corona's */
export interface SunColours {
  ramp: Uint32Array
  glow: number
  flare: number
}

/** a fast angle (0..1 once round) from a direction: good enough for the corona's ragged flares */
function turnOf(dx: number, dy: number) {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  const a = ax + ay > 0 ? (ax > ay ? ay / ax : 2 - ax / ay) : 0
  // (0..8 round the square, made a share of a turn)
  const q = dx >= 0 ? (dy >= 0 ? a : 8 - a) : dy >= 0 ? 4 - a : 4 + a
  return q / 8
}

/** the corona's ragged edge round a sun, by angle (a share of a turn, in FLARE_N steps), worked out once a frame */
const FLARE_N = 512
const flareEdge = new Float32Array(FLARE_N)
/** the corona's glow by distance beyond its edge (in 64ths of the sun's radius), out of 256 */
const GLOW_N = 128
const GLOW = new Int32Array(GLOW_N)
for (let i = 0; i < GLOW_N; i++) GLOW[i] = Math.round(Math.exp(-(i / 64) * 2.6) * 200)

/** the corona's edge at a share of a turn round the sun, between its steps (a sun far larger than the frame shows no steps in it) */
function edgeAt(turn: number) {
  const x = turn * FLARE_N
  const i = Math.floor(x)
  const f = x - i
  const a = flareEdge[i & (FLARE_N - 1)]
  return a + (flareEdge[(i + 1) & (FLARE_N - 1)] - a) * f
}

/** the glow this far beyond the corona's edge (in the sun's radii), between the table's steps */
function glowAt(out: number) {
  const x = out * 64
  const i = x | 0
  if (i >= GLOW_N - 1) return 0
  return GLOW[i] + (GLOW[i + 1] - GLOW[i]) * (x - i)
}

/**
 * The corona's grain at a turn round a sun and a height over it (in its radii), 0..1: SUN_NEAR drawn out into streaks
 * along the way out, so its flames are ragged tongues and its glow comes in rays (polish step 9: from overhead it was a
 * band of flat dithered orange)
 */
function corona(near: Uint8Array, nw: number, nh: number, turn: number, out: number, t: number) {
  // (between the picture's texels, not the nearest: by a great sun one texel spans a dozen art pixels and more, and from
  // overhead the glow was a mosaic of blurred squares many times the size of every other pixel on the screen)
  const fu = turn * nw * 6
  const fv = out * nh * 0.9 - t * 1.3
  const u0 = Math.floor(fu)
  const v0 = Math.floor(fv)
  const a = fu - u0
  const b = fv - v0
  const U0 = ((u0 % nw) + nw) % nw
  const U1 = U0 + 1 === nw ? 0 : U0 + 1
  const V0 = ((v0 % nh) + nh) % nh
  const V1 = V0 + 1 === nh ? 0 : V0 + 1
  const top = near[V0 * nw + U0] * (1 - a) + near[V0 * nw + U1] * a
  const low = near[V1 * nw + U0] * (1 - a) + near[V1 * nw + U1] * a
  return (top * (1 - b) + low * b) / 15
}

/**
 * A sun's surface at a point, a step of its ramp (0..15): a hot heart darkening and reddening to the limb, the great cells
 * (`coarse`, 0..1) faintly, and the granules close to (`fine`, 0..1: bright cells, darker lanes, and the sunspots at its
 * darkest, near black), dithered by `bi` (polish step 9: close to, it was a wall of flat cream, nearly every pixel the top
 * of the ramp)
 */
function sunTone(coarse: number, fine: number, limb: number, bi: number) {
  let k = 1.2 + 10.8 * Math.pow(limb, 0.4) + (coarse - 0.5) * 3 + (fine - 0.55) * 7.5 + BAYER[bi] / 16 - 0.5
  // (a sunspot: its core dark, its rim between)
  if (fine < 0.2) k -= (0.2 - fine) * 45
  return k < 0 ? 0 : k > 15 ? 15 : k | 0
}

/** a colour added to another, k parts in 256 (light on light: a glow) */
function add(bg: number, fg: number, k: number) {
  let r = (bg & 255) + (((fg & 255) * k) >> 8)
  let g = ((bg >> 8) & 255) + ((((fg >> 8) & 255) * k) >> 8)
  let b = ((bg >> 16) & 255) + ((((fg >> 16) & 255) * k) >> 8)
  if (r > 255) r = 255
  if (g > 255) g = 255
  if (b > 255) b = 255
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
}

/**
 * A sun of radius R at (cx, cy): its surface boiling (two layers of its brightness map drifting
 * across each other), deeper in colour to its edge, and round it a corona of ragged flares and a
 * wide glow that lights up whatever is behind it.
 */
export function drawSun(
  f: Frame,
  cx: number,
  cy: number,
  R: number,
  cols: SunColours,
  surf: Uint8Array,
  sn: number,
  t: number,
  turn: Turn,
) {
  const { w: W, h: H, fb, zbuf } = f
  const reach = R * 2.6
  const y0 = Math.max(0, Math.floor(cy - reach))
  const y1 = Math.min(H - 1, Math.ceil(cy + reach))
  const x0 = Math.max(0, Math.floor(cx - reach))
  const x1 = Math.min(W - 1, Math.ceil(cx + reach))
  if (x0 > x1 || y0 > y1) return
  const invR = 1 / R
  const { ramp, glow, flare } = cols
  const NW = SUN_NEAR.w
  const NH = SUN_NEAR.h
  const near = brightnessOf(SUN_NEAR)
  const ax = t * 3.1
  const ay = t * 1.7
  const bx = -t * 2.3
  const by = t * 2.9
  const c = turn.cos
  const s = turn.sin
  // the flares: a ragged edge, made of a few waves round the sun, slowly changing
  for (let i = 0; i < FLARE_N; i++) {
    const a = i / FLARE_N
    const w =
      0.5 * Math.sin(a * Math.PI * 2 * 7 + t * 0.21) +
      0.3 * Math.sin(a * Math.PI * 2 * 13 - t * 0.37) +
      0.2 * Math.sin(a * Math.PI * 2 * 29 + t * 0.53)
    // (and now and then a great prominence, rising and falling slowly)
    const big = Math.max(0, Math.sin(a * Math.PI * 2 * 3 + t * 0.07) - 0.82) * 1.6
    flareEdge[i] = 0.05 + 0.09 * (w + 1) + big * big
  }
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    let o = y * W + x0
    for (let x = x0; x <= x1; x++, o++) {
      const dx = x + 0.5 - cx
      // (behind something nearer drawn already: nothing of it shows there)
      if (zbuf[o] < 1e9) continue
      const r = Math.sqrt(dx * dx + dy * dy) * invR
      const bi = ((y & 3) << 2) | (x & 3)
      if (r < 1) {
        // the surface, in the body's own frame (it turns with the view)
        zbuf[o] = COVERED
        const wx = dx * c + dy * s
        const wy = -dx * s + dy * c
        // (the great cells, coarse, and the granules, lanes and sunspots seen close over them: SUN and SUN_NEAR)
        const ia = ((((wx * 0.25 + ax * 0.3) | 0) % sn) + sn) % sn
        const ja = ((((wy * 0.25 + ay * 0.3) | 0) % sn) + sn) % sn
        const nu = (((wx * 0.8 + bx) % NW) + NW) % NW
        const nv = (((wy * 0.8 + by) % NH) + NH) % NH
        const limb = Math.sqrt(1 - r * r)
        fb[o] = ramp[sunTone(surf[ja * sn + ia] / 15, near[(nv | 0) * NW + (nu | 0)] / 15, limb, bi)]
        continue
      }
      // the corona: flames licking out from the edge, hottest where they leave it, then a glow far beyond them
      const out = r - 1
      const turn = turnOf(dx * c + dy * s, -dx * s + dy * c)
      const edge = edgeAt(turn)
      const ray = corona(near, NW, NH, turn, out, t)
      if (out < edge) {
        const k = 1 - out / edge
        const heat = (k * k * 9 + 3 + (ray - 0.5) * 5 + BAYER[bi] / 16) | 0
        if (k * 18 > BAYER[bi] + 2 - (ray - 0.5) * 8) fb[o] = ramp[heat > 15 ? 15 : heat < 0 ? 0 : heat]
        else fb[o] = add(fb[o], flare, 120)
        continue
      }
      // (and to nothing by where it ends, not to a faint line)
      const k = glowAt(out - edge) * (0.55 + ray * 0.9) * Math.min(1, (1.6 - out) * 4) + BAYER[bi] - 8
      if (k > 0) fb[o] = add(fb[o], glow, k)
    }
  }
}

/**
 * A sun in perspective (render/globe.ts's camera): each pixel's ray from the camera, met by the
 * sphere or passing it. Met, its surface boils as from overhead (the two layers of its picture,
 * laid round the sphere by longitude and latitude) and reddens to its limb; passed close, its
 * corona's flames lick out round the edge, and further out its glow lights what is behind.
 */
export function castSun(
  f: Frame,
  c: {
    ox: number
    oy: number
    oz: number
    fx: number
    fy: number
    fz: number
    ux: number
    uy: number
    uz: number
    rx: number
    ry: number
    focal: number
    cx: number
    hy: number
  },
  sx: number,
  sy: number,
  sz: number,
  R: number,
  cols: SunColours,
  surf: Uint8Array,
  sn: number,
  t: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const { w: W, fb, zbuf } = f
  const { ramp, glow, flare } = cols
  const lx = sx - c.ox
  const ly = sy - c.oy
  const lz = sz - c.oz
  const ll = lx * lx + ly * ly + lz * lz
  const rLr = lx * c.rx + ly * c.ry
  const R2 = R * R
  const invR = 1 / R
  // the flares' ragged edge, round the sun as the frame sees it
  for (let i = 0; i < FLARE_N; i++) {
    const a = i / FLARE_N
    const w =
      0.5 * Math.sin(a * Math.PI * 2 * 7 + t * 0.21) +
      0.3 * Math.sin(a * Math.PI * 2 * 13 - t * 0.37) +
      0.2 * Math.sin(a * Math.PI * 2 * 29 + t * 0.53)
    // (and now and then a great prominence, rising and falling slowly)
    const big = Math.max(0, Math.sin(a * Math.PI * 2 * 3 + t * 0.07) - 0.82) * 1.6
    flareEdge[i] = 0.05 + 0.09 * (w + 1) + big * big
  }
  // (where its middle is on the frame, for the flares' angle round it)
  const ahead = lx * c.fx + ly * c.fy + lz * c.fz
  const mx = ahead > 1 ? c.cx + ((lx * c.rx + ly * c.ry) * c.focal) / ahead : c.cx
  const my = ahead > 1 ? c.hy - ((lx * c.ux + ly * c.uy + lz * c.uz) * c.focal) / ahead : c.hy
  // (its surface: granules a few px across, whatever the distance: so many of the picture's texels a radian)
  const gran = Math.max(200, Math.min(6000, (R * 0.3) | 0))
  const NW = SUN_NEAR.w
  const NH = SUN_NEAR.h
  const near = brightnessOf(SUN_NEAR)
  // (the granules close to about the same size on the frame however near: SUN_NEAR's texels a turn round it, two px each
  // where it is nearest)
  const fineT = Math.min(60000, (R * c.focal) / (2 * Math.max(R * 0.02, Math.sqrt(ll) - R))) * Math.PI * 2
  const ax = t * 3.1
  const ay = t * 1.7
  for (let y = y0; y <= y1; y++) {
    const up = c.hy - (y + 0.5)
    const across0 = x0 + 0.5 - c.cx
    let dx = c.fx * c.focal + c.ux * up + c.rx * across0
    let dy = c.fy * c.focal + c.uy * up + c.ry * across0
    const dz = c.fz * c.focal + c.uz * up
    let b = lx * dx + ly * dy + lz * dz
    let o = y * W + x0
    for (let x = x0; x <= x1; x++, o++, dx += c.rx, dy += c.ry, b += rLr) {
      if (zbuf[o] < 1e9) continue
      const a = dx * dx + dy * dy + dz * dz
      // how close the ray comes to the middle, as a share of its radius: looking away from the sun, as close as the camera
      // itself is. (Those rays were left out, and in the glow, near a sun, it ended at a straight line square to the way
      // to the sun, bright on one side and black on the other: James, 2026-11-19.)
      const perp2 = b > 0 ? ll - (b * b) / a : ll
      const r = Math.sqrt(Math.max(0, perp2)) * invR
      const bi = ((y & 3) << 2) | (x & 3)
      if (perp2 < R2 && b > 0) {
        const tt = (b - Math.sqrt(R2 - perp2) * Math.sqrt(a)) / a
        const nx = (c.ox + dx * tt - sx) * invR
        const ny = (c.oy + dy * tt - sy) * invR
        const nz = (c.oz + dz * tt - sz) * invR
        const lon = Math.atan2(nx, ny) / (Math.PI * 2) + 0.5
        const lat = nz * 0.5 + 0.5
        // the great cells (SUN, coarse) and over them the granules, lanes and sunspots seen close (SUN_NEAR, the model's)
        const ia = ((((lon * gran * 0.25 + ax * 0.2) | 0) % sn) + sn) % sn
        const ja = ((((lat * gran * 0.125 + ay * 0.2) | 0) % sn) + sn) % sn
        const nu = (((lon * fineT + ax * 0.5) % NW) + NW) % NW
        const nv = (((lat * fineT * 0.5 + ay * 0.5) % NH) + NH) % NH
        const fine = near[(nv | 0) * NW + (nu | 0)] / 15
        const limb = Math.sqrt(Math.max(0, 1 - r * r))
        fb[o] = ramp[sunTone(surf[ja * sn + ia] / 15, fine, limb, bi)]
        zbuf[o] = COVERED
        continue
      }
      const out = r - 1
      if (out > 1.6) continue
      const turn = turnOf(x + 0.5 - mx, y + 0.5 - my)
      const edge = edgeAt(turn)
      const ray = corona(near, NW, NH, turn, out, t)
      if (out < edge) {
        const k = 1 - out / edge
        const heat = (k * k * 9 + 3 + (ray - 0.5) * 5 + BAYER[bi] / 16) | 0
        if (k * 18 > BAYER[bi] + 2 - (ray - 0.5) * 8) fb[o] = ramp[heat > 15 ? 15 : heat < 0 ? 0 : heat]
        else fb[o] = add(fb[o], flare, 120)
        continue
      }
      const k = glowAt(out - edge) * (0.55 + ray * 0.9) + BAYER[bi] - 8
      if (k > 0) fb[o] = add(fb[o], glow, k)
    }
  }
}

/**
 * A black hole of size S at (cx, cy): the stars and the bodies behind it are bent round it (drawn
 * already: they are taken from the frame and put back bent), its disc of hot gas swirls round
 * it, a thin bright ring burns at the edge of its shadow, and the middle is black. Where the frame
 * holds something nearer than `near` (its depth, in perspective), that is left as it is.
 *
 * Seen from above (overhead) its disc lies face on. Seen from beside it (from behind the ship or the seat, `tilt` the
 * sine of the eye's height over the disc's plane, under 1), the disc is tilted away: a flattened ellipse whose near half
 * passes in front of the shadow and whose far half goes behind it, and the far half's light, bent over the top of the
 * shadow (and a little under it), makes an arch round it, as such a hole is seen beside its disc.
 */
export function drawHole(
  f: Frame,
  cx: number,
  cy: number,
  S: number,
  disc: Uint32Array,
  da: number,
  dr: number,
  t: number,
  turn: Turn,
  ringR: number,
  horizonR: number,
  discR: number,
  lensR: number,
  near = -Infinity,
  tilt = 1,
) {
  if (tilt < 0.999) {
    drawHoleTilted(f, cx, cy, S, disc, da, dr, t, ringR, horizonR, discR, lensR, near, tilt)
    return
  }
  const { w: W, fb, zbuf } = f
  const reach = S * lensR
  // (only the part of the frame that is shown: in the seat, turned with the ship's roll)
  const y0 = Math.max(f.rowLo, Math.floor(cy - reach))
  const y1 = Math.min(f.rowHi - 1, Math.ceil(cy + reach))
  const x0 = Math.max(f.colLo, Math.floor(cx - reach))
  const x1 = Math.min(f.colHi - 1, Math.ceil(cx + reach))
  if (x0 > x1 || y0 > y1) return
  // what was behind it, to bend
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  if (behind.length < bw * bh) behind = new Uint32Array(bw * bh * 2)
  for (let y = y0; y <= y1; y++) behind.set(fb.subarray(y * W + x0, y * W + x1 + 1), (y - y0) * bw)
  const ring = S * ringR
  const horizon = S * horizonR
  const discOut = S * discR
  const ring2 = ring * ring
  const c = turn.cos
  const sn = turn.sin
  const hot = pack(255, 250, 236)
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    let o = y * W + x0
    for (let x = x0; x <= x1; x++, o++) {
      const dx = x + 0.5 - cx
      const r = Math.sqrt(dx * dx + dy * dy)
      if (r > reach || zbuf[o] < near) continue
      const bi = ((y & 3) << 2) | (x & 3)
      if (r < horizon) {
        fb[o] = 0xff000000
        continue
      }
      // the light behind it: from nearer its middle the further in (an Einstein ring at `ring`)
      let col: number
      const rs = r - ring2 / r
      const k = rs / r
      // (a place behind it off the frame is taken from the nearest on it)
      let sx = Math.round(cx + dx * k - 0.5)
      let sy = Math.round(cy + dy * k - 0.5)
      sx = sx < x0 ? x0 : sx > x1 ? x1 : sx
      sy = sy < y0 ? y0 : sy > y1 ? y1 : sy
      col = behind[(sy - y0) * bw + (sx - x0)]
      // darker in close, the shadow round the horizon
      if (r < ring) col = blend(col, 0xff000000, Math.round(255 * (1 - (r - horizon) / (ring - horizon)) * 0.85))
      // the disc of hot gas, swirling (the inner edge the fastest), in arms that wind inwards, glowing on what is behind
      if (r > ring * 0.92 && r < discOut) {
        // (its gas streams round in eddies, not in rings: where each pixel reads the disc is bent a little)
        const turn = turnOf(dx * c + dy * sn, -dx * sn + dy * c)
        const along = (r - ring * 0.92) / (discOut - ring * 0.92) + warp(SWY, turn * 256 * 3, (r / S) * 40) * 0.05
        // (the picture's own swirls give the grain; the arms and the heat give the shape)
        const heat = swirled(disc, da, dr, turn, along, t, bi, 0.85)
        if (heat > 1) col = add(col, HOLE_RAMP[heat > 15 ? 15 : heat | 0], heat > 6 ? 256 : (heat * 40) | 0)
      }
      // the bright ring
      const off = Math.abs(r - ring)
      if (off < 1.3) col = off < 0.6 ? hot : blend(col, hot, 170)
      fb[o] = col
    }
  }
}
let behind = new Uint32Array(4096)

/** the disc's heat at a place of it (`a` its angle round as a share of a turn, `along` 0 at its inner edge to 1 at its outer) */
function discHeat(disc: Uint32Array, da: number, dr: number, a: number, along: number, bi: number, arms = 0.85) {
  const ai = (((a - Math.floor(a)) * da) | 0) % da
  const ri = Math.min(dr - 1, Math.max(0, (along * dr) | 0))
  const ti = disc[ri * da + ai]
  const grain = ti === 0 ? 0.5 : ((ti & 255) + ((ti >> 8) & 255) + ((ti >> 16) & 255)) / 765
  const arm = ARM[(((a - Math.floor(a)) * ARM_A) | 0) * ARM_R + Math.min(ARM_R - 1, Math.max(0, (along * ARM_R) | 0))]
  const fade = FADE[along <= 0 ? 0 : along >= 1 ? 1023 : (along * 1023) | 0]
  return fade * (1.1 - arms + arms * arm) * (0.85 + 0.3 * grain) * 17 + BAYER[bi] / 16 - 0.5
}

/**
 * The disc's heat where it streams round: two layers of it turning as wholes, the inner quicker, the one fading into the
 * other outwards, so its inner edge runs ahead of its outer. (Polish step 9: it had turned at a pace by its distance out,
 * which wound its arms up tighter for as long as the game ran, until the disc seen face on was rings like a record's.)
 */
function swirled(disc: Uint32Array, da: number, dr: number, turn: number, along: number, t: number, bi: number, arms: number) {
  const w = along <= 0 ? 0 : along >= 1 ? 1 : along
  return (
    discHeat(disc, da, dr, turn + t * 0.32, along, bi, arms) * (1 - w) + discHeat(disc, da, dr, turn + t * 0.07 + 0.37, along, bi, arms) * w
  )
}

/** drawHole seen from beside its disc: the disc a tilted ellipse (`tilt` the sine of the eye's height over its plane), its far half's light bent into an arch over the shadow */
function drawHoleTilted(
  f: Frame,
  cx: number,
  cy: number,
  S: number,
  disc: Uint32Array,
  da: number,
  dr: number,
  t: number,
  ringR: number,
  horizonR: number,
  discR: number,
  lensR: number,
  near: number,
  tilt: number,
) {
  const { w: W, fb, zbuf } = f
  const reach = S * lensR
  const y0 = Math.max(f.rowLo, Math.floor(cy - reach))
  const y1 = Math.min(f.rowHi - 1, Math.ceil(cy + reach))
  const x0 = Math.max(f.colLo, Math.floor(cx - reach))
  const x1 = Math.min(f.colHi - 1, Math.ceil(cx + reach))
  if (x0 > x1 || y0 > y1) return
  const bw = x1 - x0 + 1
  const bh = y1 - y0 + 1
  if (behind.length < bw * bh) behind = new Uint32Array(bw * bh * 2)
  for (let y = y0; y <= y1; y++) behind.set(fb.subarray(y * W + x0, y * W + x1 + 1), (y - y0) * bw)
  const ring = S * ringR
  const horizon = S * horizonR
  const inner = ring * 0.92
  const discOut = S * discR
  const ring2 = ring * ring
  const hot = pack(255, 250, 236)
  // (the arch of bent light reaches this far out from the ring, as a share of the disc's width)
  const arch = (discOut - inner) * 0.4
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy
    let o = y * W + x0
    for (let x = x0; x <= x1; x++, o++) {
      const dx = x + 0.5 - cx
      const r = Math.sqrt(dx * dx + dy * dy)
      if (r > reach || zbuf[o] < near) continue
      const bi = ((y & 3) << 2) | (x & 3)
      // the light behind it, bent (as face on), and the shadow
      let col: number
      if (r < horizon) col = 0xff000000
      else {
        const k = (r - ring2 / r) / r
        let sx = Math.round(cx + dx * k - 0.5)
        let sy = Math.round(cy + dy * k - 0.5)
        sx = sx < x0 ? x0 : sx > x1 ? x1 : sx
        sy = sy < y0 ? y0 : sy > y1 ? y1 : sy
        col = behind[(sy - y0) * bw + (sx - x0)]
        if (r < ring) col = blend(col, 0xff000000, Math.round(255 * (1 - (r - horizon) / (ring - horizon)) * 0.85))
        // the far half's light bent round the shadow: an arch over it, fainter under it
        if (r > inner && r < ring + arch) {
          const along = (r - inner) / (arch + ring - inner)
          const a = turnOf(dx, dy) + t * (0.09 / (0.25 + along))
          // (streaked round it rather than in arms: seen bent, the gas's arms smear into streams)
          const heat = discHeat(disc, da, dr, a, along, bi, 0.3) * (dy < 0 ? 1 : 0.3)
          if (heat > 1) col = add(col, HOLE_RAMP[heat > 15 ? 15 : heat | 0], heat > 6 ? 256 : (heat * 40) | 0)
        }
      }
      // the disc itself, tilted away: its near half (below the middle) in front of the shadow, its far half behind it
      const ey = dy / tilt
      const rho = Math.sqrt(dx * dx + ey * ey)
      if (rho > inner && rho < discOut && (dy > 0 || r >= horizon)) {
        const along = (rho - inner) / (discOut - inner) + warp(SWY, turnOf(dx, ey) * 256 * 3, (rho / S) * 40) * 0.05
        const a = turnOf(dx, ey) + t * (0.09 / (0.25 + along))
        // (seen edge on the disc is deeper, so brighter: its light gathered along the line of sight)
        const heat = discHeat(disc, da, dr, a, along, bi, 0.3) * (1 + (1 - tilt) * 0.5)
        if (heat > 1) col = add(col, HOLE_RAMP[heat > 15 ? 15 : heat | 0], heat > 6 ? 256 : (heat * 40) | 0)
      }
      // the bright ring
      const off = Math.abs(r - ring)
      if (off < 1.3 && (r >= horizon || dy <= 0)) col = off < 0.6 ? hot : blend(col, hot, 170)
      fb[o] = col
    }
  }
}

/** how the disc's heat fades outwards: (1 − along)^1.7, in 1024 steps */
const FADE = new Float32Array(1024)
for (let i = 0; i < 1024; i++) FADE[i] = (1 - i / 1023) ** 1.7

/** a black hole's disc: its heat from dull red to white */
const HOLE_RAMP = new Uint32Array(16)
for (let i = 0; i < 16; i++) {
  const t = i / 15
  HOLE_RAMP[i] = pack(90 + 165 * Math.min(1, t * 1.6), 20 + 230 * Math.max(0, t - 0.25) * 1.33, 6 + 240 * Math.max(0, t - 0.6) * 2.5)
}
/** the disc's arms: brightness by angle (ARM_A steps round) and distance out (ARM_R steps), winding in */
const ARM_A = 256
const ARM_R = 64
const ARM = new Float32Array(ARM_A * ARM_R)
for (let i = 0; i < ARM_A; i++)
  for (let j = 0; j < ARM_R; j++) {
    const a = i / ARM_A
    const along = j / ARM_R
    ARM[i * ARM_R + j] = 0.5 + 0.5 * Math.sin((a * 3 + Math.log(0.15 + along) * 1.6) * Math.PI * 2)
  }
