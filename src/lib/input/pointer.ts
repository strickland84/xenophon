// The mouse on the scene. It steers by where it is; its left button fires and its right button the secondary weapon, for
// as long as they are held; its wheel moves the throttle. (The game is for a desktop with a mouse and keyboard, James,
// 2026-11-19: the fingers that steered and the stick a thumb held on foot are gone.)

import type { Held, Press } from './actions'
import { nothingHeld } from './actions'

export interface PointerHandlers {
  /** a point on the page (client px) → the same point in the picture (frame px) */
  toFrame(clientX: number, clientY: number): [number, number]
  /** the mouse is at (x, y), frame px */
  steer(x: number, y: number): void
  /** nothing is steering any more */
  letGo(): void
  /** the mouse's buttons changed */
  onChange(): void
  /** something pressed once (kept for the page's own use) */
  onPress(action: Press): void
  /** a mouse button came down */
  onDown(e: PointerEvent): void
  /** the mouse's wheel turned, in notches (up, away from the player, is positive) */
  onWheel?(notches: number): void
}

export interface PointerInput {
  /** what the mouse's buttons are holding down */
  readonly held: Held
  dispose(): void
}

export function createPointerInput(el: HTMLElement, handlers: PointerHandlers): PointerInput {
  let fire = false
  let secondary = false

  const buttons = (e: PointerEvent) => {
    const nowFire = (e.buttons & 1) !== 0
    const nowSecondary = (e.buttons & 2) !== 0
    if (nowFire === fire && nowSecondary === secondary) return
    fire = nowFire
    secondary = nowSecondary
    handlers.onChange()
  }

  const onMove = (e: PointerEvent) => {
    buttons(e)
    handlers.steer(...handlers.toFrame(e.clientX, e.clientY))
  }
  const onDown = (e: PointerEvent) => {
    // (a press on one of the page's buttons over the scene is the button's, not the guns'. Svelte hands a button its press
    // after this has seen it, so the button cannot keep it from here itself)
    if ((e.target as Element | null)?.closest?.('button, a, input, textarea, select, [role="dialog"]')) return
    buttons(e)
    handlers.steer(...handlers.toFrame(e.clientX, e.clientY))
    handlers.onDown(e)
  }
  const onUp = (e: PointerEvent) => buttons(e)
  const onGone = () => {
    if (fire || secondary) {
      fire = secondary = false
      handlers.onChange()
    }
    handlers.letGo()
  }
  // the right button is the secondary weapon, not the browser's menu
  const onMenu = (e: Event) => e.preventDefault()
  // the wheel: a notch of a mouse's is about 100 px (a touchpad sends many small ones, adding up the same), a line 3 px
  const onWheel = (e: WheelEvent) => {
    // (only over the picture itself: a panel over it scrolls as panels do)
    if (!handlers.onWheel || (e.target !== el && !(e.target instanceof HTMLCanvasElement))) return
    e.preventDefault()
    const px = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY
    if (px !== 0) handlers.onWheel(-px / 100)
  }

  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointerleave', onGone)
  el.addEventListener('pointercancel', onGone)
  el.addEventListener('contextmenu', onMenu)
  el.addEventListener('wheel', onWheel, { passive: false })

  return {
    get held() {
      const held = nothingHeld()
      held.fire = fire
      held.secondary = secondary
      return held
    },
    dispose() {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointerleave', onGone)
      el.removeEventListener('pointercancel', onGone)
      el.removeEventListener('contextmenu', onMenu)
      el.removeEventListener('wheel', onWheel)
    },
  }
}
