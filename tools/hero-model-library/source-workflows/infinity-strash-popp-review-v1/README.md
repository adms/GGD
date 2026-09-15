# Infinity Strash Popp integration review v1

This workflow builds a deterministic review contract and a browser page for Popp's three accepted PN020 staff variants. It reads the current runtime catalog, champion model versions, Git GLBs/model documents, and the three acceptance summaries. It verifies every referenced byte hash before emitting review data.

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/test_build_review.py
```

Start the client dev server and open `/popp-integration-review.html`. The page displays the already accepted Babylon WebGL 0%/50%/100% evidence row for each idle/run/attack/cast/hurt/death state. This image-backed presentation remains visible when an embedded browser cannot display a nested live WebGL canvas, and each public review image is copied byte-for-byte from the Git-pinned acceptance evidence by the generator. When an applied decision receipt exists, the page locks the selected staff and death decision, and the death preview uses that selected model's contact sheet.

The generator never invents a candidate. The current committed receipt preserves the owner's Kagayaki selection and records that the existing global corpse-dissolve runtime supplies the approved rise/fade presentation. It does not bind SFX, claim production deployment, or treat the source down loop as a distinct native death animation.

`gap-definitions.json` is the authority for the five stable integration-gap
identities, closure criteria and review policy. `build_review.py` joins those
definitions to current model, VFX, audio, decision and runtime evidence, then
generates both `materials/hero-model-library/infinity-strash/popp-integration-review.json`
and the compact `popp-integration-gaps.json` ledger. Do not hand-edit either
generated output.

Each gap now contains `closureGates[]`: a machine-derived list of the exact
conditions that are `verified` or `blocked`, with pinned evidence paths. This
separates completed conversion work from the remaining missing input. A
blocked gate is not permission to infer a GGD audio target, original Niagara
timing, root mesh assignment, toon-shader parameter, or combat timeline.
The generated browser page presents the same gates so the review summary and
the queryable JSON cannot disagree.

`vfx-binding-proposals.json` maps all twelve generated VFX candidates into
seven source-name proposals for Q/W/R plus five unassigned reserves. The
central review portal records visual approval for all 12 VFX previews. The
newer 2026-09-15 owner instruction allows the reviewed resources to enter the
feature branch, so `runtime-bindings.json` now authorizes the seven existing
proposal relationships and preserves the five reserves without guessing.

`publish_vfx_runtime.py` is the sole writer for the 12 release VFX documents,
the Q/W/R `vfxKey` and `vfxLayers` fields, the champion mirror, and the runtime
release receipt. Directed phases add aim-relative orientation; every delay is
bounded by the authored ability `castTimeSec`. The receipt explicitly keeps
`nativeNiagaraTimingRecovered=false` and `rootSpecificMeshLayersBound=false`:
all 33 recovered StaticMesh GLBs remain indexed support assets because the
source evidence does not identify which root owns which mesh.

Run the complete checked pipeline instead of editing generated files:

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/run_vfx_runtime_release.py --write
# verification-only rerun
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/run_vfx_runtime_release.py
```

The pipeline publishes VFX and ability documents, rebuilds the official
content indexes/bundle, regenerates the review contract, gap ledger, fixed
five-day report section and current-resource index, then runs content/VFX and
workflow checks. Audio identity and audio runtime binding remain separate.

Apply an exported owner decision through the checked workflow; do not edit the champion default by hand:

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/apply_decision.py --decision /path/popp-integration-review-decision.json
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/apply_decision.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/test_apply_decision.py
```

The receipt pins the selected existing model version and the existing global corpse-dissolve implementation. It records feature-branch selection separately from production deployment. Audio remains outside this decision and still requires the dedicated listening review.
