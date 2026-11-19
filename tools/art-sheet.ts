// Draws the generated art to PNG files, to look at outside the browser. Run it by hand:
//
//   npx jiti tools/art-sheet.ts <output folder>
import { blit, bytesOf, createCanvas, outline, pack } from '../src/lib/art/canvas.ts'
import fs from 'node:fs'
import { ENGINE, GLASS, HULL, HULLS, paintPlan, paintView, PART, solidOf, viewOf } from '../src/lib/art/hulls.ts'
import { writePNG } from './png.mjs'

const out = process.argv[2] ?? '.'

/** every hull's plan side by side, to the same scale, with a pilot-sized mark for scale */
function planSheet(scale: number) {
  const SPACE = pack(14, 16, 30)
  const colours = {
    [HULL]: [pack(70, 80, 112), pack(128, 140, 170), pack(214, 220, 232)],
    [PART]: [pack(30, 32, 48), pack(62, 66, 88), pack(120, 126, 150)],
    [GLASS]: [pack(12, 74, 98), pack(26, 130, 152), pack(108, 208, 214)],
  }
  colours[ENGINE] = colours[PART]
  const drawn = HULLS.map((plan) => paintPlan(plan, colours))
  const gap = 10
  const width = drawn.reduce((sum, d) => sum + d.w + gap, gap)
  const height = Math.max(...drawn.map((d) => d.h)) + 30
  const sheet = createCanvas(width, height, SPACE)
  let x = gap
  for (const d of drawn) {
    outline(d, pack(4, 5, 12))
    blit(sheet, d, x, 8)
    // a pilot is about this tall
    for (let y = 0; y < 10; y++) for (let dx = 0; dx < 4; dx++) sheet.px[(d.h + 14 + y) * sheet.w + x + ((d.w - 4) >> 1) + dx] = pack(240, 200, 90)
    x += d.w + gap
  }
  const big = createCanvas(sheet.w * scale, sheet.h * scale)
  blit(big, sheet, 0, 0, scale)
  writePNG(`${out}/hull-plans.png`, big.w, big.h, new Uint8Array(bytesOf(big).buffer))
}
planSheet(3)

/**
 * Each hull's plan as a large grey picture on black, for the image model to follow: lighter
 * is nearer, so the hull stands out of the background and the glass out of the hull.
 */
function controlPictures() {
  const greys = {
    [HULL]: [pack(120, 120, 120), pack(150, 150, 150), pack(180, 180, 180)],
    [PART]: [pack(70, 70, 70), pack(96, 96, 96), pack(120, 120, 120)],
    [GLASS]: [pack(210, 210, 210), pack(235, 235, 235), pack(255, 255, 255)],
  }
  // (a nozzle is a part seen from above, as it always was)
  greys[ENGINE] = greys[PART]
  for (const plan of HULLS) {
    const d = paintPlan(plan, greys)
    const scale = Math.floor(800 / d.h)
    const big = createCanvas(1024, 1024, pack(0, 0, 0))
    blit(big, d, (1024 - d.w * scale) >> 1, (1024 - d.h * scale) >> 1, scale)
    writePNG(`${out}/control-${plan.name.toLowerCase()}.png`, big.w, big.h, new Uint8Array(bytesOf(big).buffer))
  }
}
controlPictures()

/**
 * Each hull's plan seen from the side and from behind, as grey pictures on black for the image model to follow (as the
 * view from above): lighter is nearer, a nozzle seen end on a bright core in a dark rim. And the plan's solid, for
 * tools/voxel/carve.py to carve the voxels within.
 */
function sideAndRear() {
  const greys = {
    [HULL]: [pack(120, 120, 120), pack(150, 150, 150), pack(180, 180, 180)],
    [PART]: [pack(70, 70, 70), pack(96, 96, 96), pack(120, 120, 120)],
    [GLASS]: [pack(210, 210, 210), pack(235, 235, 235), pack(255, 255, 255)],
    [ENGINE]: [pack(70, 70, 70), pack(96, 96, 96), pack(120, 120, 120), pack(60, 60, 60), pack(250, 250, 250)],
  }
  for (const plan of HULLS) {
    const solid = solidOf(plan)
    const name = plan.name.toLowerCase()
    for (const from of ['side', 'rear'] as const) {
      const view = viewOf(solid, from)
      const d = paintView(view, greys, from === 'side' ? solid.w : solid.l)
      const scale = Math.floor(Math.min(880 / d.w, 440 / d.h))
      const big = createCanvas(1024, 512, pack(0, 0, 0))
      blit(big, d, (1024 - d.w * scale) >> 1, (512 - d.h * scale) >> 1, scale)
      writePNG(`${out}/control-${from}-${name}.png`, big.w, big.h, new Uint8Array(bytesOf(big).buffer))
    }
    const bits = Buffer.from(solid.kind).toString('base64')
    fs.writeFileSync(`${out}/plan-${name}.json`, JSON.stringify({ name, w: solid.w, l: solid.l, h: solid.h, kind: bits }))
  }
}
sideAndRear()
