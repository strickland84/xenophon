// Puts a scene on the page. The picture goes onto a small canvas that is shown scaled up
// with hard pixels; smooth flames, when the scene asks for them, go onto a second canvas
// laid over it at the screen's full sharpness.

import type { Scene } from '../engine'
import { createFlameLayer } from './flame-layer'
import type { FlameLayer } from './flame-layer'

export interface Screen {
  /** fits the picture to its container; `pixelSize` is one art pixel in CSS px (0 picks one that suits), made a whole number of device px */
  layout(pixelSize: number): void
  /**
   * The art pixels shown `zoom` times larger (the camera pulled in on foot): the picture gets there about a
   * CSS pixel at a time over a few frames, so the change is seen, and every pixel stays one size. With `fit` (frame px
   * that must be seen whole: the hangar, the deck), the art pixel is no larger than lets it fit.
   */
  setZoom(zoom: number, fit?: { w: number; h: number; least?: number } | null): void
  /** shows the frame the scene has just drawn; `now` is the time in milliseconds */
  present(now: number): void
  /** one art pixel in CSS px, as the layout came out (before any zoom; a whole number of device px, so not always of CSS px) */
  readonly pixel: number
  /** a point on the page (client px) → the same point in the picture (frame px) */
  toFrame(clientX: number, clientY: number): [number, number]
  dispose(): void
}

export interface ScreenOptions {
  /** the element the picture fills */
  container: HTMLElement
  /** the canvas for the pixel picture */
  canvas: HTMLCanvasElement
  /** the canvas for smooth flames, over the picture */
  flames: HTMLCanvasElement
  scene: Scene
  /** called where the graphics card cannot draw smooth flames (or has stopped): draw them in pixels instead */
  onFlamesUnavailable(): void
}

export function createScreen({ container, canvas, flames, scene, onFlamesUnavailable }: ScreenOptions): Screen | null {
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  let image: ImageData | null = null
  // Sizes are kept in the screen's own pixels (device px), so an art pixel is always a whole number of them: at a ratio of
  // 1.25 or 1.5 (a laptop at 125 %, a browser zoomed) a whole number of CSS px is not, and rows and columns of the picture
  // came out one device px larger than the rest, a pattern of lines that crawled as the picture moved (James's first play).
  let ratio = 1 // device px per CSS px
  let scale = 4 // device px per frame px
  // the art pixel's size the page asks for (0: one that suits), what that comes to (device px), and the zoom on top of it
  let asked = 0
  let base = 0
  let zoom = 1
  let fitW = 0
  let fitH = 0
  let fitLeast = 0
  let stepAt = 0
  let layer: FlameLayer | null = null
  let flamesDead = false

  const giveUpOnFlames = () => {
    layer = null
    flamesDead = true
    onFlamesUnavailable()
  }
  const onContextLost = (e: Event) => {
    e.preventDefault()
    giveUpOnFlames()
  }
  flames.addEventListener('webglcontextlost', onContextLost)

  /** the art pixel the scene wants now, in device px: the zoom on the size asked for, no larger than lets a room it wants seen whole fit */
  function wanted() {
    const px = Math.max(base, Math.round(base * zoom))
    if (!fitW || !fitH) return px
    // (no larger than lets what is to be seen whole fit; a ship's rooms no smaller than they were before they were fitted)
    const least = fitLeast ? Math.max(base, Math.round(base * fitLeast)) : 1
    return Math.max(
      least,
      Math.min(px, Math.floor((container.clientWidth * ratio) / fitW), Math.floor((container.clientHeight * ratio) / fitH)),
    )
  }

  /** the picture at `px` device px an art pixel, fitted to the container and laid on whole device px */
  function fit(px: number) {
    const cw = container.clientWidth * ratio
    const ch = container.clientHeight * ratio
    if (!cw || !ch) return
    const w = Math.ceil(cw / px)
    const h = Math.ceil(ch / px)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
      scene.resize(w, h)
      image = null
    }
    // (the picture is a whole number of art pixels, so it may hang over the edges a little: centre it, its corner on a
    // whole device px of the screen, wherever the container is)
    const box = container.getBoundingClientRect()
    const left = Math.round(box.left * ratio + (cw - w * px) / 2) - box.left * ratio
    const top = Math.round(box.top * ratio + (ch - h * px) / 2) - box.top * ratio
    canvas.style.width = (w * px) / ratio + 'px'
    canvas.style.height = (h * px) / ratio + 'px'
    canvas.style.left = left / ratio + 'px'
    canvas.style.top = top / ratio + 'px'
    const dpr = Math.min(2, ratio)
    const fw = Math.round((w * px * dpr) / ratio)
    const fh = Math.round((h * px * dpr) / ratio)
    if (flames.width !== fw || flames.height !== fh) {
      flames.width = fw
      flames.height = fh
    }
    flames.style.width = canvas.style.width
    flames.style.height = canvas.style.height
    flames.style.left = canvas.style.left
    flames.style.top = canvas.style.top
    scale = px
  }

  return {
    get pixel() {
      return base / ratio
    },
    layout(pixelSize) {
      asked = pixelSize
      ratio = window.devicePixelRatio || 1
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (!cw || !ch) return
      // (the size that suits, and the size asked for, are in CSS px: the nearest whole number of device px to it)
      const auto = Math.min(12, Math.max(2, Math.round(Math.sqrt((cw * ch) / 100000))))
      base = Math.max(1, Math.round((asked > 0 ? Math.round(asked) : auto) * ratio))
      fit(wanted())
    },

    setZoom(z, room) {
      // (not always a whole number: the art pixel itself always is a whole number of CSS px)
      zoom = Math.max(1, z)
      fitW = room?.w ?? 0
      fitH = room?.h ?? 0
      fitLeast = room?.least ?? 0
    },

    present(now) {
      // (the browser zoomed, or the window moved to another screen: laid out again)
      if ((window.devicePixelRatio || 1) !== ratio) this.layout(asked)
      // on the way to another zoom: a step nearer every few frames (about a CSS px each)
      const want = wanted()
      if (base && scale !== want && now - stepAt > 34) {
        stepAt = now
        const by = Math.max(1, Math.round(ratio))
        fit(Math.abs(want - scale) <= by ? want : scale + Math.sign(want - scale) * by)
      }
      const bytes = scene.render()
      // (the scene draws into the same bytes every frame, until it is resized)
      if (!image) image = new ImageData(bytes, scene.width, scene.height)
      ctx.putImageData(image, 0, 0)
      // smooth flames, if the scene asked for any this frame
      const list = scene.flames
      if (list.count > 0 && !layer && !flamesDead) {
        layer = createFlameLayer(flames)
        if (!layer) giveUpOnFlames()
      }
      if (layer) layer.draw(list.count, list.data, flames.width / scene.width, now / 1000)
    },

    toFrame(clientX, clientY) {
      const r = canvas.getBoundingClientRect()
      return [((clientX - r.left) * ratio) / scale, ((clientY - r.top) * ratio) / scale]
    },

    dispose() {
      flames.removeEventListener('webglcontextlost', onContextLost)
      layer?.dispose()
    },
  }
}
