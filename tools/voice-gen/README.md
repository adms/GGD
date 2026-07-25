# voice-gen — per-character voice lines by zero-shot cloning

The goal is ~42 lines × 48 open-roster champions ≈ **2,000 clips**, each spoken
in that champion's own voice, cloned from a single short reference clip.

> **The owner's directive**
> 「IndexTTS 模型替換成 CosyVoice 3 來生成，除非生成不好才用 IndexTTS」
> CosyVoice 3 is the default engine. IndexTTS-2 is the fallback, used when
> CosyVoice output is not good enough.

The whole design follows from the second half of that sentence: **"not good
enough" is a measured condition, not an impression.** `qa.py` scores every
rendered clip against its own reference and writes the pin file that sends the
failures — and only the failures — to IndexTTS-2. Nobody re-routes a category
because it sounded off.

This directory is **code only**. Both engines, their ~31 GB of combined weights
and their two mutually incompatible venvs live **outside the repo**. Nothing
here can ever stage a model file.

| file | what it is |
| --- | --- |
| `engine.py` | the engine-agnostic core: idempotency, audio I/O, the registry. **Read its docstring first.** |
| `engine_cosyvoice3.py` | the **default** engine. Japanese, Chinese, English. |
| `engine_indextts.py` | the **fallback** engine. zh/en only, but has per-line emotion control. |
| `routing.py` | which engine speaks which line, and the precedence ladder. |
| `score.py` | the measurements, and an honest account of which ones may gate. |
| `qa.py` | measures a rendered corpus → report + pins. |
| `synth.py` | the CLI: one clip, or a sharded idempotent batch. |
| `examples/manifest.example.jsonl` | the manifest format, annotated. |

---

## 0. Running it

Each engine needs its own interpreter. **Planning needs neither**, so a dry run
works under bare `python3` and will plan a mixed-engine corpus in full.

```sh
C=/Users/Takuro/ggd-voice-cosyvoice3/.venv/bin/python   # cosyvoice3 (default)
I=/Users/Takuro/ggd-voice/index-tts/.venv/bin/python    # indextts (fallback)

# what would run, for both engines, with no model loaded
python3 tools/voice-gen/synth.py --manifest lines.jsonl --dry-run --explain-routing

# one clip
$C tools/voice-gen/synth.py --ref refs/e001.wav --lang ja \
     --text "いくぞ！覚悟しろ！" --kana "イクゾ！カクゴ シロ！" --out /tmp/a.mp3

# the corpus, 4 workers, each in its own terminal
$C tools/voice-gen/synth.py --manifest lines.jsonl --shard 0 --shards 4
$C tools/voice-gen/synth.py --manifest lines.jsonl --shard 1 --shards 4   # …2, 3

# measure it, then re-render only what failed, on the fallback engine
$C tools/voice-gen/qa.py    --manifest lines.jsonl --report qa.json --pins-out pins.jsonl
$I tools/voice-gen/synth.py --manifest lines.jsonl --pins pins.jsonl --engine-only indextts
```

Running a manifest under the "wrong" venv is not an error: lines routed to the
other engine are reported as **deferred**, with the exact command to finish
them. Nothing crashes 40 clips in.

---

## 1. How an engine is chosen, per line

`routing.py`. Highest precedence first — the winner is recorded in every clip's
sidecar as `engineReason`, so the corpus explains itself afterwards.

| # | source | example |
| --- | --- | --- |
| 1 | `--force-engine` / `--force-variant` | operator override for a whole run |
| 2 | a pin from `--pins FILE` | **written by `qa.py` from measurements** |
| 3 | the entry's `engine` field | the author's per-line decision |
| 4 | `--engine-for CAT=ENGINE[:VARIANT]` | `--engine-for hurt=indextts` |
| 5 | `--engine` / `--variant` | this run's default |
| 6 | built-in | `cosyvoice3` / `base` |

A line's **category** is its `category` field, or the part of its id after the
last dot — so `godie-e001.hurt` is category `hurt` for free.

**There is deliberately no built-in category→engine table.** The measured weak
spots (shouts, grunts, proper nouns) are a tempting thing to hard-code, and it
would be wrong twice over: IndexTTS-2 cannot speak Japanese at all without a
hand-written romaji reading, so it is not automatically the better answer for a
Japanese grunt; and a built-in table would shape a 2,000-clip corpus from seven
sample lines. Measure the real corpus, then pin.

### Variants

