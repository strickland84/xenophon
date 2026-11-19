// The way down to a world and up out of one, drawn (sim/air.ts says what the air makes of the world
// at each share of the way). The world is its globe (render/globe.ts), turned to bring the place
// under the ship beneath it, flattening, its map drawn ever finer round that place; round it the
// black of space thickens into a sky of the world's colour as the ship sinks into its air (from
// behind and from the seat; from overhead the air is a haze over the ground), the stars going out.
// Low down, the globe gives way pixel by pixel to the ground itself (render/world.ts), drawn at
// the same place and scale. Over the ship, the air burns: a hot glow round it, flames streaming
// back, the frame's edges afire, the picture shaking (sim/air.ts). A moon has no air: none of that,
// a black sky all the way down.

import { AIR, SPACE_Z } from '../data/space'
import { ceilingOf } from '../params'
import type { Jet } from '../jet/jet'
import { FLASH_TIME } from '../sim/space'
import { theGalaxy } from '../galaxy/galaxy'
import type { SceneState } from '../state'
import { BAYER, blend, pack } from '../util/color'
import { clamp, hash8 } from '../util/math'
import { airShape, latOf, normalOfMap, smooth, times, turned, turnUp } from '../sim/air'
import { bodiesOf, orbitTime } from '../sim/space'
import type { SpaceBody } from '../sim/space'
import { heightIn, inAir, overheadOf, spinOf, turnedOn, turnOf } from '../sim/travel'
import { airOf } from '../space/maps'
import { createFrame } from './frame'
import type { Frame } from './frame'
import { castGlobe, drawGlobeTop } from './globe'
import type { Cam, Globe } from './globe'
import { BLACK, drawBackdrop, DUSK, perspectiveOf, sphereMapOf, worldTurn } from './space'
import { SUN } from '../sim/daylight'
import { NSKY } from './palettes'
import { LIFT_FROM, pr, project } from './view'
import { deckDrift, skyNow } from './clouds'
import { deckTop } from '../world/sky'
import { equatorOf } from '../world/world'
import { WORLD } from '../world/lands'

/** how far the ground's clouds are drawn from the ground under them, from overhead (world px) */
const cloudLean = { x: 0, y: 0 }

/** how hazed the ground is from straight over it at this height, as the ground itself is drawn from overhead (render/world.ts), 0..1, `k` of it */
function groundFog(scene: SceneState, k: number) {
  const A = scene.travel.high
  return clamp(((A - LIFT_FROM) / 3000) * 10, 0, 4) * 0.1 * k * (1 - perspectiveOf(scene.view))
}

/** from behind and the seat, the ground's own haze by distance (render/world.ts): where it begins and where the ground ends in it, as shares of the height, and `k` of it */
function farFog(scene: SceneState, k: number) {
  const A = scene.travel.high
  const from = 300 + 2 * A
  const to = 1500 + 3 * A + 2 * Math.max(0, A - LIFT_FROM)
  return { from: from / A, to: to / A, k: k * perspectiveOf(scene.view) }
}

/** on the surface side of the way: the share of the frame the air's globe still takes (it gives way to the ground itself by the ceiling) */
export function airOver(scene: SceneState) {
  if (!inAir(scene) || scene.zone.kind !== 'surface') return 0
  return 1 - smooth(AIR.ground - AIR.blend, AIR.ground, scene.travel.e)
}

/** the world being gone down to or climbed out of, where it stands now (in whichever zone the scene is) */
function worldHere(scene: SceneState): SpaceBody {
  const tr = scene.travel
  const here = scene.space.bodies.find((b) => b.body.index === tr.from)
  if (here) return here
  const g = theGalaxy()
  return bodiesOf(g.bodies[tr.from].system, orbitTime(scene)).find((b) => b.body.index === tr.from)!
}

