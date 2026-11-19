import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { siteOf, theGalaxy } from '../galaxy/galaxy'
import { buildWorld } from './generate'
import { buildSurface } from './surface'
import { createWorld, N, ZTOP } from './world'
import type { World } from './world'

// Every player must get the same terrain, bit for bit. Each world of the galaxy is built here
// and a fingerprint of its ground (heights, materials, where a flight starts) and of its clouds
// is pinned; the island world the game always had is pinned beside them, as it was before
// there were other worlds. The same arithmetic in another browser gives the same numbers, as
// long as terrain is made only of exact arithmetic: the last test looks for anything that is not.

function fnv(hash: number, bytes: Uint8Array) {
  let h = hash
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
const hex = (n: number) => n.toString(16).padStart(8, '0')

/** a world's fingerprint: its ground and start, and its clouds */
function print(w: World) {
  const ground = fnv(fnv(fnv(0x811c9dc5, w.height), w.mat), new Uint8Array(new Uint32Array([w.spawnX, w.spawnY]).buffer))
  return `ground ${hex(ground)} clouds ${hex(fnv(0x811c9dc5, w.clouds))} start ${w.spawnX},${w.spawnY}`
}

describe('every world', () => {
  const g = theGalaxy()
  const prints: string[] = []
  const world = createWorld()

  it('the island world comes out as it did before there were other worlds', () => {
    buildWorld(world, 7, 0.33)
    // (the same as the generator gave before Phase 3: height, materials and clouds, and the start)
    const before = fnv(fnv(fnv(0x811c9dc5, world.height), world.mat), world.clouds)
    expect([hex(before), world.spawnX, world.spawnY]).toEqual(['30fb4aba', 706, 349])
    prints.push(`islands-7-33 ${print(world)}`)
  })

  for (const s of g.worlds) {
    it(`${s.id} ${s.name}, ${s.recipe.archetype}`, () => {
      buildSurface(world, s.recipe, siteOf(s))
      const { height: H, mat: M, look } = world
      // every ground pixel has a colour in its world's look, and no ground is taller than can be drawn
      let tallest = 0
      let most = 0
      let sea = 0
      for (let o = 0; o < N * N; o++) {
        if (H[o] > tallest) tallest = H[o]
        if (M[o] > most) most = M[o]
        if (M[o] < 4) sea++
      }
      expect(most).toBeLessThan(look.top.length)
      expect(tallest).toBeLessThan(ZTOP)
      // (the share of sea is near what the recipe asks, where the sea is all there is below the
      // land: not on an ice world, whose frozen sea is ground, nor where rivers cut the land; a
      // moon has none, and no clouds)
      const kind = s.recipe.archetype
      if (kind === 'moon') {
        expect(sea).toBe(0)
        expect(world.clouds.every((c) => c === 0)).toBe(true)
      } else if (kind !== 'canyon' && kind !== 'volcanic' && kind !== 'ice')
        expect(Math.abs(sea / (N * N) - (1 - s.recipe.land))).toBeLessThan(0.12)
      prints.push(`${s.id} ${print(world)}`)
    })
  }

  it('is pinned', async () => {
    await expect(prints.join('\n') + '\n').toMatchFileSnapshot('../testing/pinned/worlds.txt')
  })

  it('is made of exact arithmetic only', () => {
    // Math.sin, cos, pow, exp and friends differ between browsers in the last bit; terrain may
    // use + − × ÷, floor, round, abs, min, max and sqrt, and the tables in util/exact.ts
    const dirs = ['world/archetypes', 'galaxy']
    const files = [
      ...dirs.flatMap((d) => fs.readdirSync(path.join(__dirname, '..', d)).map((f) => path.join(d, f))),
      'world/shape.ts',
      'world/surface.ts',
      'world/features.ts',
    ]
    for (const f of files.filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
      const code = fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
      expect(code, f).not.toMatch(/Math\.(sin|cos|tan|asin|acos|atan2?|pow|exp|log\w*|hypot|cbrt|random)\b|[\w)\]]\s*\*\*\s*[\w(]/)
    }
  })
})
