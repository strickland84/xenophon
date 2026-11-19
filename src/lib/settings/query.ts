// Settings from the page's address, so the scene can be tried in any of its guises without
// touching the code: /?view=cockpit&timeOfDay=night&wingmen=2&flameStyle=realistic
//
// Every setting of the scene (see engine/params.ts) can be given by name, as can the
// component's own: pixelSize, showHint and volume. Anything unknown or malformed is
// ignored, and its default stands.

import { DEFAULT_PARAMS, HULL_NAMES, theGalaxy } from '../engine'
import type { SceneParams } from '../engine'
import { readWing } from '../net/wing'
import type { Wing } from '../net/wing'

export type SceneSettings = Partial<SceneParams> & {
  pixelSize?: number
  showHint?: boolean
  volume?: number
}

/** settings that are a choice from a list, and the choices */
const CHOICES: Record<string, readonly string[]> = {
  view: ['top', 'chase', 'cockpit'],
  hull: HULL_NAMES,
  timeOfDay: ['day', 'sunset', 'night'],
  flameStyle: ['pixel', 'realistic'],
  // (the worlds of the galaxy, ?world=w12, and the systems' space, ?world=s3)
  world: [...theGalaxy().worlds.map((w) => w.id), ...theGalaxy().systems.map((s) => `s${s.index}`)],
}

/** what each setting looks like: the scene's defaults, plus the component's own */
const SHAPE: Record<string, number | boolean | string> = {
  ...DEFAULT_PARAMS,
  pixelSize: 0,
  showHint: true,
  volume: 0.7,
}

function read(key: string, raw: string, like: number | boolean | string): number | boolean | string | undefined {
  if (typeof like === 'number') {
    const n = Number(raw)
    return raw.trim() !== '' && Number.isFinite(n) ? n : undefined
  }
  if (typeof like === 'boolean') {
    if (/^(1|true|on|yes)$/i.test(raw)) return true
    if (/^(0|false|off|no)$/i.test(raw)) return false
    return undefined
  }
  if (key in CHOICES) return CHOICES[key].includes(raw) ? raw : undefined
  // a colour: a `#` cannot be written in an address without escaping it, so it may be left off
  return /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw) ? '#' + raw : raw
}

export function settingsFromQuery(query: Pick<URLSearchParams, 'get'>): SceneSettings {
  const settings: Record<string, number | boolean | string> = {}
  for (const [key, like] of Object.entries(SHAPE)) {
    const raw = query.get(key)
    if (raw === null) continue
    const value = read(key, raw, like)
    if (value !== undefined) settings[key] = value
  }
  return settings as SceneSettings
}

/** how the game goes online, from the address: none of these are the scene's */
export interface NetSettings {
  /** which pilot in this browser: 'main', or another slot to fly a second pilot (?pilot=2) */
  pilot: string
  /** online (Trystero and the public relays), local (other tabs of this browser only) or off */
  net: 'online' | 'local' | 'off'
  /** for ?net=local: ms of delay and jitter, and the share of fast messages lost and of pairs that fail */
  delay: number
  jitter: number
  loss: number
  fail: number
  /** a private name added to the room's, so a trial meets only itself (?room=mytest) */
  room: string
  /** relays to use instead of the built-in ones (?relays=wss://a,wss://b) */
  relays: string[]
  /** ?tutorial=off: a new pilot has the first sortie behind him and starts at his capital world, as before it (for the tools) */
  tutorial: boolean
  /** ?intro=off (or ?tutorial=off): a new pilot does not see the opening story first (for the tools) */
  intro: boolean
  /** ?wing=…: he came by another pilot's link, to fly on his wing (net/wing.ts); null: he did not */
  wing: Wing | null
}

export function netFromQuery(query: Pick<URLSearchParams, 'get'>): NetSettings {
  const num = (key: string, lo: number, hi: number) => {
    const n = Number(query.get(key))
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 0
  }
  const word = (key: string) => (query.get(key) ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 24)
  const net = query.get('net')
  return {
    pilot: word('pilot') || 'main',
    net: net === 'local' || net === 'off' ? net : 'online',
    delay: num('delay', 0, 2000),
    jitter: num('jitter', 0, 2000),
    loss: num('loss', 0, 1),
    fail: num('fail', 0, 1),
    room: word('room'),
    relays: (query.get('relays') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^wss?:\/\/[^\s]+$/.test(s)),
    tutorial: query.get('tutorial') !== 'off',
    intro: query.get('intro') !== 'off' && query.get('tutorial') !== 'off',
    wing: readWing(query.get('wing')),
  }
}
