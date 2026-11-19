// Two and three games sharing a sky, each a real scene with its own session, over the
// same-browser transport (a bus in memory) made as bad as a poor connection: delay, jitter and
// lost packets. Time is simulated, a step at a time, so every run is the same.

import { describe, expect, it } from 'vitest'
import { createScene, DEFAULT_PARAMS, STEP, worldSettings } from '../engine'
import type { Scene, SceneParams, ShipState } from '../engine'
import { localTransport, memoryHub } from './local'
import type { Conditions } from './local'
import { createLog } from './log'
import { publicKeyOf } from './nostr'
import { Session } from './session'
import type { SessionOptions } from './session'
import { Chronicle } from './chronicle'
import { namespaceOf } from './events'
import { zoneOf } from './rooms'

interface Player {
  name: string
  scene: Scene
  session: Session
  key: string
  heard: Record<string, number>
  /** stepping it stops: its tab has been closed without a word */
  frozen: boolean
}

/**
 * A secret key for a test pilot, made from his name: the same every run. Keys are inputs like
 * any other (the lowest flies the computer's ships, and what that game sends draws on the
 * transport's chance numbers), so a run with keys made at random would not be the same twice.
 */
function keyFor(name: string) {
  let h = 2166136261
  for (const ch of name) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  let hex = ''
  for (let i = 0; i < 8; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) ^ (i * 374761393)
    hex += ((h >>> 0) % 0x10000000).toString(16).padStart(8, '0')
  }
  return hex
}

/** a sky: a bus, a clock, and pilots who join it */
function sky(conditions: Partial<Conditions> = {}, cap?: number) {
  const hub = memoryHub()
  let now = 0
  const clock = () => now
  const players: Player[] = []
  let seed = 11
  /** a session for a pilot's scene, in the room of a zone */
  const connect = (name: string, faction: 'nomarchy' | 'anarchoi', scene: Scene, zone: string, look: string, secret: string) =>
    new Session({
      transport: localTransport({ bus: () => hub.bus(), clock, seed: seed++, conditions }),
      zone,
      scene,
      secret,
      card: {
        callsign: name,
        faction,
        hull: 'corsair',
        paint: { body: '#545969', accent: '#f0580e', canopy: '#1e8ca0' },
        look,
      },
      clock,
      wallClock: () => 1_790_000_000_000 + now,
      log: createLog(),
      cap,
    })
  const join = (
    name: string,
    faction: 'nomarchy' | 'anarchoi',
    params: Partial<SceneParams> = {},
    secret = keyFor(name),
    zone = 'test',
    extra: Partial<SessionOptions> = {},
  ) => {
    const transport = localTransport({ bus: () => hub.bus(), clock, seed: seed++, conditions })
    const scene = createScene({ ...DEFAULT_PARAMS, intro: false, skirmish: false, crash: false, locals: false, ...params })
    const session = new Session({
      transport,
      zone,
      scene,
      secret,
      card: {
        callsign: name,
        faction,
        hull: 'corsair',
        paint: { body: '#545969', accent: '#f0580e', canopy: '#1e8ca0' },
        look: params.look ?? '',
      },
      clock,
      wallClock: () => 1_790_000_000_000 + now,
      log: createLog(),
      cap,
      ...extra,
    })
    const p: Player = { name, scene, session, key: publicKeyOf(secret), heard: {}, frozen: false }
    players.push(p)
    return p
  }
  /** every session's signing and checking of cards finished: done before each step, so a card takes effect at the same simulated moment however long the crypto takes in real time */
  const settled = () => Promise.all(players.map((p) => p.session.settled()))
  /** pilots whose sessions follow their scene from zone to zone, as the page's do (each zone its own room) */
  const following = new Map<Player, { faction: 'nomarchy' | 'anarchoi'; zone: string; look: string; secret: string }>()
  const follow = (p: Player, faction: 'nomarchy' | 'anarchoi', zone: string) =>
    following.set(p, { faction, zone, look: '', secret: keyFor(p.name) })
  /** the sky runs on for `seconds`; `each` is told every step */
  const run = async (seconds: number, each?: (n: number) => void) => {
    for (let n = 0; n < Math.round(seconds * 60); n++) {
      await settled()
      now += 1000 / 60
      for (const p of players) {
        if (p.frozen) continue
        p.scene.step(STEP)
        const f = following.get(p)
        if (f && zoneOf(p.scene.worldKey) !== f.zone) {
          // (into the next zone's room, leaving the last one's)
          p.session.leave()
          f.zone = zoneOf(p.scene.worldKey)
          p.session = connect(p.name, f.faction, p.scene, f.zone, f.look, f.secret)
        }
        p.session.update()
        for (const s of p.scene.takeSounds()) p.heard[s.kind] = (p.heard[s.kind] ?? 0) + 1
      }
      each?.(n)
    }
    await settled()
  }
  return { join, run, players, clock, follow }
}

/** the other pilot's ship, as `p`'s scene has it */
const shipOf = (p: Player): ShipState | undefined => p.scene.listShips().find((s) => s.side === 0 || s.side === 2)

/** the computer's ships in a scene */
const computers = (scene: Scene) => scene.listShips().filter((s) => s.side === 1)

/** `p` steers for the nearest ship of `side` (or its lead point, once it is in the sights) and fires once it is lined up */
function hunt(p: Player, side = 2) {
  const s = p.scene
  const me = s.player
  const t = s.status.target
  const prey = s
    .listShips()
    .filter((x) => x.side === side)
    .sort((x, y) => Math.hypot(x.x - me.x, x.y - me.y) - Math.hypot(y.x - me.x, y.y - me.y))[0]
  const aim = t ? { x: t.leadX, y: t.leadY } : prey
  let turn = 0.2
  let fire = false
  if (aim) {
    let off = Math.atan2(aim.x - me.x, -(aim.y - me.y)) - me.heading
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
    turn = Math.max(-1, Math.min(1, off * 3))
    fire = !!t && Math.abs(off) < 0.12
  }
  const far = prey ? Math.hypot(prey.x - me.x, prey.y - me.y) > 150 : false
  s.setControls({ turn, climb: 0, boost: far ? 1 : 0, fire, secondary: false })
}

