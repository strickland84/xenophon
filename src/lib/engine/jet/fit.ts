// A ship as its pilot has made it: its hull, with the weapons and modules he fitted hung where they
// go, the pattern he chose painted over its body, and his emblem and his side's mark on its wings.
// It is all one sprite stack, so the parts turn, tilt and are lit with the ship; built once for each
// way a hull is fitted and painted, and shared.
//
// Where things go is worked out from the hull's own shape (seen from above): its wings (the widest
// rows), its nose and tail, its spine. A hull bare and plain is exactly its own mesh (meshOf).
//
// The parts' art is the image model's (jet/parts.ts); its colours take the ship's paint: the metal
// is the trim colour (palette family 4), its markings the hull's markings, a glow the engine glow.
// A pattern moves body voxels into family 6; an emblem and a side's mark are family 5.

import { MODULE_SLOTS, moduleOf } from '../data/loadout'
import type { Place, WeaponId } from '../data/loadout'
import { statsOf } from '../data/hulls'
import { buildJetMesh, meshOf } from './mesh'
import type { JetMesh } from './mesh'
import { bigHullOf, decodeHull, hullOf } from './model'
import type { HullData } from './model'
import { BIG_EMBLEM_ART, BIG_PART_ART, EMBLEM_ART, PART_ART } from './parts'
import type { PartArt } from './parts'

/** the trim colour's tones are palette family 4; the emblem's and the mark's family 5; the pattern's family 6 */
export const TRIM_AT = 65
export const EMBLEM_AT = 81
export const PATTERN_AT = 97
/** the parts' own colours (render/paint.ts PART_COLOURS): family 7, each part's art's letters 'H' to 'W' */
export const PART_AT = 113
/** the tone of family 5 an emblem's pixels take, and a side's mark's */
export const EMBLEM_TONE = 5
export const MARK_TONE = 12

/** the patterns a hull's body can be painted in (in the trim colour) */
export const PATTERNS = ['', 'stripes', 'bands', 'checks', 'teeth', 'tips', 'split'] as const
export const PATTERN_NAMES: Record<string, string> = {
  '': 'Plain',
  stripes: 'Racing stripes',
  bands: 'Bands',
  checks: 'Checks',
  teeth: 'Shark teeth',
  tips: 'Wingtips',
  split: 'Two-tone',
}

/** the emblems a pilot can choose (each drawn by the image model; '' none) */
export const EMBLEMS = ['', 'skull', 'star', 'wolf', 'comet', 'crown', 'eye', 'fang', 'flame', 'bolt', 'moon']

/** everything about a ship's shape a pilot chooses: what is on each mount, the modules, the pattern, the emblem, and his side's mark (0 none, 1 the Nomarchy's triangle, 2 the Anarchoi's diamond) */
export interface ShipMake {
  hull: string
  weapons: WeaponId[]
  modules: string[]
  pattern: string
  emblem: string
  mark: number
}

/** which part's art a weapon or module is drawn with (the cannon is drawn into every hull already) */
const ART_OF: Record<string, string> = {
  flak: 'flak',
  laser: 'laser',
  rack: 'rack',
  mines: 'mines',
  afterburner: 'tank',
  'shield-booster': 'shield',
  'cargo-pod': 'cargo',
  scanner: 'scanner',
  tractor: 'tractor',
  'cruise-drive': 'cruise',
  'heat-sink': 'heatsink',
  armour: 'armour',
}

/** slices left free below and above the hull, for parts hung there */
const BELOW = 2
const ABOVE = 3

/** the hull seen from above: for each row (nose first) and column, its highest and lowest slice (−1 none) */
function topView(model: HullData, slices: Uint8Array[]) {
  const { w, l, h } = model
  const top = new Int8Array(w * l).fill(-1)
  const bottom = new Int8Array(w * l).fill(-1)
  for (let y = 0; y < h; y++)
    for (let o = 0; o < w * l; o++)
      if (slices[y][o]) {
        if (bottom[o] < 0) bottom[o] = y
        top[o] = y
      }
  return { top, bottom }
}

