/** augment@1 — mirrors `AugmentDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { AugmentId } from "../../ids";
import { zIdFor, zStatModifier } from "./common";
import { SOURCE_GRANT_SHAPE, zHookDef } from "./effect";

export const zAugmentTier = z.enum(["silver", "gold", "prismatic"]);

export const zAugmentDef = z
  .object({
    id: zIdFor<AugmentId>(),
    name: z.string().min(1),
    description: z.string().min(1),
    tier: zAugmentTier,
    weight: z.number().positive(),
    modifiers: z.array(zStatModifier).optional(),
    hooks: z.array(zHookDef).optional(),
    /**
     * ⭐ **格擋 / 暴擊來源**（owner #299 第 2 · 6 條）。
     *
     * 三選一增益卡在這一格之前只寫得出 `modifiers` 與 `hooks`，所以
     * 「這一場開始每次攻擊 20% 機率 3 倍傷害」只能退化成加
     * `critChance` / `critDamage` 兩條**聚合**屬性 —— 而那會讓這位英雄
     * 身上**每一次**暴擊都變成那個倍率（`sim/combat/critStrike.ts` ①），
     * 不是「這張卡自己的那一次」。owner 要的三種結果（200 倍 / 100 倍 / 2 倍）
     * 在聚合屬性上是寫不出來的。
     *
     * ⚠️ 這一格在肉鴿三選一上特別重要：`critRules.stackMode` 出貨值是
     * `multiply`（每一條各抽各的骰、倍率相乘），而那條規則存在的**理由**
     * 就是「玩家的第二張暴擊卡不可以是廢牌」。沒有這一格，那個理由沒有內容
     * 可以指向 —— 卡片發不出第二條獨立的暴擊來源。
     */
    ...SOURCE_GRANT_SHAPE,
    tags: z.array(z.string()),
  })
  .strict();

export const zAugmentDoc = zAugmentDef.extend({ schema: z.literal("augment@1") }).strict();

export type AugmentDoc = z.infer<typeof zAugmentDoc>;
