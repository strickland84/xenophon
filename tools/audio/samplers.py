# /// script
# requires-python = ">=3.10"
# dependencies = ["kokoro-onnx", "soundfile", "numpy", "scipy"]
# ///
"""Makes the sampler files James listens to: a few mixes, each a scene as the game mixes it, then
every sound in it alone, with a voice saying each one's number first, so he can say "seven is weak"
and it is clear which take he means. After Eminent Domain's tools/audio/numbered_sampler.py.

  node tools/sound-check.mjs              # first: renders the scenes (art/audio/raw/scenes/*.wav)
  uv run tools/audio/samplers.py          # then: art/audio/samplers/1-combat.mp3 … 5-music.mp3

The numbers run on from file to file; art/audio/samplers/index.txt says which is which (the sound,
its take, and its name on the sampler page /sounds). The voice is Kokoro (Apache 2.0), run on the CPU,
from the files Eminent Domain fetched into ~/.cache/eminent/kokoro (nothing is downloaded here).
"""

import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools", "gen"))
from sound_recipe import LOOP, MUSIC, SOUNDS  # noqa: E402

TAKES = os.path.join(ROOT, "art", "audio", "takes")
SCENES = os.path.join(ROOT, "art", "audio", "raw", "scenes")
OUT = os.path.join(ROOT, "art", "audio", "samplers")
CACHE = os.path.expanduser("~/.cache/eminent/kokoro")
RATE = 44100

# each file: its scenes (tools/sound-check.mjs), then the sounds in it, alone
FILES = [
    ("1-combat", "A fight", ["combat"], ["cannon", "flak", "laser_pulse", "hit_hull", "hit_shield", "shield_down", "shield_up", "lock_tick",
                                         "locked", "lock_tone", "no_lock", "missile_launch", "missile_warning", "dodged", "mine_drop", "overheat",
                                         "explosion_small", "explosion_large", "kill", "ambush", "alarm_hull", "over"]),
    ("2-flying", "Flying", ["flying", "engines"], [n for n in SOUNDS if n.startswith("drive_") or n.startswith("power_")] + [
        "lift", "brake", "land", "bank", "thunder", "burn", "breakout", "entry", "spool", "cruise_punch", "cruise_drive", "charge", "jump", "dock",
        "blackhole", "mining_laser", "chunk", "scoop", "hold_full", "crate", "pickup"]),
    ("3-on-foot", "On foot", ["on-foot"], ["eject", "down_parachute", "down_wingsuit", "down_rotor", "down_shell", "down_cloak", "down_cap", "touchdown",
                                          "step_soft", "step_sand", "step_rock", "step_snow", "step_metal", "wade", "dive", "blaster", "cutter", "flare",
                                          "beacon", "call", "climb_out", "climb_in", "die"]),
    ("4-interface", "The interface", ["interface"], ["ui_open", "ui_close", "ui_move", "ui_select", "ui_confirm", "ui_error", "buy"]),
    ("5-music", "The music", ["music"], []),
]
# seconds of each piece of music played, from its middle
EXCERPT = 30


def game_takes(folder, name):
    """The takes the game plays, as the catalogue says (tools/audio/pack.py chose them)."""
    import json

    m = json.load(open(os.path.join(ROOT, "art", "audio", "checks", "measures.json")))
    return m[f"{folder}/{name}"]["use"]


def stereo(x, rate):
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    if rate != RATE:
        x = signal.resample_poly(x, RATE, rate, axis=0)
    return x.astype(np.float32)


def gap(secs):
    return np.zeros((int(secs * RATE), 2), dtype=np.float32)


def main():
    from kokoro_onnx import Kokoro

    tts = Kokoro(os.path.join(CACHE, "kokoro-v1.0.onnx"), os.path.join(CACHE, "voices-v1.0.bin"))

    def say(text):
        speech, rate = tts.create(text, voice="af_heart", speed=1.1, lang="en-us")
        return stereo(speech * 0.5, rate)

    os.makedirs(OUT, exist_ok=True)
    listing, n = [], 0
    for stem, title, scenes, names in FILES:
        parts = [say(f"{title}. As the game mixes it."), gap(0.5)]
        for s in scenes:
            x, rate = sf.read(os.path.join(SCENES, f"{s}.wav"), dtype="float32")
            parts += [stereo(x, rate), gap(1.0)]
        listing.append(f"\n{stem}.mp3: {title}, as the game mixes it ({', '.join(scenes)}), then each sound alone")
        if names:
            parts += [say("Then each sound alone."), gap(0.4)]
        for name in names:
            for take in game_takes("sfx", name):
                n += 1
                x, rate = sf.read(os.path.join(TAKES, "sfx", f"{name}_{take}.flac"), dtype="float32")
                if SOUNDS[name].cut == LOOP:
                    x = np.concatenate([x, x])  # (twice round, to hear the seam)
                parts += [say(f"{n}. {SOUNDS[name].label}, take {take}."), gap(0.3), stereo(x * 0.7, rate), gap(0.7)]
                listing.append(f"{n:3d}  {name}, take {take}: {SOUNDS[name].label}")
        if stem == "5-music":
            parts += [say("Then each piece the game plays, half a minute of each."), gap(0.4)]
            for name, piece in MUSIC.items():
                for take in game_takes("music", name):
                    n += 1
                    x, rate = sf.read(os.path.join(TAKES, "music", f"{name}_{take}.flac"), dtype="float32")
                    mid = max(0, len(x) // 2 - EXCERPT * rate // 2)
                    x = x[mid : mid + EXCERPT * rate].copy()
                    f = int(2 * rate)
                    ramp = np.linspace(0, 1, f)[:, None]
                    x[:f] *= ramp
                    x[-f:] *= ramp[::-1]
                    parts += [say(f"{n}. {piece.label}, take {take}."), gap(0.3), stereo(x * 2.0, rate), gap(1.0)]
                    listing.append(f"{n:3d}  music {name}, take {take}: {piece.label} (the middle {EXCERPT} s)")
        whole = np.concatenate(parts)
        whole /= max(1.0, float(np.abs(whole).max()) / 0.95)
        wav = os.path.join(OUT, stem + ".wav")
        sf.write(wav, whole, RATE, subtype="PCM_16")
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", wav, "-c:a", "libmp3lame", "-q:a", "5", os.path.join(OUT, stem + ".mp3")], check=True)
        os.remove(wav)
        print(f"{stem}.mp3  {len(whole) / RATE / 60:.1f} min", flush=True)
    with open(os.path.join(OUT, "index.txt"), "w") as f:
        f.write("The sampler files (tools/audio/samplers.py). Nobody has heard them. Each number is the sound's take as the\n")
        f.write("game plays it; the sampler page (/sounds, in the game's site) has every other take of each beside it.\n")
        f.write("\n".join(listing) + "\n")


if __name__ == "__main__":
    main()
