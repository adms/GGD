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
// ⭐ GH#1001 —— 人話住 Zod 的 `@zh` / `@note` 的那幾格，從這裡推導（⛔ 不再手打第二份）。
import { derivedFields, schemaToForm } from "../schemaToForm";
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
  fields: derivedFields(zConfigAoeTiersDoc, []),
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
  fields: derivedFields(zConfigRangeTiersDoc, []),
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
  fields: derivedFields(zConfigCooldownTiersDoc, []),
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
  fields: derivedFields(zConfigDamageTiersDoc, []),
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
  fields: derivedFields(zConfigManaTiersDoc, []),
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
  fields: derivedFields(zConfigSpeedGrowthTiersDoc, [
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

  ]),
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
  fields: derivedFields(zConfigMoveSpeedTiersDoc, []),
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
  fields: derivedFields(zConfigSkillNormalizeDoc, [
  ]),
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
  fields: derivedFields(zConfigManaEconomyDoc, []),
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
  fields: derivedFields(zConfigCastTimeTiersDoc, []),
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
  fields: derivedFields(zConfigApCoefficientDoc, []),
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
  fields: derivedFields(zConfigRankGrowthDoc, []),
  preserved: [],
};
