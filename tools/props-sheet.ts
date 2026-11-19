// Every piece of the places inside in every facing it has, each standing on its footprint on a visible grid of tiles,
// as the game draws them (interior/art.ts, made by tools/gen/interiors.py and tools/voxel/interiors.py under the tiling
// rule: docs/pixel-art-techniques.md "Interiors: one projection"), three times life size, with the floors and the walls'
// faces along the bottom. To judge the set by, and to see at a glance that every piece sits square on its tiles:
//
//   npx jiti tools/props-sheet.ts [docs/art/gen/tiles.png]

import { artOf, blockOf, PROPS, TILE } from '../src/lib/engine/data/interiors'
import type { Face } from '../src/lib/engine/data/interiors'
import { FLOORS, PROPS as ART, WALLS } from '../src/lib/engine/interior/art'
import { drawText, textWidth } from '../src/lib/engine/render/font'
import { pixelsOf } from '../src/lib/engine/space/pictures'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'docs/art/gen/tiles.png'
const cells: { id: string; face: Face }[] = []
for (const [id, k] of Object.entries(PROPS)) if (!k.wall && id !== 'bay') for (const face of k.faces) cells.push({ id, face })
// each cell: room for a 4×3 footprint and its rise, and a line for its name
const CW = 6 * TILE
const CH = 6 * TILE
const cols = 12
const rows = Math.ceil(cells.length / cols)
const SW = cols * CW
const SH = rows * CH + 7 * TILE
const fb = new Uint32Array(SW * SH)
const floor = pixelsOf(FLOORS['floor-ship'])
const pack = (r: number, g: number, b: number) => (255 << 24) | (b << 16) | (g << 8) | r
const GRID = pack(70, 66, 96)
const FOOT = pack(250, 210, 70)
for (let y = 0; y < SH; y++)
  for (let x = 0; x < SW; x++) {
    const c = floor.px[(y % floor.h) * floor.w + (x % floor.w)]
    fb[y * SW + x] = x % TILE === 0 || y % TILE === 0 ? GRID : c
  }
const put = (p: ReturnType<typeof pixelsOf>, x0: number, y0: number) => {
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const c = p.px[y * p.w + x]
      if (c && x0 + x >= 0 && y0 + y >= 0 && x0 + x < SW && y0 + y < SH) fb[(y0 + y) * SW + x0 + x] = c
    }
}
cells.forEach(({ id, face }, i) => {
  const k = PROPS[id]
  const [bw, bd] = blockOf(k, face)
  const cx = (i % cols) * CW
  const cy = Math.floor(i / cols) * CH
  // its footprint's tiles outlined, its picture standing on them (its foot on the footprint's front edge)
  const fx = cx + Math.floor((CW / TILE - bw) / 2) * TILE
  const fy = cy + CH - 2 * TILE - bd * TILE
  for (let x = fx; x <= fx + bw * TILE; x++) {
    fb[fy * SW + x] = FOOT
    fb[(fy + bd * TILE) * SW + x] = FOOT
  }
  for (let y = fy; y <= fy + bd * TILE; y++) {
    fb[y * SW + fx] = FOOT
    fb[y * SW + fx + bw * TILE] = FOOT
  }
  const art = ART[artOf(k, face)]
  if (art) {
    const p = pixelsOf(art)
    put(p, fx, fy + bd * TILE - p.h)
  }
  const label = `${id} ${face}`.toUpperCase()
  drawText(fb, SW, SH, cx + Math.max(1, (CW - textWidth(label)) >> 1), cy + CH - TILE - 2, label, pack(236, 228, 210), pack(10, 14, 28))
})
// the floors and the walls' faces along the bottom
let x = 2
for (const f of Object.keys(FLOORS)) {
  put(pixelsOf(FLOORS[f]), x, rows * CH + 4)
  x += 36
}
x = 2
for (const w of Object.keys(WALLS)) {
  put(pixelsOf(WALLS[w]), x, rows * CH + 42)
  x += 68
}
const rgba = new Uint8Array(SW * SH * 4)
for (let i = 0; i < SW * SH; i++) {
  rgba[i * 4] = fb[i] & 255
  rgba[i * 4 + 1] = (fb[i] >> 8) & 255
  rgba[i * 4 + 2] = (fb[i] >> 16) & 255
  rgba[i * 4 + 3] = 255
}
writePNG(out, SW * 3, SH * 3, upscale(SW, SH, rgba, 3))
console.log(out, `${cells.length} pieces and facings`)
