// Pins scripted flights frame for frame (scene.spec.ts and the flights' files): each flight's fingerprints are compared
// with the ones recorded in testing/frames/. A collection is split over several files, `part` of `parts`, so vitest
// flies them side by side on every core (one file runs on one core): the tests took four minutes in one file each.
import { describe, expect, it } from 'vitest'
import { createScene, DEFAULT_PARAMS } from '../index'
import { pickWorld } from './pick'
import type { SceneFactory, Script } from './scenarios'

/** flights kept as scripts (tools/film.mjs plays them) but no longer pinned: the same journeys from other views, and
 * the slowest of the rest (James, 2026-11-19: "there are TOO MANY TESTS! Cut them"; the suite must run in under 60 s) */
export const UNPINNED = new Set([
  'up out of a world, from the seat',
  'up out of a world, from behind',
  'down to a world, from behind',
  'down to a world, from the seat',
  'down to a barren moon, from behind',
  'crash and ejection, with the pointer',
  'a wave of enemies',
  'shot down loaded, and the crate taken',
  'a patrol defending its world',
  'a quiet flight through a home system',
  'the HUD at twice the size, hit and draining',
  'coming down in the sea',
  'mining an outcrop and scooping up the ore',
  'a missile fired, and the rack filling again',
])

export function pinFlights(title: string, flights: Record<string, Script>, part = 0, parts = 1) {
  describe(title, () => {
    Object.entries(flights).forEach(([name, fly], i) => {
      if (i % parts !== part || UNPINNED.has(name)) return
      it(
        name,
        async () => {
          const marks = fly(createScene as unknown as SceneFactory, { ...DEFAULT_PARAMS }, pickWorld)
          const file = name.replace(/[^a-z0-9]+/g, '-')
          await expect(marks.join('\n') + '\n').toMatchFileSnapshot(`./frames/${file}.txt`)
        },
        300_000,
      )
    })
  })
}
