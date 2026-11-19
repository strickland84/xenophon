<script lang="ts">
  // The station deck's shop: ships (each hull's role and stats, bought once and kept; his own to fly
  // from here), gear worn on foot (one of each slot; bought once, kept), and furniture for his ship's
  // rooms (bought by the piece, placed aboard). Weapons and modules are at the hangar's bench, the
  // market and the vault at the base's screen.
  import { FURNITURE, GEAR, HULL_NAMES, HULL_PRICES, MODULE_SLOTS, payFor, statsOf } from '../engine'
  import type { GearSlot, ResourceId } from '../engine'
  import { inVault } from '../save/property'
  import type { Totals } from '../save/property'
  import { furnitureLeft, ownsHull } from '../save/ships'
  import type { ShipRecord } from '../save/ships'
  import { itemTip, priceWords, uiPicture } from './items'
  import Panel from './Panel.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'
  import type { TipStat } from './tooltip.svelte'

  interface Props {
    ships: ShipRecord[]
    flying: string
    gear: string[]
    totals: Totals
    onclose: () => void
    onbuyhull: (hull: string) => void
    onfly: (id: string) => void
    onbuygear: (id: string) => void
    onwear: (id: string) => void
    onbuyfurniture: (id: string) => void
  }
  let { ships, flying, gear, totals, onclose, onbuyhull, onfly, onbuygear, onwear, onbuyfurniture }: Props = $props()

  type Tab = 'ships' | 'gear' | 'furniture'
  let tab = $state<Tab>('ships')
  /** a ship to buy, picked and not yet bought: its card and the Buy button at the foot (one press on a tile spent
   * thousands at once, with no look at what it was) */
  let picked = $state<string | null>(null)
  /** what a price comes to now: the ore his vault lacks made up at the counter (data/shop.ts payFor) */
  const now = (credits: number, needs: { id: ResourceId; n: number }[]) => payFor(credits, needs, (id) => inVault(totals, id)).credits
  const can = (credits: number, needs: { id: ResourceId; n: number }[]) => totals.credits >= now(credits, needs)
  const price = (credits: number, needs: { id: ResourceId; n: number }[]) => priceWords(credits, needs, now(credits, needs))
  const flown = $derived(statsOf(ships.find((x) => x.id === flying)?.hull ?? 'corsair'))
  /** a hull's tooltip: its role, and its figures against the ship he flies now */
  function hullTip(hull: string, cost?: string) {
    const st = statsOf(hull)
    const vs = (a: number, b: number): TipStat['tone'] => (a > b + 1e-6 ? 'good' : a < b - 1e-6 ? 'bad' : undefined)
    const stats: TipStat[] = [
      { label: 'Speed', value: `${Math.round(st.speed * 100)}%`, bar: st.speed / 1.3, tone: vs(st.speed, flown.speed) },
      { label: 'Turn', value: `${Math.round(st.agility * 100)}%`, bar: st.agility / 1.3, tone: vs(st.agility, flown.agility) },
      { label: 'Hull', value: String(st.hull), bar: st.hull / 200, tone: vs(st.hull, flown.hull) },
      { label: 'Shield', value: String(st.shield), bar: st.shield / 60, tone: vs(st.shield, flown.shield) },
      { label: 'Mounts', value: String(st.mounts), tone: vs(st.mounts, flown.mounts) },
      { label: 'Slots', value: String(MODULE_SLOTS[hull] ?? 1) },
    ]
    return {
      title: hull,
      icon: uiPicture(`hull-${hull}`),
      line: st.role,
      stats,
      cost,
      note: cost ? 'Kept for good, with its own fit, paint and rooms' : undefined,
    }
  }
  const SLOTS: [GearSlot, string][] = [
    ['tool', 'Tool'],
    ['sidearm', 'Sidearm'],
    ['lining', 'Suit lining'],
    ['pack', 'Backpack'],
    ['gadget', 'Gadget'],
  ]
  const worn = (slot: GearSlot) =>
    GEAR.find((g) => g.slot === slot && gear.includes(g.id))?.id ?? GEAR.find((g) => g.slot === slot && g.price === 0)!.id
</script>

