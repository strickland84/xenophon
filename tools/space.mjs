// Plays space in a real browser, alone (?net=off), and writes screenshots: a new pilot lifts off
// his side's capital world and climbs out into space (Use held high up: the whole way up through
// its air); looks at space from behind and from the seat (V); opens the maps (the system, the
// galaxy, a world's card) and plots a course to a gate; cruises there (C) and jumps. A second
// pilot, whose save is in Thodes' space (?world=s1), begins docked at its station: its screen and
// market. To look at after changing space or its screens.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/space.mjs out/ [http://localhost:5173/]
//
// It steers the ship through window.__xenophon, which only development builds have; the keys
// and buttons it presses (F, V, M, Tab) go through the page as a player's would.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'space-shots', base = 'http://localhost:5173/'] = process.argv.slice(2)
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
  const done = page.getByRole('button', { name: 'Done' })
  if (await done.count()) await done.click()
  await page.waitForFunction(() => window.__xenophon)
  return page
}
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) })
const zone = (page) => page.evaluate(() => window.__xenophon.scene.zone)
/** steers the ship (in the page, every frame or so) towards the course, or turns, until `until` (text) says so */
async function fly(page, seconds, want, until) {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    const done = await page.evaluate(
      ([want, until]) => {
        const s = window.__xenophon.scene
        const z = s.zone
        const me = s.player
        const toward = (x, y) => {
          let off = Math.atan2(x - me.x, -(y - me.y)) - me.heading
          off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
          return Math.max(-1, Math.min(1, off * 2.5))
        }
        const course = s.bodies().find((b) => b.index === z.course)
        const c = new Function('z', 'me', 'toward', 'course', 'L', want)(z, me, toward, course, s.loop)
        if (c) s.setControls({ turn: c.turn ?? 0, climb: c.climb ?? 0, boost: 0, fire: false, secondary: false, land: !!c.land })
        return new Function('z', 'me', 'course', 'L', until)(z, me, course, s.loop)
      },
      [want, until],
    )
    if (done) return true
    await page.waitForTimeout(60)
  }
  return false
}

// ── a laptop's screen
{
  const page = await newPilot(await browser.newContext({ viewport: { width: 1280, height: 720 } }), 'STARMAN')
  await page.waitForTimeout(2000)
  // (the ship waits with its power off: P brings it up, in two seconds)
  await page.keyboard.press('KeyP')
  await page.waitForTimeout(2300)
  await page.keyboard.down('KeyF')
  await page.waitForTimeout(600)
  await page.keyboard.up('KeyF')
  await page.waitForTimeout(800)
  // climb, then hold F high up to break out into space
  await fly(page, 12, `return { turn: 0.15, climb: -1 }`, `return me.height > 175`)
  await page.keyboard.down('KeyF')
  await page.waitForTimeout(900)
  await shot(page, '01-climbing-out')
  await page.keyboard.up('KeyF')
  await fly(page, 4, `return { turn: 0.1 }`, `return z.kind === 'space'`)
  await shot(page, '01b-going-up')
  await fly(page, 14, `return { turn: 0.1 }`, `return z.kind === 'space' && !z.travel`)
  await page.waitForTimeout(500)
  await shot(page, '02-in-space')
  // every view in space: from behind, from the seat, and back overhead
  await page.keyboard.press('KeyV')
  await page.waitForTimeout(1600)
  await shot(page, '02b-in-space-from-behind')
  await page.keyboard.press('KeyV')
  await page.waitForTimeout(1600)
  await shot(page, '02c-in-space-from-the-seat')
  await page.keyboard.press('KeyV')
  await page.waitForTimeout(1600)
  console.log('in space', JSON.stringify(await zone(page)).slice(0, 200))
  // the maps: the system, a world's card, the galaxy
  await page.keyboard.press('KeyM')
  await page.waitForTimeout(500)
  await shot(page, '03-system-map')
  const world = page.getByRole('button', { name: 'Coreline Major' })
  if (await world.count()) await world.click()
  await page.waitForTimeout(300)
  await shot(page, '04-world-card')
  const gate = page.getByRole('button', { name: /^Gate to Thodes/ })
  await gate.click()
  await page.getByRole('button', { name: 'Plot course' }).click()
  await page.waitForTimeout(300)
  await shot(page, '05-course-plotted')
  await page.getByRole('tab', { name: 'Galaxy' }).click()
  await page.waitForTimeout(300)
  await shot(page, '06-galaxy-map')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(300)
  // the cruise drive, to the gate
  await page.keyboard.press('KeyC')
  await fly(page, 8, `return course ? { turn: toward((z.aim ?? course).x, (z.aim ?? course).y) } : { turn: 0 }`, `return z.pace > 20`)
  await shot(page, '07-cruising')
  const there = await fly(
    page,
    120,
    `if (!course) return { turn: 0 }
     const d = Math.hypot(course.x - me.x, course.y - me.y)
     if (z.cruise === 'off' && d > 1500 && Math.random() < 0.05) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC' }))
     return { turn: toward((z.aim ?? course).x, (z.aim ?? course).y), land: d < 70 }`,
    `return z.prompt === 'jump' || z.travel === 'gate'`,
  )
  console.log('at the gate', there)
  await page.keyboard.down('KeyF')
  await page.waitForTimeout(1500)
  await shot(page, '08-gate-charging')
  await fly(page, 6, `return null`, `return z.system === 1 && !z.travel`)
  await page.keyboard.up('KeyF')
  await page.waitForTimeout(800)
  await shot(page, '09-through-the-gate')
  console.log('through', JSON.stringify(await zone(page)).slice(0, 120))
  // a pilot whose save is in Thodes' space begins docked at its station: its screen, its market
  const docked = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage()
  docked.on('pageerror', (e) => errors.push(String(e)))
  await docked.goto(`${base}?net=off&world=s1&pilot=2&tutorial=off`)
  await docked.getByRole('button', { name: 'Play' }).click()
  await docked.keyboard.type('DOCKER')
  await docked.getByRole('button', { name: 'Next' }).click()
  await docked.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  const ok = docked.getByRole('button', { name: 'Done' })
  if (await ok.count()) await ok.click()
  await docked.waitForFunction(() => window.__xenophon)
  await docked.waitForTimeout(1500)
  await shot(docked, '10-docked')
  await docked.keyboard.press('Tab')
  await docked.waitForTimeout(400)
  await docked.getByRole('tab', { name: 'Market' }).click()
  await docked.waitForTimeout(300)
  await shot(docked, '11-station-market')
}

await browser.close()
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors on the page')
