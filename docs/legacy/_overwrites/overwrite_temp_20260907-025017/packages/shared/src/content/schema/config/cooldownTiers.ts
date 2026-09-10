import { z } from "zod";
import { zId } from "../common";
// 冷卻五級距（GH#445）—— 三張表（單體／範圍／變身）的來歷與「為什麼照抄
// owner 的數字而不是推導」寫在 content/cooldownTiers.ts。
import { COOLDOWN_SHAPES, COOLDOWN_TIER_MAX, COOLDOWN_TIER_MIN, COOLDOWN_TIER_NAMES, COOLDOWN_TIERS_DOC_ID, DEFAULT_COOLDOWN_TIERS } from "../../cooldownTiers";

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
/** 一張表的五格（卡面秒）。⛔ 抽成函式是為了讓 `Object.fromEntries` 的轉型對得上型別。 */
const zCooldownSecondsRow = () =>
  z
    .object(
      Object.fromEntries(
        COOLDOWN_TIER_NAMES.map((n) => [
          n,
          z.number().min(COOLDOWN_TIER_MIN).max(COOLDOWN_TIER_MAX),
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
        Object.fromEntries(COOLDOWN_SHAPES.map((s) => [s, zCooldownSecondsRow()])) as Record<
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
