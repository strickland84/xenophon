// Draws a sheet of ships fitted and painted as pilots can make them, as the game draws them, to look
// at and to judge the parts by (docs/art/gen/loadouts.png is one):
//
//   npx jiti tools/loadout-sheet.ts [out.png] [hull] [scale]
//
// The hull bare, then fitted three ways (guns and modules, a hauler's fit, missiles and mines), each
// flying over the sea of the island world, overhead, a little turned; and a row from behind.

import { createScene, DEFAULT_PARAMS, STEP } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'docs/art/gen/loadouts.png'
const hulls = (process.argv[3] ?? 'corsair').split(',')
const scale = Number(process.argv[4] ?? 3)
const W = 64
const H = 64
// (the frame drawn is larger; the piece round the ship is kept)
const FW = 240
const FH = 240

const FITS: Record<string, unknown>[] = [
  {},
  {
    weapons: 'flak,flak',
    parts: 'scanner,shield-booster',
    pattern: 'stripes',
    emblem: 'skull',
    factionMark: true,
    side: 'nomarchy',
    bodyColor: '#2a2e3a',
    accentColor: '#e8c22c',
    trimColor: '#c8ccd4',
    glowColor: '#ff7a2a',
  },
  {
    weapons: 'laser,cannon',
    parts: 'cargo-pod,tractor',
    pattern: 'checks',
    emblem: 'star',
    bodyColor: '#d8d0bc',
    accentColor: '#2a46c0',
    trimColor: '#4b6a34',
    canopyColor: '#ffd23a',
  },
  {
    weapons: 'rack,mines',
    parts: 'armour,afterburner',
    pattern: 'teeth',
    emblem: 'wolf',
    factionMark: true,
    side: 'anarchoi',
    bodyColor: '#40304f',
    accentColor: '#ff5a8a',
    trimColor: '#a3141c',
    glowColor: '#a46cf0',
    trailColor: '#ff5a8a',
  },
]

const frames: Uint8ClampedArray[] = []
for (const hull of hulls) {
  for (const fit of FITS) {
    const view = 'top'
    const scene = createScene({ ...DEFAULT_PARAMS, hull, intro: false, skirmish: false, hud: false, view, transition: 0.01, cameraFollow: 1, ...fit } as never)
    scene.resize(FW, FH)
    for (let i = 0; i < 240; i++) {
      scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
      scene.step(STEP)
    }
    const full = scene.render().slice()
    // where the ship is: the pixels that change when it is painted otherwise
    const params = { ...DEFAULT_PARAMS, hull, intro: false, skirmish: false, hud: false, view, transition: 0.01, cameraFollow: 1, ...fit }
    scene.setParams({ ...params, bodyColor: '#ff00ff', accentColor: '#00ff00', canopyColor: '#ffff00', trimColor: '#00ffff' } as never)
    const other = scene.render()
    let sx = 0
    let sy = 0
    let n = 0
    for (let i = 0; i < FW * FH; i++)
      if (other[i * 4] !== full[i * 4] || other[i * 4 + 1] !== full[i * 4 + 1]) {
        sx += i % FW
        sy += Math.floor(i / FW)
        n++
      }
    const x0 = Math.max(0, Math.min(FW - W, Math.round(sx / n) - (W >> 1)))
    const y0 = Math.max(0, Math.min(FH - H, Math.round(sy / n) - (H >> 1)))
    const crop = new Uint8ClampedArray(W * H * 4)
    for (let y = 0; y < H; y++) crop.set(full.subarray(((y0 + y) * FW + x0) * 4, ((y0 + y) * FW + x0 + W) * 4), y * W * 4)
    frames.push(crop)
  }
}

const cols = FITS.length
const rows = Math.ceil(frames.length / cols)
const gap = 2
const SW = W * cols + gap * (cols - 1)
const SH = H * rows + gap * (rows - 1)
const sheet = new Uint8Array(SW * SH * 4)
for (let i = 0; i < sheet.length; i += 4) sheet[i + 3] = 255
frames.forEach((f, i) => {
  const ox = (i % cols) * (W + gap)
  const oy = Math.floor(i / cols) * (H + gap)
  for (let y = 0; y < H; y++) sheet.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * SW + ox) * 4)
})
const big = upscale(SW, SH, sheet, scale)
writePNG(out, SW * scale, SH * scale, big)
console.log(out, SW * scale, 'x', SH * scale)
