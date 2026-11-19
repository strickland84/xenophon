// Flying free in space with the pointer (sim/spaceflight.ts): resting off the frame's edges it aims the nose and holds it
// there; pushed into the band at the frame's top or bottom it pitches the nose on round, as the keys do, so a mouse loops
// (James, 2026-11-19: "with the mouse cursor pitching up and down, I cannot do a full 360 spin").
import { describe, expect, it } from 'vitest'
import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../index'

const ctl = { turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false }

/** a pilot out in his home system's space, far from anything, in a view (1 from behind, 2 the seat), his mouse at rest */
function flying(views: number) {
  const sc = createScene(
    withDefaults({ ...worldSettings('s0'), side: 'nomarchy', intro: false, hull: 'corsair', locals: false, wander: false }),
  )
  sc.setClock(1_800_000_000)
  sc.resize(456, 256)
  for (let n = 0; n < 150; n++) {
    sc.setControls({ ...ctl, land: n > 5 && n < 60 })
    sc.step(STEP)
  }
  sc.placePlayer(sc.player.x + 20000, sc.player.y + 20000, 0)
  for (let v = 0; v < views; v++) sc.act('view')
  return { sc, lead: stateOf(sc)!.jets[0] }
}

/** how far round the nose has pitched (radians, either way, counted as it goes) with the pointer at (x, y) for `seconds` */
function pitched(views: number, x: number, y: number, seconds: number) {
  const { sc, lead } = flying(views)
  let turned = 0
  let was = lead.pitch
  for (let n = 0; n < seconds / STEP; n++) {
    sc.pointerMove(x, y)
    sc.setControls(ctl)
    sc.step(STEP)
    let d = lead.pitch - was
    d -= Math.PI * 2 * Math.round(d / (Math.PI * 2))
    turned += d
    was = lead.pitch
  }
  return Math.abs(turned)
}

describe('the pointer in space', () => {
  it('loops the ship from behind, held at the top of the frame or the bottom', () => {
    expect(pitched(1, 228, 4, 8)).toBeGreaterThan(Math.PI * 2)
    expect(pitched(1, 228, 252, 8)).toBeGreaterThan(Math.PI * 2)
  })

  it('loops the ship from the seat', () => {
    expect(pitched(2, 228, 4, 8)).toBeGreaterThan(Math.PI * 2)
  })

  it('held off the edges, aims the nose and holds it: no loop', () => {
    expect(pitched(1, 228, 60, 8)).toBeLessThan(Math.PI / 2)
    expect(pitched(1, 228, 200, 8)).toBeLessThan(Math.PI / 2)
  })
})
