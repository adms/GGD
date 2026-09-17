# Re:Zero Rem formal decimation v1

This workflow creates a separate geometry-only candidate from the locally
verified Thunderstore Re:Zero 0.1.1 Rem static component. It applies the owner
policy: an 18,328-triangle source is over 10,000, so the formal candidate must
be below 8,000 triangles. The original source conversion remains in the local
asset library and the pre-existing archive.

```sh
python3 tools/hero-model-library/source-workflows/rezero-rem-formal-decimation-v1/run.py --write
python3 tools/hero-model-library/source-workflows/rezero-rem-formal-decimation-v1/run.py --check
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/build_inventory.py
python3 tools/hero-model-library/current_resource_index.py
```

The output is intentionally not registered as a model dropdown option. It has
zero native actions, and the front-image comparison is automated evidence only;
the owner must approve the geometry and any borrowed/procedural motion playback
before it becomes selectable.
