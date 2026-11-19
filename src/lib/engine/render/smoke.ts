// Smoke: soft round puffs that swell, pale and thin out as they hang in the air. Fire is a
// puff too: it burns white-yellow, then orange and red, and goes out as dark smoke.

import { SMOKE_F, SMOKE_N } from '../sim/particles'
import type { SceneState } from '../state'
import type { Frame } from './frame'
import { pr, project } from './view'

// fire, from the hottest to the coolest, then soot
const FLAME = [
  [255, 246, 196],
  [255, 200, 70],
  [246, 120, 30],
  [190, 50, 24],
  [60, 44, 44],
]

export function drawSmoke(scene: SceneState, f: Frame) {
  const { params: p, particles, view } = scene
  const { w: W, h: H, fb, zbuf } = f
  const _fb = fb
  const _zb = zbuf
  const night = p.timeOfDay === 'night' ? 0.55 : 1
  for (let i = 0; i < SMOKE_N; i++) {
    const o = i * SMOKE_F
    const life = particles.smoke[o + 8]
    const kind = particles.smoke[o + 9] // 0 exhaust, 1 white (a rocket's trail, steam), 2 the black smoke of a wreck, 3 fire
    if (life <= 0) continue
    const age = scene.time - particles.smoke[o + 3]
    if (age < 0 || age >= life) continue
    const u = age / life
    // the exhaust shoves it backwards at first; then it just hangs and rises a little
    const push = (1 - Math.exp(-age * 5)) / 5
    if (
      !project(
        view,
        particles.smoke[o] + particles.smoke[o + 5] * push,
        particles.smoke[o + 1] + particles.smoke[o + 6] * push,
        particles.smoke[o + 2] + age * (kind === 2 ? 15 : kind === 1 ? 5 : kind === 3 ? 8 : kind === 4 ? 4 : 2.5),
      )
    )
      continue
    const { x: prX, y: prY, m: prM, v: prV } = pr
    const fire = kind === 3
    const rad = Math.max(0.8, particles.smoke[o + 4] * (fire ? 1 - 0.4 * u : kind === 4 ? 1 + 1.6 * u : 1 + 2.4 * u) * prM)
    if (rad > 60) continue
    const alpha = fire
      ? particles.smoke[o + 7] * (1 - u * u)
      : kind === 4
        ? particles.smoke[o + 7] * (1 - u) * (u < 0.06 ? u / 0.06 : 1) * night
        : particles.smoke[o + 7] * (1 - u) * (1 - u) * (u < 0.08 ? u / 0.08 : 1) * night
    let cr: number
    let cg: number
    let cb: number
    if (fire) {
      const c = FLAME[Math.min(4, (u * 5) | 0)]
      cr = c[0]
      cg = c[1]
      cb = c[2]
    } else if (kind === 4) {
      // dust thrown up by a ship landing: the world's own, paling as it settles
      const d = scene.pal.dust
      cr = d[0] + (230 - d[0]) * u * 0.3
      cg = d[1] + (224 - d[1]) * u * 0.3
      cb = d[2] + (214 - d[2]) * u * 0.3
    } else {
      const shade = kind === 1 ? 238 - 44 * u : kind === 2 ? 16 + 58 * u : 26 + 70 * u
      cr = shade
      cg = shade + 1
      cb = shade + 7
    }
    const x0 = Math.max(0, Math.floor(prX - rad))
    const x1 = Math.min(W - 1, Math.ceil(prX + rad))
    const y0 = Math.max(0, Math.floor(prY - rad))
    const y1 = Math.min(H - 1, Math.ceil(prY + rad))
    const inv = 1 / (rad * rad)
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = ((x - prX) * (x - prX) + (y - prY) * (y - prY)) * inv
        if (d2 > 1) continue
        const at = y * W + x
        if (_zb[at] < prV - 1) continue
        const k = (alpha * (1 - d2 * 0.7) * 256) | 0
        const bg = _fb[at]
        const r = ((bg & 255) * (256 - k) + cr * k) >> 8
        const g = (((bg >> 8) & 255) * (256 - k) + cg * k) >> 8
        const b = (((bg >> 16) & 255) * (256 - k) + cb * k) >> 8
        _fb[at] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
      }
    }
  }
}
