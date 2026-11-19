import { describe, expect, it } from 'vitest'
import { createScene, homeWorld, STEP, theGalaxy, withDefaults, worldSettings } from '../engine'
import type { HeldControls, Scene } from '../engine'
import { DEFAULT_BINDINGS, keyName } from '../input/bindings'
import type { Bindable } from '../input/bindings'
import { namer } from '../input/hints'
import { STEPS, Tutorial } from './tutorial'
import type { Prompt, StepId } from './tutorial'

// The guided first sortie flown by a scripted player who does only what the prompts say: he reads
// the line, finds the key it names (as bound), and does that, steering by what the HUD shows (the
// course's arrow, the guide's mark, the brackets on what is in his sights, HOME). It must finish
// within the five minutes the plan gives it; shot down half way, it must carry on.

const LIMIT = 5 * 60 * 60 // five minutes of steps

/** a new pilot of a side, docked at his capital station with his ship's power off, as the page starts him */
function newPilot(side: 'nomarchy' | 'anarchoi') {
  const home = theGalaxy().systems.find((s) => s.side === side)!
  const scene = createScene(withDefaults({ ...worldSettings(`s${home.index}`), side, intro: false, hull: 'corsair', coldStart: true }))
  scene.setClock(1_800_000_000)
  scene.resize(456, 256)
  return scene
}

/** the action a key named in a prompt is bound to (the default bindings) */
function actionOf(name: string): Bindable | null {
  for (const [a, codes] of Object.entries(DEFAULT_BINDINGS.keys)) if (codes.some((c) => keyName(c) === name)) return a as Bindable
  return null
}

const nearestOf = <T extends { x: number; y: number }>(list: T[], x: number, y: number) =>
  list.reduce<T | null>((b, c) => (!b || Math.hypot(c.x - x, c.y - y) < Math.hypot(b.x - x, b.y - y) ? c : b), null)

const toward = (scene: Scene, x: number, y: number) => {
  const p = scene.player
  let off = Math.atan2(x - p.x, -(y - p.y)) - p.heading
  off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
  return Math.max(-1, Math.min(1, off * 2.5))
}

/**
 * The scripted stranger: from the prompt alone (and what the HUD shows), what to hold this frame, and
 * what to press once. He never looks at the tutorial's step, only at its words.
 */
