// Sprite-stack fighter scene — a small software renderer with a flight model behind it.
//
// A scene has no idea what a canvas, a key or a mouse is: it is stepped with a time, told
// what the player is doing in a few plain numbers, and gives back a picture as bytes. The
// page around it (lib/components) turns real input into those numbers and shows the picture.
//
//   state.ts    everything a running scene knows
//   sim/        what happens: flight, wingmen, ejection, the camera
//   render/     how it is drawn: world, sky, jets, smoke, the cockpit
//   world/      the islands and clouds; jet/ the aircraft; util/ small helpers

import { shipKit } from './interior/rooms'
import { TILE, UP_IN_FLIGHT } from './data/interiors'
import type { Piece } from './data/interiors'
import { coloursOf, makeOf, meshFor } from './sim/outfit'
import { makeKey } from './jet/fit'
import type { SceneParams, ViewMode } from './params'
import { invalidateCockpit } from './render/cockpit/view'
import { createFrame } from './render/frame'
import { paintShip } from './render/paint'
import { renderScene } from './render/renderer'
import { updateView, viewIndex, viewName } from './sim/camera'
import { DAMAGE } from './data/weapons'
import { fitParts, ownFighter, shootDown } from './sim/combat'
import type { HeldControls, SceneAction } from './sim/controls'
import type { SoundEvent } from './sim/effects'
import { EJ_CHUTE, EJ_FLY, EJ_ROCKET, focus } from './sim/ejection'
import { INTRO_TIME, resetFlight, startRoll } from './sim/flight'
import { syncWingmen } from './sim/formation'
import { nearestThreat } from './sim/missiles'
import { createShip, repaintShips, updateShip } from './sim/ships'
import { mineEndFromAfar, mineFromAfar } from './sim/mines'
import { fitOf, furnish, goIn, goOut, setVisitors, toggleSeat } from './sim/interior'
import { gearOf } from './data/gear'
import { refitPack } from './sim/foot'
import type { InteriorUse } from './sim/interior'
import type { ShipInput } from './sim/ships'
import { addFeed, downFromAfar, endMissileFromAfar, fighterOf, hitFromAfar, missileFromAfar } from './sim/room'
import type { FeedLine, Report } from './sim/room'
import { FIGHT, OVER, REST, skirmishOn } from './sim/skirmish'
import { clearedHere, setCleared } from './sim/bands'
import { stepScene } from './sim/step'
import { createState, partsOf } from './state'
import type { FlameList, SceneState } from './state'
import { clamp } from './util/math'
import type { World } from './world/world'
import { groundAt } from './world/world'
import { buildPlanet, repaintWorld, worldKeyOf } from './sim/planet'
import { makeTurrets, startAtBase } from './sim/bases'
import { addItems, fillOf, refitHold } from './sim/cargo'
import type { Items, Stack } from './sim/cargo'
import { crateChanged, spill } from './sim/crates'
import { FLYING, grounded, LANDED, LANDING, LIFTING } from './sim/landing'
import { powerState } from './sim/power'
import { friendly, nearestBase, setRound, wrapDelta } from './sim/loop'
import type { LedgerEntry } from './sim/loop'
import { leftIn, takeFrom, throwChunk } from './sim/mining'
import { repairStatus } from './sim/repair'
import type { BaseOwner } from './world/features'
import { FOOT } from './data/foot'
import { parseColor, pack } from './util/color'
import { lookText } from './races/races'
import {
  ABOARD,
  BOARDING,
  DEAD,
  dive,
  FALLING,
  footPrompt,
  lookFromParams,
  repaintWalker,
  SHIP_PARKED,
  stealFailed,
  stealGranted,
  walkerFighter,
  WALKING,
  yieldShip,
  zoomOf,
} from './sim/foot'
import { createOtherWalker, repaintWalkers, updateWalker, walkerDied } from './sim/walkers'
import type { WalkerInput } from './sim/walkers'
import { launchFlare, plantBeacon } from './sim/signals'
import { nearestVein, takeFromVein, veinLeft } from './sim/veins'
import { beastKilled, wildCount } from './sim/creatures'
import { surfaceById, systemOfKey, theGalaxy } from './galaxy/galaxy'
import {
  aim,
  courseAim,
  CRUISE_OFF,
  CRUISE_ON,
  CRUISE_SPOOL,
  inSpace,
  placeBodies,
  shipCame,
  shipLeft,
  toggleCruise,
  worldUnder,
} from './sim/space'
import { startInSpace } from './sim/travel'
import { fireOf } from './sim/air'
import { friendlyStations } from './sim/stations'
import { oreRocks, rockOfId } from './sim/belts'
import { giveMap, wanted } from './space/maps'
import { giveLand, wantedLands } from './world/lands'
import type { Terrain } from './world/lands'
import type { SphereMap } from './space/maps'
import { looping } from './sim/loop'
import { capturePoint, holderHere, hotspotHere, phraseOf, recordGhost, setTraces } from './sim/traces'
import type { Deed, Mark, TracesInput } from './sim/traces'
import { CAPTURE } from './data/territory'
import type { GuideMark } from './sim/guide'
import { setTarget } from './sim/target'
import type { TargetRef } from './sim/target'
import { targetStatus } from './render/targetinfo'
import type { TargetStatus } from './render/targetinfo'

export type { Deed, GuideMark, InteriorUse, Items, LedgerEntry, Mark, Stack, TracesInput, WalkerInput }

export interface Scene {
  /** new settings; anything that needs rebuilding (the world, the colours) is rebuilt */
  setParams(next: SceneParams): void
  /** the size of the picture, in frame pixels */
  resize(w: number, h: number): void

  /** the pointer is at (x, y), in frame pixels: the jet steers towards it */
  pointerMove(x: number, y: number): void
  pointerLeave(): void
  /** what the player is holding down, from every device added together: steering, the thrusters, the guns */
  setControls(held: HeldControls): void
  /** something the player pressed once: a full roll, land / board / use, or on to the next view (overhead → behind the jet → cockpit → overhead) */
  act(action: SceneAction): void
  /** the throttle moved by so much (−1 … +1: a mouse's wheel, a notch at a time), or set outright (0..1) */
  throttleBy(amount: number): void
  setThrottle(level: number): void
  replayIntro(): void

  /** a ship the player does not fly (another pilot's, or the computer's) joins the scene: returns the number to update it by */
  addShip(ship: Partial<ShipInput>): number
  /** tells a ship where it is now, how it is flying, or how it looks: anything left out stays as it was */
  updateShip(id: number, change: Partial<ShipInput>): void
  removeShip(id: number): void
  /** every ship in the scene, as it stands (for the network: the computer's ships this game flies for a shared sky) */
  listShips(): ShipState[]

  // ── a sky shared with other games (sim/room.ts): what must be told, and what they decide
  /** whether others share this sky, and whether this game flies the computer's ships and sends the waves (with the wave to go on from); and which bands here the host says are beaten */
  setRoom(room: RoomSettings): void
  /** the bands of this zone beaten and not yet back (band ids, and the moment each is back, UTC seconds): for the host to tell the room */
  clearedBands(): { band: number; until: number }[]
  /** what other games must be told since the last call (hits on their ships, losses of this game's own, missiles); the list is emptied */
  takeReports(): Report[]
  /** another game's shot struck ship `target` (0: the player; with `foot`, the player on foot rather than his ship) for `amount`, at (dx, dy, dz) from its middle; `by` fired it (−1: unknown) */
  hit(target: number, amount: number, by: number, dx: number, dy: number, dz: number, hull: boolean, foot?: boolean): void
  /** a ship another game owns was lost, downed by `by` (0: the player; −1 nobody); `worth` scales what the player scores for it */
  shootDown(target: number, by: number, worth?: number): void
  /** a ship another game owns fired a missile at `target` (0: the player): returns the missile's number here (0: none) */
  launchMissile(from: number, target: number): number
  /** the game that owns a missile's target says it burst at (x, y, z), or was dodged */
  endMissile(tag: number, x: number, y: number, z: number, dodged: boolean): void
  /** a line for the kill feed */
  addFeed(line: FeedLine): void
  /** the player's squad: formed or not, and the other pilots in it (their ships' ids here); his wingmen fill it */
  setSquad(squad: { on: boolean; mates: { id: number; callsign: string }[] }): void
  /** another game's ship `owner` dropped its mine `tag` at (x, y, z): it shows here; and that game says it burst */
  addMine(owner: number, tag: number, x: number, y: number, z: number): void
  endMine(owner: number, tag: number): void

