// Ships the player does not fly: other pilots, and the computer's. Each has a hull and paint
// of its own. They are placed and steered through updateShip: from outside the simulation
// (Scene.addShip, Scene.updateShip), or by the computer's pilots (pilots.ts). Between one
// update and the next, each flies straight on along its heading at its speed, so a ship that
// is told where it is only now and then still moves smoothly. A ship given a side can fight:
// it can be shot, and shot down. A ship another game owns (`remote`: another player's, or the
// computer's flown elsewhere) is fought here too, but what happens to it is that game's to say
// (room.ts). A ship can carry a callsign and a faction mark, drawn over it, and its pilot can be
// out of it, hanging under his parachute.

import { jetSize, makeJet, sliceSpread } from '../jet/jet'
import type { Jet } from '../jet/jet'
import { fittedMesh } from '../jet/fit'
import { readMake } from './outfit'
import type { JetMesh } from '../jet/mesh'
import { createPaint, paintShip } from '../render/paint'
import type { ShipColours, ShipPaint } from '../render/paint'
import type { SceneState } from '../state'
import { pack, parseColor } from '../util/color'
import { clamp, wrapAngle } from '../util/math'
import { DRILL, skillAt, waveOf } from '../data/skirmish'
import { createFighter, SHIP } from './combat'
import { createBrain, LURK, PATROL } from './pilots'
import { bandOf, payOf } from './bands'
import { leaveTrail } from './flight'
import { createWalker } from './foot'
import type { Walker } from './foot'
import { paintLook } from '../races/look'
import { lookOf, lookText } from '../races/races'

export interface Ship {
  /** the number the scene's caller knows it by */
  id: number
  /** where it is and which way it points, and the trails it leaves */
  jet: Jet
  colours: ShipColours
  /** its shape (which says which hull it is) and its colours, as the renderer wants them */
  mesh: JetMesh
  paint: ShipPaint
  /** px per second, along its heading */
  speed: number
  /** 0..1: how hard its engines are pushed (longer flames) */
  thrust: number
  /** its heading at the last step, to tell how fast it is turning */
  lastYaw: number
  /** its guns are firing (a ship flown from outside: the game that owns it says so) */
  firing: boolean
  /** the callsign over it ('' none), its faction mark (0 none, 1 triangle, 2 diamond) and the mark's colour */
  label: string
  mark: number
  markColor: number
  /** its pilot has left it for a while (the tab is hidden): marked so */
  idle: boolean
  /** its pilot is out of it, under his parachute: he is drawn, the ship is not */
  out: boolean
  /** the side it was last given (−1 none): kept while its pilot is out, for the colour of his callsign */
  side: number
  /** the skirmish wave whose pilots' skill the computer flies it with (0: it is not the computer's) */
  wave: number
  /** another pilot's: how full his hold is (0..1), whether he is landing, landed or lifting off (sim/landing.ts's stages), and the outcrop his laser is cutting (−1 none) */
  loaded: number
  landing: number
  mining: number
  /** seconds to its next puff of dust, landing */
  dust: number
  /** standing empty where its pilot left it (its canopy open): it can be shot, and an enemy pilot on foot can climb in */
  parked: boolean
  /** its pilot, as he looks out of it (his race and colours: under his parachute) */
  walker: Walker
  /** how it is fitted and painted beyond its colours (sim/outfit.ts makeText) */
  make: string
  /** a training drone (ShipInput.drill) */
  drill: boolean
  /** the band it flies in (sim/bands.ts; −1 none), and whose patrol it is ('' nobody's) */
  band: number
  faction: string
  /** a hauler going about its business (sim/traffic.ts): no one's to fight, moved by the clock */
  traffic: boolean
}

