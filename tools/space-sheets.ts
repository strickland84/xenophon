// Draws the sheets that show space at its true size and the way down to a world and up out of one
// (the polish pass, items 4 to 6), as the game draws them, to look at and to judge by:
//
//   npx jiti tools/space-sheets.ts [out-dir] [scale]
//
//   entry.png        six moments of the way down from space to the ground, from behind the ship
//   exit.png         six moments of the way up out of a world into space, from overhead
//   space-views.png  one moment by a world, overhead, from behind and from the seat
//   space-black.png  open space: a distant sun and a world lit on one side
//
// Each is a scene of the galaxy at a fixed moment of its clock, flown by a script (Use held over a
// world to go down, Use held high over one to go up), its frames taken when the way is so far along.

import { createScene, DEFAULT_PARAMS, STEP, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const dir = process.argv[2] ?? 'docs/art/gen'
const scale = Number(process.argv[3] ?? 2)
const W = 456
const H = 256
const CLOCK = 1_800_000_000

type Scene = ReturnType<typeof createScene>

/** frames side by side, `cols` across, written as one picture */
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
  console.log(`${dir}/${file}: ${frames.length} frames`)
}

/** a scene in a system's space (or over a world), the clock set */
function sceneOf(world: string, view: string, side = '') {
  const scene = createScene({ ...DEFAULT_PARAMS, ...worldSettings(world), world, intro: false, skirmish: false, view, side, locals: false } as never)
  scene.resize(W, H)
  scene.setClock(CLOCK)
  return scene
}

const held = (scene: Scene, land = false, turn = 0.0001, climb = 0) => scene.setControls({ turn, climb, boost: 0, fire: false, secondary: false, land })

/** steps until the way down (or up) is `e` along (the scene says it as 'down' or 'out' while it lasts), taking a frame then */
function stepTo(scene: Scene, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    held(scene, false, 0.06)
    scene.step(STEP)
  }
  return scene.render().slice()
}

// ── the way down, from behind: in the plane over the Nomarchy's capital world, Use held
{
  const scene = sceneOf('s0', 'chase')
  const w = scene.bodies().filter((b) => b.kind === 'planet')[0]
  scene.placePlayer(w.x + w.size * 0.15, w.y - w.size * 0.1, 0.6)
  for (let i = 0; i < 20; i++) {
    held(scene)
    scene.step(STEP)
  }
  const frames = [scene.render().slice()]
  for (let i = 0; i < 25; i++) {
    held(scene, true)
    scene.step(STEP)
  }
  // (moments of the way: the globe beneath, the limb rising, the fire, the sky, the horizon flattening, the ground)
  for (const t of [1.0, 2.0, 2.4, 3.4, 4.6]) frames.push(stepTo(scene, t))
  sheet('entry.png', frames, 3)
}

// ── the way up, from overhead: off the pad of the Nomarchy's capital, climbing, Use held
{
  const scene = sceneOf('w0', 'top', 'nomarchy')
  for (let i = 0; i < 30; i++) {
    held(scene, true)
    scene.step(STEP)
  }
  for (let i = 0; i < 300; i++) {
    held(scene, false, 0.1, -1)
    scene.step(STEP)
  }
  const frames = [scene.render().slice()]
  for (let i = 0; i < 40; i++) {
    held(scene, true, 0.1, -1)
    scene.step(STEP)
  }
  for (const t of [1.4, 2.2, 2.2, 2.0, 3.6]) frames.push(stepTo(scene, t))
  sheet('exit.png', frames, 3)
}

// ── one moment by a world, in each view: coming in over its edge in the plane, its globe below and ahead
{
  const frames: Uint8ClampedArray[] = []
  for (const view of ['top', 'chase', 'cockpit']) {
    const scene = sceneOf('s0', view)
    const w = scene.bodies().filter((b) => b.kind === 'planet')[1]
    // (over its edge, heading in: the camera looks down at it a little, as it does over a world)
    scene.placePlayer(w.x - w.size * 0.95, w.y + w.size * 0.2, Math.PI / 2 - 0.2)
    for (let i = 0; i < 150; i++) {
      held(scene, false, 0.02)
      scene.step(STEP)
    }
    frames.push(scene.render().slice())
  }
  sheet('space-views.png', frames, 3)
}

// ── open space: far out, a world lit on one side, the sun beyond it
{
  const scene = sceneOf('s0', 'chase')
  const bodies = scene.bodies()
  const sun = bodies.find((b) => b.kind === 'sun')!
  const w = bodies.filter((b) => b.kind === 'planet')[1]
  // (out past the world and to one side of the line from the sun, looking back between the two)
  const rx = (w.x - sun.x) / Math.hypot(w.x - sun.x, w.y - sun.y)
  const ry = (w.y - sun.y) / Math.hypot(w.x - sun.x, w.y - sun.y)
  const px = w.x + rx * w.size * 5 - ry * w.size * 5
  const py = w.y + ry * w.size * 5 + rx * w.size * 5
  const tx = w.x * 0.7 + sun.x * 0.3
  const ty = w.y * 0.7 + sun.y * 0.3
  scene.placePlayer(px, py, Math.atan2(tx - px, -(ty - py)))
  for (let i = 0; i < 40; i++) {
    held(scene, false, 0.0001)
    scene.step(STEP)
  }
  sheet('space-black.png', [scene.render().slice()], 1)
}
