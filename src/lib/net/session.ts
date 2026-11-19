// A shared sky, kept in sync (the plan's section 18). A session joins the room for a zone over
// any transport (link.ts), and then, once a frame:
//
//   - sends the player's own ship about 15 times a second on the fast lane (codec.ts), and
//     events (hits, losses, missiles, a signed card saying who he is) on the sure lane;
//   - draws every other pilot's ship 100 ms in the past, between the two states either side of
//     that moment, carried on along its heading for a quarter of a second if they stop coming;
//   - passes on what the scene reports (room.ts in the engine), and puts what other games
//     report into the scene;
//   - picks the game that flies the computer's ships for the room: the pilot with the lowest key.
//     It sends them as it sends its own ship; if it leaves, the next takes them over from the
//     last state it heard. A pilot alone flies them himself, as he always has.
//
// Who decides what: the shooter's game decides a shot's hit; the game that owns a missile's
// target decides the missile (a dodge is that pilot's timing); each game decides the loss of
// its own ships, and says who downed them. Nothing is checked: cheating is accepted for now.
//
// A pilot whose tab is hidden says so, and stops sending: he is marked idle, and his ship goes
// a few seconds later (a pilot who just goes quiet is treated the same). Each kill of the same
// pilot within ten minutes is worth less than the last.
//
// Out of his ship (Phase 5) a pilot is two things in the others' scenes: himself on foot (a
// walker: coming down, walking, dead) and the ship he left standing, if it stands. Hits on him
// on foot say so (`foot`); his game decides his death, and says who killed him. A pilot climbing
// into another's parked ship asks that pilot's game, which gives it up (with its cargo) only if
// it still stands empty: the thief then flies it.
//
// The persistent world (Phase 7): a session given the pilot's chronicle (chronicle.ts) hands each
// pilot who comes into the room the newest events it holds, passes on each event this pilot makes,
// and lets in what others hand it, so events spread from player to player as well as through the
// relays. It also carries zone chat and the quick-chat wheel's phrases, and a pilot's bounty: the
// game of a pilot with a price on him says so when he is downed, and whoever downed him is paid it.
//
// No page and no real clock in here: time is handed in, so the tests drive it over the
// same-browser transport with as much delay, jitter and loss as they like. The one thing that
// takes real time is signing and checking pilots' cards (Web Crypto works asynchronously):
// `settled()` says when all of it begun so far is done, and the tests wait for it before each
// step of their simulated clock, so a card takes effect at the same step however long the
// checking took. (On the page, real time runs on regardless.)

import { BAND_PAINT, ENEMY_PAINT, isFace, isResource, MARK_COLOURS, PARKED_ID, readMake, SIDE_COLOURS, SQUAD } from '../engine'
import type { Face, FeedLine, Items, Report, Scene } from '../engine'
import { FACTIONS } from '../save/pilot'
import type { FactionId } from '../save/pilot'
import {
  MSG_COMPUTER,
  MSG_EVENTS,
  MSG_PILOT,
  packComputer,
  packEvents,
  packPilot,
  unpackComputer,
  unpackEvents,
  unpackPilot,
} from './codec'
import type { ComputerPacket, ComputerSnap, NetEvent, PilotCard, PilotSnap, Who } from './codec'
import type { Link, LinkHealth, Transport } from './link'
import { note } from './log'
import type { ConnectionLog } from './log'
import { KIND_PILOT_CARD, publicKeyOf, signEvent, verifyEvent } from './nostr'
import type { NostrEvent } from './nostr'
import { COPIES_MOST, ROOM_CAP, roomName } from './rooms'
import type { Chronicle } from './chronicle'

/** ms between states sent (about 15 a second) */
export const SEND_EVERY = 1000 / 15
/** ms in the past other ships are drawn */
export const DELAY = 100
/** ms a ship is carried on along its heading once its states stop coming */
export const EXTRAPOLATE = 250
/** ms without a state before a pilot is taken to be idle, and ms idle before his ship goes */
export const SILENT = 1500
export const IDLE_GONE = 4000
/** ms a pilot must have been known before he may fly the computer's ships (so he has heard their state) */
export const READY = 1500
/** ms after its last packet that a game's claim to fly the computer's ships lapses */
export const CLAIM_LAPSES = 1200
/** ms one of the computer's ships may be missing from its host's packets before it is taken to be gone */
const COMPUTER_MISSING = 800
/** ms with no word of one of the computer's ships at all before it is let go */
const COMPUTER_STALE = 6000
/** ms a pilot's state may say he is out of his ship before word comes of who downed him */
const DOWN_GRACE = 500
/** ms between pings */
const PING_EVERY = 2000
/** missiles from other games remembered, for word of how they ended; and crates */
const MISSILES_KEPT = 64
const CRATES_KEPT = 48
/** the farming limit: ms a kill is remembered, and what each kill of the same pilot in that time is worth */
export const FARM_WINDOW = 10 * 60 * 1000
export const FARM_WORTH = [1, 0.25, 0.1]

/** the colours of names in the kill feed */
const INK = '#f4f6fc'
const FOE = '#ff5446'
const YOU = '#ffd65a'
const DIM = '#acbace'

export interface SessionOptions {
  transport: Transport
  /** the zone (rooms.ts): one room, and copies of it when full */
  zone: string
  scene: Scene
  /** the pilot's secret key, and what his card says */
  secret: string
  card: PilotCard
  /** ms, from any start (the page's clock, or the test's) */
  clock: () => number
  /** ms since 1970, for the signed card and the log (Date.now unless given) */
  wallClock?: () => number
  /** where connection attempts are counted */
  log?: ConnectionLog
  /** a private suffix for the room's name, so tests and trials meet only each other */
  test?: string
  cap?: number
  /** the pilot's persistent world: its events are shared with the room (none: not shared) */
  chronicle?: Chronicle
  /** the price on the player's head now (said when he is downed, for whoever downed him) */
  bounty?: () => number
  /** the player earned credits from another game's word (a bounty claimed) */
  onEarn?: (credits: number, what: string) => void
}

/**
 * Where a line of chat goes, and where it came from: everyone in the room, the pilots of the speaker's side there, his
 * squad; or news, said by nobody (a pilot come or gone, one downed, and the page's own: a world changing hands)
 */
export type ChatChannel = 'room' | 'side' | 'squad' | 'news'

/** a line of zone chat, or a quick-chat phrase, as it came; or a line of news (`channel` 'news', no key, `faction` whose it is) */
export interface ChatLine {
  /** ms on the session's clock */
  at: number
  key: string
  callsign: string
  faction: FactionId
  text: string
  /** a phrase of the quick-chat wheel (its number), or −1 for typed words */
  quick: number
  channel: ChatChannel
}