/** where things go on a hull: its shape's measures */
function measure(model: HullData, top: Int8Array) {
  const { w, l } = model
  const mid = (w - 1) / 2
  let nose = l
  let tail = -1
  let wingK = 0
  let wingHalf = 0
  const half: number[] = []
  for (let k = 0; k < l; k++) {
    let lo = w
    let hi = -1
    for (let i = 0; i < w; i++)
      if (top[k * w + i] >= 0) {
        lo = Math.min(lo, i)
        hi = Math.max(hi, i)
      }
    const hs = hi >= 0 ? Math.max(mid - lo, hi - mid) : 0
    half.push(hs)
    if (hi >= 0) {
      nose = Math.min(nose, k)
      tail = Math.max(tail, k)
    }
    // (the wing: the widest row of the back two thirds)
    if (k > l * 0.3 && hs > wingHalf) {
      wingHalf = hs
      wingK = k
    }
  }
  // (where a shark's mouth goes: the first row back from the nose wide enough to carry it)
  let mouth = nose
  while (mouth < tail && half[mouth] < Math.max(3, wingHalf * 0.35)) mouth++
  return { mid, nose, tail, wingK, wingHalf, half, mouth }
}

/** the first row from the nose a column has hull in (−1: none) */
function leadingEdge(model: HullData, top: Int8Array, i: number) {
  for (let k = 0; k < model.l; k++) if (top[k * model.w + i] >= 0) return k
  return -1
}

interface Spot {
  /** column of the part's middle (may be off the hull's grid), the row its front is on, and whether it is flipped across */
  i: number
  k: number
  /** set on top of the hull ('top'), hung under it ('under'), or each pixel on the hull's surface ('skin') */
  how: 'top' | 'under' | 'skin'
}

/** where a weapon goes on mount `m` of `n` */
function weaponSpots(model: HullData, top: Int8Array, n: number, m: number, art: PartArt): Spot {
  const g = measure(model, top)
  if (n === 1) {
    // a chin mount: under the nose, poking out ahead of it
    return { i: g.mid, k: g.nose - Math.round(art.l * 0.5), how: 'under' }
  }
  // pairs, out along the wings: the inner pair of four, then the outer
  const pair = m >> 1
  const pairs = Math.ceil(n / 2)
  const out = pairs === 1 ? 0.55 : pair === 0 ? 0.36 : 0.74
  const side = m % 2 === 0 ? -1 : 1
  const i = Math.round(g.mid + side * g.wingHalf * out)
  const edge = Math.max(0, leadingEdge(model, top, i))
  // (most of the pod ahead of the wing's leading edge)
  return { i, k: edge - Math.round(art.l * 0.45), how: 'top' }
}

/** where a module goes; `second` for the other of a pair */
function moduleSpot(model: HullData, top: Int8Array, place: Place, art: PartArt, second: boolean): Spot | null {
  const g = measure(model, top)
  const len = g.tail - g.nose + 1
  const side = second ? 1 : -1
  switch (place) {
    case 'back':
      return { i: g.mid, k: Math.round(g.nose + len * 0.5), how: 'top' }
    case 'spine':
      return { i: g.mid, k: Math.round(g.nose + len * 0.38), how: 'top' }
    case 'roots':
      return { i: Math.round(g.mid + side * Math.max(3, g.wingHalf * 0.32)), k: Math.round(g.nose + len * 0.45), how: 'top' }
    case 'flanks':
      return { i: Math.round(g.mid + side * g.wingHalf * 0.62), k: Math.round(g.wingK - art.l * 0.2), how: 'top' }
    case 'outer':
      return { i: Math.round(g.mid + side * (g.wingHalf - 1)), k: Math.round(g.wingK - art.l * 0.6), how: 'top' }
    case 'tail':
      return { i: g.mid, k: g.tail - art.l + 3, how: 'top' }
    case 'nose':
      return { i: g.mid, k: g.nose + 1, how: 'skin' }
    case 'chin':
      return { i: g.mid, k: g.nose - Math.round(art.l * 0.6), how: 'top' }
  }
}

/** the places taken by pairs (each module there is fitted twice, once each side) */
const PAIRED: Place[] = ['roots', 'flanks', 'outer']

