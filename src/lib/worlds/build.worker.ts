// Builds worlds of the galaxy away from the page's main thread, so arriving at one does not
// stall the game (a world takes a few hundred milliseconds to build). Asked for a world's id,
// it answers with the world's arrays, handed over rather than copied; asked for a world's map (to
// draw it from space: engine/space/maps.ts), it builds the world and answers with the map alone; asked for one of the
// maps a world's ground further on is made of (engine/world/lands.ts), with that.

import { buildLand, buildMap, buildSurface, createWorld, siteOf, surfaceById } from '../engine'
import type { Built } from './build'

/** one world to build maps in, kept (a world is several megabytes) */
let scratch: ReturnType<typeof createWorld> | null = null

self.onmessage = (e: MessageEvent<{ id: string; map?: boolean; land?: number }>) => {
  const { id, map, land } = e.data
  const surface = surfaceById(id)
  if (!surface) {
    self.postMessage({ id, map, error: `no world ${id}` })
    return
  }
  if (land) {
    // one of the maps the world's ground further on is made of (engine/world/lands.ts)
    const built = buildLand(surface.recipe, land)
    ;(self as unknown as Worker).postMessage({ id, land, ground: built } satisfies Built, [built.height.buffer, built.mat.buffer])
    return
  }
  if (map) {
    if (!scratch) scratch = createWorld()
    const built = buildMap(id, scratch)!
    const buffers = [built.idx.buffer, built.lit.buffer, ...(built.clouds ? [built.clouds.buffer] : [])]
    ;(self as unknown as Worker).postMessage({ id, map: true, sphere: built } satisfies Built, buffers)
    return
  }
  const world = createWorld()
  buildSurface(world, surface.recipe, siteOf(surface))
  const built: Built = { id, world }
  ;(self as unknown as Worker).postMessage(built, [world.height.buffer, world.mat.buffer, world.clouds.buffer, world.noise.buffer])
}
