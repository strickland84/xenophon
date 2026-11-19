<script lang="ts">
  // A screen over the game (the base's screen, the hangar's bench and booth, the deck's shop, the maps,
  // the menu, the pilot sheet, the settings …): a veil that closes it when pressed, a panel with its
  // side's trim along the top, a header (the name, a line under it, the credits, Close), tabs if it has
  // them, and a body that scrolls on its own while the header and the footer stay put. It deploys as it
  // opens (layout.css: ui-deploy) and fades as it goes. Everything in it is a button, so a tap, a click,
  // the keys (the arrows move the focus, Enter presses) or a controller (padnav.ts) work it.
  import { asset } from '$app/paths'
  import UiIcon from './UiIcon.svelte'
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'
  import { fade } from 'svelte/transition'
  import { arrows, padNav } from '../input/padnav'
  import Count from './Count.svelte'
  import { ms } from './motion'

  interface Props {
    title: string
    /** a line by the title ('' none), and the credits to show (null none) */
    sub?: string
    credits?: number | null
    /** how wide it may grow: 'narrow' a dialog, the usual, 'wide' (the bench, the shop), or 'full' (the maps) */
    size?: 'narrow' | 'normal' | 'wide' | 'full'
    /** @deprecated: size 'wide' */
    wide?: boolean
    /** Tab closes it, as Tab opened it (the hold); false: Tab moves the focus, as on any page */
    tabCloses?: boolean
    /** what screen readers call it (the title, unless said) */
    label?: string
    /** keys besides Escape that close it (M closes the maps, as M opened them) */
    closeKeys?: string[]
    /** something before the title (a portrait, a side's emblem) */
    lead?: Snippet
    /** the tabs, under the header (or in its row, `inlineTabs`: the maps and the menu, where height is short) */
    tabs?: Snippet
    inlineTabs?: boolean
    /** the actions kept at the bottom, out of the scrolling */
    foot?: Snippet
    /** beside what it changes (the hangar's bench and booth): along the right of a wide screen, the place not darkened, so
     * the ship in the middle shows each change as it is made (centred over it, the panel hid the ship it was fitting) */
    beside?: boolean
    /** under the scene's row at the top (where it ends, CSS px from the top), which stays over it (the base's screen: that row's Hold, Market and Supplies are
     * its pages) */
    under?: number
    /** where its pages are outside it (the base's): to the page before or after (a controller's L1 and R1), and straight to
     * one by its number (the keys 1, 2, 3 …, which fly nothing; Q and E, which it was, thrust the ship sideways) */
    onstep?: (way: -1 | 1) => void
    onpick?: (n: number) => void
    onclose: () => void
    children: Snippet
  }
  let {
    title,
    sub = '',
    credits = null,
    size = 'normal',
    wide = false,
    tabCloses = true,
    label = '',
    closeKeys = [],
    lead,
    tabs,
    inlineTabs = false,
    foot,
    beside = false,
    under = 0,
    onstep,
    onpick,
    onclose,
    children,
  }: Props = $props()
  let panel = $state<HTMLElement>()
  let body = $state<HTMLElement>()
  const width = $derived(
    beside
      ? 'min-[901px]:max-w-[32rem] max-w-[60rem]'
      : size === 'full'
        ? 'max-w-[74rem]'
        : wide || size === 'wide'
          ? 'max-w-[60rem]'
          : size === 'narrow'
            ? 'max-w-[34rem]'
            : 'max-w-[48rem]',
  )

  onMount(() => {
    // (the keys and a controller start on the first thing in the body to press, or Close)
    ;(body?.querySelector<HTMLElement>('button:not(:disabled), input') ?? panel?.querySelector<HTMLElement>('button'))?.focus({
      preventScroll: true,
    })
    return panel ? padNav(panel, onclose, (way) => onstep?.(way)) : undefined
  })
</script>

<div
  class="ui-veil"
  class:ui-veil-beside={beside}
  style={under ? `padding-top: ${under + 8}px` : undefined}
  role="presentation"
  out:fade|global={{ duration: ms(110) }}
  onpointerdown={(e) => {
    e.stopPropagation()
    if (e.target === e.currentTarget) onclose()
  }}
  onpointerup={(e) => e.stopPropagation()}
  onkeydown={(e) => {
    if (panel && arrows(panel, e)) return
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
    if (e.key === 'Escape' || (e.key === 'Tab' && tabCloses) || (!typing && closeKeys.includes(e.key))) {
      e.preventDefault()
      onclose()
    } else if (onpick && !typing && /^Digit[1-9]$/.test(e.code)) {
      e.preventDefault()
      onpick(Number(e.code.slice(5)) - 1)
    }
  }}
>
  <section bind:this={panel} class="ui-panel {width}" aria-label={label || title}>
    <header class="flex items-center gap-3 px-4 pt-3 pb-3 max-sm:px-3">
      {@render lead?.()}
      <div class="flex min-w-0 flex-col gap-1.5 {inlineTabs ? 'max-w-[40%] flex-none' : ''}">
        <h2 class="ui-head truncate">{title}</h2>
        {#if sub}<span class="ui-label truncate">{sub}</span>{/if}
      </div>
      {#if tabs && inlineTabs}<div class="min-w-0 flex-1 self-end">{@render tabs()}</div>{/if}
      {#if credits !== null}
        <span class="ui-head ui-num ml-auto flex items-center gap-2 text-nomarchy" aria-label="{credits} credits">
          <img src={asset('icons/credits.png')} alt="" width="32" height="32" style="image-rendering: pixelated" />
          <Count value={credits} />
        </span>
      {/if}
      <button
        type="button"
        class="ui-btn ui-btn-icon {credits === null && !inlineTabs ? 'ml-auto' : ''}"
        aria-label="Close"
        onclick={onclose}
      >
        <UiIcon name="close" />
      </button>
    </header>
    {#if tabs && !inlineTabs}
      <div class="px-4 max-sm:px-3">{@render tabs()}</div>
    {/if}
    <div bind:this={body} class="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-4 max-sm:px-3 max-sm:pt-3">
      {@render children()}
    </div>
    {#if foot}
      <footer class="flex flex-wrap items-center gap-2 border-t-2 border-ink/10 px-4 py-3 max-sm:px-3 max-sm:py-2">
        {@render foot()}
      </footer>
    {/if}
  </section>
</div>
