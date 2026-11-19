# /// script
# requires-python = ">=3.10"
# dependencies = ["soundfile", "numpy", "scipy", "matplotlib"]
# ///
"""Draws the engines' sound as pictures, old against new, since nobody here can hear them: for each size of drive,
the spectrogram of each layer the game plays (idle, cruise or thrust, boost) on a scale of octaves, with what
tools/audio/pack.py measures of it (noise, whine, hiss, its centre to the ear), and the new drive's powering up and down.

  uv run tools/audio/engine_sheet.py [docs/art/gen/engine-sounds.png]

The old loops (engine_*, removed 2026-11-18) are read from art/audio/takes/sfx if they are still there (the takes are
not kept in git; a checkout made before then has them), the new ones (drive_*, power_*) likewise, each the take the
catalogue's measurements chose (art/audio/checks/measures.json).
"""

import json
import os
import sys

import numpy as np
import soundfile as sf
from scipy import signal

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import pack  # noqa: E402

TAKES = os.path.join(ROOT, "art", "audio", "takes", "sfx")
# the old loops' takes the game played until they were removed (the catalogue of commit 477444f)
OLD_USE = {"light": (3, 3, 2), "medium": (3, 3, 2), "heavy": (3, 2, 2)}


def main():
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    out = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "docs", "art", "gen", "engine-sounds.png")
    use = {k.split("/")[1]: v["use"][0] for k, v in json.load(open(os.path.join(ROOT, "art", "audio", "checks", "measures.json"))).items()}
    rows = []
    for size in ("light", "medium", "heavy"):
        old = [f"engine_{size}_{s}_{n}" for s, n in zip(("idle", "cruise", "boost"), OLD_USE[size])]
        new = [f"drive_{size}_{s}_{use[f'drive_{size}_{s}']}" for s in ("idle", "thrust", "boost")]
        rows.append(old + new)
    rows.append([None, None, None, f"power_up_{use['power_up']}", f"power_down_{use['power_down']}", None])
    plt.rcParams.update({"font.size": 7, "axes.facecolor": "black"})
    fig, ax = plt.subplots(len(rows), 6, figsize=(18, 2.9 * len(rows)), squeeze=False)
    for r, row in enumerate(rows):
        for c, name in enumerate(row):
            a = ax[r][c]
            path = os.path.join(TAKES, f"{name}.flac") if name else ""
            if not name or not os.path.exists(path):
                a.axis("off")
                continue
            x, rate = sf.read(path)
            m = x.mean(axis=1) if x.ndim > 1 else x
            f, t, z = signal.stft(m, rate, nperseg=4096, noverlap=3072)
            db = 20 * np.log10(np.abs(z) + 1e-9)
            keep = (f >= 25) & (f <= 16000)
            a.pcolormesh(t, f[keep], db[keep], cmap="magma", vmin=db.max() - 75, vmax=db.max(), shading="auto", rasterized=True)
            a.set_yscale("log")
            a.set_ylim(25, 16000)
            a.set_yticks([50, 100, 250, 500, 1000, 2000, 4000, 8000, 16000])
            a.set_yticklabels(["50", "100", "250", "500", "1k", "2k", "4k", "8k", "16k"])
            a.set_xlabel("seconds")
            h = pack.hum_shape(m, rate)
            at = f" at {h['at']} Hz" if h["whine"] else ""
            a.set_title(f"{'OLD' if name.startswith('engine_') else 'NEW'} {name}\nnoise {h['noise']:.2f}   whine {h['whine']:.0f} dB{at}\n"
                        f"hiss {h['hiss']:.0f} dB   centre {h['centre']} Hz", color="#a02010" if name.startswith("engine_") else "#106020",
                        fontsize=7)
    fig.suptitle("The engines, old (left, removed: 'a whining repeating wind noise') against new (right): spectrograms on octaves, 75 dB of range.\n"
                 "noise: 0 tones … 0.6+ a rumble or wind; whine: a narrow peak over 800 Hz above its neighbours; hiss: 2–8 kHz over <500 Hz.",
                 fontsize=9)
    fig.tight_layout()
    fig.savefig(out, dpi=72)
    print(out)


if __name__ == "__main__":
    main()
