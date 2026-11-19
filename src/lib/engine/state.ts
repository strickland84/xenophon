// Everything a running scene knows, in one place. The simulation (sim/) changes it a step
// at a time; the renderer (render/) reads it to draw a frame. Nothing else holds state, so
// a scene can be understood — or saved, or inspected — by looking here.

import type { Jet } from './jet/jet'
import type { JetMesh } from './jet/mesh'
import type { SceneParams } from './params'
import type { CockpitArt } from './render/cockpit/types'
import { createFrame } from './render/frame'
import type { Frame } from './render/frame'
import { FLAME_F, FLAME_MAX } from './render/jet'
import { createPaint } from './render/paint'
import type { ShipPaint } from './render/paint'
import { createPalettes } from './render/palettes'
import type { Palettes } from './render/palettes'
import { createView } from './render/view'
import type { View } from './render/view'
import { createRig } from './sim/camera'
import type { CameraRig } from './sim/camera'
import type { WorldRecipe } from './galaxy/recipe'
import { createWeather } from './sim/hazards'
import type { Weather } from './sim/hazards'
import type { Fighter } from './sim/combat'
import { createControls } from './sim/controls'
import type { Controls } from './sim/controls'
import { createEffects } from './sim/effects'
import type { Effects } from './sim/effects'
import { createEjection } from './sim/ejection'
import type { Ejection } from './sim/ejection'
import { createSights } from './sim/fight'
import { createTargeting } from './sim/target'
import type { Targeting } from './sim/target'
import type { Sights } from './sim/fight'
import { createFlight } from './sim/flight'
import type { Flight } from './sim/flight'
import { createGuns } from './sim/guns'
import type { Guns } from './sim/guns'
import { createMissiles } from './sim/missiles'
import type { Missile } from './sim/missiles'
import { createMines } from './sim/mines'
import type { Mines } from './sim/mines'
import { createParticles } from './sim/particles'
import type { Particles } from './sim/particles'
import { createRoom } from './sim/room'
import type { Room } from './sim/room'
import type { Ship } from './sim/ships'
import { createSkirmish } from './sim/skirmish'
import { createLoop } from './sim/loop'
import { createPower } from './sim/power'
import type { Power } from './sim/power'
import type { Loop } from './sim/loop'
import type { FitEffect } from './data/loadout'
import { fitFor, meshFor } from './sim/outfit'
import type { Skirmish } from './sim/skirmish'
import { createWorld } from './world/world'
import { createFoot } from './sim/foot'
import type { Foot } from './sim/foot'
import type { OtherWalker } from './sim/walkers'
import { createSignals } from './sim/signals'
import type { Signals } from './sim/signals'
import { lookOf } from './races/races'
import type { World } from './world/world'
import type { ZoneKind } from './sim/zone'
import { createSpace } from './sim/space'
import type { Space } from './sim/space'
import { createTravel } from './sim/travel'
import { createRepair } from './sim/repair'
import type { Repair } from './sim/repair'
import { createDaylight } from './sim/daylight'
import type { Daylight } from './sim/daylight'
import { createTraces } from './sim/traces'
import type { Traces } from './sim/traces'
import type { Travel } from './sim/travel'
import { createInterior } from './sim/interior'
import { createSquad } from './sim/squad'
import { gearOf } from './data/gear'
import type { GearEffect } from './data/gear'
import type { Squad } from './sim/squad'
import type { Interior } from './sim/interior'
import type { GuideMark } from './sim/guide'
import { createHudFx } from './sim/hudfx'
import type { HudFx } from './sim/hudfx'
import { createBands } from './sim/bands'
import { createWild } from './sim/creatures'
import type { Wild } from './sim/creatures'
import type { Bands } from './sim/bands'
import { createTraffic } from './sim/traffic'
import type { Traffic } from './sim/traffic'

/** which zone the scene is in (sim/zone.ts) */
export interface ZoneState {
  kind: ZoneKind
}

/**
 * Smooth flames are not drawn into the picture: a layer over it draws them (display/flame-layer.ts).
 * The renderer only measures them. For each flame (one an engine), FLAME_F numbers:
 * nozzle x y, a point straight behind it x y, tip x y (frame px), radius at the nozzle,
 * how much larger things are at the tip, thrust 0..1, strength 0..1, how much of the nozzle,
 * middle and tip can be seen, which flame it is, the afterburner setting, its true
 * length in nozzle radii, and the colour it burns (r g b, 0..1).
 */
