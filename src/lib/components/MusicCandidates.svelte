<script lang="ts">
  // Open music to try in place of the game's own: for each place, what plays there now beside other people's MIDI
  // files and tracker modules under open licences, each with who made it and its licence. They are rendered by
  // tools/audio/candidates.mjs into static/candidates/ (not in git), so this shows nothing where they have not been
  // made. Nothing here is played by the game; James says which he likes ("combat: Fight Harder").
  import { asset } from '$app/paths'
  import { onMount } from 'svelte'
  import { PIECES } from '#lib/audio/catalogue.ts'
  import type { PieceName } from '#lib/audio/catalogue.ts'
  import { piecePath } from '#lib/audio/library.ts'

  type Candidate = {
    id: string
    mood: string
    title: string
    by: string
    path: string
    seconds: number
    /** the soundfont it was played through, or its own samples for a module */
    sound: string
    source: { name: string; licence: string; url: string }
  }

  let { onplay }: { onplay: (e: Event) => void } = $props()

  let pieces: Candidate[] = $state([])
  let about = $state('')
  const moods = $derived([...new Set(pieces.map((p) => p.mood))])

  const url = (path: string) => asset(path as Parameters<typeof asset>[0])
  const time = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
  const ours = (mood: string) => PIECES[mood as PieceName]

  onMount(async () => {
    try {
      const r = await fetch(url('/candidates/list.json'))
      if (!r.ok) return
      const list = await r.json()
      about = list.about
      pieces = list.pieces
    } catch {
      /* (not made here) */
    }
  })
</script>

{#if pieces.length}
  <section class="mb-6">
    <h2 class="pixel-text mb-2 text-[21px] leading-none uppercase">
      Open music to try <span class="text-[14px] text-ink-dim">{pieces.length}</span>
    </h2>
    <p class="pixel-text mb-3 text-[14px] leading-tight text-ink-dim uppercase">
      {about} The game's own take is first in each, to compare. To pick one, say its place and title: "combat: Fight Harder".
    </p>
    <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,520px),1fr))] gap-3">
      {#each moods as mood (mood)}
        <li class="flex flex-col gap-2.5 border-2 border-ink/60 bg-panel p-2.5">
          <p class="pixel-text text-[21px] leading-none uppercase">
            {ours(mood)?.label ?? mood} <span class="text-[14px] text-ink-dim">· {mood}</span>
          </p>
          {#if ours(mood)}
            <div class="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-2 gap-y-1">
              <span class="pixel-text col-span-2 text-[14px] leading-none text-nomarchy uppercase">Now: the game's take 1</span>
              <audio class="h-8 w-full" controls preload="none" src={url(piecePath(mood as PieceName, 1))} {onplay}></audio>
              <span class="pixel-text text-right text-[14px] leading-none text-ink-dim uppercase"
                >{time(ours(mood).takes[0]?.seconds ?? 0)}</span
              >
            </div>
          {/if}
          {#each pieces.filter((p) => p.mood === mood) as p (p.id)}
            <div class="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-x-2 gap-y-1">
              <span class="pixel-text col-span-2 text-[14px] leading-tight uppercase">
                {p.title} <span class="text-ink-dim">· {p.by}</span>
              </span>
              <audio class="h-8 w-full" controls preload="none" src={url(p.path)} {onplay}></audio>
              <span class="pixel-text text-right text-[14px] leading-none text-ink-dim uppercase">{time(p.seconds)}</span>
              <span class="pixel-text col-span-2 text-[14px] leading-tight text-ink-dim uppercase">
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve (a page off the site) -->
                <a class="underline hover:text-ink" href={p.source.url} target="_blank" rel="noreferrer">{p.source.name}</a>
                · {p.source.licence} · played through {p.sound}
              </span>
            </div>
          {/each}
        </li>
      {/each}
    </ul>
  </section>
{/if}
