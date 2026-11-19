import { describe, expect, it } from 'vitest'
import { isWingOf, readWing, wingLink, wingText, withoutWing } from './wing'
import type { Wing } from './wing'

const KEY = 'ab12cd34ef5678900123456789abcdef0123456789abcdef0123456789abcdef'
const wing: Wing = { key: KEY, zone: 'w3', side: 'nomarchy', callsign: 'ACE-1' }

describe('the wing link', () => {
  it('is written short and read back as it was', () => {
    const text = wingText(wing)
    expect(text).toBe('ab12cd34ef567890.w3.c.ACE-1')
    expect(readWing(text)).toEqual({ ...wing, key: KEY.slice(0, 16) })
    expect(readWing(wingText({ ...wing, zone: 's11', side: 'anarchoi', callsign: 'NOVA' }))).toEqual({
      key: KEY.slice(0, 16),
      zone: 's11',
      side: 'anarchoi',
      callsign: 'NOVA',
    })
  })

  it('knows the pilot it is of by the start of his key', () => {
    const w = readWing(wingText(wing))!
    expect(isWingOf(w, KEY)).toBe(true)
    expect(isWingOf(w, KEY.toUpperCase())).toBe(true)
    expect(isWingOf(w, 'ff' + KEY.slice(2))).toBe(false)
  })

  it('is not read from anything else', () => {
    for (const bad of [
      null,
      '',
      'ace',
      'ab12.w3.c.ACE',
      'ab12cd34ef567890.x3.c.ACE',
      'ab12cd34ef567890.w3.q.ACE',
      'ab12cd34ef567890.w3.c.a b',
    ])
      expect(readWing(bad), String(bad)).toBeNull()
  })

  it('goes into the page’s address, keeping how the game goes online and dropping what is this pilot’s own', () => {
    const link = wingLink('https://stars.example/play/?pilot=2&net=local&room=trial&world=w9&tutorial=off#x', wing)
    const url = new URL(link)
    expect(url.origin + url.pathname).toBe('https://stars.example/play/')
    expect(url.searchParams.get('wing')).toBe('ab12cd34ef567890.w3.c.ACE-1')
    expect(url.searchParams.get('net')).toBe('local')
    expect(url.searchParams.get('room')).toBe('trial')
    expect(url.searchParams.get('pilot')).toBeNull()
    expect(url.searchParams.get('world')).toBeNull()
    expect(url.searchParams.get('tutorial')).toBeNull()
    expect(url.hash).toBe('')
  })

  it('comes out of the address again once it has been used', () => {
    expect(withoutWing('https://stars.example/?net=local&wing=ab12cd34ef567890.w3.c.ACE')).toBe('https://stars.example/?net=local')
  })
})
