// What the pilot has picked with the target key (James, 2026-11-19: "T to target the nearest thing in view"; the whole of it
// in docs/targeting.md). A press picks the nearest thing on the frame, and the next nearest each press after, round and
// round; held a moment, the key lets it go. Anything may be picked: every ship, and in space every body and structure, on a
// world's ground its bases and its places. The HUD brackets it and the cockpit's screen says what it is (render/target.ts);
// an enemy picked is the one the sights follow (sim/fight.ts), so it is the one a missile goes after.
//
// It is the pilot's own: no other game hears of it, and it is not kept. Nearest is by distance to a thing's surface (a world
// is as near as its ground), ties by what it is, so the same presses pick the same things in every run.

import type { Jet } from '../jet/jet'
import type { SceneState } from '../state'
import type { Fighter } from './combat'
import type { SpaceBody } from './space'
import type { Base, Place } from '../world/features'
import { TARGET } from '../data/target'
import { bodyZ } from './space'
import { wrapDelta } from './loop'
import { focus } from './ejection'
import { sound as effect } from './effects'
import { pr, project } from '../render/view'
import { jetSize } from '../jet/jet'
import { bodyOnFrame, overheadRadius, perspectiveOf } from '../render/space'

/** what may be picked: another ship (by its id), a wingman (by his place among the jets), a body of the system (by its galaxy index), a base or a place of the world's ground */
export type TargetRef =
  | { kind: 'ship'; id: number }
  | { kind: 'wing'; n: number }
  | { kind: 'body'; index: number }
  | { kind: 'base'; id: number }
  | { kind: 'place'; name: string }

export interface Targeting {
  /** what is picked (null: nothing) */
  on: TargetRef | null
  /** the zone it was picked in: a change of zone lets it go */
  zone: string
  /** scene seconds it was picked (the brackets close in on it) */
  at: number
  /** a press of the key since the last step: pick the next */
  ask: boolean
  /** the key held down now, and for how long; and whether it has let go of the target this hold */
  held: boolean
  heldFor: number
  dropped: boolean
}

export function createTargeting(): Targeting {
  return { on: null, zone: '', at: -99, ask: false, held: false, heldFor: 0, dropped: false }
}

/** a target where it is now: in the world (x, y, z; on a world's ground the copy nearest the pilot), its radius, and what it is */
export interface TargetNow {
  ref: TargetRef
  x: number
  y: number
  z: number
  /** px: how large it is round its middle */
  r: number
  /** px from the pilot to its surface */
  d: number
  jet: Jet | null
  fighter: Fighter | null
  ship: SceneState['ships'][number] | null
  body: SpaceBody | null
  base: Base | null
  place: Place | null
}

const sameRef = (a: TargetRef, b: TargetRef) =>
  a.kind === b.kind &&
  (a.kind === 'ship'
    ? a.id === (b as typeof a).id
    : a.kind === 'wing'
      ? a.n === (b as typeof a).n
      : a.kind === 'body'
        ? a.index === (b as typeof a).index
        : a.kind === 'base'
          ? a.id === (b as typeof a).id
          : a.name === (b as typeof a).name)

/** the same order in every game: a ref as a word (ties between things equally far are broken by it) */
const refKey = (r: TargetRef) =>
  r.kind === 'ship'
    ? `s${r.id}`
    : r.kind === 'wing'
      ? `w${r.n}`
      : r.kind === 'body'
        ? `b${r.index}`
        : r.kind === 'base'
          ? `a${r.id}`
          : `p${r.name}`

function blank(ref: TargetRef): TargetNow {
  return { ref, x: 0, y: 0, z: 0, r: 0, d: 0, jet: null, fighter: null, ship: null, body: null, base: null, place: null }
}

/** a ship that can be picked: in the sky (not away through a gate, not its pilot under a parachute) and not shot down */
const pickable = (j: Jet) => !j.away && (!j.fighter || j.fighter.alive)

