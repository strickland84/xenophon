// A long session, to see that nothing builds up: a scripted pilot plays for as long as asked (an hour by default)
// across several systems, in a real browser: off a world and up into space, the cruise drive to a world, down to it,
// a fight's worth of the guns over it, up again, and every few rounds through a gate to the next system. Every minute
// it writes the page's memory (the JavaScript heap, the document's nodes, its listeners) and the frame rate, so a leak
// or a slowing shows as a line going up or down. Run it against the built site (a build with VITE_PLAYTEST=1):
//
//   VITE_PLAYTEST=1 npm run build && npx vite preview --port 4173
//   node tools/long-run.mjs [minutes=60] [http://localhost:4173/] [out.json]
//
// Getting from place to place is helped along (Scene.placePlayer); what is done there goes through the page's keys.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const minutes = Number(process.argv[2] ?? 60)
const base = process.argv[3] ?? 'http://localhost:4173/'
const outFile = process.argv[4] ?? path.join(os.tmpdir(), 'long-run.json')
const cache = path.join(os.homedir(), '.cache/ms-playwright')
const chrome = fs
  .readdirSync(cache)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  .map((d) => path.join(cache, d, 'chrome-linux64/chrome'))
  .find((f) => fs.existsSync(f))
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
await context.addInitScript(() => {
  const raf = window.requestAnimationFrame.bind(window)
  window.__frameCount = 0
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      window.__frameCount++
      cb(t)
    })
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable')
const S = (fn, arg) => page.evaluate(fn, arg)
const wait = (ms) => page.waitForTimeout(ms)
const key = async (code, ms) => {
  await page.keyboard.down(code)
  await wait(ms)
  await page.keyboard.up(code)
}

await page.goto(`${base}?net=off&tutorial=off`)
await page.getByRole('button', { name: 'Play' }).click()
await page.keyboard.type('LONGHAUL')
await page.getByRole('button', { name: 'Next' }).click()
await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 40000 })

const samples = []
const started = Date.now()
let lastFrames = 0
let lastAt = Date.now()
const sample = async (doing) => {
  const m = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]))
  const frames = await S(() => window.__frameCount)
  const now = Date.now()
  const fps = ((frames - lastFrames) * 1000) / (now - lastAt)
  lastFrames = frames
  lastAt = now
  const z = await S(() => window.__xenophon.scene.zone.key)
  const row = {
    minute: Math.round((now - started) / 6000) / 10,
    heapMB: Math.round(m.JSHeapUsedSize / 1e5) / 10,
    nodes: m.Nodes,
    listeners: m.JSEventListeners,
    fps: Math.round(fps),
    where: z,
    doing,
  }
  samples.push(row)
  console.log(JSON.stringify(row))
  fs.writeFileSync(outFile, JSON.stringify({ samples, errors }, null, 1))
}

