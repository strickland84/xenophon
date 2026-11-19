// Plays the persistent world in a real browser, alone (?net=off), and writes screenshots. Before the
// page opens, its archive is seeded with a week of war made here (flags of both sides on their fronts,
// two worlds named, and on the Nomarchy's capital world a wreck, a grave, a beacon and a ghost), all
// signed with throwaway keys in the development namespace; then a few pilots' presence is fed to it.
// A new Nomarchy pilot comes in (the sides' cards), flies, and the tool opens the galaxy map and a
// world's card, the faction board, chat with the quick-chat wheel, the beacon's wheel on foot, the
// pilots nearby, and the menu's relays. To look at after changing the persistent world's screens.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   npx jiti tools/factions.ts out/ [http://localhost:5173/]
//
// Nothing here goes to a relay: the page is offline, and the events exist only in its storage.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'
import type { Page } from 'playwright-core'
import { createScene, DEFAULT_PARAMS, discoveryNames, homeWorld, theGalaxy, worldSettings } from '../src/lib/engine'
import type { Side } from '../src/lib/engine'
import { namespaceOf, signDeed, signPresence } from '../src/lib/net/events'
import type { Deed } from '../src/lib/net/events'
import { newSecretKey, publicKeyOf } from '../src/lib/net/nostr'
import type { NostrEvent } from '../src/lib/net/nostr'

const [out = 'factions-shots', base = 'http://localhost:5173/'] = process.argv.slice(2)
// fs.mkdirSync(out, { recursive: true })
const NS = namespaceOf(true)
const g = theGalaxy()
const now = Math.floor(Date.now() / 1000)

// ── a week of war, signed by throwaway pilots
const pilots: Record<string, { secret: string; side: Side }> = {}
for (const [name, side] of [
  ['AURELIA', 'nomarchy'],
  ['KESTREL', 'nomarchy'],
  ['MERIDIAN', 'nomarchy'],
  ['RUSTWATER', 'anarchoi'],
  ['MOTHWING', 'anarchoi'],
  ['SPORE', 'anarchoi'],
] as [string, Side][])
  pilots[name] = { secret: newSecretKey(), side }
const events: NostrEvent[] = []
const deed = async (who: string, d: Omit<Deed, 'side' | 'callsign'>, hoursAgo: number) =>
  events.push(await signDeed(pilots[who].secret, { ...d, side: pilots[who].side, callsign: who }, now - Math.round(hoursAgo * 3600), NS))
const homeOf = (s: Side) => g.systems.findIndex((x) => x.side === s)
const near = (s: number) => g.lanes.filter((l) => l.a === s || l.b === s).map((l) => (l.a === s ? l.b : l.a))
const habitable = (s: number) => g.worlds.filter((w) => w.habitable && w.system === s).map((w) => w.id)
// the Nomarchy on its two neighbours, and one beyond; the Anarchoi on its two and one beyond
const nomarchyFront = near(homeOf('nomarchy')).flatMap(habitable).slice(0, 5)
const anarchoiFront = near(homeOf('anarchoi')).flatMap(habitable).slice(0, 4)
let h = 140
for (const [i, w] of nomarchyFront.entries()) await deed(['AURELIA', 'KESTREL', 'MERIDIAN'][i % 3], { kind: 'flag', world: w, x: 0, y: 0, z: 0, n: 0 }, (h -= 9))
for (const [i, w] of anarchoiFront.entries()) await deed(['RUSTWATER', 'MOTHWING', 'SPORE'][i % 3], { kind: 'flag', world: w, x: 0, y: 0, z: 0, n: 0 }, (h -= 7))
// a contest on the Nomarchy's nearest world: the Anarchoi came over the next day
await deed('RUSTWATER', { kind: 'kill', world: nomarchyFront[0], x: 0, y: 0, z: 0, n: 1 }, 30)
await deed('MOTHWING', { kind: 'deliver', world: nomarchyFront[1], x: 0, y: 0, z: 0, n: 40 }, 20)
// two worlds named by the first to land
for (const [who, w] of [
  ['KESTREL', nomarchyFront[2]],
  ['SPORE', anarchoiFront[1]],
] as [string, string][])
  await deed(who, { kind: 'name', world: w, x: 0, y: 0, z: 0, n: 0, name: discoveryNames(w, publicKeyOf(pilots[who].secret), pilots[who].side)[0] }, 50)