CosyVoice 3 ships base and RL LLM weights. **There is no clean winner**, so both
stay selectable and whichever ran is recorded per clip:

| line | base | RL |
| --- | --- | --- |
| battlecry | **0.635** | 0.326 |
| hurt | 0.415 | **0.531** |
| taunt | **0.795** | 0.726 |
| defeat | **0.746** | 0.739 |
| announcer | 0.723 | **0.780** |

(speaker similarity vs the reference, mps). Ordinary sentences land 0.72–0.83 on
both; the variants diverge exactly where both are weak.

> The proof script selected the RL model by `shutil.copy2(llm.rl.pt, llm.pt)`.
> **This tool never does that.** That is a process-global write to a shared file:
> with `--shards 4`, one shard swapping the checkpoint silently changes what the
> other three are generating, and a crash leaves the wrong weights installed.
> `engine_cosyvoice3.py` loads the variant with `load_state_dict()` into the live
> model instead. Nothing on disk is written.

---

## 2. Idempotency — and how the engine got into the hash

Every finished clip gets a `<clip>.method` JSON sidecar:

```json
{ "method": "cosyvoice3/cv3-0.5b-v1/base/e1ec96e10e12",
  "key": "0276bf46dffe624e778fb393ac3211c4",
  "engine": "cosyvoice3", "variant": "base", "engineReason": "default",
  "category": "name", "text": "蟬在叫人壞掉 - 龍宮禮奈",
  "modelText": "ヒグラシ ノ ナク コロニ・リュウグウ レナ。",
  "refSha256": "78fe18a0af5d9109", "device": "mps",
  "params": { "maxChars": 60, "takes": 1, … },
  "durationSec": 2.88, "wallSec": 2.88, "rtf": 1.0 }
```

`method` is `engine / method-version / variant / checkpoint-fingerprint`. A clip
is **done** iff the file is non-empty, its sidecar's `method` equals the current
engine's version string, **and** its `key` equals a fresh hash of the inputs.
The key covers that same engine version, the reference clip's *bytes*, the
normalised model text, and every render parameter.

Measured on the integration corpus — each of these does exactly the right thing:

| change | result |
| --- | --- |
| re-run, nothing changed | 4 current, **0.04 s**, nothing rendered |
| `--variant base` → `rl` | all 4 pending |
| engine → `indextts` | all 4 pending — **a CosyVoice clip is never kept for an IndexTTS run** |
| edit one line's `kana` | exactly 1 pending, 3 current |

The checkpoint fingerprint is a real sha256 of the weight files, memoised in
`~/.cache/ggd-voice-gen/ckpt-sha.json` on `(path, size, mtime_ns)` — so swapping
a checkpoint invalidates the corpus, but a dry run does not re-hash 2 GB every
time. Device is deliberately **excluded**: a CPU-rendered clip is not redone by
an MPS shard.

`--force` ignores all of it. A zero-byte file is never "done", which is what
makes a batch resumable after a SIGKILL.

## 3. Sharding

`--shard i --shards N`. A line belongs to shard `sha1(id) % N` — over the **id**,
not the list position, so adding a champion does not reshuffle who owns every
other line and a half-finished 4-way run stays valid after an edit. Shards never
collide because each writes only its own outputs.

## 4. Best-of-N takes

`--takes N` renders N candidates and keeps the one closest to the reference
speaker, discarding the rest. CosyVoice 3 is stochastic and the weak categories
are weak *on average*, not always — so this is tried **before** falling back to a
second 11 GB model. Measured, `--takes 4`:

| line | takes | kept | vs 1 take |
| --- | --- | --- | --- |
| name | 0.823 / 0.810 / 0.803 / 0.775 | **0.823** | 0.752 → 0.823 |
| taunt | 0.773 / 0.758 / 0.759 / 0.740 | **0.773** | 0.773 → 0.773 |
| hurt | 0.612 / 0.384 / 0.381 / 0.419 | **0.612** | 0.439 → 0.612, still fails the gate |

Seeds are derived from `sha1(id#take)`, so a re-run explores the same N
candidates rather than a fresh random N. Scoring needs the CosyVoice venv.

---

## 5. The quality gate — what may reject a clip, and what may not

`qa.py`, thresholds in `score.py`. Every threshold below was calibrated against
the 21-clip proof run, hand-labelled for "are the words right?", and every one
of them is quoted with the empty band it sits in. None is a round number.

### The four verdicts