describe('a shared sky', () => {
  it('two pilots see each other fly, through delay, jitter and loss', async () => {
    const { join, run } = sky({ delay: 60, jitter: 40, loss: 0.15 })
    const a = join('ALPHA', 'nomarchy')
    const b = join('BRAVO', 'anarchoi')
    // (B a little behind A, so they are not flying one inside the other)
    b.scene.setControls({ turn: 0.4, climb: 0, boost: 0, fire: false, secondary: false })
    await run(4)
    const seen = shipOf(a)
    expect(seen, 'A sees B').toBeTruthy()
    expect(shipOf(b), 'B sees A').toBeTruthy()
    expect(seen!.side).toBe(2)
    expect(a.session.status().pilots.map((p) => p.callsign)).toEqual(['BRAVO'])
    // B, as A draws him, follows where B really is: about 100 ms behind, and smoothly
    let worst = 0
    let jump = 0
    let last: ShipState | undefined
    await run(6, (n) => {
      if (n % 3 === 0)
        b.scene.setControls({ turn: Math.sin(n / 40), climb: Math.sin(n / 70) * 0.5, boost: 0, fire: false, secondary: false })
      const drawn = shipOf(a)!
      const real = b.scene.player
      worst = Math.max(worst, Math.hypot(drawn.x - real.x, drawn.y - real.y))
      if (last) jump = Math.max(jump, Math.hypot(drawn.x - last.x, drawn.y - last.y))
      last = drawn
    })
    // (92 px a second: 100 ms behind, plus up to 100 ms of trip, is about 20 px)
    expect(worst).toBeLessThan(45)
    // never a jump of more than a few frames' flying
    expect(jump).toBeLessThan(8)
  })

  it('a hit lands on both sides, a kill is seen by both, and the same kill again pays less', async () => {
    const { join, run } = sky({ delay: 50, jitter: 30, loss: 0.1 })
    const a = join('ALPHA', 'nomarchy')
    const b = join('BRAVO', 'anarchoi')
    // B goes on ahead, flying straight; A hunts him once his new ship's protection is over
    b.scene.setControls({ turn: 0, climb: 0, boost: 1, fire: false, secondary: false })
    await run(2.5)
    b.scene.setControls({ turn: 0.001, climb: 0, boost: 0, fire: false, secondary: false })
    let reportedHull = 1
    // what each kill paid
    const paid: number[] = []
    let kills = 0
    let score = 0
    await run(25, () => {
      hunt(a)
      const seen = shipOf(a)
      if (seen && seen.side === 2) reportedHull = Math.min(reportedHull, seen.hullLeft)
      const k = a.scene.status.skirmish
      if (k.kills > kills) paid.push(k.score - score)
      kills = k.kills
      score = k.score
    })
    // B's own game took the damage, and A saw it come back in B's state
    expect(b.heard.hit ?? 0, 'B hit').toBeGreaterThan(0)
    expect(reportedHull, 'A sees B damaged').toBeLessThan(0.9)
    // and B was shot down: he ejected, A saw him burst, and the kill is A's
    expect(b.heard.eject ?? 0, 'B ejected').toBeGreaterThan(0)
    expect(a.heard.explosion ?? 0, 'A saw B burst').toBeGreaterThan(0)
    expect(paid.length, 'A credited').toBeGreaterThanOrEqual(2)
    // the farming limit: downing him again within ten minutes paid far less
    expect(paid[1]).toBeLessThan(paid[0] * 0.5)
  })

  it('no friendly fire: pilots of one side cannot hit each other', async () => {
    const { join, run } = sky()
    const a = join('ALPHA', 'nomarchy')
    const b = join('BRAVO', 'nomarchy')
    b.scene.setControls({ turn: 0, climb: 0, boost: 1, fire: false, secondary: false })
    await run(2.5)
    b.scene.setControls({ turn: 0.001, climb: 0, boost: 0, fire: false, secondary: false })
    await run(12, () => {
      const t = a.scene.listShips().find((s) => s.side === 0)
      const me = a.scene.player
      const off = t ? Math.atan2(t.x - me.x, -(t.y - me.y)) - me.heading : 0
      a.scene.setControls({
        turn: Math.max(-1, Math.min(1, (off - Math.PI * 2 * Math.round(off / (Math.PI * 2))) * 3)),
        climb: 0,
        boost: 0,
        fire: true,
        secondary: false,
      })
    })
    expect(a.heard.cannon ?? 0).toBeGreaterThan(0)
    expect(b.scene.status.hull).toBe(1)
    expect(b.heard.hit ?? 0).toBe(0)
  })

  it('the computer’s ships are flown by the lowest key, and carry on when that pilot leaves', async () => {
    const { join, run } = sky({ delay: 40, jitter: 30, loss: 0.1 })
    // three pilots; their keys decide who flies the computer's ships
    const ps = [
      join('ALPHA', 'nomarchy', { skirmish: true }),
      join('BRAVO', 'anarchoi', { skirmish: true }),
      join('CHARLIE', 'nomarchy', { skirmish: true }),
    ]
    const byKey = [...ps].sort((x, y) => (x.key < y.key ? -1 : 1))
    const [first, second, third] = byKey
    for (const p of ps) p.scene.setControls({ turn: 0.3, climb: 0, boost: 0, fire: false, secondary: false })
    // a wave arrives
    await run(12)
    expect(first.session.host).toBe(true)
    expect(second.session.host).toBe(false)
    expect(third.session.host).toBe(false)
    const flown = computers(first.scene).filter((s) => !s.remote)
    expect(flown.length, 'the host flies a wave').toBeGreaterThan(0)
    expect(
      computers(third.scene).every((s) => s.remote),
      'the others draw them',
    ).toBe(true)
    expect(computers(third.scene).length).toBe(flown.length)
    // the host leaves
    first.session.leave()
    first.frozen = true
    const before = computers(third.scene).map((s) => [s.x, s.y])
    await run(4)
    // the next lowest key took them over from where they were, and they fly on
    expect(second.session.host).toBe(true)
    const taken = computers(second.scene)
    expect(taken.length, 'they carry on').toBeGreaterThan(0)
    expect(taken.every((s) => !s.remote)).toBe(true)
    const after = computers(third.scene)
    expect(after.length).toBe(taken.length)
    expect(after.every((s) => s.remote)).toBe(true)
    const moved = after.some((s, i) => before[i] && Math.hypot(s.x - before[i][0], s.y - before[i][1]) > 100)
    expect(moved, 'still flying').toBe(true)
  })

  it('… and carry on when that pilot’s tab closes without a word', async () => {
    const { join, run } = sky({ delay: 40, jitter: 30, loss: 0.1 })
    const ps = [join('ALPHA', 'nomarchy', { skirmish: true }), join('BRAVO', 'anarchoi', { skirmish: true })]
    const [first, second] = [...ps].sort((x, y) => (x.key < y.key ? -1 : 1))
    await run(12)
    expect(first.session.host).toBe(true)
    const flown = computers(first.scene).length
    expect(flown).toBeGreaterThan(0)
    // the host's tab is closed: nothing more comes from it, not even goodbye
    first.frozen = true
    await run(4)
    expect(second.session.host).toBe(true)
    const taken = computers(second.scene)
    expect(taken.length).toBe(flown)
    expect(taken.every((s) => !s.remote)).toBe(true)
  })

  it('a pilot who goes quiet is marked idle, then his ship goes', async () => {
    const { join, run, players } = sky({ delay: 30 })
    const a = join('ALPHA', 'nomarchy')
    const b = join('BRAVO', 'anarchoi')
    await run(3)
    expect(shipOf(a)).toBeTruthy()
    // B's tab is hidden: he says so, and stops
    b.session.setIdle(true)
    players[1].frozen = true
    await run(1)
    expect(a.session.status().pilots[0].idle).toBe(true)
    expect(shipOf(a), 'still there, marked').toBeTruthy()
    await run(4)
    expect(shipOf(a), 'gone').toBeFalsy()
    // back again
    players[1].frozen = false
    b.session.setIdle(false)
    await run(2)
    expect(a.session.status().pilots[0].idle).toBe(false)
    expect(shipOf(a)).toBeTruthy()
  })

  it('a full room turns a pilot away to the next copy', async () => {
    // (rooms of two, here)
    const { join, run } = sky({ delay: 20 }, 2)
    const a = join('A', 'nomarchy')
    const b = join('B', 'anarchoi')
    await run(1)
    const c = join('C', 'nomarchy')
    await run(2)
    expect(a.session.status().copy).toBe(1)
    expect(b.session.status().copy).toBe(1)
    expect(c.session.status().copy).toBe(2)
    expect(a.session.status().pilots.map((p) => p.callsign)).toEqual(['B'])
    expect(c.session.status().pilots).toEqual([])
  })

  it('landing, mining and a spilled crate show in a shared sky, and the crate is anyone’s', async () => {
    const { join, run } = sky({ delay: 50, jitter: 20, loss: 0.05 })
    // the Nomarchy's capital world: each pilot begins landed at a base (A at his side's, B at a neutral one)
    const world = worldSettings('w0')
    const a = join('ANN', 'nomarchy', { ...world, side: 'nomarchy', speed: 92 })
    const b = join('BOB', 'anarchoi', { ...world, side: 'anarchoi', speed: 92 })
    for (const p of [a, b]) p.scene.setClock(1_800_000_000)
    const held = (turn: number, climb: number, land = false, fire = false) => ({ turn, climb, boost: 0, fire, secondary: false, land })
    const toward = (p: Player, x: number, y: number, land = false, climb = 0) => {
      const me = p.scene.player
      let off = Math.atan2(x - me.x, -(y - me.y)) - me.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      p.scene.setControls(held(Math.max(-1, Math.min(1, off * 2.5)), climb, land))
    }
    await run(3)
    // each sees the other parked
    expect(shipOf(a)?.landing, 'A sees B landed').toBe(2)
    expect(shipOf(b)?.landing, 'B sees A landed').toBe(2)
    expect(shipOf(a)!.speed).toBe(0)

    // A lifts off and cuts the nearest outcrop: B sees his laser on it, and as much ore gone from it as A does
    const ore = a.scene.loop.ore!
    let cut = -1
    await run(30, () => {
      const me = a.scene.player
      if (a.scene.loop.stage !== 'flying') a.scene.setControls(held(0, 0, true))
      else if (Math.hypot(ore.x - me.x, ore.y - me.y) > 75) toward(a, ore.x, ore.y)
      else a.scene.setControls({ ...held(1, me.height - ore.z > 36 ? 1 : 0), mine: true })
      const seen = shipOf(b)
      if (seen && seen.mining >= 0) cut = seen.mining
    })
    expect(cut, 'B saw A’s laser on an outcrop').toBeGreaterThanOrEqual(0)
    expect(a.scene.loop.fill).toBeGreaterThan(0)
    // every outcrop holds the same in both games, and some have been cut
    const left = (p: Player) => {
      const list: number[] = []
      for (let id = 0; p.scene.oreLeft(id) >= 0; id++) list.push(p.scene.oreLeft(id))
      return list
    }
    const fresh = createScene({ ...DEFAULT_PARAMS, ...world, side: 'nomarchy' })
    fresh.setClock(1_800_000_000)
    const full: number[] = []
    for (let id = 0; fresh.oreLeft(id) >= 0; id++) full.push(fresh.oreLeft(id))
    expect(left(b)).toEqual(left(a))
    expect(left(a)).not.toEqual(full)

    // B hunts A down: A's hold spills as a crate, which B's game shows too
    a.scene.loadHold([{ id: 'ferrite', n: 20 }])
    const lost: string[] = []
    let n = 0
    for (let second = 0; second < 40 && !lost.length; second++)
      await run(1, () => {
        n++
        if (!lost.length) {
          if (b.scene.loop.stage !== 'flying') b.scene.setControls(held(0, 0, true))
          else hunt(b, 2)
          // (A takes off, and flies away from his base's turrets)
          const home = a.scene.loop.home!
          if (a.scene.loop.stage !== 'flying') a.scene.setControls(held(0, 0, a.scene.loop.stage === 'landed' && n % 40 > 8))
          else toward(a, 2 * a.scene.player.x - home.x, 2 * a.scene.player.y - home.y)
        }
        for (const e of a.scene.takeLedger()) if (e.kind === 'lost') lost.push(e.kind)
      })
    expect(lost.length, 'A lost his ship and its hold').toBe(1)
    expect(a.scene.loop.crates.length, 'A’s crate where he fell').toBe(1)
    const picked: string[] = []
    await run(1, () => {
      for (const e of b.scene.takeLedger()) if (e.kind === 'picked') picked.push(e.kind)
    })
    // (B, hunting him, may have flown straight through it in that second and taken from it: his game had it too)
    expect(b.scene.loop.crates.length === 1 || picked.length > 0, 'and B sees it').toBe(true)

    // B flies over it and takes what fits: it is gone from A's sky as well
    for (let second = 0; second < 30 && !picked.length; second++)
      await run(1, () => {
        const c = b.scene.loop.crates[0]
        if (c) toward(b, c.x, c.y, false, b.scene.player.height - c.z > 50 ? 1 : 0)
        for (const e of b.scene.takeLedger()) if (e.kind === 'picked') picked.push(e.kind)
      })
    expect(picked.length, 'B took from the crate').toBe(1)
    expect(b.scene.loop.fill).toBeGreaterThan(0)
    expect(b.scene.loop.crates.length).toBe(0)
    await run(1)
    expect(a.scene.loop.crates.length, 'gone for A too').toBe(0)
  })
})

