#!/usr/bin/env python3
"""INTRO DISTINCTNESS — the evidence for task #135.

The complaint the intros fix is measurable: "the openings all sound alike".
This probe turns that into a number. It takes the FIRST 8 SECONDS of each of the
ten non-theme scenes, reduces each to a fixed "intro fingerprint" (timbre +
tonality + onset/rhythm shape), and computes the distance between EVERY pair.
The two theme tracks (menu, menuNocturne) are excluded — they are out of scope
and untouched.

    python3 tools/bgm-gen/probe/intro_distinct.py                 # the ten shipped mp3s
    python3 tools/bgm-gen/probe/intro_distinct.py --dir DIR       # any dir of <scene>.mp3
    python3 tools/bgm-gen/probe/intro_distinct.py --before DIR_A --after DIR_B

THE FINGERPRINT (all pure numpy, no librosa/scipy):
  * SEGMENTED MFCC — the 8 s is split into four 2 s blocks and MFCC(13) is
    averaged in each, so the OPENING blocks (where a signature actually lives)
    get full weight instead of being averaged into the shared body. This is the
    part that answers "does the head unfold differently?".
  * MFCC(20) mean+std over the whole window — overall colour and how much it moves;
  * chroma(12) mean — the pitch-class content of the opening;
  * a coarse 8-bin temporal profile of the spectral-flux ONSET envelope plus its
    mean/std — the rhythmic/attack shape of the head;
  * six log band energies at t≈0-0.5 s — the first-impression transient.
Each dimension is z-scored ACROSS the ten tracks (so no one feature dominates)
and pairs are compared by per-dimension-RMS Euclidean distance. Higher = more
distinct. The gate is the MINIMUM pairwise distance: if the closest two intros
are far enough apart, none of the ten is a near-duplicate of another. The exact
same fingerprint is applied to BEFORE and AFTER, so the comparison is fair.
"""

import argparse
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))

from ggd.audio import read_wav  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
BGM = os.path.join(ROOT, "content", "assets", "audio", "bgm")
TMP = os.path.join(os.environ.get("TMPDIR", "/tmp"), "ggd-intro-distinct")

SCENES = ["lobby", "champSelect", "battleStart", "combat", "fireRing",
          "room", "intermission", "settlement", "victory", "defeat"]

SR = 22050
WIN = 2048
HOP = 512
HEAD_S = 8.0
MIN_GATE = 0.60   # minimum acceptable per-dim-RMS distance between any two intros


def decode_head(path: str, head_s: float = HEAD_S) -> np.ndarray:
    os.makedirs(TMP, exist_ok=True)
    wav = os.path.join(TMP, os.path.basename(path) + f".head{head_s:g}.wav")
    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-nostdin", "-i", path, "-t", str(head_s),
         "-ar", str(SR), "-ac", "1", "-c:a", "pcm_s16le", wav],
        check=True,
    )
    x, _ = read_wav(wav)
    m = np.asarray(x[0] if x.ndim > 1 else x, dtype=np.float64)
    m = m / (np.max(np.abs(m)) or 1.0)   # peak-normalise: a fair timbre compare
    n = int(head_s * SR)
    return np.pad(m, (0, max(0, n - len(m))))[:n]


def _frames(x: np.ndarray) -> np.ndarray:
    n = 1 + (len(x) - WIN) // HOP
    idx = np.arange(WIN)[None, :] + HOP * np.arange(n)[:, None]
    return x[idx] * np.hanning(WIN)[None, :]


def _mel_fb(n_mel: int = 40, fmin: float = 40.0, fmax: float = SR / 2) -> np.ndarray:
    f = np.fft.rfftfreq(WIN, 1.0 / SR)
    mel = lambda hz: 2595.0 * np.log10(1.0 + hz / 700.0)
    imel = lambda m: 700.0 * (10.0 ** (m / 2595.0) - 1.0)
    pts = imel(np.linspace(mel(fmin), mel(fmax), n_mel + 2))
    fb = np.zeros((n_mel, len(f)))
    for i in range(n_mel):
        lo, ce, hi = pts[i], pts[i + 1], pts[i + 2]
        fb[i] = np.clip(np.minimum((f - lo) / (ce - lo + 1e-9),
                                   (hi - f) / (hi - ce + 1e-9)), 0, None)
    return fb


def _dct(x: np.ndarray, n_out: int) -> np.ndarray:
    n = x.shape[-1]
    k = np.arange(n_out)[:, None]
    b = np.cos(np.pi * k * (2 * np.arange(n)[None, :] + 1) / (2 * n))
    return x @ b.T


_MEL = _mel_fb()


def _chroma_map() -> np.ndarray:
    f = np.fft.rfftfreq(WIN, 1.0 / SR)
    pc = np.full(len(f), -1)
    with np.errstate(divide="ignore"):
        midi = 69 + 12 * np.log2(np.where(f > 0, f, 1) / 440.0)
    good = (f > 55) & (f < 4000)
    pc[good] = (np.round(midi[good]).astype(int) % 12)[:]
    M = np.zeros((12, len(f)))
    for c in range(12):
        M[c, pc == c] = 1.0
    return M


_CHROMA = _chroma_map()


