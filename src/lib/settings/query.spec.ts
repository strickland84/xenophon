import { describe, expect, it } from 'vitest'
import { netFromQuery, settingsFromQuery } from './query'

const from = (query: string) => settingsFromQuery(new URLSearchParams(query))

describe('settings from the address', () => {
  it('is empty when nothing is asked for', () => {
    expect(from('')).toEqual({})
  })

  it('reads numbers, switches, choices and colours', () => {
    expect(from('wingmen=2&trails=false&shadow=1&view=cockpit&timeOfDay=night&accentColor=3af&bodyColor=%23112233&pixelSize=4')).toEqual({
      wingmen: 2,
      trails: false,
      shadow: true,
      view: 'cockpit',
      timeOfDay: 'night',
      accentColor: '#3af',
      bodyColor: '#112233',
      pixelSize: 4,
    })
  })

  it('ignores what it does not know and what it cannot read', () => {
    expect(from('wingmen=lots&trails=maybe&view=sideways&speed=&nonsense=1')).toEqual({})
  })

  it('reads a world of the galaxy, and only one that is', () => {
    expect(from('world=w12')).toEqual({ world: 'w12' })
    expect(from('world=w9999')).toEqual({})
    expect(from('world=mars')).toEqual({})
  })
})

describe('the network’s settings from the address', () => {
  it('goes online as the main pilot unless told otherwise', () => {
    expect(netFromQuery(new URLSearchParams(''))).toEqual({
      pilot: 'main',
      net: 'online',
      delay: 0,
      jitter: 0,
      loss: 0,
      fail: 0,
      room: '',
      relays: [],
      tutorial: true,
      intro: true,
      wing: null,
    })
    // (the tools' new pilots skip the first sortie)
    expect(netFromQuery(new URLSearchParams('tutorial=off')).tutorial).toBe(false)
    // (and the opening story, as does ?intro=off alone)
    expect(netFromQuery(new URLSearchParams('tutorial=off')).intro).toBe(false)
    expect(netFromQuery(new URLSearchParams('intro=off'))).toMatchObject({ intro: false, tutorial: true })
  })

  it('reads a second pilot, the same-browser transport and how bad it is, a room and relays', () => {
    const s = netFromQuery(
      new URLSearchParams(
        'pilot=2&net=local&delay=120&jitter=40&loss=0.2&fail=9&room=my%20test!&relays=wss://a.example,nope,wss://b.example',
      ),
    )
    expect(s).toEqual({
      pilot: '2',
      net: 'local',
      delay: 120,
      jitter: 40,
      loss: 0.2,
      fail: 1,
      room: 'mytest',
      relays: ['wss://a.example', 'wss://b.example'],
      tutorial: true,
      intro: true,
      wing: null,
    })
  })

  it('reads the wing a pilot came by, from another pilot’s link', () => {
    expect(netFromQuery(new URLSearchParams('wing=ab12cd34ef567890.s3.d.NOVA')).wing).toEqual({
      key: 'ab12cd34ef567890',
      zone: 's3',
      side: 'anarchoi',
      callsign: 'NOVA',
    })
    expect(netFromQuery(new URLSearchParams('wing=nonsense')).wing).toBeNull()
  })
})
