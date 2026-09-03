/**
 * 設定文件的**標籤資料**（編寫規則・新英雄檢查・內容載入・吟唱時間）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigCastTimeDoc,
  zConfigContentLoadDoc,
  zConfigAuthoringRulesDoc,
  zConfigIconUploadDoc,
} from "@ggd/shared/content";
// ⛔ 級距名只有一份（GH#414）—— 後台不重打一組字串。
// ⭐ 2026-08-21（owner「後台設定及說明⋯**全部都是推導動態即時產生**」）：連
//    「決鬥區半徑」與「這一格是半徑的幾分之幾」也一起從梯子讀 —— 那兩個數字在
//    這一頁的說明裡出現過 6 次，而 GH#463 改名之後其中三處**當場變成假的**
//    （「中 = 4.5」變成 6、「大 = 6」變成 8），⛔ 而且 `content:build` 是綠的。
import {
  SKILL_TIER_NAMES,
} from "@ggd/shared/content/skillTiers";
// ⛔ 形狀名（單體／範圍／變身）也只有一份 —— 後台不重打一組字串（同上一行）。
import { COOLDOWN_SHAPES, DEFAULT_COOLDOWN_TIERS } from "@ggd/shared/content/cooldownTiers";
// ⛔ 傷害級距的五個數字也只有一份 —— 相稱性下拉的選項說明從它推導。
import {
  DEFAULT_DAMAGE_TIERS,
} from "@ggd/shared/content/damageTiers";
// ⭐ GH#445 —— 「傷害相對冷卻偏低」那一條警示的說明是**現算**的（哪幾格、低幾 %、
//    要跳到哪一級），⛔ 不是後台手寫的一段會過期的散文。
import { describeLowDamageCells } from "@ggd/shared/content/lowDamageCells";
// ⭐ GH#465 三選一 —— 下拉的**選項標籤與說明都是算出來的**（每個模型的十格），
//    ⛔ 不是手寫「這是方案 B」那種對操作者不構成資訊的字。
import {
  DEFAULT_AIM_RISK_MULT,
  DEFAULT_EXPECTED_HITS,
  PROPORTIONALITY_MODELS,
  describeProportionalityModels,
  tableForModel,
  DEFAULT_MAX_TIERS_ABOVE_MIN,
  describeProportionalityCeiling,
} from "@ggd/shared/content/proportionality";
// 創建新英雄的警示開關（GH#480）—— 深路徑：這一份的 Zod 與**規則清單本體**住同一個
// 檔（schema 的 `rules` 物件是從 `NEW_HERO_WARN_RULES` 推導的），⛔ 拆開就會 drift。
import {
  NEW_HERO_CHECKS_DOC_ID,
  NEW_HERO_CHECKS_SCHEMA,
  zConfigNewHeroChecksDoc,
} from "@ggd/shared/content/newHeroChecks";
import type { ConfigDocSpec } from "../engine";
export const AUTHORING_RULES_SPEC: ConfigDocSpec<"authoringRules"> = {
  page: "authoringRules",
  collection: "config",
  docId: "authoring-rules",
  schemaTag: "config.authoring-rules@1",
  zod: zConfigAuthoringRulesDoc,
  title: "編輯器創作規則",
  intro: [
    "外部技能編輯器（Codex 那一支）建包時看到的**原則界**。GH#327。",
    "⭐ **這一頁只有原則界,⛔ 硬界不在這裡。** 硬界（升階冷卻上升、AoE 超過決鬥區、階數不符）從既有的 Zod 界與「吟唱規則 / 冷卻規則 / AoE 級距 / 屬性上限」四頁**推導**出來 —— 抄一份到這裡就是第二個住處,而它一定會過期。",
    "⚠️ **違反原則界只警告,不擋。** owner 2026-08-12 的原話是「**原則上**附加技能升級冷卻不會增加」—— 保留刻意破例的空間。一律擋 = 想破例就得改程式;一律放 = 真缺陷跟設計選擇混在同一堆訊息裡。",
    "⭐ 改這一頁 → 端點 `GET /api/v1/content-import/authoring-rules` **下一秒就變**,外部編輯器不用改一行程式。那正是它取代散文的理由。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/）,**覆蓋層會蓋掉 `content/config/authoring-rules.json`**。",
  ],
  consumer:
    "packages/shared/src/content/authoringRules.ts 的 buildAuthoringRules()（唯一知道這些界怎麼組的地方）← content-api 的 /authoring-rules 端點 + content/editor-target-profile.json 的內嵌副本",
  effect: "**外部編輯器下一次讀端點就生效**;內嵌在 profile 裡的那一份要重跑 `pnpm content:build`。",
  fields: [
    {
      path: "singleTargetCooldown.min",
      zh: "單體技能冷卻下限",
      note: "出貨 **{{出貨值}} 秒**。低於它的單體技能等於「一直按」,而那會讓其他技能的存在感消失。⚠️ 只警告不擋。",
    },
    {
      path: "singleTargetCooldown.max",
      zh: "單體技能冷卻上限",
      note: "出貨 **{{出貨值}} 秒**。高於它玩家一場只放得出幾次,而單體技能的定位是常用手段。",
    },
    {
      path: "aoeCooldown.min",
      zh: "範圍技能冷卻下限",
      note: "出貨 **{{出貨值}} 秒** —— 比單體技能長,因為它一次打到很多人;冷卻太短會讓範圍技變成常態手段,而單體技能失去存在的理由。",
    },
    {
      path: "aoeCooldown.max",
      zh: "範圍技能冷卻上限",
      note: "出貨 **{{出貨值}} 秒**。高於它的範圍技一場放不到兩次,那個定位應該用「變身/長持續」那一條界,而不是把範圍技拉長。",
    },
    {
      path: "transformCooldownMin",
      zh: "變身／長持續冷卻下限",
      note: "出貨 **{{出貨值}} 秒**。⭐ 只有下限沒有上限是刻意的:這一類技能的價值來自「一場只有幾次」,冷卻太短會讓變身變成常態 —— 那等於直接改了那位英雄的基礎形態。",
    },
    // ⭐ GH#465 —— 相稱性。⛔ 十五格不是手打的（第零守則⑨：N 個同型 = K 個模板
    //    + 一張表）；形狀名與級距名都從 shared 的常數來，⛔ 後台不另立一組字串。
    {
      path: "proportionality.enabled",
      zh: "相稱性檢查總開關",
      note: "關掉之後，「付得多、打得少、傷害又低」的組合**完全不會**出現在編輯器的警告清單裡。⚠️ 關掉不會讓那些技能上不了線 —— 這一整族本來就只警告不擋。",
    },
    // ⭐ GH#465 三選一（owner 2026-08-20「fix #465, 3 suggestions?」）——
    //    ⛔ 我沒有替他挑，三條路都做成一格下拉，出貨 = **今天的行為**。
    {
      path: "proportionality.model",
      zh: "相稱性模型（三選一）",
      // ⛔ 四個選項的標籤把**那個模型的範圍五格**帶上，⛔ 不是只寫一個代號 ——
      //    「這是方案 B」對操作者不構成資訊，「範圍＝大/極大/極大/極大/極大」才是。
      optionLabels: Object.fromEntries(
        PROPORTIONALITY_MODELS.map((m) => [
          m,
          m === "custom"
            ? "custom 手填（吃下面十五格）"
            : `${m}：範圍＝${SKILL_TIER_NAMES.map(
                (t) =>
                  tableForModel(
                    m,
                    DEFAULT_COOLDOWN_TIERS.seconds,
                    DEFAULT_DAMAGE_TIERS.damage,
                    DEFAULT_EXPECTED_HITS,
                    DEFAULT_AIM_RISK_MULT,
                  )["範圍"][t],
              ).join("/")}`,
        ]),
      ),
      note:
        "**哪一個模型推導下面那十五格。** 這一格存在的理由是 owner 自己的兩句話打架：" +
        "2026-08-19 手填「範圍・極小要配傷害**大**」，2026-08-20 給的公式算出來是「**小**」" +
        "（差 3 倍／兩級）。⛔ 三條路都做出來了，⭐ 出貨是 **formula ＝ 今天的行為**。" +
        describeProportionalityModels(
          DEFAULT_COOLDOWN_TIERS.seconds,
          DEFAULT_DAMAGE_TIERS.damage,
          DEFAULT_EXPECTED_HITS,
          DEFAULT_AIM_RISK_MULT,
        ) +
        "⚠️ 改這一格會**同時**改掉範圍那五條警告，⛔ 不影響任何技能上不上得了線。",
    },
    // ⭐ 方案 C 的第二個係數 —— 與「打到幾個人」刻意分開。
    ...COOLDOWN_SHAPES.map((shape) => ({
      path: `proportionality.aimRiskMult.${shape}`,
      zh: `${shape}・瞄準風險倍率`,
      note:
        `一支「${shape}」形狀的技能**有多容易一個人都沒打到** —— 要求傷害再乘這個數字。` +
        "**1 ＝ 沒有額外要求**（＝ 公式本身）。⚠️ **只有上面的模型選 `aimRisk` 時才生效**。" +
        "⭐ 它與「期望命中人數」刻意是**兩格**：「打到幾個人」與「有多容易完全落空」是" +
        "兩件不同的事，混成一格的代價是 owner 親口說的「**2 個人**」會被改寫成 0.67 人，" +
        "而那格 config 從此在說謊。⚠️ 出貨「範圍」那格是**反算**出來的：切到 `aimRisk` " +
        "就會重現 owner 2026-08-19 手填的「範圍・極小 → 大」。",
    })),
    // ⭐ owner 2026-08-20 給的那個係數 —— 十五格現在是**從這三個數字推導**出來的。
    ...COOLDOWN_SHAPES.map((shape) => ({
      path: `proportionality.expectedHits.${shape}`,
      zh: `${shape}・期望命中人數`,
      note:
        `一支「${shape}」形狀的技能，一次期望打到幾個人。⭐ 它是 GH#465 整張表的**唯一係數**：` +
        "要求傷害 = 單位輸出率 × 這一格的卡面冷卻 ÷ 這個數字。owner 2026-08-20：" +
        "「**30/6秒=5，所以是 5 倍差距**，但由於是極小還是有可能位於 **2 個人的命中範圍，" +
        "所以再除 2**，最後結論**約等於 2.5 倍**」。⚠️ 量到的是 **1.33 人**，" +
        "owner 自己進位成 **2** —— 那是他的裁決，⛔ 不是四捨五入。" +
        "⛔ **填 0 ＝ 這個形狀豁免**（出貨「變身」就是 0：它的回報軸不是傷害，" +
        "對它要求最低傷害等於逼作者在變身技上填傷害）。" +
        "⚠️ 調小這個數字會**同時收緊**該形狀的五格；調大會放鬆。",
    })),
    ...COOLDOWN_SHAPES.flatMap((shape) =>
      SKILL_TIER_NAMES.map((tier) => ({
        path: `proportionality.minDamageTier.${shape}.${tier}`,
        zh: `${shape}・冷卻 ${tier} → 傷害至少`,
        // ⛔ 五個選項的說明從 `DEFAULT_DAMAGE_TIERS` 推導，⛔ 不抄字面值
        //    （第二守則：測試／後台裡抄一份出貨值就是第四個住處）。
        optionLabels: Object.fromEntries(
          SKILL_TIER_NAMES.map((t) => [t, `${t}（${DEFAULT_DAMAGE_TIERS.damage[t]} 傷害）`]),
        ),
        note:
          `一支「${shape}」形狀、冷卻級距填「${tier}」的技能，傷害級距至少要到哪一格才算相稱。` +
          "填「極小」＝**不構成限制**（那是傷害軸的第一格）。⚠️ 違反只**警告不擋**。" +
          "⚠️ ⛔ **這一格只有在上面的「相稱性模型」選 `custom` 時才生效** —— 其餘三個模型" +
          "都是**現推**的（改了模型，十五格自己跟著動）。⇒ 想做**刻意的單格破例**，" +
          "先把模型切到 `custom`，這裡才是效力來源。" +
          "⭐ 出貨值 = `formula` 推出來的那一份（owner 2026-08-20 的 2.5× 邏輯）：要求傷害 = " +
          "單位輸出率 × 這一格的卡面冷卻 ÷「期望命中人數」。",
      })),
    ),
    // ⭐ GH#616 —— 相稱性的**另一半**。⛔ 在此之前這條原則只有下限。
    {
      path: "proportionality.maxTiersAboveMin",
      zh: "傷害級距最多高出最低要求幾格",
      note:
        "**上限。** 級距梯子的正當性是 owner Q4 的「傷害與冷卻**嚴格成正比**」—— " +
        "那是一個**等式**，⛔ 不是不等式。一支冷卻只值「小」而傷害填「極大」的技能，" +
        "破壞的是**同一條**原則的另一邊，而在 2026-08-23 之前這一側**一格閘都沒有**。" +
        "⭐ **出貨 {{出貨值}} 是 Claude 挑的，⛔ 不是 owner 的裁決**（他的常設指令是" +
        "「沒做完以前別問我了自己判斷 但是留後台開關可以簡易 rollback」）：量到出貨 217 個" +
        "有卡面冷卻的傷害節點，高出 ≤0 級 193 個、**+1 級 22 個**、**+2 級 2 個**、+3 以上 0 個。" +
        "⛔ 不挑 0（最低那一側是無條件**進位**的，帶寬 0 會把「完全照公式填」的節點判成違規）；" +
        "⛔ 不挑 2 以上（今天一格都指不到 ＝ 永遠不會紅的閘）。" +
        describeProportionalityCeiling(
          DEFAULT_COOLDOWN_TIERS.seconds,
          DEFAULT_DAMAGE_TIERS.damage,
          DEFAULT_EXPECTED_HITS,
          DEFAULT_AIM_RISK_MULT,
          DEFAULT_MAX_TIERS_ABOVE_MIN,
        ),
    },
  ],
  preserved: [],
};

/**
 * 創建新英雄的**警示開關**（GH#480）。
 *
 * ⚠️ 這一頁與 編輯器創作規則 是**兩層不同的東西**，刻意分開：那一頁調的是
 * 「一支技能的冷卻該落在哪個區間」（規則的**內容**），這一頁調的是
 * 「哪幾條規則要在作者存檔的那一刻跳出來」（規則的**開關**）。
 */
