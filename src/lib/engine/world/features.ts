// The things stamped into a world's ground (the plan's section 5, "Surface features"): bases
// (a landing pad, a few buildings, a flag mast, defence turrets), ore outcrops, rich deposits
// and the wrecks of old crashes. They are written into the height map and the material map
// like any other ground, so the renderer draws them with no drawing of their own, and they
// cast their shadows, glow at night and take the world's light as its own ground does.
//
// Where everything goes follows from the world's seed alone, with exact arithmetic only (as
// the rest of the terrain: util/exact.ts), so every player gets the same bases and the same
// ore in the same places. The look comes from the image model (world/prefabs.ts, generated
// from art/features by tools/voxel/prefabs.py) after the mockups art/mockups/base*.png and
// ore*.png; the plain ground of a site (its packed earth, its rubble) is tinted towards the
// world's own, so a base sits in the world rather than on it.
//
// Every habitable world has two bases: on a home world one belongs to its side (the capital
// world's is the side's capital, with two pads and four turrets), and the other is a neutral
// outpost; elsewhere both are neutral. A barren moon has one outpost. The rich deposits lie
// between the two bases and near where ships arrive, where a fight is likely.

import { MINE } from '../data/loop'
import { resourceOf, RESOURCES } from '../data/resources'
import type { GroundOre, ResourceId } from '../data/resources'
import type { WorldRecipe } from '../galaxy/recipe'
import { hash2 } from '../util/exact'
import { mulberry32 } from '../util/math'
import type { RGB, WorldLook } from './look'
import { FEATURE_COLOURS, PREFABS } from './prefabs'
import { PLACE_COLOURS, PLACE_GLOW } from './placeart'
import type { Prefab } from './prefabs'
import { sunFor, TALLEST } from './shape'
import { N, NM, noFeatures, NSHIFT } from './world'
import type { World } from './world'

/** whose a base is: a side's, or nobody's */
export type BaseOwner = 'nomarchy' | 'anarchoi' | null

export interface Pad {
  /** its middle, half its side, and the height of its top */
  x: number
  y: number
  half: number
  z: number
}

export interface Base {
  id: number
  name: string
  owner: BaseOwner
  /** a side's capital: two pads, four turrets */
  capital: boolean
  x: number
  y: number
  pads: Pad[]
  /** where each turret's gun sits */
  turrets: { x: number; y: number; z: number }[]
  /** the top of the flag mast */
  mast: { x: number; y: number; z: number }
}

export interface Outcrop {
  id: number
  /** its middle, and the top of its tallest crystal */
  x: number
  y: number
  z: number
  /** the ground it stands on */
  ground: number
  ore: ResourceId
  /** a rich deposit (more of a dearer ore), or a wreck (salvage) */
  rich: boolean
  wreck: boolean
  /** units it holds at the start of each of its periods, seconds a period lasts, and seconds its first began before the clock's zero */
  stock: number
  period: number
  offset: number
  /** its crystals: each pixel's place in the world, its height and material as stamped, and as it is once mined out */
  cells: number[]
  tall: number[]
  mats: number[]
  low: number[]
  lowMat: number[]
}

/** a place found out over a world, away from its bases (world/places.ts): what it is, its name, its middle and the height it stands at */
export interface Place {
  kind: string
  name: string
  x: number
  y: number
  z: number
  /** the chunks of the world its ground is in (world/lands.ts): written over, it is gone until it is laid again */
  chunks: number[]
}

export interface Features {
  bases: Base[]
  outcrops: Outcrop[]
  /** the places whose ground is in the scene's hold now (none on the island world of the settings) */
  places: Place[]
}

// ── the materials: after every archetype's own (none uses more than 32)
export const FEATURE_MAT = 32
export const PAD = 32
export const PAD_SEAM = 33
export const HAZARD_Y = 34
export const HAZARD_K = 35
export const PAD_LIGHT = 36
export const APRON = 37
export const APRON_DARK = 38
export const RUBBLE = 39
export const RUBBLE_DARK = 40
export const SCORCH = 41
export const BUILDING = 42 // … 46: five shades, dark to light
export const WINDOW = 47
export const TRIM = 48
export const MAST = 49
export const TURRET_LIGHT = 50
export const TURRET_DARK = 51
export const PLINTH = 52
/** each ore's three shades of crystal, light to dark (salvage's: scorched metal) */
export const ORE_MAT: Record<GroundOre, number> = {
  ferrite: 53,
  silica: 56,
  'cryo-ice': 59,
  'magma-glass': 62,
  bioresin: 65,
  salvage: 68,
}
/** the ground's materials in a shadow cast by a feature: this much further on */
export const SHADOWED = 71 - PAD
const SHADOW_OF = [PAD, PAD_SEAM, HAZARD_Y, HAZARD_K, APRON, APRON_DARK, RUBBLE, RUBBLE_DARK, SCORCH]
/** the colours of the places found out over a world (world/placeart.ts PLACE_COLOURS), one after another from here */
export const PLACE_MAT = 80
/** every material a world with features has */
export const FEATURE_MATS = 96

