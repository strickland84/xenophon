# /// script
# requires-python = ">=3.10,<3.13"
# dependencies = ["faster-whisper", "librosa", "soundfile", "numpy", "scipy"]
# ///
"""Measures the narrator's takes (tools/gen/voice_*.py), since nobody here can hear them: how low the voice is
(its median pitch: a deep man's voice speaks round 80 to 100 Hz), how rough (the share of its speech the pitch
tracker cannot follow: breath and gravel raise it), how quick (words a minute, over the time from its first sound
to its last: a slow narrator reads 110 to 130), and whether every word can still be made out (Whisper writes
down what it hears, compared with the passage).

  uv run tools/audio/voice_check.py art/audio/voice/kokoro art/audio/voice/chatterbox
"""

import glob
import os
import re
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')

import librosa
import numpy as np
from faster_whisper import WhisperModel

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'gen'))
from voice_recipe import PASSAGE  # noqa: E402

words = lambda s: re.findall(r"[a-z']+", s.lower())  # noqa: E731


def main():
    model = WhisperModel('base.en', device='cpu', compute_type='int8')
    want = words(PASSAGE)
    print(f'{"take":34} {"pitch":>6} {"rough":>6} {"wpm":>5}  words heard')
    for folder in sys.argv[1:]:
        for path in sorted(glob.glob(os.path.join(folder, '*.wav'))):
            y, sr = librosa.load(path, sr=16000, mono=True)
            loud = np.flatnonzero(np.abs(y) > 0.02)
            spoken = (loud[-1] - loud[0]) / sr if len(loud) else 0
            f0, voiced, _ = librosa.pyin(y, fmin=50, fmax=300, sr=sr, frame_length=1024)
            pitch = np.nanmedian(f0) if np.any(voiced) else float('nan')
            # (of the frames loud enough to be speech, the share with no steady pitch)
            rms = librosa.feature.rms(y=y, frame_length=1024, hop_length=256)[0][: len(voiced)]
            speech = rms > 0.02
            rough = 1 - voiced[speech].mean() if speech.any() else float('nan')
            segs, _ = model.transcribe(y.astype(np.float32))
            heard = words(' '.join(s.text for s in segs))
            got = sum(1 for w in want if w in heard)
            name = os.path.relpath(path, os.path.dirname(folder.rstrip('/')))
            print(f'{name:34} {pitch:5.0f}Hz {rough:6.2f} {len(want) / spoken * 60:5.0f}  {got}/{len(want)}', flush=True)


if __name__ == '__main__':
    main()
