// Scripted flights used to pin the renderer's output. Each one drives a scene with fixed
// time steps and inputs, and returns a list of fingerprints of the frames it drew. The
// fingerprints are compared against the ones recorded in `frames/`, so any change to
// the picture — a pixel, a frame early or late — fails the test. The fights also check that
// what they were written to show happened (a kill, a dodge, a pilot ejecting), and throw if not.
//
// This file imports nothing, on purpose: it only needs a scene factory handed to it.

export interface GoldenParams {
  [key: string]: unknown
}

export interface GoldenScene {
  setParams(next: never): void
  resize(w: number, h: number): void
  pointerMove(x: number, y: number): void
  pointerLeave(): void
  setControls(held: Held): void
  act(action: 'roll' | 'use' | 'view' | 'cruise' | 'power' | 'seat' | 'target'): void
  setTarget(ref: { kind: 'ship'; id: number } | { kind: 'body'; index: number } | null): void
  readonly target: { kind: string; name: string; what: string; rel: string } | null
  replayIntro(): void
  addShip(ship: GoldenParams): number
  updateShip(id: number, change: GoldenParams): void
  removeShip(id: number): void
  setRoom(room: GoldenParams): void
  takeReports(): { kind: string; target?: number; by?: number }[]
  hit(target: number, amount: number, by: number, dx: number, dy: number, dz: number, hull: boolean, foot?: boolean): void
  setSquad(squad: { on: boolean; mates: { id: number; callsign: string }[] }): void
  goInside(place: 'hangar' | 'deck' | 'ship'): boolean
  goOutside(): void
  setFurniture(list: { id: string; x: number; y: number }[]): void
  kitOf(hull: string): { id: string; x: number; y: number }[]
  placeFurniture(id: string): void
  takeUses(): { kind: string; spot?: string }[]
  readonly interior: {
    place: string
    x: number
    y: number
    rooms: number
    room: string
    spot: string
    placing: string
    placeOk: boolean
    flying?: boolean
    struck?: number
  }
  readonly view?: string
  listShips(): {
    id: number
    x: number
    y: number
    hullLeft: number
    shieldLeft: number
    side: number
    band: number
    faction: string
    lurk: boolean
    traffic: boolean
  }[]
  clearedBands(): { band: number; until: number }[]
  shootDown(target: number, by: number, worth?: number): void
  launchMissile(from: number, target: number): number
  addFeed(line: { parts: { text?: string; mark?: number; color: string }[] }): void
  step(dt: number): void
  render(): Uint8ClampedArray
  readonly flames: { count: number; data: Float32Array }
  readonly player: { x: number; y: number; height: number; heading: number; above: number }
  setGuide(mark: GoldenParams | null): void
  readonly status: {
    flying: boolean
    hull: number
    shield: number
    incoming: number
    lock: number
    missiles: number
    missilesMax: number
    slip: number
    throttle: number
    speed: number
    power: string
    safe: boolean
    target: { leadX: number; leadY: number } | null
    skirmish: { stage: string; wave: number; kills: number; score: number }
  }
  takeSounds(): { kind: string }[]
  throttleBy(amount: number): void
  setThrottle(level: number): void
  readonly worldKey: string
  placePlayer(x: number, y: number, heading: number): void
  setCourse(body: number): void
  bodies(): { index: number; kind: string; name: string; x: number; y: number; size: number; world: string }[]
  readonly zone: {
    kind: string
    key: string
    system: number
    travel: string
    over: string
    cruise: string
    prompt: string
    pace: number
    pull: number
  }
  readonly zoom: number
  readonly fit?: { w: number; h: number; least?: number; tallest?: number } | null
  readonly pilot: { x: number; y: number; ship: number }
  readonly foot: {
    stage: string
    ship: string
    call: number
    health: number
    prompt: string
    pack: ({ id: string; n: number } | null)[]
    hidden: boolean
    yaw: number
    stolenFrom: string
    vein: { x: number; y: number } | null
    down: { x: number; y: number; safe: boolean }
    shore: { x: number; y: number; d: number } | null
    up?: boolean
  }
  setTraces(traces: GoldenParams): void
  wildlife(): {
    up: number
    by: Record<string, number>
    creatures: { id: number; kind: string; x: number; y: number; health: number; mode: number }[]
    homes: { id: number; kind: string; x: number; y: number; count: number }[]
    drops: { item: string; n: number; x: number; y: number; rare: boolean }[]
    globs: { x: number; y: number; z: number }[]
  }
  takeDeeds(): { kind: string; world: string; x: number; y: number; z: number; n: number; id?: string; path?: number[] }[]
  recordGhost(on: boolean): void
  plantBeacon(phrase: number): void
  oreLeft(id: number): number
  readonly traces: {
    holder: string
    hotspot: boolean
    reading: { callsign: string; words: string } | null
    planting: number
    recording: number
    site: { x: number; y: number; z: number } | null
  }
  addWalker(walker: GoldenParams): number
  updateWalker(id: number, change: GoldenParams): void
  walkerDied(id: number, by: number): void
  yieldShip(): unknown
  stealGranted(id: number, items: { id: string; n: number }[], owner: string): void
  setClock(utcSeconds: number): void
  takeLedger(): { kind: string; items?: { id: string; n: number }[]; credits?: number }[]
  setPurse(credits: number): void
  loadHold(items: { id: string; n: number }[]): unknown
  readonly loop: {
    fill: number
    stage: string
    base: unknown
    prompt: string
    home: { x: number; y: number } | null
    ore: { x: number; y: number; z: number; left: number } | null
    crates: { x: number; y: number; z: number }[]
  }
}

export type SceneFactory = (params: never) => GoldenScene

/** the settings for flying a world of the galaxy: the `nth` of a kind ('canyon', 'moon' …), with this weather if one is named */
export type WorldPicker = (kind: string, nth?: number, weather?: string) => GoldenParams

/** what is held down (see HeldControls in sim/controls.ts) */
interface Held {
  turn: number
  climb: number
  boost: number
  fire: boolean
  secondary: boolean
  land?: boolean
  throttle?: number
  mine?: boolean
  target?: boolean
}
/** keys or a stick held at `turn` and `climb`, the thrusters opened `boost`, the guns firing or not */
const held = (turn: number, climb: number, boost = 0, fire = false, secondary = false): Held => ({ turn, climb, boost, fire, secondary })

const DT = 1 / 60
/** numbers kept per smooth flame (FLAME_F in render/jet.ts) */
const FLAME_NUMBERS = 19
/** a fingerprint is recorded once every this many frames (every frame still counts towards it) */
const EVERY = 15

