// Mining from the air: hold Land low over an outcrop and the mining laser cuts it; its ore
// pops out as chunks that fall round it, and the ship scoops them up by flying over them,
// into its hold while there is room. An outcrop holds so much in each of its periods (a length
// of its own, from the world's seed): mined out, its crystals are gone, and at the start of
// its next period it is whole again. The periods run on the clock every player shares (UTC),
// so nothing needs a server: two players at the same outcrop agree how much is left as long as
// they tell each other what they take (Scene.mined, from the network).

import { CHUNK, CUT, MINE } from '../data/loop'
import { RESOURCE_IDS, RESOURCES } from '../data/resources'
import type { ResourceId } from '../data/resources'
import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import { showOutcrop } from '../world/features'
import { inWindow } from '../world/lands'
import type { Outcrop } from '../world/features'
import { groundAt } from '../world/world'
import { addTo, roomFor } from './cargo'
import { jitter, sound } from './effects'
import { deltaIn, news, nowOf, record } from './loop'
import { oreRocks } from './belts'
import { dangerHere } from './bands'
import { report } from './room'
import { paceHere, stockOf } from './traces'

export interface Mining {
  /** the outcrop the laser can reach (null: none), and whether it is cutting it */
  target: Outcrop | null
  on: boolean
  /** the cut under way (shown by the HUD, drawn by render/mining.ts) */
  cut: Cut
  /** how near and low the ship holds the laser over its outcrop, 0 (the edge of its reach) to 1 (right over it): it cuts faster the nearer */
  aim: number
  /** ore scooped since it was last written in the ledger, and seconds until it is */
  scooped: Map<ResourceId, number>
  flush: number
  /** sparks, flecks of rock and dust off the strike of the laser or the hand cutter (MOTE_F numbers each), the next to be written */
  motes: Float32Array
  moteHead: number
  /** the last cut freed, for the HUD's +3 FERRITE rising from where it was cut (null: none yet); `pack`: by hand, into the pack */
  pop: { ore: ResourceId; n: number; at: number; x: number; y: number; z: number; pack: boolean } | null
  /** scene time ore last went into the hold (the HUD shows how full it is for a moment) */
  scoopAt: number
}

/**
 * A cut under way, by the ship's laser or by the hand cutter on foot: what is being cut and since when it has been in
 * reach (the bracket closes on it), how far through the cut the beam is, how hot the rock is where it strikes, and when
 * the last cut broke free (a flash). Both are kept and drawn alike.
 */
export interface Cut {
  /** what is in reach (an outcrop's, a rock's or a vein's id; −1: nothing), the last thing that was, and when it last was */
  id: number
  last: number
  seenAt: number
  /** scene time it came in reach (the bracket closes on it, the lock is heard) */
  lockAt: number
  /** cutting now, and seconds the beam has been on */
  on: boolean
  beamT: number
  /** units through the cut (0 .. batch), and the units it will free */
  cut: number
  batch: number
  /** 0..1: how hot the rock is where the beam strikes (it warms while cut and cools after), and where that is */
  heat: number
  x: number
  y: number
  z: number
  ore: ResourceId
  /** scene time the last cut broke free (−99: none), and how many units it freed */
  doneAt: number
  doneN: number
}

export function createCut(): Cut {
  return {
    id: -1,
    last: -1,
    seenAt: -99,
    lockAt: -99,
    on: false,
    beamT: 0,
    cut: 0,
    batch: 1,
    heat: 0,
    x: 0,
    y: 0,
    z: 0,
    ore: 'ferrite',
    doneAt: -99,
    doneN: 0,
  }
}

/** the motes off a cut: how many at once, the numbers each (x y z, speed x y z, when it flew, what it is, its ore) */
export const MOTE_N = 160
export const MOTE_F = 9
/** what a mote is: a hot spark, a fleck of the ore, a bit of dark rock, a puff of dust */
export const MOTE_SPARK = 0
export const MOTE_FLECK = 1
export const MOTE_GRIT = 2
export const MOTE_DUST = 3
/** seconds each kind lasts */
export const MOTE_LIFE = [0.42, 0.75, 0.7, 0.9]

export function createMining(): Mining {
  const motes = new Float32Array(MOTE_N * MOTE_F)
  for (let i = 0; i < MOTE_N; i++) motes[i * MOTE_F + 6] = -99
  return { target: null, on: false, cut: createCut(), aim: 0, scooped: new Map(), flush: 0, motes, moteHead: 0, pop: null, scoopAt: -99 }
}

