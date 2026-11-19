// A world of the galaxy is far larger than the ground a scene holds. It is GRID × GRID regions, each the size
// the whole world used to be (2048 px square), 16,384 px round: a lap that took twenty seconds takes three
// minutes. The scene's own ground (World.height, World.mat: 2048 px square, which every reader of the ground
// reads with its place masked to that) is a window on it, round wherever the pilot is: as he flies, the ground
// that comes within its reach is written into it a chunk at a time, over the ground that has fallen behind.
// Within a thousand px of him everything reads the true ground; nothing nearer than that is ever wrong.
//
// A region's ground is a whole map made by the world's own recipe (world/surface.ts), as the one world was:
// the region the bases stand in is that world itself, its features stamped, where it always was (the regions'
// edges are laid so that its bases stand in its middle); every other region is one of a few more maps of the
// same recipe from other seeds, each used several times over, shifted a different way each time.
//
// A map wraps onto itself, not onto its neighbours. Where two regions meet, the ground of the one goes over
// to the other's: their heights laid over each other across a band, the land of whichever is nearer, a shore
// where land meets sea. And the line they meet at wanders, hundreds of px either way, so no straight edge is
// left anywhere but round the home region (whose own edges stay where they are: what stands in it is where it
// was put). (Regions were parted by a strait of sea, or on a dry world by its plain, along straight edges:
// from space every world was ruled into sixty-four squares. James, 2026-11-18: "the horrible grid thing".)
//
// Only whole numbers, the four sums and the tables of util/exact.ts are used: what comes out is the same in
// every browser.

import type { WorldRecipe } from '../galaxy/recipe'
import { hash2 as hashOf } from '../util/exact'
import { buildSurface } from './surface'
import { createWorld, N as SIDE, NM as SIDE_MASK, NSHIFT as SIDE_SHIFT } from './world'
import type { World } from './world'

// (held here: this is read for every px of ground written, and what another file gives is slower to reach each time)
const N = SIDE
const NM = SIDE_MASK
const NSHIFT = SIDE_SHIFT
const hash2 = hashOf

/** regions a side, and the px round a world of the galaxy */
export const GRID = 8
export const WORLD = N * GRID
/** the window's chunks: px a side, and how many a side of the window and of the world */
export const CHUNK = 256
const CHUNK_SHIFT = 8
const SLOTS = N / CHUNK
const CHUNKS = WORLD / CHUNK
/** a place of the world brought within one lap of it: `& WM` (the world is a power of two px round) */
const WM = WORLD - 1
/** how many maps besides the home region's a world is made of, and how many of them are kept at once (each is 8 MB) */
const MAPS = 7
const KEPT = 8
/**
 * px either side of the line two regions meet at over which the ground of the one goes over to the other's: narrow, so
 * that either side of it the ground is a map's own (a mesa keeps its cliff; laid over each other across a wide band,
 * two lands made a third that was neither)
 */
const FEATHER = 24
/**
 * How far that line wanders from the straight: swells laid over each other, each so many px at the most and so many px
 * from one rise to the next; and the most they come to together
 */
const SWELLS = [
  [230, 1024],
  [110, 512],
]
const AMP = 340
/** and it is frayed: this many px either way at the most, in swells this many px from one rise to the next */
const FRAY = 30
const FRAY_SPAN = 64
/** px out from the home region over which that wandering comes in */
const EASE = 640
/**
 * The home region's own edges wander too, but only outwards: within them its ground is its own, as it was built, and
 * beyond them it runs on (its map wraps) as far as this many px at the most, the pull that brings it there dying away
 * over `HOME_REACH` px out; its swells are these many px from one rise to the next
 */
const HOME_OUT = 170
const HOME_REACH = 300
const HOME_SWELLS = [512, 128]
/** px either side of where regions meet within which a chunk's ground must be worked out a px at a time */
const REACH = FEATHER + FRAY + AMP + 2
/**
 * px from the home region's edge within which nothing of its own is left standing: its ground goes over to its
 * neighbours' there. (As it was when a strait lay there, so the outcrops that are left keep their numbers.)
 */
const CLEAR = 198
/** px between the points the wandering is worked out at for a chunk of ground (laid in straight between them) */
const LATTICE = 16
/** rings of chunks out from the pilot (of four) from which ground whose map is not built yet waits for it */
const WAIT_FROM = 2

