// A ship's sprite stack: horizontal slices cut through it, stacked from the belly up. The
// ships themselves are in models/, one file each, generated from pictures by the art tools.

import { HULLS } from './models'
import { BIG_HULLS } from './models/big'

export interface HullData {
  name: string
  /** px across, px long (nose first), and how many slices tall */
  w: number
  l: number
  h: number
  /** the point the ship turns about: how far along from the nose, and which slice */
  pivotK: number
  pivotY: number
  /** the engines, left to right: each one's px off the centre line (left is negative), its height (in slices), the row its nozzle ends on, and its radius */
  engines: { a: number; y: number; k: number; r: number }[]
  /** the colour its engines glow, and its flames burn: [r, g, b] */
  glow: number[]
  /** a wingtip: px off the centre line, how far along, and which slice */
  wingtipA: number
  wingtipK: number
  wingtipY: number
  /** per family (body, accent, canopy): the tone that takes the colour a player picks; the rest keep their distance from it */
  keyTones: number[]
  /** [index, r, g, b, family] — family 0 body, 1 accent, 2 canopy, 3 engine glow */
  palette: number[][]
  /** the voxels, each a palette index (0 is empty), run-length encoded as (count, index) pairs → base64 */
  data: string
}

/** the ship a new pilot flies */
export const DEFAULT_HULL = 'corsair'
export const HULL_NAMES = Object.keys(HULLS)

/** the ship of that name, or the default one */
export const hullOf = (name: string): HullData => HULLS[name] ?? HULLS[DEFAULT_HULL]

/** the ship of that name as the hangar shows it: its larger build (data/interiors.ts BIG) */
export const bigHullOf = (name: string): HullData => BIG_HULLS[name] ?? BIG_HULLS[DEFAULT_HULL]

/** Decodes to `h` slices, each a Uint8Array(w × l) of palette indices (row = nose → tail). */
export function decodeHull(m: HullData): Uint8Array[] {
  const bin = atob(m.data)
  const flat = new Uint8Array(m.w * m.l * m.h)
  let o = 0
  for (let i = 0; i < bin.length; i += 2) {
    const n = bin.charCodeAt(i)
    const v = bin.charCodeAt(i + 1)
    flat.fill(v, o, o + n)
    o += n
  }
  const slices: Uint8Array[] = []
  for (let y = 0; y < m.h; y++) slices.push(flat.subarray(y * m.w * m.l, (y + 1) * m.w * m.l))
  return slices
}
