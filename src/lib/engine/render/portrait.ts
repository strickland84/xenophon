// Pilots' faces in the HUD (the plan's section 9: "the portrait appears in the HUD, the kill feed,
// chat, the pilot list"): the player's portrait in the HUD's corner, 16 by 16, and in the kill feed
// each pilot's head, the top rows of his race's sprite. Both are the image model's art (races/art.ts)
// in the pilot's own colours, drawn at their true size into the frame.

import { RACE_ART } from '../races/art'
import { createLookPaint, INK, paintLook } from '../races/look'
import type { LookPaint } from '../races/look'
import { lookOf } from '../races/races'
import { blend, pack } from '../util/color'

/** looks met so far, as colours (a pilot's look rarely changes: each is worked out once) */
const paints = new Map<string, { look: ReturnType<typeof lookOf>; paint: LookPaint }>()
function paintOf(text: string) {
  let p = paints.get(text)
  if (!p) {
    const look = lookOf(text)
    const paint = createLookPaint()
    paintLook(paint, look, 'day')
    p = { look, paint }
    if (paints.size > 64) paints.clear()
    paints.set(text, p)
  }
  return p
}

const FRAME = pack(10, 14, 28)

/** a pilot's 16 by 16 portrait with its top-left at (x, y), on a backing of `back`, with a thin frame */
export function drawFace(fb: Uint32Array, W: number, H: number, x: number, y: number, text: string, back: number, k = 256) {
  const { look, paint } = paintOf(text)
  const art = RACE_ART[look.race]
  if (!art) return
  const rows = art.faces.small[look.face] ?? art.faces.small[0]
  for (let r = -1; r <= 16; r++)
    for (let c = -1; c <= 16; c++) {
      const xx = x + c
      const yy = y + r
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const edge = r < 0 || c < 0 || r === 16 || c === 16
      const i = edge ? -1 : INK[rows.charCodeAt(r * 16 + c)]
      const col = edge ? FRAME : i >= 0 ? paint.face[i] : back
      const at = yy * W + xx
      fb[at] = k >= 256 ? col : blend(fb[at], col, k)
    }
}

/** how many rows of a race's sprite make its head, for the kill feed */
const HEAD = 7

/** a pilot's head (the top of his race's sprite, facing out) with its top-left at (x, y); returns how wide it is */
export function drawHead(fb: Uint32Array, W: number, H: number, x: number, y: number, text: string, k = 256) {
  const { look, paint } = paintOf(text)
  const art = RACE_ART[look.race]
  if (!art) return 0
  const side = art.sides[0]
  const rows = side.steps[0]
  for (let r = 0; r < Math.min(HEAD, side.h); r++)
    for (let c = 0; c < side.w; c++) {
      const i = INK[rows.charCodeAt(r * side.w + c)]
      if (i < 0) continue
      const xx = x + c
      const yy = y + r
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const at = yy * W + xx
      fb[at] = k >= 256 ? paint.sprite[i] : blend(fb[at], paint.sprite[i], k)
    }
  return side.w
}
