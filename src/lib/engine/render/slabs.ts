// The things built in space and the rocks there, drawn as the game draws everything: a stack of
// horizontal slices (render/jet.ts does a ship so, world.ts the ground). A station's hub, its arms
// and its wings, a gate's ring, a derelict, a rock: each a picture seen from above (the image
// model's: space/art.ts), stacked a few px thick, lying in the plane where ships fly, and drawn
// through whichever view the camera is in. From overhead the slices stand one a pixel above the
// next, as a ship's do; from behind the ship or from the seat each slice is laid out in perspective
// and the stack shows its sides. Every pixel of the frame takes the picture's pixel under it, so
// the art is never scaled: nearer, each of its pixels covers more of the frame, as the ground's do.

import type { Big } from '../space/pictures'
import { blend } from '../util/color'
import type { Frame } from './frame'
import type { View } from './view'

/** how a stack is drawn: its picture (the fourfold copy), where its middle is, how it is turned, how thick it is and how it narrows */
export interface Slab {
  big: Big
  x: number
  y: number
  /** the height of its lowest slice, and how many px tall it is */
  z: number
  tall: number
  /** radians, as a sprite turned on the frame from overhead would be (the world's angle) */
  angle: number
  /** 0: a straight stack; 1: a lump (each slice narrower the further it is from the middle, as a rock) */
  lump: number
  /** 0..256: how dark its lower slices are (its sides in shadow) */
  side: number
  /** 0..256: how dark all of it is (256: as drawn) */
  dim: number
}

/**
 * Draws a stack of slices through the view. Each slice is a horizontal plane: every row of the
 * frame meets it along a straight line, so the picture's place moves evenly along a row (as the
 * ground's does in world.ts). Slices are drawn bottom up, and closer together than a pixel, so the
 * sides are solid from any angle.
 */
export function drawSlab(f: Frame, view: View, s: Slab) {
  const { w: W, fb, zbuf } = f
  const big = s.big
  const bw = big.w
  const bh = big.h
  const px = big.px
  const hw = bw / 8
  const hh = bh / 8
  const half = Math.sqrt(hw * hw + hh * hh) + 1
  const q = view.q
  const S = view.scale
  const tn = view.tan
  const cxs = view.cx
  const cys = view.cy
  const c = view.cos
  const sn = view.sin
  // (the camera's own pitch: in space it looks where the ship points; a slice is still met by each row of the frame along
  // a straight line of one depth across the plane, so it is laid out the same way, by other sums)
  const cp = view.cp
  const sp = view.sp
  // where its middle is, against the view's point: across and into the view
  const dx0 = s.x - view.x
  const dy0 = s.y - view.y
  const v0 = -(dx0 * sn + dy0 * c)
  const u0 = dx0 * c - dy0 * sn
  // (behind the camera, or so far it is less than a pixel: nothing)
  const wm = s.z + s.tall / 2 - view.alt
  const den0 = 1 + q * (v0 * cp + wm * sp)
  if (den0 < 0.2) return
  const m0 = S / den0
  if (half * m0 < 0.35) return
  // its turn, against the view's: a point (u, v) of the slice from its middle is (a, b) of the sprite
  const ta = s.angle + view.yaw
  const ca = Math.cos(ta)
  const sa = Math.sin(ta)
  // how many slices to draw: enough that neighbours are under a pixel apart on the frame
  const steps = Math.max(1, Math.min(48, Math.ceil(s.tall * m0 * (sp !== 0 ? 1 : Math.max(0.35, 1 - tn * 0.5)) + 0.001)))
  for (let k = 0; k < steps; k++) {
    const h = steps === 1 ? 0 : k / (steps - 1)
    const z = s.z + h * s.tall
    // a lump narrows away from its middle slice
    const narrow = s.lump > 0 ? Math.sqrt(Math.max(0.05, 1 - s.lump * (2 * h - 1) * (2 * h - 1))) : 1
    const shade = s.side > 0 ? Math.round(256 - s.side * (1 - h)) : 256
    const k2 = (shade * s.dim) >> 8
    const inv = 1 / narrow
    // the slice's rows on the frame: those its corners reach
    const reach = half * narrow
    let ylo = 1e9
    let yhi = -1e9
    let xlo = 1e9
    let xhi = -1e9
    const wz = z - view.alt
    for (let i = 0; i < 4; i++) {
      const cu = u0 + (i & 1 ? reach : -reach)
      const lv = v0 + (i & 2 ? reach : -reach)
      const cv = lv * cp + wz * sp
      const cw = wz * cp - lv * sp
      const den = 1 + q * cv
      if (den < 0.1) {
        ylo = -1e9
        yhi = 1e9
        xlo = -1e9
        xhi = 1e9
        break
      }
      const m = S / den
      const sx = cxs + m * cu
      const sy = cys - m * (cw + tn * cv)
      if (sx < xlo) xlo = sx
      if (sx > xhi) xhi = sx
      if (sy < ylo) ylo = sy
      if (sy > yhi) yhi = sy
    }
    const ya = Math.max(f.rowLo, Math.floor(ylo))
    const yb = Math.min(f.rowHi - 1, Math.ceil(yhi))
    const xa = Math.max(f.colLo, Math.floor(xlo))
    const xb = Math.min(f.colHi - 1, Math.ceil(xhi))
    if (ya > yb || xa > xb) continue
    const dz = wz
    for (let y = ya; y <= yb; y++) {
      // how far across the plane (level, into the view) this row meets the slice, and its depth from the camera there
      const dyc = y + 0.5 - cys
      const den = q * dyc * cp + S * (tn * cp - sp)
      if (Math.abs(den) < 1e-9) continue
      const v = -(dyc * (1 + q * dz * sp) + S * dz * (cp + tn * sp)) / den
      const vc = v * cp + dz * sp
      const dd = 1 + q * vc
      if (dd < 0.1) continue
      const step = dd / S
      // across, at the row's first pixel, and its step; then into the sprite's own frame
      const ua = (xa + 0.5 - cxs) * step - u0
      const va = v - v0
      let sa0 = (ua * ca - va * sa) * inv
      let sb0 = -(ua * sa + va * ca) * inv
      const sau = step * ca * inv
      const sbu = -step * sa * inv
      let o = y * W + xa
      for (let x = xa; x <= xb; x++, o++, sa0 += sau, sb0 += sbu) {
        const a = (sa0 + hw) * 4
        const b = (sb0 + hh) * 4
        if (a < 0 || b < 0 || a >= bw || b >= bh) continue
        const p = px[(b | 0) * bw + (a | 0)]
        if (p === 0) continue
        if (zbuf[o] < vc - 1) continue
        fb[o] = k2 >= 256 ? p : blend(0xff000000, p, k2)
        zbuf[o] = vc
      }
    }
  }
}