/** events handed to a pilot coming into the room, at most; chat lines kept for the page */
const EVENTS_FOR_NEWCOMER = 150
const CHAT_KEPT = 60
/** the longest line of chat, and what it may hold: what the pixel font draws */
export const CHAT_MOST = 60
export const cleanChat = (s: string) =>
  String(s)
    .toUpperCase()
    .replace(/[^A-Z0-9 +\-!:./><?,()=%#&']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, CHAT_MOST)

/** another pilot in the room, as the connection screen shows him */
export interface PilotView {
  peer: string
  key: string
  callsign: string
  faction: FactionId
  idle: boolean
  /** ms there and back, if measured */
  rtt: number | null
  /** he flies the computer's ships for the room */
  host: boolean
  /** his look (his portrait: engine races.ts lookText) */
  look: string
  /** his rank (0..5) */
  rank: number
  /** the ship he flies, whether he lets others aboard it and its rooms' furniture; where he is inside (0 not, 1 hangar, 2 deck, 3 a ship) and which */
  hull: string
  open: boolean
  furniture: { id: string; x: number; y: number; face?: Face }[]
  inside: number
  room: number
}

export interface SessionStatus {
  transport: string
  room: string
  copy: number
  /** this game flies the computer's ships */
  host: boolean
  pilots: PilotView[]
  /** peers connected whose card has not come yet */
  connecting: number
  /** this session's connections made, and failed */
  connected: number
  failed: number
  health: LinkHealth
}

/** another pilot's game, as this one knows it */
interface Remote {
  peer: string
  key: string | null
  card: PilotCard | null
  /** ms the card was checked */
  cardAt: number
  snaps: PilotSnap[]
  /** ms the last state came */
  heardAt: number
  /** he said his tab is hidden; and ms since he has been taken to be idle (said, or silent: 0 not idle) */
  saidIdle: boolean
  idleAt: number
  /** his ship in the scene (0: none), whether it is drawn as him under his parachute, and its hull */
  ship: number
  shipOut: boolean
  hull: string
  /** the last of his ships seen lost, and the last whose loss went into the feed */
  downLife: number
  fedLife: number
  /** ms his state first said he was out of a ship still flying here (0: it has not) */
  outSince: number
  rtt: number | null
  /** ms of his last packet claiming the computer's ships */
  claimAt: number
  /** himself on foot in the scene (0: none), and the paint of a ship he flies that is not his own (null: his card's) */
  walker: number
  paint: PilotCard['paint'] | null
  /** his number as a visitor in a place inside (0: none yet) */
  visitor: number
}

/** one of the computer's ships */
interface Computer {
  id: number
  /** its ship in the scene (0: none yet) */
  ship: number
  /** the peer whose game flies it (null: this one) */
  owner: string | null
  snaps: (ComputerSnap & { t: number })[]
  /** ms it was last in a packet */
  seenAt: number
}

/** the clock offset to a peer: the least of the recent (arrival − sending) times, which is the quickest trip plus the clocks' difference */
class Clock {
  private list: number[] = []
  offset = 0
  add(arrived: number, sent: number) {
    this.list.push(arrived - sent)
    if (this.list.length > 60) this.list.shift()
    this.offset = Math.min(...this.list)
  }
}

const markOf = (f: FactionId) => (FACTIONS[f].mark === 'triangle' ? 1 : 2)
/** whose a computer's ship is, as the wire says it: a patrol's side, or '' (a raider's) */
const factionOf = (f: string): '' | FactionId => (f === 'nomarchy' || f === 'anarchoi' ? f : '')
/** a number from a key, the same in every game (a ship's rooms' place) */
const tagOf = (key: string) => parseInt(key.slice(0, 8), 16) >>> 0 || 1
/** a card's paint as the scene wants it: its colours, and its side's mark's colour if the make says it wears it */
function paintOf(c: PilotCard): PilotCard['paint'] & { mark: string } {
  const clean = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : '')
  const p = c.paint ?? ENEMY_PAINT
  return {
    ...ENEMY_PAINT,
    body: clean(p.body) || ENEMY_PAINT.body,
    accent: clean(p.accent) || ENEMY_PAINT.accent,
    canopy: clean(p.canopy) || ENEMY_PAINT.canopy,
    trim: clean(p.trim),
    glow: clean(p.glow),
    trail: clean(p.trail),
    mark: MARK_COLOURS[readMake(String(c.hull ?? ''), typeof c.make === 'string' ? c.make : '').mark] ?? '',
  }
}
/** where a pilot out of his ship is (the wire's number) as the scene names it */
const WALKER_STAGES = ['', 'falling', 'walking', 'dead', 'boarding']
const wrapAngle = (a: number) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2))

/** a list of resources from the wire, checked: known resources, whole numbers of them */
function itemsOf(raw: unknown): Items {
  if (!Array.isArray(raw)) return []
  const out: Items = []
  for (const s of raw) if (s && isResource(s.id) && Number.isInteger(s.n) && s.n > 0 && s.n < 1000) out.push({ id: s.id, n: s.n })
  return out
}

/** a state between two, `u` of the way */
function blend<T extends PilotSnap | ComputerSnap>(a: T, b: T, u: number): T {
  const out = { ...a }
  const l = (p: number, q: number) => p + (q - p) * u
  out.x = l(a.x, b.x)
  out.y = l(a.y, b.y)
  out.height = l(a.height, b.height)
  out.heading = a.heading + wrapAngle(b.heading - a.heading) * u
  out.roll = l(a.roll, b.roll)
  out.pitch = l(a.pitch, b.pitch)
  out.speed = l(a.speed, b.speed)
  out.thrust = l(a.thrust, b.thrust)
  out.hullLeft = l(a.hullLeft, b.hullLeft)
  out.shieldLeft = l(a.shieldLeft, b.shieldLeft)
  out.spin = a.spin >= 0 && b.spin >= a.spin ? l(a.spin, b.spin) : u < 0.5 ? a.spin : b.spin
  // (a pilot out of his ship: himself, between the two)
  if ('fx' in a && 'fx' in b) {
    const o = out as PilotSnap
    o.fx = l(a.fx, b.fx)
    o.fy = l(a.fy, b.fy)
    o.fz = l(a.fz, b.fz)
    o.facing = a.facing + wrapAngle(b.facing - a.facing) * u
    o.walk = l(a.walk, b.walk)
    o.health = l(a.health, b.health)
    o.open = l(a.open, b.open)
  }
  return out
}

/** the state of a ship at time `at` on its sender's clock, from the states that came (null: none yet) */
function sample<T extends (PilotSnap | ComputerSnap) & { t: number }>(snaps: T[], at: number): T | null {
  if (!snaps.length) return null
  let i = snaps.length - 1
  while (i > 0 && snaps[i].t > at) i--
  const a = snaps[i]
  if (at < a.t) return a
  const b = snaps[i + 1]
  if (b) return blend(a, b, (at - a.t) / Math.max(1, b.t - a.t))
  // past the newest: carried on along its heading, briefly
  const ahead = Math.min(at - a.t, EXTRAPOLATE) / 1000
  const on = { ...a, x: a.x + Math.sin(a.heading) * a.speed * ahead, y: a.y - Math.cos(a.heading) * a.speed * ahead }
  if ('fx' in on) {
    const o = on as PilotSnap
    o.fx += Math.sin(o.facing) * o.walk * ahead
    o.fy -= Math.cos(o.facing) * o.walk * ahead
  }
  return on
}

/** keeps a ship's states in order of time, the last 30 */
function keep<T extends { t: number }>(snaps: T[], s: T) {
  let i = snaps.length
  while (i > 0 && snaps[i - 1].t > s.t) i--
  if (i > 0 && snaps[i - 1].t === s.t) return
  snaps.splice(i, 0, s)
  if (snaps.length > 30) snaps.shift()
}

