// A world's sky: how high its heap clouds float and how tall they stand, and the thin sheets over them (cirrus, a
// mackerel sky, a veil), each at its own height, cover and wind. It follows from the world's recipe alone (its kind, its
// air, its weather, its seed), so every game draws the same sky over the same world; numbers in data/skies.ts. The heap
// clouds' shapes are the world's own cloud map (world.clouds); the sheets' are shared patterns (render/skyart.ts).

import { DECKS, ISLAND_SKY, SHEET_CHANCES, SHEETS, WEATHER_SKY } from '../data/skies'
import type { SheetKind } from '../data/skies'
import type { WorldRecipe } from '../galaxy/recipe'
import { mulberry32 } from '../util/math'
import { CK } from './world'

export interface Sheet {
  kind: SheetKind
  /** px above the sea */
  z: number
  /** 0..1: how much of the sky it covers */
  cover: number
  /** the way its pattern lies and drifts (radians, across the map), and px a second it drifts */
  angle: number
  wind: number
}

export interface Sky {
  /** the heap clouds' undersides, px above the sea, and px a step of their thickness (their map holds up to CK steps) */
  base: number
  step: number
  /** the sheets over them, lowest first */
  sheets: Sheet[]
  /** 0..1: how dark the heap clouds are with the weather (a storm's grey) */
  gloom: number
}

/** the tallest a heap cloud stands: its top, px above the sea */
export const deckTop = (sky: Sky) => sky.base + sky.step * CK

const made = new WeakMap<WorldRecipe, Map<number, Sky>>()
let island: Sky | null = null

/** the sky over a world (null: the island world of the settings), under a ceiling (px) */
export function skyOf(planet: WorldRecipe | null, ceiling: number): Sky {
  if (!planet) return (island ??= islandSky())
  let byCeiling = made.get(planet)
  if (!byCeiling) made.set(planet, (byCeiling = new Map()))
  let sky = byCeiling.get(ceiling)
  if (!sky) byCeiling.set(ceiling, (sky = makeSky(planet, ceiling)))
  return sky
}

function islandSky(): Sky {
  return {
    base: ISLAND_SKY.base,
    step: ISLAND_SKY.step,
    sheets: [{ kind: 'cirrus', z: ISLAND_SKY.base + 640, cover: ISLAND_SKY.cirrus, angle: 0.35, wind: SHEETS.cirrus.wind }],
    gloom: 0,
  }
}

function makeSky(r: WorldRecipe, ceiling: number): Sky {
  // (its own chance numbers, apart from the terrain's: a sky can change without a world's ground changing)
  const rnd = mulberry32((r.seed ^ 0x5b1e) * 2654435761)
  const deck = DECKS[r.archetype]
  const w = WEATHER_SKY[r.weather]
  const span = (a: number, b: number) => Math.round(a + (b - a) * rnd())
  // (thicker air holds its clouds a little lower, thin air higher)
  const air = 1.15 - 0.15 * Math.min(1.5, Math.max(0.5, r.atmosphere))
  let base = Math.round(span(deck.base[0], deck.base[1]) * w.base * air)
  const step = Math.max(deck.step, w.step)
  // (under ash, everything stays under the ceiling, where a ship can see it)
  if (r.weather === 'ash') base = Math.min(base, ceiling - 40 - step * CK)
  // one wind for the sky, a little veered with height
  const wind = rnd() * Math.PI * 2
  const sheets: Sheet[] = []
  const add = (kind: SheetKind, chance: number) => {
    const roll = rnd()
    const s = SHEETS[kind]
    const over = span(s.over[0], s.over[1])
    const cover = s.cover[0] + (s.cover[1] - s.cover[0]) * rnd()
    const veer = (rnd() - 0.5) * 0.6
    if (roll >= chance) return
    let z = base + step * CK + over
    if (kind === 'veil') z = Math.min(z, ceiling - 24)
    sheets.push({ kind, z, cover: kind === 'veil' && w.veil > 0 ? w.veil : cover, angle: wind + veer, wind: s.wind })
  }
  const c = SHEET_CHANCES[r.archetype]
  if (r.archetype !== 'moon' && r.atmosphere > 0) {
    // (a sheet is drawn for each kind, by chance, every world rolling for each in the same order)
    add('veil', w.veil > 0 ? 1 : c.veil)
    add('mackerel', w.noSheets ? 0 : c.mackerel)
    add('cirrus', w.noSheets ? 0 : c.cirrus)
  }
  sheets.sort((a, b) => a.z - b.z)
  return { base, step, sheets, gloom: w.gloom }
}
