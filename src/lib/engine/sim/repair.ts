// Repairs, done where the ship stands: docked at a friendly station or down on a friendly base's pad, the mining key held
// (the laser has nothing to cut there) mends the hull a little at a time, sparks coming off it, and every point of it
// is paid for as it is mended. Let go, it stops. (A repair could only be bought from the base's screen, under Supplies,
// and a pilot who had not found it flew on holed. James, 2026-11-19: "we need in game repairs at stations".)
//
// The scene does not keep the pilot's money: the page says what he has (Scene.setPurse) and is told what was spent, in
// the ledger, when the mending stops.

import { REPAIR, SHOP } from '../data/shop'
import type { SceneState } from '../state'
import { hash8 } from '../util/math'
import { ownFighter } from './combat'
import { addSpark, sound, SPARK_HULL } from './effects'
import { EJ_FLY } from './ejection'
import { ABOARD } from './foot'
import { LANDED } from './landing'
import { friendly, looping, record } from './loop'

export interface Repair {
  /** credits the pilot has to spend, as the page last said (with nothing said: no end of them) */
  purse: number
  /** a repair can be had here now: down or docked at a friendly base, the hull short of whole */
  offered: boolean
  /** it is being mended now; and he would have it mended and cannot pay */
  on: boolean
  broke: boolean
  /** credits this mending has come to, not yet told to the page */
  owed: number
  /** seconds until the next spark flies; and until he may be told again that he cannot pay */
  spark: number
  heard: number
}

export function createRepair(): Repair {
  return { purse: Infinity, offered: false, on: false, broke: false, owed: 0, spark: 0, heard: 0 }
}

/** what a repair of the whole hull would come to now, credits (0: it is whole) */
export function repairCost(scene: SceneState) {
  const f = ownFighter(scene)
  return f ? Math.ceil(Math.max(0, f.stats.hull - f.hull) * SHOP.repair) : 0
}

/** how repairs stand, for the page and the HUD */
export function repairStatus(scene: SceneState) {
  const r = scene.repair
  return { offered: r.offered, cost: repairCost(scene), on: r.on, broke: r.broke }
}

/** what the mending came to is told to the page, once it stops */
function settle(scene: SceneState) {
  const r = scene.repair
  const credits = Math.ceil(r.owed - 1e-6)
  if (credits > 0) record(scene, { kind: 'repair', credits, base: scene.loop.landing.base?.name ?? '' })
  if (Number.isFinite(r.purse)) r.purse = Math.max(0, r.purse - credits)
  r.owed = 0
}

/** a step of the repairs: offered where they can be had, done while the mining key is held, paid for as they go */
export function stepRepair(scene: SceneState, dt: number) {
  const r = scene.repair
  const L = scene.loop.landing
  const f = scene.eject.stage === EJ_FLY ? ownFighter(scene) : null
  const here =
    !!f &&
    looping(scene) &&
    L.stage === LANDED &&
    !!L.base &&
    friendly(scene, L.base) &&
    scene.foot.stage === ABOARD &&
    scene.zone.kind !== 'interior'
  const short = f ? f.stats.hull - f.hull : 0
  // (offered for a hull short of whole by something to speak of; once begun, it goes on to the last of it)
  r.offered = here && (short > 0.5 || (r.on && short > 0))
  const left = r.purse - r.owed
  r.broke = r.offered && left < SHOP.repair
  const wanted = r.offered && scene.controls.mine
  if (!wanted || r.broke || !f) {
    if (wanted && r.broke && r.heard <= 0) {
      sound(scene, 'refused', f?.jet.x ?? 0, f?.jet.y ?? 0, f?.jet.z ?? 0, 1, true)
      r.heard = 0.6
    }
    r.heard = Math.max(0, r.heard - dt)
    if (r.on || r.owed > 0) settle(scene)
    r.on = false
    return
  }
  // so many points of the hull a second, as far as his credits go
  const points = Math.min(REPAIR.rate * dt, short, left / SHOP.repair)
  f.hull = Math.min(f.stats.hull, f.hull + points)
  r.owed += points * SHOP.repair
  r.on = true
  // sparks off the hull where it is being worked on, and the sound of it
  const j = f.jet
  r.spark -= dt
  if (r.spark <= 0) {
    r.spark = REPAIR.spark
    const n = Math.floor(scene.time * 60)
    const along = (hash8(n) / 255 - 0.5) * scene.mesh.model.l * 0.7
    const across = (hash8(n + 91) / 255 - 0.5) * scene.mesh.model.w * 0.6
    const sn = Math.sin(j.yaw)
    const cs = Math.cos(j.yaw)
    const x = j.x + sn * along + cs * across
    const y = j.y - cs * along + sn * across
    for (let i = 0; i < 3; i++)
      addSpark(
        scene,
        x,
        y,
        j.z + 2,
        (hash8(n + i * 7) / 255 - 0.5) * 26,
        (hash8(n + i * 13 + 3) / 255 - 0.5) * 26,
        14 + (hash8(n + i) / 255) * 18,
        SPARK_HULL,
      )
  }
  // (whole again: it stops by itself)
  if (f.stats.hull - f.hull <= 0.01) {
    f.hull = f.stats.hull
    settle(scene)
    r.on = false
    r.offered = false
  }
}