// ── on foot (Phase 5): both sides start at the same outpost on world w9, which is neither side's home

/** a pilot of a side on w9, with a look of his own */
const onW9 = (side: 'nomarchy' | 'anarchoi', look: string): Partial<SceneParams> => ({ ...worldSettings('w9'), world: 'w9', side, look })

/** `p`, on foot, walks towards (x, y) the way his screen shows it (as a stick would push), firing or not */
function walkTo(p: Player, x: number, y: number, fire = false, run = false) {
  const me = p.scene.player
  const yaw = p.scene.foot.yaw
  const dx = x - me.x
  const dy = y - me.y
  const n = Math.hypot(dx, dy) || 1
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  const near = n < 3
  p.scene.setControls({
    turn: near ? 0 : (dx * c - dy * s) / n,
    climb: near ? 0 : -(dx * s + dy * c) / n,
    boost: run ? 1 : 0,
    fire,
    secondary: false,
  })
}

describe('the galaxy’s own ships in a shared sky', () => {
  // a world on the front line (Celium's archipelago: wild raiders by its rich ore, both sides' patrols between its bases)
  const FRONT = { ...worldSettings('w19'), locals: true }

  it('the lowest key flies the bands for the room; each game sees a patrol on its own side or the other, and a band beaten stays beaten when another takes over', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20, loss: 0.05 })
    const ps = [join('ALPHA', 'nomarchy', { ...FRONT, side: 'nomarchy' }), join('BRAVO', 'anarchoi', { ...FRONT, side: 'anarchoi' })]
    const [first, second] = [...ps].sort((x, y) => (x.key < y.key ? -1 : 1))
    const nomarchy = ps[0]
    const anarchoi = ps[1]
    // both lift off and circle near where they began, where bands wake
    for (const p of ps) p.scene.setControls({ turn: 0.25, climb: 0, boost: 0, fire: false, secondary: false, land: true })
    await run(2)
    for (const p of ps) p.scene.setControls({ turn: 0.25, climb: 0, boost: 0, fire: false, secondary: false, land: false })
    await run(10)
    expect(first.session.host).toBe(true)
    const banded = (p: Player) => p.scene.listShips().filter((s) => s.band >= 0)
    const flown = banded(first)
    expect(flown.length, 'the host flies the bands near the pilots').toBeGreaterThan(0)
    expect(flown.every((s) => !s.remote)).toBe(true)
    // (raiders, and both sides' patrols, each band once: the copies each game put up before they met are one now)
    expect(flown.some((s) => s.faction === '')).toBe(true)
    expect(flown.some((s) => s.faction === 'nomarchy') && flown.some((s) => s.faction === 'anarchoi')).toBe(true)
    const per = new Map<number, number>()
    for (const s of flown) per.set(s.band, (per.get(s.band) ?? 0) + 1)
    expect(Math.max(...per.values()), 'no band twice over').toBeLessThanOrEqual(4)
    // the other draws the same ships, each in its band, as another game's
    const seen = banded(second)
    expect(seen.every((s) => s.remote)).toBe(true)
    expect(seen.map((s) => s.band).sort()).toEqual(flown.map((s) => s.band).sort())
    // a patrol is on the side of the pilot whose side it is, and against the other; raiders against both
    for (const s of [...banded(nomarchy), ...banded(anarchoi)]) expect([0, 1, 2]).toContain(s.side)
    const sideIn = (p: Player, faction: string) =>
      banded(p)
        .filter((s) => s.faction === faction)
        .map((s) => s.side)
    for (const s of sideIn(nomarchy, 'nomarchy')) expect(s).toBe(0)
    for (const s of sideIn(anarchoi, 'nomarchy')) expect(s).toBe(2)
    for (const s of sideIn(anarchoi, 'anarchoi')) expect(s).toBe(0)
    for (const s of sideIn(nomarchy, 'anarchoi')) expect(s).toBe(2)
    // a band is beaten: every ship of it shot down in the host's game
    const victim = flown[0].band
    for (const s of banded(first).filter((q) => q.band === victim)) first.scene.hit(s.id, 9999, -1, 0, 0, 0, true)
    await run(2)
    expect(
      first.scene.clearedBands().map((c) => c.band),
      'beaten, by the host’s word',
    ).toContain(victim)
    expect(
      second.scene.clearedBands().map((c) => c.band),
      'and the other heard',
    ).toContain(victim)
    expect(
      banded(second).some((s) => s.band === victim),
      'gone for the other too',
    ).toBe(false)
    // the host leaves: the other takes the bands on as the same bands, and the beaten one stays beaten
    first.session.leave()
    first.frozen = true
    await run(6)
    expect(second.session.host).toBe(true)
    const taken = banded(second)
    expect(taken.length).toBeGreaterThan(0)
    expect(taken.every((s) => !s.remote && s.wave > 0)).toBe(true)
    expect(
      taken.some((s) => s.band === victim),
      'not put up again',
    ).toBe(false)
    expect(second.scene.clearedBands().map((c) => c.band)).toContain(victim)
  })
})

