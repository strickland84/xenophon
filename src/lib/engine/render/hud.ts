// The flight HUD, drawn over every view in the frame's own pixels: small and light, in the
// corners, as in the mockup (art/mockups/hud.png).
//
//   top left      the pilot's portrait; in the old skirmish, the wave, ships left, the score and a kill chain
//   top right     a radar, turned as the frame is
//   bottom left   shield and hull, speed and height
//   bottom right  missiles, and the guns' heat in a corner bracket
//   in the world  brackets on the target (closing as a missile locks on), the lead point to
//                 aim at, arrows at the frame's edge to ships off it, points for a kill, and
//                 over other pilots' ships their callsign; what the target key picked (render/targethud.ts)
//   top middle    the kill feed, in a shared sky
//   in the middle a world's or a system's name on arriving (and how dangerous it is), a missile
//                 coming (and the moment to roll); in the old skirmish a wave's arrival, the end
//   the loop      the hold's slots by the hull bars, what Land would do (LAND, MINE, TAKE
//                 OFF) under the middle, the way home while carrying, the bases' names over
//                 them, ore and bases on the radar, and news (BANKED, CARGO LOST)
//
// Landed or docked with the ship's power off (sim/power.ts) the instruments are dark: POWER OFF where the bars are, and
// under the middle the key that brings it up; coming up, they come alive in turn (the bars fill, the radar sweeps round
// once, the missiles and the guns' heat last). Landed, GUNS SAFE where the guns' heat is.
//
// In the cockpit the bottom of the frame belongs to the instrument panel: there everything keeps to
// the top, and the cockpit's own radar stands in for this one.

import { SCORE } from '../data/skirmish'
import { targetHud } from './targethud'
import { targetNow } from '../sim/target'
import { ORE_ICONS } from './oreicons'
import { MISSILE } from '../data/weapons'
import { jetSize } from '../jet/jet'
import { hostile, ownFighter, SIDE_PLAYER } from '../sim/combat'
import { repairCost } from '../sim/repair'
import type { Fighter } from '../sim/combat'
import { EJ_FLY, focus } from '../sim/ejection'
import { INTRO_TIME } from '../sim/flight'
import { nearestThreat } from '../sim/missiles'
import { FEED_TIME } from '../sim/room'
import { OVER, skirmishOn } from '../sim/skirmish'
import { dangerHere } from '../sim/bands'
import { BAND } from '../data/bands'
import type { SceneState } from '../state'
import { BAYER, blend, pack, parseColor } from '../util/color'
import { clamp } from '../util/math'
import { drawText, setTextUnit, textHeight, textWidth } from './font'
import { surfaceById, theGalaxy } from '../galaxy/galaxy'
import { ARCHETYPE_NAMES } from '../galaxy/recipe'

/** seconds a world's name is shown after arriving at it */
/** the colour of a place's name: nobody's, pale */

const WORLD_NAME_TIME = 5
import { pr, project } from './view'
import { RESOURCES } from '../data/resources'
import { CUT, LAND } from '../data/loop'
import { FLYING, grounded, LANDED } from '../sim/landing'
import { powered } from '../sim/power'
import { MOUSE_STICK, POWER } from '../data/hulls'
import { friendly, looping, wrapDelta } from '../sim/loop'
import { leftIn, nameOf } from '../sim/mining'
import { ABOARD, DEAD, FALLING, SHIP_PARKED, zoomOf } from '../sim/foot'
import { veinLeft } from '../sim/veins'
import { FOOT } from '../data/foot'
import { footHud } from './foothud'
import { seen } from './weather'
import { drawFace, drawHead } from './portrait'
import { inSpace } from '../sim/space'
import { airHud, spaceHud } from './spacehud'
import { cutHud } from './cuthud'
import { hotspotHere, phraseOf } from '../sim/traces'
import { traceNames } from './traces'
import { GHOST } from '../data/territory'
import { guidePoint } from '../sim/guide'

const INK = pack(244, 246, 252) // text
const DIM = pack(172, 186, 206) // quieter text
const SHADE = pack(10, 14, 28) // shadows, and the backs of bars
const HULL_OK = pack(112, 226, 124)
const HULL_LOW = pack(250, 210, 70)
const HULL_BAD = pack(250, 76, 60)
const SHIELD = pack(120, 206, 255)
/** the throttle: the warm of the engines' flames, and the thrusters' beyond it */
const THRUST = pack(255, 178, 84)
const BOOSTED = pack(255, 236, 170)
const HEAT = [pack(255, 226, 90), pack(255, 156, 40), pack(250, 64, 44)]
const FOE = pack(255, 84, 70)
const LOCKED = pack(255, 40, 40)
const FRIEND = pack(110, 190, 255)
const LEAD = pack(255, 232, 84)
const GOLD = pack(255, 214, 90)
/** a hotspot, today */
const HOT = pack(255, 150, 60)
const CREDIT = pack(132, 236, 140)
const HOME = pack(255, 214, 90)
/** the page's mark for where to go (the first sortie's guide) */
const GUIDE = pack(118, 240, 214)
/** each resource's colours, light, middle and dark, packed */
const ORE = new Map(Object.values(RESOURCES).map((r) => [r.id, r.colours.map((c) => pack(c[0], c[1], c[2]))]))
/** the backing of the pilot's portrait, the same night blue for both sides (the Anarchoi's was a brown James disliked, 2026-11-18) */
const FACE_BACK = pack(19, 26, 51)
/** the side colours, for their bases' names */
const SIDE_COL: Record<string, number> = { nomarchy: pack(242, 193, 78), anarchoi: pack(190, 150, 250) }
/** a hauler on the radar: a dot, no one's to fight */
const HAULER = pack(150, 160, 176)
/** how dangerous a place is: safe, low, medium, high */
export const DANGER_COL = [pack(112, 226, 124), pack(250, 210, 70), pack(255, 150, 60), pack(255, 84, 70)]

/**
 * True for an enemy the HUD does not show: a raider lying in wait too far off to be seen (it shows on the radar and the
 * arrows only close by), or one lost in fog, dust, snow or ash (as the frame hides it), unless he has it in his sights.
 */
const unseen = (scene: SceneState, f: Fighter, x: number, y: number) =>
  hostile(f) &&
  ((f.lurk && Math.hypot(f.jet.x - x, f.jet.y - y) > BAND.hidden) || (scene.sights.target !== f && seen(scene, f.jet.x, f.jet.y) < LOST))

/** how clearly a ship must be seen through the weather for the radar and the arrows to show it (render/weather.ts seen) */
// (as thick as storm, fog, dust and ash get, never rain or snow: raised with the weather thinned, 2026-11-19)
const LOST = 0.58

/** a foe on the radar: a small cross (a friend is a small square) */
const RADAR_FOE: [number, number][] = [
  [-1, -1],
  [1, -1],
  [0, 0],
  [-1, 1],
  [1, 1],
]

/** slots of the hold in a row of the HUD's, over the bars */
const HOLD_ROW = 8

/** the margin round the frame's edge */
const EDGE = 4

// scratch: where project() put a point, after the cockpit's roll
export const at = { x: 0, y: 0, m: 0, v: 0 }

/** a point in the world → the frame, as it is finally shown (turned with the cockpit's roll); false when it is behind the camera */
export function toScreen(scene: SceneState, x: number, y: number, z: number) {
  const view = scene.view
  if (!project(view, x, y, z)) return false
  at.x = pr.x
  at.y = pr.y
  at.m = pr.m
  at.v = pr.v
  if (view.roll !== 0) {
    const W = scene.screen.w
    const c = Math.cos(view.roll)
    const s = Math.sin(view.roll)
    const dx = pr.x - (W >> 1)
    const dy = pr.y - scene.pivotNow
    at.x = (W >> 1) + c * dx + s * dy
    at.y = scene.pivotNow - s * dx + c * dy
  }
  return true
}

export function drawHud(scene: SceneState) {
  // (the HUD's text twice the size where the page asks; not with the camera pulled in, where its pixels are large already)
  setTextUnit(zoomOf(scene) > 1 ? 1 : scene.params.hudScale)
  try {
    drawHudAll(scene)
  } finally {
    setTextUnit(1)
  }
}

/** the scene's clock since a moment, as a 0..1 ease in over `t` seconds (1 at once with the HUD's motion turned down) */
/** the row a prompt goes on when the HUD keeps to the top: low in the frame, but above the cockpit's panel in the cockpit */
/** how long the shield and hull bars are, in a frame `W` across (what is written beside them starts after) */
export const barWidth = (W: number) => clamp(Math.round(W * 0.11), 34, 56)

