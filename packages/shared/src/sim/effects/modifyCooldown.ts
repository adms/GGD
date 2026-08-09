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
import type { SimWorld } from "../SimWorld";
import type { AbilitiesComp, AbilityInstance } from "../stats/statsComp";
import type { HookDef, ModifierSource } from "../stats/modifiers";
import type { CastableSlot } from "../intents";
import type { EffectKindSpec, EffectOf } from "./effectKind";
import { CASTABLE_SLOTS } from "../intents";
import { Abilities } from "../content/registry";
import { shapeTargets } from "./shapeTargets";
import { CD_REDUCE_MAX_FLAT_SEC, CD_REDUCE_MAX_PCT } from "./kindLimits";
import { NEVER_FIRED, hookIcdTicks } from "./hookIcd";

/**
 * ⭐ S3 —— 一條 hook 的 ICD 記帳被這一發推到哪一格。
 *
 * `hookLastFired[hi]` 存的是「上次發動的 tick」，而 `fireHooks` 的閘是
 * `world.tick - last < icdTicks`。所以「縮短冷卻」＝**把那個 tick 往前搬**：
 * 沒有第二個時鐘、沒有新的遞減計數器（CLAUDE.md 禁止新增遞減計數器）。
 *
 * · `reset`      → {@link NEVER_FIRED}，逐字等於「從來沒發動過」。
 * · `reduceFlat` → 往前搬 N 秒。
 * · `reduce`     → 往前搬「剩餘 × pct」或「基礎 ICD × pct」（`basis`，同技能槽位
 *                  那一半的同一格欄位，作者不用學第二個概念）。
 *
 * 夾在 `[NEVER_FIRED, world.tick]`：一發**延長**（負的 amount）不可以把觸發器推成
 * 「未來才發動過」—— 那會讓它冷卻一輩子，而畫面上只是「這個 proc 好像壞了」。
 */
function nextLastFired(
  world: SimWorld,
  src: ModifierSource,
  hook: HookDef,
  e: EffectOf<"modifyCooldown">,
  last: number,
): number {
  if (e.mode === "reset") return NEVER_FIRED;
  const icdTicks = hookIcdTicks(world, src, hook);
  const amount = e.amount ?? 0;
  let cut: number;
  if (e.mode === "reduceFlat") {
    const secs = Math.max(-CD_REDUCE_MAX_FLAT_SEC, Math.min(CD_REDUCE_MAX_FLAT_SEC, amount));
    cut = Math.round(secs / world.dt);
  } else {
    const pct = Math.max(-CD_REDUCE_MAX_PCT, Math.min(CD_REDUCE_MAX_PCT, amount));
    const remaining = Math.max(0, icdTicks - (world.tick - last));
    cut = Math.round(((e.basis ?? "remaining") === "base" ? icdTicks : remaining) * pct);
  }
  return Math.max(NEVER_FIRED, Math.min(world.tick, last - cut));
}

/**
 * ⭐ S3 —— `hookScope: "originSource"` 指的是哪一份來源。
 *
 * `fireHooks` 跑 hook 效果時傳的 `origin` 是 `` `hook:${src.id}` ``，所以「我自己
 * 那一份」是一個**現成的關係**，不是一個要作者填、會腐爛的 join key。
 * 60-002 絕光斬的兩條 hook（「120 秒一次的反彈」與「反彈成功就重置」）本來就住在
 * 同一份被動來源上，這正是它需要的。
 *
 * ⚠️ 從**施放**跑出來的效果（`origin` 是 `ability:…`）不屬於任何一份來源，所以
 * 這裡回 `undefined` = 一份都不動。那種文件要的是 `hookScope:"allSources"` +
 * `hookKey`（schema 已經強制那一格必填），⛔ 不是在這裡多猜一條字串規則。
 */
const HOOK_ORIGIN_PREFIX = "hook:";
function originSourceId(origin: string): string | undefined {
  return origin.startsWith(HOOK_ORIGIN_PREFIX)
    ? origin.slice(HOOK_ORIGIN_PREFIX.length)
    : undefined;
}

/**
 * ⭐ S3 —— `target: "hookInternalCooldown"` 的整條路（60-002 絕光斬那一族）。
 *
 * 為什麼非要它：一支 **passive-only** 的技能永遠不會被 cast，所以它那一格的
 * `cooldownRemainingTicks` **恆為 0**，上面那條路第一道 `<= 0` 就跳過它。於是
 * 「120 秒一次」與「反彈成功立即重置」在此之前只能二選一 —— 作者要嘛不寫 ICD
 *（於是每次反彈都觸發），要嘛寫了而重置永遠是一個 no-op（失敗形態②）。
 *
 * ⛔ 為什麼不做 `MarkSpec.rechargeSec`：`sim/marks.ts` 檔頭⑤已經逐字拒絕過
 * 「標記自己長回來」那個形狀，而且它會是**第二種** ICD——同一條 hook 於是有兩個
 * 各自為真的冷卻。這裡改的是既有的那一格，引擎裡仍然只有一個 ICD 概念。
 */
function applyToHookIcd(
  world: SimWorld,
  bodies: readonly EntityId[],
  e: EffectOf<"modifyCooldown">,
  origin: string,
): void {
  const onlyId = e.hookScope === "allSources" ? undefined : originSourceId(origin);
  if (onlyId === undefined && e.hookScope !== "allSources") return;
  for (const body of bodies) {
    const sc = world.stats.get(body);
    if (!sc) continue;
    for (const src of sc.sources) {
      if (!src.hooks || !src.hookLastFired) continue;
      if (onlyId !== undefined && src.id !== onlyId) continue;
      for (let hi = 0; hi < src.hooks.length; hi++) {
        const hook = src.hooks[hi]!;
        if (e.hookKey !== undefined && hook.key !== e.hookKey) continue;
        // 沒有內部冷卻的 hook 沒有東西可以重置。⛔ 不要「順手」把它也寫成
        // NEVER_FIRED：`hookLastFired` 同時是診斷面板讀的那份單一真相。
        if (!hook.internalCooldown) continue;
        src.hookLastFired[hi] = nextLastFired(world, src, hook, e, src.hookLastFired[hi]!);
        // `internalCooldownScope: "perAbilitySlot"` 的第二本帳也要一起搬，否則
        // 「重置」在那種 hook 上是半個 no-op（source 那一格開了、槽位那一格還鎖著）。
        // ⚠️ 鍵先排序再走 —— `sim/purity.test.ts` 禁止依賴 Map 的迭代序。
        const perSlot = src.hookLastFiredBySlot?.[hi];
        if (perSlot) {
          for (const k of [...perSlot.keys()].sort()) {
            perSlot.set(k, nextLastFired(world, src, hook, e, perSlot.get(k)!));
          }
        }
      }
    }
  }
}

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

    // ⭐ S3 —— 兩種冷卻，兩條路。省略 = `"abilitySlot"` = 這個 kind 今天的**全部**
    // 行為（三份既有文件都不填），所以底下那一段一個字都沒動。
    // ⛔ 不「自動偵測」：一份寫錯 `abilityId` 的文件會安靜地跑去重置某條觸發器，
    // 而作者以為自己在縮短技能冷卻。
    if (e.target === "hookInternalCooldown") {
      applyToHookIcd(world, bodies, e, ctx.origin);
      return;
    }

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
