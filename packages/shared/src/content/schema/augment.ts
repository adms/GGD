/** augment@1 — mirrors `AugmentDef` in sim/content/defs.ts. */
import { z } from "zod";
import type { AugmentId } from "../../ids";
import { zIdFor, zStatModifier } from "./common";
import { SOURCE_GRANT_SHAPE, refineUnrankedHookPerRank, zHookDef } from "./effect";
import {
  AUGMENT_SELECTION_SLOTS,
  GRAIL_MECHANICS,
  GRAIL_MODE_FEATURES,
} from "../../sim/economy/grailVocabulary";

export const zAugmentTier = z.enum(["silver", "gold", "prismatic"]);

/**
 * ⭐ **靈基適性條件**（聖杯願望設計規則 §15「⛔ 禁止死願望」）。
 *
 * 兩個列舉都是**從 sim 端那份封閉清單直接展開的**，⛔ 不是在這裡再抄一份 ——
 * 名字寫得出來就一定有一條推導（`sim/economy/augmentEligibility.ts` 的
 * `MECHANIC_PROBES` 是 `Record<GrailMechanic, …>`，少一條不編譯）。
 * 這正是這一格與「讀 tags」的差別：後者對 461 份**一份都沒有 tags 欄位**的技能
 * 文件永遠回 false，於是 50 張願望一張都不出現而沒有東西會紅。
 */
const zGrailMechanic = z.enum(GRAIL_MECHANICS);
const zGrailModeFeature = z.enum(GRAIL_MODE_FEATURES);
const zCoreSlot = z.enum(["Q", "W", "E", "R"]);

export const zGrailEligibility = z
  .object({
    requiresSelfMechanic: z
      .array(zGrailMechanic)
      .min(1)
      .optional()
      .describe("【任一】這位英雄身上要有其中至少一個機制,否則這張願望不進他的卡池。"),
    requiresEnemyMechanic: z
      .array(zGrailMechanic)
      .min(1)
      .optional()
      .describe("【任一】敵方至少一位身上要有其中至少一個機制(例:破盾類要有人產得出護盾)。"),
    excludeSelfMechanic: z
      .array(zGrailMechanic)
      .min(1)
      .optional()
      .describe("【全部排除】這位英雄身上只要有其中一個就不發(例:已經在飛就不要再發飛行)。"),
    prefersSelfMechanic: z
      .array(zGrailMechanic)
      .min(1)
      .optional()
      .describe("【任一 · 軟的】命中就把權重乘上後台的「連動加權」,⛔ 不擋任何人。"),
    requiresMana: z
      .boolean()
      .optional()
      .describe("這位英雄要用魔力(maxMana > 0)。出貨 78 位裡有 5 位不用。"),
    requiresAbilitySlots: z
      .array(zCoreSlot)
      .min(1)
      .optional()
      .describe("【全部】這幾格技能都要存在(例:技能代放 Q/W/E 三格都要有)。"),
    requiresAnyAbilitySlot: z
      .array(zCoreSlot)
      .min(1)
      .optional()
      .describe("【任一】這幾格裡至少一格存在。"),
    requiresModeFeature: z
      .array(zGrailModeFeature)
      .min(1)
      .optional()
      .describe("【全部】這一場要有這些東西(隊友 / 小怪 / 殭屍王 / 火圈 / 復活圈 / 中立物件)。"),
    onlyAttackType: z
      .enum(["melee", "ranged"])
      .optional()
      .describe("只發給近戰或只發給遠程。"),
  })
  .strict()
  .refine((e) => Object.keys(e).length > 0, {
    message: "eligibility 是空物件 —— 沒有條件就把整格刪掉,不要留一個看起來有設的空殼",
  });

/**
 * ⭐ **顯現位置**（設計規則 §16「三個選項要有差異」）。
 *
 * ⚠️ 這是**偏好不是分配**。§16 建議三格分別是「與現有 build 連動 / 泛用防守 /
 * 改變戰術方向」，但出貨 60 張裡 generic 只有 10 張(三個階級分下去各約 3 張)——
 * 硬性一格一種會讓第二張願望每一場都是那三張裡的一張。所以開牌時的做法是
 * **先湊齊不同的 slot,湊不到就照權重補**(`economy/draft.ts`)。
 */
export const zAugmentSelectionSlot = z.enum(AUGMENT_SELECTION_SLOTS);

export const zAugmentDef = z
  .object({
    id: zIdFor<AugmentId>(),
    name: z.string().min(1),
    description: z.string().min(1),
    tier: zAugmentTier,
    weight: z.number().positive(),
    modifiers: z.array(zStatModifier).optional(),
    /**
     * ⭐ G4 —— 三選一增益卡是**抽到就掛**，沒有階級概念
     * （`economy/draft.ts::applyAugmentPick` 建來源時不帶 rank），所以掛在這裡的
     * hook payload 只讀得到 `perRank` 的第 1 欄。⛔ 不可以只關道具那一半：
     * 兩個載體同樣拿不到 rank，只關一邊等於留一個一模一樣的洞。
     */
    hooks: z.array(zHookDef.superRefine(refineUnrankedHookPerRank)).optional(),
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
    /** ⭐ §15 靈基適性條件 —— 缺席 = 無條件（出貨 60 張裡 12 張是這樣）。 */
    eligibility: zGrailEligibility.optional(),
    /** ⭐ §16 顯現位置偏好 —— 缺席時開牌視同 `generic`。 */
    selectionSlot: zAugmentSelectionSlot.optional(),
  })
  .strict();

export const zAugmentDoc = zAugmentDef.extend({ schema: z.literal("augment@1") }).strict();

export type AugmentDoc = z.infer<typeof zAugmentDoc>;
