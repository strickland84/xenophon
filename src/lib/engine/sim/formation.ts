// Wingmen: up to two, one off each wing of the leader, holding station on it. When there is a
// fight they leave the formation to join it, and their own pilots fly them (pilots.ts) until
// they come back. One who is shot down is replaced, after a while, by another flying in.

import { formX, formY, makeJet } from '../jet/jet'
import type { SceneState } from '../state'
import { clamp, wrapAngle } from '../util/math'
import { groundAt } from '../world/world'
import { focus } from './ejection'
import { flyingFree } from './pilots'

/** how far behind the leader a replacement wingman appears, px */
const ARRIVE_BEHIND = 260

/** adds or removes wingmen to match the setting */
export function syncWingmen(scene: SceneState) {
  const p = scene.params
  const want = 1 + clamp(Math.round(p.wingmen), 0, 2)
  const lead = scene.jets[0]
  while (scene.jets.length < want) {
    const side = scene.jets.length === 1 ? -1 : 1
    const j = makeJet(
      lead.x + Math.cos(lead.yaw) * side * formX(p, scene.mesh.model) - Math.sin(lead.yaw) * formY(p, scene.mesh.model),
      lead.y + Math.sin(lead.yaw) * side * formX(p, scene.mesh.model) + Math.cos(lead.yaw) * formY(p, scene.mesh.model),
      lead.z,
      lead.yaw,
    )
    scene.jets.push(j)
  }
  if (scene.jets.length > want) scene.jets.length = want
}

/** a wingman who was shot down is replaced: a new one appears behind the leader and flies up to take his place */
function replace(scene: SceneState, i: number, dt: number) {
  const j = scene.jets[i]
  scene.wingReturn[i] -= dt
  if (scene.wingReturn[i] > 0) return
  const lead = focus(scene)
  j.x = lead.x - Math.sin(lead.yaw) * ARRIVE_BEHIND
  j.y = lead.y + Math.cos(lead.yaw) * ARRIVE_BEHIND
  j.z = lead.z
  j.yaw = lead.yaw
  j.roll = 0
  j.pitch = 0
  j.stunt = -1
  j.trailLen = 0
  j.lastTrailX = j.x
  j.lastTrailY = j.y
  j.away = false
  j.fighter = null // (a new one, with a fresh hull, is made for it)
}

/** wingmen hold formation */
export function stepWingmen(scene: SceneState, dt: number, clearance: number) {
  const { params: p, world } = scene
  for (let i = 1; i < scene.jets.length; i++) {
    const j = scene.jets[i]
    if (j.away) {
      replace(scene, i, dt)
      continue
    }
    // (fighting, or on his way back: his own pilot flies him)
    if (flyingFree(j.fighter)) continue
    const side = i === 1 ? -1 : 1
    const lead = focus(scene) // (they keep station on the pilot while he has no jet)
    // (while he is out of his ship, they hold off wider and higher: low over him they hid him from overhead; polish step 9)
    const out = scene.foot.stage !== 0
    const wide = out ? 2.6 : 1
    const tx = lead.x + Math.cos(lead.yaw) * side * formX(p, scene.mesh.model) * wide - Math.sin(lead.yaw) * formY(p, scene.mesh.model)
    const ty = lead.y + Math.sin(lead.yaw) * side * formX(p, scene.mesh.model) * wide + Math.cos(lead.yaw) * formY(p, scene.mesh.model)
    const k = 1 - Math.exp(-dt * 3.2)
    const ox = j.x
    const oy = j.y
    j.x += lead.vx * dt + (tx - (j.x + lead.vx * dt)) * k
    j.y += lead.vy * dt + (ty - (j.y + lead.vy * dt)) * k
    j.vx = (j.x - ox) / Math.max(dt, 1e-4)
    j.vy = (j.y - oy) / Math.max(dt, 1e-4)
    j.yaw += wrapAngle(lead.yaw - j.yaw) * (1 - Math.exp(-dt * 4))
    j.roll += (lead.roll - j.roll) * (1 - Math.exp(-dt * 3.2))
    j.pitch = lead.pitch
    j.z += (lead.z + (out ? 70 : 0) + Math.sin(scene.time * 1.1 + i * 2) * 1.2 - j.z) * (1 - Math.exp(-dt * 3))
    j.z = Math.max(j.z, groundAt(world, j.x, j.y) + clearance * 0.7)
  }
}