  // ── the loop (sim/loop.ts): the hold, landing and banking, the ore, crates
  /** the time now, seconds since 1970 (UTC): outcrops come back on this clock, the same for every player */
  setClock(utcSeconds: number): void
  /** what happened to the player's property since the last call (mined, banked, lost, taken, earned, paid); the list is emptied */
  takeLedger(): LedgerEntry[]
  /** puts resources into the hold (from the vault, at a base): returns what did not fit */
  loadHold(items: Items): Items
  /** empties one slot of the hold (into the vault, at a base): returns what was in it */
  unloadSlot(slot: number): Items
  /** at a base: the hull mended (`repair`), and missiles added (as many as the rack holds at most) */
  refit(what: { repair?: boolean; missiles?: number }): void
  /** the credits the pilot has to spend: repairs done where the ship stands (the mining key held at a friendly base or station) go no further than this, and what they come to is in the ledger ('repair') */
  setPurse(credits: number): void
  /** another game says its laser took `n` units from outcrop `outcrop` in its period `epoch`: the ore shows coming out, and is gone here too */
  mined(outcrop: number, epoch: number, n: number): void
  /** another game's ship was lost and spilled a crate here: returns its number here */
  addCrate(x: number, y: number, z: number, items: Items): number
  /** another game says crate `tag` (this scene's number) has only `left` in it now (nothing: it is gone) */
  crateChanged(tag: number, left: Items): void
  /** units left in outcrop `id` of the world now (−1: no such outcrop) */
  oreLeft(id: number): number

  // ── on foot (sim/foot.ts, walkers.ts, signals.ts, veins.ts)
  /** another pilot on foot (or coming down after ejecting) joins the scene: returns the number to update him by (shared with ships) */
  addWalker(walker: Partial<WalkerInput>): number
  /** tells another pilot on foot where he is now and how he stands: anything left out stays as it was */
  updateWalker(id: number, change: Partial<WalkerInput>): void
  removeWalker(id: number): void
  /** every other pilot on foot in the scene, as he stands */
  listWalkers(): WalkerState[]
  /** another game says its pilot on foot, `id` here, was killed by `by` (an id here; −1 nobody); `worth` scales what the player scores for it */
  walkerDied(id: number, by: number, worth?: number): void
  /** another game's pilot cut `n` units from vein `vein` in its period `epoch` */
  veinMined(vein: number, epoch: number, n: number): void
  /** another pilot planted his beacon (`owner` names him: one each) at (x, y, z), with his callsign and his side's colour */
  addBeacon(owner: string, x: number, y: number, z: number, label: string, color: string): void
  /** another pilot fired a flare from (x, y, z) in his side's colour */
  addFlare(x: number, y: number, z: number, color: string): void
  /** another pilot is climbing into the player's parked ship: if it stands empty it is his (it leaves this scene), and what was in its hold is returned; null if not */
  yieldShip(): Items | null
  /** the game owning ship `id` (parked) gave it up to the player, who was climbing in: he flies it, with `items` in its hold; `owner` is whose it was */
  stealGranted(id: number, items: Items, owner: string): void
  /** … or would not: he stays on foot */
  stealFailed(): void
  /** units left in vein `id` now (−1: no such vein) */
  veinLeft(id: number): number
  /** another game's pilot killed creature `id` of this world (sim/creatures.ts): it is gone until `until` (seconds since 1970) */
  beastKilled(id: number, until: number): void
  /** the wildlife here (sim/creatures.ts): how many creatures are up and of what kinds, the world's groups, each creature up, what lies dropped */
  wildlife(): ReturnType<typeof wildCount>

  // ── space (sim/space.ts, travel.ts, stations.ts)
  /** a course to a body of the system the scene is in (a galaxy body's index; −1: none): the HUD points the way, and the cruise drive drops out on arriving */
  setCourse(body: number): void
  /** a world's map for drawing it from space (space/maps.ts buildMap), built elsewhere and handed in */
  givePlanetMap(id: string, map: SphereMap): void
  /** one of the maps a world's ground is made of ('w12:3': world/lands.ts buildLand), built elsewhere and handed in */
  giveLand(key: string, land: Terrain): void
  /** puts the player's ship at (x, y), heading so, flying (for the tools and the scripted flights); the camera goes with it */
  placePlayer(x: number, y: number, heading: number): void
  /**
   * The pilot's ship put flying on the wing of another ship here (by its number): a little behind it and to its right,
   * heading as it heads, at its height (over a world, no lower than a ship cruises), its power on, and a moment's
   * protection as a ship just come has. For a pilot who came by another's link to fly with him (the page: the wing
   * link). False where it cannot be: no such ship, or the pilot is out of his ship, inside, or on the way somewhere.
   */
  flyBeside(id: number): boolean
  /** the bodies of the system the scene is in, where each is now (none on a surface) */
  bodies(): BodyState[]

  // ── the persistent world (sim/traces.ts): what the events say, and what the player did that they will remember
  /** who holds each world, this world's discovery name, whether the player's side can reach it, and the traces left on it */
  setTraces(traces: TracesInput): void
  /** what the player did that the galaxy remembers since the last call (a flag, a delivery, a kill, a wreck …); the list is emptied */
  takeDeeds(): Deed[]
  /** starts recording the player's flight as a ghost, or stops and keeps it */
  recordGhost(on: boolean): void
  /** on foot: plants his beacon now, saying phrase `phrase` (data/territory.ts BEACON_PHRASES) */
  plantBeacon(phrase: number): void
  /** how the persistent world stands where the player is (for the page) */
  readonly traces: TracesStatus

  /** the page's mark for "go here" (sim/guide.ts): a point of the zone, or a ship by its id, with its name; null takes it away. Only drawn, never acted on */
  setGuide(mark: GuideMark | null): void

  // ── the target (sim/target.ts; the target key is Scene.act('target') pressed, and HeldControls.target held)
  /** picks a target outright (a ship by its id, a body of the system by its galaxy index, a base or a place of the ground), or lets it go (null) */
  setTarget(ref: TargetRef | null): void
  /** what is picked now, as the HUD says it (null: nothing) */
  readonly target: TargetStatus | null

  /** move everything on by dt seconds: always STEP, so it flies the same everywhere */
  step(dt: number): void
  /** draw a frame: width × height pixels, four bytes each (RGBA), valid until the next resize */
  render(): Uint8ClampedArray<ArrayBuffer>

  /**
   * A world built elsewhere (off the page's main thread: buildSurface in a worker), for the
   * `world` setting `key` names: when the settings next ask for that world, it is used at once
   * instead of being built here. Its arrays become the scene's.
   */
  giveWorld(key: string, world: World): void

