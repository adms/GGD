[重要][fix] PR #1112：整合戰鬥結算、平台版本與正式英雄發布流程

> 已發布為 [#1115](https://github.com/adms/GGD/issues/1115)。以下為建立時票文；後續狀態以 GitHub 為準。

## Objective

PR #1112 目前 GitHub mergeable 為 CONFLICTING，阻擋 37 名英雄進入相容的正式服務。由 Main 整合 PR #1112，保留 Main 現有戰鬥／平台功能與社群完整英雄版本流程，讓 37 名英雄、222 槽能在同一相容服務完成 Editor 投稿、管理員核准、一般正式選角與獨立回復。解衝突不是正式上線完成；正式部署後還需依當時目標重建 ZIP 並投稿／審核發布。

完整方案：[M01–M11 與 G1–G7](https://github.com/adms/GGD/blob/e916757d2b3902d66328ac0738636b64bcd1214c/docs/_reports/community-hero-forge/merge-integration/README.md)；[逐路徑衝突證據](https://github.com/adms/GGD/blob/e916757d2b3902d66328ac0738636b64bcd1214c/docs/_reports/community-hero-forge/merge-integration/conflicts.json)。兩者均已提交並推送至 [PR #1112](https://github.com/adms/GGD/pull/1112)。

## Scope

- M01–M05：法術護盾、提交時固定效果、castInstance、阿薩謝爾同施法者反轉、facing／form、模板參數與英雄正規化共存。
- M06–M09：熱更新與每房版本一致；核准完整英雄進普通正式房；耐久歷史／單英雄回復；100／200／50 投稿政策及嚴格跨語言設定相容。
- M10–M11：一個 Editor 草稿保存／恢復入口；保留 raw input 與模型；保留 Main 動態視覺報告與機器證據新鮮度，不將 partial 變成完整驗收。
- 來源先整合，再經既有產生器統一重建，固定整合版本同批驗證。

## Files / modules likely affected

- `packages/shared/src/sim/abilities/abilitySystem.ts`、`packages/shared/src/sim/systems/CastResolveSystem.ts`、`packages/shared/src/sim/castabilityVerdict.ts`。
- `packages/shared/src/content/schema/condition.ts`、`packages/shared/src/content/schema/template.ts`、`packages/shared/src/content/registries.ts`、`packages/shared/src/content/championRuntimeResolver.ts`，以及 generator／package 呼叫點。
- `apps/game-server/src/index.ts`、`apps/game-server/src/rooms/MatchRoom.ts`、`apps/game-server/src/content/communityRuntime.ts`；Main 新增 contentHotApply 與 communityContent 模組。
- `apps/platform/internal/contentoverlay/handlers.go`、`apps/platform/internal/contentoverlay/versions.go`、`apps/platform/internal/submissions/submissions.go`、`apps/platform/internal/server/hero_policy.go`、`apps/platform/internal/submissions/hero_intake.go`。
- `apps/editor/src/views/EditorView.tsx`、`apps/editor/src/forge/ConditionEditor.tsx`、`apps/editor/src/drafts`、Main autosave；Admin authoring／ugc forms。
- `content/config/ugc.json`、`tools/skill-forge`、受影響生成來源／產物、既有目標與 coordination packet。完整衝突路徑以清單為準，沒有標記的相依端也必須核對。

## Implementation constraints

- 以目前原始碼基準的 61 個衝突為已知起點，Main 接手重新固定 SHA。不能整檔 ours／theirs；不能只修標記，不核對相依呼叫點。
- 施法 guard 不能丟失。正常效果上下文同時保留 castInstance／castCommitTick；吟唱 effects 不二次增幅。依 Main 整發攔截合約，被護盾拒絕不執行 spendHealth 效果，魔力／冷卻仍不退；交會情境以實際迴歸測試固定。
- hero_policy.go 的嚴格 decoder 必須承認合併後合法 publishMode／communityRoomOnly，不能停用 DisallowUnknownFields。真實合併配置需走 TS 與 Go 消費端。
- 第二個住處：UGC 權威是 content/config/ugc.json 與 durable overlay；shared schema／預設、Admin 顯示及 Go bounds 為需對帳的鏡像。消費端為 server/hero_policy.go、submissions/hero_intake.go、一般素材 policy 與房間發布設定。保留每日新候選 100／認證 200／待審 50，重試不重扣。
- 英雄、模板、生成器及模型使用固定版本與實體化依賴；先保存完整版本再 CAS 切換該英雄。任何失敗不得改其他英雄或抹掉歷史。
- Owner 已授權文件 commit 回主工作流；主工作流承接推送、查重開票及 PR／packet 更新，Main 執行整合與合併。保留其他工作樹未提交材料。`scripts/genguard.sh` 查來源，使用 `scripts/genrun.sh`／skills:sync，不手改生成產物。

[思考策略] 兩個名詞的關係（relation-not-noun）＋值只有一個住處（single-home）：檢查戰鬥機制、政策格式、房間快照彼此相容，而非各自單測通過。前例：`apps/platform/internal/server/orphan_route_test.go`、`content/ability-templates/tpl-beam-roll.json`。

[解決模板] 承重守衛+突變（load-bearing-guard）＋產生器+--check 閘（generator-check-gate）：既有 `.test.ts` 與 Go 測試補真正交會案例，短暫移除 guard／castInstance 讓相關斷言變紅再恢復；來源先修，再進既有 skills:sync／skills:check 鏈，生成檔逐位元組 --check，不加時鐘欄位或放寬摘要。前例：`apps/client/src/render/modelFxWireContract.test.ts`、`tools/skill-lists/gen.mjs`。

## Acceptance criteria

- [ ] 本票連回 PR／coordination packet；整合文件已於 e916757d2 推送，既有目標及 packet 已改為 Main 整合。
- [ ] Main 新護盾／連段固定／form／變身出身與社群能量／生命支付／facing 同時正確；雙施法入口均覆蓋。
- [ ] 阿薩謝爾 THE END OF SON 的同來源 R→EX 消耗三層及自己的詛咒、敵方 AD/AP +10% 2 秒且不執行普通 EX 傷害；異來源、淨化／過期與無資源反例通過。
- [ ] 合併後實際 ugc 配置可解碼；100／200／50、認證撤銷、並發及重試語意正確；舊入口不能覆寫他人／完整英雄。
- [ ] 已核准完整英雄可在普通房選用，不要求社群房旗標；未核准／下架／不相容版本不混入。
- [ ] A 舊房在發布／回復期間仍用舊版本，B 新房使用完整相容新版本；whitelist、context、contentVersion、replay pins 同世代。
- [ ] 已上架與未上架英雄都能查看／回復版本；恢復 A 不修改 B、共用來源或其他上架狀態；模板／生成器／模型依賴完整。
- [ ] 37／222 的指定名稱、完整原文、requiredRefinement、模型動作載荷、固定版本與舊快照核對完整；代理素材仍明示差異。
- [ ] 同版服務完成建包→投稿→核准→一般選角／模型→持續對局→重連→結算／回放；不混用舊隔離收據。
- [ ] 必要閘與 Main 審查通過，文件列明實測／沿用／未完成；正式部署後依當時目標重建 ZIP 並附正式發布收據。

## Test / verification criteria

採 README G1–G7，一次固定整合提交與服務版本，集中跑 targeted TS／Go、37 份 audit、必要 UI／E2E 與三項 repo 閘。原始 log 保留指令、退出碼、版本與 digest。

重用 `packages/shared/src/sim/effects/oncePerCast.test.ts`、`packages/shared/src/sim/effects/spendHealth.test.ts`、`packages/shared/src/content/heroForge/communityRefinements/azazel.test.ts`、`apps/game-server/src/content/communityRuntimeCache.test.ts`、`apps/platform/internal/contentoverlay/versions_durability_test.go`；再加 Main 護盾、comboWindow、conditionForm、transformInheritsOrigin、contentHotApply 與真 ugc route 測試。不能只跑一側。

關鍵斷言：被攔截不產生命中與生命支付、一次施法多波只得一次能量、restore A 前後 B digest 完全相同、主配置讀入不報 policy unavailable、A 房固定版本不變。突變只在隔離測試工作樹進行並恢復來源。

`pnpm skills:check`、`pnpm editor:accept:release`、`pnpm coord:check` 同批留證。舊訊息帳本失敗按真實訊息／既有票修正，不捏造票號。失敗後只重跑失敗／受影響項；未變畫面經等價比較後明示沿用，不重拍 37 名全部技能。

## Dependencies

- PR #1112；本文件 pinned Main `4e11f1b0253c106e08a0e873e289f8822e32681d`（2026-09-08 遠端已前進至 `631dd1048f9b5150d361c180692125929f0be7c0`，61 僅是 pinned 診斷，接手重算）、社群程式評估 `4e682a7e865c8c239a741ca20a2ea47299a1fffe`、文件基準 `9acf806c5658c5ec6515690bf811e0c660f2b213`，接手時刷新。
- 2026-09-08 遠端查核：#991／#993／#1024 為 OPEN，其餘引用 #986、#992、#1023、#1025、#1064、#1066、#1068、#1070、#1086、#1088、#1091、#1103 為 CLOSED。狀態不是覆蓋全部驗收的證據：#992／#1023 的最新進度仍列 Codex 剩餘範圍。
- 與 #991／#1024 的差別：它們是 UGC／英雄包原功能；本票只承接已存在兩條實作在 PR #1112 的整合、相容性與集中發布驗收，不另重做功能。與已關 #1025 的差別：保留其熱更新與舊房固定版本，按新的完整英雄規則讓核准英雄進普通正式房；尚未證明既有實作回歸，故不重開。#1086／#1091 的連段及護盾同樣是合併必保留的已落地功能。
- 已查 open／closed 並讀最新進度：`1112`／`community-hero-forge` 全文查詢無命中；ticket-similar 標題查詢 `合併 衝突` 無命中，全文廣搜另命中無關歷史票與 #838／#1106 等編輯器票；第二組 `CastResolveSystem`／`contentoverlay` 命中既有機制或 UGC 票，逐張核對後未找到承接此 PR 跨分支整合的票。未將早先連線失敗算成查重成功。
- [材料提交 aa24208cc](https://github.com/adms/GGD/blob/aa24208cc72a362b09281e686db58f97895db41f/materials/community-hero-forge/README.md) 已推送並核對 GitHub tree／blob：36,115 檔、34 分段、37 ZIP／222 槽與 146 份實際素材。還原與套件契約證據在該目錄；本輪文件交接沿用該材料驗證，不重跑大型還原。

## Non-goals

不新增角色模板功能、不追求全部原作美術還原、不重拍內容未變的所有畫面、不要求 A17 Pro 實機驗證、不阻塞於桌面跨平台簽署／歷史 Python 環境。草稿文件階段不修改戰鬥或平台程式，也不部署正式站。

## Known risks

目前 coord:check 在 origin/main=4e11f1b0 時有 8 份歷史 packet 指紋不符，本次社群 packet 通過；不可批次重寫歷史指紋或宣稱整體通過。61 個文字衝突之外已確認 strict decoder／新配置不相容；房間 context 與熱更新時序是語意整合風險。全套測試未在整合版本跑過，不能宣稱產品已回歸或已修復。既有對局快照異常若再現且影響遊玩才擋住 G5，未重現記錄限制而非宣稱根因已修。

本次牽涉完整服務建置，不能只 content-only 部署。回復需保留舊相容服務、資料備份、不可變套件與素材；舊對局繼續固定版本，新存儲格式不可未經相容驗證交給舊 binary。保留失败與歷史證據，不刪資料強行 rollback。
