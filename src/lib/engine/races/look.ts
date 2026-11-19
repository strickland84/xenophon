// A pilot's look as colours: the race's art (art.ts) recoloured by his choices (races.ts). The
// suit and its trim take his two colours; the body (skin, feathers, brass, shell, fuzz or cap)
// and the glow (eyes, a lens, lanterns) are moved to the skin and eyes he chose; everything
// else keeps the colour the image model gave it. Each colour keeps how light it is against the
// rest of its part, so the shading the model drew stays (as a ship's paint does: render/paint.ts).
//
// Pictures are strings of letters, one a pixel (art.ts); `inkOf` turns a letter into its
// colour's index.

import type { TimeOfDay } from '../params'
import { grade } from '../render/palettes'
import { lum, pack, parseColor } from '../util/color'
import { RACE_ART } from './art'
import { raceOf } from './races'
import type { PilotLook } from './races'

export const OWN = 0
export const SUIT = 1
export const TRIM = 2
export const LINE = 3
export const BODY = 4
export const GLOW = 5

const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
/** a picture's letter → its colour's index (−1: nothing there) */
export const INK = new Int8Array(128).fill(-1)
for (let i = 0; i < LETTERS.length; i++) INK[LETTERS.charCodeAt(i)] = i

/** the colours of a part moved to `to`, each keeping how light it is against the part's middle tone */
function recolour(list: number[][], part: number, to: number[], out: number[][]) {
  const mine = list.filter((c) => c[3] === part)
  if (!mine.length) return
  const tones = mine.map((c) => lum(c)).sort((a, b) => a - b)
  const key = Math.max(1, tones[tones.length >> 1])
  list.forEach((c, i) => {
    if (c[3] !== part) return
    const l = lum(c)
    if (l <= key) {
      const f = l / key
      out[i] = [to[0] * f, to[1] * f, to[2] * f]
    } else {
      const f = (l - key) / Math.max(1, 255 - key)
      out[i] = [to[0] + (255 - to[0]) * f, to[1] + (255 - to[1]) * f, to[2] + (255 - to[2]) * f]
    }
  })
}

/** a list of [r, g, b, part] recoloured for a look and the time of day, packed as the frame keeps colours */
function paintList(list: number[][], look: PilotLook, tod: TimeOfDay, out: Uint32Array) {
  const race = raceOf(look.race)
  const rgb = list.map((c) => [c[0], c[1], c[2]])
  recolour(list, SUIT, parseColor(look.suit, [84, 89, 105]), rgb)
  recolour(list, TRIM, parseColor(look.trim, [240, 88, 14]), rgb)
  if (race.skins[look.skin]) recolour(list, BODY, parseColor(race.skins[look.skin], [128, 128, 128]), rgb)
  if (race.eyes[look.eyes]) recolour(list, GLOW, parseColor(race.eyes[look.eyes], [128, 128, 128]), rgb)
  // (the light of the time of day, as on the ships; glowing things keep theirs)
  const amount = tod === 'sunset' ? 0.5 : tod === 'night' ? 0.2 : 0
  rgb.forEach((c, i) => {
    const g = list[i][3] === GLOW || list[i][3] === LINE ? c : grade(c, tod, amount)
    out[i] = pack(g[0], g[1], g[2])
  })
}

/** a pilot's colours: his sprite's (and fall's), and his portrait's */
export interface LookPaint {
  sprite: Uint32Array
  face: Uint32Array
}

export function createLookPaint(): LookPaint {
  return { sprite: new Uint32Array(64), face: new Uint32Array(64) }
}

/** works out a pilot's colours for his look and the time of day */
export function paintLook(paint: LookPaint, look: PilotLook, tod: TimeOfDay) {
  const art = RACE_ART[look.race]
  if (!art) return
  paintList(art.colours, look, tod, paint.sprite)
  paintList(art.faces.colours, look, 'day', paint.face)
}
