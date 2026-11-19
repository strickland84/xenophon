// The six races (docs/factions-and-races.md): three a side, cosmetic only. A pilot is one of
// his side's three, and his look is a few choices on top of the race's art (races/art.ts, drawn
// by the image model): which of its four faces, a skin (or feathers, brass, shell, fuzz or cap)
// of five, eyes (or a lens, or lanterns) of five, and the two colours of his suit. The same
// choices colour his portrait and his tiny in-world sprite, so others know him by both.
//
// A look travels as one short line of text (lookText / lookOf): in the settings, the save and
// the pilot's card.

import { mulberry32 } from '../util/math'

export type RaceId = 'solari' | 'kestrin' | 'orrin' | 'skarn' | 'noctil' | 'thallin'
export type Side = 'nomarchy' | 'anarchoi'

export interface Race {
  id: RaceId
  name: string
  side: Side
  /** one line on what they are, for the creator */
  what: string
  /** what the skin choice changes, as the creator names it */
  skinName: string
  /** what the eyes choice changes */
  eyesName: string
  /** the skins (the first: as drawn) and eyes (the first: as drawn), as colours the body's or the glow's colours are moved to */
  skins: string[]
  eyes: string[]
}

export const RACES: Race[] = [
  {
    id: 'solari',
    name: 'Solari',
    side: 'nomarchy',
    what: 'Humans of the founding houses. Their names were the first out of the urn, and they still sign everything.',
    skinName: 'Skin',
    eyesName: 'Visor',
    skins: ['', '#8d5524', '#c68642', '#e8b88a', '#5c3a21'],
    eyes: ['', '#40e0ff', '#ffb030', '#60ff70', '#ff4060'],
  },
  {
    id: 'kestrin',
    name: 'Kestrin',
    side: 'nomarchy',
    what: 'Small, light-boned bird people. They fly before they can read, and some never get round to reading.',
    skinName: 'Feathers',
    eyesName: 'Throat',
    skins: ['', '#58c4a0', '#e8e4dc', '#d87a3a', '#8a6ae0'],
    eyes: ['', '#ff5a3a', '#40e0ff', '#ff6ad0', '#f2f2f2'],
  },
  {
    id: 'orrin',
    name: 'Orrin',
    side: 'nomarchy',
    what: 'Brass people built to keep the Nomarchy’s register. They were given lots of their own after they audited their makers.',
    skinName: 'Plating',
    eyesName: 'Lens',
    skins: ['', '#c87533', '#a8b4c0', '#7a5a2a', '#f0c850'],
    eyes: ['', '#ffb030', '#60ff70', '#ff4060', '#c080ff'],
  },
  {
    id: 'skarn',
    name: 'Skarn',
    side: 'anarchoi',
    what: 'Broad, shell-backed clan fighters who grow their own armour and count their battles by the chips in it.',
    skinName: 'Shell',
    eyesName: 'Eyes',
    skins: ['', '#6b7a3a', '#5a6070', '#a0482a', '#c8a870'],
    eyes: ['', '#ff4060', '#ffb030', '#40e0ff', '#60ff70'],
  },
  {
    id: 'noctil',
    name: 'Noctil',
    side: 'anarchoi',
    what: 'Moth people who steer by starlight and will not trust a map somebody else drew.',
    skinName: 'Fuzz',
    eyesName: 'Spots',
    skins: ['', '#9a9a9a', '#d08040', '#f0ece0', '#4a3a30'],
    eyes: ['', '#c080ff', '#ffb030', '#40e0ff', '#60ff70'],
  },
  {
    id: 'thallin',
    name: 'Thallin',
    side: 'anarchoi',
    what: 'Fungus people who grew in wrecked Nomarchy ships, and have been taking the rest of the fleet apart ever since.',
    skinName: 'Cap',
    eyesName: 'Lanterns',
    skins: ['', '#8a3ac0', '#7a5030', '#3a7ac0', '#e0d0a0'],
    eyes: ['', '#60ff70', '#ff8030', '#40e0ff', '#ff4060'],
  },
]

export const RACE_IDS = RACES.map((r) => r.id)
export const raceOf = (id: string): Race => RACES.find((r) => r.id === id) ?? RACES[0]
export const racesOf = (side: Side) => RACES.filter((r) => r.side === side)

/** how many faces a race has */
export const FACES = 4

/** a pilot's look: his race and the choices on top of it */
export interface PilotLook {
  race: RaceId
  face: number
  skin: number
  eyes: number
  /** the suit's colour and its trim's (#rrggbb) */
  suit: string
  trim: string
}

/** suit colours to pick from (any colour will do; these are the creator's) */
export const SUITS = ['#3a4a6a', '#545969', '#6a3030', '#2f5a3a', '#e8e4dc', '#c8902a', '#4a3a6a', '#2a2a30', '#7a4a2a', '#2a6a7a']
export const TRIMS = ['#f2c14e', '#f0580e', '#5af0ff', '#ff5a8a', '#f2f2f2', '#60ff70', '#a46cf0', '#ff3a3a', '#1d2a3a', '#ffd23a']

const isColour = (s: unknown): s is string => typeof s === 'string' && /^#[0-9a-f]{6}$/i.test(s)

/** a look as one line of text: race.face.skin.eyes.suit.trim (colours without their #) */
export const lookText = (l: PilotLook) => `${l.race}.${l.face}.${l.skin}.${l.eyes}.${l.suit.slice(1)}.${l.trim.slice(1)}`

/** a look from its line of text (anything missing or wrong falls back: the race to the side's first) */
export function lookOf(text: string, side: Side | '' = ''): PilotLook {
  const [race, face, skin, eyes, suit, trim] = String(text ?? '').split('.')
  const r = RACES.find((x) => x.id === race && (!side || x.side === side)) ?? (side ? racesOf(side)[0] : RACES[0])
  const n = (v: string, most: number) => {
    const k = Number(v)
    return Number.isInteger(k) && k >= 0 && k < most ? k : 0
  }
  return {
    race: r.id,
    face: n(face, FACES),
    skin: n(skin, r.skins.length),
    eyes: n(eyes, r.eyes.length),
    suit: isColour('#' + suit) ? '#' + suit.toLowerCase() : SUITS[0],
    trim: isColour('#' + trim) ? '#' + trim.toLowerCase() : TRIMS[0],
  }
}

/** a look made at random for a side, from a seed (the same seed, the same look): the creator's Randomise, and a new pilot's first */
export function randomLook(side: Side, seed: number): PilotLook {
  const rnd = mulberry32(seed | 0)
  const pick = <T>(list: T[]) => list[Math.floor(rnd() * list.length) % list.length]
  const r = pick(racesOf(side))
  const suit = pick(SUITS)
  let trim = pick(TRIMS)
  if (trim === suit) trim = TRIMS[(TRIMS.indexOf(trim) + 1) % TRIMS.length]
  return {
    race: r.id,
    face: Math.floor(rnd() * FACES) % FACES,
    skin: Math.floor(rnd() * 5) % 5,
    eyes: Math.floor(rnd() * 5) % 5,
    suit,
    trim,
  }
}
