// One hull as the game draws it, close to: overhead, from behind and from the side (the chase camera held still while
// the ship turns under it), flames out, each cropped round the ship and enlarged pixel for pixel:
//
//   npx jiti tools/ship-close.ts out.png hull[,hull…] [scale] [settings as JSON] [view:turn,…]

import { createScene, DEFAULT_PARAMS, STEP, stateOf } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'close.png'
const hulls = (process.argv[3] ?? 'corsair').split(',')
const scale = Number(process.argv[4] ?? 6)
/** any other settings, as JSON (a fit: weapons, parts, pattern …) */
const extra = JSON.parse(process.argv[5] ?? '{}')
const FW = 456
const FH = 256
const CW = 64
const CH = 48
const BASE = { ...DEFAULT_PARAMS, intro: false, skirmish: false, locals: false, hud: false, wingmen: 0, transition: 0.01 }
/** the views and turns drawn, as view:turn,… (radians; default overhead twice, then from behind, behind and aside, the side, the front) */
const POSES: [string, number][] = (process.argv[6] ?? 'top:0,top:2.2,chase:0,chase:0.7,chase:1.5708,chase:3.1416')
  .split(',')
  .map((p) => [p.split(':')[0], Number(p.split(':')[1])])

const cells: Uint8ClampedArray[] = []
for (const hull of hulls) {
  for (const [view, turn] of POSES) {
    const scene = createScene({ ...BASE, hull, view, cameraFollow: 1, followPointer: false, altitude: 90, afterburner: 0, ...extra } as never)
    scene.resize(FW, FH)
    for (let i = 0; i < 360; i++) scene.step(STEP)
    const st = stateOf(scene)
    st.jets[0].yaw += turn
    const a = scene.render().slice()
    const kept = [st.paint.jet.slice(), st.paint.jetLit.slice(), st.paint.jetDim.slice()]
    for (const p of [st.paint.jet, st.paint.jetLit, st.paint.jetDim]) p.fill(0xffff00ff)
    const b = scene.render()
    ;[st.paint.jet, st.paint.jetLit, st.paint.jetDim].forEach((p, n) => p.set(kept[n]))
    let x0 = FW
    let y0 = FH
    let x1 = 0
    let y1 = 0
    for (let i = 0; i < FW * FH; i++)
      if (a[i * 4] !== b[i * 4] || a[i * 4 + 1] !== b[i * 4 + 1]) {
        const x = i % FW
        const y = (i / FW) | 0
        x0 = Math.min(x0, x)
        x1 = Math.max(x1, x)
        y0 = Math.min(y0, y)
        y1 = Math.max(y1, y)
      }
    const sx = Math.max(0, Math.min(FW - CW, ((x0 + x1) >> 1) - CW / 2))
    const sy = Math.max(0, Math.min(FH - CH, ((y0 + y1) >> 1) - CH / 2))
    const c = new Uint8ClampedArray(CW * CH * 4)
    for (let y = 0; y < CH; y++) c.set(a.subarray(((sy + y) * FW + sx) * 4, ((sy + y) * FW + sx + CW) * 4), y * CW * 4)
    cells.push(c)
  }
}
const cols = POSES.length
const rows = hulls.length
const SW = cols * (CW + 1)
const SH = rows * (CH + 1)
const px = new Uint8Array(SW * SH * 4)
cells.forEach((c, n) => {
  const ox = (n % cols) * (CW + 1)
  const oy = Math.floor(n / cols) * (CH + 1)
  for (let y = 0; y < CH; y++) px.set(c.subarray(y * CW * 4, (y + 1) * CW * 4), ((oy + y) * SW + ox) * 4)
})
writePNG(out, SW * scale, SH * scale, upscale(SW, SH, px, scale))
console.log(out)
