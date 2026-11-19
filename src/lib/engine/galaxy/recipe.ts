// A world's recipe (the plan's section 5): everything about a planet's surface that follows
// from its seed, and that changes how it plays as well as how it looks. The terrain is built
// from it (world/surface.ts); the flying from it is a handful of the scene's own settings.

import { DEFAULT_PARAMS } from '../params'
import type { SceneParams, TimeOfDay } from '../params'
import { clamp } from '../util/math'

/** the kinds of world: the eight the 40 habitable worlds are made of, and the barren moons */
export type Archetype = 'archipelago' | 'continental' | 'canyon' | 'ice' | 'volcanic' | 'jungle' | 'mesa' | 'ocean' | 'moon'
export const HABITABLE: readonly Archetype[] = ['archipelago', 'continental', 'canyon', 'ice', 'volcanic', 'jungle', 'mesa', 'ocean']

/** each archetype's name, as a player reads it */
export const ARCHETYPE_NAMES: Record<Archetype, string> = {
  archipelago: 'Archipelago',
  continental: 'Continental',
  canyon: 'Canyon',
  ice: 'Ice',
  volcanic: 'Volcanic',
  jungle: 'Jungle',
  mesa: 'Mesa',
  ocean: 'Ocean',
  moon: 'Barren moon',
}

/** what the weather does: clear, rain, a storm with lightning, fog, snow to a whiteout, a dust storm, falling ash */
export type Weather = 'clear' | 'rain' | 'storm' | 'fog' | 'snow' | 'dust' | 'ash'
/** what can hurt a ship: lava or an acid sea flown low over, lightning, a whiteout, a low ceiling of ash */
export type Hazard = 'lava' | 'acid' | 'lightning' | 'whiteout' | 'ash'
/** the ores of the plan's section 11 that are found on surfaces */
export type Ore = 'ferrite' | 'silica' | 'cryo-ice' | 'magma glass' | 'bioresin'
/** a star's kind: it sets the light on every world round it */
export type StarKind = 'red' | 'orange' | 'yellow' | 'white' | 'blue'

export interface WorldRecipe {
  /** the seed the terrain grows from */
  seed: number
  archetype: Archetype
  /** which of its archetype's palettes, 0..2 */
  palette: number
  /** 0..1: the share of it that is solid ground */
  land: number
  /** 0..1: how tall and steep the ground is */
  relief: number
  /** 1 is standard: heavier is slower to climb and to turn */
  gravity: number
  /** the air's density, 1 standard, 0 none: thinner is faster, wider in its turns and lower in its ceiling */
  atmosphere: number
  /** 0..1: how much of the sky has cloud (ash, on a volcanic world) */
  clouds: number
  weather: Weather
  /** its sun (two for a binary), and the light they give as a tint, 1 = white */
  sun: StarKind[]
  light: [number, number, number]
  /** the time of day it is always flown in */
  timeOfDay: TimeOfDay
  hazards: Hazard[]
  /** which ores are found, and how rich, 0..1 (data only, until mining) */
  resources: { ore: Ore; richness: number }[]
}

/** each star kind's light, as a tint on everything it falls on */
export const STAR_LIGHT: Record<StarKind, [number, number, number]> = {
  red: [1.02, 0.82, 0.72],
  orange: [1.03, 0.9, 0.78],
  yellow: [1, 1, 1],
  white: [0.95, 0.99, 1.06],
  blue: [0.84, 0.93, 1.14],
}

/** the light of one or two suns together */
export function lightOf(sun: StarKind[]): [number, number, number] {
  const r2 = (v: number) => Math.round(v * 100) / 100
  const t = [0, 0, 0]
  for (const s of sun) for (let i = 0; i < 3; i++) t[i] += STAR_LIGHT[s][i] / sun.length
  return [r2(t[0]), r2(t[1]), r2(t[2])]
}

type Rnd = () => number
/** a number between a and b, to two places */
const between = (rnd: Rnd, a: number, b: number) => Math.round((a + (b - a) * rnd()) * 100) / 100
const pick = <T>(rnd: Rnd, list: readonly T[]) => list[Math.floor(rnd() * list.length)]

