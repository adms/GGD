/**
 * `shield` — a temporary absorb pool on every resolved target.
 *
 * Moved out of the effectRunner switch by GH#289; the absorb body is unchanged.
 * GH#289 lane P6 then implemented the `absorbs` damage-type FILTER that the seam
 * had opened as a schema field — see `combat/damage.ts` for where in the
 * pipeline a pool eats (POST-mitigation, unchanged) and in what order two pools
 * on one target are spent (narrow before broad).
 */
import type { EffectKindSpec } from "./effectKind";
import { resolveScaling } from "./effect";
import { addShield } from "../combat/damage";
import { casterAttrs, casterStats } from "./effectCommon";

export const shieldEffect: EffectKindSpec<"shield"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // global combat-env shield-strength factor
    const amount =
      resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx)) * world.combatEnv.shield;
    for (const target of ctx.targets) {
      // 護盾類型過濾 (owner 2026-07-30:「護盾的確有分吸收所有傷害跟吸收 AP 傷害
      // only」). The author's choice rides straight through to the pool; absent
      // (and the explicit `"all"`) both mean 「吸收所有傷害」, which is exactly
      // the pre-filter behaviour — see addShield, which normalises the two.
      // ⭐ S1（GH#299）—— 不疊加政策。`stackKey` 缺席時 `stack` 是 undefined，
      // 而 `addShield` 那一條路徑逐字是 2026-08-09 之前的行為。
      addShield(
        world,
        target,
        amount,
        e.duration,
        ctx.origin,
        e.absorbs,
        e.stackKey !== undefined
          ? { stackKey: e.stackKey, onExisting: e.onExisting ?? "replace" }
          : undefined,
      );
      // 【護盾產生時】(GH#300) —— 一個**時刻**，交給 `systems/WorldHookSystem.ts`
      // 那張表轉成 `onShieldGained`。這裡只 emit，不 `fireHooks`：直接呼叫會關上
      // effectRegistry.ts 檔頭指名的那個 import 環（shield → hooks → effectRunner
      // → effectRegistry → shield），而它的咬痕不是編譯錯誤，是某個打包順序下整張
      // 效果表變成 `undefined`。理由與 `applyStatus.ts` 的 `stunApplied` 逐字相同。
      //
      // ⭐ 一次 `addShield` = 一則事件，而 `addShield` 是全 repo **唯一**的護盾
      // 生成點（`sim/index.ts` 只是 re-export）。所以口徑是「新出現一片盾」，
      // 不是「這個人身上的盾變多了」：
      //   · 一發 AoE 給三個人 → 三則（三張卡片都該響，三個人真的各多了一片）；
      //   · 身上已經有兩片再拿第三片 → 仍然一則（他只「產生」了一片）。
      // 反過來的口徑（每個目標的池子總數變化發一次）在單體技上跟這個一模一樣，
      // 只在 AoE 上分岔 —— 那正是失敗形態④（壞的實作跟對的長得一樣）。
      world.emit("shieldGained", { target, source: ctx.caster, amount, origin: ctx.origin });
    }
  },
};
