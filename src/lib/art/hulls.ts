// The line-up of ships, as plans: each a handful of solid parts with straight edges. Shape comes
// first; these plans are what the image model is made to draw over (seen from above, from the side
// and from behind), and what the voxels are carved from.
//
// A part's outline seen from above is a list of [across, along] corners in pixels: across is
// measured from the centre line, along from the nose. A hull that is the same on both sides gives
// only its right half. Seen from the side a part is limited to its `side` outline ([along, height]
// corners, height up from the lowest point of the belly), and from behind to its `rear` outline
// ([across, height]; the right half too): the part is what all three allow. A part without them is
// as tall as its kind's usual.

import { createCanvas } from './canvas'
import type { Canvas } from './canvas'

export const HULL = 1
export const PART = 2 // engines, pods, tanks: anything bolted on
export const GLASS = 3
export const ENGINE = 4 // a nozzle: a part seen from above, glowing from behind

type Corner = [number, number]

export interface Shape {
  kind: number
  /** seen from above: [across, along] corners */
  at: Corner[]
  /** seen from the side: [along, height] corners */
  side?: Corner[]
  /** seen from behind: [across, height] corners */
  rear?: Corner[]
}

export interface HullPlan {
  name: string
  role: string
  /** true where the right half is mirrored to make the left */
  mirror: boolean
  shapes: Shape[]
}

const box = (x0: number, y0: number, x1: number, y1: number): Corner[] => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
]

/** a box with its corners cut off: a tank, a nacelle or a nozzle seen end on */
const octagon = (x0: number, y0: number, x1: number, y1: number): Corner[] => {
  const c = Math.min(x1 - x0, y1 - y0) * 0.3
  return [
    [x0 + c, y0],
    [x1 - c, y0],
    [x1, y0 + c],
    [x1, y1 - c],
    [x1 - c, y1],
    [x0 + c, y1],
    [x0, y1 - c],
    [x0, y0 + c],
  ]
}

