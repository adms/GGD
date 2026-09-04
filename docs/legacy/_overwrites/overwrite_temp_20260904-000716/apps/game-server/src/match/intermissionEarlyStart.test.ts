/**
 * MEASUREMENT SCRATCH — 會被真正的守衛取代。
 */
import { describe, it, expect } from "vitest";
import { asSeatId } from "@ggd/shared/ids";
import { HumanDriver } from "../seat/HumanDriver";
import { MatchController, type SeatSpec } from "./MatchController";
import { DEFAULT_ARENA_RULES } from "./arenaRules";
import { DEFAULT_PRACTICE_RULES } from "@ggd/shared/content";

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
    const mine = [...ctl.offers.entries()].filter(([, o]) => o.seatId === seat!.seatId).map(([id]) => id);
    console.log(`[B] 我的 offer 數=${mine.length} ids=${mine}`);
    drv.mailbox.push({
      seq: 1,
      commands: [...mine.map((id) => ({ kind: "pickOffer" as const, offerId: `${id}#0` })), { kind: "ready" }],
    });
    expect(runInstrumented(ctl, "B")).toBeGreaterThan(0);
  });

  it("C 全 bot 沙盒", () => {
    const ctl = toIntermission(allBots());
    expect(runInstrumented(ctl, "C")).toBeGreaterThan(0);
  });
});

describe("MEASURE 3 —— 選角那一段（#847）在練習形狀下今天還好嗎", () => {
  it("D 選角：接管座位 0 → 鎖定英雄 → 幾 tick 進商店？", () => {
    const LONG = { ...CFG, champSelectTicks: 120 * 30 };
    const ctl = new MatchController("cs", 99, allBots(), LONG);
    ctl.tick();
    const seat = ctl.seats.get(asSeatId(0))!;
    seat.humanSeat = true;
    seat.setDriver(new HumanDriver());
    const pool = ctl.randomChampionPool();
    const res = ctl.lockSeatChampion(seat.seatId, pool[0] as string);
    console.log(`[D] lock=${JSON.stringify(res)} pool=${pool.length}`);
    const t0 = ctl.world.tick;
    let guard = 0;
    while (ctl.phase.phase === "champSelect" && guard++ < 50_000) ctl.tick();
    console.log(
      `[D DONE] phase=${ctl.phase.phase} waited=${ctl.world.tick - t0} ticks ` +
        `(~${((ctl.world.tick - t0) / 30).toFixed(1)}s) budget=${LONG.champSelectTicks}`,
    );
    expect(ctl.phase.phase).not.toBe("champSelect");
  });
});

describe("MEASURE 4 —— bot 到底靠什麼 ready", () => {
  it("E botShop.buyWeapons=false（後台可調的一格）⇒ bot 還會 ready 嗎？", () => {
    const rules = { ...DEFAULT_ARENA_RULES, botShop: { ...DEFAULT_ARENA_RULES.botShop, buyWeapons: false } };
    const ctl = new MatchController("e", 4242, allBots(), CFG, undefined as never, rules);
    let g = 0;
    while (ctl.phase.phase !== "intermission" && g++ < 50_000) ctl.tick();
    const seat = ctl.seats.get(asSeatId(0))!;
    seat.humanSeat = true;
    const drv = new HumanDriver();
    seat.setDriver(drv);
    ctl.tick();
    const mine = [...ctl.offers.entries()].filter(([, o]) => o.seatId === seat.seatId).map(([id]) => id);
    drv.mailbox.push({
      seq: 1,
      commands: [...mine.map((id) => ({ kind: "pickOffer" as const, offerId: `${id}#0` })), { kind: "ready" }],
    });
    const waited = runInstrumented(ctl, "E");
    console.log(`[E] buyWeapons=false ⇒ waited ${waited} ticks`);
    expect(waited).toBeGreaterThan(0);
  });
});

describe("MEASURE 5 —— 真正的練習房形狀", () => {
  it("F 練習房：3 個靶子拿 DummyDriver（永不 ready）⇒ 早退還打得開嗎？", () => {
    const ctl = new MatchController("prac", 7, allBots(), CFG);
    ctl.practice = { ...DEFAULT_PRACTICE_RULES };
    ctl.tick();
    const seat = ctl.seats.get(asSeatId(0))!;
    seat.humanSeat = true;
    const drv = new HumanDriver();
    seat.setDriver(drv);
    let g = 0;
    while (ctl.phase.phase !== "intermission" && g++ < 50_000) ctl.tick();
    ctl.tick();
    const spawned = [...ctl.seats.values()].filter((s) => s.entityId !== null);
    console.log(
      `[F] 生出來的座位=${spawned.map((s) => `${s.seatId}/${s.driverKind}${s.humanSeat ? "H" : ""}`)}`,
    );
    const mine = [...ctl.offers.entries()].filter(([, o]) => o.seatId === seat.seatId).map(([id]) => id);
    drv.mailbox.push({
      seq: 1,
      commands: [...mine.map((id) => ({ kind: "pickOffer" as const, offerId: `${id}#0` })), { kind: "ready" }],
    });
    const waited = runInstrumented(ctl, "F");
    console.log(`[F] 練習房按 Ready 之後等了 ${waited} ticks (~${(waited / 30).toFixed(1)}s)`);
    expect(waited).toBeGreaterThan(0);
  });
});
