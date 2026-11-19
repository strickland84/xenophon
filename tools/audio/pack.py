# /// script
# requires-python = ">=3.10"
# dependencies = ["soundfile", "numpy", "scipy", "matplotlib"]
# ///
"""Puts the generated sound into the game: measures every take, chooses, encodes, and writes the
catalogue the game reads.

  uv run tools/audio/pack.py              everything (the effects and the music)
  uv run tools/audio/pack.py --no-plots   without drawing the check pictures

For every take in art/audio/takes/ (tools/gen/sounds.py and music.py make them) it measures how
long it is, how loud (a K-weighted loudness, as broadcasters measure it, at its loudest 400 ms for an
effect and over its louder half for a piece of music), its peak, how much of the model's own output
was clipped, the silence at each end, how like plain noise it is (spectral flatness), how many
separate bangs a shot has, and how steady a loop is. Then, for each sound, unless the recipe
(tools/gen/sound_recipe.py) says `use`, it chooses the best-measured takes: none empty, clipped or
noise, a shot with one bang, a loop steady, and the rest by loudness. Nobody can hear on this
machine: that is the most measuring can do, and `use` is how a listener overrules it.

It writes:
  static/audio/sfx/<name>_<n>.ogg     every take (Opus, mono), for the game and the sampler page
  static/audio/music/<name>_<n>.ogg   every take of every piece (Opus, stereo)
  (no MP3: every browser the game is for plays Opus; James, 2026-11-19, "assume modern browsers")
  src/lib/audio/catalogue.ts          what there is, which takes the game plays, and how to even them
  art/audio/checks/measures.txt       the measurements, take by take, with anything that looks wrong
  art/audio/checks/*.png              waveform and spectrogram of the chosen takes, group by group
"""

import json
import os
import subprocess
import sys

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "tools", "gen"))
from sound_recipe import LOOP, MUSIC, SHOT, SOUNDS  # noqa: E402

TAKES = os.path.join(ROOT, "art", "audio", "takes")
STATIC = os.path.join(ROOT, "static", "audio")
CHECKS = os.path.join(ROOT, "art", "audio", "checks")
CATALOGUE = os.path.join(ROOT, "src", "lib", "audio", "catalogue.ts")

# the loudness every effect is evened to by its gain in the catalogue (the game's mix then sets each one's level)
EFFECT_LOUDNESS = -14.0
# how far a take's gain may go to even it (a quiet click is not made into a roar)
GAIN_MOST = 2.0
# Opus (the music at 64 kbps: the fights are dense, drums and brass)
OPUS_EFFECT = ["-c:a", "libopus", "-b:a", "48k", "-ac", "1", "-application", "audio"]
OPUS_MUSIC = ["-c:a", "libopus", "-b:a", "64k", "-ac", "2", "-application", "audio"]


# ── measuring

def biquad(kind, f0, q, gain_db, rate):
    """A filter from the audio EQ cookbook (high shelf or high pass), as second-order sections."""
    a = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / rate
    cw, alpha = np.cos(w), np.sin(w) / (2 * q)
    if kind == "shelf":
        b = [a * ((a + 1) + (a - 1) * cw + 2 * np.sqrt(a) * alpha), -2 * a * ((a - 1) + (a + 1) * cw),
             a * ((a + 1) + (a - 1) * cw - 2 * np.sqrt(a) * alpha)]
        d = [(a + 1) - (a - 1) * cw + 2 * np.sqrt(a) * alpha, 2 * ((a - 1) - (a + 1) * cw), (a + 1) - (a - 1) * cw - 2 * np.sqrt(a) * alpha]
    else:
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]
        d = [1 + alpha, -2 * cw, 1 - alpha]
    return np.array([b + d]) / d[0]


def k_weight(x, rate):
    """The K-weighting of ITU-R BS.1770: a high shelf of +4 dB from 1.5 kHz and a high pass at 38 Hz."""
    x = signal.sosfilt(biquad("shelf", 1681.97, 0.7072, 4.0, rate), x, axis=0)
    return signal.sosfilt(biquad("pass", 38.14, 0.5003, 0, rate), x, axis=0)


