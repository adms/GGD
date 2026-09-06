import { z } from "zod";
import { zId } from "../common";
// 移速**加成**五級距（GH#789，owner 2026-08-27）。⛔ 這裡刻意不抄那五個數字與
// 豁免理由：它們住在 content/moveSpeedTiers.ts（抄一份就是第二個住處）。
import {
  DEFAULT_MOVE_SPEED_TIERS,
  MOVE_SPEED_TIERS_DOC_ID,
  MS_BONUS_MAX,
  MS_BONUS_MIN,
  MS_BONUS_OPS,
  MS_BONUS_TIER_NAMES,
  describeMoveSpeedTiers,
} from "../../moveSpeedTiers";

/**
 * config.move-speed-tiers@1 — 移速**加成**五級距（GH#789）。
 *
 * owner 2026-08-27（逐字）：
 * > 「移動速度加成一律的 %轉換為五級距，一樣列表可設定，五級距上下限增加移速為 0.1~4」
 *
 * ⭐ 它級距化的是 **modifier 節點**（任意深度的 `{stat:"ms", op:pctAdd|pctMult}`），
 * ⛔ 不是文件頂層欄位 —— 形狀抄 `damageTier`（#534 exclusive：級別與 `value`
 * 不同時存在，值在載入時由 `resolveMsBonusTier` 解析）。
 * 單位是**百分比加成的小數**（0.5 = +50%；乘區的 1.0 = ×2）。
 */
export const zConfigMoveSpeedTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.move-speed-tiers@1"),
    note: z.string().optional(),
    /**
     * 止血閥。⚠️ false ＝ 改用**程式內出貨預設表**解析，⛔ 不是「不解析」——
     * exclusive 模型下文件裡沒有第二份值，不解析＝modifier 沒有 value＝
     * statPipeline 算出 NaN（`m.value * stacks`）。
     */
    enabled: z
      .boolean()
      .describe(
        "@zh 級距總開關\n" +
        "@note ⚠️ 關掉**不是**「回到各技能原本的數字」—— 第〇·四的 exclusive 模型下，文件裡已經沒有第二份值（不解析＝modifier 沒有 value＝移速算成 NaN）。關掉的語意是「**無視這一頁（含線上覆蓋層），回到程式裡凍結的出貨預設五格**」：這張表被改壞的那天一鍵回到出貨數字。\n" +
        "關掉之後 `msBonusTier` 改用程式內**出貨預設表**解析（⛔ 不是不解析——文件裡沒有第二份值，不解析會讓移速算成 NaN）。⭐ 用途：這張表被改壞的那天一鍵回到出貨那五個數字。"
      ),
    /** 五格：級別 → 百分比加成的小數。每一格 0.1~4（owner 的上下限，逐字）。 */
    bonus: z
      .object(
        Object.fromEntries(
          MS_BONUS_TIER_NAMES.map((n) => [
            n,
            z
              .number()
              .min(MS_BONUS_MIN)
              .max(MS_BONUS_MAX)
              .describe(
                // ⭐ GH#992 —— 後台那一頁的短名／說明從這裡推導，⛔ 不在 `apps/admin` 再打一份。
                `@zh 「${n}」的移速加成\n` +
                  `@note 標成「${n}」的每一個移速加成節點（技能 buff／靈氣／道具／增益卡）解析成多少。⭐ 出貨值 {{出貨值}}。` +
                  `「${n}」解析成多少移速加成（小數：0.5 = +50%；pctAdd 加算、pctMult 乘區共用）。` +
                  `⚠️ 上下限 ${MS_BONUS_MIN}~${MS_BONUS_MAX} 是 owner 2026-08-27 逐字給的。` +
                  `⚠️ 改這一格，每一個標成「${n}」的移速加成節點（技能 buff／靈氣／道具／增益卡）同時跟著變。` +
                  describeMoveSpeedTiers(),
              ),
          ]),
        ) as Record<(typeof MS_BONUS_TIER_NAMES)[number], z.ZodNumber>,
      )
      .strict(),
    /**
     * 「真不屬於級距」的具名豁免 —— 每一條**帶著能被反駁的理由**（第〇·四守則）。
     * 守衛的反向斷言在守：規則再也匹配不到任何節點 ⇒ 紅（棘輪只准變短）。
     */
    exemptions: z
      .array(
        z
          .object({
            op: z
              .string()
              .min(1)
              .optional()
              .describe(`匹配整個 op（出貨：flat——單位是 u/s 不是 %。梯子只管 ${MS_BONUS_OPS.join("/")}）。`),
            id: z.string().min(1).optional().describe("匹配一份文件 id（出貨：赤色彗星 ×3、致命魂之首輪 每層 ×1.05）。"),
            reason: z.string().min(1).describe("為什麼它不該有級別。⛔ 「還沒收」不是理由。"),
          })
          .strict(),
      )
      .describe(
        "沒有級別的 ms % 節點必須被這裡的某一條罩住，否則守衛紅；" +
          "一條規則再也匹配不到任何節點也會紅（過期豁免要刪）。",
      ),
  })
  .strict();

export const DEFAULT_MOVE_SPEED_TIERS_DOC = {
  id: MOVE_SPEED_TIERS_DOC_ID,
  schema: "config.move-speed-tiers@1",
  enabled: DEFAULT_MOVE_SPEED_TIERS.enabled,
  bonus: DEFAULT_MOVE_SPEED_TIERS.bonus,
  exemptions: DEFAULT_MOVE_SPEED_TIERS.exemptions,
} as const;