/** a region's ground: a height and a material for every px of it */
export interface Terrain {
  height: Uint8Array
  mat: Uint8Array
}

export interface Lands {
  /** the world's name ('w12'): its maps are kept, asked for and handed in by it */
  id: string
  recipe: WorldRecipe
  /** the region the world's bases stand in: the world as it always was, its features stamped into it */
  home: World
  /** where the home region begins (px of the world, on whole chunks): the regions' edges are every 2048 px from there */
  ox: number
  oy: number
  /** per chunk of the window: the chunk of the world it holds now (−1: none yet) */
  slots: Int32Array
  /** spots where a place would stand whose ground will not take it (world/places.ts): not tried again */
  noPlace: Set<number>
  /** counts up whenever a chunk is written into the window: what was worked out from the window's ground is out of date */
  version: number
  /** true where the world has a sea (water, lava, acid): where land of one region meets sea of the next, a shore */
  sea: boolean
  seed: number
  /** each region (by its row × GRID + its column, from the home region's): the map it is made of (0: the home region's own) and how it is shifted */
  regions: { k: Uint8Array; sx: Uint16Array; sy: Uint16Array }
  /** the maps this world's ground has been read from, by their number (null: not fetched yet) */
  srcs: (Terrain | null)[]
}

// the other maps of each world ('w12:3'), kept for a while whichever scene asks (a map is the same for all of them)
const kept = new Map<string, Terrain>()

/**
 * Maps a scene will want soon and does not have (as 'w12:3'): the page builds them off its main thread and hands them in
 * (Scene.giveLand), so the ground a pilot flies towards is there before he reaches it. One not there in time is built
 * where it is wanted: a moment's stall.
 */
export const wantedLands = new Set<string>()

/** map `k` (1 … MAPS) of a world, built: by the world's own recipe from another seed, with nothing stamped into it */
export function buildLand(recipe: WorldRecipe, k: number): Terrain {
  const w = createWorld()
  buildSurface(w, { ...recipe, seed: (Math.imul(recipe.seed | 0, 0x9e3779b1) ^ Math.imul(k, 0x85ebca6b)) | 0 }, undefined, false)
  return { height: w.height, mat: w.mat }
}

/** a map built elsewhere, handed in */
export function giveLand(key: string, t: Terrain) {
  kept.delete(key)
  kept.set(key, t)
  wantedLands.delete(key)
  while (kept.size > KEPT) kept.delete(kept.keys().next().value!)
}

let outside = false
/** the page builds the maps off its main thread and hands them in: ground far from the pilot waits for its map, and only ground he is nearly at is built here */
export function landsFromOutside() {
  outside = true
}

/** map `k` of a world as its ground is read: the home region's own (0), or the one in hand, kept, or built now */
function srcOf(lands: Lands, k: number): Terrain {
  return (lands.srcs[k] ??= k === 0 ? lands.home : terrainOf(lands, k))
}

/** map `k` of a world: the one kept, or built now */
function terrainOf(lands: Lands, k: number): Terrain {
  const key = `${lands.id}:${k}`
  const t = kept.get(key)
  if (t) {
    // (the one most lately used is kept longest)
    kept.delete(key)
    kept.set(key, t)
    return t
  }
  const built = buildLand(lands.recipe, k)
  giveLand(key, built)
  return built
}

/** asks for the maps of the regions within `reach` px of a place, where they are not kept (wantedLands) */
export function landsAhead(world: World, x: number, y: number, reach = 3000) {
  const lands = world.lands
  if (!lands) return
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      regionAt(lands, Math.floor(x + i * reach), Math.floor(y + j * reach))
      if (region.k > 0 && !kept.has(`${lands.id}:${region.k}`)) wantedLands.add(`${lands.id}:${region.k}`)
    }
}

