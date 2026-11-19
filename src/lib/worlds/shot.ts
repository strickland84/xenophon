// The size of the gallery's pictures, and what the worker sends back for each world (gallery.ts).

/** the frame drawn, and the map */
export const SHOT_W = 320
export const SHOT_H = 180
export const MAP = 128

export interface Shot {
  id: string
  frame: Uint8ClampedArray<ArrayBuffer>
  map: Uint8ClampedArray<ArrayBuffer>
  /** ms the world took to build */
  ms: number
}
