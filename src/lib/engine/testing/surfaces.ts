// The tests' cache of built world surfaces (world/surface.ts setSurfaceCache), set up before every test file
// (vite.config.ts setupFiles). Building worlds was most of the tests' time: every flight over a world built it, and its
// regions and its neighbours' maps, again. Each surface is kept in memory and on disk (node_modules/.cache), under a
// fingerprint of the code that builds worlds, so a change to that code builds them afresh.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deserialize, serialize } from 'node:v8'
import { setSurfaceCache } from '../world/surface'
import type { BuiltSurface } from '../world/surface'

/** the code a surface depends on: the worlds, the galaxy's recipes, the numbers and the shared tools */
const SOURCES = ['src/lib/engine/world', 'src/lib/engine/galaxy', 'src/lib/engine/data', 'src/lib/engine/util']

function filesIn(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f)
      return statSync(p).isDirectory() ? filesIn(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : []
    })
}

const code = createHash('sha1')
for (const f of SOURCES.flatMap(filesIn)) code.update(f).update(readFileSync(f))
const DIR = join('node_modules', '.cache', 'xenophon-surfaces', code.digest('hex').slice(0, 16))
mkdirSync(DIR, { recursive: true })

const kept = new Map<string, BuiltSurface>()
const fileOf = (key: string) => join(DIR, createHash('sha1').update(key).digest('hex') + '.bin')

setSurfaceCache({
  get(key) {
    let b = kept.get(key)
    if (!b && existsSync(fileOf(key))) {
      b = deserialize(readFileSync(fileOf(key))) as BuiltSurface
      kept.set(key, b)
    }
    return b
  },
  set(key, built) {
    kept.set(key, built)
    // (written whole under another name and moved into place, so another worker never reads half a file)
    const tmp = `${fileOf(key)}.${process.pid}`
    writeFileSync(tmp, serialize(built))
    renameSync(tmp, fileOf(key))
  },
})
