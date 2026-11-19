// Builds a world's surface from its recipe (galaxy/recipe.ts): one shaping function per
// archetype, each with its own materials and look. The archipelago is the island world the
// game has always had, built exactly as before; only its colours may differ. Then its bases,
// ore and wrecks are stamped into it (world/features.ts).

import type { WorldRecipe } from '../galaxy/recipe'
import { archipelagoLooks } from './archetypes/archipelago'
import { buildCanyon } from './archetypes/canyon'
import { buildContinental } from './archetypes/continental'
import { buildIce } from './archetypes/ice'
import { buildJungle } from './archetypes/jungle'
import { buildMesa } from './archetypes/mesa'
import { buildMoon } from './archetypes/moon'
import { buildOcean } from './archetypes/ocean'
import { buildVolcanic } from './archetypes/volcanic'
import { stampFeatures } from './features'
import type { BaseOwner } from './features'
import { buildWorld } from './generate'
import { noFeatures } from './world'
import type { World } from './world'

/** where a world is: whose home system it is in (if anyone's), and whether it is that side's capital world (galaxy.ts, siteOf) */
export interface WorldSite {
  home: BaseOwner
  capital: boolean
}

/** a surface as built: everything buildSurface writes into a world */
export interface BuiltSurface {
  height: Uint8Array
  mat: Uint8Array
  clouds: Uint8Array
  noise: Uint8Array
  trees: Uint8Array
  spawnX: number
  spawnY: number
  look: World['look']
  features: World['features']
}

/** a place to keep surfaces once built, by what they were built from: the tests give one (testing/surfaces.ts), so
 * the same world is not built again by every flight that flies over it; the game gives none */
export interface SurfaceCache {
  get(key: string): BuiltSurface | undefined
  set(key: string, built: BuiltSurface): void
}
let cache: SurfaceCache | null = null
export const setSurfaceCache = (c: SurfaceCache | null) => (cache = c)

/** fills `world` in with the surface a recipe describes, and stamps its features (`site` says whose its bases are), unless told not to */
export function buildSurface(world: World, r: WorldRecipe, site: WorldSite = { home: null, capital: false }, features = true) {
  if (!cache) return build(world, r, site, features)
  const key = JSON.stringify([r, site, features, world.height.length, world.clouds.length])
  const kept = cache.get(key)
  if (kept) {
    world.height.set(kept.height)
    world.mat.set(kept.mat)
    world.clouds.set(kept.clouds)
    world.noise.set(kept.noise)
    world.trees.set(kept.trees)
    world.spawnX = kept.spawnX
    world.spawnY = kept.spawnY
    world.look = structuredClone(kept.look)
    world.features = structuredClone(kept.features)
    return
  }
  build(world, r, site, features)
  cache.set(key, {
    height: world.height.slice(),
    mat: world.mat.slice(),
    clouds: world.clouds.slice(),
    noise: world.noise.slice(),
    trees: world.trees.slice(),
    spawnX: world.spawnX,
    spawnY: world.spawnY,
    look: structuredClone(world.look),
    features: structuredClone(world.features),
  })
}

function build(world: World, r: WorldRecipe, site: WorldSite, features: boolean) {
  world.features = noFeatures()
  world.trees.fill(0)
  switch (r.archetype) {
    case 'archipelago':
      buildWorld(world, r.seed, r.land)
      world.look = archipelagoLooks[r.palette % archipelagoLooks.length]
      break
    case 'continental':
      buildContinental(world, r)
      break
    case 'canyon':
      buildCanyon(world, r)
      break
    case 'ice':
      buildIce(world, r)
      break
    case 'volcanic':
      buildVolcanic(world, r)
      break
    case 'jungle':
      buildJungle(world, r)
      break
    case 'mesa':
      buildMesa(world, r)
      break
    case 'ocean':
      buildOcean(world, r)
      break
    case 'moon':
      buildMoon(world, r)
      break
  }
  // (a map of ground only, for a region where nothing of the world's own stands: world/lands.ts)
  if (features) stampFeatures(world, r, site.home, site.capital)
}
