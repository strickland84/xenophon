// Draws one jet: its stack of slices turned to any angle, its afterburner flames, an open
// canopy, and the dark outline round the lot.
//
// A ship is a solid of voxels, many slices tall, seen from any side (from above, from behind, from
// the seat). Each voxel is drawn where its slice crosses it, and, when the slices are drawn more
// than a pixel apart (a ship close to, from behind or from the seat), down its height too, so its
// sides are solid. Its voxels are kept in order by a depth test of their own (`Frame.jetZ`), so
// whichever way it is turned the nearest face shows.

import { axes, ENGINES_MAX, jetSize, sliceSpread } from '../jet/jet'
import type { Jet } from '../jet/jet'
import { FACES } from '../jet/mesh'
import type { JetMesh } from '../jet/mesh'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import type { Frame } from './frame'
import type { ShipPaint } from './paint'
import { cockpitIn, liftScale } from './view'

/** smooth flames: the most there can be in a frame (one an engine), and how many numbers are kept for each (see SceneState.flames) */
export const FLAME_MAX = 128
export const FLAME_F = 19
const FLAME_GROW = 1.3

/** a ship as drawJet needs it: the jet itself, its shape and its colours, and how its engines are burning */
export interface Craft {
  jet: Jet
  mesh: JetMesh
  paint: ShipPaint
  /** how long its flames are, in its own pixels (before they flicker) */
  flameLen: number
  /** 0..1: the afterburner lit, and the thrusters open */
  burn: number
  boost: number
  /** how far its flames bend round a turn, and arch over a climb */
  bend: number
  arch: number
  /** 0..1: how solid it is drawn (the leader fades away as the camera moves into it) */
  fade: number
  /** seconds into its intro: its slices fall into place one after another (anything over 2: long since) */
  intro: number
  /** a number of its own, so that its flames flicker out of step with the others' */
  seed: number
  /** the colour of its outline (0: the usual dark one): it flashes when the ship is hit, and shimmers while it is protected */
  outline: number
}

/** the most samples a voxel gets along each of its sides */
const NS_MAX = 8
/** where each table of sample offsets starts: n × n samples are at NS_AT[n] */
const NS_AT = new Int32Array(NS_MAX + 2)
for (let n = 1; n <= NS_MAX; n++) NS_AT[n + 1] = NS_AT[n] + n * n

// scratch, reused for every jet: where a voxel's samples fall, measured at the jet's centre, for each number of samples a side
const offX = new Float32Array(NS_AT[NS_MAX + 1])
const offY = new Float32Array(NS_AT[NS_MAX + 1])
// (64: no ship has more slices than that)
const sliceOrder = new Int32Array(64)
/** the colours each way a voxel faces takes, under this jet's light (mesh.ts FACE_*): one of the paint's shades each */
const facePal: Uint32Array[] = []
const sliceKey = new Float64Array(64)
const flameV = [0, 0, 0]

/** how the jet being drawn is projected, filled in once a jet for drawSlice; and the box round all of it drawn so far, for its outline */
const pen = {
  rU: 0,
  rV: 0,
  rW: 0,
  fU: 0,
  fV: 0,
  fW: 0,
  q: 0,
  S: 0,
  tn: 0,
  vCx: 0,
  vCy: 0,
  m0: 0,
  vox: 0,
  /** one slice up, on the screen, at the jet's centre, and its length */
  uX: 0,
  uY: 0,
  uLen: 0,
  /** half the box on the screen a voxel's whole cube covers, at the jet's centre */
  boxX: 0,
  boxY: 0,
  /** the number of the ship being drawn, for its own depth test (Frame.jetStamp) */
  st: 0,
  fading: false,
  x0: 0,
  y0: 0,
  x1: 0,
  y1: 0,
}

