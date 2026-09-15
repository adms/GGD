# Astralym complete 58-motion decimation

This workflow produces a separately retained Astralym component from the existing material-bound OP.GG source. It keeps all 58 native clips, reduces 23,928 triangles to the current formal target, and resizes every embedded texture to the live 256px cap. It does not invent a hero ID, animation, skill binding, VFX or audio event.

The full-motion component is a source library and non-default model-option candidate. Runtime semantic use must continue to use an owner-reviewed six-state clip map; the source has no native `Death`, so the existing `Damage` plus ascend/fade presentation remains explicitly marked as a fallback.

```sh
bash tools/model-budget/optimize/bootstrap-geometry.sh
node --import tsx tools/hero-model-library/source-workflows/palworld/astralym-full58-decimation-v1/build_candidate.mts \
  --out ../GGD-Asset-Library/conversions/palworld-astralym-full58-decimation-v1/final/astralym-full58-256-decimated.glb
python3 tools/hero-model-library/source-workflows/palworld/astralym-full58-decimation-v1/render_and_compare.py --help
node --import tsx tools/hero-model-library/source-workflows/palworld/astralym-full58-decimation-v1/validate_candidate.mts
python3 tools/hero-model-library/source-workflows/palworld/astralym-full58-decimation-v1/register_candidate.py --write
```

The builder checks the frozen source SHA-256, exact native clip metadata, skin coverage, triangle target, draw count and texture cap. The generated receipt is written beside the local output. Central registration and Khronos/animation-byte/visual acceptance are separate steps so a conversion result cannot be mistaken for a selectable or deployed model.

The complete 74-file conversion directory is also retained at
`s3://ggd-390630837668-ap-east-2-an/legacy/conversions/palworld-astralym-full58-decimation-v1/8336c5cbf08c073e0d30bbdac08d0ae54f6d6d8a4b63be8972618da28a7fa0c5.tar.gz`.
Its archive is 53,102,420 bytes with SHA-256
`8336c5cbf08c073e0d30bbdac08d0ae54f6d6d8a4b63be8972618da28a7fa0c5`.
The checked-in receipt records a complete S3 readback, all-member SHA-256 verification, and unchanged local files. This proves material backup integrity; production deployment remains unverified.
