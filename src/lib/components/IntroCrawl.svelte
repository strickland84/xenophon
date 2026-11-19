<script lang="ts">
  // The opening story (the plan's section 15), shown once to a new pilot before the title, and again from the
  // title's Story or the menu: a line in the dark, the game's name lit a letter at a time, then the story read aloud by
  // the narrator over deep space. The sky is the image model's (static/ui/intro-sky.png and two fields of stars that
  // drift in front of it at their own paces: tools/gen/interface.py intro, tools/voxel/interface.py), after
  // art/mockups/intro-crawl.png.
  //
  // The words are a column of paragraphs, flat, in the game's pixel font at the interface's heading size (they rolled
  // away in perspective until James found them unreadable, 2026-11-18): the paragraph being read is held still in the
  // middle of the screen, and in the breath before the next the column glides up to it, the one read dimming and those
  // above fading out. Skipped, after its first moments, by the button, Escape, Enter or Space, a tap, or a controller's
  // button; it ends by itself into the title. With Reduce motion it is a still page, read at leisure.
  //
  // It waits first on a Begin button in the middle of the sky (James, 2026-11-19: "a much clearer 'BEGIN' button right in
  // the intro. User clicks it, thus triggering sound and then the full intro plays"; art/mockups/intro-begin.png): a page's
  // sound may only start from a press, so the story is told from its first word only once it has had one.
  import { asset } from '$app/paths'
  import { onMount } from 'svelte'
  import { audio } from '../audio/mixer'
  import { hush, preload, speak, voiced } from '../audio/narration'
  import { OPENING, STORY, TITLE_LINE, plain, runsOf } from '../story/intro'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import Emblem from './Emblem.svelte'
  import UiIcon from './UiIcon.svelte'
  import { moving } from './motion'
  import { main, quiet } from './styles'

  interface Props {
    /** the story is over: watched to the end, or skipped */
    ondone: () => void
  }
  let { ondone }: Props = $props()

  const INK = '#f4ecd0'
  const SHADOW = '#1a0f2e'
  /** a dark edge a font pixel wide all round the words, and their shadow: a star behind a letter swallowed it (James:
   * "the word red is obscured with the star behind it") */
  const EDGED = `-0.143em 0 0 ${SHADOW}, 0.143em 0 0 ${SHADOW}, 0 -0.143em 0 ${SHADOW}, 0 0.143em 0 ${SHADOW}, 0.143em 0.143em 0 ${SHADOW}, 0.286em 0.286em 0 ${SHADOW}`
  const colourOf = (side: FactionId | null) => (side ? FACTIONS[side].colour : INK)

  // ── when each part comes, in seconds from the start: the narrator's lines set the pace (each paragraph read as it
  // comes up; src/lib/audio/narration.ts), a reader's where a line is not voiced
  /** a line's length as read, or as long as it takes to read to oneself */
  const lengthOf = (id: string, text: string) => voiced(id) || text.split(/\s+/).length / 2.6
  const SAY_OPENING = lengthOf('intro-0', OPENING)
  const T = {
    /** the opening line in, and out (it stays while it is said) */
    line: 0.6,
    lineOut: 0.6 + Math.max(4.4, SAY_OPENING + 0.5),
    /** the name lit, letter by letter, and gone */
    name: 0,
    nameOut: 0,
    /** the words begin to come */
    crawl: 0,
    /** the fade into the title */
    out: 1.0,
    /** nothing skips the story before this: the first click or key is what lets the sound on, and must not also end it
     * (James, 2026-11-18); the Skip button comes then */
    skipFrom: 12,
  }
  T.name = T.lineOut + 0.9
  T.nameOut = T.name + Math.max(4.7, 0.4 + lengthOf('title', TITLE_LINE) + 0.6)
  T.crawl = T.name + 4.1
  /** how long the column takes to glide up to the next paragraph, in the breath before it is read */
  const GLIDE = 1.1
  /** each paragraph read from this moment (the first once the name has gone, each after the one before with a breath
   * between), and the story's end, a moment after the last */
  const SAID: number[] = []
  // (the first glided to as the name is nearly gone: both are in the middle of the screen)
  let END = T.nameOut + 1.0 + GLIDE
  STORY.forEach((p, i) => {
    SAID.push(END)
    END += lengthOf(`intro-${i + 1}`, plain(p.text)) + GLIDE + 0.2
  })
  END += 2.5
  /** the narrator's lines, and when each is said */
  const LINES = [{ id: 'intro-0', at: T.line }, { id: 'title', at: T.name + 0.4 }, ...SAID.map((at, i) => ({ id: `intro-${i + 1}`, at }))]
  /** the wordmark's width in its own pixels (static/brand/wordmark-1x.png) */
  const MARK_W = 314
  /** the name comes on as a sign's lamps do: a flicker, then lit */
  function lit(t: number) {
    const k = t - T.name
    if (k < 0) return 0
    if (k > 0.32) return 1
    return [1, 0, 1, 1, 0, 0, 1, 0][Math.floor(k * 25) % 8]
  }
  /** how much of the wordmark is uncovered, left to right, in whole columns of its own pixels */
  const uncovered = (t: number) => Math.round(ramp(t, T.name, T.name + 1.2) * MARK_W) / MARK_W
  /** 0 before `a`, 1 after `b`, a straight line between */
  const ramp = (t: number, a: number, b: number) => Math.max(0, Math.min(1, (t - a) / (b - a)))

  let still = $state(false)
  let t = $state(0)
  /** Begin has been pressed: the story is told from then (on the still page there is nothing to wait for) */
  let begun = $state(false)
  /** the sky has come up out of the dark (once, as the page opens) */
  let skyUp = $state(false)
  let beginButton = $state<HTMLButtonElement>()
  let leaving = $state(false)
  /** the sound has been let on (the page's audio waits for a first press) */
  let heard = $state(true)
  let skip = $state<HTMLButtonElement>()
  /** the screen's size (CSS px), the sky's scale (whole CSS px a pixel) */
  let vw = $state(1366)
  let vh = $state(768)
  const SKY_W = 336
  const SKY_H = 144
  const skyK = $derived(Math.max(Math.ceil(vw / SKY_W), Math.ceil(vh / SKY_H)))
  const skyW = $derived(SKY_W * skyK)
  const skyH = $derived(SKY_H * skyK)
  const total = END
  /** the sky pans from the Nomarchy's gold sun towards the Anarchoi's red one as the story goes */
  const skyX = $derived(-Math.round((skyW - vw) * (still ? 0.5 : 0.2 + 0.6 * Math.min(1, t / total))))
  const skyY = $derived(Math.round((vh - skyH) / 2))
  /** nearer stars go by faster */
  const farX = $derived(Math.round(skyX * 1.6 - (still ? 0 : t * 2)))
  const nearX = $derived(Math.round(skyX * 2.4 - (still ? 0 : t * 5)))

  /** the story can be skipped now (the still page at once) */
  const canSkip = $derived(still || t >= T.skipFrom)

  /** Begin pressed (a click, a tap, Enter or Space, a controller's Cross): the press lets the sound on (mixer.ts
   * listenForUnlock), and the story starts */
  function begin() {
    if (begun || leaving) return
    begun = true
    window.setTimeout(() => (skip ?? box)?.focus({ preventScroll: true }), 0)
  }

  function finish() {
    if (leaving) return
    leaving = true
    hush(still ? 0.06 : T.out)
    window.setTimeout(ondone, still ? 60 : T.out * 1000)
  }

  // ── the column of words: each paragraph's middle in it (CSS px from its top), measured once it is laid out, and
  // where the column stands at a moment (the paragraph being read centred at READ_AT of the screen's height)
  const READ_AT = 0.55
  let column = $state<HTMLDivElement>()
  let middles = $state<number[]>([])
  function measure() {
    if (!column) return
    middles = [...column.children].map((el) => (el as HTMLElement).offsetTop + (el as HTMLElement).offsetHeight / 2)
  }
  function fit() {
    vw = window.innerWidth
    vh = window.innerHeight
    measure()
  }
  /** a gentle start and stop */
  const ease = (k: number) => k * k * (3 - 2 * k)
  /** the paragraph being read, or glided to (-1 before the first) */
  function readingAt(time: number) {
    let i = -1
    while (i + 1 < SAID.length && time >= SAID[i + 1] - GLIDE) i++
    return i
  }
  /** where the column's top is (CSS px down the screen, whole pixels so the font stays sharp) */
  function columnAt(time: number) {
    if (!middles.length) return vh
    const place = (i: number) => vh * READ_AT - middles[Math.max(0, i)] + (i < 0 ? vh * 0.3 : 0)
    const i = readingAt(time)
    const k = i < 0 ? 0 : ease(ramp(time, SAID[i] - GLIDE, SAID[i]))
    return Math.round(place(i - 1) + (place(i) - place(i - 1)) * k)
  }
  /** a paragraph's opacity: coming up as it is glided to, full while read, dimmed once past, gone well above */
  function shown(j: number, time: number) {
    const i = readingAt(time)
    if (j > i) return 0
    const k = ramp(time, SAID[i] - GLIDE, SAID[i])
    if (j === i) return k
    const was = j === i - 1 ? 1 - 0.6 * k : 0.4
    return j < i - 2 ? 0 : j === i - 2 ? 0.4 * (1 - k) : was
  }

  // ── a controller: Cross, Circle, Options or Share (as padnav.ts numbers them) skips
  const PAD_SKIP = [0, 1, 8, 9]
  let padWas: number[] = []
  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : []
    const down: number[] = []
    for (const pad of pads) if (pad) pad.buttons.forEach((b, i) => b.pressed && down.push(i))
    const pressed = PAD_SKIP.some((i) => down.includes(i) && !padWas.includes(i))
    if (pressed && !begun && !still) begin()
    else if (pressed && canSkip) finish()
    padWas = down
  }

  /** Escape, Enter or Space skips; no key reaches the game behind while the story is up */
  function onKey(e: KeyboardEvent) {
    e.stopPropagation()
    if (e.key === 'Escape' || e.key === 'Enter' || (e.key === ' ' && !still)) {
      e.preventDefault()
      if (!begun && !still) {
        if (e.key !== 'Escape') begin()
      } else if (canSkip) finish()
    }
  }
  /** a tap or click anywhere but a button skips (not on the still page, which is scrolled) */
  function onTap(e: PointerEvent) {
    if (still || !begun || !canSkip || (e.target as HTMLElement | null)?.closest('button')) return
    finish()
  }

  onMount(() => {
    still = !moving()
    // (the still page has nothing to wait for; nor has the story told again with the sound already on)
    if (still || audio()) begun = true
    fit()
    requestAnimationFrame(() => (skyUp = true))
    let ready = still
    void document.fonts.ready.then(() => {
      measure()
      ready = true
    })
    window.addEventListener('resize', fit)
    window.addEventListener('keydown', onKey, true)
    // (the opening is told before the title's buttons take the focus: the keys stay with the story, and go to Skip
    // when it comes)
    const focus = window.setTimeout(() => (beginButton ?? skip ?? box)?.focus({ preventScroll: true }), 50)
    let last = performance.now()
    let said = 0
    preload(LINES.map((l) => l.id))
    let frame = requestAnimationFrame(function tick(now) {
      frame = requestAnimationFrame(tick)
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      readPad()
      const on = audio() !== null
      if (on !== heard) {
        heard = on
        if (on) preload(LINES.map((l) => l.id))
        // (the sound let on while the opening line is up: the line begins again, so he says it; the first press is
        // what lets the sound on, so without this the game's first words were never heard)
        if (on && t < T.name) {
          t = Math.min(t, T.line)
          said = 0
        }
      }
      if (!ready || still || !begun) return
      t += dt
      // (each of the narrator's lines once, as its moment comes: from its start, or a moment in, or not at all)
      while (said < LINES.length && t >= LINES[said].at) {
        if (!leaving) speak(LINES[said].id, t - LINES[said].at)
        said++
      }
      if (t >= total) finish()
    })
    return () => {
      hush()
      cancelAnimationFrame(frame)
      window.clearTimeout(focus)
      window.removeEventListener('resize', fit)
      window.removeEventListener('keydown', onKey, true)
    }
  })

  const lineA = $derived(ramp(t, T.line, T.line + 0.8) * (1 - ramp(t, T.lineOut, T.lineOut + 0.8)))
  const nameA = $derived(1 - ramp(t, T.nameOut, T.nameOut + 1.2))
  const ruleA = $derived(ramp(t, T.name + 1.2, T.name + 2.2))
  const veilA = $derived(ramp(t, T.crawl - 1, T.crawl + 2))
  const skipA = $derived(still ? 1 : ramp(t, T.skipFrom, T.skipFrom + 0.6))
  let box = $state<HTMLDivElement>()
  $effect(() => {
    if (skip && !still) skip.focus({ preventScroll: true })
  })
