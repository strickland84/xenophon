// The galaxy (the plan's section 4), as plain data made from a fixed seed and a version
// number: twelve star systems joined by jump lanes, their suns, worlds, moons, gas giants,
// black holes, belts, bases and gates, with orbits and where everything is. Nothing is stored:
// every player makes the same galaxy, so only exact arithmetic is used (util/exact.ts).
//
// The systems keep one shape, so the map always has a front: the Nomarchy's home at the left,
// the Anarchoi's at the right, the core in the middle, and the frontier between, four systems
// on each side and one more above or below the core. Each home is reached through two lanes
// only. Within that shape the seed places the systems, adds a few lanes, and decides
// everything in them.

import { cosTurn, sinTurn } from '../util/exact'
import { mulberry32 } from '../util/math'
import { uniqueName } from './names'
import type { Voice } from './names'
import { HABITABLE, islandRecipe, lightOf, makeRecipe, settingsOf } from './recipe'
import type { Archetype, StarKind, WorldRecipe } from './recipe'
import { DEFAULT_PARAMS } from '../params'
import type { SceneParams } from '../params'

/** the galaxy everyone plays in, and the version of the rules that make it */
export const GALAXY_SEED = 1116
export const GALAXY_VERSION = 1

export type Side = 'nomarchy' | 'anarchoi'
export type SystemKind = 'home' | 'frontier' | 'core'

export interface StarSystem {
  index: number
  id: string
  name: string
  kind: SystemKind
  /** whose home it is (null: nobody's) */
  side: Side | null
  /** where it is on the galaxy map: 0..1000 across, 0..600 down */
  x: number
  y: number
  /** its sun, or two for a binary; and the light they give */
  suns: StarKind[]
  light: [number, number, number]
  /** its lanes, bodies and surfaces (indices into the galaxy's lists) */
  lanes: number[]
  bodies: number[]
  worlds: number[]
}

/** a jump lane: through a gate at each end, or the shortcut through two linked black holes */
export interface Lane {
  index: number
  a: number
  b: number
  kind: 'gate' | 'black hole'
}

export type BodyKind = 'sun' | 'planet' | 'moon' | 'giant' | 'black hole' | 'belt' | 'base' | 'gate'

/** a body's path: a circle round another body (or round the system's middle, −1) */
export interface Orbit {
  around: number
  /** px */
  radius: number
  /** seconds once round */
  period: number
  /** where it is at time 0, as a share of a turn */
  phase: number
}

export interface Body {
  index: number
  id: string
  kind: BodyKind
  system: number
  name: string
  orbit: Orbit
  /** where it is at time 0, px from the system's middle (a system is about 24,000 px across) */
  x: number
  y: number
  /** px: its radius (a belt: how wide it is) */
  size: number
  /** the surface that can be flown over, an index into the galaxy's worlds (−1: none) */
  world: number
  /** a sun's kind */
  star?: StarKind
  /** a base's part: a faction's capital, a frontier outpost, or a derelict */
  role?: 'capital' | 'outpost' | 'derelict'
  /** a gate's lane */
  lane?: number
}

/** a surface that can be flown over: one of the 40 habitable worlds, or a barren moon */
export interface Surface {
  index: number
  id: string
  name: string
  system: number
  body: number
  /** one of the 40 that can be captured (false: a barren moon) */
  habitable: boolean
  recipe: WorldRecipe
}

export interface Galaxy {
  seed: number
  version: number
  systems: StarSystem[]
  lanes: Lane[]
  bodies: Body[]
  worlds: Surface[]
}

