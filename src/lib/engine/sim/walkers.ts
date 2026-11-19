// Other pilots on foot (Phase 5): another player's pilot, out of his ship, as his game says he is
// (Scene.addWalker, updateWalker, removeWalker). Like another's ship, he is drawn and fought
// here, but what happens to him is his own game's to decide: a hit on him is reported, not done
// (combat.ts harm), and his death comes as word from his game. Between one word and the next he
// walks on the way he was going, so he moves smoothly. Coming down after ejecting, he is drawn
// the way his race comes down; dead, he lies a moment and is gone.

import { FOOT, SIDEARM } from '../data/foot'
import { paintLook } from '../races/look'
import { lookOf } from '../races/races'
import type { SceneState } from '../state'
import { pack, parseColor } from '../util/color'
import { clamp } from '../util/math'
import type { Fighter } from './combat'
import { addSpark, jitter, SPARK_HULL } from './effects'
import { createWalker, DEAD, FALLING, WALKING, BOARDING } from './foot'
import type { Walker } from './foot'
import { boltFrom } from './guns'

export interface OtherWalker extends Walker {
  /** the number the scene's caller knows him by (shared with ships: no two are the same) */
  id: number
  /** his callsign, his faction mark (1 triangle, 2 diamond) and its colour */
  label: string
  mark: number
  markColor: number
  /** which side he is on: 0 the player's, 2 the other */
  side: number
  /** his look, as text (races.ts lookText) */
  lookText: string
  /** px a second he walks, along his heading */
  speed: number
  /** his sidearm is firing, and seconds to its next bolt (it only shows here) */
  firing: boolean
  gunWait: number
  /** his tab is hidden */
  idle: boolean
}

/** another pilot on foot as the scene is told about him; when he is updated, anything left out stays as it was */
export interface WalkerInput {
  x: number
  y: number
  /** px above the sea: his feet */
  height: number
  heading: number
  /** px a second, along his heading */
  speed: number
  /** 'falling' (coming down after ejecting), 'walking', 'boarding', or 'dead' */
  stage: string
  /** his look (races.ts lookText), and his side's name for a race that is not his side's ('nomarchy', 'anarchoi') */
  look: string
  /** 0 the player's side, 2 the other's */
  side: number
  /** callsign, faction mark (1 triangle, 2 diamond) and its colour */
  label: string
  mark: number
  markColor: string
  hidden: boolean
  wading: boolean
  firing: boolean
  mining: boolean
  /** 0..1: how far his way of coming down has opened */
  open: number
  /** 0..1: his health left */
  healthLeft: number
  idle: boolean
}

const STAGES: Record<string, number> = { falling: FALLING, walking: WALKING, dead: DEAD, boarding: BOARDING }

export function createOtherWalker(scene: SceneState, id: number, input: Partial<WalkerInput>): OtherWalker {
  const look = lookOf(input.look ?? '')
  const side = input.side ?? 2
  const w: OtherWalker = {
    ...createWalker(look, side),
    id,
    label: '',
    mark: 0,
    markColor: 0,
    side,
    lookText: '',
    speed: 0,
    firing: false,
    gunWait: 0,
    idle: false,
  }
  w.fighter.remote = true
  updateWalker(scene, w, input)
  return w
}

/** tells another pilot on foot where he is and how he stands */
export function updateWalker(scene: SceneState, w: OtherWalker, input: Partial<WalkerInput>) {
  const j = w.jet
  if (input.x !== undefined) j.x = input.x
  if (input.y !== undefined) j.y = input.y
  if (input.height !== undefined) j.z = input.height + FOOT.chest
  if (input.heading !== undefined) j.yaw = input.heading
  if (input.speed !== undefined) w.speed = input.speed
  if (input.stage !== undefined) {
    const stage = STAGES[input.stage] ?? WALKING
    if (stage !== w.stage) {
      w.stage = stage
      w.t = 0
      if (stage !== DEAD) {
        w.fighter.alive = true
        w.fighter.hull = Math.max(1, w.fighter.hull)
      }
    }
  }
  if (input.look !== undefined && input.look !== w.lookText) {
    w.lookText = input.look
    w.look = lookOf(input.look)
    paintLook(w.paint, w.look, scene.params.timeOfDay)
  }
  if (input.side !== undefined) {
    w.side = input.side
    w.fighter.side = input.side
  }
  if (input.label !== undefined) w.label = input.label
  if (input.mark !== undefined) w.mark = input.mark
  if (input.markColor !== undefined) {
    const [r, g, b] = parseColor(input.markColor, [255, 255, 255])
    w.markColor = pack(r, g, b)
  }
  if (input.hidden !== undefined) w.hidden = input.hidden
  if (input.wading !== undefined) w.wading = input.wading
  if (input.firing !== undefined) w.firing = input.firing
  if (input.mining !== undefined) w.mining = input.mining
  if (input.open !== undefined) w.open = clamp(input.open, 0, 1)
  if (input.healthLeft !== undefined) w.fighter.hull = clamp(input.healthLeft, 0, 1) * w.fighter.stats.hull
  if (input.idle !== undefined) w.idle = input.idle
}

/** another pilot on foot is dead, as his game says (or as this game's shot decided, until it says) */
export function walkerDied(scene: SceneState, f: Fighter) {
  const w = scene.walkers.find((x) => x.fighter === f)
  if (!w) return
  f.alive = false
  if (w.stage === DEAD) return
  w.stage = DEAD
  w.t = 0
  w.speed = 0
  w.firing = false
  for (let i = 0; i < 5; i++)
    addSpark(scene, w.jet.x, w.jet.y, w.jet.z, jitter(scene, 3) * 30, jitter(scene, 5) * 30, 20 + jitter(scene, 7) * 30, SPARK_HULL)
}

// scratch
const aim = { x: 0, y: 0, z: 0 }

/** they walk on along their headings, and their sidearms fire when their games say (bolts that only show) */
export function stepWalkers(scene: SceneState, dt: number) {
  for (const w of scene.walkers) {
    const j = w.jet
    w.t += dt
    const moving = w.stage === WALKING && !w.mining
    j.vx = moving ? Math.sin(j.yaw) * w.speed : 0
    j.vy = moving ? -Math.cos(j.yaw) * w.speed : 0
    j.x += j.vx * dt
    j.y += j.vy * dt
    if (w.stage === FALLING) j.z -= 18 * dt
    w.moving = clamp(w.speed / FOOT.run, 0, 1) * (moving ? 1 : 0)
    w.step += (Math.hypot(j.vx, j.vy) * dt) / FOOT.stride
    if (w.firing && w.stage === WALKING) {
      w.gunWait -= dt
      if (w.gunWait <= 0) {
        w.gunWait = 1 / SIDEARM.rate
        aim.x = Math.sin(j.yaw)
        aim.y = -Math.cos(j.yaw)
        aim.z = 0
        boltFrom(scene, w.fighter, j.x + aim.x * 2, j.y + aim.y * 2, j.z, aim)
        w.firedAt = scene.time
      }
    }
  }
}

/** every other pilot on foot's colours again, for a new time of day */
export function repaintWalkers(scene: SceneState) {
  for (const w of scene.walkers) paintLook(w.paint, w.look, scene.params.timeOfDay)
}
