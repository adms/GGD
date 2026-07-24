#!/usr/bin/env python3
"""voice-gen core — engine-agnostic text prep, idempotency, and audio I/O.

This module used to BE the IndexTTS-2 wrapper. It is now the shared floor that
two engines stand on, because the owner's directive is:

    「IndexTTS 模型替換成 CosyVoice 3 來生成，除非生成不好才用 IndexTTS」
    CosyVoice 3 is the default. IndexTTS-2 is the fallback, for when CosyVoice
    output is not good enough.

The engines themselves live in sibling modules and are imported LAZILY, because
they need different, mutually incompatible virtualenvs:

    engine_cosyvoice3.py   -> /Users/Takuro/ggd-voice-cosyvoice3/.venv
    engine_indextts.py     -> /Users/Takuro/ggd-voice/index-tts/.venv

Nothing here imports torch. `synth.py --dry-run` therefore plans a whole corpus,
including every idempotency decision, under bare `python3`.

Four things a caller must not get wrong; all four are enforced below.

  1. TEXT PREP IS PER-ENGINE, NOT GLOBAL.  IndexTTS-2's `bpe.model` is a 12k
     zh+en vocabulary with zero kana and no Traditional forms, so it needs
     OpenCC t2s and refuses Japanese. CosyVoice 3's Qwen vocabulary covers
     Traditional Chinese, kana and Japanese kanji with ZERO <unk> (measured:
     17/17, 34/34, 4/4 tokens round-trip exactly) — so converting for it would
     be actively wrong. Each engine owns its own `prepare_text`.

  2. THE IDEMPOTENCY KEY CARRIES THE ENGINE.  A clip's sidecar records
     `method = "<engine>/<method-version>/<variant>/<checkpoint-fingerprint>"`.
     Switching engine, switching CosyVoice base<->RL, or swapping a checkpoint
     file on disk all change that string, so the clip re-renders. A clip
     produced by the other engine is NEVER silently kept.

  3. WHAT SHIPS IS WHAT IS MEASURED.  `probe_audio()` reads the FINAL file, not
     the intermediate wav, because the mp3 leg resamples and loudness-normalises.

  4. FILES ONLY, NEVER SOUND (#62).  Nothing in this tool opens an audio device.
     ffmpeg is invoked with -nostdin and writes to a path.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import time

# Bump when a change would make an already-rendered clip WRONG rather than just
# different, across BOTH engines — new normalisation rules, new sidecar meaning.
# Per-engine model changes are covered by that engine's own METHOD_VERSION.
CORE_VERSION = "voicegen-core-v2"

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

CACHE_DIR = os.path.expanduser(
    os.environ.get("GGD_VOICEGEN_CACHE", "~/.cache/ggd-voice-gen"))

# Matches content/assets/audio/voices/quotes/quotes.json `loudness`, so a cloned
# clip sits at the same level as the macOS-`say` clips it replaces.
TARGET_LUFS = -16.0
TRUE_PEAK_DB = -1.5
# #158 ceiling: <=128 kbps, <=44.1 kHz. These are the ceiling, not a suggestion.
MP3_BITRATE = "128k"
MP3_RATE = "44100"

DEFAULT_ENGINE = "cosyvoice3"

_KANA = re.compile(r"[぀-ゟ゠-ヿ]")
_HAN = re.compile(r"[㐀-䶿一-鿿豈-﫿]")


class TextUnsupported(ValueError):
    """The chosen engine cannot say this line. Message must say what to do."""


# ------------------------------------------------------------------ text ----

def has_kana(text: str) -> bool:
    return bool(_KANA.search(text))


def has_han(text: str) -> bool:
    return bool(_HAN.search(text))


_opencc = None


def to_simplified(text: str) -> str:
    """Traditional -> Simplified. IndexTTS-2 only; CosyVoice 3 must NOT get this."""
    global _opencc
    if _opencc is None:
        try:
            from opencc import OpenCC
        except ImportError as e:  # pragma: no cover - venv-dependent
            raise TextUnsupported(
                f"OpenCC is required to speak Traditional Chinese on IndexTTS-2 "
                f"({e}). Run synth.py with the IndexTTS venv."
            ) from e
        _opencc = OpenCC("t2s")
    return _opencc.convert(text)


# ------------------------------------------------------------- idempotency ---

_ref_sha_cache: dict[str, str] = {}


def file_sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ref_sha(path: str) -> str:
    """sha256 of the reference clip's BYTES — so swapping in a different take at
    the same filename re-renders, which a path comparison would miss."""
    real = os.path.abspath(path)
    if real not in _ref_sha_cache:
        _ref_sha_cache[real] = file_sha256(real)
    return _ref_sha_cache[real]


def ckpt_fingerprint(paths: list[str]) -> str:
    """Stable identity of a set of model files, memoised on (path, size, mtime).

    A full sha256 of a 2 GB checkpoint costs ~1.5 s, which is fine once but not
    once per shard per run — hence the memo. The memo is keyed by size and
    mtime_ns as well as path, so touching or replacing a checkpoint invalidates
    it. A missing file contributes the literal string "absent" rather than
    raising: the engine's own loader gives the good error message.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)
    memo_path = os.path.join(CACHE_DIR, "ckpt-sha.json")
    try:
        with open(memo_path, encoding="utf-8") as fh:
            memo = json.load(fh)
    except Exception:
        memo = {}
    parts, dirty = [], False
    for p in paths:
        real = os.path.abspath(p)
        try:
            st = os.stat(real)
        except OSError:
            parts.append("absent")
            continue
        memo_key = f"{real}:{st.st_size}:{st.st_mtime_ns}"
        digest = memo.get(memo_key)
        if not digest:
            digest = file_sha256(real)
            memo[memo_key] = digest
            dirty = True
        parts.append(digest)
    if dirty:
        tmp = memo_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(memo, fh)
        os.replace(tmp, memo_path)
    return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()[:12]


