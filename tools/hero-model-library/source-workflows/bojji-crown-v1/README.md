# Bojji crown v1 workflow

This workflow adds only the owner-requested small gold crown to the existing
independent `derivative:bojji` GLB.  It does not mutate or replace the source.
The new crown primitive is fully weighted to the existing `Bip001 Head` joint,
so it follows all five preserved source-native borrowed clips and passes the
runtime all-primitives-skinned check.

Run from the repository root:

```sh
python3 tools/hero-model-library/source-workflows/bojji-crown-v1/build_candidate.py
node --import tsx tools/hero-model-library/source-workflows/bojji-crown-v1/validate_candidate.mts \
  . \
  content/assets/models/community/versions/745fe9a31c9ed44098f7d92984de88e81f5ddf6605c7327f327ddcd82ee96581.glb \
  ../GGD-Asset-Library/conversions/bojji-crown-v1/candidate.glb \
  ../GGD-Asset-Library/conversions/bojji-crown-v1/validation.json
python3 tools/hero-model-library/source-workflows/approved-derivatives-v1/render_static_glb.py \
  ../GGD-Asset-Library/conversions/bojji-crown-v1/candidate.glb \
  ../GGD-Asset-Library/conversions/bojji-crown-v1/webgl-review-v1 \
  --repo .
python3 tools/hero-model-library/source-workflows/bojji-crown-v1/build_visual_evidence.py
node --import tsx tools/hero-model-library/source-workflows/bojji-crown-v1/promote_register.mts \
  . ../GGD-Asset-Library/conversions/bojji-crown-v1/candidate.glb --apply
python3 tools/hero-model-library/source-workflows/bojji-crown-v1/build_inventory.py
```

Use `build_candidate.py --check`, `promote_register.mts ... --check` and
`build_inventory.py --check` after the initial build.  The source and local
candidate stay in `GGD-Asset-Library`; promotion copies the validated bytes to
the content-addressed Git model path and registers one independent
`modelVersions` option.  The previous five options remain present, while the
new owner-requested crown version becomes the current automatic selection.
This local content registration does not claim production deployment.
