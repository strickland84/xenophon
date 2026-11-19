<script lang="ts">
  // The first pilot to land on a world names it, for good (the plan's section 13): offered four names
  // in his side's voice (galaxy/territory.ts discoveryNames: the rule accepts only those, so no name
  // can be made up), or he keeps the one it has for now and may name it next time he lands.
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    /** the world's name now, and the names he may give it */
    now: string
    names: string[]
    colour: string
    onpick: (name: string) => void
    onclose: () => void
  }
  let { now, names, colour, onpick, onclose }: Props = $props()
</script>

<Panel title="First to land" sub={now} label="Name this world" size="narrow" tabCloses={false} {onclose}>
  {#snippet lead()}
    <UiIcon name="map" size={32} />
  {/snippet}
  <div class="ui-settle flex flex-col gap-4">
    <p
      class="ui-body"
      style="--i: 0"
      use:tip={{ title: 'Naming a world', line: 'It is its name on every map, for good, with yours beside it' }}
    >
      Name it, for good
    </p>
    <div class="grid grid-cols-2 gap-2" style="--i: 1">
      {#each names as n (n)}
        <button type="button" class="ui-btn" style="border-color: {colour}" onclick={() => onpick(n)}>{n}</button>
      {/each}
    </div>
    <button type="button" class="ui-btn ui-btn-quiet self-start" style="--i: 2" onclick={onclose}>Not now</button>
  </div>
</Panel>