/** a mote flown off the strike at (x, y, z): out at a speed in `fly`, up at one in `up` (none in space) */
function addMote(scene: SceneState, kind: number, x: number, y: number, z: number, ore: ResourceId, fast = 1) {
  const m = scene.loop.mining
  const o = m.moteHead * MOTE_F
  const a = (jitter(scene, 61) + 1) * Math.PI
  const out = (CUT.fly[0] + ((jitter(scene, 67) + 1) / 2) * (CUT.fly[1] - CUT.fly[0])) * fast
  const space = scene.zone.kind === 'space'
  m.motes[o] = x
  m.motes[o + 1] = y
  m.motes[o + 2] = z + 1
  m.motes[o + 3] = Math.cos(a) * out
  m.motes[o + 4] = Math.sin(a) * out
  m.motes[o + 5] = space ? 0 : (CUT.up[0] + ((jitter(scene, 71) + 1) / 2) * (CUT.up[1] - CUT.up[0])) * (kind === MOTE_DUST ? 0.3 : fast)
  m.motes[o + 6] = scene.time
  m.motes[o + 7] = kind
  m.motes[o + 8] = RESOURCE_IDS.indexOf(ore)
  m.moteHead = (m.moteHead + 1) % MOTE_N
}

/**
 * One step of a cut: `id` is what is in reach (−1: nothing) and where it is struck, `on` whether the beam is on it, `rate`
 * units a second it cuts, `most` the units a cut frees (as many as are left, up to the batch). Returns the units that
 * broke free this step (0 most steps); the caller takes them.
 */
export function stepCut(
  scene: SceneState,
  c: Cut,
  dt: number,
  id: number,
  x: number,
  y: number,
  z: number,
  ore: ResourceId,
  on: boolean,
  rate: number,
  most: number,
  own: boolean,
) {
  const t = scene.time
  if (id !== c.id) {
    // (come in reach: the bracket closes and the lock is heard, unless it is the same rock lost a moment ago at the edge of reach)
    if (id >= 0 && (id !== c.last || t - c.seenAt > CUT.relock)) {
      c.lockAt = t
      sound(scene, 'oreLock', x, y, z, 1, own)
    }
    if (id >= 0 && id !== c.last) c.cut = 0
    c.id = id
  }
  if (id >= 0) {
    c.last = id
    c.seenAt = t
    c.x = x
    c.y = y
    c.z = z
    c.ore = ore
    c.batch = Math.max(1, most)
  }
  c.on = on && id >= 0
  if (!c.on) {
    c.beamT = 0
    return 0
  }
  const was = c.beamT
  c.beamT += dt
  c.heat = Math.min(1, c.heat + dt * CUT.warm)
  // (the beam reaches the rock before it cuts)
  if (c.beamT < CUT.reach) return 0
  // sparks and flecks off the strike, so many a second
  const sparks = Math.floor(c.beamT * CUT.sparks) - Math.floor(was * CUT.sparks)
  for (let i = 0; i < sparks; i++) addMote(scene, MOTE_SPARK, x, y, z, ore)
  const flecks = Math.floor(c.beamT * CUT.flecks) - Math.floor(was * CUT.flecks)
  for (let i = 0; i < flecks; i++) addMote(scene, i & 1 ? MOTE_GRIT : MOTE_FLECK, x, y, z, ore, 0.6)
  c.cut += dt * rate
  if (c.cut < c.batch) return 0
  // the cut breaks free: a flash, a burst of rock and dust
  const n = c.batch
  c.cut = 0
  c.doneAt = t
  c.doneN = n
  for (let i = 0; i < CUT.burst; i++) addMote(scene, i % 3 === 0 ? MOTE_DUST : i % 3 === 1 ? MOTE_FLECK : MOTE_SPARK, x, y, z, ore, 1.3)
  sound(scene, 'cut', x, y, z, Math.min(1, n / 3), own)
  return n
}

