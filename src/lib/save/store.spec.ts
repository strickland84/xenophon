import { describe, expect, it } from 'vitest'
import { publicKeyOf, newSecretKey } from '../net/nostr'
import { callsignProblem, cleanCallsign } from './pilot'
import { loadSave, migrate, newSettings, pilotFile, readPilotFile, SAVE_VERSION, slotKey, writeSave } from './store'
import { furnitureLeft } from './ships'
import { shipKit } from '../engine'
import type { SaveStorage } from './store'
import { append, totalsOf } from './property'
import { SHOP } from '../engine'

/** storage in a plain object, as localStorage would be */
function memory(): SaveStorage & { items: Record<string, string> } {
  const items: Record<string, string> = {}
  return {
    items,
    getItem: (k) => items[k] ?? null,
    setItem: (k, v) => void (items[k] = v),
    removeItem: (k) => void delete items[k],
  }
}

describe('the save', () => {
  it('is made on first run, with a key pair and no pilot yet, and read back the same', () => {
    const storage = memory()
    const first = loadSave(storage, 'main')
    expect(first.version).toBe(SAVE_VERSION)
    expect(first.identity.secret).toMatch(/^[0-9a-f]{64}$/)
    expect(first.pilot).toBeNull()
    expect(loadSave(storage, 'main')).toEqual(first)
    // another slot is another pilot
    expect(loadSave(storage, '2').identity.secret).not.toBe(first.identity.secret)
  })

  it('brings a save of version 1 up to date, keeping the key, the callsign and the side', () => {
    const storage = memory()
    const key = newSecretKey()
    storage.setItem(slotKey('main'), JSON.stringify({ version: 1, key, callsign: 'OLD-HAND', faction: 'anarchoi' }))
    const save = loadSave(storage, 'main')
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.identity.secret).toBe(key)
    expect(save.pilot).toMatchObject({ callsign: 'OLD-HAND', faction: 'anarchoi', created: 0 })
    expect(['skarn', 'noctil', 'thallin']).toContain(save.pilot!.look.split('.')[0])
    expect(save.ships[0].hull).toBe('corsair')
    expect(save.ships[0].paint.body).toMatch(/^#/)
    expect(save.settings).toEqual(newSettings())
    // (he flew before: no first sortie for him)
    expect(save.tutorial).toEqual({ step: '', done: true })
    // and it was written back in the new form
    expect(JSON.parse(storage.items[slotKey('main')]).version).toBe(SAVE_VERSION)
    expect(publicKeyOf(save.identity.secret)).toBe(publicKeyOf(key))
  })

  it('keeps an unreadable save aside rather than losing it', () => {
    const storage = memory()
    storage.setItem(slotKey('main'), '{ not json')
    const save = loadSave(storage, 'main')
    expect(save.pilot).toBeNull()
    expect(storage.items[slotKey('main') + '.unreadable']).toBe('{ not json')
    expect(migrate({ version: 99 })).toBeNull()
    expect(migrate({ version: 2, identity: { secret: 'nope' } })).toBeNull()
  })

  it('fills in what is missing or wrong with defaults', () => {
    const secret = newSecretKey()
    const save = migrate({
      version: 2,
      identity: { secret },
      pilot: { callsign: 'ACE', faction: 'nomarchy' },
      ship: { hull: 7 },
      settings: { volume: 5, view: 'chase' },
    })!
    expect(save.pilot!.created).toBe(0)
    expect(save.ships.map((x) => x.hull)).toEqual(['corsair'])
    expect(save.settings).toEqual({ ...newSettings(), view: 'chase' })
  })

  it('keeps the world the pilot travelled to, and forgets one this galaxy does not have', () => {
    const secret = newSecretKey()
    const at = (world: unknown) => migrate({ version: 2, identity: { secret }, pilot: null, ship: {}, settings: { world } })!.settings.world
    expect(at('w12')).toBe('w12')
    // (or a system's space, since Phase 6)
    expect(at('s3')).toBe('s3')
    expect(at('w9999')).toBe(null)
    expect(at(12)).toBe(null)
  })

  it('goes to a file and comes back from one, from any version', () => {
    const storage = memory()
    const save = loadSave(storage, 'main')
    save.pilot = { callsign: 'ACE', faction: 'nomarchy', created: 5, look: 'kestrin.1.2.3.3a4a6a.f2c14e' }
    writeSave(storage, 'main', save)
    expect(readPilotFile(pilotFile(save))).toEqual(save)
    const old = JSON.stringify({
      format: 'xenophon-pilot',
      version: 1,
      key: save.identity.secret,
      callsign: 'ACE',
      faction: 'nomarchy',
    })
    expect(readPilotFile(old).pilot!.callsign).toBe('ACE')
    expect(() => readPilotFile('hello')).toThrow('not a pilot file')
    expect(() => readPilotFile(JSON.stringify({ format: 'xenophon-pilot', version: 10 }))).toThrow('newer version')
    expect(() => readPilotFile(pilotFile({ ...save, pilot: null }))).toThrow('no pilot')
  })
})

