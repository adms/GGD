/**
 * ⭐⭐ GH#890 —— **每秒額外獲得經驗值**。
 *
 * ── ⭐ 它取代的是一件「結構上不可能發生」的事 ──────────────────────────
 * 92-002 最終戈壁的卡面寫著「每秒可以額外**奪得 75 原木**」——
 * ⭐ 而這個遊戲**沒有原木**（46 個 effect kind 裡零個）。
 * ⇒ owner 2026-09-01：「⋯**原木則改為經驗值**，這樣就可以很快實作驗收關票」。
 *
 * ⚠️ ⭐ 而 `economy/progression.ts::grantXp()` **早就存在** ——
 * ⛔ 這個檔沒有發明任何東西，它只是把既有的機制接到 effect 那一層。
 */
import type { EffectKindSpec } from "./effectKind";
import { grantXp as grantXpTo } from "../economy/progression";

export const grantXpEffect: EffectKindSpec<"grantXp"> = {
  apply(e, ctx) {
    const amount = Math.round(e.flat);
    // ⛔ 0 或負的一律不發 —— ⭐ 一個發 0 經驗的效果與不存在沒有差別，
    //   而它會在事件流上留下一筆看起來有發生過的紀錄。
    if (amount <= 0) return;
    if ((e.to ?? "self") === "target") {
      for (const t of ctx.targets) grantXpTo(ctx.world, t, amount);
      return;
    }
    grantXpTo(ctx.world, ctx.caster, amount);
  },
};
