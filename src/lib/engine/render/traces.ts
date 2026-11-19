// The marks other pilots left on the world (sim/traces.ts), drawn into it: flags in the ring round
// the capture site's mast, flying their side's banner; wrecks lying where ships fell; grave
// markers; beacons with their light; and, while a pilot stands at the capture site, the ring
// itself marked out on the ground. Ghosts are ships, drawn with the others (renderer.ts). The
// pictures are the image model's (traces/art.ts), drawn at their size, larger only as the view
// draws everything larger (never scaled otherwise).

import { CAPTURE } from '../data/territory'
import { pixelsOf } from '../space/pictures'
import type { Pixels } from '../space/pictures'
import { capturePoint } from '../sim/traces'
import type { Mark } from '../sim/traces'
import { wrapDelta } from '../sim/loop'
import type { SceneState } from '../state'
import { BEACON, FLAG_NOMARCHY, FLAG_DRIFT, GRAVE, WRECK } from '../traces/art'
import { blend, pack } from '../util/color'
import { groundAt } from '../world/world'
import { groundHaze, inHaze } from './world'
import type { Frame } from './frame'
import { drawText, textWidth } from './font'
import { pr, project } from './view'

const RING = pack(240, 228, 180)
const SHADE = pack(14, 16, 24)
const NAME = pack(214, 218, 230)
const LIGHT: Record<string, number> = { nomarchy: pack(255, 214, 90), anarchoi: pack(196, 150, 255) }

/** the haze the mark being drawn stands in: the ground's colour of it, and how far into it (groundHaze) */
const air = { haze: 0, hz: 0 }

/** a picture standing on the ground at (pr.x, pr.y): its foot there, `s` frame pixels a pixel; `wave` sways a flag's banner */
function stand(f: Frame, p: Pixels, s: number, V: number, wave = 0, t = 0, k = 256) {
  const { haze, hz } = air
  const { w: W, h: H, fb, zbuf } = f
  const x0 = Math.round(pr.x - (p.w * s) / 2)
  const y0 = Math.round(pr.y - p.h * s)
  for (let r = 0; r < p.h; r++)
    for (let c = 0; c < p.w; c++) {
      const col = p.px[r * p.w + c]
      if (!col) continue
      // (the banner, off the pole, ripples)
      const dy = wave && c > 1 ? Math.round(Math.sin(t * 6 - c * 0.9) * wave * Math.min(1, c / 4)) : 0
      for (let yy = 0; yy < s; yy++) {
        const y = y0 + (r + dy) * s + yy
        if (y < 0 || y >= H) continue
        for (let xx = 0; xx < s; xx++) {
          const x = x0 + c * s + xx
          if (x < 0 || x >= W) continue
          const at = y * W + x
          if (zbuf[at] < V - 1) continue
          const lit = inHaze(col, haze, hz)
          fb[at] = k >= 256 ? lit : blend(fb[at], lit, k)
        }
      }
    }
}

/** a dark smudge on the ground under something standing there */
function smudge(f: Frame, half: number, V: number) {
  const y = Math.round(pr.y)
  for (let x = Math.round(pr.x - half); x <= Math.round(pr.x + half); x++) {
    if (x < 0 || x >= f.w || y < 0 || y >= f.h) continue
    const at = y * f.w + x
    if (f.zbuf[at] >= V - 1) f.fb[at] = blend(f.fb[at], SHADE, 110)
  }
}

/** projects a point, the short way round the world from the camera */
function onScreen(scene: SceneState, m: { x: number; y: number; z: number }) {
  const v = scene.view
  return project(v, v.x + wrapDelta(m.x - v.x), v.y + wrapDelta(m.y - v.y), m.z)
}

/** projects a mark where it stands: on the ground under it (as the ground is here, whatever its event said) */
const onGround = (scene: SceneState, m: { x: number; y: number }) => onScreen(scene, { x: m.x, y: m.y, z: groundAt(scene.world, m.x, m.y) })

