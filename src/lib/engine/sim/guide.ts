// A mark the page puts on the world to say "go here" (the first sortie's guide: a training drone
// to shoot, an outcrop to mine). It is the page's, not the simulation's: nothing in the scene acts
// on it, and no other game hears of it. The HUD draws it (render/hud.ts): brackets round it when it
// is in the frame, an arrow at the frame's edge with its name and distance when it is not.

import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import { inSpace } from './space'
import { wrapDelta } from './loop'
import { groundAt } from '../world/world'

/** a point of the zone (px; `z` its height, by default the ground's) or a ship by its id, and the words over it */
export type GuideMark = { x: number; y: number; z?: number; label: string } | { ship: number; label: string }

/** where the mark is now, as an offset from (fromX, fromY) the shortest way round a world (null: there is none, or its ship is gone) */
export function guidePoint(
  scene: SceneState,
  fromX: number,
  fromY: number,
): { dx: number; dy: number; z: number; label: string; jet: Jet | null } | null {
  const g = scene.guide
  if (!g) return null
  let x: number
  let y: number
  let z: number
  let jet: Jet | null = null
  if ('ship' in g) {
    const s = scene.ships.find((s) => s.id === g.ship)
    if (!s || (s.jet.fighter && !s.jet.fighter.alive)) return null
    jet = s.jet
    x = s.jet.x
    y = s.jet.y
    z = s.jet.z
  } else {
    x = g.x
    y = g.y
    z = g.z ?? groundAt(scene.world, x, y)
  }
  const space = inSpace(scene)
  return { dx: space ? x - fromX : wrapDelta(x - fromX), dy: space ? y - fromY : wrapDelta(y - fromY), z, label: g.label, jet }
}