export const HULLS: HullPlan[] = [
  {
    name: 'Dart',
    role: 'Light fighter',
    mirror: true,
    shapes: [
      {
        // a needle, six-sided in section
        kind: HULL,
        at: [
          [0, 2],
          [2, 4],
          [3, 12],
          [4, 30],
          [5, 44],
          [3, 52],
          [0, 52],
        ],
        side: [
          [1, 7.5],
          [10, 12],
          [46, 13.5],
          [52, 12],
          [52, 3],
          [14, 2],
          [4, 5],
        ],
        rear: [
          [0, 2],
          [3, 3],
          [5, 5.5],
          [5, 11],
          [3, 13.5],
          [0, 14],
        ],
      },
      {
        // swept wings, thin, rising a little to the tips
        kind: HULL,
        at: [
          [4, 26],
          [8, 30],
          [18, 40],
          [18, 50],
          [12, 46],
          [5, 46],
        ],
        rear: [
          [4, 6.5],
          [18, 8.5],
          [18, 10.5],
          [4, 9],
        ],
      },
      {
        // the gun pods at the wingtips: tall blades, their leading edges raked
        kind: PART,
        at: box(17, 24, 20, 48),
        side: [
          [24, 8.5],
          [32, 3.5],
          [48, 3],
          [48, 16],
          [36, 15.5],
        ],
        rear: [
          [17, 3],
          [20, 3.5],
          [20, 15.5],
          [17, 16],
        ],
      },
      { kind: ENGINE, at: box(1, 52, 4, 56), rear: octagon(1, 4, 4, 11) },
      {
        kind: GLASS,
        at: [
          [0, 8],
          [2, 10],
          [2, 18],
          [0, 20],
        ],
        side: [
          [8, 11],
          [12, 14],
          [17, 15],
          [20, 12],
        ],
        rear: [
          [0, 11],
          [2, 11.5],
          [2, 13.5],
          [0, 15],
        ],
      },
    ],
  },
  {
    name: 'Sparrow',
    role: 'Scout and courier',
    mirror: true,
    shapes: [
      {
        // a wedge, a flattened diamond in section: a ridge down the middle, thin edges
        kind: HULL,
        at: [
          [0, 0],
          [4, 4],
          [6, 14],
          [10, 24],
          [16, 40],
          [16, 52],
          [12, 56],
          [8, 52],
          [6, 60],
          [0, 60],
        ],
        side: [
          [0, 7],
          [14, 13.5],
          [30, 17.5],
          [56, 17.5],
          [60, 15.5],
          [60, 2],
          [16, 2],
          [2, 5.5],
        ],
        rear: [
          [0, 2],
          [6, 3],
          [16, 6.5],
          [16, 9],
          [6, 15.5],
          [0, 18],
        ],
      },
      {
        // fairings along the flanks
        kind: PART,
        at: [
          [7, 28],
          [10, 32],
          [10, 42],
          [7, 42],
        ],
        rear: [
          [7, 8.5],
          [10, 8.5],
          [10, 14],
          [7, 16],
        ],
      },
      { kind: ENGINE, at: box(1, 60, 5, 64), rear: octagon(0, 4, 5, 14.5) },
      {
        kind: GLASS,
        at: [
          [0, 6],
          [3, 9],
          [4, 16],
          [0, 18],
        ],
        side: [
          [6, 10.5],
          [10, 15],
          [16, 16],
          [18, 13.5],
        ],
        rear: [
          [0, 10],
          [4, 10.5],
          [4, 14],
          [0, 15.5],
        ],
      },
    ],
  },
  {
    name: 'Lance',
    role: 'Interceptor',
    mirror: true,
    shapes: [
      {
        kind: HULL,
        at: [
          [0, 0],
          [1, 4],
          [2, 20],
          [4, 30],
          [5, 44],
          [5, 72],
          [3, 76],
          [0, 76],
        ],
        side: [
          [0, 9],
          [20, 14],
          [30, 16],
          [72, 16],
          [76, 14],
          [76, 4],
          [20, 3.5],
          [2, 7],
        ],
        rear: [
          [0, 3.5],
          [3, 4],
          [5, 7],
          [5, 13.5],
          [3, 15.5],
          [0, 16],
        ],
      },
      {
        // canards, angled up
        kind: HULL,
        at: [
          [2, 14],
          [6, 20],
          [6, 22],
          [2, 22],
        ],
        rear: [
          [2, 8.5],
          [6, 12.5],
          [6, 14.5],
          [2, 11],
        ],
      },
      {
        // the two great engine nacelles, eight-sided, intakes raked
        kind: PART,
        at: [
          [5, 38],
          [9, 34],
          [12, 40],
          [12, 70],
          [10, 76],
          [6, 76],
          [5, 72],
        ],
        side: [
          [34, 8.5],
          [40, 2],
          [76, 2],
          [76, 17.5],
          [40, 17.5],
        ],
        rear: octagon(5, 2, 12, 17.5),
      },
      { kind: ENGINE, at: box(6, 76, 10, 80), rear: octagon(6, 4, 10, 15.5) },
      {
        kind: GLASS,
        at: [
          [0, 8],
          [1.5, 10],
          [1.5, 18],
          [0, 19],
        ],
        side: [
          [8, 11],
          [11, 15],
          [16, 16],
          [19, 13.5],
        ],
        rear: [
          [0, 11],
          [1.5, 12],
          [1.5, 15],
          [0, 16],
        ],
      },
    ],
  },
  {
    name: 'Corsair',
    role: 'Raider',
    mirror: true,
    shapes: [
      {
        // a forked nose of two blades, a wedge behind: a high spine, thin edges
        kind: HULL,
        at: [
          [7, 0],
          [9, 2],
          [12, 22],
          [18, 40],
          [24, 56],
          [24, 64],
          [18, 68],
          [0, 68],
          [0, 24],
          [4, 20],
          [5, 2],
        ],
        side: [
          [0, 10],
          [2, 5.5],
          [20, 3],
          [68, 3],
          [68, 15.5],
          [58, 19],
          [36, 19],
          [22, 15.5],
          [2, 13.5],
        ],
        rear: [
          [0, 3],
          [10, 3.5],
          [24, 7],
          [24, 10.5],
          [12, 15.5],
          [0, 19],
        ],
      },
      {
        kind: PART,
        at: box(20, 34, 22, 52),
        side: [
          [34, 8.5],
          [38, 5.5],
          [52, 5.5],
          [52, 12],
          [38, 12],
        ],
        rear: octagon(20, 5.5, 22, 12),
      },
      { kind: ENGINE, at: box(2, 68, 8, 72), rear: octagon(2, 4, 8, 15.5) },
      { kind: ENGINE, at: box(12, 68, 17, 71), rear: octagon(12, 5, 17, 12) },
      {
        kind: GLASS,
        at: [
          [0, 28],
          [3, 26],
          [4, 34],
          [0, 38],
        ],
        side: [
          [26, 15.5],
          [29, 19],
          [35, 20],
          [38, 17],
        ],
        rear: [
          [0, 15.5],
          [4, 16.5],
          [4, 19],
          [0, 20],
        ],
      },
    ],
  },
  {
    name: 'Prospector',
    role: 'Miner',
    mirror: true,
    shapes: [
      {
        kind: HULL,
        at: [
          [4, 0],
          [6, 2],
          [9, 18],
          [14, 30],
          [22, 48],
          [22, 62],
          [16, 70],
          [0, 70],
          [0, 16],
          [2, 12],
          [3, 2],
        ],
        side: [
          [0, 11],
          [3, 5.5],
          [20, 3],
          [70, 3],
          [70, 19.5],
          [62, 23],
          [34, 23],
          [16, 17],
          [2, 14],
        ],
        rear: [
          [0, 3],
          [14, 3.5],
          [22, 7],
          [22, 14],
          [14, 21],
          [0, 24],
        ],
      },
      {
        kind: PART,
        at: box(0, 6, 1, 16),
        side: [
          [6, 7],
          [16, 6.5],
          [16, 12],
          [6, 11],
        ],
      },
      {
        // ore tanks on the flanks
        kind: PART,
        at: [
          [23, 50],
          [26, 54],
          [26, 62],
          [23, 64],
        ],
        rear: octagon(23, 4, 26, 16),
      },
      { kind: ENGINE, at: box(3, 70, 10, 75), rear: octagon(3, 4, 10, 16) },
      {
        kind: GLASS,
        at: [
          [0, 20],
          [3, 22],
          [4, 30],
          [0, 32],
        ],
        side: [
          [20, 18],
          [24, 23],
          [30, 23.5],
          [32, 20],
        ],
        rear: [
          [0, 18],
          [4, 19],
          [4, 22],
          [0, 23.5],
        ],
      },
    ],
  },
  {
    name: 'Mule',
    role: 'Light hauler',
    mirror: true,
    shapes: [
      {
        kind: HULL,
        at: [
          [0, 0],
          [3, 2],
          [6, 16],
          [6, 60],
          [0, 60],
        ],
        side: [
          [0, 8.5],
          [16, 16],
          [60, 16],
          [60, 3],
          [14, 3],
          [2, 5.5],
        ],
        rear: [
          [0, 3],
          [4, 3.5],
          [6, 7],
          [6, 13.5],
          [3, 16],
          [0, 17],
        ],
      },
      {
        // the booms either side, eight-sided, their noses raked
        kind: HULL,
        at: [
          [14, 10],
          [16, 12],
          [20, 30],
          [20, 66],
          [12, 70],
          [12, 30],
        ],
        side: [
          [10, 11],
          [30, 3],
          [70, 3],
          [70, 19.5],
          [30, 19.5],
          [14, 15.5],
        ],
        rear: octagon(12, 3, 20, 19.5),
      },
      {
        kind: HULL,
        at: box(6, 20, 12, 24),
        rear: [
          [6, 7],
          [12, 7],
          [12, 12.5],
          [6, 12.5],
        ],
      },
      {
        kind: HULL,
        at: box(6, 60, 12, 64),
        rear: [
          [6, 7],
          [12, 7],
          [12, 12.5],
          [6, 12.5],
        ],
      },
      // the cargo containers clamped between the booms
      {
        kind: PART,
        at: box(7, 26, 11, 40),
        rear: [
          [7, 3.5],
          [11, 3.5],
          [11, 18],
          [7, 18],
        ],
      },
      {
        kind: PART,
        at: box(7, 44, 11, 58),
        rear: [
          [7, 3.5],
          [11, 3.5],
          [11, 18],
          [7, 18],
        ],
      },
      { kind: ENGINE, at: box(13, 70, 19, 74), rear: octagon(13, 4, 19, 18) },
      { kind: ENGINE, at: box(1, 60, 5, 64), rear: octagon(1, 5, 5, 12.5) },
      {
        kind: GLASS,
        at: [
          [0, 6],
          [2, 8],
          [3, 16],
          [0, 18],
        ],
        side: [
          [6, 12.5],
          [10, 16.5],
          [16, 17.5],
          [18, 14.5],
        ],
        rear: [
          [0, 12.5],
          [3, 13.5],
          [3, 16.5],
          [0, 17.5],
        ],
      },
    ],
  },
  {
    name: 'Bastion',
    role: 'Gunship',
    mirror: true,
    shapes: [
      {
        // a heavy arrowhead, its armour stepped up to a high back
        kind: HULL,
        at: [
          [0, 0],
          [3, 2],
          [6, 14],
          [10, 20],
          [13, 36],
          [28, 60],
          [30, 70],
          [22, 76],
          [20, 84],
          [0, 84],
        ],
        side: [
          [0, 10],
          [14, 15.5],
          [20, 15.5],
          [36, 22.5],
          [76, 24.5],
          [84, 22.5],
          [84, 3],
          [20, 3],
          [4, 5.5],
        ],
        rear: [
          [0, 3],
          [13, 3.5],
          [30, 8.5],
          [30, 13.5],
          [24, 15.5],
          [16, 21],
          [0, 24.5],
        ],
      },
      // the two long cannon on its shoulders
      {
        kind: PART,
        at: box(11, 6, 13, 30),
        side: [
          [6, 12.5],
          [30, 12.5],
          [30, 18],
          [6, 17],
        ],
        rear: octagon(11, 12.5, 13, 18),
      },
      {
        // the turret on its back
        kind: PART,
        at: [
          [0, 46],
          [3, 46],
          [5, 49],
          [5, 55],
          [3, 58],
          [0, 58],
        ],
        rear: [
          [0, 21],
          [5, 22.5],
          [5, 28],
          [3, 30],
          [0, 31],
        ],
      },
      { kind: ENGINE, at: box(2, 84, 8, 88), rear: octagon(2, 4, 8, 17) },
      { kind: ENGINE, at: box(12, 84, 19, 87), rear: octagon(12, 4, 19, 13.5) },
      {
        kind: GLASS,
        at: [
          [0, 6],
          [3, 8],
          [4, 16],
          [0, 18],
        ],
        side: [
          [6, 12.5],
          [9, 16.5],
          [15, 17.5],
          [18, 15],
        ],
        rear: [
          [0, 12.5],
          [4, 13.5],
          [4, 16.5],
          [0, 17.5],
        ],
      },
    ],
  },
  {
    name: 'Nomad',
    role: 'Explorer',
    mirror: true,
    shapes: [
      {
        kind: HULL,
        at: [
          [0, 0],
          [3, 6],
          [5, 30],
          [8, 44],
          [8, 74],
          [4, 84],
          [0, 84],
        ],
        side: [
          [0, 7],
          [30, 15.5],
          [44, 19],
          [74, 19],
          [84, 15.5],
          [84, 3],
          [30, 3],
          [4, 5],
        ],
        rear: [
          [0, 3],
          [5, 3.5],
          [8, 7],
          [8, 14.5],
          [4, 18],
          [0, 19],
        ],
      },
      {
        // the forward-swept wings, thin, their tips raised like blades
        kind: HULL,
        at: [
          [8, 56],
          [24, 34],
          [27, 38],
          [16, 64],
          [8, 70],
        ],
        rear: [
          [8, 7],
          [27, 12.5],
          [27, 14.5],
          [8, 10.5],
        ],
      },
      {
        kind: PART,
        at: [
          [9, 42],
          [12, 44],
          [12, 54],
          [9, 56],
        ],
        rear: octagon(9, 5.5, 12, 14.5),
      },
      { kind: ENGINE, at: box(1, 84, 5, 88), rear: octagon(0, 4, 5, 15.5) },
      {
        kind: GLASS,
        at: [
          [0, 10],
          [3, 12],
          [4, 24],
          [0, 26],
        ],
        side: [
          [10, 12.5],
          [14, 17.5],
          [22, 19],
          [26, 16],
        ],
        rear: [
          [0, 12.5],
          [4, 13.5],
          [4, 17.5],
          [0, 19],
        ],
      },
    ],
  },
  {
    name: 'Wraith',
    role: 'Stealth',
    mirror: true,
    shapes: [
      {
        // a flat kite of facets: a low ridge down the middle, knife edges
        kind: HULL,
        at: [
          [0, 0],
          [4, 8],
          [14, 36],
          [22, 52],
          [16, 62],
          [8, 58],
          [4, 70],
          [0, 66],
        ],
        side: [
          [0, 7],
          [14, 12.5],
          [36, 15.5],
          [58, 14.5],
          [70, 10],
          [70, 3],
          [20, 2],
          [4, 5],
        ],
        rear: [
          [0, 2],
          [8, 3.5],
          [22, 6.5],
          [22, 7.5],
          [8, 12.5],
          [0, 15.5],
        ],
      },
      {
        kind: ENGINE,
        at: box(2, 62, 6, 65),
        rear: [
          [2, 5.5],
          [6, 5.5],
          [6, 9],
          [2, 9],
        ],
      },
      {
        kind: GLASS,
        at: [
          [0, 14],
          [3, 18],
          [3, 26],
          [0, 28],
        ],
        side: [
          [14, 12],
          [18, 15],
          [24, 15.5],
          [28, 13],
        ],
        rear: [
          [0, 12],
          [3, 13],
          [3, 14.5],
          [0, 15.5],
        ],
      },
    ],
  },
  {
    name: 'Galleon',
    role: 'Heavy freighter',
    mirror: true,
    shapes: [
      {
        kind: HULL,
        at: [
          [0, 0],
          [4, 2],
          [8, 16],
          [14, 28],
          [30, 62],
          [30, 76],
          [24, 84],
          [0, 84],
        ],
        side: [
          [0, 8.5],
          [16, 17],
          [28, 22.5],
          [84, 24],
          [84, 3],
          [18, 3],
          [3, 5.5],
        ],
        rear: [
          [0, 3],
          [14, 3.5],
          [30, 7],
          [30, 14],
          [20, 22.5],
          [0, 24.5],
        ],
      },
      {
        // the spine of cargo hatches, raised
        kind: PART,
        at: box(2, 26, 8, 78),
        side: [
          [26, 21],
          [34, 29.5],
          [78, 29.5],
          [78, 21],
        ],
        rear: [
          [2, 21],
          [8, 19.5],
          [8, 28],
          [2, 29.5],
        ],
      },
      {
        // the hatches over the wings
        kind: PART,
        at: [
          [11, 40],
          [22, 60],
          [22, 78],
          [11, 78],
        ],
        rear: [
          [11, 17],
          [22, 12.5],
          [22, 17.5],
          [11, 23],
        ],
      },
      { kind: ENGINE, at: box(2, 84, 9, 89), rear: octagon(2, 4, 9, 19.5) },
      { kind: ENGINE, at: box(13, 84, 22, 88), rear: octagon(13, 4, 22, 17) },
      {
        kind: GLASS,
        at: [
          [0, 6],
          [4, 8],
          [5, 18],
          [0, 20],
        ],
        side: [
          [6, 14.5],
          [10, 18.5],
          [16, 18.5],
          [20, 16.5],
        ],
        rear: [
          [0, 14.5],
          [5, 15.5],
          [5, 18.5],
          [0, 18.5],
        ],
      },
    ],
  },
]

