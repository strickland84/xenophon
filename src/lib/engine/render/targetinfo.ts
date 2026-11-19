// What the target is, in words and numbers, once for every view (docs/targeting.md, "What it says"): the HUD's brackets
// and card (render/targethud.ts) and the cockpit's screen (render/cockpit/screens.ts) say the same things from this.
//
// A ship: its pilot's callsign, or what the computer's ship is (RAIDER, PATROL, HAULER, DRONE); its hull; whose it is; its
// hull and shield. A body: its name, what it is, and what matters about it (who holds a world, how dangerous it is, a sun's
// heat, where a gate or a ring leads). A base or a place on the ground: its name, what it is, whose.

import type { SceneState } from '../state'
import { theGalaxy } from '../galaxy/galaxy'
import { ARCHETYPE_NAMES } from '../galaxy/recipe'
import { systemDanger, worldDanger } from '../galaxy/danger'
import { DANGER_NAMES } from '../data/bands'
import { hostile } from '../sim/combat'
import { ownFighter } from '../sim/combat'
import { gateTo, linkedHole } from '../sim/space'
import { stationBase } from '../sim/stations'
import { friendly } from '../sim/loop'
import { ownerOf } from '../sim/traces'
import { targetNow } from '../sim/target'
import type { TargetNow, TargetRef } from '../sim/target'
import type { Side } from '../galaxy/galaxy'

/** a friend, an enemy, or neither (a body, a hauler, a place) */
export type Relation = 'friend' | 'enemy' | 'neutral'

export interface TargetInfo {
  /** where it is now */
  now: TargetNow
  /** its first line (a callsign, a name), and what it is */
  name: string
  what: string
  /** a line or two more, each with how it is to be coloured (0 plain, 1 good, 2 a warning, 3 danger) */
  more: { words: string; tone: number }[]
  rel: Relation
  /** whose it is and what it is to the pilot, in a line under its name: NOMARCHY · FRIENDLY, ANARCHOI · HOSTILE, NEUTRAL ('': a
   * thing nobody holds, a sun, a gate) */
  stance: string
  /** whose it is: '' nobody's, or a side's */
  side: '' | 'nomarchy' | 'anarchoi'
  /** 0..1 its hull and shield (−1: it has none to tell) */
  hull: number
  shield: number
  /** the player's seeker on it, 0..1 */
  lock: number
  /** px to it (to its surface) */
  d: number
  /** a ship from above, for a silhouette (null: not a ship) */
  top: { w: number; h: number; cells: Uint8Array } | null
  /** a body drawn as a disc: its kind (for its colour) and whether it is lit (null: not a body) */
  disc: string | null
}

/** what the status says of the target, for the page (its sounds, its tips) */
export interface TargetStatus {
  kind: TargetRef['kind']
  name: string
  what: string
  rel: Relation
}

const STAR_NAMES: Record<string, string> = {
  red: 'RED DWARF',
  orange: 'ORANGE STAR',
  yellow: 'YELLOW STAR',
  white: 'WHITE STAR',
  blue: 'BLUE GIANT',
}

const holdersOf = (scene: SceneState) => (scene.traces.known ? scene.traces.holders : {})
const markSide = (mark: number): TargetInfo['side'] => (mark === 1 ? 'nomarchy' : mark === 2 ? 'anarchoi' : '')

/** how dangerous a world or a system is for this pilot, as a line */
function dangerLine(level: number) {
  return { words: level ? `DANGER ${DANGER_NAMES[level].toUpperCase()}` : 'SAFE', tone: level >= 3 ? 3 : level >= 2 ? 2 : level ? 2 : 1 }
}

const REL_WORDS: Record<Relation, string> = { friend: 'FRIENDLY', enemy: 'HOSTILE', neutral: 'NEUTRAL' }

/** the target in words, now (null: nothing picked, or it is gone) */
export function targetInfo(scene: SceneState): TargetInfo | null {
  const info = describe(scene)
  if (!info) return null
  // (bodies nobody can hold have no stance; a world nobody holds is unclaimed)
  if (info.stance !== '-') {
    const side = info.side === 'nomarchy' ? 'NOMARCHY' : info.side === 'anarchoi' ? 'ANARCHOI' : ''
    info.stance = info.stance || (side ? `${side} · ${REL_WORDS[info.rel]}` : REL_WORDS[info.rel])
  } else info.stance = ''
  return info
}

