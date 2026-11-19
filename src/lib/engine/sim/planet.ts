// Which world the scene is over: building it (or taking one built elsewhere, off the page's
// main thread), its colours, and arriving at it. The `world` setting names a world of the
// galaxy (galaxy/galaxy.ts); left empty, the world is the island world `seed` and `land` make,
// as it always was.

import { siteOf, surfaceById, systemOfKey } from '../galaxy/galaxy'
import { createSpace } from './space'
import { startInSpace } from './travel'
import type { SceneParams } from '../params'
import { rebuildPalettes } from '../render/palettes'
import type { SceneState } from '../state'
import { buildWorld } from '../world/generate'
import { buildSurface } from '../world/surface'
import { bringWindow, landsAhead, makeLands, WORLD } from '../world/lands'
import { createWorld, N } from '../world/world'
import { setRound } from './loop'
import { settlePlaces } from '../world/places'
import { focus } from './ejection'
import { outcropsBack } from './mining'
import { createEffects } from './effects'
import { resetFlight } from './flight'
import { syncWingmen } from './formation'
import { createGuns } from './guns'
import { createParticles } from './particles'
import { createSkirmish } from './skirmish'
import { createWeather } from './hazards'
import { startAtBase } from './bases'
import { createLanding } from './landing'
import { createMining } from './mining'
import { ABOARD, endStolen, SHIP_WITH } from './foot'
import { FOOT } from '../data/foot'
import { createSignals } from './signals'
import { placeVeins } from './veins'

/** the name of the world the settings ask for: a galaxy world's id, or the island world's seed and land */
export const worldKeyOf = (p: SceneParams) => p.world || `islands-${p.seed}-${Math.round(p.land * 100)}`

/** builds the world the settings ask for (or takes the one handed in, if it is that one), and its colours */
export function buildPlanet(scene: SceneState) {
  const p = scene.params
  const key = worldKeyOf(p)
  const surface = p.world ? surfaceById(p.world) : null
  scene.planet = surface?.recipe ?? null
  const w = scene.world
  if (surface) {
    // a world of the galaxy: far larger than the ground the scene holds (world/lands.ts). The world as it was built (here,
    // or handed in built) is the region its bases stand in; the scene's own ground is a window on the whole of it
    let home = scene.given && scene.given.key === key ? scene.given.world : null
    if (!home) {
      home = createWorld()
      buildSurface(home, surface.recipe, siteOf(surface))
    }
    const lands = makeLands(surface.id, surface.recipe, home)
    w.look = home.look
    w.trees = home.trees
    w.clouds = home.clouds
    w.noise = home.noise
    w.features = home.features
    w.spawnX = home.spawnX
    w.spawnY = home.spawnY
    w.size = WORLD
    w.lands = lands
    // (the window on all of the home region to begin with: what is laid out over it now reads its true ground)
    bringWindow(w, lands.ox + N / 2, lands.oy + N / 2)
    // (and the places that stand in it, beyond its bases: world/places.ts)
    settlePlaces(w, surface.recipe, lands.ox + N / 2, lands.oy + N / 2, [])
  } else {
    buildWorld(w, p.seed, p.land)
    w.size = N
    w.lands = null
  }
  setRound(w.size)
  scene.given = null
  if (scene.worldKey !== key) scene.arrivedAt = scene.time
  scene.worldKey = key
  scene.weather = createWeather(scene.planet)
  repaintWorld(scene)
  // the veins a pilot on foot can cut, where a ship cannot set down (sim/veins.ts)
  scene.foot.veins = placeVeins(scene)
  // (placed within one lap of the home region, which wraps onto itself: each as the place of the world it is)
  const lands = w.lands
  if (lands)
    for (const v of scene.foot.veins) {
      v.x = lands.ox + ((((v.x - lands.ox) % N) + N) % N)
      v.y = lands.oy + ((((v.y - lands.oy) % N) + N) % N)
    }
  scene.foot.veinTaken.clear()
}

