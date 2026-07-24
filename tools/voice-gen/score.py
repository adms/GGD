#!/usr/bin/env python3
"""voice-gen measurement primitives — how "not good enough" gets a number.

The owner's directive is 「除非生成不好才用 IndexTTS」 — use IndexTTS only when
CosyVoice output is not good enough. This module is the "not good enough" half.
It exists so that the fallback is triggered by a MEASUREMENT and not by a
listening impression that nobody can reproduce.

WHAT IS A GATE, AND WHAT IS ONLY ADVISORY
-----------------------------------------
**Speaker similarity IS a gate.** Cosine distance between CAM++ speaker
embeddings of the reference clip and the generated clip, using the exact
`campplus.onnx` that ships inside the CosyVoice 3 weights. On the 21-clip proof
run it separates the two outcome clusters perfectly, with no overlap:

    reject (<0.65) : battlecry 0.286 / 0.326 / 0.635, hurt 0.415 / 0.433 / 0.531
    accept (>=0.65): taunt 0.726-0.795, defeat 0.739-0.746, names 0.719-0.828,
                     announcer 0.723-0.798

The widest rejected value is 0.635 and the lowest accepted is 0.719, so 0.65
sits in an empty band. That is the whole justification for `MIN_SPEAKER_SIM`;
it is not a round number picked for looking reasonable.

**ASR character error rate is NOT a gate — it cannot be, on this install.** The
transcriber returns ordinary mixed-script Japanese (`汎用人型決戦兵器初号機`)
while the expectation is a katakana reading (`ハンヨウ ヒトガタ …`), and there
is no Japanese G2P in any of the three venvs to bridge them (checked: no
pykakasi / fugashi / MeCab / pyopenjtalk / SudachiPy anywhere; `g2p_en` is
English-only). Four routes were tried and all four are recorded here so nobody
re-tries them:

  1. Strict CER in the kana domain: kanji in the transcript becomes deletions,
     so perfectly good clips score as badly as broken ones — measured, on the
     proof set, defeat 0.31 and announcer 0.30 (both flawless) against hurt 0.80
     (genuinely broken). No threshold separates them.
  2. Deletion-tolerant CER (is the transcript an approximate subsequence of the
     reading?): forgives dropped morae by construction — and dropped morae is
     precisely the champion-name failure we need to catch (`リュウグウ レナ` came
     back as `リューグレナ` and scores 0.00 error). Worse than useless.
  3. Biasing the transcriber toward katakana with an `initial_prompt`: measured
     unreliable, and on one clip the prompt LEAKED into the transcript
     (battlecry transcribed as `コレ ワ カタカナ デス。`). Actively dangerous.
  4. NEW, and the one worth keeping: score against BOTH the kana reading and the
     display `text`, and take the lower error — `asr_fidelity()` below. The
     transcriber emits mixed-script Japanese, which is the *display text's*
     domain, not the reading's; comparing against only the reading was measuring
     the wrong thing. This is a large improvement and still not a gate. Measured
     over all 21 proof clips, against hand-labelled "are the words right?":

         metric              flawless clips        broken clips      separates?
         kana-only CER       0.167 … 1.000         0.235 … 0.800     no
         min(kana, text)     0.000 … 0.706         0.235 … 0.800     no

     The kanji artefact is gone (`ショゴウキ` went 1.000 -> 0.385, and three
     clips now score a true 0.000), so the number is finally readable by a
     human. It still does not separate, for one irreducible reason: a mangled
     proper noun is a SMALL edit distance and a FATAL error. `リュウグウ レナ`
     -> `リューグレナ` scores 0.235 while a perfectly good rendering of the same
     line that the transcriber chose to write in kanji scores 0.706. No
     threshold can put those on the right sides.

So `asr_fidelity()` and `mora_rate()` are computed, recorded and shown, because
a human reviewing the batch wants to see them — but they route clips to a REVIEW
QUEUE, never to an automatic reject. Anything else would be inventing a
measurement we do not have.

THE ONE THING THE ASR PATH *CAN* DECIDE is physical, not semantic: if the audio
is too short to physically contain the requested morae, content was dropped.
That is `MORA_RATE_TRUNCATED` and it is a gate — see below.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import unicodedata

# Justified above. Change it only against fresh measurements, not by feel.
MIN_SPEAKER_SIM = 0.65
# Below this, a clip is bad enough that the other engine is worth a try even if
# a listener has not confirmed it yet.
REVIEW_SPEAKER_SIM = 0.72

# Below this, RETRYING ON THE SAME ENGINE IS NOT WORTH THE RENDERS.
# Best-of-N is the cheap lever and it does work: measured, best-of-4 moved the
# weak categories hurt 0.439 -> 0.612 (+0.173) and name 0.752 -> 0.823 (+0.071).
# +0.173 is the largest gain anyone has actually observed here, so a clip
# scoring below 0.65 - 0.173 = 0.477 cannot reach the gate even if the retry
# goes as well as the best retry ever recorded. Those go straight to the other
# engine instead of burning four more renders to fail again.
RETRY_FLOOR = 0.48

# Advisory only. Japanese runs roughly 5-9 morae/second; the 17 hand-labelled
# good proof clips span 4.33-9.38, so this band flags outliers, it does not
# decide anything.
MORA_RATE_BAND = (4.0, 9.5)

# A GATE, and the only thing the ASR path is allowed to decide. This is physics,
# not semantics: if the audio is too short to contain the morae that were asked
# for, content was dropped, and no opinion about pronunciation is involved.
# Measured on the proof set: the 17 good clips top out at 9.38 morae/s; the one
# clip that demonstrably lost content (`hurt`, 0.68s for 7 morae, transcribed as
# the 3-mora `ググって`) sits at 10.29. 10.0 is inside that empty band.
MORA_RATE_TRUNCATED = 10.0

# Advisory. min(CER vs kana, CER vs display text) — see the docstring for why
# this is not a gate. The 17 good clips reach 0.706 and the worst broken one is
# 0.800; 0.75 is between them, but on a single labelled point, so it flags for a
# human instead of rejecting.
ADVISE_CER = 0.75

# Sanity floors. These are existence checks, not quality judgements: the proof
# set's quietest clip peaks at -2.6 dBFS and averages -17 dBFS, so -40 dBFS peak
# is two orders of magnitude below anything real audio does here.
SILENT_PEAK_DBFS = -40.0
# Fraction of samples pinned at full scale. A raw COUNT is the wrong unit and
# was measured to be wrong: 696 clipped samples is 0.9% of a 3.2s announcer line
# (fine) and would be 8% of a 0.3s grunt (destroyed). Measured over the proof
# set as a percentage of all samples:
#     17 good clips   0.000% - 1.271%
#      2 bad clips    2.822%, 3.387%   (the other 2 bad clips clip 0.000%)
# 2.0% sits in that empty band. This is a GATE, and unusually it is one that
# needs no interpretation: samples railed at full scale are audible distortion,
# not a matter of taste. It caught both hand-labelled bad battlecries on its
# own, which fits the failure mode — the model over-drives on shouts.
CLIP_FRACTION_FAIL = 0.02
CLIP_FRACTION_ADVISE = 0.005
MIN_DURATION_SEC = 0.25

_KANA_RE = re.compile(r"[ぁ-ゖァ-ヶー]")
_SMALL = set("ぁぃぅぇぉゃゅょァィゥェォャュョ")
_SMALL_MAP = str.maketrans("ぁぃぅぇぉゃゅょゎ", "あいうえおやゆよわ")


# ------------------------------------------------------------- text metrics --
# Pure stdlib: these run under any interpreter, including the plain-python3
# `qa.py gate` stage.

def to_hiragana(text: str) -> str:
    return "".join(chr(ord(c) - 0x60) if 0x30A1 <= ord(c) <= 0x30F6 else c
                   for c in text)


def kana_only(text: str) -> str:
    """Reduce to a comparable phonetic skeleton: hiragana, no long-vowel bar,
    no gemination, small kana folded up."""
    text = to_hiragana(unicodedata.normalize("NFKC", text))
    text = "".join(_KANA_RE.findall(text))
    return text.replace("ー", "").replace("っ", "").translate(_SMALL_MAP)


def norm_phonetic(text: str) -> str:
    """Fold away everything two VALID transcriptions of the same audio may
    differ by, and nothing else. This is the whole normalisation, spelled out:

      1. NFKC              — full-width `？` and half-width `?` are the same mark
      2. drop punctuation, separators and all whitespace — the reading is written
         `ヨワイ ナー、ソンナ` with spaces as mora hints; the transcriber writes
         none. Spacing is authoring convenience, never content.
      3. katakana -> hiragana — the reading is katakana, the transcriber emits
         hiragana for the same sounds. `ソンナ` and `そんな` must compare equal.
      4. drop `ー` (long-vowel bar) and `っ` (geminate) — the reading writes
         `ヨワイ ナー` where the transcriber writes `弱いなぁ` or `弱いな`. Vowel
         length and gemination are exactly what a shout distorts, and they are
         the difference the transcriber is least consistent about.
      5. small kana -> large — `なぁ` == `なあ`.

    Deliberately NOT folded: voicing. `が` and `か` stay distinct, because a
    dropped dakuten is a real mispronunciation, not an orthographic variant.

    What this CANNOT do is convert kanji to its reading — there is no Japanese
    G2P in any venv here. That gap is why `asr_fidelity()` scores against the
    display text as well, and why the result is advisory.
    """
    t = unicodedata.normalize("NFKC", text)
    t = "".join(c for c in t
                if not unicodedata.category(c).startswith(("P", "Z", "C"))
                and not c.isspace())
    t = to_hiragana(t)
    t = t.replace("ー", "").replace("っ", "").replace("ゝ", "")
    return t.translate(_SMALL_MAP)


def morae(kana: str) -> int:
    """Mora count of a katakana reading. Small kana attach to the previous mora."""
    k = "".join(_KANA_RE.findall(unicodedata.normalize("NFKC", kana)))
    return sum(1 for c in k if c not in _SMALL)


def levenshtein(a: str, b: str) -> int:
    if not a:
        return len(b)
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def kana_coverage(transcript: str) -> float:
    """Fraction of the transcript's substantive characters that are kana.

    Near 0 means the transcript is all kanji and the CER below is meaningless —
    which is exactly what happens on `汎用人型決戦兵器初号機`."""
    raw = unicodedata.normalize("NFKC", transcript)
    subst = [c for c in raw if c.strip() and not unicodedata.category(c).startswith("P")]
    if not subst:
        return 0.0
    return len(_KANA_RE.findall("".join(subst))) / len(subst)


def cer_kana(expected_kana: str, transcript: str) -> float | None:
    """Advisory CER in the kana domain. None when there is nothing to compare."""
    exp = kana_only(expected_kana)
    got = kana_only(transcript)
    if not exp:
        return None
    return round(levenshtein(exp, got) / len(exp), 4)


def mora_rate(expected_kana: str, duration_sec: float | None) -> float | None:
    if not duration_sec or duration_sec <= 0:
        return None
    m = morae(expected_kana)
    return round(m / duration_sec, 2) if m else None


def asr_fidelity(transcript: str | None, kana: str | None = None,
                 text: str | None = None) -> dict:
    """Round-trip fidelity: how far the transcript is from what we asked for.

    Scored against BOTH available spellings of the line and the LOWER error
    kept, because the transcriber legitimately chooses either domain:

      * `kana` is the reading fed to the model (`ハンヨウ ヒトガタ …`)
      * `text` is the line as the game displays it (`汎用人型決戦兵器初号機`)

    The transcriber emits ordinary mixed-script Japanese, so for a kanji-bearing
    line the display text is the near-neighbour and the reading is the far one;
    for a pure grunt (`ウグッ！イタイッ！`) there is no kanji and both agree.
    Taking the minimum is not scoring twice until something passes — it is
    admitting that two different strings are both correct answers and we do not
    control which one comes back.

    Measured effect on the 21 proof clips (`min` vs the old kana-only CER): the
    kanji artefact disappears — `ショゴウキ` 1.000 -> 0.385, and three flawless
    clips reach a true 0.000. It still does not separate good from broken; see
    the module docstring. ADVISORY.

    Returns cer (the min), the two components, and which spelling won.
    """
    out: dict = {"cer": None, "cerKana": None, "cerText": None, "matched": None}
    if not transcript:
        return out
    got = norm_phonetic(transcript)
    if not got:
        return out
    cands: list[tuple[str, float]] = []
    for label, src in (("kana", kana), ("text", text)):
        exp = norm_phonetic(src or "")
        if not exp:
            continue
        val = round(levenshtein(exp, got) / len(exp), 4)
        out["cerKana" if label == "kana" else "cerText"] = val
        cands.append((label, val))
    if not cands:
        return out
    best = min(cands, key=lambda kv: kv[1])
    out["matched"], out["cer"] = best[0], best[1]
    return out


# --------------------------------------------------------------- sanity ------
# ffmpeg only, so this runs under ANY interpreter — no venv, no numpy. Catches
# the failures that speaker similarity cannot see because they are not about the
# voice at all: an empty file, a clipped file, a file that decodes to nothing.

def audio_sanity(path: str) -> dict:
    """Peak / mean level, clipped-sample count and duration, via ffmpeg.

    `volumedetect` gives max_volume and mean_volume in dBFS plus histogram_0db,
    the number of samples sitting at full scale — which is what digital clipping
    actually is.
    """
    res: dict = {"peakDbfs": None, "meanDbfs": None, "clippedSamples": None,
                 "clippedFraction": None, "durationSec": None, "silent": None,
                 "clipped": None, "sanityError": None}
    try:
        proc = subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-i", path,
             "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"],
            capture_output=True, text=True)
        err = proc.stderr or ""
        # ffmpeg instantiates the filter once per input and prints a stats block
        # for each, so an unused instance emits a leading `n_samples: 0`. Take
        # the LAST/largest block, never the first, or every fraction is None.
        for key, field in (("max_volume", "peakDbfs"), ("mean_volume", "meanDbfs")):
            found = re.findall(rf"{key}:\s*(-?[\d.]+) dB", err)
            if found:
                res[field] = float(found[-1])
        hits = re.findall(r"histogram_0db:\s*(\d+)", err)
        res["clippedSamples"] = int(hits[-1]) if hits else 0
        samples = [int(x) for x in re.findall(r"n_samples:\s*(\d+)", err)]
        total = max(samples) if samples else 0
        if total:
            res["clippedFraction"] = round(res["clippedSamples"] / total, 6)
    except FileNotFoundError:
        res["sanityError"] = "ffmpeg not on PATH"
        return res
    except Exception as e:                                  # pragma: no cover
        res["sanityError"] = f"{type(e).__name__}: {e}"
        return res

    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "json", path], capture_output=True, text=True, check=True).stdout
        res["durationSec"] = round(
            float(json.loads(out).get("format", {}).get("duration") or 0), 3)
    except Exception:
        pass

    peak = res["peakDbfs"]
    res["silent"] = (peak is None) or (peak <= SILENT_PEAK_DBFS)
    frac = res["clippedFraction"]
    res["clipped"] = bool(frac is not None and frac >= CLIP_FRACTION_FAIL)
    return res


# ---------------------------------------------------- speaker similarity -----
# Needs onnxruntime + torchaudio, i.e. the CosyVoice venv. Imported lazily so
# that `qa.py gate` and `synth.py --dry-run` stay stdlib-only.

_session = None


def campplus_path() -> str:
    home = os.environ.get("GGD_COSYVOICE_HOME",
                          "/Users/Takuro/ggd-voice-cosyvoice3/CosyVoice")
    return os.path.join(home, "pretrained_models/Fun-CosyVoice3-0.5B/campplus.onnx")


def _embedder():
    """The CAM++ encoder that ships with the CosyVoice 3 weights.

    It must be THIS encoder and not IndexTTS's: the thresholds above were
    measured with it, and cosine values from a different speaker encoder are not
    comparable. Using the CosyVoice one for both engines also keeps the
    comparison between them fair.
    """
    global _session
    if _session is None:
        import onnxruntime
        path = campplus_path()
        if not os.path.exists(path):
            raise RuntimeError(
                f"speaker scoring needs {path}\n"
                f"  set $GGD_COSYVOICE_HOME to the CosyVoice checkout")
        opt = onnxruntime.SessionOptions()
        opt.intra_op_num_threads = 1
        _session = onnxruntime.InferenceSession(
            path, sess_options=opt, providers=["CPUExecutionProvider"])
    return _session


def embed(path: str):
    """80-dim fbank -> CAM++ embedding, L2-normalised. Same feature path
    CosyVoice itself uses for its speaker prompt (frontend.py:_extract_spk_embedding)."""
    import numpy as np
    import torchaudio
    import torchaudio.compliance.kaldi as kaldi

    wav, sr = torchaudio.load(path, backend="soundfile")
    wav = wav.mean(dim=0, keepdim=True)
    if sr != 16000:
        wav = torchaudio.transforms.Resample(sr, 16000)(wav)
    feat = kaldi.fbank(wav, num_mel_bins=80, dither=0, sample_frequency=16000)
    feat = feat - feat.mean(dim=0, keepdim=True)
    sess = _embedder()
    e = sess.run(None, {sess.get_inputs()[0].name:
                        feat.unsqueeze(0).numpy()})[0].flatten()
    n = float(np.linalg.norm(e))
    return e / n if n else e


def speaker_similarity(ref_path: str, clip_path: str) -> float:
    """Cosine similarity in [-1, 1]. ~0.21 is the unrelated-speaker floor
    measured on this install; >=0.65 is the accept gate (see module docstring)."""
    import numpy as np
    return round(float(np.dot(embed(ref_path), embed(clip_path))), 4)


# ----------------------------------------------------------------- ASR -------
# Needs mlx_whisper, i.e. the ASR venv. Never installs, never downloads.

def transcribe(path: str, language: str = "ja",
               repo: str = "mlx-community/whisper-large-v3-turbo") -> str:
    os.environ.setdefault("HF_HUB_OFFLINE", "1")   # borrow read-only, stay offline
    import mlx_whisper
    r = mlx_whisper.transcribe(path, path_or_hf_repo=repo, language=language,
                               temperature=0.0, condition_on_previous_text=False)
    return (r.get("text") or "").strip()
