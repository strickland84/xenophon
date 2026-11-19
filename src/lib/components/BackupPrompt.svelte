<script lang="ts">
  // The reminder to keep a pilot safe (the plan's section 15: after the first session, and gently again
  // until it is done), after art/mockups/backup.png: one panel with a key, two lines saying why, his
  // key as a phrase in a box (hidden until shown), and Save a file, Copy the phrase, Later; and
  // whether a sealed copy goes to the relays too, so the phrase alone brings him back elsewhere.
  import { onMount } from 'svelte'
  import { arrows, padNav } from '../input/padnav'
  import { phraseOf } from '../save/backup'
  import { button, pressed } from './styles'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    callsign: string
    secret: string
    /** a sealed copy is kept on the relays (and whether the relays can be reached at all) */
    sealed: boolean
    online: boolean
    colour: string
    onfile: () => void
    onphrase: () => void
    onsealed: (on: boolean) => void
    /** not now (asked again later), or done (kept safe one way or another) */
    onlater: () => void
    ondone: () => void
  }
  let { callsign, secret, sealed, online, colour, onfile, onphrase, onsealed, onlater, ondone }: Props = $props()

  let panel = $state<HTMLElement>()
  let shown = $state(false)
  let kept = $state('')
  const phrase = $derived(phraseOf(secret))

  onMount(() => {
    panel?.querySelector<HTMLElement>('button')?.focus()
    return panel ? padNav(panel, onlater) : undefined
  })

  async function copy() {
    try {
      await navigator.clipboard.writeText(phrase)
      kept = 'Copied: keep it away from this browser (a password manager, or paper)'
      onphrase()
    } catch {
      shown = true
      kept = 'Select the phrase and copy it by hand'
    }
  }
  function file() {
    onfile()
    kept = 'Saved: keep the file away from this browser'
  }
</script>

<div
  class="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-[#060a18]/75 px-3 py-[max(10px,env(safe-area-inset-top))]"
  role="presentation"
  onpointerdown={(e) => e.stopPropagation()}
  onpointerup={(e) => e.stopPropagation()}
  onkeydown={(e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onlater()
    } else if (panel) arrows(panel, e)
  }}
>
  <div
    bind:this={panel}
    class="ui-panel menu max-w-[38rem] gap-4 p-4 pt-5"
    style="border-color: {colour}"
    aria-label="Keep your pilot safe"
    role="dialog"
    aria-modal="true"
  >
    <header class="flex items-center gap-3">
      <UiIcon name="key" size={48} />
      <div class="flex flex-col gap-1.5">
        <h2 class="ui-head">Keep {callsign} safe</h2>
        <p
          class="ui-label"
          use:tip={{
            title: 'Why',
            line: `Everything ${callsign} has is in this browser. Clear its data and he is gone for good, unless you keep his key.`,
          }}
        >
          He lives only in this browser
        </p>
      </div>
    </header>
    <div class="flex items-center gap-2">
      <code class="ui-body min-w-0 flex-1 border-2 bg-black/25 px-3 py-2 break-all normal-case select-all" style="border-color: {colour}88"
        >{shown ? phrase : 'nsec1' + '•'.repeat(24)}</code
      >
      <button type="button" class={button} onclick={() => (shown = !shown)}>{shown ? 'Hide' : 'Show'}</button>
    </div>
    <p class="ui-label">Whoever has it can fly as {callsign}</p>
    {#if online}
      <div class="flex flex-wrap items-center gap-3">
        <span
          class="ui-body"
          use:tip={{ title: 'Sealed copy', line: 'Locked with his key on the relays: the phrase alone brings him back on another device' }}
          >Sealed copy on the relays</span
        >
        <button type="button" class={sealed ? pressed : button} aria-pressed={sealed} onclick={() => onsealed(!sealed)}
          >{sealed ? '■ On' : 'Off'}</button
        >
      </div>
    {/if}
    {#if kept}<p class="ui-body text-accent" role="status">{kept}</p>{/if}
    <div class="flex flex-wrap gap-2">
      <button type="button" class="ui-btn ui-btn-main" onclick={copy}>Copy the phrase</button>
      <button type="button" class={button} onclick={file}>Save a file</button>
      {#if kept}
        <button type="button" class="{pressed} ml-auto" onclick={ondone}>Done</button>
      {:else}
        <button type="button" class="ui-btn ui-btn-quiet ml-auto" onclick={onlater}>Later</button>
      {/if}
    </div>
  </div>
</div>