/** true for ground a ship can set down on: the world's own (not its sea), a pad, packed earth; not a building, a turret, ore or rubble */
export function landable(m: number) {
  if (m < 4) return false
  if (m < FEATURE_MAT) return true
  const flat = m >= SHADOWED + PAD ? m - SHADOWED : m
  return flat <= APRON_DARK
}

/** true for a material a ship can set down on: a pad's top */
export const isPadMat = (m: number) =>
  m === PAD || m === PAD_SEAM || m === HAZARD_Y || m === HAZARD_K || m === PAD + SHADOWED || m === PAD_SEAM + SHADOWED

// ── the layouts of a base, about its middle (px): the packed ground, the pads, the buildings, the turrets, the mast
interface Layout {
  apron: [number, number]
  pads: [number, number][]
  buildings: [string, number, number][]
  turrets: [number, number][]
  mast: [number, number]
}
const PAD_HALF = 23
/** px round a base kept clear of ore */
const BASE_CLEAR = 300
const OUTPOST: Layout = {
  apron: [66, 50],
  pads: [[12, 6]],
  buildings: [
    ['hangar', -48, -30],
    ['block', -48, 22],
    ['tanks', 46, -34],
  ],
  turrets: [
    [52, 38],
    [-22, -40],
  ],
  mast: [-18, 2],
}
const CAPITAL: Layout = {
  apron: [96, 58],
  pads: [
    [-44, 12],
    [44, 12],
  ],
  buildings: [
    ['command', 0, -24],
    ['hangar', -62, -38],
    ['tanks', 62, -38],
    ['block', 0, 34],
  ],
  turrets: [
    [-86, -48],
    [86, -48],
    [-86, 48],
    [86, 48],
  ],
  mast: [0, 4],
}

// the names of outposts: a word of their own, and what they are
const NAME_A = [
  'Anvil',
  'Beacon',
  'Cairn',
  'Dory',
  'Ember',
  'Flint',
  'Gannet',
  'Harrow',
  'Keel',
  'Lantern',
  'Marrow',
  'Notch',
  'Quarry',
  'Rook',
  'Spur',
  'Tor',
  'Vane',
  'Weir',
  'Yarrow',
  'Cinder',
]
const NAME_B = ['Post', 'Field', 'Landing', 'Station', 'Yard', 'Point']

/** distance across the wrap: the world is a torus */
function apart(ax: number, ay: number, bx: number, by: number) {
  let dx = Math.abs(ax - bx)
  let dy = Math.abs(ay - by)
  if (dx > N / 2) dx = N - dx
  if (dy > N / 2) dy = N - dy
  return Math.sqrt(dx * dx + dy * dy)
}

export const at = (x: number, y: number) => ((y & NM) << NSHIFT) | (x & NM)

/**
 * How a patch of ground would take a base: none (null) where it is sea it cannot stand in,
 * or too tall; else how level it is and the height to level it to. Sampled every 4 px.
 */
export function siteOf(world: World, cx: number, cy: number, hw: number, hh: number, platform: boolean) {
  const { height: H, mat: M } = world
  let lo = 99
  let hi = 0
  let sum = 0
  let n = 0
  let sea = 0
  for (let y = -hh; y <= hh; y += 4)
    for (let x = -hw; x <= hw; x += 4) {
      const o = at(cx + x, cy + y)
      const h = H[o]
      if (M[o] < 4) {
        // (the sea: an ocean world's base stands on a platform in the shallows; nowhere else)
        if (!platform || M[o] < 1) return null
        sea++
      }
      if (h < lo) lo = h
      if (h > hi) hi = h
      sum += h
      n++
    }
  const level = Math.max(platform ? 3 : 1, Math.round(sum / n))
  if (level > 28) return null
  return { rough: hi - lo + sea * 0.05, level }
}

