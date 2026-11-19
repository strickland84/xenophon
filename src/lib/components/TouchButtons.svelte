<script lang="ts">
  // Phones and tablets have no keys: buttons on the screen, laid out for a phone held sideways, as few as the moment
  // needs (the fresh review: fourteen buttons left a strip of play). The right thumb has Fire and Boost (held) with Roll
  // and Action above them, Missile above Roll while there are missiles or mines aboard, and in space Cruise, and Target
  // over Action (or over Cruise): a tap the nearest thing in view, the next at each tap, held to let it go; Action is
  // held to land, take off or mine (a tap, landed, climbs out). The left has, overhead, Climb and Dive (held: height,
  // which a finger steering overhead cannot set), the throttle (a lever slid up and down: James's first flight asked for
  // the engines' power to be his, down to a ship hanging still), and More: the rest a press away in a small grid (View, Map, Chat, the
  // Bag and the next ship where they can be used, landed at a friendly base or docked, and the Menu). The middle of the
  // screen is left free for the steering finger, and the top of it for the HUD.
  //
  // On foot: Fire (the sidearm), Jump, Action (climb in, cut a vein, call a ship) and a Flare; the finger is a stick
  // (pushed far, he runs). More has the Beacon (the wheel of what a beacon can say), Chat, the Bag and the Menu. Inside:
  // Run and Action, and More. Flying, More has the Seat too (up out of it to walk the ship while it flies itself); up,
  // the Seat is beside Run and Action, to sit down again at once.
  import type { Press } from '../input/actions'
  import UiIcon from './UiIcon.svelte'
  import { flash } from './tooltip.svelte'

  /** the buttons that work for as long as they are held */
  type Held = 'fire' | 'boost' | 'secondary' | 'land' | 'dive' | 'climb' | 'mine' | 'target'

  interface Props {
    /** the pilot is out of his ship: the buttons for being on foot */
    foot?: boolean
    /** the scene is in space: Cruise in the next ship's place */
    space?: boolean
    /** the pilot is inside (the hangar, the deck, a ship's rooms): the stick, Action and Run only */
    inside?: boolean
    /** … up out of his seat in flight (inside his ship's rooms as it flies): the Seat as well; and in his own ship's rooms
     * landed or docked, the Seat to go back to it */
    up?: boolean
    ownRooms?: boolean
    /** true while the guns, the thrusters, the missile button and Action are held */
    firing: boolean
    boosting: boolean
    launching: boolean
    landing: boolean
    /** missiles or mines aboard (Missile shows), and landed at a friendly base or docked (Bag and Ship among the rest) */
    armed?: boolean
    atBase?: boolean
    /** the Dive and Climb buttons held, and whether they show (overhead in flight: the other views climb by where a finger points) */
    diving?: boolean
    climbing?: boolean
    overhead?: boolean
    /** the ship's power (Power shows, in Missile's place, while the weapons are safe: landed or docked), and whether they are */
    power?: 'off' | 'starting' | 'on' | 'stopping'
    /** ore in the laser's reach (Mine shows, over the right thumb's column: mining has a control of its own, so Action
     * still lands by ore), and Mine held */
    oreNear?: boolean
    /** down or docked at a friendly base with the hull holed: the same button mends it there (Repair) */
    repairNear?: boolean
    /** the last seconds of play are being kept, and can be had as a short film (Clip, among the rest) */
    clips?: boolean
    cutting?: boolean
    /** Target held (a tap picks the next thing in view; held, it lets the target go) */
    targeting?: boolean
    safe?: boolean
    /** the throttle, 0..1, as the scene has it; and the lever slid to a new one */
    throttle?: number
    onthrottle?: (level: number) => void
    /** a held button lights up in this colour */
    accentColor: string
    /** Fire, Boost or Missile went down or up */
    onhold: (what: Held, down: boolean) => void
    /** a button that works once was pressed */
    onpress: (action: Press) => void
  }
  let {
    foot = false,
    space = false,
    inside = false,
    up = false,
    ownRooms = false,
    firing,
    boosting,
    launching,
    landing,
    diving = false,
    climbing = false,
    overhead = true,
    armed = true,
    atBase = false,
    throttle = 1,
    power = 'on',
    oreNear = false,
    repairNear = false,
    clips = false,
    cutting = false,
    targeting = false,
    safe = false,
    onthrottle,
    accentColor,
    onhold,
    onpress,
  }: Props = $props()

  const look =
    'absolute flex cursor-pointer items-center justify-center rounded-[4px] border-2 outline-none transition-[background-color,border-color,transform] duration-100 select-none focus-visible:border-white active:translate-y-[2px]'
  const idle = 'border-white/30 bg-[#0b1a33]/60 active:bg-[#0b1a33]/90'
  const size = 'h-12 w-14'
  /** each button's picture (static/ui: drawn by the image model) */
  const ICON: Record<string, string> = {
    Fire: 'fire',
    Missile: 'missile',
    Boost: 'boost',
    Roll: 'roll',
    Action: 'action',
    View: 'view',
    Cruise: 'cruise',
    Ship: 'ships',
    Bag: 'bag',
    Menu: 'menu',
    Map: 'map',
    Chat: 'chat',
    Climb: 'climb',
    Dive: 'dive',
    Flare: 'flare',
    Beacon: 'beacon',
    Run: 'run',
    Power: 'power',
    Mine: 'w-laser',
    Repair: 'supplies',
    Clip: 'picture',
    Jump: 'climb',
    Seat: 'seat',
    Target: 'm-scanner',
  }
  /** what each does, said the first time it is pressed */
  const WHAT: Record<string, string> = {
    Fire: 'Hold: the guns',
    Missile: 'A missile, once locked',
    Boost: 'Hold: the thrusters',
    Roll: 'Roll: shakes off a missile',
    Action: 'Hold: land, mine, take off',
    View: 'The next view',
    Cruise: 'The cruise drive',
    Ship: 'Into the hangar',
    Bag: 'The hold and the vault',
    Menu: 'The menu',
    Map: 'The maps',
    Chat: 'Chat',
    Climb: 'Hold: climb',
    Dive: 'Hold: dive',
    Flare: 'A flare',
    Beacon: 'Plant a beacon',
    Run: 'Hold: run',
    Throttle: 'Slide: the engines’ power, down to a stop',
    Power: 'The ship’s power, on and off (landed or docked)',
    Mine: 'Hold: the mining laser',
    Repair: 'Hold: mend the hull, here at the base',
    Clip: 'Keeps the last seconds as a short film to send',
    Jump: 'Jump (push into a cliff to climb it)',
    Seat: 'Up from the seat to walk the ship (flying or landed), and back',
    Target: 'Target the nearest, tap again for the next (hold: let go)',
  }
  // (the buttons pressed before, this device: their names are said once only)
  let seen: string[] = []
  try {
    seen = JSON.parse(localStorage.getItem('xenophon/touch-seen') ?? '[]')
  } catch {
    seen = []
  }
  function firstPress(label: string, node: HTMLElement) {
    // (those that open a screen are named by the screen)
    if (seen.includes(label) || ['Bag', 'Menu', 'Map', 'Chat'].includes(label)) return
    seen = [...seen, label]
    try {
      localStorage.setItem('xenophon/touch-seen', JSON.stringify(seen))
    } catch {
      // (no storage: said again next time)
    }
    flash(node, { title: label, line: WHAT[label] })
  }

  // the buttons keep their touches to themselves: a finger on one does not steer
  const mine = (e: Event) => e.stopPropagation()

  /** a button that works for as long as it is held: it keeps its finger even if the finger slides off */
  function holdOn(what: Held) {
    return (e: PointerEvent & { currentTarget: HTMLButtonElement }) => {
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // the touch has already ended
      }
      onhold(what, true)
    }
  }
  function holdOff(what: Held) {
    return (e: Event) => {
      e.stopPropagation()
      onhold(what, false)
    }
  }
  // (the edges of the screen, clear of a notch or rounded corners; a button 3.5rem wide, a column 3.75rem on from the last)
  const left = 'max(14px, env(safe-area-inset-left))'
  const right = 'max(14px, env(safe-area-inset-right))'
  const bottom = 'max(14px, env(safe-area-inset-bottom))'
  const above = 'calc(max(14px, env(safe-area-inset-bottom)) + 3.5rem)'
  const inward = 'calc(max(14px, env(safe-area-inset-right)) + 3.75rem)'
  const higher = 'calc(max(14px, env(safe-area-inset-bottom)) + 7rem)'
  const inwardLeft = 'calc(max(14px, env(safe-area-inset-left)) + 3.75rem)'
  const highest = 'calc(max(14px, env(safe-area-inset-bottom)) + 10.5rem)'

  /** the rest, a press away: what More opens, in the order it lays them out */
  const rest = $derived(
    up
      ? (['Map', 'Chat', 'Menu'] as const)
      : inside
        ? (['Bag', 'Chat', 'Menu'] as const)
        : foot
          ? (['Beacon', 'Chat', ...(atBase ? (['Bag'] as const) : []), 'Menu'] as const)
          : ([
              'View',
              'Map',
              'Chat',
              ...(atBase ? (['Bag'] as const) : []),
              ...(atBase && !space ? (['Ship'] as const) : []),
              // (up out of the seat: flying, the ship flying on; landed or docked, into his ship's rooms)
              'Seat',
              // (the last seconds kept as a short film to send, where the device can make one)
              ...(clips ? (['Clip'] as const) : []),
              'Menu',
            ] as const),
  )
  /** what each of the rest does when pressed */
  const ACTION: Record<string, Press> = {
    View: 'view',
    Map: 'map',
    Chat: 'chat',
    Bag: 'inventory',
    Ship: 'nextShip',
    Menu: 'menu',
    Beacon: 'view',
    Seat: 'seat',
    Clip: 'clip',
  }
  let more = $state(false)

  // the throttle's lever: a finger on it sets it where it is up the track (the top is full), and keeps it as it slides
  let sliding = $state(false)
  function slide(e: PointerEvent & { currentTarget: HTMLElement }) {
    const r = e.currentTarget.getBoundingClientRect()
    const pad = 10 // (the lever's ends: the last px are its stops, so a thumb reaches 0 and 1 without going off it)
    const level = 1 - (e.clientY - r.top - pad) / Math.max(1, r.height - pad * 2)
    onthrottle?.(Math.round(Math.max(0, Math.min(1, level)) * 20) / 20)
  }
