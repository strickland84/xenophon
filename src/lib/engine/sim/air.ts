// The way down to a world and up out of one (the polish pass, item 4): a flight through its air,
// with no cut. A world in space is a true-scale globe far below the plane (data/space.ts BELOW);
// its surface, once there, is a ground of 2048 px that wraps. The air is where one becomes the
// other, and this says how far along the ship is (`e`: 0 in the plane over the globe, 1 low over
// the ground) and what the picture should be there (render/air.ts draws it):
//
//   the globe turns to bring the place under the ship beneath it, and the ship sinks towards it;
//   its curve flattens as the ship nears it (the horizon rises and straightens), and the map is
//   drawn ever finer round that place (each world px of it ever fewer px of space: `k`), so the
//   ground rushes by faster and faster and its features never grow coarser than the ground it
//   becomes; the air thickens into a sky of the world's colour, and burns round the ship on the way.
//
// It is flown, not watched, and it is a place, not a passage: the ship steers all through it (the
// place it comes down at is where it flies to); it goes on the way it is going, and a push the
// other way turns it back (sim/travel.ts flyAir). Half way the scene changes zone (a system's space,
// or the world's surface), and the page its room.
//
// The air ends at the world's ceiling (`e` = AIR.ground): there the globe has become a flat ground
// seen from the ceiling, at the very place and size the ground itself is drawn from that height, and
// the ground takes over. Under it is the world's own sky, flown as it always is.

import { AIR, BELOW, SPACE_Z } from '../data/space'
import { theGalaxy } from '../galaxy/galaxy'
import type { Body } from '../galaxy/galaxy'
import type { SceneState } from '../state'
import { clamp } from '../util/math'
import { WORLD } from '../world/lands'
import { LIFT_FROM, LIFT_HALF } from '../render/view'

/** the share of the way at which a thing begins and ends, smoothly */
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1)
  return t * t * (3 - 2 * t)
}

/** a world's honest radius in world px: its ground wraps round once (world/lands.ts WORLD: about the size its globe is in space) */
const GROUND_R = WORLD / (Math.PI * 2)

/** the latitude of a row of a world's map (v, 0..1 pole to pole): the map is Mercator's, 85° either way (space/maps.ts) */
export const latOf = (v: number) => Math.atan(Math.sinh((v - 0.5) * Math.PI * 2))

/** the row of a world's map (0..1) at a latitude given by its sine: the opposite of latOf */
export function rowOf(sinLat: number) {
  const s = clamp(sinLat, -MERC_MOST, MERC_MOST)
  return 0.5 + Math.log((1 + s) / (1 - s)) / (4 * Math.PI)
}
/** the sine of the latitude a world's map ends at (85°) */
export const MERC_MOST = Math.tanh(Math.PI)

/** the unit normal of a world's sphere at a place on its map (the opposite of mapOfNormal) */
export function normalOfMap(spin: number, u: number, v: number) {
  const lat = latOf(v)
  const lon = (u - spin) * Math.PI * 2
  return { x: Math.cos(lat) * Math.sin(lon), y: Math.sin(lat), z: Math.cos(lat) * Math.cos(lon) }
}

/**
 * The least a place on a world's sphere may face up at the plane (its normal's z) for a ship to be over it: a ship comes
 * up out of a place that faces further away (round its edge, or on its far side) over the nearest place that faces up
 * this much, well inside the world's disc with the world under it. (It was 0.2, the disc's very edge: a ship came out of
 * its world at the rim, and was off it and could not dive back before it had turned round.)
 */
export const FACE = 0.5

/** the honest place in the plane over a place on a world's sphere (n, its normal, kept to the part that faces up) */
export function overPlace(bx: number, by: number, b: Body, n: { x: number; y: number; z: number }) {
  let { x, y, z } = n
  if (z < FACE) {
    // (a place round the edge or on the far side: the nearest place that faces the plane enough)
    const k = Math.sqrt(Math.max(0, 1 - FACE * FACE) / Math.max(1e-9, x * x + y * y))
    x *= k
    y *= k
    z = FACE
  }
  return { x: bx + x * b.size, y: by + y * b.size, z }
}

