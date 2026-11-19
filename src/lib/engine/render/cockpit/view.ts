// The view from the pilot's seat: gathers what the cockpit's instruments show from the scene, and
// lays the hull's own cockpit over the frame.

import { clamp } from '../../util/math'
import { ceilingOf } from '../../params'
import type { Jet } from '../../jet/jet'
import { hostile } from '../../sim/combat'
import { focus } from '../../sim/ejection'
import { fillOf, unitsIn } from '../../sim/cargo'
import type { SceneState } from '../../state'
import { NM, NSHIFT } from '../../world/world'
import { cockpitIn } from '../view'
import { grounded } from '../../sim/landing'
import { CUT } from '../../data/loop'
import { AIR, CRUISE } from '../../data/space'
import { CRUISE_OFF, CRUISE_SPOOL } from '../../sim/space'
import { RESOURCES } from '../../data/resources'
import { leftIn, nameOf } from '../../sim/mining'
import { stockOf } from '../../sim/traces'
import { pack } from '../../util/color'
import { oreLight } from '../mining'
import { ORE_ICONS } from '../oreicons'

/** px: the height the cockpit's altimeter reads at the top of a world's air, on the way down or up (it shows ten times it) */
const AIR_TOP = 9000
import { buildCockpit } from './build'
import { drawCockpit } from './draw'
import type { CockpitLive } from './types'
import { targetInfo } from '../targetinfo'

/** the player's markings colour, its tones darkest first (the cockpit's trim is painted in it) */
function accentOf(scene: SceneState) {
  const pal = scene.paint.jet
  const out: number[] = []
  for (let t = 0; t < 6; t++) out.push(pal[17 + t])
  return out
}

/** the cockpit fitted to the frame: once per hull, size and paint */
function cockpitArt(scene: SceneState) {
  const { w: W, h: H } = scene.screen
  const hull = scene.mesh.model.name
  let art = scene.cockpitArt
  if (!art || art.W !== W || art.H !== H || art.hull !== hull) art = scene.cockpitArt = buildCockpit(hull, W, H, accentOf(scene))
  return art
}

/** the cockpit must be fitted again (a new size, a new ship or new colours): it is done shortly, not this instant */
export function invalidateCockpit(scene: SceneState) {
  scene.cockpitArt = null
  scene.cockpitDue = 0.3
}

/** fits the cockpit ahead of time, so the first frame in it does not stall */
export function prepareCockpit(scene: SceneState, dt: number) {
  if (scene.cockpitArt || scene.screen.w === 0) return
  scene.cockpitDue -= dt
  if (scene.cockpitDue <= 0) cockpitArt(scene)
}

/** the rows of the frame from which down the cockpit hides the world (the frame's height when it is not in place) */
export function cockpitClear(scene: SceneState) {
  if (cockpitIn(scene.view) < 1) return scene.screen.h
  return cockpitArt(scene).clear
}

/** the ore in the laser's reach, for the panel's screen (null: none) */
function oreLive(scene: SceneState): CockpitLive['ore'] {
  const m = scene.loop.mining
  const o = m.target
  if (!o || m.cut.id < 0) return null
  const r = RESOURCES[o.ore]
  return {
    icon: ORE_ICONS[o.ore]?.small ?? null,
    name: nameOf(o.ore),
    light: oreLight(o.ore),
    cols: r.colours.map((c) => pack(c[0], c[1], c[2])),
    cut: clamp(m.cut.cut / Math.max(1, m.cut.batch), 0, 1),
    batch: m.cut.batch,
    on: m.cut.on,
    freed: scene.time - m.cut.doneAt < CUT.flash,
    left: leftIn(scene, o),
    stock: scene.zone.kind === 'space' ? o.stock : stockOf(scene, o.stock),
  }
}

// scratch: the other ships as the radar shows them
const blips: number[] = []

