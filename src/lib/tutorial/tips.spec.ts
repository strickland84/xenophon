import { describe, expect, it } from 'vitest'
import { namer } from '../input/hints'
import { nextTip } from './tips'
import type { TipView } from './tips'

const calm: TipView = {
  zone: { kind: 'surface', prompt: '' },
  loop: { stage: 'flying', base: null },
  interior: { place: '' },
  traces: { atSite: false },
  status: { lock: 0, incoming: 99 },
  affordable: false,
  mates: 0,
}

describe('the tips after the first sortie', () => {
  it('come up once each, as each thing first comes up, worded for the device', () => {
    const keys = namer('pointer')
    expect(nextTip(calm, [], keys, 'pointer')).toBeNull()
    const gate = nextTip({ ...calm, zone: { kind: 'space', prompt: 'jump' }, loop: { stage: 'docked', base: null } }, [], keys, 'pointer')
    expect(gate?.id).toBe('gate')
    expect(gate?.text).toContain('hold F')
    expect(nextTip({ ...calm, zone: { kind: 'space', prompt: 'jump' } }, ['gate'], keys, 'pointer')?.id).toBe('cruise')
    // (no names float in space: the target key says what a thing is)
    expect(nextTip({ ...calm, zone: { kind: 'space', prompt: 'jump' } }, ['gate', 'cruise'], keys, 'pointer')?.id).toBe('target')
    expect(nextTip({ ...calm, zone: { kind: 'space', prompt: 'jump' } }, ['gate', 'cruise', 'target'], keys, 'pointer')).toBeNull()
    expect(nextTip({ ...calm, zone: { kind: 'space', prompt: '' } }, [], namer('ps'), 'ps')?.text).toContain('R1')
    expect(nextTip({ ...calm, loop: { stage: 'landed', base: { friendly: true } } }, [], keys, 'pointer')?.id).toBe('hangar')
    expect(nextTip({ ...calm, affordable: true }, [], keys, 'pointer')?.id).toBe('part')
    expect(nextTip({ ...calm, mates: 1 }, [], keys, 'pointer')?.id).toBe('squad')
    expect(nextTip({ ...calm, status: { lock: 0, incoming: 1 } }, [], namer('ps'), 'ps')?.text).toContain('✕')
    // (raiders come for him the first time: where they wait, and the way out)
    const ambush = nextTip({ ...calm, status: { lock: 0, incoming: 99, ambushed: true } }, [], keys, 'pointer')
    expect(ambush?.id).toBe('ambush')
    expect(ambush?.text).toContain('(M)')
    // (banked ore unsold, and few credits: where it is sold; with credits to spare at home: the frontier)
    const landed = { ...calm, loop: { stage: 'landed', base: { friendly: true } } }
    expect(nextTip({ ...landed, vault: 20, credits: 250 }, [], keys, 'pointer')?.id).toBe('sell')
    expect(nextTip({ ...landed, vault: 20, credits: 250 }, [], keys, 'pointer')?.text).toContain('(I)')
    expect(nextTip({ ...landed, vault: 0, credits: 900, home: true }, ['sell'], keys, 'pointer')?.id).toBe('frontier')
    expect(nextTip({ ...landed, vault: 0, credits: 900, home: false }, ['sell'], keys, 'pointer')?.id).toBe('hangar')
  })
})
