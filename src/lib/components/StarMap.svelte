<script lang="ts">
  // The maps in three dimensions (maps/starmap.ts draws them, in the game's own pixels): this holds the camera, puts the
  // picture on the page with hard pixels, and lets it be flown about.
  //
  //   a mouse    drag to move over the plane; drag with the right button (or Shift held) to turn round and tilt; the wheel
  //              to come in and go out about the pointer; a click picks, a double click goes in (a system from the galaxy, a
  //              body close up)
  //   the keys   W A S D move, Q E turn, R F tilt, + − in and out, H back to where he is; the arrows (padnav.ts) go from mark
  //              to mark, Enter picks; the controller's right stick turns and tilts, its triggers come in and go out
  //   buttons    in and out, turn, flat or tilted, and back to where he is, in the map's corner
  //
  // Every mark is a button laid over the picture where it was drawn, so the keys, a controller and the tooltips find it.
  import { asset } from '$app/paths'
  import { onMount, untrack } from 'svelte'
  import { clampCam, drawMap, fitCamera, LIMITS, markAt, panBy, zoomAbout } from '../maps/starmap'
  import type { MapCamera, MapMark, MapScene, MarkName, Sprite } from '../maps/starmap'
  import type { TipContent } from './tooltip.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    /** what to show (the time, what the pointer is over, the names' size and whether things move are filled in here) */
    scene: Omit<MapScene, 't' | 'hover' | 'text' | 'motion'>
    /** which view the camera belongs to ('galaxy', 'system:3'): a new one starts from `home` */
    view: string
    /** where the view starts, looking at (x, y) with a disc of `r` round it whole; and where H goes back to */
    home: { x: number; y: number; r: number }
    /** where he is on this map's plane (H goes there), if he is on it */
    me: { x: number; y: number } | null
    /** a thing's place on the plane and its size, for the camera to go to it */
    placeOf: (key: string) => { x: number; y: number; size: number } | null
    onpick: (key: string | null) => void
    /** a double click: into a system, close to a body */
    onenter: (key: string) => void
    tipOf: (key: string) => TipContent | null
    labelOf: (key: string) => string
  }
  let { scene, view, home, me, placeOf, onpick, onenter, tipOf, labelOf }: Props = $props()

  let box = $state<HTMLDivElement>()
  let canvas = $state<HTMLCanvasElement>()
  let cssW = $state(600)
  let cssH = $state(320)
  /** the picture's size (art px), and one art px in CSS px (a whole number of device px) */
  let W = $state(200)
  let H = $state(110)
  let px = $state(3)
  let marks = $state<MapMark[]>([])
  let hover = $state<string | null>(null)

  // ── the camera, kept for each kind of map between openings (where it looked from, not what at)
  const kept = (globalThis as unknown as { __mapLook?: Record<string, { yaw: number; pitch: number }> }).__mapLook ?? {}
  ;(globalThis as unknown as { __mapLook?: typeof kept }).__mapLook = kept
  const kindOf = (v: string) => (v.startsWith('galaxy') ? 'galaxy' : 'system') as 'galaxy' | 'system'
  let cam: MapCamera = { x: 0, y: 0, yaw: 0, pitch: 0.92, dist: 1000 }
  /** where the camera is easing to (null: nowhere) */
  let goal: MapCamera | null = null
  let shownView = ''
  let dirty = true
  /** the camera has been moved by him since this view began (till then it is fitted again as the map changes size) */
  let touched = false

  const motion = () => document.documentElement.dataset.motion !== 'less'

  function homeCam(): MapCamera {
    const k = kindOf(view)
    const look = kept[k] ?? { yaw: 0, pitch: 0.92 }
    return clampCam(fitCamera(home.x, home.y, home.r, W, H, look.pitch, look.yaw), k)
  }
  /** goes to a new view: from further out, coming in */
  function enterView() {
    shownView = view
    touched = false
    const to = homeCam()
    cam = motion() ? { ...to, dist: Math.min(LIMITS[kindOf(view)].far, to.dist * 2.4), yaw: to.yaw - 0.5 } : to
    goal = motion() ? to : null
    dirty = true
  }
  function ease(to: MapCamera) {
    touched = true
    goal = clampCam(to, kindOf(view))
    if (!motion()) {
      cam = goal
      goal = null
    }
    dirty = true
  }

  // ── sizing: about 3 CSS px an art pixel (2 on a short map), a whole number of device px
  function resize() {
    if (!box || !canvas) return
    const ratio = window.devicePixelRatio || 1
    const dev = Math.max(2, Math.round((cssH < 420 ? 2 : 3) * ratio))
    px = dev / ratio
    W = Math.max(60, Math.floor((cssW * ratio) / dev))
    H = Math.max(40, Math.floor((cssH * ratio) / dev))
    canvas.width = W
    canvas.height = H
    image = null
    dirty = true
    if (!touched && shownView) {
      cam = homeCam()
      goal = null
    }
  }

  // ── the marks' art, as pixels
  let sprites: Partial<Record<MarkName, Sprite>> = {}
  function loadSprites() {
    for (const n of ['station', 'gate', 'raiders', 'hotspot', 'derelict'] as MarkName[]) {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width
        c.height = img.height
        const x = c.getContext('2d')
        if (!x) return
        x.drawImage(img, 0, 0)
        const d = x.getImageData(0, 0, img.width, img.height)
        sprites = { ...sprites, [n]: { w: img.width, h: img.height, px: new Uint32Array(d.data.buffer.slice(0)) } }
        dirty = true
      }
      img.src = asset(`/ui/mark-${n}.png` as Parameters<typeof asset>[0])
    }
  }

  // ── drawing, a frame at a time: at once while anything moves, a few times a second otherwise (things beat and march)
  let image: ImageData | null = null
  let fb: Uint32Array | null = null
  let lastDraw = 0
  function draw(t: number) {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    if (!image || image.width !== W || image.height !== H) {
      image = ctx.createImageData(W, H)
      fb = new Uint32Array(image.data.buffer)
    }
    const k = kindOf(view)
    const drawn = drawMap({ w: W, h: H, fb: fb! }, cam, { ...scene, t, hover, text: 1, motion: motion() }, sprites)
    ctx.putImageData(image, 0, 0)
    lastDraw = t
    dirty = false
    kept[k] = { yaw: cam.yaw, pitch: cam.pitch }
    // (the buttons follow the marks: only when one has moved a pixel or more, or come or gone)
    const moved =
      drawn.length !== marks.length ||
      drawn.some((m, i) => m.key !== marks[i].key || Math.abs(m.x - marks[i].x) > 0.6 || Math.abs(m.y - marks[i].y) > 0.6)
    if (moved) marks = drawn
  }

  // ── the controls held: keys and a controller, each frame
  // (not state: read each frame)
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const held = new Set<string>()
  function steer(dt: number) {
    const k = kindOf(view)
    let moved = false
    const pan = (dx: number, dy: number) => {
      cam = panBy(cam, W, H, W / 2, H / 2, W / 2 - dx, H / 2 - dy, k)
      moved = true
    }
    const speed = 160 * dt
    if (held.has('w')) pan(0, speed)
    if (held.has('s')) pan(0, -speed)
    if (held.has('a')) pan(speed, 0)
    if (held.has('d')) pan(-speed, 0)
    let yaw = (held.has('e') ? 1 : 0) - (held.has('q') ? 1 : 0)
    let pitch = (held.has('r') ? 1 : 0) - (held.has('f') ? 1 : 0)
    let zoom = (held.has('-') ? 1 : 0) - (held.has('+') ? 1 : 0)
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue
      const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v)
      yaw += dead(pad.axes[2] ?? 0)
      pitch -= dead(pad.axes[3] ?? 0)
      zoom += (pad.buttons[6]?.value ?? 0) - (pad.buttons[7]?.value ?? 0)
    }
    if (yaw || pitch || zoom) {
      cam = clampCam(
        { ...cam, yaw: cam.yaw + yaw * 1.8 * dt, pitch: cam.pitch + pitch * 1.1 * dt, dist: cam.dist * Math.exp(zoom * 1.6 * dt) },
        k,
      )
      moved = true
    }
    if (moved) {
      goal = null
      touched = true
      dirty = true
    }
  }

  function towards(dt: number) {
    if (!goal) return
    const a = 1 - Math.exp(-dt * 7)
    let dy = goal.yaw - cam.yaw
    dy -= Math.PI * 2 * Math.round(dy / (Math.PI * 2))
    cam = {
      x: cam.x + (goal.x - cam.x) * a,
      y: cam.y + (goal.y - cam.y) * a,
      yaw: cam.yaw + dy * a,
      pitch: cam.pitch + (goal.pitch - cam.pitch) * a,
      dist: Math.exp(Math.log(cam.dist) + (Math.log(goal.dist) - Math.log(cam.dist)) * a),
    }
    if (
      Math.abs(Math.log(goal.dist / cam.dist)) < 0.002 &&
      Math.hypot(goal.x - cam.x, goal.y - cam.y) < cam.dist * 0.001 &&
      Math.abs(dy) < 0.002
    )
      goal = null
    dirty = true
  }

  // ── the mouse: it drags or turns
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const pointers = new Map<number, { x: number; y: number }>()
  let downAt: { x: number; y: number; t: number } | null = null
  let turning = false
  /** a drag happened since the pointer went down: the click that ends it picks nothing */
  let dragged = false
  const local = (e: { clientX: number; clientY: number }) => {
    const r = box!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / px, y: (e.clientY - r.top) / px }
  }

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1 && e.button !== 2) return
    pointers.set(e.pointerId, local(e))
    downAt = { ...local(e), t: performance.now() }
    dragged = false
    turning = e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey
  }
  function move(e: PointerEvent) {
    const p = local(e)
    if (!pointers.has(e.pointerId)) {
      if (e.pointerType === 'mouse') {
        const m = markAt(marks, p.x, p.y)
        if ((m?.key ?? null) !== hover) {
          hover = m?.key ?? null
          dirty = true
        }
      }
      return
    }
    const was = pointers.get(e.pointerId)!
    const k = kindOf(view)
    if (downAt && !dragged && Math.hypot(p.x - downAt.x, p.y - downAt.y) * px > 5) {
      dragged = true
      box?.setPointerCapture(e.pointerId)
    }
    if (!dragged) return
    goal = null
    touched = true
    if (turning) {
      cam = clampCam({ ...cam, yaw: cam.yaw - ((p.x - was.x) * px) / 180, pitch: cam.pitch + ((p.y - was.y) * px) / 260 }, k)
    } else cam = panBy(cam, W, H, was.x, was.y, p.x, p.y, k)
    pointers.set(e.pointerId, p)
    dirty = true
  }
  let lastTap: { key: string | null; t: number } = { key: null, t: 0 }
  function up(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    if (pointers.size || dragged || !downAt) {
      if (!pointers.size) downAt = null
      return
    }
    // (a click that went nowhere: a pick, or a double one going in)
    const p = local(e)
    const m = markAt(marks, p.x, p.y)
    const now = performance.now()
    const key = m?.key ?? null
    if (key && key === lastTap.key && now - lastTap.t < 380) {
      enter(key)
      lastTap = { key: null, t: 0 }
    } else {
      pick(key)
      lastTap = { key, t: now }
    }
    downAt = null
  }
  function wheel(e: WheelEvent) {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    const p = local(e)
    goal = null
    touched = true
    if (e.shiftKey) cam = clampCam({ ...cam, pitch: cam.pitch - e.deltaY * unit * 0.0025 }, kindOf(view))
    else cam = zoomAbout(cam, W, H, p.x, p.y, Math.exp(e.deltaY * unit * (e.ctrlKey ? 0.01 : 0.0016)), kindOf(view))
    dirty = true
  }

  /** a thing picked: the card shows it, and the camera brings it in from near the edge */
  function pick(key: string | null) {
    if (key === 'me') key = null
    onpick(key)
    if (!key) return
    const m = marks.find((x) => x.key === key)
    const p = placeOf(key)
    if (m && p && (m.x < W * 0.18 || m.x > W * 0.82 || m.y < H * 0.18 || m.y > H * 0.82)) ease({ ...cam, x: p.x, y: p.y })
  }
  /** going in: into a system from the galaxy (the page changes the map), close to a body */
  function enter(key: string) {
    if (key === 'me') return
    onpick(key)
    const p = placeOf(key)
    if (kindOf(view) === 'galaxy') {
      if (p) ease({ ...cam, x: p.x, y: p.y, dist: LIMITS.galaxy.near * 1.4 })
      window.setTimeout(() => onenter(key), motion() ? 320 : 0)
      return
    }
    if (p) ease({ ...cam, x: p.x, y: p.y, dist: Math.max(LIMITS.system.near, p.size * 9), pitch: Math.min(cam.pitch, 0.75) })
    onenter(key)
  }
  /** a mark given the focus by the keys or a controller: the camera brings it in if it is near the edge */
  function focused(m: MapMark) {
    const p = placeOf(m.key)
    if (p && (m.x < W * 0.1 || m.x > W * 0.9 || m.y < H * 0.1 || m.y > H * 0.9)) ease({ ...cam, x: p.x, y: p.y })
  }

  // ── the corner's buttons
  const zoomBy = (k: number) => ease(zoomAbout(goal ?? cam, W, H, W / 2, H / 2, k, kindOf(view)))
  const turnBy = (a: number) => ease({ ...(goal ?? cam), yaw: (goal ?? cam).yaw + a })
  let isFlat = $state(false)
  function tilt() {
    const c = goal ?? cam
    isFlat = c.pitch < 1.45
    ease({ ...c, pitch: isFlat ? Math.PI / 2 : 0.92, yaw: isFlat ? 0 : c.yaw })
  }
  function backHome() {
    const c = homeCam()
    if (me) ease({ ...(goal ?? cam), x: me.x, y: me.y, dist: Math.min(c.dist, (goal ?? cam).dist) })
    else ease({ ...c, yaw: (goal ?? cam).yaw, pitch: (goal ?? cam).pitch })
  }

  const KEYS: Record<string, string> = {
    w: 'w',
    a: 'a',
    s: 's',
    d: 'd',
    q: 'q',
    e: 'e',
    r: 'r',
    f: 'f',
    '+': '+',
    '=': '+',
    '-': '-',
    _: '-',
  }
  function keydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.altKey) return
    const k = KEYS[e.key.toLowerCase()]
    if (k) {
      held.add(k)
      e.preventDefault()
    } else if (e.key === 'h' || e.key === 'H' || e.key === 'Home') {
      backHome()
      e.preventDefault()
    }
  }
  function keyup(e: KeyboardEvent) {
    const k = KEYS[e.key.toLowerCase()]
    if (k) held.delete(k)
  }

  onMount(() => {
    loadSprites()
    resize()
    enterView()
    let raf = 0
    let last = performance.now()
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      if (view !== shownView) enterView()
      steer(dt)
      towards(dt)
      if (dirty || t - lastDraw > (motion() ? 66 : 500)) draw(t)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    const blur = () => held.clear()
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', blur)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', keydown)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', blur)
    }
  })

  $effect(() => {
    void cssW
    void cssH
    untrack(resize)
  })
  $effect(() => {
    void scene
    dirty = true
  })
