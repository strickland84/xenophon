// The skirmish: waves of enemy ships come for the player, each a little larger and better
// flown than the last. Shooting them down scores points, more for kills in quick succession;
// clearing a wave scores more. The player has a few ships: losing the last ends the
// skirmish, and once the score has been seen a new one begins.
//
// It is the old dogfight, and it is not the game: waves come only to a pilot with no side, over
// the island world of the settings (`skirmishOn`). In the galaxy the computer's ships belong to
// places (bands.ts), and nothing comes at a pilot from nowhere. What is kept here for everyone is
// the tally of kills, the points rising from each, and what a kill pays in the loop.
//
// In a shared sky (room.ts) the waves are the room's: the game that hosts the computer's ships
// sends them, and they go for every pilot there, a few at each. Elsewhere the wave number is
// the host's. There is no last ship in a shared sky: a pilot shot down always gets another.

import { PACE, SCORE, waveOf } from '../data/skirmish'
import { SPACE_Z } from '../data/space'
import { REWARD } from '../data/loop'
import { fillOf } from './cargo'
import { looping, record } from './loop'
import type { SceneState } from '../state'
import { createFighter, LEADER, PARKED, playerFighter, SHIP, SIDE_ENEMY, SIDE_PLAYER, SIDE_RIVAL, WALKER, WINGMAN } from './combat'
import { FOOT_REWARD } from '../data/foot'
import { WALKING } from './foot'
import type { Fighter } from './combat'
import { sound } from './effects'
import { EJ_FLY, focus } from './ejection'
import { INTRO_TIME } from './flight'
import { ATTACK, chance, createBrain, HUNT, LEAVE } from './pilots'
import { createShip } from './ships'
import { deed } from './traces'

// how the skirmish stands
export const REST = 0 // between waves
export const FIGHT = 1 // a wave is in the air
export const OVER = 2 // the last ship is lost

/** the enemy's colours: dark red hulls with yellow markings, so they are told apart at a glance */
export const ENEMY_PAINT = { body: '#5e2a2e', accent: '#ffc83a', canopy: '#e8503a' }

export interface Skirmish {
  stage: number
  /** the wave that is in the air, or coming next */
  wave: number
  /** seconds left of a rest, or of the score shown after the end */
  timer: number
  score: number
  /** the best score since the page was opened */
  best: number
  /** ships the player has left, the one he is flying included */
  ships: number
  kills: number
  /** kills in quick succession, and seconds since the last */
  chain: number
  chainT: number
  /** the big line of text in the middle of the frame, and seconds since it was put up */
  banner: string
  bannerT: number
  /** points that rise from a kill for a moment: where, when, how many (and in the loop, the credits it paid) */
  popups: { x: number; y: number; z: number; t: number; points: number; credits: number }[]
  /** seconds until the attackers are chosen again */
  turns: number
  /** chance numbers, for where the next wave comes from */
  rng: number
}

export function createSkirmish(): Skirmish {
  return {
    stage: REST,
    wave: 1,
    timer: PACE.rest,
    score: 0,
    best: 0,
    ships: SCORE.ships,
    kills: 0,
    chain: 0,
    chainT: 99,
    banner: '',
    bannerT: 99,
    popups: [],
    turns: 0,
    rng: 7919,
  }
}

function banner(k: Skirmish, text: string) {
  k.banner = text
  k.bannerT = 0
}

/** true while waves come: the skirmish is on, and the pilot is not in the galaxy's loop (where enemies belong to places) */
export const skirmishOn = (scene: SceneState) => scene.params.skirmish && !looping(scene)

