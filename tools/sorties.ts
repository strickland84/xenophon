// Flies sortie after sortie of the loop with no one at the controls, to tune it by: a bot mines
// the nearest ore until its hold is full, flies home and lands to bank, again and again, among the
// world's own ships (its raider bands and patrols: sim/bands.ts); with `fight` it also turns on any
// raider that comes within 320 px. It counts what was banked and lost, the ambushes (a band coming
// for it), the kills, and how long each sortie took and where it ended.
//
//   npx jiti tools/sorties.ts [world=w0] [hull=corsair] [minutes=6] [fight]
//
// The numbers it was tuned with are in the plan's section 22 (Phase 4).

import { createScene, withDefaults, worldSettings, STEP } from '../src/lib/engine'
const world = process.argv[2] ?? 'w0'
const hull = process.argv[3] ?? 'corsair'
const minutes = Number(process.argv[4] ?? 6)
const scene = createScene(withDefaults({ ...worldSettings(world), side: 'nomarchy', intro: false, hull }))
scene.setClock(1_800_000_000)
const st = { sorties: 0, banked: 0, lost: 0, lostUnits: 0, bankedUnits: 0, ambushes: 0, kills: 0, hits: 0, credits: 0 }
let phase = 'out', tFill = 0, t0 = 0, minHull = 1
const times: string[] = []
const held = (turn: number, climb: number, land = false, fire = false, secondary = false) => ({ turn, climb, boost: 0, fire, secondary, land })
for (let n = 0; n < minutes * 3600; n++) {
  const L = scene.loop, me = scene.player, s = scene.status
  const toward = (x: number, y: number) => { let off = Math.atan2(x - me.x, -(y - me.y)) - me.heading; off -= Math.PI * 2 * Math.round(off / (Math.PI * 2)); return Math.max(-1, Math.min(1, off * 2.5)) }
  const t = s.target
  // fire at whatever crosses the sights
  let fire = false
  if (t) { let off = Math.atan2(t.leadX - me.x, -(t.leadY - me.y)) - me.heading; off -= Math.PI * 2 * Math.round(off / (Math.PI * 2)); fire = Math.abs(off) < 0.1 }
  const fight = process.argv[5] === 'fight' && t && Math.hypot(t.x - me.x, t.y - me.y) < 320 && L.stage === 'flying'
  if (fight) {
    let off = Math.atan2(t!.leadX - me.x, -(t!.leadY - me.y)) - me.heading
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
    scene.setControls(held(Math.max(-1, Math.min(1, off * 3)), 0, false, Math.abs(off) < 0.1, s.lock >= 1))
  } else if (L.stage === 'landed') scene.setControls(held(0, 0, n % 40 > 8))
  else if (L.stage !== 'flying') scene.setControls(held(0, 0, true))
  else if (L.fill < 0.95 && L.ore && phase === 'out') {
    const d = Math.hypot(L.ore.x - me.x, L.ore.y - me.y)
    scene.setControls(d > 75 ? held(toward(L.ore.x, L.ore.y), 0, d < 140, fire, !!t && s.lock >= 1) : held(1, me.height - L.ore.z > 36 ? 1 : 0, true, fire))
  } else if (L.home) {
    if (phase === 'out') { phase = 'home'; tFill = n }
    scene.setControls(held(toward(L.home.x, L.home.y), 0, L.prompt === 'pad', fire, !!t && s.lock >= 1))
  }
  scene.step(STEP)
  for (const snd of scene.takeSounds()) if (snd.kind === 'wave') st.ambushes++
  if (s.flying) minHull = Math.min(minHull, s.hull)
  for (const e of scene.takeLedger()) {
    if (e.kind === 'bank') { st.banked++; st.bankedUnits += e.items.reduce((a, b) => a + b.n, 0); times.push(`sortie ${(((n - t0) / 60) | 0)}s (mine ${(((tFill - t0) / 60) | 0)}s, home ${(((n - tFill) / 60) | 0)}s) min hull ${minHull.toFixed(2)}`); phase = 'out'; t0 = n; minHull = 1 }
    if (e.kind === 'lost') { st.lost++; st.lostUnits += e.items.reduce((a, b) => a + b.n, 0); times.push(`LOST after ${(((n - t0) / 60) | 0)}s, ${phase}`); phase = 'out'; t0 = n; minHull = 1 }
    if (e.kind === 'bounty') { st.kills++; st.credits += e.credits }
  }
}
console.log(world, hull, JSON.stringify(st))
for (const x of times) console.log('  ' + x)
