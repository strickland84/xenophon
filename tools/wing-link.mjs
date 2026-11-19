// The wing link, end to end in a browser this tool starts itself: a pilot makes a link from the menu, a friend opens it
// in another tab, gives a callsign and no more, and must come out flying on the first pilot's wing, in his squad, in a
// few seconds. Two tabs of one browser, talking as tabs do (?net=local): no relays. Screenshots of both go to the
// folder given. Run it after changing net/wing.ts, Game.svelte's wingLook or Scene.flyBeside.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/wing-link.mjs out/ [http://localhost:5173/]
//
// It uses the Chromium that Playwright keeps in ~/.cache/ms-playwright (CHROME=… for another), launched here, headless:
// it never attaches to a browser that is already running.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'wing-link', base = 'http://localhost:5173/'] = process.argv.slice(2)
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
const room = 'wing' + Math.floor(Math.random() * 1e9).toString(36)
const t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 's'
const say = (...a) => console.log(stamp(), ...a)
const fail = (why) => {
  console.error('FAILED:', why)
  process.exitCode = 1
}

const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const context = await browser.newContext({ viewport: { width: 960, height: 540 } })
const errors = []
const open = async () => {
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e)))
  return page
}
const where = (page) =>
  page.evaluate(() => {
    const b = window.__xenophon
    const s = b.scene
    const p = s.player
    const n = b.state()
    return {
      zone: s.zone.key,
      stage: s.loop.stage,
      x: p.x,
      y: p.y,
      z: p.height,
      heading: p.heading,
      protect: s.status.protect,
      pilots: n.on ? n.pilots.map((x) => x.callsign) : [],
      squad: b.net().squad().keys.length,
    }
  })

try {
  // ── ACE: through the first screens, off the pad, and a link from the menu
  const a = await open()
  await a.goto(`${base}?net=local&room=${room}&tutorial=off`)
  await a.getByRole('button', { name: 'Play' }).click()
  await a.keyboard.type('ACE')
  await a.getByRole('button', { name: 'Next' }).click()
  await a.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await a.getByRole('button', { name: 'Done' }).click()
  await a.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
  await a.waitForTimeout(1500)
  // (power up, and Land held: off the pad)
  await a.keyboard.press('p')
  await a.waitForTimeout(2600)
  await a.keyboard.down('f')
  await a.waitForFunction(() => window.__xenophon.scene.loop.stage === 'flying', null, { timeout: 15000 })
  await a.keyboard.up('f')
  await a.waitForTimeout(1500)
  say('ACE is flying:', JSON.stringify(await where(a)))
  await a.keyboard.press('Escape')
  await a.getByRole('button', { name: /Invite/ }).first().click()
  const link = await a.getByLabel('The link to send').inputValue()
  say('the link:', link)
  await a.screenshot({ path: path.join(out, '1-the-link.png') })
  await a.getByRole('button', { name: 'Close' }).first().click()
  if (!/[?&]wing=[0-9a-f]{16}\.w\d+\.c\.ACE/.test(link) || !link.includes('net=local') || !link.includes(`room=${room}`)) fail('the link is not as it should be')

  // ── NOVA: opens it in another tab, as a second pilot of this browser; a callsign, and in
  const b = await open()
  const began = Date.now()
  await b.goto(`${link}&pilot=2`)
  await b.getByLabel('Your callsign').waitFor({ timeout: 20000 })
  await b.screenshot({ path: path.join(out, '2-asked-for-a-callsign.png') })
  const note = await b.getByRole('status').first().innerText()
  say('NOVA is told:', note)
  await b.keyboard.type('NOVA')
  await b.getByRole('button', { name: 'Fly', exact: true }).click()
  await b.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
  // on his wing: flying, close by him, in his squad
  let on = null
  for (let i = 0; i < 120 && !on; i++) {
    await b.waitForTimeout(500)
    const [pa, pb] = [await where(a), await where(b)]
    const d = Math.hypot(pa.x - pb.x, pa.y - pb.y)
    if (pb.stage === 'flying' && pb.zone === pa.zone && d < 160 && pb.squad > 0 && pa.squad > 0) on = { d, pa, pb }
  }
  if (!on) {
    fail('NOVA did not come onto ACE’s wing in a minute')
    say('ACE:', JSON.stringify(await where(a)))
    say('NOVA:', JSON.stringify(await where(b)))
  } else {
    say(`NOVA is on ACE’s wing ${((Date.now() - began) / 1000).toFixed(1)} s after opening the link: ${on.d.toFixed(0)} px from him, protected ${on.pb.protect.toFixed(1)} s, both in a squad`)
    say('ACE:', JSON.stringify(on.pa))
    say('NOVA:', JSON.stringify(on.pb))
  }
  await b.waitForTimeout(1200)
  await a.screenshot({ path: path.join(out, '3-ace-sees-nova.png') })
  await b.screenshot({ path: path.join(out, '4-nova-on-the-wing.png') })
  if (/[?&]wing=/.test(b.url())) fail('the wing is still in NOVA’s address: a reload would be another arrival')
  if (errors.length) fail(`page errors: ${errors.join(' | ')}`)
} finally {
  await browser.close()
}
console.log(process.exitCode ? 'the wing link FAILED' : 'the wing link works')
