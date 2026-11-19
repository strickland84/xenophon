// What the island world's ground is made of. Each ground pixel has one of these materials; a
// material has a colour for its top and one for its side (the wall of a stack of layers).
// Other worlds have tables of their own (world/archetypes/), in the same order where it
// matters: 0..3 are always the sea (deep, mid, shallow, surf).
//
// index: 0 deep · 1 mid · 2 shallow · 3 surf · 4 sand · 5 sand speck · 6 grass · 7 grass dark · 8 grass light
//        9 tree top · 10 tree · 11 tree edge · 12 rock · 13 rock dark · 14 rock light · 15 snow · 16 snow shade
export const MAT_TOP = [
  [36, 104, 180],
  [44, 124, 198],
  [66, 160, 216],
  [104, 204, 214],
  [238, 220, 164],
  [222, 200, 140],
  [96, 178, 52],
  [70, 148, 44],
  [134, 206, 76],
  [70, 158, 64],
  [42, 122, 54],
  [28, 92, 46],
  [146, 140, 134],
  [118, 112, 110],
  [178, 172, 162],
  [246, 250, 255],
  [214, 226, 244],
]
export const MAT_SIDE = [
  [36, 104, 180],
  [44, 124, 198],
  [66, 160, 216],
  [104, 204, 214],
  [204, 180, 122],
  [204, 180, 122],
  [56, 120, 44],
  [50, 108, 42],
  [60, 128, 46],
  [24, 78, 42],
  [22, 72, 40],
  [20, 64, 38],
  [96, 90, 92],
  [86, 82, 86],
  [104, 98, 98],
  [186, 202, 228],
  [176, 192, 220],
]
/** the most materials a world can have (the island world uses the first 17; an archetype's own fit in 32, and the stamped features' follow: world/features.ts) */
export const NMAT = 96
