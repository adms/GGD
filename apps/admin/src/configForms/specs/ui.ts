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
import type { WallBlockPolicy } from "@ggd/shared/sim/movement/wallBlock";
// 開關型技能的「開啟中」圖示外觀（GH#546）。深路徑同上：Zod 住自己的檔，
// `content/schema/index.ts` 沒有再匯出一次。
import {
  TOGGLE_ABILITY_DOC_ID,
  zConfigToggleAbilityDoc,
} from "@ggd/shared/content/schema/toggleAbilityDoc";
import { HEX6, HEX6_ERROR } from "./_shared";
import type { ConfigDocSpec } from "../engine";
/**
 * ⭐ owner 2026-08-21「有許多地圖的牆 瞬移過去」的三個選項。
 * ⛔ `satisfies Record<WallBlockPolicy, …>` 是刻意的：哪天多一種處置，
 * **這裡不補標籤就編不過**，⛔ 不是等 `configForms.test.ts` 在半夜紅。
 */
const WALL_BLOCK_OPTION_LABELS = {
  allow: "allow 照舊穿過去（＝這個缺陷本體，只給 rollback 用）",
  clamp: "clamp 停在牆前（出貨）",
  cancel: "cancel 整段位移不發生",
} satisfies Record<WallBlockPolicy, string>;

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
  fields: [
    { path: "enabled", zh: "級距總開關", note: "關掉之後技能照自己文件裡寫的距離走，等於這套級距沒有存在過。⚠️ 它**不會**連帶關掉速度夾限（那是下面獨立的一格）。" },
    { path: "clampSpeed", zh: "夾住位移速度（穿牆修復本體）", note: "⛔ **這一格才是 GH#318 的修復本體**，而且它**無條件套用**（跟有沒有填級別無關）。關掉它，出貨 35 個位移效果裡有 29 個會穿牆。" },
    { path: "safetyFactor", zh: "速度上限的安全係數", note: "速度上限 = ⌊30 × 最小身體半徑 × 這一格⌋。1.0 = 剛好貼著穿牆門檻，出貨 {{出貨值}} 留一成餘裕。⚠️ 調高會讓位移更快但逼近穿牆。" },
    // ⛔ 級距名從 `SKILL_TIER_NAMES` 來，⛔ 不在這裡重打一組 —— 重打就是第二個
    //    住處，而它會在下一次改級距數的時候安靜地漏掉一格。
    ...SKILL_TIER_NAMES.flatMap((tier) => [
      { path: `travel.${tier}.distance`, zh: `衝刺 · ${tier} · 距離`, note: `自己位移（衝刺類）在「${tier}」這一格走多遠。⚠️ 改它會同時影響**每一支**填了這個級別的技能。` },
      { path: `travel.${tier}.speed`, zh: `衝刺 · ${tier} · 速度`, note: `每秒幾單位。⚠️ 這是安全欄位：超過上限會被「夾住位移速度」那一格截掉，⛔ 不是拿來調手感的。` },
      { path: `push.${tier}.distance`, zh: `擊退 · ${tier} · 距離`, note: `被別人推（擊退類）在「${tier}」這一格推多遠。⚠️ 與衝刺是**兩條獨立的梯子**，改這裡不影響衝刺。` },
      { path: `push.${tier}.speed`, zh: `擊退 · ${tier} · 速度`, note: `每秒幾單位。⚠️ 同衝刺那一欄：這是**安全欄位不是手感欄位**，超過上限會被「夾住位移速度」截掉。` },
    ]),
    // ⭐ owner 2026-08-21「我發現**有許多地圖的牆 瞬移過去** 例如**無限城**等」。
    //    ⛔ 這**不是**上面那一格的重複：「夾住位移速度」修的是穿隧（一步跨太遠），
    //    這四格修的是「終點就在牆的另一邊」。瞬移沒有速度，夾它是沒有意義的。
    {
      path: "markedBlink.enabled",
      zh: "「標記→順移」總開關（30-00 攝影機）",
      note: "⭐ **這是 GH#448 的 rollback 開關**（owner 2026-08-19「給予指定敵方英雄標記，之後施展若無指定敵方英雄單位代表順移至敵方身邊」）。⛔ 關掉之後 `to: \"markedUnit\"` 的瞬移**一律不發生**，施法者原地不動 —— ⚠️ 而卡面第二句會變成謊話，所以這是**應急**用的，⛔ 不是長期形狀。",
    },
    {
      path: "markedBlink.requireOwnMark",
      zh: "只認自己這支技能打的標記",
      note: "比對 `StatusEffect.sourceId === ctx.origin`（＝這支技能的 id）。⛔ 關掉之後兩位臭作會互相搶對方標記的目標（同一個 statusId、不同施法者）。⭐ 出貨值開著。",
    },
    { path: "wallBlock.enabled", zh: "位移不可以穿牆（總開關）", note: "⭐ **這是 owner 2026-08-21 那則回報的修復本體**：瞬移／跳躍的**終點**必須落在牆的這一邊。⛔ 關掉＝回到 2026-08-21 之前（無限城的 16 道牆對位移完全不存在）。⚠️ 它與「夾住位移速度」是**兩個不同的缺陷**，兩格都要開著。" },
    {
      path: "wallBlock.blink",
      zh: "真瞬移撞到牆時",
      note: "⚠️ **不建議 cancel**：一支保命技在最需要它的貼牆場合會靜默失效，玩家看到的是「按了沒反應」。",
      optionLabels: WALL_BLOCK_OPTION_LABELS,
    },
    {
      path: "wallBlock.leap",
      zh: "跳躍／擊飛撞到牆時",
      note: "管的是拋物線（`leap` 與 `launchHeight > 0` 的擊飛）。⚠️ 地面滑行的擊退本來就撞得到牆（走碰撞），所以這一格開著之後，同一支技能的兩條路才對地形有一致的看法。",
      optionLabels: WALL_BLOCK_OPTION_LABELS,
    },
    { path: "wallBlock.pillarsBlock", zh: "圓柱也算牆", note: "false（出貨）＝只有有厚度的牆（box）與牆線（segment）擋位移，**圓柱跳得過也瞬移得過**——那本來就是跳躍的定義，而且六張手寫舊場地的障礙物全是圓，所以它們逐位元組不變。打開＝地形完全實心。" },
    // ⭐ GH#490 owner 2026-08-21「翔封界 等飛行效果實作」——「飛行是那條規則的
    //    合法例外」。⛔ 這**不是**一支技能的 if：判準綁在「走路時就穿得過牆」上，
    //    所以每一個帶飛行的來源（天生技 / 限時 buff / 道具 / 增益卡）自動吃到。
    { path: "wallBlock.flightExempt", zh: "在飛的單位不受穿牆判定", note: "⭐ **飛行是上面那條規則的合法例外**（GH#490）。判準是「這具身體**走路時**就穿得過牆嗎」（`sim/flight.ts`），所以 04-00 翔封界、77-03 GLADIARIA ALAT、天叢雲劍、立體機動裝置、職階技能・騎乘 EX 全部自動吃到，⛔ 沒有任何一支技能被特別點名。⚠️ 關掉＝連飛行也擋：她**走**得過去卻**瞬移／跳**不過去，同一具身體被兩個系統用兩種方式對待。⛔ 帶著 `ignoreObstacles: false` 的飛行（飛起來但仍然撞牆）**不吃這一格**，那是刻意的。" },
  ],
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
  fields: [
    {
      path: "grail.systemName",
      zh: "聖杯願望・系統名",
      note: "每回合抽增益卡時，面板正中央那四個字。⛔ 玩家端只看得到這個，「三選一」是內部說法。填空字串存不進去（schema 下限 1 字）。",
    },
    {
      path: "grail.prompt",
      zh: "聖杯願望・面板提示",
      note: "系統名下面那一行。⚠️ 它要同時講「這是什麼」與「選完會怎樣」—— 只寫世界觀的話，第一次玩的人不知道選完才能繼續逛商店。",
    },
    {
      path: "grail.inscribeVerb",
      zh: "聖杯願望・選取動詞",
      note: "「已○○○○」那一句的動詞（出貨「刻入靈基」）。玩家不是「獲得一張卡」。⚠️ 目前只有選完的提示句在用它。",
    },
    {
      path: "grail.inscriptionsTitle",
      zh: "聖杯願望・已選列表標題",
      note: "列出這一場已經刻進去的願望時的標題（出貨「靈基刻印」）。⚠️ 那個面板還沒做，改這一格現在畫面上看不到變化。",
    },
    {
      path: "noblePhantasm.systemName",
      zh: "寶具・系統名",
      note: "抽傳說武器時面板標頭的後綴（出貨「寶具顯現」）。⛔ 不要填成聖杯那一組的字 —— 武器是裝備層，混在一起會讓玩家以為武器也在改遊戲規則。",
    },
    {
      path: "noblePhantasm.defaultRank",
      zh: "寶具・預設 Rank",
      note: "每張武器卡左邊那兩個字（出貨 EX，因為目前開放的武器都是 EX 等級）。四個字以內，太長會把卡片撐開。",
    },
    {
      path: "noblePhantasm.defaultClass",
      zh: "寶具・預設種別",
      note: "沒有在逐把對照表裡指定的武器算哪一種（出貨「對人」＝效果集中，最保守）。⚠️ 種別是**規模**不是強弱 —— 對人寶具不代表弱。",
    },
  ],
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
  fields: [
    {
      path: "hoverDelayMs",
      zh: "滑過技能圖示幾毫秒才浮出範圍圈",
      note: "⚠️ 不可以是 0：技能列是六格緊鄰的按鈕，游標從畫面一端掃到另一端會**依序**經過全部六格，零延遲＝地板上連閃六個圈。出貨 {{出貨值}} 短到「我停下來看」仍然像即時，長到「路過」不會觸發（和一般 tooltip 的 ~150 同一個量級）。調大＝要停更久才看得到，對手殘的玩家會以為功能壞了。",
    },
    {
      path: "rangeColor",
      zh: "施法距離圈的顏色",
      note: "外面那個大圈 —— 回答「我打得到多遠」。出貨 #73BFFF 藍，刻意和命中範圍圈的琥珀分開：兩個圈同時畫在腳下，同色系的話玩家分不出哪一圈是射程、哪一圈是會被炸到的範圍。⚠️ 也不要換成接近隊伍色的顏色，會被讀成隊伍標示。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "rangeFillAlpha",
      zh: "距離圈的填滿濃度",
      note: "出貨 {{出貨值}} 刻意很淡：這個圈是**整個施法距離**（大技能十幾個單位直徑），填太濃會把腳下的地板、屍體、掉落物全部染成一片藍，反而看不到要打誰。0＝只剩一圈框（想要最乾淨畫面的人選這個），往上調＝範圍更好判斷但場面更髒。",
    },
    {
      path: "aoeColor",
      zh: "命中範圍圈的顏色",
      note: "裡面那個小圈 —— 回答「它會落在哪」，也是玩家真正要瞄的那一圈。出貨 #FF9E3B 琥珀。⚠️ 改它要**連下面「自己的預告」一起改**：那兩個出貨值是同一個顏色，為的是「我瞄的那一圈」和「我放出去之後地上那一圈」看起來是同一件事。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "aoeFillAlpha",
      zh: "命中範圍圈的填滿濃度",
      note: "出貨 {{出貨值}}，比距離圈濃一倍多：這個圈小得多，而且它回答的是「我站在裡面會不會被打到」——那是一個**面積**問題，只有填滿才一眼答得出來，一條線答不出來。調到 0 等於退回 #367 之前那種「地上一條線」的觀感。",
    },
    {
      path: "rimAlpha",
      zh: "兩個圈外框的不透明度",
      note: "框要比填滿實得多，否則邊界糊掉、玩家判斷不出「再往前一步是不是就超出射程」。出貨 {{出貨值}}。調低到接近填滿的濃度時，兩個圈會看起來像兩片色斑而不是兩個範圍。",
    },
    {
      path: "rimThickness",
      zh: "外框粗細（世界單位）",
      note: "⚠️ 這是**絕對**寬度不是半徑的比例，而那是刻意的：用比例的話大技能的框會粗得像另一個 AoE，小技能的框細到看不見。出貨 {{出貨值}}（角色體半徑 0.6，所以大約是身寬的三分之一）。調太粗會讓小範圍技能的框把自己的圈整個填滿。",
    },
    {
      path: "telegraph.self.ring",
      zh: "自己的預告 · 外圈顏色",
      note: "**你自己**起手技能時，地板上那一圈的邊。出貨和上面的命中範圍圈同一個琥珀，讓「我剛剛瞄的」和「我現在放的」看起來連續。⚠️ 改它之前先想清楚要不要一起改上面那一格，否則自己的兩個階段會變成兩個顏色。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.self.fill",
      zh: "自己的預告 · 填滿顏色",
      note: "同一圈的魔法陣填滿色（畫面上圈太多時這一條會被降級成只有外框，那時看不到它）。出貨與外圈同色 —— 自己的預告不需要吸引注意，它只是在說「這是我放的」。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.self.alpha",
      zh: "自己的預告 · 最大不透明度",
      note: "出貨 {{出貨值}}，刻意比來襲的低：你已經知道自己按了什麼，這一圈只是確認，⛔ 不該是畫面上最吵的東西。調到和來襲一樣高＝自己丟一個大招會把對面正在瞄你的那一圈蓋掉。",
    },
    {
      path: "telegraph.self.dashed",
      zh: "自己的預告 · 虛線邊",
      note: "出貨**開**。它是「這一圈是我的」唯一一個**不靠顏色**的分辨器 —— 去飽和的觀戰畫面（#85）與色盲玩家只讀得到它。⚠️ 關掉的話，自己與來襲就只剩色相與亮度兩個差異；要關就請同時把兩邊的顏色拉得更開。",
    },
    {
      path: "telegraph.self.pulseHz",
      zh: "自己的預告 · 急迫脈動（Hz）",
      note: "起手末段的閃動頻率。出貨 {{出貨值}}（不動）：會動的東西會抓走眼睛，而你不需要對自己的技能做反應。開起來＝自己的圈也會跳，代價是「畫面上在動的那一圈＝我要躲」這個規則失效。",
    },
    {
      path: "telegraph.ally.ring",
      zh: "隊友的預告 · 外圈顏色",
      note: "隊友起手時地板上那一圈的邊。出貨 #59CCFF 隊伍青 —— 它說的是「有東西會落在那裡，但不是衝著你來」。⚠️ 要離來襲的紅夠遠：這兩個是你在場上最常隔著半個競技場、而且旁邊沒有另一個可以比較的顏色。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.ally.fill",
      zh: "隊友的預告 · 填滿顏色",
      note: "同一圈的填滿色。出貨與外圈同色，而且這一條通常被降級成只有外框 —— 隊友的技能是背景資訊，不是要你反應的事。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.ally.alpha",
      zh: "隊友的預告 · 最大不透明度",
      note: "出貨 {{出貨值}}，三條通道裡最低：一場四人團戰的地板上，隊友的圈數量最多而重要性最低。調高＝更清楚看得到隊友要打哪，代價是自己腳下那一圈與來襲那一圈都會被淹掉。",
    },
    {
      path: "telegraph.ally.dashed",
      zh: "隊友的預告 · 虛線邊",
      note: "出貨**關**（實線）。隊友那一條目前靠「最低的不透明度」與青色來分辨，實線讓它看起來像背景而不是一個要處理的東西。開起來＝多一個不靠顏色的分辨器，但會和自己的那一圈撞語彙。",
    },
    {
      path: "telegraph.ally.pulseHz",
      zh: "隊友的預告 · 急迫脈動（Hz）",
      note: "出貨 {{出貨值}}。同自己那一格的理由，而且更強：隊友的圈在團戰裡數量最多，讓它們一起跳＝整個地板都在閃，那會把真正該躲的那一圈藏起來。",
    },
    {
      path: "telegraph.incoming.ring",
      zh: "來襲的預告 · 外圈顏色",
      note: "**打向你**的技能（施法者關係還沒解析出來時也走這一條，因為失敗要往危險那邊倒）。出貨 #FF3824 危險紅，刻意離上面兩個預覽圈都很遠 —— #228 之前這一圈是琥珀，和自己的瞄準預覽同色，那就是玩家回報「預告特效不明顯」的主因。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.incoming.fill",
      zh: "來襲的預告 · 填滿顏色",
      note: "同一圈的魔法陣填滿色。出貨 #FF5C33 比外圈亮一階，讓「面積」在滿地都是圈的時候仍然讀得出來 —— 這是三條通道裡唯一一條出貨就實心填滿的。",
      pattern: HEX6,
      patternError: HEX6_ERROR,
    },
    {
      path: "telegraph.incoming.alpha",
      zh: "來襲的預告 · 最大不透明度",
      note: "出貨 {{出貨值}}，三條裡最高，而且**必須**最高：這是唯一一條玩家非反應不可的通道。調低到和隊友那條差不多＝「該躲的」和「不用管的」在畫面上一樣大聲，等於這三條通道白分了。",
    },
    {
      path: "telegraph.incoming.dashed",
      zh: "來襲的預告 · 虛線邊",
      note: "出貨**關**（實線＝「這是真的要落下來的」）。它和上面「自己的預告 · 虛線邊」是**同一個決定的兩半** —— 兩邊都設成一樣（都虛或都實）等於把這個不靠顏色的分辨器丟掉，那時請務必把兩邊的顏色與不透明度拉開。",
    },
    {
      path: "telegraph.incoming.pulseHz",
      zh: "來襲的預告 · 急迫脈動（Hz）",
      note: "起手最後三分之一才開始的閃動，出貨 {{出貨值}} Hz。它是「快落地了」這件事**唯一**不靠亮度也不靠顏色的訊號，所以去飽和的觀戰畫面與色盲玩家都讀得到。0＝關掉脈動，這一圈就只剩亮度爬升在報時間。",
    },
  ],
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
  fields: [
    {
      path: "enabled",
      zh: "開啟中流轉總開關",
      note: "關掉之後，開著的開關型技能和「冷卻剛好」長得**一模一樣** —— 那正是 owner 回報的狀況。留著這一格是為了能一鍵回到那個舊畫面（例如流轉在某個瀏覽器上掉幀時），⛔ 不是為了觀望。",
    },
    {
      path: "sweepMs",
      zh: "流轉掃一圈幾毫秒",
      note: "光點繞技能格一圈的時間。⚠️ **兩端都會弄壞它想傳達的訊息**：太快（幾百毫秒）會從「在流轉」變成「在閃爍」，而高頻閃爍是光敏性癲癇的直接誘因；太慢（好幾秒）則在一場交戰的視線停留時間內看起來根本沒動，玩家仍然分不出開還是關。",
    },
    {
      path: "rimPx",
      zh: "流轉光邊粗細（px）",
      note: "那一圈光本身有多寬。技能格在手機上只有幾十 px，所以這一格調大的代價不是「更明顯」而是「蓋住圖示」——圖示看不見的話，玩家知道有東西開著卻不知道是哪一個。",
    },
    {
      path: "glowPx",
      zh: "外溢輝光半徑（px）",
      note: "光邊往外暈開多遠。0 ＝ 只有一條硬邊（最省，也最不會糊到隔壁那一格）。技能列是六格並排的，這一格調大時**相鄰兩格的光會互相溢進去**，於是「哪一格開著」又變得要猜。",
    },
    {
      path: "color",
      zh: "流轉顏色",
      note: "留**空**＝用技能自己那一族的顏色（主動／EX／被動各有一個），也就是不在畫面上多出一個與技能種類無關的新色。填 `#rrggbb` 則是**所有**開關型技能共用同一個顏色。⚠️ 填的時候要和 ready 框那個顏色**在明度或飽和度上分得開** —— 兩個顏色太近的話，這一整頁想解決的「開著 vs 冷卻好了」就又混回去了。",
    },
  ],
  preserved: [],
};

