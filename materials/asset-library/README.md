# GGD 素材庫共編入口

**其他工作流先讀這一份。** 共用 repo 是 `adms/GGD`；目前變更在 `codex/hero-model-library-options` 分支，[PR #1152](https://github.com/adms/GGD/pull/1152)。PR 未合併前，不要把 `main` 當成已有這批素材設定。

## 先選你要做的事

| 我要做什麼 | 直接入口 |
|---|---|
| 看全部角色、預設模型、候選來源 | [全角色模型盤點.md](../hero-model-library/全角色模型盤點.md) |
| 避免重複購買已取得免費模型的角色 | 先看同份盤點最前面的「已取得免費來源：先暫緩購買」；機器讀 `download-sources.json → publicSources` 與盤點 `purchaseHold` |
| 看使用者給的付費下載清單與改造要求 | 同份盤點最前面的「指定下載來源與購買順位」 |
| 查單一角色、取得 modelKey 與 S3 檔案位置 | 下方的 `query.py`；程序加 `--json` |
| 把本版模型補進自己的 GGD checkout | 下方的 `sync.py` |
| 修改角色配對、下載來源、獨立副本需求 | 下方「共編改哪個檔」 |
| 查原生解析器、舊轉換流程 | [DEPENDENCIES.md](DEPENDENCIES.md) 與 `source/`；這些不是成品取用入口 |

## 查詢：只要 Git 與 Python 3

以下指令都在 **GGD repo 根目錄**執行。查詢不連 S3、不需要這台 Mac 的 `outputs/` 或 `GGD-Asset-Library/`。

```sh
git fetch origin codex/hero-model-library-options
# 在含該分支變更的 checkout 執行：
python3 tools/hero-model-library/query.py 莉娜
python3 tools/hero-model-library/query.py b2-popp --json
python3 tools/hero-model-library/query.py 拳四郎 --downloads
```

需要哪一個版本，就讓工作流使用同一 Git commit 的設定與 `release.json`。查詢輸出分開列出「素材庫預設」「本分支實際選擇」「正式機觀測快照」，避免把候選或 S3 上傳當成正式站已部署。

## 模型怎麼拿

```sh
# 優先使用已在本機的正確檔案；缺檔才從 Git 固定的 S3 版本下載。
python3 tools/hero-model-library/sync.py
python3 tools/hero-model-library/sync.py --verify-only
```

成品位置：`s3://ggd-390630837668-ap-east-2-an/GGD-Asset-Library/`。本版精確版本、每個模型路徑及 SHA-256 由 [release.json](../hero-model-library/release.json) 與 [manifest.json](../hero-model-library/manifest.json) 固定。共享 VFX／完整成品包的下載方法見 [共享下載說明](source/SHARED_README.md)。

AWS 僅使用 `vibe-coding`、`ap-east-2`。不索取或讀取憑證，不換 profile；AccessDenied 回報原 action/resource。`legacy/` 是備份，不能自動取用。二進位放 S3，程式、設定、清單、SHA 與文件放 Git，本機副本保留。

## 預設與付費下載規則

- **已有可用 300英雄模型：預設選 300，付費來源暫緩。** 相似加工替身僅限使用者核准的 11 組（含原創 pink-round 卡比），詳見 `default-policy.json`；其他相似模型只留候選。
- 缺可用 300 模型：使用者清單是最高優先下載來源；原「加購替換」分類與改造備註保留。
- 可用模型順位仍為 **300 > MBA > 原版 > 借用 W3X**。未取得／未轉換來源不進預設。
- 既有後台手動選擇另有記錄；切回依順位自動選用才套用素材庫預設。

## 共編改哪個檔

| 要改的內容 | 編輯來源 | 重建／生效方式 |
|---|---|---|
| 使用者提供的網址、角色對應、改造備註、取得狀態 | [download-sources.json](../hero-model-library/download-sources.json) | 重建盤點；是否暫緩付費由現有可用 300 模型自動判斷 |
| 新預設可用範圍 | [default-policy.json](../hero-model-library/default-policy.json) | 只核准指定 11 組加工替身；角色 ID、modelKey 與 SHA-256 固定，其他相似模型不自動採用 |
| 第二批 37 名與舊英雄的新模型配對 | [pairing-inputs.json](../hero-model-library/pairing-inputs.json) | `assemble.py` 與盤點讀同一份來源；新增成品仍須經轉換、入庫、發布 |
| 11 個獨立副本的來源、改色與手持配件要求 | [derivatives.json](../hero-model-library/derivatives.json) | 轉換工作流重建副本、驗證、再發布；改 JSON 不等於模型已改好 |
| 第一批 37 名角色的原稿設定 | [recipes](../community-hero-forge/recipes/) 與 [模型配對](../../tools/community-hero-forge/library-bodies/community37.bindings.json) | 同步原稿與模型產生流程 |
| 正式機實際觀測結果 | [inventory-context.json](../hero-model-library/inventory-context.json) | 取得真實新快照才更新，不把文件生成時間當作部署時間 |

`manifest.json`、`release.json`、`inventory.json`、`全角色模型盤點.md` 是發布或盤點產物。不要只改產物掩蓋來源差異；模型成品用既有 `assemble.py → register.mts → 入庫／S3 發布 → pin-release.py` 流程。轉換流程仍需要原始素材與本機轉換收據，並不宣稱 clone 即可重新製作所有模型。

公開模型、MOD、魔獸自訂地圖的新增取得記錄統一放在 `download-sources.json → publicSources`。`acquisitionStatus=downloaded-verified` 只證明已取得並驗證檔案；`purchaseDecision=hold-purchase-review-free-source` 表示先暫緩購買，待檢查免費來源。每個角色的 `publicCandidates` 及下載安排的 `purchaseHoldFor` 都會由盤點產生器同步更新。**購買流程須逐一比對 `purchaseHoldFor` 的角色 ID**；`purchaseHold=true` 代表整組形態都暫緩，`partialPurchaseHold=true` 代表只有部分形態暫緩。例如一般小傑取得候選，不等於變身後大傑已取得。這批候選還未加入成品 release，不可自動從 `legacy/` 上架。

原始包、解包檔、骨架／材質大型解析 JSON 與未驗收 GLB 保存於本機 intake 與 S3 `legacy/public-model-sources/`；Git 的 `public-source-files.json` 記逐檔 SHA-256 與備份包位置。人工取得原始檔後可用 `tools/hero-model-library/extract_public_sources.py <單一來源 intake 目錄>` 解析，依同目錄 `public-source-requirements.txt` 安裝獨立 Python 環境；W3X 另需本機 StormLib。此工具靜態讀取 MOD 的 DLL 資源，不執行 MOD。

清單角色尚未對應 GGD ID、但已取得模型時，用來源的 `ownerEntryIds` 明確連結原清單組；盤點的 `purchaseHoldWithoutHeroId=true` 與 `purchaseHold=true` 表示該組也先暫緩購買，不因缺少 ID 而重買。地圖來源的 `characters` 記模型路徑、單位參照、骨架與動畫數，避免把整張地圖當作每個角色都已取得。地圖解析器沿單位／技能、腳本及 MDX 貼圖／附加模型的實際引用讀檔；`map-reference-extraction.json` 保留未解出的引用，不宣稱已取得未被引用的全部封包成員。

Steam 來源僅在 [Valve 官方公開 API](https://partner.steamgames.com/doc/webapi/ISteamRemoteStorage#GetPublishedFileDetails) 回傳可用公開 `file_url` 時直接取得；沒有回傳就保留未取得狀態。GMA／Steam LZMA 包使用同一解析器，檢查路徑、解壓大小及每個成員的 CRC32，不執行附帶的 Lua。Source MDL、VVD、VTX 與材質仍須另行轉換，不把解包成功當成成品可用。

每批收尾必做：

```sh
python3 tools/hero-model-library/inventory.py
python3 tools/hero-model-library/inventory.py --check
python3 tools/hero-model-library/check-index.py
# 指定這台 Mac 的工作區時，才同時更新兩份本機 Markdown 副本：
python3 tools/hero-model-library/inventory.py --workspace ..
```

同批提交來源 JSON、盤點 JSON／Markdown、驗證與版本清單，commit＋push 到同一個 PR，保留別人的修改。其他工作流共編時先 fetch；遇到同檔衝突，合併來源後重建盤點，不覆蓋對方整份檔案。
