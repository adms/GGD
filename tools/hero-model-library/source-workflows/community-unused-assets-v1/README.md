# Community unused asset inventory workflow

This workflow composes acquired MOD, Workshop, Warcraft custom-map/model,
resource-forum, community and author-public sources from the existing central
source manifests. It does not download anything and does not duplicate the
large per-file manifests.

```sh
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/verify_local.py
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/build_inventory.py
python3 -m unittest tools/hero-model-library/source-workflows/community-unused-assets-v1/test_inventory.py
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py --kind vfx --stage unused
```

`verify_local.py` recomputes every selected authoritative file SHA-256 and
emits only source-level totals. The detailed path/hash rows stay in
`public-source-files.json`.