export function lowRow(scene: SceneState) {
  const H = scene.screen.h
  const art = scene.cockpitArt
  const low = Math.round(H * 0.8)
  return scene.view.cockpit > 0.5 && art ? Math.min(low, art.panelTop - textHeight() - 8) : low
}

export function easeIn(scene: SceneState, since: number, t: number) {
  if (!scene.params.hudMotion) return 1
  const e = clamp((scene.time - since) / t, 0, 1)
  return 1 - (1 - e) * (1 - e)
}

function drawHudAll(scene: SceneState) {
  const p = scene.params
  const { w: W, h: H, fb } = scene.screen
  if (!p.hud || W < 60 || H < 40) return
  const k = Math.round(clamp((scene.introT - INTRO_TIME) / 0.6, 0, 1) * 256)
  if (k <= 0) return
  const view = scene.view
  const cockpit = view.cockpit > 0.5
  const top = cockpit
  const own = ownFighter(scene)
  const time = scene.time
  const blink = ((time * 5) | 0) % 2 === 0
  // (big words are twice the size, but not on the small frame of the camera pulled in on foot; with the HUD's text
  // twice the size already, a half again)
  const big = view.under ? 1 : p.hudScale > 1 && zoomOf(scene) === 1 ? 1.5 : 2
  /** a line of the HUD's text, and the gap under it */
  const lineH = textHeight() + 2

  const put = (x: number, y: number, col: number, kk = k) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const o = y * W + x
    fb[o] = kk >= 256 ? col : blend(fb[o], col, kk)
  }
  const box = (x0: number, y0: number, x1: number, y1: number, col: number, kk = k) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, col, kk)
  }
  const text = (x: number, y: number, str: string, col: number, scale = 1, kk = k) => drawText(fb, W, H, x, y, str, col, SHADE, kk, scale)
  // the ship's power (sim/power.ts): how far an instrument that wakes at `from` of the way up has come (0 dark … 1 alive);
  // out of the ship, his own instruments are his
  const pw = scene.power.level
  const woke = (from: number) => (scene.foot.stage === ABOARD ? clamp((pw - from) / 0.25, 0, 1) : 1)

  // ── a hit on the player's own ship: the frame's edge flashes, red for the hull, blue for the shield
  if (own) {
    const hull = time - own.hullAt
    const shield = time - own.shieldAt
    const flash = hull < 0.14 ? HULL_BAD : shield < 0.1 ? SHIELD : 0
    if (flash) {
      const kk = Math.round(((hull < 0.14 ? 1 - hull / 0.14 : 1 - shield / 0.1) * (hull < 0.14 ? 150 : 90) * k) / 256)
      for (let i = 0; i < 3; i++) {
        const ki = (kk * (3 - i)) / 3
        for (let x = i; x < W - i; x++) {
          put(x, i, flash, ki)
          put(x, H - 1 - i, flash, ki)
        }
        for (let y = i + 1; y < H - 1 - i; y++) {
          put(i, y, flash, ki)
          put(W - 1 - i, y, flash, ki)
        }
      }
    }
  }

  // ── in the world: arrows to ships off the frame
  const lead = focus(scene)
  for (const f of scene.fighters) {
    if (!f.alive || f === own || f.jet.away || unseen(scene, f, lead.x, lead.y)) continue
    const on = toScreen(scene, f.jet.x, f.jet.y, f.jet.z)
    if (on && at.x >= 2 && at.y >= 2 && at.x < W - 2 && at.y < H - 2) continue
    const d = Math.hypot(f.jet.x - lead.x, f.jet.y - lead.y)
    if (d > 900) continue
    arrow(scene, on, f.jet.x, f.jet.y, hostile(f) ? FOE : FRIEND, d < 300 ? 4 : 3, k, put)
  }
  // … and to a missile coming for the player
  const threat = nearestThreat(scene, own)
  if (threat.missile) {
    const m = threat.missile
    const on = toScreen(scene, m.x, m.y, m.z)
    if (!(on && at.x >= 2 && at.y >= 2 && at.x < W - 2 && at.y < H - 2) && blink) arrow(scene, on, m.x, m.y, INK, 5, k, put)
  }

  // ── over other pilots' ships (and over them under their parachutes, and on foot): faction mark and callsign
  // (the mark's shape tells the side as well as its colour; the callsign is red for a foe)
  const sc = jetSize(p)
  const tag = (x: number, y: number, above: number, label: string, side: number, idle: boolean) => {
    const name = idle ? `${label} IDLE` : label
    // (no side's mark over a ship: James, 2026-11-19, of the violet and gold marks, "they are horrible"; the target's card
    // says whose a ship is)
    const w = textWidth(name)
    const x0 = Math.round(x - w / 2)
    const y0 = Math.round(y) - above - textHeight() - 3
    if (x0 > W || x0 + w < 0 || y0 > H || y0 < -6) return
    const foe = side !== SIDE_PLAYER && side >= 0
    text(x0, y0, name, idle ? DIM : foe ? FOE : INK, 1, idle ? k >> 1 : k)
  }
  for (const s of scene.ships) {
    if (!s.label || s.parked || s.jet.away) continue
    const j = s.jet
    if (!toScreen(scene, j.x, j.y, j.z)) continue
    const m = at.m * sc
    const above = s.out ? Math.round(30 * m) : Math.round(Math.max(s.mesh.model.w, s.mesh.model.l) * 0.45 * m)
    tag(at.x, at.y, above, s.label, s.side, s.idle)
  }
  // beacons: whose, over them
  for (const b of scene.signals.beacons) {
    if (!b.label || !toScreen(scene, b.x, b.y, b.z)) continue
    text(Math.round(at.x - textWidth(b.label) / 2), Math.round(at.y) - 13 - textHeight(), b.label, b.col, 1, (k * 200) >> 8)
  }
  for (const w of scene.walkers) {
    if (!w.label || w.stage === DEAD) continue
    // (one hidden under trees shows no name either, unless he is close)
    if (w.hidden && Math.hypot(w.jet.x - focus(scene).x, w.jet.y - focus(scene).y) > FOOT.hidden) continue
    if (!toScreen(scene, w.jet.x, w.jet.y, w.jet.z)) continue
    tag(at.x, at.y, w.stage === FALLING ? 16 : 8, w.label, w.side, w.idle)
  }

  // ── the target: brackets round it (closing in as a missile locks on), its hull, and where to aim
  const t = scene.sights.target
  if (own && t && t.alive && toScreen(scene, t.jet.x, t.jet.y, t.jet.z)) {
    const r = Math.max(5, Math.round(t.radius * jetSize(p) * at.m * 0.9))
    const lock = own.missiles > 0 ? own.lock : 0
    const locked = lock >= 1
    const gap = Math.round(r * (1 + (1 - lock) * (lock > 0 ? 0.9 : 0)))
    const col = locked ? LOCKED : lock > 0 && blink ? GOLD : FOE
    const arm = Math.max(2, Math.round(r * 0.45))
    const cx = Math.round(at.x)
    const cy = Math.round(at.y)
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = cx + sx * gap
      const y = cy + sy * gap
      for (let i = 0; i <= arm; i++) {
        put(x - sx * i, y, col)
        put(x, y - sy * i, col)
      }
    }
    // its hull (and shield) in a hair-thin bar over it
    const bw = gap * 2
    const bx = cx - gap
    const by = cy - gap - 3
    box(bx, by, bx + bw + 1, by + 1, SHADE, k >> 1)
    const hullW = Math.round((bw + 1) * clamp(t.hull / t.stats.hull, 0, 1))
    box(bx, by, bx + hullW, by + 1, t.hull / t.stats.hull > 0.3 ? HULL_OK : HULL_BAD)
    if (t.shield > 0) box(bx, by - 1, bx + Math.round((bw + 1) * (t.shield / t.stats.shield)), by, SHIELD, k >> 1)
    if (locked) text(cx - (textWidth('LOCK') >> 1), cy + gap + 3, 'LOCK', LOCKED)
    // well above or below the player: a chevron says which (overhead, height is hard to see)
    const dz = t.jet.z - own.jet.z
    if (Math.abs(dz) > 16 && view.chase + view.cockpit < 0.5) {
      const x = cx + gap + 3
      const up = dz > 0
      for (let i = 0; i < 3; i++) for (let j = -i; j <= i; j++) put(x + 2 + j, cy + (up ? -1 + i : 1 - i), DIM)
    }
    // the lead point: aim here to hit it
    const lp = scene.sights.lead
    if (toScreen(scene, lp.x, lp.y, lp.z)) {
      const lx = Math.round(at.x)
      const ly = Math.round(at.y)
      for (const [dx, dy] of [
        [0, -2],
        [1, -1],
        [2, 0],
        [1, 1],
        [0, 2],
        [-1, 1],
        [-2, 0],
        [-1, -1],
      ])
        put(lx + dx, ly + dy, LEAD)
    }
  }

  // ── the mouse as a stick, from behind and from the seat (Elite's mouse widget): a ring where it does nothing, and a line
  // out to where the pointer is, as far as the stick goes hard over; the further out, the faster the ship turns
  const ctl = scene.controls
  if (
    p.followPointer &&
    ctl.pointerOn &&
    !ctl.keyMode &&
    view.chase + view.cockpit > 0.5 &&
    own &&
    scene.foot.stage === ABOARD &&
    scene.zone.kind !== 'interior' &&
    !scene.interior.flying &&
    scene.eject.stage === EJ_FLY &&
    scene.loop.landing.stage === FLYING
  ) {
    const reach = W * MOUSE_STICK.reach
    const r = Math.max(3, Math.round(reach * MOUSE_STICK.dead))
    const cx = Math.round(view.cx)
    const cy = Math.round(view.steerY)
    const ring = (k * 120) >> 8
    // (in the seat, over the window only: never across the panel's instruments)
    const floor = cockpit && scene.cockpitArt ? scene.cockpitArt.panelTop - 1 : H
    const dot = (x: number, y: number, col: number, kk: number) => {
      if (y < floor) put(x, y, col, kk)
    }
    // (dotted, every other pixel of its round)
    const steps = Math.max(12, Math.round(r * 6.3))
    for (let i = 0; i < steps; i += 2) {
      const a = (i / steps) * Math.PI * 2
      dot(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), DIM, ring)
    }
    const dx = clamp(ctl.pointerX - cx, -reach, reach)
    const dy = clamp(ctl.pointerY - cy, -reach * 1.4, reach * 1.4)
    const d = Math.hypot(dx, dy)
    if (d > r + 1) {
      // (from the ring's edge to the pointer, brighter towards it)
      const n = Math.round(d - r)
      for (let i = 0; i <= n; i++) {
        const s = (r + i) / d
        dot(Math.round(cx + dx * s), Math.round(cy + dy * s), INK, Math.round(ring + (((k - ring) * i) / Math.max(1, n)) * 0.6))
      }
      for (const [ox, oy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ])
        dot(Math.round(cx + dx) + ox, Math.round(cy + dy) + oy, INK, k)
    }
  }

  // ── points rising from a kill (and in the loop, the credits it paid)
  for (const pu of scene.skirmish.popups) {
    if (!toScreen(scene, pu.x, pu.y, pu.z)) continue
    const str = '+' + pu.points
    const kk = Math.round(k * clamp((1.4 - pu.t) / 0.4, 0, 1))
    text(Math.round(at.x - textWidth(str) / 2), Math.round(at.y - 5 - lineH - pu.t * 10), str, GOLD, 1, kk)
    if (pu.credits > 0) {
      const cr = `+${pu.credits} CR`
      text(Math.round(at.x - textWidth(cr) / 2), Math.round(at.y - 3 - pu.t * 10), cr, CREDIT, 1, kk)
    }
  }

  // ── top left: the pilot's portrait (his look, if he has one), the wave, ships left, the score, a chain of kills
  const sk = scene.skirmish
  let leftY = EDGE
  const faceW = p.look ? 20 : 0
  if (p.look) drawFace(fb, W, H, EDGE, EDGE, p.look, FACE_BACK, k)
  const leftX = EDGE + faceW
  if (skirmishOn(scene)) {
    const wave = `WAVE ${sk.wave}`
    text(leftX, leftY, wave, DIM)
    // a little ship for each one left (in a shared sky there is no last ship)
    let sx = leftX + textWidth(wave) + 5
    for (let i = 0; i < (scene.room.shared ? 0 : sk.ships); i++, sx += 5) {
      put(sx + 1, leftY, INK)
      box(sx, leftY + 1, sx + 3, leftY + 3, INK)
      put(sx, leftY + 3, INK)
      put(sx + 2, leftY + 3, INK)
    }
    leftY += lineH
    const score = String(sk.score)
    text(leftX, leftY, score, INK)
    if (sk.chain > 1 && sk.chainT < SCORE.chain) text(leftX + textWidth(score) + 4, leftY, 'x' + sk.chain, GOLD)
    leftY += lineH + 2
  }
  // (the bars, kept to the top, go under the portrait)
  if (p.look) leftY = Math.max(leftY, EDGE + 20)

  // ── shield and hull, speed and height: bottom left (or under the score)
  const barW = barWidth(W)
  // (the throttle's bar under the hull's, while he has a ship: room for it)
  const barsY = top ? leftY : H - EDGE - (own && !cockpit ? 19 : 14)
  // (in the cockpit the panel's screens show them; with the power off, POWER OFF in their place)
  const barsOn = woke(0.3)
  if (own && !cockpit && barsOn <= 0) text(EDGE, barsY + (top ? 0 : 7 - textHeight()), 'POWER OFF', DIM)
  if (own && !cockpit && barsOn > 0) {
    const fx = scene.hudFx
    // (hit: the bars jolt a pixel for a moment, the hull's down, the shield's across)
    const hitT = Math.min(time - own.hullAt, time - own.shieldAt)
    const jolt = p.hudMotion && hitT < 0.16 ? (((time * 40) | 0) % 2 === 0 ? 1 : -1) : 0
    const bx = EDGE + (time - own.shieldAt < time - own.hullAt ? jolt : 0)
    const by = barsY + (time - own.hullAt <= time - own.shieldAt ? jolt : 0)
    // shield: two pixels, in a dark well; what was just lost shows pale, draining away
    box(bx - 1, by - 1, bx + barW + 1, by + 3, SHADE, k >> 1)
    const sf = clamp(own.shield / Math.max(1, own.stats.shield), 0, 1)
    // (coming up, the bars fill from nothing)
    const sw = Math.round(barW * sf * barsOn)
    const sTrail = Math.round(barW * Math.max(sf, fx.shield) * barsOn)
    for (let x = 0; x < sTrail; x++)
      if (x % 4 !== 3) box(bx + x, by, bx + x + 1, by + 2, x < sw ? SHIELD : INK, x < sw ? k : (k * 150) >> 8)
    // hull: three pixels, green, then amber, then red and blinking
    const hy = by + 4
    box(bx - 1, hy - 1, bx + barW + 1, hy + 4, SHADE, k >> 1)
    const left = clamp(own.hull / own.stats.hull, 0, 1)
    const hw = Math.round(barW * left * barsOn)
    const hTrail = Math.round(barW * Math.max(left, fx.hull) * barsOn)
    const hc = left > 0.6 ? HULL_OK : left > 0.3 ? HULL_LOW : HULL_BAD
    for (let x = hw; x < hTrail; x++) if (x % 4 !== 3) box(bx + x, hy, bx + x + 1, hy + 3, HULL_BAD, (k * 170) >> 8)
    if (left > 0.3 || blink) for (let x = 0; x < hw; x++) if (x % 4 !== 3) box(bx + x, hy, bx + x + 1, hy + 3, hc)
    // the throttle: two pixels under the hull, as far as it is open (the thrusters pale over it); for a moment after it
    // moves, and while the ship hangs still, the words (James asked for the engines' power his to set, 2026-11-18)
    const ty = hy + 6
    box(bx - 1, ty - 1, bx + barW + 1, ty + 3, SHADE, k >> 1)
    const tw = Math.round(barW * clamp(scene.throttle, 0, 1) * barsOn)
    const bw = Math.round(barW * clamp(Math.max(scene.throttle, scene.boost), 0, 1) * barsOn)
    for (let x = 0; x < bw; x++) if (x % 4 !== 3) box(bx + x, ty, bx + x + 1, ty + 2, x < tw && scene.boost < 0.5 ? THRUST : BOOSTED)
    const aloft = scene.loop.landing.stage === FLYING
    const still = aloft && scene.throttle <= 0 && scene.boost < 0.05
    if (still || time - scene.throttleAt < 1.6) {
      const words = still ? 'ALL STOP' : `THROTTLE ${Math.round(scene.throttle * 100)}`
      text(EDGE + barW + 4, ty + 3 - textHeight(), words, still ? (blink ? THRUST : DIM) : THRUST)
    }
    if (own.protect > 0) text(EDGE + barW + 4, barsY, 'SAFE ' + Math.ceil(own.protect), SHIELD)
    // (high up only, where the height matters: out into space from 160; in space there is no height to tell)
    // (over the protection's countdown when both show: they were drawn one on the other)
    if (!top && !inSpace(scene) && own.jet.z > 120)
      text(EDGE + barW + 4, own.protect > 0 ? barsY - textHeight() - 2 : barsY + 7 - textHeight(), `ALT ${Math.round(own.jet.z)}`, DIM)
  }

  // ── top right: the radar (in the cockpit, the panel's own does this); on foot, where the art pixels are twice the size,
  // half as many of them across, so it is no larger on the screen than in flight
  const R = view.under ? clamp(Math.round(H * 0.06), 7, 9) : clamp(Math.round(H * 0.075), 12, 20)
  const rx = W - EDGE - R - 1
  const ry = EDGE + R + 1
  // (coming up, it fades in and a line sweeps round it once)
  const radarOn = woke(0.4)
  if (!cockpit && radarOn > 0) {
    radar(scene, rx, ry, R, own, Math.round(k * radarOn), put)
    if (radarOn < 1) {
      const a = radarOn * Math.PI * 2
      for (let i = 1; i < R; i++) put(rx + Math.round(Math.sin(a) * i), ry - Math.round(Math.cos(a) * i), SHIELD, k)
    }
  }

  // ── the loop: the hold, what Land would do, the way home, the bases, the news; and on foot, his own
  const hud: LoopHud = { put, box, text, k, top, barsY, blink, own: !!own }
  if (scene.world.features.bases.length || inSpace(scene)) loopHud(scene, hud)
  if (scene.foot.stage !== ABOARD) footHud(scene, hud)
  // (in space: what Use does there, the cruise drive, the course, stations and gates, warnings)
  if (inSpace(scene)) spaceHud(scene, hud, cockpit ? null : { x: rx, y: ry, r: R })
  // (on the way down to a world or up out of one, in either zone)
  airHud(scene, hud)
  // (the page's mark for where to go: the first sortie's guide)
  if (scene.guide) guideHud(scene, hud)
  // (what the pilot picked with the target key: render/targethud.ts)
  if (scene.target.on) targetHud(scene, hud)
  // (what is being mined: brackets on it, its ore, the cut's bar; +3 FERRITE as it goes in)
  if (scene.world.features.bases.length || inSpace(scene))
    cutHud(
      scene,
      hud,
      scene.foot.stage !== ABOARD ? (top ? Math.round(H * 0.78) : H - EDGE - 24) : top ? lowRow(scene) : H - EDGE - 21 - textHeight(),
    )

  // ── missiles and the guns' heat: bottom right (or under the radar); missiles and mines while he has some, or
  // in a fight (to see them gone), the heat while the guns are warm
  const fighting = !!scene.sights.target || !!threat.missile
  // (landed or docked the weapons are safe, and say so here once the power is up: sim/fight.ts)
  if (own && !cockpit && grounded(scene) && pw >= 0.75)
    text(W - EDGE - textWidth('GUNS SAFE'), top ? ry + R + 6 : H - EDGE - textHeight(), 'GUNS SAFE', DIM)
  if (own && !cockpit && pw >= 0.75 && !grounded(scene)) {
    const gw = clamp(Math.round(W * 0.09), 30, 46)
    const gx = W - EDGE - gw
    const gy = top ? (cockpit ? EDGE : ry + R + 6) : H - EDGE - 4
    // missiles: a dart for each, dark once fired
    // (shown while there are any, in a fight, and while one is on its way back: sim/combat.ts)
    const rack = own.missiles > 0 || fighting || own.missiles < own.stats.missiles ? own.stats.missiles : 0
    for (let i = 0; i < rack; i++) {
      const x = W - EDGE - 2 - i * 4
      const y = top ? gy + 6 : gy - 9
      const full = i < own.missiles
      put(x, y, full ? INK : SHADE)
      box(x, y + 1, x + 1, y + 5, full ? HULL_BAD : SHADE)
      put(x - 1, y + 4, full ? DIM : SHADE)
      put(x + 1, y + 4, full ? DIM : SHADE)
      // (the next one, coming back: its dart fills from its tail)
      if (i === own.missiles) {
        const rows = Math.floor((1 - own.missileIn / MISSILE.regen) * 5)
        if (rows > 0) box(x, y + 6 - rows, x + 1, y + 5, DIM)
      }
    }
    // mines: a little ball for each, beyond the missiles
    for (let i = 0; i < (own.mines > 0 || fighting ? own.minesMax : 0); i++) {
      const x = W - EDGE - 2 - rack * 4 - 3 - i * 4
      const y = (top ? gy + 6 : gy - 9) + 2
      const full = i < own.mines
      box(x - 1, y, x + 1, y + 2, full ? DIM : SHADE)
      put(x, y + 1, full ? HEAT[2] : SHADE)
    }
    // heat: a bar along the bottom of a corner bracket, while the guns are warm
    const jammed = own.jam > 0
    if (own.heat > 0.02 || jammed) {
      box(gx - 1, gy - 1, gx + gw + 1, gy + 2, SHADE, k >> 1)
      const hw = Math.round(gw * clamp(own.heat, 0, 1))
      const hc = own.heat < 0.5 ? HEAT[0] : own.heat < 0.8 ? HEAT[1] : HEAT[2]
      if (!jammed || blink) box(gx + gw - hw, gy, gx + gw, gy + 1, hc)
      const bracket = jammed ? HEAT[2] : DIM
      box(gx + gw + 1, gy - 6, gx + gw + 2, gy + 2, bracket, k >> 1)
      if (jammed) text(gx - textWidth('HOT') - 4, gy + 1 - textHeight(), 'HOT', HEAT[2])
    }
  }

  // ── the squad: each mate (and wingman) down the left side, his hull as a short bar; SLIPSTREAM while in it
  if (scene.squad.on && !cockpit) {
    let sy = Math.round(H * 0.34)
    const row = (name: string, left: number) => {
      text(EDGE, sy, name, FRIEND)
      const bw = 18
      const ly = sy + textHeight() + 2
      box(EDGE, ly, EDGE + bw, ly + 1, SHADE, k >> 1)
      if (left > 0)
        box(EDGE, ly, EDGE + Math.max(1, Math.round(bw * left)), ly + 1, left > 0.5 ? HULL_OK : left > 0.25 ? HULL_LOW : HULL_BAD)
      sy += lineH + 5
    }
    for (let i = 1; i < scene.jets.length; i++) {
      const f = scene.jets[i].fighter
      row(`WING ${i}`, f && f.alive && !scene.jets[i].away ? f.hull / f.stats.hull : 0)
    }
    for (const m of scene.squad.mates) {
      const s = scene.ships.find((x) => x.id === m.id)
      const f = s?.jet.fighter
      row(m.callsign, f && f.alive ? f.hull / f.stats.hull : s ? 1 : 0)
    }
    if (scene.squad.slip > 0.5) text(EDGE, sy, 'SLIPSTREAM', blink ? GOLD : DIM)
  }

  // ── top middle: the kill feed, newest at the bottom, each line fading at the end
  const midX = W >> 1
  const feed = scene.room.feed
  // (a line with pilots' heads in it is a little taller)
  let feedY = EDGE + 4 + lineH
  for (let i = 0; i < feed.length; i++) {
    const { line, t } = feed[i]
    const y = feedY
    feedY += line.parts.some((part) => part.face) ? Math.max(9, lineH + 2) : lineH
    const age = time - t
    const kk = Math.round(k * clamp((FEED_TIME - age) / 1, 0, 1))
    if (kk <= 0) continue
    let w = 0
    for (const part of line.parts) w += (part.mark ? 6 : 0) + (part.face ? 10 : 0) + (part.text ? textWidth(part.text) + 4 : 0)
    let x = midX - Math.round((w - 4) / 2)
    for (const part of line.parts) {
      const col = colourCache(part.color)
      if (part.face) x += drawHead(fb, W, H, x, y - 2, part.face, kk) + 1
      if (part.mark) {
        drawMark(x, y, part.mark, col, kk, put)
        x += 6
      }
      if (part.text) {
        text(x, y, part.text, col, 1, kk)
        x += textWidth(part.text) + 4
      }
    }
  }

  // ── the middle: warnings, and the big news
  if (own && threat.missile) {
    const rollNow = threat.tti < MISSILE.dodgeEarly && threat.tti > MISSILE.dodgeLate
    const y = Math.round(H * 0.2)
    if (rollNow) text(midX - textWidth('ROLL!', big) / 2, y, 'ROLL!', blink ? INK : GOLD, big)
    else if (blink) text(midX - textWidth('MISSILE') / 2, y + 2, 'MISSILE', FOE)
  } else if (own) {
    // an enemy's seeker is on the player
    for (const f of scene.fighters) {
      if (hostile(f) && f.seeker === own && f.lock > 0.3) {
        if (blink) text(midX - textWidth('LOCK WARNING') / 2, Math.round(H * 0.2) + 2, 'LOCK WARNING', GOLD)
        break
      }
    }
  }
  const bannerY = Math.round(H * 0.3)
  // the weapons safe on the ground, the power switch refused in flight: a word for a moment (sim/power.ts tell)
  const told = time - scene.power.saidAt
  if (scene.power.said && told >= 0 && told < POWER.told && (own || scene.foot.stage === ABOARD)) {
    const words = scene.power.said === 'safe' ? 'WEAPONS SAFE' : 'POWER LOCKED IN FLIGHT'
    const kk = Math.round(k * clamp(Math.min(told / 0.08, (POWER.told - told) / 0.4), 0, 1))
    text(midX - (textWidth(words) >> 1), Math.round(H * 0.26), words, scene.power.said === 'safe' ? GOLD : FOE, 1, kk)
  }
  if (sk.banner && sk.bannerT < 2.4) {
    const kk = Math.round(k * clamp(Math.min(sk.bannerT / 0.15, (2.4 - sk.bannerT) / 0.5), 0, 1))
    text(midX - textWidth(sk.banner, big) / 2, bannerY, sk.banner, INK, big, kk)
  }
  // a world of the galaxy, just arrived at: its name, its kind and its system
  const arrived = time - scene.arrivedAt
  const surface = scene.planet && arrived < WORLD_NAME_TIME ? surfaceById(p.world) : null
  if (surface) {
    const kk = Math.round(k * clamp(Math.min(arrived / 0.4, (WORLD_NAME_TIME - arrived) / 0.8), 0, 1))
    // (named by the first pilot to land there, if one has: sim/traces.ts)
    const tr = scene.traces
    const name = (tr.name || surface.name).toUpperCase()
    const y = Math.round(H * 0.12)
    // (its name types itself out, a letter at a time, centred on the whole of it)
    const shown = p.hudMotion ? name.slice(0, Math.max(1, Math.floor(arrived / 0.035))) : name
    const kind = `${ARCHETYPE_NAMES[surface.recipe.archetype]} · ${theGalaxy().systems[surface.system].name}`.toUpperCase()
    // how dangerous it is, who holds it, who named it, and whether its ore is rich today
    const lines: [string, number][] = []
    const danger = dangerHere(scene)
    if (danger) lines.push([danger.words, DANGER_COL[danger.level]])
    if (tr.finder) lines.push([`NAMED BY ${tr.finder}`, DIM])
    if (tr.known && surface.habitable) {
      const h = tr.holders[surface.id] ?? ''
      lines.push([h ? `HELD BY THE ${h === 'anarchoi' ? 'ANARCHOI' : 'NOMARCHY'}` : 'HELD BY NOBODY', h ? SIDE_COL[h] : INK])
    }
    if (hotspotHere(scene)) lines.push(['HOTSPOT: RICH ORE TODAY', HOT])
    let ly = y + textHeight(big) + 3
    const wide = Math.max(textWidth(name, big), textWidth(kind), ...lines.map(([line]) => textWidth(line)))
    namePlate(box, midX, y, ly + textHeight() + lines.length * (lineH + 1), wide, kk)
    text(midX - textWidth(name, big) / 2, y, shown, GOLD, big, kk)
    // (and the lines under it come in after)
    const kl = Math.round(kk * easeIn(scene, scene.arrivedAt + 0.35, 0.3))
    text(midX - textWidth(kind) / 2, ly, kind, DIM, 1, kl)
    for (const [line, col] of lines) {
      ly += lineH + 1
      text(midX - (textWidth(line) >> 1), ly, line, col, 1, kl)
    }
  }
  tracesHud(scene, text, k, top, midX, H)
  if (sk.stage === OVER && skirmishOn(scene)) {
    const line = `SCORE ${sk.score}   BEST ${Math.max(sk.best, sk.score)}`
    text(midX - textWidth(line) / 2, bannerY + textHeight(big) + 5, line, GOLD)
  } else if (scene.eject.stage !== EJ_FLY && skirmishOn(scene) && !scene.eject.foot) {
    const line = 'A NEW SHIP IS ON ITS WAY'
    text(midX - textWidth(line) / 2, lowRow(scene) + 4, line, DIM)
  }
}

