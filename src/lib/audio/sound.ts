// The game's sound effects, played from files (made by the audio model on James's PC: tools/gen/sounds.py).
// The scene makes no noise itself; it says what happened (SoundEvent: a gun fired, a hit, an explosion,
// where in the frame and how near) and how the player stands (Listening, read from the scene by
// `listener`). This plays both through the page's mixer (mixer.ts): one-off sounds for the events, with
// their pitch and loudness varied a little and takes taken in turn so that repeats do not grate, panned
// by where they are on the screen and dulled and quieted by distance; and steady sounds kept up from
// how he stands (the engines by the throttle and the power, the lock tone, the lasers, the cruise drive, a black hole) and the beeps
// of the lock, a missile coming and a hull nearly gone. cues.ts says which sound is which, and how loud.
//
// Nothing plays until the first click or key (the mixer is made then), and the files come after that,
// a few at a time; anything heard before its file has come is let go.

import type { FootStatus, Scene, SoundEvent } from '../engine'
import { EFFECTS } from './catalogue'
import type { EffectName } from './catalogue'
import { BEEPS, beeps, CUES, cueGain, cueSound, ENGINE_SIZE, loadingOrder, POWER_RATE, powerCue, powerOf, steady, UI } from './cues'
import type { Listening, Power, UiSound } from './cues'
import { libraryFor } from './library'
import type { Library } from './library'
import { withAudio } from './mixer'
import type { Mixer } from './mixer'

export interface Sound {
  /** what was heard since the last frame */
  play(events: SoundEvent[]): void
  /** the steady sounds follow how the player stands; call once a frame */
  update(l: Listening): void
  /** a sound of the interface */
  ui(kind: UiSound): void
  /** the files that would not load, how many one-offs were let go for want of theirs, how many of each played, and the
   * steady sounds going now at the level they are going to (for the checks) */
  readonly report: { failed: string[]; missed: number; played: Record<string, number>; loops: Record<string, number> }
  dispose(): void
}

export interface SoundOptions {
  /** the mixer to play through (the page's, made on the first click or key, if none) */
  mixer?: Mixer
  /** where the static files are (the page's `asset`) */
  url?: (path: string) => string
}

/** the most of one sound sounding at once, and of all of them */
const VOICES_EACH = 6
const VOICES_ALL = 40
/** the most a single take's evening gain lifts it */
const LIFT_MOST = 2