/**
 * How many samples a side a voxel drawn `big` px across needs so that a turned slice has no
 * pin-holes. Samples no more than 0.7 px apart, whichever way the slice is turned, leave no
 * pixel without one in it (a lattice that fine has no gap a pixel's centre can sit in); so
 * a voxel smaller than that needs only one.
 */
const samplesFor = (big: number) => (big < 0.7 ? 1 : Math.min(NS_MAX, Math.ceil(big / 0.7)))

/**
 * One slice of the jet being drawn: each voxel projected, and drawn with several samples (more
 * the larger it is drawn, each voxel by its own size) so that a turned slice has no pin-holes.
 * (A function of its own, so that what it works with stays in registers rather than in the
 * closures drawJet makes.)
 */
function drawSlice(
  f: Frame,
  A: Float32Array,
  B: Float32Array,
  C: Uint8Array,
  F: Uint8Array,
  bU: number,
  bV: number,
  bW: number,
  drop: number,
  lidUp: boolean,
) {
  const { rU, rV, rW, fU, fV, fW, q, S, tn, vCx, vCy, m0, vox, fading, uLen, st, boxX, boxY } = pen
  const { w: W, h: H, fb: _fb, zbuf: _zb, mask: _mk, backdrop: _bg, jetZ: _jd, jetStamp: _js } = f
  let { x0, y0, x1, y1 } = pen
  const cnt = C.length
  for (let v = 0; v < cnt; v++) {
    const a = A[v]
    const b = B[v]
    if (lidUp && (C[v] - 1) >> 4 === 2) continue
    const V = bV + a * rV + b * fV
    const den = 1 + q * V
    if (den < 0.2) continue
    const m = S / den
    const col = facePal[F[v]][C[v]]
    const px = vCx + m * (bU + a * rU + b * fU)
    const py = vCy - m * (bW + a * rW + b * fW + tn * V) + drop
    const k = m / m0
    // slices drawn more than a pixel apart (from behind, from the seat, close to): the voxel as the box on the screen its
    // whole cube covers, its sides too, so the slices meet; the depth test keeps the nearest
    if (uLen * k > 1.05) {
      const ex = boxX * k
      const ey = boxY * k
      const xa = Math.max(0, Math.round(px - ex))
      const xb = Math.min(W, Math.round(px + ex))
      const ya = Math.max(0, Math.round(py - ey))
      const yb = Math.min(H, Math.round(py + ey))
      for (let yy = ya; yy < yb; yy++) {
        let at = yy * W + xa
        for (let x = xa; x < xb; x++, at++) {
          if (_zb[at] < V - 1) continue // a hill or a cloud is in front
          if (_js[at] === st && _jd[at] < V) continue // a nearer part of the ship is
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
          _js[at] = st
          _jd[at] = V
        }
      }
      if (xb > xa && yb > ya) {
        if (xa < x0) x0 = xa
        if (xb - 1 > x1) x1 = xb - 1
        if (ya < y0) y0 = ya
        if (yb - 1 > y1) y1 = yb - 1
      }
      continue
    }
    // this voxel's samples: as many as its own size wants
    const ns = samplesFor(vox / den)
    const s0 = NS_AT[ns]
    const nOff = s0 + ns * ns
    // the last sample, which the outline's box is grown by …
    let x = Math.round(px + offX[nOff - 1] * k)
    let yy = Math.round(py + offY[nOff - 1] * k)
    // … and with the other corners, the box round them all (each sample is rounded from a point
    // that moves steadily across the voxel): a voxel wholly off the frame needs none of them
    let from = s0
    if (ns === 1) {
      if (x >= 0 && yy >= 0 && x < W && yy < H) {
        const at = yy * W + x
        if (_zb[at] >= V - 1 && (_js[at] !== st || _jd[at] >= V)) {
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
          _js[at] = st
          _jd[at] = V
        }
      }
      from = nOff
    } else if (ns > 2) {
      const xa = Math.round(px + offX[s0] * k)
      const ya = Math.round(py + offY[s0] * k)
      const xb = Math.round(px + offX[s0 + ns - 1] * k)
      const yb = Math.round(py + offY[s0 + ns - 1] * k)
      const xc = Math.round(px + offX[nOff - ns] * k)
      const yc = Math.round(py + offY[nOff - ns] * k)
      const lx = Math.min(xa, xb, xc, x)
      const hx = Math.max(xa, xb, xc, x)
      const ly = Math.min(ya, yb, yc, yy)
      const hy = Math.max(ya, yb, yc, yy)
      if (hx < 0 || lx >= W || hy < 0 || ly >= H) {
        from = nOff // wholly off the frame
      } else if (lx === hx && ly === hy) {
        // every sample lands on the one pixel
        const at = ly * W + lx
        if (_zb[at] >= V - 1 && (_js[at] !== st || _jd[at] >= V)) {
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
          _js[at] = st
          _jd[at] = V
        }
        from = nOff
      } else if (lx >= 0 && ly >= 0 && hx < W && hy < H) {
        // wholly inside the frame: no sample needs to be checked against its edges
        let last = -1
        for (let o = s0; o < nOff; o++) {
          const at = Math.round(py + offY[o] * k) * W + Math.round(px + offX[o] * k)
          if (at === last) continue
          last = at
          if (_zb[at] < V - 1) continue
          if (_js[at] === st && _jd[at] < V) continue
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
          _js[at] = st
          _jd[at] = V
        }
        from = nOff
      }
    }
    let last = -1
    for (let o = from; o < nOff; o++) {
      x = Math.round(px + offX[o] * k)
      yy = Math.round(py + offY[o] * k)
      if (x < 0 || yy < 0 || x >= W || yy >= H) continue
      const at = yy * W + x
      // (a voxel drawn large has several samples to a pixel: the one before may have done this one already)
      if (at === last) continue
      last = at
      if (_zb[at] < V - 1) continue // a hill or a cloud is in front
      if (_js[at] === st && _jd[at] < V) continue // a nearer part of the ship is
      if (fading && _mk[at] === 0) _bg[at] = _fb[at]
      _fb[at] = col
      _mk[at] = 1
      _js[at] = st
      _jd[at] = V
    }
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (yy < y0) y0 = yy
    if (yy > y1) y1 = yy
  }
  pen.x0 = x0
  pen.y0 = y0
  pen.x1 = x1
  pen.y1 = y1
}

