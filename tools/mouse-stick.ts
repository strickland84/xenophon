// The mouse as a stick on the HUD (Elite's mouse widget): from behind over a world and from the seat in space, the pointer
// resting in the middle and pushed up and to the right. npx jiti tools/mouse-stick.ts out.png [scale]
import { createScene, DEFAULT_PARAMS, STEP, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'mouse-stick.png'
const scale = Number(process.argv[3] ?? 2)
const W = 456
const H = 256
const shots: Uint8ClampedArray[] = []
for (const [where, views] of [
  ['', 1],
  ['s3', 2],
] as const) {
  for (const push of [
    [0, 0],
    [0.18, -0.22],
  ]) {
    const scene = createScene({
      ...DEFAULT_PARAMS,
      ...(where ? worldSettings(where) : {}),
      intro: false,
      skirmish: false,
      locals: false,
      wander: false,
      invertY: false,
      transition: 0.01,
    } as never)
    scene.resize(W, H)
    for (let v = 0; v < views; v++) scene.act('view')
    for (let i = 0; i < 150; i++) {
      // (the pointer told every step, as the page does; the middle of its steering is the view's, so this is near it)
      scene.pointerMove(W / 2 + push[0] * W, H * (views === 2 ? 0.34 : 0.55) + push[1] * H)
      scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
      scene.step(STEP)
    }
    shots.push(scene.render().slice())
  }
}
const cols = 2
const rows = Math.ceil(shots.length / cols)
const px = new Uint8Array(cols * W * rows * H * 4)
shots.forEach((f, n) => {
  const ox = (n % cols) * W
  const oy = Math.floor(n / cols) * H
  for (let y = 0; y < H; y++) px.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * cols * W + ox) * 4)
})
writePNG(out, cols * W * scale, rows * H * scale, upscale(cols * W, rows * H, px, scale))
console.log(out)