/** the key a make is kept by */
export const makeKey = (m: ShipMake) => `${m.hull}|${m.weapons.join(',')}|${m.modules.join(',')}|${m.pattern}|${m.emblem}|${m.mark}`

/** true when nothing is changed from the hull as drawn */
export const plainMake = (m: ShipMake) =>
  m.weapons.every((w) => w === 'cannon') && m.modules.length === 0 && !m.pattern && !m.emblem && !m.mark

/** which way a body voxel faces out: the top of its column, its belly, or a flank (its sides, nose and back) */
const TOP = 0
const FLANK = 1
const BELLY = 2

/** the tone of the pattern's colour each face takes: flat, lit from above, so a pattern reads as clean paint */
const FACE_TONE = [12, 9, 6]

/**
 * The pattern's tone (of family 6) a body voxel takes, or 0 if it keeps its own: at column `i`, row `k`, `z` slices up
 * from the hull's belly (of its `h`), facing `face`. The patterns follow the hull's form: racing stripes down the spine,
 * bands round the whole hull, checks over the backs of the wings, a shark's mouth along both flanks of the nose, the
 * wingtips, and the upper hull two-tone. (`F`: how many times larger the build is than the one flown.)
 */
function patterned(pattern: string, i: number, k: number, z: number, h: number, face: number, g: ReturnType<typeof measure>, F = 1) {
  const a = (i - g.mid) / F
  const aa = Math.abs(a)
  const kk = Math.floor(k / F)
  const half = (r: number) => g.half[Math.min(g.half.length - 1, Math.round(r * F))] / F
  const nose = g.nose / F
  const tail = g.tail / F
  const len = tail - nose + 1
  const u = (kk - nose) / Math.max(1, len)
  const flat = FACE_TONE[face]
  switch (pattern) {
    case 'stripes':
      // two stripes down the spine, nose to tail, on top
      return face === TOP && aa >= 1 && aa <= 2.5 ? flat : 0
    case 'bands': {
      // two bands right round the hull: across the top, down the flanks and under the belly
      const wide = Math.max(2, Math.round(len * 0.07))
      const at = (c: number) => kk >= Math.round(nose + len * c) && kk < Math.round(nose + len * c) + wide
      return at(0.34) || at(0.62) ? flat : 0
    }
    case 'checks':
      // a chequer of squares three px across over the backs of the wings, on top
      return face === TOP && u > 0.45 && aa > Math.max(2, half(kk) * 0.35) && ((Math.floor(a / 3 + 100) + Math.floor(kk / 3)) & 1) === 0
        ? flat
        : 0
    case 'teeth': {
      // a shark's mouth round the nose, where it has widened enough to carry one: across its top, a row of teeth along the
      // mouth's edge (as seen from above); down each flank, pale teeth along its top and the mouth dark below them
      const mouth = g.mouth / F
      const m0 = mouth - 2
      const m1 = mouth + Math.max(4, Math.round(len * 0.18))
      if (face === TOP) {
        const point = 2 - Math.abs((Math.round(aa) % 4) - 2)
        // (pale teeth, pointing back, then the dark of the mouth behind them)
        if (kk < mouth - 1 || kk > mouth + 3 || aa > half(kk) + 1) return 0
        return kk <= mouth + point - 1 ? 14 : 3
      }
      if (face !== FLANK || kk < m0 || kk > m1) return 0
      const lips = h * 0.55 - ((kk - m0) / Math.max(1, m1 - m0)) * h * 0.15
      const tooth = 1.2 - Math.abs(((((kk - m0) % 3) + 3) % 3) - 1) * 1.2
      if (z > lips) return 0
      return z > lips - (1 + tooth) * F ? 14 : z > h * 0.12 ? 3 : 0
    }
    case 'tips':
      // the wingtips, every face of them
      return aa >= Math.max(3, half(kk) * 0.7) ? flat : 0
    case 'split':
      // two-tone: the upper hull in the pattern's colour, the lower in the hull's
      return z >= h * 0.5 ? flat : 0
  }
  return 0
}

const made = new Map<string, JetMesh>()

