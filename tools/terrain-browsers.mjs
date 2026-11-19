// Every player must get the same world, bit for bit (the plan's section 21). The terrain's fingerprints are pinned in
// Node (src/lib/engine/world/worlds.spec.ts, testing/pinned/worlds.txt); this builds every world again in real
// browsers, Chromium, Firefox and WebKit (Safari's engine), and checks each comes out with the same fingerprint:
// its heights, its materials, where a flight starts and its clouds. Run it by hand:
//
//   npm i --no-save playwright-core@1.65     # once (it is not one of the game's dependencies)
//   npx playwright-core install chromium firefox webkit
//   node tools/terrain-browsers.mjs [chromium firefox webkit]
//
// The terrain code is bundled into one plain module (with rolldown, as the site's build does) and served to a blank
// page; each browser builds the 68 worlds and the island world and hands back their fingerprints.
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { build } from 'rolldown'
import * as pw from 'playwright-core'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const want = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'firefox', 'webkit']
// (the entry is written inside the project, so the bundler reads the project's own settings)
fs.mkdirSync(path.join(root, 'node_modules/.cache'), { recursive: true })
const dir = fs.mkdtempSync(path.join(root, 'node_modules/.cache/terrain-'))
const entry = path.join(dir, 'entry.ts')
const lib = path.join(root, 'src/lib/engine')
// (the fingerprints exactly as worlds.spec.ts makes them)
fs.writeFileSync(
  entry,
  `
import { siteOf, theGalaxy } from '${lib}/galaxy/galaxy'
import { buildWorld } from '${lib}/world/generate'
import { buildSurface } from '${lib}/world/surface'
import { createWorld } from '${lib}/world/world'
function fnv(hash, bytes) {
  let h = hash
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
const hex = (n) => n.toString(16).padStart(8, '0')
function print(w) {
  const ground = fnv(fnv(fnv(0x811c9dc5, w.height), w.mat), new Uint8Array(new Uint32Array([w.spawnX, w.spawnY]).buffer))
  return 'ground ' + hex(ground) + ' clouds ' + hex(fnv(0x811c9dc5, w.clouds)) + ' start ' + w.spawnX + ',' + w.spawnY
}
export function prints() {
  const out = []
  const world = createWorld()
  buildWorld(world, 7, 0.33)
  out.push('islands-7-33 ' + print(world))
  for (const s of theGalaxy().worlds) {
    buildSurface(world, s.recipe, siteOf(s))
    out.push(s.id + ' ' + print(world))
  }
  return out.join('\\n') + '\\n'
}
`,
)
await build({ input: entry, tsconfig: false, output: { file: path.join(dir, 'terrain.js'), format: 'esm' }, write: true, logLevel: 'warn' })
const js = fs.readFileSync(path.join(dir, 'terrain.js'))
const page = '<!doctype html><meta charset="utf-8"><title>terrain</title><script type="module">import { prints } from "./terrain.js"; window.result = prints()</script>'
const server = http.createServer((req, res) => {
  if (req.url?.startsWith('/terrain.js')) res.writeHead(200, { 'content-type': 'text/javascript' }).end(js)
  else res.writeHead(200, { 'content-type': 'text/html' }).end(page)
})
await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
const url = `http://127.0.0.1:${server.address().port}/`
const pinned = fs.readFileSync(path.join(lib, 'testing/pinned/worlds.txt'), 'utf8')

let bad = 0
for (const name of want) {
  const started = Date.now()
  const browser = await pw[name].launch()
  const p = await browser.newPage()
  await p.goto(url)
  const got = await p.waitForFunction(() => window.result, null, { timeout: 600_000, polling: 500 }).then((h) => h.jsonValue())
  const version = browser.version()
  await browser.close()
  const a = pinned.trim().split('\n')
  const b = got.trim().split('\n')
  const differ = a.filter((line, i) => line !== b[i])
  if (differ.length || a.length !== b.length) bad++
  console.log(
    `${name} ${version}: ${b.length} worlds in ${((Date.now() - started) / 1000).toFixed(0)} s, ` +
      (differ.length || a.length !== b.length ? `${differ.length} DIFFER: ${differ.slice(0, 5).join(' | ')}` : 'every fingerprint as pinned'),
  )
}
server.close()
fs.rmSync(dir, { recursive: true })
process.exit(bad ? 1 : 0)
