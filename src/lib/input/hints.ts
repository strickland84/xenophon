// The line of help: how to fly and fight, worded for whatever is flying the ship, with the keys and
// buttons as the player has bound them (bindings.ts): and, where there are bases and ore, how to
// land, mine, open the hold and climb out into space; in space, the cruise drive, Use (dock, go
// down, jump, skim, mine) and the maps; on foot and inside, walking and Use.

import type { ViewMode } from '../engine'
import { DEFAULT_BINDINGS, firstButton, firstKey } from './bindings'
import type { Bindable, Bindings } from './bindings'

/** what is flying the jet: a pointer and keys, fingers and the on-screen buttons, a PlayStation controller, or some other one */
export type InputKind = 'pointer' | 'touch' | 'ps' | 'pad'

/** the name of what does an action on a device: a key, a controller's button, a touch button */
export function namer(input: InputKind, b: Bindings = DEFAULT_BINDINGS): (a: Bindable) => string {
  if (input === 'ps' || input === 'pad') return (a) => firstButton(b, a, input === 'ps') || '?'
  if (input === 'touch') return (a) => TOUCH_NAMES[a]
  return (a) => firstKey(b, a) || '?'
}

/** the touch screen's buttons for each action (TouchButtons.svelte) */
const TOUCH_NAMES: Record<Bindable, string> = {
  faster: 'THROTTLE',
  slower: 'THROTTLE',
  up: 'DIVE',
  down: 'CLIMB',
  left: 'LEFT',
  right: 'RIGHT',
  boost: 'BOOST',
  fire: 'FIRE',
  secondary: 'MISSILE',
  roll: 'ROLL',
  use: 'ACTION',
  view: 'VIEW',
  cruise: 'CRUISE',
  power: 'POWER',
  seat: 'SEAT',
  target: 'TARGET',
  mine: 'MINE',
  map: 'MAP',
  inventory: 'BAG',
  chat: 'CHAT',
  menu: 'MENU',
  nextShip: 'SHIP',
  clip: 'CLIP',
}

/** the four walking keys (the pitch's, the pull walking forward, and the turns') as one word when they are the usual WASD, or each named */
function steerKeys(b: Bindings) {
  const k = (a: Bindable) => firstKey(b, a)
  const four = [k('down'), k('left'), k('up'), k('right')]
  return four.join('') === 'WASD' ? 'WASD' : four.join(' ')
}

/** the help on foot: walking, the sidearm, a jump (and climbing a cliff pushed against), Use, a flare and a beacon */
export function footHint(input: InputKind, b: Bindings = DEFAULT_BINDINGS) {
  const n = namer(input, b)
  if (input === 'ps' || input === 'pad')
    return `Left stick to walk · Hold ${n('boost')} to run · ${n('fire')} fires · ${n('roll')} to jump (push into a cliff to climb it) · ${n('use')} to climb in, cut a vein or call a ship · ${n('secondary')} for a flare · ${n('view')} for a beacon`
  return input === 'touch'
    ? 'Drag to walk (far to run) · Fire · Dive · Action to climb in, cut a vein or call a ship · Flare · Beacon'
    : `${steerKeys(b)} to walk · ${n('boost')} to run · Click to fire where you point · ${n('roll')} to jump (push into a cliff to climb it) · ${n('use')} to climb in, cut a vein or call a ship · Right-click for a flare · ${n('view')} for a beacon`
}

/** the help inside (the hangar, the deck, a ship's rooms): walking, and Use by what he stands at */
export function insideHint(input: InputKind, b: Bindings = DEFAULT_BINDINGS) {
  const n = namer(input, b)
  if (input === 'ps' || input === 'pad') return `Left stick to walk · ${n('use')} to use what you stand by · Leave at the top`
  return input === 'touch'
    ? 'Drag to walk · Action to use what you stand by · Leave at the top'
    : `${steerKeys(b)} to walk · ${n('boost')} to run · ${n('use')} to use what you stand by · Leave at the top`
}

/** the help up out of the seat in flight: walking his ship's rooms while it flies itself, and back to the seat */
export function upHint(input: InputKind, b: Bindings = DEFAULT_BINDINGS) {
  const n = namer(input, b)
  if (input === 'ps' || input === 'pad')
    return `Left stick to walk the ship (it flies itself) · ${n('use')} to use what you stand by · ${n('seat')} back to the seat`
  return input === 'touch'
    ? 'Drag to walk the ship (it flies itself) · Action to use what you stand by · Seat back to the seat'
    : `${steerKeys(b)} to walk the ship (it flies itself) · ${n('boost')} to run · ${n('use')} to use what you stand by · ${n('seat')} back to the seat`
}

