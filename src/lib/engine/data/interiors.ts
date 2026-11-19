// The places inside (the plan's section 6, "Interiors"): the hangar at a base or station, the
// station deck, and a ship's own rooms. Rooms are tiles of TILE px: walls, floor, doors, the
// furniture and props in them, and the spots a pilot can use. The hangar and the deck are laid out
// by hand here; a ship's rooms are worked out from its hull's shape (interior/rooms.ts), each kind
// of room with its own floor, the things on its walls, and its fit-out (the polish pass, item 7:
// built towards the mockups art/mockups/room-*.png). Starting values, to tune by playing.

/** px a tile is across (the room's own pixels, drawn at the scene's zoom inside) */
export const TILE = 8

/**
 * How a pilot walks inside: px a second walking and running, his size against walls and props, px of floor a step
 * covers. Inside, the rooms are drawn larger than the world outside (a ship's rooms are its hull at SHIP_SCALE), and
 * the pilot is drawn from his larger sprite; the art pixels are `zoom` times larger, so he stands about as tall on
 * the screen as he does outside.
 */
export const INSIDE = { walk: 30, run: 44, radius: 2.5, reach: 12, stride: 5.5, zoom: 1.5 }

/**
 * Up out of the seat in flight (James, 2026-11-18: "walk around the ship when its flying"): the ship flies on by itself
 * while he walks its rooms. A hit shakes the room (`shake` px at most, dying away over `shakeT` s) and flashes it (red
 * for the hull, `flashT` s; blue for the shield, less); the warning line stays `warnT` s after a hit, and says a missile
 * is coming while one is `missile` s away or nearer; the alarm sounds once a hit, no oftener than every `alarm` s. Round
 * the rooms, the outside: a world's ground far below, `below` ground px to a room px and hazed `haze` (of 256) by the air
 * between; in space, stars at two depths moving `stars` and twice that of a px for each px flown.
 */
export const UP_IN_FLIGHT = { shake: 2, shakeT: 0.45, flashT: 0.3, warnT: 3, missile: 6, alarm: 1.5, below: 0.45, haze: 120, stars: 0.06 }

/**
 * The margin kept clear (px: `top` for the page's row of buttons) where a room is drawn whole in the frame. Every place
 * inside is drawn at one art pixel (INSIDE.zoom) and the camera follows the pilot where it is larger than the frame (the
 * fresh review: fitted whole, the hangar and the deck showed the same pilot at two sizes; `side` is no longer used).
 */
export const FIT = { top: 12, side: 4 }

/** hull px a tile of a ship's rooms stands for: its rooms are its hull TILE / SHIP_SCALE times over (and the hangar shows it as large: BIG) */
export const SHIP_SCALE = 1.75
/** how many times larger a ship is drawn in the hangar than it flies, so it is the size of its own rooms beside the pilot inside */
export const BIG = 2.5

/** what each spot does when Use is pressed by it (the page opens the screens; doors are the scene's) */
export type SpotId = 'bench' | 'booth' | 'vault' | 'shop' | 'board' | 'deck' | 'hangar' | 'out' | 'aboard' | 'seat' | 'hatch'

export const SPOT_WORDS: Record<SpotId, string> = {
  bench: 'LOADOUT BENCH',
  booth: 'PAINT BOOTH',
  vault: 'VAULT',
  shop: 'SHOP',
  board: 'FACTION BOARD',
  deck: 'TO THE DECK',
  hangar: 'TO THE HANGAR',
  out: 'TO YOUR SHIP',
  aboard: 'GO ABOARD',
  seat: 'TAKE THE SEAT',
  hatch: 'OUT OF THE HATCH',
}

/** what a spot says instead in flight, where it does nothing (the hatch is sealed) */
export const SPOT_IN_FLIGHT: Partial<Record<SpotId, string>> = {
  hatch: 'HATCH SEALED IN FLIGHT',
}

