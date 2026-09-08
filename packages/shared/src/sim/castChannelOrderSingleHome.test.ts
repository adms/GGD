/**
 * ⭐ GH#1088 —— 頻道優先序**只有一個住處**的薄守衛（體驗層：⛔ 不做突變輪）。
 *
 * ⚠️ 在此之前 `castabilitySweep.test.ts` 產出 `docs/_castability-128.md` 時有**兩段
 * 手寫散文**在複述判定順序，而順序的真住處是 `classifyCastOutcome` 的 if-chain。
 * 2026-09-06 量到那兩段同時漏了 **taunt／gold／resourceSwap／championForm／summon**
 * 五格 ⇒ 讀 docs 的人（含下一輪的我）會把「它們不在順序裡」讀成「它們不算頻道」。
 * ⭐ 那是第三守則的形狀：**一份被散文守著的清單活過了保存期限，而沒有任何東西紅。**
 *
 * ⇒ 順序現在住 {@link CAST_CHANNEL_ORDER}，判定與 docs **都讀它**。這一支問兩件事：
 *  ① 判定真的**照那張表的順序**跑（⛔ 不是自己還留著一串 if）；
 *  ② docs 那一句真的是**從表推導**的（⛔ 不是第二份手抄）。
 */
import { describe, it, expect } from "vitest";
import {
  CAST_CHANNEL_ORDER,
  castChannelOrderProse,
  classifyCastOutcome,
  COSMETIC_ONLY_EVENT,
  type CastObservation,
} from "./castabilityVerdict";

/**
 * 一次「**每一個**頻道都發生了」的觀測 —— 這是夾具，⛔ 不是順序的第二個住處：
 * 它一格順序都沒有寫，只把每一根指針都撥動一次。
 */
const EVERYTHING: CastObservation = {
  events: ["damage", "projectileSpawn", "heal", "manaRestore", "championForm", "resourceSwap", COSMETIC_ONLY_EVENT],
  before: { shields: 0, statuses: 0, buffs: 0, projectiles: 0, taunts: 0, gold: 0, summons: 0 },
  after: { shields: 1, statuses: 1, buffs: 1, projectiles: 1, taunts: 1, gold: 1, summons: 1 },
  moved: true,
  effectsAuthored: 1,
};

describe("castability 頻道優先序：判定與 docs 讀同一張表", () => {
  it("channel-order-has-one-home", () => {
    // ⓪ 前提：這份夾具真的撥動了**每一根**指針。一條在最大觀測下都不成立的規則
    //    是一格量不到的頻道（第一·五守則的鏡像），⇒ 它自己就該紅。
    for (const r of CAST_CHANNEL_ORDER) {
      expect(r.fired(EVERYTHING), `頻道「${r.channel}」在「全部都發生」的觀測下仍不成立`).toBe(
        true,
      );
    }

    // ① ⭐ 承重：全部都發生時，記在**表上第一格**。判定若還留著自己的 if-chain，
    //    把表重排就不會有任何影響 —— 而這一條會紅。
    expect(
      classifyCastOutcome(EVERYTHING).channel,
      "判定沒有照 CAST_CHANNEL_ORDER 的順序挑頻道",
    ).toBe(CAST_CHANNEL_ORDER[0]!.channel);

    // ② docs 那一句是從表推導的：逐字等於表上的中文欄名串起來。
    expect(castChannelOrderProse()).toBe(CAST_CHANNEL_ORDER.map((r) => r.zh).join("＞"));

    // ③ ⭐ 這張票的實際內容：那五格**看得見**了（⛔ 不是「表上有」，是「印出來的那一句裡有」）。
    for (const ch of ["taunt", "gold", "summon", "championForm", "resourceSwap"]) {
      const zh = CAST_CHANNEL_ORDER.find((r) => r.channel === ch)?.zh;
      expect(zh, `頻道「${ch}」不在 CAST_CHANNEL_ORDER 裡`).toBeDefined();
      expect(castChannelOrderProse(), `docs 的順序散文漏掉頻道「${ch}」`).toContain(zh!);
    }
  });
});
