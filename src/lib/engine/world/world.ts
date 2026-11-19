// The world is a height map: a height and a material for every ground pixel, with a map of the
// clouds floating high over it (world/sky.ts says how high). It wraps round at its edges, so the jet can fly on for ever.

import type { Jet } from '../jet/jet'
import type { Features } from './features'
import type { Lands } from './lands'
import { STANDARD_LOOK } from './look'
import type { WorldLook } from './look'
import { NMAT } from './materials'

export const N = 2048 // world size (wraps)
export const NM = N - 1
export const NSHIFT = 11

export const NC = 1024 // cloud map size (wraps)
export const NCM = NC - 1
export const NCSHIFT = 10
export const CK = 8 // cloud stack height: the steps of thickness a cloud cell holds
// (where the clouds floated until James's first play; they float far higher now, world/sky.ts: it stays as the ground's top)
export const CLOUD_ALT = 40
export const ZTOP = CLOUD_ALT + CK // the tallest the ground stands

export interface World {
  /** how tall the ground is at each ground pixel, trees included (0 is the sea) */
  height: Uint8Array
  /** what each ground pixel is made of: an index into the materials */
  mat: Uint8Array
  /** clouds: each cell holds (rank << 4) | thickness; a cloud shows when its rank is under the cover setting */
  clouds: Uint8Array
  /** 256 × 256 random bytes, for the glitter on the sea and the foam on the shore */
  noise: Uint8Array
  /** where a flight starts: over open water next to land (or over open ground, on a world with no sea) */
  spawnX: number
  spawnY: number
  /** its colours, sky, clouds and sea */
  look: WorldLook
  /** what is stamped into its ground: bases, ore, wrecks (world/features.ts; none on the island world of the settings) */
  features: Features
  /** per material: 1 for a tree's crown (a pilot on foot walks under it, hidden), marked as trees are planted */
  trees: Uint8Array
  /**
   * How far round the world is, px: places wrap at this. The island world of the settings is all in `height` and `mat`
   * (N); a world of the galaxy is far larger (world/lands.ts), `height` and `mat` a window on it round the pilot, read
   * as ever with a place masked to N.
   */
  size: number
  /** a world of the galaxy: its regions, and what the window holds (null: the world is all here) */
  lands: Lands | null
}

/** no features at all: the island world of the settings has none */
export const noFeatures = (): Features => ({ bases: [], outcrops: [], places: [] })

export function createWorld(): World {
  return {
    height: new Uint8Array(N * N),
    mat: new Uint8Array(N * N),
    clouds: new Uint8Array(NC * NC),
    noise: new Uint8Array(256 * 256),
    spawnX: N / 2,
    spawnY: N / 2,
    look: STANDARD_LOOK,
    features: noFeatures(),
    trees: new Uint8Array(NMAT),
    size: N,
    lands: null,
  }
}

/**
 * The row of the ground (world px down it) that lies along the equator of the world's globe (space/maps.ts): midway between
 * its bases the short way round, so its bases stand well clear of the poles, where the globe's map is drawn small.
 */
export function equatorOf(world: World): number {
  const R = world.size
  const bases = world.features.bases
  if (!bases.length) return R / 2
  const a = bases[0].y
  let d = (bases[1]?.y ?? a) - a
  if (d > R / 2) d -= R
  if (d < -R / 2) d += R
  return (((a + d / 2) % R) + R) % R
}

/** the row of a world's map (0..1, pole to pole) a row of its ground is, and the opposite */
export const rowOfGround = (world: World, y: number) => {
  const v = (y - equatorOf(world)) / world.size + 0.5
  return v - Math.floor(v)
}
export const groundOfRow = (world: World, v: number) =>
  ((((v - 0.5) * world.size + equatorOf(world)) % world.size) + world.size) % world.size

/** a world's look with nothing in its low ground: emptied (clearWorld), nothing is sea */
const EMPTY_LOOK: WorldLook = { ...STANDARD_LOOK, sea: 'none' }

/** the world emptied (a scene in space has no ground under it): no height, no sea, no clouds, nothing stamped into it */
export function clearWorld(world: World) {
  world.height.fill(0)
  world.mat.fill(0)
  world.clouds.fill(0)
  world.trees.fill(0)
  world.features = noFeatures()
  world.look = EMPTY_LOOK
  world.size = N
  world.lands = null
}

/** what the ground is made of at a point */
export const matAt = (world: World, x: number, y: number) => world.mat[(((y | 0) & NM) << NSHIFT) | ((x | 0) & NM)]

/** true where a point is over the sea, and the sea is one a thing falls into with a splash */
export const wetAt = (world: World, x: number, y: number) =>
  matAt(world, x, y) < 4 && (world.look.sea === 'water' || world.look.sea === 'acid')

/** true where a point is under a tree's crown */
export const treeAt = (world: World, x: number, y: number) => world.trees[matAt(world, x, y)] === 1

/** how tall the ground is at a point */
export const groundAt = (world: World, x: number, y: number) => world.height[(((y | 0) & NM) << NSHIFT) | ((x | 0) & NM)]

/** the tallest ground under a jet and along the next stretch of its path */
export function groundAhead(world: World, j: Jet, speed: number) {
  const sn = Math.sin(j.yaw)
  const cs = Math.cos(j.yaw)
  let top = 0
  for (let i = 0; i <= 4; i++) {
    const d = speed * 0.16 * i
    for (let side = -1; side <= 1; side++) {
      const h = groundAt(world, j.x + sn * d + cs * side * 7, j.y - cs * d + sn * side * 7)
      if (h > top) top = h
    }
  }
  return top
}
