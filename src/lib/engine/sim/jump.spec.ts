// On foot, a jump and a climb (James: "space should jump such that a stuck player can clear most terrain obstacles, and if
// up against a big cliff it should climb"): a pilot on a canyon world pushes into a cliff too tall to step onto and climbs
// it, and a jump takes him up off the ground and down again.
import { describe, expect, it } from 'vitest'
import { createScene, DEFAULT_PARAMS, stateOf } from '../index'
import { FOOT } from '../data/foot'
import { pickWorld } from '../testing/pick'
import { groundAt, matAt } from '../world/world'

/** a pilot of the Nomarchy on foot by his ship on the first canyon world */
function onFoot() {
  const scene = createScene({ ...DEFAULT_PARAMS, ...pickWorld('canyon'), side: 'nomarchy', intro: false, skirmish: false })
  scene.resize(240, 135)
  scene.setClock(1_800_000_000)
  scene.step(1 / 60)
  scene.act('use')
  for (let i = 0; i < 60; i++) scene.step(1 / 60)
  return { scene, s: stateOf(scene)! }
}

/** the keys held to walk one way across the ground (the screen's way: the camera is turned on foot) */
function push(scene: ReturnType<typeof onFoot>['scene'], dx: number, dy: number) {
  const yaw = scene.foot.yaw
  const c = Math.cos(yaw)
  const sn = Math.sin(yaw)
  scene.setControls({ turn: dx * c - dy * sn, climb: -(dx * sn + dy * c), boost: 0, fire: false, secondary: false })
}

describe('on foot, a jump and a climb', () => {
  it('climbs a cliff pushed against, onto its top', () => {
    const { scene, s } = onFoot()
    const w = s.foot.walker.jet
    // (the world's own ground, not a base's buildings, which are never climbed: world/features.ts materials from 32)
    const natural = (x: number, y: number) => matAt(s.world, x, y) >= 4 && matAt(s.world, x, y) < 32
    // (the nearest foot of a cliff: a rise of 8 px or more within 2 px, the way it rises)
    let at: { x: number; y: number; dx: number; dy: number; top: number } | null = null
    for (let r = 4; r < 1200 && !at; r += 2)
      for (let a = 0; a < 64 && !at; a++) {
        const x = w.x + Math.cos((a / 64) * Math.PI * 2) * r
        const y = w.y + Math.sin((a / 64) * Math.PI * 2) * r
        const g0 = groundAt(s.world, x, y)
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (!at && g0 > 2 && natural(x, y) && natural(x + dx * 3, y + dy * 3) && groundAt(s.world, x + dx * 2, y + dy * 2) - g0 >= 8)
            at = { x, y, dx, dy, top: groundAt(s.world, x + dx * 3, y + dy * 3) }
      }
    expect(at, 'a cliff near').toBeTruthy()
    w.x = at!.x
    w.y = at!.y
    w.z = groundAt(s.world, w.x, w.y) + FOOT.chest
    const from = w.z
    let climbed = false
    for (let i = 0; i < 60 * 6; i++) {
      push(scene, at!.dx, at!.dy)
      scene.step(1 / 60)
      climbed ||= s.foot.climbing
    }
    expect(climbed, 'he climbed').toBe(true)
    expect(w.z - from, 'up the cliff').toBeGreaterThanOrEqual(at!.top - (from - FOOT.chest) - FOOT.step)
  })

  it('jumps up off the ground and comes down on it again, once until he is down', () => {
    const { scene, s } = onFoot()
    const w = s.foot.walker.jet
    scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false })
    const ground = w.z
    scene.act('roll')
    let top = 0
    for (let i = 0; i < 20; i++) {
      scene.step(1 / 60)
      top = Math.max(top, w.z - ground)
      // (a second press in the air does nothing)
      if (i === 5) scene.act('roll')
    }
    expect(top, 'off the ground').toBeGreaterThan(5)
    expect(top, 'not twice').toBeLessThan((FOOT.jump.up * FOOT.jump.up) / (2 * FOOT.jump.fall) + 1)
    for (let i = 0; i < 60; i++) scene.step(1 / 60)
    expect(s.foot.airborne).toBe(false)
    expect(Math.abs(w.z - ground)).toBeLessThan(1)
  })
})
