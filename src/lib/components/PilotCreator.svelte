<script lang="ts">
  // The pilot creator (the plan's sections 9 and 15): who the pilot is to look at. His race, from
  // his side's three; his portrait's face, skin and eyes (or feathers, brass, shell, fuzz or cap;
  // a throat, a lens, spots or lanterns); his suit's colour and its trim's, which colour his tiny
  // sprite in the world as well. Randomise picks for him. Built to art/mockups/creator.png: the
  // portrait large on the left with the sprite walking under it, the choices on the right. In onboarding after the side, and from the menu later.
  import { untrack } from 'svelte'
  import { FACES, lookOf, lookText, raceOf, racesOf, randomLook, SUITS, TRIMS } from '../engine'
  import type { PilotLook } from '../engine'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import Emblem from './Emblem.svelte'
  import PilotSprite from './PilotSprite.svelte'
  import Portrait from './Portrait.svelte'
  import { button, main, quiet } from './styles'
  import { tip } from './tooltip.svelte'

  interface Props {
    faction: FactionId
    /** the look to begin from (races.ts lookText) */
    look: string
    /** the heading over it */
    title?: string
    /** done, with this look */
    ondone: (look: string) => void
    /** gone back without a change (null: no way back) */
    onback?: (() => void) | null
  }
  let { faction, look, title = 'Your pilot', ondone, onback = null }: Props = $props()

  // (the look begun from, and the choices made from it on)
  const begun = untrack(() => lookOf(look, faction))
  let race = $state(begun.race)
  let face = $state(begun.face)
  let skin = $state(begun.skin)
  let eyes = $state(begun.eyes)
  let suit = $state(begun.suit)
  let trim = $state(begun.trim)
  let rolls = $state(0)
  const now = $derived<PilotLook>({ race, face, skin, eyes, suit, trim })
  const text = $derived(lookText(now))
  const side = $derived(FACTIONS[faction])
  const kind = $derived(raceOf(race))
  const races = $derived(racesOf(faction))

  const wrap = (n: number, most: number) => ((n % most) + most) % most
  function randomise() {
    rolls++
    const l = randomLook(faction, (Date.now() & 0xffffff) ^ (rolls * 7919))
    race = l.race
    face = l.face
    skin = l.skin
    eyes = l.eyes
    suit = l.suit
    trim = l.trim
  }

  const rows = $derived([
    { name: 'Face', value: face, most: FACES, set: (n: number) => (face = n) },
    { name: kind.skinName, value: skin, most: kind.skins.length, set: (n: number) => (skin = n) },
    { name: kind.eyesName, value: eyes, most: kind.eyes.length, set: (n: number) => (eyes = n) },
  ])
</script>

<section class="ui-panel h-full max-w-[56rem] self-center [@media(min-height:520px)]:h-auto" aria-label={title}>
  <header class="flex items-center gap-3 px-4 pt-3 pb-2 max-sm:px-3">
    <Emblem side={faction} size={32} />
    <h2 class="ui-head truncate" style="color: {side.colour}">{title}</h2>
  </header>
  <div class="flex min-h-0 flex-1 gap-5 overflow-y-auto px-4 py-2 max-sm:gap-3 max-sm:px-3">
    <!-- the portrait, large, and the sprite under it as it will walk in the world -->
    <div class="flex shrink-0 flex-col items-center gap-3">
      <div class="border-2 p-0.5" style="border-color: {side.colour}">
        <span class="block [@media(min-height:520px)]:hidden"
          ><Portrait look={text} {faction} scale={4} label="Your pilot's portrait" /></span
        >
        <span class="hidden [@media(min-height:520px)]:block"
          ><Portrait look={text} {faction} scale={7} label="Your pilot's portrait" /></span
        >
      </div>
      <div class="flex items-end gap-2 max-[420px]:hidden [@media(max-height:400px)]:hidden">
        <span class="block [@media(min-height:520px)]:hidden"><PilotSprite look={text} scale={4} /></span>
        <span class="hidden [@media(min-height:520px)]:block"><PilotSprite look={text} scale={7} /></span>
      </div>
    </div>
    <!-- the choices -->
    <div class="flex min-w-0 flex-1 flex-col gap-3 [@media(min-height:520px)]:gap-5">
      <div class="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Race">
        {#each races as r (r.id)}
          <button
            type="button"
            role="radio"
            aria-checked={race === r.id}
            class="ui-row flex-col justify-center gap-1.5 py-2"
            class:is-on={race === r.id}
            onclick={() => {
              race = r.id
              face = wrap(face, FACES)
            }}
            use:tip={{ title: r.name, colour: side.colour, line: r.what }}
          >
            <Portrait look={lookText({ ...now, race: r.id })} {faction} size={16} scale={2} label={r.name} />
            <span class="ui-body" style:color={race === r.id ? side.colour : null}>{r.name}</span>
          </button>
        {/each}
      </div>
      <div class="grid grid-cols-3 gap-2">
        {#each rows as row (row.name)}
          <div class="flex flex-col items-center gap-1.5">
            <span class="ui-label">{row.name}</span>
            <div class="flex items-center gap-1">
              <button
                type="button"
                class="ui-btn ui-btn-icon"
                aria-label="Previous {row.name}"
                onclick={() => row.set(wrap(row.value - 1, row.most))}>&lt;</button
              >
              <span class="ui-body ui-num w-12 text-center">{row.value + 1}/{row.most}</span>
              <button
                type="button"
                class="ui-btn ui-btn-icon"
                aria-label="Next {row.name}"
                onclick={() => row.set(wrap(row.value + 1, row.most))}>&gt;</button
              >
            </div>
          </div>
        {/each}
      </div>
      {#each [{ name: 'Suit', list: SUITS, value: suit, set: (c: string) => (suit = c) }, { name: 'Trim', list: TRIMS, value: trim, set: (c: string) => (trim = c) }] as row (row.name)}
        <div class="flex items-center gap-3">
          <span class="ui-label w-16 shrink-0">{row.name}</span>
          <div class="flex flex-wrap gap-1.5">
            {#each row.list as c (c)}
              <button
                type="button"
                aria-label="{row.name} {c}"
                aria-pressed={row.value === c}
                class="swatch"
                style="background: {c}"
                onclick={() => row.set(c)}
              ></button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
  <footer class="flex items-center gap-2 border-t-2 border-ink/10 px-4 py-3 max-sm:px-3 max-sm:py-2">
    {#if onback}<button type="button" class={quiet} onclick={() => onback?.()}>Back</button>{/if}
    <button type="button" class="{button} ml-auto" onclick={randomise}>Randomise</button>
    <button type="button" class="{main} min-w-[8rem]" style="--color-accent: {side.colour}" onclick={() => ondone(text)}>Done</button>
  </footer>
</section>

<style>
  .swatch {
    width: 34px;
    height: 34px;
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
  .swatch:focus-visible {
    box-shadow:
      0 0 0 2px var(--color-night),
      0 0 0 4px var(--color-accent);
  }
</style>
