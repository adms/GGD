# Mac classification workflow: current index and historical R2 instructions

**23:23 live index:** R6 finished with unchanged R3 selected and full-scope gates failed; use its final-evidence-v2 report, preserving original collector failure. R7-v2 is running: workspace `outputs/forge-low-lr-r7-v2-20260906/STATUS.md`. The original R7 directory never trained. All earlier prepared/pending notes below are historical.

**23:10 update:** R6 fixed-candidate selection rejected every new adapter and retained unchanged R3; post/entry evidence is still running. R7 lower-LR-only follow-up is prepared, not started. Its index is workspace `outputs/forge-low-lr-r7-20260906/STATUS.md`. No new qualified model; the earlier active status below is historical.

**Active R6-v2 (2026-09-06):** source-bound hero/Owner classification and current single/multiple-template recommendations, with VFX last. Use [RESEARCH_INFERENCE_V2.md](RESEARCH_INFERENCE_V2.md) and workspace `outputs/forge-joint-source-stack-r6-v2-20260906/STATUS.md`. Actual data is 466 train / 158 dev / 186 test, not the older counts below. R6 completed its single training pass and is evaluating fixed candidates; no new model has been qualified. R5 was rejected. The old workflow and 4-bit export commands below are **historical R2**, not commands for the active R6 run; do not launch them against R6 files or use R2 exports as approved models.

**Earlier source-priority iterations:** the historical R2 numbers below are preserved. R3/R4 added source-bound hero and Owner-mechanism classification; their evidence remains under workspace `outputs/forge-mechanism-priority-r3-20260906/` and `outputs/forge-source-calibration-r4-20260906/`. [SOURCE_INFERENCE.md](SOURCE_INFERENCE.md) documents their earlier decoding contract. Model qualification must come from actual run reports, not the existence of a runnable client.

The following describes the historical four-hour R2 Qwen3.5-4B **non-thinking** experiment, not R6 or the earlier single-template IR experiment. VFX output only recommends existing templates; it never generates renderer parameters. No Editor or gameplay activation is performed.

## Quality comes before counts

`curate-data.mjs OLD_RUN NEW_RUN` builds the reviewed curriculum from `reviewed-curriculum.mjs` and current sources. Generation alone does not approve it: the primary reviewer must inspect the resulting questions/answers and write a `semantic-review.json` bound to the complete cases digest and actual review coverage. Never fill that receipt merely because schema checks pass. It is assistant-reviewed research data, not Owner Gold.

The current audited set contains 268 train / 88 dev / 132 test cases. These are the result of a quality decision, not required future quotas. It covers 34 mechanism candidates (17 enabled) and 85 semantically reviewed standard/named VFX. Unreviewed legacy hero labels, arbitrary template stacks and VFX components remain outside its claims. An alternative valid card is scored through the reviewed `acceptedTargets`, not counted as a classification failure.

Do not regenerate or modify a running/frozen corpus. `relaunch-reviewed.mjs ABSOLUTE_SOURCE ABSOLUTE_NEW_RUN` copies only reviewed inputs, verifies identical bytes and preserves the original deadline. It does not copy interrupted adapters or reset the time box.

## One-command execution

Configuration has exactly five absolute paths: `root`, `python`, `model`, `runtime`, `baseReceipt`. The model receipt must have the verified `base.path`, `base.revision` and `base.files` entries used by deployment; the path must match `model`. Use the same runtime directory for all GPU work so the exclusive GPU lock is shared.

```sh
node tools/forge-training/classification-workflow.mjs run CONFIG.json
```

Stages: integrity + doctor → baseline dev → clean-base LoRA (up to two complete epochs within the existing deadline) → dev checkpoint selection → fixed test A/B → paired report → BF16 fusion and fixed affine 4-bit group64 → full quantized dev/test → public-client interactive checks → standalone 12-GiB-capped inference check → byte-verified research model preservation.

For an already **completed** classification core run, `finish CONFIG.json` starts from paired reporting and export. It refuses a running core and does not retrain. Both modes refuse to overwrite previous workflow receipts. Source changes must never be used to resume an old pinned core run.

