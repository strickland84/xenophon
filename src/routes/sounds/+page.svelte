<script lang="ts">
  // The sampler: every sound effect and every piece of music, grouped and named, each with all of
  // its takes (the audio models' attempts) playable side by side, the ones the game plays lit gold.
  // Nobody on the machine that made them can hear, so this is where James's ears choose: "the cannon
  // is weak, use take 3" becomes `use=[3]` in tools/gen/sound_recipe.py. Effects play at the level
  // the game evens them to, so takes can be compared; music streams, with its own controls to scrub.
  // Built to art/mockups/sounds.png, in the gallery's look.
  import { asset, resolve } from '$app/paths'
  import { AUDIO_BYTES, EFFECTS, PIECES } from '#lib/audio/catalogue.ts'
  import type { Clip, EffectName, PieceName } from '#lib/audio/catalogue.ts'
  import { effectPath, piecePath } from '#lib/audio/library.ts'
  import MusicCandidates from '#lib/components/MusicCandidates.svelte'

  type Entry = { name: string; clip: Clip }
  const effects: Entry[] = Object.entries(EFFECTS).map(([name, clip]) => ({ name, clip }))
  const groups = [...new Set(effects.map((e) => e.clip.group)), 'Music']
  /** the sounds made since James last listened, to be judged first */
  const fresh = effects.filter((e) => e.clip.new)
  const pieces: Entry[] = Object.entries(PIECES).map(([name, clip]) => ({ name, clip }))
  const takes = (list: Entry[]) => list.reduce((n, e) => n + e.clip.takes.length, 0)
  const mb = (bytes: number) => (bytes / 1e6).toFixed(1)

  /** the group shown ('' all) */
  let only = $state('')
  /** the take playing now, as "name_n" */
  let playing = $state('')

  const url = (path: string) => asset(path as Parameters<typeof asset>[0])

  // ── playing an effect: decoded once, at the game's evening gain
  let ctx: AudioContext | null = null
  /** the takes decoded so far (a cache, not shown) */
  const decoded: Record<string, AudioBuffer> = {}
  let source: AudioBufferSourceNode | null = null

  async function bufferOf(name: string, n: number) {
    const key = `${name}_${n}`
    const had = decoded[key]
    if (had) return had
    for (const path of [effectPath(name as EffectName, n)]) {
      try {
        const r = await fetch(url(path))
        if (!r.ok) continue
        const b = await ctx!.decodeAudioData(await r.arrayBuffer())
        decoded[key] = b
        return b
      } catch {
        /* (the other kind) */
      }
    }
    return null
  }

  async function play(e: Entry, n: number) {
    const key = `${e.name}_${n}`
    source?.stop()
    source = null
    if (playing === key && e.clip.loop) {
      playing = ''
      return
    }
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    playing = key
    const b = await bufferOf(e.name, n)
    if (!b || playing !== key) {
      if (!b) playing = ''
      return
    }
    const src = ctx.createBufferSource()
    src.buffer = b
    // (a loop goes round until stopped, so its seam can be heard)
    src.loop = e.clip.loop
    const g = ctx.createGain()
    g.gain.value = 0.5 * Math.min(2, e.clip.takes.find((t) => t.n === n)?.gain ?? 1)
    src.connect(g)
    g.connect(ctx.destination)
    src.onended = () => {
      if (playing === key) playing = ''
    }
    src.start()
    source = src
  }

  /** one music player at a time */
  function onlyOne(e: Event) {
    for (const el of document.querySelectorAll('audio')) if (el !== e.target) el.pause()
    source?.stop()
  }

  const base =
    'pixel-text cursor-pointer border-2 border-ink/70 px-2.5 py-1.5 text-[14px] leading-none uppercase outline-none hover:bg-ink hover:text-night focus-visible:bg-ink focus-visible:text-night'
  const chip = `${base} bg-night text-ink`
  const pick = (on: boolean) => (on ? `${base} bg-ink text-night` : chip)
  /** a take's button: gold when the game plays it, cream while it plays */
  const takeClass = (chosen: boolean, on: boolean) =>
    `pixel-text flex min-w-[52px] cursor-pointer items-center justify-center gap-1.5 border-2 px-2 py-1.5 text-[14px] leading-none uppercase outline-none focus-visible:outline-2 focus-visible:outline-ink ${
      on
        ? 'border-ink bg-ink text-night'
        : chosen
          ? 'border-nomarchy bg-nomarchy/20 text-nomarchy hover:bg-nomarchy hover:text-night'
          : 'border-ink/50 text-ink hover:bg-ink hover:text-night'
    }`
</script>

<svelte:head>
  <title>The sounds · Xenophon: Twin Stars</title>
</svelte:head>

