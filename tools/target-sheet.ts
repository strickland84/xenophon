// The target key's pictures (docs/targeting.md), from the engine alone: each kind of target picked in each view (overhead,
// from behind, from the seat), a sheet of them at 456 × 256 a frame, scaled 2.
//
//   npx jiti tools/target-sheet.ts out.png [case ...]
//
// cases: raider station world sun gate behind base (all if none is named)

import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const W = 456
const H = 256
const VIEWS = ['top', 'chase', 'cockpit']
// (a turn of almost nothing: the keys then fly the ship, straight on)
const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })
const [out = 'target-sheet.png', ...asked] = process.argv.slice(2)

type Sc = ReturnType<typeof createScene>

/** the scene in a system's space, flown a moment out of the dock */
function inSpace(sys: string) {
  const sc = createScene(withDefaults({ ...worldSettings(sys), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
  sc.setClock(1_800_000_000)
  sc.resize(W, H)
  for (let n = 0; n < 150; n++) {
    sc.setControls(ctl({ land: n > 5 && n < 60 }))
    sc.step(STEP)
  }
  return sc
}

/** into a view, and flown on until the camera has come round to it (and the system's name has gone) */
function view(sc: Sc, v: string) {
  const st = stateOf(sc)!
  for (let i = 0; i < 3 && st.rig.target !== VIEWS.indexOf(v); i++) {
    sc.act('view')
    sc.step(STEP)
  }
  fly(sc, 120)
}

function fly(sc: Sc, n: number) {
  for (let i = 0; i < n; i++) {
    sc.setControls(ctl())
    sc.step(STEP)
  }
}

/** presses the target key until what is picked is `kind` (a body's, a ship's), at most `most` presses */
function pickUntil(sc: Sc, want: (t: NonNullable<Sc['target']>) => boolean, most = 12) {
  for (let i = 0; i < most; i++) {
    sc.act('target')
    sc.step(STEP)
    const t = sc.target
    if (t && want(t)) return t
  }
  return sc.target
}

/** near the nearest body of a kind, k of its size from it, heading at it */
function nearBody(sc: Sc, kind: string, k: number, a = 0) {
  const me = sc.player
  const b = sc.bodies().filter((x) => x.kind === kind)
  b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
  sc.placePlayer(b[0].x + Math.cos(a) * b[0].size * k, b[0].y + Math.sin(a) * b[0].size * k, Math.atan2(-Math.cos(a), Math.sin(a)))
}

const CASES: Record<string, (v: string) => { sc: Sc; label: string }> = {
  raider(v) {
    const sc = inSpace('s0')
    sc.placePlayer(sc.player.x + 20000, sc.player.y + 20000, 0)
    view(sc, v)
    const me = sc.player
    for (const [dx, dy] of [
      [-30, -160],
      [60, -240],
      [-90, -320],
    ])
      sc.addShip({ x: me.x + dx, y: me.y + dy, height: me.height, heading: 0, hull: 'lance', side: 1, speed: 60, pilot: 0 })
    fly(sc, 30)
    const t = pickUntil(sc, (t) => t.kind === 'ship', 2)
    fly(sc, 30)
    return { sc, label: t?.name ?? '-' }
  },
  station(v) {
    const sc = inSpace('s0')
    nearBody(sc, 'base', 3)
    view(sc, v)
    const t = pickUntil(sc, (t) => t.what.includes('STATION'))
    return { sc, label: t?.name ?? '-' }
  },
  world(v) {
    const sc = inSpace('s0')
    nearBody(sc, 'planet', 4)
    view(sc, v)
    const t = pickUntil(sc, (t) => t.what.includes('WORLD'))
    return { sc, label: t?.name ?? '-' }
  },
  sun(v) {
    const sc = inSpace('s0')
    nearBody(sc, 'sun', 3)
    view(sc, v)
    const t = pickUntil(sc, (t) => t.what.includes('STAR') || t.what.includes('DWARF') || t.what.includes('GIANT'))
    return { sc, label: t?.name ?? '-' }
  },
  gate(v) {
    const sc = inSpace('s0')
    nearBody(sc, 'gate', 5)
    view(sc, v)
    const t = pickUntil(sc, (t) => t.name.startsWith('GATE'))
    return { sc, label: t?.name ?? '-' }
  },
  behind(v) {
    // a station picked, then turned away from: the arrow at the edge
    const sc = inSpace('s0')
    nearBody(sc, 'base', 3)
    view(sc, v)
    pickUntil(sc, (t) => t.what.includes('STATION'))
    const me = sc.player
    sc.placePlayer(me.x, me.y, me.heading + 2.2)
    fly(sc, 40)
    return { sc, label: sc.target?.name ?? '-' }
  },
  base(v) {
    // over a world: its base picked
    const sc = createScene(withDefaults({ ...worldSettings('w9'), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
    sc.setClock(1_800_000_000)
    sc.resize(W, H)
    for (let n = 0; n < 200; n++) {
      sc.setControls(ctl({ land: n > 5 && n < 60 }))
      sc.step(STEP)
    }
    // (high over the nearest base, a way short of it and flying at it)
    const b = sc.loop.bases[0]
    sc.placePlayer(b.x, b.y + 300, 0)
    view(sc, v)
    const t = pickUntil(sc, (t) => t.kind === 'base' || t.kind === 'place')
    return { sc, label: t?.name ?? '-' }
  },
}

const names = asked.length ? asked : Object.keys(CASES)
const S = 2
const sheet = new Uint8Array(W * S * VIEWS.length * H * S * names.length * 4)
const SW = W * S * VIEWS.length
for (const [row, name] of names.entries()) {
  for (const [col, v] of VIEWS.entries()) {
    const { sc, label } = CASES[name](v)
    sc.setControls(ctl())
    sc.step(STEP)
    const px = upscale(W, H, sc.render(), S)
    for (let y = 0; y < H * S; y++) {
      const o = ((row * H * S + y) * SW + col * W * S) * 4
      sheet.set(px.subarray(y * W * S * 4, (y + 1) * W * S * 4), o)
    }
    console.log(name, v, label)
  }
}
writePNG(out, SW, H * S * names.length, sheet)
console.log(out)