/** the best place for a base within `ring` (px from a point, inside and out), by how level it is; null if there is none */
function placeBase(
  world: World,
  layout: Layout,
  platform: boolean,
  fx: number,
  fy: number,
  ring: [number, number],
  avoid: { x: number; y: number }[],
  salt: number,
) {
  let best: { x: number; y: number; level: number; score: number } | null = null
  const [hw, hh] = layout.apron
  for (let gy = 0; gy < N; gy += 32)
    for (let gx = 0; gx < N; gx += 32) {
      const x = gx + (hash2(gx, gy, salt) & 15)
      const y = gy + (hash2(gx, gy, salt + 1) & 15)
      const d = apart(x, y, fx, fy)
      if (d < ring[0] || d > ring[1]) continue
      if (avoid.some((a) => apart(x, y, a.x, a.y) < 640)) continue
      const s = siteOf(world, x, y, hw + 6, hh + 6, platform)
      if (!s) continue
      // (level ground, low down, and nearer the middle of the ring)
      const score = -s.rough * 3 - s.level * 0.08 - Math.abs(d - (ring[0] + ring[1]) / 2) * 0.004 + (hash2(x, y, salt + 2) & 7) * 0.05
      if (!best || score > best.score) best = { x, y, level: s.level, score }
    }
  return best
}

/** the colour of the world's ground, taken over the whole world: what packed earth and rubble lean towards */
function groundColour(world: World): RGB {
  const counts = new Map<number, number>()
  for (let y = 0; y < N; y += 16)
    for (let x = 0; x < N; x += 16) {
      const m = world.mat[at(x, y)]
      if (m >= 4 && m < FEATURE_MAT) counts.set(m, (counts.get(m) ?? 0) + 1)
    }
  let best = 4
  let most = -1
  for (const [m, c] of counts)
    if (c > most) {
      most = c
      best = m
    }
  return world.look.top[best] ?? [150, 140, 120]
}

const mix = (a: number[], b: number[], k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const times = (c: number[], k: number): RGB => [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)]

/** the side colours of the trim: the Nomarchy's gold, the Anarchoi's violet */
const SIDE_TRIM: Record<string, RGB> = { nomarchy: [242, 193, 78], anarchoi: [164, 108, 240] }

/** the world's look, with the features' materials added after its own */
function featureLook(look: WorldLook, ground: RGB, trim: RGB, ocean: boolean): WorldLook {
  const top: RGB[] = look.top.slice()
  const side: RGB[] = look.side.slice()
  const glow: number[] = look.glow.slice()
  const banded: boolean[] = look.banded.slice()
  while (top.length < FEATURE_MATS) {
    top.push([0, 0, 0])
    side.push([0, 0, 0])
    glow.push(0)
    banded.push(false)
  }
  const set = (m: number, t: RGB, s: RGB = times(t, 0.66), g = 0) => {
    top[m] = t.map((v) => Math.round(v)) as RGB
    side[m] = s.map((v) => Math.round(v)) as RGB
    glow[m] = g
  }
  const concrete = mix([170, 172, 170], ground, 0.14)
  set(PAD, concrete, times(concrete, 0.62))
  set(PAD_SEAM, times(concrete, 0.8), times(concrete, 0.55))
  set(HAZARD_Y, [238, 196, 44], [176, 140, 30])
  set(HAZARD_K, [38, 36, 36], [30, 28, 28])
  set(PAD_LIGHT, [255, 250, 222], [200, 196, 180], 0.9)
  // (packed earth, or on an ocean world the platform's concrete)
  const earth = ocean ? times(concrete, 0.86) : mix(times(ground, 0.84), [158, 134, 104], 0.62)
  set(APRON, earth, times(earth, 0.7))
  set(APRON_DARK, times(earth, 0.8), times(earth, 0.6))
  const rubble = FEATURE_COLOURS.rubble
  set(RUBBLE, mix(rubble[0], ground, 0.35), mix(times(rubble[0], 0.7), times(ground, 0.6), 0.35))
  set(RUBBLE_DARK, mix(rubble[1], times(ground, 0.5), 0.3), mix(times(rubble[1], 0.8), times(ground, 0.4), 0.3))
  set(SCORCH, mix([44, 38, 34], ground, 0.18), mix([34, 30, 28], ground, 0.12))
  const b = FEATURE_COLOURS.building
  // (their walls a mid grey of the roof's own, lighter than its darkest: from behind and the seat they read as near black
  // slabs; polish step 9; render/world.ts draws storeys and windows on them)
  for (let i = 0; i < 5; i++) set(BUILDING + i, b[i], times(mix(b[2], b[3], 0.5), 0.86))
  set(WINDOW, b[2], [255, 212, 132], 0.85)
  set(TRIM, trim, times(trim, 0.7), 0.25)
  set(MAST, [190, 194, 200], [130, 134, 142])
  set(TURRET_LIGHT, FEATURE_COLOURS.turret[0], times(FEATURE_COLOURS.turret[0], 0.6))
  set(TURRET_DARK, mix(FEATURE_COLOURS.turret[1], [104, 110, 122], 0.75), times(FEATURE_COLOURS.turret[0], 0.45))
  set(PLINTH, mix(FEATURE_COLOURS.plinth[0], concrete, 0.5), times(concrete, 0.6))
  for (const id of Object.keys(ORE_MAT) as GroundOre[]) {
    const r = RESOURCES[id]
    for (let i = 0; i < 3; i++) set(ORE_MAT[id] + i, r.colours[i], times(r.colours[Math.min(2, i + 1)], 0.8), r.glow ? 0.8 - i * 0.2 : 0)
  }
  // the places out over the world: their pictures' own colours
  PLACE_COLOURS.forEach((c, i) => set(PLACE_MAT + i, c as RGB, times(c, 0.62), PLACE_GLOW[i] ?? 0))
  // in a feature's shadow: as palettes.ts shades the ground in a cloud's
  for (const m of SHADOW_OF) {
    const t = top[m]
    set(m + SHADOWED, [t[0] * 0.62, t[1] * 0.67, t[2] * 0.8], times(side[m], 0.8))
  }
  return { ...look, top, side, glow, banded }
}

