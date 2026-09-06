/**
 * 設定文件的**標籤資料**（五級距（範圍/距離/冷卻/傷害/耗魔/成長/移速）・技能正規化・魔力經濟）—— GH#626 從 5,783 行的 `configForms.ts` 按職責拆出來。
 *
 * ⚠️ 這裡只有**語意**（中文名稱、「它影響什麼」、上下界）。結構仍然從 Zod 走出來
 * （`../engine`），⛔ 這裡一個欄位型別都不重打 —— 見門面 `../../configForms.ts` 的檔頭。
 * ⛔ 新增一份設定要**同時**把它的 spec 掛進門面的 `CONFIG_DOC_SPECS`：忘了掛
 * ⇒ `configDocCoverage.test.ts` 紅並指名那份 `content/config/*.json`（閘從出貨的東西推導）。
 */
import {
  zConfigAoeTiersDoc,
  zConfigRangeTiersDoc,
  // 冷卻五級距（GH#445）／傷害五級距（GH#447）／回魔地板（GH#446）—— 走 barrel，
  // 同上面那一族。⚠️ 三份都是新的 schema tag，union 漏一行就是 2026-08-02 的形狀。
  zConfigCooldownTiersDoc,
  zConfigDamageTiersDoc,
  zConfigManaTiersDoc,
  zConfigSpeedGrowthTiersDoc,
  zConfigMoveSpeedTiersDoc,
  zConfigSkillNormalizeDoc,
  zConfigManaEconomyDoc,
  // ⭐ 吟唱五級距（GH#943）／AP 係數公式（GH#942）—— 同上面那一族走 barrel。
  zConfigCastTimeTiersDoc,
  zConfigApCoefficientDoc,
  zConfigRankGrowthDoc,
} from "@ggd/shared/content";
import {
  ANCHOR_ROLE,
  BALANCE_ANCHOR_LEVELS,
  HARD_ANCHOR_LEVEL,
  HP_BASE_BONUS,
  medianBaseHp,
  medianFinalHp,
} from "@ggd/shared/content/balanceAnchors";
// ⛔ 級距名只有一份（GH#414）—— 後台不重打一組字串。
// ⭐ 2026-08-21（owner「後台設定及說明⋯**全部都是推導動態即時產生**」）：連
//    「決鬥區半徑」與「這一格是半徑的幾分之幾」也一起從梯子讀 —— 那兩個數字在
//    這一頁的說明裡出現過 6 次，而 GH#463 改名之後其中三處**當場變成假的**
//    （「中 = 4.5」變成 6、「大 = 6」變成 8），⛔ 而且 `content:build` 是綠的。
import {
  DUEL_ZONE_RADIUS_REF,
  LADDER_FRACTIONS,
  SKILL_TIER_NAMES,
} from "@ggd/shared/content/skillTiers";
// ⛔ AoE／施法距離的五個數字也只有一份 —— 說明裡的「大 = ?」從它讀。
import { AOE_TIER_RADIUS_MAX, DEFAULT_AOE_TIERS } from "@ggd/shared/content/aoeTiers";
import { DEFAULT_RANGE_TIERS, RANGE_TIER_MAX } from "@ggd/shared/content/rangeTiers";
// 英雄碰撞半徑（AoE 命中是身體重疊，所以半徑 r 掃得到圓心距離 r + 這個數的人）。
import { CHAMPION_BODY_RADIUS } from "@ggd/shared/content/displacementTiers";
// ⛔ 形狀名（單體／範圍／變身）也只有一份 —— 後台不重打一組字串（同上一行）。
import { COOLDOWN_SHAPES, DEFAULT_COOLDOWN_TIERS } from "@ggd/shared/content/cooldownTiers";
// ⛔ 傷害級距的五個數字也只有一份 —— 相稱性下拉的選項說明從它推導。
import {
  DAMAGE_TIER_MAX,
  DEFAULT_DAMAGE_TIERS,
  KILL_CASTS_REF,
  SHIPPED_ANCHOR_LEVEL,
  anchorFloor,
  castsToKill,
  castsToKillBase,
  minTierStep,
  tierRatios,
  tierStep,
} from "@ggd/shared/content/damageTiers";
import {
  DEFAULT_MANA_TIERS,
  MANA_CAST_ANCHORS,
  MANA_TIER_MAX,
  MANA_TIER_MIN,
  describeManaTiers,
} from "@ggd/shared/content/manaTiers";
import {
  DEFAULT_SPEED_GROWTH_TIERS,
  SPEED_GROWTH_AXES,
  SPEED_GROWTH_AXIS_LABEL,
  SPEED_GROWTH_LADDER_IDS,
  SPEED_GROWTH_MAX,
  SPEED_GROWTH_MIN,
  SPEED_GROWTH_TIER_FIELD,
  SPEED_GROWTH_TIER_NAMES,
} from "@ggd/shared/content/speedGrowthTiers";
import {
  DEFAULT_MOVE_SPEED_TIERS,
  MS_BONUS_MAX,
  MS_BONUS_MIN,
  MS_BONUS_TIER_NAMES,
} from "@ggd/shared/content/moveSpeedTiers";
import {
  DEFAULT_SKILL_NORMALIZE,
  CARRIER_BASE_MAX_CEILING,
  GAP_ALERT_MAX,
} from "@ggd/shared/content/skillNormalize";
import type { ConfigDocSpec } from "../engine";
/**
 * 「決鬥區半徑的幾分之幾」—— ⭐ 從**梯子本身**推導，⛔ 不在說明裡手打 `24 ÷ 4`。
 *
 * ⚠️ 這一段在 2026-08-21 之前是手抄的，而 GH#463 改名把每一格往左移了一格 ⇒
 * 「中 = 4.5」（真值 6）、「大 = 6 畫在地上 4.8」（真值 8）三處**當場變成假的**，
 * 而 `content:build`、全套測試、卡片全部是綠的（第一·五守則的形狀）。
 * ⇒ 現在半徑、分數、上下界全部現算：owner 哪天把決鬥區改小，這一頁自己跟上。
 */
const fracText = (f: number): string => {
  for (let q = 1; q <= 64; q++) {
    const num = f * q;
    if (Math.abs(num - Math.round(num)) < 1e-9) return `${Math.round(num)}/${q}`;
  }
  return f.toFixed(4);
};
/** AoE／施法距離取梯子的橫木 [1..5]，所以第 i 格對應 `LADDER_FRACTIONS[i + 1]`。 */
const rungFrac = (i: number): string => fracText(LADDER_FRACTIONS[i + 1] ?? 0);
/** 「（決鬥區半徑 24 的 1/4）」那一段字。 */
const rungWhy = (i: number): string => `決鬥區半徑 ${DUEL_ZONE_RADIUS_REF} 的 ${rungFrac(i)}`;

