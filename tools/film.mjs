// Plays one of the scripted flights (src/lib/engine/testing/scenarios.ts) and writes a sheet of
// its frames to a PNG, to look at. Run it by hand:
//
//   node tools/film.mjs "a kill with the cannon" out.png [every] [from] [count] [columns] [scale]
//
// `every` frames apart (default 30), starting at frame `from` (0), at most `count` (12) frames,
// `columns` across (3), each pixel drawn `scale` times (2). The engine is bundled first, as the
// site's build does it (see tools/measure.mjs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { upscale, writePNG } from './png.mjs'

const [name, out, everyS, fromS, countS, colsS, scaleS] = process.argv.slice(2)
if (!name || !out) {
  console.error('node tools/film.mjs "<flight>" out.png [every] [from] [count] [columns] [scale]')
  process.exit(1)
}
const every = Number(everyS ?? 30)
const from = Number(fromS ?? 0)
const count = Number(countS ?? 12)
const cols = Number(colsS ?? 3)
const scale = Number(scaleS ?? 2)

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'film-'))
const bundle = async (input, file) => {
  await build({ input: path.join(root, input), output: { file: path.join(dir, file), format: 'esm' }, write: true, logLevel: 'warn' })
  return import(pathToFileURL(path.join(dir, file)).href)
}
const { createScene, DEFAULT_PARAMS, theGalaxy, worldSettings } = await bundle('src/lib/engine/index.ts', 'engine.mjs')
// (a world of the galaxy for a flight, as the frame tests pick it: engine/scene.spec.ts)
const worlds = (kind, nth = 0, weather) => {
  const list = theGalaxy().worlds.filter((w) => w.recipe.archetype === kind && (!weather || w.recipe.weather === weather))
  return worldSettings(list[nth].id)
}
const bundled = await bundle('src/lib/engine/testing/scenarios.ts', 'scenarios.mjs')
const scenarios = {
  ...bundled.scenarios,
  ...bundled.worldFlights,
  ...bundled.spaceFlights,
  ...bundled.traceFlights,
  ...bundled.shipFlights,
  ...bundled.firstFlights,
  ...bundled.localFlights,
  ...bundled.creatureFlights,
  ...bundled.seatFlights,
}
fs.rmSync(dir, { recursive: true })
if (!scenarios[name]) {
  console.error(`no flight called "${name}"; there are:\n  ${Object.keys(scenarios).join('\n  ')}`)
  process.exit(1)
}

// the scene the flight drives, with every frame it draws counted, and the ones wanted kept
const frames = []
let size = [0, 0]
let n = 0
const filming = (params) => {
  const scene = createScene(params)
  const render = scene.render.bind(scene)
  scene.render = () => {
    const bytes = render()
    if (n >= from && (n - from) % every === 0 && frames.length < count) {
      frames.push({ bytes: bytes.slice(), w: scene.width, h: scene.height })
      // (on foot the frame is smaller, its art pixels larger: the sheet's cells are the largest frame)
      size = [Math.max(size[0], scene.width), Math.max(size[1], scene.height)]
    }
    n++
    return bytes
  }
  return scene
}
try {
  scenarios[name](filming, { ...DEFAULT_PARAMS }, worlds)
} catch (err) {
  // (a flight that did not show what it was written to show is the one most worth looking at)
  console.error(String(err).slice(0, 400))
}

const [W, H] = size
const rows = Math.ceil(frames.length / cols)
const sheet = new Uint8Array(W * cols * H * rows * 4)
frames.forEach((f, i) => {
  const ox = (i % cols) * W
  const oy = Math.floor(i / cols) * H
  // (a smaller frame, on foot, is shown with its art pixels as many times larger as the page shows them)
  const z = Math.max(1, Math.round(W / f.w))
  const big = z > 1 ? upscale(f.w, f.h, f.bytes, z) : f.bytes
  const bw = f.w * z
  for (let y = 0; y < Math.min(H, f.h * z); y++)
    sheet.set(big.subarray(y * bw * 4, y * bw * 4 + Math.min(W, bw) * 4), ((oy + y) * W * cols + ox) * 4)
})
writePNG(out, W * cols * scale, H * rows * scale, upscale(W * cols, H * rows, sheet, scale))
console.log(`${out}: ${frames.length} frames of "${name}", every ${every} from ${from}`)
