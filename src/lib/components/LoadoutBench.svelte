<script lang="ts">
  // The hangar's loadout bench: what is on each of the ship's mounts and in each of its slots, what
  // each choice gives and costs, and the ship's stats against it bare. A weapon or module is bought
  // here once and kept (fitted to any of his ships, free); the ship in front of him shows each change.
  // His other ships are listed too: he picks which to fly.
  import { fitEffect, MODULE_SLOTS, MODULES, payFor, statsOf, WEAPONS } from '../engine'
  import type { ResourceId } from '../engine'
  import { inVault } from '../save/property'
  import type { Totals } from '../save/property'
  import { ownsModule, ownsWeapon } from '../save/ships'
  import type { ShipRecord } from '../save/ships'
  import { effectStats, itemTip, priceWords, uiPicture } from './items'
  import Panel from './Panel.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    ship: ShipRecord
    ships: ShipRecord[]
    totals: Totals
    onclose: () => void
    onbuy: (what: 'weapon' | 'module', id: string) => void
    onweapon: (mount: number, id: string) => void
    onmodule: (slot: number, id: string) => void
    onfly: (id: string) => void
  }
  let { ship, ships, totals, onclose, onbuy, onweapon, onmodule, onfly }: Props = $props()

  type Tab = 'weapons' | 'modules' | 'ships'
  let tab = $state<Tab>('weapons')
  const stats = $derived(statsOf(ship.hull))
  const slots = $derived(MODULE_SLOTS[ship.hull] ?? 1)
  const e = $derived(fitEffect({ weapons: ship.weapons, modules: ship.modules }, stats.mounts, slots))
  /** what a price comes to now: the ore his vault lacks made up at the counter (data/shop.ts payFor) */
  const now = (credits: number, needs: { id: ResourceId; n: number }[]) => payFor(credits, needs, (id) => inVault(totals, id)).credits
  const can = (credits: number, needs: { id: ResourceId; n: number }[]) => totals.credits >= now(credits, needs)
  const price = (credits: number, needs: { id: ResourceId; n: number }[]) => priceWords(credits, needs, now(credits, needs))
  const pct = (v: number) => (Math.abs(v - 1) < 0.005 ? '' : `${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`)
  const rows = $derived(
    [
      ['Speed', pct(e.speed)],
      ['Turn', pct(e.agility)],
      ['Thrusters', pct(e.boost)],
      ['Hull', `${Math.round(stats.hull * e.hull)} ${pct(e.hull)}`],
      ['Shield', `${Math.round(stats.shield * e.shield)} ${pct(e.shield)}`],
      ['Missiles', `${stats.missiles + e.missiles}`],
      ['Mines', `${e.mines}`],
      ['Hold', `+${e.slots} slots`],
    ].filter(([, v]) => v.trim() !== '' && v !== '+0 slots' && v !== '0'),
  )
  /** a figure against the bare hull: green better, red worse */
  const tone = (v: string) => (/\+\d+%/.test(v) ? 'text-ok' : /-\d+%/.test(v) ? 'text-foe' : 'text-ink')
</script>