export class Session {
  readonly key: string
  private readonly o: SessionOptions
  private link: Link
  private copy = 1
  private remotes = new Map<string, Remote>()
  private clocks = new Map<string, Clock>()
  private computers = new Map<number, Computer>()
  private outbox: NetEvent[] = []
  /** the signed card, once it is signed, and the peers waiting for it */
  private cardEvent: NostrEvent | null = null
  private cardFor = new Set<string>()
  private seq = 0
  private nextVisitor = 1
  private lastSent = -1e9
  private lastPing = 0
  private joinedAt: number
  private hosting = true
  private shared = false
  private idle = false
  private nextComputer = 1
  /** what this room's waves were, as last heard from the game flying them */
  private waves = { wave: 1, stage: 'rest' as 'rest' | 'fight', timer: 3 }
  /** missiles: (game key, its number) → this scene's number, and back */
  private missileHere = new Map<string, number>()
  private missileFrom = new Map<number, { g: string; n: number }>()
  /** crates: (game key, its number) → this scene's number, and back */
  private crateHere = new Map<string, number>()
  private crateFrom = new Map<number, { g: string; n: number }>()
  /** pilots the player has downed lately: key → ms of each kill */
  private kills = new Map<string, number[]>()
  private madeHere = 0
  private failedHere = 0
  private gone = false
  /** the paint of a ship not his own that the player flies, as last told ('' his own) */
  private flownPaint = ''
  /** signing and checking of cards still under way (see settled) */
  private pending = new Set<Promise<unknown>>()
  /** chat heard (and said) since the page last took it */
  private chat: ChatLine[] = []
  private unlisten: (() => void) | null = null

  constructor(options: SessionOptions) {
    this.o = options
    this.key = publicKeyOf(options.secret)
    this.joinedAt = options.clock()
    this.link = this.join()
    this.sign(options.card)
    // (each event this pilot makes goes to everyone in the room)
    const c = options.chronicle
    if (c) this.unlisten = c.listen((e) => c.own.has(e.id) && this.outbox.push({ t: 'events', list: [e] }))
  }

  // ── the room

  private join() {
    const link = this.o.transport.join(roomName(this.o.zone, this.copy, this.o.test), this.o.cap ?? ROOM_CAP)
    if (this.o.log) note(this.o.log, this.wall(), 'joined', link.room)
    return link
  }

  private wall() {
    return (this.o.wallClock ?? Date.now)()
  }

  /** the room is full: on to the next copy of the zone */
  private moveOn() {
    if (this.copy >= COPIES_MOST) return
    this.dropEveryone()
    this.link.leave()
    this.copy++
    this.joinedAt = this.o.clock()
    this.link = this.join()
  }

  /** every other pilot's ship leaves the scene (the computer's stay, flown here from now on) */
  private dropEveryone() {
    for (const r of this.remotes.values()) {
      if (r.ship) this.o.scene.removeShip(r.ship)
      if (r.walker) this.o.scene.removeWalker(r.walker)
    }
    this.remotes.clear()
    this.clocks.clear()
    this.setShared(false)
  }

  /** leaves the room for good: the player flies on alone */
  leave() {
    if (this.gone) return
    this.dropEveryone()
    this.link.leave()
    this.gone = true
    this.unlisten?.()
    this.takeComputers()
  }

  /** the player's tab is hidden (true) or back (false) */
  setIdle(on: boolean) {
    if (on === this.idle || this.gone) return
    this.idle = on
    this.link.send('sure', packEvents([{ t: 'idle', on }]))
    if (!on) {
      // back: the computer's ships flown here are long out of date; the game flying them now hands them back if they are ours
      if (this.hosting && this.shared) this.release(false)
      this.joinedAt = this.o.clock()
    }
  }

  /** the pilot changed what his card says (another hull, say): it is signed afresh and sent to everyone */
  setCard(card: PilotCard) {
    this.o.card = card
    this.sign(card)
  }

  /** keeps count of asynchronous work until it is done (see settled) */
  private track<T>(work: Promise<T>): Promise<T> {
    this.pending.add(work)
    const done = () => void this.pending.delete(work)
    work.then(done, done)
    return work
  }

  /** resolves once all the signing and checking of cards begun so far has finished (and whatever that set off) */
  async settled() {
    while (this.pending.size) await Promise.allSettled([...this.pending])
  }

  private sign(card: PilotCard) {
    const made = this.track(
      signEvent(this.o.secret, {
        kind: KIND_PILOT_CARD,
        tags: [['t', 'xenophon']],
        content: JSON.stringify(card),
        created_at: Math.floor(this.wall() / 1000),
      }),
    )
    made.then(
      (e) => {
        if (this.o.card !== card || this.gone) return
        this.cardEvent = e
        for (const peer of this.remotes.keys()) this.cardFor.add(peer)
      },
      (err: unknown) => {
        // (no card, no pilot: the others never see this one; the log says why)
        if (this.o.log) note(this.o.log, this.wall(), 'failed', `could not sign the pilot's card: ${String(err)}`)
      },
    )
  }

  // ── once a frame

  update() {
    if (this.gone) return
    const now = this.o.clock()
    this.poll(now)
    this.elect(now)
    if (now - this.lastSent >= SEND_EVERY) {
      this.lastSent = now
      this.sendOwn(now)
      if (this.hosting && this.shared) this.sendComputers(now, false)
    }
    if (now - this.lastPing > PING_EVERY && this.shared) {
      this.lastPing = now
      this.outbox.push({ t: 'ping', at: now })
    }
    this.drivePilots(now)
    this.visitors(now)
    this.driveComputers(now)
    this.passReports()
    this.flush()
  }

  private flush() {
    if (this.cardEvent && this.cardFor.size) {
      const card = packEvents([{ t: 'card', card: this.cardEvent }])
      for (const peer of this.cardFor) this.link.send('sure', card, peer)
      this.cardFor.clear()
    }
    if (this.outbox.length) {
      this.link.send('sure', packEvents(this.outbox))
      this.outbox = []
    }
  }

  private setShared(on: boolean) {
    if (on === this.shared) return
    this.shared = on
    this.o.scene.setRoom({ shared: on })
    // alone again: this game flies whatever the computer has here
    if (!on) this.takeComputers()
  }

  // ── what comes in

  private poll(now: number) {
    for (const h of this.link.poll()) {
      switch (h.kind) {
        case 'join': {
          this.madeHere++
          if (this.o.log) note(this.o.log, this.wall(), 'connected', h.peer)
          this.remotes.set(h.peer, {
            peer: h.peer,
            key: null,
            card: null,
            cardAt: 0,
            snaps: [],
            heardAt: now,
            saidIdle: false,
            idleAt: 0,
            ship: 0,
            shipOut: false,
            hull: '',
            downLife: -1,
            fedLife: -1,
            outSince: 0,
            rtt: null,
            claimAt: -1e9,
            walker: 0,
            paint: null,
            visitor: 0,
          })
          this.cardFor.add(h.peer)
          break
        }
        case 'leave': {
          const r = this.remotes.get(h.peer)
          if (this.o.log) note(this.o.log, this.wall(), 'left', h.peer)
          if (r?.card) this.news(`${r.card.callsign} LEFT`, r.card.faction)
          if (r?.ship) this.o.scene.removeShip(r.ship)
          if (r?.walker) this.o.scene.removeWalker(r.walker)
          this.remotes.delete(h.peer)
          this.clocks.delete(h.peer)
          break
        }
        case 'failed':
          this.failedHere++
          if (this.o.log) note(this.o.log, this.wall(), 'failed', `${h.peer}: ${h.why}`)
          break
        case 'full':
          if (this.o.log) note(this.o.log, this.wall(), 'full', this.link.room)
          if (this.remotes.size === 0) this.moveOn()
          return
        case 'message':
          this.receive(now, h.peer, h.data)
          break
      }
    }
    this.setShared([...this.remotes.values()].some((r) => r.card))
  }

  private clockOf(peer: string) {
    let c = this.clocks.get(peer)
    if (!c) this.clocks.set(peer, (c = new Clock()))
    return c
  }

