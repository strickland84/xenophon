// The HUD's part in space (render/hud.ts draws the rest, as everywhere): what Use would do here
// (HOLD [F] DOCK, DESCEND, JUMP, THREAD THE RING, SKIM GAS, UNDOCK), the cruise drive's state,
// a course marker pointing the way to the body plotted (with its distance and the time to it),
// the stations' and gates' blips on the radar, warnings (HEAT, GRAVITY,
// CRUSHING), a gate's charge, and the system's name on arriving in it.

import { CRUISE, GATE, HOLE, SYSTEM_NAME_TIME } from '../data/space'
import { theGalaxy } from '../galaxy/galaxy'
import type { SceneState } from '../state'
import { pack } from '../util/color'
import { clamp } from '../util/math'
import { courseAim, cruiseTime, CRUISE_ON, CRUISE_SPOOL } from '../sim/space'
import type { SpaceBody } from '../sim/space'
import { bodyOnFrame } from './space'
import { dockable } from '../sim/stations'
import { gateTo } from '../sim/space'
import { textHeight, textWidth } from './font'
import type { LoopHud, PromptPart } from './hud'
import { barWidth, clearWidth, DANGER_COL, fitLines, lowRow, minePrompt, namePlate, powerLine, promptLine, repairLine } from './hud'
import { powered } from '../sim/power'
import { dangerHere } from '../sim/bands'

const INK = pack(244, 246, 252)
const DIM = pack(172, 186, 206)
const GOLD = pack(255, 214, 90)
const FOE = pack(255, 84, 70)
const COURSE = pack(120, 236, 220)
const GATE_COL = pack(120, 190, 255)
const STATION = pack(132, 236, 140)
const HEAT = pack(255, 150, 60)
const EDGE = 4

/** what the cruise drive's button is called on the device the use button is called so on (the HUD's prompts name it) */
const CRUISE_KEY: Record<string, string> = { F: 'C', O: 'R1', B: 'RB' }

/** the star kinds as a player reads them */
const STAR_NAMES: Record<string, string> = {
  red: 'RED DWARF',
  orange: 'ORANGE STAR',
  yellow: 'YELLOW STAR',
  white: 'WHITE STAR',
  blue: 'BLUE GIANT',
}

/** where bodyAt put a body on the frame */
const at = { x: 0, y: 0 }

/** a body on the frame as it is drawn (a world far below from overhead drifts slowly: render/space.ts) */
function bodyAt(scene: SceneState, b: SpaceBody) {
  const p = bodyOnFrame(scene, b)
  if (!p) return false
  at.x = p.x
  at.y = p.y
  const { w: W, h: H } = scene.screen
  return at.x >= 0 && at.y >= 0 && at.x < W && at.y < H
}

/** what Use would do in space, as the HUD says it */
function promptOf(scene: SceneState): PromptPart[] | null {
  const sp = scene.space
  const b = sp.target >= 0 ? sp.bodies[sp.target] : null
  const name = b ? b.body.name.toUpperCase() : ''
  switch (sp.prompt) {
    case 'dock':
      return b && dockable(scene, b) ? [{ words: `DOCK ${name}`, hold: true, col: GOLD }] : null
    case 'undock':
      return [{ words: 'UNDOCK', hold: true, col: INK }]
    case 'jump': {
      const to = b ? gateTo(b.body) : null
      return [{ words: `JUMP TO ${to ? theGalaxy().systems[to.system].name.toUpperCase() : '?'}`, hold: true, col: GATE_COL }]
    }
    case 'thread':
      return [{ words: 'THREAD THE RING', hold: true, col: GOLD }]
    case 'descend':
      return [{ words: `DESCEND ${name}`, hold: true, col: INK }]
    case 'skim':
      return [{ words: 'SKIM GAS', hold: true, col: INK }]
    case 'mine':
      return scene.loop.mining.target
        ? minePrompt(scene, scene.loop.mining.target.ore)
        : [{ words: 'MINE', hold: true, col: INK, key: scene.params.mineKey || 'R' }]
  }
  return null
}

