// Archipelago: green islands with terraced hills, forests and beaches in an open sea. The
// shape is the island world the game has always had (world/generate.ts), unchanged; here are
// its looks: the standard one, sunlit savanna islands, and an alien one.

import { lookOf, STANDARD_LOOK } from '../look'
import type { WorldLook } from '../look'

// (the same seventeen materials as world/materials.ts, recoloured)
const SAVANNA: number[][] = [
  [24, 110, 168],
  [32, 136, 186],
  [52, 184, 200],
  [120, 224, 214],
  [244, 228, 176, 210, 188, 128],
  [228, 206, 150, 210, 188, 128],
  [176, 178, 70, 120, 118, 46],
  [148, 154, 60, 104, 104, 42],
  [206, 202, 96, 132, 128, 52],
  [76, 140, 58, 34, 82, 38],
  [52, 112, 50, 26, 70, 36],
  [36, 86, 44, 22, 58, 34],
  [162, 140, 118, 112, 94, 84],
  [134, 114, 100, 98, 82, 76],
  [192, 172, 146, 124, 106, 94],
  [246, 248, 250, 188, 198, 222],
  [214, 222, 238, 176, 188, 216],
]
const ALIEN: number[][] = [
  [40, 70, 160],
  [52, 96, 184],
  [80, 140, 210],
  [150, 210, 232],
  [240, 206, 214, 206, 160, 176],
  [226, 188, 200, 206, 160, 176],
  [64, 176, 150, 40, 116, 100],
  [50, 150, 132, 36, 104, 92],
  [104, 206, 170, 46, 128, 106],
  [196, 100, 188, 112, 52, 116],
  [160, 72, 160, 96, 42, 104],
  [120, 52, 132, 80, 36, 92],
  [150, 136, 160, 104, 92, 118],
  [124, 110, 138, 90, 78, 104],
  [184, 172, 192, 116, 104, 128],
  [244, 246, 252, 192, 196, 230],
  [214, 216, 244, 180, 182, 222],
]

export const archipelagoLooks: WorldLook[] = [
  STANDARD_LOOK,
  lookOf(SAVANNA, {
    sky: [
      [216, 236, 240],
      [130, 200, 236],
      [56, 148, 214],
    ],
  }),
  lookOf(ALIEN, {
    sky: [
      [226, 214, 244],
      [160, 170, 236],
      [90, 110, 210],
    ],
    haze: [212, 206, 238],
    cloud: [1, 0.96, 1],
  }),
]
