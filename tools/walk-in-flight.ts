// Up out of the seat in flight (sim/interior.ts getUp), as the game draws it: flying over the Nomarchy's capital, the seat
// key pressed, the ship's rooms walked while it flies itself, back to the seat; then in space, up, a raider's shots
// landing (the rooms shaking and flashing, the warning), and back to the seat to fight. Each frame is shown at the size the
// page shows it (the rooms at INSIDE.zoom: a smaller frame, larger pixels). npx jiti tools/walk-in-flight.ts out.png
import { createScene, DEFAULT_PARAMS, STEP, worldSettings } from '../src/lib/engine/index'
import type { Scene } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'docs/art/gen/walk-in-flight.png'
const W = 456
const H = 256
/** each frame is drawn this many times over at the usual zoom (an inside frame, smaller, the more) */
const SHOW = 2
const frames: { px: Uint8ClampedArray; w: number; h: number; label: string }[] = []

function sceneAt(world: string, view: 'top' | 'chase' | 'cockpit', side = 'nomarchy') {
  const scene = createScene({
    ...DEFAULT_PARAMS,
    ...worldSettings(world),
    side,
    hull: 'corsair',
    view,
    intro: false,
    locals: false,
    skirmish: false,
    look: 'solari.0.0.0.3a4a6a.f2c14e',
  } as never)
  scene.setClock(1_800_000_000)
  scene.resize(W, H)
  return scene
}
const idle = { turn: 0, climb: 0, boost: 0, fire: false, secondary: false }
let zoom = 1
/** steps the scene, the frame resized as the page would when its zoom changes */
function run(scene: Scene, seconds: number, held: (n: number) => Partial<typeof idle> & { land?: boolean } = () => ({})) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    scene.setControls({ ...idle, ...held(i) })
    scene.step(STEP)
    if (scene.zoom !== zoom) {
      zoom = scene.zoom
      scene.resize(Math.round(W / zoom), Math.round(H / zoom))
    }
  }
}
const grab = (scene: Scene, label: string) => frames.push({ px: scene.render().slice(), w: scene.width, h: scene.height, label })
/** the keys pushed towards (x, y) in the rooms */
function walkTo(scene: Scene, x: number, y: number) {
  return () => {
    const it = scene.interior
    const dx = x - it.x
    const dy = y - it.y
    const n = Math.hypot(dx, dy)
    return n < 3 ? {} : { turn: dx / n, climb: -dy / n }
  }
}

// ── over a world: off the pad, up, out of the seat, to the back of the ship and back to the seat
{
  zoom = 1
  const scene = sceneAt('w0', 'chase')
  run(scene, 1.5, () => ({ land: true }))
  run(scene, 3, () => ({ climb: -1 }))
  run(scene, 2)
  grab(scene, 'flying, from behind')
  scene.act('seat')
  run(scene, 0.3)
  grab(scene, 'up out of the seat: the cockpit')
  const it = scene.interior
  const startY = it.y
  run(scene, 4, walkTo(scene, it.x, startY + 200))
  grab(scene, 'walked aft, the ship flying on')
  run(scene, 4, walkTo(scene, it.x, startY - 4))
  grab(scene, 'back by the seat')
  scene.act('use')
  run(scene, 0.5)
  grab(scene, 'in the seat again, from behind')
}

// ── in space: up, a raider comes up behind and fires, the rooms shake; back to the seat
{
  zoom = 1
  const scene = sceneAt('s1', 'top', '')
  scene.placePlayer(40000, 40000, 0.4)
  // (a new ship's protection over first)
  run(scene, 6)
  const p = scene.player
  scene.addShip({ x: p.x + Math.sin(p.heading) * 260, y: p.y - Math.cos(p.heading) * 260, heading: p.heading + Math.PI, hull: 'lance', speed: 92, side: 1, pilot: 8 })
  scene.act('seat')
  let hit = false
  for (let i = 0; i < 1800 && !hit; i++) {
    run(scene, 1 / 60)
    hit = scene.interior.struck < 0.08
  }
  grab(scene, 'up in space: hit')
  run(scene, 0.4)
  grab(scene, 'the warning')
  scene.act('seat')
  run(scene, 0.4)
  grab(scene, 'back in the seat, overhead')
}

// the sheet: two across, each frame shown at the page's size
const cw = W * SHOW
const ch = H * SHOW
const cols = 2
const rows = Math.ceil(frames.length / cols)
const px = new Uint8Array(cols * cw * rows * ch * 4)
frames.forEach((f, n) => {
  const s = Math.round(cw / f.w)
  const big = upscale(f.w, f.h, f.px, s)
  const bw = f.w * s
  const bh = Math.min(ch, f.h * s)
  const ox = (n % cols) * cw
  const oy = Math.floor(n / cols) * ch
  for (let y = 0; y < bh; y++) px.set(big.subarray(y * bw * 4, y * bw * 4 + Math.min(bw, cw) * 4), ((oy + y) * cols * cw + ox) * 4)
})
writePNG(out, cols * cw, rows * ch, px)
console.log(out, frames.map((f, i) => `${i}: ${f.label} (${f.w}x${f.h})`).join('\n'))