  readonly width: number
  readonly height: number
  /** into a place inside (landed at a base or docked at a station): the hangar, the deck, or a ship's rooms (his own; or `hull`, another's, `owner` whose); false if he cannot go in from where he is */
  goInside(place: 'hangar' | 'deck' | 'ship', hull?: string, owner?: string): boolean
  /** back out to his seat, in his ship where it stood */
  goOutside(): void
  /** the furniture of the ship whose rooms he is in (each piece's foot, in tiles), as the save has it */
  setFurniture(list: Piece[]): void
  /** the furniture a new ship of a hull comes with (its fit-out: interior/rooms.ts shipKit), where each piece stands */
  kitOf(hull: string): { id: string; x: number; y: number }[]
  /** starts placing a piece of furniture in front of him (Use puts it down), or stops ('') */
  placeFurniture(id: string): void
  /** what Use was pressed for inside since the last call (a screen to open, furniture placed or taken up); the list is emptied */
  takeUses(): InteriorUse[]
  /** the other pilots in the same place inside (room px), as the network says */
  setVisitors(list: { id: number; x: number; y: number; facing: number; walk: number; look: string; side: string }[]): void
  /** the zone it is in now: a world it is over (the `world` setting, or the island world's name, `islands-7-33`), or a system's space ('s3'); it changes once a new one is arrived at */
  readonly worldKey: string
  /** where the scene is: a world's surface or a system's space, and where it is going (for the page: rooms, maps, building worlds ahead) */
  readonly zone: ZoneStatus
  /** the smooth flames to lay over this frame (none while the flames are drawn in pixels) */
  readonly flames: FlameList
  /** how many times larger the art pixels should be shown: 2 with the pilot on foot (the camera pulled in), 1 flying */
  readonly zoom: number
  /**
   * what must be seen whole (frame px), so the art pixels are shown no larger than lets it fit: the hangar, the deck and a
   * ship's rooms (these never smaller than `least` times the page's own art pixel); `tallest`: the frame no taller than this
   * (art px), so the art pixels are shown no smaller than lets it be (the seat: its cockpit's art is no taller); null otherwise
   */
  readonly fit: { w: number; h: number; least?: number; tallest?: number } | null
  /** where the pilot is inside, and what is there (place '': not inside) */
  readonly interior: InteriorStatus
  /** how the pilot stands out of his ship (for the page: its buttons, its words) */
  readonly foot: FootStatus
  /** the view the camera is in, or heading for */
  readonly view: ViewMode
  /** where the player is: their ship, or the pilot while he has none (heading as for a ship); `above`: px over the ground under him */
  readonly player: { x: number; y: number; height: number; heading: number; above: number }
  /** the player's ship (or the pilot out of it) as another game needs it, to draw it and fight it */
  readonly pilot: PilotState
  /** how the player's ship and the skirmish stand: for the page's sounds, and anything else outside that wants to know */
  readonly status: CombatStatus
  /** how the loop stands: the hold, whether the ship is landed (and at which base), what Land would do */
  readonly loop: LoopStatus
  /** what was heard since the last call (guns, hits, explosions …), for the page to play; the list is emptied */
  takeSounds(): SoundEvent[]
}

/** how the player's ship and the skirmish stand, as plain values */
export interface CombatStatus {
  /** false while the pilot has no ship (he has ejected, and a new one is on its way) */
  flying: boolean
  /** 0..1: hull and shield left, and how hot the guns are */
  hull: number
  shield: number
  heat: number
  /** true while the guns are jammed from overheating */
  jammed: boolean
  missiles: number
  missilesMax: number
  /** 0..1: how far into a squad mate's slipstream it flies */
  slip: number
  /** mines carried, and the most its layers hold */
  mines: number
  minesMax: number
  /** 0..1: how far the missile lock has come (1: locked) */
  lock: number
  /** seconds until the nearest missile fired at the player reaches him (99: none coming) */
  incoming: number
  /** seconds of protection a new ship has left */
  protect: number
  /** a band has come for him (raiders, drones, the other side's patrol: sim/bands.ts), and is after him still */
  ambushed: boolean
  /** the ship's power (sim/power.ts): off, coming up, on, or going down; and 0..1 how far up it is */
  power: 'off' | 'starting' | 'on' | 'stopping'
  powerLevel: number
  /** landed, docked, coming down or lifting off, in his seat: the weapons are safe, and fire nothing */
  safe: boolean
  /** px per second, 0..1 thrusters, 0..1 the throttle as set, px above the sea */
  speed: number
  boost: number
  throttle: number
  height: number
  /** the enemy in the player's sights, if any, and where to aim to hit it */
  target: { x: number; y: number; height: number; leadX: number; leadY: number; leadHeight: number } | null
  skirmish: {
    on: boolean
    stage: 'rest' | 'fight' | 'over'
    wave: number
    score: number
    best: number
    ships: number
    chain: number
    kills: number
    /** seconds left of the rest before the next wave */
    timer: number
  }
}

/** how the persistent world stands where the player is (see Scene.traces) */
export interface TracesStatus {
  /** who holds this world ('' nobody, or not known), and whether it is a hotspot today */
  holder: string
  hotspot: boolean
  /** the beacon being read: whose, and what it says */
  reading: { callsign: string; side: string; words: string } | null
  /** 0..1: how far a flag is planted; whether he stands at the capture site */
  planting: number
  atSite: boolean
  /** seconds of flight recorded as a ghost (−1: not recording) */
  recording: number
  /** the world's capture site, on its outpost's pad (null: none here) */
  site: { x: number; y: number; z: number } | null
}

/** how the loop stands (see Scene.loop) */
export interface LoopStatus {
  /** the world has bases and ore (none on the island world of the settings) */
  on: boolean
  /** the hold's slots (null: empty), and how full it is (0..1) */
  hold: (Stack | null)[]
  fill: number
  /** what the ship is doing: flying, coming down, landed, lifting off */
  stage: 'flying' | 'landing' | 'landed' | 'lifting'
  /** the base it is landed at (or coming down at), and whether it is a friendly one */
  base: { id: number; name: string; owner: BaseOwner; capital: boolean; friendly: boolean } | null
  /** what Land would do: '' nothing, 'land', 'pad' (land and bank), 'mine', 'takeoff' */
  prompt: string
  /** the laser is cutting */
  mining: boolean
  /**
   * Repairs where the ship stands (sim/repair.ts): one can be had here now (down or docked at a friendly base, the hull
   * short of whole), what the whole of it would cost, it is being done (the mining key held), and he cannot pay for it
   */
  repair: { offered: boolean; cost: number; on: boolean; broke: boolean }
  /** the nearest friendly base, how far (px), and which way (radians, as a heading); null: none */
  home: { name: string; x: number; y: number; d: number; heading: number } | null
  /** the nearest outcrop with ore left in it, and the crates lying about (where they are) */
  ore: { x: number; y: number; z: number; ore: string; rich: boolean; left: number } | null
  crates: { x: number; y: number; z: number }[]
  /** the ore his laser cut, lying where it fell, to be scooped up (where each chunk is) */
  chunks: { x: number; y: number; z: number; units: number }[]
  /** the world's bases: each one's name, its first pad (the short way round from him), whether it is friendly and a capital (none in space) */
  bases: { name: string; x: number; y: number; z: number; friendly: boolean; capital: boolean }[]
}

/** the player's ship as other games see it (see Scene.pilot) */
export interface PilotState {
  /** in a ship (false while he is out of one) */
  flying: boolean
  /** out of his ship, on the seat's rocket or under his parachute: where he is, then */
  out: boolean
  x: number
  y: number
  height: number
  heading: number
  roll: number
  pitch: number
  /** px per second, and 0..1 thrusters */
  speed: number
  thrust: number
  /** a full roll: how far through (−1 none) and which way */
  spin: number
  spinDir: number
  /** its guns fired a moment ago */
  firing: boolean
  /** 0..1, and seconds of protection left */
  hullLeft: number
  shieldLeft: number
  protect: number
  /** which ship */
  hull: string
  /** how many ships he has had: one more each time a new one picks him up */
  life: number
  /** how full his hold is (0..1), whether he is landing (1), landed (2) or lifting off (3), and the outcrop his laser is cutting (−1 none) */
  loaded: number
  landing: number
  mining: number
  /** where he is: 0 in his ship, 1 coming down after ejecting, 2 on foot, 3 dead, 4 climbing into a ship */
  foot: number
  /** his ship: 0 none (lost, or on its way), 1 he is in it, 2 standing empty where he left it (x, y, height, heading above) */
  ship: number
  /** out of his ship: where he is (his feet), which way he faces, and px a second he walks */
  fx: number
  fy: number
  fz: number
  facing: number
  walk: number
  /** 0..1: his health; how far his way of coming down has opened */
  health: number
  open: number
  /** under trees; in shallow water; his sidearm firing; cutting a vein */
  hidden: boolean
  wading: boolean
  shooting: boolean
  cutting: boolean
  /** inside: 0 not, 1 the hangar, 2 the deck, 3 a ship's rooms (where he stands there is fx, fy) */
  inside: number
  /** the paint of the ship he flies, if it is not his own (stolen); null: his own */
  flownPaint: { body: string; accent: string; canopy: string } | null
}

/** another pilot on foot, as Scene.listWalkers gives him */
export interface WalkerState {
  id: number
  x: number
  y: number
  /** his feet */
  height: number
  heading: number
  stage: 'falling' | 'walking' | 'dead' | 'boarding'
  side: number
  look: string
  healthLeft: number
}

