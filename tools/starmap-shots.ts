// Draws the maps (src/lib/maps/starmap.ts) from a few cameras into one sheet, to look at:
//
//   npx jiti tools/starmap-shots.ts [out.png] [system] [scale]
//
// The galaxy from its usual camera, low and turned, and from overhead; a system whole, tilted, and close in on a world
// and on its sun (its worlds' maps built here, as the page's worker builds them).

import fs from 'node:fs'
import zlib from 'node:zlib'
import { galaxyDanger, theGalaxy } from '../src/lib/engine/index'
import { drawMap, fitCamera, GALAXY_FIT, placeOf, SYSTEM_FIT, systemUnit } from '../src/lib/maps/starmap'
import type { MapCamera, MapScene, MarkName, Sprite } from '../src/lib/maps/starmap'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'docs/art/gen/starmap.png'
const system = Number(process.argv[3] ?? 0)
const scale = Number(process.argv[4] ?? 2)
const W = 480
const H = 270
const NOW = 1_800_000_000

/** a PNG of 8-bit RGBA, not interlaced (the marks), as pixels */
function readPNG(file: string): Sprite {
  const buf = fs.readFileSync(file)
  let p = 8
  let w = 0
  let h = 0
  const idat: Buffer[] = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
    } else if (type === 'IDAT') idat.push(data)
    p += 12 + len
  }
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const px = new Uint8Array(w * h * 4)
  const row = w * 4
  for (let y = 0; y < h; y++) {
    const f = raw[y * (row + 1)]
    for (let x = 0; x < row; x++) {
      const v = raw[y * (row + 1) + 1 + x]
      const a = x >= 4 ? px[y * row + x - 4] : 0
      const b = y ? px[(y - 1) * row + x] : 0
      const c = x >= 4 && y ? px[(y - 1) * row + x - 4] : 0
      const pa = Math.abs(b - c)
      const pb = Math.abs(a - c)
      const pc = Math.abs(a + b - 2 * c)
      const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      px[y * row + x] = (v + pred) & 255
    }
  }
  return { w, h, px: new Uint32Array(px.buffer) }
}

const sprites: Partial<Record<MarkName, Sprite>> = {}
for (const n of ['station', 'gate', 'raiders', 'hotspot', 'derelict'] as MarkName[]) sprites[n] = readPNG(`static/ui/mark-${n}.png`)

const g = theGalaxy()
const dangers = galaxyDanger('nomarchy', {})
const sceneOf = (kind: 'galaxy' | 'system', picked: string | null = null): MapScene => ({
  g,
  kind,
  system,
  here: system,
  now: NOW,
  t: 1200,
  side: 'nomarchy',
  colours: { nomarchy: '#f2c14e', anarchoi: '#5ad1e6' },
  holderOf: (id) => (Number(id.slice(1)) % 3 === 0 ? 'nomarchy' : Number(id.slice(1)) % 3 === 1 ? 'anarchoi' : null),
  nameOf: (b) => b.name,
  danger: dangers.map((d) => d.level),
  front: dangers.map((d) => d.contested),
  bounty: g.systems.map((s) => (s.index === 4 ? 'VEX 900' : '')),
  hotspots: new Set([g.worlds[g.systems[system].worlds[0]]?.id ?? '']),
  raiders: new Set(g.systems[system].bodies.filter((i) => g.bodies[i].kind === 'gate').slice(0, 1)),
  route: [system, ...g.lanes.filter((l) => l.a === system || l.b === system).slice(0, 1).map((l) => (l.a === system ? l.b : l.a))],
  course: g.systems[system].bodies.find((i) => g.bodies[i].kind === 'planet') ?? -1,
  pilot: { x: 20000, y: 30000, heading: 0.8 },
  picked,
  hover: null,
  motion: true,
  text: 1,
})

const firstWorld = g.systems[system].bodies.find((i) => g.bodies[i].kind === 'planet')!
const giant = g.systems[system].bodies.find((i) => g.bodies[i].kind === 'giant')
const shots: [MapScene, MapCamera][] = [
  [sceneOf('galaxy', `s${system}`), fitCamera(0, 0, GALAXY_FIT, W, H)],
  [sceneOf('galaxy'), { ...fitCamera(0, 0, 420, W, H, 0.42, 0.7) }],
  [sceneOf('galaxy'), fitCamera(0, 0, GALAXY_FIT, W, H, Math.PI / 2)],
  [sceneOf('system', `b${firstWorld}`), fitCamera(0, 0, SYSTEM_FIT, W, H)],
  [sceneOf('system'), fitCamera(0, 0, SYSTEM_FIT * 0.8, W, H, 0.38, -0.6)],
]
for (const key of [`b${firstWorld}`, giant !== undefined ? `b${giant}` : null]) {
  if (!key) continue
  const p = placeOf(g, 'system', system, key, NOW)!
  shots.push([sceneOf('system', key), { ...fitCamera(p.x, p.y, p.size * 3.2, W, H, 0.7, 0.3) }])
}
const sun = g.systems[system].bodies.find((i) => g.bodies[i].kind === 'sun')
if (sun !== undefined) shots.push([sceneOf('system'), fitCamera(0, 0, g.bodies[sun].size * systemUnit(g, system) * 3, W, H, 0.6)])

const cols = 2
const rows = Math.ceil(shots.length / cols)
const sheet = new Uint32Array(W * cols * H * rows)
shots.forEach(([s, cam], i) => {
  const fb = new Uint32Array(W * H)
  const marks = drawMap({ w: W, h: H, fb }, cam, s, sprites)
  console.log(`${s.kind} ${i}: ${marks.length} marks, dist ${cam.dist.toFixed(0)}`)
  const ox = (i % cols) * W
  const oy = Math.floor(i / cols) * H
  for (let y = 0; y < H; y++) sheet.set(fb.subarray(y * W, y * W + W), (oy + y) * W * cols + ox)
})
writePNG(out, W * cols * scale, H * rows * scale, upscale(W * cols, H * rows, new Uint8Array(sheet.buffer), scale))
console.log(out)
