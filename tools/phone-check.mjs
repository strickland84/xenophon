// Every screen of the game on a phone held sideways (844 by 390, touch), each looked at and checked:
// the page never scrolls sideways; every button the player can see sits inside the screen (or inside
// a panel that scrolls to it), is large enough for a thumb, and is not covered by another; no text a
// player reads is under the interface's smallest size (21 px, layout.css); and a screenshot of each to
// look at, with a count of the things and the words on it (report.json). With --laptop it walks the
// same screens at 1366 by 768 with the mouse and keys instead. It walks: the first screens, the first sortie's prompt and its
// end, flying with the touch buttons, the base's screen, the menu and everything it opens (the
// maps, the faction board, pilots nearby, the pilot sheet, the squad, the settings and each tab, the
// reminder to keep the pilot safe), chat and the quick-chat wheel, the hangar and its bench and
// booth, the deck and its shop, a ship's rooms and Furnish, on foot and the beacon's wheel.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/phone-check.mjs out/ [http://localhost:5173/] [--laptop]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { walkToSpot } from './inside-walk.mjs'

const laptop = process.argv.includes('--laptop')
const [out = 'phone-check', base = 'http://localhost:5173/'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
/** the smallest text a player reads, in CSS px (layout.css --t-label) */
const SMALLEST = 21
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
const context = await browser.newContext(
  laptop
    ? { viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 }
    : { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
)
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const report = []

/** looks at the screen: a screenshot, and the checks; `scope` limits the buttons checked to an open panel's */
async function check(name, scope = null) {
  await page.waitForTimeout(350)
  // (a screen opened from inside comes up on the page's next look at the scene)
  if (scope) await page.waitForSelector(scope, { timeout: 2500 }).catch(() => {})
  await page.screenshot({ path: path.join(out, `${String(report.length + 1).padStart(2, '0')}-${name}.png`) })
  const { problems, things, words } = await page.evaluate(([scope, SMALLEST]) => {
    const found = []
    const W = innerWidth
    const H = innerHeight
    if (document.documentElement.scrollWidth > W + 1) found.push(`the page scrolls sideways (${document.documentElement.scrollWidth} px)`)
    const root = scope ? document.querySelector(scope) : document.body
    if (!root) return { problems: [`no ${scope}`], things: 0, words: 0 }
    const scrolls = (el, axis = 'Y') => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (axis === 'Y' && /(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return true
        if (axis === 'X' && /(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true
      }
      return false
    }
    /** whether a point of the element is scrolled out of sight inside a panel that scrolls (then nothing covers it: it is not there) */
    const scrolledAway = (el, x, y) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (!/(auto|scroll|hidden)/.test(s.overflowY + s.overflowX)) continue
        const r = p.getBoundingClientRect()
        if (x < r.left || x > r.right || y < r.top || y > r.bottom) return true
      }
      return false
    }
    for (const b of root.querySelectorAll('button, a[href], input, textarea')) {
      const r = b.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || getComputedStyle(b).visibility === 'hidden') continue
      const name = (b.getAttribute('aria-label') || b.textContent || b.tagName).trim().replace(/\s+/g, ' ').slice(0, 28)
      if ((r.left < -1 || r.right > W + 1) && !scrolls(b, 'X')) found.push(`"${name}" runs off the side (${Math.round(r.left)}..${Math.round(r.right)})`)
      if ((r.top < -1 || r.bottom > H + 1) && !scrolls(b)) found.push(`"${name}" is off the screen and nothing scrolls to it`)
      if (b.tagName === 'BUTTON' && r.height < 24) found.push(`"${name}" is only ${Math.round(r.height)} px tall`)
      // (on the screen: is it the one a finger at its middle would press?)
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      if (cx >= 0 && cy >= 0 && cx < W && cy < H && !scrolledAway(b, cx, cy)) {
        const top = document.elementFromPoint(cx, cy)
        if (top && top !== b && !b.contains(top) && !top.contains(b)) {
          const by = (top.getAttribute('aria-label') || top.textContent || top.tagName).trim().replace(/\s+/g, ' ').slice(0, 24)
          found.push(`"${name}" is covered by "${by}"`)
        }
      }
    }
    // what is on the screen at once: the things (controls, pictures, lines of text not in a control) and the words
    const shown = (el) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0 || r.bottom < 0 || r.right < 0 || r.top > H || r.left > W) return false
      for (let p = el; p; p = p.parentElement) {
        const s = getComputedStyle(p)
        if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
      }
      return true
    }
    let things = 0
    let words = 0
    const small = new Set()
    for (const el of root.querySelectorAll('button, input, textarea, select, img, svg, canvas')) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue
      // (a picture inside a control is part of it, not a thing of its own)
      if (/^(img|svg|canvas)$/i.test(el.tagName) && el.parentElement?.closest('button, a[href]')) continue
      if (el.tagName === 'CANVAS' && !scope) continue
      if (shown(el)) things++
    }
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
    const lines = new Set()
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      const t = n.textContent.trim()
      const el = n.parentElement
      if (!t || !el || !shown(el)) continue
      words += t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length
      if (!el.closest('button, svg') || el.closest('svg')) lines.add(el.closest('svg') ? n : el)
      const size = parseFloat(getComputedStyle(el).fontSize)
      if (size < SMALLEST - 0.5 && /[\p{L}\p{N}]/u.test(t)) small.add(`${t.slice(0, 18)} (${Math.round(size)})`)
    }
    things += lines.size
    if (small.size) found.push(`${small.size} bits of text under ${SMALLEST} px: ${[...small].slice(0, 4).join(', ')}`)
    return { problems: found, things, words }
  }, [scope, SMALLEST])
  report.push({ name, problems, things, words })
  console.log(`${name} (${things} things, ${words} words): ${problems.length ? problems.join('; ') : 'fits'}`)
}

