import { describe, expect, it } from 'vitest'
import { FakeRelay, fakeDial } from '../net/fakerelay'
import { newSecretKey, publicKeyOf } from '../net/nostr'
import { RelayPool } from '../net/relays'
import { findSealed, phraseOf, seal, sealedEvent, secretOfPhrase, unseal } from './backup'
import { loadSave, pilotFile, readPilotFile, writeSave } from './store'
import type { SaveStorage } from './store'
import { append, totalsOf } from './property'

/** the credits a new pilot starts with */
let start = 0

function memory(): SaveStorage & { items: Record<string, string> } {
  const items: Record<string, string> = {}
  return { items, getItem: (k) => items[k] ?? null, setItem: (k, v) => void (items[k] = v), removeItem: (k) => void delete items[k] }
}

/** a pilot who has flown a while: a callsign, a side, 640 credits earned, a tip seen, a key bound otherwise */
function pilot() {
  const save = loadSave(memory(), 'main')
  start = totalsOf(save.property).credits
  save.pilot = { callsign: 'KEEPER', faction: 'anarchoi', created: 5, look: 'skarn.0.0.0.3a4a6a.f2c14e' }
  append(save.property, { t: 1, k: 'bounty', credits: 640, what: 'kills' })
  save.tips = ['cruise']
  save.settings.bindings.keys.use = ['KeyG']
  save.tutorial = { step: 'free', done: true }
  return save
}

describe('keeping a pilot safe', () => {
  it('his key as a phrase (NIP-19 nsec), read back however it is typed', () => {
    // (the vector from NIP-19)
    const hex = '67dea2ed018072d675f5415ecfaed7d2597555e202d85b3d65ea4e58d2d92ffa'
    const nsec = 'nsec1vl029mgpspedva04g90vltkh6fvh240zqtv9k0t9af8935ke9laqsnlfe5'
    expect(phraseOf(hex)).toBe(nsec)
    expect(secretOfPhrase(nsec)).toBe(hex)
    expect(secretOfPhrase(`  ${nsec.toUpperCase().slice(0, 30)} ${nsec.toUpperCase().slice(30)} `)).toBe(hex)
    expect(secretOfPhrase(hex)).toBe(hex)
    // a letter wrong, or another kind of key: nothing
    expect(secretOfPhrase(nsec.slice(0, -1) + (nsec.endsWith('5') ? '6' : '5'))).toBeNull()
    expect(secretOfPhrase('npub1' + nsec.slice(5))).toBeNull()
    expect(secretOfPhrase('hello')).toBeNull()
    const key = newSecretKey()
    expect(secretOfPhrase(phraseOf(key))).toBe(key)
  })

  it('backed up to a file and restored from it after the browser forgot him', () => {
    const save = pilot()
    const file = pilotFile(save)
    // (the browser's data cleared: a new save, a new key, no pilot)
    const storage = memory()
    expect(loadSave(storage, 'main').pilot).toBeNull()
    const back = readPilotFile(file)
    writeSave(storage, 'main', back)
    const again = loadSave(storage, 'main')
    expect(again.identity.secret).toBe(save.identity.secret)
    expect(again.pilot).toEqual(save.pilot)
    expect(totalsOf(again.property).credits).toBe(start + 640)
    expect(again.settings.bindings.keys.use).toEqual(['KeyG'])
    expect(again.tips).toEqual(['cruise'])
  })

  it('sealed: only his key opens it, and it says nothing of what is in it', async () => {
    const save = pilot()
    const sealed = await seal(save)
    expect(sealed).not.toContain('KEEPER')
    expect(await unseal(sealed, save.identity.secret)).toEqual(save)
    expect(await unseal(sealed, newSecretKey())).toBeNull()
    expect(await unseal('rubbish', save.identity.secret)).toBeNull()
  })

  it('a sealed copy on the relays restores him from the phrase alone on another device; the newest wins', async () => {
    const save = pilot()
    let now = 1_800_000_000_000
    const clock = () => now
    const relays = [new FakeRelay('wss://a', clock), new FakeRelay('wss://b', clock, { refuse: 'blocked: no app data' })]
    const dial = fakeDial(relays)
    const ns = 'xenophon-test-g1'
    // (written twice as he played: the second, with more credits, is newer)
    const home = new RelayPool({ urls: ['wss://a', 'wss://b'], dial, clock })
    home.publish(await sealedEvent(save, ns, now / 1000 - 60))
    append(save.property, { t: 2, k: 'bounty', credits: 100, what: 'task' })
    home.publish(await sealedEvent(save, ns, now / 1000))
    for (let i = 0; i < 20; i++) {
      home.tick()
      for (const r of relays) r.tick()
      now += 50
    }
    expect(relays[0].events.filter((e) => e.pubkey === publicKeyOf(save.identity.secret))).toHaveLength(1)
    // another device: only the phrase
    const secret = secretOfPhrase(phraseOf(save.identity.secret))!
    const away = new RelayPool({ urls: ['wss://a', 'wss://b'], dial, clock })
    const ticking = setInterval(() => {
      away.tick()
      for (const r of relays) r.tick()
      now += 50
    }, 5)
    const found = await findSealed(away, secret, ns, 1500, clock)
    clearInterval(ticking)
    expect(found?.pilot?.callsign).toBe('KEEPER')
    expect(totalsOf(found!.property).credits).toBe(start + 740)
    // nobody else's key finds it
    const stranger = new RelayPool({ urls: ['wss://a'], dial, clock })
    const ticking2 = setInterval(() => {
      stranger.tick()
      for (const r of relays) r.tick()
      now += 50
    }, 5)
    expect(await findSealed(stranger, newSecretKey(), ns, 600, clock)).toBeNull()
    clearInterval(ticking2)
  })
})