/**
 * Which way a piece faces into its room: 's' down the screen (its back to the wall above it), 'e' to the right (its back
 * to a wall on its left), 'w' to the left, 'n' up the screen (its back to the wall below it, nearest the camera: only its
 * back shows). A piece that stands against a wall is drawn for each (its art and `-s`, `-e`, `-w`, `-n`).
 */
export type Face = 's' | 'e' | 'w' | 'n'

export const isFace = (v: unknown): v is Face => v === 's' || v === 'e' || v === 'w' || v === 'n'

/** a piece of furniture placed in a ship's rooms: its foot (tiles) and the way it faces (worked out from the walls when not said) */
export interface Piece {
  id: string
  x: number
  y: number
  face?: Face
}

/**
 * A piece of the places inside (the tiling rule: CLAUDE.md, docs/pixel-art-techniques.md "Interiors: one projection").
 * Every piece is drawn top-down and square-on on the grid of TILE px tiles, its picture exactly covering its footprint
 * and rising `rise` tiles into the row behind it:
 * - `art`: its pictures in interior/art.ts, one for each facing it has (`<art>-s`, `-e`, `-w`, `-n`);
 * - `block`: its footprint in whole tiles as it faces 's' (across, deep), turned for 'e' and 'w'; its anchor (a placed
 *   piece's x, y) is its front left tile, the one nearest the bottom of the screen on the left;
 * - `rise`: how far it stands up into the row behind, in tiles (its picture is `deep + rise` tiles tall);
 * - `faces`: the facings it is drawn in, and so may stand in (a facing whose every try failed the check is left out
 *   until one passes: tools/gen/interiors.py <art>-<face> --tries 30);
 * - `against`: built against a wall: the whole side behind it (opposite its facing) must be flush to wall;
 * - `use`: used from in front: the tile before its front's middle must be open floor, reached from the doorways;
 * - `wall`: it hangs on a wall's face instead (a lamp, a porthole, a door); `flat`: it lies on the floor, walked over;
 *   `light`: it lights the floor round it.
 * The art is made by tools/gen/interiors.py and tools/voxel/interiors.py, which check it fills the footprint.
 */
export interface PropKind {
  art: string
  block: [number, number]
  rise: number
  faces: Face[]
  against?: boolean
  use?: boolean
  wall?: boolean
  flat?: boolean
  light?: number
}

const ALL: Face[] = ['s', 'e', 'w', 'n']
const ON_WALL: PropKind = { art: '', block: [0, 0], rise: 0, faces: ['s'], wall: true }
/** built in against a wall, drawn in every facing */
const built = (art: string, across: number, rise: number, more: Partial<PropKind> = {}): PropKind => ({
  art,
  block: [across, 1],
  rise,
  faces: ALL,
  against: true,
  use: true,
  ...more,
})
/** standing free, one facing */
const free = (art: string, across: number, deep: number, rise: number, more: Partial<PropKind> = {}): PropKind => ({
  art,
  block: [across, deep],
  rise,
  faces: ['s'],
  ...more,
})

