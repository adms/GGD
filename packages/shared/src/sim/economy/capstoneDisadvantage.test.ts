/**
 * ⭐⭐ **頂點加成的劣勢加權**（GH#897）。
 *
 * owner 2026-09-01（逐字）：
 * > 「隨機能力20次後的額外%加成，根據玩家目前**排名&積分**來做權重調整，
 * >  也就是**越排後的玩家額外%加成越高**，讓劣勢方有機會翻盤」
 *
 * ⭐⭐ **而這張票不需要一套新的劣勢公式** —— 出貨早就有一支
 * `disadvantageScore()`（`economy/weaponTiers.ts`，三項加權：回合差 · 裝備價值差 · 近況），
 * ⭐ 而 `MatchController` **每回合已經在算它**（武器階級與聖杯共用）。
 * ⇒ ⭐ 這一輪做的是「**第三個消費端**」，⛔ 不是第二套公式（第〇·四守則）。
 *
 * ⚠️⚠️ ⭐ **最重要的性質是 determinism，⛔ 不是那個倍率**：
 * 加權**乘在抽完之後**，⛔ 不是乘在 `world.rng.int()` 之前
 * ⇒ ⭐ 同一個種子抽出**同一格**，每一份既有錄影逐位元重播得出來。
 * ⛔ 反過來寫（改抽籤範圍）會讓所有 replay 當場對不上，而**測試多半還是綠的**。
 *
 * ⭐⭐ **出貨 `capstoneDisadvantageFactor` 是 `0`** ⇒ 這條路今天逐位元 no-op。
 * ⚠️ 它改變每一場比賽的結果，⛔ 而 owner 只說了「要有」，沒說要多強
 * ⇒ 那一格是**他的**（第一守則：可調 ≠ 我可以轉）。
 *
 * ── 突變紀錄（實跑，改壞 → 紅 → 還原）────────────────────────────────────
 * M1 `statPath.ts` 的 `const pct = d > 0 ? rolled * (1 + factor * d) : rolled;`
 *    改回 `const pct = rolled;` → 🔴 ②「劣勢方沒有拿到更高的加成」
 * M2 把加權移到 `world.rng.int(CAPSTONE_STEPS)` 之前（改抽籤範圍）
 *    → 🔴 ③「同一個種子抽出不同的格 ⇒ 每一份錄影都對不上」
 */
import { describe, expect, it, beforeAll } from "vitest";
import { SimWorld } from "../SimWorld";
import { SKELETON_ARENA } from "../world/ArenaDef";
import { registerSkeletonContent, SELA } from "../content/skeleton";
import { spawnChampion } from "../spawnChampion";
import { grantCapstone } from "./statPath";
import { DEFAULT_ECONOMY } from "./economyRules";
import { asSeatId, asTeamId, type ChampionId, type EntityId } from "../../ids";

beforeAll(() => registerSkeletonContent());

const C = SKELETON_ARENA.zones[0]!.center;

/** 造一個世界，`d` 是這名英雄的劣勢度、`factor` 是那格旋鈕。 */
function roll(d: number, factor: number, seed = 11): number {
  const world = new SimWorld(SKELETON_ARENA, seed);
  const hero: EntityId = spawnChampion(world, {
    zone: 0,
    championId: SELA.id as ChampionId,
    seatId: asSeatId(0),
    teamId: asTeamId(0),
    pos: { x: C.x, z: C.z },
  });
  world.seatDisadvantage = new Map([[hero, d]]);
  // ⭐ 直接改 world 上的經濟規則（⛔ 不改出貨 config —— 那會影響別的測試）。
  (world as unknown as { economy?: unknown }).economy = {
    ...DEFAULT_ECONOMY,
    capstoneDisadvantageFactor: factor,
  };
  return grantCapstone(world, hero);
}

describe("頂點加成的劣勢加權（GH#897）", () => {
  it("★★ ⭐⭐ 出貨值是 **0 ＝ 關**（⛔ 它改變每一場比賽的結果）", () => {
    expect(
      DEFAULT_ECONOMY.capstoneDisadvantageFactor,
      "⛔⛔ 這一格開著出貨 —— owner 只說了「要有」，⛔ 沒說要多強 ⇒ 那一格是**他的**",
    ).toBe(0);
  });

  it("★★ ⭐ 關著時：劣勢方與領先方拿到**完全一樣**的加成", () => {
    const lead = roll(0, 0);
    const behind = roll(1, 0);
    expect(lead, "⛔ 量尺壞了：抽出來是 0").toBeGreaterThan(0);
    expect(
      behind,
      "⛔ 旋鈕是 0 而劣勢方仍然拿到不一樣的值 ⇒ 那是一次沒有人要求的平衡改動",
    ).toBe(lead);
  });

  it("★★ ⭐⭐ 打開之後：**越劣勢拿越高**（owner 逐字的那句話）", () => {
    const lead = roll(0, 1);
    const mid = roll(0.5, 1);
    const behind = roll(1, 1);
    expect(
      behind,
      `⛔⛔ 劣勢方沒有拿到更高的加成（D=0 給 ${lead}、D=1 給 ${behind}）\n` +
        "  ⭐ owner：「越排後的玩家額外%加成越高，讓劣勢方有機會翻盤」",
    ).toBeGreaterThan(lead);
    expect(mid, "⛔ 中間那一段沒有單調 ⇒ 加權曲線壞了").toBeGreaterThan(lead);
    expect(behind, "⛔ 最劣勢沒有比中間高").toBeGreaterThan(mid);
  });

  it("★★ ⭐⭐ **抽籤本身逐位元不變**（⛔ 否則每一份錄影都對不上）", () => {
    // ⭐ 同一個種子：關著與開著抽到的**基礎格**必須相同 ——
    //   開著時只是把那一格的值乘上去，⛔ 不是抽一個不同的格。
    for (const seed of [11, 77, 4242]) {
      const base = roll(0, 0, seed);
      const gated = roll(1, 1, seed);
      expect(
        gated / base,
        `⛔⛔ 種子 ${seed}：加權之後的值不是基礎值的整數倍 ⇒\n` +
          "  ⭐ 那代表加權跑到 `world.rng.int()` **之前**去了（改了抽籤範圍）\n" +
          "  ⇒ 同一個種子抽出不同的格 ⇒ **每一份既有錄影都對不上**。",
      ).toBeCloseTo(2, 6);
    }
  });
});
