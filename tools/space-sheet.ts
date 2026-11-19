// Draws a sheet of space's bodies as the game draws them, each in a frame of its own, to look at
// and to judge the art by (docs/art/gen/space.png is one):
//
//   npx jiti tools/space-sheet.ts [out.png] [scale]
//
// A world seen from space, a sun's edge, a gas giant, a black hole, an asteroid belt (with ore),
// a station with a ship docked, a jump gate, a barren moon and a derelict: each found in its
// system by kind, the player's ship put beside it, the scene stepped a moment, and drawn.

import { createScene, DEFAULT_PARAMS, STEP } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'docs/art/gen/space.png'
const scale = Number(process.argv[3] ?? 2)
const W = 456
const H = 256
const CLOCK = 1_800_000_000

/** where to look: the system, the kind of body (its nth), how far from its middle (in its sizes) and which way the ship heads */
const SHOTS: { system: number; kind: string; nth?: number; off: [number, number]; heading: number; dock?: boolean; name?: string }[] = [
  { system: 0, kind: 'planet', off: [0.55, -0.2], heading: 0.4 },
  { system: 0, kind: 'sun', off: [1.32, 0.1], heading: -0.3 },
  { system: 2, kind: 'giant', off: [0.95, 0.35], heading: 0.2 },
  { system: 1, kind: 'black hole', off: [1.05, 0.35], heading: -2.4 },
  { system: 1, kind: 'belt', off: [0, 0], heading: 1.2 },
  { system: 0, kind: 'base', off: [0, 0], heading: 0, dock: true },
  { system: 1, kind: 'gate', off: [0.1, 0.9], heading: 0.3 },
  { system: 2, kind: 'moon', off: [0.7, 0.45], heading: 2.2 },
  { system: 3, kind: 'base', name: 'The Qutois Hulk', off: [1.4, 0.6], heading: -1 },
]

const frames: Uint8ClampedArray[] = []
for (const s of SHOTS) {
  const scene = createScene({ ...DEFAULT_PARAMS, world: `s${s.system}`, intro: false, skirmish: false, side: s.dock ? 'nomarchy' : '' } as never)
  scene.resize(W, H)
  scene.setClock(CLOCK)
  const bodies = scene.bodies().filter((b) => b.kind === s.kind && (!s.name || b.name === s.name))
  const b = bodies[s.nth ?? 0]
  if (!s.dock) {
    if (s.kind === 'belt') {
      const r = Math.hypot(b.x, b.y)
      scene.placePlayer(b.x * (1 - 40 / r), b.y * (1 - 40 / r), s.heading)
    } else scene.placePlayer(b.x + b.size * s.off[0], b.y + b.size * s.off[1], s.heading)
  }
  for (let i = 0; i < 50; i++) {
    scene.setControls({ turn: 0.15, climb: 0, boost: 0, fire: false, secondary: false })
    scene.step(STEP)
  }
  frames.push(scene.render().slice())
  console.log(s.kind, b.name)
}

const cols = 3
const rows = Math.ceil(frames.length / cols)
const gap = 2
const SW = W * cols + gap * (cols - 1)
const SH = H * rows + gap * (rows - 1)
const sheet = new Uint8Array(SW * SH * 4)
for (let i = 0; i < sheet.length; i += 4) sheet[i + 3] = 255
frames.forEach((f, i) => {
  const ox = (i % cols) * (W + gap)
  const oy = Math.floor(i / cols) * (H + gap)
  for (let y = 0; y < H; y++) sheet.set(f.subarray(y * W * 4, (y + 1) * W * 4), ((oy + y) * SW + ox) * 4)
})
writePNG(out, SW * scale, SH * scale, upscale(SW, SH, sheet, scale))
console.log(`${out}: ${frames.length} frames`)
