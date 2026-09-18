# J-Stars 優先三名素材盤點工作流

此 lane 只處理鵺野鳴介／神眉、幸運超人與飛影。它掃描 owner 的 `J-Stars Victory Vs+.7z`、讀取既有 J-Stars extraction receipt，並把其他遊戲的同角色素材標為替代候選。沒有實檔時維持精確缺口，不推測原生 ID。

```bash
python3 tools/hero-model-library/source-workflows/jstars-priority-nube-luckyman-hiei-v1/build_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-priority-nube-luckyman-hiei-v1/build_inventory.py --check
python3 tools/hero-model-library/source-workflows/jstars-priority-nube-luckyman-hiei-v1/test_inventory.py
```

生成檔位於 `materials/hero-model-library/source-inventories/jstars-priority-nube-luckyman-hiei-v1/`。狀態分開記錄取得、解包、轉換、驗收、註冊與部署；替代來源不會改寫成 J-Stars 原生素材。
