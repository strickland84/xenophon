// The stranger test, as far as it goes without a stranger: a fresh pilot's whole first session in a
// real browser, from the title to the galaxy map, played by a scripted player who does only what the
// prompt on the screen says, through the page as a player would: on a laptop with the keys and the
// mouse (the mouse pointed where he wants to go, its button for the guns), and on a phone held
// sideways with the touch buttons and a finger. He reads the prompt's words, finds the key or
// button they name, and does that; where to steer he takes from what the HUD shows (the arrow, the
// guide's mark, HOME). It writes how long each step took, where he was slow, and a screenshot of
// each step.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/first-session.mjs out/ [laptop|phone|both] [http://localhost:5173/]
//
// What the HUD shows is read through window.__xenophon (development builds only): where the
// ship, the course's body, the drones and the ore are, and which way the screen is turned.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'first-session', which = 'both', base = 'http://localhost:5173/'] = process.argv.slice(2)
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

/** what the stranger sees: the prompt's words, and from the HUD where things are (screen-turned bearings) */
const look = (page) =>
  page.evaluate(() => {
    const box = document.querySelector('[data-prompt]')
    const text = box?.querySelector('p')?.textContent?.trim() ?? ''
    const sub = box?.querySelector('span.truncate')?.textContent?.trim() ?? ''
    const g = window.__xenophon
    if (!g) return { text, sub, ready: false }
    const s = g.scene
    const me = s.player
    const L = s.loop
    const z = s.zone
    const course = z.course >= 0 ? s.bodies().find((b) => b.index === z.course) : null
    const drones = s.listShips().filter((x) => x.drill)
    const near = (list) => list.reduce((b, c) => (!b || Math.hypot(c.x - me.x, c.y - me.y) < Math.hypot(b.x - me.x, b.y - me.y) ? c : b), null)
    return {
      text,
      sub,
      ready: true,
      step: box?.getAttribute('data-prompt') ?? '',
      me: { x: me.x, y: me.y, heading: me.heading, above: me.above },
      yaw: s.foot.yaw,
      zone: z.kind,
      zprompt: z.prompt,
      stage: L.stage,
      lprompt: L.prompt,
      power: s.status.power,
      foot: s.foot.stage,
      footPrompt: s.foot.prompt,
      parked: s.foot.ship === 'parked' ? { x: s.pilot.x, y: s.pilot.y } : null,
      course: course ? { x: course.x, y: course.y } : null,
      drone: near(drones),
      target: s.status.target,
      ore: L.ore,
      chunk: near(L.chunks),
      pad: near(L.bases.filter((b) => !b.capital)),
      padByName: L.bases.map((b) => ({ name: b.name, x: b.x, y: b.y })),
      home: L.home,
      mapOpen: !!document.querySelector('[aria-label="Maps"]'),
      wheel: !!document.querySelector('section[aria-label="Your beacon says"]'),
    }
  })

/** the screen bearing (radians, 0 up the screen) from the player to (x, y): the world turned as the frame is */
const bearing = (v, x, y) => Math.atan2(x - v.me.x, -(y - v.me.y)) + v.yaw
/** how far (radians) a world point is off the ship's nose */
const offNose = (v, x, y) => {
  let off = Math.atan2(x - v.me.x, -(y - v.me.y)) - v.me.heading
  off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
  return off
}

