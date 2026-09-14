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
 *
 * ── ⛔ 更正 73dd2417b（2026-09-15，GH#1196 審查）：「預警圈歸零」**沒有被驗到** ─────────────
 * 那一版的 ③ 斷言「比賽結束後再空跑 3 秒，`round11Bombardment` 事件數 = 0」—— ⛔ 結構上永遠綠：
 * `tickRound11Events` / `tickRound11Bombardment` 只在 `MatchController.tick()` 的 `case "combat"`
 * 裡被呼叫，比賽結束後**沒有任何一條路**發得出那個事件，拿掉任何清理它都不會紅（形態④）。
 * 而「正在飛的那一發」`round11Bombard`（private）⛔ 比賽結束時**沒有人清它**（只在進第十一回合、
 * 或那一發結算完時設回 null）；它唯一的讀者同樣只在 `case "combat"` 跑、客戶端今天也不讀那則事件
 * ⇒ 留著它沒有玩家看得到的後果（⚠️ Claude 讀碼的推論，⛔ 沒有實機驗證）。
 * ⇒ 那條斷言已刪除，⛔ 不換成一條同樣空的；「預警圈歸零」在本檔**未驗**。
 * 另：出貨波次表每 20 秒抽一次、轟炸權重 5/100，本檔 140 秒就收回合（7 抽）⇒ 回合裡不一定發過轟炸。
 *
 * ── 排程 ──────────────────────────────────────────────────────────────────────
 * `round11EventsFired`（private）⛔ 比賽結束時**不歸零**（只在進第十一回合時歸零），它的唯一讀者
 * `tickRound11Events` 只在 `case "combat"` 跑 ⇒ 結束後是死值，⛔ 斷言它 = 0 會是一條錯的斷言。
 * ⭐ 排程真正的狀態是**波次時鐘** `world.mobTicks`：`round11EventsDue(mobTicks / TICK_HZ)` 決定應發幾個，
 * `endCombatMobs` 把它設回 -1 ⇒ 應發數 0 ⇒ 斷言「回合中發過（非空）」＋「結束後時鐘 < 0」。
 * harness 的 `eventsFiredAtLastCombatTick` 用出貨的 `round11EventsDue` 從時鐘推：每一個 combat tick
 * 結束時它等於 `round11EventsFired`（`world.step` 先 `mobTicks++`，同一 tick 的 `tickRound11Events`
 * 再用 `while` 把 fired 補到 due）。
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

  it("⭐⭐ 回合結束清場：結束前場上是滿的，結束後殭屍／排程歸零（⚠️ 預警圈未驗，見檔頭）", () => {
    expect(run.after.phase, "⭐ 回合真的走出貨出口結束到比賽結束").toMatch(/matchEnd$/);
    expect(run.mobsAtLastCombatTick, "⛔ 結束前場上不是滿的 ⇒ 清場沒被問過").toBeGreaterThanOrEqual(run.configuredCap);
    expect(run.after.mobTable, "⛔ 比賽結束後殭屍還在").toBe(0);
    expect(run.after.mobRulesArmed, "⛔ 生怪規則表還武裝著").toBe(false);
    expect(run.after.mobZones, "⛔ 還有生怪區").toBe(0);
    expect(run.after.bossSpawnsThisRound, "⛔ 王的每回合配額沒歸零").toBe(0);
    expect(run.after.entities, "⛔ 實體數沒有回到進場時的基準線以下").toBeLessThanOrEqual(run.entitiesAtEntry);
    // ⭐ 排程：非空前提（回合中真的發過波次事件）＋ 結束後波次時鐘解除（⇒ `round11EventsDue` 回 0）。
    expect(run.eventsFiredAtLastCombatTick, "⛔ 回合中一個波次事件都沒發 ⇒ 排程沒被問過").toBeGreaterThan(0);
    expect(run.after.mobTicks, "⛔ 比賽結束後波次時鐘還在走（排程沒解除）").toBeLessThan(0);
  });
});
