// The music (the plan's section 17): other people's MIDI files and tracker modules under open licences
// (art/audio/music/, made by tools/audio/music.mjs), several for each kind of place, played from files through the
// mixer's music bus. moods.ts chooses the place (the title, a
// calm world, night, a harsh one, on foot, space, the cruise drive, a black hole, a fight at three levels, the
// hangar, the maps) and says how each comes in and goes. A new place's music fades in as the old one's fades out;
// a take that ends is followed by the next take of its piece (they take turns),
// after a rest of silence out in the world, so it never runs on for an hour. A fight comes in quickly
// and, once it is over, the music it broke into comes back where it left off; going from one level of a fight to
// another, the new one comes in quickly from its start (each level's pieces are their own songs). A sting (a fight won, shot down, a new
// system, a world taken) plays once over everything, the music held down under it.
//
// On the page each piece streams from an <audio> element (a whole piece decoded would be some 55 MB:
// too much for a phone); for the tools, which render a mix faster than time in an OfflineAudioContext,
// pieces are decoded whole instead (`buffers`). Nothing plays before the first click or key.

import { PIECES } from './pieces'
import type { PieceName } from './pieces'
import { piecePath } from './library'
import { audioUrl, withAudio } from './mixer'
import type { Mixer } from './mixer'
import { FIGHT_PLACES, MOODS, STING_AGAIN, STING_DUCK, STINGS } from './moods'
import type { Place, Sting } from './moods'

export interface Music {
  /** where the player is: its music comes in (moods.ts placeFor chooses) */
  setPlace(place: Place): void
  /** a sting plays once over the music (not on the title, nor the same one twice within STING_AGAIN seconds) */
  sting(which: Sting): void
  /** looks at the clock (the end of a take, a rest): the page's timer calls it; a render calls it as it goes */
  tick(): void
  /** what is playing ('' nothing: a rest, or not yet), as "piece_take" */
  readonly now: string
  dispose(): void
}

export interface MusicOptions {
  mixer?: Mixer
  url?: (path: string) => string
  /** decode whole pieces rather than stream them (for an OfflineAudioContext); and pieces decoded already, by path */
  buffers?: boolean
  decoded?: Map<string, AudioBuffer>
  /** a chance number 0..1 (Math.random if none): which take first, how long a rest */
  chance?: () => number
}

/** a take playing (or paused, to come back to) */
interface Deck {
  place: Place | null
  piece: PieceName
  take: number
  gain: GainNode
  /** seconds into it, and how long it is */
  at(): number
  length(): number
  ended(): boolean
  play(): void
  pause(): void
  /** let go once `seconds` have passed (it has faded out by then) */
  release(seconds: number): void
  dispose(): void
}

/** seconds a paused take is kept to come back to (after that it starts afresh) */
const KEEP = 150

/** a few samples of silence, as a WAV: played by each <audio> element on the first click, so phones let them play later */
const SILENCE = 'data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=='

