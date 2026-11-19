// A world's skies, drawn (world/sky.ts says what they are; built towards art/mockups/skies.png): its heap clouds high
// over the ground, and the thin sheets over them (cirrus, a mackerel sky, a veil).
//
// From behind and from the seat, and overhead wherever the camera is above them, they are things in the world: the heap
// clouds stacked as the ground is, a step of thickness at a time (flat grey undersides, lit tops, their sides), the sheets
// as flat planes read a row at a time; each pixel drawn only where nothing nearer is (the frame's depth), so a ship flies
// under them, among them and over them, and they hide what is behind them. They go into the distance's haze in dithered
// steps and, far off, are read from smaller copies of their patterns (they never sparkle).
//
// Overhead, what is above the ship would hide it: it is drawn over the picture as a veil instead (drawCloudVeil), every
// other pixel at most, sliding faster than the ground the higher it is. Down with a pilot on foot, or landed, only the
// heap clouds' shadows show (render/world.ts). Every dither is fixed to the cloud, never to the screen, so nothing crawls.

import { DECK_WIND, GLOOM, SHEET_FAR, SHEET_SCALE, SHEET_SLANT, SKY_FAR, SKY_HAZE, VEIL } from '../data/skies'
import { ceilingOf } from '../params'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import { CK, NC, NCM, NCSHIFT } from '../world/world'
import { deckTop, skyOf } from '../world/sky'
import type { Sheet, Sky } from '../world/sky'
import type { Frame } from './frame'
import { grade, SHEET_KINDS } from './palettes'
import { sheetArt, SKY_LEVELS, SKY_N, SKY_SHIFT } from './skyart'
import { liftScale } from './view'

const EPS = 1e-5
/** shades of haze between where it begins and the farthest cloud */
const FOG_STEPS = 8

/** the sky over the scene's world now */
export const skyNow = (scene: SceneState): Sky => skyOf(scene.planet, ceilingOf(scene.params))

/** where the heap clouds' pattern has drifted to (px across and down their map) */
export const deckDrift = (scene: SceneState) => [(scene.time * DECK_WIND.x) % NC, (scene.time * DECK_WIND.y) % NC]

/** the heap clouds' rank the cover lets show (a cell shows when its rank is under it; 0: none) */
const rankOf = (scene: SceneState) => Math.round(clamp(scene.params.clouds, 0, 1) * 16)

// scratch: the screen row of each step of the heap clouds' height, at this step into the view and the one before
const deckNow = new Int32Array(CK + 1)
const deckPrev = new Int32Array(CK + 1)
// … and each column's cell at the step before: how thick it was (a side shared with it is inside the cloud, never seen)
let before = new Uint8Array(512)

/** a colour taken `fog` 256ths of the way to the haze */
function hazed(col: number, haze: number, fog: number) {
  const keep = 256 - fog
  return (
    ((255 << 24) |
      ((((((col >> 16) & 255) * keep + ((haze >> 16) & 255) * fog) >> 8) & 255) << 16) |
      ((((((col >> 8) & 255) * keep + ((haze >> 8) & 255) * fog) >> 8) & 255) << 8) |
      ((((col & 255) * keep + (haze & 255) * fog) >> 8) & 255)) >>>
    0
  )
}

/** 0..256: the haze on a cloud this far into the view, in steps */
function fogAt(v: number, start: number, far: number) {
  if (v <= start) return 0
  const k = Math.sqrt((v - start) / (far - start))
  return Math.min(256, Math.round(k * FOG_STEPS) * (256 / FOG_STEPS))
}

/**
 * How far into the view a flat plane at height `z` meets screen row `y` (with the scale there `S`): NaN where it does not
 * (behind the camera, or edge on).
 */
function depthAt(scene: SceneState, S: number, y: number, z: number) {
  const { view } = scene
  const k = view.cy - y
  const d = k * view.q - S * view.tan
  if (Math.abs(d) < 1e-9) return NaN
  const v = (S * (z - view.alt) - k) / d
  return 1 + view.q * v > 0.12 ? v : NaN
}

/** the screen row of the horizon (−1e9 overhead: none) */
const horizonOf = (scene: SceneState, S: number) => (scene.view.q > 1e-7 ? scene.view.cy - (S * scene.view.tan) / scene.view.q : -1e9)

