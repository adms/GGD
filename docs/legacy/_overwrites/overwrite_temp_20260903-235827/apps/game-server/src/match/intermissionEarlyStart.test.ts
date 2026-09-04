/**
 * MEASUREMENT SCRATCH — 會被真正的守衛取代。
 */
import { describe, it, expect } from "vitest";
import { asSeatId } from "@ggd/shared/ids";
import { HumanDriver } from "../seat/HumanDriver";
import { MatchController, type SeatSpec } from "./MatchController";

const CFG = {
  champSelectTicks: 2,
  intermissionTicks: 25 * 30, // 出貨的 25 秒，用來量「按了 Ready 之後還要等多久」
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

/** 練習/離線的形狀：建構時 12 席全是 bot，人是「之後」接管座位 0。 */
const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function toIntermission(specs: SeatSpec[]): MatchController {
  const ctl = new MatchController("im", 4242, specs, CFG);
  let guard = 0;
  while (ctl.phase.phase !== "intermission" && guard++ < 50_000) ctl.tick();
  return ctl;
}

describe("MEASURE", () => {
  it("1 真人 + 11 bot：按 Ready 之後還要幾個 tick 才進戰鬥？", () => {
    const ctl = toIntermission(allBots());
    const seat = ctl.seats.get(asSeatId(0))!;
    seat.humanSeat = true;
    const drv = new HumanDriver();
    seat.setDriver(drv);
    ctl.tick(); // 讓 driver swap 落地
    drv.mailbox.push({ seq: 1, commands: [{ kind: "ready" }] });

    const t0 = ctl.world.tick;
    let guard = 0;
    let last = "";
    while (ctl.phase.phase === "intermission" && guard++ < 50_000) {
      ctl.tick();
      const notReady = [...ctl.seats.values()]
        .filter((s) => s.entityId !== null && !s.ready)
        .map((s) => `${s.seatId}${s.humanSeat ? "H" : "b"}`);
      const offerOwners = [...ctl.offers.values()].map((o) => {
        const s = ctl.seats.get(o.seatId);
        return `${o.seatId}${s?.humanSeat ? "H" : "b"}/${s?.driverKind}`;
      });
      const line = `notReady=[${notReady}] offers=[${offerOwners}]`;
      if (line !== last) {
        console.log(`[t+${ctl.world.tick - t0}] ${line}`);
        last = line;
      }
    }
    console.log(
      `[MEASURE] phase=${ctl.phase.phase} waitedTicks=${ctl.world.tick - t0} ` +
        `(~${((ctl.world.tick - t0) / 30).toFixed(1)}s) budget=${CFG.intermissionTicks}`,
    );
    expect(ctl.phase.phase).toBe("combat");
  });

  it("全 bot 沙盒（0 真人）今天會不會早退？", () => {
    const ctl = toIntermission(allBots());
    const t0 = ctl.world.tick;
    let guard = 0;
    while (ctl.phase.phase === "intermission" && guard++ < 50_000) ctl.tick();
    const waited = ctl.world.tick - t0;
    console.log(
      `[MEASURE all-bot] waitedTicks=${waited} (~${(waited / 30).toFixed(1)}s) ` +
        `budget=${CFG.intermissionTicks} → ${waited < CFG.intermissionTicks ? "早退了" : "等滿倒數"}`,
    );
    expect(ctl.phase.phase).toBe("combat");
  });
});

describe("MEASURE 2", () => {
  it("真人**選掉自己的卡**再按 Ready —— 還要等嗎？", () => {
    const ctl = toIntermission(allBots());
    const seat = ctl.seats.get(asSeatId(0))!;
    seat.humanSeat = true;
    const drv = new HumanDriver();
    seat.setDriver(drv);
    ctl.tick();
    const mine = [...ctl.offers.values()].find((o) => o.seatId === seat.seatId)!;
    drv.mailbox.push({
      seq: 1,
      commands: [{ kind: "pickOffer", offerId: mine.offerId, choiceIndex: 0 } as never, { kind: "ready" }],
    });
    const t0 = ctl.world.tick;
    let guard = 0;
    while (ctl.phase.phase === "intermission" && guard++ < 50_000) ctl.tick();
    console.log(
      `[MEASURE pick+ready] waited=${ctl.world.tick - t0} ticks (~${((ctl.world.tick - t0) / 30).toFixed(1)}s) ` +
        `budget=${CFG.intermissionTicks}`,
    );
    expect(ctl.phase.phase).toBe("combat");
  });
});
