// The sky shared with other games, from the scene's side. Some of the ships in a scene may
// belong to another game: another player's, or the computer's while another player flies them
// for the room. This scene draws them and lets them be shot at, but what happens to them is
// their own game's to decide. So a hit on one, or a missile at one, is not applied here but
// reported (Scene.takeReports), for the network to pass on; and what other games decide (a hit
// on the player, a ship lost, a missile launched or ended) comes back in through the Scene API
// and is applied here.
//
// Who decides what: a shot's hit is decided by the shooter's game (it feels best with lag); a
// missile's, by the game that owns its target, since dodging one is a roll timed by its target.
// A ship's loss is decided by its owner's game, which tells the others who downed it.
//
// The scene stays deterministic: all of this arrives as calls between steps, like the controls.

import type { SceneState } from '../state'
import type { Items } from './cargo'
import { harm, LEADER, ownFighter, PARKED, shootDown, SHIP, TURRET, WALKER } from './combat'
import { ABOARD, parkedFighter, walkerFighter } from './foot'
import type { Fighter } from './combat'
import { hitFx, noseOf, stepGun } from './guns'
import type { Aim } from './guns'
import { burst, fireMissile } from './missiles'

/** what this scene must tell the games it shares the sky with. Ships are named by their id here: 0 is the player, −1 nobody */
export type Report =
  /** a shot from here struck a ship another game owns (`hull`: it struck the hull, as far as this game knows) */
  | { kind: 'hit'; target: number; by: number; amount: number; dx: number; dy: number; dz: number; hull: boolean }
  /** a ship this game owns (the player's, or the computer's it flies) was lost; `by` downed it */
  | { kind: 'down'; target: number; by: number }
  /** a ship this game owns fired a missile; `tag` is its number here */
  | { kind: 'missile'; tag: number; from: number; target: number }
  /** a missile at a ship this game owns burst at (x, y, z), or was dodged */
  | { kind: 'missileEnd'; tag: number; x: number; y: number; z: number; dodged: boolean }
  /** this game's laser took `n` units from outcrop `outcrop` in its period `epoch` */
  | { kind: 'mined'; outcrop: number; epoch: number; n: number }
  /** a ship this game owns was lost and spilled a crate (`tag` its number here) */
  | { kind: 'crate'; tag: number; x: number; y: number; z: number; items: Items }
  /** this game's pilot took from crate `tag` (this scene's number for it): `left` is what is left in it */
  | { kind: 'crateTaken'; tag: number; left: Items }
  /** this game's pilot, on foot, was killed by `by` (−1: by nobody: the sea, lava) */
  | { kind: 'died'; by: number }
  /** this game's pilot cut `n` units from vein `vein` in its period `epoch` */
  | { kind: 'vein'; vein: number; epoch: number; n: number }
  /** this game's pilot (or ship) killed creature `id` here: it is gone until `until` (seconds since 1970) */
  | { kind: 'beast'; id: number; until: number }
  /** this game's pilot, on foot, is climbing into ship `target` (another game's, parked): that game says whether it is given up */
  | { kind: 'steal'; target: number }
  /** this game's pilot planted his beacon at (x, y, z) */
  | { kind: 'beacon'; x: number; y: number; z: number }
  /** this game's pilot fired a flare from (x, y, z) */
  | { kind: 'flare'; x: number; y: number; z: number }
  /** this game's ship dropped mine `tag` at (x, y, z); and it burst */
  | { kind: 'mine'; tag: number; x: number; y: number; z: number }
  | { kind: 'mineEnd'; tag: number }

/** one line of the kill feed: words, faction marks and pilots' heads (their looks, races/races.ts lookText), each in its own colour */
export interface FeedLine {
  parts: { text?: string; mark?: number; face?: string; color: string }[]
}

export interface Room {
  /** true while other games share this sky: reports are kept, and the skirmish has no last ship */
  shared: boolean
  /** true while this game flies the computer's ships and sends the waves (alone, it always does) */
  host: boolean
  reports: Report[]
  /** the number the next missile fired here is given */
  missileTag: number
  /** how many ships the player has had: one more at each pick-up */
  life: number
  /** the kill feed: its lines, and the scene time each came in */
  feed: { line: FeedLine; t: number }[]
}

export function createRoom(): Room {
  return { shared: false, host: true, reports: [], missileTag: 1, life: 1, feed: [] }
}

/** the most reports kept before they are taken (the oldest go) */
const REPORTS_MAX = 512
/** seconds a line of the kill feed stays, and the most shown at once */
export const FEED_TIME = 8
export const FEED_MOST = 4

/** something for the other games to hear (kept only while the sky is shared) */
export function report(scene: SceneState, r: Report) {
  const room = scene.room
  if (!room.shared) return
  room.reports.push(r)
  if (room.reports.length > REPORTS_MAX) room.reports.splice(0, room.reports.length - REPORTS_MAX)
}