describe('pilots on foot in a shared sky', () => {
  it('a pilot out of his ship walks, and the other sees him on foot, his look, and the ship he left', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20, loss: 0.05 })
    const a = join('ALPHA', 'nomarchy', onW9('nomarchy', 'kestrin.2.1.3.3a4a6a.f2c14e'))
    const b = join('BRAVO', 'anarchoi', onW9('anarchoi', 'skarn.0.0.0.6a3030.5af0ff'))
    await run(3)
    a.scene.act('use')
    const start = { x: a.scene.player.x, y: a.scene.player.y }
    await run(3, () => walkTo(a, start.x + 70, start.y + 10))
    expect(a.scene.foot.stage).toBe('walking')
    const seen = b.scene.listWalkers()
    expect(seen.length, 'B sees A on foot').toBe(1)
    expect(seen[0].look).toBe('kestrin.2.1.3.3a4a6a.f2c14e')
    expect(seen[0].side).toBe(2)
    expect(Math.hypot(seen[0].x - a.scene.player.x, seen[0].y - a.scene.player.y), 'where he is, near enough').toBeLessThan(12)
    const parked = b.scene.listShips().filter((x) => x.parked)
    expect(parked.length, 'and his ship, standing empty').toBe(1)
    // back in: on foot no more, and his ship flies again
    await run(4, () => walkTo(a, start.x, start.y))
    a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    a.scene.act('use')
    await run(2)
    expect(a.scene.foot.stage).toBe('ship')
    expect(b.scene.listWalkers().length).toBe(0)
    expect(b.scene.listShips().filter((x) => x.parked).length).toBe(0)
  })

  it('pilots on foot shoot each other: the shooter’s game decides, the target’s takes the harm, and both see him die', async () => {
    const { join, run } = sky({ delay: 50, jitter: 30, loss: 0.1 })
    const a = join('ALPHA', 'nomarchy', onW9('nomarchy', 'solari.0.0.0.3a4a6a.f2c14e'))
    const b = join('BRAVO', 'anarchoi', onW9('anarchoi', 'noctil.1.0.0.4a3a6a.ff3a3a'))
    await run(3)
    a.scene.act('use')
    b.scene.act('use')
    const start = { x: a.scene.player.x, y: a.scene.player.y }
    // B walks off a way and stands; A turns to face him, and fires
    await run(3, () => walkTo(b, start.x - 40, start.y - 60))
    b.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    let lowest = 1
    await run(6, (n) => {
      const there = a.scene.listWalkers()[0]
      if (there) walkTo(a, there.x, there.y, n > 20)
      lowest = Math.min(lowest, b.scene.foot.health)
    })
    expect(lowest, 'B hurt, in his own game').toBeLessThan(0.5)
    expect(b.heard.die ?? 0, 'B killed').toBe(1)
    const ledger = a.scene.takeLedger()
    expect(
      ledger.some((l) => l.kind === 'bounty' && l.what === 'pilot on foot'),
      'A paid for it',
    ).toBe(true)
    // after a few seconds B is back, in his ship, at the outpost
    await run(5)
    expect(b.scene.foot.stage).toBe('ship')
  })

  it('a beacon and a flare show for the other', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20 })
    const a = join('ALPHA', 'nomarchy', onW9('nomarchy', ''))
    const b = join('BRAVO', 'nomarchy', onW9('nomarchy', ''))
    await run(3)
    a.scene.act('use')
    await run(1)
    a.scene.act('view')
    a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: true })
    await run(0.2)
    a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    await run(1)
    expect([a.heard.beacon, a.heard.flare]).toEqual([1, 1])
    expect([b.heard.beacon, b.heard.flare]).toEqual([1, 1])
  })

  it('a pilot shot down comes down on foot for the other too', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20, loss: 0.05 })
    const a = join('ALPHA', 'nomarchy', onW9('nomarchy', 'orrin.1.0.0.3a4a6a.f2c14e'))
    const b = join('BRAVO', 'anarchoi', onW9('anarchoi', ''))
    await run(3)
    // A lifts off and flies; his ship is lost (as if downed)
    await run(4, (n) => a.scene.setControls({ turn: 0.3, climb: 0, boost: 0, fire: false, secondary: false, land: n < 30 }))
    a.scene.hit(0, 999, -1, 0, 0, 0, true)
    const stages = new Set<string>()
    await run(9, () => {
      for (const w of b.scene.listWalkers()) stages.add(w.stage)
    })
    expect(a.heard.eject).toBe(1)
    expect(stages.has('falling'), 'B saw him coming down').toBe(true)
    expect(stages.has('walking') || stages.has('dead'), 'and come down').toBe(true)
  })

  it('an enemy on foot climbs into a parked ship: its owner’s game gives it up, with its cargo, and he flies it', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20, loss: 0.05 })
    const a = join('ALPHA', 'nomarchy', onW9('nomarchy', ''))
    const b = join('BRAVO', 'anarchoi', onW9('anarchoi', 'thallin.0.0.0.2a2a30.ff5a8a'))
    await run(3)
    a.scene.loadHold([{ id: 'ferrite', n: 12 }])
    a.scene.act('use')
    // B's ship is lost where it stands (he ejects, and comes down near by); A walks away from his
    const shipAt = { x: a.scene.pilot.x, y: a.scene.pilot.y }
    await run(2.5, () => walkTo(a, shipAt.x + 80, shipAt.y))
    // (once a new ship's few seconds of protection are over)
    b.scene.hit(0, 999, -1, 0, 0, 0, true)
    a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    let asked = false
    await run(12, () => {
      if (b.scene.foot.stage !== 'walking' || asked) return
      if (b.scene.foot.prompt === 'steal') {
        b.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
        b.scene.act('use')
        asked = true
      } else walkTo(b, shipAt.x, shipAt.y)
    })
    expect(asked, 'B reached it').toBe(true)
    expect(b.scene.foot.stolenFrom).toBe('ALPHA')
    expect(b.scene.foot.stage).toBe('ship')
    const carried = b.scene.loop.hold.reduce((n, s) => n + (s?.id === 'ferrite' ? s.n : 0), 0)
    expect(carried, 'with its cargo').toBe(12)
    expect(
      a.scene.takeLedger().some((l) => l.kind === 'lost'),
      'lost to its owner',
    ).toBe(true)
    expect(a.scene.foot.ship).toBe('gone')
    // B lifts off in it; A sees it go, in his own ship's paint
    await run(4, (n) => b.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: n < 40 }))
    const flown = a.scene.listShips().find((x) => x.side === 2)
    expect(flown?.parked).toBe(false)
    expect(flown?.hull).toBe('corsair')
  })
})

