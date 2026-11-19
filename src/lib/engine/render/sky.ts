// Whatever the ground left empty: sky above the horizon, haze below it, and the sun or moon.

import type { SceneState } from '../state'
import { BAYER } from '../util/color'
import { hash8 } from '../util/math'
import type { Frame } from './frame'
import { NSKY } from './palettes'
import { liftScale } from './view'

export function drawSky(scene: SceneState, f: Frame) {
  const { params: p, pal, view } = scene
  const { sun: sunCol, sunGlow, sky: skyPal, haze: hazeCol } = pal
  const { w: W, h: H, fb, colLo, colHi, rowLo, rowHi } = f
  if (view.chase === 0 && view.cockpit === 0) return
  const _fb = fb
  const q = view.q
  // (where the sea meets the sky: drawn at the sea's scale, as world.ts draws it)
  const S = view.scale * liftScale(view, 0)
  const horizon = q > 1e-7 ? view.cy - (S * view.tan) / q : -1e9
  const hz = horizon > H ? H : Math.floor(horizon)
  const focal = q > 1e-7 ? S / q : 1e9
  const tod = p.timeOfDay
  // sun or moon, low over the horizon, opposite the shadows
  if (hz > 0 && tod !== 'day') {
    const sl = Math.sqrt(pal.sunX * pal.sunX + pal.sunY * pal.sunY) || 1
    const dx = -pal.sunX / sl
    const dy = -pal.sunY / sl
    const du = dx * view.cos - dy * view.sin
    const dv = -(dx * view.sin + dy * view.cos)
    if (dv > 0.2) {
      const rad = tod === 'sunset' ? W * 0.05 : W * 0.022
      const cxs = view.cx + (focal * du) / dv
      const cys = horizon - (focal * (tod === 'sunset' ? 0.12 : 0.3)) / dv
      const reach = rad * 1.9
      const xa = Math.max(0, Math.floor(cxs - reach))
      const xb = Math.min(W - 1, Math.ceil(cxs + reach))
      const ya = Math.max(0, Math.floor(cys - reach))
      const yb = Math.min(hz - 1, Math.ceil(cys + reach))
      for (let y = ya; y <= yb; y++) {
        for (let x = xa; x <= xb; x++) {
          const o = y * W + x
          if (_fb[o] !== 0) continue
          const d = Math.sqrt((x - cxs) * (x - cxs) + (y - cys) * (y - cys)) / rad
          if (d < 1) _fb[o] = sunCol
          else if (d < 1.9 && (1.9 - d) * 14 > BAYER[((y & 3) << 2) | (x & 3)]) _fb[o] = sunGlow
        }
      }
    }
  }
  const span = scene.screen.h * 0.75
  const starOff = ((view.yaw * focal) | 0) & 4095
  const stars = tod === 'night' || pal.starsByDay
  for (let y = rowLo; y < rowHi; y++) {
    let o = y * W
    o += colLo
    if (y < hz) {
      const t = ((hz - y) / span) * (NSKY - 1)
      for (let x = colLo; x < colHi; x++, o++) {
        if (_fb[o] !== 0) continue
        let b = t | 0
        const edge = (t - b - 0.7) * 3.4
        if (edge > 0 && edge * 16 > BAYER[((y & 3) << 2) | (x & 3)]) b++
        if (b >= NSKY) b = NSKY - 1
        _fb[o] = stars && b > 1 && hash8(((x + starOff) & 4095) * 73 + y * 9973) < 2 ? sunCol : skyPal[b]
      }
    } else {
      for (let x = colLo; x < colHi; x++, o++) if (_fb[o] === 0) _fb[o] = hazeCol
    }
  }
}