function fnv(hash: number, bytes: Uint8Array | Uint8ClampedArray) {
  let h = hash
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** drives one scene and collects fingerprints of what it draws */
class Flight {
  readonly scene: GoldenScene
  readonly marks: string[] = []
  private params: GoldenParams
  private hash = 0x811c9dc5
  private frames = 0
  /** the frame's size at the usual zoom, and the zoom it is drawn at now (on foot the art pixels are larger, as on the page) */
  private size: [number, number]
  private zoom = 1

  constructor(create: SceneFactory, defaults: GoldenParams, overrides: GoldenParams, w: number, h: number) {
    // (the galaxy's own ships, its bands of raiders, patrols and haulers, are left out unless a flight asks
    // for them: the flights written before them pin other things, and the flights of where enemies live put them in)
    this.params = { ...defaults, locals: false, ...overrides }
    this.scene = create(this.params as never)
    this.scene.resize(w, h)
    this.size = [w, h]
  }

  set(overrides: GoldenParams) {
    this.params = { ...this.params, ...overrides }
    this.scene.setParams(this.params as never)
  }

  /** every sound heard so far, by kind */
  readonly heard: Record<string, number> = {}

  /** run for a number of frames; `each` is called before every step with the frame's number */
  fly(frames: number, each?: (n: number) => void) {
    for (let n = 0; n < frames; n++) {
      each?.(n)
      this.scene.step(DT)
      // (the camera pulled in on foot: the page shows larger art pixels, so the frame is smaller; no larger than lets the
      // hangar or the deck be seen whole; in the seat, no smaller than keeps the frame within its cockpit's art)
      const fit = this.scene.fit
      const zoom = Math.max(
        fit?.least ?? 0,
        fit?.tallest ? this.size[1] / fit.tallest : 0,
        Math.min(this.scene.zoom ?? 1, fit?.w && fit.h ? Math.min(this.size[0] / fit.w, this.size[1] / fit.h) : 99),
      )
      if (zoom !== this.zoom) {
        this.zoom = zoom
        this.scene.resize(Math.round(this.size[0] / zoom), Math.round(this.size[1] / zoom))
      }
      for (const s of this.scene.takeSounds()) this.heard[s.kind] = (this.heard[s.kind] ?? 0) + 1
      this.hash = fnv(this.hash, this.scene.render())
      const flames = this.scene.flames
      if (flames.count > 0) {
        const used = flames.data.subarray(0, flames.count * FLAME_NUMBERS)
        this.hash = fnv(this.hash, new Uint8Array(used.buffer, used.byteOffset, used.byteLength))
      }
      this.hash = fnv(this.hash, new Uint8Array([flames.count]))
      this.frames++
      if (this.frames % EVERY === 0) this.mark()
    }
  }

  mark() {
    this.marks.push(this.hash.toString(16).padStart(8, '0'))
  }

  /** the flight did not show what it was written to show */
  expect(ok: boolean, what: string) {
    if (!ok) throw new Error(`expected ${what}; heard ${JSON.stringify(this.heard)}, status ${JSON.stringify(this.scene.status)}`)
  }

  /** what happened to the player's property so far, by kind (the ledger, as the page would keep it) */
  readonly ledger: Record<string, number> = {}
  takeLedger() {
    for (const e of this.scene.takeLedger()) this.ledger[e.kind] = (this.ledger[e.kind] ?? 0) + 1
  }

  /** the keys turn towards (x, y), and Land is held or not; `dive` pushes down (+1) or pulls up (−1) */
  toward(x: number, y: number, land = false, dive = 0, boost = 0) {
    const p = this.scene.player
    let off = Math.atan2(x - p.x, -(y - p.y)) - p.heading
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
    this.scene.setControls({ ...held(Math.max(-1, Math.min(1, off * 2.5)), dive, boost), land })
  }

  /** on foot (or coming down): the keys pushed towards (x, y) the way the screen shows it, running or not; Use held or not */
  walk(x: number, y: number, run = false, use = false, fire = false, cut = false) {
    const p = this.scene.player
    const yaw = this.scene.foot.yaw
    const dx = x - p.x
    const dy = y - p.y
    const n = Math.hypot(dx, dy)
    if (n < 2) {
      this.scene.setControls({ ...held(0, 0, 0, fire), land: use, mine: cut })
      return
    }
    const c = Math.cos(yaw)
    const s = Math.sin(yaw)
    const sx = (dx * c - dy * s) / n
    const sy = (dx * s + dy * c) / n
    this.scene.setControls({ ...held(sx, -sy, run ? 1 : 0, fire), land: use, mine: cut })
  }

  /** how far the player is from (x, y), across the ground */
  from(x: number, y: number) {
    return Math.hypot(x - this.scene.player.x, y - this.scene.player.y)
  }

  /** the keys turn towards the lead point on the enemy in the sights (or round, with none), and fire once it is nearly in line (if `guns`); a missile goes once locked (if `missiles`) */
  hunt(boost = 0, guns = true, missiles = true) {
    const s = this.scene
    const t = s.status.target
    const p = s.player
    let turn = 1
    let fire = false
    if (t) {
      let off = Math.atan2(t.leadX - p.x, -(t.leadY - p.y)) - p.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      turn = Math.max(-1, Math.min(1, off * 3))
      fire = guns && Math.abs(off) < 0.1
    }
    s.setControls(held(turn, 0, boost, fire, missiles && !!t && s.status.lock >= 1))
  }
}

/** a pilot's look for the flights on foot: a Solari in a navy suit with gold trim (races/races.ts lookText) */
const SOLARI = 'solari.0.0.0.3a4a6a.f2c14e'
/** … a Kestrin with white feathers, and two Orrin, one in brass and one in copper */
const KESTRIN = 'kestrin.1.2.1.e8e4dc.ff5a8a'
const ORRIN = 'orrin.2.0.0.2f5a3a.f2c14e'
const ORRIN_COPPER = 'orrin.0.1.2.7a4a2a.5af0ff'

/** the moment the loop's flights happen at (seconds since 1970): it decides which period each outcrop is in */
const LOOP_CLOCK = 1_800_000_000

/** the enemy's colours, as the skirmish paints them */
const ENEMY = { body: '#5e2a2e', accent: '#ffc83a', canopy: '#e8503a' }
/** the two factions' colours, and their marks (1 a triangle, 2 a diamond) */
const GOLD = '#f2c14e'
const VIOLET = '#a46cf0'

/** a point `ahead` px in front of the player and `across` px to his right, with his heading */
function besidePlayer(scene: GoldenScene, ahead: number, across: number) {
  const p = scene.player
  const sn = Math.sin(p.heading)
  const cs = Math.cos(p.heading)
  return { x: p.x + sn * ahead + cs * across, y: p.y - cs * ahead + sn * across, height: p.height, heading: p.heading }
}

export type Script = (create: SceneFactory, defaults: GoldenParams, worlds: WorldPicker) => string[]

/** landed at the Nomarchy's capital, ready to go inside */
const INSIDE_BASE: GoldenParams = { intro: false, skirmish: false, side: 'nomarchy', world: 'w0', look: 'solari.0.0.0.3a4a6a.f2c14e' }

/** inside: the keys pushed towards (x, y) in the room; true (and the keys let go) once he is there */
function walkInside(scene: GoldenScene, x: number, y: number) {
  const it = scene.interior
  const dx = x - it.x
  const dy = y - it.y
  const n = Math.hypot(dx, dy)
  if (n < 3) {
    scene.setControls(held(0, 0))
    return true
  }
  scene.setControls({ ...held(dx / n, -dy / n), land: false })
  return false
}

export const scenarios: Record<string, Script> = {
  // the opening: slices fall in, then the jet flies itself
  'intro, overhead, flying itself': (create, defaults) => {
    const f = new Flight(create, defaults, { skirmish: false }, 200, 120)
    f.fly(420)
    return f.marks
  },

  // the pointer steers; the buttons fire (nothing, yet), Space rolls, Shift opens the thrusters
  'overhead, steered by the pointer': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, wingmen: 1, skirmish: false }, 200, 120)
    f.fly(360, (n) => {
      const a = n * 0.03
      f.scene.pointerMove(100 + Math.cos(a) * 70, 60 + Math.sin(a) * 40)
      if (n === 40) f.scene.setControls(held(0, 0, 0, true))
      if (n === 44) {
        f.scene.setControls(held(0, 0, 0, false, true))
        f.scene.act('roll')
        f.scene.act('use')
      }
      if (n === 60) f.scene.setControls(held(0, 0))
      if (n === 162) f.scene.setControls(held(0, 0, 1))
      if (n === 260) f.scene.setControls(held(0, 0))
      if (n === 320) f.scene.pointerLeave()
    })
    return f.marks
  },

  // from behind, with the keys, two wingmen, at sunset
  'chase view, flown with the keys': (create, defaults) => {
    const f = new Flight(
      create,
      defaults,
      { intro: false, view: 'chase', wingmen: 2, timeOfDay: 'sunset', crash: false, skirmish: false },
      240,
      135,
    )
    f.fly(480, (n) => {
      if (n === 10) f.scene.setControls(held(1, 0))
      if (n === 90) f.scene.setControls(held(1, 1))
      if (n === 170) f.scene.setControls(held(-1, -1, 1))
      if (n === 260) f.scene.setControls(held(0, -1, 0.5))
      if (n === 330) f.scene.setControls(held(-0.4, 0.6, 1))
      if (n === 300) f.scene.act('roll')
      if (n === 420) f.scene.setControls(held(0, 0))
    })
    return f.marks
  },

  // the throttle (James's first flight): S held down to a stop, the ship hanging still, turning and climbing in place, then
  // opened again a notch at a time by a mouse's wheel and all the way by W, and the thrusters from a standstill
  'the throttle: down to a stop and open again': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, view: 'chase', wingmen: 1, crash: false, skirmish: false }, 240, 135)
    let still = { x: 0, y: 0, height: 0 }
    f.fly(720, (n) => {
      const s = f.scene
      if (n === 10) s.setControls({ ...held(0, 0), throttle: -1 })
      if (n === 120) s.setControls(held(0, 0))
      if (n === 180) still = { ...s.player }
      if (n === 240) {
        const p = s.player
        f.marks.push(
          `stopped: throttle ${s.status.throttle}, speed ${s.status.speed}, moved ${Math.hypot(p.x - still.x, p.y - still.y).toFixed(2)}`,
        )
        s.setControls(held(0.6, -1)) // (pulled back: a climb, as a flight stick)
      }
      if (n === 330) {
        f.marks.push(
          `climbed in place ${(s.player.height - still.height).toFixed(0)}, moved ${Math.hypot(s.player.x - still.x, s.player.y - still.y).toFixed(2)}`,
        )
        s.setControls(held(0, 0))
      }
      if (n >= 340 && n < 390 && n % 10 === 0) s.throttleBy(0.1)
      if (n === 400) f.marks.push(`five notches: throttle ${s.status.throttle.toFixed(2)}`)
      if (n === 420) s.setControls({ ...held(0, 0), throttle: 1 })
      if (n === 520) s.setControls({ ...held(0, 0), throttle: -1 })
      if (n === 640) s.setControls(held(0, 0, 1))
      if (n === 700) f.marks.push(`thrusters from a stop: throttle ${s.status.throttle}, speed ${Math.round(s.status.speed)}`)
    })
    return f.marks
  },

  // through all three views and back, at night, rolling in the cockpit
  'the three views, at night': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, timeOfDay: 'night', wingmen: 1, transition: 0.8, skirmish: false }, 240, 135)
    f.fly(600, (n) => {
      if (n === 30) f.scene.act('view')
      if (n === 150) f.scene.act('view')
      if (n === 200) f.scene.setControls(held(0.7, 0.3, 1))
      if (n === 300) f.scene.act('roll')
      if (n === 380) f.scene.setControls(held(-1, -0.5))
      if (n === 450) f.scene.act('view')
      if (n === 470) f.scene.act('view') // redirected half-way
      if (n === 520) f.scene.setControls(held(0, 0))
    })
    return f.marks
  },

  // the cockpit steered by the pointer, by day
  'cockpit, steered by the pointer': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, view: 'cockpit', crash: false, invertY: false, skirmish: false }, 320, 180)
    f.fly(300, (n) => {
      f.scene.pointerMove(160 + Math.sin(n * 0.05) * 120, 60 + Math.cos(n * 0.031) * 70)
      if (n === 112) f.scene.setControls(held(0, 0, 1))
      if (n === 220) f.scene.setControls(held(0, 0))
    })
    return f.marks
  },

  // smooth flames are measured, not drawn: their numbers are part of the fingerprint
  'smooth flames': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, flameStyle: 'realistic', wingmen: 2, view: 'chase', skirmish: false }, 240, 135)
    f.fly(300, (n) => {
      if (n === 20) f.scene.setControls(held(0.8, 0.4, 1))
      if (n === 120) f.scene.act('view')
      if (n === 200) f.scene.setControls(held(-0.8, -0.2, 0.7))
      if (n === 240) f.scene.act('view')
    })
    return f.marks
  },

  // a dive held into the ground: crash, ejection, parachute, pick-up
  'crash and ejection, with the keys': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, view: 'chase', wingmen: 1, skirmish: false }, 240, 135)
    f.fly(900, (n) => {
      if (n === 10) f.scene.setControls(held(0.2, 1)) // (down climbs, like a stick: up dives)
      if (n === 700) f.scene.setControls(held(0, -1))
      if (n === 800) f.scene.setControls(held(0, 0))
    })
    return f.marks
  },

  // the same from the cockpit, pointing at the bottom of the frame, then again from overhead
  'crash and ejection, with the pointer': (create, defaults) => {
    const f = new Flight(
      create,
      defaults,
      { intro: false, view: 'cockpit', invertY: false, flameStyle: 'realistic', seed: 3, skirmish: false },
      240,
      135,
    )
    f.fly(840, (n) => {
      if (n < 400) f.scene.pointerMove(130, 134)
      else if (n < 560) f.scene.pointerMove(120, 40)
      else f.scene.pointerMove(120, 134)
      if (n === 500) f.scene.act('view')
    })
    return f.marks
  },

  // ships of every hull, each in its own paint, round the player and his wingmen: some told where
  // they are every frame, some left to fly on by themselves; one repainted, one rebuilt, one gone
  'ships of every hull': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, wingmen: 2, crash: false, skirmish: false }, 320, 180)
    const hulls = ['dart', 'sparrow', 'lance', 'corsair', 'wraith', 'prospector', 'mule', 'bastion', 'nomad', 'galleon']
    const paints = [
      { body: '#7a2f2f', accent: '#ffd23a' },
      { body: '#2f5a7a', accent: '#5af0ff', canopy: '#ff3' },
      {},
      { body: '#3a3a3a', accent: '#d03030' },
      { body: '#8a8f99', accent: '#3050ff' },
      { body: '#2e6b3a', accent: '#f0f0f0' },
      { body: '#6a3a7a', accent: '#ff9020' },
      { body: '#505050', accent: '#30ff60' },
      { accent: '#ff40a0' },
      { body: '#996633' },
    ]
    // each ship's place about the player: across and behind, px
    const place = (i: number, t: number) => [
      ((i % 5) - 2) * 78 + Math.sin(t * 0.9 + i) * 10,
      (i < 5 ? -90 : 110) + Math.cos(t * 0.7 + i * 2) * 14,
    ]
    const at = (i: number, t: number) => {
      const p = f.scene.player
      const [a, b] = place(i, t)
      const cs = Math.cos(p.heading)
      const sn = Math.sin(p.heading)
      return { x: p.x + a * cs - b * sn, y: p.y + a * sn + b * cs, height: p.height + ((i % 3) - 1) * 14, heading: p.heading }
    }
    const ids = hulls.map((hull, i) => f.scene.addShip({ ...at(i, 0), hull, paint: paints[i], speed: 92, thrust: (i % 4) / 3 }))
    f.fly(420, (n) => {
      const t = n / 60
      ids.forEach((id, i) => {
        const weave = Math.sin(t * 1.3 + i) * 0.35
        // the even ones are placed each frame; the odd ones only steered, and fly on by themselves
        if (i % 2 === 0) f.scene.updateShip(id, { ...at(i, t), heading: f.scene.player.heading + weave * 0.3, roll: weave })
        else f.scene.updateShip(id, { heading: f.scene.player.heading + weave * 0.2, roll: weave, thrust: 0.5 + 0.5 * Math.sin(t + i) })
      })
      if (n === 120) f.scene.act('view')
      if (n === 200) f.scene.updateShip(ids[3], { paint: { body: '#ddd', accent: '#09f' } })
      if (n === 240) f.scene.updateShip(ids[0], { hull: 'galleon' })
      if (n === 280) f.scene.removeShip(ids[9])
      if (n === 300) f.set({ timeOfDay: 'sunset' })
      if (n === 340) f.scene.act('view')
    })
    return f.marks
  },

  // every setting changed while it flies, and the frame resized
  'settings changed in flight': (create, defaults) => {
    const f = new Flight(create, defaults, { skirmish: false }, 200, 120)
    f.fly(540, (n) => {
      if (n === 30) f.set({ spread: 3 })
      if (n === 90) f.set({ spread: 1, jetScale: 1.6, wingmen: 2 })
      if (n === 130) f.set({ seed: 21 })
      if (n === 170) f.set({ land: 0.6, clouds: 0 })
      if (n === 210) f.set({ timeOfDay: 'sunset', bodyColor: '#335577', accentColor: 'rgb(40, 200, 90)', canopyColor: '#fa0' })
      if (n === 250) f.set({ shadow: false, trails: false, afterburner: 0.2, view: 'chase' })
      if (n === 290) f.scene.resize(160, 200)
      if (n === 330) f.set({ clouds: 1, chaseDistance: 5, chaseAngle: 30, chaseSize: 0.4, cameraFollow: 0 })
      if (n === 370) f.set({ wingmen: 0, speed: 160, boost: 3, agility: 2.4, bank: 80, altitude: 120, ceiling: 500, clearance: 20 })
      if (n === 400) f.scene.replayIntro()
      if (n === 410) f.set({ intro: false, stunts: false, followPointer: false, view: 'top', timeOfDay: 'night' })
      if (n === 420) f.scene.pointerMove(20, 20)
      if (n === 460) f.set({ intro: true })
    })
    return f.marks
  },

  // fights

  // a slow enemy ahead: two bursts of the cannon. Its shield goes, it smokes, it burns, it
  // bursts, and the wreck goes down in flames
  'a kill with the cannon': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false }, 240, 135)
    f.fly(420, (n) => {
      if (n === 10) f.scene.addShip({ ...besidePlayer(f.scene, 110, 6), hull: 'dart', speed: 58, side: 1, paint: ENEMY })
      if (n < 260) f.hunt(0, (n > 30 && n < 75) || n > 110, false)
      else f.scene.setControls(held(0.4, 0))
    })
    f.expect(f.scene.status.skirmish.kills === 1, 'the enemy shot down')
    return f.marks
  },

  // an enemy behind, flown by the computer as well as the eighth wave's pilots: it holds off
  // while the player's new ship is protected, then locks on and fires a missile; a roll at the
  // right moment shakes it off
  'a missile lock broken by a roll': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false, view: 'chase' }, 240, 135)
    f.fly(600, (n) => {
      if (n === 1) f.scene.addShip({ ...besidePlayer(f.scene, -170, 20), hull: 'lance', speed: 92, side: 1, pilot: 8, paint: ENEMY })
      // (straight on: the keys held, but only just)
      f.scene.setControls(held(0.001, 0))
      const coming = f.scene.status.incoming
      if (coming < 0.55 && coming > 0.3) f.scene.act('roll')
    })
    f.expect((f.heard.launch ?? 0) >= 1 && (f.heard.dodged ?? 0) >= 1, 'a missile fired and dodged')
    return f.marks
  },

  // a missile fired at an enemy ahead, and the rack filling again by itself: one back every twenty seconds, so a pilot is
  // never out of them for good (sim/combat.ts stepFighters)
  'a missile fired, and the rack filling again': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false }, 240, 135)
    f.fly(10, () => f.scene.setControls(held(0.001, 0)))
    const most = f.scene.status.missilesMax
    let least = most
    f.scene.addShip({ ...besidePlayer(f.scene, 220, 8), hull: 'bastion', speed: 70, side: 1, paint: ENEMY })
    f.fly(2100, () => {
      // (one missile, as soon as it has locked; then on round in a wide turn, the guns silent)
      if (least === most) f.hunt(0, false, true)
      else f.scene.setControls(held(0.25, 0))
      least = Math.min(least, f.scene.status.missiles)
    })
    f.expect((f.heard.launch ?? 0) >= 1 && least < most, `a missile fired (${least} of ${most} left)`)
    f.expect(f.scene.status.missiles === most && (f.heard.rearm ?? 0) >= 1, `the rack full again (${f.scene.status.missiles} of ${most})`)
    return f.marks
  },

  // on the tail of a poor pilot (the first wave's): he does not turn back on his pursuer again and again, as every pilot
  // did; like as not he runs for it, straight and not fast, and is chased down and shot (data/skirmish.ts skillAt)
  'a poor pilot chased down': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false }, 240, 135)
    f.fly(10, () => f.scene.setControls(held(0.001, 0)))
    // (he comes the other way, past the pilot's wing: a fight to be turned into a chase)
    const foe = f.scene.addShip({
      ...besidePlayer(f.scene, 230, 40),
      heading: f.scene.player.heading + 2.5,
      hull: 'corsair',
      speed: 86,
      side: 1,
      pilot: 1,
      paint: ENEMY,
    })
    let downAt = -1
    let sighted = 0
    f.fly(720, (n) => {
      const e = f.scene.listShips().find((s) => s.id === foe)
      if (!e || e.hullLeft <= 0) {
        if (downAt < 0) downAt = n
        f.scene.setControls(held(0.3, 0))
        return
      }
      // (straight at him, the thrusters open while he is far, the guns when he is in the sights)
      const p = f.scene.player
      let off = Math.atan2(e.x - p.x, -(e.y - p.y)) - p.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      const d = Math.hypot(e.x - p.x, e.y - p.y)
      const sights = Math.abs(off) < 0.16 && d < 260
      if (sights) sighted++
      f.scene.setControls(held(Math.max(-1, Math.min(1, off * 3)), 0, d > 200 ? 1 : 0, sights))
    })
    f.expect(downAt > 0, 'the poor pilot chased down and shot')
    // (in the sights for a good share of it: he could be followed)
    f.expect(sighted > Math.max(1, downAt) * 0.3, `kept in the sights (${sighted} steps of ${downAt})`)
    f.marks.push(`down after ${(downAt / 60).toFixed(0)} s, in the sights ${Math.round((sighted / Math.max(1, downAt)) * 100)} % of them`)
    return f.marks
  },

  // three good enemy pilots on the player's tail, and he does not fight back: his ship is lost,
  // the pilot ejects, and a new ship picks him up (untouchable for a while, so it shimmers)
  'the player shot down': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false }, 240, 135)
    f.fly(1000, (n) => {
      if (n === 1)
        ['bastion', 'corsair', 'lance'].forEach((hull, i) =>
          f.scene.addShip({ ...besidePlayer(f.scene, -120 - i * 40, (i - 1) * 40), hull, speed: 92, side: 1, pilot: 9, paint: ENEMY }),
        )
      f.scene.setControls(held(Math.sin(n / 70) * 0.5, 0))
    })
    f.expect((f.heard.eject ?? 0) >= 1 && (f.heard.pickup ?? 0) >= 1 && f.scene.status.flying, 'the pilot ejected and was picked up')
    return f.marks
  },

  // the HUD with its text twice the size (a phone's small art pixels, or larger text asked for), in a fight:
  // a raider on his tail hits him, the part of the bar just lost shows pale and drains away, the bars jolt,
  // and the warnings and the kill feed's spacing follow the text's height
  'the HUD at twice the size, hit and draining': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false, hudScale: 2 }, 320, 180)
    let lowest = 1
    f.fly(900, (n) => {
      if (n === 1)
        ['corsair', 'lance'].forEach((hull, i) =>
          f.scene.addShip({ ...besidePlayer(f.scene, -90 - i * 30, (i - 0.5) * 30), hull, speed: 92, side: 1, pilot: 9, paint: ENEMY }),
        )
      f.scene.setControls(held(Math.sin(n / 60) * 0.35, 0))
      lowest = Math.min(lowest, f.scene.status.hull)
    })
    f.expect(lowest < 1, 'the player was hit')
    return f.marks
  },

  // a sky shared with other players' games, as the network would drive it: a friend and a rival
  // flown from afar, each with his mark and callsign over him, and a computer pilot this game
  // flies for the room, who goes for the rival, the pilot nearest him. Hits on the rival are
  // reported, not done; the rival's shots only show, and his hits and a missile come in by word
  // from his game. Then his game says he is lost: he bursts, the feed says who downed him, and
  // he hangs under his parachute; the friend goes idle
  'a shared sky': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false }, 240, 135)
    f.scene.setRoom({ shared: true, host: true })
    const reported: Record<string, number> = {}
    let friend = 0
    let rival = 0
    let tag = 0
    f.fly(720, (n) => {
      const s = f.scene
      if (n === 1) {
        friend = s.addShip({
          ...besidePlayer(s, -30, -40),
          hull: 'sparrow',
          speed: 92,
          side: 0,
          remote: true,
          label: 'ACE',
          mark: 1,
          markColor: GOLD,
          paint: { body: '#2f4a6b', accent: '#ffd23a' },
        })
        rival = s.addShip({
          ...besidePlayer(s, 120, 10),
          hull: 'lance',
          speed: 60,
          side: 2,
          remote: true,
          label: 'VIOLET-7',
          mark: 2,
          markColor: VIOLET,
          paint: { body: '#40304f', accent: '#ff8a3a' },
        })
        s.addShip({ ...besidePlayer(s, 330, 60), hull: 'dart', speed: 92, side: 1, pilot: 1, paint: ENEMY })
      }
      // the friend keeps station, told where he is every frame; the rival weaves ahead, firing now and then
      if (n > 1 && n < 560) {
        s.updateShip(friend, { ...besidePlayer(s, -30, -40), roll: Math.sin(n / 30) * 0.3 })
        s.updateShip(rival, {
          heading: s.player.heading + Math.sin(n / 50) * 0.4,
          firing: n % 120 < 40,
          shieldLeft: Math.max(0, 1 - n / 200),
        })
      }
      if (n === 200) s.hit(0, 14, rival, 2, -1, 0, false)
      if (n === 230) s.hit(0, 14, rival, -1, 2, 1, true)
      if (n === 260) tag = s.launchMissile(rival, 0)
      if (n === 380) {
        s.shootDown(rival, 0)
        s.addFeed({
          parts: [
            { mark: 1, color: GOLD },
            { text: 'YOU', color: '#ffd65a' },
            { text: '>', color: '#acbace' },
            { mark: 2, color: VIOLET },
            { text: 'VIOLET-7', color: '#ff5446' },
          ],
        })
      }
      if (n === 420) {
        const p = s.player
        rival = s.addShip({
          x: p.x + Math.sin(p.heading) * 90,
          y: p.y - Math.cos(p.heading) * 90,
          height: p.height + 10,
          heading: p.heading,
          speed: 13,
          side: 2,
          out: true,
          label: 'VIOLET-7',
          mark: 2,
          markColor: VIOLET,
          paint: { body: '#40304f', accent: '#ff8a3a' },
        })
      }
      if (n === 480) s.updateShip(friend, { idle: true })
      if (n < 380) f.hunt(0, true, false)
      else s.setControls(held(0.3, 0))
      for (const r of s.takeReports()) reported[r.kind] = (reported[r.kind] ?? 0) + 1
    })
    f.expect((reported.hit ?? 0) > 0, 'hits on the rival reported')
    f.expect(tag > 0 && (f.heard.warning ?? 0) >= 1, 'the rival’s missile coming for the player')
    f.expect(f.scene.status.skirmish.kills === 1, 'the rival downed, and the kill the player’s')
    return f.marks
  },

  // a skirmish from behind, with two wingmen: the first wave arrives, and the player and his
  // wingmen fight it
  'a wave of enemies': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: true, wingmen: 2, view: 'chase', crash: false }, 320, 180)
    f.fly(1500, () => f.hunt())
    f.expect(f.scene.status.skirmish.kills >= 2, 'the first wave shot down')
    return f.marks
  },
}