/** where the pilot is inside (see Scene.interior) */
export interface InteriorStatus {
  /** '' not inside; the hangar, the deck, or a ship's rooms */
  place: '' | 'hangar' | 'deck' | 'ship'
  /** the spot in reach ('' none: data/interiors.ts SpotId), and a piece of furniture being placed ('' none) */
  spot: string
  placing: string
  /** the piece being placed can stand where it would go */
  placeOk: boolean
  /** where he stands in the room (px), which way he faces, how fast he walks */
  x: number
  y: number
  facing: number
  walk: number
  /** a ship's rooms: whose ('' his own), its hull, how many rooms it has, and the name of the one he is in ('' none) */
  owner: string
  hull: string
  rooms: number
  room: string
  /** other pilots here with him (other players, or the deck's crowd) */
  others: number
  /** up out of his seat in flight, walking his ship's rooms while it flies itself (place 'ship'; the zone is still the sky or space) */
  flying: boolean
  /** … and what is going on outside: the ship's speed (px/s), and how long since it was hit (s; 99 none lately), whether a missile is coming */
  speed: number
  struck: number
  missile: boolean
}

/** how the pilot stands out of his ship (see Scene.foot) */
export interface FootStatus {
  /** where he is: 'ship' (in it), 'falling', 'walking', 'dead', 'boarding' */
  stage: 'ship' | 'falling' | 'walking' | 'dead' | 'boarding'
  /** his ship: 'with' (he is in it), 'parked', 'gone', 'coming' (called: `call` seconds to go) */
  ship: 'with' | 'parked' | 'gone' | 'coming'
  call: number
  /** 0..1 */
  health: number
  /** what Use would do: '' nothing, 'board', 'steal', 'mine', 'call', 'recall' (his own ship, parked far off) */
  prompt: string
  pack: (Stack | null)[]
  flares: number
  hidden: boolean
  /** flying someone else's ship (stolen): whose */
  stolenFrom: string
  /** the camera's turn: a heading h shows on the screen as h + yaw (the keys and sticks move him the way the screen shows) */
  yaw: number
  /** the nearest vein with ore left in it (null: none on this world) */
  vein: { id: number; x: number; y: number; z: number; ore: string; left: number } | null
  /** his hand cutter is cutting a vein */
  cutting: boolean
  /** coming down: where he will come down as he is going, and whether he can stand there; the nearest ground he can (null: none near) */
  down: { x: number; y: number; safe: boolean }
  shore: { x: number; y: number; d: number } | null
  /** up out of his seat in flight, walking his ship's rooms (stage 'walking'): his ship flies on by itself */
  up: boolean
}

/** a ship in the scene, as Scene.listShips gives it */
export interface ShipState {
  id: number
  x: number
  y: number
  height: number
  heading: number
  roll: number
  pitch: number
  speed: number
  thrust: number
  spin: number
  spinDir: number
  firing: boolean
  hull: string
  hullLeft: number
  shieldLeft: number
  /** its side (−1 none), whether another game owns it, and the wave whose skill the computer flies it with (0: not the computer) */
  side: number
  remote: boolean
  wave: number
  /** the band of this zone it flies in (sim/bands.ts; −1 none), whose patrol it is ('' nobody's: a raider), and whether it lies in wait */
  band: number
  faction: string
  lurk: boolean
  /** a hauler going about its business (sim/traffic.ts): every game has its own, from the clock; never told to another */
  traffic: boolean
  /** another pilot's: landing (1), landed (2), lifting off (3), or flying (0); the outcrop his laser cuts (−1 none) */
  landing: number
  mining: number
  /** standing empty, where its pilot left it */
  parked: boolean
  /** how it is fitted and painted beyond its colours (sim/outfit.ts makeText; '' plain) */
  make: string
  /** a training drone: this game's alone, never told to another (ShipInput.drill) */
  drill: boolean
}

/** a body of the system the scene is in, as it stands now (see Scene.bodies) */
export interface BodyState {
  /** its index among the galaxy's bodies */
  index: number
  kind: string
  name: string
  x: number
  y: number
  /** px: its radius (a belt: how wide it is) */
  size: number
  /** the surface it has, a world's id ('' none) */
  world: string
}

/** where the scene is (see Scene.zone) */
export interface ZoneStatus {
  kind: 'surface' | 'space' | 'interior'
  /** its key, as worldKey */
  key: string
  /** the system it is in (an index into the galaxy's systems; −1 the island world of the settings) */
  system: number
  /** the world it is going down to ('' none), and the world under it in space that it could go down to: the page builds them ahead */
  going: string
  over: string
  /** worlds whose maps it would draw and has not been given (the page builds them: Scene.givePlanetMap) */
  maps: string[]
  /** the maps of the world's ground further on that it will want and does not have ('w12:3': the page builds them, Scene.giveLand) */
  lands: string[]
  /** in space: the course plotted (a galaxy body's index, −1 none), the cruise drive ('off', 'spool', 'on') and its pace, what Use would do ('' nothing, 'descend', 'dock', 'undock', 'jump', 'thread', 'skim', 'mine'), and how hard gravity pulls (px/s²) */
  course: number
  cruise: 'off' | 'spool' | 'on'
  pace: number
  prompt: string
  pull: number
  /** in space, with a course: where to steer for it (round a sun, a giant or a black hole in the way: sim/space.ts courseAim) */
  aim: { x: number; y: number } | null
  /** a transition under way: '' none, 'out', 'down', 'gate', 'hole' */
  travel: string
  /** 0..1: on the way down to a world or up out of one, how fiercely its air burns round the ship (0: none, or not on the way) */
  air: number
  /** on a world: night where he is (its day turns: sim/daylight.ts) */
  night: boolean
}

/** how the sky is shared (see Scene.setRoom); anything left out stays as it was */
export interface RoomSettings {
  shared?: boolean
  host?: boolean
  /** the wave the host is on, whether it is in the air or coming, and seconds until it comes */
  wave?: number
  stage?: 'rest' | 'fight'
  timer?: number
  /** the bands of this zone the host says are beaten, and the moment each is back (UTC seconds) */
  cleared?: { band: number; until: number }[]
}

/** the outcrop with ore left nearest a point (as near the point as the wrap allows) */
function nearestOre(scene: SceneState, x: number, y: number) {
  let best: LoopStatus['ore'] = null
  let bestD = Infinity
  for (const o of scene.world.features.outcrops) {
    const left = leftIn(scene, o)
    if (left <= 0) continue
    const dx = wrapDelta(o.x - x)
    const dy = wrapDelta(o.y - y)
    const d = dx * dx + dy * dy
    if (d < bestD) {
      bestD = d
      best = { x: x + dx, y: y + dy, z: o.z, ore: o.ore, rich: o.rich, left }
    }
  }
  return best
}

/** how the loop stands in space: docked at a station (as landed at a base), the nearest friendly station as home */
function spaceLoop(scene: SceneState): LoopStatus {
  const L = scene.loop.landing
  const b = L.base
  const j = scene.jets[0]
  let home: LoopStatus['home'] = null
  for (const s of friendlyStations(scene)) {
    const d = Math.hypot(s.x - j.x, s.y - j.y)
    if (!home || d < home.d) home = { name: s.body.name, x: s.x, y: s.y, d, heading: Math.atan2(s.x - j.x, -(s.y - j.y)) }
  }
  const nearestRock = oreRocks(scene).sort((a, c) => Math.hypot(a.x - j.x, a.y - j.y) - Math.hypot(c.x - j.x, c.y - j.y))[0]
  return {
    on: looping(scene),
    hold: scene.loop.hold.slots.map((s) => (s ? { ...s } : null)),
    fill: fillOf(scene.loop.hold),
    stage: L.stage === LANDING ? 'landing' : L.stage === LANDED ? 'landed' : L.stage === LIFTING ? 'lifting' : 'flying',
    base: b ? { id: b.id, name: b.name, owner: b.owner, capital: b.capital, friendly: friendly(scene, b) } : null,
    repair: repairStatus(scene),
    prompt: scene.space.prompt === 'undock' ? 'takeoff' : scene.space.prompt === 'mine' ? 'mine' : '',
    mining: scene.loop.mining.on,
    home,
    ore: nearestRock
      ? { x: nearestRock.x, y: nearestRock.y, z: nearestRock.z, ore: nearestRock.ore, rich: false, left: leftIn(scene, nearestRock) }
      : null,
    crates: scene.loop.crates.map((c) => ({ x: c.x, y: c.y, z: c.z })),
    chunks: ownChunks(scene).map((c) => ({ x: c.x, y: c.y, z: c.z, units: c.units })),
    bases: [],
  }
}

