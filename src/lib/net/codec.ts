// What goes over the wire, and how it is packed. Three kinds of message, told apart by their
// first byte:
//
//   1  a pilot's own ship (and himself, out of it), ~15 times a second on the fast lane: 56 bytes
//   2  the computer's ships, from the game that flies them for the room: 16 bytes, then 29 a ship
//      (also sent once on the sure lane when that game hands them over to another)
//   3  events, on the sure lane: a JSON list (a pilot's signed card, hits, losses, missiles…)
//
// Numbers are little-endian. Angles and shares are packed into a byte or two; positions are
// 32-bit floats.

import { HULL_NAMES } from '../engine'
import type { NostrEvent } from './nostr'

export const MSG_PILOT = 1
export const MSG_COMPUTER = 2
export const MSG_EVENTS = 3

/** a pilot's ship, as his game says it stands */
export interface PilotSnap {
  /** ms on the sender's clock when it was so */
  t: number
  seq: number
  flying: boolean
  out: boolean
  firing: boolean
  x: number
  y: number
  height: number
  heading: number
  roll: number
  pitch: number
  speed: number
  thrust: number
  /** −1 not rolling, else 0..1 through a full roll, and which way */
  spin: number
  spinDir: number
  hullLeft: number
  shieldLeft: number
  protect: number
  /** how many ships he has had (mod 256) */
  life: number
  hull: string
  /** how full his hold is (0..1), whether he is landing (1), landed (2) or lifting off (3), and the outcrop his laser cuts (−1 none) */
  loaded: number
  landing: number
  mining: number
  /** where he is: 0 in his ship, 1 coming down after ejecting, 2 on foot, 3 dead, 4 climbing into a ship */
  foot: number
  /** his ship: 0 none, 1 he is in it, 2 standing empty where he left it (where x, y, height and heading say) */
  ship: number
  /** out of his ship: where he is (his feet), which way he faces, px a second he walks */
  fx: number
  fy: number
  fz: number
  facing: number
  walk: number
  /** 0..1: his health, and how far his way of coming down has opened */
  health: number
  open: number
  hidden: boolean
  wading: boolean
  shooting: boolean
  cutting: boolean
  /** inside (Phase 8): 0 not, 1 his hangar, 2 a station deck, 3 a ship's rooms; and which (the base's id for a deck, a number from the owner's key for a ship) */
  inside: number
  room: number
}

/** one of the computer's ships */
export interface ComputerSnap {
  id: number
  x: number
  y: number
  height: number
  heading: number
  roll: number
  pitch: number
  speed: number
  thrust: number
  firing: boolean
  spin: number
  spinDir: number
  hullLeft: number
  shieldLeft: number
  hull: string
  wave: number
  /** the band of the zone it flies in (the engine's sim/bands.ts; −1 none), whose patrol it is ('' a raider's), and whether it lies in wait */
  band: number
  faction: '' | 'nomarchy' | 'anarchoi'
  lurk: boolean
}

/** the computer's ships, with how the room's waves stand, and the bands of the zone beaten and not yet back */
export interface ComputerPacket {
  t: number
  seq: number
  /** the sender flies them for the room; `handover`: it no longer does, and these are for the next to take on */
  host: boolean
  handover: boolean
  wave: number
  stage: 'rest' | 'fight'
  timer: number
  ships: ComputerSnap[]
  /** band ids, and the moment (UTC seconds) each is back */
  cleared: { band: number; until: number }[]
}

/** a pilot named in an event: his public key; one of the computer's ships: its number; nobody: null */
export type Who = string | number | null

