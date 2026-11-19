// The islands, drawn from the nearest ground to the farthest, with the shadows of the clouds and the ships on them (the
// clouds themselves are render/clouds.ts's). Every ground pixel
// is a column of stacked layers: its top is drawn where the column ends and its wall where it
// starts, and a pixel that is already taken stays taken (nearer things win).

import { axes, jetSize } from '../jet/jet'
import type { SceneState } from '../state'
import type { Craft } from './jet'
import { clamp } from '../util/math'
import { BAYER, blend, pack } from '../util/color'
import type { Palettes } from './palettes'
import { N, NC, NCM, NCSHIFT, NM, NSHIFT, ZTOP } from '../world/world'
import { deckDrift, skyNow } from './clouds'
import { BUILDING, WINDOW } from '../world/features'

/** a building's wall: px a storey, the glass of its windows by day, and lit at night */
const FLOOR = 5
const DAY_GLASS = pack(46, 60, 82)
const LIT_WINDOW = pack(255, 206, 120)
/** a colour darkened to k parts in 256 */
const darker = (c: number, k: number) => pack(((c & 255) * k) >> 8, (((c >> 8) & 255) * k) >> 8, (((c >> 16) & 255) * k) >> 8)
import type { Frame } from './frame'
import { LIFT_FROM, liftScale } from './view'
import type { View } from './view'

const VIEW_DIST = 1500 // how far the chase view sees
const FOG_START = 300
const FOG_STEPS = 10 // shades of haze between here and the horizon
const AIR_HAZE = 3000 // overhead, the ground takes on a shade of haze for every this many px / FOG_STEPS the camera is above LIFT_FROM …
const AIR_HAZE_MOST = 4 // … up to this many shades
const EPS = 1e-5

/**
 * How far something lying on the ground, `v` px into the view, is gone into the distance's haze, as the ground under it
 * is (0: not at all; 1: gone, the ground ends there): from behind and from the seat. Things drawn over the ground (ore,
 * crates) fade with it, and are not drawn where the ground is not: left as they were, they stood bright in the sky beyond it.
 */
export function groundHaze(view: View, v: number) {
  const A = view.alt
  // (overhead, from high up, the whole ground lies under some haze: as drawWorld's airFog)
  const air = Math.round(clamp(((A - LIFT_FROM) / AIR_HAZE) * FOG_STEPS, 0, AIR_HAZE_MOST) * view.lift) / FOG_STEPS
  if (view.q <= 0) return air
  const far = VIEW_DIST + 3 * A + 2 * Math.max(0, A - LIFT_FROM)
  const from = FOG_START + 2 * A
  return Math.max(air, v <= from ? 0 : v >= far ? 1 : Math.sqrt((v - from) / (far - from)))
}

/** a picture's colour where it stands, `hz` (groundHaze) gone into the haze in the same steps the ground under it is */
export function inHaze(col: number, haze: number, hz: number) {
  const k = Math.round(hz * FOG_STEPS) * (256 / FOG_STEPS)
  return k <= 0 ? col : blend(col, haze, Math.min(256, k))
}

/** the most ships that cast a shadow at once */
const SHADOW_MAX = 48

// scratch, reused every frame: every ship's shadow (where it falls, its axes, its outline and how far it reaches) …
const sjx = new Float64Array(SHADOW_MAX)
const sjy = new Float64Array(SHADOW_MAX)
const srx = new Float64Array(SHADOW_MAX)
const sry = new Float64Array(SHADOW_MAX)
const sfx = new Float64Array(SHADOW_MAX)
const sfy = new Float64Array(SHADOW_MAX)
const sic = new Float64Array(SHADOW_MAX)
const sMask: Uint8Array[] = []
const sW = new Int32Array(SHADOW_MAX)
const sL = new Int32Array(SHADOW_MAX)
const sPK = new Float64Array(SHADOW_MAX)
const sReach = new Float64Array(SHADOW_MAX)
// … the box of ground each shadow can fall on, whatever the height of the ground …
const sxLo = new Float64Array(SHADOW_MAX)
const sxHi = new Float64Array(SHADOW_MAX)
const syLo = new Float64Array(SHADOW_MAX)
const syHi = new Float64Array(SHADOW_MAX)
// … and for the row of ground being drawn, the shadows it crosses and the columns where it does
const rowShadow = new Int32Array(SHADOW_MAX)
const rowFrom = new Int32Array(SHADOW_MAX)
const rowTo = new Int32Array(SHADOW_MAX)