export const PROPS: Record<string, PropKind> = {
  // on the walls
  door: { ...ON_WALL, art: 'door' },
  hangardoor: { ...ON_WALL, art: 'hangardoor', light: 0.3 },
  walllamp: { ...ON_WALL, art: 'walllamp', light: 1 },
  porthole: { ...ON_WALL, art: 'porthole', light: 0.3 },
  window: { ...ON_WALL, art: 'window', light: 0.5 },
  wallscreen: { ...ON_WALL, art: 'wallscreen', light: 0.4 },
  charts: { ...ON_WALL, art: 'charts' },
  pipes: { ...ON_WALL, art: 'pipes' },
  vent: { ...ON_WALL, art: 'vent' },
  // the hangar: its stations big and built into the wall at the top, seen from the front (a pegboard over the loadout
  // bench, shelves of paint over the paint station's counter, the vault's round door), a service gantry each side of the
  // bay, a spare engine on its stand, fuel pumps, tool cabinets, missiles on their trolley, drums and crates, the bay's markings
  bench: { ...built('hbench', 5, 2.5), faces: ['s'], light: 0.4 },
  booth: { ...built('hbooth', 5, 2.5), faces: ['s'], light: 0.4 },
  vault: { ...built('hvault', 4, 2.75), faces: ['s'] },
  hconsole: { ...built('hconsole', 3, 2), faces: ['s'], light: 0.5, use: false },
  rack: { ...built('partsrack', 2, 1.25), faces: ['s', 'w'], use: false },
  gantry: { art: 'hgantry', block: [5, 2], rise: 1.5, faces: ['e', 'w'], light: 0.3 },
  fuelpump: built('fuelpump', 1, 2, { faces: ['s', 'e', 'w'], use: false, light: 0.2 }),
  htoolcab: { ...built('htoolcab', 2, 1.5), faces: ['e', 'w'], use: false },
  hcrates: free('hcrates', 2, 2, 1),
  hdrums: free('hdrums', 2, 1, 1),
  hcart: free('hcart', 2, 1, 0.75),
  hmissiles: free('hmissiles', 3, 1, 0.5),
  hengine: free('hengine', 3, 2, 1.25),
  bay: free('bay', 12, 14, 0, { flat: true }),
  crates: free('crates', 1, 1, 0.75),
  crate: free('crate', 1, 1, 0.4),
  barrels: free('barrels', 1, 1, 0.6),
  toolchest: built('toolcab', 1, 0.6),
  // the station deck
  counter: { ...built('counter', 3, 1), faces: ['s'], light: 0.4 },
  board: { ...built('board', 3, 1.25), faces: ['s'] },
  bar: { ...built('bar', 3, 0.6), faces: ['s'], light: 0.5 },
  seat: built('crewbench', 2, 0.4),
  stool: free('stool', 1, 1, 0.25),
  plant: free('planter', 1, 1, 0.5),
  // a ship's rooms: the flight console at a cockpit's front (a fixture), and the pieces built against its walls
  console: { ...built('console', 2, 0.5), block: [2, 2], faces: ['s'], light: 0.6 },
  sideconsole: built('sideconsole', 2, 0.5, { light: 0.3 }),
  bunk: built('berth', 2, 0.4),
  bunkbed: built('berthstack', 2, 1.25),
  locker: built('locker', 1, 1.25),
  shelf: built('shelf', 1, 1.25),
  galley: built('galley', 2, 0.5),
  sofa: built('crewbench', 2, 0.4),
  trophy: built('trophy', 1, 1),
  screen: built('radar', 1, 0.5, { light: 0.3 }),
  cargo: built('cargorack', 2, 1, { use: false }),
  fishtank: built('aquarium', 2, 0.75, { light: 0.4 }),
  weaponrack: built('weaponrack', 1, 1),
  engconsole: built('engconsole', 2, 0.5, { light: 0.3 }),
  // … and standing free (those on a room's middle line two tiles across, so they are centred on it)
  chair: free('crewseat', 1, 1, 0.4),
  maptable: free('maptable', 2, 2, 0.4, { light: 0.8 }),
  globe: free('hologlobe', 1, 1, 0.75, { light: 0.4 }),
  table: free('messtable', 2, 2, 0.4),
  rug: free('deckmat', 2, 2, 0, { flat: true }),
  lamp: free('decklight', 1, 1, 1, { light: 0.8 }),
  reactor: free('reactor', 2, 2, 0.75, { light: 1.2 }),
  loader: free('loader', 2, 2, 0.5),
}

/** a piece's tiles across and deep as it faces */
export function blockOf(k: PropKind, face: Face): [number, number] {
  const bw = Math.max(1, k.block[0])
  const bd = Math.max(1, k.block[1])
  return face === 'e' || face === 'w' ? [bd, bw] : [bw, bd]
}

/** its picture as it faces (a thing on a wall has one) */
export const artOf = (k: PropKind, face: Face) => (k.wall ? k.art : `${k.art}-${face}`)