| verdict | meaning | what to run |
|---|---|---|
| **PASS** | no defect found | ship it (but read §5 limits) |
| **RETRY** | defective, cheap fix unspent | `synth.py --pins retry.jsonl --only-pinned` |
| **FALLBACK** | defective, same engine spent | `synth.py --pins pins.jsonl --only-pinned` then `qa.py --adjudicate` |
| **BLOCKED** | defective, and rerouting *cannot* help | edit the `kana` by hand |
| **REVIEW** | the tool cannot judge it | listen |

```
$C qa.py --manifest m.jsonl --report qa.json --pins-out pins.jsonl \
         --retries-out retry.jsonl --html qa.html
$C synth.py --manifest m.jsonl --pins retry.jsonl --only-pinned   # RETRY
$I synth.py --manifest m.jsonl --pins pins.jsonl  --only-pinned   # FALLBACK
$C qa.py --manifest m.jsonl --adjudicate --pins pins.jsonl        # keep the winner
```

**RETRY before FALLBACK, and the boundary is measured.** Best-of-4 is worth a
try: it moved `hurt` 0.439 → 0.612 (+0.173) and `name` 0.752 → 0.823. +0.173 is
the largest gain ever observed here, so a clip below `0.65 − 0.173 = 0.48`
(`RETRY_FLOOR`) cannot reach the gate even on a best-ever retry, and skips
straight to the other engine instead of burning four renders to fail again.
A pin may carry `"takes": N`; `takes` is inside the idempotency key, so raising
it for one clip makes exactly that clip pending — no `--force`.

**FALLBACK keeps whichever engine actually scored better.** Falling back is a
*bet* that the other engine does better, and that bet is not free — IndexTTS-2 is
unproven on this material. So `--pins-out` archives the current clip first, the
fallback render overwrites the output, and `--adjudicate` scores both with the
same encoder, installs the winner, and writes both numbers to
`<clip>.contest.json`. If the challenger loses, the original is restored
byte-for-byte and its pin is dropped from the pin file so the corpus settles
instead of re-rendering the loser forever.

### Speaker similarity IS the gate

Cosine distance between CAM++ embeddings of the reference clip and the generated
clip, using the `campplus.onnx` that ships inside the CosyVoice 3 weights. On
the 21-clip proof run it separates the two outcome clusters **with no overlap**:

- reject (< 0.65): battlecry 0.286 / 0.326 / 0.635, hurt 0.415 / 0.433 / 0.531
- accept (≥ 0.65): taunt 0.726–0.795, defeat 0.739–0.746, names 0.719–0.828,
  announcer 0.723–0.798

Widest rejected value 0.635, lowest accepted 0.719 — **0.65 sits in an empty
band**. That is the entire justification for the default; it is not a round
number chosen for looking reasonable. Two unrelated references score ~0.21
against each other, which is the floor.

`--review-speaker-sim` (default 0.72) marks a grey band for a human listen
rather than an automatic reject.

### Clipping and truncation are also gates — and they need no interpretation

Two defects are physical, not semantic, so unlike pronunciation they can be
decided outright:

- **Clipping ≥ 2% of samples at full scale.** Measured as a *fraction*, because
  a raw count is the wrong unit — 696 clipped samples is 0.9% of a 3.2 s
  announcer line (fine) and would be 8% of a 0.3 s grunt (destroyed). On the
  proof set: 17 good clips span **0.000–1.271%**, and the two clips that clip
  more sit at **2.822%** and **3.387%**. 2.0% is in that empty band. It caught
  both hand-labelled bad battlecries on its own, which fits the failure mode —
  the model over-drives on shouts.
- **Mora rate > 10.0/s = truncation.** If the audio is too short to physically
  contain the requested morae, content was dropped. The 17 good clips top out at
  **9.38**; the one clip that demonstrably lost content (`hurt`, 0.68 s for 7
  morae, transcribed as the 3-mora `ググって`) sits at **10.29**.

Plus the existence checks: silent (peak ≤ −40 dBFS), shorter than 0.25 s,
undecodable. All measured from the *file* with ffmpeg, not trusted from the
render receipt — the receipt describes what the engine thought it wrote.

### ASR character error rate is NOT a gate, and cannot be on this install