describe('space in a shared sky', () => {
  // (each pilot's session follows his scene from zone to zone, as the page's does: each system's space, and each world, its own room)
  const space = { world: 's0', clouds: 0, timeOfDay: 'day' as const }

  it('two pilots in a system’s space see each other fly level, and a hit lands on both sides', async () => {
    const { join, run, follow } = sky({ delay: 60, jitter: 30, loss: 0.1 })
    const a = join('ALPHA', 'nomarchy', space, undefined, zoneOf('s0'))
    const b = join('BRAVO', 'anarchoi', space, undefined, zoneOf('s0'))
    follow(a, 'nomarchy', zoneOf('s0'))
    follow(b, 'anarchoi', zoneOf('s0'))
    b.scene.setControls({ turn: 0.4, climb: 0, boost: 0, fire: false, secondary: false })
    await run(4)
    const seen = shipOf(a)
    expect(seen, 'A sees B').toBeTruthy()
    expect(Math.abs(seen!.height - b.scene.player.height)).toBeLessThan(3)
    expect(Math.hypot(seen!.x - b.scene.player.x, seen!.y - b.scene.player.y), 'where B is').toBeLessThan(60)
    await run(12, () => hunt(a))
    expect(b.scene.status.hull < 1 || b.scene.status.shield < 1, 'B was struck').toBe(true)
  })

  it('a pilot jumping through a gate leaves the room, and arrives in the other system’s', async () => {
    const { join, run, follow } = sky({ delay: 50, jitter: 20, loss: 0.05 })
    const a = join('ALPHA', 'nomarchy', space, undefined, zoneOf('s0'))
    const b = join('BRAVO', 'anarchoi', space, undefined, zoneOf('s0'))
    const c = join('CHARLIE', 'anarchoi', { ...space, world: 's1' }, undefined, zoneOf('s1'))
    follow(a, 'nomarchy', zoneOf('s0'))
    follow(b, 'anarchoi', zoneOf('s0'))
    follow(c, 'anarchoi', zoneOf('s1'))
    await run(3)
    expect(shipOf(b), 'B sees A in Fort Coria').toBeTruthy()
    expect(shipOf(c), 'C, in Thodes, sees nobody').toBeFalsy()
    // A at the gate to Thodes, holding Use in it
    const gate = a.scene.bodies().find((x) => x.kind === 'gate' && x.name === 'Gate to Thodes')!
    a.scene.placePlayer(gate.x, gate.y, Math.atan2(gate.x, -gate.y))
    await run(6, () => a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true }))
    expect(a.scene.zone.key).toBe('s1')
    await run(3, () => a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false }))
    expect(shipOf(b), 'B sees A no more').toBeFalsy()
    const there = shipOf(c)
    expect(there, 'C sees A come out of the gate').toBeTruthy()
    expect(Math.hypot(there!.x - a.scene.player.x, there!.y - a.scene.player.y)).toBeLessThan(60)
  })

  it('a pilot going down to a world sinks and burns for those left in space, changes room on the way, and comes down among those on the world', async () => {
    const { join, run, follow } = sky({ delay: 50, jitter: 20, loss: 0.05 })
    const a = join('ALPHA', 'nomarchy', space, undefined, zoneOf('s0'))
    const b = join('BRAVO', 'nomarchy', space, undefined, zoneOf('s0'))
    const world = { world: 'w1', clouds: 0, timeOfDay: 'day' as const }
    const c = join('CHARLIE', 'nomarchy', world, undefined, zoneOf('w1'))
    follow(a, 'nomarchy', zoneOf('s0'))
    follow(b, 'nomarchy', zoneOf('s0'))
    follow(c, 'nomarchy', zoneOf('w1'))
    for (const p of [a, b, c]) p.scene.setClock(1_800_000_000)
    // A over the world w1 in space, B beside him
    const w = a.scene.bodies().find((x) => x.world === 'w1')!
    a.scene.placePlayer(w.x + w.size * 0.1, w.y, 0)
    b.scene.placePlayer(w.x + w.size * 0.1 + 120, w.y, 0)
    await run(2)
    expect(shipOf(b), 'B sees A over the world').toBeTruthy()
    // A holds Use: straight into the world's air; B sees him sink under the plane
    await run(1.5, () => a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true }))
    expect(a.scene.zone.travel, 'A is on the way down').toBe('down')
    const sinking = shipOf(b)
    // (as he was a moment before: others are drawn 100 ms in the past, and he sinks fast)
    expect(sinking && sinking.height < a.scene.player.height + 60 && sinking.height < 0, 'B sees A sink under the plane').toBe(true)
    // half way down the room changes: B sees him no more; C, on the world, sees him come down from high over it
    // (he lets go: his ship goes on sinking through the air)
    await run(6, () => a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false }))
    expect(a.scene.zone.key, 'A on the world').toBe('w1')
    expect(shipOf(b), 'B sees A no more').toBeFalsy()
    const high = shipOf(c)
    expect(high, 'C sees A come down').toBeTruthy()
    expect(high!.height, 'from high over the world').toBeGreaterThan(a.scene.player.height - 200)
    // (out of its air at the top of the world's sky; from there he dives to low over its ground)
    await run(30, () =>
      a.scene.setControls({
        turn: 0,
        climb: a.scene.zone.travel === '' && a.scene.player.height > 360 ? 1 : 0,
        boost: 0,
        fire: false,
        secondary: false,
      }),
    )
    expect(a.scene.zone.travel, 'A is down').toBe('')
    const down = shipOf(c)
    expect(
      down && Math.hypot(down.x - a.scene.player.x, down.y - a.scene.player.y) < 60 && down.height < 400,
      'C sees A low over the world',
    ).toBe(true)
  })

  it('a rock cut in a belt has less ore in it for both', async () => {
    const { join, run, follow } = sky({ delay: 40, jitter: 20, loss: 0.05 })
    const w = { ...space, world: 's1', side: 'nomarchy' as const }
    const a = join('ALPHA', 'nomarchy', w, undefined, zoneOf('s1'))
    const b = join('BRAVO', 'nomarchy', w, undefined, zoneOf('s1'))
    follow(a, 'nomarchy', zoneOf('s1'))
    follow(b, 'nomarchy', zoneOf('s1'))
    for (const p of [a, b]) p.scene.setClock(1_800_000_000)
    // both out in the belt, beside the same rock
    // (a place in the belt's ring that stays where it is: the belt's own point goes round with the clock)
    const ring = a.scene.bodies().find((x) => x.kind === 'belt')!
    const r = Math.hypot(ring.x, ring.y)
    const belt = { x: Math.cos(2.766) * r, y: Math.sin(2.766) * r }
    a.scene.placePlayer(belt.x * (1 - 30 / r), belt.y * (1 - 30 / r), 0)
    await run(0.2)
    const rock = a.scene.loop.ore!
    b.scene.placePlayer(rock.x + 30, rock.y + 10, 0)
    await run(1)
    const before = b.scene.loop.ore!.left
    // A circles the rock with the laser on it; B circles it too, looking on
    const circle = (p: Player, land: boolean) => {
      const me = p.scene.player
      const d = Math.hypot(rock.x - me.x, rock.y - me.y)
      let off = Math.atan2(rock.x - me.x, -(rock.y - me.y)) - me.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      p.scene.setControls({
        turn: d > 90 ? Math.max(-1, Math.min(1, off * 2.5)) : 1,
        climb: 0,
        boost: 0,
        fire: false,
        secondary: false,
        mine: land,
      })
    }
    await run(6, () => {
      circle(a, true)
      circle(b, false)
    })
    const near = b.scene.loop.ore!
    expect(Math.hypot(near.x - rock.x, near.y - rock.y), 'B looks at the same rock').toBeLessThan(40)
    expect(near.left, 'B sees ore taken from it').toBeLessThan(before)
  })
})