/** the world as the air has it now: the globe, and how it is drawn from overhead */
export function airGlobe(scene: SceneState) {
  const tr = scene.travel
  const w = worldHere(scene)
  const b = w.body
  const spin = spinOf(scene, b)
  const ns = normalOfMap(spin, tr.u, tr.v)
  // (the globe as it has been turned on for this pilot: sim/travel.ts turnedOn)
  const own = turnedOn(scene, b)
  const shape = airShape(b, tr.v, heightIn(scene, b, turned(own, ns).z), tr.high, overheadOf(b), tr.e, tr.rate)
  // (the world's own frame is turned to its sun; and the globe turns again to bring the place under the ship beneath it)
  const base = times(worldTurn(turnOf(scene, w)), own)
  const up = turnUp(turned(base, ns), shape.turn)
  const q = times(up, base)
  // (the place's latitude and longitude on the globe, for east and north there)
  const phi = latOf(tr.v)
  const lam = (tr.u - spin) * Math.PI * 2
  // (the place under the ship, turned: straight below it once the globe has turned)
  const tx = q[0] * ns.x + q[1] * ns.y + q[2] * ns.z
  const ty = q[3] * ns.x + q[4] * ns.y + q[5] * ns.z
  const tz = q[6] * ns.x + q[7] * ns.y + q[8] * ns.z
  const j = scene.jets[0]
  const drift = deckDrift(scene)
  const sky = skyNow(scene)
  // (from overhead a cloud is drawn up the frame from the ground under it by its height, as everything that stands is: by
  // the ceiling the air's flat ground shows each cloud there too)
  const lean = (((sky.base + deckTop(sky)) / 2) * shape.haze * (1 - perspectiveOf(scene.view))) / Math.max(0.3, scene.view.tan)
  cloudLean.x = -scene.view.sin * lean
  cloudLean.y = -scene.view.cos * lean
  // (the light is the world's own, in its own frame: the place under the ship is lit on its globe as its ground is, by day
  // or at night, all the way down)
  // (the sun's light into the globe's own frame, back through the turn it has been given: Pᵀ · SUN)
  const l = {
    x: own[0] * SUN.x + own[3] * SUN.y + own[6] * SUN.z,
    y: own[1] * SUN.x + own[4] * SUN.y + own[7] * SUN.z,
    z: own[2] * SUN.x + own[5] * SUN.y + own[8] * SUN.z,
  }
  const g: Globe = {
    map: sphereMapOf(b),
    x: j.x - tx * shape.rc,
    y: j.y - ty * shape.rc,
    z: j.z - shape.alt - tz * shape.rc,
    r: shape.rc,
    q,
    spin,
    // (its clouds where the ground's own have drifted to, so they are the same clouds all the way down)
    cloudSpin: -drift[0] / WORLD,
    cloudDown: -drift[1] / WORLD,
    us: tr.u,
    vs: tr.v,
    // (from overhead the map grows at its own pace: drawAir sets it so)
    zoom: shape.zoom,
    ew: shape.cosLat,
    // (laid out flat round the place under the ship, soon after the way down begins: east and north there)
    local: shape.local,
    sx: ns.x,
    sy: ns.y,
    sz: ns.z,
    ex: Math.cos(lam),
    ey: 0,
    ez: -Math.sin(lam),
    nx: -Math.sin(phi) * Math.sin(lam),
    ny: Math.cos(phi),
    nz: -Math.sin(phi) * Math.cos(lam),
    lx: l.x,
    ly: l.y,
    lz: l.z,
    flat: 0,
    air: shape.air,
    dusk: DUSK,
    // (over the world itself: its own ground, a pixel to each of its px, in its own colours and under its own haze, its own
    // clouds where they have drifted to: by the ceiling it is the ground as the ground itself is drawn from there)
    ground:
      scene.zone.kind === 'surface'
        ? {
            mat: scene.world.mat,
            height: scene.world.height,
            clouds: scene.world.clouds,
            lit: scene.pal.topLit,
            shade: scene.pal.topShade,
            cloud: scene.pal.cloudTop,
            rank: sky.step > 0 ? Math.round(clamp(scene.params.clouds, 0, 1) * 16) : 0,
            driftX: drift[0] + cloudLean.x,
            driftY: drift[1] + cloudLean.y,
            shadowX: -scene.pal.sunX * sky.base + cloudLean.x,
            shadowY: -scene.pal.sunY * sky.base + cloudLean.y,
            relief: 1 - 0.75 * shape.haze,
            row0: Math.round(equatorOf(scene.world)) - scene.world.size / 2 + scene.world.size,
            size: scene.world.size,
            version: scene.world.lands?.version ?? 0,
            haze: scene.pal.haze,
            fog: groundFog(scene, shape.haze),
            far: farFog(scene, shape.haze),
          }
        : null,
  }
  return { g, shape, tx, ty }
}

