// The ship's power, as the game draws it (sim/power.ts): landed at the capital and docked at a station with the power off,
// the switch thrown, and the cockpit and the HUD coming alive; then lifted off. npx jiti tools/power-sheet.ts out.png [scale]
import { createScene, DEFAULT_PARAMS, STEP, worldSettings } from '../src/lib/engine/index'
import type { Scene } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'power.png'
const scale = Number(process.argv[3] ?? 2)
const W = 456
const H = 256
const frames: { px: Uint8ClampedArray; label: string }[] = []

function sceneAt(world: string, view: 'top' | 'chase' | 'cockpit') {
  const scene = createScene({
    ...DEFAULT_PARAMS,
    ...worldSettings(world),
    side: 'nomarchy',
    hull: 'corsair',
    view,
    intro: false,
    locals: false,
    transition: 0.01,
    coldStart: true,
  } as never)
  scene.setClock(1_800_000_000)
  scene.resize(W, H)
  return scene
}
const idle = { turn: 0, climb: 0, boost: 0, fire: false, secondary: false }
function run(scene: Scene, seconds: number, held: Partial<typeof idle> & { land?: boolean } = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    scene.setControls({ ...idle, ...held })
    scene.step(STEP)
  }
}
const grab = (scene: Scene, label: string) => frames.push({ px: scene.render().slice(), label })

for (const [world, view] of [
  ['w0', 'cockpit'],
  ['w0', 'top'],
  ['s0', 'cockpit'],
] as const) {
  const scene = sceneAt(world, view)
  run(scene, 2.5)
  grab(scene, `${world} ${view}: power off`)
  // (the trigger pressed: the weapons are safe)
  run(scene, 0.1, { fire: true })
  run(scene, 0.3)
  if (view === 'top') grab(scene, `${world} ${view}: weapons safe`)
  scene.act('power')
  let was = 0
  for (const t of view === 'cockpit' ? [0.35, 0.7, 1.05, 1.5] : [0.6, 1.1]) {
    run(scene, t - was)
    was = t
    grab(scene, `${world} ${view}: powering up ${t} s`)
  }
  run(scene, 1.2)
  grab(scene, `${world} ${view}: power on`)
}

const cols = 3
const rows = Math.ceil(frames.length / cols)
const px = new Uint8Array(cols * W * rows * H * 4)
frames.forEach(({ px: f }, n) => {
  const ox = (n % cols) * W
  const oy = Math.floor(n / cols) * H
  for (let y = 0; y < H; y++) px.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * cols * W + ox) * 4)
})
writePNG(out, cols * W * scale, rows * H * scale, upscale(cols * W, rows * H, px, scale))
console.log(out, frames.map((f, i) => `${i}: ${f.label}`).join('\n'))
