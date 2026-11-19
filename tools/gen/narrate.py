# /// script
# requires-python = ">=3.10"
# dependencies = ["soundfile", "numpy", "requests"]
# ///
"""The narrator, Xenophon, reads the game's lines (src/lib/audio/narration.ts: the title, the opening story, and what
is said as each step of the first sortie begins) in his voice (NARRATOR in tools/gen/voice_recipe.py): ElevenLabs
text to speech, on James's own plan.

  uv run tools/gen/narrate.py                  every line not yet read in its present words
  uv run tools/gen/narrate.py intro-3 sortie   only these lines (ids, or the start of them), read again
  uv run tools/gen/narrate.py --seed 8 intro-3 another take of a line (when tools/audio/narration.py finds words
                                               missing or added)

The key is ELEVENLABS_API_KEY, from the environment or the project's .env (kept out of git); only the line's words are
sent. Writes art/audio/voice/lines/<id>.wav (24 kHz) and <id>.txt (the words read, and the seed);
tools/audio/narration.py cuts, checks and packs them.
"""

import json
import os
import subprocess
import sys

import numpy as np
import requests
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from voice_recipe import NARRATOR, OUT  # noqa: E402

LINES = os.path.join(OUT, 'lines')
RATE = 24000


def key():
    if os.environ.get('ELEVENLABS_API_KEY'):
        return os.environ['ELEVENLABS_API_KEY']
    if os.path.exists('.env'):
        for row in open('.env'):
            if row.startswith('ELEVENLABS_API_KEY='):
                return row.split('=', 1)[1].strip()
    sys.exit('no key: ELEVENLABS_API_KEY in the environment or .env')


def lines():
    out = subprocess.run(['npx', 'jiti', 'tools/narration-lines.ts'], capture_output=True, text=True, check=True).stdout
    return json.loads(out)


def read(k, text, seed):
    """one line read aloud, as samples at RATE"""
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{NARRATOR['voice']}?output_format=pcm_{RATE}",
        headers={'xi-api-key': k, 'Content-Type': 'application/json'},
        json={'text': f"{NARRATOR['style']} {text}", 'model_id': NARRATOR['model'], 'seed': seed},
        timeout=300,
    )
    if r.status_code != 200:
        sys.exit(f'ElevenLabs said {r.status_code}: {r.text[:300]}')
    return np.frombuffer(r.content, dtype='<i2').astype(np.float32) / 32768


def main():
    args = sys.argv[1:]
    seed = NARRATOR['seed']
    if '--seed' in args:
        i = args.index('--seed')
        seed = int(args[i + 1])
        del args[i : i + 2]
    os.makedirs(LINES, exist_ok=True)
    todo = []
    for line in lines():
        said = os.path.join(LINES, line['id'] + '.txt')
        if args:
            if any(line['id'].startswith(a) for a in args):
                todo.append(line)
        elif not os.path.exists(said) or open(said).read().split('\n')[0] != line['text']:
            todo.append(line)
    if not todo:
        print('every line is read in its present words')
        return
    k = key()
    for line in todo:
        wav = read(k, line['text'], seed)
        base = os.path.join(LINES, line['id'])
        sf.write(base + '.wav', wav, RATE)
        # (each seed's take kept too, to go back to: cp <id>.s7.wav <id>.wav, and its words in <id>.txt)
        sf.write(f'{base}.s{seed}.wav', wav, RATE)
        with open(base + '.txt', 'w') as f:
            f.write(f"{line['text']}\nseed {seed}\n")
        print(f"{line['id']}: {len(wav) / RATE:.1f} s", flush=True)


if __name__ == '__main__':
    main()
