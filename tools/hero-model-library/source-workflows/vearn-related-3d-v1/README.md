# 巴恩大魔王 3D 候選跨來源工作流

`build_inventory.py` 會根據本機已驗證的 BowlRoll PMX 轉換收據、WebGL 三視圖及《燃魂羈絆》完整快取下載進度，重建中央索引與「2026-09-11～2026-09-17」總清單。

```sh
python3 tools/hero-model-library/source-workflows/vearn-related-3d-v1/build_inventory.py --workspace ..
python3 tools/hero-model-library/source-workflows/vearn-related-3d-v1/build_inventory.py --workspace .. --check
python3 -m unittest tools/hero-model-library/source-workflows/vearn-related-3d-v1/test_build_inventory.py
```

這個工作流不會根據檔名或快取日期自動認定鬼眼王，也不會將靜態審查 GLB 記成原生動作或已上架。