/**
 * The columns (from `lo` to `hi`) where a row of ground, at w0 in its first column and moving
 * `step` a column, is between `min` and `max`: an empty range as lo > hi. Generous by a column
 * either side, so it never leaves out a column the exact test would let in.
 */
function within(w0: number, step: number, min: number, max: number, lo: number, hi: number): [number, number] {
  if (Math.abs(step) < 1e-9) return w0 >= min && w0 <= max ? [lo, hi] : [hi + 1, hi]
  const a = (min - w0) / step
  const b = (max - w0) / step
  return [Math.max(lo, lo + Math.floor(Math.min(a, b)) - 1), Math.min(hi, lo + Math.ceil(Math.max(a, b)) + 1)]
}
// … and the screen row of every height at this depth step and at the step before
const rowNow = new Int32Array(64) // screen row of every height at this depth step
const rowPrev = new Int32Array(64) // … and at the step before

/**
 * A canyon world's gorges as depth (the last pass: from overhead its strata read as stripes, not gorges): the deeper a px
 * lies below the world's plateaus, the darker its rock, top and walls, in dithered steps towards a cool shadow, so the
 * floor of a gorge is dark and its rim lit. For each world, its plateaus' height (the 95th in a hundred of its land);
 * for each palette, its banded colours in each step.
 */
const DEEP_STEPS = 3
const DEEP_SHADOW = pack(26, 20, 38)
const DEEP_K = [0, 70, 125, 175]
const plateauOf = new WeakMap<Uint8Array, number>()
const deepOf = new WeakMap<
  Palettes,
  { lit: Uint32Array; shade: Uint32Array; sideLit: Uint32Array; sideShade: Uint32Array; strataLit: Uint32Array; strataShade: Uint32Array }
>()
function deepColours(pal: Palettes) {
  let d = deepOf.get(pal)
  if (!d) {
    const make = (src: Uint32Array) => {
      const out = new Uint32Array(src.length * (DEEP_STEPS + 1))
      for (let lv = 0; lv <= DEEP_STEPS; lv++)
        for (let i = 0; i < src.length; i++) out[lv * src.length + i] = lv ? blend(src[i], DEEP_SHADOW, DEEP_K[lv]) : src[i]
      return out
    }
    d = {
      lit: make(pal.topLit),
      shade: make(pal.topShade),
      sideLit: make(pal.sideLit),
      sideShade: make(pal.sideShade),
      strataLit: make(pal.strataLit),
      strataShade: make(pal.strataShade),
    }
    deepOf.set(pal, d)
  }
  return d
}
function plateau(height: Uint8Array) {
  let p = plateauOf.get(height)
  if (p === undefined) {
    const count = new Uint32Array(256)
    for (let i = 0; i < height.length; i += 7) count[height[i]]++
    let land = 0
    for (let h = 1; h < 256; h++) land += count[h]
    let seen = 0
    p = 0
    for (let h = 1; h < 256; h++) {
      seen += count[h]
      if (seen >= land * 0.95) {
        p = h
        break
      }
    }
    plateauOf.set(height, p)
  }
  return p
}