/** flights over the galaxy's other worlds (Phase 3): run by world/flights.spec.ts, beside the others */
export const worldFlights: Record<string, Script> = {
  // ── the worlds (Phase 3): each flies and looks its own way
  // (with the stick the usual way round, +1 pushes forward and dives, −1 pulls back and climbs)

  // down into a canyon from behind, an enemy on the player's tail, and along it
  'a canyon, chased low along it': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('canyon'), intro: false, skirmish: false, crash: false, view: 'chase' }, 240, 135)
    let lowest = 999
    f.fly(540, (n) => {
      if (n === 1) f.scene.addShip({ ...besidePlayer(f.scene, -120, 10), hull: 'lance', speed: 92, side: 1, pilot: 4, paint: ENEMY })
      f.scene.setControls(held(n < 200 ? 0.15 : -0.2, n < 240 ? 1 : 0))
      lowest = Math.min(lowest, f.scene.player.height)
    })
    // (the plateau stands more than 30 px high: below that, the ship is in among the canyon's walls)
    f.expect(lowest < 26, `the ship down among the canyon walls (lowest ${lowest.toFixed(1)})`)
    return f.marks
  },

  // diving and circling over a volcanic world: the lava burns a ship low over it
  'lava burns a ship flown low': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('volcanic', 0, 'ash'), intro: false, skirmish: false, crash: false }, 200, 120)
    f.fly(900, () => f.scene.setControls(held(0.35, 1)))
    // (held low over it long enough, the ship is lost, and the pilot ejects)
    f.expect((f.heard.hit ?? 0) >= 3, 'the ship burned by lava')
    return f.marks
  },

  // snow over an ice world, until a whiteout closes in; an enemy fades in and out of it
  'snow and a whiteout on an ice world': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('ice', 0, 'snow'), intro: false, skirmish: false }, 200, 120)
    f.fly(1080, (n) => {
      if (n === 1) f.scene.addShip({ ...besidePlayer(f.scene, 140, 40), hull: 'dart', speed: 80, side: 1, pilot: 2, paint: ENEMY })
      f.scene.setControls(held(0.2, 0))
    })
    return f.marks
  },

  // a storm at sea: rain, wind and lightning
  'a storm at sea': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('ocean', 0, 'storm'), intro: false, skirmish: false }, 200, 120)
    f.fly(720, (n) => {
      if (n === 360) f.scene.act('view')
      f.scene.setControls(held(-0.2, 0))
    })
    f.expect((f.heard.thunder ?? 0) >= 1, 'thunder')
    return f.marks
  },

  // climbing through a world's skies from behind (James's first play: the clouds sat under the ship): under the heap
  // clouds' flat undersides, up among them and out over their tops, on towards the mackerel sky and the cirrus over it;
  // then from the seat, and overhead, the clouds below and the cirrus sliding over
  'climbing through layered clouds': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago', 1, 'clear'), intro: false, skirmish: false, view: 'chase' }, 240, 135)
    const start = f.scene.player.height
    let top = 0
    f.fly(1080, (n) => {
      if (n === 660 || n === 870) f.scene.act('view')
      f.scene.setControls(held(n < 400 ? 0.06 : -0.1, n > 90 && n < 640 ? -1 : 0))
      top = Math.max(top, f.scene.player.height)
    })
    f.expect(start < 120 && top > 420, `climbed from under the clouds (${start.toFixed(0)}) to over them (${top.toFixed(0)})`)
    return f.marks
  },

  // a barren moon: no air and little gravity, so it climbs much faster than over the islands, but not as high
  'a moon: climbing in low gravity': (create, defaults, worlds) => {
    const climbFor = (overrides: GoldenParams) => {
      const g = new Flight(create, defaults, { ...overrides, intro: false, skirmish: false }, 200, 120)
      const from = g.scene.player.height
      g.fly(120, () => g.scene.setControls(held(0, -1)))
      return { g, climbed: g.scene.player.height - from }
    }
    const islands = climbFor({})
    const moon = climbFor({ ...worlds('moon'), view: 'chase' })
    moon.g.fly(1200, () => moon.g.scene.setControls(held(0.1, -1)))
    moon.g.expect(
      moon.climbed > islands.climbed * 1.3,
      `a faster climb on the moon (${moon.climbed.toFixed(0)} px against ${islands.climbed.toFixed(0)})`,
    )
    moon.g.expect(moon.g.scene.player.height < 902, `no higher than the moon's ceiling (${moon.g.scene.player.height.toFixed(0)})`)
    return moon.g.marks
  },

  // a dust storm over the mesas, and a wave of enemies coming out of it
  'a mesa in a dust storm, with a wave': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('mesa', 0, 'dust'), intro: false }, 240, 135)
    f.fly(900, () => f.hunt())
    f.expect(f.scene.status.skirmish.wave >= 1, 'a wave')
    return f.marks
  },

  // ── the loop (Phase 4): sortie, risk, bank. Each begins at the Nomarchy's capital world, landed on
  // its pad, with the clock at a fixed moment so the outcrops stand as they always will in it

  // lifting off the pad, out over the islands, and back down onto it, from behind the ship
  'a landing and a take-off': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    let home = { x: 0, y: 0 }
    f.fly(1020, (n) => {
      const s = f.scene
      if (n === 0) home = s.loop.home!
      if (n < 30) s.setControls(held(0, 0))
      else if (n < 100) s.setControls({ ...held(0, 0), land: true })
      else if (n < 330) s.setControls(held(n < 200 ? 0 : 0.6, 0))
      else f.toward(home.x, home.y, s.loop.prompt === 'pad' || s.loop.stage === 'landing')
      if (n === 520) s.act('view')
      f.takeLedger()
    })
    f.expect(f.scene.loop.stage === 'landed' && (f.heard.lift ?? 0) >= 1 && (f.heard.land ?? 0) >= 1, 'off the pad and back down on it')
    return f.marks
  },

  // a ship waiting at its pad with its power off, as the page has every ship it sets down (James, 2026-11-18): the throttle
  // dead and the guns safe, seen from the seat; the switch thrown, the screens coming alive one after another; then Land
  // held, lifted off, and the switch refused in flight
  'powered off at the pad, powered up, taken off': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, coldStart: true, view: 'cockpit', transition: 0.01 },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    const throttle = f.scene.status.throttle
    f.fly(60, (n) => f.scene.setControls({ ...held(0, 0, 0, n > 20 && n < 30), throttle: -1 }))
    f.expect(f.scene.status.power === 'off' && f.scene.loop.stage === 'landed', `waiting powered off (${f.scene.status.power})`)
    f.expect(f.scene.status.throttle === throttle, 'the throttle dead with the power off')
    f.expect((f.heard.safe ?? 0) === 1 && !f.heard.cannon, 'the guns safe on the ground')
    f.fly(150, (n) => {
      if (n === 0) f.scene.act('power')
      f.scene.setControls(held(0, 0))
    })
    f.expect(f.scene.status.power === 'on' && (f.heard.powerUp ?? 0) === 1, `powered up (${f.scene.status.power})`)
    f.fly(240, (n) => {
      const s = f.scene
      if (n < 60) s.setControls({ ...held(0, 0), land: true })
      else s.setControls(held(0, 0))
      if (n === 150) s.act('power')
      if (n === 200) s.act('view')
    })
    f.expect(f.scene.loop.stage === 'flying' && (f.heard.lift ?? 0) >= 1, `lifted off (${f.scene.loop.stage})`)
    f.expect((f.heard.refused ?? 0) === 1 && f.scene.status.power === 'on', 'the switch refused in flight')
    return f.marks
  },

  // docked at a station with the guns held and missiles pressed: nothing fires (James: "ships that are landed or docked
  // should be not able to fire their weapons"), WEAPONS SAFE said once; Use held, the power comes up first and the ship
  // backs out; out in space, the guns fire
  'guns held while docked fire nothing': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: 'nomarchy', intro: false, skirmish: false, coldStart: true }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.expect(f.scene.loop.stage === 'landed' && f.scene.status.power === 'off', 'begun docked, powered off')
    f.fly(150, (n) => f.scene.setControls(held(0, 0, 0, n > 10, n % 40 === 20)))
    f.expect(!f.heard.cannon && !f.heard.launch && !f.heard.mine, 'nothing fired docked')
    f.expect((f.heard.safe ?? 0) >= 1 && (f.heard.safe ?? 0) <= 2, `WEAPONS SAFE said, and not over and over (${f.heard.safe})`)
    f.fly(300, (n) => f.scene.setControls({ ...held(0, 0), land: n > 5 && n < 200 }))
    f.expect(
      (f.heard.powerUp ?? 0) === 1 && f.scene.loop.stage === 'flying',
      `powered up by the hold, and undocked (${f.scene.loop.stage})`,
    )
    f.fly(90, () => f.scene.setControls(held(0, 0, 0, true)))
    f.expect((f.heard.cannon ?? 0) >= 1, 'the guns fire in space')
    return f.marks
  },

  // out to the nearest ore, round it with the laser cutting, and over the chunks it throws out
  'mining an outcrop and scooping up the ore': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.fly(1260, (n) => {
      const s = f.scene
      const ore = s.loop.ore
      if (n < 70) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (ore) {
        const d = f.from(ore.x, ore.y)
        if (d > 75) f.toward(ore.x, ore.y)
        else s.setControls({ ...held(1, s.player.height - ore.z > 36 ? 1 : 0), mine: true })
      }
      f.takeLedger()
    })
    f.expect(
      f.scene.loop.fill > 0.1 && (f.ledger.mined ?? 0) >= 1 && (f.heard.scoop ?? 0) >= 4,
      `ore in the hold (${f.scene.loop.fill.toFixed(2)} full)`,
    )
    return f.marks
  },

  // the laser at work in every view (James: "mining needs to be vastly improved with an improved visual beam, showing
  // what you're mining, a progress bar"): out to the nearest ore, the brackets closing on it with its name, the beam
  // cutting with its bar filling, cuts breaking free, +n as the chunks go in; overhead, then from behind, then the seat
  'mining with the new beam, overhead, from behind and from the seat': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    let at = -1
    f.fly(1500, (n) => {
      const s = f.scene
      const ore = s.loop.ore
      if (n < 70) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (ore) {
        const d = f.from(ore.x, ore.y)
        if (at < 0 && d > 30) f.toward(ore.x, ore.y, false, d < 160 && s.player.height - ore.z > 40 ? 1 : 0)
        else {
          // (the throttle shut: it hangs over the ore)
          if (at < 0) s.setThrottle(0)
          if (at < 0) at = n
          // (hanging over it, low, the laser on; a pause between views, the brackets waiting)
          const k = n - at
          s.setControls({ ...held(0, s.player.height - ore.z > 34 ? 1 : 0), mine: k % 420 < 380 })
          if (k === 420 || k === 840) s.act('view')
        }
      }
      f.takeLedger()
    })
    f.expect((f.heard.cut ?? 0) >= 4 && (f.heard.oreLock ?? 0) >= 1, `cuts broken free (${f.heard.cut ?? 0})`)
    return f.marks
  },

  // a hold loaded at the base (as from the vault), flown out and home again heavier, and banked on landing
  'banking at a base': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.scene.loadHold([
      { id: 'ferrite', n: 24 },
      { id: 'silica', n: 8 },
    ])
    let home = { x: 0, y: 0 }
    f.fly(1080, (n) => {
      const s = f.scene
      if (n === 0) home = s.loop.home!
      if (n < 80) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (n < 360) s.setControls(held(-0.5, 0))
      else f.toward(home.x, home.y, s.loop.prompt === 'pad' || s.loop.stage === 'landing')
      f.takeLedger()
    })
    f.expect((f.ledger.bank ?? 0) === 1 && f.scene.loop.fill === 0 && (f.heard.bank ?? 0) >= 1, 'the hold banked at the base')
    return f.marks
  },

  // a loaded ship caught away from home by three good pilots: it is lost, its hold spills as a
  // crate at the wreck; the pilot comes down on the shore, calls a ship (the crate lies out on the
  // water), climbs in when it comes, and flies out to the crate and takes it back
  'shot down loaded, and the crate taken': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, crash: false },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    f.scene.loadHold([{ id: 'silica', n: 30 }])
    const raiders: number[] = []
    let lost = false
    let boarded = false
    f.fly(4800, (n) => {
      const s = f.scene
      if (n < 80) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (!lost) s.setControls(held(Math.sin(n / 70) * 0.4, 0))
      if (n === 240)
        ['bastion', 'corsair', 'lance'].forEach((hull, i) =>
          raiders.push(s.addShip({ ...besidePlayer(s, -110 - i * 40, (i - 1) * 40), hull, speed: 92, side: 1, pilot: 9, paint: ENEMY })),
        )
      f.takeLedger()
      if (!lost && f.ledger.lost) {
        // (they leave with nothing: the crate is there for the taking)
        lost = true
        for (const id of raiders) s.removeShip(id)
      }
      // (down on foot he makes for the crate, on land; drowned, he is back at the base, and flies to it)
      const c = s.loop.crates[0]
      if (lost && s.foot.stage === 'ship' && s.status.flying && s.loop.stage === 'flying') {
        if (c) {
          // (close by it and not pointing at it, he eases his throttle back to turn inside it: at full speed he may
          // circle a crate for ever)
          const p = s.player
          let off = Math.atan2(c.x - p.x, -(c.y - p.y)) - p.heading
          off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
          const slow = f.from(c.x, c.y) < 170 && Math.abs(off) > 0.5
          s.setControls({ ...held(Math.max(-1, Math.min(1, off * 2.5)), s.player.height - c.z > 50 ? 1 : 0), throttle: slow ? -1 : 1 })
        } else s.setControls(held(0.3, 0))
      } else if (lost && s.foot.stage === 'falling' && c) f.walk(c.x, c.y)
      else if (lost && s.foot.stage === 'walking') {
        // (the crate lies out on the water: he calls a ship, and climbs in when it comes)
        if (s.foot.prompt === 'call') s.setControls({ ...held(0, 0), land: true })
        else if (s.foot.prompt === 'board' && !boarded) {
          s.setControls(held(0, 0))
          s.act('use')
          boarded = true
        } else if (s.foot.ship === 'parked') f.walk(s.pilot.x, s.pilot.y)
        else s.setControls(held(0, 0))
      } else if (lost && s.foot.stage === 'ship') s.setControls({ ...held(0, 0), land: s.loop.stage === 'landed' || n % 120 < 40 })
    })
    const carried = f.scene.loop.fill > 0 || f.scene.foot.pack.some((p) => !!p)
    f.expect((f.ledger.lost ?? 0) === 1 && (f.ledger.picked ?? 0) >= 1 && carried, 'the hold lost in a crate, and the crate taken')
    return f.marks
  },

  // ── on foot (Phase 5): out of the ship, walking, coming down after ejecting, veins, stealing, strafing

  // landed on the capital's pad: out of the ship, a walk round the base (out, along, and a run back), in again, and off
  'getting out, walking and getting back in': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: SOLARI },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let ship = { x: 0, y: 0 }
    let far = 0
    let boarded = false
    f.fly(900, (n) => {
      const s = f.scene
      if (n === 0) ship = { x: s.player.x, y: s.player.y }
      if (n === 30) s.act('use')
      if (s.foot.stage === 'walking') {
        if (n < 260) f.walk(ship.x + 60, ship.y + 40)
        else if (n < 400) f.walk(ship.x - 50, ship.y + 50, true)
        else if (s.foot.prompt === 'board' && !boarded) {
          s.setControls(held(0, 0))
          s.act('use')
          boarded = true
        } else f.walk(ship.x, ship.y)
        far = Math.max(far, f.from(ship.x, ship.y))
      } else if (s.foot.stage === 'ship' && n > 600) s.setControls({ ...held(0, 0), land: n > 700 })
    })
    f.expect(
      far > 50 && (f.heard.out ?? 0) === 1 && (f.heard.board ?? 0) === 1 && f.scene.foot.stage === 'ship' && (f.heard.lift ?? 0) === 1,
      `out, ${far.toFixed(0)} px away on foot, back in and off`,
    )
    return f.marks
  },

  // off the pad and round the capital's island until the ship is lost (a hit from afar): the pilot ejects,
  // comes down under his parachute steering for the base, calls a ship, waits for it, and climbs in
  'shot down, coming down on land, and calling the ship': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: SOLARI },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let home = { x: 0, y: 0 }
    let boarded = false
    f.fly(2900, (n) => {
      const s = f.scene
      if (n === 0) home = s.loop.home!
      const foot = s.foot
      if (foot.stage === 'ship') {
        if (n < 70) s.setControls({ ...held(0, 0), land: n > 10 })
        else if (n < 400) f.toward(home.x + Math.cos(n / 60) * 110, home.y + Math.sin(n / 60) * 110)
        else s.setControls({ ...held(0, 0), land: n > 2550 })
      } else if (foot.stage === 'falling') f.walk(home.x, home.y)
      else if (foot.stage === 'walking') {
        if (foot.ship === 'gone') s.setControls({ ...held(0, 0), land: true })
        else if (foot.ship === 'coming') s.setControls(held(0, 0))
        else if (foot.prompt === 'board' && !boarded) {
          s.setControls(held(0, 0))
          s.act('use')
          boarded = true
        } else if (foot.ship === 'parked') f.walk(s.pilot.x, s.pilot.y)
      }
      if (n === 400) s.hit(0, 999, -1, 0, 0, 0, true)
    })
    f.expect((f.heard.eject ?? 0) === 1 && (f.heard.touchdown ?? 0) === 1 && (f.heard.call ?? 0) === 1, 'down on land, and a ship called')
    f.expect(f.scene.foot.stage === 'ship' && (f.heard.board ?? 0) === 1, 'the called ship came, and he climbed in')
    return f.marks
  },

  // out to sea from the capital until the ship is lost: the pilot comes down in deep water, drowns, and is
  // back at the nearest friendly base, in a new ship
  'coming down in the sea': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: KESTRIN },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    f.fly(1500, (n) => {
      const s = f.scene
      if (s.foot.stage === 'ship') s.setControls({ ...held(n < 300 ? 0 : 0.2, 0), land: n > 10 && n < 70 })
      else s.setControls(held(0, 0))
      if (n === 520) s.hit(0, 999, -1, 0, 0, 0, true)
      f.takeLedger()
    })
    f.expect((f.heard.eject ?? 0) === 1 && (f.heard.die ?? 0) === 1, 'down in the sea, and drowned')
    f.expect(f.scene.foot.stage === 'ship' && f.scene.loop.stage === 'landed' && f.scene.loop.base !== null, 'back at a base, in a ship')
    return f.marks
  },

  // (polish step 9) out of the ship at the capital and a long walk off; his parked ship called to him (Use held, as the
  // HUD offers once he is far from it): it lifts, comes in low and sets down beside him, and he climbs in
  'his parked ship called to him': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: SOLARI },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let ship = { x: 0, y: 0 }
    let boarded = false
    let offered = false
    f.fly(1200, (n) => {
      const s = f.scene
      if (n === 0) ship = { x: s.player.x, y: s.player.y }
      if (n === 30) s.act('use')
      if (s.foot.stage !== 'walking') return
      if (s.foot.prompt === 'recall') offered = true
      if (n < 420) f.walk(ship.x + 110, ship.y + 70, true)
      else if (s.foot.prompt === 'board' && !boarded) {
        s.setControls(held(0, 0))
        s.act('use')
        boarded = true
      } else if (s.foot.ship === 'parked' && (f.heard.call ?? 0) > 0) f.walk(s.pilot.x, s.pilot.y)
      else s.setControls({ ...held(0, 0), land: s.foot.prompt === 'recall' })
    })
    f.expect(offered && (f.heard.call ?? 0) === 1 && boarded && f.scene.foot.stage === 'ship', 'his ship called to him, and boarded')
    return f.marks
  },

  // (polish step 9) out to sea from the capital, shot down low over deep water: the canopy opens at once and glides, the
  // ring on the water where he will come down red and an arrow to the nearest land; steered along it, he comes down on the
  // shore and walks, and calls a ship
  'shot down over the sea, gliding to the shore': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: KESTRIN },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    f.fly(1700, (n) => {
      const s = f.scene
      const foot = s.foot
      if (foot.stage === 'ship') s.setControls({ ...held(0, n > 200 && s.player.height < 120 ? -0.6 : 0), land: n > 10 && n < 70 })
      else if (foot.stage === 'falling' && foot.shore) f.walk(foot.shore.x, foot.shore.y)
      else if (foot.stage === 'walking') s.setControls({ ...held(0, 0), land: foot.prompt === 'call' })
      else s.setControls(held(0, 0))
      if (n === 520) s.hit(0, 999, -1, 0, 0, 0, true)
      f.takeLedger()
    })
    f.expect((f.heard.eject ?? 0) === 1 && (f.heard.touchdown ?? 0) === 1 && !(f.heard.die ?? 0), 'down on the shore, not in the sea')
    f.expect((f.heard.call ?? 0) === 1, 'a ship called')
    return f.marks
  },

  // out of the ship at the capital, a run out to the nearest vein (it lies on broken ground, where no ship could
  // set down), the hand tool cutting it into the backpack, a run back, and the pack emptied into the hold
  'mining a vein': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: ORRIN },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let vein = { x: 0, y: 0 }
    let ship = { x: 0, y: 0 }
    let packed = 0
    let boarded = false
    f.fly(1500, (n) => {
      const s = f.scene
      const foot = s.foot
      if (n === 0) {
        vein = { x: foot.vein!.x, y: foot.vein!.y }
        ship = { x: s.player.x, y: s.player.y }
      }
      if (n === 20) s.act('use')
      if (foot.stage === 'walking') {
        packed = foot.pack.reduce((t, p) => t + (p ? p.n : 0), 0)
        if (packed < 8) f.walk(vein.x, vein.y, true, false, false, foot.prompt === 'mine')
        else if (foot.prompt === 'board' && !boarded) {
          s.setControls(held(0, 0))
          s.act('use')
          boarded = true
        } else f.walk(ship.x, ship.y, true)
      }
      f.takeLedger()
    })
    f.expect(packed >= 8 && (f.ledger.mined ?? 0) >= 1, `ore cut from the vein into the pack (${packed})`)
    f.expect(f.scene.foot.stage === 'ship' && f.scene.loop.fill > 0, 'back aboard, the pack emptied into the hold')
    return f.marks
  },

  // out at the capital, and the ship left on the pad is shot to pieces (by word from afar): a rival's ship stands
  // parked near by, and the pilot climbs into it; its owner's game gives it up (as the network would say), and he
  // flies it off with its cargo, round, and back down on the pad: the cargo is banked and the ship handed in
  'a ship being stolen': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, look: SOLARI },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    f.scene.setRoom({ shared: true, host: true })
    let rival = 0
    let home = { x: 0, y: 0 }
    let asked = 0
    let stole = false
    f.fly(1500, (n) => {
      const s = f.scene
      const foot = s.foot
      if (n === 0) {
        home = s.loop.home!
        const p = s.player
        rival = s.addShip({
          x: p.x + 88,
          y: p.y,
          height: p.height,
          heading: 2.4,
          hull: 'lance',
          side: 2,
          remote: true,
          parked: true,
          landing: 2,
          label: 'VIOLET-7',
          mark: 2,
          markColor: VIOLET,
          paint: { body: '#40304f', accent: '#ff8a3a' },
        })
      }
      if (n === 30) s.act('use')
      if (n === 90) s.hit(0, 999, rival, 0, 0, 0, true, false)
      if (foot.stage === 'walking' && n > 150) {
        const r = s.listShips().find((x) => x.id === rival)
        if (r && foot.prompt === 'steal' && !asked) {
          s.setControls(held(0, 0))
          s.act('use')
        } else if (r) f.walk(r.x, r.y)
      }
      for (const rep of s.takeReports()) if (rep.kind === 'steal' && rep.target === rival) asked = n
      if (asked && n === asked + 20 && !stole) {
        stole = true
        s.stealGranted(rival, [{ id: 'silica', n: 14 }], 'VIOLET-7')
      }
      if (stole && foot.stage === 'ship') {
        if (n < asked + 120) s.setControls({ ...held(0, 0), land: n > asked + 40 })
        else if (n < asked + 500) s.setControls(held(0.5, 0))
        else f.toward(home.x, home.y, s.loop.prompt === 'pad' || s.loop.stage === 'landing')
      }
      f.takeLedger()
    })
    f.expect(stole && (f.heard.board ?? 0) >= 1, 'the rival’s parked ship stolen')
    f.expect(
      (f.ledger.bank ?? 0) >= 1 && (f.ledger.bounty ?? 0) >= 1 && f.scene.foot.stolenFrom === '',
      'its cargo banked and the ship handed in',
    )
    return f.marks
  },

  // down on open ground away from the bases, out, and two raiders come: the pilot runs and dives, firing back,
  // while they strafe him; the dirt their shots throw up hurts him too
  'a pilot on foot, strafed': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, crash: false, look: ORRIN_COPPER },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let out = false
    let came = 0
    let lowest = 1
    f.fly(1800, (n) => {
      const s = f.scene
      const foot = s.foot
      if (foot.stage === 'ship' && !out) {
        if (n < 70) s.setControls({ ...held(0, 0), land: n > 10 })
        else if (n < 300) s.setControls(held(n < 160 ? 0.3 : -0.2, 0))
        else if (s.loop.stage === 'landed') {
          s.setControls(held(0, 0))
          s.act('use')
          out = true
        } else s.setControls({ ...held(0, 0), land: s.loop.prompt === 'land' || s.loop.stage === 'landing' })
      }
      if (foot.stage === 'walking' && !came) {
        came = n
        const p = s.player
        ;['dart', 'lance'].forEach((hull, i) =>
          s.addShip({
            x: p.x + 320 - i * 60,
            y: p.y - 200 + i * 80,
            height: 60,
            heading: -2,
            hull,
            speed: 92,
            side: 1,
            pilot: 5,
            paint: ENEMY,
          }),
        )
      }
      if (foot.stage === 'walking' && came && n > came + 30) {
        s.setControls({ ...held(Math.cos(n / 25), Math.sin(n / 31), 1, n % 120 < 50), land: false })
        if (n % 45 === 0) s.act('roll')
      }
      lowest = Math.min(lowest, foot.stage === 'walking' ? foot.health : lowest)
    })
    f.expect(came > 0 && (f.heard.cannon ?? 0) > 10 && (f.heard.blaster ?? 0) > 5, 'raiders strafing, and the pilot firing back')
    f.expect(lowest < 0.9, `the pilot on foot hurt (down to ${lowest.toFixed(2)})`)
    return f.marks
  },

  // from the island world to a jungle world in flight: everything from the last one is left behind, and the new one is named
  'arriving at another world': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { intro: false }, 240, 135)
    f.fly(240, () => f.hunt())
    const jungle = worlds('jungle')
    f.set(jungle)
    f.fly(360, () => f.scene.setControls(held(0.1, 0)))
    f.expect(f.scene.worldKey === jungle.world, `arrived at ${String(jungle.world)} (over ${f.scene.worldKey})`)
    return f.marks
  },
}