/** a ship the player does not fly, as the scene is told about it; when one is updated, anything left out stays as it was */
export interface ShipInput {
  /** where it is on the map, px */
  x: number
  y: number
  /** px above the sea */
  height: number
  /** radians: 0 flies up the map, and it grows turning to the right */
  heading: number
  /** radians: a positive roll dips the right wing */
  roll: number
  /** radians: a positive pitch raises the nose */
  pitch: number
  /** px per second, along its heading */
  speed: number
  /** 0..1: how hard its engines are pushed */
  thrust: number
  /** which ship: a name from jet/models */
  hull: string
  /** its colours; any left out are the hull's own */
  paint: Partial<ShipColours>
  /** which side it fights on: 0 the player's, 1 against him, −1 neither (it cannot be shot) */
  side: number
  /** the computer flies it (and fights, if it has a side), as well as the pilots of skirmish wave `pilot` do; 0: it is flown from outside */
  pilot: number
  /** another game owns it: hits on it are reported (Scene.takeReports), not done here, and its guns only show */
  remote: boolean
  /** its guns are firing */
  firing: boolean
  /** a full roll: how far through it is (0..1; −1 none), and which way (1 right, −1 left) */
  spin: number
  spinDir: number
  /** 0..1: its hull and shield left, and seconds of a new ship's protection left */
  hullLeft: number
  shieldLeft: number
  protect: number
  /** a callsign shown over it (capitals, figures, a hyphen), its faction mark (0 none, 1 triangle, 2 diamond) and the mark's colour */
  label: string
  mark: number
  markColor: string
  /** its pilot has left the game for a while */
  idle: boolean
  /** its pilot is out of it under his parachute: drawn as a pilot, not a ship, and it cannot be fought */
  out: boolean
  /** what shooting it down scores, as a share of its hull's points */
  worth: number
  /** another pilot's hold, how full (0..1); whether he is landing (1), landed (2) or lifting off (3); the outcrop his laser cuts (−1 none) */
  loaded: number
  landing: number
  mining: number
  /** standing empty where its pilot left it */
  parked: boolean
  /** its pilot's look (races/races.ts lookText) */
  look: string
  /** how it is fitted and painted beyond its colours: weapons, modules, pattern, emblem, mark (sim/outfit.ts makeText; '' plain) */
  make: string
  /**
   * A training drone, put up by the page for a new pilot to shoot (the first sortie): only this game
   * knows of it, so nothing about it is ever told to another (the network leaves it out). Flown by the
   * computer (give it a `pilot`), it circles the spot it was put at, never goes for anyone and never
   * fires; downing it scores, but pays nothing and is no deed the galaxy remembers.
   */
  drill: boolean
  /** the band of the zone it flies in (sim/bands.ts BandPlan.id; −1 none): flown as that band's pilots fly, and paying as they pay */
  band: number
  /** lying in wait (another game's band ship, as that game says): hidden from the radar but close by */
  lurk: boolean
}

/** a colour given as text, packed as the frame keeps it */
function colourOf(text: string) {
  const [r, g, b] = parseColor(text, [255, 255, 255])
  return pack(r, g, b)
}

/** the colours a hull was drawn in */
const HULL_COLOURS: ShipColours = { body: '#545969', accent: '#f0580e', canopy: '#1e8ca0' }

export function createShip(scene: SceneState, id: number, input: Partial<ShipInput>): Ship {
  const ship: Ship = {
    id,
    jet: makeJet(0, 0, 0, 0),
    colours: { ...HULL_COLOURS, ...input.paint },
    mesh: fittedMesh(readMake(input.hull ?? '', input.make ?? '')),
    make: input.make ?? '',
    paint: createPaint(),
    speed: 0,
    thrust: 0,
    lastYaw: 0,
    firing: false,
    label: '',
    mark: 0,
    markColor: 0,
    idle: false,
    out: false,
    side: -1,
    wave: 0,
    loaded: 0,
    landing: 0,
    mining: -1,
    dust: 0,
    parked: false,
    walker: createWalker(lookOf(input.look ?? ''), -1),
    drill: false,
    band: -1,
    faction: '',
    traffic: false,
  }
  paintLook(ship.walker.paint, ship.walker.look, scene.params.timeOfDay)
  paintShip(ship.paint, ship.mesh.model, ship.colours, scene.params.timeOfDay)
  updateShip(scene, ship, input)
  ship.lastYaw = ship.jet.yaw
  ship.jet.lastTrailX = ship.jet.x
  ship.jet.lastTrailY = ship.jet.y
  return ship
}

