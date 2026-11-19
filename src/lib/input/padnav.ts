// A game controller in a screen of the page (the base's screen): the D-pad or the left stick
// moves the focus to the nearest button that way, Cross (A) presses it, Circle (B) or Options
// closes the screen, L1 and R1 (LB and RB) step between its pages where it has them (`onStep`). While a screen has the controller, the ship does not (FighterJetScene's
// `padOff`). The arrow keys move the focus the same way (`arrows`), so a screen works from the
// keyboard alone. The focus moving is heard (audio/ui.ts).

import { uiSound } from '../audio/ui'

const CROSS = 0
const CIRCLE = 1
const L1 = 4
const R1 = 5
const OPTIONS = 9
const UP = 12
const DOWN = 13
const LEFT = 14
const RIGHT = 15

/** the buttons in `root` the focus can move between */
const targets = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [data-nav]')].filter((el) => el.offsetParent !== null)

/** moves the focus from the button that has it to the nearest one in a direction (dx, dy) */
export function move(root: HTMLElement, dx: number, dy: number) {
  const list = targets(root)
  if (!list.length) return
  const from = document.activeElement as HTMLElement | null
  if (!from || !root.contains(from)) {
    list[0].focus()
    return
  }
  const a = from.getBoundingClientRect()
  const ax = a.left + a.width / 2
  const ay = a.top + a.height / 2
  let best: HTMLElement | null = null
  let bestScore = Infinity
  for (const el of list) {
    if (el === from) continue
    const b = el.getBoundingClientRect()
    const vx = b.left + b.width / 2 - ax
    const vy = b.top + b.height / 2 - ay
    const along = vx * dx + vy * dy
    if (along <= 4) continue
    // (nearest that way, and not far off to the side)
    const side = Math.abs(vx * dy - vy * dx)
    const score = along + side * 2.5
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  if (!best) return
  // (the focus moved by the player: the page's tooltips show for it, components/tooltip.svelte.ts)
  window.dispatchEvent(new Event('steered'))
  best.focus({ focusVisible: true } as FocusOptions)
  best.scrollIntoView({ block: 'nearest' })
  uiSound('move')
}

/** lets a controller work the buttons of `root` until the returned function is called */
export function padNav(root: HTMLElement, onClose: () => void, onStep?: (way: -1 | 1) => void): () => void {
  let was = new Set<number>()
  let repeat = 0
  let frame = 0
  const tick = (now: number) => {
    frame = requestAnimationFrame(tick)
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []
    const down = new Set<number>()
    let sx = 0
    let sy = 0
    for (const pad of pads) {
      if (!pad) continue
      pad.buttons.forEach((b, i) => b.pressed && down.add(i))
      sx += pad.axes[0] ?? 0
      sy += pad.axes[1] ?? 0
    }
    const pressed = (i: number) => down.has(i) && !was.has(i)
    if (pressed(CROSS)) (document.activeElement as HTMLElement | null)?.click()
    if (pressed(CIRCLE) || pressed(OPTIONS)) onClose()
    if (onStep && pressed(L1)) onStep(-1)
    if (onStep && pressed(R1)) onStep(1)
    const dx = (down.has(RIGHT) ? 1 : 0) - (down.has(LEFT) ? 1 : 0) || (Math.abs(sx) > 0.6 ? Math.sign(sx) : 0)
    let dy = (down.has(DOWN) ? 1 : 0) - (down.has(UP) ? 1 : 0) || (Math.abs(sy) > 0.6 ? Math.sign(sy) : 0)
    if (Math.abs(dx) && Math.abs(dy)) dy = 0
    if (dx || dy) {
      // (at once, then again while held)
      if (now > repeat) {
        move(root, dx, dy)
        repeat = now + (repeat === 0 || now - repeat > 400 ? 380 : 140)
      }
    } else repeat = 0
    was = down
  }
  frame = requestAnimationFrame(tick)
  return () => cancelAnimationFrame(frame)
}

/** the arrow keys in a screen: the focus to the nearest button that way (true if the key was one of them) */
export function arrows(root: HTMLElement, e: KeyboardEvent) {
  const way: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }
  const d = way[e.key]
  const t = e.target as HTMLElement | null
  // (not in a text box, where the arrows move the caret)
  if (!d || (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && (t as HTMLInputElement).type !== 'range')) return false
  e.preventDefault()
  move(root, d[0], d[1])
  return true
}