/** the sky's colours, from the horizon up (NSKY of them): the world's own on its surface, else made from the colour of its air */
const skyRamp = new Uint32Array(NSKY)
function skyOf(scene: SceneState, id: string) {
  const air = airOf(id) ?? [0, 0, 0]
  const surfaceK = scene.zone.kind === 'surface' ? smooth(AIR.switchUp, AIR.ground - AIR.blend, scene.travel.e) : 0
  for (let i = 0; i < NSKY; i++) {
    const t = i / (NSKY - 1)
    // (bright at the horizon, deepening upwards)
    const k = 1 - t * 0.72
    let col = pack(air[0] * k * 0.92, air[1] * k * 0.95, air[2] * k)
    if (surfaceK > 0) col = blend(col, scene.pal.sky[i], Math.round(surfaceK * 255))
    skyRamp[i] = col
  }
  return skyRamp
}

/** acos over −1..1, looked up */
const ACOS_N = 2048
const ACOS = new Float32Array(ACOS_N + 1)
for (let i = 0; i <= ACOS_N; i++) ACOS[i] = Math.acos((i / ACOS_N) * 2 - 1)

/** pixels between the rays the sky is worked out for exactly, and their angles over the horizon along a row (eight: the loop divides by it with a shift) */
const SKY_SPAN = 8
let thetas = new Float32Array(128)

/** the sky of the air, through the camera: by how high a ray looks over the world's curved horizon, blended over space as far as the air has thickened (below the horizon the globe will cover it) */
function drawAirSky(f: Frame, c: Cam, g: Globe, ramp: Uint32Array, k: number) {
  if (k <= 0.01) return
  const { w: W, fb } = f
  const lx = g.x - c.ox
  const ly = g.y - c.oy
  const lz = g.z - c.oz
  const dist = Math.sqrt(lx * lx + ly * ly + lz * lz)
  // (the horizon's angle from straight down, from up here)
  const thetaH = Math.asin(clamp(g.r / dist, -1, 1))
  // (straight down to the world's middle, from the camera: polish step 9 found it the other way, up from the middle, so the
  // sky was drawn below the horizon, under the globe, and above it only a thin bright band ending in a hard edge)
  const ux = lx / dist
  const uy = ly / dist
  const uz = lz / dist
  // how high a ray looks over the horizon (the angle from straight down to the world's middle): it changes
  // smoothly along a row, so it is worked out every SKY_SPAN pixels and carried between
  const x0 = f.colLo
  const last = f.colHi - 1
  const n = Math.ceil((last - x0) / SKY_SPAN)
  if (thetas.length < n + 2) thetas = new Float32Array(n + 2)
  for (let y = f.rowLo; y < f.rowHi; y++) {
    const up = c.hy - (y + 0.5)
    const by4 = (y & 3) << 2
    const across0 = x0 + 0.5 - c.cx
    const dx0 = c.fx * c.focal + c.ux * up + c.rx * across0
    const dy0 = c.fy * c.focal + c.uy * up + c.ry * across0
    const dz = c.fz * c.focal + c.uz * up
    let most = -9
    for (let i = 0; i <= n; i++) {
      const k = Math.min(last, x0 + i * SKY_SPAN) - x0
      const dx = dx0 + c.rx * k
      const dy = dy0 + c.ry * k
      const cos = (dx * ux + dy * uy + dz * uz) / Math.sqrt(dx * dx + dy * dy + dz * dz)
      const th = ACOS[(((cos < -1 ? -1 : cos > 1 ? 1 : cos) + 1) * (ACOS_N / 2)) | 0]
      thetas[i] = th
      if (th > most) most = th
    }
    // (a row wholly under the horizon has no sky: the globe covers it)
    if (most < thetaH - 0.0301) continue
    // a span at a time: one wholly under the horizon is passed over
    const under = thetaH - 0.0301
    for (let i = 0; x0 + i * SKY_SPAN <= last; i++) {
      const xa = x0 + i * SKY_SPAN
      const xb = Math.min(last, xa + SKY_SPAN)
      const t0 = thetas[i]
      const dt = xb > xa ? thetas[i + 1] - t0 : 0
      if (t0 < under && t0 + dt < under) continue
      const xe = Math.min(last, xa + SKY_SPAN - 1)
      for (let x = xa, o = y * W + xa; x <= xe; x++, o++) {
        const theta = xb > xa ? t0 + (dt * (x - xa)) / (xb - xa) : t0
        if (theta < thetaH - 0.03) continue
        let s = (theta - thetaH + 0.02) / 0.75
        s = s < 0 ? 0 : s > 1 ? 1 : s
        const band = s * (NSKY - 1)
        let bi = band | 0
        const edge = (band - bi - 0.7) * 3.4
        const b4 = by4 | (x & 3)
        if (edge > 0 && edge * 16 > BAYER[b4]) bi++
        if (bi >= NSKY) bi = NSKY - 1
        const kk = k * (1 - s * 0.35)
        if (kk >= 0.98 || kk * 16 > BAYER[b4]) fb[o] = kk >= 0.98 ? ramp[bi] : blend(fb[o], ramp[bi], Math.round(kk * 255))
      }
    }
  }
}

