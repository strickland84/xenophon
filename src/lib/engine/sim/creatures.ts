// The wildlife of the worlds (the plan's section 6, "Creatures"; numbers in data/creatures.ts): grazers
// and critters that run from a pilot on foot, hunters that stalk and charge, spitters, shore crabs that
// guard their patch, plants that snap, and now and then a great rare beast. A pilot hunts them with his
// sidearm for what they drop: hide, chitin, glands, now and then a heartstone, and credits.
//
//   where     each world is cut into cells; each cell's groups (what kind, how many, where they keep to) follow
//             from the world's key and the cell alone, so every game agrees where the wildlife is. What lives
//             on a world is its archetype's (FAUNA); how much of it hunts follows its system's wildness.
//   waking    a group is put up when the pilot on foot comes near its home, and taken down again once he is
//             far from all of it, so a world's wildlife costs nothing until he walks among it
//   killed    a creature killed is gone until a turn of its group's clock at least WILD.away later, the same
//             moment in every game; the kill is told to the room ('beast' reports), so it is gone in the
//             games of others there too. Each game moves its own copy of a creature (they are not shared, as
//             a band's ships are: see the plan), and its drops are the killer's.
//
// render/creatures.ts draws them, their globs, their ichor and what they drop.

import { CREATURES, FAUNA, GLOB, LOOT, STRUCK, WILD } from '../data/creatures'
import type { CreatureKind, Drop } from '../data/creatures'
import { FOOT } from '../data/foot'
import { RESOURCES } from '../data/resources'
import type { ResourceId } from '../data/resources'
import { wildness } from '../galaxy/danger'
import { surfaceById } from '../galaxy/galaxy'
import type { SceneState } from '../state'
import { clamp, wrapAngle } from '../util/math'
import { landable } from '../world/features'
import { groundAt, matAt, N, treeAt } from '../world/world'
import type { World } from '../world/world'
import { addTo } from './cargo'
import { harm, LEADER } from './combat'
import type { Fighter } from './combat'
import { addStar, sound, STAR_HIT } from './effects'
import { ABOARD, footGround, WALKING } from './foot'
import { looping, news, nowOf, record, wrapDelta } from './loop'
import { report } from './room'

// what a creature is doing
export const GRAZE = 0 // standing about, head down
export const ROAM = 1 // ambling somewhere near its home
export const FLEE = 2 // running from the pilot
export const STALK = 3 // creeping closer
export const CHARGE = 4 // running at him
export const BITE = 5 // its bite winding up (it lands at the end)
export const BACK = 6 // backing off after a bite, or keeping its distance
export const HOME = 7 // going home (he is gone, or it strayed too far)
export const DEAD = 8 // killed: falls, lies a moment, fades

/** a group of a world's wildlife: what it is, where it keeps to; the same in every game */
export interface Group {
  /** names it in every game: its cell and its slot there */
  id: number
  kind: number
  count: number
  /** where it keeps to (the ground there) */
  x: number
  y: number
  z: number
  /** it is up now */
  up: boolean
}

export interface Creature {
  /** its group's id × 8 + its place in the group: the same in every game */
  id: number
  group: Group
  kind: CreatureKind
  k: number
  x: number
  y: number
  /** its feet */
  z: number
  yaw: number
  vx: number
  vy: number
  health: number
  mode: number
  /** seconds in this mode; and a mode's own time (how long to graze, flee …) */
  t: number
  span: number
  /** where it is going (roaming, fleeing) */
  tx: number
  ty: number
  /** how far through its walk (four steps a stride) */
  step: number
  /** scene seconds it was last struck; it is knocked back at (kx, ky) px a second, easing off */
  hitAt: number
  kx: number
  ky: number
  /** seconds before it can bite (or spit) again */
  rest: number
  /** it has been riled (shot, or a brute crowded): it fights instead of grazing */
  angry: boolean
  /** its own repeatable chance numbers */
  r: number
  /** it was killed by the player (its drops are his) */
  mine: boolean
}

/** a spitter's glob in the air */
export interface Glob {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  born: number
  damage: number
  /** where it splashed down (it shows a moment there), or −1 while flying */
  splat: number
}

/** something dropped where a creature fell, for the pilot to walk over and take */
export interface Loot {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  item: ResourceId | 'credits'
  n: number
  born: number
  /** a heartstone: it glints */
  rare: boolean
  /** a number of its own (its glint's timing) */
  tag: number
}

/** a drop of ichor in the air, and where it lies a moment after */
export interface Ichor {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  born: number
  /** the kind it came from (its colour) */
  k: number
  down: boolean
}

export interface Wild {
  /** the world its groups were worked out for ('' none), and the groups */
  world: string
  groups: Group[]
  /** the creatures up now */
  up: Creature[]
  globs: Glob[]
  loot: Loot[]
  ichor: Ichor[]
  /** `world:id` → seconds since 1970 a creature killed is back */
  dead: Map<string, number>
  /** scene seconds the news last said the pack was full (it says so now and then, not every step) */
  fullAt: number
  /** a number for the next drop */
  tag: number
}

