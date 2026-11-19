// Which key and which controller button does what: the plan's controls table (section 16) as the
// defaults, changed by the player in the settings and kept in his save. Keys are known by
// KeyboardEvent.code, so a binding stays in the same place on any layout; controller buttons by
// their index in the standard layout. Steering on a controller is always the left stick, and the
// mouse's buttons always fire (left) and fire a missile (right).
//
// Nothing here touches the page: keyboard.ts and gamepad.ts read their maps from here, the help
// line and the first sortie's prompts name the keys from here, and the tests run it in Node.

import type { Press } from './actions'

/** what can be bound: the four ways of steering, the held controls, and everything pressed once */
export type Bindable =
  | 'faster'
  | 'slower'
  | 'stop'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'boost'
  | 'fire'
  | 'secondary'
  | 'roll'
  | 'use'
  | 'mine'
  | 'view'
  | 'cruise'
  | 'power'
  | 'seat'
  | 'target'
  | 'map'
  | 'inventory'
  | 'chat'
  | 'menu'
  | 'nextShip'
  | 'clip'

export const BINDABLE: Bindable[] = [
  'faster',
  'slower',
  'stop',
  'up',
  'down',
  'left',
  'right',
  'boost',
  'fire',
  'secondary',
  'roll',
  'use',
  'mine',
  'view',
  'cruise',
  'power',
  'seat',
  'target',
  'map',
  'inventory',
  'chat',
  'menu',
  'nextShip',
  'clip',
]

/** what each does, in the settings' words */
export const BINDABLE_WORDS: Record<Bindable, string> = {
  faster: 'Throttle up (walk on foot)',
  slower: 'Throttle down (walk back)',
  stop: 'All stop: the throttle shut',
  up: 'Pitch up: climb (walk on foot)',
  down: 'Pitch down: dive (walk back)',
  left: 'Turn left',
  right: 'Turn right',
  boost: 'Thrusters (run on foot: Shift)',
  fire: 'Guns (sidearm on foot)',
  secondary: 'Missile (flare on foot)',
  roll: 'Roll (jump on foot)',
  use: 'Action: land, mine, use',
  view: 'View (beacon on foot)',
  cruise: 'Cruise drive (in space)',
  power: 'Power on and off (landed or docked)',
  mine: 'Mining laser (the cutter on foot)',
  seat: 'Get up from the seat in flight, and sit down',
  target: 'Target what you aim at, then the next (hold: let go)',
  map: 'Maps',
  inventory: 'Hold and vault',
  chat: 'Chat',
  menu: 'Menu',
  nextShip: 'Hangar',
  clip: 'Keep a clip of the last seconds, to share',
}

/** the controller's actions (steering is the stick) */
export const PAD_BINDABLE: Bindable[] = [
  'boost',
  'fire',
  'secondary',
  'roll',
  'use',
  'mine',
  'view',
  'cruise',
  'power',
  'seat',
  'target',
  'map',
  'inventory',
  'chat',
  'menu',
]

export interface Bindings {
  /** each action's keys (KeyboardEvent.code), the first named in the help */
  keys: Record<Bindable, string[]>
  /** each action's controller buttons (standard layout), for the actions a controller has */
  pad: Partial<Record<Bindable, number[]>>
}

/** the plan's controls table: Elite Dangerous's flight keys (James, 2026-11-19: "build it to mirror elite dangerous control
 * scheme"). The mouse pitches and turns as a stick; W and S the throttle, X all stop, the wheel too; A and D turn; Tab the
 * boost (and Shift, which runs on foot, as Odyssey's does); J the cruise drive, as Elite's frame shift drive; the arrows
 * pitch and turn from the keys. The pitch keys are named by what they do, as Elite's are: Up climbs and Down dives whatever
 * the setting, which turns over only the mouse and a stick. (Space stays the roll and V the view: the plan's decision 2) */
