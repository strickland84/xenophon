// Scripted players of six kinds, each from a fresh save for as long as asked (half an hour by default), to find where the
// game is plainly not fun (polish step 8): where nothing happens, where a pilot waits, repeats, is lost, is punished
// unfairly, or has no reason to go on. Each plays as a player of his kind would, through the scene's controls only (the
// page's screens, which the engine knows nothing of, are played here in their place: selling at a base's market, buying a
// part or a hull, plotting a course, each costing the seconds a player spends in them), and every second is logged:
// what he is doing, where, and what happened.
//
//   npx jiti tools/players.ts [kind ...] [--minutes=30] [--out=players.json] [--clock=1800000000]
//
// (It also plays the game as it stood before polish step 9, from a worktree of it: what that game lacks, the counter making
// up ore and where a pilot coming down will land, it does without.)
//
// kinds: prompts (only does what the prompts and tips say), miner, fighter, explorer (many systems), trader, walker (on
// foot). From the logs it works out: the longest stretches with nothing happening and nothing to decide; how often
// something rewarding happens (a kill, a find, a sale, a new place, an upgrade) and the gaps between; time in transit,
// in screens, waiting, dead or recovering; each death and whether it could have been avoided; and the minutes to each
// first (kill, sale, upgrade, new world, new system, flag, new ship).

import fs from 'node:fs'
import {
  createScene,
  dayOf,
  galaxyState,
  HULL_PRICES,
  MODULE_SLOTS,
  MODULES,
  payFor,
  pricesAt,
  statsOf,
  SHOP,
  stateOf,
  STEP,
  theGalaxy,
  WEAPONS,
  withDefaults,
  worldSettings,
} from '../src/lib/engine'
import type { HeldControls, ResourceId, Scene } from '../src/lib/engine'
import { standAt } from '../src/lib/engine/sim/foot'
import { namer } from '../src/lib/input/hints'
import { DEFAULT_BINDINGS, keyName } from '../src/lib/input/bindings'
import type { Bindable } from '../src/lib/input/bindings'
import { nextTip } from '../src/lib/tutorial/tips'
import { Tutorial } from '../src/lib/tutorial/tutorial'
import type { Prompt } from '../src/lib/tutorial/tutorial'
import { courseFor, routeOf } from '../src/lib/worlds/route'

const args = process.argv.slice(2)
const flag = (name: string, or: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1] ?? or
const MINUTES = Number(flag('minutes', '30'))
const OUT = flag('out', '')
const KINDS = ['prompts', 'miner', 'fighter', 'explorer', 'trader', 'walker'] as const
type Kind = (typeof KINDS)[number]
const wanted = args.filter((a) => !a.startsWith('--')) as Kind[]

/** seconds a player spends in the page's screens (measured by hand on the built site, rounded): the base's market to
 * sell, the bench to buy and fit a part, the deck's shop to buy a hull, the maps to plot a route, the menu */
const SCREEN = { sell: 12, part: 25, hull: 30, route: 8, refit: 6 }

const G = theGalaxy()
// (another moment of the shared clock, --clock=<seconds since 1970>, plays the same pilot through another day: other prices, bands
// beaten or not, outcrops grown back; a few of them give a spread, not one roll of the dice)
const CLOCK = Number(flag('clock', '1800000000'))
/** the galaxy as a fresh one stands (nobody's events): where a side's flag would count, as the page tells the scene */
const WAR = galaxyState([], CLOCK * 1000)
const DAY = dayOf(CLOCK * 1000)
const ctl = (more: Partial<HeldControls> = {}): HeldControls => ({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })
const wrapTurn = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2))

type Activity = 'transit' | 'cruise' | 'air' | 'jump' | 'fight' | 'mining' | 'landing' | 'landed' | 'screen' | 'foot' | 'dead' | 'waiting'
type EventKind =
  | 'kill'
  | 'bank'
  | 'sale'
  | 'upgrade'
  | 'ship'
  | 'newWorld'
  | 'newSystem'
  | 'find'
  | 'flag'
  | 'death'
  | 'ambush'
  | 'hit'
  | 'prompt'
  | 'tip'
  | 'decide'
interface Ev {
  t: number
  kind: EventKind
  what: string
}
const LETTER: Record<Activity, string> = {
  transit: 't',
  cruise: 'C',
  air: 'a',
  jump: 'j',
  fight: 'f',
  mining: 'm',
  landing: 'L',
  landed: 'l',
  screen: 'S',
  foot: 'w',
  dead: 'd',
  waiting: 'W',
}
/** what counts as something rewarding happening */
const REWARD: EventKind[] = ['kill', 'sale', 'upgrade', 'ship', 'newWorld', 'newSystem', 'find', 'flag', 'bank']

