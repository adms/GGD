import { z } from "zod";
import type { AbilityId } from "../../../ids";
import type { EffectDef } from "../../../sim/effects/effect";
import { PROXY_MAX_CHAIN_DEPTH } from "../../../sim/effects/kindLimits";
import { zCastableSlot, zRef } from "../common";
import {
  EFFECT_COMMON_SHAPE,
  refineDispelShape,
  zAoeTier,
} from "./_shared";

/**
 * ⭐ `proxyCast` 的跨欄位規則（Lane 3）。
 *
 * ① `slot` 與 `abilityId` **恰好填一個**。⛔ 不給預設：兩個都不填沒有一個誠實的
 *    答案，而「挑一個當預設」會讓一份打錯字的文件安靜地代放錯技能。
 * ② `rankMode:"fixed"` 一定要有 `fixedRank`，反之填了 `fixedRank` 卻不是 fixed
 *    模式 = 一格永遠不被讀的設定。
 */
function refineProxyCast(
  e: Extract<EffectDef, { kind: "proxyCast" }>,
  ctx: z.RefinementCtx,
): void {
  refineDispelShape(e, ctx);
  const named = (e.slot !== undefined ? 1 : 0) + (e.abilityId !== undefined ? 1 : 0);
  if (named !== 1) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["abilityId"],
      message:
        "要指名代放**哪一支**：填 slot（我自己的哪一格）或 abilityId（哪一支技能），" +
        "而且**恰好一個**。兩個都不填沒有誠實的答案；兩個都填時只有一個會被讀到。",
    });
  }
  // ⭐ S5 ③ —— 要**付代價**就必須指名 `slot`。
  // 這是一個**資料完整性**問題，不是設計偏好（所以它是一條 refine，不是一格欄位）：
  // `abilityId` 指的可能是一支施法者根本沒有的技能 —— 沒有魔力可扣、也沒有按鈕
  // 可以轉冷卻。⛔ 不在 handler 裡靜默降級成 `"none"`：靜默降級正是失敗形態②
  //（作者勾了「扣魔」、遊戲裡免費放，而畫面上一模一樣）。
  if ((e.payCosts ?? "none") !== "none" && e.slot === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["payCosts"],
      message:
        "要付代價就必須指名 slot（我自己的哪一格）—— abilityId 指的可能是一支施法者" +
        "根本沒有的技能，沒有魔力可扣、也沒有按鈕可以轉冷卻。",
    });
  }
  if (e.rankMode === "fixed" && e.fixedRank === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fixedRank"],
      message: 'rankMode:"fixed" 一定要有 fixedRank —— 否則不知道要用第幾階施放',
    });
  }
  if (e.rankMode !== "fixed" && e.fixedRank !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["fixedRank"],
      message: 'fixedRank 只有 rankMode:"fixed" 讀得到 —— 這一格永遠不會被讀到',
    });
  }
}

export const zProxyCast =

/**
 * ⭐ S5【代放】(80-04 赤兔咆哮「攻擊時有 20% 使出弒鬼神」)。
 *
 * ⚠️ `content/templates/expand.ts` 的 `"proxy-cast"` 是一個**模板家族名**，
 * 不是這個 kind（它自己的檔頭寫著「這裡不召喚任何東西」）。
 * ⛔ 終止性由 `EffectContext.proxyDepth` 嚴格遞增 + {@link PROXY_MAX_CHAIN_DEPTH}
 * 保證，形狀與 `damage.incomingPct` 的 `reflectDepth` 逐字相同。
 */
