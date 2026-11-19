// A game controller (a PS5 pad, say), laid out as the plan's controls table has it unless the
// player binds it otherwise (bindings.ts): the left stick steers, R2 fires, Square the secondary
// weapon, L2 opens the thrusters as far as it is squeezed, Cross rolls, Circle lands, boards or
// uses, Triangle changes the view, the touchpad (or Select) the map, D-pad up the inventory, D-pad
// right chat, Options the menu. A controller sends no events when it moves: it is read every frame.

import type { Held, Press } from './actions'
import { nothingHeld } from './actions'
import { DEFAULT_BINDINGS } from './bindings'
import type { Bindable, Bindings } from './bindings'

/** a PlayStation controller, or some other one: they name their buttons differently */
export type PadKind = 'ps' | 'pad'

const padKind = (id: string): PadKind => (/054c|dualsense|dualshock|playstation/i.test(id) ? 'ps' : 'pad')

/** the stick does nothing in its middle 16 %, then runs smoothly up to 1 */
const DEAD = 0.16
const dead = (v: number) => (Math.abs(v) < DEAD ? 0 : (Math.sign(v) * (Math.abs(v) - DEAD)) / (1 - DEAD))
/** a trigger counts as pulled past this */
const PULLED = 0.3

/** the actions pressed once on a controller */
const PRESSED: Press[] = ['roll', 'use', 'view', 'cruise', 'power', 'seat', 'target', 'map', 'inventory', 'chat', 'menu']

/** the parts of a Gamepad that are read */
export interface PadState {
  axes: readonly number[]
  buttons: readonly { pressed: boolean; value: number }[]
}

/** what a controller is doing: what it holds down, and which of the buttons that work once are down (as bound: bindings.ts) */
export function readPad(pad: PadState, bindings: Bindings = DEFAULT_BINDINGS): { held: Held; down: Set<Press> } {
  const button = (i: number) => {
    const b = pad.buttons[i]
    return b ? b.value || (b.pressed ? 1 : 0) : 0
  }
  /** how far the action's buttons are pressed (the furthest of them) */
  const most = (action: Bindable) => Math.max(0, ...(bindings.pad[action] ?? []).map(button))
  const held = nothingHeld()
  // stick up counts as the Up key
  held.turn = dead(pad.axes[0] || 0)
  held.climb = -dead(pad.axes[1] || 0) || 0 // (0, not −0, at rest)
  // (the right stick, pushed up or pulled back, moves the throttle)
  held.throttle = -dead(pad.axes[3] || 0) || 0
  const boost = most('boost')
  held.boost = boost < 0.06 ? 0 : boost
  held.fire = most('fire') > PULLED
  held.secondary = most('secondary') > 0.5
  held.land = most('use') > 0.5
  held.mine = most('mine') > 0.5
  held.target = most('target') > 0.5
  const down = new Set<Press>()
  for (const action of PRESSED) if (most(action) > 0.5) down.add(action)
  return { held, down }
}

export interface GamepadInput {
  /** what the controller is holding down */
  readonly held: Held
  /** true while the stick, a trigger or a button is being held */
  readonly busy: boolean
  /** reads the controller; call it once a frame */
  poll(): void
  /** the buttons are bound otherwise now */
  rebind(bindings: Bindings): void
  dispose(): void
}

export interface GamepadHandlers {
  /** a controller was plugged in or used: it is flying the jet now */
  onActive(kind: PadKind): void
  /** the controller was unplugged */
  onGone(): void
  /** what it holds down changed (also called every frame while the stick is held) */
  onChange(): void
  /** a button that works once was pressed */
  onPress(action: Press): void
  /** the bindings to start with (the defaults if none) */
  bindings?: Bindings
}

export function createGamepadInput(handlers: GamepadHandlers): GamepadInput {
  let bindings = handlers.bindings ?? DEFAULT_BINDINGS
  let held = nothingHeld()
  let wasDown = new Set<Press>()
  let forbidden = false

  /** the controller to read: a connected one, with the standard layout if there is a choice */
  const pick = () => {
    let found: Gamepad | null = null
    for (const g of navigator.getGamepads()) {
      if (g && g.connected && (!found || (g.mapping === 'standard' && found.mapping !== 'standard'))) found = g
    }
    return found
  }

  const onConnected = (e: GamepadEvent) => handlers.onActive(padKind(e.gamepad.id))
  const onDisconnected = () => {
    held = nothingHeld()
    wasDown = new Set()
    handlers.onChange()
    handlers.onGone()
  }
  window.addEventListener('gamepadconnected', onConnected)
  window.addEventListener('gamepaddisconnected', onDisconnected)

  const busy = (h: Held) => h.turn !== 0 || h.climb !== 0 || !!h.throttle || h.boost !== 0 || h.fire || h.secondary

  return {
    get held() {
      return held
    },
    get busy() {
      return busy(held)
    },

    poll() {
      if (forbidden || !navigator.getGamepads) return
      let pad: Gamepad | null
      try {
        pad = pick()
      } catch {
        forbidden = true // controllers are not allowed here (a page embedded without leave to use them)
        return
      }
      const now = pad ? readPad(pad, bindings) : { held: nothingHeld(), down: new Set<Press>() }
      if (pad && (busy(now.held) || now.down.size > 0)) handlers.onActive(padKind(pad.id))
      for (const action of now.down) if (!wasDown.has(action)) handlers.onPress(action)
      const changed =
        now.held.turn !== held.turn ||
        now.held.climb !== held.climb ||
        now.held.throttle !== held.throttle ||
        now.held.boost !== held.boost ||
        now.held.fire !== held.fire ||
        now.held.secondary !== held.secondary ||
        now.held.land !== held.land ||
        now.held.mine !== held.mine ||
        now.held.target !== held.target
      held = now.held
      wasDown = now.down
      // (sent every frame while the stick is held, so a nudge of the mouse cannot take the jet away)
      if (changed || held.turn !== 0 || held.climb !== 0 || !!held.throttle) handlers.onChange()
    },

    rebind(next) {
      bindings = next
    },

    dispose() {
      window.removeEventListener('gamepadconnected', onConnected)
      window.removeEventListener('gamepaddisconnected', onDisconnected)
    },
  }
}