export const NEW_HERO_CHECKS_SPEC: ConfigDocSpec<"newHeroChecks"> = {
  page: "newHeroChecks",
  collection: "config",
  docId: NEW_HERO_CHECKS_DOC_ID,
  schemaTag: NEW_HERO_CHECKS_SCHEMA,
  zod: zConfigNewHeroChecksDoc,
  title: "新英雄檢查警示",
  intro: [
    "建立一位新英雄時，**按下建立的那一刻**要跳哪幾條警示。owner 2026-08-20：「⋯**生成代入與檢查跳警示**都要記得更新，特別是 **script 程式自動化跟警示**的部分」。",
    "⭐ 七條**全部只警告、一條都不擋**（owner 2026-08-12：「只是個警告標記，並不會擋」）。唯一標成 block 的是「超出 Zod 上下界」，而那是**事實陳述** —— 伺服器真的會 422，⛔ 不是這一頁決定要擋。",
    "⚠️ 關掉一條的代價是**它變回靜默**：那個問題仍然存在，只是要等到 `content:build`（或更晚，等到玩家撞上）才會被發現。⛔ 關掉之前先想清楚「那誰會告訴作者？」",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/new-hero-checks.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/newHeroChecks.ts 的 newHeroChecksFromDoc()（唯一知道這幾格怎麼作用的地方）← apps/admin 的 heroForgePage.ts（鑄英雄工坊的目錄載入）與 heroTemplate.ts（新英雄模板頁），以及 authoringRules.ts 把同一份開關送給外部編輯器",
  effect:
    "**後台這兩頁下一次重新載入時生效**（它們開頁時抓一次這份文件）；外部編輯器則是下一次讀 `/authoring-rules` 端點就變。",
  fields: [
    {
      path: "rules.empty-column",
      zh: "六欄留白",
      note: "說明／施展距離／範圍／傷害／冷卻／耗魔 這一格該有而是空的或 0 時跳。⚠️ 不適用的組合不算（self 技沒有施展距離）。關掉它，一位六欄全空的新英雄可以一路存進內容庫而 `content:build` 全綠。",
    },
    {
      path: "rules.out-of-bounds",
      zh: "超出 Zod 上下界",
      note: "界線**從出貨 schema 讀**，⛔ 不抄字面值。這一類寫進去伺服器會 422，所以關掉它不會讓那份草稿存得進去 —— 只會讓作者填完整張表才在儲存時吃到一串英文錯誤。",
    },
    {
      path: "rules.principle-band",
      zh: "冷卻不在原則區間",
      note: "冷卻落在「編輯器創作規則」那一頁的單體／範圍區間外時跳。⚠️ owner 說的是「原則上」，所以它保留刻意破例的空間 —— 如果你的這一批英雄就是要破例，關掉它比讓作者習慣忽略警告好。",
    },
    {
      path: "rules.claim-mismatch",
      zh: "說明的數字對不上 JSON",
      note: "卡面寫「25 秒冷卻」而 `cooldown` 是 60 時跳（冷卻／耗魔／持續／傷害四類）。⛔ 模板技整條不判 —— 它的 effects 在磁碟上本來就是空的，判下去 100% 誤報，而一條會誤報的警示會被下一個人整條關掉。",
    },
    {
      path: "rules.no-op-effect",
      zh: "說了但不會發生",
      note: "整棵效果樹一個數字都動不到時跳（第一·五守則：卡片上不可以有「說了但不會發生」的字）。關掉它，一張印著效果、遊戲裡什麼都不發生的技能卡會完全靜默地上線。",
    },
    {
      path: "rules.dialogue-claim",
      zh: "機制數字寫進了台詞",
      note: "⭐「」裡是**角色對白不是效果** —— 寫在裡面的冷卻／耗魔／傷害／持續引擎一格都不讀。這是七條裡唯一沒有前例的一條：既有的每一支都只做到「剝掉台詞」，於是作者永遠不知道他剛剛寫了一句不會生效的話。",
    },
    {
      // ⭐ GH#445 —— owner 2026-08-20：「**傷害太低要跳出警告清單給我，後台跟 codex
      //    編輯器也同步跳警告**」。⛔ 這一格的說明**不是手寫的**：
      //    `describeLowDamageCells()` 現算「哪幾格、低幾 %、要跳到哪一級」，
      //    所以後台看到的話與 `docs/傷害偏低警告清單.md`、與 codex 端點
      //    **不可能分岔**（它們是同一個函式的三個呼叫點）。
      path: "rules.low-damage-cell",
      zh: "傷害相對冷卻偏低",
      note:
        `${describeLowDamageCells()}` +
        "⚠️ 這一條**沒有門檻可以在這裡調**：判準是「低於錨點」，而錨點是傷害五級距表" +
        "自己的起點。⇒ 要放寬就去調上游那三張表（**冷卻五級距** / **傷害五級距** / " +
        "**編輯器創作規則**的「期望命中人數」），這一條下一秒就跟著動。" +
        "⭐ 同一份推導還有兩個消費端：`pnpm lowdmg:build` 產的 " +
        "`docs/傷害偏低警告清單.md`，以及「創建新英雄」的冷卻預設 —— " +
        "生成的新技能**不會出生在**這幾格裡。",
    },
    {
      path: "minSample",
      zh: "中位數的最小樣本數",
      note: "六欄預設值從出貨技能語料取中位數時，同一桶（同槽位＋同施放型態）少於這個數就往上一層退（槽位 → 全語料 → 保守值）。調小＝更貼那一格的同型技能但更容易被三五支離群值帶偏；調大＝更穩但多數格子會退到全語料中位數。⚠️ 上界 200：出貨語料才 420 支，填 800 等於每一格都退到最後的保守值，而畫面上看起來完全正常。",
    },
    {
      path: "autofillDescription",
      zh: "自動代入技能說明",
      note: "新技能出生時要不要用**同一組數字**生一段機制說明（「指定單一敵人，施法距離 9.5，造成 160 點傷害。冷卻 32.5 秒，消耗[MP] 60。」）。⭐ 開著的價值是「說明↔JSON 一致」依構造成立；關掉之後那一格是空的，而空說明在卡片上就是一片空白。",
    },
  ],
  // 兩格純量 + 一個固定形狀的 rules 物件，沒有不編輯的分支要原封帶走。
  preserved: [],
};

export const CONTENT_LOAD_SPEC: ConfigDocSpec<"contentLoad"> = {
  page: "contentLoad",
  collection: "config",
  docId: "content-load",
  schemaTag: "config.content-load@1",
  zod: zConfigContentLoadDoc,
  title: "內容載入政策",
  intro: [
    "一份壞掉的內容文件，要不要殺掉**整份**內容。owner 2026-08-14：「遊戲主程式應該要把**全有全無**的這種奇怪機制改掉，應該改為**不同部分各自 check 載入成功**」。",
    "⭐ 這一頁存在是因為那個「全有全無」其實只是一行程式的決定，不是架構限制 —— `loader.ts` 從第一天就**逐份**收集錯誤（每一份壞的都記下 collection、id、Zod 的逐條 issue），只是最後一行把整批丟掉。",
    "⚠️ **代價已經發生過兩次**（2026-08-01、08-02）：四份 config 文件的 schema tag 不在已部署映像的 Zod union 裡 → 內容載入整份失敗 → 客戶端 fail-open 退回 2 隻骨架英雄 → 選人畫面空掉、沒有人進得去。**而網站看起來完全正常**，唯一說實話的是 console 一行 log。隔離之後，同一次的結果會是「少四份設定」。",
    "⛔ **隔離不等於安靜**：被隔離的每一份都會出現在 game shard 的 `GET /healthz` 的 `content.quarantined` 與 `content.quarantinedDocs`，開機 log 也會逐份印出來。那是這一頁能存在的前提 —— 一個沒有人知道的隔離，比整份失敗更糟。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/content-load.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/loader.ts 的 ContentLoader.load()（唯一知道這三格怎麼作用的地方）← game-server 開機、客戶端 main.tsx 的內容載入都走它。⚠️ 政策文件自己也在被載入的那一批裡，所以它**在迴圈跑完之後才被讀**；它自己壞掉時退回出貨預設，而且會出現在隔離清單裡。",
  effect:
    "**要重啟 game-server shard 才生效**（客戶端則是下一次重新整理）。",
  fields: [
    {
      path: "policy",
      zh: "一份壞文件的處置",
      note: "`quarantine`（出貨）= 壞的那幾份不進登錄表，其餘照常載入。`fail-closed` = 舊行為，任何一份壞掉整份失敗。⚠️ 舊行為在客戶端的樣子不是錯誤畫面，是**悄悄退回 2 隻骨架英雄** —— 那正是 owner 要廢掉它的理由。",
      optionLabels: {
        quarantine: "quarantine（隔離壞的、好的照跑）",
        "fail-closed": "fail-closed（舊行為：一份壞掉整份失敗）",
      },
    },
    {
      path: "cascadeDanglingRefs",
      zh: "隔離會不會傳染",
      note: "文件 A 硬參照到被隔離的 B 時，A 要不要也被隔離。⭐ 開著（出貨）擋的是**半個世界**：英雄載進來、他的 Q 沒載進來 = 一格空技能，而且沒有人會發現。寧可少一隻英雄，⛔ 不要一隻壞掉的英雄。關掉的話那些斷掉的參照會降級成警告，文件留著。",
    },
    {
      path: "maxQuarantined",
      zh: "隔離上限（超過就退回全有全無）",
      note: "隔離超過幾份就改用 `fail-closed`。出貨 **{{出貨值}}**。⚠️ 這是 quarantine 的安全閥：「少四份設定」與「內容整份跟這個映像不相容」是兩件事，而後者隔離出來的結果是一個**空的遊戲** —— 那比誠實地退回骨架更糟，因為骨架至少會讓 `/healthz` 的 `content.ok` 變 false。填 0 ＝ 完全不容忍（等於 fail-closed）。",
    },
  ],
  // 三格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ── 🖼 編輯器 icon 上傳（config/icon-upload）—— GH#966 ──────────────────────
export const ICON_UPLOAD_SPEC: ConfigDocSpec<"iconUpload"> = {
  page: "iconUpload",
  collection: "config",
  docId: "icon-upload",
  schemaTag: "config.icon-upload@1",
  zod: zConfigIconUploadDoc,
  title: "編輯器 icon 上傳",
  intro: [
    "owner 2026-09-02：「codex 技能編輯器要能**打包 icon 圖片**。設計者可以用 codex 技能編輯器**上傳設定圖片檔（但不是真的馬上上傳）**，而編輯器會**自動縮圖轉檔放入一起打包**」",
    "⭐ 流程：編技能 → 選一張自己畫的圖（**先留在編輯器裡**，⛔ 不上傳）→ 匯出時圖跟技能 JSON **進同一個 zip**（路徑 `assets/icon/<collection>/<技能 id>/source.png`）→ Main 收到後驗位元組、轉成出貨規格（128² WebP q90）、存進 `content/assets/icons/`、把文件的 `icon` 欄位指過去。",
    "⛔⛔ **在此之前放進 zip 的圖會無聲消失** —— 傳輸層把每一個檔都當 UTF-8 文字讀，然後把不是 `authoring/` 的路徑**靜靜跳過**。症狀是最糟的一種：匯出成功·上傳成功·validate 通過·⛔ 而 icon 不見了。⭐ 現在 zip 裡有而 manifest 沒宣告（或反過來）會**報錯並指名那個路徑**。",
    "⚠️ ⭐ **編輯器不可以自己轉檔** —— 轉檔規則只有一個住處（`packages/shared/src/content/icons/encodeIcon.ts`，CLI 與 API 共用）。兩份實作的症狀是「預覽看到的圖 ≠ 遊戲裡的圖」，⛔ 而沒有任何東西會紅。編輯器要預覽就顯示**原圖縮放**。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/icon-upload.json`**。",
  ],
  consumer:
    "apps/content-api/src/importRoutes.ts 的 `iconPolicy()` → `checkIconAssets()`（驗）與 `landIconAssets()`（轉檔＋落地）。⚠️ 兩條路都在 `POST /api/v1/content-import/{validate,apply}` 底下，⛔ 而 `/validate` 一個位元組都不寫。",
  effect:
    "**下一次匯入就生效**（每一次請求都重讀這份設定，⛔ 不快取）。⛔ 不必重新部署、⛔ 不必重啟。",
  fields: [
    {
      path: "enabled",
      zh: "收不收編輯器打包的 icon（總開關）",
      note:
        "⭐⭐ **這一格就是這個功能的一鍵 rollback。** 出貨 **{{出貨值}}**。" +
        "⛔ 關掉之後，帶 icon 的包會被**明確拒絕**（診斷碼 `ASSET_UPLOAD_DISABLED`）—— " +
        "⭐ 而不是靜靜地把圖丟掉，⚠️ 因為「靜靜丟掉」正是這張票要修的那個 bug。" +
        "⚠️ 關掉**不會**動到任何已經落地的 icon（那些檔案照常出貨）。",
    },
    {
      path: "requiresReview",
      zh: "上線後留一筆待審紀錄",
      note:
        "出貨 **{{出貨值}}**。⭐ 開著時，每一次落地的 icon 會寫進匯入稽核尾巴" +
        "（`content-import.icon-pending-review`），供批次審查頁列出來。" +
        "⚠️ ⭐ 它**不是事前審批門** —— owner 對「一頁批次後台驗收」的定義逐字是" +
        "「**先上線成果**，但是在**後台可以一鍵否決還原**」⇒ 圖是先上線的。" +
        "⛔⛔ 關掉它的後果要看清楚：設計師上傳的圖會**直接對所有玩家可見而沒有任何人審過**，" +
        "⭐ 而 icon 是全遊戲曝光度最高的素材之一（技能格、商店、選人畫面都在用）。",
    },
    {
      path: "preserveAlpha",
      zh: "保留透明背景",
      note:
        "出貨 **{{出貨值}}**。⭐ `cwebp` 預設就保留 alpha ⇒ 開著是**零額外工作**。" +
        "⛔ 關掉會讓去背的圖在技能格上變成一塊不透明方形 —— " +
        "⚠️ 出貨的 119 份 legacy PNG 正是靠 alpha 疊在技能格上的那種風格。" +
        "⚠️ 這一格**只影響新上傳的圖**，⛔ 不會回頭改既有的 1,039 份 WebP。",
    },
    {
      path: "maxSourceEdgeMultiple",
      zh: "來源圖邊長上限 — 出貨邊長的幾倍",
      note:
        "出貨 **{{出貨值}}** 倍（⭐ 出貨邊長 128 ⇒ 實際上限 4096²）。" +
        "⭐⭐ 這裡存的是**倍數**而不是 4096，理由是第〇·四守則：" +
        "出貨邊長哪天從 128 變成 256，一個寫死的 4096 就變成「16 倍」而**沒有東西會紅**。" +
        "⚠️ ⭐ 它擋的是**圖片解壓炸彈**：一張宣稱 65535×65535 的 PNG 檔頭只有 24 bytes，" +
        "壓縮比與 entry 大小**全部過得了** zip 那一層，⛔ 而真的 decode 它就是幾十 GB 的記憶體。" +
        "⇒ ⭐ 判準是**讀檔頭**（decode 之前），⛔ 不是「解開來看看多大」。" +
        "⚠️ 上界 128 倍（16384²）：再高就等於沒有擋。",
    },
  ],
  // 四格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

export const CAST_TIME_SPEC: ConfigDocSpec<"castTime"> = {
  page: "castTime",
  collection: "config",
  docId: "cast-time",
  schemaTag: "config.cast-time@1",
  zod: zConfigCastTimeDoc,
  title: "吟唱規則",
  intro: [
    "技能按下去到生效之間，玩家站著不動多久。owner 2026-08-13：「請你照我的 **0.06~4.00 秒**來設定吟唱時間（所有的技能都有最低吟唱技能時間 0.06 秒，讓 tick 一定可以處理）」＋「**吟唱時間倍率**也可以在系統後台設定」＋「吟唱時間**上下限**也可以一起設定」。",
    "⭐ **三格是同一條算式的三個位置**，所以住同一頁：先把技能算出來的吟唱夾進 [下限, 上限] → 乘倍率 → **再夾一次** → 對齊整數 sim tick。夾兩次是刻意的：先夾擋作者打錯的「吟唱 10 秒」，後夾讓倍率 3 也不會把 2 秒推成 6 秒。",
    "⚠️ **下限的下界是一個 sim tick（≈0.034 秒），不是 0。** sim 是 30 Hz，用 `round(秒數 ÷ 1/30)` 換算 tick：0.06 秒 = 2 tick（穩）、0.02 秒 = 1 tick、0.01 秒 = **0 tick ⇒ sim 當它瞬發**。而客戶端**照樣畫得出**吟唱條與向天光束預告 —— 兩邊都不報錯，只有玩家看得出來。這就是 owner 那句「讓 tick 一定可以處理」在說的事。",
    "⛔ **不要改用「戰鬥系統」頁的冷卻倍率代替**：冷卻管「多久能再按一次」，吟唱管「按下去到生效多久」。用同一個旋鈕會把兩者一起動，等於什麼都沒調。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cast-time.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/castTimeRules.ts 的 applyCastTimeRules（唯一知道三格怎麼作用的地方）← abilities/abilitySystem.ts 每一次施法時呼叫一次，瞄準鎖窗口／實際吟唱 tick／送給客戶端畫吟唱條的秒數**三者共用同一個結果**；文件由 game-server 的 MatchController 在開場 tick 0 之前灌進 world.castTimeRules",
  effect:
    "**要重啟 game-server shard 才生效**，之後套用在重啟後新開的每一場。和 冷卻規則／淨化規則／格擋規則 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "吟唱規則總開關",
      note: "關掉之後三格全部不作用，吟唱照技能自己算出來的秒數走。⚠️ **它也關掉下限** —— 於是低於一個 tick 的技能會退回「客戶端畫得出來、sim 當它瞬發」那個狀態。這一格是給排查用的（「是不是這三格害的？」），⛔ 不是拿來常關的。",
    },
    {
      path: "multiplier",
      zh: "全域吟唱倍率",
      note: "所有技能的吟唱一起快慢。1.0 ＝ 照算出來的值；0.5 ＝ 全部減半（更靈活、更難閃）；2.0 ＝ 全部加倍（更笨重、預告更好躲）。⚠️ 它在**夾完之後**才乘、然後**再夾一次**，所以開到 5 也不會有任何技能超過下面的上限。",
    },
    {
      path: "floorSec",
      zh: "吟唱下限（秒）",
      note: "有吟唱的技能最短幾秒。出貨 **{{出貨值}}**（owner 指定 ＝ 2 個 sim tick）。⛔ 下界是 **0.034（一個 tick）不是 0** —— 理由見上面第三段。⚠️ 它**不會**把瞬發技（吟唱 0）變成 0.06：那一格管的是「有吟唱的技能最短多長」，把每支瞬發技都推到 0.06 會讓全部技能一起變鈍。",
    },
    {
      path: "capSec",
      zh: "吟唱上限（秒）",
      note: "任何技能最長幾秒。出貨 **4.00**（owner 指定）。這是「一支技能最多能讓玩家站著不動多久」的硬上界，也是作者在說明裡寫「吟唱 10 秒」時被夾住的地方。⚠️ 填得比下限還低時**下限贏** —— 否則夾出來的區間是空的，下限會被無聲違反。",
    },
    {
      path: "castTimeMaxSec",
      zh: "⏳ 詠唱調整上限（秒）",
      note: "owner 2026-08-27（逐字）：「**把所有詠唱超過一秒的都調整至一秒 但是在後台留下記錄**」（#787）。技能的規格詠唱在**進算式之前**先被 min 到這一格 —— 等於 95 份文件在載入時被改成 1 秒，⛔ 但一份技能 JSON 都不動（改這一格＝改全部，不用重生成）。出貨 **1.0**。與上面「吟唱上限」的分工：那一格擋**作者打錯**（寫 10 秒），這一格是 **owner 的平衡裁決**。「留下記錄」在「📜 詠唱>1秒清單」頁：原值／夾後／差三欄。**止血閥：拉到 8**（≥ 吟唱上限）＝一支都夾不到＝回 2026-08-27 之前的行為。⚠️ 缺這一格的舊存檔會用出貨值 1.0（裁決是全域的）。",
    },
  ],
  // 五格純量（#787 加了 castTimeMaxSec），沒有不編輯的分支要原封帶走。
  preserved: [],
};

