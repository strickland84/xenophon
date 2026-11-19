<script lang="ts">
  // The wing link (net/wing.ts), shown to the pilot who made it: the address to send to a friend, a button that copies
  // it, and where the device can, one that hands it to whatever he shares with. Whoever opens it picks a callsign and is
  // flying on his wing, on his side, in a few seconds.
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'

  interface Props {
    /** the address to send */
    link: string
    callsign: string
    onclose: () => void
  }
  let { link, callsign, onclose }: Props = $props()
  let copied = $state(false)
  let field = $state<HTMLInputElement>()
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      copied = true
    } catch {
      // (no clipboard here: the address is selected, to be copied by hand)
      field?.select()
    }
  }
  async function share() {
    try {
      await navigator.share({ title: 'Xenophon: Twin Stars', text: `Fly on ${callsign}'s wing in Xenophon: Twin Stars`, url: link })
    } catch {
      // (shared with nobody: nothing to do)
    }
  }
</script>

<Panel title="Fly with a friend" size="narrow" {onclose}>
  {#snippet lead()}
    <UiIcon name="relays" size={32} />
  {/snippet}
  <div class="ui-settle flex flex-col gap-3">
    <p class="ui-body" style="--i: 0">Send this to a friend. They pick a callsign and arrive on your wing, on your side.</p>
    <input
      bind:this={field}
      class="ui-input w-full"
      style="--i: 1"
      readonly
      value={link}
      aria-label="The link to send"
      onfocus={(e) => e.currentTarget.select()}
    />
    <div class="flex flex-wrap gap-2" style="--i: 2">
      <button type="button" class="ui-btn ui-btn-main" onclick={copy}>{copied ? 'Copied' : 'Copy the link'}</button>
      {#if canShare}<button type="button" class="ui-btn" onclick={share}>Share</button>{/if}
    </div>
    <p class="ui-label text-ink-dim" style="--i: 3">For the next half hour, pilots of your side who come by it join your squad.</p>
  </div>
</Panel>
