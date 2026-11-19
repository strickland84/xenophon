// The maps that bodies are drawn from as spheres (render/bodies.ts): a world's or a moon's is
// made from its own built surface, so from space it shows its real coasts, ranges, lava and ice
// in its own colours and its own clouds, and the ship goes down onto the spot it dived into; a gas
// giant's is the image model's picture of its bands (art.ts).
//
// A map is a picture of palette indices, and each colour of its palette is kept at LEVELS
// brightnesses, from its night side to full sunlight (a glowing material keeps its glow at night),
// so the renderer only picks a level for each pixel.
//
// Building a world takes a few hundred milliseconds. In Node (the tests, the tools) the scene
// builds the maps it needs as it needs them; the page instead builds them off its main thread
// and hands them in (mapsFromOutside, giveMap), and until one comes the body is drawn plainly.

import { siteOf, surfaceById } from '../galaxy/galaxy'
import { pack } from '../util/color'
import { buildSurface } from '../world/surface'
import { createWorld, equatorOf } from '../world/world'
import { groundAtPlace, makeLands, spot, WORLD } from '../world/lands'
import type { WorldRecipe } from '../galaxy/recipe'
import type { World } from '../world/world'
import { GIANTS } from './art'
import { pixelsOf } from './pictures'

/** brightnesses each colour is kept at, from night to full light */
export const LEVELS = 8
/**
 * A world's map: 1024 × 1024, each texel two world px square, the whole of its ground, and its globe
 * is the whole of it. The ground is a square that wraps the same distance round and pole to pole, and
 * that is exactly a Mercator map of a sphere from 85° south to 85° north: laid round the globe so
 * (`merc`), every shape keeps its shape, places nearer the poles are drawn smaller, and the last five
 * degrees at each pole are a cap of the rows next to them. (The globe used to be the top half of the
 * ground only, by latitude: half of every world could not be seen from space or come down to, and a
 * ship that climbed out over a base in that half came down again over another place.)
 */
export const MAP_W = 1024
export const MAP_H = 1024

export interface SphereMap {
  w: number
  h: number
  /** the rows from pole to pole round the globe (all of them) */
  span: number
  /** a world's or a moon's: its rows are laid from pole to pole by Mercator's projection (a giant's bands by latitude) */
  merc?: boolean
  /** per texel, its colour (an index into `lit` / LEVELS) */
  idx: Uint8Array
  /** colour i at brightness l is lit[i * LEVELS + l] */
  lit: Uint32Array
  /** clouds over it, 0 (none) to 3 (thick), at half the map's size (null: none) */
  clouds: Uint8Array | null
  /** the air's colour round its edge, packed (0: no air) */
  air: number
  /** a gas giant's bands, pole to pole (each its colour, an index into `lit` / LEVELS): drawn smooth at any size, streaming and eddying (render/globe.ts) */
  bands?: Uint8Array
}

/** the light on a world from its sun, and how much of its own light a colour keeps at night */
/**
 * A night side's light (polish step 9): the dark side of a world or a giant is lit faintly by the stars and its moons, cool
 * blue, so its shape and its bands still show (it was all but black, and a ship coming at one from beyond it saw nothing)
 */
const NIGHT = [0.72, 0.86, 1.3]

function litPalette(colours: number[][], light: number[] | null, glow: number[] | null, ambient: number) {
  const lit = new Uint32Array(colours.length * LEVELS)
  colours.forEach((c, i) => {
    const g = glow ? glow[i] : 0
    for (let l = 0; l < LEVELS; l++) {
      const day = l / (LEVELS - 1)
      const k = Math.max(g, ambient + (1 - ambient) * Math.pow(day, 0.85))
      const tint = light ?? [1, 1, 1]
      // (towards the night the light cools to the stars' blue)
      const n = Math.max(0, 1 - day * 2.5)
      const t0 = tint[0] * (1 - n) + NIGHT[0] * n
      const t1 = tint[1] * (1 - n) + NIGHT[1] * n
      const t2 = tint[2] * (1 - n) + NIGHT[2] * n
      lit[i * LEVELS + l] = pack(c[0] * k * t0, c[1] * k * t1, c[2] * k * t2)
    }
  })
  return lit
}

