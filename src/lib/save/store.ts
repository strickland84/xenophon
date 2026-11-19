// The save: everything a player owns, kept in his own browser (the plan's section 19): his
// identity (a Nostr key pair), his pilot (callsign, side and look), his ship and its paint, the parts
// fitted to each hull, his property (the vault, the wallet and what he has bought, kept as a
// log of what happened: property.ts), his standing (contribution, streak, feats, the day's tasks:
// progress.ts), the pilots he has muted or blocked, and a few settings (volume, view, the world he is
// at, the relays the persistent world is kept on). The events themselves are kept beside the save
// (net/archive.ts), not in it.
//
// The format carries a version number. A save written by an older build is brought up to date
// step by step through MIGRATIONS when it is read, so nothing a player has is ever thrown away
// by an update. To change the format: raise SAVE_VERSION, and add the step from the version
// before. A save that cannot be read is kept aside (under its key + '.unreadable') rather than
// overwritten.
//
// Nothing here touches the page: storage is handed in, so the tests use a plain object.

import { lookOf, lookText, randomLook, surfaceById, systemOfKey } from '../engine'
import type { ViewMode } from '../engine'
import { isKey, newSecretKey, publicKeyOf } from '../net/nostr'
import { firstShip, isFaction } from './pilot'
import { newShip, ownsHull, readShip, STARTER } from './ships'
import type { Livery, ShipRecord } from './ships'
import { GEAR, HULL_NAMES } from '../engine'
import { newProperty, readProperty, totalsOf } from './property'
import { newProgress, readProgress } from './progress'
import type { Progress } from './progress'
import type { Property } from './property'
import type { FactionId } from './pilot'
import { defaultBindings, readBindings } from '../input/bindings'
import type { Bindings } from '../input/bindings'

export const SAVE_VERSION = 9

export interface Save {
  version: typeof SAVE_VERSION
  /** the secret key; the public key (the pilot, as others know him) is worked out from it */
  identity: { secret: string }
  /** null until the player has chosen a callsign and a side; his look is his race and its choices (engine races.ts lookText) */
  pilot: { callsign: string; faction: FactionId; created: number; look: string } | null
  /** his ships (ships.ts): each with its loadout, paint and furniture; and the one he flies (its id) */
  ships: ShipRecord[]
  flying: string
  /** colour schemes he has kept, to paint any ship with */
  schemes: Livery[]
  /** what he wears on foot, by id (engine data/gear.ts); a slot left out holds its plain one */
  gear: string[]
  /** the world he last travelled to ('w12': engine/galaxy) is where he flies next time (null: where everyone starts); and the settings screen's */
  settings: Settings
  /** what he owns, as a log (property.ts) */
  property: Property
  /** his standing: contribution, streak, feats, the day's tasks (progress.ts) */
  progress: Progress
  /** pilots (by key) whose chat he does not see (muted), and whose chat and traces he does not see (blocked) */
  social: { muted: string[]; blocked: string[] }
  /** the guided first sortie: the step he is on ('' not begun), and whether it is behind him (finished or skipped) */
  tutorial: { step: string; done: boolean }
  /** the one-line tips he has been shown (cruise, gates, the hangar …: tutorial/tips.ts) */
  tips: string[]
  /** the opening story (IntroCrawl.svelte) has been shown, watched or skipped: it is not shown again unasked */
  intro: boolean
  /**
   * His key kept safe: when it was last backed up (ms since 1970; 0 never) and how (a file, the phrase
   * copied, the relays' copy), when he was last asked to (ms), and whether an encrypted copy of the
   * save is kept on the relays (save/backup.ts)
   */
  backup: { at: number; how: '' | 'file' | 'phrase' | 'relays'; asked: number; relays: boolean }
  /** seconds he has flown, all told (when to ask him to back up; the first hour's numbers) */
  played: number
}

/** what the settings screen sets (and the few the game keeps as he plays: volume, view, world) */
export interface Settings {
  /** the sound effects' volume and the music's, 0..1 (null: as the game starts them) */
  volume: number | null
  music: number | null
  view: ViewMode | null
  world: string | null
  relays: string[] | null
  /** keys and controller buttons (input/bindings.ts) */
  bindings: Bindings
  /** up and down as a flight stick (up dives); null: the game's way (it does) */
  invertY: boolean | null
  /** guns and thrusters work as a switch, pressed on and pressed off, rather than held */
  toggle: { fire: boolean; boost: boolean }
  /** 0..1: how hard the picture shakes */
  shake: number
  /** the size of the menus' text (and of the HUD's: 'large' and 'larger' draw it twice the size) */
  text: 'normal' | 'large' | 'larger'
  /** the interface's motion: as made, or turned down to brief fades ('less'; the device's own wish does too) */
  motion: 'full' | 'less'
  /** the art pixel's size on screen, CSS px (0: whatever suits the screen), and the flames drawn in pixels or smooth (null: smooth where the graphics card can) */
  pixel: number
  flames: 'pixel' | 'realistic' | null
  /** the last seconds of play kept all the while, to be had as a short film (display/clips.ts); null: on where there is a mouse, off on a touch screen */
  clips: boolean | null
}

