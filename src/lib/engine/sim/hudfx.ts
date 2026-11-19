// What the HUD shows of the player's ship a moment behind the truth, so a change is seen happening: the
// hull and shield as last drawn, easing down to where they are (the part just lost shows pale, draining
// away) and up to where they are again; what the land prompt said, and since when (it comes in when it
// changes). Stepped after the fight, from the scene's own clock: nothing here changes what happens.

import type { SceneState } from '../state'
import { ownFighter } from './combat'
import { ABOARD } from './foot'

export interface HudFx {
  /** the hull and shield as the HUD last showed them, 0..1 */
  hull: number
  shield: number
  /** the prompt under the middle, and when it began to say so (scene time) */
  prompt: string
  promptAt: number
}

export function createHudFx(): HudFx {
  return { hull: 1, shield: 1, prompt: '', promptAt: -10 }
}

/** how fast the pale part drains, a share of the bar a second; and how long it waits first */
const DRAIN = 0.9
const HOLD = 0.35

export function stepHudFx(scene: SceneState, dt: number) {
  const fx = scene.hudFx
  const own = ownFighter(scene)
  if (own) {
    const hull = Math.max(0, Math.min(1, own.hull / own.stats.hull))
    const shield = Math.max(0, Math.min(1, own.shield / Math.max(1, own.stats.shield)))
    // (down: a moment's pause after the hit, then it drains; up: at once, the bar itself fills)
    fx.hull = hull >= fx.hull ? hull : scene.time - own.hullAt < HOLD ? fx.hull : Math.max(hull, fx.hull - DRAIN * dt)
    fx.shield = shield >= fx.shield ? shield : scene.time - own.shieldAt < HOLD ? fx.shield : Math.max(shield, fx.shield - DRAIN * dt)
  }
  const prompt =
    scene.foot.stage !== ABOARD ? scene.foot.prompt : scene.zone.kind === 'space' ? scene.space.prompt : scene.loop.landing.prompt
  if (prompt !== fx.prompt) {
    fx.prompt = prompt
    fx.promptAt = scene.time
  }
}