def fingerprint(x: np.ndarray) -> np.ndarray:
    fr = _frames(x)
    mag = np.abs(np.fft.rfft(fr, axis=1))
    pw = mag ** 2
    # MFCC(20) over the whole 8 s
    logmel = np.log(pw @ _MEL.T + 1e-9)
    mfcc = _dct(logmel, 20)
    mf_mean, mf_std = mfcc.mean(0), mfcc.std(0)
    # SEGMENTED MFCC(13): four 2 s blocks, each averaged. The opening blocks
    # carry a signature at full weight instead of being smeared over 8 s.
    nfr = mfcc.shape[0]
    seg = []
    for b in range(4):
        lo, hi = b * nfr // 4, (b + 1) * nfr // 4
        seg.append(mfcc[lo:hi, :13].mean(0))
    mf_seg = np.concatenate(seg)
    # chroma(12) mean, normalised to sum 1 (key-content shape, not level)
    chroma = pw @ _CHROMA.T
    ch = chroma.mean(0)
    ch = ch / (ch.sum() + 1e-9)
    # onset envelope: positive spectral flux, then an 8-bin temporal profile
    flux = np.sqrt(np.maximum(0, np.diff(mag, axis=0)) ** 2 @ np.ones(mag.shape[1]))
    flux = flux / (flux.max() + 1e-9)
    prof = np.array([flux[i * len(flux) // 8:(i + 1) * len(flux) // 8].mean()
                     for i in range(8)])
    onset = np.concatenate([prof, [flux.mean(), flux.std()]])
    # first-impression transient: six log band energies over t=0-0.5 s
    head = x[:int(0.5 * SR)]
    hm = np.abs(np.fft.rfft(head * np.hanning(len(head))))
    hf = np.fft.rfftfreq(len(head), 1.0 / SR)
    edges = [40, 120, 300, 800, 2000, 5000, 11000]
    band = np.array([np.log(np.sum(hm[(hf >= edges[i]) & (hf < edges[i + 1])] ** 2) + 1e-9)
                     for i in range(6)])
    return np.concatenate([mf_mean, mf_std, mf_seg, ch, onset, band])


def matrix_for(paths: dict, head_s: float = HEAD_S) -> tuple[list, np.ndarray]:
    names = [s for s in SCENES if s in paths]
    F = np.stack([fingerprint(decode_head(paths[s], head_s)) for s in names])
    mu, sd = F.mean(0), F.std(0)
    Z = (F - mu) / np.where(sd > 1e-9, sd, 1.0)
    d = np.sqrt(((Z[:, None, :] - Z[None, :, :]) ** 2).sum(-1) / Z.shape[1])
    return names, d


def min_pair(names, d):
    n = len(names)
    ij = min(((i, j) for i in range(n) for j in range(i + 1, n)), key=lambda p: d[p])
    return d[ij], names[ij[0]], names[ij[1]]


def summarize(names, d, title):
    n = len(names)
    print(f"\n=== {title} — first-{HEAD_S:g}s intro distance (per-dim RMS, z-scored) ===")
    hdr = "            " + " ".join(f"{s[:6]:>6}" for s in names)
    print(hdr)
    for i, s in enumerate(names):
        row = " ".join(f"{d[i, j]:6.2f}" for j in range(n))
        print(f"{s:>11} {row}")
    iu = [(i, j) for i in range(n) for j in range(i + 1, n)]
    pairs = sorted(iu, key=lambda ij: d[ij])
    mn = d[pairs[0]]
    print(f"\n  minimum pairwise distance : {mn:.3f}  "
          f"({names[pairs[0][0]]} vs {names[pairs[0][1]]})")
    print("  five closest pairs        : " + "; ".join(
        f"{names[i]}~{names[j]} {d[i, j]:.2f}" for i, j in pairs[:5]))
    off = d[np.triu_indices(n, 1)]
    print(f"  mean / median pairwise    : {off.mean():.3f} / {np.median(off):.3f}")
    return mn


def paths_in(dir_):
    return {s: os.path.join(dir_, f"{s}.mp3") for s in SCENES
            if os.path.exists(os.path.join(dir_, f"{s}.mp3"))}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", default=BGM)
    ap.add_argument("--before")
    ap.add_argument("--after")
    a = ap.parse_args()
    if a.before and a.after:
        nb, db = matrix_for(paths_in(a.before))
        mb = summarize(nb, db, "BEFORE (first 8 s)")
        na, da = matrix_for(paths_in(a.after))
        ma = summarize(na, da, "AFTER (first 8 s)")
        # first-3 s view: where a signature actually lives, before the shared bed
        # takes over. The clearest read of "the openings no longer sound alike".
        _, db3 = matrix_for(paths_in(a.before), head_s=3.0)
        _, da3 = matrix_for(paths_in(a.after), head_s=3.0)
        mb3, ba, bb = min_pair(nb, db3)
        ma3, aa, ab = min_pair(na, da3)
        print(f"\n  MIN PAIRWISE  first 8 s : before {mb:.3f}  ->  after {ma:.3f}"
              f"   (+{100*(ma-mb)/mb:.0f}%)   gate >= {MIN_GATE}   "
              f"{'PASS' if ma >= MIN_GATE else 'FAIL'}")
        print(f"  MIN PAIRWISE  first 3 s : before {mb3:.3f} ({ba}~{bb})  ->  "
              f"after {ma3:.3f} ({aa}~{ab})   (+{100*(ma3-mb3)/mb3:.0f}%)")
        return 0 if ma >= MIN_GATE else 1
    names, d = matrix_for(paths_in(a.dir))
    mn = summarize(names, d, os.path.basename(a.dir.rstrip('/')) or "bgm")
    print(f"\n  gate: min pairwise >= {MIN_GATE}   {'PASS' if mn >= MIN_GATE else 'FAIL'}")
    return 0 if mn >= MIN_GATE else 1


if __name__ == "__main__":
    raise SystemExit(main())
