<script lang="ts">
  // The faction board (the plan's section 16, after art/mockups/faction-board.png): how the war
  // stands (the worlds each side holds, as one bar split between them), the pilot's rank (his
  // side's badge and title for what he has added to it), the day's three tasks and how far each
  // has come, today's hotspots, the pilots who have added most to each side this week, and his
  // feats (each unlocks an emblem). All of it from the events (galaxyState) and his save.
  import { asset } from '$app/paths'
  import { RANK_POINTS, RANK_TITLES, theGalaxy } from '../engine'
  import type { DailyTask, GalaxyState } from '../engine'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import { FEATS } from '../save/progress'
  import type { Progress } from '../save/progress'
  import Count from './Count.svelte'
  import Emblem from './Emblem.svelte'
  import Panel from './Panel.svelte'
  import Tabs from './Tabs.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    side: FactionId
    callsign: string
    /** the pilot's key (to find him among the contributors) */
    me: string
    galaxy: GalaxyState
    progress: Progress
    rank: number
    tasks: DailyTask[]
    hotspots: string[]
    /** pilots of each side flying now (null: not known) */
    flying: { nomarchy: number; anarchoi: number } | null
    onclose: () => void
  }
  let { side, callsign, me, galaxy, progress, rank, tasks, hotspots, flying, onclose }: Props = $props()

  const g = theGalaxy()
  const own = $derived(FACTIONS[side])
  const total = $derived(Object.keys(galaxy.worlds).length)
  const nobody = $derived(total - galaxy.held.nomarchy - galaxy.held.anarchoi)
  const next = $derived(rank < RANK_POINTS.length - 1 ? RANK_POINTS[rank + 1] : null)
  const top = (s: FactionId) => galaxy.contributors.filter((c) => c.side === s).slice(0, 5)
  const worldName = (id: string) => galaxy.names[id]?.name ?? g.worlds.find((w) => w.id === id)?.name ?? id
  /** how far each of the day's tasks has come (nothing yet, if what the save holds is another day's) */
  const doneOf = (t: DailyTask) => (progress.tasks.day === Number(t.id.split('-')[0]) ? (progress.tasks.done[t.id] ?? 0) : 0)
  const paidOf = (t: DailyTask) => progress.tasks.day === Number(t.id.split('-')[0]) && progress.tasks.paid.includes(t.id)
  const badge = (s: FactionId, r: number) => asset(`/badges/${s}-${r}.png` as Parameters<typeof asset>[0])

  type Tab = 'today' | 'you' | 'top'
  let tab = $state<Tab>('today')
  /** how far he is from his last rank to the next, 0..1 */
  const toNext = $derived(
    next === null ? 1 : Math.max(0, Math.min(1, (progress.contribution - RANK_POINTS[rank]) / Math.max(1, next - RANK_POINTS[rank]))),
  )
</script>

