// The worlds' creatures as the game draws them (sim/creatures.ts, render/creatures.ts): each kind on a world where it
// lives, beside the pilot on foot, at the frame a laptop shows on foot, scaled up to look at; and a kill, with what it
// dropped lying about (a heartstone glinting). Run it by hand:
//
//   npx jiti tools/creature-sheet.ts [out.png] [scale]
//
// (docs/art/gen/creatures.png is this.)

import { createScene, DEFAULT_PARAMS, STEP, stateOf } from '../src/lib/engine/index'
import { CREATURES, FAUNA } from '../src/lib/engine/data/creatures'
import { theGalaxy, worldSettings } from '../src/lib/engine/galaxy/galaxy'
import { footGround } from '../src/lib/engine/sim/foot'
import { DEAD, strikeCreature } from '../src/lib/engine/sim/creatures'
import { wrapDelta } from '../src/lib/engine/sim/loop'
import { pr, project } from '../src/lib/engine/render/view'
import { writePNG } from './png.mjs'

const [out = 'docs/art/gen/creatures.png', scale0 = '4'] = process.argv.slice(2)
const S = Number(scale0)
// (a laptop's frame on foot: 1366 × 768 CSS px at 3 px an art pixel, pulled in twice)
const FW = 228
const FH = 128
// each picture: this much of the frame round the pilot and the creature
const CW = 112
const CH = 64

/** a world where a kind lives (the nth of its archetype), as the scene's settings */
function worldFor(kind: string, nth = 0) {
  const arche = Object.entries(FAUNA).find(([, f]) => f.common.some(([id]) => id === kind) || f.hunters.some(([id]) => id === kind))?.[0] ?? 'continental'
  const list = theGalaxy().worlds.filter((w) => w.recipe.archetype === arche)
  return worldSettings(list[nth % list.length].id)
}

/** a scene with the pilot out on foot beside a creature of a kind; `frames` stepped after; the picture round them */
function shot(kind: string, frames: number, kill = false) {
  // (the rare one lives anywhere: on a continental world here, its group put where the pilot is)
  const scene = createScene({
    ...DEFAULT_PARAMS,
    ...worldFor(kind === 'thornback' ? 'woolhorn' : kind),
    side: 'nomarchy',
    intro: false,
    skirmish: false,
    locals: true,
    hud: false,
    look: 'solari.0.0.0.3a4a6a.f2c14e',
  } as never)
  scene.resize(FW * 2, FH * 2)
  scene.setClock(1_800_000_000)
  for (let i = 0; i < 30; i++) scene.step(STEP)
  scene.act('use')
  for (let i = 0; i < 60; i++) scene.step(STEP)
  scene.resize(FW, FH)
  const s = stateOf(scene)!
  const k = CREATURES.findIndex((c) => c.id === kind)
  let g = s.wild.groups.find((x) => x.kind === k)
  if (!g) {
    // (none of it here: the nearest group made one of it)
    g = s.wild.groups[0]
    g.kind = k
    g.count = 1
  }
  const w = s.foot.walker.jet
  // (the pilot set down a little off its home, on ground he can stand on)
  for (const [dx, dy] of [
    [-34, 10],
    [34, 10],
    [0, 34],
    [0, -34],
    [-50, 0],
    [50, 0],
  ]) {
    const x = g.x + dx
    const y = g.y + dy
    const feet = footGround(s.world, x, y, 0)
    if (feet > 0 || s.world.look.sea === 'none') {
      w.x = x
      w.y = y
      w.z = feet + 3
      break
    }
  }
  for (let i = 0; i < frames; i++) {
    scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false } as never)
    scene.step(STEP)
    if (kill && i === Math.floor(frames / 2)) {
      for (const c of s.wild.up.filter((x) => x.group === g))
        while (c.mode !== DEAD) strikeCreature(s, c, 9, s.foot.walker.fighter, c.x, c.y, c.z + 2, 1, 0)
    }
  }
  // the middle: between the pilot and the nearest of it
  const near = s.wild.up.filter((c) => c.group === g).sort((a, b) => Math.hypot(wrapDelta(a.x - w.x), wrapDelta(a.y - w.y)) - Math.hypot(wrapDelta(b.x - w.x), wrapDelta(b.y - w.y)))[0]
  const px = scene.render()
  const view = s.view
  const at = (x: number, y: number, z: number) => {
    project(view, view.x + wrapDelta(x - view.x), view.y + wrapDelta(y - view.y), z)
    return { x: pr.x, y: pr.y }
  }
  const a = at(w.x, w.y, w.z)
  const b = near ? at(near.x, near.y, near.z) : a
  const cx = Math.round(Math.max(CW / 2, Math.min(FW - CW / 2, (a.x + b.x) / 2)))
  const cy = Math.round(Math.max(CH / 2, Math.min(FH - CH / 2, (a.y + b.y) / 2 - 4)))
  const crop = new Uint8Array(CW * CH * 4)
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const sx = cx - CW / 2 + x
      const sy = cy - CH / 2 + y
      const i = (sy * FW + sx) * 4
      crop.set(px.subarray(i, i + 4), (y * CW + x) * 4)
    }
  return crop
}

const pictures: Uint8Array[] = []
for (const k of CREATURES) pictures.push(shot(k.id, k.way === 'flee' ? 30 : 70))
pictures.push(shot('thornback', 160, true))
pictures.push(shot('razorjaw', 120, true))
const cols = 2
const rows = Math.ceil(pictures.length / cols)
const GAP = 2
const W = cols * CW + (cols + 1) * GAP
const H = rows * CH + (rows + 1) * GAP
const sheet = new Uint8Array(W * H * 4)
for (let i = 0; i < W * H; i++) sheet.set([18, 20, 30, 255], i * 4)
pictures.forEach((p, n) => {
  const x0 = GAP + (n % cols) * (CW + GAP)
  const y0 = GAP + Math.floor(n / cols) * (CH + GAP)
  for (let y = 0; y < CH; y++) sheet.set(p.subarray(y * CW * 4, (y + 1) * CW * 4), ((y0 + y) * W + x0) * 4)
})
const big = new Uint8Array(W * S * H * S * 4)
for (let y = 0; y < H * S; y++)
  for (let x = 0; x < W * S; x++) big.set(sheet.subarray(((Math.floor(y / S) * W + Math.floor(x / S)) * 4), (Math.floor(y / S) * W + Math.floor(x / S)) * 4 + 4), (y * W * S + x) * 4)
writePNG(out, W * S, H * S, big)
console.log(`${out}: ${pictures.length} pictures`)
