/**
 * `modifyCooldown` —— 縮短／重置**特定一支技能**的冷卻（issue #284）。
 *
 * ── ⛔ 它為什麼不是「一條 CDR 屬性」 ──────────────────────────────────────
 * 全域冷卻縮減早就存在（`Stat.CooldownReduction`，`abilitySystem` 付成本時乘進去）。
 * 但這一批要的三支技能講的都是**一支**：
 *
 *   · 79-04 卍解      「[瞬步] 冷卻縮短 50%」
 *   · 79-002 虛化     「[月牙天衝] 冷卻縮短 50%」
 *   · 60-002 絕光斬   「反彈成功，冷卻立即重置」
 *
 * 把它們做成 CDR 屬性，等於讓卍解順便縮短**其他五格**的冷卻 —— 文案說的是一招，
 * 遊戲做的是六招（失敗形態 ② 的反面：做多了，而且沒有人看得出來）。
 *
 * ── 冷卻住在哪 ────────────────────────────────────────────────────────────
 * `AbilitiesComp` 的每一格自己（`AbilityInstance.cooldownRemainingTicks`，
 * `stats/statsComp.ts`），由 `abilities/abilitySystem.ts::tickCooldowns` 每 tick 減一。
 * ⚠️ 它是**遞減計數器**而不是絕對 tick —— 那是既有設計（六格 + 普攻共用同一支
 * ticker），這個 kind 不改它。所以這裡的寫法一律是「把那一格的剩餘量調小」，
 * 沒有任何新的到期時鐘，也就沒有 CLAUDE.md 禁止的遞減計數器**新增**。
 *
 * ── 兩個真正的決策點 ──────────────────────────────────────────────────────
 * ① **哪一支**：`slot`（槽位）或 `abilityId`（精確引用）。兩種都要，因為
 *    「[瞬步] 冷卻縮短」講的是一支**具名技能**（可能被裝在任何一格），而
 *    「重置自己這一格」講的是槽位。schema 擋掉兩個都不填。
 * ② **百分比是誰的百分比**：`basis`
 *      · `"remaining"`（預設）—— 剩餘 × (1 − amount)。「立刻縮短一半」的直覺讀法。
 *      · `"base"`             —— 剩餘 − 基礎冷卻 × amount。這是「這一招的冷卻
 *                                縮短 50%」在一次性效果裡唯一誠實的寫法：
 *                                縮掉的量與「還剩多久」無關。
 *    ⛔ 我沒有在這裡挑一個然後在註解裡辯護（CLAUDE.md 第一守則）。
 *
 * ── purity ────────────────────────────────────────────────────────────────
 * 無 rng、無時鐘、無三角函式；槽位以 `CASTABLE_SLOTS` 的固定順序走，不迭代 Map。
 */
import type { EntityId } from "../../ids";
import type { AbilitiesComp, AbilityInstance } from "../stats/statsComp";
import type { CastableSlot } from "../intents";
import type { EffectKindSpec } from "./effectKind";
import { CASTABLE_SLOTS } from "../intents";
import { Abilities } from "../content/registry";
import { shapeTargets } from "./shapeTargets";
import { CD_REDUCE_MAX_FLAT_SEC, CD_REDUCE_MAX_PCT } from "./kindLimits";

/** 一個身體的某一格 —— 六格（Q/W/E/R/EX/天生技）用同一個讀法。 */
function instanceAt(ab: AbilitiesComp, slot: CastableSlot): AbilityInstance | undefined {
  if (slot === "EX") return ab.exSlot ?? undefined;
  if (slot === "PASSIVE") return ab.passiveSlot ?? undefined;
  return ab.slots[slot];
}

export const modifyCooldownEffect: EffectKindSpec<"modifyCooldown"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // 「作用在自己還是目標」—— owner 的三支裡兩支是自己（卍解／虛化強化自己的
    // 另一招），一支也是自己（絕光斬重置自己）。所以預設 self，而 target 留給
    // 「延長敵人冷卻」那一族（負的 amount 也走同一條路）。
    const bodies: EntityId[] = (e.who ?? "self") === "self" ? [ctx.caster] : shapeTargets(e, ctx);

    for (const body of bodies) {
      const ab = world.abilities.get(body);
      if (!ab) continue;

      // 固定順序，不是 Object.keys —— 兩個槽同時符合 `abilityId` 時誰先被改
      // 必須是規格的一部分（#198 那一族 desync 的形狀）。
      for (const slot of CASTABLE_SLOTS) {
        if (e.slot !== undefined && e.slot !== slot) continue;
        const inst = instanceAt(ab, slot);
        if (!inst) continue;
        if (e.abilityId !== undefined && inst.abilityId !== e.abilityId) continue;
        // rank 0 = 沒學。它沒有冷卻可言，改它等於在一個玩家看不到的地方寫數字。
        if (inst.rank <= 0) continue;
        if (inst.cooldownRemainingTicks <= 0) continue;

        if (e.mode === "reset") {
          inst.cooldownRemainingTicks = 0;
          continue;
        }

        const amount = e.amount ?? 0;
        let cut: number;
        if (e.mode === "reduceFlat") {
          const secs = Math.max(
            -CD_REDUCE_MAX_FLAT_SEC,
            Math.min(CD_REDUCE_MAX_FLAT_SEC, amount),
          );
          cut = Math.round(secs / world.dt);
        } else {
          const pct = Math.max(-CD_REDUCE_MAX_PCT, Math.min(CD_REDUCE_MAX_PCT, amount));
          if ((e.basis ?? "remaining") === "base") {
            // 「這一招的冷卻縮短 50%」—— 分母是**基礎冷卻**，跟還剩多久無關。
            // 查不到定義（骨架 / 單元測試的空登錄表）時退回剩餘量，理由與
            // `clearPools` 對「不知道」的處置一致：退化到安全的那一邊，不亂猜。
            const def = Abilities.tryGet(inst.abilityId);
            const baseSec = def?.cooldown[Math.max(0, inst.rank - 1)] ?? 0;
            cut =
              baseSec > 0
                ? Math.round((baseSec * pct) / world.dt)
                : Math.round(inst.cooldownRemainingTicks * pct);
          } else {
            cut = Math.round(inst.cooldownRemainingTicks * pct);
          }
        }
        // 夾在 [0, ∞)：一發「延長」不可以把冷卻推成負數，一發「縮短」不可以
        // 把它推過頭變成負的剩餘量（`tickCooldowns` 只在 > 0 時減，負數會永遠留著）。
        inst.cooldownRemainingTicks = Math.max(0, inst.cooldownRemainingTicks - cut);
      }
    }
  },
};