export const AOE_TIERS_SPEC: ConfigDocSpec<"aoeTiers"> = {
  page: "aoeTiers",
  collection: "config",
  docId: "aoe-tiers",
  schemaTag: "config.aoe-tiers@1",
  zod: zConfigAoeTiersDoc,
  title: "AoE 範圍五級距",
  intro: [
    "技能的範圍**寫級別不寫數字**。owner 2026-08-11：「重新對應範圍只有 小／中／大／超大，**原則上不寫範圍數字**」（⚠️ 那是 08-11 的**四級**舊詞彙；GH#463 已換成他 08-19 的 極小/小/中/大/極大，值不變、名字整體左移一格）。技能 JSON 填 `radiusTier: \"中\"`，這一頁決定「中」是多少半徑。",
    `⭐ 這一頁存在的理由就是**單一住處**：把數字寫在每支技能上等於 115 個住處 —— 想把「${SKILL_TIER_NAMES[2]}」從現在的 ${DEFAULT_AOE_TIERS.radius[SKILL_TIER_NAMES[2]!]} 調成別的數字，就要改 115 個檔案。填了級別的技能，改這一格全部一起動。`,
    "⭐ owner 2026-08-19（GH#414）：「正規化成**五級距**」。第五格「極大」是新加的，前四格**一個數字都沒有動** —— 所以 110 支填了級別的技能手感完全不變。",
    `五個級別現在各是多少：${SKILL_TIER_NAMES.map((t, i) => `**${t} ${DEFAULT_AOE_TIERS.radius[t]}**（${rungWhy(i)}）`).join(" ／ ")}。`,
    `⭐ 這五個數字**不是挑的**：它們是「決鬥區半徑 ${DUEL_ZONE_RADIUS_REF} 的 ${SKILL_TIER_NAMES.map((_, i) => rungFrac(i)).join(" · ")}」。其中 ${rungFrac(2)} 與 ${rungFrac(3)} 是 owner 自己指定的錨（「大 = 1/4 競技場、超大 = 1/3」），其餘由同一條分母數列延伸。同一條梯子也產出位移級距與施法距離級距（\`packages/shared/src/content/skillTiers.ts\`）。`,
    `⚠️ 這 ${SKILL_TIER_NAMES.length} 個數字是**卡面值**，⛔ 不是畫在地上的圈。玩家實際吃到的是它再乘「戰鬥系統」頁的 \`abilityRange\` —— 那個係數出貨不是 1，所以「${SKILL_TIER_NAMES[3]} = ${DEFAULT_AOE_TIERS.radius[SKILL_TIER_NAMES[3]!]}」掃到的其實比 ${DEFAULT_AOE_TIERS.radius[SKILL_TIER_NAMES[3]!]} 小，owner 指定的「${rungFrac(3)} 競技場」在畫面上就不成立。⭐ **兩欄並排的實際值在「五級距總覽」那一頁**（它讀現在生效的係數當場算），⛔ 這裡刻意不抄一個會過期的數字。要讓比例在畫面上成立，這五格要各自除以那個係數。`,
    `⚠️ AoE 命中是身體碰撞（英雄碰撞半徑 ${CHAMPION_BODY_RADIUS}），所以半徑 r 實際會掃到**圓心距離 r + ${CHAMPION_BODY_RADIUS}** 的人 —— 畫面上的圈比命中範圍小一點是正常的。`,
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/aoe-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/aoeTiers.ts 的 resolveRadiusTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能註冊時把 radiusTier 翻成 radius；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 冷卻規則／淨化規則 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `radiusTier` 不解析（填了也不生效），技能只剩手寫的 `radius`。⚠️ 關掉**不會**讓技能失去範圍 —— 手寫值一直都在。",
    },
    // ⛔ 級距名從 `SKILL_TIER_NAMES` 來，⛔ 不在這裡手打五格 —— 隔壁位移那一頁
    //    （DISPLACEMENT_TIERS_SPEC）早就這樣寫了，而這一頁沒有跟上。
    //    GH#463 改名時，手打的那五格就是唯一沒有自動跟上的地方：
    //    `radius.超大` 變成一個 schema 裡不存在的路徑，而它的紅是在 admin 的
    //    標籤對帳測試才爆出來的 —— ⚠️ 那已經離現場很遠了。
    ...SKILL_TIER_NAMES.map((tier, i) => ({
      path: `radius.${tier}`,
      zh: `${tier} — 半徑`,
      note:
        `填 \`radiusTier: "${tier}"\` 的技能實際掃多大。改這一格，樹上每一支標成「${tier}」的技能同時跟著變。` +
        // 語意來自 owner 2026-08-11 的原話（那時是四級：小/中/大/超大），
        // GH#463 換成他 08-19 的五個名字之後，語意跟著整體左移一格。
        [
          "約同時打到 5 人（原 WC3 100~200）。",
          "約同時打到 10 人（原 WC3 200~300）。",
          `設計意圖是 ${rungWhy(2)}（owner 指定的錨），原 WC3 300~500 那一批落在這裡。`,
          `${rungWhy(3)}（owner 指定的另一個錨）。原 WC3 500 以上。`,
          `${rungWhy(4)}。⚠️ 上界 ${AOE_TIER_RADIUS_MAX} ＝ 決鬥區半徑：大於它就是全場命中，那要走不設 radius 的寫法，⛔ 不是把這一格填爆。`,
        ][i],
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 施法距離級距 (config/range-tiers) ─

export const RANGE_TIERS_SPEC: ConfigDocSpec<"rangeTiers"> = {
  page: "rangeTiers",
  collection: "config",
  docId: "range-tiers",
  schemaTag: "config.range-tiers@1",
  zod: zConfigRangeTiersDoc,
  title: "施法距離五級距",
  intro: [
    "owner 2026-08-19：「**可施展技能的距離普遍超遠**」。技能的施法距離**寫級別不寫數字**，技能 JSON 填 `rangeTier: \"中\"`，這一頁決定「中」是多遠。",
    "⚠️ 「超遠」的根因**不是換算係數錯**。係數（`GGD_PER_WC3 = 11/600`）經 owner 自己的校準點驗證過是對的。根因是**這一軸在 GH#414 之前完全沒有表** —— 量到 404 筆施法距離，中位數 11、**最大 29.33**，而決鬥區半徑只有 24：有技能打得比整個決鬥區還遠。",
    `⭐ 梯級與 AoE **完全同一條**（決鬥區半徑 ${DUEL_ZONE_RADIUS_REF} 的 ${SKILL_TIER_NAMES.map((_, i) => rungFrac(i)).join(" · ")}）。同一個字在兩軸上指向同一個絕對值 —— 一支「${SKILL_TIER_NAMES[3]}」的技能打得到 ${DEFAULT_RANGE_TIERS.range[SKILL_TIER_NAMES[3]!]}，炸開也是 ${DEFAULT_AOE_TIERS.radius[SKILL_TIER_NAMES[3]!]}。那是 owner 說的「統一」最強的讀法。`,
    `五個級別現在各是多少：${SKILL_TIER_NAMES.map((t, i) => `**${t} ${DEFAULT_RANGE_TIERS.range[t]}**（${rungWhy(i)}）`).join(" ／ ")}。⚠️ 上界 ${RANGE_TIER_MAX} ＝ 決鬥區半徑：比它更遠的「施法距離」意思是整個決鬥區都在射程內，那不是一個距離級別。`,
    "⚠️ 這五個是**卡面值**。玩家實際吃到的是它再乘「戰鬥系統」頁的 `abilityRange`（與 AoE 完全同一個係數、同一個形態）。⭐ **兩欄並排的實際值在「五級距總覽」那一頁**（它讀現在生效的係數當場算），⛔ 這裡刻意不抄一個會過期的數字。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/range-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/rangeTiers.ts 的 resolveRangeTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能註冊時把 rangeTier 翻成 range；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 AoE 級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `rangeTier` 不解析（填了也不生效），技能只剩手寫的 `range`。⚠️ 關掉**不會**讓技能失去射程 —— 手寫值一直都在。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `range.${tier}`,
      zh: `${tier} — 施法距離`,
      note: `填 \`rangeTier: "${tier}"\` 的技能打得到多遠（卡面值）。⚠️ 改這一格，樹上每一支標成「${tier}」的技能同時跟著變。`,
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 冷卻級距 (config/cooldown-tiers) ─

const CD_SECONDS = DEFAULT_COOLDOWN_TIERS.seconds;
const CD_SMALLEST = SKILL_TIER_NAMES[0];
const CD_LARGEST = SKILL_TIER_NAMES[SKILL_TIER_NAMES.length - 1]!;
/** 範圍表相對單體表貴幾倍 —— ⭐ 現算，⛔ 不是說明裡手打的「2–5 倍」。 */
const CD_SHAPE_RATIOS = SKILL_TIER_NAMES.map(
  (t) => Math.round((CD_SECONDS["範圍"][t] / CD_SECONDS["單體"][t]) * 10) / 10,
);
const COOLDOWN_SHAPE_WHY: Record<string, string> = {
  單體: `打一個人的技能。⭐ 「${CD_SMALLEST}」那一格 **${CD_SECONDS["單體"][CD_SMALLEST]} 卡面秒**是 owner 的 Q1 反算出來的（「連續施展 ${KILL_CASTS_REF} 次以內一定要能殺死對方」），而傷害五級距的錨又是從它長出來的 —— ⛔ 動這一格等於同時動了傷害那一頁。`,
  範圍: `打一片的技能。整張表比單體貴 **${Math.min(...CD_SHAPE_RATIOS)}–${Math.max(...CD_SHAPE_RATIOS)} 倍**（現算），那就是「打到很多人」的代價 —— 也是傷害級距只需要**一張**表的原因（同一個懲罰不收兩次）。`,
  變身: `變身／長持續增益。⚠️ 與範圍**同一組數字**是 owner 給的，⛔ 不是我複製貼上：這一類的價值來自「一場只有幾次」。`,
};

const COOLDOWN_TIER_WHY = [
  "**下限例外**（owner 2026-08-19：「極大跟極小都是屬於卡上下限的例外而非線性規則」）。單體這一格是整套系統的錨 —— 傷害級距的極小也是從它反算的。",
  "線性段的第一格。",
  "線性段的中間。⚠️ 量於 **2026-08-19（GH#445 落地前）**：358 支有冷卻的技能中位 55 卡面秒、傷害中位 532 —— 大部分技能落在偏貴的那一格，而回報沒有跟上。那個落差就是 GH#447 說的「AP 太弱勢」。⛔ 這兩個數字是**當時的快照**，級距靠攏之後不再成立；要看現在的分佈請跑稽核，⛔ 不要把它們當成現值。",
  "線性段的最後一格。",
  `**上限例外**（同極小）。⚠️ 這一格在範圍表上是 **${CD_SECONDS["範圍"][CD_LARGEST]} 卡面秒**，而實際等待要再乘「戰鬥系統」頁的冷卻係數 —— ⭐ 換算後的秒數在「五級距總覽」那一頁現算，⛔ 這裡不抄。`,
];

export const COOLDOWN_TIERS_SPEC: ConfigDocSpec<"cooldownTiers"> = {
  page: "cooldownTiers",
  collection: "config",
  docId: "cooldown-tiers",
  schemaTag: "config.cooldown-tiers@1",
  zod: zConfigCooldownTiersDoc,
  title: "冷卻五級距",
  intro: [
    "owner 2026-08-19 逐字：「冷卻的階段只會分幾種 一樣是**極小小中大極大** ／ **單體 6/15/30/45/60** ／ **範圍 30/45/60/90/120** ／ **變身或持續增益狀態 30/45/60/90/120** ／ **不計入系統倍率及減少 CD 等效果**」。技能 JSON 填 `cooldownTier: \"中\"`，這一頁決定「中」是幾秒。",
    "⭐ 這十五格是 owner **直接給滿的規格**，所以它們是**照抄**的 —— ⛔ 沒有像 AoE／施法距離／位移那樣套一條推導梯子。再推一次就是拿「編輯器產生的 JSON」去蓋「owner 的新版說明」，那違反優先序階梯。",
    `⚠️ 這裡的秒數是**卡面秒**（owner：「不計入系統倍率」）。玩家實際等到的 ＝ 這一格 ×「戰鬥系統」頁的 \`cooldown\` × 暴走倍率，再被「冷卻規則」頁的秒數地板夾一次 ⇒ 後台寫 ${CD_SECONDS["單體"][CD_SMALLEST]} 秒，遊戲裡等到的比它短。⭐ **兩欄並排的實際秒數在「五級距總覽」那一頁**（它讀現在生效的係數與地板當場算），⛔ 這裡刻意不抄一個會過期的數字。`,
    `⚠️ 「${CD_SMALLEST}」為什麼不落在線性段的整除格點上 —— 那不是算術副作用。owner 2026-08-19：「**極大跟極小都是屬於卡上下限的例外而非線性規則**」—— 線性段（${SKILL_TIER_NAMES.slice(1, -1).join("／")}）的範圍÷單體 ＝ ${SKILL_TIER_NAMES.slice(1, -1).map((t) => (CD_SECONDS["範圍"][t] / CD_SECONDS["單體"][t]).toFixed(1)).join("／")}（現算），全部落在他給的「2–5× 上下限參考準則」內。`,
    "⚠️ 級距是**一支技能一格**，⛔ 不是逐等級各一格：解析時整條冷卻陣列的每一階都被寫成同一個值。想做「升階冷卻下降」的技能就**不要**填級別，手寫陣列一直都合法。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cooldown-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/cooldownTiers.ts 的 resolveCooldownTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能與道具註冊時把 cooldownTier 翻成 cooldown；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 AoE／施法距離級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `cooldownTier` 不解析（填了也不生效），技能只剩手寫的 `cooldown` 陣列 —— ⭐ 那就是**一鍵回到舊的那一套秒數**。⚠️ 關掉**不會**讓技能失去冷卻。",
    },
    {
      path: "autoShape",
      zh: "沒填形狀時自動判斷",
      note: "技能沒填 `cooldownShape` 時，要不要從它自己的內容推（有變身 → 變身；有範圍 → 範圍；其餘 → 單體）。⚠️ 關掉的代價是**沒填的一律當單體**，也就是範圍大絕會靜默拿到便宜的那張表（30 秒而不是 60 秒），而卡片、schema、測試全部正常。",
    },
    ...COOLDOWN_SHAPES.flatMap((shape) =>
      SKILL_TIER_NAMES.map((tier, i) => ({
        path: `seconds.${shape}.${tier}`,
        zh: `${shape}・${tier} — 卡面秒`,
        note:
          `填 \`cooldownTier: "${tier}"\` 且形狀是「${shape}」的技能要等幾**卡面**秒（⚠️ 實際等待還要乘「戰鬥系統」頁的冷卻係數再夾一次地板，換算好的秒數在「五級距總覽」頁）。` +
          `改這一格，樹上每一支落在這一格的技能同時跟著變。${COOLDOWN_SHAPE_WHY[shape]}${COOLDOWN_TIER_WHY[i]}`,
      })),
    ),
  ],
  // 十五格純量 + 兩個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 傷害級距 (config/damage-tiers) ─

/**
 * 每一格的「它是怎麼算出來的」—— ⭐ **全部從推導鏈長出來**，⛔ 一個字面值都沒有。
 *
 * ⚠️ 這一段在 2026-08-20 之前是手抄的（700 / 1,150 / 2,400 / 13,927 / 83%⋯），
 * 而錨點換了之後它整段變成謊話，`content:build` 與全套測試都是綠的。
 */
const RATIOS = tierRatios();
const SMALLEST_NAME = SKILL_TIER_NAMES[0];
const DAMAGE_TIER_WHY = SKILL_TIER_NAMES.map((tier, i) => {
  const dmg = DEFAULT_DAMAGE_TIERS.damage[tier];
  const share = ((dmg / DAMAGE_TIER_MAX) * 100).toFixed(0);
  if (i === 0) {
    const raw = (medianBaseHp(SHIPPED_ANCHOR_LEVEL) + HP_BASE_BONUS) / KILL_CASTS_REF;
    return (
      `⭐ **這一格是整張表的錨**，而且它是**算出來的**：` +
      `（LV${SHIPPED_ANCHOR_LEVEL} 的**純基礎**中位血量 ${medianBaseHp(SHIPPED_ANCHOR_LEVEL)}` +
      ` ＋ 初始加成 ${HP_BASE_BONUS}）÷ owner 的 ${KILL_CASTS_REF} 次 ＝ ${raw.toFixed(1)}` +
      `，進位到 ${tierStep()}（「使五格皆整數的最小單位」是 ${minTierStep()}，粒度取它的整數倍）⇒ **${dmg}**。` +
      `⛔⛔ **推導鏈裡一個系統倍率都沒有。** owner 2026-08-22：「你的傷害要從生命反推我沒意見，` +
      `但**不能把系統倍率乘進去再反推**啊，這樣我用系統倍率就沒意義了」；` +
      `2026-08-20：「不要計算 HP 系統倍率以及魔抗減傷 **會讓我誤判**」。` +
      `⚠️ 這一行在 2026-08-22 之前寫著「× HP 倍率」—— 而那正是讓 \`maxHealth\` 4.0／6.0／7.2 ` +
      `三個值**都落在 51% 左右**（一格轉不動任何東西）的原因。閘：\`pnpm echoloop:check\`。` +
      `⚠️ 一定要**進位** —— 捨去會差幾個 % 違反 owner 的 Q1，而且沒有任何東西會紅。`
    );
  }
  const line =
    `＝ 錨 × ${RATIOS[tier]}（單體冷卻 ${DEFAULT_COOLDOWN_TIERS.seconds["單體"][tier]} 秒 ÷ ` +
    `${DEFAULT_COOLDOWN_TIERS.seconds["單體"][SMALLEST_NAME]} 秒）。`;
  if (i < SKILL_TIER_NAMES.length - 1) return line;
  return (
    line +
    `＝ LV${HARD_ANCHOR_LEVEL} **引擎最終**中位血量的 **${share}%**` +
    `（${BALANCE_ANCHOR_LEVELS.map((lv) => `LV${lv} ${((dmg / medianFinalHp(lv)) * 100).toFixed(0)}%`).join(" / ")}）。` +
    `⚠️ 上界 **${DAMAGE_TIER_MAX}** ＝ **LV${HARD_ANCHOR_LEVEL}（hard limit）**的引擎最終中位血量：` +
    `超過它的一發就是**一發秒殺**，那不是傷害級距而是另一種設計。` +
    `⭐ 取最早會遇到它的那一級，⛔ 不是更高的錨點。`
  );
});

export const DAMAGE_TIERS_SPEC: ConfigDocSpec<"damageTiers"> = {
  page: "damageTiers",
  collection: "config",
  docId: "damage-tiers",
  schemaTag: "config.damage-tiers@1",
  zod: zConfigDamageTiersDoc,
  title: "傷害五級距",
  intro: [
    "owner 2026-08-19：「**可以重新設計拉高**，畢竟之前檢討過 **AP 太弱勢**，我們幾乎要拉到高等級才能開始追平普通攻擊無風險的傷害」。技能在 `amount` 裡填 `damageTier: \"中\"`，這一頁決定「中」是多少基礎傷害。",
    "⛔ **2026-08-20 第二次重錨**（owner 逐字兩則）：「**🅲 保留倍率，但把它從錨點推導裡剝掉**」與「**我的建議是拿 30 級的當標準就好**，因為技能通常還有 AP 加成那塊沒算到」，外加「**不要計算 HP 系統倍率以及魔抗減傷 會讓我誤判**」。⇒ ① 錨點空間從「中位**有效**血量」（含魔抗）換成「中位**純基礎**血量」，魔抗那一層**整層退場**；② 出貨錨**就是 hard limit**，⛔ 不再是「滿足得了的最高那一個」。",
    `⭐ 五個數字**不是挑的**，是**算出來的**：（純基礎中位 ${medianBaseHp(SHIPPED_ANCHOR_LEVEL)} ＋ 初始加成 ${HP_BASE_BONUS}）÷ ${KILL_CASTS_REF} 發 → 進位到 ${tierStep()} ⇒ 極小 **${DEFAULT_DAMAGE_TIERS.damage[SKILL_TIER_NAMES[0]]}**；其餘四格 ＝ 極小 × 單體冷卻比 **${SKILL_TIER_NAMES.map((t) => RATIOS[t]).join(" : ")}**。這正是 owner Q4 的意思 ——「**已經有傷害相應的冷卻跟耗魔做限制**」，貴的技能貴在它落在冷卻表的哪一格，⛔ 不是靠一條沒有錨的超線性曲線。`,
    "⛔⛔ **推導鏈裡一個系統倍率都沒有。** owner 2026-08-22 逐字：「你的傷害要從生命反推我沒意見，但**不能把系統倍率乘進去再反推**啊，這樣我用系統倍率就沒意義了」「對 我說過**這是我人工的旋鈕**，並沒有放在公式裡」「總之**不要再叫我調整了，公式已定好，只要公式本身自洽，我們只調系統倍率**」。⚠️ 這一段在 2026-08-22 之前寫著「× HP 倍率」—— 而那正是讓 `maxHealth` 4.0／6.0／7.2 三個值**都落在 51% 左右**（一格轉不動任何東西）的原因。閘：`pnpm echoloop:check`。",
    `⭐ **設計承諾的達成率**（打死該級中位英雄要幾發「${SKILL_TIER_NAMES[0]}」，門檻 ${KILL_CASTS_REF} 發，分母是**純基礎＋加成**，⛔ **不是**引擎最終血量）：${BALANCE_ANCHOR_LEVELS.map((lv) => {
      const n = castsToKillBase(lv, DEFAULT_DAMAGE_TIERS.damage[SKILL_TIER_NAMES[0]]);
      return `**LV${lv} ${n.toFixed(1)} 發 ${n <= KILL_CASTS_REF ? "✅" : "❌"} ${ANCHOR_ROLE[lv]}**`;
    }).join("・")}。每一級**自己**要求的錨是 ${BALANCE_ANCHOR_LEVELS.map((lv) => `LV${lv} ${anchorFloor(lv)}`).join(" / ")}。`,
    `⚠️ **玩家實際**要打幾發是**另一個數字**（含系統倍率）：${BALANCE_ANCHOR_LEVELS.map((lv) => {
      const n = castsToKill(lv, DEFAULT_DAMAGE_TIERS.damage[SKILL_TIER_NAMES[0]]);
      return `LV${lv} ${n.toFixed(1)} 發`;
    }).join("・")}。⭐ 兩欄**刻意不相等**，差距就是 HP 系統倍率本身 —— 那正是你要的旋鈕。⛔ 拿這一欄去對門檻是**兩個空間混算**（2026-08-22 抓到：產生的平衡文件因此把三個錨點全印 ❌，而閘一路是綠的）。`,
    "⚠️ 高等級的缺口**不是這五格調得掉的**：血量比傷害長得快。要補它得動成長曲線，⛔ 不是把這一頁填爆。",
    "⭐ 只有**一張**表，⛔ 沒有「單體一張、範圍一張」：形狀的代價整個住在冷卻軸上（範圍表比單體貴 2–5 倍），再在傷害軸打一次折就是同一個懲罰收兩次。",
    "⚠️ 「範圍·極小」是這個讀法唯一壞掉的一格。owner 的答案是「**那一格要求傷害是大／極大**」，而它住在「編輯器創作規則」頁的相稱性表，⛔ 不是把這張表拆成兩張。",
    "⚠️ 填了 `damageTier` 的那一格，`flat` 與 `perRank` 會被級距**取代**（⛔ 不是相加）；`ratios` / `attrRatios` 不受影響 —— 那兩條是**成長**，不是基礎值。",
    "⭐ **五個數字由 `pnpm anchors:build` 寫進 `content/config/damage-tiers.json`**，`anchors:check` 逐位元組守著。這一頁改的是**線上覆蓋層**（data/），⚠️ **覆蓋層會蓋掉那個檔案** —— 線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/damageTiers.ts 的 resolveDamageTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能與道具註冊時把 amount.damageTier 翻成 amount.flat",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和 冷卻五級距 同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `damageTier` 不解析，技能回到自己手寫的 `flat` / `perRank` —— ⭐ 那就是**一鍵回到重錨之前的那一套傷害**。⚠️ 關掉**不會**讓技能不再造成傷害。",
    },
    ...SKILL_TIER_NAMES.map((tier, i) => ({
      path: `damage.${tier}`,
      zh: `${tier} — 基礎傷害`,
      note:
        `填 \`damageTier: "${tier}"\` 的那一格實際打多少（卡面值，上場還要乘「戰鬥系統」頁的 \`damageDealt\` 與對方的減免）。` +
        `改這一格，樹上每一處標成「${tier}」的傷害同時跟著變。${DAMAGE_TIER_WHY[i]}`,
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 耗魔級距 (config/mana-tiers) ─

/** 兩個 owner 錨換算成「這一格撐得住幾發」—— ⭐ 現算，⛔ 不是說明裡手打的數字。 */
const MANA_CASTS_AT = (tier: (typeof SKILL_TIER_NAMES)[number]): number =>
  Math.round(MANA_TIER_MAX / DEFAULT_MANA_TIERS.manaCost[tier]);

export const MANA_TIERS_SPEC: ConfigDocSpec<"manaTiers"> = {
  page: "manaTiers",
  collection: "config",
  docId: "mana-tiers",
  schemaTag: "config.mana-tiers@1",
  zod: zConfigManaTiersDoc,
  title: "耗魔五級距",
  intro: [
    "技能 JSON 填 `manaCostTier: \"中\"`，這一頁決定「中」要花多少魔力。⭐ 它是五軸裡**最後補上**的一軸（2026-08-21）。",
    `⛔ **它補的不是「大家忘了填」，是「機制沒做」**：在這一頁之前 \`ability@1\` 上根本**沒有 manaCostTier 一格** —— 冷卻有 350 支填了級別、施法距離 186 支、AoE 96 支、傷害 199 支，而耗魔是 **0 支**。212 支要花魔力的技能各自帶著一個從 w3a 換算來的自由數字，這張表怎麼改它們都一動不動，⛔ 而且沒有任何東西會紅。`,
    `⭐ 五個數字**不是挑的**，是**算出來的**：owner 2026-08-19 只給了**兩個**錨 ——「範圍技**連續 ${MANA_CAST_ANCHORS[0]!.casts} 次**施展完等回魔」（＝「${MANA_CAST_ANCHORS[0]!.tier}」）與「連續**${MANA_CAST_ANCHORS[1]!.casts} 個大範圍**技能施展完一定要等回魔」（＝「${MANA_CAST_ANCHORS[1]!.tier}」）。兩錨相鄰一格且比值 2 ⇒ 幾何梯子「魔力池 ÷ ${SKILL_TIER_NAMES.map((t) => MANA_CASTS_AT(t)).join(" / ")}」⇒ ${describeManaTiers()}`,
    `⚠️ ⛔ **不可以把傷害那條梯子抄過來**（600…6000，10 倍）：那樣「${SKILL_TIER_NAMES[4]}」會比整個魔力池（${MANA_TIER_MAX}）還大，那支技能一輩子放不出來。這條梯子的頂端刻意是**魔力池的一半** —— 兩發清空魔條。`,
    "⚠️ 級距是**一支技能一格**，⛔ 不是逐等級各一格：解析時整條 `manaCost` 陣列的每一階都被寫成同一個值。⭐ 那是 owner 2026-08-21 ① 的直接推論 ——「除了冷卻以外 **傷害跟耗魔是一起變動的**」＋「B 全轉，接受升階只剩 ratios 成長」：傷害的逐階成長交出去之後，耗魔就**不可以繼續漲價**，否則變成「升一階只多花錢、不多傷害」。",
    "⚠️ 免費技（`manaCost` 全 0）**不填**這一格 —— owner 2026-08-21 ④「那就不要調耗魔阿」講的正是那 78 支。下界是 1，填了級別就一定收得到錢。",
    "⚠️ 這一頁與「魔力經濟」頁是**兩件事**：這一頁決定**花**多少，那一頁決定**回**多快。owner 2026-08-19 的兩條規格（八次／四次）是兩頁的乘積，⛔ 改一頁不看另一頁就會把它們算錯。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/mana-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/manaTiers.ts 的 resolveManaCostTier（全專案唯一的查表處）← content/registries.ts 的 registerAll，在技能與道具註冊時把 manaCostTier 翻成 manaCost；standalone 與 champion-embedded 兩條路共用同一個答案",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和冷卻／傷害五級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note: "關掉之後 `manaCostTier` 不解析，技能回到自己手寫的 `manaCost[]` —— ⭐ 那就是**一鍵回到全轉之前的那一套耗魔**。⚠️ 關掉**不會**讓技能變免費。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `manaCost.${tier}`,
      zh: `${tier} — 耗魔`,
      note:
        `填 \`manaCostTier: "${tier}"\` 的技能一發花多少魔力。` +
        `⭐ 出貨值 {{出貨值}} ＝ 魔力池 ${MANA_TIER_MAX} ÷ ${MANA_CASTS_AT(tier)}（現算）⇒ **連續 ${MANA_CASTS_AT(tier)} 發之後要等回魔**。` +
        `⚠️ 改這一格，樹上每一支標成「${tier}」的技能同時跟著變 —— 而且它會直接改變「連續幾發要等回魔」，那正是 owner 給錨的那句話。` +
        `⚠️ 下界 ${MANA_TIER_MIN}：0 是「免費技」，那要走**不填級別**的寫法。`,
    })),
  ],
  // 五格純量 + 一個開關，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ──────────────────── 速度成長級距 (config/speed-growth-tiers) ─

/** 兩把梯子在同一格的值 —— 現算，⛔ 不是說明裡手打的數字。 */
const SG = (id: (typeof SPEED_GROWTH_LADDER_IDS)[number], axis: "ms" | "as"): string =>
  SPEED_GROWTH_TIER_NAMES.map((n) => DEFAULT_SPEED_GROWTH_TIERS.growth[id][axis][n]).join(" / ");

/** 出貨 49 位落在哪一格（＝值等於他們今天成長的那一格）。 */
const SG_SHIPPED_TIER: Readonly<Record<"ms" | "as", (typeof SPEED_GROWTH_TIER_NAMES)[number]>> =
  Object.freeze({ ms: SPEED_GROWTH_TIER_NAMES[0], as: SPEED_GROWTH_TIER_NAMES[1] });

export const SPEED_GROWTH_TIERS_SPEC: ConfigDocSpec<"speedGrowthTiers"> = {
  page: "speedGrowthTiers",
  collection: "config",
  docId: "speed-growth-tiers",
  schemaTag: "config.speed-growth-tiers@1",
  zod: zConfigSpeedGrowthTiersDoc,
  title: "速度成長五級距",
  intro: [
    `英雄卡填 \`${SPEED_GROWTH_TIER_FIELD.ms}\` / \`${SPEED_GROWTH_TIER_FIELD.as}\`，這一頁決定那一格**每升一級加多少**。owner 2026-08-21：「請你給我**移動速度及攻擊速度 每級成長五級距**」。`,
    `⭐ **它與另外五軸的起點相反**：冷卻／耗魔／AoE／施法距離／傷害那五軸是「216 支各帶一個從 w3a 換算來的自由數字，收進格點」，而這兩軸量到的是「**49 位共用一個常數**」—— 移速每級成長 **49 位全部是 0**、攻速每級成長 **49 位全部是 0.02**（一個都不差）。⇒ 這一頁開的是一個**今天不存在的設計維度**（「這位英雄會不會越打越快／越跑越快」），⛔ 不是一次重新分配。`,
    `⭐ **這一版零平衡改動**：49 位一律 ${SPEED_GROWTH_AXIS_LABEL.ms}「${SG_SHIPPED_TIER.ms}」（＝${DEFAULT_SPEED_GROWTH_TIERS.growth.A.ms[SG_SHIPPED_TIER.ms]}）· ${SPEED_GROWTH_AXIS_LABEL.as}「${SG_SHIPPED_TIER.as}」（＝${DEFAULT_SPEED_GROWTH_TIERS.growth.A.as[SG_SHIPPED_TIER.as]}），也就是他們今天的值。機制上線，數值一格沒動。`,
    `⚠️ **⛔ 不是「中」** —— owner 那一則裡「49 位全部給中」與「維持今天的值 / 零平衡改動」兩句話**打架**（梯子上的「中」是 ms ${DEFAULT_SPEED_GROWTH_TIERS.growth.A.ms[SPEED_GROWTH_TIER_NAMES[2]]} / as ${DEFAULT_SPEED_GROWTH_TIERS.growth.A.as[SPEED_GROWTH_TIER_NAMES[2]]}，全給「中」等於 49 位一起變快，移速在 LV99 會從 5.8 變 7.76）。照第〇·六守則①**內文修正標籤**：梯子照抄他的五個數字，級別取「值等於他今天成長」的那一格。`,
    `⭐ 兩把梯子都是 owner **逐字給滿**的規格，所以**照抄**，⛔ 沒有像 AoE／施法距離／耗魔那樣再套一條推導梯子（再推一次就是拿第 2 層去蓋第 1 層）。A：${SPEED_GROWTH_AXIS_LABEL.ms} ${SG("A", "ms")} · ${SPEED_GROWTH_AXIS_LABEL.as} ${SG("A", "as")}；B：${SPEED_GROWTH_AXIS_LABEL.ms} ${SG("B", "ms")} · ${SPEED_GROWTH_AXIS_LABEL.as} ${SG("B", "as")}。`,
    `⚠️ **今天切 A↔B 一個位元都不會動**：出貨 49 位落在兩把梯子**值相同**的那兩格（${SPEED_GROWTH_AXIS_LABEL.ms}「${SG_SHIPPED_TIER.ms}」兩邊都是 0、${SPEED_GROWTH_AXIS_LABEL.as}「${SG_SHIPPED_TIER.as}」兩邊都是 0.02）。⇒ 開關已經接好而且**是惰性的**；要它生效必須先有人把某一位移出那兩格，而那會是一筆看得見的內容 diff。`,
    `🔴 **攻速上限 4 今天就已經撞穿了**（\`config.stat-caps@1\` 的 \`as.base\`）：出貨成長 0.02 在 LV99 的母體中位就是 **7.51**。所以「LV99 撞不撞上限」對任何候選都是 ⛔ 撞（含現況），它不是判準。分得出勝負的是 owner 指定的 hard limit **LV30** —— **A 極大在 LV30 中位 3.34 < 4**（49 位裡 4 位越線），**B 極大 4.82 > 4**（49 位裡 **47 位**越線 ⇒ 頂端那一格在 hard anchor 上整排被夾住，五級距的頂端變成看不出差別的格子）。⇒ 預設 A；B 是給「攻速上限解到 10」之後的世界用的。`,
    `⚠️ ${SPEED_GROWTH_AXIS_LABEL.ms}兩把梯子都撞不到上限 18（B 極大在 LV99 中位 13.64），但它有另一個代價：B 極大在 LV30 把移速從 5.8 推到 **8.12（+40%）** ⇒ 那是**追逃節奏**的改動，不是數值微調。`,
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/speed-growth-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/speedGrowthTiers.ts 的 resolveSpeedGrowthTiers（全專案唯一的查表處）← content/registries.ts 的 registerAll，在英雄註冊時把 msGrowthTier / asGrowthTier 翻成 growth.ms / growth.as；選人畫面、商店預覽、後台試算、文件產生器全部讀同一份註冊表",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和冷卻／傷害／耗魔五級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note:
        `關掉之後 \`${SPEED_GROWTH_TIER_FIELD.ms}\` / \`${SPEED_GROWTH_TIER_FIELD.as}\` 不解析，每一位回到自己英雄卡上手寫的 \`growth.ms\` / \`growth.as\` —— ⭐ 那就是**一鍵回到今天的那一套數字**。` +
        "⚠️ 那些原值一直都在（級別只在**註冊時**蓋過去），⛔ 這一軸從來沒有銷毀退路值。",
    },
    {
      path: "ladder",
      zh: "用哪一把梯子",
      note:
        "owner 2026-08-21 給的兩個候選，⭐ 出貨 `A`（他自己說「預設走 A」）。" +
        "⚠️ **今天切過去一個位元都不會動** —— 49 位落在兩把梯子值相同的那兩格。" +
        "⭐ 切成 `B` 的到期條件很明確：攻速上限從 4 解到 10 的那一天（今天 B 的極大在 LV30 就讓 49 位裡 47 位越過上限）。",
      optionLabels: {
        A: `A（預設・保守）— ${SPEED_GROWTH_AXIS_LABEL.ms} ${SG("A", "ms")}／${SPEED_GROWTH_AXIS_LABEL.as} ${SG("A", "as")}`,
        B: `B（激進）— ${SPEED_GROWTH_AXIS_LABEL.ms} ${SG("B", "ms")}／${SPEED_GROWTH_AXIS_LABEL.as} ${SG("B", "as")}`,
      },
    },
    {
      path: "requireAuthoredParity",
      zh: "宣告「這一版零平衡改動」",
      note:
        "開著 = 宣告「每一位的級別解析出來**逐位元等於**他英雄卡上原本的成長」，`pnpm speedtiers:check` 與守衛會逐位對帳。⭐ 這一版出貨就是這樣。" +
        "⚠️ 開始重新分級（把某一位移出預設那一格）的那天**把它關掉** —— 那才是「我知道我在改平衡」的宣告。⛔ 不要去改測試：一條永遠為真的守衛與一條被偷偷改掉的守衛，壞處是一樣的。",
    },
    ...SPEED_GROWTH_LADDER_IDS.flatMap((id) =>
      SPEED_GROWTH_AXES.flatMap((axis) =>
        SPEED_GROWTH_TIER_NAMES.map((tier) => ({
          path: `growth.${id}.${axis}.${tier}`,
          zh: `梯子 ${id}・${SPEED_GROWTH_AXIS_LABEL[axis]}・${tier}`,
          note:
            `填 \`${SPEED_GROWTH_TIER_FIELD[axis]}: "${tier}"\` 的英雄**每升一級**加多少${SPEED_GROWTH_AXIS_LABEL[axis]}。` +
            `⚠️ 只有「用哪一把梯子」選到 ${id} 的時候這一格才生效。` +
            `⭐ 出貨值 {{出貨值}}（owner 逐字給的規格，⛔ 不是推導出來的）。` +
            `⚠️ 改這一格，每一位標成「${tier}」的英雄同時跟著變 —— 而且它乘上等級：LV99 的差距是這個數字的 98 倍。` +
            `⚠️ 上界 ${SPEED_GROWTH_MAX[axis]} ＝ 這條屬性解鎖後的天花板 ÷ (等級上限−1)，是一道 mis-parse 柵欄（把 0.05 打成 5），⛔ 不是平衡判準。` +
            `⚠️ 下界 ${SPEED_GROWTH_MIN}：負成長＝越升級越慢，會被 STAT_CLAMPS 靜默夾住（做得到、看不出來、沒有東西會紅）。`,
        })),
      ),
    ),
  ],
  // 純量葉 + 一個開關 + 一個下拉，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ──────────────────── 移速加成五級距 (config/move-speed-tiers) ─

/** 出貨五格一行（現算，⛔ 不是說明裡手打的數字）。 */
const MSB_ROW = MS_BONUS_TIER_NAMES.map(
  (n) => `${n} ${DEFAULT_MOVE_SPEED_TIERS.bonus[n]}`,
).join(" / ");

export const MOVE_SPEED_TIERS_SPEC: ConfigDocSpec<"moveSpeedTiers"> = {
  page: "moveSpeedTiers",
  collection: "config",
  docId: "move-speed-tiers",
  schemaTag: "config.move-speed-tiers@1",
  zod: zConfigMoveSpeedTiersDoc,
  title: "移速加成五級距",
  intro: [
    "owner 2026-08-27（逐字）：「**移動速度加成一律的 %轉換為五級距，一樣列表可設定，五級距上下限增加移速為 0.1~4**」。",
    `⭐ 這一軸級距化的是 **modifier 節點**（任意深度的 \`{stat:"ms", op:pctAdd|pctMult}\`），⛔ 不是技能頂層欄位 —— 技能 buff／靈氣／死亡守衛／道具／增益卡**同一把梯子**。單位是**百分比加成的小數**：0.5 = +50%（pctAdd 加算；pctMult 乘區，1 = ×2）。出貨 ${MSB_ROW}。`,
    "⭐ **第〇·四（exclusive）**：帶級別的節點**沒有** `value` —— 值在載入（註冊）時由 `resolveMsBonusTier` 從這一頁解析。⇒ 改這五格 = 全部 24 列一起動，零重新產生。",
    "⭐ 極小 0.1／極大 4 是 owner 的上下限**逐字**；小 0.2／中 0.5／大 1 是映射時挑的格點（量到最大的三個值叢 0.2／0.5／1.0 逐字落格 ⇒ 那三叢零捨入）。映射走「最近的一格、平手往低」；逐列映射表在 #789。",
    "⚠️ **豁免不在這一頁編**（`exemptions` 分支原封帶走）：op=flat（單位是 u/s 不是 %）、赤色彗星（原作哏 ×3）、致命魂之首輪（每層 ×1.05 疊層）。要改豁免走 `content/config/move-speed-tiers.json`，守衛 `moveSpeedTiers.test.ts` 兩個方向都會盯。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/move-speed-tiers.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/moveSpeedTiers.ts 的 resolveMsBonusTier（全專案唯一的查表處）← content/registries.ts 的 withTiers 接縫（技能／道具／增益卡／英雄卡內嵌四條路同一個答案）；{{msb}} 卡面佔位與 docs/技能移速清單.md 讀同一份註冊表",
  effect:
    "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。客戶端要重新載入 bundle。和冷卻／傷害／耗魔五級距同一個形態(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note:
        "⚠️ 關掉**不是**「回到各技能原本的數字」—— 第〇·四的 exclusive 模型下，文件裡已經沒有第二份值（不解析＝modifier 沒有 value＝移速算成 NaN）。" +
        "關掉的語意是「**無視這一頁（含線上覆蓋層），回到程式裡凍結的出貨預設五格**」：這張表被改壞的那天一鍵回到出貨數字。",
    },
    ...MS_BONUS_TIER_NAMES.map((tier) => ({
      path: `bonus.${tier}`,
      zh: `「${tier}」的移速加成`,
      note:
        `標成「${tier}」的每一個移速加成節點（技能 buff／靈氣／道具／增益卡）解析成多少。` +
        `小數：0.5 = +50%；pctAdd 直接加，pctMult 進乘區（1 = ×2）。` +
        `⭐ 出貨值 {{出貨值}}。⚠️ 上下限 ${MS_BONUS_MIN}~${MS_BONUS_MAX} 是 owner 2026-08-27 逐字給的（+10% ~ +400%）。` +
        `⚠️ 改這一格**同時**改動所有標成「${tier}」的列 —— 這正是五級距的目的（一格改、全表動）。`,
    })),
  ],
  preserved: [
    {
      path: "exemptions",
      why:
        "「真不屬於級距」的具名豁免（op=flat 的 u/s 列、赤色彗星 ×3、致命魂之首輪每層 ×1.05），每一條帶著能被反駁的理由。" +
        "通用表單引擎畫不了物件陣列，所以這一頁不編輯它，但每次儲存都必須原封帶走 —— " +
        "掉了的話 moveSpeedTiers.test.ts 的「沒級別又沒豁免」與「豁免過期」兩個方向會同時紅，而且 7 個 flat 節點會被要求收進一張它們不屬於的 % 梯子。",
    },
  ],
};

// ─────────────────────── 技能正規化決策點 (config/skill-normalize) ─

export const SKILL_NORMALIZE_SPEC: ConfigDocSpec<"skillNormalize"> = {
  page: "skillNormalize",
  collection: "config",
  docId: "skill-normalize",
  schemaTag: "config.skill-normalize@1",
  zod: zConfigSkillNormalizeDoc,
  title: "技能正規化決策點",
  intro: [
    "owner 2026-08-21：「決策點一律做成**後台開關**，預設 = 你的建議」。這一頁是那句話的落地 —— 技能五級距正規化過程裡**每一個我拒絕替 owner 挑的岔路**都在這裡有一格。",
    "⭐ 它回答的**唯一**問題是：一支技能的某一軸，**該不該有級別**？420 支 × 5 欄裡有一大半本來就不該有值（被動技沒冷卻、免費技不耗魔、位移技不造成傷害）。⛔ 塞 0 是一句假話（0 秒冷卻與「沒有冷卻」在引擎裡是兩件事），而留白又和**漏填**長得一模一樣。⇒ 每一格只有兩種合法狀態：**有級別**，或**有一個推導得出來的理由**。",
    "⚠️ 這一頁**不改任何技能**：寫入路徑是 `tools/skill-remake/tierize.py`（機制）＋ `apply_tiers.py`（330 支直接編的）／`batch1.py`（產生器擁有的 90 支）。這裡決定的是**閘怎麼問**，⛔ 不是誰填哪一格。",
    "⚠️ 下面九格裡只有一格（**傷害葉範圍**）會直接改變出貨傷害，它的說明裡寫明了倍率。其餘八格改的是「哪些格子會被要求填級別」與「報告怎麼算」。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/skill-normalize.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/content/skillNormalize.ts 的 axisVerdicts / normalizeGaps（全專案唯一知道「該不該有級別」的地方）← tools/skill-normalize/gen.ts（pnpm skillnorm:build / skillnorm:check，接在 skills:sync 與 skills:check 上）",
  effect:
    "**authoring-time**：它決定閘紅不紅、報告怎麼寫，⛔ **不影響正在跑的比賽**。改完要重跑 `pnpm skillnorm:build` 才會反映到 `docs/技能五級距現況.md`。",
  fields: [
    {
      path: "enabled",
      zh: "正規化總開關",
      note: "關掉之後整條規則不跑（閘不叫、報告不產）—— ⭐ 一鍵 rollback。⚠️ 關掉**不會**改變任何技能的行為：級別與原始值都還在文件裡。",
    },
    {
      path: "carrierBaseMax",
      zh: "載體節點門檻",
      note:
        `小於等於這個數字的傷害葉**不算傷害**（那一軸判「不適用」）。一顆 \`damageArea{amount:{flat:1}, onHitTargets:[…]}\` 的工作是**送狀態**，那 1 點只是為了讓圈成立 —— ` +
        `收進級距會讓一支純控場技變成 ${DEFAULT_DAMAGE_TIERS.damage[SKILL_TIER_NAMES[0]]} 傷害的核彈（實測命中 70-03 木束縛之術／79-01 瞬步／92-04 馬勒戈壁／45-002 天照）。` +
        `⭐ 出貨 {{出貨值}}；填 0 = 載體節點全部回來當傷害技，那 5 支會被要求填級別。⚠️ 上界 ${CARRIER_BASE_MAX_CEILING} 是打錯字的閘，⛔ 不是平衡政策。`,
    },
    {
      path: "damageLeafScope",
      optionLabels: {
        "cast-amount": "cast-amount 只算施放路徑上的 amount（出貨）",
        "all-leaves": "all-leaves 連 passive.hooks 與 dot.amountPerTick 也算（⚠️ 平衡改動）",
      },
      zh: "傷害葉算哪些（⚠️ 唯一會改變出貨傷害的一格）",
      note:
        "`cast-amount` = 只有**施放路徑**（`effects` / `template.params`）上、掛在 **`amount`** 鍵的葉子 —— ⭐ 與 `tierize.py` 的寫入口徑逐字相同（兩邊分岔 = 閘要求填級別而寫入器不填的死迴圈）。" +
        "⚠️ `all-leaves` 會把住 `passive.ranks[].hooks[]` / `toggle` 的、以及住 `dot.amountPerTick` 的葉子也收進級距，而級距是**取代**基礎值的：92-02 消化液每跳 20/30/40/50 → 極小那一格，**12 倍**。實測影響 17 支技能。⛔ 那是**平衡改動**不是正規化，所以它預設是關的 —— 排序是 owner 的權力。",
    },
    {
      path: "damageColumnBasis",
      optionLabels: {
        leaf: "leaf 對它自己那一葉（出貨）",
        total: "total 對多發總計（⚠️ 會把每一段推上去）",
      },
      zh: "傷害欄的口徑",
      note:
        "`leaf` = 級別對的是**它自己那一葉**。⚠️ owner 2026-08-21 裁決 A 的「多發用總計」是一個**分級**語意，而 `amount.damageTier` 是一格**設定值的鍵** —— 把 34-04 蒼龍破（12 段 × 1500）標成「極大」會讓每一段變成 6000（總計 72000），一次 4 倍的買。" +
        "⭐ 裁決 A 的總計照算，而且它驅動**相稱性**（保證吃到 vs 有效覆蓋上限），那才是 owner 要它回答的問題。切成 `total` ⇒ 報告改用總計對級別，7 支會被點名。",
    },
    {
      path: "radiusColumnBasis",
      optionLabels: {
        "authored-node": "authored-node 填了級別的那一顆（出貨）",
        "max-coverage": "max-coverage 最大覆蓋半徑（⚠️ 散佈半徑會蓋到每一發）",
      },
      zh: "範圍欄的口徑",
      note:
        "`authored-node` = 填了級別的那一顆節點。⚠️ 理由與傷害欄逐字相同：13-04 龍星群的 `scatterRadius` 是 8（散佈半徑），而**每一發**的 `radius` 是 3 —— 把級別對到 8 會讓每一發的圈變成 8，一次 2.7 倍的買。切成 `max-coverage` ⇒ 2 支會被點名。",
    },
    {
      path: "snapPolicy",
      optionLabels: {
        nearest: "nearest 就近收（出貨，最忠實）",
        down: "down 一律往便宜／短的那邊收",
        up: "up 一律往貴／遠的那邊收",
      },
      zh: "自由數字往哪一格收",
      note: "`nearest` 最忠實，⛔ 不夾帶一次無聲的平衡改動。⭐ owner 抱怨「可施展技能的距離**普遍超遠**／施法範圍也**超大**」時要的是 `down`（一律往便宜那邊收）。",
    },
    {
      path: "riskAllowance",
      zh: "有條件風險允許超出上限",
      note:
        "owner 2026-08-21 對 65-04 天譴逐字：「飛鼠先生本來就會變成隱藏角色，所以強一點合理，並且他要有**足夠多敵人在範圍內**才有連鎖加成效果，算是有**額外條件風險**」⛔ 不調數值。" +
        "⭐ 判準是**從結構推導**的（有效覆蓋上限 > 保證吃到，而且說得出風險因子），⛔ 不是一張沒有理由的豁免名單 —— 12 段打同一個目標的蒼龍破沒有上檔，它照全額被管；明天長出來的連鎖技能自動拿到同一個待遇。",
    },
    {
      path: "proportionalityExemptNoDamage",
      zh: "無傷害技豁免相稱性",
      note:
        "「範圍·極小要求傷害是大／極大」那條相稱性規則的**分母是傷害**；一支根本不造成傷害的定身技拿去對它，得到的是一句必然為假的宣稱。⭐ 豁免的理由是**推導**的（效果樹上一片傷害葉都沒有），⛔ 不是「我覺得控場技比較弱」。",
    },
    {
      path: "gapAlert",
      zh: "落差警示門檻",
      note:
        `離最近一級多遠（相對級距值）才叫「收進去會改變手感」。⭐ 與 \`pnpm tiers:build\` **同一個數字**，⛔ 不另立一個。出貨 {{出貨值}}（＝ ${Math.round(DEFAULT_SKILL_NORMALIZE.gapAlert * 100)}%）；` +
        `放寬到 0.5 會讓報告安靜很多，⛔ 但那不代表技能收得比較準。⚠️ 上界 ${GAP_ALERT_MAX} ＝ 100%：比一整格還大的門檻等於這條警示不存在。`,
    },
  ],
  // 九格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};

// ───────────────────────────── 魔力經濟 (config/mana-economy) ─

export const MANA_ECONOMY_SPEC: ConfigDocSpec<"manaEconomy"> = {
  page: "manaEconomy",
  collection: "config",
  docId: "mana-economy",
  schemaTag: "config.mana-economy@1",
  zod: zConfigManaEconomyDoc,
  title: "魔力經濟（建議滿魔時間）",
  intro: [
    "owner 2026-08-19 逐字：「應該是去**調整回魔**，找到一個平衡⋯**平均回魔不超過 15 秒就可以滿魔再一輪，最糟的情形也不超過 20 秒**」。",
    "⛔ **2026-08-20 降級**：它本來是一條**硬地板**（程式把回魔拉到 池÷15）。owner 2026-08-20 更正：「refillSeconds:15 => **時間是建議原則 不是死程式邏輯**，你要**量給我以後給我例外清單判斷**，一樣錨點」⇒ 現在「滿魔秒數」是**建議目標**，要不要真的拉由下面的「**超標時真的把回魔拉上去**」決定，⭐ 而它出貨是**關的**。",
    "⭐ **2026-08-20：owner 決定了方向，⛔ 而它不是打開下面那個開關。** 逐字：「那我覺得**智慧影響回魔可以增加更多**、**初始回魔也增加少許**，同時**20 秒的限制可以調高到 30 秒**」⇒ 三個動作全部落在**別的三頁**：戰鬥系統的 `intToManaRegen` **0.07 → 0.21**、基礎加成的 `manaRegen` **0 → 10**、以及最糟門檻 **20 → 30 秒**（＝這一頁「滿魔秒數」的新上界）。",
    "⭐ **例外清單在 `docs/魔力回復例外清單.md`**（`pnpm mana:audit` 產生，逐隻英雄 × LV30/50/99 三個錨點）。量到的（71 隻裸裝）：**調前**中位滿魔 42.1 / 38.0 / 34.5 秒、超過 30 秒 **68 / 66 / 62 隻**；**調後**中位 **15.8 / 14.1 / 13.2 秒**、超過 30 秒 **1 / 1 / 1 隻**。⭐ owner 的新門檻（30 秒）三個錨點都只剩 1 隻超標；建議值 15 秒在 LV50／LV99 達成，LV30 是 15.8 秒（超 5%）。",
    "⚠️ 剩下的那一隻是 `godie-h02k` 熊貓，而他是**結構性**的例外：INT 2、intGrowth 0 ⇒ **智慧那根軸碰不到他**，係數再拉高他也不動（調後仍是 38.8／36.4／34.0 秒，而那一段全部來自扁平的基礎加成）。他只吃得到「基礎加成」那一格扁平的回魔。⚠️ 沒有撞到屬性上限 `manaRegen` 926：撞到的仍然只有 `godie-h020` 莉娜一隻（調前調後都是），⛔ 所以這一批沒有動上限。",
    "⭐ 打開之後規則寫在**時間**上而不是倍率上：`每秒回魔 ≥ 魔力池 ÷ 滿魔秒數`。一個倍率會對每位英雄乘出**不同的**滿魔時間（高智力本來就快，乘完更快），而 owner 給的是一個**時間**保證。",
    "⭐ 調的是**回魔**不是耗魔 —— 那是 owner 親自轉的向。拉高耗魔要動 342 支技能的卡面數字（342 個住處），調回魔只動這一頁，而玩家感受到的是同一件事（「放完要等」）。",
    "⚠️ 就算打開，它也**解不了**「範圍技連續 8 次才需要等」與「連續四個大範圍技能後一定要等」—— 那兩條要動的是每支技能的耗魔，也就是 owner 這一則否決掉的方向。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/mana-economy.json`**。線上存過一次之後，再去改 repo 裡那個檔案不會有任何效果。",
  ],
  consumer:
    "packages/shared/src/sim/manaEconomy.ts 的 manaRegenPerSec（全專案唯一知道這條地板怎麼算的地方）← sim/systems/RegenSystem.ts 每一 tick，經由 MatchController 在 tick 0 之前定格到 world.manaEconomy",
  effect:
    "**從下一場比賽開始生效**（`Configs` 是 boot 時載入的，所以後台存檔之後要重啟 game-server shard）。比賽中途不會變 —— 規則在 tick 0 之前就定格了。",
  fields: [
    {
      path: "enabled",
      zh: "魔力經濟總開關",
      note: "關掉之後這一整條規則不存在（連「建議」的語意都沒有）—— ⭐ 那就是一鍵 rollback。⚠️ 它與下面那一格**不是**同一件事：這一格關的是整條規則，下面那一格只決定「知道超標之後動不動手」。",
    },
    {
      path: "refillSeconds",
      zh: "從空到滿的建議秒數",
      note: "⭐ owner 2026-08-20：「時間是**建議原則** 不是死程式邏輯」⇒ 它是一個**被稽核的目標**，⛔ 不是保證。只有兩個讀者：① 下面那個開關打開時的地板算式（魔力池 ÷ 這個數）② `pnpm mana:audit` 判斷誰超標的門檻。出貨 **{{出貨值}}**（owner：「平均回魔不超過 15 秒就可以滿魔再一輪」）。⚠️ 上界 **30** 是 owner 自己給的數字（2026-08-19「最糟的情形也不超過 20 秒」→ 2026-08-20「**20 秒的限制可以調高到 30 秒**」），⛔ 不是防手滑的柵欄。",
    },
    {
      path: "enforceFloor",
      zh: "超標時真的把回魔拉上去",
      note: "⭐ 出貨 **關**，而 2026-08-20 之後它**更沒有理由打開**：owner 選的是「**智慧**影響回魔增加更多」，而地板會把每一位英雄拉到同一個滿魔時間、**與他的智力無關** —— 那正好是相反的方向。關著 ＝ 上面那個秒數純粹是一條建議，回魔**逐位元**等於屬性管線算出來的 `manaRegen`（調完之後中位滿魔 LV30 15.8s／LV50 14.1s／LV99 13.2s）。打開 ＝ 回到 2026-08-19 的硬地板 `每秒回魔 ≥ 魔力池 ÷ 建議秒數`。⚠️ 它是**地板不是取代**：本來就回得比它快的英雄一格都不會被動到，否則這條規則會反過來削弱高智力英雄。⚠️ 打開之前先看 `docs/魔力回復例外清單.md`。",
    },
    {
      path: "championsOnly",
      zh: "只套在英雄身上",
      note: "出貨 **開**。關掉之後殭屍與守衛塔身上帶魔力的那些也吃這條地板 —— ⚠️ 一條為英雄節奏設計的地板套到怪物身上會讓它們變成另一種東西，而沒有人要求過。⚠️ 它只在上面那個開關打開時有意義。",
    },
  ],
  // 四格純量，沒有不編輯的分支要原封帶走。
  preserved: [],
};



// ──────────────────── 吟唱五級距 (config/cast-time-tiers) ─

/**
 * ⭐ GH#943 —— owner 2026-09-02 逐字給的五格。
 * ⛔ 這五個數字是他的，⛔ 不要在這裡挑或改。
 */
export const CAST_TIME_TIERS_SPEC: ConfigDocSpec<"castTimeTiers"> = {
  page: "castTimeTiers",
  collection: "config",
  docId: "cast-time-tiers",
  schemaTag: "config.cast-time-tiers@1",
  zod: zConfigCastTimeTiersDoc,
  title: "吟唱五級距",
  intro: [
    '技能 JSON 填 `castTimeTier: "中"`，這一頁決定「中」要吟唱幾秒。',
    "⭐ 五個數字是 **owner 2026-09-02 逐字給的**：「吟唱⋯其實這個也可以五級距 **0, 0.1, 0.3, 0.5, 1** 建議也改成這個」。⛔ 不要自己挑。",
    "⚠️ 上界 1.0 與既有的 `config.cast-time@1.castTimeMaxSec` 一致 —— ⭐ 兩者刻意同一個數字：**級距寫得出來的最大值，就是引擎夾得住的最大值**。",
    "⚠️ ⭐ 這一格同時是 **AP 係數公式的一個維度**（吟唱越久係數越高）⇒ 改它會讓標了級別的技能**傷害跟著動**。⛔ 不要把它當成純粹的手感旋鈕。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/cast-time-tiers.json`**。",
  ],
  consumer:
    "packages/shared/src/content/castTimeTiers.ts 的 resolveCastTimeTier（全專案唯一的查表處）← content/registries.ts 在技能註冊時把 castTimeTier 翻成 castTimeSec",
  effect: "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。同其他五級距(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "級距總開關",
      note:
        "⭐ **一鍵回頭**：關掉之後 `castTimeTier` 不解析，技能回到自己手寫的 `castTimeSec`。" +
        "⚠️ ⛔ 關掉**不是**「全部瞬發」—— 解析器回 `null`（＝這一格沒有意見），⛔ 不是 0。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `seconds.${tier}`,
      zh: `${tier} — 吟唱秒數`,
      note:
        `填 \`castTimeTier: "${tier}"\` 的技能要吟唱幾秒（出貨值 {{出貨值}}）。` +
        `⚠️ 改這一格，樹上每一支標成「${tier}」的技能同時跟著變，` +
        `⭐ **而且 AP 係數會重算**（吟唱是公式的六維之一）。`,
    })),
  ],
  preserved: [],
};

// ──────────────────── AP 係數公式 (config/ap-coefficient) ─

/**
 * ⭐⭐ GH#942 —— 148 個手填的 `coeff` 退場，換成一條六維公式。
 *
 * ⚠️ ⭐ **這一頁的每一格都會改變全庫的技能傷害** —— 它不是一頁參數，
 * 是**一條會被套到 154 個節點上的算式**。⇒ 每一格的說明都要說「它動的是什麼」。
 * ⭐ 而 `enabled` 那一格就是 owner 常設指令要的**一鍵 rollback**：
 * 關掉 ⇒ 每一支技能回到自己文件裡那個手填的 `coeff`。
 */
export const AP_COEFFICIENT_SPEC: ConfigDocSpec<"apCoefficient"> = {
  page: "apCoefficient",
  collection: "config",
  docId: "ap-coefficient",
  schemaTag: "config.ap-coefficient@1",
  zod: zConfigApCoefficientDoc,
  title: "AP 係數公式",
  intro: [
    "⭐ `coeff = 基準 × 全域倍率 × 冷卻 × 吟唱 × 距離 × 目標形狀 × 條件 × 基礎值補償` —— **六個維度**，全部從技能自己的五級距標籤讀。",
    "⛔ 在這一頁之前，148 個 `ratios[].coeff` 是**手填的自由數字**（0.1 → 7.0，差 70 倍），而沒有任何東西說得出為什麼。",
    "⚠️ ⭐ **基準是校準出來的，⛔ 不是挑的**：它讓全庫 154 個節點的幾何平均等於**現況**的幾何平均 ⇒ 上線那一刻整體強度不變，變的是**相對關係**。⛔ 改它等於整體調強或調弱。",
    "⚠️ ⭐ **第六維是 owner 2026-09-02 加的**：「有時候技能本身如果基礎傷害低，我也會用高 AP/AD 加成來彌補」⇒ `damageTier` 越低、補償越高。⛔ 少了它，一支刻意「低基礎高成長」的技能會被公式當成離群值收掉 —— 那正是設計意圖被反向執行。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/ap-coefficient.json`**。",
  ],
  consumer:
    "packages/shared/src/content/apCoefficient.ts 的 resolveApCoeff（全專案唯一的算式）← `registries.ts` 的 `withTiers` 最外層 `resolveApCoeffOnDoc()` 在技能／道具／增益卡註冊時把級距標籤翻成 `ratios[].coeff`（GH#1035，2026-09-06 接上；在此之前這句是假的）",
  effect: "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。同五級距(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "公式總開關",
      note:
        "⭐⭐ **一鍵 rollback**：關掉之後公式完全不跑，每一支技能回到自己文件裡那個手填的 `coeff`。" +
        "⚠️ 這一格存在的理由就是「我挑錯的成本必須是改一格下拉選單」。",
    },
    {
      path: "base",
      zh: "基準係數",
      note:
        "整條公式的起點（出貨值 {{出貨值}}）。⭐ 它是**校準值** —— 讓全庫幾何平均等於現況。" +
        "⚠️ ⛔ 改它 ＝ **全庫技能一起調強或調弱**，而不是調整某一類。要調整體強度請優先用下面那一格。",
    },
    {
      path: "globalMult",
      zh: "全域倍率",
      note:
        "⭐ **調整體強度就轉這一格**（出貨 1.0）—— 它與基準相乘，但語意乾淨：基準是校準出來的常數，這一格是**意圖**。" +
        "⚠️ 1.1 ＝ 全庫 AP 加成整體 +10%。",
    },
    {
      path: "cooldownSlopeExp",
      zh: "冷卻維度的斜率",
      note: "冷卻越長、係數越高的**陡峭程度**（出貨 {{出貨值}}）。⭐ 1.0 ＝ 線性；調高 ⇒ 長冷卻技的獎勵放大。",
    },
    {
      path: "cooldown.normalizeToMidOfShape",
      zh: "冷卻先對「同形狀的中位」正規化",
      note:
        "⭐ 開著：一支技能的冷卻先跟**同一種目標形狀**的中位比，再進公式。" +
        "⚠️ ⛔ 關掉的話單體技會結構性吃虧 —— 單體表最高 60s，而範圍表可到 90/120。",
    },
    {
      path: "cooldown.scale",
      zh: "冷卻維度的幅度",
      note:
        "冷卻這一維最多能貢獻多少（出貨 {{出貨值}}）。⭐ 它與斜率是兩件事:斜率決定**形狀**,這一格決定**幅度**。⚠️ 調高 ⇒ 長冷卻與短冷卻技的係數差距整體拉開。",
    },
    {
      path: "cooldown.min",
      zh: "冷卻維度下界",
      note:
        "⚠️ **保險絲**:短冷卻技的係數不會被壓到這一格以下（出貨 {{出貨值}}）。"
        + "⭐ 沒有它,一支 2 秒冷卻的技能會被公式壓到幾乎不吃 AP —— 而那不是設計,是除法的副作用。",
    },
    {
      path: "cooldown.max",
      zh: "冷卻維度上界",
      note:
        "⚠️ **保險絲**:長冷卻技的係數不會被抬到這一格以上（出貨 {{出貨值}}）。"
        + "⭐ 沒有它,一支 300 秒冷卻的大招會拿到一個沒有人驗算過的巨大係數。",
    },
    {
      path: "castTime.base",
      zh: "吟唱維度的基準",
      note: "沒有吟唱（瞬發）時這一維的值（出貨 {{出貨值}}）。⭐ 1.0 ＝ 瞬發不加成也不懲罰。",
    },
    {
      path: "castTime.slope",
      zh: "吟唱維度的斜率",
      note: "每一秒吟唱換多少係數（出貨 {{出貨值}}）。⚠️ ⭐ 被動技的吟唱**一律當 0** —— 那是 GH#948 修掉的 34 支。",
    },
    {
      path: "castTime.capSec",
      zh: "吟唱計入上限（秒）",
      note:
        "⚠️ **保險絲**:超過這一格的吟唱不再換更多係數（出貨 {{出貨值}}）。"
        + "⭐ 它與吟唱五級距的上界刻意同一個數字 —— 級距寫得出來的最大值,就是公式算得進去的最大值。",
    },
    {
      path: "range.reference",
      zh: "距離的參考值",
      note: "⭐ 係數 1.0 對應的施法距離（出貨 {{出貨值}}）。⚠️ 比它遠的技能係數被壓低（打得到的優勢要付費）。",
    },
    {
      path: "range.exponent",
      zh: "距離維度的指數",
      note:
        "距離影響的**陡峭程度**（出貨 {{出貨值}}）。⭐ 0 ＝ 距離完全不影響係數,"
        + "調高 ⇒ 遠程技的係數折價加重。⚠️ 它動的是**全部**有施法距離的技能。",
    },
    {
      path: "range.selfCenteredAs",
      zh: "自我中心技的等效距離",
      note: "⭐ 以自己為中心的技能沒有「施法距離」⇒ 用這一格代替（出貨 {{出貨值}}）。⚠️ 填太高等於白送近戰技一份遠程折價。",
    },
    {
      path: "shape.single",
      zh: "目標形狀 — 單體",
      note:
        "⭐ 只打一個人 ⇒ 每一發該更重（出貨 {{出貨值}}）。"
        + "⚠️ 它與範圍那幾格是**相對關係**:單獨調高這一格等於全面加強單體技。",
    },
    {
      path: "shape.line",
      zh: "目標形狀 — 直線",
      note:
        "貫穿型（出貨 {{出貨值}}）—— 介於單體與範圍之間。"
        + "⚠️ 命中人數取決於站位 ⇒ 它是這一維裡**變異最大**的一格。",
    },
    {
      path: "shape.area.reference",
      zh: "目標形狀 — 範圍的參考半徑",
      note: "⭐ 半徑等於這一格時，範圍技的形狀維度等於 1.0（出貨 {{出貨值}}）。",
    },
    {
      path: "shape.area.exponent",
      zh: "範圍半徑的指數",
      note:
        "半徑越大、係數越低的**陡峭程度**（出貨 {{出貨值}}）。⭐ 0 ＝ 範圍大小完全不影響係數。"
        + "⚠️ 調高 ⇒ 大範圍技的每一發變輕,而小範圍技幾乎不受影響。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `condition.${tier}`,
      zh: `條件 — ${tier}`,
      note:
        `技能標成 \`conditionTier: "${tier}"\` 時這一維的倍率（出貨值 {{出貨值}}）。` +
        `⭐ 條件越苛刻（越難觸發）⇒ 每一次觸發該越重。` +
        `⚠️ 不填級別的技能一律當「${SKILL_TIER_NAMES[0]}」（＝無條件）。`,
    })),
    // ── ⭐⭐ 觸發頻率的三把尺（GH#939）─────────────────────────────────────
    // owner 2026-09-02 逐字核准三組出貨值；⛔ 這裡只寫**它影響什麼**，數字一律
    // 由 `{{出貨值}}` 從出貨文件填（第〇·四守則：⛔ 不要第二個住處）。
    // ⭐ 15 格 ＝ **3 個模板 × 一張五級距表**（第零守則⑨），⛔ 不是 15 個手寫欄位。
    // ⚠️ 三把尺的文案刻意各寫各的：它們的**上下限不一樣**（普攻 ≤1.00 ／ 施放 ≥0.30
    // ／ 特殊條件到 7.00），三份一模一樣的說明會讓操作者分不出自己在調哪一把。
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `frequency.basicAttack.${tier}`,
      zh: `觸發頻率 — 普攻 ${tier}`,
      note:
        `掛在 \`onBasicAttack\` 上的 AP 加成，係數乘這一格（出貨值 {{出貨值}}）。` +
        `⚠️ ⭐ **每次普攻都跑** —— 6 秒窗口內大約 4 次，所以同一個數字在這一族的` +
        `實際輸出是施放型的好幾倍（GH#946 量到 92-04 的 3.0×AP 等效 12×AP，而全庫中位 0.6）。` +
        `⛔ 調高這一族＝全遊戲的持續輸出一起抬高，⚠️ 而卡面上一個字都不會變。`,
    })),
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `frequency.abilityCast.${tier}`,
      zh: `觸發頻率 — 技能施放 ${tier}`,
      note:
        `一次技能施放才觸發一次的 AP 加成，係數乘這一格（出貨值 {{出貨值}}）。` +
        `⭐ 這是**基準**那一把尺 —— 另外兩把是相對它偏移的，⛔ 調它等於同時移動另外兩把的意義。` +
        `⚠️ 一次施放要付冷卻與耗魔，所以這一族的下限刻意不低（給太低等於施放沒有回報）。`,
    })),
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `frequency.specialCondition.${tier}`,
      zh: `觸發頻率 — 特殊條件 ${tier}`,
      note:
        `要先滿足一個**玩家控制不了**的前提（變身／反彈／帶某個標籤）才觸發的 AP 加成，` +
        `係數乘這一格（出貨值 {{出貨值}}）。⭐ 它的上限是三把尺裡最高的，因為那一次觸發` +
        `可能整場只發生一次。⚠️ 調低這一族＝那些「湊到條件才有回報」的技能失去存在理由，` +
        `而它們的說明文字仍然會宣稱那個回報。`,
    })),
    {
      path: "baseTierCompensation.enabled",
      zh: "基礎值補償開關",
      note:
        "⭐⭐ owner 2026-09-02 加的**第六維**：「有時候技能本身如果基礎傷害低，我也會用高 AP/AD 加成來彌補」。" +
        "⚠️ ⭐ **關掉它等於全部補償都變 1.0** —— 那是這一維的一鍵 rollback，⛔ 但關掉會讓低基礎技被公式當離群值收掉。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `baseTierCompensation.byDamageTier.${tier}`,
      zh: `基礎值補償 — 傷害級距 ${tier}`,
      note:
        `\`damageTier: "${tier}"\` 的技能，AP 係數乘上這一格（出貨值 {{出貨值}}）。` +
        `⭐ 基礎傷害越低 ⇒ 補償越高（這是 owner 的設計語彙，⛔ 不是平衡微調）。`,
    })),
    {
      path: "baseTierCompensation.whenTierAbsent",
      zh: "基礎值補償 — 沒填傷害級距時",
      note: "⚠️ 技能沒有 `damageTier` 時用這一格（出貨 {{出貨值}}）。⭐ 刻意偏高一點：沒填級別的多半是小額傷害。",
    },
    {
      path: "multiHit.enabled",
      zh: "第七維：發數開關",
      note:
        "⭐ owner 2026-09-06「多段技的發數維度」：公式給的是**一次施放**的係數，住在多段容器（隨機落點 N 顆、延遲 N 發、連段每段＋收尾）底下的每一發只拿 1/有效發數。" +
        "⚠️ 關掉 ＝ 每一發都拿整份（超究武神霸斬收尾、龍星群每顆流星各拿一次施放的量）。",
    },
    {
      path: "multiHit.decayPerHit",
      zh: "第七維：每發遞減係數",
      note:
        "owner 2026-08-21「總計 = 每發 × 發數 × 遞減係數」的那個遞減（幾何）：1.0 ＝ 不遞減（有效發數 = 發數）；0.9 ＝ 第 n 發只算 0.9ⁿ⁻¹ ⇒ 10 發只算 6.5 發，每發拿得多一點。出貨 {{出貨值}}。",
    },
    {
      path: "proseFromFormula",
      zh: "卡面 {{ap}} 顯示公式值",
      note:
        "⭐ owner 2026-09-06「96 張卡面寫著字面「N% [AP]」接上公式顯示 但可以後台開關」：開 ⇒ 卡面的 `{{ap}}% [AP]` 印公式解析後的係數；關 ⇒ 印文件手填的字面值。" +
        "⚠️ 只管**顯示** —— 場上跑的值由上面的公式總開關決定；兩格不同步時卡面就是在說謊（第一·五守則）。",
    },
  ],
  preserved: [],
};

