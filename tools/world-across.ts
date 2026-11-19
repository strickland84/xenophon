// Flies straight over a world for a long way and keeps a frame every so many seconds, as a sheet: to see its regions go
// by (engine/world/lands.ts: where one goes over to the next, the light changing as it goes round the world), and how
// long a step takes as new ground is written into the scene's hold of it.
//
//   npx jiti tools/world-across.ts <out.png> [world=w0] [top|chase|cockpit] [seconds=100] [every=10] [heading=0.6] [height=0]
import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { writePNG } from './png.mjs'
const [out, id = 'w0', view = 'top', secs = '100', every = '10', heading = '0.6', alt = '0'] = process.argv.slice(2)
const W = 427
const H = 240
const VIEWS = ['top', 'chase', 'cockpit']
const ctl = (more = {}) => ({ turn: 0, climb: 0, boost: 1, fire: false, secondary: false, land: false, ...more })
const t0 = performance.now()
const sc = createScene(withDefaults({ ...worldSettings(id), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
console.log('built in', (performance.now() - t0).toFixed(0), 'ms; world size', stateOf(sc)!.world.size)
sc.setClock(1_800_001_000)
sc.resize(W, H)
const st = stateOf(sc)!
for (let n = 0; n < 150; n++) { sc.setControls(ctl({ boost: 0, land: n > 5 && n < 60 }) as never); sc.step(STEP) }
for (let i = 0; i < 3 && st.rig.target !== VIEWS.indexOf(view); i++) { sc.act('view'); sc.step(STEP) }
const frames: Uint8ClampedArray[] = []
let worst = 0
const N = Number(secs) * 60
for (let n = 0; n < N; n++) {
  const j = st.jets[0]
  let off = Number(heading) - j.yaw
  off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
  sc.setControls(ctl({ turn: Math.max(-1, Math.min(1, off * 2)) + 1e-4, climb: Number(alt) > 0 && j.z < Number(alt) ? -1 : 0 }) as never)
  const a = performance.now()
  sc.step(STEP)
  worst = Math.max(worst, performance.now() - a)
  if (n % (Number(every) * 60) === Number(every) * 60 - 1) {
    frames.push(sc.render().slice())
    console.log(`${frames.length - 1}: at ${j.x.toFixed(0)}, ${j.y.toFixed(0)} z ${j.z.toFixed(0)} worst step ${worst.toFixed(0)} ms`)
    worst = 0
  }
}
const cols = 5
const rows = Math.ceil(frames.length / cols)
const sheet = new Uint8Array((W + 2) * cols * (H + 2) * rows * 4).fill(40)
frames.forEach((f, i) => {
  const ox = (i % cols) * (W + 2)
  const oy = Math.floor(i / cols) * (H + 2)
  for (let y = 0; y < H; y++) sheet.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * (W + 2) * cols + ox) * 4)
})
writePNG(out, (W + 2) * cols, (H + 2) * rows, sheet)
