<script lang="ts">
  // Pilots nearby (the plan's section 16, after art/mockups/pilots-nearby.png): who is in the zone,
  // those connected in the room first (with their portraits) and then those whose presence on the
  // relays says they are here, each with his side's mark, his rank's badge, and his bounty if he has
  // one. Mute hides a pilot's chat; Block hides his chat and the traces he leaves. Both are kept in
  // this pilot's save, by key, and only change what this player sees.
  import { asset } from '$app/paths'
  import { RANK_TITLES } from '../engine'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import Emblem from './Emblem.svelte'
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'
  import Portrait from './Portrait.svelte'

  export interface Nearby {
    key: string
    callsign: string
    faction: FactionId
    rank: number
    bounty: number
    /** his look, if he is in the room (his portrait) */
    look: string
    idle: boolean
    /** connected in the room (true), or only heard of on the relays */
    room: boolean
  }

  interface Props {
    zoneName: string
    pilots: Nearby[]
    muted: string[]
    blocked: string[]
    onmute: (key: string) => void
    onblock: (key: string) => void
    onclose: () => void
    /** his side, his squad (by key), and asking a pilot in the room to fly with him (Phase 8) */
    side?: string
    squad?: string[]
    oninvite?: (key: string) => void
  }
  let { zoneName, pilots, muted, blocked, onmute, onblock, onclose, side = '', squad = [], oninvite }: Props = $props()

  const badge = (s: FactionId, r: number) => asset(`/badges/${s}-${r}.png` as Parameters<typeof asset>[0])
</script>

<Panel title="Pilots nearby" sub={zoneName} label="Pilots nearby" size="normal" tabCloses={false} {onclose}>
  {#snippet lead()}
    <UiIcon name="pilots" size={32} />
  {/snippet}
  <ul class="ui-settle flex flex-col gap-1.5">
    {#each pilots as p, i (p.key)}
      {@const f = FACTIONS[p.faction]}
      <li class="ui-row" style="--i: {i}">
        {#if p.look}<Portrait look={p.look} faction={p.faction} size={16} scale={2} />{:else}<span class="inline-block h-8 w-8 bg-[#1a2140]"
          ></span>{/if}
        <span
          use:tip={{
            title: RANK_TITLES[p.faction][p.rank],
            colour: f.colour,
            line: f.name,
            note: p.room ? (p.idle ? 'Idle' : 'In this room') : 'Heard of on the relays',
          }}
        >
          <img
            src={badge(p.faction, p.rank)}
            alt={RANK_TITLES[p.faction][p.rank]}
            width="32"
            height="32"
            style="image-rendering: pixelated"
          />
        </span>
        <Emblem side={p.faction} size={16} />
        <span class="min-w-0 flex-1 truncate" style="color: {f.colour}"
          >{p.callsign}{#if p.idle}<span class="text-ink-dim"> · idle</span>{/if}</span
        >
        {#if p.bounty > 0}<span class="ui-num text-foe" use:tip={{ title: 'Bounty', line: 'Paid to whoever downs him' }}>{p.bounty} CR</span
          >{/if}
        {#if oninvite && p.room && p.faction === side}
          <button
            type="button"
            class="ui-btn ui-btn-small"
            class:is-on={squad.includes(p.key)}
            disabled={squad.includes(p.key) || squad.length >= 3}
            onclick={() => oninvite(p.key)}>{squad.includes(p.key) ? 'Squad' : 'Invite'}</button
          >
        {/if}
        <button
          type="button"
          class="ui-btn ui-btn-small"
          class:is-on={muted.includes(p.key)}
          onclick={() => onmute(p.key)}
          aria-pressed={muted.includes(p.key)}
          use:tip={{ title: 'Mute', line: 'Hides his chat' }}>{muted.includes(p.key) ? 'Muted' : 'Mute'}</button
        >
        <button
          type="button"
          class="ui-btn ui-btn-small"
          class:is-on={blocked.includes(p.key)}
          onclick={() => onblock(p.key)}
          aria-pressed={blocked.includes(p.key)}
          use:tip={{ title: 'Block', line: 'Hides his chat and the marks he leaves' }}
          >{blocked.includes(p.key) ? 'Blocked' : 'Block'}</button
        >
      </li>
    {:else}
      <li class="flex items-center gap-3 border-2 border-dashed border-ink/20 px-4 py-4">
        <UiIcon name="map" size={32} />
        <span class="ui-body text-ink-dim">Nobody else here. The galaxy map shows where pilots are.</span>
      </li>
    {/each}
  </ul>
</Panel>
