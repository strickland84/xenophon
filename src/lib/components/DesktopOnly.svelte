<script lang="ts">
  // What a phone or a tablet is shown instead of the game (display/desktop.ts; after art/mockups/desktop-only.png): the
  // opening story's sky, the name, a desktop computer, what the game needs, and the way to its code. The game is for a
  // desktop with a mouse and a keyboard (James, 2026-11-19).
  import { asset } from '$app/paths'
  import { onMount } from 'svelte'
  import { SOURCE } from '../version'
  import { main } from './styles'

  /** the screen's size (CSS px), and the sky's scale (whole CSS px a pixel of it, so it covers the screen) */
  let vw = $state(390)
  let vh = $state(844)
  const SKY_W = 336
  const SKY_H = 144
  const k = $derived(Math.max(Math.ceil(vw / SKY_W), Math.ceil(vh / SKY_H)))
  onMount(() => {
    const fit = () => {
      vw = window.innerWidth
      vh = window.innerHeight
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  })
</script>

<div class="fixed inset-0 overflow-hidden bg-[#05071a] text-ink">
  <!-- the sky, a whole number of CSS px a pixel, its two suns either side of the middle -->
  <img
    src={asset('ui/intro-sky.png')}
    alt=""
    class="absolute max-w-none"
    style="left: {Math.round((vw - SKY_W * k) / 2)}px; top: {Math.round((vh - SKY_H * k) / 2)}px; width: {SKY_W * k}px; height: {SKY_H *
      k}px; image-rendering: pixelated"
    draggable="false"
  />
  <div class="absolute inset-0 bg-[#05071a]/55"></div>

  <!-- (on a short screen, a phone held sideways, closer together, and scrolled if it must be) -->
  <div class="absolute inset-0 overflow-y-auto">
    <main
      class="mx-auto flex min-h-full max-w-[34rem] flex-col items-center justify-center gap-4 px-4 py-[max(16px,env(safe-area-inset-top))] text-center [@media(min-height:560px)]:gap-7"
    >
      <h1>
        <img src={asset('brand/wordmark-1x.png')} alt="Xenophon: Twin Stars" width="314" height="56" class="wordmark" />
      </h1>
      <img src={asset('ui/desktop-24.png')} alt="" width="72" height="72" class="desktop block" style="image-rendering: pixelated" />
      <div class="flex flex-col gap-3">
        <p class="ui-body">Xenophon: Twin Stars is played with a mouse and a keyboard, on a screen bigger than this one.</p>
        <p class="ui-body text-ink-dim">Get a PC and come back. Until then, the code is on GitHub.</p>
      </div>
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve (a page off the site) -->
      <a class="{main} min-w-[14rem]" href={SOURCE} rel="noopener">The code on GitHub</a>
    </main>
  </div>
</div>

<style>
  /* the wordmark at its own pixels, never a fraction, so its pixels stay square */
  .wordmark {
    display: block;
    width: 314px;
    height: 56px;
    image-rendering: pixelated;
  }
  @media (max-height: 559px) {
    .desktop {
      width: 48px;
      height: 48px;
    }
  }
</style>
