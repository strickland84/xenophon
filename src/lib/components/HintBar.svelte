<script lang="ts">
  // The help: how to fly (or walk) here, as a few key caps with a word each, the most used controls only
  // (Settings lists them all). It sits at the very bottom of the view, always (James, 2026-11-18: across the top it
  // covered a world's name in the cockpit), between the HUD's bottom corners, or the touch buttons' columns on a touch screen; it comes in from
  // below, and fades away once it has been read; the whole sentence is what a screen reader hears.
  import type { HintChip } from '../input/hints'

  interface Props {
    /** the whole help, in words (for screen readers) */
    text: string
    chips: HintChip[]
    visible: boolean
    /** the touch buttons are shown: kept between their columns */
    thumbs?: boolean
  }
  let { text, chips, visible, thumbs = false }: Props = $props()
</script>

<div
  class="hint pointer-events-none absolute inset-x-0 bottom-[max(8px,env(safe-area-inset-bottom))] flex justify-center {thumbs
    ? 'px-[150px]'
    : 'px-[max(16px,13vw)]'}"
  class:shown={visible}
  role="note"
  aria-label={text}
>
  <p class="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 bg-[#060a18]/60 px-4 py-2" aria-hidden="true">
    {#each chips as c (c.key + c.does)}
      <span class="flex items-center gap-2 whitespace-nowrap">
        <span class="ui-key">{c.key}</span>
        <span class="ui-body text-ink/90">{c.does}</span>
      </span>
    {/each}
  </p>
</div>

<style>
  .hint {
    opacity: 0;
    transform: translateY(8px);
    transition:
      opacity 700ms ease-out,
      transform 700ms ease-out;
  }
  .hint.shown {
    opacity: 1;
    transform: none;
    transition-duration: 240ms;
  }
</style>
