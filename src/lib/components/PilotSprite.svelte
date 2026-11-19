<script lang="ts">
  // A pilot's in-world sprite (pilotArt.ts), walking, turning slowly through all eight ways, as he
  // will be seen in the game; with hard pixels at `scale` screen pixels a pixel.
  import { onMount } from 'svelte'
  import { spriteImage } from './pilotArt'

  interface Props {
    look: string
    scale?: number
  }
  let { look, scale = 5 }: Props = $props()
  let canvas = $state<HTMLCanvasElement>()
  let way = $state(4)
  let step = $state(0)

  onMount(() => {
    let t = 0
    let last = performance.now()
    let frame = 0
    const tick = (now: number) => {
      t += now - last
      last = now
      // a step every 160 ms; a quarter turn every two strides
      const s = Math.floor(t / 160)
      step = s % 4
      way = (4 + Math.floor(s / 8)) % 8
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  })

  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 16, 16)
    ctx.putImageData(spriteImage(look, way, step), 0, 0)
  })
</script>

<canvas
  bind:this={canvas}
  width={16}
  height={16}
  aria-hidden="true"
  class="block shrink-0"
  style="width: {16 * scale}px; height: {16 * scale}px; image-rendering: pixelated"
></canvas>
