// Ten minutes in a quiet place and ten in a dangerous one, flown by scripted pilots, to tune the
// galaxy's own ships by (the polish pass, item 8): what a pilot meets, and what it costs him.
//
//   npx jiti tools/locals.ts [minutes=5]
//
// Each run is a pilot of the Nomarchy, alone, flown for `minutes` (twice: on a world, then in a
// system's space): on a world he flies from one far point to the next, mining nothing; in space he
// cruises from body to body round the system. Wherever he is, when something comes for him he turns and fights (the
// guns on whatever is in his sights, a missile once locked), and when it is over he carries on. The
// quiet runs are in his own home system; the dangerous ones on the front line and at the core.
// It prints, for each: the ambushes (a band coming for him), the shots that struck him (and the knocks
// of a belt's rocks, apart), his kills and what they paid, how often he was shot down, the haulers and
// patrols he passed (within 400 px), and the fights he saw from afar (ships bursting that he had no
// hand in).

import { createScene, stateOf, STEP, withDefaults, worldSettings } from '../src/lib/engine'
import type { Scene } from '../src/lib/engine'

const minutes = Number(process.argv[2] ?? 5)

/** a number 0..1 from two others, the same every run */
const hashed = (a: number, b: number) => {
  let h = Math.imul(a + 1, 0x9e3779b1) ^ Math.imul(b + 7, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296
}

function run(zone: string, label: string) {
  const scene: Scene = createScene(withDefaults({ ...worldSettings(zone), side: 'nomarchy', intro: false, hull: 'corsair' }))
  scene.setClock(1_800_000_000)
  const space = scene.zone.kind === 'space'
  const state = stateOf(scene)!
  const st = { ambushes: 0, kills: 0, credits: 0, downed: 0, hit: 0, knocks: 0, haulers: new Set<number>(), patrols: new Set<number>(), foes: new Set<number>(), seenBurst: 0 }
  let leg = 0
  let goal = { x: 0, y: 0 }
  let course = -1
  const me = () => scene.player
  const toward = (x: number, y: number) => {
    let off = Math.atan2(x - me().x, -(y - me().y)) - me().heading
    off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
    return Math.max(-1, Math.min(1, off * 2.5))
  }
  const nextGoal = () => {
    leg++
    if (space) {
      // (round the system from body to body, the next one round from the middle, never across through the sun)
      const bodies = scene
        .bodies()
        .filter((b) => b.kind !== 'sun' && b.kind !== 'black hole' && b.kind !== 'belt' && b.kind !== 'giant')
        .sort((a, b) => Math.atan2(a.y, a.x) - Math.atan2(b.y, b.x))
      const b = bodies[leg % Math.max(1, bodies.length)]
      if (!b) return
      course = b.index
      scene.setCourse(b.index)
    } else {
      const a = hashed(leg, 1) * Math.PI * 2
      goal = { x: me().x + Math.sin(a) * 900, y: me().y - Math.cos(a) * 900 }
    }
  }
  for (let n = 0; n < minutes * 3600; n++) {
    const s = scene.status
    const t = s.target
    const p = me()
    const L = scene.loop
    // off the pad or out of dock first
    if (L.stage !== 'flying') {
      scene.setControls({ turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: n % 120 > 20 })
    } else if (t && Math.hypot(t.x - p.x, t.y - p.y) < 420) {
      // something to fight: turn on its lead point, guns when lined up, a missile once locked
      let off = Math.atan2(t.leadX - p.x, -(t.leadY - p.y)) - p.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      if (space && scene.zone.cruise !== 'off') scene.act('cruise')
      scene.setControls({ turn: Math.max(-1, Math.min(1, off * 3)), climb: 0, boost: 0, fire: Math.abs(off) < 0.1, secondary: s.lock >= 1 })
    } else if (space && scene.zone.kind === 'space') {
      const b = scene.bodies().find((q) => q.index === course)
      if (!b || Math.hypot(b.x - p.x, b.y - p.y) < b.size + 400) nextGoal()
      else {
        if (scene.zone.cruise === 'off' && n % 300 === 0) scene.act('cruise')
        scene.setControls({ turn: toward(b.x, b.y), climb: 0, boost: 0, fire: false, secondary: false })
      }
    } else {
      if (n % 1800 === 0 || Math.hypot(goal.x - p.x, goal.y - p.y) < 120) nextGoal()
      scene.setControls({ turn: toward(goal.x, goal.y), climb: 0, boost: 0, fire: false, secondary: false })
    }
    scene.step(STEP)
    for (const snd of scene.takeSounds()) {
      if (snd.kind === 'wave') st.ambushes++
      if (snd.kind === 'eject') st.downed++
      // (a shot, from someone; or a rock, or the like, from nothing)
      if (snd.kind === 'hit' && snd.own) {
        if (state.jets[0].fighter?.hitBy) st.hit++
        else st.knocks++
      }
      if (snd.kind === 'explosion' && !snd.own) st.seenBurst++
    }
    for (const e of scene.takeLedger())
      if (e.kind === 'bounty') {
        st.kills++
        st.credits += e.credits
      }
    if (n % 30 === 0)
      for (const x of scene.listShips()) {
        const near = Math.hypot(x.x - p.x, x.y - p.y) < 400
        if (!near) continue
        if (x.traffic && !x.lurk) st.haulers.add(x.id)
        else if (x.faction) (x.side === 0 ? st.patrols : st.foes).add(x.id)
        else if (x.band >= 0) st.foes.add(x.id)
      }
  }
  console.log(
    `${label} (${zone}, ${minutes} min): ambushed ${st.ambushes}, shot ${st.hit} times (and ${st.knocks} knocks), shot down ${st.downed}, kills ${st.kills} (${st.credits} cr), ` +
      `haulers passed ${st.haulers.size}, his patrols passed ${st.patrols.size}, foes met ${st.foes.size}, ships seen bursting ${Math.max(0, st.seenBurst - st.kills)}`,
  )
}

run('w0', 'quiet: his capital world')
run('s0', 'quiet: his home system')
run('w19', 'dangerous: a world on the front line')
run('s5', 'dangerous: the core')