export function createWild(): Wild {
  return { world: '', groups: [], up: [], globs: [], loot: [], ichor: [], dead: new Map(), fullAt: -99, tag: 0 }
}

// ── chance, the same in every game

/** a number from a world's key */
function seedOf(key: string) {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  return h | 0
}

/** one step of mulberry32 kept in a number (a creature's own, or a cell's): 0..1 */
function next(state: { r: number }) {
  let t = (state.r = (state.r + 0x6d2b79f5) | 0)
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** one of a weighted list */
function pick(list: [string, number][], u: number) {
  let total = 0
  for (const [, w] of list) total += w
  let at = u * total
  for (const [id, w] of list) {
    at -= w
    if (at < 0) return id
  }
  return list[list.length - 1][0]
}

// ── the ground

/** water deep enough to drown in, lava or acid (materials 0..1 under a sea; lava and acid all low ground) */
function deep(world: World, m: number) {
  const sea = world.look.sea
  if (m >= 4 || sea === 'none' || sea === 'ice') return false
  if (sea === 'lava' || sea === 'acid') return true
  return m < 2
}

/** where a creature with feet at `feet` can stand at (x, y): the ground's height there, or −1 where it cannot go */
function groundFor(world: World, k: CreatureKind, x: number, y: number, feet: number) {
  const m = matAt(world, x, y)
  // (the shallows and the sea are a swimmer's only: the rest keep to dry land, or a frozen sea)
  if (deep(world, m) || (m < 4 && world.look.sea === 'water')) {
    // (a swimmer goes into the water, never lava or acid; it swims at the water's face)
    if (!k.swims || world.look.sea !== 'water') return -1
    return groundAt(world, x, y)
  }
  // a pad and its apron can be crossed; a building, a turret, a crystal cannot
  if (m >= 4 && !landable(m) && !treeAt(world, x, y)) return -1
  const g = footGround(world, x, y, feet)
  return Math.abs(g - feet) > FOOT.step + 0.5 ? -1 : g
}

/** eight ways round, 24 px out (whole numbers: where the groups live is worked out the same in every browser) */
const ROUND = [
  [24, 0],
  [17, 17],
  [0, 24],
  [-17, 17],
  [-24, 0],
  [-17, -17],
  [0, -24],
  [17, -17],
]

/** true near water (a shore crab's home): within 24 px of the sea */
function shore(world: World, x: number, y: number) {
  if (world.look.sea !== 'water') return false
  for (const [dx, dy] of ROUND) if (matAt(world, x + dx, y + dy) < 4) return true
  return false
}

// ── the groups of a world

/** cells a side the world had when it was one region */
const HOME_CELLS = N / WILD.cell

/** each cell's groups of the world the scene is on (none on a world with no bases: the island world of the settings; none on a moon) */
export function placeWild(scene: SceneState): Group[] {
  const { world, planet } = scene
  const bases = world.features.bases
  if (!planet || !bases.length) return []
  const fauna = FAUNA[planet.archetype]
  if (!fauna || (!fauna.common.length && !fauna.hunters.length)) return []
  const surface = surfaceById(scene.worldKey)
  const wild = surface ? clamp(wildness(surface.system), 0, 3) : 1
  const cells = world.size / WILD.cell
  const out: Group[] = []
  const seed = seedOf(scene.worldKey) ^ 0x3b1d
  for (let cy = 0; cy < cells; cy++)
    for (let cx = 0; cx < cells; cx++) {
      // (the cells the world had when it was one region keep the numbers they had, and so their creatures)
      const cell = cx < HOME_CELLS && cy < HOME_CELLS ? cy * HOME_CELLS + cx : HOME_CELLS * HOME_CELLS + cy * cells + cx
      const s = { r: seed ^ Math.imul(cell + 1, 0x9e3779b1) }
      for (let slot = 0; slot < 2; slot++) {
        const u = next(s)
        const v = next(s)
        let id = ''
        if (slot === 0) {
          if (u < WILD.common[wild] && fauna.common.length) id = pick(fauna.common, v)
        } else if (u < WILD.rare[wild]) id = 'thornback'
        else if (u < WILD.rare[wild] + WILD.hunters[wild] && fauna.hunters.length) id = pick(fauna.hunters, v)
        if (!id) continue
        const k = CREATURES.findIndex((c) => c.id === id)
        const kind = CREATURES[k]
        // its home: the first of a few places in the cell it can live (dry ground; a shore or the shallows for a crab), away from bases
        for (let tries = 0; tries < (kind.swims ? 16 : 8); tries++) {
          const x = (cx + 0.1 + next(s) * 0.8) * WILD.cell
          const y = (cy + 0.1 + next(s) * 0.8) * WILD.cell
          const m = matAt(world, x, y)
          if (m < (kind.swims ? 2 : 4) || (m >= 4 && !landable(m) && !treeAt(world, x, y))) continue
          if (kind.id === 'reefclaw' && !shore(world, x, y)) continue
          const away = WILD.awayFromBases * WILD.awayFromBases
          if (bases.some((b) => wrapDelta(b.x - x) ** 2 + wrapDelta(b.y - y) ** 2 < away)) continue
          const count = kind.herd[0] + Math.floor(next(s) * (kind.herd[1] - kind.herd[0] + 1))
          out.push({ id: cell * 2 + slot, kind: k, count, x, y, z: groundAt(world, x, y), up: false })
          break
        }
      }
    }
  return out
}

/** the moment a creature killed at UTC `t` is back: a turn of its group's own clock, at least WILD.away later */
export function wildBack(world: string, group: number, t: number) {
  let h = group * 7919 + 17
  for (let i = 0; i < world.length; i++) h = (Math.imul(h, 31) + world.charCodeAt(i)) | 0
  const phase = Math.abs(h) % WILD.turn
  return Math.ceil((t + WILD.away - phase) / WILD.turn) * WILD.turn + phase
}

/** true while a creature is killed and not yet back */
function gone(scene: SceneState, id: number) {
  const k = `${scene.worldKey}:${id}`
  const until = scene.wild.dead.get(k)
  if (until === undefined) return false
  if (nowOf(scene) >= until) {
    scene.wild.dead.delete(k)
    return false
  }
  return true
}

/** a group's creatures come out round its home (each where its own number puts it) */
function putUp(scene: SceneState, g: Group) {
  g.up = true
  const kind = CREATURES[g.kind]
  for (let i = 0; i < g.count; i++) {
    const id = g.id * 8 + i
    if (gone(scene, id)) continue
    const s = { r: seedOf(scene.worldKey) ^ Math.imul(id + 7, 0x85ebca6b) }
    let x = g.x
    let y = g.y
    if (kind.way !== 'lurk' || i > 0) {
      for (let tries = 0; tries < 6; tries++) {
        const a = next(s) * Math.PI * 2
        const r = (kind.way === 'lurk' ? 10 : 6) + next(s) * (kind.way === 'lurk' ? 22 : 26)
        const px = g.x + Math.cos(a) * r
        const py = g.y + Math.sin(a) * r
        if (groundFor(scene.world, kind, px, py, groundAt(scene.world, px, py)) >= 0) {
          x = px
          y = py
          break
        }
      }
    }
    scene.wild.up.push({
      id,
      group: g,
      kind,
      k: g.kind,
      x,
      y,
      z: groundAt(scene.world, x, y),
      yaw: next(s) * Math.PI * 2,
      vx: 0,
      vy: 0,
      health: kind.health,
      mode: GRAZE,
      t: 0,
      span: 1 + next(s) * 3,
      tx: x,
      ty: y,
      step: 0,
      hitAt: -99,
      kx: 0,
      ky: 0,
      rest: 0,
      angry: false,
      r: s.r,
      mine: false,
    })
  }
}

/** a group's creatures go back to sleep (only those still alive: the fallen finish falling) */
function putDown(scene: SceneState, g: Group) {
  g.up = false
  scene.wild.up = scene.wild.up.filter((c) => c.group !== g || c.mode === DEAD)
}

// ── the pilot, as the wildlife sees him

/** where the pilot on foot is, if he is on his feet (null: in his ship, coming down, dead) */
function prey(scene: SceneState) {
  const foot = scene.foot
  if (foot.stage !== WALKING || !foot.walker.fighter.alive) return null
  return foot.walker
}

/** true while the wildlife is about: the pilot is out of his ship on a world with groups */
export const wildOn = (scene: SceneState) => scene.zone.kind === 'surface' && scene.wild.groups.length > 0

// ── one step

/** none of a world's wildlife here (in space, and anywhere else a world's surface is not): all of it let go */
export function clearWild(scene: SceneState) {
  const wild = scene.wild
  if (!wild.world && !wild.up.length && !wild.loot.length && !wild.globs.length && !wild.ichor.length) return
  wild.world = ''
  wild.up = []
  wild.globs = []
  wild.loot = []
  wild.ichor = []
  wild.groups = []
}

export function stepWild(scene: SceneState, dt: number) {
  const wild = scene.wild
  // (the world's own life, as its own ships: there with the `locals` setting, for a pilot in the loop)
  const key = scene.zone.kind === 'surface' && scene.params.locals && looping(scene) ? scene.worldKey : ''
  if (key !== wild.world) {
    wild.world = key
    wild.up = []
    wild.globs = []
    wild.loot = []
    wild.ichor = []
    wild.groups = key ? placeWild(scene) : []
  }
  stepLoot(scene, dt)
  stepIchor(scene, dt)
  stepGlobs(scene, dt)
  if (!wild.groups.length) return
  // groups woken by the pilot on foot, and put to sleep away from him
  const foot = scene.foot
  const out = foot.stage !== ABOARD
  const me = foot.walker.jet
  for (const g of wild.groups) {
    const d = Math.hypot(wrapDelta(g.x - me.x), wrapDelta(g.y - me.y))
    if (!g.up) {
      if (out && d < WILD.wake) putUp(scene, g)
      continue
    }
    if (d < WILD.sleep) continue
    let near = false
    for (const c of wild.up)
      if (c.group === g && (c.mode === CHARGE || c.mode === BITE || Math.hypot(wrapDelta(c.x - me.x), wrapDelta(c.y - me.y)) < WILD.sleep))
        near = true
    if (!near) putDown(scene, g)
  }
  const p = prey(scene)
  for (let i = wild.up.length - 1; i >= 0; i--) {
    const c = wild.up[i]
    c.t += dt
    if (c.mode === DEAD) {
      if (c.t > 3) wild.up.splice(i, 1)
      continue
    }
    think(scene, c, p, dt)
    move(scene, c, dt)
  }
}

/** what a creature does next */
function think(scene: SceneState, c: Creature, p: ReturnType<typeof prey>, dt: number) {
  const k = c.kind
  c.rest -= dt
  let d = Infinity
  let dx = 0
  let dy = 0
  if (p) {
    dx = wrapDelta(p.jet.x - c.x)
    dy = wrapDelta(p.jet.y - c.y)
    d = Math.hypot(dx, dy)
  }
  // how near he must be to be noticed: further when he runs or has just fired; under the trees, only close
  const loud = p && (p.moving > 0.75 || scene.time - p.firedAt < 1.2) ? WILD.loud : 1
  const notice = p ? (p.hidden ? Math.min(k.notice, FOOT.hidden) : k.notice * loud) : 0
  const sees = d < notice || (c.angry && d < k.notice * 2.4)
  const home = Math.hypot(wrapDelta(c.group.x - c.x), wrapDelta(c.group.y - c.y))
  const fierce = k.way === 'hunt' || k.way === 'spit' || (k.way === 'guard' && sees) || (k.way === 'brute' && c.angry)

  // a bite winding up: it lands at the end, if he is still in reach
  if (c.mode === BITE) {
    if (c.t >= k.windup) {
      if (p && d < k.reach + 2.5) bite(scene, c, p, dx / Math.max(d, 1), dy / Math.max(d, 1))
      set(c, k.way === 'lurk' ? GRAZE : BACK, k.way === 'lurk' ? 0.6 : 0.5 + next(c) * 0.5)
      c.rest = k.rest
    }
    return
  }

  if (k.way === 'lurk') {
    // rooted: it snaps at him in reach, and that is all
    if (p && d < k.reach && c.rest <= 0) {
      set(c, BITE, 0)
      c.yaw = Math.atan2(dx, -dy)
      sound(scene, 'growl', c.x, c.y, c.z, 0.5, true, k.id)
    }
    return
  }

  if (!fierce) {
    // grazers and critters run, and so does the rare one until it is riled
    if (sees && (k.way === 'flee' || (k.way === 'brute' && d < k.notice * 0.6))) {
      if (k.way === 'brute') {
        rile(scene, c)
        return
      }
      if (c.mode !== FLEE) {
        flee(c, dx, dy, d)
        // (the rest of the herd runs too)
        for (const o of scene.wild.up)
          if (o.group === c.group && o !== c && o.mode !== FLEE && o.mode !== DEAD)
            flee(o, wrapDelta(p!.jet.x - o.x), wrapDelta(p!.jet.y - o.y), d)
      } else if (c.t > c.span && d < notice * 1.4) flee(c, dx, dy, d)
      return
    }
    if (c.mode === FLEE && c.t < c.span) return
    graze(c, home)
    return
  }

  // ── it fights: hunters, spitters, a crab on its patch, a riled brute
  if (!p || (!sees && c.mode !== CHARGE) || home > WILD.leash || (k.way === 'guard' && home > WILD.roam * 1.5)) {
    if (c.mode === STALK || c.mode === CHARGE || c.mode === BACK) set(c, HOME, 0)
    if (c.mode === HOME) {
      if (home < 12) {
        c.angry = false
        set(c, GRAZE, 1 + next(c) * 2)
      } else aim(c, c.group.x, c.group.y)
      return
    }
    graze(c, home)
    return
  }
  // (the first time it comes for him, it is heard)
  if (c.mode === GRAZE || c.mode === ROAM || c.mode === HOME) {
    sound(scene, 'growl', c.x, c.y, c.z, 0.8, true, k.id)
    set(c, k.way === 'spit' ? BACK : STALK, 0.6 + next(c) * 1.4)
  }
  if (k.way === 'spit') {
    // keeps between 50 and 95 px of him, and spits when it can
    c.yaw = Math.atan2(dx, -dy)
    if (d < 50) aim(c, c.x - dx, c.y - dy)
    else if (d > 95) aim(c, p.jet.x, p.jet.y)
    else {
      c.tx = c.x
      c.ty = c.y
    }
    if (c.rest <= 0 && d < 125) {
      c.rest = k.rest + next(c) * 0.6
      spit(scene, c, p)
    }
    return
  }
  // hunters: creep closer, then charge, bite, back off a moment, and come again; one of a group at a time (the others
  // circle him a little way off, waiting their turn, as a band's raiders do)
  if (c.mode === STALK) {
    const turn = !scene.wild.up.some((o) => o !== c && o.group === c.group && (o.mode === CHARGE || o.mode === BITE))
    if (!turn) {
      const a = Math.atan2(-dx, dy) + 0.9 * (c.id % 2 ? 1 : -1)
      aim(c, p.jet.x + Math.sin(a) * 40, p.jet.y - Math.cos(a) * 40)
      return
    }
    aim(c, p.jet.x, p.jet.y)
    if (c.t > c.span || d < 34) {
      set(c, CHARGE, 0)
      sound(scene, 'growl', c.x, c.y, c.z, 1, true, k.id)
    }
    return
  }
  if (c.mode === CHARGE) {
    // (it runs at where he is, turning only so fast: a dive to the side makes it miss)
    c.tx = p.jet.x
    c.ty = p.jet.y
    if (d < k.reach + 1 && c.rest <= 0) {
      set(c, BITE, 0)
      c.yaw = Math.atan2(dx, -dy)
    } else if (c.t > 2.6) set(c, BACK, 0.6)
    return
  }
  if (c.mode === BACK) {
    aim(c, c.x - dx * 0.6, c.y - dy * 0.6)
    if (c.t > c.span) set(c, CHARGE, 0)
    return
  }
  set(c, STALK, 0.6 + next(c))
}

/** into a mode, for a span of seconds */
function set(c: Creature, mode: number, span: number) {
  c.mode = mode
  c.t = 0
  c.span = span
}

/** heads for (x, y) */
function aim(c: Creature, x: number, y: number) {
  c.tx = x
  c.ty = y
}

/** standing about and wandering near its home */
function graze(c: Creature, home: number) {
  if (c.mode === FLEE || c.mode === STALK || c.mode === CHARGE || c.mode === BACK) set(c, HOME, 0)
  if (c.mode === HOME) {
    if (home < 14) set(c, GRAZE, 1 + next(c) * 3)
    else aim(c, c.group.x, c.group.y)
    return
  }
  if (c.mode === GRAZE) {
    c.tx = c.x
    c.ty = c.y
    if (c.t > c.span) {
      // off somewhere near its home
      const a = next(c) * Math.PI * 2
      const r = next(c) * WILD.roam
      set(c, ROAM, 3 + next(c) * 4)
      aim(c, c.group.x + Math.cos(a) * r, c.group.y + Math.sin(a) * r)
    }
    return
  }
  if (c.mode === ROAM && (c.t > c.span || Math.hypot(wrapDelta(c.tx - c.x), wrapDelta(c.ty - c.y)) < 3)) set(c, GRAZE, 1.5 + next(c) * 4)
}

/** runs from him, away and a little to one side */
function flee(c: Creature, dx: number, dy: number, d: number) {
  set(c, FLEE, WILD.fleeFor * (0.8 + next(c) * 0.5))
  const n = Math.max(1, d)
  const side = (next(c) - 0.5) * 1.2
  const ax = -dx / n
  const ay = -dy / n
  aim(c, c.x + (ax - ay * side) * 160, c.y + (ay + ax * side) * 160)
}

/** the rare beast (or anything that fights) is riled: it comes for him */
function rile(scene: SceneState, c: Creature) {
  if (c.angry && c.mode !== GRAZE && c.mode !== ROAM && c.mode !== HOME) return
  c.angry = true
  if (c.kind.way === 'flee') return
  set(c, c.kind.way === 'spit' ? BACK : STALK, 0.4 + next(c) * 0.6)
  sound(scene, 'growl', c.x, c.y, c.z, 1, true, c.kind.id)
}

/** the bite lands: it hurts him and throws him back */
function bite(scene: SceneState, c: Creature, p: NonNullable<ReturnType<typeof prey>>, ux: number, uy: number) {
  const k = c.kind
  harm(scene, p.fighter, k.bite, null, p.jet.x, p.jet.y, p.jet.z)
  p.jet.vx += ux * k.shove * 16
  p.jet.vy += uy * k.shove * 16
  addStar(scene, p.jet.x - ux * 2, p.jet.y - uy * 2, p.jet.z, 0.8, STAR_HIT)
  sound(scene, 'bite', p.jet.x, p.jet.y, p.jet.z, clamp(k.bite / 12, 0.3, 1), true, k.id)
}

/** a glob spat at him, leading him a little, in an arc */
function spit(scene: SceneState, c: Creature, p: NonNullable<ReturnType<typeof prey>>) {
  const k = c.kind
  const top = c.z + k.middle + 1
  const dx = wrapDelta(p.jet.x - c.x)
  const dy = wrapDelta(p.jet.y - c.y)
  const d = Math.hypot(dx, dy)
  const time = d / GLOB.speed
  const tx = dx + p.jet.vx * time * 0.5
  const ty = dy + p.jet.vy * time * 0.5
  const n = Math.max(1, Math.hypot(tx, ty))
  // (thrown up enough to come down on him: z = top + vz t − fall t² / 2 meets his middle at time t)
  const t = n / GLOB.speed
  const vz = (p.jet.z - top + 0.5 * GLOB.fall * t * t) / Math.max(0.1, t)
  scene.wild.globs.push({
    x: c.x,
    y: c.y,
    z: top,
    vx: (tx / n) * GLOB.speed,
    vy: (ty / n) * GLOB.speed,
    vz,
    born: scene.time,
    damage: k.bite,
    splat: -1,
  })
  c.yaw = Math.atan2(dx, -dy)
  sound(scene, 'spit', c.x, c.y, c.z, 0.8, true)
}

/** how fast a creature goes in its mode */
function paceOf(c: Creature) {
  const k = c.kind
  switch (c.mode) {
    case FLEE:
    case CHARGE:
      return k.run
    case STALK:
      return k.walk * 0.8
    case BACK:
      return k.way === 'spit' ? k.walk * 1.4 : k.walk * 1.2
    case HOME:
      return k.walk * 1.5
    case ROAM:
      return k.walk
    default:
      return 0
  }
}

/** it moves towards where it is going, over the ground it can cross (sliding along what stops it), knocked back when struck */
function move(scene: SceneState, c: Creature, dt: number) {
  const k = c.kind
  const world = scene.world
  let pace = paceOf(c)
  // (struck a moment ago: its charge stops)
  if (scene.time - c.hitAt < STRUCK.stagger) pace = 0
  const dx = wrapDelta(c.tx - c.x)
  const dy = wrapDelta(c.ty - c.y)
  const d = Math.hypot(dx, dy)
  let wx = 0
  let wy = 0
  if (pace > 0 && d > 1) {
    // it turns towards its way, quickly but not at once (a charge can be stepped out of)
    const want = Math.atan2(dx, -dy)
    const turn = c.mode === CHARGE ? 4 : 7
    c.yaw += clamp(wrapAngle(want - c.yaw), -turn * dt, turn * dt)
    const along = Math.max(0, Math.cos(wrapAngle(want - c.yaw)))
    wx = Math.sin(c.yaw) * pace * along
    wy = -Math.cos(c.yaw) * pace * along
  }
  const g = 1 - Math.exp(-dt * 10)
  c.vx += (wx - c.vx) * g
  c.vy += (wy - c.vy) * g
  const ease = Math.exp(-dt * 9)
  c.kx *= ease
  c.ky *= ease
  const mx = (c.vx + c.kx) * dt
  const my = (c.vy + c.ky) * dt
  if (Math.abs(mx) + Math.abs(my) < 1e-4) return
  let h = groundFor(world, k, c.x + mx, c.y + my, c.z)
  if (h >= 0) {
    c.x += mx
    c.y += my
  } else if ((h = groundFor(world, k, c.x + mx, c.y, c.z)) >= 0) c.x += mx
  else if ((h = groundFor(world, k, c.x, c.y + my, c.z)) >= 0) c.y += my
  else {
    // (stopped: a fleeing or roaming one picks another way)
    if (c.mode === ROAM || c.mode === FLEE) aim(c, c.x - dx, c.y - dy + (next(c) - 0.5) * 80)
    h = c.z
  }
  const R = scene.world.size
  c.x = ((c.x % R) + R) % R
  c.y = ((c.y % R) + R) % R
  c.z += clamp(h - c.z, -FOOT.climb * dt, FOOT.climb * dt)
  c.step += (Math.hypot(mx, my) / 3.5) * (k.way === 'flee' && k.id === 'skitter' ? 1.6 : 1)
}

// ── struck

/**
 * The first creature the path from (x0, y0, z0) along (mx, my, mz) passes within reach of, and how far along (0..1) it
 * does (before `before`): for the shots (guns.ts). Null: none.
 */
export function creatureOnPath(scene: SceneState, x0: number, y0: number, z0: number, mx: number, my: number, mz: number, before: number) {
  let best: Creature | null = null
  let bestU = before
  const uu = mx * mx + my * my + mz * mz
  if (uu <= 0) return null
  for (const c of scene.wild.up) {
    if (c.mode === DEAD) continue
    const px = wrapDelta(c.x - x0)
    const py = wrapDelta(c.y - y0)
    const pz = c.z + c.kind.middle - z0
    const u = clamp((px * mx + py * my + pz * mz) / uu, 0, 1)
    const cx = px - mx * u
    const cy = py - my * u
    // (a little taller than wide: a shot over its back still clips it)
    const cz = (pz - mz * u) * 0.7
    if (cx * cx + cy * cy + cz * cz < c.kind.radius * c.kind.radius && u < bestU) {
      best = c
      bestU = u
    }
  }
  return best ? { c: best, u: bestU } : null
}

/** a shot strikes a creature at (x, y, z), going (ux, uy): it is hurt, flashes, is knocked back and bleeds a little */
export function strikeCreature(
  scene: SceneState,
  c: Creature,
  amount: number,
  by: Fighter | null,
  x: number,
  y: number,
  z: number,
  ux: number,
  uy: number,
) {
  if (c.mode === DEAD || amount <= 0) return
  const k = c.kind
  c.health -= amount
  c.hitAt = scene.time
  const push = (90 * Math.min(1, amount / 9)) / Math.max(0.5, k.mass)
  if (k.way !== 'lurk') {
    c.kx += ux * push
    c.ky += uy * push
  }
  addStar(scene, x, y, z, 0.7, STAR_HIT)
  const own = !!by && (by === scene.foot.walker.fighter || by.kind === LEADER)
  bleed(scene, c, x, y, z, ux, uy, 2)
  sound(scene, 'hit', x, y, z, clamp(amount / 20, 0.2, 0.7), own)
  if (c.health <= 0) {
    killed(scene, c, own)
    return
  }
  // shot: a grazer runs; anything that fights comes for him
  const p = prey(scene)
  if (k.way === 'flee') {
    if (p) {
      const dx = wrapDelta(p.jet.x - c.x)
      const dy = wrapDelta(p.jet.y - c.y)
      flee(c, dx, dy, Math.hypot(dx, dy))
      for (const o of scene.wild.up)
        if (o.group === c.group && o !== c && o.mode !== DEAD && o.mode !== FLEE)
          flee(o, wrapDelta(p.jet.x - o.x), wrapDelta(p.jet.y - o.y), 50)
    }
  } else if (k.way !== 'lurk') {
    rile(scene, c)
    if (c.mode === STALK) set(c, CHARGE, 0)
  }
}

/** a few drops of its ichor thrown out the way the shot went */
function bleed(scene: SceneState, c: Creature, x: number, y: number, z: number, ux: number, uy: number, n: number) {
  for (let i = 0; i < n; i++) {
    const a = (next(c) - 0.5) * 1.6
    const s = 18 + next(c) * 30
    const vx = (ux * Math.cos(a) - uy * Math.sin(a)) * s
    const vy = (uy * Math.cos(a) + ux * Math.sin(a)) * s
    scene.wild.ichor.push({ x, y, z, vx, vy, vz: 20 + next(c) * 30, born: scene.time, k: c.k, down: false })
  }
  if (scene.wild.ichor.length > 80) scene.wild.ichor.splice(0, scene.wild.ichor.length - 80)
}

/** killed: it falls, it is gone in every game until its clock turns, and what it drops is left where it fell */
function killed(scene: SceneState, c: Creature, own: boolean) {
  set(c, DEAD, 0)
  c.mine = own
  c.vx = 0
  c.vy = 0
  const until = wildBack(scene.worldKey, c.group.id, nowOf(scene))
  scene.wild.dead.set(`${scene.worldKey}:${c.id}`, until)
  report(scene, { kind: 'beast', id: c.id, until })
  bleed(scene, c, c.x, c.y, c.z + c.kind.middle, Math.sin(c.yaw), -Math.cos(c.yaw), 5)
  sound(scene, 'beastDown', c.x, c.y, c.z, clamp(c.kind.health / 100, 0.3, 1), own, c.kind.id)
  if (own) {
    dropFrom(scene, c)
    if (c.kind.way === 'brute') news(scene, `${c.kind.name.toUpperCase()} DOWN`, 'A RARE BEAST: TAKE WHAT IT DROPPED')
  }
}

/** what a creature drops: each of its drops by its chance, thrown out round where it fell */
function dropFrom(scene: SceneState, c: Creature) {
  const list: { item: ResourceId | 'credits'; n: number }[] = []
  for (const d of c.kind.drops as Drop[]) {
    if (next(c) >= d.chance) continue
    list.push({ item: d.id, n: d.n[0] + Math.floor(next(c) * (d.n[1] - d.n[0] + 1)) })
  }
  list.forEach((d, i) => {
    const a = (i / Math.max(1, list.length)) * Math.PI * 2 + next(c) * 0.8
    const s = 14 + next(c) * 16
    scene.wild.loot.push({
      x: c.x,
      y: c.y,
      z: c.z + c.kind.middle,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      vz: 26 + next(c) * 14,
      item: d.item,
      n: d.n,
      born: scene.time,
      rare: d.item !== 'credits' && RESOURCES[d.item].rare,
      tag: scene.wild.tag++,
    })
  })
}

/** another game's pilot killed creature `id` here: it is gone until `until` (seconds since 1970) */
export function beastKilled(scene: SceneState, id: number, until: number) {
  const k = `${scene.worldKey}:${id}`
  scene.wild.dead.set(k, Math.max(scene.wild.dead.get(k) ?? 0, until))
  const c = scene.wild.up.find((x) => x.id === id && x.mode !== DEAD)
  if (c) {
    set(c, DEAD, 0)
    c.mine = false
  }
}

// ── globs, ichor, and what was dropped

function stepGlobs(scene: SceneState, dt: number) {
  const list = scene.wild.globs
  const p = prey(scene)
  for (let i = list.length - 1; i >= 0; i--) {
    const g = list[i]
    if (g.splat >= 0) {
      if (scene.time - g.splat > 0.6) list.splice(i, 1)
      continue
    }
    g.vz -= GLOB.fall * dt
    g.x += g.vx * dt
    g.y += g.vy * dt
    g.z += g.vz * dt
    // (a dive takes him under it)
    if (p && p.dive < 0) {
      const dx = wrapDelta(p.jet.x - g.x)
      const dy = wrapDelta(p.jet.y - g.y)
      if (dx * dx + dy * dy < GLOB.hit * GLOB.hit && Math.abs(p.jet.z - g.z) < GLOB.hit + 1) {
        harm(scene, p.fighter, g.damage, null, p.jet.x, p.jet.y, p.jet.z)
        sound(scene, 'bite', p.jet.x, p.jet.y, p.jet.z, 0.6, true, 'spitter')
        g.splat = scene.time
        continue
      }
    }
    const ground = groundAt(scene.world, g.x, g.y)
    if (g.z <= ground || scene.time - g.born > GLOB.life) {
      g.z = Math.max(g.z, ground)
      g.splat = scene.time
    }
  }
}

function stepIchor(scene: SceneState, dt: number) {
  const list = scene.wild.ichor
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i]
    if (scene.time - b.born > 2.4) {
      list.splice(i, 1)
      continue
    }
    if (b.down) continue
    b.vz -= 160 * dt
    b.x += b.vx * dt
    b.y += b.vy * dt
    b.z += b.vz * dt
    const g = groundAt(scene.world, b.x, b.y)
    if (b.z <= g) {
      b.z = g
      b.down = true
    }
  }
}

