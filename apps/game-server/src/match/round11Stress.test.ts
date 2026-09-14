/**
 * 🧟 第十一回合**滿載清理**（GH#1196 H⑤）—— 靈魂層，一條承重，兩個方向。
 *
 * ⭐ 只驗**機制**（上限夾得住 · 屍體被收走 · 回合結束清場）；
 * ⛔ tick p95/p99 **不寫在這裡**（負載下會假紅，GH#1014）—— 住 `scripts/round11-stress.ts`。
 *
 * ⭐ 設定是**出貨的** `arena-rules.json`（上限、漸進、波次表原樣），負載是 harness 的「飽和」剖面：
 * 每 tick 用出貨的 `spawnMob` 補到那一刻的上限 ⇒ ⭐ **每一個出貨的生怪門都在「已經滿了」的情況下被問**。
 * ⚠️ 自然負載實測峰值只有 59 隻（離 500 很遠）⇒ 在自然負載下寫「⛔ 不超過上限」是**永遠綠的斷言**（形態④）。
 *
 * ⭐ 回合在「上限到頂之後」由**出貨的出口**收掉：把英雄全部打死 ⇒ 換邊 ⇒ 活著的英雄歸零 ⇒ 結束
 * （`round11End.test.ts` 第二條釘住的那一條路）。⛔ 不縮 `durationSec` —— 縮了就不是出貨的回合。
 *
 * 突變紀錄寫在 commit 訊息。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { runRound11Stress, shippedArenaRules, type Round11StressRun } from "./round11StressHarness";

// ⭐ 從出貨設定推導：漸進放滿的那一刻之後，再給一個波次間隔（出貨的生怪門至少被問一次）。
const SHIPPED = shippedArenaRules().round11;
const WIPE_AT_SEC = SHIPPED.spawnRampSec + SHIPPED.waveTable.eventIntervalSec;

let run: Round11StressRun;
beforeAll(() => {
  run = runRound11Stress({ saturate: true, wipeAtSec: WIPE_AT_SEC });
});

describe("第十一回合滿載清理（GH#1196 H⑤）", () => {
  it("⭐ 上限：真的到頂（⛔ 否則下面那條是空的），而一般＋特殊⛔ 從不超過那一刻的上限", () => {
    expect(SHIPPED.maxAliveZombies, "出貨上限要 > 0，否則這一支沒有被測物").toBeGreaterThan(0);
    expect(run.peakAlive, "⛔ 沒有到出貨上限 ⇒ 「不超過」是空斷言").toBeGreaterThanOrEqual(run.configuredCap);
    expect(run.capBreaches, "⛔ 某一扇生怪門在「已經滿了」時還在生").toBe(0);
  });

  it("⭐ 死亡回收：真的有殭屍死，⛔ 而屍體沒有留在任何一張表裡", () => {
    expect(run.mobDeaths, "⛔ 一隻都沒死 ⇒ 回收沒被問過").toBeGreaterThan(0);
    expect(run.corpsesLeaked, "⛔ 死掉的殭屍在那一 tick 結束後還在 mob/transform/health").toBe(0);
    expect(run.deadRowsInMobTable, "⛔ world.mob 裡躺著死的列").toBe(0);
  });

  it("⭐⭐ 回合結束清場：結束前場上是滿的，結束後殭屍／排程／預警圈歸零", () => {
    expect(run.after.phase, "⭐ 回合真的走出貨出口結束到比賽結束").toMatch(/matchEnd$/);
    expect(run.mobsAtLastCombatTick, "⛔ 結束前場上不是滿的 ⇒ 清場沒被問過").toBeGreaterThanOrEqual(run.configuredCap);
    expect(run.after.mobTable, "⛔ 比賽結束後殭屍還在").toBe(0);
    expect(run.after.mobRulesArmed, "⛔ 生怪規則表還武裝著").toBe(false);
    expect(run.after.mobZones, "⛔ 還有生怪區").toBe(0);
    expect(run.after.bossSpawnsThisRound, "⛔ 王的每回合配額沒歸零").toBe(0);
    expect(run.after.entities, "⛔ 實體數沒有回到進場時的基準線以下").toBeLessThanOrEqual(run.entitiesAtEntry);
    expect(run.after.bombardmentsAfterEnd, "⛔ 比賽結束後還在發預警圈").toBe(0);
  });
});
