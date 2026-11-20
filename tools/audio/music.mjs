// Makes the game's music from art/audio/music/list.json: MIDI files and tracker modules by other people under open
// licences, each listed for the place it plays in (moods.ts) or a sting. MIDI is played through a General MIDI
// soundfont by SpessaSynth; tracker modules (.mod, .xm, .it, .s3m) by ffmpeg's libopenmpt. Each is evened to one
// loudness, cut to at most `most` seconds with a fade, and written as Ogg Opus to static/audio/music/<place>_<n>.ogg,
// numbered in the list's order. It writes src/lib/audio/pieces.ts (what there is, and who made it, for the credits)
// and runs tools/audio/fingerprints.mjs.
//
//   node tools/audio/music.mjs <soundfont.sf2>
//   node tools/audio/music.mjs --table      the table and the licences again, from the files made before
//   node tools/audio/music.mjs <soundfont.sf2> --only win,foot_2    only these places or takes made again
//
// A place's piece is longer than a minute (a shorter one is played `times` over) and a sting at most 14 s (its music
// is cut at 10 and faded), as audio.spec.ts asks.
//
// The soundfont is FluidR3_GM (Frank Wen, MIT; Debian's fluid-soundfont-gm: `apt download fluid-soundfont-gm`, then
// `dpkg-deb -x` it). All of it takes about six minutes.

import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { audioToWav, BasicMIDI, SoundBankLoader, SpessaSynthProcessor, SpessaSynthSequencer } from 'spessasynth_core'

const root = path.resolve(import.meta.dirname, '..', '..')
const from = path.join(root, 'art', 'audio', 'music')
const to = path.join(root, 'static', 'audio', 'music')
const table = path.join(root, 'src', 'lib', 'audio', 'pieces.ts')
const RATE = 48_000
/** the longest a piece runs, in seconds, unless it says otherwise, and the fade at its end */
const MOST = 210
const FADE = 4
/** the stings (moods.ts STINGS) are cut shorter */
const STINGS = new Set(['win', 'lost', 'arrive', 'taken'])
const STING_MOST = 10
/** the loudness every piece is evened to */
const LUFS = -16
/** Opus as the effects and the old music had it */
const OPUS = ['-c:a', 'libopus', '-b:a', '64k', '-ac', '2', '-application', 'audio']

const args = process.argv.slice(2)
const tableOnly = args.includes('--table')
const onlyAt = args.indexOf('--only')
const only = onlyAt >= 0 ? new Set(args[onlyAt + 1].split(',')) : null
const font = args.find((a, i) => !a.startsWith('--') && i !== onlyAt + 1)
if (!font && !tableOnly) {
  console.error('node tools/audio/music.mjs <soundfont.sf2>')
  process.exit(1)
}

const list = JSON.parse(fs.readFileSync(path.join(from, 'list.json'), 'utf8'))
fs.mkdirSync(to, { recursive: true })

let bank = null
const bankOf = () => (bank ??= SoundBankLoader.fromArrayBuffer(new Uint8Array(fs.readFileSync(font)).buffer))

/** a MIDI file played through the soundfont, as a WAV file's bytes */
async function playMidi(file, most, times = 1) {
  const midi = BasicMIDI.fromArrayBuffer(new Uint8Array(fs.readFileSync(file)).buffer, path.basename(file))
  const synth = new SpessaSynthProcessor(RATE, { eventsEnabled: false })
  synth.soundBankManager.addSoundBank(bankOf(), 'main')
  await synth.ready
  synth.setSystemParameter('autoAllocateVoices', true)
  const seq = new SpessaSynthSequencer(synth)
  // (played `times` over: the sequencer goes back to the first note)
  seq.loopCount = times - 1
  seq.loadNewSongList([midi])
  seq.play()
  // (two seconds after the last note for its tail to ring out)
  const n = Math.ceil(RATE * Math.min(midi.duration * times + 2, most + FADE))
  const left = new Float32Array(n)
  const right = new Float32Array(n)
  for (let at = 0; at < n; at += 128) {
    seq.processTick()
    synth.process(left, right, at, Math.min(128, n - at))
  }
  return new Uint8Array(audioToWav([left, right], RATE))
}

const secondsOf = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString())

/** any audio ffmpeg reads, evened, cut and faded, written as Ogg Opus */
function encode(input, out, most) {
  const tmp = out + '.wav'
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-t', String(most + FADE), '-ac', '2', '-ar', String(RATE), tmp])
  const seconds = secondsOf(tmp)
  const fadeAt = Math.max(0, Math.min(seconds, most + FADE) - FADE)
  const fade = seconds > most ? `,afade=t=out:st=${fadeAt.toFixed(2)}:d=${FADE}` : ''
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', tmp, '-af', `loudnorm=I=${LUFS}:TP=-1.5:LRA=11${fade}`, '-ar', '48000', ...OPUS, out])
  fs.rmSync(tmp)
}