export function drawTraces(scene: SceneState, f: Frame) {
  if (scene.zone.kind !== 'surface') return
  const tr = scene.traces
  const t = scene.time
  // the capture site: its ring marked out on the ground while the pilot is on foot near it
  const site = capturePoint(scene)
  if (site && scene.foot.stage === 2) {
    const w = scene.foot.walker.jet
    if (Math.hypot(wrapDelta(site.x - w.x), wrapDelta(site.y - w.y)) < 160)
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2 + t * 0.2
        const x = site.x + Math.sin(a) * CAPTURE.ring
        const y = site.y - Math.cos(a) * CAPTURE.ring
        if (!onScreen(scene, { x, y, z: groundAt(scene.world, x, y) })) continue
        const px = Math.round(pr.x)
        const py = Math.round(pr.y)
        if (px < 0 || py < 0 || px >= f.w || py >= f.h) continue
        const at = py * f.w + px
        if (f.zbuf[at] >= pr.v - 2) f.fb[at] = blend(f.fb[at], RING, i % 2 ? 90 : 170)
      }
  }
  // far ones first, so near ones stand in front
  const list: { m: Mark; depth: number }[] = []
  for (const m of tr.marks) {
    if (m.kind === 'ghost' || !onGround(scene, m)) continue
    if (pr.x < -40 || pr.x > f.w + 40 || pr.y < -40 || pr.y > f.h + 40) continue
    list.push({ m, depth: pr.v })
  }
  list.sort((a, b) => b.depth - a.depth)
  for (const { m } of list) {
    onGround(scene, m)
    // (far off, gone into the haze as the ground under it is: drawn sharp, a grave stood out of a whiteout or the dusk)
    air.haze = scene.pal.haze
    air.hz = groundHaze(scene.view, pr.v)
    if (air.hz > 0.7) continue
    const s = Math.max(1, Math.round(pr.m))
    const V = pr.v
    if (m.kind === 'flag') {
      smudge(f, 2 * s, V)
      stand(f, pixelsOf(m.side === 'anarchoi' ? FLAG_DRIFT : FLAG_NOMARCHY), s, V, 0.7, t + (m.x % 7))
    } else if (m.kind === 'wreck') {
      // (lying flat: centred where it fell; one stripped by the player is dimmer)
      const p = pixelsOf(WRECK)
      const keep = { x: pr.x, y: pr.y }
      pr.y = keep.y + (p.h * s) / 2
      stand(f, p, s, V, 0, 0, tr.stripped.has(m.id) ? 150 : 256)
      pr.x = keep.x
      pr.y = keep.y
      // a thread of smoke for a day after
      if (scene.loop.clock > 0 && scene.loop.clock + t - m.at < 86_400 && ((t * 8 + m.x) | 0) % 3 === 0) {
        const y = Math.round(pr.y) - 3 - (((t * 10 + m.y) | 0) % 9)
        const x = Math.round(pr.x + Math.sin(t + m.x) * 2)
        if (x >= 0 && y >= 0 && x < f.w && y < f.h) f.fb[y * f.w + x] = blend(f.fb[y * f.w + x], pack(90, 90, 96), 120)
      }
    } else if (m.kind === 'grave') {
      smudge(f, 3 * s, V)
      stand(f, pixelsOf(GRAVE), s, V)
    } else if (m.kind === 'beacon') {
      smudge(f, s, V)
      stand(f, pixelsOf(BEACON), s, V)
      // its light blinks in its side's colour
      const on = ((t * 2 + m.x * 0.01) | 0) % 2 === 0
      const lx = Math.round(pr.x)
      const ly = Math.round(pr.y - BEACON.h * s - 1)
      const col = LIGHT[m.side] ?? RING
      for (let i = 1; i < 30; i++) {
        const yy = ly - i
        if (yy < 0 || lx < 0 || lx >= f.w || yy >= f.h) continue
        const at = yy * f.w + lx
        if (f.zbuf[at] >= V - 1) f.fb[at] = blend(f.fb[at], col, Math.round((on ? 120 : 60) * (1 - i / 30)))
      }
    }
  }
}

/** the names over traces near the pilot: a grave's callsign, a flag's planter (only close by, so the frame stays clear) */
export function traceNames(scene: SceneState, f: Frame, k: number) {
  if (scene.zone.kind !== 'surface') return
  const p = scene.foot.stage !== 0 ? scene.foot.walker.jet : scene.jets[0]
  for (const m of scene.traces.marks) {
    if (m.kind !== 'grave' && m.kind !== 'flag') continue
    if (Math.hypot(wrapDelta(m.x - p.x), wrapDelta(m.y - p.y)) > 50) continue
    if (!onGround(scene, m)) continue
    const s = Math.max(1, Math.round(pr.m))
    const name = m.kind === 'grave' ? `RIP ${m.callsign}` : m.callsign
    const h = m.kind === 'grave' ? GRAVE.h : FLAG_NOMARCHY.h
    const x = Math.round(pr.x - textWidth(name) / 2)
    const y = Math.round(pr.y - h * s - 8)
    drawText(f.fb, f.w, f.h, x, y, name, m.kind === 'flag' ? (LIGHT[m.side] ?? NAME) : NAME, SHADE, k >> 1)
  }
}
