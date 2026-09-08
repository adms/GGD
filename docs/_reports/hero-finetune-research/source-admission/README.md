# Real-source recipe admission supplement

Payloads are in private S3. First follow the [hydrate instructions](../S3_STORAGE.md); archive commands below use the separate restored delivery directory.

CPU only. No new model inference, training, activation or release. The full hero-quality goal is not complete.

The reviewed Miss Fortune candidate compiles but fails an empty selected-ground barrage scenario on both seeds: all six points are scattered around the caster rather than the selected ground location. The final audit passes 26/28 positive scenarios and detects 7/7 semantic mutations with clean controls. These counts are fixture checks, not model accuracy or independent heroes. The candidate stays quarantined before training.

`REPORT.md` contains full-source interpretation, unknown-value exclusions, harness correction history, evidence and rerun instructions. `RESULT.json` is the final audit receipt. The incremental bundle includes all three audit versions and raw simulation evidence; it needs the original research bundle for unchanged compiler, catalog and harness dependencies. No engine or base weights are duplicated.

## Minimal reproduction in this checkout

```sh
node tools/editor-acceptance/hero-ground-barrage-repro.mjs --verify-controls
node tools/editor-acceptance/hero-ground-barrage-repro.mjs --expect-source-point
```

Expected exits: 0 for current self/entity control contexts; 1 for the required empty-ground source behavior. `minimal-source-point.json` saves actual schedule coordinates and the unmodified handler hash. This is a small scheduler context, not full SimWorld acceptance; the archived 28-case audit supplies compiled-hero evidence separately. Directly importing the cyclic handler before its SimWorld entry graph initially failed; the reproducer now follows the established entry initialization. That tooling issue is not an engine behavior regression.

`who: target` currently means first entity, with caster fallback. It is not established that this violates existing self/entity contracts. The question to Main is whether there is already a legal point-anchor composition or whether an explicit opt-in ground anchor is needed while preserving legacy behavior. No dataset may silently replace selected ground with self in order to compile.

## Archive checks

```sh
python3 tools/editor-acceptance/hero-finetune-archive.py verify /absolute/new/hydrated-delivery/source-admission/bundle
python3 tools/editor-acceptance/hero-finetune-archive.py extract /absolute/new/hydrated-delivery/source-admission/bundle --destination /absolute/new/source-admission-supplement
```

Keep supplements and baseline extraction separate; copy only absent files into a restored research workspace. Do not overwrite historical PLAN/README snapshots. The current local workspace already contains all dependencies. This supplement is local-only until publication is authorized for the continued goal.
