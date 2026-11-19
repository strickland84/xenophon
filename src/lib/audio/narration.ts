// The narrator (the plan's section 17, "The narrator"): every line he reads, and his voice played over the music.
// Read by Xenophon, the narrator, in his ElevenLabs voice (tools/gen/narrate.py, tools/gen/voice_recipe.py), cut, checked and packed by
// tools/audio/narration.py into static/audio/voice/<id>.ogg, its length and the words it was read
// from in narrationTakes.ts. A line whose words have changed since it was read is not played (and the test fails).

import { OPENING, STORY, TITLE_LINE, plain } from '../story/intro'
import { SORTIE_SAID } from '../story/sortie'
import { audio, audioUrl } from './mixer'
import type { Mixer } from './mixer'
import { TAKES } from './narrationTakes'

/** every line, by id: the title's (said as the name is lit, and on the title page), the opening story's (intro-0 the
 * line in the dark, then each paragraph), the first sortie's */
export const NARRATION: { id: string; text: string }[] = [
  { id: 'title', text: TITLE_LINE },
  { id: 'intro-0', text: OPENING },
  ...STORY.map((p, i) => ({ id: `intro-${i + 1}`, text: plain(p.text) })),
  ...Object.entries(SORTIE_SAID).map(([step, text]) => ({ id: `sortie-${step}`, text })),
]

/** a line's length in seconds as read, or 0 if it has not been read in its present words */
export function voiced(id: string): number {
  const take = TAKES[id]
  const line = NARRATION.find((l) => l.id === id)
  return take && line && take.text === line.text ? take.seconds : 0
}

/** how far the music is pushed down under the voice */
const UNDER = 0.55

const buffers = new Map<string, Promise<AudioBuffer | null>>()
function load(m: Mixer, id: string): Promise<AudioBuffer | null> {
  let b = buffers.get(id)
  if (!b) {
    const path = `audio/voice/${id}.ogg`
    b = fetch(audioUrl(path))
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${path}: ${r.status}`))))
      .then((data) => m.ctx.decodeAudioData(data))
      .catch(() => null)
    buffers.set(id, b)
  }
  return b
}

/** fetches these lines now, so they start on time when wanted */
export function preload(ids: string[]) {
  const m = audio()
  if (m) for (const id of ids) if (voiced(id)) void load(m, id)
}

let now: { src: AudioBufferSourceNode; gain: GainNode } | null = null
/** when each line was last begun (performance.now(), ms) */
const begun = new Map<string, number>()
/** whether a line was begun in the last `seconds` */
export const saidWithin = (id: string, seconds: number) => performance.now() - (begun.get(id) ?? -Infinity) < seconds * 1000
let asked = 0

/** reads a line (cutting off the one before), if the sound is on and the line is voiced; `late` seconds already
 * gone by (it starts that far in, or not at all once more than a moment late) */
export function speak(id: string, late = 0) {
  const m = audio()
  if (!m || !voiced(id) || late > 0.6) return
  hush()
  begun.set(id, performance.now())
  const mine = ++asked
  const wanted = performance.now()
  void load(m, id).then((buffer) => {
    if (!buffer || mine !== asked) return
    const from = Math.max(0, late + (performance.now() - wanted) / 1000)
    if (from > 0.6) return
    const gain = m.ctx.createGain()
    gain.connect(m.effects)
    const src = m.ctx.createBufferSource()
    src.buffer = buffer
    src.connect(gain)
    src.start(0, from)
    m.duck(UNDER, buffer.duration - from + 0.3)
    now = { src, gain }
    src.onended = () => {
      if (now?.src === src) now = null
    }
  })
}

/** stops the narrator, fading him out over `fade` seconds */
export function hush(fade = 0.15) {
  asked++
  const m = audio()
  if (!now || !m) return
  const { src, gain } = now
  now = null
  const t = m.ctx.currentTime
  gain.gain.setTargetAtTime(0, t, fade / 3)
  src.stop(t + fade)
}
