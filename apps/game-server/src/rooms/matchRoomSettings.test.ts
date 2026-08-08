/**
 * 開房四格 (#288) 的**接縫**：`MatchRoomOptions` → 這一場真的跑的東西。
 *
 * ⚠️ 四條線各自的守衛都停在自己那一半：client 驗 payload、Go 驗 round-trip、
 * `roomSettingsPhase.test.ts` 直接呼叫 `phaseConfigFromSeconds()`、
 * `roundCap.test.ts` 直接 `new MatchController(..., rulesCapped(3))`。
 * **沒有一條走過 `MatchRoom.onCreate`** —— 所以把 `resolvePhaseConfig` 的第二個
 * 參數刪掉、或把 `maxRounds: resolveMaxRounds(...)` 那一行刪掉，整個功能會消失
 * 而上面四份全部是綠的（失敗形態②：算出來了但從沒送到）。這一份守那一段。
 *
 * ⛔ 不抄出貨值：`config.match` 用這個檔自己註冊的夾具，斷言讀的是同一份夾具。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { Configs } from "@ggd/shared/content";
import { registerSkeletonContent } from "@ggd/shared/sim/content/skeleton";
import { TICK_HZ } from "@ggd/shared/constants";
import { ROOM_SETTING_LIMITS, minCombatMaxSecFor } from "@ggd/shared/roomSettings";
import { MatchRoom, type MatchRoomOptions } from "./MatchRoom";
import { Whitelist } from "../curation/whitelist";
import { sharedCombatEnvCache } from "../config/combatEnv";

/**
 * 夾具：出貨值一個都沒抄，斷言全部指回這裡。
 *
 * ⚠️ `maxRounds` 這一格**必須是非 0 的**。今天出貨值剛好是 0，而
 * `MAX_ROUNDS_UNLIMITED` 也是 0 —— 兩者相等的時候，②「缺席 → 退回出貨值」那條
 * 斷言對「真的讀了 config」與「把缺席當成 0、根本沒讀 config」**都會過**
 * （失敗形態④：斷言方向跟缺陷無關）。實測：把 `onCreate` 的
 * `resolveMaxRounds(roomSettings.settings.maxRounds)` 改成 `... ?? 0`，
 * 夾具寫 0 時整份綠，寫非 0 才紅。
 *
 * 這格一旦壞掉，owner 在後台把「總回合數」設成 8 之後**每一間房都會靜默忽略它**。
 */
const RING = { startSec: 40, shrinkSec: 15, radiusFrom: 30, radiusTo: 4, dps: 5 };
const MATCH = {
  teamCount: 4, teamSize: 3, startingTeamLives: 20, resolutionSec: 5,
  champSelectSec: 20, champSelectSecVsBot: 300, intermissionSec: 25,
  combatMaxSec: 200, maxRounds: 7, fireRing: RING,
};
const MIN_COMBAT = minCombatMaxSecFor(RING); // 推導的下界，不是寫死的數字

interface TestRoom {
  onCreate(o: MatchRoomOptions): Promise<void>;
  ctl: { phase: { cfg: { champSelectTicks: number; intermissionTicks: number; combatMaxTicks: number } }; rules: { maxRounds: number } };
}
function room(): TestRoom {
  const r = new MatchRoom() as unknown as TestRoom & { setSimulationInterval: () => void; onMessage: () => void };
  r.setSimulationInterval = (): void => {};
  r.onMessage = (): void => {};
  registerSkeletonContent();
  Configs.register({ id: "config.match", schema: "config@1", match: MATCH } as never);
  return r;
}
const base: MatchRoomOptions = { matchId: "m-288", seed: 288, whitelist: Whitelist.allowAll(), combatEnv: {} };
const ticks = (sec: number): number => Math.round(sec * TICK_HZ);

afterEach(() => { Configs.clear(); sharedCombatEnvCache().invalidate(); vi.restoreAllMocks(); });

describe("MatchRoom.onCreate — 開房四格的接縫 (room-settings-seam)", () => {
  it("房主的四格真的到了這一場：三個時間進 PhaseConfig，回合上限進 ArenaRules", async () => {
    const r = room();
    await r.onCreate({ ...base, matchId: "m-288a", champSelectSec: 33, intermissionSec: 44, combatMaxSec: MIN_COMBAT + 7, maxRounds: 3 });
    expect(r.ctl.phase.cfg.champSelectTicks).toBe(ticks(33));
    expect(r.ctl.phase.cfg.intermissionTicks).toBe(ticks(44));
    expect(r.ctl.phase.cfg.combatMaxTicks).toBe(ticks(MIN_COMBAT + 7));
    expect(r.ctl.rules.maxRounds).toBe(3);
  });

  it("四格全缺席 → 退回出貨值，**包含 vs bot 的選角**（缺席 ≠ 重設）", async () => {
    const r = room();
    await r.onCreate({ ...base, matchId: "m-288b" }); // 沒有人類對手 → vs bot 那條分支
    expect(r.ctl.phase.cfg.champSelectTicks).toBe(ticks(MATCH.champSelectSecVsBot));
    expect(r.ctl.phase.cfg.intermissionTicks).toBe(ticks(MATCH.intermissionSec));
    expect(r.ctl.phase.cfg.combatMaxTicks).toBe(ticks(MATCH.combatMaxSec));
    expect(r.ctl.rules.maxRounds).toBe(MATCH.maxRounds);
  });

  it("越界的每回合時間被拒 → 用出貨值，而且 console 指名那一格（不吞掉 rejected）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = room();
    // 火圈收不完的長度：>= 絕對下界所以只有**推導**的下界擋得住它。
    const tooShort = ROOM_SETTING_LIMITS.combatMaxSec.min;
    expect(tooShort).toBeLessThan(MIN_COMBAT); // 否則這條測不到推導那一段
    await r.onCreate({ ...base, matchId: "m-288c", combatMaxSec: tooShort, maxRounds: ROOM_SETTING_LIMITS.maxRounds.max + 1 });
    expect(r.ctl.phase.cfg.combatMaxTicks).toBe(ticks(MATCH.combatMaxSec));
    expect(r.ctl.rules.maxRounds).toBe(MATCH.maxRounds);
    const said = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(said).toContain("combatMaxSec");
    expect(said).toContain("maxRounds");
  });
});