/** the persistent world's part of the HUD: a beacon being read, a ghost being recorded, names over graves and flags near by */
function tracesHud(
  scene: SceneState,
  text: (x: number, y: number, str: string, col: number, scale?: number, kk?: number) => void,
  k: number,
  top: boolean,
  midX: number,
  H: number,
) {
  const tr = scene.traces
  traceNames(scene, scene.screen, k)
  const r = tr.reading
  // (not while a world's name is up on arriving: they would overlap)
  if (r && !(scene.planet && scene.time - scene.arrivedAt < WORLD_NAME_TIME)) {
    const age = scene.time - r.t
    const kk = Math.round(k * clamp(age / 0.3, 0, 1))
    const who = `BEACON · ${r.mark.callsign}`
    const words = phraseOf(r.mark.n)
    // (high up, under the ship's way, clear of the pack and the prompts at the bottom)
    const y = top ? Math.round(H * 0.56) : 26
    text(midX - (textWidth(who) >> 1), y, who, r.mark.side === 'anarchoi' ? SIDE_COL.anarchoi : SIDE_COL.nomarchy, 1, kk)
    text(midX - (textWidth(words) >> 1), y + textHeight() + 3, words, INK, 1, kk)
  }
  if (tr.recording) {
    // (a ghost being recorded: the seconds left, blinking)
    const line = `REC ${Math.ceil(GHOST.longest - tr.recordT)}`
    text(midX - (textWidth(line) >> 1), top ? 30 : 22, line, FOE, 1, ((scene.time * 2) | 0) % 2 === 0 ? k : k >> 1)
  }
}

