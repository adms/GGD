"""WAV I/O and ffmpeg glue for bgm-gen.

Everything inside the engine is float32 numpy in the shape (2, N) — stereo,
-1..1, 44.1 kHz. Only this module knows about files.
"""

from __future__ import annotations

import os
import struct
import subprocess
import wave
from typing import Sequence

import numpy as np

SR = 44100


# ---------------------------------------------------------------- read / write


def write_wav(path: str, x: np.ndarray, sr: int = SR, bits: int = 16) -> None:
    """Write (2, N) or (N,) float audio as PCM wav. Clips at +-1."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[None, :]
    x = np.clip(x, -1.0, 1.0)
    inter = x.T.reshape(-1)  # interleave
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(x.shape[0])
        w.setsampwidth(bits // 8)
        w.setframerate(sr)
        if bits == 16:
            w.writeframes((inter * 32767.0).astype("<i2").tobytes())
        elif bits == 24:
            q = np.round(inter * 8388607.0).astype("<i4")
            b = q.astype("<i4").tobytes()
            w.writeframes(np.frombuffer(b, dtype=np.uint8).reshape(-1, 4)[:, :3].tobytes())
        else:
            raise ValueError(f"bits={bits}")


def read_wav(path: str) -> tuple[np.ndarray, int]:
    """Read a PCM wav -> ((ch, N) float64, sr)."""
    with wave.open(path, "rb") as w:
        ch, sw, sr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
        raw = w.readframes(n)
    if sw == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    elif sw == 4:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float64) / 2147483648.0
    elif sw == 1:
        a = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128.0) / 128.0
    else:
        raise ValueError(f"sampwidth {sw}")
    return a.reshape(-1, ch).T.copy(), sr


def ffmpeg(args: Sequence[str], quiet: bool = True) -> None:
    cmd = ["ffmpeg", "-y", "-nostdin"] + (["-v", "error"] if quiet else []) + list(args)
    subprocess.run(cmd, check=True)


def decode_to_wav(src: str, dst: str, sr: int = SR, mono: bool = True) -> None:
    """Decode any ffmpeg-readable file to 16-bit PCM wav at `sr`."""
    ffmpeg(["-i", src, "-ar", str(sr), "-ac", "1" if mono else "2", "-c:a", "pcm_s16le", dst])


def measure_loudness(path: str) -> dict:
    """Run ffmpeg loudnorm in analysis mode; returns the parsed JSON dict."""
    import json

    p = subprocess.run(
        [
            "ffmpeg", "-nostdin", "-hide_banner", "-i", path,
            "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
            "-f", "null", "-",
        ],
        capture_output=True, text=True,
    )
    err = p.stderr
    start = err.rfind("{")
    end = err.rfind("}")
    if start < 0 or end < 0:
        raise RuntimeError("loudnorm produced no JSON:\n" + err[-2000:])
    return json.loads(err[start : end + 1])


def encode_mp3(src_wav: str, dst_mp3: str, target_lufs: float = -16.0, tp: float = -1.5) -> dict:
    """Two-pass linear loudnorm to `target_lufs`, then MP3 128 kbps 44.1 kHz stereo.

    Two-pass linear is what the repo's existing BGM pack used; it is
    deterministic (the measured pass fully determines the applied gain) and it
    does not dynamically squash the mix the way single-pass loudnorm does.
    """
    m = measure_loudness(src_wav)
    flt = (
        "loudnorm=I={i}:TP={tp}:LRA=11:linear=true"
        ":measured_I={mi}:measured_TP={mtp}:measured_LRA={mlra}:measured_thresh={mth}"
        ":offset={off}:print_format=summary"
    ).format(
        i=target_lufs, tp=tp,
        mi=m["input_i"], mtp=m["input_tp"], mlra=m["input_lra"], mth=m["input_thresh"],
        off=m.get("target_offset", "0.0"),
    )
    ffmpeg([
        "-i", src_wav, "-af", flt,
        "-ar", "44100", "-ac", "2", "-c:a", "libmp3lame", "-b:a", "128k",
        dst_mp3,
    ])
    return m
