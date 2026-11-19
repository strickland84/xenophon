// A world's sky and ground as the art audit takes them (tools/audit.mjs "worlds" and "weather"), from the engine alone and
// quicker than a browser: lifted off its capital's pad (or its first base), climbed a moment, in each view (overhead, from
// behind, from the seat). Frames at 456 × 256, scaled 2, as <out>/world-<id>-<view>.png.
//
//   npx jiti tools/world-places.ts <out-dir> <world id> [...]      e.g. w3 (mesa), w7 (night), w24 (sunset)

import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

// (a turn of almost nothing: the keys then fly the ship, straight on, as a player's do)
const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })
const [out = 'out', ...ids] = process.argv.slice(2)
const VIEWS = ['top', 'chase', 'cockpit']
for (const id of ids) {
  const sc = createScene(withDefaults({ ...worldSettings(id), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
  sc.setClock(1_800_000_000)
  sc.resize(456, 256)
  for (let n = 0; n < 150; n++) {
    sc.setControls(ctl({ land: n > 5 && n < 60 }))
    sc.step(STEP)
  }
  for (let n = 0; n < 72; n++) {
    sc.setControls(ctl({ climb: -1 }))
    sc.step(STEP)
  }
  for (const v of VIEWS) {
    const st = stateOf(sc)!
    for (let i = 0; i < 3 && st.rig.target !== VIEWS.indexOf(v); i++) {
      sc.act('view')
      sc.step(STEP)
    }
    for (let n = 0; n < 108; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    const file = `${out}/world-${id}-${v}.png`
    writePNG(file, 912, 512, upscale(456, 256, sc.render(), 2))
    console.log(file)
  }
}