/** what was dropped: thrown out, it lands and lies; the pilot walking over it takes it (into his backpack; credits to his wallet) */
function stepLoot(scene: SceneState, dt: number) {
  const list = scene.wild.loot
  const p = prey(scene)
  for (let i = list.length - 1; i >= 0; i--) {
    const l = list[i]
    const age = scene.time - l.born
    if (age > LOOT.life) {
      list.splice(i, 1)
      continue
    }
    const g = groundAt(scene.world, l.x, l.y)
    if (l.z > g || l.vz > 0) {
      l.vz -= 140 * dt
      l.x += l.vx * dt
      l.y += l.vy * dt
      l.z += l.vz * dt
      if (l.z <= g) {
        l.z = g
        // (a little bounce, then still)
        l.vz = l.vz < -30 ? -l.vz * 0.3 : 0
        l.vx *= 0.4
        l.vy *= 0.4
      }
      continue
    }
    if (!p || age < 0.5) continue
    const dx = wrapDelta(l.x - p.jet.x)
    const dy = wrapDelta(l.y - p.jet.y)
    if (dx * dx + dy * dy > LOOT.pick * LOOT.pick) continue
    if (l.item === 'credits') {
      record(scene, { kind: 'bounty', credits: l.n, what: 'hunting' })
      news(scene, `+${l.n} CR`, '')
      sound(scene, 'loot', l.x, l.y, l.z, 0.6, true, 'credits')
      list.splice(i, 1)
      continue
    }
    const took = addTo(scene.foot.pack, l.item, l.n)
    if (took <= 0) {
      if (scene.time - scene.wild.fullAt > 6) {
        scene.wild.fullAt = scene.time
        news(scene, 'PACK FULL', 'CLIMB ABOARD TO EMPTY IT', false)
      }
      continue
    }
    record(scene, { kind: 'picked', items: [{ id: l.item, n: took }], world: scene.worldKey })
    const name = RESOURCES[l.item].name.toUpperCase()
    news(scene, l.rare ? `${name}!` : `+${took} ${name}`, l.rare ? `A RARE FIND  +${took}` : '')
    sound(scene, 'loot', l.x, l.y, l.z, l.rare ? 1 : 0.6, true, l.rare ? 'rare' : '')
    l.n -= took
    if (l.n <= 0) list.splice(i, 1)
  }
}

