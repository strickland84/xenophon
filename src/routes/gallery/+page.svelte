<script lang="ts">
  // The gallery: every world of the galaxy side by side, seen from above as the game draws it
  // (its light, clouds and weather) with a small map of the whole of it, and its name, kind and
  // recipe, to judge at a glance how different the worlds are. The pictures are drawn off the
  // main thread, one world at a time, one of each kind first. Built to art/mockups/gallery.png.
  import { onMount } from 'svelte'
  import { resolve } from '$app/paths'
  import { ARCHETYPE_NAMES, HABITABLE, theGalaxy } from '#lib/engine/index.ts'
  import type { Archetype, Surface } from '#lib/engine/index.ts'
  import { FACTIONS } from '#lib/save/pilot.ts'
  import { describe } from '#lib/worlds/describe.ts'
  import { drawWorlds } from '#lib/worlds/gallery.ts'
  import type { Shot } from '#lib/worlds/gallery.ts'
  import { MAP, SHOT_H, SHOT_W } from '#lib/worlds/shot.ts'

  const galaxy = theGalaxy()
  const KINDS: Archetype[] = [...HABITABLE, 'moon']

  /** shown by kind or by system, and only one kind or all */
  let order = $state<'kind' | 'system'>('kind')
  let only = $state<Archetype | 'all'>('all')
  /** the pictures drawn so far */
  let shots = $state.raw<Record<string, Shot>>({})
  const drawn = $derived(Object.keys(shots).length)
  const slowest = $derived(Math.max(0, ...Object.values(shots).map((s) => s.ms)))

  /** the worlds in groups, as shown: a heading and its worlds */
  const groups = $derived.by(() => {
    const keep = (w: Surface) => only === 'all' || w.recipe.archetype === only
    if (order === 'kind')
      return KINDS.filter((k) => only === 'all' || k === only).map((k) => ({
        id: k,
        title: ARCHETYPE_NAMES[k],
        colour: '',
        worlds: galaxy.worlds.filter((w) => w.recipe.archetype === k),
      }))
    return galaxy.systems
      .map((s) => ({
        id: s.id,
        title: `${s.name}${s.side ? `, home of ${FACTIONS[s.side].name}` : s.kind === 'core' ? ', the core' : ''}`,
        colour: s.side ? FACTIONS[s.side].colour : '',
        worlds: s.worlds.map((i) => galaxy.worlds[i]).filter(keep),
      }))
      .filter((g) => g.worlds.length > 0)
  })

  /** puts a picture's pixels on its canvas, now and whenever they change */
  function paint(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray<ArrayBuffer> | undefined) {
    const draw = (px: Uint8ClampedArray<ArrayBuffer> | undefined) => {
      if (px) canvas.getContext('2d')?.putImageData(new ImageData(px, canvas.width, canvas.height), 0, 0)
    }
    draw(pixels)
    return { update: draw }
  }

  onMount(() => {
    // one of each kind first, so the variety shows from the start, then the rest
    const byKind = KINDS.map((k) => galaxy.worlds.filter((w) => w.recipe.archetype === k))
    const ids: string[] = []
    for (let i = 0; ids.length < galaxy.worlds.length; i++) for (const list of byKind) if (list[i]) ids.push(list[i].id)
    return drawWorlds(ids, (shot) => (shots = { ...shots, [shot.id]: shot }))
  })

  const base =
    'pixel-text cursor-pointer border-2 border-ink/70 px-2.5 py-1.5 text-[14px] leading-none uppercase outline-none hover:bg-ink hover:text-night focus-visible:bg-ink focus-visible:text-night'
  const chip = `${base} bg-night text-ink`
  /** a button, lit when it is the one chosen */
  const pick = (on: boolean) => (on ? `${base} bg-ink text-night` : chip)
</script>

<svelte:head>
  <title>The worlds · Xenophon: Twin Stars</title>
</svelte:head>

<main class="min-h-screen bg-night px-4 py-4 text-ink sm:px-6">
  <header class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
    <h1 class="pixel-text text-[28px] leading-none uppercase">The worlds</h1>
    <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">
      {galaxy.worlds.filter((w) => w.habitable).length} habitable worlds and {galaxy.worlds.filter((w) => !w.habitable).length} barren moons in
      {galaxy.systems.length} systems, from above as the game draws them.
      {drawn < galaxy.worlds.length
        ? `Drawing: ${drawn} of ${galaxy.worlds.length}`
        : `All drawn; the slowest built in ${Math.round(slowest)} ms`}
    </p>
    <a class="{chip} ml-auto" href={resolve('/')}>Back to the game</a>
  </header>

  <nav class="mb-4 flex flex-wrap gap-1.5" aria-label="Show">
    <button type="button" class={pick(order === 'kind')} aria-pressed={order === 'kind'} onclick={() => (order = 'kind')}>By kind</button>
    <button type="button" class={pick(order === 'system')} aria-pressed={order === 'system'} onclick={() => (order = 'system')}
      >By system</button
    >
    <span class="w-3" aria-hidden="true"></span>
    <button type="button" class={pick(only === 'all')} aria-pressed={only === 'all'} onclick={() => (only = 'all')}>All</button>
    {#each KINDS as k (k)}
      <button type="button" class={pick(only === k)} aria-pressed={only === k} onclick={() => (only = k)}>{ARCHETYPE_NAMES[k]}</button>
    {/each}
  </nav>

  {#each groups as group (group.id)}
    <section class="mb-6">
      <h2 class="pixel-text mb-2 text-[21px] leading-none uppercase" style={group.colour ? `color: ${group.colour}` : ''}>
        {group.title} <span class="text-[14px] text-ink-dim">{group.worlds.length}</span>
      </h2>
      <ul class="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
        {#each group.worlds as w (w.id)}
          {@const words = describe(w)}
          {@const shot = shots[w.id]}
          <li class="flex flex-col border-2 border-ink/60 bg-panel">
            <div class="relative aspect-[16/9] w-full bg-[#060a18]">
              <canvas
                width={SHOT_W}
                height={SHOT_H}
                class="block h-full w-full"
                style="image-rendering: pixelated"
                use:paint={shot?.frame}
                aria-label="{w.name} from above"
              ></canvas>
              <canvas
                width={MAP}
                height={MAP}
                class="absolute right-1.5 bottom-1.5 block w-[26%] border-2 border-ink/70"
                style="image-rendering: pixelated"
                use:paint={shot?.map}
                aria-label="a map of all of {w.name}"
              ></canvas>
              {#if !shot}
                <p class="pixel-text absolute inset-0 flex items-center justify-center text-[14px] text-ink-dim uppercase">Drawing</p>
              {/if}
            </div>
            <div class="flex flex-col gap-1 p-2.5">
              <p class="pixel-text text-[21px] leading-none uppercase">{w.name}</p>
              <p class="pixel-text text-[14px] leading-tight text-ink uppercase">
                {words.kind} <span class="text-ink-dim">· {words.system} · {w.id}</span>
              </p>
              <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">{words.sun}</p>
              <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">{words.body}</p>
              <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">{words.weather}</p>
              <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">{words.flying}</p>
              <a class="{chip} mt-1 self-start" href="{resolve('/')}?world={w.id}">Fly here</a>
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</main>
