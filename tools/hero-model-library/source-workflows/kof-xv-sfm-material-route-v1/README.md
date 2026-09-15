# KOF XV Mai SFM material-route audit

This workflow verifies the complete locally preserved KOF XV Mai SFM package,
then reconstructs its **explicit** Source VMT-to-PNG material declarations.
It is an audit and conversion-route handoff: it never guesses material slots,
installs a Source-MDL reader, or emits a GLB.

Run from the repository root:

```sh
python3 tools/hero-model-library/source-workflows/kof-xv-sfm-material-route-v1/run.py \
  --workspace ..
python3 tools/hero-model-library/source-workflows/kof-xv-sfm-material-route-v1/run.py \
  --workspace .. --check
python3 -m unittest \
  tools/hero-model-library/source-workflows/kof-xv-sfm-material-route-v1/test_run.py
```

The present host's Assimp 6.0 reports `HL2 MDLs are not implemented` for the
body and head models. Therefore the receipt remains `converted: false`,
`backendSelectable: false`, and `productionDeployed: false`. It records the
two model-part triplets (MDL/VVD/VTX), six VMT files, and their six unique
base-colour PNG declarations so an audited reader can later export geometry and
per-material slots without inferring texture names.
