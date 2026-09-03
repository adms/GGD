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
import { scalingOracle } from "../content/condition";

/**
 * ⭐⭐ **`shieldGained` 的酬載型別 —— 住在發射站旁邊**（GH#940）。
 *
 * ⛔⛔ 為什麼要有這個介面：`SimWorld.emit(type: string, data: Record<string, unknown>)`
 * 與 `EventMessage.data` **都沒有型別** ⇒ 消費端想讀任何欄位就非 `as` 不可，
 * ⭐ 而每一個 `as` 都是一個**靜默的洞**（CLAUDE.md 失敗形態⑧：
 * 2026-08-23 一天之內中五次，四種守衛全部結構性失明）。
 *
 * ⇒ ⭐ 兩邊 import 同一個型別 ⇒ 欄位改名或消失是 **tsc 的紅**，
 * ⛔ 不是「上線之後沒有人畫得出來」。
 *
 * ⚠️ 2026-09-02 量到全 repo **118 個事件名 · 159 個 emit 呼叫點，
 * 而 payload 介面只有 4 個** —— 這是第 5 個。
 */
export interface ShieldGainedEvent {
  /** 拿到盾的那一位。⭐ 客戶端就是拿它去查座標的。 */
  readonly target: number;
  /** 誰給的（施法者）—— 可能與 `target` 同一人（自我護盾）。 */
  readonly source: number;
  /** 這一片盾的吸收量。⚠️ 池子的**總量**在快照的 `EntityState.shield` 裡，
   *  這裡是「剛剛多了多少」那個 beat 的量。 */
  readonly amount: number;
  /**
   * ⭐ 封包的 **provenance 標籤**（`ctx.origin`，例：`"basic"`／技能 id）——
   * ⛔ **不是座標**。
   *
   * ⚠️ 2026-09-02：寫這個介面的第一版把它宣告成 `{x,z}`，
   * ⭐ 而 **tsc 當場紅了** —— `effect.ts:68` 逐字是 `readonly origin: string`。
   * ⇒ 這正是這個介面存在的理由：在此之前消費端只能寫 `ev.data.origin as {x,z}`，
   * ⭐ 而那個 `as` 會**編譯得過、上線後靜默壞掉**（失敗形態⑧）。
   *
   * ⇒ ⭐ 客戶端要座標請走 `posFromEvent(ev, ev.data.target)`，⛔ 不是讀這一格。
   */
  readonly origin: string;
}

export const shieldEffect: EffectKindSpec<"shield"> = {
  apply(e, ctx) {
    const { world } = ctx;
    const stats = casterStats(ctx);
    // global combat-env shield-strength factor
    const amount =
      resolveScaling(stats, e.amount, ctx.rank, casterAttrs(ctx), scalingOracle(world, ctx.caster, ctx.targets[0])) *
      world.combatEnv.shield;
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
        // ⭐ G2（GH#354）—— **施法者**，不是 target：「我給出的護盾 ×1.25」
        // 放大的是給的人的能力，⛔ 不是收的人的。
        ctx.caster,
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
      // ⭐ 型別化的送出 —— `satisfies` 讓欄位漏掉或打錯字變成 **tsc 的紅**。
      const payload = {
        target,
        source: ctx.caster,
        amount,
        origin: ctx.origin,
      } satisfies ShieldGainedEvent;
      world.emit("shieldGained", payload);
    }
  },
};