async function play(device) {
  const phone = device === 'phone'
  const context = await browser.newContext(
    phone ? { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 720 } },
  )
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))
  const shot = (name) => page.screenshot({ path: path.join(out, `${device}-${name}.png`) })
  const press = (loc) => (phone ? loc.tap() : loc.click())

  // ── the first screens: Play, a callsign, a side, a pilot
  const started = Date.now()
  await page.goto(`${base}?net=off&intro=off`)
  await press(page.getByRole('button', { name: 'Play' }))
  await page.keyboard.type(phone ? 'THUMBS' : 'STRANGER')
  await press(page.getByRole('button', { name: 'Next' }))
  await press(page.getByRole('button', { name: /Fly for The Nomarchy/ }))
  await press(page.getByRole('button', { name: 'Done' }))
  await page.waitForFunction(() => window.__xenophon, null, { timeout: 30000 })
  const W = phone ? 844 : 1280
  const H = phone ? 390 : 720
  const cx = W / 2
  const cy = H / 2

  // ── his hands: keys held, the mouse, and on a phone fingers on the buttons and the screen
  const keysDown = new Set()
  const hold = async (code, on) => {
    if (on && !keysDown.has(code)) {
      keysDown.add(code)
      await page.keyboard.down(code)
    } else if (!on && keysDown.has(code)) {
      keysDown.delete(code)
      await page.keyboard.up(code)
    }
  }
  const tap = async (code) => {
    await page.keyboard.down(code)
    await page.waitForTimeout(60)
    await page.keyboard.up(code)
  }
  let mouseDown = false
  const mouse = async (x, y, down) => {
    await page.mouse.move(x, y)
    if (down !== mouseDown) {
      mouseDown = down
      await (down ? page.mouse.down() : page.mouse.up())
    }
  }
  const cdp = phone ? await context.newCDPSession(page) : null
  let finger = null
  const steerFinger = async (x, y) => {
    // (whole pixels: a touch at a fraction of one comes to the page at 0, 0)
    x = Math.round(x)
    y = Math.round(y)
    const type = finger ? 'touchMove' : 'touchStart'
    finger = { x, y }
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [{ x, y, id: 1 }] })
  }
  const liftFinger = async () => {
    if (!finger) return
    finger = null
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  const buttonsHeld = new Set()
  const touchButton = async (label, on) => {
    let b = page.getByRole('button', { name: new RegExp(`^${label}(: hold)?$`, 'i') }).first()
    // (what is not always on the screen is under More, as a player finds it)
    if (!(await b.count())) {
      await page.getByRole('button', { name: 'More', exact: true }).first().dispatchEvent('click')
      await page.waitForTimeout(250)
      b = page.getByRole('button', { name: new RegExp(`^${label}(: hold)?$`, 'i') }).first()
    }
    if (on === undefined) {
      await b.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: false })
      await b.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: false })
      await b.dispatchEvent('click')
      return
    }
    if (on && !buttonsHeld.has(label)) {
      buttonsHeld.add(label)
      await b.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: false })
    } else if (!on && buttonsHeld.has(label)) {
      buttonsHeld.delete(label)
      await b.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: false })
    }
  }
  /** points (the mouse, or a finger) the way to steer, at a screen bearing; `fire` with the mouse's button */
  const pointAt = async (screenBearing, fire = false) => {
    // (well out from the ship, which the camera trails a little: a finger keeps clear of the buttons in the corners and down the sides)
    const r = phone ? 300 : Math.min(W, H) * 0.3
    let x = cx + Math.sin(screenBearing) * r
    let y = cy - Math.cos(screenBearing) * r
    if (phone) {
      // (clear of the buttons: the row at the top, the columns down each side)
      const k = Math.min(1, 240 / Math.max(1, Math.abs(x - cx)), (y < cy ? 130 : 170) / Math.max(1, Math.abs(y - cy)))
      x = cx + (x - cx) * k
      y = cy + (y - cy) * k
    }
    if (phone) await steerFinger(x, y)
    else await mouse(x, y, fire)
  }
  /** Action held (F, or the Action button), or let go */
  const action = async (on) => (phone ? touchButton('Action', on) : hold('KeyF', on))
  // (the mining laser: its own key, R, or the touch screen's Mine, shown while ore is in reach)
  const mineHold = async (on) =>
    phone ? (on || buttonsHeld.has('Mine') ? touchButton('Mine', on && (await page.getByRole('button', { name: 'Mine: hold' }).count()) > 0) : null) : hold('KeyR', on)

  // ── the stranger reads and does
  const steps = []
  let last = ''
  let lastAt = Date.now()
  const slow = []
  const limit = Date.now() + 7 * 60_000
  let n = 0
  let wheelPicked = 0
  let midShot = ''
  let turning = 0
  while (Date.now() < limit) {
    const v = await look(page)
    n++
    if (!v.ready) {
      await page.waitForTimeout(100)
      continue
    }
    if (v.mapOpen && !v.text) {
      steps.push({ step: 'map', at: (Date.now() - started) / 1000 })
      await page.waitForTimeout(800)
      await shot('99-galaxy-map')
      break
    }
    if (v.step !== last && v.step) {
      const at = (Date.now() - started) / 1000
      if (last && Date.now() - lastAt > 40_000) slow.push(`${last}: ${((Date.now() - lastAt) / 1000).toFixed(0)} s`)
      steps.push({ step: v.step, at, text: v.text })
      await shot(`${String(steps.length).padStart(2, '0')}-${v.step}`)
      last = v.step
      lastAt = Date.now()
      midShot = `${String(steps.length).padStart(2, '0')}-${v.step}-later`
    }
    // (and one a few seconds into each step, to see it under way)
    if (midShot && Date.now() - lastAt > 3000) {
      await shot(midShot)
      midShot = ''
    }
    const t = v.text.toLowerCase()
    if (process.env.DEBUG && v.course && n % 4 === 0) {
      const want = bearing(v, v.course.x, v.course.y)
      let sh = v.me.heading + v.yaw
      sh -= Math.PI * 2 * Math.round(sh / (Math.PI * 2))
      let w = want - Math.PI * 2 * Math.round(want / (Math.PI * 2))
      console.log(device, v.step, (Date.now() - started) / 1000, 'screen heading', sh.toFixed(2), 'want', w.toFixed(2), 'finger', JSON.stringify(finger))
    }
    // let go of everything not wanted this moment (each branch takes what it needs again)
    let wantAction = false
    let wantMine = false
    let wantDive = false
    let wantFire = false
    let steer = null
    if (/shot down|killed|ship is coming/.test(t)) {
      // (nothing to do but wait, or steer for land)
    } else if (/call another/.test(t)) wantAction = true
    else if (/press (p|power) to power up/.test(t)) {
      // (once: a second press switches it off again)
      if (n % 20 === 0 && v.power === 'off') phone ? await touchButton('Power') : await tap('KeyP')
    }
    // (held until the ship goes: let go too soon, landed, a hand climbs out)
    else if (/hold (f|action) to (launch|take off)/.test(t)) wantAction = true
    else if (/see your ship from behind|again: the cockpit|again: back above/.test(t)) {
      if (n % 20 === 0) phone ? (await touchButton('More'), await touchButton('View')) : await tap('KeyV')
    } else if (/follow the arrow/.test(t) && v.course) steer = bearing(v, v.course.x, v.course.y)
    else if (/to go down to it/.test(t)) wantAction = n % 30 < 24
    else if (/dive low/.test(t)) {
      wantDive = true
      steer = bearing(v, v.me.x + Math.sin(v.me.heading) * 100, v.me.y - Math.cos(v.me.heading) * 100)
    } else if (/shoot the training drones/.test(t)) {
      const aim = v.target ? { x: v.target.leadX, y: v.target.leadY } : v.drone
      if (aim) {
        steer = bearing(v, aim.x, aim.y)
        wantFire = !!v.target && Math.abs(offNose(v, aim.x, aim.y)) < 0.15
      }
    } else if (/to mine it|scoop them/.test(t)) {
      const scoop = /scoop/.test(t)
      const mark = scoop ? v.chunk : v.ore
      if (mark) {
        const d = Math.hypot(mark.x - v.me.x, mark.y - v.me.y)
        steer = d > 70 || scoop ? bearing(v, mark.x, mark.y) : bearing(v, mark.x, mark.y) + Math.PI / 2
        wantMine = !scoop && d < 140
      }
      wantDive = /lower/i.test(v.sub)
    } else if (/land on the pad|land: hold/.test(t)) {
      const m = /land on the pad at (.+): hold/i.exec(v.text)
      const pad = m ? v.padByName.find((b) => b.name.toUpperCase() === m[1].toUpperCase()) : null
      if (pad && v.stage === 'flying') steer = bearing(v, pad.x, pad.y)
      wantAction = v.lprompt === 'land' || v.lprompt === 'pad' || v.stage === 'landing'
    } else if (/to get out/.test(t)) {
      if (n % 25 === 0) phone ? await touchButton('Action') : await tap('KeyF')
    } else if (/plant a beacon/.test(t)) {
      if (v.wheel) {
        if (wheelPicked++ % 10 === 0)
          phone ? await press(page.locator('section[aria-label="Your beacon says"] button').nth(1)) : await tap('Digit1')
      } else if (n % 25 === 0) phone ? (await touchButton('More'), await touchButton('Beacon')) : await tap('KeyV')
    } else if (/back in: walk to your ship|back to your ship/.test(t) && v.parked) {
      // walk: the keys (or the stick, a finger held from the middle) towards the ship as the screen shows it
      const b = bearing(v, v.parked.x, v.parked.y)
      const d = Math.hypot(v.parked.x - v.me.x, v.parked.y - v.me.y)
      if (phone) {
        if (d > 5) await steerFinger(cx + Math.sin(b) * 30, cy - Math.cos(b) * 30)
        else await liftFinger()
      } else {
        await hold('KeyW', d > 5 && Math.cos(b) > 0.38)
        await hold('KeyS', d > 5 && Math.cos(b) < -0.38)
        await hold('KeyD', d > 5 && Math.sin(b) > 0.38)
        await hold('KeyA', d > 5 && Math.sin(b) < -0.38)
      }
      if (v.footPrompt === 'board' && n % 15 === 0) phone ? await touchButton('Action') : await tap('KeyF')
    } else if (/fly home/.test(t) && v.home) {
      steer = bearing(v, v.home.x, v.home.y)
      wantAction = v.lprompt === 'pad' || v.stage === 'landing'
    }
    // (pointed a little off the nose towards where he wants to go, as a hand does, watching the ship come round: a point
    // straight at the target can sit behind a ship the camera trails, and the camera turns with the ship)
    if (steer !== null) {
      const nose = v.me.heading + v.yaw
      let off = steer - nose
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      // (with it behind him, he keeps turning the way he began, rather than dithering left and right)
      if (Math.abs(off) > 2.4 && turning) off = turning * Math.abs(off)
      turning = Math.abs(off) > 0.3 ? Math.sign(off) : 0
      steer = nose + Math.max(-1.1, Math.min(1.1, off * 1.5))
    }
    // (a finger that began walking lifts when walking is over: a phone's stick and steering are one finger)
    if (phone && !/walk to your ship|back to your ship/.test(t)) {
      if (steer !== null) await pointAt(steer)
      else await liftFinger()
    } else if (!phone && steer !== null) await pointAt(steer, wantFire)
    else if (!phone && mouseDown) await mouse(cx, cy, false)
    if (!/walk to your ship|back to your ship/.test(t) && !phone) for (const k of ['KeyA', 'KeyD']) await hold(k, false)
    if (phone) {
      await touchButton('Fire', wantFire)
      await touchButton('Dive', wantDive && (await page.getByRole('button', { name: 'Dive: hold' }).count()) > 0)
    } else {
      // (S dives, as a stick pushed, and walks back on foot; W climbs and walks forward)
      await hold('KeyS', wantDive || (/walk to your ship|back to your ship/.test(t) && keysDown.has('KeyS')))
      await hold('KeyW', /walk to your ship|back to your ship/.test(t) && keysDown.has('KeyW'))
    }
    await action(wantAction)
    await mineHold(wantMine)
    await page.waitForTimeout(50)
  }
  const total = (Date.now() - started) / 1000
  await browser.contexts()
  await context.close()
  return { device, total, steps, slow, errors }
}

const runs = which === 'both' ? ['laptop', 'phone'] : [which]
for (const d of runs) {
  const r = await play(d)
  console.log(`\n${d}: ${r.total.toFixed(0)} s from Play to the galaxy map`)
  let prev = 0
  for (const s of r.steps) {
    console.log(`  ${s.at.toFixed(0).padStart(4)} s  ${s.step.padEnd(8)} (+${(s.at - prev).toFixed(0)} s)  ${s.text ?? ''}`)
    prev = s.at
  }
  if (r.slow.length) console.log(`  slow: ${r.slow.join(', ')}`)
  if (r.errors.length) console.log(`  errors: ${r.errors.join(' | ')}`)
}
await browser.close()
