<script lang="ts">
  // The first screen (the plan's section 15): the title with Play, then a callsign, then a side, then
  // the pilot (PilotCreator: race, face, colours, or Randomise), and into the game. The key pair was made
  // silently when the save was. A side's card sells it: its home (Meridian Ring, the Raft) and its emblem
  // drawn by the image model, its creed, its three peoples, how many of its pilots fly now (their presence
  // on the relays), and the smaller side's joining bonus; the rest is a tooltip away. A pilot who has
  // flown before is restored instead, from his pilot file or his key phrase (save/backup.ts); the title
  // opens the settings too, and the opening story again (IntroCrawl, shown once before it to a new pilot).
  // The game flies itself behind. Each step slides in from the
  // way it came (reduced motion: a fade).
  import { asset } from '$app/paths'
  import { onMount, tick } from 'svelte'
  import { audio } from '../audio/mixer'
  import { saidWithin, speak } from '../audio/narration'
  import { fade, fly } from 'svelte/transition'
  import { CALLSIGN_MAX, callsignProblem, cleanCallsign, FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import { JOINING_BONUS, lookOf, lookText, racesOf, randomLook } from '../engine'
  import Emblem from './Emblem.svelte'
  import PilotCreator from './PilotCreator.svelte'
  import Portrait from './Portrait.svelte'
  import SceneBackdrop from './SceneBackdrop.svelte'
  import { ms, moving } from './motion'
  import { main, quiet, button } from './styles'
  import { tip } from './tooltip.svelte'

  interface Props {
    /** the callsign, side and look chosen: into the game */
    ondone: (callsign: string, faction: FactionId, look: string) => void
    /** a pilot file was picked, to restore that pilot instead (returns why it would not do, or null) */
    onrestore: (file: File) => Promise<string | null>
    /** a key phrase given, to restore that pilot (from the relays' sealed copy, or his key alone): why it would not do, or null */
    onphrase: (phrase: string) => Promise<string | null>
    /** the settings asked for */
    onsettings: () => void
    /** the opening story asked for again (IntroCrawl) */
    onstory?: () => void
    /** pilots of each side flying now (null: not known: offline, or not heard yet) */
    counts?: { nomarchy: number; anarchoi: number } | null
    /** where to begin (the title, or the callsign: a key restored with nothing else found), and a line to say why */
    start?: 'title' | 'callsign'
    note?: string
    /** he came by another pilot's link, to fly on his wing (net/wing.ts): his side is that pilot's, and he is asked for a callsign and no more (a look is made for him; the menu's Your pilot changes it) */
    invite?: { side: FactionId } | null
    /** the opening story is being told over the title page: the page says nothing until it is gone */
    hushed?: boolean
  }
  let {
    ondone,
    onrestore,
    onphrase,
    onsettings,
    onstory,
    counts = null,
    start = 'title',
    note = '',
    invite = null,
    hushed = false,
  }: Props = $props()
  /** the side with fewer pilots now, which pays a joining bonus (none while they are level, or not known) */
  const smaller = $derived(
    counts && counts.nomarchy !== counts.anarchoi ? (counts.nomarchy < counts.anarchoi ? 'nomarchy' : 'anarchoi') : null,
  )

  type Step = 'title' | 'restore' | 'callsign' | 'faction' | 'pilot'
  const ORDER: Step[] = ['title', 'restore', 'callsign', 'faction', 'pilot']
  // svelte-ignore state_referenced_locally
  let step = $state<Step>(start)
  /** which way the last step went: on (from the right) or back (from the left) */
  let onward = $state(true)
  let faction = $state<FactionId>('nomarchy')
  let callsign = $state('')
  let tried = $state(false)
  let restoreError = $state<string | null>(null)
  let field = $state<HTMLInputElement>()
  let picker = $state<HTMLInputElement>()
  const problem = $derived(callsignProblem(callsign))

  async function go(next: Step) {
    onward = ORDER.indexOf(next) >= ORDER.indexOf(step)
    step = next
    await tick()
    // (the keys and a controller start on the first thing to press)
    if (next === 'callsign') field?.focus()
    else document.querySelector<HTMLElement>('main button')?.focus({ preventScroll: true })
  }
  onMount(() => {
    void go(step)
    // (the title page's first words: the narrator says the name and its line, once the sound is on, unless the opening
    // story has just said them; it lies under the story while that is told, and the first press during it lets the sound
    // on, so it waits for the story to be gone, or he heard the name twice; and the story, said in full, is longer than a
    // minute and a half, so its saying of the name counts for ten minutes)
    const listen = window.setInterval(() => {
      if (step !== 'title') return window.clearInterval(listen)
      if (!audio() || hushed) return
      window.clearInterval(listen)
      if (!saidWithin('title', 600)) speak('title')
    }, 250)
    return () => window.clearInterval(listen)
  })

  function submitCallsign(e: Event) {
    e.preventDefault()
    tried = true
    if (problem) return
    // (come by a wing link: straight in, on that pilot's side, in a look of one of its peoples)
    if (invite)
      ondone(callsign, invite.side, lookText(randomLook(invite.side, (Date.now() ^ Math.imul(callsign.length + 1, 0x9e3779b1)) | 0)))
    else go('faction')
  }

  async function restore(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0]
    if (!file) return
    restoreError = await onrestore(file)
    if (picker) picker.value = ''
  }

  // ── restoring from the key phrase: the relays are asked for his sealed copy (a few seconds)
  let phrase = $state('')
  let looking = $state(false)
  async function restorePhrase(e: Event) {
    e.preventDefault()
    if (looking) return
    looking = true
    restoreError = null
    restoreError = await onphrase(phrase)
    looking = false
  }

  /** a step comes in from the side it was gone to, and the last one fades */
  const enter = (node: Element) => fly(node, { x: moving() ? (onward ? 28 : -28) : 0, duration: ms(240), opacity: 0 })
  const leave = (node: Element) => fade(node, { duration: ms(90) })

  /** each side's three peoples, as a portrait of each in its first look */
  const peoples = (side: FactionId) => racesOf(side).map((r) => ({ race: r, look: lookText(lookOf(`${r.id}.0.0.0`, side)) }))
  /** what a side's card says in its tooltip */
  const SIDE_TIP: Record<FactionId, { home: string; line: string }> = {
    nomarchy: {
      home: 'Meridian Ring, at the gold sun',
      line: 'Keeps the register of lots, and the bronze urn they were drawn from, under glass on the Ring. Its clerks write the flags in too, and cross them out again.',
    },
    anarchoi: {
      home: 'The Raft, at a red dwarf',
      line: 'Their names were still in the urn when the worlds ran out. A world is whoever stands on it with a flag, and the Raft is wherever its hulks were last lashed together.',
    },
  }
