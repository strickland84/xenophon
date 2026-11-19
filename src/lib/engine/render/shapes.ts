// Simple shapes drawn straight into a frame. Each is given a depth (V) and is hidden where
// the world is nearer than that, so it sits behind the same hills and clouds as a jet would.

import { BAYER, blend } from '../util/color'
import type { Frame } from './frame'

/** a filled box */
export function box(f: Frame, x0: number, y0: number, x1: number, y1: number, col: number, V: number) {
  const { w: W, h: H, fb, zbuf } = f
  if (x0 < 0) x0 = 0
  if (y0 < 0) y0 = 0
  if (x1 > W) x1 = W
  if (y1 > H) y1 = H
  for (let y = y0; y < y1; y++) {
    let o = y * W + x0
    for (let x = x0; x < x1; x++, o++) if (zbuf[o] >= V - 1) fb[o] = col
  }
}

/** a disc; k is its strength out of 256, and ragged breaks its edge up into pixels */
export function ball(f: Frame, cx: number, cy: number, r: number, col: number, V: number, k: number, ragged: boolean) {
  const { w: W, h: H, fb, zbuf } = f
  if (r < 0.5 || k <= 0) return
  const x0 = Math.max(0, Math.floor(cx - r))
  const x1 = Math.min(W - 1, Math.ceil(cx + r))
  const y0 = Math.max(0, Math.floor(cy - r))
  const y1 = Math.min(H - 1, Math.ceil(cy + r))
  const inv = 1 / (r * r)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d2 = ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * inv
      if (d2 > 1) continue
      const at = y * W + x
      if (zbuf[at] < V - 1) continue
      if (ragged && d2 > 0.6 && BAYER[((y & 3) << 2) | (x & 3)] < (d2 - 0.6) * 40) continue
      fb[at] = k >= 256 ? col : blend(fb[at], col, k)
    }
  }
}

/** a line one pixel wide */
export function thread(f: Frame, xa: number, ya: number, xb: number, yb: number, col: number, V: number, k: number) {
  const { w: W, h: H, fb, zbuf } = f
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(xb - xa), Math.abs(yb - ya))))
  for (let i = 0; i <= n; i++) {
    const x = Math.round(xa + ((xb - xa) * i) / n)
    const y = Math.round(ya + ((yb - ya) * i) / n)
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const at = y * W + x
    if (zbuf[at] >= V - 1) fb[at] = k >= 256 ? col : blend(fb[at], col, k)
  }
}
