// A pilot's look as pixels, for the page's screens (the creator, the menu's pilot list): his
// portrait, layered (the race's face of his choice, its skin and eyes, his suit's colours on the
// collar, and his side's patch on it), and his in-world sprite from any of eight sides at any step
// of its walk. The same art and colours the game draws (engine races/), shown by the page at a
// whole number of screen pixels a pixel.

import { createLookPaint, INK, lookOf, paintLook, RACE_ART } from '../engine'
import type { PilotLook } from '../engine'
import { FACTIONS } from '../save/pilot'
import type { FactionId } from '../save/pilot'

/** the faction marks, five pixels square: a triangle (the Nomarchy), a diamond (the Anarchoi) */
const MARK: Record<FactionId, string[]> = {
  nomarchy: ['..#..', '..#..', '.###.', '.###.', '#####'],
  anarchoi: ['..#..', '.###.', '#####', '.###.', '..#..'],
}

const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]

/** packed 0xAABBGGRR → [r, g, b] */
const unpack = (c: number) => [c & 255, (c >> 8) & 255, (c >> 16) & 255]

/** a portrait, `size` 32 or 16, with nothing behind the face (whatever it is shown on shows through), and the side's patch on the collar (32 only) */
export function portraitImage(look: PilotLook | string, faction: FactionId, size: 32 | 16 = 32): ImageData {
  const l = typeof look === 'string' ? lookOf(look, faction) : look
  const art = RACE_ART[l.race]
  const paint = createLookPaint()
  paintLook(paint, l, 'day')
  const img = new ImageData(size, size)
  const rows = (size === 32 ? art.faces.faces : art.faces.small)[l.face] ?? ''
  for (let i = 0; i < size * size; i++) {
    const k = INK[rows.charCodeAt(i)] ?? -1
    if (k < 0) continue
    const [r, g, b] = unpack(paint.face[k])
    img.data.set([r, g, b, 255], i * 4)
  }
  if (size === 32) {
    // the patch: his side's mark on the left of the collar, with a dark edge
    const col = hex(FACTIONS[faction].colour)
    const mark = MARK[faction]
    for (let y = 0; y < 5; y++)
      for (let x = 0; x < 5; x++) {
        if (mark[y][x] !== '#') continue
        img.data.set([16, 14, 24, 255], ((26 + y) * 32 + 6 + x) * 4)
        img.data.set([...col, 255], ((25 + y) * 32 + 5 + x) * 4)
      }
  }
  return img
}

/** the art's five sides by the eight ways a pilot can face (n, ne, e, se, s, sw, w, nw), and whether turned round */
const SIDE_OF = [4, 3, 2, 1, 0, 1, 2, 3]
const MIRROR = [false, false, false, false, false, true, true, true]

/** the in-world sprite facing way `way` (0 away … 4 towards the viewer …), at step `step` of its walk, centred on a `w` by `h` image, feet on its bottom */
export function spriteImage(look: PilotLook | string, way: number, step: number, w = 16, h = 16): ImageData {
  const l = typeof look === 'string' ? lookOf(look) : look
  const art = RACE_ART[l.race]
  const paint = createLookPaint()
  paintLook(paint, l, 'day')
  const side = art.sides[SIDE_OF[((way % 8) + 8) % 8]]
  const mirror = MIRROR[((way % 8) + 8) % 8]
  const rows = side.steps[((step % 4) + 4) % 4]
  const img = new ImageData(w, h)
  const x0 = (w - side.w) >> 1
  const y0 = h - side.h
  for (let r = 0; r < side.h; r++)
    for (let c = 0; c < side.w; c++) {
      const k = INK[rows.charCodeAt(r * side.w + (mirror ? side.w - 1 - c : c))]
      if (k < 0) continue
      const x = x0 + c
      const y = y0 + r
      if (x < 0 || y < 0 || x >= w || y >= h) continue
      img.data.set([...unpack(paint.sprite[k]), 255], (y * w + x) * 4)
    }
  return img
}