function stranger(scene: Scene, prompt: Prompt, n: number, said: { beacon: () => void }) {
  const held: HeldControls = { turn: 0, climb: 0, boost: 0, fire: false, secondary: false, land: false }
  const t = prompt.text
  const key = (re: RegExp) => {
    const m = re.exec(t)
    return m ? actionOf(m[1]) : null
  }
  const L = scene.loop
  const p = scene.player
  // "Press P to power up": what P is bound to, pressed (once: a second press would switch it off again)
  const press = key(/press (\S+) to power up/i)
  if (press) {
    if (n % 30 === 0 && scene.status.power === 'off') scene.act(press as 'power')
    return held
  }
  // "hold F to …": what F is bound to, held (Action: Land)
  const holdKey = key(/hold (\S+) (?:to|over|low)/i)
  // "Dive low: hold W"
  if (/dive low/i.test(t)) {
    const a = key(/hold (\S+)$/i)
    if (a === 'up') held.climb = 1
    if (a === 'down') held.climb = -1
    return held
  }
  // "Press V: see your ship from behind", "V again: the cockpit": the key pressed now and then
  if (/see your ship from behind|again: the cockpit|again: back above/i.test(t)) {
    const a = key(/^(?:press )?(\S+)(?::| again)/i)
    if (a && n % 45 === 0) scene.act(a as 'view')
    return held
  }
  if (/follow the arrow/i.test(t)) {
    // (the arrow points to the course's body)
    const body = scene.bodies().find((b) => b.index === scene.zone.course)
    if (body) held.turn = toward(scene, body.x, body.y)
    return held
  }
  if (/shoot the training drones/i.test(t)) {
    // the brackets on the drone in his sights; else turn for the guide's mark (the nearest drone)
    const s = scene.status.target
    const drone = scene.listShips().find((x) => x.drill)
    const aim = s ? { x: s.leadX, y: s.leadY } : drone
    if (aim) {
      let off = Math.atan2(aim.x - p.x, -(aim.y - p.y)) - p.heading
      off -= Math.PI * 2 * Math.round(off / (Math.PI * 2))
      held.turn = Math.max(-1, Math.min(1, off * 3))
      held.fire = !!s && Math.abs(off) < 0.12
    }
    return held
  }
  if (/hold (\S+) to mine/i.test(t) || /scoop/i.test(t)) {
    // (the guide's mark: the outcrop, or a chunk to scoop up; lower when the line says so)
    const scoop = /scoop them/i.test(t)
    const mark = scoop ? nearestOf(L.chunks, p.x, p.y) : L.ore
    if (!mark) return held
    const d = Math.hypot(mark.x - p.x, mark.y - p.y)
    if (d > 70 || scoop) held.turn = toward(scene, mark.x, mark.y)
    else held.turn = 1
    // (the key the line names: the mining laser's, since mining has a control of its own)
    const a = key(/hold (\S+) to mine/i)
    if (a === 'mine') held.mine = !scoop && d < 140
    else held.land = !scoop && d < 140
    if (/lower/i.test(prompt.sub)) held.climb = 1
    return held
  }
  if (/fly home/i.test(t)) {
    if (L.home) held.turn = toward(scene, L.home.x, L.home.y)
    // (the HUD says LAND AND BANK over the pad: held until the ship is down)
    held.land = L.prompt === 'pad' || L.stage === 'landing'
    return held
  }
  if (/land on the pad at (.+): hold/i.test(t) || /land: hold/i.test(t)) {
    // (to the guide's mark, the pad; Land held once the HUD offers it, until the ship is down)
    const pad = /land on the pad at (.+): hold/i.exec(t)
    const b = pad ? L.bases.find((x) => x.name === pad[1]) : null
    if (b && L.stage === 'flying') held.turn = toward(scene, b.x, b.y)
    held.land = holdKey === 'use' && (L.prompt === 'land' || L.prompt === 'pad' || L.stage === 'landing')
    return held
  }
  if (/tap (\S+) to get out/i.test(t) || /back in: walk to your ship/i.test(t) || /back to your ship/i.test(t)) {
    if (/get out/i.test(t)) {
      if (n % 30 === 0) scene.act('use')
      return held
    }
    // walk to the ship standing where he left it (the HUD's arrow on foot), and press Action by it
    const ship = scene.pilot
    const d = Math.hypot(ship.x - p.x, ship.y - p.y)
    const yaw = scene.foot.yaw
    const dx = ship.x - p.x
    const dy = ship.y - p.y
    const c = Math.cos(yaw)
    const sn = Math.sin(yaw)
    if (d > 4) {
      held.turn = (dx * c - dy * sn) / d
      held.climb = -(dx * sn + dy * c) / d
    }
    if (scene.foot.prompt === 'board' && n % 20 === 0) scene.act('use')
    return held
  }
  if (/plant a beacon/i.test(t)) {
    // the view key opens the wheel of words (the page's): he picks the first
    if (n % 40 === 0) said.beacon()
    return held
  }
  if (/call another/i.test(t)) {
    held.land = true
    return held
  }
  if (/steer for land/i.test(t)) return held
  // "Hold F to launch / take off / go down": Action held (let go now and then, as a hand does, if nothing comes of it)
  // (to take off or launch, held until the ship goes: a hand let go too soon, landed, would climb out)
  if (holdKey === 'use' && /take off|launch/i.test(t)) held.land = true
  else if (holdKey === 'use') held.land = n % 90 < 70
  return held
}

