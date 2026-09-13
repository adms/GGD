# 尚未使用的 MOD／工作坊／論壇／社群素材索引

本頁由 `build_inventory.py` 依中央來源資料重建。逐檔清單不複製到本索引；每筆來源用 SHA-256 固定指向 `public-source-files.json` 的同 ID 記錄。

## 範圍與數量

- 來源記錄：59；獨立元件：37。
- 權威逐檔記錄：66728 檔，26481617176 bytes。
- 尚未證明可在執行期選用：58 個來源。
- 已轉換候選：20；有部分驗收證據：11；已登記：1；明確可切換：1；正式部署：0。
- 300英雄／MBA 的大型逐檔、動作與 VFX 索引沿用 `300-mba-unused-assets-v1`，本頁只保留其 content-addressed 入口。

## 來源分類

| 類別 | 來源數 |
|---|---:|
| author-public-share | 2 |
| community-mod | 3 |
| creator-public-download | 1 |
| game-resource-forum | 9 |
| game-resource-site | 14 |
| mod-repository | 16 |
| public-source-repository | 9 |
| steam-workshop | 2 |
| warcraft-community-or-custom-map | 3 |

## 查詢

```sh
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py --kind model --stage unused
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py Fate --kind motion --json
python3 tools/hero-model-library/source-workflows/community-unused-assets-v1/query.py --components --kind prop
```

`unused` 只表示尚無明確 `runtimeSelectable=true`，不表示來源不存在或沒有轉換成果。`registered`、`runtimeSelectable` 與 `productionDeployed` 各自獨立。

## 目前阻擋

來源各自的 `readiness`、`gaps` 與元件 `limitations` 保留在 `inventory.json`。常見阻擋是缺原生動作、VFX 貼圖／shader 語意未重建、身份或角色 ID 待核、權利範圍待確認，以及只有元件尚非完整英雄。
