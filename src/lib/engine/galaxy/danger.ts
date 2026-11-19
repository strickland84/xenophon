// How dangerous each system and world is, and who lives there (the polish pass, item 8): worked out
// from the galaxy's shape and who holds which world, so every player's game, and the maps, agree.
//
//   reach      how many gate lanes a system is from the nearest system where a side holds a world
//              (its home always counts). The black hole shortcut is a fast, dangerous way across, not
//              a side's road, so it does not count.
//   wildness   how strong a system's raiders are: none at a home, 1 on the frontier next to a side's
//              space, 2 deeper out, 3 at the core
//   patrols    a side's patrols fly in its own space (a system it holds a world in, or next to one)
//              and on the front line: the systems about as far from one side as from the other,
//              where both sides' patrols meet
//   danger     what a pilot of a side meets there, 0..3: 0 his own home; raiders as wild as the
//              system; at least 2 where the other side's patrols fly; 3 the core and the other
//              side's home. A hotspot draws pirates: one more, to 3.

import { theGalaxy } from './galaxy'
import type { Side } from './galaxy'
import { isHotspot } from './daily'

const SIDES: Side[] = ['nomarchy', 'anarchoi']

/** what lives in a system or on a world, for a pilot of a side */
export interface Danger {
  /** 0..3: Safe, Low, Medium, High (data/bands.ts DANGER_NAMES) */
  level: number
  /** how strong its raiders are (0: none) */
  raiders: number
  /** whose patrols fly there */
  patrols: Side[]
  /** both sides' patrols fly there: the front line */
  contested: boolean
  /** a side's home system (null: nobody's) */
  home: Side | null
  /** a hotspot today: pirates by its rich ore */
  hotspot: boolean
}

/** lane distances: for each side, each system's distance from the nearest system it holds a world in */
export function reachOf(holders: Record<string, string>): Record<Side, number[]> {
  const g = theGalaxy()
  const near = g.systems.map(() => [] as number[])
  for (const l of g.lanes) {
    if (l.kind !== 'gate') continue
    near[l.a].push(l.b)
    near[l.b].push(l.a)
  }
  const out = {} as Record<Side, number[]>
  for (const side of SIDES) {
    const d = g.systems.map(() => 99)
    const queue: number[] = []
    for (const s of g.systems) {
      const holds = s.side === side || s.worlds.some((w) => g.worlds[w].habitable && holders[g.worlds[w].id] === side)
      if (holds) {
        d[s.index] = 0
        queue.push(s.index)
      }
    }
    for (let i = 0; i < queue.length; i++) {
      const s = queue[i]
      for (const n of near[s])
        if (d[n] > d[s] + 1) {
          d[n] = d[s] + 1
          queue.push(n)
        }
    }
    out[side] = d
  }
  return out
}

/** a side's home system's holders when the page has said nothing: only the home worlds are held */
const NOBODY: Record<string, string> = {}

/** how strong a system's raiders are: 0 a home, 1 the frontier next to a side's space, 2 deeper out, 3 the core */
export function wildness(system: number, reach = reachOf(NOBODY)) {
  const s = theGalaxy().systems[system]
  if (!s || s.side) return 0
  if (s.kind === 'core') return 3
  return Math.min(reach.nomarchy[system], reach.anarchoi[system]) <= 1 ? 1 : 2
}

/** the sides whose patrols fly in a system: each in its own space, and both on the front line */
export function patrolsIn(system: number, reach = reachOf(NOBODY)): Side[] {
  const s = theGalaxy().systems[system]
  if (!s) return []
  if (s.side) return [s.side]
  const c = reach.nomarchy[system]
  const d = reach.anarchoi[system]
  const front = Math.abs(c - d) <= 1 && c < 99 && d < 99
  return SIDES.filter((side) => front || (side === 'nomarchy' ? c : d) <= 1)
}

/** what a pilot of `side` meets in a system (`holders`: each world's holder, as the events say; `hot`: a hotspot is in it) */
export function systemDanger(system: number, side: Side | '', holders: Record<string, string> = NOBODY, hot = false): Danger {
  const s = theGalaxy().systems[system]
  const reach = reachOf(holders)
  const raiders = wildness(system, reach)
  const patrols = patrolsIn(system, reach)
  const contested = patrols.length === 2
  const enemy = !!side && patrols.some((p) => p !== side)
  let level = raiders
  if (s?.side && s.side !== side) level = 3
  if (enemy) level = Math.max(level, 2)
  if (hot && raiders) level = Math.min(3, level + 1)
  return { level, raiders: hot && raiders ? Math.min(3, raiders + 1) : raiders, patrols, contested, home: s?.side ?? null, hotspot: hot }
}

/** what a pilot of `side` meets on a world (a habitable one or a barren moon), on UTC day `day` (−1: no hotspots known) */
export function worldDanger(world: string, side: Side | '', holders: Record<string, string> = NOBODY, day = -1): Danger {
  const w = theGalaxy().worlds.find((x) => x.id === world)
  if (!w) return { level: 0, raiders: 0, patrols: [], contested: false, home: null, hotspot: false }
  const hot = day >= 0 && isHotspot(world, day)
  const d = systemDanger(w.system, side, holders, hot)
  // (a barren moon off the beaten way: a band holds it, a little stronger than its system's)
  if (!w.habitable && d.raiders)
    return { ...d, raiders: Math.min(3, d.raiders + 1), level: Math.max(d.level, Math.min(3, d.raiders + 1)), patrols: [] }
  return d
}

/** the danger of every system for a side, at once (for the galaxy map; a hotspot's pirates are its world's, not the system's) */
export function galaxyDanger(side: Side | '', holders: Record<string, string> = NOBODY): Danger[] {
  return theGalaxy().systems.map((s) => systemDanger(s.index, side, holders))
}

/** where raiders wait in a system's space: by the gates out to wilder space (every gate, deeper out), in its belts, at a derelict (its drones), at a black hole shortcut's way in */
export interface SpaceBand {
  kind: 'gate' | 'belt' | 'derelict' | 'hole'
  /** the body it keeps to (a galaxy body's index) */
  body: number
  /** how strong it is (a system's wildness; the shortcut's way in at least 2) */
  wild: number
}

/** the raider bands of a system's space (none in a home system) */
export function spaceBands(system: number, holders: Record<string, string> = NOBODY): SpaceBand[] {
  const g = theGalaxy()
  const sys = g.systems[system]
  if (!sys) return []
  const reach = reachOf(holders)
  const wild = wildness(system, reach)
  if (wild <= 0) return []
  const out: SpaceBand[] = []
  for (const i of sys.bodies) {
    const body = g.bodies[i]
    if (body.kind === 'gate' && body.lane !== undefined) {
      const lane = g.lanes[body.lane]
      const other = lane.a === system ? lane.b : lane.a
      if (wild >= 2 || wildness(other, reach) > wild) out.push({ kind: 'gate', body: i, wild })
    } else if (body.kind === 'belt') out.push({ kind: 'belt', body: i, wild })
    else if (body.kind === 'base' && body.role === 'derelict') out.push({ kind: 'derelict', body: i, wild })
    else if (body.kind === 'black hole' && g.lanes.some((l) => l.kind === 'black hole' && (l.a === system || l.b === system)))
      out.push({ kind: 'hole', body: i, wild: Math.max(2, wild) })
  }
  return out
}
