# /// script
# requires-python = ">=3.10"
# dependencies = ["soundfile", "numpy", "scipy"]
# ///
"""Draws the game's sound effects with Stable Audio 3 (the small sound-effects model) in ComfyUI,
from the recipe in tools/gen/sound_recipe.py, and cuts each take to shape.

  uv run tools/gen/sounds.py                    every sound that has no takes yet
  uv run tools/gen/sounds.py cannon flak        only these, replacing their takes
  uv run tools/gen/sounds.py --all              every sound, replacing everything
  uv run tools/gen/sounds.py --seed 3 cannon    another set of takes of one

The model gives a few seconds of sound for a line of text; the game needs tighter than that (one
shot, not three; a blast that starts on its bang; an engine that repeats without a click), so each
take is cut by its sound's rule (sound_recipe.py: shot, tail, swell, loop). This follows Eminent
Domain's tools/audio/sfx.py, which found those rules.

Raw takes go to art/audio/raw/sfx/ and the cut ones to art/audio/takes/sfx/<name>_<n>.flac (mono,
44.1 kHz, peak at -1 dBFS), neither kept in git (the recipe and its seed make them again);
tools/audio/pack.py then measures them, chooses, and puts them into the game.

ComfyUI must be running, and this waits for anything already on its queue: the GPU is shared.
"""

import argparse
import os
import sys
import time

import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import comfy  # noqa: E402
from sound_recipe import LOOP, SHOT, SOUNDS, SWELL, TAIL  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "art", "audio", "raw", "sfx")
TAKES = os.path.join(ROOT, "art", "audio", "takes", "sfx")
RATE = 44100
PEAK = 10 ** (-1 / 20)  # every take is saved with its peak at -1 dBFS; the game's mix sets the levels


