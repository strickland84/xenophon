// Mines (data/loadout.ts MINES): dropped behind a ship that carries a mine layer, when the Missile
// button is pressed with nothing locked. Each falls back from the ship, slows and hangs where it
// stopped, arms after a moment, and bursts when an enemy comes close, harming everything within
// its blast. A mine dropped by another game's ship only shows here: that game decides what it
// does, and says when it burst (as with shots).

import { MINES } from '../data/loadout'
import type { SceneState } from '../state'
import { harm, LEADER } from './combat'
import type { Fighter } from './combat'
import { addBlast, BLAST_AIR, sound } from './effects'
import { report } from './room'

export interface Mine {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  /** scene time it was dropped, its side, who dropped it, and its number (here, or in the game that dropped it) */
  born: number
  side: number
  by: Fighter | null
  tag: number
  /** another game dropped it: it only shows here; and the ship (its id here) whose it is */
  remote: boolean
  owner: number
}

export interface Mines {
  list: Mine[]
  /** the number the next one dropped here is given */
  tag: number
}

export const createMines = (): Mines => ({ list: [], tag: 1 })

/** a fighter drops a mine behind it, if it has one and is ready */
export function dropMine(scene: SceneState, f: Fighter) {
  if (f.mines <= 0 || f.mineWait > 0) return false
  const j = f.jet
  f.mines--
  f.mineWait = MINES.reload
  f.protect = 0
  const sx = Math.sin(j.yaw)
  const sy = -Math.cos(j.yaw)
  const back = f.mesh.model.l * 0.45
  const m: Mine = {
    x: j.x - sx * back,
    y: j.y - sy * back,
    z: j.z,
    vx: j.vx * 0.25 - sx * MINES.anarchoi,
    vy: j.vy * 0.25 - sy * MINES.anarchoi,
    born: scene.time,
    side: f.side,
    by: f,
    tag: scene.mines.tag++,
    remote: f.remote,
    owner: 0,
  }
  scene.mines.list.push(m)
  sound(scene, 'mine', m.x, m.y, m.z, 1, f.kind === LEADER)
  if (f.kind === LEADER) report(scene, { kind: 'mine', tag: m.tag, x: m.x, y: m.y, z: m.z })
  return true
}

/** another game's ship (`owner`, its id here) dropped mine `tag` at (x, y, z): it shows here */
export function mineFromAfar(scene: SceneState, owner: number, tag: number, x: number, y: number, z: number) {
  const side = scene.ships.find((s) => s.id === owner)?.jet.fighter?.side ?? 1
  scene.mines.list.push({ x, y, z, vx: 0, vy: 0, born: scene.time, side, by: null, tag, remote: true, owner })
  sound(scene, 'mine', x, y, z, 0.8, false)
}

/** the game that dropped mine `tag` says it burst */
export function mineEndFromAfar(scene: SceneState, owner: number, tag: number) {
  const at = scene.mines.list.findIndex((m) => m.remote && m.owner === owner && m.tag === tag)
  if (at < 0) return
  const m = scene.mines.list[at]
  addBlast(scene, m.x, m.y, m.z, 0.8, BLAST_AIR)
  sound(scene, 'explosion', m.x, m.y, m.z, 0.8, false)
  scene.mines.list.splice(at, 1)
}

/** mines slow and hang, arm, and burst at an enemy close by; and a layer's mines come back one by one */
export function stepMines(scene: SceneState, dt: number) {
  const list = scene.mines.list
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i]
    const age = scene.time - m.born
    const slow = Math.exp(-dt * 2.2)
    m.vx *= slow
    m.vy *= slow
    m.x += m.vx * dt
    m.y += m.vy * dt
    if (age > MINES.life) {
      list.splice(i, 1)
      continue
    }
    if (m.remote || age < MINES.arm) continue
    let fused = false
    for (const t of scene.fighters) {
      if (t.side === m.side || !t.alive) continue
      const d = Math.hypot(t.jet.x - m.x, t.jet.y - m.y, t.jet.z - m.z)
      if (d < MINES.fuse + t.radius * 0.5) {
        fused = true
        break
      }
    }
    if (!fused) continue
    // the burst: everything not of its side within the blast is harmed, less the further off
    for (const t of scene.fighters) {
      if (t.side === m.side || !t.alive) continue
      const d = Math.hypot(t.jet.x - m.x, t.jet.y - m.y, t.jet.z - m.z)
      if (d > MINES.blast + t.radius) continue
      harm(scene, t, MINES.damage * (1 - 0.5 * Math.min(1, d / (MINES.blast + t.radius))), m.by, m.x, m.y, m.z)
    }
    addBlast(scene, m.x, m.y, m.z, 0.8, BLAST_AIR)
    sound(scene, 'explosion', m.x, m.y, m.z, 0.8, m.by?.kind === LEADER)
    if (m.by?.kind === LEADER) report(scene, { kind: 'mineEnd', tag: m.tag })
    list.splice(i, 1)
  }
  // a layer's mines come back, one at a time
  for (const f of scene.fighters) {
    if (f.mineWait > 0) f.mineWait -= dt
    if (f.minesMax <= 0 || f.mines >= f.minesMax) continue
    f.mineBack += dt
    if (f.mineBack >= MINES.back) {
      f.mineBack = 0
      f.mines++
    }
  }
}
