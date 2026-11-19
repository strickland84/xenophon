// What each UTC day brings (the plan's sections 5 and 14): a few worlds where the ore is far
// richer (hotspots), three tasks with rewards, and a pilot's rank. All of it is worked out from the
// galaxy's seed and the day's number, so every player has the same hotspots and the same tasks
// with no server. Hotspots are on the frontier and at the core, never in a home system: they pull
// scattered players to the same contested places, which is what makes fights happen.

import { BOUNTY, HOTSPOT, RANK_POINTS } from '../data/territory'
import { hash2 } from '../util/exact'
import { GALAXY_SEED, surfaceById, theGalaxy } from './galaxy'
import type { Side } from './galaxy'

/** the day number of a moment given in seconds since 1970 (UTC) */
export const dayOfSeconds = (utc: number) => Math.floor(utc / 86_400)

/** a number 0..255 for a day and a salt, the same everywhere */
const roll = (day: number, salt: number) => hash2(day, GALAXY_SEED + salt * 7919, 11)

/** the worlds that can be hotspots: habitable, outside the home systems */
function candidates() {
  const g = theGalaxy()
  return g.worlds.filter((w) => w.habitable && !g.systems[w.system].side).map((w) => w.id)
}

/** the day's hotspots: HOTSPOT.count worlds, never two in one system */
export function hotspotsOn(day: number): string[] {
  const g = theGalaxy()
  const pool = candidates()
  const out: string[] = []
  const systems = new Set<number>()
  for (let i = 0; out.length < HOTSPOT.count && i < 64; i++) {
    const pick = pool[(roll(day, i) * 257 + roll(day, i + 101)) % pool.length]
    const s = surfaceById(pick)!.system
    if (out.includes(pick) || systems.has(s)) continue
    out.push(pick)
    systems.add(s)
  }
  return out.sort((a, b) => g.worlds.findIndex((w) => w.id === a) - g.worlds.findIndex((w) => w.id === b))
}

/** true if `world` is a hotspot on a day */
export const isHotspot = (world: string, day: number) => hotspotsOn(day).includes(world)

export type TaskKind = 'hotspot' | 'pilot' | 'raiders' | 'flag' | 'beacon' | 'bank' | 'land'

export interface DailyTask {
  /** the day and its place in the list ('20409-1') */
  id: string
  kind: TaskKind
  /** how many to do (units, kills, flags …) and the credits it pays */
  target: number
  reward: number
  /** a world it names (land on it), if any */
  world: string
  /** what to do, in words */
  text: string
}

/** the day's three tasks: one at a hotspot, one of fighting, one of territory or travel */
export function dailyTasks(day: number): DailyTask[] {
  const g = theGalaxy()
  const fight: Omit<DailyTask, 'id'>[] = [
    { kind: 'pilot', target: 1, reward: 200, world: '', text: 'Down a rival pilot' },
    { kind: 'raiders', target: 4 + (roll(day, 3) % 5), reward: 0, world: '', text: '' },
  ]
  fight[1].reward = 25 * fight[1].target
  fight[1].text = `Down ${fight[1].target} raiders`
  const spots = hotspotsOn(day)
  const visit = spots[roll(day, 5) % spots.length]
  const ground: Omit<DailyTask, 'id'>[] = [
    { kind: 'flag', target: 1, reward: 150, world: '', text: 'Plant a flag at a capture site' },
    { kind: 'beacon', target: 1, reward: 60, world: '', text: 'Plant a beacon' },
    { kind: 'bank', target: 60, reward: 120, world: '', text: 'Bank 60 units' },
    { kind: 'land', target: 1, reward: 150, world: visit, text: `Land on ${g.worlds.find((w) => w.id === visit)?.name ?? visit}` },
  ]
  const mine = 20 + 5 * (roll(day, 7) % 5)
  const list: Omit<DailyTask, 'id'>[] = [
    { kind: 'hotspot', target: mine, reward: 6 * mine, world: '', text: `Mine ${mine} units at a hotspot` },
    fight[roll(day, 13) % fight.length],
    ground[roll(day, 17) % ground.length],
  ]
  return list.map((t, i) => ({ ...t, id: `${day}-${i}` }))
}

/** the titles of the six ranks of each side (factions-and-races.md): badges and titles only, never power */
export const RANK_TITLES: Record<Side, string[]> = {
  nomarchy: ['Ephebe', 'Lochagos', 'Taxiarch', 'Trierarch', 'Navarch', 'Strategos'],
  anarchoi: ['Stray', 'Runner', 'Raider', 'Skipper', 'Reaver', 'Stormcaller'],
}

/** a pilot's rank (0..5) from the influence he has added to his side */
export function rankOf(points: number) {
  let r = 0
  for (let i = 0; i < RANK_POINTS.length; i++) if (points >= RANK_POINTS[i]) r = i
  return r
}

/** a pilot's price for his streak of kills (0: none yet) */
export const bountyOf = (streak: number) => (streak >= BOUNTY.from ? streak * BOUNTY.perKill : 0)
