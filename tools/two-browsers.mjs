// Two browsers, each a fresh profile, join the game online through Trystero and the public
// Nostr relays, in a private room; they must find each other and see each other fly, and
// then one hunts the other with its guns until it is shot down. Screenshots of both screens
// go to the folder given. The real network, end to end: run it after changing lib/net.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/two-browsers.mjs out/ [http://localhost:5173/]
//
// It uses the Chromium that Playwright keeps in ~/.cache/ms-playwright (CHROME=… for another),
// and drives each game through window.__xenophon, which only development builds have.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'two-browsers', base = 'http://localhost:5173/'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const cache = path.join(os.homedir(), '.cache/ms-playwright')
const chrome =
  process.env.CHROME ??
  fs
    .readdirSync(cache)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((d) => path.join(cache, d, 'chrome-linux64/chrome'))
    .find((f) => fs.existsSync(f))
const room = 'trial' + Math.floor(Math.random() * 1e9).toString(36)
const t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'

/** a pilot in a browser of his own: through the first screen and into the sky */
async function pilot(name, side) {
  const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}?room=${room}&intro=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type(name)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: new RegExp('Fly for The ' + side) }).click()
  await page.waitForFunction(() => window.__xenophon)
  return { name, browser, page, errors }
}

const net = (p) =>
  p.page.evaluate(() => {
    const s = window.__xenophon.state()
    if (!s.on) return s
    return {
      pilots: s.pilots.map((x) => `${x.callsign} ${x.rtt === null ? '?' : Math.round(x.rtt)}ms`),
      failed: s.failed,
      raiders: s.host,
      relays: s.health.relays.map((r) => (r.up ? '+' : '-') + r.url.replace('wss://', '')),
      fastLane: s.health.fastLane,
    }
  })
const status = (p) =>
  p.page.evaluate(() => {
    const st = window.__xenophon.scene.status
    return { flying: st.flying, hull: +st.hull.toFixed(2), kills: st.skirmish.kills, score: st.skirmish.score }
  })

const a = await pilot('ALPHA', 'Nomarchy')
const b = await pilot('BRAVO', 'Anarchoi')
console.log(stamp(), `both in the sky, room ${room}`)
let met = false
for (let i = 0; i < 90 && !met; i++) {
  await a.page.waitForTimeout(1000)
  const [na, nb] = [await net(a), await net(b)]
  met = na.pilots?.length === 1 && nb.pilots?.length === 1
}
console.log(stamp(), met ? 'CONNECTED' : 'NOT CONNECTED')
console.log(' A', JSON.stringify(await net(a)))
console.log(' B', JSON.stringify(await net(b)))
if (!met) {
  console.log(' errors', a.errors.slice(0, 5), b.errors.slice(0, 5))
  await a.browser.close()
  await b.browser.close()
  process.exit(1)
}
await a.page.waitForTimeout(2000)
await a.page.screenshot({ path: path.join(out, 'a-met.png') })
await b.page.screenshot({ path: path.join(out, 'b-met.png') })

// B flies on; A hunts him: steers for him (or his lead point, once in the sights), fires when lined up, and lets a missile go once locked
await b.page.evaluate(() => {
  const sc = window.__xenophon.scene
  setInterval(() => sc.setControls({ turn: 0.15, climb: 0, boost: 0.6, fire: false, secondary: false }), 100)
})
await a.page.evaluate(() => {
  const sc = window.__xenophon.scene
  setInterval(() => {
    const me = sc.player
    const t = sc.status.target
    const prey = sc
      .listShips()
      .filter((s) => s.side === 2)
      .sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0]
    const aim = t ? { x: t.leadX, y: t.leadY } : prey
    let turn = 0.3
    let fire = false
    if (aim) {
      let off = Math.atan2(aim.x - me.x, -(aim.y - me.y)) - me.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      turn = Math.max(-1, Math.min(1, off * 3))
      fire = !!t && Math.abs(off) < 0.12
    }
    const far = prey ? Math.hypot(prey.x - me.x, prey.y - me.y) > 150 : false
    sc.setControls({ turn, climb: 0, boost: far ? 1 : 0, fire, secondary: !!t && sc.status.lock >= 1 })
  }, 50)
})
let shot = false
for (let i = 0; i < 60; i++) {
  await a.page.waitForTimeout(1000)
  const [sa, sb] = [await status(a), await status(b)]
  if (i % 5 === 0 || !sb.flying) console.log(stamp(), 'A', JSON.stringify(sa), 'B', JSON.stringify(sb))
  if (!sb.flying && !shot) {
    shot = true
    await a.page.screenshot({ path: path.join(out, 'a-kill.png') })
    await b.page.screenshot({ path: path.join(out, 'b-kill.png') })
  }
  if (shot && sa.kills >= 1) break
}
await a.page.waitForTimeout(2000)
await a.page.screenshot({ path: path.join(out, 'a-after.png') })
await b.page.screenshot({ path: path.join(out, 'b-after.png') })
console.log(stamp(), shot ? 'B WAS SHOT DOWN, A CREDITED: ' + ((await status(a)).kills >= 1) : 'NO KILL')
await a.browser.close()
await b.browser.close()
