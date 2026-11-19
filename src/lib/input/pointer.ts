// The mouse and fingers on the scene. The mouse steers by where it is; its left button fires
// and its right button the secondary weapon, for as long as they are held; its wheel moves the throttle. A finger steers
// for as long as it is down (one finger: a second one is for the on-screen buttons), and a
// quick flick of it rolls. On foot a finger is a stick instead: where it comes down is the
// middle, and how far it is dragged from there is the push (far: a run).

import type { Held, Press } from './actions'
import { nothingHeld } from './actions'

/** a finger down for less than this many milliseconds that travels at least SWIPE_DIST CSS px is a flick */
const SWIPE_TIME = 300
const SWIPE_DIST = 36
/** CSS px a finger is dragged for a full push of the stick (on foot), and the share of that which runs */
const STICK_REACH = 40
const STICK_RUN = 0.92

export interface PointerHandlers {
  /** a point on the page (client px) → the same point in the picture (frame px) */
  toFrame(clientX: number, clientY: number): [number, number]
  /** fingers are handled as fingers (false: the page asked for no touch controls, so a finger acts as a mouse) */
  fingers(): boolean
  /** the mouse or the steering finger is at (x, y), frame px */
  steer(x: number, y: number): void
  /** nothing is steering any more */
  letGo(): void
  /** the mouse's buttons changed */
  onChange(): void
  /** a flick: roll */
  onPress(action: Press): void
  /** a mouse button or a finger came down */
  onDown(e: PointerEvent, finger: boolean): void
  /** true while a finger is a stick (on foot) rather than a pointer to steer by */
  stick?(): boolean
  /** the mouse's wheel turned, in notches (up, away from the player, is positive) */
  onWheel?(notches: number): void
  /** the stick, to be drawn: where it is (client px) and how far it is pushed (client px), or null when no finger holds it */
  onStick?(at: { x: number; y: number; dx: number; dy: number } | null): void
}

export interface PointerInput {
  /** what the mouse's buttons are holding down */
  readonly held: Held
  /** where a finger steering (not a stick) is held down, frame px; null when none is: a finger held still still steers */
  readonly finger: [number, number] | null
  dispose(): void
}

export function createPointerInput(el: HTMLElement, handlers: PointerHandlers): PointerInput {
  let fire = false
  let secondary = false
  // the finger that is steering: which one, and when and where it came down; and as a stick, how far it is dragged
  let steer: { id: number; t: number; x: number; y: number; stick: boolean; dx: number; dy: number } | null = null
  // where the steering finger is now, frame px
  let fingerAt: [number, number] | null = null

  const byFinger = (e: PointerEvent) => e.pointerType === 'touch' && handlers.fingers()
  const buttons = (e: PointerEvent) => {
    const nowFire = (e.buttons & 1) !== 0
    const nowSecondary = (e.buttons & 2) !== 0
    if (nowFire === fire && nowSecondary === secondary) return
    fire = nowFire
    secondary = nowSecondary
    handlers.onChange()
  }

  const onMove = (e: PointerEvent) => {
    if (byFinger(e)) {
      if (!steer || steer.id !== e.pointerId) return
      if (steer.stick) {
        steer.dx = e.clientX - steer.x
        steer.dy = e.clientY - steer.y
        handlers.onStick?.({ x: steer.x, y: steer.y, dx: steer.dx, dy: steer.dy })
        handlers.onChange()
        return
      }
    } else buttons(e)
    const at = handlers.toFrame(e.clientX, e.clientY)
    if (byFinger(e)) fingerAt = at
    handlers.steer(...at)
  }
  const onDown = (e: PointerEvent) => {
    // (a press on one of the page's buttons over the scene is the button's: not a finger to steer by, nor the guns.
    // Svelte hands a button its press after this has seen it, so the button cannot keep it from here itself)
    if ((e.target as Element | null)?.closest?.('button, a, input, textarea, select, [role="dialog"]')) return
    const finger = byFinger(e)
    if (finger) {
      if (steer) return // one finger steers; a second one is for the buttons
      steer = { id: e.pointerId, t: performance.now(), x: e.clientX, y: e.clientY, stick: !!handlers.stick?.(), dx: 0, dy: 0 }
      if (steer.stick) {
        handlers.onStick?.({ x: steer.x, y: steer.y, dx: 0, dy: 0 })
        handlers.onDown(e, finger)
        return
      }
    } else buttons(e)
    const at = handlers.toFrame(e.clientX, e.clientY)
    if (finger) fingerAt = at
    handlers.steer(...at)
    handlers.onDown(e, finger)
  }
  const onUp = (e: PointerEvent) => {
    if (!byFinger(e)) return buttons(e)
    if (!steer || steer.id !== e.pointerId) return
    const flick = performance.now() - steer.t < SWIPE_TIME && Math.hypot(e.clientX - steer.x, e.clientY - steer.y) >= SWIPE_DIST
    const wasStick = steer.stick
    steer = null
    fingerAt = null
    if (flick) handlers.onPress('roll')
    if (wasStick) {
      handlers.onStick?.(null)
      handlers.onChange()
      return
    }
    handlers.letGo()
  }
  const onGone = (e: PointerEvent) => {
    if (byFinger(e)) {
      if (!steer || steer.id !== e.pointerId) return
      const wasStick = steer.stick
      steer = null
      fingerAt = null
      if (wasStick) {
        handlers.onStick?.(null)
        handlers.onChange()
        return
      }
    } else if (fire || secondary) {
      fire = secondary = false
      handlers.onChange()
    }
    handlers.letGo()
  }
  // the right button is the secondary weapon, not the browser's menu (and on a phone a long press would get in the way of steering)
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
      if (steer?.stick) {
        // the stick: across and up the screen, as far as it is dragged; pushed all the way, he runs
        const n = Math.hypot(steer.dx, steer.dy) / STICK_REACH
        // (a little play in the middle, so a resting thumb stands still)
        const k = n < 0.12 ? 0 : n > 1 ? 1 / n : 1
        held.turn = (steer.dx / STICK_REACH) * k
        held.climb = (-steer.dy / STICK_REACH) * k
        held.boost = n >= STICK_RUN ? 1 : 0
      }
      return held
    },
    get finger() {
      return steer && !steer.stick ? fingerAt : null
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