export function drawJet(scene: SceneState, f: Frame, craft: Craft) {
  const { params: p, view, pal, time } = scene
  const { jet: j, mesh, paint, burn, boost, bend, fade, seed } = craft
  // (overhead the slices are drawn closer: a ship seen from above keeps its look from above, a little of its sides
  // showing, as the sprite stacks always did; from behind and from the seat it stands its full height. Each slice is
  // so far over its belly, which stays where it is: a landed ship stands on the ground in every view)
  const spreadNow = sliceSpread(scene.spread, view.chase + view.cockpit)
  const { h: JET_H, l: JET_L, pivotK: PIV_K, pivotY: PIV_Y, engines } = mesh.model
  const flamePal = paint.flame
  const flameData = scene.flames.data
  const { w: W, h: H, fb, zbuf, mask: jetMask, backdrop } = f
  const { cx: vCx, cy: vCy } = view
  if (j.away) return
  const lidUp = !j.glass || j.lid > 0 // the canopy is off or open: its glass is not in its usual place
  const c = view.cos
  const s = view.sin
  const q = view.q
  // (overhead, a ship far below is drawn smaller: see view.ts)
  const S = view.scale * liftScale(view, j.z)
  const tn = view.tan
  const ax = axes(j)
  const sc = jetSize(p)
  // the jet's own axes in view space, per voxel: across the screen (U), into it (V), up (W)
  const rU = (ax.rx * c - ax.ry * s) * sc
  let rV = -(ax.rx * s + ax.ry * c) * sc
  let rW = ax.rz * sc
  const fU = (ax.fx * c - ax.fy * s) * sc
  let fV = -(ax.fx * s + ax.fy * c) * sc
  let fW = ax.fz * sc
  const uU = (ax.ux * c - ax.uy * s) * sc
  let uV = -(ax.ux * s + ax.uy * c) * sc
  let uW = ax.uz * sc
  const dx = j.x - view.x
  const dy = j.y - view.y
  const cU = dx * c - dy * s
  let cV = -(dx * s + dy * c)
  let cW = j.z - view.alt
  if (view.sp !== 0) {
    // (the camera pitched, in space: into the view and up, turned about its own wing, for each of the jet's axes and its middle)
    const cp = view.cp
    const sp = view.sp
    let v = rV * cp + rW * sp
    rW = rW * cp - rV * sp
    rV = v
    v = fV * cp + fW * sp
    fW = fW * cp - fV * sp
    fV = v
    v = uV * cp + uW * sp
    uW = uW * cp - uV * sp
    uV = v
    v = cV * cp + cW * sp
    cW = cW * cp - cV * sp
    cV = v
  }
  if (fade < 0.004) return
  const fading = fade < 1
  const _bg = backdrop
  const den0 = 1 + q * cV
  if (den0 < 0.2) return
  const m0 = S / den0
  const cx = vCx + m0 * cU
  const cy = vCy - m0 * (cW + tn * cV)
  const far = JET_L * sc * m0 + 40
  if (cx < -far || cy < -far - H || cx > W + far || cy > H + far) return
  // screen steps for one voxel along the wing and along the fuselage, at the jet's centre
  const prx = m0 * rU
  const pry = -m0 * (rW + tn * rV)
  const pfx = m0 * fU
  const pfy = -m0 * (fW + tn * fV)
  const _fb = fb
  const _mk = jetMask
  const _zb = zbuf
  // the light: from over the viewer's left shoulder, as a sprite is lit (from the screen's upper left, a little towards
  // the viewer), whichever way the camera looks, so a ship's form reads the same in every view: from behind its back is
  // lit, its far flank in shade (the world's sun is the ground's and the clouds')
  const lx = -0.55 * c + 0.45 * s
  const ly = 0.55 * s + 0.45 * c
  const lz = 1.0
  const ll = Math.sqrt(lx * lx + ly * ly + lz * lz)
  const night = p.timeOfDay === 'night'
  const litAt = night ? 0.74 : 0.9
  const dimAt = night ? 0.32 : 0.55
  // each way a voxel faces, lit by how squarely it faces the sun: its top (its left and right halves turned a little
  // either way, a bevel), its flanks, back, front and belly; turned well away, two tones down
  const lit = (nx: number, ny: number, nz2: number) => {
    const b = (nx * lx + ny * ly + nz2 * lz) / (ll * Math.sqrt(nx * nx + ny * ny + nz2 * nz2))
    return b > litAt ? paint.jetLit : b > dimAt ? paint.jet : b > shadeAt ? paint.jetDim : paint.jetDeep
  }
  const shadeAt = night ? 0.05 : 0.18
  facePal.length = FACES
  facePal[0] = lit(ax.ux - 0.4 * ax.rx, ax.uy - 0.4 * ax.ry, ax.uz - 0.4 * ax.rz)
  facePal[1] = lit(ax.ux + 0.4 * ax.rx, ax.uy + 0.4 * ax.ry, ax.uz + 0.4 * ax.rz)
  facePal[2] = lit(-ax.rx + 0.3 * ax.ux, -ax.ry + 0.3 * ax.uy, -ax.rz + 0.3 * ax.uz)
  facePal[3] = lit(ax.rx + 0.3 * ax.ux, ax.ry + 0.3 * ax.uy, ax.rz + 0.3 * ax.uz)
  facePal[4] = lit(-ax.fx + 0.3 * ax.ux, -ax.fy + 0.3 * ax.uy, -ax.fz + 0.3 * ax.uz)
  facePal[5] = lit(ax.fx + 0.3 * ax.ux, ax.fy + 0.3 * ax.uy, ax.fz + 0.3 * ax.uz)
  facePal[6] = lit(-ax.ux, -ax.uy, -ax.uz)
  pen.x0 = W
  pen.y0 = H
  pen.x1 = -1
  pen.y1 = -1
  // several samples per voxel, more the larger it is drawn, so a turned slice has no pin-holes:
  // where they fall for each number of them a side (each voxel picks its own, by its size)
  for (let ns = 1; ns <= NS_MAX; ns++) {
    const s0 = NS_AT[ns]
    for (let i = 0; i < ns; i++) {
      for (let k = 0; k < ns; k++) {
        const oi = (i + 0.5) / ns - 0.5
        const ok = (k + 0.5) / ns - 0.5
        offX[s0 + i * ns + k] = oi * prx + ok * pfx
        offY[s0 + i * ns + k] = oi * pry + ok * pfy
      }
    }
  }
  const vox = sc * S
  // one slice up, on the screen (at the jet's centre)
  const uX = m0 * uU * spreadNow
  const uY = -m0 * (uW + tn * uV) * spreadNow
  const uLen = Math.sqrt(uX * uX + uY * uY)
  // (a number of its own for the depth test; numbers run for weeks before they wrap, and the frame forgets them then)
  let st = pen.st + 1
  if (st > 0x7ffffff0) {
    f.jetStamp.fill(0)
    st = 1
  }
  const boxX = 0.5 * (Math.abs(prx) + Math.abs(pfx) + Math.abs(uX))
  const boxY = 0.5 * (Math.abs(pry) + Math.abs(pfy) + Math.abs(uY))
  Object.assign(pen, { rU, rV, rW, fU, fV, fW, q, S, tn, vCx, vCy, m0, vox, fading, uX, uY, uLen, st, boxX, boxY })
  const _jd = f.jetZ
  const _js = f.jetStamp
  // slices are drawn from the one farthest from eye level to the nearest, so nearer ones cover
  let eye: number
  if (q < 1e-6) eye = tn * uW - uV >= 0 ? 1e9 : -1e9
  else eye = (-cU * uU + (-1 / q - cV) * uV + (tn / q - cW) * uW) / (sc * sc)
  for (let y = 0; y < JET_H; y++) {
    sliceOrder[y] = y
    sliceKey[y] = Math.abs(y * spreadNow - PIV_Y - eye)
  }
  for (let i = 1; i < JET_H; i++) {
    const y = sliceOrder[i]
    const key = sliceKey[y]
    let k = i - 1
    while (k >= 0 && sliceKey[sliceOrder[k]] < key) {
      sliceOrder[k + 1] = sliceOrder[k]
      k--
    }
    sliceOrder[k + 1] = y
  }
  const it = craft.intro
  const flameOn = burn > 0.02 && p.afterburner > 0.01 && spreadNow < 2.6
  const flick = 0.82 + 0.18 * Math.sin(time * 47 + seed * 2) * Math.sin(time * 31)
  // (a flame trailing towards the camera is seen end on: a glow in its nozzle, its length foreshortened to little. Drawn its
  // full length, near the camera its tail hung down the screen under every nozzle: the title's ships read as crabs)
  const endOn = Math.max(0, fV) / (Math.sqrt(fU * fU + fV * fV + fW * fW) || 1)
  const flameLen = craft.flameLen * flick * (1 - 0.6 * endOn)
  const flameWide = 0.95 * (1 + 0.22 * boost)
  const behind = view.chase + view.cockpit > 0.5 // seen from behind, the flames sit in front of the whole tail
  const arch = craft.arch
  // (the flames trail back from the nozzles: towards the camera when the nose points away from it)
  const tailNear = fV > 0
  const smooth = p.flameStyle === 'realistic'
  const dropOf = (y: number) => {
    // the intro: slices fall in from the top one after another and land on the stack
    if (it >= 2) return 0
    const tt = (it - (y - mesh.firstSlice) * 0.07) / 0.36
    if (tt <= 0) return NaN
    return tt < 1 ? -(1 - tt * tt) * ((H >> 1) + 44) : 0
  }
  // afterburner, sliced the same way so it stacks with the jet: a flame from every engine
  const flames = (y: number, bU: number, bV: number, bW: number, drop: number) => {
    if (flameLen <= 0.5) return
    for (const engine of engines) {
      const { a: ea, r: er } = engine
      // (its cross-section within the nozzle: seen from behind, a flame fills its nozzle and no more)
      const dyv = (y + 0.5 - engine.y) / (er * 0.9)
      if (dyv <= -1 || dyv >= 1) continue
      const prof = Math.sqrt(1 - dyv * dyv)
      const e = ea < 0 ? -1 : 1
      // (a flame pointing at the camera is drawn from its tail to the nozzle, so its white-hot core shows through)
      const steps = Math.ceil(flameLen * 2)
      for (let st0 = 0; st0 < steps; st0++) {
        const t = (tailNear ? steps - 1 - st0 : st0) * 0.5
        const u = t / flameLen
        const rad = er * flameWide * Math.pow(1 - u, 0.75) * prof * (0.9 + 0.2 * Math.sin(t * 1.9 - time * 40 + e + ea))
        if (rad < 0.2) continue
        const b = PIV_K - engine.k - t
        // the plume trails round the inside of a turn, and along the arc of a climb or dive
        const curl = (t * t) / flameLen
        const swing = bend * curl
        const lift = arch * curl
        for (let a = -rad; a <= rad; a += 0.5) {
          const aa = ea + a + swing
          const V = bV + aa * rV + b * fV + lift * uV
          const den = 1 + q * V
          if (den < 0.2) continue
          const m = S / den
          const heat = u * 0.9 + (Math.abs(a) / (rad + 0.01)) * 0.55 + Math.abs(dyv) * 0.3 - 0.16 * boost
          const col = flamePal[heat < 0.28 ? 0 : heat < 0.5 ? 1 : heat < 0.75 ? 2 : heat < 1.0 ? 3 : heat < 1.25 ? 4 : 5]
          const fx = Math.round(vCx + m * (bU + aa * rU + b * fU + lift * uU))
          const fy = Math.round(vCy - m * (bW + aa * rW + b * fW + lift * uW + tn * V) + drop)
          const size = Math.max(1, Math.ceil(m * sc * 0.55))
          for (let yy = fy; yy < fy + size; yy++) {
            for (let xx = fx; xx < fx + size; xx++) {
              if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
              const at = yy * W + xx
              if (_zb[at] < V - 1) continue
              if (_js[at] === st && _jd[at] < V - 0.5) continue // the ship's own hull is in front
              if (fading && _mk[at] === 0) _bg[at] = _fb[at]
              _fb[at] = col
              _mk[at] = 2 // flame: never outlined
            }
          }
          if (fx < pen.x0) pen.x0 = fx
          if (fx + size > pen.x1) pen.x1 = fx + size
          if (fy < pen.y0) pen.y0 = fy
          if (fy + size > pen.y1) pen.y1 = fy + size
        }
      }
    }
  }
  // a smooth flame is only measured here: where its nozzle, a point straight behind it and its
  // tip (which swings out in a turn) fall in the frame, and how much of it the world hides
  const smoothFlames = () => {
    // (the fire flickers by itself, so its length is held much steadier than the pixel flames')
    const L = craft.flameLen * (0.94 + 0.3 * (flick - 0.82)) * FLAME_GROW
    const show = fade * (1 - cockpitIn(view))
    if (L <= 0.6 || show < 0.01) return
    // the colour the body of the flame burns, as the pixel flames have it
    const hue = flamePal[2]
    for (let e = 0; e < engines.length && e < ENGINES_MAX; e++) {
      if (scene.flames.count >= FLAME_MAX) return
      const engine = engines[e]
      const wide = engine.r * (1 + 0.12 * boost) * 1.5
      const hgt = (engine.y - 0.5) * spreadNow - PIV_Y
      const bU = cU + hgt * uU
      const bV = cV + hgt * uV
      const bW = cW + hgt * uW
      const o = scene.flames.count * FLAME_F
      let inView = true
      let mA = 0
      let mC = 0
      for (let n = 0; n < 3; n++) {
        const curl = n === 2 ? L : 0
        const aa = engine.a + bend * curl
        const b = PIV_K - engine.k - n * 0.5 * L
        const lift = arch * curl
        const V = bV + aa * rV + b * fV + lift * uV
        const den = 1 + q * V
        if (den < 0.2) {
          inView = false
          break
        }
        const m = S / den
        flameData[o + n * 2] = vCx + m * (bU + aa * rU + b * fU + lift * uU)
        flameData[o + n * 2 + 1] = vCy - m * (bW + aa * rW + b * fW + lift * uW + tn * V)
        flameV[n] = V
        if (n === 0) mA = m
        else if (n === 2) mC = m
      }
      if (!inView) continue
      const rad = wide * sc * mA
      for (let n = 0; n < 3; n++) {
        const mid = n === 1
        const px = mid ? 0.25 * flameData[o] + 0.5 * flameData[o + 2] + 0.25 * flameData[o + 4] : flameData[o + n * 2]
        const py = mid ? 0.25 * flameData[o + 1] + 0.5 * flameData[o + 3] + 0.25 * flameData[o + 5] : flameData[o + n * 2 + 1]
        const V = mid ? 0.25 * flameV[0] + 0.5 * flameV[1] + 0.25 * flameV[2] : flameV[n]
        let open = 0
        for (let k = 0; k < 5; k++) {
          const xx = Math.round(px + (k === 1 ? -rad : k === 2 ? rad : 0))
          const yy = Math.round(py + (k === 3 ? -rad : k === 4 ? rad : 0))
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || _zb[yy * W + xx] >= V - 1) open++
        }
        // eased, so a flame slips behind a cloud rather than blinking out
        const at = e * 3 + n
        j.flameSeen[at] += (open / 5 - j.flameSeen[at]) * 0.3
        flameData[o + 10 + n] = j.flameSeen[at]
      }
      flameData[o + 6] = rad
      flameData[o + 7] = mC / mA
      flameData[o + 8] = boost
      flameData[o + 9] = show
      flameData[o + 13] = seed * ENGINES_MAX + e
      flameData[o + 14] = clamp(p.afterburner, 0, 1)
      flameData[o + 15] = L / wide
      flameData[o + 16] = (hue & 255) / 255
      flameData[o + 17] = ((hue >> 8) & 255) / 255
      flameData[o + 18] = ((hue >> 16) & 255) / 255
      scene.flames.count++
    }
  }
  for (let n = 0; n < JET_H; n++) {
    const y = sliceOrder[n]
    const cnt = mesh.sliceC[y].length
    if (cnt === 0) continue
    const drop = dropOf(y)
    if (drop !== drop) continue
    const hgt = y * spreadNow - PIV_Y
    const bU = cU + hgt * uU
    const bV = cV + hgt * uV
    const bW = cW + hgt * uW
    drawSlice(f, mesh.sliceA[y], mesh.sliceB[y], mesh.sliceC[y], mesh.sliceF[y], bU, bV, bW, drop, lidUp)
    if (flameOn && !smooth && !behind) flames(y, bU, bV, bW, drop)
  }
  if (flameOn && smooth) smoothFlames()
  if (flameOn && !smooth && behind) {
    for (let y = 0; y < JET_H; y++) {
      const drop = dropOf(y)
      if (drop !== drop) continue
      const hgt = y * spreadNow - PIV_Y
      flames(y, cU + hgt * uU, cV + hgt * uV, cW + hgt * uW, drop)
    }
  }
  // the canopy standing open: its glass, swung up about its back edge
  if (j.glass && j.lid > 0) {
    const th = j.lid * 0.95
    const ct = Math.cos(th)
    const st = Math.sin(th)
    for (let y = mesh.lidY0; y < JET_H; y++) {
      const A = mesh.sliceA[y]
      const B = mesh.sliceB[y]
      const C = mesh.sliceC[y]
      for (let v = 0; v < C.length; v++) {
        if ((C[v] - 1) >> 4 !== 2) continue
        const db = B[v] - mesh.lidB0
        const dh = y - mesh.lidY0
        const a = A[v]
        const b = mesh.lidB0 + db * ct - dh * st
        const hgt = (mesh.lidY0 + db * st + dh * ct) * spreadNow - PIV_Y
        const V = cV + hgt * uV + a * rV + b * fV
        const den = 1 + q * V
        if (den < 0.2) continue
        const m = S / den
        const col = facePal[mesh.sliceF[y][v]][C[v]]
        const px = vCx + m * (cU + hgt * uU + a * rU + b * fU)
        const py = vCy - m * (cW + hgt * uW + a * rW + b * fW + tn * V)
        const k = m / m0
        const ns = samplesFor(vox / den)
        const nOff = NS_AT[ns] + ns * ns
        let x = 0
        let yy = 0
        let last = -1
        for (let o = NS_AT[ns]; o < nOff; o++) {
          x = Math.round(px + offX[o] * k)
          yy = Math.round(py + offY[o] * k)
          if (x < 0 || yy < 0 || x >= W || yy >= H) continue
          const at = yy * W + x
          if (at === last) continue
          last = at
          if (_zb[at] < V - 1) continue
          if (_js[at] === st && _jd[at] < V) continue
          if (fading && _mk[at] === 0) _bg[at] = _fb[at]
          _fb[at] = col
          _mk[at] = 1
          _js[at] = st
          _jd[at] = V
        }
        if (x < pen.x0) pen.x0 = x
        if (x > pen.x1) pen.x1 = x
        if (yy < pen.y0) pen.y0 = yy
        if (yy > pen.y1) pen.y1 = yy
      }
    }
  }
  // a dark 1 px outline around the whole stack, so it reads over any ground
  const outline = craft.outline || pal.outline
  const x0 = Math.max(1, pen.x0 - 4)
  const y0 = Math.max(1, pen.y0 - 4)
  const x1 = Math.min(W - 2, pen.x1 + 4)
  const y1 = Math.min(H - 2, pen.y1 + 4)
  for (let yy = y0; yy <= y1; yy++) {
    let o = yy * W + x0
    for (let x = x0; x <= x1; x++, o++) {
      if (fading) {
        // let what was behind show through
        if (_mk[o] !== 0) {
          const bg = _bg[o]
          const fg = _fb[o]
          const k = (fade * 256) | 0
          const r = ((bg & 255) * (256 - k) + (fg & 255) * k) >> 8
          const g = (((bg >> 8) & 255) * (256 - k) + ((fg >> 8) & 255) * k) >> 8
          const b = (((bg >> 16) & 255) * (256 - k) + ((fg >> 16) & 255) * k) >> 8
          _fb[o] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
        }
      } else if (_mk[o] === 0 && ((_mk[o - 1] | _mk[o + 1] | _mk[o - W] | _mk[o + W]) & 1) === 1 && _zb[o] >= cV - 2) {
        _fb[o] = outline
      }
    }
  }
  for (let yy = y0 - 1; yy <= y1 + 1; yy++) _mk.fill(0, yy * W + x0 - 1, yy * W + x1 + 2)
}