/** a player: his scene, what he owns (the page's side, played here), and what he has done */
class Player {
  scene: Scene
  kind: Kind
  n = 0
  credits: number = SHOP.startCredits
  vault: Partial<Record<ResourceId, number>> = {}
  hulls = new Set(['corsair'])
  /** the hull he flies, the weapons and modules he owns (bought once, kept), and what is fitted to the ship he flies */
  hull = 'corsair'
  owned = new Set<string>()
  parts: string[] = []
  weapons: string[] = []
  worlds = new Set<string>()
  systems = new Set<number>()
  events: Ev[] = []
  seconds: { act: Activity; zone: string }[] = []
  /** frames of each activity in the second going */
  tally = new Map<Activity, number>()
  /** a screen being looked at: frames left */
  screenLeft = 0
  /** the goal now, for the log and for being stuck */
  goal = ''
  goalAt = 0
  lastPrompt = ''
  deaths: { t: number; cause: string; warned: number; loaded: boolean; fighting: boolean; system: number }[] = []
  firstHit = -1
  lastHit = -99
  fillWas = 0
  /** on foot making for his parked ship: how far it was a second ago, and for how many seconds he has come no nearer */
  footWas = 0
  footStuck = 0
  /** the frame his last flag went up */
  flagged = -1
  fillAt = 0
  landedOn = new Set<string>()
  ambushAt = -1
  tipsShown: string[] = []
  tut: Tutorial | null = null
  course = -1
  /** where he is going across the galaxy (a world's id): plotted once on the maps */
  dest = ''
  constructor(kind: Kind) {
    this.kind = kind
    const home = G.systems.find((s) => s.side === 'nomarchy')!
    // (as the page starts a new pilot: docked at his capital station with the first sortie; or, with it off, at his capital world)
    const start = kind === 'prompts' ? `s${home.index}` : G.worlds[home.worlds[0]].id
    this.scene = createScene(withDefaults({ ...worldSettings(start), side: 'nomarchy', intro: false, hull: 'corsair' }))
    this.scene.setClock(CLOCK)
    this.scene.resize(456, 256)
    if (kind === 'prompts') this.tut = new Tutorial({ side: 'nomarchy', input: () => 'pointer', name: namer('pointer'), stick: () => true })
    this.arrived()
  }
  get t() {
    return this.n / 60
  }
  ev(kind: EventKind, what = '') {
    this.events.push({ t: this.t, kind, what })
  }
  decide(goal: string) {
    if (goal === this.goal) return
    this.goal = goal
    this.goalAt = this.n
    this.ev('decide', goal)
  }
  /** a new zone: a new world or system is a new place */
  arrived() {
    const z = this.scene.zone
    if (z.kind === 'surface') this.scene.setTraces({ front: WAR.worlds[z.key]?.front.nomarchy ?? false, marks: [] })
    if (z.kind === 'surface' && !this.worlds.has(z.key)) {
      if (this.worlds.size) this.ev('newWorld', z.key)
      this.worlds.add(z.key)
    }
    if (z.system >= 0 && !this.systems.has(z.system)) {
      if (this.systems.size) this.ev('newSystem', G.systems[z.system].name)
      this.systems.add(z.system)
    }
  }
  /** a screen of the page: so many seconds, the scene going on without him */
  screen(seconds: number) {
    this.screenLeft = Math.max(this.screenLeft, Math.round(seconds * 60))
  }
  get loaded() {
    return this.scene.loop.hold.some((s) => !!s)
  }
  /** sells what is in the vault (keeping what the part or ship he works towards needs) at the base he is landed at */
  sell(keep: Partial<Record<ResourceId, number>> = Object.fromEntries((this.goal_()?.needs ?? []).map((s) => [s.id, s.n]))) {
    const L = this.scene.loop
    if (L.stage !== 'landed' || !L.base?.friendly) return 0
    const prices = pricesAt(this.scene.zone.key, L.base.id, DAY)
    let got = 0
    for (const id of Object.keys(this.vault) as ResourceId[]) {
      const n = Math.max(0, (this.vault[id] ?? 0) - (keep[id] ?? 0))
      if (!n) continue
      const p = prices.find((x) => x.id === id)?.price ?? 0
      got += n * p
      this.vault[id] = (this.vault[id] ?? 0) - n
    }
    if (got > 0) {
      this.credits += got
      this.earned += got
      this.ev('sale', `${got} cr at ${L.base.name}`)
      this.screen(SCREEN.sell)
    }
    return got
  }
  /** the parts a player of his kind reaches for first (the rest after, cheapest first) */
  get likes(): string[] {
    if (this.kind === 'fighter') return ['rack', 'flak', 'shield-booster', 'armour', 'heat-sink', 'afterburner']
    if (this.kind === 'explorer') return ['cruise-drive', 'scanner', 'armour']
    return ['laser', 'cargo-pod', 'tractor', 'scanner', 'armour', 'shield-booster']
  }
  /** the ship a player of his kind works towards (data/hulls.ts NEXT_SHIP: the tips name it by how he earns) */
  get nextShip() {
    return this.kind === 'fighter' ? 'lance' : this.kind === 'trader' ? 'mule' : this.kind === 'explorer' ? 'nomad' : 'prospector'
  }
  /** the module slots and the mounts of the ship he flies */
  get slots() {
    return MODULE_SLOTS[this.hull] ?? 1
  }
  /** the part he works towards: of those not yet owned that his ship has room for (a module while a slot is free, a weapon
   * while a mount carries only the cannon), the first his kind likes, else the cheapest whose ore he has banked (as a player
   * reads the bench), else the cheapest; the prompt-follower takes the cheapest, as the tip says he can afford it */
  wantPart() {
    const modules = MODULES.filter((m) => this.owned.has(m.id)).length
    const weapons = WEAPONS.filter((w) => this.owned.has(w.id)).length
    const open = [...WEAPONS.filter((w) => w.price > 0 && weapons < statsOf(this.hull).mounts), ...MODULES.filter(() => modules < this.slots)]
      .filter((p) => !this.owned.has(p.id))
      .sort((a, b) => a.price - b.price)
    // (one he could ever buy: any, where the counter makes up ore; else one whose ore he has banked)
    const could = (p: (typeof open)[number]) => typeof payFor === 'function' || p.needs.every((s) => this.everHad.has(s.id))
    if (this.kind !== 'prompts') for (const id of this.likes) if (open.some((p) => p.id === id && could(p))) return open.find((p) => p.id === id)
    return open.find((p) => p.needs.every((s) => this.everHad.has(s.id))) ?? open[0]
  }
  /** the ship he works towards, once his Corsair's slots are full and he has not yet another (as the tips say) */
  wantShip() {
    if (this.hulls.size > 1 || MODULES.filter((m) => this.owned.has(m.id)).length < this.slots) return null
    const h = HULL_PRICES[this.nextShip]
    return { id: this.nextShip, price: h.credits, needs: h.needs, name: this.nextShip }
  }
  /** what he saves for: the ship, once it is his goal, else the next part */
  goal_() {
    return this.wantShip() ?? this.wantPart()
  }
  /** what a price comes to for him now, the ore his vault lacks made up at the counter (data/shop.ts payFor; a game before
   * it had none: the ore had to be there, or it could not be bought) */
  cost(p: { price: number; needs: { id: ResourceId; n: number }[] }) {
    if (typeof payFor === 'function') return payFor(p.price, p.needs, (id) => this.vault[id] ?? 0)
    const short = p.needs.some((s) => (this.vault[s.id] ?? 0) < s.n)
    return { credits: short ? Infinity : p.price, items: p.needs, madeUp: [] }
  }
  /** credits earned: sales and bounties */
  earned = 0
  /** the veins he has cut on foot */
  veins = new Set<number>()
  /** the ores he has ever banked */
  everHad = new Set<ResourceId>()
  canBuy(p: { price: number; needs: { id: ResourceId; n: number }[] } | undefined | null) {
    return !!p && this.credits >= this.cost(p).credits
  }
  /** pays for something: credits, and the ore from the vault (what it lacks made up at the counter) */
  pay(p: { price: number; needs: { id: ResourceId; n: number }[] }) {
    const c = this.cost(p)
    this.credits -= c.credits
    for (const s of c.items) this.vault[s.id] = (this.vault[s.id] ?? 0) - s.n
  }
  /** buys a part and fits it (at a friendly base, through the hangar's bench) */
  buyPart() {
    const p = this.wantPart()
    if (!p || !this.canBuy(p) || this.scene.loop.stage !== 'landed') return false
    this.pay(p)
    this.owned.add(p.id)
    this.refit()
    this.ev('upgrade', p.name)
    this.screen(SCREEN.part)
    return true
  }
  /** buys the ship he works towards (at the deck's shop) and flies it, his parts fitted */
  buyShip() {
    const h = this.wantShip()
    if (!h || !this.canBuy(h) || this.scene.loop.stage !== 'landed') return false
    this.pay(h)
    this.hulls.add(h.id)
    this.hull = h.id
    this.refit()
    this.ev('ship', h.id)
    this.screen(SCREEN.hull)
    return true
  }
  /** at the bench: what he owns fitted to the ship he flies (modules to its slots, weapons to its mounts) */
  refit() {
    const st = stateOf(this.scene)!
    const p = st.params
    this.parts = MODULES.filter((m) => this.owned.has(m.id))
      .map((m) => m.id)
      .slice(0, this.slots)
    this.weapons = WEAPONS.filter((w) => this.owned.has(w.id) && w.price > 0)
      .map((w) => w.id)
      .slice(0, statsOf(this.hull).mounts)
    this.scene.setParams({ ...p, hull: this.hull, weapons: this.weapons.join(','), parts: this.parts.join(',') })
  }
  /** landed at a friendly base, what he buys: the ship he saves for, or the next part */
  shop(told = true) {
    if (this.wantShip()) {
      if (told) this.buyShip()
      return
    }
    if (this.canBuy(this.wantPart()) && told) this.buyPart()
  }
}

// ── the skills every kind of player shares

/** from one point to another the short way round: a world wraps every 2048 px (space does not) */
const across = (scene: Scene, d: number) => (scene.zone.kind === 'surface' ? d - 2048 * Math.round(d / 2048) : d)

/** a turn towards a point, the way first-hour.ts and the stranger turn */
function toward(scene: Scene, x: number, y: number, k = 2.5) {
  const p = scene.player
  return Math.max(-1, Math.min(1, wrapTurn(Math.atan2(across(scene, x - p.x), -across(scene, y - p.y)) - p.heading) * k))
}

/** off the pad, out of dock: Action held */
const lift = (pl: Player) => ctl({ land: pl.n % 120 > 20 })

/** something to fight in reach: turn on its lead point, guns when lined up, a missile once locked */
function fightNear(pl: Player, reach = 420): HeldControls | null {
  const s = pl.scene.status
  const t = s.target
  const p = pl.scene.player
  if (!t || Math.hypot(t.x - p.x, t.y - p.y) > reach) return null
  const off = wrapTurn(Math.atan2(t.leadX - p.x, -(t.leadY - p.y)) - p.heading)
  if (pl.scene.zone.kind === 'space' && pl.scene.zone.cruise !== 'off') pl.scene.act('cruise')
  // (a missile coming: a roll as ROLL! shows)
  if (s.incoming < 0.6 && pl.n % 30 === 0) pl.scene.act('roll')
  return ctl({ turn: Math.max(-1, Math.min(1, off * 3)), fire: Math.abs(off) < 0.12 && !s.jammed, secondary: s.lock >= 1, boost: Math.abs(off) > 1.2 ? 1 : 0 })
}

/** the nearest ship of a band (raiders, drones, the other side's patrol) */
function nearestFoe(pl: Player) {
  const p = pl.scene.player
  let best: { x: number; y: number; d: number } | null = null
  for (const s of pl.scene.listShips()) {
    if (s.traffic || s.drill || s.parked || (s.faction === 'nomarchy' && s.band >= 0)) continue
    if (s.band < 0 && s.side < 0) continue
    if (s.faction === 'nomarchy') continue
    const d = Math.hypot(s.x - p.x, s.y - p.y)
    if (!best || d < best.d) best = { x: s.x, y: s.y, d }
  }
  return best
}