// ── space (Phase 6): flights in a star system's space, and between it and a world. The clock is
// the loop's fixed moment, so every body stands where it always will in them.

/** a body of the system the scene is in, the nth of a kind, as it stands now */
function bodyOf(scene: GoldenScene, kind: string, nth = 0) {
  const b = scene.bodies().filter((x) => x.kind === kind)[nth]
  if (!b) throw new Error(`no ${kind} ${nth} in ${scene.zone.key}`)
  return b
}
/**
 * A place in a belt that stays where it is: its ring, at one bearing from the system's middle. (The belt's own point goes
 * round its ring with the clock, and the rocks, which do not, are others wherever it has got to.)
 */
const BELT_BEARING = 2.766
function beltSpot(scene: GoldenScene) {
  const b = bodyOf(scene, 'belt')
  const r = Math.hypot(b.x, b.y)
  return { ...b, x: Math.cos(BELT_BEARING) * r, y: Math.sin(BELT_BEARING) * r }
}
/** the same body, as it stands now (bodies move; none once the scene has left the system) */
const now = (scene: GoldenScene, index: number) => scene.bodies().find((x) => x.index === index)

/** steers the keys towards (x, y) and holds Use (or not) — as Flight.toward, for flights in space */
function hold(f: Flight, land: boolean) {
  f.scene.setControls({ ...held(0, 0), land })
}

/**
 * Up out of the Nomarchy's capital world into space, in a view, with no passage begun: lift off, and up all the way, through
 * the top of its sky and its air, by a climb held on the keys or (`use`) by Use held once clear of the ground
 */
function upAndOut(view: string, use = false): Script {
  return (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, view }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.fly(30, () => f.scene.setControls({ ...held(0, 0), land: true }))
    f.fly(140, () => f.scene.setControls(held(0.1, -1)))
    let air = 0
    let low = Infinity
    f.fly(1380, () => {
      const z = f.scene.zone
      const out = z.kind === 'space' && z.travel === ''
      if (z.travel === 'out') air++
      if (z.kind === 'surface') low = Math.min(low, f.scene.player.height)
      // (out in space: hands off the climb)
      // (Use climbs only from well clear of the ground: lower, it lands)
      const high = f.scene.zone.kind === 'space' || f.scene.player.height > 240
      f.scene.setControls(out ? held(0.12, 0) : use && high ? { ...held(0.1, 0), land: true } : held(0.1, -1))
    })
    f.fly(60, () => f.scene.setControls(held(-0.2, 0)))
    f.expect(air > 200, `up through the world's air (${air} steps)`)
    f.expect(f.scene.zone.kind === 'space' && f.scene.zone.key === 's0', `in Fort Coria's space (in ${f.scene.zone.key})`)
    f.expect(f.scene.zone.travel === '', `out of its air (${f.scene.zone.travel})`)
    f.expect(f.scene.zone.over === 'w0', `over the world it left (over '${f.scene.zone.over}')`)
    return f.marks
  }
}

/**
 * In space over a world (or a barren moon) of the Nomarchy's home, down to it, in a view, with no passage begun: the nose
 * put down at it (a dive held on the keys a moment and let go, or `use`, Use held), into its air and through it to the top
 * of its sky, and from there a dive held down to low over its ground
 */
function downTo(view: string, kind = 'planet', use = false): Script {
  return (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's0', side: '', intro: false, skirmish: false, view }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const w = bodyOf(f.scene, kind, kind === 'moon' ? 1 : 0)
    f.scene.placePlayer(w.x + w.size * 0.15, w.y - w.size * 0.1, 0.6)
    f.fly(20, () => hold(f, false))
    let air = 0
    f.fly(1500, (n) => {
      const z = f.scene.zone
      if (z.travel === 'down') air++
      // (in its sky: a dive held, down to low over the ground)
      if (z.kind === 'surface' && z.travel === '') f.scene.setControls(held(0.1, f.scene.player.height > 380 ? 1 : 0))
      else if (use) f.scene.setControls({ ...held(0.1, 0), land: true })
      else f.scene.setControls(held(0.1, n < 50 && z.travel === '' ? 1 : 0))
    })
    f.fly(60, () => f.scene.setControls(held(0.1, 0)))
    f.expect(air > 200, `down through its air (${air} steps)`)
    f.expect(
      f.scene.zone.kind === 'surface' && f.scene.zone.key === w.world && f.scene.zone.travel === '',
      `down on ${w.world} (on ${f.scene.zone.key}, ${f.scene.zone.travel})`,
    )
    f.expect(f.scene.player.height < 400, `low over it (${f.scene.player.height.toFixed(0)})`)
    return f.marks
  }
}