/** a world's regions, round its home region (`home`: the world built as it always was; its places stay where they are) */
export function makeLands(id: string, recipe: WorldRecipe, home: World): Lands {
  // the regions' edges, so that the middle of the bases is the middle of the home region (on whole chunks): where a
  // region's ground gives way to the next is then as far from them as it can be
  const bases = home.features.bases
  let ox = 0
  let oy = 0
  if (bases.length) {
    const a = bases[0]
    const b = bases[1] ?? a
    const short = (d: number) => d - N * Math.round(d / N)
    ox = Math.round((a.x + short(b.x - a.x) / 2 - N / 2) / CHUNK) * CHUNK
    oy = Math.round((a.y + short(b.y - a.y) / 2 - N / 2) / CHUNK) * CHUNK
  }
  // (every place of the home region as a place of the world: it wraps onto itself, and its places were given within one lap of it)
  const px = (x: number) => ox + ((((x - ox) % N) + N) % N)
  const py = (y: number) => oy + ((((y - oy) % N) + N) % N)
  for (const s of bases) {
    s.x = px(s.x)
    s.y = py(s.y)
    for (const p of s.pads) {
      p.x = px(p.x)
      p.y = py(p.y)
    }
    for (const t of s.turrets) {
      t.x = px(t.x)
      t.y = py(t.y)
    }
    s.mast.x = px(s.mast.x)
    s.mast.y = py(s.mast.y)
  }
  for (const o of home.features.outcrops) {
    o.x = px(o.x)
    o.y = py(o.y)
  }
  home.spawnX = px(home.spawnX)
  home.spawnY = py(home.spawnY)
  const sea = home.look.sea !== 'none'
  // (what stood in the edge of the home region, where its ground goes over to its neighbours', is gone with it; an
  // outcrop's number is its place in the list: those left are numbered afresh, the same in every game)
  const clear = (v: number, o: number) => Math.min(v - o, o + N - 1 - v) > CLEAR
  home.features.outcrops = home.features.outcrops.filter((o) => clear(o.x, ox) && clear(o.y, oy))
  home.features.outcrops.forEach((o, i) => (o.id = i))
  // which map each region is made of, and how it is shifted
  const seed = recipe.seed | 0
  const regions = { k: new Uint8Array(GRID * GRID), sx: new Uint16Array(GRID * GRID), sy: new Uint16Array(GRID * GRID) }
  for (let ry = 0; ry < GRID; ry++)
    for (let rx = 0; rx < GRID; rx++) {
      if (rx === 0 && ry === 0) continue
      const r = ry * GRID + rx
      regions.k[r] = 1 + ((hash2(rx, ry, seed ^ 0x51) + hash2(ry, rx, seed ^ 0x77) * 3) % MAPS)
      regions.sx[r] = hash2(rx, ry, seed ^ 0x1234) * 8
      regions.sy[r] = hash2(ry, rx, seed ^ 0x4321) * 8
    }
  return {
    id,
    recipe,
    home,
    ox,
    oy,
    noPlace: new Set<number>(),
    slots: new Int32Array(SLOTS * SLOTS).fill(-1),
    version: 1,
    sea,
    seed,
    regions,
    srcs: new Array<Terrain | null>(MAPS + 1).fill(null),
  }
}

/** smooth noise over the whole world (it wraps onto itself): −128 … 127, from a lattice `span` px apart, eased between its points */
function swell(seed: number, X: number, Y: number, span: number) {
  const n = WORLD / span
  const ix = Math.floor(X / span)
  const iy = Math.floor(Y / span)
  const fx = X - ix * span
  const fy = Y - iy * span
  const x0 = ((ix % n) + n) % n
  const y0 = ((iy % n) + n) % n
  const x1 = (x0 + 1) % n
  const y1 = (y0 + 1) % n
  const cube = span * span * span
  const ex = (fx * fx * (3 * span - 2 * fx)) / cube
  const ey = (fy * fy * (3 * span - 2 * fy)) / cube
  const top = hash2(x0, y0, seed) * (1 - ex) + hash2(x1, y0, seed) * ex
  const bottom = hash2(x0, y1, seed) * (1 - ex) + hash2(x1, y1, seed) * ex
  return top * (1 - ey) + bottom * ey - 128
}

/**
 * How far the lines the regions meet at have wandered at a place, px across and down, into `bend`: which region a place
 * is in, and how far from its edge, is asked at the place moved by this (its ground is read where it is). Round the
 * home region the wandering comes in over EASE px out, and the home region's own edge is pulled outwards.
 */