  private receive(now: number, peer: string, data: Uint8Array) {
    const r = this.remotes.get(peer)
    if (!r) return
    if (data[0] === MSG_PILOT) {
      const s = unpackPilot(data)
      if (!s) return
      this.clockOf(peer).add(now, s.t)
      keep(r.snaps, s)
      r.heardAt = now
      if (!r.saidIdle) r.idleAt = 0
    } else if (data[0] === MSG_COMPUTER) {
      const p = unpackComputer(data)
      if (p) this.receiveComputers(now, r, p)
    } else if (data[0] === MSG_EVENTS) {
      for (const e of unpackEvents(data)) this.event(now, r, e)
    }
  }

  private receiveComputers(now: number, r: Remote, p: ComputerPacket) {
    this.clockOf(r.peer).add(now, p.t)
    if (p.host) r.claimAt = now
    if (p.handover) r.claimAt = -1e9
    if (p.host || p.handover) this.waves = { wave: p.wave, stage: p.stage, timer: p.timer }
    if (p.host && !this.hosting) this.o.scene.setRoom({ wave: p.wave, stage: p.stage, timer: p.timer, cleared: p.cleared })
    // (handed over: which bands are beaten, for this game to keep them so)
    if (p.handover) this.o.scene.setRoom({ cleared: p.cleared })
    for (const s of p.ships) {
      let c = this.computers.get(s.id)
      if (c && c.owner === null) continue // flown here
      if (!c) this.computers.set(s.id, (c = { id: s.id, ship: 0, owner: r.peer, snaps: [], seenAt: now }))
      // (another game flies it now: its states are on that game's clock)
      if (c.owner !== r.peer) c.snaps = []
      c.owner = r.peer
      c.seenAt = now
      keep(c.snaps, { ...s, t: p.t })
    }
  }

  private event(now: number, r: Remote, e: NetEvent) {
    const scene = this.o.scene
    switch (e.t) {
      case 'card':
        void this.track(this.readCard(r, e.card))
        break
      case 'idle':
        r.saidIdle = !!e.on
        r.idleAt = e.on ? now : 0
        break
      case 'mine':
        if (r.ship && Array.isArray(e.p)) scene.addMine(r.ship, Number(e.n) | 0, e.p[0], e.p[1], e.p[2])
        break
      case 'mineEnd':
        if (r.ship) scene.endMine(r.ship, Number(e.n) | 0)
        break
      case 'squad':
        if (!r.key || e.to !== this.key) break
        if (e.ask) {
          if (!this.asked.includes(r.key)) this.asked = [...this.asked, r.key].slice(-6)
        } else this.joinSquad([r.key])
        break
      case 'squadIs': {
        if (!r.key) break
        const keys = Array.isArray(e.keys) ? e.keys.filter((k): k is string => typeof k === 'string') : []
        // (he left: he is out of this one's squad; else, if it is this pilot's squad (he is in it, or the sender is in his), the lists join)
        if (!keys.length) this.squad = this.squad.filter((k) => k !== r.key)
        else if (keys.includes(this.key) || this.squad.includes(r.key))
          this.squad = [...new Set([...this.squad, ...keys])].filter((k) => k !== this.key).slice(0, SQUAD.most - 1)
        break
      }
      case 'ping':
        this.link.send('sure', packEvents([{ t: 'pong', at: e.at }]), r.peer)
        break
      case 'pong':
        r.rtt = Math.max(0, now - e.at)
        break
      case 'hit': {
        const target = this.here(e.target, !!e.foot)
        if (target < 0 || !Array.isArray(e.d)) break
        scene.hit(target, Number(e.amount) || 0, this.here(e.by), +e.d[0] || 0, +e.d[1] || 0, +e.d[2] || 0, !!e.hull, !!e.foot)
        break
      }
      case 'died': {
        // his pilot on foot is dead: it shows, and scores for whoever killed him
        if (r.walker) scene.walkerDied(r.walker, this.here(e.by), e.by === this.key && r.key ? this.worth(r.key, now) : 1)
        if (r.key) this.feed(e.by ?? null, r.key, false, 'DIED')
        break
      }
      case 'beast':
        if (Number.isInteger(e.c) && Number.isFinite(e.u) && e.c >= 0) scene.beastKilled(e.c, e.u)
        break
      case 'vein':
        if (Number.isInteger(e.v) && Number.isInteger(e.e) && Number.isInteger(e.n) && e.n > 0 && e.n < 100) scene.veinMined(e.v, e.e, e.n)
        break
      case 'steal': {
        // someone climbing into this pilot's parked ship: it is his, if it still stands empty
        if (e.who !== this.key || !r.key) break
        const items = scene.yieldShip()
        this.outbox.push(items ? { t: 'stolen', by: r.key, items } : { t: 'stealNo', by: r.key })
        break
      }
      case 'stolen':
        // its owner gave his ship up: to this pilot (he climbs in), or to another (it is gone from where it stood)
        if (e.by === this.key && r.ship) scene.stealGranted(r.ship, itemsOf(e.items), r.card?.callsign ?? '?')
        if (r.ship) {
          if (e.by !== this.key) scene.removeShip(r.ship)
          r.ship = 0
        }
        break
      case 'stealNo':
        if (e.by === this.key) scene.stealFailed()
        break
      case 'paint':
        r.paint = e.paint && typeof e.paint === 'object' ? { ...ENEMY_PAINT, ...e.paint } : null
        if (r.ship && r.card) scene.updateShip(r.ship, { paint: r.paint ?? r.card.paint })
        break
      case 'beacon':
        if (Array.isArray(e.p) && r.key && r.card)
          scene.addBeacon(r.key, +e.p[0] || 0, +e.p[1] || 0, +e.p[2] || 0, r.card.callsign, FACTIONS[r.card.faction].colour)
        break
      case 'flare':
        if (Array.isArray(e.p) && r.card) scene.addFlare(+e.p[0] || 0, +e.p[1] || 0, +e.p[2] || 0, FACTIONS[r.card.faction].colour)
        break
      case 'down':
        this.downed(now, e.who, e.by, Number(e.life) || 0, !!e.parked, Math.max(0, Math.min(100_000, Number(e.bounty) || 0)))
        break
      case 'events':
        if (Array.isArray(e.list)) this.o.chronicle?.receive(e.list.slice(0, 400))
        break
      case 'chat':
      case 'quick': {
        if (!r.key || !r.card) break
        const text = e.t === 'chat' ? cleanChat(e.text) : ''
        const n = e.t === 'quick' ? Number(e.n) | 0 : -1
        if (e.t === 'chat' && !text) break
        // (said to his side or his squad: sent only to them; a side's line from the other side is not believed)
        const channel = e.to === 'squad' ? 'squad' : e.to === 'side' ? 'side' : 'room'
        if (channel === 'side' && r.card.faction !== this.o.card.faction) break
        this.hear({ at: now, key: r.key, callsign: r.card.callsign, faction: r.card.faction, text, quick: n, channel })
        break
      }
      case 'missile': {
        if (!r.key) break
        const from = this.here(e.from)
        const target = this.here(e.target)
        if (from <= 0 || target < 0) break
        const tag = scene.launchMissile(from, target)
        if (tag) {
          this.missileHere.set(`${r.key}:${e.n}`, tag)
          this.missileFrom.set(tag, { g: r.key, n: e.n })
          // (a missile lives a few seconds: the oldest of many are forgotten)
          if (this.missileFrom.size > MISSILES_KEPT) {
            const [oldTag, old] = this.missileFrom.entries().next().value!
            this.missileFrom.delete(oldTag)
            this.missileHere.delete(`${old.g}:${old.n}`)
          }
        }
        break
      }
      case 'mEnd': {
        const tag = e.g === this.key ? e.n : this.missileHere.get(`${e.g}:${e.n}`)
        if (tag && Array.isArray(e.p)) scene.endMissile(tag, +e.p[0] || 0, +e.p[1] || 0, +e.p[2] || 0, !!e.dodged)
        break
      }
      case 'mined':
        if (Number.isInteger(e.o) && Number.isInteger(e.e) && Number.isInteger(e.n) && e.n > 0 && e.n < 100) scene.mined(e.o, e.e, e.n)
        break
      case 'crate': {
        if (!r.key || !Array.isArray(e.p) || !Number.isInteger(e.n)) break
        const tag = scene.addCrate(+e.p[0] || 0, +e.p[1] || 0, +e.p[2] || 0, itemsOf(e.items))
        this.rememberCrate(tag, r.key, e.n)
        break
      }
      case 'crateTaken': {
        const tag = e.g === this.key ? e.n : this.crateHere.get(`${e.g}:${e.n}`)
        if (tag) scene.crateChanged(tag, itemsOf(e.left))
        break
      }
    }
  }