function within(at: Corner[], x: number, y: number) {
  let hit = false
  for (let n = 0, m = at.length - 1; n < at.length; m = n++) {
    const [x0, y0] = at[n]
    const [x1, y1] = at[m]
    if (y0 > y !== y1 > y && x < ((x1 - x0) * (y - y0)) / (y1 - y0) + x0) hit = !hit
  }
  return hit
}

/** a plan as a small picture: one kind of surface per pixel (0 where there is nothing) */
export function drawPlan(plan: HullPlan): { w: number; h: number; kind: Uint8Array } {
  let half = 0
  let len = 0
  for (const s of plan.shapes) {
    for (const [x, y] of s.at) {
      half = Math.max(half, Math.abs(x))
      len = Math.max(len, y)
    }
  }
  const w = Math.ceil(half) * 2
  const h = Math.ceil(len)
  const kind = new Uint8Array(w * h)
  for (const s of plan.shapes) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const a = x + 0.5 - w / 2
        if (within(s.at, plan.mirror ? Math.abs(a) : a, y + 0.5)) kind[y * w + x] = s.kind
      }
    }
  }
  return { w, h, kind }
}

/**
 * A plan in flat colour, with the light from the upper left picked out along its edges: an
 * edge facing the light is a tone lighter, one facing away a tone darker.
 */