/** how high a ship in the plane is over the place under it on a world's sphere (n.z: how squarely that place faces up) */
export const heightOver = (b: Body, nz: number) => b.size * (1 + BELOW) - b.size * nz

/** the overhead view's scale for the ground at a height (render/view.ts liftScale, overhead) */
export const liftAt = (z: number) => (z > LIFT_FROM ? 1 / (1 + (z - LIFT_FROM) / LIFT_HALF) : 1)

/** what the air makes of a world at a share `e` of the way down: render/air.ts draws it so */
export interface AirShape {
  /** space px a world px of its ground takes there (its honest size in space, down to 1 on the ground): the ground runs by at the ship's speed over this */
  k: number
  /** px from the camera's nadir down to the ground, and the sphere's radius (it flattens as the ship nears it) */
  alt: number
  rc: number
  /** how much finer the map is drawn round the place under the ship, from behind and the seat and from overhead; and the cosine of that place's latitude (its map is that much smaller there) */
  zoom: number
  zoomTop: number
  cosLat: number
  /** how far round it has turned to bring that place beneath (0..1) */
  turn: number
  /** 0..1: how far its map is laid out flat round that place, as its ground lies, instead of round the globe */
  local: number
  /** 0..1: the air thickened into a sky; the fire round the ship */
  air: number
  fire: number
  /** overhead: px of the frame a px of the sphere is drawn at */
  sigma: number
  /** how far the camera looks down, as the chase view's slope (tan) adds it: down at the globe, level again low over the ground */
  look: number
  /** 0..1: how far the light has turned to fall on the place under the ship as it falls on the ground there (its time of day), from the way the whole world is lit */
  noon: number
  /** 0..1: how far through the air's own part of the way (0 in the plane, 1 at the world's ceiling, where the ground itself takes over) */
  t: number
  /** 0..1: how far the picture has gone over to the ground's own haze and sky, as the ground is seen from its ceiling */
  haze: number
}

/** in perspective, the ground under the ship is kept about this many px of the frame to a world px (a texel of the map a little over one), seen from a camera this far in front of its picture */
const NADIR = 0.55
const FOCAL = 300

/**
 * The shape of the way down at `e`, for a world `b` (its honest radius in space), the place under
 * the ship on its map at latitude `v` (0..1), the ship's honest height over it in the plane `a0`,
 * the world's ceiling `high` (where the ground itself takes over), and how large the world was drawn
 * from overhead in the plane (`rho0`, its disc's radius on the frame); `rate`: how hard the ship is climbing (to 1) or
 * sinking (to −1) through it.
 */
export function airShape(b: Body, v: number, a0: number, high: number, rho0: number, e: number, rate = 0): AirShape {
  // (a world px of the place under the ship is this many px of space on the globe: fewer nearer the poles, where the map is drawn smaller)
  const cosLat = Math.cos(latOf(v))
  const K = (b.size / GROUND_R) * cosLat
  // (how far through the air's own part of the way)
  const t = clamp(e / AIR.ground, 0, 1)
  // (the ground under the ship: from its honest depth under the plane to the ceiling's height over the ground)
  const alt = Math.pow(Math.max(1, a0), 1 - t) * Math.pow(Math.max(1, high), t)
  // (the map drawn finer as the ship sinks, so that what it sees under it keeps its fineness: soon after it begins, every texel about a pixel)
  const kNear = clamp((alt * NADIR) / FOCAL, 1, Math.max(1, K))
  const w = smooth(0, 0.4, t)
  // (and by the ceiling, where the ground itself takes over, a world px is a px)
  const k = Math.pow(Math.pow(K, 1 - w) * Math.pow(kNear, w), 1 - smooth(0.5, 1, t))
  // (from overhead the ground comes steadily to the size it is from the ceiling: its own pace)
  const kTop = Math.pow(K, 1 - t)
  // (its curve flattens: the radius grows as the ship nears the ceiling, to where its curve no longer shows)
  const s = smooth(0.25, 1, t)
  const rc = b.size / Math.max(FLATTEST, (1 - s) * (1 - s))
  const zoom = (rc / b.size) * (K / k)
  const zoomTop = (rc / b.size) * (K / kTop)
  const wa = smooth(0, 0.28, t)
  const airy = theGalaxy().worlds[b.world]?.recipe.atmosphere ?? 0
  const air = airy > 0 ? smooth(0.15, 0.9, t) : 0
  const sigma = Math.pow(rho0 / b.size, 1 - t) * Math.pow(liftAt(high), t)
  // (the camera looks down at the world, more climbing, when the world falls away under the ship; as much at the air's
  // top, where the camera is space's: there the ship comes level, and the look eases away in space, a few seconds out
  // (sim/flight.ts easeLook). It went to nothing at the top, and with the nose pitched up there the camera swung from
  // well down at the world to up at the stars and back as the ship came out: James, 2026-11-19, "the view gets all wonky")
  const look = (0.75 + 0.15 * clamp(rate, -1, 1)) * (1 - smooth(0.35, 1, t))
  return {
    k,
    alt,
    rc,
    zoom,
    zoomTop,
    cosLat,
    local: wa,
    turn: smooth(0, 0.3, t),
    air,
    fire: fireOf(b, e, Math.max(0, -rate)),
    sigma,
    look,
    noon: smooth(0, 0.4, t),
    t,
    haze: smooth(AIR.switchUp / AIR.ground, 1, t),
  }
}

