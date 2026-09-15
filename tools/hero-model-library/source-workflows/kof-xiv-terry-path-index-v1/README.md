# KOF XIV Terry path index v1

This workflow freezes the cached `Chara/TRY/` WAD listing as deterministic Git evidence. It does not treat paths, offsets or listed byte counts as extracted payloads.

```bash
python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/integrate.py --workspace ..
python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/update_four_day_report.py --write
python3 -m unittest tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/test_build_inventory.py
```

After the read-only Steam share is mounted again, the extraction command is:

```bash
python3 tools/hero-model-library/source-workflows/kof-xiv-terry-path-index-v1/extract.py \
  --workspace .. \
  --wad '/Volumes/common/THE KING OF FIGHTERS XIV/assets.wad' \
  --quickbms ../GGD-Asset-Library/tools/QuickBMS-complete-mirror/prebuilt-macos-0.12.0/quickbms_4gb_files \
  --script ../GGD-Asset-Library/tools/QuickBMS-0.12.0/kofxiv.bms
```

Re-run the same commands with `--check` where supported after generation. The next extraction lane requires the user-owned KOF XIV WAD to be remounted read-only; no permission bypass or network acquisition belongs in this workflow.