function describe(scene: SceneState): TargetInfo | null {
  const on = scene.target.on
  if (!on) return null
  const t = targetNow(scene, on)
  if (!t) return null
  const info: TargetInfo = {
    now: t,
    name: '',
    what: '',
    more: [],
    rel: 'neutral',
    stance: '',
    side: '',
    hull: -1,
    shield: -1,
    lock: 0,
    d: t.d,
    top: null,
    disc: null,
  }
  const g = theGalaxy()
  const mySide = scene.params.side as Side | ''

  // ── a ship
  if (t.jet) {
    const f = t.fighter
    const own = ownFighter(scene)
    if (f) {
      info.hull = Math.max(0, f.hull / Math.max(1, f.stats.hull))
      info.shield = f.stats.shield > 0 ? Math.max(0, f.shield / f.stats.shield) : -1
      info.rel = hostile(f) ? (f.side >= 0 ? 'enemy' : 'neutral') : 'friend'
      if (own && own.seeker === f && own.missiles > 0) info.lock = own.lock
    }
    const s = t.ship
    if (s) {
      info.top = s.mesh.top
      info.what = s.mesh.model.name.toUpperCase()
      if (!f) info.rel = s.side === 0 ? 'friend' : s.side === 1 ? 'enemy' : 'neutral'
      const plan = s.band >= 0 ? scene.bands.plans.find((p) => p.id === s.band) : undefined
      info.side = (plan?.faction || s.faction || markSide(s.mark)) as TargetInfo['side']
      if (s.drill) info.name = 'TRAINING DRONE'
      else if (s.traffic) info.name = 'HAULER'
      else if (plan?.kind === 'raiders') info.name = 'RAIDER'
      else if (plan?.kind === 'drones') info.name = 'DRONE'
      else if (plan?.kind === 'patrol' || s.faction) info.name = 'PATROL'
      else if (s.label) info.name = s.label
      else if (s.wave > 0) info.name = 'RAIDER'
      else info.name = 'CONTACT'
      // (a hauler is no one's to fight, but one of his own side's is a friend's)
      if (s.traffic && info.side && mySide) info.rel = info.side === mySide ? 'friend' : 'neutral'
      if (s.parked) info.more.push({ words: 'PARKED', tone: 0 })
      if (s.loaded > 0.5) info.more.push({ words: 'HOLD LOADED', tone: 2 })
      if (f && own && f.seeker === own && f.lock > 0.3) info.more.push({ words: 'LOCKED ON YOU', tone: 3 })
    } else {
      // (a wingman)
      info.name = on.kind === 'wing' ? `WING ${on.n}` : 'WINGMAN'
      info.what = scene.mesh.model.name.toUpperCase()
      info.top = scene.mesh.top
      info.rel = 'friend'
      info.side = mySide
    }
    return info
  }

  // ── a body of the system
  if (t.body) {
    const b = t.body.body
    info.name = b.name.toUpperCase()
    info.disc = b.kind
    if (b.kind === 'planet' || b.kind === 'moon') {
      const w = g.worlds[b.world]
      if (w) {
        const kind = ARCHETYPE_NAMES[w.recipe.archetype].toUpperCase()
        info.what = w.recipe.archetype === 'moon' ? kind : b.kind === 'moon' ? `${kind} MOON` : `${kind} WORLD`
        const holder = holdersOf(scene)[w.id] ?? ''
        if (w.habitable) {
          info.side = (holder === 'nomarchy' || holder === 'anarchoi' ? holder : '') as TargetInfo['side']
          if (!info.side) info.stance = 'UNCLAIMED'
          info.rel = !info.side || !mySide ? 'neutral' : info.side === mySide ? 'friend' : 'enemy'
        } else info.stance = '-'
        if (mySide) info.more.push(dangerLine(worldDanger(w.id, mySide, holdersOf(scene)).level))
      } else info.what = b.kind === 'moon' ? 'MOON' : 'WORLD'
    } else if (b.kind === 'sun') {
      info.stance = '-'
      info.what = STAR_NAMES[b.star ?? 'yellow'] ?? 'STAR'
      info.more.push({ words: 'KEEP CLEAR: HEAT', tone: 2 })
    } else if (b.kind === 'giant') {
      info.stance = '-'
      info.what = 'GAS GIANT'
      info.more.push({ words: 'HELION IN ITS BANDS', tone: 1 })
    } else if (b.kind === 'black hole') {
      info.stance = '-'
      info.what = 'BLACK HOLE'
      const to = linkedHole(b)
      if (to) info.more.push({ words: `RING TO ${g.systems[to.system].name.toUpperCase()}`, tone: 0 })
      info.more.push({ words: 'HORIZON: DEATH', tone: 3 })
    } else if (b.kind === 'gate') {
      const to = gateTo(b)
      info.stance = '-'
      info.what = 'JUMP GATE'
      if (to) {
        info.name = `GATE TO ${g.systems[to.system].name.toUpperCase()}`
        if (mySide) info.more.push(dangerLine(systemDanger(to.system, mySide, holdersOf(scene)).level))
      }
    } else if (b.kind === 'base') {
      if (b.role === 'derelict') {
        info.what = 'DERELICT'
        info.more.push({ words: 'DRONES ABOARD', tone: 3 })
        info.rel = 'enemy'
      } else {
        const base = stationBase(scene, t.body)
        const owner = ownerOf(scene, base)
        info.side = (owner ?? '') as TargetInfo['side']
        info.what = b.role === 'capital' ? 'CAPITAL STATION' : 'STATION'
        const mine = friendly(scene, base)
        info.rel = owner ? (mine ? 'friend' : 'enemy') : 'neutral'
        info.more.push(mine ? { words: 'DOCKING OPEN', tone: 1 } : { words: 'HOSTILE GUNS', tone: 3 })
      }
    }
    return info
  }

  // ── on the ground: a base, a place
  if (t.base) {
    const b = t.base
    info.name = b.name.toUpperCase()
    info.what = b.capital ? 'CAPITAL' : 'OUTPOST'
    const owner = ownerOf(scene, b)
    info.side = (owner ?? '') as TargetInfo['side']
    const mine = friendly(scene, b)
    info.rel = owner ? (mine ? 'friend' : 'enemy') : 'neutral'
    info.more.push(mine ? { words: 'PADS OPEN', tone: 1 } : { words: 'HOSTILE GUNS', tone: 3 })
    return info
  }
  if (t.place) {
    info.name = t.place.name.toUpperCase()
    info.what = t.place.kind.toUpperCase()
    info.stance = '-'
  }
  return info
}

/** the target as the page hears of it */
export function targetStatus(scene: SceneState): TargetStatus | null {
  const i = targetInfo(scene)
  return i && scene.target.on ? { kind: scene.target.on.kind, name: i.name, what: i.what, rel: i.rel } : null
}

/** how far, as the HUD writes it: 840, 12K */
export const distanceWords = (d: number) => (d > 9999 ? `${(d / 1000).toFixed(0)}K` : `${Math.round(d)}`)
