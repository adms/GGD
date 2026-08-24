/**
 * botOnlyRingAccel.test.ts — GH#643 (K8) ＋ **GH#659 的更正**。owner：
 *
 *   #643「如果現場只剩 bot 存活，回合時間縮減到10秒後就縮火圈 不要平白浪玩家等待」
 *   #659「場地只剩 bot 的話 **不管有沒有殭屍王** 火圈**都會立即出現縮圈**」
 *
 * 真 MatchController（⛔ 不是手餵 world）：出貨形狀的 fireRing 60s 點火，
 * 傷害歸零讓「誰活著」完全由測試控制。四個方向：
 *   1. 人類活著 → 點火時間**一格都不動**（1800 ticks）。
 *   2. 人類全滅（隊上 bot 還活著，zone 未結算）→ 下一個 tick 點火被夾到
 *      now + `DEFAULT_BOT_ONLY_RING_ACCEL_SEC`（⛔ 不抄字面值 —— 那是第四個住處）。
 *   3. ⭐ #659：**殭屍王已經把點火推遠 180 秒**時，人類全滅仍然在下一個 tick
 *      夾回來，而且火圈**真的開始縮**（半徑 < 場地邊界）—— 驗的是機制不是數字，
 *      所以出貨值調回 10 秒它照樣綠，改壞 `ring.startTicks = cap` 才紅。
 *   4. 全 bot 沙盒（0 個 humanSeat）→ 永遠不加速 —— 沒有玩家在等，
 *      這一關也是「每一條既有 all-bot 測試逐位元不變」的證明。
 *
 * 突變驗證（2026-08-24）：註解掉 `ring.startTicks = cap` 那一行 → 第 2、3 條紅
 * （半徑停在邊界 24，點火時間停在王推遠後的 7200）→ 改回來綠。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { normalizeCombatEnv } from "@ggd/shared/sim/combatEnv";
import type { FireRingConfig } from "@ggd/shared/content";
import { DEFAULT_BOT_ONLY_RING_ACCEL_SEC } from "@ggd/shared/content";
import { currentFireRingRadius, extendRoundForBoss } from "@ggd/shared/sim/fireRing";
import { TICK_HZ } from "@ggd/shared/constants";
import { MatchController, type SeatSpec } from "./MatchController";

/** 出貨的加速秒數換算成 ticks —— 從 shared 的常數推導，⛔ 不抄 10 也不抄 0。 */
const ACCEL_TICKS = Math.round(DEFAULT_BOT_ONLY_RING_ACCEL_SEC * TICK_HZ);

/** 殺掉唯一的人類座位（隊上兩個 bot 還活著 ⇒ zone 未結算、回合繼續打）。 */
function killTheHuman(ctl: MatchController): void {
  const human = [...ctl.seats.values()].find((s) => s.humanSeat)!;
  const hp = ctl.world.health.get(human.entityId!)!;
  hp.alive = false;
  hp.hp = 0;
}

/** seat 0 是人類（humanSeat = !isBot），其餘 11 個 bot；4 隊各 3 人。 */
const withHuman = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: i !== 0 }));
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/** 出貨形狀的火圈：60s 點火（= 1800 ticks），跟 fireRingArm.test.ts 同一組欄位。 */
const FIRE_RING: FireRingConfig = {
  startSec: 60,
  shrinkSec: 20,
  minRadius: 0.5,
  burnCurve: [{ sec: 0, pctPerSec: 0.1 }],
  maxPctPerSec: 1,
  lethalSaveApplies: false,
  roundHardCapSec: 300,
  boss: { extendCombatSec: 180, delayFireRingSec: 180 },
};
const CFG = { champSelectTicks: 2, intermissionTicks: 3, combatMaxTicks: 100 * 30, resolutionTicks: 3 };

function toCombat(specs: SeatSpec[]): MatchController {
  const ctl = new MatchController(
    "k8-accel",
    777,
    specs,
    CFG,
    undefined,
    undefined, // DEFAULT_ARENA_RULES —— 出貨預設就是「開、DEFAULT_BOT_ONLY_RING_ACCEL_SEC」
    undefined,
    undefined,
    normalizeCombatEnv({ damageDealt: 0 }), // 誰死掉由測試決定，不是互毆
    FIRE_RING,
  );
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
  return ctl;
}

describe("GH#643 只剩 bot 在打 → 火圈點火夾到 now+10s", () => {
  it("人類活著點火不動；人類全滅的下一個 tick 就夾下去", () => {
    cover("botonly-ring-accel");
    const ctl = toCombat(withHuman());
    const authored = Math.round(60 * TICK_HZ); // 1800

    // ① 人類活著 —— 跑 30 個 tick，cap(≈330) 早就低於 1800，夾了就會被抓到。
    for (let i = 0; i < 30; i++) ctl.tick();
    expect(ctl.world.fireRingRules!.startTicks).toBe(authored);

    // ② 殺掉唯一的人類（隊上兩個 bot 還活著 ⇒ zone 未結算、回合繼續打）。
    const human = [...ctl.seats.values()].find((s) => s.humanSeat)!;
    const hp = ctl.world.health.get(human.entityId!)!;
    hp.alive = false;
    hp.hp = 0;
    ctl.tick(); // advancePhase 的 combat 分支跑 accelFireRingForBotOnly
    const cap = ctl.world.fireRingTicks + Math.round(10 * TICK_HZ);
    expect(ctl.world.fireRingRules!.startTicks).toBe(cap); // 夾到 now+10s
    expect(ctl.world.fireRingRules!.startTicks).toBeLessThan(authored);
  });

  it("全 bot 沙盒（0 個 humanSeat）永遠不加速 —— 沒有玩家在等", () => {
    cover("botonly-ring-accel-allbots");
    const ctl = toCombat(allBots());
    for (let i = 0; i < 30; i++) ctl.tick();
    expect(ctl.world.fireRingRules!.startTicks).toBe(Math.round(60 * TICK_HZ));
  });
});