/** tells a ship where it is now, how it is flying, or how it looks */
export function updateShip(scene: SceneState, ship: Ship, input: Partial<ShipInput>) {
  const j = ship.jet
  if (input.x !== undefined) j.x = input.x
  if (input.y !== undefined) j.y = input.y
  if (input.height !== undefined) j.z = input.height
  if (input.heading !== undefined) j.yaw = input.heading
  if (input.roll !== undefined) j.roll = input.roll
  if (input.pitch !== undefined) j.pitch = input.pitch
  if (input.speed !== undefined) ship.speed = input.speed
  if (input.thrust !== undefined) ship.thrust = clamp(input.thrust, 0, 1)
  if (input.firing !== undefined) ship.firing = input.firing
  if (input.spin !== undefined) {
    j.stunt = input.spin < 0 ? -1 : clamp(input.spin, 0, 0.999)
    j.stuntDelay = 0
  }
  if (input.spinDir !== undefined) j.stuntDir = input.spinDir < 0 ? -1 : 1
  if (input.label !== undefined) ship.label = input.label
  if (input.mark !== undefined) ship.mark = input.mark
  if (input.markColor !== undefined) ship.markColor = colourOf(input.markColor)
  if (input.idle !== undefined) ship.idle = input.idle
  if (input.loaded !== undefined) ship.loaded = input.loaded
  if (input.landing !== undefined) ship.landing = input.landing
  if (input.mining !== undefined) ship.mining = input.mining
  if (input.look !== undefined && input.look !== lookText(ship.walker.look)) {
    ship.walker.look = lookOf(input.look)
    paintLook(ship.walker.paint, ship.walker.look, scene.params.timeOfDay)
  }
  if (input.parked !== undefined) {
    ship.parked = input.parked
    j.lid = input.parked ? 1 : 0
  }
  if (input.out !== undefined && input.out !== ship.out) {
    ship.out = input.out
    // out of it: nothing to fight (a new ship comes with a side again)
    if (ship.out) j.fighter = null
  }
  // a new hull or new paint: it is repainted
  if (input.make !== undefined) ship.make = input.make
  const mesh =
    input.hull !== undefined || input.make !== undefined ? fittedMesh(readMake(input.hull ?? ship.mesh.model.name, ship.make)) : ship.mesh
  const was = ship.colours
  const now = { ...was, ...input.paint }
  const keys = ['body', 'accent', 'canopy', 'trim', 'glow', 'trail', 'mark'] as const
  if (mesh !== ship.mesh || keys.some((k) => now[k] !== was[k])) {
    ship.mesh = mesh
    ship.colours = now
    paintShip(ship.paint, mesh.model, now, scene.params.timeOfDay)
  }
  // a side to fight on (or none)
  if (input.side !== undefined) ship.side = input.side
  if (input.side !== undefined && !ship.out) {
    const f = j.fighter
    if (input.side < 0) j.fighter = null
    else if (!f || f.side !== input.side || f.mesh !== ship.mesh) createFighter(SHIP, input.side, j, ship.mesh, ship.paint)
  } else if (j.fighter && j.fighter.mesh !== ship.mesh) {
    // rebuilt as another hull: a fighter of that hull, flown by the same pilot
    const was = j.fighter
    createFighter(SHIP, was.side, j, ship.mesh, ship.paint).brain = was.brain
  }
  // who owns it, how it stands, and what it is worth
  if (input.drill !== undefined) ship.drill = input.drill
  if (input.band !== undefined) {
    ship.band = input.band
    const plan = bandOf(scene, ship.band)
    ship.faction = plan?.kind === 'patrol' ? plan.faction : ''
  }
  const f = j.fighter
  if (f) {
    f.band = ship.band
    if (f.band >= 0) f.pay = payOf(bandOf(scene, f.band))
    if (input.lurk !== undefined) f.lurk = input.lurk
    // (a training drone goes down in a few hits)
    if (ship.drill && !f.drill) {
      f.stats = { ...f.stats, hull: DRILL.toughness, shield: 0 }
      f.hull = DRILL.toughness
      f.shield = 0
    }
    f.drill = ship.drill
    if (input.remote !== undefined) f.remote = input.remote
    if (input.hullLeft !== undefined) f.hull = clamp(input.hullLeft, 0, 1) * f.stats.hull
    if (input.shieldLeft !== undefined) f.shield = clamp(input.shieldLeft, 0, 1) * f.stats.shield
    if (input.protect !== undefined) f.protect = Math.max(0, input.protect)
    if (input.worth !== undefined) f.worth = input.worth
  }
  // a computer pilot (or none)
  if (input.pilot !== undefined && j.fighter) {
    ship.wave = Math.max(0, input.pilot)
    if (input.pilot > 0) {
      // (a band's pilots fly as well as their band does: data/bands.ts)
      const plan = bandOf(scene, ship.band)
      const skill = plan ? skillAt(plan.level) : waveOf(input.pilot).skill
      const b = createBrain(skill, ship.id * 7717 + input.pilot)
      b.wantYaw = j.yaw
      b.wantAlt = j.z
      b.attacker = !ship.drill
      // (a training drone keeps to the spot it was put at)
      if (ship.drill) b.home = { x: j.x, y: j.y, z: j.z }
      if (plan) {
        b.band = plan.id
        b.mode = plan.kind === 'patrol' ? PATROL : LURK
        if (!skill.missiles) j.fighter.missiles = 0
      }
      j.fighter.brain = b
    } else j.fighter.brain = null
  }
}

