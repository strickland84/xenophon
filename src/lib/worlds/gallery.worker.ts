// Draws the gallery's pictures away from the page's main thread: for each world asked for, it
// builds the world, draws a frame of it from above with the game's own renderer (its light,
// clouds and weather), and a small map of the whole of it, and sends both back.

import { buildSurface, createScene, createWorld, siteOf, STEP, surfaceById, withDefaults, worldSettings } from '../engine'
import type { Scene } from '../engine'
import { MAP, SHOT_H, SHOT_W } from './shot'
import type { Shot } from './shot'

let scene: Scene | null = null

/** a map of the whole world: each pixel the colour of the ground there, darker on slopes facing away from the sun */
function mapOf(world: ReturnType<typeof createWorld>, light: number[] | null): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(MAP * MAP * 4)
  const step = 2048 / MAP
  for (let y = 0; y < MAP; y++)
    for (let x = 0; x < MAP; x++) {
      const gx = x * step
      const gy = y * step
      const o = (gy << 11) | gx
      const c = world.look.top[world.mat[o]] ?? [255, 0, 255]
      const h = world.height[o]
      const hn = world.height[(((gy - 6) & 2047) << 11) | ((gx - 6) & 2047)]
      const f = hn > h + 1 ? 0.74 : h > hn + 1 ? 1.12 : 1
      const i = (y * MAP + x) * 4
      out[i] = c[0] * f * (light?.[0] ?? 1)
      out[i + 1] = c[1] * f * (light?.[1] ?? 1)
      out[i + 2] = c[2] * f * (light?.[2] ?? 1)
      out[i + 3] = 255
    }
  return out
}

self.onmessage = (e: MessageEvent<{ id: string }>) => {
  const { id } = e.data
  const surface = surfaceById(id)
  if (!surface) return
  const start = performance.now()
  const world = createWorld()
  buildSurface(world, surface.recipe, siteOf(surface))
  const ms = performance.now() - start
  const map = mapOf(world, surface.recipe.light)
  const params = withDefaults({ ...worldSettings(id), intro: false, skirmish: false, hud: false, wingmen: 0, trails: false })
  if (!scene) {
    // (one scene for every picture: it is handed each world built, rather than building it again)
    scene = createScene({ ...params, world: '' })
    scene.resize(SHOT_W, SHOT_H)
  }
  scene.giveWorld(id, world)
  scene.setParams(params)
  for (let i = 0; i < 40; i++) scene.step(STEP)
  const frame = scene.render().slice()
  const shot: Shot = { id, frame, map, ms }
  ;(self as unknown as Worker).postMessage(shot, [frame.buffer, map.buffer])
}