/** a prefab stamped with its top-left at (x0, y0) on ground of height `level`; `mat` gives each of its codes a material (none: left as it was) */
export function stamp(world: World, p: Prefab, x0: number, y0: number, level: number, mat: (code: string, x: number, y: number) => number) {
  const { height: H, mat: M } = world
  for (let y = 0; y < p.h; y++)
    for (let x = 0; x < p.w; x++) {
      const code = p.mat[y][x]
      if (code === '.') continue
      const m = mat(code, x, y)
      if (m < 0) continue
      const o = at(x0 + x, y0 + y)
      H[o] = Math.min(TALLEST, level + parseInt(p.height[y][x], 36))
      M[o] = m
    }
}

/** a building's or a turret's material for each code of its prefab */
export function structureMat(trim: number) {
  return (code: string) =>
    code === 'T'
      ? trim
      : code === 'p'
        ? PLINTH
        : code === 't'
          ? TURRET_LIGHT
          : code === 'u'
            ? TURRET_DARK
            : BUILDING + 'abcde'.indexOf(code)
}

/** shadows cast by what was stamped in a box, onto the box's flat ground: (sx, sy) is a shadow's way, px per px of height */
export function castBox(world: World, x0: number, y0: number, x1: number, y1: number, sx: number, sy: number) {
  const { height: H, mat: M } = world
  const reach = 14
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const o = at(x, y)
      const m = M[o]
      if (SHADOW_OF.indexOf(m) < 0) continue
      const h = H[o]
      // towards the sun, something taller than the light's line?
      for (let k = 1; k <= reach; k++) {
        const q = at(Math.round(x - sx * k), Math.round(y - sy * k))
        if (H[q] >= h + k + 0.5) {
          M[o] = m + SHADOWED
          break
        }
      }
    }
}

/** 0..1: a smooth hash noise of a grid of `cell` px (a power of two), blended between its corners (exact arithmetic) */
function smooth(x: number, y: number, shift: number, salt: number) {
  const cell = 1 << shift
  const gx = x >> shift
  const gy = y >> shift
  const fx = x & (cell - 1)
  const fy = y & (cell - 1)
  const top = hash2(gx, gy, salt) * (cell - fx) + hash2(gx + 1, gy, salt) * fx
  const bottom = hash2(gx, gy + 1, salt) * (cell - fx) + hash2(gx + 1, gy + 1, salt) * fx
  return (top * (cell - fy) + bottom * fy) / (256 * cell * cell)
}
/** 0..WANDER: how far a base's packed ground spreads past its plan here: broad swells over tens of px, and smaller ones */
const wander = (x: number, y: number, salt: number) => (smooth(x, y, 5, salt) * 0.65 + smooth(x, y, 3, salt + 1) * 0.35) * WANDER
/** px: the most the packed ground spreads past its plan, how far in from the plan it starts, and how much of its corners are rounded off (a share of its half-size) */
const WANDER = 16
const INSET = 5
const ROUNDED = 0.6