export interface FlameList {
  count: number
  data: Float32Array
}

export interface SceneState {
  params: SceneParams

  // ── what the scene is made of
  /** the zone it is in: a world's surface, or a system's space */
  zone: ZoneState
  /** the player's ship (and its wingmen): its shape and its colours */
  mesh: JetMesh
  paint: ShipPaint
  world: World
  /** the world's recipe, if it is a world of the galaxy (null: the island world of the settings' seed and land) */
  planet: WorldRecipe | null
  /** the name of the world built (sim/planet.ts), and a world built elsewhere and handed in, to be used when it is wanted */
  worldKey: string
  given: { key: string; world: World } | null
  /** scene seconds it arrived at the world it is over (its name is shown for a few seconds) */
  arrivedAt: number
  /** the world's colours */
  pal: Palettes

  // ── the simulation
  /** seconds the scene has been running, and seconds since the intro began */
  time: number
  introT: number
  /** px between the jet's slices right now (it eases to the setting) */
  spread: number
  /** 0..1: the afterburner, eased in after the intro */
  burn: number
  /** 0..1: how hard the thrusters are being pushed */
  boost: number
  /** 0..1: the throttle, as the pilot set it (0 the ship hangs still, 1 its full cruising speed; the thrusters go beyond) */
  throttle: number
  /** scene seconds the throttle was last moved (the HUD says how far open it is for a moment after) */
  throttleAt: number
  /** the ship's power: switched on or off, and how far it has come up (sim/power.ts) */
  power: Power
  /** how fast the leader is flying, px per second; and how fast it would with the throttle open and the thrusters shut */
  speed: number
  fullSpeed: number
  /** the leader first, then its wingmen */
  jets: Jet[]
  /** every ship the player does not fly, each with a hull and paint of its own, and the number the next one will be given */
  ships: Ship[]
  nextShip: number
  controls: Controls
  flight: Flight
  eject: Ejection
  particles: Particles
  rig: CameraRig

  // ── the fighting
  /** every ship that can fight and is in the air this step (gathered afresh each step) */
  fighters: Fighter[]
  /** the cannon's shots in flight, and the missiles */
  guns: Guns
  missiles: Missile[]
  /** mines hanging in the air (sim/mines.ts) */
  mines: Mines
  /** what the player's sights are on */
  sights: Sights
  /** what the pilot has picked with the target key, and the key itself (sim/target.ts) */
  target: Targeting
  /** sparks, flashes, explosions, wrecks going down, and the sounds the page is to play */
  effects: Effects
  /** the waves, the score */
  skirmish: Skirmish
  /** per wingman (by his place in `jets`): seconds until another comes to replace him, once he has been shot down */
  wingReturn: number[]
  /** the sky shared with other games: whether it is, who flies the computer's ships, what must be told, the kill feed */
  room: Room
  /** seconds until the world is rebuilt (it waits for a slider to settle), and whether the jets then move to the new start, or arrive afresh at another world */
  worldDirty: number
  reseat: boolean
  arriving: boolean
  /** the wind, lightning, and the burns of lava and acid (sim/hazards.ts) */
  weather: Weather
  /** the core loop: the hold, landing, mining, chunks and crates, the bases' turrets, what happened to the player's property (sim/loop.ts) */
  loop: Loop
  /** what the weapons and modules fitted to the player's ship do (data/loadout.ts) */
  parts: FitEffect
  /** the pilot out of his ship: on foot, coming down, or dead; his backpack, his called ship, the veins (sim/foot.ts) */
  foot: Foot
  /** other pilots on foot (sim/walkers.ts) */
  walkers: OtherWalker[]
  /** flares in the sky and beacons in the ground (sim/signals.ts) */
  signals: Signals
  /** a star system's space, while the scene is in it: its bodies, the cruise drive, gravity, docking (sim/space.ts) */
  space: Space
  /** going from one zone to another: climbing out of a world, going down to one, a jump (sim/travel.ts) */
  travel: Travel
  /** the hull mended where the ship stands, at a friendly base or station (sim/repair.ts) */
  repair: Repair
  /**
   * How each world has been turned on for this pilot, by its galaxy index: a turn of its whole globe (a 3×3 matrix row by
   * row; sim/travel.ts turnedOn). A world he climbs out of is turned, as he rises through its air, to bring the place he
   * left up to the side that faces space's plane: its ground stays under his ship all the way up, and he comes out over
   * it. So a world's hour, and which way up it is, are his own; nothing else in the galaxy goes by them.
   */
  spun: Record<number, Float64Array>
  /** the light where the pilot is on a world of the galaxy, as its day turns (sim/daylight.ts) */
  daylight: Daylight
  /** what the gear the pilot wears does on foot (data/gear.ts) */
  gear: GearEffect
  /** the player's squad: its other pilots, and the slipstream (sim/squad.ts) */
  squad: Squad
  /** the places inside: the hangar, the station deck, a ship's rooms (sim/interior.ts) */
  interior: Interior
  /** the persistent world as the page last said it stands (holders, this world's traces), and what the player did that it will remember (sim/traces.ts) */
  traces: Traces
  /** the page's mark on the world for "go here" (the first sortie's guide; sim/guide.ts), or null */
  guide: GuideMark | null
  /** what the HUD shows a moment behind the truth, so changes are seen (sim/hudfx.ts) */
  hudFx: HudFx
  /** the computer's ships that belong to places: raider bands, a derelict's drones, patrols (sim/bands.ts) */
  bands: Bands
  /** the wildlife of the world the pilot walks on: its groups, the creatures up, their globs, what they dropped (sim/creatures.ts) */
  wild: Wild
  /** haulers going about their business between stations, worlds and gates (sim/traffic.ts) */
  traffic: Traffic

