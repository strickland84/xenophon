// The vertical thrusters (Alt and Ctrl, as Elite's: James, 2026-11-19): the ship goes straight up or down, square to its
// nose, and the nose does not pitch for it; over a world and in space.
import { describe, expect, it } from 'vitest'
import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../index'

const ctl = { turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false }

/** a scene flown a while first, from behind (over the island world, or out in a system's space far from anything) */
function flying(space: boolean) {
  const sc = createScene(
    withDefaults({
      ...(space ? { ...worldSettings('s0'), side: 'nomarchy' } : {}),
      intro: false,
      hull: 'corsair',
      locals: false,
      wander: false,
      skirmish: false,
      crash: false,
    }),
  )
  sc.setClock(1_800_000_000)
  sc.resize(456, 256)
  for (let n = 0; n < 150; n++) {
    sc.setControls({ ...ctl, land: space && n > 5 && n < 60 })
    sc.step(STEP)
  }
  if (space) sc.placePlayer(sc.player.x + 20000, sc.player.y + 20000, 0)
  sc.act('view')
  for (let n = 0; n < 120; n++) {
    sc.setControls(ctl)
    sc.step(STEP)
  }
  return { sc, lead: stateOf(sc)!.jets[0] }
}

/** how far the ship rose (or fell) in `seconds` of `lift`, and how far its nose was ever off where it began */
function thrust(space: boolean, lift: number, seconds: number) {
  const { sc, lead } = flying(space)
  const z = lead.z
  const pitch = lead.pitch
  let off = 0
  for (let n = 0; n < seconds / STEP; n++) {
    sc.setControls({ ...ctl, lift })
    sc.step(STEP)
    off = Math.max(off, Math.abs(lead.pitch - pitch))
  }
  return { rose: lead.z - z, off }
}

describe('the vertical thrusters', () => {
  it('over a world, lift the ship straight up and let it down, the nose level', () => {
    const up = thrust(false, 1, 2)
    expect(up.rose).toBeGreaterThan(20)
    expect(up.off).toBeLessThan(0.05)
    const down = thrust(false, -1, 2)
    expect(down.rose).toBeLessThan(-20)
    expect(down.off).toBeLessThan(0.05)
  })

  it('in space, move it square to its nose, which does not pitch', () => {
    const up = thrust(true, 1, 2)
    expect(up.rose).toBeGreaterThan(60)
    expect(up.off).toBeLessThan(0.02)
    expect(thrust(true, -1, 2).rose).toBeLessThan(-60)
  })

  it('held down all the way to the ground, land the ship, as Land does', () => {
    // (a pilot of a side starts landed at his capital; up, flown on a while, then the thrusters held down)
    const sc = createScene(withDefaults({ ...worldSettings('w0'), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
    sc.setClock(1_800_000_000)
    sc.resize(456, 256)
    for (let n = 0; n < 400 && sc.loop.stage !== 'flying'; n++) {
      sc.setControls({ ...ctl, land: n > 20 })
      sc.step(STEP)
    }
    for (let n = 0; n < 120; n++) {
      sc.setControls({ ...ctl, lift: 0.6 })
      sc.step(STEP)
    }
    expect(sc.loop.stage).toBe('flying')
    for (let n = 0; n < 1200 && sc.loop.stage !== 'landed'; n++) {
      sc.setControls({ ...ctl, lift: -1 })
      sc.step(STEP)
    }
    expect(sc.loop.stage).toBe('landed')
  })

  it('Q and E slide it sideways, square to its heading, the nose not turning; over a world and in space', () => {
    for (const space of [false, true]) {
      const { sc, lead } = flying(space)
      const x = lead.x
      const y = lead.y
      const yaw = lead.yaw
      for (let n = 0; n < 120; n++) {
        sc.setControls({ ...ctl, strafe: 1 })
        sc.step(STEP)
      }
      // (along where its right was, less how far it went ahead, which is along its nose)
      const right = (lead.x - x) * Math.cos(yaw) + (lead.y - y) * Math.sin(yaw)
      expect(right).toBeGreaterThan(40)
      expect(Math.abs(lead.yaw - yaw)).toBeLessThan(0.02)
    }
  })
})
