// The art director's audit (polish step 8): every distinct screen and place of the game as a player at a laptop sees
// it (1366 by 768), each a picture, to be laid out into contact sheets (uv run tools/audit-sheets.py) and judged with
// one eye: the first screens, the first sortie, flight over each of the nine kinds of world in each of the three views,
// weather, a fight, a base and its screen, on foot, the places inside, space by each kind of body in each view, the way
// down and up, a station, the maps, the menu and every panel.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/audit.mjs out/ [group ...] [--url=http://localhost:5173/]
//
// groups: first tutorial worlds weather fight base foot inside space travel maps menus (all of them if none is named).
// Getting somewhere is helped along (Scene.placePlayer, the address's world); what is shown is the real page. It reads
// and steers the scene through window.__xenophon (development and playtest builds only).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2)
const flag = (name, or) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? or
const base = flag('url', 'http://localhost:5173/')
const [out = 'audit', ...wanted] = args.filter((a) => !a.startsWith('--'))
const ALL = ['first', 'tutorial', 'worlds', 'weather', 'fight', 'base', 'foot', 'inside', 'space', 'travel', 'maps', 'menus']
const groups = wanted.length ? wanted : ALL
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
const made = []
const errors = []

async function newPage() {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 })
  const page = await context.newPage()
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)))
  return { context, page }
}
const { context, page } = await newPage()
const wait = (ms) => page.waitForTimeout(ms)
const S = (fn, arg) => page.evaluate(fn, arg)
const press = (loc) => loc.click()
const button = (name) =>
  page
    .getByRole('button', { name, exact: typeof name === 'string' })
    .or(page.getByRole('tab', { name, exact: typeof name === 'string' }))
    .first()
async function shot(group, name, ms = 500) {
  await wait(ms)
  const file = path.join(out, `${group}-${name}.png`)
  await page.screenshot({ path: file })
  made.push(file)
  console.log(`${group}-${name}`)
}
async function tryShot(group, name, fn) {
  try {
    await fn()
  } catch (e) {
    console.log(`  (${group}-${name}: ${String(e.message ?? e).split('\n')[0].slice(0, 160)})`)
  }
}
const until = async (fn, ms = 30000, arg) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await S(fn, arg).catch(() => false)) return true
    await wait(150)
  }
  return false
}
/** a fresh pilot of the Nomarchy (the first screens, shot if asked), then credits, ore and the tips already seen */
async function newPilot(p, shots) {
  await p.goto(`${base}?net=off&tutorial=off`)
  await p.waitForSelector('main button', { timeout: 30000 })
  await p.mouse.move(2, 2)
  if (shots) await shot('first', 'title', 1500)
  await p.getByRole('button', { name: 'Play' }).click()
  if (shots) await shot('first', 'callsign', 600)
  await p.keyboard.type('VESPER')
  await p.getByRole('button', { name: 'Next' }).click()
  await p.mouse.move(2, 2)
  if (shots) await shot('first', 'side', 1200)
  await p.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  if (shots) await shot('first', 'creator', 900)
  await p.getByRole('button', { name: 'Done' }).click()
  await p.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 40000 })
  await p.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith('xenophon/save/'))
    const save = JSON.parse(localStorage.getItem(key))
    save.property.log.push({ t: Date.now(), k: 'bounty', credits: 9000, what: 'audit' })
    save.property.log.push({ t: Date.now(), k: 'bank', items: [{ id: 'ferrite', n: 40 }, { id: 'silica', n: 30 }], at: 'audit' })
    save.played = 30
    save.tips = ['cruise', 'gate', 'hangar', 'shop', 'flag', 'squad', 'missile', 'roll', 'ambush', 'part', 'inside', 'deck', 'bench']
    save.backup = { ...save.backup, at: Date.now(), how: 'file' }
    localStorage.setItem(key, JSON.stringify(save))
  })
}
/** to a world or a system's space by the address, ready */
async function goTo(where, more = '') {
  await page.goto(`${base}?net=off&tutorial=off&world=${where}${more}`)
  await page.waitForFunction((w) => window.__xenophon?.scene?.zone?.key === w, where, { timeout: 60000 })
  await wait(1500)
  await page.mouse.move(size.width / 2, size.height * 0.3)
}
/** to a view by its key, as a player changes it (the page follows: its help moves clear of the cockpit's panel) */
async function view(v) {
  const want = ['top', 'chase', 'cockpit'].indexOf(v)
  for (let i = 0; i < 3 && (await S(() => window.__xenophon.inner().rig.target)) !== want; i++) {
    await page.keyboard.press('KeyV')
    await wait(120)
  }
}
const controls = (c) => S((c) => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...c }), c)
async function lift() {
  if ((await S(() => window.__xenophon.scene.loop.stage)) !== 'landed') return
  await controls({ land: true })
  await until(() => window.__xenophon.scene.loop.stage === 'flying', 8000)
  await controls({})
}
/** near the nearest body of a kind, `k` of its size from its middle */
const near = (kind, k = 1.6, heading = -Math.PI / 2) =>
  S(
    ([kind, k, heading]) => {
      const s = window.__xenophon.scene
      const me = s.player
      const b = s.bodies().filter((x) => x.kind === kind)
      b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
      if (!b[0]) return false
      s.placePlayer(b[0].x + b[0].size * k, b[0].y, heading)
      return true
    },
    [kind, k, heading],
  )
