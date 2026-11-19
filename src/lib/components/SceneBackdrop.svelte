<script lang="ts">
  // The scene flying itself behind a menu: no HUD, no fight, no controls, no sound. The game's
  // own pictures make the backdrop, as in the title mockup (art/mockups/title.png).
  import { onMount } from 'svelte'
  import { createClock, startLoop } from '../display/loop'
  import { createScreen } from '../display/screen'
  import { createScene, STEP, withDefaults } from '../engine'
  import type { SceneParams } from '../engine'

  interface Props {
    /** settings for the scene (anything left out is the backdrop's own) */
    settings?: Partial<SceneParams>
  }
  let { settings = {} }: Props = $props()

  let container: HTMLDivElement
  let canvas: HTMLCanvasElement
  let flames: HTMLCanvasElement

  onMount(() => {
    const scene = createScene(
      withDefaults({
        view: 'chase',
        timeOfDay: 'night',
        wingmen: 2,
        skirmish: false,
        hud: false,
        crash: false,
        flameStyle: 'pixel',
        ...settings,
      }),
    )
    const shown = createScreen({ container, canvas, flames, scene, onFlamesUnavailable: () => {} })
    if (!shown) return
    shown.layout(0)
    const resizing = new ResizeObserver(() => shown.layout(0))
    resizing.observe(container)
    const clock = createClock()
    const stop = startLoop((dt, now) => {
      if (!scene.width) return
      const steps = clock.advance(dt)
      if (steps === 0) return
      for (let n = 0; n < steps; n++) scene.step(STEP)
      scene.takeSounds()
      shown.present(now)
    })
    return () => {
      stop()
      resizing.disconnect()
      shown.dispose()
    }
  })
</script>

<div bind:this={container} class="absolute inset-0 overflow-hidden bg-[#0b1023]" aria-hidden="true">
  <canvas bind:this={canvas} class="absolute block" style="image-rendering: pixelated"></canvas>
  <canvas bind:this={flames} class="pointer-events-none absolute block"></canvas>
</div>
