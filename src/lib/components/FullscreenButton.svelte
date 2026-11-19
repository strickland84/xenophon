<script lang="ts">
  // Full screen: a small button at the top of the scene, beside the sound button, that does what F11 does: the whole
  // page fills the screen with no browser round it, and a second press (or Esc) gives the window back.
  import { onMount } from 'svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'
  interface Props {
    /** after a press (the scene takes the keys back) */
    ondone?: () => void
  }
  let { ondone }: Props = $props()

  // whether the page fills the screen now (Esc, or the browser's own controls, can end it too)
  let full = $state(false)
  // (a browser that cannot do it gets no button)
  let can = $state(false)

  onMount(() => {
    can = document.fullscreenEnabled
    const changed = () => (full = document.fullscreenElement !== null)
    changed()
    document.addEventListener('fullscreenchange', changed)
    return () => document.removeEventListener('fullscreenchange', changed)
  })

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      // (refused: the browser keeps the window as it was)
    }
    ondone?.()
  }
</script>

{#if can}
  <button
    type="button"
    aria-label={full ? 'Leave full screen' : 'Full screen'}
    aria-pressed={full}
    class="ui-btn ui-btn-small pointer-events-auto border-ink/25 px-2 {full ? 'bg-ink/15' : 'bg-night/55'}"
    use:tip={{ title: full ? 'Leave full screen' : 'Full screen', line: full ? 'Press again, or Esc' : 'Fill the screen, as F11 does' }}
    style="touch-action: none"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onclick={toggle}
  >
    <UiIcon name="fullscreen" size={32} />
  </button>
{/if}