/** the least a world's curve is flattened to (the share of its radius' inverse left): flat to the eye, and its numbers still exact */
const FLATTEST = 4e-4

/** 0..1: how fiercely a world's air burns round a ship `e` of the way down, sinking `rush` (0..1) as hard as it can (a moon, none) */
export function fireOf(b: Body, e: number, rush: number) {
  const airy = theGalaxy().worlds[b.world]?.recipe.atmosphere ?? 0
  // (only sinking: a ship climbing out, or holding its height, leaves the air behind it or lets it be)
  if (airy <= 0 || rush <= 0) return 0
  const f = Math.max(0, 1 - Math.abs(e - AIR.fire[0]) / AIR.fire[1])
  return f * f * (3 - 2 * f) * Math.min(1, rush * 1.25)
}

/**
 * The turn that brings a place of the sphere (its normal n) up beneath the ship, `share` of the way
 * there: a 3×3 matrix row by row (world = Q · body).
 */
export function turnUp(n: { x: number; y: number; z: number }, share: number): Float64Array {
  // (about the axis n × up, by the angle between them)
  let ax = n.y
  let ay = -n.x
  const len = Math.hypot(ax, ay)
  const ang = Math.acos(clamp(n.z, -1, 1)) * share
  if (len < 1e-9 || ang === 0) return new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
  ax /= len
  ay /= len
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const t = 1 - c
  // Rodrigues, about (ax, ay, 0)
  return new Float64Array([t * ax * ax + c, t * ax * ay, s * ay, t * ax * ay, t * ay * ay + c, -s * ax, -s * ay, s * ax, c])
}

/** two turns as one (3×3 matrices row by row): a, after b */
export function times(a: Float64Array, b: Float64Array) {
  const o = new Float64Array(9)
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  return o
}

/** a direction turned by a turn (a 3×3 matrix row by row) */
export function turned(q: Float64Array, n: { x: number; y: number; z: number }) {
  return {
    x: q[0] * n.x + q[1] * n.y + q[2] * n.z,
    y: q[3] * n.x + q[4] * n.y + q[5] * n.z,
    z: q[6] * n.x + q[7] * n.y + q[8] * n.z,
  }
}

/** the height of the ship as others see it (and the HUD says) on the way, in whichever zone it is */
export function airHeight(scene: SceneState) {
  const tr = scene.travel
  if (scene.zone.kind === 'space') {
    // (from the height it began at in the band round the plane, down into the air)
    const k = clamp(tr.e / AIR.switchDown, 0, 1)
    return SPACE_Z + tr.lift * (1 - k) - AIR.sink * k
  }
  // (on the surface side: from far over the ceiling down to it, where the ground itself takes over from the globe the
  // air makes of it)
  if (tr.e >= AIR.ground) return tr.high
  const u = clamp((AIR.ground - tr.e) / (AIR.ground - AIR.switchUp), 0, 1)
  return tr.high + u * u * AIR.over
}