export const DEFAULT_BINDINGS: Bindings = {
  keys: {
    faster: ['KeyW'],
    slower: ['KeyS'],
    stop: ['KeyX'],
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    boost: ['Tab', 'ShiftLeft'],
    // (the mouse's buttons fire too: these are for playing from the keys alone)
    fire: ['KeyK'],
    secondary: ['KeyL'],
    roll: ['Space'],
    use: ['KeyF'],
    view: ['KeyV'],
    cruise: ['KeyJ'],
    // (the ship's power, since James asked for ships powered off on the ground: 2026-11-18)
    power: ['KeyP'],
    // (mining its own, since James's first flights: on F it took the place of landing wherever ore was in reach)
    mine: ['KeyR'],
    // (up out of the seat in flight to walk the ship, and back: James, 2026-11-18)
    seat: ['KeyG'],
    // (the target key: the thing in view nearest where the ship aims, then the next; held, let go. James, 2026-11-19)
    target: ['KeyT'],
    map: ['KeyM'],
    inventory: ['KeyI'],
    chat: ['Enter', 'NumpadEnter'],
    menu: ['Escape'],
    nextShip: ['KeyH'],
    // (the last seconds of play kept as a short film to send to a friend, with a link onto his wing: James, 2026-11-19)
    clip: ['F9'],
  },
  // (the standard layout: 0 Cross/A, 1 Circle/B, 2 Square/X, 3 Triangle/Y, 4 L1/LB, 5 R1/RB, 6 L2, 7 R2, 8 Select, 9 Options, 10 L3, 12 up, 13 down, 15 right, 17 touchpad)
  pad: {
    boost: [6],
    fire: [7],
    secondary: [2],
    roll: [0],
    use: [1],
    view: [3],
    cruise: [5],
    power: [13],
    mine: [4],
    seat: [10],
    target: [14],
    map: [17, 8],
    inventory: [12],
    chat: [15],
    menu: [9],
  },
}

/** the keys as the game gave them before Elite's flight layout (a save that kept them, as given, takes the new ones) */
const BEFORE_ELITE: Record<Bindable, string[]> = {
  ...DEFAULT_BINDINGS.keys,
  faster: ['KeyE'],
  slower: ['KeyQ'],
  stop: [],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  boost: ['ShiftLeft', 'ShiftRight'],
  fire: ['KeyJ'],
  secondary: ['KeyK'],
  cruise: ['KeyC'],
  inventory: ['Tab'],
  clip: ['KeyX'],
}

/** the most keys (or buttons) one action keeps */
export const BIND_MOST = 2

/** a copy of the defaults */
export const defaultBindings = (): Bindings => ({
  keys: Object.fromEntries(BINDABLE.map((b) => [b, [...DEFAULT_BINDINGS.keys[b]]])) as Record<Bindable, string[]>,
  pad: Object.fromEntries(PAD_BINDABLE.map((b) => [b, [...(DEFAULT_BINDINGS.pad[b] ?? [])]])),
})