// ──────────────────── 升級成長率 (config/rank-growth) ─

/**
 * ⭐⭐ GH#938 —— owner 2026-09-02 逐字：
 * 「`rankGrowth` 全域預設 0.5 其實**跟 CD／觸發頻率有關係**，
 *  陽離子砲會是 `rankGrowth: 1.0` 是因為 **CD 較長**」
 */
export const RANK_GROWTH_SPEC: ConfigDocSpec<"rankGrowth"> = {
  page: "rankGrowth",
  collection: "config",
  docId: "rank-growth",
  schemaTag: "config.rank-growth@1",
  zod: zConfigRankGrowthDoc,
  title: "升級成長率",
  intro: [
    "⭐ 一支技能**每升一級**，傷害成長幾成 —— 而它由那支技能的**冷卻級距**決定。",
    "⛔ 在這一頁之前，升級成長是把 3–4 個算好的值烘進每一份技能文件，而傷害梯子只有**五格** ⇒ 量到 **29 個節點裡 27 個（93%）至少有一級升了零提升**：80-02 弒鬼神的卡面寫「120/220/320/420（每級 +100）」，而實際是 **200/200/500/500**（+0 / +300 / +0）。",
    "⭐ owner 2026-09-02 逐字：「`rankGrowth` 全域預設 0.5 其實**跟 CD／觸發頻率有關係**，陽離子砲會是 1.0 是因為 **CD 較長**」。⚠️ ⭐ 而資料**證實了那條直覺**：把 27 個節點的實質成長率按冷卻級距分箱，上界是 0.50 → 0.50 → 0.50 → **0.75** → **1.00** —— 那條規則本來就在，只是被五格梯子壓平了。",
    "⚠️ 存檔寫進的是耐久覆蓋層（data/），**覆蓋層會蓋掉 `content/config/rank-growth.json`**。",
  ],
  consumer: "packages/shared/src/content/rankGrowth.ts 的 resolveRankGrowth（全專案唯一的查表處）",
  effect: "**要重啟 game-server shard 才生效**（內容在註冊時就解析完）。同其他級距(#278)。",
  fields: [
    {
      path: "enabled",
      zh: "成長率總開關",
      note:
        "⭐ **一鍵 rollback**：關掉之後升級成長回到技能自己寫的 `damageTierPerRank`。" +
        "⚠️ ⛔ 關掉**不是**「升級不變強」—— 解析器回 `null`（這一格沒有意見），⛔ 不是 0。",
    },
    ...SKILL_TIER_NAMES.map((tier) => ({
      path: `byCooldownTier.${tier}`,
      zh: `冷卻「${tier}」的技能 — 每級成長`,
      note:
        `冷卻級距是「${tier}」的技能,每升一級傷害成長幾成（出貨值 {{出貨值}}）。` +
        `⭐ 0.5 ＝ 第二級是首級的 1.5 倍、第三級 2 倍（**線性**,⛔ 不是複利 ——` +
        `owner 點名的 80-02 卡面逐字是「每級 +100」,那是等差）。` +
        `⚠️ 改這一格,樹上每一支冷卻標成「${tier}」的技能同時跟著變。`,
    })),
    {
      path: "whenTierAbsent",
      zh: "沒有冷卻級距時",
      note:
        "⚠️ 技能沒有 `cooldownTier` 時用這一格（出貨 {{出貨值}}）。" +
        "⭐ 0.5 是**量到的中位數**,⛔ 不是一個保守的猜測。",
    },
  ],
  preserved: [],
};