/**
 * A world's map, from its ground (world/lands.ts: the whole of it, every region): each texel the colour of the ground at
 * its place, sixteen world px to a texel, darker on slopes away from the light. `home` is the world as it was built: the
 * region its bases stand in.
 */
export function mapOfWorld(
  id: string,
  home: World,
  recipe: WorldRecipe,
  light: number[] | null,
  clouds: number,
  air: number[] | null,
): SphereMap {
  const lands = makeLands(id, recipe, home)
  const look = home.look
  const nMat = look.top.length
  // (three shades of each material: in shadow, plain, lit)
  const colours: number[][] = []
  const glow: number[] = []
  for (let m = 0; m < nMat; m++) {
    const c = look.top[m] ?? [255, 0, 255]
    for (const f of [0.74, 1, 1.12]) {
      colours.push([c[0] * f, c[1] * f, c[2] * f])
      glow.push(look.glow[m] ?? 0)
    }
  }
  // (the map's middle row is the globe's equator: the row of the ground midway between its bases)
  const step = WORLD / MAP_W
  const off = Math.round(equatorOf({ ...home, size: WORLD })) - WORLD / 2 + WORLD
  const high = new Uint8Array(MAP_W * MAP_H)
  const made = new Uint8Array(MAP_W * MAP_H)
  for (let v = 0; v < MAP_H; v++)
    for (let u = 0; u < MAP_W; u++) {
      groundAtPlace(lands, u * step, v * step + off)
      high[v * MAP_W + u] = spot.h
      made[v * MAP_W + u] = spot.m
    }
  const idx = new Uint8Array(MAP_W * MAP_H)
  for (let v = 0; v < MAP_H; v++)
    for (let u = 0; u < MAP_W; u++) {
      const o = v * MAP_W + u
      const h = high[o]
      const hn = high[((v + MAP_H - 1) % MAP_H) * MAP_W + ((u + MAP_W - 1) % MAP_W)]
      const shade = hn > h + 2 ? 0 : h > hn + 2 ? 2 : 1
      idx[o] = Math.min(255, made[o] * 3 + shade)
    }
  // the clouds, where the world's cover shows them: a texel of them is as clouded as the ground's own clouds over it are
  let cl: Uint8Array | null = null
  const rankMax = Math.round(Math.max(0, Math.min(1, clouds)) * 16)
  if (rankMax > 0) {
    const cw = MAP_W / 2
    cl = new Uint8Array(cw * (MAP_H / 2))
    const C = home.clouds
    const cs = step * 2
    for (let v = 0; v < MAP_H / 2; v++)
      for (let u = 0; u < cw; u++) {
        // (the cloud map is 1024 px square, a cell a world px, and wraps, as the ground's own clouds are drawn from it)
        let n = 0
        for (let j = 0; j < 4; j++)
          for (let i = 0; i < 4; i++) {
            const c = C[(((v * cs + off + j * (cs >> 2)) & 1023) << 10) | ((u * cs + i * (cs >> 2)) & 1023)]
            if (c !== 0 && c >> 4 < rankMax && (c & 15) > 1) n++
          }
        cl[v * cw + u] = n >= 10 ? 3 : n >= 6 ? 2 : n >= 3 ? 1 : 0
      }
  }
  return {
    w: MAP_W,
    h: MAP_H,
    span: MAP_H,
    merc: true,
    idx,
    lit: litPalette(colours, light, glow, 0.15),
    clouds: cl,
    air: air ? pack(air[0], air[1], air[2]) : 0,
  }
}

/**
 * The map of a gas giant's bands: one of the image model's pictures (chosen by its body), drawn
 * out eight times as large, its bands stirred by the picture's own swirls at the finer scale, so
 * that close to, a giant has turbulent edges to its bands rather than blocks of colour.
 */
