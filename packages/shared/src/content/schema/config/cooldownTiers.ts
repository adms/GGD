import { z } from "zod";
import { zId } from "../common";
// 冷卻五級距（GH#445）—— 三張表（單體／範圍／變身）的來歷與「為什麼照抄
// owner 的數字而不是推導」寫在 content/cooldownTiers.ts。
import { COOLDOWN_SHAPES, COOLDOWN_TIER_MAX, COOLDOWN_TIER_MIN, COOLDOWN_TIER_NAMES, COOLDOWN_TIERS_DOC_ID, DEFAULT_COOLDOWN_TIERS } from "../../cooldownTiers";
// ⭐ owner 的 Q1（「連續施展 N 次以內一定要能殺死對方」）—— 單體·極小那一格的出處。
import { KILL_CASTS_REF } from "../../damageTiers";

/**
 * config.cooldown-tiers@1 — 冷卻**五級距**（GH#445）。
 *
 * owner 2026-08-19：「冷卻的階段只會分幾種 一樣是**極小小中大極大** /
 * **單體 6/15/30/45/60** / **範圍 30/45/60/90/120** /
 * **變身或持續增益狀態 30/45/60/90/120** / **不計入系統倍率及減少 CD 等效果**」。
 *
 * ⚠️ 十五格是**卡面秒**。實際等待 = 這裡的值 × `combatEnv.cooldown`（出貨 0.2）
 * ⇒ 單體·極小 6 卡面秒 = **1.2 實際秒**。語意與「為什麼照抄不推導」寫在
 * `content/cooldownTiers.ts`。
 */
// ⭐ GH#992 —— 十五格的中文短名與「為什麼是這個數字」搬到 Zod 的 `.describe()`
//    （原本住 `apps/admin/.../specs/tiers.ts`）。⛔ 一句人話只有一個住處（第〇·四守則）。
const CD_SECONDS = DEFAULT_COOLDOWN_TIERS.seconds;
const CD_SMALLEST = COOLDOWN_TIER_NAMES[0]!;
const CD_LARGEST = COOLDOWN_TIER_NAMES[COOLDOWN_TIER_NAMES.length - 1]!;
/** 範圍表相對單體表貴幾倍 —— ⭐ 現算，⛔ 不是說明裡手打的「2–5 倍」。 */
const CD_SHAPE_RATIOS = COOLDOWN_TIER_NAMES.map(
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

/** 一張表的五格（卡面秒）。⛔ 抽成函式是為了讓 `Object.fromEntries` 的轉型對得上型別。 */
const zCooldownSecondsRow = (shape: string) =>
  z
    .object(
      Object.fromEntries(
        COOLDOWN_TIER_NAMES.map((n, i) => [
          n,
          z
            .number()
            .min(COOLDOWN_TIER_MIN)
            .max(COOLDOWN_TIER_MAX)
            .describe(
              `@zh ${shape}・${n} — 卡面秒\n` +
                `@note 填 \`cooldownTier: "${n}"\` 且形狀是「${shape}」的技能要等幾**卡面**秒（⚠️ 實際等待還要乘「戰鬥系統」頁的冷卻係數再夾一次地板，換算好的秒數在「五級距總覽」頁）。` +
                `改這一格，樹上每一支落在這一格的技能同時跟著變。${COOLDOWN_SHAPE_WHY[shape] ?? ""}${COOLDOWN_TIER_WHY[i]}`,
            ),
        ]),
      ) as Record<(typeof COOLDOWN_TIER_NAMES)[number], z.ZodNumber>,
    )
    .strict();

export const zConfigCooldownTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.cooldown-tiers@1"),
    note: z.string().optional(),
    /** 止血閥。false = `cooldownTier` 不解析（＝回到技能手寫的 `cooldown`）。 */
    enabled: z.boolean().describe(
      "@zh 級距總開關\n" +
      "@note 關掉之後 `cooldownTier` 不解析（填了也不生效），技能只剩手寫的 `cooldown` 陣列 —— ⭐ 那就是**一鍵回到舊的那一套秒數**。⚠️ 關掉**不會**讓技能失去冷卻。",
    ),
    /** 沒填 `cooldownShape` 時要不要從技能內容推形狀（見 `cooldownShapeOf`）。 */
    autoShape: z.boolean().describe(
      "@zh 沒填形狀時自動判斷\n" +
      "@note 技能沒填 `cooldownShape` 時，要不要從它自己的內容推（有變身 → 變身；有範圍 → 範圍；其餘 → 單體）。⚠️ 關掉的代價是**沒填的一律當單體**，也就是範圍大絕會靜默拿到便宜的那張表（30 秒而不是 60 秒），而卡片、schema、測試全部正常。",
    ),
    /** 形狀 → 級別 → 卡面秒。三張表十五格都必填，缺一格就不是一把完整的尺。 */
    seconds: z
      .object(
        Object.fromEntries(COOLDOWN_SHAPES.map((s) => [s, zCooldownSecondsRow(s)])) as Record<
          (typeof COOLDOWN_SHAPES)[number],
          ReturnType<typeof zCooldownSecondsRow>
        >,
      )
      .strict(),
  })
  .strict();

export const DEFAULT_COOLDOWN_TIERS_DOC = {
  id: COOLDOWN_TIERS_DOC_ID,
  schema: "config.cooldown-tiers@1",
  enabled: DEFAULT_COOLDOWN_TIERS.enabled,
  autoShape: DEFAULT_COOLDOWN_TIERS.autoShape,
  seconds: DEFAULT_COOLDOWN_TIERS.seconds,
} as const;