def smooth(x, n):
    """The average of each `n` samples round each sample (a running sum: quick however long `n` is)."""
    n = max(int(n), 1)
    c = np.concatenate([[0.0], np.cumsum(x)])
    lo = np.clip(np.arange(len(x)) - n // 2, 0, len(x))
    hi = np.clip(lo + n, 0, len(x))
    return (c[hi] - c[lo]) / np.maximum(hi - lo, 1)


def envelope(x, secs=0.004):
    return smooth(np.abs(x), secs * RATE)


def first_bang(x, share=0.25):
    """Where the sound really starts: just before it first gets loud (`share` of its loudest)."""
    env = envelope(x)
    loud = np.where(env > share * env.max())[0]
    return max(int(loud[0]) - int(0.004 * RATE), 0) if len(loud) else 0


def first_sound(x):
    """Where anything at all starts (-40 dB under its loudest): for sounds that rise slowly."""
    env = envelope(x, 0.01)
    some = np.where(env > env.max() * 0.01)[0]
    return max(int(some[0]) - int(0.01 * RATE), 0) if len(some) else 0


def last_sound(x):
    """Where it has died away to nothing (-50 dB under its loudest)."""
    env = envelope(x, 0.02)
    some = np.where(env > env.max() * 0.003)[0]
    return int(some[-1]) + 1 if len(some) else len(x)


def cut_shot(x, longest):
    """One bang, and nothing after the next one starts."""
    x = x[first_bang(x):]
    env = envelope(x, 0.01)
    top = env.max()
    # a second bang is the sound getting loud again after it has died right down; the first
    # few hundredths of a second are its own ringing
    skip = int(0.04 * RATE)
    quiet = np.where(env[skip:] < 0.12 * top)[0]
    end = min(int(longest * RATE), last_sound(x))
    if len(quiet):
        after = skip + int(quiet[0])
        again = np.where(env[after:] > 0.3 * top)[0]
        if len(again):
            end = min(end, after + int(again[0]) - int(0.01 * RATE))
    # (a crunch, of gravel or snow, is many small bangs: it is never cut shorter than half what it may
    # be, unless it has died away by then)
    return x[: max(end, min(int(0.5 * longest * RATE), last_sound(x)), int(0.03 * RATE))]


def fade(x, share, lead=0.003):
    """Fades the end out over `share` of it (and the first few milliseconds in, so nothing clicks)."""
    x = x.copy()
    n = max(int(len(x) * share), 1)
    x[-n:] *= np.linspace(1.0, 0.0, n) ** 2
    m = max(int(lead * RATE), 1)
    x[:m] *= np.linspace(0.0, 1.0, m)
    return x


def steadiest(x, length):
    """Where the stretch of `length` samples with the least change in loudness starts (the model
    tends to swell and fade a take, as if the thing went past)."""
    frame = int(0.1 * RATE)
    rms = np.sqrt(smooth(x * x, frame)[frame // 2 :: frame] + 1e-12)
    span = max(length // frame, 1)
    best, start = None, max((len(x) - length) // 2, 0)
    for i in range(0, max(len(rms) - span, 0) + 1):
        w = rms[i : i + span]
        score = w.std() / (w.mean() + 1e-9)
        if best is None or score < best:
            best, start = score, i * frame
    return min(start, max(len(x) - length, 0))


def even(x, secs=0.8):
    """Evens out slow rises and falls in loudness, keeping the fast texture."""
    env = np.sqrt(smooth(x * x, secs * RATE) + 1e-12)
    return x / env * env.mean()


def make_loop(x, secs, blend=0.5, slow=0.8):
    """A steady stretch whose end runs into its start without a seam: the start of the loop is mixed
    with what came after its end (`blend` seconds of it), so the join is a continuation. Rises and falls
    in loudness slower than `slow` seconds are evened out (an engine's hum keeps its slow life: 3 s)."""
    x = x[: last_sound(x)]
    n = int(secs * RATE)
    blend = int(blend * RATE)
    if len(x) < n + blend:
        x = np.concatenate([x, x[::-1]])  # (too short: it is played forwards then backwards)
    start = steadiest(x, n + blend)
    x = even(x, slow)
    body = x[start : start + n].copy()
    after = x[start + n : start + n + blend]
    ramp = np.sin(np.linspace(0.0, np.pi / 2, len(after))) ** 2
    body[: len(after)] = body[: len(after)] * ramp + after * (1.0 - ramp)
    return body


def shape(raw, how, keep, blend=0.5, slow=0.8):
    x = raw.mean(axis=1) if raw.ndim > 1 else raw
    x = x.astype(np.float64)
    x -= x.mean()
    # (a gentle high-pass at 25 Hz: nothing below it is heard, and it wastes the limiter's room)
    x = signal.sosfilt(signal.butter(2, 25, btype="highpass", fs=RATE, output="sos"), x)
    if how == SHOT:
        x = fade(cut_shot(x, keep), 0.35)
    elif how == TAIL:
        x = x[first_bang(x) :]
        x = fade(x[: min(int(keep * RATE), last_sound(x))], 0.3)
    elif how == SWELL:
        x = x[first_sound(x) :]
        x = fade(x[: min(int(keep * RATE), last_sound(x))], 0.25, lead=0.02)
    else:
        x = make_loop(x, keep, blend, slow)
    return (x / (np.abs(x).max() + 1e-9) * PEAK).astype(np.float32)


def make(name, seed):
    s = SOUNDS[name]
    raws = comfy.txt2audio(s.prompt(), os.path.join(RAW, name + ".flac"), seconds=s.seconds + 1, seed=seed, takes=s.takes)
    for old in os.listdir(TAKES):
        if old.rsplit("_", 1)[0] == name:
            os.remove(os.path.join(TAKES, old))
    for i, f in enumerate(raws):
        raw, rate = sf.read(f)
        if rate != RATE:
            raw = signal.resample_poly(raw, RATE, rate, axis=0)
        clip = shape(raw, s.cut, s.keep, s.blend, 3.0 if s.hum else 0.8)
        sf.write(os.path.join(TAKES, f"{name}_{i + 1}.flac"), clip, RATE)
        print(f"{name}_{i + 1}  {len(clip) / RATE:5.2f}s", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--reshape", action="store_true", help="cut the raw takes again, without the model")
    a = ap.parse_args()
    unknown = [n for n in a.names if n not in SOUNDS]
    if unknown:
        sys.exit("no such sound: " + ", ".join(unknown))
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(TAKES, exist_ok=True)
    for name in SOUNDS:
        if a.names and name not in a.names:
            continue
        if a.reshape:
            s = SOUNDS[name]
            i = 1
            while os.path.exists(os.path.join(RAW, f"{name}_{i}.flac")):
                raw, rate = sf.read(os.path.join(RAW, f"{name}_{i}.flac"))
                if rate != RATE:
                    raw = signal.resample_poly(raw, RATE, rate, axis=0)
                sf.write(os.path.join(TAKES, f"{name}_{i}.flac"), shape(raw, s.cut, s.keep, s.blend, 3.0 if s.hum else 0.8), RATE)
                i += 1
            continue
        if not a.names and not a.all and os.path.exists(os.path.join(TAKES, f"{name}_1.flac")):
            continue
        while comfy.busy():
            print("waiting for the queue to clear ...", file=sys.stderr)
            time.sleep(10)
        make(name, a.seed)


if __name__ == "__main__":
    main()
