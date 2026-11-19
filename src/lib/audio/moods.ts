// What music plays where (the plan's section 17): a mood for each kind of place, chosen from what the
// page knows (which screen, the maps open, the zone, how harsh the world is, on foot, night, the cruise drive,
// a black hole, and how hot a fight is: enemies near, a fight, a fight going badly), and each mood's
// piece, how quickly it comes in and goes, and how long a rest of silence follows it before the next
// take, so that an hour of play is not an hour of music. A fight (an enemy near, one in the sights, a
// missile coming) brings its own music in quickly, holds the music a little lower under the guns, and
// lets it go a while after the last sign of one.
//
// Nothing here touches the page: the tests run it in Node.

import type { WorldRecipe } from '../engine/galaxy/recipe'
import type { PieceName } from './catalogue'

export type Place =
  'title' | 'calm' | 'night' | 'harsh' | 'foot' | 'space' | 'cruise' | 'hole' | 'alert' | 'combat' | 'peril' | 'hangar' | 'map'

export interface Mood {
  piece: PieceName
  /** seconds it takes to come in, and to go */
  fadeIn: number
  fadeOut: number
  /** seconds of silence after a take ends before the next (at least, at most) */
  rest: [number, number]
  /** how far the music is held down while it plays (0..1: 0.3 about −3 dB), under the effects */
  hold: number
}

export const MOODS: Record<Place, Mood> = {
  title: { piece: 'title', fadeIn: 3, fadeOut: 3, rest: [0, 0], hold: 0 },
  calm: { piece: 'calm', fadeIn: 5, fadeOut: 5, rest: [25, 60], hold: 0 },
  night: { piece: 'night', fadeIn: 6, fadeOut: 6, rest: [25, 60], hold: 0 },
  harsh: { piece: 'harsh', fadeIn: 5, fadeOut: 5, rest: [25, 60], hold: 0 },
  foot: { piece: 'foot', fadeIn: 4, fadeOut: 4, rest: [20, 50], hold: 0 },
  space: { piece: 'space', fadeIn: 6, fadeOut: 6, rest: [20, 50], hold: 0 },
  cruise: { piece: 'cruise', fadeIn: 2, fadeOut: 4, rest: [0, 0], hold: 0 },
  hole: { piece: 'hole', fadeIn: 4, fadeOut: 5, rest: [0, 0], hold: 0 },
  alert: { piece: 'alert', fadeIn: 2, fadeOut: 4, rest: [0, 0], hold: 0.2 },
  combat: { piece: 'combat', fadeIn: 1.2, fadeOut: 4, rest: [0, 0], hold: 0.3 },
  peril: { piece: 'peril', fadeIn: 0.8, fadeOut: 4, rest: [0, 0], hold: 0.3 },
  hangar: { piece: 'hangar', fadeIn: 3, fadeOut: 3, rest: [10, 25], hold: 0 },
  map: { piece: 'map', fadeIn: 2.5, fadeOut: 2.5, rest: [0, 0], hold: 0 },
}

export const PLACES = Object.keys(MOODS) as Place[]

/** the fight's three levels, quietest first: the page goes from one to another as a fight heats up or cools, at the same point in the music */
export const FIGHT_PLACES: Place[] = ['alert', 'combat', 'peril']

/** stings: a few seconds played once over whatever is playing, which is held down under them */
export type Sting = 'win' | 'lost' | 'arrive' | 'taken'
export const STINGS: Record<Sting, PieceName> = { win: 'win', lost: 'lost', arrive: 'arrive', taken: 'taken' }
/** how far the music under a sting is held down (0..1), and seconds before the same sting may play again */
export const STING_DUCK = 0.75
export const STING_AGAIN = 20

/** what the page knows of where the player is */
export interface Where {
  /** the first screens (title, callsign, side), or the sky */
  screen: 'title' | 'sky'
  /** the maps are open */
  map: boolean
  zone: 'surface' | 'space' | 'interior'
  /** the world under him is a harsh one (isHarsh) */
  harsh: boolean
  /** how hot a fight is (a FightWatch says): 0 none, 1 enemies near, 2 a fight, 3 a fight going badly */
  fight: number
  /** out of his ship on a world, walking */
  foot?: boolean
  /** night where he is on a world */
  night?: boolean
  /** in space: the cruise drive is on; a black hole pulls at him, or he is threading its ring */
  cruise?: boolean
  hole?: boolean
}

/** the place whose music should play */
export function placeFor(w: Where): Place {
  if (w.screen === 'title') return 'title'
  // (a fight wins over the maps: a pilot who looks at the map with raiders on him is still in a fight)
  if (w.fight > 0 && w.zone !== 'interior') return FIGHT_PLACES[Math.min(w.fight, 3) - 1]
  if (w.map) return 'map'
  if (w.zone === 'interior') return 'hangar'
  if (w.zone === 'space') return w.hole ? 'hole' : w.cruise ? 'cruise' : 'space'
  if (w.harsh) return 'harsh'
  if (w.foot) return 'foot'
  return w.night ? 'night' : 'calm'
}

/** what the page sees of a fight: enemies within FIGHT_NEAR, and within FIGHT_CLOSE; one in the sights; seconds until a missile
 * reaches him (99 none); his hull and shield left (0..1); a band after him */
export interface FightSigns {
  near: number
  close: number
  target: boolean
  incoming: number
  hull: number
  ambushed: boolean
}

/** how hot a fight is now (0 none … 3 going badly), from what the page sees */
export function fightLevel(s: FightSigns): number {
  const engaged = s.target || s.close > 0 || s.incoming < 6
  if (s.incoming < 3 || s.near >= 4 || (engaged && s.hull < 0.35)) return 3
  if (engaged) return 2
  if (s.near > 0 || s.ambushed) return 1
  return 0
}

/** seconds a level of a fight lasts after its last sign (a fight going badly settles soonest) */
export const SETTLE = 8
export const SETTLE_PERIL = 5

/** keeps each level of a fight going a while after its last sign */
export function createFightWatch() {
  const last = [-Infinity, -Infinity, -Infinity, -Infinity]
  return {
    /** `level`: how hot the fight is now (fightLevel), now (seconds); returns the level the music should be at */
    look(level: number, now: number) {
      for (let l = 1; l <= level && l <= 3; l++) last[l] = now
      for (let l = 3; l >= 1; l--) if (now - last[l] < (l === 3 ? SETTLE_PERIL : SETTLE)) return l
      return 0
    },
  }
}

/** px: an enemy this near is a fight coming, and this near a fight */
export const FIGHT_NEAR = 520
export const FIGHT_CLOSE = 260

/** a world whose music is the harsh one: anything that burns, strikes or blinds, a bitter or airless kind of world, foul weather */
export function isHarsh(recipe: WorldRecipe | null | undefined): boolean {
  if (!recipe) return false
  if (recipe.hazards.length > 0) return true
  if (recipe.archetype === 'volcanic' || recipe.archetype === 'ice' || recipe.archetype === 'moon') return true
  return recipe.weather === 'storm' || recipe.weather === 'dust' || recipe.weather === 'ash'
}