/** settings as a new pilot has them */
export const newSettings = (): Settings => ({
  volume: null,
  music: null,
  view: null,
  world: null,
  relays: null,
  bindings: defaultBindings(),
  invertY: null,
  toggle: { fire: false, boost: false },
  shake: 1,
  text: 'normal',
  motion: 'full',
  pixel: 0,
  flames: null,
  clips: null,
})

/** where saves are kept: localStorage in the browser, anything with the same three methods in the tests */
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** the storage key of a save slot: one browser can keep more than one pilot (the second for testing two at once) */
export const slotKey = (slot: string) => `xenophon/save/${slot}`

/** a new save: a fresh key pair, no pilot yet, the usual ship in a paint of its own */
export function newSave(): Save {
  const secret = newSecretKey()
  return {
    version: SAVE_VERSION,
    identity: { secret },
    pilot: null,
    ...firstShips(publicKeyOf(secret)),
    schemes: [],
    gear: [],
    settings: newSettings(),
    property: newProperty(),
    progress: newProgress(),
    social: { muted: [], blocked: [] },
    tutorial: { step: '', done: false },
    tips: [],
    intro: false,
    backup: { at: 0, how: '', asked: 0, relays: false },
    played: 0,
  }
}

type Raw = Record<string, unknown>
const isObj = (v: unknown): v is Raw => !!v && typeof v === 'object' && !Array.isArray(v)

/**
 * The steps from each old version to the next. Version 1 (the first builds of Phase 2) kept
 * only the key, the callsign and the side, flat; version 2 nests them and adds the ship and
 * the settings.
 */
const MIGRATIONS: Record<number, (old: Raw) => Raw> = {
  1: (old) => {
    const secret = String(old.key ?? '')
    const pilot =
      typeof old.callsign === 'string' && isFaction(old.faction) ? { callsign: old.callsign, faction: old.faction, created: 0 } : null
    return {
      version: 2,
      identity: { secret },
      pilot,
      ship: isKey(secret) ? firstShip(publicKeyOf(secret)) : null,
      settings: { volume: null, view: null },
    }
  },
  // version 3 (Phase 4) adds the parts fitted to each hull, and the property log: both start empty
  2: (old) => ({ ...old, version: 3, loadout: {}, property: { log: [] } }),
  // version 4 (Phase 5) adds the pilot's look: a pilot from before is given one of his side's races, made from his key
  3: (old) => {
    const p = isObj(old.pilot) ? old.pilot : null
    const secret = isObj(old.identity) ? String(old.identity.secret ?? '') : ''
    const look = p && isFaction(p.faction) ? lookText(randomLook(p.faction, seedOf(secret))) : ''
    return { ...old, version: 4, pilot: p ? { ...p, look } : null }
  },
  // version 5 (Phase 7) adds his standing (progress), his mute and block lists, and the relay setting; a pilot from before owes no joining bonus
  4: (old) => ({ ...old, version: 5, progress: { ...newProgress(), joined: true }, social: { muted: [], blocked: [] } }),
  // version 6 (Phase 8) keeps a pilot's ships: the starter, in the paint he had, with the parts fitted to it; and the hull he
  // flew, if another (the old ship key cycled every hull for free: the one he had chosen is kept as his), with its parts
  5: (old) => {
    const s = isObj(old.ship) ? old.ship : {}
    const lo = isObj(old.loadout) ? old.loadout : {}
    const paint = { body: String(s.body ?? '#545969'), accent: String(s.accent ?? '#f0580e'), canopy: String(s.canopy ?? '#1e8ca0') }
    const hull = typeof s.hull === 'string' && HULL_NAMES.includes(s.hull) ? s.hull : STARTER
    const kept = (h: string) => ({
      ...newShip(h, paint),
      modules: Array.isArray(lo[h]) ? (lo[h] as unknown[]).filter((x) => typeof x === 'string') : [],
    })
    const ships = [kept(STARTER), ...(hull !== STARTER ? [kept(hull)] : [])]
    // (that hull is his now: written in the log as bought for nothing)
    const property = isObj(old.property) && Array.isArray(old.property.log) ? old.property : { log: [] }
    if (hull !== STARTER) (property.log as unknown[]).push({ t: 0, k: 'bought', what: `hull:${hull}`, credits: 0, items: [], at: 'kept' })
    const { ship: _ship, loadout: _loadout, ...rest } = old
    void _ship
    void _loadout
    return { ...rest, version: 6, ships, flying: hull, schemes: [], gear: [], property }
  },
  // version 7 (Phase 9) adds the first sortie's progress (a pilot who flew before has it behind him), the tips seen, his
  // backups, the time flown, and the settings screen's (each its default); his key was never backed up as far as it knows
  6: (old) => ({
    ...old,
    version: 7,
    tutorial: { step: '', done: isObj(old.pilot) },
    tips: [],
    backup: { at: 0, how: '', asked: 0, relays: false },
    played: 0,
  }),
  // version 8 (the polish pass) rebuilds a ship's rooms larger and gives each its fit-out: the furniture placed in the old
  // rooms would not stand where it was, so it is taken up (his to place again), and the ship's fit-out laid instead
  7: (old) => ({
    ...old,
    version: 8,
    ships: (Array.isArray(old.ships) ? old.ships : []).map((s) => (isObj(s) ? { ...s, furniture: [], kit: undefined } : s)),
  }),
  // version 9 (the polish pass, the tiling rule) redraws every piece on the grid of tiles with its own footprint and
  // facings, built against the walls: the furniture placed before would not stand where it was, so it is taken up again
  // (his to place again), and the ship's fit-out laid by the new rules
  8: (old) => ({
    ...old,
    version: 9,
    ships: (Array.isArray(old.ships) ? old.ships : []).map((s) => (isObj(s) ? { ...s, furniture: [], kit: undefined } : s)),
  }),
}