const giantMaps = new Map<string, SphereMap>()
const GIANT_UP = 8
export function giantMap(which: number, light: number[] | null): SphereMap {
  const key = `${which % GIANTS.length}:${light ? light.join(',') : ''}`
  let got = giantMaps.get(key)
  if (!got) {
    const p = pixelsOf(GIANTS[which % GIANTS.length])
    const pw = p.w
    const ph = p.h
    const lum = p.colours.map((c) => (c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11) / 255)
    const w = pw * GIANT_UP
    const h = ph * GIANT_UP
    const idx = new Uint8Array(w * h)
    for (let v = 0; v < h; v++)
      for (let u = 0; u < w; u++) {
        // (the picture laid over itself at its own size, as a swirl that pushes each band up or down)
        const swirl = lum[p.idx[(v % ph) * pw + (u % pw)]] - 0.5
        const drift = Math.sin((u / w) * Math.PI * 2 * 5 + v * 0.05) * 0.6
        const V = Math.min(ph - 1, Math.max(0, Math.floor(v / GIANT_UP + swirl * 3.2 + drift)))
        const U = Math.floor(u / GIANT_UP + swirl * 6) % pw
        idx[v * w + u] = p.idx[V * pw + (U < 0 ? U + pw : U)]
      }
    // (its bands: the colour most of each row of the picture is, pole to pole)
    const bands = new Uint8Array(ph)
    const count = new Uint16Array(256)
    for (let v = 0; v < ph; v++) {
      count.fill(0)
      let best = 0
      for (let u = 0; u < pw; u++) {
        const t = p.idx[v * pw + u]
        if (t === 255) continue
        if (++count[t] > count[best]) best = t
      }
      bands[v] = best
    }
    // (a few rows much darker than the bands either side of them are a hair line in the picture, not a band: on the giant
    // it was a thin dark line round it, wavering with the bands, that read as a seam or a crack. Each half of it takes the
    // colour of the band on its side)
    const thin = Math.max(2, Math.round(ph * 0.04))
    for (let v = 1; v < ph - 1;) {
      let e = v
      while (e < ph && bands[e] === bands[v]) e++
      if (e < ph && e - v <= thin && lum[bands[v]] < Math.min(lum[bands[v - 1]], lum[bands[e]]) - 0.12) {
        const mid = (v + e + 1) >> 1
        bands.fill(bands[v - 1], v, mid)
        bands.fill(bands[e], mid, e)
      }
      v = e
    }
    got = { w, h, span: h, idx, lit: litPalette(p.colours, light, null, 0.2), clouds: null, air: 0, bands }
    giantMaps.set(key, got)
    while (giantMaps.size > 4) giantMaps.delete(giantMaps.keys().next().value!)
  }
  return got
}

// ── the maps of the galaxy's worlds, kept for the most recent few

const KEEP = 14
const maps = new Map<string, SphereMap>()
let buildHere = true

/** the page builds the maps off its main thread and hands them in: the scene does not build them itself */
export function mapsFromOutside() {
  buildHere = false
}

/** a world's map, built elsewhere, handed in */
export function giveMap(id: string, map: SphereMap) {
  maps.delete(id)
  maps.set(id, map)
  while (maps.size > KEEP) maps.delete(maps.keys().next().value!)
}

/** the sky's colour of a world, as its air is seen round its edge from space (null: no air) */
export function airOf(id: string): number[] | null {
  const s = surfaceById(id)
  if (!s || s.recipe.atmosphere <= 0) return null
  const a = s.recipe.archetype
  const base =
    a === 'volcanic'
      ? [220, 120, 70]
      : a === 'jungle'
        ? [150, 220, 170]
        : a === 'mesa' || a === 'canyon'
          ? [236, 190, 140]
          : [140, 196, 255]
  const l = s.recipe.light
  return [base[0] * l[0], base[1] * l[1], base[2] * l[2]]
}

/** builds a world's map from its recipe: the work done off the page's main thread (the worker calls this) */
export function buildMap(id: string, world: World = createWorld()): SphereMap | null {
  const s = surfaceById(id)
  if (!s) return null
  buildSurface(world, s.recipe, siteOf(s))
  return mapOfWorld(id, world, s.recipe, s.recipe.light, s.recipe.clouds, airOf(id))
}

/** worlds whose maps were wanted and not had (the page builds these) */
export const wanted = new Set<string>()

/** a world's map: kept, or built here (in Node), or null until the page hands it in */
export function mapFor(id: string): SphereMap | null {
  const got = maps.get(id)
  if (got) return got
  if (!buildHere) {
    wanted.add(id)
    return null
  }
  const built = buildMap(id, scratchWorld())
  if (built) giveMap(id, built)
  return built
}

let scratch: World | null = null
/** one world to build maps in, kept (a world is several megabytes) */
function scratchWorld() {
  if (!scratch) scratch = createWorld()
  return scratch
}
