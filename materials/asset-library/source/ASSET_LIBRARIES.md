# GGD 共享資源庫固定入口

**共享成品：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`**

本機工作庫及完整副本保留在 [GGD-Asset-Library](GGD-Asset-Library/README.md)。成品發布到 S3 並驗證後，其他具讀取權限的工作流可從固定入口下載。

| 索引 | 固定位置 |
|---|---|
| 最新版本與 ZIP | `s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/current.json` |
| 正式套件清單 | `s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/catalog.json` |
| 個別資源清單 | `s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/resources.json` |
| 下載說明 | `s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/README.md` |

- [本機共享下載說明](GGD-Asset-Library/SHARED_README.md)
- [本機入庫清單](GGD-Asset-Library/catalog.json)
- [S3 發布／讀回驗證紀錄](GGD-Asset-Library/shared/publication-receipt.json)
- [待處理清單（本機工作副本）](GGD-Asset-Library/intake/catalog.json)
- [複製給其他工作流](GGD-Asset-Library/COPY_TO_WORKFLOW.txt)

目前共享範圍為 60 個 GGD 標準特效元件與貼圖，完整角色包 0。341 筆角色／形態／設計候選仍待標準化，原生素材與單獨轉好的 GLB 不冒充完整角色成品。來源存檔仍保留在 outputs。

AWS 固定使用 `vibe-coding`、`ap-east-2`。不刪除本地或 S3 舊版本，不更改 IAM 或公開權限。

備份專區：`s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`。原始素材／半成品仍保留本機，備份不進正式資源索引，其他程序不得自動取用。特殊狀況須使用者明確許可。詳見 [備份規則](GGD-Asset-Library/BACKUP_README.md) 與 [備份完成紀錄](GGD-Asset-Library/backups/latest.json)。

已完成備份：233,280 個來源檔案，約 47.7 GiB 壓縮分段；全部 S3 物件讀回核對 SHA-256 通過。[各來源及驗證紀錄](GGD-Asset-Library/backups/README.md)。

[S3／Git 存放責任與完整性核對](GGD-Asset-Library/STORAGE_AUDIT.md)。核對限已登記資源及社群交付素材，不代表整個工作區的所有其他資料都已上傳。