def content_key(engine_version: str, ref_path: str, model_text: str,
                params: dict) -> str:
    """Identity of a clip's INPUTS.

    Includes the engine version string (engine name + method version + variant +
    checkpoint fingerprint), so switching engines or variants re-renders only
    what actually changed and never keeps a clip from the other engine.

    Device is deliberately EXCLUDED, so a clip rendered on cpu is not re-rendered
    by an mps shard — they are the same model.
    """
    payload = json.dumps(
        {
            "core": CORE_VERSION,
            "engine": engine_version,
            "ref": ref_sha(ref_path),
            "text": model_text,
            "params": {k: params[k] for k in sorted(params)},
        },
        ensure_ascii=False,
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def marker_path(out_path: str) -> str:
    return out_path + ".method"


def read_marker(out_path: str) -> dict | None:
    try:
        with open(marker_path(out_path), encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def is_done(out_path: str, engine_version: str, key: str) -> bool:
    """True iff a clip built by THIS engine from the CURRENT inputs is already on
    disk. A zero-byte file is never done (a SIGKILLed run leaves those behind)."""
    try:
        if os.path.getsize(out_path) <= 0:
            return False
    except OSError:
        return False
    m = read_marker(out_path)
    return bool(m and m.get("method") == engine_version and m.get("key") == key)


def write_marker(out_path: str, engine_version: str, key: str, extra: dict) -> None:
    doc = {"method": engine_version, "key": key, "core": CORE_VERSION,
           "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    doc.update(extra)
    tmp = marker_path(out_path) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, marker_path(out_path))


# ---------------------------------------------------------------- engines ----

# name -> (module, class). Imported lazily: importing engine_cosyvoice3 under the
# IndexTTS venv would fail, and vice versa, so nothing is imported until asked
# for by name.
REGISTRY = {
    "cosyvoice3": ("engine_cosyvoice3", "CosyVoice3Engine"),
    "indextts": ("engine_indextts", "IndexTTSEngine"),
}


def engine_names() -> list[str]:
    return list(REGISTRY)


def get_engine_class(name: str):
    if name not in REGISTRY:
        sys.exit(f"voice-gen: unknown engine {name!r} (have: {', '.join(REGISTRY)})")
    mod_name, cls_name = REGISTRY[name]
    if HERE not in sys.path:
        sys.path.insert(0, HERE)
    try:
        mod = __import__(mod_name)
    except ImportError as e:  # pragma: no cover - venv-dependent
        sys.exit(
            f"voice-gen: engine {name!r} is not importable in this interpreter ({e}).\n"
            f"  Each engine needs its own venv — see tools/voice-gen/README.md §0:\n"
            f"    cosyvoice3 -> /Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python\n"
            f"    indextts   -> /Users/Takuro/ggd-voice/index-tts/.venv/bin/python"
        )
    return getattr(mod, cls_name)


class BaseEngine:
    """What `synth.py` is allowed to assume about an engine.

    `version_id()` must be answerable WITHOUT loading the model, because the
    dry run plans the whole corpus before any weights are touched.
    """

    NAME = "base"
    METHOD_VERSION = "v0"
    VARIANTS: tuple[str, ...] = ("base",)
    DEFAULT_VARIANT = "base"
    DEFAULT_DEVICE = "mps"
    #: engine-specific manifest fields that belong in the idempotency key
    PARAM_FIELDS: tuple[str, ...] = ()
    #: python modules `render()` needs. Used to tell "wrong venv" apart from
    #: "broken", so a run under one venv can PLAN both engines and render one.
    REQUIRES: tuple[str, ...] = ()
    #: the venv that can actually run this engine, quoted in the "wrong venv" note
    VENV_HINT = ""

    def __init__(self, variant: str | None = None, device: str | None = None,
                 home: str | None = None, verbose: bool = False):
        self.variant = variant or self.DEFAULT_VARIANT
        if self.variant not in self.VARIANTS:
            sys.exit(f"voice-gen: engine {self.NAME} has no variant {self.variant!r} "
                     f"(have: {', '.join(self.VARIANTS)})")
        self.device = device or self.DEFAULT_DEVICE
        self.verbose = verbose

    def available(self) -> bool:
        """Can THIS interpreter render with this engine?

        Deliberately cheap — `importlib.util.find_spec` only, no heavy imports.
        Planning (text prep, idempotency, sharding) never needs this to be True,
        which is what lets `python3 synth.py --dry-run` plan a mixed-engine
        corpus without either venv.
        """
        import importlib.util
        for mod in self.REQUIRES:
            try:
                if importlib.util.find_spec(mod) is None:
                    return False
            except (ImportError, ValueError):
                return False
        return True

    def version_id(self) -> str:
        raise NotImplementedError

    def prepare_text(self, entry: dict) -> str:
        raise NotImplementedError

    def params(self, entry: dict, args) -> dict:
        raise NotImplementedError

    def render(self, ref: str, model_text: str, out_path: str, params: dict,
               seed: int | None = None) -> dict:
        raise NotImplementedError

    def empty_cache(self) -> None:
        return None

    def mem_gb(self) -> float | None:
        return None


# ------------------------------------------------------------------ audio ----

def probe_audio(path: str) -> dict:
    """Duration / rate / channels via ffprobe. Cheap, and it is the only thing
    standing between us and shipping 2,000 silent files."""
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=sample_rate,channels:format=duration",
             "-of", "json", path],
            capture_output=True, text=True, check=True).stdout
        d = json.loads(out)
        st = (d.get("streams") or [{}])[0]
        return {
            "durationSec": round(float(d.get("format", {}).get("duration") or 0), 3),
            "sampleRate": int(st.get("sample_rate") or 0),
            "channels": int(st.get("channels") or 0),
            "bytes": os.path.getsize(path),
        }
    except Exception:
        return {"bytes": os.path.getsize(path) if os.path.exists(path) else 0}


