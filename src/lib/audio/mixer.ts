// Where every sound of the game meets (the plan's section 17): one audio context for the page, with
// a bus for the effects (and the interface's clicks) and one for the music, each at its own volume,
// both through one limiter so that nothing clips however much happens at once. The music can be
// ducked: pushed down a little under a big explosion, or for as long as a fight lasts, so that the
// effects are never drowned.
//
// Browsers let a page make sound only after the player has clicked or pressed a key, so the page's
// mixer is made by `unlockAudio`, called from one of those (listenForUnlock does it). A mixer can
// also be made on a context of the caller's (an OfflineAudioContext, to render a mix faster than time
// for the tools): createMixer.

export interface Mixer {
  ctx: BaseAudioContext
  /** the effects' bus and the music's */
  effects: GainNode
  music: GainNode
  /** 0..1, as the settings have them */
  setEffectsVolume(volume: number): void
  setMusicVolume(volume: number): void
  /** pushes the music down by `depth` (0..1 of its level, 0.5 about −6 dB) for `seconds`, easing back after */
  duck(depth: number, seconds: number): void
  /** holds the music down by `depth` until told otherwise (0: not at all): a fight */
  hold(depth: number): void
  /** everything it plays, as a stream to film with the picture (display/clips.ts); null where there is no such thing */
  tap(): MediaStream | null
}

/** the music's level at full volume, as a gain on its bus: the pieces are evened to about −24 dBFS, the effects to −14 */
export const MUSIC_LEVEL = 1.2

/** loudness is heard roughly as the square of a setting */
const curve = (v: number) => {
  const c = Math.max(0, Math.min(1, v))
  return c * c
}

export function createMixer(ctx: BaseAudioContext, effectsVolume = 0.7, musicVolume = 0.5): Mixer {
  // the limiter: quick to catch a peak, slow enough to let go that it does not pump
  const limit = ctx.createDynamicsCompressor()
  limit.threshold.value = -6
  limit.knee.value = 3
  limit.ratio.value = 20
  limit.attack.value = 0.002
  limit.release.value = 0.25
  limit.connect(ctx.destination)
  const effects = ctx.createGain()
  effects.gain.value = curve(effectsVolume)
  effects.connect(limit)
  const music = ctx.createGain()
  music.gain.value = curve(musicVolume) * MUSIC_LEVEL
  // (the music's ducking is a gain of its own after the volume, so the two never fight over one value)
  const ducked = ctx.createGain()
  music.connect(ducked)
  ducked.connect(limit)
  let held = 0
  let duckUntil = 0
  let duckDepth = 0
  let tapped: MediaStreamAudioDestinationNode | null = null

  /** where the ducking should be now: the deeper of the fight's hold and a passing duck */
  function settle(at: number) {
    const depth = at < duckUntil ? Math.max(held, duckDepth) : held
    ducked.gain.setTargetAtTime(1 - depth, at, depth > 0 ? 0.08 : 0.6)
  }

  return {
    ctx,
    effects,
    music,
    setEffectsVolume(v) {
      effects.gain.setTargetAtTime(curve(v), ctx.currentTime, 0.03)
    },
    setMusicVolume(v) {
      music.gain.setTargetAtTime(curve(v) * MUSIC_LEVEL, ctx.currentTime, 0.3)
    },
    duck(depth, seconds) {
      const t = ctx.currentTime
      if (t < duckUntil && depth <= duckDepth) {
        duckUntil = Math.max(duckUntil, t + seconds)
        return
      }
      duckDepth = depth
      duckUntil = t + seconds
      settle(t)
      // (and back up once it is over)
      if (typeof setTimeout === 'function' && ctx instanceof AudioContext) setTimeout(() => settle(ctx.currentTime), seconds * 1000 + 20)
      else ducked.gain.setTargetAtTime(1 - held, t + seconds, 0.6)
    },
    hold(depth) {
      if (depth === held) return
      held = depth
      settle(ctx.currentTime)
    },
    tap() {
      if (typeof AudioContext === 'undefined' || !(ctx instanceof AudioContext)) return null
      if (!tapped) {
        tapped = ctx.createMediaStreamDestination()
        limit.connect(tapped)
      }
      return tapped.stream
    },
  }
}

// ── where the files are

let urlOf = (path: string) => '/' + path

/** the site's way to a static file (SvelteKit's `asset`), told once by the page */
export function setAudioUrl(f: (path: string) => string) {
  urlOf = f
}
export const audioUrl = (path: string) => urlOf(path)

// ── the page's own mixer, made on the first click or key

let page: Mixer | null = null
let wantEffects = 0.7
let wantMusic = 0.5
const waiting: ((m: Mixer) => void)[] = []

/** the page's mixer, once there is one and the browser lets it play (null before the first click or key) */
export function audio(): Mixer | null {
  return page && (page.ctx as AudioContext).state === 'running' ? page : null
}

/** call from a click, touch or key press: makes the page's mixer (or wakes it), and hands it to whatever waited for it */
export function unlockAudio(): Mixer | null {
  if (typeof window === 'undefined') return null
  if (!page) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    page = createMixer(new AC({ latencyHint: 'interactive' }), wantEffects, wantMusic)
    for (const f of waiting.splice(0)) f(page)
  }
  const ctx = page.ctx as AudioContext
  if (ctx.state === 'suspended') void ctx.resume()
  return page
}

/** the page's sound as a stream, to film with the picture (null before there is any) */
export const audioTap = (): MediaStream | null => page?.tap() ?? null

/** `f` is called with the page's mixer once it is made (at once, if it is) */
export function withAudio(f: (m: Mixer) => void) {
  if (page) f(page)
  else waiting.push(f)
}

/** the volumes, kept for the mixer until it is made */
export function setEffectsVolume(v: number) {
  wantEffects = v
  page?.setEffectsVolume(v)
}
export function setMusicVolume(v: number) {
  wantMusic = v
  page?.setMusicVolume(v)
}

/** listens for the first click, touch or key (and any after it, to wake a context the browser put to sleep); returns how to stop */
export function listenForUnlock(): () => void {
  if (typeof window === 'undefined') return () => {}
  const wake = () => unlockAudio()
  window.addEventListener('pointerdown', wake, true)
  window.addEventListener('keydown', wake, true)
  return () => {
    window.removeEventListener('pointerdown', wake, true)
    window.removeEventListener('keydown', wake, true)
  }
}
