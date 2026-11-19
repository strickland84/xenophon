<script lang="ts">
  // A pilot's portrait (pilotArt.ts), shown with hard pixels at `scale` screen pixels a pixel.
  import type { FactionId } from '../save/pilot'
  import { portraitImage } from './pilotArt'

  interface Props {
    look: string
    faction: FactionId
    /** 32 (the full portrait) or 16 */
    size?: 32 | 16
    scale?: number
    label?: string
  }
  let { look, faction, size = 32, scale = 4, label = '' }: Props = $props()
  let canvas = $state<HTMLCanvasElement>()

  $effect(() => {
    const ctx = canvas?.getContext('2d')
    if (ctx) ctx.putImageData(portraitImage(look, faction, size), 0, 0)
  })
</script>

<span role="img" aria-label={label || 'Pilot portrait'} class="block shrink-0">
  <canvas
    bind:this={canvas}
    width={size}
    height={size}
    aria-hidden="true"
    class="block"
    style="width: {size * scale}px; height: {size * scale}px; image-rendering: pixelated"
  ></canvas>
</span>
