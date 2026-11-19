// Draws what is stamped into a world's ground (world/features.ts) from above, to look at: each
// base, and a few of its outcrops, rich deposits and wrecks, in the world's own light. Run it
// by hand:
//
//   node tools/sites.mjs out.png w0 [w13 ...] [w=320] [h=180] [scale=2] [outcrops=3] [view=top]
//
// The engine is bundled first, as the site's build does it (see tools/measure.mjs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'
import { upscale, writePNG } from './png.mjs'

const [out, ...rest] = process.argv.slice(2)
if (!out) {
  console.error('node tools/sites.mjs out.png w0 [w13 ...]')
  process.exit(1)
}
const opts = { w: 320, h: 180, scale: 2, outcrops: 3, view: 'top', altitude: 70 }
const ids = []
for (const arg of rest) {
  const [k, v] = arg.split('=')
  if (v !== undefined && k in opts) opts[k] = Number.isFinite(Number(v)) ? Number(v) : v
  else ids.push(arg)
}

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sites-'))
await build({ input: path.join(root, 'src/lib/engine/index.ts'), output: { file: path.join(dir, 'engine.mjs'), format: 'esm' }, write: true, logLevel: 'warn' })
const engine = await import(pathToFileURL(path.join(dir, 'engine.mjs')).href)
fs.rmSync(dir, { recursive: true })

const frames = []
for (const id of ids) {
  const surface = engine.surfaceById(id)
  const made = engine.createWorld()
  engine.buildSurface(made, surface.recipe, engine.siteOf(surface))
  const f = made.features
  console.log(`${id} ${surface.name} (${surface.recipe.archetype}): ${f.bases.length} bases, ${f.outcrops.length} outcrops`)
  for (const b of f.bases) console.log(`  base ${b.id} ${b.name} ${b.owner ?? 'neutral'}${b.capital ? ' capital' : ''} at ${b.x},${b.y} pad z ${b.pads[0].z}`)
  const sites = [
    ...f.bases.map((b) => [b.x, b.y]),
    ...f.outcrops.filter((o) => o.rich).map((o) => [o.x, o.y]),
    ...f.outcrops.filter((o) => o.wreck).slice(0, 1).map((o) => [o.x, o.y]),
    ...f.outcrops.filter((o) => !o.rich && !o.wreck).slice(0, opts.outcrops).map((o) => [o.x, o.y]),
  ]
  for (const [x, y] of sites) {
    const world = { ...made, height: made.height.slice(), mat: made.mat.slice(), clouds: made.clouds.slice(), noise: made.noise.slice(), spawnX: x, spawnY: y + 30 }
    const params = engine.withDefaults({ ...engine.worldSettings(id), intro: false, skirmish: false, hud: false, speed: 0.5, altitude: opts.altitude, view: opts.view, clouds: 0 })
    const scene = engine.createScene({ ...params, world: '' })
    scene.resize(opts.w, opts.h)
    scene.giveWorld(id, world)
    scene.setParams(params)
    for (let n = 0; n < 40; n++) scene.step(engine.STEP)
    frames.push(scene.render().slice())
  }
}
const { w: W, h: H, scale } = opts
const cols = Math.min(3, frames.length)
const rows = Math.ceil(frames.length / cols)
const sheet = new Uint8Array(W * cols * H * rows * 4)
frames.forEach((f, i) => {
  const ox = (i % cols) * W
  const oy = Math.floor(i / cols) * H
  for (let y = 0; y < H; y++) sheet.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * W * cols + ox) * 4)
})
writePNG(out, W * cols * scale, H * rows * scale, upscale(W * cols, H * rows, sheet, scale))
console.log(`${out}: ${frames.length} sites`)
