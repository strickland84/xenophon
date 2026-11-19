// The keyboard: by default A and D (or the arrows) turn, W and S (or the arrows) pitch the nose up and down (a stick's pull
// and push: bindings.ts) and walk forward and back, E and Q move the throttle, Shift opens the thrusters, Space rolls, F lands,
// boards or uses, V changes the view, M the map, Tab the inventory, Enter chat, Escape the menu,
// and H the hangar; the player can bind them otherwise (bindings.ts, the settings). Keys are known
// by KeyboardEvent.code, so they sit in the same place on any layout. (The mouse's buttons fire:
// see pointer.ts.)

import type { Held, Press } from './actions'
import { nothingHeld } from './actions'
import { DEFAULT_BINDINGS, keyMaps } from './bindings'
import type { Bindings, HoldKey } from './bindings'

const DEFAULT_MAPS = keyMaps(DEFAULT_BINDINGS)
/** keys that work for as long as they are held (the defaults) */
export const HOLD_KEYS: Record<string, HoldKey> = DEFAULT_MAPS.hold
/** keys pressed once (the defaults) */
export const PRESS_KEYS: Record<string, Press> = DEFAULT_MAPS.press

/** keys whose own work in the browser (scrolling, moving the focus) would get in the way */
const KEEP = new Set(['Space', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

export interface KeyboardInput {
  /** what the keys are holding down */
  readonly held: Held
  /** the keys are bound otherwise now */
  rebind(bindings: Bindings): void
  dispose(): void
}

export interface KeyboardHandlers {
  /** true for a key press that belongs to something else on the page (a text box, a button) */
  ignore(e: KeyboardEvent): boolean
  /** any key that is ours was pressed */
  onActivity(): void
  /** the keys held down changed */
  onChange(): void
  /** a key that works once was pressed */
  onPress(action: Press): void
  /** the bindings to start with (the defaults if none) */
  bindings?: Bindings
}

export function createKeyboardInput(handlers: KeyboardHandlers): KeyboardInput {
  const down = new Set<string>()
  let maps = handlers.bindings ? keyMaps(handlers.bindings) : DEFAULT_MAPS

  const onKeyDown = (e: KeyboardEvent) => {
    if (handlers.ignore(e) || e.metaKey || e.ctrlKey || e.altKey) return
    const press = maps.press[e.code]
    const hold = maps.hold[e.code]
    if (!press && !hold) return
    handlers.onActivity()
    if (KEEP.has(e.code)) e.preventDefault()
    // (Action is both: pressed once, and held to land or take off)
    if (press && !e.repeat) handlers.onPress(press)
    if (hold && !down.has(e.code)) {
      down.add(e.code)
      handlers.onChange()
    }
  }
  const onKeyUp = (e: KeyboardEvent) => {
    if (down.delete(e.code)) handlers.onChange()
  }
  // the window lost focus: every key has been let go
  const onBlur = () => {
    down.clear()
    handlers.onChange()
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('blur', onBlur)

  const count = (key: HoldKey) => {
    let n = 0
    for (const code of down) if (maps.hold[code] === key) n++
    return n
  }

  return {
    get held() {
      const held = nothingHeld()
      held.turn = Math.sign(count('right') - count('left'))
      held.climb = Math.sign(count('up') - count('down'))
      // (the pull keys walk forward: W pitches the nose up, and walks on)
      held.walk = -held.climb
      held.throttle = Math.sign(count('faster') - count('slower'))
      held.boost = count('boost') > 0 ? 1 : 0
      held.land = count('land') > 0
      held.mine = count('mine') > 0
      held.target = count('target') > 0
      held.fire = count('fire') > 0
      held.secondary = count('secondary') > 0
      return held
    },
    rebind(bindings) {
      // (keys held stay held: what they do is read from the new maps)
      maps = keyMaps(bindings)
      handlers.onChange()
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
    },
  }
}
