# Approved derivative copies v1

This bounded workflow audits only the 11 entries in
`materials/hero-model-library/derivatives.json`. It does not grant or infer any
additional character-processing permission.

The machine check reads the current champion dropdown state and the exact GLB
bytes, parses every `model@1`, runs `inspectModelUpload` and
`heroModelBudgetIssues`, verifies six-state mappings and embedded resources,
and pins SHA-256 values. The Babylon renderer records front, back and isometric
rest-pose views. Motion is labelled as source-native borrowed motion or GGD
procedural proxy motion; it is never relabelled as target-character native.

The Mai source exceeded the 10,000-triangle adoption trigger. Its separate
7,994-triangle candidate was produced with the repository's
`tools/model-budget/optimize.ts`, checked for rig/clip preservation, Khronos
errors and warnings, Babylon loading, fixed-camera A/B images, and registered
through the same `ModelVersions` backend path. The previous 13,796-triangle
version remains an immutable dropdown option.

Rebuild/check sequence from the repository root:

```sh
node_modules/.bin/tsx tools/hero-model-library/source-workflows/approved-derivatives-v1/audit_policy.mts \
  . materials/hero-model-library/priority-evidence/approved-derivatives-v1/current-policy.json \
  ../GGD-Asset-Library/conversions/approved-derivatives-v1/mai-decimation/assets/models/community/versions/7f919fec29b8fd6e050c2598dda9e228e77525165bf1e53861eac017ab83baa2.glb
python3 tools/hero-model-library/source-workflows/approved-derivatives-v1/render_batch.py \
  --repo . --output ../GGD-Asset-Library/validation/approved-derivatives-v1/batch-v1 \
  --mai-candidate ../GGD-Asset-Library/conversions/approved-derivatives-v1/mai-decimation/assets/models/community/versions/7f919fec29b8fd6e050c2598dda9e228e77525165bf1e53861eac017ab83baa2.glb
python3 tools/hero-model-library/source-workflows/approved-derivatives-v1/build_audit.py --workspace ..
python3 tools/hero-model-library/source-workflows/approved-derivatives-v1/sync_catalog.py
python3 tools/hero-model-library/check-derivatives.py --workspace ..
python3 tools/hero-model-library/current_resource_index.py --git-link-root ../GGD-pr1152-next
python3 tools/hero-model-library/inventory.py
```

Use each generator's `--check` where provided. Local conversion and full render
outputs remain under `GGD-Asset-Library`; Git contains the runtime candidate,
model documents, aggregate images, exact optimizer receipts and query indexes.
No production deployment is claimed.
