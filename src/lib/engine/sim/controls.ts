// What the player is doing, as the scene understands it. The page turns mouse, touch, keys
// and game controllers into one set of named actions (see lib/input) and hands them over as
// plain values: what is held down (Scene.setControls), what was pressed once (Scene.act), and
// where the pointer is. The flight model reads them from here.

/** what is held down, from every device at once */
export interface HeldControls {
  /** steering from the keys or a stick: −1 left … +1 right */
  turn: number
  /** −1 (the Down key, the stick pulled back) … +1 (Up, pushed forward): the scene decides which of them climbs */
  climb: number
  /** on foot and inside: −1 back … +1 forward (optional: left out, `climb` walks, as a stick's push walks forward). The
   * keys say it apart from `climb`, since W pitches the nose up (a pull) and still walks forward */
  walk?: number
  /** 0..1: the thrusters (a key or a button opens them all the way, a trigger part of the way) */
  boost: number
  /** the throttle keys: −1 (S, the stick pulled back) … +1 (W, pushed): held, they move the throttle (optional: left out, nothing) */
  throttle?: number
  /** the vertical thrusters, as Elite's: −1 (Ctrl) thrusting the ship down … +1 (Alt) up, square to its nose, which does not
   * pitch (optional: left out, nothing) */
  lift?: number
  /** the lateral thrusters, as Elite's: −1 (Q) the ship slides left … +1 (E) right, its nose not turning (optional: left out, nothing) */
  strafe?: number
  /** the guns, and the secondary weapon */
  fire: boolean
  secondary: boolean
  /** Land / use, held: land or take off (optional: left out, it is not held) */
  land?: boolean
  /** the mining laser (on foot the hand cutter), held: its own control since James's first flights, so landing near ore
   * still lands (optional: left out, it is not held) */
  mine?: boolean
  /** the target key, held: a press picks the next thing, held a moment it lets the target go (optional: left out, it is not held) */
  target?: boolean
}

/** things pressed once that the scene deals with: a full roll, land / board / use, the next view, the cruise drive, the ship's power switch,
 * up out of the seat in flight or back into it, and the next target (sim/target.ts) */
export type SceneAction = 'roll' | 'use' | 'view' | 'cruise' | 'power' | 'seat' | 'target'

export interface Controls {
  /** the pointer is over the scene, where (frame pixels), and for how long it has been still */
  pointerOn: boolean
  pointerX: number
  pointerY: number
  pointerIdle: number
  /** flying with the keys or a stick: −1 left … +1 right, −1 dive … +1 climb */
  keyTurn: number
  keyClimb: number
  /** on foot and inside, the keys or a stick: −1 back … +1 forward */
  keyWalk: number
  /** the keys fly the jet until the pointer moves again */
  keyMode: boolean
  /** the throttle keys held, −1 … +1; and how far the throttle is to move at the next step besides (the mouse's wheel) */
  keyThrottle: number
  /** the vertical thrusters held, −1 down … +1 up; the lateral, −1 left … +1 right */
  keyLift: number
  keyStrafe: number
  throttleBy: number
  /** the throttle set outright since the last step, or −1 */
  throttleTo: number
  /** 0..1: how far the thrusters are opened */
  boost: number
  /** held down: the guns, and the secondary weapon (nothing fires yet) */
  fire: boolean
  secondary: boolean
  /** land, board or use was pressed since the last step; cleared after every step */
  use: boolean
  /** Land / use is held down; and seconds a press of it still counts as held (a press alone lands, takes off, or mines, briefly) */
  land: boolean
  tap: number
  /** the mining laser (the cutter on foot) held */
  mine: boolean
}

export function createControls(): Controls {
  return {
    pointerOn: false,
    pointerX: 0,
    pointerY: 0,
    pointerIdle: 99,
    keyTurn: 0,
    keyClimb: 0,
    keyWalk: 0,
    keyMode: false,
    keyThrottle: 0,
    keyLift: 0,
    keyStrafe: 0,
    throttleBy: 0,
    throttleTo: -1,
    boost: 0,
    fire: false,
    secondary: false,
    use: false,
    land: false,
    tap: 0,
    mine: false,
  }
}
