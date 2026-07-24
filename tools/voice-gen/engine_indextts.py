#!/usr/bin/env python3
"""IndexTTS-2 zero-shot cloning — the FALLBACK engine.

Run with the IndexTTS venv:
    /Users/Takuro/ggd-voice/index-tts/.venv/bin/python tools/voice-gen/synth.py --engine indextts …

CODE ONLY. Checkout + ~11 GB of checkpoints live outside the repo at
`/Users/Takuro/ggd-voice/index-tts` (override with $GGD_INDEXTTS_HOME).

This is no longer the default (the owner's directive puts CosyVoice 3 first),
but it is not vestigial either. It holds one capability CosyVoice 3 does not
have: **per-line emotion control** — `emo_vector`, `emo_audio_prompt`,
`use_emo_text`. The categories CosyVoice measures worst on are exactly the
emotional ones (battlecry 0.29-0.64, hurt 0.42-0.53 speaker similarity, versus
0.72-0.83 for ordinary sentences), which is why the fallback is worth keeping
wired rather than merely documented.

The three hard-won facts about this install are unchanged:

  1. NO KANA, NO TRADITIONAL.  `bpe.model` is a 12k-token zh+en vocabulary with
     ZERO hiragana/katakana. `いくぞ！かくごしろ！` is 8/8 <unk>. Traditional forms
     are missing too (9 of 21 chars <unk> on a real 名言). `prepare_text()`
     converts zh via OpenCC t2s and REFUSES Japanese unless the caller opts in.
     For the game's Japanese VO this engine can only take a `romaji` reading.

  2. THE MEMORY GUARD.  At upstream's default max_text_tokens_per_segment=120,
     MPS driver allocation climbs monotonically through one long generation
     (measured 9 -> 21 -> 35 -> 55 -> 73 GB against a 115.4 GB recommended max)
     and the OS SIGKILLs the process, exit 137. Two verified fixes, both applied:
     segment at 40 tokens, and torch.mps.empty_cache() after every clip (drops
     driver allocation 70 GB -> 11 GB).

  3. fp16 IS A NO-OP ON MPS.  infer_v2.py:74 hard-sets use_fp16=False on the mps
     branch ("Use float16 on MPS is overhead than float32"). There is no flag
     for it here because there is nothing behind it.
"""
from __future__ import annotations

import os
import shutil
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import engine  # noqa: E402
from engine import BaseEngine, TextUnsupported  # noqa: E402

INDEXTTS_HOME = os.environ.get("GGD_INDEXTTS_HOME", "/Users/Takuro/ggd-voice/index-tts")