// The shape of the map: where each system sits before the seed moves it (x, y), and what it
// is. 0 the Nomarchy's home, 11 the Anarchoi's, 5 the core, 6 the frontier system on the middle
// line (above the core, or below it when the seed turns it over).
const SHAPE: { x: number; y: number; kind: SystemKind; side: Side | null }[] = [
  { x: 60, y: 300, kind: 'home', side: 'nomarchy' },
  { x: 210, y: 165, kind: 'frontier', side: null },
  { x: 210, y: 435, kind: 'frontier', side: null },
  { x: 360, y: 105, kind: 'frontier', side: null },
  { x: 360, y: 495, kind: 'frontier', side: null },
  { x: 500, y: 300, kind: 'core', side: null },
  { x: 500, y: 60, kind: 'frontier', side: null },
  { x: 640, y: 105, kind: 'frontier', side: null },
  { x: 640, y: 495, kind: 'frontier', side: null },
  { x: 790, y: 165, kind: 'frontier', side: null },
  { x: 790, y: 435, kind: 'frontier', side: null },
  { x: 940, y: 300, kind: 'home', side: 'anarchoi' },
]
/** the lanes every galaxy has: each home through two systems, on to the core */
const LANES: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 5],
  [11, 9],
  [11, 10],
  [9, 7],
  [10, 8],
  [7, 5],
  [8, 5],
]
/** the home worlds: the Nomarchy's and the Anarchoi's (factions-and-races.md); the first is each side's capital world, nearest its sun */
const HOME_WORLDS: Record<Side, Archetype[]> = {
  nomarchy: ['archipelago', 'continental', 'mesa', 'ice'],
  anarchoi: ['canyon', 'volcanic', 'jungle', 'ocean'],
}
/** the frontier's suns, dealt out at random */
const FRONTIER_SUNS: StarKind[] = ['red', 'orange', 'orange', 'yellow', 'yellow', 'white', 'white', 'blue', 'red']

const round = (v: number) => Math.round(v)

/**
 * How a system is laid out, px (the polish pass, item 4: worlds at their true size). The numbers
 * the seed deals are those of Phase 3, multiplied out here: worlds and moons twelve times as
 * large as they were (a world 1,900 to 3,400 px across its radius, a moon 600 to 1,300), giants
 * ten times (5,200 to 8,800), suns fifteen (6,300 to 13,500), and their orbits twelve times as far
 * apart, so a system is about 260,000 px across. Ships, stations and gates keep their size: a
 * world is now enormous beside a ship. The cruise drive (sim/space.ts) runs faster the further
 * it is from anything, so crossing a system still takes seconds. A belt's band of rocks is half as wide
 * again as it was (crossing it, the drive is held back to weave through the rocks).
 */
const ORBIT = 12
/** a station's orbit, as a share of its world's radius: in the plane, over the world (it is below), as a station in orbit is */
const STATION_IN = 0.7
/** at the core, px further out its rings begin: its sun goes round the black hole in the middle */
const CORE_CLEAR = 40000
/** how far out a system's gates stand, px */
const GATE_RING = 132000

/** shuffles a list in place, with the galaxy's chance numbers */
function shuffle<T>(rnd: () => number, list: T[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const k = Math.floor(rnd() * (i + 1))
    const t = list[i]
    list[i] = list[k]
    list[k] = t
  }
  return list
}

