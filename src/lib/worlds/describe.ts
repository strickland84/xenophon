// A world of the galaxy in words, for the menu's list of worlds and the gallery: what kind of
// world it is, its sun, gravity, air and weather, what can hurt a ship there, and how a ship
// flies over it.

import { ARCHETYPE_NAMES, handlingOf, theGalaxy } from '../engine'
import type { StarKind, Surface } from '../engine'

export { ARCHETYPE_NAMES }

const STAR_NAMES: Record<StarKind, string> = {
  red: 'red dwarf',
  orange: 'orange star',
  yellow: 'yellow star',
  white: 'white star',
  blue: 'blue giant',
}

const WEATHER_NAMES: Record<string, string> = {
  clear: 'clear',
  rain: 'rain',
  storm: 'storms',
  fog: 'fog',
  snow: 'snow',
  dust: 'dust storms',
  ash: 'falling ash',
}

const HAZARD_NAMES: Record<string, string> = {
  lava: 'lava burns low ships',
  acid: 'acid sea burns low ships',
  lightning: 'lightning',
  whiteout: 'whiteouts',
  ash: 'low ash ceiling',
}

export interface WorldWords {
  name: string
  system: string
  kind: string
  /** short lines: its sun and time of day; gravity and air; weather and hazards; how it flies */
  sun: string
  body: string
  weather: string
  flying: string
}

const times = (v: number) => `×${v.toFixed(2)}`

export function describe(s: Surface): WorldWords {
  const g = theGalaxy()
  const r = s.recipe
  const h = handlingOf(r)
  const gravity =
    r.gravity < 0.5 ? 'low gravity' : r.gravity < 0.92 ? 'light gravity' : r.gravity > 1.15 ? 'heavy gravity' : 'standard gravity'
  const air = r.atmosphere === 0 ? 'no air' : r.atmosphere < 0.85 ? 'thin air' : r.atmosphere > 1.2 ? 'thick air' : 'standard air'
  const sun = r.sun.length === 2 ? `binary: ${STAR_NAMES[r.sun[0]]} and ${STAR_NAMES[r.sun[1]]}` : STAR_NAMES[r.sun[0]]
  const hazards = r.hazards.map((z) => HAZARD_NAMES[z])
  return {
    name: s.name,
    system: g.systems[s.system].name,
    kind: ARCHETYPE_NAMES[r.archetype],
    sun: `${sun}, ${r.timeOfDay}`,
    body: `${gravity} ${r.gravity.toFixed(2)} g, ${air}`,
    weather: [WEATHER_NAMES[r.weather], ...hazards].join(', '),
    flying: `speed ${times(h.speed)}, turn ${times(h.turn)}, climb ${times(h.climb)}, ceiling ${h.ceiling}`,
  }
}