/** a kill: points for the player's side, or a ship lost for the player */
export function scoreKill(scene: SceneState, victim: Fighter, by: Fighter | null) {
  const k = scene.skirmish
  // (the player's own ship lost where it stood, or the player killed on foot: nothing scored, nothing counted)
  if (victim.kind === PARKED || (victim.kind === WALKER && victim.side === SIDE_PLAYER)) {
    k.chain = 0
    return
  }
  if (victim.kind === LEADER) {
    k.chain = 0
    if (skirmishOn(scene) && k.stage !== OVER && !scene.room.shared) {
      k.ships = Math.max(0, k.ships - 1)
      if (k.ships === 0) {
        k.stage = OVER
        k.timer = PACE.over
        k.best = Math.max(k.best, k.score)
        banner(k, 'GAME OVER')
        sound(scene, 'over', victim.jet.x, victim.jet.y, victim.jet.z, 1, true)
        // the enemy go home
        for (const f of scene.fighters) if (f.side === SIDE_ENEMY && f.brain) f.brain.mode = LEAVE
      }
    }
    return
  }
  // (the player's kills, and his wingmen's; not those of another player on his side)
  // (the player himself, in his ship or on foot)
  const mine = by?.kind === LEADER || (by?.kind === WALKER && by === scene.foot.walker.fighter)
  if (victim.side === SIDE_PLAYER || !by || by.side !== SIDE_PLAYER || (!mine && by.kind !== WINGMAN)) return
  let points = Math.max(1, Math.round(victim.stats.score * victim.worth))
  if (mine) {
    k.chain = k.chainT < SCORE.chain ? Math.min(SCORE.chainMost, k.chain + 1) : 1
    k.chainT = 0
    points *= k.chain
    sound(scene, 'kill', victim.jet.x, victim.jet.y, victim.jet.z, k.chain / SCORE.chainMost, true)
  }
  k.kills++
  // (a training drone: scored, and that is all: nothing paid, nothing the galaxy remembers)
  if (victim.drill) {
    if (k.stage === OVER) return
    k.score += points
    k.popups.push({ x: victim.jet.x, y: victim.jet.y, z: victim.jet.z, t: 0, points, credits: 0 })
    if (k.popups.length > 8) k.popups.shift()
    return
  }
  // (another player's ship: not a patrol of the other side, which the computer flies)
  const pilot = victim.side === SIDE_RIVAL && victim.band < 0
  // (the player's own kill, on or over a world: influence there for his side; the page decides: traces.ts)
  if (mine && scene.params.side) {
    const j = victim.jet
    deed(scene, { kind: 'kill', x: j.x, y: j.y, z: j.z, n: pilot ? 1 : 0 })
  }
  // in the loop, a kill pays: a raider or a patrol by its hull, more where the danger is (`pay`), another pilot more (less each time, the farming limit: `worth`)
  let credits = 0
  if (looping(scene)) {
    const onFoot = victim.kind === WALKER
    credits = Math.max(
      1,
      Math.round(
        onFoot
          ? FOOT_REWARD * victim.worth
          : pilot
            ? REWARD.pilot * victim.worth
            : victim.stats.score * REWARD.raider * victim.worth * victim.pay,
      ),
    )
    record(scene, {
      kind: 'bounty',
      credits,
      what: onFoot ? 'pilot on foot' : pilot ? 'pilot' : victim.band >= 0 && victim.side !== SIDE_ENEMY ? 'patrol' : victim.mesh.model.name,
    })
  }
  if (k.stage === OVER) return
  k.score += points
  const j = victim.jet
  k.popups.push({ x: j.x, y: j.y, z: j.z, t: 0, points, credits })
  if (k.popups.length > 8) k.popups.shift()
}

/** a wave arrives: its ships come in together from somewhere ahead of the player */
function sendWave(scene: SceneState) {
  const k = scene.skirmish
  const wave = waveOf(k.wave)
  const lead = focus(scene)
  const from = lead.yaw + (chance(k) * 2 - 1) * 1.1
  const cx = lead.x + Math.sin(from) * PACE.arrive
  const cy = lead.y - Math.cos(from) * PACE.arrive
  const heading = from + Math.PI
  wave.ships.forEach((hull, i) => {
    // a loose arrowhead, spread across and back
    const row = Math.ceil(i / 2)
    const across = (i % 2 === 0 ? 1 : -1) * row * 46
    const back = row * 40
    const x = cx + Math.cos(heading) * across - Math.sin(heading) * back
    const y = cy + Math.sin(heading) * across + Math.cos(heading) * back
    const id = scene.nextShip++
    const ship = createShip(scene, id, {
      x,
      y,
      height: scene.zone.kind === 'space' ? SPACE_Z : Math.max(40, lead.z + (chance(k) - 0.5) * 50),
      heading,
      hull,
      speed: scene.params.speed,
      paint: ENEMY_PAINT,
    })
    ship.wave = k.wave
    const f = createFighter(SHIP, SIDE_ENEMY, ship.jet, ship.mesh, ship.paint)
    if (!wave.skill.missiles) f.missiles = 0
    const b = (f.brain = createBrain(wave.skill, (k.wave * 977 + i * 131 + scene.nextShip * 7) | 0))
    b.wantYaw = heading
    b.wantAlt = ship.jet.z
    b.side = i % 2 === 0 ? 1 : -1
    scene.ships.push(ship)
  })
  k.stage = FIGHT
  // a full rack of missiles for each wave (in the loop, missiles are bought at a base)
  const own = playerFighter(scene)
  if (own && !looping(scene)) own.missiles = own.stats.missiles
  banner(k, `WAVE ${k.wave}`)
  sound(scene, 'wave', lead.x, lead.y, lead.z, 1, true)
}

