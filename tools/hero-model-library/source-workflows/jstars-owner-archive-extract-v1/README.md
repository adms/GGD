# J-Stars owner archive 唯讀擷取盤點

這個工作流只讀盤點 `J-Stars Victory Vs+.7z` 與其內含 ISO，產生可重跑的 extraction receipt。它不解壓整包、不複製 ISO，也不修改原始檔。

擋案會記錄：

- owner archive 絕對路徑、大小與 SHA-256。
- 7z 成員清單；若包內有 ISO，以 pipe 直接串流列出 ISO 內容。
- 從 `PS3_DISC.SFB` / `PS3_GAME/` 等結構辨識平台與 VS+ 版本。
- 從路徑提取 `character_model_018_*`、`chr0300` 類的原生角色 token；只記錄 token，不推測角色身分。

預設會檢查素材庫 intake、Downloads 與 Desktop：

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py
```

若檔案在其他位置，傳入絕對路徑：

```bash
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py \
  --archive "/absolute/path/J-Stars Victory Vs+.7z"
```

沒有檔案時仍會產生 `blocked-archive-not-found` 收據與完整重跑指令。檔案出現後重跑同一指令即可更新。

驗證：

```bash
python3 -m unittest tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/test_inventory.py
python3 tools/hero-model-library/source-workflows/jstars-owner-archive-extract-v1/inventory.py --check
```

固定產出：

```text
materials/hero-model-library/source-inventories/jstars-owner-archive-extract-v1/receipt.json
```