The transcriber returns ordinary mixed-script Japanese (`汎用人型決戦兵器初号機`)
while the reading is katakana (`ハンヨウ ヒトガタ …`), and there is no Japanese
G2P in any of the three venvs to bridge them (checked: no pykakasi / fugashi /
MeCab / pyopenjtalk / SudachiPy; `g2p_en` is English-only). Four routes were
tried; all four are recorded so nobody re-tries them:

1. **Strict CER in the kana domain** — kanji in the transcript becomes
   deletions, so good clips score like broken ones. Measured on the proof set:
   defeat **0.31** and announcer **0.30** (both flawless) against hurt **0.80**
   (genuinely broken). No threshold separates them.
2. **Deletion-tolerant CER** (is the transcript an approximate subsequence of the
   reading?) — forgives dropped morae by construction, and dropped morae is
   precisely the champion-name failure we need to catch: `リュウグウ レナ` came
   back as `リューグレナ` and scores **0.00** error. Worse than useless.
3. **Biasing the transcriber toward katakana with an `initial_prompt`** —
   measured unreliable, and on one clip **the prompt leaked into the transcript**
   (a battle cry transcribed as `コレ ワ カタカナ デス。`). Actively dangerous.
4. **Score against the reading AND the display text, keep the lower** — the one
   worth having, and the current `asr_fidelity()`. The transcriber emits
   mixed-script Japanese, which is the *display text's* domain; comparing only
   against the kana reading was measuring the wrong thing.

**How the normalisation works** (`score.norm_phonetic`), folding exactly what
two valid transcriptions of the same audio may differ by:
NFKC → drop punctuation/separators/whitespace (the reading is written
`ヨワイ ナー、ソンナ` with spaces as mora hints; the transcriber writes none) →
katakana→hiragana (`ソンナ` == `そんな`) → drop `ー` and `っ` (`ヨワイ ナー` vs
`弱いなぁ` vs `弱いな`) → small kana→large. **Voicing is deliberately not
folded**: `が` vs `か` is a real mispronunciation, not an orthographic variant.

Measured over all 21 proof clips against hand labels:

| metric | flawless clips | broken clips | separates? |
|---|---|---|---|
| kana-only CER (old) | 0.167 – **1.000** | 0.235 – 0.800 | no |
| `min(kana, text)` | 0.000 – **0.706** | 0.235 – 0.800 | no |

The kanji artefact is gone (`ショゴウキ` **1.000 → 0.385**, three clips reach a
true 0.000), so the number is finally readable by a human. It still does not
separate, for one irreducible reason: **a mangled proper noun is a small edit
distance and a fatal error.** `リュウグウ レナ` → `リューグレナ` scores 0.235,
while a perfectly good rendering that the transcriber chose to write in kanji
scores 0.706. Nothing can put those on the right sides. So the transcript, its
error rate, kana coverage and speaking rate are computed, recorded and shown —
as **advisory**, routing to the review queue, never to an automatic reject.

### The output

```
voice-gen qa: 8 measured — 3 pass, 1 review, 1 retry, 1 fallback, 2 blocked
  gate: spkSim >= 0.65 (grey band to 0.72)
  battlecry  n=1  meanSpkSim=0.2856  min=0.2856  retry=0 fallback=0 blocked=1 review=0
  hurt       n=2  meanSpkSim=0.4818  min=0.4328  retry=1 fallback=0 blocked=1 review=0
  name       n=2  meanSpkSim=0.7732  min=0.7189  retry=0 fallback=0 blocked=0 review=1
  worst champions:
    godie-e001      n=4  fallback=0 retry=0 blocked=2 meanSpkSim=0.5409
  FALLBACK  godie-e003.taunt [cosyvoice3/base] clipped: 3.39% … ; spkSim 0.286 < 0.65
  BLOCKED   godie-e001.hurt  [cosyvoice3/base] truncated: 10.29 morae/s > 10.0 …
```

`--html` writes the **per-champion audition page**: one self-contained file, no
external requests, champions with flagged lines expanded, and a play button next
to the number that flagged each line. That is the artefact for the owner — he
auditions the flagged clips, not all 2,208.

The per-category rollup is the thing to read for *routing*: a category whose
*mean* is low is a routing decision, while one bad line is a pin. Pins are plain
JSONL and hand-editable — delete a line to leave that clip where it is.

`qa.py` runs its two measurement stages under two different venvs by re-execing
itself (`$GGD_COSYVOICE_PYTHON`, `$GGD_ASR_PYTHON`); the gate stage is pure
stdlib. Run it under any of them.

