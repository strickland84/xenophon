// The worlds of the galaxy the scripted flights fly over, picked by kind (and weather), so a
// flight keeps to its kind of world whatever the galaxy's numbering.

import { theGalaxy, worldSettings } from '../galaxy/galaxy'
import type { WorldPicker } from './scenarios'

/** the settings for the nth world of a kind, with the weather asked for */
export const pickWorld: WorldPicker = (kind, nth = 0, weather) => {
  const list = theGalaxy().worlds.filter((w) => w.recipe.archetype === kind && (!weather || w.recipe.weather === weather))
  if (!list[nth]) throw new Error(`no world ${nth} of kind ${kind}${weather ? ' with ' + weather : ''}`)
  return worldSettings(list[nth].id)
}
