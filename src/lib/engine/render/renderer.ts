// Draws a frame. Everything goes into one low-resolution pixel buffer, the way the technique
// works: the jet is a stack of horizontal slices drawn a pixel apart, turned to any angle, and
// the islands and the clouds are stacks too (a height per ground pixel). The buffer is then
// shown scaled up with hard pixels.

import { updateView } from '../sim/camera'
import { flameBend, flameLength } from '../sim/exhaust'
import type { SceneState } from '../state'
import type { Fighter } from '../sim/combat'
import { cockpitClear, drawCockpitView } from './cockpit/view'
import { drawBursts, drawCombat, drawShields } from './combat'
import { drawFloaters, drawPilot, drawWreckage } from './ejection'
import type { Frame } from './frame'
import { drawJet, FLAME_F } from './jet'
import { drawLoot } from './loot'
import { drawMining } from './mining'
import type { Craft } from './jet'
import { drawHud } from './hud'
import { drawSmoke } from './smoke'
import { drawTrails } from './trails'
import { prepareWeather, seen } from './weather'
import { zoneOf } from '../sim/zone'
import { drawSignals, drawVeins, drawWalkers } from './walker'
import { drawCreatures } from './creatures'
import { pack } from '../util/color'
import { clamp } from '../util/math'
import { drawTraces } from './traces'
import { renderInterior } from './interior'
import { coldPaintOf } from './paint'
import { POWER } from '../data/hulls'

// a ship's outline: white the moment it is hit, and pale blue, coming and going, while it cannot be harmed
const STRUCK = pack(255, 255, 255)
const GUARDED = pack(140, 220, 255)
// a ghost's outline: pale, cold
const GHOST = pack(170, 230, 255)
// the frame under the cockpit's panel, where the world is not drawn
const COVERED = pack(8, 9, 14)

/** the colour of a fighting ship's outline right now (0: the usual) */
function outlineOf(scene: SceneState, f: Fighter | null) {
  if (!f) return 0
  if (scene.time - f.hullAt < 0.07) return STRUCK
  if (f.protect > 0 && ((scene.time * 6) | 0) % 2 === 0) return GUARDED
  return 0
}

/** turns the square sheet by the camera's roll into the frame that is shown (its rows from `clear` down are the cockpit's: left dark) */
function turnSheet(screen: Frame, sheet: Frame, roll: number, pivotY: number, clear: number) {
  const c = Math.cos(roll)
  const s = Math.sin(roll)
  const side = sheet.w
  const half = side >> 1
  const { w: W, h: H } = screen
  const cx = W >> 1
  const _fb = screen.fb
  const _sh = sheet.fb
  _fb.fill(COVERED, clear * W, H * W)
  for (let y = 0; y < clear; y++) {
    const dy = y - pivotY
    let sx = half - c * cx - s * dy + 0.5
    let sy = half - s * cx + c * dy + 0.5
    let o = y * W
    for (let x = 0; x < W; x++, o++, sx += c, sy += s) _fb[o] = _sh[(sy | 0) * side + (sx | 0)]
  }
}

/** the smooth flames were placed on the sheet: turn them with it */
function turnFlames(scene: SceneState) {
  const flameData = scene.flames.data
  const W = scene.screen.w
  const pivotY = scene.pivotNow
  const half = scene.sheet.w >> 1
  const rc = Math.cos(scene.view.roll)
  const rs = Math.sin(scene.view.roll)
  for (let i = 0; i < scene.flames.count; i++) {
    for (let n = 0; n < 3; n++) {
      const o = i * FLAME_F + n * 2
      const dx = flameData[o] - half
      const dy = flameData[o + 1] - half
      flameData[o] = (W >> 1) + rc * dx + rs * dy
      flameData[o + 1] = pivotY - rs * dx + rc * dy
    }
  }
}

// every ship to be drawn this frame: the wreck (if there is one), the player's jets, then
// everyone else's ships; and the order to draw them in, far ones first
const crafts: Craft[] = []
const order: number[] = []
const depth: number[] = []
const byDepth = (a: number, b: number) => depth[a] - depth[b]

