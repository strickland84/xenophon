// Frames of the pilot beside his ship, every hull's cockpit, and the places inside, as the game draws
// them, for the polish pass's sheets (items 1, 3 and 7):
//
//   npx jiti tools/inside-sheets.ts <out-dir> [pilot|cockpits|rooms|ships|fitouts]...
//
// Writes one PNG a frame (at its own size, one pixel a pixel) into out-dir; tools/inside-sheets.py lays
// them out into docs/art/gen/pilot-scale.png, cockpits.png, rooms.png and ship-interiors-after.png. It
// uses the scene's public API only, so the same script run on an older build draws the "before".

import fs from 'node:fs'
import { createScene, DEFAULT_PARAMS, HULL_NAMES, STEP } from '../src/lib/engine/index'
import { writePNG } from './png.mjs'

const dir = process.argv[2] ?? 'out/inside'
const parts = process.argv.slice(3)
const want = (p: string) => parts.length === 0 || parts.includes(p)
fs.mkdirSync(dir, { recursive: true })
const CLOCK = 1_800_000_000
const LOOK = 'solari.0.0.0.3a4a6a.f2c14e'
// a laptop's frame, in art pixels before the camera pulls in
const W = 456
const H = 256

type Scene = ReturnType<typeof createScene>
const held = (turn: number, climb: number, extra: Record<string, unknown> = {}) => ({ turn, climb, boost: 0, fire: false, secondary: false, ...extra })

function save(name: string, scene: Scene) {
  const bytes = scene.render()
  writePNG(`${dir}/${name}.png`, scene.width, scene.height, bytes)
  console.log(`${dir}/${name}.png ${scene.width}x${scene.height}`)
}

/** steps the scene, the frame resized as the page would when the camera pulls in */
function step(scene: Scene, n: number, each?: (i: number) => void) {
  for (let i = 0; i < n; i++) {
    each?.(i)
    scene.step(STEP)
    // (no larger than lets the hangar or the deck be seen whole, as the page does: Scene.fit)
    const fit = (scene as { fit?: { w: number; h: number; least?: number } | null }).fit
    const z = Math.max(fit?.least ?? 0, Math.min((scene as { zoom?: number }).zoom ?? 1, fit ? Math.min(W / fit.w, H / fit.h) : 99))
    const w = Math.round(W / z)
    const h = Math.round(H / z)
    if (scene.width !== w || scene.height !== h) scene.resize(w, h)
  }
}

function landed(more: Record<string, unknown>) {
  const scene = createScene({ ...DEFAULT_PARAMS, side: 'nomarchy', look: LOOK, intro: false, skirmish: false, world: 'w0', locals: false, ...more } as never)
  scene.resize(W, H)
  scene.setClock(CLOCK)
  step(scene, 30)
  return scene
}

