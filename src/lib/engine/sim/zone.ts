// Zones (the plan's section 6): one scene is in one zone at a time, a place with its own
// backdrop and rules. A world's surface is one (the ground, the sea, the clouds, the weather,
// landing, mining, the pilot on foot); a star system's space is another (stars and bodies,
// gravity, the cruise drive, docking, gates). Interiors come later.
//
// Everything else works the same in every zone: ships, shots, missiles, sparks and smoke,
// other players, the camera and the HUD. A zone only says what differs, through this interface:
// how the player's ship is flown, what is stepped after every ship has moved, and what is drawn
// behind and in front of the ships. step.ts and render/renderer.ts ask the zone at those places.

import type { Jet } from '../jet/jet'
import type { Frame } from '../render/frame'
import type { Craft } from '../render/jet'
import { drawSky } from '../render/sky'
import { drawWeather, hazeWorld } from '../render/weather'
import { drawTravel } from '../render/space'
import { airOver, drawAirGlow, drawAirOver } from '../render/air'
import { drawWorld } from '../render/world'
import { drawCloudVeil, drawClouds } from '../render/clouds'
import type { SceneState } from '../state'
import { EJ_FLY, stepEject } from './ejection'
import { easeLook, flightLimits, flyLeader } from './flight'
import type { FlightLimits } from './flight'
import { ABOARD, stepFoot } from './foot'
import { stepHazards } from './hazards'
import { FLYING, moveLanding } from './landing'
import { keepWindow, settleWorld } from './planet'
import { stepSignals } from './signals'
import { stepSortie } from './sortie'
import { stepWalkers } from './walkers'
import { SPACE } from './spacezone'
import { INTERIOR } from './interior'
import { flyAir, heldUp, inAir, stepClimbOut, stepTravel } from './travel'
import { stepTraces } from './traces'
import { stepBands } from './bands'
import { stepWild } from './creatures'
import { stepTraffic } from './traffic'
import { stepDaylight } from './daylight'

export type ZoneKind = 'surface' | 'space' | 'interior'

/** what a zone does differently from every other; each hook has its place in the step or the frame */
export interface Zone {
  kind: ZoneKind
  /** first in the step: anything waiting to be built or arrived at */
  settle(scene: SceneState, dt: number): void
  /** this step's limits on the player's ship: how hard it may turn, how low and how high it may fly */
  limits(scene: SceneState, dt: number, lead: Jet, speed: number): FlightLimits
  /** the player: flying his ship, or out of it, or coming down in it */
  fly(scene: SceneState, dt: number, lead: Jet, introDone: boolean, speed: number, limits: FlightLimits): void
  /** after every ship has moved, before the shots and the damage: the zone's own things */
  after(scene: SceneState, dt: number): void
  /** what lies behind every ship (with their shadows, where there is ground for them) */
  drawBack(scene: SceneState, f: Frame, crafts: Craft[]): void
  /** the air between the camera and the ground, laid over the ground and all that stands on it, before the ships (they fade
   *  into it by themselves) */
  drawHaze(scene: SceneState, f: Frame): void
  /** what lies over every ship, under the HUD */
  drawFront(scene: SceneState, f: Frame): void
}

/** a world's surface: the height map, its sky and weather, the loop, the pilot on foot */
export const SURFACE: Zone = {
  kind: 'surface',
  settle(scene, dt) {
    settleWorld(scene, dt)
    // (a world larger than the ground the scene holds: the ground round the pilot kept in it)
    keepWindow(scene)
  },
  limits: (scene, dt, lead, speed) => flightLimits(scene, dt, lead, speed),
  fly(scene, dt, lead, introDone, speed, limits) {
    if (scene.foot.stage !== ABOARD) {
      // out of his ship: the pilot on foot (or coming down, or dead); the ship he left stands (or is on its way to him)
      stepFoot(scene, dt)
      if (!scene.jets[0].away && scene.loop.landing.stage !== FLYING) moveLanding(scene, dt, scene.jets[0])
    } else if (scene.eject.stage !== EJ_FLY) stepEject(scene, dt)
    else if (scene.loop.landing.stage !== FLYING) moveLanding(scene, dt, lead)
    else if (inAir(scene)) {
      // (in the world's air, between the top of its sky and space)
      flyAir(scene, dt, lead, introDone, speed, limits)
    } else if (heldUp(scene)) {
      // (Use held high over the ground: it climbs, as a climb held does, to the top of the sky and on up)
      const ctl = scene.controls
      const was = ctl.keyClimb
      ctl.keyClimb = scene.params.invertY ? -1 : 1
      flyLeader(scene, dt, lead, introDone, speed, limits)
      ctl.keyClimb = was
    } else flyLeader(scene, dt, lead, introDone, speed, limits)
    if (!inAir(scene)) easeLook(scene, dt, 0)
  },
  after(scene, dt) {
    stepWalkers(scene, dt)
    stepSignals(scene, dt)
    // flags, wrecks, beacons and ghosts other pilots left here
    stepTraces(scene, dt)
    // the computer's ships that live here: raiders by the rich ore, patrols between the bases; and haulers
    stepBands(scene, dt)
    stepTraffic(scene)
    // the wildlife a pilot on foot meets: grazers, hunters, spitters, the rare beast
    stepWild(scene, dt)
    // the wind, lightning, lava
    stepHazards(scene, dt)
    // the loop: landing, the laser, ore and crates, the bases' turrets
    stepSortie(scene, dt)
    // up and out into space
    stepClimbOut(scene)
    stepTravel(scene, dt)
    // the world's day turns: the light where the pilot is
    stepDaylight(scene, dt)
  },
  drawBack(scene, f, crafts) {
    // (high on the way up out of the world or down to it, it is the globe the air makes of it: render/air.ts)
    if (airOver(scene) < 1) {
      drawWorld(scene, f, crafts)
      drawClouds(scene, f)
      drawSky(scene, f)
      // (part way into the air's globe, the haze goes under it: render/air.ts)
      if (airOver(scene) > 0) hazeWorld(scene, f)
    }
    if (airOver(scene) > 0) drawAirOver(scene, f)
    drawAirGlow(scene, f)
  },
  drawHaze(scene, f) {
    // (after the props, creatures and marks on the ground: hazed before them, they stood sharp in a whiteout)
    if (airOver(scene) === 0) hazeWorld(scene, f)
  },
  drawFront(scene, f) {
    // (overhead, the clouds above the ship, over it)
    if (airOver(scene) < 1) drawCloudVeil(scene, f)
    drawWeather(scene, f)
    // (climbing out into space, and arriving from it)
    drawTravel(scene, f)
  },
}

/** the zone the scene is in now */
export const zoneOf = (scene: SceneState): Zone => ZONES[scene.zone.kind]

const ZONES: Record<ZoneKind, Zone> = { surface: SURFACE, space: SPACE, interior: INTERIOR }
