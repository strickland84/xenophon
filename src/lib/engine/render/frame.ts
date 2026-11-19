// A frame is what the renderer draws into: a low-resolution picture, plus what it needs to
// know about each pixel to layer things correctly. There are two: the one that is shown, and
// a larger square "sheet" the world is drawn on when the view has to be turned (the cockpit).

export interface Frame {
  w: number
  h: number
  /** the picture: one 0xAABBGGRR colour per pixel (0 means nothing drawn yet) */
  fb: Uint32Array
  /** the same memory as bytes, ready for a canvas's ImageData */
  bytes: Uint8ClampedArray<ArrayBuffer>
  /** per pixel: how deep into the view the world is, so it can hide a jet behind it */
  zbuf: Float32Array
  /** per pixel, while a jet is being drawn: 1 where the jet is, 2 where its flames are */
  mask: Uint8Array
  /** per column: the highest row the ground has reached */
  colY: Int32Array
  /** what was behind a jet, kept while it fades in or out */
  backdrop: Uint32Array
  /** per pixel, while a ship is being drawn: how deep its nearest voxel there is, good while `jetStamp` holds that ship's number (so nothing is cleared between ships) */
  jetZ: Float32Array
  jetStamp: Int32Array
  /** the columns and rows being drawn: all of them, except on the sheet */
  colLo: number
  colHi: number
  rowLo: number
  rowHi: number
}

export function createFrame(w: number, h: number): Frame {
  const buffer = new ArrayBuffer(w * h * 4)
  return {
    w,
    h,
    fb: new Uint32Array(buffer),
    bytes: new Uint8ClampedArray(buffer),
    zbuf: new Float32Array(w * h),
    mask: new Uint8Array(w * h),
    colY: new Int32Array(w),
    backdrop: new Uint32Array(w * h),
    jetZ: new Float32Array(w * h),
    jetStamp: new Int32Array(w * h),
    colLo: 0,
    colHi: w,
    rowLo: 0,
    rowHi: h,
  }
}
