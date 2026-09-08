# 原始素材及半成品備份（人工許可區）

固定位置：`s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`

備份目錄統一使用 **legacy**，位於 bucket 根目錄，與 `GGD-Asset-Library/` 正式共享成品分開。

僅供備份及完整性驗證。**任何其他工作流、代理、遊戲匯入器或自動下載器不得自動取用備份素材；特殊情況須取得使用者對特定快照、素材及用途的明確許可。** 原始素材與半成品不能直接當成已驗證成品。此規則是工作流契約；既有 AWS 權限未更改，並非 S3 強制拒絕讀取。

## 結構與完成判斷

- `POLICY.json`：機器可讀的備份用途與人工許可規則。
- `README.md`：本說明。
- `latest.json`：最後一次所有分段成功上傳並讀回驗證的快照；不存在時不得視為完成。
- `snapshots/<快照>/manifest.json`：已驗證的來源清單、原檔逐檔 SHA-256、壓縮分段順序及 SHA-256 索引位置。
- `snapshots/<快照>/<來源>/archive.tar.gz.part00000...`：壓縮備份分段，不是可直接供遊戲使用的素材目錄。
- `snapshots/<快照>/<來源>/files.jsonl`：原檔相對工作區路徑、大小及 SHA-256。

來源涵蓋《300英雄》、《魔法少女武鬥祭》原始下載／解包／轉換及證據、LoL 模型半成品、舊候選索引、37 名社群英雄交接內容、本機 intake 與 staging。每份快照記錄實際納入的檔案；本機來源及壓縮副本均保留。後續新增來源須明確加入備份範圍。

## 人工許可後的還原

取得使用者許可後，只下載獲准快照與來源的分段。依 manifest 中順序逐段核對 SHA-256，串接為一個 tar.gz，解壓到**新的空目錄**，再依 files.jsonl 核對還原檔 SHA-256。不得直接覆蓋工作區或匯入遊戲。仍需通過標準化、動作／特效綁定及正式入庫程序，才可加入共享成品索引。

正式工作流僅讀 `s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/current.json` 指向的版本。禁止為了找素材而遞迴同步整個 bucket 或 legacy/。

AWS 僅使用既有 vibe-coding profile、ap-east-2；不讀寫憑證檔，不改 IAM、ACL 或 bucket policy，不刪除任何本機來源或遠端物件。AccessDenied 時停止並回報被拒絕的 action 與 resource。
