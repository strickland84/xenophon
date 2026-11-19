// The whole game played through in a real browser, as a new player would meet it, from a fresh save, alone
// (?net=off): the parts the other tools do not play. first-session.mjs plays the guided first sortie, play.mjs a
// sortie of mining and banking, walk.mjs being on foot, hangar.mjs the hangar, the bench, the booth, the deck and
// furnishing, space.mjs the way out and the maps, phone-check.mjs every screen; this plays the rest, end to end:
//
//   flying to a frontier world and fighting the raider band there; landing; out, walking to a vein and cutting it,
//   back in; banking; buying a ship at the deck's shop and flying it; out into space and every view there; the cruise
//   drive to a station and docking; a gate; a black hole's ring; down to a world in each view; a flag planted at an
//   outpost's mast; shot down over land and the ship called; shot down over the sea; every setting changed and still so
//   after a reload; the pilot saved to a file and restored from it on the first screen.
//
// Where getting somewhere is not the point (across a system, to the core), the pilot is put there through the scene
// (Scene.placePlayer); everything he does there goes through the page, the keys and the buttons. It writes a screenshot
// of each step and a list of what went wrong (errors on the page, steps that did not happen) to report.json.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/playthrough.mjs out/ [laptop|phone|both] [http://localhost:5173/]
//
// It reads how the scene stands through window.__xenophon (development builds, or a build made with
// VITE_PLAYTEST=1 for playing the built site through).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'playthrough', which = 'both', base = 'http://localhost:5173/'] = process.argv.slice(2)
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