const bend = { x: 0, y: 0 }
function bendAt(lands: Lands, X: number, Y: number) {
  const rx = (X - lands.ox) & WM
  const ry = (Y - lands.oy) & WM
  // how far out from the home region the place is, across and down (less than 0: that far inside its nearer edge), and
  // which way the home region's middle lies from there
  const inX = rx < N
  const inY = ry < N
  const farX = inX ? -Math.min(rx, N - 1 - rx) : Math.min(rx - (N - 1), WORLD - rx)
  const farY = inY ? -Math.min(ry, N - 1 - ry) : Math.min(ry - (N - 1), WORLD - ry)
  const toX = inX ? (rx < N / 2 ? 1 : -1) : rx - (N - 1) <= WORLD - rx ? -1 : 1
  const toY = inY ? (ry < N / 2 ? 1 : -1) : ry - (N - 1) <= WORLD - ry ? -1 : 1
  const out = Math.max(farX, farY, 0)
  const s = lands.seed
  let x = 0
  let y = 0
  if (out > 0) {
    const g = out >= EASE ? 1 : out / EASE
    for (let i = 0; i < SWELLS.length; i++) {
      const [amp, span] = SWELLS[i]
      x += swell(s ^ (0x2d + i * 0x22), X, Y, span) * amp
      y += swell(s ^ (0x6b + i * 0x28), X, Y, span) * amp
    }
    x = (g * x) / 128
    y = (g * y) / 128
  }
  // by the home region's edges, either side of them, a pull in towards its middle: a place just outside it that is
  // pulled in over its edge is the home region's, and none inside it is ever pulled out (so its edge wanders outwards
  // only, and the pull is the same either side of it: nothing shows where the edge was)
  const nearX = Math.abs(farX) < HOME_REACH && farY < HOME_REACH
  const nearY = Math.abs(farY) < HOME_REACH && farX < HOME_REACH
  if (nearX || nearY) {
    let p = 0
    for (let i = 0; i < HOME_SWELLS.length; i++) p += swell(s ^ (0xa7 + i * 0x31), X, Y, HOME_SWELLS[i])
    p = ((p / HOME_SWELLS.length) * 1.6 + 128) / 256
    p = (p < 0 ? 0 : p > 1 ? 1 : p) * HOME_OUT
    // (less the further along its edge's line the place is beyond its corner)
    if (nearX) x += toX * p * (1 - Math.abs(farX) / HOME_REACH) * (farY > 0 ? 1 - farY / HOME_REACH : 1)
    if (nearY) y += toY * p * (1 - Math.abs(farY) / HOME_REACH) * (farX > 0 ? 1 - farX / HOME_REACH : 1)
  }
  bend.x = Math.round(x)
  bend.y = Math.round(y)
}

/** how much of a place's ground is its own region's (of 256), `d` px in from the line it meets the next at (less than 0: over it): half at the line, all of it FEATHER px in, none FEATHER px over, eased */
function share(d: number) {
  const t = d >= FEATHER ? 256 : d <= -FEATHER ? 0 : 128 + Math.floor((d * 128) / FEATHER)
  return (t * t * (768 - 2 * t)) >> 16
}

// the regions a place's ground is made of (up to four, where four meet) and how much of each (their shares multiplied: of 65,536)
const part = new Int32Array(4)
const much = new Int32Array(4)

/**
 * The ground at a place of the world: its height and its material, into `cell`. (bx, by): how far the regions' edges
 * have wandered there (bendAt). Clear of where regions meet it is its region's map, as it is; where they meet, their
 * heights laid over each other by how near each is, the land of the nearest (its edge ragged), and sea where they come
 * down to it.
 */
