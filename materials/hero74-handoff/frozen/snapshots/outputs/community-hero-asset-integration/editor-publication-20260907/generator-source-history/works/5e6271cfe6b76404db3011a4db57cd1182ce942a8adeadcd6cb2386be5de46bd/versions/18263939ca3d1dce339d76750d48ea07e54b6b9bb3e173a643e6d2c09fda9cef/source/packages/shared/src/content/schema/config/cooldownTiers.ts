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
    enabled: z.boolean(),
    /** 沒填 `cooldownShape` 時要不要從技能內容推形狀（見 `cooldownShapeOf`）。 */
    autoShape: z.boolean(),
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
