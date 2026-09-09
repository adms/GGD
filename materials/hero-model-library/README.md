# 角色模型資料

**共編操作只看 [素材庫共編入口](../asset-library/README.md)。** 本目錄是它的角色模型資料，不是另一個資源庫。

| 檔案 | 用途 |
|---|---|
| [全角色模型盤點.md](全角色模型盤點.md) | 人閱讀：81 名新角色與既有角色、預設、候選及下載安排 |
| [inventory.json](inventory.json) | 程序讀取：同份盤點的角色 ID、modelKey、S3 路徑與取得狀態 |
| [download-sources.json](download-sources.json) | 可共編：使用者指定的下載網址與改造備註 |
| [pairing-inputs.json](pairing-inputs.json) | 可共編：第二批與舊英雄配對來源 |
| [default-policy.json](default-policy.json) | 預設核准範圍：僅 11 組加工替身，其他相似模型留候選 |
| [derivatives.json](derivatives.json) | 可共編：獨立模型副本的製作要求 |
| [manifest.json](manifest.json) | 已發布的可用模型候選與順位；未完成來源不得加入可用選項 |
| [release.json](release.json) | 此 Git 版本對應的 S3 成品版本與逐模型位置 |
| [inventory-context.json](inventory-context.json) | 正式機與原始目錄的觀測快照 |
| [derivative-validation.json](derivative-validation.json) | 11 個副本的獨立檔案、貼圖、骨架、動作與來源不變證據 |
| [spider-identity.json](spider-identity.json) | 蜘蛛子原生表格與模型身分對應證據 |
| [s3-publication-receipt.json](s3-publication-receipt.json) | S3 上傳後讀回驗證；不是網站部署收據 |

本版包含 97 筆來源選項、90 個不同模型，以及成品庫中既有的 60 個 GGD 作者化 VFX 元件。模型／動作元件與完整英雄包分開計算；不得宣稱 156 筆盤點 ID 已全部上架。

已有可用 300 模型就預設用 300，付費來源暫緩；缺可用 300 時才優先處理使用者來源。銀時、蜘蛛子、海克力斯與五個待轉換項目的細節統一放在盤點，不再在多個 README 重複維護。
