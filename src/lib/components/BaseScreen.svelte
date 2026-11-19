<script lang="ts">
  // The base's screen (Tab, the D-pad's up, or the Bag button), after art/mockups/inventory.png
  // and shop.png: the ship's hold and the vault side by side, and, landed at a friendly base,
  // the market (sell from the vault at today's prices), supplies (repairs, missiles), parts and
  // paint. Away from a base it only shows the hold and the vault. Everything is a button, so a
  // tap, a click, the keys or a controller (padnav.ts) work it; nothing is dragged.
  import { asset } from '$app/paths'
  import { RESOURCES, SHOP } from '../engine'
  import type { BaseOwner, ResourceId, Stack } from '../engine'
  import { inVault } from '../save/property'
  import type { Totals } from '../save/property'
  import Count from './Count.svelte'
  import Emblem from './Emblem.svelte'
  import Panel from './Panel.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    /** the base landed at (null: in flight), and whether trading there is allowed (a friendly base) */
    base: { name: string; owner: BaseOwner; capital: boolean; friendly: boolean } | null
    totals: Totals
    hold: (Stack | null)[]
    /** today's prices here, and how each moved since yesterday */
    prices: { id: ResourceId; price: number; change: number }[]
    ship: {
      hullLeft: number
      hullPoints: number
      missiles: number
      missilesMax: number
      fee: number
    }
    onclose: () => void
    /** a slot of the hold into the vault; a stack of a resource from the vault into the hold */
    onunload: (slot: number) => void
    onload: (id: ResourceId) => void
    onsell: (id: ResourceId, n: number, price: number) => void
    onrepair: (cost: number) => void
    onmissiles: (n: number) => void
    /** into the hangar (landed at a friendly base: its bench, booth and vault), if he can go now */
    onhangar?: () => void
    /** docked at a station in space (not landed on a world) */
    station?: boolean
  }
  let {
    base,
    totals,
    hold,
    prices,
    ship,
    onclose,
    onunload,
    onload,
    onsell,
    onrepair,
    onmissiles,
    onhangar,
    station = false,
  }: Props = $props()

  type Tab = 'hold' | 'market' | 'supplies'
  let tab = $state<Tab>('hold')
  const trading = $derived(!!base?.friendly)
  const used = $derived(hold.filter((s) => !!s).length)
  const repairCost = $derived(Math.ceil((1 - ship.hullLeft) * ship.hullPoints * SHOP.repair))
  // (the icons, cut from the image model's sheet by tools/voxel/prefabs.py)
  const icon = (id: string) => asset(`icons/${id}.png` as Parameters<typeof asset>[0])
  const roomFor = (id: ResourceId) => hold.reduce((n, s) => n + (!s ? RESOURCES[id].stack : s.id === id ? RESOURCES[id].stack - s.n : 0), 0)

  const tabItems = $derived([
    { id: 'hold' as Tab, label: 'Hold', icon: 'hold' },
    { id: 'market' as Tab, label: 'Market', icon: 'market', disabled: !trading },
    { id: 'supplies' as Tab, label: 'Supplies', icon: 'supplies', disabled: !trading },
  ])
  const kind = $derived(base ? (base.owner ? (base.capital ? 'Capital' : 'Base') : 'Outpost') + (base.friendly ? '' : ' · enemy') : '')
  const nameOf = (id: ResourceId) => RESOURCES[id].name
  // the place's own picture over the hold (the image model's, tools/gen/interface.py): a side's base on its world, a
  // lone outpost, or, docked in space, the side's home station
  const picture = $derived(
    !base
      ? ''
      : station
        ? `ui/home-${base.owner || 'nomarchy'}.png`
        : base.owner
          ? `ui/home-base-${base.owner}.png`
          : 'ui/home-base-outpost.png',
  )
</script>

