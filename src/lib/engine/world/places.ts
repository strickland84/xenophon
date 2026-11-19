// The places found out over a world, away from its bases: a settlement (a dome, cabins, a greenhouse on packed
// ground), the ruins of something older, a ring of standing stones, a relay's dish on its deck, a mine's works.
// Nobody holds them and nothing is bought there; they are what there is to come upon in a world sixty-four times
// the size its bases' ground is (world/lands.ts), each with a name of its own.
//
// Where they are is worked out from the world's seed alone, a few spots to a region, the same for everyone. What
// stands there is laid into the ground when that ground comes into the scene's hold of it (the window: lands.ts),
// if the ground will take it (land, level enough, clear of a base and of ore), and is laid again each time the
// ground is written in afresh. Their pictures are the image model's (tools/gen/places.py → tools/voxel/places.py →
// world/placeart.ts); the ground under them is packed as a base's is (features.ts).

import type { WorldRecipe } from '../galaxy/recipe'
import { hash2 } from '../util/exact'
import { APRON, castBox, levelSite, PLACE_MAT, RUBBLE, RUBBLE_DARK, siteOf, stamp, structureMat, HAZARD_Y } from './features'
import { CHUNK, inWindow, WORLD } from './lands'
import { PLACE_ART } from './placeart'
import { PREFABS } from './prefabs'
import { sunFor } from './shape'
import { N, NSHIFT } from './world'
import type { World } from './world'

/** what stands at a place: each piece (a place's picture, or one of a base's buildings: `base`), where its middle is from the place's */
interface Piece {
  art: string
  x: number
  y: number
  base?: boolean
}
interface Kind {
  /** half the packed ground's size (0: none: it stands on the ground as it is) */
  ground: [number, number]
  /** rubble strewn about it instead of packed earth */
  rubble?: boolean
  pieces: Piece[]
  /** what its name ends in */
  names: string[]
  /** out of 100: how many spots in a hundred are one */
  share: number
}
const KINDS: Record<string, Kind> = {
  settlement: {
    ground: [62, 44],
    pieces: [
      { art: 'dome', x: -4, y: -12 },
      { art: 'house', x: -40, y: -22 },
      { art: 'house', x: -44, y: 6 },
      { art: 'house', x: 30, y: -26 },
      { art: 'house', x: 38, y: -4 },
      { art: 'house', x: 24, y: 22 },
      { art: 'greenhouse', x: -16, y: 20 },
    ],
    names: ['Hollow', 'Reach', 'Stead', 'Rest', 'Ford', 'Haven', 'Cross', 'Fold'],
    share: 34,
  },
  ruins: { ground: [26, 26], rubble: true, pieces: [{ art: 'ruin', x: 0, y: 0 }], names: ['Ruin', 'Walls', 'Keep', 'Halls'], share: 24 },
  stones: { ground: [0, 0], pieces: [{ art: 'stones', x: 0, y: 0 }], names: ['Stones', 'Ring', 'Circle'], share: 14 },
  relay: {
    ground: [26, 20],
    pieces: [
      { art: 'tower', x: -8, y: 0 },
      { art: 'house', x: 16, y: 6 },
    ],
    names: ['Relay', 'Mast', 'Watch'],
    share: 14,
  },
  mine: {
    ground: [40, 26],
    pieces: [
      { art: 'rig', x: -14, y: 0 },
      { art: 'tanks', x: 22, y: -2, base: true },
    ],
    names: ['Works', 'Diggings', 'Shaft', 'Pit'],
    share: 14,
  },
}
const FIRST = [
  'Alder',
  'Brack',
  'Carrow',
  'Dunn',
  'Esker',
  'Farrow',
  'Garth',
  'Harl',
  'Iver',
  'Jessop',
  'Kell',
  'Lorne',
  'Marsh',
  'Nab',
  'Orrin',
  'Pell',
  'Quill',
  'Roan',
  'Sedge',
  'Thorn',
  'Ulm',
  'Varr',
  'Wold',
  'Yew',
  'Ashby',
  'Brine',
  'Coll',
  'Dray',
  'Finch',
  'Holt',
]
/** spots to a region, the px of a region's edge kept clear of them, the most uneven ground one is laid on, and how near a base or ore one may be */
const SPOTS = 5
const MARGIN = 300
const ROUGH = 9
const FROM_BASE = 340
const FROM_ORE = 70
/** the px round its middle a place's ground may reach (its packed ground, the slope back from it) */
const REACH = 100

/** a spot's place: which region, which of its spots, and what would stand there */
function spotOf(world: World, rx: number, ry: number, n: number) {
  const lands = world.lands!
  const s = lands.seed ^ 0x6c8e
  const h1 = hash2(rx * 7 + n, ry, s)
  const h2 = hash2(ry * 7 + n, rx, s ^ 0x55)
  const h3 = hash2(rx + n * 13, ry + n * 5, s ^ 0xaa)
  const span = N - MARGIN * 2
  const x = lands.ox + rx * N + MARGIN + Math.floor((h1 * span) / 256) + (h3 & 7)
  const y = lands.oy + ry * N + MARGIN + Math.floor((h2 * span) / 256) + ((h3 >> 3) & 7)
  let pick = (h3 * 100) >> 8
  let kind = 'settlement'
  for (const k of Object.keys(KINDS)) {
    kind = k
    pick -= KINDS[k].share
    if (pick < 0) break
  }
  const name = `${FIRST[(h1 + h2 * 3) % FIRST.length]} ${KINDS[kind].names[(h2 + h3) % KINDS[kind].names.length]}`
  return { x, y, kind, name, key: ((ry * 8 + rx) * SPOTS + n) | 0 }
}

