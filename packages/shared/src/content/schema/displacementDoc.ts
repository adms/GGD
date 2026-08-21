/**
 * `config.displacement-tiers@1` 的 Zod schema —— 位移級距（GH#318）。
 *
 * ⚠️ 這一份**刻意住在自己的檔案**而不是 `schema/config.ts`：那個檔案這一輪由
 * 四個 lane 同時碰，union 那一行由主 agent 統一接。要接的是：
 *
 *     import { zConfigDisplacementTiersDoc } from "./displacementDoc";
 *     // 加進 zConfigDoc 的 discriminated union
 *
 * ⛔ union 漏掉這一行 = 這份文件在 `content:build` 的嚴格驗證就被拒 →
 * 內容**整份**載入失敗 → fail-open 退回骨架 2 隻英雄（2026-08-02 事故形態）。
 *
 * ⭐ 這裡**沒有** `maxSpeed` 與 `minBodyRadius` 兩格，那是故意的：它們是
 * **推導**出來的（`floor(TICK_HZ × 最小身體半徑 × safetyFactor)`，半徑來自
 * `config.arena-rules@1`）。把推導值也開成欄位＝第二個住處，而那個住處會在
 * 有人調 mob 半徑的那天靜默說謊。要調天花板就調 `safetyFactor`。
 */
import { z } from "zod";
import { zId } from "./common";
import {
  DEFAULT_DISPLACEMENT_TIERS,
  DISPLACEMENT_AUTHORED_SPEED_MAX,
  DISPLACEMENT_DISTANCE_MIN,
  DISPLACEMENT_PUSH_DISTANCE_MAX,
  DISPLACEMENT_SAFETY_FACTOR_MAX,
  DISPLACEMENT_SAFETY_FACTOR_MIN,
  DISPLACEMENT_SPEED_MIN,
  DISPLACEMENT_TIERS_DOC_ID,
  DISPLACEMENT_TIER_NAMES,
  DISPLACEMENT_TRAVEL_DISTANCE_MAX,
  type DisplacementTierName,
} from "../displacementTiers";
// ⚠️ content → sim 是**既有方向**（`displacementTiers.ts` 已經 import
// `sim/effects/knockbackLimits`），所以這一條不會產生模組循環。
// ⛔ 出貨值只有一份：`DEFAULT_WALL_BLOCK`，⛔ 不在這裡重打四個字面值。
import { DEFAULT_WALL_BLOCK, WALL_BLOCK_POLICIES } from "../../sim/movement/wallBlock";

/** 四個級別的名字（schema / 後台下拉 / 技能欄位共用同一份）。 */
export const zDisplacementTier = z.enum(DISPLACEMENT_TIER_NAMES);

const zTierRow = (distanceMax: number, what: string) =>
  z
    .object({
      distance: z
        .number()
        .min(DISPLACEMENT_DISTANCE_MIN)
        .max(distanceMax)
        .describe(`${what}多遠（GGD 單位）。`),
      speed: z
        .number()
        .min(DISPLACEMENT_SPEED_MIN)
        .max(DISPLACEMENT_AUTHORED_SPEED_MAX)
        .describe(
          "移動速度（GGD 單位/秒）。⚠️ 註冊時還會被**推導出來的天花板**再夾一次" +
            "（穿牆門檻 = 每 tick 位移不可以超過身體半徑），所以填高於天花板的值不會生效。" +
            "收招時間 = 距離 ÷ 速度。",
        ),
    })
    .strict();

/** 一條梯子 = 四格級別 × 一組 `{distance, speed}`。⛔ 級別名從那一份陣列來，不重打。 */
const zLadder = (distanceMax: number, what: string) => {
  const row = zTierRow(distanceMax, what);
  return z
    .object(
      Object.fromEntries(DISPLACEMENT_TIER_NAMES.map((n) => [n, row])) as Record<
        DisplacementTierName,
        typeof row
      >,
    )
    .strict();
};

