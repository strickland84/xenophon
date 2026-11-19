// What the narrator says as each step of the first sortie begins (src/lib/tutorial/tutorial.ts has the steps; its
// prompt on screen says the same in the keys as bound). James, 2026-11-19, of the old lines ("Right, the clamps let go
// when you ask them to"): they gave no context. So each line says what is going on, which control does it on the
// device in use, and why, in plain words. Each step is read in four versions: the keyboard's default keys, a
// PlayStation controller's, another controller's, and one for a pilot who has bound the keys his own way, which names no
// key and points at the box on screen (`sortieVoice` chooses). (The touch screen's version went with its
// buttons: the game is for a desktop, James, 2026-11-19.)

import { DEFAULT_BINDINGS, firstButton, firstKey } from '../input/bindings'
import type { Bindable, Bindings } from '../input/bindings'
import type { InputKind } from '../input/hints'
import type { StepId } from '../tutorial/tutorial'

/** which version of a line is read: by device, or `any` (no key named) */
export type Voice = 'keys' | 'ps' | 'pad' | 'any'
export const VOICES: Voice[] = ['keys', 'ps', 'pad', 'any']

const LINES: Record<StepId, Record<Voice, string>> = {
  power: {
    keys: 'Your ship is docked at the station with its power off. Press P to power up. The screens take a couple of seconds to come on.',
    ps: 'Your ship is docked at the station with its power off. Press down on the d-pad to power up. The screens take a couple of seconds to come on.',
    pad: 'Your ship is docked at the station with its power off. Press down on the d-pad to power up. The screens take a couple of seconds to come on.',
    any: 'Your ship is docked at the station with its power off. Press the power key shown in the box at the top. The screens take a couple of seconds to come on.',
  },
  launch: {
    keys: 'Now hold F to launch. F is your action key. It launches, lands, docks, and takes you down to worlds.',
    ps: 'Now hold Circle to launch. Circle is your action button. It launches, lands, docks, and takes you down to worlds.',
    pad: 'Now hold B to launch. B is your action button. It launches, lands, docks, and takes you down to worlds.',
    any: 'Now hold your action key to launch. It launches, lands, docks, and takes you down to worlds.',
  },
  look: {
    keys: 'Press V to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    ps: 'Press Triangle to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    pad: 'Press the Y button to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
    any: 'Press your view key to change your view. Once to see the ship from behind, again for the cockpit, and once more to go back to the view from above.',
  },
  throttle: {
    keys: 'The throttle sets your speed. Hold Q to close it and slow right down, then hold E to open it up again. The mouse wheel moves it too, and the third bar at the bottom left shows how open it is.',
    ps: 'The throttle sets your speed. Pull the right stick back to close it and slow right down, then push it up to open it again. The third bar at the bottom left shows how open it is.',
    pad: 'The throttle sets your speed. Pull the right stick back to close it and slow right down, then push it up to open it again. The third bar at the bottom left shows how open it is.',
    any: 'The throttle sets your speed. Close it with your throttle keys to slow right down, then open it up again. The third bar at the bottom left shows how open it is.',
  },
  steer: {
    keys: "The arrow on screen points at your side's home world. Steer with the mouse, or A and D, and fly until you're over it. E opens the throttle and Q closes it.",
    ps: "The arrow on screen points at your side's home world. Steer with the left stick, and fly until you're over it. The right stick sets the throttle.",
    pad: "The arrow on screen points at your side's home world. Steer with the left stick, and fly until you're over it. The right stick sets the throttle.",
    any: "The arrow on screen points at your side's home world. Steer towards it, and fly until you're over it.",
  },
  descend: {
    keys: "You're over the world now. Hold F to put the nose down, and keep diving through its air until you're flying over the ground.",
    ps: "You're over the world now. Hold Circle to put the nose down, and keep diving through its air until you're flying over the ground.",
    pad: "You're over the world now. Hold B to put the nose down, and keep diving through its air until you're flying over the ground.",
    any: "You're over the world now. Hold your action key to put the nose down, and keep diving through its air until you're flying over the ground.",
  },
  dive: {
    keys: 'Hold S to dive. You can only mine and land close to the ground, so get your height under ninety.',
    ps: 'Push the left stick up to dive. You can only mine and land close to the ground, so get your height under ninety.',
    pad: 'Push the left stick up to dive. You can only mine and land close to the ground, so get your height under ninety.',
    any: 'Dive. You can only mine and land close to the ground, so get your height under ninety.',
  },
  target: {
    keys: "Three training drones are up ahead. They don't shoot back. Press T to target the one your nose is on. Press it again for the next, and hold it to let go. Your sights follow the enemy you've targeted, and so do your missiles.",
    ps: "Three training drones are up ahead. They don't shoot back. Press left on the d-pad to target the one your nose is on. Press it again for the next, and hold it to let go. Your sights follow the enemy you've targeted, and so do your missiles.",
    pad: "Three training drones are up ahead. They don't shoot back. Press left on the d-pad to target the one your nose is on. Press it again for the next, and hold it to let go. Your sights follow the enemy you've targeted, and so do your missiles.",
    any: "Three training drones are up ahead. They don't shoot back. Press your target key to target the one your nose is on. Press it again for the next, and hold it to let go. Your sights follow the enemy you've targeted, and so do your missiles.",
  },
  drones: {
    keys: 'Now click to fire your guns, and shoot all three down. Keep your nose on the one you have targeted, and the guns will help you aim.',
    ps: 'Now hold R2 to fire your guns, and shoot all three down. Keep your nose on the one you have targeted, and the guns will help you aim.',
    pad: 'Now hold the right trigger to fire your guns, and shoot all three down. Keep your nose on the one you have targeted, and the guns will help you aim.',
    any: 'Now fire your guns, and shoot all three down. Keep your nose on the one you have targeted, and the guns will help you aim.',
  },
  mine: {
    keys: "The marked rock is ore. Fly low over it and hold R to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    ps: "The marked rock is ore. Fly low over it and hold L1 to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    pad: "The marked rock is ore. Fly low over it and hold the left bumper to cut it with your mining laser. Then fly through the chunks that break off, and they're scooped into your hold.",
    any: "The marked rock is ore. Fly low over it and hold your mining key to cut it with the laser. Then fly through the chunks that break off, and they're scooped into your hold.",
  },
  land: {
    keys: 'Now land. Fly to the pad shown on screen and hold F, low over it. Any flat ground will do as well.',
    ps: 'Now land. Fly to the pad shown on screen and hold Circle, low over it. Any flat ground will do as well.',
    pad: 'Now land. Fly to the pad shown on screen and hold B, low over it. Any flat ground will do as well.',
    any: 'Now land. Fly to the pad shown on screen and hold your action key, low over it. Any flat ground will do as well.',
  },
  out: {
    keys: 'Tap F to climb out of your ship. On foot, you walk with W, A, S and D.',
    ps: 'Tap Circle to climb out of your ship. On foot, you walk with the left stick.',
    pad: 'Tap B to climb out of your ship. On foot, you walk with the left stick.',
    any: 'Tap your action key to climb out of your ship.',
  },
  beacon: {
    keys: 'Press V to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    ps: 'Press Triangle to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    pad: 'Press Y to plant a beacon, and pick a message for it. Pilots who land here later will read it.',
    any: 'Plant a beacon with your view key, and pick a message for it. Pilots who land here later will read it.',
  },
  board: {
    keys: 'Walk back to your ship and press F to climb in.',
    ps: 'Walk back to your ship and press Circle to climb in.',
    pad: 'Walk back to your ship and press B to climb in.',
    any: 'Walk back to your ship and press your action key to climb in.',
  },
  bank: {
    keys: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold F to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    ps: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold Circle to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    pad: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Hold B to take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
    any: "Ore in your hold isn't yours until it's banked. If you're shot down, it spills on the ground for anyone to take. Take off, follow the home marker to one of your side's bases, and land on its pad. That banks your ore as credits.",
  },
  free: {
    keys: "That's the end of the training flight. Press M for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    ps: "That's the end of the training flight. Press the touchpad for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    pad: "That's the end of the training flight. Press Back for the map. The marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
    any: "That's the end of the training flight. Open the map: the marked worlds have the richest ore today. Spend your credits at any of your side's bases, on better parts and ships.",
  },
}

