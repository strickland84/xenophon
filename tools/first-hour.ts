// A new pilot's first hour, played by a bot, to tune the numbers a new player meets: what he starts
// with, what he earns (mining and banking at his home world's base, and selling at its market today:
// no kills, which are not a way to live), when he can first buy a part (its credits, and the ore it
// needs kept back from the market), and how often. It mines the nearest ore until the hold is full,
// flies home and lands to bank, sells all it does not need for the cheapest part it could buy, and
// buys that part as soon as it can. Shot down, it calls a new ship and carries on. It never fights:
// on a world of the frontier the raiders by the rich ore come for it (ambushes, counted), and it
// runs for home.
//
//   npx jiti tools/first-hour.ts [world=w0] [hull=corsair] [minutes=60]
//
// The numbers it was tuned with are in the plan's section 22 (Phase 9).

import { createScene, dayOf, MODULES, pricesAt, SHOP, STEP, WEAPONS, withDefaults, worldSettings } from '../src/lib/engine'
import type { ResourceId } from '../src/lib/engine'

const world = process.argv[2] ?? 'w0'
const hull = process.argv[3] ?? 'corsair'
const minutes = Number(process.argv[4] ?? 60)
const scene = createScene(withDefaults({ ...worldSettings(world), side: 'nomarchy', intro: false, hull }))
const clock = 1_800_000_000
scene.setClock(clock)
const today = pricesAt(world, scene.loop.base?.id ?? 0, dayOf(clock * 1000))
const priceOf = (id: ResourceId) => today.find((p) => p.id === id)!.price

/** what can be bought, cheapest first: credits and ore */
const parts = [...WEAPONS.filter((w) => w.price > 0), ...MODULES]
  .map((p) => ({ id: p.id, name: p.name, price: p.price, needs: p.needs }))
  .sort((a, b) => a.price - b.price)

let credits: number = SHOP.startCredits
const vault: Partial<Record<ResourceId, number>> = {}
const bought: { at: number; name: string }[] = []
const st = { sorties: 0, units: 0, sold: 0, lost: 0, ambushes: 0, downed: 0 }
let first = -1
const held = (turn: number, climb: number, land = false) => ({ turn, climb, boost: 0, fire: false, secondary: false, land })
let phase = 'out'
let lastFill = 0
let filledAt = 0
const log: string[] = []
for (let n = 0; n < minutes * 3600; n++) {
  const L = scene.loop
  const me = scene.player
  const toward = (x: number, y: number) => {
    let off = Math.atan2(x - me.x, -(y - me.y)) - me.heading
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
    return Math.max(-1, Math.min(1, off * 2.5))
  }
  // (lost on the way, the hold is empty: out again for more; the hold not filling for half a minute, its slots
  // taken by other kinds of ore: home with what it has)
  if (phase === 'home' && L.fill === 0) phase = 'out'
  if (L.fill !== lastFill) {
    lastFill = L.fill
    filledAt = n
  } else if (phase === 'out' && L.fill > 0 && n - filledAt > 1800) phase = 'home'
  const foot = scene.foot
  if (foot.stage === 'walking' && foot.ship === 'parked' && foot.prompt !== 'board') {
    // (out of the ship beside it: walk back to it, the way the screen shows)
    const dx = scene.pilot.x - me.x
    const dy = scene.pilot.y - me.y
    const d = Math.hypot(dx, dy) || 1
    const c = Math.cos(foot.yaw)
    const s = Math.sin(foot.yaw)
    scene.setControls(held((dx * c - dy * s) / d, -(dx * s + dy * c) / d))
  } else if (foot.stage !== 'ship') scene.setControls(held(0, 0, foot.prompt === 'board' ? n % 20 < 4 : n % 90 > 10))
  // (out of the ship: Use held, to call another; tapped by it, to climb back in)
  else if (L.stage === 'landed') scene.setControls(held(0, 0, n % 120 > 20))
  else if (L.stage !== 'flying') scene.setControls(held(0, 0, true))
  else if (L.fill < 0.95 && L.ore && phase === 'out') {
    const d = Math.hypot(L.ore.x - me.x, L.ore.y - me.y)
    scene.setControls(d > 75 ? held(toward(L.ore.x, L.ore.y), 0, d < 140) : held(1, me.height - L.ore.z > 36 ? 1 : 0, true))
  } else if (L.home) {
    phase = 'home'
    scene.setControls(held(toward(L.home.x, L.home.y), 0, L.prompt === 'pad'))
  }
  scene.step(STEP)
  for (const snd of scene.takeSounds()) {
    // (ambushed: home with what it has)
    if (snd.kind === 'wave') {
      st.ambushes++
      if (L.fill > 0) phase = 'home'
    }
    if (snd.kind === 'eject') st.downed++
  }
  for (const e of scene.takeLedger()) {
    if (e.kind === 'lost') st.lost++
    if (e.kind !== 'bank') continue
    phase = 'out'
    st.sorties++
    for (const it of e.items) {
      vault[it.id] = (vault[it.id] ?? 0) + it.n
      st.units += it.n
    }
    // the cheapest part he could buy with what he has: the ore it needs kept, the rest sold
    const want = parts.find((p) => p.needs.every((s) => (vault[s.id] ?? 0) >= s.n)) ?? parts[0]
    for (const id of Object.keys(vault) as ResourceId[]) {
      const keep = want.needs.find((s) => s.id === id)?.n ?? 0
      const sell = Math.max(0, (vault[id] ?? 0) - keep)
      credits += sell * priceOf(id)
      st.sold += sell * priceOf(id)
      vault[id] = (vault[id] ?? 0) - sell
    }
    const t = n / 60
    if (credits >= want.price && want.needs.every((s) => (vault[s.id] ?? 0) >= s.n)) {
      credits -= want.price
      for (const s of want.needs) vault[s.id] = (vault[s.id] ?? 0) - s.n
      bought.push({ at: t, name: want.name })
      if (first < 0) first = t
      parts.splice(parts.indexOf(want), 1)
    }
    log.push(`${(t / 60).toFixed(1)} min: sortie ${st.sorties} banked ${e.items.map((i) => `${i.n} ${i.id}`).join(', ')}; ${credits} cr`)
  }
}
console.log(`${world} ${hull}, ${minutes} min: ${JSON.stringify(st)}; ${credits} cr left`)
console.log(`today's prices here: ${today.map((p) => `${p.id} ${p.price}`).join(', ')}`)
console.log(`first part at ${first < 0 ? 'never' : `${(first / 60).toFixed(1)} min`}; bought: ${bought.map((b) => `${b.name} ${(b.at / 60).toFixed(1)}`).join(', ')}`)
for (const l of log.slice(0, 12)) console.log('  ' + l)
