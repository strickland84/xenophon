// The guided first sortie (the plan's section 15): a new pilot's first three to five minutes, in his
// own side's home system, where the turrets make hunting a newcomer costly. One short prompt at a
// time, each teaching one control on the device he is using, each waiting for him to do it:
//
//   power    his ship's power switched on, docked (the power switch: its key named)
//   launch   from his side's capital station (Use held)
//   look     at his ship from behind, from the seat, and back overhead (the view key: the first thing that makes him
//            say "wow", as James put it after his first flights, 2026-11-18)
//   throttle closed and opened again (its keys, a mouse's wheel, a controller's right stick: James, 2026-11-19, "the
//            intro sortie/tutorial needs to explain Q and E and throttle up and down controls")
//   steer    to the capital world, the course's arrow showing the way (steering)
//   descend  over it, down to its surface (Use held)
//   dive     low, under the height the laser and the landing legs reach (diving)
//   target   three training drones put up ahead, one of them targeted (the target key: James, 2026-11-19, "we also need
//            a section about TARGETING with T")
//   drones   the three shot down (the guns)
//   mine     the nearest outcrop cut, its ore scooped up (Use held, low)
//   land     on flat ground (Use held, low)
//   out      of the ship (Use tapped)
//   beacon   planted, its words chosen (the view button, on foot)
//   board    the ship again (Use, by it)
//   bank     home: landed at one of his side's bases, the hold banked (following HOME)
//   free     the galaxy map opens with today's hotspots, and he is on his own
//
// It is the page's, and works through the scene's ordinary API alone, as any player's game would:
// the course (setCourse), the guide's mark (setGuide), and the drones (addShip: `drill` ships, which
// only this game knows of and nothing is told about). A pilot in the first sortie is in his home
// system for real: his side's patrols and haulers go about their business round him, and no raiders
// live there (an enemy pilot may still come). Nothing traps him: every step can be skipped, the whole of it
// ended, and wherever he finds himself (shot down, killed, docked again, gone down to another world,
// inside) the prompt says how to get back on, or the step that fits where he is now takes over.
//
// Nothing here touches the page: the tests drive a real scene with it (tutorial.spec.ts).

import { DRILL, homeWorld } from '../engine'
import type {
  BodyState,
  CombatStatus,
  FootStatus,
  GuideMark,
  InteriorStatus,
  LoopStatus,
  ShipInput,
  ShipState,
  TargetStatus,
  ViewMode,
  ZoneStatus,
} from '../engine'
import type { Bindable } from '../input/bindings'
import type { InputKind } from '../input/hints'

export type StepId =
  | 'power'
  | 'launch'
  | 'look'
  | 'throttle'
  | 'steer'
  | 'descend'
  | 'dive'
  | 'target'
  | 'drones'
  | 'mine'
  | 'land'
  | 'out'
  | 'beacon'
  | 'board'
  | 'bank'
  | 'free'
export const STEPS: StepId[] = [
  'power',
  'launch',
  'look',
  'throttle',
  'steer',
  'descend',
  'dive',
  'target',
  'drones',
  'mine',
  'land',
  'out',
  'beacon',
  'board',
  'bank',
  'free',
]

/** what the first sortie reads of the scene and does with it (a Scene is one) */
export interface TutorialScene {
  readonly zone: ZoneStatus
  readonly loop: LoopStatus
  readonly foot: FootStatus
  readonly interior: InteriorStatus
  readonly status: CombatStatus
  readonly player: { x: number; y: number; height: number; heading: number; above: number }
  /** the view it is drawn in now (overhead, from behind, the seat) */
  readonly view: ViewMode
  /** what the pilot has picked with the target key (null: nothing) */
  readonly target: TargetStatus | null
  listShips(): ShipState[]
  bodies(): BodyState[]
  addShip(ship: Partial<ShipInput>): number
  removeShip(id: number): void
  setGuide(mark: GuideMark | null): void
  setCourse(body: number): void
}

/** what the prompt says now: the step, how far along (`index` of `of`), and the line; a detour is a line about getting back on */
export interface Prompt {
  step: StepId
  index: number
  of: number
  text: string
  /** a second, quieter line ('' none): how many drones are left, a raid coming */
  sub: string
  detour: boolean
}