/** bindings read from a save (anything missing or wrong: the default's) */
export function readBindings(raw: unknown): Bindings {
  const out = defaultBindings()
  if (!raw || typeof raw !== 'object') return out
  const r = raw as { keys?: Record<string, unknown>; pad?: Record<string, unknown> }
  // (kept before the throttle had keys: W and S were Up and Down then, and are the throttle's now; climbing and diving
  // take their new keys, and none of the four keeps a key the player gave something else)
  const old = !!r.keys && !('faster' in r.keys)
  for (const b of BINDABLE) {
    if (old && (b === 'up' || b === 'down')) continue
    const k = r.keys?.[b]
    if (Array.isArray(k))
      out.keys[b] = k.filter((c): c is string => typeof c === 'string' && /^[A-Za-z0-9]{1,24}$/.test(c)).slice(0, BIND_MOST)
  }
  if (old)
    for (const b of ['faster', 'slower', 'up', 'down'] as const)
      out.keys[b] = out.keys[b].filter((c) => !BINDABLE.some((a) => a !== b && out.keys[a].includes(c)))
  // (kept with the layout of 2026-11-18, the throttle on W and S and the pitch on Q, E and the arrows, as given: the new
  // one, W and S the pitch and E and Q the throttle; a layout the player changed is his)
  const was = (b: Bindable, keys: string[]) => out.keys[b].join() === keys.join()
  if (was('faster', ['KeyW']) && was('slower', ['KeyS']) && was('up', ['KeyQ', 'ArrowUp']) && was('down', ['KeyE', 'ArrowDown']))
    for (const b of ['faster', 'slower', 'up', 'down'] as const) out.keys[b] = [...DEFAULT_BINDINGS.keys[b]]
  // (kept while Up and Down were a stick's push and pull, S and W, as given: the pitch keys named by what they do now,
  // so W, which climbed, is Up; James, 2026-11-19, "make UP CLIMBS the default")
  if (was('up', ['KeyS', 'ArrowDown']) && was('down', ['KeyW', 'ArrowUp']))
    for (const b of ['up', 'down'] as const) out.keys[b] = [...DEFAULT_BINDINGS.keys[b]]
  // (kept before the power switch: its key, unless the player gave it something else)
  if (r.keys && !('power' in r.keys))
    out.keys.power = out.keys.power.filter((c) => !BINDABLE.some((a) => a !== 'power' && out.keys[a].includes(c)))
  // (and before mining had a key of its own)
  if (r.keys && !('mine' in r.keys))
    out.keys.mine = out.keys.mine.filter((c) => !BINDABLE.some((a) => a !== 'mine' && out.keys[a].includes(c)))
  // (and before the seat key)
  if (r.keys && !('seat' in r.keys))
    out.keys.seat = out.keys.seat.filter((c) => !BINDABLE.some((a) => a !== 'seat' && out.keys[a].includes(c)))
  // (and before clips)
  if (r.keys && !('clip' in r.keys))
    out.keys.clip = out.keys.clip.filter((c) => !BINDABLE.some((a) => a !== 'clip' && out.keys[a].includes(c)))
  // (kept with the keys before Elite's flight layout, as given: each action left as the game had it takes the new keys, and
  // gives up any a key the player chose for another action still holds; James, 2026-11-19, "I dont want legacy controls")
  if (r.keys) {
    const moved = BINDABLE.filter(
      (a) => out.keys[a].join() === BEFORE_ELITE[a].join() && BEFORE_ELITE[a].join() !== DEFAULT_BINDINGS.keys[a].join(),
    )
    for (const a of moved) out.keys[a] = [...DEFAULT_BINDINGS.keys[a]]
    for (const a of moved)
      out.keys[a] = out.keys[a].filter((c) => !BINDABLE.some((o) => o !== a && !moved.includes(o) && out.keys[o].includes(c)))
  }
  // (and before All stop had a key)
  if (r.keys && !('stop' in r.keys))
    out.keys.stop = out.keys.stop.filter((c) => !BINDABLE.some((a) => a !== 'stop' && out.keys[a].includes(c)))
  for (const b of PAD_BINDABLE) {
    const p = r.pad?.[b]
    if (Array.isArray(p)) out.pad[b] = p.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < 24).slice(0, BIND_MOST)
  }
  // (and before the target key, its key and button, unless the player gave them to something else)
  if (r.keys && !('target' in r.keys))
    out.keys.target = out.keys.target.filter((c) => !BINDABLE.some((a) => a !== 'target' && out.keys[a].includes(c)))
  if (r.pad && !('target' in r.pad))
    out.pad.target = (out.pad.target ?? []).filter((n) => !PAD_BINDABLE.some((a) => a !== 'target' && (out.pad[a] ?? []).includes(n)))
  // (a controller's seat button, unless the player gave it something else)
  if (r.pad && !('seat' in r.pad))
    out.pad.seat = (out.pad.seat ?? []).filter((n) => !PAD_BINDABLE.some((a) => a !== 'seat' && (out.pad[a] ?? []).includes(n)))
  return out
}

/** a key given to an action: it is that action's first key now, and taken from any other action that had it */
export function bindKey(b: Bindings, action: Bindable, code: string): Bindings {
  const keys = { ...b.keys }
  for (const a of BINDABLE) keys[a] = keys[a].filter((c) => c !== code)
  keys[action] = [code, ...keys[action]].slice(0, BIND_MOST)
  return { keys, pad: { ...b.pad } }
}

/** a controller button given to an action, as bindKey */
export function bindButton(b: Bindings, action: Bindable, button: number): Bindings {
  const pad = { ...b.pad }
  for (const a of PAD_BINDABLE) pad[a] = (pad[a] ?? []).filter((n) => n !== button)
  pad[action] = [button, ...(pad[action] ?? [])].slice(0, BIND_MOST)
  return { keys: { ...b.keys }, pad }
}

