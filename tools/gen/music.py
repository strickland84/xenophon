# /// script
# requires-python = ">=3.10"
# dependencies = ["soundfile", "numpy", "scipy", "requests"]
# ///
"""Writes the game's music with ElevenLabs Music (music_v2_5), from the recipe in tools/gen/sound_recipe.py
(MUSIC: a piece for each kind of place and a few stings, laid out section by section, several takes of each).

  uv run tools/gen/music.py                   every piece that has no takes yet
  uv run tools/gen/music.py space combat      only these, replacing their takes
  uv run tools/gen/music.py --all             every piece, replacing everything
  uv run tools/gen/music.py --refinish        trim, fade and even the raw takes again, sending nothing

The key is James's (a paid plan, 2026-11-19): ELEVENLABS_API_KEY, or --key-file with the key in it. It is
never written into the project. Only the recipe's words go to the service.

The game plays one take after another, cross-fading (src/lib/audio/music.ts), so each take is trimmed of
silence, given a fade in and out, and evened to its piece's loudness here; a sting keeps its attack and gets
only a short fade at its end.

Raw takes go to art/audio/raw/music/ (MP3 as sent, with ids.json: each take's song id) and the finished ones
to art/audio/takes/music/<name>_<n>.flac (stereo, 44.1 kHz), neither kept in git; tools/audio/pack.py
measures them, chooses, and puts them into the game.
"""

import argparse
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sound_recipe import MUSIC  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
RAW = os.path.join(ROOT, "art", "audio", "raw", "music")
TAKES = os.path.join(ROOT, "art", "audio", "takes", "music")
IDS = os.path.join(RAW, "ids.json")
RATE = 44100
URL = "https://api.elevenlabs.io/v1/music?output_format=mp3_48000_192"
MODEL = "music_v2_5"
# how many pieces are asked for at once
AT_ONCE = 3
PEAK = 10 ** (-1.0 / 20)
FADE_IN = 3.0
FADE_OUT = 8.0


def rms_db(x):
    return 20 * np.log10(np.sqrt(np.mean(x * x)) + 1e-12)


def close_gaps(x):
    """The service sometimes leaves a break between two sections: the music dies away over a second or two to
    near-silence and starts again. In a game that is a hole in the middle of a fight. Each stretch inside a piece
    over 14 dB under its median, with the dying away before it (back to where it was within 6 dB of the median), is
    cut out, the two sides cross-faded over 0.15 s."""
    mono = np.abs(x).mean(axis=1)
    frame = int(0.05 * RATE)
    n = len(mono) // frame
    db = 20 * np.log10(np.sqrt((mono[: n * frame].reshape(n, frame) ** 2).mean(axis=1)) + 1e-9)
    mid = np.median(db)
    cross = int(0.15 * RATE)
    # (not the ends: they are faded anyway)
    lo, hi = int(5 / 0.05), n - int(4 / 0.05)
    cuts, i = [], lo
    while i < hi:
        if db[i] < mid - 14:
            j = i
            while j < n and db[j] < mid - 14:
                j += 1
            k = i
            while k > lo and db[k - 1] < mid - 6:
                k -= 1
            if j < hi and (j - k) * 0.05 > 0.5:
                cuts.append((k * frame, j * frame))
            i = j
        else:
            i += 1
    if not cuts:
        return x
    parts, at = [], 0
    for a, b in cuts:
        parts.append(x[at:a])
        at = b
    parts.append(x[at:])
    y = parts[0]
    ramp = np.linspace(0, 1, cross)[:, None]
    for part in parts[1:]:
        if len(y) < cross or len(part) < cross:
            y = np.concatenate([y, part])
            continue
        y = np.concatenate([y[:-cross], y[-cross:] * (1 - ramp) + part[:cross] * ramp, part[cross:]])
    return y


