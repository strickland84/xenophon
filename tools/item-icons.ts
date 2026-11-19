// The shop's furniture icons: each piece's own picture as a room shows it (its first facing) (drawn by the image model for the rooms,
// interior/art.ts) put in a square of 24 pixels for the page, as static/ui/furn-<id>.png. Run it after the
// interiors' art changes:
//
//   npx jiti tools/item-icons.ts
import fs from 'node:fs'
import path from 'node:path'
import { PROPS as ART } from '../src/lib/engine/interior/art'
import { artOf, FURNITURE, PROPS } from '../src/lib/engine/data/interiors'
import { pixelsOf } from '../src/lib/engine/space/pictures'
import { writePNG } from './png.mjs'

const OUT = path.join(import.meta.dirname, '..', 'static', 'ui')
fs.mkdirSync(OUT, { recursive: true })
const SIZE = 24

for (const f of FURNITURE) {
  // (the piece itself, as it stands against the wall at the top of a room: the same picture the room shows, never another drawing)
  const art = ART[artOf(PROPS[f.id], PROPS[f.id].faces[0])]
  if (!art) {
    console.log(`no art for ${f.id}`)
    continue
  }
  const p = pixelsOf(art)
  // Keep room for the dark edge on all four sides, even for the widest prop.
  const side = Math.max(SIZE, p.w + 2, p.h + 2)
  const rgba = new Uint8Array(side * side * 4)
  const x0 = (side - p.w) >> 1
  const y0 = (side - p.h) >> 1
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const i = p.idx[y * p.w + x]
      if (i === 255) continue
      const c = p.colours[i]
      const o = ((y + y0) * side + x + x0) * 4
      for (const edge of [o - side * 4, o - 4, o + 4, o + side * 4]) {
        if (rgba[edge + 3] === 0) rgba.set([8, 13, 28, 255], edge)
      }
      rgba[o] = c[0]
      rgba[o + 1] = c[1]
      rgba[o + 2] = c[2]
      rgba[o + 3] = 255
    }
  writePNG(path.join(OUT, `furn-${f.id}.png`), side, side, rgba)
}
console.log(`${FURNITURE.length} furniture icons in ${path.relative(process.cwd(), OUT)}`)
