// The engine's front door: everything the rest of the app needs from it.

export { createScene, stateOf } from './scene'
export { ENEMY_PAINT } from './sim/skirmish'
export { STEP } from './sim/step'
export type { BodyState, CombatStatus, PilotState, RoomSettings, Scene, ShipState, TracesStatus, ZoneStatus } from './scene'
export type { Deed, Mark, MarkKind, TracesInput } from './sim/traces'
export type { GuideMark } from './sim/guide'
export type { TargetRef } from './sim/target'
export type { TargetStatus } from './render/targetinfo'
export { DRILL } from './data/skirmish'
export { BAND, BAND_PAINT, BAND_PAY, DANGER_NAMES, SIDE_COLOURS } from './data/bands'
export { galaxyDanger, patrolsIn, reachOf, spaceBands, systemDanger, wildness, worldDanger } from './galaxy/danger'
export type { Danger, SpaceBand } from './galaxy/danger'
export type { FeedLine, Report } from './sim/room'
export { PARKED_ID } from './sim/room'
export type { FootStatus, WalkerInput, WalkerState } from './scene'
export { FACES, lookOf, lookText, RACES, raceOf, racesOf, randomLook, SUITS, TRIMS } from './races/races'
export type { PilotLook, Race, RaceId } from './races/races'
export { RACE_ART } from './races/art'
export { createLookPaint, INK, paintLook } from './races/look'
export type { SoundEvent, SoundKind } from './sim/effects'
export { DEFAULT_PARAMS, withDefaults } from './params'
export { isResource, RESOURCE_IDS, RESOURCES } from './data/resources'
export { PAINTS, payFor, SHOP } from './data/shop'
export { BEAM, FLAK, fitEffect, MINES, MODULE_SLOTS, MODULES, moduleOf, RACK, readFit, WEAPONS, weaponOf, weaponsOn } from './data/loadout'
export type { FitEffect, Module, ModuleId, Weapon, WeaponId } from './data/loadout'
export { EMBLEMS, PATTERN_NAMES, PATTERNS } from './jet/fit'
export { makeText, readMake, MARK_COLOURS } from './sim/outfit'
export { dayOf, priceAt, pricesAt } from './galaxy/market'
export { HOLD, REDELIVERY } from './data/loop'
export { statsOf } from './data/hulls'
export { slotsOf } from './sim/cargo'
export type { Resource, ResourceId } from './data/resources'
export type { Items, LedgerEntry, LoopStatus, Stack } from './scene'
export type { BaseOwner } from './world/features'
export { buildWorld } from './world/generate'
export {
  galaxy,
  GALAXY_SEED,
  GALAXY_VERSION,
  homeWorld,
  positionAt,
  siteOf,
  startWorld,
  surfaceById,
  systemOfKey,
  theGalaxy,
  worldSettings,
} from './galaxy/galaxy'
export { buildMap, mapsFromOutside } from './space/maps'
export { buildLand, landsFromOutside } from './world/lands'
export type { Terrain } from './world/lands'
export type { SphereMap } from './space/maps'
export { CRUISE, ORBIT_SLOW } from './data/space'
// (for the page's maps, which draw in the game's own pixels: components/StarMap.svelte, maps/starmap.ts)
export { drawText, textWidth } from './render/font'
export { sphereMapOf } from './render/space'
export { bodyZ } from './sim/space'
export { LEVELS } from './space/maps'
export { SUN } from './space/art'
export { brightnessOf } from './space/pictures'
export { hash8 } from './util/math'
export { blend, pack } from './util/color'
export type { Body, Galaxy, Lane, Side, StarSystem, Surface } from './galaxy/galaxy'
export { ARCHETYPE_NAMES, handlingOf, HABITABLE } from './galaxy/recipe'
export type { Archetype, Handling, Hazard, StarKind, Weather, WorldRecipe } from './galaxy/recipe'
export { createWorld } from './world/world'
export type { World } from './world/world'
export { buildSurface } from './world/surface'
export { worldKeyOf } from './sim/planet'
export type { FlameStyle, SceneParams, TimeOfDay, ViewMode } from './params'
export type { FlameList } from './state'
export type { ShipInput } from './sim/ships'
export type { HeldControls, SceneAction } from './sim/controls'
export type { ShipColours } from './render/paint'
export { FLAME_F } from './render/jet'
export { HULL_NAMES } from './jet/model'
export { byTime, discoveryNames, EVENT_KINDS, galaxyState, habitableWorlds, nameable, pointsOf, stateSummary } from './galaxy/territory'
export type { Contributor, EventKind, GalaxyState, WorldEvent, WorldHold } from './galaxy/territory'
export { bountyOf, dailyTasks, dayOfSeconds, hotspotsOn, isHotspot, RANK_TITLES, rankOf } from './galaxy/daily'
export type { DailyTask, TaskKind } from './galaxy/daily'
export {
  BEACON_PHRASES,
  BEACON_READ,
  BOUNTY,
  CAPTURE,
  GHOST,
  HOTSPOT,
  INFLUENCE,
  JOINING_BONUS,
  QUICK_CHAT,
  RANK_POINTS,
  TRACE_LIFE,
  WRECK,
} from './data/territory'
export { DECK, FURNITURE, HANGAR, isFace, PROPS, ROOM_KINDS, SPOT_WORDS, TILE } from './data/interiors'
export type { Face, Piece } from './data/interiors'
export type { RoomKind, SpotId } from './data/interiors'
export { freeFor, openTiles, shipKit, shipRoom } from './interior/rooms'
export type { Room } from './interior/rooms'
export type { InteriorStatus } from './scene'
export { GEAR, GEAR_DEFAULT, gearOf } from './data/gear'
export type { Gear, GearSlot } from './data/gear'
export { SQUAD } from './data/squads'
export { HULL_PITCH, HULL_PRICES, NEXT_SHIP, POWER, THROTTLE } from './data/hulls'
export type { InteriorUse } from './sim/interior'
