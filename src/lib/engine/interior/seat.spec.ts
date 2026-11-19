import { describe, expect, it } from 'vitest'
import { createScene, DEFAULT_PARAMS, STEP } from '../index'

// Up out of the seat (sim/interior.ts toggleSeat): in flight, the ship going on without him in the seat; landed or docked, into
// his ship's rooms as the hangar's Aboard takes him.
const idle = { turn: 0, climb: 0, boost: 0, throttle: 0, fire: false, secondary: false }

function landedScene() {
  const scene = createScene({ ...DEFAULT_PARAMS, world: 'w0', side: 'nomarchy', intro: false, skirmish: false, locals: false } as never)
  scene.resize(240, 135)
  return scene
}
const run = (scene: ReturnType<typeof landedScene>, frames: number, held: Partial<typeof idle> & { land?: boolean } = {}) => {
  for (let i = 0; i < frames; i++) {
    scene.setControls({ ...idle, ...held })
    scene.step(STEP)
  }
}

describe('up out of the seat', () => {
  it('landed, takes him into his ship’s rooms by the seat and back to it; flying, up with the ship flying on', () => {
    const scene = landedScene()
    run(scene, 30)
    // (landed: into his rooms, the ship shut down behind him, as the hangar's Aboard does; James wanted G for it too)
    scene.act('seat')
    expect(scene.foot.up).toBe(false)
    expect(scene.zone.kind).toBe('interior')
    expect(scene.interior).toMatchObject({ place: 'ship', flying: false })
    run(scene, 1)
    expect(scene.interior.spot).toBe('seat')
    scene.act('seat')
    run(scene, 1)
    expect(scene.zone.kind).toBe('surface')
    expect(scene.loop.stage).toBe('landed')
    run(scene, 90, { land: true })
    run(scene, 60)
    expect(scene.loop.stage).toBe('flying')
    scene.act('seat')
    expect(scene.foot.up).toBe(true)
    expect(scene.foot.stage).toBe('walking')
    expect(scene.zone.kind).toBe('surface')
    expect(scene.interior).toMatchObject({ place: 'ship', flying: true })
    run(scene, 1)
    expect(scene.interior.spot).toBe('seat')
    // (others see his ship flying on, not him inside)
    expect(scene.pilot).toMatchObject({ flying: true, inside: 0, foot: 0, ship: 1 })
    expect(scene.zoom).toBeGreaterThan(1)
  })

  it('holds the throttle, fires nothing, and the guns, the roll and the view wait while he is up', () => {
    const scene = landedScene()
    run(scene, 90, { land: true })
    run(scene, 60)
    scene.setThrottle(0.6)
    run(scene, 2)
    scene.act('seat')
    const heading = scene.player.heading
    scene.act('roll')
    scene.act('view')
    // (the keys walk him; the trigger and the throttle keys do nothing outside)
    run(scene, 240, { turn: 1, climb: 1, fire: true, throttle: 1 })
    expect(scene.status.throttle).toBeCloseTo(0.6, 5)
    expect(scene.view).toBe('top')
    // (back on the heading it had as he got up, whatever turn it was in)
    expect(Math.abs(Math.atan2(Math.sin(scene.player.heading - heading), Math.cos(scene.player.heading - heading)))).toBeLessThan(0.01)
    expect(scene.takeSounds().some((s) => s.kind === 'cannon')).toBe(false)
    // (the seat key from anywhere: back in the seat at once, and the controls his)
    scene.act('seat')
    expect(scene.foot.up).toBe(false)
    expect(scene.foot.stage).toBe('ship')
    run(scene, 60, { turn: 1 })
    expect(Math.abs(scene.player.heading - heading)).toBeGreaterThan(0.1)
  })
})