// a storm's heap clouds' colours, darkened (worked out each frame they are drawn: a few colours)
const dark = { cloudTop: new Uint32Array(CK), cloudSide: new Uint32Array(CK), cloudUnder: 0 }
function gloomy(scene: SceneState, k: number) {
  const { pal } = scene
  const g = grade(GLOOM, scene.params.timeOfDay, 1)
  const light = scene.planet?.light ?? [1, 1, 1]
  const grey = pack(g[0] * light[0], g[1] * light[1], g[2] * light[2])
  const a = Math.round(k * 256)
  for (let i = 0; i < CK; i++) {
    // (tops keep more of their light than the sides and the undersides)
    dark.cloudTop[i] = blend(pal.cloudTop[i], grey, a >> 1)
    dark.cloudSide[i] = blend(pal.cloudSide[i], grey, a)
  }
  dark.cloudUnder = blend(pal.cloudUnder, grey, Math.min(256, a + 40))
  return dark
}

/** the skies that are things in the world: drawn after the ground and before the sky fills what is left */
export function drawClouds(scene: SceneState, f: Frame) {
  const view = scene.view
  if (view.under) return
  const sky = skyNow(scene)
  const flat = view.q < 1e-7
  const A = view.alt
  // (overhead, what is above the camera is the veil's: drawCloudVeil)
  const rank = rankOf(scene)
  if (rank > 0 && sky.step > 0 && (!flat || A >= deckTop(sky))) drawDeck(scene, f, sky, rank)
  for (const sheet of sky.sheets) if (!flat || A > sheet.z) drawSheet(scene, f, sheet)
}