/** the whole galaxy from a seed and a version (the same numbers always give the same galaxy) */
export function galaxy(seed: number, version: number): Galaxy {
  const rnd = mulberry32(Math.imul(seed | 0, 977) + Math.imul(version | 0, 7919) + 1)
  const taken = new Set<string>(['Meridian Ring', 'The Raft'])
  const voiceOf = (s: StarSystem): Voice => (s.side === 'nomarchy' ? 'nomarchy' : s.side === 'anarchoi' ? 'anarchoi' : 'neutral')

  // ── the systems, placed
  const flip = rnd() < 0.5 // the middle frontier system below the core instead of above it
  const systems: StarSystem[] = SHAPE.map((s, index) => {
    const y = index === 6 && flip ? 600 - s.y : s.y
    return {
      index,
      id: `s${index}`,
      name: '',
      kind: s.kind,
      side: s.side,
      x: s.kind === 'home' ? s.x : round(s.x + (rnd() - 0.5) * 36),
      y: s.kind === 'home' || s.kind === 'core' ? y : round(y + (rnd() - 0.5) * 36),
      suns: [],
      light: [1, 1, 1],
      lanes: [],
      bodies: [],
      worlds: [],
    }
  })
  for (const s of systems) s.name = uniqueName(rnd, voiceOf(s), taken)

  // ── the lanes: the fixed ones, the middle system's, and a few more by chance
  const pairs: { a: number; b: number; kind: Lane['kind'] }[] = LANES.map(([a, b]) => ({ a, b, kind: 'gate' }))
  const middle = flip ? [4, 8] : [3, 7]
  pairs.push({ a: 6, b: middle[0], kind: 'gate' }, { a: 6, b: middle[1], kind: 'gate' })
  if (rnd() < 0.6) pairs.push({ a: 1, b: 2, kind: 'gate' })
  if (rnd() < 0.6) pairs.push({ a: 9, b: 10, kind: 'gate' })
  // (across the side of the core the middle system is not on)
  if (rnd() < 0.7) pairs.push(flip ? { a: 3, b: 7, kind: 'gate' } : { a: 4, b: 8, kind: 'gate' })
  // the shortcut: two linked black holes join frontier systems far apart, across the map
  const hole = rnd() < 0.5 ? { a: 2, b: 9 } : { a: 1, b: 10 }
  pairs.push({ ...hole, kind: 'black hole' })
  const lanes: Lane[] = pairs.map((p, index) => ({ index, ...p }))
  for (const l of lanes) {
    systems[l.a].lanes.push(l.index)
    systems[l.b].lanes.push(l.index)
  }

  // ── the suns: gold for the Nomarchy's home, a red dwarf for the Anarchoi's, a blue giant at the
  // core, the frontier's dealt out, and one frontier system a binary with a red companion
  const frontier = systems.filter((s) => s.kind === 'frontier')
  const dealt = shuffle(rnd, FRONTIER_SUNS.slice())
  frontier.forEach((s, i) => (s.suns = [dealt[i]]))
  systems[0].suns = ['yellow']
  systems[11].suns = ['red']
  systems[5].suns = ['blue']
  const binary = frontier[Math.floor(rnd() * frontier.length)]
  if (binary.suns[0] === 'red') binary.suns[0] = 'yellow'
  binary.suns.push('red')
  for (const s of systems) s.light = lightOf(s.suns)

  // ── the 40 habitable worlds: four in each home, two at the core, three or four in each
  // frontier system, eight archetypes five times each, no system with two of a kind
  const count = systems.map((s) => (s.kind === 'home' ? 4 : s.kind === 'core' ? 2 : 3))
  for (const s of shuffle(rnd, frontier.slice()).slice(0, 3)) count[s.index] = 4
  const pool: Archetype[] = shuffle(
    rnd,
    HABITABLE.flatMap((a) => [a, a, a, a]),
  )
  const kinds: Archetype[][] = systems.map((s) => {
    if (!s.side) return pool.splice(0, count[s.index])
    const [capital, ...rest] = HOME_WORLDS[s.side]
    return [capital, ...shuffle(rnd, rest)]
  })
  for (let pass = 0; pass < 200; pass++) {
    // a system with two of a kind swaps one with another system's
    const s = kinds.findIndex((list, i) => !systems[i].side && new Set(list).size < list.length)
    if (s < 0) break
    const list = kinds[s]
    const at = list.findIndex((a, i) => list.indexOf(a) !== i)
    const others = kinds.map((_, i) => i).filter((i) => !systems[i].side && i !== s)
    const o = others[Math.floor(rnd() * others.length)]
    const k = Math.floor(rnd() * kinds[o].length)
    const t = list[at]
    list[at] = kinds[o][k]
    kinds[o][k] = t
  }

  // ── the bodies of each system, from the middle out
  const bodies: Body[] = []
  const worlds: Surface[] = []
  const add = (b: Omit<Body, 'index' | 'id' | 'x' | 'y'>) => {
    const index = bodies.length
    const around = b.orbit.around >= 0 ? bodies[b.orbit.around] : null
    const body: Body = {
      index,
      id: `b${index}`,
      ...b,
      x: round((around?.x ?? 0) + b.orbit.radius * cosTurn(b.orbit.phase)),
      y: round((around?.y ?? 0) + b.orbit.radius * sinTurn(b.orbit.phase)),
    }
    bodies.push(body)
    systems[b.system].bodies.push(index)
    return body
  }
  /** seconds once round a circle of radius r: longer further out */
  const periodOf = (r: number, k = 60) => round(k * (r / 1000) * Math.sqrt(r / 1000))
  const orbit = (around: number, radius: number, k?: number): Orbit => ({
    around,
    radius,
    period: periodOf(radius, k),
    phase: Math.round(rnd() * 1000) / 1000,
  })
  const surface = (s: StarSystem, body: Body, habitable: boolean, recipe: WorldRecipe) => {
    const index = worlds.length
    worlds.push({ index, id: `w${index}`, name: body.name, system: s.index, body: body.index, habitable, recipe })
    s.worlds.push(index)
    body.world = index
  }
  const recipeOf = (s: StarSystem, archetype: Archetype) => makeRecipe(rnd, (rnd() * 0x7fffffff) | 0, archetype, s.suns)

  const giants = systems.map(() => 1)
  for (const s of shuffle(rnd, frontier.slice()).slice(0, 2)) giants[s.index]++
  const belts = new Set(
    shuffle(
      rnd,
      systems.map((s) => s.index),
    ).slice(0, 8),
  )
  const derelicts = new Set(
    shuffle(
      rnd,
      systems.filter((s) => !s.side).map((s) => s.index),
    ).slice(0, 3),
  )
  for (const s of systems) {
    const voice = voiceOf(s)
    // the middle: the sun (a binary's two go round each other), or at the core a black hole with its sun round it
    let centre = -1
    if (s.kind === 'core') {
      centre = add({
        kind: 'black hole',
        system: s.index,
        name: uniqueName(rnd, 'neutral', taken),
        orbit: orbit(-1, 0),
        size: 2600,
        world: -1,
      }).index
      add({ kind: 'sun', system: s.index, name: s.name, orbit: orbit(centre, 26400), size: 13500, world: -1, star: s.suns[0] })
    } else if (s.suns.length === 2) {
      const a = orbit(-1, 8400)
      add({ kind: 'sun', system: s.index, name: `${s.name} A`, orbit: a, size: 9600, world: -1, star: s.suns[0] })
      add({
        kind: 'sun',
        system: s.index,
        name: `${s.name} B`,
        orbit: { ...a, phase: (a.phase + 0.5) % 1 },
        size: 4500,
        world: -1,
        star: s.suns[1],
      })
    } else
      add({
        kind: 'sun',
        system: s.index,
        name: s.name,
        orbit: orbit(-1, 0),
        size: s.suns[0] === 'blue' ? 13500 : s.suns[0] === 'red' ? 6300 : 9600,
        world: -1,
        star: s.suns[0],
      })

    // the planets and the giants, ring by ring
    const here = kinds[s.index]
    const nGiants = giants[s.index]
    // (sometimes the last habitable world is a moon of a giant rather than a planet of its own)
    const onGiant = !s.side && nGiants > 0 && rnd() < 0.35
    const rings: ('world' | 'giant' | 'belt')[] = here.map(() => 'world' as const)
    if (onGiant) rings.pop()
    for (let g = 0; g < nGiants; g++) rings.splice(Math.min(rings.length, 2 + Math.floor(rnd() * 3)), 0, 'giant')
    if (belts.has(s.index)) rings.splice(1 + Math.floor(rnd() * rings.length), 0, 'belt')
    // (at the core the rings begin beyond the sun that goes round the black hole there)
    let radius = (2400 + Math.floor(rnd() * 600)) * ORBIT + (s.kind === 'core' ? CORE_CLEAR : 0)
    let nth = 0
    let worldAt = 0
    const planets: Body[] = []
    const giantsHere: Body[] = []
    for (const ring of rings) {
      if (ring === 'giant') {
        giantsHere.push(
          add({
            kind: 'giant',
            system: s.index,
            name: uniqueName(rnd, voice, taken, nth),
            orbit: orbit(centre, radius),
            size: (520 + Math.floor(rnd() * 360)) * 10,
            world: -1,
          }),
        )
      } else if (ring === 'belt') {
        add({
          kind: 'belt',
          system: s.index,
          name: uniqueName(rnd, voice, taken),
          orbit: orbit(centre, radius),
          size: Math.round((600 + Math.floor(rnd() * 600)) * 1.5),
          world: -1,
        })
      } else {
        const archetype = here[worldAt++]
        const body = add({
          kind: 'planet',
          system: s.index,
          name: uniqueName(rnd, voice, taken, nth),
          orbit: orbit(centre, radius),
          size: (160 + Math.floor(rnd() * 120)) * 12,
          world: -1,
        })
        const recipe = recipeOf(s, archetype)
        // (the Nomarchy's capital world is the island world the game has always had, as it always was)
        surface(s, body, true, s.side === 'nomarchy' && worldAt === 1 ? islandRecipe(recipe) : recipe)
        planets.push(body)
      }
      nth++
      radius += (1300 + Math.floor(rnd() * 700)) * ORBIT
    }
    if (onGiant) {
      const giant = giantsHere[0]
      const body = add({
        kind: 'planet',
        system: s.index,
        name: uniqueName(rnd, voice, taken, nth),
        orbit: orbit(giant.index, giant.size + 1500 * ORBIT, 20),
        size: 1800,
        world: -1,
      })
      surface(s, body, true, recipeOf(s, here[here.length - 1]))
      planets.push(body)
    }

    // barren moons: now and then round a planet, one or two round each giant
    const moonsOf = (parent: Body, n: number) => {
      for (let m = 0; m < n; m++) {
        const radius = parent.size + (420 + m * 380 + Math.floor(rnd() * 160)) * ORBIT
        const body = add({
          kind: 'moon',
          system: s.index,
          name: uniqueName(rnd, voice, taken, m),
          orbit: orbit(parent.index, radius, 20),
          size: (50 + Math.floor(rnd() * 60)) * 12,
          world: -1,
        })
        surface(s, body, false, recipeOf(s, 'moon'))
      }
    }
    for (const p of planets) if (p.orbit.around === centre && rnd() < 0.3) moonsOf(p, 1)
    for (const g of giantsHere) moonsOf(g, 1 + (rnd() < 0.75 ? 1 : 0) - (g === giantsHere[0] && onGiant ? 1 : 0))

    // the linked black holes, far out
    if (s.index === hole.a || s.index === hole.b)
      add({
        kind: 'black hole',
        system: s.index,
        name: uniqueName(rnd, 'neutral', taken),
        orbit: orbit(centre, 9200 * ORBIT),
        size: 2000,
        world: -1,
      })
    // bases: a capital at home, an outpost on the frontier, and three derelicts
    const first = planets[0]
    if (s.kind === 'home')
      add({
        kind: 'base',
        system: s.index,
        name: s.side === 'nomarchy' ? 'Meridian Ring' : 'The Raft',
        orbit: orbit(first.index, Math.round(first.size * STATION_IN), 10),
        size: 90,
        world: -1,
        role: 'capital',
      })
    if (s.kind === 'frontier')
      add({
        kind: 'base',
        system: s.index,
        name: `${s.name} Station`,
        orbit: orbit(first.index, Math.round(first.size * STATION_IN), 10),
        size: 60,
        world: -1,
        role: 'outpost',
      })
    if (derelicts.has(s.index))
      add({
        kind: 'base',
        system: s.index,
        name: `The ${uniqueName(rnd, 'neutral', taken)} Hulk`,
        orbit: orbit(centre, (6000 + Math.floor(rnd() * 3000)) * ORBIT),
        size: 50,
        world: -1,
        role: 'derelict',
      })
    // a gate at the edge for every lane out, facing the system it leads to
    for (const li of s.lanes) {
      const l = lanes[li]
      if (l.kind !== 'gate') continue
      const to = systems[l.a === s.index ? l.b : l.a]
      const dx = to.x - s.x
      const dy = to.y - s.y
      const d = Math.sqrt(dx * dx + dy * dy) || 1
      const body = add({
        kind: 'gate',
        system: s.index,
        name: `Gate to ${to.name}`,
        orbit: { around: -1, radius: GATE_RING, period: 0, phase: 0 },
        size: 80,
        world: -1,
        lane: li,
      })
      body.x = round((dx / d) * GATE_RING)
      body.y = round((dy / d) * GATE_RING)
    }
  }
  return { seed, version, systems, lanes, bodies, worlds }
}