/** flies the first sortie with the stranger at the controls; `each` may do something to the scene now and then */
function fly(side: 'nomarchy' | 'anarchoi', each?: (scene: Scene, n: number, step: StepId) => void) {
  const scene = newPilot(side)
  const tut = new Tutorial({ side, input: () => 'pointer', name: namer('pointer'), stick: () => true })
  const steps: { step: StepId; at: number }[] = [{ step: tut.step, at: 0 }]
  const lines = new Set<string>()
  const said = {
    beacon: () => {
      // (the page opens the wheel on the view key; the stranger picks the first words, and the page plants it)
      scene.act('view')
      scene.plantBeacon(0)
      tut.beaconPlanted()
    },
  }
  let n = 0
  for (; n < LIMIT && !tut.done; n++) {
    const prompt = tut.frame(scene)
    lines.add(prompt.text)
    if (steps[steps.length - 1].step !== tut.step) steps.push({ step: tut.step, at: n })
    each?.(scene, n, tut.step)
    if (process.env.TUT_DEBUG && n % 120 === 0)
      console.log(
        n,
        tut.step,
        prompt.text,
        '|',
        prompt.sub,
        JSON.stringify({
          stage: scene.loop.stage,
          prompt: scene.loop.prompt,
          above: Math.round(scene.player.above),
          home: scene.loop.home,
          foot: scene.foot.stage,
          base: scene.loop.base?.name,
        }),
      )
    scene.setControls(stranger(scene, prompt, n, said))
    scene.step(STEP)
    for (const e of scene.takeLedger()) if (e.kind === 'bank') tut.holdBanked()
    scene.takeSounds()
    scene.takeDeeds()
  }
  return { scene, tut, steps, seconds: n / 60, lines }
}

describe('the guided first sortie', () => {
  it('a stranger doing only what the prompts say finishes it in under five minutes (the Nomarchy)', () => {
    const { tut, steps, seconds, lines } = fly('nomarchy')
    if (process.env.TUT_TIMES) console.log('nomarchy', seconds, steps.map((s) => `${s.step} ${(s.at / 60).toFixed(1)}`).join(', '))
    const seen = steps.map((s) => s.step)
    expect(tut.done, `stuck at ${tut.step} after ${seconds} s; steps ${JSON.stringify(steps)}`).toBe(true)
    // every step, in order
    expect(seen).toEqual(STEPS)
    expect(seconds).toBeLessThan(300)
    expect([...lines].some((l) => /hold F to launch from Meridian Ring/i.test(l))).toBe(true)
    expect([...lines].some((l) => l.includes(homeWorld('nomarchy').name))).toBe(true)
  })

  it('… and for the Anarchoi, from the Raft to its own capital world', () => {
    const { tut, steps, seconds } = fly('anarchoi')
    if (process.env.TUT_TIMES) console.log('anarchoi', seconds, steps.map((s) => `${s.step} ${(s.at / 60).toFixed(1)}`).join(', '))
    expect(tut.done, `stuck at ${tut.step} after ${seconds} s; steps ${JSON.stringify(steps)}`).toBe(true)
    expect(seconds).toBeLessThan(300)
  })

  it('shot down while mining, he is told how to carry on, and finishes all the same', () => {
    let shot = false
    const { tut, steps, seconds, lines } = fly('nomarchy', (scene, _n, step) => {
      if (step === 'mine' && !shot && scene.loop.mining) {
        shot = true
        // (another game's shots: his ship is lost)
        scene.hit(0, 9999, -1, 0, 0, 0, true)
      }
    })
    expect(shot).toBe(true)
    expect([...lines].some((l) => /ejected/i.test(l))).toBe(true)
    expect(tut.done, `stuck at ${tut.step} after ${seconds} s; steps ${JSON.stringify(steps)}; said ${[...lines].join(' | ')}`).toBe(true)
  })

  it('every step can be skipped, and the whole of it ended at once', () => {
    const scene = newPilot('nomarchy')
    const tut = new Tutorial({ side: 'nomarchy', input: () => 'touch', name: namer('touch'), stick: () => true })
    const seen: StepId[] = []
    while (!tut.done) {
      seen.push(tut.step)
      tut.skip(scene)
    }
    expect(seen).toEqual(STEPS.slice(0, -1))
    const again = new Tutorial({ side: 'nomarchy', step: 'mine', input: () => 'touch', name: namer('touch'), stick: () => true })
    again.end(scene)
    expect(again.done).toBe(true)
    // (touch words: the buttons' names)
    expect(new Tutorial({ side: 'nomarchy', input: () => 'touch', name: namer('touch'), stick: () => true }).frame(scene).text).toMatch(
      /press POWER to power up/i,
    )
  })
})
