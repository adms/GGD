# 2026-09-07 重開機暫停交接

使用者說「我要暫停一下重新開機」。已停止本輪實作；等使用者恢復後接續。整體目標未完成，沒有發布或推送。

## 工作位置

- Repository：GGD-community-hero-forge（本文件所在 repository）。
- 分支：codex/community-hero-forge-integration。
- 最後已提交 HEAD：c3fc9418。本輪修改均已寫入磁碟，但尚未 commit；保留所有 dirty / untracked 檔，勿 reset 或 checkout 覆蓋。
- 本輪原始 logs、git status、tracked patch 已複製到 `reboot-state-20260907/`，不再只依賴可能被清除的 /private/tmp。
- 前輪整體進度：同目录 execution-state.md；共用 oncePerCast 已提交於 3a7a86fd。

## 本輪實作與實際證據

1. 新增通用模板 tpl-effect-sequence / tpl-event-passive，參數沿用正式 effect / hook schema；表單可編輯巢狀反轉增益，沒有放寬 HeroPlan 身分／效果覆寫限制。
2. `packages/shared/src/content/heroForge/communityRefinements/azazel.ts` 將阿薩謝爾六槽接入正式模板：有效施法最多一次集氣、三層回合資源、Q 0.4u 擊退、W 三波重查敵人、E 一次近身普攻免傷反擊、R 0.8 秒後支付最大 HP 3% 底線 1，再由投射物施加本施法者詛咒、EX 三層資格與同來源 R 反轉。保留所有 sourceDesign、角色名、原文及模型 provenance。
3. E 尚缺方向門檻與近身技能分類，闇人格影子未完成；R 使用虛空彈代理，EX 金光／上揚圖示／驚愕表情未完成。不得標記 M07/M10 整體或原作演出完成。
4. heroPackage 只對本英雄編譯後語意根中自行宣告的狀態允許無外部 status-effects 文件；未知狀態、偽造於未使用 template params 的宣告、缺失視覺依賴仍拒絕。
5. 新增單槽試玩資源 ready/empty 開關；僅補足已安裝且容量足夠的具名標記，明示不證明集氣。整套六槽場景不補資源。實際完整套件模擬已由 Q/W/R 自行集滿後完成 EX。
6. `tools/community-hero-forge/refine-azazel-handoff.mts` 已實際驗證 GLB 與動作後建立新資料夾：`../outputs/community-hero-asset-integration/handoff-azazel-refinement-v1`。37 英雄／222 槽，僅 32 號專案改配方；所有原始 sidecar 與其餘 36 專案逐位元不變，模型保留。
7. 真實 headless Editor 5201 的資料夾選擇器已匯入新版 37／222，畫面明示 37 名隨附模型綁定完成。已開啟阿薩謝爾並讀取 EX 巢狀效果控制項：AD/AP 均 0.1，來源 self/caster。尚未完成本輪 screenshot／重新開啟持久化驗收；最後 UI 在新匯入的阿薩謝爾。

## 檢查結果（有重疊，不相加）

- 模板／六槽／套件回歸：4 檔 58 項通過（azazel-kit-package-final.log）。
- 新增資源試玩後：阿薩謝爾 19 項通過，含實際完整套件六槽成功與空資源拒絕（azazel-scenario.log）。
- 最新 HeroSlotEditor／README：2 檔 6 項通過（azazel-ui-unit.log）。
- shared typecheck 最新 log 無診斷（azazel-shared-typecheck-v3.log）；恢復後確認／跑必要最終 typecheck。
- 初次三道門檻均失敗，原因已依序修正但**未重跑最終整批**：coord 是新 typecatalog 指紋；Editor 是 README coverage fingerprint；skills 是 consumeStatus/spendHealth 缺中文名。labels 已補 tools/skill-spec/curated.json；README 已更新；community packet fingerprint 已更新。
- 已跑 14 支登記產生器，後續 spec/bricks/typecat/docs:readme 再生成。真實 React form receipts 重生為 159 顆、158 可操作、1 既有不可用。恢復後檢查 receipts 與最後目錄 hash，必要時由 build-editor-form-receipts.mjs 生成，勿手改 receipts。
- tpl-dragon-serpent 的 clipTimeScale 舊 inert 註記與已存在 clip 相矛盾，移除後模板參數一致性通過。

## 恢復後下一步

1. 確認 git status／分支，讀本輪新碼與報告；不要重做已成功匯入或把整體目標宣稱完成。
2. 視覺驗收單槽資源 checkbox（有資源可施放，關閉後 no-resource）、巢狀 AD 微調再還原、P oncePerCast，保存真正 screenshots；保留原文與代理標記。需要重新啟動本機服務。
3. 補共用單槽資源預置容量／缺失拒絕測試若最終 review 有缺，執行最終必要 shared/editor 檢查；三門檻同時重跑。舊 skills 常見後段 2026-09-06 message-ledger 未對票，不能當成新產品回歸。
4. 完成本輪 report／協作 packet claim（引用本輪新 commit，不能拿舊 commit 冒充），精準 stage／本機 commit，不推送。
5. 繼續 E 防守方向／技能分類、專屬視覺與音效、其餘 36 名 requiredRefinement，最後依當下服務重建 ZIP 並送審。不得以代理效果、基本編譯或檔案存在宣稱全部完成。

## 本機服務與授權

- 最新 Content API 已重啟：8805，啟動 `pnpm exec tsx /private/tmp/ggd-model-versions-acceptance/server.mjs`；服務使用該 tmp 下 content，已複製三個模板與 _index。其程式目前：buildServer(contentDir=/private/tmp/ggd-model-versions-acceptance/content, repoRoot=cwd, backupDir=/private/tmp/ggd-model-versions-acceptance/backups, watch=false, logger=false, editorOrigins=[http://127.0.0.1:60802])，listen 127.0.0.1:8805。重開後須確認 tmp 還在，必要時用隔離副本重建；不可改正式目錄。
- Editor 5201（舊 session 50447），headless Chrome CDP 9235（舊 profile /private/tmp/ggd-library-model-headless-profile）；重新開機後 session id 都不可再使用。
- CDP helper 已提交：docs/_reports/community-hero-forge/cast-credit/ui/cdp.mjs。
- Main importer 8801 仍是舊版本，完成 ZIP 前須重新確認並重啟到當下 schema；不可用舊服務通過冒充新版本。
- Main 只審查合併，使用者已授權我們做全部實作與本機隔離送審發布驗收。遠端 git@github.com:adms/GGD.git push 仍待前次目的地授權，曾遭 auto-review 拒絕；不要重試或反覆追問。
- 使用者接受沒有原模型時相近風格代理，須保留實際素材身分、來源與 rollback；不等於接受把原作技能演出未完成寫成完成。
