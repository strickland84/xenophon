// Day and night on the worlds of the galaxy. A world turns under its sun (sim/travel.ts spinOf: once in half
// an hour to an hour, on the clock everyone shares), and the light on any place of it follows: day, the gold
// of dusk, night, dawn, day again. It is one thing seen from both sides: from space the lit side of its globe
// faces its sun and its ground turns through it into the dark; on the ground the light is what its globe
// shows at the place the pilot is, so a ship that goes down onto the bright side comes out into day, and one
// that goes down into the dark side into night.
//
// The ground has three sets of colours (render/palettes.ts: day, sunset, night). The light changes between
// them over a while, the world's own colours eased from one set to the next a step at a time, and what else
// asks the time of day (the sky's sun or moon and its stars, lit windows, each ship's own colours) changes
// over half way through.
//
// Before this every world had one time of day for ever, and from space was lit from wherever its sun
// happened to stand, so a world at noon was left as a black globe.

import { surfaceById, theGalaxy } from '../galaxy/galaxy'
import type { Body } from '../galaxy/galaxy'
import type { TimeOfDay } from '../params'
import { createPalettes, rebuildPalettes } from '../render/palettes'
import type { Palettes } from '../render/palettes'
import { invalidateCockpit } from '../render/cockpit/view'
import { paintShip } from '../render/paint'
import type { SceneState } from '../state'
import { blend } from '../util/color'
import { rowOfGround } from '../world/world'
import { ABOARD, repaintWalker } from './foot'
import { coloursOf } from './outfit'
import { repaintShips } from './ships'
import { inAir, placeNormal } from './travel'
import { repaintWalkers } from './walkers'

/**
 * The light on a world, in its own frame (x towards its sun, z up to the plane the ships fly in): from its
 * sun's side and a good way over it, so most of the side a ship can fly over and go down to is in day, its
 * far edge in dusk and night, and dawn comes round on the side that faces away.
 */
export const SUN = { x: 0.8, y: 0, z: 0.6 }

/** the sun's height (as the light's share that falls on the ground: −1 midnight, 1 noon) under which it is dusk, and under which night; and how far past either it must go to change back */
export const DAY = { dusk: -0.06, night: -0.5, slack: 0.04 }

/** seconds the world's colours take to go over from one time of day to the next; and in the world's air, where the world is turned on under a ship climbing out of it and its day comes up in a moment */
const FADE = 24
const FADE_AIR = 0.7
/** steps of the scene between two steps of the colours going over (in the air, every other step) */
const EVERY = 12

export interface Daylight {
  /** the world the light was last worked out for (another: it is set at once, with no change over) */
  key: string
  /** the sun's height where the pilot is now */
  h: number
  /** going over to another time of day: seconds left of it and how long it takes in all, what it goes to, and whether the rest has changed over yet */
  fade: number
  span: number
  next: TimeOfDay
  turned: boolean
  tick: number
  from: Palettes
  to: Palettes
}

export function createDaylight(): Daylight {
  return { key: '', h: 1, fade: 0, span: FADE, next: 'day', turned: true, tick: 0, from: createPalettes(), to: createPalettes() }
}

/** the sun's height at a place of a world's map (u across, v down, 0..1) now: 1 at noon, 0 as it sets or rises, −1 at midnight */
export function sunHeight(scene: SceneState, body: Body, u: number, v: number) {
  const n = placeNormal(scene, body, u, v)
  // (by the hour alone: every place has its whole day, near the poles too)
  return (n.x * SUN.x + n.z * SUN.z) / Math.max(0.3, Math.hypot(n.x, n.z))
}

/** the time of day a height of the sun is; `was`: what it is now, which it stays a little past either edge */
export function timeAt(h: number, was: TimeOfDay | null): TimeOfDay {
  const s = DAY.slack
  if (was === 'day') return h > DAY.dusk - s ? 'day' : h > DAY.night ? 'sunset' : 'night'
  if (was === 'night') return h < DAY.night + s ? 'night' : h < DAY.dusk ? 'sunset' : 'day'
  if (was === 'sunset') return h > DAY.dusk + s ? 'day' : h < DAY.night - s ? 'night' : 'sunset'
  return h > DAY.dusk ? 'day' : h > DAY.night ? 'sunset' : 'night'
}