<Panel title={own.name} sub="The war, today" label="Faction board" size="wide" tabCloses={false} {onclose}>
  {#snippet lead()}
    <Emblem {side} size={32} />
  {/snippet}
  {#snippet tabs()}
    <Tabs
      items={[
        { id: 'today', label: 'Today' },
        { id: 'you', label: 'You' },
        { id: 'top', label: 'Top pilots' },
      ]}
      value={tab}
      onchange={(t) => (tab = t as Tab)}
      label="Faction board"
    />
  {/snippet}

  <!-- the war: the worlds each side holds, one bar split between them -->
  <div
    class="mb-5 flex items-center gap-3"
    use:tip={{
      title: 'Worlds held',
      stats: [
        { label: 'The Nomarchy', value: `${galaxy.held.nomarchy}${flying ? ` · ${flying.nomarchy} flying` : ''}` },
        { label: 'Nobody', value: String(nobody) },
        { label: 'The Anarchoi', value: `${galaxy.held.anarchoi}${flying ? ` · ${flying.anarchoi} flying` : ''}` },
      ],
    }}
  >
    <span class="flex items-center gap-2">
      <Emblem side="nomarchy" size={32} />
      <span class="ui-head ui-num" style="color: {FACTIONS.nomarchy.colour}"><Count value={galaxy.held.nomarchy} /></span>
    </span>
    <div
      class="war flex h-7 flex-1 border-2 border-ink/30"
      role="img"
      aria-label="Worlds held: the Nomarchy {galaxy.held.nomarchy}, the Anarchoi {galaxy.held.anarchoi}, nobody {nobody}"
    >
      <div class="h-full" style="width: {(100 * galaxy.held.nomarchy) / total}%; background: {FACTIONS.nomarchy.colour}"></div>
      <div class="h-full bg-[#2a2f45]" style="width: {(100 * nobody) / total}%"></div>
      <div class="h-full" style="width: {(100 * galaxy.held.anarchoi) / total}%; background: {FACTIONS.anarchoi.colour}"></div>
    </div>
    <span class="flex items-center gap-2">
      <span class="ui-head ui-num" style="color: {FACTIONS.anarchoi.colour}"><Count value={galaxy.held.anarchoi} /></span>
      <Emblem side="anarchoi" size={32} />
    </span>
  </div>

  {#key tab}
    {#if tab === 'today'}
      <div class="ui-settle flex flex-col gap-2">
        {#each tasks as t, i (t.id)}
          {@const n = doneOf(t)}
          {@const paid = paidOf(t)}
          <div class="ui-row" class:is-on={paid} style="--i: {i}">
            <span
              class="inline-block h-4 w-4 flex-none border-2 {paid ? 'border-ok bg-ok' : 'border-ink/60'}"
              aria-label={paid ? 'done' : 'not yet'}
            ></span>
            <span class="min-w-0 flex-1 {paid ? 'text-ink-dim line-through' : ''}">{t.text}</span>
            <span class="ui-meter w-24 max-sm:hidden" aria-hidden="true"
              ><span style="transform: scaleX({Math.min(1, n / t.target)}); background: var(--color-ok)"></span></span
            >
            <span class="ui-label ui-num w-14 text-right">{Math.min(n, t.target)}/{t.target}</span>
            <span class="ui-num w-20 text-right text-nomarchy">{t.reward} CR</span>
          </div>
        {/each}
        <div
          class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1"
          style="--i: 4"
          use:tip={{ title: 'Hotspots', line: 'Their ore is far richer today, for everyone' }}
        >
          <span class="ui-label">Hotspots</span>
          {#each hotspots as h (h)}<span class="ui-body text-[#ff9a3c]">★ {worldName(h)}</span>{/each}
        </div>
      </div>
    {:else if tab === 'you'}
      <div class="ui-settle flex flex-col gap-4">
        <div class="flex items-center gap-4" style="--i: 0">
          <img src={badge(side, rank)} alt="" width="64" height="64" style="image-rendering: pixelated" />
          <div class="flex min-w-0 flex-1 flex-col gap-2">
            <span class="ui-head" style="color: {own.colour}">{RANK_TITLES[side][rank]} {callsign}</span>
            <span
              class="ui-meter"
              use:tip={{
                title: 'Added to your side',
                line: next !== null ? `${next} for ${RANK_TITLES[side][rank + 1]}` : 'The highest rank',
              }}
            >
              <span style="transform: scaleX({toNext}); background: {own.colour}"></span>
            </span>
            <span class="ui-label ui-num">{Math.round(progress.contribution)}{next !== null ? ` / ${next}` : ''}</span>
          </div>
        </div>
        <div class="flex gap-6" style="--i: 1">
          <span class="flex flex-col gap-1.5"
            ><span class="ui-head ui-num"><Count value={Math.floor(progress.streak)} /></span><span class="ui-label">Streak</span></span
          >
          <span class="flex flex-col gap-1.5"
            ><span class="ui-head ui-num"><Count value={Math.floor(progress.best)} /></span><span class="ui-label">Best</span></span
          >
          <span
            class="flex flex-col gap-1.5"
            use:tip={{ title: 'Feats', line: FEATS.map((f) => f.name).join(', '), note: 'The pilot sheet lists them' }}
          >
            <span class="ui-head ui-num">{progress.feats.length}/{FEATS.length}</span><span class="ui-label">Feats</span>
          </span>
        </div>
      </div>
    {:else}
      <div class="ui-settle grid grid-cols-1 gap-5 sm:grid-cols-2">
        {#each ['nomarchy', 'anarchoi'] as s, j (s)}
          {@const f = FACTIONS[s as FactionId]}
          <div class="flex flex-col gap-1.5" style="--i: {j}">
            <h3 class="ui-label flex items-center gap-2">
              <Emblem side={s as FactionId} size={16} /><span style="color: {f.colour}">{f.name}</span> · this week
            </h3>
            {#each top(s as FactionId) as c, i (c.key)}
              <div class="ui-row" class:is-on={c.key === me}>
                <span class="ui-label w-5">{i + 1}</span>
                <span class="min-w-0 flex-1 truncate">{c.callsign}</span>
                <span class="ui-num text-ink-dim">{Math.round(c.points)}</span>
              </div>
            {:else}
              <p class="ui-body text-ink-dim">Nobody yet: yours to take</p>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
  {/key}
</Panel>

<style>
  .war > div {
    animation: grow 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
    transform-origin: left;
  }
  @keyframes grow {
    from {
      transform: scaleX(0);
    }
  }
</style>