export function createMusic(o: MusicOptions = {}): Music {
  const chance = o.chance ?? Math.random
  const url = o.url ?? audioUrl
  let mixer: Mixer | null = null
  // (the places' music goes through this, to be held down under a sting; the stings go straight to the mixer)
  let bus: GainNode | null = null
  const stungAt = new Map<Sting, number>()
  let place: Place = 'title'
  let current: Deck | null = null
  let kept: { deck: Deck; at: number } | null = null
  let restUntil = -1
  let gone = false
  let timer = 0
  const turn = new Map<PieceName, number>()
  // the page's <audio> elements, each wired into the context once
  const pool: { el: HTMLAudioElement; node: MediaElementAudioSourceNode; busy: boolean }[] = []

  const now = () => mixer?.ctx.currentTime ?? 0

  /** the next take of a piece: its takes in turn, from a random one */
  function nextTake(piece: PieceName) {
    const use = PIECES[piece].use
    const i = turn.has(piece) ? (turn.get(piece)! + 1) % use.length : Math.floor(chance() * use.length)
    turn.set(piece, i)
    return use[i]
  }

  function fade(d: Deck, to: number, seconds: number) {
    const t = now()
    const g = d.gain.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(to, t + Math.max(0.05, seconds))
  }

  function elementDeck(m: Mixer, at: Place | null, piece: PieceName, take: number, from = 0): Deck {
    const ctx = m.ctx as AudioContext
    let p = pool.find((x) => !x.busy)
    if (!p) {
      const el = new Audio()
      el.preload = 'auto'
      p = { el, node: ctx.createMediaElementSource(el), busy: false }
      pool.push(p)
    }
    const slot = p
    slot.busy = true
    const gain = ctx.createGain()
    gain.gain.value = 0
    slot.node.connect(gain)
    gain.connect(at && bus ? bus : m.music)
    const el = slot.el
    el.loop = false
    el.src = url(piecePath(piece, take))
    if (from > 0)
      el.addEventListener('loadedmetadata', () => (el.currentTime = Math.min(from, Math.max(0, el.duration - 20))), { once: true })
    const seconds = PIECES[piece].takes.find((t) => t.n === take)?.seconds ?? 120
    let paused: number | null = null
    return {
      place: at,
      piece,
      take,
      gain,
      at: () => el.currentTime,
      length: () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : seconds),
      ended: () => el.ended,
      play() {
        if (paused !== null) window.clearTimeout(paused)
        paused = null
        void el.play().catch(() => {})
      },
      pause() {
        // (once it has faded out)
        paused = window.setTimeout(() => el.pause(), 6000)
      },
      release(seconds) {
        window.setTimeout(() => this.dispose(), seconds * 1000 + 200)
      },
      dispose() {
        if (paused !== null) window.clearTimeout(paused)
        el.pause()
        el.removeAttribute('src')
        el.load()
        slot.node.disconnect()
        gain.disconnect()
        slot.busy = false
      },
    }
  }

  function bufferDeck(m: Mixer, at: Place | null, piece: PieceName, take: number, from = 0): Deck {
    const ctx = m.ctx
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(at && bus ? bus : m.music)
    let buffer: AudioBuffer | null = null
    let src: AudioBufferSourceNode | null = null
    let offset = from
    let startedAt = -1
    let wanted = false
    const seconds = PIECES[piece].takes.find((t) => t.n === take)?.seconds ?? 120
    const start = () => {
      if (!buffer || !wanted || src) return
      src = ctx.createBufferSource()
      src.buffer = buffer
      src.connect(gain)
      if (from > 0 && startedAt < 0) offset = Math.min(from, Math.max(0, buffer.duration - 20))
      src.start(ctx.currentTime, offset)
      startedAt = ctx.currentTime
    }
    const ready = o.decoded?.get(piecePath(piece, take))
    if (ready) buffer = ready
    else
      void fetch(url(piecePath(piece, take)))
        .then((r) => r.arrayBuffer())
        .then((b) => ctx.decodeAudioData(b))
        .then((b) => {
          buffer = b
          start()
        })
        .catch(() => {})
    const position = () => (src ? offset + ctx.currentTime - startedAt : offset)
    return {
      place: at,
      piece,
      take,
      gain,
      at: position,
      length: () => buffer?.duration ?? seconds,
      ended: () => position() >= (buffer?.duration ?? seconds),
      play() {
        wanted = true
        start()
      },
      pause() {
        offset = position()
        wanted = false
        src?.stop(ctx.currentTime + 6)
        src = null
      },
      release(seconds) {
        wanted = false
        src?.stop(ctx.currentTime + seconds + 0.1)
        src = null
      },
      dispose() {
        src?.stop()
        gain.disconnect()
      },
    }
  }

  /** the music of `p` comes in (the paused take of it, if it was left lately; if not, its next take) */
  function begin(p: Place, from = 0) {
    if (!mixer) return
    const mood = MOODS[p]
    restUntil = -1
    let d: Deck
    if (kept && kept.deck.place === p && now() - kept.at < KEEP && !kept.deck.ended()) {
      d = kept.deck
      kept = null
    } else {
      const piece = mood.piece
      const take = nextTake(piece)
      d = o.buffers ? bufferDeck(mixer, p, piece, take, from) : elementDeck(mixer, p, piece, take, from)
    }
    d.play()
    fade(d, 1, mood.fadeIn)
    current = d
  }

  /** the music playing goes, over `seconds`: kept to come back to, or let go */
  function leave(seconds: number, keepIt: boolean) {
    if (!current) return
    const d = current
    current = null
    fade(d, 0, seconds)
    if (keepIt) {
      kept?.deck.dispose()
      d.pause()
      kept = { deck: d, at: now() }
    } else d.release(seconds)
  }

  function tick() {
    if (!mixer || gone) return
    const t = now()
    if (current) {
      const mood = MOODS[current.place ?? place]
      // its end: it fades as it ends, and a rest follows, or the next take straight away
      if (current.ended() || current.length() - current.at() < mood.fadeOut) {
        leave(Math.max(0.5, current.length() - current.at()), false)
        const [a, b] = mood.rest
        if (b > 0) restUntil = t + a + (b - a) * chance()
        else begin(place)
      }
    } else if (restUntil < 0 || t >= restUntil) begin(place)
    if (kept && t - kept.at > KEEP) {
      kept.deck.dispose()
      kept = null
    }
  }

  function start(m: Mixer) {
    if (gone || mixer) return
    mixer = m
    bus = m.ctx.createGain()
    bus.connect(m.music)
    if (!o.buffers && typeof Audio !== 'undefined') {
      // (in the click or key that made the mixer: each element plays a moment of silence, so a phone lets it play later;
      // as many as can play at once: a take kept, one fading out, one coming in, a sting)
      for (let i = 0; i < 5; i++) {
        const el = new Audio()
        el.preload = 'auto'
        el.src = SILENCE
        void el.play().catch(() => {})
        pool.push({ el, node: (m.ctx as AudioContext).createMediaElementSource(el), busy: false })
      }
      timer = window.setInterval(tick, 500)
    }
    m.hold(MOODS[place].hold)
    begin(place)
  }
  if (o.mixer) start(o.mixer)
  else withAudio(start)

  return {
    setPlace(p) {
      if (p === place) return
      const was = place
      place = p
      if (!mixer) return
      mixer.hold(MOODS[p].hold)
      const fightNow = FIGHT_PLACES.includes(p)
      // (from one level of a fight to another: quickly, the new one from its start)
      if (fightNow && FIGHT_PLACES.includes(was) && current) {
        leave(1, false)
        begin(p)
        return
      }
      // (into a fight it goes quickly; anything a fight breaks into is kept, to come back to)
      const out = fightNow ? 1.2 : MOODS[was].fadeOut
      leave(out, fightNow || p === 'map')
      begin(p)
    },
    sting(which) {
      if (!mixer || !bus || gone || place === 'title' || place === 'intro') return
      const t = now()
      if (t - (stungAt.get(which) ?? -Infinity) < STING_AGAIN) return
      stungAt.set(which, t)
      const piece = STINGS[which]
      const take = nextTake(piece)
      const d = o.buffers ? bufferDeck(mixer, null, piece, take) : elementDeck(mixer, null, piece, take)
      d.gain.gain.value = 1
      d.play()
      const seconds = PIECES[piece].takes.find((x) => x.n === take)?.seconds ?? 8
      // (the music under it held down, and back as it ends)
      const g = bus.gain
      g.cancelScheduledValues(t)
      g.setValueAtTime(g.value, t)
      g.linearRampToValueAtTime(1 - STING_DUCK, t + 0.15)
      g.setValueAtTime(1 - STING_DUCK, t + Math.max(0.2, seconds - 1.5))
      g.linearRampToValueAtTime(1, t + seconds + 1)
      d.release(seconds + 0.5)
    },
    tick,
    get now() {
      return current ? `${current.piece}_${current.take}` : ''
    },
    dispose() {
      gone = true
      window.clearInterval(timer)
      current?.dispose()
      kept?.deck.dispose()
      current = null
      kept = null
      for (const p of pool) {
        p.el.pause()
        p.node.disconnect()
      }
      pool.length = 0
      bus?.disconnect()
      mixer?.hold(0)
    },
  }
}
