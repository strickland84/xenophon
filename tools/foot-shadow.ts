// The pilot's shadow on foot (render/walker.ts), close: out of his ship at the capital, standing, and through a jump, each frame cropped round him and drawn large. npx jiti tools/foot-shadow.ts out.png [scale] [clock ms] [crop px]
import { createScene, DEFAULT_PARAMS, stateOf, STEP, worldSettings } from '../src/lib/engine/index'
import { pr, project } from '../src/lib/engine/render/view'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'foot-shadow.png'
const scale = Number(process.argv[3] ?? 6)
/** the clock (ms): a time of day on the capital (its day turns with it) */
const clock = Number(process.argv[4] ?? 1_800_000_000)
const W = 456
const H = 256
const CROP = Number(process.argv[5] ?? 48)
const scene = createScene({
  ...DEFAULT_PARAMS,
  ...worldSettings('w0'),
  side: 'nomarchy',
  hull: 'corsair',
  intro: false,
  locals: false,
  transition: 0.01,
} as never)
scene.setClock(clock)
scene.resize(W, H)
const idle = { turn: 0, climb: 0, boost: 0, fire: false, secondary: false }
const run = (frames: number, held: Partial<typeof idle> = {}) => {
  for (let i = 0; i < frames; i++) {
    scene.setControls({ ...idle, ...held })
    scene.step(STEP)
    // (on foot the page shows larger art pixels: the frame smaller, as the flights do)
    const z = scene.zoom
    if (scene.width !== Math.round(W / z)) scene.resize(Math.round(W / z), Math.round(H / z))
  }
}
run(60)
scene.act('use')
run(150)
const crops: Uint8Array[] = []
const grab = () => {
  const px = scene.render()
  const fw = scene.width
  const fh = scene.height
  // (round the pilot, where he is on the frame)
  const st = stateOf(scene)!
  const j = st.foot.walker.jet
  project(st.view, j.x, j.y, j.z)
  const cx = Math.round(pr.x)
  const cy = Math.round(pr.y)
  const c = new Uint8Array(CROP * CROP * 4)
  for (let y = 0; y < CROP; y++)
    for (let x = 0; x < CROP; x++) {
      const sx = cx - CROP / 2 + x
      const sy = cy - CROP / 2 + y
      if (sx < 0 || sy < 0 || sx >= fw || sy >= fh) continue
      c.set(px.subarray((sy * fw + sx) * 4, (sy * fw + sx) * 4 + 4), (y * CROP + x) * 4)
    }
  crops.push(c)
}
grab()
// (a jump where he stands, a frame every few steps up and down again)
scene.act('roll')
for (let i = 0; i < 7; i++) {
  run(4)
  grab()
}
console.log('foot stage', scene.foot.stage)
const cols = crops.length
const sheet = new Uint8Array(cols * CROP * CROP * 4)
crops.forEach((c, n) => {
  for (let y = 0; y < CROP; y++) sheet.set(c.subarray(y * CROP * 4, (y + 1) * CROP * 4), (y * cols * CROP + n * CROP) * 4)
})
writePNG(out, cols * CROP * scale, CROP * scale, upscale(cols * CROP, CROP, sheet, scale))
console.log(out)