// the faction marks, five pixels square: 1 a triangle (the Nomarchy), 2 a diamond (the Anarchoi)
const MARKS: Record<number, string[]> = {
  1: ['..#..', '..#..', '.###.', '.###.', '#####'],
  2: ['..#..', '.###.', '#####', '.###.', '..#..'],
}

/** a faction mark with its top-left corner at (x, y), with the text's dark shadow */
function drawMark(
  x: number,
  y: number,
  mark: number,
  col: number,
  k: number,
  put: (x: number, y: number, col: number, k?: number) => void,
) {
  const rows = MARKS[mark]
  if (!rows) return
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === '#') put(x + c + 1, y + r + 1, SHADE, (k * 170) >> 8)
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (rows[r][c] === '#') put(x + c, y + r, col, k)
}

/** the feed's colours, given as text, packed once each */
const colours = new Map<string, number>()
function colourCache(text: string) {
  let c = colours.get(text)
  if (c === undefined) {
    const [r, g, b] = parseColor(text, [244, 246, 252])
    colours.set(text, (c = pack(r, g, b)))
  }
  return c
}

/** an arrow at the frame's edge, pointing to (x, y) in the world; `on` says whether toScreen placed it (else it is behind the camera) */
export function arrow(
  scene: SceneState,
  on: boolean,
  x: number,
  y: number,
  col: number,
  size: number,
  k: number,
  put: (x: number, y: number, col: number, k?: number) => void,
) {
  const { w: W, h: H } = scene.screen
  const view = scene.view
  const cx = W / 2
  const cy = H / 2
  let dx: number
  let dy: number
  if (on) {
    dx = at.x - cx
    dy = at.y - cy
  } else {
    // behind the camera: off the bottom of the frame, to the side it is on
    const ox = x - view.x
    const oy = y - view.y
    dx = ox * view.cos - oy * view.sin
    dy = Math.abs(dx) * 0.3 + H
  }
  const len = Math.hypot(dx, dy) || 1
  dx /= len
  dy /= len
  // where the line from the middle leaves a box just inside the frame
  const ix = W / 2 - EDGE - 3
  const iy = H / 2 - EDGE - 3
  const s = Math.min(Math.abs(dx) > 1e-6 ? ix / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-6 ? iy / Math.abs(dy) : 1e9)
  const tipX = cx + dx * s
  const tipY = cy + dy * s
  // a little solid triangle, pointing out
  const px = -dy
  const py = dx
  for (let i = 0; i < size; i++) {
    const w = i * 0.6
    for (let j = -w; j <= w + 0.01; j += 0.5) {
      const xx = Math.round(tipX - dx * i + px * j)
      const yy = Math.round(tipY - dy * i + py * j)
      put(xx, yy, col, k)
    }
  }
}

