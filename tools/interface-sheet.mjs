// The interface's sheets, to compare before and after (the polish pass, item 2): a new pilot's way in
// (the side's cards), then the screens a player sees most (the flight HUD, the base's screen, the galaxy
// map, the hangar's loadout bench, the settings) on one sheet, and the HUD in each place it is drawn
// (landed, flying, fighting, on foot, inside, in space) on another. Each picture is the whole page at the
// size asked for; the sheets are made by the browser itself.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/interface-sheet.mjs out/ [http://localhost:5173/]
//     → out/screens.png, out/hud.png and each picture alone
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'interface-sheet', base = 'http://localhost:5173/'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
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
const size = { width: 1366, height: 768 }
const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 })
const page = await context.newPage()
const shots = {}
async function shot(name, wait = 400) {
  await page.waitForTimeout(wait)
  const file = path.join(out, `${name}.png`)
  await page.screenshot({ path: file })
  shots[name] = file
  console.log(name)
}
const press = (loc) => loc.click()
const button = (name) =>
  page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .or(page.getByRole('tab', { name, exact: typeof name === 'string' }))
    .first()
const ready = () => page.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 30000 })
async function hold(key, ms) {
  await page.keyboard.down(key)
  await page.waitForTimeout(ms)
  await page.keyboard.up(key)
}
const inside = () => page.evaluate(() => window.__xenophon.scene.interior)
async function walkTo(x, y) {
  for (let i = 0; i < 40; i++) {
    const it = await inside()
    const dx = x - it.x
    const dy = y - it.y
    if (Math.hypot(dx, dy) < 4) return
    const keys = []
    if (dx > 2) keys.push('d')
    if (dx < -2) keys.push('a')
    if (dy > 2) keys.push('s')
    if (dy < -2) keys.push('w')
    for (const k of keys) await page.keyboard.down(k)
    await page.waitForTimeout(Math.min(400, (Math.max(Math.abs(dx), Math.abs(dy)) / 30) * 1000))
    for (const k of keys) await page.keyboard.up(k)
  }
}

// ── a new pilot's way in, to the side's cards
await page.goto(`${base}?net=off&tutorial=off`)
await page.waitForSelector('main button', { timeout: 30000 })
await press(button('Play'))
await page.keyboard.type('VESPER')
await press(button('Next'))
await page.mouse.move(4, 4)
await shot('side', 700)
await press(button(/Fly for The Nomarchy/))
await press(button('Done'))
await ready()

// ── a pilot with credits and ore in his vault, landed at his capital world's base
await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('xenophon/save/'))
  const save = JSON.parse(localStorage.getItem(key))
  save.property.log.push({ t: Date.now(), k: 'bounty', credits: 9000, what: 'test' })
  save.property.log.push({ t: Date.now(), k: 'bank', items: [{ id: 'ferrite', n: 40 }, { id: 'silica', n: 30 }], at: 'test' })
  save.played = 30
  save.tips = ['cruise', 'gate', 'hangar', 'shop', 'flag', 'squad', 'missile', 'roll', 'ambush', 'part']
  localStorage.setItem(key, JSON.stringify(save))
})
await page.goto(`${base}?net=off&world=w0&tutorial=off`)
await ready()
await page.mouse.move(size.width / 2, size.height * 0.3)
await shot('hud-landed', 3000)
await page.keyboard.press('Tab')
await shot('base', 600)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await shot('settings-menu', 300)
await press(button('Settings'))
await shot('settings', 600)
await press(button('Close'))
await page.waitForTimeout(300)
if (await page.locator('section[aria-label="Menu"]').count()) await press(button('Close'))

// ── off the pad and flying; then a raider to fight
await hold('f', 900)
await page.mouse.move(size.width / 2, size.height * 0.2)
await shot('hud-flying', 3000)
await page.evaluate(() => {
  const s = window.__xenophon.scene
  const p = s.player
  const a = p.heading
  s.addShip({ x: p.x + Math.sin(a) * 110, y: p.y - Math.cos(a) * 110, height: p.height, heading: a, speed: 30, hull: 'corsair', side: 1, pilot: 1 })
})
await page.keyboard.down('j')
await shot('hud-fighting', 900)
await page.keyboard.up('j')

// ── the maps: the galaxy
await page.keyboard.press('m')
await page.waitForTimeout(500)
await press(button('Galaxy'))
await page.waitForTimeout(500)
// (a tooltip: a system's danger and holders, under the pointer)
await page
  .locator('section[aria-label="Maps"] svg [role="button"]')
  .nth(6)
  .hover()
  .catch(() => {})
await shot('galaxy', 800)
await page.keyboard.press('Escape')

// ── the hangar, its loadout bench; out on foot
await page.goto(`${base}?net=off&world=w0&tutorial=off`)
await ready()
await page.waitForTimeout(2500)
await press(button('Hangar'))
await page.waitForTimeout(700)
await shot('hud-inside', 300)
await walkTo(40, 70)
await walkTo(32, 40)
await page.keyboard.press('f')
await page.waitForTimeout(500)
// (a tooltip: what a part gives and costs)
await page
  .locator('section[aria-label="Loadout bench"] button.item')
  .nth(1)
  .hover()
  .catch(() => {})
await shot('bench', 800)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
await press(button('Leave'))
await page.waitForTimeout(600)
await page.keyboard.press('f')
await shot('hud-foot', 1800)

// ── space, over the home world
await page.goto(`${base}?net=off&world=s0&tutorial=off`)
await ready()
await page.mouse.move(size.width / 2, size.height * 0.2)
await shot('hud-space', 4000)

// ── the sheets, laid out by the browser
async function sheet(name, names, cols) {
  const scale = 0.5
  const w = Math.round(size.width * scale)
  const h = Math.round(size.height * scale)
  const cells = names
    .filter((n) => shots[n])
    .map(
      (n) =>
        `<figure><img src="data:image/png;base64,${fs.readFileSync(shots[n]).toString('base64')}" width="${w}" height="${h}"><figcaption>${n}</figcaption></figure>`,
    )
    .join('')
  const rows = Math.ceil(names.length / cols)
  await page.setViewportSize({ width: cols * (w + 12) + 12, height: rows * (h + 40) + 12 })
  await page.setContent(
    `<style>body{margin:0;padding:6px;background:#1c1f2b;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:12px 12px;font:16px monospace;color:#ddd}figure{margin:0}img{display:block}figcaption{padding:4px 0}</style>${cells}`,
  )
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true })
  console.log(`${name}.png`)
}
await sheet('screens', ['side', 'hud-flying', 'base', 'galaxy', 'bench', 'settings'], 3)
await sheet('hud', ['hud-landed', 'hud-flying', 'hud-fighting', 'hud-foot', 'hud-inside', 'hud-space'], 3)
await browser.close()
