// Times a frame: stepping the scene and drawing it, with one ship, with sixteen, and in a
// dogfight (two wingmen and eight enemy ships flown by the computer, all firing), in each
// view, at a typical frame size; then in space, at each kind of place there (open space, over a
// world and beside one, by a sun's corona, over a gas giant, by a black hole, in a belt, at a station,
// on the cruise drive, and the whole way down to a world), in each view. Run it by hand:
//
//   node tools/measure.mjs [width] [height]
//
// The engine is bundled into one plain module first (with rolldown, as the site's build does),
// so it runs as it does in the browser. (Run through jiti, every imported constant read in an
// inner loop goes through a getter, and frames take half as long again.)
//
// The budget is 60 frames a second on a mid-range laptop: 16.7 ms for everything, of which
// the page needs some for itself. Node runs the same JavaScript engine as Chrome, but this
// is a desktop's processor: allow for a laptop's being slower.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'

const W = Number(process.argv[2] ?? 320)
const H = Number(process.argv[3] ?? 180)
const WARM = 120 // frames flown before timing starts
const FRAMES = 600 // frames timed

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-'))
const file = path.join(dir, 'engine.mjs')
await build({ input: path.join(root, 'src/lib/engine/index.ts'), output: { file, format: 'esm' }, write: true, logLevel: 'warn' })
const { createScene, DEFAULT_PARAMS, HULL_NAMES, STEP } = await import(pathToFileURL(file).href)
fs.rmSync(dir, { recursive: true })

/**
 * Fifteen other ships round the player, flying along with it: packed close (the worst case:
 * in the chase view several are between the camera and the player, drawn large), or spread
 * over the sky as in a dogfight.
 */
function crowd(scene, close) {
  const ids = []
  const place = (i, t) => {
    const p = scene.player
    let a, b
    if (close) {
      a = ((i % 5) - 2) * 62 + Math.sin(t + i) * 8
      b = (Math.floor(i / 5) - 1) * 46 + Math.cos(t * 0.7 + i) * 6
    } else {
      const angle = (i / 15) * Math.PI * 2 + t * 0.2
      const reach = 110 + (i % 3) * 60
      a = Math.cos(angle) * reach
      b = Math.sin(angle) * reach * 0.8
    }
    const cs = Math.cos(p.heading)
    const sn = Math.sin(p.heading)
    return { x: p.x + a * cs - b * sn, y: p.y + a * sn + b * cs, height: p.height + ((i % 3) - 1) * 10, heading: p.heading }
  }
  for (let i = 0; i < 15; i++) {
    const paint = { body: `rgb(${60 + i * 9}, 70, ${120 - i * 4})`, accent: '#f0580e' }
    ids.push(scene.addShip({ ...place(i, 0), hull: HULL_NAMES[i % HULL_NAMES.length], paint, speed: 92, thrust: (i % 4) / 3 }))
  }
  return (t) => ids.forEach((id, i) => scene.updateShip(id, { ...place(i, t), roll: Math.sin(t * 1.3 + i) * 0.4 }))
}

/** a dogfight: eight enemy ships, flown by the computer, come at the player and his two wingmen from ahead */
function dogfight(scene) {
  const p = scene.player
  for (let i = 0; i < 8; i++) {
    const a = p.heading + (i - 3.5) * 0.25
    const d = 260 + (i % 3) * 50
    const paint = { body: '#5e2a2e', accent: '#ffc83a' }
    scene.addShip({ x: p.x + Math.sin(a) * d, y: p.y - Math.cos(a) * d, height: p.height, heading: a + Math.PI, hull: HULL_NAMES[i], paint, speed: 92, side: 1, pilot: 5 })
  }
  return () => {}
}

/** a place in Thodes' space (system 1), where the player is put to time a frame there */
const PLACES = {
  'open space': () => ({ x: -45000, y: 52000 }),
  'over a world': (b) => near(b, 'planet', 0.2),
  'by a world': (b) => near(b, 'planet', -1.4),
  'by a sun': (b) => near(b, 'sun', 1.35),
  'over a gas giant': (b) => near(b, 'giant', 0.85),
  'by a black hole': (b) => near(b, 'black hole', 1.2),
  'in a belt': (b) => {
    const belt = b.find((x) => x.kind === 'belt')
    const r = Math.hypot(belt.x, belt.y)
    return { x: belt.x * (1 - 20 / r), y: belt.y * (1 - 20 / r) }
  },
  'at a station': (b) => near(b, 'base', 1.6),
  cruising: () => ({ x: -45000, y: 52000 }),
  // (the way down to a world: Use held over it, and the whole way timed)
  'going down': (b) => near(b, 'planet', 0.2),
}
function near(bodies, kind, k) {
  const b = bodies.find((x) => x.kind === kind)
  return { x: b.x + b.size * k, y: b.y + b.size * 0.2 }
}