/** mining the nearest outcrop until the hold is full (the first-hour bot's way) */
function mine(pl: Player): HeldControls | null {
  const L = pl.scene.loop
  const me = pl.scene.player
  if (!L.ore || L.fill >= 0.95) return null
  // (chunks lying about: scooped first, a gem from further off and before the rest, as it glints and goes sooner)
  const chunk = L.chunks.reduce<{ x: number; y: number; d: number } | null>((b, c) => {
    const d = Math.hypot(c.x - me.x, c.y - me.y) / (c.units > 1 ? 3 : 1)
    return d < 140 && (!b || d < b.d) ? { x: c.x, y: c.y, d } : b
  }, null)
  if (chunk && !L.mining) return ctl({ turn: toward(pl.scene, chunk.x, chunk.y), climb: me.above > 30 ? 1 : 0 })
  const d = Math.hypot(L.ore.x - me.x, L.ore.y - me.y)
  return d > 75 ? ctl({ turn: toward(pl.scene, L.ore.x, L.ore.y), land: d < 140 }) : ctl({ turn: 1, climb: me.height - L.ore.z > 36 ? 1 : 0, land: true })
}

/** down towards the ground as a pad nears, from high up (arriving from space leaves a ship some 250 px up) */
const lower = (pl: Player, d: number) => (pl.scene.loop.stage === 'flying' && pl.scene.player.above > 60 && d < 500 ? 1 : 0)

/** home to the nearest friendly base and down on its pad (banks the hold; flat ground elsewhere does not) */
function bank(pl: Player): HeldControls | null {
  const L = pl.scene.loop
  if (!L.home) return null
  return ctl({
    turn: toward(pl.scene, L.home.x, L.home.y),
    climb: lower(pl, L.home.d),
    land: L.prompt === 'pad' || (L.stage === 'landing' && L.home.d < 120),
  })
}

/** to a base on this world by its name, and down on its pad */
function landAt(pl: Player, name: string): HeldControls | null {
  const L = pl.scene.loop
  const b = L.bases.find((x) => x.name === name) ?? null
  if (!b) return null
  const me = pl.scene.player
  const d = Math.hypot(across(pl.scene, b.x - me.x), across(pl.scene, b.y - me.y))
  return ctl({
    turn: toward(pl.scene, b.x, b.y),
    climb: lower(pl, d),
    land: d < 160 && (L.prompt === 'pad' || (L.prompt === 'land' && d < 30) || L.stage === 'landing'),
  })
}

/** up out of the world: climb to the ceiling, Use held high up */
function upToSpace(pl: Player): HeldControls {
  const me = pl.scene.player
  if (pl.scene.zone.travel) return ctl({ climb: -1 })
  return ctl({ climb: -1, land: me.above > 170 && pl.n % 90 < 60, turn: 0.1 })
}

/** in space, to a body (its index): the course plotted, the cruise drive on, steered by the course's aim round what is in the way */
function flyTo(pl: Player, body: number): { at: boolean; c: HeldControls } {
  const sc = pl.scene
  const z = sc.zone
  if (z.course !== body) sc.setCourse(body)
  const b = sc.bodies().find((x) => x.index === body)
  if (!b) return { at: false, c: ctl() }
  const me = sc.player
  const d = Math.hypot(b.x - me.x, b.y - me.y)
  const near = b.kind === 'planet' || b.kind === 'moon' ? b.size * 0.6 : b.kind === 'gate' ? 60 : 260
  const aim = z.aim ?? b
  if (d > near + 1500 && z.cruise === 'off' && pl.n % 120 === 0) sc.act('cruise')
  return { at: d < near + (b.kind === 'planet' || b.kind === 'moon' ? b.size * 0.3 : 0), c: ctl({ turn: toward(sc, aim.x, aim.y) }) }
}

/** in space, over a world: the way down (Use held while the HUD offers it) */
function goDown(pl: Player, body: number): HeldControls {
  const sc = pl.scene
  if (sc.zone.travel) return ctl({ land: true })
  const { at, c } = flyTo(pl, body)
  if (!at) return c
  if (sc.zone.cruise !== 'off') sc.act('cruise')
  return { ...c, land: sc.zone.prompt === 'descend' }
}

/** in space, to a gate and through it (Use held in its ring while it charges) */
function jump(pl: Player, gate: number): HeldControls {
  const sc = pl.scene
  if (sc.zone.travel === 'gate' || sc.zone.travel === 'hole') return ctl({ land: true })
  const { at, c } = flyTo(pl, gate)
  if (sc.zone.prompt === 'jump' || sc.zone.prompt === 'thread') {
    if (sc.zone.cruise !== 'off') sc.act('cruise')
    return { ...c, land: true }
  }
  if (at && sc.zone.cruise !== 'off') sc.act('cruise')
  return c
}

/** to a system by the fewest jumps, then down to a world of it (its index among the galaxy's bodies); a new destination is
 * plotted on the maps once (the page sets the course to the way on in each system after that) */
function travelTo(pl: Player, system: number, world: string): HeldControls {
  const sc = pl.scene
  const z = sc.zone
  if (pl.dest !== world && z.key !== world) {
    pl.dest = world
    pl.screen(SCREEN.route)
  }
  if (z.kind === 'surface') {
    if (z.key === world) return ctl()
    if (sc.loop.stage !== 'flying') return lift(pl)
    return upToSpace(pl)
  }
  if (z.kind !== 'space') return ctl()
  if (sc.loop.stage !== 'flying') return lift(pl)
  const wbody = G.bodies.findIndex((b) => b.world >= 0 && G.worlds[b.world].id === world)
  const way = courseFor(z.system, system, wbody)
  if (way < 0) return ctl()
  if (z.system === system) return goDown(pl, wbody)
  return jump(pl, way)
}

/** the controls of a fight, or of running for a base, when something comes for him; null if nothing does (a pilot who
 * does not seek a fight turns on what is close behind him only, and otherwise runs on, thrusters lit) */
function threat(pl: Player, fights: boolean): HeldControls | null {
  const sc = pl.scene
  const f = fightNear(pl, fights ? 520 : 200)
  if (f && (fights || !pl.loaded)) return f
  if (sc.status.ambushed && pl.loaded && sc.zone.kind === 'surface') return bank(pl)
  return f
}
/** running on, thrusters lit, while something is after him */
const run = (pl: Player, c: HeldControls) => (pl.scene.status.ambushed && !pl.scene.zone.travel ? { ...c, boost: 1 } : c)

/** out of his ship and back: on foot, dead, a ship called (what every kind does when shot down) */
function recover(pl: Player): HeldControls | null {
  const sc = pl.scene
  const foot = sc.foot
  if (foot.stage === 'ship') return null
  // (coming down where he cannot stand: steered for the land the HUD's arrow shows, as a player would)
  if (foot.stage === 'falling' && foot.down && !foot.down.safe && foot.shore) {
    const w = sc.player
    const dx = across(sc, foot.shore.x - w.x)
    const dy = across(sc, foot.shore.y - w.y)
    const d = Math.hypot(dx, dy) || 1
    const c = Math.cos(foot.yaw)
    const s = Math.sin(foot.yaw)
    return ctl({ turn: (dx * c - dy * s) / d, climb: -(dx * s + dy * c) / d })
  }
  if (foot.stage === 'falling' || foot.stage === 'dead' || foot.stage === 'boarding') return ctl()
  if (foot.ship === 'parked') {
    const p = sc.player
    let dx = across(sc, sc.pilot.x - p.x)
    let dy = across(sc, sc.pilot.y - p.y)
    const d = Math.hypot(dx, dy) || 1
    // (held up short of it, against its hull or a step of the ground: round it, as a player would walk round to its side)
    if (pl.n % 60 === 0) {
      pl.footStuck = Math.abs(d - pl.footWas) < 2 ? pl.footStuck + 1 : 0
      pl.footWas = d
    }
    if (pl.footStuck > 12 && foot.prompt === 'recall') return ctl({ land: true })
    if (pl.footStuck > 3) [dx, dy] = (pl.footStuck >> 2) % 2 ? [-dy, dx] : [dy, -dx]
    const c = Math.cos(foot.yaw)
    const s = Math.sin(foot.yaw)
    if (foot.prompt === 'board' && pl.n % 20 === 0) sc.act('use')
    return ctl({ turn: (dx * c - dy * s) / d, climb: -(dx * s + dy * c) / d })
  }
  // (his ship lost: Use held calls another)
  return ctl({ land: foot.ship === 'gone' && pl.n % 90 > 10 })
}