z
  .object({
    kind: z.literal("proxyCast"),
    ...EFFECT_COMMON_SHAPE,
    /** ⭐ E1 硬約束：新 kind 一律帶 `shape`。 */
    shape: z.enum(["single", "circle"]),
    radius: z.number().positive().max(40).optional(),
    /** ⭐ AoE 級別（owner 2026-08-11「原則上不寫範圍數字」）。填了它就不要填
     *  `radius` —— 註冊時由 `config.aoe-tiers@1` 翻成半徑，兩者都填則**級別贏**。
     *  唯一的查表處：`content/aoeTiers.ts` 的 `resolveRadiusTier`。 */
    radiusTier: zAoeTier.optional(),
    side: z.enum(["allies", "enemies"]).optional(),
    maxTargets: z.number().int().positive().max(24).optional(),
    /** 代放**我自己的哪一格**。與 `abilityId` **恰好填一個**（superRefine 擋）。 */
    slot: zCastableSlot.optional(),
    /**
     * 代放**哪一支具名技能**。**軟參照**：代放的目標可能是一支還沒上架的技能，
     * 硬參照會讓白名單一縮就整份內容載入失敗（2026-08-02 事故的形狀）。
     */
    abilityId: zRef<AbilityId>("abilities", { soft: true }).optional(),
    payCosts: z
      .enum(["none", "mana", "manaAndCooldown"])
      .optional()
      .describe(
        "代放要不要付代價：none（預設，不扣魔也不轉冷卻）／mana（扣魔）／" +
          "manaAndCooldown（扣魔並讓那一格進冷卻）。⚠️ 一個每次普攻都可能觸發的" +
          "代放若會轉冷卻，那支大招就會自己把自己鎖住。",
      ),
    respectCooldown: z
      .boolean()
      .optional()
      .describe("代放要不要看那一格按鈕的冷卻。留空＝不看（冷卻中照樣代放）。"),
    requireLearned: z
      .boolean()
      .optional()
      .describe("沒點那一招時什麼都不發生。留空＝要求已學會。"),
    rankMode: z
      .enum(["casterRank", "fixed"])
      .optional()
      .describe("用哪一階施放：casterRank（預設，玩家點的等級）或 fixed。"),
    fixedRank: z.number().int().min(1).max(5).optional(),
    targetMode: z
      .enum(["inherit", "reresolve"])
      .optional()
      .describe("目標從哪來：inherit（預設，沿用觸發這次的那個目標）或 reresolve。"),
    /** 代放鏈最多再往下幾層。省略 = 0（被代放的技能自己的代放直接被擋）。 */
    maxDepth: z.number().int().min(0).max(PROXY_MAX_CHAIN_DEPTH).optional(),
    /**
     * ⭐ 第一守則（2026-08-10）—— `payCosts:"none"` 要不要發
     * `onAbilityCast` / `onAbilityHit`。省略 = `false` = **今天的行為**。
     *
     * 在這一格出現之前，「不發」是寫死在 handler 裡的一個沒有欄位的選擇：
     * `"none"` 那條路直接 `runEffects`，繞過 `castAbility`，所以那兩個事件從來
     * 不發。⛔ 而那正是「這裡選 A 還是 B」——「代放算不算一次施法」是**設計偏好**，
     * 不是引擎事實：80-04 的赤兔咆哮不該再觸發一輪「施法時」被動（會遞迴），
     * 但一支「大絕結束後自動再放一次 Q」的卡片會希望它算數。
     *
     * ⚠️ `"mana"` / `"manaAndCooldown"` 走 `castAbility`，那兩個事件**本來就會發**，
     * 所以這一格對它們沒有作用（handler 只在 `"none"` 那條路讀它）。
     */
    emitCastEvents: z
      .boolean()
      .optional()
      .describe(
        "不付代價的代放要不要算成一次「施法」（發出施法/命中事件，讓「施法時」" +
          "那一類被動吃得到）。留空＝不發（今天的行為）。⚠️ 打開它之前先看" +
          "「最多再往下幾層」：一支被代放的技能若自己掛著「施法時代放」的被動，" +
          "這一格就是那條鏈的入口；終止靠的是深度上限，不是靠這一格關著。",
      ),
  })
  .strict();

export const refine = refineProxyCast;