/** in a world's air (in either zone): which way the ship is going through it */
export function airHud(scene: SceneState, h: LoopHud) {
  const tr = scene.travel
  if (!h.own || (tr.kind !== 'down' && tr.kind !== 'out')) return
  const { w: W, h: H } = scene.screen
  const { text, k, top } = h
  const w = theGalaxy().bodies[tr.from]
  const words = tr.kind === 'down' ? `DOWN TO ${w.name.toUpperCase()}` : 'UP TO SPACE'
  const y0 = top ? lowRow(scene) : H - EDGE - 21 - textHeight()
  // (broken into lines where the frame is too narrow for it, rising from the row)
  const said = fitLines(words, clearWidth(scene))
  for (const [i, line] of said.entries())
    text((W >> 1) - (textWidth(line) >> 1), y0 - (said.length - 1 - i) * (textHeight() + 3), line, INK, 1, k)
}

/** the HUD's part in space; `radar` is where the radar is (its middle and radius) */
export function spaceHud(scene: SceneState, h: LoopHud, radar: { x: number; y: number; r: number } | null) {
  const { put, text, k, top, blink } = h
  const { w: W, h: H } = scene.screen
  const sp = scene.space
  const midX = W >> 1
  const j = scene.jets[0]
  const time = scene.time
  const tr = scene.travel

  // ── what Use would do, under the middle (with a bar while a gate charges or the ring is threaded)
  const prompt = h.own ? promptOf(scene) : null
  const y0 = top ? lowRow(scene) : H - EDGE - 21 - textHeight()
  // (docked with the power off, or coming up: the power switch first; sim/power.ts)
  if (h.own && sp.prompt === 'undock' && !powered(scene)) powerLine(scene, h, y0, false)
  else if (prompt) {
    const place = promptLine(scene, h, prompt, y0)
    const charge =
      tr.kind === 'gate'
        ? tr.t / GATE.charge
        : tr.kind === 'hole'
          ? tr.t / HOLE.thread
          : sp.prompt === 'undock'
            ? scene.loop.landing.held / 0.25
            : 0
    if (charge > 0) h.box(place.x - 1, place.below, place.x - 1 + Math.round((place.w + 2) * Math.min(1, charge)), place.below + 1, GOLD, k)
  } else if (h.own && scene.loop.landing.stage === 0 && !tr.kind) {
    // (nothing to do here: the cruise drive is a press of its button away)
    const words = sp.cruise === CRUISE_ON ? 'DROP OUT' : sp.cruise === CRUISE_SPOOL ? 'SPOOLING' : 'CRUISE'
    if (sp.cruise === CRUISE_SPOOL) text(midX - textWidth(words) / 2, y0, words, COURSE, 1, k)
    else {
      const key = CRUISE_KEY[scene.params.useKey] ?? 'C'
      if (key) promptLine(scene, { ...h, k: (k * 170) >> 8 }, [{ words, hold: false, col: DIM }], y0, key)
    }
  }

  // (docked at a friendly station with the hull holed: what the mining key does there, mends it)
  repairLine(scene, h, y0)

  // ── the cruise drive, by the speed: a bar while it spools, its pace once it pushes (in the seat, the panel's screen says
  // it: render/cockpit/screens.ts cruise)
  if (h.own && !(scene.view.cockpit > 0.5 && scene.cockpitArt)) {
    const bx = EDGE
    // (kept to the top: under the hold's slots, a row of 13 px each, eight to a row)
    const by = top ? h.barsY + 17 + Math.ceil(scene.loop.hold.slots.length / 8) * 13 : H - EDGE - 2
    if (sp.cruise === CRUISE_SPOOL) {
      const u = clamp((time - sp.cruiseAt) / CRUISE.spool, 0, 1)
      h.box(bx, by, bx + 40, by + 1, pack(10, 14, 28), k >> 1)
      h.box(bx, by, bx + Math.round(40 * u), by + 1, COURSE, k)
      // (beside the bars, as the protection's count is: at a fixed 44 px it was written over the end of the hull's bar)
    } else if (sp.pace > 1.2) text(bx + barWidth(W) + 4, by - 6, `CRUISE x${sp.pace.toFixed(1)}`, COURSE, 1, k)
  }

  // (no names float over the bodies, the stations and the gates: what the pilot picks with the target key is named, with
  // its brackets and its card, render/targethud.ts. James, 2026-11-19: "remove all the planet names floating around unless
  // you've targeted them")

  // ── the course: an arrow at the frame's edge the way to it, with its name, how far, and how long at the cruise drive's pace
  const course = sp.course >= 0 ? sp.bodies.find((b) => b.body.index === sp.course) : null
  if (course && h.own) {
    const d = Math.max(0, Math.hypot(course.x - j.x, course.y - j.y) - course.body.size)
    const inFrame = bodyAt(scene, course)
    const label = `${course.body.name.toUpperCase()} ${d > 9999 ? (d / 1000).toFixed(0) + 'K' : Math.round(d)}`
    const eta = Math.max(1, Math.round(cruiseTime(scene, d)))
    // (the way round a sun, a giant or a black hole across it: the arrow points round it, and says so)
    const way = courseAim(scene)
    const round = way?.round ?? null
    const sub = round ? `ROUND ${round.body.name.toUpperCase()}` : d > 300 ? `${eta}S AT CRUISE` : ''
    if (inFrame && d < 2) {
      // (there: a pair of brackets round it)
    } else if (inFrame && !round) {
      const x = Math.round(at.x)
      const y = Math.round(at.y)
      for (let i = 0; i < 4; i++) {
        put(x - 6 + i, y - 6, COURSE, k)
        put(x - 6, y - 6 + i, COURSE, k)
        put(x + 6 - i, y + 6, COURSE, k)
        put(x + 6, y + 6 - i, COURSE, k)
      }
      text(x - textWidth(label) / 2, y + 4 + textHeight(), label, COURSE, 1, (k * 220) >> 8)
    } else {
      // where the line from the middle to it leaves the frame (behind the camera: the way round to it, as overhead)
      if (round || !bodyOnFrame(scene, course)) {
        const ox = (round ? way!.x : course.x) - j.x
        const oy = (round ? way!.y : course.y) - j.y
        at.x = W / 2 + ox * scene.view.cos - oy * scene.view.sin
        at.y = H / 2 + ox * scene.view.sin + oy * scene.view.cos
      }
      const dx = at.x - W / 2
      const dy = at.y - H / 2
      const len = Math.hypot(dx, dy) || 1
      const ux = dx / len
      const uy = dy / len
      const ix = W / 2 - EDGE - 3
      const iy = H / 2 - EDGE - 3
      const s = Math.min(Math.abs(ux) > 1e-6 ? ix / Math.abs(ux) : 1e9, Math.abs(uy) > 1e-6 ? iy / Math.abs(uy) : 1e9)
      const tipX = W / 2 + ux * s
      const tipY = H / 2 + uy * s
      for (let i = 0; i < 7; i++) {
        const w = i * 0.65
        for (let q = -w; q <= w + 0.01; q += 0.5) put(Math.round(tipX - ux * i - uy * q), Math.round(tipY - uy * i + ux * q), COURSE, k)
      }
      const lx = clamp(Math.round(W / 2 + ux * s * 0.8 - textWidth(label) / 2), EDGE, W - EDGE - textWidth(label))
      const ly = clamp(Math.round(H / 2 + uy * s * 0.8), EDGE + 10, H - EDGE - 34)
      text(lx, ly, label, COURSE, 1, (k * 230) >> 8)
      if (sub)
        text(
          clamp(Math.round(W / 2 + ux * s * 0.8 - textWidth(sub) / 2), EDGE, W - EDGE - textWidth(sub)),
          ly + textHeight() + 2,
          sub,
          DIM,
          1,
          (k * 180) >> 8,
        )
    }
  }

  // ── stations and gates on the radar (squares and rings), and the course
  if (radar) {
    const RANGE = 700
    const per = radar.r / RANGE
    for (const b of sp.bodies) {
      const kind = b.body.kind
      if (kind !== 'base' && kind !== 'gate' && b.body.index !== sp.course) continue
      const dx = b.x - j.x
      const dy = b.y - j.y
      const across = dx * scene.view.cos - dy * scene.view.sin
      const down = dx * scene.view.sin + dy * scene.view.cos
      let bx = across * per
      let by = down * per
      const d = Math.hypot(bx, by)
      if (d > radar.r - 1.5) {
        if (b.body.index !== sp.course) continue
        bx *= (radar.r - 1.5) / d
        by *= (radar.r - 1.5) / d
      }
      const x = Math.round(radar.x + bx)
      const y = Math.round(radar.y + by)
      const col = b.body.index === sp.course ? COURSE : kind === 'gate' ? GATE_COL : b.body.role === 'derelict' ? FOE : STATION
      for (const [ox, oy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ])
        if (kind === 'gate' ? ox * oy === 0 && (ox || oy) : true) put(x + ox, y + oy, col, k)
    }
  }

  // ── warnings, in the middle (under the system's name while that shows: the fresh review found EVENT HORIZON written as
  // a fourth line under its plate)
  let wy = Math.round(H * 0.2) + 10
  if (time - sp.arrivedAt < SYSTEM_NAME_TIME && sp.system >= 0) {
    const big = scene.params.hudScale > 1 ? 1.5 : 2
    const plate = Math.round(H * 0.12) + textHeight(big) + 3 + textHeight() + (dangerHere(scene) ? 3 + textHeight() : 0)
    wy = Math.max(wy, plate + 10)
  }
  if (h.own && time - sp.burnedAt < 0.5 && blink) text(midX - textWidth('HEAT') / 2, wy, 'HEAT', HEAT, 1, k)
  else if (h.own && time - sp.crushedAt < 0.5 && blink) text(midX - textWidth('CRUSHING') / 2, wy, 'CRUSHING', FOE, 1, k)
  else if (h.own && sp.pull > 40 && !tr.kind) {
    const b = sp.puller >= 0 ? sp.bodies[sp.puller] : null
    const words = b?.body.kind === 'black hole' ? 'EVENT HORIZON' : 'GRAVITY'
    if (blink || sp.pull < 80) text(midX - textWidth(words) / 2, wy, words, sp.pull > 100 ? FOE : GOLD, 1, k)
  }

  // ── the system, just arrived in: its name, its star, whose home it is
  const arrived = time - sp.arrivedAt
  if (arrived < SYSTEM_NAME_TIME && sp.system >= 0) {
    const s = theGalaxy().systems[sp.system]
    const kk = Math.round(k * clamp(Math.min(arrived / 0.4, (SYSTEM_NAME_TIME - arrived) / 0.8), 0, 1))
    const big = scene.params.hudScale > 1 ? 1.5 : 2
    const name = s.name.toUpperCase()
    const y = Math.round(H * 0.12)
    const what = s.side
      ? `${STAR_NAMES[s.suns[0]]} · HOME OF THE ${s.side === 'nomarchy' ? 'NOMARCHY' : 'ANARCHOI'}`
      : `${s.suns.map((x) => STAR_NAMES[x]).join(' + ')} · ${s.kind === 'core' ? 'THE CORE' : 'FRONTIER'}`
    // how dangerous it is, for this pilot (sim/bands.ts)
    const danger = dangerHere(scene)
    const wide = Math.max(textWidth(name, big), textWidth(what), danger ? textWidth(danger.words) : 0)
    namePlate(h.box, midX, y, y + textHeight(big) + 3 + textHeight() + (danger ? 3 + textHeight() : 0), wide, kk)
    text(midX - textWidth(name, big) / 2, y, name, GOLD, big, kk)
    text(midX - textWidth(what) / 2, y + textHeight(big) + 3, what, DIM, 1, kk)
    if (danger)
      text(midX - (textWidth(danger.words) >> 1), y + textHeight(big) + 6 + textHeight(), danger.words, DANGER_COL[danger.level], 1, kk)
  }
}