/** the mesh of a ship made so: the hull's own if it is plain, else built once and shared; `big`: its larger build, as the hangar shows it */
export function fittedMesh(make: ShipMake, big = false): JetMesh {
  if (plainMake(make)) return meshOf(make.hull, big)
  const key = (big ? 'big:' : '') + makeKey(make)
  let mesh = made.get(key)
  if (!mesh) {
    mesh = buildFitted(make, big)
    made.set(key, mesh)
    // (a long session of many paint schemes: keep the cache from growing without end)
    if (made.size > 200) made.delete(made.keys().next().value!)
  }
  return mesh
}

function buildFitted(make: ShipMake, big: boolean): JetMesh {
  const model = big ? bigHullOf(make.hull) : hullOf(make.hull)
  // (the larger build's parts and emblems are drawn larger, from the same pictures; its pattern is the same one, larger)
  const F = big ? model.l / hullOf(make.hull).l : 1
  const parts = big ? BIG_PART_ART : PART_ART
  const emblems = big ? BIG_EMBLEM_ART : EMBLEM_ART
  const { w, l, h } = model
  const slices = decodeHull(model)
  const { top, bottom } = topView(model, slices)
  const g = measure(model, top)
  const H = h + BELOW + ABOVE
  // the hull, raised BELOW slices, in a taller grid
  const grid: Uint8Array[] = []
  for (let y = 0; y < H; y++) grid.push(new Uint8Array(w * l))
  for (let y = 0; y < h; y++) grid[y + BELOW].set(slices[y])
  // the pattern, over the body and its markings alike (so it runs on unbroken), in its own colour: each tone lifted
  // into the colour's own light half, so it stands out from a dark hull and keeps the hull's light and shade
  // (in flat tones by which way each voxel faces, not the picture's own light and shade, which made it blotches)
  if (make.pattern)
    for (let y = 0; y < h; y++) {
      const s = grid[y + BELOW]
      for (let k = 0; k < l; k++)
        for (let i = 0; i < w; i++) {
          const o = k * w + i
          const v = s[o]
          if (v < 1 || v > 32) continue
          const face = y === top[o] ? TOP : y === bottom[o] ? BELLY : FLANK
          const tone = patterned(make.pattern, i, k, y, h, face, g, F)
          if (tone) s[o] = PATTERN_AT + tone
        }
    }
  // the emblem on the left wing, the side's mark on the right (or the emblem's place, with no emblem)
  const stamp = (rows: string[] | undefined, at: number, tone: number) => {
    if (!rows) return
    const n = rows.length
    const ci = Math.round(g.mid + at * g.wingHalf * 0.5)
    const ck = Math.round(g.wingK - g.wingHalf * 0.15)
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        if (rows[r][c] !== '#') continue
        const i = ci - (n >> 1) + c
        const k = ck - (n >> 1) + r
        if (i < 0 || i >= w || k < 0 || k >= l) continue
        const t = top[k * w + i]
        // (only on the hull's own surface; not on its glass)
        if (t < 0) continue
        const v = grid[t + BELOW][k * w + i]
        if ((v - 1) >> 4 === 2) continue
        grid[t + BELOW][k * w + i] = EMBLEM_AT + tone
      }
  }
  if (make.emblem) stamp(emblems[make.emblem], -1, EMBLEM_TONE)
  if (make.mark) stamp(emblems[make.mark === 1 ? 'mark-nomarchy' : 'mark-anarchoi'], make.emblem ? 1 : -1, MARK_TONE)

  // the parts, each where it goes
  const accent = 17 + model.keyTones[1]
  const glowRow = model.palette.find((r) => r[4] === 3)
  const glow = glowRow ? glowRow[0] : 49
  const put = (art: PartArt, spot: Spot, flip: boolean) => {
    const x0 = Math.round(spot.i - (art.w - 1) / 2)
    // (a part on top sits on the highest point under it; one hung under, under the lowest)
    let base = 0
    if (spot.how === 'top') {
      base = BELOW
      for (let r = 0; r < art.l; r++)
        for (let c = 0; c < art.w; c++) {
          const i = x0 + c
          const k = spot.k + r
          if (art.rows[r][c] === '.' || i < 0 || i >= w || k < 0 || k >= l) continue
          base = Math.max(base, top[k * w + i] + BELOW + 1)
        }
    } else if (spot.how === 'under') {
      base = BELOW + h
      for (let r = 0; r < art.l; r++)
        for (let c = 0; c < art.w; c++) {
          const i = x0 + c
          const k = spot.k + r
          if (art.rows[r][c] === '.' || i < 0 || i >= w || k < 0 || k >= l) continue
          if (bottom[k * w + i] >= 0) base = Math.min(base, bottom[k * w + i] + BELOW)
        }
      if (base === BELOW + h) base = BELOW + model.pivotY
    }
    // a part on the hull casts a dark rim round itself onto the surface under it, so it stands off it
    if (spot.how !== 'under') {
      const on = (r: number, c: number) => r >= 0 && r < art.l && c >= 0 && c < art.w && art.rows[r][flip ? art.w - 1 - c : c] !== '.'
      for (let r = -1; r <= art.l; r++)
        for (let c = -1; c <= art.w; c++) {
          if (on(r, c) || !(on(r - 1, c) || on(r + 1, c) || on(r, c - 1) || on(r, c + 1) || on(r - 1, c - 1))) continue
          const i = x0 + c
          const k = spot.k + r
          if (i < 0 || i >= w || k < 0 || k >= l) continue
          const t = top[k * w + i]
          if (t < 0) continue
          const s = grid[t + BELOW]
          const v = s[k * w + i]
          if (v) s[k * w + i] = v - Math.min((v - 1) & 15, 5)
        }
    }
    for (let r = 0; r < art.l; r++)
      for (let c = 0; c < art.w; c++) {
        const ch = art.rows[r][flip ? art.w - 1 - c : c]
        if (ch === '.') continue
        const i = x0 + c
        const k = spot.k + r
        if (i < 0 || i >= w || k < 0 || k >= l) continue
        const tall = Number(art.tall[r][flip ? art.w - 1 - c : c]) || 1
        const v =
          ch === 'A' ? accent : ch === 'G' ? glow : ch >= 'H' && ch <= 'W' ? PART_AT + ch.charCodeAt(0) - 72 : TRIM_AT + parseInt(ch, 16)
        let y0 = base
        if (spot.how === 'skin') {
          const t = top[k * w + i]
          if (t < 0) continue
          y0 = t + BELOW + 1
        } else if (spot.how === 'under') y0 = base - tall
        for (let y = y0; y < y0 + tall; y++) if (y >= 0 && y < H) grid[y][k * w + i] = v
      }
  }
  const mounts = statsOf(make.hull).mounts
  for (let m = 0; m < mounts; m++) {
    const id = make.weapons[m] ?? 'cannon'
    const art = parts[ART_OF[id]]
    if (!art) continue
    put(art, weaponSpots(model, top, mounts, m, art), m % 2 === 1)
  }
  const slots = MODULE_SLOTS[make.hull] ?? 2
  for (const id of make.modules.slice(0, slots)) {
    const mod = moduleOf(id)
    const art = parts[ART_OF[id]]
    if (!mod || !art) continue
    const sides = PAIRED.includes(mod.place) ? [false, true] : [false]
    for (const second of sides) {
      const spot = moduleSpot(model, top, mod.place, art, second)
      if (spot) put(art, spot, second)
    }
  }

  // only as many slices as are used: the hull raised by whatever hangs under it
  let lo = 0
  while (lo < BELOW && grid[lo].every((v) => !v)) lo++
  let hi = H
  while (hi > BELOW + h && grid[hi - 1].every((v) => !v)) hi--
  const used = grid.slice(lo, hi)
  const lift = BELOW - lo
  const fitted: HullData = {
    ...model,
    h: used.length,
    pivotY: model.pivotY + lift,
    engines: model.engines.map((e) => ({ ...e, y: e.y + lift })),
    wingtipY: model.wingtipY + lift,
  }
  const mesh = buildJetMesh(fitted, used)
  mesh.make = make
  return mesh
}
