# KOF XV Ash universal atlas v1

This workflow converts the existing KOF XV Ash budget candidates without
overwriting their sources.  The previous generic atlas stage correctly stopped:
Ash has two skinned meshes and its materials couple base-colour, normal and
metallic-roughness maps.  `build.py` keeps the three channels together, keeps
the BLEND hair group separate, and merges only primitives with the same final
render state.

It is a conversion candidate workflow, not a hero publisher.  The resulting
models have no native gameplay clips and Ash has no verified GGD hero mapping.
They must not be registered as a backend option or claimed as deployed.

```bash
python3 tools/hero-model-library/source-workflows/kof-xv-ash-universal-atlas-v1/build.py \
  --source ../GGD-Asset-Library/conversions/kof-xv-ash-material-v2-budget-v2/left-hair/body.glb \
  --output ../GGD-Asset-Library/conversions/kof-xv-ash-universal-atlas-v1/left-hair/body.glb \
  --receipt ../GGD-Asset-Library/conversions/kof-xv-ash-universal-atlas-v1/left-hair/receipt.json

python3 tools/hero-model-library/source-workflows/kof-xv-ash-universal-atlas-v1/render_compare.py \
  --blender /Applications/Blender.app/Contents/MacOS/Blender \
  --source ../GGD-Asset-Library/conversions/kof-xv-ash-material-v2-budget-v2/left-hair/body.glb \
  --candidate ../GGD-Asset-Library/conversions/kof-xv-ash-universal-atlas-v1/left-hair/body.glb \
  --out ../GGD-Asset-Library/conversions/kof-xv-ash-universal-atlas-v1/left-hair/render-compare
```

For both hair variants, the current deterministic run preserves the existing
7,869 / 7,868 triangles and one 258-joint skin, reduces 18 draw primitives to
5, keeps all embedded textures at 256px, and produces byte-identical second
builds.  Fixed front, three-quarter and face renders have a maximum changed
pixel rate of 0.403285% at a 12-channel-delta threshold.  This supports a
technical review only; source identity, action semantics, hero binding,
dropdown registration and deployment remain separate work.
