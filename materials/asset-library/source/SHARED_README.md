# GGD 共享成品資源庫

**共編、按角色查詢與下載排程：[統一素材庫入口](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/asset-library/README.md)。** 本文件只負責整包下載；角色狀態統一看 Git 盤點。

**成品主要入口：[Git 固定版本](https://github.com/adms/GGD/blob/codex/hero-model-library-options/materials/asset-library/git-release.json)。既有 S3 副本：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`**

第三守則：成品一律進 Git；半成品、來源、準備材料進 S3，本機全保留。下方 S3 下載方式保留供既有版本副本取用；現行預設規則以同一 Git commit 的 `default-policy.json` 為準。本機仍保留工作庫及每次發布的完整副本。使用具有此 bucket 讀取權限、已配置 `vibe-coding` profile 的環境下載；不需要把憑證放进程式或文件。

## 共享索引

| 固定物件 | 用途 |
|---|---|
| `current.json` | 最新已驗證版本、整包 ZIP 位址與 SHA-256；下載以這個指標為準 |
| `catalog.json` | 正式成品套件清單，包含每個套件的 S3 URI |
| `resources.json` | 個別特效／角色索引，包含文件、貼圖的 S3 URI |
| `hero-model-options.json` | 模型候選清單；包含未核准相似模型，不可直接用第一筆當預設。預設讀同 Git 版本的 `inventory.json`／`default-policy.json` |
| `README.md` | 本說明 |
| `COPY_TO_WORKFLOW.txt` | 可複製的工作流交接文字 |
| `DOWNLOAD.py` | 使用固定 AWS profile 下載並驗證整包的工具 |
| `releases/<版本>/` | 內容固定的版本快照，包含成品、查詢工具、規範、驗證清單及 ZIP |

成品數量以 `current.json` 與 `resources.json` 為準；包括 GGD 特效元件與已驗證的模型／動作元件。這些是現有 GGD 作者化特效，不是 MBA／300 原生特效的轉檔結果。原始下載、待轉換角色與 staging 保留在本機，另存於獨立人工許可備份區，不列入共享成品。

## 整包下載

AWS CLI 會透過預先配置的 profile 自動取得及更新臨時身分。不切換 profile，不手動注入金鑰。

```sh
AWS_PROFILE=vibe-coding AWS_REGION=ap-east-2 aws s3 cp \
  s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/DOWNLOAD.py \
  ./download-ggd-assets.py --profile vibe-coding --region ap-east-2
python3 download-ggd-assets.py --destination ./ggd-resource-releases
```

下載器先確認 ARN 包含 `assumed-role/vibe-coding-s3-role/`，再取得 current.json、ZIP，核對 SHA-256、ZIP CRC 及逐檔雜湊。新版本存到獨立目錄；不刪除本地既有副本，遇到不同內容的同名檔會停止。

在工具輸出的 `GGD-Asset-Library` 目錄內查詢：

```sh
python3 query.py
python3 query.py fire --kind vfx
```

查詢工具只需 Python 3 標準庫。`catalog.json` 和 `resources.json` 的檔案路徑均可相對於下載根目錄解析，GGD 文件中的素材路径則相對於對應套件的 `content/`。驗證報告中的原始 repo 路徑僅供追溯，不是下載或查詢的依賴。

## 標準與使用界線

完整角色包需具備 GLB 2.0、完整 skin／貼圖、六種真實動作對應，以及 GGD 特效、事件和掛點綁定。未完成者不能列為完整角色。可重用 `model-body` 與 VFX 元件按獨立類型驗證；模型元件保留實際動作綁定並明示動作共用、特效與音效缺項。

資源庫的 `resource.json` 是工作流旁檔；`content/` 內沿用 GGD `model@1`、`vfx@1`／`ribbon@1`、`vfx-script@1`。這不是新的遊戲匯入格式。標準化不代表已完成遊戲發布、逐動作畫面驗收、原作忠實度或效能驗收。

## 發布順序與保留策略

本機先入庫驗證，再建立僅含正式成品的版本快照／ZIP；上傳後從 S3 讀回所有檔案比對雜湊，最後更新固定索引與 current.json。既有版本不刪除，不使用 sync --delete，不修改 ACL、bucket policy 或 IAM。

若收到 AccessDenied，停止該操作並回報 AWS action 與 S3 resource，待授權決定；不改身分或繞過限制。共享範圍是已有 bucket 讀取權限的工作流，未設為匿名公開。

備份區：`s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`，僅供備份及人工明確許可的特殊用途；禁止其他程序自動取用，不納入正式索引或下載包。規則與還原說明見 [BACKUP_README.md](BACKUP_README.md)。

整庫儲備規則：不依角色新舊、上架狀態或既有 GGD ID 篩選；不同世代、平台、作品、版本與配色全部保留。先取得原始整庫／整包並保存逐檔 SHA-256，按需配對轉換。原始儲備存 S3 legacy 並全留本機；驗收成品進 Git，再加入後台獨立選項。同級候選按來源遊戲發售日由新到舊，手動指定及九級順位保留。
查詢尚未配對與下載中來源：python3 tools/hero-model-library/query.py --downloads gitlab-ssbu-models
完整規則：materials/hero-model-library/全角色模型盤點.md；機器規則：download-sources.json 的 ingestionPolicy、consoleSourceScope，以及 default-policy.json 的 sameClassPriority。

角色語音索引：materials/hero-model-library/角色語音索引.md；voice-index.json／voice-files.jsonl 保存角色與逐檔 SHA-256，供合成素材挑選、聽審及轉錄。查詢：python3 tools/hero-model-library/query_voice.py 莉娜
