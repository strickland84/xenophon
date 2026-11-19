// Everything the player can do, by name, whatever they do it with. Every device (the keys,
// the mouse, fingers and the on-screen buttons, a game controller) turns what it senses
// into these, following the controls table in the plan (section 16). The component adds the
// devices up and hands the result to the scene, or acts on it itself.
//
//   held:    steering, boost, fire, secondary            → Scene.setControls
//   pressed: roll, use (land / board), view, cruise, power, seat, target → Scene.act
//            map, inventory, chat, menu, the next ship, all stop → the page

import type { HeldControls, SceneAction } from '../engine'

/** what a device is holding down (the same shape the scene takes) */
export type Held = HeldControls

/** things pressed once that the page deals with: the screens still to come, and the next ship */
export type PageAction = 'map' | 'inventory' | 'chat' | 'menu' | 'nextShip' | 'clip' | 'stop'

/** anything pressed once */
export type Press = SceneAction | PageAction

/** the actions the scene deals with; the rest are the page's */
export const isSceneAction = (action: Press): action is SceneAction =>
  action === 'roll' ||
  action === 'use' ||
  action === 'view' ||
  action === 'cruise' ||
  action === 'power' ||
  action === 'seat' ||
  action === 'target'

export const nothingHeld = (): Held => ({
  turn: 0,
  climb: 0,
  throttle: 0,
  boost: 0,
  fire: false,
  secondary: false,
  land: false,
  mine: false,
})

/** several devices at once: steering adds up, the thrusters open as far as the furthest asks, and a button is down if it is down on any */
export function combine(all: Held[]): Held {
  const sum = nothingHeld()
  for (const h of all) {
    sum.turn += h.turn
    sum.climb += h.climb
    // (a device that does not say how it walks walks as it climbs: a stick pushed forward)
    sum.walk = (sum.walk ?? 0) + (h.walk ?? h.climb)
    sum.throttle = (sum.throttle ?? 0) + (h.throttle ?? 0)
    sum.boost = Math.max(sum.boost, h.boost)
    sum.fire ||= h.fire
    sum.secondary ||= h.secondary
    sum.land ||= !!h.land
    sum.mine ||= !!h.mine
    sum.target ||= !!h.target
  }
  sum.turn = Math.max(-1, Math.min(1, sum.turn))
  sum.climb = Math.max(-1, Math.min(1, sum.climb))
  sum.walk = Math.max(-1, Math.min(1, sum.walk ?? 0))
  sum.throttle = Math.max(-1, Math.min(1, sum.throttle ?? 0))
  return sum
}
