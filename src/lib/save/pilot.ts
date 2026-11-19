// What a pilot is, outside the engine: a callsign, a side, a ship and its paint. The two
// sides (the plan's section 12) are here too: each has a colour and a mark of its own shape,
// so they can be told apart without telling colours apart.

import { DEFAULT_PARAMS } from '../engine'

export type FactionId = 'nomarchy' | 'anarchoi'
export type FactionMark = 'triangle' | 'diamond'

export interface Faction {
  id: FactionId
  name: string
  /** its colour, the accent of everything that is its own, and a darker one for card backs */
  colour: string
  dark: string
  mark: FactionMark
  /** one line of flavour, and three words of mood */
  flavour: string
  mood: string
}

export const FACTIONS: Record<FactionId, Faction> = {
  nomarchy: {
    id: 'nomarchy',
    name: 'The Nomarchy',
    colour: '#f2c14e',
    dark: '#131a33',
    mark: 'triangle',
    flavour: 'Every world by its lot.',
    mood: 'Proud, and fond of paperwork.',
  },
  anarchoi: {
    id: 'anarchoi',
    name: 'The Anarchoi',
    colour: '#a46cf0',
    dark: '#1a1430',
    mark: 'diamond',
    flavour: 'Every world by its flag.',
    mood: 'Loud, and quick to borrow.',
  },
}

export const isFaction = (s: unknown): s is FactionId => s === 'nomarchy' || s === 'anarchoi'

/** callsigns use only what the game's pixel font can draw: capitals, figures and a hyphen */
export const CALLSIGN_MIN = 3
export const CALLSIGN_MAX = 12

/** what the player typed, as a callsign can be written: capitals, no spaces, nothing the font lacks */
export function cleanCallsign(raw: string) {
  return raw
    .toUpperCase()
    .replace(/\s+/g, '-')
    .replace(/[^A-Z0-9-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, CALLSIGN_MAX)
}

/** why a callsign will not do (null: it will) */
export function callsignProblem(callsign: string): string | null {
  if (callsign.length < CALLSIGN_MIN) return `At least ${CALLSIGN_MIN} letters`
  if (callsign.length > CALLSIGN_MAX) return `At most ${CALLSIGN_MAX} letters`
  if (!/^[A-Z0-9-]+$/.test(callsign)) return 'Letters, figures and a hyphen only'
  if (!/[A-Z]/.test(callsign)) return 'At least one letter'
  if (/^-|-$/.test(callsign)) return 'No hyphen at either end'
  return null
}

export interface ShipLook {
  hull: string
  body: string
  accent: string
  canopy: string
}

/** paint a new pilot starts with, one picked by his key, so no two look alike until the paint booth comes (Phase 8) */
const PAINTS: Omit<ShipLook, 'hull'>[] = [
  { body: '#545969', accent: '#f0580e', canopy: '#1e8ca0' },
  { body: '#2f4a6b', accent: '#ffd23a', canopy: '#6ad4ff' },
  { body: '#3d3f45', accent: '#e83a4a', canopy: '#ffb03a' },
  { body: '#5b6b4a', accent: '#f2e6c4', canopy: '#2a9c7a' },
  { body: '#6a6f7a', accent: '#2fa8ff', canopy: '#d8f4ff' },
  { body: '#40304f', accent: '#ff8a3a', canopy: '#ffe14a' },
  { body: '#2c5550', accent: '#ff5a8a', canopy: '#a8f0e0' },
  { body: '#7a5a3a', accent: '#1d2a3a', canopy: '#ffd27a' },
]

/** the ship a new pilot is given: the usual hull, in a paint chosen by his key */
export function firstShip(pubkey: string): ShipLook {
  const n = parseInt(pubkey.slice(0, 8), 16) || 0
  return { hull: DEFAULT_PARAMS.hull, ...PAINTS[n % PAINTS.length] }
}
