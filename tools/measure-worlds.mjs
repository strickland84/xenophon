// Times building worlds: every archetype a few times, as arriving at a world does it. Run it by
// hand:
//
//   node tools/measure-worlds.mjs [runs]
//
// The engine is bundled first, as the site's build does it (see tools/measure.mjs).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'rolldown'

const RUNS = Number(process.argv[2] ?? 3)
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worlds-'))
await build({ input: path.join(root, 'src/lib/engine/index.ts'), output: { file: path.join(dir, 'engine.mjs'), format: 'esm' }, write: true, logLevel: 'warn' })
const engine = await import(pathToFileURL(path.join(dir, 'engine.mjs')).href)
fs.rmSync(dir, { recursive: true })

const world = engine.createWorld()
const time = (fn) => {
  const t = performance.now()
  fn()
  return performance.now() - t
}
const report = (name, ms) => {
  ms.sort((a, b) => a - b)
  console.log(`${name.padEnd(28)} median ${ms[ms.length >> 1].toFixed(0).padStart(4)} ms, slowest ${ms[ms.length - 1].toFixed(0).padStart(4)} ms`)
}

report(
  'islands (seed, land)',
  Array.from({ length: RUNS }, (_, i) => time(() => engine.buildWorld(world, 7 + i, 0.33))),
)
if (engine.galaxy) {
  const g = engine.galaxy(engine.GALAXY_SEED, engine.GALAXY_VERSION)
  const by = {}
  for (const w of g.worlds) (by[w.recipe.archetype] ??= []).push(w)
  for (const [archetype, list] of Object.entries(by))
    report(
      archetype,
      list.slice(0, RUNS).map((w) => time(() => engine.buildSurface(world, w.recipe))),
    )
}