describe('the persistent world in a shared sky', () => {
  it('hands a newcomer the events, passes new ones on, carries chat, and pays a bounty to whoever downs a pilot with a price', async () => {
    const { join, run, clock } = sky({ delay: 40, jitter: 20, loss: 0.05 })
    const wall = () => 1_790_000_000_000 + clock()
    const chronicle = (name: string) => new Chronicle({ secret: keyFor(name), ns: namespaceOf(true), relays: [], dial: null, clock: wall })
    const ca = chronicle('ALPHA')
    const cb = chronicle('BRAVO')
    // ALPHA planted a flag before anyone else came
    await ca.record({ kind: 'flag', world: 'w9', side: 'nomarchy', callsign: 'ALPHA', x: 1, y: 2, z: 3, n: 0 })
    let earned = 0
    const a = join('ALPHA', 'nomarchy', {}, keyFor('ALPHA'), 'test', { chronicle: ca, onEarn: (c) => (earned += c) })
    await run(1)
    // BRAVO comes later, with a price on his head and nothing in his archive
    const b = join('BRAVO', 'anarchoi', {}, keyFor('BRAVO'), 'test', { chronicle: cb, bounty: () => 160 })
    await run(4)
    await cb.settled()
    expect(cb.archive.size).toBe(1)
    expect(cb.state().worlds.w9.holder).toBe('nomarchy')
    // a new event of ALPHA's reaches BRAVO at once
    await ca.record({ kind: 'beacon', world: 'w9', side: 'nomarchy', callsign: 'ALPHA', x: 4, y: 5, z: 6, n: 2 })
    await run(1)
    await cb.settled()
    expect(cb.archive.size).toBe(2)
    // chat: a line (cleaned to what the font draws) and a quick-chat phrase
    a.session.say('hello there, bravo!')
    b.session.sayQuick(5)
    await run(1)
    // (news aside: each heard the other come)
    const allB = b.session.takeChat()
    expect(allB.filter((l) => l.channel === 'news').map((l) => l.text)).toContain('ALPHA IS HERE')
    const heardByB = allB.filter((l) => l.channel !== 'news')
    const heardByA = a.session.takeChat().filter((l) => l.channel !== 'news')
    // (each hears his own at once, the other's a trip later)
    expect(heardByB.map((l) => [l.callsign, l.text, l.quick])).toEqual([
      ['BRAVO', '', 5],
      ['ALPHA', 'HELLO THERE, BRAVO!', -1],
    ])
    expect(heardByA.map((l) => l.callsign)).toEqual(['ALPHA', 'BRAVO'])
    // ALPHA downs BRAVO (as BRAVO's game decides): ALPHA is paid the price on him
    await run(6)
    const alphaInB = b.scene.listShips().find((s) => s.side === 2)!
    for (let i = 0; i < 4; i++) {
      b.scene.hit(0, 9999, alphaInB.id, 0, 0, 0, true)
      await run(0.2)
    }
    await run(2)
    expect(earned).toBe(160)
  })

  it('carries chat to the room, to a side and to a squad, each only to those it is for, and tells who came and went', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20 })
    const a = join('ALPHA', 'nomarchy')
    const b = join('BRAVO', 'nomarchy')
    const c = join('CHARLIE', 'anarchoi')
    await run(4)
    const said = (p: typeof a) => p.session.takeChat()
    for (const p of [a, b, c]) said(p)
    a.session.say('all of you')
    a.session.say('nomarchy only', 'side')
    c.session.sayQuick(2, 'side')
    await run(1)
    const words = (p: typeof a) => said(p).map((l) => [l.callsign, l.text || String(l.quick), l.channel])
    expect(words(b)).toEqual([
      ['ALPHA', 'ALL OF YOU', 'room'],
      ['ALPHA', 'NOMARCHY ONLY', 'side'],
    ])
    expect(words(c)).toEqual([
      ['CHARLIE', '2', 'side'],
      ['ALPHA', 'ALL OF YOU', 'room'],
    ])
    // a squad: ALPHA asks CHARLIE, who says yes; a squad's line reaches him and not BRAVO
    a.session.invite(c.session.key)
    await run(1)
    c.session.accept(a.session.key)
    await run(1)
    for (const p of [a, b, c]) said(p)
    a.session.say('on me', 'squad')
    await run(1)
    expect(words(c)).toEqual([['ALPHA', 'ON ME', 'squad']])
    expect(words(b)).toEqual([])
    expect(words(a)).toEqual([['ALPHA', 'ON ME', 'squad']])
    // CHARLIE goes: the others are told
    c.session.leave()
    await run(3)
    expect(
      said(a)
        .filter((l) => l.channel === 'news')
        .map((l) => l.text),
    ).toContain('CHARLIE LEFT')
  })
})

