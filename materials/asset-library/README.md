# GGD 素材庫共編入口

**第一守則：所有取得資源完整歸檔，全部納入後台可選選項。** 模型、貼圖、骨架、動作、特效、音效與角色語音全部保留；各來源／版本完成標準化後，登記為對應角色下拉選單的獨立選項。取得、備份或登記候選尚不算完成，必須完成後台實際切換驗證。預設順位只決定預選項目，不能省略其他來源。完整規則見 [全角色模型盤點.md](../hero-model-library/全角色模型盤點.md) 第一守則，機器讀 `download-sources.json → ingestionPolicy` 與逐來源 `backendIntegration`。

先整庫／整包取得作儲備，按需配對與轉換；「儲備已取得」與「完成上架」分開記錄。擷取不依新舊角色、上架與否或既有 GGD ID 篩選；不同世代、平台、作品、版本與配色全部保留，尚無 GGD ID 者仍可按原生角色 ID 查詢。克勞德只是範例，不是限定收錄對象。

**第二守則：手動指定模型 > 原著模型 > MOD社群修改 > 相似模型貼圖修改 > 相似模型 > 300英雄 > MBA > 原版 > 借用 W3X 選用。** 原著模型只指原作遊戲直接擷取；300／MBA 維持第 6／7 位。來源類別保留，選用順位由 `default-policy.json` 與 `selectionClass` 決定。

同級合格候選按來源遊戲發售日由新到舊，未知日期排後；保留日期依據，不以網站上傳日或入庫日替代。手動選用仍優先，舊版全部留在下拉選單。

**第三守則：成品一律進 Git；半成品、原始來源、準備材料等進 S3；本機全部保留。** 固定入口：[current-resources.json](current-resources.json)，合併本次模型與舊成品來源；[git-release.json](git-release.json) 保留既有不可變模型／動作與 VFX 元件。原始與半成品仍在 S3 `legacy/`，不供程序自動取用。

