# 37 英雄原設計修正（#1132）

原始 `recipes/*.upload-recipe.json` 保持逐位元組不變。此處的逐英雄 JSON 是版本化的微調設定，必須與同一 projectId、sourceSha256 配對。既有模板由 `pinHeroPlanTemplates` 固定版本並實體化；套用器建立新作品 revision，不修改共用模板或舊英雄版本。

前批有 6 槽局部修正：鹿目圓 W、庫洛魔法使 W 指定友軍或自己；吉伊卡哇 EX 給附近友軍及自己護盾、三秒抗恐懼；庫洛魔法使 PASSIVE 改為卡牌連結資源。指定盾的 castEffect 視覺改綁 target。庫洛魔法使四張卡牌的順序、三層連結與下一盾消耗已實作並通過 9 項行為測試；W 先消耗既有連結，再把此次盾牌記入下一段牌序。新增 #1139：EX 自身切換風／樹 Q，風 Q 傷害／推動、樹 Q 束縛；同一 Q 實例共用冷卻／魔力，風／樹分別記牌序，EX 本身不集氣，回合回復風牌。9 項換牌測試與兩個反例 mutation 通過；牌面／動態圖示、劍牌與翔牌呈現仍待補。鹿目圓希望資源仍未完成，不把盾的目標修好當成整槽機制完成。

`design-audit.json` 是這次實際 37 名／222 槽的原要求與編譯結果對照。28 名仍使用 tpl-on-attack 被動；沒有任何列因能編譯而自動標為原設計通過。這份資料不是發布清單。

執行 `pnpm exec node --import tsx tools/community-hero-forge/refine-design-handoff.mts --input <上次重建的37目錄> --output <新的交接目錄>` 產生可匯入 Editor 的 index、37 份 projects、原始 recipes 與已驗證模型。輸入每名目錄需有 after.hero-project.json 與 package.zip。程式拒絕覆寫既有輸出；可重新選用原先固定版本作 rollback。

行為驗證：`pnpm exec vitest run packages/shared/src/content/heroForge/communityRefinements/friendlyProtection.test.ts`。涵蓋 rank 1/4、敵人、超距、不扣消耗、自身、範圍友軍、恐懼到期、原文及來源隔離。後續仍須修正其餘 requiredRefinement、驗收畫面，再依當下服務重新建立 ZIP。不得用舊版隔離發布收據抵充修正後的驗收。

牌序回歸：`pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/cardLinks.test.ts`。包括重複卡不集氣、上限、0–3 層消耗、rank 1/4、不同施法者、非法目標及回合重置；兩個反例 mutation 均被檢出，見 `card-links-verification.json`。

可共用的實際作品與模型還原指令見 [材料入口](../README.md#最新可共用作品2026-09-09)；這次交接不只包含配方。換牌回歸：`pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/cardVariants.test.ts`。

#1140 新增御坂美琴 PASSIVE／Q／W／R／EX 五槽修正，合計 11 槽局部變更。技能實際扣血才取得電荷，不同技能最多三層；EX 消耗電荷，下一次 Q 擴大實際直線範圍或 W 增加一至三個目標。Q／R 每目標單次傷害，W 一條鏈逐跳去重，目標死亡可重選。16 項行為測試及共用連鎖／既有英雄回歸見 `electric-charge-verification.json`；交錯施法測試另使用既有 hitstop.scale=0 設定。原作硬幣模型／彈射動作、鐵砂破盾碎粒仍待补，不宣稱完整視覺驗收。

電荷回歸：`pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/electricCharge.test.ts src/sim/effects/chainLightning.test.ts --pool=threads --minWorkers=1 --maxWorkers=1`。`retargetOnLost` 預設保持中止；只有配方明確啟用才重選，保留舊內容行為。