describe('callsigns', () => {
  it('are capitals, figures and hyphens, three to twelve of them', () => {
    expect(cleanCallsign('ace of spades!')).toBe('ACE-OF-SPADE')
    expect(cleanCallsign('Ünïcode  ok')).toBe('NCODE-OK')
    expect(callsignProblem('AC')).toMatch(/least/)
    expect(callsignProblem('123')).toMatch(/letter/)
    expect(callsignProblem('-ACE')).toMatch(/hyphen/)
    expect(callsignProblem('ACE-7')).toBeNull()
  })

  it('brings a save of version 2 up to date with nothing owned yet, and keeps a pilot’s property as a log', () => {
    const secret = newSecretKey()
    const save = migrate({
      version: 2,
      identity: { secret },
      pilot: { callsign: 'OLD', faction: 'nomarchy', created: 1 },
      ship: {},
      settings: {},
    })!
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.property.log).toEqual([])
    expect(save.ships.length).toBe(1)
    expect(totalsOf(save.property)).toEqual({ vault: [], credits: SHOP.startCredits, owned: [], counts: {} })
    // banked, sold, bought, earned, paid: the totals follow
    const p = save.property
    append(p, { t: 1, k: 'bank', items: [{ id: 'ferrite', n: 30 }], at: 'w0/base' })
    append(p, { t: 2, k: 'sold', items: [{ id: 'ferrite', n: 10 }], credits: 60, at: 'w0/base' })
    append(p, { t: 3, k: 'bounty', credits: 40, what: 'dart' })
    append(p, { t: 4, k: 'bought', what: 'part:tractor', credits: 200, items: [{ id: 'ferrite', n: 5 }], at: 'w0/base' })
    append(p, { t: 5, k: 'fee', credits: 50, what: 'lance' })
    expect(totalsOf(p)).toEqual({
      vault: [{ id: 'ferrite', n: 15 }],
      credits: SHOP.startCredits + 60 + 40 - 200 - 50,
      owned: ['part:tractor'],
      counts: {},
    })
    // a long log is folded, and comes to the same
    for (let i = 0; i < 1600; i++) append(p, { t: 10 + i, k: 'bank', items: [{ id: 'silica', n: 1 }], at: 'w0/base' })
    expect(p.log.length).toBeLessThan(1500)
    expect(totalsOf(p).vault).toEqual([
      { id: 'ferrite', n: 15 },
      { id: 'silica', n: 1600 },
    ])
    expect(totalsOf(p).owned).toEqual(['part:tractor'])
    // and it survives the trip through a file
    const back = readPilotFile(pilotFile(save))
    expect(totalsOf(back.property)).toEqual(totalsOf(p))
  })

  it('gives a pilot from before Phase 5 a look of his own side’s races, the same each time, and keeps one he chose', () => {
    const secret = newSecretKey()
    const old = (faction: string, look?: string) =>
      migrate({
        version: 3,
        identity: { secret },
        pilot: { callsign: 'OLD', faction, created: 1, look },
        ship: {},
        settings: {},
        loadout: {},
        property: { log: [] },
      })!
    const anarchoi = old('anarchoi')
    expect(['skarn', 'noctil', 'thallin']).toContain(anarchoi.pilot!.look.split('.')[0])
    expect(old('anarchoi').pilot!.look).toBe(anarchoi.pilot!.look)
    expect(['solari', 'kestrin', 'orrin']).toContain(old('nomarchy').pilot!.look.split('.')[0])
    // a look kept as it was chosen; one of the other side's races is put right
    const chosen = 'orrin.2.3.1.2f5a3a.f2c14e'
    const save = migrate({ ...JSON.parse(pilotFile(old('nomarchy'))), pilot: { callsign: 'OLD', faction: 'nomarchy', look: chosen } })!
    expect(save.pilot!.look).toBe(chosen)
    const wrong = migrate({
      ...JSON.parse(pilotFile(old('nomarchy'))),
      pilot: { callsign: 'OLD', faction: 'nomarchy', look: 'skarn.1.1.1.2f5a3a.f2c14e' },
    })!
    expect(wrong.pilot!.look.split('.')[0]).toBe('solari')
  })

  it('brings a save of version 4 up to date with a fresh standing, owing no joining bonus', () => {
    const secret = newSecretKey()
    const save = migrate({
      version: 4,
      identity: { secret },
      pilot: { callsign: 'OLD-HAND', faction: 'anarchoi', created: 1, look: '' },
      ship: {},
      settings: {},
      loadout: {},
      property: { log: [] },
    })!
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.progress.joined).toBe(true)
    expect(save.progress.contribution).toBe(0)
    expect(save.social).toEqual({ muted: [], blocked: [] })
    const back = migrate({
      ...save,
      settings: { ...save.settings, relays: ['wss://relay.example', 'http://not-secure', 7] },
      social: { muted: ['x', 'a'.repeat(64)], blocked: [] },
    })!
    expect(back.settings.relays).toEqual(['wss://relay.example'])
    expect(back.social.muted).toEqual(['a'.repeat(64)])
  })
})

