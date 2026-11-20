<script lang="ts">
  // The settings (the plan's section 16), built towards art/mockups/settings-4.png: down the left, a rail of the five
  // sections as the image model's large icons, the chosen one marked by a bar of the side's colour that slides to it;
  // beside it, the section, each with one thing to look at first:
  //
  //   Controls  the steering keys as a cluster of key caps (the focal point), how the guns, the thrusters and the stick
  //             work, and every other action in three groups (fight, fly, screens), a row each: its icon, its name, its
  //             key. A row or a cap pressed waits for the new key (or a controller's button); Escape keeps the old one
  //   Sound     the effects' and the music's volumes as two rising rows of blocks, dragged, tapped or stepped
  //   Picture   the art pixel as five little windows onto a ship drawn at each size, the text as three letters at each
  //             size, then the motion, the shake and the flames
  //   Your key  whether the pilot is kept safe, first and in colour; then the phrase, the sealed copy, a file
  //   Relays    the relays the persistent world (and the sealed copy) is kept on
  //
  // Every change is made at once and kept in the save. A state is never told by colour alone: a choice made is filled
  // in, a volume is its blocks and its figure, kept safe or not is said in words. Detail is in the tooltips.
  import { asset } from '$app/paths'
  import { onDestroy } from 'svelte'
  import {
    BINDABLE_WORDS,
    bindButton,
    bindKey,
    buttonName,
    buttonOwner,
    defaultBindings,
    keyName,
    keyOwner,
    PAD_BINDABLE,
  } from '../input/bindings'
  import type { Bindable } from '../input/bindings'
  import type { Save, Settings } from '../save/store'
  import { phraseOf } from '../save/backup'
  import { buildLine, SOURCE } from '../version'
  import { CREDITS, SOURCES } from '../audio/pieces'
  import Panel from './Panel.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  type Tab = 'controls' | 'sound' | 'picture' | 'pilot' | 'relays'
  interface Props {
    settings: Settings
    onchange: (next: Settings) => void
    /** his pilot: the callsign (null: none yet, on the title), his secret key, and how he is backed up */
    callsign: string | null
    secret: string
    backup: Save['backup']
    /** a file saved, the phrase copied, the sealed copy kept on the relays or not */
    onfile: () => void
    onphrase: () => void
    onsealed: (on: boolean) => void
    /** the relays the events are kept on, and a new list (null: the built-in one) */
    relayList: string[]
    onrelays: (list: string[] | null) => void
    /** the tab to open on */
    open?: Tab
    onclose: () => void
  }
  let {
    settings,
    onchange,
    callsign,
    secret,
    backup,
    onfile,
    onphrase,
    onsealed,
    relayList,
    onrelays,
    open = 'controls',
    onclose,
  }: Props = $props()

  /** the music's makers, by where it came from (its licences ask for them to be named) */
  const musicBy = Object.entries(SOURCES).map(([key, s]) => {
    const all = Object.values(CREDITS)
      .flat()
      .filter((c) => c.source === key)
    // (each composer once: "Korp, after Tyler P." and "MoonDeLaAxel and Korp" name two each)
    const names = all.flatMap((c) => c.by.split(/, | and /).map((n) => n.replace(/^(after|modified by) /, '')))
    return { key, ...s, by: [...new Set(names)] }
  })

  const SECTIONS: { id: Tab; label: string; icon: string }[] = [
    { id: 'controls', label: 'Controls', icon: 'controls' },
    { id: 'sound', label: 'Sound', icon: 'sound' },
    { id: 'picture', label: 'Picture', icon: 'picture' },
    { id: 'pilot', label: 'Your key', icon: 'key' },
    { id: 'relays', label: 'Relays', icon: 'relays' },
  ]
  // svelte-ignore state_referenced_locally
  let tab = $state<Tab>(open)
  const at = $derived(SECTIONS.findIndex((s) => s.id === tab))
  const set = (change: Partial<Settings>) => onchange({ ...settings, ...change })

  // ── the actions, in groups, each with its icon and a short name (what it does elsewhere goes in its tooltip)
  const GROUPS: { name: string; actions: Bindable[] }[] = [
    { name: 'Fight', actions: ['fire', 'secondary', 'boost', 'roll'] },
    {
      name: 'Fly',
      actions: ['stop', 'thrustUp', 'thrustDown', 'strafeLeft', 'strafeRight', 'use', 'mine', 'power', 'view', 'cruise', 'nextShip'],
    },
    { name: 'Screens', actions: ['map', 'inventory', 'chat', 'menu', 'clip'] },
  ]
  const ICON: Partial<Record<Bindable, string>> = {
    fire: 'fire',
    secondary: 'missile',
    boost: 'boost',
    roll: 'roll',
    use: 'action',
    mine: 'w-laser',
    power: 'power',
    view: 'view',
    cruise: 'cruise',
    thrustUp: 'climb',
    thrustDown: 'dive',
    strafeLeft: 'boost',
    strafeRight: 'boost',
    nextShip: 'ships',
    clip: 'picture',
    map: 'map',
    inventory: 'bag',
    chat: 'chat',
    menu: 'menu',
  }
  const NAME: Partial<Record<Bindable, string>> = {
    secondary: 'Missile',
    boost: 'Thrusters',
    cruise: 'Cruise',
    stop: 'All stop',
    thrustUp: 'Thrust up',
    thrustDown: 'Thrust down',
    strafeLeft: 'Thrust left',
    strafeRight: 'Thrust right',
    inventory: 'Hold',
    mine: 'Mining',
    power: 'Power',
  }
  /** an action's short name, and the rest of what it does */
  const words = (a: Bindable) => {
    const w = BINDABLE_WORDS[a]
    const cut = w.split(/ \(|: /)[0]
    const more = w
      .slice(cut.length)
      .replace(/^ \(|^: /, '')
      .replace(/\)$/, '')
    return { name: NAME[a] ?? cut, full: w, more }
  }

  /** which device's bindings are shown: the keys, or a controller's */
  let device = $state<'keys' | 'pad'>('keys')
  /** a PlayStation controller is plugged in: its buttons' shapes, else letters */
  const ps =
    typeof navigator !== 'undefined' &&
    [...(navigator.getGamepads?.() ?? [])].some((p) => p && /054c|dualsense|dualshock|playstation/i.test(p.id))
  /** what an action is bound to on the device shown: its first key or button, and any other (each name once: both Enters are Enter) */
  const bound = (a: Bindable) => [
    ...new Set(device === 'keys' ? settings.bindings.keys[a].map(keyName) : (settings.bindings.pad[a] ?? []).map((b) => buttonName(b, ps))),
  ]

  // ── changing a binding: the next key pressed (or button, on a controller) is the action's
  let waiting = $state<{ action: Bindable; pad: boolean } | null>(null)
  let note = $state('')
  let stopWaiting: (() => void) | null = null
  function listen(action: Bindable, pad: boolean) {
    stopWaiting?.()
    waiting = { action, pad }
    note = ''
    if (!pad) {
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (e.code === 'Escape') return stop()
        const was = keyOwner(settings.bindings, e.code)
        set({ bindings: bindKey(settings.bindings, action, e.code) })
        note = was && was !== action ? `${keyName(e.code)} was ${words(was).name}: it is ${words(action).name} now` : ''
        stop()
      }
      window.addEventListener('keydown', onKey, true)
      stopWaiting = () => window.removeEventListener('keydown', onKey, true)
    } else {
      // (a controller sends no events: read it until a button goes down that was up)
      let was: number[] = []
      let first = true
      let frame = 0
      const look = () => {
        frame = requestAnimationFrame(look)
        const down: number[] = []
        for (const p of navigator.getGamepads?.() ?? []) p?.buttons.forEach((b, i) => b.pressed && down.push(i))
        if (!first)
          for (const i of down)
            if (!was.includes(i)) {
              const owner = buttonOwner(settings.bindings, i)
              set({ bindings: bindButton(settings.bindings, action, i) })
              note = owner && owner !== action ? `${buttonName(i, ps)} was ${words(owner).name}: it is ${words(action).name} now` : ''
              return stop()
            }
        first = false
        was = down
      }
      frame = requestAnimationFrame(look)
      const onKey = (e: KeyboardEvent) => e.code === 'Escape' && (e.preventDefault(), stop())
      window.addEventListener('keydown', onKey, true)
      stopWaiting = () => {
        cancelAnimationFrame(frame)
        window.removeEventListener('keydown', onKey, true)
      }
    }
  }
  function stop() {
    stopWaiting?.()
    stopWaiting = null
    waiting = null
  }
  onDestroy(stop)
  const listening = (a: Bindable) => waiting?.action === a && waiting.pad === (device === 'pad')
  const press = (a: Bindable) => (listening(a) ? stop() : listen(a, device === 'pad'))

  // ── the key, as a phrase
  let shown = $state(false)
  let copied = $state('')
  const phrase = $derived(phraseOf(secret))
  async function copyPhrase() {
    try {
      await navigator.clipboard.writeText(phrase)
      copied = 'Copied: keep it somewhere safe, not in this browser'
      onphrase()
    } catch {
      // (no clipboard here: shown to be copied by hand)
      shown = true
      copied = 'Select it and copy it by hand'
    }
  }

  // ── the relays
  // svelte-ignore state_referenced_locally
  let relayText = $state(relayList.join('\n'))
  let relayError = $state('')
  function saveRelays() {
    const list = relayText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (list.some((u) => !/^wss:\/\/\S+$/.test(u))) {
      relayError = 'Each relay is a wss:// address'
      return
    }
    relayError = ''
    onrelays(list.length ? list : null)
  }

  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  const BLOCKS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]
  const step = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10) / 10
