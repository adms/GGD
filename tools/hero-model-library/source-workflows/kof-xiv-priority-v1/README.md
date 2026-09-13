# KOF XIV priority native extraction

This workflow reads the user-owned Windows Steam installation through the read-only SMB mount and extracts the exact native directories `Chara/MAI`, `Chara/IOR`, and `Chara/KYO` from `assets.wad`. It never writes to the mounted Windows share.

The extractor pins the 17.87 GB WAD by byte size and SHA-256, pins QuickBMS 0.12.0 and `kofxiv.bms` 0.2 by SHA-256, rejects absolute or parent-traversal paths from the 39,889-entry WAD listing, and freezes every one of the 1,088 selected files with an absolute local path and SHA-256. The extracted OGG files are immediately indexed for listening review.

`OBAC`, `OMIR`, `OSEC`, `OTRA`, and effect records are still native KOF XIV formats. Their presence proves acquisition and extraction only. No model, animation, effect, backend option, or deployment is accepted until conversion and visual/runtime validation succeed. `KYO` is recorded as 草薙京 with its native ID and an awaiting-hero-design state because no verified GGD hero definition was found.

Run from the repository root:

```sh
python3 tools/hero-model-library/source-workflows/kof-xiv-priority-v1/extract.py \
  --workspace "$PWD/.." \
  --wad '/Volumes/common/THE KING OF FIGHTERS XIV/assets.wad' \
  --quickbms "$PWD/../GGD-Asset-Library/tools/QuickBMS-complete-mirror/prebuilt-macos-0.12.0/quickbms_4gb_files" \
  --script "$PWD/../GGD-Asset-Library/tools/QuickBMS-0.12.0/kofxiv.bms"
python3 tools/hero-model-library/source-workflows/kof-xiv-priority-v1/integrate.py --workspace "$PWD/.."
python3 tools/hero-model-library/archive-intake.py steam-kofxiv-priority-mai-ior-kyo-build-local-v126 --workspace "$PWD/.."
```

The `--reuse-extracted` flag rehashes a complete existing extraction without invoking QuickBMS again.