describe('ships owned (save version 6)', () => {
  it('a pilot of version 5 keeps his paint and parts on the starter, and the hull he had chosen as his own', () => {
    const secret = newSecretKey()
    const save = migrate({
      version: 5,
      identity: { secret },
      pilot: { callsign: 'OLD', faction: 'nomarchy', created: 1, look: '' },
      ship: { hull: 'lance', body: '#112233', accent: '#445566', canopy: '#778899' },
      settings: {},
      loadout: { corsair: ['cargo-pod', 'tractor'], lance: ['armour'] },
      property: { log: [] },
    })!
    expect(save.ships.map((s) => s.hull)).toEqual(['corsair', 'lance'])
    expect(save.ships[0].modules).toEqual(['cargo-pod', 'tractor'])
    expect(save.ships[1].modules).toEqual(['armour'])
    expect(save.ships[1].paint.body).toBe('#112233')
    expect(save.flying).toBe('lance')
    expect(totalsOf(save.property).owned).toContain('hull:lance')
  })

  it('keeps only the hulls the log says he bought; the starter always', () => {
    const secret = newSecretKey()
    const ship = (hull: string) => ({
      id: hull,
      hull,
      weapons: ['flak'],
      modules: ['scanner'],
      paint: { body: '#ff0000', pattern: 'stripes', emblem: 'skull' },
    })
    const save = migrate({
      version: 6,
      identity: { secret },
      pilot: null,
      ships: [ship('bastion'), ship('dart')],
      flying: 'bastion',
      settings: {},
      property: { log: [{ t: 1, k: 'bought', what: 'hull:dart', credits: 900, items: [], at: 'w0/x' }] },
    })!
    expect(save.ships.map((s) => s.hull)).toEqual(['corsair', 'dart'])
    expect(save.flying).toBe('corsair')
    expect(save.ships[1].weapons).toEqual(['flak', 'cannon'])
    expect(save.ships[1].paint).toMatchObject({ body: '#ff0000', pattern: 'stripes', emblem: 'skull', mark: false })
  })

  it('counts furniture by the piece, through a long log folded', () => {
    const p = { log: [] as Parameters<typeof append>[1][] }
    append(p, { t: 1, k: 'bounty', credits: 5000, what: 'x' })
    for (let i = 0; i < 3; i++) append(p, { t: 2, k: 'bought', what: 'furn:bunk', credits: 140, items: [], at: 'x' })
    append(p, { t: 3, k: 'bought', what: 'gear:launcher', credits: 640, items: [], at: 'x' })
    for (let i = 0; i < 1600; i++) append(p, { t: 4 + i, k: 'bounty', credits: 1, what: 'x' })
    const t = totalsOf(p)
    expect(t.counts['furn:bunk']).toBe(3)
    expect(t.owned).toContain('gear:launcher')
  })
})