The workflow command preserves the model even if its quality fails, but labels it research-only. `comparison.json.disposition=keep-base-do-not-promote` means it must not replace the base model. `boundedResearchQualityGate` is limited to this reviewed corpus and client probes; it is not full-hero qualification. All release/activation flags remain false.

R2 actually failed adoption: native BF16+LoRA mechanism test improved 50/68 to61/68 but remains below threshold. Fixed4-bit degraded to44/68, and dev-selected8-bit introduced a new test false acceptance (60/68). Neither quantized export is approved. `precision-diagnostic.mjs RUN PYTHON RUNTIME` is the separate dev-only precision diagnostic; it requires a pre-recorded precision policy and preserves the original experiment. `preserve-native.mjs RUN` saves exact base, adapter and training evidence to `native-reference/`, with streaming hashes and no fusion. Its preservation receipt and a standalone reload prove recoverability, not model qualification. See R2 `EXPERIMENT_REPORT.md` before choosing any artifact.

## Real recommendation entry

Write a JSON request such as `{"task":"vfx","request":"發出一個氣功砲，其他參數我自己調。"}`. Use `task:"mechanism"` for the mechanism card choice. Run from the repository directory:

```sh
node tools/forge-training/classification-client.mjs CATALOG.json INPUT.json NEW_REQUEST.json
PYTHON tools/forge-training/classification-predict.py --model MLX_MODEL_DIRECTORY --request NEW_REQUEST.json --output NEW_RAW.json --runtime-root RUNTIME_DIRECTORY --max-memory-gib 12
node tools/forge-training/classification-client.mjs validate NEW_REQUEST.json NEW_RAW.json NEW_VALIDATED.json
```

Replace uppercase placeholders with actual paths from the completed run, not a nonexistent future artifact. Use `research-model-mlx-4bit/` only after its preservation receipt exists; still inspect the quality result before deciding to use it. Unknown IDs, unapproved templates, extra parameter fields and invalid decision/reason combinations fail validation. Invalid JSON is preserved as raw evidence and never becomes an accepted recommendation. Validation checks contracts, not whether the natural-language classification is correct.

`retrieval-check.mjs RUN` measures train/dev candidate recall separately from model accuracy and does not inspect sealed-test predictions. The current client supplies up to24 VFX candidates; it does not promise arbitrary requests will retrieve an unknown/unreviewed asset.

## Evidence and limitations

The user's updated priority is hero-setting fidelity, then mechanics, with VFX last. Current hero-setting fidelity is **not validated**. The frozen macro experiment remains unchanged; the supplemental `priority-policy.json` was recorded before fine-tuned dev/test results. After both dev evaluations, `node tools/forge-training/priority-review.mjs select ABSOLUTE_RUN` selects by mechanism dev only. Then `report ABSOLUTE_RUN` checks fixed mechanism pairs and produces `PRIORITY_RESULTS.md`. If this chooses a different epoch, it requires a separate `priority-test-B.json` from that exact adapter before reporting; never substitute the original candidate's score. VFX-only gains cannot pass the mechanism research gate, and no result from this corpus qualifies full hero-setting fidelity.

- `QUALITY_REVIEW.md` / `QUESTION_REVIEW.md`: source issues, exclusions, all reviewed questions and accepted labels.
- `comparison.json` / `RESULTS.md` / `paired-review.json`: fixed/regressed examples, task-level scores, separate schema/decision/safety counts. Loss reduction alone is not improvement.
- `mac-deployment.json`: exact adapter/base hashes, fusion/serialization probes, file hashes. Serialization is not semantic quality.
- `mac-quality-summary.json`: fixed-precision test difference and public-client checks.
- `standalone-result.json` / `standalone-checked.json`: actual cold-load inference output, memory and latency; invalid outputs retained.
- `research-model-mlx-4bit/PRESERVATION.json`: copied-byte proof, not approval for production.

Running under a12-GiB Metal allocation limit on M5 Max128GB is **not** a16GB Mac hardware test. The actual16GB device remains `not-tested`. No cloud GPU, publishing, automatic gameplay changes, visual verification or silent parameter editing is included.
