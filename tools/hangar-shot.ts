// The hangar (or the deck) as a page of a given size shows it, from the engine alone: the art pixel the page would
// choose (the size it asks for, pulled in inside, no larger than lets the room be seen whole: Scene.fit), the frame that
// comes to, the pilot walked to a spot, and the picture scaled up to the screen's CSS pixels. Quicker than a browser to
// judge the room's art and framing by; the page's own buttons and help are not on it (tools/hangar.mjs has those).
//
//   npx jiti tools/hangar-shot.ts out.png [width height] [hull] [place] [x y]
//
// e.g. 1366 768 (a laptop), 1920 1080 (a desktop); x y the room px he walks to (by his ship, if not said).

import { createScene, DEFAULT_PARAMS, STEP } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const [out = 'out/hangar.png', cw0 = '1366', ch0 = '768', hull = 'corsair', place = 'hangar', tx0, ty0] = process.argv.slice(2)
const CW = Number(cw0)
const CH = Number(ch0)
const held = (turn: number, climb: number) => ({ turn, climb, boost: 0, fire: false, secondary: false })

const scene = createScene({
  ...DEFAULT_PARAMS,
  side: 'nomarchy',
  look: 'solari.0.0.0.3a4a6a.f2c14e',
  intro: false,
  skirmish: false,
  world: 'w0',
  locals: false,
  hull,
  weapons: 'flak,flak',
  parts: 'scanner,cargo-pod',
  bodyColor: '#2f4a6b',
  accentColor: '#f0580e',
} as never)
// (the page's art pixel: screen.ts layout, and wanted() with the scene's zoom and fit)
const base = Math.min(12, Math.max(2, Math.round(Math.sqrt((CW * CH) / 100000))))
const px = () => {
  const want = Math.max(base, Math.round(base * scene.zoom))
  const fit = scene.fit
  return fit ? Math.max(fit.least ? Math.max(base, Math.round(base * fit.least)) : 1, Math.min(want, Math.floor(CW / fit.w), Math.floor(CH / fit.h))) : want
}
const size = () => {
  const p = px()
  if (scene.width !== Math.ceil(CW / p) || scene.height !== Math.ceil(CH / p)) scene.resize(Math.ceil(CW / p), Math.ceil(CH / p))
}
scene.resize(Math.ceil(CW / base), Math.ceil(CH / base))
scene.setClock(1_800_000_000)
for (let i = 0; i < 30; i++) scene.step(STEP)
if (!scene.goInside(place as never)) throw new Error(`could not go into the ${place}`)
size()
// walked to the spot (by default beside his ship, to its left, facing the camera)
const tx = tx0 ? Number(tx0) : 112
const ty = ty0 ? Number(ty0) : 104
for (let i = 0; i < 900; i++) {
  const it = scene.interior
  const dx = tx - it.x
  const dy = ty - it.y
  const d = Math.hypot(dx, dy)
  scene.setControls(d > 2 ? held(dx / d, -dy / d) : held(0, 0))
  scene.step(STEP)
  size()
  if (d <= 2) break
}
// (turned to the camera)
for (let i = 0; i < 8; i++) {
  scene.setControls(held(0, -0.3))
  scene.step(STEP)
}
scene.setControls(held(0, 0))
for (let i = 0; i < 30; i++) scene.step(STEP)
size()
const p = px()
const bytes = scene.render()
writePNG(out, scene.width * p, scene.height * p, upscale(scene.width, scene.height, bytes, p))
console.log(`${out}: ${scene.width}×${scene.height} art px at ${p} CSS px; he stands at ${scene.interior.x.toFixed(0)},${scene.interior.y.toFixed(0)}`)
