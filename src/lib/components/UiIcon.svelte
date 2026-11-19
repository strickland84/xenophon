<script lang="ts">
  // The interface's native-pixel glyphs come from tools/voxel/interface.py.
  // 32 CSS px displays the 16-pixel icon doubled, 48 displays the 24-pixel icon doubled.
  import { asset } from '$app/paths'

  interface Props {
    name: string
    /** CSS px: 16, 32, 48 … */
    size?: number
    /** what it says, when it stands for a word (none when the word is beside it) */
    alt?: string
  }
  let { name, size = 32, alt = '' }: Props = $props()
</script>

<img
  src={asset(`ui/${size % 24 === 0 && size >= 48 && !name.startsWith('hull-') ? `${name}-24` : name}.png` as Parameters<typeof asset>[0])}
  {alt}
  width={size}
  height={size}
  class="block flex-none"
  style="image-rendering: pixelated"
  draggable="false"
/>