// ── for the sidearm's aim, the HUD and the page

/** the living creature most nearly in line with a way (ax, ay) from (x, y), within `range` px and `within` radians (null: none) */
export function creatureInSights(scene: SceneState, x: number, y: number, ax: number, ay: number, range: number, within: number) {
  let best: Creature | null = null
  let bestOff = within
  const heading = Math.atan2(ax, -ay)
  for (const c of scene.wild.up) {
    if (c.mode === DEAD) continue
    const dx = wrapDelta(c.x - x)
    const dy = wrapDelta(c.y - y)
    const d = Math.hypot(dx, dy)
    if (d > range || d < 1) continue
    const off = Math.abs(wrapAngle(Math.atan2(dx, -dy) - heading))
    if (off < bestOff) {
      bestOff = off
      best = c
    }
  }
  return best ? { c: best, off: bestOff } : null
}

/** the wildlife here, for the tools and tests: how many are up and of what kinds, the groups, each creature, what lies dropped */
export function wildCount(scene: SceneState) {
  const by: Record<string, number> = {}
  const live = scene.wild.up.filter((c) => c.mode !== DEAD)
  for (const c of live) by[c.kind.id] = (by[c.kind.id] ?? 0) + 1
  return {
    up: live.length,
    groups: scene.wild.groups.length,
    by,
    loot: scene.wild.loot.length,
    creatures: live.map((c) => ({ id: c.id, kind: c.kind.id, x: c.x, y: c.y, health: c.health, mode: c.mode })),
    homes: scene.wild.groups.map((g) => ({ id: g.id, kind: CREATURES[g.kind].id, x: g.x, y: g.y, count: g.count })),
    drops: scene.wild.loot.map((l) => ({ item: l.item, n: l.n, x: l.x, y: l.y, rare: l.rare })),
    globs: scene.wild.globs.filter((g) => g.splat < 0).map((g) => ({ x: g.x, y: g.y, z: g.z })),
  }
}

/** the item ids a pilot can find on creatures */
export const WILD_ITEMS = ['hide', 'chitin', 'gland', 'heartstone'] as const
