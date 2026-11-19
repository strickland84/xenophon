// Three pilots in three browsers, through the real network (Trystero over the public Nostr relays, in a private room),
// on Lubaek (w9), the Nomarchy's frontier: ALPHA and CHARLIE of the Nomarchy, BRAVO of the Anarchoi. What playing together
// is, end to end: they find each other; CHARLIE asks ALPHA into a squad and he joins; ALPHA opens his ship and CHARLIE
// comes aboard it; ALPHA hunts BRAVO, loaded, and shoots him down; the crate BRAVO's hold spills is taken by ALPHA;
// both are on foot and see each other; BRAVO steals ALPHA's parked ship; CHARLIE plants a flag at the world's mast and
// every game sees the world change hands. Screenshots of each step go to the folder given.
//
//   npm i --no-save playwright-core     # once (it is not one of the game's dependencies)
//   npm run dev                         # in another terminal (or use one already running)
//   node tools/together.mjs out/ [http://localhost:5173/]
//
// It drives each game through window.__xenophon (development and playtest builds only). Different networks and
// other machines cannot be tried from one: this proves the game's side of it, over the real relays.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'together', base = 'http://localhost:5173/'] = process.argv.slice(2)
fs.mkdirSync(out, { recursive: true })
const cache = path.join(os.homedir(), '.cache/ms-playwright')
const chrome = fs
  .readdirSync(cache)
  .filter((d) => /^chromium-\d+$/.test(d))
  .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
  .map((d) => path.join(cache, d, 'chrome-linux64/chrome'))
  .find((f) => fs.existsSync(f))
const room = 'together-' + Math.random().toString(36).slice(2, 8)
const t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4) + ' s'
const results = []
const say = (ok, what, more = '') => {
  results.push({ ok, what, more })
  console.log(stamp(), ok ? 'ok  ' : 'FAIL', what, more)
}

async function pilot(name, side) {
  const browser = await chromium.launch({ executablePath: chrome, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
  const page = await (await browser.newContext({ viewport: { width: 960, height: 540 } })).newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)))
  await page.goto(`${base}?room=${room}&world=w9&tutorial=off`)
  await page.getByRole('button', { name: 'Play' }).click()
  await page.keyboard.type(name)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: new RegExp('Fly for The ' + side) }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForFunction(() => window.__xenophon?.scene?.zone?.key === 'w9', null, { timeout: 60000 })
  return { name, browser, page, errors, S: (fn, arg) => page.evaluate(fn, arg), shot: (n) => page.screenshot({ path: path.join(out, `${name}-${n}.png`) }) }
}
const until = async (p, fn, ms, arg) => {
  const end = Date.now() + ms
  while (Date.now() < end) {
    if (await p.S(fn, arg)) return true
    await p.page.waitForTimeout(500)
  }
  return false
}

const A = await pilot('ALPHA', 'Nomarchy')
const B = await pilot('BRAVO', 'Anarchoi')
const C = await pilot('CHARLIE', 'Nomarchy')
const all = [A, B, C]
const keyOf = (p) => p.S(() => window.__xenophon.inner().params.pubkey ?? null)

// ── they find each other
let met = false
for (let i = 0; i < 120 && !met; i++) {
  await A.page.waitForTimeout(1000)
  const n = await Promise.all(all.map((p) => p.S(() => window.__xenophon.state().pilots?.length ?? 0)))
  met = n.every((x) => x === 2)
}
say(met, 'three pilots meet in one room', JSON.stringify(await A.S(() => window.__xenophon.state().pilots.map((p) => p.callsign))))
if (!met) process.exit(1)
const keys = await A.S(() => Object.fromEntries(window.__xenophon.state().pilots.map((p) => [p.callsign, p.key])))

// ── a squad: CHARLIE asks ALPHA, ALPHA joins
const aKey = await C.S(() => window.__xenophon.state().pilots.find((p) => p.callsign === 'ALPHA')?.key)
const cKey = keys.CHARLIE
await C.S((k) => window.__xenophon.net().invite(k), aKey)
await A.page.waitForTimeout(3000)
await A.S((k) => window.__xenophon.net().accept(k), cKey)
const squad = await until(A, () => (window.__xenophon.inner().squad?.mates?.length ?? 0) >= 1, 20000)
const squadC = await until(C, () => (window.__xenophon.inner().squad?.mates?.length ?? 0) >= 1, 20000)
say(squad && squadC, 'a squad of two', JSON.stringify(await A.S(() => window.__xenophon.inner().squad?.mates?.map((m) => m.callsign))))
await A.shot('1-squad')

