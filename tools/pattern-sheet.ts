// Every paint pattern on three hulls, from above and from behind, as the game paints them (to judge that a pattern reads
// as clean paint following the hull's form, not blotches):
//
//   npx jiti tools/pattern-sheet.ts out.png [hull,hull,hull] [scale]

import { createScene, DEFAULT_PARAMS, PATTERNS, STEP, stateOf } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'patterns.png'
const hulls = (process.argv[3] ?? 'corsair,dart,galleon').split(',')
const scale = Number(process.argv[4] ?? 3)
const FW = 456
const FH = 256
const CW = 60
const CH = 52
const cells: Uint8ClampedArray[] = []
for (const hull of hulls)
  for (const view of ['top', 'chase'])
    for (const pattern of PATTERNS) {
      const scene = createScene({
        ...DEFAULT_PARAMS,
        hull,
        view,
        pattern,
        intro: false,
        skirmish: false,
        locals: false,
        hud: false,
        transition: 0.01,
        cameraFollow: 1,
        followPointer: false,
        afterburner: 0,
        altitude: 90,
        bodyColor: '#3a3f4a',
        accentColor: '#c0582a',
        trimColor: '#f2f0e8',
      } as never)
      scene.resize(FW, FH)
      for (let i = 0; i < 360; i++) scene.step(STEP)
      const st = stateOf(scene)
      if (view === 'chase') st.jets[0].yaw += 0.5
      const a = scene.render().slice()
      const kept = [st.paint.jet.slice(), st.paint.jetLit.slice(), st.paint.jetDim.slice(), st.paint.jetDeep.slice()]
      for (const p of [st.paint.jet, st.paint.jetLit, st.paint.jetDim, st.paint.jetDeep]) p.fill(0xffff00ff)
      const b = scene.render()
      ;[st.paint.jet, st.paint.jetLit, st.paint.jetDim, st.paint.jetDeep].forEach((p, n) => p.set(kept[n]))
      let x0 = FW
      let y0 = FH
      let x1 = 0
      let y1 = 0
      for (let i = 0; i < FW * FH; i++)
        if (a[i * 4] !== b[i * 4] || a[i * 4 + 1] !== b[i * 4 + 1]) {
          x0 = Math.min(x0, i % FW)
          x1 = Math.max(x1, i % FW)
          y0 = Math.min(y0, (i / FW) | 0)
          y1 = Math.max(y1, (i / FW) | 0)
        }
      const sx = Math.max(0, Math.min(FW - CW, ((x0 + x1) >> 1) - CW / 2))
      const sy = Math.max(0, Math.min(FH - CH, ((y0 + y1) >> 1) - CH / 2))
      const c = new Uint8ClampedArray(CW * CH * 4)
      for (let y = 0; y < CH; y++) c.set(a.subarray(((sy + y) * FW + sx) * 4, ((sy + y) * FW + sx + CW) * 4), y * CW * 4)
      cells.push(c)
    }
const cols = PATTERNS.length
const rows = cells.length / cols
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