export const spaceFlights: Record<string, Script> = {
  // up off the Nomarchy's capital world and out into space: lift off and climb, on up through the top of its sky (from the
  // seat, with Use held)
  'leaving a world for space': upAndOut('top'),
  'up out of a world, from behind': upAndOut('chase'),
  'up out of a world, from the seat': upAndOut('cockpit', true),
  // down to it from space: overhead and from the seat with Use held, from behind by a dive on the keys
  'down to a world, overhead': downTo('top', 'planet', true),
  'down to a world, from behind': downTo('chase'),
  'down to a world, from the seat': downTo('cockpit', 'planet', true),
  // a barren moon: no air, no fire, a black sky all the way down
  'down to a barren moon, from behind': downTo('chase', 'moon'),

  // across a system on the cruise drive, to a world, and down onto it
  'cruising to another body and descending': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const world = bodyOf(f.scene, 'planet')
    f.scene.placePlayer(world.x + world.size * 4, world.y - world.size * 1.2, -1.3)
    f.scene.setCourse(world.index)
    f.fly(20, () => f.scene.setControls(held(0, 0)))
    f.scene.act('cruise')
    let fastest = 0
    f.fly(1500, () => {
      const w = now(f.scene, world.index)
      if (!w) return f.scene.setControls(held(0.2, 0))
      const near = f.from(w.x, w.y) < w.size * 0.5
      f.toward(w.x, w.y, near && f.scene.zone.kind === 'space' && !f.scene.zone.travel)
      fastest = Math.max(fastest, f.scene.zone.pace)
    })
    f.fly(150, () => f.scene.setControls(held(0.2, 0)))
    f.expect(fastest > 9, `the cruise drive faster than near anything (${fastest.toFixed(1)})`)
    f.expect(f.scene.zone.kind === 'surface' && f.scene.zone.key === world.world, `down on ${world.world} (on ${f.scene.zone.key})`)
    return f.marks
  },

  // past a gas giant on the cruise drive, from behind: the giant grows from a ball to a wall of bands and slides by
  'cruising past a gas giant, from behind': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's2', side: '', intro: false, skirmish: false, view: 'chase' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const giant = bodyOf(f.scene, 'giant')
    // (out to one side of it, aimed to pass it a little way off)
    f.scene.placePlayer(giant.x - giant.size * 5, giant.y + giant.size * 1.6, Math.PI / 2)
    f.fly(20, () => f.scene.setControls(held(0, 0)))
    f.scene.act('cruise')
    let closest = Infinity
    f.fly(720, () => {
      f.toward(giant.x + giant.size * 6, giant.y + giant.size * 1.6)
      closest = Math.min(closest, f.from(giant.x, giant.y) / giant.size)
    })
    f.expect(closest < 2, `close by the giant (${closest.toFixed(2)} of its size)`)
    return f.marks
  },

  // into the gate to Thodes, held there while it charges, and out of the other end
  'a jump through a gate': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's0', side: '', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const gate = bodyOf(f.scene, 'gate')
    const d = Math.hypot(gate.x, gate.y)
    f.scene.placePlayer(gate.x - (gate.x / d) * 330, gate.y - (gate.y / d) * 330, Math.atan2(gate.x, -gate.y))
    f.fly(480, () => f.toward(gate.x, gate.y, f.from(gate.x, gate.y) < 70 && f.scene.zone.system === 0))
    f.fly(120, () => f.scene.setControls(held(0.3, 0)))
    f.expect(f.scene.zone.system === 1, `through to Thodes (in ${f.scene.zone.key})`)
    return f.marks
  },

  // a black hole's pull, and a run along its bright ring, through to the linked one far across the galaxy
  'a black hole run': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const hole = bodyOf(f.scene, 'black hole')
    const ring = hole.size * 0.62
    // (in from outside the ring, curving round to graze it, then along it with Use held)
    f.scene.placePlayer(hole.x + ring + 520, hole.y, Math.PI)
    let pulled = 0
    f.fly(720, () => {
      const p = f.scene.player
      const r = Math.hypot(p.x - hole.x, p.y - hole.y)
      const a = Math.atan2(p.y - hole.y, p.x - hole.x)
      // a point ahead round the ring, a little outside it (the pull drags the ship in)
      const aim = a - 0.12
      const want = ring + 26 + Math.max(0, r - ring) * 0.35
      f.toward(
        hole.x + Math.cos(aim) * want,
        hole.y + Math.sin(aim) * want,
        Math.abs(r - ring) < hole.size * 0.2 && f.scene.zone.system === 1,
        0,
        1,
      )
      pulled = Math.max(pulled, f.scene.zone.pull)
    })
    f.fly(120, () => f.scene.setControls(held(0, 0)))
    f.expect(pulled > 60, `a strong pull (${pulled.toFixed(0)} px/s²)`)
    f.expect(f.scene.zone.system === 10, `out of the linked black hole in Abax (in ${f.scene.zone.key})`)
    return f.marks
  },

  // out of the station, round, back in with a hold of ore, and the hold banked
  'docking and banking at a station': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    return dockAndBank(f)
  },
  // out of the station, holed by a shot, docked again, and the hull mended there with the mining key held: as far as the
  // credits he has go, then, with more, whole (sim/repair.ts)
  'a holed hull mended at a station': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const station = bodyOf(f.scene, 'base')
    f.fly(60, () => f.scene.setControls({ ...held(0, 0), land: true }))
    f.fly(400, (n) => {
      f.scene.setControls(held(n < 100 ? 0 : 0.8, 0))
      // (shots from nowhere, once the dock's shelter has left it: through its shield and well into its hull)
      if (n >= 240 && n % 8 === 0 && f.scene.status.hull > 0.5) f.scene.hit(0, 16, -1, 1, 0, 0, true)
    })
    const holed = f.scene.status.hull
    f.expect(holed < 0.6, `holed (${holed.toFixed(2)} of its hull left)`)
    f.fly(600, () => {
      const s = now(f.scene, station.index)!
      f.toward(s.x, s.y, f.from(s.x, s.y) < 150)
    })
    f.fly(40, () => f.scene.setControls(held(0, 0)))
    f.expect(f.scene.loop.stage === 'landed', `docked again (${f.scene.loop.stage})`)
    // twenty credits to his name: so much of it is mended, and no more
    f.scene.setPurse(20)
    f.fly(120, () => f.scene.setControls({ ...held(0, 0), mine: true }))
    const some = f.scene.status.hull
    f.fly(30, () => f.scene.setControls(held(0, 0)))
    f.expect(some > holed + 0.1 && some < 0.99, `mended as far as his credits went (${some.toFixed(2)})`)
    // paid again: the rest of it
    f.scene.setPurse(500)
    f.fly(240, () => f.scene.setControls({ ...held(0, 0), mine: true }))
    f.fly(30, () => f.scene.setControls(held(0, 0)))
    const spent = f.scene.takeLedger().filter((e) => e.kind === 'repair')
    const credits = spent.reduce((n, e) => n + (e.credits ?? 0), 0)
    f.expect(f.scene.status.hull > 0.999, `the hull whole (${f.scene.status.hull.toFixed(3)})`)
    f.expect(spent.length === 2 && credits > 40 && credits < 90, `paid for in two goes (${spent.length}: ${credits} credits)`)
    return f.marks
  },
  // the same, from behind the ship
  'docking at a station, from behind': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: 'nomarchy', intro: false, skirmish: false, view: 'chase' }, 240, 135)
    return dockAndBank(f)
  },

  // into a belt to the nearest rock with ore in it, its brackets and name, and the laser cutting it from behind
  'mining an ore rock in a belt': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const belt = beltSpot(f.scene)
    const r = Math.hypot(belt.x, belt.y)
    f.scene.placePlayer(belt.x - (belt.x / r) * 40, belt.y - (belt.y / r) * 40, Math.atan2(-belt.y, belt.x))
    let at = -1
    f.fly(900, (n) => {
      const s = f.scene
      const ore = s.loop.ore
      if (n === 1) s.act('view')
      if (!ore) s.setControls(held(0.2, 0))
      else {
        const d = f.from(ore.x, ore.y)
        if (at < 0 && d > 70) f.toward(ore.x, ore.y)
        else {
          if (at < 0) at = n
          s.setControls({ ...held(0, 0), mine: true })
        }
      }
    })
    f.expect((f.heard.cut ?? 0) >= 2, `cuts broken free from a rock (${f.heard.cut ?? 0})`)
    return f.marks
  },

  // raiders among the rocks of a belt: shots stop against the rocks, and the ship hunts them through it
  'a dogfight in an asteroid belt': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false }, 240, 135)
    return beltFight(f)
  },
  // raiders in open space, fought from the pilot's seat
  'a dogfight in space, from the seat': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false, view: 'cockpit' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const world = bodyOf(f.scene, 'planet')
    // (beside a world, which hangs below the plane as they fight)
    f.scene.placePlayer(world.x + world.size * 1.3, world.y, -Math.PI / 2)
    f.fly(1, () => {
      for (let i = 0; i < 3; i++)
        f.scene.addShip({
          ...besidePlayer(f.scene, 300 + i * 40, (i - 1) * 60),
          heading: f.scene.player.heading + Math.PI,
          hull: i === 1 ? 'lance' : 'dart',
          speed: 90,
          side: 1,
          pilot: 3,
          paint: ENEMY,
        })
    })
    f.fly(1100, () => f.hunt())
    f.expect((f.heard.explosion ?? 0) >= 1, 'a raider downed')
    return f.marks
  },

  // climbing and diving in space from the seat, with the pointer (James's first flight: in space it flew level whatever
  // the pointer did), and the throttle's lever on the panel pulled back to a stop
  'climbing and diving in space, from the seat': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false, view: 'cockpit' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const start = f.scene.player.height
    f.fly(600, (n) => {
      const s = f.scene
      // (as a flight stick: pointing low pulls back, a climb; high pushes, a dive)
      if (n >= 20 && n < 600) s.pointerMove(120, n < 200 ? 118 : n < 420 ? 12 : 46)
      if (n === 199) f.marks.push(`pulled back: ${Math.round(s.player.height - start)} over the plane`)
      if (n === 419) f.marks.push(`pushed: ${Math.round(s.player.height - start)} over the plane`)
      if (n === 440) s.setThrottle(0)
    })
    f.marks.push(`throttle ${f.scene.status.throttle}, speed ${f.scene.status.speed}`)
    return f.marks
  },

  // along a gas giant's upper bands with Use held: gas into the hold; the giant does not pull the ship (only a black hole pulls)
  'skimming a gas giant': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const giant = bodyOf(f.scene, 'giant')
    f.scene.placePlayer(giant.x + giant.size * 0.9, giant.y, 0)
    let pulled = 0
    f.fly(720, () => {
      const p = f.scene.player
      const a = Math.atan2(p.y - giant.y, p.x - giant.x)
      const aim = a - 0.02
      const want = giant.size * 0.9
      f.toward(giant.x + Math.cos(aim) * want, giant.y + Math.sin(aim) * want, true)
      pulled = Math.max(pulled, f.scene.zone.pull)
    })
    f.fly(60, () => f.scene.setControls(held(0.3, 0)))
    f.takeLedger()
    f.expect(f.scene.loop.fill > 0, `gas in the hold (${f.scene.loop.fill.toFixed(2)})`)
    f.expect(pulled === 0, `no pull from the giant (${pulled.toFixed(0)} px/s²)`)
    return f.marks
  },
}

/** out of the station, round, back in with a hold of ore, and the hold banked */
function dockAndBank(f: Flight) {
  f.scene.setClock(LOOP_CLOCK)
  f.expect(f.scene.loop.stage === 'landed', `begun docked (${f.scene.loop.stage})`)
  f.scene.loadHold([{ id: 'ferrite', n: 20 }])
  const station = bodyOf(f.scene, 'base')
  f.fly(60, () => f.scene.setControls({ ...held(0, 0), land: true }))
  f.fly(300, (n) => f.scene.setControls(held(n < 120 ? 0 : 0.8, 0)))
  f.fly(600, () => {
    const s = now(f.scene, station.index)!
    f.toward(s.x, s.y, f.from(s.x, s.y) < 150)
  })
  f.fly(60, () => f.scene.setControls(held(0, 0)))
  f.takeLedger()
  f.expect(f.scene.loop.stage === 'landed', `docked again (${f.scene.loop.stage})`)
  f.expect((f.ledger.bank ?? 0) >= 1 && f.scene.loop.fill === 0, `the hold banked (${JSON.stringify(f.ledger)})`)
  return f.marks
}

/** raiders among the rocks of a belt: shots stop against the rocks, and the ship hunts them through it */
function beltFight(f: Flight) {
  f.scene.setClock(LOOP_CLOCK)
  const belt = beltSpot(f.scene)
  const r = Math.hypot(belt.x, belt.y)
  f.scene.placePlayer(belt.x - (belt.x / r) * 40, belt.y - (belt.y / r) * 40, Math.atan2(-belt.y, belt.x))
  f.fly(1, () => {
    for (let i = 0; i < 3; i++)
      f.scene.addShip({
        ...besidePlayer(f.scene, 260 + i * 40, (i - 1) * 70),
        heading: f.scene.player.heading + Math.PI,
        hull: i === 1 ? 'lance' : 'dart',
        speed: 90,
        side: 1,
        pilot: 3,
        paint: ENEMY,
      })
  })
  f.fly(1100, () => f.hunt())
  f.expect((f.heard.explosion ?? 0) >= 1, 'a raider downed among the rocks')
  return f.marks
}

// ── the persistent world (Phase 7): the page's part is played by the flight, as Game.svelte would play
// it: it hands the scene the traces and holders the events give (setTraces), and takes the deeds.

/** a trace another pilot left, as the page hands it in */
function mark(kind: string, x: number, y: number, z: number, more: GoldenParams = {}): GoldenParams {
  return {
    id: `${kind}-${x | 0}-${y | 0}`,
    kind,
    by: 'b'.repeat(64),
    side: 'anarchoi',
    callsign: 'BRAVO',
    x,
    y,
    z,
    n: 0,
    at: LOOP_CLOCK - 3600,
    hull: 'lance',
    path: null,
    own: false,
    ...more,
  }
}

/** a day on which world w9 (the archipelago next to the Nomarchy's home) is one of the hotspots: noon, UTC */
const HOTSPOT_CLOCK = 20844 * 86_400 + 43_200

