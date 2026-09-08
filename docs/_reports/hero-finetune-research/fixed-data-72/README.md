# Fixed-data 12B fine-tuning

[Scope](SCOPE.md), [script-produced comparison](REPORT.md), [findings and rejection decision](FINDINGS.md), [result](RESULT.json), [verification receipt](VERIFICATION.json).

The user's latest scope is **no dataset expansion, relabeling, recipe repair or engine fixes**. Existing problematic complete-recipe candidates are excluded; mechanism issues remain on the established coordination packet/PR route. The unfinished IR6 files are preserved as paused work, not used in this experiment.

This run uses the existing 12 training heroes / 72 source-verdict claims and four development heroes / 24 claims. From the same base, only the optimization step count changes from 24 to 72. Worker, tokenizer inputs, split, prompts and scorer are unchanged. The step-24 adapter and first 24 losses exactly reproduce the old run.

**Do not adopt the 72-step adapter.** Training verdicts improve 66/72 to 72/72; development verdicts stay 24/24 and strict development contracts stay 3/4. Cross-task hero outputs regress from 2/4 compilable to 0/4. Classification accuracy is not complete hero creation.

Training took 83.52 seconds, the full workflow 390.58 seconds, and peak Metal memory was 18.23 GiB. All 190 resource samples were on AC at 100% battery, with no new swap. The own GPU worker and lock are released. All three checkpoints, failed sandbox attempt, raw outputs, scripts, tests and receipts are retained in the bundle; base weights remain referenced rather than republished.

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify docs/_reports/hero-finetune-research/fixed-data-72/bundle
python3 tools/editor-acceptance/hero-finetune-archive.py extract docs/_reports/hero-finetune-research/fixed-data-72/bundle --destination /absolute/new/research-workspace
```

Dependencies are in the original research bundle. In its restored Mac layout, use `python run-frozen-facts-finetune.py NEW_OUTPUT`; it refuses overwrite, fixes the final step, and enforces AC/resource and time limits. Verification uses `node verify-frozen-facts.mjs NEW_OUTPUT-pilot NEW_VERIFICATION.json`.

This supplement is locally committed; no new public push or model activation is included.