/** where a target is now (null: it is gone) */
export function targetNow(scene: SceneState, ref: TargetRef): TargetNow | null {
  const me = focus(scene)
  const space = scene.zone.kind === 'space'
  // (on a world's ground, the copy of a thing nearest the pilot, the world wrapping round)
  const near = (x: number, y: number) => (space ? { x, y } : { x: me.x + wrapDelta(x - me.x), y: me.y + wrapDelta(y - me.y) })
  const t = blank(ref)
  if (ref.kind === 'ship' || ref.kind === 'wing') {
    let jet: Jet | null
    if (ref.kind === 'ship') {
      const s = scene.ships.find((s) => s.id === ref.id)
      if (!s || s.out) return null
      jet = s.jet
      t.ship = s
    } else jet = scene.jets[ref.n] ?? null
    if (!jet || !pickable(jet)) return null
    const p = near(jet.x, jet.y)
    t.x = p.x
    t.y = p.y
    t.z = jet.z
    t.jet = jet
    t.fighter = jet.fighter
    t.r = t.ship ? Math.max(t.ship.mesh.model.w, t.ship.mesh.model.l) * 0.5 : Math.max(scene.mesh.model.w, scene.mesh.model.l) * 0.5
    t.d = Math.hypot(t.x - me.x, t.y - me.y, t.z - me.z)
    return t
  }
  if (ref.kind === 'body') {
    if (!space) return null
    const b = scene.space.bodies.find((b) => b.body.index === ref.index)
    if (!b) return null
    t.body = b
    t.x = b.x
    t.y = b.y
    t.z = bodyZ(b.body)
    t.r = b.body.size
    t.d = Math.max(0, Math.hypot(t.x - me.x, t.y - me.y, t.z - me.z) - (b.body.kind === 'gate' || b.body.kind === 'base' ? 0 : b.body.size))
    return t
  }
  if (space) return null
  const f = scene.world.features
  if (ref.kind === 'base') {
    const b = f.bases.find((b) => b.id === ref.id)
    if (!b) return null
    const p = near(b.x, b.y)
    t.base = b
    t.x = p.x
    t.y = p.y
    t.z = b.pads[0]?.z ?? b.mast.z
    t.r = 40
  } else {
    const pl = f.places.find((p) => p.name === ref.name)
    if (!pl) return null
    const p = near(pl.x, pl.y)
    t.place = pl
    t.x = p.x
    t.y = p.y
    t.z = pl.z
    t.r = 24
  }
  t.d = Math.hypot(t.x - me.x, t.y - me.y)
  return t
}

/** where a target is on the frame now, as the camera has it (turned with the cockpit's roll), and its radius there; null behind the camera */
export function targetOnScreen(scene: SceneState, t: TargetNow): { x: number; y: number; r: number } | null {
  const view = scene.view
  if (t.body) {
    const p = bodyOnFrame(scene, t.body)
    if (!p) return null
    const k = t.body.body.kind
    let r: number
    if (perspectiveOf(view) >= 0.5) {
      const d = Math.max(1, Math.hypot(t.x - view.x, t.y - view.y, t.z - view.alt))
      r = (t.body.body.size * view.scale) / (view.q * d)
    } else r = k === 'planet' || k === 'moon' ? overheadRadius(t.body.body) : t.body.body.size
    return { x: p.x, y: p.y, r }
  }
  if (!project(view, t.x, t.y, t.z)) return null
  let x = pr.x
  let y = pr.y
  if (view.roll !== 0) {
    const W = scene.screen.w
    const c = Math.cos(view.roll)
    const s = Math.sin(view.roll)
    const dx = pr.x - (W >> 1)
    const dy = pr.y - scene.pivotNow
    x = (W >> 1) + c * dx + s * dy
    y = scene.pivotNow - s * dx + c * dy
  }
  return { x, y, r: t.r * pr.m * (t.jet ? jetSize(scene.params) : 1) }
}

