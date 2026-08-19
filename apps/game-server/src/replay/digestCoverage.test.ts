/**
 * GH#351 / GH#353 的承重守衛。
 *
 * ⛔ 這裡**不驗任何 digest 的數值**（第二守則：守衛驗機制不驗數字）。驗的是一件
 * 機制上的事：**「一格 sim 狀態」與「replay 看得見它」之間有沒有連結。**
 * 手寫的 `mix(...)` 清單本來就沒有這個連結，所以 `itemAcq` 上線四個月沒人發現。
 *
 * 突變驗證（一批一條，挑最承重的那條線）：把 `hostDigest` 裡新加的
 * `m.str(acq ? …)` 那一行拿掉 → 第二條 it **紅**（`itemAcq` 回到 missed 清單）。
 */
import { describe, it, expect, beforeAll } from "vitest";
import { MatchController, type SeatSpec } from "../match/MatchController";
import {
  CHAMPION_DIGEST_EXEMPT,
  SIM_WORLD_DIGEST_EXEMPT,
  SIM_WORLD_DIGEST_GAPS,
  championFieldsMissedByDigests,
  simWorldFieldsReadByDigests,
} from "./digestCoverage";

const CFG = {
  champSelectTicks: 5,
  intermissionTicks: 20,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

let ctl: MatchController;

beforeAll(() => {
  // ⚠️ 必須跑進 combat：普查要求世界裡真的有實體，否則 `SimWorld.digest()` 的
  // 逐實體迴圈一次都不跑，每一張逐實體的表都會被誤判成「沒被讀」。
  ctl = new MatchController("digest-coverage", 4242, allBots(), CFG);
  let guard = 0;
  while (ctl.phase.phase !== "combat" && guard++ < 5000) ctl.tick();
  expect(ctl.phase.phase).toBe("combat");
  expect(ctl.world.transform.size).toBeGreaterThan(0);
});

describe("replay digest 涵蓋率 (GH#351 / GH#353)", () => {
  it("SimWorld 的每一格狀態要嘛被 digest 讀到，要嘛被明確分類", () => {
    const read = simWorldFieldsReadByDigests(ctl);
    const own = Object.keys(ctl.world);

    const unclassified = own.filter(
      (k) => !read.has(k) && !(k in SIM_WORLD_DIGEST_EXEMPT) && !(k in SIM_WORLD_DIGEST_GAPS),
    );
    expect(
      unclassified,
      `這幾格是 sim state、沒進任何 digest、也沒有被分類：${unclassified.join(", ")}\n` +
        `⇒ 折進 digest，或加進 SIM_WORLD_DIGEST_EXEMPT / SIM_WORLD_DIGEST_GAPS 並寫下理由。`,
    ).toEqual([]);

    // 反方向（第〇·五守則：兩個方向都要關）—— 兩張表都不可以過期：
    // 已經被 hash 了卻還掛在豁免表上，或欄位早就被刪掉了。
    const ownSet = new Set(own);
    const stale = [...Object.keys(SIM_WORLD_DIGEST_EXEMPT), ...Object.keys(SIM_WORLD_DIGEST_GAPS)]
      .filter((k) => read.has(k) || !ownSet.has(k))
      .sort();
    expect(stale, `豁免表過期了（已經被 hash，或欄位已不存在）：${stale.join(", ")}`).toEqual([]);
  });

  it("ChampionComp 的每一格換了值，至少一支 digest 會跟著動", () => {
    const missed = championFieldsMissedByDigests(ctl).filter((k) => !(k in CHAMPION_DIGEST_EXEMPT));
    expect(
      missed,
      `這幾格改了值，worldDigest 與 hostDigest **兩支都沒動** —— replay 對它們是瞎的：` +
        `${missed.join(", ")}`,
    ).toEqual([]);
  });
});
