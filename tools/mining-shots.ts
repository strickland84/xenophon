// Close-ups of mining as the game draws it, to judge the beam, the brackets, the bar and the pops: the ship's laser
// on an outcrop overhead, from behind and from the seat, the hand cutter on a vein, and a rock in a belt.
//
//   npx jiti tools/mining-shots.ts out.png [w h] [scale] [params as JSON, e.g. '{"hudScale":2}']
//
// Each row is one place, at moments through a cut; the whole frame at the page's size, each pixel drawn `scale` times.
import { createScene, DEFAULT_PARAMS, STEP, theGalaxy, worldSettings } from '../src/lib/engine/index'
import { upscale, writePNG } from './png.mjs'

const out = process.argv[2] ?? 'mining.png'
const W = Number(process.argv[3] ?? 456)
const H = Number(process.argv[4] ?? 256)
const scale = Number(process.argv[5] ?? 2)
const extra = JSON.parse(process.argv[6] ?? '{}')
const CLOCK = 1_800_000_000
const held = (turn: number, climb: number, land = false) => ({ turn, climb, boost: 0, fire: false, secondary: false, land })

type Scene = ReturnType<typeof createScene> & Record<string, any>
const shots: Uint8ClampedArray[] = []
const shoot = (s: Scene) => shots.push(s.render().slice())

/** over the nearest outcrop, the throttle shut, the laser on; shots at `at` frames after it starts, in view `view` (0, 1, 2) */
function outcrop(view: number, at: number[], world = worldSettings(theGalaxy().worlds.find((w) => w.recipe.archetype === 'archipelago')!.id)) {
  const s = createScene({ ...DEFAULT_PARAMS, ...world, side: 'nomarchy', intro: false, skirmish: false, locals: false, ...extra } as never) as Scene
  s.resize(W, H)
  s.setClock(CLOCK)
  let start = -1
  for (let n = 0; n < 2400 && at.length; n++) {
    const ore = s.loop.ore
    if (n < 70) s.setControls(held(0, 0, n > 10))
    else if (ore && start < 0) {
      const p = s.player
      const d = Math.hypot(ore.x - p.x, ore.y - p.y)
      let off = Math.atan2(ore.x - p.x, -(ore.y - p.y)) - p.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      s.setControls(held(Math.max(-1, Math.min(1, off * 2.5)), d < 160 && p.height - ore.z > 40 ? 1 : 0))
      if (d < 30) {
        start = n
        s.setThrottle(0)
        for (let v = 0; v < view; v++) s.act('view')
      }
    } else if (ore) s.setControls(held(0, s.player.height - ore.z > 34 ? 1 : 0, true))
    s.step(STEP)
    if (start >= 0 && n - start === at[0]) {
      shoot(s)
      at.shift()
    }
  }
  while (at.length) {
    shoot(s)
    at.shift()
  }
}

/** out of the ship at the capital and over to the nearest vein, cutting it */
function vein(at: number[]) {
  const s = createScene({ ...DEFAULT_PARAMS, ...worldSettings('w0'), side: 'nomarchy', intro: false, skirmish: false, locals: false, ...extra } as never) as Scene
  s.resize(W, H)
  s.setClock(CLOCK)
  let start = -1
  let target = { x: 0, y: 0 }
  for (let n = 0; n < 3000 && at.length; n++) {
    const foot = s.foot
    if (n === 0) target = { x: foot.vein!.x, y: foot.vein!.y }
    if (n === 20) s.act('use')
    if (foot.stage === 'walking') {
      if (s.zoom !== 1 && s.screen?.w !== Math.round(W / s.zoom)) s.resize(Math.round(W / s.zoom), Math.round(H / s.zoom))
      const p = s.player
      const dx = target.x - p.x
      const dy = target.y - p.y
      const d = Math.hypot(dx, dy)
      const c = Math.cos(foot.yaw)
      const sn = Math.sin(foot.yaw)
      if (foot.prompt === 'mine' || d < 2) {
        if (start < 0) start = n
        s.setControls(held(0, 0, true))
      } else s.setControls({ ...held((dx * c - dy * sn) / d, -(dx * sn + dy * c) / d), boost: 1 })
    }
    s.step(STEP)
    if (start >= 0 && n - start === at[0]) {
      shoot(s)
      at.shift()
    }
  }
}

/** in a belt, out to the nearest rock with ore, cutting it from behind */
function rock(at: number[]) {
  const s = createScene({ ...DEFAULT_PARAMS, ...worldSettings('s1'), side: '', intro: false, skirmish: false, locals: false, ...extra } as never) as Scene
  s.resize(W, H)
  s.setClock(CLOCK)
  const belt = s.bodies().find((b: { kind: string }) => b.kind === 'belt')
  const r = Math.hypot(belt.x, belt.y)
  s.placePlayer(belt.x - (belt.x / r) * 40, belt.y - (belt.y / r) * 40, Math.atan2(-belt.y, belt.x))
  let start = -1
  for (let n = 0; n < 2000 && at.length; n++) {
    if (n === 1) s.act('view')
    const ore = s.loop.ore
    const p = s.player
    if (ore && start < 0) {
      const d = Math.hypot(ore.x - p.x, ore.y - p.y)
      let off = Math.atan2(ore.x - p.x, -(ore.y - p.y)) - p.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      s.setControls(held(Math.max(-1, Math.min(1, off * 2.5)), 0))
      if (d < 90) {
        start = n
        s.setThrottle(0)
      }
    } else s.setControls(held(ore ? 0 : 0.2, 0, !!ore))
    s.step(STEP)
    if (start >= 0 && n - start === at[0]) {
      shoot(s)
      at.shift()
    }
  }
}

const canyon = worldSettings(theGalaxy().worlds.find((w) => w.recipe.archetype === 'canyon')!.id)
outcrop(0, [8, 40, 75, 120])
outcrop(1, [8, 40, 75, 120])
outcrop(2, [40, 120, 200, 260])
vein([10, 40, 70, 100])
outcrop(1, [20, 60, 90, 130], canyon)
rock([20, 60, 100, 160])

// the frames are not all the same size (on foot the art pixels are larger): each is set in a cell of the largest
const cols = 4
const rows = Math.ceil(shots.length / cols)
const px = new Uint8Array(cols * W * rows * H * 4)
shots.forEach((f, n) => {
  const w = Math.round(Math.sqrt(f.length / 4 / (W / H)) * (W / H))
  const h = f.length / 4 / w
  const ox = (n % cols) * W
  const oy = Math.floor(n / cols) * H
  for (let y = 0; y < Math.min(h, H); y++) px.set(f.subarray(y * w * 4, y * w * 4 + Math.min(w, W) * 4), ((oy + y) * cols * W + ox) * 4)
})
writePNG(out, cols * W * scale, rows * H * scale, upscale(cols * W, rows * H, px, scale))
console.log(out)
