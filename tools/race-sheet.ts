// Draws the six races to a PNG to look at: for each, its portrait (with its side's patch), its
// in-world sprite from eight sides and a step of its walk, and the way it comes down, on the
// ground of its side's worlds. The Nomarchy's three on the left, the Anarchoi's on the right. Run it by
// hand:
//
//   npx jiti tools/race-sheet.ts docs/art/gen/races.png
import { createLookPaint, INK, lookOf, paintLook, RACE_ART, RACES } from '../src/lib/engine/index.ts'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'races.png'
const SCALE = 4
const W = 2 * 196 + 12
const H = 3 * 46 + 22
const px = new Uint8Array(W * H * 4)
const set = (x: number, y: number, c: number[]) => {
  if (x >= 0 && y >= 0 && x < W && y < H) px.set([c[0], c[1], c[2], 255], (y * W + x) * 4)
}
const unpack = (c: number) => [c & 255, (c >> 8) & 255, (c >> 16) & 255]
const hex = (c: string) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]

// the night behind it all, and each side's ground: green islands for the Nomarchy, red canyon for the Anarchoi
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) set(x, y, [11, 16, 35])
const SIDES = {
  nomarchy: { colour: '#f2c14e', dark: '#131a33', ground: [92, 156, 58], mark: ['..#..', '..#..', '.###.', '.###.', '#####'] },
  anarchoi: { colour: '#a46cf0', dark: '#4a2116', ground: [176, 98, 58], mark: ['..#..', '.###.', '#####', '.###.', '..#..'] },
}
// each race in a look of its own, to show what a pilot can make of it
const LOOKS: Record<string, string> = {
  solari: 'solari.1.0.0.3a4a6a.f2c14e',
  kestrin: 'kestrin.0.0.0.e8e4dc.f0580e',
  orrin: 'orrin.0.0.0.2f5a3a.f2c14e',
  skarn: 'skarn.1.0.0.6a3030.5af0ff',
  noctil: 'noctil.0.0.0.4a3a6a.ff5a8a',
  thallin: 'thallin.0.0.0.2a6a7a.ffd23a',
}
const SIDE_OF = [4, 3, 2, 1, 0, 1, 2, 3]
const MIRROR = [false, false, false, false, false, true, true, true]

RACES.forEach((race) => {
  const side = SIDES[race.side]
  const col = race.side === 'nomarchy' ? 0 : 1
  const row = RACES.filter((r) => r.side === race.side).indexOf(race)
  const x0 = 4 + col * 200
  const y0 = 18 + row * 46
  const look = lookOf(LOOKS[race.id])
  const art = RACE_ART[race.id]
  const paint = createLookPaint()
  paintLook(paint, look, 'day')
  // the portrait, on its side's dark, with the patch on its collar
  const face = art.faces.faces[look.face]
  for (let i = 0; i < 32 * 32; i++) {
    const k = INK[face.charCodeAt(i)]
    set(x0 + (i % 32), y0 + Math.floor(i / 32), k >= 0 ? unpack(paint.face[k]) : hex(side.dark))
  }
  for (let y = 0; y < 5; y++)
    for (let x = 0; x < 5; x++)
      if (side.mark[y][x] === '#') {
        set(x0 + 6 + x, y0 + 26 + y, [16, 14, 24])
        set(x0 + 5 + x, y0 + 25 + y, hex(side.colour))
      }
  // the ground, and the sprite from eight sides, then two steps of its walk, then coming down
  const gx = x0 + 35
  for (let y = y0; y < y0 + 32; y++) for (let x = gx; x < x0 + 196; x++) set(x, y, side.ground.map((v, i) => v - ((x * 3 + y * 7 + i) % 9)))
  const sprite = (rows: string, w: number, h: number, x: number, y: number, mirror = false) => {
    for (let i = 0; i < w * h; i++) {
      const c = i % w
      const k = INK[rows.charCodeAt(Math.floor(i / w) * w + (mirror ? w - 1 - c : c))]
      if (k >= 0) set(x + c, y + Math.floor(i / w), unpack(paint.sprite[k]))
    }
  }
  let x = gx + 2
  for (const way of [4, 5, 6, 7, 0, 1, 2, 3]) {
    const s = art.sides[SIDE_OF[way]]
    sprite(s.steps[0], s.w, s.h, x, y0 + 15 - s.h, MIRROR[way])
    x += 12
  }
  const s = art.sides[2]
  sprite(s.steps[1], s.w, s.h, gx + 2, y0 + 31 - s.h)
  sprite(s.steps[3], s.w, s.h, gx + 14, y0 + 31 - s.h)
  sprite(art.fall.rows, art.fall.w, art.fall.h, x0 + 196 - art.fall.w - 2, y0 + 31 - art.fall.h)
})
// the sides' bands along the top
for (const [i, side] of [SIDES.nomarchy, SIDES.anarchoi].entries()) for (let x = 4 + i * 200; x < 200 + i * 200; x++) set(x, 10, hex(side.colour))
writePNG(out, W * SCALE, H * SCALE, upscale(W, H, px, SCALE))
console.log(`${out}: the six races`)