</script>

<div
  bind:this={box}
  class="intro fixed inset-0 z-[80] overflow-hidden bg-black text-ink select-none"
  style="height: 100dvh; opacity: {leaving ? 0 : 1}; transition: opacity {still ? 60 : T.out * 1000}ms linear"
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="The story so far"
  onpointerup={onTap}
>
  <!-- the sky, and its two fields of stars drifting at their own paces -->
  <div
    class="pointer-events-none absolute inset-0"
    style="opacity: {still || skyUp ? 1 : 0}; transition: opacity {still ? 0 : 1400}ms linear"
  >
    <img
      src={asset('ui/intro-sky.png' as Parameters<typeof asset>[0])}
      alt=""
      class="absolute max-w-none"
      style="left: {skyX}px; top: {skyY}px; width: {skyW}px; height: {skyH}px; image-rendering: pixelated"
      draggable="false"
    />
    {#each [{ src: 'ui/intro-stars-far.png', x: farX }, { src: 'ui/intro-stars.png', x: nearX }] as layer (layer.src)}
      <div
        class="absolute inset-0"
        style="background: url({asset(
          layer.src as Parameters<typeof asset>[0],
        )}) {layer.x}px {skyY}px / {skyW}px {skyH}px repeat-x; image-rendering: pixelated"
      ></div>
    {/each}
    <!-- (the sky a little dimmed under the opening line and the name (more under the still page's words), and a veil
    darker in the middle, where the words are read, over the galaxy's bright band) -->
    <div class="absolute inset-0 bg-[#05071a]" style="opacity: {still ? 0.62 : 0.3}"></div>
    <div
      class="absolute inset-0"
      style="opacity: {still
        ? 1
        : veilA}; background: radial-gradient(ellipse 60% 55% at 50% 55%, #05071ae0, #05071a99 55%, #05071a00 90%), #05071a40"
    ></div>
  </div>

  {#if still}
    <!-- Reduce motion: the story as a page, read at leisure -->
    <div class="absolute inset-0 overflow-y-auto px-4 pt-[max(20px,env(safe-area-inset-top))] pb-28">
      <article class="mx-auto flex max-w-[36rem] flex-col items-center gap-5 text-center">
        <p class="ui-head leading-[1.4] text-ink-dim">{OPENING}</p>
        <h1
          class="pixel-text text-[42px] leading-[1.1] uppercase [@media(min-height:520px)]:text-[84px]"
          style="text-shadow: 0.143em 0.143em 0 #2a1840"
        >
          <img src={asset('brand/wordmark-1x.png')} alt="Xenophon: Twin Stars" width="314" height="56" class="wordmark" />
        </h1>
        {#each STORY as p, i (i)}
          {#if p.mark}<Emblem side={p.mark} size={32} />{/if}
          <p class="ui-body">
            {#each runsOf(p.text) as r, j (j)}<span style="color: {colourOf(r.side)}">{r.words}</span>{/each}
          </p>
        {/each}
        <button type="button" class="{main} min-w-[12rem]" onclick={finish}>Continue</button>
      </article>
    </div>
  {:else}
    {#if !begun}
      <!-- Begin: the press that lets the sound on, and the story starts (art/mockups/intro-begin.png) -->
      <div class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-4 pb-[4vh]">
        <button bind:this={beginButton} type="button" class="ui-btn begin" onclick={begin}>
          <UiIcon name="sound" size={32} />
          <span class="flex-1 text-center">Begin</span>
        </button>
        <p class="ui-label text-center" style="text-shadow: {EDGED}">Sound on: the story is read aloud</p>
      </div>
    {/if}
    <!-- the opening and the name as text, for a screen reader: the story's own words are text below -->
    <div class="sr-only">
      <p>{OPENING}</p>
      <h1>Xenophon: Twin Stars</h1>
    </div>

    <!-- the story: the paragraph being read held in the middle, the column gliding up between paragraphs -->
    <div
      class="pointer-events-none absolute inset-0"
      style="mask-image: linear-gradient(to bottom, transparent 4%, #000 30%); -webkit-mask-image: linear-gradient(to bottom, transparent 4%, #000 30%)"
    >
      <div
        bind:this={column}
        class="absolute inset-x-0 top-0 mx-auto flex max-w-[min(42rem,88vw)] flex-col items-center gap-[1.2em] px-4 text-center"
        style="transform: translateY({columnAt(t)}px)"
      >
        {#each STORY as p, j (j)}
          <div class="flex flex-col items-center gap-3" style="opacity: {shown(j, t)}">
            {#if p.mark}<Emblem side={p.mark} size={32} />{/if}
            <p class="ui-head leading-[1.5]" style="text-shadow: {EDGED}">
              {#each runsOf(p.text) as r, k (k)}<span style="color: {colourOf(r.side)}">{r.words}</span>{/each}
            </p>
          </div>
        {/each}
      </div>
    </div>

    <!-- the opening line, alone in the dark -->
    <p
      class="ui-head pointer-events-none absolute inset-x-0 top-1/2 mx-auto max-w-[min(30rem,88vw)] -translate-y-1/2 px-4 text-center leading-[1.45] text-ink"
      style="opacity: {lineA}; text-shadow: {EDGED}"
      aria-hidden="true"
    >
      {OPENING}
    </p>

    <!-- the name: the wordmark (static/brand/), uncovered left to right as it comes on -->
    {#if t < T.nameOut + 1.3}
      <div
        class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 px-4 pb-[4vh]"
        style="opacity: {nameA}"
        aria-hidden="true"
      >
        <img
          src={asset('brand/wordmark-1x.png')}
          alt=""
          width="314"
          height="56"
          class="wordmark"
          style="opacity: {lit(t)}; clip-path: inset(0 {(1 - uncovered(t)) * 100}% 0 0)"
        />
        <!-- (a rule under it, violet under the one word and gold under the other, drawn out from the middle) -->
        <span class="flex h-[6px] w-[min(30rem,76vw)] justify-center" style="opacity: {ruleA}">
          <span class="h-full" style="width: {50 * ruleA}%; background: {FACTIONS.anarchoi.colour}"></span>
          <span class="h-full" style="width: {50 * ruleA}%; background: {FACTIONS.nomarchy.colour}"></span>
        </span>
      </div>
    {/if}
  {/if}

  <!-- the sound waits for a first press: this lets it on without ending the story -->
  {#if !heard && begun}
    <button
      type="button"
      class="{quiet} absolute bottom-[max(12px,env(safe-area-inset-bottom))] left-[max(12px,env(safe-area-inset-left))] gap-2 bg-night/70"
      aria-label="Sound on"
    >
      <UiIcon name="music" size={32} />
    </button>
  {/if}
  {#if canSkip}
    <button
      bind:this={skip}
      type="button"
      class="{quiet} absolute right-[max(12px,env(safe-area-inset-right))] bottom-[max(12px,env(safe-area-inset-bottom))] bg-night/70"
      style="opacity: {skipA}"
      onclick={finish}
    >
      {still ? 'Close' : 'Skip'}
    </button>
  {/if}
</div>

<style>
  /* Begin: wide, in the night's blue, a double rule of gold round it and a soft glow (art/mockups/intro-begin.png) */
  .begin {
    min-width: min(22rem, 84vw);
    min-height: 76px;
    padding: 0 24px;
    gap: 16px;
    font-size: var(--text-head);
    color: #f2c14e;
    background: #0d1640;
    border: 3px solid #f2c14e;
    box-shadow:
      inset 0 0 0 3px #0d1640,
      inset 0 0 0 5px #b8862a,
      0 0 0 3px #3a2410,
      0 0 28px 6px rgb(242 193 78 / 0.35);
  }
  .begin:hover,
  .begin:focus-visible {
    color: #ffe08a;
    background: #142057;
    border-color: #ffd76a;
    box-shadow:
      inset 0 0 0 3px #142057,
      inset 0 0 0 5px #d9a43a,
      0 0 0 3px #3a2410,
      0 0 36px 10px rgb(242 193 78 / 0.5);
  }
  .begin:active {
    background: #0a1033;
  }
  /* the wordmark at its own pixels, doubled where there is room: never a fraction, so its pixels stay square */
  .wordmark {
    display: block;
    width: 314px;
    height: 56px;
    image-rendering: pixelated;
  }
  @media (min-width: 720px) and (min-height: 520px) {
    .wordmark {
      width: 628px;
      height: 112px;
    }
  }
</style>