/** whether a target can be seen on the frame now (in the seat, above the panel) */
function onFrame(scene: SceneState, t: TargetNow) {
  const { w: W, h: H } = scene.screen
  const art = scene.cockpitArt
  const bottom = scene.view.cockpit > 0.5 && art ? Math.min(H, art.panelTop) : H
  const p = targetOnScreen(scene, t)
  if (!p) return false
  const m = TARGET.margin
  return p.x + p.r >= m && p.y + p.r >= m && p.x - p.r < W - m && p.y - p.r < bottom - m
}

/** everything that may be picked now and is on the frame, nearest first */
export function candidates(scene: SceneState): TargetNow[] {
  const refs: TargetRef[] = []
  for (const s of scene.ships) refs.push({ kind: 'ship', id: s.id })
  // (the wingmen: the player's own ship, jets[0], is not a target)
  for (let n = 1; n < scene.jets.length; n++) refs.push({ kind: 'wing', n })
  if (scene.zone.kind === 'space') {
    for (const b of scene.space.bodies) if (b.body.kind !== 'belt') refs.push({ kind: 'body', index: b.body.index })
  } else {
    for (const b of scene.world.features.bases) refs.push({ kind: 'base', id: b.id })
    for (const p of scene.world.features.places) refs.push({ kind: 'place', name: p.name })
  }
  const out: TargetNow[] = []
  for (const ref of refs) {
    const t = targetNow(scene, ref)
    if (!t) continue
    if (t.jet && t.d > TARGET.pickShip) continue
    if ((t.base || t.place) && t.d > TARGET.pickGround) continue
    if (!onFrame(scene, t)) continue
    out.push(t)
  }
  out.sort((a, b) => a.d - b.d || (refKey(a.ref) < refKey(b.ref) ? -1 : 1))
  return out
}

/** the next thing to pick: the nearest, or the one after the target among them, round and round */
export function nextTarget(scene: SceneState): TargetRef | null {
  const all = candidates(scene)
  if (!all.length) return null
  const on = scene.target.on
  const i = on ? all.findIndex((t) => sameRef(t.ref, on)) : -1
  return all[(i + 1) % all.length].ref
}

/** picks a target outright (the page: a course plotted, a touch on it), or lets it go (null) */
export function setTarget(scene: SceneState, ref: TargetRef | null) {
  const tg = scene.target
  if (ref && tg.on && sameRef(ref, tg.on)) return
  tg.on = ref
  tg.zone = scene.worldKey
  tg.at = scene.time
}

/** the target this step: pressed, held, lost */
export function stepTarget(scene: SceneState, dt: number) {
  const tg = scene.target
  // (gone: shot down, flown off, another zone)
  if (tg.on && (tg.zone !== scene.worldKey || !targetNow(scene, tg.on))) tg.on = null
  if (tg.on) {
    const t = targetNow(scene, tg.on)
    if (t && ((t.jet && t.d > TARGET.shipFar) || ((t.base || t.place) && t.d > TARGET.groundFar))) tg.on = null
  }
  // (a press: the next; held a moment: let go, once a hold)
  if (tg.ask) {
    tg.ask = false
    const next = nextTarget(scene)
    if (next) setTarget(scene, next)
    else tg.on = null
    sound(scene, next ? 'target' : 'untarget')
  }
  if (tg.held) {
    tg.heldFor += dt
    if (tg.heldFor >= TARGET.hold && !tg.dropped) {
      tg.dropped = true
      if (tg.on) {
        tg.on = null
        sound(scene, 'untarget')
      }
    }
  } else {
    tg.heldFor = 0
    tg.dropped = false
  }
}

/** the target as a fighter the sights may follow (an enemy's ship, alive), or null */
export function targetFighter(scene: SceneState): Fighter | null {
  const on = scene.target.on
  if (!on || (on.kind !== 'ship' && on.kind !== 'wing')) return null
  const t = targetNow(scene, on)
  return t?.fighter && t.fighter.alive ? t.fighter : null
}

/** a sound for the pilot alone, where his ship is */
function sound(scene: SceneState, what: 'target' | 'untarget') {
  const j = focus(scene)
  effect(scene, what, j.x, j.y, j.z, 1, true)
}