/** a new pilot's ships: the starter, in a paint chosen by his key */
export function firstShips(pubkey: string): { ships: ShipRecord[]; flying: string } {
  const f = firstShip(pubkey)
  return { ships: [newShip(STARTER, f)], flying: STARTER }
}

/** the ship he flies */
export const flownShip = (s: Save): ShipRecord => s.ships.find((x) => x.id === s.flying) ?? s.ships[0]

/** a number from a key, to make a look from (the same key, the same look) */
export const seedOf = (key: string) => parseInt(key.slice(0, 8), 16) | 0

/** a save of the present version from whatever was stored, or null if it cannot be made sense of */
export function migrate(raw: unknown): Save | null {
  if (!isObj(raw)) return null
  let data = raw
  let version = Number(data.version)
  if (!Number.isInteger(version) || version < 1 || version > SAVE_VERSION) return null
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version]
    if (!step) return null
    data = step(data)
    version = Number(data.version)
  }
  return validate(data)
}

/** the save, checked field by field; anything optional that is missing or wrong falls back to its default */
function validate(d: Raw): Save | null {
  const identity = isObj(d.identity) ? d.identity : null
  const secret = identity?.secret
  if (!isKey(secret)) return null
  const p = isObj(d.pilot) ? d.pilot : null
  const pilot =
    p && typeof p.callsign === 'string' && isFaction(p.faction)
      ? {
          callsign: p.callsign,
          faction: p.faction,
          created: typeof p.created === 'number' ? p.created : 0,
          // (a look of the wrong side, or none, is made right: his side's races only)
          look: lookText(typeof p.look === 'string' && p.look ? lookOf(p.look, p.faction) : randomLook(p.faction, seedOf(secret))),
        }
      : null
  const property = readProperty(d.property)
  const totals = totalsOf(property)
  // his ships: only hulls the log says he owns, each once by its id; the starter always
  const ships: ShipRecord[] = []
  for (const raw of Array.isArray(d.ships) ? d.ships : []) {
    const s = readShip(raw)
    if (s && ownsHull(totals, s.hull) && !ships.some((x) => x.id === s.id)) ships.push(s)
  }
  if (!ships.some((s) => s.hull === STARTER)) ships.unshift(firstShips(publicKeyOf(secret)).ships[0])
  const flying = typeof d.flying === 'string' && ships.some((s) => s.id === d.flying) ? d.flying : ships[0].id
  const schemes = (Array.isArray(d.schemes) ? d.schemes : [])
    .map((x) => readShip({ hull: STARTER, paint: x })?.paint)
    .filter((x): x is Livery => !!x)
    .slice(0, 8)
  const gear = (Array.isArray(d.gear) ? d.gear : [])
    .filter((g): g is string => typeof g === 'string' && GEAR.some((x) => x.id === g))
    .slice(0, 5)
  const st = isObj(d.settings) ? d.settings : {}
  const volume = typeof st.volume === 'number' && st.volume >= 0 && st.volume <= 1 ? st.volume : null
  const view = st.view === 'top' || st.view === 'chase' || st.view === 'cockpit' ? st.view : null
  // (a setting added within version 2: missing from older saves, and forgotten if this galaxy has no such world)
  const world = typeof st.world === 'string' && (surfaceById(st.world) || systemOfKey(st.world) >= 0) ? st.world : null
  // (relays the pilot chose: secure websocket addresses only; null keeps the built-in list)
  const relays = Array.isArray(st.relays)
    ? st.relays.filter((u): u is string => typeof u === 'string' && /^wss:\/\/\S+$/.test(u)).slice(0, 12)
    : null
  const so = isObj(d.social) ? d.social : {}
  const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => isKey(k)).slice(-500) : [])
  const unit = (v: unknown, or: number | null) => (typeof v === 'number' && v >= 0 && v <= 1 ? v : or)
  const tg = isObj(st.toggle) ? st.toggle : {}
  const settings: Settings = {
    volume,
    music: unit(st.music, null),
    view,
    world,
    relays,
    bindings: readBindings(st.bindings),
    invertY: typeof st.invertY === 'boolean' ? st.invertY : null,
    toggle: { fire: tg.fire === true, boost: tg.boost === true },
    shake: unit(st.shake, 1)!,
    text: st.text === 'large' || st.text === 'larger' ? st.text : 'normal',
    // (a setting added within version 7: missing from older saves)
    motion: st.motion === 'less' ? 'less' : 'full',
    pixel: typeof st.pixel === 'number' && Number.isInteger(st.pixel) && st.pixel >= 0 && st.pixel <= 6 ? st.pixel : 0,
    flames: st.flames === 'pixel' || st.flames === 'realistic' ? st.flames : null,
    // (a setting added within version 9: missing from older saves)
    clips: typeof st.clips === 'boolean' ? st.clips : null,
  }
  const tu = isObj(d.tutorial) ? d.tutorial : {}
  const bk = isObj(d.backup) ? d.backup : {}
  const ms = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  return {
    version: SAVE_VERSION,
    identity: { secret },
    pilot,
    ships,
    flying,
    schemes,
    gear,
    settings,
    property,
    progress: readProgress(d.progress),
    social: { muted: keys(so.muted), blocked: keys(so.blocked) },
    // (a pilot of an older build that lost the field has flown before: the first sortie is behind him)
    tutorial: { step: typeof tu.step === 'string' ? tu.step.slice(0, 24) : '', done: typeof tu.done === 'boolean' ? tu.done : !!pilot },
    tips: (Array.isArray(d.tips) ? d.tips : []).filter((t): t is string => typeof t === 'string').slice(0, 40),
    // (added within version 9: a pilot from before it has flown, and never sees the opening story unasked)
    intro: typeof d.intro === 'boolean' ? d.intro : !!pilot,
    backup: {
      at: ms(bk.at),
      how: bk.how === 'file' || bk.how === 'phrase' || bk.how === 'relays' ? bk.how : '',
      asked: ms(bk.asked),
      relays: bk.relays === true,
    },
    played: ms(d.played),
  }
}