// on the Nomarchy's capital world, by its base: a wreck, a grave, a beacon, and a ghost's run overhead
const capital = homeWorld('nomarchy').id
// (beside the capital's pad, where a new pilot starts)
const probe = createScene({ ...DEFAULT_PARAMS, ...worldSettings(capital), side: 'nomarchy', intro: false })
const at = { x: probe.player.x, y: probe.player.y }
await deed('RUSTWATER', { kind: 'wreck', world: capital, x: at.x + 70, y: at.y + 40, z: 0, n: 6, hull: 'lance' }, 5)
await deed('AURELIA', { kind: 'grave', world: capital, x: at.x + 40, y: at.y + 60, z: 0, n: 0 }, 9)
await deed('KESTREL', { kind: 'beacon', world: capital, x: at.x - 50, y: at.y + 45, z: 0, n: 1 }, 3)
const path_: number[] = []
for (let i = 0; i < 100; i++) path_.push(at.x - 250 + i * 6, at.y - 80 + Math.sin(i / 8) * 40, 70 + Math.sin(i / 11) * 20, Math.PI / 2 - Math.cos(i / 8) * 0.4)
await deed('MERIDIAN', { kind: 'ghost', world: capital, x: path_[0], y: path_[1], z: path_[2], n: 0, hull: 'corsair', path: path_ }, 1)
const presence = await Promise.all(
  Object.entries(pilots).map(([name, p], i) =>
    signPresence(p.secret, { side: p.side, zone: i < 3 ? nomarchyFront[i] : anarchoiFront[i - 3], bounty: name === 'RUSTWATER' ? 160 : 0, callsign: name, rank: i % 6 }, now - 20, NS),
  ),
)

// ── the browser
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
const errors: string[] = []
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(out, `${name}.png`) })
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** a step that may fail: it is reported, and the rest go on */
async function step(label: string, what: string, run: () => Promise<unknown>) {
  try {
    await run()
  } catch (err) {
    errors.push(`${label}, ${what}: ${String(err).split('\n')[0]}`)
  }
}

async function play(label: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 })
  await context.addInitScript(
    ([key, list]) => {
      if (!localStorage.getItem(key as string)) localStorage.setItem(key as string, list as string)
    },
    [`xenophon/events/${NS}/main`, JSON.stringify(events)],
  )
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(`${label}: ${String(e)}`))
  await page.goto(`${base}?net=off&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type('TESTPILOT')
  await page.getByRole('button', { name: 'Next' }).click()
  await wait(500)
  await shot(page, `${label}-sides`)
  await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await page.getByRole('button', { name: /Done|Fly/ }).last().click()
  await wait(3000)
  // a few pilots' presence, as the relays would bring it
  await page.evaluate((list) => {
    const c = (window as unknown as { __xenophon: { chronicle: { hearPresence(e: unknown): Promise<void> } } }).__xenophon.chronicle
    for (const e of list) void c.hearPresence(e)
  }, presence)
  await wait(2500)
  await shot(page, `${label}-sky`)
  const open = async (key: string) => {
    // (a key pressed on a button is the button's: back to the game first, as a player would)
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.keyboard.press(key)
    await wait(600)
  }
  // the maps: the galaxy, and a world's card
  await open('m')
  await page.getByRole('tab', { name: 'Galaxy' }).click()
  await wait(500)
  await shot(page, `${label}-galaxy`)
  await step(label, 'a world\'s card', async () => {
    // (an SVG mark's box takes in its label, so its middle can fall on a neighbour's: the click goes to it as a tap would)
    await page.getByRole('button', { name: g.systems[near(homeOf('nomarchy'))[0]].name }).click({ timeout: 4000, force: true })
    await wait(300)
    await shot(page, `${label}-galaxy-picked`)
    await page.getByRole('button', { name: 'Look in' }).click({ timeout: 4000 })
    await wait(300)
    const w = g.worlds.find((x) => x.id === nomarchyFront[0])!
    await page.getByRole('button', { name: w.name, exact: true }).first().click({ timeout: 4000, force: true })
    await wait(400)
    await shot(page, `${label}-card`)
  })
  await page.getByRole('button', { name: 'Close' }).first().click()
  // the faction board, from the menu
  await open('Escape')
  await page.getByRole('button', { name: 'Faction board' }).click()
  await wait(500)
  await shot(page, `${label}-board`)
  await page.getByRole('button', { name: 'Close' }).first().click()
  // chat, and the quick-chat wheel (a phrase picked by its number)
  await step(label, 'chat', async () => {
    await open('Enter')
    await page.getByRole('button', { name: 'Quick' }).click({ timeout: 4000 })
    await wait(400)
    await shot(page, `${label}-quick`)
    await page.keyboard.press('1')
    await wait(600)
    await shot(page, `${label}-said`)
  })
  // pilots nearby, and the relays, from the menu
  await step(label, 'pilots nearby', async () => {
    await open('Escape')
    await page.getByRole('button', { name: 'Pilots nearby' }).click({ timeout: 4000 })
    await wait(400)
    await shot(page, `${label}-nearby`)
    await page.getByRole('button', { name: 'Close' }).first().click({ timeout: 4000 })
  })
  await step(label, 'the menu', async () => {
    await open('Escape')
    await page.getByRole('heading', { name: /memory/i }).scrollIntoViewIfNeeded({ timeout: 4000 })
    await shot(page, `${label}-menu`)
  })
  await page.keyboard.press('Escape')
  await context.close()
}

await play('laptop', { width: 1280, height: 720 })
await browser.close()
console.log(errors.length ? `errors:\n${errors.join('\n')}` : 'no errors on the page')
console.log(`screenshots in ${out}`)
