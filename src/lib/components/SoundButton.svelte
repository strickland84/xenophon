<script lang="ts">
  // The volume: a small button at the top of the scene, a speaker and three bars, that steps it through
  // off, low, middle and high. (The sound itself only starts once the player has clicked, touched or
  // pressed a key: browsers ask for that.)
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'
  interface Props {
    /** how loud it is now, 0..1 */
    volume: number
    /** a new volume was picked */
    onchange: (volume: number) => void
  }
  let { volume, onchange }: Props = $props()

  const STEPS = [
    { level: 0, name: 'Off' },
    { level: 0.35, name: 'Low' },
    { level: 0.7, name: 'Mid' },
    { level: 1, name: 'High' },
  ]
  // the step nearest the volume now
  const at = $derived(STEPS.reduce((best, s, i) => (Math.abs(s.level - volume) < Math.abs(STEPS[best].level - volume) ? i : best), 0))
  const next = () => onchange(STEPS[(at + 1) % STEPS.length].level)
</script>

<button
  type="button"
  aria-label="Sound: {STEPS[at].name}. Press for {STEPS[(at + 1) % STEPS.length].name}"
  class="ui-btn ui-btn-small pointer-events-auto gap-1.5 border-ink/25 bg-night/55 px-2"
  use:tip={{ title: `Sound: ${STEPS[at].name}`, line: 'Press for the next step; Settings has both volumes' }}
  style="touch-action: none"
  onpointerdown={(e) => e.stopPropagation()}
  onpointerup={(e) => e.stopPropagation()}
  onclick={next}
>
  <UiIcon name="sound" size={32} />
  <!-- (how loud, as three bars: none is off) -->
  <span class="flex items-end gap-[2px]" aria-hidden="true">
    {#each [1, 2, 3] as b (b)}
      <span class="block w-[5px] transition-colors {at >= b ? 'bg-ink' : 'bg-ink/20'}" style="height: {4 + b * 5}px"></span>
    {/each}
  </span>
</button>
