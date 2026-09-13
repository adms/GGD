# Infinity Strash weapon review v1

This workflow builds the source-pinned review contract and browser page for
Popp's three PN020 staff variants and Dai's two accepted PN010 complete-model
weapon variants. It also shows the two accepted independent Dai sword props,
while keeping them ineligible until character attachment fit is verified.

Popp's already applied Kagayaki owner decision is read from its committed
receipt and rendered read-only. Dai starts with no owner choice even though the
page identifies the current automatic runtime candidate. One radio group
allows exactly one Dai complete-model choice. The exported JSON is review input
only and has `runtimeMutationAllowed=false`; it does not bind audio, voice, VFX,
or change a hero configuration.

The cards use byte-verified Babylon WebGL contact sheets copied by the
generator. This makes each model visible even when nested live WebGL canvases
are unavailable or render black.

```sh
python3 tools/hero-model-library/source-workflows/infinity-strash-popp-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/infinity-strash-weapon-review-v1/build_review.py
python3 tools/hero-model-library/source-workflows/infinity-strash-weapon-review-v1/build_review.py --check
python3 -m unittest tools/hero-model-library/source-workflows/infinity-strash-weapon-review-v1/test_build_review.py
```

Start the client development server and open
`/infinity-strash-weapon-review.html`. The page exports
`ggd.infinity-strash-weapon-review-decision@1` only after one Dai full-model
choice is selected. A later checked integration step must consume that file.
