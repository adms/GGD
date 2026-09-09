# 37 英雄原設計修正（#1132）

前批驗收修正：柯南 R 的前置線索改由實際敵方普攻取得；共用試玩啟動戰鬥並控制自動索敵，保留空資源拒絕。Editor 與投稿編譯器的六槽／整套情境一致性已通過；這不等於已完成當下服務 ZIP 或瀏覽器畫面。來源與收據見 `conan-acceptance-verification.json`。

最新為尼古貓貓 v1：實際靜止蓄層、有效受擊清層、延遲落點、有限煙霧失手、無傷害撤退、三波預警及移動只撤自己護盾，revision 12→13。30 項行為、1 項真實等待試玩、四項有效突變通過；63 槽登記行為測試、159 槽未對應，19 名仍有通用普攻被動。見 [尼古貓貓證據](yanineko-verification.json)。玉藻前風格代理及原生 clip 保留；菸灰缸、雜物、專用動作／音效與煙霧畫面仍待驗收；#1132 原始完整範圍不變。

前批艾莉絲 v1：逐目標交鋒先手、踏步後斬擊、短效防禦、無傷害逼近、碰撞停止的光之太刀及自身近期命中 EX，revision 12→13。25 項行為、3 項試玩、四項有效突變通過；57 槽登記行為測試、165 槽未對應，20 名仍有通用普攻被動。見 [艾莉絲證據](eris-verification.json)。本尊模型及原生 clip 保留，專用動作／效果／音效畫面仍未驗收；#1132 原始完整範圍不變。

前批 SUN樂 v1：實際滑步閃避讀招、自身招架及一次 Q 接續、短效加速、三層讀招加自己交鋒標記的 EX，revision 12→13。26 項行為、3 項試玩情境、四項突變通過；51 槽登記行為測試、171 槽未對應，21 名仍有通用普攻被動。見 [SUN樂證據](sunraku-verification.json)。目前哈桑風格代理及原生 clip 綁定保留；專用模型、動作與音效未完成。一般整套煙霧試玩沒有取得三次讀招時，EX 必須仍拒絕；實際連段另有同一世界的正例，不能混作整套 UI 已驗收。#1132 原始完整範圍不變。

前批銀時 v1，六槽具名補給、前方弧斬、可中斷休息、來源限定招架反擊、短效增益及施法打斷，revision 12→13。45 槽登記行為測試，177 槽未對應，22 名仍使用通用普攻被動。28 項角色案例、五項有效突變與完整來源保留見 [銀時證據](gintoki-verification.json)。本尊原生模型仍是待轉換候選，目前仍採奴良陸生風格替代；木刀、牛奶、表情與專用演出未驗收。#1132 完整原設計／畫面／新服務 ZIP／發布範圍不變。後文保留歷次證據。

原始 `recipes/*.upload-recipe.json` 保持逐位元組不變。此處的逐英雄 JSON 是版本化的微調設定，必須與同一 projectId、sourceSha256 配對。既有模板由 `pinHeroPlanTemplates` 固定版本並實體化；套用器建立新作品 revision，不修改共用模板或舊英雄版本。

前批有 6 槽局部修正：鹿目圓 W、庫洛魔法使 W 指定友軍或自己；吉伊卡哇 EX 給附近友軍及自己護盾、三秒抗恐懼；庫洛魔法使 PASSIVE 改為卡牌連結資源。指定盾的 castEffect 視覺改綁 target。庫洛魔法使四張卡牌的順序、三層連結與下一盾消耗已實作並通過 9 項行為測試；W 先消耗既有連結，再把此次盾牌記入下一段牌序。新增 #1139：EX 自身切換風／樹 Q，風 Q 傷害／推動、樹 Q 束縛；同一 Q 實例共用冷卻／魔力，風／樹分別記牌序，EX 本身不集氣，回合回復風牌。9 項換牌測試與兩個反例 mutation 通過；牌面／動態圖示、劍牌與翔牌呈現仍待補。當時鹿目圓僅修盾目標；最新希望與六槽修正見文末。

`design-audit.json` 是這次實際 37 名／222 槽的原要求與編譯結果對照。早期對照曾有 25 名使用 tpl-on-attack 被動（現況見頁首）；沒有任何列因能編譯而自動標為原設計通過。這份資料不是發布清單。

執行 `pnpm exec node --import tsx tools/community-hero-forge/refine-design-handoff.mts --input <上次重建的37目錄> --output <新的交接目錄>` 產生可匯入 Editor 的 index、37 份 projects、原始 recipes 與已驗證模型。輸入每名目錄需有 after.hero-project.json 與 package.zip。程式拒絕覆寫既有輸出；可重新選用原先固定版本作 rollback。