/** the colours that are not the ground's own change to the scene's time of day: every ship's, every pilot's, the cockpit's */
function repaintRest(scene: SceneState) {
  repaintShips(scene)
  repaintWalkers(scene)
  repaintWalker(scene)
  if (!scene.foot.stolen) paintShip(scene.paint, scene.mesh.model, coloursOf(scene.params), scene.params.timeOfDay)
  invalidateCockpit(scene)
}

const COLOURS = ['outline', 'cloudUnder', 'haze', 'sun', 'sunGlow', 'sparkA', 'sparkB', 'foam'] as const
const LISTS = [
  'topLit',
  'topShade',
  'sideLit',
  'sideShade',
  'cloudTop',
  'cloudSide',
  'sheet',
  'trail',
  'sky',
  'strataLit',
  'strataShade',
] as const

/** `out`: the colours `k` of the way (0..1) from `a` to `b`; what is not a colour is `a`'s until half way, then `b`'s */
function mixPalettes(out: Palettes, a: Palettes, b: Palettes, k: number) {
  const q = Math.round(Math.max(0, Math.min(1, k)) * 256)
  for (const key of LISTS) {
    const o = out[key]
    const x = a[key]
    const y = b[key]
    for (let i = 0; i < o.length; i++)
      o[i] = x[i] === y[i] ? y[i] : x[i] === 0 || y[i] === 0 ? (q < 128 ? x[i] : y[i]) : blend(x[i], y[i], q)
  }
  for (const key of COLOURS) out[key] = blend(a[key], b[key], q)
  const late = q < 128 ? a : b
  out.sunX = late.sunX
  out.sunY = late.sunY
  out.flow = late.flow
  out.starsByDay = late.starsByDay
  out.banded.set(late.banded)
  out.dust = a.dust.map((c, i) => c + (b.dust[i] - c) * (q / 256))
}

/** a copy of a set of colours, into `out` */
function copyPalettes(out: Palettes, from: Palettes) {
  mixPalettes(out, from, from, 1)
}

/** the world of the galaxy the scene is on (null: in space, inside, or on the island world of the settings, which keeps its own time of day) */
function worldUnder(scene: SceneState): Body | null {
  if (scene.zone.kind !== 'surface' || !scene.planet) return null
  const s = surfaceById(scene.params.world)
  return s ? theGalaxy().bodies[s.body] : null
}

/** the light where the pilot is, a step on: set at once on arriving at a world, and going over as its day turns */
export function stepDaylight(scene: SceneState, dt: number) {
  const d = scene.daylight
  const body = worldUnder(scene)
  if (!body) {
    d.key = ''
    d.fade = 0
    return
  }
  const p = scene.params
  const at = scene.foot.stage !== ABOARD ? scene.foot.walker.jet : scene.jets[0]
  const u = at.x / scene.world.size - Math.floor(at.x / scene.world.size)
  d.h = sunHeight(scene, body, u, rowOfGround(scene.world, at.y))
  const look = scene.world.look
  const light = scene.planet?.light ?? null
  if (d.key !== scene.worldKey) {
    // arrived: the light as it is here, now
    d.key = scene.worldKey
    d.fade = 0
    const now = timeAt(d.h, null)
    if (now !== p.timeOfDay) {
      p.timeOfDay = now
      rebuildPalettes(scene.pal, p, look, light)
      repaintRest(scene)
    }
    return
  }
  if (d.fade <= 0) {
    const want = timeAt(d.h, p.timeOfDay)
    if (want === p.timeOfDay) return
    d.next = want
    d.span = inAir(scene) ? FADE_AIR : FADE
    d.fade = d.span
    d.turned = false
    d.tick = 0
    copyPalettes(d.from, scene.pal)
    rebuildPalettes(d.to, { ...p, timeOfDay: want }, look, light)
  }
  d.fade -= dt
  const k = 1 - Math.max(0, d.fade) / d.span
  if (!d.turned && k >= 0.5) {
    d.turned = true
    p.timeOfDay = d.next
    repaintRest(scene)
  }
  if (d.fade <= 0) copyPalettes(scene.pal, d.to)
  else if (d.tick++ % (d.span < FADE ? 2 : EVERY) === 0) mixPalettes(scene.pal, d.from, d.to, k)
}