const VIEWS = ['top', 'chase', 'cockpit']

await newPilot(page, groups.includes('first'))
if (groups.includes('first')) {
  await goTo('w0')
  await shot('first', 'landed', 2500)
}

if (groups.includes('tutorial')) {
  const t = await newPage()
  const p = t.page
  await p.goto(`${base}?net=off&intro=off`)
  await p.waitForSelector('main button', { timeout: 30000 })
  await p.getByRole('button', { name: 'Play' }).click()
  await p.keyboard.type('NOVICE')
  await p.getByRole('button', { name: 'Next' }).click()
  await p.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await p.getByRole('button', { name: 'Done' }).click()
  await p.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 40000 })
  await p.mouse.move(size.width / 2, size.height * 0.3)
  await p.waitForTimeout(2500)
  await p.screenshot({ path: path.join(out, 'tutorial-docked.png') })
  made.push(path.join(out, 'tutorial-docked.png'))
  // (the ship waits with its power off: P brings it up, in two seconds)
  await p.keyboard.press('KeyP')
  await p.waitForTimeout(2300)
  await p.keyboard.down('KeyF')
  await p.waitForTimeout(1200)
  await p.keyboard.up('KeyF')
  await p.waitForTimeout(3500)
  await p.screenshot({ path: path.join(out, 'tutorial-launched.png') })
  made.push(path.join(out, 'tutorial-launched.png'))
  console.log('tutorial-docked, tutorial-launched')
  await t.context.close()
}

if (groups.includes('worlds')) {
  const KINDS = [
    ['archipelago', 'w0'],
    ['continental', 'w2'],
    ['mesa', 'w3'],
    ['ice', 'w32'],
    ['volcanic', 'w20'],
    ['ocean', 'w23'],
    ['canyon', 'w28'],
    ['jungle', 'w44'],
    ['moon', 'w4'],
  ]
  for (const [kind, id] of KINDS) {
    await tryShot('worlds', kind, async () => {
      await goTo(id)
      await lift()
      await controls({ climb: -1 })
      await wait(1200)
      await controls({})
      for (const v of VIEWS) {
        await view(v)
        await shot('worlds', `${kind}-${v}`, 1800)
      }
    })
  }
}

if (groups.includes('weather')) {
  const WEATHER = [
    ['storm', 'w22'],
    ['fog', 'w12'],
    ['dust', 'w42'],
    ['snow', 'w11'],
    ['rain', 'w44'],
    ['ash', 'w13'],
    ['night', 'w7'],
    ['sunset', 'w24'],
  ]
  for (const [kind, id] of WEATHER) {
    await tryShot('weather', kind, async () => {
      await goTo(id)
      await lift()
      await view('top')
      await wait(1500)
      await shot('weather', `${kind}-top`, 500)
      if (kind === 'storm' || kind === 'night') {
        await view('chase')
        await shot('weather', `${kind}-chase`, 1500)
      }
    })
  }
}