/** the heap clouds: a march into the view, front to back, each cell a stack of its thickness's steps */
function drawDeck(scene: SceneState, f: Frame, sky: Sky, rankMax: number) {
  const { view, pal } = scene
  const { w: W, fb, zbuf, colLo, colHi, rowLo, rowHi } = f
  const clouds = scene.world.clouds
  const { cloudTop, cloudSide, cloudUnder } = sky.gloom > 0 ? gloomy(scene, sky.gloom) : pal
  const haze = pal.haze
  const q = view.q
  const tn = view.tan
  const A = view.alt
  const Cx = view.cx
  const Cy = view.cy
  const c = view.cos
  const s = view.sin
  const z0 = sky.base
  const st = sky.step
  const zTop = z0 + st * CK
  const S = view.scale * liftScale(view, z0)
  // where in the view it can be seen: from its nearest corner on the screen to its farthest (or the horizon)
  let vLo = Infinity
  let vHi = -Infinity
  for (const y of [rowLo, rowHi])
    for (const z of [z0, zTop]) {
      const v = depthAt(scene, S, y, z)
      if (v === v) {
        vLo = Math.min(vLo, v)
        vHi = Math.max(vHi, v)
      }
    }
  const hz = horizonOf(scene, S)
  const far = SKY_FAR + 2 * Math.abs(A - z0)
  if (hz > rowLo && hz < rowHi) vHi = far
  if (vLo > vHi) return
  const nearest = q > 0 ? -0.85 / q : -1e9
  let v = Math.max(nearest, vLo - 2)
  const vEnd = Math.min(far, vHi + 2)
  const fogStart = SKY_HAZE + 2 * Math.abs(A - z0)
  const [dx, dy] = deckDrift(scene)
  let den = 1 + q * v
  let m = S / den
  let R = Cy - m * (tn * v - A) + EPS
  for (let j = 0; j <= CK; j++) deckNow[j] = Math.floor(R - m * (z0 + j * st))
  const rowsK = S * Math.max(Math.abs(tn - q * (z0 - A)), Math.abs(tn - q * (zTop - A)))
  if (before.length < colHi) before = new Uint8Array(colHi)
  before.fill(0)
  // (the step before's: where a cell's heaped top lies)
  let Rp: number
  let mp: number
  for (let guard = 0; v < vEnd && guard < 4000; guard++) {
    // one step deeper: about a screen row of the clouds, never coarser than a few pixels across
    let dv = rowsK > 1e-9 ? (den * den) / rowsK : 1e9
    const cap = (2.5 * den) / S
    if (dv > cap) dv = cap
    if (dv < 0.5) dv = 0.5
    v += dv
    den = 1 + q * v
    Rp = R
    mp = m
    m = S / den
    R = Cy - m * (tn * v - A) + EPS
    for (let j = 0; j <= CK; j++) {
      deckPrev[j] = deckNow[j]
      deckNow[j] = Math.floor(R - m * (z0 + j * st))
    }
    const fog = fogAt(v, fogStart, far)
    if (fog >= 256) break
    const inv = 1 / m
    const ax = c * inv
    const ay = -s * inv
    let wx = view.x + (colLo - Cx) * ax - v * s - dx + NC * 4
    let wy = view.y + (colLo - Cx) * ay - v * c - dy + NC * 4
    for (let px = colLo; px < colHi; px++, wx += ax, wy += ay) {
      const mx = (wx | 0) & NCM
      const my = (wy | 0) & NCM
      const cv = clouds[(my << NCSHIFT) | mx]
      const was = before[px]
      if (cv === 0 || cv >> 4 >= rankMax) {
        before[px] = 0
        continue
      }
      const tk = cv & 15
      before[px] = tk
      // its top, where the camera is above it (the thinnest rim a checker, so the edge is soft), a little lower here and
      // there in clumps of 4 px by up to half a step (heaped, never a flat roof: a storm's tall steps had stood like buildings)
      const zt = z0 + tk * st - (st > 2 ? hash8(((my >> 2) << 8) | (mx >> 2)) % (st >> 1) : 0)
      const topNow = Math.floor(R - m * zt)
      const topPrev = Math.floor(Rp - mp * zt)
      let y0 = topNow
      let y1 = topPrev
      if (y0 < rowLo) y0 = rowLo
      if (y1 > rowHi) y1 = rowHi
      if (y0 < y1 && (tk > 1 || ((mx + my) & 1) === 1)) {
        const col = fog > 0 ? hazed(cloudTop[tk - 1], haze, fog) : cloudTop[tk - 1]
        for (let y = y0, o = y0 * W + px; y < y1; y++, o += W)
          if (v < zbuf[o]) {
            fb[o] = col
            zbuf[o] = v
          }
      }
      // its flat underside, where the camera is below it
      let u0 = deckPrev[0]
      let u1 = deckNow[0]
      if (u0 < rowLo) u0 = rowLo
      if (u1 > rowHi) u1 = rowHi
      if (u0 < u1 && (tk > 1 || ((mx + my) & 1) === 1)) {
        const col = fog > 0 ? hazed(cloudUnder, haze, fog) : cloudUnder
        for (let y = u0, o = u0 * W + px; y < u1; y++, o += W)
          if (v < zbuf[o]) {
            fb[o] = col
            zbuf[o] = v
          }
      }
      // its side facing the camera, a band for each step of its thickness above the cell in front of it (and the top step
      // of that one, which may lie a little lower)
      const inside = was > 1 ? was - 1 : 0
      for (let k = tk - 1; k >= inside; k--) {
        let ya = k === tk - 1 ? topPrev : deckPrev[k + 1]
        let yb = deckPrev[k]
        if (ya < rowLo) ya = rowLo
        if (yb > rowHi) yb = rowHi
        if (ya >= yb) continue
        const col = fog > 0 ? hazed(cloudSide[k], haze, fog) : cloudSide[k]
        for (let y = ya, o = ya * W + px; y < yb; y++, o += W)
          if (v < zbuf[o]) {
            fb[o] = col
            zbuf[o] = v
          }
      }
    }
  }
}

/** a sheet's pattern coordinates for a point of the world: along its wind (drifted) and across it */
function sheetFrame(scene: SceneState, sheet: Sheet) {
  return { ca: Math.cos(sheet.angle), sa: Math.sin(sheet.angle), drift: scene.time * sheet.wind }
}

