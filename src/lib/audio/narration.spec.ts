import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { NARRATION, voiced } from './narration'

// Every line the narrator reads has been read in its present words (a line changed since is read again:
// uv run tools/gen/narrate.py, then uv run tools/audio/narration.py), and its files are in the game.
describe('the narrator', () => {
  it.each(NARRATION.map((l) => l.id))('%s is read in its present words', (id) => {
    expect(voiced(id)).toBeGreaterThan(0)
    expect(existsSync(`static/audio/voice/${id}.ogg`)).toBe(true)
  })
})