/**
 * The ground of a base levelled: packed flat inside, the land round it sloping back to where it was. Its outline is no
 * plain rectangle (the polish pass: "bases sit on a visibly square patch of ground"): its corners rounded, its edge
 * spreading out and back in over tens of px, ragged a pixel or two, and the packed earth thinning out into the ground.
 */
export function levelSite(world: World, cx: number, cy: number, hw: number, hh: number, level: number, salt: number) {
  const { height: H, mat: M } = world
  const skirt = 14
  const r = Math.min(hw, hh) * ROUNDED
  for (let y = -hh - skirt - WANDER; y <= hh + skirt + WANDER; y++)
    for (let x = -hw - skirt - WANDER; x <= hw + skirt + WANDER; x++) {
      const o = at(cx + x, cy + y)
      const ox = Math.max(0, Math.abs(x) - (hw - INSET - r))
      const oy = Math.max(0, Math.abs(y) - (hh - INSET - r))
      const out = Math.max(0, Math.sqrt(ox * ox + oy * oy) - r - wander(cx + x, cy + y, salt + 3))
      // (the edge of the packed ground wanders a few pixels in and out)
      const ragged = out - ((hash2(cx + x, cy + y, salt) & 7) - 2) * 0.6
      if (ragged <= 0) {
        H[o] = level
        M[o] = M[o] < 4 && level > 0 ? APRON : (hash2(x >> 1, y >> 1, salt + 1) & 15) < 2 ? APRON_DARK : APRON
      } else if (out < skirt) {
        // (the packed earth thins out over the first few px of the slope, in specks)
        if (M[o] >= 4 && ragged < 5 && (hash2(cx + x, cy + y, salt + 5) & 7) * 0.7 > ragged) M[o] = APRON_DARK
        // a slope back to the ground round about
        const k = out / skirt
        const was = H[o]
        H[o] = Math.round(level + (was - level) * k * k)
        if (M[o] < 4 && H[o] > 0) M[o] = APRON_DARK
      }
    }
}

/** a landing pad: a slab of concrete with seams, hazard stripes round its edge and a light at each corner */
function stampPad(world: World, cx: number, cy: number, level: number): Pad {
  const { height: H, mat: M } = world
  const h = PAD_HALF
  for (let y = -h; y < h; y++)
    for (let x = -h; x < h; x++) {
      const o = at(cx + x, cy + y)
      const edge = Math.min(x + h, h - 1 - x, y + h, h - 1 - y)
      let m: number
      if (edge < 1) m = PAD_SEAM
      else if (edge < 4) m = (((x + y + 64) >> 2) & 1) === 0 ? HAZARD_Y : HAZARD_K
      else m = (x + h - 4) % 10 === 0 || (y + h - 4) % 10 === 0 ? PAD_SEAM : PAD
      H[o] = level + 1
      M[o] = m
    }
  // the corner lights, a step above the slab
  for (const [lx, ly] of [
    [-h + 1, -h + 1],
    [h - 3, -h + 1],
    [-h + 1, h - 3],
    [h - 3, h - 3],
  ])
    for (let y = 0; y < 2; y++)
      for (let x = 0; x < 2; x++) {
        const o = at(cx + lx + x, cy + ly + y)
        H[o] = level + 2
        M[o] = PAD_LIGHT
      }
  return { x: cx, y: cy, half: h - 4, z: level + 1 }
}

