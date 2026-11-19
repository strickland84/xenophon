// The page's motion: how long things take to move, turned down to brief fades by the settings' Reduce
// motion (Game.svelte says so here, and puts data-motion="less" on the page for the styles) or by the
// device's own wish (prefers-reduced-motion). The styles take their times from layout.css; Svelte's
// transitions and counting figures take theirs from here.

let less = false

/** the settings' Reduce motion, told by the page */
export function setReducedMotion(on: boolean) {
  less = on
}

/** true while things may move (no Reduce motion, from the settings or the device) */
export function moving() {
  if (less) return false
  return !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
}

/** a time in ms, or a brief one with motion turned down */
export const ms = (t: number) => (moving() ? t : Math.min(t, 60))

/** a transition's parameters: its time, and no distance to travel with motion turned down */
export const travel = (duration: number, y = 8) => (moving() ? { duration, y } : { duration: Math.min(duration, 60), y: 0 })
