/**
 * `weightedBranch` —— **一次 RNG 抽一個加權分支**。
 *
 * 擋住 89-002 俄羅斯輪盤（1/6 對方死 · 1/6 自己死 · 4/6 恐懼），以及任何一支
 * 「有 X% 機率變成 A，否則變成 B」的技能。
 *
 * ── ⭐ 為什麼是**一次** draw，不是每個分支各抽一次 ───────────────────────
 * 計畫 §13 的錄影決定性要求是硬的：同一個 seed 的落點／目標／事件／digest 必須
 * 逐位元相同。每個分支各抽一次的寫法（`if (rng.chance(p1)) … else if
 * (rng.chance(p2)) …`）**消耗的 draw 次數取決於抽到第幾個分支**，於是
 * 「這一發之後 RNG 走到哪」變成一個內容作者控制不了的量 —— 之後場上每一件跟
 * 隨機有關的事（暴擊、閃避、掉落、AI 選擇）都跟著位移。錄影對不上，
 * 而且症狀在幾百 tick 之後才出現。
 *
 * ⛔ 所以 draw 次數是**一**，而且它不是一個欄位：它不是設計偏好，是決定性預算。
 * 分支的權重才是設計偏好（那些**是**欄位）。
 *
 * ── 選法 ─────────────────────────────────────────────────────────────────
 * 一次 `ctx.rng.next()` → `roll = r × 總權重` → 由前往後累加，第一個讓
 * `roll < 累加` 的分支中選。權重 0 的分支永遠選不到（「先關掉但不刪掉」）。
 * 總權重為 0 的文件在**載入時**就被擋（schema 的 `refineWeightedBranch`），
 * 所以這裡不需要一條「除以零」的防線。
 *
 * ── purity ────────────────────────────────────────────────────────────────
 * 唯一的隨機來源是 `ctx.rng`（`Math.random` 在 sim/** 被禁）。無時鐘、無三角。
 */
import type { EffectKindSpec } from "./effectKind";
import { runEffects } from "./effectRunner";
import { shapeTargets } from "./shapeTargets";

export const weightedBranchEffect: EffectKindSpec<"weightedBranch"> = {
  apply(e, ctx) {
    if (e.branches.length === 0) return;
    // ⭐ GH#1020 —— `weightFrom`：權重 = weight + coeff × 施法者三圍，夾在 0 以上。
    //    讀 `liveAttribute`（與 `chanceFrom` 同一支）；非英雄的身體讀不到 ⇒ 只剩靜態權重。
    //    ⚠️ 只改「每一支多重」，⛔ 不改抽的次數與位置 —— 承重線仍然是下面那一次 rng。
    const weightOf = (b: (typeof e.branches)[number]): number => {
      const from = b.weightFrom;
      if (from === undefined) return Math.max(0, b.weight);
      const live = liveAttribute(ctx.world, ctx.caster, from.attr, from.basis ?? "total");
      return Math.max(0, b.weight + (live ?? 0) * from.coeff);
    };
    let total = 0;
    for (const b of e.branches) total += weightOf(b);
    if (!(total > 0)) return;

    // ⭐ 這一行是這個 kind 的**承重線**：整段執行只走一次 rng。
    const roll = ctx.rng.next() * total;

    let acc = 0;
    let chosen = e.branches[e.branches.length - 1]!;
    for (const b of e.branches) {
      acc += weightOf(b);
      if (roll < acc) {
        chosen = b;
        break;
      }
    }

    // 中選分支的 payload 在**同一個 ctx** 上執行，只是把目標換成 `shape` 解出來
    // 的那一組 —— 分支不重新發明目標選擇（與 dispel/shieldBreak/devour 同一句話）。
    const targets = shapeTargets(e, ctx);
    runEffects(chosen.effects, { ...ctx, targets });
  },
  /**
   * 延遲 payload 的 cast-time 烘焙要**穿透**分支，否則一個
   * `leap.onLand: [weightedBranch{…damage}]` 裡的 `comboBonus` 會在落地那一刻
   * 才解算 —— 正是 `effectRunner.ts` 檔頭那個 #247 缺陷。
   * ⚠️ 烘焙**不抽 rng**：它只改寫 payload 的數字，選哪一支仍然發生在 `apply`。
   */
  bake(e, ctx, bakeList) {
    return {
      ...e,
      branches: e.branches.map((b) => ({ ...b, effects: bakeList(b.effects, ctx) })),
    };
  },
};
