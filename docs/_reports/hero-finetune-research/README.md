# Hero fine-tuning research delivery

Research artifacts only. No editor activation, model service, cloud training, game-mechanic changes or production qualification is included.

## Latest delivery status

Current scope: **freeze existing data, exclude problematic samples, and focus on model fine-tuning; no dataset expansion or recipe/engine repair**. The [fixed-data 72-step experiment](fixed-data-72/README.md) is complete. Training verdicts improve, development performance stays flat, and cross-task compilation regresses from 2/4 to 0/4. The new adapter is retained but rejected, not activated.

Historical local data progress: [Lee Sin's six-slot candidate](leesin-source/README.md) passed 28/28 source-oriented scenarios, rejected 12/12 wrong recipes, and round-tripped through the official offline ZIP format. Further data/contract work is now paused under the latest scope. This candidate is not a model output or formal SFT admission.

[Current delivery and unresolved conditions](CURRENT_STATUS.md) distinguishes completed scripts/artifacts from the unqualified hero model. The latest [bounded content-composition comparison](field-composition/REPORT.md) rejects a proposed delayed/damageArea replacement: 18/36 versus 24/36 original checks, including 12 new out-of-field wrongful-hit cases. No GPU run or engine edit was made.

Additional local evidence: [selected-point fields](selected-point-fields/README.md) failed all six off-center cases across Lux E, Miss Fortune E and Xerath R, with 12/12 empty/centered controls passing. These three newly documented recipe mismatches are additive to the older eight-issue ledger; that frozen ledger has not been silently rewritten. They prevent promoting the reviewed candidates to complete executable targets.

The scripts automate the **bounded engineering experiment**, not the admission of arbitrary hero data. Training, paired inference, fixed scoring, resource stop conditions and reporting have been executed. Complete-source semantic review and an independent final evaluation are still missing; this delivery must not be described as a working fully automatic hero model.

- [Current 44-hero admission ledger](admission-ledger/README.md): 264 slots, nine detailed whole-intent records, eight explicit issues; zero certified full-hero training targets and zero fresh independent holdout heroes. These counts are an audit of existing evidence, not an exhaustive semantic certification.
- [Source-quality findings](admission-ledger/REPORT.md): three source-unstated additions confirmed in real-engine observations, kept separate from explicit source prohibitions. No automatic relabeling or training was performed.
- [Ground-barrage admission evidence](source-admission/README.md): the candidate remains quarantined after an empty-ground anchor failure; the corresponding Main question is `docs/editor-contract/coordination/question.ground-barrage-anchor.json` in this PR.
- [Serialization control](serialization-control/README.md): JSON 6/6, but valid IR, compilation and complete engineering checks remain 0/6. The research adapter is retained, not activated.

The original archive and seven supplements are additive. Their manifests preserve the exact files and omissions; base-model weights are references, not bundled weights. The source-admission command returns exit 2 for the current unqualified formal dataset and does not start a GPU. It is not a semantic judge that can certify new data without review.

Further model work must follow the fixed-data scope, not restart data expansion or engine repairs. Independent qualification remains unproven; a source-verdict adapter must not be presented as an executable whole-hero model. Historical statements that a supplement was local-only describe its recording time; Git/PR state determines publication, not those frozen receipts.

Latest local follow-up: [serialization-boundary control](serialization-control/README.md) restored JSON validity to 6/6, but IR/compilation/whole-hero engineering checks remain 0/6. The original results below remain unchanged. The supplement includes new scripts, raw evidence and the research adapter; this is not a production-qualified model.

The bounded IR5 run finished in 838.09 seconds. JSON validity regressed from 5/6 to 1/6; valid IR, compilation and complete engineering checks remained 0/6. The 16-step adapter is **not recommended for adoption**. Training itself took 207.44 seconds with 34.27 GiB peak Metal memory. The 0.137833 → 0.015402 training loss reduction did not translate to usable output quality.

## Start here

- `IR5_REPORT.md`: the latest script-produced base/LoRA paired experiment report.
- `IR5_RESULT.json`: exact counts, paired cases, training receipt and limitations.
- `HISTORICAL_REPORT.md`: earlier 4B research conclusion, retained separately from the new cohort.
- `FINDINGS.md`: observed failure boundaries and a bounded next-experiment proposal; no post-hoc score changes.
- `checks/SUMMARY.json` and `checks/README.md`: actual local delivery gates, including earlier failures and their verified resolutions.
- `bundle/manifest.json`: original workspace paths, per-file SHA-256, archives, selected adapter blobs and explicit omissions.
- `bundle/sources/12b/`: readable research scripts, including `run-ir5-workflow.py` and `ir5-lora-pilot.py`.
- `bundle/sources/4b/`: historical training/evaluation scripts. These are archived sources, not a new editor integration.

Readable code mirrors have an additional `.txt` suffix so repository-wide test discovery cannot accidentally execute historical tests in a different layout. Their bytes are unchanged; extraction restores the original executable filenames from the ZIP entries.

## Verify and restore

Adapter weights and ZIP payloads now live in private S3, not the current Git tree. Git retains scripts, readable reports, original bundle manifests, [S3 index](S3_INDEX.json), and the [storage/restore guide](S3_STORAGE.md). The actual 12.75 GB 12B base has a separate [base-model backup and restore guide](BASE_MODEL_RESTORE.md); the approximately 290 MB research archive is not a complete base model. This does not rewrite existing Git history.

From the repository root, check the index offline (this does **not** download or verify remote payloads):

```sh
python3 tools/editor-acceptance/hero-finetune-s3.py verify-index docs/_reports/hero-finetune-research --receipt
```

Download to a new separate directory using the preconfigured AWS profile, verify every payload and all eight bundles, then extract the original workspace layout:

```sh
python3 tools/editor-acceptance/hero-finetune-s3.py hydrate docs/_reports/hero-finetune-research --destination /absolute/new/hydrated-delivery
python3 tools/editor-acceptance/hero-finetune-archive.py extract /absolute/new/hydrated-delivery/bundle --destination /absolute/new/research-workspace
```

Both targets must not exist. Only the AWS CLI and Python standard library are required; no GPU is started. Supplements are verified/extracted with the same original archive tool under their hydrated subdirectories. Base/fused weights, duplicate engine copies, caches and environments are deliberately absent. A SHA-256 record is not a bundled base weight.

Selected adapters are stored by content hash in S3. Hydration recreates `bundle/models/` and the supplement model directories; extraction recreates their recorded workspace paths. Base model receipts and revision/configuration records remain in the evidence archives. Do not load a 4B adapter on the 12B model, or confuse 8-bit Gemma inference with Qwen BF16 compatibility.

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