export function drawCockpitView(scene: SceneState) {
  const { params: p, view, flight, jets, time, boost } = scene
  const lead = focus(scene)
  // the panel and the frame slide into place over the later part of the move
  const inPlace = cockpitIn(view)
  if (inPlace <= 0) return
  const sn = Math.sin(lead.yaw)
  const cs = Math.cos(lead.yaw)
  // the wingmen, then everyone else
  blips.length = 0
  const blip = (j: Jet) => {
    if (j.away) return
    const ex = j.x - lead.x
    const ey = j.y - lead.y
    blips.push(ex * cs + ey * sn, ex * sn - ey * cs, j.fighter && hostile(j.fighter) ? 1 : 0)
  }
  for (let i = 1; i < jets.length; i++) blip(jets[i])
  for (const s of scene.ships) blip(s.jet)
  /** what the radar sees at an offset from the ship: 0 sea, 1 shallows, 2 land, 3 high ground */
  const matMap = scene.world.mat
  const radarLand = (right: number, ahead: number) => {
    const m = matMap[((((lead.y + right * sn - ahead * cs) | 0) & NM) << NSHIFT) | (((lead.x + right * cs + ahead * sn) | 0) & NM)]
    return m >= 12 ? 3 : m >= 4 ? 2 : m >= 2 ? 1 : 0
  }
  const own = jets[0].fighter
  const air = scene.travel.kind === 'down' || scene.travel.kind === 'out'
  const t = scene.sights.target ?? own?.seeker ?? null
  const hold = scene.loop.hold
  const live: CockpitLive = {
    time,
    inPlace,
    roll: view.roll,
    pitch: lead.pitch,
    heading: lead.yaw,
    speed: scene.speed,
    speedMax: p.speed * clamp(p.boost, 1, 4) * 1.08,
    throttle: scene.throttle,
    // (on the way down or up through a world's air, the height falls from the top of its air to the ground, smoothly
    // through the moment the zone changes: it read the plane's height in space, then jumped)
    alt:
      air && scene.travel.e < AIR.ground
        ? scene.travel.high + (AIR_TOP - scene.travel.high) * (1 - scene.travel.e / AIR.ground) ** 2
        : lead.z,
    altMax: Math.max(p.altitude, ceilingOf(p)),
    climb: clamp(flight.climbTilt / 0.5, -1, 1),
    boost,
    space: scene.zone.kind === 'space' && !air,
    pivotY: scene.pivotY,
    // the head sways with the flying, and shudders while the thrusters are open
    headX: flight.headX,
    headY: flight.headY + (boost > 0.2 ? ((((time * 30) | 0) & 1) - 0.5) * 1.5 * boost : 0),
    land: radarLand,
    blips,
    jet: scene.mesh.top,
    hull: own ? clamp(own.hull / own.stats.hull, 0, 1) : 1,
    shield: own ? clamp(own.shield / Math.max(1, own.stats.shield), 0, 1) : 1,
    heat: own ? own.heat : 0,
    jammed: own ? own.jam > 0 : false,
    missiles: own ? own.missiles : 0,
    missilesMax: own ? own.stats.missiles : 0,
    mines: own ? own.mines : 0,
    minesMax: own ? own.minesMax : 0,
    target:
      t && t.alive && !t.jet.away
        ? {
            top: t.mesh.top,
            hull: clamp(t.hull / t.stats.hull, 0, 1),
            d: Math.hypot(t.jet.x - lead.x, t.jet.y - lead.y),
            lock: own && own.seeker === t ? own.lock : 0,
          }
        : null,
    picked: targetInfo(scene),
    ore: oreLive(scene),
    hold: unitsIn(hold),
    holdMax: fillOf(hold) > 0 ? unitsIn(hold) / fillOf(hold) : hold.slots.length * 10,
    accent: accentOf(scene),
    // (out of his seat, the ship's instruments are not his to see: they show as they are)
    power: scene.power.level,
    rising: scene.power.on,
    safe: grounded(scene),
    cruise:
      scene.zone.kind !== 'space' || scene.space.cruise === CRUISE_OFF
        ? null
        : scene.space.cruise === CRUISE_SPOOL
          ? { spool: clamp((scene.time - scene.space.cruiseAt) / CRUISE.spool, 0, 1), pace: 0 }
          : { spool: 1, pace: scene.space.pace },
  }
  drawCockpit(scene.screen.fb, cockpitArt(scene), live, Math.max(1, Math.round(p.hudScale)))
}