// ── aboard: ALPHA opens his ship and stays in it; CHARLIE goes up to the deck and aboard ALPHA's
await A.page.getByRole('button', { name: 'Aboard', exact: true }).click()
await A.page.waitForTimeout(800)
await A.page.getByRole('button', { name: 'Furnish' }).click()
await A.page.getByRole('button', { name: /Open to your side/ }).click()
await A.page.getByRole('button', { name: 'Close' }).click()
await C.page.getByRole('button', { name: 'Deck', exact: true }).click()
const can = await C.page
  .getByRole('button', { name: /Aboard ALPHA/ })
  .waitFor({ timeout: 30000 })
  .then(() => true)
  .catch(() => false)
if (can) await C.page.getByRole('button', { name: /Aboard ALPHA/ }).click()
const aboard = can && (await until(C, () => window.__xenophon.scene.interior.owner !== '' && window.__xenophon.scene.interior.others >= 1, 20000))
await C.page.waitForTimeout(1500)
await C.shot('2-aboard-alpha')
await A.shot('2-alpha-has-a-visitor')
say(aboard, 'CHARLIE aboard ALPHA’s ship, each seeing the other', JSON.stringify(await C.S(() => window.__xenophon.scene.interior)))
for (const p of [A, C]) await p.page.getByRole('button', { name: 'Leave' }).click()
await A.page.waitForTimeout(1000)
if (await C.S(() => window.__xenophon.scene.zone.kind === 'interior')) await C.page.getByRole('button', { name: 'Leave' }).click()

// ── the fight: BRAVO carries ore; ALPHA hunts him with the guns until he is down
await B.S(() => window.__xenophon.scene.loadHold([{ id: 'magma-glass', n: 20 }]))
for (const p of [A, B]) await p.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true }))
await A.page.waitForTimeout(2500)
for (const p of [A, B]) await p.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false }))
await B.S(() => {
  const sc = window.__xenophon.scene
  window.__fly = setInterval(() => sc.setControls({ turn: 0.15, climb: 0, boost: 0.4, fire: false, secondary: false }), 100)
})
await A.S(() => {
  const sc = window.__xenophon.scene
  window.__hunt = setInterval(() => {
    const me = sc.player
    const t = sc.status.target
    const prey = sc
      .listShips()
      .filter((s) => s.side === 2)
      .sort((p, q) => Math.hypot(p.x - me.x, p.y - me.y) - Math.hypot(q.x - me.x, q.y - me.y))[0]
    const aim = t ? { x: t.leadX, y: t.leadY } : prey
    let turn = 0.3
    let fire = false
    if (aim) {
      let off = Math.atan2(aim.x - me.x, -(aim.y - me.y)) - me.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      turn = Math.max(-1, Math.min(1, off * 3))
      fire = !!t && Math.abs(off) < 0.12
    }
    const far = prey ? Math.hypot(prey.x - me.x, prey.y - me.y) > 150 : false
    sc.setControls({ turn, climb: 0, boost: far ? 1 : 0, fire, secondary: !!t && sc.status.lock >= 1 })
  }, 50)
})
const down = await until(B, () => window.__xenophon.scene.foot.stage !== 'ship', 90000)
await A.S(() => clearInterval(window.__hunt))
await B.S(() => clearInterval(window.__fly))
say(down, 'ALPHA shoots BRAVO down', JSON.stringify(await A.S(() => window.__xenophon.scene.status.skirmish)))
await A.shot('3-kill')
await B.shot('3-shot-down')

// ── the crate BRAVO's hold spilled: ALPHA flies low over it and takes it
const crate = await until(A, () => (window.__xenophon.scene.loop.crates?.length ?? 0) > 0, 15000)
let taken = false
if (crate) {
  const at = await A.S(() => window.__xenophon.scene.loop.crates[0])
  const held = await A.S(() => window.__xenophon.scene.loop.fill)
  for (let i = 0; i < 20 && !taken; i++) {
    await A.S(([x, y]) => window.__xenophon.scene.placePlayer(x, y + 30, 0), [at.x, at.y])
    await A.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 1, boost: 0, fire: false, secondary: false }))
    await A.page.waitForTimeout(800)
    taken = (await A.S(() => window.__xenophon.scene.loop.fill)) > held
  }
  await A.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false }))
}
say(taken, 'the crate changes hands: ALPHA takes what BRAVO carried', crate ? '' : '(no crate was seen)')
await A.shot('4-crate')

