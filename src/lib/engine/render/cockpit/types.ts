// The cockpit (the polish pass, item 3): each hull's own, drawn by the image model (art.ts, generated).
// It is fitted to the frame once per hull, size and paint (build.ts) as two layers at different
// distances from the pilot's eyes, the canopy's frame and the panel, never scaled: the art made at the
// nearer of two heights is cut to the frame's width and stretched at one row through the windows.
// Each frame the layers are laid over the view, shifted as the pilot's head sways (the nearer more),
// and the live instruments are drawn on the panel's screens (screens.ts).
//
// Colours are 0xAABBGGRR.

import type { CockpitScreen } from './art'
import type { TargetInfo } from '../targetinfo'

/** a cockpit fitted to a frame: its two layers (0: see-through), each `pad` px larger than the frame on every side so they can sway */
export interface CockpitArt {
  hull: string
  /** the paint it was made with (the player's markings colour, darkest tone first) */
  paintKey: string
  W: number
  H: number
  pad: number
  aw: number
  ah: number
  frame: Uint32Array
  panel: Uint32Array
  /** its screens, in frame px (before the panel's sway) */
  screens: CockpitScreen[]
  /** the frame's rows from this one down are covered by the cockpit wherever the head is: the world need not be drawn there */
  clear: number
  /** the panel's top, in frame px: it slides up from below the frame to here as the camera arrives */
  panelTop: number
}

export interface CockpitLive {
  time: number
  /** 0..1: how far the layers have slid into place */
  inPlace: number
  roll: number
  pitch: number
  heading: number
  speed: number
  speedMax: number
  /** 0..1 the throttle as set (the lever's handle) */
  throttle: number
  alt: number
  altMax: number
  /** −1 dive … +1 climb */
  climb: number
  boost: number
  /** in space: no ground under the radar, no height to tell */
  space: boolean
  /** the screen row the view rolls about (the guns' sight is there) */
  pivotY: number
  /** how far the pilot's head has swung, in px at a frame 256 tall (right and down are positive) */
  headX: number
  headY: number
  /** what the radar sees at an offset from the ship (right, ahead), in world px: 0 sea, 1 shallows, 2 land, 3 high ground */
  land: (right: number, ahead: number) => number
  /** other ships, as (right, ahead, enemy) triples: world px, and 1 for an enemy */
  blips: number[]
  /** the ship from above: 0 empty, 1 body, 2 paint, 3 glass */
  jet: { w: number; h: number; cells: Uint8Array }
  /** hull and shield, 0..1; the guns' heat 0..1 and whether they are jammed */
  hull: number
  shield: number
  heat: number
  jammed: boolean
  /** missiles and mines carried, and the most of each */
  missiles: number
  missilesMax: number
  mines: number
  minesMax: number
  /** what the sights or the seeker are on (null: nothing): from above, its hull 0..1, px away, the lock 0..1 */
  target: { top: { w: number; h: number; cells: Uint8Array }; hull: number; d: number; lock: number } | null
  /** what the pilot picked with the target key (render/targetinfo.ts): the target screen says it all (null: nothing picked) */
  picked: TargetInfo | null
  /**
   * Ore in the mining laser's reach (null: none): its icon (9 px, 0xAABBGGRR rows), name and colours (its light, then its
   * own light, middle and dark), the cut's progress 0..1 and the units it frees, whether the beam is on and a cut has just
   * broken free, and the units left of what it held
   */
  ore: {
    icon: { w: number; h: number; px: number[] } | null
    name: string
    light: number
    cols: number[]
    cut: number
    batch: number
    on: boolean
    freed: boolean
    left: number
    stock: number
  } | null
  /** the hold: units carried, and the most it takes */
  hold: number
  holdMax: number
  /** the markings colour's tones, darkest first (the screens' accents) */
  accent: number[]
  /** the ship's power (sim/power.ts): 0..1 how far it has come up, and whether it is coming up (else going down, or off) */
  power: number
  rising: boolean
  /** landed or docked: the weapons are safe */
  safe: boolean
  /** the cruise drive (in space): 0..1 how far it has spooled while it spools, and how many times its speed it pushes
   * once on (null: off). The panel says it, not words floating over the canopy (James, 2026-11-19) */
  cruise: { spool: number; pace: number } | null
}