<main class="min-h-screen bg-night px-4 py-4 text-ink sm:px-6">
  <header class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
    <h1 class="pixel-text text-[28px] leading-none uppercase">The sounds</h1>
    <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">
      {effects.length} effects ({takes(effects)} takes) and {pieces.length} pieces of music ({takes(pieces)} takes), made on this PC. Nobody has
      heard them yet. <span class="text-nomarchy">Gold</span>: the take the game plays. The game downloads {mb(AUDIO_BYTES.game)} MB.
    </p>
    <a class="{chip} ml-auto" href={resolve('/')}>Back to the game</a>
  </header>
  <p class="pixel-text mb-3 text-[14px] leading-tight text-ink-dim uppercase">
    To change one, say its name and take: "cannon: use take 3". Mixes to listen to: art/audio/samplers.
  </p>
  {#if fresh.length}
    <p class="pixel-text mb-3 text-[14px] leading-tight text-nomarchy uppercase">
      New since you last listened: {fresh.length} ({[...new Set(fresh.map((e) => e.clip.group))].join(', ')}), marked new.
    </p>
  {/if}

  <MusicCandidates onplay={onlyOne} />

  <nav class="mb-4 flex flex-wrap gap-1.5" aria-label="Show">
    <button type="button" class={pick(only === '')} aria-pressed={only === ''} onclick={() => (only = '')}>All</button>
    {#each groups as g (g)}
      <button type="button" class={pick(only === g)} aria-pressed={only === g} onclick={() => (only = g)}>{g}</button>
    {/each}
  </nav>

  {#each groups.filter((g) => !only || g === only) as group (group)}
    <section class="mb-6">
      {#if group === 'Music'}
        <h2 class="pixel-text mb-2 text-[21px] leading-none uppercase">
          Music <span class="text-[14px] text-ink-dim">{pieces.length}</span>
        </h2>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(min(100%,520px),1fr))] gap-3">
          {#each pieces as e (e.name)}
            <li class="flex flex-col gap-2 border-2 border-ink/60 bg-panel p-2.5">
              <p class="pixel-text text-[21px] leading-none uppercase">
                {e.clip.label} <span class="text-[14px] text-ink-dim">· {e.name}</span>
              </p>
              {#each e.clip.takes as t (t.n)}
                {@const chosen = e.clip.use.includes(t.n)}
                <div class="grid grid-cols-[64px_minmax(0,1fr)_40px] items-center gap-x-2 gap-y-1">
                  <span class="pixel-text text-[14px] leading-none uppercase {chosen ? 'text-nomarchy' : 'text-ink'}">Take {t.n}</span>
                  <audio class="h-8 w-full" controls preload="none" src={url(piecePath(e.name as PieceName, t.n))} onplay={onlyOne}></audio>
                  <span class="pixel-text text-right text-[14px] leading-none text-ink-dim uppercase">
                    {Math.floor(t.seconds / 60)}:{String(Math.round(t.seconds % 60)).padStart(2, '0')}
                  </span>
                  {#if t.flags.length}
                    <span class="pixel-text col-start-2 text-[14px] leading-none text-foe uppercase">{t.flags.join(', ')}</span>
                  {/if}
                </div>
              {/each}
            </li>
          {/each}
        </ul>
      {:else}
        {@const list = effects.filter((e) => e.clip.group === group)}
        <h2 class="pixel-text mb-2 text-[21px] leading-none uppercase">
          {group} <span class="text-[14px] text-ink-dim">{list.length}</span>
        </h2>
        <ul class="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-3">
          {#each list as e (e.name)}
            <li class="flex flex-col gap-2 border-2 border-ink/60 bg-panel p-2.5">
              <p class="pixel-text text-[14px] leading-tight uppercase">
                {#if e.clip.new}<span class="mr-1.5 bg-nomarchy px-1 text-night">New</span>{/if}{e.clip.label}
              </p>
              <p class="pixel-text text-[14px] leading-none text-ink-dim uppercase">
                {e.name}{e.clip.loop ? ' · a loop' : ''}{e.clip.byEar ? ' · chosen by ear' : ''}
              </p>
              <div class="flex flex-wrap gap-1.5">
                {#each e.clip.takes as t (t.n)}
                  {@const chosen = e.clip.use.includes(t.n)}
                  {@const on = playing === `${e.name}_${t.n}`}
                  <button
                    type="button"
                    class={takeClass(chosen, on)}
                    aria-pressed={on}
                    aria-label="{e.clip.label}, take {t.n}{chosen ? ', the game plays it' : ''}{e.clip.loop
                      ? ' (press again to stop)'
                      : ''}"
                    title="{t.seconds}s{t.flags.length ? ' · ' + t.flags.join(', ') : ''}"
                    onclick={() => play(e, t.n)}
                  >
                    <span aria-hidden="true">{on && e.clip.loop ? '■' : '▶'}</span>{t.n}
                  </button>
                {/each}
              </div>
              {#if e.clip.takes.some((t) => t.flags.length)}
                <p class="pixel-text text-[14px] leading-tight text-ink-dim uppercase">
                  {#each e.clip.takes.filter((t) => t.flags.length) as t (t.n)}<span class="mr-2"
                      >{t.n}: <span class="text-foe">{t.flags.join(', ')}</span></span
                    >{/each}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</main>
