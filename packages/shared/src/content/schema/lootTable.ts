/** loot-table@1 — mirrors `LootTable` in sim/content/defs.ts. */
import { z } from "zod";
import type { ItemId } from "../../ids";
import { zId, zRef } from "./common";

export const zLootTableDef = z
  .object({
    id: zId,
    entries: z
      .array(z.object({ itemId: zRef<ItemId>("items"), weight: z.number().positive() }).strict())
      .min(1),
  })
  .strict();

export const zLootTableDoc = zLootTableDef
  .extend({ schema: z.literal("loot-table@1") })
  .strict();

export type LootTableDoc = z.infer<typeof zLootTableDoc>;