/** the chunks his laser cut, not yet on their way into the hold */
const ownChunks = (scene: SceneState) => scene.loop.chunks.filter((c) => c.own && c.pulled < 0)

/** the player's ship's colours, from the settings */
function paintPlayer(scene: SceneState) {
  paintShip(scene.paint, scene.mesh.model, coloursOf(scene.params), scene.params.timeOfDay)
}

/** on another ship's wing (Scene.flyBeside): px behind it and to its right, and seconds of protection on coming there */
const WING = { back: 46, aside: 30, protect: 5 }

/** the id of the world the ship is over in space, or '': the page builds it ahead, for it may be flown down to at any moment */
function overWorld(scene: SceneState) {
  if (scene.zone.kind !== 'space') return ''
  const b = worldUnder(scene, scene.jets[0])
  return b ? (theGalaxy().worlds[b.body.world]?.id ?? '') : ''
}

/** each scene's state, for the tools to look into (tools/locals.ts): never to be changed from outside */
const states = new WeakMap<Scene, SceneState>()
export const stateOf = (scene: Scene) => states.get(scene) ?? null

export function createScene(initial: SceneParams): Scene {
  const scene = createState(initial)
  refitPack(scene)
  const ctl = scene.controls
  const system = systemOfKey(initial.world)
  if (system >= 0) {
    // (a scene that begins in a system's space: there is no world to build)
    paintPlayer(scene)
    repaintWalker(scene)
    resetFlight(scene)
    syncWingmen(scene)
    startInSpace(scene, system)
  } else {
    buildPlanet(scene)
    paintPlayer(scene)
    repaintWalker(scene)
    resetFlight(scene)
    syncWingmen(scene)
    startAtBase(scene)
  }

  const api: Scene = {
    setParams(next) {
      const prev = scene.params
      const p = (scene.params = { ...next })
      // (on a world of the galaxy the time of day is its own, as its day turns: sim/daylight.ts)
      if (scene.planet && scene.zone.kind === 'surface' && scene.daylight.key === scene.worldKey && prev.world === p.world)
        p.timeOfDay = prev.timeOfDay
      // (the scene changes zone by itself, climbing out, going down or jumping: the settings follow it there, and while it is under way they wait)
      if (prev.world !== p.world && (p.world === scene.worldKey || scene.travel.kind)) p.world = prev.world
      if (prev.world !== p.world) {
        // another world: arrived at as soon as it is built (at once, if it was handed in built)
        scene.worldDirty = scene.given?.key === worldKeyOf(p) ? 1e-9 : 0.05
        scene.arriving = true
      } else if (!p.world) {
        if (prev.seed !== p.seed) {
          scene.worldDirty = 0.2
          scene.reseat = true
        }
        if (prev.land !== p.land) scene.worldDirty = 0.2
      }
      // another ship: its shape, and with it its colours (the same hull fitted or painted otherwise is the same ship, refitted)
      const reshaped = prev.hull !== p.hull
      const refitted = prev.parts !== p.parts || prev.weapons !== p.weapons
      const remade = reshaped || makeKey(makeOf(prev)) !== makeKey(makeOf(p))
      if (remade && !scene.foot.stolen) {
        scene.mesh = meshFor(p)
        const f = scene.jets[0]?.fighter
        if (f && !reshaped) f.mesh = scene.mesh
      }
      if (refitted) scene.parts = partsOf(p)
      if (reshaped || refitted) {
        // another hold: what does not fit spills; and the hull and shield the parts give
        const over = refitHold(scene.loop.hold, p.hull, scene.parts.slots)
        const j = scene.jets[0]
        if (over.length) spill(scene, j.x, j.y, j.z, over, true)
        const f = ownFighter(scene)
        if (f && !reshaped) fitParts(scene, f)
      }
      // (other gear: the backpack's size, the flares)
      if (prev.gear !== p.gear) {
        scene.gear = gearOf(p.gear)
        refitPack(scene)
      }
      // (another side: whose turrets fire at whom)
      if (prev.side !== p.side) makeTurrets(scene)
      // another look (or another side): the pilot's colours
      if (prev.look !== p.look || prev.side !== p.side) scene.foot.walker.look = lookFromParams(p)
      const newLight = prev.timeOfDay !== p.timeOfDay
      if (newLight) {
        repaintWorld(scene)
        repaintShips(scene)
        repaintWalkers(scene)
      }
      if (newLight || prev.look !== p.look || prev.side !== p.side) repaintWalker(scene)
      if (
        reshaped ||
        newLight ||
        prev.bodyColor !== p.bodyColor ||
        prev.accentColor !== p.accentColor ||
        prev.canopyColor !== p.canopyColor ||
        prev.trimColor !== p.trimColor ||
        prev.glowColor !== p.glowColor ||
        prev.trailColor !== p.trailColor ||
        remade
      ) {
        paintPlayer(scene)
        invalidateCockpit(scene)
      }
      if (prev.intro !== p.intro && p.intro) {
        scene.introT = 0
        scene.burn = 0
      }
      if (prev.view !== p.view) scene.rig.target = viewIndex(p.view)
      syncWingmen(scene)
    },

    resize(w, h) {
      const W = Math.max(8, w | 0)
      const H = Math.max(8, h | 0)
      scene.screen = createFrame(W, H)
      scene.pivotY = Math.round(H * 0.34)
      invalidateCockpit(scene)
      // the square sheet reaches every corner of the frame however far the view is rolled
      // (turned about the seat's row, or from behind in space about the row the ship sits on, lower down the frame)
      const tall = Math.max(scene.pivotY, H - scene.pivotY, Math.ceil(H * 0.76))
      const side = (Math.ceil(Math.sqrt((W / 2) * (W / 2) + tall * tall)) + 2) * 2
      scene.sheet = createFrame(side, side)
      updateView(scene)
    },

    pointerMove(x, y) {
      ctl.keyMode = false
      ctl.pointerOn = true
      ctl.pointerX = x
      ctl.pointerY = y
      ctl.pointerIdle = 0
    },
    pointerLeave() {
      ctl.pointerOn = false
    },
    setControls(held) {
      ctl.keyTurn = clamp(held.turn, -1, 1)
      ctl.keyClimb = clamp(held.climb, -1, 1)
      ctl.keyWalk = clamp(held.walk ?? held.climb, -1, 1)
      ctl.keyThrottle = clamp(held.throttle ?? 0, -1, 1)
      ctl.keyLift = clamp(held.lift ?? 0, -1, 1)
      ctl.keyStrafe = clamp(held.strafe ?? 0, -1, 1)
      ctl.boost = clamp(held.boost, 0, 1)
      ctl.fire = held.fire
      ctl.secondary = held.secondary
      ctl.land = !!held.land
      ctl.mine = !!held.mine
      scene.target.held = !!held.target
      if (ctl.keyTurn !== 0 || ctl.keyClimb !== 0) ctl.keyMode = true
    },
    act(action) {
      // (up out of his seat in flight: the seat key, and Use for what he stands by; the rest wait until he is back)
      if (action === 'seat') toggleSeat(scene)
      if (scene.interior.flying) {
        if (action === 'use') ctl.use = true
        return
      }
      if (action === 'seat') return
      // (the target key: the next thing on the frame, on foot or flying)
      if (action === 'target') {
        scene.target.ask = true
        return
      }
      // (on foot: roll dives, and the view button plants a beacon)
      const afoot = scene.foot.stage === WALKING
      if (action === 'roll' && afoot) dive(scene)
      else if (action === 'view' && afoot) scene.foot.plant = true
      // (the cruise drive has a button of its own; it works only in space)
      else if (action === 'cruise') {
        // (a body picked and no course: the drive takes him to it; docs/targeting.md, T then C)
        const on = scene.target.on
        if (inSpace(scene) && scene.space.course < 0 && on?.kind === 'body' && scene.space.cruise === CRUISE_OFF)
          scene.space.course = on.index
        if (inSpace(scene)) toggleCruise(scene)
      } else if (action === 'power') scene.power.ask = true
      else if (action === 'roll') {
        if (scene.introT > INTRO_TIME) startRoll(scene)
      } else if (action === 'use') {
        // (a press alone counts as Land held for a moment)
        ctl.use = true
        ctl.tap = 0.3
      } else if (action === 'view') scene.rig.target = (scene.rig.target + 1) % 3
    },
    throttleBy(amount) {
      if (Number.isFinite(amount)) ctl.throttleBy = clamp(ctl.throttleBy + amount, -1, 1)
    },
    setThrottle(level) {
      if (Number.isFinite(level)) ctl.throttleTo = clamp(level, 0, 1)
    },
    replayIntro() {
      scene.introT = 0
      scene.burn = 0
    },

    addShip(input) {
      const id = scene.nextShip++
      const ship = createShip(scene, id, input)
      scene.ships.push(ship)
      // (another pilot come out of a gate: a flash)
      if (input.remote) shipCame(scene, ship.jet.x, ship.jet.y)
      return id
    },
    updateShip(id, change) {
      const ship = scene.ships.find((s) => s.id === id)
      if (ship) updateShip(scene, ship, change)
    },
    removeShip(id) {
      const at = scene.ships.findIndex((s) => s.id === id)
      if (at < 0) return
      // (gone without a fight: nothing aims at it any more)
      const s = scene.ships[at]
      const f = s.jet.fighter
      // (another pilot gone elsewhere, alive: through a gate, down into a world's air, up out of it; seen so)
      if (f?.remote && f.alive && !s.jet.away) shipLeft(scene, s.jet.x, s.jet.y, s.jet.z)
      if (f) f.alive = false
      scene.ships.splice(at, 1)
    },
    listShips() {
      return scene.ships.map((s): ShipState => {
        const j = s.jet
        const f = j.fighter
        return {
          id: s.id,
          x: j.x,
          y: j.y,
          height: j.z,
          heading: j.yaw,
          roll: j.roll,
          pitch: j.pitch,
          speed: s.speed,
          thrust: s.thrust,
          spin: j.stunt >= 0 && j.stuntDelay <= 0 ? j.stunt : -1,
          spinDir: j.stuntDir,
          firing: !!f && scene.time - f.firedAt < 0.12,
          hull: s.mesh.model.name,
          hullLeft: f ? f.hull / f.stats.hull : 1,
          shieldLeft: f && f.stats.shield > 0 ? f.shield / f.stats.shield : 0,
          side: f ? f.side : -1,
          remote: !!f && f.remote,
          wave: s.wave,
          band: s.band,
          faction: s.faction,
          lurk: !!f && f.lurk,
          traffic: s.traffic,
          landing: s.landing,
          mining: s.mining,
          parked: s.parked,
          make: s.make,
          drill: s.drill,
        }
      })
    },

    setSquad(next) {
      scene.squad.on = next.on
      scene.squad.mates = next.mates.slice(0, 3).map((m) => ({ id: m.id, callsign: m.callsign }))
    },
    goInside(place, hull, owner) {
      const ok = goIn(scene, place, hull ?? '', owner ?? '')
      return ok
    },
    goOutside() {
      goOut(scene)
    },
    setFurniture(list) {
      scene.interior.furniture = list.map((p) => ({ id: p.id, x: p.x | 0, y: p.y | 0 }))
      furnish(scene)
    },
    kitOf(hull) {
      return shipKit(hull)
    },
    placeFurniture(id) {
      const it = scene.interior
      it.placing = id && it.room?.kind === 'ship' ? { id, x: 0, y: 0, ok: false, face: 's', why: '' } : null
    },
    takeUses() {
      const out = scene.interior.uses
      scene.interior.uses = []
      return out
    },
    setVisitors(list) {
      setVisitors(scene, list)
    },

    addMine(owner, tag, x, y, z) {
      mineFromAfar(scene, owner, tag, x, y, z)
    },
    endMine(owner, tag) {
      mineEndFromAfar(scene, owner, tag)
    },

    setRoom(next) {
      const room = scene.room
      if (next.shared !== undefined) room.shared = next.shared
      if (next.host !== undefined) room.host = next.host
      if (!room.shared) room.reports.length = 0
      const k = scene.skirmish
      if (next.wave !== undefined && next.wave !== k.wave) {
        // a new wave, as the host says: the news, and a full rack of missiles (the old skirmish only)
        if (next.wave > k.wave && !room.host && skirmishOn(scene)) {
          k.banner = `WAVE ${next.wave}`
          k.bannerT = 0
          const own = ownFighter(scene)
          if (own && !scene.params.side) own.missiles = own.stats.missiles
        }
        k.wave = next.wave
      }
      if (next.stage !== undefined && k.stage !== OVER) k.stage = next.stage === 'fight' ? FIGHT : REST
      if (next.timer !== undefined) k.timer = next.timer
      if (next.cleared) setCleared(scene, next.cleared)
    },
    clearedBands() {
      return clearedHere(scene)
    },
    takeReports() {
      const list = scene.room.reports
      scene.room.reports = []
      return list
    },
    hit(target, amount, by, dx, dy, dz, hull, foot = false) {
      hitFromAfar(scene, target, amount, by, dx, dy, dz, hull, foot)
    },
    shootDown(target, by, worth = 1) {
      downFromAfar(scene, target, by, worth)
    },
    launchMissile(from, target) {
      return missileFromAfar(scene, from, target)
    },
    endMissile(tag, x, y, z, dodged) {
      endMissileFromAfar(scene, tag, x, y, z, dodged)
    },
    addFeed(line) {
      addFeed(scene, line)
    },

    setClock(utc) {
      scene.loop.clock = utc - scene.time
      // (the bodies move on the same clock)
      if (inSpace(scene)) placeBodies(scene)
    },
    takeLedger() {
      const list = scene.loop.ledger
      scene.loop.ledger = []
      return list
    },
    loadHold(items) {
      return addItems(scene.loop.hold, items)
    },
    unloadSlot(slot) {
      const s = scene.loop.hold.slots[slot]
      if (!s) return []
      scene.loop.hold.slots[slot] = null
      return [{ ...s }]
    },
    refit(what) {
      const f = ownFighter(scene)
      if (!f) return
      if (what.repair) f.hull = f.stats.hull
      if (what.missiles) f.missiles = Math.min(f.stats.missiles, f.missiles + what.missiles)
    },
    setPurse(credits) {
      scene.repair.purse = Number.isFinite(credits) ? Math.max(0, credits) : Infinity
    },
    mined(outcrop, epoch, n) {
      const o = inSpace(scene) ? rockOfId(scene, outcrop) : scene.world.features.outcrops[outcrop]
      if (!o) return
      takeFrom(scene, o, epoch, n)
      for (let i = 0; i < Math.min(n, 6); i++) throwChunk(scene, o, false)
    },
    addCrate(x, y, z, items) {
      return spill(scene, x, y, z, items, false)
    },
    crateChanged(tag, left) {
      crateChanged(scene, tag, left)
    },
    oreLeft(id) {
      const o = inSpace(scene) ? rockOfId(scene, id) : scene.world.features.outcrops[id]
      return o ? leftIn(scene, o) : -1
    },

    addWalker(input) {
      const id = scene.nextShip++
      scene.walkers.push(createOtherWalker(scene, id, input))
      return id
    },
    updateWalker(id, change) {
      const w = scene.walkers.find((x) => x.id === id)
      if (w) updateWalker(scene, w, change)
    },
    removeWalker(id) {
      const at = scene.walkers.findIndex((x) => x.id === id)
      if (at < 0) return
      scene.walkers[at].fighter.alive = false
      scene.walkers.splice(at, 1)
    },
    listWalkers() {
      return scene.walkers.map((w): WalkerState => ({
        id: w.id,
        x: w.jet.x,
        y: w.jet.y,
        height: w.jet.z - FOOT.chest,
        heading: w.jet.yaw,
        stage: w.stage === FALLING ? 'falling' : w.stage === DEAD ? 'dead' : w.stage === BOARDING ? 'boarding' : 'walking',
        side: w.side,
        look: lookText(w.look),
        healthLeft: w.fighter.alive ? w.fighter.hull / w.fighter.stats.hull : 0,
      }))
    },
    walkerDied(id, by, worth = 1) {
      const w = scene.walkers.find((x) => x.id === id)
      // (his state may have said he is dead before this word came: the kill still counts, once)
      if (!w || !w.fighter.alive) return
      const killer = fighterOf(scene, by)
      w.fighter.worth = worth
      // (the kill shows here, and scores for whoever made it)
      if (w.fighter.alive) shootDown(scene, w.fighter, killer)
      else walkerDied(scene, w.fighter)
    },
    veinMined(vein, epoch, n) {
      const v = scene.foot.veins[vein]
      if (v) takeFromVein(scene, v, epoch, n)
    },
    beastKilled(id, until) {
      beastKilled(scene, id, until)
    },
    wildlife() {
      return wildCount(scene)
    },
    addBeacon(owner, x, y, z, label, color) {
      const [r, g, b] = parseColor(color, [255, 255, 255])
      plantBeacon(scene, x, y, z, false, owner || '?', label, pack(r, g, b))
    },
    addFlare(x, y, z, color) {
      const [r, g, b] = parseColor(color, [255, 255, 255])
      launchFlare(scene, x, y, z, false, pack(r, g, b))
    },
    yieldShip() {
      return yieldShip(scene)
    },
    stealGranted(id, items, owner) {
      stealGranted(scene, id, items, owner)
    },
    stealFailed() {
      stealFailed(scene)
    },
    veinLeft(id) {
      const v = scene.foot.veins[id]
      return v ? veinLeft(scene, v) : -1
    },

    setCourse(body) {
      scene.space.course = body
    },
    givePlanetMap(id, map) {
      giveMap(id, map)
      wanted.delete(id)
    },
    giveLand(key, land) {
      giveLand(key, land)
    },
    bodies() {
      const g = theGalaxy()
      return scene.space.bodies.map((b) => ({
        index: b.body.index,
        kind: b.body.kind,
        name: b.body.name,
        x: b.x,
        y: b.y,
        size: b.body.size,
        world: b.body.world >= 0 ? g.worlds[b.body.world].id : '',
      }))
    },
    placePlayer(x, y, heading) {
      const j = scene.jets[0]
      const dx = x - j.x
      const dy = y - j.y
      for (const w of scene.jets) {
        w.x += dx
        w.y += dy
        w.yaw = heading
        w.trailLen = 0
        w.lastTrailX = w.x
        w.lastTrailY = w.y
      }
      scene.loop.landing.stage = FLYING
      scene.loop.landing.base = null
      const { view, rig } = scene
      view.x = rig.follow.x = j.x
      view.y = rig.follow.y = j.y
      rig.topYaw = -heading * clamp(scene.params.cameraFollow, 0, 1)
      rig.chaseYaw = -heading
      rig.yawDiff = rig.chaseYaw - rig.topYaw
      scene.space.driftX = 0
      scene.space.driftY = 0
    },

    flyBeside(id) {
      const other = scene.ships.find((s) => s.id === id)
      const f = scene.eject.stage === EJ_FLY ? ownFighter(scene) : null
      if (!other || !f || scene.foot.stage !== ABOARD || scene.zone.kind === 'interior' || scene.travel.kind) return false
      const o = other.jet
      const sn = Math.sin(o.yaw)
      const cs = Math.cos(o.yaw)
      this.placePlayer(o.x - sn * WING.back + cs * WING.aside, o.y + cs * WING.back + sn * WING.aside, o.yaw)
      // (in space at its height; over a world, no lower than a ship cruises: he may be down on a pad)
      const z = scene.zone.kind === 'space' ? o.z : Math.max(o.z, scene.params.altitude)
      for (const w of scene.jets) {
        w.z = z
        w.pitch = 0
        w.roll = 0
      }
      scene.flight.altGoal = z
      scene.rig.follow.alt = z
      scene.space.dock.station = -1
      scene.loop.landing.release = true
      scene.power.on = true
      scene.power.level = 1
      f.protect = Math.max(f.protect, WING.protect)
      return true
    },

    setTraces(t) {
      const was = holderHere(scene)
      setTraces(scene, t)
      // (another holder here: whose turrets fire at whom)
      if (holderHere(scene) !== was) makeTurrets(scene)
    },
    takeDeeds() {
      const list = scene.traces.deeds
      scene.traces.deeds = []
      return list
    },
    recordGhost(on) {
      recordGhost(scene, on)
    },
    plantBeacon(phrase) {
      scene.traces.phrase = phrase | 0
      if (scene.foot.stage === WALKING) scene.foot.plant = true
    },
    setTarget(ref) {
      setTarget(scene, ref)
    },
    get target() {
      return targetStatus(scene)
    },
    setGuide(mark) {
      scene.guide = mark ? { ...mark } : null
    },
    get traces(): TracesStatus {
      const tr = scene.traces
      const r = tr.reading?.mark
      const site = capturePoint(scene)
      const w = scene.foot.walker.jet
      return {
        holder: holderHere(scene),
        hotspot: hotspotHere(scene),
        reading: r ? { callsign: r.callsign, side: r.side, words: phraseOf(r.n) } : null,
        planting: Math.min(1, tr.planting / CAPTURE.plantTime),
        // (where holding Use plants it: the tip that says "hold here" said it twice as far out, where it did nothing)
        atSite: !!site && scene.foot.stage === WALKING && Math.hypot(site.x - w.x, site.y - w.y) < CAPTURE.reach,
        recording: tr.recording ? tr.recordT : -1,
        site,
      }
    },

    step(dt) {
      stepScene(scene, dt)
    },
    render() {
      renderScene(scene)
      return scene.screen.bytes
    },
    giveWorld(key, world) {
      scene.given = { key, world }
      if (worldKeyOf(scene.params) === key && scene.worldKey !== key) scene.worldDirty = 1e-9
    },

    get width() {
      return scene.screen.w
    },
    get height() {
      return scene.screen.h
    },
    get worldKey() {
      return scene.worldKey
    },
    get zone(): ZoneStatus {
      const sp = scene.space
      const tr = scene.travel
      const surface = surfaceById(scene.params.world)
      const system = inSpace(scene) ? sp.system : surface ? surface.system : -1
      return {
        kind: scene.zone.kind,
        key: scene.worldKey,
        system,
        going: tr.kind === 'down' ? tr.world : '',
        over: overWorld(scene),
        maps: [...wanted],
        lands: [...wantedLands],
        course: sp.course,
        cruise: sp.cruise === CRUISE_ON ? 'on' : sp.cruise === CRUISE_SPOOL ? 'spool' : 'off',
        pace: sp.pace,
        prompt: sp.prompt,
        pull: sp.pull,
        aim: inSpace(scene) && courseAim(scene) ? { x: aim.x, y: aim.y } : null,
        travel: tr.kind,
        air: tr.kind === 'down' || tr.kind === 'out' ? fireOf(theGalaxy().bodies[tr.from], tr.e, Math.max(0, -tr.rate)) : 0,
        night: scene.zone.kind === 'surface' && scene.params.timeOfDay === 'night',
      }
    },
    get flames() {
      return scene.flames
    },
    get zoom() {
      return zoomOf(scene)
    },
    get fit() {
      return fitOf(scene)
    },
    get interior(): InteriorStatus {
      const it = scene.interior
      const r = it.room
      const j = it.me.jet
      return {
        place: r ? r.kind : '',
        spot: it.spot,
        placing: it.placing?.id ?? '',
        placeOk: !!it.placing?.ok,
        x: j.x,
        y: j.y,
        facing: j.yaw,
        walk: Math.hypot(j.vx, j.vy),
        owner: it.owner,
        hull: r?.hull ?? '',
        rooms: r?.rooms.length ?? 0,
        room: r?.rooms.find((x) => j.y / TILE >= x.y0 - 1 && j.y / TILE < x.y1 + 1)?.name ?? '',
        others: it.visitors.length,
        flying: it.flying,
        speed: scene.speed,
        struck: it.flying ? Math.min(99, scene.time - it.struckAt) : 99,
        missile: it.flying && nearestThreat(scene, ownFighter(scene)).tti < UP_IN_FLIGHT.missile,
      }
    },
    get foot(): FootStatus {
      const foot = scene.foot
      const w = foot.walker
      return {
        // (inside, and up out of his seat in flight, he walks: the page gives him a stick, as on foot)
        stage:
          scene.zone.kind === 'interior' || scene.interior.flying
            ? 'walking'
            : (['ship', 'falling', 'walking', 'dead', 'boarding'] as const)[foot.stage],
        ship: (['with', 'parked', 'gone', 'coming'] as const)[foot.ship],
        call: Math.max(0, foot.callT),
        health: w.fighter.alive ? w.fighter.hull / w.fighter.stats.hull : 0,
        prompt: footPrompt(scene),
        pack: foot.pack.slots.map((s) => (s ? { ...s } : null)),
        flares: foot.flares,
        hidden: w.hidden,
        stolenFrom: foot.stolen?.owner ?? '',
        yaw: scene.rig.topYaw,
        vein: nearestVein(scene, focus(scene).x, focus(scene).y),
        cutting: w.mining,
        down: { ...foot.down },
        shore: foot.shore ? { ...foot.shore } : null,
        up: scene.interior.flying,
      }
    },
    get view() {
      return viewName(scene.rig.target)
    },
    get player() {
      const j = focus(scene)
      // (how far above the ground under him: low enough to mine or land is under 150; in space there is no ground)
      const above = inSpace(scene) ? j.z : j.z - groundAt(scene.world, j.x, j.y)
      return { x: j.x, y: j.y, height: j.z, heading: j.yaw, above }
    },
    get pilot(): PilotState {
      const foot = scene.foot
      const aboard = foot.stage === ABOARD
      const out = scene.eject.stage === EJ_ROCKET || scene.eject.stage === EJ_CHUTE
      const j = out && aboard ? scene.eject.ghost : scene.jets[0]
      const f = ownFighter(scene)
      const w = foot.walker
      // (out of his ship: the network shows him where he stands, and his ship where it stands, if it does)
      const shipShown = aboard ? !j.away && !out : foot.ship === SHIP_PARKED && !j.away
      const inside = scene.zone.kind === 'interior'
      return {
        foot: foot.stage,
        ship: aboard ? (out ? 0 : 1) : shipShown ? 2 : 0,
        // (inside: where he walks in the room instead)
        fx: inside ? scene.interior.me.jet.x : w.jet.x,
        fy: inside ? scene.interior.me.jet.y : w.jet.y,
        fz: w.jet.z - FOOT.chest,
        facing: inside ? scene.interior.me.jet.yaw : w.jet.yaw,
        walk: inside ? Math.hypot(scene.interior.me.jet.vx, scene.interior.me.jet.vy) : Math.hypot(w.jet.vx, w.jet.vy),
        health: w.fighter.alive ? w.fighter.hull / w.fighter.stats.hull : 0,
        open: w.open,
        hidden: w.hidden,
        wading: w.wading,
        shooting: scene.time - w.firedAt < 0.4,
        cutting: w.mining,
        // (up out of his seat in flight he is in his ship as far as the others know: it flies on)
        inside: inside ? ['', 'hangar', 'deck', 'ship'].indexOf(scene.interior.room?.kind ?? '') : 0,
        flownPaint: foot.stolen ? { body: foot.stolen.body, accent: foot.stolen.accent, canopy: foot.stolen.canopy } : null,
        flying: aboard && !out,
        out: aboard && out,
        x: j.x,
        y: j.y,
        height: j.z,
        heading: j.yaw,
        roll: j.roll,
        pitch: j.pitch,
        speed: out ? 0 : scene.speed,
        thrust: scene.boost,
        spin: j.stunt >= 0 && j.stuntDelay <= 0 ? j.stunt : -1,
        spinDir: j.stuntDir,
        firing: !!f && scene.time - f.firedAt < 0.12,
        hullLeft: f ? f.hull / f.stats.hull : 1,
        shieldLeft: f ? (f.stats.shield > 0 ? f.shield / f.stats.shield : 0) : 1,
        // (a new ship, still taking him aboard, is protected from the start)
        protect: f ? f.protect : out ? 0 : DAMAGE.protect,
        hull: scene.mesh.model.name,
        life: scene.room.life,
        loaded: fillOf(scene.loop.hold),
        landing: out && aboard ? 0 : scene.loop.landing.stage,
        mining: scene.loop.mining.on && scene.loop.mining.target ? scene.loop.mining.target.id : -1,
      }
    },
    get loop(): LoopStatus {
      const L = scene.loop.landing
      const b = L.base
      const j = scene.jets[0]
      if (inSpace(scene)) return spaceLoop(scene)
      const home = nearestBase(scene, j.x, j.y)
      return {
        on: scene.world.features.bases.length > 0,
        hold: scene.loop.hold.slots.map((s) => (s ? { ...s } : null)),
        fill: fillOf(scene.loop.hold),
        stage: L.stage === LANDING ? 'landing' : L.stage === LANDED ? 'landed' : L.stage === LIFTING ? 'lifting' : 'flying',
        base: b ? { id: b.id, name: b.name, owner: b.owner, capital: b.capital, friendly: friendly(scene, b) } : null,
        prompt: L.prompt,
        mining: scene.loop.mining.on,
        repair: repairStatus(scene),
        home: home
          ? {
              name: home.base.name,
              x: j.x + wrapDelta(home.base.pads[0].x - j.x),
              y: j.y + wrapDelta(home.base.pads[0].y - j.y),
              d: home.d,
              heading: Math.atan2(wrapDelta(home.base.x - j.x), -wrapDelta(home.base.y - j.y)),
            }
          : null,
        ore: nearestOre(scene, j.x, j.y),
        crates: scene.loop.crates.map((c) => ({ x: j.x + wrapDelta(c.x - j.x), y: j.y + wrapDelta(c.y - j.y), z: c.z })),
        chunks: ownChunks(scene).map((c) => ({ x: j.x + wrapDelta(c.x - j.x), y: j.y + wrapDelta(c.y - j.y), z: c.z, units: c.units })),
        bases: scene.world.features.bases.map((b) => ({
          name: b.name,
          x: j.x + wrapDelta(b.pads[0].x - j.x),
          y: j.y + wrapDelta(b.pads[0].y - j.y),
          z: b.pads[0].z,
          friendly: friendly(scene, b),
          capital: b.capital,
        })),
      }
    },
    get status(): CombatStatus {
      const f = scene.eject.stage === EJ_FLY ? ownFighter(scene) : null
      // (out of his ship, his health is his hull, so the page's warnings still work)
      const afoot = walkerFighter(scene)
      const t = scene.sights.target
      const k = scene.skirmish
      return {
        flying: !!f,
        hull: f ? f.hull / f.stats.hull : afoot ? afoot.hull / afoot.stats.hull : 0,
        shield: f && f.stats.shield > 0 ? f.shield / f.stats.shield : 0,
        heat: f ? f.heat : 0,
        jammed: !!f && f.jam > 0,
        missiles: f ? f.missiles : 0,
        missilesMax: f ? f.stats.missiles : 0,
        mines: f ? f.mines : 0,
        slip: scene.squad.slip,
        minesMax: f ? f.minesMax : 0,
        lock: f ? f.lock : 0,
        incoming: nearestThreat(scene, f).tti,
        protect: f ? f.protect : 0,
        power: powerState(scene),
        powerLevel: scene.power.level,
        safe: !!f && grounded(scene),
        speed: scene.speed,
        boost: scene.boost,
        throttle: scene.throttle,
        height: focus(scene).z,
        target:
          t && t.alive
            ? {
                x: t.jet.x,
                y: t.jet.y,
                height: t.jet.z,
                leadX: scene.sights.lead.x,
                leadY: scene.sights.lead.y,
                leadHeight: scene.sights.lead.z,
              }
            : null,
        ambushed: scene.bands.plans.some((b) => b.alerted),
        skirmish: {
          on: skirmishOn(scene),
          stage: k.stage === FIGHT ? 'fight' : k.stage === OVER ? 'over' : 'rest',
          wave: k.wave,
          score: k.score,
          best: Math.max(k.best, k.score),
          ships: k.ships,
          chain: k.chain,
          kills: k.kills,
          timer: k.timer,
        },
      }
    },
    takeSounds() {
      const list = scene.effects.events
      scene.effects.events = []
      return list
    },
  }
  // (whatever is asked of a scene, distances go the short way round its own world: sim/loop.ts setRound. Scenes on worlds
  // of other sizes may be stepped turn about, as the network's tests do)
  for (const [key, d] of Object.entries(Object.getOwnPropertyDescriptors(api))) {
    if (typeof d.value === 'function') {
      const call = d.value as (...args: unknown[]) => unknown
      d.value = function (this: Scene, ...args: unknown[]) {
        setRound(scene.world.size)
        return call.apply(this, args)
      }
    } else if (d.get) {
      const get = d.get
      d.get = function (this: Scene) {
        setRound(scene.world.size)
        return get.call(this)
      }
    } else continue
    Object.defineProperty(api, key, d)
  }
  states.set(api, scene)
  return api
}