/** each place's pieces in the list's order, as takes 1, 2, 3 … */
const places = new Map()
for (const p of list.pieces) {
  if (!places.has(p.mood)) places.set(p.mood, [])
  places.get(p.mood).push(p)
}

const made = new Set()
const entries = []
for (const [place, pieces] of places) {
  const takes = []
  for (const [i, p] of pieces.entries()) {
    const n = i + 1
    const name = `${place}_${n}.ogg`
    const out = path.join(to, name)
    const file = path.join(from, p.file)
    const most = p.most ?? (STINGS.has(place) ? STING_MOST : MOST)
    if (tableOnly || (only && !only.has(place) && !only.has(`${place}_${n}`))) {
      // (made before)
    } else if (p.file.endsWith('.mid')) {
      const wav = path.join(to, `${place}_${n}.raw.wav`)
      fs.writeFileSync(wav, await playMidi(file, most, p.times))
      encode(wav, out, most)
      fs.rmSync(wav)
    } else {
      encode(file, out, most)
    }
    made.add(name)
    const key = p.file.split('/')[0]
    const source = list.sources[key]
    takes.push({
      key,
      n,
      seconds: Math.round(secondsOf(out) * 100) / 100,
      title: p.title,
      by: p.by,
      source: source.name,
      licence: p.licence ?? source.licence,
      url: p.url ?? source.url,
    })
    console.log(`${place}_${n}  ${takes.at(-1).seconds.toFixed(0)} s  ${p.title}`)
  }
  entries.push({ place, takes })
}
// (anything else in the folder is music from before)
for (const f of fs.readdirSync(to)) if (!made.has(f)) fs.rmSync(path.join(to, f))

// the licences that must go with the music where it is played (Freedoom's BSD licence asks for its text)
const licences = path.join(root, 'static', 'licences')
fs.mkdirSync(licences, { recursive: true })
for (const [key, s] of Object.entries(list.sources))
  if (s.text) fs.copyFileSync(path.join(from, s.text), path.join(licences, `${key}.txt`))

const q = (s) => `'${String(s).replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`
const lines = [
  '// Generated by tools/audio/music.mjs from art/audio/music/list.json: never edited by hand.',
  '//',
  "// The game's music: for each place (moods.ts) and sting, its pieces as takes numbered from 1, all of which the",
  '// game plays in turn, how long each is, and who made it under which licence (the credits in Settings show them).',
  '// The files are static/audio/music/<place>_<n>.ogg (Opus).',
  '',
  "import type { Clip } from './catalogue'",
  '',
  'export interface Source {',
  '  name: string',
  '  licence: string',
  '  url: string',
  '  /** the copyright line its licence asks to be shown */',
  '  credit: string',
  '  /** the licence in full, where it asks to go with the music (a path under static/) */',
  '  text?: string',
  '}',
  '',
  'export interface Credit {',
  '  title: string',
  '  by: string',
  '  /** where it came from (SOURCES), its own licence, and where that is said */',
  '  source: string',
  '  licence: string',
  '  url: string',
  '}',
  '',
  '/** where the music came from */',
  'export const SOURCES: Record<string, Source> = {',
  ...Object.entries(list.sources).map(
    ([key, s]) =>
      `  ${q(key)}: { name: ${q(s.name)}, licence: ${q(s.licence)}, url: ${q(s.url)}, credit: ${q(s.credit)}${s.text ? `, text: ${q(`licences/${key}.txt`)}` : ''} },`,
  ),
  '}',
  '',
  'export type PieceName =',
  ...entries.map((e) => `  | ${q(e.place)}`),
  '',
  'export const PIECES: Record<PieceName, Clip> = {',
  ...entries.map(
    (e) =>
      `  ${e.place}: { group: 'Music', label: ${q(e.place)}, loop: false, use: [${e.takes.map((t) => t.n).join(', ')}], byEar: true, takes: [${e.takes
        .map((t) => `{ n: ${t.n}, seconds: ${t.seconds}, gain: 1, flags: [] }`)
        .join(', ')}] },`,
  ),
  '}',
  '',
  '/** who made each take of each piece */',
  'export const CREDITS: Record<PieceName, Credit[]> = {',
  ...entries.map(
    (e) =>
      `  ${e.place}: [${e.takes
        .map((t) => `{ title: ${q(t.title)}, by: ${q(t.by)}, source: ${q(t.key)}, licence: ${q(t.licence)}, url: ${q(t.url)} }`)
        .join(', ')}],`,
  ),
  '}',
  '',
]
fs.writeFileSync(table, lines.join('\n'))
execFileSync('node', [path.join(root, 'tools', 'audio', 'fingerprints.mjs')], { stdio: 'inherit' })
execFileSync('npx', ['prettier', '--write', table], { cwd: root })
console.log(`${list.pieces.length} pieces in ${entries.length} places`)
