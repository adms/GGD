/**
 * MEASUREMENT SCRATCH — 會被真正的守衛取代。
 */
import { describe, it, expect } from "vitest";
import { asSeatId } from "@ggd/shared/ids";
import { HumanDriver } from "../seat/HumanDriver";
import { MatchController, type SeatSpec } from "./MatchController";

const CFG = {
  champSelectTicks: 2,
  intermissionTicks: 25 * 30,
  combatMaxTicks: 100_000,
  resolutionTicks: 5,
};

const allBots = (): SeatSpec[] =>
  Array.from({ length: 12 }, (_, i) => ({ seatId: i, teamId: Math.floor(i / 3), isBot: true }));

function toIntermission(specs: SeatSpec[]): MatchController {
  const ctl = new MatchController("im", 4242, specs, CFG);
  let guard = 0;
  while (ctl.phase.phase !== "intermission" && guard++ < 50_000) ctl.tick();
  return ctl;
}

function runInstrumented(ctl: MatchController, label: string): number {
  const t0 = ctl.world.tick;
  let guard = 0;
  let last = "";
  while (ctl.phase.phase === "intermission" && guard++ < 50_000) {
    ctl.tick();
    const notReady = [...ctl.seats.values()]
      .filter((s) => s.entityId !== null && !s.ready)
      .map((s) => `${s.seatId}${s.humanSeat ? "H" : "b"}`);
    const offers = [...ctl.offers.values()].map((o) => {
      const s = ctl.seats.get(o.seatId);
      return `${o.seatId}${s?.humanSeat ? "H" : "b"}/${s?.driverKind}/${o.kind ?? "?"}`;
    });
    const line = `notReady=[${notReady}] offers=[${offers}]`;
    if (line !== last) {
      console.log(`[${label} t+${ctl.world.tick - t0}] ${line}`);
      last = line;
    }
  }
  const waited = ctl.world.tick - t0;
  console.log(`[${label} DONE] waited=${waited} (~${(waited / 30).toFixed(1)}s) budget=${CFG.intermissionTicks}`);
  return waited;
}

function takeOverSeat0(ctl: MatchController): { seat: ReturnType<MatchController["seats"]["get"]>; drv: HumanDriver } {
  const seat = ctl.seats.get(asSeatId(0))!;
  seat.humanSeat = true;
  const drv = new HumanDriver();
  seat.setDriver(drv);
  ctl.tick();
  return { seat, drv };
}

describe("MEASURE", () => {
  it("A 只按 Ready", () => {
    const ctl = toIntermission(allBots());
    const { drv } = takeOverSeat0(ctl);
    drv.mailbox.push({ seq: 1, commands: [{ kind: "ready" }] });
    expect(runInstrumented(ctl, "A")).toBeGreaterThan(0);
  });

  it("B 選掉卡 + Ready", () => {
    const ctl = toIntermission(allBots());
    const { seat, drv } = takeOverSeat0(ctl);
    const mine = [...ctl.offers.values()].filter((o) => o.seatId === seat!.seatId);
    console.log(`[B] 我的 offer 數=${mine.length} ids=${mine.map((o) => o.offerId)}`);
    drv.mailbox.push({
      seq: 1,
      commands: [...mine.map((o) => ({ kind: "pickOffer" as const, offerId: `${o.offerId}#0` })), { kind: "ready" }],
    });
    expect(runInstrumented(ctl, "B")).toBeGreaterThan(0);
  });

  it("C 全 bot 沙盒", () => {
    const ctl = toIntermission(allBots());
    expect(runInstrumented(ctl, "C")).toBeGreaterThan(0);
  });
});
