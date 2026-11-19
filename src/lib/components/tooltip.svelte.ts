// The tooltips: one for the whole page, shown by whatever the player points at, moves the focus to or
// holds a finger on, so a screen can show the picture, the bar and the figure and keep the words a
// moment away. `use:tip={...}` on anything gives it one; TooltipHost.svelte (once, in Game.svelte) draws
// it, anchored to the thing and kept on the screen.
//
//   a mouse      on hover, after a short wait, gone when it leaves
//   keys, a pad  on focus (the arrow keys and a controller move the focus), gone when it moves on
//   a finger     a long press (the tap still does what it does; a long press does not also press it)

import { untrack } from 'svelte'

/** a line of figures in a tooltip: a name, a figure, a bar (0..1), and how it compares with what he has */
export interface TipStat {
  label: string
  value?: string
  bar?: number
  /** against what he has now: better (green) or worse (red) */
  tone?: 'good' | 'bad'
  /** a picture before the name (a resource's icon) */
  icon?: string
}

export interface TipContent {
  title: string
  /** what it is, in a few words */
  line?: string
  /** the title's colour (a side's, a danger's) */
  colour?: string
  /** a picture by the title */
  icon?: string
  stats?: TipStat[]
  /** what it costs, or the catch */
  cost?: string
  /** a last line, dim (where it is, how to get it) */
  note?: string
}

/** what is shown now, and where (the thing's place on the screen) */
export const tipNow = $state<{ content: TipContent | null; rect: DOMRect | null; by: 'pointer' | 'focus' | 'touch'; n: number }>({
  content: null,
  rect: null,
  by: 'pointer',
  n: 0,
})

let owner: Element | null = null
let timer = 0

/** where the pointer last was: a large thing's tooltip goes by the pointer, not over its neighbours */
let pointerX = 0
let pointerY = 0

function show(node: HTMLElement | SVGElement, content: TipContent, by: 'pointer' | 'focus' | 'touch') {
  owner = node
  tipNow.content = content
  const r = node.getBoundingClientRect()
  // (a large thing, a side's card, a map: by the pointer, or by its top for the keys and a finger)
  const large = r.height > 140 || r.width > 420
  tipNow.rect = !large
    ? r
    : by === 'pointer'
      ? new DOMRect(pointerX - 8, pointerY - 8, 16, 16)
      : new DOMRect(r.left + r.width / 2 - 8, r.top + 24, 16, 16)
  tipNow.by = by
  tipNow.n++
}
function hide(node: HTMLElement | SVGElement) {
  window.clearTimeout(timer)
  if (owner !== node) return
  owner = null
  tipNow.content = null
}

/** when the player last moved the focus himself (the arrows, Tab, a controller's D-pad: padnav.ts presses arrow keys too);
 * a focus given by a screen as it opens shows no tooltip */
let steeredAt = -1e9
if (typeof window !== 'undefined')
  window.addEventListener(
    'keydown',
    (e) => {
      // (only from a control already focused: Tab opens the hold and the base's screen, whose own first focus is not his,
      // and showed a tooltip by itself over the base's picture: the fresh review)
      const from = typeof document !== 'undefined' ? document.activeElement : null
      if (/^(Arrow|Tab$)/.test(e.key) && from?.closest?.('button, input, select, textarea, a[href], [role="tab"]')) steeredAt = e.timeStamp
    },
    true,
  )
if (typeof window !== 'undefined') window.addEventListener('steered', (e) => (steeredAt = e.timeStamp))

/** the hover's wait before a tooltip shows, and a long press's */
const HOVER_WAIT = 320
const PRESS_WAIT = 450

/** gives an element a tooltip (null: none, for now) */
export function tip(node: HTMLElement | SVGElement, content: TipContent | null) {
  let now = content
  let longPressed = false
  const move = (e: Event) => {
    if (!(e instanceof PointerEvent)) return
    pointerX = e.clientX
    pointerY = e.clientY
  }
  const enter = (e: Event) => {
    if (!(e instanceof PointerEvent)) return
    move(e)
    if (e.pointerType === 'touch' || !now) return
    window.clearTimeout(timer)
    // (one tooltip already up: the next comes at once, as the pointer runs along a row)
    const wait = tipNow.content ? 40 : HOVER_WAIT
    timer = window.setTimeout(() => now && show(node, now, 'pointer'), wait)
  }
  const leave = (e: Event) => {
    if ((e as PointerEvent).pointerType !== 'touch') hide(node)
  }
  const down = (e: Event) => {
    if ((e as PointerEvent).pointerType !== 'touch' || !now) return
    longPressed = false
    window.clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (!now) return
      longPressed = true
      show(node, now, 'touch')
    }, PRESS_WAIT)
  }
  const up = (e: Event) => {
    if ((e as PointerEvent).pointerType !== 'touch') {
      // (a click hides a hover's tooltip: the thing has been chosen)
      hide(node)
      return
    }
    window.clearTimeout(timer)
    if (longPressed) window.setTimeout(() => hide(node), 1600)
  }
  const click = (e: Event) => {
    // (a long press shows the tooltip and does not also press the button)
    if (longPressed) {
      e.preventDefault()
      e.stopImmediatePropagation()
      longPressed = false
    }
  }
  const focus = (e: Event) => {
    // (only a focus the player moved with the keys or a controller: a click focuses too, and has its hover)
    if (now && node.matches(':focus-visible') && e.timeStamp - steeredAt < 800) show(node, now, 'focus')
  }
  const blur = () => hide(node)
  const menu = (e: Event) => longPressed && e.preventDefault()
  node.addEventListener('pointerenter', enter)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerleave', leave)
  node.addEventListener('pointerdown', down)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', up)
  node.addEventListener('click', click, true)
  node.addEventListener('focus', focus)
  node.addEventListener('blur', blur)
  node.addEventListener('contextmenu', menu)
  return {
    update(next: TipContent | null) {
      now = next
      // (outside the effect that calls this: showing reads and writes the tooltip's state)
      untrack(() => {
        if (owner !== node) return
        if (next) show(node, next, tipNow.by)
        else hide(node)
      })
    },
    destroy() {
      hide(node)
      node.removeEventListener('pointerenter', enter)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerleave', leave)
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
      node.removeEventListener('click', click, true)
      node.removeEventListener('focus', focus)
      node.removeEventListener('blur', blur)
      node.removeEventListener('contextmenu', menu)
    },
  }
}

/** shows a thing's tooltip for a moment, unasked (a touch button's name, the first time it is pressed) */
export function flash(node: HTMLElement, content: TipContent, ms = 1600) {
  show(node, content, 'touch')
  window.clearTimeout(timer)
  timer = window.setTimeout(() => hide(node), ms)
}
