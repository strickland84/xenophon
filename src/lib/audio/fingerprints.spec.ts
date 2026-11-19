// The audio's fingerprints (fingerprints.ts, written by tools/audio/fingerprints.mjs) agree with the files: a file made
// again with the table left as it was would keep its old address, and a browser its old copy.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FINGERPRINTS } from './fingerprints'
import { audioUrl } from './mixer'

function files(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => (statSync(join(dir, name)).isDirectory() ? files(join(dir, name)) : [join(dir, name)]))
    .filter((p) => /\.(ogg|mp3|wav|flac|json)$/.test(p))
}

describe('the audio fingerprints', () => {
  it('agree with every file in static/audio (else: node tools/audio/fingerprints.mjs)', () => {
    const now: Record<string, string> = {}
    for (const p of files('static/audio'))
      now[p.slice('static/'.length).split('\\').join('/')] = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 10)
    expect(FINGERPRINTS).toEqual(now)
  })

  it('go on the address', () => {
    expect(audioUrl('audio/voice/title.ogg')).toBe(`/audio/voice/title.ogg?v=${FINGERPRINTS['audio/voice/title.ogg']}`)
  })
})
