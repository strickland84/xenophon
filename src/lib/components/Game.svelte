<script lang="ts">
  // The game on the page: the pilot's save (made silently, with his key pair, on first run), the
  // lock that keeps him to one tab, the first screen for a new pilot (straight into the sky for
  // one who has flown before), and the sky itself, shared over the network (lib/net/online.ts).
  // What the player changes as he plays (his ship, the volume, the view, the world he travels
  // to) goes into the save.
  //
  // Where he is: the address's (?world=w12, or a system's space, ?world=s3), or where he last was,
  // or where everyone starts; an address with a seed or a share of land flies that island world
  // instead. Each world flies as its recipe says (worldSettings), and each world and each system's
  // space is its own room. The scene goes from one to another by itself (climbing out, going down,
  // jumping: engine/sim/travel.ts); the page follows it there, into the next room, and builds the
  // world it is about to go down to, and the maps of the worlds it sees from space, off the main
  // thread (lib/worlds). The maps (MapScreen) plot a course in a system, or a route across the
  // galaxy that sets the course again in each system on the way.
  //
  // The loop (Phase 4): the pilot's side and his ship's parts go to the scene, and the clock the
  // outcrops and prices run on; what the scene says happened to his property (Scene.takeLedger)
  // goes into the save's log (save/property.ts). Landed at a friendly base, the base's screen
  // (BaseScreen) banks, sells, buys and fits; so does a station's, docked at it in space.
  //
  // The persistent world (Phase 7): the pilot's chronicle (net/chronicle.ts: the events, kept in this
  // browser, sent to and fetched from the relays, shared with the room) and his part in it
  // (net/persistent.ts: what he does, signed into events; the scene told who holds what and the traces
  // here). A new pilot starts at his own side's capital; the smaller side pays a joining bonus. The
  // faction board, chat and the quick-chat wheel, the pilots nearby, naming a world first landed on,
  // a beacon's words, and recording a ghost all open from here. A world his side holds pays him a
  // tenth more at its bases.
  import { onMount } from 'svelte'
  import {
    BEACON_PHRASES,
    buildMap,
    dailyTasks,
    dayOf,
    dayOfSeconds,
    homeWorld,
    hotspotsOn,
    JOINING_BONUS,
    mapsFromOutside,
    landsFromOutside,
    FURNITURE,
    GEAR,
    HULL_PITCH,
    HULL_PRICES,
    makeText,
    MODULE_SLOTS,
    NEXT_SHIP,
    MODULES,
    readMake,
    WEAPONS,
    pricesAt,
    REDELIVERY,
    RESOURCES,
    payFor,
    SHOP,
    openTiles,
    startWorld,
    stateOf,
    statsOf,
    surfaceById,
    theGalaxy,
    worldSettings,
  } from '../engine'
  import type {
    GalaxyState,
    InteriorStatus,
    InteriorUse,
    LoopStatus,
    ResourceId,
    Scene,
    TracesStatus,
    ViewMode,
    ZoneStatus,
  } from '../engine'
  import { newShip, ownsHull, ownsModule, ownsWeapon, shipSettings } from '../save/ships'
  import type { Livery } from '../save/ships'
  import LoadoutBench from './LoadoutBench.svelte'
  import PaintBooth from './PaintBooth.svelte'
  import ShopScreen from './ShopScreen.svelte'
  import PilotSheet from './PilotSheet.svelte'
  import FurnishPanel from './FurnishPanel.svelte'
  import SquadPanel from './SquadPanel.svelte'
  import { Chronicle, DEFAULT_RELAYS } from '../net/chronicle'
  import type { PresenceCounts } from '../net/chronicle'
  import { namespaceOf } from '../net/events'
  import { Persistent } from '../net/persistent'
  import type { PersistentNews } from '../net/persistent'
  import { browserDial } from '../net/relays'
  import type { RelayHealth } from '../net/relays'
  import { cleanChat } from '../net/session'
  import type { ChatChannel, ChatLine } from '../net/session'
  import { FACTIONS } from '../save/pilot'
  import { FEATS } from '../save/progress'
  import ChatPanel from './ChatPanel.svelte'
  import FactionBoard from './FactionBoard.svelte'
  import NameWorld from './NameWorld.svelte'
  import PilotsNearby from './PilotsNearby.svelte'
  import type { Nearby } from './PilotsNearby.svelte'
  import QuickWheel from './QuickWheel.svelte'
  import { append, earnsBy, fromLedger, inVault, totalsOf } from '../save/property'
  import BaseScreen from './BaseScreen.svelte'
  import WingPanel from './WingPanel.svelte'
  import ClipPanel from './ClipPanel.svelte'
  import { clipKind, createClipper } from '../display/clips'
  import type { Clip, Clipper } from '../display/clips'
  import type { PilotCard } from '../net/codec'
  import { goOnline } from '../net/online'
  import type { ConnectionTotals } from '../net/log'
  import type { NetState, Online } from '../net/online'
  import { lockPilot } from '../save/lock'
  import type { PilotLock } from '../save/lock'
  import type { FactionId } from '../save/pilot'
  import { flownShip, loadSave, pilotFile, pilotFileName, readPilotFile, writeSave } from '../save/store'
  import type { Save, SaveStorage } from '../save/store'
  import { zoneOf } from '../net/rooms'
  import { isWingOf, wingLink, withoutWing } from '../net/wing'
  import type { Wing } from '../net/wing'
  import type { NetSettings, SceneSettings } from '../settings/query'
  import { buildLandOffThread, buildMapOffThread, buildOffThread } from '../worlds/build'
  import { courseFor } from '../worlds/route'
  import MapScreen from './MapScreen.svelte'
  import FighterJetScene from './FighterJetScene.svelte'
  import MenuPanel from './MenuPanel.svelte'
  import NetBadge from './NetBadge.svelte'
  import Onboarding from './Onboarding.svelte'
  import IntroCrawl from './IntroCrawl.svelte'
  import PilotCreator from './PilotCreator.svelte'
  import TutorialPrompt from './TutorialPrompt.svelte'
  import SettingsScreen from './SettingsScreen.svelte'
  import BackupPrompt from './BackupPrompt.svelte'
  import UpdateBanner from './UpdateBanner.svelte'
  import TooltipHost from './TooltipHost.svelte'
  import UiIcon from './UiIcon.svelte'
  import { priceWords } from './items'
  import { moving, ms, setReducedMotion } from './motion'
  import { fade, fly as flyIn } from 'svelte/transition'
  import { findSealed, sealedEvent, secretOfPhrase } from '../save/backup'
  import { newSave } from '../save/store'
  import type { Settings } from '../save/store'
  import { RelayPool } from '../net/relays'
  import { updated } from '$app/state'
  import { asset } from '$app/paths'
  import { audioTap, listenForUnlock, setAudioUrl, setEffectsVolume, setMusicVolume } from '../audio/mixer'
  import { hush, speak } from '../audio/narration'
  import { sortieLine, sortieVoice } from '../story/sortie'
  import { createMusic } from '../audio/music'
  import type { Music } from '../audio/music'
  import { createFightWatch, FIGHT_CLOSE, FIGHT_NEAR, fightLevel, isHarsh, placeFor } from '../audio/moods'
  import type { Place } from '../audio/moods'
  import { uiSound } from '../audio/ui'
  import { FREE_LINE, FREE_SUB, Tutorial } from '../tutorial/tutorial'
  import type { Prompt, StepId } from '../tutorial/tutorial'
  import { nextTip } from '../tutorial/tips'
  import { namer } from '../input/hints'
  import type { InputKind } from '../input/hints'

  interface Props {
    /** the scene's settings from the address (they win over the save's) */
    settings: SceneSettings
    net: NetSettings
  }
  let { settings, net }: Props = $props()

  /** loading; the pilot is flying in another tab (busy) or was just taken by one (lost); a new pilot; in the sky */
  let stage = $state<'loading' | 'busy' | 'lost' | 'new' | 'flying'>('loading')
  let save = $state<Save | null>(null)
  let menu = $state(false)
  let netState = $state<NetState>({ on: false, why: 'starting' })
  let connTotals = $state<ConnectionTotals>({ attempts: 0, connected: 0, failed: 0, full: 0, sessions: 0 })
  let online = $state<Online | null>(null)
  /** where the scene is: the world flown over ('' for the island world of the address's seed and land), or a system's space ('s3') */
  let world = $state('')
  let flown: Scene | null = null
  /** the maps are open; the zone as it stood when last looked at; the route being flown across the galaxy */
  let mapOpen = $state(false)
  let zoneNow = $state<ZoneStatus | null>(null)
  let playerNow = $state<{ x: number; y: number; heading: number } | null>(null)
  let route = $state<{ to: number; body: number } | null>(null)
  let lock: PilotLock | null = null
  /** the base's screen is open; how the loop and the ship stood when last looked at */
  let baseOpen = $state(false)
  let loopNow = $state<LoopStatus | null>(null)
  let shipNow = $state({ hullLeft: 1, missiles: 0, missilesMax: 0 })
  /** inside (the hangar, the deck, a ship's rooms): where, as last looked at; and the screens opened from there */
  let insideNow = $state<InteriorStatus | null>(null)
  let benchOpen = $state(false)
  let boothOpen = $state(false)
  let shopOpen = $state(false)
  let sheetOpen = $state(false)
  let furnishOpen = $state(false)
  /** a hull tried with the development builds' ship key (never saved) */
  let devHull = $state('')
  /** the squad: formed, the other pilots in it (by key), pilots who asked him to join theirs, and whether wingmen fill it */
  let squad = $state<{ on: boolean; keys: string[]; asked: string[]; wingmen: boolean }>({ on: false, keys: [], asked: [], wingmen: true })
  let squadOpen = $state(false)
  /** the squad as the network has it: the other pilots in it, and those who asked (by key) */
  let squadKeys = $state<string[]>([])
  let squadAsked = $state<string[]>([])
  // ── the first session: the guided first sortie (lib/tutorial), its prompt, the tips that come later, the device in use
  let tutorial = $state.raw<Tutorial | null>(null)
  let prompt = $state<Prompt | null>(null)
  /** the step the narrator last spoke the line of (src/lib/story/sortie.ts), said once as each step begins */
  let spokenStep = ''
  let tip = $state<{ id: string; text: string } | null>(null)
  let inputKind = $state<InputKind>('pointer')
  /** the maps opened on the galaxy at the end of the first sortie, with a line over them */
  let mapOn = $state<'system' | 'galaxy' | null>(null)
  let mapNote = $state('')
  // ── settings, keeping the pilot safe, old builds
  let settingsOpen = $state(false)
  let backupOpen = $state(false)
  /** the first screen begins at the callsign (a key restored with nothing else found), with a line to say why */
  let onboardStart = $state<'title' | 'callsign'>('title')
  /** the opening story is showing (a new pilot's first visit, or asked for again from the title or the menu) */
  let introOpen = $state(false)
  let onboardNote = $state('')
  // ── the wing link (net/wing.ts): an address that puts a friend on a pilot's wing
  /** the wing he came by, another pilot's link, until he is on it (or it is given up); when he began to look for it; and whether he has gone on to where the relays say that pilot is now */
  let wingTo = $state<Wing | null>(null)
  let wingSince = 0
  let wingMoved = false
  /** a link of his own, shown to be sent; and, for a while after he made one, pilots of his side who ask to fly with him are taken on at once (until this, ms) */
  let wingLinkShown = $state<string | null>(null)
  let wingOpenUntil = 0
  /** ms a pilot who came by a link looks for the pilot who sent it before giving it up, and that a link's maker takes on those who come by it */
  const WING_WAIT = 45_000
  const WING_OPEN = 30 * 60_000
  // ── clips (display/clips.ts): the last seconds of play, kept as a short film to send
  /** what films the game as it is drawn (null: clips are off, or this browser cannot make them); the clip just kept, shown; one being cut off now */
  let clipper: Clipper | null = null
  let clipShown = $state<{ clip: Clip; url: string } | null>(null)
  let clipBusy = false
  let clipTold = false
  /** this browser can film its own picture */
  const clipsCan = typeof window !== 'undefined' && !!clipKind()
  const clipsOn = $derived(clipsCan && stage === 'flying' && (save?.settings.clips ?? true))
  /** a newer build is about (the site's, or pilots flying one), unless put off for now */
  let newerWire = $state(0)
  let updateLater = $state(false)
  const updateWhy = $derived<'site' | 'pilots' | null>(updateLater ? null : updated.current ? 'site' : newerWire ? 'pilots' : null)
  /** the music (audio/music.ts): its mood follows where he is (audio/moods.ts), and a fight */
  let music: Music | null = null
  const fight = createFightWatch()
  /** what the music last saw, for its stings: the fight's level and the kills when it began, where he was out of his ship, the system */
  const heard = { fight: 0, kills: 0, foot: 0, system: -2 }
  /** when the sealed copy last went to the relays (ms), and whether the save changed since */
  let sealedAt = 0
  let sealedDirty = true
  /** a zone just arrived at: its name is big at the top for a few seconds, and the prompt's box waits meanwhile (moved
   * lower, it sat in front of the ship; left at the top, it hid the name) */
  let arrived = $state(false)
  let arrivedTimer = 0
  /** the save has changed since it was last written (the ledger: it is written now and then, not every frame) */
  let dirty = false
  let keptAt = 0
  const totals = $derived(save ? totalsOf(save.property) : null)
  /** landed at a friendly base: trading, refitting and travelling are allowed */
  const atBase = $derived(!!loopNow && loopNow.stage === 'landed' && !!loopNow.base?.friendly)
  let storage: SaveStorage

  // ── the persistent world
  /** this build's events' namespace: a development build's never mix with a release's */
  const NS = namespaceOf(import.meta.env.DEV)
  let chronicle = $state.raw<Chronicle | null>(null)
  let persistent = $state.raw<Persistent | null>(null)
  /** the galaxy as the events leave it, who is flying where, how the event relays stand (as last looked at) */
  let galaxyNow = $state.raw<GalaxyState | null>(null)
  let pilotsNow = $state.raw<PresenceCounts | null>(null)
  let persistNow = $state.raw<{ events: number; waiting: number; relays: RelayHealth[]; namespace: string } | null>(null)
  let tracesNow = $state<TracesStatus | null>(null)
  /** the screens of the persistent world, and talking */
  let boardOpen = $state(false)
  let nearbyOpen = $state(false)
  let chatOpen = $state(false)
  let beaconWheel = $state(false)
  let chatLines = $state<ChatLine[]>([])
  let chatNow = $state(0)
  /** where the HUD is (FighterJetScene's onHud), and the view's height: the chat keeps clear of the HUD's corners */
  let hudNow = $state({ pixel: 0, top: false, cockpit: false, overhead: true })
  let viewHigh = $state(768)
  /** the history kept, at most */
  const CHAT_KEPT = 120
  /** a world first landed on, to name */
  let naming = $state<{ world: string; names: string[] } | null>(null)
  /** short news over the sky: a feat, credits earned */
  let toasts = $state<{ id: number; text: string; colour: string }[]>([])
  let toastN = 0
  /** the UTC day (the persistent world's: hotspots, tasks) */
  const utcDay = $derived(dayOfSeconds((galaxyNow?.now ?? Date.now() / 1000) | 0))
  const hotspots = $derived(hotspotsOn(utcDay))
  /** pilots of each side flying now, once a relay has answered (null: not known) */
  const flying = $derived(persistNow?.relays.some((r) => r.up) && pilotsNow ? pilotsNow.bySide : null)
  /** the relays the events are kept on: the address's, the pilot's own, or the built-in ones */
  const relayList = $derived(net.relays.length ? net.relays : (save?.settings.relays ?? DEFAULT_RELAYS))

  /** the chronicle: the events kept here, and (online) the relays; with ?net=off or local, this browser only */
  function startChronicle() {
    if (!save || chronicle) return
    const alone = net.net !== 'online' || typeof WebSocket === 'undefined'
    chronicle = new Chronicle({
      secret: save.identity.secret,
      ns: NS,
      relays: alone ? [] : relayList,
      dial: alone ? null : browserDial,
      clock: Date.now,
      storage,
      key: `xenophon/events/${NS}/${net.pilot}`,
    })
  }

  /** the pilot's part in the persistent world (once he has a callsign and a side) */
  function startPersistent() {
    if (!save?.pilot || !chronicle || persistent) return
    persistent = new Persistent({
      chronicle,
      pilot: { callsign: save.pilot.callsign, side: save.pilot.faction },
      progress: save.progress,
      social: save.social,
      changed: () => (dirty = true),
      earn,
      tell,
      clock: Date.now,
    })
  }

  /** credits from the persistent world (a task, a bounty), into the property log */
  function earn(credits: number, what: string) {
    if (!save || credits <= 0) return
    append(save.property, { t: Date.now(), k: 'bounty', credits, what })
    keep()
  }

  function toast(text: string, colour = '#f2c14e') {
    const id = toastN++
    toasts = [...toasts.slice(-3), { id, text, colour }]
    setTimeout(() => (toasts = toasts.filter((t) => t.id !== id)), 4500)
  }

  function tell(n: PersistentNews) {
    if (n.kind === 'feat') toast(`Feat: ${FEATS.find((f) => f.id === n.id)?.name ?? n.id} · a new paint`)
    else if (n.kind === 'earned') {
      toast(`+${n.credits} cr · ${n.what}`)
      // (the first time something is won with clips on: the key that keeps the last seconds of it, said once a session)
      if (clipsOn && !clipTold) {
        clipTold = true
        toast(`${namer(inputKind, save?.settings.bindings)('clip')} keeps a clip of that`, '#9fd0ff')
      }
    } else if (n.kind === 'discover') naming = { world: n.world, names: n.names }
  }

  /** where saves go when the browser will not keep them (a private window that blocks storage): they last as long as the tab */
  function memoryStorage(): SaveStorage {
    const items: Record<string, string> = {}
    return { getItem: (k) => items[k] ?? null, setItem: (k, v) => void (items[k] = v), removeItem: (k) => void delete items[k] }
  }

  onMount(() => {
    try {
      storage = window.localStorage
      storage.getItem('xenophon/probe')
    } catch {
      storage = memoryStorage()
    }
    // (the worlds' maps for space are built off the main thread and handed in, never by the scene itself)
    mapsFromOutside()
    landsFromOutside()
    save = loadSave(storage, net.pilot)
    const island = settings.seed !== undefined || settings.land !== undefined
    // (come by another pilot's link, to fly on his wing: a new pilot is asked only for a callsign; an old one of that
    // pilot's side goes to where he is; one of the other side flies on as he was)
    if (net.wing && !island) {
      if (!save.pilot) {
        wingTo = net.wing
        onboardStart = 'callsign'
        onboardNote = `${net.wing.callsign} asks you to fly with ${FACTIONS[net.wing.side].name}. Pick a callsign.`
      } else if (save.pilot.faction === net.wing.side) wingTo = net.wing
      else toast(`${net.wing.callsign} flies for ${FACTIONS[net.wing.side].name}: not your side`)
    }
    // (a pilot starts at his own side's capital; one on his way to another's wing, where that pilot was)
    world =
      settings.world ??
      (island
        ? ''
        : wingTo && save.pilot
          ? wingTo.zone
          : (save.settings.world ?? (save.pilot ? homeWorld(save.pilot.faction).id : startWorld())))
    startChronicle()
    // (who is flying, for the sides' cards and the maps)
    const presence = window.setInterval(() => {
      if (!chronicle) return
      chronicle.tick()
      pilotsNow = chronicle.pilotsNow()
      persistNow = { ...chronicle.health(), namespace: NS }
    }, 2000)
    claim(false)
    // the sound and the music: silent until the first click, tap or key (the mixer is made then)
    setAudioUrl((path) => asset(path as Parameters<typeof asset>[0]))
    setMusicVolume(save.settings.music ?? 0.5)
    setEffectsVolume(save.settings.volume ?? 0.7)
    const stopListening = listenForUnlock()
    const tune = (music = createMusic())
    // (a button pressed anywhere on the page's screens clicks)
    const clicked = (e: MouseEvent) => {
      const b = (e.target as HTMLElement | null)?.closest?.('button')
      if (b && !b.closest('[data-quiet]')) uiSound('select')
    }
    document.addEventListener('click', clicked, true)
    return () => {
      document.removeEventListener('click', clicked, true)
      stopListening()
      tune.dispose()
      music = null
      window.clearInterval(presence)
      lock?.release()
      online?.dispose()
      chronicle?.close()
    }
  })

  /** takes the pilot's lock (from another tab, with `take`), and goes on to the first screen or the sky */
  async function claim(take: boolean) {
    const got = await lockPilot(
      net.pilot,
      () => {
        // another tab has taken the pilot: this one stops
        stage = 'lost'
        menu = false
      },
      take,
    )
    if (!got.held) {
      stage = 'busy'
      return
    }
    lock = got.lock
    stage = save?.pilot ? 'flying' : 'new'
    // (a new pilot is told the story first, once; ?intro=off leaves it out for the tools)
    // (nor one who came by a pilot's link to fly with him: he is in the game at once, and can read it from the menu)
    if (stage === 'new' && save && !save.intro && net.intro && !wingTo) introOpen = true
    startPersistent()
  }

  /** the opening story is over: it is not shown again unasked */
  function introDone() {
    introOpen = false
    if (save && !save.intro) {
      save.intro = true
      keep()
    }
  }

  const keep = () => {
    if (!save) return
    writeSave(storage, net.pilot, $state.snapshot(save) as Save)
    dirty = false
    keptAt = Date.now()
  }

  function begin(callsign: string, faction: FactionId, look: string) {
    if (!save) return
    save.pilot = { callsign, faction, created: Date.now(), look }
    // (the smaller side, as the relays say now, pays him for joining it)
    const other = faction === 'nomarchy' ? 'anarchoi' : 'nomarchy'
    if (!save.progress.joined && flying && flying[faction] < flying[other])
      append(save.property, { t: Date.now(), k: 'bounty', credits: JOINING_BONUS, what: 'joining bonus' })
    save.progress.joined = true
    // (he starts docked at his own side's capital station, for the first sortie: launch, and down to the capital world;
    // with ?tutorial=off, the first sortie behind him, landed at his capital world as before it)
    // (come by a pilot's link: the first sortie is left, and he begins where that pilot was)
    if (!net.tutorial || wingTo) save.tutorial = { step: '', done: true }
    if (wingTo && !settings.world) world = wingTo.zone
    else if (!settings.world && world && !save.settings.world)
      world = save.tutorial.done ? homeWorld(faction).id : `s${theGalaxy().systems.find((x) => x.side === faction)!.index}`
    if (!save.tutorial.done) save.tutorial = { step: 'launch', done: false }
    keep()
    stage = 'flying'
    startPersistent()
  }

  /** the pilot creator, from the menu: a new look, kept, and told to the others */
  let creating = $state(false)
  function relook(look: string) {
    creating = false
    if (!save?.pilot) return
    save.pilot.look = look
    keep()
    online?.setCard(card($state.snapshot(save) as Save))
  }

  /** a pilot file: it replaces the pilot in this slot (asking first, if there is one) */
  async function restore(file: File): Promise<string | null> {
    try {
      const next = readPilotFile(await file.text())
      const now = save?.pilot
      if (now && now.callsign !== next.pilot!.callsign) {
        const sure = confirm(
          `This puts ${next.pilot!.callsign} in place of ${now.callsign} in this browser. Save ${now.callsign} to a file first to keep him. Go on?`,
        )
        if (!sure) return null
      }
      save = next
      keep()
      if (stage === 'flying') location.reload()
      else stage = 'flying'
      return null
    } catch (err) {
      return err instanceof Error ? err.message : 'That file could not be read.'
    }
  }

  function exportPilot() {
    if (!save) return
    const snapshot = $state.snapshot(save) as Save
    const url = URL.createObjectURL(new Blob([pilotFile(snapshot)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = pilotFileName(snapshot)
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    keptSafe('file')
  }

  // ── keeping the pilot safe (save/backup.ts)
  /** he has kept his key one way or another: the reminders stop, and the browser is asked not to clear his data on its own */
  function keptSafe(how: 'file' | 'phrase' | 'relays') {
    if (!save) return
    save.backup = { ...save.backup, at: Date.now(), how }
    keep()
    void navigator.storage?.persist?.().catch(() => {})
  }
  /** a sealed copy on the relays, or none */
  function setSealed(on: boolean) {
    if (!save) return
    save.backup = { ...save.backup, relays: on }
    keep()
    if (on) {
      sealedAt = 0
      sealedDirty = true
      void publishSealed()
    }
  }
  /** the sealed copy of the save, to the relays (if he keeps one, and the relays are reached), at most every few minutes */
  async function publishSealed() {
    const pool = chronicle?.pool
    if (!save?.pilot || !save.backup.relays || !pool || !sealedDirty) return
    if (Date.now() - sealedAt < 3 * 60_000) return
    sealedAt = Date.now()
    sealedDirty = false
    pool.publish(await sealedEvent($state.snapshot(save) as Save, NS, Math.floor(Date.now() / 1000)))
    if (pool.health().some((r) => r.up)) keptSafe(save.backup.how && save.backup.how !== 'relays' ? save.backup.how : 'relays')
  }
  /** when calm (landed, docked, or inside), once he has flown a while after the first sortie, and not lately: keep him safe? */
  function maybeAskBackup() {
    if (!save?.pilot || save.backup.at || !save.tutorial.done || backupOpen || settingsOpen || menu || tutorial) return
    if (save.played < 300 || Date.now() - save.backup.asked < 25 * 60_000) return
    // (landed at a friendly base or docked, in his seat; or inside: not out on foot in the wild, where it came up over a
    // pilot walking a volcanic world at night and held his hands while the raiders came on)
    const atBase = loopNow?.stage === 'landed' && !!loopNow.base?.friendly && flown?.foot.stage === 'ship'
    const calm = (atBase && !baseOpen && !benchOpen && !boothOpen && !shopOpen) || (!!insideNow?.place && !insideNow.flying)
    // (not over a screen he has open: it came up over Your pilot, three panels deep)
    if (!calm || mapOpen || creating || sheetOpen || furnishOpen || squadOpen || boardOpen || chatOpen) return
    backupOpen = true
    save.backup = { ...save.backup, asked: Date.now() }
    keep()
  }

  /** a key phrase, from the title: his sealed copy found on the relays, or his key alone kept for a pilot made afresh */
  async function restorePhrase(text: string): Promise<string | null> {
    const secret = secretOfPhrase(text)
    if (!secret) return 'That is not a key phrase: it starts nsec1 and runs to 63 letters and figures'
    let found: Save | null = null
    if (net.net === 'online' && typeof WebSocket !== 'undefined') {
      const pool = new RelayPool({ urls: relayList, dial: browserDial, clock: Date.now })
      const ticking = window.setInterval(() => pool.tick(), 250)
      pool.tick()
      found = await findSealed(pool, secret, NS, 7000, Date.now)
      window.clearInterval(ticking)
      pool.close()
    }
    if (found?.pilot) {
      save = found
      keep()
      location.reload()
      return null
    }
    // (none: the key kept, his callsign and side chosen again; what he did with the key stays his)
    save = { ...newSave(), identity: { secret } }
    keep()
    onboardNote = 'No sealed copy was found on the relays. Your key is kept: choose your callsign and side again.'
    onboardStart = 'callsign'
    return null
  }

  /** settings changed on the settings screen: kept, and the music told */
  function changeSettings(next: Settings) {
    if (!save) return
    save.settings = next
    setMusicVolume(next.music ?? 0.5)
    setEffectsVolume(next.volume ?? 0.7)
    keep()
  }

  /** the music's place (audio/moods.ts): a fight at its level (enemies near, a fight, one going badly; it settles a while after), the maps,
   * inside, space (the cruise drive, a black hole), on foot, a calm world by day or night, or a harsh one; and its stings */
  function placeOf(scene: Scene): Place {
    const z = scene.zone
    const st = scene.status
    const me = scene.player
    let near = 0
    let close = 0
    if (z.kind !== 'interior')
      for (const s of scene.listShips()) {
        if (s.side !== 1 || s.drill || s.hullLeft <= 0) continue
        const d = Math.hypot(s.x - me.x, s.y - me.y)
        if (d < FIGHT_NEAR) near++
        if (d < FIGHT_CLOSE) close++
      }
    const now = fight.look(
      fightLevel({
        near,
        close,
        target: !!st.target,
        incoming: st.incoming,
        hull: st.flying ? Math.min(1, st.hull + st.shield * 0.5) : 1,
        ambushed: st.ambushed,
      }),
      Date.now() / 1000,
    )
    stingsFor(scene, now)
    const foot = scene.foot.stage
    return placeFor({
      screen: 'sky',
      map: mapOpen || !!mapOn,
      zone: z.kind,
      harsh: isHarsh(surfaceById(z.key)?.recipe),
      fight: now,
      foot: z.kind === 'surface' && (foot === 'walking' || foot === 'falling') && !scene.interior.flying,
      night: z.night,
      cruise: z.kind === 'space' && z.cruise !== 'off',
      hole: z.kind === 'space' && (z.pull > 0 || z.travel === 'hole'),
    })
  }

  /** the music's stings: a fight won (it settled with kills in it), shot down or killed on foot, a new system reached */
  function stingsFor(scene: Scene, level: number) {
    const kills = scene.status.skirmish.kills
    if (level > 0 && heard.fight === 0) heard.kills = kills
    if (level === 0 && heard.fight > 0 && kills > heard.kills && scene.pilot.foot === 0) music?.sting('win')
    heard.fight = level
    // (pilot.foot: 1 coming down after ejecting, 3 dead)
    const foot = scene.pilot.foot
    if ((foot === 1 || foot === 3) && foot !== heard.foot) music?.sting('lost')
    heard.foot = foot
    const z = scene.zone
    if (z.kind === 'space' && heard.system >= 0 && z.system >= 0 && z.system !== heard.system) music?.sting('arrive')
    if (z.system >= 0) heard.system = z.system
  }

  // the settings' Reduce motion, for what the page moves (motion.ts) and the HUD
  $effect(() => setReducedMotion(save?.settings.motion === 'less'))

  // the first screens have the title's music, the opening story its own
  $effect(() => {
    if (introOpen) music?.setPlace('intro')
    else if (stage !== 'flying') music?.setPlace('title')
  })

  // a screen opening over the sky, or closing, is heard
  const panelsOpen = $derived(
    [
      menu,
      baseOpen,
      mapOpen || !!mapOn,
      boardOpen,
      nearbyOpen,
      chatOpen,
      beaconWheel,
      !!naming,
      benchOpen,
      boothOpen,
      shopOpen,
      sheetOpen,
      furnishOpen,
      squadOpen,
      settingsOpen,
      backupOpen,
    ].filter(Boolean).length,
  )
  let panelsWere = 0
  $effect(() => {
    const n = panelsOpen
    if (n > panelsWere) uiSound('open')
    else if (n < panelsWere) uiSound('close')
    panelsWere = n
  })

  /** an old build: the pilot saved, and the newer one loaded */
  function reload() {
    keep()
    location.reload()
  }

  /** a second pilot in this browser (to fly two tabs at once): the same address, another slot */
  function secondPilot() {
    const url = new URL(location.href)
    const n = net.pilot === 'main' ? 2 : (Number(net.pilot) || 1) + 1
    url.searchParams.set('pilot', String(n))
    location.href = url.toString()
  }

  const card = (s: Save): PilotCard => {
    const ship = flownShip(s)
    const set = shipSettings(ship, s.pilot!.faction)
    return {
      callsign: s.pilot!.callsign,
      faction: s.pilot!.faction,
      hull: ship.hull,
      paint: {
        body: ship.paint.body,
        accent: ship.paint.accent,
        canopy: ship.paint.canopy,
        trim: ship.paint.trim,
        glow: ship.paint.glow,
        trail: ship.paint.trail,
      },
      make: makeText(
        readMake(
          ship.hull,
          `${set.weapons}|${set.parts}|${set.pattern}|${set.emblem}|${set.factionMark ? (s.pilot!.faction === 'nomarchy' ? 1 : 2) : 0}`,
        ),
      ),
      open: ship.open,
      furniture: ship.furniture,
      look: s.pilot!.look,
      rank: persistent?.rank() ?? 0,
    }
  }

  // the scene's settings: the world's (its light and how it flies), then the pilot's ship and
  // paint, his view and volume, then whatever the address says
  const sceneSettings = $derived.by((): SceneSettings => {
    const own: SceneSettings = world ? worldSettings(world) : {}
    if (save) {
      own.side = save.pilot?.faction ?? ''
      own.look = save.pilot?.look ?? ''
      Object.assign(own, shipSettings(flownShip(save), own.side))
      own.gear = save.gear.join(',')
      // (in a squad, his computer wingmen fill it, as far as two of them)
      if ((squad.on || squadKeys.length) && squad.wingmen) own.wingmen = Math.max(0, 2 - squadKeys.length)
      if (devHull) Object.assign(own, { hull: devHull, weapons: '', parts: '' })
      if (save.settings.view) own.view = save.settings.view
      if (save.settings.volume !== null) own.volume = save.settings.volume
      // (the settings screen's: up and down as a stick, the shake, the flames)
      if (save.settings.invertY !== null) own.invertY = save.settings.invertY
      own.shake = save.settings.shake
      if (save.settings.flames) own.flameStyle = save.settings.flames
    }
    return { ...own, ...settings, world }
  })

  /** the wing he came by is done with (he is on it, or it was given up): the address says so no more, so a reload is not another arrival */
  function wingDone() {
    wingTo = null
    try {
      history.replaceState(history.state, '', withoutWing(location.href))
    } catch {
      // (the address cannot be changed here: it stays)
    }
  }

  /**
   * The wing link, looked to a few times a second. A pilot who came by one: once the pilot whose wing it is is in his
   * room, he is put flying beside him and asks to fly with him; until then, if the relays say that pilot is somewhere
   * else now, he goes there; and after a while he gives it up. A pilot who made one: those of his side who ask to fly
   * with him are taken on at once.
   */
  function wingLook(scene: Scene, o: Online, asked: string[]) {
    const pilots = netState.on ? netState.pilots : []
    if (wingTo) {
      const w = wingTo
      if (!wingSince) wingSince = Date.now()
      const him = pilots.find((p) => isWingOf(w, p.key))
      const id = him ? o.shipOf(him.key) : 0
      if (him && id > 0 && scene.flyBeside(id)) {
        o.invite(him.key)
        toast(`On ${him.callsign}'s wing`)
        wingDone()
      } else if (Date.now() - wingSince > WING_WAIT) {
        toast(`${w.callsign} is not flying here now`)
        wingDone()
      } else if (!him && !wingMoved && !scene.zone.travel) {
        const there = pilotsNow?.pilots.find((p) => isWingOf(w, p.key))?.zone
        if (there && there !== world) {
          wingMoved = true
          world = there
        }
      }
    }
    if (Date.now() < wingOpenUntil && save?.pilot)
      for (const key of asked) {
        const p = pilots.find((x) => x.key === key)
        if (!p || p.faction !== save.pilot.faction) continue
        o.accept(key)
        toast(`${p.callsign} is on your wing`)
      }
  }

  /** a wing link of his own, to send to a friend: shown, and for a while those who come by it are taken into his squad */
  function inviteByLink() {
    if (!save?.pilot || !chronicle) return
    const zone = flown?.zone.travel ? world : (flown?.worldKey ?? world)
    wingLinkShown = wingLink(location.href, { key: chronicle.key, zone, side: save.pilot.faction, callsign: save.pilot.callsign })
    wingOpenUntil = Date.now() + WING_OPEN
  }

  /** a frame of the game was drawn: into the film that keeps the last seconds of it (begun when it is first wanted, ended when clips are turned off) */
  function filmed(picture: HTMLCanvasElement, flames: HTMLCanvasElement) {
    if (!clipsOn) {
      clipper?.dispose()
      clipper = null
      return
    }
    clipper ??= createClipper({ audio: audioTap, mark: () => save?.pilot?.callsign ?? '' })
    clipper?.frame(picture, flames)
  }

  /** Clip was pressed: the last seconds, cut off now and shown, to be shared, saved, and sent with his wing link */
  async function clipThat() {
    if (clipBusy || clipShown) return
    if (!clipper) return toast(clipsCan ? 'Clips are off: Settings, Picture' : 'This browser cannot make clips')
    clipBusy = true
    const clip = await clipper.take()
    clipBusy = false
    if (!clip) return toast('Nothing to clip yet')
    clipShown = { clip, url: URL.createObjectURL(clip.blob) }
    uiSound('confirm')
  }
  function clipClosed() {
    if (clipShown) URL.revokeObjectURL(clipShown.url)
    clipShown = null
  }
  /** his wing link, to send with a clip ('' where he has no key to make one of) */
  function wingLinkNow() {
    if (!save?.pilot || !chronicle) return ''
    wingOpenUntil = Date.now() + WING_OPEN
    const zone = flown?.zone.travel ? world : (flown?.worldKey ?? world)
    return wingLink(location.href, { key: chronicle.key, zone, side: save.pilot.faction, callsign: save.pilot.callsign })
  }

  /** online in the room of the world the scene is over */
  function connect(scene: Scene) {
    const o = goOnline(scene, {
      settings: net,
      secret: save!.identity.secret,
      card: card($state.snapshot(save) as Save),
      zone: zoneOf(scene.worldKey),
      chronicle: chronicle ?? undefined,
      bounty: () => persistent?.bounty() ?? 0,
      onEarn: (credits, what) => persistent?.claimed(credits, what),
    })
    online = o
    return o
  }

  /** the scene is made: it goes online, and moves to another room whenever it arrives at another world */
  function attach(scene: Scene) {
    if (!save?.pilot) return
    flown = scene
    let o = connect(scene)
    // the first sortie, if it is still ahead of him (from the step he was on)
    if (!save.tutorial.done) {
      const side = save.pilot.faction
      tutorial = new Tutorial({
        side,
        step: (save.tutorial.step || undefined) as StepId | undefined,
        input: () => inputKind,
        name: (a) => namer(inputKind, save?.settings.bindings)(a),
        stick: () => sceneSettings.invertY ?? true,
      })
    }
    // (the clock the outcrops and prices run on; set again now and then, as a tab can sleep)
    scene.setClock(Date.now() / 1000)
    const look = () => {
      loopNow = scene.loop
      const s = scene.status
      shipNow = { hullLeft: s.hull, missiles: s.missiles, missilesMax: s.missilesMax }
      zoneNow = scene.zone
      playerNow = zoneNow.kind === 'space' ? { ...scene.player } : null
      tracesNow = scene.traces
      // inside: what was pressed there, his ship's furniture on going aboard her, and the squad told to the scene
      const was = insideNow?.place ?? ''
      insideNow = scene.interior
      if (insideNow.place === 'ship' && was !== 'ship' && !insideNow.owner && save) scene.setFurniture(flownShip(save).furniture)
      const uses = scene.takeUses()
      if (uses.length) used(uses)
      const sq = o.squad()
      squadKeys = sq.keys
      squadAsked = sq.asked
      scene.setSquad({
        on: squad.on || sq.keys.length > 0,
        mates: sq.keys.map((k) => ({
          id: o.shipOf(k),
          callsign: netState.on ? (netState.pilots.find((p) => p.key === k)?.callsign ?? '') : '',
        })),
      })
      if (persistent) {
        const before = galaxyNow
        galaxyNow = persistent.state()
        if (before && galaxyNow !== before) worldsChanged(before, galaxyNow)
      }
      squadChanged(squadKeys)
      wingLook(scene, o, sq.asked)
      // what was said in the zone (not by those muted or blocked)
      const said = o.takeChat().filter((l) => !save?.social.muted.includes(l.key) && !save?.social.blocked.includes(l.key))
      if (said.length) chatLines = [...chatLines, ...said].slice(-CHAT_KEPT)
      chatNow = performance.now()
    }
    // the worlds being built ahead, and the maps asked for
    // (plain records, not state: nothing on the page shows them)
    const building: Record<string, boolean> = {}
    const buildAhead = (id: string) => {
      if (!id || building[id]) return
      building[id] = true
      void buildOffThread(id).then((w) => {
        if (w) scene.giveWorld(id, w)
        delete building[id]
      })
    }
    const mapping: Record<string, boolean> = {}
    const buildMaps = (ids: string[]) => {
      for (const id of ids) {
        if (mapping[id]) continue
        mapping[id] = true
        void buildMapOffThread(id).then((m) => {
          // (with no worker to build it, it is built here: a moment's stall, once)
          const map = m ?? buildMap(id)
          if (map) scene.givePlanetMap(id, map)
          delete mapping[id]
        })
      }
    }
    // (the ground further on over a world: its maps built before the pilot flies to them)
    const landing: Record<string, boolean> = {}
    const buildLands = (keys: string[]) => {
      for (const key of keys) {
        if (landing[key]) continue
        landing[key] = true
        void buildLandOffThread(key).then((land) => {
          if (land) scene.giveLand(key, land)
          delete landing[key]
        })
      }
    }
    let systemWas = -1
    let named = scene.zone.key
    showArrival()
    look()
    const watch = window.setInterval(() => {
      netState = o.state()
      connTotals = { ...o.log.totals }
      look()
      lookForTip(scene)
      // (the time he has flown, all told: while the tab is in view)
      if (save && document.visibilityState === 'visible') {
        save.played += 0.4
        dirty = true
        sealedDirty = true
      }
      maybeAskBackup()
      void publishSealed()
      music?.setPlace(introOpen ? 'intro' : placeOf(scene))
      newerWire = chronicle?.newerProtocol() ?? 0
      if (dirty && Date.now() - keptAt > 2000) keep()
    }, 400)
    const clock = window.setInterval(() => scene.setClock(Date.now() / 1000), 60_000)
    // (while developing, a test browser can drive the game and read how it stands: never in a build)
    // (and, in a build made for the playthrough with VITE_PLAYTEST=1, the same: never in the build that is shipped)
    if (import.meta.env.DEV || import.meta.env.VITE_PLAYTEST)
      (window as unknown as Record<string, unknown>).__xenophon = {
        scene,
        // (everything the scene knows, for a tool to look into: where the walls and furniture of a room are)
        inner: () => stateOf(scene),
        open: () => {
          const st = stateOf(scene)
          const r = st?.interior.room
          // (his ship on show: where, and how far round it he cannot stand, as sim/interior.ts standable has it)
          const m = r?.ship ? st?.interior.bigMesh?.model : null
          const ship = r?.ship ? { ...r.ship, rx: m ? m.w * 0.42 + 3 : 30, ry: m ? m.l * 0.45 + 3 : 50 } : null
          return r ? { w: r.w, h: r.h, tile: 8, open: Array.from(openTiles(r)), spots: r.spots, ship } : null
        },
        state: () => o.state(),
        // (the network's side of the page, for a tool to invite to a squad, accept, and the like)
        net: () => o,
        chronicle,
        music: () => music?.now ?? '',
        // (lines of chat as if heard, for a tool to see the chat full: `at` in seconds ago)
        hear: (lines: (Omit<ChatLine, 'at'> & { ago?: number })[]) =>
          (chatLines = [...chatLines, ...lines.map(({ ago = 0, ...l }) => ({ ...l, at: performance.now() - ago * 1000 }))].slice(
            -CHAT_KEPT,
          )),
      }
    return {
      frame: () => {
        // the scene went to another zone by itself: the page follows it (the settings, the save, the room)
        const z = scene.zone
        // (the scene shows a place's name as soon as it is in the new zone, half way down or up: the page's box keeps
        // out of its way from then, not from the end of the way)
        if (z.key !== named) {
          named = z.key
          showArrival()
        }
        if (z.key !== world && !z.travel) {
          world = z.key
          if (save) {
            save.settings.world = z.key
            keep()
          }
        }
        if (zoneOf(scene.worldKey) !== o.zone) {
          o.dispose()
          o = connect(scene)
        }
        buildAhead(z.going || z.over)
        if (z.maps.length) buildMaps(z.maps)
        if (z.lands.length) buildLands(z.lands)
        // a route across the galaxy: in each system on the way, the course is to the way on
        if (z.kind === 'space' && z.system !== systemWas) {
          systemWas = z.system
          if (route) {
            scene.setCourse(courseFor(z.system, route.to, route.body))
            if (z.system === route.to) route = null
          }
        }
        if (z.kind !== 'space') systemWas = -1
        o.frame()
        // the first sortie: its prompt (Svelte told only when the words change), its step kept, and its end
        if (tutorial) {
          const p = tutorial.frame(scene)
          if (!prompt || p.text !== prompt.text || p.sub !== prompt.sub || p.index !== prompt.index || p.detour !== prompt.detour)
            prompt = p
          if (!p.detour && p.step !== spokenStep) {
            spokenStep = p.step
            sayStep(p.step)
          }
          if (tutorial.changed && save) {
            tutorial.changed = false
            save.tutorial.step = tutorial.step
            dirty = true
          }
          if (tutorial.done) finishTutorial(scene)
        }
        // what he did that the galaxy remembers, signed; the scene told how the galaxy stands
        persistent?.frame(scene)
        // what happened to the pilot's property goes into the save (at once, for a bank or a loss)
        const ledger = scene.takeLedger()
        persistent?.ledger(ledger)
        if (ledger.length && save) {
          let now = false
          for (const l of ledger) {
            const e = fromLedger(save.property, l, Date.now())
            if (e) append(save.property, e)
            if (l.kind === 'bank' || l.kind === 'lost' || l.kind === 'fee' || l.kind === 'repair') now = true
            if (l.kind === 'bank') tutorial?.holdBanked()
          }
          dirty = true
          if (now) keep()
        }
        // (what he has to spend: repairs done where the ship stands go no further, sim/repair.ts)
        scene.setPurse(totals?.credits ?? 0)
      },
      dispose() {
        window.clearInterval(watch)
        window.clearInterval(clock)
        o.dispose()
        if (online === o) online = null
        flown = null
      },
    }
  }

  // ── the first sortie and the tips
  /** the narrator's line for a step of the first sortie, in the words for the device in use and the keys as bound */
  function sayStep(step: StepId) {
    speak(sortieLine(step, sortieVoice(step, inputKind, save?.settings.bindings, sceneSettings.invertY ?? true)))
  }

  /** the first sortie is over: kept so, the last line shown a moment, and the galaxy map opened on today's hotspots */
  function finishTutorial(scene: Scene) {
    if (!save) return
    tutorial = null
    scene.setGuide(null)
    if (spokenStep !== 'free') sayStep('free')
    spokenStep = 'free'
    save.tutorial = { step: 'free', done: true }
    keep()
    prompt = {
      step: 'free',
      index: 11,
      of: 11,
      text: FREE_LINE,
      sub: FREE_SUB,
      detour: false,
    }
    setTimeout(() => (prompt = null), 5000)
    mapOn = 'galaxy'
    mapNote = "Today's hotspots are starred: their ore runs rich until the day turns. Pick anything for its card and plot a course."
    mapOpen = true
  }
  function showArrival() {
    arrived = true
    window.clearTimeout(arrivedTimer)
    arrivedTimer = window.setTimeout(() => (arrived = false), 5200)
  }
  function skipStep() {
    if (tutorial && flown) tutorial.skip(flown)
  }
  function endTutorial() {
    hush()
    if (tutorial && flown) tutorial.end(flown)
  }

  /** a weapon or module he could buy now: the credits, the ore his vault lacks made up at the counter (data/shop.ts payFor) */
  const affordable = () =>
    !!totals &&
    [...WEAPONS.filter((w) => w.price > 0), ...MODULES].some(
      (p) =>
        !ownsWeapon(totals!, p.id) &&
        !ownsModule(totals!, p.id) &&
        totals!.credits >= payFor(p.price, p.needs, (id) => inVault(totals!, id)).credits,
    )
  /** the ship to work towards while he has only the Corsair (data/hulls.ts NEXT_SHIP, by how he earns): for the tips */
  function shipGoal() {
    if (!save || !totals || save.ships.some((s) => s.hull !== 'corsair')) return null
    const hull = NEXT_SHIP[earnsBy(save.property)]
    const p = HULL_PRICES[hull]
    const flying = flyingShip()?.hull ?? 'corsair'
    return {
      name: hull[0].toUpperCase() + hull.slice(1),
      why: HULL_PITCH[hull],
      price: priceWords(p.credits, p.needs),
      can: totals.credits >= payFor(p.credits, p.needs, (id) => inVault(totals!, id)).credits,
      full: MODULES.filter((m) => ownsModule(totals!, m.id)).length >= (MODULE_SLOTS[flying] ?? 1),
    }
  }
  /** a tip that has come up (once the first sortie is behind him), shown a while and kept as seen */
  function lookForTip(scene: Scene) {
    // (the tip of how to go into the hangar, said while landed, goes once he is in: it covered his ship there)
    if (tip?.id === 'hangar' && scene.zone.kind === 'interior') tip = null
    // (and the seat's, once he is up)
    if (tip?.id === 'seat' && scene.foot.up) tip = null
    if (!save?.tutorial.done || tutorial || tip || prompt) return
    const t = nextTip(
      {
        zone: scene.zone,
        loop: scene.loop,
        interior: scene.interior,
        traces: scene.traces,
        status: scene.status,
        affordable: affordable(),
        mates: netState.on ? netState.pilots.filter((p) => p.faction === save!.pilot?.faction).length : 0,
        vault: totals ? totals.vault.reduce((a, s) => a + s.n, 0) : 0,
        credits: totals?.credits ?? 0,
        home: scene.zone.system >= 0 && theGalaxy().systems[scene.zone.system].side === save.pilot?.faction,
        ship: shipGoal(),
      },
      save.tips,
      namer(inputKind, save.settings.bindings),
      inputKind,
    )
    if (!t) return
    tip = t
    save.tips = [...save.tips, t.id]
    dirty = true
    setTimeout(() => {
      if (tip?.id === t.id) tip = null
    }, 10_000)
  }

  /** a course plotted on the maps: to a body in this system, or a route to another system (null: none) */
  function plot(to: { system: number; body: number } | null) {
    if (!flown) return
    const here = flown.zone.system
    if (!to) {
      route = null
      flown.setCourse(-1)
      return
    }
    if (to.system === here) {
      route = null
      flown.setCourse(to.body)
      // (and picked, as the target key would: its brackets and its card say what it is; docs/targeting.md)
      if (to.body >= 0) flown.setTarget({ kind: 'body', index: to.body })
    } else {
      route = { to: to.system, body: to.body }
      flown.setCourse(courseFor(here, to.system, to.body))
    }
  }

  // ── the base's screen: everything it does is written in the property log
  const where = () => `${world}/${loopNow?.base?.name ?? ''}`
  const today = () => dayOf(Date.now())
  function unload(slot: number) {
    if (!save || !flown || !atBase) return
    const items = flown.unloadSlot(slot)
    if (items.length) append(save.property, { t: Date.now(), k: 'bank', items, at: where() })
    loopNow = flown.loop
    keep()
  }
  function load(id: ResourceId) {
    if (!save || !flown || !totals || !atBase) return
    const n = Math.min(RESOURCES[id].stack, inVault(totals, id))
    const left = flown.loadHold([{ id, n }])
    const went = n - (left[0]?.n ?? 0)
    if (went > 0) append(save.property, { t: Date.now(), k: 'load', items: [{ id, n: went }], at: where() })
    loopNow = flown.loop
    keep()
  }
  function sell(id: ResourceId, n: number, price: number) {
    if (!save || !totals || !atBase || inVault(totals, id) < n) return
    append(save.property, { t: Date.now(), k: 'sold', items: [{ id, n }], credits: n * price, at: where() })
    uiSound('buy')
    keep()
  }
  /** pays for something (heard as a sale made, or refused): false if he cannot */
  function spend(what: string, credits: number, needs: { id: ResourceId; n: number }[] = []) {
    // (the ore his vault lacks is made up at the counter, for credits: data/shop.ts payFor)
    const pay = totals ? payFor(credits, needs, (id) => inVault(totals!, id)) : null
    if (!save || !totals || !atBase || !pay || totals.credits < pay.credits) {
      uiSound('error')
      return false
    }
    append(save.property, { t: Date.now(), k: 'bought', what, credits: pay.credits, items: pay.items, at: where() })
    uiSound('buy')
    keep()
    return true
  }
  function repair(cost: number) {
    if (spend('repair', cost)) flown?.refit({ repair: true })
  }
  function missiles(n: number) {
    if (spend(`missiles:${n}`, n * SHOP.missile)) flown?.refit({ missiles: n })
  }
  // ── his ships: bought, chosen, fitted, painted and furnished at a base (the hangar, the deck)
  /** the ship he flies, as the save has it (to change it) */
  const flyingShip = () => (save ? flownShip(save) : null)
  /** the ship changed: written, and other pilots told */
  function refitted() {
    uiSound('confirm')
    keep()
    if (save) online?.setCard(card($state.snapshot(save) as Save))
  }
  function buy(what: 'weapon' | 'module', id: string) {
    const item = what === 'weapon' ? WEAPONS.find((w) => w.id === id) : MODULES.find((m) => m.id === id)
    if (item) spend(`${what}:${id}`, item.price, item.needs)
  }
  function fitWeapon(mount: number, id: string) {
    const s = flyingShip()
    if (!s || !atBase) return
    s.weapons[mount] = id
    refitted()
  }
  function fitModule(slot: number, id: string) {
    const s = flyingShip()
    if (!s || !atBase) return
    const list = s.modules.filter((_, i) => i !== slot || !!id)
    if (id) list[slot] = id
    s.modules = list.filter((m, i) => !!m && list.indexOf(m) === i)
    refitted()
  }
  function paint(change: Partial<Livery>) {
    const s = flyingShip()
    if (!s || !atBase) return
    s.paint = { ...s.paint, ...change }
    refitted()
  }
  function keepScheme() {
    const s = flyingShip()
    if (!save || !s) return
    save.schemes = [...save.schemes, { ...s.paint }].slice(-8)
    keep()
  }
  function buyHull(h: string) {
    if (!save || !totals || !atBase) return
    const p = HULL_PRICES[h]
    if (!ownsHull(totals, h) && (!p || !spend(`hull:${h}`, p.credits, p.needs))) return
    if (save.ships.some((s) => s.hull === h)) return keep()
    // (a new ship is a step: he flies it at once, and it stands on the hangar's bay; polish step 9)
    const ship = newShip(h, flyingShip()!.paint)
    save.ships = [...save.ships, ship]
    toast(`New ship: the ${h[0].toUpperCase() + h.slice(1)} · ${HULL_PITCH[h] ?? ''}`)
    keep()
    shopOpen = false
    fly(ship.id)
    if (insideNow?.place) flown?.goInside('hangar')
  }
  function fly(id: string) {
    if (!save || !atBase || !save.ships.some((s) => s.id === id)) return
    save.flying = id
    devHull = ''
    refitted()
    // (the hangar shows the ship he will fly now)
    if (insideNow?.place) flown?.goInside(insideNow.place === 'ship' ? 'hangar' : insideNow.place)
  }
  function buyGear(id: string) {
    const g = GEAR.find((x) => x.id === id)
    if (g && spend(`gear:${id}`, g.price, g.needs)) wear(id)
  }
  function wear(id: string) {
    const g = GEAR.find((x) => x.id === id)
    if (!save || !g) return
    save.gear = [...save.gear.filter((x) => GEAR.find((y) => y.id === x)?.slot !== g.slot), id]
    keep()
  }
  function buyFurniture(id: string) {
    const f = FURNITURE.find((x) => x.id === id)
    if (f) spend(`furn:${id}`, f.price)
  }
  /** what was pressed inside: a screen to open, or a piece of furniture placed or taken up aboard his ship */
  function used(uses: InteriorUse[]) {
    const s = flyingShip()
    for (const u of uses) {
      if (u.kind === 'open') {
        if (u.spot === 'bench') benchOpen = true
        else if (u.spot === 'booth') boothOpen = true
        else if (u.spot === 'vault') baseOpen = true
        else if (u.spot === 'shop') shopOpen = true
        else if (u.spot === 'board') boardOpen = true
      } else if (s && !insideNow?.owner) {
        if (u.kind === 'placed') s.furniture = [...s.furniture, { id: u.id, x: u.x, y: u.y, face: u.face }]
        else s.furniture = s.furniture.filter((f, i) => i !== s.furniture.findIndex((g) => g.id === u.id && g.x === u.x && g.y === u.y))
        refitted()
      }
    }
  }

  /** the ship key (H, the Ship button): landed at a friendly base, into the hangar; in development builds, every hull in turn, for free, never saved */
  function hull(h: string) {
    if (import.meta.env.DEV) devHull = h
    else if (atBase && !insideNow?.place) flown?.goInside('hangar')
  }
  /** a callsign by key, from the room */
  const callsignOf = (key: string) => (netState.on ? (netState.pilots.find((p) => p.key === key)?.callsign ?? '?') : '?')
  const factionOf = (key: string) => (netState.on ? netState.pilots.find((p) => p.key === key)?.faction : undefined)
  /** ships of other pilots here that he may go aboard: landed at this base (on its deck) and open to visitors */
  const visitable = $derived(
    netState.on && insideNow?.place === 'deck'
      ? netState.pilots.filter((p) => p.open && p.inside >= 1 && p.faction === save?.pilot?.faction)
      : [],
  )
  function volume(v: number) {
    if (!save) return
    save.settings.volume = v
    keep()
  }
  function view(v: ViewMode) {
    if (!save) return
    save.settings.view = v
    keep()
  }

  /** a base's prices today: a tenth more for what he sells on a world his side holds */
  function pricesHere() {
    const list = pricesAt(world, loopNow?.base?.id ?? 0, today())
    const mine = !!save?.pilot && galaxyNow?.worlds[world]?.holder === save.pilot.faction
    return mine ? list.map((p) => ({ ...p, price: Math.round(p.price * 1.1) })) : list
  }

  /** alone (offline), what the pilot says is heard by him only */
  function hearAlone(text: string, quick: number, to: ChatChannel) {
    if (!save?.pilot || (!text && quick < 0)) return
    const line: ChatLine = {
      at: performance.now(),
      key: chronicle?.key ?? '',
      callsign: save.pilot.callsign,
      faction: save.pilot.faction,
      text,
      quick,
      channel: to === 'news' ? 'room' : to,
    }
    chatLines = [...chatLines, line].slice(-CHAT_KEPT)
  }

  /** a line of the page's own news in the chat (said by nobody): a world changing hands, a squad's comings and goings */
  function news(text: string, faction: FactionId) {
    chatLines = [
      ...chatLines,
      { at: performance.now(), key: '', callsign: '', faction, text: cleanChat(text), quick: -1, channel: 'news' as const },
    ].slice(-CHAT_KEPT)
  }

  /** worlds that changed hands since the galaxy was last worked out: news */
  function worldsChanged(was: GalaxyState, now: GalaxyState) {
    for (const [id, w] of Object.entries(now.worlds)) {
      const before = was.worlds[id]
      if (!before || before.holder === w.holder) continue
      const name = now.names[id]?.name ?? surfaceById(id)?.name ?? id
      if (w.holder) news(`${name} TAKEN BY ${FACTIONS[w.holder].name}`, w.holder)
      if (w.holder && w.holder === save?.pilot?.faction) music?.sting('taken')
      else if (before.holder) news(`${name} LOST BY ${FACTIONS[before.holder].name}`, before.holder)
    }
  }

  /** the squad as it was last looked at: those who came into it and went are news */
  let squadWas: string[] = []
  function squadChanged(keys: string[]) {
    if (keys.length === squadWas.length && keys.every((k) => squadWas.includes(k))) return
    const side = save?.pilot?.faction ?? 'nomarchy'
    for (const k of keys) if (!squadWas.includes(k)) news(`${callsignOf(k)} JOINED YOUR SQUAD`, factionOf(k) ?? side)
    for (const k of squadWas) if (!keys.includes(k)) news(`${callsignOf(k)} LEFT YOUR SQUAD`, factionOf(k) ?? side)
    squadWas = [...keys]
  }

  /** where the chat may be, in CSS px: under the HUD's top-left corner (the portrait; and the bars, the hold and the
   * cruise drive where the HUD keeps to the top), above its bottom-left (the bars and the hold), or the cockpit's panel */
  const chatPlace = $derived.by(() => {
    const { pixel, top, cockpit } = hudNow
    const px = pixel || 3
    // (the HUD's top-left: the portrait 20 art px from the edge; kept to the top, the bars, the hold and the drive under it)
    const above = Math.round(px * (top && !cockpit ? 50 : 24)) + 8
    // (the HUD's bottom-left: the bars and the hold over them, 40 art px)
    const below = cockpit ? Math.round(viewHigh * 0.36) : Math.round(px * 42) + 8
    const room = viewHigh - above - below
    return { top: above, bottom: room < 70 ? Math.max(8, viewHigh - above - 70) : below, openBottom: below }
  })

  /** mute or block a pilot (or let him be heard again) */
  function toggle(list: 'muted' | 'blocked', key: string) {
    if (!save) return
    const l = save.social[list]
    save.social[list] = l.includes(key) ? l.filter((k) => k !== key) : [...l, key]
    if (list === 'blocked') chatLines = chatLines.filter((c) => c.key !== key)
    if (list === 'muted') chatLines = chatLines.filter((c) => c.key !== key || !save!.social.muted.includes(key))
    keep()
  }

  /** who is in the zone: those in the room, then those whose presence says they are here */
  const nearby = $derived.by((): Nearby[] => {
    const out: Nearby[] = []
    const presence = pilotsNow?.pilots ?? []
    const bountyOf = (key: string) => presence.find((p) => p.key === key)?.bounty ?? 0
    if (netState.on)
      for (const p of netState.pilots)
        out.push({
          key: p.key,
          callsign: p.callsign,
          faction: p.faction,
          rank: p.rank,
          bounty: bountyOf(p.key),
          look: p.look,
          idle: p.idle,
          room: true,
        })
    for (const p of presence)
      if (p.zone === world && p.key !== chronicle?.key && !out.some((x) => x.key === p.key))
        out.push({ key: p.key, callsign: p.callsign, faction: p.side, rank: p.rank, bounty: p.bounty, look: '', idle: false, room: false })
    return out
  })

  const topButton = 'ui-btn ui-btn-small pointer-events-auto border-ink/40 bg-night/70'
  const button = 'ui-btn'
</script>

<div
  bind:clientHeight={viewHigh}
  class="relative h-full w-full bg-night"
  data-text={save?.settings.text ?? 'normal'}
  data-motion={save?.settings.motion ?? 'full'}
  data-side={save?.pilot?.faction ?? 'nomarchy'}
  style:--accent={FACTIONS[save?.pilot?.faction ?? 'nomarchy'].colour}
>
  {#if stage === 'new'}
    {#key onboardStart}
      <Onboarding
        ondone={begin}
        onrestore={restore}
        onphrase={restorePhrase}
        onsettings={() => (settingsOpen = true)}
        onstory={() => (introOpen = true)}
        hushed={introOpen}
        counts={flying}
        start={onboardStart}
        note={onboardNote}
        invite={wingTo ? { side: wingTo.side } : null}
      />
    {/key}
  {:else if stage === 'flying' && save?.pilot}
    <FighterJetScene
      {...sceneSettings}
      bindings={save.settings.bindings}
      toggle={save.settings.toggle}
      pixelSize={save.settings.pixel}
      largeText={save.settings.text !== 'normal'}
      reduceMotion={save.settings.motion === 'less'}
      showHint={!prompt && !tip && !menu && !baseOpen && !mapOpen && !chatOpen && !settingsOpen}
      onInput={(k) => (inputKind = k)}
      onHud={(h) => (hudNow = h)}
      onScene={attach}
      onHull={hull}
      onVolume={volume}
      onView={view}
      onMenu={() => (menu = !menu)}
      onInventory={() => (baseOpen = !baseOpen)}
      onMap={() => (mapOpen = !mapOpen)}
      onChat={() => (chatOpen = !chatOpen)}
      onClip={clipThat}
      onPicture={filmed}
      onBeacon={() => {
        beaconWheel = true
        return true
      }}
      padOff={introOpen ||
        baseOpen ||
        mapOpen ||
        boardOpen ||
        nearbyOpen ||
        chatOpen ||
        beaconWheel ||
        !!naming ||
        benchOpen ||
        boothOpen ||
        shopOpen ||
        sheetOpen ||
        furnishOpen ||
        squadOpen}
    >
      {#snippet top()}
        <NetBadge sky={netState} onclick={() => (menu = !menu)} />
        {#if atBase && !baseOpen}
          <!-- landed at a friendly base: its screen is a press away -->
          <button
            type="button"
            class="{topButton} !border-accent text-accent"
            onclick={() => (baseOpen = true)}
            onpointerdown={(e) => e.stopPropagation()}><UiIcon name="hold" size={32} />{loopNow?.base?.name}</button
          >
          {#if !insideNow?.place}
            <!-- … and the places inside: the hangar, the deck, his ship's rooms -->
            {#each [['hangar', 'Hangar'], ['deck', 'Deck'], ['ship', 'Aboard']] as [place, label] (place)}
              <button
                type="button"
                class={topButton}
                onclick={() => flown?.goInside(place as 'hangar')}
                onpointerdown={(e) => e.stopPropagation()}>{label}</button
              >
            {/each}
          {/if}
        {/if}
        {#if insideNow?.place}
          <button type="button" class={topButton} onclick={() => flown?.goOutside()} onpointerdown={(e) => e.stopPropagation()}
            >{insideNow.flying ? 'To the seat' : 'Leave'}</button
          >
          {#if insideNow.place === 'ship' && !insideNow.owner}
            <button type="button" class={topButton} onclick={() => (furnishOpen = true)} onpointerdown={(e) => e.stopPropagation()}
              >Furnish</button
            >
          {/if}
          {#each visitable as p (p.key)}
            <button
              type="button"
              class={topButton}
              onclick={() => {
                flown?.goInside('ship', p.hull, p.key)
                flown?.setFurniture(p.furniture)
              }}
              onpointerdown={(e) => e.stopPropagation()}>Aboard {p.callsign}'s</button
            >
          {/each}
        {/if}
      {/snippet}
    </FighterJetScene>
    <!-- news of the persistent world over the sky: a feat, credits earned -->
    {#if toasts.length}
      <ul
        class="pointer-events-none absolute top-[22%] left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1.5"
        aria-live="polite"
      >
        {#each toasts as t (t.id)}
          <li
            class="ui-body border-2 bg-[#0b1023]/92 px-3 py-1.5"
            style="border-color: {t.colour}; color: {t.colour}"
            in:flyIn={{ y: moving() ? -10 : 0, duration: ms(220) }}
            out:fade={{ duration: ms(160) }}
          >
            {t.text}
          </li>
        {/each}
      </ul>
    {/if}
    {#if prompt && !arrived && !chatOpen}
      <TutorialPrompt {prompt} colour={FACTIONS[save.pilot.faction].colour} onskip={skipStep} onend={endTutorial} />
    {:else if tip && !arrived && !chatOpen}
      <TutorialPrompt
        tip={tip.text}
        colour={FACTIONS[save.pilot.faction].colour}
        onclose={() => (tip = null)}
        bottom={insideNow?.place === 'hangar' || insideNow?.place === 'deck'}
      />
    {/if}
    <ChatPanel
      lines={chatLines}
      now={chatNow}
      open={chatOpen}
      me={chronicle?.key ?? ''}
      side={save.pilot.faction}
      squad={squadKeys.length > 0}
      shared={netState.on && netState.pilots.length > 0}
      top={chatPlace.top}
      bottom={chatPlace.bottom}
      openBottom={chatPlace.openBottom}
      small={viewHigh < 480}
      muted={save.social.muted}
      onsay={(text, to) => (netState.on ? online?.say(text, to) : hearAlone(cleanChat(text), -1, to))}
      onquick={(n, to) => (netState.on ? online?.sayQuick(n, to) : hearAlone('', n, to))}
      onmute={(k) => toggle('muted', k)}
      onblock={(k) => toggle('blocked', k)}
      onclose={() => (chatOpen = false)}
    />
    {#if beaconWheel}
      <QuickWheel
        title="Your beacon says"
        phrases={BEACON_PHRASES}
        colour={FACTIONS[save.pilot.faction].colour}
        onpick={(n) => {
          flown?.plantBeacon(n)
          tutorial?.beaconPlanted()
          beaconWheel = false
        }}
        onclose={() => (beaconWheel = false)}
      />
    {/if}
    {#if naming}
      <NameWorld
        now={galaxyNow?.names[naming.world]?.name ?? surfaceById(naming.world)?.name ?? naming.world}
        names={naming.names}
        colour={FACTIONS[save.pilot.faction].colour}
        onpick={(name) => {
          if (naming) persistent?.name(naming.world, name)
          naming = null
        }}
        onclose={() => (naming = null)}
      />
    {/if}
    {#if boardOpen && galaxyNow}
      <FactionBoard
        side={save.pilot.faction}
        callsign={save.pilot.callsign}
        me={chronicle?.key ?? ''}
        galaxy={galaxyNow}
        progress={save.progress}
        rank={persistent?.rank() ?? 0}
        tasks={dailyTasks(utcDay)}
        {hotspots}
        {flying}
        onclose={() => (boardOpen = false)}
      />
    {/if}
    {#if nearbyOpen}
      <PilotsNearby
        zoneName={galaxyNow?.names[world]?.name ?? surfaceById(world)?.name ?? world}
        pilots={nearby}
        muted={save.social.muted}
        blocked={save.social.blocked}
        onmute={(k) => toggle('muted', k)}
        onblock={(k) => toggle('blocked', k)}
        onclose={() => (nearbyOpen = false)}
        side={save.pilot?.faction ?? ''}
        squad={squadKeys}
        oninvite={(k) => online?.invite(k)}
      />
    {/if}
    {#if squadOpen}
      <SquadPanel
        on={squad.on || squadKeys.length > 0}
        wingmen={squad.wingmen}
        members={squadKeys.map((key) => ({ key, callsign: callsignOf(key) }))}
        asked={squadAsked.map((key) => ({ key, callsign: callsignOf(key) }))}
        online={netState.on}
        onform={(on) => (squad = { ...squad, on })}
        onwingmen={(on) => (squad = { ...squad, wingmen: on })}
        onaccept={(k) => online?.accept(k)}
        onleave={() => online?.leaveSquad()}
        onnearby={() => {
          squadOpen = false
          nearbyOpen = true
        }}
        oninvite={() => {
          squadOpen = false
          inviteByLink()
        }}
        onclose={() => (squadOpen = false)}
      />
    {/if}
    {#if wingLinkShown}
      <WingPanel link={wingLinkShown} callsign={save.pilot.callsign} onclose={() => (wingLinkShown = null)} />
    {/if}
    {#if clipShown}
      <ClipPanel clip={clipShown.clip} url={clipShown.url} link={wingLinkNow()} callsign={save.pilot.callsign} onclose={clipClosed} />
    {/if}
    {#if baseOpen && totals && save}
      <BaseScreen
        base={loopNow?.stage === 'landed' && loopNow.base ? loopNow.base : null}
        station={zoneNow?.kind === 'space'}
        {totals}
        hold={loopNow?.hold ?? []}
        prices={pricesHere()}
        ship={{
          hullLeft: shipNow.hullLeft,
          hullPoints: statsOf(flownShip(save).hull).hull,
          missiles: shipNow.missiles,
          missilesMax: shipNow.missilesMax,
          fee: REDELIVERY[flownShip(save).hull] ?? 0,
        }}
        onclose={() => (baseOpen = false)}
        onunload={unload}
        onload={load}
        onsell={sell}
        onrepair={repair}
        onmissiles={missiles}
        onhangar={atBase && !insideNow?.place
          ? () => {
              baseOpen = false
              flown?.goInside('hangar')
            }
          : undefined}
      />
    {/if}
    {#if benchOpen && totals && save}
      <LoadoutBench
        ship={flownShip(save)}
        ships={save.ships}
        {totals}
        onclose={() => (benchOpen = false)}
        onbuy={buy}
        onweapon={fitWeapon}
        onmodule={fitModule}
        onfly={fly}
      />
    {/if}
    {#if boothOpen && save}
      <PaintBooth
        ship={flownShip(save)}
        schemes={save.schemes}
        feats={save.progress.feats}
        onclose={() => (boothOpen = false)}
        onpaint={paint}
        onkeep={keepScheme}
        onscheme={(i) => paint({ ...save!.schemes[i] })}
        ondrop={(i) => {
          save!.schemes = save!.schemes.filter((_, j) => j !== i)
          keep()
        }}
      />
    {/if}
    {#if shopOpen && totals && save}
      <ShopScreen
        ships={save.ships}
        flying={save.flying}
        gear={save.gear}
        {totals}
        onclose={() => (shopOpen = false)}
        onbuyhull={buyHull}
        onfly={fly}
        onbuygear={buyGear}
        onwear={wear}
        onbuyfurniture={buyFurniture}
      />
    {/if}
    {#if furnishOpen && totals && save}
      <FurnishPanel
        ships={save.ships}
        {totals}
        placing={insideNow?.placing ?? ''}
        onplace={(id) => flown?.placeFurniture(id)}
        onclose={() => (furnishOpen = false)}
        open={flownShip(save).open}
        onopen={(open) => {
          flownShip(save!).open = open
          refitted()
        }}
      />
    {/if}
    {#if sheetOpen && save?.pilot}
      <PilotSheet
        callsign={save.pilot.callsign}
        faction={save.pilot.faction}
        look={save.pilot.look}
        rank={persistent?.rank() ?? 0}
        progress={save.progress}
        property={save.property}
        ships={save.ships}
        flying={save.flying}
        gear={save.gear}
        onclose={() => (sheetOpen = false)}
      />
    {/if}
    {#if mapOpen && zoneNow}
      <MapScreen
        system={zoneNow.system}
        player={playerNow}
        {world}
        side={save.pilot.faction}
        course={zoneNow.course}
        {route}
        clock={() => Date.now() / 1000}
        galaxy={galaxyNow}
        pilots={pilotsNow}
        {hotspots}
        open={mapOn}
        note={mapNote}
        onplot={(to) => {
          plot(to)
          if (flown) zoneNow = flown.zone
        }}
        onclose={() => {
          mapOpen = false
          mapOn = null
          mapNote = ''
        }}
      />
    {/if}
    {#if menu}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="contents" onkeydown={(e) => e.key === 'Escape' && (menu = false)}>
        <MenuPanel
          callsign={save.pilot.callsign}
          faction={save.pilot.faction}
          {world}
          onmap={() => {
            menu = false
            mapOpen = true
          }}
          sky={netState}
          totals={connTotals}
          logText={() => JSON.stringify({ at: new Date().toISOString(), agent: navigator.userAgent, ...online?.log }, null, 1)}
          onclose={() => (menu = false)}
          onexport={exportPilot}
          onimport={restore}
          look={save.pilot.look}
          onpilot={() => {
            menu = false
            creating = true
          }}
          onboard={() => {
            menu = false
            boardOpen = true
          }}
          onnearby={() => {
            menu = false
            nearbyOpen = true
          }}
          onsheet={() => {
            menu = false
            sheetOpen = true
          }}
          onsquad={() => {
            menu = false
            squadOpen = true
          }}
          oninvite={() => {
            menu = false
            inviteByLink()
          }}
          onghost={() => {
            menu = false
            flown?.recordGhost(!(tracesNow && tracesNow.recording >= 0))
          }}
          recording={!!tracesNow && tracesNow.recording >= 0}
          canRecord={!!zoneNow && zoneNow.kind === 'surface' && /^w\d+$/.test(world)}
          persist={persistNow}
          onsettings={() => {
            menu = false
            settingsOpen = true
          }}
          backedUp={save.backup.at}
          onbackup={() => {
            menu = false
            backupOpen = true
          }}
          tutorialOn={!!tutorial}
          onskipstep={() => {
            menu = false
            skipStep()
          }}
          onendtutorial={() => {
            menu = false
            endTutorial()
          }}
          onstory={() => {
            menu = false
            introOpen = true
          }}
        />
      </div>
    {/if}
    {#if creating}
      <!-- (over everything, the page's row of buttons too, and Escape goes back, as from every other screen: the fresh review) -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="absolute inset-0 z-30 flex justify-center bg-[#060a18]/95 px-2 py-[max(6px,env(safe-area-inset-top))]"
        onkeydown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            creating = false
          }
        }}
      >
        <PilotCreator faction={save.pilot.faction} look={save.pilot.look} ondone={relook} onback={() => (creating = false)} />
      </div>
    {/if}
    {#if backupOpen}
      <BackupPrompt
        callsign={save.pilot.callsign}
        secret={save.identity.secret}
        sealed={save.backup.relays}
        online={!!chronicle?.pool}
        colour={FACTIONS[save.pilot.faction].colour}
        onfile={exportPilot}
        onphrase={() => keptSafe('phrase')}
        onsealed={setSealed}
        onlater={() => (backupOpen = false)}
        ondone={() => (backupOpen = false)}
      />
    {/if}
  {:else if stage === 'busy' || stage === 'lost'}
    <main class="flex h-full flex-col items-center justify-center gap-4 px-4 text-center text-ink">
      <p class="ui-head">
        {stage === 'busy' ? 'Flying in another tab' : 'Now flying in another tab'}
      </p>
      <p class="ui-label">One tab at a time</p>
      <div class="flex flex-wrap justify-center gap-3">
        <button type="button" class="{button} ui-btn-main" onclick={() => claim(true)}>Fly here instead</button>
        <button type="button" class={button} onclick={secondPilot}>Fly a second pilot</button>
      </div>
    </main>
  {/if}
  {#if settingsOpen && save}
    <SettingsScreen
      settings={save.settings}
      onchange={changeSettings}
      callsign={save.pilot?.callsign ?? null}
      secret={save.identity.secret}
      backup={save.backup}
      onfile={exportPilot}
      onphrase={() => keptSafe('phrase')}
      onsealed={setSealed}
      {relayList}
      onrelays={(list) => {
        if (!save) return
        save.settings.relays = list
        keep()
        toast('Relays kept: from the next time the game is opened')
      }}
      onclose={() => (settingsOpen = false)}
    />
  {/if}
  {#if introOpen}
    <IntroCrawl ondone={introDone} />
  {/if}
  {#if updateWhy && stage !== 'loading'}
    <UpdateBanner why={updateWhy} onreload={reload} onlater={() => (updateLater = true)} />
  {/if}
  <TooltipHost />
</div>
