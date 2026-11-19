# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["kokoro>=0.9.4", "soundfile", "numpy"]
# ///
"""Reads the narrator's test passage (tools/gen/voice_recipe.py) in Kokoro-82M's stock voices, slowly, and
deepened: each voice as it is and lowered by DOWN semitones (ffmpeg's rubberband, the formants lowered with
the pitch, so it sounds a larger chest rather than a slowed tape).

  uv run tools/gen/voice_kokoro.py              every voice in VOICES
  uv run tools/gen/voice_kokoro.py bm_george    only these

Runs on the processor (the GPU is shared, and the model is small enough not to need it). The model
(about 330 MB, Apache 2.0) comes from hexgrad/Kokoro-82M on Hugging Face on first use. Writes
art/audio/voice/kokoro/<voice>_down<n>.wav (24 kHz) and an .mp3 beside each to listen to; the deepened
ones are also the voices tools/gen/voice_chatterbox.py takes.
"""

import os
import subprocess
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')

import numpy as np
import soundfile as sf
from kokoro import KPipeline

sys.path.insert(0, os.path.dirname(__file__))
from voice_recipe import OUT, PASSAGE  # noqa: E402

# (the first letter is the accent: a American, b British; the second the voice. James, 2026-11-18: none of the
# first nine deep or gravelly enough, all too quick; so the lowest men's voices only, slower, and lowered)
VOICES = ['am_onyx', 'bm_george', 'am_fenrir', 'bm_lewis']
SPEED = 0.78
DOWN = [0, 3, 5]
RATE = 24000


def main():
    wanted = sys.argv[1:] or VOICES
    out = os.path.join(OUT, 'kokoro')
    os.makedirs(out, exist_ok=True)
    pipes = {}
    for voice in wanted:
        lang = voice[0]
        if lang not in pipes:
            pipes[lang] = KPipeline(lang_code=lang, repo_id='hexgrad/Kokoro-82M', device='cpu')
        parts = [np.asarray(audio) for _, _, audio in pipes[lang](PASSAGE, voice=voice, speed=SPEED)]
        # (a rest between the model's sentences, as it reads them one at a time)
        rest = np.zeros(int(RATE * 0.45), dtype=np.float32)
        wav = np.concatenate([x for p in parts for x in (p, rest)])
        plain = os.path.join(out, f'{voice}_down0.wav')
        sf.write(plain, wav, RATE)
        for n in DOWN:
            path = os.path.join(out, f'{voice}_down{n}.wav')
            if n:
                pitch = 2 ** (-n / 12)
                lower = ['-af', f'rubberband=pitch={pitch:.4f}:formant=shifted:pitchq=quality']
                subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', plain, *lower, path], check=True)
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-b:a', '160k', path[:-4] + '.mp3'], check=True)
        print(f'{voice}: {len(wav) / RATE:.1f} s', flush=True)


if __name__ == '__main__':
    main()
