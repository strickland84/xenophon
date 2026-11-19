// A whole frame from behind (the chase camera), as the game shows it, for each hull named: to judge how the camera shows
// the ship off. npx jiti tools/chase-frame.ts out.png hull[,hull…] [w h] [scale]
import { createScene, DEFAULT_PARAMS, STEP } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'chase.png'
const hulls = (process.argv[3] ?? 'corsair').split(',')
const W = Number(process.argv[4] ?? 456)
const H = Number(process.argv[5] ?? 256)
const scale = Number(process.argv[6] ?? 2)
const extra = JSON.parse(process.argv[7] ?? '{}')
const frames: Uint8ClampedArray[] = []
for (const hull of hulls) {
  const scene = createScene({ ...DEFAULT_PARAMS, hull, view: 'chase', intro: false, skirmish: false, locals: false, transition: 0.01, ...extra } as never)
  scene.resize(W, H)
  for (let i = 0; i < 360; i++) {
    scene.setControls({ turn: i > 200 && i < 300 ? 0.4 : 0, climb: 0, boost: 0, fire: false, secondary: false })
    scene.step(STEP)
  }
  frames.push(scene.render().slice())
}
const cols = Math.min(2, frames.length)
const rows = Math.ceil(frames.length / cols)
const px = new Uint8Array(cols * W * rows * H * 4)
frames.forEach((f, n) => {
  const ox = (n % cols) * W
  const oy = Math.floor(n / cols) * H
  for (let y = 0; y < H; y++) px.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * cols * W + ox) * 4)
})
writePNG(out, cols * W * scale, rows * H * scale, upscale(cols * W, rows * H, px, scale))
console.log(out)