def loudness_blocks(x, rate, secs=0.4):
    """The loudness (LUFS-like, dB) of each 400 ms block, a quarter overlapped."""
    k = k_weight(x, rate)
    power = (k * k).sum(axis=1) if k.ndim > 1 else k * k
    n, hop = int(secs * rate), int(secs * rate / 4)
    if len(power) < n:
        return np.array([-0.691 + 10 * np.log10(power.mean() * len(power) / n + 1e-12)])
    c = np.concatenate([[0.0], np.cumsum(power)])
    starts = np.arange(0, len(power) - n + 1, hop)
    return -0.691 + 10 * np.log10((c[starts + n] - c[starts]) / n + 1e-12)


def flatness(x, rate):
    """How like plain noise it is, 0 (pure tones) … about 0.56 (white noise), over the frames with sound in them."""
    m = x.mean(axis=1) if x.ndim > 1 else x
    f, t, s = signal.stft(m, rate, nperseg=1024)
    p = np.abs(s) ** 2 + 1e-14
    energy = p.sum(axis=0)
    keep = energy > energy.max() * 0.01
    if not keep.any():
        return 0.0
    p = p[:, keep]
    return float(np.median(np.exp(np.log(p).mean(axis=0)) / p.mean(axis=0)))


def centroid(x, rate):
    """Where the weight of its sound is (Hz): low rumble, or bright."""
    m = x.mean(axis=1) if x.ndim > 1 else x
    spec = np.abs(np.fft.rfft(m * np.hanning(len(m)))) ** 2
    freqs = np.fft.rfftfreq(len(m), 1 / rate)
    return float((spec * freqs).sum() / (spec.sum() + 1e-12))