/** furniture a pilot buys and places in his ship's rooms (each piece bought is one to place); the ids are those of the saves */
export const FURNITURE: { id: string; name: string; price: number }[] = [
  { id: 'bunk', name: 'Berth', price: 140 },
  { id: 'bunkbed', name: 'Berth stack', price: 220 },
  { id: 'locker', name: 'Locker', price: 90 },
  { id: 'shelf', name: 'Shelf', price: 70 },
  { id: 'maptable', name: 'Star map table', price: 420 },
  { id: 'globe', name: 'Holo globe', price: 110 },
  { id: 'galley', name: 'Galley', price: 260 },
  { id: 'table', name: 'Mess table', price: 120 },
  { id: 'chair', name: 'Crew seat', price: 45 },
  { id: 'sofa', name: 'Crew bench', price: 160 },
  { id: 'rug', name: 'Deck mat', price: 80 },
  { id: 'lamp', name: 'Deck light', price: 60 },
  { id: 'plant', name: 'Planter', price: 50 },
  { id: 'trophy', name: 'Trophy case', price: 300 },
  { id: 'fishtank', name: 'Aquarium', price: 240 },
  { id: 'screen', name: 'Radar station', price: 180 },
  { id: 'sideconsole', name: 'Side console', price: 150 },
  { id: 'weaponrack', name: 'Weapon rack', price: 200 },
  { id: 'cargo', name: 'Cargo rack', price: 150 },
  { id: 'crates', name: 'Crates', price: 40 },
  { id: 'barrels', name: 'Barrels', price: 40 },
  { id: 'toolchest', name: 'Tool cabinet', price: 90 },
  { id: 'loader', name: 'Lift loader', price: 280 },
  { id: 'engconsole', name: 'Engine console', price: 150 },
]

/** the kinds of room a ship has, front to back */
export type RoomKind = 'cockpit' | 'cabin' | 'map' | 'quarters' | 'cargo' | 'engine'

/**
 * Where a fit-out puts a piece in its room (the rules, after James on the bunks: "randomly plonked in middle of a room"):
 * - 'sides': a pair against the side walls, facing each other across the room, as far forward (up the screen) as fits;
 *   `fill`: as many pairs as fit, one behind the other;
 * - 'feet': a pair against the side walls, each at the foot of the piece before it on that wall (a locker by a berth);
 * - 'back': a pair against the wall at the top of the room, either side of its doorway;
 * - 'corners': a pair in the top corners, against the wall at the top;
 * - 'middle': one, standing free, centred on the room's middle line and in its depth.
 * Pieces of a pair mirror each other (the hulls are even about their middle line, so are their rooms); a piece is placed
 * only where the way from the hatch to every door, to the seat and to the front of every piece stays open.
 */
export type Where = 'sides' | 'feet' | 'back' | 'corners' | 'middle'

/**
 * Each kind of room: its name, its floor, how much of the ship's length it wants (shared by weight), the least rows of
 * floor it needs, what hangs on its back wall (in turn along it, a lamp between), and its recipe: the pieces a new ship
 * comes with, in order, each where its rule says if there is room. The pilot moves them from there.
 */
export const ROOM_KINDS: Record<
  RoomKind,
  { name: string; floor: string; weight: number; rows: number; decor: string[]; kit: [string, Where, boolean?][] }