> **The fallback is not free for Japanese — and this is the biggest structural
> finding.** IndexTTS-2 has zero kana tokens, so a failing `lang: ja` line with
> no `romaji` cannot be rescued by rerouting at all. Those get the **BLOCKED**
> verdict rather than a pin that would quietly do nothing: they are still
> failing, but the fix is editorial (respell the `kana`), not a reroute.
> On a Japanese-heavy corpus expect *most* hard failures to land here — the
> owner's 「除非生成不好才用 IndexTTS」 fallback is, for Japanese, mostly
> unavailable, and the real lever is the kana spelling plus best-of-N.

### What the gate is blind to

Shipped in every report, JSON and HTML, because a gate that does not say what it
cannot see reads as a quality guarantee:

- **A PASS means** it sounds like the right speaker, is not clipped, not silent,
  and long enough to contain the line. **It does not mean the clip is good.**
- **Prosody is not measured.** Nothing here knows whether a battlecry sounds like
  a shout or whether a defeat line sounds defeated. A flat, bored reading of the
  right words by the right voice scores exactly as well as a great one.
- **Comedic timing is not measured**, and #57 makes the VO deliberately 惡搞
  jank. A clip can pass everything and still be wrong for the game — and a clip
  the numbers dislike may be exactly the kind of broken that is funny. The gate
  finds *defects*; it does not have taste. Overrule it freely.
- **Proper nouns are the known hole.** `リュウグウ レナ` came back as
  `リューグレナ` and still scored **0.719 speaker similarity — a PASS**. The
  name-bearing categories (角色名言, 喊出技能名稱) must be auditioned by a human
  regardless of what the report says.
- Speaker similarity is measured against **one** reference clip per champion, so
  for shouts and pain grunts part of the gap is the metric, not the audio.

---

## 6. Japanese — the one thing to get right

**CosyVoice 3 needs Japanese as space-separated katakana.** Upstream's
`example.py` says so outright. This is **not** a vocabulary limit — measured, the
Qwen tokenizer round-trips Traditional Chinese, hiragana, katakana and Japanese
kanji with **zero `<unk>`** (17/17, 10/10, 34/34, 4/4 tokens). It is a
*training-data* limit: raw kanji input is read as Chinese.

So every `lang: ja` line carries a `kana` field, and `synth.py` refuses the line
rather than guessing a reading — a wrong guess is a mispronounced champion name
that nobody catches until a player hears it.

### Pronunciation inpainting does not cover Japanese

CosyVoice 3 advertises "pronunciation inpainting of Chinese Pinyin and English
CMU phonemes". Counted directly out of `CosyVoice3Tokenizer`'s special-token
list: **265 bracket tokens — 84 ARPAbet, 181 pinyin, and zero containing any
kana.** The `报道[j][ǐ]予好评` hotfix syntax has no Japanese equivalent.

**The lever that does exist is the `kana` spelling itself.** The mangled name in
the proof run — `リュウグウ レナ` → `リューグレナ` — is a mora-boundary error, and
the fix is to respell the reading (`リュウ グウ レナ`, or `リュー グー レナ`) and
re-measure. Because the model text is inside the idempotency key, editing one
line's `kana` re-renders exactly that clip and nothing else. That is the
Japanese pronunciation-control loop: **respell, re-run, re-measure.** There is no
phoneme-level control and no pitch-accent control.

### No Traditional→Simplified conversion for CosyVoice 3

That is an IndexTTS-2 workaround (blocker B in §9). CosyVoice 3 tokenises 繁中
losslessly, so converting would change what is said for no reason. Chinese text
goes in exactly as authored. Text preparation is per-engine, not global.

---

## 7. Rebuilding the installs from scratch

### 7.1 Paths (all outside the repo)

| what | where |
| --- | --- |
| CosyVoice 3 checkout | `/Users/Takuro/ggd-voice-cosyvoice3/CosyVoice` — `$GGD_COSYVOICE_HOME` |
| CosyVoice 3 venv | `/Users/Takuro/ggd-voice-cosyvoice3/.venv` (torch 2.8, onnxruntime 1.18) |
| CosyVoice 3 weights | `…/CosyVoice/pretrained_models/Fun-CosyVoice3-0.5B/` (~20 GB) |
| IndexTTS-2 checkout | `/Users/Takuro/ggd-voice/index-tts` — `$GGD_INDEXTTS_HOME` |
| IndexTTS-2 venv | `…/index-tts/.venv`, **Python 3.11.2 arm64** |
| IndexTTS-2 weights | `…/index-tts/checkpoints/` (11 GB) |
| ASR venv (borrowed **read-only**) | `/Users/Takuro/ggd-voice/asr-venv` — mlx_whisper |
| tool cache (refs, ckpt hashes, qa scratch) | `~/.cache/ggd-voice-gen` — `$GGD_VOICEGEN_CACHE` |

