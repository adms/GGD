# GGD 素材庫共編入口

**第一守則：所有取得資源完整歸檔，全部納入後台可選選項。** 模型、貼圖、骨架、動作、特效與音效全部保留；各來源／版本完成標準化後，登記為對應角色下拉選單的獨立選項。取得、備份或登記候選尚不算完成，必須完成後台實際切換驗證。預設順位只決定預選項目，不能省略其他來源。完整規則見 [全角色模型盤點.md](../hero-model-library/全角色模型盤點.md) 第一守則，機器讀 `download-sources.json → ingestionPolicy` 與逐來源 `backendIntegration`。

**其他工作流先讀這一份。** 共用 repo 是 `adms/GGD`；目前變更在 `codex/hero-model-library-options` 分支，[PR #1152](https://github.com/adms/GGD/pull/1152)。PR 未合併前，不要把 `main` 當成已有這批素材設定。

**免費與論壇付費來源全部保留。** 本工作流不執行付費購買；使用者另行授權的論壇付費工作流照其授權進行，取得的不同模型／版本都必須整合。機器同時讀 `purchasePolicy.scope` 與 `paidPurchaseAllowed=false`，不可據此取消其他工作流的授權。購買前核對已取得版本，避免重買。

## 先選你要做的事

| 我要做什麼 | 直接入口 |
|---|---|
| 看全部角色、預設模型、候選來源 | [全角色模型盤點.md](../hero-model-library/全角色模型盤點.md) |
| 避免重複購買模型 | 先讀 `purchasePolicy.scope`；`publicSources`／`paidSources` 是已取得的免費／付費來源，`publicSourceLeads` 是未取得線索 |
| 整合另一工作流付費取得的模型 | 同一 `download-sources.json` 的 `paidSources`；查詢回傳 `paidCandidates`，與免費來源一起保留整合 |
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
| 使用者提供的網址、角色對應、改造備註、取得狀態 | [download-sources.json](../hero-model-library/download-sources.json) | 重建盤點；付費先看 `purchasePolicy`，取得狀態與下載順位另行判斷 |
| 新預設可用範圍 | [default-policy.json](../hero-model-library/default-policy.json) | 只核准指定 11 組加工替身；角色 ID、modelKey 與 SHA-256 固定，其他相似模型不自動採用 |
| 第二批 37 名與舊英雄的新模型配對 | [pairing-inputs.json](../hero-model-library/pairing-inputs.json) | `assemble.py` 與盤點讀同一份來源；新增成品仍須經轉換、入庫、發布 |
| 11 個獨立副本的來源、改色與手持配件要求 | [derivatives.json](../hero-model-library/derivatives.json) | 轉換工作流重建副本、驗證、再發布；改 JSON 不等於模型已改好 |
| 第一批 37 名角色的原稿設定 | [recipes](../community-hero-forge/recipes/) 與 [模型配對](../../tools/community-hero-forge/library-bodies/community37.bindings.json) | 同步原稿與模型產生流程 |
| 正式機實際觀測結果 | [inventory-context.json](../hero-model-library/inventory-context.json) | 取得真實新快照才更新，不把文件生成時間當作部署時間 |

`manifest.json`、`release.json`、`inventory.json`、`全角色模型盤點.md` 是發布或盤點產物。不要只改產物掩蓋來源差異；模型成品用既有 `assemble.py → register.mts → 入庫／S3 發布 → pin-release.py` 流程。轉換流程仍需要原始素材與本機轉換收據，並不宣稱 clone 即可重新製作所有模型。

免費公開模型、MOD、魔獸自訂地圖的取得記錄放 `download-sources.json → publicSources`；論壇付費工作流的已取得記錄放同檔 `paidSources`，使用相同來源 ID、原始網址、角色／形態、檔案 SHA、本機／S3 位置、`readiness` 與 `backendIntegration` 欄位。`paidSources` 只放有實檔收據的交付，不以付款、網址或下載計畫代替。`acquisitionStatus=downloaded-verified` 只證明已取得並驗證檔案；`purchaseDecision=hold-purchase-review-free-source` 表示先暫緩購買，待檢查免費來源。每個角色的 `publicCandidates`、`paidCandidates` 及下載安排的 `purchaseHoldFor` 都會由盤點產生器同步更新。**購買流程須逐一比對 `purchaseHoldFor` 的角色 ID**；`purchaseHold=true` 代表整組形態已有實檔，`partialPurchaseHold=true` 代表只有部分形態已有實檔；先核對版本以避免重買，不取消另行授權的付費工作流。例如一般小傑取得候選，不等於變身後大傑已取得。這批候選還未加入成品 release，不可自動從 `legacy/` 上架。

付費工作流交付時，照以下順序接入同一套來源索引：

1. 將每個附件／版本追加至 `paidSources`，使用全庫唯一的 `id`；保留論壇帖網址、作者、版本、精確角色／形態 ID、原檔 SHA-256、來源使用條件與交付位置。同一角色的新版本不得覆蓋舊來源，也不得移除 `publicSources` 的候選。
2. 完整原包與解包檔放本機及 S3 `legacy/paid-model-sources/<來源 ID>/<包 SHA-256>.zip`。備份逐檔紀錄統一追加至 `public-source-files.json`（沿用檔名，免費／付費共用），未上傳列 `pendingUploads`，讀回驗證後才列 `sources`。
3. 每筆登記 `backendIntegration`：`required=true`、`state=pending-standardization`（未對應 ID 則 `pending-character-mapping`）、`heroIds`／`ownerEntryIds`、`release=null`、`selectionVerified=false`。缺少這項追蹤會讓盤點產生器失敗。完成轉換後依成品流程註冊獨立選項，補上成品版本與實際切換驗證收據；不可只改狀態字串就算完成。
4. 重建盤點後用 `query.py <角色 ID> --json` 確認 `paidCandidates` 與既有 `publicCandidates` 全部保留；再用 `--downloads --json` 核對來源、備份與未完成項目。來源、完整 SHA 清單及盤點一起 commit／push 到同一 PR。

登記來源後，使用 Python 3.10 以上執行 `python3 tools/hero-model-library/archive-intake.py <來源 ID> --workspace <工作區>`，會將整個 intake 的每個普通檔案封存、逐檔讀回驗證，產生完整 SHA 清單與 `pendingUploads`。工具依 `publicSources`／`paidSources` 決定 legacy 前綴，只產生本機備份、不連 AWS；上傳及 S3 讀回仍須另外完成。以 `query.py <來源 ID> --downloads --json` 可查尚未對應角色 ID、或不在原購買清單內的交付。

原始包、解包檔、骨架／材質大型解析 JSON 與未驗收 GLB 保存於本機 intake 與 S3 `legacy/public-model-sources/`；Git 的 `public-source-files.json` 記逐檔 SHA-256 與備份包位置。人工取得原始檔後可用 `tools/hero-model-library/extract_public_sources.py <單一來源 intake 目錄>` 解析，依同目錄 `public-source-requirements.txt` 安裝獨立 Python 環境；W3X 另需本機 StormLib。此工具靜態讀取 MOD 的 DLL 資源，不執行 MOD。

清單角色尚未對應 GGD ID、但已取得模型時，用來源的 `ownerEntryIds` 明確連結原清單組；盤點的 `purchaseHoldWithoutHeroId=true` 與 `purchaseHold=true` 表示該組也先暫緩購買，不因缺少 ID 而重買。地圖來源的 `characters` 記模型路徑、單位參照、骨架與動畫數，避免把整張地圖當作每個角色都已取得。地圖解析器沿單位／技能、腳本及 MDX 貼圖／附加模型的實際引用讀檔；`map-reference-extraction.json` 保留未解出的引用，不宣稱已取得未被引用的全部封包成員。

Steam 來源僅在 [Valve 官方公開 API](https://partner.steamgames.com/doc/webapi/ISteamRemoteStorage#GetPublishedFileDetails) 回傳可用公開 `file_url` 時直接取得；可用 `acquire_steam.py <工坊 ID> <intake 目錄>` 保留中繼資料與下載收據。沒有回傳就保留未取得狀態。GMA／Steam LZMA 包使用同一解析器，檢查路徑、解壓大小及每個成員的 CRC32，不執行附帶的 Lua。Source MDL、VVD、VTX 與材質仍須另行轉換，不把解包成功當成成品可用。

只找到來源頁時記在 `publicSourceLeads`，含角色／形態 ID、網址與未取得原因；盤點會列在「已找到來源頁，尚未取得檔案」，`query.py <角色> --downloads --json` 同時回傳整批 `purchasePolicy` 與該角色的線索。線索不得列入 `publicSources`、`publicCandidates` 或已取得的 `purchaseHoldFor`。

GTA 模型常見 DFF／TXD 與 RAR／7z 包。RAR／7z 解析使用系統 libarchive（macOS 內建），只寫出通過路徑與大小檢查的普通檔案；解出的網址文字檔仍只是線索。內嵌壓縮包的原路徑、SHA 與解包位置保留在 intake 的 `nested-archives.json`，不可只靠外層 ZIP 存在就認列模型。

DFF／TXD 原生解析使用 [DragonFF](https://github.com/Parik27/DragonFF) 的獨立 Python 模組，固定 commit `5a7c2f18d6ff9ac4e3424d552cfe404c931d039d`，不需 Blender。備妥該版本乾淨 checkout 後執行 `python3 tools/hero-model-library/inspect_renderware.py --dragonff <DragonFF checkout> <intake>`，另需 Pillow。輸出的頂點、蒙皮權重、綁定矩陣、骨架階層 JSON 與 PNG 貼圖放 S3 `legacy/`；`renderware-inspection.json` 保留逐檔成功／錯誤。DFF 蒙皮不等於附帶動作，IFP 缺席時不可宣稱動作已取得。

Source 2 VPK 使用 [ValveResourceFormat 20.0](https://github.com/ValveResourceFormat/ValveResourceFormat/releases/tag/20.0) 的 `Source2Viewer-CLI`。本批 `cli-macos-arm64.zip` SHA-256 為 `fa3fc51ab8ed8c96899a64cf8977c2c4810342605868f37044e85a412ff4e0cd`，與官方 release digest 相符。先用 `-i <VPK> --vpk_verify` 驗證，再用 `-i <VPK> -o <intake>/vpk-native` 完整解包；轉換用 `-i <VPK> -o <intake>/decompiled -d --threads 2 --gltf_export_format glb --gltf_export_animations --gltf_export_materials`。完整日誌、原生檔、GLB／PNG／MP3／VPCF 與 `source2-inspection.json` 一起歸檔。闇影包缺少共用 shader、mask、動畫圖及特效材質，GLB 結構驗證與音訊解碼通過仍不代表 GGD 後台已可選。

部分舊 DFF 在宣告的 Frame 擴充後附加零長度空記錄。解析器只在副本移除該空記錄並調整外層長度，保留原檔、解析副本 SHA 與逐處差異；不重建骨架或更改權重。副本不會再次當作新來源解析。

尚未上傳的備份列在 `public-source-files.json → pendingUploads` 與來源的 `pendingBackup`，其中 `plannedS3Uri` 只是目的地，`readbackVerified=false` 不可視為 S3 已有檔案。上傳並讀回 SHA 通過後，才改列已發布 `sources`／`backup`。購買暫緩與 S3 發布狀態分開判斷。

每批收尾必做：

```sh
python3 tools/hero-model-library/inventory.py
python3 tools/hero-model-library/inventory.py --check
python3 tools/hero-model-library/check-index.py
# 指定這台 Mac 的工作區時，才同時更新兩份本機 Markdown 副本：
python3 tools/hero-model-library/inventory.py --workspace ..
```

同批提交來源 JSON、盤點 JSON／Markdown、驗證與版本清單，commit＋push 到同一個 PR，保留別人的修改。其他工作流共編時先 fetch；遇到同檔衝突，合併來源後重建盤點，不覆蓋對方整份檔案。
