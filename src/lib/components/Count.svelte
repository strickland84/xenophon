<script lang="ts">
  // A figure that counts to its new value when it changes (credits paid or earned, ore sold, a stack
  // moved), and flashes in the side's colour as it does. With motion turned down it changes at once.
  import { untrack } from 'svelte'
  import { Tween } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'
  import { moving } from './motion'

  interface Props {
    value: number
    /** how it is written (the plain figure unless said) */
    format?: (n: number) => string
  }
  let { value, format = (n) => String(n) }: Props = $props()
  // svelte-ignore state_referenced_locally
  const shown = new Tween(value, { easing: cubicOut })
  let changed = $state(0)
  let last = untrack(() => value)

  $effect(() => {
    if (value === last) return
    const far = Math.abs(value - last)
    last = value
    changed++
    shown.set(value, { duration: moving() ? Math.min(600, 260 + far * 2) : 0 })
  })
</script>

{#key changed}<span class="ui-num {changed ? 'ui-changed' : ''}">{format(Math.round(shown.current))}</span>{/key}