  /** a crate here (`tag`) is crate `n` of game `g` */
  private rememberCrate(tag: number, g: string, n: number) {
    this.crateHere.set(`${g}:${n}`, tag)
    this.crateFrom.set(tag, { g, n })
    if (this.crateFrom.size > CRATES_KEPT) {
      const [oldTag, old] = this.crateFrom.entries().next().value!
      this.crateFrom.delete(oldTag)
      this.crateHere.delete(`${old.g}:${old.n}`)
    }
  }

  private async readCard(r: Remote, card: NostrEvent) {
    if (!(await verifyEvent(card)) || card.kind !== KIND_PILOT_CARD || card.pubkey === this.key) return
    let c: PilotCard
    try {
      c = JSON.parse(card.content)
    } catch {
      return
    }
    if (typeof c?.callsign !== 'string' || !(c.faction in FACTIONS)) return
    if (this.remotes.get(r.peer) !== r) return
    if (r.key && r.key !== card.pubkey && r.ship) {
      // (another pilot at the same peer: the old one's ship goes)
      this.o.scene.removeShip(r.ship)
      r.ship = 0
    }
    if (!r.key) {
      r.cardAt = this.o.clock()
      this.news(`${c.callsign.slice(0, 16)} IS HERE`, c.faction)
      // (someone new: he is handed the newest of the persistent world's events)
      const kept = this.o.chronicle
      if (kept) this.link.send('sure', packEvents([{ t: 'events', list: kept.forNewcomer(EVENTS_FOR_NEWCOMER) }]), r.peer)
    }
    r.key = card.pubkey
    r.card = {
      callsign: c.callsign.slice(0, 16),
      faction: c.faction,
      hull: String(c.hull ?? ''),
      paint: paintOf(c),
      make: typeof c.make === 'string' ? c.make.slice(0, 160) : '',
      open: c.open === true,
      furniture: Array.isArray(c.furniture)
        ? c.furniture
            .filter((f) => f && typeof f.id === 'string' && Number.isFinite(f.x) && Number.isFinite(f.y))
            .slice(0, 60)
            .map((f) => ({ id: f.id.slice(0, 16), x: f.x | 0, y: f.y | 0, ...(isFace(f.face) ? { face: f.face } : {}) }))
        : [],
      look: typeof c.look === 'string' ? c.look.slice(0, 40) : '',
      rank: Math.max(0, Math.min(5, Number(c.rank) | 0)),
    }
    if (r.ship)
      this.o.scene.updateShip(r.ship, {
        paint: r.paint ?? r.card.paint,
        make: r.paint ? '' : r.card.make,
        label: r.card.callsign,
        look: r.card.look,
      })
    if (r.walker) this.o.scene.updateWalker(r.walker, { look: r.card.look, label: r.card.callsign })
  }

  // ── who is who: an event's names, as this scene's ship ids, and back

  /** a name from an event → this scene's id for it (0 the player, −1 nobody or unknown); `foot`: the pilot on foot, not his ship */
  private here(who: Who, foot = false): number {
    if (who === null || who === undefined) return -1
    if (who === this.key) return 0
    if (typeof who === 'number') return this.computers.get(who)?.ship || -1
    for (const r of this.remotes.values()) if (r.key === who) return (foot ? r.walker : r.ship || r.walker) || -1
    return -1
  }

  /** this scene's id → a name for events */
  private who(id: number): Who {
    if (id === 0 || id === PARKED_ID) return this.key
    if (id < 0) return null
    for (const r of this.remotes.values()) if (r.ship === id || r.walker === id) return r.key
    for (const c of this.computers.values()) if (c.ship === id) return c.id
    return null
  }

  /** true for an id here that is another pilot on foot */
  private onFoot(id: number) {
    for (const r of this.remotes.values()) if (r.walker && r.walker === id) return true
    return false
  }

  private remoteByKey(key: Who) {
    for (const r of this.remotes.values()) if (r.key === key) return r
    return null
  }

  // ── what goes out

  private sendOwn(now: number) {
    if (this.idle) return
    const p = this.o.scene.pilot
    const s: PilotSnap = { ...p, t: now, seq: this.seq++, room: this.roomTag(p.inside) }
    this.link.send('fast', packPilot(s))
    // (flying a ship that is not his own: the others are told its paint, and told again when it is his own once more)
    const paint = p.flownPaint ? JSON.stringify(p.flownPaint) : ''
    if (paint !== this.flownPaint) {
      this.flownPaint = paint
      this.outbox.push({ t: 'paint', paint: p.flownPaint })
    }
  }

  /** which place inside the pilot is in, as a number others in the same one share: a deck by its base, a ship's rooms by its owner's key (his hangar is his alone) */
  private roomTag(inside: number) {
    const scene = this.o.scene
    if (inside === 2) return scene.loop.base?.id ?? 0
    if (inside === 3) return tagOf(scene.interior.owner || this.key)
    return 0
  }

  /** the other pilots in the same place inside as this one, told to the scene */
  private visitors(now: number) {
    const scene = this.o.scene
    const p = scene.pilot
    if (!p.inside) return
    const room = this.roomTag(p.inside)
    const list: Parameters<Scene['setVisitors']>[0] = []
    for (const r of this.remotes.values()) {
      if (!r.card || !r.key) continue
      const s = sample(r.snaps, now - this.clockOf(r.peer).offset - DELAY)
      if (!s || s.inside !== p.inside || s.room !== room || p.inside === 1) continue
      if (!r.visitor) r.visitor = this.nextVisitor++
      list.push({ id: r.visitor, x: s.fx, y: s.fy, facing: s.facing, walk: s.walk, look: r.card.look ?? '', side: r.card.faction })
    }
    scene.setVisitors(list)
  }

  // ── squads: up to four pilots; asked and answered by events, the squad's list passed round whenever it changes

  /** the other pilots in his squad (by key), and those who asked him into theirs */
  squad: string[] = []
  asked: string[] = []

  /** asks a pilot in the room to fly with him */
  invite(key: string) {
    if (this.squad.length >= SQUAD.most - 1 || this.squad.includes(key)) return
    this.outbox.push({ t: 'squad', to: key, ask: true })
  }
  /** says yes to a pilot who asked: his squad is this one's now */
  accept(key: string) {
    if (!this.asked.includes(key)) return
    this.asked = this.asked.filter((k) => k !== key)
    this.outbox.push({ t: 'squad', to: key, ask: false })
    this.joinSquad([key])
  }
  /** leaves the squad (the others are told) */
  leaveSquad() {
    this.squad = []
    this.outbox.push({ t: 'squadIs', keys: [] })
  }
  /** pilots join the squad: the whole list goes round */
  private joinSquad(keys: string[]) {
    const all = [...new Set([...this.squad, ...keys])].filter((k) => k !== this.key).slice(0, SQUAD.most - 1)
    if (all.length === this.squad.length && all.every((k) => this.squad.includes(k))) return
    this.squad = all
    this.outbox.push({ t: 'squadIs', keys: [this.key, ...all] })
  }
  /** the ship (this scene's id) of a pilot by key (0: none here) */
  shipOf(key: string) {
    for (const r of this.remotes.values()) if (r.key === key) return r.ship
    return 0
  }