def encode_mp3(src_wav: str, dst_mp3: str) -> None:
    """Loudness-normalise to the pack's published target and encode.

    128 kbps / 44.1 kHz / mono is the #158 ceiling. Keeps a cloned clip
    level-matched to the macOS-`say` clips already shipping."""
    subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", src_wav,
         "-af", f"loudnorm=I={TARGET_LUFS}:TP={TRUE_PEAK_DB}:LRA=11",
         "-c:a", "libmp3lame", "-b:a", MP3_BITRATE, "-ar", MP3_RATE, "-ac", "1",
         dst_mp3],
        check=True, capture_output=True)


def normalised_ref(path: str, sample_rate: int = 16000) -> str:
    """A 16 kHz mono WAV copy of a reference clip, cached by content hash.

    Both engines load prompts through torchaudio's `soundfile` backend, whose
    mp3 support depends on the libsndfile build — an mp3 reference is a coin
    flip. ffmpeg is not, so every reference goes through it once. 16 kHz mono is
    the shape the CosyVoice 3 measurements were taken at (`load_wav(..., 16000)`
    for both the speaker embedding and the speech tokenizer); keeping it means
    the published similarity thresholds still mean what they say.

    Idempotency still hashes the ORIGINAL bytes, so this cache is invisible to
    the sidecar.
    """
    real = os.path.abspath(path)
    digest = ref_sha(real)
    cache = os.path.join(CACHE_DIR, "refs")
    os.makedirs(cache, exist_ok=True)
    dst = os.path.join(cache, f"{digest[:24]}-{sample_rate}.wav")
    if os.path.exists(dst) and os.path.getsize(dst) > 0:
        return dst
    tmp = dst + ".tmp.wav"
    subprocess.run(
        ["ffmpeg", "-nostdin", "-y", "-loglevel", "error", "-i", real,
         "-ac", "1", "-ar", str(sample_rate), "-c:a", "pcm_s16le", tmp],
        check=True, capture_output=True)
    os.replace(tmp, dst)
    return dst
