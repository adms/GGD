/**
 * 設定文件的**標籤資料**（位移級距・介面用語・範圍指引・開關型技能外觀）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigUiLexiconDoc,
  // 技能範圍指引 + 地面預告通道（GH#376）—— 走 barrel（`schema/index.ts` 的
  // `export * from "../../config"`），同 zConfigGoreDoc 那一族。
  zConfigRangeGuideDoc,
} from "@ggd/shared/content";
import { zConfigDisplacementTiersDoc } from "@ggd/shared/content/schema/displacementDoc";
// ⛔ 級距名只有一份（GH#414）—— 後台不重打一組字串。
// ⭐ 2026-08-21（owner「後台設定及說明⋯**全部都是推導動態即時產生**」）：連
//    「決鬥區半徑」與「這一格是半徑的幾分之幾」也一起從梯子讀 —— 那兩個數字在
//    這一頁的說明裡出現過 6 次，而 GH#463 改名之後其中三處**當場變成假的**
//    （「中 = 4.5」變成 6、「大 = 6」變成 8），⛔ 而且 `content:build` 是綠的。
import {
  SKILL_TIER_NAMES,
} from "@ggd/shared/content/skillTiers";
// 開關型技能的「開啟中」圖示外觀（GH#546）。深路徑同上：Zod 住自己的檔，
// `content/schema/index.ts` 沒有再匯出一次。
import {
  TOGGLE_ABILITY_DOC_ID,
  zConfigToggleAbilityDoc,
} from "@ggd/shared/content/schema/toggleAbilityDoc";
import { HEX6, HEX6_ERROR } from "./_shared";
import type { ConfigDocSpec } from "../engine";
import { derivedFields } from "../schemaToForm";
// ⭐ GH#992（2026-09-07）：三個處置的中文搬去 `schema/displacementDoc.ts` 的
//    `WALL_BLOCK_POLICY_OPTS` —— 那裡是**從 `WALL_BLOCK_POLICIES` 逐項展開**的，
//    ⛔ 比這裡原本的 `satisfies Record<WallBlockPolicy, …>` 更強：多一種處置時
//    那一份自己會多一行，⛔ 不必有人記得回來補。

export const DISPLACEMENT_TIERS_SPEC: ConfigDocSpec<"displacementTiers"> = {
  page: "displacementTiers",
  collection: "config",
  docId: "displacement-tiers",
  schemaTag: "config.displacement-tiers@1",
  zod: zConfigDisplacementTiersDoc,
  title: "位移級距",
  intro: [
    "位移距離走**五級距**（極小/小/中/大/極大），⛔ 技能不再寫死距離數字 —— 和 AoE 級距、施法距離級距、冷卻規則同一個形態。",
    "⭐ owner 2026-08-19：「將技能相關設定**正規化成五級距**，並且將相關**文件 JSON 編輯器 後台設定 都統一**」，而他指名的五個字是「**極小 小 中 大 極大**」。⛔ **沒有「超大」這一級**：GH#463 之前這一頁與 AoE 那一頁的第四格是兩個不同的名字，統一時我一度挑了他 08-11 的四級舊詞彙（小/中/大/超大），已經改回來 —— 現在兩張表逐字共用 `SKILL_TIER_NAMES`。⚠️ 那次改名**值一格都沒動**，只有名字整體左移一格。",
    "⭐ **兩條梯子**：`travel` = 自己動（衝刺），`push` = 別人被推（擊退）。出貨分佈幾乎不重疊（衝刺 5.0–14.67、擊退 2.0–6.0），硬塞成一條會讓 14 支擊退全部擠進「小」。要合成一條就把兩張表填成一樣的數字。",
    "⚠️ **速度那一欄是安全欄位不是手感欄位**（GH#318）：穿牆的門檻是「每 tick 位移 > 身體半徑」，所以上限 = ⌊30 × 最小身體半徑 × 安全係數⌋。**關掉「夾住速度」穿牆就會回來**。",
    "⭐ **穿牆有兩半，這一頁兩半都在**（owner 2026-08-21「有許多地圖的牆 瞬移過去 例如無限城等」）：上面那一格修的是**穿隧**（`dash`／擊退滑行一步跨太遠），最下面那五格修的是**終點就在牆的另一邊**（`blink` 沒有中間位置、`leap` 刻意離開平面物理）。⛔ 兩者不可互相取代 —— 夾住瞬移的速度是沒有意義的，它沒有速度。⭐ 那五格的**最後一格**是 GH#490 的飛行例外：一個走路就穿得過牆的身體，位移時照樣穿得過。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/displacement-tiers.json`**。",
  ],
  consumer: "packages/shared/src/content/displacementTiers.ts 的 resolveDisplacementTier（註冊時把級別翻成距離/速度）",
  effect: "**要重啟 game-server shard 才生效**，客戶端要重新載入 bundle。",
  // ⭐ GH#992（2026-09-07）：`wallBlock.blink` / `.leap` 兩格的人話與三個處置的中文
  //    搬進 `schema/displacementDoc.ts`（`WALL_BLOCK_POLICY_OPTS` 從 `WALL_BLOCK_POLICIES`
  //    逐項展開，兩格共用一份）—— ⛔ 這裡不再留第二份。
  fields: derivedFields(zConfigDisplacementTiersDoc, []),
  preserved: [],
};

// ───────────────────────────────────── 介面用語 (config/ui-lexicon) ─

export const UI_LEXICON_SPEC: ConfigDocSpec<"uiLexicon"> = {
  page: "uiLexicon",
  collection: "config",
  docId: "ui-lexicon",
  schemaTag: "config.ui-lexicon@1",
  zod: zConfigUiLexiconDoc,
  title: "介面用語（Fate）",
  intro: [
    "玩家在抽卡畫面與商店看到的那幾個 Fate 用語。owner 2026-08-16：「記得這些替換的介面提示等用語，應該是一個 JSON 檔，可以在後台替換設定」。",
    "⛔ 它只管「叫什麼」，不管「做什麼」。後台與 augment@1 的 silver / gold / prismatic 一個字都沒動，改這裡不會動到任何一份技能、道具或武器內容。",
    "⛔ 迴避／格擋／彈反／淨化／復活這一族的機制詞**刻意不在這一頁**（規則 §5：不能為了 Fate 味犧牲可讀性）。要改那些字得改程式。",
  ],
  consumer:
    "apps/client/src/content/ContentDb.ts 的 applyUiLexiconDoc() → apps/client/src/ui/panels/fateLexicon.ts 的每一個讀取函式 → 抽卡面板標頭／提示、武器卡片、商店回絕訊息",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機時才讀內容覆蓋層）。已經開著的抽卡面板不會中途換字。",
  fields: derivedFields(zConfigUiLexiconDoc, []),
  preserved: [
    {
      path: "grail.ranks",
      why: "silver / gold / prismatic → C／A／EX 級願望的對照。⛔ 通用引擎沒有「自由文字 record」這種欄位型別（它只畫固定形狀的純量葉，以及值是 enum 的對照表），硬塞會變成一格連鍵都能打錯的文字框，而打錯鍵的後果是那一階**靜靜地退回英文 tier**。要改先走 內容管理 的 JSON 編輯器。⚠️ 通用引擎長出自由文字 record 欄位的那一天，這四列都該搬進 fields。",
    },
    {
      path: "noblePhantasm.classNames",
      why: "11 種寶具種別的中文全名（對軍 → 對軍寶具）。同上：自由文字 record。",
    },
    {
      path: "noblePhantasm.itemClass",
      why: "逐把武器的種別覆寫。⚠️ 這是 owner 最會改的一張表（種別是設計判斷），但它同樣是自由文字 record —— 通用引擎畫不了，先走 內容管理 的 JSON 編輯器。⭐ 把值改成 Zod enum 之後就能用 recordEnum 表格畫出來，那是這一列的到期條件。",
    },
    {
      path: "shopLines",
      why: "三條商店回絕訊息的 Fate 版。同上：自由文字 record，通用引擎畫不了。⚠️ 鍵必須與 shopFeedback.ts 的 ShopEventReason 一致，打錯鍵不會報錯、只是那一條永遠不會被用到 —— 這正是它現在不適合放進一格自由輸入框的理由。",
    },
  ],
};

// ────────────────────────────── 範圍指引與預告 (config/range-guide) ─────────

export const RANGE_GUIDE_SPEC: ConfigDocSpec<"rangeGuide"> = {
  page: "rangeGuide",
  collection: "config",
  docId: "range-guide",
  schemaTag: "config.range-guide@1",
  zod: zConfigRangeGuideDoc,
  title: "範圍指引與預告",
  intro: [
    "owner 2026-08-18（GH#367）：「技能缺乏範圍指引（可參考 LoL 的新手模式與教學），理論上**按著技能按鈕或 hover 時**要能顯示可施展的範圍才對（**特殊顏色框框 + 顏色半透明填滿**）」。這一頁上半就是那兩個圈。",
    "下半是 #228 的**地面預告**：別人（或你自己）起手一個技能時，畫在地板上那一圈警告。它分三條通道 —— 自己放的、隊友放的、打向你的 —— 而「怎麼一眼分出來」是這一頁真正的問題。",
    "⚠️ **兩半在同一頁是刻意的，因為它們互相定義。** 「自己」的預告出貨顏色就是上半那個命中範圍圈的琥珀（自己的預告要和剛剛瞄準的那一圈連續），「來襲」的紅則刻意離兩組預覽色都很遠。分成兩頁的話，調了一邊忘了另一邊的那一天不會有任何東西提醒你。",
    "⚠️ **不要只靠顏色分辨自己與來襲。** 觀戰死亡時整個畫面會去飽和（#85），色盲玩家也讀不到色相 —— 所以每條通道另外還有三個非色相載體：填滿色、不透明度、虛線、脈動。動顏色的時候請至少留一個非顏色的差異。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/range-guide.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/rangeGuideConfig.ts 的 applyRangeGuideDoc()（由 ContentDb.load 呼叫）→ rangeGuide() 被 ui/abilityRangeGuide.ts 的 hover 計時器與 render/AimIndicator.ts 的 paintCircle() 讀走畫那兩個圈，telegraph 那一半由同一支推進 vfx/telegraphChannel.ts 的 applyTelegraphChannelStyles()，再由 paletteFor() 交給 TelegraphLayer 畫地面預告",
  effect: "玩家**下一次重新整理遊戲頁面**時生效（客戶端開機載內容時套用）。已經畫在地上的圈不會中途換色。",
  // ⭐ GH#992（2026-09-07）：三條預告通道那 15 格的人話**搬回 Zod** ——
  //    `zTelegraphChannelStyle(prose)` 逐通道帶一份 `@zh`/`@note`（那個子物件被用三次，
  //    所以描述不可以寫死在它身上）。⛔ 這裡只剩 Zod 今天給不出來的那一半：`pattern`。
  //    ⚠️ 缺的標籤是「把 `ZodString` 的 regex check 帶進 IR」（`apps/editor/src/form/`),
  //    ⛔ 不是在這裡另寫一支走訪器 —— 那就是第二份「Zod 長什麼樣」的知識。
  fields: derivedFields(zConfigRangeGuideDoc, [
    { path: "rangeColor", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "aoeColor", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "telegraph.self.ring", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "telegraph.self.fill", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "telegraph.ally.ring", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "telegraph.ally.fill", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "telegraph.incoming.ring", pattern: HEX6, patternError: HEX6_ERROR },
    { path: "telegraph.incoming.fill", pattern: HEX6, patternError: HEX6_ERROR },
  ]),
  preserved: [],
};

// ──────────────────────────── 開關型技能的開啟中外觀 (config/toggle-ability) ─
//
// GH#546。⚠️ 這一列要跟**四件事**一起才到得了操作者手上，四件都不在這條 lane 手上：
//   ① `apps/client/src/content/ContentDb.ts` 的 `applyToggleAbilityDoc(...)` 一行
//      —— ⛔ **少了它這一頁就是「存了不生效」**：`applyToggleAbilityDoc` 目前
//      全 repo 零 production 呼叫端，值永遠來自 `ui/toggleAbility.ts` 的
//      `SHIPPED_TOGGLE_ABILITY`（`range-guide` 有 `applyRangeGuideDoc(...)` 那一行，
//      這一份沒有）。這是 `configForms.ts` 檔頭第 1 條真正在講的那件事。
//   ② `store.ts` 的 `Page` union ＋ `SESSION_REQUIRED_PAGES`
//   ③ `App.tsx` 的導覽列一列
//   ④ `navSections.test.ts` 的基準線一列
export const TOGGLE_ABILITY_SPEC: ConfigDocSpec<"toggleAbility"> = {
  page: "toggleAbility",
  collection: "config",
  docId: TOGGLE_ABILITY_DOC_ID,
  schemaTag: "config.toggle-ability@1",
  zod: zConfigToggleAbilityDoc,
  title: "開關型技能外觀",
  intro: [
    "owner 2026-08-22：「風王結界這種**開關型按鈕** 圖示跟特效**要明顯看出是開還是關狀態**（w3x 會有特殊攻擊特效跟隨手部、**圖示也會有流轉**作為打開中顯示）」。這一頁就是那個「流轉」——技能格上那一圈會繞著跑的光。",
    "⚠️ **這一頁只管圖示那一半。** owner 那句話的另一半（跟隨手部的特殊攻擊特效）是**內容**不是設定：它走 `ability@1.persistentVfx` ＋ `attach` 字串，逐支技能在內容編輯器裡填。在這裡開一格「手部特效開關」會是一格沒有人讀的欄位。",
    "⚠️ **為什麼「開著」和「冷卻好了」會混在一起。** 技能格本來就有一圈 ready 框，而開關型技能開著的期間**它自己也在冷卻**，所以兩個框在出貨內容上不可能同時亮 —— 也就是說玩家看到一圈光時，唯一能分辨「這是開著」還是「這是好了」的線索就是**它有沒有在流轉**。⇒ 關掉這一頁的總開關，等於把 owner 回報的那個問題原封放回去。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/toggle-ability.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "apps/client/src/ui/toggleAbility.ts 的 applyToggleAbilityDoc()（把文件解成模組級現值）→ toggleAbility() → ui/abilityReadyFrame.ts 的 abilityToggleFrameStyle()，也就是技能列上那一格磚每次重繪讀到的 CSS。⚠️ 這條鏈的第一環（ContentDb.load() 裡那一行 applyToggleAbilityDoc）**在 GH#546 收尾之前還沒接**——在那一行落地之前，這一頁存得起來、讀得回來，而遊戲讀的仍然是 SHIPPED_TOGGLE_ABILITY。",
  effect:
    "玩家**下一次重新整理遊戲頁面**時生效（內容登錄表是開機時載入的），之後每一次技能格重繪都吃新的值。不需要重開 game-server —— 這一整層活在客戶端 HUD。",
  fields: derivedFields(zConfigToggleAbilityDoc, []),
  preserved: [],
};