if (groups.includes('fight')) {
  await tryShot('fight', 'raiders', async () => {
    await goTo('w9')
    await lift()
    await S(() => {
      const g = window.__xenophon
      const s = g.scene
      const p = g.inner().bands.plans.find((x) => x.kind !== 'patrol')
      if (p) s.placePlayer(p.home.x + 150, p.home.y + 150, -2.4)
    })
    await wait(3000)
    for (const v of VIEWS) {
      await view(v)
      await S(() => {
        const s = window.__xenophon.scene
        const me = s.player
        const a = me.heading
        s.addShip({ x: me.x + Math.sin(a) * 120, y: me.y - Math.cos(a) * 120, height: me.height, heading: a + 0.4, speed: 30, hull: 'corsair', side: 1, pilot: 1 })
      })
      await page.keyboard.down('KeyJ')
      await wait(900)
      await shot('fight', v, 0)
      await page.keyboard.up('KeyJ')
      await wait(1500)
    }
  })
}

if (groups.includes('base')) {
  await tryShot('base', 'screen', async () => {
    await goTo('w0')
    await shot('base', 'landed', 1500)
    await page.keyboard.press('Tab')
    await wait(700)
    const tabs = await page.locator('section [role="tab"]').all()
    for (let i = 0; i < tabs.length; i++) {
      const name = ((await tabs[i].getAttribute('aria-label')) ?? (await tabs[i].innerText())).trim().toLowerCase().replace(/\W+/g, '-')
      await press(tabs[i])
      await page.mouse.move(4, 4)
      await shot('base', `screen-${i}-${name}`, 600)
    }
    await page.keyboard.press('Escape')
  })
}

if (groups.includes('foot')) {
  for (const [name, id] of [
    ['grass', 'w0'],
    ['lava', 'w20'],
  ]) {
    await tryShot('foot', name, async () => {
      await goTo(id)
      // (a tap of Action climbs out, once the Action that landed him has been let go)
      for (let i = 0; i < 6 && (await S(() => window.__xenophon.scene.foot.stage)) === 'ship'; i++) {
        await page.keyboard.down('KeyF')
        await wait(80)
        await page.keyboard.up('KeyF')
        await wait(900)
      }
      await until(() => window.__xenophon.scene.foot.stage === 'walking', 6000)
      await page.keyboard.down('KeyD')
      await wait(900)
      await page.keyboard.up('KeyD')
      await shot('foot', name, 600)
    })
  }
}

if (groups.includes('inside')) {
  await tryShot('inside', 'hangar', async () => {
    await goTo('w0')
    await S(() => window.__xenophon.scene.goInside('hangar'))
    await shot('inside', 'hangar', 2000)
    await tryShot('inside', 'bench', async () => {
      await S(() => window.__xenophon.scene.goInside('hangar'))
    })
  })
  for (const [name, place] of [
    ['deck', 'deck'],
    ['aboard', 'ship'],
  ]) {
    await tryShot('inside', name, async () => {
      await goTo('w0')
      await S((p) => window.__xenophon.scene.goInside(p), place)
      await shot('inside', name, 2000)
    })
  }
  // (the hangar's screens, from the page's buttons over the sky)
  for (const [name, label] of [
    ['bench', /Loadout|Bench/i],
    ['booth', /Paint/i],
    ['shop', /Shop/i],
    ['furnish', /Furnish/i],
  ]) {
    await tryShot('inside', name, async () => {
      await goTo('w0')
      await S(() => window.__xenophon.scene.goInside(name === 'shop' ? 'deck' : name === 'furnish' ? 'ship' : 'hangar'))
      await wait(1200)
      const b = page.getByRole('button', { name: label }).first()
      if (!(await b.count())) throw new Error('no button')
      await press(b)
      await page.mouse.move(4, 4)
      await shot('inside', `${name}-screen`, 900)
    })
  }
}