/** the pilots in the sky the computer's ships go for: the player (0), and in a shared sky everyone else's ships (by id) */
function pilotsAbout(scene: SceneState) {
  const list: { id: number; x: number; y: number; loaded: number }[] = []
  const lead = focus(scene)
  list.push({ id: 0, x: lead.x, y: lead.y, loaded: fillOf(scene.loop.hold) })
  for (const s of scene.ships) {
    const f = s.jet.fighter
    if (f && f.alive && f.remote && f.side !== SIDE_ENEMY && !s.parked) list.push({ id: s.id, x: s.jet.x, y: s.jet.y, loaded: s.loaded })
  }
  // (and other pilots on foot: strafed like anyone)
  for (const w of scene.walkers) if (w.fighter.alive && w.stage === WALKING) list.push({ id: w.id, x: w.jet.x, y: w.jet.y, loaded: 0 })
  return list
}

/** the few enemy pilots nearest each pilot take their turn to attack him; the rest wait theirs, near him */
function chooseAttackers(scene: SceneState) {
  const k = scene.skirmish
  // (a loaded ship draws one more of them in)
  const most = waveOf(k.wave).attackers + (looping(scene) && fillOf(scene.loop.hold) > 0.4 ? 1 : 0)
  const pilots = pilotsAbout(scene)
  const ranked: Fighter[] = []
  const nearest = new Map<Fighter, number>()
  for (const f of scene.fighters) {
    // (a training drone never goes for anyone)
    if (f.side !== SIDE_ENEMY || !f.brain || f.brain.mode === LEAVE || f.remote || f.drill) continue
    f.brain.attacker = false
    // each goes for the pilot nearest it (a loaded one seems nearer: they want his cargo)
    let best = Infinity
    for (const p of pilots) {
      const d = Math.hypot(f.jet.x - p.x, f.jet.y - p.y) / (1 + 2 * p.loaded)
      if (d < best) {
        best = d
        f.brain.pilot = p.id
      }
    }
    nearest.set(f, best)
    ranked.push(f)
  }
  ranked.sort((a, b) => nearest.get(a)! - nearest.get(b)!)
  // the last two of a wave press home: no more circling at a distance, no running away
  const last = ranked.length <= 2
  for (const f of ranked) if (last) f.brain!.ranAway = 2
  for (const p of pilots) {
    let given = last ? -2 : 0
    for (const f of ranked) {
      if (given >= most) break
      const b = f.brain!
      if (b.pilot !== p.id) continue
      if (b.mode === HUNT || b.mode === ATTACK) {
        b.attacker = true
        given++
      }
    }
  }
}

export function stepSkirmish(scene: SceneState, dt: number) {
  const k = scene.skirmish
  k.chainT += dt
  k.bannerT += dt
  for (const p of k.popups) p.t += dt
  while (k.popups.length && k.popups[0].t > 1.4) k.popups.shift()
  // the ships that went home are gone once they are far enough away
  const lead = focus(scene)
  for (let i = scene.ships.length - 1; i >= 0; i--) {
    const f = scene.ships[i].jet.fighter
    if (f?.brain?.mode === LEAVE && Math.hypot(f.jet.x - lead.x, f.jet.y - lead.y) > 760) scene.ships.splice(i, 1)
  }
  if (!skirmishOn(scene) || scene.introT < INTRO_TIME) return
  // in a shared sky another game hosts the waves: only their number is kept here (Scene.setRoom)
  if (scene.room.shared && !scene.room.host) return
  k.turns -= dt
  if (k.turns <= 0) {
    k.turns = 0.5
    chooseAttackers(scene)
  }
  if (k.stage === REST) {
    k.timer -= dt
    if (k.timer <= 1.6 && k.bannerT > 2 && k.banner !== `WAVE ${k.wave}`) banner(k, `WAVE ${k.wave}`)
    if (k.timer <= 0 && scene.eject.stage === EJ_FLY) sendWave(scene)
  } else if (k.stage === FIGHT) {
    let left = 0
    for (const s of scene.ships) if (s.jet.fighter?.side === SIDE_ENEMY && s.jet.fighter.alive && !s.drill) left++
    if (left === 0) {
      const bonus = SCORE.wave * k.wave
      k.score += bonus
      // a wave cleared: some of the hull is patched up
      const own = playerFighter(scene)
      if (own) own.hull = Math.min(own.stats.hull, own.hull + own.stats.hull * SCORE.repair)
      banner(k, `WAVE ${k.wave} CLEAR`)
      k.popups.length = 0
      k.wave++
      k.stage = REST
      k.timer = PACE.rest
    }
  } else if (k.stage === OVER) {
    k.timer -= dt
    if (k.timer <= 0 && scene.eject.stage === EJ_FLY) {
      // a new skirmish
      k.stage = REST
      k.wave = 1
      k.timer = PACE.rest
      k.score = 0
      k.kills = 0
      k.chain = 0
      k.ships = SCORE.ships
    }
  }
}