/** a base, stamped at (cx, cy) on ground levelled to `level` */
function stampBase(
  world: World,
  id: number,
  name: string,
  owner: BaseOwner,
  capital: boolean,
  cx: number,
  cy: number,
  level: number,
  sun: [number, number],
): Base {
  const layout = capital ? CAPITAL : OUTPOST
  const [hw, hh] = layout.apron
  levelSite(world, cx, cy, hw, hh, level, id * 31 + 7)
  // tyre tracks from the pads to the hangar
  for (const [px, py] of layout.pads) {
    const [, bx, by] = layout.buildings[capital ? 1 : 0]
    for (let t = 0; t <= 1; t += 0.01) {
      const x = Math.round(cx + px + (bx - px) * t)
      const y = Math.round(cy + py + (by - py) * t)
      for (const w of [-5, 5]) if ((hash2(x, y, id) & 3) !== 0) world.mat[at(x + (by === py ? 0 : w), y + (by === py ? w : 0))] = APRON_DARK
    }
  }
  const pads = layout.pads.map(([x, y]) => stampPad(world, cx + x, cy + y, level))
  const trim = owner ? TRIM : HAZARD_Y
  for (const [kind, x, y] of layout.buildings) {
    const p = PREFABS[kind]
    const x0 = cx + x - (p.w >> 1)
    const y0 = cy + y - (p.h >> 1)
    stamp(world, p, x0, y0, level, structureMat(trim))
    // a lit doorway or two along its front
    for (let i = 2; i < p.w - 2; i++) {
      if ((hash2(x0 + i, y0, id + 3) & 15) > 1) continue
      for (let k = p.h - 1; k >= 0; k--)
        if (p.mat[k][i] !== '.') {
          world.mat[at(x0 + i, y0 + k)] = WINDOW
          break
        }
    }
  }
  const turrets = layout.turrets.map(([x, y]) => {
    const p = PREFABS.turret
    stamp(world, p, cx + x - (p.w >> 1), cy + y - (p.h >> 1), level, structureMat(trim))
    return { x: cx + x, y: cy + y, z: level + 5 }
  })
  // the flag mast: a thin pole on a small footing, its tip in the owner's colour
  const [mx, my] = layout.mast
  for (let y = -1; y <= 1; y++)
    for (let x = -1; x <= 1; x++) {
      world.height[at(cx + mx + x, cy + my + y)] = level + 1
      world.mat[at(cx + mx + x, cy + my + y)] = PLINTH
    }
  const top = Math.min(TALLEST, level + 24)
  world.height[at(cx + mx, cy + my)] = top
  world.mat[at(cx + mx, cy + my)] = owner ? TRIM : MAST
  castBox(world, cx - hw - 4, cy - hh - 4, cx + hw + 4, cy + hh + 4, sun[0], sun[1])
  return { id, name, owner, capital, x: cx, y: cy, pads, turrets, mast: { x: cx + mx, y: cy + my, z: top } }
}

/** an outcrop of `ore` at (cx, cy): a heap of rubble with crystals standing out of it (a wreck: scorched ground round a broken hull) */
function stampOutcrop(
  world: World,
  id: number,
  ore: GroundOre,
  cx: number,
  cy: number,
  rich: boolean,
  salt: number,
  period: [number, number],
  reef = false,
): Outcrop {
  const { height: H, mat: M } = world
  const wreck = ore === 'salvage'
  // (a reef stands just out of the water)
  const ground = Math.max(reef ? 1 : 0, H[at(cx, cy)])
  const sea = reef ? 2 : 4
  const r = rich ? 19 : wreck ? 17 : 10
  // the heap (or the scorch), its edge ragged; a rich deposit is a shallow crater with a raised rim
  for (let y = -r - 2; y <= r + 2; y++)
    for (let x = -r - 2; x <= r + 2; x++) {
      const d = Math.sqrt(x * x + y * y) + ((hash2(cx + x, cy + y, salt) & 7) - 3) * 0.5
      if (d > r) continue
      const o = at(cx + x, cy + y)
      if (M[o] < sea) continue
      const n = hash2(cx + x, cy + y, salt + 1)
      if (wreck) {
        M[o] = n < 150 ? SCORCH : n < 220 ? RUBBLE_DARK : M[o]
        H[o] = ground
      } else {
        M[o] = n < 120 ? RUBBLE : RUBBLE_DARK
        H[o] = Math.min(TALLEST, ground + (rich ? (d > r - 5 ? 2 : 0) : d < r - 3 ? 1 : 0))
      }
    }
  const cells: number[] = []
  const tall: number[] = []
  const mats: number[] = []
  const low: number[] = []
  const lowMat: number[] = []
  const shade = ORE_MAT[ore]
  const p = PREFABS[ore]
  // the crystals: one cluster, or a rich deposit's ring of them round the biggest
  const spots: [number, number][] = rich
    ? [
        [0, 0],
        [-9, -5],
        [8, -6],
        [-7, 7],
        [9, 6],
      ]
    : [[0, 0]]
  let top = ground
  for (const [sx, sy] of spots) {
    const x0 = cx + sx - (p.w >> 1)
    const y0 = cy + sy - (p.h >> 1)
    for (let y = 0; y < p.h; y++)
      for (let x = 0; x < p.w; x++) {
        const code = p.mat[y][x]
        if (code === '.') continue
        const o = at(x0 + x, y0 + y)
        if (M[o] < sea) continue
        const h = Math.min(TALLEST, ground + parseInt(p.height[y][x], 36) + (rich && sx === 0 && sy === 0 ? 1 : 0))
        const m = code === 'r' ? RUBBLE : code === 'R' ? RUBBLE_DARK : shade + Number(code)
        if (h <= H[o] && !(m >= shade && m < shade + 3)) continue
        H[o] = h
        M[o] = m
        if (h > top) top = h
        if (m >= shade && m < shade + 3) {
          // (mined out, a crystal leaves a stump of dark rubble)
          cells.push(o)
          tall.push(h)
          mats.push(m)
          low.push(Math.min(h, ground + 1))
          lowMat.push(wreck ? SCORCH : RUBBLE_DARK)
        }
      }
  }
  const stock = rich ? MINE.rich : wreck ? MINE.wreck : MINE.stock
  const length = period[0] + (hash2(cx, cy, salt + 5) / 255) * (period[1] - period[0])
  const len = Math.round(length)
  return {
    id,
    x: cx,
    y: cy,
    z: top,
    ground,
    ore,
    rich,
    wreck,
    stock,
    period: len,
    offset: Math.round((hash2(cy, cx, salt + 6) / 255) * len),
    cells,
    tall,
    mats,
    low,
    lowMat,
  }
}

