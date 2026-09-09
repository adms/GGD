# 第二批 37 名社群英雄整合

沿用 [PR #1144](https://github.com/adms/GGD/pull/1144) 的 37 名／222 槽完整專案；`source-lock.json` 固定上游 commit、原始檔 SHA-256、角色名稱及現有模型。`projects/`、`decisions.json`、`identity-sources.json` 保留原始 bytes。模板、配方及生成器繼續以上游已版本化的 `tools/editor-acceptance/batch2-37/` 為來源，本整合不另造生成器或改技能。

Owner 本輪指示模型配對稍後統整；目前維持 36 個既有代理模型與如月原創電車。素材候選不會自動替換。只處理妨礙投稿的功能問題；不介入角色外觀、平衡與攝影微調。

目前已完成 **37 份服務重建／inspect、37 份隔離投稿／發布、37 份署名下載還原**。`receipts/publication-proof.json` 與服務收據逐名關聯。S3 的 37 份 ZIP 全部重新下載並核對 SHA-256；位置在 `s3/s3-location.json`。這是隔離工作流驗收，正式站尚未部署。

## 重跑

核對原始資料與提交收據：

```sh
node tools/community-hero-forge/check-batch2-integration.mjs \
  --service-proof materials/community-batch2-integration/receipts/service-proof.json \
  --publication-proof materials/community-batch2-integration/receipts/publication-proof.json
```

使用已授權的隔離帳號，將密碼放在程序環境 `GGD_LOCAL_PROOF_PASSWORD`，不要寫入 Git、命令列或 log。先啟動測試服務，再執行：

```sh
GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only node --import tsx tools/community-hero-forge/handoff-service-proof.mts \
  --projects-dir materials/community-batch2-integration/projects \
  --model-dir /absolute/path/to/batch2-37/assets \
  --platform-port 8098 --username model-author --out /private/tmp/new-batch2-build

GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only node --import tsx tools/community-hero-forge/publish-local.mts \
  --service-proof /private/tmp/new-batch2-build --output /private/tmp/new-batch2-publication \
  --platform-port 8099 --source-platform-port 8098 --author model-author --reviewer model-reviewer
```

同一服務上建置和發布可省略 `--source-platform-port`。不同隔離服務仍必須回傳完全相同的四項 target 指紋。輸出必須是新資料夾；重用草稿須明確加入 `--resume-identical-drafts`，且來源摘要完全相同。程式不會覆寫不同草稿、提升帳號權限或打開正式站。

模型資料夾只需原始如月 GLB，檔名是 `projects/b2-kisaragi.project.json` 的 `presentation.uploadedModel.sha256` 加 `.glb`；原始生成與驗證來源見上游 `assets.mjs`、`assets/kisaragi-tram.json`。內建模型由當下編譯服務解析，ZIP 保留引用的實際素材。

## 投稿政策與部署界線

本批 ZIP 約 3 MB；沿用舊的 256 KiB `config/ugc.maxBytes` 會讓內建模型英雄投稿回 HTTP 400。第二批隔離環境經既有管理員 API 設定為 schema 已支援的 **4 MiB**，每日 100、待審 50、自訂模型 32 MiB 均保留。正式開放此批時需檢查相同設定；不能把隔離設定當成正式設定已更新。

`receipts/` 記錄實際 target、來源摘要及環境；執行中的編譯服務為 `417abec9d90424b5ccbe7948331a60f98dd0f689`。本整合分支基於 main `256758741`。收據證明對該服務執行過操作，不宣稱已部署這個較新的 main，也不把收據核對當成重跑 SimWorld 或原作素材驗收。正式部署後仍以新服務的 target 重建 ZIP。

第一批沿 [PR #1135](https://github.com/adms/GGD/pull/1135) 交付。本批沿 [#1147](https://github.com/adms/GGD/issues/1147) 記錄投稿流程、[#1150](https://github.com/adms/GGD/issues/1150) 記錄整體部署；[#1148](https://github.com/adms/GGD/issues/1148) 的模型配對留待 Owner 統整。所有二進位 ZIP／模型按既定分工保存到 S3；Git 保存專案、腳本、政策、收據與 SHA-256。

## 提交檢查

Editor release 通過（592 項測試、型別檢查及 production build），coord 通過。三項合併執行的原始 log 與 exit code 保存在 `receipts/checks/`。`skills:check` 尚未全部通過：main 的戰情板缺今天帳本來源，另外 icon 計畫過期並提示缺本機 `data/curation/whitelist.json`。保留既有戰情板，避免重建時抹除 Owner 紀錄；由 Main 補齊來源與驗證環境後重跑。此 PR 保持 Draft，不能把隔離發布或 Editor 通過寫成正式部署已完成。

## 發布後的一般對局驗收

`tools/community-hero-forge/published-game-proof.mts` 重用第一批的一般房間驗收，直接讀本批已發布收據，不重新投稿或改角色。預定核對全部 37 個版本 pins，讓如月與貓貓兩個測試席位完成選角、實際 W 施法、斷線重連及一般結算；這個切片不宣稱 37 名逐招完整對戰或畫面驗收。

已啟動僅監聽本機的 `8099 → 2579` 測試服務，遊戲引擎及內容與投稿 target `417abec9` 的差異為零。**目前僅通過啟動與拒絕未明確 opt-in 的腳本檢查，登入／對局尚未執行**：自動核准審查兩次拒絕讀取既有隔離帳號密碼，已請 Owner 明確確認，沒有改用其他憑證途徑。收據見 `receipts/live-match-preflight.json`；這不是遊戲上場完成證據。

取得本機測試登入授權後，以既有環境變數提供 `GGD_LOCAL_PROOF_PASSWORD`（不放在命令列、Git 或 log），其餘設定如下；`GGD_LOCAL_PROOF_RUNTIME_ROOT` 必須指向與執行中 target 相同的引擎／內容工作樹，腳本會核對版本差異：

```sh
GGD_LOCAL_COMMUNITY_PROOF=disposable-local-only \
GGD_LOCAL_PROOF_RUNTIME_ROOT=/absolute/path/to/pinned-runtime \
GGD_LOCAL_PROOF_PLATFORM_PORT=8099 \
GGD_LOCAL_PROOF_PUBLICATIONS=materials/community-batch2-integration/receipts/publication-proof.json \
GGD_LOCAL_PROOF_HEROES=b2-kisaragi,b2-maomao \
GGD_LOCAL_PROOF_COMBAT=1 GGD_LOCAL_PROOF_FULL_MATCH=1 \
GGD_LOCAL_PROOF_REPORT=/private/tmp/new-batch2-match.json \
node --import tsx tools/community-hero-forge/published-game-proof.mts
```

報告必須使用新路徑，既有失敗會保留。完成完整對局後才能執行既有固定回放驗收；正式部署仍沿 Main 審查流程。

本次三項提交前檢查同批重跑：Editor release 與 coord 通過，skills 仍在既有 `board:check` 缺來源處失敗；原始紀錄另存 `receipts/live-match-checks/`，未覆寫上一輪結果。
