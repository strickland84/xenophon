// What can be carried and sold (the plan's section 11): the ores a world's ground holds, and
// salvage from wrecks; and from space, helion gas skimmed from a giant's bands and void shards
// from round a black hole. Each has a price in credits a unit before the day's drift (the market
// in galaxy/market.ts moves it), and stacks so many to a slot of a hold or the vault. The
// colours are the image model's (world/prefabs.ts, space/art.ts); a chunk of ore shines in them.
// And what the worlds' creatures drop (data/creatures.ts): hide, chitin, glands, and the rare
// heartstone (colours from the image model's pictures of them, creatures/art.ts).

import { FEATURE_COLOURS } from '../world/prefabs'
import { SPACE_COLOURS } from '../space/art'
import { LOOT_COLOURS } from '../creatures/art'

export type ResourceId =
  | 'ferrite'
  | 'silica'
  | 'cryo-ice'
  | 'magma-glass'
  | 'bioresin'
  | 'salvage'
  | 'helion'
  | 'void'
  | 'hide'
  | 'chitin'
  | 'gland'
  | 'heartstone'

/** what creatures drop (never in the ground) */
export type WildPart = 'hide' | 'chitin' | 'gland' | 'heartstone'

/** what the ground of a world can hold: anything but what is only found in space, or on a creature */
export type GroundOre = Exclude<ResourceId, 'helion' | 'void' | WildPart>

export interface Resource {
  id: ResourceId
  /** as a player reads it, and short, for the HUD */
  name: string
  short: string
  /** credits a unit, before the day's drift */
  price: number
  /** units to a slot */
  stack: number
  /** its colours, light, middle and dark (r, g, b), from the pictures */
  colours: number[][]
  /** it glows in the dark (magma glass) */
  glow: boolean
  /** a creature's (every market pays its standard, as for salvage: no world's ground holds it) */
  wild: boolean
  /** rare enough to glint where it lies */
  rare: boolean
}

const res = (id: ResourceId, name: string, short: string, price: number, glow = false, rare = false): Resource => ({
  id,
  name,
  short,
  price,
  stack: 10,
  colours: FEATURE_COLOURS[id] ?? SPACE_COLOURS[id] ?? LOOT_COLOURS[id],
  glow,
  wild: id in LOOT_COLOURS,
  rare,
})

export const RESOURCES: Record<ResourceId, Resource> = {
  ferrite: res('ferrite', 'Ferrite', 'FER', 6),
  silica: res('silica', 'Silica', 'SIL', 9),
  'cryo-ice': res('cryo-ice', 'Cryo-ice', 'ICE', 12),
  'magma-glass': res('magma-glass', 'Magma glass', 'MAG', 16, true),
  bioresin: res('bioresin', 'Bioresin', 'RES', 14),
  salvage: res('salvage', 'Salvage', 'SAL', 20),
  helion: res('helion', 'Helion gas', 'GAS', 11),
  void: res('void', 'Void shards', 'VOI', 64, true),
  hide: res('hide', 'Hide', 'HID', 8),
  chitin: res('chitin', 'Chitin', 'CHI', 11),
  gland: res('gland', 'Venom gland', 'GLA', 24, true),
  heartstone: res('heartstone', 'Heartstone', 'HRT', 110, true, true),
}

export const RESOURCE_IDS = Object.keys(RESOURCES) as ResourceId[]

export const isResource = (s: unknown): s is ResourceId => typeof s === 'string' && s in RESOURCES

/** a recipe's name for an ore (galaxy/recipe.ts) as a resource */
export const resourceOf = (ore: string): GroundOre =>
  ore === 'magma glass'
    ? 'magma-glass'
    : isResource(ore) && ore !== 'helion' && ore !== 'void' && !RESOURCES[ore].wild
      ? (ore as GroundOre)
      : 'ferrite'
