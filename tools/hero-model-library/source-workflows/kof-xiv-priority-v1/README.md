# KOF XIV priority native extraction

This workflow reads the user-owned Windows Steam installation through the read-only SMB mount and extracts the exact native directories `Chara/MAI`, `Chara/IOR`, and `Chara/KYO` from `assets.wad`. It never writes to the mounted Windows share.

The extractor pins the 17.87 GB WAD by byte size and SHA-256, pins QuickBMS 0.12.0 and `kofxiv.bms` 0.2 by SHA-256, rejects absolute or parent-traversal paths from the 39,889-entry WAD listing, and freezes every one of the 1,088 selected files with an absolute local path and SHA-256. The extracted OGG files are immediately indexed for listening review.

`audit_audio.py` then fully decodes all 474 OGG files with the recorded FFmpeg build. It records exact Vorbis frames, duration, sample rate and channels. `Sound/voice/` is kept as `voice-source-label-unreviewed`; `Sound/se/` becomes `sound-effect`. These are native directory labels, not proof of language, speaker, transcript or skill-event mapping.

`OBAC`, `OMIR`, `OSEC`, `OTRA`, and effect records are still native KOF XIV formats. Their presence proves acquisition and extraction only. No model, animation, effect, backend option, or deployment is accepted until conversion and visual/runtime validation succeed. `KYO` is recorded as 草薙京 with its native ID and an awaiting-hero-design state because no verified GGD hero definition was found.

Run from the repository root:

```sh
python3 tools/hero-model-library/source-workflows/kof-xiv-priority-v1/extract.py \
  --workspace "$PWD/.." \
  --wad '/Volumes/common/THE KING OF FIGHTERS XIV/assets.wad' \
  --quickbms "$PWD/../GGD-Asset-Library/tools/QuickBMS-complete-mirror/prebuilt-macos-0.12.0/quickbms_4gb_files" \
  --script "$PWD/../GGD-Asset-Library/tools/QuickBMS-0.12.0/kofxiv.bms"
python3 tools/hero-model-library/source-workflows/kof-xiv-priority-v1/audit_audio.py \
  --root "$PWD/../GGD-Asset-Library/intake/windows-readonly-20260913/kof-xiv-priority-mai-ior-kyo-v1"
python3 tools/hero-model-library/source-workflows/kof-xiv-priority-v1/integrate.py --workspace "$PWD/.."
python3 tools/hero-model-library/archive-intake.py steam-kofxiv-priority-mai-ior-kyo-build-local-v126 --workspace "$PWD/.."
```

The `--reuse-extracted` flag rehashes a complete existing extraction without invoking QuickBMS again.
The audio audit accepts `--check` for a byte-for-byte reproducibility check.