/** the world as the air has it, from overhead: a disc round the place under the ship, growing and flattening */
export function drawAirTop(scene: SceneState, f: Frame) {
  const view = scene.view
  const { g, shape } = airGlobe(scene)
  const j = scene.jets[0]
  // (the place under the ship: under the ship on the frame out in space; by the ceiling, where the ground under a ship
  // that high is drawn, down the frame from it, as the ground itself is from overhead: the two are then one picture)
  if (!project(view, j.x, j.y, j.z - scene.travel.high * smooth(0.3, 1, shape.t))) return
  const rho = shape.sigma * shape.rc
  const q = g.q
  // (from overhead the ground grows at its own pace)
  g.zoom = shape.zoomTop
  // (the disc's middle: the place under the ship is under the ship on the frame)
  const ns = normalOfMap(g.spin, g.us, g.vs)
  const wx = q[0] * ns.x + q[1] * ns.y + q[2] * ns.z
  const wy = q[3] * ns.x + q[4] * ns.y + q[5] * ns.z
  const cx = pr.x - rho * (wx * view.cos - wy * view.sin)
  const cy = pr.y - rho * (wx * view.sin + wy * view.cos)
  drawGlobeTop(f, g, cx, cy, rho, view.cos, view.sin)
}

/** the world as the air has it, in perspective: the air's sky over space above its horizon, and the globe under it */
export function drawAirCast(scene: SceneState, f: Frame, cam: Cam) {
  const { g, shape } = airGlobe(scene)
  const id = theGalaxy().worlds[theGalaxy().bodies[scene.travel.from].world]?.id ?? ''
  drawAirSky(f, cam, g, skyOf(scene, id), shape.air)
  castGlobe(f, g, cam)
}

/** a frame to draw one picture aside in, the same size as the frame */
let asideFrame: Frame | null = null
function aside(f: Frame) {
  if (!asideFrame || asideFrame.w !== f.w || asideFrame.h !== f.h) asideFrame = createFrame(f.w, f.h)
  asideFrame.colLo = f.colLo
  asideFrame.colHi = f.colHi
  asideFrame.rowLo = f.rowLo
  asideFrame.rowHi = f.rowHi
  return asideFrame
}

/** the picture aside laid over the frame where the dither says, `k` of it */
function mix(f: Frame, g: Frame, k: number) {
  const lim = k * 16
  for (let y = f.rowLo; y < f.rowHi; y++) {
    let o = y * f.w + f.colLo
    const by4 = (y & 3) << 2
    for (let x = f.colLo; x < f.colHi; x++, o++)
      if (BAYER[by4 | (x & 3)] < lim) {
        f.fb[o] = g.fb[o]
        f.zbuf[o] = g.zbuf[o]
      }
  }
}