// ── ships made a pilot's own (Phase 8): fits and paint, mines, the places inside, squads

describe('ships, the places inside and squads in a shared sky', () => {
  it('a ship fitted and painted shows so for the other pilot', async () => {
    const { join, run } = sky({ delay: 40, jitter: 20 })
    const make = 'flak,flak|scanner,cargo-pod|stripes|skull|1'
    const a = join('ALPHA', 'nomarchy', {
      weapons: 'flak,flak',
      parts: 'scanner,cargo-pod',
      pattern: 'stripes',
      emblem: 'skull',
      factionMark: true,
      side: 'nomarchy',
    })
    const b = join('BRAVO', 'anarchoi')
    a.session.setCard({
      callsign: 'ALPHA',
      faction: 'nomarchy',
      hull: 'corsair',
      paint: { body: '#2f4a6b', accent: '#ffd23a', canopy: '#6ad4ff', trim: '#c8ccd4', glow: '#ff7a2a', trail: '#ff5a8a' },
      make,
      look: '',
    })
    await run(3)
    expect(shipOf(b)?.make).toBe(make)
    // (and changed at a base later: the new make reaches him too)
    a.session.setCard({
      callsign: 'ALPHA',
      faction: 'nomarchy',
      hull: 'corsair',
      paint: { body: '#2f4a6b', accent: '#ffd23a', canopy: '#6ad4ff' },
      make: 'rack,mines||||0',
      look: '',
    })
    await run(2)
    expect(shipOf(b)?.make).toBe('rack,mines||||0')
  })

  it('a mine one pilot drops shows for the other', async () => {
    const { join, run } = sky({ delay: 40 })
    const a = join('ALPHA', 'nomarchy', { weapons: 'mines,cannon' })
    const b = join('BRAVO', 'anarchoi')
    await run(2)
    expect(a.scene.status.minesMax).toBe(4)
    let n = 0
    await run(2, () => {
      a.scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: n++ % 40 < 3 })
    })
    expect(a.scene.status.mines).toBeLessThan(4)
    expect(b.heard.mine ?? 0, 'B saw a mine dropped').toBeGreaterThanOrEqual(1)
  })

  it('pilots on the same station deck see each other there; one comes aboard the other’s ship and they meet', async () => {
    const { join, run } = sky({ delay: 40 })
    const a = join('ALPHA', 'nomarchy', onW9('nomarchy', 'solari.0.0.0.3a4a6a.f2c14e'))
    const b = join('BRAVO', 'anarchoi', onW9('anarchoi', 'skarn.1.0.0.4a2116.a46cf0'))
    await run(1)
    expect(a.scene.goInside('deck')).toBe(true)
    expect(b.scene.goInside('deck')).toBe(true)
    await run(2, () => a.scene.setControls({ turn: 0.6, climb: 0.4, boost: 0, fire: false, secondary: false }))
    // (the crowd gives way to the real pilot)
    expect(b.scene.interior.others).toBe(1)
    expect(a.scene.interior.others).toBe(1)
    // B goes aboard his own ship; A, asked aboard, comes into its rooms
    b.scene.goOutside()
    expect(b.scene.goInside('ship')).toBe(true)
    a.scene.goOutside()
    expect(a.scene.goInside('ship', 'corsair', b.key)).toBe(true)
    await run(2)
    expect(a.scene.interior.others).toBe(1)
    expect(b.scene.interior.others).toBe(1)
  })

  it('a squad: one pilot asks, the other says yes, and both have it', async () => {
    const { join, run } = sky({ delay: 40, loss: 0.1 })
    const a = join('ALPHA', 'nomarchy')
    const b = join('BRAVO', 'nomarchy')
    const c = join('CHARLIE', 'nomarchy')
    await run(2)
    a.session.invite(b.key)
    await run(1)
    expect(b.session.asked).toEqual([a.key])
    b.session.accept(a.key)
    await run(1)
    expect(a.session.squad).toEqual([b.key])
    expect(b.session.squad).toEqual([a.key])
    // a third joins: all three have the whole squad
    a.session.invite(c.key)
    await run(1)
    c.session.accept(a.key)
    await run(2)
    expect([...a.session.squad].sort()).toEqual([b.key, c.key].sort())
    expect([...b.session.squad].sort()).toEqual([a.key, c.key].sort())
    expect([...c.session.squad].sort()).toEqual([a.key, b.key].sort())
    expect(a.session.shipOf(b.key)).toBeGreaterThan(0)
    // B leaves: the others drop him
    b.session.leaveSquad()
    await run(1)
    expect(a.session.squad).toEqual([c.key])
    expect(c.session.squad).toEqual([a.key])
  })
})