> = {
  cockpit: {
    name: 'COCKPIT',
    floor: 'floor-ship',
    weight: 1.3,
    rows: 4,
    decor: ['wallscreen', 'porthole'],
    kit: [
      ['sideconsole', 'sides'],
      ['shelf', 'feet'],
    ],
  },
  cabin: {
    name: 'CABIN',
    floor: 'floor-quarters',
    weight: 1,
    rows: 3,
    decor: ['porthole', 'charts'],
    kit: [
      ['bunk', 'sides'],
      ['locker', 'feet'],
      ['shelf', 'back'],
      ['table', 'middle'],
      ['lamp', 'corners'],
    ],
  },
  map: {
    name: 'MAP ROOM',
    floor: 'floor-ship',
    weight: 1.2,
    rows: 5,
    decor: ['wallscreen', 'charts', 'wallscreen'],
    kit: [
      ['maptable', 'middle'],
      ['sideconsole', 'sides'],
      ['screen', 'feet'],
      ['shelf', 'back'],
      ['globe', 'corners'],
    ],
  },
  quarters: {
    name: 'CREW QUARTERS',
    floor: 'floor-quarters',
    weight: 1.5,
    rows: 4,
    decor: ['porthole', 'vent', 'porthole'],
    kit: [
      ['bunkbed', 'sides', true],
      ['shelf', 'feet'],
      ['table', 'middle'],
      ['galley', 'back'],
      ['trophy', 'back'],
      ['plant', 'corners'],
    ],
  },
  cargo: {
    name: 'CARGO BAY',
    floor: 'floor-cargo',
    weight: 1.4,
    rows: 3,
    decor: ['vent', 'pipes'],
    kit: [
      ['cargo', 'sides', true],
      ['rug', 'middle'],
      ['crates', 'corners'],
      ['barrels', 'back'],
    ],
  },
  engine: {
    name: 'ENGINE ROOM',
    floor: 'floor-engine',
    weight: 1.1,
    rows: 3,
    decor: ['pipes', 'vent', 'pipes'],
    kit: [
      ['engconsole', 'back'],
      ['weaponrack', 'sides'],
      ['toolchest', 'feet'],
    ],
  },
}

/** the rooms each hull is built with, front to back, as many as its size has room for (the cockpit always; the rest dropped from the end) */
export const SHIP_ROOMS: Record<string, RoomKind[]> = {
  dart: ['cockpit', 'cabin'],
  sparrow: ['cockpit', 'cabin'],
  lance: ['cockpit', 'cabin'],
  corsair: ['cockpit', 'cabin', 'engine'],
  wraith: ['cockpit', 'map', 'cabin'],
  prospector: ['cockpit', 'cargo', 'quarters', 'engine'],
  mule: ['cockpit', 'cargo', 'quarters', 'engine'],
  bastion: ['cockpit', 'quarters', 'engine'],
  nomad: ['cockpit', 'map', 'quarters', 'engine'],
  galleon: ['cockpit', 'map', 'quarters', 'cargo', 'engine'],
}

/** a room laid out by hand: its tiles ('#' wall, '.' floor, 'L' floor painted as a walkway, ' ' nothing, 'D' a doorway), its floor (and the walkways'), wall and the things on its back wall (tile x of each), the props in it (tile x, y of the footprint's front left tile, and its facing if not the first its walls allow), its spots (tile x, y; what each does), and where a ship stands on show (tiles; the hangar) */
export interface Layout {
  tiles: string[]
  floor: string
  lane?: string
  wall: string
  decor: { id: string; x: number }[]
  props: { id: string; x: number; y: number; face?: Face; w?: number; h?: number }[]
  spots: { id: SpotId; x: number; y: number }[]
  ship?: { x: number; y: number }
}

/**
 * The hangar (the last pass: built towards art/mockups/hangar-wide-3.png, wide as a screen and seen whole): the pilot's ship
 * on show nose up on a marked bay in the middle, under big hangar doors in the wall at the top, a service gantry each side
 * of it; built into that wall either side of the doors, seen from the front, the loadout bench (a pegboard of tools over a
 * workbench with a gun pod on it) and the hangar's console on the left, the paint station (shelves of paint, a spray arm)
 * and the vault's round door on the right; fuel pumps, tool cabinets and a parts rack along the side walls; a spare
 * engine on its stand, missiles on their trolleys, tool carts, fuel drums and crates about the floor; walkways painted on the floor along the stations and
 * round the bay to the way back out to the pad at the bottom; the door up to the deck in the top left corner.
 */
export const HANGAR: Layout = hangarLayout(12, 14)

/** px of floor left between a ship on show and the edge of its bay, each side and each end (the fresh review: a Galleon's
 * wings lay across the bay's stripes and its nose through the back wall) */