export type NetEvent =
  /** who a pilot is, signed with his key (see nostr.ts); its content is a PilotCard as JSON */
  | { t: 'card'; card: NostrEvent }
  /** a shot from the sender's game struck `target` (decided there), at d from its middle (`foot`: the pilot on foot, not his ship) */
  | { t: 'hit'; target: Who; by: Who; amount: number; d: [number, number, number]; hull: boolean; foot?: boolean }
  /** a ship the sender's game owns was lost (`life`: which of a pilot's ships it was; `parked`: standing empty, its pilot out of it; `bounty`: the price on its pilot, paid to whoever downed him) */
  | { t: 'down'; who: Who; by: Who; life: number; parked?: boolean; bounty?: number }
  /** the sender's pilot, on foot, was killed by `by` (null: the sea, lava) */
  | { t: 'died'; by: Who }
  /** the sender's pilot cut `n` units from vein `v` in its period `e` */
  | { t: 'vein'; v: number; e: number; n: number }
  /** the sender's pilot killed creature `c` of this world: it is gone until `u` (seconds since 1970) */
  | { t: 'beast'; c: number; u: number }
  /** the sender's pilot is climbing into `who`'s parked ship: that pilot's game says whether it is his */
  | { t: 'steal'; who: string }
  /** the sender gave his parked ship up to pilot `by`, with what was in its hold; or would not (`no`) */
  | { t: 'stolen'; by: string; items: { id: string; n: number }[] }
  | { t: 'stealNo'; by: string }
  /** the sender flies a ship that is not his own (stolen): its paint (null: his own again) */
  | { t: 'paint'; paint: { body: string; accent: string; canopy: string } | null }
  /** the sender's pilot planted his beacon at p, or fired a flare from p */
  | { t: 'beacon'; p: [number, number, number] }
  | { t: 'flare'; p: [number, number, number] }
  /** a ship the sender's game owns fired missile `n` (the sender's number for it) */
  | { t: 'missile'; n: number; from: Who; target: Who }
  /** missile `n` of game `g` (a pilot's key) burst at p, or was dodged: said by the game that owns its target */
  | { t: 'mEnd'; g: string; n: number; p: [number, number, number]; dodged: boolean }
  /** the sender's tab is hidden (on), or back (off) */
  | { t: 'idle'; on: boolean }
  /** the sender's laser took `n` units from outcrop `o` in its period `e` */
  | { t: 'mined'; o: number; e: number; n: number }
  /** a ship the sender's game owns was lost and spilled crate `n` (its number there) at p */
  | { t: 'crate'; n: number; p: [number, number, number]; items: { id: string; n: number }[] }
  /** the sender took from crate `n` of game `g` (a pilot's key): `left` is what is left in it */
  | { t: 'crateTaken'; g: string; n: number; left: { id: string; n: number }[] }
  /** persistent world events (net/events.ts), signed: what the sender's archive has, or one just made or let in */
  | { t: 'events'; list: NostrEvent[] }
  /** a line of zone chat (capitals, figures and a few signs: what the pixel font draws), or a phrase of the quick-chat wheel;
   * `to` his side or his squad (sent to them only; none: the room) */
  | { t: 'chat'; text: string; to?: 'side' | 'squad' }
  | { t: 'quick'; n: number; to?: 'side' | 'squad' }
  /** the sender's ship dropped mine `n` at p; and it burst (Phase 8) */
  | { t: 'mine'; n: number; p: [number, number, number] }
  | { t: 'mineEnd'; n: number }
  /** squads: the sender asks pilot `to` to fly with him (`ask`), or says yes to his asking; and the squad as the sender has it (his own key left out; none: he left it) */
  | { t: 'squad'; to: string; ask: boolean }
  | { t: 'squadIs'; keys: string[] }
  /** a ping, and its answer, to measure the time there and back */
  | { t: 'ping'; at: number }
  | { t: 'pong'; at: number }

/** what a pilot's card says (the content of his signed card) */
export interface PilotCard {
  callsign: string
  faction: 'nomarchy' | 'anarchoi'
  hull: string
  /** his ship's colours: body, markings, glass; and (Phase 8) trim, engine glow and trails ('' the hull's own) */
  paint: { body: string; accent: string; canopy: string; trim?: string; glow?: string; trail?: string }
  /** how his ship is fitted and painted beyond its colours (engine sim/outfit.ts makeText), whether others may come aboard it, and its rooms' furniture */
  make?: string
  open?: boolean
  furniture?: { id: string; x: number; y: number; face?: string }[]
  /** his race and look (engine races.ts lookText) */
  look?: string
  /** his rank, 0..5 (engine galaxy/daily.ts): a badge and a title only */
  rank?: number
}