/** a place for an outcrop: on land (no sea within its reach), not too tall, clear of the bases and the other outcrops */
function outcropFits(world: World, x: number, y: number, r: number, taken: { x: number; y: number; r: number }[], shallows: boolean) {
  const { height: H, mat: M } = world
  const h = H[at(x, y)]
  if (h > 34) return false
  // (on an ocean world, a reef in the shallows will do)
  const sea = shallows ? 2 : 4
  for (let dy = -r; dy <= r; dy += 3)
    for (let dx = -r; dx <= r; dx += 3) {
      const o = at(x + dx, y + dy)
      if (M[o] < sea || M[o] >= FEATURE_MAT || Math.abs(H[o] - h) > 6) return false
    }
  return !taken.some((t) => apart(x, y, t.x, t.y) < t.r + r + 30)
}

/**
 * Stamps a world's features into its ground, after its archetype has built it: its bases
 * (`home`: whose home system the world is in, if anyone's; `capital`: it is that side's
 * capital world), its ore, rich deposits and wrecks. Leaves them in world.features, and
 * their materials in world.look.
 */
export function stampFeatures(world: World, r: WorldRecipe, homeSide: BaseOwner = null, capitalWorld = false) {
  // (a barren moon cannot be held: its outpost is nobody's, even in a side's home system)
  const home = r.archetype === 'moon' ? null : homeSide
  const capital = capitalWorld && !!home
  const rnd = mulberry32(Math.imul(r.seed | 0, 2654435761) ^ 0x51f7)
  const salt = (r.seed & 0xffff) + 101
  const ocean = r.archetype === 'ocean'
  const moon = r.archetype === 'moon'
  const sun = sunFor(r.timeOfDay)
  const ground = groundColour(world)
  world.look = featureLook(world.look, ground, home ? SIDE_TRIM[home] : [238, 196, 44], ocean)
  const features = (world.features = noFeatures())

  // ── the bases: the first near where ships arrive, the second far across the world from it
  const sx = world.spawnX
  const sy = world.spawnY
  const name = (k: number) => `${NAME_A[(hash2(salt, k, 9) % NAME_A.length) | 0]} ${NAME_B[(hash2(k, salt, 11) % NAME_B.length) | 0]}`
  const first =
    placeBase(world, capital ? CAPITAL : OUTPOST, ocean, sx, sy, [140, 620], [], salt) ??
    placeBase(world, capital ? CAPITAL : OUTPOST, ocean, sx, sy, [0, 1500], [], salt)
  if (first) {
    const owner = home
    const label = capital
      ? home === 'nomarchy'
        ? 'Nomarchy Command'
        : 'Anarchoi Yard'
      : owner
        ? `${owner === 'nomarchy' ? 'Nomarchy' : 'Anarchoi'} ${name(1)}`
        : name(1)
    features.bases.push(stampBase(world, 0, label, owner, capital, first.x, first.y, first.level, sun))
  }
  if (!moon && first) {
    const second = placeBase(world, OUTPOST, ocean, first.x, first.y, [700, 1450], [], salt + 17)
    if (second) features.bases.push(stampBase(world, 1, name(2), null, false, second.x, second.y, second.level, sun))
  }

  // ── the ore: which ores the world holds, how likely each is, and the dearest for its rich deposits
  const ores = r.resources.map((x) => ({ id: resourceOf(x.ore), weight: x.richness }))
  const total = ores.reduce((s, o) => s + o.weight, 0) || 1
  const dearest = ores.reduce((a, b) => (RESOURCES[b.id].price > RESOURCES[a.id].price ? b : a), ores[0]).id
  // (no ore near a base: a sortie goes out into open sky for it, and has a way to come home)
  const taken: { x: number; y: number; r: number }[] = features.bases.map((b) => ({ x: b.x, y: b.y, r: BASE_CLEAR }))
  let id = 0
  const tryPlace = (x: number, y: number, rr: number) => {
    const fx = (x + N * 4) & NM
    const fy = (y + N * 4) & NM
    if (!outcropFits(world, fx, fy, rr, taken, ocean)) return null
    taken.push({ x: fx, y: fy, r: rr })
    return [fx, fy]
  }
  // rich deposits: half-way between the two bases, and a little way from where ships arrive
  const b0 = features.bases[0]
  const b1 = features.bases[1]
  const hubs: [number, number][] = []
  if (b0 && b1) {
    // (half-way the short way round)
    let dx = b1.x - b0.x
    let dy = b1.y - b0.y
    if (dx > N / 2) dx -= N
    if (dx < -N / 2) dx += N
    if (dy > N / 2) dy -= N
    if (dy < -N / 2) dy += N
    hubs.push([b0.x + dx / 2, b0.y + dy / 2], [b0.x + dx / 2, b0.y + dy / 2])
  }
  hubs.push([sx, sy])
  for (const [hx, hy] of hubs) {
    for (let tries = 0; tries < 220; tries++) {
      const spread = 80 + tries * 2
      const place = tryPlace(Math.round(hx + (rnd() - 0.5) * spread * 2), Math.round(hy + (rnd() - 0.5) * spread * 2), 22)
      if (!place) continue
      features.outcrops.push(stampOutcrop(world, id++, dearest, place[0], place[1], true, salt + id * 7, MINE.period, ocean))
      break
    }
  }
  // the wrecks of old crashes
  for (let n = 0, tries = 0; n < 3 && tries < 400; tries++) {
    const place = tryPlace((rnd() * N) | 0, (rnd() * N) | 0, 18)
    if (!place) continue
    features.outcrops.push(stampOutcrop(world, id++, 'salvage', place[0], place[1], false, salt + id * 7, MINE.period, ocean))
    n++
  }
  // ordinary outcrops, scattered over the land
  const want = moon ? 30 : ocean ? 10 : 22
  for (let n = 0, tries = 0; n < want && tries < 3000; tries++) {
    const place = tryPlace((rnd() * N) | 0, (rnd() * N) | 0, 11)
    if (!place) continue
    let pick = rnd() * total
    let ore = ores[0].id
    for (const o of ores) {
      pick -= o.weight
      if (pick <= 0) {
        ore = o.id
        break
      }
    }
    features.outcrops.push(stampOutcrop(world, id++, ore, place[0], place[1], false, salt + id * 7, MINE.period, ocean))
    n++
  }
  // their shadows, on their own rubble
  for (const o of features.outcrops) castBox(world, o.x - 22, o.y - 22, o.x + 22, o.y + 22, sun[0], sun[1])
}

/** shows how much of an outcrop is left (0..1): as it is mined, its crystals go, the outermost first */
export function showOutcrop(world: World, o: Outcrop, left: number) {
  const n = o.cells.length
  const keep = Math.round(n * Math.max(0, Math.min(1, left)))
  for (let i = 0; i < n; i++) {
    // (each crystal pixel's rank: the tallest are the last to go)
    const stays = o.tall[i] - o.ground + (hash2(o.cells[i], o.id, 3) & 3) * 0.25 >= rankCut(o, keep)
    world.height[o.cells[i]] = stays ? o.tall[i] : o.low[i]
    world.mat[o.cells[i]] = stays ? o.mats[i] : o.lowMat[i]
  }
}

/** the rank a crystal pixel must reach to stay, with `keep` of them kept */
function rankCut(o: Outcrop, keep: number) {
  if (keep >= o.cells.length) return -1
  if (keep <= 0) return 1e9
  const ranks = o.tall.map((h, i) => h - o.ground + (hash2(o.cells[i], o.id, 3) & 3) * 0.25).sort((a, b) => b - a)
  return ranks[keep - 1]
}