export const BAY_MARGIN = 12

/** the bay a ship's larger build (`w` × `l` px) needs, in tiles: a margin round it, never less than the hangar's own (12 × 14) */
export function bayFor(w: number, l: number) {
  const across = Math.max(12, Math.ceil((w + BAY_MARGIN * 2) / TILE / 2) * 2)
  const along = Math.max(14, Math.ceil((l + BAY_MARGIN * 2) / TILE))
  return { across, along }
}

/**
 * The hangar laid out round a bay `across` × `along` tiles (bayFor): as wide and as long as the bay needs, the stations
 * on the right side and the doors moved out with it, the gantries at the bay's middle, the way out below it. With the
 * hangar's own bay (12 × 14) it is the hangar as it was drawn.
 */
export function hangarLayout(across: number, along: number): Layout {
  const dx = across - 12
  const dy = along - 14
  const W = 38 + dx
  const row = (edge: string, fill: string, mid: string) => edge + mid.padEnd(W - 2, fill) + edge
  const tiles: string[] = []
  for (let y = 0; y < 3; y++) tiles.push('##DD' + '#'.repeat(W - 4))
  tiles.push(row('#', '.', ''))
  tiles.push(row('#', 'L', ''))
  for (let y = 0; y < 14 + dy; y++) tiles.push('#......L' + '.'.repeat(22 + dx) + 'L......#')
  tiles.push('#......' + 'L'.repeat(24 + dx) + '......#')
  tiles.push('#'.repeat(W / 2 - 1) + 'DD' + '#'.repeat(W / 2 - 1))
  const right = (x: number) => x + dx
  const mid = Math.round(dy / 2)
  return {
    tiles,
    floor: 'floor-hangar',
    lane: 'floor-lane',
    wall: 'wall-hangar',
    decor: [
      { id: 'walllamp', x: 4.5 },
      { id: 'walllamp', x: 10.5 },
      { id: 'walllamp', x: 14.5 },
      { id: 'hangardoor', x: 19 + dx / 2 },
      { id: 'walllamp', x: right(23.5) },
      { id: 'walllamp', x: right(29.5) },
      { id: 'walllamp', x: right(34.5) },
    ],
    props: [
      { id: 'bay', x: 13, y: 17 + dy, w: across, h: along },
      { id: 'bench', x: 5, y: 3 },
      { id: 'hconsole', x: 11, y: 3 },
      { id: 'booth', x: right(24), y: 3 },
      { id: 'vault', x: right(30), y: 3 },
      { id: 'rack', x: right(35), y: 3 },
      { id: 'gantry', x: 10, y: 12 + mid, face: 'e' },
      { id: 'gantry', x: right(26), y: 12 + mid, face: 'w' },
      { id: 'fuelpump', x: 1, y: 8, face: 'e' },
      { id: 'htoolcab', x: 1, y: 12 + mid, face: 'e' },
      { id: 'htoolcab', x: 1, y: 15 + dy, face: 'e' },
      { id: 'fuelpump', x: right(36), y: 8, face: 'w' },
      { id: 'rack', x: right(36), y: 12 + mid, face: 'w' },
      { id: 'htoolcab', x: right(36), y: 15 + dy, face: 'w' },
      { id: 'hmissiles', x: 3, y: 6 },
      { id: 'hcart', x: 4, y: 10 + mid },
      { id: 'hengine', x: 3, y: 15 + dy },
      { id: 'hcrates', x: 1, y: 19 + dy },
      { id: 'hdrums', x: 3, y: 19 + dy },
      { id: 'hdrums', x: right(32), y: 6 },
      { id: 'hcart', x: right(32), y: 10 + mid },
      { id: 'hmissiles', x: right(32), y: 15 + dy },
      { id: 'hdrums', x: right(32), y: 19 + dy },
      { id: 'hcrates', x: right(34), y: 19 + dy },
    ],
    spots: [
      { id: 'bench', x: 7.5, y: 4.6 },
      { id: 'booth', x: right(26.5), y: 4.6 },
      { id: 'vault', x: right(32), y: 4.6 },
      { id: 'deck', x: 3, y: 3.2 },
      { id: 'out', x: 19 + dx / 2, y: 20.4 + dy },
    ],
    ship: { x: 19 + dx / 2, y: 11 + dy / 2 },
  }
}

