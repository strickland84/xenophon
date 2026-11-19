// Lays the cockpit over the view, every frame: its two layers (the canopy's frame, then the panel,
// nearer the eyes), each shifted as the pilot's head sways and sliding into place as the camera
// arrives; the live instruments on the panel's screens; and the guns' sight on the glass.

import { blend, pack } from '../../util/color'
import { clamp } from '../../util/math'
import { drawScreens } from './screens'
import type { CockpitArt, CockpitLive } from './types'

// how much each layer shifts as the head moves: both alike, the canopy's struts and the panel they stand on one piece of
// the ship (the panel swayed more, as nearer, and the struts' feet came off it with gaps between: James, 2026-11-18)
const NEAR = { frame: 0.7, panel: 0.7 }
const SIGHT = pack(120, 255, 164)

/** lays a layer over the frame, shifted by (dx, dy): its rows from `top` down (0: see-through) */
function lay(fb: Uint32Array, art: CockpitArt, src: Uint32Array, dx: number, dy: number) {
  const { W, H, aw, ah, pad } = art
  const y0 = Math.max(0, dy - pad)
  const y1 = Math.min(H, ah - pad + dy)
  for (let y = y0; y < y1; y++) {
    let i = (y - dy + pad) * aw + pad - dx
    let o = y * W
    const xa = Math.max(0, dx - pad)
    const xb = Math.min(W, aw - pad + dx)
    i += xa
    o += xa
    for (let x = xa; x < xb; x++, o++, i++) {
      const c = src[i]
      if (c !== 0) fb[o] = c
    }
  }
}

/** lays the cockpit over the frame and draws its live parts; `unit` is the HUD's type size */
export function drawCockpit(fb: Uint32Array, art: CockpitArt, live: CockpitLive, unit: number) {
  const { W, H } = art
  const a = clamp(live.inPlace, 0, 1)
  if (a <= 0) return
  const away = 1 - a
  const s = H / 256
  const hx = live.headX * s
  const hy = live.headY * s
  const sway = (near: number) => ({
    x: -clamp(Math.round(hx * near), -art.pad + 1, art.pad - 1),
    y: -clamp(Math.round(hy * near), -art.pad + 1, art.pad - 1),
  })
  // (the frame comes down from above, the panel up from below)
  const f = sway(NEAR.frame)
  const p = sway(NEAR.panel)
  const fy = f.y - Math.round(away * away * H * 0.7)
  const py = p.y + Math.round(away * away * (H - art.panelTop + 12))

  // the guns' sight, on the glass in front of the eyes: four corners and a cross (under the frame, which is nearer); lit
  // by the ship's power, and not while the weapons are safe
  if (a > 0.8 && live.power >= 1 && !live.safe) {
    const k = Math.round(((a - 0.8) / 0.2) * 150)
    const cx = W >> 1
    const cy = live.pivotY
    const q = Math.max(5, Math.round(8 * s))
    const l = Math.max(2, Math.round(3 * s))
    const dot = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= W || y >= H) return
      const o = y * W + x
      fb[o] = blend(fb[o], SIGHT, k)
    }
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      for (let i = 0; i < l; i++) {
        dot(cx + sx * (q - i), cy + sy * q)
        dot(cx + sx * q, cy + sy * (q - i))
      }
    for (let i = -2; i <= 2; i++) {
      if (i !== 0) dot(cx + i, cy)
      dot(cx, cy + i)
    }
  }

  lay(fb, art, art.frame, f.x, fy)
  lay(fb, art, art.panel, p.x, py)
  drawScreens(fb, W, H, art.screens, p.x, py, live, unit)
}