/** a thin sheet: a flat plane, read a row at a time, where it is in front of what has been drawn */
function drawSheet(scene: SceneState, f: Frame, sheet: Sheet) {
  const { view, pal } = scene
  const { w: W, fb, zbuf, colLo, colHi, rowLo, rowHi } = f
  const tones = pal.sheet
  const t0 = SHEET_KINDS.indexOf(sheet.kind) * 4
  const haze = pal.haze
  const levels = sheetArt(sheet.kind)
  const S = view.scale * liftScale(view, sheet.z)
  const A = view.alt
  const far = SHEET_FAR.px + SHEET_FAR.per * Math.abs(sheet.z - A)
  const fogStart = far / 3
  const big = SHEET_SCALE[sheet.kind]
  const thr = Math.round((1 - sheet.cover) * 255)
  const { ca, sa, drift } = sheetFrame(scene, sheet)
  const c = view.cos
  const s = view.sin
  // (the camera: how far it is behind the point the view is centred on, and its height)
  const flat = view.q < 1e-7
  const back = flat ? 0 : 1 / view.q
  const eye = A + view.tan * back
  for (let y = rowLo; y < rowHi; y++) {
    const v = depthAt(scene, S, y, sheet.z)
    if (!(v === v) || v > far) continue
    const fog = fogAt(v, fogStart, far)
    if (fog >= 256) continue
    // seen at a slant from the camera, less of its pattern shows: it breaks into wisps, then is gone
    const slant = flat ? 1 : Math.abs(sheet.z - eye) / (v + back)
    if (slant <= SHEET_SLANT.none) continue
    const thin = slant >= SHEET_SLANT.full ? 0 : 1 - (slant - SHEET_SLANT.none) / (SHEET_SLANT.full - SHEET_SLANT.none)
    const cut = thr + Math.round((255 - thr) * thin * thin * (3 - 2 * thin))
    const m = S / (1 + view.q * v)
    // (the copy whose pixels are about the screen's size)
    const per = 1 / m
    const texel = per / big
    const lv = texel < 1.5 ? 0 : texel < 3 ? 1 : texel < 6 ? 2 : SKY_LEVELS - 1
    const tex = levels[lv]
    const shift = SKY_SHIFT - lv
    const mask = (SKY_N >> lv) - 1
    const k = 1 / (big << lv)
    // the world under the row's first pixel, and a pixel's step, turned into the pattern's frame and its scale
    const wx = view.x + (colLo - view.cx) * c * per - v * s
    const wy = view.y - (colLo - view.cx) * s * per - v * c
    let u = (wx * ca + wy * sa - drift) * k + SKY_N * 64
    let w = (-wx * sa + wy * ca) * k + SKY_N * 64
    const du = (c * ca - s * sa) * per * k
    const dw = (-c * sa - s * ca) * per * k
    for (let px = colLo, o = y * W + colLo; px < colHi; px++, o++, u += du, w += dw) {
      if (v >= zbuf[o]) continue
      const iu = u | 0
      const iw = w | 0
      const e = tex[((iw & mask) << shift) | (iu & mask)] - cut
      if (e <= 0) continue
      // its thinnest edge a checker fixed to the pattern; then three tones, thin to thick
      if (e < 10 && (lv > 0 || ((iu + iw) & 1) === 0)) continue
      let col = tones[t0 + (e < 10 ? 0 : e < 40 ? 1 : e < 100 ? 2 : 3)]
      if (fog > 0) col = hazed(col, haze, fog)
      fb[o] = col
      zbuf[o] = v
    }
  }
}

// overhead, the veil's slide: how far each layer has slid beyond the ground, kept per scene from frame to frame
const slid = new WeakMap<SceneState, { x: number; y: number; layers: Map<number, [number, number]> }>()

/** how far a layer at height `z` has slid beyond the ground (overhead, it slides faster the higher above the camera it is) */
function slideOf(scene: SceneState, z: number): [number, number] {
  const { view } = scene
  let st = slid.get(scene)
  if (!st) slid.set(scene, (st = { x: view.x, y: view.y, layers: new Map() }))
  let off = st.layers.get(z)
  if (!off) st.layers.set(z, (off = [0, 0]))
  return off
}

/** moves every layer's slide on by how far the camera has moved since the last frame (once a frame) */
function slideOn(scene: SceneState, sky: Sky) {
  const { view } = scene
  let st = slid.get(scene)
  if (!st) slid.set(scene, (st = { x: view.x, y: view.y, layers: new Map() }))
  const mx = view.x - st.x
  const my = view.y - st.y
  st.x = view.x
  st.y = view.y
  // (a jump, arriving or a new world: no slide)
  if (Math.abs(mx) > 300 || Math.abs(my) > 300) return
  const each = (z: number) => {
    const off = slideOf(scene, z)
    const k = Math.min(2, Math.max(0, (z - view.alt) * VEIL.parallax))
    off[0] += mx * k
    off[1] += my * k
  }
  each(sky.base)
  for (const sheet of sky.sheets) each(sheet.z)
}

