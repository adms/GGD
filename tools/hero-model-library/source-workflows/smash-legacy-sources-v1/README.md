# Smash legacy source inventory workflow

This workflow audits Nintendo 64 `Super Smash Bros.`, GameCube `Super Smash
Bros. Melee`, and Wii `Super Smash Bros. Brawl`. It keeps Nintendo Switch
`Super Smash Bros. Ultimate` outside the legacy totals and links its existing
reconciliation report as a separate boundary.

The generator verifies every member recorded for the existing Melee and Brawl
S3 archives against the local intake roots by size and SHA-256, and opens every
WAV to validate its PCM payload length. Windows ROM inventory rows remain
metadata-only when `ContentRead=False` and no SHA-256 exists.

Run from the repository root:

```bash
python3 tools/hero-model-library/source-workflows/smash-legacy-sources-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/smash-legacy-sources-v1/build_inventory.py --check
python3 -m unittest tools/hero-model-library/source-workflows/smash-legacy-sources-v1/test_build_inventory.py
```

The generated authority is:

- `materials/hero-model-library/source-inventories/smash-legacy-sources-v1/inventory.json`
- `materials/hero-model-library/source-inventories/smash-legacy-sources-v1/README.md`

Do not manually patch the generated files. Correct the source index or this
generator and rebuild them.