  /** the computer's ships this game flies, for the others (on the sure lane, when handing them over) */
  private sendComputers(now: number, handover: boolean) {
    const scene = this.o.scene
    const ships: ComputerSnap[] = []
    const mine = new Set<number>()
    for (const s of scene.listShips()) {
      // (the computer's ships this game flies: raiders, and patrols of either side; a training drone and the haulers are this game's alone: the others never hear of them)
      if (s.remote || s.wave <= 0 || s.drill || s.traffic || s.side < 0) continue
      let c = [...this.computers.values()].find((c) => c.ship === s.id)
      if (!c) {
        // a new one, sent by this game's waves: it gets a number no other game will give
        const id = ((parseInt(this.key.slice(0, 4), 16) << 16) | (this.nextComputer++ & 0xffff)) >>> 0
        this.computers.set(id, (c = { id, ship: s.id, owner: null, snaps: [], seenAt: now }))
      }
      mine.add(c.id)
      ships.push({ ...s, id: c.id, faction: factionOf(s.faction) })
    }
    // ones flown here that are gone (shot down, or flew home) are forgotten
    for (const c of this.computers.values()) if (c.owner === null && !mine.has(c.id)) this.computers.delete(c.id)
    const k = scene.status.skirmish
    const packet: ComputerPacket = {
      t: now,
      seq: this.seq++,
      host: !handover,
      handover,
      wave: k.wave,
      stage: k.stage === 'fight' ? 'fight' : 'rest',
      timer: k.timer,
      ships,
      cleared: scene.clearedBands(),
    }
    this.link.send(handover ? 'sure' : 'fast', packComputer(packet))
  }

  private passReports() {
    for (const r of this.o.scene.takeReports()) this.passReport(r)
  }

  private passReport(r: Report) {
    switch (r.kind) {
      case 'hit': {
        const target = this.who(r.target)
        if (target !== null)
          this.outbox.push({
            t: 'hit',
            target,
            by: this.who(r.by),
            amount: r.amount,
            d: [r.dx, r.dy, r.dz],
            hull: r.hull,
            ...(this.onFoot(r.target) ? { foot: true } : {}),
          })
        break
      }
      case 'down': {
        if (r.target === PARKED_ID) {
          // the player's ship, standing empty, shot to pieces: no feed (he lives)
          this.outbox.push({ t: 'down', who: this.key, by: this.who(r.by), life: (this.o.scene.pilot.life - 1) & 255, parked: true })
        } else if (r.target === 0) {
          // the player's ship is lost: (his life has already moved on to the next one)
          const life = (this.o.scene.pilot.life - 1) & 255
          const by = this.who(r.by)
          const bounty = this.o.bounty?.() ?? 0
          this.outbox.push({ t: 'down', who: this.key, by, life, ...(bounty > 0 ? { bounty } : {}) })
          this.feed(by, this.key, true)
        } else {
          const who = this.who(r.target)
          if (typeof who === 'number') {
            this.outbox.push({ t: 'down', who, by: this.who(r.by), life: 0 })
            this.computers.delete(who)
          }
        }
        break
      }
      case 'missile':
        this.outbox.push({ t: 'missile', n: r.tag, from: this.who(r.from), target: this.who(r.target) })
        break
      case 'missileEnd': {
        const from = this.missileFrom.get(r.tag) ?? { g: this.key, n: r.tag }
        this.outbox.push({ t: 'mEnd', g: from.g, n: from.n, p: [r.x, r.y, r.z], dodged: r.dodged })
        break
      }
      case 'mined':
        this.outbox.push({ t: 'mined', o: r.outcrop, e: r.epoch, n: r.n })
        break
      case 'crate':
        // (a crate spilled here is known to the others by this game's number for it)
        this.rememberCrate(r.tag, this.key, r.tag)
        this.outbox.push({ t: 'crate', n: r.tag, p: [r.x, r.y, r.z], items: r.items })
        break
      case 'crateTaken': {
        const from = this.crateFrom.get(r.tag) ?? { g: this.key, n: r.tag }
        this.outbox.push({ t: 'crateTaken', g: from.g, n: from.n, left: r.left })
        break
      }
      case 'died': {
        const by = this.who(r.by)
        this.outbox.push({ t: 'died', by })
        this.feed(by, this.key, true, 'DIED')
        break
      }
      case 'vein':
        this.outbox.push({ t: 'vein', v: r.vein, e: r.epoch, n: r.n })
        break
      case 'beast':
        this.outbox.push({ t: 'beast', c: r.id, u: r.until })
        break
      case 'steal': {
        const who = this.who(r.target)
        if (typeof who === 'string') this.outbox.push({ t: 'steal', who })
        else this.o.scene.stealFailed()
        break
      }
      case 'beacon':
        this.outbox.push({ t: 'beacon', p: [r.x, r.y, r.z] })
        break
      case 'flare':
        this.outbox.push({ t: 'flare', p: [r.x, r.y, r.z] })
        break
      case 'mine':
        this.outbox.push({ t: 'mine', n: r.tag, p: [r.x, r.y, r.z] })
        break
      case 'mineEnd':
        this.outbox.push({ t: 'mineEnd', n: r.tag })
        break
    }
  }

  // ── losses, and the feed

  /** another game says a ship of its own was lost (a pilot's `life`-th, or one of the computer's) */
  private downed(now: number, who: Who, by: Who, life: number, parked = false, bounty = 0) {
    const scene = this.o.scene
    const byHere = this.here(by)
    if (typeof who === 'number') {
      const c = this.computers.get(who)
      if (c?.ship) scene.shootDown(c.ship, byHere, 1)
      this.computers.delete(who)
      return
    }
    const r = this.remoteByKey(who)
    if (!r) return
    if (parked) {
      // his ship, standing empty, shot to pieces where it stood (he lives: no feed)
      if (r.ship && !r.shipOut) scene.shootDown(r.ship, byHere, 1)
      r.ship = 0
      r.downLife = life
      return
    }
    if (r.downLife !== life && r.ship && !r.shipOut) {
      scene.shootDown(r.ship, byHere, by === this.key ? this.worth(r.key!, now) : 1)
      r.ship = 0
    }
    r.downLife = life
    r.outSince = 0
    if (r.fedLife !== life) {
      r.fedLife = life
      this.feed(by, who, false)
      // (the price on his head, to whoever downed him: once a life)
      if (bounty > 0 && by === this.key) this.o.onEarn?.(bounty, `bounty on ${r.card?.callsign ?? '?'}`)
    }
  }

  /** what downing pilot `key` is worth to the player now (the farming limit), counting this kill */
  private worth(key: string, now: number) {
    const list = (this.kills.get(key) ?? []).filter((t) => now - t < FARM_WINDOW)
    const worth = FARM_WORTH[Math.min(list.length, FARM_WORTH.length - 1)]
    list.push(now)
    this.kills.set(key, list)
    return worth
  }