/** the chunks (lands.ts) a place's ground is in */
function chunksOf(x: number, y: number) {
  const out: number[] = []
  const per = WORLD / CHUNK
  for (const dy of [-REACH, REACH])
    for (const dx of [-REACH, REACH]) {
      const cx = ((Math.floor((x + dx) / CHUNK) % per) + per) % per
      const cy = ((Math.floor((y + dy) / CHUNK) % per) + per) % per
      const c = cy * per + cx
      if (!out.includes(c)) out.push(c)
    }
  return out
}

/**
 * The places of the ground in the scene's hold now, after ground has been written into it (`wrote`: the chunks, lands.ts
 * bringWindow): those whose ground was written over are gone, and every spot whose ground is all there is laid, if the
 * ground will take it. `x`, `y`: where the hold is round.
 */
export function settlePlaces(world: World, recipe: WorldRecipe, x: number, y: number, wrote: number[]) {
  const lands = world.lands
  if (!lands) return
  const f = world.features
  if (wrote.length) f.places = f.places.filter((p) => !p.chunks.some((c) => wrote.includes(c)))
  const sun = sunFor(recipe.timeOfDay)
  const seen = new Set<number>()
  for (const dy of [-N / 2, N / 2])
    for (const dx of [-N / 2, N / 2]) {
      const rx = ((Math.floor((x + dx - lands.ox) / N) % 8) + 8) % 8
      const ry = ((Math.floor((y + dy - lands.oy) / N) % 8) + 8) % 8
      if (seen.has(ry * 8 + rx)) continue
      seen.add(ry * 8 + rx)
      for (let n = 0; n < SPOTS; n++) {
        const spot = spotOf(world, rx, ry, n)
        if (lands.noPlace.has(spot.key) || f.places.some((p) => p.name === spot.name && near(p.x - spot.x) < 4 && near(p.y - spot.y) < 4))
          continue
        // (the place of the world nearest the hold's middle: the world wraps)
        const px = x + near(spot.x - x)
        const py = y + near(spot.y - y)
        if (![-REACH, REACH].every((oy) => [-REACH, REACH].every((ox) => inWindow(world, px + ox, py + oy)))) continue
        const kind = KINDS[spot.kind]
        const [hw, hh] = kind.ground[0] ? kind.ground : [16, 16]
        const site = siteOf(world, px, py, hw, hh, false)
        const taken =
          f.bases.some((b) => apart(b.x - px, b.y - py) < FROM_BASE) || f.outcrops.some((o) => apart(o.x - px, o.y - py) < FROM_ORE)
        if (!site || site.rough > ROUGH || taken) {
          // (ground that will not take it: never, for it is the same ground whenever it is come back to)
          lands.noPlace.add(spot.key)
          continue
        }
        lay(world, spot.kind, px, py, site.level, spot.key, sun)
        f.places.push({ kind: spot.kind, name: spot.name, x: px, y: py, z: site.level, chunks: chunksOf(px, py) })
      }
    }
}

/** a difference of two places of a world of the galaxy, the short way round it; and how far apart two places that far apart each way are */
const near = (d: number) => d - WORLD * Math.round(d / WORLD)
const apart = (dx: number, dy: number) => Math.sqrt(near(dx) * near(dx) + near(dy) * near(dy))

/** lays a place into the ground: its ground packed (or strewn with rubble), its pieces, their shadows */
function lay(world: World, name: string, cx: number, cy: number, level: number, salt: number, sun: [number, number]) {
  const kind = KINDS[name]
  const [hw, hh] = kind.ground
  if (hw) {
    levelSite(world, cx, cy, hw, hh, level, salt * 31 + 7)
    if (kind.rubble) {
      // (old ground: broken stone where a base's would be packed earth)
      for (let y = -hh - 30; y <= hh + 30; y++)
        for (let x = -hw - 30; x <= hw + 30; x++) {
          const o = (((cy + y) & (N - 1)) << NSHIFT) | ((cx + x) & (N - 1))
          if (world.mat[o] === APRON) world.mat[o] = (hash2(cx + x, cy + y, salt) & 3) === 0 ? RUBBLE_DARK : RUBBLE
        }
    }
  }
  for (const p of kind.pieces) {
    const art = p.base ? PREFABS[p.art] : PLACE_ART[p.art]
    if (!art) continue
    const x0 = cx + p.x - (art.w >> 1)
    const y0 = cy + p.y - (art.h >> 1)
    stamp(world, art, x0, y0, level, p.base ? structureMat(HAZARD_Y) : (code) => PLACE_MAT + code.charCodeAt(0) - 97)
  }
  castBox(world, cx - hw - 20, cy - hh - 20, cx + hw + 20, cy + hh + 20, sun[0], sun[1])
}