`git check-ignore` on any weight file answers *"outside repository at
'/Users/Takuro/GGD'"* — a stronger guarantee than a `.gitignore` rule, because
the path is not reachable from the work tree at all.

The three venvs are **not** interchangeable and must not be merged: the ASR venv
has `mlx_whisper` but no `onnxruntime`/`torchaudio`; the CosyVoice venv has
`onnxruntime`/`torchaudio` but no `mlx_whisper`; `tools/icon-gen/.venv` is a
fourth environment on torch 2.13.

### 7.2 IndexTTS-2

> ⚠️ **Use the arm64 Homebrew.** The `brew` and `uv` first on `PATH` here are
> `/usr/local` = **x86_64 under Rosetta**. An x86_64 `uv` builds an x86_64 venv,
> which has **no MPS** and would silently run ~3× slower on CPU. Verify with
> `python -c "import platform; print(platform.machine())"` → must be `arm64`.

```sh
/opt/homebrew/bin/brew install uv git-lfs && git lfs install
mkdir -p ~/ggd-voice && cd ~/ggd-voice
git clone https://github.com/index-tts/index-tts.git && cd index-tts
git checkout 13495845e3028f0bb6ca1462ad22aa0e76349e40
uv sync --extra webui          # NOT --all-extras — see §8
uv pip install opencc-python-reimplemented   # Traditional→Simplified

uv tool install "huggingface-hub[hf_xet]"    # gives you `hf`
hf download IndexTeam/IndexTTS-2 --local-dir checkpoints
```

That download is 5.5 GB. **The upstream README does not mention the other half:**
`indextts/utils/model_download.py` pulls four more repos into
`checkpoints/hf_cache/` on the first `IndexTTS2(...)` init — `facebook/w2v-bert-2.0`
(2.2 G + 2.2 G), MaskGCT `semantic_codec` (169 M), `nvidia/bigvgan_v2_22khz_80band_256x`
(428 M), `funasr/campplus` (27 M). **Budget ~11 GB, not the 5.9 GB the model card
implies.** Integrity is HF's own SHA-keyed xet cache; no separate checksum
manifest is published.

### 7.3 Verify both

```sh
$I ~/ggd-voice/index-tts/tools/gpu_check.py     # "Apple MPS is available!"
python3 tools/voice-gen/synth.py --manifest examples/manifest.example.jsonl --dry-run
```

## 8. Dependency substitutions (IndexTTS-2) — every one, and why

Apple Silicon has no CUDA. Following upstream's README verbatim fails; each
deviation is deliberate and load-bearing.

| upstream asks | what this install does | why |
| --- | --- | --- |
| `uv sync --all-extras` | **`uv sync --extra webui`** | `--all-extras` pulls `deepspeed`, `flash-attn`, `nvidia-cuda-runtime-cu12`, `nvidia-cudnn-cu12`, `triton-windows` — all unbuildable or nonexistent on arm64 macOS. |
| `deepspeed==0.17.1` | **omitted** | Does not compile on macOS. Safe: `infer_v2.py:101` wraps the import in try/except; the engine also passes `use_deepspeed=False` explicitly rather than relying on the fallback. |
| `flash-attn` / the `accel` extra | **omitted** | CUDA-only kernel. `use_cuda_kernel=False`; `infer_v2.py:110` degrades to plain torch. |
| the `torch_compile` extra (`triton-windows`) | **omitted** | Windows-only package. |
| CUDA torch from `download.pytorch.org/whl/cu128` | **PyPI `torch==2.8.0` / `torchaudio==2.8.0`** (arm64, MPS) | This is upstream's *own* platform marker resolving correctly, not a deviation we invented. |
| `WeTextProcessing` (needs `pynini`) | **`wetext==0.1.0`** | Again upstream's own `sys_platform != 'linux'` marker. The notorious pynini build never arises. |
| — | **`opencc-python-reimplemented==0.1.7` added** | Not an upstream dep. Required by blocker B in §9. |
| `huggingface-cli` | `uv tool install "huggingface-hub[hf_xet]"` → `hf` | The `cli` extra no longer exists in hub 1.x. |

