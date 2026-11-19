// A small picture to draw art into and look at: one 0xAABBGGRR colour per pixel, the same
// layout the engine's frames use. The hull plans (hulls.ts) are drawn into these, and
// tools/art-sheet.ts writes them out. Nothing here knows about the page.

export interface Canvas {
  w: number
  h: number
  px: Uint32Array
}

export const pack = (r: number, g: number, b: number, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0

export function createCanvas(w: number, h: number, fill = 0): Canvas {
  const px = new Uint32Array(w * h)
  if (fill) px.fill(fill)
  return { w, h, px }
}

function setPx(c: Canvas, x: number, y: number, col: number) {
  if (x >= 0 && y >= 0 && x < c.w && y < c.h) c.px[y * c.w + x] = col
}

function rect(c: Canvas, x: number, y: number, w: number, h: number, col: number) {
  for (let yy = Math.max(0, y); yy < Math.min(c.h, y + h); yy++)
    for (let xx = Math.max(0, x); xx < Math.min(c.w, x + w); xx++) c.px[yy * c.w + xx] = col
}

/** copies `src` onto `dst` at (x, y), `scale` times larger, skipping empty pixels */
export function blit(dst: Canvas, src: Canvas, x: number, y: number, scale = 1) {
  for (let sy = 0; sy < src.h; sy++) {
    for (let sx = 0; sx < src.w; sx++) {
      const col = src.px[sy * src.w + sx]
      if (col >>> 24 === 0) continue
      if (scale === 1) setPx(dst, x + sx, y + sy, col)
      else rect(dst, x + sx * scale, y + sy * scale, scale, scale, col)
    }
  }
}

/** a dark line round whatever is drawn: every empty pixel that touches a filled one */
export function outline(c: Canvas, col: number) {
  const { w, h, px } = c
  const edge: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * w + x
      if (px[o] >>> 24) continue
      if ((x > 0 && px[o - 1] >>> 24) || (x < w - 1 && px[o + 1] >>> 24) || (y > 0 && px[o - w] >>> 24) || (y < h - 1 && px[o + w] >>> 24))
        edge.push(o)
    }
  }
  for (const o of edge) px[o] = col
}

/** the picture as bytes (RGBA), for a PNG or a canvas's ImageData */
export const bytesOf = (c: Canvas) => new Uint8ClampedArray(c.px.buffer, c.px.byteOffset, c.w * c.h * 4)
