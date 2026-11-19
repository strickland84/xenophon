# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["faster-whisper", "soundfile", "numpy", "scipy", "pyloudnorm"]
# ///
"""Cuts, checks and packs the narrator's lines (read by tools/gen/narrate.py) into the game.

  uv run tools/audio/narration.py            lines with words missing or added are left out
  uv run tools/audio/narration.py --keep     every line packed, Whisper's view of its words only reported (James,
                                             2026-11-19: Whisper mishears the narrator's Greek accent)

For each line in art/audio/voice/lines/: Whisper (small.en, and base.en where that mishears) writes down what it hears, with each word's time, and the line is
cut from just before its first word to just after its last (a model sometimes breathes or mumbles on after a short
line); a line where words are missing or added is reported, and left out of the game until read again
(`narrate.py --seed 8 <id>`). Each is evened to LOUDNESS, faded at its ends, and written as
static/audio/voice/<id>.ogg (Opus), as the effects are; src/lib/audio/narrationTakes.ts gets the words each
was read from and its length (the opening story is timed by them). art/audio/samplers/6-narrator.mp3 is every line in
order, for James's ears, its list in art/audio/samplers/index.txt.
"""

import difflib
import json
import os
import re
import subprocess
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')

import numpy as np
import pyloudnorm
import soundfile as sf
from faster_whisper import WhisperModel
from scipy.signal import resample_poly

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
LINES = os.path.join(ROOT, 'art', 'audio', 'voice', 'lines')
STATIC = os.path.join(ROOT, 'static', 'audio', 'voice')
TAKES = os.path.join(ROOT, 'src', 'lib', 'audio', 'narrationTakes.ts')
SAMPLER = os.path.join(ROOT, 'art', 'audio', 'samplers', '6-narrator.mp3')
INDEX = os.path.join(ROOT, 'art', 'audio', 'samplers', 'index.txt')

# the voice's loudness (LUFS): over the music (evened to about -24, and pushed down under him), under the loudest
# effects (-14)
LOUDNESS = -17.0
# kept before the first word and after the last (s)
HEAD = 0.12
TAIL = 0.35
OPUS = ['-c:a', 'libopus', '-b:a', '40k', '-ac', '1', '-application', 'voip']

# what Whisper writes for a word it heard right: numerals, words that sound the same, the world's names spelt as it
# guesses them
SAME = {
    '40': 'forty',
    '90': 'ninety',
    'or': 'ore',
    'oar': 'ore',
    'lydell': 'lidel',
    'lidell': 'lidel',
    'liddell': 'lidel',
    'lydel': 'lidel',
    'ghent': 'gant',
    'sail': 'sale',
    'dressel': 'drassel',
    'drassell': 'drassel',
    'homeworld': 'home world',
    'corps': 'core',
}


def words(s):
    return [v for w in re.findall(r"[a-z0-9']+", s.lower().replace('’', "'")) for v in SAME.get(w, w).split()]



def lines():
    out = subprocess.run(['npx', 'jiti', 'tools/narration-lines.ts'], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def encode(x, rate, path, codec):
    subprocess.run(
        ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(rate), '-ac', '1', '-i', '-', *codec, path],
        input=x.astype(np.float32).tobytes(),
        check=True,
    )


def main():
    models = [WhisperModel(m, device='cpu', compute_type='int8') for m in ('small.en', 'base.en')]
    meter = None
    os.makedirs(STATIC, exist_ok=True)
    takes, sampler, listed, bad = {}, [], [], []
    for line in lines():
        base = os.path.join(LINES, line['id'])
        if not os.path.exists(base + '.wav'):
            print(f"{line['id']}: not read yet")
            continue
        said = open(base + '.txt').read().split('\n')
        if said[0] != line['text']:
            print(f"{line['id']}: read from other words (narrate.py reads it again)")
            continue
        x, rate = sf.read(base + '.wav', dtype='float32')
        x = x if x.ndim == 1 else x.mean(axis=1)
        want = words(line['text'])
        # (two of Whisper's models: a word either hears right was said; one both mishear was not)
        for model in models:
            segs, _ = model.transcribe(resample_poly(x, 16000, rate).astype(np.float32), word_timestamps=True)
            heard = [w for s in segs for w in s.words]
            got = words(' '.join(w.word for w in heard))
            diff = [d for d in difflib.ndiff(want, got) if d[0] in '+-']
            if not diff:
                break
        if not heard or (diff and '--keep' not in sys.argv):
            bad.append(line['id'])
            print(f"{line['id']}: words wrong: {' '.join(diff)}  ({said[1]})")
            continue
        a = max(0, int((heard[0].start - HEAD) * rate))
        b = min(len(x), int((heard[-1].end + TAIL) * rate))
        x = x[a:b]
        meter = meter or pyloudnorm.Meter(rate)
        x = pyloudnorm.normalize.loudness(x, meter.integrated_loudness(x), LOUDNESS)
        peak = np.abs(x).max()
        if peak > 0.89:
            x *= 0.89 / peak
        fin, fout = int(0.01 * rate), int(0.12 * rate)
        x[:fin] *= np.linspace(0, 1, fin)
        x[-fout:] *= np.linspace(1, 0, fout)
        encode(x, rate, os.path.join(STATIC, line['id'] + '.ogg'), OPUS)
        seconds = round(len(x) / rate, 2)
        takes[line['id']] = {'text': line['text'], 'seconds': seconds}
        sampler += [x, np.zeros(int(rate * 1.0), dtype=np.float32)]
        listed.append(f"  {len(listed) + 1:2}  {line['id']} ({seconds} s, {said[1]}): {line['text']}")
        print(f"{line['id']}: {seconds} s", flush=True)

    with open(TAKES, 'w') as f:
        f.write('// Written by tools/audio/narration.py: every line the narrator has read, the words he read and how long it\n')
        f.write('// is (s). Never edited by hand.\n')
        f.write('export const TAKES: Record<string, { text: string; seconds: number }> = ')
        f.write(json.dumps(takes, indent=2, ensure_ascii=False) + '\n')
    subprocess.run(['npx', 'prettier', '--write', '--log-level', 'warn', TAKES], cwd=ROOT, check=True)
    if sampler:
        encode(np.concatenate(sampler), rate, SAMPLER, ['-c:a', 'libmp3lame', '-q:a', '4', '-ac', '1'])
        index = open(INDEX).read()
        index = index.split('\n6-narrator.mp3')[0].rstrip('\n') + '\n'
        index += '\n6-narrator.mp3: The narrator (tools/gen/narrate.py), every line he reads, in order\n' + '\n'.join(listed) + '\n'
        with open(INDEX, 'w') as f:
            f.write(index)
    if bad:
        print(f"\nto read again: uv run tools/gen/narrate.py --seed 8 {' '.join(bad)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
    # (the files' fingerprints, so a browser fetches those made again afresh: tools/audio/fingerprints.mjs)
    subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fingerprints.mjs')], check=True)
