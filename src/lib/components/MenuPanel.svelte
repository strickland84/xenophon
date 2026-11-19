<script lang="ts">
  import { asset } from '$app/paths'
  // The menu (Escape, Options, or the Menu button): where the pilot is (a world, or a system's
  // space) and the way to the maps; the connection screen; and the pilot's file. The game goes on
  // behind it: nothing pauses in a shared sky. Other worlds are reached by flying there (space).
  //
  // The connection screen (the plan's section 16): pilots connected, pilots that could not be
  // connected to, how the relays answer, and the counts kept across sessions of every attempt,
  // which can be copied to send in (the share that fail is Phase 2's question).
  //
  // The persistent world (Phase 7): the faction board, the pilots nearby, recording a ghost of the
  // next stretch of flight; how many events are kept here and how each relay that keeps them answers
  // (taken, refused, and why); and the list of those relays, which the pilot may change.
  import { resolve } from '$app/paths'
  import { buildLine, SOURCE } from '../version'
  import { surfaceById, systemOfKey, theGalaxy } from '../engine'
  import { failRate } from '../net/log'
  import type { RelayHealth } from '../net/relays'
  import type { ConnectionTotals } from '../net/log'
  import type { NetState } from '../net/online'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import { describe } from '../worlds/describe'
  import Emblem from './Emblem.svelte'
  import Panel from './Panel.svelte'
  import Portrait from './Portrait.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    callsign: string
    faction: FactionId
    /** where the pilot is: a world flown over, a system's space ('s3'), or '' for an island world of the address's own */
    world: string
    /** the maps asked for */
    onmap: () => void
    sky: NetState
    /** the counts kept on this device, and the whole log as text, to copy */
    totals: ConnectionTotals
    logText: () => string
    onclose: () => void
    /** download the pilot as a file */
    onexport: () => void
    /** a pilot file was picked, to load in place of this one (returns why it would not do, or null) */
    onimport: (file: File) => Promise<string | null>
    /** the pilot's look (his portrait), and the creator asked for to change it */
    look: string
    onpilot: () => void
    /** the faction board, the pilots nearby, and a ghost recorded (or stopped) */
    onboard: () => void
    onnearby: () => void
    /** the pilot sheet, and the squad */
    onsheet?: () => void
    onsquad?: () => void
    /** a wing link asked for: an address that puts a friend on his wing (net/wing.ts) */
    oninvite?: () => void
    onghost: () => void
    /** a ghost is being recorded; one can be (flying over a world) */
    recording: boolean
    canRecord: boolean
    /** how the persistent world's events stand here (kept, waiting for a relay) and the relays keeping them */
    persist: { events: number; waiting: number; relays: RelayHealth[]; namespace: string } | null
    /** the settings asked for */
    onsettings: () => void
    /** when his key was last kept safe (ms; 0 never), and the reminder asked for */
    backedUp: number
    onbackup: () => void
    /** the first sortie is under way: a step skipped, or the whole of it ended */
    tutorialOn: boolean
    onskipstep: () => void
    onendtutorial: () => void
    /** the opening story again (IntroCrawl) */
    onstory?: () => void
  }
  let {
    callsign,
    faction,
    world,
    onmap,
    sky,
    totals,
    logText,
    onclose,
    onexport,
    onimport,
    look,
    onpilot,
    onboard,
    onnearby,
    onsheet,
    onsquad,
    oninvite,
    onghost,
    recording,
    canRecord,
    persist,
    onsettings,
    backedUp,
    onbackup,
    tutorialOn,
    onskipstep,
    onendtutorial,
    onstory,
  }: Props = $props()
  let picker = $state<HTMLInputElement>()
  let importError = $state<string | null>(null)
  let copied = $state(false)
  const own = $derived(FACTIONS[faction])
  const rate = $derived(failRate(totals))
  const here = $derived(surfaceById(world))
  const words = $derived(here ? describe(here) : null)
  const system = $derived(systemOfKey(world) >= 0 ? theGalaxy().systems[systemOfKey(world)] : null)

  async function load(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    importError = await onimport(file)
    if (picker) picker.value = ''
  }

  async function copyLog() {
    try {
      await navigator.clipboard.writeText(logText())
      copied = true
      setTimeout(() => (copied = false), 1500)
    } catch {
      copied = false
    }
  }

  const host = (url: string) => url.replace(/^wss?:\/\//, '').replace(/\/$/, '')
  type Tab = 'menu' | 'sky' | 'pilot'
  let tab = $state<Tab>('menu')
  const where = $derived(
    words
      ? {
          name: words.name,
          kind: `${words.kind} · ${words.system}`,
          tip: { title: words.name, line: `${words.sun}; ${words.body}; ${words.weather}`, note: words.flying },
        }
      : system
        ? {
            name: system.name,
            kind: system.side ? `Home of ${FACTIONS[system.side].name}` : system.kind === 'core' ? 'The core' : 'The frontier',
            tip: { title: `The space of ${system.name}`, line: 'Gates lead on to other systems; go down to a world from over it.' },
          }
        : { name: 'Your own island', kind: 'From the address', tip: null },
  )
  /** the menu's tiles: what each opens */
  const tiles = $derived(
    [
      { icon: 'map', label: 'Maps', name: 'The maps', go: onmap, tip: 'The system and the galaxy: plot a course' },
      { icon: 'board', label: 'Faction', name: 'Faction board', go: onboard, tip: 'The war, the day’s tasks, the best pilots' },
      { icon: 'pilots', label: 'Pilots', name: 'Pilots nearby', go: onnearby, tip: 'Who is here: invite, mute, block' },
      onsheet ? { icon: 'sheet', label: 'Sheet', name: 'Pilot sheet', go: onsheet, tip: 'Your rank, feats, statistics, ships' } : null,
      onsquad ? { icon: 'squad', label: 'Squad', name: 'Squad', go: onsquad, tip: 'Fly with up to three of your side' } : null,
      oninvite
        ? { icon: 'relays', label: 'Invite', name: 'Invite a friend', go: oninvite, tip: 'A link that puts a friend on your wing' }
        : null,
      {
        icon: 'ghost',
        label: recording ? 'Stop' : 'Ghost',
        name: recording ? 'Stop recording' : 'Record a ghost',
        go: onghost,
        off: !recording && !canRecord,
        on: recording,
        tip: recording ? 'Stop recording your ghost' : 'Record a ghost of your next flight, for others to race (over a world)',
      },
      { icon: 'look', label: 'Look', name: 'Your pilot', go: onpilot, tip: 'Your race, face and colours' },
      { icon: 'settings', label: 'Settings', name: 'Settings', go: onsettings, tip: 'Controls, sound, picture, your key, relays' },
      onstory
        ? {
            icon: 'story',
            label: 'Story',
            name: 'The story',
            go: onstory,
            tip: 'The opening story again: the war, and why both sides are hiring',
          }
        : null,
      {
        img: 'brand/mark-64.png',
        icon: 'story',
        label: 'GitHub',
        name: 'The game on GitHub',
        go: () => window.open(SOURCE, '_blank', 'noopener'),
        tip: 'The game is open source: read the code, report a bug, or help make it',
      },
    ].filter((t) => !!t),
  )
</script>

<Panel title={callsign} sub={own.name} label="Menu" inlineTabs tabCloses={false} {onclose}>
  {#snippet lead()}
    <Portrait {look} {faction} size={16} scale={3} label="{callsign}'s portrait" />
  {/snippet}
  {#snippet tabs()}
    <Tabs
      items={[
        { id: 'menu', label: 'Menu' },
        { id: 'sky', label: sky.on ? `Sky · ${sky.pilots.length + 1}` : 'Sky' },
        { id: 'pilot', label: backedUp ? 'Pilot file' : 'Pilot file !' },
      ]}
      value={tab}
      onchange={(t) => (tab = t as Tab)}
      label="Menu"
    />
  {/snippet}

  {#key tab}
    {#if tab === 'menu'}
      <div class="ui-settle flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2" style="--i: 0">
          <span class="flex min-w-0 flex-col gap-1.5" use:tip={where.tip}>
            <span class="ui-head truncate">{where.name}</span>
            <span class="ui-label truncate">{where.kind}</span>
          </span>
          {#if tutorialOn}
            <span class="ml-auto flex gap-2">
              <button type="button" class="ui-btn" aria-label="Skip this step" onclick={onskipstep}>Skip step</button>
              <button type="button" class="ui-btn" aria-label="End the first sortie" onclick={onendtutorial}>End sortie</button>
            </span>
          {/if}
        </div>
        <div class="grid grid-cols-4 gap-2 max-[520px]:grid-cols-3" style="--i: 1">
          {#each tiles as t, i (t.label)}
            <button
              type="button"
              class="ui-row tile flex-col justify-center gap-2 py-3"
              class:is-on={t.on}
              disabled={t.off}
              onclick={t.go}
              style="--i: {i}"
              aria-label={t.name}
              use:tip={{ title: t.name, line: t.tip }}
            >
              {#if 'img' in t && t.img}
                <img src={asset(t.img as Parameters<typeof asset>[0])} alt="" width="48" height="48" style="image-rendering: pixelated" />
              {:else}
                <UiIcon name={t.icon} size={48} />
              {/if}
              <span>{t.label}</span>
            </button>
          {/each}
        </div>
      </div>
    {:else if tab === 'sky'}
      <div class="ui-settle flex flex-col gap-5">
        <div class="flex flex-col gap-2" style="--i: 0">
          {#if !sky.on}
            <p class="ui-body">Offline <span class="text-ink-dim">· {sky.why}</span></p>
          {:else}
            <p class="ui-body">
              {sky.pilots.length > 0 ? `${sky.pilots.length + 1} pilots here` : 'Alone, looking for pilots'}
              {#if sky.host}<span class="text-ink-dim"> · this game flies the computer’s ships</span>{/if}
            </p>
            {#each sky.pilots as p (p.peer)}
              <div class="ui-row">
                {#if p.look}<Portrait look={p.look} faction={p.faction} size={16} scale={2} label="{p.callsign}'s portrait" />{/if}
                <Emblem side={p.faction} size={16} />
                <span style="color: {p.faction === faction ? '#f4ecd0' : '#ff5446'}">{p.callsign}</span>
                {#if p.idle}<span class="text-ink-dim">idle</span>{/if}
                {#if p.host}<span class="text-ink-dim" use:tip={{ title: 'Host', line: 'Flies the computer’s ships for the room' }}
                    >host</span
                  >{/if}
                <span class="ui-num ml-auto text-ink-dim">{p.rtt === null ? '–' : `${Math.round(p.rtt)} ms`}</span>
              </div>
            {/each}
            <p class="ui-label">
              {sky.connected} connected{#if sky.connecting > 0}
                · {sky.connecting} connecting{/if} ·
              <span class={sky.failed ? 'text-foe' : ''}>{sky.failed} failed</span>
              {#if !sky.health.fastLane}
                · <span use:tip={{ title: 'Fast lane down', line: 'Updates go the sure, slower way' }}>slow lane</span>{/if}
            </p>
            {#if sky.health.trouble}<p class="ui-body text-foe">{sky.health.trouble}</p>{/if}
          {/if}
        </div>
        {#if sky.on && sky.health.relays.length}
          <div class="flex flex-col gap-2" style="--i: 1">
            <h3 class="ui-label" use:tip={{ title: 'Relays', line: 'They introduce pilots to each other, then step aside' }}>Relays</h3>
            <ul class="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {#each sky.health.relays as r (r.url)}
                <li class="ui-body flex items-center gap-2">
                  <span
                    class="inline-block h-3 w-3 flex-none border-2 {r.up ? 'border-ok bg-ok' : 'border-foe'}"
                    aria-label={r.up ? 'up' : 'down'}
                  ></span>
                  <span class="truncate normal-case">{host(r.url)}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
        <div class="flex flex-col gap-2" style="--i: 2">
          <h3
            class="ui-label"
            use:tip={{ title: 'The galaxy’s memory', line: 'Flags, wrecks, names: kept here and on the relays, for pilots who come later' }}
          >
            Memory
          </h3>
          {#if persist}
            <p class="ui-body">
              <span class="ui-num">{persist.events}</span> events{#if persist.waiting}<span class="text-ink-dim">
                  · {persist.waiting} waiting</span
                >{/if}
            </p>
            <ul class="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {#each persist.relays as r (r.url)}
                <li class="ui-body flex items-center gap-2" use:tip={r.said ? { title: host(r.url), line: r.said } : null}>
                  <span
                    class="inline-block h-3 w-3 flex-none border-2 {r.up ? 'border-ok bg-ok' : 'border-foe'}"
                    aria-label={r.up ? 'up' : 'down'}
                  ></span>
                  <span class="truncate normal-case">{host(r.url)}</span>
                  <span class="ui-num ml-auto text-ink-dim">{r.accepted}{r.refused ? ` · ${r.refused}!` : ''}</span>
                </li>
              {:else}
                <li class="ui-body text-ink-dim">No relays: kept in this browser only</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div class="flex flex-wrap items-center gap-3" style="--i: 3">
          <span class="ui-label" use:tip={{ title: 'Measured on this device', line: 'Every connection tried, across sessions' }}>
            {totals.attempts} tried · {totals.connected} ok · {totals.failed} failed{rate === null ? '' : ` (${Math.round(rate * 100)}%)`}
          </span>
          <button type="button" class="ui-btn ui-btn-small ml-auto" onclick={copyLog}>{copied ? 'Copied' : 'Copy log'}</button>
          <a class="ui-btn ui-btn-small" href={resolve('/gallery')} target="_blank" rel="noopener">Every world</a>
        </div>
        <p class="ui-label normal-case" style="--i: 4">{buildLine()}</p>
      </div>
    {:else}
      <div class="ui-settle flex flex-col gap-4">
        <div class="flex items-center gap-3" style="--i: 0">
          <UiIcon name="key" size={48} />
          {#if backedUp}
            <p class="ui-body">Kept safe <span class="text-ink-dim">· {new Date(backedUp).toLocaleDateString()}</span></p>
          {:else}
            <p class="ui-body text-foe">Not kept safe: clearing this browser would lose him</p>
          {/if}
        </div>
        <div class="flex flex-wrap gap-2" style="--i: 1">
          <button type="button" class="ui-btn {backedUp ? '' : 'ui-btn-main'}" onclick={onbackup}>Keep him safe</button>
          <button
            type="button"
            class="ui-btn"
            onclick={onexport}
            use:tip={{ title: 'Pilot file', line: 'It holds your key: whoever has it can fly as you' }}>Save file</button
          >
          <button type="button" class="ui-btn" onclick={() => picker?.click()}>Load file</button>
          <input bind:this={picker} type="file" accept=".json,application/json" class="hidden" onchange={load} />
        </div>
        {#if importError}<p class="ui-body text-foe" role="alert">{importError}</p>{/if}
      </div>
    {/if}
  {/key}
</Panel>

<style>
  .tile {
    min-height: 104px;
  }
  @media (max-height: 420px) {
    .tile {
      min-height: 88px;
      padding-block: 6px;
    }
  }
</style>