/** the help for a view; `stick` says up and down work like a flight stick (down climbs) */
export function hintFor(view: ViewMode, input: InputKind, stick: boolean, loop = false, b: Bindings = DEFAULT_BINDINGS) {
  const n = namer(input, b)
  const next = view === 'top' ? 'chase view' : view === 'chase' ? 'the cockpit' : 'overhead'
  const upDown = stick ? 'Down climbs, up dives' : 'Up climbs, down dives'
  if (input === 'ps' || input === 'pad') {
    const fly = `${view === 'top' ? 'Left stick to fly' : `Left stick to turn · ${upDown}`} · Right stick for the throttle`
    const land = loop
      ? ` · ${n('power')} powers the ship up, landed · Hold ${n('use')} to land, take off, or high up for space · Hold ${n('mine')} to mine · ${n('inventory')} for the hold`
      : ''
    return `${fly} · ${n('fire')} fires · ${n('secondary')} for a missile once locked · ${n('roll')} to roll · Hold ${n('boost')} for the thrusters${land} · ${n('view')} for ${next} · ${n('seat')} to get up and walk the ship`
  }
  const fingers = input === 'touch'
  const steer = view === 'top' ? `${fingers ? 'Touch' : 'Move'} to steer` : `${fingers ? 'Touch' : 'Point'} to turn · ${upDown}`
  // (overhead, the keys climb and dive: up dives as a stick, unless the setting says otherwise)
  const keysUpDown = view === 'top' && !fingers ? ` · ${stick ? n('up') : n('down')} dives, ${stick ? n('down') : n('up')} climbs` : ''
  const throttle = fingers ? ' · Slide the throttle' : ` · ${n('faster')}/${n('slower')} or the wheel for the throttle (down to a stop)`
  return fingers
    ? `${steer}${throttle} · Hold Fire · Missile when locked · Swipe to roll${view === 'top' ? ' · Dive and Climb' : ''}${loop ? ' · Power, landed, to power up · Hold Action to land, take off, or high up for space (tap it landed to get out) · Hold Mine to mine · Bag for the hold · Map' : ''} · Seat (under More) to get up and walk the ship`
    : `${steer}${keysUpDown}${throttle} · Click (or ${n('fire')}) to fire · Right-click (or ${n('secondary')}) for a missile once locked · ${n('roll')} to roll · ${n('boost')} for the thrusters${loop ? ` · ${n('power')} powers the ship up, landed · Hold ${n('use')} to land, take off, or high up for space (tap it landed to get out) · Hold ${n('mine')} to mine · ${n('inventory')} for the hold · ${n('map')} for the maps` : ''} · ${n('view')} for ${next} · ${n('seat')} to get up and walk the ship`
}

/** the help in space: the cruise drive, Use, the maps */
export function spaceHint(input: InputKind, b: Bindings = DEFAULT_BINDINGS) {
  const n = namer(input, b)
  if (input === 'ps' || input === 'pad')
    return `Left stick to fly (down over a world goes down to it) · Right stick for the throttle · ${n('power')} powers the ship up, docked · ${n('fire')} fires · ${n('cruise')} for the cruise drive · ${n('target')} to target the nearest, again for the next · Hold ${n('use')} to dock, go down to a world, jump a gate or skim · ${n('view')} for the next view · ${n('map')} for the maps · ${n('seat')} to get up and walk the ship`
  return input === 'touch'
    ? 'Touch to steer · Power, docked, to power up · Slide the throttle · Fire · Cruise for the cruise drive · Target the nearest · Hold Action to dock, go down, jump or skim · Dive over a world to go down · Map to plot a course · Seat (under More) to get up and walk the ship'
    : `Move to steer · ${n('power')} powers the ship up, docked · ${n('faster')}/${n('slower')} or the wheel for the throttle · Click to fire · ${n('cruise')} for the cruise drive · ${n('target')} to target the nearest, again for the next, held to let go · Hold ${n('use')} to dock, go down to a world, jump a gate or skim · ${n('view')} for the next view · ${n('map')} for the maps · ${n('inventory')} for the hold · ${n('seat')} to get up and walk the ship`
}

/** a key (or button, or gesture) and the one word for what it does: the help line as the page shows it */
export interface HintChip {
  key: string
  does: string
}

/**
 * The help line as a few key caps, each with one word, for where the pilot is ('fly' over a world, in
 * 'space', on 'foot', 'inside', 'up' out of his seat in flight): the most used controls only; the settings list them all. On a touch
 * screen the buttons carry their own pictures, so only the gestures are named.
 */
export function hintChips(
  where: 'fly' | 'space' | 'foot' | 'inside' | 'up',
  view: ViewMode,
  input: InputKind,
  loop = false,
  b: Bindings = DEFAULT_BINDINGS,
): HintChip[] {
  const n = namer(input, b)
  const chip = (key: string, does: string) => ({ key: key.toUpperCase(), does })
  if (input === 'touch') {
    if (where === 'foot' || where === 'inside' || where === 'up') return [chip('Drag', 'walk')]
    return where === 'space' ? [chip('Drag', 'steer')] : [chip('Drag', 'steer'), chip('Swipe', 'roll')]
  }
  const pad = input === 'ps' || input === 'pad'
  // (one word for the pointer in every view: it was MOUSE overhead and POINT from behind)
  const stick = pad ? 'L stick' : where === 'foot' || where === 'inside' || where === 'up' ? steerKeys(b) : 'Point'
  const fire = pad ? n('fire') : 'Click'
  if (where === 'inside') return [chip(stick, 'walk'), chip(n('use'), 'use')]
  if (where === 'up') return [chip(stick, 'walk'), chip(n('use'), 'use'), chip(n('seat'), 'to the seat')]
  if (where === 'foot')
    return [chip(stick, 'walk'), chip(fire, 'fire'), chip(n('roll'), 'jump'), chip(n('use'), 'use'), chip(n('view'), 'beacon')]
  if (where === 'space')
    return [
      chip(stick, 'steer'),
      chip(pad ? 'R stick' : `${n('faster')}/${n('slower')}`, 'throttle'),
      chip(fire, 'fire'),
      chip(n('cruise'), 'cruise'),
      chip(n('target'), 'target'),
      chip(n('use'), 'hold: use'),
      chip(n('view'), 'view'),
      chip(n('seat'), 'get up'),
    ]
  return [
    chip(stick, 'steer'),
    chip(pad ? 'R stick' : `${n('faster')}/${n('slower')}`, 'throttle'),
    chip(fire, 'fire'),
    chip(n('boost'), 'boost'),
    chip(n('roll'), 'roll'),
    chip(n('target'), 'target'),
    loop ? chip(n('use'), 'hold: land') : chip(n('view'), 'view'),
    chip(n('seat'), 'get up'),
  ]
}
