#!/usr/bin/env python3
"""CosyVoice 3 (Fun-CosyVoice3-0.5B) — the DEFAULT voice-gen engine.

Run with the CosyVoice venv:
    /Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python tools/voice-gen/synth.py …

CODE ONLY. The checkout, the 20 GB of weights and the venv live OUTSIDE the
repo at `/Users/Takuro/ggd-voice-cosyvoice3` (override with $GGD_COSYVOICE_HOME).

Five things this wrapper exists to get right, each of them measured rather than
assumed. Measurements are from the proof run recorded in the task brief
(7 Japanese lines × {base,rl} × {mps,cpu}, 21 clips).

  1. JAPANESE MUST BE SPACE-SEPARATED KATAKANA.  Upstream `example.py` says so
     outright ("for Japanese usage, you must translate it to katakana"). This is
     NOT a vocabulary limit — the Qwen tokenizer round-trips Traditional
     Chinese, hiragana, katakana and Japanese kanji with zero <unk> (measured
     17/17, 10/10, 34/34, 4/4). It is a *training-data* limit: kanji input is
     read as Chinese. So a Japanese line carries its own `kana` reading, and
     that reading is the pronunciation-control surface (see 5).

  2. NO TRADITIONAL->SIMPLIFIED CONVERSION.  That is an IndexTTS-2 workaround.
     CosyVoice 3 tokenises 繁中 losslessly; converting would change what is said
     for no reason. Chinese text goes in exactly as authored.

  3. HYBRID DEVICE PLACEMENT.  LLM + flow on MPS, HiFT vocoder pinned to CPU —
     the HiFT f0 predictor runs in float64, which MPS does not support. This is
     the arrangement the benchmark ran under; it is not optional on mps.

  4. VARIANT SELECTION MUST NOT TOUCH THE WEIGHTS ON DISK.  The proof script
     selected the RL model by `shutil.copy2(llm.rl.pt, llm.pt)`. That is a
     process-global side effect on a shared file: with `--shards 4` running four
     processes, one shard swapping the checkpoint silently changes what the
     other three are generating, and a crash leaves the wrong weights installed.
     Here the variant is loaded with `llm.load_state_dict()` into the live model
     AFTER construction. Nothing on disk is ever written.

  5. THE VARIANTS HAVE NO CLEAN WINNER, so both stay selectable. Speaker
     similarity vs the reference, base_mps vs rl_mps:
         battlecry  0.635 vs 0.326   (base wins)
         hurt       0.415 vs 0.531   (RL wins)
         taunt      0.795 vs 0.726 | defeat 0.746 vs 0.739 | announcer 0.723 vs 0.780
     Ordinary sentences land 0.72-0.83 on both. Shouts and grunts are where they
     diverge and where both are weak. `--variant` picks; the sidecar records
     which one produced each clip, so the corpus is auditable after the fact.
"""
from __future__ import annotations

import os
import re
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine  # noqa: E402
from engine import BaseEngine, TextUnsupported  # noqa: E402

COSYVOICE_HOME = os.environ.get(
    "GGD_COSYVOICE_HOME", "/Users/Takuro/ggd-voice-cosyvoice3/CosyVoice")
MODEL_SUBDIR = "pretrained_models/Fun-CosyVoice3-0.5B"

# Every CosyVoice 3 prompt begins with a system turn. Present in every upstream
# CosyVoice3 example. Its side effect matters: because it contains `<|` and
# `|>`, `CosyVoiceFrontEnd.text_normalize` disables the text frontend entirely
# (frontend.py:132), so our katakana reaches the model untouched — no wetext
# number-spelling, no punctuation rewriting. That is what we want, and it is
# also why THIS module has to do its own long-line splitting (see `_split`).
SYSTEM_PROMPT = "You are a helpful assistant.<|endofprompt|>"

# Sentence enders to split long lines on, since the frontend splitter is off.
_SPLIT_AT = re.compile(r"(?<=[。！？!?…])")


