// The white trails off every ship's wingtips: longer and longer-lived the harder it is turning.

import { jetSize, sliceSpread, TRAIL_N } from '../jet/jet'
import type { Jet } from '../jet/jet'
import type { JetMesh } from '../jet/mesh'
import { wingtipAt } from '../sim/flight'
import type { SceneState } from '../state'
import { BAYER } from '../util/color'
import type { Frame } from './frame'
import { pr, project } from './view'

export function drawTrails(scene: SceneState, f: Frame) {
  const { params: p, pal, view, eject } = scene
  const { w: W, h: H, fb, zbuf } = f
  if (!p.trails) return
  const LIFE = 2.6
  const _fb = fb
  const _zb = zbuf
  const all: [Jet, JetMesh][] = [
    ...scene.jets.map((j): [Jet, JetMesh] => [j, scene.mesh]),
    ...(eject.wreck ? [[eject.wreck, scene.mesh] as [Jet, JetMesh]] : []),
    ...scene.ships.map((s): [Jet, JetMesh] => [s.jet, s.mesh]),
  ]
  const sc = jetSize(p)
  const spread = sliceSpread(scene.spread, view.chase + view.cockpit)
  // (each ship's trails in its pilot's colour, if he chose one)
  const own = scene.paint.trail
  for (const [j, mesh] of all) {
    if (j.away) continue
    const mine = scene.jets.includes(j) || j === eject.wreck
    const tone = mine ? own : scene.ships.find((s) => s.jet === j)?.paint.trail
    const trail = tone && tone[0] !== 0 ? tone : pal.trail
    if (j === scene.jets[0] && view.jetFade < 0.5) continue
    const g = j.g
    for (let w = 0; w < 2; w++) {
      const tr = j.trail[w]
      // (from the wingtip as it is now: the newest point was left up to a few px back)
      const tip = wingtipAt(j, mesh, w, sc, spread)
      let has = j.trailLen > 0 && project(view, tip.x, tip.y, tip.z)
      let prevX = pr.x
      let prevY = pr.y
      for (let n = 0; n < j.trailLen; n++) {
        const o = ((j.trailHead - 1 - n + TRAIL_N * 2) % TRAIL_N) * 4
        const age = (scene.time - tr[o + 3]) / (LIFE * (0.3 + 0.7 * g))
        if (age >= 1) break
        if (!project(view, tr[o], tr[o + 1], tr[o + 2])) {
          has = false
          continue
        }
        const sxp = pr.x
        const syp = pr.y
        if (has) {
          // short line from the previous point, thicker when it is close to the camera
          const span = Math.max(Math.abs(sxp - prevX), Math.abs(syp - prevY))
          if (span < 600) {
            const steps = Math.max(1, Math.ceil(span))
            const alpha = age < 0.5 ? 1 : (1 - age) * 2
            const col = age < 0.25 ? trail[0] : age < 0.6 ? trail[1] : trail[2]
            const thick = pr.m > 2.4 ? 2 : 1
            for (let k = 0; k < steps; k++) {
              const x0 = Math.round(prevX + ((sxp - prevX) * k) / steps)
              const y0 = Math.round(prevY + ((syp - prevY) * k) / steps)
              for (let yy = y0; yy < y0 + thick; yy++) {
                for (let xx = x0; xx < x0 + thick; xx++) {
                  if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
                  if (_zb[yy * W + xx] < pr.v - 1) continue // behind a hill or a cloud
                  if (alpha * 16 > BAYER[((yy & 3) << 2) | (xx & 3)]) _fb[yy * W + xx] = col
                }
              }
            }
          }
        }
        prevX = sxp
        prevY = syp
        has = true
      }
    }
  }
}
