# Mac hero-forge fine-tuning research pipeline

**Power stop, 2026-09-07 01:55 Taipei:** GPU inference is also cancelled after the user reported inability to recharge. No automatic training, inference, supplementary run, or precision conversion without renewed approval. The inference process exited; 954 complete three-arm paired requests are preserved and 1741 main requests remain unpaired. CPU-only consolidation is complete in workspace `outputs/forge-final-three-hours-20260906/FINAL_REPORT.md`. This is a report of incomplete research evidence, not a qualified model or permission to resume. Earlier running statements are historical.

**Latest decision, 2026-09-07 01:20 Taipei:** the user stopped further training. R8 was never started and has a `TRAINING_DISABLED.json` guard; earlier R8 launch instructions are historical, not authorization. Current work is dataset inventory, existing base/R3/R7 inference, error analysis, and reporting. See workspace `outputs/forge-final-three-hours-20260906/INFERENCE_ONLY_DECISION.md` and `inference-review-data-v1/INVENTORY.md`. R7 core completed, but its post/entry/report chain hit the original deadline; missing diagnostics stay missing. R3 native research files were copied and hash-verified, not quality-qualified. Older running/preparation statements below are retained history.

**23:23 live index:** R6 is complete and rejected all new weights; its recovered evidence is `outputs/forge-joint-source-stack-r6-v2-20260906/final-evidence-v2/REPORT.md` (original report failure preserved). R7-v2 is now actually running, with chained post/entry/report workers: `outputs/forge-low-lr-r7-v2-20260906/STATUS.md`. The first R7 directory was preparation-only and never trained. Same data and LR-only treatment, no qualified model. Earlier preparation status below is historical.

**Current scope:** source-bound hero settings and Owner mechanics, then complete existing-template classification/recommendation; VFX recommendation is lowest priority. No parameter generation or visual validation. R6-v2 completed its 466-example pass in 75.6 minutes, but all new candidates failed preservation; selection kept unchanged R3. Post/entry checks are still running. **R7 is prepared, not started:** same data/order/initial weights with learning rate reduced from 1e-5 to 2.5e-6. See workspace `outputs/forge-low-lr-r7-20260906/STATUS.md`. No complete-forge model is qualified.

Start with [the current zero-penalty research entry](RESEARCH_INFERENCE_V2.md). Authoritative run artifacts are in the workspace `outputs/forge-joint-source-stack-r6-v2-20260906/`: `STATUS.md` for live handles, `DATA_ADMISSION.md` / `.json` for the reviewed 466 training examples and 170 exclusions, and `DELIVERY_STATUS.md` for remaining requirements. R6 runs core → three-arm post diagnostics → ten public-entry calls → evidence replay; the existing stages are already running/queued. Do not invoke another runner against that frozen directory.

R5 was not adopted; R3 is a source-research control, not a qualified complete-forge model. After actual completion, inspect `final-evidence-v1/REPORT.md` and the per-task false-accept counts before using any adapter. A missing report means pending, not passing. The new entry requires an explicit zero-presence-penalty model reference; historical 1.5 results are not paired with it. No automatic export, Editor activation or publishing follows from successful execution.

[CLASSIFICATION.md](CLASSIFICATION.md) retains the older classification workflow. The remaining sections below preserve the historical eight-hour, parameter-generating single-template experiment and must not be read as the current dataset, recipe, or approved deployment instructions.

Qwen3.5-4B non-thinking / MLX / local Apple Silicon only. This tool does not activate models in Editor or change release manifests. It implements the bounded eight-hour experiment, not the entire product roadmap.

## What is measured

The first executable slice maps a single-skill request into a bounded research IR (`outcome`, `templateId`, `params`, `vfxLayers`, `missing`, `fallbackId`). The adapter applies it to the existing heroForge Q slot and uses the existing schema, generator, compiler and SimWorld. This IR is **not** a replacement production `HeroProposalPayload`.

The generated dataset has 144 train, 24 dev and 48 synthetic holdout cases. The split is fixed by compositional family before expansion, and retrieval sees train only. These cases share one authored language grammar and one engine template. They are `synthetic-research`, not Owner-confirmed Gold/Silver. Therefore the overall effectiveness verdict remains `evidence-insufficient`, even when the synthetic comparison improves. The previous 24-case thinking benchmark is not imported into training, selection or this holdout; a separate optional known-corpus retention check may use it after selection.

Natural-language correctness cannot be proven merely by round-tripping the target generator. The scorer separately checks the requirement spec, with a hand-authored anchor and deliberately incorrect outputs; source-family independence and human confirmation still remain absent. Engine validation is additional evidence, not a substitute for those missing labels.

