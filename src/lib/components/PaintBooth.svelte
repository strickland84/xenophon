<script lang="ts">
  // The hangar's paint booth: every colour of the ship (its hull, markings, trim, glass, engine glow
  // and trails), each from a colour picker or the swatches; a pattern over its body; an emblem on its
  // left wing (four are earned by feats) and his side's mark on its right; and schemes kept to paint
  // any of his ships with. All of it is free, and shows on the ship in front of him at once; other
  // players see it too.
  import { asset } from '$app/paths'
  import { EMBLEMS, PAINTS, PATTERN_NAMES, PATTERNS } from '../engine'
  import { EMBLEM_FEATS } from '../save/ships'
  import { FEATS } from '../save/progress'
  import type { Livery, ShipRecord } from '../save/ships'
  import Panel from './Panel.svelte'
  import Tabs from './Tabs.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    ship: ShipRecord
    schemes: Livery[]
    feats: string[]
    onclose: () => void
    onpaint: (change: Partial<Livery>) => void
    onkeep: () => void
    onscheme: (i: number) => void
    ondrop: (i: number) => void
  }
  let { ship, schemes, feats, onclose, onpaint, onkeep, onscheme, ondrop }: Props = $props()

  const COLOURS: [keyof Livery, string, string][] = [
    ['body', 'Hull', 'The body of the ship'],
    ['accent', 'Markings', 'The hull’s own markings'],
    ['trim', 'Trim', 'Fitted parts and the pattern'],
    ['canopy', 'Glass', 'The canopy'],
    ['glow', 'Glow', 'The engines and their exhaust'],
    ['trail', 'Trails', 'Off the wingtips'],
  ]
  // (the colour a picker shows for one not chosen: the hull's own)
  const shown = (k: keyof Livery) => (ship.paint[k] as string) || (k === 'trim' ? '#8e96a4' : k === 'glow' ? '#48829a' : '#ffffff')
  const emblem = (id: string) => asset(`/emblems/${id}.png` as Parameters<typeof asset>[0])
  type Tab = 'colours' | 'pattern' | 'emblem' | 'schemes'
  let tab = $state<Tab>('colours')
  /** the part the swatches paint */
  let part = $state<keyof Livery>('body')
  const partName = $derived(COLOURS.find(([k]) => k === part)?.[1] ?? '')
  const featText = (id: string) => FEATS.find((f) => f.id === id)?.text ?? id
</script>

