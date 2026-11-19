// The side cards' pictures (the first screens' choice of side), drawn by the game itself (the fresh review: the image
// model's paintings flew jet fighters, and "no aircraft or jets"): each side's capital station in its own home system, its
// sun beyond it, and three of the side's ships in formation, painted in its colours, seen from behind as a player sees
// his own. Writes static/ui/home-<side>.png at 256 × 144, one pixel a game pixel.
//
//   npx jiti tools/side-cards.ts [out-dir] [a dir for enlarged copies, to look at]

import { createScene, STEP, withDefaults, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'static/ui'
const look = process.argv[3]
const W = 256
const H = 144
// (drawn taller and cut: the formation over the middle, clear of the card's emblem, which stands over the picture's foot)
const FW = 256
const FH = 200
const CUT = 48
const SIDES = [
  // the Nomarchy: gold and ivory, ordered, a long-nosed interceptor's formation
  { side: 'nomarchy', system: 's0', station: 'Meridian Ring', hull: 'lance', body: '#e6dfcc', accent: '#d9a42c', canopy: '#2aa6b8', glow: '', time: 0 },
  // the Anarchoi: rust and violet, raiders
  { side: 'anarchoi', system: 's11', station: 'The Raft', hull: 'corsair', body: '#5e3a2e', accent: '#a46cf0', canopy: '#f0a040', glow: '#ff8a3a', time: 0 },
]
const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })

for (const s of SIDES) {
  const sc = createScene(
    withDefaults({
      ...worldSettings(s.system),
      side: s.side,
      intro: false,
      hull: s.hull,
      locals: false,
      hud: false,
      wingmen: 2,
      view: 'chase',
      transition: 0.01,
      bodyColor: s.body,
      accentColor: s.accent,
      canopyColor: s.canopy,
      glowColor: s.glow,
    }),
  )
  sc.setClock(1_800_000_000)
  sc.resize(FW, FH)
  for (let n = 0; n < 60; n++) {
    sc.setControls(ctl({ land: n > 5 && n < 40 }))
    sc.step(STEP)
  }
  const bodies = sc.bodies()
  const station = bodies.find((b) => b.kind === 'base' && b.name === s.station) ?? bodies.find((b) => b.kind === 'base')!
  const sun = bodies.find((b) => b.kind === 'sun') ?? bodies[0]
  // (beside the station, the sun beyond it: heading at the station from the side away from the sun, a little off line)
  const away = Math.atan2(station.y - sun.y, station.x - sun.x) + 0.35
  const d = station.size * 5.2
  const x = station.x + Math.cos(away) * d
  const y = station.y + Math.sin(away) * d
  // (the wingmen are put by their leader afresh, and the shimmer of a new ship's protection let wear off)
  const heading = Math.atan2(station.x - x, -(station.y - y)) + 0.12
  for (let n = 0; n < 6; n++) {
    sc.placePlayer(x - Math.sin(heading) * (5 - n) * 60, y + Math.cos(heading) * (5 - n) * 60, heading)
    for (let k = 0; k < 70; k++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
  }
  // (two of the side's own in formation with him, either side and a little behind: ships of the scene, flown from here)
  const me = sc.player
  const rx = Math.cos(heading)
  const ry = Math.sin(heading)
  const fx = Math.sin(heading)
  const fy = -Math.cos(heading)
  for (const side of [-1, 1]) {
    const a = 30 * side
    const b = -16
    sc.addShip({
      hull: s.hull,
      x: me.x + rx * a + fx * b,
      y: me.y + ry * a + fy * b,
      height: me.height + 4,
      heading,
      speed: 0,
      thrust: 0.15,
      side: -1,
      paint: { body: s.body, accent: s.accent, canopy: s.canopy, ...(s.glow ? { glow: s.glow } : {}) },
    })
  }
  sc.step(STEP)
  const frame = sc.render()
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) px.set(frame.subarray((y + CUT) * FW * 4, ((y + CUT) * FW + W) * 4), y * W * 4)
  writePNG(`${out}/home-${s.side}.png`, W, H, px)
  if (look) writePNG(`${look}/home-${s.side}-look.png`, W * 4, H * 4, upscale(W, H, px, 4))
  console.log(`${out}/home-${s.side}.png`)
}