// ── both on foot: BRAVO down on the ground, ALPHA lands by him and climbs out
await until(B, () => window.__xenophon.scene.foot.stage === 'walking', 30000)
const bAt = await B.S(() => window.__xenophon.scene.player)
// (over dry, level ground near him, where a ship can set down)
await A.S(([x, y]) => {
  const st = window.__xenophon.inner()
  const w = st.world
  const at = (px, py) => ((Math.round(py) & 2047) << 11) | (Math.round(px) & 2047)
  for (let r = 40; r < 400; r += 20)
    for (let a = 0; a < 6.28; a += 0.4) {
      const px = x + Math.cos(a) * r
      const py = y + Math.sin(a) * r
      let ok = true
      for (let d = -14; d <= 14 && ok; d += 7)
        for (let e = -14; e <= 14 && ok; e += 7) ok = w.mat[at(px + d, py + e)] >= 4 && Math.abs(w.height[at(px + d, py + e)] - w.height[at(px, py)]) <= 2
      if (ok) {
        window.__xenophon.scene.placePlayer(px, py, 0)
        return
      }
    }
  window.__xenophon.scene.placePlayer(x + 120, y, 0)
}, [bAt.x, bAt.y])
await A.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true }))
const landed = await until(A, () => window.__xenophon.scene.loop.stage === 'landed', 25000)
await A.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false }))
await A.page.waitForTimeout(400)
await A.S(() => window.__xenophon.scene.act('use'))
await until(A, () => window.__xenophon.scene.foot.stage === 'walking', 8000)
const seeEach =
  (await until(A, () => window.__xenophon.scene.listWalkers().length > 0, 15000)) &&
  (await until(B, () => window.__xenophon.scene.listWalkers().length > 0, 15000))
say(landed && seeEach, 'both on foot, each seeing the other walk')
await A.shot('5-on-foot')
await B.shot('5-on-foot')

// ── BRAVO steals ALPHA's parked ship
const parked = await B.S(() => window.__xenophon.scene.listShips().find((s) => s.parked) ?? null)
let stolen = false
if (parked) {
  await B.S(([x, y]) => {
    const w = window.__xenophon.inner().foot.walker.jet
    w.x = x + 9
    w.y = y
  }, [parked.x, parked.y])
  for (let i = 0; i < 10 && !stolen; i++) {
    await B.S(() => window.__xenophon.scene.act('use'))
    await B.page.waitForTimeout(1000)
    stolen = await B.S(() => window.__xenophon.scene.foot.stage === 'ship')
  }
}
const aLost = await until(A, () => window.__xenophon.scene.foot.ship === 'gone', 15000)
say(stolen && aLost, 'BRAVO steals ALPHA’s parked ship; ALPHA’s game knows it is gone', parked ? '' : '(BRAVO saw no parked ship)')
await B.shot('6-stolen')
await A.shot('6-ship-gone')

// ── a flag: CHARLIE at Lubaek's mast, Action held; every game sees the world change hands
const before = await Promise.all(all.map((p) => p.S(() => window.__xenophon.inner().traces.holders.w9 ?? '')))
await C.S(() => window.__xenophon.scene.act('use'))
await until(C, () => window.__xenophon.scene.foot.stage === 'walking', 8000)
await C.S(() => {
  const st = window.__xenophon.inner()
  const b = st.world.features.bases[st.world.features.bases.length - 1]
  st.foot.walker.jet.x = b.mast.x + 5
  st.foot.walker.jet.y = b.mast.y + 5
})
await C.page.waitForTimeout(500)
await C.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true }))
await C.page.waitForTimeout(8000)
await C.S(() => window.__xenophon.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false }))
const after = []
for (const p of all) {
  await until(p, () => window.__xenophon.inner().traces.marks.some((m) => m.kind === 'flag'), 30000)
  after.push(await p.S(() => ({ holder: window.__xenophon.inner().traces.holders.w9 ?? '', flags: window.__xenophon.inner().traces.marks.filter((m) => m.kind === 'flag').length })))
}
say(
  after.every((x) => x.flags > 0) && after.every((x) => x.holder === after[0].holder),
  'a flag planted: every game has it, and agrees who holds the world',
  `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`,
)
await C.shot('7-flag')

const errors = all.flatMap((p) => p.errors.map((e) => `${p.name}: ${e}`))
console.log(`\n${results.filter((r) => r.ok).length} of ${results.length} done; ${errors.length} errors on the pages`)
for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e)
fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ room, results, errors }, null, 1))
for (const p of all) await p.browser.close()
