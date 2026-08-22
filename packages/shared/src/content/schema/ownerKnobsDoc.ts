/**
 * `config.owner-knobs@1` —— ⛔ **系統倍率是 owner 的人工旋鈕，不是我的。**
 *
 * owner 2026-08-22（他說這是**第三次**釐清）：
 *
 * > 「對 我說過**這是我人工的旋鈕**，並沒有放在公式裡，我們上次已經釐清過，**為何你要再犯**？」
 *
 * ⭐ 這份文件是那句話的**另一半**。第一半（「倍率不可以進公式」）早就記在
 * `content/damageTiers.ts::anchorFloorFrom` 的註解裡；⛔ 而「倍率**不是我能轉的**」
 * 在 2026-08-22 之前哪裡都沒記 —— 於是我把 `damageDealt` 從 1.0 設成 2.5，
 * **每一條既有的閘都是綠的**（沒進推導、三個住處齊全、有說明與上下界）。
 *
 * ⚠️ 它**不是**一份設定 —— 引擎一個字都不讀它。它是一張**授權表**：
 * 每一格的出貨值 ＋ owner 說出那個值的**逐字原話**。
 * 守衛 `packages/shared/src/ops/ownerKnobs.test.ts` 拿它比對
 * `content/config/combat-env.json`，對不上就紅並指名那一格。
 */
import { z } from "zod";

export const OWNER_KNOBS_DOC_ID = "owner-knobs";

const zKnob = z
  .object({
    /** 出貨值 —— 必須逐位元組等於 `combat-env.json` 的那一格。 */
    value: z.number(),
    /**
     * ⭐ owner 說出這個值的**逐字原話**。
     * ⛔ 空的 = 沒有人授權過這一格 ⇒ 守衛紅。
     * ⚠️ 逐字，⛔ 不要改寫 —— 他的原話比我的摘要準。
     */
    quote: z.string().min(1).max(500),
    /** 他說那句話的日期（`—` = 從未改過的出貨中性值）。 */
    on: z.string().min(1).max(32),
  })
  .strict();

export const zConfigOwnerKnobsDoc = z
  .object({
    id: z.literal(OWNER_KNOBS_DOC_ID),
    schema: z.literal("config.owner-knobs@1"),
    note: z.string().max(2000).optional(),
    knobs: z.record(z.string().min(1), zKnob),
  })
  .strict();

export type ConfigOwnerKnobsDoc = z.infer<typeof zConfigOwnerKnobsDoc>;