{#snippet buyFoot()}
  {#if picked}
    {@const p = HULL_PRICES[picked]}
    {@const st = statsOf(picked)}
    <div class="flex min-w-0 flex-1 items-center gap-3">
      <img src={uiPicture(`hull-${picked}`)} alt="" width="48" height="48" style="image-rendering: pixelated" />
      <div class="flex min-w-0 flex-col gap-1">
        <span class="ui-body truncate">{picked}</span>
        <span class="ui-label truncate"
          >{st.role} · {MODULE_SLOTS[picked] ?? 1}
          {(MODULE_SLOTS[picked] ?? 1) === 1 ? 'slot' : 'slots'} · {st.mounts}
          {st.mounts === 1 ? 'mount' : 'mounts'}</span
        >
      </div>
    </div>
    <button type="button" class="ui-btn ui-btn-quiet" onclick={() => (picked = null)}>Cancel</button>
    <button
      type="button"
      class="ui-btn ui-btn-main"
      disabled={!can(p.credits, p.needs)}
      onclick={() => {
        const h = picked!
        picked = null
        onbuyhull(h)
      }}>Buy · {now(p.credits, p.needs)} CR</button
    >
  {/if}
{/snippet}

<Panel
  title="Shop"
  sub="Station deck"
  credits={totals.credits}
  label="Shop"
  size="wide"
  {onclose}
  foot={picked && tab === 'ships' ? buyFoot : undefined}
>
  {#snippet tabs()}
    <Tabs
      items={[
        { id: 'ships', label: 'Ships', icon: 'ships' },
        { id: 'gear', label: 'Gear', icon: 'gear' },
        { id: 'furniture', label: 'Furniture', icon: 'furniture' },
      ]}
      value={tab}
      onchange={(t) => (tab = t as Tab)}
      label="Shop"
    />
  {/snippet}

  {#key tab}
    {#if tab === 'ships'}
      <div class="ui-settle grid grid-cols-5 gap-2 max-[900px]:grid-cols-4 max-[640px]:grid-cols-3">
        {#each HULL_NAMES as hull, i (hull)}
          {@const mine = ships.find((x) => x.hull === hull)}
          {@const p = HULL_PRICES[hull]}
          {@const taken = ownsHull(totals, hull)}
          <button
            type="button"
            class="ui-row tile flex-col justify-center gap-1 py-2"
            class:is-on={mine?.id === flying || picked === hull}
            style="--i: {i}"
            disabled={!mine && !taken && !can(p.credits, p.needs)}
            aria-label={mine
              ? mine.id === flying
                ? `${hull}: flying`
                : `Fly the ${hull}`
              : taken
                ? `Take the ${hull}`
                : `Look at the ${hull} · ${price(p.credits, p.needs)}`}
            onclick={() => (mine ? onfly(mine.id) : taken ? onbuyhull(hull) : (picked = picked === hull ? null : hull))}
            use:tip={hullTip(hull, mine ? undefined : price(p.credits, p.needs))}
          >
            <img
              src={uiPicture(`hull-${hull}`)}
              alt=""
              width="96"
              height="96"
              style="image-rendering: pixelated"
              class="max-[420px]:h-12 max-[420px]:w-12 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12"
            />
            <span>{hull}</span>
            <span class="ui-label ui-num {mine ? 'text-accent' : taken ? '' : 'text-nomarchy'}">
              {mine ? (mine.id === flying ? 'Flying' : 'Yours') : taken ? 'Take' : now(p.credits, p.needs)}
            </span>
          </button>
        {/each}
      </div>
    {:else if tab === 'gear'}
      <div class="ui-settle flex flex-col gap-3">
        {#each SLOTS as [slot, name], i (slot)}
          <div class="flex items-center gap-3 max-sm:flex-col max-sm:items-start" style="--i: {i}">
            <h3 class="ui-label w-28 flex-none">{name}</h3>
            <div class="flex flex-wrap gap-2">
              {#each GEAR.filter((g) => g.slot === slot) as g (g.id)}
                {@const mine = g.price === 0 || totals.owned.includes(`gear:${g.id}`)}
                {@const on = worn(slot) === g.id}
                <button
                  type="button"
                  class="ui-row gear"
                  class:is-on={on}
                  disabled={!mine && !can(g.price, g.needs)}
                  aria-label={mine ? (on ? `${g.name}: worn` : `Wear ${g.name}`) : `Buy ${g.name} · ${price(g.price, g.needs)}`}
                  onclick={() => (mine ? onwear(g.id) : onbuygear(g.id))}
                  use:tip={itemTip(g.name, g.blurb, g.cost, mine, g.price, g.needs, uiPicture(`g-${g.id}`), [], now(g.price, g.needs))}
                >
                  <UiIcon name="g-{g.id}" size={32} />
                  <span class="flex flex-col gap-1">
                    <span>{g.name}</span>
                    <span class="ui-label ui-num {on ? 'text-accent' : mine ? '' : 'text-nomarchy'}"
                      >{on ? 'Worn' : mine ? 'Wear' : now(g.price, g.needs)}</span
                    >
                  </span>
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <div class="ui-settle grid grid-cols-4 gap-2 max-[640px]:grid-cols-3">
        {#each FURNITURE as f, i (f.id)}
          {@const left = furnitureLeft(totals, ships, f.id)}
          <button
            type="button"
            class="ui-row tile flex-col justify-center gap-1 py-2"
            style="--i: {i}"
            disabled={totals.credits < f.price}
            aria-label="Buy {f.price} · {f.name}"
            onclick={() => onbuyfurniture(f.id)}
            use:tip={{
              title: f.name,
              icon: uiPicture(`furn-${f.id}`),
              cost: `${f.price} CR`,
              note: left > 0 ? `${left} waiting to be placed aboard` : 'Placed aboard, from Furnish',
            }}
          >
            <!-- (a piece is 8 to 16 of its icon's 24 px: four times over, at the shop's tile size, it reads) -->
            <img
              src={uiPicture(`furn-${f.id}`)}
              alt=""
              width="96"
              height="96"
              style="image-rendering: pixelated"
              class="-my-3 [@media(max-height:420px)]:my-0 [@media(max-height:420px)]:h-12 [@media(max-height:420px)]:w-12"
            />
            <span class="text-center leading-none">{f.name}</span>
            <span class="ui-label ui-num"
              ><span class="text-nomarchy">{f.price}</span>{#if left > 0}<span class="text-ink"> · {left} to place</span>{/if}</span
            >
          </button>
        {/each}
      </div>
    {/if}
  {/key}
</Panel>

<style>
  .tile {
    min-height: 132px;
  }
  .gear {
    min-width: 12rem;
  }
  @media (max-height: 420px) {
    .tile {
      min-height: 96px;
    }
  }
</style>