/** the radar: the sky round the player, turned as the frame is, enemies red and friends blue */
function radar(
  scene: SceneState,
  cx: number,
  cy: number,
  R: number,
  own: Fighter | null,
  k: number,
  put: (x: number, y: number, col: number, k?: number) => void,
) {
  const view = scene.view
  const lead = focus(scene)
  // (on foot it covers less ground, and shows his ship and the veins)
  const afoot = scene.foot.stage !== ABOARD
  // (a scanner reaches further)
  const RANGE = (afoot ? 320 : 700) * scene.parts.radar
  const per = R / RANGE
  // a dark disc, a ring at its edge and half-way, and a cross
  for (let y = -R; y <= R; y++) {
    for (let x = -R; x <= R; x++) {
      const d = Math.sqrt(x * x + y * y)
      if (d > R + 0.5) continue
      if (Math.abs(d - R) < 0.5) put(cx + x, cy + y, DIM, (k * 150) >> 8)
      else if (Math.abs(d - R / 2) < 0.5 && BAYER[((y & 3) << 2) | (x & 3)] < 8) put(cx + x, cy + y, DIM, (k * 70) >> 8)
      else put(cx + x, cy + y, SHADE, (k * 120) >> 8)
    }
  }
  for (let i = -R; i <= R; i += 2) {
    put(cx + i, cy, DIM, (k * 50) >> 8)
    put(cx, cy + i, DIM, (k * 50) >> 8)
  }
  // a ship on the radar: where it is against the player, as the frame is turned
  const place = (x: number, y: number) => {
    const dx = x - lead.x
    const dy = y - lead.y
    const across = dx * view.cos - dy * view.sin
    const depth = -(dx * view.sin + dy * view.cos)
    let bx = across * per
    let by = -depth * per
    const d = Math.hypot(bx, by)
    const out = d > R - 1.5
    if (out) {
      bx *= (R - 1.5) / d
      by *= (R - 1.5) / d
    }
    blip.x = Math.round(cx + bx)
    blip.y = Math.round(cy + by)
    blip.out = out
  }
  const blink = ((scene.time * 4) | 0) % 2 === 0
  // the ship picked with the target key (sim/target.ts), ringed on the radar
  const on = scene.target.on
  const picked = on && (on.kind === 'ship' || on.kind === 'wing') ? (targetNow(scene, on)?.jet ?? null) : null
  const ring = (x: number, y: number) => {
    for (let i = -2; i <= 2; i++) {
      put(x + i, y - 3, INK, k)
      put(x + i, y + 3, INK, k)
      put(x - 3, y + i, INK, k)
      put(x + 3, y + i, INK, k)
    }
  }
  // haulers going about their business: dim dots, within range
  for (const s of scene.ships) {
    if (!s.traffic || s.jet.away || Math.hypot(s.jet.x - lead.x, s.jet.y - lead.y) > RANGE) continue
    place(s.jet.x, s.jet.y)
    put(blip.x, blip.y, HAULER, (k * 200) >> 8)
    if (picked === s.jet) ring(blip.x, blip.y)
  }
  for (const f of scene.fighters) {
    if (!f.alive || f === own || f.jet.away) continue
    const dist = Math.hypot(f.jet.x - lead.x, f.jet.y - lead.y)
    // (a stealthy hull only shows close in; a raider lying in wait, only very close)
    if (hostile(f) && dist > RANGE * f.stats.radar) continue
    if (unseen(scene, f, lead.x, lead.y)) continue
    place(f.jet.x, f.jet.y)
    const foe = hostile(f)
    const col = foe ? (scene.sights.target === f ? LOCKED : FOE) : FRIEND
    const kk = blip.out ? (k * 140) >> 8 : k
    // (the target picked: a ring round its blip)
    if (picked === f.jet) ring(blip.x, blip.y)
    // (told apart by shape as well as colour: a foe is a small cross, a friend a small square)
    if (foe) for (const [x, y] of RADAR_FOE) put(blip.x + x, blip.y + y, col, kk)
    else {
      put(blip.x, blip.y, col, kk)
      put(blip.x + 1, blip.y, col, kk)
      put(blip.x, blip.y + 1, col, kk)
      put(blip.x + 1, blip.y + 1, col, kk)
    }
  }
  for (const m of scene.missiles) {
    if (!m.on || !blink) continue
    place(m.x, m.y)
    put(blip.x, blip.y, m.target === own ? INK : DIM, k)
  }
  // the loop: ore with something left in it (dim, so ships stand out), the bases, crates
  const f = scene.world.features
  for (const o of f.outcrops) {
    const dx = wrapDelta(o.x - lead.x)
    const dy = wrapDelta(o.y - lead.y)
    if (dx * dx + dy * dy > RANGE * RANGE || leftIn(scene, o) <= 0) continue
    place(lead.x + dx, lead.y + dy)
    if (blip.out) continue
    const col = ORE.get(o.ore)![0]
    put(blip.x, blip.y, col, (k * (o.rich ? 230 : 150)) >> 8)
    if (o.rich) put(blip.x + 1, blip.y, col, (k * 230) >> 8)
  }
  for (const b of f.bases) {
    place(lead.x + wrapDelta(b.x - lead.x), lead.y + wrapDelta(b.y - lead.y))
    const mine = friendly(scene, b)
    const col = mine ? CREDIT : FOE
    const kk = blip.out ? (k * 140) >> 8 : k
    // (a friendly base is a ring, another's a ring filled in)
    if (!mine) put(blip.x, blip.y, col, kk)
    for (const [x, y] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ])
      put(blip.x + x, blip.y + y, col, kk)
  }
  if (afoot && looping(scene)) {
    for (const v of scene.foot.veins) {
      const dx = wrapDelta(v.x - lead.x)
      const dy = wrapDelta(v.y - lead.y)
      if (dx * dx + dy * dy > RANGE * RANGE || veinLeft(scene, v) <= 0) continue
      place(lead.x + dx, lead.y + dy)
      if (!blip.out) put(blip.x, blip.y, ORE.get(v.ore)![0], (k * 200) >> 8)
    }
    const ship = scene.jets[0]
    if (scene.foot.ship === SHIP_PARKED && !ship.away) {
      place(lead.x + wrapDelta(ship.x - lead.x), lead.y + wrapDelta(ship.y - lead.y))
      for (const [x, y] of [
        [0, -1],
        [-1, 0],
        [1, 0],
        [0, 1],
      ])
        put(blip.x + x, blip.y + y, FRIEND, k)
    }
  }
  // beacons, and flares while they burn
  for (const b of scene.signals.beacons) {
    place(lead.x + wrapDelta(b.x - lead.x), lead.y + wrapDelta(b.y - lead.y))
    if (!blip.out || blink) {
      put(blip.x, blip.y - 1, b.col, k)
      put(blip.x, blip.y, b.col, k)
    }
  }
  for (const fl of scene.signals.flares) {
    place(lead.x + wrapDelta(fl.x - lead.x), lead.y + wrapDelta(fl.y - lead.y))
    if (blink) put(blip.x, blip.y, fl.col, k)
  }
  if (blink)
    for (const c of scene.loop.crates) {
      place(lead.x + wrapDelta(c.x - lead.x), lead.y + wrapDelta(c.y - lead.y))
      if (!blip.out) put(blip.x, blip.y, INK, k)
    }
  // the player: a small arrowhead, pointing the way he flies
  const a = lead.yaw + view.yaw
  const fx = Math.sin(a)
  const fy = -Math.cos(a)
  for (let i = -1; i <= 2; i++) put(Math.round(cx + fx * i), Math.round(cy + fy * i), INK, k)
  put(Math.round(cx - fx - fy), Math.round(cy - fy + fx), INK, k)
  put(Math.round(cx - fx + fy), Math.round(cy - fy - fx), INK, k)
}
const blip = { x: 0, y: 0, out: false }

