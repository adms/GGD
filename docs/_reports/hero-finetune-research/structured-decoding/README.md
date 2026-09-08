# Fixed four-hero structured-decoding control

No new training, dataset expansion, recipe repair, engine changes or model promotion.

| Measure | Base historical → constrained | Original 24-step LoRA historical → constrained |
|---|---|---|
| JSON validity | 4/4 → 4/4 | 4/4 → 4/4 |
| Structural schema, post-hoc decomposition | 4/4 → 4/4 | 3/4 → 4/4 |
| IR/source validation and compilation | 2/4 → 2/4 | 2/4 → 2/4 |
| Partial behavior probes | 7/7 → 6/7 | 7/7 → 6/7 |
| Source-negative probes | 0/3 → 1/3 | 0/3 → 1/3 |

Mixed behavior, not adoption: Lee Sin EX stops inventing enemy displacement but now damages before landing; R still lacks the required approach. Four exposed development heroes do not establish complete-source coverage or independent qualification. All outputs remain unqualified.

- [Generated report](files/structured-decoding-v2/REPORT.md)
- [Interpretation and next-training boundary](files/structured-decoding-v2/INTERPRETATION.md)
- [Fixed scorer results](files/structured-decoding-v2/assessment/manifest.json) and [per-case failures](files/structured-decoding-v2/assessment/cases.json)
- [Resource and timing receipt](files/structured-decoding-v2/summary.json)
- [25 unit checks and 17 coordination-packet checks](files/structured-decoding-v2/checks.json), not full CI.

## Loader erratum and evidence

v1 completed the base arm, then failed before adapter generation: the generic `mlx_vlm.load(..., adapter_path=...)` API interpreted relative module keys as full paths. **The earlier model-card loading example is invalid for this checkpoint format in the pinned runtime.** The failure is preserved, not counted as a model answer.

v2 uses the original training implementation, `mlx_vlm.trainer.adapter_utils.linear_to_lora_layers`. All eight keys and all 319,488 saved parameters match the loaded tensors exactly. No new weights were created. Both arms were regenerated; v2's base output envelopes matched v1 byte-for-byte in 4/4 cases.

v2 took 275.13 supervised seconds, with 12.81 GiB peak Metal. Including v1: 425.76 supervised seconds and 527.24 elapsed seconds through the loader repair and v2 completion. All 212 resource samples were on AC at 100% battery, with zero per-stage swap growth. Workers and lock are released. These are inference/control times, not training times.

The grammar converts only the 19 action `oneOf` branches after proving their required `op` constants disjoint. Original validators stay unchanged. A structurally legal fabricated source quote still fails the original semantic validator. Existing controls are historical output replays, not fresh baseline runs.

## Restore this text supplement

All 67 indexed scripts, JSON, reports and logs are individually stored in Git. No new binaries or S3 operations occurred; the exact base and original adapter use existing backups. This is additive to the historical research restore, not a standalone environment installer.

```sh
python3 tools/editor-acceptance/hero-finetune-decoder-delivery.py verify docs/_reports/hero-finetune-research/structured-decoding
python3 tools/editor-acceptance/hero-finetune-decoder-delivery.py restore docs/_reports/hero-finetune-research/structured-decoding --destination /absolute/new/decoder-supplement
```

Restoration only writes into a new directory and checks every text hash. It does not contact S3, install dependencies, run a GPU, or verify remote objects. Code exhibits carry `.txt` to avoid accidental repository-wide discovery; restoration recovers their original filenames.

Restore the historical research layout, pinned engine, runtime, exact base and checkpoint first. Relevant executed entries: `structured-hero-control-v2.py`, `run-structured-assessment-v2.py`, `summarize-structured-control.py`. Their prerequisite manifests and hashes are retained. Existing experiment directories are immutable: another GPU experiment needs a new versioned protocol/directory, not deletion of receipts to bypass no-restart guards. No public push was performed.
