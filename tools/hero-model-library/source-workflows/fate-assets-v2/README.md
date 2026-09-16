# Fate assets v2 workflow

This workflow keeps three source classes separate:

1. Fate/unlimited codes PSP inventory rows (metadata-only until the payload is locally readable),
2. Fate/unlimited codes PS2/public/community supplemental sources, and
3. Flemmli97's Fate/Unlimited Block Works Minecraft Java 1.21.1 community assets.

`audit_candidates.mts` measures the 14 current Minecraft GLBs from their pinned local paths with the live GGD policy. `build_inventory.py` verifies the source model, texture, animation and converted GLB SHA-256 for each servant, joins identity and S3 evidence, and emits a conservative motion-semantic and registration-blocker matrix. `update_four_day_report.py` owns the generated report block.

```bash
node --import tsx tools/hero-model-library/source-workflows/fate-assets-v2/audit_candidates.mts
python3 tools/hero-model-library/source-workflows/fate-assets-v2/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/fate-assets-v2/update_four_day_report.py
python3 -m unittest tools/hero-model-library/source-workflows/fate-assets-v2/test_build_inventory.py
```

Policy success is only model-budget evidence. ARR rights review, visual-form approval, animation parity, GGD event mapping, backend registration and production deployment remain independent gates.
