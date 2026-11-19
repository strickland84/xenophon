<script lang="ts" generics="T extends string">
  // A row of tabs: a word each (and its icon, if it has one), the chosen one lit with the side's colour
  // underneath. The arrow keys move along them as along any row of buttons (padnav.ts).
  import UiIcon from './UiIcon.svelte'

  interface Props {
    items: { id: T; label: string; icon?: string; disabled?: boolean }[]
    value: T
    onchange: (id: T) => void
    /** what screen readers call the row */
    label: string
  }
  let { items, value, onchange, label }: Props = $props()
</script>

<div class="ui-tabs" role="tablist" aria-label={label}>
  {#each items as t (t.id)}
    <button type="button" role="tab" class="ui-tab" aria-selected={value === t.id} disabled={t.disabled} onclick={() => onchange(t.id)}>
      {#if t.icon}<UiIcon name={t.icon} size={32} />{/if}
      {t.label}
    </button>
  {/each}
</div>
