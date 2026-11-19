<script lang="ts">
  // Draws the page's one tooltip (tooltip.svelte.ts): a small panel in the game's style, its title in its
  // colour, a short line, figures as bars and numbers (green better, red worse than what he has), what it
  // costs. Above the thing it belongs to when there is room, else below; always kept on the screen.
  import { tipNow } from './tooltip.svelte'

  let box = $state<HTMLElement>()
  let w = $state(0)
  let h = $state(0)
  const MARGIN = 8

  const place = $derived.by(() => {
    const r = tipNow.rect
    if (!r || !w) return { x: -9999, y: -9999, below: false }
    const W = innerWidth
    const H = innerHeight
    // (above, or else beside)
    let below = r.top - h - MARGIN < MARGIN
    let y = below ? r.bottom + MARGIN : r.top - h - MARGIN
    if (below && y + h > H - MARGIN) {
      // no room above or below: beside it, on the side with more room
      below = false
      y = Math.max(MARGIN, Math.min(H - h - MARGIN, r.top + r.height / 2 - h / 2))
      const right = W - r.right > r.left
      return { x: right ? r.right + MARGIN : Math.max(MARGIN, r.left - w - MARGIN), y, below }
    }
    const x = Math.max(MARGIN, Math.min(W - w - MARGIN, r.left + r.width / 2 - w / 2))
    return { x, y: Math.max(MARGIN, Math.min(H - h - MARGIN, y)), below }
  })
  const c = $derived(tipNow.content)
</script>

{#if c}
  {#key tipNow.n}
    <div
      bind:this={box}
      bind:clientWidth={w}
      bind:clientHeight={h}
      class="tip pointer-events-none fixed z-50 flex max-w-[min(26rem,calc(100vw-16px))] flex-col gap-2 border-2 border-ink/30 bg-[#070b1a]/97 px-3 pt-2.5 pb-3 text-ink"
      class:below={place.below}
      style="left: {place.x}px; top: {place.y}px"
      role="tooltip"
    >
      <div class="flex items-center gap-2">
        {#if c.icon}<img src={c.icon} alt="" width="32" height="32" style="image-rendering: pixelated" />{/if}
        <span class="ui-head" style:color={c.colour ?? null}>{c.title}</span>
      </div>
      {#if c.line}<p class="ui-body text-ink/90">{c.line}</p>{/if}
      {#if c.stats?.length}
        <div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5">
          {#each c.stats as s (s.label)}
            <span class="ui-label flex items-center gap-1.5 whitespace-nowrap">
              {#if s.icon}<img src={s.icon} alt="" width="24" height="24" style="image-rendering: pixelated" />{/if}{s.label}
            </span>
            {#if s.bar !== undefined}
              <span class="relative h-2.5 min-w-16 bg-black/50">
                <span class="absolute inset-y-0 left-0 bg-ink/80" style="width: {Math.round(Math.max(0, Math.min(1, s.bar)) * 100)}%"
                ></span>
              </span>
            {:else}<span></span>{/if}
            <span class="ui-body ui-num text-right whitespace-nowrap {s.tone === 'good' ? 'text-ok' : s.tone === 'bad' ? 'text-foe' : ''}">
              {s.value ?? ''}
            </span>
          {/each}
        </div>
      {/if}
      {#if c.cost}<p class="ui-body text-nomarchy">{c.cost}</p>{/if}
      {#if c.note}<p class="ui-label">{c.note}</p>{/if}
    </div>
  {/key}
{/if}

<style>
  .tip {
    animation: tip-in 120ms cubic-bezier(0.16, 1, 0.3, 1) both;
    box-shadow: 0 6px 18px rgb(0 0 0 / 0.45);
  }
  .tip.below {
    animation-name: tip-in-below;
  }
  @keyframes tip-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }
  @keyframes tip-in-below {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
