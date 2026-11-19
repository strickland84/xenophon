// The core loop (the plan's section 3): sortie, risk, bank. Launch from a base with an empty
// hold, go where the ore is, cut it and scoop it up, get home with it while slower and worth
// shooting, land and bank it. This is its slice of the scene's state, and what the parts of it
// share: landing.ts (landing and taking off), mining.ts (the laser, the ore, the chunks),
// crates.ts (what a lost ship spills), bases.ts (turrets, and the raiders a load draws in).
//
// Property is the page's: the vault and the wallet are kept in the save as a log of what
// happened. The scene says what happened (Scene.takeLedger): ore mined, a hold banked, cargo
// lost, a crate taken, a bounty earned, a fee paid. It keeps only the hold, which is at risk.

import type { SceneState } from '../state'
import type { Base } from '../world/features'
import { createHold } from './cargo'
import type { Hold, Items } from './cargo'
import { createLanding } from './landing'
import type { Landing } from './landing'
import { createMining } from './mining'
import type { Chunk, Mining } from './mining'
import type { Crate } from './crates'
import type { Turret } from './bases'
import { ownerOf } from './traces'

/** what happened to the player's property, for the page to keep in the save */
export type LedgerEntry =
  /** ore cut and scooped into the hold */
  | { kind: 'mined'; items: Items; world: string }
  /** landed at a friendly base: the hold went into the vault */
  | { kind: 'bank'; items: Items; base: string; world: string }
  /** the ship was lost: its hold spilled */
  | { kind: 'lost'; items: Items; world: string }
  /** taken from a crate into the hold */
  | { kind: 'picked'; items: Items; world: string }
  /** credits for downing a ship */
  | { kind: 'bounty'; credits: number; what: string }
  /** credits for a new ship, delivered after one was lost */
  | { kind: 'fee'; credits: number; hull: string }
  /** the hull mended at a base or a station, the mining key held: what it came to */
  | { kind: 'repair'; credits: number; base: string }

export interface Loop {
  hold: Hold
  landing: Landing
  mining: Mining
  chunks: Chunk[]
  crates: Crate[]
  /** the number the next crate made here is given */
  crateTag: number
  /** outcrop id → units taken from it in its present period, and which period that is */
  taken: Map<number, { epoch: number; n: number }>
  /** seconds since 1970 (UTC) at scene time 0: outcrops come back on this clock (Scene.setClock) */
  clock: number
  /** the bases' turrets, each with a fighter that cannot be fought (bases.ts) */
  turrets: Turret[]
  /** what happened to the player's property since the page last asked */
  ledger: LedgerEntry[]
  /** a line of news in the middle of the frame (BANKED, CARGO LOST …): words, a second line, and when */
  news: { text: string; sub: string; t: number; good: boolean }
  /** seconds since the hold was last found full when ore was there to take (the HUD says so) */
  fullAt: number
}

export function createLoop(hull: string, slots = 0): Loop {
  return {
    hold: createHold(hull, slots),
    landing: createLanding(),
    mining: createMining(),
    chunks: [],
    crates: [],
    crateTag: 1,
    taken: new Map(),
    clock: 0,
    turrets: [],
    ledger: [],
    news: { text: '', sub: '', t: -99, good: true },
    fullAt: -99,
  }
}

/** the most ledger entries kept before the page has read them */
const LEDGER_MAX = 256

export function record(scene: SceneState, e: LedgerEntry) {
  const l = scene.loop.ledger
  l.push(e)
  if (l.length > LEDGER_MAX) l.splice(0, l.length - LEDGER_MAX)
}

/** a line of news in the middle of the frame */
export function news(scene: SceneState, text: string, sub = '', good = true) {
  scene.loop.news = { text, sub, t: scene.time, good }
}

/** seconds since 1970 (UTC), now */
export const nowOf = (scene: SceneState) => scene.loop.clock + scene.time

/** true while the loop is played: a world with features (or space) under a pilot with a side (the scripted flights of other phases have neither) */
export const looping = (scene: SceneState) =>
  scene.params.side !== '' && (scene.world.features.bases.length > 0 || scene.zone.kind === 'space')

/** true for a base the player may land at and bank at: his side's, or nobody's (a base not a capital is its world's holder's: traces.ts) */
export function friendly(scene: SceneState, b: Base) {
  const owner = ownerOf(scene, b)
  return !owner || !scene.params.side || owner === scene.params.side
}

/** the friendly base nearest a point (across the world's wrap), and how far it is; null if there is none */
export function nearestBase(scene: SceneState, x: number, y: number, onlyFriendly = true) {
  let best: Base | null = null
  let bestD = Infinity
  for (const b of scene.world.features.bases) {
    if (onlyFriendly && !friendly(scene, b)) continue
    const d = Math.hypot(wrapDelta(b.x - x), wrapDelta(b.y - y))
    if (d < bestD) {
      bestD = d
      best = b
    }
  }
  return best ? { base: best, d: bestD } : null
}

/**
 * How far round the world in hand is (px): the island world of the settings 2048, a world of the galaxy eight times
 * that (world/lands.ts). Set as a scene is stepped, drawn or asked anything (scene.ts), for the scene's own world.
 */
let round = 2048
export const setRound = (size: number) => {
  round = size
}

/** a difference of two coordinates, the short way round the world */
export const wrapDelta = (d: number) => d - round * Math.round(d / round)

/** a difference of two coordinates in the zone the scene is in: the short way round a world, or straight across space */
export const deltaIn = (scene: SceneState, d: number) => (scene.zone.kind === 'space' ? d : wrapDelta(d))

/** a list of items as words: '12 FERRITE  4 SILICA' */
export function itemWords(items: Items, names: (id: string) => string) {
  return items.map((s) => `${s.n} ${names(s.id)}`).join('  ')
}
