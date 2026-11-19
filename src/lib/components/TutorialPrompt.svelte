<script lang="ts">
  // The guided first sortie's prompt (lib/tutorial/tutorial.ts), after art/mockups/tutorial-2.png:
  // one small dark box under the row at the top, in the side's colour with a hard edge, holding one
  // short line (and a quieter one under it), a pip for each step (done ones filled, this one
  // marked), and Skip and End. A line about getting back on (shot down, inside …) has a dashed edge
  // and a "!" so it is told apart without its colour. The same box, marked TIP, carries the
  // one-line tips that come later, and closes itself.
  import type { Prompt } from '../tutorial/tutorial'

  interface Props {
    /** the step's prompt (null: a tip instead) */
    prompt?: Prompt | null
    /** a tip's line, when there is no prompt */
    tip?: string
    /** the side's colour */
    colour: string
    onskip?: () => void
    onend?: () => void
    onclose?: () => void
    /** sit at the bottom, over the help: inside the hangar and the deck, which are seen whole, the top is their stations */
    bottom?: boolean
  }
  let { prompt = null, tip = '', colour, onskip, onend, onclose, bottom = false }: Props = $props()

  const small = 'ui-btn ui-btn-small pointer-events-auto text-ink-dim'
  // (the buttons keep their touches from the scene under them)
  const mine = (e: Event) => e.stopPropagation()
</script>

<div
  class="pointer-events-none absolute inset-x-0 z-[5] flex justify-center px-3 {bottom
    ? 'bottom-[calc(max(6px,env(safe-area-inset-bottom))+4.4rem)]'
    : 'top-[calc(max(6px,env(safe-area-inset-top))+2.6rem)]'}"
  role="status"
  aria-live="polite"
  data-prompt={prompt?.step ?? 'tip'}
>
  <div
    class="box menu flex max-w-[44rem] min-w-0 flex-col gap-2 border-2 bg-[#0b1023]/92 px-3 py-2.5"
    style="border-color: {colour}; border-style: {prompt?.detour ? 'dashed' : 'solid'}; box-shadow: 0 6px 18px rgb(0 0 0 / 0.4)"
  >
    <div class="flex items-start gap-2">
      {#if prompt?.detour}
        <span class="ui-body shrink-0" style="color: {colour}" aria-hidden="true">!</span>
      {:else if !prompt}
        <span class="ui-body shrink-0" style="color: {colour}">Tip</span>
      {/if}
      {#key prompt ? prompt.text : tip}<p class="line ui-body min-w-0 flex-1">{prompt ? prompt.text : tip}</p>{/key}
      {#if prompt}
        <button type="button" class={small} onclick={onskip} onpointerdown={mine} onpointerup={mine} aria-label="Skip this step"
          >Skip</button
        >
        <button type="button" class={small} onclick={onend} onpointerdown={mine} onpointerup={mine} aria-label="End the first sortie"
          >End</button
        >
      {:else}
        <button type="button" class={small} onclick={onclose} onpointerdown={mine} onpointerup={mine} aria-label="Dismiss the tip">x</button
        >
      {/if}
    </div>
    {#if prompt}
      <div class="flex items-center gap-2">
        <!-- a pip for each step: filled once done, this one in the side's colour (and taller), the rest hollow -->
        <span class="flex items-end gap-[3px]" aria-label="Step {prompt.index + 1} of {prompt.of}">
          {#each Array.from({ length: prompt.of }, (_, i) => i) as i (i)}
            <span
              class="block w-[8px] border-2 transition-all duration-300"
              style="height: {i === prompt.index ? 14 : 8}px; border-color: {i <= prompt.index ? colour : '#b8b4a466'}; background: {i <
              prompt.index
                ? colour
                : 'transparent'}"
            ></span>
          {/each}
        </span>
        {#if prompt.sub}<span class="ui-label min-w-0">{prompt.sub}</span>{/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* a new step's words come in, so the change is seen */
  .box {
    animation: box-in 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .line {
    animation: line-in 200ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes box-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
  }
  @keyframes line-in {
    from {
      opacity: 0;
      transform: translateX(6px);
    }
  }
</style>
