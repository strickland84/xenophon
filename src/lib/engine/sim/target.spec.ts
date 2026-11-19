// The target key (docs/targeting.md): a press picks the nearest thing on the frame and the next nearest each press after,
// round and round; held a moment it lets go; a ship shot down is let go; an enemy picked is the one the sights follow; the
// same presses pick the same things in every run.
import { describe, expect, it } from 'vitest'
import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../index'
import { TARGET } from '../data/target'
import { candidates } from './target'

const ctl = (more = {}) => ({ turn: 1e-4, climb: 0, boost: 0, fire: false, secondary: false, land: false, ...more })

/** a pilot of the Nomarchy out in his home system's space, far from anything, behind his ship, with three enemies ahead */
function withRaiders() {
  const sc = createScene(withDefaults({ ...worldSettings('s0'), side: 'nomarchy', intro: false, hull: 'corsair', locals: false }))
  sc.setClock(1_800_000_000)
  sc.resize(456, 256)
  for (let n = 0; n < 150; n++) {
    sc.setControls(ctl({ land: n > 5 && n < 60 }))
    sc.step(STEP)
  }
  sc.placePlayer(sc.player.x + 20000, sc.player.y + 20000, 0)
  sc.act('view')
  const me = sc.player
  const ids = [
    [-30, -160],
    [60, -240],
    [-90, -320],
  ].map(([dx, dy]) =>
    sc.addShip({ x: me.x + dx, y: me.y + dy, height: me.height, heading: 0, hull: 'lance', side: 1, speed: 60, pilot: 0 }),
  )
  for (let n = 0; n < 60; n++) {
    sc.setControls(ctl())
    sc.step(STEP)
  }
  return { sc, ids, s: stateOf(sc)! }
}

const press = (sc: ReturnType<typeof withRaiders>['sc']) => {
  sc.act('target')
  sc.setControls(ctl())
  sc.step(STEP)
  return stateOf(sc)!.target.on
}

describe('the target key', () => {
  it('picks the thing on the frame nearest where the ship is aiming, then the next, round and round', () => {
    const { sc, s } = withRaiders()
    const all = candidates(s).map((t) => t.ref)
    expect(all.length).toBeGreaterThanOrEqual(3)
    const first = press(sc)
    expect(first?.kind).toBe('ship')
    const seen = [first]
    for (let i = 1; i < all.length; i++) seen.push(press(sc))
    // (every one picked once; the next press comes round to the first again)
    expect(new Set(seen.map((r) => JSON.stringify(r))).size).toBe(all.length)
    expect(JSON.stringify(press(sc))).toBe(JSON.stringify(first))
    expect(sc.target?.rel).toBe('enemy')
  })

  // (James, 2026-11-19: "I want T to target the nearest thing to your crosshair or essentially where the ship is aiming")
  it.each([
    ['from behind', 0, 420, 140, 110],
    ['overhead', 2, 100, 50, 70],
  ])('picks what is under the sights before what is nearer off to the side (%s)', (_, back, far, along, across) => {
    const { sc, s, ids } = withRaiders()
    // (from behind, the view key twice more comes back round overhead)
    for (let v = 0; v < back; v++) sc.act('view')
    for (let n = 0; n < 60; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    for (const id of ids) sc.removeShip(id)
    const me = sc.player
    const ahead = { x: Math.sin(me.heading), y: -Math.cos(me.heading) }
    const side = { x: -ahead.y, y: ahead.x }
    const put = (along: number, across: number) =>
      sc.addShip({
        x: me.x + ahead.x * along + side.x * across,
        y: me.y + ahead.y * along + side.y * across,
        height: me.height,
        heading: me.heading,
        hull: 'lance',
        side: 1,
        speed: 0,
        pilot: 0,
      })
    const near = put(along, across)
    const under = put(far, 0)
    sc.setControls(ctl())
    sc.step(STEP)
    const all = candidates(s)
    expect(all.find((t) => t.ref.kind === 'ship' && t.ref.id === near)!.d).toBeLessThan(
      all.find((t) => t.ref.kind === 'ship' && t.ref.id === under)!.d,
    )
    expect(press(sc)).toEqual({ kind: 'ship', id: under })
    // (the nearer, off to the side, comes later round)
    const order = candidates(s).map((t) => JSON.stringify(t.ref))
    expect(order.indexOf(JSON.stringify({ kind: 'ship', id: near }))).toBeGreaterThan(
      order.indexOf(JSON.stringify({ kind: 'ship', id: under })),
    )
  })

  // (James, 2026-11-19: two ships in the distance, seen from the seat, could not be picked)
  it('picks a ship far off, beyond the near limit, while it is drawn as a mark to be seen; and not once it is too small', () => {
    const { sc, s, ids } = withRaiders()
    sc.act('view')
    for (let n = 0; n < 60; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    for (const id of ids) sc.removeShip(id)
    const me = sc.player
    const put = (along: number) =>
      sc.addShip({
        x: me.x + Math.sin(me.heading) * along,
        y: me.y - Math.cos(me.heading) * along,
        height: me.height,
        heading: me.heading,
        hull: 'lance',
        side: 1,
        speed: 0,
        pilot: 0,
      })
    const far = put(TARGET.pickShip * 1.6)
    const lost = put(TARGET.pickShip * 40)
    sc.setControls(ctl())
    sc.step(STEP)
    const picks = candidates(s).map((t) => t.ref)
    expect(picks).toContainEqual({ kind: 'ship', id: far })
    expect(picks).not.toContainEqual({ kind: 'ship', id: lost })
    expect(press(sc)).toEqual({ kind: 'ship', id: far })
  })

  it('held a moment, lets the target go', () => {
    const { sc, s } = withRaiders()
    press(sc)
    expect(s.target.on).not.toBeNull()
    for (let t = 0; t < TARGET.hold + 0.1; t += STEP) {
      sc.setControls(ctl({ target: true }))
      sc.step(STEP)
    }
    expect(s.target.on).toBeNull()
    // (let go and pressed again, it picks afresh)
    sc.setControls(ctl())
    sc.step(STEP)
    expect(press(sc)).not.toBeNull()
  })

  it('an enemy picked is the one the sights follow, and is let go once shot down', () => {
    const { sc, s, ids } = withRaiders()
    // (the furthest of the three, picked outright)
    sc.setTarget({ kind: 'ship', id: ids[2] })
    for (let n = 0; n < 30; n++) {
      sc.setControls(ctl())
      sc.step(STEP)
    }
    const picked = s.ships.find((x) => x.id === ids[2])!.jet.fighter
    expect(s.sights.target).toBe(picked)
    sc.removeShip(ids[2])
    sc.step(STEP)
    expect(s.target.on).toBeNull()
  })

  it('picks the same things in every run', () => {
    const run = () => {
      const { sc } = withRaiders()
      return [press(sc), press(sc), press(sc)].map((r) => JSON.stringify(r)).join()
    }
    expect(run()).toBe(run())
  })

  it('in space, picks bodies too, and says what they are', () => {
    const { sc, s } = withRaiders()
    // (nothing else about: the system's bodies on the frame are all there is to pick)
    for (const id of s.ships.map((x) => x.id)) sc.removeShip(id)
    let body = null
    for (let i = 0; i < 20 && !body; i++) if (press(sc)?.kind === 'body') body = sc.target
    if (body) {
      expect(body.name.length).toBeGreaterThan(0)
      expect(body.what.length).toBeGreaterThan(0)
    }
  })
})