/** each archetype's dials, as ranges a world's seed picks from */
interface Dials {
  land: [number, number]
  relief: [number, number]
  gravity: [number, number]
  atmosphere: [number, number]
  clouds: [number, number]
  weather: readonly Weather[]
  ores: readonly Ore[]
}
const DIALS: Record<Archetype, Dials> = {
  archipelago: {
    land: [0.26, 0.42],
    relief: [0.5, 0.8],
    gravity: [0.9, 1.1],
    atmosphere: [0.9, 1.1],
    clouds: [0.3, 0.6],
    weather: ['clear', 'clear', 'rain', 'fog'],
    ores: ['ferrite', 'silica'],
  },
  continental: {
    land: [0.5, 0.66],
    relief: [0.7, 1],
    gravity: [0.95, 1.3],
    atmosphere: [0.9, 1.2],
    clouds: [0.35, 0.6],
    weather: ['clear', 'rain', 'storm', 'fog'],
    ores: ['ferrite', 'silica'],
  },
  canyon: {
    land: [0.96, 0.98],
    relief: [0.75, 1],
    gravity: [0.75, 1],
    atmosphere: [0.55, 0.8],
    clouds: [0.05, 0.2],
    weather: ['clear', 'clear', 'dust'],
    ores: ['silica', 'ferrite'],
  },
  ice: {
    land: [0.45, 0.62],
    relief: [0.6, 0.95],
    gravity: [0.8, 1.1],
    atmosphere: [0.75, 1.05],
    clouds: [0.2, 0.42],
    weather: ['clear', 'snow', 'snow', 'fog'],
    ores: ['cryo-ice', 'ferrite'],
  },
  volcanic: {
    land: [0.68, 0.82],
    relief: [0.6, 0.95],
    gravity: [1.15, 1.5],
    atmosphere: [1.3, 1.6],
    clouds: [0.35, 0.6],
    weather: ['ash', 'ash', 'storm'],
    ores: ['magma glass', 'ferrite'],
  },
  jungle: {
    land: [0.66, 0.8],
    relief: [0.55, 0.9],
    gravity: [1, 1.3],
    atmosphere: [1.2, 1.5],
    clouds: [0.45, 0.75],
    weather: ['fog', 'rain', 'storm', 'clear'],
    ores: ['bioresin', 'ferrite'],
  },
  mesa: {
    land: [0.95, 0.98],
    relief: [0.75, 1],
    gravity: [0.8, 1],
    atmosphere: [0.6, 0.85],
    clouds: [0.08, 0.25],
    weather: ['clear', 'clear', 'dust'],
    ores: ['silica', 'ferrite'],
  },
  ocean: {
    land: [0.03, 0.06],
    relief: [0.3, 0.5],
    gravity: [0.9, 1.15],
    atmosphere: [1, 1.3],
    clouds: [0.45, 0.75],
    weather: ['clear', 'rain', 'storm', 'storm'],
    ores: ['ferrite'],
  },
  moon: {
    land: [1, 1],
    relief: [0.4, 0.9],
    gravity: [0.16, 0.35],
    atmosphere: [0, 0],
    clouds: [0, 0],
    weather: ['clear'],
    ores: ['silica', 'ferrite'],
  },
}

/** the recipe for a world of `archetype` round `sun`, from its own chance numbers */
export function makeRecipe(rnd: Rnd, seed: number, archetype: Archetype, sun: StarKind[]): WorldRecipe {
  const d = DIALS[archetype]
  const weather = pick(rnd, d.weather)
  const tod = rnd()
  // (a moon is never flown at night: with no air to scatter it, there would be nothing to see)
  const timeOfDay: TimeOfDay = tod < 0.66 || (archetype === 'moon' && tod >= 0.88) ? 'day' : tod < 0.88 ? 'sunset' : 'night'
  const hazards: Hazard[] = []
  if (archetype === 'volcanic') hazards.push('lava')
  if (archetype === 'jungle' && rnd() < 0.4) hazards.push('acid')
  if (weather === 'storm') hazards.push('lightning')
  if (weather === 'snow') hazards.push('whiteout')
  if (weather === 'ash') hazards.push('ash')
  const resources = d.ores.map((ore, i) => ({ ore, richness: between(rnd, i === 0 ? 0.4 : 0.15, archetype === 'moon' ? 1 : 0.8) }))
  return {
    seed,
    archetype,
    palette: Math.floor(rnd() * 3),
    land: between(rnd, ...d.land),
    relief: between(rnd, ...d.relief),
    gravity: between(rnd, ...d.gravity),
    atmosphere: between(rnd, ...d.atmosphere),
    clouds: between(rnd, ...d.clouds),
    weather,
    sun,
    light: lightOf(sun),
    timeOfDay,
    hazards,
    resources,
  }
}

/**
 * The island world the game has always had (seed 7, a third land), with everything else
 * standard as well: its own colours, plain gravity and air, clear by day. Flying it is
 * flying the game as it was before there were other worlds.
 */
export function islandRecipe(r: WorldRecipe): WorldRecipe {
  return {
    ...r,
    seed: 7,
    land: 0.33,
    palette: 0,
    relief: 0.6,
    gravity: 1,
    atmosphere: 1,
    clouds: 0.45,
    weather: 'clear',
    timeOfDay: 'day',
    hazards: [],
  }
}

/** how a world flies, from its gravity and its air: shares of the standard settings, and its ceiling in px */
export interface Handling {
  /** top speed, turn rate and climb rate, as shares of the standard */
  speed: number
  turn: number
  climb: number
  /** the highest a ship can climb, px */
  ceiling: number
}

export function handlingOf(r: WorldRecipe): Handling {
  const g = r.gravity
  const a = r.atmosphere
  const r2 = (v: number) => Math.round(v * 100) / 100
  // gravity: heavier climbs slower and turns wider
  const climb = 2 / (1 + g)
  const turnG = 1 + 0.3 * (1 - g)
  // air: thinner is faster, but grips less in a turn, and gives out lower down; none at all (a
  // moon) has nothing to slow a ship, and space begins not far up
  const speed = a === 0 ? 1.2 : 1 + (1 - a) * 0.25
  const turnA = a === 0 ? 1 : 1 + (a - 1) * 0.22
  let ceiling = a === 0 ? 900 : Math.round(1500 * clamp(0.6 + 0.4 * a, 0.75, 1.2))
  // a volcanic world's ash hangs low: above it there is no seeing and no breathing for an engine
  if (r.hazards.includes('ash')) ceiling = 260 + Math.round((r.seed & 255) / 4)
  return { speed: r2(speed), turn: r2(turnG * turnA), climb: r2(climb), ceiling }
}

/** the scene's settings for flying a world: its light and cloud, and its handling as the settings the flying already has */
export function settingsOf(id: string, r: WorldRecipe): Partial<SceneParams> {
  const h = handlingOf(r)
  return {
    world: id,
    timeOfDay: r.timeOfDay,
    clouds: r.clouds,
    speed: Math.round(DEFAULT_PARAMS.speed * h.speed),
    agility: r2(DEFAULT_PARAMS.agility * h.turn),
    climb: h.climb,
    ceiling: h.ceiling,
  }
}
const r2 = (v: number) => Math.round(v * 100) / 100
