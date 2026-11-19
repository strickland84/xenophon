// Traffic (the polish pass, item 8: a quiet system is not an empty one): haulers going about their
// business, between a system's stations, worlds and gates in space, and over a world from one base to
// the other. No one's to fight, and nothing about them is stored or sent: where each one is follows
// from the shared clock alone, so every player sees the same haulers in the same places.
//
// Each hauler flies legs of a fixed length of time: from one stop to the next, easing out and in,
// then docked out of sight for the rest of the leg. In space a leg's stops are picked from the
// system's ports by the leg's number; over a world it comes in from beyond one base, over both, and
// away beyond the other, there and back. A side's home system's haulers wear its colours and mark.

import { TRAFFIC, BAND_PAINT, SIDE_COLOURS } from '../data/bands'
import { SPACE_Z } from '../data/space'
import { surfaceById, systemOfKey, theGalaxy } from '../galaxy/galaxy'
import type { Side } from '../galaxy/galaxy'
import type { SceneState } from '../state'
import { hash8 } from '../util/math'
import { groundAt } from '../world/world'
import { peopled } from './bands'
import { deltaIn, nowOf } from './loop'
import { createShip } from './ships'

/** one hauler: its ship here, and what its legs are made from */
interface Hauler {
  ship: number
  n: number
  /** seconds a leg takes, and how far into one it was at the clock's zero */
  leg: number
  phase: number
}

export interface Traffic {
  /** the zone and side it was made for ('' none) */
  key: string
  haulers: Hauler[]
  /** over a world: the bases it flies between (their first pads), and the height it flies at */
  stops: { x: number; y: number }[]
  height: number
}

export function createTraffic(): Traffic {
  return { key: '', haulers: [], stops: [], height: 0 }
}

/** how busy a system is: a home system most, the core least */
const kindOf = (system: number) => theGalaxy().systems[system]?.kind ?? 'frontier'

/** the system the scene is in (−1 none) */
const systemHere = (scene: SceneState) =>
  scene.zone.kind === 'space' ? systemOfKey(scene.worldKey) : (surfaceById(scene.worldKey)?.system ?? -1)

/** the haulers of the zone, made afresh (and the last zone's taken away) */
function remake(scene: SceneState, key: string) {
  const t = scene.traffic
  for (let i = scene.ships.length - 1; i >= 0; i--) if (scene.ships[i].traffic) scene.ships.splice(i, 1)
  t.key = key
  t.haulers = []
  t.stops = []
  if (!key) return
  const system = systemHere(scene)
  if (system < 0) return
  const sys = theGalaxy().systems[system]
  const space = scene.zone.kind === 'space'
  let count = space ? TRAFFIC.space[kindOf(system)] : TRAFFIC.surface[kindOf(system)]
  if (!space) {
    const bases = scene.world.features.bases
    const w = surfaceById(scene.worldKey)
    // (a barren moon off the beaten way sees none, but at home)
    if (!bases.length || (w && !w.habitable && !sys.side)) count = 0
    t.stops = bases.slice(0, 2).map((b) => ({ x: b.pads[0]?.x ?? b.x, y: b.pads[0]?.y ?? b.y }))
    // (one base: in from far off and away again on the far side)
    if (t.stops.length === 1) t.stops.push({ x: t.stops[0].x + TRAFFIC.reach, y: t.stops[0].y + TRAFFIC.reach * 0.4 })
    // high enough to clear the ground the whole way
    if (t.stops.length === 2) {
      const [p, q] = t.stops
      const dx = deltaIn(scene, q.x - p.x)
      const dy = deltaIn(scene, q.y - p.y)
      const d = Math.hypot(dx, dy) || 1
      let top = 0
      for (let i = 0; i <= 32; i++) {
        const u = -TRAFFIC.reach / d + ((1 + (2 * TRAFFIC.reach) / d) * i) / 32
        top = Math.max(top, groundAt(scene.world, p.x + dx * u, p.y + dy * u))
      }
      t.height = top + TRAFFIC.height
    }
  }
  const side = sys.side as Side | null
  const paint = side ? BAND_PAINT[side === 'nomarchy' ? 'nomarchyHauler' : 'anarchoiHauler'] : BAND_PAINT.neutral
  for (let n = 0; n < count; n++) {
    const hull = TRAFFIC.hulls[(n + system) % TRAFFIC.hulls.length]
    const id = scene.nextShip++
    const ship = createShip(scene, id, {
      x: 0,
      y: 0,
      height: space ? SPACE_Z : t.height,
      heading: 0,
      hull,
      paint,
      side: -1,
      mark: side ? (side === 'nomarchy' ? 1 : 2) : 0,
      markColor: side ? SIDE_COLOURS[side] : undefined,
    })
    ship.traffic = true
    ship.jet.away = true
    scene.ships.push(ship)
    const leg = space ? TRAFFIC.spaceLeg : TRAFFIC.surfaceLeg
    t.haulers.push({ ship: id, n, leg, phase: (hash8(n * 97 + system * 13 + 5) / 256) * leg })
  }
}

