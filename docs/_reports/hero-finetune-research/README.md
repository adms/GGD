# Hero fine-tuning research delivery

Research artifacts only. No editor activation, model service, cloud training, game-mechanic changes or production qualification is included.

The bounded IR5 run finished in 838.09 seconds. JSON validity regressed from 5/6 to 1/6; valid IR, compilation and complete engineering checks remained 0/6. The 16-step adapter is **not recommended for adoption**. Training itself took 207.44 seconds with 34.27 GiB peak Metal memory. The 0.137833 → 0.015402 training loss reduction did not translate to usable output quality.

## Start here

- `IR5_REPORT.md`: the latest script-produced base/LoRA paired experiment report.
- `IR5_RESULT.json`: exact counts, paired cases, training receipt and limitations.
- `HISTORICAL_REPORT.md`: earlier 4B research conclusion, retained separately from the new cohort.
- `FINDINGS.md`: observed failure boundaries and a bounded next-experiment proposal; no post-hoc score changes.
- `bundle/manifest.json`: original workspace paths, per-file SHA-256, archives, selected adapter blobs and explicit omissions.
- `bundle/sources/12b/`: readable research scripts, including `run-ir5-workflow.py` and `ir5-lora-pilot.py`.
- `bundle/sources/4b/`: historical training/evaluation scripts. These are archived sources, not a new editor integration.

Readable code mirrors have an additional `.txt` suffix so repository-wide test discovery cannot accidentally execute historical tests in a different layout. Their bytes are unchanged; extraction restores the original executable filenames from the ZIP entries.

## Verify and restore

From the repository root, no GPU or third-party Python packages are needed for archival verification:

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify docs/_reports/hero-finetune-research/bundle
python3 tools/editor-acceptance/hero-finetune-archive.py extract docs/_reports/hero-finetune-research/bundle --destination /absolute/new/research-workspace
```

The extraction target must not exist. Original file bytes are verified before extraction; base/fused model weights, duplicate engine copies, caches and environments are deliberately absent. The omission ledger distinguishes real model payloads from references: a SHA-256 record is not a committed base weight.

Selected historical adapters and the new research adapter are stored once by content hash in `bundle/models/`; extraction recreates their recorded workspace paths. Base model receipts and revision/configuration records remain in the evidence archives. Do not load a 4B adapter on the 12B model, or confuse 8-bit Gemma inference with Qwen BF16 compatibility.

## Run the bounded experiment

The executed entry lives at `outputs/hero-forge-12b-restart-20260908/run-ir5-workflow.py` in the restored layout. It is Mac/MLX-specific and expects the recorded runtime, exact model files and pinned engine layout. It is not a portable dependency installer.

```sh
python run-ir5-workflow.py NEW_DIRECTORY --allow-engineering-controls
```

This explicitly allows only the documented engineering controls: 8 synthetic training records, 4 same-family synthetic dev records, and 2 historically exposed real controls. It does **not** admit them as an independent hero/mechanism holdout. The workflow fixes 16 training steps and the last checkpoint, uses one supervised GPU worker, retains raw answers, reserves report time, and never retries, relabels or promotes the model automatically. Known dataset problems are written to `data-issues.json`.

To reconstruct the engine layout, use GGD commit `382fd664303a31ed56cb5a9d7832778a059f671c` and validate the archived `current-engine-v1/source-pins.json` and `catalog-pins.json`. These are the engine sources used in the experiment, not a claim that the current main checkout was used for inference. Historical scripts may need their own earlier pinned engine versions. Retained absolute paths describe the original machine; recreate the recorded local layout or make a separately versioned relocation configuration before a fresh run.

## Qualification and data limitations

Engineering test success is not full-source hero accuracy. Identity prose, unsupported mechanisms, source-family generalization, visual quality and 16GB MacBook operation are not qualified. The synthetic controls share wording; their names indicate global cast timing. Correct rejection is not successful hero creation. Failed, stopped and superseded experiments remain in the archives instead of being silently removed.

Tracking: [issue #1113](https://github.com/adms/GGD/issues/1113). Editor JSON-wrapper work remains separately tracked by #1108.

## Model licensing

The Gemma 4 base is identified by `mlx-community/gemma-4-12B-it-8bit` revision `200bb6db075e137a4deb08838865ac4ddb86292e`. Google's Gemma terms page directs Gemma 4 to the [Apache 2.0 license](https://ai.google.dev/gemma/apache_2). A copy is included as `LICENSE-MODELS`; existing Qwen model notices/licenses remain in the historical archives. `NOTICE-MODELS` identifies the research modifications. No endorsement by model authors is implied, and model licensing does not grant rights to fictional character names or third-party content.