const TURN = Math.PI * 2
const byteOf = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)))
const hullIndex = (name: string) => Math.max(0, HULL_NAMES.indexOf(name))
const hullName = (i: number) => HULL_NAMES[i] ?? HULL_NAMES[0]
const angleOf = (a: number) => Math.round((((a % TURN) + TURN) % TURN) * (65536 / TURN)) & 0xffff
const fromAngle = (u: number) => (u * TURN) / 65536
const i8 = (v: number) => Math.max(-127, Math.min(127, Math.round(v)))

export const PILOT_BYTES = 64

export function packPilot(s: PilotSnap): Uint8Array {
  const b = new Uint8Array(PILOT_BYTES)
  const v = new DataView(b.buffer)
  v.setUint8(0, MSG_PILOT)
  v.setUint8(1, (s.flying ? 1 : 0) | (s.out ? 2 : 0) | (s.firing ? 4 : 0) | (s.spin >= 0 ? 8 : 0) | (s.spinDir > 0 ? 16 : 0))
  v.setUint16(2, s.seq & 0xffff, true)
  v.setUint32(4, Math.max(0, Math.floor(s.t)) >>> 0, true)
  v.setFloat32(8, s.x, true)
  v.setFloat32(12, s.y, true)
  v.setFloat32(16, s.height, true)
  v.setUint16(20, angleOf(s.heading), true)
  v.setInt8(22, i8(s.roll * 40))
  v.setInt8(23, i8(s.pitch * 100))
  v.setUint16(24, Math.max(0, Math.min(65535, Math.round(s.speed * 8))), true)
  v.setUint8(26, byteOf(s.thrust))
  v.setUint8(27, byteOf(Math.max(0, s.spin)))
  v.setUint8(28, byteOf(s.hullLeft))
  v.setUint8(29, byteOf(s.shieldLeft))
  v.setUint8(30, Math.max(0, Math.min(255, Math.round(s.protect * 20))))
  v.setUint8(31, s.life & 255)
  v.setUint8(32, hullIndex(s.hull))
  v.setUint8(33, byteOf(s.loaded))
  v.setUint8(34, Math.max(0, Math.min(3, s.landing | 0)))
  v.setUint16(35, s.mining >= 0 ? Math.min(0xfffe, s.mining | 0) : 0xffff, true)
  // out of his ship
  v.setUint8(37, (Math.max(0, Math.min(15, s.foot | 0)) << 4) | Math.max(0, Math.min(15, s.ship | 0)))
  v.setFloat32(38, s.fx, true)
  v.setFloat32(42, s.fy, true)
  v.setFloat32(46, s.fz, true)
  v.setUint16(50, angleOf(s.facing), true)
  v.setUint8(52, Math.max(0, Math.min(255, Math.round(s.walk * 4))))
  v.setUint8(53, byteOf(s.health))
  v.setUint8(54, byteOf(s.open))
  v.setUint8(55, (s.hidden ? 1 : 0) | (s.wading ? 2 : 0) | (s.shooting ? 4 : 0) | (s.cutting ? 8 : 0))
  v.setUint8(56, Math.max(0, Math.min(3, s.inside | 0)))
  v.setUint32(57, s.room >>> 0, true)
  return b
}

