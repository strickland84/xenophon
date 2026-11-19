// Draws the places inside as the game draws them, to look at and to judge the art by:
//
//   npx jiti tools/interior-sheet.ts [out-dir] [scale]
//
// Writes hangar.png (the hangar with the pilot's ship in it, fitted and painted), deck.png (the
// station deck, its crowd about), and ship-interiors.png (a light fighter's rooms and a hauler's,
// side by side, furnished), each at the size the page shows them on a laptop (the camera pulled in).

import { createScene, DEFAULT_PARAMS, freeFor, shipRoom, STEP } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const dir = process.argv[2] ?? 'docs/art/gen'
const scale = Number(process.argv[3] ?? 4)
const W = 228
let H = 128
const CLOCK = 1_800_000_000

const LOOK = 'solari.0.0.0.3a4a6a.f2c14e'
const SHIP = {
  hull: 'corsair',
  weapons: 'flak,flak',
  parts: 'scanner,cargo-pod',
  pattern: 'stripes',
  emblem: 'skull',
  factionMark: true,
  bodyColor: '#2f4a6b',
  accentColor: '#ffd23a',
  trimColor: '#c8ccd4',
}

/** a scene landed at the Nomarchy's capital, inside `place`, walked a little way along `path` */
function inside(place: 'hangar' | 'deck' | 'ship', more: Record<string, unknown>, path: [number, number][], furniture: { id: string; x: number; y: number }[] = []) {
  const scene = createScene({ ...DEFAULT_PARAMS, side: 'nomarchy', look: LOOK, intro: false, skirmish: false, world: 'w0', ...SHIP, ...more } as never)
  scene.resize(W, H)
  scene.setClock(CLOCK)
  for (let i = 0; i < 30; i++) scene.step(STEP)
  if (!scene.goInside(place)) throw new Error(`could not go into the ${place}`)
  scene.setFurniture(furniture)
  for (const [tx, ty] of path) {
    for (let i = 0; i < 40; i++) {
      scene.setControls({ turn: tx, climb: ty, boost: 0, fire: false, secondary: false })
      scene.step(STEP)
    }
  }
  scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
  for (let i = 0; i < 20; i++) scene.step(STEP)
  console.log(place, scene.interior)
  return scene.render().slice()
}

function sheet(file: string, frames: Uint8ClampedArray[], cols: number) {
  const rows = Math.ceil(frames.length / cols)
  const gap = 2
  const SW = W * cols + gap * (cols - 1)
  const SH = H * rows + gap * (rows - 1)
  const out = new Uint8Array(SW * SH * 4)
  for (let i = 0; i < out.length; i += 4) out[i + 3] = 255
  frames.forEach((f, i) => {
    const ox = (i % cols) * (W + gap)
    const oy = Math.floor(i / cols) * (H + gap)
    for (let y = 0; y < H; y++) out.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * SW + ox) * 4)
  })
  writePNG(`${dir}/${file}`, SW * scale, SH * scale, upscale(SW, SH, out, scale))
  console.log(`${dir}/${file}`)
}

sheet('hangar.png', [inside('hangar', {}, [[0.6, 1]])], 1)
sheet('deck.png', [inside('deck', {}, [[-0.4, 1]])], 1)
/** furniture for a ship's rooms: each piece in turn on the first tile it can stand on, a room at a time */
function furnished(hull: string, ids: string[]) {
  const r = shipRoom(hull)
  const out: { id: string; x: number; y: number }[] = []
  let room = r.rooms.length > 1 ? 1 : 0
  for (const id of ids) {
    const rm = r.rooms[Math.min(room, r.rooms.length - 1)]
    found: for (let y = rm.y1; y >= rm.y0; y--)
      for (let x = 0; x < r.w; x++)
        if (freeFor(r, id, x, y)) {
          out.push({ id, x, y })
          r.props.push({ id, x, y, placed: true })
          break found
        }
    room = (room + 1) % Math.max(1, r.rooms.length)
  }
  return out
}

H = 176
sheet(
  'ship-interiors.png',
  [
    inside('ship', { hull: 'dart', weapons: '', parts: '' }, [[0, 1]], furnished('dart', ['bunk'])),
    inside('ship', { hull: 'galleon', weapons: '', parts: '' }, [[0, 1]], furnished('galleon', ['maptable', 'bunk', 'cargo', 'locker', 'plant', 'rug', 'lamp', 'bunk'])),
  ],
  2,
)