const tap = (loc) => (laptop ? loc.click() : loc.tap())
const button = (name) =>
  page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .or(page.getByRole('tab', { name, exact: typeof name === 'string' }))
    .first()
/** a touch button pressed as a finger would (its own pointer events) */
const KEYS = { Bag: 'Tab', Menu: 'Escape', Chat: 'Enter', Action: 'f', Fire: 'j', View: 'v', Beacon: 'v', Power: 'p' }
async function thumb(label, ms = 0) {
  if (laptop) {
    await page.mouse.move(683, 300)
    if (ms) {
      await page.keyboard.down(KEYS[label])
      await page.waitForTimeout(ms)
      await page.keyboard.up(KEYS[label])
    } else await page.keyboard.press(KEYS[label])
    return
  }
  let b = page.getByRole('button', { name: new RegExp(`^${label}(: hold)?$`) }).first()
  // (what is not always on the screen is under More, as a player finds it)
  if (!(await b.count())) {
    await page.getByRole('button', { name: 'More', exact: true }).first().dispatchEvent('click')
    await page.waitForTimeout(250)
    b = page.getByRole('button', { name: new RegExp(`^${label}(: hold)?$`) }).first()
  }
  await b.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch' })
  if (ms) await page.waitForTimeout(ms)
  await b.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch' })
  if (!ms) await b.dispatchEvent('click')
}
const inside = () => page.evaluate(() => window.__xenophon.scene.interior)
// ── the first screens
await page.goto(`${base}?net=off&intro=off`)
await page.waitForSelector('main button', { timeout: 30000 })
await check('title')
await tap(button('Settings'))
await check('settings-controls', 'section[aria-label="Settings"]')
for (const t of ['Sound', 'Picture', 'Your key', 'Relays']) {
  await tap(button(t))
  await check(`settings-${t.toLowerCase().replace(' ', '-')}`, 'section[aria-label="Settings"]')
}
await tap(button('Picture'))
await tap(button('Larger'))
await check('settings-larger-text', 'section[aria-label="Settings"]')
await tap(button('Normal'))
await tap(button('Close'))
await tap(button(/Restore/))
await check('restore')
await tap(button('Back'))
await tap(button('Play'))
await check('callsign')
await page.keyboard.type('THUMBS')
await tap(button('Next'))
await check('side')
await tap(button(/Fly for The Nomarchy/))
await check('pilot-creator')
await tap(button('Done'))
await page.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
await page.waitForTimeout(6000)
await check('first-sortie-prompt')
await tap(button('End the first sortie'))
await page.waitForTimeout(800)
await check('first-sortie-over-galaxy-map', 'section[aria-label="Maps"]')
await tap(button('Close'))

// ── a pilot with credits and ore in his vault, landed at his capital world's base
await page.evaluate(() => {
  const key = Object.keys(localStorage).find((k) => k.startsWith('xenophon/save/'))
  const save = JSON.parse(localStorage.getItem(key))
  save.property.log.push({ t: Date.now(), k: 'bounty', credits: 9000, what: 'test' })
  save.property.log.push({ t: Date.now(), k: 'bank', items: [{ id: 'ferrite', n: 40 }, { id: 'silica', n: 30 }], at: 'test' })
  save.played = 30
  localStorage.setItem(key, JSON.stringify(save))
})
await page.goto(`${base}?net=off&intro=off&world=w0`)
await page.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
await page.waitForTimeout(3000)
await check('landed-at-a-base')
await thumb('Bag')
await check('base-screen', 'section[aria-label="Base"]')
for (const t of ['Market', 'Supplies']) {
  const b = button(new RegExp(`^${t}`))
  if (await b.count()) {
    await tap(b.first())
    await check(`base-${t.toLowerCase()}`, 'section[aria-label="Base"]')
  }
}
await tap(button('Close'))