/** px over the ground the dive step wants him under (the laser and the landing legs reach 150; the ore it cuts is scooped from under 95) */
export const DIVE_TO = 90
/** the drones: how many, and where they are put, ahead of him and to the side (px) */
export const DRONES: [number, number][] = [
  [230, -60],
  [290, 70],
  [350, -15],
]
/** the last line, when the first sortie is over (the galaxy map opens on it) */
export const FREE_LINE = 'Training flight done. The marked worlds on the map have the richest ore today'
export const FREE_SUB = 'Credits buy parts and better ships'
/** what the target's status calls a training drone (render/targetinfo.ts) */
const DRONE_NAME = 'TRAINING DRONE'
/** the throttle step: closed to this share or less, then opened again to this share or more */
export const THROTTLE_LOW = 0.3
export const THROTTLE_HIGH = 0.9
/** units of ore in the hold that count as mined */
export const MINED = 5

export interface TutorialOptions {
  side: 'nomarchy' | 'anarchoi'
  /** the step to begin at (a save's), or the first */
  step?: StepId
  /** the device in use and its names for each action (input/hints.ts namer); `stick` says up dives */
  input: () => InputKind
  name: (a: Bindable) => string
  stick: () => boolean
}

export class Tutorial {
  step: StepId
  private readonly o: TutorialOptions
  /** the drones still up (this scene's ids), whether they were put up this step, how many are down, and the zone they were put up in */
  private drones: number[] = []
  private dronesUp = false
  private downed = 0
  private droneZone = ''
  /** the course has been set for the steer step */
  private coursed = false
  /** the laser has cut this step (the ore is to be scooped up now) */
  private cutting = false
  /** a beacon was planted, the hold was banked (the page says: it sees the wheel and the ledger) */
  private planted = false
  private banked = false
  /** the views seen in the look step (from behind, then the seat) */
  private looked = new Set<ViewMode>()
  /** the throttle step: closed far enough down (it is to be opened again after) */
  private slowed = false
  /** the step changed (the page saves it) */
  changed = false

  constructor(o: TutorialOptions) {
    this.o = o
    this.step = o.step && STEPS.includes(o.step) ? o.step : 'power'
  }

  get done() {
    return this.step === 'free'
  }

  /** the capital world of his side, where the first sortie goes down */
  get world() {
    return homeWorld(this.o.side)
  }

  /** on to the next step (Skip) */
  skip(scene: TutorialScene) {
    this.go(scene, STEPS[Math.min(STEPS.length - 1, STEPS.indexOf(this.step) + 1)])
  }

  /** the whole of it ended: he is on his own */
  end(scene: TutorialScene) {
    this.go(scene, 'free')
  }

  /** the page saw a beacon planted, or the hold banked */
  beaconPlanted() {
    this.planted = true
  }
  holdBanked() {
    this.banked = true
  }

  private go(scene: TutorialScene, step: StepId) {
    if (step === this.step) return
    // (drones left over are taken away once their steps are behind him)
    if ((this.step === 'drones' || this.step === 'target') && step !== 'drones' && step !== 'target') this.clearDrones(scene)
    this.step = step
    this.changed = true
    this.coursed = false
    this.cutting = false
    this.planted = false
    this.looked.clear()
    this.slowed = false
    if (step !== 'bank') this.banked = false
    scene.setGuide(null)
  }

  private clearDrones(scene: TutorialScene) {
    for (const id of this.drones) scene.removeShip(id)
    this.forgetDrones()
  }

  /** one frame: reads the scene, moves on when the step is done, does what the step needs (the course, the drones, the guide); the prompt to show */
  frame(scene: TutorialScene): Prompt {
    const was = this.step
    this.follow(scene)
    if (this.step !== was) this.changed = true
    const prompt = this.prompt(scene)
    return prompt
  }

