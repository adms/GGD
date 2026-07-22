# Local anime image generation for icon-gen — setup + verdict

Status: **WORKING local text→image path proven on-device.** No cloud provider,
no API key, no per-image bill. This unblocks icon generation (#72 coverage,
#112 AI-image path, #101 icon page, editor `ai-editor-01/02/03`) by giving the
platform a real image provider it can call — a *local* one.

Everything here lives under `tools/icon-gen/local/` plus a gitignored venv and
model dir. No sim/content/client/app code was changed.

---

## 1. Hardware verdict + speed

| | |
| --- | --- |
| Chip | **Apple M5 Max** (18 cores: 6 E + 12 P), `uname -m` = `arm64`, `hw.optional.arm64` = 1 |
| Memory | **128 GB** unified |
| Free disk | **1.7 TB** on `/System/Volumes/Data` |
| GPU accel | **torch MPS available = True** (Metal) |

`go version` reports `darwin/amd64` and `brew`/`go` live under `/usr/local`
(Rosetta) — a red herring. The chip is Apple Silicon; the venv Python is native
arm64 and gets MPS.

**This is near-ideal hardware for local SD.** An SD1.5 model at 512×512 on MPS
runs in the **low single-digit seconds per image** range once the model is warm
(24 DPM++ steps). The 660-icon backlog is therefore on the order of **minutes to
a couple of hours of compute, at $0**, versus ~$7.26 at the cloud `gpt-image-1`
low tier — and with none of the third-party-IP exposure a cloud model carries.

There is no Intel/CPU-only caveat to state here: this machine has a fast GPU.

## 2. Python / env

- Native arm64 venv at `tools/icon-gen/.venv` built from
  `/opt/homebrew/bin/python3.11` (clean Homebrew arm64 Python 3.11.2).
  (The default `/usr/local/bin/python3` is a universal2 build that also runs
  arm64, but the Homebrew one is the cleanest.)
- Installed: `torch 2.13.0`, `torchvision`, `diffusers 0.39.0`,
  `transformers 5.14.1`, `accelerate`, `safetensors`, `pillow 12.3.0`.
- No pre-existing ComfyUI / A1111 / MLX install was on disk — this is a fresh,
  self-contained setup.

## 3. The pipeline this wires into (so we wire IN, not around)

`tools/icon-gen/src/generate.py` posts to the platform:
`POST {platform}/api/v1/ai/icon {prompt, size}` → `{pngBase64, stub}`.

The platform proxy (`apps/platform/internal/ai/`) is **already
provider-agnostic**. For images it makes an OpenAI-shaped call
(`provider.go: generateImagePNG`):

```
POST {imageBaseUrl}/images/generations   { model, prompt, n, size }
        → { data: [ { b64_json | url } ] }
```

**#112 clarified.** The "code-broken against every current provider" bug — the
old code sent `response_format:"b64_json"` unconditionally and a 256px size that
current models reject with a hard 400 — is **already fixed** (`ai-plat-22` /
`ai-image-dialect`, marked done: current models now get no `response_format` and
`1024x1024`). The *remaining* blocker is simply that **no image provider is
configured**: `data/config/ai-provider.json` does not exist, so `/ai/icon`
returns the stub placeholder and every icon run aborts on the stub gate.

A cloud provider would fix that but (a) costs money and (b) re-introduces exactly
the third-party-IP exposure this whole icon effort exists to retire (a model
asked for 「鬼隱之擊」 either refuses or paints a knock-off). **A local model
solves both.** Because the proxy is OpenAI-compatible, a local
OpenAI-images-compatible server IS a valid provider — no Go change.

## 4. What was built (`tools/icon-gen/local/`)

| file | what it is |
| --- | --- |
| `pipeline.py` | the single model loader: diffusers `StableDiffusionPipeline` on MPS, fp16, DPM++ 2M, safety-checker off (it black-squares dark-fantasy art). Model chosen by `ICON_GEN_MODEL`. Splits the tool's baked-in `Negative:` clause into a real SD negative prompt. |
| `gen.py` | one-shot CLI: render one icon from a content doc / subject / raw prompt. The proof + manual spot-check tool. Reuses `src/prompt.py` so a local render is prompted identically to the paid path. |
| `server.py` | **the wiring point.** A stdlib HTTP server that speaks the OpenAI `/v1/images/generations` dialect the platform already calls, backed by the local model. Point the platform's image provider at it — done. |

Model weights, HF cache and generated output are gitignored
(`tools/**/.venv/`, `tools/icon-gen/models/`, `tools/icon-gen/out/`).

## 5. Model used + storage

- **Proof model: `dreamlike-art/dreamlike-anime-1.0`** — a permissively-licensed
  anime SD1.5 checkpoint pulled from Hugging Face with **no auth**, so the
  pipeline proves out immediately. ~2 GB, cached under
  `tools/icon-gen/models/hf/` (gitignored).
- **Civitai (user-authorized, token required).** Civitai's browse API is
  tokenless, but the **download endpoint returns HTTP 401 without a token**.
  Verified: `GET https://civitai.com/api/download/models/948574` (MeinaMix) →
  `401`. Per policy I did **not** invent a token. To use a Civitai anime
  checkpoint (recommended for the real batch — MeinaMix, Counterfeit-V3, or
  ReV Animated are all clean SD1.5 anime models good for single-subject icons):

  1. Log in at civitai.com → Account → **API Keys** → create one.
  2. Download the `.safetensors` (2–5 GB), e.g.:
     ```sh
     curl -L -o tools/icon-gen/models/meinamix.safetensors \
       "https://civitai.com/api/download/models/948574?token=YOUR_CIVITAI_TOKEN"
     ```
  3. Point the pipeline at the file — no code change:
     ```sh
     export ICON_GEN_MODEL=/Users/Takuro/GGD/tools/icon-gen/models/meinamix.safetensors
     ```
     (`pipeline.py` uses `from_single_file` for a `.safetensors`/`.ckpt` path.)

  Candidate Civitai download URLs found (all SD1.5, all need `?token=`):
  MeinaMix `…/models/948574`, Counterfeit-V3.0 `…/models/57618`,
  ReV Animated `…/models/425083`.

## 6. Proof

**A real icon was generated on-device, end to end.**

Subjects were derived from real tier-1 GGD docs by `src/prompt.py` (unchanged),
rendered at 512 native, downscaled to 256px:

| doc | subject (derived) | out | dims | bytes | time (warm) |
| --- | --- | --- | --- | --- | --- |
| `abilities/godie-e001.q` 「鬼隱之擊」 | a horned oni mask, accent violet-black | `test-oni.png` | 256×256 | 136 239 | 5.0s |
| `abilities/godie-e001.w` 「染血的柴刀」 | a spatter of dark blood, accent crimson | `test-blood.png` | 256×256 | 129 380 | 4.6s |
| `champions/sela` | ember-sage portrait, accent molten orange | `test-sela.png` | 256×256 | 124 837 | 4.7s |

All non-blank (colour-spread ~760; a blank image is 0). The three are **visibly
distinct per subject**, which is the proof the fix below landed.

**Timing (Apple M5 Max, MPS, 24 DPM++ steps, 512 native):**
- model load, warm (weights cached): **2.9 s**
- per image: **~4.6–5.0 s**
- first-ever run (cold, incl. ~65 s model download + load): 80.9 s
- ⇒ the whole **660-icon backlog ≈ 55 min of compute, $0**.

**HTTP wiring proven too.** With `local/server.py` running, the exact
OpenAI-images request the platform sends
(`POST /v1/images/generations {model, prompt, n, size:"1024x1024"}`) returned
`200` with `{data:[{b64_json}]}` decoding to a valid **1024×1024** PNG
(`server-flame.png`, 1 600 829 bytes, correct `‰PNG` magic, non-blank) — i.e.
the platform's provider call works unmodified against the local model.

**One bug found and fixed while proving it.** SD1.5's CLIP text encoder caps at
**77 tokens**; the icon prompt is ~200, so CLIP silently truncated away the
SUBJECT and the NEGATIVE, yielding a generic bordered glow (first attempt,
`test-icon-oni.png`). `pipeline._encode_long()` now splits the prompt into
75-token windows and concatenates the CLIP embeddings, so the full subject and
negative reach the model. This is intrinsic to SD1.5 and does not affect the
cloud path.

**Art quality is a separate, expected tuning step, not a pipeline failure.** The
proof images read as on-theme emblems but are still abstract and occasionally
sneak a border in — exactly the "render a contact sheet and LOOK at it before a
full run" step the README's §6 already mandates. It improves with a stronger
anime checkpoint (a Civitai MeinaMix/Counterfeit — see §5), lower guidance, and
negative-prompt weighting. The pipeline, the wiring and the idempotence
machinery are what this task set out to prove, and they work.

**Storage / hygiene verified:** model cache `tools/icon-gen/models/` = 2.0 GB,
venv `tools/icon-gen/.venv/` = 946 MB — both confirmed **untracked** by
`git status` (gitignored). Nothing was committed.

## 7. How to wire it into the app (fixes the real #112 blocker)

Two ways; the first is the "wire into the existing path" one.

### A. Local server as the platform's image provider (recommended, no app change)

1. Start the local server (leave it running; warm-loads the model):
   ```sh
   cd /Users/Takuro/GGD/tools/icon-gen
   ICON_GEN_MODEL=dreamlike-art/dreamlike-anime-1.0 \
     ./.venv/bin/python local/server.py --port 8188 --warm
   ```
   Health check: `curl http://127.0.0.1:8188/v1/models`.

2. Configure it as the image provider. Either via the admin console
   (`AI 生成設定` page → Image: base URL `http://127.0.0.1:8188/v1`,
   model `local-sd`, key `local`, Enabled on), **or** write the durable config
   directly (server-side file, jsonstore shape):
   ```jsonc
   // data/config/ai-provider.json
   {
     "version": 1,
     "enabled": true,
     "imageBaseUrl": "http://127.0.0.1:8188/v1",
     "imageModel": "local-sd",
     "apiKey": "local"
   }
   ```
   `imageReady` then flips true and `/ai/icon` stops returning the stub.

3. Run the batch through the existing, unchanged tool:
   ```sh
   # pricing.json rate for a local model is $0 — the tool's cost gate expects a
   # known non-negative rate; add a "local-sd" entry (see note below) then:
   GGD_PLATFORM_TOKEN=<platform access token> \
     python3 tools/icon-gen/src/generate.py --tier 1 \
       --model local-sd --quality low --i-have-confirmed-pricing
   ```

   One small tooling edit is needed for the money-gate to accept a free local
   model: add to `tools/icon-gen/src/pricing.json`
   ```json
   "image": { "local-sd": { "note": "local MPS SD1.5, no cost", "low": 0.0 } }
   ```
   With a $0 rate the estimate is $0, under `--max-spend`, and the run proceeds.
   (`content_hash` includes the model name, so switching to `local-sd`
   regenerates cleanly rather than colliding with any gpt-image-1 sidecars.)

### B. Bypass the platform (fastest for a pure local batch)

`server.py` can be extended to also answer `POST /api/v1/ai/icon` with
`{pngBase64}` directly, and then point the tool straight at it:
`GGD_PLATFORM_URL=http://127.0.0.1:8188`. This skips the Go platform entirely
(no Redis, no auth token) — handy for a headless batch — but path A is the one
that also unblocks the **editor** buttons (`ai-editor-01/02/03`), because those
call the real platform `/ai/icon`.

### Editor items (`ai-editor-01/02/03`)

These are UI wiring in `apps/editor` and are unblocked the moment path A makes
`/ai/icon` return real art instead of the stub — the editor's `AI 生成 icon`
button already calls the platform proxy; it just never had a live provider.

## 8. Blockers / notes

- **Civitai token** (only if you want a Civitai checkpoint): a personal API
  token is required for downloads (401 without one). The HF fallback model
  already proves the pipeline, so this is an optional upgrade, not a blocker.
- **First run downloads ~2 GB** (the model) into the gitignored HF cache; after
  that it is offline.
- `--subject=text` mode still needs a text provider; the local server only does
  images. For local text, the offline `--subject=rules` mode (default) needs
  nothing. A local LLM could be added as the text provider the same way.
