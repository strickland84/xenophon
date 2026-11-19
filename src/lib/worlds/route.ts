// A route across the galaxy, for the maps: the fewest jumps from one system to another along the
// lanes (a gate at each end, or the shortcut through two linked black holes), and, in each system
// on the way, the body to fly to next (the gate, or the black hole, that leads on).

import { theGalaxy } from '../engine'

/** the systems from `from` to `to` (both included), the fewest jumps apart; [] if there is no way */
export function routeOf(from: number, to: number): number[] {
  const g = theGalaxy()
  if (from === to) return [from]
  const back = new Map<number, number>([[from, -1]])
  const queue = [from]
  while (queue.length) {
    const s = queue.shift()!
    for (const li of g.systems[s].lanes) {
      const l = g.lanes[li]
      const next = l.a === s ? l.b : l.a
      if (back.has(next)) continue
      back.set(next, s)
      if (next === to) {
        const path = [to]
        for (let at = s; at !== -1; at = back.get(at)!) path.unshift(at)
        return path
      }
      queue.push(next)
    }
  }
  return []
}

/** the body in system `here` that leads on to system `next`: its gate on their lane, or its black hole on the shortcut (−1: none) */
export function wayOn(here: number, next: number): number {
  const g = theGalaxy()
  const lane = g.systems[here].lanes.map((i) => g.lanes[i]).find((l) => (l.a === here && l.b === next) || (l.b === here && l.a === next))
  if (!lane) return -1
  const bodies = g.systems[here].bodies.map((i) => g.bodies[i])
  const way =
    lane.kind === 'gate' ? bodies.find((b) => b.kind === 'gate' && b.lane === lane.index) : bodies.find((b) => b.kind === 'black hole')
  return way ? way.index : -1
}

/** the course to fly in system `here` for a route to system `to` (and, there, to body `body`, −1 none) */
export function courseFor(here: number, to: number, body: number): number {
  if (here === to) return body
  const path = routeOf(here, to)
  return path.length > 1 ? wayOn(here, path[1]) : -1
}