/** a way on foot from (x0, y0) to (x1, y1) over the ground, as points 3 px apart (the ground's own rule for where a pilot
 * can stand, one step at a time); straight at it if there is none within reach */
function wayOver(sc: Scene, x0: number, y0: number, x1: number, y1: number, near = 4, pad = 160): { x: number; y: number }[] {
  const st = stateOf(sc)!
  const world = st.world
  const j = st.jets[0]
  const ship =
    sc.foot.ship === 'parked' && !j.away ? { x: x0 + across(sc, j.x - x0), y: y0 + across(sc, j.y - y0), r: st.mesh.model.w * 0.32 * 1.2 + 3 } : null
  const C = 3
  const left = Math.min(x0, x1) - pad
  const top = Math.min(y0, y1) - pad
  const W = Math.ceil((Math.abs(x1 - x0) + pad * 2) / C)
  const H = Math.ceil((Math.abs(y1 - y0) + pad * 2) / C)
  if (W * H > 400_000) return [{ x: x1, y: y1 }]
  const from = new Int32Array(W * H).fill(-1)
  const feet = new Float32Array(W * H)
  const start = Math.round((y0 - top) / C) * W + Math.round((x0 - left) / C)
  const goal = Math.round((y1 - top) / C) * W + Math.round((x1 - left) / C)
  from[start] = start
  feet[start] = Math.max(0, standAt(world, x0, y0, sc.pilot.fz))
  const queue = [start]
  let best = start
  let bestD = Infinity
  for (let q = 0; q < queue.length; q++) {
    const c = queue[q]
    const cx = c % W
    const cy = (c / W) | 0
    const d = Math.hypot(cx * C + left - x1, cy * C + top - y1)
    if (d < bestD) [best, bestD] = [c, d]
    if (c === goal || d < near) break
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = cx + dx
      const ny = cy + dy
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
      const n = ny * W + nx
      if (from[n] >= 0) continue
      const g = standAt(world, nx * C + left, ny * C + top, feet[c])
      if (g < 0) continue
      // (his own ship, parked, stands in the way as the ground does: sim/foot.ts blockedByShip)
      if (ship && Math.hypot(nx * C + left - ship.x, ny * C + top - ship.y) < ship.r && Math.hypot(cx * C + left - ship.x, cy * C + top - ship.y) >= ship.r) continue
      from[n] = c
      feet[n] = g
      queue.push(n)
    }
  }
  // (no way within the box round the two: looked for again over a wider stretch, as the way he came may lie outside it)
  if (bestD > Math.max(near, 12) * 2 && pad < 480) return wayOver(sc, x0, y0, x1, y1, near, 480)
  const way: { x: number; y: number }[] = []
  for (let c = best; c !== start; c = from[c]) way.unshift({ x: (c % W) * C + left, y: ((c / W) | 0) * C + top })
  if (process.env.DEBUG_WAY)
    console.error(`way ${Math.round(x0)},${Math.round(y0)} → ${Math.round(x1)},${Math.round(y1)}: ${way.length} points, ends ${Math.round(bestD)} px off; seen ${queue.length}; start ${standAt(world, x0, y0, sc.pilot.fz)} fz ${sc.pilot.fz.toFixed(1)}`)
  return way.filter((_, i) => i % 2 === 1 || i === way.length - 1)
}

/** the nearest body in space, by name and kind, and how far (for telling what a pilot was lost to) */
function nearestBody(sc: Scene) {
  const p = sc.player
  let best = ''
  let bd = Infinity
  for (const b of sc.bodies()) {
    const d = Math.hypot(b.x - p.x, b.y - p.y) - (b.kind === 'belt' ? 0 : b.size)
    if (d < bd) [best, bd] = [`${b.kind} ${b.name} ${Math.round(d)} px`, d]
  }
  return best
}

/** the activity of the frame, from how the scene stands */
function activityOf(pl: Player): Activity {
  const sc = pl.scene
  if (pl.screenLeft > 0) return 'screen'
  const foot = sc.foot
  if (foot.stage === 'falling' || foot.stage === 'dead' || !sc.status.flying) return foot.stage === 'walking' ? 'foot' : 'dead'
  if (foot.stage === 'walking') return foot.cutting ? 'mining' : foot.ship === 'coming' ? 'waiting' : 'foot'
  const z = sc.zone
  if (z.travel === 'down' || z.travel === 'out') return 'air'
  if (z.travel === 'gate' || z.travel === 'hole') return 'jump'
  const L = sc.loop
  if (L.stage === 'landed') return 'landed'
  if (L.stage === 'landing' || L.stage === 'lifting') return 'landing'
  const f = nearestFoe(pl)
  if ((f && f.d < 450) || sc.status.ambushed) return 'fight'
  if (L.mining || (L.chunks.length && L.fill < 0.95 && pl.goal.startsWith('mine'))) return 'mining'
  if (z.kind === 'space' && z.cruise !== 'off') return 'cruise'
  return 'transit'
}

// ── each kind of player: what he wants this frame

/** the prompt-follower: the first sortie by its prompts (the stranger of tutorial.spec.ts), then only what the tips say,
 * and otherwise the loop the first sortie taught him (mine near home, fly home and bank) */
function prompts(pl: Player, said: { prompt: Prompt | null }): HeldControls {
  const sc = pl.scene
  if (pl.tut && !pl.tut.done) {
    const prompt = pl.tut.frame(sc)
    said.prompt = prompt
    pl.decide(`tutorial: ${pl.tut.step}`)
    return stranger(sc, prompt, pl.n, pl)
  }
  return miner(pl, false, true, true)
}

/** the miner: mines the nearest ore, banks it at home, sells, buys parts as soon as he can; after his first parts, the
 * frontier's richer ore (Thodes' world, next door), running home when ambushed */
function miner(pl: Player, ambitious = true, sells = true, told = false): HeldControls {
  const sc = pl.scene
  const L = sc.loop
  const r = recover(pl)
  if (r) return r
  if (L.stage === 'landed') {
    if (L.base?.friendly) {
      // (a miner sells and buys as he sees fit; one who does only what he is told, once a tip has said so)
      if (sells && (ambitious || pl.tipsShown.includes('sell'))) pl.sell()
      pl.shop(ambitious || pl.tipsShown.includes(pl.wantShip() ? 'shipNow' : 'part'))
    }
    pl.decide('lift off')
    return lift(pl)
  }
  // (with two parts fitted, or told so, the frontier: Lubaek, a jump from home)
  const frontier = (ambitious && pl.owned.size >= 2) || (told && pl.tipsShown.includes('frontier')) ? frontierWorld() : null
  if (frontier && sc.zone.key !== frontier.id && !pl.loaded) {
    pl.decide(`to the frontier: ${frontier.id}`)
    return travelTo(pl, frontier.system, frontier.id)
  }
  if (sc.zone.kind === 'space') {
    // (in space with nothing to do here: down to his own world)
    const home = G.worlds[G.systems.find((s) => s.side === 'nomarchy')!.worlds[0]]
    return travelTo(pl, home.system, home.id)
  }
  const th = threat(pl, false)
  if (th) return th
  // (the hold not filling for half a minute, its slots taken by other kinds of ore: home with what it has)
  if (L.fill !== pl.fillWas) {
    pl.fillWas = L.fill
    pl.fillAt = pl.n
  } else if (pl.loaded && pl.goal === 'mine' && pl.n - pl.fillAt > 1800) pl.decide('bank')
  if (L.fill < 0.95 && L.ore && !(pl.goal === 'bank' && pl.loaded)) {
    pl.decide('mine')
    const m = mine(pl)
    if (m) return m
  }
  if (pl.loaded) {
    pl.decide('bank')
    return bank(pl) ?? ctl()
  }
  pl.decide('look for ore')
  return ctl({ turn: 0.2 })
}

/** the frontier world next door to the Nomarchy's home: Lubaek (w9), an archipelago of Thodes by day, its raiders by the rich ore */
function frontierWorld() {
  return G.worlds.find((w) => w.id === 'w9')!
}

/** where a fighter hunts, in turn: the worlds of the frontier and beyond within three jumps of home, nearest first */
const HUNT = G.worlds
  .filter((w) => w.habitable && G.systems[w.system].side !== 'nomarchy' && G.systems[w.system].side !== 'anarchoi' && routeOf(0, w.system).length <= 3)
  .sort((a, b) => routeOf(0, a.system).length - routeOf(0, b.system).length || a.index - b.index)

