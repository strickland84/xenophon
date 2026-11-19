import { describe, expect, it } from 'vitest'
import { galaxy, GALAXY_SEED, GALAXY_VERSION, homeWorld, startWorld, theGalaxy, worldSettings } from './galaxy'
import { handlingOf, HABITABLE } from './recipe'
import { makeName } from './names'
import { mulberry32 } from '../util/math'

// The galaxy is made, not stored: every player makes the same one from the same seed and
// version. Its whole description is pinned, so an accidental change to how it is made fails
// here (a change that is meant is recorded with `npm run test:record`, and with a new
// GALAXY_VERSION once players have seen it).
describe('the galaxy', () => {
  const g = theGalaxy()

  it('is made the same every time, and pinned', async () => {
    expect(galaxy(GALAXY_SEED, GALAXY_VERSION)).toEqual(g)
    expect(galaxy(GALAXY_SEED + 1, GALAXY_VERSION)).not.toEqual(g)
    // (one line for each thing in it, so a change shows where it is)
    const lines = [
      ...g.systems.map((s) => 'system ' + JSON.stringify(s)),
      ...g.lanes.map((l) => 'lane ' + JSON.stringify(l)),
      ...g.bodies.map((b) => 'body ' + JSON.stringify(b)),
      ...g.worlds.map((w) => 'world ' + JSON.stringify(w)),
    ]
    await expect(lines.join('\n') + '\n').toMatchFileSnapshot('../testing/pinned/galaxy.txt')
  })

  it('has twelve systems: two homes at opposite ends, the core in the middle, nine on the frontier', () => {
    expect(g.systems).toHaveLength(12)
    const homes = g.systems.filter((s) => s.kind === 'home')
    expect(homes.map((s) => s.side).sort()).toEqual(['anarchoi', 'nomarchy'])
    expect(Math.abs(homes[0].x - homes[1].x)).toBeGreaterThan(800)
    const core = g.systems.filter((s) => s.kind === 'core')
    expect(core).toHaveLength(1)
    expect(core[0].x).toBeGreaterThan(400)
    expect(core[0].x).toBeLessThan(600)
    expect(g.systems.filter((s) => s.kind === 'frontier')).toHaveLength(9)
  })

  it('joins the systems with two to four lanes each, all of them reachable from either home', () => {
    for (const s of g.systems) {
      expect(s.lanes.length).toBeGreaterThanOrEqual(2)
      expect(s.lanes.length).toBeLessThanOrEqual(4)
    }
    const seen = new Set([0])
    const todo = [0]
    while (todo.length) {
      const s = todo.pop()!
      for (const l of g.systems[s].lanes) {
        const to = g.lanes[l].a === s ? g.lanes[l].b : g.lanes[l].a
        if (seen.has(to)) continue
        seen.add(to)
        todo.push(to)
      }
    }
    expect(seen.size).toBe(12)
    expect(g.lanes.filter((l) => l.kind === 'black hole')).toHaveLength(1)
  })

  it('has 40 habitable worlds as the plan deals them, five of each kind, and about thirty barren moons', () => {
    const habitable = g.worlds.filter((w) => w.habitable)
    expect(habitable).toHaveLength(40)
    for (const s of g.systems) {
      const n = s.worlds.filter((w) => g.worlds[w].habitable).length
      if (s.kind === 'home') expect(n).toBe(4)
      else if (s.kind === 'core') expect(n).toBe(2)
      else expect([3, 4]).toContain(n)
      // (no system has two worlds of a kind)
      const kinds = s.worlds.filter((w) => g.worlds[w].habitable).map((w) => g.worlds[w].recipe.archetype)
      expect(new Set(kinds).size).toBe(kinds.length)
    }
    for (const a of HABITABLE) expect(habitable.filter((w) => w.recipe.archetype === a)).toHaveLength(5)
    const moons = g.worlds.filter((w) => !w.habitable)
    expect(moons.length).toBeGreaterThanOrEqual(25)
    expect(moons.length).toBeLessThanOrEqual(35)
    expect(moons.every((w) => w.recipe.archetype === 'moon')).toBe(true)
  })

  it('has its suns, giants, black holes, belts, bases and gates', () => {
    const count = (kind: string) => g.bodies.filter((b) => b.kind === kind).length
    expect(count('sun')).toBe(13)
    expect(g.systems.filter((s) => s.suns.length === 2)).toHaveLength(1)
    expect(count('black hole')).toBe(3)
    expect(count('giant')).toBeGreaterThanOrEqual(12)
    expect(count('giant')).toBeLessThanOrEqual(16)
    expect(count('belt')).toBe(8)
    const bases = g.bodies.filter((b) => b.kind === 'base')
    expect(
      bases
        .filter((b) => b.role === 'capital')
        .map((b) => b.name)
        .sort(),
    ).toEqual(['Meridian Ring', 'The Raft'])
    expect(bases.filter((b) => b.role === 'outpost')).toHaveLength(9)
    expect(bases.filter((b) => b.role === 'derelict')).toHaveLength(3)
    expect(count('gate')).toBe(2 * g.lanes.filter((l) => l.kind === 'gate').length)
    // (every body within a system about 280,000 px across, give or take its outermost moons: worlds at their true size)
    for (const b of g.bodies) expect(Math.hypot(b.x, b.y)).toBeLessThan(160_000)
    // (worlds a ship is small beside, moons smaller, giants and suns larger still; ships and the things built in space as they were)
    for (const b of g.bodies) {
      if (b.kind === 'planet') expect(b.size).toBeGreaterThanOrEqual(1800)
      if (b.kind === 'moon') expect(b.size).toBeLessThan(1400)
      if (b.kind === 'giant') expect(b.size).toBeGreaterThan(5000)
      if (b.kind === 'sun') expect(b.size).toBeGreaterThan(4000)
      if (b.kind === 'base' || b.kind === 'gate') expect(b.size).toBeLessThan(100)
    }
  })

  it('names everything once, each side its own way at home', () => {
    const names = [...g.systems.map((s) => s.name), ...g.worlds.map((w) => w.name)]
    expect(new Set(g.worlds.map((w) => w.name)).size).toBe(g.worlds.length)
    expect(names.every((n) => /^[A-Z][A-Za-z ]+$/.test(n))).toBe(true)
    // the Anarchoi's are two blunt words, run together or not
    const rnd = mulberry32(5)
    for (let i = 0; i < 20; i++) expect(makeName(rnd, 'anarchoi')).toMatch(/^[A-Z][a-z]+( ?[A-Z]?[a-z]+)$/)
  })

  it('flies each world as its gravity and air say: a moon light and airless, a volcanic world heavy under a low ceiling of ash', () => {
    for (const w of g.worlds) {
      const h = handlingOf(w.recipe)
      expect(h.speed).toBeGreaterThan(0.7)
      expect(h.speed).toBeLessThan(1.3)
      expect(h.ceiling).toBeGreaterThan(200)
      if (w.recipe.archetype === 'moon') {
        expect(w.recipe.atmosphere).toBe(0)
        expect(h.climb).toBeGreaterThan(1.4)
        expect(w.recipe.clouds).toBe(0)
      }
      if (w.recipe.hazards.includes('ash')) expect(h.ceiling).toBeLessThan(400)
    }
  })

  it('starts everyone at the island world, which flies as the game always has', () => {
    expect(startWorld()).toBe(homeWorld('nomarchy').id)
    const s = worldSettings(startWorld())
    expect(s).toEqual({ world: startWorld(), timeOfDay: 'day', clouds: 0.45, speed: 92, agility: 1.25, climb: 1, ceiling: 1500 })
    const r = homeWorld('nomarchy').recipe
    expect([r.archetype, r.seed, r.land, r.palette, r.weather, r.light]).toEqual(['archipelago', 7, 0.33, 0, 'clear', [1, 1, 1]])
  })
})