export function createSound(o: SoundOptions = {}): Sound {
  let mixer: Mixer | null = null
  let lib: Library | null = null
  let gone = false
  const voices = new Map<string, number>()
  let voicesAll = 0
  const lastTake = new Map<string, number>()
  const second = new Map<string, { at: number; n: number }>()
  const loops = new Map<EffectName, { src: AudioBufferSourceNode; gain: GainNode; lift: number }>()
  const nextBeep = { lock: 0, warning: 0, hull: 0 }
  let power: Power = 'none'
  const report = { failed: [] as string[], missed: 0, played: {} as Record<string, number>, loops: {} as Record<string, number> }

  function begin(m: Mixer) {
    if (gone || mixer) return
    mixer = m
    lib = libraryFor(m.ctx, o.url)
    void lib.load(loadingOrder()).then(() => (report.failed = lib!.failed))
  }
  if (o.mixer) begin(o.mixer)
  else withAudio(begin)

  /** the next take of a sound: its takes in turn, from a random one, never the same twice running */
  function takeOf(name: EffectName) {
    const use = EFFECTS[name].use
    if (use.length === 1) return use[0]
    const last = lastTake.get(name)
    let n = use[Math.floor(Math.random() * use.length)]
    if (n === last) n = use[(use.indexOf(n) + 1) % use.length]
    lastTake.set(name, n)
    return n
  }

  /** plays one take of a sound once: loudness, pan (−1 … 1), how far its pitch may wander, how muffled by distance (0 none … 1),
   * and how fast it plays (1: as made) */
  function fire(name: EffectName, gain: number, pan: number, pitch: number, far: number, rate = 1) {
    if (!mixer || !lib || gain <= 0.001) return
    const n = takeOf(name)
    const buf = lib.get(name, n)
    if (!buf) {
      report.missed++
      return
    }
    if ((voices.get(name) ?? 0) >= VOICES_EACH || voicesAll >= VOICES_ALL) return
    const ctx = mixer.ctx
    const take = EFFECTS[name].takes.find((t) => t.n === n)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * pitch)
    const g = ctx.createGain()
    g.gain.value = gain * Math.min(LIFT_MOST, take?.gain ?? 1) * (0.92 + Math.random() * 0.16)
    let head: AudioNode = src
    if (far > 0.05) {
      // (far off: the top of it is lost in the distance)
      const dull = ctx.createBiquadFilter()
      dull.type = 'lowpass'
      dull.frequency.value = 18000 * Math.pow(1 - far, 2) + 900
      head.connect(dull)
      head = dull
    }
    head.connect(g)
    let tail: AudioNode = g
    if (Math.abs(pan) > 0.02 && typeof ctx.createStereoPanner === 'function') {
      const p = ctx.createStereoPanner()
      p.pan.value = Math.max(-1, Math.min(1, pan * 0.85))
      g.connect(p)
      tail = p
    }
    tail.connect(mixer.effects)
    voices.set(name, (voices.get(name) ?? 0) + 1)
    voicesAll++
    src.onended = () => {
      voices.set(name, (voices.get(name) ?? 1) - 1)
      voicesAll--
      tail.disconnect()
    }
    src.start()
    report.played[name] = (report.played[name] ?? 0) + 1
  }

  /** whether another of `key` may play this second */
  function allowed(key: string, most: number | undefined) {
    if (!most || !mixer) return true
    const t = mixer.ctx.currentTime
    const s = second.get(key)
    if (!s || t - s.at >= 1) {
      second.set(key, { at: t, n: 1 })
      return true
    }
    return ++s.n <= most
  }

  /** a steady sound at a level (started when first wanted and its file has come; never stopped, only quiet) */
  function keep(name: EffectName, gain: number, rate: number) {
    if (!mixer || !lib) return
    const t = mixer.ctx.currentTime
    let l = loops.get(name)
    if (!l) {
      if (gain <= 0.001) return
      const n = EFFECTS[name].use[0]
      const buf = lib.get(name, n)
      if (!buf) return
      const ctx = mixer.ctx
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      // (to the take's own length: a decoder's padding at the end would be a gap in it)
      const take = EFFECTS[name].takes.find((x) => x.n === n)
      if (take && take.seconds < buf.duration) src.loopEnd = take.seconds
      const g = ctx.createGain()
      g.gain.value = 0
      src.connect(g)
      g.connect(mixer.effects)
      // (each loop from its own point, so two of them never beat together)
      src.start(t, Math.random() * buf.duration)
      l = { src, gain: g, lift: Math.min(LIFT_MOST, take?.gain ?? 1) }
      loops.set(name, l)
    }
    l.gain.gain.setTargetAtTime(gain * l.lift, t, 0.12)
    l.src.playbackRate.setTargetAtTime(rate, t, 0.15)
    if (gain > 0.001) report.loops[name] = Math.round(gain * 1000) / 1000
    else delete report.loops[name]
  }

  return {
    play(events) {
      if (!mixer) return
      for (const e of events) {
        const cue = CUES[e.kind]
        if (!cue) continue
        if (!allowed(e.kind + (e.own ? '' : '/other'), cue.perSecond)) continue
        const gain = cueGain(e)
        fire(cueSound(e), gain, e.own ? 0 : e.pan, cue.pitch, e.own ? 0 : 1 - e.gain)
        if (cue.duck && (e.own || e.gain > 0.5)) mixer.duck(cue.duck[0] * (e.own ? 1 : e.gain), cue.duck[1])
      }
    },
    update(l) {
      if (!mixer) return
      for (const s of steady(l)) keep(s.name, s.gain, s.rate)
      // (the ship's power coming up or going down: its drive spooling, slower and lower the bigger it is)
      const now = powerOf(l)
      const cue = powerCue(power, now)
      power = now
      if (cue) fire(cue.name, cue.gain, 0, 0.02, 0, POWER_RATE[ENGINE_SIZE[l.hull] ?? 'medium'])
      const t = mixer.ctx.currentTime
      const every = beeps(l)
      for (const k of ['lock', 'warning', 'hull'] as const) {
        if (every[k] <= 0) {
          nextBeep[k] = 0
          continue
        }
        if (t >= nextBeep[k]) {
          fire(BEEPS[k].name, BEEPS[k].gain, 0, 0, 0)
          nextBeep[k] = t + every[k]
        }
      }
    },
    ui(kind) {
      const u = UI[kind]
      fire(u.name, u.gain, 0, 0.02, 0)
    },
    get report() {
      return report
    },
    dispose() {
      gone = true
      for (const l of loops.values()) {
        try {
          l.src.stop()
        } catch {
          /* (not started) */
        }
        l.gain.disconnect()
      }
      loops.clear()
      mixer = null
    },
  }
}

/** reads how the player stands from the scene, for the steady sounds (how near a black hole is looked at twice a second) */
export function listener() {
  let holeAt = -1
  let hole = 0
  return (scene: Scene, foot: FootStatus, now: number): Listening => {
    const st = scene.status
    const z = scene.zone
    if (z.kind !== 'space') hole = 0
    else if (now - holeAt > 0.5) {
      holeAt = now
      const me = scene.player
      hole = 0
      for (const b of scene.bodies())
        if (b.kind === 'black hole') hole = Math.max(hole, 1 - Math.max(0, Math.hypot(b.x - me.x, b.y - me.y) - b.size) / (b.size * 1.5))
    }
    // (up out of his seat in flight, his ship is still flying: its drive heard, its alarms too)
    const flying = st.flying && (foot.stage === 'ship' || !!foot.up) && z.kind !== 'interior'
    const power = (st as { power?: 'off' | 'starting' | 'on' }).power
    return {
      flying,
      landed: scene.loop.stage === 'landed',
      hull: flying ? scene.pilot.hull : '',
      speed: st.speed,
      boost: st.boost,
      throttle: st.throttle,
      // (the ship's power switch, where the scene has one: off, starting or on; none said, it is on)
      powered: power !== 'off',
      starting: power === 'starting',
      hullLeft: st.hull,
      lock: st.lock,
      incoming: st.incoming,
      mining: scene.loop.mining,
      repairing: scene.loop.repair.on,
      cutting: foot.cutting && z.kind !== 'interior',
      cruise: z.cruise,
      hole,
      air: z.air,
    }
  }
}
