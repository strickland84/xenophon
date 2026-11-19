<script lang="ts">
  // The squad (the plan's section 8): up to four pilots of a side flying together. Who is in it,
  // pilots who have asked him into theirs (yes), asking others (from the pilots nearby), leaving it,
  // and computer wingmen filling it when he flies without three others. In tight formation the
  // squad flies in each other's slipstream, a little faster.
  import { SQUAD } from '../engine'
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    on: boolean
    wingmen: boolean
    /** the other pilots in it, and those who asked him (callsigns by key) */
    members: { key: string; callsign: string }[]
    asked: { key: string; callsign: string }[]
    online: boolean
    onform: (on: boolean) => void
    onwingmen: (on: boolean) => void
    onaccept: (key: string) => void
    onleave: () => void
    onnearby: () => void
    /** a wing link asked for: an address that puts a friend on his wing (net/wing.ts) */
    oninvite?: () => void
    onclose: () => void
  }
  let { on, wingmen, members, asked, online, onform, onwingmen, onaccept, onleave, onnearby, oninvite, onclose }: Props = $props()
</script>

<Panel title="Squad" sub="Up to {SQUAD.most}" size="narrow" {onclose}>
  {#snippet lead()}
    <UiIcon name="squad" size={32} />
  {/snippet}
  <div class="ui-settle flex flex-col gap-4">
    <div class="flex flex-wrap gap-2" style="--i: 0">
      <button
        type="button"
        class="ui-btn {on ? 'is-on' : 'ui-btn-main'}"
        aria-pressed={on}
        onclick={() => onform(!on)}
        use:tip={{ title: 'Slipstream', line: 'Fly close beside a squad mate or a wingman, heading his way, and you go a little faster' }}
        >{on ? '■ Flying as a squad' : 'Fly as a squad'}</button
      >
      <button type="button" class="ui-btn" class:is-on={wingmen} aria-pressed={wingmen} disabled={!on} onclick={() => onwingmen(!wingmen)}
        >Wingmen · {wingmen ? 'On' : 'Off'}</button
      >
    </div>
    <div class="flex flex-col gap-1.5" style="--i: 1">
      <h3 class="ui-label">In the squad</h3>
      {#each members as m (m.key)}
        <div class="ui-row">{m.callsign}</div>
      {:else}
        <p class="ui-body text-ink-dim">{on && wingmen ? 'Your computer wingmen' : 'Nobody yet'}</p>
      {/each}
      {#if members.length}<button type="button" class="ui-btn ui-btn-quiet self-start" onclick={onleave}>Leave the squad</button>{/if}
    </div>
    {#if asked.length}
      <div class="flex flex-col gap-1.5" style="--i: 2">
        <h3 class="ui-label">Asked you</h3>
        {#each asked as a (a.key)}
          <div class="ui-row">
            <span class="flex-1">{a.callsign}</span>
            <button type="button" class="ui-btn ui-btn-small ui-btn-main" onclick={() => onaccept(a.key)}>Join</button>
          </div>
        {/each}
      </div>
    {/if}
    <div class="flex flex-wrap gap-2" style="--i: 3">
      {#if online}<button type="button" class="ui-btn" onclick={onnearby}><UiIcon name="pilots" size={32} />Invite pilots here</button>{/if}
      {#if oninvite}<button type="button" class="ui-btn" onclick={oninvite}><UiIcon name="relays" size={32} />Invite by link</button>{/if}
    </div>
  </div>
</Panel>
