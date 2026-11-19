// The art of space (art.ts) made ready to draw: each picture read once into packed colours, and
// for a sprite that is drawn turned, a copy four times as large made by doubling it twice the
// way pixel art is doubled (Scale2x), so that turning it keeps its edges clean instead of breaking
// them into stairs (the RotSprite idea). Brightness maps are read into bytes, 0..15.

import { pack } from '../util/color'
import type { Brightness, Picture } from './art'

/** a picture read: its size and its pixels (0: nothing), and its colours packed */
export interface Pixels {
  w: number
  h: number
  px: Uint32Array
  /** the palette indices (255: nothing), for pictures whose colours are lit by the renderer */
  idx: Uint8Array
  colours: number[][]
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/'
const CODE = new Int16Array(128).fill(-1)
for (let i = 0; i < ALPHABET.length; i++) CODE[ALPHABET.charCodeAt(i)] = i

/** the letters of a picture as palette indices (255: nothing) */
function decode(rows: string, n: number): Uint8Array {
  const out = new Uint8Array(n).fill(255)
  let o = 0
  for (let i = 0; i < rows.length && o < n;) {
    const c = rows.charCodeAt(i)
    if (c === 33) {
      // '!': a run
      const len = parseInt(rows.substr(i + 1, 2), 36)
      const s = rows.charCodeAt(i + 3)
      const v = s === 46 ? 255 : CODE[s]
      out.fill(v, o, Math.min(n, o + len))
      o += len
      i += 4
    } else {
      out[o++] = c === 46 ? 255 : CODE[c]
      i++
    }
  }
  return out
}

const read = new Map<Picture, Pixels>()
/** a picture's pixels, read once */
export function pixelsOf(p: Picture): Pixels {
  let got = read.get(p)
  if (!got) {
    const idx = decode(p.rows, p.w * p.h)
    const cols = p.colours.map((c) => pack(c[0], c[1], c[2]))
    const px = new Uint32Array(p.w * p.h)
    for (let i = 0; i < px.length; i++) px[i] = idx[i] === 255 ? 0 : cols[idx[i]]
    got = { w: p.w, h: p.h, px, idx, colours: p.colours }
    read.set(p, got)
  }
  return got
}

const bright = new Map<Brightness, Uint8Array>()
/** a brightness map's bytes, 0..15, read once */
export function brightnessOf(b: Brightness): Uint8Array {
  let got = bright.get(b)
  if (!got) {
    got = decode(b.rows, b.w * b.h)
    bright.set(b, got)
  }
  return got
}

/** one doubling of pixel art (Scale2x): each pixel becomes four, its corners taking a neighbour's colour where two edges meet */
function scale2x(src: Uint32Array, w: number, h: number): Uint32Array {
  const out = new Uint32Array(w * h * 4)
  const W = w * 2
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const p = src[y * w + x]
      const a = y > 0 ? src[(y - 1) * w + x] : p
      const b = x < w - 1 ? src[y * w + x + 1] : p
      const c = x > 0 ? src[y * w + x - 1] : p
      const d = y < h - 1 ? src[(y + 1) * w + x] : p
      let e0 = p
      let e1 = p
      let e2 = p
      let e3 = p
      if (c === a && c !== d && a !== b) e0 = a
      if (a === b && a !== c && b !== d) e1 = b
      if (d === c && d !== b && c !== a) e2 = c
      if (b === d && b !== a && d !== c) e3 = d
      const o = y * 2 * W + x * 2
      out[o] = e0
      out[o + 1] = e1
      out[o + W] = e2
      out[o + W + 1] = e3
    }
  return out
}

/** a sprite four times as large, for drawing it turned (made once) */
export interface Big {
  w: number
  h: number
  px: Uint32Array
}
const bigs = new Map<Pixels, Big>()
export function bigOf(p: Pixels): Big {
  let got = bigs.get(p)
  if (!got) {
    const twice = scale2x(p.px, p.w, p.h)
    got = { w: p.w * 4, h: p.h * 4, px: scale2x(twice, p.w * 2, p.h * 2) }
    bigs.set(p, got)
  }
  return got
}