</script>

<div class="fixed inset-0 overflow-hidden bg-night text-ink select-none" style="height: 100dvh">
  <SceneBackdrop />
  <!-- (a veil, darker at the top, so the words read over the islands) -->
  <div class="pointer-events-none absolute inset-0" style="background: linear-gradient(#0b1023e8, #0b102399 45%, #0b102330)"></div>

  {#key step}
    {#if step === 'title'}
      <main class="absolute inset-0 flex flex-col items-center justify-center gap-8 px-4 pb-[6vh] max-[480px]:gap-5" in:enter out:leave>
        <div class="flex flex-col items-center gap-4">
          <!-- the wordmark (static/brand/, tools/voxel/brand.py), its pixels doubled where there is room: never scaled by a
            fraction, so every pixel stays square and sharp -->
          <h1>
            <img
              src={asset('brand/wordmark-1x.png')}
              alt="Xenophon: Twin Stars"
              width="314"
              height="56"
              class="block h-[56px] w-[314px] [image-rendering:pixelated] [@media(min-height:520px)_and_(min-width:720px)]:h-[112px] [@media(min-height:520px)_and_(min-width:720px)]:w-[628px]"
            />
          </h1>
        </div>
        <div class="flex flex-col items-center gap-2">
          <button type="button" class="{main} min-w-[12rem] text-[28px]" style="min-height: 56px" onclick={() => go('callsign')}
            >Play</button
          >
          <div class="flex gap-2">
            <button type="button" class={quiet} onclick={() => go('restore')}>Restore pilot</button>
            <button type="button" class={quiet} onclick={onsettings}>Settings</button>
            {#if onstory}<button type="button" class={quiet} onclick={onstory}>Story</button>{/if}
          </div>
        </div>
      </main>
    {:else if step === 'restore'}
      <main class="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-4 py-4" in:enter out:leave>
        <section class="ui-panel max-w-[34rem]" aria-label="Restore your pilot">
          <div class="flex flex-col gap-4 p-4">
            <h2 class="ui-head">Restore your pilot</h2>
            <button type="button" class="{button} self-start" onclick={() => picker?.click()}>
              <img src={asset('ui/sheet.png')} alt="" width="32" height="32" style="image-rendering: pixelated" />From a pilot file
            </button>
            <input bind:this={picker} type="file" accept=".json,application/json" class="hidden" onchange={restore} />
            <form class="flex flex-col gap-2" onsubmit={restorePhrase}>
              <label for="phrase" class="ui-label">Or your key phrase</label>
              <div class="flex gap-2">
                <input
                  id="phrase"
                  bind:value={phrase}
                  autocomplete="off"
                  autocapitalize="off"
                  spellcheck="false"
                  placeholder="nsec1…"
                  class="ui-input normal-case"
                />
                <button type="submit" class={main} disabled={looking || !phrase.trim()}>{looking ? 'Looking…' : 'Restore'}</button>
              </div>
            </form>
            {#if restoreError}<p class="ui-body text-foe" role="alert">! {restoreError}</p>{/if}
            <button type="button" class="{quiet} self-start" onclick={() => go('title')}>Back</button>
          </div>
        </section>
      </main>
    {:else if step === 'callsign'}
      <main class="absolute inset-0 flex flex-col items-center justify-center px-4 pb-[8vh]" in:enter out:leave>
        <form class="ui-panel max-w-[30rem]" onsubmit={submitCallsign}>
          <div class="flex flex-col gap-3 p-4">
            {#if note}<p class="ui-body text-accent" role="status">{note}</p>{/if}
            <label for="callsign" class="ui-head">Your callsign</label>
            <input
              id="callsign"
              bind:this={field}
              value={callsign}
              oninput={(e) => {
                callsign = cleanCallsign(e.currentTarget.value)
                e.currentTarget.value = callsign
              }}
              maxlength={CALLSIGN_MAX}
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
              placeholder="ACE"
              class="pixel-text w-full border-0 border-b-2 border-ink bg-transparent px-1 pb-2 text-[42px] leading-none text-ink uppercase outline-none placeholder:text-ink/25 focus:border-accent"
              aria-describedby="callsign-help"
            />
            <p id="callsign-help" class="ui-label {tried && problem ? 'text-foe' : ''}">
              {tried && problem ? problem : `3 to ${CALLSIGN_MAX} letters or figures`}
            </p>
            <div class="mt-1 flex justify-between gap-3">
              <button type="button" class={quiet} onclick={() => go('title')}>Back</button>
              <button type="submit" class="{main} min-w-[8rem]">{invite ? 'Fly' : 'Next'}</button>
            </div>
          </div>
        </form>
      </main>
    {:else if step === 'faction'}
      <main
        class="absolute inset-0 flex flex-col items-center gap-3 px-3 pt-[max(12px,env(safe-area-inset-top))] pb-2 [@media(min-height:520px)]:gap-5 [@media(min-height:520px)]:pt-[5vh]"
        in:enter
        out:leave
      >
        <header class="flex flex-col items-center gap-2">
          <h2 class="ui-head text-center [@media(min-height:520px)]:text-[42px]">Choose your side</h2>
          <p class="ui-label [@media(max-height:440px)]:hidden">There is no changing sides later, {callsign}</p>
        </header>
        <div
          class="flex min-h-0 w-full max-w-[56rem] flex-1 justify-center gap-3 [@media(min-height:520px)]:max-h-[34rem] [@media(min-height:520px)]:gap-5"
        >
          {#each [FACTIONS.nomarchy, FACTIONS.anarchoi] as f, i (f.id)}
            {@const nomarchy = f.id === 'nomarchy'}
            <button
              type="button"
              class="side group relative flex min-h-0 max-w-[26rem] flex-1 cursor-pointer flex-col overflow-hidden text-left outline-none"
              class:anarchoi={!nomarchy}
              style="--side: {f.colour}; --side-dark: {f.dark}; --i: {i}"
              onclick={() => {
                faction = f.id
                go('pilot')
              }}
              aria-label="Fly for {f.name}: {f.flavour}"
              use:tip={{
                title: f.name,
                colour: f.colour,
                line: SIDE_TIP[f.id].line,
                stats: [
                  { label: 'Home', value: SIDE_TIP[f.id].home },
                  {
                    label: 'Peoples',
                    value: racesOf(f.id)
                      .map((r) => r.name)
                      .join(', '),
                  },
                ],
                note: smaller === f.id ? `Outnumbered: +${JOINING_BONUS} credits to join` : undefined,
              }}
            >
              <!-- its home, drawn by the game (its capital station, its sun, three of its own ships: tools/side-cards.ts), the emblem standing on it -->
              <span class="art relative block min-h-[64px] flex-1 overflow-hidden">
                <img
                  src={asset(`ui/home-${f.id}.png` as Parameters<typeof asset>[0])}
                  alt=""
                  class="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  style="image-rendering: pixelated"
                  draggable="false"
                />
                <span class="absolute inset-0" style="background: linear-gradient(transparent 40%, {f.dark})"></span>
              </span>
              <span
                class="relative -mt-12 flex flex-col items-center gap-2 px-4 pb-4 [@media(min-height:520px)]:-mt-20 [@media(min-height:520px)]:gap-3"
              >
                <span class="emblem transition-transform duration-200 group-hover:-translate-y-1">
                  <span class="block [@media(min-height:520px)]:hidden"><Emblem side={f.id} size={64} /></span>
                  <span class="hidden [@media(min-height:520px)]:block"><Emblem side={f.id} size={128} /></span>
                </span>
                <span class="ui-head [@media(min-height:520px)]:text-[35px]" style="color: {f.colour}">{f.name}</span>
                <span class="ui-body text-center">{f.flavour}</span>
                <span class="flex items-center gap-2 max-[420px]:hidden [@media(max-height:400px)]:hidden" aria-hidden="true">
                  {#each peoples(f.id) as p (p.race.id)}
                    <Portrait look={p.look} faction={f.id} size={16} scale={3} label={p.race.name} />
                  {/each}
                </span>
                {#if counts || smaller === f.id}
                  <span class="ui-label flex items-center gap-3" style="color: {f.colour}">
                    {#if counts}<span>{counts[f.id]} flying</span>{/if}
                    {#if smaller === f.id}<span class="text-ink">+{JOINING_BONUS} CR</span>{/if}
                  </span>
                {/if}
                <span class="join ui-btn mt-1 w-full max-w-[16rem]">Join</span>
              </span>
            </button>
          {/each}
        </div>
        <button type="button" class={quiet} onclick={() => go('callsign')}>Back</button>
      </main>
    {:else}
      <main
        class="absolute inset-0 flex justify-center px-2 pt-[max(6px,env(safe-area-inset-top))] pb-[max(6px,env(safe-area-inset-bottom))]"
        in:enter
        out:leave
      >
        {#key faction}
          <PilotCreator
            {faction}
            look={lookText(randomLook(faction, Date.now() & 0xffffff))}
            title="{callsign}, who are you?"
            ondone={(look) => ondone(callsign, faction, look)}
            onback={() => go('faction')}
          />
        {/key}
      </main>
    {/if}
  {/key}
</div>

<style>
  /* a side's card: its own dark, a frame in its colour (the Nomarchy's a double gold rule, the Anarchoi's
     scrap and rivets), lifting a little under the pointer; the cards rise in one after the other */
  .side {
    background: var(--side-dark);
    border: 3px solid var(--side);
    box-shadow:
      inset 0 0 0 3px var(--side-dark),
      inset 0 0 0 5px color-mix(in srgb, var(--side) 45%, transparent);
    animation: card-in 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
    animation-delay: calc(var(--i) * 70ms + 60ms);
    transition:
      transform 160ms cubic-bezier(0.16, 1, 0.3, 1),
      box-shadow 160ms ease-out;
  }
  .side.anarchoi {
    border-color: color-mix(in srgb, var(--side) 60%, #1a1430);
    box-shadow:
      inset 0 0 0 4px #2a2048,
      inset 0 -8px 0 -3px var(--side);
  }
  .side:hover,
  .side:focus-visible {
    transform: translateY(-4px);
  }
  .side:focus-visible {
    outline: 3px solid var(--color-ink);
    outline-offset: 3px;
  }
  .side:active {
    transform: translateY(0);
  }
  .side .join {
    border-color: var(--side);
    color: var(--side);
    background: rgb(0 0 0 / 0.3);
  }
  .side:hover .join,
  .side:focus-visible .join {
    background: var(--side);
    color: var(--color-night);
  }
  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateY(18px);
    }
  }
  :global([data-motion='less']) .side {
    animation-name: fade-only;
  }
  :global([data-motion='less']) .side:hover,
  :global([data-motion='less']) .side:focus-visible {
    transform: none;
  }
  @keyframes fade-only {
    from {
      opacity: 0;
    }
  }
</style>
