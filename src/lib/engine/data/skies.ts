// The numbers of a world's skies (the plan's section 5, "Skies"): how high its heap clouds float, how tall they stand,
// and which thin sheets lie above them, by its kind, its air and its weather. James's first play: the clouds sat far too
// low (40 px, under a ship's cruising height of 64), and every sky was the same one layer. Heights are px above the sea;
// a ship cruises at about 64 and climbs to its world's ceiling (1,100 to 1,800, 260 to 330 under ash).

import type { Archetype, Weather } from '../galaxy/recipe'

/** the kinds of thin sheet: streaks of ice high up (cirrus), rows of small cloudlets (a mackerel sky), a grey veil (overcast) */
export type SheetKind = 'cirrus' | 'mackerel' | 'veil'

/** the heap clouds (cumulus) of each kind of world: the height of their flat undersides, and px a step of their thickness */
export interface DeckDials {
  base: [number, number]
  step: number
}

/** a kind of world's chances of each thin sheet over its heap clouds (0..1), on a world with clear weather */
export interface SheetChances {
  cirrus: number
  mackerel: number
  veil: number
}

export const DECKS: Record<Archetype, DeckDials> = {
  archipelago: { base: [190, 230], step: 3 },
  continental: { base: [210, 260], step: 3 },
  canyon: { base: [290, 360], step: 3 },
  ice: { base: [230, 290], step: 3 },
  volcanic: { base: [170, 210], step: 4 },
  jungle: { base: [160, 200], step: 4 },
  mesa: { base: [280, 340], step: 3 },
  ocean: { base: [180, 220], step: 3 },
  moon: { base: [0, 0], step: 0 },
}

export const SHEET_CHANCES: Record<Archetype, SheetChances> = {
  archipelago: { cirrus: 0.6, mackerel: 0.3, veil: 0 },
  continental: { cirrus: 0.5, mackerel: 0.45, veil: 0.15 },
  canyon: { cirrus: 0.85, mackerel: 0.2, veil: 0 },
  ice: { cirrus: 0.7, mackerel: 0.2, veil: 0.35 },
  volcanic: { cirrus: 0, mackerel: 0, veil: 0 },
  jungle: { cirrus: 0.3, mackerel: 0.35, veil: 0.2 },
  mesa: { cirrus: 0.8, mackerel: 0.35, veil: 0 },
  ocean: { cirrus: 0.55, mackerel: 0.4, veil: 0.1 },
  moon: { cirrus: 0, mackerel: 0, veil: 0 },
}

/** how the weather changes a sky: the heap clouds' height (a share) and step, and what it adds or takes away */
export interface WeatherSky {
  /** the undersides lower (rain, a storm) */
  base: number
  /** px a step of thickness (a storm's clouds tower) */
  step: number
  /** a veil over everything: how much of the sky it covers (0 none) */
  veil: number
  /** the thin sheets above are hidden (fog, ash: nothing is seen through it) */
  noSheets: boolean
  /** 0..1: how far the heap clouds are darkened towards a storm's grey (rain, a storm, ash) */
  gloom: number
}
export const WEATHER_SKY: Record<Weather, WeatherSky> = {
  clear: { base: 1, step: 0, veil: 0, noSheets: false, gloom: 0 },
  rain: { base: 0.82, step: 4, veil: 0.55, noSheets: false, gloom: 0.3 },
  storm: { base: 0.72, step: 4, veil: 0.7, noSheets: false, gloom: 0.55 },
  fog: { base: 0.9, step: 0, veil: 0, noSheets: true, gloom: 0 },
  snow: { base: 0.9, step: 0, veil: 0.45, noSheets: false, gloom: 0.1 },
  dust: { base: 1.1, step: 0, veil: 0, noSheets: false, gloom: 0 },
  ash: { base: 1, step: 4, veil: 0.75, noSheets: true, gloom: 0.6 },
}

/** world px a pixel of each sheet's pattern covers (render/skyart.ts: a cloudlet of a mackerel sky 16 to 32 px across) */
export const SHEET_SCALE: Record<SheetKind, number> = { cirrus: 2, mackerel: 2, veil: 3 }

/** each sheet: px above the heap clouds' undersides it floats (a range), how much of the sky it covers, its wind (px a second) */
export const SHEETS: Record<SheetKind, { over: [number, number]; cover: [number, number]; wind: number }> = {
  mackerel: { over: [260, 380], cover: [0.35, 0.6], wind: 9 },
  cirrus: { over: [520, 760], cover: [0.3, 0.55], wind: 16 },
  veil: { over: [150, 220], cover: [0.45, 0.7], wind: 5 },
}

/** the island world of the settings (no recipe): heap clouds as an archipelago's, and a few streaks of cirrus */
export const ISLAND_SKY = { base: 210, step: 3, cirrus: 0.42 }

/** the heap clouds' wind (px a second; it was 7 and 3, across and down the map) */
export const DECK_WIND = { x: 7, y: 3 }

/**
 * Overhead, a cloud above the ship is drawn as a veil over the picture, sliding faster than the ground the higher above
 * it is (parallax), every other pixel of it at most so the ship and the fight show through: the slide (a share more than
 * the ground, a px above), and how near (px) the ship must come to the undersides for the veil to thicken.
 */
/** the grey a storm's heap clouds darken towards (by day: graded for the time of day and lit by the world's sun) */
export const GLOOM = [74, 80, 98]

export const VEIL = { parallax: 1 / 260, near: 60 }

/** px: past this, every heap cloud has gone into the haze of the distance (from behind and from the seat), and where that begins */
export const SKY_FAR = 5200
export const SKY_HAZE = 900
/** … and a thin sheet: gone at SHEET_FAR px and as many again for each px it is above or below the camera, the haze beginning at a third of that */
export const SHEET_FAR = { px: 2400, per: 4 }
/** … and seen at a slant (px up or down to the sheet for each px into the view): it thins out under `full` and is gone
 * under `none`, so a sheet near the camera's height never lies across the view as a hard line, like land in the sky */
export const SHEET_SLANT = { none: 0.035, full: 0.16 }