export function paintPlan(plan: HullPlan, colours: Record<number, number[]>): Canvas {
  const { w, h, kind } = drawPlan(plan)
  const c = createCanvas(w + 2, h + 2)
  // (from above, a nozzle is one with the part it is on)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : kind[y * w + x] === ENGINE ? PART : kind[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = at(x, y)
      if (!k) continue
      const lit = at(x - 1, y) !== k || at(x, y - 1) !== k
      const dim = at(x + 1, y) !== k || at(x, y + 1) !== k
      c.px[(y + 1) * c.w + x + 1] = colours[k][lit && !dim ? 2 : dim && !lit ? 0 : 1]
    }
  }
  return c
}

/** a part's height (lowest, highest) when it gives no outline from the side or behind */
const USUAL: Record<number, [number, number]> = { [HULL]: [3, 12.5], [PART]: [3, 11], [GLASS]: [11, 17], [ENGINE]: [4, 12.5] }

/** a plan as a solid: one kind of surface per cell (0 empty), `kind[(z * l + k) * w + i]`, z up from the belly, k from the nose */
export interface PlanSolid {
  w: number
  l: number
  h: number
  kind: Uint8Array
}

/** the plan as a solid: each part is what its outlines from above, the side and behind all allow (a later part over an earlier) */
export function solidOf(plan: HullPlan): PlanSolid {
  const { w, h: l } = drawPlan(plan)
  let h = 0
  for (const s of plan.shapes) {
    for (const [, y] of [...(s.side ?? []), ...(s.rear ?? [])]) h = Math.max(h, y)
    if (!s.side && !s.rear) h = Math.max(h, USUAL[s.kind][1])
  }
  h = Math.ceil(h)
  const kind = new Uint8Array(w * l * h)
  for (const s of plan.shapes) {
    const [lo, hi] = s.side || s.rear ? [0, h] : USUAL[s.kind]
    for (let k = 0; k < l; k++) {
      for (let i = 0; i < w; i++) {
        const a = i + 0.5 - w / 2
        const across = plan.mirror ? Math.abs(a) : a
        if (!within(s.at, across, k + 0.5)) continue
        for (let z = 0; z < h; z++) {
          const up = z + 0.5
          if (up < lo || up > hi) continue
          if (s.side && !within(s.side, k + 0.5, up)) continue
          if (s.rear && !within(s.rear, across, up)) continue
          kind[(z * l + k) * w + i] = s.kind
        }
      }
    }
  }
  return { w, l, h, kind }
}