行為驗證：`pnpm exec vitest run packages/shared/src/content/heroForge/communityRefinements/friendlyProtection.test.ts`。涵蓋 rank 1/4、敵人、超距、不扣消耗、自身、範圍友軍、恐懼到期、原文及來源隔離。後續仍須修正其餘 requiredRefinement、驗收畫面，再依當下服務重新建立 ZIP。不得用舊版隔離發布收據抵充修正後的驗收。

牌序回歸：`pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/cardLinks.test.ts`。包括重複卡不集氣、上限、0–3 層消耗、rank 1/4、不同施法者、非法目標及回合重置；兩個反例 mutation 均被檢出，見 `card-links-verification.json`。

可共用的實際作品與模型還原指令見 [材料入口](../README.md#最新可共用作品2026-09-09)；這次交接不只包含配方。換牌回歸：`pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/cardVariants.test.ts`。

#1140 新增御坂美琴 PASSIVE／Q／W／R／EX 五槽修正，合計 11 槽局部變更。技能實際扣血才取得電荷，不同技能最多三層；EX 消耗電荷，下一次 Q 擴大實際直線範圍或 W 增加一至三個目標。Q／R 每目標單次傷害，W 一條鏈逐跳去重，目標死亡可重選。16 項行為測試及共用連鎖／既有英雄回歸見 `electric-charge-verification.json`；交錯施法測試另使用既有 hitstop.scale=0 設定。原作硬幣模型／彈射動作、鐵砂破盾碎粒仍待补，不宣稱完整視覺驗收。

電荷回歸：`pnpm --filter @ggd/shared exec vitest run src/content/heroForge/communityRefinements/electricCharge.test.ts src/sim/effects/chainLightning.test.ts --pool=threads --minWorkers=1 --maxWorkers=1`。`retargetOnLost` 預設保持中止；只有配方明確啟用才重選，保留舊內容行為。

#1141 完成吉伊卡哇六槽機制一批：附近友軍實際敵對 HP／護盾命中後，5 格、2 秒窗口、每 2 秒累積勇氣，上限 3；W 沿輸入方向退 3 格，成功施放時可扣 1 層取得小盾；E 原地 1 秒治療，HP 受傷中斷；Q 短前方叉刺，R 消耗 0–3 層進行 3–6 次近距叉擊；EX 附近友方及自身護盾、僅清可驅散恐懼、三秒抗恐懼。該批對照當時有 16 槽局部變更、27 名使用通用普攻被動；最新數字見下段。26 項本英雄測試、110 項集中回歸、三項反例見 `chiikawa-verification.json`。原作武器、進食道具、專用動作、實際畫面與新服務 ZIP／發布仍未完成。

微調的 `version` 現在會推進從原始基底重建的作品 revision：v1 是 base+1，v2 是 base+2；不能再讓兩份不同微調占同一作品 revision。庫洛魔法使 v3 因此只補正 revision 及各區段 revision，沒有更改其技能或模板實例。重建輸出不覆寫舊包，Git 保留歷次版本。

#1132 鹿目圓 v2：真正恢復友軍生命或自己護盾吸收敵對傷害才累積希望，上限三層；W 消耗一層強化指定友軍盾。Q 實體直線彈首碰一次、E 淨化一項負面並短效加速、R 三波地面區域重新解目標；EX 五秒印記攔截首次致死傷害、留 5% 生命並短暫保護，每目標／同名印記每回合最多救一次。19 項角色行為、207 項集中回歸與三個反例已驗，見 `madoka-verification.json`。最新對照為 21 槽局部變更、26 個通用普攻被動；箭形、玫瑰盾等原作演出與完整畫面、新服務 ZIP／發布仍未完成。

奇犽六槽已改為具名電力、延遲小範圍落雷、貼地肢曲與有效自身迴避回電、持續扣電的真正加速開關、五秒共用三次／0.5 秒間隔的近距反擊、消耗全電力的近身 EX 與低電力期。數值與連動保存在 `24.json`，作品 revision 12→13。24 項角色測試、213 項集中回歸與三項故意回退見 [奇犽驗證](kirua-verification.json)。其餘 36 份作品、37 份原稿及模型綁定未改；目前 27 槽有已登記行為測試，195 槽尚未對應測試。原設計整體、殘像／電流畫面與新服務 ZIP／發布仍未完成，#1132 保留。
