// How the game runs on a slow machine: the real page in Chromium with its processor slowed several times over (as a
// mid-range phone's is beside this desktop), in every view and every kind of place: flying over a world, a fight, on
// foot, inside, space open and by a world, a gas giant and a black hole, and the way down. It counts the frames the
// page actually shows (requestAnimationFrame, as the game draws) for a few seconds in each, and writes the frame rate
// and the slowest frames. Run it against the built site (npm run build, then a build with VITE_PLAYTEST=1 served by
// `npx vite preview`), as dev builds are slower:
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   node tools/slow-machine.mjs [http://localhost:4173/] [throttle=4,6] [laptop|phone] [places, e.g. "down,fight"]
//
// It puts the pilot in each place through window.__xenophon (development and playtest builds only).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const base = process.argv[2] ?? 'http://localhost:4173/'
const rates = (process.argv[3] ?? '4,6').split(',').map(Number)
const device = process.argv[4] ?? 'laptop'
// (only the places whose way there is named, if any are: fly, fight, foot, hangar, open, planet, giant, black hole, down;
// whole: the whole way down in each view)
const only = process.argv[5] ? process.argv[5].split(',') : null
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
const phone = device === 'phone'
const size = phone ? { width: 844, height: 390 } : { width: 1366, height: 768 }

/** the places: how to get there (a page address, then what to do in it), and the views to measure in each */
const PLACES = [
  { name: 'over a world', url: '?net=off&tutorial=off&world=w0', go: 'fly', views: ['top', 'chase', 'cockpit'] },
  { name: 'a fight (frontier raiders)', url: '?net=off&tutorial=off&world=w9', go: 'fight', views: ['top', 'chase', 'cockpit'] },
  { name: 'on foot', url: '?net=off&tutorial=off&world=w0', go: 'foot', views: ['top'] },
  { name: 'inside (the hangar)', url: '?net=off&tutorial=off&world=w0', go: 'hangar', views: ['top'] },
  { name: 'space, open', url: '?net=off&tutorial=off&world=s0', go: 'open', views: ['top', 'chase', 'cockpit'] },
  { name: 'space, by a world', url: '?net=off&tutorial=off&world=s0', go: 'planet', views: ['top', 'chase', 'cockpit'] },
  { name: 'space, by a gas giant', url: '?net=off&tutorial=off&world=s0', go: 'giant', views: ['top', 'chase', 'cockpit'] },
  { name: 'space, by a black hole', url: '?net=off&tutorial=off&world=s5', go: 'black hole', views: ['top', 'chase', 'cockpit'] },
  { name: 'the way down', url: '?net=off&tutorial=off&world=s0', go: 'down', views: ['top', 'chase', 'cockpit'] },
  // (the whole way down in one view, from its start: the views above each see a third of it)
  { name: 'the whole way down', url: '?net=off&tutorial=off&world=s0', go: 'down:top', views: ['top'] },
  { name: 'the whole way down', url: '?net=off&tutorial=off&world=s0', go: 'down:chase', views: ['chase'] },
  { name: 'the whole way down', url: '?net=off&tutorial=off&world=s0', go: 'down:cockpit', views: ['cockpit'] },
]

const rows = []
for (const rate of rates) {
  const context = await browser.newContext(phone ? { viewport: size, isMobile: true, hasTouch: true } : { viewport: size })
  // (every repaint the page asks for, timed)
  await context.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window)
    window.__frames = []
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        window.__frames.push(t)
        cb(t)
      })
  })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  // a new pilot first (a save to fly), at full speed
  await page.goto(`${base}?net=off&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type('SLOW')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Fly for The Nomarchy/ }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 40000 })
  for (const place of PLACES.filter((p) => !only || only.some((o) => p.go === o || (o === 'whole' && p.go.startsWith('down:'))))) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await page.goto(`${base}${place.url}`)
    await page.waitForFunction(() => window.__xenophon?.scene?.zone, null, { timeout: 60000 })
    await page.waitForTimeout(2500)
    const ok = await page.evaluate(async (go) => {
      const g = window.__xenophon
      const s = g.scene
      const wait = (ms) => new Promise((r) => setTimeout(r, ms))
      const near = (kind, k = 1.6) => {
        const me = s.player
        const b = s.bodies().filter((x) => x.kind === kind)
        b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
        if (!b[0]) return false
        s.placePlayer(b[0].x + b[0].size * k, b[0].y, -Math.PI / 2)
        return true
      }
      const lift = async () => {
        if (s.loop.stage !== 'landed') return
        s.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true })
        // (with the power off, the hold brings it up first: two seconds more)
        for (let i = 0; i < 70 && s.loop.stage !== 'flying'; i++) await wait(100)
        s.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false })
      }
      if (go === 'fly') await lift()
      if (go === 'fight') {
        await lift()
        const p = g.inner().bands.plans.find((x) => x.kind !== 'patrol')
        if (p) s.placePlayer(p.home.x + 150, p.home.y + 150, -2.4)
        await wait(2500)
        return s.listShips().length > 0
      }
      if (go === 'foot') {
        s.act('use')
        await wait(1200)
        return s.foot.stage === 'walking'
      }
      if (go === 'hangar') return s.goInside('hangar')
      if (s.zone.kind === 'space') await lift()
      if (go === 'planet') return near('planet', 1.05)
      if (go === 'giant') return near('giant', 1.25)
      if (go === 'black hole') return near('black hole', 2.2)
      if (go.startsWith('down:')) {
        const rig = g.inner().rig
        const want = ['top', 'chase', 'cockpit'].indexOf(go.slice(5))
        for (let i = 0; i < 3 && rig.target !== want; i++) s.act('view')
        await wait(600)
      }
      if (go.startsWith('down')) {
        if (!near('planet', 0.4)) return false
        await wait(300)
        s.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true })
        for (let i = 0; i < 30 && !s.zone.travel; i++) await wait(100)
        return !!s.zone.travel
      }
      return true
    }, place.go)
    for (const view of place.views) {
      await page.evaluate((v) => {
        const s = window.__xenophon.scene
        // (the view is the camera rig's: 0 overhead, 1 from behind, 2 the seat; the setting is only where it starts)
        const rig = window.__xenophon.inner().rig
        const want = ['top', 'chase', 'cockpit'].indexOf(v)
        for (let i = 0; i < 3 && rig.target !== want; i++) s.act('view')
      }, view)
      const whole = place.go.startsWith('down:')
      if (!whole) await page.waitForTimeout(500)
      await cdp.send('Emulation.setCPUThrottlingRate', { rate })
      await page.evaluate(() => (window.__frames = []))
      await page.waitForTimeout(place.go === 'down' ? 2500 : whole ? 9000 : 4000)
      const f = await page.evaluate(() => window.__frames.slice())
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      const gaps = f
        .slice(1)
        .map((t, i) => t - f[i])
        .sort((a, b) => a - b)
      const fps = gaps.length ? 1000 / (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0
      const p95 = gaps.length ? gaps[Math.floor(gaps.length * 0.95)] : 0
      rows.push({ rate, place: place.name, view, fps: Math.round(fps), slow95: Math.round(p95), reached: ok })
      console.log(`×${rate}  ${place.name.padEnd(28)} ${view.padEnd(9)} ${String(Math.round(fps)).padStart(3)} fps  95% of frames within ${Math.round(p95)} ms${ok ? '' : '  (not reached)'}`)
    }
  }
  await context.close()
}
fs.writeFileSync(path.join(os.tmpdir(), 'slow-machine.json'), JSON.stringify(rows, null, 1))
await browser.close()