export function unpackPilot(b: Uint8Array): PilotSnap | null {
  if (b.length < PILOT_BYTES || b[0] !== MSG_PILOT) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const flags = v.getUint8(1)
  return {
    flying: (flags & 1) !== 0,
    out: (flags & 2) !== 0,
    firing: (flags & 4) !== 0,
    spin: flags & 8 ? v.getUint8(27) / 255 : -1,
    spinDir: flags & 16 ? 1 : -1,
    seq: v.getUint16(2, true),
    t: v.getUint32(4, true),
    x: v.getFloat32(8, true),
    y: v.getFloat32(12, true),
    height: v.getFloat32(16, true),
    heading: fromAngle(v.getUint16(20, true)),
    roll: v.getInt8(22) / 40,
    pitch: v.getInt8(23) / 100,
    speed: v.getUint16(24, true) / 8,
    thrust: v.getUint8(26) / 255,
    hullLeft: v.getUint8(28) / 255,
    shieldLeft: v.getUint8(29) / 255,
    protect: v.getUint8(30) / 20,
    life: v.getUint8(31),
    hull: hullName(v.getUint8(32)),
    loaded: v.getUint8(33) / 255,
    landing: v.getUint8(34),
    mining: v.getUint16(35, true) === 0xffff ? -1 : v.getUint16(35, true),
    foot: v.getUint8(37) >> 4,
    ship: v.getUint8(37) & 15,
    fx: v.getFloat32(38, true),
    fy: v.getFloat32(42, true),
    fz: v.getFloat32(46, true),
    facing: fromAngle(v.getUint16(50, true)),
    walk: v.getUint8(52) / 4,
    health: v.getUint8(53) / 255,
    open: v.getUint8(54) / 255,
    hidden: (v.getUint8(55) & 1) !== 0,
    wading: (v.getUint8(55) & 2) !== 0,
    shooting: (v.getUint8(55) & 4) !== 0,
    cutting: (v.getUint8(55) & 8) !== 0,
    inside: v.getUint8(56),
    room: v.getUint32(57, true),
  }
}

const HEAD_BYTES = 16
const SHIP_BYTES = 32
const CLEARED_BYTES = 6
const FACTION_CODES = ['', 'nomarchy', 'anarchoi'] as const

export function packComputer(p: ComputerPacket): Uint8Array {
  const n = Math.min(255, p.ships.length)
  const m = Math.min(255, p.cleared.length)
  const b = new Uint8Array(HEAD_BYTES + n * SHIP_BYTES + 1 + m * CLEARED_BYTES)
  const v = new DataView(b.buffer)
  v.setUint8(0, MSG_COMPUTER)
  v.setUint8(1, n)
  v.setUint16(2, p.seq & 0xffff, true)
  v.setUint32(4, Math.max(0, Math.floor(p.t)) >>> 0, true)
  v.setUint16(8, Math.max(0, Math.min(65535, p.wave)), true)
  v.setUint8(10, p.stage === 'fight' ? 1 : 0)
  v.setUint8(11, (p.host ? 1 : 0) | (p.handover ? 2 : 0))
  v.setFloat32(12, p.timer, true)
  for (let i = 0; i < n; i++) {
    const s = p.ships[i]
    const o = HEAD_BYTES + i * SHIP_BYTES
    v.setUint32(o, s.id >>> 0, true)
    v.setFloat32(o + 4, s.x, true)
    v.setFloat32(o + 8, s.y, true)
    v.setFloat32(o + 12, s.height, true)
    v.setUint16(o + 16, angleOf(s.heading), true)
    v.setInt8(o + 18, i8(s.roll * 40))
    v.setInt8(o + 19, i8(s.pitch * 100))
    v.setUint16(o + 20, Math.max(0, Math.min(65535, Math.round(s.speed * 8))), true)
    v.setUint8(o + 22, byteOf(s.thrust))
    v.setUint8(o + 23, (s.firing ? 1 : 0) | (s.spin >= 0 ? 2 : 0) | (s.spinDir > 0 ? 4 : 0) | (s.lurk ? 8 : 0))
    v.setUint8(o + 24, byteOf(Math.max(0, s.spin)))
    v.setUint8(o + 25, byteOf(s.hullLeft))
    v.setUint8(o + 26, byteOf(s.shieldLeft))
    v.setUint8(o + 27, hullIndex(s.hull))
    v.setUint8(o + 28, Math.max(0, Math.min(255, s.wave)))
    v.setUint8(o + 29, Math.max(0, FACTION_CODES.indexOf(s.faction)))
    v.setUint16(o + 30, s.band < 0 ? 0xffff : Math.min(0xfffe, s.band), true)
  }
  const c = HEAD_BYTES + n * SHIP_BYTES
  v.setUint8(c, m)
  for (let i = 0; i < m; i++) {
    v.setUint16(c + 1 + i * CLEARED_BYTES, Math.max(0, Math.min(0xffff, p.cleared[i].band)), true)
    v.setUint32(c + 3 + i * CLEARED_BYTES, Math.max(0, Math.floor(p.cleared[i].until)) >>> 0, true)
  }
  return b
}