/** what the loop's part of the HUD is given by drawHud */
export interface LoopHud {
  put: (x: number, y: number, col: number, k?: number) => void
  box: (x0: number, y0: number, x1: number, y1: number, col: number, k?: number) => void
  text: (x: number, y: number, str: string, col: number, scale?: number, k?: number) => void
  k: number
  top: boolean
  barsY: number
  blink: boolean
  own: boolean
}

/**
 * A dark plate behind a place's name and the lines under it, as it is arrived at: `w` wide round the middle, from
 * y0 to y1. The name is then read over anything (a station's hub, a gas giant's glare, a bright sea), its
 * edges softened a pixel at a time.
 */
export function namePlate(box: LoopHud['box'], midX: number, y0: number, y1: number, w: number, k: number) {
  const x0 = Math.round(midX - w / 2) - 8
  const x1 = Math.round(midX + w / 2) + 8
  for (let i = 0; i < 4; i++) box(x0 - i, y0 - 4 - i, x1 + i, y1 + 4 + i, SHADE, (k * (i ? 30 : 110)) >> 8)
}

/** how wide a line under the middle may be: the frame, less a margin either side (a line wider is broken, or its parts stacked) */
export function clearWidth(scene: SceneState) {
  return scene.screen.w - 16
}

/** words broken into lines no wider than `w` (a line that cannot be broken is left whole) */
export function fitLines(words: string, w: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of words.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (line && textWidth(next) > w) {
      out.push(line)
      line = word
    } else line = next
  }
  if (line) out.push(line)
  return out
}

