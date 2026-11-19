import { describe, expect, it } from 'vitest'
import { HULL_STATS } from './hulls'
import { BEAM, FLAK, fitEffect, MINES, MODULE_SLOTS, MODULES, RACK, WEAPONS } from './loadout'
import type { FitEffect, WeaponId } from './loadout'
import { CANNON, MISSILE } from './weapons'

// Sidegrades, not upgrades (the plan's section 14): every way of fitting a hull is checked against
// the same hull bare, on every stat that decides a fight. None may be more than a quarter better;
// and every weapon and module must cost something in a fighting stat.

/** damage a second from one mount of each gun */
const DPS: Record<string, number> = {
  cannon: CANNON.rate * CANNON.damage,
  flak: FLAK.rate * FLAK.pellets * FLAK.damage,
  laser: BEAM.rate * BEAM.damage,
  rack: 0,
  mines: 0,
}

/** what a fit can do in ten seconds of a fight: its guns, its missiles, and its mines (half of which find something) */
function firepower(hull: string, weapons: WeaponId[], e: FitEffect) {
  const guns = weapons.reduce((n, w) => n + DPS[w], 0)
  return guns * 10 + (HULL_STATS[hull].missiles + e.missiles) * MISSILE.damage + e.mines * MINES.damage * 0.5
}

/** the stats that decide a fight, for a hull fitted so */
function fighting(hull: string, weapons: WeaponId[], modules: string[]) {
  const e = fitEffect({ weapons, modules }, weapons.length, MODULE_SLOTS[hull])
  return {
    speed: e.speed,
    agility: e.agility,
    boost: e.boost,
    hull: e.hull,
    shield: e.shield,
    recharge: e.recharge,
    // how long the guns can be held: cooling against the heat built
    endurance: e.cool / e.heat,
    firepower: firepower(hull, weapons, e),
  }
}

/** every way of choosing up to `n` of a list */
function subsets<T>(list: T[], n: number): T[][] {
  const out: T[][] = [[]]
  for (const x of list) for (const s of [...out]) if (s.length < n) out.push([...s, x])
  return out
}

/** every way of arming `mounts` mounts */
function armings(mounts: number): WeaponId[][] {
  let out: WeaponId[][] = [[]]
  for (let m = 0; m < mounts; m++) out = out.flatMap((s) => WEAPONS.map((w) => [...s, w.id]))
  return out
}

describe('loadouts are sidegrades', () => {
  for (const [hull, stats] of Object.entries(HULL_STATS)) {
    it(`no fit of a ${hull} is more than a quarter better than it bare, on any fighting stat`, () => {
      const bare = fighting(hull, Array(stats.mounts).fill('cannon'), [])
      const mods = subsets(
        MODULES.map((m) => m.id),
        MODULE_SLOTS[hull],
      )
      let worst = { stat: '', ratio: 0, fit: '' }
      for (const weapons of armings(stats.mounts))
        for (const modules of mods) {
          const s = fighting(hull, weapons, modules)
          for (const k of Object.keys(s) as (keyof typeof s)[]) {
            const ratio = s[k] / Math.max(1e-9, bare[k])
            if (ratio > worst.ratio) worst = { stat: k, ratio, fit: `${weapons.join(',')}|${modules.join(',')}` }
          }
        }
      expect(worst.ratio, `${worst.stat} with ${worst.fit}`).toBeLessThanOrEqual(1.25)
    })
  }

  it('every module costs something in a fighting stat', () => {
    for (const m of MODULES) {
      const s = fighting('corsair', ['cannon', 'cannon'], [m.id])
      expect(
        Object.values(s).some((v, i) => v < Object.values(fighting('corsair', ['cannon', 'cannon'], []))[i]),
        m.id,
      ).toBe(true)
      expect(m.cost.length, m.id).toBeGreaterThan(0)
    }
  })

  it('every weapon but the cannon trades firepower or a gun for what it gives', () => {
    const bare = fighting('corsair', ['cannon', 'cannon'], []).firepower
    for (const w of WEAPONS) {
      if (w.id === 'cannon') continue
      const s = fighting('corsair', [w.id, 'cannon'], [])
      expect(s.firepower, w.id).toBeLessThan(bare)
    }
    // (and each is worth something: a laser cuts faster, a rack adds missiles, a layer carries mines)
    expect(fitEffect({ weapons: ['laser'], modules: [] }, 1, 1).mine).toBe(BEAM.mine)
    expect(fitEffect({ weapons: ['rack'], modules: [] }, 1, 1).missiles).toBe(RACK.missiles)
    expect(fitEffect({ weapons: ['mines'], modules: [] }, 1, 1).mines).toBe(MINES.hold)
  })

  it('the starter, fitted any way, stays within a quarter of the starter bare', () => {
    const bare = fighting('corsair', ['cannon', 'cannon'], [])
    for (const weapons of armings(2))
      for (const modules of subsets(
        MODULES.map((m) => m.id),
        2,
      )) {
        const s = fighting('corsair', weapons, modules)
        for (const k of Object.keys(s) as (keyof typeof s)[]) expect(s[k] / bare[k], `${k} ${weapons}|${modules}`).toBeLessThanOrEqual(1.25)
      }
  })
})