/** the action a key or a button is bound to, if any (to say what a new binding takes it from) */
export const keyOwner = (b: Bindings, code: string) => BINDABLE.find((a) => b.keys[a].includes(code)) ?? null
export const buttonOwner = (b: Bindings, button: number) => PAD_BINDABLE.find((a) => (b.pad[a] ?? []).includes(button)) ?? null

/** what a held key does */
export type HoldKey = 'left' | 'right' | 'up' | 'down' | 'faster' | 'slower' | 'boost' | 'land' | 'mine' | 'fire' | 'secondary' | 'target'

/** the keyboard's maps from bindings: keys held (steering, thrusters, Land, and the guns if a key is given them) and keys pressed once */
export function keyMaps(b: Bindings): { hold: Record<string, HoldKey>; press: Record<string, Press> } {
  const hold: Record<string, HoldKey> = {}
  const press: Record<string, Press> = {}
  for (const a of ['faster', 'slower', 'up', 'down', 'left', 'right', 'boost', 'mine', 'fire', 'secondary', 'target'] as const)
    for (const c of b.keys[a]) hold[c] = a
  // (Action is both: pressed once, and held to land or take off; so is the target key, held a moment to let go)
  for (const c of b.keys.use) hold[c] = 'land'
  for (const a of [
    'stop',
    'roll',
    'use',
    'view',
    'cruise',
    'power',
    'seat',
    'target',
    'map',
    'inventory',
    'chat',
    'menu',
    'nextShip',
    'clip',
  ] as const)
    for (const c of b.keys[a]) press[c] = a
  return { hold, press }
}

/** a key's name as the help line and the prompts show it (in capitals: what the pixel font draws) */
export function keyName(code: string): string {
  const named: Record<string, string> = {
    ArrowUp: 'UP',
    ArrowDown: 'DOWN',
    ArrowLeft: 'LEFT',
    ArrowRight: 'RIGHT',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'R SHIFT',
    ControlLeft: 'CTRL',
    ControlRight: 'R CTRL',
    AltLeft: 'ALT',
    AltRight: 'R ALT',
    Space: 'SPACE',
    Enter: 'ENTER',
    NumpadEnter: 'ENTER',
    Escape: 'ESC',
    Tab: 'TAB',
    Backspace: 'BACKSPACE',
    CapsLock: 'CAPS',
    Backquote: '`',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
  }
  if (named[code]) return named[code]
  const m = /^(?:Key|Digit)(.+)$/.exec(code) ?? /^Numpad(.+)$/.exec(code)
  return (m ? m[1] : code).toUpperCase()
}

/** the first key bound to an action, by name ('' none) */
export const firstKey = (b: Bindings, action: Bindable) => (b.keys[action][0] ? keyName(b.keys[action][0]) : '')

/** a controller button's name, on a PlayStation pad or another */
export function buttonName(button: number, ps: boolean): string {
  const psNames = [
    '✕',
    '○',
    '□',
    '△',
    'L1',
    'R1',
    'L2',
    'R2',
    'SHARE',
    'OPTIONS',
    'L3',
    'R3',
    'D-PAD UP',
    'D-PAD DOWN',
    'D-PAD LEFT',
    'D-PAD RIGHT',
    'PS',
    'TOUCHPAD',
  ]
  const xNames = [
    'A',
    'B',
    'X',
    'Y',
    'LB',
    'RB',
    'LT',
    'RT',
    'VIEW',
    'MENU',
    'LS',
    'RS',
    'D-PAD UP',
    'D-PAD DOWN',
    'D-PAD LEFT',
    'D-PAD RIGHT',
    'HOME',
    'SELECT',
  ]
  return (ps ? psNames : xNames)[button] ?? `BUTTON ${button}`
}

/** the first button bound to an action, by name ('' none) */
export const firstButton = (b: Bindings, action: Bindable, ps: boolean) => {
  const n = b.pad[action]?.[0]
  return n === undefined ? '' : buttonName(n, ps)
}
