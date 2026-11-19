// The jet as the renderer wants it: each slice of the sprite stack as a list of voxels, plus a
// few things measured off the model once (its shadow, where the canopy hinges, a plan view).

import { bigHullOf, decodeHull, hullOf } from './model'
import type { HullData } from './model'

export interface JetMesh {
  /** the ship this was built from: its size, and where its engines and wingtips are */
  model: HullData
  /** per slice: each voxel's place across the wings (0 is the centre line) … */
  sliceA: Float32Array[]
  /** … its place along the fuselage (0 is the pivot, forward is positive) … */
  sliceB: Float32Array[]
  /** … its palette index … */
  sliceC: Uint8Array[]
  /** … and which way its surface faces (FACE_*), for the light */
  sliceF: Uint8Array[]
  /** the jet's outline seen from above, for the shadow it casts */
  shadowMask: Uint8Array
  /** the lowest slice that has anything in it */
  firstSlice: number
  /** the canopy's glass lifts like a lid, hinged at its back edge: where that edge is … */
  lidB0: number
  /** … and the lowest slice with glass in it */
  lidY0: number
  /** the pilot's seat: how far along the fuselage, and how far above the pivot */
  seatB: number
  seatH: number
  /** the jet from above, for the cockpit's status screen: 0 empty, 1 body, 2 paint, 3 glass */
  top: { w: number; h: number; cells: Uint8Array }
  /** its wingtips, left then right, where its trails leave it: the outermost voxels of its own hull (not a part hung on
   * it), their place across, along, and the slice they are in (each the middle of those voxels) */
  tips: { a: number; b: number; y: number }[]
  /** how a fitted ship was made (jet/fit.ts: the weapons on its mounts, its modules …); none for a hull as drawn */
  make?: { weapons: string[]; modules: string[] }
}

/** which way a voxel's surface faces: its top (on the left half and the right, which the light picks out as a bevel), a
 * flank, its back, its front, its belly */
export const FACE_TOP_L = 0
export const FACE_TOP_R = 1
export const FACE_LEFT = 2
export const FACE_RIGHT = 3
export const FACE_BACK = 4
export const FACE_FRONT = 5
export const FACE_BELLY = 6
/** how many ways a voxel can face */
export const FACES = 7

/**
 * Which way each voxel of a ship faces (FACE_*), from the shape of the whole: the solid (the ship's voxels and what they
 * hold inside, for a ship is hollow) blurred, and down its slope. A gentle slope faces up however its voxels step; a
 * steep one out to the side. A thin plate (a wing) faces up or down by which of its sides is open.
 */
export function facesOf(w: number, l: number, h: number, slices: Uint8Array[]): Uint8Array[] {
  const W = w + 2
  const L = l + 2
  const Hh = h + 2
  const at = (z: number, k: number, i: number) => (z * L + k) * W + i
  // the solid, with a border of nothing round it; what the outside cannot reach is inside
  const full = new Uint8Array(W * L * Hh)
  for (let y = 0; y < h; y++) for (let o = 0; o < w * l; o++) if (slices[y][o]) full[at(y + 1, ((o / w) | 0) + 1, (o % w) + 1)] = 1
  const out = new Uint8Array(W * L * Hh)
  const queue = new Int32Array(W * L * Hh)
  let head = 0
  let tail = 0
  queue[tail++] = 0
  out[0] = 1
  const steps = [1, -1, W, -W, W * L, -W * L]
  while (head < tail) {
    const c = queue[head++]
    for (const d of steps) {
      const n = c + d
      if (n < 0 || n >= out.length || out[n] || full[n]) continue
      // (no wrapping round the grid's edges)
      const ci = c % W
      if ((d === 1 && ci === W - 1) || (d === -1 && ci === 0)) continue
      const ck = ((c / W) | 0) % L
      if ((d === W && ck === L - 1) || (d === -W && ck === 0)) continue
      out[n] = 1
      queue[tail++] = n
    }
  }
  const solid = (z: number, k: number, i: number) => (z < 0 || k < 0 || i < 0 || z >= Hh || k >= L || i >= W ? 0 : 1 - out[at(z, k, i)])
  const faces: Uint8Array[] = []
  for (let y = 0; y < h; y++) {
    const f = new Uint8Array(w * l)
    for (let k = 0; k < l; k++)
      for (let i = 0; i < w; i++) {
        if (!slices[y][k * w + i]) continue
        const z = y + 1
        const kk = k + 1
        const ii = i + 1
        // down the slope of the solid, blurred over the 5 × 5 × 5 round it
        let nz = 0
        let nk = 0
        let ni = 0
        for (let dz = -2; dz <= 2; dz++)
          for (let dk = -2; dk <= 2; dk++)
            for (let di = -2; di <= 2; di++) {
              if (solid(z + dz, kk + dk, ii + di)) continue
              nz += dz
              nk += dk
              ni += di
            }
        const upOpen = !solid(z + 1, kk, ii)
        const downOpen = !solid(z - 1, kk, ii)
        // (a thin plate: its blur says little; it faces whichever way it is open, up first)
        if (Math.abs(nz) * 1.3 >= Math.abs(nk) && Math.abs(nz) * 1.3 >= Math.abs(ni) && (nz !== 0 || upOpen || downOpen)) {
          const upward = nz > 0 || (nz === 0 && upOpen)
          f[k * w + i] = upward ? (i < (w - 1) / 2 ? FACE_TOP_L : FACE_TOP_R) : FACE_BELLY
        } else if (Math.abs(ni) >= Math.abs(nk)) f[k * w + i] = ni < 0 ? FACE_LEFT : FACE_RIGHT
        else f[k * w + i] = nk > 0 ? FACE_BACK : FACE_FRONT
      }
    faces.push(f)
  }
  return faces
}

