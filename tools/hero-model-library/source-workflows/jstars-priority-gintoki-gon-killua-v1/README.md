# J-Stars 銀時／小傑／奇犽優先工作流

這個工作流只負責三名角色的可重現盤點與轉換開工條件。它會驗證現有可複用模型、雜湊已解碼音訊、盤點奇犽 J-Stars `018` SRD 實檔，並明確區分 J-Stars、JUMP FORCE、300 英雄與社群來源。

現在 `J-Stars Victory Vs+.7z` 並未出現在標準本機接收位置。因此腳本不會推測銀時或小傑的原生 ID，也不會把既有候選寫成 J-Stars 轉換成品。

```bash
node --import tsx tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/validate_models.mts
python3 tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/build_inventory.py
python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-gintoki-gon-killua-v1/test_inventory.py
```

產物固定寫入 `materials/hero-model-library/source-inventories/jstars-priority-gintoki-gon-killua-v1/`。
