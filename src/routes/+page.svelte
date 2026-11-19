<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/state'
  import DesktopOnly from '#lib/components/DesktopOnly.svelte'
  import Game from '#lib/components/Game.svelte'
  import { isDesktop } from '#lib/display/desktop.ts'
  import { netFromQuery, settingsFromQuery } from '#lib/settings/query.ts'

  const settings = $derived(settingsFromQuery(page.url.searchParams))
  const net = $derived(netFromQuery(page.url.searchParams))
  /** the game is for a desktop with a mouse and a keyboard (display/desktop.ts): anything else is told so, and nothing starts */
  let checked = $state(false)
  let desktop = $state(true)
  onMount(() => {
    desktop = isDesktop(page.url.searchParams)
    checked = true
  })
</script>

<svelte:head>
  <title>Xenophon: Twin Stars</title>
</svelte:head>

<main class="h-screen">
  {#if checked && desktop}
    <Game {settings} {net} />
  {:else if checked}
    <DesktopOnly />
  {/if}
</main>
