// Writes src/lib/audio/fingerprints.ts: every file under static/audio/ with a fingerprint of what is in it (the start of
// its SHA-256), which the page adds to the file's address (audio/mixer.ts audioUrl, `?v=`). A file made again (a take
// packed, a line read again) has a new address, so a browser that kept the old one fetches it afresh; one unchanged is
// kept a year. (James, 2026-11-19: "I still hear the old voice overs!": the files kept their names and his browser its
// copies.) Run after tools/audio/pack.py or narration.py:
//
//   node tools/audio/fingerprints.mjs
//
// audio.spec.ts fails while the table and the files disagree.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const audio = path.join(root, 'static', 'audio')
const out = path.join(root, 'src', 'lib', 'audio', 'fingerprints.ts')

const files = []
const walk = (dir) => {
  for (const name of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, name)
    if (fs.statSync(p).isDirectory()) walk(p)
    else if (/\.(ogg|mp3|wav|flac|json)$/.test(name)) files.push(p)
  }
}
walk(audio)
export const fingerprint = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 10)
const rows = files.map((p) => `  '${path.relative(path.join(root, 'static'), p).split(path.sep).join('/')}': '${fingerprint(p)}',`)
fs.writeFileSync(
  out,
  [
    '// Written by tools/audio/fingerprints.mjs from the files in static/audio/: never edited by hand. Each file by its path',
    "// under static/, and the start of its SHA-256: the page adds it to the file's address (mixer.ts audioUrl).",
    'export const FINGERPRINTS: Record<string, string> = {',
    ...rows,
    '}',
    '',
  ].join('\n'),
)
console.log(`${path.relative(root, out)}: ${files.length} files`)
