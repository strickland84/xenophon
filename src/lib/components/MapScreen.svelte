<script lang="ts">
  // The maps (the map action: M, the touchpad or Select, or the Map button), in three dimensions and the game's own pixels
  // (StarMap.svelte, maps/starmap.ts; after art/mockups/map3d-galaxy-11.png and map3d-system-3.png): flown about with the
  // mouse, the keys or a controller, turned, tilted and zoomed from the whole galaxy to one world's turning globe.
  //
  //   the system   the system the pilot is in, from above: its sun (or black hole) in the middle,
  //                the orbits, every body where it is now (they move on the shared clock), the
  //                stations, the gates at the edge with where they lead, the pilot, and the course
  //   the galaxy   the twelve systems on their lanes (the black hole shortcut dashed), whose home
  //                each is (from the galaxy's data), where the pilot is, and a route across it
  //   the card     whatever is picked: a world's name, kind, holder, resources and weather; a
  //                station's services; where a gate or a black hole leads; and a button to plot a
  //                course to it (in the system the pilot is in) or a route to it (anywhere else)
  //
  // The persistent world on them (Phase 7, after art/mockups/map-territory.png): each habitable world
  // ringed in the colour of the side that holds it, with the name its discoverer gave it; the day's
  // hotspots marked with the image model's star (static/ui/mark-*.png, as the stations, gates, raiders and derelicts); on the galaxy map each system's worlds as pips in their
  // holders' colours, how many pilots of each side are there now (their presence), and the price on
  // any pilot with a bounty; on a world's card, each side's influence as a bar, who holds it, who
  // named it, whether the pilot's side can contest it, and whether its ore is rich today.
  //
  // Where the danger is (the polish pass, item 8; after art/mockups/map-danger.png), worked out by the
  // engine's rule from the lanes and who holds what (galaxy/danger.ts), for this pilot's side: on the
  // galaxy map a row of chevrons by each system's name in its danger's colour (a square for safe), and a
  // red dashed ring round the front line, where both sides' patrols fly; on the system map a red skull
  // where raiders wait (the gates out to wilder space, the belts, a derelict, a shortcut's way in); on a
  // card the danger, and who lives there. A legend stands in the card until something is picked.
  //
  // Every mark is a button laid over the picture, so a tap, a click, the keys or a controller (padnav.ts) pick it.
  import { asset } from '$app/paths'
  import { onMount, untrack } from 'svelte'
  import {
    ARCHETYPE_NAMES,
    DANGER_NAMES,
    galaxyDanger,
    ORBIT_SLOW,
    positionAt,
    RESOURCES,
    spaceBands,
    theGalaxy,
    worldDanger,
  } from '../engine'
  import type { Body, Danger, GalaxyState, StarSystem } from '../engine'
  import type { PresenceCounts } from '../net/chronicle'
  import { FACTIONS } from '../save/pilot'
  import type { FactionId } from '../save/pilot'
  import { describe } from '../worlds/describe'
  import { routeOf } from '../worlds/route'
  import Emblem from './Emblem.svelte'
  import { GALAXY_FIT, leadsTo as leadsToOf, placeOf, SYSTEM_FIT, systemUnit } from '../maps/starmap'
  import Panel from './Panel.svelte'
  import StarMap from './StarMap.svelte'
  import Tabs from './Tabs.svelte'
  import UiIcon from './UiIcon.svelte'
  import { tip } from './tooltip.svelte'

  interface Props {
    /** the system the pilot is in (−1: an island world of the address's own, in no system) */
    system: number
    /** where he is in it, if in space (else he is on the world `world`) */
    player: { x: number; y: number; heading: number } | null
    world: string
    /** his side: whose bases are his */
    side: FactionId
    /** the course plotted in this system, and the route's end (a system and a body there, −1 none) */
    course: number
    route: { to: number; body: number } | null
    /** seconds since 1970 (UTC): the bodies are where they are now */
    clock: () => number
    /** a course to a body (in this system), or a route to a system (and a body there, −1 none); null clears it */
    onplot: (to: { system: number; body: number } | null) => void
    onclose: () => void
    /** the persistent world, as the events leave it (null: not worked out yet) */
    galaxy?: GalaxyState | null
    /** who is flying where now (null: not known) */
    pilots?: PresenceCounts | null
    /** today's hotspots (world ids) */
    hotspots?: string[]
    /** the map to open on (by default the system he is in, or the galaxy if he is in none); and a line over it ('' none) */
    open?: 'system' | 'galaxy' | null
    note?: string
  }
  let {
    system,
    player,
    world,
    side,
    course,
    route,
    clock,
    onplot,
    onclose,
    galaxy = null,
    pilots = null,
    hotspots = [],
    open = null,
    note = '',
  }: Props = $props()

  // ── the persistent world: who holds a world, its name now, pilots and bounties by system
  const holderOf = (worldId: string) => galaxy?.worlds[worldId]?.holder ?? null
  const nameOf = (b: Body) => (b.world >= 0 ? (galaxy?.names[g.worlds[b.world].id]?.name ?? b.name) : b.name)
  /** the system a zone is in ('w12' a world's, 's3' a space's) */
  const systemOfZone = (z: string) => (z.startsWith('s') ? Number(z.slice(1)) : (g.worlds.find((w) => w.id === z)?.system ?? -1))
  const bySystem = $derived.by(() => {
    const out = g.systems.map(() => ({ nomarchy: 0, anarchoi: 0, bounty: [] as { callsign: string; price: number; side: FactionId }[] }))
    for (const p of pilots?.pilots ?? []) {
      const s = systemOfZone(p.zone)
      if (s < 0 || !out[s]) continue
      out[s][p.side]++
      if (p.bounty > 0) out[s].bounty.push({ callsign: p.callsign, price: p.bounty, side: p.side })
    }
    return out
  })
  /** how many of a system's worlds each side holds, in words; and which side holds most of them (null: neither) */
  const count = (s: StarSystem, side: FactionId) => s.worlds.filter((w) => holderOf(g.worlds[w].id) === side).length
  const heldWords = (s: StarSystem) => {
    const c = count(s, 'nomarchy')
    const d = count(s, 'anarchoi')
    if (!c && !d) return 'Unclaimed'
    return [c ? `The Nomarchy holds ${c}` : '', d ? `the Anarchoi ${d}` : ''].filter(Boolean).join(', ')
  }
  const heldMost = (s: StarSystem): FactionId | null => {
    const c = count(s, 'nomarchy')
    const d = count(s, 'anarchoi')
    return c > d ? 'nomarchy' : d > c ? 'anarchoi' : null
  }

  // ── danger, for this pilot's side (galaxy/danger.ts): by system, by world, and where raiders wait in a system's space
  /** each danger's colour: safe, low, medium, high (as the HUD's) */
  const DANGER = ['#70e27c', '#fad246', '#ff963c', '#ff5446']
  const holders = $derived(
    Object.fromEntries(Object.values(galaxy?.worlds ?? {}).map((w) => [w.id, w.holder ?? ''])) as Record<string, string>,
  )
  const dangers = $derived(galaxyDanger(side, holders))
  /** a side's name, as a card says it */
  const sideName = (s: FactionId) => (s === 'nomarchy' ? 'the Nomarchy' : 'the Anarchoi')
  /** who lives in a system or on a world, in a few words */
  function residents(d: Danger, raiders: string) {
    const lines: string[] = []
    if (d.home === side) lines.push('Your side’s home: no raiders')
    else if (d.home) lines.push(`${FACTIONS[d.home].name}’s home: its patrols and guns`)
    else if (d.raiders) lines.push(raiders)
    if (d.contested) lines.push('The front: both sides’ patrols')
    else if (d.patrols.length && !d.home) lines.push(`Patrols of ${sideName(d.patrols[0])}`)
    return lines
  }
  /** the maps' marks (static/ui/mark-*.png, tools/voxel/interface.py): 12 px, shown at two
   * CSS px a pixel as the interface's icons are; the size on the map */
  const MARK = 24
  const markSrc = (name: 'station' | 'gate' | 'raiders' | 'hotspot' | 'derelict') =>
    asset(`ui/mark-${name}.png` as Parameters<typeof asset>[0])
  const g = theGalaxy()
  // (opened where the pilot is; he can look elsewhere from there)
  const first = untrack(() => system)
  let tab = $state<'system' | 'galaxy'>(untrack(() => open) ?? (first >= 0 ? 'system' : 'galaxy'))
  /** the system shown, and what is picked in it (a body), or on the galaxy map (a system) */
  let shown = $state(first >= 0 ? first : 0)
  let picked = $state<{ kind: 'body'; body: Body } | { kind: 'system'; system: StarSystem } | null>(null)
  let now = $state(untrack(() => clock()))

  onMount(() => {
    const tick = window.setInterval(() => (now = clock()), 500)
    return () => window.clearInterval(tick)
  })

  // ── the system map
  const sys = $derived(g.systems[shown])
  /** where raiders wait in the system shown, by the body they keep to */
  const banded = $derived(new Map(spaceBands(shown, holders).map((b) => [b.body, b])))
  const at = (b: Body) => positionAt(g, b, now / ORBIT_SLOW)
  const leadsTo = (b: Body) => leadsToOf(g, b)
  const where = $derived.by(() => {
    if (system !== shown) return null
    if (player) return player
    const w = g.worlds.find((x) => x.id === world)
    if (!w) return null
    const p = at(g.bodies[w.body])
    return { x: p.x, y: p.y, heading: 0 }
  })
  // ── the galaxy map
  const routePath = $derived(route && system >= 0 ? routeOf(system, route.to) : [])
  /** what the map shows, and what is picked there ('b12' a body, 's3' a system) */
  const pickedKey = $derived(picked ? (picked.kind === 'body' ? `b${picked.body.index}` : `s${picked.system.index}`) : null)
  const mapScene = $derived({
    g,
    kind: tab,
    system: shown,
    here: system,
    now,
    side,
    colours: { nomarchy: FACTIONS.nomarchy.colour, anarchoi: FACTIONS.anarchoi.colour },
    holderOf,
    nameOf,
    danger: dangers.map((d) => d.level),
    front: dangers.map((d) => d.contested),
    bounty: bySystem.map((b) => (b.bounty[0] ? `${b.bounty[0].callsign} ${b.bounty[0].price}`.toUpperCase() : '')),
    hotspots: new Set(hotspots),
    raiders: new Set(banded.keys()),
    route: routePath,
    course,
    pilot: tab === 'system' ? where : null,
    picked: pickedKey,
  })
  /** where he is on the map shown, for its Here button */
  const meOnMap = $derived.by(() => {
    if (tab === 'galaxy') return system >= 0 ? placeOf(g, 'galaxy', shown, `s${system}`, now) : null
    if (!where) return null
    const U = systemUnit(g, shown)
    return { x: where.x * U, y: where.y * U }
  })
  function pickKey(key: string | null) {
    if (!key) picked = null
    else if (key.startsWith('s')) picked = { kind: 'system', system: g.systems[Number(key.slice(1))] }
    else picked = { kind: 'body', body: g.bodies[Number(key.slice(1))] }
  }

  /** whose a body is, as words */
  function holder(b: Body) {
    const s = g.systems[b.system]
    if (b.kind === 'base') {
      if (b.role === 'derelict') return 'Nobody’s: a wreck'
      return b.role === 'capital' && s.side ? `${FACTIONS[s.side].name}’s capital` : 'Nobody’s: an outpost'
    }
    return s.side ? `Held by ${FACTIONS[s.side].name}` : 'Unclaimed'
  }
  const card = $derived.by(() => {
    if (!picked) return null
    if (picked.kind === 'system') {
      const s = picked.system
      const d = dangers[s.index]
      const sb = spaceBands(s.index, holders)
      const gates = sb.filter((b) => b.kind === 'gate').length
      const where = [
        gates ? `${gates} gate${gates > 1 ? 's' : ''}` : '',
        sb.some((b) => b.kind === 'belt') ? 'the belt' : '',
        sb.some((b) => b.kind === 'hole') ? 'the black hole' : '',
      ].filter(Boolean)
      const drones = sb.filter((b) => b.kind === 'derelict').map((b) => g.bodies[b.body].name)
      return {
        title: s.name,
        kind: `${s.suns.join(' and ')} star${s.suns.length > 1 ? 's' : ''} · ${s.kind === 'home' ? 'home system' : s.kind}`,
        holder: s.side ? `Home of ${FACTIONS[s.side].name}` : heldWords(s),
        holderSide: s.side ?? heldMost(s),
        influence: null as Record<FactionId, number> | null,
        danger: d.level,
        lives: [
          ...residents(d, where.length ? `Raiders at ${where.join(', ')}` : 'Raiders by the worlds’ rich ore'),
          ...drones.map((n) => `Drones at ${n}`),
        ],
        lines: s.worlds.map((w) => {
          const id = g.worlds[w].id
          const h = holderOf(id)
          const name = galaxy?.names[id]?.name ?? g.worlds[w].name
          return `${name}: ${ARCHETYPE_NAMES[g.worlds[w].recipe.archetype]}${h ? `, the ${h === 'nomarchy' ? 'Nomarchy' : 'Anarchoi'}'s` : ''}${hotspots.includes(id) ? ', hotspot' : ''}`
        }),
        ores: [] as string[],
        system: s.index,
        body: -1,
      }
    }
    const b = picked.body
    const w = b.world >= 0 ? g.worlds[b.world] : null
    const to = leadsTo(b)
    const words = w ? describe(w) : null
    const lines: string[] = []
    let kind: string = b.kind
    let ores: string[] = []
    if (words) {
      kind = words.kind
      lines.push(words.sun, words.body, words.weather)
      ores = w!.recipe.resources.map((r) => (r.ore === 'magma glass' ? 'magma-glass' : r.ore))
    } else if (b.kind === 'giant') {
      kind = 'Gas giant'
      lines.push('Helion gas in its upper bands: hold Use over them', 'Its pull drags a ship down; its depths crush')
      ores = ['helion']
    } else if (b.kind === 'belt') {
      kind = 'Asteroid belt'
      lines.push('Rocks to hide among and to cut', 'The cruise drive throttles back in it')
      ores = ['ferrite', 'silica', 'cryo-ice']
    } else if (b.kind === 'sun') {
      kind = `${b.star} star`
      lines.push('Its corona burns a ship that comes too close')
    } else if (b.kind === 'black hole') {
      kind = 'Black hole'
      lines.push(
        to ? `Thread its bright ring to come out at ${to.name}` : 'Nothing comes out of it',
        'The middle is death; void shards drift near',
      )
      ores = ['void']
    } else if (b.kind === 'gate') {
      kind = 'Jump gate'
      lines.push(`To ${to?.name ?? '?'}: hold Use inside it to charge and jump`)
    } else if (b.kind === 'base') {
      kind = b.role === 'derelict' ? 'Derelict' : b.role === 'capital' ? 'Capital station' : 'Outpost station'
      lines.push(b.role === 'derelict' ? 'Drones guard the salvage strewn about it' : 'Dock to bank, trade, repair and refit')
    }
    // who lives there, and how dangerous it is (a world by its own rule: a hotspot's pirates, a moon's band; else its system's)
    const day = Math.floor(now / 86_400)
    const wd = w ? worldDanger(w.id, side, holders, day) : dangers[b.system]
    const band = banded.get(b.index)
    const lives = w
      ? residents(wd, wd.hotspot ? 'Pirates at the rich ore today' : !w.habitable ? 'A raider band holds it' : 'Raiders by the rich ore')
      : band
        ? [
            band.kind === 'gate'
              ? 'Raiders wait by it'
              : band.kind === 'belt'
                ? 'Raiders hide among its rocks'
                : band.kind === 'hole'
                  ? 'Raiders watch the way in'
                  : 'Drones come out of it',
          ]
        : []
    // (a habitable world: the persistent world's part)
    const held = w?.habitable && galaxy ? galaxy.worlds[w.id] : null
    const named = w && galaxy ? galaxy.names[w.id] : undefined
    if (w && hotspots.includes(w.id)) lines.unshift('Hotspot today: its ore is far richer')
    if (named) lines.unshift(`Named by ${named.callsign}`)
    if (held && !held.capital)
      lines.push(held.front[side] ? 'On your front: your side can contest it' : 'Off your front: take a world next to it first')
    const here = w ? (pilots?.byZone[w.id] ?? null) : null
    if (here) lines.push(`Pilots here now: ${here.nomarchy} of the Nomarchy, ${here.anarchoi} of the Anarchoi`)
    return {
      title: named?.name ?? b.name,
      kind,
      holder: held ? (held.holder ? `Held by ${FACTIONS[held.holder].name}` : 'Held by nobody') : holder(b),
      holderSide: held ? held.holder : g.systems[b.system].side,
      influence: held ? held.influence : null,
      danger: w || band ? wd.level : -1,
      lives,
      lines,
      ores,
      system: b.system,
      body: b.index,
    }
  })
  const plotted = $derived(
    !!card && ((card.body >= 0 && card.body === course) || (card.body < 0 && route?.to === card.system && route?.body === -1)),
  )

  const icon = (id: string) => asset(`/icons/${id}.png` as Parameters<typeof asset>[0])
  const DANGER_WORD = (level: number) => (level === 0 ? 'Safe' : `Danger ${DANGER_NAMES[level]}`)

  /** a body's tooltip: what it is, whose, how dangerous */
  function bodyTip(b: Body) {
    const w = b.world >= 0 ? g.worlds[b.world] : null
    const h = w ? holderOf(w.id) : null
    const day = Math.floor(now / 86_400)
    const d = w ? worldDanger(w.id, side, holders, day) : banded.has(b.index) ? dangers[b.system] : null
    const to = leadsTo(b)
    const kind = w
      ? ARCHETYPE_NAMES[w.recipe.archetype]
      : b.kind === 'gate'
        ? `Gate to ${to?.name ?? '?'}`
        : b.kind === 'base'
          ? b.role === 'derelict'
            ? 'Derelict'
            : 'Station'
          : b.kind === 'giant'
            ? 'Gas giant'
            : b.kind === 'belt'
              ? 'Asteroid belt'
              : b.kind === 'sun'
                ? `${b.star} star`
                : b.kind
    const stats = []
    if (w?.habitable) stats.push({ label: 'Held by', value: h ? FACTIONS[h].name : 'Nobody' })
    if (d) stats.push({ label: 'Danger', value: d.level === 0 ? 'Safe' : DANGER_NAMES[d.level] })
    return {
      title: nameOf(b),
      colour: h ? FACTIONS[h].colour : undefined,
      line: kind,
      stats,
      note: w && hotspots.includes(w.id) ? 'Hotspot today: rich ore' : undefined,
    }
  }
  /** a system's tooltip */
  function systemTip(s: StarSystem) {
    const d = dangers[s.index]
    const here = bySystem[s.index]
    const stats = [
      { label: 'Danger', value: d.level === 0 ? 'Safe' : DANGER_NAMES[d.level] },
      { label: 'Worlds', value: heldWords(s) },
    ]
    if (here.nomarchy || here.anarchoi) stats.push({ label: 'Pilots', value: `${here.nomarchy} · ${here.anarchoi}` })
    return {
      title: s.name,
      colour: s.side ? FACTIONS[s.side].colour : undefined,
      line: s.side ? `Home of ${FACTIONS[s.side].name}` : s.kind === 'core' ? 'The core' : 'The frontier',
      stats,
      note: d.contested ? 'The front: both sides fight here' : undefined,
    }
  }
  /** the legend: what the map's marks say about danger */
  const legend = $derived({
    title: 'Danger, for your side',
    stats: [
      ...DANGER_NAMES.map((name, level) => ({ label: level === 0 ? '■' : '>'.repeat(level), value: name })),
      tab === 'galaxy' ? { label: '( )', value: 'The front' } : { label: 'Warning', value: 'Raiders wait' },
    ],
  })
