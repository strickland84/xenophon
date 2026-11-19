// Space's places as the art audit takes them (tools/audit.mjs "space"), from the engine alone and quicker than a browser:
// beside each kind of body, `k` of its size from its middle, on the side `angle` (radians, 0 east of it; the audit's own
// side is 0), heading at it, in each view (overhead, from behind, from the seat). Frames at 456 × 256, scaled 2.
//
//   npx jiti tools/space-places.ts <out-dir> [place[:k[:angle]] ...]
//
// places: open world moon sun giant hole belt station gate (all if none is named); e.g. giant:0.9:3.14 is over a gas
// giant's day side.

import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

// (a turn of almost nothing: the keys then fly the ship, straight on, as a player's do; with none the scene steers as for a pointer)
const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })
const [out = 'out', ...asked] = process.argv.slice(2)
const PLACES: Record<string, [string, string, number]> = {
  open: ['s0', '', 0],
  world: ['s0', 'planet', 1.05],
  moon: ['s0', 'moon', 1.3],
  sun: ['s0', 'sun', 1.35],
  giant: ['s0', 'giant', 1.12],
  hole: ['s5', 'black hole', 1.6],
  belt: ['s1', 'belt', 1.0],
  station: ['s0', 'base', 3],
  gate: ['s0', 'gate', 4],
}
const VIEWS = ['top', 'chase', 'cockpit']
for (const ask of asked.length ? asked : Object.keys(PLACES)) {
  const [name, kk, aa] = ask.split(':')
  const [sys, kind, k0] = PLACES[name]
  const k = kk ? Number(kk) : k0
  const a = aa ? Number(aa) : 0
  const sc = createScene(withDefaults({ ...worldSettings(sys), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
  sc.setClock(1_800_000_000)
  sc.resize(456, 256)
  for (let n = 0; n < 150; n++) {
    sc.setControls(ctl({ land: n > 5 && n < 60 }))
    sc.step(STEP)
  }
  const me = sc.player
  const b = kind ? sc.bodies().filter((x) => x.kind === kind) : []
  b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
  const open = { x: me.x + 30000, y: me.y + 30000 }
  for (const v of VIEWS) {
    const st = stateOf(sc)!
    for (let i = 0; i < 3 && st.rig.target !== VIEWS.indexOf(v); i++) {
      sc.act('view')
      sc.step(STEP)
    }
    // (put there afresh for each view, heading at its middle: a heading h is the way (sin h, −cos h); flown on through
    // all three, a ship passed a station or a gate before the seat's picture was taken)
    if (b[0]) sc.placePlayer(b[0].x + Math.cos(a) * b[0].size * k, b[0].y + Math.sin(a) * b[0].size * k, Math.atan2(-Math.cos(a), Math.sin(a)))
    else sc.placePlayer(open.x, open.y, 0.5)
    for (let n = 0; n < 90; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    const file = `${out}/space-${ask.replace(/:/g, '_')}-${v}.png`
    writePNG(file, 912, 512, upscale(456, 256, sc.render(), 2))
    console.log(file)
  }
}
