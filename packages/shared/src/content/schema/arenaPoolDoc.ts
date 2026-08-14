/**
 * `config.arena-pool@1` —— **哪幾張場地會進輪替**（GH#324 收尾）。
 *
 * ## ⚠️ 這一格存在的理由是一個真的缺陷
 *
 * 在此之前，輪替池是 `apps/game-server/src/match/arenaSelect.ts` 裡的一個
 * **寫死的 TS 陣列**。2026-08-14 產出七張動漫競技場、驗證過、上線之後，
 * **玩家一場都碰不到** —— 因為沒有人記得去改那個陣列。
 *
 * ⛔ 那正是這個專案的失敗形態②：**算出來了但從沒送到玩家面前**。
 * 而且寫死本身就違反第一守則（「所有功能都做成編輯器可調」）。
 *
 * ⇒ 池子變成一格後台欄位。owner 想開哪幾張就勾哪幾張，⛔ 不用改程式、不用重新部署。
 */
import { z } from "zod";

export const zConfigArenaPoolDoc = z
  .object({
    id: z.literal("arena-pool"),
    schema: z.literal("config.arena-pool@1"),
    note: z.string().optional(),
    /**
     * 進輪替的場地 id，**照這個順序**。
     *
     * ⚠️ 載入不到的 id 會被**丟掉**（不是報錯）—— 那是刻意的 fail-soft：
     * 一個打錯的 id 不應該讓整場比賽開不起來。⛔ 但它也因此是靜默的，
     * 所以 game-server 開機時會把「要求 N 張、實際解析到 M 張」印出來。
     */
    rotation: z.array(z.string().min(1)).min(1),
    /**
     * 決賽場地。⛔ 刻意不在 `rotation` 裡：它是為 12 人四個出生簇設計的
     * 42 半徑單分區，塞進一般 3v3 回合會讓兩隊在一片為四隊蓋的場地裡打，
     * 三分之二是空的。
     */
    finale: z.string().min(1),
  })
  .strict();

export type ConfigArenaPoolDoc = z.infer<typeof zConfigArenaPoolDoc>;

/**
 * 出貨預設 —— **逐字等於**在此之前那個寫死的陣列，加上七張新的動漫競技場。
 *
 * ⛔ 消費端一律從這裡推，不抄字面值。
 */
export const DEFAULT_ARENA_POOL: Omit<ConfigArenaPoolDoc, "id" | "schema" | "note"> = {
  rotation: [
    "arena.skeleton",
    "arena.castle",
    "arena.colosseum",
    "arena.dota",
    "arena.godie",
    "arena.infinity-castle",
    "arena.shiganshina",
    "arena.holy-grail",
    "arena.nazarick",
    "arena.frieren",
    "arena.world-tree",
    "arena.heavens-arena",
  ],
  finale: "arena.royale",
};

/** 讀 doc，缺的回退到出貨預設。⚠️ 唯一的解析入口。 */
export function resolveArenaPoolConfig(
  doc?: Partial<ConfigArenaPoolDoc> | null,
): typeof DEFAULT_ARENA_POOL {
  if (!doc) return DEFAULT_ARENA_POOL;
  return {
    rotation:
      Array.isArray(doc.rotation) && doc.rotation.length > 0
        ? doc.rotation
        : DEFAULT_ARENA_POOL.rotation,
    finale: typeof doc.finale === "string" && doc.finale ? doc.finale : DEFAULT_ARENA_POOL.finale,
  };
}