/** the fighter: to the frontier's raider bands, and at them; on to the next world when one's bands are beaten; home to
 * mend when hurt; buys missiles and guns with what he earns */
function fighter(pl: Player, plan: { at: number; quiet: number; chase: number; ignore: number }): HeldControls {
  const sc = pl.scene
  const L = sc.loop
  const r = recover(pl)
  if (r) return r
  const front = HUNT[plan.at % HUNT.length]
  if (L.stage === 'landed') {
    if (L.base?.friendly) {
      pl.sell()
      pl.shop()
      if (sc.status.hull < 1 || sc.status.missiles < sc.status.missilesMax) {
        const cost = Math.round((1 - sc.status.hull) * 100 * SHOP.repair) + (sc.status.missilesMax - sc.status.missiles) * SHOP.missile
        if (pl.credits >= cost) {
          pl.credits -= cost
          sc.refit({ repair: true, missiles: sc.status.missilesMax })
          pl.screen(SCREEN.refit)
        }
      }
    }
    pl.decide('lift off')
    return lift(pl)
  }
  // (on the way, he turns on what comes for him, as a fighter would: it had flown on through the guns of a gate's raiders)
  const met = sc.zone.travel ? null : fightNear(pl, 420)
  if (met && sc.status.ambushed) {
    pl.decide('fight')
    return met
  }
  if (sc.zone.key !== front.id) {
    pl.decide('to the frontier')
    return travelTo(pl, front.system, front.id)
  }
  const f = fightNear(pl, 600)
  if (f) {
    pl.decide('fight')
    return f
  }
  // (a crate a downed raider left, near: flown over low to take its salvage, as a fighter would)
  const me0 = sc.player
  const crate = L.crates.find((c) => Math.hypot(c.x - me0.x, c.y - me0.y) < 500)
  if (crate && L.fill < 0.95) {
    pl.decide('take the salvage')
    const d = Math.hypot(crate.x - me0.x, crate.y - me0.y)
    return ctl({ turn: toward(sc, crate.x, crate.y), climb: me0.above > 40 && d < 300 ? 1 : 0 })
  }
  // (down on a friendly base's pad, where it is mended: set down on open ground nearby, as it had been, nothing mends it and
  // he took off and set down again for the rest of the hour)
  if (sc.status.hull < 0.35 && L.home) {
    pl.decide('home to mend')
    return bank(pl)!
  }
  // (credits enough for what he works towards: down on a friendly base's pad, where the bench and the shop are)
  if (pl.canBuy(pl.goal_()) && L.home) {
    pl.decide('land to buy')
    return bank(pl)!
  }
  // (where a band waits: the nearest raider band's spot not yet beaten)
  const st = stateOf(sc)!
  const me = sc.player
  const beaten = new Set(sc.clearedBands().map((c) => c.band))
  const plans = st.bands.plans.filter((p) => p.kind !== 'patrol' && !beaten.has(p.id))
  plans.sort((a, b) => Math.hypot(a.home.x - me.x, a.home.y - me.y) - Math.hypot(b.home.x - me.x, b.home.y - me.y))
  // (a chase that comes to nothing in forty seconds is given up a minute, as a player would turn away from a ship he
  // cannot catch)
  const foe = pl.n < plan.ignore ? null : nearestFoe(pl)
  if (foe && foe.d < 900) {
    if (pl.goal !== 'chase') plan.chase = pl.n
    pl.decide('chase')
    if (pl.n - plan.chase > 40 * 60) plan.ignore = pl.n + 60 * 60
    return ctl({ turn: toward(sc, foe.x, foe.y), boost: 1 })
  }
  // (nothing left to fight here, for a while: on to the next world)
  if (foe && foe.d < 1200 && pl.n >= plan.ignore) plan.quiet = pl.n
  if (pl.n - plan.quiet > 45 * 60 || !plans.length) {
    plan.at++
    plan.quiet = pl.n
    pl.decide(`on to ${HUNT[plan.at % HUNT.length].id}`)
  }
  if (plans[0]) {
    pl.decide(`hunt band ${plans[0].id}`)
    return ctl({ turn: toward(sc, plans[0].home.x, plans[0].home.y) })
  }
  return ctl({ turn: 0.15 })
}

/** the explorer: every system in turn by the fewest jumps, down to a world in each he has not seen, landing at a base there */
function explorer(pl: Player, plan: { order: number[]; i: number; landed: Set<string> }): HeldControls {
  const sc = pl.scene
  const L = sc.loop
  const r = recover(pl)
  if (r) return r
  // (the next system not yet seen, nearest by jumps from here; a system he was shot down in twice he keeps away from, as a
  // player who has read the map's danger would, and so any way through it)
  const here = sc.zone.system
  const lost = new Map<number, number>()
  for (const d of pl.deaths) lost.set(d.system, (lost.get(d.system) ?? 0) + 1)
  const avoid = (s: number) => (lost.get(s) ?? 0) >= 2
  const unseen = G.systems
    .filter((s) => !pl.systems.has(s.index) && !avoid(s.index) && !routeOf(here, s.index).slice(1, -1).some(avoid))
    .sort((a, b) => routeOf(here, a.index).length - routeOf(here, b.index).length)
  // (every system seen: the nearest with a world he has not landed on)
  const unlanded = (s: number) => G.worlds.some((w) => w.system === s && w.habitable && !plan.landed.has(w.id))
  const sys =
    unseen[0] ??
    G.systems
      .filter((s) => unlanded(s.index) && !avoid(s.index) && s.side !== 'anarchoi')
      .sort((a, b) => routeOf(here, a.index).length - routeOf(here, b.index).length)[0] ??
    G.systems.find((s) => s.side === 'nomarchy')!
  // (a world of it he has not landed on, the first habitable)
  const world = G.worlds.find((w) => w.system === sys.index && w.habitable && !plan.landed.has(w.id)) ?? G.worlds[sys.worlds[0]]
  if (sc.zone.kind === 'surface' && !plan.landed.has(sc.zone.key)) {
    // (a world not landed on yet: down at its nearest base)
    if (L.stage === 'landed') {
      plan.landed.add(sc.zone.key)
      pl.ev('find', `landed on ${sc.zone.key}`)
      return lift(pl)
    }
    const th = threat(pl, false)
    if (th) return th
    const b = L.bases.reduce<(typeof L.bases)[number] | null>((m, x) => {
      const me = sc.player
      return !m || Math.hypot(x.x - me.x, x.y - me.y) < Math.hypot(m.x - me.x, m.y - me.y) ? x : m
    }, null)
    pl.decide(`land on ${sc.zone.key}`)
    if (b) return run(pl, landAt(pl, b.name) ?? ctl())
    plan.landed.add(sc.zone.key)
  }
  if (L.stage === 'landed') return lift(pl)
  const th = threat(pl, false)
  if (th) return th
  pl.decide(`to ${sys.name}`)
  return run(pl, travelTo(pl, sys.index, world.id))
}

/** the trader: mines and banks at home until the vault holds a load worth the trip, then sells it where it pays most of the
 * bases a jump or two away (a world pays less for its own ore) */
function trader(pl: Player, plan: { sellAt: { world: string; base: number; system: number } | null }): HeldControls {
  const sc = pl.scene
  const L = sc.loop
  const r = recover(pl)
  if (r) return r
  const units = Object.values(pl.vault).reduce((a, b) => a + (b ?? 0), 0)
  if (!plan.sellAt && units >= 60) {
    // (the best market for what he holds, of the worlds two jumps or fewer from home)
    let best = { world: '', base: 0, system: -1, value: 0 }
    for (const w of G.worlds) {
      // (a world of his own space or the frontier next to it: two jumps at most; every world has two bases)
      if (!w.habitable || routeOf(0, w.system).length > 3 || G.systems[w.system].side === 'anarchoi') continue
      for (const bi of [0, 1]) {
        const prices = pricesAt(w.id, bi, DAY)
        const value = (Object.keys(pl.vault) as ResourceId[]).reduce((a, id) => a + (pl.vault[id] ?? 0) * (prices.find((p) => p.id === id)?.price ?? 0), 0)
        if (value > best.value) best = { world: w.id, base: bi, system: w.system, value }
      }
    }
    if (best.system >= 0) {
      plan.sellAt = best
      pl.screen(SCREEN.route)
      pl.decide(`sell at base ${best.base} of ${best.world}`)
    }
  }
  if (plan.sellAt) {
    const there = sc.zone.key === plan.sellAt.world ? L.bases[plan.sellAt.base] : null
    if (L.stage === 'landed' && there && L.base?.name === there.name) {
      pl.sell()
      pl.shop()
      plan.sellAt = null
      return lift(pl)
    }
    if (L.stage === 'landed') return lift(pl)
    const th = threat(pl, false)
    if (th) return th
    if (there) return landAt(pl, there.name) ?? ctl()
    return travelTo(pl, plan.sellAt.system, plan.sellAt.world)
  }
  // (back home to mine, if away)
  const home = G.worlds[G.systems.find((s) => s.side === 'nomarchy')!.worlds[0]]
  if (sc.zone.key !== home.id) {
    if (L.stage === 'landed') return lift(pl)
    pl.decide('home to mine')
    return travelTo(pl, home.system, home.id)
  }
  // (mining at home, banking, selling nothing there: the load is for a better market)
  return miner(pl, false, false)
}

