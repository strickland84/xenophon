// The player's ship as his settings make it: its hull fitted out (the weapons on its mounts, its
// modules, its pattern, emblem and side's mark: jet/fit.ts), its paint, and what the fit does
// (data/loadout.ts). Another pilot's ship is made the same way from what his game says of it: a
// make, as one line of text.

import { statsOf } from '../data/hulls'
import { fitEffect, MODULE_SLOTS, readFit, weaponsOn } from '../data/loadout'
import type { FitEffect, WeaponId } from '../data/loadout'
import { fittedMesh } from '../jet/fit'
import type { ShipMake } from '../jet/fit'
import type { JetMesh } from '../jet/mesh'
import type { SceneParams } from '../params'
import type { ShipColours } from '../render/paint'

/** the colour of each side's mark on a wing */
export const MARK_COLOURS = ['', '#f2c14e', '#a46cf0']

/** the mark a pilot of a side carries, if he wants it (0 none, 1 the Nomarchy's triangle, 2 the Anarchoi's diamond) */
const markOf = (p: SceneParams) => (!p.factionMark ? 0 : p.side === 'nomarchy' ? 1 : p.side === 'anarchoi' ? 2 : 0)

/** how the player's ship is made, from the settings */
export function makeOf(p: SceneParams): ShipMake {
  const fit = readFit(p.weapons, p.parts)
  return {
    hull: p.hull,
    weapons: weaponsOn(fit, statsOf(p.hull).mounts),
    modules: fit.modules.slice(0, MODULE_SLOTS[p.hull] ?? 2),
    pattern: p.pattern,
    emblem: p.emblem,
    mark: markOf(p),
  }
}

/** the player's ship's mesh, as his settings make it */
export const meshFor = (p: SceneParams): JetMesh => fittedMesh(makeOf(p))

/** what the player's fit does */
export function fitFor(p: SceneParams): FitEffect {
  return fitEffect(readFit(p.weapons, p.parts), statsOf(p.hull).mounts, MODULE_SLOTS[p.hull] ?? 2)
}

/** the player's ship's colours, from the settings */
export function coloursOf(p: SceneParams): ShipColours {
  return {
    body: p.bodyColor,
    accent: p.accentColor,
    canopy: p.canopyColor,
    trim: p.trimColor,
    glow: p.glowColor,
    trail: p.trailColor,
    mark: MARK_COLOURS[markOf(p)],
  }
}

/** a make as one line of text, for other games: weapons by mount, modules, pattern, emblem, mark ('flak,cannon|cargo-pod|stripes|skull|1') */
export const makeText = (m: ShipMake) => `${m.weapons.join(',')}|${m.modules.join(',')}|${m.pattern}|${m.emblem}|${m.mark}`

/** a make from its text, on a hull (anything it does not understand is left plain) */
export function readMake(hull: string, text: string): ShipMake {
  const [w = '', mods = '', pattern = '', emblem = '', mark = '0'] = (text || '').split('|')
  const fit = readFit(w, mods)
  return {
    hull,
    weapons: weaponsOn(fit, statsOf(hull).mounts) as WeaponId[],
    modules: fit.modules.slice(0, MODULE_SLOTS[hull] ?? 2),
    pattern: /^[a-z]{0,12}$/.test(pattern) ? pattern : '',
    emblem: /^[a-z]{0,12}$/.test(emblem) ? emblem : '',
    mark: mark === '1' ? 1 : mark === '2' ? 2 : 0,
  }
}
