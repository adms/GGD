# Gemma 4 12B bounded-action LoRA — terminal delivery

This is the immutable delivery index for the single completed Mac-only run
`hero74-action-v4-power-v1`.  It is a research failure receipt, **not** a
production model release or a claim that a complete hero can be generated.

## Fixed run and evidence

- Base: `mlx-community/gemma-4-12B-it-8bit`, revision
  `200bb6db075e137a4deb08838865ac4ddb86292e`.
- Training: 59 approved teacher heroes, 12,480 bounded action tasks, one
  fixed epoch, 2 final decoder layers, LoRA rank 8 on Q/O projections.
- Internal seen development denominator: 15 heroes.  It is not blind or
  unseen-generalisation evidence.
- The archived bundle contains the full terminal train/evaluation/E2E/match
  receipts, deterministic source snapshots, and 10 checkpoint adapter blobs.
  Opaque ZIPs and weights are intentionally ignored by Git and are manifest
  bound for S3 storage.

## Result — fail closed

| Arm | Complete HeroPlans | Generated calls | Terminal result |
| --- | ---: | ---: | --- |
| Base | 0 / 15 | 15 | failed at identity/shape gates |
| LoRA | 0 / 15 | 168 | reached later staged actions, but still failed strict final gates |

LoRA improved the amount of structured staged output that passed transport and
early JSON handling, but it did **not** improve the complete-hero rate: both
arms remain 0/15.  The observed terminal categories include invalid identity,
incomplete/invalid JSON, duplicate keys, shape errors, and selection-key
errors.  No local repair, retry selection, or fallback conversion was applied.

Because no complete HeroPlan existed, compiler/package/import/readback was
skipped with `INCOMPLETE_HERO_PLANS`; the separate headless match-entry batch
also has 0/15 for both arms.  Semantic fidelity, six-slot mechanics, live
gameplay, network clients, and zero-dangerous-accepts are therefore unproven.

Teacher-forced development cross-entropy is recorded inside the run receipt,
but is not used here as a hero-quality score.

## Restore and storage boundary

The exact 12.75 GB base is being relocated independently to the corrected immutable
S3 prefix `legacy/hero-finetune-research/base-model/sha256/` using 56
content-addressed chunks.  The mover conditionally creates each object and
requires a hash-verified `GetObject` readback before writing its receipt.  Its
legacy index and receipt are generated beside the terminal run, so a missing
receipt means the transfer was not complete.

The adapter/evidence bundle uses the same fixed `vibe-coding` profile and
`ap-east-2` region under `legacy/hero-finetune-research/sha256/`.  The storage
scripts never inspect or copy credentials, change IAM, delete, or overwrite
objects.  The base and adapter are reproducibility artifacts only; they are
not promoted.

## How to audit locally

```sh
python tools/editor-acceptance/hero-finetune-archive.py verify \
  docs/_reports/hero-finetune-research/hero74-action-v4-power-v1-delivery/bundle

python tools/editor-acceptance/hero-distillation-action-report.py \
  --training "$RUN/train" --evaluation "$EVAL" --e2e "$E2E" \
  --match-entry "$MATCH" --out "$REPORT.html"
```

The second command must point at the recorded terminal directories.  It
renders the evidence-bound report and deliberately cannot convert the 0/15
result into a pass.