/**
 * Overhead: what is above the ship, drawn over the picture (and the ships) as a veil, every other pixel at most, so the
 * fight shows through; thicker as the ship nears the heap clouds' undersides; fading as the camera goes behind the ship.
 */
export function drawCloudVeil(scene: SceneState, f: Frame) {
  const { view, pal } = scene
  if (view.under || view.lift <= 0.02) return
  const sky = skyNow(scene)
  slideOn(scene, sky)
  const { w: W, fb, colLo, colHi, rowLo, rowHi } = f
  const A = view.alt
  const c = view.cos
  const s = view.sin
  const rank = rankOf(scene)
  // the heap clouds, when the camera is under their tops
  if (rank > 0 && sky.step > 0 && A < deckTop(sky)) {
    const clouds = scene.world.clouds
    const [dx, dy] = deckDrift(scene)
    const [ox, oy] = slideOf(scene, sky.base)
    // (how much of a cell shows, in sixteenths of a 4 × 4 pattern: up to half, more as the ship nears them)
    const near = clamp(1 - (sky.base - A) / VEIL.near, 0, 1)
    const most = Math.round((6 + 4 * near) * view.lift)
    if (most > 0) {
      const lift = sky.base - A
      for (let y = rowLo; y < rowHi; y++) {
        const V = view.cy - y - lift
        let wx = view.x + ox + (colLo - view.cx) * c - V * s - dx + NC * 4
        let wy = view.y + oy - (colLo - view.cx) * s - V * c - dy + NC * 4
        for (let px = colLo, o = y * W + colLo; px < colHi; px++, o++, wx += c, wy -= s) {
          const mx = (wx | 0) & NCM
          const my = (wy | 0) & NCM
          const cv = clouds[(my << NCSHIFT) | mx]
          if (cv === 0 || cv >> 4 >= rank) continue
          const tk = cv & 15
          if (tk < 2) continue
          // (thicker cells show more of their pattern; the pattern is the cloud's own, so it slides with it)
          const show = Math.min(most, tk * 2 - 1)
          if (BAYER[((my & 3) << 2) | (mx & 3)] >= show) continue
          fb[o] = tk > 4 ? pal.cloudTop[2] : pal.cloudSide[CK - 1]
        }
      }
    }
  }
  // the sheets above the camera, at half their thickness's pixels
  // (a veil's grey would only blur the whole picture from overhead: the weather's murk says it instead)
  for (const sheet of sky.sheets) {
    if (sheet.z <= A || sheet.kind === 'veil') continue
    const tones = pal.sheet
    const t0 = SHEET_KINDS.indexOf(sheet.kind) * 4
    const tex = sheetArt(sheet.kind)[0]
    const thr = Math.round((1 - sheet.cover) * 255)
    const { ca, sa, drift } = sheetFrame(scene, sheet)
    const [ox, oy] = slideOf(scene, sheet.z)
    const most = Math.round(8 * view.lift)
    if (most <= 0) continue
    const lift = sheet.z - A
    const k = 1 / SHEET_SCALE[sheet.kind]
    const du = (c * ca - s * sa) * k
    const dw = (-c * sa - s * ca) * k
    for (let y = rowLo; y < rowHi; y++) {
      const V = view.cy - y - lift
      const wx = view.x + ox + (colLo - view.cx) * c - V * s
      const wy = view.y + oy - (colLo - view.cx) * s - V * c
      let u = (wx * ca + wy * sa - drift) * k + SKY_N * 64
      let w = (-wx * sa + wy * ca) * k + SKY_N * 64
      for (let px = colLo, o = y * W + colLo; px < colHi; px++, o++, u += du, w += dw) {
        const iu = u | 0
        const iw = w | 0
        const e = tex[((iw & (SKY_N - 1)) << SKY_SHIFT) | (iu & (SKY_N - 1))] - thr
        if (e <= 6) continue
        if (BAYER[((iw & 3) << 2) | (iu & 3)] >= Math.min(most, (e >> 3) + 1)) continue
        fb[o] = tones[t0 + (e < 40 ? 1 : e < 100 ? 2 : 3)]
      }
    }
  }
}
