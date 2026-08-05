/**
 * `shieldBreak` —— 【破盾】（D1，#278）。
 *
 * 把目標的護盾池打掉，走 `sim/clearPools.ts` 的那一支唯一函式。
 *
 * ── ⚠️ 為什麼它是一個獨立的 kind，而不是「dispel 勾一個 pool」 ────────────
 * 因為 `dispel` 已經做得到（`pools: { shields: true }`），所以這個問題是真的
 * 要回答的，而答案是**止血閥**：
 *
 *   · `dispelRules.enabled = false` 的意思是「把【淨化】那一族關掉」。
 *     破盾是**傷害向**的機制，不該跟著淨化一起被關掉 —— 操作者關淨化的那天
 *     不會預期順手廢掉一件破盾道具，而畫面上看不出差別（失敗形態 ②）。
 *   · 卡片與編輯器上的可讀性：設計師找【破盾】不該需要先知道
 *     「它是淨化，只是勾了一格池子」。
 *
 * 所以兩個 kind、一支 `clearPools`、一支 `shapeTargets`。分歧在結構上不可能。
 *
 * ── ⚠️ 護盾**不在** `Stat` enum 裡 ───────────────────────────────────────
 * 16 條逐一對過：它是 `HealthComp.shields` 陣列，所以 `ModOp.Override` 那條路
 * 對它不存在。這也是為什麼破盾不能寫成一條 modifier。
 *
 * ── ⛔ 它只碰護盾 ────────────────────────────────────────────────────────
 * `st.effects` 必須原封不動 —— 一發破盾把對手的增益也拔了，那是淨化不是破盾。
 * 守衛 `shieldBreak.test.ts` 兩個方向都讀。
 */
import type { EffectKindSpec } from "./effectKind";
import { clearPools } from "../clearPools";
import { shapeTargets } from "./shapeTargets";

export const shieldBreakEffect: EffectKindSpec<"shieldBreak"> = {
  apply(e, ctx) {
    const { world } = ctx;
    // ⛔ `side` 省略時**打敵人** —— 這一行是 2026-08-05 稽核抓到的真缺陷的修正。
    // `shapeTargets` 的 `else` 分支走友方（那對【淨化】是對的，淨化本來就是給
    // 自己人解狀態），而 schema、TS union、編輯器預覽**三份文件都寫著**
    // 「破盾的預設是打敵人」。於是一張沒寫 `side` 的破盾卡會去破**自己隊友的盾**，
    // 而卡片上寫著敵方 —— 三份文件一致地說謊，程式碼安靜地做相反的事。
    //
    // ⚠️ 修的是這裡而不是 `shapeTargets`：兩個 kind 的預設**本來就該不一樣**，
    // 所以每一個 kind 自己解析自己的預設，共用的那一支只管幾何。
    for (const id of shapeTargets({ ...e, side: e.side ?? "enemies" }, ctx)) {
      clearPools(world, id, {
        // ⛔ 只有這一池。寫死是刻意的 —— 這個 kind 的**定義**就是「打掉護盾」，
        // 讓它可以順便清別的池子等於重新發明 `dispel`，而那已經存在了。
        pools: { shields: true },
        // 護盾沒有極性也沒有 `dispellable`（見 `clearPools` 那兩段註解）——
        // 一片盾就是一片盾，所以這裡不看那兩道閘。
        polarity: "any",
        requireDispellable: false,
        // 省略 `count` = 整池打掉。要「只打掉一層」的道具自己寫 `count`。
        ...(e.count !== undefined ? { count: e.count } : {}),
        order: e.order ?? "newest",
      });
    }
  },
};