/** on the surface side of the way, high up: space and the air's globe over the ground drawn already (all of it, until low down) */
export function drawAirOver(scene: SceneState, f: Frame) {
  const share = airOver(scene)
  const g = share >= 1 ? f : aside(f)
  for (let y = f.rowLo; y < f.rowHi; y++) {
    g.fb.fill(BLACK, y * f.w + f.colLo, y * f.w + f.colHi)
    g.zbuf.fill(1e9, y * f.w + f.colLo, y * f.w + f.colHi)
  }
  drawBackdrop(scene, g)
  if (g !== f) mix(f, g, share)
}

// ── over the ship: the fire of the air

const FIRE = [pack(255, 244, 196), pack(255, 196, 90), pack(255, 128, 44), pack(214, 60, 24)]

/** the air burning round the ship, behind it: a hot glow before it and flames streaming back (drawn under the ships) */
export function drawAirGlow(scene: SceneState, f: Frame) {
  // other pilots on their way down or up through this zone's air: seen burning as they go (the polish pass, item 5)
  const space = scene.zone.kind === 'space'
  const top = ceilingOf(scene.params)
  for (const s of scene.ships) {
    const z = s.jet.z
    const k = space ? clamp((SPACE_Z - 40 - z) / 300, 0, 1) : clamp((z - top - 80) / 600, 0, 1) * clamp((top + 2600 - z) / 800, 0, 1)
    if (k > 0.05 && !s.jet.away) fireOn(scene, f, s.jet, k * 0.8, space ? 1 : 1)
  }
  if (!inAir(scene)) return
  const { shape } = airGlobe(scene)
  if (shape.fire > 0.02) fireOn(scene, f, scene.jets[0], shape.fire, scene.travel.dir)
}

/** fire round a ship going down through the air (`down` +1) or up (−1): a hot glow before it and flames streaming back, `k` 0..1 how fierce */
function fireOn(scene: SceneState, f: Frame, j: Jet, k: number, down: number) {
  const { w: W, fb } = f
  const view = scene.view
  const t = scene.time
  if (!project(view, j.x, j.y, j.z)) return
  const sx = pr.x
  const sy = pr.y
  const m = pr.m
  // which way is behind the ship on the frame (the flames stream that way)
  const back = 40
  let bx = 0
  let by = 1
  if (project(view, j.x - Math.sin(j.yaw) * back, j.y + Math.cos(j.yaw) * back, j.z + (down > 0 ? back * 0.6 : -back * 0.6))) {
    const dx = pr.x - sx
    const dy = pr.y - sy
    const d = Math.hypot(dx, dy)
    if (d > 0.5) {
      bx = dx / d
      by = dy / d
    }
  }
  // the glow on the ship and the flames behind it
  const R = 26 * Math.max(0.6, Math.min(2.2, m)) * (0.6 + 0.5 * k)
  const reach = R * 3.2
  const x0 = Math.max(f.colLo, Math.floor(sx - reach))
  const x1 = Math.min(f.colHi - 1, Math.ceil(sx + reach))
  const y0 = Math.max(f.rowLo, Math.floor(sy - reach))
  const y1 = Math.min(f.rowHi - 1, Math.ceil(sy + reach))
  const flick = (t * 24) | 0
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - sx
      const dy = y + 0.5 - sy
      // along the flames (behind is positive) and across them
      const al = dx * bx + dy * by
      const ac = dx * -by + dy * bx
      const n = hash8(((x >> 1) * 13 + (y >> 1) * 71 + flick * 7) | 0) / 255
      // a teardrop: round in front, long behind, ragged
      const len = al > 0 ? R * (1 + 1.9 * k) : R * 0.75
      const wid = R * (0.7 - (al > 0 ? (0.45 * al) / len : 0))
      const e = (al / len) * (al / len) + (ac / Math.max(1, wid)) * (ac / Math.max(1, wid))
      if (e >= 1) continue
      const heat = (1 - e) * k * (0.75 + 0.5 * n)
      const bi = ((y & 3) << 2) | (x & 3)
      if (heat * 16 <= BAYER[bi] * 0.9) continue
      const ci = heat > 0.85 ? 0 : heat > 0.6 ? 1 : heat > 0.35 ? 2 : 3
      const o = y * W + x
      fb[o] = blend(fb[o], FIRE[ci], 200)
    }
}

