# J-STARS batch inventory v1

This workflow joins the existing owner archive plan, CPK inventory, partial
STPK identity probe, and decoded-audio receipt into one rerunnable conversion
and publication inventory. It does not open or decode the 1,596 priority WAV
files again.

The current priority batch is Gon (`017`), Meisuke Nueno (`041`), Luckyman
(`037`), and Hiei (`012`). Source containers, standardized runtime artifacts,
backend registration, and production deployment remain separate stages.

```bash
python3 tools/hero-model-library/source-workflows/jstars-batch-inventory-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-batch-inventory-v1/build_inventory.py --check
python3 -m unittest tools/hero-model-library/source-workflows/jstars-batch-inventory-v1/test_build_inventory.py
```

Generated outputs:

- `materials/hero-model-library/source-inventories/jstars-batch-inventory-v1/inventory.json`
- `materials/hero-model-library/source-inventories/jstars-batch-inventory-v1/README.md`
- the bounded `generated:jstars-batch-inventory-v1` section in
  `materials/hero-model-library/近四日新增模型動作特效清單.md`