describe('the first session’s part of the save (version 7)', () => {
  it('a pilot of version 6 has the first sortie behind him, no tips seen, no backup yet, and default settings', () => {
    const secret = newSecretKey()
    const v6 = {
      version: 6,
      identity: { secret },
      pilot: { callsign: 'VET', faction: 'nomarchy', created: 1, look: 'solari.0.0.0.3a4a6a.f2c14e' },
      ships: [],
      flying: '',
      settings: { volume: 0.4, view: 'chase', world: 'w0', relays: null },
      property: { log: [] },
    }
    const save = migrate(v6)!
    expect(save.version).toBe(SAVE_VERSION)
    expect(save.tutorial.done).toBe(true)
    expect(save.tips).toEqual([])
    expect(save.backup).toEqual({ at: 0, how: '', asked: 0, relays: false })
    expect(save.settings).toMatchObject({ volume: 0.4, view: 'chase', world: 'w0', music: null, shake: 1, text: 'normal', pixel: 0 })
    expect(save.settings.bindings.keys.use).toEqual(['KeyF'])
    // a new one has it ahead of him
    expect(loadSave(memory(), 'main').tutorial).toEqual({ step: '', done: false })
  })

  it('shows the opening story to a new pilot once, and never to one who has flown before', () => {
    const storage = memory()
    const fresh = loadSave(storage, 'main')
    expect(fresh.intro).toBe(false)
    fresh.intro = true
    writeSave(storage, 'main', fresh)
    expect(loadSave(storage, 'main').intro).toBe(true)
    // (a save from before the story: a pilot has seen enough, a save with none has not)
    const raw = JSON.parse(storage.items[slotKey('main')])
    delete raw.intro
    expect(migrate(raw)!.intro).toBe(false)
    expect(migrate({ ...raw, pilot: { callsign: 'VET', faction: 'anarchoi', created: 1, look: 'skarn.0.0.0' } })!.intro).toBe(true)
  })

  it('keeps the settings screen’s choices, and puts right what is wrong', () => {
    const storage = memory()
    const save = loadSave(storage, 'main')
    save.settings.toggle.fire = true
    save.settings.text = 'larger'
    save.settings.shake = 0
    save.settings.music = 0.25
    save.settings.bindings.keys.use = ['KeyG']
    save.tutorial = { step: 'drones', done: false }
    save.tips = ['cruise']
    writeSave(storage, 'main', save)
    const back = loadSave(storage, 'main')
    expect(back.settings).toEqual(save.settings)
    expect(back.tutorial).toEqual({ step: 'drones', done: false })
    expect(back.tips).toEqual(['cruise'])
    const raw = JSON.parse(storage.items[slotKey('main')])
    raw.settings = { ...raw.settings, shake: 7, text: 'huge', pixel: -1, flames: 'smoky', toggle: 'yes', music: 'loud' }
    const fixed = migrate(raw)!
    expect(fixed.settings).toMatchObject({
      shake: 1,
      text: 'normal',
      pixel: 0,
      flames: null,
      toggle: { fire: false, boost: false },
      music: null,
    })
  })
})

describe('a ship’s rooms and their fit-out (version 8)', () => {
  it('a pilot of version 7 has his furniture taken up to place again, and each ship its fit-out laid', () => {
    const secret = newSecretKey()
    const v7 = {
      version: 7,
      identity: { secret },
      pilot: { callsign: 'VET', faction: 'nomarchy', created: 1, look: 'solari.0.0.0.3a4a6a.f2c14e' },
      ships: [{ id: 'corsair', hull: 'corsair', furniture: [{ id: 'plant', x: 3, y: 9 }] }],
      flying: 'corsair',
      settings: {},
      property: { log: [] },
    }
    const save = migrate(v7)!
    expect(save.version).toBe(SAVE_VERSION)
    const ship = save.ships[0]
    // (its fit-out laid where shipKit puts it, and counted as his)
    expect(ship.furniture).toEqual(shipKit('corsair'))
    expect(Object.values(ship.kit).reduce((n, k) => n + k, 0)).toBe(ship.furniture.length)
    expect(ship.furniture.length).toBeGreaterThan(4)
    // (each piece of the fit-out his, and placed: none left over to place)
    for (const id of Object.keys(ship.kit)) expect(furnitureLeft({ counts: {}, owned: [] } as never, save.ships, id)).toBe(0)
  })
})