  /** moves to the step that fits where he is, and on from a step that is done */
  private follow(scene: TutorialScene) {
    const z = scene.zone
    const L = scene.loop
    const space = z.kind === 'space'
    const surface = z.kind === 'surface'
    const aboard = scene.foot.stage === 'ship'
    const at = STEPS.indexOf(this.step)
    // (docked or landed with the power off, the switch comes first; up, launching is next)
    const cold = scene.status.power === 'off' || scene.status.power === 'stopping'
    const docked = L.stage === 'landed' ? (cold ? 'power' : 'launch') : 'steer'
    if (this.step === 'free' || z.travel) return
    // where he is decides which part of the sortie he is in
    if (surface && at <= STEPS.indexOf('descend')) return this.go(scene, 'dive')
    if (space && at >= STEPS.indexOf('dive')) return this.go(scene, docked)
    if (space && this.step === 'power' && L.stage === 'landed' && scene.status.power === 'on') return this.go(scene, 'launch')
    if (space && at <= STEPS.indexOf('launch') && L.stage === 'flying') return this.go(scene, 'look')
    if (this.step === 'look') {
      // (from behind, then from the seat, then back overhead, the easiest view to learn the rest in: all seen, and on)
      this.looked.add(scene.view)
      if (this.looked.has('chase') && this.looked.has('cockpit') && scene.view === 'top') return this.go(scene, 'throttle')
      if (space && L.stage === 'landed') return this.go(scene, docked)
      return
    }
    if (this.step === 'throttle') {
      // (closed down to a crawl, then opened up again)
      if (scene.status.throttle <= THROTTLE_LOW) this.slowed = true
      if (this.slowed && scene.status.throttle >= THROTTLE_HIGH) return this.go(scene, 'steer')
      if (space && L.stage === 'landed') return this.go(scene, docked)
      return
    }
    if (space && at > STEPS.indexOf('launch') && L.stage === 'landed') return this.go(scene, docked)
    if (space && this.step === 'steer' && z.prompt === 'descend') return this.go(scene, 'descend')
    if (space && this.step === 'descend' && z.prompt !== 'descend') return this.go(scene, 'steer')
    if (!surface && !space) return
    // on a world: the steps that are done
    switch (this.step) {
      case 'dive':
        if (aboard && scene.player.above < DIVE_TO) this.go(scene, 'target')
        return
      case 'target':
        // (one of the drones picked; or all three shot down without, and the shooting is done too)
        if (this.dronesUp && this.downed >= DRONES.length) this.go(scene, 'mine')
        else if (this.dronesUp && scene.target?.kind === 'ship' && scene.target.name === DRONE_NAME) this.go(scene, 'drones')
        return
      case 'drones':
        if (this.dronesUp && this.downed >= DRONES.length) this.go(scene, 'mine')
        return
      case 'mine': {
        const units = L.hold.reduce((n, s) => n + (s?.n ?? 0), 0)
        if (units >= MINED || (units > 0 && L.fill >= 1)) this.go(scene, 'land')
        return
      }
      case 'land':
        if (L.stage === 'landed') this.go(scene, 'out')
        return
      case 'out':
        if (scene.foot.stage === 'walking') this.go(scene, 'beacon')
        else if (aboard && L.stage !== 'landed') this.go(scene, 'land')
        return
      case 'beacon':
        if (this.planted) this.go(scene, 'board')
        else if (aboard) this.go(scene, L.stage === 'landed' ? 'out' : 'land')
        return
      case 'board':
        if (aboard) this.go(scene, 'bank')
        return
      case 'bank':
        if (this.banked || (L.stage === 'landed' && L.base?.friendly && L.hold.every((s) => !s))) this.go(scene, 'free')
        return
    }
  }

