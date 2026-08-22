import { z } from "zod";
import { zId } from "../common";
// 基礎加成的 per-stat 區間 (task #277) — 定義在 sim 那一份,schema 只是把它搬上
// Zod,所以「頁面 / schema / sim」三層守的是同一組數字。
import { ALL_STATS, Stat } from "../../../sim/stats/statTypes";
// 屬性上限的 per-stat 區間 —— 同一條規矩:數字定義在 sim,schema 只是搬上 Zod。
import { STAT_CAP_CEILING, statCapBounds } from "../../../sim/statCaps";

/**
 * config.stat-caps@1 — 屬性上限 (`config/stat-caps.json`, GH#286): 每條屬性的
 * **一般上限** 與 **解鎖上限**。owner 2026-07-28:「一般上限是 4.0,搭配特殊條件
 * 如技能、道具...等效果,可以解鎖最多到 10.0。這兩個參數也可以放到後台設定」.
 *
 * ⚠️ 又是一份自己的文件,理由和 `config.base-bonus@1` 一樣但更強:這裡每個 key
 * 的值是一個**上限對**,而 combat-env 是倍率、base-bonus 是加數。三種語意共用一張
 * 表格的話,操作者沒有任何線索分辨他填的 4.0 是「四倍」「+4 點」還是「天花板」。
 *
 * 語意見 sim/statCaps.ts。**缺文件 = 出貨預設**(攻速 4.0 / 10.0、法強 100000
 * 開到頂),缺鍵 = 那條屬性退回 `STAT_CLAMPS` 的上界而且不可解鎖。
 *
 * ⚠️ 2026-08-01 補上**兩端的界**。這兩個欄位在此之前只有 `z.number().finite()`,
 * 也就是 CLAUDE.md 2026-07-29 點名的那個缺陷的最純粹版本:上界下界都沒有。
 * 界分兩層:
 *   · `zStatCap` 自己 —— 全屬性通用的最寬合法帶 `[0, STAT_CAP_CEILING]`,
 *     連 `catchall` 收到的未知 key 都套得到,所以「兩端都有界」沒有例外。
 *   · `.superRefine` —— 認得的 stat key 再收緊到 `statCapBounds(stat)`
 *     (下界是那條屬性 `STAT_CLAMPS` 的**地板**:比地板還低的天花板不是更嚴格的
 *     上限,而是地板無條件獲勝、這一格完全失效)。
 * 這一層擋的是打錯,不是平衡:每一條上界都遠高於出貨內容打得到的值,見
 * sim/statCaps.ts 的 `STAT_CAP_MAX`。
 */
export const zStatCap = z
  .object({
    /** 沒有解鎖來源時的上限 */
    base: z.number().finite().min(0).max(STAT_CAP_CEILING),
    /** `ModOp.CapRaise` 最多能抬到的硬上限(小於 base 會被讀成 base) */
    unlocked: z.number().finite().min(0).max(STAT_CAP_CEILING),
  })
  .strict();

/** 一條屬性自己的那一對,收緊到 `statCapBounds(stat)`。 */
function zStatCapFor(stat: Stat): typeof zStatCap {
  const [lo, hi] = statCapBounds(stat);
  const n = z.number().finite().min(lo).max(hi);
  return z.object({ base: n, unlocked: n }).strict();
}

/**
 * ⚠️ 形狀刻意和 `zBaseBonusTable` 一樣(逐 stat 一格 + `catchall`),**不是**
 * `.superRefine`:`zConfigDoc` 是 `z.discriminatedUnion`,而 discriminated union
 * 的成員必須是 ZodObject —— 一個 `.superRefine` 會把這份 schema 變成 ZodEffects,
 * 整個 config 聯集當場失效。界要下在**值**上,不能下在文件上。
 */
export const zStatCapsTable = z
  .object(
    Object.fromEntries(ALL_STATS.map((s) => [s, zStatCapFor(s).optional()])) as Record<
      Stat,
      z.ZodOptional<typeof zStatCap>
    >,
  )
  // 未知的 key 仍然吃通用帶(兩端都有界)。它進不了遊戲 —— `normalizeStatCaps`
  // 只讀 `CAPPABLE_STATS` —— 但一份文件不該因為一個 typo 而變成無界。
  .catchall(zStatCap);

export const zConfigStatCapsDoc = z
  .object({
    id: zId,
    schema: z.literal("config.stat-caps@1"),
    /** stat key ("as" / "ap" / "ms" / "cdr" …) -> { base, unlocked } */
    caps: zStatCapsTable,
  })
  .strict();
export type StatCapDoc = z.infer<typeof zStatCap>;
export type ConfigStatCapsDoc = z.infer<typeof zConfigStatCapsDoc>;
