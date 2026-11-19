// Plays being on foot in a real browser, alone (?net=off), and writes screenshots: a new pilot
// made in the creator (Randomise, then Done), landed at his side's base; out of his ship with a
// tap of F; a walk with the keys; the sidearm fired where the mouse points; a beacon and a flare;
// back in. To look at after changing being on foot or its screens.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/walk.mjs out/ [http://localhost:5173/]
//
// Everything goes through the page as a player's keys and mouse would; it only reads
// how the pilot stands from window.__xenophon, which only development builds have.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'walk', base = 'http://localhost:5173/'] = process.argv.slice(2)
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
const foot = (page) => page.evaluate(() => window.__xenophon.scene.foot)

async function newPilot(context, name) {
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(`${base}?net=off&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type(name)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Fly for The Anarchoi/ }).click()
  await page.waitForTimeout(400)
  return page
}

// ── a laptop's screen
{
  const page = await newPilot(await browser.newContext({ viewport: { width: 1280, height: 720 } }), 'WALKER')
  await shot(page, '1-creator')
  await page.getByRole('button', { name: 'Randomise' }).click()
  await page.getByRole('button', { name: 'Next Face' }).click()
  await page.waitForTimeout(300)
  await shot(page, '2-creator-randomised')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon)
  await page.waitForTimeout(2500)
  await shot(page, '3-landed')
  // a tap of F: out
  await page.mouse.move(640, 300)
  await page.keyboard.press('KeyF')
  await page.waitForTimeout(900)
  await shot(page, '4-out')
  console.log('out', JSON.stringify(await foot(page)).slice(0, 160))
  // a walk with the keys: right and down, then running up
  await page.keyboard.down('KeyD')
  await page.keyboard.down('KeyS')
  await page.waitForTimeout(1500)
  await page.keyboard.up('KeyS')
  await shot(page, '5-walking')
  await page.keyboard.down('ShiftLeft')
  await page.keyboard.down('KeyW')
  await page.waitForTimeout(1200)
  await page.keyboard.up('KeyW')
  await page.keyboard.up('KeyD')
  await page.keyboard.up('ShiftLeft')
  // the sidearm, where the mouse points; a beacon and a flare
  await page.mouse.move(900, 200)
  await page.mouse.down()
  await page.waitForTimeout(600)
  await shot(page, '6-firing')
  await page.mouse.up()
  await page.keyboard.press('KeyV')
  await page.mouse.move(700, 400)
  await page.mouse.down({ button: 'right' })
  await page.waitForTimeout(120)
  await page.mouse.up({ button: 'right' })
  await page.waitForTimeout(900)
  await shot(page, '7-beacon-and-flare')
  console.log('walked', JSON.stringify(await foot(page)).slice(0, 160))
}

await browser.close()
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors on the page')
