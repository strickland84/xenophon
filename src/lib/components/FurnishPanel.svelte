<script lang="ts">
  // Aboard his own ship: the furniture he has bought and not yet placed. A piece chosen follows him
  // (in front of where he faces), shown green where it can stand; Use puts it down. Use by a piece
  // already placed takes it up again.
  import { FURNITURE } from '../engine'
  import type { Totals } from '../save/property'
  import { furnitureLeft } from '../save/ships'
  import type { ShipRecord } from '../save/ships'
  import Panel from './Panel.svelte'
  import { uiPicture } from './items'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    ships: ShipRecord[]
    totals: Totals
    placing: string
    onplace: (id: string) => void
    onclose: () => void
    /** other pilots may come aboard her, and that changed */
    open: boolean
    onopen: (open: boolean) => void
  }
  let { ships, totals, placing, onplace, onclose, open, onopen }: Props = $props()
  const left = $derived(FURNITURE.map((f) => ({ ...f, n: furnitureLeft(totals, ships, f.id) })).filter((f) => f.n > 0))
</script>

<Panel title="Furnish" sub="Your ship's rooms" label="Furnish" size="narrow" {onclose}>
  {#snippet lead()}
    <UiIcon name="furniture" size={32} />
  {/snippet}
  <div class="ui-settle flex flex-col gap-4">
    {#if left.length}
      <div class="grid grid-cols-3 gap-2" style="--i: 0">
        {#each left as f (f.id)}
          <button
            type="button"
            class="ui-row flex-col justify-center gap-1 py-2"
            class:is-on={placing === f.id}
            aria-label="{f.name} · {f.n}"
            onclick={() => {
              onplace(placing === f.id ? '' : f.id)
              onclose()
            }}
            use:tip={{ title: f.name, line: 'Walk to where it should stand and press Action', note: 'Action by a piece takes it up again' }}
          >
            <img
              src={uiPicture(`furn-${f.id}`)}
              alt=""
              width="72"
              height="72"
              style="image-rendering: pixelated"
              class="-my-2 [@media(max-height:420px)]:my-0 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12"
            />
            <span class="text-center leading-none">{f.name}</span>
            <span class="ui-label ui-num">{f.n}</span>
          </button>
        {/each}
      </div>
    {:else}
      <div
        class="flex items-center gap-3 border-2 border-dashed border-ink/20 px-4 py-4"
        style="--i: 0"
        use:tip={{ title: 'Furniture', line: 'Sold at the station deck’s shop', note: 'Action by a piece takes it up again' }}
      >
        <UiIcon name="furniture" size={32} />
        <span class="ui-body text-ink-dim">Nothing to place: the deck's shop sells it</span>
      </div>
    {/if}
    <button
      type="button"
      class="ui-btn self-start"
      class:is-on={open}
      aria-pressed={open}
      style="--i: 1"
      onclick={() => onopen(!open)}
      use:tip={{ title: 'Open ship', line: 'Pilots of your side may come aboard' }}
      >{open ? '■ Open to your side' : 'Open to your side'}</button
    >
  </div>
</Panel>