/** every ship's colours again, for a new time of day */
export function repaintShips(scene: SceneState) {
  for (const s of scene.ships) {
    paintShip(s.paint, s.mesh.model, s.colours, scene.params.timeOfDay)
    paintLook(s.walker.paint, s.walker.look, scene.params.timeOfDay)
  }
}

/** they fly on along their headings, feel their turns, and leave their trails */
export function stepShips(scene: SceneState, dt: number) {
  const p = scene.params
  const maxRate = Math.max(0.1, p.agility)
  for (const s of scene.ships) {
    const j = s.jet
    j.vx = Math.sin(j.yaw) * s.speed
    j.vy = -Math.cos(j.yaw) * s.speed
    j.x += j.vx * dt
    j.y += j.vy * dt
    // how fast it is turning, from how far its heading moved since the last step
    const turn = dt > 0 ? wrapAngle(j.yaw - s.lastYaw) / dt : 0
    s.lastYaw = j.yaw
    j.yawRate += (turn - j.yawRate) * (1 - Math.exp(-dt * 6))
    const gNow = clamp(Math.abs(j.yawRate) / maxRate + s.thrust * 0.9 + Math.abs(j.pitch) + (j.stunt >= 0 ? 0.7 : 0), 0, 1)
    j.g += (gNow - j.g) * (1 - Math.exp(-dt * 2.5))
    // a full roll, once begun, goes all the way round
    if (j.stunt >= 0) {
      j.stunt += dt / 0.85
      if (j.stunt >= 1) j.stunt = -1
    }
    // (a pilot under his parachute leaves no wingtip trails)
    if (!s.out) leaveTrail(j, s.mesh, jetSize(p), sliceSpread(scene.spread, scene.view.chase + scene.view.cockpit), scene.time)
    else j.trailLen = 0
  }
}