// ── the menu and what it opens
await thumb('Menu')
await check('menu', 'section[aria-label="Menu"]')
for (const [label, name, scope] of [
  ['The maps', 'maps-system', 'section[aria-label="Maps"]'],
  ['Faction board', 'faction-board', '[aria-label="Faction board"]'],
  ['Pilots nearby', 'pilots-nearby', '[aria-label="Pilots nearby"]'],
  ['Pilot sheet', 'pilot-sheet', 'section[aria-label="Pilot sheet"]'],
  ['Squad', 'squad', 'section[aria-label="Squad"]'],
  ['Pilot file', 'pilot-file', 'section[aria-label="Menu"]'],
  ['Keep him safe', 'keep-him-safe', '[aria-label="Keep your pilot safe"]'],
  ['Settings', 'settings-from-the-menu', 'section[aria-label="Settings"]'],
]) {
  if (!(await page.locator('section[aria-label="Menu"]').count())) await thumb('Menu')
  // (a screen this build does not have: left out)
  if (!(await button(label === 'Pilot file' ? /^Pilot file/ : label).count()) && label !== 'Keep him safe') continue
  // (keeping him safe is on the menu's Pilot file tab)
  // (the tab says so when he is not kept safe yet: "Pilot file !")
  if (label === 'Keep him safe' && !(await page.getByRole('button', { name: label }).count())) await tap(button(/^Pilot file/))
  await tap(button(label === 'Pilot file' ? /^Pilot file/ : label))
  await check(name, scope)
  if (name === 'maps-system') {
    await tap(button('Galaxy'))
    await check('maps-galaxy', scope)
    await tap(page.locator('section[aria-label="Maps"] svg [role="button"], section[aria-label="Maps"] svg button').first()).catch(() => {})
    await check('maps-galaxy-card', scope)
  }
  const close = page.getByRole('button', { name: /^(Close|Later)$/ })
  if (await close.count()) await tap(close.first())
  await page.waitForTimeout(200)
}
// (the menu may still be open under what was closed)
if (await page.locator('section[aria-label="Menu"]').count()) await tap(button('Close'))

// ── chat and the wheel
await thumb('Chat')
await check('chat', '[aria-label="Chat"]')
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// ── flying: the ship's power (it waits switched off), then off the pad, with Dive and Climb
await check('powered-off')
await thumb('Power')
await page.waitForTimeout(2300)
await thumb('Action', 900)
await page.waitForTimeout(2500)
await check('flying')
await thumb('Fire', 600)
await check('firing')
await thumb('View')
await page.waitForTimeout(1600)
await check('flying-chase-view')
await thumb('View')
await page.waitForTimeout(400)
await thumb('View')
await page.waitForTimeout(1600)

// ── the hangar, its bench and booth; the deck and its shop; aboard and Furnish
await page.goto(`${base}?net=off&intro=off&world=w0`)
await page.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
await page.waitForTimeout(3000)
await tap(button('Hangar'))
await page.waitForTimeout(700)
await check('hangar')
await walkToSpot(page, 'bench')
await page.keyboard.press('f')
await check('loadout-bench', 'section[aria-label="Loadout bench"]')
await tap(button('Close'))
await walkToSpot(page, 'booth')
await page.keyboard.press('f')
await check('paint-booth', 'section[aria-label="Paint booth"]')
await tap(button('Close'))
await walkToSpot(page, 'deck')
await page.keyboard.press('f')
await page.waitForTimeout(600)
await check('deck')
await walkToSpot(page, 'shop')
await page.keyboard.press('f')
await check('shop', 'section[aria-label="Shop"]')
for (const t of ['Gear', 'Furniture']) {
  await tap(button(t))
  await check(`shop-${t.toLowerCase()}`, 'section[aria-label="Shop"]')
}
await tap(button('Close'))
await tap(button('Leave'))
await page.waitForTimeout(400)
await tap(button('Aboard'))
await page.waitForTimeout(600)
await check('aboard')
await tap(button('Furnish'))
await check('furnish', 'section[aria-label="Furnish"]')
await tap(button('Close'))
await tap(button('Leave'))
await page.waitForTimeout(400)

// ── on foot: out of the ship, and the beacon's wheel
await thumb('Action')
await page.waitForTimeout(1500)
await check('on-foot')
await thumb('Beacon')
await check('beacon-wheel', 'section[aria-label="Your beacon says"]')
await page.keyboard.press('Escape')

await browser.close()
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1))
const bad = report.filter((r) => r.problems.length)
console.log(`\n${report.length} screens looked at, ${bad.length} with something to fix`)
if (errors.length) console.log('errors on the page:\n' + errors.join('\n'))