/** the ports of a system's space a hauler calls at: stations (not a derelict), habitable worlds, gates */
const portsOf = (scene: SceneState) =>
  scene.space.bodies.filter(
    (b) =>
      (b.body.kind === 'base' && b.body.role !== 'derelict') ||
      (b.body.world >= 0 && theGalaxy().worlds[b.body.world].habitable) ||
      b.body.kind === 'gate',
  )

/** how far from a port's middle a hauler leaves it or arrives (clear of a world's disc, at a station's arms, in a gate's ring) */
const standOff = (kind: string, size: number) => (kind === 'gate' ? 0 : kind === 'base' ? size * 1.3 : size * 1.15)

/** ease out and in: 0..1 */
const ease = (u: number) => u * u * (3 - 2 * u)

/** each hauler where the clock has it now */
export function stepTraffic(scene: SceneState) {
  const t = scene.traffic
  const key = peopled(scene) ? `${scene.worldKey}|${scene.params.side}` : ''
  // (another zone, or a zone left behind with everything in it)
  if (key !== t.key || (t.haulers.length && !scene.ships.some((s) => s.traffic))) remake(scene, key)
  if (!t.haulers.length) return
  const now = nowOf(scene)
  const space = scene.zone.kind === 'space'
  const ports = space ? portsOf(scene) : []
  const system = systemHere(scene)
  const flying = 1 - TRAFFIC.dock
  for (const h of t.haulers) {
    const s = scene.ships.find((q) => q.id === h.ship)
    if (!s) continue
    const j = s.jet
    const k = Math.floor((now + h.phase) / h.leg)
    const u = (now + h.phase - k * h.leg) / h.leg
    let ax: number
    let ay: number
    let bx: number
    let by: number
    let hidden = u >= flying
    if (space) {
      if (ports.length < 2) {
        j.away = true
        continue
      }
      const pick = (m: number) => ports[hash8(h.n * 131 + m * 7 + system * 17) % ports.length]
      const from = pick(k)
      const to = pick(k + 1)
      // (the same port twice: it stays docked this leg)
      if (from === to) hidden = true
      const dx = to.x - from.x
      const dy = to.y - from.y
      const d = Math.hypot(dx, dy) || 1
      const o1 = standOff(from.body.kind, from.body.size)
      const o2 = standOff(to.body.kind, to.body.size)
      ax = from.x + (dx / d) * o1
      ay = from.y + (dy / d) * o1
      bx = to.x - (dx / d) * o2
      by = to.y - (dy / d) * o2
    } else {
      const [p, q] = t.stops
      if (!p || !q) {
        j.away = true
        continue
      }
      const dx = deltaIn(scene, q.x - p.x)
      const dy = deltaIn(scene, q.y - p.y)
      const d = Math.hypot(dx, dy) || 1
      const ox = (dx / d) * TRAFFIC.reach
      const oy = (dy / d) * TRAFFIC.reach
      // (there, and back on the next leg)
      const there = (k + h.n) % 2 === 0
      ax = there ? p.x - ox : p.x + dx + ox
      ay = there ? p.y - oy : p.y + dy + oy
      bx = there ? p.x + dx + ox : p.x - ox
      by = there ? p.y + dy + oy : p.y - oy
    }
    const was = j.away
    j.away = hidden
    if (hidden) {
      j.trailLen = 0
      continue
    }
    const v = ease(u / flying)
    const nx = ax + (bx - ax) * v
    const ny = ay + (by - ay) * v
    // (out of dock: its trails begin here, not where it last was)
    if (was) {
      j.lastTrailX = nx
      j.lastTrailY = ny
      j.trailLen = 0
    }
    // (its speed now, for its engines: how fast the easing carries it)
    const rate = (6 * (u / flying) * (1 - u / flying)) / (h.leg * flying)
    s.speed = Math.hypot(bx - ax, by - ay) * rate
    s.thrust = 0.35
    j.x = nx
    j.y = ny
    j.z = space ? SPACE_Z : t.height
    j.yaw = Math.atan2(bx - ax, -(by - ay))
    j.roll = 0
    j.pitch = 0
  }
}