class CosyVoice3Engine(BaseEngine):

    NAME = "cosyvoice3"
    # Bump only when a change makes existing CosyVoice clips WRONG.
    METHOD_VERSION = "cv3-0.5b-v1"
    VARIANTS = ("base", "rl")
    DEFAULT_VARIANT = "base"
    DEFAULT_DEVICE = "mps"
    PARAM_FIELDS = ("maxChars", "speed", "intervalSilence")
    REQUIRES = ("torch", "torchaudio", "onnxruntime")
    VENV_HINT = "/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python"

    DEFAULT_MAX_CHARS = 60
    DEFAULT_INTERVAL_SILENCE = 200   # ms of silence joining split segments
    DEFAULT_SPEED = 1.0

    def __init__(self, variant=None, device=None, home=None, verbose=False):
        super().__init__(variant=variant, device=device, home=home, verbose=verbose)
        self.home = os.path.abspath(home or COSYVOICE_HOME)
        self.model_dir = os.path.join(self.home, MODEL_SUBDIR)
        self._m = None
        self._torch = None
        self._version = None

    # -- identity -------------------------------------------------------------
    def llm_path(self) -> str:
        """The checkpoint file for the selected variant.

        `llm.base.pt` exists only because the proof script made a backup before
        overwriting `llm.pt`. Prefer it when present: it is provably the base
        weights, whereas `llm.pt` is whatever the last swap left behind. This
        wrapper never writes either file.
        """
        if self.variant == "rl":
            return os.path.join(self.model_dir, "llm.rl.pt")
        backup = os.path.join(self.model_dir, "llm.base.pt")
        return backup if os.path.exists(backup) else os.path.join(self.model_dir, "llm.pt")

    def version_id(self) -> str:
        """Answerable without loading the model — the dry run depends on it."""
        if self._version is None:
            fp = engine.ckpt_fingerprint([
                self.llm_path(),
                os.path.join(self.model_dir, "flow.pt"),
                os.path.join(self.model_dir, "hift.pt"),
            ])
            self._version = f"{self.NAME}/{self.METHOD_VERSION}/{self.variant}/{fp}"
        return self._version

    # -- text -----------------------------------------------------------------
    def prepare_text(self, entry: dict) -> str:
        """The exact string handed to the model, minus the system prompt.

        Japanese needs an explicit katakana reading. We refuse to guess one:
        a wrong guess is a mispronounced champion name that nobody catches until
        a player hears it, and there is no kana G2P in this install.
        """
        text = (entry.get("text") or "").strip()
        lang = (entry.get("lang") or "zh").lower()
        kana = (entry.get("kana") or "").strip()

        if lang == "ja" or (not lang and engine.has_kana(text)):
            if not kana:
                raise TextUnsupported(
                    "a Japanese line needs a `kana` field: CosyVoice 3 reads raw "
                    "kanji as Chinese, so upstream requires the reading as "
                    "SPACE-SEPARATED KATAKANA (example.py). Add e.g. "
                    '"kana": "ヒグラシ ノ ナク コロニ・リュウグウ レナ。" — the spaces are '
                    "mora/word boundaries and they are the only pronunciation "
                    "control this engine offers for Japanese (README §9)."
                )
            if engine.has_han(kana):
                raise TextUnsupported(
                    f"`kana` still contains kanji ({kana!r}); CosyVoice 3 would read "
                    f"those as Chinese. Write the whole reading in katakana.")
            return kana
        if not text:
            raise TextUnsupported("empty text")
        if kana:
            # A kana reading on a non-ja line is almost always a mislabelled lang.
            raise TextUnsupported(
                f"entry has `kana` but lang={lang!r}; set \"lang\": \"ja\" or drop `kana`.")
        # zh (Traditional or Simplified) and en pass through verbatim — see §2.
        return text

    # -- params ---------------------------------------------------------------
    def params(self, entry: dict, args) -> dict:
        return {
            "maxChars": int(entry.get("maxChars") or getattr(args, "max_chars", None)
                            or self.DEFAULT_MAX_CHARS),
            "intervalSilence": int(entry.get("intervalSilence")
                                   or getattr(args, "interval_silence", None)
                                   or self.DEFAULT_INTERVAL_SILENCE),
            "speed": float(entry.get("speed") or self.DEFAULT_SPEED),
            "seed": entry.get("seed"),
        }

    # -- model ----------------------------------------------------------------
    @property
    def m(self):
        if self._m is None:
            self._m = self._load()
        return self._m

    def _load(self):
        if not os.path.isdir(self.model_dir):
            sys.exit(
                f"voice-gen: no CosyVoice 3 weights at {self.model_dir}\n"
                f"  set $GGD_COSYVOICE_HOME — see tools/voice-gen/README.md §0")
        llm = self.llm_path()
        if not os.path.exists(llm):
            sys.exit(f"voice-gen: variant {self.variant!r} needs {llm}, which is missing")

        for p in (self.home, os.path.join(self.home, "third_party/Matcha-TTS")):
            if p not in sys.path:
                sys.path.insert(0, p)
        try:
            import torch
            from cosyvoice.cli.cosyvoice import AutoModel
        except ImportError as e:
            sys.exit(
                f"voice-gen: cannot import cosyvoice ({e}).\n"
                f"  Run with the CosyVoice venv, NOT bare python3:\n"
                f"    /Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python "
                f"tools/voice-gen/synth.py …")
        self._torch = torch

        prev = os.getcwd()
        os.chdir(self.home)   # hyperpyyaml + onnx paths resolve relative to cwd
        try:
            t0 = time.time()
            m = AutoModel(model_dir=MODEL_SUBDIR)
            load_s = time.time() - t0

            # -- variant, loaded IN MEMORY. Nothing on disk is written. --------
            if self.variant == "rl" or os.path.basename(llm) != "llm.pt":
                state = torch.load(llm, map_location="cpu", weights_only=True)
                m.model.llm.load_state_dict(state, strict=True)
                del state
                if self.verbose:
                    print(f">> llm weights <- {os.path.basename(llm)}", file=sys.stderr)

            if self.device == "mps":
                dev = torch.device("mps")
                m.model.llm.to(dev)
                m.model.flow.to(dev)
                m.model.device = dev
                m.frontend.device = dev
                # HiFT stays on CPU: its f0 predictor is float64, unsupported on
                # MPS. Bridge the tensors at the boundary instead of moving it.
                hift = m.model.hift
                hift.to("cpu")
                orig = hift.inference

                def _hift_cpu(speech_feat, **kw):
                    out, s = orig(speech_feat=speech_feat.to("cpu").float(), **kw)
                    return out.to(dev), s.to(dev)
                hift.inference = _hift_cpu
            if self.verbose:
                print(f">> cosyvoice3 ({self.variant}) ready on {self.device} "
                      f"in {load_s:.1f}s", file=sys.stderr)
        finally:
            os.chdir(prev)
        return m

    # -- memory ---------------------------------------------------------------
    def empty_cache(self) -> None:
        t = self._torch
        if t is None:
            return
        try:
            if self.device.startswith("mps") and hasattr(t, "mps"):
                t.mps.empty_cache()
            elif self.device.startswith("cuda"):
                t.cuda.empty_cache()
        except Exception:
            pass

    def mem_gb(self) -> float | None:
        t = self._torch
        if t is None or not self.device.startswith("mps"):
            return None
        try:
            return t.mps.driver_allocated_memory() / 1e9
        except Exception:
            return None

    # -- render ---------------------------------------------------------------
    @staticmethod
    def _split(text: str, max_chars: int) -> list[str]:
        """Split a long line at sentence boundaries.

        The system prompt disables CosyVoice's own splitter (see SYSTEM_PROMPT),
        so an unbounded line would go to the LLM in one piece. Everything in this
        corpus is a short voice line; this is the guard rail, not the norm.
        """
        if len(text) <= max_chars:
            return [text]
        out, buf = [], ""
        for piece in _SPLIT_AT.split(text):
            if not piece:
                continue
            if buf and len(buf) + len(piece) > max_chars:
                out.append(buf)
                buf = piece
            else:
                buf += piece
        if buf:
            out.append(buf)
        return out or [text]

    def render(self, ref: str, model_text: str, out_path: str, params: dict,
               seed: int | None = None) -> dict:
        """Synthesize one clip. Writes WAV, or MP3 via the shared encoder.

        Returns a receipt (wall time, duration, sample rate, bytes).
        """
        import torch
        import torchaudio

        os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
        prompt = engine.normalised_ref(ref)      # 16 kHz mono wav, content-cached
        wants_mp3 = out_path.lower().endswith(".mp3")
        tmp_dir = tempfile.mkdtemp(prefix="voicegen-cv3-") if wants_mp3 else None
        wav_path = os.path.join(tmp_dir, "raw.wav") if wants_mp3 else out_path

        if seed is not None:
            import random
            random.seed(seed)
            torch.manual_seed(seed)

        segments = self._split(model_text, int(params.get("maxChars") or self.DEFAULT_MAX_CHARS))
        gap = int(params.get("intervalSilence") or 0)
        speed = float(params.get("speed") or 1.0)

        prev = os.getcwd()
        os.chdir(self.home)
        t0 = time.time()
        try:
            chunks = []
            for n, seg in enumerate(segments):
                got = [j["tts_speech"] for j in self.m.inference_cross_lingual(
                    SYSTEM_PROMPT + seg, prompt, stream=False, speed=speed)]
                if not got:
                    raise RuntimeError(f"CosyVoice 3 returned no audio for segment {n}: {seg!r}")
                if n and gap:
                    chunks.append(torch.zeros(1, int(self.m.sample_rate * gap / 1000)))
                chunks.append(torch.cat(got, dim=-1).cpu())
            audio = torch.cat(chunks, dim=-1)
            sr = self.m.sample_rate
        finally:
            os.chdir(prev)
            self.empty_cache()
        wall = time.time() - t0

        if audio.numel() == 0:
            raise RuntimeError("CosyVoice 3 produced an empty waveform")
        torchaudio.save(wav_path, audio, sr)

        if wants_mp3:
            engine.encode_mp3(wav_path, out_path)
            shutil.rmtree(tmp_dir, ignore_errors=True)
        # Probe the SHIPPED file: the mp3 leg resamples to 44.1k and
        # loudness-normalises, so the wav's numbers would be a lie.
        probe = engine.probe_audio(out_path)
        return {"wallSec": round(wall, 2), "segments": len(segments), **probe,
                "rtf": round(wall / probe["durationSec"], 2)
                       if probe.get("durationSec") else None}
