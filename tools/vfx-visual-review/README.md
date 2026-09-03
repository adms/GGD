# Google Gemini VFX visual review

This advisory tool sends **2–18 time-ordered preview keyframes** to Google Gemini and writes immutable JSON/Markdown evidence. It turns on automatically when `GEMINI_API_KEY` is configured; without a key it skips cleanly. Every verdict is `advisory-only`: it cannot replace SimWorld/event-trace assertions or the human visual acceptance gate.

## Provider and privacy policy

- The only permitted remote host is `https://generativelanguage.googleapis.com`; there is no configurable endpoint flag.
- A configured `GEMINI_API_KEY` enables the reviewer. `--no-gemini` or `GGD_VFX_GEMINI_ENABLED=0` always disables transmission; `--enable-gemini` remains available for an explicit run.
- The API key is read only from `GEMINI_API_KEY`. It is never written to receipts, Markdown, cache keys, prompts, or logs.
- Owner dialogue inside `「...」` is removed before the prompt is built. Runtime phase labels and candidate image paths are not sent; only anonymized frame numbers, timestamps, expectations, and inline image bytes are sent.
- Batch mode excludes diagnostic-only images, sorts frames by `atMs`, removes duplicate timestamps, and samples the semantic event points selected from the Sim/VFX timeline. Ordinary skills use at most 8 frames; strict cinematic/combination skills use at most 18. Fewer than two usable times are not uploaded.
- Inline payloads are limited locally to 15 MiB, below Gemini's documented 20 MB inline-request ceiling.

The default model is pinned to `gemini-3.1-pro-preview`, the only tested model that separated the labelled positive and negative cases. The Owner-supplied `gemini-flash-latest` alias returned HTTP 503, the API reported that `gemini-2.5-flash-lite` is retired for new users, and `gemini-3.5-flash-lite` falsely accepted the negative case. Override with `--model gemini-...`; the receipt records the concrete `modelVersion` returned by Google.

Official references: [image understanding and inline data](https://ai.google.dev/gemini-api/docs/image-understanding), [structured JSON output](https://ai.google.dev/gemini-api/docs/structured-output), and [GenerateContent response metadata](https://ai.google.dev/api/generate-content).

## Calibration result (2026-09-04)

Gemini 3.1 Pro is useful as an issue-finding second opinion, but it is **not calibrated to grant a positive pass**. Flash Lite falsely accepted the negative `godie-e00l.ex` case with 0.90 confidence. With a phase-blind prompt and low thinking, Pro correctly accepted the positive Dragon Slave sequence and flagged that the Avalon EX frames omitted the full seven strikes and finishing beam. Two labelled cases are not enough to estimate false-positive risk, so the adapter still forces every Gemini positive result back to `needs-human-review`; explicit AI rejections and observations remain advisory evidence.

This means Gemini does not replace Codex or Owner visual judgement. A future labelled calibration set must demonstrate acceptable false-positive performance before the positive-pass guard may be reconsidered.

## Repeatable quality and speed benchmark

The benchmark replays the same human-labelled positive and negative scenes, without putting the labels into the model prompt. It records provider availability, labelled accuracy, false accepts, false rejects, p50/p95 latency and token usage. It stops after the first provider failure so a 429/503 does not cause a retry storm.

```bash
# Default: Gemini 3.1 Pro low, 2 labelled cases × 3 repetitions.
pnpm vfx:review:benchmark

# Longer comparison after the small run is stable.
pnpm vfx:review:benchmark -- --repeats 5

# Compare model variants on identical pixels and rubric.
pnpm vfx:review:benchmark -- \
  --models gemini-3.1-pro-preview,gemini-3.5-flash-lite \
  --repeats 3

# Prove offline compatibility without transmitting images.
pnpm vfx:review:benchmark -- --no-gemini
```

The initial set intentionally contains only the two Owner-labelled cases already established in this project. Add more cases to `benchmark-set.json` only after a human records the expected judgement and reason; self-labelling from the candidate JSON would make the accuracy number meaningless.

## Safe key setup

The package scripts automatically load the Git-ignored repository-local file
`.env.gemini.local` when it exists. Start from `.env.example`, keep the filled
file local, and never commit it. An exported `GEMINI_API_KEY` also works and
takes precedence over the env file because Node does not overwrite existing
environment variables by default.

For a one-session setup in zsh/bash:

```bash
read -rs GEMINI_API_KEY
export GEMINI_API_KEY
```

Paste the key at the silent prompt and press Enter. A key pasted into chat or committed anywhere should be rotated before use.

## Run

Validate files and inspect the sanitized prompt without a network request:

```bash
pnpm vfx:review -- \
  --input /path/to/review-request.json \
  --out-dir /private/tmp/ggd-vfx-review \
  --dry-run
```

Run one Gemini review after the key is configured:

```bash
pnpm vfx:review -- \
  --input /path/to/review-request.json \
  --out-dir /private/tmp/ggd-vfx-review \
  --optional
```

Run the bounded 42-theme / 46-document batch:

```bash
# One reusable command: with a key it reviews; without a key it skips cleanly.
pnpm vfx:review:temporal

# Recommended calibration: run only 1–2 cases first.
pnpm vfx:review:temporal -- --max-cases 2

# Optional cost override; the normal adaptive range is 2..18.
pnpm vfx:review:temporal -- --max-frames 8

# Integrated deterministic gates + temporal review.
pnpm editor:accept:temporal

# Import a browser proof, rerun deterministic gates, then temporal review.
pnpm editor:accept:temporal -- --proof /path/to/browser-proof.json

# Force an offline run even if the key exists.
pnpm editor:accept:temporal -- --no-gemini

# Separate opt-in: retry only uncertain results once at medium.
pnpm vfx:review:temporal -- --escalate-uncertain
```

Missing `GEMINI_API_KEY` disables the batch, sends no image, and exits 0. Explicitly enabled runs without a key write `GEMINI_API_KEY_MISSING` and also exit 0. The reusable commands include optional fallback: timeouts, 429/503 and network failures become `needs-human-review` evidence and exit 0; they never become a pass.

## Input and decision limits

- PNG, JPEG, or WebP regular files only; symlinks are rejected.
- Between 2 and 18 chronological frames are sent per request. Ordinary cases use up to 8 and strict animation cases up to 18; every request checks temporal order. `--max-frames 2..18` overrides the per-case cap.
- Structured output is requested with `responseMimeType: application/json` and a JSON schema, then validated again locally.
- Gemini 3 `thinkingLevel` is explicitly `low` on the first pass and output is bounded. Temperature is omitted per Google's Gemini 3 guidance. No second pass occurs unless `--escalate-uncertain` is explicitly present.
- Low confidence, missing evidence, invalid frame indices, contradictory checks, malformed output, safety blocks, and API errors cannot become `ai-prechecked`.
- Art direction, original-scene fidelity, timing feel, and final approval remain human decisions.

The request must state expected visual truth independently; do not derive the expectation from the candidate JSON being tested. Reports preserve frame digests, model/version, duration, token usage, policy, per-check evidence, and contract warnings without preserving the API key.