export function unpackComputer(b: Uint8Array): ComputerPacket | null {
  if (b.length < HEAD_BYTES || b[0] !== MSG_COMPUTER) return null
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = v.getUint8(1)
  if (b.length < HEAD_BYTES + n * SHIP_BYTES) return null
  const flags = v.getUint8(11)
  const ships: ComputerSnap[] = []
  for (let i = 0; i < n; i++) {
    const o = HEAD_BYTES + i * SHIP_BYTES
    const f = v.getUint8(o + 23)
    ships.push({
      id: v.getUint32(o, true),
      x: v.getFloat32(o + 4, true),
      y: v.getFloat32(o + 8, true),
      height: v.getFloat32(o + 12, true),
      heading: fromAngle(v.getUint16(o + 16, true)),
      roll: v.getInt8(o + 18) / 40,
      pitch: v.getInt8(o + 19) / 100,
      speed: v.getUint16(o + 20, true) / 8,
      thrust: v.getUint8(o + 22) / 255,
      firing: (f & 1) !== 0,
      spin: f & 2 ? v.getUint8(o + 24) / 255 : -1,
      spinDir: f & 4 ? 1 : -1,
      hullLeft: v.getUint8(o + 25) / 255,
      shieldLeft: v.getUint8(o + 26) / 255,
      hull: hullName(v.getUint8(o + 27)),
      wave: v.getUint8(o + 28),
      faction: FACTION_CODES[v.getUint8(o + 29)] ?? '',
      band: v.getUint16(o + 30, true) === 0xffff ? -1 : v.getUint16(o + 30, true),
      lurk: (f & 8) !== 0,
    })
  }
  const cleared: ComputerPacket['cleared'] = []
  const c = HEAD_BYTES + n * SHIP_BYTES
  const m = b.length > c ? v.getUint8(c) : 0
  for (let i = 0; i < m && c + 1 + (i + 1) * CLEARED_BYTES <= b.length; i++)
    cleared.push({ band: v.getUint16(c + 1 + i * CLEARED_BYTES, true), until: v.getUint32(c + 3 + i * CLEARED_BYTES, true) })
  return {
    seq: v.getUint16(2, true),
    t: v.getUint32(4, true),
    wave: v.getUint16(8, true),
    stage: v.getUint8(10) === 1 ? 'fight' : 'rest',
    host: (flags & 1) !== 0,
    handover: (flags & 2) !== 0,
    timer: v.getFloat32(12, true),
    ships,
    cleared,
  }
}

export function packEvents(list: NetEvent[]): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(list))
  const b = new Uint8Array(text.length + 1)
  b[0] = MSG_EVENTS
  b.set(text, 1)
  return b
}

/** the events in a message (nothing, if it is not a list of them) */
export function unpackEvents(b: Uint8Array): NetEvent[] {
  if (b.length < 2 || b[0] !== MSG_EVENTS) return []
  try {
    const list = JSON.parse(new TextDecoder().decode(b.subarray(1)))
    return Array.isArray(list) ? list.filter((e) => e && typeof e === 'object' && typeof e.t === 'string') : []
  } catch {
    return []
  }
}