  /** a line in the kill feed: `by` downed `who` (by nobody: a crash) */
  private feed(by: Who, who: Who, mine: boolean, how = '') {
    const name = (k: Who): { mark?: number; face?: string; text: string; color: string } | null => {
      if (k === null) return null
      if (typeof k === 'number') return { text: 'RAIDER', color: FOE }
      const card = k === this.key ? this.o.card : this.remoteByKey(k)?.card
      const faction = card?.faction
      if (!faction) return null
      const friend = faction === this.o.card.faction
      return {
        mark: markOf(faction),
        face: card?.look || undefined,
        text: k === this.key ? 'YOU' : (card?.callsign ?? '?'),
        color: k === this.key ? YOU : friend ? INK : FOE,
      }
    }
    const victim = name(who)
    if (!victim) return
    const killer = name(by)
    const parts: FeedLine['parts'] = []
    const add = (n: { mark?: number; face?: string; text: string; color: string }) => {
      if (n.face) parts.push({ face: n.face, color: n.color })
      if (n.mark) parts.push({ mark: n.mark, color: FACTIONS[n.mark === 1 ? 'nomarchy' : 'anarchoi'].colour })
      parts.push({ text: n.text, color: n.color })
    }
    if (killer) {
      add(killer)
      parts.push({ text: '>', color: DIM })
      add(victim)
    } else {
      add(victim)
      parts.push({ text: how || (mine ? 'CRASHED' : 'WENT DOWN'), color: DIM })
    }
    this.o.scene.addFeed({ parts })
    // (and in the chat's news, kept: the feed's lines fade in seconds)
    const side = (k: Who) => (typeof k === 'string' ? (k === this.key ? this.o.card : this.remoteByKey(k)?.card)?.faction : undefined)
    const said = killer
      ? `${killer.text} DOWNED ${victim.text}`
      : `${victim.text} ${how === 'DIED' ? 'DIED' : how || (mine ? 'CRASHED' : 'WENT DOWN')}`
    this.news(said, side(by) ?? side(who) ?? this.o.card.faction)
  }

  // ── the other pilots' ships, drawn

  private drivePilots(now: number) {
    const scene = this.o.scene
    for (const r of this.remotes.values()) {
      if (!r.card || !r.key) continue
      // quiet for too long: idle, as if he had said so; idle for long enough, his ship goes
      if (!r.idleAt && now - r.heardAt > SILENT) r.idleAt = now
      const idle = r.idleAt > 0
      if (idle && now - r.idleAt > IDLE_GONE) {
        if (r.ship) scene.removeShip(r.ship)
        if (r.walker) scene.removeWalker(r.walker)
        r.ship = 0
        r.walker = 0
        continue
      }
      const s = sample(r.snaps, now - this.clockOf(r.peer).offset - DELAY)
      if (!s) continue
      const card = r.card
      const side = card.faction === this.o.card.faction ? 0 : 2
      const look = {
        label: card.callsign,
        mark: markOf(card.faction),
        markColor: FACTIONS[card.faction].colour,
        idle,
      }
      this.driveWalker(r, s, side, look)
      const place = { x: s.x, y: s.y, height: s.height, heading: s.heading }
      if (s.out) {
        if (r.ship && !r.shipOut) {
          // out of a ship still flying here: word of who downed him is on its way; if it does not come, it goes down anyway
          if (!r.outSince) r.outSince = now
          if (now - r.outSince < DOWN_GRACE) continue
          scene.shootDown(r.ship, -1, 1)
          r.ship = 0
          r.downLife = (s.life - 1) & 255
        }
        if (!r.ship) {
          r.ship = scene.addShip({ ...look, ...place, paint: card.paint, look: card.look, speed: 13, hull: s.hull, side, out: true })
          r.shipOut = true
          r.hull = s.hull
        } else scene.updateShip(r.ship, { ...place, idle })
        continue
      }
      if (!s.flying && s.ship !== 2) {
        // no ship of his stands: it was lost (word of it is on its way, or came), stolen, or is on its way to him
        if (r.ship && !r.shipOut) {
          if (!r.outSince) r.outSince = now
          if (now - r.outSince < DOWN_GRACE) continue
          scene.shootDown(r.ship, -1, 1)
        } else if (r.ship) scene.removeShip(r.ship)
        r.ship = 0
        r.outSince = 0
        continue
      }
      r.outSince = 0
      const parked = !s.flying && s.ship === 2
      const motion = {
        ...place,
        roll: s.roll,
        pitch: s.pitch,
        speed: parked ? 0 : s.speed,
        thrust: parked ? 0 : s.thrust,
        spin: s.spin,
        spinDir: s.spinDir,
        firing: s.firing && !idle && !parked,
        hullLeft: s.hullLeft,
        shieldLeft: s.shieldLeft,
        protect: s.protect,
        idle,
        loaded: s.loaded,
        landing: s.landing,
        mining: s.mining,
        parked,
      }
      const paint = r.paint ?? card.paint
      if (!r.ship) {
        r.ship = scene.addShip({
          ...look,
          ...motion,
          paint,
          make: r.paint ? '' : card.make,
          look: card.look,
          hull: s.hull,
          side,
          remote: true,
        })
        r.hull = s.hull
        r.shipOut = false
      } else {
        const change =
          r.shipOut || r.hull !== s.hull ? { out: false, hull: s.hull, side, remote: true, paint, make: r.paint ? '' : card.make } : {}
        scene.updateShip(r.ship, { ...motion, ...change })
        r.shipOut = false
        r.hull = s.hull
      }
    }
  }

  /** a pilot out of his ship, as the others see him: coming down, on foot, dead, or climbing into a ship */
  private driveWalker(r: Remote, s: PilotSnap, side: number, look: { label: string; mark: number; markColor: string; idle: boolean }) {
    const scene = this.o.scene
    if (!s.foot) {
      if (r.walker) scene.removeWalker(r.walker)
      r.walker = 0
      return
    }
    const input = {
      ...look,
      x: s.fx,
      y: s.fy,
      height: s.fz,
      heading: s.facing,
      speed: s.walk,
      stage: WALKER_STAGES[s.foot] ?? 'walking',
      look: r.card?.look ?? '',
      side,
      hidden: s.hidden,
      wading: s.wading,
      firing: s.shooting && !look.idle,
      mining: s.cutting,
      open: s.open,
      healthLeft: s.health,
    }
    if (!r.walker) r.walker = scene.addWalker(input)
    else scene.updateWalker(r.walker, input)
  }

  // ── the computer's ships

  private driveComputers(now: number) {
    const scene = this.o.scene
    for (const c of this.computers.values()) {
      if (c.owner === null) continue
      // gone from its host's packets while they still come: it is gone (shot down, or flown home);
      // no word of it at all for long (its host went quiet, and no one took it on): let go
      const host = this.remotes.get(c.owner)
      if ((host && host.claimAt - c.seenAt > COMPUTER_MISSING) || now - c.seenAt > COMPUTER_STALE) {
        if (c.ship) scene.removeShip(c.ship)
        this.computers.delete(c.id)
        continue
      }
      const s = sample(c.snaps, now - this.clockOf(c.owner).offset - DELAY)
      if (!s) continue
      const motion = {
        x: s.x,
        y: s.y,
        height: s.height,
        heading: s.heading,
        roll: s.roll,
        pitch: s.pitch,
        speed: s.speed,
        thrust: s.thrust,
        spin: s.spin,
        spinDir: s.spinDir,
        firing: s.firing,
        hullLeft: s.hullLeft,
        shieldLeft: s.shieldLeft,
      }
      const who = this.computerLooks(s.faction)
      if (!c.ship) c.ship = scene.addShip({ ...motion, ...who, band: s.band, hull: s.hull, remote: true, lurk: s.lurk })
      else scene.updateShip(c.ship, { ...motion, hull: s.hull, side: who.side, remote: true, lurk: s.lurk })
    }
  }