/** the motes fly, fall and settle; the rock struck cools when the beam is off it */
function stepMotes(scene: SceneState, dt: number) {
  const m = scene.loop.mining
  const space = scene.zone.kind === 'space'
  const t = scene.time
  if (!m.cut.on) m.cut.heat = Math.max(0, m.cut.heat - dt * CUT.cool)
  const cutter = scene.foot.cutter
  if (!cutter.on) cutter.heat = Math.max(0, cutter.heat - dt * CUT.cool)
  const v = m.motes
  const drag = Math.exp(-dt * (space ? 2.4 : 1.2))
  for (let i = 0; i < MOTE_N; i++) {
    const o = i * MOTE_F
    const kind = v[o + 7]
    if (t - v[o + 6] > MOTE_LIFE[kind]) continue
    v[o + 3] *= drag
    v[o + 4] *= drag
    v[o] += v[o + 3] * dt
    v[o + 1] += v[o + 4] * dt
    if (space) continue
    // (dust drifts up a little; the rest falls and lies where it lands)
    v[o + 5] = kind === MOTE_DUST ? v[o + 5] * drag : v[o + 5] - CHUNK.gravity * (kind === MOTE_SPARK ? 0.7 : 1.1) * dt
    v[o + 2] += v[o + 5] * dt
    const g = groundAt(scene.world, v[o], v[o + 1])
    if (v[o + 2] < g) {
      v[o + 2] = g
      v[o + 3] *= 0.4
      v[o + 4] *= 0.4
      v[o + 5] = 0
    }
  }
}

/** a cut freed `n` units of `ore` at (x, y, z): the HUD's +n NAME rises from there */
export function popOf(scene: SceneState, ore: ResourceId, n: number, x: number, y: number, z: number, pack: boolean) {
  scene.loop.mining.pop = { ore, n, at: scene.time, x, y, z, pack }
}

/** a chunk of ore, thrown out of an outcrop, lying where it fell until it is scooped up or is gone */
export interface Chunk {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  ore: ResourceId
  /** scene time it was cut */
  born: number
  /** cut by this game's laser: only this game scoops it up (others' only show) */
  own: boolean
  /** at rest on the ground */
  still: boolean
  /** scene time it began to fly up into the hold (−1: not yet) */
  pulled: number
  /** units of ore it is worth: 1, or a gem's (data/loop.ts CHUNK.gem) */
  units: number
}

/** the most chunks lying about at once (the oldest go first) */
const CHUNKS_MOST = 160

/** which period an outcrop is in, at `now` seconds since 1970 */
export const periodOf = (o: Outcrop, now: number) => Math.floor((now + o.offset) / o.period)

/** units an outcrop has left now */
export function leftIn(scene: SceneState, o: Outcrop) {
  const t = scene.loop.taken.get(o.id)
  // (a hotspot's outcrops hold more today: traces.ts)
  const stock = scene.zone.kind === 'space' ? o.stock : stockOf(scene, o.stock)
  if (!t || t.epoch !== periodOf(o, nowOf(scene))) return stock
  return Math.max(0, stock - t.n)
}

/** `n` units taken from an outcrop in period `epoch` (by this game, or as another says): its crystals go as it empties */
export function takeFrom(scene: SceneState, o: Outcrop, epoch: number, n: number) {
  const now = periodOf(o, nowOf(scene))
  if (epoch !== now) return
  const t = scene.loop.taken.get(o.id)
  if (!t || t.epoch !== epoch) scene.loop.taken.set(o.id, { epoch, n })
  else t.n += n
  // (a rock in space has no crystals stamped into the ground: it is drawn as it is)
  // (only where the ground it stands in is in the scene's hold of it now: far off, other ground is: world/lands.ts)
  if (scene.zone.kind !== 'space' && inWindow(scene.world, o.x, o.y))
    showOutcrop(scene.world, o, leftIn(scene, o) / stockOf(scene, o.stock))
}

/** outcrops whose period has turned are whole again */
export function regrow(scene: SceneState) {
  const now = nowOf(scene)
  for (const [id, t] of scene.loop.taken) {
    const o = scene.world.features.outcrops[id]
    if (!o || periodOf(o, now) === t.epoch) continue
    scene.loop.taken.delete(id)
    if (inWindow(scene.world, o.x, o.y)) showOutcrop(scene.world, o, 1)
  }
}

/** the chance a chunk cut from an outcrop here comes out a gem (more from a rich deposit, and the wilder the place) */
export function gemChance(scene: SceneState, o: Outcrop) {
  const G = CHUNK.gem
  return G.chance * (o.rich ? G.rich : 1) * (G.wild[dangerHere(scene)?.level ?? 0] ?? 1)
}