/** off the ground and up out of the world: Action held to lift off, a climb, Action held high up */
async function upAndOut() {
  if ((await S(() => window.__xenophon.scene.zone.kind)) !== 'surface') return
  // (landed, the ship's power first: Action held brings it up and then lifts)
  if ((await S(() => window.__xenophon.scene.loop.stage)) === 'landed') await key('KeyF', 4000)
  await page.keyboard.down('KeyW')
  for (let i = 0; i < 60 && (await S(() => window.__xenophon.scene.player.height)) < 200; i++) await wait(500)
  await page.keyboard.up('KeyW')
  await page.keyboard.down('KeyF')
  for (let i = 0; i < 60 && (await S(() => window.__xenophon.scene.zone.kind)) !== 'space'; i++) await wait(500)
  await wait(4000)
  await page.keyboard.up('KeyF')
}
/** the cruise drive towards one of the system's worlds, then put over it, and down through its air */
async function toAWorld(n) {
  const w = await S((n) => {
    const s = window.__xenophon.scene
    const ws = s.bodies().filter((b) => b.world && b.kind === 'planet')
    const b = ws[n % ws.length]
    if (b) s.setCourse(b.index)
    return b ?? null
  }, n)
  if (!w) return
  await key('KeyC', 80)
  // (the cruise for a while, steered at the world: then put over it, for the time's sake)
  for (let i = 0; i < 40; i++) {
    const off = await S(([x, y]) => {
      const me = window.__xenophon.scene.player
      let a = Math.atan2(x - me.x, -(y - me.y)) - me.heading
      a -= Math.PI * 2 * Math.round(a / (Math.PI * 2))
      return a
    }, [w.x, w.y])
    if (off < -0.1) await key('KeyA', 120)
    else if (off > 0.1) await key('KeyD', 120)
    else await wait(250)
  }
  await S(([x, y]) => window.__xenophon.scene.placePlayer(x, y, 0.4), [w.x, w.y])
  await wait(1000)
  await page.keyboard.down('KeyF')
  for (let i = 0; i < 80 && (await S(() => window.__xenophon.scene.zone.kind)) !== 'surface'; i++) await wait(500)
  await wait(5000)
  await page.keyboard.up('KeyF')
}
/** half a minute over the world: turning, the guns, a roll, the view changed */
async function flyAbout() {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.down('KeyJ')
    await key(i % 2 ? 'KeyA' : 'KeyD', 900)
    await page.keyboard.up('KeyJ')
    if (i % 4 === 0) await key('Space', 80)
    if (i % 5 === 0) await key('KeyV', 80)
    await wait(1500)
  }
}
/** through the nearest gate to the next system */
async function throughAGate() {
  const g = await S(() => {
    const s = window.__xenophon.scene
    const me = s.player
    const gs = s.bodies().filter((b) => b.kind === 'gate')
    gs.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
    return gs[0] ?? null
  })
  if (!g) return
  // (put a little short of it, and flown into its ring with Use held, turning back into it, as a pilot does while it charges)
  await S(([x, y]) => window.__xenophon.scene.placePlayer(x, y + 300, 0), [g.x, g.y])
  await page.keyboard.down('KeyF')
  const sys = await S(() => window.__xenophon.scene.zone.system)
  for (let i = 0; i < 60 && (await S(() => window.__xenophon.scene.zone.system)) === sys; i++) {
    const off = await S(([x, y]) => {
      const me = window.__xenophon.scene.player
      let a = Math.atan2(x - me.x, -(y - me.y)) - me.heading
      a -= Math.PI * 2 * Math.round(a / (Math.PI * 2))
      return a
    }, [g.x, g.y])
    if (Math.abs(off) > 0.15) await key(off < 0 ? 'KeyA' : 'KeyD', 150)
    else await wait(250)
  }
  await page.keyboard.up('KeyF')
  if ((await S(() => window.__xenophon.scene.zone.system)) === sys) errors.push('a gate did not take him through')
  await wait(3000)
}

await sample('start')
let round = 0
let next = Date.now() + 60_000
while (Date.now() - started < minutes * 60_000) {
  round++
  const steps = [
    ['up out of a world', upAndOut],
    ['to a world and down', () => toAWorld(round)],
    ['flying about', flyAbout],
  ]
  if (round % 2 === 0) steps.splice(1, 0, ['through a gate', throughAGate])
  for (const [doing, fn] of steps) {
    try {
      await fn()
    } catch (e) {
      errors.push(`${doing}: ${String(e.message ?? e).slice(0, 160)}`)
      // (shot down, or stuck: a fresh start at the capital world)
      if (/Target closed|crash/i.test(String(e))) throw e
    }
    if (Date.now() > next) {
      next += 60_000
      await sample(doing)
    }
    if (Date.now() - started > minutes * 60_000) break
  }
}
await sample('end')
await browser.close()
const first = samples[1] ?? samples[0]
const last = samples.at(-1)
console.log(`\n${minutes} min, ${round} rounds: heap ${first.heapMB} → ${last.heapMB} MB, nodes ${first.nodes} → ${last.nodes}, listeners ${first.listeners} → ${last.listeners}, fps ${first.fps} → ${last.fps}; ${errors.length} errors`)
if (errors.length) console.log([...new Set(errors)].slice(0, 10).join('\n'))
