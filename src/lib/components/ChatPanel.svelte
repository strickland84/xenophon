<script lang="ts">
  // The chat (the plan's section 16, after art/mockups/chat.png and chat-open.png): a column down the left of the view,
  // over it, with no box: each line in the pixel font with a hard dark outline, on a soft dark that fades out towards
  // the middle, so it reads over a bright sky and over black space alike. Closed, the latest lines show for a while and
  // fade, the top ones fainter; opened (Enter, the Chat button, the controller's chat button), the whole history by
  // channel (All, Side, Squad, News), a line to type at its bottom, and quick chat. Each line has its pilot's side mark
  // and callsign in his side's colour; a callsign, opened, offers Mute and Block. News is said by nobody: a pilot come
  // or gone, one downed, a world changing hands, a squad's comings and goings. Alone, his own lines and the news still
  // show. It keeps to the place the page gives it (`top`, `bottom`, in CSS px): clear of the HUD's corners. What is typed is held to what the pixel font draws; muted and blocked pilots are left out by the page.
  import { tick } from 'svelte'
  import { QUICK_CHAT } from '../engine'
  import { padNav } from '../input/padnav'
  import { CHAT_MOST } from '../net/session'
  import type { ChatChannel, ChatLine } from '../net/session'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import Emblem from './Emblem.svelte'
  import QuickWheel from './QuickWheel.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    /** what was said lately, and the news, oldest first (muted and blocked pilots already left out) */
    lines: ChatLine[]
    /** ms now, on the lines' clock */
    now: number
    open: boolean
    /** the pilot's own key (his lines offer no Mute), and his side */
    me: string
    side: FactionId
    /** in a squad: its channel can be spoken on */
    squad: boolean
    /** whether anyone can hear: alone, the lines go nowhere */
    shared: boolean
    /** where it may be, in CSS px from the top and the bottom of the view; closed and opened */
    top: number
    bottom: number
    openBottom: number
    /** a short window: fewer lines, a narrower column */
    small: boolean
    /** pilots muted (their lines are gone; the name offers Unmute) */
    muted: string[]
    onsay: (text: string, to: ChatChannel) => void
    onquick: (n: number, to: ChatChannel) => void
    onmute: (key: string) => void
    onblock: (key: string) => void
    onclose: () => void
  }
  let {
    lines,
    now,
    open,
    me,
    side,
    squad,
    shared,
    top,
    bottom,
    openBottom,
    small,
    muted,
    onsay,
    onquick,
    onmute,
    onblock,
    onclose,
  }: Props = $props()

  /** seconds a line stays over the view once said, and the last of them in which it fades */
  const SHOWN = 16
  const FADING = 3
  /** what each channel is called, and what the line to type says on it */
  const CHANNELS: { id: Channel; label: string; to: string }[] = [
    { id: 'all', label: 'All', to: 'SAY TO EVERYONE HERE' },
    { id: 'side', label: 'Side', to: 'SAY TO YOUR SIDE' },
    { id: 'squad', label: 'Squad', to: 'SAY TO YOUR SQUAD' },
    { id: 'news', label: 'News', to: 'SAY TO EVERYONE HERE' },
  ]
  type Channel = 'all' | 'side' | 'squad' | 'news'

  let channel = $state<Channel>('all')
  let text = $state('')
  let wheel = $state(false)
  /** a pilot whose name was picked: Mute and Block offered */
  let picked = $state<{ key: string; callsign: string; faction: FactionId } | null>(null)
  let field = $state<HTMLInputElement>()
  let list = $state<HTMLElement>()
  let column = $state<HTMLElement>()

  /** where what is typed goes: the room, his side or his squad */
  const to = $derived<ChatChannel>(channel === 'side' ? 'side' : channel === 'squad' && squad ? 'squad' : 'room')
  const words = (l: ChatLine) => (l.quick >= 0 ? (QUICK_CHAT[l.quick] ?? '?') : l.text)
  /** the latest lines, over the view: fewer on a small screen */
  const fresh = $derived(lines.filter((l) => now - l.at < SHOWN * 1000).slice(small ? -3 : -6))
  /** the history on the channel chosen (All has everything) */
  const history = $derived(channel === 'all' ? lines : lines.filter((l) => l.channel === (channel === 'news' ? 'news' : channel)))
  /** how much of a line shows: whole, then fading out over its last seconds */
  const shownOf = (l: ChatLine) => Math.max(0, Math.min(1, (SHOWN * 1000 - (now - l.at)) / (FADING * 1000)))

  // (the squad gone, its channel is not one to be on)
  $effect(() => {
    if (!squad && channel === 'squad') channel = 'all'
  })

  // opened: the line to type takes the keys (a moment after: the Enter that opened it must not also send), the history
  // shows its newest, and a controller can work the tabs and buttons
  $effect(() => {
    if (!open) {
      picked = null
      return
    }
    void tick().then(() => list && (list.scrollTop = list.scrollHeight))
    if (wheel) return
    const t = setTimeout(() => field?.focus({ preventScroll: true }), 120)
    return () => clearTimeout(t)
  })
  $effect(() => {
    if (!open || !column) return
    return padNav(column, onclose)
  })
  // a new line while the history is at its newest keeps it there
  let lastCount = 0
  $effect(() => {
    const n = history.length
    if (!open || !list || n === lastCount) return
    lastCount = n
    const el = list
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (atEnd) void tick().then(() => (el.scrollTop = el.scrollHeight))
  })

  function send(e: Event) {
    e.preventDefault()
    if (text.trim()) onsay(text, to)
    text = ''
    onclose()
  }

  /** Tab in the line to type moves along the channels (Shift back) */
  function onkey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (picked) picked = null
      else onclose()
      return
    }
    if (e.key !== 'Tab' || !(e.target instanceof HTMLInputElement)) return
    e.preventDefault()
    const usable = CHANNELS.filter((c) => c.id !== 'squad' || squad)
    const i = usable.findIndex((c) => c.id === channel)
    channel = usable[(i + (e.shiftKey ? usable.length - 1 : 1)) % usable.length].id
  }
