// Plays one sortie of the loop in a real browser, alone (?net=off), and writes screenshots:
// a new pilot, landed at his side's base; lifts off; flies to the nearest ore and mines it;
// flies home, lands and banks; opens the base's screen and sells. To look at after changing the
// loop or its screens.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/play.mjs out/ [http://localhost:5173/]
//
// It drives the ship through window.__xenophon, which only development builds have; the
// keys it presses (F, Tab) go through the page as a player's would.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'play', base = 'http://localhost:5173/'] = process.argv.slice(2)
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
const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []

async function newPilot(context, name) {
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}?net=off&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type(name)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon)
  return page
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) })
const loop = (page) => page.evaluate(() => window.__xenophon.scene.loop)
/** steers the ship for a while: `want` runs in the page and says what to hold */
async function fly(page, seconds, want, until) {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    const done = await page.evaluate(
      ([want, until]) => {
        const s = window.__xenophon.scene
        const L = s.loop
        const me = s.player
        const toward = (x, y) => {
          let off = Math.atan2(x - me.x, -(y - me.y)) - me.heading
          off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
          return Math.max(-1, Math.min(1, off * 2.5))
        }
        // (the functions come in as text)
        const c = new Function('L', 'me', 'toward', want)(L, me, toward)
        s.setControls({ turn: c.turn ?? 0, climb: c.climb ?? 0, boost: 0, fire: false, secondary: false, land: !!c.land })
        return new Function('L', until)(L)
      },
      [want, until],
    )
    if (done) return true
    await page.waitForTimeout(50)
  }
  return false
}

// ── a laptop's screen
{
  const page = await newPilot(await browser.newContext({ viewport: { width: 1280, height: 720 } }), 'TESTER')
  await page.waitForTimeout(2500)
  await shot(page, '1-landed-at-base')
  console.log('start', JSON.stringify(await loop(page)).slice(0, 200))
  // (the ship waits with its power off: P brings it up, in two seconds)
  await page.keyboard.press('KeyP')
  await page.waitForTimeout(2300)
  await page.keyboard.down('KeyF')
  await page.waitForTimeout(700)
  await page.keyboard.up('KeyF')
  await page.waitForTimeout(1200)
  await shot(page, '2-lifting-off')
  // to the nearest ore, round it with the laser, over the chunks
  let mined = await fly(
    page,
    50,
    `const o = L.ore; if (!o) return { turn: 0.3 }
     const d = Math.hypot(o.x - me.x, o.y - me.y)
     return d > 75 ? { turn: toward(o.x, o.y), land: d < 140 } : { turn: 1, climb: me.height - o.z > 36 ? 1 : 0, land: true }`,
    'return L.fill >= 0.45',
  )
  await shot(page, '3-mining')
  console.log('mined', mined, (await loop(page)).fill)
  // home, and down on the pad
  const home = await fly(
    page,
    60,
    `const h = L.home; return { turn: toward(h.x, h.y), land: L.prompt === 'pad' || L.stage === 'landing' }`,
    `return L.stage === 'landed'`,
  )
  await page.waitForTimeout(600)
  await shot(page, '4-banked')
  console.log('home', home, JSON.stringify(await loop(page)).slice(0, 160))
  await page.keyboard.press('Tab')
  await page.waitForTimeout(400)
  await shot(page, '5-base-hold')
  await page.getByRole('tab', { name: 'Market' }).click()
  await page.waitForTimeout(300)
  await shot(page, '6-base-market')
  const sell = page.getByRole('button', { name: /^All \d+/ }).first()
  if (await sell.count()) await sell.click()
  await page.waitForTimeout(300)
  await shot(page, '7-sold')
  // (the base's supplies: parts are fitted at the hangar's bench since Phase 8)
  await page.getByRole('tab', { name: 'Supplies' }).click()
  await page.waitForTimeout(300)
  await shot(page, '8-base-supplies')
  await page.getByRole('button', { name: 'Close' }).click()
}
await browser.close()
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors on the page')