<Panel title="Paint" sub={ship.hull} label="Paint booth" size="wide" beside {onclose}>
  {#snippet tabs()}
    <Tabs
      items={[
        { id: 'colours', label: 'Colours', icon: 'paint' },
        { id: 'pattern', label: 'Pattern' },
        { id: 'emblem', label: 'Emblem' },
        { id: 'schemes', label: `Schemes${schemes.length ? ` ${schemes.length}` : ''}` },
      ]}
      value={tab}
      onchange={(t) => (tab = t as Tab)}
      label="Paint"
    />
  {/snippet}

  {#key tab}
    {#if tab === 'colours'}
      <div class="ui-settle flex flex-col gap-4">
        <!-- the parts: pick one, then its colour (under them: the booth stands beside the ship, narrow) -->
        <div class="grid grid-cols-3 gap-1.5" style="--i: 0" role="radiogroup" aria-label="Part">
          {#each COLOURS as [k, name, what] (k)}
            <button
              type="button"
              role="radio"
              aria-checked={part === k}
              class="ui-row min-w-0"
              class:is-on={part === k}
              onclick={() => (part = k)}
              use:tip={{ title: name, line: what }}
            >
              <span class="h-6 w-6 flex-none border-2 border-black/50" style="background: {shown(k)}"></span>
              {name}
            </button>
          {/each}
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-3" style="--i: 1">
          <h3 class="ui-label">{partName}</h3>
          <div class="flex flex-wrap gap-2">
            {#each PAINTS.filter((p) => !p.feat) as p (p.colour)}
              <button
                type="button"
                class="swatch"
                aria-pressed={(ship.paint[part] as string).toLowerCase() === p.colour}
                style="background: {p.colour}"
                aria-label="{partName}: {p.name}"
                onclick={() => onpaint({ [part]: p.colour })}
                use:tip={{ title: p.name }}
              ></button>
            {/each}
            <label class="swatch any" use:tip={{ title: 'Any colour' }}>
              <input
                type="color"
                class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                value={shown(part)}
                aria-label="{partName}: any colour"
                oninput={(e) => onpaint({ [part]: (e.currentTarget as HTMLInputElement).value })}
              />
              <span aria-hidden="true">+</span>
            </label>
          </div>
          {#if part === 'trim' || part === 'glow' || part === 'trail'}
            <button type="button" class="ui-btn self-start {!ship.paint[part] ? 'is-on' : ''}" onclick={() => onpaint({ [part]: '' })}
              >Hull's own</button
            >
          {/if}
        </div>
      </div>
    {:else if tab === 'pattern'}
      <div class="ui-settle flex flex-wrap gap-2">
        {#each PATTERNS as p, i (p)}
          <button
            type="button"
            class="ui-well pattern"
            class:picked={ship.paint.pattern === p}
            style="--i: {i}"
            aria-label={PATTERN_NAMES[p]}
            onclick={() => onpaint({ pattern: p })}
            use:tip={{ title: PATTERN_NAMES[p], line: p ? 'In the trim colour, or the markings if there is none' : undefined }}
          >
            <img src="/ui/pattern-{p || 'plain'}.png" alt="" width="72" height="108" style="image-rendering: pixelated" />
          </button>
        {/each}
      </div>
    {:else if tab === 'emblem'}
      <div class="ui-settle flex flex-col gap-4">
        <div class="flex flex-wrap gap-2" style="--i: 0">
          {#each EMBLEMS as id (id)}
            {@const feat = EMBLEM_FEATS[id]}
            {@const locked = !!feat && !feats.includes(feat)}
            <button
              type="button"
              class="ui-well"
              class:picked={ship.paint.emblem === id}
              disabled={locked}
              aria-label={id ? `${id}${locked ? ', earned by a feat' : ''}` : 'No emblem'}
              onclick={() => onpaint({ emblem: id })}
              use:tip={id
                ? { title: id, line: 'On the left wing', note: locked ? `Earned: ${featText(feat)}` : undefined }
                : { title: 'No emblem' }}
            >
              {#if id}<img
                  src={emblem(id)}
                  alt=""
                  width="48"
                  height="48"
                  class:opacity-30={locked}
                  style="image-rendering: pixelated"
                />{:else}<span class="ui-head">–</span>{/if}
            </button>
          {/each}
        </div>
        <button
          type="button"
          class="ui-btn self-start"
          class:is-on={ship.paint.mark}
          style="--i: 1"
          aria-label="Side's mark {ship.paint.mark ? 'on' : 'off'}"
          onclick={() => onpaint({ mark: !ship.paint.mark })}
          use:tip={{ title: 'Your side’s mark', line: 'On the right wing' }}>Side's mark · {ship.paint.mark ? 'On' : 'Off'}</button
        >
      </div>
    {:else}
      <div class="ui-settle flex flex-wrap items-center gap-2">
        {#each schemes as s, i (i)}
          <span class="flex items-center" style="--i: {i}">
            <button type="button" class="ui-btn gap-1" onclick={() => onscheme(i)} aria-label="Paint with scheme {i + 1}">
              {#each [s.body, s.accent, s.trim || s.body, s.canopy] as c, j (j)}<span class="block h-6 w-4" style="background: {c}"
                ></span>{/each}
            </button>
            <button type="button" class="ui-btn ui-btn-icon" onclick={() => ondrop(i)} aria-label="Forget scheme {i + 1}">x</button>
          </span>
        {:else}
          <p class="ui-body text-ink-dim">No schemes kept yet</p>
        {/each}
        <button type="button" class="ui-btn ui-btn-main" disabled={schemes.length >= 8} onclick={onkeep}>Keep this one</button>
      </div>
    {/if}
  {/key}
</Panel>

<style>
  /* (a pattern's picture is 72 by 108: in the usual 64 px well it was cut off by the panel's foot) */
  .pattern {
    width: 80px;
    height: 116px;
  }
  .swatch {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    cursor: pointer;
    border: 2px solid rgb(0 0 0 / 0.55);
    outline: none;
    transition: transform var(--t-press) ease-out;
  }
  .swatch[aria-pressed='true'] {
    border-color: var(--color-ink);
    box-shadow:
      0 0 0 2px var(--color-night),
      0 0 0 4px var(--color-ink);
  }
  .swatch:hover {
    transform: translateY(-2px);
  }
  .swatch:focus-visible,
  .swatch:focus-within {
    box-shadow:
      0 0 0 2px var(--color-night),
      0 0 0 4px var(--color-accent);
  }
  .swatch.any {
    border: 2px dashed rgb(244 236 208 / 0.6);
    font: 28px var(--font-pixel);
    color: var(--color-ink);
  }
  .picked {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 18%, #121a36);
  }
</style>
