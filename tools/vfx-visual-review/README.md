# Local VFX visual review

This tool sends a bounded set of preview frames to a local LM Studio vision model and writes immutable JSON/Markdown evidence. Its verdict is always `advisory-only`: it cannot replace SimWorld/event-trace assertions or the human visual acceptance gate.

## Model decision (2026-09-03)

Default: **Qwen3.8-27B MLX 6-bit** on the M5 Max 128 GB.

- It handles both images and multi-frame/video-style input, fits comfortably in unified memory, and is available through LM Studio's MLX path.
- Six-bit is the default quality/speed compromise. Use 4-bit for higher throughput; use 8-bit only when a measured local review set shows a real accuracy gain.
- Qwen3.6-35B-A3B remains a useful high-throughput sweep model, but the dense Qwen3.8-27B is the safer single default for subtle spatial and temporal VFX checks.
- Qwen-Image-Bench/Q-Judger is a promising optional second opinion for still-frame quality/alignment. It is not the default because its official task is text-to-image judging, not gameplay VFX sequences, and its MLX conversion is community-maintained.
- Q-ReAlign-Pro-9B can later add a no-reference artifact/aesthetic score, but it does not replace semantic intent checking.

Model sources: [Qwen3.8-27B](https://huggingface.co/Qwen/Qwen3.8-27B), [LM Studio build](https://lmstudio.ai/models/qwen/qwen3.8-27b), [Qwen-Image-Bench](https://huggingface.co/Qwen/Qwen-Image-Bench), [Q-ReAlign](https://github.com/Q-Future/Q-ReAlign).

## Local setup

1. In LM Studio, download `qwen/qwen3.8-27b`, select the MLX 6-bit variant, and start the local server.
2. Optionally warm-load it with a 16K context. With the `lms` CLI installed: `lms load qwen/qwen3.8-27b --context-length 16384 --gpu max -y`.
3. Confirm the OpenAI-compatible endpoint is `http://127.0.0.1:1234/v1`.
4. Copy `examples/review-request.example.json` outside the example folder or replace its frame paths with real PNG/JPEG/WebP preview captures.

The request must state its expected truth independently. Do not derive `expectation` from the candidate JSON being tested. Owner dialogue inside `「...」` is retained in the input evidence but removed before the mechanics prompt is built.

## Run

Validate files, inspect the prompt, and make no network request:

```bash
pnpm --filter @ggd/vfx-visual-review review -- \
  --input /path/to/review-request.json \
  --out-dir /private/tmp/ggd-vfx-review \
  --dry-run
```

Run the local model:

```bash
pnpm --filter @ggd/vfx-visual-review review -- \
  --input /path/to/review-request.json \
  --out-dir /private/tmp/ggd-vfx-review \
  --model qwen/qwen3.8-27b
```

Environment overrides: `GGD_VFX_REVIEW_MODEL`, `GGD_VFX_REVIEW_BASE_URL`, `GGD_VFX_REVIEW_REASONING_EFFORT`, and optionally `LM_STUDIO_API_TOKEN`.

Reasoning defaults to `low` because Qwen3.8 otherwise defaults to `xhigh`, which can spend the response budget on hidden reasoning before emitting the JSON verdict. Use `medium` for difficult escalations after measuring it on the local calibration set.

LM Studio may return Qwen3.8's schema-constrained JSON in `reasoning_content` while leaving `content` empty. The tool accepts either channel, validates the same runtime contract, and records which channel was used.

Exit codes are `0` for AI precheck, `1` for AI rejection, `2` for tool/API error, and `3` when human review is required. Even exit code `0` remains non-authoritative.

## Input and safety limits

- 1–16 candidate frames and optionally 1–16 references.
- Frame arrays must be ordered by non-decreasing `atMs` so temporal evidence is unambiguous.
- PNG, JPEG, or WebP only; 10 MiB per frame and 64 MiB total.
- Symlinks are rejected. Images are sent only to a loopback endpoint (`localhost`, `127.0.0.1`, or `::1`); non-local hosts are rejected.
- Temperature is zero and seed is fixed to make reruns as stable as the local backend permits.
- Low confidence, malformed evidence indices, missing required evidence, or uncertain required checks cannot become `ai-prechecked`.
- `minConfidence` can only tighten the default `0.85` threshold; request policy cannot remove the baseline or expectation-derived checks.
- A model that emits confidence as `0..100` is normalized to `0..1`, recorded as a contract warning, and forced to human review.
- Internally contradictory results (for example `familyMatch=pass` with `effectPresence=fail`) are also forced to human review.

Before using the result for batch triage, calibrate it against a human-labelled local set containing clear passes, clear failures, subtle placement errors, clipping, low-contrast effects, and missing temporal phases. Model self-confidence is evidence, not a calibrated probability.

## Verified on M5 Max 128 GB

On 2026-09-04, the selected MLX 6-bit model was 22.81 GB on disk and loaded in 24.8 seconds using 21.24 GiB. With `reasoning-effort=low`, a 1370×1304 synthetic positive canary completed in 17.0 seconds (766 total reported tokens), and an obvious mismatch completed in 21.56 seconds (769 tokens). Qwen returned coherent pass/reject evidence with no contract warnings in both cases. These two smoke cases prove the local path works; they are not a domain-accuracy calibration set.
- Reports include the request/frame digest, exact reported model ID, raw model content, local duration/token usage, policy, per-check evidence frames, and contract warnings.
