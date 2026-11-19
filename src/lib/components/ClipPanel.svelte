<script lang="ts">
  // A clip just kept (display/clips.ts): the last seconds of play as a short film, played over and over, with what to
  // do with it: share it (where the device hands a file to whatever he shares with), save it, and copy the link that
  // puts whoever follows it on his wing (net/wing.ts), to send with it.
  import type { Clip } from '../display/clips'
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'

  interface Props {
    clip: Clip
    /** an address for the film's bytes, to play it from */
    url: string
    /** the wing link to send with it ('' none: offline) */
    link: string
    callsign: string
    onclose: () => void
  }
  let { clip, url, link, callsign, onclose }: Props = $props()
  let copied = $state(false)
  const file = $derived(new File([clip.blob], clip.file, { type: clip.type }))
  const canShare = $derived(
    typeof navigator !== 'undefined' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }),
  )
  const words = $derived(`Fly on ${callsign}'s wing in Xenophon: Twin Stars`)

  async function share() {
    try {
      await navigator.share({ files: [file], title: 'Xenophon: Twin Stars', text: link ? `${words}: ${link}` : words })
    } catch {
      // (shared with nobody: nothing to do)
    }
  }
  /** the film saved as a file, by the browser's own way of saving one */
  function saveFilm() {
    const a = document.createElement('a')
    a.href = url
    a.download = clip.file
    a.click()
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      copied = true
    } catch {
      copied = false
    }
  }
</script>

<Panel title="Clip" sub="{Math.round(clip.seconds)} seconds" size="normal" {onclose}>
  {#snippet lead()}
    <UiIcon name="picture" size={32} />
  {/snippet}
  <div class="ui-settle flex flex-col gap-3">
    <video class="w-full border-2 border-ink/30 bg-black" style="--i: 0" src={url} autoplay loop muted playsinline controls></video>
    <div class="flex flex-wrap gap-2" style="--i: 1">
      {#if canShare}<button type="button" class="ui-btn ui-btn-main" onclick={share}>Share</button>{/if}
      <button type="button" class="ui-btn {canShare ? '' : 'ui-btn-main'}" onclick={saveFilm}>Save the film</button>
      {#if link}<button type="button" class="ui-btn" onclick={copy}>{copied ? 'Link copied' : 'Copy your wing link'}</button>{/if}
    </div>
    {#if link}<p class="ui-label text-ink-dim" style="--i: 2">Send the link with it: whoever follows it lands on your wing.</p>{/if}
  </div>
</Panel>