</script>

{#snippet choices<T>(label: string, now: T, list: [T, string][], pick: (v: T) => void, help = '')}
  <div class="setting">
    <span class="ui-label" use:tip={help ? { title: label, line: help } : null}>{label}</span>
    <div class="segs" role="group" aria-label={label}>
      {#each list as [value, w] (w)}
        <button
          type="button"
          class="ui-btn ui-btn-small"
          class:is-on={now === value}
          aria-pressed={now === value}
          onclick={() => pick(value)}>{w}</button
        >
      {/each}
    </div>
  </div>
{/snippet}

{#snippet volume(label: string, icon: string, now: number, pick: (v: number) => void, help: string)}
  <div class="volume">
    <span class="flex items-center gap-3" use:tip={{ title: label, line: help }}>
      <UiIcon name={icon} size={48} />
      <span class="ui-head">{label}</span>
    </span>
    <div class="flex items-center gap-3">
      <button type="button" class="ui-btn ui-btn-icon" onclick={() => pick(step(now - 0.1))} aria-label="{label}: quieter">-</button>
      <label class="blocks">
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={now}
          aria-label={label}
          oninput={(e) => pick(step(Number(e.currentTarget.value)))}
        />
        {#each BLOCKS as v (v)}
          <span class="block" class:lit={now >= v - 1e-6} style="height: {10 + v * 38}px" aria-hidden="true"></span>
        {/each}
      </label>
      <button type="button" class="ui-btn ui-btn-icon" onclick={() => pick(step(now + 0.1))} aria-label="{label}: louder">+</button>
      {#key now}
        <span class="ui-head ui-num ui-changed w-[5.5rem] text-right" aria-live="polite"
          >{now <= 0 ? 'Off' : `${Math.round(now * 100)}%`}</span
        >
      {/key}
    </div>
  </div>
{/snippet}

{#snippet cap(a: Bindable, word: string)}
  {@const keys = bound(a)}
  <div class="flex flex-col items-center gap-1.5">
    <button
      type="button"
      class="cap"
      class:listening={listening(a)}
      onclick={() => press(a)}
      aria-label="{word}: {keys.join(', ') || 'none'}. Change it"
      use:tip={{ title: word, line: keys.length ? keys.join(' or ') : 'Not bound', note: 'Press to change' }}
      >{listening(a) ? '?' : (keys[0] ?? '-')}</button
    >
    <span class="ui-label">{word}</span>
  </div>
{/snippet}

<Panel title="Settings" sub={callsign ?? ''} size="full" tabCloses={false} {onclose}>
  <div class="settings">
    <div class="rail" role="tablist" aria-label="Settings" aria-orientation="vertical" style="--at: {at}">
      <span class="mark" aria-hidden="true"></span>
      {#each SECTIONS as s (s.id)}
        <button
          type="button"
          role="tab"
          class="rail-tab"
          aria-selected={tab === s.id}
          aria-label={s.label}
          onclick={() => {
            stop()
            tab = s.id
          }}
        >
          <UiIcon name={s.icon} size={48} />
          <span class="word">{s.label}</span>
        </button>
      {/each}
    </div>

    <div class="pane">
      {#key tab}
        {#if tab === 'controls'}
          <div class="ui-settle flex flex-col gap-4">
            <div class="flex flex-wrap items-center gap-3" style="--i: 0">
              <div class="segs" role="group" aria-label="Device">
                <button
                  type="button"
                  class="ui-btn ui-btn-small"
                  class:is-on={device === 'keys'}
                  aria-pressed={device === 'keys'}
                  onclick={() => {
                    stop()
                    device = 'keys'
                  }}>Keys</button
                >
                <button
                  type="button"
                  class="ui-btn ui-btn-small"
                  class:is-on={device === 'pad'}
                  aria-pressed={device === 'pad'}
                  onclick={() => {
                    stop()
                    device = 'pad'
                  }}>Controller</button
                >
              </div>
              <span class="flex-1"></span>
              <button
                type="button"
                class="ui-btn ui-btn-quiet ui-btn-small"
                onclick={() => {
                  stop()
                  set({ bindings: defaultBindings() })
                  note = 'Keys and buttons as they were'
                }}
                use:tip={{ title: 'Back as they were', line: 'Every key and button to the game’s own' }}>Reset</button
              >
            </div>

            <div class="top" style="--i: 1">
              <div class="steer">
                {#if device === 'keys'}
                  <!-- (laid out as the keys are, Elite's: W over A S D, the throttle and the turns; the arrows' up over down,
                  the pitch, climbing and diving as named whatever the setting below) -->
                  <div class="flex items-end gap-6">
                    <div class="flex flex-col items-center gap-2">
                      {@render cap('faster', 'Faster')}
                      <div class="flex gap-2">
                        {@render cap('left', 'Left')}
                        {@render cap('slower', 'Slower')}
                        {@render cap('right', 'Right')}
                      </div>
                    </div>
                    <div class="flex flex-col items-center gap-2">
                      {@render cap('up', 'Climb')}
                      {@render cap('down', 'Dive')}
                    </div>
                  </div>
                  <span
                    class="ui-label normal-case"
                    use:tip={{
                      title: 'The mouse',
                      line: 'A stick: the further from the ring in the middle, the faster it turns. Its left button fires, its right a missile, and its wheel moves the throttle',
                    }}>+ the mouse</span
                  >
                {:else}
                  <div class="flex flex-col items-center gap-3 py-4">
                    <span class="stick" aria-hidden="true"><UiIcon name="controls" size={96} /></span>
                    <span class="ui-label">The left stick steers, the right the throttle</span>
                  </div>
                {/if}
              </div>
              <div class="flex min-w-0 flex-1 flex-wrap content-start gap-x-8 gap-y-4">
                <h3 class="ui-label w-full">How it flies</h3>
                {@render choices(
                  'Guns',
                  settings.toggle.fire,
                  [
                    [false, 'Hold'],
                    [true, 'Switch'],
                  ],
                  (v) => set({ toggle: { ...settings.toggle, fire: v } }),
                  'Hold the button to fire, or press once to start and again to stop',
                )}
                {@render choices(
                  'Thrusters',
                  settings.toggle.boost,
                  [
                    [false, 'Hold'],
                    [true, 'Switch'],
                  ],
                  (v) => set({ toggle: { ...settings.toggle, boost: v } }),
                  'Hold to boost, or press once to start and again to stop',
                )}
                {@render choices(
                  'Up and down',
                  settings.invertY ?? false,
                  [
                    [false, 'Up climbs'],
                    [true, 'Up dives'],
                  ],
                  (v) => set({ invertY: v }),
                  'The mouse and the stick: up climbs, or up dives as a flight stick does. The keys climb and dive as named',
                )}
                {@render choices(
                  'Mouse ring',
                  settings.mouseRing ?? true,
                  [
                    [true, 'Show'],
                    [false, 'Hide'],
                  ],
                  (v) => set({ mouseRing: v }),
                  'From behind and in the cockpit, a ring for the middle of the mouse’s steering and a line out to the pointer',
                )}
                <p class="ui-body w-full text-accent" role="status">
                  {#if waiting}{waiting.pad ? 'Press a button' : 'Press a key'}
                    <span class="text-ink-dim">· Escape keeps it</span>{:else}{note}{/if}
                </p>
              </div>
            </div>

            <div class="groups" style="--i: 3">
              {#each GROUPS as g (g.name)}
                <div class="flex flex-col gap-1">
                  <h3 class="ui-label mb-1">{g.name}</h3>
                  {#each g.actions.filter((a) => device === 'keys' || PAD_BINDABLE.includes(a)) as a (a)}
                    {@const w = words(a)}
                    {@const keys = bound(a)}
                    <button
                      type="button"
                      class="ui-row bind"
                      class:listening={listening(a)}
                      onclick={() => press(a)}
                      aria-label="{w.full}: {keys.join(', ') || 'none'}. Change it"
                      use:tip={{
                        title: w.full,
                        line: keys.length ? keys.join(' or ') : 'Not bound',
                        note: 'Press to change',
                      }}
                    >
                      <UiIcon name={ICON[a] ?? 'controls'} size={32} />
                      <span class="min-w-0 flex-1 truncate">{w.name}</span>
                      {#if listening(a)}
                        <span class="ui-key pulse">?</span>
                      {:else if keys.length}
                        <span class="ui-key">{keys[0]}</span>
                      {:else}
                        <span class="ui-label">-</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/each}
            </div>
          </div>
        {:else if tab === 'sound'}
          <div class="ui-settle flex flex-col gap-6 pt-2">
            <div style="--i: 0">
              {@render volume(
                'Effects',
                'sound',
                settings.volume ?? 0.7,
                (v) => set({ volume: v }),
                'Engines, guns, the world. Silent until your first click, tap or key',
              )}
            </div>
            <div style="--i: 1">
              {@render volume(
                'Music',
                'music',
                settings.music ?? 0.5,
                (v) => set({ music: v }),
                'It follows where you are, and a fight brings its own',
              )}
            </div>
            <div class="flex flex-col gap-2" style="--i: 2">
              <span class="ui-label">Music by</span>
              {#each musicBy as s (s.key)}
                <p class="ui-body normal-case">
                  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve (a page off the site) -->
                  <a class="underline" href={s.url} target="_blank" rel="noopener">{s.name}</a>
                  ({s.licence}): music by {s.by.join(', ')}.{s.credit ? ` ${s.credit}` : ''}{#if s.text}{' '}<a
                      class="underline"
                      href={asset(s.text as Parameters<typeof asset>[0])}
                      target="_blank"
                      rel="noopener">The licence</a
                    >.{/if}
                </p>
              {/each}
            </div>
          </div>
        {:else if tab === 'picture'}
          <div class="ui-settle flex flex-col gap-5">
            <div class="flex flex-col gap-2" style="--i: 0">
              <span class="ui-label" use:tip={{ title: 'Art pixel', line: 'How large one of the game’s pixels is on the screen' }}
                >Art pixel</span
              >
              <div class="flex flex-wrap gap-2" role="group" aria-label="Art pixel">
                {#each [0, 2, 3, 4, 5] as n (n)}
                  <button
                    type="button"
                    class="tile"
                    class:is-on={settings.pixel === n}
                    aria-pressed={settings.pixel === n}
                    aria-label={n ? `${n}` : 'Fit'}
                    onclick={() => set({ pixel: n })}
                    use:tip={n ? null : { title: 'Fit', line: 'One that suits this screen' }}
                  >
                    <span class="view">
                      <img
                        src={asset('ui/hull-corsair.png')}
                        alt=""
                        width={48 * (n || 3)}
                        height={48 * (n || 3)}
                        draggable="false"
                        style="image-rendering: pixelated"
                      />
                    </span>
                    <span class="ui-body">{n ? `×${n}` : 'Fit'}</span>
                  </button>
                {/each}
              </div>
            </div>
            <div class="flex flex-col gap-2" style="--i: 1">
              <span class="ui-label" use:tip={{ title: 'Text size', line: 'The menus’ text, and the HUD’s' }}>Text size</span>
              <div class="flex flex-wrap gap-2" role="group" aria-label="Text size">
                {#each [['normal', 'Normal', 21], ['large', 'Large', 28], ['larger', 'Larger', 35]] as [Settings['text'], string, number][] as [v, w, px] (v)}
                  <button
                    type="button"
                    class="tile"
                    class:is-on={settings.text === v}
                    aria-pressed={settings.text === v}
                    aria-label={w}
                    onclick={() => set({ text: v })}
                  >
                    <span class="view font-pixel" style="font-size: {px}px">AB</span>
                    <span class="ui-body">{w}</span>
                  </button>
                {/each}
              </div>
            </div>
            <div class="flex flex-wrap gap-x-8 gap-y-3" style="--i: 2">
              {@render choices(
                'Motion',
                settings.motion,
                [
                  ['full', 'Full'],
                  ['less', 'Reduced'],
                ] as [Settings['motion'], string][],
                (v) => set({ motion: v }),
                'Reduced: screens and figures change with a brief fade instead of moving',
              )}
              {@render choices(
                'Camera shake',
                settings.shake,
                [
                  [1, 'Full'],
                  [0.5, 'Half'],
                  [0, 'None'],
                ],
                (v) => set({ shake: v }),
                'How hard the picture shakes when hit, firing or burning through the air',
              )}
              {@render choices(
                'Flames',
                settings.flames,
                [
                  [null, 'Smooth'],
                  ['pixel', 'Pixels'],
                ] as [Settings['flames'], string][],
                (v) => set({ flames: v }),
                'The engines’ flames and fires drawn smooth over the picture, or in its own pixels',
              )}
              {@render choices(
                'Clips',
                settings.clips ?? true,
                [
                  [true, 'On'],
                  [false, 'Off'],
                ] as [Settings['clips'], string][],
                (v) => set({ clips: v }),
                'The last seconds of play kept all the while, so Clip can hand you a short film of what just happened',
              )}
            </div>
          </div>
        {:else if tab === 'pilot'}
          <div class="ui-settle flex flex-col gap-5">
            <div class="safe" class:ok={!!backup.at} style="--i: 0">
              <UiIcon name="key" size={48} />
              <div class="flex min-w-0 flex-col gap-1.5">
                {#if backup.at}
                  <span class="ui-head text-ok">Kept safe</span>
                  <span class="ui-label"
                    >{backup.how === 'file' ? 'A file' : backup.how === 'phrase' ? 'The phrase' : 'The relays'} · {when(backup.at)}</span
                  >
                {:else}
                  <span class="ui-head text-foe">Not kept safe</span>
                  <span class="ui-label">Only in this browser</span>
                {/if}
              </div>
            </div>
            <div class="flex flex-col gap-2" style="--i: 1">
              <span
                class="ui-label"
                use:tip={{ title: 'Your key phrase', line: 'Whoever has it can fly as you. Restore on the first screen takes it.' }}
                >Key phrase</span
              >
              <div class="flex flex-wrap items-center gap-2">
                <code class="ui-body min-w-0 flex-1 border-2 border-ink/30 bg-black/25 px-3 py-2 break-all normal-case select-all"
                  >{shown ? phrase : 'nsec1' + '•'.repeat(24)}</code
                >
                <button type="button" class="ui-btn" onclick={() => (shown = !shown)}>{shown ? 'Hide' : 'Show'}</button>
                <button type="button" class="ui-btn ui-btn-main" onclick={copyPhrase}>Copy</button>
              </div>
              {#if copied}<p class="ui-label text-accent" role="status">{copied}</p>{/if}
            </div>
            <div class="flex flex-wrap items-end gap-x-8 gap-y-3" style="--i: 2">
              {@render choices(
                'Sealed copy',
                backup.relays,
                [
                  [true, 'Keep one'],
                  [false, 'No'],
                ],
                onsealed,
                'A copy of your save on the relays, locked with your key: with it, the phrase alone brings your pilot back on another device',
              )}
              <button type="button" class="ui-btn" onclick={onfile}>Save a pilot file</button>
            </div>
          </div>
        {:else}
          <div class="ui-settle flex flex-col gap-3">
            <label class="flex flex-col gap-2" style="--i: 0">
              <span
                class="ui-label"
                use:tip={{
                  title: 'Relays',
                  line: 'The galaxy’s memory is kept on them. One a line; empty for the built-in ones. From the next time the game is opened.',
                }}>Relays · one a line</span
              >
              <textarea bind:value={relayText} rows="5" class="ui-input normal-case"></textarea>
            </label>
            <div class="flex flex-wrap items-center gap-3" style="--i: 1">
              <button type="button" class="ui-btn ui-btn-main" onclick={saveRelays}>Use these</button>
              <button
                type="button"
                class="ui-btn ui-btn-quiet"
                onclick={() => {
                  relayText = ''
                  relayError = ''
                  onrelays(null)
                }}>Built-in</button
              >
              {#if relayError}<span class="ui-body text-foe" role="alert">{relayError}</span>{/if}
            </div>
            <p class="ui-label mt-4" style="--i: 2">{buildLine()}</p>
            <p class="ui-label normal-case" style="--i: 3">
              <!-- eslint-disable-next-line svelte/no-navigation-without-resolve (a page off the site) -->
              Open source: <a class="underline" href={SOURCE} target="_blank" rel="noopener">github.com/strickland84/xenophon</a>
            </p>
          </div>
        {/if}
      {/key}
    </div>
  </div>
</Panel>

<style>
  /* the rail and the section beside it; on a short window the rail keeps only its icons */
  .settings {
    --item: 64px;
    --gap: 4px;
    display: flex;
    gap: 20px;
    align-items: flex-start;
  }
  .rail {
    position: sticky;
    top: 0;
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--gap);
    padding-left: 6px;
  }
  .mark {
    position: absolute;
    left: 0;
    top: 0;
    width: 4px;
    height: var(--item);
    background: var(--color-accent);
    transform: translateY(calc(var(--at) * (var(--item) + var(--gap))));
    transition: transform var(--t-panel) var(--ease);
  }
  .rail-tab {
    display: flex;
    align-items: center;
    gap: 12px;
    height: var(--item);
    padding: 0 16px 0 8px;
    font-family: var(--font-pixel);
    font-size: var(--text-body);
    line-height: 1;
    color: var(--color-ink-dim);
    text-transform: uppercase;
    white-space: nowrap;
    background: transparent;
    border: 0;
    outline: none;
    cursor: pointer;
    transition:
      color var(--t-quick) ease-out,
      background-color var(--t-quick) ease-out;
  }
  .rail-tab :global(img) {
    opacity: 0.55;
    transition: opacity var(--t-quick) ease-out;
  }
  .rail-tab:hover {
    color: var(--color-ink);
    background: rgb(244 236 208 / 0.06);
  }
  .rail-tab:hover :global(img),
  .rail-tab[aria-selected='true'] :global(img) {
    opacity: 1;
  }
  .rail-tab[aria-selected='true'] {
    color: var(--color-ink);
    background: color-mix(in srgb, var(--color-accent) 12%, transparent);
  }
  .rail-tab:focus-visible {
    box-shadow: inset 0 0 0 2px var(--color-accent);
  }
  .pane {
    min-width: 0;
    flex: 1;
    padding-bottom: 4px;
  }
  @media (max-height: 520px) {
    .settings {
      --item: 44px;
      gap: 14px;
    }
    .rail-tab {
      padding: 0 6px;
    }
    .rail-tab :global(img) {
      width: 32px;
      height: 32px;
    }
    .word {
      display: none;
    }
  }

  /* a setting: its name over its choices, joined into one control */
  .setting {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .segs {
    display: flex;
  }
  .segs > :global(.ui-btn + .ui-btn) {
    margin-left: -2px;
  }

  /* the steering keys, and how it flies, side by side */
  .top {
    display: flex;
    flex-wrap: wrap;
    gap: 20px 40px;
    align-items: flex-start;
  }
  .steer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    min-width: 15rem;
    padding: 16px 12px 12px;
    background: rgb(0 0 0 / 0.22);
    border: 2px solid rgb(244 236 208 / 0.12);
  }
  /* a key cap as the keyboard has it, large: pressed, it waits for the new key */
  .cap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 64px;
    height: 60px;
    padding: 0 10px;
    font-family: var(--font-pixel);
    font-size: var(--text-head);
    line-height: 1;
    color: var(--color-night);
    background: var(--color-ink);
    border: 0;
    box-shadow:
      inset 0 -6px 0 rgb(11 16 35 / 0.32),
      0 3px 0 rgb(0 0 0 / 0.5);
    outline: none;
    cursor: pointer;
    transition:
      transform var(--t-press) ease-out,
      box-shadow var(--t-press) ease-out,
      background-color var(--t-quick) ease-out;
  }
  .cap:hover {
    background: #fffbe9;
  }
  .cap:active {
    transform: translateY(3px);
    box-shadow:
      inset 0 -3px 0 rgb(11 16 35 / 0.32),
      0 0 0 rgb(0 0 0 / 0.5);
  }
  .cap:focus-visible {
    box-shadow:
      inset 0 -6px 0 rgb(11 16 35 / 0.32),
      0 0 0 2px var(--color-night),
      0 0 0 4px var(--color-accent);
  }
  .cap.listening {
    background: var(--color-accent);
    animation: pulse 900ms ease-in-out infinite;
  }
  .stick {
    opacity: 0.9;
  }

  /* the rest of the actions, in three groups side by side as there is room */
  .groups {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
    gap: 16px 20px;
  }
  .bind {
    gap: 10px;
    min-height: 44px;
    padding: 2px 8px;
  }
  .bind.listening {
    background: color-mix(in srgb, var(--color-accent) 16%, transparent);
    border-color: var(--color-accent);
  }
  .pulse {
    background: var(--color-accent);
    animation: pulse 900ms ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }

  /* a volume: rising blocks over a range control the keys and the mouse both move */
  .volume {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    padding: 12px 16px;
    background: rgb(0 0 0 / 0.22);
    border: 2px solid rgb(244 236 208 / 0.12);
  }
  .blocks {
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 52px;
    padding: 0 4px;
    cursor: pointer;
  }
  .blocks input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }
  .blocks:has(input:focus-visible) {
    box-shadow:
      0 0 0 2px var(--color-night),
      0 0 0 4px var(--color-accent);
  }
  .block {
    display: block;
    width: 14px;
    border: 2px solid rgb(244 236 208 / 0.7);
    background: transparent;
    transition:
      background-color var(--t-quick) ease-out,
      transform var(--t-quick) var(--ease);
  }
  .block.lit {
    background: var(--color-accent);
    border-color: var(--color-accent);
  }

  /* a choice shown as a picture of what it does (the art pixel, the text) */
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 84px;
    padding: 6px 6px 8px;
    background: var(--color-night);
    border: 2px solid rgb(244 236 208 / 0.3);
    outline: none;
    cursor: pointer;
    transition:
      border-color var(--t-quick) ease-out,
      background-color var(--t-quick) ease-out,
      transform var(--t-press) ease-out;
  }
  .tile:hover {
    border-color: var(--color-ink);
  }
  .tile:active {
    transform: translateY(2px);
  }
  .tile:focus-visible {
    box-shadow:
      0 0 0 2px var(--color-night),
      0 0 0 4px var(--color-accent);
  }
  .tile.is-on {
    border-color: var(--color-accent);
    background: color-mix(in srgb, var(--color-accent) 16%, var(--color-night));
  }
  .view {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 68px;
    height: 56px;
    overflow: hidden;
    color: var(--color-ink);
    line-height: 1;
    background: #071027;
  }
  .view img {
    max-width: none;
    flex: none;
  }

  /* kept safe or not: said in words and in colour */
  .safe {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--color-foe) 12%, transparent);
    border-left: 6px solid var(--color-foe);
  }
  .safe.ok {
    background: color-mix(in srgb, var(--color-ok) 10%, transparent);
    border-left-color: var(--color-ok);
  }
</style>