export const traceFlights: Record<string, Script> = {
  // off the first outpost of a frontier world and over to the second, its capture site: down on its
  // pad, out on foot round the ship to the mast beside it, Use held until the flag goes in; the page then says the world is
  // the Nomarchy's (as the events' rule does), and the mast's banner turns gold
  'a flag planted, and the world changing hands': (create, defaults, worlds) => {
    const w = worlds('archipelago', 1)
    const f = new Flight(create, defaults, { ...w, side: 'nomarchy', intro: false, skirmish: false, look: SOLARI }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.scene.setTraces({ holders: {}, front: true, marks: [] })
    const site = f.scene.traces.site
    f.expect(!!site, 'a capture site on this world')
    let planted = false
    let handed = false
    let out = 0
    f.fly(2400, (n) => {
      const s = f.scene
      const deeds = s.takeDeeds()
      if (deeds.some((d) => d.kind === 'flag')) planted = true
      if (planted && !handed) {
        // (what the page does once the flag's event is in: the world is the Nomarchy's, the flag one of its traces)
        handed = true
        const flag = deeds.find((d) => d.kind === 'flag')!
        s.setTraces({
          holders: { [String(w.world)]: 'nomarchy' },
          marks: [mark('flag', flag.x, flag.y, flag.z, { side: 'nomarchy', callsign: 'YOU', own: true, by: '' })],
        })
      }
      if (n < 80) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (s.foot.stage === 'ship' && s.loop.stage !== 'landed')
        f.toward(site!.x, site!.y, f.from(site!.x, site!.y) < 160 && (s.loop.prompt === 'pad' || s.loop.stage === 'landing'))
      else if (s.foot.stage === 'ship' && !planted) {
        s.setControls(held(0, 0))
        if (n % 30 === 0) s.act('use')
      } else if (s.foot.stage === 'walking' && !planted) {
        // (round his ship, not through it, to the site)
        if (s.foot.prompt === 'flag') s.setControls({ ...held(0, 0), land: true })
        else {
          // (off the pad to the south, along under the mast, and up to it)
          if (!out) out = n
          const low = s.pilot.y + 34
          if (n - out < 70) f.walk(s.pilot.x, low)
          else if (n - out < 200) f.walk(site!.x, low)
          else f.walk(site!.x, site!.y + 14)
        }
      } else if (s.foot.stage === 'walking') f.walk(site!.x + 20, site!.y + 26)
    })
    f.expect(
      planted && f.scene.traces.holder === 'nomarchy' && f.scene.foot.stage === 'walking',
      "a flag planted and the world the Nomarchy's",
    )
    return f.marks
  },

  // a quiet world others have been to: out of the ship on a frontier mesa, past a grave and a flag
  // to another pilot's beacon (read), on to his wreck (stripped for salvage), while his ghost flies
  // its run overhead; then a beacon of his own, saying "Enemy base ahead"
  'traces on a quiet world: a beacon read, a wreck salvaged': (create, defaults, worlds) => {
    const w = worlds('mesa', 1)
    const f = new Flight(
      create,
      defaults,
      { ...w, timeOfDay: 'day', side: 'nomarchy', intro: false, skirmish: false, look: SOLARI },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    const p = f.scene.player
    const g = (dx: number, dy: number) => ({ x: p.x + dx, y: p.y + dy })
    const path: number[] = []
    for (let i = 0; i < 60; i++) path.push(p.x - 200 + i * 7, p.y - 60 + Math.sin(i / 6) * 30, 90 + i, Math.PI / 2)
    const beacon = g(40, 50)
    const wreck = g(-30, 95)
    f.scene.setTraces({
      holders: {},
      front: true,
      marks: [
        mark('grave', p.x + 20, p.y + 30, 0),
        mark('flag', p.x - 25, p.y + 20, 0),
        mark('beacon', beacon.x, beacon.y, 0, { n: 1 }),
        mark('wreck', wreck.x, wreck.y, 0, { n: 6 }),
        mark('ghost', path[0], path[1], path[2], { path, at: LOOP_CLOCK - 5 }),
      ],
    })
    let read = ''
    let salvaged = 0
    let beacons = 0
    f.fly(1500, (n) => {
      const s = f.scene
      if (n === 20) s.act('use')
      for (const d of s.takeDeeds()) {
        if (d.kind === 'salvage') salvaged += d.n
        if (d.kind === 'beacon' && d.n === 3) beacons++
      }
      if (s.traces.reading) read = s.traces.reading.words
      if (s.foot.stage !== 'walking') return
      if (n < 520) f.walk(beacon.x, beacon.y + 6)
      else if (!salvaged) {
        if (s.foot.prompt === 'salvage' && n % 20 === 0) s.act('use')
        else f.walk(wreck.x + 10, wreck.y - 8)
      } else if (!beacons) {
        s.setControls(held(0, 0))
        s.plantBeacon(3)
      } else f.walk(p.x, p.y)
    })
    f.expect(read === 'ORE NEARBY' && salvaged > 0 && beacons === 1, `a beacon read ("${read}"), ${salvaged} salvage, a beacon planted`)
    return f.marks
  },

  // the same outcrop-cutting as 'mining an outcrop', on a day the world is a hotspot: its outcrops
  // hold far more, and the laser cuts faster
  'a hotspot mined': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('archipelago', 1), side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(HOTSPOT_CLOCK)
    f.expect(f.scene.traces.hotspot, 'a hotspot today')
    let most = 0
    f.fly(1260, (n) => {
      const s = f.scene
      const ore = s.loop.ore
      if (n < 70) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (ore) {
        most = Math.max(most, ore.left)
        const d = f.from(ore.x, ore.y)
        if (d > 75) f.toward(ore.x, ore.y)
        else s.setControls({ ...held(1, s.player.height - ore.z > 36 ? 1 : 0), mine: true })
      }
      f.takeLedger()
    })
    f.expect(most > 40 && f.scene.loop.fill > 0.1 && (f.ledger.mined ?? 0) >= 1, `a richer outcrop (${most} units in it) mined`)
    return f.marks
  },

  // an Anarchoi pilot lands for the first time on a frontier world nobody has named: the page offers him
  // names, he picks one, and it is the world's name from then on
  'a world named by the first pilot to land': (create, defaults, worlds) => {
    const w = worlds('continental', 4)
    const f = new Flight(create, defaults, { ...w, side: 'anarchoi', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.scene.setTraces({ holders: {}, name: '', finder: '', marks: [] })
    let home = { x: 0, y: 0 }
    let landed = false
    f.fly(960, (n) => {
      const s = f.scene
      if (n === 0) home = s.loop.home!
      if (s.takeDeeds().some((d) => d.kind === 'landed') && !landed) {
        landed = true
        s.setTraces({ name: 'Last Kettle', finder: 'DUSK' })
      }
      if (n < 30) s.setControls(held(0, 0))
      else if (n < 100) s.setControls({ ...held(0, 0), land: true })
      else if (n < 300) s.setControls(held(n < 180 ? 0 : 0.6, 0))
      else f.toward(home.x, home.y, s.loop.prompt === 'pad' || s.loop.stage === 'landing')
    })
    f.expect(landed && f.scene.loop.stage === 'landed', 'landed, and the world named')
    return f.marks
  },

  // a stretch of flight recorded as a ghost (it is kept: the deed carries its path); then another
  // pilot's ghost flies its run straight ahead of the ship, pale and slower, and the guns scatter it
  'a ghost recorded, and another raced and shot': (create, defaults, worlds) => {
    const w = worlds('archipelago', 1)
    const f = new Flight(create, defaults, { ...w, side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    let recorded = 0
    let shot = false
    f.fly(1080, (n) => {
      const s = f.scene
      if (n < 80) s.setControls({ ...held(0, 0), land: n > 10 })
      else if (n < 560) s.setControls(held(Math.sin(n / 90) * 0.5, n < 200 ? 0.4 : 0))
      if (n === 120) s.recordGhost(true)
      if (n === 520) s.recordGhost(false)
      if (n === 560) {
        // (another pilot's ghost, as the page hands it in: its run begins now, 90 px ahead, at 60 px a second)
        const p = s.player
        const path: number[] = []
        for (let i = 0; i < 40; i++) {
          const d = 90 + i * 12
          path.push(p.x + Math.sin(p.heading) * d, p.y - Math.cos(p.heading) * d, p.height, p.heading)
        }
        s.setTraces({
          marks: [mark('ghost', path[0], path[1], path[2], { path, at: LOOP_CLOCK + n / 60, callsign: 'GHOSTLY', hull: 'lance' })],
        })
      }
      if (n >= 560) s.setControls(held(0, 0, 0, n > 600 && !shot))
      for (const d of s.takeDeeds()) {
        if (d.kind === 'ghost' && d.path) recorded = d.path.length / 4
        if (d.kind === 'ghostShot') shot = true
      }
    })
    f.expect(recorded >= 20 && shot, `a ghost recorded (${recorded} samples) and another shot`)
    return f.marks
  },
}

// Phase 8: ships made a pilot's own. Weapons and modules fitted (and seen on the hull), each new
// weapon in a fight, a ship repainted, every hull fitted out.
export const shipFlights: Record<string, Script> = {
  // flak pods on both mounts (seen standing off the wings) and a shield booster: a raider close in is shredded
  'flak pods fitted, seen and fired': (create, defaults) => {
    const f = new Flight(
      create,
      defaults,
      { intro: false, skirmish: false, crash: false, weapons: 'flak,flak', parts: 'shield-booster' },
      240,
      135,
    )
    let downed = -1
    f.fly(1200, (n) => {
      if (n === 10) f.scene.addShip({ ...besidePlayer(f.scene, 140, 0), hull: 'dart', speed: 50, side: 1, paint: ENEMY })
      if (downed < 0 && f.scene.status.skirmish.kills === 1) downed = n
      if (downed < 0 || n < downed + 60) f.hunt(0, n > 30, false)
      else f.scene.setControls(held(0.4, 0))
    })
    f.expect(f.scene.status.skirmish.kills === 1 && (f.heard.flak ?? 0) > 5, 'the raider shot down with flak')
    return f.marks
  },

  // a mining laser on one mount and the cannon on the other: the laser's pale pulses, a kill all the same
  'a mining laser and a cannon': (create, defaults) => {
    const f = new Flight(
      create,
      defaults,
      { intro: false, skirmish: false, crash: false, weapons: 'laser,cannon', view: 'chase' },
      240,
      135,
    )
    f.fly(480, (n) => {
      if (n === 10) f.scene.addShip({ ...besidePlayer(f.scene, 110, 6), hull: 'dart', speed: 58, side: 1, paint: ENEMY })
      if (n < 360) f.hunt(0, n > 30, false)
      else f.scene.setControls(held(0.4, 0))
    })
    f.expect(f.scene.status.skirmish.kills === 1 && (f.heard.laser ?? 0) > 5, 'the raider shot down, the laser firing')
    return f.marks
  },

  // two missile racks and no guns: six missiles, fired as each locks
  'missile racks and no guns': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false, weapons: 'rack,rack' }, 240, 135)
    f.fly(600, (n) => {
      if (n === 10) f.scene.addShip({ ...besidePlayer(f.scene, 160, 10), hull: 'lance', speed: 70, side: 1, paint: ENEMY })
      // (the secondary button let go now and then, so each lock fires one)
      f.hunt(0, false, n % 20 < 10)
    })
    f.expect(
      f.scene.status.missilesMax === 8 && (f.heard.launch ?? 0) >= 2 && f.scene.status.skirmish.kills === 1,
      'missiles from the racks',
    )
    return f.marks
  },

  // a mine layer: a raider on the player's tail flies into the mines he drops
  'mines dropped on a chaser': (create, defaults) => {
    const f = new Flight(
      create,
      defaults,
      { intro: false, skirmish: false, crash: false, weapons: 'mines,cannon', view: 'chase' },
      240,
      135,
    )
    let hurt = 1
    f.fly(720, (n) => {
      if (n === 1) f.scene.addShip({ ...besidePlayer(f.scene, -120, 0), hull: 'dart', speed: 92, side: 1, pilot: 3, paint: ENEMY })
      // (straight on, a mine let go every half second)
      f.scene.setControls(held(0.05 * Math.sin(n / 60), 0, 0, false, n % 30 < 4))
      const s = f.scene.listShips()[0]
      if (s) hurt = Math.min(hurt, s.hullLeft + s.shieldLeft)
    })
    f.expect((f.heard.mine ?? 0) >= 4 && hurt < 1, 'mines dropped and one burst on the chaser')
    return f.marks
  },

  // a fitted ship repainted in flight: trim, glow, trails, a pattern, an emblem and the side's mark
  'a fitted ship repainted': (create, defaults) => {
    const f = new Flight(
      create,
      defaults,
      { intro: false, skirmish: false, weapons: 'flak,flak', parts: 'cargo-pod,scanner', side: 'nomarchy' },
      200,
      120,
    )
    f.fly(480, (n) => {
      f.scene.setControls(held(0.3, 0))
      if (n === 60) f.set({ trimColor: '#e8c22c', glowColor: '#ff5a3a', trailColor: '#ff5a8a' })
      if (n === 150) f.set({ pattern: 'stripes', emblem: 'skull' })
      if (n === 240) f.set({ factionMark: true, bodyColor: '#d8d0bc', accentColor: '#2a46c0' })
      if (n === 330) f.set({ pattern: 'teeth', emblem: 'wolf', timeOfDay: 'sunset' })
    })
    return f.marks
  },

  // a squad of two: tucked in beside a squad mate the player flies in his slipstream (faster), until the mate peels away; then two computer wingmen fill the squad
  'a squad in formation, in the slipstream': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, side: 'nomarchy' }, 240, 135)
    let id = 0
    let fastest = 0
    let slipped = 0
    f.fly(720, (n) => {
      const s = f.scene
      if (n === 1) {
        id = s.addShip({ ...besidePlayer(s, 6, -30), hull: 'lance', speed: 98, side: 0, label: 'VEGA', mark: 1, markColor: GOLD })
        s.setSquad({ on: true, mates: [{ id, callsign: 'VEGA' }] })
      }
      if (n === 260) s.updateShip(id, { heading: s.player.heading - 0.9 })
      if (n === 420) f.set({ wingmen: 2 })
      s.setControls(held(0, 0))
      if (n < 240) fastest = Math.max(fastest, s.status.slip)
      if (n > 360 && n < 420) slipped = Math.max(slipped, s.status.slip)
    })
    f.expect(
      fastest > 0.9 && slipped < 0.2 && f.scene.status.slip > 0.9,
      'in the slipstream beside the mate, out of it once he peeled away, and in it with the wingmen',
    )
    return f.marks
  },

  // landed at the Nomarchy's capital, into the hangar: his ship on show, fitted; to the bench (its screen asked for), up to the deck and its crowd, back down, and out to the ship
  'walking the hangar and the deck': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, weapons: 'flak,flak', parts: 'scanner,cargo-pod', emblem: 'star' }, 240, 135)
    const opened: string[] = []
    // (from the way in at the bottom, along the walkway and up the painted lane to the bench in the wall at the top, along
    // it to the deck's door in the corner; on the deck to the shop's counter and back down; then down the lane and along the
    // bottom walkway, round his ship, out to the pad)
    const route: [number, number, boolean][] = [
      [100, 152, false],
      [60, 150, false],
      [60, 38, true],
      [26, 33, true],
      // (on the deck, round its tables and the chart table, since polish step 9 furnished it)
      [112, 70, false],
      [72, 70, false],
      [72, 38, false],
      [32, 30, true],
      [72, 38, false],
      [72, 70, false],
      [112, 90, false],
      [112, 104, true],
      [60, 40, false],
      [60, 154, false],
      [152, 158, true],
    ]
    let leg = 0
    let pressed = 0
    let place = ''
    f.fly(1800, (n) => {
      const s = f.scene
      if (n === 30) s.goInside('hangar')
      for (const u of s.takeUses()) if (u.kind === 'open') opened.push(u.spot ?? '')
      // (through a door: that leg is done)
      if (s.interior.place !== place) {
        if (place && pressed) leg++
        place = s.interior.place
        pressed = 0
      }
      if (n < 40 || leg >= route.length || !s.interior.place) return s.setControls(held(0, 0))
      const [x, y, use] = route[leg]
      // (there: Use held a moment if this leg wants it, then on to the next)
      if (walkInside(s, x, y)) {
        s.setControls({ ...held(0, 0), land: use && pressed < 4 })
        if (!use || ++pressed > 8) {
          leg++
          pressed = 0
        }
      }
    })
    f.expect(opened.includes('bench') && f.scene.zone.kind === 'surface', `the bench asked for (${opened}) and back out in the ship`)
    return f.marks
  },

  // a light fighter's rooms (a cockpit), then a hauler's (four rooms): walked from the hatch to the seat
  'aboard a light fighter, then a hauler': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, hull: 'dart' }, 240, 135)
    const rooms: number[] = []
    f.fly(900, (n) => {
      const s = f.scene
      if (n === 30) s.goInside('ship')
      if (n === 300) {
        s.goOutside()
        f.set({ hull: 'galleon' })
      }
      if (n === 320) s.goInside('ship')
      if (n === 31 || n === 321) rooms.push(s.interior.rooms)
      // (up towards the seat)
      if (s.interior.place) s.setControls(held(0, 1))
      else s.setControls(held(0, 0))
    })
    f.expect(rooms[0] === 1 && rooms[1] >= 3, `a cockpit alone, then rooms (${rooms})`)
    return f.marks
  },

  // aboard a hauler, a bunk bought placed in its quarters, taken up again, and placed elsewhere
  'furniture placed aboard': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, hull: 'mule' }, 240, 135)
    const done: string[] = []
    let y0 = 0
    f.fly(720, (n) => {
      const s = f.scene
      if (n === 30) {
        s.goInside('ship')
        s.setFurniture([{ id: 'plant', x: 0, y: 0 }])
      }
      if (n === 60) {
        s.placeFurniture('bunk')
        y0 = s.interior.y
      }
      // (the plant left where it cannot stand is taken up at once, back to place again: not counted here)
      for (const u of s.takeUses()) if (u.kind !== 'open' && n > 30) done.push(u.kind)
      if (n < 60) return s.setControls(held(0, 0))
      // up into the room from the hatch, out of its reach, then left until the bunk can stand in front of him: Use puts it down; a
      // moment later Use takes it up; then it is placed again, across the room
      const it = s.interior
      const ok = it.placing !== '' && it.placeOk
      const placed = done.filter((d) => d === 'placed').length
      const taken = done.includes('taken')
      const press = (ok && n % 12 === 0) || (placed === 1 && !taken && n % 12 === 6)
      const up = it.y > y0 - 22
      const turn = up ? 0 : placed === 1 && taken ? 1 : -1
      s.setControls({ ...held(ok ? 0 : turn, up ? 1 : 0), land: press })
      if (taken && placed === 1 && !it.placing) s.placeFurniture('bunk')
    })
    f.expect(done.join(',') === 'placed,taken,placed', `a bunk placed, taken up and placed again (${done})`)
    return f.marks
  },

  // the cockpits of four hulls (each its own, drawn by the image model): a raider's, a hauler's, a gunship's and a stealth
  // ship's, low over the capital world, turning, a raider ahead in the sights
  'the cockpits of four hulls, over a world': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false, view: 'cockpit', hull: 'corsair' }, 240, 135)
    const hulls = ['corsair', 'mule', 'bastion', 'wraith']
    f.fly(hulls.length * 90, (n) => {
      if (n % 90 === 0) f.set({ hull: hulls[n / 90] })
      if (n === 5) f.scene.addShip({ ...besidePlayer(f.scene, 120, 0), hull: 'lance', speed: 80, side: 1, paint: ENEMY })
      f.scene.setControls(held(Math.sin(n / 40) * 0.4, 0))
    })
    return f.marks
  },

  // the same four from the seat in space: docked at the Nomarchy's capital station, then out and cruising
  'the cockpits of four hulls, in space': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, world: 's0', view: 'cockpit', hull: 'corsair' }, 240, 135)
    const hulls = ['corsair', 'mule', 'bastion', 'wraith']
    f.fly(hulls.length * 90, (n) => {
      if (n % 90 === 0) f.set({ hull: hulls[n / 90] })
      f.scene.setControls({ ...held(n > 200 ? -0.3 : 0, 0), land: n > 120 && n < 160 })
    })
    return f.marks
  },

  // a light fighter's rooms with the fit-out it comes with (a cockpit, its console, a side console, a chair, a locker),
  // walked from the hatch to the seat
  'a furnished light fighter, walked to the seat': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, hull: 'sparrow' }, 240, 135)
    let seated = false
    f.fly(420, (n) => {
      const s = f.scene
      if (n === 30) {
        s.goInside('ship')
        s.setFurniture(s.kitOf('sparrow'))
      }
      if (n < 40) return s.setControls(held(0, 0))
      if (!s.interior.place) {
        seated = true
        return s.setControls(held(0, 0))
      }
      // (up the middle; Use by the seat)
      s.setControls({ ...held(0, 1), land: s.interior.spot === 'seat' && n % 10 < 5 })
    })
    f.expect(seated, 'from the hatch to the seat')
    return f.marks
  },

  // a freighter's five rooms' worth with their fit-out: walked from the hatch through the cargo bay, the crew quarters and
  // the map room to the cockpit, round what stands in the way
  'a furnished freighter, walked to the seat': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, hull: 'galleon' }, 240, 135)
    const names: string[] = []
    let mid = 0
    let lastY = 0
    let stuck = 0
    let aside = 0
    f.fly(1100, (n) => {
      const s = f.scene
      if (n === 30) {
        s.goInside('ship')
        // (its fit-out, but for the tables that stand on the middle line: the way round them is the player's to find, and
        // this walk keeps to the middle line, where the doorways are)
        s.setFurniture(s.kitOf('galleon').filter((p) => p.id !== 'table' && p.id !== 'maptable'))
      }
      if (n < 40 || !s.interior.place) return s.setControls(held(0, 0))
      const it = s.interior
      if (n === 40) mid = it.x
      const room = it.room
      if (room && names[names.length - 1] !== room) names.push(room)
      // (up the middle line, where the doorways are; round a table standing on it, to the left, and back to the middle)
      stuck = Math.abs(it.y - lastY) < 0.05 ? stuck + 1 : 0
      lastY = it.y
      if (stuck > 6) aside = 40
      const turn = aside-- > 0 ? -1 : Math.max(-1, Math.min(1, (mid - it.x) / 6))
      s.setControls({ ...held(turn, 1), land: it.spot === 'seat' && n % 10 < 5 })
    })
    f.expect(names.length >= 4 && !f.scene.interior.place, `through the rooms (${names}) to the seat`)
    return f.marks
  },

  'gear on an ice world: a cold lining and a hauler pack': (create, defaults, worlds) => {
    const f = new Flight(create, defaults, { ...worlds('ice'), side: 'nomarchy', intro: false, skirmish: false, look: SOLARI }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    let bitten = 1
    let lined = 1
    let at = 1
    f.fly(720, (n) => {
      const s = f.scene
      if (n === 30) s.act('use')
      if (n === 300) f.set({ gear: 'cold-lining,pack-8,power-cutter' })
      if (n > 60 && n < 300) bitten = Math.min(bitten, s.foot.health)
      if (n === 320) at = lined = s.foot.health
      if (n > 320) lined = Math.min(lined, s.foot.health)
      if (s.foot.stage === 'walking') f.walk(s.player.x + Math.sin(n / 40) * 30, s.player.y + 20)
    })
    f.expect(
      bitten < 0.9 && lined >= at - 1e-6 && f.scene.foot.pack.length === 8,
      `bitten by the cold (${bitten}), not in the lining (${lined}), a pack of 8`,
    )
    return f.marks
  },

  // every hull in turn, each fitted as far as its mounts and slots go
  'every hull fitted out': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, view: 'chase' }, 200, 120)
    const hulls = ['dart', 'sparrow', 'lance', 'corsair', 'wraith', 'prospector', 'mule', 'bastion', 'nomad', 'galleon']
    const arms = ['flak', 'laser', 'rack', 'mines']
    const mods = ['cargo-pod', 'scanner', 'tractor', 'armour', 'afterburner', 'heat-sink', 'cruise-drive', 'shield-booster']
    f.fly(hulls.length * 48, (n) => {
      f.scene.setControls(held(0.2, 0))
      if (n % 48 === 0) {
        const i = n / 48
        f.set({
          hull: hulls[i],
          weapons: [arms[i % 4], arms[(i + 1) % 4], arms[(i + 2) % 4], arms[(i + 3) % 4]].join(','),
          parts: [mods[i % 8], mods[(i + 3) % 8], mods[(i + 5) % 8]].join(','),
          pattern: ['stripes', 'bands', 'tips', 'split'][i % 4],
          emblem: ['star', 'comet', 'eye'][i % 3],
        })
      }
    })
    return f.marks
  },
}