Owner text and its hash are preserved byte-for-byte separately from `mechanicsText`. Before either training or inference (including retrieval examples), a deterministic depth parser removes entire `「…」` spans, including inline, multiline and nested dialogue. Unmatched delimiters fail closed. The same preprocessing applies to both A and B; it is not counted as a fine-tuning improvement.

## Run

### Single workflow entry

`node tools/forge-training/workflow.mjs plan|run CONFIG.json` connects the core experiment, integrity audit, diagnostic metrics, behavior matrix, optional deployment/quantized dev, optional known-corpus regression, and final report. Configuration uses schema `ggd-forge-workflow@1` and absolute `root`, `python`, `modelReceipt`, `runtimeRoot`, `behaviorOutput`; `deployDestination` and `knownCorpusRoot` are paths or null. `allowNewGpuDiagnostics` explicitly controls missing supplementary GPU work. Unknown fields are rejected; there is no publish or Editor activation mode.

`mode: run` invokes the current core pipeline for an explicitly prepared new run. `mode: finalize-existing` never invokes training and requires an already completed research experiment. It can validate historical evidence without pretending its original core source equals the current version. For read-only-GPU finalization set `allowNewGpuDiagnostics: false`; missing required GPU receipts then fail rather than silently launch a worker.

Workflow attempt logs and receipts distinguish `executed` from `verified-existing`. Existing deployments are byte-hash verified; evaluation results must match request digests, seeds, model path and adapter identity. Core resume still enforces its own source/artifact rules. The workflow preserves the original absolute deadline and GPU report reserve, uses a separate exclusive workflow lock, and does not automatically delete a stale workflow lock: inspect its owner and attempt before recovery.

The 20260906 `finalize-existing` path is integration-tested against actual receipts. The fresh `run` branch connects the already tested stages but has not been exercised as a second full training experiment; doing so requires a new authorized run. No claim of a newly trained/qualified model follows from workflow completion.

For real source/target pairs, use the separate [source intake and approval contract](INTAKE.md). Unreviewed imports remain quarantined and never modify the frozen research dataset. The intake path does not start training or invent human Gold.

`inventory.mjs WORKSPACE NEW_OUTPUT` inventories the existing Owner source module's merged view against this checkout's ability JSON by exact id. It preserves full parsed prose and raw source hashes, separates exact/cosmetic/other text differences, and exports Pending candidates only. Same-id JSON or `provenance: owner-spec` is not treated as independent approval. Production ability JSON must not be silently reduced to the research IR.

Install an isolated arm64 Python 3.11 environment using `requirements.lock.txt`. Large base weights and adapters should be outside Dropbox. The pinned public model can be downloaded using `download.py`; it writes a revision/file-hash receipt and does not upload data. Download is the only network-dependent model step. Workers force Hugging Face/Transformers offline and disallow remote code.

Provide an absolute `--root` containing `experiment-policy.json` (see the current experiment artifact for the exact schema). Start/deadline include setup and development, not just the training subprocess. Eight hours is a maximum; reserve the last hour for reports. Unknown policy fields, cloud flags, publication, wrong platform and enlarged budgets are rejected.

```sh
node tools/forge-training/test.mjs
node tools/forge-training/cli.mjs plan --root /absolute/run
node tools/forge-training/cli.mjs run --root /absolute/run --python /absolute/venv/bin/python --model-receipt /absolute/model-download.json --runtime-root /absolute/local-runtime
node tools/forge-training/cli.mjs status --root /absolute/run
node tools/forge-training/cli.mjs cancel --root /absolute/run
node tools/forge-training/cli.mjs resume --root /absolute/run --python /absolute/venv/bin/python --model-receipt /absolute/model-download.json --runtime-root /absolute/local-runtime
node tools/forge-training/cli.mjs report --root /absolute/run
```

Metal GPU access may require execution outside the desktop filesystem sandbox. This is local GPU access, not cloud authorization. The tool uses the checkout's existing `tsx` and shared package's Zod dependency; it does not install a second schema version.

## Stage behavior

- Preflight pins source, engine files, model hashes, corpus and scorer, then validates all targets through the real compiler/scenario.
- Doctor loads the official base with MLX-LM, checks non-thinking prompt tokens, completion-only masks, EOS and input length. No silent truncation.
- A dev baseline uses two fixed train examples, also supplied identically to B.
- A separate 8-example sanity adapter checks finite gradients, changed parameters and reduced probe loss, then reloads for inference. It is not reused for the formal adapter.
- The research recipe starts from the clean base: LoRA rank 16, scale 16, last 8 layers, learning rate 5e-6, micro-batch 1, accumulation 4, 3 epochs. Two earlier train-only sanity probes showed overshoot at 1e-4/5e-5 with single-example updates; the revised sanity uses 1e-6 and accumulation 8. Epoch checkpoints are selected using dev only, first by critical errors, then eligible compliance, then total compliance. No holdout answers informed this adjustment.
- A/B synthetic test requests are frozen once. Both use the same BF16 base, tokenizer/template, runtime, retrieval, sampling and raw decoding without grammar. This is not directly comparable to the earlier GGUF + grammar benchmark.
- Semantic passes also require existing compiler/SimWorld checks. The report keeps original output, errors, denominators, fixed/regressed pairs, latency, qualification gaps and model receipts.

