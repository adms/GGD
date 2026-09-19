# J-Stars 第一優先六名來源查核

這個唯讀工作流重新掃描 standard intake、`~/Downloads`、`~/Desktop` 與 ABxVFX_EDIT 根目錄，並合併已有 J-Stars 公開 PAK/STPK 樣本、分拆研究與 S3 readback receipt。範圍限定為坂田銀時、鵺野鳴介／神眉、小傑、奇犽、幸運超人、飛影。

它只從已保存的路徑與容器成員名稱確認原生 ID，不從名單順序推測。公開樣本只含四名角色的 `character_model_{id}_{i,m,v}` 容器；其中只有奇犽在本六名範圍內。

```bash
python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/source_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-priority-six-v1/source_inventory.py --check
python3 -m unittest tools/hero-model-library/source-workflows/jstars-priority-six-v1/source_test_inventory.py
```

產出：

- `materials/hero-model-library/priority-evidence/jstars-priority-six-v1/source-receipt.json`
- `materials/hero-model-library/priority-evidence/jstars-priority-six-v1/source-summary.md`

receipt 中的 `candidateContainerFound` 只表示本機或已備份證據有看到候選容器；`runtimeReady` 才表示是否已能供 GGD 使用。目前六名的 `runtimeReady` 全部為 false，不會因 S3 receipt 完整就冒稱已轉換或已上架。
