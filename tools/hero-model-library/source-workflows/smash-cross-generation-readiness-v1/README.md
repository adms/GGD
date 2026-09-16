# Smash cross-generation readiness workflow

This workflow regenerates one central source-readiness inventory across N64,
Melee, Brawl, Ultimate community sources, and the NSandNS2 metadata scan.  It
does not download, decrypt, execute, or extract a game container.

Run from a GGD checkout, naming the workspace whose local asset library is
being measured:

```sh
python3 tools/hero-model-library/source-workflows/smash-cross-generation-readiness-v1/build_inventory.py \
  --workspace '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT' --write
python3 tools/hero-model-library/source-workflows/smash-cross-generation-readiness-v1/build_inventory.py \
  --workspace '/Users/Takuro/Dropbox/我的 Mac (Moriya.local)/Documents/ABxVFX_EDIT'
python3 -m unittest tools/hero-model-library/source-workflows/smash-cross-generation-readiness-v1/test_build_inventory.py
```

The generated authority is
`materials/hero-model-library/source-inventories/smash-cross-generation-readiness-v1/`.
It carries input hashes, central source IDs, and separate counters for source
availability, conversion candidates, backend choices, and deployment.  Do not
patch its JSON or Markdown manually.