  /** the line for this step, or for getting back on, worded for the device in use */
  private prompt(scene: TutorialScene): Prompt {
    const n = this.o.name
    const input = this.o.input()
    const pad = input === 'ps' || input === 'pad'
    const index = STEPS.indexOf(this.step)
    const of = STEPS.length - 1
    const say = (text: string, sub = '', detour = false): Prompt => ({ step: this.step, index, of, text, sub, detour })
    const z = scene.zone
    const L = scene.loop
    const foot = scene.foot
    const world = this.world.name
    const use = n('use')
    // (the power switch, as the device in use calls it)
    const power = n('power')
    const cold = scene.status.power === 'off' || scene.status.power === 'stopping'
    /** taking off, from wherever he is landed: the power first, if it is off */
    const takeOff = cold ? `Press ${power} to power up, then hold ${use} to take off` : `Hold ${use} to take off`
    // (the drones go with the world he leaves)
    if (z.kind !== 'surface' && this.dronesUp && !z.travel) this.forgetDrones()
    if (this.step === 'free') {
      scene.setGuide(null)
      return say(FREE_LINE, FREE_SUB)
    }
    if (z.travel) return say(z.travel === 'down' ? `Going down to ${world}` : 'Under way', '', false)

    // ── getting back on: shot down, killed, inside
    if (foot.up) return say(`Back to the seat to carry on: press ${n('seat')}`, 'The ship flies itself while you are up', true)
    if (z.kind === 'interior') return say('Leave at the top to carry on', '', true)
    // (out of the ship, shot down or flown into the ground: steering for land only where he would come down in the sea)
    if (foot.stage === 'falling')
      return foot.down.safe
        ? say('Ejected: you will come down on land', '', true)
        : say(pad ? 'Ejected: steer for land as you come down' : 'Ejected: steer for land with the keys', '', true)
    if (foot.stage === 'dead') return say('Killed: you will be back at a base in a moment', '', true)
    const wantsFoot = this.step === 'beacon' || (this.step === 'out' && foot.stage === 'walking')
    if (foot.stage === 'walking' && !wantsFoot && this.step !== 'board') {
      if (foot.ship === 'parked') return say(`Back to your ship: walk to it and press ${use}`, '', true)
      if (foot.ship === 'gone') return say(`Your ship is lost: hold ${use} to call another`, '', true)
      if (foot.ship === 'coming') return say(`Your ship is coming: ${Math.ceil(foot.call)} s`, '', true)
    }
    const raid = scene.listShips().some((s) => s.side === 1 && !s.drill && s.hullLeft > 0)
    const sub = raid ? 'Raiders! Fight them, or fly for a base: its turrets help' : ''
    const flyingSteps: StepId[] = ['dive', 'target', 'drones', 'mine', 'land']
    if (z.kind === 'surface' && L.stage === 'landed' && (flyingSteps.includes(this.step) || (this.step === 'bank' && !L.base?.friendly)))
      return say(takeOff, sub, true)

    switch (this.step) {
      case 'power':
        scene.setGuide(null)
        if (scene.status.power === 'starting') return say('Powering up: the screens come alive, then the engines')
        return say(`Press ${power} to power up your ship`, 'Docked, a ship waits with its power off')
      case 'launch':
        scene.setGuide(null)
        return say(
          cold ? `Press ${power} to power up, then hold ${use} to launch` : `Hold ${use} to launch from ${L.base?.name ?? 'the station'}`,
          `${use} launches, lands and docks`,
        )
      case 'look': {
        const key = n('view')
        if (this.looked.has('cockpit'))
          return say(`${key} again: back above your ship`, 'The easiest view to learn in. Change it whenever you like')
        return this.looked.has('chase')
          ? say(`${key} again: the cockpit`)
          : say(`Press ${key}: see your ship from behind`, 'Then again, for the cockpit')
      }
      case 'throttle': {
        const close = pad ? 'pull the right stick back' : `hold ${n('slower')}`
        const open = pad ? 'push the right stick up' : `hold ${n('faster')}`
        return this.slowed
          ? say(`Now open it again: ${open}`, 'All the way open for full speed')
          : say(
              `Close the throttle: ${close}`,
              `The third bar at the bottom left shows how open it is${pad ? '' : '. The mouse wheel moves it too'}`,
            )
      }
      case 'steer': {
        this.setCourse(scene)
        const steer = pad ? 'Left stick to steer' : `Steer with the mouse (or ${n('left')} ${n('right')})`
        return say(`${steer} for ${world}: follow the arrow`, sub || 'Fly on until you are over it')
      }
      case 'descend':
        return say(`Hold ${use} over ${world} to go down to it`, sub || 'Dive on down to its ground')
      case 'dive': {
        const dive = pad ? `push the left stick ${this.o.stick() ? 'up' : 'down'}` : `hold ${n('down')}`
        return say(
          `Dive low: ${dive}`,
          Math.round(scene.player.above) > DIVE_TO ? `${Math.round(scene.player.above)} up. Mine and land under ${DIVE_TO}` : sub,
        )
      }
      case 'target': {
        this.putUpDrones(scene)
        const press = `press ${n('target')}`
        return say(`Target a training drone: ${press}`, sub || `Again for the next. Held, it lets go`)
      }
      case 'drones': {
        this.putUpDrones(scene)
        const left = DRONES.length - this.downed
        const fire = pad ? `${n('fire')} fires` : n('fire') !== '?' ? `click (or ${n('fire')}) to fire` : 'click to fire'
        return say(`Shoot the training drones: ${fire}`, sub || `${left} left`)
      }
      case 'mine': {
        if (L.mining) this.cutting = true
        const p = scene.player
        // (the ore cut: the guide on the nearest chunk, to scoop it up; else on the outcrop)
        const chunk = this.cutting && !L.mining ? nearest(L.chunks, p.x, p.y) : null
        const ore = chunk ?? L.ore
        scene.setGuide(ore ? { x: ore.x, y: ore.y, z: ore.z, label: chunk ? 'chunk' : 'ore' } : null)
        const low = p.above > DIVE_TO ? `Lower: under ${DIVE_TO} to scoop it up` : ''
        if (chunk) return say('Fly low over the chunks to scoop them into your hold', sub || low)
        return say(`Fly low over the ore and hold ${n('mine')} to mine it`, sub || low)
      }
      case 'land': {
        // (the pad of the base nearest him that is not his side's capital: a world's outpost; any flat ground will do as well)
        const p = scene.player
        const pad = nearest(
          L.bases.filter((b) => !b.capital),
          p.x,
          p.y,
        )
        scene.setGuide(pad ? { x: pad.x, y: pad.y, z: pad.z, label: 'pad' } : null)
        return say(
          pad ? `Land on the pad at ${pad.name}: hold ${use} low over it` : `Land: hold ${use} low over flat ground`,
          sub || 'Or wherever the HUD says LAND',
        )
      }
      case 'out':
        return say(
          `Tap ${use} to get out`,
          pad ? 'On foot, the left stick walks' : `On foot, ${n('up')}${n('left')}${n('down')}${n('right')} walks`,
        )
      case 'beacon':
        return say(`Plant a beacon: ${n('view')}, then pick its words`, 'Pilots landing here will read it')
      case 'board':
        return say(`Back in: walk to your ship and press ${use}`)
      case 'bank': {
        const carrying = L.hold.some((s) => !!s)
        scene.setGuide(!carrying && L.home ? { x: L.home.x, y: L.home.y, label: 'home' } : null)
        if (L.stage === 'landed') return say(takeOff, sub)
        return say(
          carrying ? `Fly HOME and land on its pad to bank your ore: hold ${use}` : `Fly HOME and land on its pad: hold ${use}`,
          sub || (L.home ? `${L.home.name} · ${Math.round(L.home.d)}` : ''),
        )
      }
    }
    return say('')
  }