/** what others are seen to do as they leave or come: a flash in a gate, a burst of fire going down, a streak of light going up */
export function drawFlashes(scene: SceneState, f: Frame) {
  const fl = scene.space.flashes
  if (!fl.length) return
  const view = scene.view
  const { w: W, fb } = f
  for (const e of fl) {
    const u = (scene.time - e.t) / FLASH_TIME
    if (u < 0 || u >= 1) continue
    if (!project(view, e.x, e.y, e.z)) continue
    const m = Math.max(0.4, Math.min(3, pr.m))
    const cx = pr.x
    const cy = pr.y
    // (a ring of light spreading and fading, a bright heart; going down, fire; going up, a streak upwards)
    const col = e.kind === 'down' ? FIRE[1] : e.kind === 'up' ? pack(220, 236, 255) : pack(200, 230, 255)
    const R = (e.kind === 'down' ? 30 : 46) * m * (0.3 + u)
    const heart = (1 - u) * 14 * m
    const reach = Math.ceil(R + 3)
    for (let y = Math.max(f.rowLo, Math.floor(cy - reach)); y <= Math.min(f.rowHi - 1, cy + reach); y++)
      for (let x = Math.max(f.colLo, Math.floor(cx - reach)); x <= Math.min(f.colHi - 1, cx + reach); x++) {
        const d = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * (e.kind === 'up' ? 0.35 : 1))
        const ring = 1 - Math.abs(d - R) / (2.5 * m)
        const k = Math.max(ring * (1 - u), d < heart ? 1 - d / heart : 0)
        if (k * 16 <= BAYER[((y & 3) << 2) | (x & 3)]) continue
        const o = y * W + x
        fb[o] = blend(fb[o], k > 0.8 ? WHITE_HOT : col, Math.round(200 * Math.min(1, k + 0.2)))
      }
  }
}
const WHITE_HOT = pack(255, 252, 240)

/**
 * the air burning round the ship, over everything: fire closing in from all round the frame as the air engulfs it, in
 * an oval (thickest in the corners) of tongues that reach in towards the ship. It was a band of even width along the
 * four edges, in 8 px blocks: from overhead it read as a picture frame round a dark screen, not as fire.
 */
export function drawAirFire(scene: SceneState, f: Frame) {
  if (!inAir(scene)) return
  const { shape } = airGlobe(scene)
  const k = shape.fire
  if (k <= 0.02) return
  const { w: W, fb } = f
  const flick = (scene.time * 12) | 0
  const ax = (f.colHi - f.colLo) / 2
  const ay = (f.rowHi - f.rowLo) / 2
  const cx = f.colLo + ax
  const cy = f.rowLo + ay
  // (the fire begins this far out, as a share of the way from the middle to an edge, and is whitest at the corners)
  const from = 1 - 0.42 * k
  if (from >= 1.4) return
  const from2 = from * from
  const span = 1.42 - from
  for (let y = f.rowLo; y < f.rowHi; y++) {
    const ny = (y + 0.5 - cy) / ay
    for (let x = f.colLo; x < f.colHi; x++) {
      const nx = (x + 0.5 - cx) / ax
      const r2 = nx * nx + ny * ny
      if (r2 < from2) continue
      // (in tongues round the oval, each its own length, flickering: a slow ragged edge, not a fizz)
      const t = ((Math.atan2(ny, nx) / (Math.PI * 2) + 0.5) * 72) | 0
      const n = hash8(((t * 31 + flick * 11) | 0) & 0xffff) / 255
      const e = Math.min(1, (Math.sqrt(r2) - from) / span) * (0.5 + 0.5 * n) * 1.6
      const bi = ((y & 3) << 2) | (x & 3)
      if (e * 16 <= BAYER[bi] + 3) continue
      const o = y * W + x
      fb[o] = blend(fb[o], FIRE[e > 0.85 ? 1 : e > 0.55 ? 2 : 3], Math.round(90 + 90 * Math.min(1, e)))
    }
  }
}
