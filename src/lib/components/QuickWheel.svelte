<script lang="ts">
  // Preset phrases to pick from: the quick-chat phrases (eight) and the words a beacon can say (twelve). Never free text,
  // so neither can be used for abuse. A panel of the interface's own pieces (the fresh review: the old wheel was twelve
  // boxes of three sizes over one another, three of them without a key, its title written across Close): a grid of
  // phrase buttons, each the same size with its key cap, three across, and four on a short window (two rows less, so all
  // twelve fit its height). A click, the keys along the top row (1 to 9, then 0, - and =) or a
  // controller (padnav.ts, through the panel) pick one.
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'

  interface Props {
    /** what it is for, in a few words (the panel's title) */
    title: string
    phrases: string[]
    /** a colour for the buttons' frames (the side's) */
    colour: string
    onpick: (n: number) => void
    onclose: () => void
  }
  let { title, phrases, colour, onpick, onclose }: Props = $props()

  /** the key that picks each phrase: the top row of the keyboard, in order */
  const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=']

  function onkeydown(e: KeyboardEvent) {
    const n = KEYS.indexOf(e.key)
    if (n >= 0 && n < phrases.length) {
      e.preventDefault()
      e.stopPropagation()
      onpick(n)
    }
  }
</script>

<svelte:window {onkeydown} />

<Panel {title} label={title} size="normal" tabCloses={false} {onclose}>
  {#snippet lead()}
    <UiIcon name={phrases.length > 8 ? 'beacon' : 'chat'} size={32} />
  {/snippet}
  <div class="phrases ui-settle grid gap-2" style="--n: {phrases.length}">
    {#each phrases as p, i (i)}
      <button
        type="button"
        class="ui-btn phrase justify-start gap-3 text-left"
        style="--i: {i}; border-color: {colour}"
        aria-keyshortcuts={KEYS[i]}
        onclick={() => onpick(i)}
      >
        {#if KEYS[i]}<span class="ui-key flex-none" aria-hidden="true">{KEYS[i]}</span>{/if}
        <span class="leading-tight whitespace-normal">{p}</span>
      </button>
    {/each}
  </div>
</Panel>

<style>
  /* three across; on a short window four across, so twelve take three rows */
  .phrases {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .phrase {
    min-height: 3.25rem;
  }
  @media (max-height: 480px) {
    .phrases {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .phrase {
      min-height: 2.75rem;
    }
  }
</style>
