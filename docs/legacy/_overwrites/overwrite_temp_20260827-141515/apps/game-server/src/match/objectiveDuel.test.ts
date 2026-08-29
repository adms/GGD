/**
 * 【戰場任務 mini dota】GH#752 —— 承重守衛。
 *
 * > owner（#20 原引）：「2. mini dota, **拆掉對面塔就會立即輸掉**，生命為 100,000」
 *
 * ⭐ 跑的是**出貨的那條路**：真的 `MatchController` 進場（`enterCombat` 自己
 * 武裝塔）、真的 `world.damageQueue` 排掉一發傷害、真的 `deathSystem` 把它判死、
 * 真的 `checkCombatEnd` 決定那一區的勝負。
 * ⛔ 測試不自己 `world.structure.set` 一座塔（失敗形態⑤：那會量到一個虛構通道）。
 *
 * ⛔ 不斷言任何一個常數（100,000 / 1.25 倍外推都是設定值，第二守則）——
 *    斷言的是**這一格有沒有動、而且動在對的那一邊**。
 *
 * ## 突變（本批唯一的一條，挑最承重的）
 * `MatchController.checkCombatEnd` 裡那一段 `byObjective` 分支拿掉 ⇒
 * 第一條 `it` 紅（塔倒了而那一區照常打）。整個功能就住在那一段。
 */
import { describe, it, expect } from "vitest";
import { cover } from "../../../../packages/shared/testkit/cover";
import { asTeamId, type EntityId } from "@ggd/shared/ids";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";

const CFG = { champSelectTicks: 5, intermissionTicks: 20, combatMaxTicks: 100_000, resolutionTicks: 5 };

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

/**
 * `arenas: []` = 每一張場地都跑（測試用的骨架場地不在出貨的 `["arena.dota"]` 裡）。
 * ⭐ 其餘每一格都**留空**，所以這一份跑的是出貨值 —— ⛔ 測試不抄任何數字。
 */
function toCombat(seed: number, objective: { arenas: string[] } | undefined): MatchController {
  const ctl = new MatchController("obj", seed, allBots(), CFG, undefined, {
    ...DEFAULT_ARENA_RULES,
    ...(objective === undefined ? {} : { objective }),
  });
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  return ctl;
}

/** 這一區、這一隊的那一座塔。 */
function towerOf(ctl: MatchController, zone: number, teamId: number): EntityId | undefined {
  for (const [id, sc] of ctl.world.structure) {
    if (sc.kind === "objective" && sc.zone === zone && sc.teamId === teamId) return id;
  }
  return undefined;
}

/** 一個站在這一區的英雄 —— 傷害要有來源才走得完出貨的那條路。 */
function anyChampIn(ctl: MatchController, zone: number): EntityId {
  for (const seat of ctl.seats.values()) {
    if (seat.entityId !== null && ctl.world.transform.get(seat.entityId)?.zone === zone) {
      return seat.entityId;
    }
  }
  throw new Error("no champion in zone");
}

describe("戰場任務：拆掉對面的塔就立即輸掉 (GH#752)", () => {
  it("塔被打到 0 ⇒ 那一區**當場**判給另一邊（⛔ 不等人數、⛔ 不等時間）", () => {
    cover("objective-duel-decides");
    const ctl = toCombat(1234, { arenas: [] });
    const p = ctl.pairings[0]!;
    const mine = towerOf(ctl, p.zone, p.sideB);
    expect(mine, "進場就該有兩座塔（每一側一座）").toBeDefined();
    expect(towerOf(ctl, p.zone, p.sideA)).toBeDefined();
    expect(ctl.duelWinnerOf(p.zone)).toBeUndefined();

    // 出貨的那條路：排一發傷害 → mitigateStructure → deathSystem → objectiveSystem
    const hp = ctl.world.health.get(mine!)!;
    ctl.world.damageQueue.push({
      source: anyChampIn(ctl, p.zone),
      target: mine!,
      amount: hp.maxHp * 2,
      type: "true",
      crit: false,
      origin: "ability:test",
    });
    ctl.tick();

    expect(ctl.world.health.get(mine!)?.alive, "塔真的倒了").toBe(false);
    // ⬇ 把 checkCombatEnd 的 `byObjective` 那一段拿掉，這一行就紅。
    expect(ctl.duelWinnerOf(p.zone), "拆掉 sideB 的塔 ⇒ sideA 贏").toBe(p.sideA);
    // 而**另一區**一個字都沒被碰到（勝負是逐區的）。
    expect(ctl.duelWinnerOf(ctl.pairings[1]!.zone)).toBeUndefined();
  });

  it("⭐ 反方向：出貨設定下這張場地**一座塔都沒有** —— 量得到「沒有」才算量尺", () => {
    cover("objective-duel-decides");
    // 出貨的 `arenas` 只點名 arena.dota，而測試跑的是骨架場地。
    const ctl = toCombat(4242, undefined);
    const towers = [...ctl.world.structure.values()].filter((sc) => sc.kind === "objective");
    expect(towers, "沒點名的場地不可以長出塔（否則它就不是一個任務了）").toEqual([]);
    // 而中立守護塔那一族**不受影響**（兩條線各自武裝）。
    expect(ctl.world.objectiveRules).toBeNull();
  });
});
