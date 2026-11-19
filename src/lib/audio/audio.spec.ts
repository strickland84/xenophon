import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GROUNDS } from '../engine/sim/effects'
import type { SoundEvent, SoundKind } from '../engine'
import { theGalaxy } from '../engine/galaxy/galaxy'
import { RACE_IDS } from '../engine/races/races'
import { EFFECTS, PIECES } from './catalogue'
import type { EffectName } from './catalogue'
import { BEEPS, beeps, BIG_BANG, CUES, cueSound, effectsInUse, ENGINE_SIZE, powerCue, powerOf, steady, UI } from './cues'
import type { Listening } from './cues'
import { effectPath, piecePath } from './library'
import { createFightWatch, fightLevel, isHarsh, MOODS, placeFor, PLACES, SETTLE, SETTLE_PERIL, STINGS } from './moods'
import type { Where } from './moods'

// The game's sound, without ears: every thing the engine says was heard has a sound, every sound a
// file the site serves (and its MP3 for browsers without Opus), and the music picks the right mood.

const STATIC = path.resolve(__dirname, '../../../static')
const has = (p: string) => fs.existsSync(path.join(STATIC, p))

/** every kind of sound event, as the engine's own list of them says */
const KINDS = [...fs.readFileSync(path.resolve(__dirname, '../engine/sim/effects.ts'), 'utf8').matchAll(/^\s*\| '(\w+)' \/\//gm)].map(
  (m) => m[1] as SoundKind,
)

const event = (kind: SoundKind, change: Partial<SoundEvent> = {}): SoundEvent => ({
  kind,
  pan: 0,
  gain: 1,
  size: 1,
  own: true,
  what: '',
  ...change,
})

/** a take of a sound the game plays is there, as Opus and as MP3 */
function playable(name: EffectName) {
  const clip = EFFECTS[name]
  expect(clip, name).toBeDefined()
  expect(clip.use.length, name).toBeGreaterThan(0)
  for (const n of clip.use) {
    expect(has(effectPath(name, n)), effectPath(name, n)).toBe(true)
  }
}

describe('the sound effects', () => {
  it('knows every kind of event the engine reports, and no others', () => {
    expect(KINDS.length).toBeGreaterThan(40)
    expect(Object.keys(CUES).sort()).toEqual([...KINDS].sort())
  })

  it('has a sound, with its files, for every event, whatever kind of it', () => {
    for (const kind of KINDS) {
      for (const own of [true, false]) {
        for (const size of [0, BIG_BANG - 0.01, BIG_BANG, 1]) playable(cueSound(event(kind, { own, size })))
        for (const what of [...GROUNDS, ...RACE_IDS, 'lava', 'acid', '']) playable(cueSound(event(kind, { own, what })))
      }
    }
  })

  it('tells the grounds, the races’ ways down and the sizes of explosion apart', () => {
    const steps = new Set(GROUNDS.map((what) => cueSound(event('step', { what }))))
    expect(steps.size).toBe(GROUNDS.length)
    const downs = new Set(RACE_IDS.map((what) => cueSound(event('deploy', { what }))))
    expect(downs.size).toBe(RACE_IDS.length)
    expect(cueSound(event('explosion', { size: 0.35 }))).toBe('explosion_small')
    expect(cueSound(event('explosion', { size: 0.8 }))).toBe('explosion_large')
  })

  it('has files for the steady sounds, the beeps and the interface', () => {
    for (const name of effectsInUse()) playable(name)
    for (const b of Object.values(BEEPS)) playable(b.name)
    for (const u of Object.values(UI)) playable(u.name)
  })

  it('serves every take of every effect, for the sampler page', () => {
    for (const [name, clip] of Object.entries(EFFECTS)) {
      expect(clip.takes.length, name).toBeGreaterThan(0)
      for (const t of clip.takes) expect(has(effectPath(name as EffectName, t.n)), `${name} ${t.n}`).toBe(true)
    }
  })

  it('keeps the steady sounds to how the player stands', () => {
    const l: Listening = {
      flying: true,
      landed: false,
      hull: 'corsair',
      speed: 92,
      boost: 0,
      throttle: 0.5,
      hullLeft: 1,
      lock: 0,
      incoming: 99,
      mining: false,
      cutting: false,
      cruise: 'off',
      hole: 0,
    }
    const level = (x: Listening, name: string) => steady(x).find((s) => s.name === name)!.gain
    // the lock tone once locked; the lasers while they cut; the drive while it cruises; a black hole near
    expect(level(l, 'lock_tone')).toBe(0)
    expect(level({ ...l, lock: 1 }, 'lock_tone')).toBeGreaterThan(0)
    expect(level({ ...l, mining: true }, 'mining_laser')).toBeGreaterThan(0)
    expect(level({ ...l, flying: false, cutting: true }, 'cutter')).toBeGreaterThan(0)
    expect(level({ ...l, cruise: 'on' }, 'cruise_drive')).toBeGreaterThan(0)
    expect(level({ ...l, hole: 0.8 }, 'blackhole')).toBeGreaterThan(level({ ...l, hole: 0.2 }, 'blackhole'))
  })

  it('runs the engines of the ship’s size by the throttle, the thrusters and the power', () => {
    const l: Listening = {
      flying: true,
      landed: false,
      hull: 'corsair',
      speed: 0,
      boost: 0,
      throttle: 0,
      hullLeft: 1,
      lock: 0,
      incoming: 99,
      mining: false,
      cutting: false,
      cruise: 'off',
      hole: 0,
    }
    const of = (x: Listening, layer: string) => steady(x).find((s) => s.name === `drive_${ENGINE_SIZE[x.hull]}_${layer}`)!
    const heard = (x: Listening) => steady(x).filter((s) => s.name.startsWith('drive_') && s.gain > 0)
    // every hull has a drive, and every drive its three layers
    for (const hull of Object.keys(ENGINE_SIZE))
      for (const layer of ['idle', 'thrust', 'boost']) expect(of({ ...l, hull }, layer)).toBeDefined()
    // only one size is heard: the ship's own
    for (const hull of ['dart', 'corsair', 'galleon']) {
      const sizes = new Set(heard({ ...l, hull, throttle: 1, boost: 1 }).map((s) => s.name.split('_')[1]))
      expect([...sizes]).toEqual([ENGINE_SIZE[hull]])
    }
    // silent off the ship (on foot, inside, ejected) and with the power off; powered, at rest, it hums
    expect(heard({ ...l, flying: false, throttle: 1, boost: 1 })).toEqual([])
    expect(heard({ ...l, powered: false, throttle: 1, boost: 1 })).toEqual([])
    expect(heard(l).map((s) => s.name)).toEqual(['drive_medium_idle'])
    expect(of({ ...l, powered: true }, 'idle').gain).toBe(of(l, 'idle').gain)
    // coming up, the hum at half and nothing more
    expect(of({ ...l, starting: true }, 'idle').gain).toBeCloseTo(of(l, 'idle').gain / 2)
    expect(heard({ ...l, starting: true, throttle: 1, boost: 1 }).map((s) => s.name)).toEqual(['drive_medium_idle'])
    // the thrust rises with the throttle, and its pitch with it; landed, the drive idles whatever the throttle
    let last = -1
    for (const throttle of [0, 0.25, 0.5, 0.75, 1]) {
      const thrust = of({ ...l, throttle }, 'thrust')
      expect(thrust.gain).toBeGreaterThan(last)
      last = thrust.gain
    }
    expect(of({ ...l, throttle: 1 }, 'thrust').rate).toBeGreaterThan(of({ ...l, throttle: 0.2 }, 'thrust').rate)
    expect(of({ ...l, throttle: 0.5, speed: 92 }, 'thrust').gain).toBeGreaterThan(of({ ...l, throttle: 0.5 }, 'thrust').gain)
    expect(of({ ...l, landed: true, throttle: 1 }, 'thrust').gain).toBe(0)
    // the boost's roar with the thrusters, over the rest
    expect(of(l, 'boost').gain).toBe(0)
    expect(of({ ...l, boost: 1 }, 'boost').gain).toBeGreaterThan(of({ ...l, boost: 0.3 }, 'boost').gain)
    const all = (x: Listening) => heard(x).reduce((n, s) => n + s.gain, 0)
    expect(all({ ...l, boost: 1, throttle: 1 })).toBeGreaterThan(all({ ...l, throttle: 1 }) * 1.5)
    // (and the throttle opened is heard well over the hum at rest)
    expect(all({ ...l, throttle: 1 })).toBeGreaterThan(all(l) * 2)
    // under the cruise drive, quieter
    expect(of({ ...l, throttle: 1, cruise: 'on' }, 'thrust').gain).toBeLessThan(of({ ...l, throttle: 1 }, 'thrust').gain)
  })

  it('powers the drive up and down as the ship’s power comes and goes', () => {
    const l: Listening = {
      flying: true,
      landed: true,
      hull: 'mule',
      speed: 0,
      boost: 0,
      throttle: 0,
      hullLeft: 1,
      lock: 0,
      incoming: 99,
      mining: false,
      cutting: false,
      cruise: 'off',
      hole: 0,
    }
    expect(powerOf(l)).toBe('on')
    expect(powerOf({ ...l, flying: false })).toBe('none')
    expect(powerOf({ ...l, powered: false })).toBe('off')
    expect(powerOf({ ...l, starting: true })).toBe('starting')
    expect(powerCue('off', 'starting')?.name).toBe('power_up')
    expect(powerCue('none', 'starting')?.name).toBe('power_up')
    expect(powerCue('off', 'on')?.name).toBe('power_up')
    expect(powerCue('starting', 'on')).toBeNull()
    expect(powerCue('on', 'off')?.name).toBe('power_down')
    expect(powerCue('starting', 'off')?.name).toBe('power_down')
    // (climbing in or out of a ship that is running is heard by those events, not as its power)
    expect(powerCue('none', 'on')).toBeNull()
    expect(powerCue('on', 'none')).toBeNull()
    expect(powerCue('off', 'none')).toBeNull()
    expect(powerCue('on', 'on')).toBeNull()
  })

  it('beeps quicker as a lock comes and a missile nears, and warns of a hull nearly gone', () => {
    const l: Listening = {
      flying: true,
      landed: false,
      hull: 'dart',
      speed: 92,
      boost: 0,
      throttle: 0.5,
      hullLeft: 1,
      lock: 0,
      incoming: 99,
      mining: false,
      cutting: false,
      cruise: 'off',
      hole: 0,
    }
    expect(beeps(l)).toEqual({ lock: 0, warning: 0, hull: 0 })
    expect(beeps({ ...l, lock: 0.8 }).lock).toBeLessThan(beeps({ ...l, lock: 0.2 }).lock)
    expect(beeps({ ...l, lock: 1 }).lock).toBe(0)
    expect(beeps({ ...l, incoming: 0.5 }).warning).toBeLessThan(beeps({ ...l, incoming: 4 }).warning)
    expect(beeps({ ...l, hullLeft: 0.2 }).hull).toBeGreaterThan(0)
    expect(beeps({ ...l, hullLeft: 0.2, flying: false }).hull).toBe(0)
  })
})

describe('the music', () => {
  const sky: Where = { screen: 'sky', map: false, zone: 'surface', harsh: false, fight: 0 }

  it('has every mood’s piece, with its files', () => {
    for (const place of PLACES) {
      const piece = PIECES[MOODS[place].piece]
      expect(piece, place).toBeDefined()
      for (const n of piece.use) {
        expect(has(piecePath(MOODS[place].piece, n)), `${place} ${n}`).toBe(true)
      }
      for (const t of piece.takes) expect(t.seconds, `${place} ${t.n}`).toBeGreaterThan(60)
    }
    for (const name of Object.values(STINGS)) {
      const piece = PIECES[name]
      expect(piece, name).toBeDefined()
      for (const n of piece.use) expect(has(piecePath(name, n)), `${name} ${n}`).toBe(true)
      for (const t of piece.takes) expect(t.seconds, `${name} ${t.n}`).toBeLessThan(15)
    }
  })

  it('picks the mood by place: the title, a calm world or a harsh one, space, inside, the maps', () => {
    expect(placeFor({ ...sky, screen: 'title' })).toBe('title')
    expect(placeFor(sky)).toBe('calm')
    expect(placeFor({ ...sky, harsh: true })).toBe('harsh')
    expect(placeFor({ ...sky, zone: 'space' })).toBe('space')
    expect(placeFor({ ...sky, zone: 'interior' })).toBe('hangar')
    expect(placeFor({ ...sky, zone: 'space', map: true })).toBe('map')
    expect(placeFor({ ...sky, night: true })).toBe('night')
    expect(placeFor({ ...sky, foot: true, night: true })).toBe('foot')
    expect(placeFor({ ...sky, foot: true, harsh: true })).toBe('harsh')
    expect(placeFor({ ...sky, zone: 'space', cruise: true })).toBe('cruise')
    expect(placeFor({ ...sky, zone: 'space', cruise: true, hole: true })).toBe('hole')
  })

  it('brings the fight in anywhere outside, over the maps too, at its level, and lets it go a while after', () => {
    expect(placeFor({ ...sky, fight: 1 })).toBe('alert')
    expect(placeFor({ ...sky, zone: 'space', fight: 2 })).toBe('combat')
    expect(placeFor({ ...sky, map: true, fight: 3 })).toBe('peril')
    // (no fight inside, nor on the first screens)
    expect(placeFor({ ...sky, zone: 'interior', fight: 2 })).toBe('hangar')
    expect(placeFor({ ...sky, screen: 'title', fight: 2 })).toBe('title')
    const calm = { near: 0, close: 0, target: false, incoming: 99, hull: 1, ambushed: false }
    expect(fightLevel(calm)).toBe(0)
    expect(fightLevel({ ...calm, near: 1 })).toBe(1)
    expect(fightLevel({ ...calm, near: 1, close: 1 })).toBe(2)
    expect(fightLevel({ ...calm, near: 1, target: true, hull: 0.2 })).toBe(3)
    expect(fightLevel({ ...calm, incoming: 2 })).toBe(3)
    expect(fightLevel({ ...calm, near: 4 })).toBe(3)
    const watch = createFightWatch()
    expect(watch.look(0, 0)).toBe(0)
    expect(watch.look(3, 10)).toBe(3)
    // (a fight going badly settles to a fight, and that to enemies near, and then to none)
    expect(watch.look(0, 10 + SETTLE_PERIL + 0.1)).toBe(2)
    expect(watch.look(1, 10 + SETTLE - 1)).toBe(2)
    expect(watch.look(0, 10 + SETTLE + 0.1)).toBe(1)
    expect(watch.look(0, 9 + 2 * SETTLE)).toBe(0)
  })

  it('a fight comes in quickly, holds the music under the guns, and has no rest in it', () => {
    expect(MOODS.combat.fadeIn).toBeLessThan(MOODS.calm.fadeIn)
    expect(MOODS.combat.hold).toBeGreaterThan(0)
    expect(MOODS.combat.rest).toEqual([0, 0])
    expect(MOODS.peril.fadeIn).toBeLessThanOrEqual(MOODS.combat.fadeIn)
    // (out in the world a take is followed by a rest of silence, so an hour is not an hour of music)
    for (const p of ['calm', 'harsh', 'space'] as const) expect(MOODS[p].rest[0]).toBeGreaterThan(0)
  })

  it('calls volcanic, icy, airless and stormy worlds harsh, and the rest calm', () => {
    const worlds = theGalaxy().worlds
    const harsh = worlds.filter((w) => isHarsh(w.recipe))
    expect(harsh.length).toBeGreaterThan(5)
    expect(harsh.length).toBeLessThan(worlds.length)
    for (const w of worlds) {
      const r = w.recipe
      if (r.archetype === 'volcanic' || r.archetype === 'moon' || r.hazards.includes('lava')) expect(isHarsh(r), w.id).toBe(true)
      if (r.hazards.length === 0 && r.weather === 'clear' && (r.archetype === 'archipelago' || r.archetype === 'jungle'))
        expect(isHarsh(r), w.id).toBe(false)
    }
    expect(isHarsh(null)).toBe(false)
  })
})
