import { describe, expect, it } from 'vitest'
import { combine, nothingHeld } from './actions'
import { readPad } from './gamepad'
import type { PadState } from './gamepad'
import { HOLD_KEYS, PRESS_KEYS } from './keyboard'
import {
  bindButton,
  bindKey,
  buttonName,
  buttonOwner,
  DEFAULT_BINDINGS,
  defaultBindings,
  keyMaps,
  keyName,
  keyOwner,
  readBindings,
} from './bindings'
import { hintFor, spaceHint } from './hints'

// The bindings are the controls table in the plan (docs/implementation-plan.md, section 16).

/** a standard-layout controller at rest, with some buttons pressed (index → how far) and the left stick at (x, y) */
function pad(pressed: Record<number, number> = {}, x = 0, y = 0): PadState {
  const buttons = Array.from({ length: 18 }, (_, i) => ({ pressed: (pressed[i] ?? 0) > 0.5, value: pressed[i] ?? 0 }))
  return { axes: [x, y, 0, 0], buttons }
}

describe('the keyboard', () => {
  it('has a key for everything pressed once', () => {
    expect(PRESS_KEYS).toMatchObject({
      Space: 'roll',
      KeyF: 'use',
      KeyV: 'view',
      KeyM: 'map',
      KeyI: 'inventory',
      KeyJ: 'cruise',
      KeyX: 'stop',
      F9: 'clip',
      Enter: 'chat',
      Escape: 'menu',
      KeyH: 'nextShip',
    })
  })
  it('is laid out as Elite Dangerous: W and S the throttle, A and D turn, the arrows pitch and turn, Tab (and Shift) the boost', () => {
    expect([HOLD_KEYS.KeyW, HOLD_KEYS.KeyA, HOLD_KEYS.KeyS, HOLD_KEYS.KeyD]).toEqual(['faster', 'left', 'slower', 'right'])
    expect([HOLD_KEYS.ArrowUp, HOLD_KEYS.ArrowLeft, HOLD_KEYS.ArrowDown, HOLD_KEYS.ArrowRight]).toEqual(['up', 'left', 'down', 'right'])
    expect([HOLD_KEYS.Tab, HOLD_KEYS.ShiftLeft]).toEqual(['boost', 'boost'])
    expect([HOLD_KEYS.KeyE, HOLD_KEYS.KeyQ]).toEqual([undefined, undefined])
  })
})

describe('a game controller', () => {
  it('steers with the left stick, past a dead zone', () => {
    expect(readPad(pad({}, 0.1, -0.1)).held).toMatchObject({ turn: 0, climb: 0 })
    expect(readPad(pad({}, 1, -1)).held).toMatchObject({ turn: 1, climb: 1 })
  })
  it('fires with R2, the secondary weapon with Square, and boosts as far as L2 is squeezed', () => {
    expect(readPad(pad({ 7: 1 })).held.fire).toBe(true)
    expect(readPad(pad({ 7: 0.1 })).held.fire).toBe(false)
    expect(readPad(pad({ 2: 1 })).held.secondary).toBe(true)
    expect(readPad(pad({ 6: 0.5 })).held.boost).toBe(0.5)
  })
  it('has a button for everything pressed once', () => {
    const press = (i: number) => [...readPad(pad({ [i]: 1 })).down]
    expect([0, 1, 3, 17, 12, 15, 9].map(press)).toEqual([['roll'], ['use'], ['view'], ['map'], ['inventory'], ['chat'], ['menu']])
    expect(readPad(pad()).down.size).toBe(0)
  })
})

describe('devices together', () => {
  it('add up their steering, and a button held on any of them is held', () => {
    const keys = { ...nothingHeld(), turn: 1, boost: 1 }
    const stick = { ...nothingHeld(), turn: 0.6, climb: -0.4, boost: 0.3 }
    const mouse = { ...nothingHeld(), fire: true }
    expect(combine([keys, stick, mouse])).toEqual({
      turn: 1,
      climb: -0.4,
      walk: -0.4,
      throttle: 0,
      boost: 1,
      fire: true,
      secondary: false,
      land: false,
      mine: false,
      target: false,
    })
    expect(
      combine([
        { ...nothingHeld(), throttle: 1 },
        { ...nothingHeld(), throttle: 0.5 },
      ]).throttle,
    ).toBe(1)
  })
  it('a controller moves the throttle with the right stick', () => {
    expect(readPad({ axes: [0, 0, 0, -1], buttons: [] }).held.throttle).toBe(1)
    expect(readPad({ axes: [0, 0, 0, 0.05], buttons: [] }).held.throttle).toBe(0)
  })
  it('a save kept before the throttle had keys gives it E and Q, and climbing and diving their new keys', () => {
    const old = { keys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], use: ['KeyE'] } }
    const b = readBindings(old)
    // (E was given to Use: the throttle up keeps none)
    expect(b.keys.faster).toEqual(['KeyW'])
    expect(b.keys.slower).toEqual(['KeyS'])
    expect(b.keys.up).toEqual(['ArrowUp'])
    expect(b.keys.down).toEqual(['ArrowDown'])
    expect(b.keys.use).toEqual(['KeyE'])
  })
  it('a save with the keys before Elite’s layout, as given, takes it; a key the player chose keeps its own, and no other action keeps it too', () => {
    const was = {
      faster: ['KeyE'],
      slower: ['KeyQ'],
      up: ['KeyW', 'ArrowUp'],
      down: ['KeyS', 'ArrowDown'],
      boost: ['ShiftLeft', 'ShiftRight'],
      cruise: ['KeyC'],
      inventory: ['Tab'],
      clip: ['KeyX'],
    }
    expect(readBindings({ keys: was }).keys).toMatchObject(DEFAULT_BINDINGS.keys)
    // (his throttle up on I: the hold does not take it from him)
    const own = readBindings({ keys: { ...was, faster: ['KeyI'] } }).keys
    expect(own.faster).toEqual(['KeyI'])
    expect(own.inventory).toEqual([])
    expect(own.slower).toEqual(['KeyS'])
  })
  it('a save with Up and Down as a stick’s push and pull (S and W), as given, takes Elite’s layout', () => {
    const was = { faster: ['KeyE'], slower: ['KeyQ'], up: ['KeyS', 'ArrowDown'], down: ['KeyW', 'ArrowUp'] }
    expect(readBindings({ keys: was }).keys).toMatchObject({ faster: ['KeyW'], slower: ['KeyS'], up: ['ArrowUp'], down: ['ArrowDown'] })
  })
  it('a save with the throttle on W and S and the pitch on Q and E, as given, takes the new keys; one changed keeps its own', () => {
    const was = { faster: ['KeyW'], slower: ['KeyS'], up: ['KeyQ', 'ArrowUp'], down: ['KeyE', 'ArrowDown'] }
    expect(readBindings({ keys: was }).keys).toMatchObject(DEFAULT_BINDINGS.keys)
    const own = { ...was, up: ['KeyZ', 'ArrowUp'] }
    expect(readBindings({ keys: own }).keys).toMatchObject(own)
  })
  it('the keys walk as W and S pitch the nose: W, pitching up, walks forward, as a stick pushed forward walks', () => {
    const keys = { ...nothingHeld(), climb: 1, walk: 1 }
    const stick = { ...nothingHeld(), climb: 0.5 }
    expect(combine([keys]).walk).toBe(1)
    expect(combine([stick]).walk).toBe(0.5)
    expect(combine([keys, stick])).toMatchObject({ climb: 1, walk: 1 })
  })
})

