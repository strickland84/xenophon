// How a world looks, apart from its shape: the colours of its materials, its sky, its clouds
// and its sea. Each archetype makes its own (world/archetypes/); the island world has the
// standard one, which is exactly what it always had. render/palettes.ts turns a look into the
// colours of a frame, for the time of day and the light of the world's sun.

import { MAT_SIDE, MAT_TOP } from './materials'

/** what fills the low ground (materials 0..3): water, lava, sea ice, an acid swamp, or nothing */
export type SeaKind = 'water' | 'lava' | 'ice' | 'acid' | 'none'

export type RGB = number[]

export interface WorldLook {
  /** each material's colour on its top and on its sides; 0..3 are the sea's (deep, mid, shallow, surf) */
  top: RGB[]
  side: RGB[]
  /** per material, 0..1: how much of its own light it keeps at sunset and at night (lava glows) */
  glow: number[]
  /** per material: its sides are drawn in bands by height, as the strata of a cliff (colours in `strata`) */
  banded: boolean[]
  /** the bands' colours by height, 0 up to the tallest ground */
  strata: RGB[]
  sea: SeaKind
  /** how fast the glitter on the sea moves: 1 for water, slower for lava, 0 for ice */
  flow: number
  /** the glitter on the sea (two colours) and the foam on its shore, by day (null: the standard) */
  spark: [RGB, RGB] | null
  foam: RGB | null
  /** the sky by day from the horizon up (three colours), and the haze below the horizon (null: the standard) */
  sky: [RGB, RGB, RGB] | null
  haze: RGB | null
  /** the clouds' colour, as a tint on the standard white */
  cloud: RGB
  /** stars in the sky by day as well (no air to hide them) */
  starsByDay: boolean
}

/** the standard look: the island world's, as it always was */
export const STANDARD_LOOK: WorldLook = {
  top: MAT_TOP,
  side: MAT_SIDE,
  glow: MAT_TOP.map(() => 0),
  banded: MAT_TOP.map(() => false),
  strata: [],
  sea: 'water',
  flow: 1,
  spark: null,
  foam: null,
  sky: null,
  haze: null,
  cloud: [1, 1, 1],
  starsByDay: false,
}

/** a look from a table of materials, top and side colours (each [r, g, b, r, g, b]), with the rest standard unless given */
export function lookOf(table: number[][], rest: Partial<WorldLook> = {}): WorldLook {
  const top = table.map((c) => c.slice(0, 3))
  const side = table.map((c) => (c.length >= 6 ? c.slice(3, 6) : c.slice(0, 3)))
  return {
    ...STANDARD_LOOK,
    top,
    side,
    glow: table.map(() => 0),
    banded: table.map(() => false),
    ...rest,
  }
}

/** a colour between two, `k` of the way from a to b */
export const mixRGB = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