const cell = { h: 0, m: 0 }
function groundOf(lands: Lands, X: number, Y: number, bx: number, by: number) {
  const ux = (X + bx - lands.ox) & WM
  const uy = (Y + by - lands.oy) & WM
  const rx = ux >> NSHIFT
  const ry = uy >> NSHIFT
  const fx = ux & NM
  const fy = uy & NM
  const dx = fx < NM - fx ? fx : NM - fx
  const dy = fy < NM - fy ? fy : NM - fy
  const R = lands.regions
  const mx = X & NM
  const my = Y & NM
  const own = ry * GRID + rx
  if (dx >= FEATHER + FRAY && dy >= FEATHER + FRAY) {
    const src = srcOf(lands, R.k[own])
    const i = (((my + R.sy[own]) & NM) << NSHIFT) | ((mx + R.sx[own]) & NM)
    cell.h = src.height[i]
    cell.m = src.mat[i]
    return
  }
  // (the line is frayed: moved a little, the same way whichever side of it the place is)
  const lowX = fx < N / 2
  const lowY = fy < N / 2
  const frayX = dx < FEATHER + FRAY ? Math.round((swell(lands.seed ^ 0xf1, X, Y, FRAY_SPAN) * FRAY) / 128) : 0
  const frayY = dy < FEATHER + FRAY ? Math.round((swell(lands.seed ^ 0xf7, X, Y, FRAY_SPAN) * FRAY) / 128) : 0
  const ax = share(lowX ? dx - frayX : dx + frayX)
  const ay = share(lowY ? dy - frayY : dy + frayY)
  const nx = (rx + (lowX ? GRID - 1 : 1)) % GRID
  const ny = (ry + (lowY ? GRID - 1 : 1)) % GRID
  part[0] = own
  much[0] = ax * ay
  part[1] = ry * GRID + nx
  much[1] = (256 - ax) * ay
  part[2] = ny * GRID + rx
  much[2] = ax * (256 - ay)
  part[3] = ny * GRID + nx
  much[3] = (256 - ax) * (256 - ay)
  const sea = lands.sea
  // how high it lies, the sea's depths counted as under nothing; and the land, and the sea, of the region that has most of it
  let lie = 0
  let land = -1
  let most = -1e9
  let water = 0
  let wet = -1
  for (let c = 0; c < 4; c++) {
    const w = much[c]
    if (w === 0) continue
    const r = part[c]
    const src = srcOf(lands, R.k[r])
    const i = (((my + R.sy[r]) & NM) << NSHIFT) | ((mx + R.sx[r]) & NM)
    const h = src.height[i]
    const m = src.mat[i]
    if (sea && m < 4) {
      lie += w * (m - 4) * 3
      if (w > wet) {
        wet = w
        water = m
      }
    } else {
      lie += w * (sea && h < 1 ? 1 : h)
      // (a little either way, a px or two at a time: the land of one region does not end at a ruled line)
      const at = w + (hash2(X >> 1, Y >> 1, 53 + r) - 128) * 40
      if (at > most) {
        most = at
        land = m
      }
    }
  }
  lie /= 65536
  if (land < 0 || (wet >= 0 && lie <= 0.5)) {
    // the sea, as deep as it is in the region that has most of it there
    cell.h = 0
    cell.m = water
    return
  }
  cell.h = Math.max(sea ? 1 : 0, Math.round(lie))
  cell.m = land
}

/** which region a place of the world is in as the regions are laid out (their edges straight), into `region`: the map it is made of and how it is shifted */
const region = { k: 0, sx: 0, sy: 0 }
function regionAt(lands: Lands, X: number, Y: number) {
  const rx = ((X - lands.ox) & WM) >> NSHIFT
  const ry = ((Y - lands.oy) & WM) >> NSHIFT
  const r = ry * GRID + rx
  region.k = lands.regions.k[r]
  region.sx = lands.regions.sx[r]
  region.sy = lands.regions.sy[r]
}

/** the ground of the world at a place, for whoever needs it where the window is not (the world's map from space): height and material in `spot` */
export const spot = cell
export function groundAtPlace(lands: Lands, X: number, Y: number) {
  const x = Math.floor(X)
  const y = Math.floor(Y)
  // (well clear of where regions meet, however their edges wander: its region's own ground)
  const lx = (x - lands.ox) & NM
  const ly = (y - lands.oy) & NM
  if (Math.min(lx, NM - lx, ly, NM - ly) >= REACH) return groundOf(lands, x, y, 0, 0)
  bendAt(lands, x, y)
  groundOf(lands, x, y, bend.x, bend.y)
}

// how far the regions' edges have wandered at the points of a chunk's lattice (LATTICE px apart, its far edges too)
const LAT = CHUNK / LATTICE + 1
const bendX = new Float64Array(LAT * LAT)
const bendY = new Float64Array(LAT * LAT)
const inside = new Int32Array(LAT * LAT)

