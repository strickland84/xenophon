// Times the way down to a world (the dearest ten seconds of the game), frame by frame, in each view, against a fight at
// the same frame size: where along the way the time goes (by the share of the way flown, `travel.e`), and the worst frames.
// The engine is bundled first, as tools/measure.mjs does. Run it by hand:
//
//   node tools/measure-down.mjs [width height] [view]      # 456 256: a laptop's frame
//
// With node --cpu-prof the profile says which functions the time goes to.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'

const W = Number(process.argv[2] ?? 456)
const H = Number(process.argv[3] ?? 256)
const only = process.argv[4]
// (to profile one stretch of the way: only frames from e0 to e1 of it are drawn)
const [e0, e1] = (process.env.PART ?? '0,1').split(',').map(Number)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'))
const file = path.join(dir, 'engine.mjs')
await build({ input: path.join(root, 'src/lib/engine/index.ts'), output: { file, format: 'esm' }, write: true, logLevel: 'warn' })
const { createScene, DEFAULT_PARAMS, STEP, stateOf } = await import(pathToFileURL(file).href)
if (process.env.KEEP) fs.copyFileSync(file, process.env.KEEP)
fs.rmSync(dir, { recursive: true })

const ctl = (more = {}) => ({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, ...more })

/** the way down over the first world of the Nomarchy's home, in a view: ms a frame, by tenths of the way */
function down(view) {
  const scene = createScene({ ...DEFAULT_PARAMS, intro: false, view, crash: false, skirmish: false, world: 's0', clouds: 0, side: 'nomarchy', locals: false })
  scene.resize(W, H)
  scene.setClock(1_800_000_000)
  const b = scene.bodies().find((x) => x.kind === 'planet')
  scene.placePlayer(b.x + b.size * 0.3, b.y + b.size * 0.2, 0.3)
  const bins = Array.from({ length: 10 }, () => ({ n: 0, ms: 0, worst: 0 }))
  let all = 0
  let n = 0
  let worst = 0
  for (let i = 0; i < 60 * 16; i++) {
    scene.setControls(ctl({ land: i > 20 && i < 60, turn: Math.sin(i / 90) * 0.3 }))
    const t0 = performance.now()
    scene.step(STEP)
    const share = stateOf(scene).travel.e
    if (!scene.zone.travel || (share >= e0 && share <= e1)) scene.render()
    const ms = performance.now() - t0
    const z = scene.zone
    if (!z.travel) {
      if (i > 120) break
      continue
    }
    const e = stateOf(scene).travel.e
    const bin = bins[Math.min(9, Math.max(0, Math.floor(e * 10)))]
    bin.n++
    bin.ms += ms
    bin.worst = Math.max(bin.worst, ms)
    all += ms
    n++
    worst = Math.max(worst, ms)
  }
  return { mean: all / Math.max(1, n), worst, n, bins }
}

/** a fight at the same frame size (two wingmen and the island world's raiders), for the target */
function fight(view) {
  const scene = createScene({ ...DEFAULT_PARAMS, intro: false, view, crash: false, wingmen: 2 })
  scene.resize(W, H)
  let all = 0
  for (let i = 0; i < 720; i++) {
    const t = i / 60
    scene.setControls(ctl({ turn: Math.sin(t * 0.4), fire: Math.sin(t * 2.1) > 0 }))
    const t0 = performance.now()
    scene.step(STEP)
    scene.render()
    if (i >= 120) all += performance.now() - t0
  }
  return all / 600
}

console.log(`${W}×${H}, ms a frame (step and draw)`)
for (const view of only ? [only] : ['top', 'chase', 'cockpit']) {
  const d = down(view)
  const f = process.env.NOFIGHT ? 0 : fight(view)
  console.log(`${view.padEnd(8)} way down ${d.mean.toFixed(2)} (worst ${d.worst.toFixed(1)}, ${d.n} frames)   a fight ${f.toFixed(2)}`)
  console.log(`         by tenths of the way: ${d.bins.map((b) => (b.n ? (b.ms / b.n).toFixed(1) : '-')).join(' ')}`)
}