/**
 * The save in a slot, brought up to date. On first run there is none: a new one is made (the
 * key pair, silently) and written. One that cannot be read is moved aside and a new one made.
 */
export function loadSave(storage: SaveStorage, slot: string): Save {
  const key = slotKey(slot)
  const text = storage.getItem(key)
  if (text !== null) {
    let raw: unknown = null
    try {
      raw = JSON.parse(text)
    } catch {
      // unreadable: kept aside below
    }
    const save = migrate(raw)
    if (save) {
      if (!isObj(raw) || raw.version !== SAVE_VERSION) writeSave(storage, slot, save)
      return save
    }
    storage.setItem(key + '.unreadable', text)
  }
  const fresh = newSave()
  writeSave(storage, slot, fresh)
  return fresh
}

export function writeSave(storage: SaveStorage, slot: string, save: Save) {
  storage.setItem(slotKey(slot), JSON.stringify(save))
}

// ── the pilot file: a save, downloaded, to keep or to carry to another device

const FILE_FORMAT = 'xenophon-pilot'

/** the text of a pilot file (it holds the secret key: whoever has it can fly as this pilot) */
export function pilotFile(save: Save): string {
  return JSON.stringify({ format: FILE_FORMAT, ...save }, null, 2) + '\n'
}

/** a save from the text of a pilot file, brought up to date; throws with a reason a player can read if it is not one */
export function readPilotFile(text: string): Save {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not a pilot file.')
  }
  if (!isObj(raw) || raw.format !== FILE_FORMAT) throw new Error('That file is not a pilot file.')
  const version = Number(raw.version)
  if (version > SAVE_VERSION) throw new Error('That pilot was saved by a newer version of the game.')
  const save = migrate(raw)
  if (!save) throw new Error('That pilot file is damaged.')
  if (!save.pilot) throw new Error('That file holds no pilot yet.')
  return save
}

/** the name to save a pilot file under */
export const pilotFileName = (save: Save) => `xenophon-pilot-${(save.pilot?.callsign ?? 'new').toLowerCase()}.json`