  // ── drawing
  view: View
  /** the frame that is shown */
  screen: Frame
  /** the cockpit view is drawn on this larger square sheet and then turned (the horizon rolls) */
  sheet: Frame
  /** the screen row the cockpit view rolls about */
  pivotY: number
  /** the row the picture is turned about this frame when the view is rolled: the seat's (`pivotY`), or from behind the row the ship sits on (render/renderer.ts) */
  pivotNow: number
  /** the cockpit's fixed metalwork, painted once per size and colour scheme … */
  cockpitArt: CockpitArt | null
  /** … and seconds until it is (re)painted: it is done ahead of time, never mid-move */
  cockpitDue: number
  flames: FlameList
}

/** what the player's fitted weapons and modules do together */
export type PartsEffect = FitEffect
export const partsOf = (p: SceneParams): PartsEffect => fitFor(p)

export function createState(initial: SceneParams): SceneState {
  const params = { ...initial }
  const rig = createRig(params)
  const view = createView()
  view.alt = params.altitude
  view.chase = rig.wChase[2]
  view.cockpit = rig.wCockpit[2]
  return {
    params,
    zone: { kind: 'surface' },
    mesh: meshFor(params),
    paint: createPaint(),
    world: createWorld(),
    planet: null,
    worldKey: '',
    given: null,
    arrivedAt: 0,
    pal: createPalettes(),
    time: 0,
    introT: 0,
    spread: params.spread,
    burn: 0,
    boost: 0,
    throttle: 1,
    throttleAt: -99,
    power: createPower(),
    speed: params.speed,
    fullSpeed: params.speed,
    jets: [],
    ships: [],
    nextShip: 1,
    controls: createControls(),
    flight: createFlight(params),
    eject: createEjection(),
    particles: createParticles(),
    rig,
    fighters: [],
    guns: createGuns(),
    missiles: createMissiles(),
    mines: createMines(),
    sights: createSights(),
    target: createTargeting(),
    effects: createEffects(),
    skirmish: createSkirmish(),
    wingReturn: [0, 0, 0],
    room: createRoom(),
    worldDirty: 0,
    reseat: false,
    arriving: false,
    weather: createWeather(null),
    loop: createLoop(params.hull, partsOf(params).slots),
    parts: partsOf(params),
    foot: createFoot(lookOf(params.look, params.side)),
    walkers: [],
    signals: createSignals(),
    space: createSpace(),
    travel: createTravel(),
    repair: createRepair(),
    spun: {},
    daylight: createDaylight(),
    traces: createTraces(),
    guide: null,
    hudFx: createHudFx(),
    bands: createBands(),
    wild: createWild(),
    traffic: createTraffic(),
    interior: createInterior(),
    squad: createSquad(),
    gear: gearOf(params.gear),
    view,
    screen: createFrame(0, 0),
    sheet: createFrame(0, 0),
    pivotY: 0,
    pivotNow: 0,
    cockpitArt: null,
    cockpitDue: 0.3,
    flames: { count: 0, data: new Float32Array(FLAME_MAX * FLAME_F) },
  }
}