</script>

{#snippet dangerIcon(level: number)}
  <svg width="20" height="12" viewBox="0 0 20 12" aria-hidden="true" shape-rendering="crispEdges" fill="currentColor">
    {#if level === 0}
      <path d="M4 1h2v2h2v2h2v2H8v2H6v2H4V9H2V7H0V5h2V3h2zM4 5v2h2V5z" fill-rule="evenodd" />
    {:else}
      {#each [0, 6, 12].slice(0, level) as x (x)}
        <path d="M0 2h2v2h2v2h2v2H4v2H2v2H0V9h2V5H0z" transform="translate({x} -1)" />
      {/each}
    {/if}
  </svg>
{/snippet}

<Panel
  inlineTabs
  title={tab === 'system' ? sys.name + (shown !== system ? ' · not here' : '') : 'The galaxy'}
  label="Maps"
  size="full"
  tabCloses={false}
  closeKeys={['m', 'M']}
  {onclose}
>
  {#snippet tabs()}
    <div class="flex items-end gap-2">
      <div class="min-w-0 flex-1">
        <Tabs
          items={[
            { id: 'system', label: 'System', disabled: system < 0 && tab === 'system' },
            { id: 'galaxy', label: 'Galaxy' },
          ]}
          value={tab}
          onchange={(t) => {
            tab = t as 'system' | 'galaxy'
            picked = null
          }}
          label="Maps"
        />
      </div>
      <button type="button" class="ui-btn ui-btn-small mb-1" aria-label="Key" use:tip={legend}>Key</button>
    </div>
  {/snippet}

  {#if note}
    <p class="ui-body mb-3 text-accent" role="status">{note}</p>
  {/if}

  <div class="relative flex flex-col gap-3 min-[901px]:flex-row">
    <!-- the map, in three dimensions (StarMap.svelte, maps/starmap.ts) -->
    <div
      class="relative min-h-[14rem] flex-1 overflow-hidden border-2 border-ink/20 bg-[#04060e]"
      style="height: min(calc(100dvh - 9rem), 44rem)"
    >
      <StarMap
        scene={mapScene}
        view={tab === 'galaxy' ? 'galaxy' : `system:${shown}`}
        home={{ x: 0, y: 0, r: tab === 'galaxy' ? GALAXY_FIT : SYSTEM_FIT }}
        me={meOnMap}
        placeOf={(key) => placeOf(g, tab, shown, key, now)}
        onpick={pickKey}
        onenter={(key) => {
          if (tab === 'galaxy' && key.startsWith('s')) {
            shown = Number(key.slice(1))
            tab = 'system'
            picked = null
          }
        }}
        tipOf={(key) => (key.startsWith('s') ? systemTip(g.systems[Number(key.slice(1))]) : bodyTip(g.bodies[Number(key.slice(1))]))}
        labelOf={(key) => {
          if (key.startsWith('s')) return g.systems[Number(key.slice(1))].name
          const b = g.bodies[Number(key.slice(1))]
          return b.kind === 'gate' ? `Gate to ${leadsTo(b)?.name ?? '?'}` : nameOf(b)
        }}
      />
      {#if !card && route}
        <p class="ui-label pointer-events-none absolute top-2 left-3 text-[#78ecdc]">Route to {g.systems[route.to].name}</p>
      {/if}
      <p class="ui-label pointer-events-none absolute top-2 right-3 text-right text-ink-dim max-[1100px]:hidden">
        Drag · right drag to turn · wheel to zoom
      </p>
    </div>

    <!-- the card: a column beside the map; on a narrow window, over the map's right side when something is picked -->
    {#if card}
      {#key card.title}
        <aside
          class="card flex flex-col gap-3 border-2 border-ink/25 bg-[#0b1a33]/96 p-3 max-[900px]:absolute max-[900px]:inset-y-0 max-[900px]:right-0 max-[900px]:w-[19rem] max-[900px]:overflow-y-auto min-[901px]:w-[20rem]"
          aria-label="Card"
        >
          <div class="flex items-start gap-2">
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <h3 class="ui-head truncate">{card.title}</h3>
              <p class="ui-label" use:tip={card.lines.length ? { title: card.title, line: card.lines.join('. ') } : null}>
                {card.kind}{card.lines.length ? ' · …' : ''}
              </p>
            </div>
            <button
              type="button"
              class="ui-btn ui-btn-icon ui-btn-small min-[901px]:hidden"
              aria-label="Close the card"
              onclick={() => (picked = null)}><UiIcon name="close" /></button
            >
          </div>
          <p class="ui-body flex items-center gap-2">
            {#if card.holderSide}
              <Emblem side={card.holderSide} size={32} />
              <span style="color: {FACTIONS[card.holderSide].colour}">{card.holder}</span>
            {:else}
              <span class="text-ink-dim">{card.holder}</span>
            {/if}
          </p>
          {#if card.danger >= 0}
            <!-- how dangerous it is for his side, and who lives there -->
            <div class="flex flex-col gap-1">
              <p class="ui-body flex items-center gap-2" style="color: {DANGER[card.danger]}">
                {@render dangerIcon(card.danger)}
                {DANGER_WORD(card.danger)}
              </p>
              {#each card.lives as l, i (i)}
                <p class="ui-label" style="color: {DANGER[Math.max(1, card.danger)]}">{l}</p>
              {/each}
            </div>
          {/if}
          {#if card.influence}
            <!-- each side's influence on it, as a bar (the most holds it) -->
            {@const most = Math.max(40, card.influence.nomarchy, card.influence.anarchoi)}
            <div
              class="flex flex-col gap-1.5"
              use:tip={{ title: 'Influence', line: 'Flags, ore banked and kills here this week. The side with most holds it.' }}
            >
              {#each ['nomarchy', 'anarchoi'] as s (s)}
                {@const f = FACTIONS[s as FactionId]}
                <div class="flex items-center gap-2" aria-label="{f.name}: influence {Math.round(card.influence[s as FactionId])}">
                  <Emblem side={s as FactionId} size={16} />
                  <div class="ui-meter flex-1">
                    <span style="transform: scaleX({card.influence[s as FactionId] / most}); background: {f.colour}"></span>
                  </div>
                  <span class="ui-label ui-num w-10 text-right">{Math.round(card.influence[s as FactionId])}</span>
                </div>
              {/each}
            </div>
          {/if}
          {#if card.ores.length}
            <div class="flex flex-wrap gap-2">
              {#each card.ores as o (o)}
                <span
                  class="flex h-10 w-10 items-center justify-center border-2 border-ink/20 bg-[#070b1a]"
                  use:tip={{ title: RESOURCES[o as keyof typeof RESOURCES]?.name ?? o, icon: icon(o) }}
                >
                  <img
                    src={icon(o)}
                    alt={RESOURCES[o as keyof typeof RESOURCES]?.name ?? o}
                    width="32"
                    height="32"
                    style="image-rendering: pixelated"
                  />
                </span>
              {/each}
            </div>
          {/if}
          <div class="mt-auto flex flex-wrap gap-2 pt-1">
            {#if card.body >= 0 && card.system === system}
              <button
                type="button"
                class={plotted ? 'ui-btn is-on' : 'ui-btn ui-btn-main'}
                onclick={() => onplot(plotted ? null : { system: card.system, body: card.body })}
              >
                {plotted ? 'Clear course' : 'Plot course'}
              </button>
            {:else if card.system !== system && system >= 0}
              <button type="button" class="ui-btn ui-btn-main" onclick={() => onplot({ system: card.system, body: card.body })}>
                Route · {routeOf(system, card.system).length - 1} jumps
              </button>
            {/if}
            {#if picked?.kind === 'system'}
              <button
                type="button"
                class="ui-btn"
                onclick={() => {
                  shown = card.system
                  tab = 'system'
                  picked = null
                }}>Look in</button
              >
            {/if}
          </div>
        </aside>
      {/key}
    {:else}
      <aside class="flex flex-col gap-2 border-2 border-ink/10 p-3 max-[900px]:hidden min-[901px]:w-[20rem]" aria-label="Card">
        <p class="ui-body text-ink-dim">{tab === 'system' ? 'Pick a world, a station or a gate' : 'Pick a system'}</p>
        <div class="mt-2 flex flex-col gap-1.5" aria-label="Danger">
          {#each DANGER_NAMES as name, level (name)}
            <p class="ui-label flex items-center gap-2" style="color: {DANGER[level]}">
              {@render dangerIcon(level)}
              {name}
            </p>
          {/each}
          {#if tab === 'galaxy'}
            <p class="ui-label flex items-center gap-2" style="color: {DANGER[3]}">
              <svg width="20" height="14" aria-hidden="true"
                ><circle cx="8" cy="7" r="6" fill="none" stroke={DANGER[3]} stroke-width="1.5" stroke-dasharray="3 2" /></svg
              >The front
            </p>
          {:else}
            <p class="ui-label flex items-center gap-2" style="color: {DANGER[3]}">
              <img src={markSrc('raiders')} alt="" width={MARK} height={MARK} style="image-rendering: pixelated" />
              Raiders wait
            </p>
          {/if}
        </div>
      </aside>
    {/if}
  </div>
</Panel>

<style>
  .card {
    animation: card-in 180ms cubic-bezier(0.16, 1, 0.3, 1) both;
  }
  @keyframes card-in {
    from {
      opacity: 0;
      transform: translateX(10px);
    }
  }
</style>
