# [一般][chore] 第一批與第二批各37名英雄：完整材料交付 Main 驗收

## Objective
將兩批合計74名英雄的產生器、技能／機制／VFX設定、正式作品、半成品及歷史產物集中定址，補齊未提交材料，供 Main 審查既有 PR 並依 CI／review 結果合併。

## Scope
第一批沿用 PR #1135（現已推送9a7583e0e）與原設計缺口 #1132；第二批沿用 PR #1144 與 #1142。本票只追蹤兩批完整材料交接，不重開原機制缺陷，也不因材料交付而關閉它們。額外提供可複製的基底／微調模型驗證工作流指令。

## Files / modules likely affected
- tools/community-hero-forge/、materials/community-hero-forge/、packages/shared/src/content/heroForge/communityRefinements/：第一批既有來源（PR #1135）。
- tools/editor-acceptance/batch2-37/、docs/_reports/hero-validation-batch2-37/：第二批已驗版本（PR #1144）。
- tools/hero74-handoff/、materials/hero74-handoff/、docs/_reports/hero74-handoff/：完整清單、補漏快照、封存與驗證指引。

## Implementation constraints
Owner已確認：程式、設定、文件全部進Git；大型產物保留S3，提交完整索引與還原方式。只使用既有核准bucket/profile的新內容定址位置；不改IAM、不覆寫舊物件。保留其他工作樹的進行中修改；未完成程式以固定SHA快照／patch交付，不冒充已驗可執行變更。排除依賴、快取、憑證和無關訓練權重；必要去識別明列。

## Acceptance criteria
- [ ] 兩批各37名、各222槽有明確版本／來源入口，原稿與已修訂作品分開。
- [ ] 相關產生器、可維護設定與文件在Git可取得，未完成來源明列狀態。
- [ ] 大型成品／半成品／歷史產物逐檔有SHA及S3固定定位；新增封存實際上傳並重新下載還原驗證。
- [ ] 盤點來源與Git／S3交付無未解釋漏項，保留原有工作樹修改。
- [ ] 模型驗證交接說明公開輸入隔離、第一次／修復後成功率、真實行為與等效設計審查，禁止教師答案洩漏及訓練。
- [ ] commit + push並更新既有PR；Main依來源依賴、CI及review決定合併，不宣稱74名已完整上場。

## Test / verification criteria
逐檔雜湊與git blob核對、S3下載還原、第二批現有receipt-only檢查，以及推送前三項skills/editor-release/coord一起執行。新票與既有PR均記錄實際退出碼，不把舊收據重標成新驗收。模型接收／評分器尚需由驗證工作流接上；本次不執行模型訓練或評分。

## [思考策略]
先查本機及遠端版本 → 檔案逐項對帳 → 補遺漏來源與大型產物 → 凍結與還原驗證 → 交Main按既有PR驗收。

## [解決模板]
以英雄分組的來源清單＋Git固定提交＋S3內容定址封存＋逐檔SHA核對。沿用兩批自己的生成／測試入口，不混用兩套引擎版本或驗收資格。

## Dependencies / Non-goals / Known risks
依賴PR #1135、#1144及既有S3讀寫權限。非目標：繼續補第一批所有原設計、擴充引擎、訓練模型、正式部署或直接合併main。第二批目前離線參考37/37，完整遊戲上場與嚴格盲測0/37；第一批仍有原設計缺口。此票的完成只代表材料完整交付。
