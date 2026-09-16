# PlayStation platform source workflow

This workflow separates remote Windows inventory metadata from locally readable
and hashed PlayStation-family source material. It covers PS1, PSP, PS Vita, PS2,
PS3 and the already acquired PS4 Cloud audio supplement. Completed Fate/UC,
J-Stars and Smash workflows are explicit exclusions.

Run from the repository root:

```bash
node --import tsx tools/hero-model-library/source-workflows/playstation-platform-sources-v1/audit_cloud_candidate.mts
python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/build_inventory.py --check
python3 tools/hero-model-library/source-workflows/playstation-platform-sources-v1/query.py cloud
python3 -m unittest tools/hero-model-library/source-workflows/playstation-platform-sources-v1/test_inventory.py
```

`audit_cloud_candidate.mts` imports the current model policy and measures the
actual Cloud GLB. `build_inventory.py` verifies all files for the three acquired
source IDs against `public-source-files.json`, including every WAV PCM payload
and every PSP GMO header. It does not open or infer contents from remote ROM
metadata.

Generated files live under
`materials/hero-model-library/source-inventories/playstation-platform-sources-v1/`.
Fix an input or generator and rebuild; do not patch generated output alone.
