// A world's skies as a pilot climbs through them (the heap clouds and the thin sheets over them: world/sky.ts,
// render/clouds.ts): lifted off its capital's pad (or its first base) and climbing hard, a frame in a view at each of a
// few heights, from the engine alone. Frames at 456 × 256, scaled 2, as <out>/sky-<id>-<view>-<height>.png, and printed.
//
//   npx jiti tools/sky-sheet.ts <out-dir> <view: top|chase|cockpit> <world id> [...]     e.g. chase w0 w8 w49

import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })
const [out = 'out', view = 'chase', ...ids] = process.argv.slice(2)
const VIEWS = ['top', 'chase', 'cockpit']
const HEIGHTS = [70, 160, 260, 420, 800]
for (const id of ids) {
  const sc = createScene(withDefaults({ ...worldSettings(id), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
  sc.setClock(1_800_000_000)
  sc.resize(456, 256)
  const st = stateOf(sc)!
  for (let n = 0; n < 150; n++) {
    sc.setControls(ctl({ land: n > 5 && n < 60 }))
    sc.step(STEP)
  }
  for (let i = 0; i < 3 && st.rig.target !== VIEWS.indexOf(view); i++) {
    sc.act('view')
    sc.step(STEP)
  }
  for (const h of HEIGHTS) {
    // (up at full climb to the height, then held there a moment)
    for (let n = 0; n < 2400 && st.jets[0].z < h - 4; n++) {
      sc.setControls(ctl({ climb: -1 }))
      sc.step(STEP)
    }
    for (let n = 0; n < 40; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    const file = `${out}/sky-${id}-${view}-${h}.png`
    writePNG(file, 912, 512, upscale(456, 256, sc.render(), 2))
    console.log(file, Math.round(st.jets[0].z))
  }
}
