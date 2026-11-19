<script lang="ts">
  // A side's emblem, drawn by the image model (tools/gen/interface.py → tools/voxel/interface.py): the
  // Nomarchy's gold seal in a triangle, the Anarchoi's patched sail in a diamond. It is shrunk to 64, 32 and
  // 16 game pixels (each its own picture, never one scaled down), and shown at a whole multiple of the
  // nearest: the small one keeps the plain outline, so the two read apart without their colour.
  import { asset } from '$app/paths'
  import type { FactionId } from '../save/pilot'

  interface Props {
    side: FactionId
    /** CSS px */
    size: number
    /** what it says, when nothing beside it names the side */
    label?: string
  }
  let { side, size, label = '' }: Props = $props()
  const art = $derived(size >= 64 ? 64 : size >= 32 ? 32 : 16)
  const shown = $derived(Math.max(1, Math.floor(size / art)) * art)
</script>

<img
  src={asset(`emblems/${side}-${art}.png` as Parameters<typeof asset>[0])}
  alt={label}
  width={shown}
  height={shown}
  class="block flex-none"
  style="image-rendering: pixelated"
  draggable="false"
/>
