import { describe, expect, it } from 'vitest'
import { STEP } from '../engine'
import { createClock } from './loop'

/** steps a clock takes over a run of repaints `dt` seconds apart */
function stepsOver(gaps: number[]) {
  const clock = createClock()
  return gaps.map((dt) => clock.advance(dt))
}

describe('the frame clock steps the scene at a fixed rate', () => {
  it('takes one step a repaint on a 60 Hz screen, however much the repaints wobble', () => {
    const wobble = [0.0012, -0.0012, 0.002, -0.002, 0.0004, -0.0004]
    const gaps = Array.from({ length: 600 }, (_, n) => STEP + wobble[n % wobble.length])
    expect(new Set(stepsOver(gaps))).toEqual(new Set([1]))
  })

  it('takes the same number of steps a second on any screen', () => {
    for (const hz of [30, 60, 75, 120, 144, 165, 240]) {
      const steps = stepsOver(Array.from({ length: hz * 10 }, () => 1 / hz)).reduce((a, b) => a + b, 0)
      expect(Math.abs(steps - 600)).toBeLessThanOrEqual(1)
    }
  })

  it('catches up a few steps after a slow repaint, but no more', () => {
    expect(stepsOver([STEP * 2])).toEqual([2])
    expect(stepsOver([5])).toEqual([3])
    // and the time it could not make up is let go, not owed
    expect(stepsOver([5, STEP])).toEqual([3, 1])
  })
})