/** the id of the player's ship while it stands empty where he left it (0 is the player himself: in his ship, or on foot) */
export const PARKED_ID = -2

/** a fighter's id in reports: 0 the player (and his wingmen, who fly for him; and himself on foot), the player's parked ship PARKED_ID, a ship's or another pilot on foot's own id, −1 nobody */
export function idOf(scene: SceneState, f: Fighter | null): number {
  if (!f || f.kind === TURRET) return -1
  if (f.kind === PARKED) return PARKED_ID
  if (f.kind === WALKER) return f === scene.foot.walker.fighter ? 0 : (scene.walkers.find((w) => w.fighter === f)?.id ?? -1)
  if (f.kind !== SHIP) return 0
  return scene.ships.find((s) => s.jet === f.jet)?.id ?? -1
}

/** the fighter a report's id names, if it is here (0: the player, in his ship or, with `foot`, on foot) */
export function fighterOf(scene: SceneState, id: number, foot = false): Fighter | null {
  if (id === 0) return foot ? walkerFighter(scene) : (ownFighter(scene) ?? walkerFighter(scene))
  if (id === PARKED_ID) return parkedFighter(scene)
  const f = scene.ships.find((s) => s.id === id)?.jet.fighter ?? scene.walkers.find((w) => w.id === id)?.fighter
  return f && f.alive ? f : null
}

/** true for a fighter another game owns */
export const isRemote = (f: Fighter | null) => !!f && f.remote

/**
 * Another game says its shot struck `target` (an id here) for `amount`, at (dx, dy, dz) from
 * its middle. If this game owns the target, the damage is done here; either way the strike shows.
 */
export function hitFromAfar(
  scene: SceneState,
  target: number,
  amount: number,
  by: number,
  dx: number,
  dy: number,
  dz: number,
  hull: boolean,
  foot = false,
) {
  // (the player on foot: `foot` says the shot struck him, not the ship he left)
  const f = target === 0 && !foot && scene.foot.stage !== ABOARD ? parkedFighter(scene) : fighterOf(scene, target, foot)
  if (!f) return
  const x = f.jet.x + dx
  const y = f.jet.y + dy
  const z = f.jet.z + dz
  if (f.remote) {
    // someone else's ship, hit by a third: it only shows
    if (hull) f.hullAt = scene.time
    else f.shieldAt = scene.time
    hitFx(scene, f, x, y, z, hull, 0, 0, 0)
    return
  }
  const struck = harm(scene, f, amount, fighterOf(scene, by), x, y, z)
  hitFx(scene, f, x, y, z, struck, 0, 0, 0)
}

/** another game says a ship it owns was lost, downed by `by`; `worth` scales what the player scores for it */
export function downFromAfar(scene: SceneState, target: number, by: number, worth: number) {
  const f = fighterOf(scene, target)
  if (!f || f.kind === LEADER || f.kind === PARKED || (f.kind === WALKER && !f.remote)) return
  f.worth = worth
  shootDown(scene, f, fighterOf(scene, by))
}

/** another game says a ship of its own fired a missile at `target` (ids here): it is fired here too; returns its number here (0: it could not be) */
export function missileFromAfar(scene: SceneState, from: number, target: number) {
  const f = fighterOf(scene, from)
  const t = fighterOf(scene, target)
  if (!f || !t) return 0
  return fireMissile(scene, f, t)?.tag ?? 0
}

/** the game that owns a missile's target says how it ended: it burst at (x, y, z), or it was dodged */
export function endMissileFromAfar(scene: SceneState, tag: number, x: number, y: number, z: number, dodged: boolean) {
  const m = scene.missiles.find((m) => m.on && m.tag === tag)
  if (!m) return
  if (dodged) {
    m.target = null
    return
  }
  m.x = x
  m.y = y
  m.z = z
  burst(scene, m)
}

// scratch
const nose: Aim = { x: 0, y: 0, z: 0 }

/** ships flown from another game fire when it says they are firing: shots that show, and do no harm here */
export function stepRemoteGuns(scene: SceneState, dt: number) {
  for (const s of scene.ships) {
    const f = s.jet.fighter
    if (!f || !f.alive || !f.remote) continue
    stepGun(scene, f, dt, s.firing, noseOf(f, nose))
  }
}

/** a line for the kill feed */
export function addFeed(scene: SceneState, line: FeedLine) {
  const feed = scene.room.feed
  feed.push({ line, t: scene.time })
  if (feed.length > FEED_MOST) feed.shift()
}

/** old lines leave the kill feed */
export function stepFeed(scene: SceneState) {
  const feed = scene.room.feed
  while (feed.length && scene.time - feed[0].t > FEED_TIME) feed.shift()
}