/** a training drone's paint (data/skirmish.ts DRILL) */
const DRILL_PAINT = { body: '#e6e2d4', accent: '#ff7a1a', canopy: '#26303a' }

// The first session (Phase 9): what the page's guided first sortie asks of the scene
export const firstFlights: Record<string, Script> = {
  // three training drones put up ahead over the Nomarchy's capital, the guide on each in turn (and once on a point off
  // the frame, an arrow at its edge): shot down, they score, but pay nothing and are no deeds; they never fire back
  'training drones, the guide on each': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, side: 'nomarchy', world: 'w0' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const ids: number[] = []
    let worst = 1
    const deeds: string[] = []
    f.fly(1500, (n) => {
      const s = f.scene
      // (off the pad, and away from the base)
      if (n < 40) s.setControls({ ...held(0, 0), land: true })
      if (n === 200)
        for (const [ahead, across] of [
          [190, -50],
          [250, 60],
          [310, -10],
        ])
          ids.push(
            s.addShip({ ...besidePlayer(s, ahead, across), hull: 'dart', speed: 60, side: 1, pilot: 1, drill: true, paint: DRILL_PAINT }),
          )
      // the guide: on the nearest drone left, or for a moment on a point well off the frame
      const left = s.listShips().filter((x) => ids.includes(x.id) && x.hullLeft > 0)
      if (n > 200 && n < 260) s.setGuide({ x: s.player.x - 500, y: s.player.y + 300, label: 'ore' })
      else if (left.length) s.setGuide({ ship: left[0].id, label: 'drone' })
      else s.setGuide(null)
      if (n >= 40 && n < 200) s.setControls(held(0.15, 0))
      else if (n >= 200) f.hunt(0, n > 260, false)
      if (n > 60) worst = Math.min(worst, s.status.hull)
      for (const d of s.takeDeeds()) deeds.push(d.kind)
      f.takeLedger()
    })
    f.expect(
      f.scene.status.skirmish.kills === 3 && worst === 1 && !deeds.includes('kill') && !f.ledger.bounty,
      `three drones down (${f.scene.status.skirmish.kills}), no harm done (${worst}), no kill deed (${deeds}), nothing paid (${JSON.stringify(f.ledger)})`,
    )
    return f.marks
  },

  // overhead, a finger steering: the touch screen's Dive held takes the ship down, Climb takes it up, and it still turns
  'overhead, a finger steering while diving and climbing': (create, defaults) => {
    const f = new Flight(create, defaults, { intro: false, skirmish: false, crash: false }, 200, 120)
    let high = 0
    let low = 9999
    let turned = 0
    f.fly(600, (n) => {
      const s = f.scene
      const a = n * 0.02
      s.pointerMove(100 + Math.cos(a) * 60, 60 + Math.sin(a) * 30)
      // (as the touch buttons send it: climb, with the stick's sense (invertY): −1 climbs, +1 dives)
      if (n === 10) s.setControls(held(0, -1))
      if (n === 250) s.setControls(held(0, 1))
      if (n === 480) s.setControls(held(0, 0))
      if (n === 249) high = s.player.height
      if (n === 479) low = s.player.height
      if (n === 100) turned = s.player.heading
      if (n === 400) turned = Math.abs(s.player.heading - turned)
    })
    f.expect(high > 140 && low < high - 80 && turned > 0.5, `climbed to ${high}, dived to ${low}, turned ${turned}`)
    return f.marks
  },
}

/** the galaxy's own ships about a scene: raiders (and drones), patrols of a side, and haulers, by how far each is from the player */
function locals(f: Flight) {
  const all = f.scene.listShips().filter((x) => x.band >= 0 || x.traffic)
  const near = (x: { x: number; y: number }) => f.from(x.x, x.y)
  return {
    raiders: all.filter((x) => x.band >= 0 && !x.faction),
    patrols: (side: string) => all.filter((x) => x.faction === side),
    haulers: all.filter((x) => x.traffic),
    near,
  }
}

/** the news a band gives when it comes for the player (sim/bands.ts alert): heard as the wave's sound */
const alerted = (f: Flight) => f.heard.wave ?? 0

export const localFlights: Record<string, Script> = {
  // the Nomarchy's capital world, quiet: off the pad, alongside his side's patrol between the bases, a hauler
  // going over; nothing comes for him (polish pass, item 8: the galaxy's own ships)
  'a quiet flight through a home system': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago'), side: 'nomarchy', intro: false, skirmish: false, locals: true },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let hauler = 1e9
    let patrol = 1e9
    let foes = 0
    f.fly(1500, (n) => {
      const s = f.scene
      const l = locals(f)
      if (n < 60) s.setControls({ ...held(0, 0), land: true })
      else {
        // (alongside the patrol, once there is one; round the island until then)
        const p = l.patrols('nomarchy')[0]
        if (p) f.toward(p.x, p.y)
        else s.setControls(held(0.12, 0))
      }
      for (const x of l.haulers) hauler = Math.min(hauler, l.near(x))
      for (const x of l.patrols('nomarchy')) patrol = Math.min(patrol, l.near(x))
      foes += l.raiders.length + l.patrols('anarchoi').length
    })
    f.expect(
      hauler < 260 && patrol < 200 && foes === 0 && f.scene.status.hull === 1 && !alerted(f),
      `a hauler by (${hauler.toFixed(0)} px), his patrol alongside (${patrol.toFixed(0)} px), no one hostile (${foes}), unhurt (${f.scene.status.hull})`,
    )
    return f.marks
  },

  // the frontier's space, a gate out to wilder systems: raiders waiting off to one side of the way in come
  // out as the ship nears (AMBUSH), and it turns to fight them
  'an ambush at a gate': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's3', side: 'nomarchy', intro: false, skirmish: false, locals: true }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const gate = bodyOf(f.scene, 'gate')
    const r = Math.hypot(gate.x, gate.y)
    // (1500 px in from the gate, heading for it)
    f.scene.placePlayer(gate.x - (gate.x / r) * 1500, gate.y - (gate.y / r) * 1500, Math.atan2(gate.x, -gate.y))
    let closest = 1e9
    f.fly(1200, (n) => {
      const g = now(f.scene, gate.index)!
      if (!alerted(f)) f.toward(g.x, g.y)
      else f.hunt()
      if (n % 10 === 0) for (const x of locals(f).raiders) closest = Math.min(closest, f.from(x.x, x.y))
    })
    f.expect(
      alerted(f) >= 1 && closest < 250 && (f.heard.cannon ?? 0) > 0,
      `ambushed (${alerted(f)}), raiders close (${closest.toFixed(0)} px), fought back`,
    )
    return f.marks
  },

  // a derelict in the Anarchoi's frontier: its drones come out of the wreck, and a pilot of the Anarchoi shoots them
  // down; it stays clear (gone and back again, nothing comes), until its clock turns and they are back
  'a derelict cleared, and staying clear': (create, defaults) => {
    // (a gunship, fit for clearing a wreck)
    const f = new Flight(
      create,
      defaults,
      { world: 's9', side: 'anarchoi', hull: 'bastion', intro: false, skirmish: false, locals: true },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    const hulk = f.scene.bodies().find((b) => b.kind === 'base' && b.name.endsWith('Hulk'))!
    f.scene.placePlayer(hulk.x + 1100, hulk.y, -Math.PI / 2)
    const drones = () => f.scene.listShips().filter((x) => x.band === 3000 + hulk.index)
    for (let i = 0; i < 40 && !f.scene.clearedBands().some((c) => c.band === 3000 + hulk.index); i++)
      f.fly(60, () => {
        const h = now(f.scene, hulk.index)!
        // (the one in the sights; else round for the nearest drone; else on for the wreck)
        const near = drones().sort((a, b) => f.from(a.x, a.y) - f.from(b.x, b.y))[0]
        if (f.scene.status.target || !near) f.hunt()
        if (!f.scene.status.target) f.toward(near ? near.x : h.x, near ? near.y : h.y)
      })
    const beaten = f.scene.clearedBands().find((c) => c.band === 3000 + hulk.index)
    // away, and back over the wreck
    const h1 = now(f.scene, hulk.index)!
    f.scene.placePlayer(h1.x + 5000, h1.y, 0)
    f.fly(60, () => f.scene.setControls(held(0.1, 0)))
    const h2 = now(f.scene, hulk.index)!
    f.scene.placePlayer(h2.x + 400, h2.y, -Math.PI / 2)
    let came = 0
    f.fly(300, () => {
      const h = now(f.scene, hulk.index)!
      f.toward(h.x, h.y)
      came = Math.max(came, drones().length)
    })
    // its clock turns: the drones are back
    if (beaten) f.scene.setClock(beaten.until + 5)
    f.fly(120, () => f.scene.setControls(held(0.2, 0)))
    f.expect(
      !!beaten && came === 0 && drones().length === 3,
      `the drones beaten (${!!beaten}), none while it is clear (${came}), back when its clock turns (${drones().length})`,
    )
    return f.marks
  },

  // a world of the Nomarchy's frontier: a loaded ship passing the raiders by the rich ore is ambushed, and his
  // side's patrol between the bases turns on them and shoots them down; he never fires
  'a patrol defending its world': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago', 1), side: 'nomarchy', intro: false, skirmish: false, locals: true },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    f.fly(180, () => f.scene.setControls({ ...held(0, 0), land: true }))
    f.scene.loadHold([{ id: 'ferrite', n: 30 }])
    // (the band by the rich ore, near the patrols' way between the bases; not the one watching the outpost's way in)
    const spot = locals(f).raiders.find((x) => x.band === 100) ?? { x: f.scene.player.x - 500, y: f.scene.player.y + 100 }
    const at = { x: spot.x, y: spot.y }
    // (every raider seen, and those gone by the end: shot down, since he is near them all the while)
    const seen = new Set<number>()
    f.fly(1500, () => {
      f.toward(at.x, at.y)
      for (const x of locals(f).raiders) seen.add(x.id)
    })
    const left = new Set(locals(f).raiders.map((x) => x.id))
    const downed = [...seen].filter((id) => !left.has(id)).length
    // (since the last pass's tuning the low frontier's raiders are three and come two at a time: the patrol fights them,
    // but it no longer always saves a loaded pilot who never fires; he may lose his load)
    f.expect(
      alerted(f) >= 1 && downed >= 1 && f.scene.status.skirmish.kills === 0,
      `ambushed (${alerted(f)}), raiders downed (${downed}) by the patrol, not him (${f.scene.status.skirmish.kills})`,
    )
    return f.marks
  },

  // the deep frontier, where no side patrols: a loaded ship comes too near the raiders by the rich ore, is
  // chased, and runs for home with the thrusters open; under the base's guns it is off their ground, and they
  // give it up and go back to wait; it lands, and the cargo is banked
  'a loaded ship chased, and escaping': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('archipelago', 4), side: 'nomarchy', intro: false, skirmish: false, locals: true },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    f.fly(180, () => f.scene.setControls({ ...held(0, 0), land: true }))
    f.scene.loadHold([{ id: 'ferrite', n: 30 }])
    const spot = { ...(locals(f).raiders[0] ?? { x: 0, y: 0 }) }
    f.expect(!locals(f).patrols('nomarchy').length && !locals(f).patrols('anarchoi').length, 'no side patrols here')
    let ran = -1
    f.fly(1500, (n) => {
      if (ran < 0 && alerted(f)) ran = n
      const home = f.scene.loop.home
      if (ran < 0 || !home) return f.toward(spot.x, spot.y)
      // (flat out for home, and down onto its pad)
      const close = f.from(home.x, home.y) < 260
      f.toward(home.x, home.y, f.scene.loop.prompt === 'pad' || f.scene.loop.stage !== 'flying', 0, close ? 0 : 1)
      f.takeLedger()
    })
    const left = locals(f).raiders
    const far = Math.min(...left.map((x) => f.from(x.x, x.y)))
    f.expect(
      alerted(f) >= 1 && left.length > 0 && far > 400 && (f.ledger.bank ?? 0) >= 1,
      `chased (${alerted(f)}), home and banked (${JSON.stringify(f.ledger)}), the nearest raider ${far.toFixed(0)} px off`,
    )
    return f.marks
  },
}

/** a way on foot round what stops him: where he was, how long he has made no way, and a turn to one side he is taking */
interface Way {
  x: number
  y: number
  stuck: number
  detour: number
  side: number
  fails: number
}
const newWay = (): Way => ({ x: 0, y: 0, stuck: 0, detour: 0, side: 1, fails: 0 })

/** on foot towards (x, y), and round a cliff or the sea: stopped a moment, he goes along it a while to one side (the other, after two goes) */
function walkRound(f: Flight, way: Way, x: number, y: number, run = false) {
  const p = f.scene.player
  const moved = Math.hypot(p.x - way.x, p.y - way.y)
  way.x = p.x
  way.y = p.y
  if (way.detour > 0) {
    way.detour--
    const a = Math.atan2(x - p.x, -(y - p.y)) + (way.side * Math.PI) / 2
    return f.walk(p.x + Math.sin(a) * 40, p.y - Math.cos(a) * 40, run)
  }
  way.stuck = moved < 0.15 ? way.stuck + 1 : 0
  if (way.stuck > 10) {
    way.stuck = 0
    way.detour = 70
    if (++way.fails % 2 === 0) way.side = -way.side
  }
  f.walk(x, y, run)
}

