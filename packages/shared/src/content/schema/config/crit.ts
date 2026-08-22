import { z } from "zod";

/**
 * config.crit@1 — 暴擊規則（GH#302）。
 *
 * owner 2026-08-09 逐字：
 *
 * > 我同時獲得 1%機率 100倍 以及 10%機率 2倍暴擊傷害，這樣我會有三種結果，
 * > 100x2=200、100、2倍，**因為是每一條暴擊獨立算完傷害再帶入下一條**
 *
 * ⚠️ 和 `config.shield@1` 不同、和 `config.block@1` 相同：**這份文件的出貨值會
 * 改變平衡**，而且是故意的 —— owner 推翻了原本的「取最好的那一條、整發只抽一次」。
 * 舊行為保留成 `stackMode: "max"`，後台切得回去（連抽幾次骰都一樣，見
 * `sim/critRules.ts` 的 `CritStackMode`）。
 *
 * ⭐ owner 同一天另外交代：「**暴擊計算方式 上限 這些參數都要能後台彈性設定**」——
 * 所以這裡是三格而不是一格：怎麼算（`stackMode`）、總倍率上限（`maxTotalMult`）、
 * 最多算幾條（`sourceCap`）。
 *
 * 為什麼是自己一份文件而不是塞進 `config.block@1`：格擋與暴擊是 `damage.ts` 兩段
 * 不相干的結算（一個在防守側、一個在出手側），而 schema 加一格等於把
 * `config.block@1` 升版 —— 一份已經在線上存過 overlay 的文件升版，代價是操作者
 * 存過的值全部要遷移。同理也不塞 `config.combat-feel@1`（那一頁的欄位是
 * `deriveFields()` 從 Zod 推導的，而那支推導器只認得 number / boolean，塞一個
 * enum 進去就是把隔壁工作流的頁面弄紅）。
 *
 * **缺文件 = 出貨預設**（{@link SHIPPED_CRIT}），不是空表 —— 一個 undefined 的
 * `stackMode` 會讓 `rollCritStrike` 的分支全部落空，也就是暴擊整族靜默失效：
 * 暴擊數字照跳、音效照響、傷害一點都沒多。
 */
export const zConfigCritDoc = z
  .object({
    id: z.literal("crit"),
    schema: z.literal("config.crit@1"),
    note: z.string().optional(),
    /**
     * 多條暴擊來源同時吃得到這一發時，它們怎麼合成。
     *
     *   multiply  每一條各抽各的骰，抽中的倍率**相乘**（出貨值 = owner 的裁決）
     *   max       只有期望增益最高的那一條參與，整發只抽一次
     *             （= 這條規則變成欄位之前的行為）
     *   add       每一條各抽各的骰，抽中的倍率**相加**
     *
     * 三個值都有行為守衛（`sim/combat/critStrike.test.ts`：同一組來源 + 同一顆
     * 種子 → 三種模式給出三組不同的總倍率）。
     */
    stackMode: z.enum(["multiply", "max", "add"]),
    /**
     * 一次攻擊的**總**倍率上限（owner 指定 100）。夾的是合成之後的那一個數字。
     *
     * ⚠️ 兩端都有界（#277）。下界 1 不是平衡政策，是保險絲：一個 <1 的「上限」
     * 會把每一次暴擊變成減傷，而畫面上只看得到「暴擊怎麼比平砍還不痛」。
     */
    maxTotalMult: z.number().min(1).max(1000),
    /**
     * 同一次攻擊最多算**幾條來源攜帶的**暴擊（owner 指定 5）。超出的照期望增益
     * 由高到低排序後整條不參與，連骰都不抽 —— 所以它同時是每一發的亂數預算上界。
     *
     * ⚠️ 它不管英雄自己的 `Stat.CritChance`（那是一條聚合屬性，永遠只有一條）。
     * 理由寫在 `sim/critRules.ts`：讓它佔格的話，把這一格調到 1 會讓每一個堆了
     * 暴擊率的英雄完全吃不到暴擊武器，而畫面上就是「這把劍壞了」。
     */
    sourceCap: z.number().int().min(1).max(16),
  })
  .strict();
export type ConfigCritDoc = z.infer<typeof zConfigCritDoc>;

/** ⚠️ 缺文件 = 這一份，不是空物件（同 `SHIPPED_WEAKNESS` 的規矩）。 */
export const SHIPPED_CRIT: ConfigCritDoc = {
  id: "crit",
  schema: "config.crit@1",
  stackMode: "multiply",
  maxTotalMult: 100,
  sourceCap: 5,
};