/** every line the narrator reads in the first sortie, by `<step>-<voice>` (its narration id is `sortie-<step>-<voice>`) */
export const SORTIE_SAID: Record<string, string> = Object.fromEntries(
  (Object.entries(LINES) as [StepId, Record<Voice, string>][]).flatMap(([step, v]) =>
    VOICES.map((voice) => [`${step}-${voice}`, v[voice]]),
  ),
)

/** the controls each step's lines name, beside the action key (a pilot who has bound one elsewhere hears `any`) */
const NAMED: Record<StepId, Bindable[]> = {
  power: ['power'],
  launch: ['use'],
  look: ['view'],
  throttle: ['faster', 'slower'],
  steer: ['left', 'right', 'faster', 'slower'],
  descend: ['use'],
  dive: ['up'],
  target: ['target'],
  drones: ['fire'],
  mine: ['mine'],
  land: ['use'],
  out: ['use', 'down', 'left', 'up', 'right'],
  beacon: ['view'],
  board: ['use'],
  bank: ['use'],
  free: ['map'],
}

/** which version of a step's line to read, for the device in use, the pilot's bindings and his pitch (`stick`: up dives) */
export function sortieVoice(step: StepId, input: InputKind, b: Bindings = DEFAULT_BINDINGS, stick = true): Voice {
  // (the lines say the stick's up dives)
  if (step === 'dive' && !stick) return 'any'
  const pad = input === 'ps' || input === 'pad'
  const ps = input === 'ps'
  const same = (a: Bindable) =>
    pad ? firstButton(b, a, ps) === firstButton(DEFAULT_BINDINGS, a, ps) : firstKey(b, a) === firstKey(DEFAULT_BINDINGS, a)
  // (a controller steers with its sticks: only its buttons are checked)
  const named = pad ? NAMED[step].filter((a) => DEFAULT_BINDINGS.pad[a]) : NAMED[step]
  if (!named.every(same)) return 'any'
  return pad ? (ps ? 'ps' : 'pad') : 'keys'
}

/** the narration id of a step's line in a voice */
export const sortieLine = (step: StepId, voice: Voice) => `sortie-${step}-${voice}`
