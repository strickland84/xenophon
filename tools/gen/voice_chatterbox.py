# /// script
# requires-python = ">=3.10,<3.12"
# dependencies = ["chatterbox-tts", "soundfile", "numpy", "setuptools<81"]
# ///
"""Reads the narrator's test passage (tools/gen/voice_recipe.py) with Chatterbox, in its own voice and in
voices it takes from Kokoro's deepened samples (run tools/gen/voice_kokoro.py first).

  uv run tools/gen/voice_chatterbox.py           every take in TAKES
  uv run tools/gen/voice_chatterbox.py lewis     only the takes whose names hold these words

Runs on the processor: the GPU is shared, and a few takes do not need it (about a minute each). The model
(MIT) comes from ResembleAI/chatterbox on Hugging Face. Writes art/audio/voice/chatterbox/<take>.wav and an
.mp3 beside it. `exaggeration` is how much feeling (0.5 its plain reading); a lower `cfg` reads slower and
more deliberately. Seeded, so a take comes out the same each time. (setuptools<81: Chatterbox's watermarking
library, perth, needs its pkg_resources, and is quietly None without it.)
"""

import os
import subprocess
import sys

os.environ.setdefault('CUDA_VISIBLE_DEVICES', '')

import soundfile as sf
import torch
from chatterbox.tts import ChatterboxTTS

sys.path.insert(0, os.path.dirname(__file__))
from voice_recipe import OUT, PASSAGE  # noqa: E402

# (name, the voice to take: a deepened Kokoro sample, or None for Chatterbox's own, exaggeration, cfg. James,
# 2026-11-18: deep, gravelly and slow; so the lowest and roughest of tools/audio/voice_check.py's measures)
TAKES = [
    ('lewis3', 'bm_lewis_down3', 0.6, 0.3),
    ('lewis5', 'bm_lewis_down5', 0.6, 0.3),
    ('onyx3', 'am_onyx_down3', 0.6, 0.3),
    ('george5', 'bm_george_down5', 0.6, 0.3),
    ('fenrir5', 'am_fenrir_down5', 0.6, 0.3),
    ('lewis3-dramatic', 'bm_lewis_down3', 0.8, 0.25),
]
SEED = 7


def main():
    words = sys.argv[1:]
    takes = [t for t in TAKES if not words or any(w in t[0] for w in words)]
    out = os.path.join(OUT, 'chatterbox')
    os.makedirs(out, exist_ok=True)
    # (few threads: the processor is shared, and more than it has free makes every step crawl)
    torch.set_num_threads(8)
    model = ChatterboxTTS.from_pretrained(device='cpu')
    for name, voice, exaggeration, cfg in takes:
        prompt = os.path.join(OUT, 'kokoro', f'{voice}.wav') if voice else None
        if prompt and not os.path.exists(prompt):
            print(f'{name}: no {prompt} (run voice_kokoro.py first)')
            continue
        torch.manual_seed(SEED)
        wav = model.generate(PASSAGE, audio_prompt_path=prompt, exaggeration=exaggeration, cfg_weight=cfg)
        path = os.path.join(out, f'{name}.wav')
        sf.write(path, wav.squeeze(0).numpy(), model.sr)
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-b:a', '160k', path[:-4] + '.mp3'], check=True)
        print(f'{name}: {wav.shape[-1] / model.sr:.1f} s', flush=True)


if __name__ == '__main__':
    main()
