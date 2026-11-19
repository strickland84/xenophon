// Films the way up out of a world into space and the way back down, in a view, from the engine alone: a frame kept every
// so many steps, laid out as a sheet to look at (427 × 240 each: a 4K screen's frame). The ship lifts off its base's pad
// and climbs, a climb held with its thrusters, up through the top of the world's sky and its air and out; then flies back
// over the middle of the world, Use held, which takes it into its air, and once in it lets go and sinks through it.
// Nothing is begun or flown for it: it is flown as a pilot flies it (sim/travel.ts flyAir). Run it after changing anything
// of the air (sim/air.ts, sim/travel.ts, render/air.ts, render/globe.ts):
//
//   npx jiti tools/way-film.ts <out.png> [world=w0] [top|chase|cockpit] [every=45] [cols=4] [up|down|both]
//
// It prints each kept frame's zone, height and how far down through the air it is (`e`: 0 in space, 0.72 at the top of the sky).

import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { writePNG } from './png.mjs'

const [out = 'way.png', id = 'w0', view = 'top', everyArg = '45', colsArg = '4', only = 'both'] = process.argv.slice(2)
const every = Number(everyArg)
const cols = Number(colsArg)
const W = 427
const H = 240
const VIEWS = ['top', 'chase', 'cockpit']
// (a turn of almost nothing: the keys then fly the ship, straight on, as a player's do)
const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })
const sc = createScene(withDefaults({ ...worldSettings(id), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
sc.setClock(1_800_000_000)
sc.resize(W, H)
const st = stateOf(sc)!
const frames: Uint8ClampedArray[] = []
const notes: string[] = []
let n = 0
const tick = (c: object, keep = true) => {
  sc.setControls(ctl(c) as never)
  sc.step(STEP)
  n++
  if (keep && n % every === 0) {
    frames.push(sc.render().slice())
    const tr = st.travel
    notes.push(`${frames.length - 1}: ${(n / 60).toFixed(1)} s, ${sc.zone.kind}, ${sc.player.height.toFixed(0)} px up, ${tr.kind || 'flying'}, e ${tr.e.toFixed(2)}`)
  }
}
/** back over the middle of the nearest world, so the way down begins well inside its disc */
function overWorld() {
  for (let i = 0; i < 2400; i++) {
    const p = sc.player
    const w = st.space.bodies
      .filter((b) => b.body.kind === 'planet' && b.body.world >= 0)
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]
    if (!w || Math.hypot(w.x - p.x, w.y - p.y) < w.body.size * 0.35) return
    let off = Math.atan2(w.x - p.x, -(w.y - p.y)) - p.heading
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
    sc.setControls(ctl({ turn: Math.max(-1, Math.min(1, off * 2.5)), boost: 1 }) as never)
    sc.step(STEP)
  }
}
// off the pad, into the view, a little way up
for (let i = 0; i < 150; i++) tick({ land: i > 5 && i < 60 }, false)
for (let i = 0; i < 3 && st.rig.target !== VIEWS.indexOf(view); i++) {
  sc.act('view')
  tick({}, false)
}
for (let i = 0; i < 90; i++) tick({ climb: -1 }, false)
n = 0
// up: the climb held with the thrusters, until out in space, and a moment on
let after = 0
for (let i = 0; i < 3600 && after < (only === 'up' ? 150 : 20); i++) {
  tick({ climb: -1, boost: 1 }, only !== 'down')
  if (sc.zone.kind === 'space' && !st.travel.kind) after++
}
if (only !== 'up') {
  overWorld()
  notes.push('down')
  // down: Use held over the world until the ship is in its air, then let go: it goes on sinking
  after = 0
  for (let i = 0; i < 3600 && after < 150; i++) {
    tick({ land: !st.travel.kind && sc.zone.kind === 'space' })
    if (sc.zone.kind === 'surface' && !st.travel.kind) after++
  }
}
const rows = Math.ceil(frames.length / cols)
const sheet = new Uint8Array((W + 2) * cols * (H + 2) * rows * 4).fill(40)
frames.forEach((f, i) => {
  const ox = (i % cols) * (W + 2)
  const oy = Math.floor(i / cols) * (H + 2)
  for (let y = 0; y < H; y++) sheet.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * (W + 2) * cols + ox) * 4)
})
writePNG(out, (W + 2) * cols, (H + 2) * rows, sheet)
console.log(notes.join('\n'))