/**
 * Keeps the scene's ground round whoever it follows, on a world larger than it holds (world/lands.ts): the ground that has
 * come within reach is written in, a chunk a step (`all`: all of it at once, on arriving somewhere), and what stands in
 * it is shown as it stands now (an outcrop mined out is not whole again).
 */
export function keepWindow(scene: SceneState, all = false) {
  const w = scene.world
  if (!w.lands || scene.zone.kind === 'space') return
  const at = focus(scene)
  const wrote = bringWindow(w, at.x, at.y, all ? 64 : 1)
  if (wrote.length) outcropsBack(scene)
  // (and the places out over the world whose ground is all there now: world/places.ts)
  if (scene.planet && (wrote.length || all)) settlePlaces(w, scene.planet, at.x, at.y, wrote)
  // (the ground further on asked for now, to be built off the page's main thread before it is flown to)
  landsAhead(w, at.x, at.y)
}

/** the world's colours, for its look, the light of its sun and the time of day */
export function repaintWorld(scene: SceneState) {
  rebuildPalettes(scene.pal, scene.params, scene.world.look, scene.planet?.light ?? null)
}

/**
 * Arriving at another world: nothing comes along from the last one (its ships, shots, smoke
 * and wrecks, its waves), and the player starts afresh at the new world's start.
 */
export function arrive(scene: SceneState) {
  // (from space, too: the scene is on a surface now)
  if (scene.zone.kind !== 'surface') {
    scene.zone.kind = 'surface'
    const course = scene.space.course
    scene.space = createSpace()
    scene.space.course = course
  }
  const best = Math.max(scene.skirmish.best, scene.skirmish.score)
  for (const s of scene.ships) if (s.jet.fighter) s.jet.fighter.alive = false
  scene.ships.length = 0
  for (const m of scene.missiles) m.on = false
  scene.guns = createGuns()
  scene.effects = createEffects()
  scene.particles = createParticles()
  scene.skirmish = { ...createSkirmish(), best }
  scene.wingReturn.fill(0)
  scene.room.reports.length = 0
  // the loop: nothing lying about from the last world comes along (the hold does), and the pilot begins at a base
  const loop = scene.loop
  loop.chunks.length = 0
  loop.crates.length = 0
  loop.taken.clear()
  loop.landing = createLanding()
  loop.mining = createMining()
  // (a pilot on foot, or coming down, or dead, arrives in his ship; other pilots on foot and their signals stay behind)
  const foot = scene.foot
  if (foot.stolen) endStolen(scene)
  foot.stage = ABOARD
  foot.ship = SHIP_WITH
  foot.walker.fighter.alive = true
  foot.walker.fighter.hull = FOOT.health
  scene.walkers.length = 0
  scene.signals = createSignals()
  resetFlight(scene)
  syncWingmen(scene)
  startAtBase(scene)
}

/** a changed seed or share of land rebuilds the world, once the setting has stopped moving; another world is arrived at */
export function settleWorld(scene: SceneState, dt: number) {
  const { rig } = scene
  if (scene.worldDirty > 0) {
    scene.worldDirty -= dt
    if (scene.worldDirty <= 0) {
      // (a system's space, asked for: the scene goes there, docked if it can be)
      const system = systemOfKey(scene.params.world)
      if (scene.arriving && system >= 0) {
        startInSpace(scene, system)
        scene.arriving = false
        scene.reseat = false
        return
      }
      buildPlanet(scene)
      const world = scene.world
      if (scene.arriving) {
        arrive(scene)
        scene.arriving = false
        scene.reseat = false
      } else if (scene.reseat) {
        const dx = world.spawnX - scene.jets[0].x
        const dy = world.spawnY - scene.jets[0].y
        for (const j of scene.jets) {
          j.x += dx
          j.y += dy
          j.trailLen = 0
          j.lastTrailX = j.x
          j.lastTrailY = j.y
        }
        rig.follow.x += dx
        rig.follow.y += dy
        scene.reseat = false
      }
    }
  }
}