<Panel title={base ? base.name : 'In flight'} sub={kind} credits={totals.credits} label="Base" {onclose}>
  {#snippet lead()}
    {#if base?.owner}<Emblem side={base.owner} size={32} />{/if}
  {/snippet}
  {#snippet tabs()}
    <Tabs items={tabItems} value={tab} onchange={(t) => (tab = t)} label="Base screens" />
  {/snippet}
  {#snippet foot()}
    {#if !trading}
      <span class="ui-label">Land at a friendly base to trade</span>
    {/if}
    {#if onhangar}
      <button type="button" class="ui-btn ml-auto" onclick={onhangar}><UiIcon name="ships" size={32} />Hangar</button>
    {/if}
  {/snippet}

  {#key tab}
    {#if tab === 'hold'}
      {#if picture}
        <div class="ui-settle relative -mt-1 mb-4 h-36 overflow-hidden border-2 border-ink/15 max-sm:h-16" style="--i: 0">
          <!-- (each of its pixels a whole number of CSS pixels, three across a laptop's panel and two on a phone: a strip of it
          across the middle) -->
          <img
            src={asset(picture as Parameters<typeof asset>[0])}
            alt=""
            width="768"
            height="432"
            class="absolute top-1/2 left-1/2 h-[432px] w-[768px] max-w-none -translate-x-1/2 -translate-y-[56%] max-sm:h-[288px] max-sm:w-[512px]"
            style="image-rendering: pixelated"
          />
          <div class="absolute inset-0 bg-gradient-to-r from-[#0b1023]/70 to-transparent"></div>
        </div>
      {/if}
      <div class="ui-settle flex flex-wrap items-start gap-x-8 gap-y-5">
        <div class="flex flex-col gap-2" style="--i: 0">
          <h3 class="ui-label flex items-center gap-2">
            Hold <span class="ui-num text-ink">{used}/{hold.length}</span>
          </h3>
          <div class="grid grid-cols-4 gap-2">
            {#each hold as s, i (i)}
              <button
                type="button"
                class="ui-well"
                disabled={!s || !trading}
                aria-label={s ? `${s.n} ${nameOf(s.id)}: into the vault` : 'Empty slot'}
                onclick={() => onunload(i)}
                use:tip={s
                  ? {
                      title: nameOf(s.id),
                      icon: icon(s.id),
                      stats: [{ label: 'Carried', value: String(s.n) }],
                      note: trading ? 'Tap: into the vault' : 'Lost with the ship',
                    }
                  : null}
              >
                {#if s}
                  <img src={icon(s.id)} alt="" width="32" height="32" style="image-rendering: pixelated" />
                  <span class="ui-label ui-num absolute right-1 bottom-1 text-ink">{s.n}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-2" style="--i: 1">
          <h3 class="ui-label">Vault</h3>
          {#if totals.vault.length === 0}
            <div class="flex min-h-[64px] items-center gap-3 border-2 border-dashed border-ink/20 px-4">
              <UiIcon name="hold" size={32} />
              <span class="ui-body text-ink-dim">Empty: mine ore and land here</span>
            </div>
          {:else}
            <div class="flex flex-wrap gap-2">
              {#each totals.vault as s (s.id)}
                <button
                  type="button"
                  class="ui-well"
                  disabled={!trading || roomFor(s.id) === 0}
                  aria-label="{s.n} {nameOf(s.id)}: a stack into the hold"
                  onclick={() => onload(s.id)}
                  use:tip={{
                    title: nameOf(s.id),
                    icon: icon(s.id),
                    stats: [{ label: 'In the vault', value: String(s.n) }],
                    note: trading ? (roomFor(s.id) ? 'Tap: a stack into the hold' : 'No room in the hold') : 'Safe at every base',
                  }}
                >
                  <img src={icon(s.id)} alt="" width="32" height="32" style="image-rendering: pixelated" />
                  <span class="ui-label ui-num absolute right-1 bottom-1 text-ink"><Count value={s.n} /></span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    {:else if tab === 'market'}
      <div class="ui-settle flex flex-col gap-1.5">
        <div class="ui-label grid grid-cols-[2.5rem_1fr_4rem_3rem_4rem_14rem] items-center gap-3 px-3 max-sm:hidden" style="--i: 0">
          <span></span><span>Ore</span><span class="text-right">Price</span><span></span><span class="text-right">Held</span><span></span>
        </div>
        {#each prices as p, i (p.id)}
          {@const have = inVault(totals, p.id)}
          <div class="ui-row grid grid-cols-[2.5rem_1fr_4rem_3rem_4rem_14rem] gap-3" style="--i: {i + 1}">
            <img src={icon(p.id)} alt="" width="32" height="32" style="image-rendering: pixelated" />
            <span class="truncate">{nameOf(p.id)}</span>
            <span
              class="ui-num text-right text-nomarchy"
              use:tip={{ title: `${p.price} a unit`, line: 'Today, here. Prices drift by the day and the world.' }}>{p.price}</span
            >
            <span class="ui-num text-right {p.change > 0 ? 'text-ok' : p.change < 0 ? 'text-foe' : 'text-ink-dim'}"
              >{p.change > 0 ? `+${p.change}` : p.change < 0 ? p.change : '='}</span
            >
            <span class="ui-num text-right {have ? '' : 'text-ink-dim'}"><Count value={have} /></span>
            <span class="flex justify-end gap-1.5">
              <button type="button" class="ui-btn ui-btn-small" disabled={have < 1} onclick={() => onsell(p.id, 1, p.price)}>Sell 1</button>
              <button
                type="button"
                class="ui-btn ui-btn-small min-w-[6.5rem]"
                disabled={have < 1}
                onclick={() => onsell(p.id, have, p.price)}>All{have > 0 ? ` ${have * p.price}` : ''}</button
              >
            </span>
          </div>
        {/each}
      </div>
    {:else if tab === 'supplies'}
      <div class="ui-settle flex flex-col gap-2">
        <div
          class="ui-row flex-wrap"
          style="--i: 0"
          use:tip={{
            title: 'Hull',
            stats: [{ label: 'Left', value: `${Math.round(ship.hullLeft * ship.hullPoints)} / ${ship.hullPoints}`, bar: ship.hullLeft }],
            note:
              ship.fee > 0
                ? `A lost ship of this hull costs ${ship.fee}; its hold is lost with it`
                : 'A lost ship of this hull is free; its hold is lost with it',
          }}
        >
          <span class="w-28">Hull</span>
          <span class="ui-meter min-w-24 flex-1" aria-hidden="true">
            <span
              style="transform: scaleX({ship.hullLeft}); background: {ship.hullLeft > 0.6
                ? '#70e27c'
                : ship.hullLeft > 0.3
                  ? '#fad246'
                  : '#ff5446'}"
            ></span>
          </span>
          <span class="ui-num w-14 text-right">{Math.round(ship.hullLeft * 100)}%</span>
          <button
            type="button"
            class="ui-btn ui-btn-small min-w-[8rem]"
            disabled={repairCost <= 0 || totals.credits < repairCost}
            onclick={() => onrepair(repairCost)}>{repairCost > 0 ? `Repair ${repairCost}` : 'Hull whole'}</button
          >
        </div>
        <div class="ui-row flex-wrap" style="--i: 1">
          <span class="w-28">Missiles</span>
          <span class="flex flex-1 items-center gap-1.5" aria-label="{ship.missiles} of {ship.missilesMax}">
            {#each Array.from({ length: ship.missilesMax }, (_, i) => i) as i (i)}
              <span class="h-6 w-2.5 border-2 {i < ship.missiles ? 'border-foe bg-foe' : 'border-ink/30'}"></span>
            {/each}
          </span>
          <button
            type="button"
            class="ui-btn ui-btn-small"
            disabled={ship.missiles >= ship.missilesMax || totals.credits < SHOP.missile}
            onclick={() => onmissiles(1)}
            use:tip={{ title: 'One missile', cost: `${SHOP.missile} credits` }}>+1</button
          >
          <button
            type="button"
            class="ui-btn ui-btn-small min-w-[6.5rem]"
            disabled={ship.missiles >= ship.missilesMax || totals.credits < SHOP.missile * (ship.missilesMax - ship.missiles)}
            onclick={() => onmissiles(ship.missilesMax - ship.missiles)}
            >Fill{ship.missiles < ship.missilesMax ? ` ${SHOP.missile * (ship.missilesMax - ship.missiles)}` : ''}</button
          >
        </div>
      </div>
    {/if}
  {/key}
</Panel>