/** a part of a prompt: the words, whether the key must be held for them, and their colour; and its key, if not Land's */
export interface PromptPart {
  words: string
  hold: boolean
  col: number
  key?: string
}

/** the prompts: what Land would do, and whether it must be held (landed, in the loop: a tap climbs out, a hold lifts off) */
const PROMPTS: Record<string, PromptPart[]> = {
  land: [{ words: 'LAND', hold: true, col: INK }],
  pad: [{ words: 'LAND AND BANK', hold: true, col: GOLD }],
  mine: [{ words: 'MINE', hold: true, col: INK }],
  takeoff: [{ words: 'TAKE OFF', hold: true, col: INK }],
  landed: [
    { words: 'GET OUT', hold: false, col: INK },
    { words: 'TAKE OFF', hold: true, col: INK },
  ],
}

/** what Land or Use would do over ore: MINE and its name (as the brackets over it say) */
/** the laser's prompt, on its own key (the mining key), and what Land would do as well (`also`: 'land' or 'pad') */
export const minePrompt = (scene: SceneState, ore: string, also = ''): PromptPart[] => [
  { words: `MINE ${nameOf(ore)}`, hold: true, col: INK, key: scene.params.mineKey || 'R' },
  ...(PROMPTS[also] ?? []),
]

/** how wide a line of prompts is drawn (promptLine's own measure, laid in one row) */
export function promptWidth(scene: SceneState, parts: PromptPart[]) {
  const u = textHeight() / 5
  const key = scene.params.useKey || 'F'
  let w = -8 * u
  for (const p of parts) w += (p.hold ? textWidth('HOLD ') : 0) + textWidth(p.key || key) + 8 * u + textWidth(p.words) + 8 * u
  return w
}

/** a line of prompts under the middle of the frame: HOLD [F] LAND, [F] GET OUT … (returns where the key's box is, for a bar under it) */
export function promptLine(scene: SceneState, h: LoopHud, parts: PromptPart[], y0: number, keyName = '') {
  const { box, text } = h
  const { w: W } = scene.screen
  const key = keyName || scene.params.useKey || 'F'
  // (a font pixel: the key's box keeps its margins in them)
  const u = textHeight() / 5
  const th = textHeight()
  const keyOf = (p: PromptPart) => p.key || key
  const kwOf = (p: PromptPart) => textWidth(keyOf(p)) + 4 * u
  const gap = 8 * u
  const partW = (p: PromptPart) => (p.hold ? textWidth('HOLD ') : 0) + kwOf(p) + 4 * u + textWidth(p.words)
  let w = -gap
  for (const p of parts) w += partW(p) + gap
  // (too wide for the frame: a line a part, the last on the row asked for)
  const stack = parts.length > 1 && w > clearWidth(scene)
  let x = (W >> 1) - ((stack ? partW(parts[0]) : w) >> 1)
  if (stack) y0 -= (parts.length - 1) * (th + 4 * u + 3)
  // (a new prompt comes in, rising a little; then it breathes)
  const e = easeIn(scene, scene.hudFx.promptAt, 0.2)
  y0 += Math.round((1 - e) * 4)
  const k = Math.round(h.k * e)
  const kk = Math.round(k * (0.8 + 0.2 * Math.sin(scene.time * 5)))
  let last = 0
  let kw = 0
  for (const [i, p] of parts.entries()) {
    kw = kwOf(p)
    if (stack && i > 0) {
      x = (W >> 1) - (partW(p) >> 1)
      y0 += th + 4 * u + 3
    }
    if (p.hold) {
      text(x, y0, 'HOLD ', DIM, 1, kk)
      x += textWidth('HOLD ')
    }
    // the key, in a box
    box(x - 1, y0 - 2 * u, x + kw, y0 - 2 * u + 1, INK, kk)
    box(x - 1, y0 + th + u, x + kw, y0 + th + u + 1, INK, kk)
    box(x - 2, y0 - 2 * u + 1, x - 1, y0 + th + u, INK, kk)
    box(x + kw, y0 - 2 * u + 1, x + kw + 1, y0 + th + u, INK, kk)
    text(x + 2 * u, y0, keyOf(p), INK, 1, kk)
    last = x
    x += kw + 4 * u
    text(x, y0, p.words, p.col, 1, kk)
    x += textWidth(p.words) + gap
  }
  return { x: last, w: kw, below: y0 + th + 2 * u + 2 }
}

/**
 * Landed or docked with the power off: [P] POWER UP (and, landed in the loop, [F] GET OUT) under the middle; coming up,
 * POWERING UP over a bar that fills as it does (sim/power.ts).
 */
export function powerLine(scene: SceneState, h: LoopHud, y0: number, getOut: boolean) {
  const p = scene.power
  if (p.on) {
    const words = 'POWERING UP'
    const w = textWidth(words)
    const x = (scene.screen.w >> 1) - (w >> 1)
    h.text(x, y0, words, THRUST, 1, h.k)
    const by = y0 + textHeight() + 3
    h.box(x - 1, by - 1, x + w + 1, by + 2, SHADE, h.k >> 1)
    h.box(x, by, x + Math.round(w * p.level), by + 1, THRUST, h.k)
    return
  }
  const parts: PromptPart[] = [{ words: 'POWER UP', hold: false, col: GOLD, key: scene.params.powerKey || 'P' }]
  if (getOut) parts.push({ words: 'GET OUT', hold: false, col: INK })
  promptLine(scene, h, parts, y0)
}

/**
 * Down or docked at a friendly base with the hull short of whole (sim/repair.ts), a line over the prompt at `y0`: [R]
 * REPAIR and what the whole of it would cost; being mended, REPAIRING over a bar of the hull as it fills; and where he
 * cannot pay, that.
 */
export function repairLine(scene: SceneState, h: LoopHud, y0: number) {
  const r = scene.repair
  const f = ownFighter(scene)
  if (!h.own || !r.offered || !f) return
  const mid = scene.screen.w >> 1
  const y = y0 - 2 * textHeight() - 6
  if (r.on) {
    const words = 'REPAIRING'
    const w = textWidth(words)
    const x = mid - (w >> 1)
    h.text(x, y, words, GOLD, 1, h.k)
    const by = y + textHeight() + 3
    h.box(x - 1, by - 1, x + w + 1, by + 2, SHADE, h.k >> 1)
    h.box(x, by, x + Math.round((w * f.hull) / f.stats.hull), by + 1, GOLD, h.k)
  } else if (r.broke) {
    const words = 'NO CREDITS FOR REPAIRS'
    h.text(mid - (textWidth(words) >> 1), y, words, DIM, 1, h.k)
  } else promptLine(scene, h, [{ words: `REPAIR ${repairCost(scene)} CR`, hold: true, col: GOLD, key: scene.params.mineKey || 'R' }], y)
}

/** the page's mark for where to go (sim/guide.ts): brackets round it, pulsing, with its name over it; off the frame, an arrow at the edge with its name and distance */
function guideHud(scene: SceneState, h: LoopHud) {
  const { put, text, k } = h
  const { w: W, h: H } = scene.screen
  const lead = focus(scene)
  const g = guidePoint(scene, lead.x, lead.y)
  if (!g) return
  const on = toScreen(scene, lead.x + g.dx, lead.y + g.dy, g.z)
  const inFrame = on && at.x >= 10 && at.y >= 10 && at.x < W - 10 && at.y < H - 10
  const label = g.label.toUpperCase()
  if (inFrame) {
    const x = Math.round(at.x)
    const y = Math.round(at.y)
    const r = 7 + Math.round(1.5 + 1.5 * Math.sin(scene.time * 6))
    // four corner brackets (not round a ship the sights already bracket: its name is enough)
    const sighted = !!g.jet && scene.sights.target?.jet === g.jet
    if (!sighted)
      for (const [sx, sy] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ]) {
        for (let i = 0; i < 3; i++) {
          put(x + sx * (r - i), y + sy * r, GUIDE, k)
          put(x + sx * r, y + sy * (r - i), GUIDE, k)
        }
      }
    text(x - (textWidth(label) >> 1), y - r - 4 - textHeight(), label, GUIDE, 1, k)
    return
  }
  const tipX = at.x
  const tipY = at.y
  arrow(scene, on, lead.x + g.dx, lead.y + g.dy, GUIDE, 5, k, put)
  const words = `${label} ${Math.round(Math.hypot(g.dx, g.dy))}`
  const cx = W / 2
  const cy = H / 2
  const ax = on ? clamp(tipX, EDGE + 12, W - EDGE - 12) : cx
  const ay = on ? clamp(tipY, EDGE + 12, H - EDGE - 12) : H - EDGE - 12
  const ix = Math.round(cx + (ax - cx) * 0.8 - textWidth(words) / 2)
  const iy = Math.round(cy + (ay - cy) * 0.8)
  text(clamp(ix, EDGE, W - EDGE - textWidth(words)), clamp(iy, EDGE + 8, H - EDGE - 30), words, GUIDE, 1, k)
}

