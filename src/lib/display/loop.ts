// The frame loop. The scene moves on in fixed steps (STEP seconds, from the engine), so it
// flies the same on every machine whatever its screen's refresh rate: before each repaint,
// a clock says how many steps the time since the last one is worth.

import { STEP } from '../engine'

/** longest gap between two repaints that is made up for, in seconds (a tab left in the background comes back gently) */
const MAX_GAP = 0.05

/** the most steps taken before one repaint: a slow machine slows the game down rather than falling further and further behind */
const MAX_STEPS = Math.round(MAX_GAP / STEP)

export interface Clock {
  /** `dt` seconds have passed since the last repaint: how many steps to take now (often 1, sometimes 0 or several) */
  advance(dt: number): number
}

/** counts out fixed steps from the time that passes */
export function createClock(): Clock {
  // seconds that have passed and not yet been stepped (between half a step behind and half a step ahead)
  let owed = 0
  return {
    advance(dt) {
      owed += Math.min(MAX_GAP, Math.max(0, dt))
      // rounded rather than cut down: a 60 Hz screen's repaints wobble either side of one step
      // apart, and this way each of them still gets exactly one
      const n = Math.min(MAX_STEPS, Math.round(owed / STEP))
      // (more than the most steps there is room for: the rest is let go)
      owed = Math.min(STEP / 2, owed - n * STEP)
      return n
    },
  }
}

/**
 * Calls `frame` before every repaint with the seconds since the last one and the time in
 * milliseconds. Returns a function that stops it.
 */
export function startLoop(frame: (dt: number, now: number) => void) {
  let raf = 0
  let last = performance.now()
  const tick = (now: number) => {
    raf = requestAnimationFrame(tick)
    const dt = Math.max(0, (now - last) / 1000)
    last = now
    frame(dt, now)
  }
  raf = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(raf)
}
