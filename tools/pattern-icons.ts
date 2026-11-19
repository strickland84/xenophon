// A picture of each paint pattern for the paint booth (the polish pass: the patterns were only words there): a
// Corsair from above as the hangar shows it, painted in the catalogue colours with a high-contrast pattern:
//
//   npx jiti tools/pattern-icons.ts
//
// Writes static/ui/pattern-<name>.png (the plain one is pattern-plain.png), one pixel an art pixel; the page shows
// them larger, pixel for pixel.

import { createScene, DEFAULT_PARAMS, PATTERNS, STEP } from '../src/lib/engine/index'
import { writePNG } from './png.mjs'

const W = 260
const H = 200
for (const pattern of PATTERNS) {
  const scene = createScene({
    ...DEFAULT_PARAMS,
    side: 'nomarchy',
    intro: false,
    skirmish: false,
    world: 'w0',
    locals: false,
    hull: 'corsair',
    pattern,
    bodyColor: '#26384f',
    accentColor: '#547b9b',
    trimColor: '#82e3da',
  } as never)
  scene.resize(W, H)
  for (let i = 0; i < 30; i++) scene.step(STEP)
  scene.goInside('hangar')
  scene.resize(W, H)
  scene.step(STEP)
  const px = scene.render()
  // (the ship stands in the middle of the hangar, which fits the frame: cut it out, the floor round it dark)
  const cw = 72
  const ch = 108
  const x0 = (W >> 1) - (cw >> 1)
  const y0 = (H >> 1) + 4 - (ch >> 1)
  const out = new Uint8Array(cw * ch * 4)
  for (let y = 0; y < ch; y++)
    for (let x = 0; x < cw; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4
      const o = (y * cw + x) * 4
      out.set(px.subarray(i, i + 4), o)
    }
  const file = `static/ui/pattern-${pattern || 'plain'}.png`
  writePNG(file, cw, ch, out)
  console.log(file)
}
