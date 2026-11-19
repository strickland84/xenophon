// A pilot's ships (Phase 8): each hull he owns, kept with its own loadout (a weapon on each mount,
// its modules), its paint (every colour, a pattern, an emblem, his side's mark, the exhaust and
// trails), and its rooms' furniture. Whether he owns a hull is the property log's to say (bought
// for credits, 'hull:lance'); the Corsair is every pilot's, free, for good. Which one he flies is
// chosen at a base or station.

import { EMBLEMS, FURNITURE, HULL_NAMES, isFace, moduleOf, MODULE_SLOTS, PATTERNS, shipKit, statsOf, weaponOf } from '../engine'
import type { Piece, SceneParams } from '../engine'
import type { Totals } from './property'

/** a ship's paint: every colour a pilot picks ('' for trim, glow and trail: the hull's own) */
export interface Livery {
  body: string
  accent: string
  canopy: string
  trim: string
  glow: string
  trail: string
  pattern: string
  emblem: string
  mark: boolean
}

export interface ShipRecord {
  /** its own name in the save ('corsair' for the starter) */
  id: string
  hull: string
  /** the weapon on each mount ('cannon': the hull's own), and the modules in its slots */
  weapons: string[]
  modules: string[]
  paint: Livery
  /** the furniture placed in its rooms (each piece's foot, in tiles, and the way it faces) */
  furniture: Piece[]
  /** the pieces it came with (its fit-out: data/interiors.ts ROOM_KINDS), by kind: his as much as any he bought */
  kit: Record<string, number>
  /** other pilots may come aboard while it stands landed or docked */
  open: boolean
}

/** the hull every pilot has, free, for good */
export const STARTER = 'corsair'

/** the emblems a feat earns (save/progress.ts FEATS); every other emblem is free */
export const EMBLEM_FEATS: Record<string, string> = { crown: 'namer', fang: 'streak', moon: 'horizon', bolt: 'hauler' }

const isColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)

/** a hull's fit-out: the furniture a new ship comes with, where it stands, and how many of each */
export function fitOut(hull: string) {
  const furniture = shipKit(hull)
  const kit: Record<string, number> = {}
  for (const f of furniture) kit[f.id] = (kit[f.id] ?? 0) + 1
  return { furniture, kit }
}

/** a new ship of a hull, in a paint */
export function newShip(hull: string, paint: Pick<Livery, 'body' | 'accent' | 'canopy'>, id = hull): ShipRecord {
  return {
    id,
    hull,
    weapons: Array(statsOf(hull).mounts).fill('cannon'),
    modules: [],
    paint: {
      body: paint.body,
      accent: paint.accent,
      canopy: paint.canopy,
      trim: '',
      glow: '',
      trail: '',
      pattern: '',
      emblem: '',
      mark: false,
    },
    ...fitOut(hull),
    open: false,
  }
}

/** a ship record read from a save: anything that does not make sense falls back to plain */
export function readShip(raw: unknown): ShipRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const hull = typeof r.hull === 'string' && HULL_NAMES.includes(r.hull) ? r.hull : null
  if (!hull) return null
  const p = (r.paint && typeof r.paint === 'object' ? r.paint : {}) as Record<string, unknown>
  const colour = (v: unknown, or: string) => (isColour(v) ? v : or)
  const mounts = statsOf(hull).mounts
  const weapons = Array.isArray(r.weapons) ? r.weapons : []
  return {
    id: typeof r.id === 'string' && r.id ? r.id.slice(0, 24) : hull,
    hull,
    weapons: Array.from({ length: mounts }, (_, m) => (weaponOf(String(weapons[m] ?? '')) ? String(weapons[m]) : 'cannon')),
    modules: (Array.isArray(r.modules) ? r.modules : [])
      .filter((m): m is string => typeof m === 'string' && !!moduleOf(m))
      .filter((m, i, all) => all.indexOf(m) === i)
      .slice(0, MODULE_SLOTS[hull] ?? 2),
    paint: {
      body: colour(p.body, '#545969'),
      accent: colour(p.accent, '#f0580e'),
      canopy: colour(p.canopy, '#1e8ca0'),
      trim: colour(p.trim, ''),
      glow: colour(p.glow, ''),
      trail: colour(p.trail, ''),
      pattern: typeof p.pattern === 'string' && (PATTERNS as readonly string[]).includes(p.pattern) ? p.pattern : '',
      emblem: typeof p.emblem === 'string' && EMBLEMS.includes(p.emblem) ? p.emblem : '',
      mark: p.mark === true,
    },
    // (a ship from before its fit-out: version 8 gives it one, its own pieces back to place again)
    ...(r.kit && typeof r.kit === 'object'
      ? {
          furniture: (Array.isArray(r.furniture) ? r.furniture : [])
            .filter((f) => f && typeof f.id === 'string' && Number.isFinite(f.x) && Number.isFinite(f.y))
            .slice(0, 60)
            .map((f) => ({ id: f.id as string, x: Math.round(f.x), y: Math.round(f.y), ...(isFace(f.face) ? { face: f.face } : {}) })),
          kit: Object.fromEntries(
            Object.entries(r.kit as Record<string, unknown>)
              .filter(([id, n]) => FURNITURE.some((f) => f.id === id) && Number.isInteger(n) && (n as number) > 0)
              .map(([id, n]) => [id, Math.min(20, n as number)]),
          ),
        }
      : fitOut(hull)),
    open: r.open === true,
  }
}

/** whether a pilot owns a hull: the starter always; any other bought (the property log) */
export const ownsHull = (t: Totals, hull: string) => hull === STARTER || t.owned.includes(`hull:${hull}`)

/** whether he owns a weapon or a module (the cannon comes with every hull; a part bought in Phase 4 is a module) */
export const ownsWeapon = (t: Totals, id: string) => id === 'cannon' || t.owned.includes(`weapon:${id}`)
export const ownsModule = (t: Totals, id: string) => t.owned.includes(`module:${id}`) || t.owned.includes(`part:${id}`)

/** pieces of furniture of a kind he has (bought, or come with his ships) and not placed across all his ships */
export function furnitureLeft(t: Totals, ships: ShipRecord[], id: string) {
  const bought = t.counts[`furn:${id}`] ?? 0
  const kit = ships.reduce((n, s) => n + (s.kit[id] ?? 0), 0)
  const placed = ships.reduce((n, s) => n + s.furniture.filter((f) => f.id === id).length, 0)
  return bought + kit - placed
}

/** the scene's settings for flying a ship */
export function shipSettings(s: ShipRecord, side: string): Partial<SceneParams> {
  return {
    hull: s.hull,
    weapons: s.weapons.join(','),
    parts: s.modules.join(','),
    bodyColor: s.paint.body,
    accentColor: s.paint.accent,
    canopyColor: s.paint.canopy,
    trimColor: s.paint.trim,
    glowColor: s.paint.glow,
    trailColor: s.paint.trail,
    pattern: s.paint.pattern,
    emblem: s.paint.emblem,
    factionMark: s.paint.mark && !!side,
  }
}
