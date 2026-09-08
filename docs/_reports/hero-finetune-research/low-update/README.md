# Fixed-data low-learning-rate control

Completed one new local 12B LoRA experiment, rejected for a development JSON regression. No dataset expansion, relabeling, engine repair or model activation.

- [Findings](files/LOW_UPDATE_FINDINGS.md) distinguish malformed JSON from incorrect literal verdicts.
- [Preregistered plan](files/LOW_UPDATE_PLAN.md): 24 steps, LR 5e-6 versus the original 2e-5; all other optimization/data/evaluation settings fixed.
- [Automatic report](files/frozen-facts-low-update-v1/REPORT.md), [result](files/frozen-facts-low-update-v1/result.json) and [independent checks](files/frozen-facts-low-update-v1/VERIFICATION.json).
- [Paired cases](files/frozen-facts-low-update-v1-assessment/cases.json) and [raw facts](files/frozen-facts-low-update-v1-pilot/facts-raw.json) remain unchanged.

New train verdicts: 71/72 versus 66/72. Development: 18/24 versus 24/24 because one malformed JSON answer receives zero credit for all six claims. Its literal id/verdict strings match the existing labels, but this forensic observation is not repaired output or a rescore. Strict development contracts remain 3/4. Whole-hero compilation remains 2/4, partial probes 7/7 and negative probes 0/3. No complete hero qualification is established.

Training took 29.46 seconds; the complete training/inference/evaluation run took 347.31 seconds. Peak training Metal memory was 18.23 GiB. All 166 resource snapshots were on AC power, battery stayed at 100%, and maximum added swap was zero. The worker ended and its lock was released. All 11 base-model file hashes were unchanged.

## Storage and reproduction

All 41 new source/evidence text files are stored individually under `files/`, including token/evaluation JSON records, configs, raw answers and logs. Python exhibits use `.py.txt` to avoid accidental repository test discovery; restoration recovers their original names. `EXPERIMENT_INDEX.json` maps each original path and hash to its Git text file or S3 weight object.

Every new checkpoint (6/12/18/24) is retained: four unique weight objects total 5,115,796 bytes. Five original weight paths include the duplicate final research-adapter alias. `S3_RECEIPT.json`, when present and verified, proves GET/SHA-256 verification of these objects; it does not cover previously omitted models. Historical research and base indices remain unchanged.

Completed this run: all four objects were uploaded and GET/SHA-256 verified. An independent restore using only that verified cache reconstructed all 41 text files and five original weight paths with matching hashes. That restore correctly reported `remoteReadThisRun: false`; it was not a second network download. Original outputs were not overwritten.

```sh
python3 tools/editor-acceptance/hero-finetune-low-update-delivery.py verify docs/_reports/hero-finetune-research/low-update --receipt

# Fixed profile/region/bucket; new destination only; full payload hashes checked.
python3 tools/editor-acceptance/hero-finetune-low-update-delivery.py restore docs/_reports/hero-finetune-research/low-update --destination /absolute/new/low-update-workspace --cache /absolute/separate/low-update-cache
```

For a previously GET-verified cache, add `--offline`; the result correctly reports `remoteReadThisRun: false`. Restore historical dependencies using the parent S3 index and the exact base using `BASE_S3_INDEX.json`; this incremental supplement is not a full standalone runtime. The original runner/evaluator/hash-pinned engine are reused, not silently replaced with current Main. No cloud GPU or public push is performed by these commands.

The new runner's eight tests, five existing frozen-data tests, seven GPU-policy tests, nine delivery tests and twelve shared-storage tests passed (41 total). `pnpm coord:check` passed all 17 packets. An initial delivery-test fixture used macOS's symlinked temporary path and was rejected; resolving the fixture path fixed the test without weakening the path guard. These checks are not full repository CI or model qualification.