/** a palette family as the status screen shows it: the body and the trim as body, markings, emblems and parts' own colours as paint, glass and glow as glass */
const TOP_CELL = [1, 2, 3, 3, 1, 2, 2, 2]

/** the mesh of a hull, from its own slices (or from `slices` given: a hull fitted out, jet/fit.ts) */
export function buildJetMesh(model: HullData, slices: Uint8Array[] = decodeHull(model)): JetMesh {
  const { w: JET_W, l: JET_L, h: JET_H, pivotK: PIV_K, pivotY: PIV_Y } = model
  // ── the jet's slices as lists of voxels
  const sliceA: Float32Array[] = []
  const sliceB: Float32Array[] = []
  const sliceC: Uint8Array[] = []
  const sliceF: Uint8Array[] = []
  const faces = facesOf(JET_W, JET_L, JET_H, slices)
  const shadowMask = new Uint8Array(JET_W * JET_L)
  let firstSlice = JET_H
  for (let y = 0; y < JET_H; y++) {
    const s = slices[y]
    let n = 0
    for (let o = 0; o < s.length; o++) if (s[o]) n++
    const a = new Float32Array(n)
    const b = new Float32Array(n)
    const c = new Uint8Array(n)
    const fc = new Uint8Array(n)
    let j = 0
    for (let k = 0; k < JET_L; k++) {
      for (let i = 0; i < JET_W; i++) {
        const v = s[k * JET_W + i]
        if (!v) continue
        a[j] = i - (JET_W - 1) / 2
        b[j] = PIV_K - k
        c[j] = v
        fc[j] = faces[y][k * JET_W + i]
        j++
        shadowMask[k * JET_W + i] = 1
      }
    }
    if (n && y < firstSlice) firstSlice = y
    sliceA.push(a)
    sliceB.push(b)
    sliceC.push(c)
    sliceF.push(fc)
  }
  // the wingtips: on each side the outermost column of the hull's own voxels (parts are hung from palette index 113 on,
  // jet/fit.ts PART_AT), and the middle of what is in it along the hull and up (the stored wingtip took the top of the
  // whole row, the spine and canopy with it, and its trails hung over the wings)
  const tips = [-1, 1].map((side) => {
    let edge = 0
    for (let y = 0; y < JET_H; y++)
      for (let v = 0; v < sliceA[y].length; v++) if (sliceC[y][v] < 113 && sliceA[y][v] * side > edge) edge = sliceA[y][v] * side
    let n = 0
    let b = 0
    let h = 0
    for (let y = 0; y < JET_H; y++)
      for (let v = 0; v < sliceA[y].length; v++)
        if (sliceC[y][v] < 113 && sliceA[y][v] * side >= edge - 0.01) {
          n++
          b += sliceB[y][v]
          h += y
        }
    return n ? { a: edge * side, b: b / n, y: h / n } : { a: model.wingtipA * side, b: PIV_K - model.wingtipK, y: model.wingtipY }
  })
  // where the canopy's glass is: it lifts like a lid, hinged at its back edge, and the seat is under it
  let lidB0 = 1e9
  let lidB1 = -1e9
  let lidY0 = JET_H
  for (let y = 0; y < JET_H; y++) {
    for (let v = 0; v < sliceC[y].length; v++) {
      if ((sliceC[y][v] - 1) >> 4 !== 2) continue
      if (sliceB[y][v] < lidB0) lidB0 = sliceB[y][v]
      if (sliceB[y][v] > lidB1) lidB1 = sliceB[y][v]
      if (y < lidY0) lidY0 = y
    }
  }
  if (lidB0 > lidB1) {
    lidB0 = 6
    lidB1 = 14
    lidY0 = Math.round(PIV_Y) + 3
  } // a jet with no glass: a guess
  const SEAT_B = (lidB0 + lidB1) / 2
  const SEAT_H = lidY0 - PIV_Y

  // the jet from above, for the cockpit's status screen: 0 empty, 1 body, 2 paint, 3 glass
  const jetTop = { w: JET_W, h: JET_L, cells: new Uint8Array(JET_W * JET_L) }
  for (let y = JET_H - 1; y >= 0; y--) {
    for (let o = 0; o < JET_W * JET_L; o++) {
      const v = slices[y][o]
      if (v && jetTop.cells[o] === 0) jetTop.cells[o] = TOP_CELL[(v - 1) >> 4]
    }
  }
  return { model, sliceA, sliceB, sliceC, sliceF, shadowMask, firstSlice, lidB0, lidY0, seatB: SEAT_B, seatH: SEAT_H, top: jetTop, tips }
}

// every hull's mesh, built the first time a ship of that hull is seen
const meshes = new Map<string, JetMesh>()

/** the mesh of the ship of that name (or of the default ship), built once and shared by every ship of the hull; `big`: as the hangar shows it */
export function meshOf(hull: string, big = false): JetMesh {
  const model = big ? bigHullOf(hull) : hullOf(hull)
  const key = (big ? 'big:' : '') + model.name
  let mesh = meshes.get(key)
  if (!mesh) {
    mesh = buildJetMesh(model)
    meshes.set(key, mesh)
  }
  return mesh
}