async function play(device) {
  const phone = device === 'phone'
  const W = phone ? 844 : 1280
  const H = phone ? 390 : 720
  const context = await browser.newContext(
    phone ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : { viewport: { width: W, height: H } },
  )
  const page = await context.newPage()
  const errors = []
  const steps = []
  page.on('pageerror', (e) => errors.push(`page: ${String(e).slice(0, 300)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/WebSocket|ERR_|net::|relay|favicon/i.test(m.text())) errors.push(`console: ${m.text().slice(0, 300)}`)
  })
  let n = 0
  const shot = (name) => page.screenshot({ path: path.join(out, `${device}-${String(++n).padStart(2, '0')}-${name}.png`) })
  const wait = (ms) => page.waitForTimeout(ms)
  const S = (fn, arg) => page.evaluate(fn, arg)
  /** a step: done, or what went wrong, and a picture either way */
  const step = async (name, fn) => {
    const at = Date.now()
    try {
      // (a step that hangs fails after three minutes, and the playthrough goes on)
      let timer
      const said = await Promise.race([fn(), new Promise((_, no) => (timer = setTimeout(() => no(new Error('no end within 180 s')), 180_000)))])
      clearTimeout(timer)
      steps.push({ name, ok: true, s: (Date.now() - at) / 1000, said: said ?? '' })
      await shot(name)
    } catch (e) {
      steps.push({ name, ok: false, s: (Date.now() - at) / 1000, said: String(e.message ?? e).split('\n')[0].slice(0, 240) })
      await shot(`${name}-FAILED`).catch(() => {})
      await release()
    }
    console.log(`${device} ${steps.at(-1).ok ? 'ok  ' : 'FAIL'} ${name} (${steps.at(-1).s.toFixed(0)} s) ${steps.at(-1).said}`)
  }
  const until = async (what, fn, ms = 30000, arg) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (await S(fn, arg)) return
      await wait(150)
    }
    throw new Error(`${what}: not within ${ms / 1000} s`)
  }

  // ── his hands: keys (laptop) or the touch buttons (phone)
  const keys = new Set()
  const key = async (code, on) => {
    if (on && !keys.has(code)) {
      keys.add(code)
      await page.keyboard.down(code)
    } else if (!on && keys.has(code)) {
      keys.delete(code)
      await page.keyboard.up(code)
    }
  }
  const tap = async (code) => {
    await page.keyboard.down(code)
    await wait(70)
    await page.keyboard.up(code)
  }
  const held = new Set()
  const button = async (label, on) => {
    const b = page.getByRole('button', { name: new RegExp(`^${label}(: hold)?$`, 'i') }).first()
    if (on === undefined) {
      await b.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: false })
      await wait(70)
      await b.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: false })
      await b.dispatchEvent('click')
      return
    }
    if (on && !held.has(label)) {
      held.add(label)
      await b.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', isPrimary: false })
    } else if (!on && held.has(label)) {
      held.delete(label)
      await b.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch', isPrimary: false })
    }
  }
  /** Action (F) held or let go, or pressed once */
  const action = (on) => (phone ? button('Action', on) : on === undefined ? tap('KeyF') : key('KeyF', on))
  const release = async () => {
    for (const k of [...keys]) await key(k, false)
    for (const b of [...held]) await button(b, false).catch(() => {})
  }
  /** turns towards a point, with A and D (or a finger, on a phone), for a while; `fire` holds the guns */
  const cdp = phone ? await context.newCDPSession(page) : null
  let finger = false
  const steerTo = async (x, y, fire = false) => {
    const off = await S(
      ([x, y]) => {
        const me = window.__xenophon.scene.player
        let a = Math.atan2(x - me.x, -(y - me.y)) - me.heading
        a -= Math.PI * 2 * Math.round(a / (Math.PI * 2))
        return a
      },
      [x, y],
    )
    if (phone) {
      const yaw = await S(() => window.__xenophon.scene.foot.yaw)
      const me = await S(() => window.__xenophon.scene.player)
      const b = Math.atan2(x - me.x, -(y - me.y)) + yaw
      const fx = Math.round(W / 2 + Math.sin(b) * 150)
      const fy = Math.round(H / 2 - Math.cos(b) * 120)
      await cdp.send('Input.dispatchTouchEvent', { type: finger ? 'touchMove' : 'touchStart', touchPoints: [{ x: fx, y: fy, id: 1 }] })
      finger = true
      await button('Fire', fire)
    } else {
      await key('KeyA', off < -0.08)
      await key('KeyD', off > 0.08)
      await key('KeyJ', fire)
    }
    return off
  }
  const lift = async () => {
    if (finger) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    finger = false
    await release()
  }
  /** puts the player's ship somewhere (getting there is not the point of the step) */
  const place = (x, y, heading = 0) => S(([x, y, h]) => window.__xenophon.scene.placePlayer(x, y, h), [x, y, heading])
  const loop = () => S(() => window.__xenophon.scene.loop)
  const zone = () => S(() => window.__xenophon.scene.zone)
  const foot = () => S(() => window.__xenophon.scene.foot)

  /** out of the landed ship with a tap of Action (tried again: just after arriving, Use must first be let go) */
  const getOut = async () => {
    for (let i = 0; i < 6 && (await foot()).stage === 'ship'; i++) {
      await action()
      await wait(900)
    }
    await until('out of the ship', () => window.__xenophon.scene.foot.stage === 'walking', 6000)
  }
  /** back in a ship, whatever happened: on foot by his parked ship, climbed in; his ship lost, another called; dead, back at a base */
  const toShip = async () => {
    const end = Date.now() + 90_000
    while (Date.now() < end) {
      const f = await foot()
      if (f.stage === 'ship') return
      if (f.stage === 'walking' && f.ship === 'gone') {
        await action(true)
        await wait(900)
        await action(false)
      } else if (f.stage === 'walking' && f.ship === 'parked') {
        await S(() => {
          const st = window.__xenophon.inner()
          const j = st.jets[0]
          st.foot.walker.jet.x = j.x + 10
          st.foot.walker.jet.y = j.y
        })
        await wait(300)
        await action()
      }
      await wait(500)
    }
    throw new Error('could not get back into a ship')
  }

  // ── a new pilot: the first screens (the first sortie is first-session.mjs's), into the sky at his capital world
  await step('new-pilot', async () => {
    await page.goto(`${base}?net=off&tutorial=off`)
    const press = (loc) => (phone ? loc.tap() : loc.click())
    await press(page.getByRole('button', { name: 'Play' }))
    await page.keyboard.type(phone ? 'THUMB' : 'WALKER')
    await press(page.getByRole('button', { name: 'Next' }))
    await press(page.getByRole('button', { name: /Fly for The Nomarchy/ }))
    await press(page.getByRole('button', { name: 'Done' }))
    await page.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 30000 })
    await until('landed at the capital world', () => window.__xenophon.scene.loop.stage === 'landed', 30000)
  })

  // ── the frontier: a raider band fought on Lubaek (w9), next to the Nomarchy's space
  await step('to-the-frontier', async () => {
    await page.goto(`${base}?net=off&tutorial=off&world=w9`)
    await page.waitForFunction(() => window.__xenophon?.scene?.zone?.key === 'w9', null, { timeout: 40000 })
    await until('landed on the frontier', () => window.__xenophon.scene.loop.stage === 'landed', 30000)
    return 'a new pilot of the Nomarchy, landed at a base of Lubaek'
  })
  await step('take-off', async () => {
    await action(true)
    await until('flying', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
    await action(false)
  })
  await step('fight-a-raider-band', async () => {
    // (where the raiders wait: the bands planned on this world, lurking)
    const spots = await S(() =>
      window.__xenophon
        .inner()
        .bands.plans.filter((p) => p.kind !== 'patrol')
        .map((p) => ({ x: p.home.x, y: p.home.y })),
    )
    if (!spots.length) throw new Error('no raider band here')
    const me = await S(() => window.__xenophon.scene.player)
    spots.sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))
    // (put near the nearest band's ground, then he flies in and fights whatever comes)
    await place(spots[0].x + 500, spots[0].y + 500, -2.4)
    const start = await S(() => window.__xenophon.scene.status.skirmish.kills)
    const end = Date.now() + 100_000
    let seen = 0
    while (Date.now() < end) {
      const t = await S(() => {
        const s = window.__xenophon.scene
        const me = s.player
        const foes = s.listShips().filter((x) => x.side === 'raiders' || x.band >= 0)
        const tgt = s.status.target
        return { tgt, foes: foes.map((f) => ({ x: f.x, y: f.y })), kills: s.status.skirmish.kills, me, foot: s.foot.stage }
      })
      if (t.foot !== 'ship') break
      seen = Math.max(seen, t.foes.length)
      if (t.kills - start >= 2) break
      if (t.tgt) await steerTo(t.tgt.leadX, t.tgt.leadY, true)
      else if (t.foes.length) await steerTo(t.foes[0].x, t.foes[0].y, false)
      else await steerTo(spots[0].x, spots[0].y)
      await wait(100)
    }
    await lift()
    const kills = (await S(() => window.__xenophon.scene.status.skirmish.kills)) - start
    if (!seen) throw new Error('no raider came')
    return `${seen} raiders seen, ${kills} shot down`
  })
  await step('land-at-a-base', async () => {
    // (shot down in the fight: back in a ship first)
    await toShip()
    if ((await loop()).stage === 'landed') return 'back at a base already (shot down in the fight)'
    // (home: the arrow's base, flown to and landed on, Action held low over its pad)
    const end = Date.now() + 90_000
    while (Date.now() < end) {
      const L = await loop()
      if (L.stage === 'landed') break
      if (await S(() => window.__xenophon.scene.foot.stage !== 'ship')) throw new Error('shot down on the way home')
      if (L.home && L.home.d > 900) await place(L.home.x + 400, L.home.y + 300, -2.2)
      if (L.home) await steerTo(L.home.x, L.home.y)
      await action(L.prompt === 'pad' || L.stage === 'landing')
      if (!phone) await key('KeyS', L.prompt !== 'pad' && L.home && L.home.d < 260)
      await wait(120)
    }
    await lift()
    if ((await loop()).stage !== 'landed') throw new Error('did not land')
  })
  await step('out-walk-vein-back-in', async () => {
    await toShip()
    await until('landed', () => window.__xenophon.scene.loop.stage === 'landed', 30000)
    await getOut()
    // a few steps with the keys or the stick
    if (phone) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W / 2 + 40, y: H / 2, id: 2 }] })
      await wait(900)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await key('KeyD', true)
      await wait(900)
      await key('KeyD', false)
    }
    // the nearest vein: walked up to (put beside it if it is far), cut with Action held
    const v = (await foot()).vein
    if (!v) throw new Error('no vein on this world')
    await S(
      ([x, y]) => {
        const w = window.__xenophon.inner().foot.walker.jet
        w.x = x + 6
        w.y = y
      },
      [v.x, v.y],
    )
    await wait(300)
    await action(true)
    await until('cutting', () => window.__xenophon.scene.foot.cutting, 6000)
    await wait(3500)
    await action(false)
    const pack = (await foot()).pack.filter(Boolean)
    if (!pack.length) throw new Error('nothing in the pack after cutting')
    await shot('vein-cut')
    // back to the ship (put beside it) and in
    await S(() => {
      const st = window.__xenophon.inner()
      const j = st.jets[0]
      st.foot.walker.jet.x = j.x + 10
      st.foot.walker.jet.y = j.y
    })
    await wait(300)
    for (let i = 0; i < 8 && (await foot()).stage !== 'ship'; i++) {
      await action()
      await wait(700)
    }
    await until('back in', () => window.__xenophon.scene.foot.stage === 'ship', 6000, undefined).catch(async (e) => {
      throw new Error(`${e.message}; prompt by the ship: ${(await foot()).prompt}`)
    })
    return `${pack.map((s) => `${s.n} ${s.id}`).join(', ')} cut by hand`
  })
  await step('bank', async () => {
    // (landed at a friendly base, what was cut by hand is in the hold; Action held lifts off, landing again banks it)
    const fill = (await loop()).fill
    await action(true)
    await until('lifting', () => window.__xenophon.scene.loop.stage !== 'landed', 8000)
    await action(false)
    await wait(1500)
    await action(true)
    await until('landed again', () => window.__xenophon.scene.loop.stage === 'landed', 25000)
    await action(false)
    const after = (await loop()).fill
    if (fill > 0 && after > 0) throw new Error(`the hold was not banked (${fill} → ${after})`)
    return `hold ${fill.toFixed(2)} → ${after.toFixed(2)}`
  })

  // ── space: up out of a world, every view, the cruise drive, a station, a gate
  await step('up-into-space', async () => {
    await page.goto(`${base}?net=off&tutorial=off&world=w0`)
    await page.waitForFunction(() => window.__xenophon?.scene?.zone?.key === 'w0', null, { timeout: 40000 })
    await until('landed', () => window.__xenophon.scene.loop.stage === 'landed', 30000)
    await action(true)
    await until('flying', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
    await action(false)
    // climb (W, or Climb on a phone) to 160 px and over, then Action held
    if (phone) await button('Climb', true)
    else await key('KeyW', true)
    await until('high up', () => window.__xenophon.scene.player.height > 200, 30000)
    if (phone) await button('Climb', false)
    else await key('KeyW', false)
    await action(true)
    await until('in space', () => window.__xenophon.scene.zone.kind === 'space' && !window.__xenophon.scene.zone.travel, 40000)
    await action(false)
  })
  await step('every-view-in-space', async () => {
    const views = []
    for (let i = 0; i < 3; i++) {
      if (phone) await button('View')
      else await tap('KeyV')
      await wait(1400)
      views.push(await S(() => window.__xenophon.inner().params.view))
      await shot(`space-view-${views.at(-1)}`)
    }
    if (new Set(views).size < 3) throw new Error(`views seen: ${views.join(', ')}`)
    return views.join(' → ')
  })
  await step('cruise-and-dock', async () => {
    const st = await S(() => {
      const s = window.__xenophon.scene
      const me = s.player
      const b = s.bodies().filter((x) => x.kind === 'base')
      b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
      return b[0]
    })
    if (!st) throw new Error('no station in this system')
    await S((i) => window.__xenophon.scene.setCourse(i), st.index)
    if (phone) await button('Cruise')
    else await tap('KeyC')
    const end = Date.now() + 90_000
    while (Date.now() < end) {
      const z = await zone()
      if (z.prompt === 'dock') break
      const me = await S(() => window.__xenophon.scene.player)
      const s = await S((i) => window.__xenophon.scene.bodies().find((b) => b.index === i), st.index)
      await steerTo(z.aim?.x ?? s.x, z.aim?.y ?? s.y)
      if (Math.hypot(s.x - me.x, s.y - me.y) > 6000 && z.cruise === 'off') phone ? await button('Cruise') : await tap('KeyC')
      await wait(200)
    }
    await lift()
    await action(true)
    await until('docked', () => window.__xenophon.scene.loop.stage === 'landed', 20000)
    await action(false)
    return st.name
  })
  await step('undock-and-jump-a-gate', async () => {
    await action(true)
    await until('undocked', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
    await action(false)
    const gate = await S(() => {
      const s = window.__xenophon.scene
      const me = s.player
      const g = s.bodies().filter((x) => x.kind === 'gate')
      g.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
      return g[0]
    })
    // (put a little short of the gate: crossing a system is cruise-and-dock's)
    await place(gate.x, gate.y + 420, 0)
    const sys = (await zone()).system
    const end = Date.now() + 40_000
    while (Date.now() < end) {
      const z = await zone()
      if (z.system !== sys) break
      const g = await S((i) => window.__xenophon.scene.bodies().find((b) => b.index === i), gate.index)
      await steerTo(g.x, g.y)
      await action(z.prompt === 'jump' || z.travel === 'gate')
      await wait(150)
    }
    await lift()
    if ((await zone()).system === sys) throw new Error('still in the same system')
    return `through ${gate.name}`
  })
  await step('thread-a-black-hole', async () => {
    // (the black hole at one end of the shortcut, Gokaund in Thodes' space: the pilot put in its system, by its ring)
    await page.goto(`${base}?net=off&tutorial=off&world=s1`)
    await page.waitForFunction(() => window.__xenophon?.scene?.zone?.kind === 'space', null, { timeout: 40000 })
    await wait(1500)
    const h = await S(() => window.__xenophon.scene.bodies().find((b) => b.kind === 'black hole'))
    if (!h) throw new Error('no black hole in s1')
    if ((await loop()).stage === 'landed') {
      await action(true)
      await until('undocked', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
      await action(false)
    }
    const sys = (await zone()).system
    // (put in the ring's bright band, flying round it, not into the hole: Use held there threads it)
    await place(h.x + h.size * 0.66, h.y, 0)
    await wait(300)
    const said = (await zone()).prompt
    await action(true)
    const end = Date.now() + 30_000
    while (Date.now() < end && (await zone()).system === sys) await wait(200)
    await action(false)
    await wait(1500)
    if ((await zone()).system === sys) throw new Error(`not flung out of the ring (the prompt in its band: ${said || 'none'})`)
    if ((await zone()).system === sys) throw new Error('not flung out of the ring')
    return `${h.name}: out in system ${(await zone()).system}`
  })
  for (const view of ['top', 'chase', 'cockpit'])
    await step(`down-to-a-world-${view}`, async () => {
      // (over the nearest world of this system, in this view, Action held: the whole way down through its air)
      while ((await S(() => window.__xenophon.inner().params.view)) !== view) {
        if (phone) await button('View')
        else await tap('KeyV')
        await wait(600)
      }
      let w = await S(() => {
        const s = window.__xenophon.scene
        const me = s.player
        const b = s.bodies().filter((x) => x.world && (x.kind === 'planet' || x.kind === 'moon'))
        b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
        return b[0] ?? null
      })
      if (!w || (await zone()).kind !== 'space') {
        // (after the black hole's ring, wherever that flung him: back to the Nomarchy's home system's space, undocked)
        await page.goto(`${base}?net=off&tutorial=off&world=s0`)
        await page.waitForFunction(() => window.__xenophon?.scene?.zone?.kind === 'space', null, { timeout: 40000 })
        await wait(1500)
        if ((await loop()).stage === 'landed') {
          await action(true)
          await until('undocked', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
          await action(false)
        }
        w = await S(() => {
        const s = window.__xenophon.scene
        const me = s.player
        const b = s.bodies().filter((x) => x.world && (x.kind === 'planet' || x.kind === 'moon'))
        b.sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))
        return b[0] ?? null
      })
      }
      if (!w) throw new Error('no world here')
      await place(w.x, w.y, 0.5)
      await wait(1500)
      await action(true)
      await until('down on the world', () => window.__xenophon.scene.zone.kind === 'surface' && !window.__xenophon.scene.zone.travel, 45000)
      await action(false)
      await shot(`arrived-${view}`)
      // and back up for the next view (on a phone the Climb button is there overhead: from behind, a finger above the ship climbs)
      if (view !== 'cockpit') {
        while (phone && (await S(() => window.__xenophon.inner().params.view)) !== 'top') {
          await button('View')
          await wait(600)
        }
        if (phone) await button('Climb', true)
        else await key('KeyW', true)
        await until('high up', () => window.__xenophon.scene.player.height > 200, 30000)
        await release()
        await action(true)
        await until('in space', () => window.__xenophon.scene.zone.kind === 'space' && !window.__xenophon.scene.zone.travel, 45000)
        await action(false)
      }
      return w.name
    })

  // ── a flag at a frontier outpost's mast (on foot, Action held by it)
  await step('plant-a-flag', async () => {
    await page.goto(`${base}?net=off&tutorial=off&world=w9`)
    await page.waitForFunction(() => window.__xenophon?.scene?.zone?.key === 'w9', null, { timeout: 40000 })
    await until('landed', () => window.__xenophon.scene.loop.stage === 'landed', 30000)
    await getOut()
    const mast = await S(() => {
      const st = window.__xenophon.inner()
      // (the capture site is the world's last base's mast: sim/traces.ts captureBase)
      const b = st.world.features.bases[st.world.features.bases.length - 1]
      return b ? { x: b.mast.x, y: b.mast.y } : null
    })
    if (!mast) throw new Error('no capture site on this world')
    await S(
      ([x, y]) => {
        const w = window.__xenophon.inner().foot.walker.jet
        w.x = x + 5
        w.y = y + 5
      },
      [mast.x, mast.y],
    )
    await wait(400)
    const before = await S(() => window.__xenophon.scene.foot.prompt)
    await action(true)
    await wait(7000)
    await action(false)
    const flags = await S(() => window.__xenophon.inner().traces.marks.filter((m) => m.kind === 'flag').length)
    if (before !== 'flag' || flags < 1) throw new Error(`no flag planted (the prompt by the mast: ${before || 'none'}; flags ${flags})`)
    return `a flag planted (the prompt by the mast: ${before})`
  })

  // ── shot down over land: down on foot, the ship called with Action held, and aboard again
  await step('shot-down-over-land-and-call', async () => {
    const back = (await foot()).stage
    if (back !== 'ship') {
      await S(() => {
        const st = window.__xenophon.inner()
        const j = st.jets[0]
        st.foot.walker.jet.x = j.x + 10
        st.foot.walker.jet.y = j.y
      })
      for (let i = 0; i < 6 && (await foot()).stage !== 'ship'; i++) {
        await action()
        await wait(600)
      }
    }
    await action(true)
    await until('flying', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
    await action(false)
    await wait(2500)
    // (hit as another pilot's game would say: his ship is done for)
    await S(() => window.__xenophon.scene.hit(0, 9999, -1, 0, 0, 0, true))
    const t0 = Date.now()
    await until('down on foot', () => window.__xenophon.scene.foot.stage === 'walking', 30000)
    const down = (Date.now() - t0) / 1000
    await shot('down-on-foot')
    await action(true)
    await until('a ship coming', () => window.__xenophon.scene.foot.ship === 'coming', 8000)
    await action(false)
    await until('the ship landed beside him', () => window.__xenophon.scene.foot.ship === 'parked', 45000)
    await S(() => {
      const st = window.__xenophon.inner()
      const j = st.jets[0]
      st.foot.walker.jet.x = j.x + 10
      st.foot.walker.jet.y = j.y
    })
    for (let i = 0; i < 8 && (await foot()).stage !== 'ship'; i++) {
      await action()
      await wait(600)
    }
    if ((await foot()).stage !== 'ship') throw new Error('could not board the called ship')
    return `${down.toFixed(1)} s from the hit to walking`
  })

  // ── shot down over the sea: drowned, back at a base
  await step('shot-down-over-sea', async () => {
    const sea = await S(() => {
      const st = window.__xenophon.inner()
      const w = st.world
      const me = window.__xenophon.scene.player
      for (let r = 100; r < 1500; r += 40)
        for (let a = 0; a < 6.28; a += 0.2) {
          const x = Math.round(me.x + Math.cos(a) * r) & 2047
          const y = Math.round(me.y + Math.sin(a) * r) & 2047
          let wet = true
          for (let d = -60; d <= 60 && wet; d += 20) wet = w.mat[(((y + d) & 2047) << 11) | ((x + d) & 2047)] < 4
          if (wet) return { x, y }
        }
      return null
    })
    if (!sea) throw new Error('no sea near here')
    if ((await loop()).stage === 'landed') {
      await action(true)
      await until('flying', () => window.__xenophon.scene.loop.stage === 'flying', 15000)
      await action(false)
    }
    await place(sea.x, sea.y, 0)
    await wait(800)
    await S(() => window.__xenophon.scene.hit(0, 9999, -1, 0, 0, 0, true))
    await until('drowned', () => window.__xenophon.scene.foot.stage === 'dead', 30000)
    await shot('drowned')
    await until('back at a base', () => window.__xenophon.scene.foot.stage === 'ship', 20000)
  })

  // ── the maps and the screens: M, Tab, Enter, Escape (the menu's tiles are phone-check's)
  await step('maps-and-screens', async () => {
    const open = async (keyCode, btn, label) => {
      if (phone) await button(btn)
      else await tap(keyCode)
      await page.locator(`section[aria-label="${label}"]`).first().waitFor({ timeout: 5000 })
      await shot(`screen-${btn.toLowerCase()}`)
      await page.keyboard.press('Escape')
      await wait(500)
    }
    await open('KeyM', 'Map', 'Maps')
    await open('Escape', 'Menu', 'Menu')
  })

  // ── every setting changed, and still so after a reload
  await step('settings-kept', async () => {
    if (phone) await button('Menu')
    else await tap('Escape')
    await page.getByRole('button', { name: 'Settings' }).first().click()
    const panel = page.locator('section[aria-label="Settings"]')
    await panel.waitFor({ timeout: 5000 })
    const changed = []
    for (const tab of ['Controls', 'Sound', 'Picture']) {
      await page.getByRole('tab', { name: tab }).or(page.getByRole('button', { name: tab, exact: true })).first().click()
      await wait(300)
      // (each setting's choices: the first one not chosen, pressed; the key bindings are left alone)
      for (const g of await panel.locator('[role="group"]').all()) {
        const other = g.locator('button[aria-pressed="false"]').first()
        if (!(await other.count())) continue
        await other.click()
        await wait(120)
        changed.push((await g.getAttribute('aria-label')) ?? '?')
      }
    }
    const before = await S(() => localStorage.length && JSON.stringify(Object.entries(localStorage).find(([k]) => /save|pilot/i.test(k))?.[1] ?? '').length)
    await page.keyboard.press('Escape')
    await wait(2500)
    const saved = await S(() => {
      const k = Object.keys(localStorage).find((x) => /save|pilot/i.test(x))
      return k ? JSON.parse(localStorage.getItem(k)).settings : null
    })
    await page.reload()
    await page.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 40000 })
    const again = await S(() => {
      const k = Object.keys(localStorage).find((x) => /save|pilot/i.test(x))
      return k ? JSON.parse(localStorage.getItem(k)).settings : null
    })
    if (!saved || JSON.stringify(saved) !== JSON.stringify(again)) throw new Error('settings not the same after a reload')
    if (changed.length < 5) throw new Error(`only ${changed.length} settings found to change`)
    void before
    return `${changed.length} changed: ${changed.slice(0, 12).join(', ')}…`
  })

  // ── the pilot saved to a file from the menu, and restored from it on a fresh browser's first screen
  await step('backup-and-restore', async () => {
    if (phone) await button('Menu')
    else await tap('Escape')
    await page.getByRole('tab', { name: /Pilot file/ }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save file' }).click()])
    const file = path.join(out, `${device}-pilot.json`)
    await download.saveAs(file)
    const callsign = JSON.parse(fs.readFileSync(file, 'utf8')).callsign ?? JSON.parse(fs.readFileSync(file, 'utf8')).pilot?.callsign
    const fresh = await browser.newContext(phone ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true } : { viewport: { width: W, height: H } })
    const p2 = await fresh.newPage()
    p2.on('pageerror', (e) => errors.push(`restored page: ${String(e).slice(0, 300)}`))
    await p2.goto(`${base}?net=off`)
    await p2.getByRole('button', { name: 'Restore pilot' }).click()
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.getByRole('button', { name: /From a pilot file/ }).click()])
    await chooser.setFiles(file)
    await p2.waitForFunction(() => window.__xenophon?.scene, null, { timeout: 40000 })
    await p2.waitForTimeout(1500)
    await p2.screenshot({ path: path.join(out, `${device}-${String(++n).padStart(2, '0')}-restored.png`) })
    const back = await p2.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => /save|pilot/i.test(x))
      const s = k ? JSON.parse(localStorage.getItem(k)) : null
      return s?.callsign ?? s?.pilot?.callsign ?? null
    })
    await fresh.close()
    if (!back || (callsign && back !== callsign)) throw new Error(`restored as ${back}, saved as ${callsign}`)
    return `${callsign ?? back} saved and restored`
  })

  await context.close()
  return { device, steps, errors }
}

const report = []
for (const d of which === 'both' ? ['laptop', 'phone'] : [which]) report.push(await play(d))
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1))
for (const r of report) {
  const bad = r.steps.filter((s) => !s.ok)
  console.log(`\n${r.device}: ${r.steps.length - bad.length} of ${r.steps.length} steps done`)
  for (const s of bad) console.log(`  FAILED ${s.name}: ${s.said}`)
  if (r.errors.length) console.log(`  errors on the page (${r.errors.length}):\n    ${[...new Set(r.errors)].slice(0, 20).join('\n    ')}`)
}
await browser.close()
