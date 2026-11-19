// Plays the hangar and the station deck in a real browser, alone (?net=off), and writes screenshots:
// a new pilot landed at his side's base goes into the hangar, walks to the loadout bench and opens it
// (buys and fits flak, after being given credits by a bounty in his log), to the paint booth (a
// pattern and an emblem), up to the deck and its shop, and aboard his ship to furnish it; then the
// whole hangar at 1366 by 768. To look at after changing the places inside or their screens.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/hangar.mjs out/ [http://localhost:5173/]
//
// It goes through the page as a player's keys and mouse would; it reads where the pilot stands
// from window.__xenophon, which only development builds have.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { walkToSpot, walkToTile } from './inside-walk.mjs'

const [out = 'hangar', base = 'http://localhost:5173/'] = process.argv.slice(2)
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
const shot = (page, name) => page.screenshot({ path: path.join(out, `${name}.png`) })
const inside = (page) => page.evaluate(() => window.__xenophon.scene.interior)

/** a new pilot of the Nomarchy, with credits to spend (a save made before the page loads) */
async function newPilot(context) {
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}?net=off&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type('HANGAR')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon)
  // (credits to spend: a bounty written into his log, and the page loaded again)
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('xenophon/save/'))
    const save = JSON.parse(localStorage.getItem(key))
    save.property.log.push({ t: Date.now(), k: 'bounty', credits: 9000, what: 'test' })
    save.property.log.push({ t: Date.now(), k: 'bank', items: [{ id: 'magma-glass', n: 30 }, { id: 'silica', n: 30 }, { id: 'ferrite', n: 40 }], at: 'test' })
    localStorage.setItem(key, JSON.stringify(save))
  })
  await page.reload()
  await page.waitForFunction(() => window.__xenophon)
  await page.waitForTimeout(2500)
  return page
}

/** keys held for a time */
async function hold(page, keys, ms) {
  for (const k of keys) await page.keyboard.down(k)
  await page.waitForTimeout(ms)
  for (const k of keys) await page.keyboard.up(k)
}

// ── a laptop's screen
{
  const page = await newPilot(await browser.newContext({ viewport: { width: 1280, height: 720 } }))
  await shot(page, '1-landed')
  await page.getByRole('button', { name: 'Hangar', exact: true }).click()
  await page.waitForTimeout(600)
  await shot(page, '2-hangar')
  await walkToSpot(page, 'bench')
  await page.keyboard.press('f')
  await page.waitForTimeout(400)
  await shot(page, '3-bench')
  await page.getByRole('button', { name: /^Flak · / }).first().click()
  await page.getByRole('button', { name: 'Flak', exact: true }).first().click()
  await page.getByRole('button', { name: 'Flak', exact: true }).nth(1).click()
  await page.waitForTimeout(300)
  await shot(page, '4-bench-flak')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.waitForTimeout(400)
  await shot(page, '5-hangar-fitted')
  await walkToSpot(page, 'booth')
  await page.keyboard.press('f')
  await page.waitForTimeout(400)
  await page.getByRole('tab', { name: 'Pattern' }).click()
  await page.getByRole('button', { name: 'Racing stripes' }).click()
  await page.getByRole('tab', { name: 'Emblem' }).click()
  await page.getByRole('button', { name: 'skull', exact: true }).click()
  await page.waitForTimeout(300)
  await shot(page, '6-booth')
  await page.getByRole('button', { name: 'Close' }).click()
  await walkToSpot(page, 'deck')
  await page.keyboard.press('f')
  await page.waitForTimeout(500)
  await shot(page, '7-deck')
  await walkToSpot(page, 'shop')
  await page.keyboard.press('f')
  await page.waitForTimeout(400)
  await shot(page, '8-shop')
  await page.getByRole('tab', { name: 'Furniture' }).click()
  await page.getByRole('button', { name: /^Buy 140/ }).click()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByRole('button', { name: 'Leave' }).click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: 'Aboard', exact: true }).click()
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Furnish' }).click()
  await page.waitForTimeout(200)
  await shot(page, '9-furnish')
  await page.getByRole('button', { name: /^Berth/ }).click()
  await page.waitForTimeout(300)
  await shot(page, '10-aboard-placing')
  console.log('laptop:', await inside(page))
}

// ── a laptop's 1366 × 768: the whole hangar, the pilot standing by his ship (docs/art/gen/hangar-final.png)
{
  const page = await newPilot(await browser.newContext({ viewport: { width: 1366, height: 768 } }))
  await page.getByRole('button', { name: 'Hangar', exact: true }).click()
  await page.waitForTimeout(600)
  // (round to the left of his ship, a step from its wing, and turned to face the camera)
  await walkToTile(page, 12, 12)
  await hold(page, ['s'], 60)
  // (a tip that came up, closed: the picture is of the room)
  await page
    .locator('[data-prompt="tip"] button')
    .first()
    .click({ timeout: 500 })
    .catch(() => {})
  await page.waitForTimeout(1500)
  await shot(page, 'hangar-final')
}

await browser.close()
if (errors.length) {
  console.error('errors on the page:\n' + errors.join('\n'))
  process.exit(1)
}