</script>

{#snippet line(l: ChatLine, faded: number)}
  {@const colour = FACTIONS[l.faction].colour}
  <li class="line ui-body" class:news={l.channel === 'news'} style="opacity: {faded}">
    {#if l.channel === 'news'}
      <span class="mark" aria-hidden="true"><Emblem side={l.faction} size={16} /></span>
      <span class="said">{l.text}</span>
    {:else}
      {#if l.channel !== 'room'}<span class="tag {l.channel}">{l.channel === 'side' ? 'SIDE' : 'SQUAD'}</span>{/if}
      <span class="mark" aria-hidden="true"><Emblem side={l.faction} size={16} /></span>
      {#if open && l.key && l.key !== me}
        <button
          type="button"
          class="name"
          style="color: {colour}"
          aria-label="{l.callsign}: mute or block"
          onclick={() => {
            picked = { key: l.key, callsign: l.callsign, faction: l.faction }
            // (the history made shorter by what is offered: its newest still shows)
            void tick().then(() => list && (list.scrollTop = list.scrollHeight))
          }}>{l.callsign}</button
        >
      {:else}
        <span class="name" style="color: {colour}">{l.callsign}</span>
      {/if}
      <span class="said">{words(l)}</span>
    {/if}
  </li>
{/snippet}

{#if !open}
  {#if fresh.length}
    <!-- the latest lines, over the view, newest at the bottom; the top ones fade into it -->
    <section class="chat pointer-events-none" class:small style="top: {top}px; bottom: {bottom}px" aria-label="Chat" aria-live="polite">
      <ol class="lines fresh">
        {#each fresh as l (l.at + l.key + l.text + l.quick)}
          {@render line(l, shownOf(l))}
        {/each}
      </ol>
    </section>
  {/if}
{:else}
  <div
    bind:this={column}
    class="chat open"
    class:small
    style="top: {top}px; bottom: {openBottom}px"
    aria-label="Chat"
    onpointerdown={(e) => e.stopPropagation()}
    onpointerup={(e) => e.stopPropagation()}
    onkeydown={onkey}
    role="dialog"
    tabindex="-1"
  >
    <div class="flex items-end gap-1">
      <div class="min-w-0 flex-1">
        <Tabs
          label="Chat channels"
          items={CHANNELS.map((c) => ({ id: c.id, label: c.label, disabled: c.id === 'squad' && !squad }))}
          value={channel}
          onchange={(c) => {
            channel = c
            picked = null
          }}
        />
      </div>
      <button type="button" class="ui-btn ui-btn-icon ui-btn-quiet flex-none" aria-label="Close chat" onclick={onclose}>
        <UiIcon name="close" />
      </button>
    </div>
    <ol bind:this={list} class="lines history" aria-live="polite">
      {#each history as l (l.at + l.key + l.text + l.quick)}
        {@render line(l, 1)}
      {:else}
        <li class="line ui-body news">
          {channel === 'news'
            ? 'Pilots coming and going, losses and worlds taken show here'
            : channel === 'squad'
              ? 'Your squad hears you here'
              : shared
                ? channel === 'side'
                  ? 'Your side here hears you'
                  : 'Everyone in this zone hears you'
                : 'Nobody else is here to hear you'}
        </li>
      {/each}
    </ol>
    {#if picked}
      <!-- a pilot's name picked: what can be done about him -->
      <div class="picked flex flex-wrap items-center gap-2">
        <span class="ui-body inline-flex items-center gap-1.5" style="color: {FACTIONS[picked.faction].colour}"
          ><Emblem side={picked.faction} size={16} />{picked.callsign}</span
        >
        <button
          type="button"
          class="ui-btn"
          onclick={() => {
            onmute(picked!.key)
            picked = null
          }}>{muted.includes(picked.key) ? 'Unmute' : 'Mute'}</button
        >
        <button
          type="button"
          class="ui-btn"
          use:tip={{ title: 'Block', line: 'Never hear him, nor see what he leaves' }}
          onclick={() => {
            onblock(picked!.key)
            picked = null
          }}>Block</button
        >
        <button type="button" class="ui-btn ui-btn-quiet" onclick={() => (picked = null)}>Back</button>
      </div>
    {/if}
    <form class="flex gap-2" onsubmit={send}>
      <input
        bind:this={field}
        bind:value={text}
        maxlength={CHAT_MOST}
        class="ui-input min-w-0 flex-1 uppercase"
        placeholder={CHANNELS.find((c) => c.id === channel)?.to}
        aria-label="A line of chat"
        autocomplete="off"
        enterkeyhint="send"
        style={to === 'squad' ? 'border-color: var(--color-ok)' : to === 'side' ? `border-color: ${FACTIONS[side].colour}` : ''}
      />
      <button type="submit" class="ui-btn ui-btn-main" class:max-sm:hidden={small}>Send</button>
      <button
        type="button"
        class="ui-btn ui-btn-icon"
        aria-label="Quick chat"
        onclick={() => (wheel = true)}
        use:tip={{ title: 'Quick chat', line: 'Set phrases, a key each' }}><UiIcon name="chat" size={32} /></button
      >
    </form>
  </div>
  {#if wheel}
    <QuickWheel
      title={to === 'squad' ? 'Quick chat: squad' : to === 'side' ? 'Quick chat: side' : 'Quick chat'}
      phrases={QUICK_CHAT}
      colour={FACTIONS[side].colour}
      onpick={(n) => {
        onquick(n, to)
        wheel = false
        onclose()
      }}
      onclose={() => (wheel = false)}
    />
  {/if}
{/if}

<style>
  /* the column down the left of the view: no box, the lines bottom first */
  .chat {
    position: absolute;
    left: max(10px, env(safe-area-inset-left));
    z-index: 5;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    width: min(34rem, 38vw);
  }
  .chat.small {
    width: min(26rem, 42vw);
  }
  /* opened: a soft dark from the left edge, gone by the column's far side; the history scrolls */
  .chat.open {
    left: 0;
    z-index: 9;
    width: min(38rem, 46vw);
    padding: 8px 12px 8px max(10px, env(safe-area-inset-left));
    background: linear-gradient(to right, rgb(6 10 24 / 0.86), rgb(6 10 24 / 0.7) 60%, rgb(6 10 24 / 0));
    animation: chat-open var(--t-panel) var(--ease) both;
    outline: none;
  }
  .chat.open.small {
    width: min(30rem, 52vw);
    background: linear-gradient(to right, rgb(6 10 24 / 0.95), rgb(6 10 24 / 0.86) 70%, rgb(6 10 24 / 0));
  }
  @keyframes chat-open {
    from {
      opacity: 0;
      transform: translateX(-12px);
    }
  }
  .lines {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  /* (the latest lines: the topmost fade into the view, as if rising out of it) */
  .lines.fresh {
    overflow: hidden;
    mask-image: linear-gradient(to bottom, transparent, black 2.2em);
  }
  .lines.history {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgb(244 236 208 / 0.3) transparent;
  }
  .lines.history > :first-child {
    margin-top: auto;
  }
  /* a line: its words in the pixel font with a hard outline a font pixel wide, on a soft dark behind its left */
  .line {
    display: block;
    flex: none;
    padding: 1px 10px 1px 6px;
    overflow-wrap: anywhere;
    text-shadow:
      3px 0 #060a18,
      -3px 0 #060a18,
      0 3px #060a18,
      0 -3px #060a18,
      3px 3px #060a18;
    background: linear-gradient(to right, rgb(6 10 24 / 0.5), rgb(6 10 24 / 0.32) 55%, rgb(6 10 24 / 0));
    animation: line-in 220ms var(--ease) both;
    transition: opacity 400ms linear;
  }
  .small .line {
    line-height: 1.2;
  }
  .open .line {
    background: none;
    animation: none;
  }
  .line.news {
    color: var(--color-ink-dim);
  }
  @keyframes line-in {
    from {
      opacity: 0;
      transform: translateX(-10px);
    }
  }
  .mark {
    display: inline-block;
    vertical-align: -1px;
    margin-right: 6px;
    filter: drop-shadow(2px 2px 0 #060a18);
  }
  .mark :global(img) {
    display: inline-block;
  }
  .name {
    margin-right: 10px;
    padding: 0;
    font: inherit;
    text-transform: inherit;
    background: none;
    border: 0;
  }
  button.name {
    cursor: pointer;
    text-decoration: underline;
    text-decoration-thickness: 3px;
    text-underline-offset: 5px;
    text-decoration-color: rgb(244 236 208 / 0.25);
  }
  button.name:hover,
  button.name:focus-visible {
    outline: none;
    text-decoration-color: currentColor;
  }
  .tag {
    margin-right: 8px;
  }
  .tag.side {
    color: var(--color-accent);
  }
  .tag.squad {
    color: var(--color-ok);
  }
  .picked {
    padding: 6px 0;
  }
</style>
