// Flying free in space with the pointer (sim/spaceflight.ts): a stick, as Elite Dangerous's mouse is (James, 2026-11-19,
// "mirror elite dangerous"): resting in the middle of its steering it does nothing; pushed up or down it pitches the nose
// round, faster the further, so a mouse loops (James, earlier that day: "I cannot do a full 360 spin").
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
  // (the camera settled into the view, so the middle of the pointer's steering is where it stays)
  for (let n = 0; n < 120; n++) {
    sc.setControls(ctl)
    sc.step(STEP)
  }
  return { sc, lead: stateOf(sc)!.jets[0] }
}

/** how far round the nose has pitched (radians, either way, counted as it goes) with the pointer at x and `dy` px under
 * the middle of its steering for `seconds` */
function pitched(views: number, x: number, dy: number, seconds: number) {
  const { sc, lead } = flying(views)
  const y = stateOf(sc)!.view.steerY + dy
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
  it('loops the ship from behind, pushed up or down', () => {
    expect(pitched(1, 228, -90, 8)).toBeGreaterThan(Math.PI * 2)
    expect(pitched(1, 228, 90, 8)).toBeGreaterThan(Math.PI * 2)
  })

  it('loops the ship from the seat', () => {
    expect(pitched(2, 228, -80, 8)).toBeGreaterThan(Math.PI * 2)
  })

  it('pitches faster the further it is pushed', () => {
    expect(pitched(1, 228, -80, 2)).toBeGreaterThan(pitched(1, 228, -30, 2) * 1.5)
  })

  it('resting in the middle, does nothing', () => {
    expect(pitched(1, 228, 3, 8)).toBeLessThan(0.05)
  })
})
