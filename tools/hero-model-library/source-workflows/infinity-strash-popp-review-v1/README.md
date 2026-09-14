# Infinity Strash Popp integration review v1

This workflow builds a deterministic review contract and a browser page for Popp's three accepted PN020 staff variants. It reads the current runtime catalog, champion model versions, Git GLBs/model documents, and the three acceptance summaries. It verifies every referenced byte hash before emitting review data.

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/test_build_review.py
```

Start the client dev server and open `/popp-integration-review.html`. The page displays the already accepted Babylon WebGL 0%/50%/100% evidence row for each idle/run/attack/cast/hurt/death state. This image-backed presentation remains visible when an embedded browser cannot display a nested live WebGL canvas, and each public review image is copied byte-for-byte from the Git-pinned acceptance evidence by the generator. Its rise/fade death button is explicitly a compositing review preview: it does not claim the runtime behavior is implemented.

No candidate is selected by generation. The page keeps a local draft and exports `ggd.popp-integration-review-decision@1`; only an explicit non-null user decision may be used by a later integration step. It does not bind SFX, change the current model, claim production deployment, or treat the source down loop as a distinct native death animation.

Apply an exported owner decision through the checked workflow; do not edit the champion default by hand:

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/apply_decision.py --decision /path/popp-integration-review-decision.json
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/apply_decision.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/test_apply_decision.py
```

The receipt pins the selected existing model version and the existing global corpse-dissolve implementation. It records feature-branch selection separately from production deployment. Audio remains outside this decision and still requires the dedicated listening review.
