// The seat (the cockpit view) at a frame of the page's size and art pixel, as the page would show it: to judge how a
// cockpit fits a tall or wide window. npx jiti tools/seat-frame.ts out.png [hull] [page w] [page h] [art pixel]
// (the art pixel as the settings' picture size; the scene's fit may make it larger in the seat, as on the page)
import { createScene, DEFAULT_PARAMS, STEP } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'seat.png'
const hull = process.argv[3] ?? 'corsair'
const PW = Number(process.argv[4] ?? 1762)
const PH = Number(process.argv[5] ?? 1312)
const asked = Number(process.argv[6] ?? 2)
const scene = createScene({ ...DEFAULT_PARAMS, hull, intro: false, skirmish: false, locals: false, transition: 0.01 } as never)
let px = asked
const size = () => scene.resize(Math.ceil(PW / px), Math.ceil(PH / px))
size()
scene.act('view')
scene.act('view')
for (let i = 0; i < 300; i++) {
  scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
  scene.step(STEP)
  // (as display/screen.ts wanted(): no smaller than keeps the frame within the fit's tallest)
  const t = scene.fit?.tallest
  const want = t ? Math.max(asked, Math.ceil(PH / t)) : asked
  if (want !== px) {
    px = want
    size()
  }
}
const W = scene.width
const H = scene.height
writePNG(out, W * px, H * px, upscale(W, H, scene.render().slice(), px))
console.log(`${out}: ${W} x ${H} art px, ${px} px each`)
