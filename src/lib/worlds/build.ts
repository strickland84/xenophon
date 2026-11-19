// Building worlds of the galaxy off the page's main thread (build.worker.ts), for arriving at
// one without a stall: the scene is handed the built world (Scene.giveWorld) before it goes
// there; and the maps it draws worlds from in space (Scene.givePlanetMap). Where workers cannot
// be had, the scene builds them itself, as it needs them.

import type { SphereMap, Terrain, World } from '../engine'

/** what the worker sends back: a world, or a world's map, or why there is none */
export interface Built {
  id: string
  map?: boolean
  world?: World
  sphere?: SphereMap
  /** one of the maps a world's ground is made of: which, and the ground */
  land?: number
  ground?: Terrain
  error?: string
}

let worker: Worker | null = null
let failed = false
const waiting = new Map<string, ((world: World | null) => void)[]>()
const waitingMaps = new Map<string, ((map: SphereMap | null) => void)[]>()
const waitingLands = new Map<string, ((land: Terrain | null) => void)[]>()

function start(): Worker | null {
  if (worker || failed) return worker
  try {
    worker = new Worker(new URL('./build.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Built>) => {
      const { id, world, map, sphere, land, ground } = e.data
      if (land) {
        for (const done of waitingLands.get(`${id}:${land}`) ?? []) done(ground ?? null)
        waitingLands.delete(`${id}:${land}`)
        return
      }
      if (map) {
        for (const done of waitingMaps.get(id) ?? []) done(sphere ?? null)
        waitingMaps.delete(id)
        return
      }
      for (const done of waiting.get(id) ?? []) done(world ?? null)
      waiting.delete(id)
    }
    worker.onerror = () => {
      // (a worker that will not run: every world is built by the scene from now on)
      failed = true
      worker = null
      for (const list of waiting.values()) for (const done of list) done(null)
      for (const list of waitingMaps.values()) for (const done of list) done(null)
      for (const list of waitingLands.values()) for (const done of list) done(null)
      waiting.clear()
      waitingMaps.clear()
      waitingLands.clear()
    }
  } catch {
    failed = true
    worker = null
  }
  return worker
}

/** builds a world of the galaxy ('w12') off the main thread; null if it cannot be (the scene will build it itself) */
export function buildOffThread(id: string): Promise<World | null> {
  const w = start()
  if (!w) return Promise.resolve(null)
  return new Promise((resolve) => {
    const list = waiting.get(id)
    if (list) list.push(resolve)
    else {
      waiting.set(id, [resolve])
      w.postMessage({ id })
    }
  })
}

/** builds a world's map for drawing it from space ('w12') off the main thread; null if it cannot be */
export function buildMapOffThread(id: string): Promise<SphereMap | null> {
  const w = start()
  if (!w) return Promise.resolve(null)
  return new Promise((resolve) => {
    const list = waitingMaps.get(id)
    if (list) list.push(resolve)
    else {
      waitingMaps.set(id, [resolve])
      w.postMessage({ id, map: true })
    }
  })
}

/** builds one of the maps a world's ground further on is made of ('w12:3') off the main thread; null if it cannot be (the scene builds it itself, when it comes to it) */
export function buildLandOffThread(key: string): Promise<Terrain | null> {
  const w = start()
  const [id, k] = key.split(':')
  if (!w || !id || !Number(k)) return Promise.resolve(null)
  return new Promise((resolve) => {
    const list = waitingLands.get(key)
    if (list) list.push(resolve)
    else {
      waitingLands.set(key, [resolve])
      w.postMessage({ id, land: Number(k) })
    }
  })
}
