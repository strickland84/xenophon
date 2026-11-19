<script lang="ts">
  // The pilot sheet (the plan's section 16): his portrait, rank, feats, statistics (worked out from
  // his property log and his standing), the gear he wears and the ships he owns.
  import { asset } from '$app/paths'
  import { GEAR, GEAR_DEFAULT, RANK_TITLES, statsOf } from '../engine'
  import type { GearSlot } from '../engine'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import { FEATS } from '../save/progress'
  import type { Progress } from '../save/progress'
  import type { Property } from '../save/property'
  import { EMBLEM_FEATS } from '../save/ships'
  import type { ShipRecord } from '../save/ships'
  import Count from './Count.svelte'
  import Emblem from './Emblem.svelte'
  import Panel from './Panel.svelte'
  import Portrait from './Portrait.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    callsign: string
    faction: FactionId
    look: string
    rank: number
    progress: Progress
    property: Property
    ships: ShipRecord[]
    flying: string
    gear: string[]
    onclose: () => void
  }
  let { callsign, faction, look, rank, progress, property, ships, flying, gear, onclose }: Props = $props()

  // what the log comes to, besides the vault and the wallet
  const stats = $derived.by(() => {
    let kills = 0
    let banked = 0
    let mined = 0
    let lost = 0
    let earned = 0
    let spent = 0
    for (const e of property.log) {
      if (e.k === 'bounty') {
        earned += e.credits
        if (e.what !== 'task' && !e.what.startsWith('task')) kills++
      } else if (e.k === 'bank') banked += e.items.reduce((n, s) => n + s.n, 0)
      else if (e.k === 'mined') mined += e.items.reduce((n, s) => n + s.n, 0)
      else if (e.k === 'lost') lost++
      else if (e.k === 'bought' || e.k === 'fee') spent += e.credits
      else if (e.k === 'sold') earned += e.credits
    }
    const icon = (id: string) => asset(`/icons/${id}.png` as Parameters<typeof asset>[0])
    return [
      ['Kills and deeds', kills, ''],
      ['Mined', mined, icon('ferrite')],
      ['Banked', banked, icon('crate')],
      ['Holds lost', lost, ''],
      ['Earned', earned, icon('credits')],
      ['Spent', spent, ''],
      ['For his side', Math.round(progress.contribution), ''],
      ['Best streak', progress.best ?? progress.streak, ''],
    ] as [string, number, string][]
  })
  const worn = (slot: GearSlot) =>
    GEAR.find((g) => g.slot === slot && gear.includes(g.id)) ?? GEAR.find((g) => g.id === GEAR_DEFAULT[slot])!
  type Tab = 'record' | 'feats' | 'kit'
  let tab = $state<Tab>('record')
  const badge = $derived(asset(`/badges/${faction}-${rank}.png` as Parameters<typeof asset>[0]))
</script>

<Panel title={callsign} sub="{RANK_TITLES[faction][rank]} · {FACTIONS[faction].name}" label="Pilot sheet" size="wide" {onclose}>
  {#snippet lead()}
    <Emblem side={faction} size={32} />
  {/snippet}
  {#snippet tabs()}
    <Tabs
      items={[
        { id: 'record', label: 'Record', icon: 'sheet' },
        { id: 'feats', label: `Feats ${progress.feats.length}/${FEATS.length}` },
        { id: 'kit', label: 'Kit', icon: 'gear' },
      ]}
      value={tab}
      onchange={(t) => (tab = t as Tab)}
      label="Pilot sheet"
    />
  {/snippet}

  <div class="flex flex-wrap gap-6">
    <!-- who he is: his portrait, his badge -->
    <div class="flex flex-col items-center gap-3 max-sm:hidden">
      <div class="border-2 p-0.5" style="border-color: {FACTIONS[faction].colour}"><Portrait {look} {faction} scale={4} /></div>
      <span
        class="flex items-center gap-2"
        use:tip={{ title: RANK_TITLES[faction][rank], line: 'Rank comes from what you add to your side' }}
      >
        <img src={badge} alt="" width="48" height="48" style="image-rendering: pixelated" />
        <span class="ui-label">Rank {rank + 1}</span>
      </span>
    </div>
    <div class="min-w-0 flex-1">
      {#key tab}
        {#if tab === 'record'}
          <dl class="ui-settle grid grid-cols-4 gap-2 max-[720px]:grid-cols-2">
            {#each stats as [k, v, icon], i (k)}
              <div class="flex flex-col gap-2 border-2 border-ink/10 bg-ink/[0.03] px-3 py-3" style="--i: {i}">
                <dd class="ui-head ui-num flex items-center gap-2">
                  {#if icon}<img src={icon} alt="" width="32" height="32" style="image-rendering: pixelated" />{/if}<Count value={v} />
                </dd>
                <dt class="ui-label">{k}</dt>
              </div>
            {/each}
          </dl>
        {:else if tab === 'feats'}
          <ul class="ui-settle grid grid-cols-2 gap-2 max-[640px]:grid-cols-1">
            {#each FEATS as f, i (f.id)}
              {@const done = progress.feats.includes(f.id)}
              {@const emblem = Object.entries(EMBLEM_FEATS).find(([, feat]) => feat === f.id)?.[0]}
              <li
                class="ui-row"
                class:is-on={done}
                style="--i: {i}"
                use:tip={{ title: f.name, line: f.text, note: emblem ? `Unlocks the ${emblem} emblem` : undefined }}
              >
                {#if emblem}
                  <img
                    src={asset(`/emblems/${emblem}.png` as Parameters<typeof asset>[0])}
                    alt=""
                    width="32"
                    height="32"
                    class:opacity-25={!done}
                    style="image-rendering: pixelated"
                  />
                {:else}
                  <span class="ui-head w-8 text-center {done ? 'text-accent' : 'text-ink/25'}">★</span>
                {/if}
                <span class={done ? '' : 'text-ink-dim'}>{f.name}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <div class="ui-settle flex flex-col gap-4">
            <div class="flex flex-wrap gap-2" style="--i: 0">
              {#each ['tool', 'sidearm', 'lining', 'pack', 'gadget'] as slot (slot)}
                {@const g = worn(slot as GearSlot)}
                <span class="ui-well" use:tip={{ title: g.name, line: g.blurb, note: slot }}>
                  <UiIcon name="g-{g.id}" size={48} />
                </span>
              {/each}
            </div>
            <div class="flex flex-wrap gap-2" style="--i: 1">
              {#each ships as s (s.id)}
                <span
                  class="ui-row flex-col gap-1 py-2"
                  class:is-on={s.id === flying}
                  use:tip={{
                    title: s.hull,
                    line: statsOf(s.hull).role,
                    stats: [
                      { label: 'Guns', value: s.weapons.join(', ') },
                      ...(s.modules.length ? [{ label: 'Modules', value: s.modules.join(', ') }] : []),
                    ],
                  }}
                >
                  <img
                    src={asset(`/ui/hull-${s.hull}.png` as Parameters<typeof asset>[0])}
                    alt=""
                    width="48"
                    height="48"
                    style="image-rendering: pixelated"
                  />
                  <span class="ui-label {s.id === flying ? 'text-accent' : ''}">{s.hull}</span>
                </span>
              {/each}
            </div>
          </div>
        {/if}
      {/key}
    </div>
  </div>
</Panel>