/** how many times slower than the other bodies a station goes round what it hangs over */
const STATION_SLOW = 30

/** where a body is at time `t` (seconds), px from its system's middle */
export function positionAt(g: Galaxy, body: Body, t: number): { x: number; y: number } {
  const o = body.orbit
  if (o.period === 0) return { x: body.x, y: body.y }
  const around = o.around >= 0 ? positionAt(g, g.bodies[o.around], t) : { x: 0, y: 0 }
  // (a station creeps round what it hangs over, however fast that goes round its sun: at the bodies' own pace a world's
  // station went round it faster than a ship flies, and could not be caught to dock at)
  const turn = o.phase + (body.kind === 'base' ? t / STATION_SLOW : t) / o.period
  return { x: around.x + o.radius * cosTurn(turn), y: around.y + o.radius * sinTurn(turn) }
}

let canonical: Galaxy | null = null
/** the galaxy everyone plays in (made once, then kept) */
export function theGalaxy(): Galaxy {
  if (!canonical) canonical = galaxy(GALAXY_SEED, GALAXY_VERSION)
  return canonical
}

/** a surface of the galaxy everyone plays in, by its id ('w12'), or null */
export function surfaceById(id: string): Surface | null {
  const m = /^w(\d+)$/.exec(id)
  return m ? (theGalaxy().worlds[Number(m[1])] ?? null) : null
}