</script>

{#snippet once(label: string, action: Press, x: string, y: string, fromLeft: boolean)}
  <button
    type="button"
    aria-label={label}
    class="{look} {idle} {size}"
    style="{fromLeft ? 'left' : 'right'}: {x}; bottom: {y}; touch-action: none"
    onclick={(e) => {
      firstPress(label, e.currentTarget)
      onpress(action)
    }}
    onpointerdown={mine}
    onpointermove={mine}
    onpointerup={mine}
  >
    <UiIcon name={ICON[label]} size={40} />
  </button>
{/snippet}

{#snippet held(label: string, what: Held, on: boolean, x: string, y: string, fromLeft = false)}
  <button
    type="button"
    aria-label="{label}: hold"
    aria-pressed={on}
    class="{look} {size} {on ? 'border-white/70' : 'border-white/30 bg-[#0b1a33]/60'}"
    style="{fromLeft ? 'left' : 'right'}: {x}; bottom: {y}; touch-action: none"
    style:background-color={on ? accentColor : null}
    onpointerdown={(e) => {
      firstPress(label, e.currentTarget)
      holdOn(what)(e)
    }}
    onpointermove={mine}
    onpointerup={holdOff(what)}
    onpointercancel={holdOff(what)}
    onlostpointercapture={holdOff(what)}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <UiIcon name={ICON[label]} size={40} />
  </button>
{/snippet}

<!-- More: the rest of what can be done, a press away, laid out in a small grid over the left thumb's buttons -->
<button
  type="button"
  aria-label="More"
  aria-expanded={more}
  class="{look} {size} {more ? 'border-white/70 bg-[#0b1a33]/90' : idle}"
  style="left: {left}; bottom: {foot || inside || !overhead ? bottom : higher}; touch-action: none"
  onclick={() => (more = !more)}
  onpointerdown={mine}
  onpointermove={mine}
  onpointerup={mine}
>
  <UiIcon name="menu" size={40} />
</button>
{#if more}
  <div
    class="more absolute grid grid-cols-3 gap-2 rounded-[4px] border-2 border-white/30 bg-[#060a18]/85 p-2"
    style="left: {left}; bottom: calc({foot || inside || !overhead ? bottom : higher} + 3.75rem)"
    role="group"
    aria-label="More"
  >
    {#each rest as label (label)}
      <button
        type="button"
        aria-label={label}
        class="{look} {idle} {size} relative"
        style="touch-action: none"
        onclick={(e) => {
          firstPress(label, e.currentTarget)
          more = false
          onpress(ACTION[label])
        }}
        onpointerdown={mine}
        onpointermove={mine}
        onpointerup={mine}
      >
        <UiIcon name={ICON[label]} size={40} />
      </button>
    {/each}
  </div>
{/if}

{#if inside}
  <!-- inside: the left thumb holds the stick; Action uses what he stands by (up in flight, the Seat over them sits him down) -->
  {@render held('Run', 'boost', boosting, right, above)}
  {@render held('Action', 'land', landing, right, bottom)}
  {#if up || ownRooms}
    {@render once('Seat', 'seat', right, higher, false)}
  {/if}
{:else if foot}
  <!-- on foot: the left thumb holds the stick (anywhere on the screen) -->
  {@render held('Fire', 'fire', firing, right, bottom)}
  {@render once('Jump', 'roll', right, above, false)}
  {@render held('Action', 'land', landing, inward, bottom)}
  {@render held('Flare', 'secondary', launching, right, higher)}
{:else}
  {#if overhead}
    <!-- overhead, height is the buttons': Dive and Climb (from behind or the cockpit, a finger above or below the ship climbs and dives) -->
    {@render held('Climb', 'climb', climbing, left, above, true)}
    {@render held('Dive', 'dive', diving, left, bottom, true)}
  {/if}
  <!-- the throttle: a lever beside the left thumb's buttons, three of them tall -->
  <div
    class="throttle absolute rounded-[4px] border-2 {sliding ? 'border-white/70' : 'border-white/30'} bg-[#0b1a33]/60"
    style="left: {inwardLeft}; bottom: {bottom}; touch-action: none"
    role="slider"
    tabindex="-1"
    aria-label="Throttle"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(throttle * 100)}
    onpointerdown={(e) => {
      e.stopPropagation()
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // the touch has already ended
      }
      sliding = true
      firstPress('Throttle', e.currentTarget)
      slide(e)
    }}
    onpointermove={(e) => {
      e.stopPropagation()
      if (sliding) slide(e)
    }}
    onpointerup={(e) => {
      e.stopPropagation()
      sliding = false
    }}
    onpointercancel={() => (sliding = false)}
    onlostpointercapture={() => (sliding = false)}
    oncontextmenu={(e) => e.preventDefault()}
  >
    <span class="track" aria-hidden="true">
      <span class="fill" style:height="{throttle * 100}%" style:background-color={accentColor}></span>
      {#each [0.25, 0.5, 0.75] as n (n)}
        <span class="notch" style:bottom="{n * 100}%"></span>
      {/each}
    </span>
    <span class="grip" style:bottom="calc({throttle} * (100% - 20px))" aria-hidden="true"></span>
    <span class="word ui-label" aria-hidden="true">{throttle <= 0 ? 'STOP' : Math.round(throttle * 100)}</span>
  </div>
  <!-- right thumb: the guns, the thrusters, the roll and Action always; a missile while there are some; the cruise drive in space -->
  {@render held('Fire', 'fire', firing, right, bottom)}
  {@render held('Boost', 'boost', boosting, inward, bottom)}
  {@render once('Roll', 'roll', right, above, false)}
  {@render held('Action', 'land', landing, inward, above)}
  {#if safe}
    <!-- landed or docked the weapons are safe: the ship's power switch in Missile's place, lit while the power is off -->
    <button
      type="button"
      aria-label="Power"
      aria-pressed={power !== 'off' && power !== 'stopping'}
      class="{look} {size} power {power === 'off' ? 'off border-white/70' : 'border-white/30 bg-[#0b1a33]/60'}"
      style="right: {right}; bottom: {higher}; touch-action: none"
      style:background-color={power === 'on' || power === 'starting' ? accentColor : null}
      onclick={(e) => {
        firstPress('Power', e.currentTarget)
        onpress('power')
      }}
      onpointerdown={mine}
      onpointermove={mine}
      onpointerup={mine}
    >
      <UiIcon name="power" size={40} />
    </button>
  {:else if armed}
    {@render held('Missile', 'secondary', launching, right, higher)}
  {/if}
  {#if space}
    {@render once('Cruise', 'cruise', inward, higher, false)}
  {/if}
  <!-- the target: the nearest thing in view, the next at each tap (over Cruise in space, else in its place) -->
  {@render held('Target', 'target', targeting, inward, space ? highest : higher)}
  {#if oreNear}
    {@render held('Mine', 'mine', cutting, right, highest)}
  {:else if repairNear}
    {@render held('Repair', 'mine', cutting, right, highest)}
  {/if}
{/if}

<style>
  /* the throttle's lever: as tall as three buttons, a track with notches at the quarters, a grip where it is set, and
     how far open it is in the HUD's words under the grip */
  .throttle {
    width: 3.5rem;
    height: 10.5rem;
  }
  .track {
    position: absolute;
    left: 50%;
    top: 10px;
    bottom: 10px;
    width: 10px;
    transform: translateX(-50%);
    background: #060a18cc;
    border: 2px solid #ffffff30;
    border-radius: 2px;
    overflow: hidden;
  }
  .fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    opacity: 0.9;
  }
  .notch {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: #060a18;
  }
  .grip {
    position: absolute;
    left: 6px;
    right: 6px;
    height: 20px;
    border: 2px solid #ffffffb0;
    border-radius: 3px;
    background: #0b1a33;
    box-shadow: inset 0 -4px 0 #ffffff20;
  }
  .word {
    position: absolute;
    left: 0;
    right: 0;
    top: -1.75rem;
    text-align: center;
    color: #fff;
    text-shadow: 0 2px 0 #000a;
    pointer-events: none;
  }
  /* the power switch, while the power is off: an amber edge breathing, so a new pilot sees where to start */
  .power.off {
    background: #2a1a06e6;
    color: #ffd27a;
    animation: power-off 1.4s ease-in-out infinite;
  }
  .power {
    color: #fff;
  }
  @keyframes power-off {
    50% {
      border-color: #ffb84080;
    }
  }
  :global([data-motion='reduce']) .power.off {
    animation: none;
  }
  .more {
    animation: more-in 140ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  .more > button {
    position: relative;
  }
  @keyframes more-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
</style>
