# JUMP FORCE Dai L4D2 whole-mesh preservation attempt v2

This directory contains the reproducible scripts and compact JSON evidence for
an **intermediate technical-rejected** conversion of the public L4D2 Workshop
Dai port. It remains a community MOD source and never replaces the original
JUMP FORCE `chr0430` asset.

The full local stage is
`GGD-Asset-Library/conversions/jump-force-dai-l4d2-topology-preserving-v2`.
It is preserved locally and in S3 legacy with a full archive readback and
per-member SHA-256 verification. The GLB and renderer images deliberately stay
out of Git because this candidate is not an accepted runtime asset.

Run from the GGD checkout root:

```sh
python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/wholemesh-preserving-v2/build_candidate.py --check
python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/wholemesh-preserving-v2/compare_visuals.py --check
python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/wholemesh-preserving-v2/finalize_validation.py --check
python3 tools/hero-model-library/source-workflows/jump-force-dai-l4d2-vpk-v1/analyze.py --workspace .. --check
```

Measured result: 7,616 triangles and embedded 256px textures, with the original
skin, material slots, base texture slots, and skeleton hierarchy retained.
Khronos reports zero errors and the three Babylon WebGL renders complete.
The candidate remains rejected because it has 26 draw primitives (limit 6), a
25.6767% fixed-view RGB diagnostic (policy limit 5%), and topology change leaves
29 source facial expression keys as bind-pose-only. It is not backend-registered,
runtime selectable, or deployed.