</script>

<div
  bind:this={box}
  bind:clientWidth={cssW}
  bind:clientHeight={cssH}
  class="map absolute inset-0 touch-none overflow-hidden bg-[#04060e] select-none"
  role="application"
  aria-label="Map: drag to move, right drag to turn, the wheel to zoom"
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={(e) => {
    pointers.delete(e.pointerId)
    downAt = null
  }}
  onpointerleave={() => {
    if (hover) {
      hover = null
      dirty = true
    }
  }}
  onwheel={wheel}
  oncontextmenu={(e) => e.preventDefault()}
>
  <canvas
    bind:this={canvas}
    class="absolute top-0 left-0 block"
    style="width: {W * px}px; height: {H * px}px; image-rendering: pixelated"
    aria-hidden="true"
  ></canvas>
  <!-- the marks, as buttons where they were drawn -->
  {#each marks.filter((m) => m.key !== 'me' && m.x >= 0 && m.y >= 0 && m.x < W && m.y < H) as m (m.key)}
    <button
      type="button"
      class="mark absolute"
      style="left: {(m.x - m.r) * px}px; top: {(m.y - m.r) * px}px; width: {m.r * 2 * px}px; height: {m.r * 2 * px}px"
      aria-label={labelOf(m.key)}
      use:tip={tipOf(m.key)}
      onfocus={() => focused(m)}
      onclick={(e) => {
        // (a pointer's click is the map's own, in `up`: this is the keys' and a controller's)
        if (e.detail === 0) pick(m.key)
      }}
      onkeydown={(e) => {
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault()
          enter(m.key)
        }
      }}
    ></button>
  {/each}
  <!-- the camera's buttons -->
  <div
    class="absolute right-2 bottom-2 flex gap-1"
    onpointerdown={(e) => e.stopPropagation()}
    role="toolbar"
    tabindex="-1"
    aria-label="Camera"
  >
    <button
      type="button"
      class="ui-btn ui-btn-icon ui-btn-small"
      aria-label="Turn left"
      use:tip={{ title: 'Turn left', line: 'Q, or drag with the right button' }}
      onclick={() => turnBy(-Math.PI / 6)}>&lt;</button
    >
    <button
      type="button"
      class="ui-btn ui-btn-icon ui-btn-small"
      aria-label="Turn right"
      use:tip={{ title: 'Turn right', line: 'E, or drag with the right button' }}
      onclick={() => turnBy(Math.PI / 6)}>&gt;</button
    >
    <button
      type="button"
      class="ui-btn ui-btn-small"
      aria-label={isFlat ? 'Tilt' : 'Flat'}
      use:tip={{ title: isFlat ? 'Tilt' : 'Flat', line: 'R and F tilt; Shift and the wheel too' }}
      onclick={tilt}>{isFlat ? '3D' : '2D'}</button
    >
    <button
      type="button"
      class="ui-btn ui-btn-icon ui-btn-small"
      aria-label="Zoom out"
      use:tip={{ title: 'Out', line: 'The wheel, a pinch, or -' }}
      onclick={() => zoomBy(1.6)}>-</button
    >
    <button
      type="button"
      class="ui-btn ui-btn-icon ui-btn-small"
      aria-label="Zoom in"
      use:tip={{ title: 'In', line: 'The wheel, a pinch, or +' }}
      onclick={() => zoomBy(1 / 1.6)}>+</button
    >
    <button
      type="button"
      class="ui-btn ui-btn-small"
      aria-label="Where you are"
      use:tip={{ title: 'Where you are', line: 'H' }}
      onclick={backHome}>Here</button
    >
  </div>
</div>

<style>
  .map {
    cursor: grab;
  }
  .map:active {
    cursor: grabbing;
  }
  /* (a mark's button is not seen: the picture under it is; the focus shows as the picture's brackets would) */
  .mark {
    background: transparent;
    border: 0;
    border-radius: 50%;
    cursor: pointer;
    outline: none;
  }
  .mark:focus-visible {
    box-shadow: 0 0 0 2px #f4ecd0;
  }
</style>
