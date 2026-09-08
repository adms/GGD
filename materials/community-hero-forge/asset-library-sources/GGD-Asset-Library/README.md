# GGD 固定資源庫

**共享成品固定入口：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`**

本機 `GGD-Asset-Library/` 保留完整工作庫與發布副本。S3 的 `current.json` 指向最新已驗證成品；`catalog.json` 與 `resources.json` 提供套件及個別素材索引。[共享下載說明](SHARED_README.md) · [發布紀錄](shared/publication-receipt.json)。

本機 `catalog.json` 是入庫工作清單；S3 的版本清單是已發布共享成品。新入庫項目須完成發布與 S3 讀回驗證後才可供其他工作流下載。日期目錄保留為来源存檔。

## 目前狀態

| 範圍 | 正式入庫 | 待處理 |
|---|---:|---|
| 可重用特效元件 | 60 個 GGD `vfx@1`，含全部 PNG 貼圖 | MBA／300 的原生特效仍須轉換 |
| 完整角色包（模型＋動作＋特效綁定） | **0** | 341 筆角色／形態／設計候選，並非 341 個不同角色 |

**不能把「GLB 轉出成功」當成「完整角色標準化完成」。** 莉娜已取得 GLB、31 個關節、78 段原生動作及內嵌貼圖，但六種遊戲狀態、比例／朝向、原作特效與事件對應尚未完成，所以保留在待處理清單。LoL 七位仍有受擊以待機替代及角色特效未整包綁定的問題。300 原生模型與特效也不列為正式可用角色。

這 60 個特效是現有 GGD 原創／作者化元件，從 37 名社群英雄配方引用的正式 GGD 文件與貼圖整理而來，不是把 MBA／300 特效改名成 GGD 特效。特效元件可單獨使用；它們不代表任何角色已完成整包入庫。

## 固定檔案

- [catalog.json](catalog.json)：本機已入庫清單，由入庫工具更新。
- [shared/current.json](shared/current.json)：最近成功發布的 S3 版本與 ZIP。
- [shared/releases/](shared/releases/)：本機保留的完整共享版本與 ZIP。
- [SHARED_README.md](SHARED_README.md)：跨工作流下載方式與固定 S3 索引。
- [ready/](ready/)：通過檢查後的實體資源，每個版本以內容雜湊固定，含原始來源與驗證紀錄。
- [intake/catalog.json](intake/catalog.json)：候選角色、原檔位置與每筆未完成事項。
- [intake/sources.json](intake/sources.json)：既有下載／解包資料的位置。
- [staging/](staging/)：轉換與綁定中的資源；不會被預設查詢找到。
- [policy.json](policy.json)：格式與入庫門檻。
- [COPY_TO_WORKFLOW.txt](COPY_TO_WORKFLOW.txt)：固定交接文字。

## 入庫標準

完整角色包必須同時滿足：

1. **模型**：GLB 2.0，骨架、skin 權重及 PNG 貼圖／材質依賴齊全；數值有限、資料範圍與關節索引合法，模型採 GGD `model@1` 的比例／朝向資料。
2. **動作**：由同一個 GLB 的 skin／node 實際綁定；`idle / run / attack / cast / hurt / death` 各自對應存在的動作，禁止以待機假充受擊；不要求把所有來源硬改成同一套骨骼名稱。
3. **特效**：原生 EFC／FX 必須轉為 GGD `vfx@1`／`ribbon@1` 及 `vfx-script@1`，貼圖齊全；動作 pulse、掛點、觸發事件及 VFX 引用均須可解析。無法轉換的段落留在 staging，不靜默丟棄。
4. **驗證與追溯**：通過 GGD 真實 schema、模型結構、動作與依賴檢查，保留來源、雜湊、schema 指紋與驗證報告。

可重用特效元件採獨立 `vfx-library` 類型，只要求自身特效與貼圖完整。完整角色包不能藉這個類型繞過模型與動作門檻。

「已標準化」表示格式、綁定和依賴通過資源檢查；正式遊戲發布、逐動作畫面驗收、原作外觀忠實度與效能仍是後續使用工作流的驗收項目。

## 操作

在本目錄執行：

```sh
# 正式資源，預設永不混入原生候選
python3 query.py
python3 query.py fire --kind vfx

# 明確查看待處理角色
python3 query.py 莉娜 --pending

# 先檢查，再由工具正式入庫；失敗不更新 catalog.json
python3 tools/admit.py staging/資源名稱 --check-only
python3 tools/admit.py staging/資源名稱

# 建立共享版本並發布到固定 S3；保留本機副本，不刪遠端物件
python3 tools/publish_s3.py --publish

# 刷新目前已整理的來源索引，並重建 GGD 特效待入庫資料
python3 tools/prepare_existing.py
```

查詢會核對已入庫檔案的 SHA-256；缺件或被修改的資源不會出現在正式結果中。`resource.json` 是本資源庫的工作流旁檔，裡面的 `content/` 沿用 GGD schema，不是另造一種 GGD 遊戲匯入格式。

目前 schema 來源為同工作區的 `GGD-community-hero-forge`，指紋記於每份 validation.json。工具只讀取該 repo；沒有修改遊戲／編輯器程式或投稿；S3 發布只包含本資源庫的標準化成品。

備份區：`s3://ggd-390630837668-ap-east-2-an/legacy/ggd-asset-library/`，僅供備份及人工明確許可的特殊用途；禁止其他程序自動取用，不納入正式索引或下載包。規則與還原說明見 [BACKUP_README.md](BACKUP_README.md)。