/** the loop's part of the HUD (see the top of the file) */
function loopHud(scene: SceneState, h: LoopHud) {
  const { put, box, text, k, top, barsY, blink } = h
  const { w: W, h: H } = scene.screen
  const loop = scene.loop
  const time = scene.time
  const lead = focus(scene)
  const midX = W >> 1

  // ── the hold: a little well for each slot, filled from the bottom in its ore's colours (while he carries
  // something, mines, or is landed where it is banked; not an empty hold in a fight)
  const carryingAny = loop.hold.slots.some((s) => !!s)
  const holdMatters =
    carryingAny ||
    loop.landing.prompt === 'mine' ||
    loop.landing.prompt === 'pad' ||
    loop.landing.stage === LANDED ||
    time - loop.fullAt < 2.2
  if (h.own && holdMatters && (scene.foot.stage !== ABOARD || scene.power.level >= 0.3)) {
    const slots = loop.hold.slots
    // (each slot a well with what is in it as its own icon, the one the hold's screen shows, and under it a line for how
    // full it is: James asked why the corner's slots were not the icons he saw on Tab. Eight to a row, rows stacked away
    // from the bars)
    const rows = Math.ceil(slots.length / HOLD_ROW)
    const cy0 = top ? barsY + 15 : barsY - 14 - (rows - 1) * 13
    let x: number
    for (const [i, s] of slots.entries()) {
      x = EDGE + (i % HOLD_ROW) * 12
      const cy = cy0 + Math.floor(i / HOLD_ROW) * 13
      box(x - 1, cy - 1, x + 10, cy + 11, SHADE, (k * 3) >> 2)
      box(x, cy + 10, x + 9, cy + 11, DIM, k >> 2)
      if (s) {
        const cols = ORE.get(s.id)!
        const icon = ORE_ICONS[s.id]?.small
        if (icon) {
          for (let p = 0; p < icon.px.length; p++) if (icon.px[p]) put(x + (p % icon.w), cy + Math.floor(p / icon.w), icon.px[p])
        } else box(x + 2, cy + 2, x + 7, cy + 7, cols[1])
        const fill = Math.max(1, Math.round((9 * s.n) / RESOURCES[s.id].stack))
        // (how full: a line along its floor, white for a moment as more of its ore goes in)
        const pop = loop.mining.pop
        const fresh = pop && !pop.pack && pop.ore === s.id && time - pop.at < 0.35
        box(x, cy + 10, x + fill, cy + 11, fresh ? INK : cols[0])
      }
    }
    x = EDGE + Math.min(slots.length, HOLD_ROW) * 12
    const cy = cy0 + (rows - 1) * 13 + 5
    if (time - loop.fullAt < 2.2 && blink) text(x + 2, cy + 6 - textHeight(), 'HOLD FULL', FOE)
    else if (time - loop.mining.scoopAt < CUT.told) {
      // (how full it is, for a moment after ore goes in)
      let n = 0
      let most = 0
      for (const s of slots) {
        most += RESOURCES[s?.id ?? 'ferrite'].stack
        if (s) n += s.n
      }
      text(x + 2, cy + 6 - textHeight(), `${n}/${most}`, DIM, 1, k)
    }
  }

  // ── what Land would do, under the middle: HOLD [F] LAND
  const L = loop.landing
  const prompt = L.prompt === 'mine' && loop.mining.target ? minePrompt(scene, loop.mining.target.ore, L.landToo) : PROMPTS[L.prompt]
  // (down with the power off, or coming up: the power switch first; sim/power.ts)
  if (h.own && L.stage === LANDED && !powered(scene))
    powerLine(scene, h, top ? lowRow(scene) : H - EDGE - 21 - textHeight(), L.prompt === 'landed')
  else if (prompt && h.own) {
    const y0 = top ? lowRow(scene) : H - EDGE - 21 - textHeight()
    const at = promptLine(scene, h, prompt, y0)
    // taking off: how long it has been held
    if ((L.prompt === 'takeoff' || L.prompt === 'landed') && L.held > 0)
      box(at.x - 1, at.below, at.x - 1 + Math.round((at.w + 2) * Math.min(1, L.held / LAND.hold)), at.below + 1, GOLD, k)
  }
  // (and, down at a friendly base with the hull holed, what the mining key does there: mends it)
  repairLine(scene, h, top ? lowRow(scene) : H - EDGE - 21 - textHeight())

  // ── the way home while carrying
  const features = scene.world.features
  const carrying = loop.hold.slots.some((s) => !!s)
  let home: (typeof features.bases)[number] | null = null
  let homeD = Infinity
  for (const b of features.bases) {
    const dx = wrapDelta(b.x - lead.x)
    const dy = wrapDelta(b.y - lead.y)
    const d = Math.hypot(dx, dy)
    const mine = friendly(scene, b)
    if (mine && d < homeD) {
      homeD = d
      home = b
    }
  }
  // (no names float over the bases and the places: the target key names what it picks, render/targethud.ts. James,
  // 2026-11-19: "remove all the planet names floating around unless you've targeted them")
  // (the way home, but not once he is all but there: HOME 47 was written across the prompt to land and bank)
  if (carrying && home && L.stage === FLYING && h.own && homeD > 90) {
    const dx = wrapDelta(home.x - lead.x)
    const dy = wrapDelta(home.y - lead.y)
    const on = toScreen(scene, lead.x + dx, lead.y + dy, home.pads[0].z)
    const inFrame = on && at.x >= 2 && at.y >= 2 && at.x < W - 2 && at.y < H - 2
    if (!inFrame) {
      const tipX = at.x
      const tipY = at.y
      arrow(scene, on, lead.x + dx, lead.y + dy, HOME, 5, k, put)
      // the distance, inside the arrow
      const dist = `HOME ${Math.round(homeD)}`
      // (in the seat, never down on the panel's screens or on the prompt over them)
      const low = scene.view.cockpit > 0.5 && scene.cockpitArt ? lowRow(scene) - textHeight() - 8 : H - EDGE - 30
      const cx = W / 2
      const cy = H / 2
      const ax = on ? clamp(tipX, EDGE + 12, W - EDGE - 12) : cx
      const ay = on ? clamp(tipY, EDGE + 12, H - EDGE - 12) : H - EDGE - 12
      const ix = clamp(Math.round(cx + (ax - cx) * 0.82 - textWidth(dist) / 2), EDGE, W - EDGE - textWidth(dist))
      const iy = Math.round(cy + (ay - cy) * 0.82)
      // (over the hold's slots at the bottom left it was written across them: kept above them there)
      const slots = loop.hold.slots.length
      const overSlots = !h.top && ix < EDGE + Math.min(slots, HOLD_ROW) * 12 + 4
      const slotsTop = h.barsY - 15 - (Math.ceil(slots / HOLD_ROW) - 1) * 13
      text(ix, clamp(iy, EDGE + 8, overSlots ? Math.min(low, slotsTop - textHeight() - 2) : low), dist, HOME, 1, (k * 220) >> 8)
    }
  }

  // ── news: BANKED, CARGO LOST, a crate taken
  const big = scene.view.under ? 1 : scene.params.hudScale > 1 && zoomOf(scene) === 1 ? 1.5 : 2
  const n = loop.news
  const age = time - n.t
  if (age >= 0 && age < 2.8 && n.text) {
    const kk = Math.round(k * clamp(Math.min(age / 0.12, (2.8 - age) / 0.5), 0, 1))
    const y = Math.round(H * 0.42) + Math.round((1 - easeIn(scene, n.t, 0.2)) * 6)
    text(midX - textWidth(n.text, big) / 2, y, n.text, n.good ? GOLD : FOE, big, kk)
    if (n.sub) text(midX - textWidth(n.sub) / 2, y + textHeight(big) + 4, n.sub, INK, 1, kk)
  }
}