/** a chunk thrown out of an outcrop: now and then a gem, worth more, thrown further (more of them from a rich deposit, and the wilder the place) */
export function throwChunk(scene: SceneState, o: Outcrop, own: boolean) {
  const a = (jitter(scene, 41) + 1) * Math.PI
  const G = CHUNK.gem
  const gem = own && (jitter(scene, 59) + 1) / 2 < gemChance(scene, o)
  const range = gem ? G.out : CHUNK.out
  const out = range[0] + ((jitter(scene, 43) + 1) / 2) * (range[1] - range[0])
  const up = scene.zone.kind === 'space' ? 0 : CHUNK.up[0] + ((jitter(scene, 47) + 1) / 2) * (CHUNK.up[1] - CHUNK.up[0])
  const list = scene.loop.chunks
  list.push({
    x: o.x + jitter(scene, 51) * 3,
    y: o.y + jitter(scene, 53) * 3,
    z: o.z - 1,
    vx: Math.cos(a) * out,
    vy: Math.sin(a) * out,
    vz: up,
    ore: o.ore,
    born: scene.time,
    own,
    still: false,
    pulled: -1,
    units: gem ? G.units : 1,
  })
  if (gem) sound(scene, 'gem', o.x, o.y, o.z, 1, false)
  if (list.length > CHUNKS_MOST) list.splice(0, list.length - CHUNKS_MOST)
}

/** the outcrop the ship's laser can reach from where it is, with ore left (null: none) */
export function outcropInReach(scene: SceneState, j: Jet): Outcrop | null {
  let best: Outcrop | null = null
  let bestD = MINE.reach
  // (in space, the rocks round the ship with ore in them)
  const list = scene.zone.kind === 'space' ? oreRocks(scene) : scene.world.features.outcrops
  for (const o of list) {
    const dx = deltaIn(scene, o.x - j.x)
    const dy = deltaIn(scene, o.y - j.y)
    if (Math.abs(dx) > MINE.reach || Math.abs(dy) > MINE.reach) continue
    const d = Math.hypot(dx, dy)
    if (d > bestD || j.z - o.z > MINE.above || j.z < o.z - 4) continue
    if (leftIn(scene, o) <= 0) continue
    best = o
    bestD = d
  }
  return best
}

/** the height the laser strikes an outcrop at (its crystals' top), or a rock in space (its middle: a rock's z is its underside) */
export const strikeZ = (o: Outcrop) => ('r' in o ? o.z + (o.r as number) * 0.7 : o.z)

/** the laser, for one step: on while Land is held and an outcrop is in reach; a burst of chunks pops out as each cut breaks free */
export function stepLaser(scene: SceneState, dt: number, j: Jet, held: boolean, canMine: boolean) {
  const m = scene.loop.mining
  m.target = canMine ? outcropInReach(scene, j) : null
  const o = m.target
  m.on = !!o && held
  // (it cuts faster the nearer and lower the ship holds it over the outcrop: data/loop.ts MINE.aim)
  const near = o ? clamp(1 - Math.hypot(deltaIn(scene, o.x - j.x), deltaIn(scene, o.y - j.y), (j.z - o.z) * 0.6) / MINE.reach, 0, 1) : 0
  m.aim = near
  const rate =
    MINE.rate *
    (MINE.miners[scene.mesh.model.name] ?? 1) *
    scene.parts.mine *
    paceHere(scene) *
    (MINE.aim[0] + (MINE.aim[1] - MINE.aim[0]) * near)
  const left = o ? leftIn(scene, o) : 0
  const freed = o
    ? stepCut(scene, m.cut, dt, o.id, o.x, o.y, strikeZ(o), o.ore, m.on, rate, Math.min(MINE.batch, left), true)
    : stepCut(scene, m.cut, dt, -1, 0, 0, 0, 'ferrite', false, 0, 0, true)
  if (!o || freed <= 0) return
  const n = Math.min(freed, left)
  const epoch = periodOf(o, nowOf(scene))
  takeFrom(scene, o, epoch, n)
  report(scene, { kind: 'mined', outcrop: o.id, epoch, n })
  for (let i = 0; i < n; i++) throwChunk(scene, o, true)
  popOf(scene, o.ore, n, o.x, o.y, strikeZ(o), false)
  if (left - n <= 0) news(scene, 'MINED OUT', 'IT COMES BACK IN A WHILE', false)
}

