<script lang="ts">
  // How the sky stands, at the top of the scene beside the sound button: how many pilots are in
  // it, and whether the relays that introduce them answer. Pressing it opens the menu, where the
  // connection screen is.
  import type { NetState } from '../net/online'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    sky: NetState
    onclick: () => void
  }
  let { sky, onclick }: Props = $props()

  const pilots = $derived(sky.on ? sky.pilots.length : 0)
  const relaysUp = $derived(sky.on ? sky.health.relays.filter((r) => r.up).length : 0)
  const relaysAll = $derived(sky.on ? sky.health.relays.length : 0)
  const text = $derived(!sky.on ? (sky.why === 'starting' ? 'Connecting' : 'Offline') : pilots > 0 ? `${pilots + 1} pilots` : 'Alone')
  /** what the badge says: how many pilots, or that he is alone or offline (the rest in its tooltip and the menu) */
  const short = $derived(!sky.on ? (sky.why === 'starting' ? '…' : 'Off') : String(pilots + 1))
  // the relays: a filled square when some answer, hollow while none do yet, none for a transport without them
  const relayLook = $derived(!sky.on || relaysAll === 0 ? null : relaysUp > 0 ? 'up' : 'down')
</script>

<button
  type="button"
  aria-label="The sky: {text}{relayLook ? `, relays ${relaysUp} of ${relaysAll} answering` : ''}. Press for the connection screen"
  class="ui-btn ui-btn-small pointer-events-auto gap-2 border-ink/25 bg-night/55 px-2.5"
  use:tip={{
    title: text,
    line: sky.on
      ? relaysAll
        ? `Relays ${relaysUp} of ${relaysAll} answering`
        : 'Looking for relays'
      : sky.why === 'starting'
        ? 'Finding the relays'
        : 'Flying alone, never online',
    note: 'The menu has the connection screen',
  }}
  style="touch-action: none"
  onpointerdown={(e) => e.stopPropagation()}
  onpointerup={(e) => e.stopPropagation()}
  {onclick}
>
  {#if relayLook}
    <span
      class="inline-block h-3 w-3 border-2 {relayLook === 'up' ? 'border-ok bg-ok' : 'border-nomarchy bg-transparent'}"
      aria-hidden="true"
    ></span>
  {/if}
  <UiIcon name="pilots" size={32} />
  <span class="ui-num">{short}</span>
</button>
