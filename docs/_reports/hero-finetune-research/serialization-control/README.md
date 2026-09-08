# Serialization-boundary follow-up (local research)

Payloads are in private S3. First follow the [hydrate instructions](../S3_STORAGE.md); archive commands below use the separate restored delivery directory.

The active quality goal continues after the earlier delivery. This supplement is a separate fixed experiment; it does not overwrite the original bundle or change its scores.

## Result

JSON validity: base 5/6, original masked LoRA 1/6, whitespace-boundary LoRA 6/6. Valid IR, compilation and complete engineering checks remain 0/6 in all arms. No adapter is qualified or enabled. See `REPORT.md`, `RESULT.json`, and `AUDIT.md`.

The full workflow took 506.97 seconds, including 198.03 seconds of training with 34.45 GiB peak Metal memory. The same eight training records, sixteen steps, final checkpoint, worker, prompts, seed and scorer were retained. Only whitespace around excluded target values and the resulting token/mask alignment changed. This is not a pure loss-weight ablation or an independent source-family evaluation.

The CPU audit found 331 punctuation positions outside excluded values that were nevertheless masked by merged tokens. The selected whitespace control reduced that count to zero, preserved all JSON values and excluded-value bytes, and stayed below 8192 sequence tokens (maximum 7943). The 21 new CPU tests and independent 14-record lexical verification passed. The extended archive utility has seven passing tests and leaves the original archive verifiable.

## Data issue and next action

The original training split contains zero Q-slot `line_sequence` cases, while all four synthetic dev cases use that binding. This is a slot-role extrapolation challenge, not mislabeled content. Remaining errors include `not_specified` vs `none`, targeted vs ground, and fixed-point pulses vs a line. Add a source-reviewed coverage matrix and distinguish held-out combinations from unobserved components before broadening training. Do not put these exposed dev cases into training and still call the same evaluation blind.

356/375 known-source field matches is not 95% whole-hero accuracy. Identity prose is not fully graded, the six-hero engineering gate remains 0/6, and there is still only one synthetic family plus two exposed real controls. No automatic promotion or additional training is scheduled by this supplement.

## Verify and restore

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify /absolute/new/hydrated-delivery/serialization-control/bundle
python3 tools/editor-acceptance/hero-finetune-archive.py extract /absolute/new/hydrated-delivery/serialization-control/bundle --destination /absolute/new/serialization-supplement
```

This is an incremental archive of explicitly named paths. The original research bundle contains the unchanged baseline, worker, evaluator and engine/model receipts that these scripts depend on. Extract each bundle to a separate new directory. To combine them in a restored research workspace, copy only previously absent files from the supplement; do not overwrite the frozen baseline. The original local workspace already has the complete layout. This remains Mac/MLX-specific, not a portable dependency installer.

Code review mirrors use `.txt`; original filenames and bytes are restored from the archives. Four unique checkpoint adapters are included by hash. The final adapter hash and base revision are in `RESULT.json` and the archived model card. The base model was verified unchanged across eleven files.

The previous PR's unit CI is not green: see `PR1114_CI_REVIEW.md` for the reproduced existing exemption-expiry failure and the feedback sent to Main. No exemption date, mechanism or test assertion was changed.