/** the laser is off and nothing is in its reach (the ship is not flying, or Use is for something else) */
export function stopLaser(scene: SceneState) {
  const m = scene.loop.mining
  m.on = false
  m.target = null
  m.cut.on = false
  m.cut.id = -1
  m.cut.beamT = 0
}

/** chunks fall and come to rest; the ship scoops up its own as it passes over them, while its hold has room */
export function stepChunks(scene: SceneState, dt: number, j: Jet | null, reach: number) {
  stepMotes(scene, dt)
  const list = scene.loop.chunks
  const world = scene.world
  const hold = scene.loop.hold
  const m = scene.loop.mining
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i]
    if (c.pulled >= 0) {
      // flying up into the hold
      const u = (scene.time - c.pulled) / CHUNK.pull
      if (!j || u >= 1) {
        const got = j ? addTo(hold, c.ore, c.units) : 0
        if (got > 0) {
          m.scooped.set(c.ore, (m.scooped.get(c.ore) ?? 0) + got)
          m.scoopAt = scene.time
          sound(scene, c.units > 1 ? 'gemScoop' : 'scoop', j!.x, j!.y, j!.z, 1, true)
        }
        list.splice(i, 1)
        continue
      }
      const k = 1 - Math.exp(-dt * 18)
      c.x += deltaIn(scene, j.x - c.x) * k
      c.y += deltaIn(scene, j.y - c.y) * k
      c.z += (j.z - c.z) * k
      continue
    }
    if (scene.time - c.born > (c.units > 1 ? CHUNK.gem.life : CHUNK.life)) {
      list.splice(i, 1)
      continue
    }
    if (!c.still && scene.zone.kind === 'space') {
      // (in space it flies out and slows, and floats where it stops)
      const drag = Math.exp(-dt * 2.2)
      c.vx *= drag
      c.vy *= drag
      c.x += c.vx * dt
      c.y += c.vy * dt
      if (c.vx * c.vx + c.vy * c.vy < 9) c.still = true
    } else if (!c.still) {
      c.vz -= CHUNK.gravity * dt
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.z += c.vz * dt
      const g = groundAt(world, c.x, c.y)
      if (c.z <= g) {
        c.z = g
        if (c.vz < -30) {
          // a bounce, then it lies still
          c.vz = -c.vz * 0.28
          c.vx *= 0.45
          c.vy *= 0.45
        } else c.still = true
      }
    }
    // scooped up, if the ship is over it and not too high, and there is room
    if (!c.own || !j) continue
    const dx = deltaIn(scene, c.x - j.x)
    const dy = deltaIn(scene, c.y - j.y)
    const below = j.z - c.z
    if (Math.abs(dx) > reach || Math.abs(dy) > reach || dx * dx + dy * dy > reach * reach || below < -6 || below > CHUNK.below) continue
    if (roomFor(hold, c.ore) <= pulledOf(list, c.ore)) {
      if (scene.time - scene.loop.fullAt > 2.5) {
        scene.loop.fullAt = scene.time
        sound(scene, 'full', j.x, j.y, j.z, 1, true)
      }
      continue
    }
    c.pulled = scene.time
  }
  // what was scooped goes in the ledger now and then, not chunk by chunk
  m.flush -= dt
  if (m.flush <= 0 && m.scooped.size) {
    m.flush = 2
    record(scene, { kind: 'mined', items: [...m.scooped].map(([id, n]) => ({ id, n })), world: scene.worldKey })
    m.scooped.clear()
  }
}

/** units of a resource already on their way into the hold */
function pulledOf(list: Chunk[], ore: ResourceId) {
  let n = 0
  for (const c of list) if (c.pulled >= 0 && c.ore === ore) n += c.units
  return n
}

/** how far across a ship scoops up a chunk */
export const scoopReach = (scene: SceneState) => (CHUNK.reach + clamp(scene.mesh.model.w * 0.2, 0, 6)) * scene.parts.reach

/** a resource's name in capitals (for the HUD's news) */
export const nameOf = (id: string) => RESOURCES[id as ResourceId]?.name.toUpperCase() ?? id.toUpperCase()

/** every outcrop whose ground is in the scene's hold shown as it stands now: after ground has been written in afresh (sim/planet.ts keepWindow) */
export function outcropsBack(scene: SceneState) {
  for (const o of scene.world.features.outcrops)
    if (inWindow(scene.world, o.x, o.y)) showOutcrop(scene.world, o, leftIn(scene, o) / stockOf(scene, o.stock))
}
