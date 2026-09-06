/**
 * 設定文件的**標籤資料**（屬性正規化・驅散/狂暴/增益過濾・潛行/嘲諷）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigBerserkDoc,
  zConfigDispelDoc,
  zConfigStatNormalizationDoc,
  zConfigAugmentFilterDoc,
  zConfigStealthDoc,
  zConfigTauntDoc,
} from "@ggd/shared/content";
import type { ConfigDocSpec } from "../engine";
import { derivedFields, specFromZod } from "../schemaToForm";

// ⭐ GH#992（2026-09-07）：正規化那 247 格的**人話搬回 Zod** —— 在此之前這個檔有一支
//   `generatedNormalizationFields()` 產生器（四族迴圈）＋ 一張 31 列的 `NORM_HAND_WRITTEN`
//   手寫表，而**結構**住 `packages/shared/src/content/schema/config/statNormalization.ts`
//   ⇒ 同一格欄位有兩個住處（第〇·四守則）。⛔ 這不是刪掉，是**搬家**：模板（六族）與
//   owner 裁決那 31 格逐字都在那個 schema 檔的 `NORM_PROSE` / `zBandsFor` 那一段。

export const STAT_NORMALIZATION_SPEC: ConfigDocSpec<"statNormalization"> = {
  page: "statNormalization",
  collection: "config",
  docId: "stat-normalization",
  schemaTag: "config.stat-normalization@1",
  zod: zConfigStatNormalizationDoc,
  title: "英雄屬性正規化",
  intro: [
    "owner 2026-08-12：「我的**極大極小就是為了極端例外而誕生**(ex 牙膏 熊貓等)，**不需要考慮平均分佈問題，只有小中大才是真正的分佈**⋯極小與極大只是**限制合理的上下限**(例如攻速上限 4)」。",
    "⭐ 所以這一頁只有**小 / 中 / 大**三格。**極小 / 極大 不在這裡** —— 它們是硬上下限，住在「屬性上限」頁（`config.stat-caps@1`）。個案 0 是正常狀態，不是缺陷。",
    "⭐ 這一版只套用**移動速度**與**魔抗**。量到它們今天的自然跨度只有 1.20~1.22 倍（全 roster 最強與最弱只差兩成），等於**不區分英雄**；owner 因此改成由**角色定位**決定，而不是照歷史數值分帶。",
    "角色定位怎麼判：**主屬性（lv10 權重）× 攻擊型別** —— 智慧主＝法師、力量主+近戰＝坦克、敏捷主+近戰＝近戰、遠程＝遠程。⭐ 忠於 WC3 原作模型（這個專案是 w3x 移植，英雄卡本來就帶三圍）。英雄卡上填了 `archetype` 就以那裡為準。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/stat-normalization.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/statNormalization.ts 的 resolveChampionStats（全專案唯一知道「級別怎麼變成數字」的地方）← content/registries.ts 的 registerAll，在英雄註冊時改寫 baseStats；商店預覽／選人畫面／後台全部走同一份註冊表",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完），客戶端要重新載入 bundle。和 冷卻規則／AoE 級距 同一個形態(#278)。",
  // ⭐ 順序＝schema 的宣告順序（`@order` 可以覆寫）—— 一個決定只住一個地方。
  fields: derivedFields(zConfigStatNormalizationDoc, []),
  // ⚠️ `appliesTo` 是一個陣列 —— 表單引擎只畫純量，所以它原封帶走。
  //    要開啟別的屬性請直接改 content/config/stat-normalization.json 或用 API。
  //    ⭐ 這一格刻意不做成表單：它決定「正規化到底動了什麼」，
  //    誤點一下的代價是全 roster 的數值一起變，不該跟其他旋鈕一樣好按。
  preserved: [
    {
      path: "appliesTo",
      why: "它決定「正規化到底動了什麼」。掉了 = 這一頁的其餘旋鈕全部變成裝飾（存得下去、場上沒反應），而那看起來跟正常一模一樣。⭐ 刻意不做成表單欄位：誤點一下的代價是全 roster 的數值一起變。",
    },
  ],
};

export const DISPEL_SPEC: ConfigDocSpec<"dispelRules"> = {
  page: "dispelRules",
  collection: "config",
  docId: "dispel",
  schemaTag: "config.dispel@1",
  zod: zConfigDispelDoc,
  title: "淨化規則",
  intro: [
    "一發【淨化】拔掉什麼：哪幾池（狀態／延燒／護盾／增益來源）、每一池最多拔幾層、拔不完時留下哪幾個。",
    "⚠️ **三個「沒標時算不算可拔」是這一頁唯一會真的改變平衡的三格**，而出貨值是刻意不對稱的：狀態與延燒開著（減速／纏繞／燃燒本來就該解得掉，關掉的話【淨化】上線當天什麼都拔不到，而那看起來跟功能壞掉一模一樣），增益來源關著（沒有人預期自己買的裝備效果可以被敵人剝掉）。",
    "⚠️ 這一頁**不影響復活與回合重置** —— 那兩條走的是另一支函式（`clearForFreshBody`），因為它們不是淨化而是重置：一個標了不可驅散的減速也不可以跨過墳墓活下來。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/dispel.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。⭐ 反過來也成立：**這一頁就是線上唯一真的生效的地方** —— 平衡值要上線，在這裡改並存檔，⛔ 不是改那個檔案再 deploy。",
    "⭐ **「解除全部負面狀態」現在是真的**（owner 2026-08-18「理論上淨化就是解掉所有負面狀態阿」）：下面的「一發淨化每一池最多拔幾層」出貨值是 **50**，實務上等於不設限；**這一格最高填到 60**（owner 同一則的追加「上限改成 60, 後台可調」）。⛔ 這個數字不是「總共只有 26 種可淨化減益」那樣算出來的 —— 引擎是**一筆一筆**算的（同一種減速由 30 隻殭屍各掛一次就是 30 筆），所以筆數沒有種類數那個天花板。",
    "⭐ **想做一張連 [狂戰士]／[暴走] 這種正向增益也一起解掉的淨化？** 那是**逐張卡**的三格，不是這一頁的開關（這一頁只管「作者沒表態時的預設」）。在那一份技能／寶具的 dispel 效果上填：①「極性」＝ buff（只拔增益）或 any（正負一起拔），出貨預設是 debuff＝只拔減益；②「清哪幾池」把「增益來源」勾起來；③ 而**被拔的那一份增益自己也要同意** —— 它的 applyBuff 要填「可被驅散＝是」而且「極性＝buff」。三格缺一，勾了也一筆都不會掉，而且**畫面上跟正常一模一樣**（這是刻意的：沒有人預期自己買的裝備被敵人剝掉，所以「不知道」不當成「是」）。想讓所有沒表態的增益一律可拔，就是下面那格「沒標『可驅散』的增益來源算不算可拔」——⚠️ 那一格是全域的，打開之後**所有人的裝備被動**都變成可以被敵方淨化剝走。",
  ],
  consumer:
    "packages/shared/src/sim/effects/dispel.ts（每一發 dispel effect 都會呼叫，讀 world.dispelRules 的其中十一格）→ sim/clearPools.ts；⭐ 第十二格「沒標極性但整份都是負值⋯」的讀取端**不在那裡** —— 它是 packages/shared/src/sim/effects/applyBuff.ts，在**掛上去的那一刻**決定極性（而不是淨化發生的那一刻），因為極性住在施加時寫下的欄位；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.dispelRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／暴走規則／基礎加成 同一個形態(#278)。",
  fields: derivedFields(zConfigDispelDoc, []),
  preserved: [],
};

export const BERSERK_SPEC: ConfigDocSpec<"berserkRules"> = {
  page: "berserkRules",
  collection: "config",
  docId: "berserk",
  schemaTag: "config.berserk@1",
  zod: zConfigBerserkDoc,
  title: "暴走規則",
  intro: [
    "暴走（59-00 初號機那一族）的三格：主動暴走可以按下去的生命門檻、暴走期間施法的冷卻倍率、以及這兩格套用在誰身上。",
    "⚠️ **這一頁在 2026-08-05 之前不存在，而遊戲一直在讀這三個值。** `sim/abilities/berserkRules.ts` 早就有預設表與解析器、`SimWorld` 有欄位、`abilitySystem` 有兩處在讀 —— 少的只是文件、schema、這一頁與那條接線。所以那個解析器從上架起沒有拿到過一份真的文件，三格的值只能是程式裡寫死的那一份。",
    "出貨值**逐字等於**當時寫死的預設（15% / 2 倍 / 只管主動技），所以這一頁上線不改變任何平衡 —— 它把三個本來改不到的數字變成改得到的。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/berserk.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果，要改就從這一頁改。",
  ],
  consumer:
    "packages/shared/src/sim/abilities/abilitySystem.ts 的 berserkCastBlock()（每一次按技能都會呼叫，讀 world.berserkRules.castHpPct）與 berserkCooldownFactor()（施法成功時讀 cooldownMult）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.berserkRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 格擋規則／護盾規則／基礎加成 同一個形態(#278)：shard 開機載入內容樹時讀一次就定格。",
  fields: derivedFields(zConfigBerserkDoc, []),
  preserved: [],
};

// ──────────────────────────── 增益卡敵方過濾 (config/augment-filter) ──

export const AUGMENT_FILTER_SPEC: ConfigDocSpec<"augmentEnemyFilter"> = specFromZod(zConfigAugmentFilterDoc, "augmentEnemyFilter");

// ────────────────────────────────────────────── 隱形規則 (config/stealth) ──

export const STEALTH_SPEC: ConfigDocSpec<"stealthRules"> = {
  page: "stealthRules",
  collection: "config",
  docId: "stealth",
  schemaTag: "config.stealth@1",
  zod: zConfigStealthDoc,
  title: "隱形規則",
  intro: [
    "誰看得見隱形單位、隱形擋掉哪幾種被指定的方式、以及什麼動作會破隱。目前場上有三位英雄用到：小次郎（27-00 永久性的隱形術，站著不動 4 秒後消失）、夏娜（21-00 灼眼）與通靈者（16-00 通靈能力）這兩支真視。",
    "出貨值**全部是 WC3 原作行為**，所以這一頁不動也不會有事；它存在是為了讓「隱形到底擋不擋得住什麼」變成可以改的，而不是藏在程式裡的四個 if。",
    "⚠️ **這不是防作弊。** 隱形單位的座標照樣送到每一個客戶端，只是客戶端不畫它；改過的客戶端還是看得到位置。owner 明確知道並接受這個取捨（家用局沒有作弊疑慮），要真的擋住必須改成每隊一份快照，那是另一件事。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/stealth.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/stealth.ts 的 canSee()／stealthSystem()（每一 tick 跑，被 sim/targeting.ts 的三個索敵謂詞與 MobSystem 讀）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.stealthRules，兩個不透明度另外由客戶端 ContentDb.load → applyStealthDoc 讀走",
  effect:
    "**索敵那幾格要重啟 game-server shard 才生效**（和 護盾規則／基礎加成 同一個形態 #278：shard 開機載入內容樹時讀一次就定格）。兩個**不透明度**與**血條開關**是客戶端讀的，玩家**重新整理遊戲頁面**就生效。",
  fields: derivedFields(zConfigStealthDoc, []),
  preserved: [],
};

// ────────────────────────────────────────────── 嘲弄規則 (config/taunt) ──

export const TAUNT_SPEC: ConfigDocSpec<"tauntRules"> = {
  page: "tauntRules",
  collection: "config",
  docId: "taunt",
  schemaTag: "config.taunt@1",
  zod: zConfigTauntDoc,
  title: "嘲弄規則",
  intro: [
    "[嘲弄] 是遊戲裡**唯一**會強迫一個單位改打別人的機制 —— 目前只有一件道具用到：鍊金術之盾（每秒把周圍敵人拉過來打自己 0.5 秒）。這一頁決定它拉得動誰、拉多久、以及它能不能從**玩家自己手上**把目標搶走。",
    "⚠️ 這是坦克類道具唯一的存在理由，也是最容易讓人覺得「操作被搶走」的機制。出貨值全部選保守側：嘲弄只接管**自動索敵**與 bot／殭屍的 aggro，玩家右鍵點名的目標一個 tick 都不會被動到。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/taunt.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/taunt.ts 的 tauntedBy()／applyTaunt()，經由 sim/targeting.ts 的 forcedTargetOf() 被三個索敵消費端讀（OrderSystem 的自動索敵、Tier0Brain 的 bot 迴圈、MobSystem 的殭屍 aggro）；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.tauntRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場（和 護盾規則／隱形規則／基礎加成 同一個形態 #278：shard 開機載入內容樹時讀一次就定格）。",
  fields: derivedFields(zConfigTauntDoc, []),
  preserved: [],
};

