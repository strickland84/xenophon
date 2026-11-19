import { describe, expect, it } from 'vitest'
import { RESOURCES } from './resources'
import { payFor, SHOP } from './shop'

// The counter makes up ore a price asks for that the vault lacks (polish step 9: a pilot who only fights can buy anything)
describe('paying for a part', () => {
  const needs = [{ id: 'magma-glass' as const, n: 4 }]
  it('takes the ore from the vault when it is there, for the credits alone', () => {
    const p = payFor(520, needs, () => 10)
    expect(p.credits).toBe(520)
    expect(p.items).toEqual([{ id: 'magma-glass', n: 4 }])
    expect(p.madeUp).toEqual([])
  })
  it('makes up what the vault lacks at the counter, dearer than the ore is sold', () => {
    const p = payFor(520, needs, () => 1)
    expect(p.items).toEqual([{ id: 'magma-glass', n: 1 }])
    expect(p.madeUp).toEqual([{ id: 'magma-glass', n: 3 }])
    expect(p.credits).toBe(520 + Math.round(3 * RESOURCES['magma-glass'].price * SHOP.makeUp))
    expect(SHOP.makeUp).toBeGreaterThan(1)
  })
  it('buys with credits alone when there is no ore at all', () => {
    const p = payFor(380, [{ id: 'cryo-ice', n: 4 }], () => 0)
    expect(p.items).toEqual([])
    expect(p.credits).toBe(380 + Math.round(4 * RESOURCES['cryo-ice'].price * SHOP.makeUp))
  })
})
