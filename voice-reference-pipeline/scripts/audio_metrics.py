"""Audio analysis for the voice-reference pipeline.

FFmpeg does the decoding and loudness measurement; numpy does frame-level
analysis (RMS, spectral stats, pitch). Heuristic estimators (music /
multi-speaker probability) are clearly labelled as estimates — they gate
nothing on their own, they only flag clips for human review.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from pipeline_util import PipelineError, ffprobe_json, run_command

ANALYSIS_SR = 16000
FRAME = 1024
HOP = 256

# f0 search range in Hz (generous: creature growls to squeals)
F0_MIN, F0_MAX = 50.0, 800.0


# ---------------------------------------------------------------- decode ----

def decode_pcm(path: Path, sr: int = ANALYSIS_SR) -> np.ndarray:
    """Decode any supported audio file to mono float32 at `sr` via ffmpeg."""
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "a:0",
         "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
        capture_output=True, timeout=600,
    )
    if proc.returncode != 0:
        tail = proc.stderr.decode("utf-8", "replace").strip().splitlines()[-3:]
        raise PipelineError(f"ffmpeg decode failed for {path.name}: {' | '.join(tail)}")
    audio = np.frombuffer(proc.stdout, dtype=np.float32)
    if audio.size == 0:
        raise PipelineError(f"{path.name}: decoded to zero samples (corrupt file?)")
    return audio


# ----------------------------------------------------------------- probe ----

@dataclass(frozen=True)
class ProbeInfo:
    duration: float
    sample_rate: int
    channels: int
    bit_depth: int          # 0 for lossy codecs
    codec: str


def probe(path: Path) -> ProbeInfo:
    info = ffprobe_json(path)
    streams = [s for s in info.get("streams", []) if s.get("codec_type") == "audio"]
    if not streams:
        raise PipelineError(f"{path.name}: no audio stream")
    s = streams[0]
    duration = float(s.get("duration") or info.get("format", {}).get("duration") or 0.0)
    bits = int(s.get("bits_per_raw_sample") or s.get("bits_per_sample") or 0)
    return ProbeInfo(
        duration=duration,
        sample_rate=int(s.get("sample_rate") or 0),
        channels=int(s.get("channels") or 0),
        bit_depth=bits,
        codec=str(s.get("codec_name") or ""),
    )


# ---------------------------------------------------------------- ebur128 ----

_EBUR_I = re.compile(r"I:\s*(-?[\d.]+)\s*LUFS")
_EBUR_LRA = re.compile(r"LRA:\s*(-?[\d.]+)\s*LU")
_EBUR_PEAK = re.compile(r"Peak:\s*(-?[\d.]+)\s*dBFS")


def ebur128(path: Path) -> tuple[float, float, float]:
    """Return (integrated LUFS, LRA, true peak dBTP) from ffmpeg ebur128."""
    proc = subprocess.run(
        ["ffmpeg", "-nostats", "-i", str(path),
         "-filter_complex", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, timeout=600,
    )
    tail = proc.stderr[-4000:]
    m_i, m_lra, m_pk = _EBUR_I.search(tail), _EBUR_LRA.search(tail), _EBUR_PEAK.search(tail)
    if not (m_i and m_lra and m_pk):
        raise PipelineError(f"ebur128 parse failed for {path.name}")
    return float(m_i.group(1)), float(m_lra.group(1)), float(m_pk.group(1))


# ---------------------------------------------------------- frame series ----

@dataclass
class FrameSeries:
    sr: int
    hop: int
    rms_db: np.ndarray        # per-frame RMS in dBFS
    centroid_hz: np.ndarray
    rolloff_hz: np.ndarray    # 85% spectral rolloff
    flatness: np.ndarray      # 0..1 (1 = noise-like)
    flux: np.ndarray          # normalized spectral flux
    f0_hz: np.ndarray         # NaN where unvoiced
    peak_ratio: np.ndarray    # spectral peak / mean (tonality)

    @property
    def times(self) -> np.ndarray:
        return np.arange(len(self.rms_db)) * self.hop / self.sr


def frame_analysis(audio: np.ndarray, sr: int = ANALYSIS_SR) -> FrameSeries:
    if audio.size < FRAME:
        audio = np.pad(audio, (0, FRAME - audio.size))
    n_frames = 1 + (audio.size - FRAME) // HOP
    idx = np.arange(FRAME)[None, :] + HOP * np.arange(n_frames)[:, None]
    frames = audio[idx] * np.hanning(FRAME)[None, :]

    rms = np.sqrt(np.mean(frames**2, axis=1))
    rms_db = 20.0 * np.log10(np.maximum(rms, 1e-8))

    spec = np.abs(np.fft.rfft(frames, axis=1))
    freqs = np.fft.rfftfreq(FRAME, 1.0 / sr)
    power = spec + 1e-12
    centroid = (power * freqs[None, :]).sum(axis=1) / power.sum(axis=1)

    cum = np.cumsum(power, axis=1)
    thresholds = 0.85 * cum[:, -1:]
    rolloff_bins = (cum >= thresholds).argmax(axis=1)
    rolloff = freqs[rolloff_bins]

    flatness = np.exp(np.mean(np.log(power), axis=1)) / np.mean(power, axis=1)
    peak_ratio = power.max(axis=1) / power.mean(axis=1)

    norm = spec / np.linalg.norm(spec + 1e-12, axis=1, keepdims=True)
    flux = np.zeros(n_frames)
    if n_frames > 1:
        flux[1:] = np.linalg.norm(np.diff(norm, axis=0), axis=1)

    f0 = _autocorr_pitch(frames, sr, rms_db)
    return FrameSeries(sr=sr, hop=HOP, rms_db=rms_db, centroid_hz=centroid,
                       rolloff_hz=rolloff, flatness=flatness, flux=flux,
                       f0_hz=f0, peak_ratio=peak_ratio)


def _autocorr_pitch(frames: np.ndarray, sr: int, rms_db: np.ndarray) -> np.ndarray:
    """Frame-wise autocorrelation f0. NaN for unvoiced/quiet frames."""
    lag_min = max(2, int(sr / F0_MAX))
    lag_max = min(frames.shape[1] - 1, int(sr / F0_MIN))
    f0 = np.full(frames.shape[0], np.nan)
    quiet = rms_db < (np.nanmax(rms_db) - 35.0)
    fft_size = 2 * frames.shape[1]
    spectra = np.fft.rfft(frames, n=fft_size, axis=1)
    ac = np.fft.irfft(np.abs(spectra) ** 2, axis=1)[:, : lag_max + 1]
    ac0 = np.maximum(ac[:, 0], 1e-12)
    for i in range(frames.shape[0]):
        if quiet[i]:
            continue
        seg = ac[i, lag_min:] / ac0[i]
        best = int(np.argmax(seg))
        if seg[best] > 0.35:  # voicing confidence
            f0[i] = sr / (lag_min + best)
    return f0


# ---------------------------------------------------------------- metrics ----

@dataclass
class AudioMetrics:
    duration: float
    sample_rate: int
    channels: int
    bit_depth: int
    integrated_loudness: float
    true_peak: float
    loudness_range: float
    clipping_ratio: float
    silence_ratio: float
    estimated_snr: float
    speech_or_vocal_ratio: float
    music_probability: float          # heuristic estimate
    multiple_speaker_probability: float  # heuristic estimate
    extras: dict[str, float] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        d = {k: v for k, v in self.__dict__.items() if k != "extras"}
        d.update(self.extras)
        return d


def compute_metrics(path: Path, cfg: dict[str, Any]) -> tuple[AudioMetrics, FrameSeries]:
    quality = cfg.get("quality", {})
    silence_thr = float(quality.get("silence_threshold_dbfs", -45.0))

    info = probe(path)
    lufs, lra, true_peak = ebur128(path)
    audio = decode_pcm(path)
    fs = frame_analysis(audio)

    clipping_ratio = float(np.mean(np.abs(audio) >= 0.999))

    active = fs.rms_db > silence_thr
    silence_ratio = float(1.0 - np.mean(active))

    noise_floor_db = float(np.percentile(fs.rms_db, 5))
    voiced_db = fs.rms_db[active]
    estimated_snr = float((np.mean(voiced_db) if voiced_db.size else noise_floor_db) - noise_floor_db)

    vocal_band = (fs.centroid_hz > 150) & (fs.centroid_hz < 5000)
    speech_ratio = float(np.mean(active & vocal_band))

    music_probability = _music_probability(fs, active)
    multi_speaker = _multi_speaker_probability(fs, active)

    metrics = AudioMetrics(
        duration=round(info.duration, 3),
        sample_rate=info.sample_rate,
        channels=info.channels,
        bit_depth=info.bit_depth,
        integrated_loudness=round(lufs, 2),
        true_peak=round(true_peak, 2),
        loudness_range=round(lra, 2),
        clipping_ratio=round(clipping_ratio, 5),
        silence_ratio=round(silence_ratio, 3),
        estimated_snr=round(estimated_snr, 1),
        speech_or_vocal_ratio=round(speech_ratio, 3),
        music_probability=round(music_probability, 3),
        multiple_speaker_probability=round(multi_speaker, 3),
    )
    return metrics, fs


def _music_probability(fs: FrameSeries, active: np.ndarray) -> float:
    """Heuristic: sustained tonal, rhythmically steady, gap-free audio smells
    like background music. This is an ESTIMATE for review routing only."""
    if active.sum() < 8:
        return 0.0
    tonality = float(np.clip((np.median(fs.peak_ratio[active]) - 8.0) / 40.0, 0, 1))
    continuity = float(np.clip((np.mean(active) - 0.5) / 0.5, 0, 1))
    flux_steadiness = float(np.clip(1.0 - np.std(fs.flux[active]) / 0.35, 0, 1))
    voiced = ~np.isnan(fs.f0_hz[active])
    sustained_pitch = float(np.mean(voiced)) if voiced.size else 0.0
    return float(np.clip(0.35 * tonality + 0.2 * continuity
                         + 0.25 * flux_steadiness + 0.2 * sustained_pitch, 0, 1))


def _multi_speaker_probability(fs: FrameSeries, active: np.ndarray) -> float:
    """Heuristic: bimodal pitch distribution among voiced frames suggests two
    overlapping speakers. ESTIMATE for review routing only."""
    f0 = fs.f0_hz[active]
    f0 = f0[~np.isnan(f0)]
    if f0.size < 20:
        return 0.0
    log_f0 = np.log2(f0)
    lo, hi = np.percentile(log_f0, 10), np.percentile(log_f0, 90)
    if hi - lo < 0.4:
        return 0.0
    centers = np.array([lo, hi], dtype=float)
    for _ in range(12):  # tiny 1-D 2-means
        dist = np.abs(log_f0[:, None] - centers[None, :])
        labels = dist.argmin(axis=1)
        for k in (0, 1):
            if np.any(labels == k):
                centers[k] = log_f0[labels == k].mean()
    balance = float(np.minimum(np.mean(labels == 0), np.mean(labels == 1)) * 2.0)
    separation = float(np.clip((abs(centers[1] - centers[0]) - 0.45) / 0.6, 0, 1))
    return float(np.clip(balance * separation, 0, 1))


# ----------------------------------------------------------- best segment ----

def silence_boundaries(fs: FrameSeries, silence_thr_db: float, min_gap_s: float) -> np.ndarray:
    """Times (s) of low-energy points suitable as cut boundaries."""
    quiet = fs.rms_db <= silence_thr_db
    min_frames = max(1, int(min_gap_s * fs.sr / fs.hop))
    boundaries: list[float] = [0.0]
    run_start = None
    for i, q in enumerate(quiet):
        if q and run_start is None:
            run_start = i
        elif not q and run_start is not None:
            if i - run_start >= min_frames:
                boundaries.append(float((run_start + i) / 2 * fs.hop / fs.sr))
            run_start = None
    if run_start is not None and len(quiet) - run_start >= min_frames:
        boundaries.append(float((run_start + len(quiet)) / 2 * fs.hop / fs.sr))
    boundaries.append(float(len(quiet) * fs.hop / fs.sr))
    return np.asarray(boundaries)


def score_windows(fs: FrameSeries, win_s: float, hop_s: float,
                  weights: dict[str, float]) -> list[tuple[float, float]]:
    """[(start_s, score)] for each sliding window — higher = more emotional
    dynamics (loudness swings, spectral movement, pitch range)."""
    frames_per_win = max(1, int(win_s * fs.sr / fs.hop))
    frames_per_hop = max(1, int(hop_s * fs.sr / fs.hop))
    n = len(fs.rms_db)
    out: list[tuple[float, float]] = []
    for start in range(0, max(1, n - frames_per_win + 1), frames_per_hop):
        sl = slice(start, start + frames_per_win)
        rms = fs.rms_db[sl]
        dyn = float(np.percentile(rms, 95) - np.percentile(rms, 10)) / 40.0
        flux = float(np.mean(fs.flux[sl])) / 0.5
        f0 = fs.f0_hz[sl]
        f0 = f0[~np.isnan(f0)]
        pitch_range = 0.0
        if f0.size >= 5:
            pitch_range = float(np.percentile(f0, 90) - np.percentile(f0, 10)) / 300.0
        score = (weights.get("rms_dynamics", 0.4) * min(dyn, 1.5)
                 + weights.get("spectral_flux", 0.3) * min(flux, 1.5)
                 + weights.get("pitch_range", 0.3) * min(pitch_range, 1.5))
        out.append((float(start * fs.hop / fs.sr), float(score)))
    return out


def best_segment(fs: FrameSeries, duration: float, cfg: dict[str, Any]) -> tuple[float, float, float]:
    """Choose the best (start, end, score) window of ideal length, snapping the
    cut points to nearby silence so sentences are not chopped mid-word."""
    seg = cfg.get("segment", {})
    quality = cfg.get("quality", {})
    ideal_max = float(seg.get("ideal_max_s", 15.0))
    ideal_min = float(seg.get("ideal_min_s", 5.0))
    if duration <= ideal_max:
        return 0.0, duration, 1.0

    win_s = min(float(seg.get("best_window_s", 12.0)), ideal_max)
    scores = score_windows(fs, win_s, float(seg.get("window_hop_s", 1.0)),
                           dict(seg.get("score_weights", {})))
    if not scores:
        return 0.0, min(duration, ideal_max), 0.0
    start, score = max(scores, key=lambda t: t[1])
    end = start + win_s

    snap = float(seg.get("silence_snap_radius_s", 1.5))
    bounds = silence_boundaries(fs, float(quality.get("silence_threshold_dbfs", -45.0)),
                                float(quality.get("silence_min_gap_s", 0.25)))
    start = _snap(start, bounds, snap)
    end = _snap(end, bounds, snap)
    end = min(end, duration)
    if end - start < ideal_min:  # snapping collapsed the window — undo
        start, end = max(0.0, min(start, duration - win_s)), min(duration, start + win_s)
    return round(start, 3), round(end, 3), round(score, 4)


def _snap(t: float, bounds: np.ndarray, radius: float) -> float:
    if bounds.size == 0:
        return t
    nearest = float(bounds[np.argmin(np.abs(bounds - t))])
    return nearest if abs(nearest - t) <= radius else t


# --------------------------------------------------- features / embedding ----

# Reference scales (mean, std) so proxy features are comparable across files.
_PROXY_SCALES: list[tuple[str, float, float]] = [
    ("f0_median", 220.0, 120.0),
    ("f0_iqr", 60.0, 60.0),
    ("centroid_mean", 1800.0, 900.0),
    ("centroid_std", 600.0, 400.0),
    ("rolloff_mean", 3500.0, 1800.0),
    ("flatness_mean", 0.25, 0.2),
    ("flux_mean", 0.25, 0.15),
    ("flux_std", 0.15, 0.1),
    ("rms_dynamics", 18.0, 10.0),
    ("voiced_ratio", 0.5, 0.25),
    ("harmonicity", 0.5, 0.25),
    ("attack_slope", 6.0, 4.0),
    ("tempo_onsets_per_s", 2.0, 1.5),
]


def acoustic_features(fs: FrameSeries, active_thr_db: float = -45.0) -> dict[str, float]:
    """Casting-relevant acoustic features; also the basis of the proxy embedding
    and of the non-human separation analysis."""
    active = fs.rms_db > active_thr_db
    f0 = fs.f0_hz[active]
    f0 = f0[~np.isnan(f0)]
    voiced_ratio = float(f0.size / max(1, int(active.sum())))

    rms_diff = np.diff(fs.rms_db)
    onsets = int(np.sum((rms_diff[:-1] > 3.0) & (fs.rms_db[1:-1] > active_thr_db)))
    duration_s = max(1e-3, len(fs.rms_db) * fs.hop / fs.sr)
    attack = float(np.percentile(rms_diff, 95)) if rms_diff.size else 0.0

    def _p(arr: np.ndarray, q: float, default: float = 0.0) -> float:
        return float(np.percentile(arr, q)) if arr.size else default

    return {
        "f0_median": _p(f0, 50), "f0_p10": _p(f0, 10), "f0_p90": _p(f0, 90),
        "f0_iqr": _p(f0, 75) - _p(f0, 25),
        "pitch_range_hz": _p(f0, 90) - _p(f0, 10),
        "centroid_mean": float(np.mean(fs.centroid_hz[active])) if active.any() else 0.0,
        "centroid_std": float(np.std(fs.centroid_hz[active])) if active.any() else 0.0,
        "rolloff_mean": float(np.mean(fs.rolloff_hz[active])) if active.any() else 0.0,
        "flatness_mean": float(np.mean(fs.flatness[active])) if active.any() else 0.0,
        "flux_mean": float(np.mean(fs.flux[active])) if active.any() else 0.0,
        "flux_std": float(np.std(fs.flux[active])) if active.any() else 0.0,
        "rms_dynamics": _p(fs.rms_db, 95) - _p(fs.rms_db, 10),
        "voiced_ratio": voiced_ratio,
        "harmonicity": voiced_ratio,          # proxy: voiced frames are harmonic
        "roughness": float(np.mean(fs.flatness[active])) if active.any() else 0.0,
        "attack_slope": attack,
        "tempo_onsets_per_s": onsets / duration_s,
    }


def proxy_embedding(features: dict[str, float]) -> list[float]:
    return [(features.get(name, mean) - mean) / std for name, mean, std in _PROXY_SCALES]


_ECAPA_CLASSIFIER: Any | None = None


def try_speechbrain_embedding(path: Path) -> list[float] | None:
    """ECAPA-TDNN speaker embedding when speechbrain+torch are installed.

    Audio is decoded via our own ffmpeg path (16 kHz mono float32) instead of
    torchaudio.load, which needs the optional torchcodec package."""
    global _ECAPA_CLASSIFIER
    try:
        import torch  # type: ignore[import-not-found]
        from speechbrain.inference.speaker import EncoderClassifier  # type: ignore[import-not-found]
    except ImportError:
        return None
    if _ECAPA_CLASSIFIER is None:
        _ECAPA_CLASSIFIER = EncoderClassifier.from_hparams(
            source="speechbrain/spkrec-ecapa-voxceleb",
            savedir=str(Path.home() / ".cache" / "speechbrain-ecapa"),
        )
    signal = torch.from_numpy(decode_pcm(path, sr=16000).copy()).unsqueeze(0)
    with torch.no_grad():
        emb = _ECAPA_CLASSIFIER.encode_batch(signal)
    return [float(x) for x in emb.squeeze().tolist()]


def cosine_similarity(a: list[float], b: list[float]) -> float:
    va, vb = np.asarray(a), np.asarray(b)
    denom = float(np.linalg.norm(va) * np.linalg.norm(vb))
    if denom == 0.0:
        return 0.0
    return float(np.dot(va, vb) / denom)


def feature_similarity(a: list[float], b: list[float], scale: float = 3.0) -> float:
    """Distance-based similarity for z-scaled acoustic feature vectors.

    Cosine is wrong for z-score vectors (shared large components dominate and
    e.g. a deep growl vs a high squeak can score ~0.98). exp(-||a-b||/scale)
    keeps ordering meaningful: identical voices -> 1.0, very different -> ~0."""
    va, vb = np.asarray(a), np.asarray(b)
    return float(np.exp(-np.linalg.norm(va - vb) / max(scale, 1e-6)))
