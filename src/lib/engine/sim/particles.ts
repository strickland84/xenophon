// Short-lived things in the air: puffs of smoke and bits of wreckage. Each kind lives in a
// fixed ring of slots (a flat array of numbers), so nothing is allocated while flying: a new
// one simply takes the place of the oldest.

import type { SceneState } from '../state'

export const SMOKE_N = 1024 // puffs of smoke kept alive at once (enough for a sky full of ships)
export const SMOKE_F = 10 // numbers kept per puff
export const DEBRIS_N = 64 // bits of wreckage in the air at once
export const DEBRIS_F = 8 // numbers kept per bit: x y z, speed x y z, when it was thrown, what it is

export interface Particles {
  /** per puff: x, y, z, when it was born, size, push x, push y, strength, life, kind (0 exhaust, 1 white, 2 black, 3 fire, 4 dust) */
  smoke: Float32Array
  smokeHead: number
  /** per bit: x y z, speed x y z, when it was thrown (−1: not in use), what it is */
  debris: Float32Array
  debrisHead: number
}

export function createParticles(): Particles {
  return {
    smoke: new Float32Array(SMOKE_N * SMOKE_F),
    smokeHead: 0,
    debris: new Float32Array(DEBRIS_N * DEBRIS_F).fill(-1),
    debrisHead: 0,
  }
}

/** kind: 0 exhaust, 1 white (a rocket's or a missile's trail, steam), 2 the black smoke of a wreck, 3 fire (a burning ship), 4 dust (a ship landing) */
export function addSmoke(
  scene: SceneState,
  x: number,
  y: number,
  z: number,
  size: number,
  pushX: number,
  pushY: number,
  strength: number,
  life: number,
  kind: number,
) {
  const particles = scene.particles
  const o = particles.smokeHead * SMOKE_F
  particles.smoke[o] = x
  particles.smoke[o + 1] = y
  particles.smoke[o + 2] = z
  particles.smoke[o + 3] = scene.time
  particles.smoke[o + 4] = size
  particles.smoke[o + 5] = pushX
  particles.smoke[o + 6] = pushY
  particles.smoke[o + 7] = strength
  particles.smoke[o + 8] = life
  particles.smoke[o + 9] = kind
  particles.smokeHead = (particles.smokeHead + 1) % SMOKE_N
}

/** kind: 0 a piece of the jet, 1 a burning piece, 2 the canopy, 3 the seat */
export function addDebris(scene: SceneState, x: number, y: number, z: number, vx: number, vy: number, vz: number, kind: number) {
  const particles = scene.particles
  const o = particles.debrisHead * DEBRIS_F
  particles.debris[o] = x
  particles.debris[o + 1] = y
  particles.debris[o + 2] = z
  particles.debris[o + 3] = vx
  particles.debris[o + 4] = vy
  particles.debris[o + 5] = vz
  particles.debris[o + 6] = scene.time
  particles.debris[o + 7] = kind
  particles.debrisHead = (particles.debrisHead + 1) % DEBRIS_N
}