// ── the pilot out beside his ship, on the pad
if (want('pilot'))
  for (const hull of ['dart', 'corsair', 'galleon']) {
    const scene = landed({ hull, bodyColor: '#2f4a6b', accentColor: '#f0580e' })
    const ship = { x: scene.player.x, y: scene.player.y }
    scene.act('use')
    // (a few steps out from the ship's side, then turned to face the camera)
    step(scene, 150, (i) => {
      const p = scene.player
      const tx = ship.x - (i < 100 ? 26 : 22)
      const ty = ship.y + (i < 100 ? 10 : 14)
      const dx = tx - p.x
      const dy = ty - p.y
      const d = Math.hypot(dx, dy)
      // (the keys move him the way the screen shows: turned by the camera's own turn)
      const yaw = (scene as unknown as { foot: { yaw: number } }).foot.yaw
      const sx = (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / d
      const sy = (dx * Math.sin(yaw) + dy * Math.cos(yaw)) / d
      scene.setControls(d > 1.5 && i < 140 ? held(sx, -sy) : held(0, 0))
    })
    save(`pilot-${hull}`, scene)
  }

// ── every hull's cockpit, low over the capital world and in space, a ship ahead
if (want('cockpits')) {
  for (const hull of HULL_NAMES) {
    const scene = createScene({ ...DEFAULT_PARAMS, hull, intro: false, skirmish: false, view: 'cockpit', accentColor: '#f0580e', locals: false } as never)
    scene.resize(W, H)
    const p = scene.player
    scene.addShip({ x: p.x + Math.sin(p.heading) * 90, y: p.y - Math.cos(p.heading) * 90, height: p.height + 6, heading: p.heading, hull: 'lance', side: 1, speed: 92 } as never)
    step(scene, 200, (i) => scene.setControls(held(i < 120 ? 0.3 : 0, 0)))
    save(`cockpit-${hull}`, scene)
  }
  for (const hull of ['corsair', 'mule', 'bastion', 'wraith']) {
    const scene = createScene({ ...DEFAULT_PARAMS, hull, side: 'nomarchy', intro: false, skirmish: false, view: 'cockpit', world: 's0', locals: false } as never)
    scene.resize(W, H)
    scene.setClock(CLOCK)
    step(scene, 260, (i) => scene.setControls(held(i > 60 && i < 200 ? -0.4 : 0, 0)))
    save(`cockpit-space-${hull}`, scene)
  }
}

/** inside `place`, walked by the keys along `path` (each a push held for `n` steps) */
function inside(place: 'hangar' | 'deck' | 'ship', hull: string, path: [number, number, number][], kit = true) {
  const scene = landed({ hull, weapons: 'flak,flak', parts: 'scanner,cargo-pod', pattern: 'stripes', emblem: 'skull', factionMark: true, bodyColor: '#2f4a6b', accentColor: '#f0580e' })
  if (!scene.goInside(place)) throw new Error(`could not go into the ${place}`)
  const lib = (globalThis as { __kit?: (h: string) => { id: string; x: number; y: number }[] }).__kit
  if (kit && place === 'ship' && lib) scene.setFurniture(lib(hull))
  for (const [tx, ty, n] of path) step(scene, n, () => scene.setControls(held(tx, ty)))
  step(scene, 20, () => scene.setControls(held(0, 0)))
  return scene
}

// (the ship's own fit-out, where the engine says what it is)
import('../src/lib/engine/index').then((m: Record<string, unknown>) => {
  if (typeof m.shipKit === 'function') (globalThis as { __kit?: unknown }).__kit = m.shipKit
  ;(globalThis as { __room?: unknown }).__room = m.shipRoom
  rooms()
})

function rooms() {
  if (want('rooms')) {
    save('room-hangar', inside('hangar', 'corsair', [[0.5, 1, 60]]))
    save('room-deck', inside('deck', 'corsair', [[-0.3, 1, 70]]))
    // a ship's rooms, walked from the hatch towards the seat: each one a few steps after he comes into it
    const at: [string, string, string][] = [
      ['cargo', 'galleon', 'CARGO BAY'],
      ['quarters', 'galleon', 'CREW QUARTERS'],
      ['map', 'galleon', 'MAP ROOM'],
      ['cockpit', 'galleon', 'COCKPIT'],
      ['cabin', 'corsair', 'CABIN'],
      ['engine', 'bastion', 'ENGINE ROOM'],
    ]
    for (const [room, hull, name] of at) {
      const scene = inside('ship', hull, [])
      let since = -1
      for (let i = 0; i < 900 && since < 26; i++) {
        const here = (scene.interior as { room?: string }).room
        if (here === name && since < 0) since = 0
        if (since >= 0) since++
        step(scene, 1, () => scene.setControls(held(0, 1)))
      }
      step(scene, 10, () => scene.setControls(held(0, 0)))
      save(`room-${room}`, scene)
    }
  }
  // ── every hull's rooms whole, with its fit-out, from above (docs/art/gen/fit-outs.png)
  if (want('fitouts'))
    for (const hull of ['dart', 'sparrow', 'lance', 'corsair', 'wraith', 'prospector', 'mule', 'bastion', 'nomad', 'galleon']) {
      const scene = inside('ship', hull, [[0, -1, 12]])
      const room = (globalThis as { __room?: (h: string) => { w: number; h: number } }).__room!(hull)
      scene.resize(room.w * 8, room.h * 8)
      scene.step(STEP)
      save(`fitout-${hull}`, scene)
    }
  // ── a small ship's rooms and a large one's, whole (a frame large enough to hold them)
  if (want('ships'))
    for (const hull of ['dart', 'corsair', 'mule', 'galleon']) {
      const scene = inside('ship', hull, [[0, 1, 40]])
      const save0 = scene.resize.bind(scene)
      save0(280, 250)
      scene.step(STEP)
      save(`ship-${hull}`, scene)
    }
}