describe('bindings', () => {
  it('the seat: G and a controller’s L3; a save kept before it keeps keys given elsewhere', () => {
    expect(PRESS_KEYS.KeyG).toBe('seat')
    expect([...readPad(pad({ 10: 1 })).down]).toEqual(['seat'])
    expect(readBindings({ keys: { use: ['KeyG'] }, pad: { menu: [10] } })).toMatchObject({
      keys: { use: ['KeyG'], seat: [] },
      pad: { seat: [] },
    })
    expect(readBindings({ keys: { use: ['KeyF'] }, pad: { menu: [9] } })).toMatchObject({ keys: { seat: ['KeyG'] }, pad: { seat: [10] } })
  })

  it('start as the plan’s controls table, and read back the defaults from nothing or rubbish', () => {
    const maps = keyMaps(DEFAULT_BINDINGS)
    expect(maps.hold).toEqual(HOLD_KEYS)
    expect(maps.press).toEqual(PRESS_KEYS)
    expect(readBindings(null)).toEqual(defaultBindings())
    expect(readBindings({ keys: { use: [42, 'KeyG'] }, pad: { fire: ['x', 5] } })).toMatchObject({
      keys: { use: ['KeyG'] },
      pad: { fire: [5] },
    })
  })

  it('a key remapped: Action on G, taken from the seat; then Roll on F, taken from Action', () => {
    let b = bindKey(defaultBindings(), 'use', 'KeyG')
    expect(b.keys.use).toEqual(['KeyG', 'KeyF'])
    b = bindKey(b, 'roll', 'KeyF')
    expect(b.keys.use).toEqual(['KeyG'])
    expect(b.keys.roll).toEqual(['KeyF', 'Space'])
    const maps = keyMaps(b)
    expect(maps.press.KeyG).toBe('use')
    expect(maps.hold.KeyG).toBe('land')
    expect(maps.press.KeyF).toBe('roll')
    expect(maps.hold.KeyF).toBeUndefined()
    expect(keyOwner(b, 'KeyF')).toBe('roll')
    // a key for the guns: held, as the mouse's button is
    expect(keyMaps(bindKey(b, 'fire', 'KeyJ')).hold.KeyJ).toBe('fire')
    // the help names the keys as bound
    expect(hintFor('top', 'pointer', true, true, b)).toContain('Hold G to land')
    expect(spaceHint('pointer', b)).toContain('Hold G to dock')
  })

  it('a controller button remapped: fire on R1, taken from nothing; the help names it', () => {
    const b = bindButton(defaultBindings(), 'fire', 5)
    expect(readPad(pad({ 5: 1 }), b).held.fire).toBe(true)
    expect(readPad(pad({ 7: 1 }), b).held.fire).toBe(true)
    const swapped = bindButton(b, 'roll', 1)
    expect([...readPad(pad({ 1: 1 }), swapped).down]).toEqual(['roll'])
    expect(readPad(pad({ 1: 1 }), swapped).held.land).toBe(false)
    expect(buttonOwner(swapped, 1)).toBe('roll')
    expect(hintFor('top', 'ps', true, false, b)).toContain('R1 fires')
    expect(buttonName(1, true)).toBe('○')
    expect(buttonName(1, false)).toBe('B')
  })

  it('name keys in capitals the pixel font draws', () => {
    expect(['KeyF', 'Digit3', 'ShiftLeft', 'Space', 'ArrowUp', 'Numpad5'].map(keyName)).toEqual(['F', '3', 'SHIFT', 'SPACE', 'UP', '5'])
  })
})
