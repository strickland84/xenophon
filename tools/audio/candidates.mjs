// Renders the open music candidates (art/audio/candidates/list.json) for James to hear on /sounds, beside the game's
// own music for each place. MIDI files are played through a General MIDI soundfont by SpessaSynth; tracker modules
// (.mod, .xm, .it, .s3m) by ffmpeg's libopenmpt. Each is evened to one loudness, cut to at most `most` seconds with a
// fade, and written as Ogg Opus to static/candidates/ (not in git: run this again to make them), with the list the
// page reads (static/candidates/list.json). Nothing here is played by the game.
//
//   node tools/audio/candidates.mjs <soundfont.sf2> [<second soundfont.sf2>] [--again]
//
// A candidate already made since its source last changed is kept (--again makes every one again).
// The soundfont the candidates were made with is FluidR3_GM (MIT; Debian's fluid-soundfont-gm). A second soundfont
// (GeneralUser GS was tried) renders the pieces marked `compare` again, so the two can be heard side by side.

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { audioToWav, BasicMIDI, SoundBankLoader, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core'

const root = path.resolve(import.meta.dirname, '..', '..')
const from = path.join(root, 'art', 'audio', 'candidates')
const to = path.join(root, 'static', 'candidates')
const RATE = 48_000
/** the longest a candidate runs, in seconds, unless it says otherwise, and the fade at its end */
const MOST = 210
const FADE = 4
/** the loudness every candidate is evened to (the game's music sits near it) */
const LUFS = -16

const again = process.argv.includes('--again')
const [first, second] = process.argv.slice(2).filter((a) => a !== '--again')
if (!first) {
  console.error('node tools/audio/candidates.mjs <soundfont.sf2> [<second soundfont.sf2>]')
  process.exit(1)
}

const list = JSON.parse(fs.readFileSync(path.join(from, 'list.json'), 'utf8'))
fs.mkdirSync(to, { recursive: true })

const banks = new Map()
function bankOf(file) {
  if (!banks.has(file)) banks.set(file, SoundBankLoader.fromArrayBuffer(new Uint8Array(fs.readFileSync(file)).buffer))
  return banks.get(file)
}

/** a MIDI file played through a soundfont, as a WAV file's bytes */
async function playMidi(file, font, most) {
  const midi = BasicMIDI.fromArrayBuffer(new Uint8Array(fs.readFileSync(file)).buffer, path.basename(file))
  const synth = new SpessaSynthProcessor(RATE, { eventsEnabled: false })
  synth.soundBankManager.addSoundBank(bankOf(font), 'main')
  await synth.ready
  synth.setSystemParameter('autoAllocateVoices', true)
  const seq = new SpessaSynthSequencer(synth)
  seq.loopCount = 0
  seq.loadNewSongList([midi])
  seq.play()
  // (two seconds after the last note for its tail to ring out)
  const n = Math.ceil(RATE * Math.min(midi.duration + 2, most + FADE))
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  for (let at = 0; at < n; at += 128) {
    seq.processTick()
    synth.process(left, right, at, Math.min(128, n - at))
  }
  return new Uint8Array(audioToWav([left, right], RATE))
}

/** any audio ffmpeg reads, evened, cut and faded, written as Ogg Opus; its length in seconds */
function encode(input, out, most) {
  const tmp = out + '.wav'
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-t', String(most + FADE), '-ac', '2', '-ar', String(RATE), tmp])
  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', tmp]).toString())
  const fadeAt = Math.max(0, Math.min(seconds, most + FADE) - FADE)
  const fade = seconds > most ? `,afade=t=out:st=${fadeAt.toFixed(2)}:d=${FADE}` : ''
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-af', `loudnorm=I=${LUFS}:TP=-1.5:LRA=11${fade}`, '-ar', '48000', '-c:a', 'libopus', '-b:a', '80k', out])
  fs.rmSync(tmp)
  return Math.min(seconds, most + FADE)
}

const made = []
const jobs = list.pieces.flatMap((p) => {
  const fonts = [{ font: first, tag: '' }]
  if (second && p.compare && p.file.endsWith('.mid')) fonts.push({ font: second, tag: '-b' })
  return fonts.map((f) => ({ ...p, ...f }))
})
for (const p of jobs) {
  const source = p.file.split('/')[0]
  const id = `${p.mood}-${p.file.replace(/\.[^.]+$/, '').replace(/[^a-z0-9]+/gi, '-')}${p.tag}`
  const out = path.join(to, `${id}.ogg`)
  const most = p.most ?? MOST
  const file = path.join(from, p.file)
  let seconds
  const kept = !again && fs.existsSync(out) && fs.statSync(out).mtimeMs > fs.statSync(file).mtimeMs
  if (kept) {
    seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString())
  } else if (p.file.endsWith('.mid')) {
    const wav = path.join(to, `${id}.raw.wav`)
    fs.writeFileSync(wav, await playMidi(file, p.font, most))
    seconds = encode(wav, out, most)
    fs.rmSync(wav)
  } else {
    seconds = encode(file, out, most)
  }
  const font = p.file.endsWith('.mid') ? path.basename(p.font, path.extname(p.font)) : 'its own samples'
  made.push({ ...p, id, path: `candidates/${id}.ogg`, seconds: Math.round(seconds * 10) / 10, sound: font, source: { ...list.sources[source], ...(p.licence && { licence: p.licence }), ...(p.url && { url: p.url }) }, font: undefined, tag: undefined, licence: undefined, url: undefined })
  console.log(`${id}  ${seconds.toFixed(0)} s  (${font})`)
}
fs.writeFileSync(path.join(to, 'list.json'), JSON.stringify({ about: list.about, pieces: made }, null, 1))
console.log(`${made.length} candidates in static/candidates/`)
