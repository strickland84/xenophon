// The player's squad, as the page says it is (Scene.setSquad): the other pilots in it (ships in the
// scene) and, filling it when he is alone, his computer wingmen. In tight formation with any of them
// he flies in their slipstream (data/squads.ts): a little faster, eased in and out.

import { SQUAD } from '../data/squads'
import type { SceneState } from '../state'
import { wrapAngle } from '../util/math'
import { ABOARD } from './foot'

export interface Squad {
  /** a squad has been formed (with nobody else in it, his wingmen are his squad) */
  on: boolean
  /** the other pilots in it: their ships' ids here, and their callsigns */
  mates: { id: number; callsign: string }[]
  /** 0..1: how far into a slipstream he is */
  slip: number
}

export const createSquad = (): Squad => ({ on: false, mates: [], slip: 0 })

/** whether the player is in tight formation with a squad mate or a wingman now */
export function inFormation(scene: SceneState) {
  const sq = scene.squad
  if (!sq.on || scene.foot.stage !== ABOARD) return false
  const lead = scene.jets[0]
  if (lead.away) return false
  const near = (x: number, y: number, z: number, yaw: number) =>
    Math.hypot(x - lead.x, y - lead.y) < SQUAD.reach &&
    Math.abs(z - lead.z) < SQUAD.reach &&
    Math.abs(wrapAngle(yaw - lead.yaw)) < SQUAD.angle
  for (let i = 1; i < scene.jets.length; i++) {
    const j = scene.jets[i]
    if (!j.away && near(j.x, j.y, j.z, j.yaw)) return true
  }
  for (const m of sq.mates) {
    const s = scene.ships.find((x) => x.id === m.id)
    if (s && !s.out && near(s.jet.x, s.jet.y, s.jet.z, s.jet.yaw)) return true
  }
  return false
}

/** the slipstream comes and goes */
export function stepSquad(scene: SceneState, dt: number) {
  const sq = scene.squad
  if (!sq.on) {
    sq.slip = 0
    return
  }
  const goal = inFormation(scene) ? 1 : 0
  const k = SQUAD.ease * dt
  sq.slip = goal > sq.slip ? Math.min(goal, sq.slip + k) : Math.max(goal, sq.slip - k)
}

/** top speed in the slipstream, as a share of the usual */
export const slipOf = (scene: SceneState) => (scene.squad.on ? 1 + (SQUAD.slip - 1) * scene.squad.slip : 1)