export function drawWorld(scene: SceneState, f: Frame, crafts: Craft[]) {
  const { params: p, world, pal, view } = scene
  const { topLit, topShade, sideLit, sideShade, foam: foamCol, sparkA, sparkB } = pal
  const { w: W, h: H, fb, zbuf, colY, colLo, colHi, rowLo, rowHi } = f
  const _fb = fb
  const _zb = zbuf
  if (rowLo === 0 && rowHi === H && colLo === 0 && colHi === W) {
    _fb.fill(0)
    _zb.fill(1e9)
  } else {
    for (let y = rowLo; y < rowHi; y++) {
      _fb.fill(0, y * W + colLo, y * W + colHi)
      _zb.fill(1e9, y * W + colLo, y * W + colHi)
    }
  }
  colY.fill(rowHi)
  const c = view.cos
  const s = view.sin
  const q = view.q
  // (overhead and high up, the ground is drawn smaller: see view.ts)
  const S = view.scale * liftScale(view, 0)
  const tn = view.tan
  const Cx = view.cx
  const Cy = view.cy
  const A = view.alt
  const bx = view.x - Math.floor(view.x / N) * N + N * 2
  const by = view.y - Math.floor(view.y / N) * N + N * 2
  const rankMax = Math.round(clamp(p.clouds, 0, 1) * 16)
  // (the heap clouds' shadows: each falls where the sun throws it from their undersides, high over the ground, the way
  // the ships' fall; the clouds themselves are render/clouds.ts's)
  const sky = skyNow(scene)
  const cloudsOn = rankMax > 0 && sky.step > 0
  const [cdx, cdy] = deckDrift(scene)
  const csx = -pal.sunX * sky.base - cdx + NC * 4
  const csy = -pal.sunY * sky.base - cdy + NC * 4
  // (the glitter moves with the sea: slowly on lava, not at all on ice)
  const flow = pal.flow
  const tW1 = ((scene.time * 6 * flow) | 0) & 1023
  const tW2 = ((scene.time * 4 * flow) | 0) & 1023
  const tF = (scene.time * 36 * flow) | 0
  // cliffs banded in strata, on worlds that have them
  const { banded, strataLit, strataShade } = pal
  const bands = banded.some((b) => b === 1)
  // (and, on the worlds of gorges and tablelands, their gorges as depth)
  const gorges = bands && (scene.planet?.archetype === 'canyon' || scene.planet?.archetype === 'mesa')
  const deep = gorges ? deepColours(pal) : null
  const deepTop = gorges ? plateau(world.height) : 0
  const deepK = deepTop > 4 ? DEEP_STEPS / (deepTop * 0.75) : 0
  const nTop = pal.topLit.length
  const nSide = pal.sideLit.length
  const nStrata = pal.strataLit.length
  // (a building's walls seen from the side: their own colour in storeys, a dark seam between, rows of windows; at night
  // most of them lit. Polish step 9: from behind and the seat they had been one flat grey slab each)
  const night = p.timeOfDay === 'night'
  const glass = night ? LIT_WINDOW : DAY_GLASS
  const sx = pal.sunX
  const sy = pal.sunY
  const isc = 1 / jetSize(p)
  let nShadow = 0
  if (p.shadow && scene.introT > 0.3) {
    for (let i = 0; i < crafts.length && nShadow < SHADOW_MAX; i++) {
      const { jet, mesh } = crafts[i]
      if (jet.away) continue
      const j = nShadow
      sMask[j] = mesh.shadowMask
      sW[j] = mesh.model.w
      sL[j] = mesh.model.l
      sPK[j] = mesh.model.pivotK
      sReach[j] = mesh.model.l * 0.75 * jetSize(p) + 3
      const ax = axes(jet)
      sjx[j] = bx + (jet.x - view.x) + sx * jet.z
      sjy[j] = by + (jet.y - view.y) + sy * jet.z
      const cs = Math.cos(jet.yaw)
      const sn = Math.sin(jet.yaw)
      srx[j] = cs
      sry[j] = sn
      sfx[j] = sn
      sfy[j] = -cs
      sic[j] = 1 / (Math.max(0.3, Math.abs(ax.cr)) * jetSize(p))
      // (the ground position the test below uses is a whole pixel, within one of the row's)
      const reach = sReach[j]
      sxLo[j] = sjx[j] - reach - Math.max(0, sx * ZTOP) - 1
      sxHi[j] = sjx[j] + reach - Math.min(0, sx * ZTOP) + 2
      syLo[j] = sjy[j] - reach - Math.max(0, sy * ZTOP) - 1
      syHi[j] = sjy[j] + reach - Math.min(0, sy * ZTOP) + 2
      nShadow++
    }
  }
  const _h = world.height
  const _m = world.mat
  const _cn = world.clouds
  const _nz = world.noise
  const _cy = colY
  const hzR = pal.haze & 255
  const hzG = (pal.haze >> 8) & 255
  const hzB = (pal.haze >> 16) & 255
  const mixHaze = (col: number, keep: number, fog: number) =>
    ((255 << 24) |
      (((((col >> 16) & 255) * keep + hzB * fog) >> 8) << 16) |
      (((((col >> 8) & 255) * keep + hzG * fog) >> 8) << 8) |
      (((col & 255) * keep + hzR * fog) >> 8)) >>>
    0

  // start where the tallest thing sits on the bottom row; stop when the sea leaves the top
  // of the frame, or at the view distance once there is a horizon
  // (a camera down among the hills and clouds starts right in front of itself instead)
  const below = rowHi - Cy
  const nearest = q > 0 ? -0.85 / q : -1e9
  const camHigh = q > 0 ? A + tn / q : 1e9
  const dn = S * tn + q * below
  let v = camHigh > ZTOP + 1 && dn > 1e-6 ? Math.max(nearest, (S * (A - ZTOP) - below) / dn - 2) : nearest
  // from higher up it sees further, and the haze starts further out (further still above LIFT_FROM)
  const viewDist = VIEW_DIST + 3 * A + 2 * Math.max(0, A - LIFT_FROM)
  const fogStart = FOG_START + 2 * A
  const above = Cy - rowLo + 2
  let vEnd = viewDist
  if (S * tn > q * above) vEnd = Math.min(viewDist, (S * A + above) / (S * tn - q * above))
  let den = 1 + q * v
  let m = S / den
  let R = Cy - m * (tn * v - A) + EPS
  for (let z = 0; z <= ZTOP; z++) rowNow[z] = Math.floor(R - m * z)
  const rowsK = S * (tn + q * A)
  const airFog = (Math.round(clamp(((A - LIFT_FROM) / AIR_HAZE) * FOG_STEPS, 0, AIR_HAZE_MOST) * view.lift) * (256 / FOG_STEPS)) | 0
  for (let guard = 0; v < vEnd && guard < 4000; guard++) {
    // one step deeper: about one screen row of sea, never coarser than a few pixels across
    let dv = (den * den) / rowsK
    const cap = (2.5 * den) / S
    if (dv > cap) dv = cap
    if (dv < 0.5) dv = 0.5
    v += dv
    den = 1 + q * v
    m = S / den
    R = Cy - m * (tn * v - A) + EPS
    for (let z = 0; z <= ZTOP; z++) {
      rowPrev[z] = rowNow[z]
      rowNow[z] = Math.floor(R - m * z)
    }
    const inv = den / S
    const ax = c * inv
    const ay = -s * inv
    let wx = bx - Cx * ax - v * s
    let wy = by - Cx * ay - v * c
    // distance haze: colours step towards the horizon colour, a few shades at a time
    // (and overhead, from high up, the whole ground lies under some haze)
    let fog = airFog
    if (q > 0 && v > fogStart) {
      const f = (v - fogStart) / (viewDist - fogStart)
      fog = Math.max(fog, Math.min(256, ((Math.sqrt(f) * FOG_STEPS + 0.5) | 0) * (256 / FOG_STEPS)) | 0)
    }
    const keep = 256 - fog
    const fine = inv < 1.8
    wx += ax * colLo
    wy += ay * colLo
    // the shadows this row crosses: only they are looked at, and only where they might fall
    let nRow = 0
    for (let j = 0; j < nShadow; j++) {
      const [xa, xb] = within(wx, ax, sxLo[j], sxHi[j], colLo, colHi - 1)
      if (xa > xb) continue
      const [ya, yb] = within(wy, ay, syLo[j], syHi[j], colLo, colHi - 1)
      const from = Math.max(xa, ya)
      const to = Math.min(xb, yb)
      if (from > to) continue
      rowShadow[nRow] = j
      rowFrom[nRow] = from
      rowTo[nRow] = to
      nRow++
    }
    for (let px = colLo; px < colHi; px++, wx += ax, wy += ay) {
      // terrain
      const gx = wx | 0
      const gy = wy | 0
      const idx = ((gy & NM) << NSHIFT) | (gx & NM)
      const h = _h[idx]
      let cY = _cy[px]
      const yT = rowNow[h]
      let yR = rowPrev[h]
      if (yT >= cY && yR >= cY) continue
      const mat = _m[idx]
      // shadows: clouds, then the jets
      let shade = 0
      if (cloudsOn) {
        const sv = _cn[((((gy + csy) | 0) & NCM) << NCSHIFT) | (((gx + csx) | 0) & NCM)]
        if ((sv & 15) > 1 && sv >> 4 < rankMax) shade = 1
      }
      if (shade === 0 && nRow > 0) {
        for (let r = 0; r < nRow; r++) {
          if (px < rowFrom[r] || px > rowTo[r]) continue
          const j = rowShadow[r]
          const dx = gx - sjx[j] + sx * h
          const dy = gy - sjy[j] + sy * h
          const reach = sReach[j]
          if (dx > -reach && dx < reach && dy > -reach && dy < reach) {
            const a = (dx * srx[j] + dy * sry[j]) * sic[j]
            const b = (dx * sfx[j] + dy * sfy[j]) * isc
            const JET_W = sW[j]
            const i = Math.floor(a + JET_W / 2)
            const k = Math.floor(sPK[j] - b + 0.5)
            if (i >= 0 && i < JET_W && k >= 0 && k < sL[j] && sMask[j][k * JET_W + i] === 1) {
              shade = 1
              break
            }
          }
        }
      }
      let top: number
      let side: number
      if (mat < 4) {
        top = shade ? topShade[mat] : topLit[mat]
        if (mat === 3) {
          if (((_nz[((gy & 255) << 8) | (gx & 255)] + tF) & 255) < 120) top = shade ? topShade[2] : foamCol
        } else if (shade === 0 && fine) {
          const n1 = _nz[((gy & 255) << 8) | (((gx + tW1) >> 2) & 255)]
          if (n1 > 243) {
            const n2 = _nz[(((gy + 91) & 255) << 8) | (((gx + 1024 - tW2) >> 2) & 255)]
            if (n2 > 128) top = n1 > 252 ? sparkB : sparkA
          }
        }
        side = top
      } else {
        top = shade ? topShade[mat] : topLit[mat]
        side = shade ? sideShade[mat] : sideLit[mat]
      }
      // (a canyon's gorge: darker the deeper below the plateaus)
      let lv = 0
      if (deep !== null && banded[mat] === 1 && h < deepTop) {
        lv = ((deepTop - h) * deepK + BAYER[((gy & 3) << 2) | (gx & 3)] / 16) | 0
        if (lv > DEEP_STEPS) lv = DEEP_STEPS
        if (lv > 0) {
          top = (shade ? deep.shade : deep.lit)[lv * nTop + mat]
          side = (shade ? deep.sideShade : deep.sideLit)[lv * nSide + mat]
        }
      }
      if (fog > 0) {
        top = mixHaze(top, keep, fog)
        side = mixHaze(side, keep, fog)
      }
      // the wall of this column, where it starts …
      if (yR < cY) {
        if (yR < rowLo) yR = rowLo
        if (bands && banded[mat] === 1) {
          // in bands: the rows of each height in the colour of its stratum
          const sl = lv > 0 && deep !== null ? (shade ? deep.strataShade : deep.strataLit) : shade ? strataShade : strataLit
          const sOff = lv > 0 ? lv * nStrata : 0
          for (let z = 0; z < h; z++) {
            let ya = rowPrev[z + 1]
            let yb = rowPrev[z]
            if (ya < yR) ya = yR
            if (yb > cY) yb = cY
            if (ya >= yb) continue
            let col = sl[sOff + z]
            if (fog > 0) col = mixHaze(col, keep, fog)
            for (let y = ya, o = ya * W + px; y < yb; y++, o += W) {
              if (_fb[o] === 0) {
                _fb[o] = col
                _zb[o] = v
              }
            }
          }
        } else if (mat >= BUILDING && mat <= WINDOW && h > 3) {
          // a building's wall: storeys of FLOOR px, a seam at the foot of each, windows across its middle, a plinth at the bottom
          const along = (gx + gy) & 7
          const pier = along === 0 || along === 7
          const lit = night && ((((gx >> 3) * 7 + (gy >> 3) * 13) ^ 5) & 3) !== 0
          for (let z = 0; z < h; z++) {
            let ya = rowPrev[z + 1]
            let yb = rowPrev[z]
            if (ya < yR) ya = yR
            if (yb > cY) yb = cY
            if (ya >= yb) continue
            const k = z % FLOOR
            let col = side
            if (z < 2) col = darker(side, 150)
            else if (k === 0) col = darker(side, 170)
            else if ((k === 2 || k === 3) && !pier && z < h - 1)
              col = lit ? (shade ? darker(glass, 200) : glass) : darker(DAY_GLASS, shade ? 180 : 255)
            if (fog > 0) col = mixHaze(col, keep, fog)
            for (let y = ya, o = ya * W + px; y < yb; y++, o += W) {
              if (_fb[o] === 0) {
                _fb[o] = col
                _zb[o] = v
              }
            }
          }
        } else {
          for (let y = yR, o = yR * W + px; y < cY; y++, o += W) {
            if (_fb[o] === 0) {
              _fb[o] = side
              _zb[o] = v
            }
          }
        }
        cY = yR
      }
      // … and its top, up to where it ends (unless the camera is below it)
      if (yT < cY) {
        const y0 = yT < rowLo ? rowLo : yT
        for (let y = y0, o = y0 * W + px; y < cY; y++, o += W) {
          if (_fb[o] === 0) {
            _fb[o] = top
            _zb[o] = v
          }
        }
        cY = yT
      }
      _cy[px] = cY
    }
  }
}