/** a solid seen from one side, flat: per pixel the kind of the nearest cell and how deep it is (0 nearest) */
export interface PlanView {
  w: number
  h: number
  kind: Uint8Array
  depth: Uint8Array
}

/**
 * The solid seen from the left side (the nose to the left, its top up) or from behind (its right side on the right, its
 * top up), as the side and rear guides show it.
 */
export function viewOf(solid: PlanSolid, from: 'side' | 'rear'): PlanView {
  const { w, l, h, kind } = solid
  const vw = from === 'side' ? l : w
  const view = { w: vw, h, kind: new Uint8Array(vw * h), depth: new Uint8Array(vw * h) }
  const reach = from === 'side' ? w : l
  for (let z = 0; z < h; z++) {
    for (let x = 0; x < vw; x++) {
      for (let d = 0; d < reach; d++) {
        const cell = from === 'side' ? (z * l + x) * w + d : (z * l + (l - 1 - d)) * w + x
        if (!kind[cell]) continue
        const o = (h - 1 - z) * vw + x
        view.kind[o] = kind[cell]
        view.depth[o] = d
        break
      }
    }
  }
  return view
}

/**
 * A view in flat colour, as paintPlan paints a plan: the light from the upper left along each part's edges, the
 * deeper a surface the darker, and a nozzle seen end on bright in the middle within a dark rim.
 */