/** the pilot who spends his time on foot: lands at an outpost of the frontier, walks to veins and cuts them, plants his
 * side's flag at the mast, walks back, flies home to bank; and again */
function walker(
  pl: Player,
  plan: {
    stage: string
    at: number
    wasX: number
    wasY: number
    around: number
    via: { x: number; y: number } | null
    viaAt: number
    skip: Set<number>
    since: number
    path: { x: number; y: number }[]
    pathTo: { x: number; y: number }
  },
): HeldControls {
  const sc = pl.scene
  const L = sc.loop
  const foot = sc.foot
  const front = frontierWorld()
  if (foot.stage === 'falling' || foot.stage === 'dead' || foot.stage === 'boarding') return ctl()
  if (foot.stage === 'walking') {
    const p = sc.player
    const yaw = foot.yaw
    // (walking to a point the way a player who can see the ground would: round the cliffs, the water and the buildings,
    // by a way worked out over the ground (sim/foot.ts standAt), again whenever he is held up)
    const walk = (x: number, y: number, near = 4) => {
      if (pl.n % 60 === 0) {
        const moved = Math.hypot(p.x - plan.wasX, p.y - plan.wasY)
        plan.wasX = p.x
        plan.wasY = p.y
        if (moved < 6) plan.path = []
        // (held up for half a minute: the way worked out is wrong where he stands; straight at it for a while, as a player would try)
        plan.around = moved < 6 ? plan.around + 1 : Math.max(0, plan.around - 1)
      }
      // (still held up: his ship called to him, as the HUD offers)
      if (plan.around > 40 && foot.prompt === 'recall') return ctl({ land: true })
      if (plan.around > 30) {
        if (plan.around > 60) plan.around = 0
        const dx = across(sc, x - p.x)
        const dy = across(sc, y - p.y)
        const d = Math.hypot(dx, dy) || 1
        const wob = Math.sin(pl.n / 50) * 0.6
        return ctl({ turn: (dx * Math.cos(yaw + wob) - dy * Math.sin(yaw + wob)) / d, climb: -(dx * Math.sin(yaw + wob) + dy * Math.cos(yaw + wob)) / d })
      }
      const far = Math.hypot(across(sc, x - plan.pathTo.x), across(sc, y - plan.pathTo.y))
      if ((!plan.path.length || far > 12) && pl.n - plan.viaAt > 30) {
        plan.viaAt = pl.n
        plan.pathTo = { x, y }
        plan.path = wayOver(sc, p.x, p.y, p.x + across(sc, x - p.x), p.y + across(sc, y - p.y), near)
      }
      while (plan.path.length > 1 && Math.hypot(plan.path[0].x - p.x, plan.path[0].y - p.y) < 6) plan.path.shift()
      const to = plan.path[0] ?? { x, y }
      const dx = across(sc, to.x - p.x)
      const dy = across(sc, to.y - p.y)
      const d = Math.hypot(dx, dy) || 1
      return ctl({ turn: (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / d, climb: -(dx * Math.sin(yaw) + dy * Math.cos(yaw)) / d, boost: d > 60 ? 1 : 0 })
    }
    const full = foot.pack.every((s) => !!s)
    if (foot.ship === 'gone') return ctl({ land: pl.n % 90 > 10 })
    // a flag at the mast, once a visit
    const site = sc.traces.site
    if (pl.flagged >= 0 && plan.stage !== 'flagged' && pl.flagged > plan.since) plan.stage = 'flagged'
    // (a flag at a mast once in ten minutes: a player has no reason to plant the same one again at once)
    if (site && plan.stage !== 'flagged' && !full && (pl.flagged < 0 || pl.n - pl.flagged > 36000) && Math.hypot(site.x - p.x, site.y - p.y) < 400) {
      pl.decide('plant a flag')
      if (foot.prompt === 'flag' || sc.traces.planting > 0) {
        if (sc.traces.planting === 0 && plan.at && pl.n - plan.at > 60 * 20) plan.stage = 'flagged'
        if (!plan.at) plan.at = pl.n
        return ctl({ land: true })
      }
      return walk(site.x, site.y, 20)
    }
    // (a vein he cannot get to in a minute is given up)
    if (foot.vein && pl.goal === 'cut a vein' && pl.n - pl.goalAt > 3600 && !foot.cutting) plan.skip.add(foot.vein.id)
    if (foot.vein && !full && !plan.skip.has(foot.vein.id) && Math.hypot(foot.vein.x - p.x, foot.vein.y - p.y) < 500) {
      if (pl.goal !== 'cut a vein' || foot.cutting) pl.goalAt = pl.n
      pl.decide('cut a vein')
      const d = Math.hypot(foot.vein.x - p.x, foot.vein.y - p.y)
      return d > 6 ? walk(foot.vein.x, foot.vein.y) : ctl({ land: true })
    }
    pl.decide('back to the ship')
    plan.stage = 'out'
    if (foot.prompt === 'board' && pl.n % 20 === 0) sc.act('use')
    // (to anywhere he can climb in from: within half its width and a reach of its middle, data/foot.ts FOOT.reach)
    const st = stateOf(sc)!
    return walk(sc.pilot.x, sc.pilot.y, st.mesh.model.w * 0.5 + 4)
  }
  // in his ship: the next place to go out on foot, on the frontier world: its outpost (for the flag, when one is due),
  // else beside the nearest vein he has not given up on; with ore aboard, the nearest friendly base first, to bank it
  const p = sc.player
  const flagDue = pl.flagged < 0 || pl.n - pl.flagged > 36000
  if (L.stage === 'landed') {
    if (L.base?.friendly) {
      pl.sell()
      pl.shop()
    }
    // (back aboard from a walk: on to the next place; just landed and not yet out: out)
    if (plan.stage === 'out' && pl.n - plan.since > 180) plan.stage = 'go'
    else if (sc.zone.key === front.id && (plan.stage === 'there' || plan.stage === 'out') && !pl.loaded) {
      if (plan.stage !== 'out') plan.since = pl.n
      plan.stage = 'out'
      plan.at = 0
      pl.decide('out on foot')
      if (pl.n % 30 === 0) sc.act('use')
      return ctl()
    }
    return lift(pl)
  }
  if (sc.zone.key !== front.id) {
    pl.decide('to the frontier')
    return travelTo(pl, front.system, front.id)
  }
  const th = threat(pl, false)
  if (th) return th
  if (pl.loaded) {
    pl.decide('bank')
    return bank(pl) ?? ctl()
  }
  const site = sc.traces.site
  if (site && flagDue) {
    const out = L.bases.reduce((m, b) => (Math.hypot(b.x - site.x, b.y - site.y) < Math.hypot(m.x - site.x, m.y - site.y) ? b : m))
    pl.decide('land at the outpost')
    plan.stage = 'there'
    return landAt(pl, out.name) ?? ctl()
  }
  const v = foot.vein && !plan.skip.has(foot.vein.id) ? foot.vein : null
  if (v) {
    // (down on flat ground near it: Land held where the HUD offers it; no flat ground near it in half a minute, another)
    const d = Math.hypot(across(sc, v.x - p.x), across(sc, v.y - p.y))
    if (pl.goal !== 'fly to a vein') plan.at = pl.n
    pl.decide('fly to a vein')
    plan.stage = 'there'
    if (d < 400 && pl.n - plan.at > 1800 && L.stage === 'flying') {
      plan.skip.add(v.id)
      plan.at = pl.n
    }
    return ctl({ turn: toward(sc, v.x, v.y), climb: lower(pl, d), land: d < 220 && (L.prompt === 'land' || L.stage === 'landing') })
  }
  pl.decide('look for veins')
  return ctl({ turn: 0.2 })
}

// ── the stranger of tutorial.spec.ts, as it stands there (he reads the prompt's words and does what they say)
function actionOf(name: string): Bindable | null {
  for (const [a, codes] of Object.entries(DEFAULT_BINDINGS.keys)) if (codes.some((c) => keyName(c) === name)) return a as Bindable
  return null
}
const nearestOf = <T extends { x: number; y: number }>(list: T[], x: number, y: number) =>
  list.reduce<T | null>((b, c) => (!b || Math.hypot(c.x - x, c.y - y) < Math.hypot(b.x - x, b.y - y) ? c : b), null)
function stranger(scene: Scene, prompt: Prompt, n: number, pl: Player): HeldControls {
  const held = ctl()
  const t = prompt.text
  const key = (re: RegExp) => {
    const m = re.exec(t)
    return m ? actionOf(m[1]) : null
  }
  const L = scene.loop
  const p = scene.player
  const holdKey = key(/hold (\S+) (?:to|over|low)/i)
  if (/dive low/i.test(t)) {
    const a = key(/hold (\S+)$/i)
    if (a === 'up') held.climb = 1
    if (a === 'down') held.climb = -1
    return held
  }
  if (/follow the arrow/i.test(t)) {
    const body = scene.bodies().find((b) => b.index === scene.zone.course)
    if (body) held.turn = toward(scene, body.x, body.y)
    return held
  }
  if (/shoot the training drones/i.test(t)) {
    const s = scene.status.target
    const drone = scene.listShips().find((x) => x.drill)
    const aim = s ? { x: s.leadX, y: s.leadY } : drone
    if (aim) {
      const off = wrapTurn(Math.atan2(aim.x - p.x, -(aim.y - p.y)) - p.heading)
      held.turn = Math.max(-1, Math.min(1, off * 3))
      held.fire = !!s && Math.abs(off) < 0.12
    }
    return held
  }
  if (/hold (\S+) to mine/i.test(t) || /scoop/i.test(t)) {
    const scoop = /scoop them/i.test(t)
    const mark = scoop ? nearestOf(L.chunks, p.x, p.y) : L.ore
    if (!mark) return held
    const d = Math.hypot(mark.x - p.x, mark.y - p.y)
    if (d > 70 || scoop) held.turn = toward(scene, mark.x, mark.y)
    else held.turn = 1
    held.land = !scoop && d < 140
    if (/lower/i.test(prompt.sub)) held.climb = 1
    return held
  }
  if (/fly home/i.test(t)) {
    if (L.home) held.turn = toward(scene, L.home.x, L.home.y)
    held.land = L.prompt === 'pad' || L.stage === 'landing'
    return held
  }
  if (/land on the pad at (.+): hold/i.test(t) || /land: hold/i.test(t)) {
    const pad = /land on the pad at (.+): hold/i.exec(t)
    const b = pad ? L.bases.find((x) => x.name === pad[1]) : null
    if (b && L.stage === 'flying') held.turn = toward(scene, b.x, b.y)
    held.land = holdKey === 'use' && (L.prompt === 'land' || L.prompt === 'pad' || L.stage === 'landing')
    return held
  }
  if (/tap (\S+) to get out/i.test(t) || /back in: walk to your ship/i.test(t) || /back to your ship/i.test(t)) {
    if (/get out/i.test(t)) {
      if (n % 30 === 0) scene.act('use')
      return held
    }
    const ship = scene.pilot
    const d = Math.hypot(ship.x - p.x, ship.y - p.y)
    const yaw = scene.foot.yaw
    const dx = ship.x - p.x
    const dy = ship.y - p.y
    if (d > 4) {
      held.turn = (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / d
      held.climb = -(dx * Math.sin(yaw) + dy * Math.cos(yaw)) / d
    }
    if (scene.foot.prompt === 'board' && n % 20 === 0) scene.act('use')
    return held
  }
  if (/plant a beacon/i.test(t)) {
    if (n % 40 === 0) {
      scene.act('view')
      scene.plantBeacon(0)
      pl.tut?.beaconPlanted()
    }
    return held
  }
  if (/call another/i.test(t)) {
    held.land = true
    return held
  }
  if (/steer for land/i.test(t)) return held
  if (holdKey === 'use') held.land = n % 90 < 70
  return held
}

// ── one player's half hour

function play(kind: Kind) {
  const pl = new Player(kind)
  const sc = pl.scene
  const said: { prompt: Prompt | null } = { prompt: null }
  const explore = { order: [] as number[], i: 0, landed: new Set<string>() }
  const hunt = { at: 0, quiet: 0, chase: 0, ignore: 0 }
  const trade = { sellAt: null as { world: string; base: number; system: number } | null }
  const foot = {
    stage: 'go',
    at: 0,
    wasX: 0,
    wasY: 0,
    around: 0,
    via: null as { x: number; y: number } | null,
    viaAt: 0,
    skip: new Set<number>(),
    since: 0,
    path: [] as { x: number; y: number }[],
    pathTo: { x: 0, y: 0 },
  }
  let zoneWas = sc.zone.key
  let stuckAt = 0
  let lastPos = { x: 0, y: 0 }
  let ambushed = false
  const name = namer('pointer')
  for (pl.n = 0; pl.n < MINUTES * 3600; pl.n++) {
    let c: HeldControls
    if (pl.screenLeft > 0) {
      pl.screenLeft--
      c = ctl()
    } else {
      c =
        kind === 'prompts'
          ? prompts(pl, said)
          : kind === 'miner'
            ? miner(pl)
            : kind === 'fighter'
              ? fighter(pl, hunt)
              : kind === 'explorer'
                ? explorer(pl, explore)
                : kind === 'trader'
                  ? trader(pl, trade)
                  : walker(pl, foot)
    }
    sc.setControls(c)
    sc.step(STEP)
    // what happened
    for (const snd of sc.takeSounds()) {
      if (snd.kind === 'eject' || snd.kind === 'die') {
        const fighting = activityOf(pl) === 'fight' || pl.goal.startsWith('fight') || pl.goal.startsWith('hunt') || pl.goal === 'chase'
        const shot = pl.t - pl.lastHit < 4
        const cause =
          snd.kind === 'die'
            ? `killed on foot (${stateOf(sc)!.foot.how || 'shot'})`
            : shot
              ? 'shot down'
              : sc.zone.kind === 'space'
                ? `lost in space (pull ${Math.round(sc.zone.pull)}, near ${nearestBody(sc)})`
                : 'crashed or burned'
        pl.deaths.push({ t: pl.t, cause, warned: pl.ambushAt >= 0 ? pl.t - pl.ambushAt : -1, loaded: pl.loaded, fighting, system: sc.zone.system })
        pl.ev('death', cause)
      }
      if ((snd.kind === 'hit' || snd.kind === 'shield') && snd.own) {
        if (pl.firstHit < 0) pl.firstHit = pl.t
        pl.lastHit = pl.t
      }
      if (snd.kind === 'crate') pl.ev('find', 'a crate')
      // (a gem scooped: a glint seen, chased and caught, a moment worth having in the mining)
      if (snd.kind === 'gemScoop') pl.ev('find', 'a gem')
    }
    if (sc.status.ambushed && !ambushed) {
      pl.ambushAt = pl.t
      pl.ev('ambush', sc.zone.key)
    }
    ambushed = sc.status.ambushed
    for (const e of sc.takeLedger()) {
      if (e.kind === 'bank') {
        for (const it of e.items) {
          pl.vault[it.id] = (pl.vault[it.id] ?? 0) + it.n
          pl.everHad.add(it.id)
        }
        pl.ev('bank', e.items.map((i) => `${i.n} ${i.id}`).join(', '))
        pl.tut?.holdBanked()
      }
      if (e.kind === 'bounty') {
        pl.credits += e.credits
        pl.earned += e.credits
        pl.ev('kill', `${e.what} ${e.credits} cr`)
      }
      if (e.kind === 'fee') pl.credits -= e.credits
      if (e.kind === 'picked') pl.ev('find', 'salvage')
    }
    for (const d of sc.takeDeeds()) {
      if (d.kind === 'flag') {
        pl.ev('flag', d.world)
        pl.flagged = pl.n
      }
      if (d.kind === 'salvage') pl.ev('find', 'a wreck stripped')
      if (d.kind === 'landed' && !pl.landedOn.has(d.world)) {
        pl.landedOn.add(d.world)
        if (pl.landedOn.size > 1) pl.ev('find', `first landing on ${d.world}`)
      }
    }
    // (a vein cut on foot: a find, once a vein)
    if (sc.foot.cutting && sc.foot.vein && !pl.veins.has(sc.foot.vein.id)) {
      pl.veins.add(sc.foot.vein.id)
      pl.ev('find', 'a vein')
    }
    // a new prompt the HUD offers
    const promptNow = sc.zone.kind === 'space' ? sc.zone.prompt : sc.loop.prompt
    if (promptNow && promptNow !== pl.lastPrompt) pl.ev('prompt', promptNow)
    pl.lastPrompt = promptNow
    // the tips that come up (as the page would show them), once each; the page's own: selling, when banked ore waits in the vault
    if (pl.tut?.done || kind !== 'prompts') {
      const view = {
        zone: sc.zone,
        loop: sc.loop,
        traces: sc.traces,
        interior: sc.interior,
        status: sc.status,
        mates: 0,
        affordable: [...WEAPONS.filter((w) => w.price > 0), ...MODULES].some((p) => !pl.owned.has(p.id) && pl.canBuy(p)),
        ship:
          pl.hulls.size > 1
            ? null
            : {
                name: pl.nextShip,
                why: '',
                price: '',
                can: pl.canBuy({ price: HULL_PRICES[pl.nextShip].credits, needs: HULL_PRICES[pl.nextShip].needs }),
                full: MODULES.filter((m) => pl.owned.has(m.id)).length >= pl.slots,
              },
        vault: Object.values(pl.vault).reduce((a, b) => a + (b ?? 0), 0),
        credits: pl.credits,
        home: sc.zone.system >= 0 && G.systems[sc.zone.system].side === 'nomarchy',
      }
      const tip = nextTip(view as Parameters<typeof nextTip>[0], pl.tipsShown, name, 'pointer')
      if (tip) {
        pl.tipsShown.push(tip.id)
        pl.ev('tip', tip.id)
      }
    }
    // a new zone
    if (sc.zone.key !== zoneWas) {
      zoneWas = sc.zone.key
      pl.arrived()
    }
    // stuck: the same place for a minute with the same goal → a new decision
    if (pl.n % 3600 === 0) {
      const p = sc.player
      if (Math.hypot(p.x - lastPos.x, p.y - lastPos.y) < 50 && pl.n - stuckAt > 3600 && activityOf(pl) !== 'screen') {
        pl.ev('decide', 'stuck: try something else')
        if (sc.loop.stage === 'landed') sc.act('use')
        stuckAt = pl.n
      }
      lastPos = { x: p.x, y: p.y }
    }
    if (process.env.DEBUG && pl.n % Number(process.env.DEBUG) === 0) {
      const f = sc.foot
      const pp = sc.player
      console.error(
        `${(pl.t / 60).toFixed(2)} ${pl.goal} | ${sc.zone.key} ${sc.loop.stage} prompt=${sc.loop.prompt}/${sc.zone.prompt} foot=${f.stage}/${f.ship}/${f.prompt} at ${Math.round(pp.x)},${Math.round(pp.y)} above ${Math.round(pp.above)}` +
          ` ship=${Math.round(sc.pilot.x)},${Math.round(sc.pilot.y)} site=${JSON.stringify(sc.traces.site && { x: Math.round(sc.traces.site.x), y: Math.round(sc.traces.site.y) })} atSite=${sc.traces.atSite} planting=${sc.traces.planting.toFixed(2)} vein=${JSON.stringify(f.vein && { x: Math.round(f.vein.x), y: Math.round(f.vein.y) })}`,
      )
    }
    // the second's activity
    const a = activityOf(pl)
    pl.tally.set(a, (pl.tally.get(a) ?? 0) + 1)
    if (pl.n % 60 === 59) {
      let most: Activity = 'transit'
      let mostN = -1
      for (const [k, v] of pl.tally) if (v > mostN) [most, mostN] = [k, v]
      pl.seconds.push({ act: most, zone: sc.zone.key })
      pl.tally.clear()
    }
  }
  return report(pl)
}

/** what the log says */
function report(pl: Player) {
  const T = pl.seconds.length
  const by = new Map<Activity, number>()
  for (const s of pl.seconds) by.set(s.act, (by.get(s.act) ?? 0) + 1)
  const rewards = pl.events.filter((e) => REWARD.includes(e.kind))
  const gaps: number[] = []
  let last = 0
  for (const r of rewards) {
    gaps.push(r.t - last)
    last = r.t
  }
  gaps.push(T - last)
  const sorted = [...gaps].sort((a, b) => a - b)
  // the longest stretches with nothing happening (no event of any kind) and with nothing to decide (no event, no decision)
  const stretch = (kinds: (e: Ev) => boolean) => {
    const ts = [0, ...pl.events.filter(kinds).map((e) => e.t), T].sort((a, b) => a - b)
    const spans: { from: number; to: number; s: number; doing: string }[] = []
    for (let i = 1; i < ts.length; i++) {
      const from = ts[i - 1]
      const to = ts[i]
      const acts = new Map<string, number>()
      for (let k = Math.floor(from); k < Math.min(T, Math.floor(to)); k++) acts.set(pl.seconds[k].act, (acts.get(pl.seconds[k].act) ?? 0) + 1)
      const doing = [...acts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')
      spans.push({ from: Math.round(from), to: Math.round(to), s: Math.round(to - from), doing })
    }
    return spans.sort((a, b) => b.s - a.s).slice(0, 5)
  }
  const firstOf = (kind: EventKind) => {
    const e = pl.events.find((x) => x.kind === kind)
    return e ? +(e.t / 60).toFixed(1) : null
  }
  const out = {
    kind: pl.kind,
    minutes: +(T / 60).toFixed(1),
    credits: pl.credits,
    earned: pl.earned,
    perMinute: Math.round(pl.earned / Math.max(1, T / 60)),
    hulls: [...pl.hulls],
    parts: [...pl.owned],
    hull: pl.hull,
    worlds: pl.worlds.size,
    systems: pl.systems.size,
    time: Object.fromEntries([...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, `${v} s (${Math.round((v / T) * 100)}%)`])),
    rewards: {
      count: rewards.length,
      perTenMinutes: +((rewards.length / T) * 600).toFixed(1),
      gapMedian: sorted[Math.floor(sorted.length / 2)] ? Math.round(sorted[Math.floor(sorted.length / 2)]) : 0,
      gapLongest: Math.round(sorted[sorted.length - 1] ?? 0),
      kinds: Object.fromEntries(REWARD.map((k) => [k, rewards.filter((r) => r.kind === k).length]).filter(([, n]) => n)),
    },
    quietest: stretch((e) => e.kind !== 'decide' && e.kind !== 'prompt' && e.kind !== 'tip'),
    emptiest: stretch(() => true),
    deaths: pl.deaths.map((d) => ({
      at: +(d.t / 60).toFixed(1),
      cause: d.cause,
      loaded: d.loaded,
      fighting: d.fighting,
      warned: d.warned < 0 ? 'no warning' : `${Math.round(d.warned)} s after AMBUSH`,
      avoidable: d.fighting ? 'chose the fight' : d.warned >= 5 ? 'yes: warned in time' : d.warned >= 0 ? 'barely: warned under 5 s before' : 'no',
    })),
    firsts: {
      kill: firstOf('kill'),
      sale: firstOf('sale'),
      upgrade: firstOf('upgrade'),
      newWorld: firstOf('newWorld'),
      newSystem: firstOf('newSystem'),
      flag: firstOf('flag'),
      newShip: firstOf('ship'),
    },
    tips: pl.tipsShown,
    events: pl.events.filter((e) => e.kind !== 'prompt' && e.kind !== 'decide').map((e) => `${(e.t / 60).toFixed(2)} ${e.kind} ${e.what}`),
    // (a letter a second: t transit, C cruise, a air, j jump, f fight, m mining, L landing, l landed, S screen, w foot, d dead, W waiting)
    seconds: pl.seconds.map((s) => LETTER[s.act]).join(''),
  }
  return out
}

const results = []
for (const kind of wanted.length ? wanted : KINDS) {
  const started = Date.now()
  const r = play(kind)
  results.push(r)
  const { events, seconds, ...short } = r
  void seconds
  console.log(JSON.stringify(short, null, 1))
  console.log(`  (${events.length} events; played in ${((Date.now() - started) / 1000).toFixed(0)} s)`)
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 1))
