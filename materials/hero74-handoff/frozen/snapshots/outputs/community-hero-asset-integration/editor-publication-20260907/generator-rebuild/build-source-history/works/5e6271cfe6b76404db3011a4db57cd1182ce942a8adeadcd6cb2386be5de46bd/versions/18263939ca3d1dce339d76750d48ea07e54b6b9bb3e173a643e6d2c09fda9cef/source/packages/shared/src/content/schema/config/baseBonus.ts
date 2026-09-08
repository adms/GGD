import { z } from "zod";
import { zId } from "../common";
// 基礎加成的 per-stat 區間 (task #277) — 定義在 sim 那一份,schema 只是把它搬上
// Zod,所以「頁面 / schema / sim」三層守的是同一組數字。
import { ALL_STATS, Stat } from "../../../sim/stats/statTypes";
import { baseBonusBounds } from "../../../sim/baseBonus";

/**
 * config.base-bonus@1 — 基礎加成 (`config/base-bonus.json`): a FLAT grant added
 * to every champion's final stat, AFTER the combat-env multiplier and therefore
 * NOT scaled by it. owner 2026-07-28:「初始HP/MP/AP/AD/... 增加數值也要放到後台
 * 設定 並且不參與倍率計算」.
 *
 * ⚠️ 為什麼是自己一份文件,不是塞進 `config.combat-env@1`。那份文件的每個 key 都
 * 是**倍率**,而這裡每個 key 都是**加數**。合在一起的話,後台一個表格裡會有兩種
 * 語意相反的欄位共用同一種外觀 —— 把 300 打進倍率欄位是 300 倍傷害。
 *
 * 語意見 sim/baseBonus.ts。未列的 stat = 0(沒有贈禮),不是「沿用預設」。
 *
 * ⚠️ 每個 stat 都有**自己的區間** (task #277),和 combat-env 的 per-key bounds
 * 同一個形狀。舊版只有 `z.number().finite()`,於是 `maxHealth: -9999` 是一份
 * 完全合法的文件 —— 全 115 位英雄開場即死,而且三層(頁面/schema/sim)沒有一層
 * 會說話。區間本身定義在 `sim/baseBonus.ts`(`baseBonusBounds`),schema 這一層
 * 只是把它搬到 Zod 上,所以兩邊不可能漂走。
 *
 * 未知的鍵仍然被接受(`.catchall`,只要是有限數字)並在 `normalizeBaseBonus`
 * 被丟掉 —— 這維持了改版前的容忍度:一個打錯的 key 不該讓整棵內容樹載不起來。
 */
const zBaseBonusTable = z
  .object(
    Object.fromEntries(
      ALL_STATS.map((s) => {
        const [lo, hi] = baseBonusBounds(s);
        return [s, z.number().finite().min(lo).max(hi).optional()];
      }),
    ) as Record<Stat, z.ZodOptional<z.ZodNumber>>,
  )
  .catchall(z.number().finite());

export const zConfigBaseBonusDoc = z
  .object({
    id: zId,
    schema: z.literal("config.base-bonus@1"),
    /** stat key ("maxHealth" / "ad" / "ap" …) -> flat grant. 缺鍵 = 0。 */
    bonus: zBaseBonusTable,
  })
  .strict();
export type ConfigBaseBonusDoc = z.infer<typeof zConfigBaseBonusDoc>;
