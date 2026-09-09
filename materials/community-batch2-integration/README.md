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