function measure(view, ships, flameStyle, close, place = '', extra = {}, inside = '') {
  const fight = ships === 'fight'
  const space = place !== ''
  const scene = createScene({
    ...DEFAULT_PARAMS,
    intro: false,
    view,
    flameStyle,
    crash: false,
    skirmish: false,
    wingmen: fight ? 2 : 0,
    ...(space ? { world: 's1', clouds: 0 } : {}),
    ...extra,
  })
  scene.resize(W, H)
  if (inside) {
    // (landed at the Nomarchy's capital, then inside: the frame is the page's at the pulled-in camera's size)
    for (let i = 0; i < 30; i++) scene.step(STEP)
    scene.goInside(inside)
    scene.resize(W >> 1, H >> 1)
  }
  if (space) {
    scene.setClock(1_800_000_000)
    const at = PLACES[place](scene.bodies())
    scene.placePlayer(at.x, at.y, 0.3)
    if (place === 'cruising') scene.act('cruise')
  }
  const down = place === 'going down'
  const move = fight ? dogfight(scene) : ships > 1 ? crowd(scene, close) : () => {}
  let step = 0
  let draw = 0
  let worst = 0
  for (let n = 0; n < WARM + FRAMES; n++) {
    const t = n / 60
    // the thrusters open and close, so the flames are timed both short and long
    // (in the dogfight, the guns are held down in bursts)
    const firing = fight && Math.sin(t * 2.1) > 0
    scene.setControls({
      turn: Math.sin(t * 0.4),
      climb: 0,
      boost: Math.sin(t * 0.9) > 0.3 ? 1 : 0,
      fire: firing,
      secondary: fight && Math.sin(t * 0.7) > 0.95,
      // (going down: Use held once the warm-up is over, and the way flown down timed)
      land: down && n > WARM - 40 && n < WARM,
    })
    const t0 = performance.now()
    move(t)
    scene.step(STEP)
    const t1 = performance.now()
    scene.render()
    const t2 = performance.now()
    if (n >= WARM) {
      step += t1 - t0
      draw += t2 - t1
      worst = Math.max(worst, t2 - t0)
    }
  }
  return { step: step / FRAMES, draw: draw / FRAMES, worst }
}

console.log(`${W}×${H}, ${FRAMES} frames each, ms per frame: total (step + draw)\n`)
const cell = ({ step, draw }) => `${(step + draw).toFixed(2).padStart(6)} (${step.toFixed(2)} + ${draw.toFixed(2)})`
console.log(`${''.padEnd(26)} ${'1 ship'.padEnd(21)} ${'16, spread out'.padEnd(21)} ${'16, packed close'.padEnd(21)} dogfight`)
for (const flameStyle of ['pixel', 'realistic']) {
  for (const view of ['top', 'chase', 'cockpit']) {
    const row = [
      measure(view, 1, flameStyle, false),
      measure(view, 16, flameStyle, false),
      measure(view, 16, flameStyle, true),
      measure(view, 'fight', flameStyle, false),
    ]
    console.log(`${`${view}, ${flameStyle} flames`.padEnd(26)} ${row.map(cell).join('   ')}`)
  }
}

for (const view of ['top', 'chase', 'cockpit']) {
  console.log(`\nspace (Thodes), ${view}, pixel flames (and the worst frame)`)
  console.log(`${''.padEnd(26)} ${'1 ship'.padEnd(21)} ${'16, spread out'.padEnd(21)} dogfight`)
  for (const place of Object.keys(PLACES)) {
    const row = [measure(view, 1, 'pixel', false, place), measure(view, 16, 'pixel', false, place), measure(view, 'fight', 'pixel', false, place)]
    console.log(`${place.padEnd(26)} ${row.map((r) => `${cell(r)} ${r.worst.toFixed(1).padStart(5)}`).join('   ')}`)
  }
}

// Phase 8: ships fitted and painted (theirs too), and the places inside
const FIT = { weapons: 'flak,flak', parts: 'scanner,cargo-pod', pattern: 'stripes', emblem: 'skull', trimColor: '#c8ccd4', glowColor: '#ff7a2a' }
console.log(`\nfitted and painted, overhead, pixel flames`)
console.log(`${''.padEnd(26)} ${'1 ship'.padEnd(21)} ${'16, spread out'.padEnd(21)} dogfight`)
{
  const row = [measure('top', 1, 'pixel', false, '', FIT), measure('top', 16, 'pixel', false, '', FIT), measure('top', 'fight', 'pixel', false, '', FIT)]
  console.log(`${'fitted'.padEnd(26)} ${row.map(cell).join('   ')}`)
}
console.log(`\ninside (at half the frame, as the page shows it)`)
const BASE = { side: 'nomarchy', world: 'w0' }
for (const [name, place, hull] of [
  ['hangar', 'hangar', 'corsair'],
  ['station deck (its crowd)', 'deck', 'corsair'],
  ['a fighter\'s rooms', 'ship', 'dart'],
  ['a freighter\'s rooms', 'ship', 'galleon'],
]) {
  const t = measure('top', 1, 'pixel', false, '', { ...BASE, ...FIT, hull }, place)
  console.log(`${name.padEnd(26)} ${cell(t)}`)
}