/** writes a chunk of the world into its place in the window */
function fill(world: World, lands: Lands, cx: number, cy: number) {
  const X0 = cx << CHUNK_SHIFT
  const Y0 = cy << CHUNK_SHIFT
  regionAt(lands, X0, Y0)
  const { sx, sy } = region
  const home = region.k === 0
  const src = srcOf(lands, region.k)
  // (where it is in the window, and how far into its region)
  const lx0 = X0 & NM
  const ly0 = Y0 & NM
  const ex = (X0 - lands.ox) & NM
  const ey = (Y0 - lands.oy) & NM
  // (a chunk clear of where its region meets the next, however that wanders, is the map's own ground, as it is; the home
  // region's own edges wander outwards only)
  const reach = home ? FEATHER + 2 : REACH
  const edge = ex < reach || ey < reach || ex + CHUNK > N - reach || ey + CHUNK > N - reach
  const H = world.height
  const M = world.mat
  if (!edge) {
    for (let y = 0; y < CHUNK; y++) {
      const row = (ly0 + y) << NSHIFT
      const from = (((ly0 + y + sy) & NM) << NSHIFT) | ((lx0 + sx) & NM)
      // (the map wraps: its row may run off its end and on from its start)
      const first = Math.min(CHUNK, N - ((lx0 + sx) & NM))
      H.set(src.height.subarray(from, from + first), row + lx0)
      M.set(src.mat.subarray(from, from + first), row + lx0)
      if (first < CHUNK) {
        const again = ((ly0 + y + sy) & NM) << NSHIFT
        H.set(src.height.subarray(again, again + CHUNK - first), row + lx0 + first)
        M.set(src.mat.subarray(again, again + CHUNK - first), row + lx0 + first)
      }
    }
  } else {
    // how far the regions' edges have wandered, at the lattice's points; and from that, for each: the region the
    // place is in, or −1 where it is within reach of the line two regions meet at
    for (let j = 0; j < LAT; j++)
      for (let i = 0; i < LAT; i++) {
        const X = X0 + i * LATTICE
        const Y = Y0 + j * LATTICE
        bendAt(lands, X, Y)
        const o = j * LAT + i
        bendX[o] = bend.x
        bendY[o] = bend.y
        const ux = (X + bend.x - lands.ox) & WM
        const uy = (Y + bend.y - lands.oy) & WM
        const fx = ux & NM
        const fy = uy & NM
        const clear = Math.min(fx, NM - fx, fy, NM - fy) >= FEATHER + FRAY + 2
        inside[o] = clear ? (uy >> NSHIFT) * GRID + (ux >> NSHIFT) : -1
      }
    const R = lands.regions
    for (let j = 0; j < LAT - 1; j++)
      for (let i = 0; i < LAT - 1; i++) {
        const o = j * LAT + i
        const r = inside[o]
        const xa = i * LATTICE
        const ya = j * LATTICE
        if (r >= 0 && inside[o + 1] === r && inside[o + LAT] === r && inside[o + LAT + 1] === r) {
          // a square of the lattice all of one region, clear of its edges (between the lattice's points the wandering
          // is laid in straight, so what is true at its corners is true within it): its map's own ground, as it is
          const from = srcOf(lands, R.k[r])
          const rsx = R.sx[r]
          const rsy = R.sy[r]
          for (let y = ya; y < ya + LATTICE; y++) {
            const to = ((ly0 + y) << NSHIFT) + lx0
            const at = ((ly0 + y + rsy) & NM) << NSHIFT
            for (let x = xa; x < xa + LATTICE; x++) {
              const k = at | ((lx0 + x + rsx) & NM)
              H[to + x] = from.height[k]
              M[to + x] = from.mat[k]
            }
          }
          continue
        }
        for (let y = ya; y < ya + LATTICE; y++) {
          const ty = y - ya
          const to = ((ly0 + y) << NSHIFT) + lx0
          for (let x = xa; x < xa + LATTICE; x++) {
            // (between the lattice's points, laid in straight)
            const tx = x - xa
            const a = (LATTICE - tx) * (LATTICE - ty)
            const b = tx * (LATTICE - ty)
            const c = (LATTICE - tx) * ty
            const d = tx * ty
            const bx = Math.round((bendX[o] * a + bendX[o + 1] * b + bendX[o + LAT] * c + bendX[o + LAT + 1] * d) / (LATTICE * LATTICE))
            const by = Math.round((bendY[o] * a + bendY[o + 1] * b + bendY[o + LAT] * c + bendY[o + LAT + 1] * d) / (LATTICE * LATTICE))
            groundOf(lands, X0 + x, Y0 + y, bx, by)
            H[to + x] = cell.h
            M[to + x] = cell.m
          }
        }
      }
  }
  lands.slots[(cy & (SLOTS - 1)) * SLOTS + (cx & (SLOTS - 1))] = cy * CHUNKS + cx
  lands.version++
}

