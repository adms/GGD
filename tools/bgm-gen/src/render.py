#!/usr/bin/env python3
"""bgm-gen — deterministic score -> audio renderer for the GGD soundtrack.

    python3 tools/bgm-gen/src/render.py menu                 # one track
    python3 tools/bgm-gen/src/render.py --all                # the whole pack
    python3 tools/bgm-gen/src/render.py menu --keep-wav      # keep the 32-bit wav
    python3 tools/bgm-gen/src/render.py menu --analyze       # print the measurements

A score is `tools/bgm-gen/scores/<id>.py` exposing `build() -> ggd.score.Score`.
Output is `content/assets/audio/bgm/<id>.mp3` (128 kbps, 44.1 kHz, stereo,
two-pass linear loudnorm to -16 LUFS) plus `tools/bgm-gen/build/<id>.meta.json`,
which `manifest.py` later assembles into `bgm/MANIFEST.json`.

DETERMINISM: every random choice comes from a generator seeded off the score's
`seed`, so re-running reproduces the same bytes. Nothing is sampled, nothing is
downloaded, and the only external binary is ffmpeg.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import sys
import time

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, HERE)

from ggd import analyze, dsp, score as score_mod  # noqa: E402
from ggd.audio import SR, encode_mp3, write_wav  # noqa: E402

SCORES_DIR = os.path.join(HERE, "..", "scores")
BUILD_DIR = os.path.join(HERE, "..", "build")
OUT_DIR = os.path.join(ROOT, "content", "assets", "audio", "bgm")

SLOTS = ["menu", "menuNocturne", "lobby", "room", "champSelect", "intermission",
         "combat", "battleStart", "victory", "defeat", "settlement", "fireRing"]


def load_score(track_id: str):
    path = os.path.join(SCORES_DIR, f"{track_id}.py")
    if not os.path.exists(path):
        raise SystemExit(f"render: no score at {path}")
    spec = importlib.util.spec_from_file_location(f"score_{track_id}", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    if not hasattr(mod, "build"):
        raise SystemExit(f"render: {path} has no build()")
    return mod.build()


def measure(y: np.ndarray, sc) -> dict:
    m = analyze.mono(y)
    seg = m[: min(len(m), int(20 * SR))]
    return {
        "peak_dbfs": round(float(20 * np.log10(np.max(np.abs(y)) + 1e-9)), 2),
        "crest_db": round(analyze.crest_db(y), 1),
        "band_low_db": round(analyze.band_energy_db(seg, 20, 150), 1),
        "band_mid_db": round(analyze.band_energy_db(seg, 150, 2000), 1),
        "band_high_db": round(analyze.band_energy_db(seg, 2000, 16000), 1),
        "singers_formant_db": round(analyze.band_energy_db(seg, 2600, 3500), 1),
        "partials": analyze.partial_count(seg),
    }


def render_one(track_id: str, keep_wav: bool = False, do_analyze: bool = False,
               out_dir: str = OUT_DIR) -> dict:
    t0 = time.time()
    sc = load_score(track_id)
    print(f"[{track_id}] {sc.bpm:g} bpm x {sc.bars} bars, key {sc.key}, "
          f"seed {sc.seed}, loop={sc.loop}")
    y = score_mod.render(sc)
    dur = y.shape[1] / SR
    os.makedirs(BUILD_DIR, exist_ok=True)
    os.makedirs(out_dir, exist_ok=True)
    wav = os.path.join(BUILD_DIR, f"{track_id}.wav")
    mp3 = os.path.join(out_dir, f"{track_id}.mp3")
    write_wav(wav, y, bits=24)
    m = encode_mp3(wav, mp3, target_lufs=-16.0, tp=-1.5)

    meta = {
        "scene": track_id,
        "file": f"{track_id}.mp3",
        "durationSec": round(dur, 3),
        "loop": bool(sc.loop),
        "title": sc.title or track_id,
        "mood": sc.mood,
        "bpm": sc.bpm,
        "bars": sc.bars,
        "key": sc.key,
        "seed": sc.seed,
        "inputLufs": float(m["input_i"]),
        "inputTruePeakDb": float(m["input_tp"]),
        "targetLufs": -16.0,
    }
    if do_analyze:
        meta["measured"] = measure(y, sc)
    with open(os.path.join(BUILD_DIR, f"{track_id}.meta.json"), "w") as f:
        json.dump(meta, f, indent=2)
    if not keep_wav:
        os.remove(wav)
    print(f"[{track_id}] {dur:.3f}s -> {mp3}  "
          f"(in {m['input_i']} LUFS / TP {m['input_tp']} dB)  {time.time()-t0:.1f}s")
    if do_analyze:
        for k, v in meta["measured"].items():
            print(f"    {k:22} {v}")
    return meta


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("tracks", nargs="*", help="track ids (default: --all)")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--keep-wav", action="store_true")
    ap.add_argument("--analyze", action="store_true")
    ap.add_argument("--out-dir", default=OUT_DIR)
    a = ap.parse_args()

    ids = a.tracks
    if a.all or not ids:
        ids = [s for s in SLOTS
               if os.path.exists(os.path.join(SCORES_DIR, f"{s}.py"))]
        if not ids:
            print("render: no scores found", file=sys.stderr)
            return 1
    for t in ids:
        render_one(t, a.keep_wav, a.analyze, a.out_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
