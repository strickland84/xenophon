<script lang="ts">
  import { page } from '$app/state'
  import Game from '#lib/components/Game.svelte'
  import { netFromQuery, settingsFromQuery } from '#lib/settings/query.ts'

  const settings = $derived(settingsFromQuery(page.url.searchParams))
  const net = $derived(netFromQuery(page.url.searchParams))
</script>

<svelte:head>
  <title>Xenophon: Twin Stars</title>
</svelte:head>

<!-- (on a phone the screen's height changes as the browser's bars come and go: dvh follows it) -->
<main class="h-screen" style="height: 100dvh">
  <Game {settings} {net} />
</main>
