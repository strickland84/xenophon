// The roll (sim/flight.ts startRoll): not on the ground (James, 2026-11-19: "we should not be able to do a roll when landed
// either with space bar"), and in flight as ever.
import { describe, expect, it } from 'vitest'
import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../index'

const ctl = (more = {}) => ({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })

describe('the roll', () => {
  it('is refused landed, and rolls in flight', () => {
    // (a pilot of a side starts landed at his capital on its world)
    const sc = createScene(withDefaults({ ...worldSettings('w0'), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
    sc.setClock(1_800_000_000)
    sc.resize(456, 256)
    for (let n = 0; n < 30; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    const s = stateOf(sc)!
    expect(sc.loop.stage).toBe('landed')
    sc.act('roll')
    sc.step(STEP)
    expect(s.jets[0].stunt).toBe(-1)
    // (lifted off and flying: it rolls)
    for (let n = 0; n < 400 && sc.loop.stage !== 'flying'; n++) {
      sc.setControls(ctl({ land: true }))
      sc.step(STEP)
    }
    for (let n = 0; n < 60; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    expect(sc.loop.stage).toBe('flying')
    sc.act('roll')
    sc.step(STEP)
    expect(s.jets[0].stunt).toBeGreaterThanOrEqual(0)
  })
})