export const zConfigDisplacementTiersDoc = z
  .object({
    id: zId,
    schema: z.literal("config.displacement-tiers@1"),
    note: z.string().optional(),
    /**
     * ① 級距的止血閥。false = 技能上的 `distanceTier` 不解析（填了不生效，
     * 但看得見它是關的）。⚠️ 關掉它**不會**關掉速度天花板 —— 那是下面那一格。
     */
    enabled: z
      .boolean()
      .describe("技能上填的位移級別（小/中/大/極大）要不要被翻成距離與速度。關掉＝只吃手寫數字。"),
    /**
     * ② 速度天花板的止血閥。⛔ 關掉 = GH#318 的穿牆回來。
     * 與 `enabled` 分開，因為「不想用級距」與「想讓人穿牆」不是同一件事。
     */
    clampSpeed: z
      .boolean()
      .describe(
        "所有衝刺／擊退的速度要不要被安全上限夾住（無條件，跟有沒有填級別無關）。" +
          "⚠️ 關掉會讓高速位移穿過牆與柱子（GH#318）。",
      ),
    safetyFactor: z
      .number()
      .min(DISPLACEMENT_SAFETY_FACTOR_MIN)
      .max(DISPLACEMENT_SAFETY_FACTOR_MAX)
      .describe(
        "安全係數。速度上限 = 無條件捨去(30 × 最小身體半徑 × 這一格)。" +
          "1.0 正好踩在穿牆的平手線上，所以出貨留 0.9 當浮點餘裕。調小＝更安全也更慢。",
      ),
    /** 梯 A —— 自己動（`dash`）。 */
    travel: zLadder(DISPLACEMENT_TRAVEL_DISTANCE_MAX, "衝刺"),
    /** 梯 B —— 別人被推（`knockback`）。 */
    push: zLadder(DISPLACEMENT_PUSH_DISTANCE_MAX, "把人推"),
    /**
     * ③ 穿牆的**另一半**（owner 2026-08-21「有許多地圖的牆 瞬移過去」）。
     *
     * ⚠️ 與上面的 `clampSpeed` 是**兩個不同的缺陷**，⛔ 不可以合成一格：
     * `clampSpeed` 修的是「一步跨太遠 ⇒ 穿隧」（`dash` / 擊退滑行，GH#318），
     * 這一區塊修的是「**終點就在牆的另一邊**」（`blink` 沒有中間位置、`leap`
     * 刻意離開平面物理）。夾住瞬移的速度是沒有意義的 —— 它沒有速度。
     *
     * ⚠️ **必須 `.optional()`**：線上已經有 `config.displacement-tiers@1` 的耐久
     * 覆蓋層，而那一份沒有這個 key。必填會讓它在 `content:build` 被拒 ⇒ 內容
     * 整份載入失敗 ⇒ fail-open 退回骨架 2 隻英雄（2026-08-02 事故形態）。
     * 缺席時 `wallBlockFromDoc` 回**出貨值**（＝修好的那一邊），⛔ 不是關掉。
     */
    wallBlock: z
      .object({
        enabled: z
          .boolean()
          .describe(
            "位移的終點要不要被牆擋住。⛔ 關掉＝ 2026-08-21 之前的行為（瞬移／跳躍直接穿過牆）。",
          ),
        blink: z
          .enum(WALL_BLOCK_POLICIES)
          .describe(
            "真瞬移（blink）撞到牆時：allow＝照舊穿過去／clamp＝停在牆前／cancel＝整段不發生。",
          ),
        leap: z
          .enum(WALL_BLOCK_POLICIES)
          .describe(
            "拋物線（leap／擊飛）撞到牆時：allow／clamp／cancel，語意同上。⚠️ 跳過**柱子**不受這一格影響（見下一格）。",
          ),
        pillarsBlock: z
          .boolean()
          .describe(
            "圓柱算不算牆。false（出貨）＝只有 box／segment 的牆擋位移，柱子照樣跳得過、瞬移得過。",
          ),
        /**
         * ⭐ GH#490 —— **飛行是這條規則的合法例外**（owner 2026-08-21「翔封界 等飛行效果」）。
         *
         * ⚠️ **必須 `.optional()`**，理由與 `wallBlock` 自己那一格逐字相同：
         * 線上的耐久覆蓋層可能已經存過一份**有 `wallBlock` 但沒有這個 key** 的
         * 文件（`wallBlock` 是同一天早上才加的）。⛔ 必填 ⇒ `.strict()` 退回 ⇒
         * 內容整份載入失敗 ⇒ fail-open 退回骨架 2 隻英雄（2026-08-02 事故形態）。
         * 缺席時 `wallBlockFromDoc` 回**出貨值 `true`**，⛔ 不是關掉。
         */
        flightExempt: z
          .boolean()
          .optional()
          .describe(
            "在飛的單位（走路就穿得過牆的那些）位移時要不要照樣穿得過。true（出貨）＝飛行是這條規則的合法例外。",
          ),
      })
      .strict()
      .optional(),
  })
  .strict();

/** 出貨值的文件形狀 —— 第一守則三個住處裡的「Zod DEFAULT_*」那一個。 */
export const DEFAULT_DISPLACEMENT_TIERS_DOC = {
  id: DISPLACEMENT_TIERS_DOC_ID,
  schema: "config.displacement-tiers@1",
  enabled: DEFAULT_DISPLACEMENT_TIERS.enabled,
  clampSpeed: DEFAULT_DISPLACEMENT_TIERS.clampSpeed,
  safetyFactor: DEFAULT_DISPLACEMENT_TIERS.safetyFactor,
  travel: DEFAULT_DISPLACEMENT_TIERS.travel,
  push: DEFAULT_DISPLACEMENT_TIERS.push,
  wallBlock: DEFAULT_WALL_BLOCK,
} as const;
