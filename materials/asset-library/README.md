# 固定資源庫的 Git 管理資料

本目錄保存固定資源庫的管理腳本、索引、配方、標準 GGD JSON、來源說明及驗證紀錄。二進位素材、遊戲本體及原始／中間格式資料留在 S3；本機工作庫另保留完整副本。

- 正式成品：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`
- 人工許可備份：`s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`
- 社群交付封存：見 [source/ASSET_LIBRARIES.md](source/ASSET_LIBRARIES.md) 與核對紀錄。

[source/](source/) 按原本工作區相對路徑保存管理資料。不要把這份純管理資料目錄視為已下載完整素材庫；腳本仍需要相同目錄結構下的實體素材與 GGD schema 工作目錄。恢復管理資料時只複製此處清單列出的文字檔到獨立工作區，再取得獲准使用的素材；不得自動還原 legacy 備份。

來源修改後，以 `python3 materials/asset-library/export_sources.py --workspace <工作區>` 更新 Git 管理快照，並 review diff。此工具不取用 S3、不修改來源工作區、不刪既有檔案；更新清單會列出所有複製來源及 SHA-256。

本次 Git 範圍包含管理腳本、查詢索引、作者化 JSON／配方、來源與核對文件。約 3.9 萬份原生模型／動作大型解析 JSON 已確定保存在 S3，排除於 Git。解析／轉換程式、英雄與技能設定 JSON、版本清單、SHA-256 與文件由 Git 管理；規則見 [STORAGE_POLICY.json](source/GGD-Asset-Library/STORAGE_POLICY.json)。封存內既有文字副本與歷史驗證紀錄保留原內容，不因新 Git 管理版而改寫歷史備份。

[核對結果](source/GGD-Asset-Library/STORAGE_AUDIT.md) · [來源檔案清單](source-manifest.json)。本機 commit 與 GitHub 發布是不同狀態，以實際 commit／PR 為準。

來源鏡像保留原始位元組（包含 CSV 的 CRLF、原文換行與既有空白），以逐檔 SHA-256 驗證；不為了格式檢查改寫原始交接內容。新管理工具與文件另做語法／格式檢查。