  /** the steer step's course: to the capital world */
  private setCourse(scene: TutorialScene) {
    if (this.coursed) return
    const body = scene.bodies().find((b) => b.world === this.world.id)
    if (body) {
      scene.setCourse(body.index)
      this.coursed = true
    }
  }

  /** the drones step: three drones put up ahead (once, flying, on a world); downed ones counted; the guide on the nearest left */
  private putUpDrones(scene: TutorialScene) {
    const z = scene.zone
    if (!this.dronesUp) {
      if (scene.foot.stage !== 'ship' || scene.loop.stage !== 'flying') return
      const p = scene.player
      const sn = Math.sin(p.heading)
      const cs = Math.cos(p.heading)
      this.drones = DRONES.map(([ahead, across]) =>
        scene.addShip({
          x: p.x + sn * ahead + cs * across,
          y: p.y - cs * ahead + sn * across,
          height: p.height,
          heading: p.heading + Math.PI / 2,
          hull: DRILL.hull,
          speed: 50,
          side: 1,
          pilot: 1,
          drill: true,
          paint: DRILL.paint,
        }),
      )
      this.dronesUp = true
      this.downed = 0
      this.droneZone = z.key
    }
    const ships = scene.listShips()
    const p = scene.player
    let near: ShipState | null = null
    for (const id of [...this.drones]) {
      const s = ships.find((x) => x.id === id)
      if (!s) {
        // (gone from the zone he is still in: shot down)
        this.drones = this.drones.filter((x) => x !== id)
        if (z.key === this.droneZone) this.downed++
        continue
      }
      if (!near || Math.hypot(s.x - p.x, s.y - p.y) < Math.hypot(near.x - p.x, near.y - p.y)) near = s
    }
    scene.setGuide(near ? { ship: near.id, label: 'drone' } : null)
  }

  /** the drones went with the zone (he left the world): put up afresh if he comes back to this step */
  private forgetDrones() {
    this.drones = []
    this.dronesUp = false
    this.downed = 0
  }
}

/** the nearest of some points to (x, y), or null */
function nearest<T extends { x: number; y: number }>(list: T[], x: number, y: number): T | null {
  let best: T | null = null
  let bd = Infinity
  for (const p of list) {
    const d = Math.hypot(p.x - x, p.y - y)
    if (d < bd) {
      bd = d
      best = p
    }
  }
  return best
}