**Zero CUDA-flavoured packages are installed** — verified by enumerating
`importlib.metadata.distributions()` for `nvidia|cuda|triton|deepspeed|flash-attn`;
the list is empty.

Two corrections to earlier notes on this install:

- **fp16 does nothing.** `infer_v2.py:74` hard-sets `use_fp16 = False` on the mps
  branch (*"Use float16 on MPS is overhead than float32"*) no matter what you
  pass. An earlier "fp16 is ~5× faster" reading was warm-cache variance. There is
  no `--fp16` flag here because there is nothing behind one.
- **The SIGKILL/137 crashes were not sandbox reaping.** They are MPS memory —
  blocker C in §9.

## 9. Benchmarks and known limits

### CosyVoice 3 (M5 Max, 7 Japanese lines, measured)

| config | init | gen | audio | mean RTF | peak RSS | MPS peak |
| --- | --- | --- | --- | --- | --- | --- |
| **base, mps** | 7.7 s | 17.9 s | 15.6 s | **1.15** | 8.8 GB | 3.1 GB |
| **RL, mps** | 6.4 s | 15.0 s | 14.2 s | **1.06** | 8.8 GB | 3.1 GB |
| base, cpu (control) | 6.6 s | 34.1 s | 14.4 s | 2.36 | 8.8 GB | — |

Output is 24 kHz mono; MP3 delivery resamples to the #158 ceiling. MPS is ~2×
CPU. Measured on the 4-clip integration corpus: **5.2 s/clip including model
load**, ~2.9 s/clip warm.

**HiFT stays on CPU.** Its f0 predictor runs in float64, which MPS does not
support; LLM + flow go to MPS and the vocoder tensors are bridged at the
boundary. This is not optional on mps.

### IndexTTS-2 (M5 Max, measured)

| config | init | warm s/clip | aggregate s/clip | RTF |
| --- | --- | --- | --- | --- |
| **CPU control** | 11.8 s | **17.70** | — | ~11 |
| **MPS, 1 worker** | 13.4 s | **5.34** | 6.06 | 3.4 |
| **MPS, 2 workers** | 12.7 s | 4.79 | **2.88** | 1.8 |
| **MPS, 4 workers** | 13.9 s | 6.77 | **2.63** | 1.6 |

MPS is **3.3× CPU**; 4 workers buy only **2.03×** over 1. Steady-state RSS is
7.79 GB per worker.

**Do not run 4 IndexTTS workers on long lines.** Peak MPS *driver* allocation is
~70 GB per process on a long line; 4 × 70 > 128 GB.

### Blocker A — IndexTTS-2 cannot speak Japanese. Structural, not tunable.

`bpe.model` is a 12,000-token vocabulary with **zero hiragana and zero
katakana**; `いくぞ！かくごしろ！` is 8/8 `<unk>`. Japanese-only kanji forms are
missing too (`覚` unknown; `悟` and `勝利` work only because they are shared
hanzi). `indextts/utils/front.py:124-125` loads exactly two normalizers, `zh`
and `en` — there is no Japanese front-end at all.

**This is why CosyVoice 3 is the default and not merely an alternative.** The
game's VO is Japanese by design (#35, #40, #120, #139, #142; `quotes.json` is 113
Japanese 名言). IndexTTS-2 remains wired as the fallback for zh/en lines, and for
Japanese only with a hand-written `romaji` field. `synth.py` refuses kana on this
engine and says so; `--allow-kana` renders the failure for whoever wants to hear
it.

### Blocker B — Traditional Chinese on IndexTTS-2. Handled automatically.

`又變強了！去死團的逆襲…` is 9 `<unk>` out of 21 characters and synthesizes as
gibberish; the same line through OpenCC `t2s` is 0 unknowns and round-trips
verbatim. The IndexTTS engine does this on every non-`en` line and the sidecar
records both `text` (as displayed) and `modelText` (as spoken). **Only the
model's input is converted — displayed text stays Traditional.** CosyVoice 3
does not need and does not get this.

### Blocker C — the IndexTTS MPS memory ratchet. Handled, but know it is there.