## Limits and recovery

After a completed run, `audit.mjs RUN_ROOT` verifies receipts, paired requests, scorer replay, original text preservation and adapter hashes. Optional `deploy.py` fuses the selected adapter and tests BF16/affine-4-bit serialization using two dev next-token probes. This is not task-quality qualification. `evaluate-extra.mjs` runs supplementary worker evaluations with the same local GPU lease, cancellation and deadline; use it for quantized dev or known-corpus A/B. `regression.mjs prepare|score OLD_BENCHMARK_ROOT RUN_ROOT` retains the frozen old scorer and reports that corpus separately. These checks never reselect or retrain the candidate.

`finish-report.mjs RUN_ROOT` requires a completed integrity audit, combines the available supplementary receipts and copies the small selected adapter into `RUN_ROOT/research-adapter` with hash checks. It does not copy multi-gigabyte weights into Dropbox or publish the model. Reports always label missing checks as untested and retain `evidence-insufficient` without independent human Gold.

Optional preservation: `node tools/forge-training/archive-model.mjs ABSOLUTE_ROUNDTRIP_RECEIPT ABSOLUTE_MODEL_DIR ABSOLUTE_NEW_DESTINATION` verifies all recorded model bytes before copying, rejects unrecorded files or an existing destination, and verifies the resulting copy. This is storage only, not a new inference test or qualification. The 20260906 handoff explicitly preserves the 2.22 GiB research quantization in its output directory; unlike the usual temporary model location, that directory is under the workspace's Dropbox path and follows the user's existing sync settings. `node --test tools/forge-training/archive-model.test.mjs` covers the successful copy and corrupted-source/overwrite rejection.

`diagnostics.mjs RUN_ROOT` adds family metrics, first-output cost, explicit uncertainty and a post-hoc literal-grammar rule comparator. The comparator reads only public requests, not case targets, and abstains on unknown wording. It is not a preregistered C arm or a natural-language generalization score. All raw A/B outputs and rules are additionally checked through the existing engine, separately from semantic correctness. Run `finish-report.mjs` afterward to link this supplement and consolidate the deployment report; the original pre-deployment snapshot is retained.

`node --import ./node_modules/tsx/dist/loader.mjs tools/forge-training/behavior.ts RUN_ROOT NEW_OUTPUT` additionally compiles the 24 eligible frozen reference proposals and semantically passing A/B proposals through heroForge, then runs paired same-seed cast/no-cast worlds. It checks one hit on the inside enemy, no hits or extra HP loss for caster/ally/outside enemy, and a deliberately collapsed-radius negative fixture. This does not validate onHit/onMiss, status expiry, or rendered VFX. Original A/B scores are not rewritten. Output must not exist.

Atomic JSON stage receipts implement stage resume; SQLite is not implemented. Source/policy/artifact changes invalidate reuse instead of silently accepting old results. Interrupted training retries in a new directory from the clean base. Adapters alone are **not exact resume** of optimizer/scheduler/RNG/data position.

Dataset exports are validated before cached-stage reuse and pinned for the existing in-flight guard. `cache-check.mjs RESEARCH_RUN NEW_OUTPUT` exercises the real CLI in isolated directories with `/usr/bin/false` as the worker: valid cache reaches that CPU-only sentinel; changed train data, test requests, cases, policy, cached artifact or source identity must fail before it. This uses synthetic cache receipts, not evidence that their preflight really compiled content. The original research run is untouched.

The cache guard was added after the 20260906 model experiment. Its original five-file source snapshot remains in the preflight receipts; the current CLI pins six core files. Do not resume that historical run with changed code: source drift must reject reuse. Keep it as immutable evidence and create a new explicitly authorized run for the new implementation. `audit.mjs` can still verify historical receipts without retraining.

One process-group lease per configured runtime-root prevents this tool's concurrent GPU jobs. Other applications' models are not unloaded or killed. Cancel/timeout terminates only the spawned group, with bounded SIGTERM/SIGKILL cleanup. Memory allocation is capped at 80 GiB; no claim of 16GB compatibility follows. Use the same runtime-root across runs to share the lease.

No model is published. Research packages reference the actual base and adapter hashes. `/private/tmp` is temporary: back up research adapters to a user-selected permanent local folder before relying on them. Full fusion/quantization, 16GB hardware, independent Owner Gold, visual review, full hero creativity, status expiry/target-negative scenario coverage, production proposal integration and Editor concurrency are separate unverified work unless the run produces explicit evidence for them.
