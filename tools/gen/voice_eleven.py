# /// script
# requires-python = ">=3.10"
# dependencies = ["soundfile", "numpy", "requests"]
# ///
"""The narrator's test for ElevenLabs voices: the test passage (PASSAGE in voice_recipe.py) read by each voice from
its library tried for Xenophon, so they can be measured (tools/audio/voice_check.py) and compared by ear.

  uv run tools/gen/voice_eleven.py            every voice in TRIED without a take yet
  uv run tools/gen/voice_eleven.py mike atlas only these, again

Takes go to art/audio/voice/eleven/<name>.wav (24 kHz; kept out of git). The key is ELEVENLABS_API_KEY, from the
environment or .env; only the passage is sent.
"""

import os
import sys

import numpy as np
import requests
import soundfile as sf

sys.path.insert(0, os.path.dirname(__file__))
from narrate import RATE, key  # noqa: E402
from voice_recipe import OUT, PASSAGE  # noqa: E402

# the voices tried (2026-11-19, the second search; the first narrator, Miltiadis, a Greek speaker told to put on a
# Greek accent in English, was not good enough): those that speak English with a Greek accent of their own, read as
# they are, and the library's old, deep storytellers in English. Each: voice id, and what goes before the words.
TRIED = {
    'miltiadis': ('YjbHBTWH8WkGAhNrkp0i', '[Greek accent] '),
    'mike': ('cir0mbQgrFs79o0HZw73', ''),
    'panos': ('z3zYFzY2KtTTLjvOecBO', ''),
    'dimitrios': ('PuE3KplJhtUIrmFbZ1Yn', ''),
    'atlas': ('ejJ1ETWS2ohLMMeCu1H3', '[Greek accent] '),
    'theos': ('n0vzWypeCK1NlWPVwhOc', '[Greek accent] '),
    'julian': ('7p1Ofvcwsv7UBPoFNcpI', ''),
    'david': ('BNgbHR0DNeZixGQVzloa', ''),
    'flint': ('qAZH0aMXY8tw1QufPN0D', ''),
    'liam': ('w2ZdKT3ghAOcMRbpjC3u', ''),
}
MODEL = 'eleven_v3'
SEED = 7


def read(k, voice, text):
    r = requests.post(
        f'https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=pcm_{RATE}',
        headers={'xi-api-key': k, 'Content-Type': 'application/json'},
        json={'text': text, 'model_id': MODEL, 'seed': SEED},
        timeout=300,
    )
    if r.status_code != 200:
        raise RuntimeError(f'{r.status_code}: {r.text[:300]}')
    return np.frombuffer(r.content, dtype='<i2').astype(np.float32) / 32768


def main():
    folder = os.path.join(OUT, 'eleven')
    os.makedirs(folder, exist_ok=True)
    names = sys.argv[1:] or [n for n in TRIED if not os.path.exists(os.path.join(folder, n + '.wav'))]
    k = key()
    for name in names:
        voice, before = TRIED[name]
        try:
            wav = read(k, voice, before + PASSAGE)
        except RuntimeError as e:
            print(f'{name}: {e}', flush=True)
            continue
        sf.write(os.path.join(folder, name + '.wav'), wav, RATE)
        print(f'{name}: {len(wav) / RATE:.1f} s', flush=True)


if __name__ == '__main__':
    main()