/** true if every map a chunk's ground may be read from is in hand; those that are not are asked for (wantedLands) */
function mapsFor(lands: Lands, cx: number, cy: number) {
  const X0 = cx << CHUNK_SHIFT
  const Y0 = cy << CHUNK_SHIFT
  let ready = true
  // (its corners, out as far as a neighbour's ground may reach into it)
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 2; i++) {
      regionAt(lands, X0 + (i ? CHUNK - 1 + REACH : -REACH), Y0 + (j ? CHUNK - 1 + REACH : -REACH))
      const k = region.k
      if (k === 0 || lands.srcs[k] || kept.has(`${lands.id}:${k}`)) continue
      wantedLands.add(`${lands.id}:${k}`)
      ready = false
    }
  return ready
}

/** true where the window holds the true ground of a place of the world now */
export function inWindow(world: World, x: number, y: number) {
  const lands = world.lands
  if (!lands) return true
  const cx = (((Math.floor(x) % WORLD) + WORLD) % WORLD) >> CHUNK_SHIFT
  const cy = (((Math.floor(y) % WORLD) + WORLD) % WORLD) >> CHUNK_SHIFT
  return lands.slots[(cy & (SLOTS - 1)) * SLOTS + (cx & (SLOTS - 1))] === cy * CHUNKS + cx
}

/**
 * Brings the window round a place of the world: the chunks within its reach that it does not hold are written into it,
 * the nearest first, `most` of them at the most (in flight a few a step: they are at its far edge, a thousand px off).
 * Returns the chunks it wrote (as their numbers: cy × CHUNKS + cx), for whatever stands in them to be put back.
 */
export function bringWindow(world: World, x: number, y: number, most = 64): number[] {
  const lands = world.lands
  if (!lands) return NONE
  const c0x = Math.round((x - N / 2) / CHUNK)
  const c0y = Math.round((y - N / 2) / CHUNK)
  let wrote: number[] = NONE
  // (from the middle outwards: the chunks nearest the place first)
  for (let ring = 0; ring < SLOTS / 2 && wrote.length < most; ring++)
    for (let j = SLOTS / 2 - 1 - ring; j <= SLOTS / 2 + ring; j++)
      for (let i = SLOTS / 2 - 1 - ring; i <= SLOTS / 2 + ring; i++) {
        if (i !== SLOTS / 2 - 1 - ring && i !== SLOTS / 2 + ring && j !== SLOTS / 2 - 1 - ring && j !== SLOTS / 2 + ring) continue
        const cx = (((c0x + i) % CHUNKS) + CHUNKS) % CHUNKS
        const cy = (((c0y + j) % CHUNKS) + CHUNKS) % CHUNKS
        if (lands.slots[(cy & (SLOTS - 1)) * SLOTS + (cx & (SLOTS - 1))] === cy * CHUNKS + cx) continue
        if (wrote.length >= most) continue
        // (a map of its ground still being built off the page's main thread: it waits, unless the pilot is nearly at it)
        if (outside && ring >= WAIT_FROM && !mapsFor(lands, cx, cy)) continue
        fill(world, lands, cx, cy)
        if (wrote === NONE) wrote = []
        wrote.push(cy * CHUNKS + cx)
      }
  return wrote
}
const NONE: number[] = []

/** the px of the world a chunk (by its number) begins at */
export const chunkAt = (n: number) => ({ x: (n % CHUNKS) << CHUNK_SHIFT, y: Math.floor(n / CHUNKS) << CHUNK_SHIFT })