/**
 * The station deck (after art/mockups/deck-topdown-1.png): the shop's counter, the bar under a great window onto space
 * with its stools, and the faction board along the wall at the top, a trophy case, an aquarium and screens between them; a
 * holo chart table in the middle of the floor, a mess table with its seats either side, deck lights about them; crew
 * benches and planters along the side walls; cargo crates come up from the hangar in the corners by the way down, between
 * planters and deck lights; other pilots about. (Polish step 9: it had been a wide, nearly empty floor.)
 */
export const DECK: Layout = {
  tiles: [
    '############################',
    '############################',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#..........................#',
    '#############DD#############',
  ],
  floor: 'floor-deck',
  wall: 'wall-deck',
  decor: [
    { id: 'walllamp', x: 1.5 },
    { id: 'walllamp', x: 7.5 },
    { id: 'wallscreen', x: 10.5 },
    { id: 'window', x: 14 },
    { id: 'wallscreen', x: 17.5 },
    { id: 'walllamp', x: 20 },
    { id: 'walllamp', x: 26.5 },
  ],
  props: [
    { id: 'counter', x: 2, y: 2 },
    { id: 'trophy', x: 6, y: 2 },
    { id: 'fishtank', x: 8, y: 2 },
    { id: 'bar', x: 12, y: 2 },
    { id: 'stool', x: 12, y: 3 },
    { id: 'stool', x: 13, y: 3 },
    { id: 'stool', x: 14, y: 3 },
    { id: 'fishtank', x: 18, y: 2 },
    { id: 'board', x: 21, y: 2 },
    { id: 'trophy', x: 25, y: 2 },
    { id: 'maptable', x: 13, y: 6 },
    { id: 'table', x: 5, y: 6 },
    { id: 'chair', x: 4, y: 6 },
    { id: 'chair', x: 4, y: 7 },
    { id: 'chair', x: 7, y: 6 },
    { id: 'chair', x: 7, y: 7 },
    { id: 'table', x: 21, y: 6 },
    { id: 'chair', x: 20, y: 6 },
    { id: 'chair', x: 20, y: 7 },
    { id: 'chair', x: 23, y: 6 },
    { id: 'chair', x: 23, y: 7 },
    { id: 'lamp', x: 10, y: 6 },
    { id: 'lamp', x: 17, y: 6 },
    { id: 'seat', x: 1, y: 6 },
    { id: 'seat', x: 1, y: 10 },
    { id: 'seat', x: 26, y: 6 },
    { id: 'seat', x: 26, y: 10 },
    { id: 'plant', x: 1, y: 4 },
    { id: 'plant', x: 26, y: 4 },
    { id: 'rug', x: 13, y: 9 },
    { id: 'crates', x: 2, y: 12 },
    { id: 'barrels', x: 3, y: 12 },
    { id: 'crate', x: 2, y: 11 },
    { id: 'barrels', x: 24, y: 12 },
    { id: 'crates', x: 25, y: 12 },
    { id: 'plant', x: 8, y: 12 },
    { id: 'plant', x: 9, y: 12 },
    { id: 'lamp', x: 10, y: 12 },
    { id: 'lamp', x: 17, y: 12 },
    { id: 'plant', x: 18, y: 12 },
    { id: 'plant', x: 19, y: 12 },
  ],
  spots: [
    { id: 'shop', x: 3.5, y: 3.5 },
    { id: 'board', x: 22.5, y: 3.5 },
    { id: 'hangar', x: 14, y: 13.4 },
  ],
}

/** people about the deck when no other pilot is: how many, and how often each picks somewhere else to stand */
export const DECK_CROWD = { count: 9, wander: 6 }
