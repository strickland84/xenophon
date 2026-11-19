// Every hull at twelve headings in every view, as the game draws it, to judge a ship's shape by:
//
//   npx jiti tools/ship-turntable.ts <out folder> [hull,hull…] [scale]
//
// For each hull two sheets: <out>/turntable-<hull>-a.png, overhead and from behind (the chase camera held still while
// the ship turns under it), each at twelve headings in two rows of six; <out>/turntable-<hull>-b.png, from behind
// banking and pitching with its flames lit, and as another ship seen from the seat at twelve headings. Each picture
// is cropped round the ship, at the game's own pixels.

import { createScene, DEFAULT_PARAMS, STEP, stateOf } from '../src/lib/engine/index'
import { HULL_NAMES } from '../src/lib/engine/jet/model'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? '.'
const hulls = process.argv[3] ? process.argv[3].split(',') : HULL_NAMES
const scale = Number(process.argv[4] ?? 4)
/** the fifth argument 'cold': no flames from behind in the first sheet */
const flames = process.argv[5] !== 'cold'
const FW = 456
const FH = 256
const CELL = 64
const BASE = {
  ...DEFAULT_PARAMS,
  intro: false,
  skirmish: false,
  locals: false,
  hud: false,
  wingmen: 0,
  transition: 0.01,
  cameraFollow: 1,
  followPointer: false,
  altitude: 90,
  timeOfDay: 'day',
}

type Rgba = Uint8ClampedArray

/** a scene of one hull in one view, settled */
function sceneFor(hull: string, view: string, extra: Record<string, unknown> = {}) {
  const scene = createScene({ ...BASE, hull, view, ...extra } as never)
  scene.resize(FW, FH)
  // (long enough for a new ship's protection, which shimmers round it, to wear off)
  for (let i = 0; i < 360; i++) {
    scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    scene.step(STEP)
  }
  return scene
}

/** the box round the pixels that differ between two frames, grown to a CELL square round its middle, cut out */
function cropAround(a: Rgba, b: Rgba): Rgba {
  let x0 = FW
  let y0 = FH
  let x1 = -1
  let y1 = -1
  for (let i = 0; i < FW * FH; i++) {
    if (a[i * 4] === b[i * 4] && a[i * 4 + 1] === b[i * 4 + 1] && a[i * 4 + 2] === b[i * 4 + 2]) continue
    const x = i % FW
    const y = (i / FW) | 0
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  const cx = x1 < 0 ? FW >> 1 : (x0 + x1) >> 1
  const cy = y1 < 0 ? FH >> 1 : (y0 + y1) >> 1
  const sx = Math.max(0, Math.min(FW - CELL, cx - (CELL >> 1)))
  const sy = Math.max(0, Math.min(FH - CELL, cy - (CELL >> 1)))
  const crop = new Uint8ClampedArray(CELL * CELL * 4)
  for (let y = 0; y < CELL; y++) crop.set(a.subarray(((sy + y) * FW + sx) * 4, ((sy + y) * FW + sx + CELL) * 4), y * CELL * 4)
  return crop
}

/** the frame again with a ship's colours all one magenta: what differs is that ship alone (not its shadow) */
function repainted(scene: ReturnType<typeof createScene>, paint: { jet: Uint32Array; jetLit: Uint32Array; jetDim: Uint32Array }): Rgba {
  const kept = [paint.jet.slice(), paint.jetLit.slice(), paint.jetDim.slice()]
  for (const p of [paint.jet, paint.jetLit, paint.jetDim]) p.fill(0xffff00ff)
  const out = scene.render().slice()
  paint.jet.set(kept[0])
  paint.jetLit.set(kept[1])
  paint.jetDim.set(kept[2])
  return out
}

/** the player's own ship turned to each heading under a camera held still */
function ownShip(hull: string, view: string, pose: { roll?: number; pitch?: number; burn?: number } = {}, headings = 12): Rgba[] {
  const scene = sceneFor(hull, view, pose.burn === 0 ? { afterburner: 0 } : {})
  const st = stateOf(scene)
  const jet = st.jets[0]
  const yaw0 = jet.yaw
  const frames: Rgba[] = []
  for (let n = 0; n < headings; n++) {
    jet.yaw = yaw0 + (n * Math.PI * 2) / headings
    jet.roll = pose.roll ?? 0
    jet.pitch = pose.pitch ?? 0
    if (pose.burn !== undefined) st.burn = pose.burn
    jet.away = false
    frames.push(cropAround(scene.render().slice(), repainted(scene, st.paint)))
  }
  return frames
}

/** another ship of the hull, seen from the seat ahead of the player, at each heading */
function fromSeat(hull: string, headings = 12): Rgba[] {
  const scene = sceneFor('corsair', 'cockpit')
  const st = stateOf(scene)
  const me = st.jets[0]
  const ahead = 190
  const x = me.x + Math.sin(me.yaw) * ahead
  const y = me.y - Math.cos(me.yaw) * ahead
  const frames: Rgba[] = []
  const id = scene.addShip({ hull, x, y, height: me.z - 6, heading: me.yaw, speed: 0, side: -1, pilot: 0 })
  scene.step(STEP)
  const ship = st.ships.find((s) => s.id === id)!
  for (let n = 0; n < headings; n++) {
    Object.assign(ship.jet, { x, y, z: me.z - 6, yaw: me.yaw + (n * Math.PI * 2) / headings, roll: 0, pitch: 0, away: false })
    frames.push(cropAround(scene.render().slice(), repainted(scene, ship.paint)))
  }
  scene.removeShip(id)
  return frames
}

function sheet(rows: Rgba[][], file: string) {
  const cols = Math.max(...rows.map((r) => r.length))
  const gap = 2
  const SW = CELL * cols + gap * (cols - 1)
  const SH = CELL * rows.length + gap * (rows.length - 1)
  const px = new Uint8Array(SW * SH * 4)
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 20
    px[i + 1] = 20
    px[i + 2] = 28
    px[i + 3] = 255
  }
  rows.forEach((row, r) =>
    row.forEach((f, c) => {
      const ox = c * (CELL + gap)
      const oy = r * (CELL + gap)
      for (let y = 0; y < CELL; y++) px.set(f.subarray(y * CELL * 4, (y + 1) * CELL * 4), ((oy + y) * SW + ox) * 4)
    }),
  )
  writePNG(file, SW * scale, SH * scale, upscale(SW, SH, px, scale))
  console.log(file)
}

for (const hull of hulls) {
  const halves = (r: Rgba[]) => [r.slice(0, 6), r.slice(6)]
  sheet([...halves(ownShip(hull, 'top')), ...halves(ownShip(hull, 'chase', { burn: flames ? undefined : 0 }))], `${out}/turntable-${hull}-a.png`)
  const poses = [
    ...ownShip(hull, 'chase', { roll: 0.6, burn: 1 }, 3),
    ...ownShip(hull, 'chase', { roll: -0.6, burn: 1 }, 3),
    ...ownShip(hull, 'chase', { pitch: 0.35, burn: 1 }, 3),
    ...ownShip(hull, 'chase', { pitch: -0.35, burn: 1 }, 3),
  ]
  sheet([...halves(poses), ...halves(fromSeat(hull))], `${out}/turntable-${hull}-b.png`)
}