/** gathers every ship in the scene for drawing */
function gather(scene: SceneState) {
  const { view, eject, jets, ships, introT } = scene
  crafts.length = 0
  // the player's: the wreck and the leader fade as the camera moves into the cockpit, and in
  // the intro each one's slices fall in a beat after the last one's
  // (the engines glow with the ship's power: lit near the end of its way up, out half way down; sim/power.ts)
  const pw = scene.power
  const glowing = pw.on ? pw.level >= POWER.glow : pw.level > POWER.glow / 2
  const own = {
    mesh: scene.mesh,
    paint: glowing ? scene.paint : coldPaintOf(scene.paint, scene.mesh.model),
    flameLen: flameLength(scene, scene.mesh.model, scene.burn, scene.boost),
    burn: scene.burn,
    boost: scene.boost,
    bend: flameBend(scene, jets[0]),
    arch: scene.flight.climbTilt * 0.35,
  }
  if (eject.wreck) crafts.push({ jet: eject.wreck, ...own, fade: view.jetFade, intro: introT + 0.25, seed: -1, outline: 0 })
  jets.forEach((jet, i) =>
    crafts.push({
      jet,
      ...own,
      fade: i === 0 ? view.jetFade : 1,
      intro: introT - i * 0.25,
      seed: i,
      outline: outlineOf(scene, jet.fighter),
    }),
  )
  for (const s of ships) {
    // (a pilot under his parachute is drawn by drawFloaters instead; a hauler docked out of sight is not drawn)
    if (s.out || s.jet.away) continue
    const { mesh, paint, thrust } = s
    const bend = flameBend(scene, s.jet)
    const flameLen = flameLength(scene, mesh.model, 1, thrust)
    const outline = outlineOf(scene, s.jet.fighter)
    // (in fog, storm, dust or a whiteout, a ship far off fades into it)
    const fade = seen(scene, s.jet.x, s.jet.y)
    crafts.push({ jet: s.jet, mesh, paint, flameLen, burn: 1, boost: thrust, bend, arch: 0, fade, intro: 99, seed: 3 + s.id, outline })
  }
  // ghosts: other pilots' recorded flights, pale and see-through (sim/traces.ts)
  for (const g of scene.traces.ghosts) {
    if (!g.shown) continue
    crafts.push({
      jet: g.jet,
      mesh: g.mesh,
      paint: g.paint,
      flameLen: 6,
      burn: 0.4,
      boost: 0,
      bend: 0,
      arch: 0,
      fade: 0.5,
      intro: 99,
      seed: -3,
      outline: GHOST,
    })
  }
  // ships going down, their engines dead
  for (const w of scene.effects.wrecks) {
    const { jet, mesh, paint } = w
    crafts.push({
      jet,
      mesh,
      paint,
      flameLen: 0,
      burn: 0,
      boost: 0,
      bend: 0,
      arch: 0,
      fade: seen(scene, jet.x, jet.y),
      intro: 99,
      seed: -2,
      outline: 0,
    })
  }
}

export function renderScene(scene: SceneState) {
  const { screen, sheet, view, eject } = scene
  const { w: W, h: H } = screen
  if (W === 0) return
  scene.pivotNow = scene.pivotY
  // (inside: a room of its own, drawn its own way; and up out of his seat in flight, his ship's rooms, the outside unseen)
  if (scene.zone.kind === 'interior' || scene.interior.flying) {
    renderInterior(scene)
    return
  }
  updateView(scene)
  prepareWeather(scene)
  scene.flames.count = 0

  // in the cockpit the view rolls with the jet, so the world goes onto the square sheet first
  const rolled = view.cockpit > 0 || view.roll !== 0
  const f = rolled ? sheet : screen
  const cy = view.cy
  // (the row the picture turns about: the seat's own; from behind, in space, where the camera rolls with a ship on its
  // back, the row the ship sits on, so the ship stays where it is and the stars go round it)
  const pivotY = Math.round(scene.pivotY * view.cockpit + clamp(cy, 0, H - 1) * (1 - view.cockpit))
  scene.pivotNow = pivotY
  // (the rows the cockpit's panel hides wherever the head is need no world under them)
  const clear = view.cockpit > 0 ? Math.max(pivotY + 1, cockpitClear(scene)) : H
  if (rolled) {
    const half = sheet.w >> 1
    view.cx = half
    view.cy = half + (cy - pivotY)
    // only the part of the sheet the turned frame can see is drawn
    const c = Math.abs(Math.cos(view.roll))
    const s = Math.abs(Math.sin(view.roll))
    const tall = Math.max(pivotY, clear - pivotY)
    f.colLo = Math.max(0, half - Math.ceil(c * (W / 2) + s * tall) - 2)
    f.colHi = Math.min(sheet.w, half + Math.ceil(c * (W / 2) + s * tall) + 2)
    f.rowLo = Math.max(0, half - Math.ceil(c * pivotY + s * (W / 2)) - 2)
    f.rowHi = Math.min(sheet.w, half + Math.ceil(c * (clear - pivotY) + s * (W / 2)) + 2)
  } else {
    f.colLo = 0
    f.colHi = W
    f.rowLo = 0
    f.rowHi = H
  }

  gather(scene)
  // behind everything: the zone's backdrop (the ground, the sea and the clouds, the sky and the haze; or space)
  const zone = zoneOf(scene)
  zone.drawBack(scene, f, crafts)
  drawTrails(scene, f)
  drawVeins(scene, f)
  drawSmoke(scene, f)
  drawWreckage(scene, f)
  drawCombat(scene, f)
  drawLoot(scene, f)
  drawMining(scene, f)
  drawTraces(scene, f)
  // the creatures on the ground, under the ships (drawn after them they were over a ship flying above them: the ships
  // keep a depth of their own, not the frame's)
  drawCreatures(scene, f)
  // the weather's haze over the ground and everything on it (the ships fade into it on their own: `seen`)
  zone.drawHaze(scene, f)
  // the wreck first, then far ships before near ones
  const wrecked = eject.wreck ? 1 : 0
  if (wrecked) drawJet(scene, f, crafts[0])
  order.length = 0
  for (let i = wrecked; i < crafts.length; i++) {
    const j = crafts[i].jet
    order.push(i)
    depth[i] = (j.x - view.x) * view.sin + (j.y - view.y) * view.cos
  }
  order.sort(byDepth)
  for (const i of order) drawJet(scene, f, crafts[i])
  drawShields(scene, f)
  drawBursts(scene, f)
  drawPilot(scene, f)
  drawFloaters(scene, f)
  drawWalkers(scene, f)
  drawSignals(scene, f)
  // over everything but the HUD: the zone's own (the weather)
  zone.drawFront(scene, f)

  if (rolled) {
    view.cx = W >> 1
    view.cy = cy
    turnSheet(screen, sheet, view.roll, pivotY, clear)
    turnFlames(scene)
    drawCockpitView(scene)
  }
  drawHud(scene)
}