/** the system whose space a zone's key names ('s3'), or −1 */
export function systemOfKey(key: string): number {
  const m = /^s(\d+)$/.exec(key)
  const n = m ? Number(m[1]) : -1
  return n >= 0 && n < theGalaxy().systems.length ? n : -1
}

/** the scene's settings for flying over a surface of the galaxy, or in a system's space (none for an id that is neither) */
export function worldSettings(id: string): Partial<SceneParams> {
  const s = surfaceById(id)
  if (s) return settingsOf(s.id, s.recipe)
  if (systemOfKey(id) >= 0) {
    // (space flies as the standard: no air, no weight, no clouds, always day)
    const d = DEFAULT_PARAMS
    return { world: id, timeOfDay: 'day', clouds: 0, speed: d.speed, agility: d.agility, climb: d.climb, ceiling: d.ceiling }
  }
  return {}
}

/** whose home system a surface is in (null: nobody's), and whether it is that side's capital world: whose its bases are */
export function siteOf(s: Surface): { home: Side | null; capital: boolean } {
  const sys = theGalaxy().systems[s.system]
  return { home: sys.side, capital: !!sys.side && sys.worlds[0] === s.index }
}

/** where every pilot starts until he travels: the island world, the Nomarchy's capital, where everyone has always met */
export const startWorld = () => homeWorld('nomarchy').id

/** a side's capital world: the first world of its home system */
export function homeWorld(side: Side): Surface {
  const g = theGalaxy()
  const home = g.systems.find((s) => s.side === side)!
  return g.worlds[home.worlds[0]]
}