  /** how one of the computer's ships stands here: a raider against everyone, a patrol on its side (his, or the other), in its side's colours and mark */
  private computerLooks(faction: string) {
    if (faction !== 'nomarchy' && faction !== 'anarchoi') return { side: 1, paint: ENEMY_PAINT, mark: 0, markColor: '' }
    const side = faction === this.o.card.faction ? 0 : 2
    return { side, paint: BAND_PAINT[faction], mark: markOf(faction), markColor: SIDE_COLOURS[faction] }
  }

  // ── who flies the computer's ships

  /** the pilots who may fly them: this one, and every other whose card came a while ago and who is not idle */
  private candidates(now: number) {
    const list: { key: string; peer: string | null }[] = []
    if (!this.idle) list.push({ key: this.key, peer: null })
    for (const r of this.remotes.values())
      if (r.key && r.card && !r.idleAt && now - r.cardAt >= READY) list.push({ key: r.key, peer: r.peer })
    return list
  }

  private elect(now: number) {
    if (!this.shared) {
      if (!this.hosting) this.takeComputers()
      return
    }
    const list = this.candidates(now)
    if (!list.length) return
    const lowest = list.reduce((a, b) => (b.key < a.key ? b : a))
    if (this.hosting) {
      // another, ready, with a lower key: he takes them on
      if (lowest.peer !== null) {
        this.release(true)
        return
      }
      // ships another game handed over, or flew until it went quiet: taken on here
      for (const c of this.computers.values())
        if (c.owner !== null && !this.claims(c.owner, now)) {
          this.takeComputers()
          break
        }
      return
    }
    // still flown by a game whose claim stands: wait for it to hand them over
    const claimed = [...this.remotes.keys()].some((peer) => this.claims(peer, now))
    if (lowest.peer === null && !claimed && now - this.joinedAt >= READY) this.takeComputers()
  }

  /** true while the game at `peer` says it flies the computer's ships, and is not idle */
  private claims(peer: string, now: number) {
    const r = this.remotes.get(peer)
    return !!r && now - r.claimAt < CLAIM_LAPSES && !r.idleAt
  }

  /** this game flies the computer's ships from now on: every one known is taken over from the last state heard */
  private takeComputers() {
    const scene = this.o.scene
    this.hosting = true
    scene.setRoom({ host: true, ...this.waves })
    for (const c of this.computers.values()) {
      if (c.owner === null) continue
      const last = c.snaps[c.snaps.length - 1]
      c.owner = null
      if (!last) continue
      const s = sample(c.snaps, last.t) ?? last
      const at = { x: s.x, y: s.y, height: s.height, heading: s.heading, speed: s.speed, hull: s.hull, ...this.computerLooks(s.faction) }
      if (!c.ship) c.ship = scene.addShip(at)
      scene.updateShip(c.ship, {
        ...at,
        band: s.band,
        remote: false,
        pilot: Math.max(1, s.wave),
        hullLeft: s.hullLeft,
        shieldLeft: s.shieldLeft,
      })
    }
  }

  /** this game stops flying the computer's ships (`tell`: handing them over to the next, who is told their state) */
  private release(tell: boolean) {
    const now = this.o.clock()
    if (tell) this.sendComputers(now, true)
    this.hosting = false
    const scene = this.o.scene
    const k = scene.status.skirmish
    this.waves = { wave: k.wave, stage: k.stage === 'fight' ? 'fight' : 'rest', timer: k.timer }
    scene.setRoom({ host: false })
    for (const c of this.computers.values()) {
      if (c.owner !== null || !c.ship) continue
      scene.updateShip(c.ship, { remote: true, pilot: 0 })
      // (until the next game's packets come, it is carried on from where it was, on this game's clock)
      c.owner = ''
      c.seenAt = now
      c.snaps = []
      const s = scene.listShips().find((x) => x.id === c.ship)
      if (s) keep(c.snaps, { ...s, id: c.id, t: now - DELAY, faction: factionOf(s.faction) })
    }
  }

  // ── for the connection screen

  status(): SessionStatus {
    const pilots: PilotView[] = []
    let connecting = 0
    const now = this.o.clock()
    for (const r of this.remotes.values()) {
      if (!r.key || !r.card) {
        connecting++
        continue
      }
      pilots.push({
        peer: r.peer,
        key: r.key,
        callsign: r.card.callsign,
        faction: r.card.faction,
        idle: r.idleAt > 0,
        rtt: r.rtt,
        host: now - r.claimAt < CLAIM_LAPSES,
        look: r.card.look ?? '',
        rank: r.card.rank ?? 0,
        hull: r.card.hull,
        open: !!r.card.open,
        furniture: (r.card.furniture ?? []).map((f) => ({ id: f.id, x: f.x, y: f.y, ...(isFace(f.face) ? { face: f.face } : {}) })),
        inside: r.snaps[r.snaps.length - 1]?.inside ?? 0,
        room: r.snaps[r.snaps.length - 1]?.room ?? 0,
      })
    }
    return {
      transport: this.o.transport.name,
      room: this.link.room,
      copy: this.copy,
      host: this.hosting,
      pilots,
      connecting,
      connected: this.madeHere,
      failed: this.failedHere,
      health: this.link.health(),
    }
  }

  // ── talking

  private hear(line: ChatLine) {
    this.chat.push(line)
    if (this.chat.length > CHAT_KEPT) this.chat.shift()
  }

  /** a line of news in the chat: said by nobody, about `faction`'s pilot */
  private news(text: string, faction: FactionId) {
    this.hear({ at: this.o.clock(), key: '', callsign: '', faction, text, quick: -1, channel: 'news' })
  }

  /** a chat event to whoever `to` is: the room, the pilots of his side here, or his squad (only those are sent it) */
  private talk(e: NetEvent, to: ChatChannel) {
    if (to === 'room' || to === 'news') {
      this.outbox.push(e)
      return
    }
    // (what was said to everyone before it goes first, so lines arrive in the order they were said)
    if (this.outbox.length) {
      this.link.send('sure', packEvents(this.outbox))
      this.outbox = []
    }
    const sent = packEvents([{ ...e, to } as NetEvent])
    for (const r of this.remotes.values()) {
      if (!r.key || !r.card) continue
      if (to === 'side' ? r.card.faction === this.o.card.faction : this.squad.includes(r.key)) this.link.send('sure', sent, r.peer)
    }
  }

  /** a line of zone chat from the player (cleaned to what the font draws), to the room, his side or his squad; it is heard here too */
  say(text: string, to: ChatChannel = 'room') {
    const clean = cleanChat(text)
    if (!clean || this.gone) return
    const channel = to === 'news' ? 'room' : to
    this.talk({ t: 'chat', text: clean }, channel)
    this.hear({
      at: this.o.clock(),
      key: this.key,
      callsign: this.o.card.callsign,
      faction: this.o.card.faction,
      text: clean,
      quick: -1,
      channel,
    })
  }

  /** a phrase of the quick-chat wheel from the player, to the room, his side or his squad */
  sayQuick(n: number, to: ChatChannel = 'room') {
    if (this.gone) return
    const channel = to === 'news' ? 'room' : to
    this.talk({ t: 'quick', n: n | 0 }, channel)
    this.hear({
      at: this.o.clock(),
      key: this.key,
      callsign: this.o.card.callsign,
      faction: this.o.card.faction,
      text: '',
      quick: n | 0,
      channel,
    })
  }

  /** what was said since the last call, oldest first */
  takeChat(): ChatLine[] {
    const list = this.chat
    this.chat = []
    return list
  }

  /** true while this game flies the computer's ships (for the tests) */
  get host() {
    return this.hosting
  }
}