export function paintView(view: PlanView, colours: Record<number, number[]>, deep: number): Canvas {
  const { w, h, kind, depth } = view
  const c = createCanvas(w + 2, h + 2)
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : kind[y * w + x])
  const dz = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 255 : depth[y * w + x])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = at(x, y)
      if (!k) continue
      const d = dz(x, y)
      // an edge is where the kind changes or the surface steps back
      const lit = at(x - 1, y) !== k || at(x, y - 1) !== k || dz(x, y - 1) > d + 1 || dz(x - 1, y) > d + 1
      const dim = at(x + 1, y) !== k || at(x, y + 1) !== k || dz(x, y + 1) > d + 1 || dz(x + 1, y) > d + 1
      const ramp = colours[k]
      let col = ramp[lit && !dim ? 2 : dim && !lit ? 0 : 1]
      if (k === ENGINE && colours[ENGINE].length > 3) col = lit || dim ? ramp[3] : ramp[4]
      const shade = 1 - Math.min(0.45, (d / Math.max(1, deep)) * 0.45)
      const r = (col & 255) * shade
      const g = ((col >> 8) & 255) * shade
      const b = ((col >> 16) & 255) * shade
      c.px[(y + 1) * c.w + x + 1] = (255 << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)
    }
  }
  return c
}
