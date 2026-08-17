/** loot-table@1 — mirrors `LootTable` in sim/content/defs.ts. */
import { z } from "zod";
import type { ItemId } from "../../ids";
import { zId, zRef } from "./common";

export const zLootTableDef = z
  .object({
    id: zId,
    /**
     * 給人看的池名（「EX 寶具池」「[EX解放] 寶具池」）。⛔ 不是 id：id 是
     * `weaponTiers[].table` 與 `rounds[].weaponLootTable` 用的 join key，
     * 改它會斷掉排程；這一格只影響後台清單與稽核報表怎麼稱呼它。
     */
    name: z.string().min(1).max(64).optional(),
    /**
     * 這張池**為什麼長這樣** —— owner 的裁決與判準（同 `item@1.authoringNote`）。
     *
     * ⭐ 它存在的理由是「一張池被誰排到」與「一張池為什麼收這幾件」是兩種不同的
     * 知識，而後者以前只能寫在 commit message 裡 —— 下一輪讀 JSON 的人看不到，
     * 於是「這件為什麼在這一階」每隔幾週就要重新推導一次。
     * ⚠️ 上界 3000 字（item 的 authoringNote 是 2000，池的裁決通常要列幾件的理由，
     * 所以放寬一級）。撞到上界時**另存**到 docs/ 再留一行指標，
     * ⛔ 不要把原文壓縮取代（CLAUDE.md 第一·五守則）。
     */
    note: z.string().max(3000).optional(),
    entries: z
      .array(z.object({ itemId: zRef<ItemId>("items"), weight: z.number().positive() }).strict())
      .min(1),
  })
  .strict();

export const zLootTableDoc = zLootTableDef
  .extend({ schema: z.literal("loot-table@1") })
  .strict();

export type LootTableDoc = z.infer<typeof zLootTableDoc>;