With upstream's default `max_text_tokens_per_segment=120`, driver allocation
climbs monotonically through one long generation — measured 9 → 21 → 35 → 55 →
73 GB against a 115.4 GB recommended max — and the OS SIGKILLs the process
(exit 137). Reproduced deterministically on a 39-character line with 92 GB free;
`caffeinate` made no difference. Two verified fixes, both applied: segment at 40
tokens, and `torch.mps.empty_cache()` after every clip (drops driver allocation
70 → 11 GB, measured across three consecutive long clips).

### Output format (#158, #62)

Every `.mp3` output goes through ffmpeg `loudnorm` to −16 LUFS / −1.5 dBTP, then
**libmp3lame 128 kbps / 44.1 kHz / mono** — verified with ffprobe on the
integration corpus. That matches
`content/assets/audio/voices/quotes/quotes.json` so a cloned clip sits at the
same level as the `say` clips it replaces. A `.wav` path ships the raw 24 kHz
instead.

Nothing in this tool opens an audio device (#62). It writes files; ffmpeg runs
with `-nostdin`.

### Licences — flag before any clip ships (#13)

- **IndexTTS-2** weights are **not** OSS-licensed: `LICENSE` is the *bilibili
  Model Use License Agreement*. §2.2's 100 M MAU / RMB 1 B revenue threshold is
  irrelevant to us, but the binding clause is that every copy of the Model **or
  any Derivative Work** must retain the copyright notices and a copy of the
  agreement, plus a ban on using it to improve other AI models. Whether generated
  *audio* is a "Derivative Work" is not spelled out.
- **CosyVoice 3** — confirm the terms attached to the `Fun-CosyVoice3-0.5B`
  weights specifically, not just the Apache-2.0 on the code checkout.

GGD already maintains a mandatory-attribution page. Both engines should get an
entry there, and that is the owner's call **before** 2,000 clips ship.

## 10. What is still missing before the real run

1. **48 reference clips.** 5–10 s of clean solo speech each, with a licence note
   — the same discipline as `docs/asset-debt.md` and the #13 attribution page.
   References are normalised to 16 kHz mono WAV automatically and cached by
   content hash, so any input format ffmpeg reads is fine.
2. **The 42-line script**, as a manifest, **with `kana` readings for every
   Japanese line.** `content/assets/audio/voices/quotes/quotes.json` already
   carries a per-champion 名言 and a gender; the readings do not exist yet and
   cannot be auto-generated here (§6).
3. **A listening pass.** Everything above is objective measurement. `qa.py`'s
   review queue exists precisely because some clips cannot be judged
   automatically — that is a human job, and the tool now says which ones.

---

## 11. The admin console lane (`src/serve.mjs` + 角色語音生成)

`node tools/voice-gen/src/serve.mjs` starts the loopback daemon on
**127.0.0.1:8788** that the admin page 角色語音生成 (dev-only, vite proxy
`/voice-api`) talks to. The contract lives in
`apps/admin/src/voice/voiceApi.ts` / `voiceModel.ts`; the daemon implements it:
per-line state machine (`noText → pending → generating → generated →
approved/rejected`), stub honesty (no engine ⇒ `/health` says `stub:true` and
jobs fail with `no-engine`; a placeholder clip is never written), SSE progress
(`job`/`line`/`roster`/`engine`), and one-click jobs (`scope: line | champion |
roster`, `concurrency` ≤ 4 parallel synth.py subprocesses).

Storage is the content mount, so the client can read results directly:

    content/assets/audio/voices/lines/CATEGORIES.json   the owner's 41 categories
    content/assets/audio/voices/lines/ROSTER.json       published rollup (degraded-mode read)
    content/assets/audio/voices/lines/<champ>/status.json
    content/assets/audio/voices/lines/<champ>/<lineId>.mp3        current clip
    content/assets/audio/voices/lines/<champ>/takes/<lineId>.t<N>.mp3

References default to `voice-reference-pipeline/approved/processed/<champ>.wav`
(51 champs, sourceKind `repo`); the console can switch or upload one (uploads
require a licence note, per the referenceGate rule).

Line scripts are imported, not typed one by one:

    node tools/voice-gen/src/import_lines.mjs <dir-with-lines_batch_*.json>

Japanese lines carry a `kana` reading (README §6); the daemon refuses to
render a ja line without one, and editing a line's text through the console
drops the stale kana on purpose (re-import or re-author to restore it).

New champion later: add the hero row to
`voice-reference-pipeline/config/heroes.csv`, drop its reference wav in
`approved/processed/`, import its script batch, restart the daemon — the
console picks it up and 一鍵生成 covers it.
