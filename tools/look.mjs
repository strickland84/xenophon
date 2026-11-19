// Flies a scene with the settings given and writes a sheet of what it draws, to look at. Run
// it by hand:
//
//   node tools/look.mjs out.png [setting=value ...] [frames=240] [every=60] [w=320] [h=180] [cols=2] [scale=2] [turn=0.3]
//
// Any setting of the scene (engine/params.ts) can be given, e.g. `world=w12 view=chase`. The
// ship flies itself (or turns at `turn` with the keys); a frame is kept every `every` frames.
// The engine is bundled first, as the site's build does it (see tools/measure.mjs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { upscale, writePNG } from './png.mjs'

const [out, ...rest] = process.argv.slice(2)
if (!out) {
  console.error('node tools/look.mjs out.png [setting=value ...]')
  process.exit(1)
}
const opts = { frames: 240, every: 60, w: 320, h: 180, cols: 2, scale: 2, turn: '' }
const settings = { intro: false, skirmish: false }
for (const arg of rest) {
  const [k, v] = arg.split('=')
  const value = v === 'true' ? true : v === 'false' ? false : v !== '' && Number.isFinite(Number(v)) ? Number(v) : v
  if (k in opts) opts[k] = value
  else settings[k] = value
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'look-'))
await build({ input: path.join(root, 'src/lib/engine/index.ts'), output: { file: path.join(dir, 'engine.mjs'), format: 'esm' }, write: true, logLevel: 'warn' })
const engine = await import(pathToFileURL(path.join(dir, 'engine.mjs')).href)
fs.rmSync(dir, { recursive: true })

const params = engine.withDefaults({ ...(engine.worldSettings && settings.world ? engine.worldSettings(settings.world) : {}), ...settings })
const scene = engine.createScene(params)
scene.resize(opts.w, opts.h)
const frames = []
for (let n = 0; n < opts.frames; n++) {
  if (opts.turn !== '') scene.setControls({ turn: Number(opts.turn), climb: 0, boost: 0, fire: false, secondary: false })
  scene.step(engine.STEP)
  const bytes = scene.render()
  if ((n + 1) % opts.every === 0) frames.push(bytes.slice())
}
const { w: W, h: H, cols, scale } = opts
const rows = Math.ceil(frames.length / cols)
const sheet = new Uint8Array(W * cols * H * rows * 4)
frames.forEach((f, i) => {
  const ox = (i % cols) * W
  const oy = Math.floor(i / cols) * H
  for (let y = 0; y < H; y++) sheet.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * W * cols + ox) * 4)
})
writePNG(out, W * cols * scale, H * rows * scale, upscale(W * cols, H * rows, sheet, scale))
console.log(`${out}: ${frames.length} frames`)
