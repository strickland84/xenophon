// The scene's settings: everything that can be changed from outside while it runs.

import { DEFAULT_HULL } from './jet/model'
import { clamp } from './util/math'

export type TimeOfDay = 'day' | 'sunset' | 'night'
export type ViewMode = 'top' | 'chase' | 'cockpit'
export type FlameStyle = 'pixel' | 'realistic'

export interface SceneParams {
  speed: number // px per second
  boost: number // how many times faster it flies while the thrusters are held open
  agility: number // max turn rate, rad per second
  altitude: number // cruising height, px above the sea
  ceiling: number // the highest it can climb, px above the sea (at most CEILING_MOST)
  clearance: number // the closest it gets to the ground, trees and water, px
  bank: number // max bank angle, degrees
  spread: number // px between slices (1 = stacked)
  jetScale: number // size of the jet against the world (1 = one art pixel per world pixel)
  cameraFollow: number // 0 = north-up camera, 1 = camera turns with the jet
  view: ViewMode // overhead, from behind the jet, or from the pilot's seat
  chaseDistance: number // how far behind the jet the chase camera sits, in jet lengths
  chaseAngle: number // how high above the jet it sits, degrees
  chaseSize: number // how wide the jet is drawn in the chase view, as a share of the frame
  transition: number // seconds the camera takes to move between the views
  timeOfDay: TimeOfDay
  clouds: number // 0..1 cover
  land: number // 0..1 share of land
  seed: number
  world: string // which world of the galaxy it is over ('w12': galaxy/galaxy.ts); '' for the island world `seed` and `land` make
  climb: number // how fast it climbs and dives, as a share of the standard (a world's gravity sets it: galaxy/recipe.ts)
  afterburner: number // 0..1
  flameStyle: FlameStyle // flames drawn in pixels like the jet, or as smooth fire laid over the picture
  trails: boolean
  wingmen: number // 0..2
  shadow: boolean
  followPointer: boolean
  invertY: boolean // up and down work like a flight stick: pull down to climb, push up to dive
  crash: boolean // a dive held into the ground crashes the jet: the pilot ejects and is picked up by a new one
  stunts: boolean
  wander: boolean // a ship with nobody steering it flies itself about (the page turns it off: a pilot's ship holds its course)
  intro: boolean
  hull: string // which ship: a name from jet/models
  bodyColor: string
  accentColor: string
  canopyColor: string
  skirmish: boolean // alone over the island world with no side: waves of enemy ships come to fight, and a score is kept (in the galaxy, enemies belong to places)
  locals: boolean // the galaxy's own ships: raider bands, a derelict's drones, each side's patrols, haulers (sim/bands.ts, traffic.ts)
  hud: boolean // the flight HUD: hull, shield, guns, missiles, target marker, radar, score
  hudScale: number // the HUD's text, 1 or 2 game pixels a font pixel (2 where an art pixel is small on the screen, or the player asks for larger text)
  hudMotion: boolean // the HUD's own motion (bars that drain, words that come in, a shake when hit); false: Reduce motion
  side: '' | 'nomarchy' | 'anarchoi' // the player's side: whose bases are his (he starts landed at one of them, and raiders come for his cargo); '' none
  useKey: string // what the HUD calls the Land / use button in its prompts ('F', a controller's 'B')
  powerKey: string // what it calls the power switch ('P', a controller's 'D-PAD DOWN')
  mineKey: string // what it calls the mining laser's control ('R', a controller's 'L1')
  seatKey: string // what it calls the seat key, up out of the seat in flight and back ('G', a controller's 'L3')
  cruiseKey: string // what it calls the cruise drive's key ('J', as Elite's frame shift drive; a controller's 'R1')
  mouseRing: boolean // from behind and the seat, the mouse's stick drawn on the HUD: a ring for its middle, a line to the pointer
  coldStart: boolean // a ship landed or docked sits powered off until its pilot switches it on: where he begins, a new ship, and once he has left it (sim/power.ts); false: always powered, as before
  parts: string // the modules fitted to the player's ship, by id, with commas between (data/loadout.ts)
  weapons: string // the weapon on each of its mounts, by id, with commas between ('' or 'cannon': the hull's own cannon)
  trimColor: string // the colour of its fitted parts and its pattern ('' the body's)
  glowColor: string // its engines' glow and flames ('' the hull's own)
  trailColor: string // its wingtip trails ('' the sky's)
  pattern: string // a pattern on its body (jet/fit.ts PATTERNS: '' plain)
  emblem: string // the emblem on its left wing (jet/fit.ts EMBLEMS: '' none)
  factionMark: boolean // the side's mark on its right wing
  gear: string // what the pilot wears on foot, by id, with commas between (data/gear.ts: tool, sidearm, lining, pack, gadget)
  look: string // the pilot's race and look (races/races.ts lookText: race.face.skin.eyes.suit.trim); '' his side's first race, plain
  shake: number // 0..1: how hard the picture shakes when something bursts near or hits (1 as it is; less for a player it bothers)
}

/** the highest the ceiling setting goes */
export const CEILING_MOST = 4000

export const DEFAULT_PARAMS: SceneParams = {
  speed: 92,
  boost: 1.8,
  agility: 1.25,
  altitude: 64,
  ceiling: 1500,
  clearance: 7,
  bank: 52,
  spread: 1,
  jetScale: 1,
  cameraFollow: 0.6,
  view: 'top',
  chaseDistance: 4.5,
  chaseAngle: 12,
  chaseSize: 0.11,
  transition: 1.4,
  timeOfDay: 'day',
  clouds: 0.45,
  land: 0.33,
  seed: 7,
  world: '',
  climb: 1,
  afterburner: 0.8,
  flameStyle: 'pixel',
  trails: true,
  wingmen: 0,
  shadow: true,
  followPointer: true,
  invertY: true,
  crash: true,
  stunts: true,
  wander: true,
  intro: true,
  hull: DEFAULT_HULL,
  bodyColor: '#545969',
  accentColor: '#f0580e',
  canopyColor: '#1e8ca0',
  skirmish: true,
  locals: true,
  hud: true,
  hudScale: 1,
  hudMotion: true,
  side: '',
  useKey: 'F',
  powerKey: 'P',
  mineKey: 'R',
  seatKey: 'G',
  cruiseKey: 'J',
  mouseRing: true,
  coldStart: false,
  parts: '',
  weapons: '',
  trimColor: '',
  glowColor: '',
  trailColor: '',
  pattern: '',
  emblem: '',
  factionMark: false,
  gear: '',
  look: '',
  shake: 1,
}

/** the ceiling, px above the sea, within what it may be */
export const ceilingOf = (p: SceneParams) => clamp(p.ceiling, 20, CEILING_MOST)

const PARAM_KEYS = Object.keys(DEFAULT_PARAMS) as (keyof SceneParams)[]

/** a full set of settings from a partial one: anything left out (or null) falls back to its default */
export function withDefaults(partial: Partial<SceneParams>): SceneParams {
  const params: Record<string, unknown> = { ...DEFAULT_PARAMS }
  for (const key of PARAM_KEYS) {
    const value = partial[key]
    if (value !== undefined && value !== null) params[key] = value
  }
  return params as unknown as SceneParams
}