if (groups.includes('space')) {
  await tryShot('space', 'docked', async () => {
    await goTo('s0')
    await view('top')
    await shot('space', 'docked', 1500)
  })
  const PLACES = [
    ['open', 's0', null],
    ['world', 's0', ['planet', 1.05]],
    ['moon', 's0', ['moon', 1.3]],
    ['sun', 's0', ['sun', 1.35]],
    ['giant', 's0', ['giant', 1.12]],
    ['hole', 's5', ['black hole', 1.6]],
    ['belt', 's1', ['belt', 1.0]],
    ['station', 's0', ['base', 3]],
    ['gate', 's0', ['gate', 4]],
  ]
  for (const [name, sys, at] of PLACES) {
    await tryShot('space', name, async () => {
      await goTo(sys)
      await lift()
      const open = await S(() => ({ x: window.__xenophon.scene.player.x + 30000, y: window.__xenophon.scene.player.y + 30000 }))
      for (const v of VIEWS) {
        await view(v)
        // (put there afresh for each view: flown on through all three, the ship had passed a station or a gate before the
        // seat's picture was taken, and the audit judged the black behind it; polish step 9)
        if (at) await near(at[0], at[1])
        else await S((o) => window.__xenophon.scene.placePlayer(o.x, o.y, 0.5), open)
        await shot('space', `${name}-${v}`, 1500)
      }
    })
  }
}

if (groups.includes('travel')) {
  await tryShot('travel', 'down', async () => {
    await goTo('s0')
    await lift()
    await view('chase')
    await near('planet', 0.4)
    await wait(500)
    await controls({ land: true })
    for (const t of [1.5, 3, 3, 3]) {
      await shot('travel', `down-${made.length}`, t * 1000)
    }
    await controls({})
  })
  await tryShot('travel', 'up', async () => {
    await goTo('w0')
    await lift()
    await view('chase')
    await S(() => {
      const s = window.__xenophon.scene
      s.placePlayer(s.player.x, s.player.y, s.player.heading)
    })
    // (climb: −1 is up, the stick pulled back; at the ceiling, Action held goes out)
    await controls({ climb: -1 })
    await wait(9000)
    await controls({ climb: -1, land: true })
    for (const t of [1.5, 3, 3, 3]) await shot('travel', `up-${made.length}`, t * 1000)
    await controls({})
  })
}

if (groups.includes('maps')) {
  await tryShot('maps', 'all', async () => {
    await goTo('w0')
    await page.keyboard.press('m')
    await shot('maps', 'system', 900)
    await press(button('Galaxy'))
    await page.mouse.move(4, 4)
    await shot('maps', 'galaxy', 900)
    const sys = page.locator('g[role="button"][aria-label="Thodes"]').first()
    if (await sys.count()) {
      await press(sys)
      await page.mouse.move(4, 4)
      await shot('maps', 'galaxy-card', 700)
    }
    await press(button('System'))
    const world = page.locator('g[role="button"]').nth(3)
    await press(world)
    await page.mouse.move(4, 4)
    await shot('maps', 'system-card', 700)
  })
  await tryShot('maps', 'frontier', async () => {
    await goTo('s1')
    await page.keyboard.press('m')
    await page.mouse.move(4, 4)
    await shot('maps', 'system-frontier', 900)
  })
}

if (groups.includes('menus')) {
  await goTo('w0')
  await page.keyboard.press('Escape')
  await page.mouse.move(4, 4)
  await shot('menus', 'menu', 700)
  for (const name of ['Faction board', 'Pilots nearby', 'Pilot sheet', 'Squad', 'Your pilot', 'Settings']) {
    await tryShot('menus', name, async () => {
      const b = page.getByRole('button', { name }).first()
      await press(b)
      await page.mouse.move(4, 4)
      await shot('menus', name.toLowerCase().replace(/\W+/g, '-'), 800)
      // (each tab of it)
      const tabs = await page.locator('section [role="tab"]').all()
      for (let i = 1; i < tabs.length && i < 5; i++) {
        await press(tabs[i])
        await page.mouse.move(4, 4)
        await shot('menus', `${name.toLowerCase().replace(/\W+/g, '-')}-${i}`, 500)
      }
      await page.keyboard.press('Escape')
      await wait(400)
      if (!(await page.locator('section[aria-label="Menu"]').count())) {
        await page.keyboard.press('Escape')
        await wait(400)
      }
    })
  }
  await page.keyboard.press('Escape')
  await wait(300)
  await tryShot('menus', 'chat', async () => {
    await goTo('w0')
    await page.keyboard.press('Enter')
    await page.mouse.move(4, 4)
    await shot('menus', 'chat', 700)
  })
}

console.log(`${made.length} pictures in ${out}${errors.length ? `; page errors: ${errors.length}\n  ${errors.slice(0, 5).join('\n  ')}` : ''}`)
await context.close()
await browser.close()