**其他工作流先讀這一份。** 共用 repo 是 `adms/GGD`；目前變更在 `codex/hero-model-library-options` 分支，[PR #1152](https://github.com/adms/GGD/pull/1152)。PR 未合併前，不要把 `main` 當成已有這批素材設定。

**分工固定：來源工作流找檔、下載與交付；本工作流負責轉換驗收、版本合併、中央索引與 Git 分支推送；Main 審查合併及部署。** 已交付素材分批發布，不等待 KOF／其他遊戲整庫搜尋完成。

本次優先交付 **81 名（37＋37＋7）**：先讀 [81英雄優先合併清單](../hero-model-library/81英雄優先合併清單.md)，程序讀 [priority-81-handoff.json](../hero-model-library/priority-81-handoff.json)。逐角色列模型、動作、音訊檔案與尚缺項目；其他來源不阻擋此批審查。完整歷程保留於 [模型整合交付](../hero-model-library/priority-release.md)。

本次優先交付：先讀 [全角色模型盤點](../hero-model-library/全角色模型盤點.md)、[後台版本登記](../hero-model-library/priority-registration.json)、[其他工作流模型](../hero-model-library/workflow-model-options.json) 與 [新轉換成品](../hero-model-library/priority-runtime-options.json)。成品實檔在 `content/assets/models/`，舊不可變 release 保留；不要只讀舊 release 而漏掉本次選項。七名 LOL 日文音訊直接讀 [七名索引](../hero-model-library/lol-project-seven/seven-voice-index.json)，不再擴抓全人物。


**本機已驗證音訊可立即讀取，不等待 S3。** `query_voice.py <角色或來源群組> --files --json` 回傳逐檔 `absolutePath` 及 SHA-256；`voice-index.json.localWorkspace` 是本機工作區根目錄。S3 備份進度獨立追蹤，未上傳或未讀回不阻擋其他工作流聽審、轉錄及準備素材。

**免費與論壇付費來源全部保留。** 本工作流不執行付費購買；使用者另行授權的論壇付費工作流照其授權進行，取得的不同模型／版本都必須整合。機器同時讀 `purchasePolicy.scope` 與 `paidPurchaseAllowed=false`，不可據此取消其他工作流的授權。購買前核對已取得版本，避免重買。

## 先選你要做的事

| 我要做什麼 | 直接入口 |
|---|---|
| 看全部角色、預設模型、候選來源 | [全角色模型盤點.md](../hero-model-library/全角色模型盤點.md) |
| 找角色語音作合成／轉錄素材 | [角色語音索引.md](../hero-model-library/角色語音索引.md)；`voice-index.json`／`voice-files.jsonl.gz` 與 `query_voice.py` |
| 查未上架、尚無 GGD ID 或下載中的儲備 | `query.py --downloads <來源／原生角色>`；例如 `gitlab-ssbu-models` |
| 避免重複購買模型 | 先讀 `purchasePolicy.scope`；`publicSources`／`paidSources` 是已取得的免費／付費來源，`publicSourceLeads` 是未取得線索 |
| 整合另一工作流付費取得的模型 | 同一 `download-sources.json` 的 `paidSources`；查詢回傳 `paidCandidates`，與免費來源一起保留整合 |
| 看使用者給的付費下載清單與改造要求 | 同份盤點最前面的「指定下載來源與購買順位」 |
| 查單一角色、取得 modelKey 與 Git／S3 檔案位置 | 下方的 `query.py`；程序加 `--json` |
| 查 Windows Steam、模擬器與 ROM 來源庫 | [Windows 遊戲來源盤點](../hero-model-library/source-inventories/windows-game-library.md)；`python3 tools/hero-model-library/steam-library-bridge/query_windows_game_inventory.py <關鍵字>`；容器層徹查用 `scan_windows_asset_containers.ps1` |
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
python3 tools/hero-model-library/query.py --downloads gitlab-ssbu-models
python3 tools/hero-model-library/query_voice.py 莉娜
python3 tools/hero-model-library/query_voice.py mba:Chara02 --files --json
python3 tools/hero-model-library/steam-library-bridge/query_windows_game_inventory.py Palworld
python3 tools/hero-model-library/steam-library-bridge/query_windows_game_inventory.py 'Fate-Unlimited' --json
```

Windows 遊戲來源索引保存 Steam App ID／Build ID、ROM 平台候選、Windows 原始路徑與盤點狀態。它只證明來源機上存在安裝目錄或候選檔，不代表已擷取、轉換、驗收、登記、可切換或已部署。完整原始目錄掃描保留在本機 `GGD-Asset-Library/intake/remote-game-libraries/`，Git 只收正規化來源索引與重建／查詢程式。

獨立合格元件由 `current-resources.json → modelComponents` 查詢；`resourceRole=weapon-prop` 是武器元件，`resourceRole=independent-historical-model-body-component` 是從 Git 歷史復原、尚未綁定真實英雄 ID 的舊模型版本。兩者均以 `fullHeroModel=false`、`heroIds=[]` 防止被誤認成英雄下拉選項。來源 `download-sources.json → componentCandidates` 保留轉換、人工視覺核對、Git 路徑及補充備份關係；`query.py <角色或來源 ID> --candidates --json` 可連同未對應角色的元件一起查詢。達伊手持劍／背劍的重建入口是 `intake_dai_weapon_components.py`，先讀其 `--help`；必須有固定交付 SHA 與父整合驗收收據。

合併前的精確歷史位元組另由 `current-resources.json → historicalModelSourceArtifacts` 查詢。這些檔案保留原 Git 物件、SHA-256、正規化替換版與 S3 原始備份關係；`componentReady=false`，不能當成已驗收下拉選項。重建使用 `restore_historical_model_assets.py`，遇到同路徑但位元組不同時會停止，不覆蓋現有檔案。

七名 LOL 音訊中央來源為 `lol-project-seven-ja-jp-16.18.8159717`。`voice-index.json.summary` 的 `sourceFileRelationshipRows` 是來源關係數，`uniqueLocalPaths` 是不同本機路徑數，`uniqueSha256Payloads` 是不同內容數；同路徑在不同來源的關係均保留，不能相加當成新取得音訊。依 `voice-files.jsonl.gz` 的 `path` 相對 `voice-index.json.localWorkspace` 取得絕對路徑，再核對每列 `sha256`。

需要哪一個版本，就讓工作流使用同一 Git commit 的設定與 `release.json`。查詢輸出分開列出「素材庫預設」「本分支實際選擇」「正式機觀測快照」，避免把候選或 S3 上傳當成正式站已部署。

## 模型怎麼拿

```sh
# 從 checkout 內已提交的固定成品補齊執行目錄；不需下載原始素材。
python3 tools/hero-model-library/sync.py
python3 tools/hero-model-library/sync.py --verify-only
```

成品位置：`materials/asset-library/releases/<版本>/`，由 [git-release.json](git-release.json) 固定全部 150 個成品元件、432 個檔案與 SHA-256（目前版本）。模型路徑由 [manifest.json](../hero-model-library/manifest.json) 固定；[release.json](../hero-model-library/release.json) 仍保留既有 S3 副本位置。這些元件不等於完整英雄已上架。

AWS 僅使用 `vibe-coding`、`ap-east-2`。不索取或讀取憑證，不換 profile；AccessDenied 回報原 action/resource。`legacy/` 是備份，不能自動取用。儲存依第三守則按完成狀態區分；二進位成品也必須進 Git，S3 舊成品副本保留。

## 預設與付費下載規則

- 模型預設按第二守則。使用者指定的 11 組加工副本（含 pink-round 卡比）列為手動指定；其他未核准相似模型保留候選，不憑格式驗證自動核准。
- 缺可用 300 模型：使用者清單是最高優先下載來源；原「加購替換」分類與改造備註保留。
- 原作直接擷取、MOD 社群、改貼圖代理、相似代理按已核實來源分級；300／MBA 的本尊不改列原著。未取得／未轉換來源不進預設。
- 既有後台手動選擇另有記錄；切回依順位自動選用才套用素材庫預設。

## 共編改哪個檔

| 要改的內容 | 編輯來源 | 重建／生效方式 |
|---|---|---|
| 使用者提供的網址、角色對應、改造備註、取得狀態 | [download-sources.json](../hero-model-library/download-sources.json) | 重建盤點；付費先看 `purchasePolicy`，取得狀態與下載順位另行判斷 |
| 新預設可用範圍 | [default-policy.json](../hero-model-library/default-policy.json) | 九級預設順位與 11 組指定副本；模型來源 tier 與選用 selectionClass 分開，保留其他相似候選 |
| 第二批 37 名與舊英雄的新模型配對 | [pairing-inputs.json](../hero-model-library/pairing-inputs.json) | `assemble.py` 與盤點讀同一份來源；新增成品仍須經轉換、入庫、發布 |
| 11 個獨立副本的來源、改色與手持配件要求 | [derivatives.json](../hero-model-library/derivatives.json) | 轉換工作流重建副本、驗證、再發布；改 JSON 不等於模型已改好 |
| 第一批 37 名角色的原稿設定 | [recipes](../community-hero-forge/recipes/) 與 [模型配對](../../tools/community-hero-forge/library-bodies/community37.bindings.json) | 同步原稿與模型產生流程 |
| 正式機實際觀測結果 | [inventory-context.json](../hero-model-library/inventory-context.json) | `current-production.json` 為本次觀測；舊檔保留，不把文件生成時間當作部署時間 |

`manifest.json`、`release.json`、`inventory.json`、`全角色模型盤點.md` 是發布或盤點產物。不要只改產物掩蓋來源差異；模型成品用既有 `assemble.py → register.mts → 成品驗證／入庫 → Git 成品發布` 流程。轉換流程仍需要原始素材與本機轉換收據，並不宣稱 clone 即可重新製作所有模型。

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

查找管道包含 MOD、Steam／其他遊戲工作坊、遊戲資源論壇、社群論壇與作者公開倉庫／分享。各平行工作流使用獨立來源 ID 與 intake 目錄，交付保留作者、版本、原包、解包內容、來源條件與 SHA-256，再合併同一索引；不因管道或優先順位略過其他版本。

只找到來源頁時記在 `publicSourceLeads`，含角色／形態 ID、網址與未取得原因；盤點會列在「已找到來源頁，待取得的素材」，`query.py <角色> --downloads --json` 同時回傳整批 `purchasePolicy` 與該角色的線索。目錄內已驗證的部分交付另記 `publicSources`，剩餘部分保留線索；未取得者不得列入 `publicCandidates` 或已取得的 `purchaseHoldFor`。

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
# 成品加入 Git 暫存區後，驗證中央入口及元件的實際 Git blob；防止被 ignore 的本機檔漏交付。
python3 tools/hero-model-library/current_resource_index.py --check --check-git
# 指定這台 Mac 的工作區時，才同時更新兩份本機 Markdown 副本：
python3 tools/hero-model-library/inventory.py --workspace ..
```

同批提交全部成品、來源索引 JSON、盤點 JSON／Markdown、驗證與版本清單，commit＋push 到同一個 PR，保留別人的修改。其他工作流共編時先 fetch；遇到同檔衝突，合併來源後重建盤點，不覆蓋對方整份檔案。

固定成品從已驗證本機 release 納入 Git：`python3 tools/hero-model-library/pin-git-release.py --library <本機庫>`；用 `--check` 可只靠 Git 檔案逐檔驗證。此工具保留全部 `ready/` 元件、依賴與驗證收據，不納入原始／半成品，既有不同內容拒絕覆蓋。

語音與音效的取得、解碼、分類、事件／技能綁定分開記錄。利姆路新增 13 段浮點 WAV（23.672 秒）已與原始 BNK／WEM 一起在 S3 legacy 讀回驗證；其中 4 檔峰值超過 1，仍待聽審、增益與綁定，不計為已驗收語音成品。

語音逐檔索引以 voice-index.json.sourceFileManifest 為準；目前 Git 儲存完整 voice-files.jsonl.gz，query_voice.py 自動驗證及解壓，本機另保留未壓縮 JSONL。音樂、音效及含合成播報來源保留並標記 excludedFromSpeechInput，不直接混入角色語音輸入。