<Panel title="Loadout" sub="{ship.hull} · {stats.role}" credits={totals.credits} label="Loadout bench" size="wide" beside {onclose}>
  {#snippet tabs()}
    <Tabs
      items={[
        { id: 'weapons', label: `Weapons ${stats.mounts}`, icon: 'supplies' },
        { id: 'modules', label: `Modules ${ship.modules.length}/${slots}`, icon: 'parts' },
        ...(ships.length > 1 ? [{ id: 'ships', label: 'Ships', icon: 'ships' }] : []),
      ]}
      value={tab}
      onchange={(t) => (tab = t as Tab)}
      label="Loadout"
    />
  {/snippet}
  {#snippet foot()}
    <!-- the ship as fitted, against its hull bare -->
    <div
      class="flex flex-wrap items-center gap-x-5 gap-y-1"
      use:tip={{
        title: 'Against this hull bare',
        line: 'No fit makes a ship more than a quarter better on any fighting stat: everything gives and costs.',
      }}
    >
      {#each rows as [k, v] (k)}
        <span class="ui-label whitespace-nowrap">{k} <span class="ui-num {tone(v)}">{v}</span></span>
      {/each}
    </div>
  {/snippet}

  {#key tab}
    {#if tab === 'weapons'}
      <div class="ui-settle flex flex-col gap-4">
        {#each ship.weapons as on, m (m)}
          <div class="flex flex-col gap-2" style="--i: {m}">
            <h3 class="ui-label">Mount {m + 1}</h3>
            <div class="grid grid-cols-3 gap-2 max-[900px]:grid-cols-5 max-[640px]:grid-cols-3">
              {#each WEAPONS as w (w.id)}
                {@const owned = ownsWeapon(totals, w.id)}
                <button
                  type="button"
                  class="ui-row item flex-col justify-center gap-1.5 py-2"
                  class:is-on={on === w.id}
                  disabled={!owned && !can(w.price, w.needs)}
                  aria-label={owned ? w.name : `${w.name} · ${price(w.price, w.needs)}`}
                  onclick={() => (owned ? onweapon(m, w.id) : onbuy('weapon', w.id))}
                  use:tip={itemTip(w.name, w.blurb, w.cost, owned, w.price, w.needs, uiPicture(`w-${w.id}`), [], now(w.price, w.needs))}
                >
                  <UiIcon name="w-{w.id}" size={48} />
                  <span class="text-center leading-none">{w.name}</span>
                  {#if !owned}<span class="ui-label ui-num text-nomarchy">{now(w.price, w.needs)}</span>{/if}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {:else if tab === 'modules'}
      <div class="ui-settle grid grid-cols-3 gap-2 max-[900px]:grid-cols-4 max-[640px]:grid-cols-3">
        {#each MODULES as mod, i (mod.id)}
          {@const fitted = ship.modules.includes(mod.id)}
          {@const owned = ownsModule(totals, mod.id)}
          <button
            type="button"
            class="ui-row item flex-col justify-center gap-1.5 py-2"
            class:is-on={fitted}
            style="--i: {i}"
            disabled={owned ? !fitted && ship.modules.length >= slots : !can(mod.price, mod.needs)}
            aria-label={!owned ? `Buy ${mod.name} · ${price(mod.price, mod.needs)}` : fitted ? `${mod.name}: fitted` : `Fit ${mod.name}`}
            onclick={() =>
              !owned
                ? onbuy('module', mod.id)
                : fitted
                  ? onmodule(ship.modules.indexOf(mod.id), '')
                  : onmodule(ship.modules.length, mod.id)}
            use:tip={itemTip(
              mod.name,
              mod.blurb,
              mod.cost,
              owned,
              mod.price,
              mod.needs,
              uiPicture(`m-${mod.id}`),
              effectStats(mod.does),
              now(mod.price, mod.needs),
            )}
          >
            <UiIcon name="m-{mod.id}" size={48} />
            <span class="text-center leading-none">{mod.name}</span>
            <span class="ui-label ui-num {fitted ? 'text-accent' : owned ? '' : 'text-nomarchy'}"
              >{fitted ? 'Fitted' : owned ? 'Fit' : now(mod.price, mod.needs)}</span
            >
          </button>
        {/each}
      </div>
    {:else}
      <div class="ui-settle grid grid-cols-3 gap-2 max-[900px]:grid-cols-4 max-[640px]:grid-cols-3">
        {#each ships as s, i (s.id)}
          <button
            type="button"
            class="ui-row item flex-col justify-center gap-1.5 py-2"
            class:is-on={s.id === ship.id}
            style="--i: {i}"
            aria-label={s.id === ship.id ? `${s.hull}, flying` : `Fly the ${s.hull}`}
            onclick={() => onfly(s.id)}
            use:tip={{
              title: s.hull,
              line: statsOf(s.hull).role,
              stats: [
                { label: 'Hull', value: String(statsOf(s.hull).hull) },
                { label: 'Shield', value: String(statsOf(s.hull).shield) },
              ],
            }}
          >
            <UiIcon name="ships" size={48} />
            <span>{s.hull}</span>
            <span class="ui-label {s.id === ship.id ? 'text-accent' : ''}">{s.id === ship.id ? 'Flying' : 'Fly'}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/key}
</Panel>

<style>
  .item {
    min-height: 120px;
  }
  @media (max-height: 420px) {
    .item {
      min-height: 104px;
    }
  }
</style>
