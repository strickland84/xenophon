<script lang="ts">
  // The flying scene, on a page: it owns the canvases and runs the frame loop, and it gathers
  // what the player does with the mouse, keys and game controllers into one set of
  // named actions (lib/input/actions.ts). What is held goes to the scene as it changes; what
  // is pressed once goes to the scene, or is dealt with here. It plays the scene's sounds
  // (lib/audio), silent until the first click or key. It fills whatever element it is put in.
  //
  // The page around it can be handed the scene (`onScene`), to do something with it every frame
  // (the network, lib/net), and is told when the player picks another ship, volume or view, or
  // presses Menu. It can add to the row at the top (`top`).

  import { onMount, untrack } from 'svelte'
  import type { Snippet } from 'svelte'
  import { listenForUnlock, setEffectsVolume, unlockAudio } from '../audio/mixer'
  import { createSound, listener } from '../audio/sound'
  import { createClock, startLoop } from '../display/loop'
  import { createScreen } from '../display/screen'
  import type { Screen } from '../display/screen'
  import { createScene, HULL_NAMES, STEP, THROTTLE, withDefaults } from '../engine'
  import type { Scene, SceneParams, ViewMode } from '../engine'
  import { combine, isSceneAction, nothingHeld } from '../input/actions'
  import type { PageAction, Press } from '../input/actions'
  import { createGamepadInput } from '../input/gamepad'
  import type { GamepadInput, PadKind } from '../input/gamepad'
  import { footHint, hintChips, hintFor, insideHint, spaceHint, upHint } from '../input/hints'
  import type { InputKind } from '../input/hints'
  import { buttonName, DEFAULT_BINDINGS, firstKey } from '../input/bindings'
  import type { Bindings } from '../input/bindings'
  import { createKeyboardInput } from '../input/keyboard'
  import type { KeyboardInput } from '../input/keyboard'
  import { createPointerInput } from '../input/pointer'
  import type { PointerInput } from '../input/pointer'
  import HintBar from './HintBar.svelte'
  import SoundButton from './SoundButton.svelte'

  type Props = Partial<SceneParams> & {
    /** size of one art pixel on screen, in CSS px. 0 picks one that suits the canvas */
    pixelSize?: number
    /** the player asked for larger text (the HUD's too), and for less motion */
    largeText?: boolean
    reduceMotion?: boolean
    /** the line of help that says how to fly */
    showHint?: boolean
    /** how loud, 0 (silent) … 1; the sound button changes it */
    volume?: number
    /** the scene, once it is made: what is returned is called every frame (after the steps, before the picture), and when it goes */
    onScene?: (scene: Scene) => { frame?: () => void; dispose?: () => void } | void
    /** the player picked another ship, volume or view */
    onHull?: (hull: string) => void
    onVolume?: (volume: number) => void
    onView?: (view: ViewMode) => void
    /** Menu was pressed (Escape, Options, or the Menu button) */
    onMenu?: () => void
    /** the hold was asked for (Tab, the D-pad's up, or the Bag button) */
    onInventory?: () => void
    /** the maps were asked for (M, the touchpad or Select, or the Map button) */
    onMap?: () => void
    /** chat was asked for (Enter, the D-pad's right, or the Chat button) */
    onChat?: () => void
    /** a clip was asked for (X, or the Clip button): the last seconds, as a short film (display/clips.ts) */
    onClip?: () => void
    /** a frame was drawn: the pixel picture and the smooth flames over it, for the page to film (display/clips.ts) */
    onPicture?: (picture: HTMLCanvasElement, flames: HTMLCanvasElement) => void
    /** on foot, View (the Beacon button) was pressed: true if the page takes it (to choose what the beacon says) */
    onBeacon?: () => boolean
    /** a screen of the page has the controller (padnav.ts): it does not fly the ship meanwhile */
    padOff?: boolean
    /** the keys and controller buttons as the player has bound them (input/bindings.ts) */
    bindings?: Bindings
    /** the guns and the thrusters as switches, pressed on and pressed off, rather than held */
    toggle?: { fire: boolean; boost: boolean }
    /** the device the player is using changed (keys and mouse, a controller): the page words its prompts for it */
    onInput?: (kind: InputKind) => void
    /** more for the row at the top, beside the sound button */
    top?: Snippet
    /** where the HUD is, for what the page lays over the view (the chat): one art pixel in CSS px, the HUD kept to the top
     * (the cockpit), in the cockpit, and the view from overhead */
    onHud?: (hud: { pixel: number; top: boolean; cockpit: boolean; overhead: boolean }) => void
  }
  let {
    pixelSize = 0,
    largeText = false,
    reduceMotion = false,
    showHint = true,
    volume = 0.7,
    onScene,
    onHull,
    onVolume,
    onView,
    onMenu,
    onInventory,
    onMap,
    onChat,
    onClip,
    onPicture,
    onBeacon,
    padOff = false,
    bindings = DEFAULT_BINDINGS,
    toggle = { fire: false, boost: false },
    onInput,
    top,
    onHud,
    ...settings
  }: Props = $props()

  /** seconds the line of help stays up after it is shown */
  const HINT_TIME = 7

  let container: HTMLDivElement
  let canvas: HTMLCanvasElement
  let flames: HTMLCanvasElement

  // true where the graphics card cannot draw the smooth flames: they are drawn in pixels instead
  let noSmoothFlames = $state(false)
  // the guns and thrusters switched on, when they work as switches (the toggle setting); and whether they were down last time
  let fireOn = $state(false)
  let boostOn = $state(false)
  let fireWas = false
  let boostWas = false
  // the volume, as the sound button last left it (null: the one the settings ask for)
  let volumePick = $state<number | null>(null)
  const loudness = $derived(volumePick ?? Math.max(0, Math.min(1, volume)))
  // which kind of game controller is flying the jet right now (null while it is the mouse and keys)
  let padInput = $state<PadKind | null>(null)
  // the view the line of help is about (null: the one the settings ask for), and whether it shows
  let hintView = $state<ViewMode | null>(null)
  let hintOn = $state(true)

  // the ship picked with the H key or the Ship button (null: the one the settings ask for)
  let hullPick = $state<string | null>(null)
  // the pilot is out of his ship (on foot, coming down, or dead): other help
  let afoot = $state(false)
  /** inside: the hangar, the deck, a ship's rooms; or up out of his seat in flight, walking his ship's rooms (upNow) */
  let insideNow = $state(false)
  let upNow = $state(false)
  // the scene is in space: the view button works the cruise drive, and the help says so
  let inSpace = $state(false)
  /** one art pixel in CSS px, as the screen laid it out */
  let artPixel = $state(0)
  const params = $derived.by(() => {
    const merged = withDefaults(settings)
    if (hullPick) merged.hull = hullPick
    if (noSmoothFlames) merged.flameStyle = 'pixel'
    // (the HUD's text twice the size where an art pixel is small on the screen, so it is never under ~14 CSS px tall, or when asked)
    merged.hudScale = largeText || (artPixel > 0 && artPixel * 5 < 14) ? 2 : 1
    merged.hudMotion = !reduceMotion && !(typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    // (the HUD's prompts name the Land button as the device in use calls it, as bound; in letters the HUD's font has)
    merged.useKey = padInput ? hudButton(bindings.pad.use?.[0] ?? 1, padInput === 'ps') : firstKey(bindings, 'use') || 'F'
    merged.mineKey = padInput ? hudButton(bindings.pad.mine?.[0] ?? 4, padInput === 'ps') : firstKey(bindings, 'mine') || 'R'
    merged.powerKey = padInput ? hudButton(bindings.pad.power?.[0] ?? 13, padInput === 'ps') : firstKey(bindings, 'power') || 'P'
    merged.seatKey = padInput ? hudButton(bindings.pad.seat?.[0] ?? 10, padInput === 'ps') : firstKey(bindings, 'seat') || 'G'
    // (on the page a ship landed or docked waits with its power off until its pilot brings it up: sim/power.ts)
    merged.coldStart = settings.coldStart ?? true
    // (and with nobody steering it, it holds its course: only a ship on show flies itself about)
    merged.wander = false
    return merged
  })
  /** a controller's button as the HUD's font can draw it (a PlayStation pad's shapes as letters) */
  function hudButton(button: number, ps: boolean) {
    const name = buttonName(button, ps)
    return ({ '✕': 'X', '○': 'O', '□': 'SQ', '△': 'TRI' } as Record<string, string>)[name] ?? name
  }
  /** the device in use, as the help and the page's prompts word things */
  const inputKind = $derived<InputKind>(padInput ?? 'pointer')
  $effect(() => {
    onInput?.(inputKind)
  })
  const settingsView = $derived(params.view)
  $effect(() => {
    const view = hintView ?? params.view
    onHud?.({
      pixel: artPixel,
      top: view === 'cockpit',
      cockpit: view === 'cockpit',
      overhead: view === 'top',
    })
  })
  const hint = $derived(
    upNow
      ? upHint(inputKind, bindings)
      : insideNow
        ? insideHint(inputKind, bindings)
        : afoot
          ? footHint(inputKind, bindings)
          : inSpace
            ? spaceHint(inputKind, bindings)
            : hintFor(hintView ?? params.view, inputKind, params.invertY, params.world !== '', bindings),
  )

  /** the help as key caps */
  const chips = $derived(
    hintChips(
      upNow ? 'up' : insideNow ? 'inside' : afoot ? 'foot' : inSpace ? 'space' : 'fly',
      hintView ?? params.view,
      inputKind,
      params.world !== '',
      bindings,
    ),
  )

  // (not reactive: these are handles on things that live outside Svelte)
  let scene: Scene | undefined
  let screen: Screen | null = null
  let keyboard: KeyboardInput | undefined
  let gamepad: GamepadInput | undefined
  let pointer: PointerInput | undefined
  let hintTimer = 0

  // so the keys still fly it after a click
  const focus = () => container.focus({ preventScroll: true })

  const fadeHintIn = (seconds: number) => {
    window.clearTimeout(hintTimer)
    hintTimer = window.setTimeout(() => (hintOn = false), seconds * 1000)
  }
  /** show the line of help for a view, then let it fade */
  function revealHint(view: ViewMode) {
    hintView = view
    hintOn = true
    fadeHintIn(HINT_TIME)
  }

  /**
   * When the keys or a controller's stick last turned the ship, and how long after that a mouse moved does not take the
   * ship from them (ms). A pilot who flies on the keys and fires with the mouse nudges it with every shot, and each nudge
   * handed the ship to wherever the pointer happened to lie.
   */
  let keysTurnedAt = -Infinity
  const KEYS_KEEP = 1200

  /** every device holds things down at once: add them up and tell the scene */
  function sendControls() {
    if (!scene || !keyboard || !gamepad || !pointer) return
    const held = combine([keyboard.held, padOff ? nothingHeld() : gamepad.held, pointer.held])
    // (the keys or a stick are turning the ship: see `steer`, below)
    if (held.turn !== 0) keysTurnedAt = performance.now()
    // (as switches: each press turns them on, or off again)
    if (toggle.fire) {
      if (held.fire && !fireWas) fireOn = !fireOn
      fireWas = held.fire
      held.fire = fireOn
    }
    if (toggle.boost) {
      const down = held.boost > 0.5
      if (down && !boostWas) boostOn = !boostOn
      boostWas = down
      held.boost = boostOn ? 1 : 0
    }
    scene.setControls(held)
  }

  /** something pressed once, on any device */
  function press(action: Press) {
    if (!scene) return
    if (isSceneAction(action)) {
      // (on foot, the page may choose what the beacon says before it is planted)
      if (action === 'view' && afoot && !insideNow && onBeacon?.()) return
      scene.act(action)
      if (action === 'view' && !afoot) {
        revealHint(scene.view)
        onView?.(scene.view)
      }
    } else pageAction(action)
  }

  /** the actions that are the page's to deal with */
  function pageAction(action: PageAction) {
    switch (action) {
      case 'nextShip': {
        // (where there are bases, a ship is changed for another only landed at a friendly one, and sitting in it)
        const loop = scene?.loop
        if (afoot || (loop?.on && !(loop.stage === 'landed' && loop.base?.friendly))) break
        hullPick = HULL_NAMES[(HULL_NAMES.indexOf(params.hull) + 1) % HULL_NAMES.length]
        onHull?.(hullPick)
        break
      }
      case 'inventory':
        onInventory?.()
        break
      case 'menu':
        onMenu?.()
        break
      case 'map':
        onMap?.()
        break
      case 'chat':
        onChat?.()
        break
      case 'clip':
        onClip?.()
        break
    }
  }

  /** the mouse or a key takes over from the controller: the line of help goes back to theirs */
  function padLetGo() {
    if (padInput !== null && !gamepad?.busy) padInput = null
  }
  /** true for a key pressed in a text box, on a button or on a link: not ours */
  function typingElsewhere(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null
    return !!el && el !== container && (/^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(el.tagName) || el.isContentEditable)
  }

  onMount(() => {
    const flown = (scene = createScene(params))
    const hooked = onScene?.(flown) ?? undefined
    const shown = (screen = createScreen({ container, canvas, flames, scene, onFlamesUnavailable: () => (noSmoothFlames = true) }))
    if (!shown) return
    shown.layout(pixelSize)
    artPixel = shown.pixel
    const resizing = new ResizeObserver(() => {
      shown.layout(pixelSize)
      artPixel = shown.pixel
    })
    resizing.observe(container)

    // sound: silent until the player first clicks or presses a key (the mixer is made then)
    setEffectsVolume(untrack(() => loudness))
    const stopListening = listenForUnlock()
    const sound = createSound()
    const hear = listener()
    // (while developing, a test browser can read what was played: never in a build)
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__xenophonSound = sound

    const keys = (keyboard = createKeyboardInput({
      bindings: untrack(() => bindings),
      // (the pitch keys climb and dive as named: the scene's turning over is for the mouse and a stick)
      invert: () => params.invertY,
      ignore: typingElsewhere,
      onActivity: padLetGo,
      onChange: sendControls,
      onPress: press,
    }))
    const pad = (gamepad = createGamepadInput({
      bindings: untrack(() => bindings),
      onActive(kind) {
        if (padInput === kind) return
        padInput = kind
        revealHint(flown.view) // show its buttons
      },
      onGone: () => (padInput = null),
      onChange: sendControls,
      onPress: (action) => {
        if (!padOff) press(action)
      },
    }))
    const mouse = (pointer = createPointerInput(container, {
      toFrame: (x, y) => shown.toFrame(x, y),
      steer(x, y) {
        // (the mouse moved while the keys fly the ship: left alone)
        if (performance.now() - keysTurnedAt < KEYS_KEEP) return
        padLetGo()
        flown.pointerMove(x, y)
      },
      letGo: () => flown.pointerLeave(),
      onChange: sendControls,
      onPress: press,
      // (the wheel moves the throttle, a notch at a time)
      onWheel: (notches) => flown.throttleBy(Math.max(-3, Math.min(3, notches)) * THROTTLE.notch),
      onDown() {
        padLetGo()
        focus()
        // the first hint stays a little longer, so the tips are still there to read
        if (!hintTimer) fadeHintIn(9)
      },
    }))

    // the scene moves on in fixed steps, however fast the screen repaints; nothing moved, nothing to draw
    const clock = createClock()
    const stop = startLoop((dt, now) => {
      if (!flown.width) return
      const steps = clock.advance(dt)
      if (steps === 0) return
      pad.poll()
      for (let n = 0; n < steps; n++) flown.step(STEP)
      hooked?.frame?.()
      // out of his ship: the camera pulled in (larger art pixels), and the help for being on foot
      shown.setZoom(flown.zoom, flown.fit)
      const space = flown.zone.kind === 'space'
      if (space !== inSpace) {
        inSpace = space
        hintOn = true
        fadeHintIn(HINT_TIME)
      }
      const foot = flown.foot
      if (foot.up !== upNow) {
        upNow = foot.up
        hintOn = true
        fadeHintIn(HINT_TIME)
      }
      insideNow = flown.zone.kind === 'interior' || foot.up
      const out = foot.stage !== 'ship'
      if (out !== afoot) {
        afoot = out
        hintOn = true
        fadeHintIn(HINT_TIME)
      }
      shown.present(now)
      onPicture?.(canvas, flames)
      sound.play(flown.takeSounds())
      sound.update(hear(flown, foot, now / 1000))
    })

    return () => {
      stop()
      hooked?.dispose?.()
      resizing.disconnect()
      keys.dispose()
      pad.dispose()
      mouse.dispose()
      shown.dispose()
      stopListening()
      sound.dispose()
      window.clearTimeout(hintTimer)
      scene = undefined
      screen = null
    }
  })

  $effect(() => {
    scene?.setParams(params)
  })
  // the keys and buttons bound otherwise (the settings): told only when they really are
  let boundAs = ''
  $effect(() => {
    const text = JSON.stringify(bindings)
    if (text === boundAs) return
    const first = !boundAs
    boundAs = text
    if (first) return
    const b = JSON.parse(text)
    keyboard?.rebind(b)
    gamepad?.rebind(b)
  })
  // switches off when switched to holding again, and when he leaves his ship or goes in (or gets up out of its seat)
  $effect(() => {
    void [toggle.fire, toggle.boost, afoot, insideNow, upNow]
    fireOn = boostOn = false
  })
  $effect(() => {
    screen?.layout(pixelSize)
    if (screen) artPixel = screen.pixel
  })
  $effect(() => {
    setEffectsVolume(loudness)
  })
  // (the volume set elsewhere, the settings: it is the one heard now)
  $effect(() => {
    void volume
    untrack(() => (volumePick = null))
  })
  // when the view is switched from the settings, show that view's line of help
  let firstView = true
  $effect(() => {
    const view = settingsView
    if (firstView) firstView = false
    else untrack(() => revealHint(view))
  })
</script>

<!-- The scene takes the keyboard focus so that the keys fly the jet: it is one big control. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={container}
  role="application"
  aria-label="A pixel-art spaceship dogfight over islands. The pointer, arrow keys or WASD steer, the left mouse button fires the guns and the right one a missile once it has locked on, Shift opens the thrusters, Space rolls (a roll at the right moment shakes off a missile) and V moves between the overhead view, the view from behind the ship and the cockpit. A game controller works too."
  tabindex="0"
  class="relative h-full min-h-[320px] w-full overflow-hidden bg-[#2468b4] outline-none select-none"
  style="cursor: url('/ui/reticle-32.png') 16 16, crosshair"
  onpointerenter={focus}
>
  <canvas bind:this={canvas} aria-hidden="true" class="absolute block" style="image-rendering: pixelated"></canvas>
  <!-- smooth flames are drawn here, over the picture -->
  <canvas bind:this={flames} aria-hidden="true" class="pointer-events-none absolute block"></canvas>

  {#if showHint}
    <!-- the line of help, always at the very bottom of the view -->
    <HintBar text={hint} {chips} visible={hintOn} />
  {/if}
  <!-- the row at the top: the volume, and whatever the page adds -->
  <div class="pointer-events-none absolute inset-x-0 top-[max(6px,env(safe-area-inset-top))] flex justify-center gap-1.5">
    <SoundButton
      volume={loudness}
      onchange={(v) => {
        volumePick = v
        unlockAudio()
        setEffectsVolume(v)
        onVolume?.(v)
        focus()
      }}
    />
    {@render top?.()}
  </div>
</div>