def finish(raw, piece):
    """Trimmed of silence at both ends and of gaps inside, faded in and out (a sting: only out, briefly), evened to the piece's
    loudness (the peak kept under PEAK)."""
    x = raw if raw.ndim > 1 else np.stack([raw, raw], axis=1)
    x = x.astype(np.float64) - x.mean(axis=0)
    mono = np.abs(x).mean(axis=1)
    frame = int(0.02 * RATE)
    env = np.sqrt(np.add.reduceat(mono * mono, np.arange(0, len(mono), frame)) / frame)
    some = np.where(env > env.max() * 0.01)[0]
    if len(some):
        x = x[some[0] * frame : (some[-1] + 1) * frame]
    if piece.steady:
        x = close_gaps(x)
    fade_in, fade_out = (0.01, 1.0) if piece.sting else (FADE_IN, FADE_OUT)
    n_in, n_out = int(fade_in * RATE), min(int(fade_out * RATE), len(x) // 3)
    x[:n_in] *= (np.sin(np.linspace(0, np.pi / 2, n_in)) ** 2)[:, None]
    x[-n_out:] *= (np.cos(np.linspace(0, np.pi / 2, n_out)) ** 2)[:, None]
    # loudness: over the louder half of its seconds (a sting's: of its tenths), so a quiet intro does not count
    step = RATE // 10 if piece.sting else RATE
    secs = [x[i : i + step] for i in range(0, len(x) - step, step)]
    levels = sorted(rms_db(s) for s in secs)
    now = np.mean(levels[len(levels) // 2 :]) if levels else rms_db(x)
    x *= 10 ** ((piece.loud - now) / 20)
    top = np.abs(x).max()
    if top > PEAK:
        x *= PEAK / top
    return x.astype(np.float32)


def read(path):
    """An MP3 as samples at RATE (by ffmpeg)."""
    out = subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, "-f", "f32le", "-ac", "2", "-ar", str(RATE), "-"],
                         check=True, capture_output=True).stdout
    return np.frombuffer(out, dtype=np.float32).reshape(-1, 2)


def ask(key, piece, out):
    """One take of a piece from the service, as MP3; gives its song id."""
    body = {"model_id": MODEL, "composition_plan": piece.plan()}
    for attempt in range(4):
        r = requests.post(URL, headers={"xi-api-key": key, "Content-Type": "application/json"}, json=body, timeout=600)
        if r.status_code == 200:
            with open(out, "wb") as f:
                f.write(r.content)
            return r.headers.get("song-id", "")
        # (busy, or too many at once: wait and ask again; anything else is a fault in the recipe)
        if r.status_code in (429, 500, 502, 503, 504):
            time.sleep(20 * (attempt + 1))
            continue
        raise RuntimeError(f"{os.path.basename(out)}: {r.status_code} {r.text[:400]}")
    raise RuntimeError(f"{os.path.basename(out)}: gave up after retries")


def make_take(key, name, n, ids):
    piece = MUSIC[name]
    raw = os.path.join(RAW, f"{name}_{n}.mp3")
    start = time.time()
    ids[f"{name}_{n}"] = ask(key, piece, raw)
    x = finish(read(raw), piece)
    sf.write(os.path.join(TAKES, f"{name}_{n}.flac"), x, RATE)
    print(f"{name}_{n}  {len(x) / RATE:6.1f}s  (made in {time.time() - start:.0f}s)", flush=True)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--refinish", action="store_true", help="trim, fade and even the raw takes again, sending nothing")
    ap.add_argument("--key-file", help="a file holding the ElevenLabs key (else ELEVENLABS_API_KEY)")
    a = ap.parse_args()
    unknown = [n for n in a.names if n not in MUSIC]
    if unknown:
        sys.exit("no such piece: " + ", ".join(unknown))
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(TAKES, exist_ok=True)
    names = [n for n in MUSIC if not a.names or n in a.names]
    if a.refinish:
        for name in names:
            n = 1
            while os.path.exists(os.path.join(RAW, f"{name}_{n}.mp3")):
                sf.write(os.path.join(TAKES, f"{name}_{n}.flac"), finish(read(os.path.join(RAW, f"{name}_{n}.mp3")), MUSIC[name]), RATE)
                n += 1
        return
    key = open(a.key_file).read().strip() if a.key_file else os.environ.get("ELEVENLABS_API_KEY", "")
    if not key:
        sys.exit("no key: ELEVENLABS_API_KEY or --key-file")
    if not a.names and not a.all:
        names = [n for n in names if not os.path.exists(os.path.join(TAKES, f"{n}_1.flac"))]
    ids = json.load(open(IDS)) if os.path.exists(IDS) else {}
    jobs = []
    for name in names:
        for old in os.listdir(TAKES):
            if old.rsplit("_", 1)[0] == name:
                os.remove(os.path.join(TAKES, old))
        jobs += [(name, n) for n in range(1, MUSIC[name].takes + 1)]
    faults = []

    def run(job):
        try:
            make_take(key, *job, ids)
        except Exception as e:  # (one take failing leaves the others)
            faults.append(str(e))
            print(f"FAILED {job[0]}_{job[1]}: {e}", file=sys.stderr, flush=True)

    with ThreadPoolExecutor(AT_ONCE) as pool:
        list(pool.map(run, jobs))
    with open(IDS, "w") as f:
        json.dump(ids, f, indent=1, sort_keys=True)
    if faults:
        sys.exit(f"{len(faults)} takes failed")


if __name__ == "__main__":
    main()