def bangs(m, rate):
    """How many separate bangs: the sound rising past half its loudest after falling under a sixth of it."""
    n = max(int(0.01 * rate), 1)
    c = np.concatenate([[0.0], np.cumsum(np.abs(m))])
    env = (c[n:] - c[:-n]) / n
    top = env.max() + 1e-12
    count, low = 0, True
    for v in env[:: max(n // 4, 1)]:
        if low and v > 0.5 * top:
            count, low = count + 1, False
        elif v < top / 6:
            low = True
    return count


def ends(m, rate):
    """Seconds of silence before the sound starts (-40 dB under its peak) and after it has died (-50 dB)."""
    a = np.abs(m)
    top = a.max() + 1e-12
    on = np.where(a > top * 0.01)[0]
    off = np.where(a > top * 0.003)[0]
    if not len(on):
        return len(m) / rate, len(m) / rate
    return on[0] / rate, (len(m) - off[-1] - 1) / rate


def steadiness(m, rate):
    """How much a loop's loudness wanders, tenth of a second to tenth of a second (the spread over the mean)."""
    frame = int(0.1 * rate)
    blocks = [np.sqrt(np.mean(m[i : i + frame] ** 2)) for i in range(0, len(m) - frame + 1, frame)]
    return float(np.std(blocks) / (np.mean(blocks) + 1e-12)) if blocks else 0.0


def dropout(m, rate):
    """For a loop: how far its quietest 50 ms falls under its median (dB): a stutter, heard every time round."""
    n = int(0.05 * rate)
    db = [20 * np.log10(np.sqrt(np.mean(m[i : i + n] ** 2)) + 1e-12) for i in range(0, len(m) - n + 1, n)]
    return float(np.median(db) - np.min(db)) if db else 0.0


def seam(m, rate):
    """For a loop: how different its end is from its start, in loudness (dB) over 50 ms either side."""
    n = int(0.05 * rate)
    a = np.sqrt(np.mean(m[-n:] ** 2)) + 1e-9
    b = np.sqrt(np.mean(m[:n] ** 2)) + 1e-9
    return float(abs(20 * np.log10(a / b)))


def jumps(m, rate):
    """For a loop: how far its loudness jumps from one 50 ms to the next inside it (dB, the 95th percentile): a hum that
    throbs jumps that far anyway, and its seam is only a fault if it jumps further."""
    n = int(0.05 * rate)
    db = np.array([20 * np.log10(np.sqrt(np.mean(m[i : i + n] ** 2)) + 1e-12) for i in range(0, len(m) - n + 1, n)])
    return float(np.percentile(np.abs(np.diff(db)), 95)) if len(db) > 2 else 0.0


def music_shape(x, rate):
    """For music: how spiky it is (dB from its median half-second to its loudest twentieth), the seconds of
    near-silence inside it (25 dB under its median, away from the fades), and its share of energy above 4 kHz."""
    m = x.mean(axis=1) if x.ndim > 1 else x
    half = rate // 2
    db = np.array([20 * np.log10(np.sqrt(np.mean(m[i : i + half] ** 2)) + 1e-12) for i in range(0, len(m) - half + 1, half)])
    mid = np.median(db)
    inner = db[12:-12] if len(db) > 30 else db
    spec = np.abs(np.fft.rfft(m)) ** 2
    freqs = np.fft.rfftfreq(len(m), 1 / rate)
    return {
        "swing": round(float(np.percentile(db, 95) - mid), 1),
        "gaps": round(float(np.sum(inner < mid - 25) / 2), 1),
        "high": round(float(spec[freqs > 4000].sum() / (spec.sum() + 1e-12)), 4),
    }


def a_weight(f):
    """The A-weighting (dB) at each frequency: how much less loud the ear finds it than 1 kHz."""
    f2 = np.maximum(f, 1.0) ** 2
    ra = 12194**2 * f2**2 / ((f2 + 20.6**2) * np.sqrt((f2 + 107.7**2) * (f2 + 737.9**2)) * (f2 + 12194**2))
    return 20 * np.log10(ra + 1e-30) + 2.0


def k_gain(f, rate=44100):
    """The K-weighting's power gain at a frequency (k_weight's filters: loudness as BS.1770 weighs it, all but flat
    over the hum's range, unlike the A-weighting, which is for quiet sounds and all but ignores a rumble)."""
    sos = np.vstack([biquad("shelf", 1681.97, 0.7072, 4.0, rate), biquad("pass", 38.14, 0.5003, 0, rate)])
    _, h = signal.sosfreqz(sos, worN=[f], fs=rate)
    return float(np.abs(h[0]) ** 2)


def hum_shape(m, rate):
    """For an engine's hum, what James's ears found wrong with the old ones ("a whining repeating wind noise"),
    measured as an ear weighs it (A-weighted: rumble the ear hardly hears is not allowed to hide a hiss or a whine):
      centre  where the weight of it is to the ear (Hz)
      hiss    its energy from 2 to 8 kHz against its energy under 500 Hz (dB, unweighted): wind and hiss
      bright  its share to the ear above 2 kHz (dB): what a phone's speaker would mostly give of it
      noise   how like plain noise it is band by band (0 tones … about 0.6 noise), whatever its colour, each band
              weighed by its loudness (K-weighted): rushing air or a plain rumble near 0.6, a hum with a body of tones
              well under
      whine   how far the sharpest narrow peak above 800 Hz stands over the spectrum a third of an octave round it
              (dB), counting only peaks the ear would hear (within 30 dB of the loudest part to the ear)
      at      where that peak is (Hz)
      body    its share of loudness (K-weighted) from 150 Hz to 1 kHz (dB): what a laptop's or a phone's small speaker
              gives of it, where a hum all under 100 Hz is lost
      wander  how far its loudness wanders, 400 ms to 400 ms (the spread of the blocks' dB)"""
    f, p = signal.welch(m, rate, nperseg=8192)
    ear = p * 10 ** (a_weight(f) / 10)
    low = p[f < 500].sum()
    high = p[(f >= 2000) & (f < 8000)].sum()
    centre = float((ear * f).sum() / (ear.sum() + 1e-18))
    bright = float(10 * np.log10(ear[f >= 2000].sum() / (ear.sum() + 1e-18) + 1e-18))
    db = 10 * np.log10(ear + 1e-24)
    top = db.max()
    whine, at = 0.0, 0.0
    for i in np.where(f > 800)[0]:
        if db[i] < top - 30:
            continue
        lo, hi = np.searchsorted(f, f[i] / 1.26), np.searchsorted(f, f[i] * 1.26)
        rise = db[i] - np.median(db[lo:hi])
        if rise > whine:
            whine, at = float(rise), float(f[i])
    # (noise: in each third of an octave from 50 Hz to 5 kHz, frame by frame, the geometric mean of the power over
    # its mean; plain noise of any colour gives about 0.56 in every band, tones and their harmonics far less)
    ff, _, z = signal.stft(m, rate, nperseg=4096)
    pw = np.abs(z) ** 2 + 1e-24
    edges = 50 * 2 ** (np.arange(0, 21) / 3)
    flat, weight = 0.0, 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        band = (ff >= lo) & (ff < hi)
        if band.sum() < 4:
            continue
        q = pw[band]
        g = np.exp(np.log(q).mean(axis=0)) / q.mean(axis=0)
        w = q.mean() * k_gain(np.sqrt(lo * hi))
        flat += float(np.median(g)) * w
        weight += w
    loud = np.array([k_gain(x) for x in np.maximum(f, 1.0)]) * p
    body = float(10 * np.log10(loud[(f >= 150) & (f < 1000)].sum() / (loud.sum() + 1e-18) + 1e-18))
    blocks = loudness_blocks(m, rate)
    return {
        "centre": round(centre),
        "body": round(body, 1),
        "hiss": round(float(10 * np.log10(high / (low + 1e-18) + 1e-18)), 1),
        "bright": round(bright, 1),
        "noise": round(flat / (weight + 1e-30), 3),
        "whine": round(whine, 1),
        "at": round(at),
        "wander": round(float(np.std(blocks)), 2),
    }


# how an engine's hum must measure to be used (hum_shape; `noise` is the sound's own, sound_recipe.py `hum`)
HUM_LIMITS = {"centre": 900, "hiss": -20.0, "bright": -9.0, "whine": 12.0, "wander": 1.5}
# and a roar's (the thrusters' boost, which may be all but noise, sound_recipe.py `hum` 0.9 and over): its weight may sit
# higher, and its highs be stronger, but not a hiss and never a whine
ROAR_LIMITS = {"centre": 2000, "hiss": -9.0, "bright": -5.0, "whine": 12.0, "wander": 1.5}


def raw_clipping(raw_path):
    """The share of the model's own samples at full scale (the take was cut and evened after, so this is what was lost)."""
    if not os.path.exists(raw_path):
        # (the music's raw takes are the service's MP3s)
        raw_path = os.path.splitext(raw_path)[0] + ".mp3"
    if not os.path.exists(raw_path):
        return 0.0
    x, _ = sf.read(raw_path)
    return float(np.mean(np.abs(x) >= 0.999))


def measure(path, raw_path, kind, cut, keep=0, hum=0, bright=0.05):
    x, rate = sf.read(path)
    m = x.mean(axis=1) if x.ndim > 1 else x
    blocks = loudness_blocks(x, rate)
    if kind == "music":
        loud = float(np.mean(np.sort(blocks)[len(blocks) // 2 :]))
    else:
        loud = float(blocks.max()) if cut != LOOP else float(np.mean(blocks))
    lead, tail = ends(m, rate)
    r = {
        "seconds": round(len(m) / rate, 3),
        "loudness": round(loud, 1),
        "peak": round(float(20 * np.log10(np.abs(x).max() + 1e-12)), 1),
        "clipped": round(raw_clipping(raw_path), 5),
        "lead": round(lead, 3),
        "tail": round(tail, 3),
        "flatness": round(flatness(x, rate), 3),
        "centroid": round(centroid(x, rate)),
    }
    if cut == SHOT:
        r["bangs"] = bangs(m, rate)
    if cut == LOOP:
        r["steadiness"] = round(steadiness(m, rate), 3)
        r["seam"] = round(seam(m, rate), 2)
        r["dropout"] = round(dropout(m, rate), 1)
    if kind == "music":
        r.update(music_shape(x, rate))
        r["highOk"] = bright
    if hum:
        r.update(hum_shape(m, rate))
        r["jumps"] = round(jumps(m, rate), 2)
    flags = []
    if loud < -60 or r["seconds"] < 0.03:
        flags.append("empty")
    if r["flatness"] > 0.45:
        flags.append("noise")
    if r["clipped"] > 0.002:
        flags.append("clipped")
    if lead > (2.5 if kind == "music" else 0.05):
        flags.append("late start")
    if cut == SHOT and r["bangs"] > 1:
        flags.append(f"{r['bangs']} bangs")
    if cut == LOOP and r["steadiness"] > 0.25:
        flags.append("unsteady")
    if cut == LOOP and r["seam"] > max(3, r.get("jumps", 0)):
        flags.append("seam")
    if cut == LOOP and r["dropout"] > 10:
        flags.append("dropout")
    if cut == SHOT and r["seconds"] < 0.3 * keep and keep >= 0.2:
        flags.append("short")
    if hum:
        lim = ROAR_LIMITS if hum >= 0.9 else HUM_LIMITS
        if r["centre"] > lim["centre"]:
            flags.append("high")
        if r["hiss"] > lim["hiss"] or r["bright"] > lim["bright"]:
            flags.append("hiss")
        if r["whine"] > lim["whine"]:
            flags.append("whine")
        if r["noise"] > hum:
            flags.append("rushing")
        if r["wander"] > lim["wander"]:
            flags.append("wanders")
    if kind == "music" and r["gaps"] > 1:
        flags.append("silent gaps")
    if kind == "music" and r["swing"] > 12:
        flags.append("spiky")
    if kind == "music" and r["high"] > bright:
        flags.append("bright")
    r["flags"] = flags
    return r


def score(r, cut):
    """Higher is better: anything flagged is out of the running before the rest; then a little
    loudness and, for loops, steadiness; for an engine's hum, the less like noise and the more of it a
    small speaker gives, the better."""
    s = -10.0 * len(r["flags"])
    if "empty" in r["flags"] or "noise" in r["flags"]:
        s -= 100
    s += min(r["loudness"], -6) * 0.05
    if cut == LOOP:
        s -= r["steadiness"] * 4 + r["seam"] * 0.2 + r["dropout"] * 0.2
    if cut == SHOT:
        s -= max(r["bangs"] - 1, 0) * 3
    if cut == "music":
        s -= r["swing"] * 0.5 + r["gaps"] + max(0, r["high"] - r.get("highOk", 0.05)) * 40
    if "noise" in r and "body" in r:
        s -= r["noise"] * 8 - r["body"] * 0.15 + r["whine"] * 0.1 + r["wander"]
    return s


# ── encoding

def encode(src, dst, opts):
    """Encodes `src` to `dst` (unless `dst` is newer already), and gives its size."""
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return os.path.getsize(dst)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", src, *opts, dst], check=True)
    return os.path.getsize(dst)


def takes_of(folder, name):
    out, i = [], 1
    while os.path.exists(os.path.join(TAKES, folder, f"{name}_{i}.flac")):
        out.append(i)
        i += 1
    return out


def ts_string(s):
    return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main():
    plots = "--no-plots" not in sys.argv
    os.makedirs(CHECKS, exist_ok=True)
    measures, entries, sizes = {}, {"sfx": {}, "music": {}}, {"game": 0, "everything": 0}
    lines, flat = [], []
    for folder, table in (("sfx", SOUNDS), ("music", MUSIC)):
        kind = "music" if folder == "music" else "effect"
        for name, rec in table.items():
            ns = takes_of(folder, name)
            if not ns:
                print(f"no takes of {name} ({folder}): skipped", file=sys.stderr)
                continue
            cut = getattr(rec, "cut", "music")
            rs = {}
            for n in ns:
                path = os.path.join(TAKES, folder, f"{name}_{n}.flac")
                rs[n] = measure(path, os.path.join(ROOT, "art", "audio", "raw", folder, f"{name}_{n}.flac"), kind, cut, getattr(rec, "keep", 0),
                                getattr(rec, "hum", 0), getattr(rec, "bright", 0.05))
            want = getattr(rec, "variants", 1)
            if rec.use:
                use, by_ear = [n for n in rec.use if n in rs], True
            else:
                use, by_ear = sorted(sorted(rs, key=lambda n: -score(rs[n], cut))[:want]), False
            gains = {}
            for n in ns:
                src = os.path.join(TAKES, folder, f"{name}_{n}.flac")
                base = os.path.join(STATIC, folder, f"{name}_{n}")
                size = encode(src, base + ".ogg", OPUS_MUSIC if kind == "music" else OPUS_EFFECT)
                sizes["everything"] += size
                if n in use:
                    sizes["game"] += size
                if os.path.exists(base + ".mp3"):
                    os.remove(base + ".mp3")
                g = 1.0 if kind == "music" else float(np.clip(10 ** ((EFFECT_LOUDNESS - rs[n]["loudness"]) / 20), 1 / GAIN_MOST / 4, GAIN_MOST))
                gains[n] = round(g, 3)
            # (takes of this sound left over from before, beyond the ones there are now)
            for f in os.listdir(os.path.join(STATIC, folder)):
                stem, _ = os.path.splitext(f)
                if stem.rsplit("_", 1)[0] == name and int(stem.rsplit("_", 1)[1]) not in rs:
                    os.remove(os.path.join(STATIC, folder, f))
            measures[f"{folder}/{name}"] = {"use": use, "byEar": by_ear, "takes": rs}
            entries[folder][name] = {
                "group": getattr(rec, "group", "Music"),
                "label": rec.label,
                "loop": cut == LOOP,
                "use": use,
                "byEar": by_ear,
                "new": getattr(rec, "new", False),
                "takes": [{"n": n, "seconds": rs[n]["seconds"], "gain": gains[n], "flags": rs[n]["flags"]} for n in ns],
            }
            for n in ns:
                r = rs[n]
                flat.append(r)
                mark = "*" if n in use else " "
                extra = f" bangs {r['bangs']}" if "bangs" in r else ""
                extra += f" steady {r['steadiness']:.2f} seam {r['seam']:.1f}dB drop {r['dropout']:.0f}dB" if "steadiness" in r else ""
                extra += (f" hum: centre {r['centre']}Hz body {r['body']:.0f}dB hiss {r['hiss']:.0f}dB noise {r['noise']:.2f} "
                          f"whine {r['whine']:.0f}dB@{r['at']} wander {r['wander']:.1f}dB") if "body" in r else ""
                extra += f" swing {r['swing']:.0f}dB gaps {r['gaps']:.0f}s high {r['high'] * 100:.1f}%" if "swing" in r else ""
                lines.append(
                    f"{mark} {folder}/{name}_{n:<2} {r['seconds']:7.2f}s  loud {r['loudness']:6.1f}  peak {r['peak']:5.1f}  "
                    f"clip {r['clipped'] * 100:5.2f}%  lead {r['lead'] * 1000:5.0f}ms  tail {r['tail'] * 1000:5.0f}ms  "
                    f"flat {r['flatness']:.2f}  centre {r['centroid']:5d}Hz{extra}  {' '.join(r['flags'])}"
                )
            print(f"{folder}/{name}: takes {ns}, the game's {use}{' (by ear)' if by_ear else ''}", flush=True)
    with open(os.path.join(CHECKS, "measures.json"), "w") as f:
        json.dump(measures, f, indent=1)
    flagged = [line for line, r in zip(lines, flat) if line.startswith("*") and r["flags"]]
    with open(os.path.join(CHECKS, "measures.txt"), "w") as f:
        f.write("Every take, measured (tools/audio/pack.py). * the game's. None of it has been listened to.\n")
        f.write("loud: K-weighted loudness (an effect's loudest 400 ms, a loop's mean, music's louder half); peak dBFS of the file;\n")
        f.write("clip: share of the model's raw samples at full scale; lead/tail: silence at the ends; flat: 0 tones … 0.56 white noise;\n")
        f.write("centre: spectral centroid; bangs: separate bangs in a shot; steady: a loop's wander (spread/mean); seam: a loop's join;\n")
        f.write("drop: a loop's quietest 50 ms under its median;\n")
        f.write("swing: music's loudest moments over its median; gaps: seconds of near-silence inside it; high: its share above 4 kHz.\n")
        f.write("hum (the engines): centre to the ear; body: loudness from 150 Hz to 1 kHz; hiss: 2-8 kHz over <500 Hz; noise: how like\n")
        f.write("noise band by band (0 tones ... 0.6+ a rumble or wind); whine: a narrow peak above 800 Hz over its neighbours; wander: loudness spread.\n\n")
        f.write("\n".join(lines) + "\n")
        f.write(f"\nChosen takes with something flagged: {len(flagged)}\n" + "\n".join(flagged) + "\n")
    write_catalogue(entries, sizes)
    print(f"the game's files: {sizes['game'] / 1e6:.2f} MB; "
          f"every take: {sizes['everything'] / 1e6:.2f} MB")
    if plots:
        draw(entries)


def write_catalogue(entries, sizes):
    def clip_ts(name, e):
        takes = ", ".join(
            "{ n: %d, seconds: %s, gain: %s, flags: [%s] }" % (t["n"], t["seconds"], t["gain"], ", ".join(ts_string(x) for x in t["flags"]))
            for t in e["takes"]
        )
        fresh = ", new: true" if e.get("new") else ""
        return (f"  {name}: {{ group: {ts_string(e['group'])}, label: {ts_string(e['label'])}, loop: {str(e['loop']).lower()}, "
                f"use: [{', '.join(map(str, e['use']))}], byEar: {str(e['byEar']).lower()}{fresh}, takes: [{takes}] }},")

    out = [
        "// Generated by tools/audio/pack.py from tools/gen/sound_recipe.py and the takes it measured: never edited by hand.",
        "//",
        "// Every sound effect and piece of music there is, each with its takes (the model's attempts, numbered from 1,",
        "// as the sampler page /sounds lists them), which of them the game plays (`use`: chosen by measuring, or by",
        "// ear when `byEar`), how long each is, the gain that evens its loudness with the others, and anything the",
        "// measuring found wrong with it. The files are static/audio/<sfx|music>/<name>_<n>.ogg (Opus).",
        "",
        "export interface Take {",
        "  n: number",
        "  seconds: number",
        "  /** what evens its loudness with the other effects' (music: 1) */",
        "  gain: number",
        "  flags: string[]",
        "}",
        "",
        "export interface Clip {",
        "  /** where the sampler page lists it, and what it is in plain words */",
        "  group: string",
        "  label: string",
        "  /** a steady sound that repeats without a seam */",
        "  loop: boolean",
        "  /** the takes the game plays (more than one: it takes turns) */",
        "  use: number[]",
        "  byEar: boolean",
        "  /** made since James last listened (the sampler page marks it) */",
        "  new?: boolean",
        "  takes: Take[]",
        "}",
        "",
        "export type EffectName =",
        *[f"  | '{n}'" for n in entries["sfx"]],
        "",
        "export type PieceName =",
        *[f"  | '{n}'" for n in entries["music"]],
        "",
        "export const EFFECTS: Record<EffectName, Clip> = {",
        *[clip_ts(n, e) for n, e in entries["sfx"].items()],
        "}",
        "",
        "export const PIECES: Record<PieceName, Clip> = {",
        *[clip_ts(n, e) for n, e in entries["music"].items()],
        "}",
        "",
        "/** bytes: the files the game plays, and every take (for the sampler page) */",
        f"export const AUDIO_BYTES = {{ game: {sizes['game']}, everything: {sizes['everything']} }}",
        "",
    ]
    with open(CATALOGUE, "w") as f:
        f.write("\n".join(out))


def draw(entries):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    groups = {}
    for folder in ("sfx", "music"):
        for name, e in entries[folder].items():
            for n in e["use"]:
                groups.setdefault(e["group"], []).append((folder, name, n))
    for group, items in groups.items():
        cols = 6 if group != "Music" else 3
        rows = (len(items) + cols - 1) // cols
        fig, ax = plt.subplots(rows * 2, cols, figsize=(2.7 * cols, 1.7 * rows * 2), squeeze=False)
        for a in ax.flat:
            a.axis("off")
        for i, (folder, name, n) in enumerate(items):
            r, c = (i // cols) * 2, i % cols
            x, rate = sf.read(os.path.join(TAKES, folder, f"{name}_{n}.flac"))
            m = x.mean(axis=1) if x.ndim > 1 else x
            ax[r][c].axis("on")
            ax[r + 1][c].axis("on")
            ax[r][c].plot(np.arange(len(m)) / rate, m, lw=0.3, color="#203040")
            ax[r][c].set_ylim(-1, 1)
            ax[r][c].set_title(f"{name}_{n}  {len(m) / rate:.2f}s", fontsize=7)
            ax[r + 1][c].specgram(m + 1e-9, NFFT=1024 if folder == "music" else 256, Fs=rate, noverlap=768 if folder == "music" else 192,
                                  cmap="magma", vmin=-120, vmax=-20)
            ax[r + 1][c].set_ylim(0, 16000)
            for a in (ax[r][c], ax[r + 1][c]):
                a.tick_params(labelsize=5)
        fig.suptitle(f"{group}: the game's takes (tools/audio/pack.py)", fontsize=9)
        fig.tight_layout()
        slug = group.lower().replace(",", "").replace(" ", "-")
        fig.savefig(os.path.join(CHECKS, f"{slug}.png"), dpi=70)
        plt.close(fig)


if __name__ == "__main__":
    main()
    # (the files' fingerprints, so a browser fetches those made again afresh: tools/audio/fingerprints.mjs)
    subprocess.run(["node", os.path.join(os.path.dirname(os.path.abspath(__file__)), "fingerprints.mjs")], check=True)
