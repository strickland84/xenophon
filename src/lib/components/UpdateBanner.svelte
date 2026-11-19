<script lang="ts">
  // An old build, said plainly (the plan's section 23, "old builds"): the site has a newer version, or
  // pilots on the relays are flying one this build cannot meet in a room. Reload (the pilot is saved
  // first) or carry on for now.
  interface Props {
    /** the site has a newer build, or pilots fly one (their wire's version) */
    why: 'site' | 'pilots'
    onreload: () => void
    onlater: () => void
  }
  let { why, onreload, onlater }: Props = $props()
  const small = 'ui-btn ui-btn-small'
  const mine = (e: Event) => e.stopPropagation()
</script>

<div
  class="pointer-events-none absolute inset-x-0 bottom-[max(8px,env(safe-area-inset-bottom))] z-30 flex justify-center px-3"
  role="alert"
>
  <div
    class="pointer-events-auto flex max-w-[44rem] flex-wrap items-center gap-3 border-2 border-dashed border-nomarchy bg-[#0b1023]/95 px-3 py-2"
  >
    <span class="ui-head text-nomarchy" aria-hidden="true">!</span>
    <p class="ui-body min-w-0 flex-1">
      {why === 'site' ? 'A newer version is out' : 'Pilots fly a newer version'}
      <span class="text-ink-dim">· your pilot is saved first</span>
    </p>
    <button type="button" class="{small} ui-btn-main" onclick={onreload} onpointerdown={mine}>Reload</button>
    <button type="button" class={small} onclick={onlater} onpointerdown={mine}>Later</button>
  </div>
</div>