class IndexTTSEngine(BaseEngine):

    NAME = "indextts"
    METHOD_VERSION = "indextts2-mps-v2"   # v1 = pre-engine-abstraction sidecars
    VARIANTS = ("base",)
    DEFAULT_VARIANT = "base"
    DEFAULT_DEVICE = "mps"
    PARAM_FIELDS = ("maxTextTokens", "intervalSilence", "emoAudio", "emoAlpha",
                    "emoVector", "emoText", "useEmoText")
    REQUIRES = ("torch", "opencc")
    VENV_HINT = "/Users/Takuro/ggd-voice/index-tts/.venv/bin/python"

    DEFAULT_MAX_TEXT_TOKENS = 40    # 120 (upstream) OOMs the MPS driver
    DEFAULT_INTERVAL_SILENCE = 200

    def __init__(self, variant=None, device=None, home=None, verbose=False):
        super().__init__(variant=variant, device=device, home=home, verbose=verbose)
        self.home = os.path.abspath(home or INDEXTTS_HOME)
        self.ckpt = os.path.join(self.home, "checkpoints")
        self._tts = None
        self._torch = None
        self._version = None
        self.allow_kana = False       # set by synth.py from --allow-kana

    # -- identity -------------------------------------------------------------
    def version_id(self) -> str:
        if self._version is None:
            fp = engine.ckpt_fingerprint([
                os.path.join(self.ckpt, "gpt.pth"),
                os.path.join(self.ckpt, "s2mel.pth"),
                os.path.join(self.ckpt, "config.yaml"),
            ])
            self._version = f"{self.NAME}/{self.METHOD_VERSION}/{self.variant}/{fp}"
        return self._version

    # -- text -----------------------------------------------------------------
    def prepare_text(self, entry: dict) -> str:
        """The exact string handed to the model. Raises on content it cannot say.

        `lang` is advisory for Chinese: the Traditional->Simplified pass applies
        to anything carrying Han characters regardless, because a line tagged
        "en" that happens to contain 「去死團」 has the same problem.
        """
        text = (entry.get("text") or "").strip()
        lang = (entry.get("lang") or "zh").lower()

        if lang == "ja" or engine.has_kana(text):
            romaji = (entry.get("romaji") or "").strip()
            if romaji:
                return romaji
            if not self.allow_kana:
                raise TextUnsupported(
                    "IndexTTS-2 cannot speak Japanese: its bpe.model vocabulary has "
                    "zero kana tokens and front.py loads only zh+en normalisers, so "
                    "every kana becomes <unk> and the audio is noise. Either route "
                    "this line to cosyvoice3 (the default engine — it speaks "
                    "Japanese from a katakana reading), add a \"romaji\" field, or "
                    "pass --allow-kana to render the failure on purpose.")
        if not text:
            raise TextUnsupported("empty text")
        if lang != "en":
            text = engine.to_simplified(text)
        return text

    # -- params ---------------------------------------------------------------
    def params(self, entry: dict, args) -> dict:
        """The knobs that change the AUDIO. Part of the idempotency key, so
        changing any of them re-renders that clip and only that clip."""
        return {
            "maxTextTokens": int(entry.get("maxTextTokens")
                                 or getattr(args, "max_text_tokens", None)
                                 or self.DEFAULT_MAX_TEXT_TOKENS),
            "intervalSilence": int(entry.get("intervalSilence")
                                   or getattr(args, "interval_silence", None)
                                   or self.DEFAULT_INTERVAL_SILENCE),
            "emoAudio": os.path.basename(entry["emoAudio"]) if entry.get("emoAudio") else None,
            "emoAlpha": float(entry.get("emoAlpha", 1.0)),
            "emoVector": entry.get("emoVector"),
            "emoText": entry.get("emoText"),
            "useEmoText": bool(entry.get("useEmoText", False)),
            "seed": entry.get("seed"),
        }

    # -- model ----------------------------------------------------------------
    @property
    def tts(self):
        """Lazily-loaded. Init costs ~13 s and ~7.8 GB RSS, so one engine per
        process and one process per shard — never one per clip."""
        if self._tts is None:
            self._tts = self._load()
        return self._tts

    def _load(self):
        if not os.path.isdir(self.home):
            sys.exit(
                f"voice-gen: no IndexTTS install at {self.home}\n"
                f"  set $GGD_INDEXTTS_HOME, or rebuild it — see tools/voice-gen/README.md §2")
        cfg = os.path.join(self.ckpt, "config.yaml")
        if not os.path.exists(cfg):
            sys.exit(f"voice-gen: checkpoints missing at {self.ckpt} (expected config.yaml)\n"
                     f"  see tools/voice-gen/README.md §2.3 for the `hf download` line")
        if self.home not in sys.path:
            sys.path.insert(0, self.home)
        try:
            from indextts.infer_v2 import IndexTTS2
        except ImportError as e:
            sys.exit(
                f"voice-gen: cannot import indextts ({e}).\n"
                f"  Run with the IndexTTS venv, NOT bare python3:\n"
                f"    {self.home}/.venv/bin/python tools/voice-gen/synth.py --engine indextts …")
        import torch
        self._torch = torch

        prev = os.getcwd()
        os.chdir(self.home)   # infer_v2 resolves auxiliary paths relative to cwd
        try:
            t0 = time.time()
            tts = IndexTTS2(
                cfg_path=cfg,
                model_dir=self.ckpt,
                device=self.device,
                # All three are CUDA/Linux-only and absent from this env by
                # design; passing them explicitly keeps the fallback path from
                # depending on auto-detection. See README §3.
                use_fp16=False,       # a no-op on mps anyway — infer_v2.py:74
                use_deepspeed=False,
                use_cuda_kernel=False,
            )
            if self.verbose:
                print(f">> indextts ready on {self.device} in {time.time() - t0:.1f}s",
                      file=sys.stderr)
        finally:
            os.chdir(prev)
        return tts

    # -- memory ---------------------------------------------------------------
    def empty_cache(self) -> None:
        """MANDATORY after every clip on mps. Without it the driver allocation
        ratchets across clips and a long batch dies with SIGKILL/137."""
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
    def render(self, ref: str, model_text: str, out_path: str, params: dict,
               seed: int | None = None) -> dict:
        os.makedirs(os.path.dirname(os.path.abspath(out_path)) or ".", exist_ok=True)
        wants_mp3 = out_path.lower().endswith(".mp3")
        tmp_dir = tempfile.mkdtemp(prefix="voicegen-idx-") if wants_mp3 else None
        wav_path = os.path.join(tmp_dir, "raw.wav") if wants_mp3 else out_path

        if seed is not None:
            import random
            random.seed(seed)
            if self._torch is not None:
                self._torch.manual_seed(seed)

        emo_audio = params.get("emoAudioPath")
        prev = os.getcwd()
        os.chdir(self.home)
        t0 = time.time()
        try:
            self.tts.infer(
                spk_audio_prompt=os.path.abspath(ref),
                text=model_text,
                output_path=wav_path,
                emo_audio_prompt=os.path.abspath(emo_audio) if emo_audio else None,
                emo_alpha=params.get("emoAlpha", 1.0),
                emo_vector=params.get("emoVector"),
                use_emo_text=params.get("useEmoText", False),
                emo_text=params.get("emoText"),
                interval_silence=params.get("intervalSilence", self.DEFAULT_INTERVAL_SILENCE),
                max_text_tokens_per_segment=params.get("maxTextTokens",
                                                       self.DEFAULT_MAX_TEXT_TOKENS),
                verbose=self.verbose,
            )
        finally:
            os.chdir(prev)
            self.empty_cache()
        wall = time.time() - t0

        if not os.path.exists(wav_path) or os.path.getsize(wav_path) <= 0:
            raise RuntimeError(f"IndexTTS produced no audio at {wav_path}")

        if wants_mp3:
            engine.encode_mp3(wav_path, out_path)
            shutil.rmtree(tmp_dir, ignore_errors=True)
        probe = engine.probe_audio(out_path)
        return {"wallSec": round(wall, 2), **probe,
                "rtf": round(wall / probe["durationSec"], 2)
                       if probe.get("durationSec") else None}