/** a pilot on foot hunting: stands and fires at a creature in reach (turning to it now and then, as a player does with the keys), else walks to it */
function huntOnFoot(f: Flight, way: Way, n: number, x: number, y: number, reach = 70) {
  const d = f.from(x, y)
  if (d > reach) return walkRound(f, way, x, y, d > 160)
  // (the keys turn him; the guns fire the way he faces, the aim turned onto the creature by the sidearm's assist)
  if (n % 24 < 4) f.walk(x, y)
  else f.scene.setControls(held(0, 0, 0, true))
}

/** the creature of a kind up nearest the player (null: none) */
function nearestCreature(f: Flight, kind?: string) {
  let best: { id: number; kind: string; x: number; y: number; health: number; mode: number } | null = null
  for (const c of f.scene.wildlife().creatures)
    if ((!kind || c.kind === kind) && (!best || f.from(c.x, c.y) < f.from(best.x, best.y))) best = c
  return best
}

/** the nearest creature that fights within `reach` px of the player, his prey aside (null: none): a pilot turns on it first */
function threat(f: Flight, prey: number, reach = 80) {
  let best: { id: number; x: number; y: number } | null = null
  for (const c of f.scene.wildlife().creatures)
    if (
      c.id !== prey &&
      c.kind !== 'woolhorn' &&
      c.kind !== 'skitter' &&
      f.from(c.x, c.y) < reach &&
      (!best || f.from(c.x, c.y) < f.from(best.x, best.y))
    )
      best = c
  return best
}

/** a dive under a glob coming at him, as it nears (`was`: one was near at the last step); true while one is near */
function dodge(f: Flight, was: boolean) {
  const near = f.scene.wildlife().globs.some((g) => f.from(g.x, g.y) < 26)
  if (near && !was) f.scene.act('roll')
  return near
}

/** how many of the pack's slots hold a creature's parts, by what */
function packed(f: Flight) {
  const out: Record<string, number> = {}
  for (const s of f.scene.foot.pack) if (s) out[s.id] = (out[s.id] ?? 0) + s.n
  return out
}

export const creatureFlights: Record<string, Script> = {
  // out of the ship at a base on a continental world and off on foot to where its hunters keep: a razorjaw sees him,
  // stalks and charges, bites; he stands and shoots it down; it falls, bleeds a little, and he walks over what it dropped
  'a hunt on foot: a hunter charged, shot down, its drops taken': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('continental'), side: 'nomarchy', intro: false, skirmish: false, locals: true, look: SOLARI },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let home: { x: number; y: number } | null = null
    let prey = -1
    let bitten = 0
    let killed = false
    const way = newWay()
    f.fly(2400, (n) => {
      const s = f.scene
      if (n === 20) s.act('use')
      if (s.foot.stage !== 'walking') return
      const w = s.wildlife()
      if (!home) {
        // (the hunters' home nearest him)
        const list = w.homes.filter((h) => h.kind === 'razorjaw').sort((a, b) => f.from(a.x, a.y) - f.from(b.x, b.y))
        home = list[0] ?? null
        f.expect(!!home, 'razorjaws living on this world')
      }
      const c = prey >= 0 ? w.creatures.find((x) => x.id === prey) : nearestCreature(f, 'razorjaw')
      const foe = threat(f, prey)
      if (foe) huntOnFoot(f, way, n, foe.x, foe.y)
      else if (c && !killed) {
        prey = c.id
        huntOnFoot(f, way, n, c.x, c.y)
      } else if (prey >= 0 && !killed) killed = true
      else if (killed && w.drops.length) {
        const d = w.drops.reduce((a, b) => (f.from(a.x, a.y) < f.from(b.x, b.y) ? a : b))
        walkRound(f, way, d.x, d.y)
      } else if (!killed) walkRound(f, way, home!.x, home!.y)
      else s.setControls(held(0, 0))
      bitten = Math.max(bitten, f.heard.bite ?? 0)
      f.takeLedger()
    })
    const pack = packed(f)
    f.expect((f.heard.beastDown ?? 0) >= 1 && killed, `a razorjaw shot down (heard ${f.heard.beastDown ?? 0})`)
    f.expect((f.heard.growl ?? 0) >= 1, 'it came for him')
    f.expect(!!(pack.hide || pack.gland) && (f.ledger.picked ?? 0) >= 1, `its drops in the pack (${JSON.stringify(pack)})`)
    f.expect(f.scene.foot.stage === 'walking', 'he lived')
    return f.marks
  },

  // out at a base on a mesa world and on foot to a herd of woolhorns: they see him coming and run, the herd together;
  // he fires after them from as far as a bolt goes, brings one down, and takes the hide it leaves
  'a herd running from a pilot, one brought down for its hide': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('mesa'), side: 'nomarchy', intro: false, skirmish: false, locals: true, look: KESTRIN },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let home: { x: number; y: number } | null = null
    let prey = -1
    let killed = false
    let ran = 0
    let glob = false
    const way = newWay()
    f.fly(1800, (n) => {
      const s = f.scene
      if (n === 20) s.act('use')
      if (s.foot.stage !== 'walking') return
      const w = s.wildlife()
      if (!home) {
        home = w.homes.filter((h) => h.kind === 'woolhorn').sort((a, b) => f.from(a.x, a.y) - f.from(b.x, b.y))[0] ?? null
        f.expect(!!home, 'woolhorns living on this world')
      }
      ran = Math.max(ran, w.creatures.filter((c) => c.kind === 'woolhorn' && c.mode === 2).length)
      glob = dodge(f, glob)
      const c = prey >= 0 ? w.creatures.find((x) => x.id === prey) : nearestCreature(f, 'woolhorn')
      const foe = threat(f, prey)
      if (foe) huntOnFoot(f, way, n, foe.x, foe.y)
      else if (c && !killed) {
        prey = c.id
        huntOnFoot(f, way, n, c.x, c.y, 120)
      } else if (prey >= 0 && !killed) killed = true
      else if (killed && w.drops.length) {
        const d = w.drops.reduce((a, b) => (f.from(a.x, a.y) < f.from(b.x, b.y) ? a : b))
        walkRound(f, way, d.x, d.y, true)
      } else if (!killed) walkRound(f, way, home!.x, home!.y)
      else s.setControls(held(0, 0))
      f.takeLedger()
    })
    f.expect(ran >= 2, `the herd ran together (${ran})`)
    f.expect(killed && (f.heard.beastDown ?? 0) >= 1, 'a woolhorn brought down')
    f.expect((packed(f).hide ?? 0) >= 2, `its hide in the pack (${JSON.stringify(packed(f))})`)
    return f.marks
  },

  // on foot to a spitter on a mesa world: it keeps its distance and spits; he dives out from under each glob as it
  // comes, closes, and shoots it down, and takes its gland
  'a spitter’s globs dived under, the spitter shot down': (create, defaults, worlds) => {
    const f = new Flight(
      create,
      defaults,
      { ...worlds('mesa'), side: 'nomarchy', intro: false, skirmish: false, locals: true, look: ORRIN },
      240,
      135,
    )
    f.scene.setClock(LOOP_CLOCK)
    let home: { x: number; y: number } | null = null
    let prey = -1
    let killed = false
    let dived = 0
    let flying = 0
    const way = newWay()
    f.fly(2400, (n) => {
      const s = f.scene
      if (n === 20) s.act('use')
      if (s.foot.stage !== 'walking') return
      const w = s.wildlife()
      if (!home) {
        home = w.homes.filter((h) => h.kind === 'spitter').sort((a, b) => f.from(a.x, a.y) - f.from(b.x, b.y))[0] ?? null
        f.expect(!!home, 'spitters living on this world')
      }
      // (a glob in the air coming at him: a dive as it nears, under it)
      const near = w.globs.some((g) => f.from(g.x, g.y) < 26)
      if (near && !flying) {
        s.act('roll')
        dived++
      }
      flying = near ? 1 : 0
      const c = prey >= 0 ? w.creatures.find((x) => x.id === prey) : nearestCreature(f, 'spitter')
      const foe = threat(f, prey)
      if (foe) huntOnFoot(f, way, n, foe.x, foe.y)
      else if (c && !killed) {
        prey = c.id
        huntOnFoot(f, way, n, c.x, c.y, 100)
      } else if (prey >= 0 && !killed) killed = true
      else if (killed && w.drops.length) {
        const d = w.drops.reduce((a, b) => (f.from(a.x, a.y) < f.from(b.x, b.y) ? a : b))
        walkRound(f, way, d.x, d.y)
      } else if (!killed) walkRound(f, way, home!.x, home!.y)
      else s.setControls(held(0, 0))
      f.takeLedger()
    })
    f.expect((f.heard.spit ?? 0) >= 1 && dived >= 1, `it spat (${f.heard.spit ?? 0}) and he dived (${dived})`)
    f.expect(killed && (f.heard.beastDown ?? 0) >= 1, 'the spitter shot down')
    f.expect(f.scene.foot.stage === 'walking', 'he lived')
    return f.marks
  },
}

/** up out of the seat in flight (James, 2026-11-18: "walk around the ship when its flying"; sim/interior.ts getUp) */
export const seatFlights: Record<string, Script> = {
  // off the Nomarchy's capital, up and flying from behind; the seat key: his ship's rooms, walked to the back (the hatch
  // sealed) while the ship flies on by itself, its heading and height held; back at the seat, Use sits him down, and the
  // view is the one from behind again
  'out of the seat in flight: walked to the back and sat down again': (create, defaults) => {
    const f = new Flight(create, defaults, { ...INSIDE_BASE, hull: 'corsair', view: 'chase' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.fly(240, (n) => f.scene.setControls(n < 60 ? { ...held(0, 0), land: true } : held(0, n < 180 ? -1 : 0)))
    f.expect(f.scene.loop.stage === 'flying', `flying (${f.scene.loop.stage})`)
    const from = { ...f.scene.player }
    f.scene.act('seat')
    f.expect(
      !!f.scene.foot.up && f.scene.interior.place === 'ship' && f.scene.zone.kind === 'surface',
      'up out of the seat, the zone the sky',
    )
    const seat = { x: f.scene.interior.x, y: f.scene.interior.y }
    let lowest = 1e9
    let sealed = false
    f.fly(300, () => {
      walkInside(f.scene, seat.x, seat.y + 400)
      lowest = Math.min(lowest, f.scene.player.above)
      sealed ||= f.scene.interior.spot === 'hatch'
    })
    f.expect(sealed && f.scene.interior.y > seat.y + 60, `at the back, by the sealed hatch (${f.scene.interior.spot})`)
    f.fly(300, () => {
      walkInside(f.scene, seat.x, seat.y - 6)
      lowest = Math.min(lowest, f.scene.player.above)
    })
    f.expect(f.scene.interior.spot === 'seat', `by the seat (${f.scene.interior.spot})`)
    const p = f.scene.player
    const turned = Math.abs(Math.atan2(Math.sin(p.heading - from.heading), Math.cos(p.heading - from.heading)))
    f.expect(
      Math.hypot(p.x - from.x, p.y - from.y) > 600 && turned < 0.05,
      `flown on straight (${Math.hypot(p.x - from.x, p.y - from.y).toFixed(0)} px, turned ${turned.toFixed(3)})`,
    )
    f.expect(
      Math.abs(p.height - from.height) < 30 && lowest > 6,
      `its height held (${from.height.toFixed(0)} to ${p.height.toFixed(0)}, ${lowest.toFixed(0)} px over the ground at the least)`,
    )
    f.fly(60, (n) => {
      if (n === 0) f.scene.act('use')
      f.scene.setControls(held(0.3, 0))
    })
    f.expect(
      !f.scene.foot.up && f.scene.foot.stage === 'ship' && f.scene.view === 'chase',
      `back in the seat, from behind (${f.scene.view})`,
    )
    f.expect((f.heard.out ?? 0) === 1 && (f.heard.board ?? 0) === 1, 'up and down heard')
    return f.marks
  },

  // in space, flying overhead: up out of the seat; a raider comes head on and its shots land (the rooms shake and flash, the
  // alarm, the warning) while the ship flies on; the seat key from where he stands puts him back in the seat to fight
  'up from the seat in space, hit by a raider, back to the seat': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false, look: SOLARI }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    f.scene.placePlayer(40000, 40000, 0.4)
    // (a new ship's protection over first)
    f.fly(360, () => f.scene.setControls(held(0, 0)))
    f.scene.act('seat')
    f.expect(!!f.scene.foot.up && f.scene.zone.kind === 'space', 'up out of the seat in space')
    f.scene.addShip({
      ...besidePlayer(f.scene, 260, 0),
      heading: f.scene.player.heading + Math.PI,
      hull: 'lance',
      speed: 92,
      side: 1,
      pilot: 8,
      paint: ENEMY,
    })
    let warned = false
    let n = 0
    for (; n < 1200 && !warned; n++)
      f.fly(1, () => {
        walkInside(f.scene, f.scene.interior.x + 1, f.scene.interior.y + 60)
        warned = (f.scene.interior.struck ?? 99) < 0.5
      })
    f.expect(warned && (f.heard.alarm ?? 0) >= 1, `hit while up, the alarm heard (${n} frames)`)
    f.expect(f.scene.status.hull < 1 || f.scene.status.shield < 1, 'the hit landed')
    f.fly(45, () => f.scene.setControls(held(0, 0)))
    f.expect(!!f.scene.foot.up, 'still up')
    f.scene.act('seat')
    f.expect(!f.scene.foot.up && f.scene.foot.stage === 'ship', 'back in the seat at once')
    f.fly(240, () => f.hunt())
    f.expect((f.heard.cannon ?? 0) > 0, 'fighting back')
    return f.marks
  },
}

// The target key (docs/targeting.md): what it picks, bracketed in the world, and its card or the cockpit's screen
export const targetFlights: Record<string, Script> = {
  // three raiders ahead, from behind: the furthest picked by pressing on, then hunted; its card's hull falls as it is shot,
  // and the sights stay on it while the nearer two fly about
  'a raider targeted from behind and shot': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's1', side: '', intro: false, skirmish: false, view: 'chase' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const world = bodyOf(f.scene, 'planet')
    f.scene.placePlayer(world.x + world.size * 3, world.y, -Math.PI / 2)
    const ids: number[] = []
    f.fly(1, () => {
      for (let i = 0; i < 3; i++)
        ids.push(
          f.scene.addShip({
            ...besidePlayer(f.scene, 160 + i * 70, (i - 1) * 40),
            heading: f.scene.player.heading,
            hull: 'lance',
            speed: 70,
            side: 1,
            pilot: 1,
            paint: ENEMY,
          }),
        )
    })
    f.fly(20, () => f.scene.setControls(held(0, 0)))
    // (pressed three times: the nearest, the next, the furthest)
    const picked: string[] = []
    for (let i = 0; i < 3; i++) {
      f.scene.act('target')
      f.fly(10, () => f.scene.setControls(held(0, 0)))
      picked.push(f.scene.target?.name ?? '')
    }
    f.expect(
      picked.every((n) => n === 'RAIDER'),
      `three raiders picked in turn (${picked.join(', ')})`,
    )
    f.fly(600, () => f.hunt(0, true, false))
    f.expect((f.heard.explosion ?? 0) >= 1 || (f.scene.target?.rel ?? '') === 'enemy', 'the raider picked hunted')
    return f.marks
  },

  // from the seat beside a station: the target key pressed on through what is in view (the station, a world, the sun …),
  // each said on the panel's screen
  'targets picked in turn from the seat, beside a station': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's0', side: 'nomarchy', intro: false, skirmish: false, view: 'cockpit' }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const station = bodyOf(f.scene, 'base')
    f.scene.placePlayer(station.x + station.size * 3, station.y, -Math.PI / 2)
    f.fly(60, () => f.scene.setControls(held(0, 0)))
    const seen = new Set<string>()
    for (let i = 0; i < 4; i++) {
      f.scene.act('target')
      f.fly(45, () => f.scene.setControls(held(0, 0)))
      if (f.scene.target) seen.add(f.scene.target.name)
    }
    f.expect(seen.size >= 2, `more than one thing picked (${[...seen].join(', ')})`)
    // (held a moment, it lets go)
    f.fly(40, () => f.scene.setControls({ ...held(0, 0), target: true }))
    f.fly(10, () => f.scene.setControls(held(0, 0)))
    f.expect(!f.scene.target, 'let go when the key is held')
    return f.marks
  },

  // overhead: a station picked, then turned away from: an arrow at the frame's edge points the way, with its name
  'a target off the frame, overhead': (create, defaults) => {
    const f = new Flight(create, defaults, { world: 's0', side: 'nomarchy', intro: false, skirmish: false }, 240, 135)
    f.scene.setClock(LOOP_CLOCK)
    const station = bodyOf(f.scene, 'base')
    f.scene.setTarget({ kind: 'body', index: station.index })
    f.scene.placePlayer(station.x + station.size * 2, station.y, Math.PI / 2)
    f.fly(240, () => f.scene.setControls(held(0, 0)))
    f.expect(f.scene.target?.kind === 'body', `the station still picked (${f.scene.target?.name})`)
    return f.marks
  },
}
