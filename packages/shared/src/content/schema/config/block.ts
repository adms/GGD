import { z } from "zod";
import { zId } from "../common";

/**
 * config.block@1 — 格擋規則。
 *
 * 目前只有一格:**同一個單位身上有多個格擋來源時,它們怎麼疊**。語意、owner 的
 * 原話、以及「為什麼 `best` 還留著」全部寫在 `sim/blockRules.ts`。
 *
 * ⚠️ 和 `config.shield@1` 不同,**這份文件的出貨值會改變平衡**,而且是故意的:
 * owner 2026-07-31 裁決「這種情形應該是獨立判斷兩次,拿第一次檔掉剩餘繼續算
 * 下一次」,推翻了原本的「取最好的一個、只抽一次」。晨曦之光 + 殺豬刀從 30%
 * 變成 51%。舊行為保留成 `best`,後台切得回去。
 *
 * 為什麼是自己一份文件而不是塞進 `config.shield@1`:護盾與格擋在 `damage.ts`
 * 是**兩段相鄰但獨立**的結算(格擋在護盾之前、而且刻意不吃護盾),而 schema 加
 * 一格等於把 `config.shield@1` 升版 —— 一份已經在線上存過 overlay 的文件升版,
 * 代價是操作者存過的值全部要遷移。同理也不塞 `config.combat-feel@1`:那一頁的
 * 欄位是 `deriveFields()` 從 Zod 推導的,而那支推導器只認得 number / boolean,
 * 塞一個 enum 進去就是把隔壁工作流的頁面弄紅(同 `config.shield@1` 的理由)。
 *
 * **缺文件 = 出貨預設**(`independent`),不是空表 —— 一個 undefined 的 stacking
 * 會讓 `blockCutFor` 兩條分支都不走,也就是格擋整族靜默失效。
 */
export const zConfigBlockDoc = z
  .object({
    id: zId,
    schema: z.literal("config.block@1"),
    note: z.string().optional(),
    /**
     * 多個格擋來源同時吃得到這一發時,它們怎麼疊。
     *
     *   independent  每個來源各抽各的,擋中的從**剩餘**傷害裡扣掉自己的
     *                `fraction`,剩下的交給下一個(出貨值 = owner 的裁決)
     *   best         只有 `chance × fraction` 最大的那一個參與,整發只抽一次
     *                (= 這條規則變成欄位之前的行為)
     *
     * 兩個值都有行為守衛(`sim/combat/block.test.ts` ⑤:同一組來源 + 同一顆
     * 種子 → 兩種模式給出兩組不同的擋掉量與不同的 rng draw 數)。
     */
    stacking: z.enum(["independent", "best"]),
    /**
     * ⭐⭐ GH#650 —— **格擋觸發率的系統倍率**（出貨 1.0 ＝ 逐位元不變）。
     *
     * ⚠️ 它存在的理由是一次量測，⛔ 不是平衡想法：owner 回報過**兩次**
     * 「初號機 AT力場格擋成功沒出現橘色光盾特效」，
     * ⭐ 而跑出貨鏈量到的是 —— **格擋成功時特效真的會發**
     * （`sim/combat/blockVfxShippedAbility.test.ts`，跑那份 ability JSON 本人）。
     * ⭐ 而他判斷「格擋成功」的依據（畫面上的 **GUARD** 字）**不是那一格擋的**：
     * GUARD 只在**整發被吃光**時出現，⛔ 而 AT力場只擋 50%。
     * ⇒ 最可能的真相是那 **10%** 沒抽中。
     *
     * ⇒ ⭐ 這一格讓 owner **自己驗**：調到 3 ⇒ 30% ⇒ 幾發之內一定看得到。
     * ⚠️ ⛔ 出貨值我不替他決定（第一守則「可調 ≠ 我可以轉」）。
     * ⚠️ 上界 5：再高會把所有 `chance` 夾到 1（每一發都擋）—— 那不是旋鈕是開關。
     * ⭐ 0 是合法的：那是「把格擋整族關掉」的除錯狀態。
     */
    chanceMult: z.number().min(0).max(5).optional(),
  })
  .strict();
export type ConfigBlockDoc = z.infer<typeof zConfigBlockDoc>;
