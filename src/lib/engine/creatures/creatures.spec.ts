import { describe, expect, it } from 'vitest'
import { createScene, DEFAULT_PARAMS, stateOf } from '../index'
import { startClimbOut } from '../sim/travel'
import { CREATURES, FAUNA, WILD } from '../data/creatures'
import { RESOURCES } from '../data/resources'
import { priceAt } from '../galaxy/market'
import { HABITABLE } from '../galaxy/recipe'
import { theGalaxy } from '../galaxy/galaxy'
import { pickWorld } from '../testing/pick'
import { placeWild, wildBack, strikeCreature, DEAD } from '../sim/creatures'
import { wrapDelta } from '../sim/loop'
import { CREATURE_ART, LOOT_ART } from './art'

/** a scene landed at a base of the first world of a kind, a pilot of the Nomarchy, the world's life on */
function sceneOn(kind: string) {
  const scene = createScene({ ...DEFAULT_PARAMS, ...pickWorld(kind), side: 'nomarchy', intro: false, skirmish: false, locals: true })
  scene.resize(240, 135)
  scene.setClock(1_800_000_000)
  scene.step(1 / 60)
  return scene
}

describe('the worlds’ creatures', () => {
  it('has art for every kind, and every kind lives somewhere', () => {
    for (const k of CREATURES) {
      expect(CREATURE_ART[k.id], k.id).toBeTruthy()
      expect(CREATURE_ART[k.id].sides.length).toBe(k.way === 'lurk' ? 2 : 5)
      const lives = Object.values(FAUNA).some((f) => f.common.some(([id]) => id === k.id) || f.hunters.some(([id]) => id === k.id))
      expect(lives || k.way === 'brute', k.id).toBe(true)
    }
    for (const id of ['hide', 'chitin', 'gland', 'heartstone', 'credits']) expect(LOOT_ART[id], id).toBeTruthy()
  })

  it('every habitable kind of world has its own life, and a moon none', () => {
    for (const kind of HABITABLE) expect(FAUNA[kind].common.length + FAUNA[kind].hunters.length, kind).toBeGreaterThan(0)
    expect(FAUNA.moon.common.length + FAUNA.moon.hunters.length).toBe(0)
  })

  it('places the same groups in every game, away from the bases, on ground they can stand on', () => {
    for (const kind of ['continental', 'ocean', 'volcanic', 'jungle']) {
      const a = stateOf(sceneOn(kind))!
      const b = stateOf(sceneOn(kind))!
      const ga = placeWild(a)
      // (an ocean world is nearly all sea: a few crabs on its atolls' shores)
      expect(ga.length, kind).toBeGreaterThan(kind === 'ocean' ? 1 : 5)
      expect(JSON.stringify(placeWild(b))).toBe(JSON.stringify(ga))
      for (const g of ga)
        for (const base of a.world.features.bases)
          expect(Math.hypot(wrapDelta(base.x - g.x), wrapDelta(base.y - g.y))).toBeGreaterThanOrEqual(WILD.awayFromBases)
    }
  })

  it('wakes the creatures near a pilot on foot, and a shot kills one that drops what it carries', () => {
    const scene = sceneOn('continental')
    const s = stateOf(scene)!
    scene.act('use')
    for (let i = 0; i < 60; i++) scene.step(1 / 60)
    expect(scene.foot.stage).toBe('walking')
    // (the pilot put down by the nearest group's home)
    const home = s.wild.groups.reduce((a, g) =>
      Math.hypot(wrapDelta(g.x - s.foot.walker.jet.x), wrapDelta(g.y - s.foot.walker.jet.y)) <
      Math.hypot(wrapDelta(a.x - s.foot.walker.jet.x), wrapDelta(a.y - s.foot.walker.jet.y))
        ? g
        : a,
    )
    s.foot.walker.jet.x = home.x + 120
    s.foot.walker.jet.y = home.y
    scene.step(1 / 60)
    const c = s.wild.up.find((x) => x.group === home)
    expect(c, 'a creature up by its home').toBeTruthy()
    // (struck by the pilot's sidearm until it falls)
    for (let i = 0; i < 40 && c!.mode !== DEAD; i++) strikeCreature(s, c!, 9, s.foot.walker.fighter, c!.x, c!.y, c!.z + 2, 1, 0)
    expect(c!.mode).toBe(DEAD)
    expect(s.wild.dead.size).toBe(1)
    const until = [...s.wild.dead.values()][0]
    expect(until - s.loop.clock).toBeGreaterThanOrEqual(WILD.away)
    expect(until).toBe(wildBack(s.worldKey, home.id, s.loop.clock + s.time))
  })

  it('leaves a world’s creatures behind on it: none follow him up into space (James saw them there)', () => {
    const scene = sceneOn('continental')
    const s = stateOf(scene)!
    scene.act('use')
    for (let i = 0; i < 60; i++) scene.step(1 / 60)
    const home = s.wild.groups[0]
    s.foot.walker.jet.x = home.x + 120
    s.foot.walker.jet.y = home.y
    scene.step(1 / 60)
    expect(s.wild.up.length, 'creatures up round him').toBeGreaterThan(0)
    // (back aboard, off the ground, and up out of the world through its air, as a pilot climbs out)
    const ship = s.jets[0]
    s.foot.walker.jet.x = ship.x + 6
    s.foot.walker.jet.y = ship.y
    for (let i = 0; i < 240 && scene.foot.stage !== 'ship'; i++) {
      if (i % 20 === 0) scene.act('use')
      scene.step(1 / 60)
    }
    expect(scene.foot.stage).toBe('ship')
    for (let i = 0; i < 300 && scene.loop.stage !== 'flying'; i++) {
      scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: true })
      scene.step(1 / 60)
    }
    scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    startClimbOut(s)
    // (a climb held, on up through its air)
    scene.setControls({ turn: 0, climb: -1, boost: 0, fire: false, secondary: false })
    for (let i = 0; i < 60 * 20 && scene.zone.kind !== 'space'; i++) scene.step(1 / 60)
    for (let i = 0; i < 30; i++) scene.step(1 / 60)
    expect(scene.zone.kind).toBe('space')
    expect(s.wild.up.length + s.wild.loot.length + s.wild.globs.length, 'none in space').toBe(0)
  })

  it('every market prices what creatures drop, at its standard (no world’s ground holds it)', () => {
    const w = theGalaxy().worlds.find((x) => x.habitable)!
    for (const id of ['hide', 'chitin', 'gland', 'heartstone'] as const) {
      expect(RESOURCES[id].wild).toBe(true)
      const p = priceAt(w.id, 0, id, 20000)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThanOrEqual(Math.round(RESOURCES[id].price * 1.3) + 1)
    }
    expect(RESOURCES.heartstone.rare).toBe(true)
  })
})
